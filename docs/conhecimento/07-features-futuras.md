# Features futuras — especificação pronta para implementação

> **Estado: PLANEADO.** Nada disto está implementado hoje. A demo atual é simulada em memória;
> cada feature abaixo declara o **sinal real de origem** no DeepSeek Harness (DSH) que a vai alimentar
> quando fizermos a integração. Este documento existe para que, no dia em que construirmos, as decisões
> já estejam tomadas e as armadilhas já estejam registadas.
>
> Origem do pedido: utilizador, 2026-09-27. **Factos DSH verificados no checkout local nessa data**
> (`deepseek-harness`, versão declarada `0.1.6-alpha.2`), com arquivo:linha; os documentos de análise
> fornecidos não contêm este vocabulário de eventos — o checkout é a fonte única.

---

## Mapa das cinco features

| # | Feature | Sinal principal de origem | Na sala |
|---|---|---|---|
| 1 | O agente pode fazer perguntas | `user-questions/request` (**waterfall/runtime**) + `approval/request` | balão persistente ❓ + estado "Aguardando" |
| 2 | Sinalizar quando termina | `turn/end` (`reason.kind`), `agent/status`, `subagent/end` | ✅ + estado "Concluído" + resultado acessível |
| 3 | Emojis para transmitir informação | derivado do estado observado | emoji compacto sobre a cabeça, com rótulo |
| 4 | Modelos diferentes mudam a capacidade | `request/header` + `request/context` → `contextWindow` | chip de modelo + barra CTX recalculada |
| 5 | Custo em tempo real | `tokenUsage` (4 buckets) × tabela de preços nossa | chip de custo por pessoa e por mesa |

---

## 1. O agente pode fazer perguntas

**O que é:** o agente pode interromper o trabalho para perguntar algo ao humano e fica à espera da resposta.

**Sinal de origem (DSH), verificado:**

- `user-questions/request` é um evento Cordis em **waterfall**, em runtime (`packages/interaction/user-questions/src/types.ts:88-93`). **Não entra no log durável** — não está em `KNOWN_SESSION_EVENT_TYPES`. Consequência de design: **o histórico de perguntas não é reconstruível pela sessão**; a UI tem de as capturar ao vivo e persisti-las no plugin se quisermos histórico.
- Payload `AskUserQuestionRequestEvent` = `{questions: AskUserQuestionItem[], agent?, signal?}`. Cada item tem `id` (**fornecido pelo chamador**, ecoado na resposta), `question`, `detail?`, `header?`, `options?: {label, description?}[]`, `multiSelect?`, `intent?` (ex.: `plan-review` com rótulo de aprovação; nesse caso `detail` é obrigatório).
- **Resposta** = devolver `{answers: [{id, selected: string[], custom?}]}` no waterfall. **Não existe evento de resposta nem evento de timeout**; cancelamento só via `AbortSignal` → erro `ASK_ABORTED`.
- Erros relevantes: `EMPTY_QUESTIONS`, `BAD_INTENT`, `NO_PROVIDER`, `CALLER_NOT_LIVE`, **`DELEGATED_CALLER` — um filho "owned" (delegado) não pode fazer perguntas**. Logo: **na sala, subagentes não perguntam**; só agentes raiz.

**Aprovações são uma coisa diferente:** `approval/request` (waterfall/runtime) traz `{agent, toolName, callId?, reason?, signal?}`; o outcome é vocabulário fechado `allowed-once | rejected | cancelled | unavailable`. O par durável `approval/asked` / `approval/decided` (com `ApprovalRequestId`) fica no log apenas para auditoria, e `approval/policy` (`ask|never`, `source:'delegation'`) mostra overrides.

**Comportamento na sala:**

- Estado **Aguardando resposta** (❓) ou **Precisa de aprovação** (⚖️); expressão `waiting`/`approval`.
- **Balão persistente.** Ao contrário dos outputs (que expiram em ~1s), a pergunta fica até ser respondida ou cancelada. Uma pergunta nova substitui a ativa; as anteriores ficam no painel.
- Clique abre a aba **Pergunta**: texto, `detail`, opções (`multiSelect` quando existir) e ações explícitas. Aprovação mostra `toolName`, `callId` e `reason` — o que vai ser executado.
- Contador global discreto ("2 a aguardar de ti"), porque perguntas podem estar fora do viewport.

