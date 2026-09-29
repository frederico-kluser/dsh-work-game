# Integração com o DeepSeek Harness (DSH)

> **Estado (2026-09-28): lado CLIENTE ligado.** A ponte do browser
> (`dsh-plugin/src/surface.js`, embutida em `client.js`) consome as superfícies REAIS
> `ctx.sessions.list` (catálogo + `projectionValues`) e `ctx.get('workspaces').list`
> (workspaces, pertença e arquivadas): a sala mostra uma mesa por workspace do DSH, as
> conversas visíveis (mesma regra da barra lateral), running/idle, modelo, contexto,
> custo estimado, velocidade de tokens e a delegação em curso (subagentes a correr), com
> as ações Abrir conversa / Nova sessão da API pública `uiWorkspace` — sem inventar nada
> (ver §7 de `docs/contratos-plugin.md`). Instalar por `link:` (a instalação `file:` é uma
> cópia congelada que o DSH continua a servir). **Mensagens já ligadas**: o primeiro sinal
> de fio em tempo real no browser é `user/message` / `assistant/message` → `message`, que
> troca a cara da pessoa a cada mensagem (vigia de `client.js`: `retain` + `eventSource`
> enquanto a conversa corre, libertada ao parar — ver §7 de `docs/contratos-plugin.md`).
> Continua por ligar: os restantes eventos de fio em tempo real (turn/end, tool/*,
> user-questions, approval/*) via `retain` + `eventSource`, para os quais `src/adapter.js`
> (lado host) mantém o mapeamento verificado abaixo. Factos DSH verificados no checkout local
> (`deepseek-harness`, `0.1.6-alpha.2`), arquivo:linha em `docs/conhecimento/07-features-futuras.md`;
> vocabulário e contratos em `docs/contratos-plugin.md`.

## 1. Visão geral

O plugin liga-se ao DSH por **um único ponto**: `dsh-plugin/src/adapter.js`. Ele subscreve os
eventos Cordis e projeções reais e converte tudo em **eventos normalizados** `{type, ...}`
(contrato da secção 1 de `docs/contratos-plugin.md`). `state.js` nunca vê o DSH — é lógica pura
que aplica eventos normalizados; `client.js` renderiza o resultado. Consequência: se o DSH mudar
de API, só o adaptador muda.

```
DSH (Cordis) ──► adapter.js ──► eventos normalizados ──► state.js (puro) ──► client.js (UI)
                    ▲
   projeções ───────┘
```

## 2. O que o plugin consome (eventos e projeções)

| Sinal DSH | Classe | Normalizado emitido |
|---|---|---|
| catálogo de sessões | durável (log da sessão) | `session/added`, `session/removed` |
| `agent/status` (só `idle \| running`) | durável | `status` |
| `turn/end` (`reason.kind`) | durável | `turn/end` com `kind` mapeado |
| `tool/call`, `tool/result` | durável | `tool` (`phase: call\|result`) |
| `user-questions/request` | **waterfall/runtime** | `question` |
| retorno do waterfall (`askUserQuestion`) | runtime | `question/answered` |
| `approval/request` | **waterfall/runtime** | `approval` (ao vivo) |
| `approval/asked` + `approval/decided` | durável (auditoria) | `approval`, `approval/decided` |
| `subagent/start`, `subagent/end` (par por `runId`) | durável | `subagent/start`, `subagent/end` |
| projeção `tokenUsage` + `deriveTurnTokenUsage` | projeção | `usage` (por delta) |
| `request/header` (`EpochHeader.config`) + `request/context` | durável | `model` (com `contextWindow`) |
| `llm/retry-started` | durável | `retry` |
| `compaction/start`, `compaction/end` | durável | `compaction` (`phase`) |
| `user/message`, `assistant/message` | durável (log da sessão) | `message` (`side: user\|assistant`) — a cara troca a cada uma |

## 3. Runtime (waterfall) vs log durável — e o que isso obriga

- `user-questions/request` e `approval/request` são eventos Cordis em **waterfall**, só em
  runtime: **não entram no log durável** (não estão em `KNOWN_SESSION_EVENT_TYPES`).
  O adaptador tem de os capturar **ao vivo**; se quisermos histórico, a fila de perguntas vive
  no plugin (a sessão não as reproduz).
- Não existe evento de resposta nem de timeout para perguntas: responder é devolver
  `{answers:[{id, selected, custom?}]}` no waterfall (o `id` é do chamador e é ecoado);
  cancelamento só via `AbortSignal` → erro `ASK_ABORTED`.
- Aprovações têm par durável (`approval/asked` / `approval/decided`, por `ApprovalRequestId`)
  só para **auditoria**; a decisão ao vivo vem do waterfall com vocabulário fechado
  `allowed-once | rejected | cancelled | unavailable`. `approval/policy` (`ask|never`) mostra
  overrides — um `ask` de delegação é motivo para ⚖️ na sala.
- Pergunta é **persistente** na UI até ser respondida/cancelada (outputs expiram em ~1s);
  uma pergunta nova substitui a ativa, as anteriores ficam no painel; contador global de
  "a aguardar de ti".

## 4. Decisões de arquitetura

1. **Fronteira adapter/state.** `state.js` só recebe eventos normalizados; nada de imports do
   DSH fora de `adapter.js`. O contrato de eventos é o único acoplamento (testável com
   `node --test`, sem DSH).
2. **Custo por deltas, preços nossos.** A projeção `tokenUsage` é **acumulada** e não publica
   deltas → o adaptador guarda um snapshot por sessão e emite `usage` por diferença
   (`ΔuncachedInput × preço.input + Δoutput + ΔcacheRead + ΔcacheWrite`). O DSH **não tem preços**
   ("pricing" no código é estimativa de tokens) — a tabela versionada por modelo é do plugin
   (`state.setPrices(map)`). Sem preço → custo `null` ("custo indisponível"), nunca zero.
3. **Anti dupla contagem em forks.** Ao agregar pai+filhos, a projeção `tokenUsage` **não filtra
   o prefixo herdado** → quem agrega conta só `seq >= inheritedEventCount` quando o evento
   trouxer o campo. É decisão de implementação nossa; sem o filtro, forks duplicam custo.
4. **Conclusão só por `turn/end` `completed`.** `agent/status` é apenas `idle|running` — nunca
   "done" nem "error"; `idle` é "à espera" (pode acordar com inbox pendente). Fim de streaming
   (`agent/assistant-stream`, frame `end` com `outcome`) ≠ fim de turno: o durável é `turn/end`.
5. **Retentativas e compactação gastam.** `llm/retry-started` fecha o slot para a tentativa
   repetida **somar** (não substituir); `compaction/*` com `shadowedTokenCount` aparece no custo
   com nota. Custo acumulado ≠ ocupação de contexto — indicadores separados.
6. **CTX honesto.** `used = projectedTokens ?? pressureTokens`; `window = contextWindow` da rota
   mais recente registada; sem ambos → `null` → UI mostra `CTX —`, nunca estimativa inventada.
7. **Modelo.** Identidade vem de `request/header` (`EpochHeader.config`) e `request/context`
   (logado só quando rota/capacidade/modo mudam); `reason: 'change'` marca troca de rota;
   `modelSelection {lastUsed, next}` só vira `lastUsed` quando um `request/header` o consome.
   Trocar de modelo não zera histórico de custo.
8. **Emoji por precedência.** ❓/⚖️ > ⚠️ > 🔧/📝/🔍 > 🔄/📦/⏳ > ✅ > 💤; canal secundário
   (sempre com rótulo/`aria-label`); emoji e expressão Avataaars mudam em conjunto.
9. **Telemetria honesta em subagentes.** Evento com `local === false` (sessão sem driver local)
   → "telemetria indisponível" na UI, nunca inventar valores.
10. **Subagentes não perguntam.** Filho "owned"/delegado não pode fazer perguntas
    (`DELEGATED_CALLER` no `user-questions`); a sala mostra "pergunta indisponível para
    subagentes". Resposta exige ação explícita do utilizador (o `id` do chamador é ecoado na
    resposta — nada de responder por clique no avatar).

## 5. O que NÃO é possível (limitações verificadas)

- **Sem evento de fim de sessão**; `agent/status` nunca diz "concluído" — conclusão só se
  deduz de `turn/end` com `reason.kind === 'completed'` (ou `subagent/end` com `stopReason`).
- **Perguntas não reconstruíveis pelo log**: sem persistência durável da pergunta, sem evento
  de resposta e sem evento de timeout — ou o plugin captura ao vivo, ou esse histórico perde-se.
- **Filhos delegados não podem perguntar** (`DELEGATED_CALLER`) — limitação do DSH, não nossa.
- **`tokenUsage` não publica deltas** e **não filtra herança**: deltas e filtro
  `seq >= inheritedEventCount` são trabalho do plugin.
- **Não há preços no DSH**: qualquer número de custo exige a nossa tabela versionada por modelo.
- **Comparar contexto entre modelos diferentes é apenas indicativo**; `maxActiveSubagents` é
  configuração global (default 8), não por modelo; capacidades de subagente (`toolFilter`,
  `persona`, `depthLimit`) são por provider.
- **Fim de streaming ≠ fim de turno**: `assistant/message` com `interrupted: true` é prefixo de
  cancelamento, não resultado.

## 6. Fontes verificadas (2026-09-27)

Checkout DSH `0.1.6-alpha.2`: `packages/interaction/user-questions/src/types.ts` ·
`packages/interaction/user-approval/src/types.ts` · `packages/core/session/src/types.ts`
(turn/end, request/header, request/context) · `packages/core/agent/src/runtime-types.ts`
(agent/status, inbox, assistant-stream) · `packages/llm/token-meter/src/projection.ts` e
`turn-usage.ts` · `packages/llm/llm/src/types.ts` (TokenUsage) ·
`packages/subagent/subagent/src/types.ts` (subagent/start|end, descriptor) ·
`packages/core/session/src/index.ts` (inheritedEventCount, isOwnSeq).
Contrato de eventos e layout de ficheiros: `docs/contratos-plugin.md`.