**Regras:**

1. Nenhuma resposta é enviada sem ação explícita (o `id` do chamador é ecoado na resposta; nada de responder por clique no avatar).
2. Timeout não responde nem dispensa — só muda o rótulo para "à espera há X". Cancelamento é ação do utilizador (`cancelled`).
3. Pergunta (texto livre/opções) e aprovação (decisão fechada de ferramenta) nunca partilham o mesmo fluxo.
4. Fila de várias perguntas vive no plugin (o runtime entrega-as em waterfall); se o agente for filho delegado, mostrar "pergunta indisponível para subagentes" em vez de a inventar.

---

## 2. Sinalizar quando o agente termina

**O que é:** quando o agente acaba uma tarefa, isso tem de ser **visível e inequívoco** — não deduzido.

**Sinal de origem (DSH), verificado:**

- `turn/end` traz `{turn, reason: TurnEndReason}`; `reason.kind` ∈ `completed | aborted{reason} | blocked | error | max-tokens | interrupted` (`packages/core/session/src/types.ts:200-221`). Causas de cancelamento: `user | parent | hook | disposed | legacy`.
- `agent/status` tem **apenas** `idle | running` (`packages/core/agent/src/runtime-types.ts:109`) — não há "error"/"done" nesse sinal. `agent/error` e `agent/disposed` são eventos próprios; **não existe evento de fim de sessão**.
- `subagent/start|end` é pareado por `runId`; `subagent/end` traz `stopReason` ∈ `completed | aborted | error | max-tokens | refusal` e `lastAssistantMessage?`.
- **Fim de streaming ≠ fim de turno:** `agent/assistant-stream` é transitório (o frame `end` tem `outcome: committed | abandoned`); o durável é `turn/end`. `assistant/message` pode trazer `interrupted: true` (prefixo entregue num cancelamento).

**Comportamento na sala:** ✅ + **Concluído** + expressão `success` quando `reason.kind === 'completed'`; animação curta discreta; badge "resultado pronto"; som opcional. Mapear os restantes `kind` para ⏹️ interrompido, ⚠️ erro, 🚫 bloqueado, ⛔ máx. tokens.

**Regras:**

1. Conclusão só por `turn/end` com `completed`. Silêncio, inatividade ou timeout **nunca** contam como feito.
2. `agent/status: idle` é só "sem driver ativo" — pode acordar com inbox pendente. Mostrar "à espera" e não "concluído".
3. Um agente ocioso com descendentes ativos mostra "à espera da equipe"; turno com fila pendente mostra "na fila".
4. Filho continuável: fim de ativação (`subagent/end`) ≠ fim de sessão; identidade persiste para retomada.

---

## 3. Emojis para transmitir informações

**O que é:** um vocabulário visual compacto, por pessoa, que comunica o que está a acontecer sem abrir painéis.

| Emoji | Significado | Sinal de origem verificado |
|---|---|---|
| ❓ | Faz uma pergunta | `user-questions/request` (runtime) |
| ⚖️ | Precisa de aprovação | `approval/request` (+ par `approval/asked`) |
| 🔧 | A usar uma ferramenta | `tool/call` |
| 📝 | A escrever/editar | `assistant/message` / atividade |
| 🔍 | A ler/pesquisar | `tool/call` de leitura |
| ⏳ | Na fila | `agent/inbox/inserted` sem turno em curso |
| 🤝 | A coordenar subagentes | `subagent/start` |
| 🔄 | Retentativa | `llm/retry` / `llm/retry-started` |
| 📦 | A compactar contexto | `compaction/start` |
| ✅ | Concluído | `turn/end` com `completed` |
| ⏹️ | Interrompido | `turn/end` com `aborted` |
| 🚫 | Bloqueado / máx. tokens | `turn/end` com `blocked` / `max-tokens` |
| ⚠️ | Erro | `turn/end` com `error`, `agent/error`, `tool/result` |
| 💤 | Ocioso | `agent/status: idle` sem fila |

**Regras:**

1. Emoji é canal **secundário**: sempre com rótulo/tooltip e `aria-label`. Cor ou emoji nunca são o único sinal.
2. **Só o emoji mais relevante fica visível** (precedência: ❓/⚖️ > ⚠️ > 🔧/📝/🔍 > 🔄/📦/⏳ > ✅ > 💤). Os restantes ficam no painel.
3. Preferência do utilizador para desligar emojis e usar apenas ícones/etiquetas.
4. Emoji e expressão Avataaars mudam em conjunto e nunca se contradizem.

---

## 4. Modelos diferentes mudam o cálculo de capacidade

**O que é:** cada pessoa pode correr um modelo diferente — logo, uma janela de contexto, limites e preço diferentes.

**Sinal de origem (DSH), verificado:**

- **Identidade do modelo:** `request/header` traz `EpochHeader.config: LlmCallConfig {provider, model, reasoningEffort?, temperature?, maxTokens?, stop?}` (`core/session/src/types.ts:232-239`). `reason: RequestHeaderReason` ∈ `initial | resume | change | series` — `change` marca troca de rota.
- **Capacidade:** `request/context` traz `{provider, model, contextWindow?, systemPromptUpdate?}` e é logado **só quando rota/capacidade/modo mudam**; `contextPressure.contextWindow` é "a capacidade da rota mais recente registada" (`packages/llm/token-meter/src/projection.ts:46-47`), anunciada pelos adaptadores.
- **Intenção de seleção:** projeção `modelSelection {lastUsed, next}` (`packages/api/session-controller/src/model-selection-projection.ts`) — `pending` só vira `lastUsed` quando um `request/header` o consome.
- **Limites:** `reasoningEffort` é por **rota exata** (adaptador anuncia os efforts suportados); `maxTokens`/`contextWindow` por modelo. Atenção: **`maxActiveSubagents` é configuração global (default 8), não por modelo**, e as capacidades de subagente (`toolFilter`, `persona`, `depthLimit`) são **por provider**.

**Comportamento:**

- Ficha ganha um **chip de modelo** (ex.: `deepseek-chat` / `sonnet`) e a barra CTX usa a janela **daquele** modelo, não uma constante global.
- Trocar de modelo recalcula a percentagem e mostra nota discreta: capacidade nova pode parear com pressão antiga até o próximo pedido reportar uso (os campos são *last-wins* independentes — trade-off intencional do DSH).
- Sem capacidade conhecida → **CTX —**, nunca estimativa inventada.

**Regras:**

1. Comparar "quem tem mais contexto" entre modelos diferentes é só indicativo.
2. `projectedTokens` é o numerador preferido; `pressureTokens` é fallback; `tokenUsage` (acumulado) nunca é ocupação.
3. Guardar `{provider, model, contextWindow, reasoningEffort, updatedAt}` por sessão, atualizado por `request/header`/`request/context`.
4. Trocar de modelo não zera histórico de custo — cada período cobra pelo preço do modelo da altura.

---

## 5. Custo em tempo real

**O que é:** saber, a cada momento, quanto cada pessoa e cada mesa estão a custar.

**Sinal de origem (DSH), verificado:**

- `TokenUsage` por chamada = `{inputTokens, outputTokens, totalTokens?, cacheReadTokens?, cacheWriteTokens?, reasoningTokens?}` (`packages/llm/llm/src/types.ts:152-176`); `inputTokens` é **só o não-cacheado** e `reasoningTokens` é **subconjunto de `outputTokens`** (não somar à parte).
- Projeção `tokenUsage` = acumulado `{uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}`; **não publica deltas**. Existe o helper `deriveTurnTokenUsage` → `TurnTokenUsage` por turno, com `routes?: {provider,model}[]` — útil para repartir custo por modelo.
- Atualização: cada `assistant/message|attempt` com usage; `llm/retry-started` fecha o slot para a tentativa repetida **somar** em vez de substituir.
- **Não há preços no DSH** [ausência confirmada]: "pricing" no código é estimativa de tokens. A tabela de preços é nossa.

**Cálculo proposto:**

```text
custo(sessão) = ΔuncachedInput × preço.input
              + Δoutput        × preço.output
              + ΔcacheRead     × preço.cacheRead
              + ΔcacheWrite    × preço.cacheWrite
```

- Deltas a partir de *snapshots* periódicos das projeções, nunca por token.
- Tabela de preços **versionada por modelo** `{modelId → input/output/cacheRead/cacheWrite, moeda, validoDe, validoAté}`; moeda base USD.
- UI: chip `US$ 0,12` na ficha · `último turno: US$ 0,03` no painel · total por mesa · etiqueta **estimado**.

**Armadilhas verificadas:**

1. **Dupla contagem em forks:** existe `Session.inheritedEventCount` / `isOwnSeq(seq)` / `session/end-seed {inherited}` (`core/session/src/index.ts:467,674`). **A projeção `tokenUsage` não filtra o prefixo herdado** — quem agrega pai+filhos tem de contar só `seq >= inheritedEventCount`. Decisão de implementação nossa.
2. **Retentativas e compactação gastam** — `llm/retry*` e `compaction/*` (com `shadowedTokenCount` em prune) devem aparecer no custo com nota.
3. Custo acumulado ≠ ocupação de contexto. São indicadores diferentes, em sítios diferentes.
4. Sem preço conhecido para um modelo → "custo indisponível", nunca zero.

**Dados novos:** snapshots `{sessionId, provider, model, buckets, observadoEm}` + tabela de preços + agregações por mesa/time (com filtro de herança).

---

## Regras transversais

1. **Sinal real primeiro.** Toda a feature é apresentação de eventos reais; nada é inferido por silêncio ou tempo decorrido.
2. **Estado sempre legível:** emoji + rótulo + cor (nesta ordem de importância).
3. **Simulado ≠ real:** enquanto não houver integração, cada indicador mantém a etiqueta "simulado"; ao ligar ao DSH, a etiqueta passa à origem real.
4. **Privacidade:** balões e painéis mostram o que o DSH expõe ao utilizador — nunca "pensamentos privados"; custo mostra números, não conteúdo.
5. **Acessibilidade:** emojis com `aria-label`; perguntas navegáveis por teclado; som sempre opcional.
6. **Waterfall ≠ log:** perguntas e `approval/request` vivem em runtime; a UI tem de capturá-los ao vivo (e decidir o que persistir) porque a sessão não os reproduz.

## Matriz de implementação (quando chegarmos aí)

| Feature | Dados novos | UI nova | Dependência crítica | Estado |
|---|---|---|---|---|
| Perguntas | fila de questões + estados (persistida no plugin) | balão persistente, aba Pergunta, contador | handler de `user-questions/request` (waterfall); filhos não perguntam | planeado |
| Fim de turno | `reason.kind` por turno | estados ✅/⏹️/🚫/⚠️, animação, badge | distinguir `turn/end` de fim de streaming | planeado |
| Emojis | tabela estado→emoji | glifo por pessoa + tooltip | tabela de precedência | planeado |
| Modelo/capacidade | `{provider, model, contextWindow, effort}` | chip de modelo, CTX por janela | `request/header` + `request/context` | planeado |
| Custo | snapshots + tabela de preços | chips de custo | tabela versionada + filtro `seq >= inheritedEventCount` | planeado |

## Fontes verificadas (2026-09-27)

`packages/interaction/user-questions/src/types.ts` · `packages/interaction/user-approval/src/types.ts` ·
`packages/core/session/src/types.ts` (turn/end, request/header, request/context) ·
`packages/core/agent/src/runtime-types.ts` (agent/status, inbox, assistant-stream) ·
`packages/llm/token-meter/src/projection.ts` e `turn-usage.ts` · `packages/llm/llm/src/types.ts` (TokenUsage) ·
`packages/subagent/subagent/src/types.ts` (subagent/start|end, descriptor) ·
`packages/core/session/src/index.ts` (inheritedEventCount, isOwnSeq).
