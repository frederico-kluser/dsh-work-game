# Contratos — plugin DSH + CLI `dwg` (dsh-work-game)

Documento de trabalho para implementação paralela. Cada módulo é independente e testável.
**Estado:** implementação em curso (2026-09-27). Nada disto substitui a API real do DSH:
o adaptador é o único sítio que fala com ela.

## Layout de ficheiros (não criar outros)

```
dsh-plugin/
  package.json          # manifesto do plugin (dsh.client + exports ./client)
  cordis.patch.yml      # camada de ativação do bundle
  src/state.js          # lógica PURA do escritório (sem imports do DSH)
  src/adapter.js        # eventos/projeções DSH → eventos normalizados
  src/client.js         # painel no browser (slots do DSH) que renderiza a sala
  src/render.js         # SVG do escritório (reutiliza assets/furniture.svg)
dwg-cli/
  bin/dwg               # executável Node (#!/usr/bin/env node)
  lib/commands.js       # implementação dos comandos
  lib/log.js            # logger estruturado (ficheiro + stdout, com --json)
scripts/
  macmini-setup.sh      # instala dependências + projeto no macmini (ssh)
  macmini-test.sh       # testes de instalação e execução no macmini
  macmini-logs.sh       # colhe logs do macmini para logs/ local
tests/plugin/*.test.mjs # testes de state/adapter/CLI (node --test)
docs/contratos-plugin.md  # este ficheiro
docs/integracao-dsh.md    # como o plugin liga ao DSH (fontes verificadas)
docs/terminal.md          # manual do dwg (controlo/debug por terminal)
logs/                     # artefatos de execução (gitignored)
```

## 1. Eventos normalizados (contrato entre adapter e state)

O `state.js` nunca vê o DSH: recebe apenas objetos `{type, ...}`:

| type | campos | origem DSH |
|---|---|---|
| `session/added` | `sessionId, workspaceId?, model?` | catálogo de sessões |
| `session/removed` | `sessionId` | catálogo de sessões |
| `status` | `sessionId, status: 'idle'\|'running'` | `agent/status` |
| `turn/end` | `sessionId, kind: 'completed'\|'aborted'\|'blocked'\|'error'\|'max-tokens'\|'interrupted'` | `turn/end.reason.kind` |
| `tool` | `sessionId, phase: 'call'\|'result', name, ok?` | `tool/call`, `tool/result` |
| `question` | `sessionId, id, text, options?, multiSelect?` | `user-questions/request` (runtime!) |
| `question/answered` | `sessionId, id` | retorno do waterfall |
| `approval` | `sessionId, id, toolName, callId?, reason?` | `approval/asked` |
| `approval/decided` | `sessionId, id, outcome` | `approval/decided` |
| `subagent/start` | `sessionId, childId, runId, local` | `subagent/start` |
| `subagent/end` | `sessionId, childId, runId, stopReason` | `subagent/end` |
| `usage` | `sessionId, provider, model, uncachedInput, output, cacheRead, cacheWrite` | `tokenUsage` + `deriveTurnTokenUsage` |
| `model` | `sessionId, provider, model, contextWindow?` | `request/header` + `request/context` |
| `retry` | `sessionId` | `llm/retry-started` |
| `compaction` | `sessionId, phase: 'start'\|'end'` | `compaction/*` |

## 2. `dsh-plugin/src/state.js` — API

```js
export function createOfficeState() -> state
export function applyEvent(state, event) -> state      // puro: devolve NOVO estado
export function personView(state, sessionId) -> view   // apresentação pronta p/ UI
export function officeView(state) -> { people, teams, alerts }
```

`state.people[sessionId] = { id, name, avatar, status, emoji, expression, ctx, model, cost, question, approvals, subagents, outputs[] }`

Regras (verificados no DSH):
- `status` visual só fica `done` com `turn/end` `completed`; `idle` mostra "à espera".
- Pergunta (`question`) é **persistente** até `question/answered`; outputs expiram em ~1s na UI.
- Emoji por precedência: `❓/⚖️ > ⚠️ > 🔧/📝/🔍 > 🔄/📦 > ✅ > 💤` (ver tabela em docs/conhecimento/07-features-futuras.md).
- CTX: `used = projectedTokens ?? pressureTokens`, `window = contextWindow`; sem ambos → `null` (UI mostra `CTX —`).
- Custo: deltas dos 4 buckets × tabela de preços (state aceita `setPrices(map)`); sem preço → `null` ("custo indisponível").
- Agregados pai/filho: **filtrar `seq >= inheritedEventCount`** quando o evento o trouxer (anti-dupla-contagem).
- Expressão Avataaars derivada: idle/working/tool/waiting/success/error (+ override).

## 3. `dsh-plugin/src/adapter.js` — API

```js
export function createAdapter({ onEvent, sessions, projections }) -> adapter
adapter.start()   // subscreve eventos/projeções reais e emite eventos normalizados
adapter.stop()
```

Mapeamento (fonte: fact-check 2026-09-27):
- `user-questions/request` e `approval/request` são **waterfall/runtime** → capturar ao vivo; não reconstruíveis do log.
- `turn/end.reason.kind` → `turn/end.kind` (vocabulário fechado acima).
- `TokenUsage` acumulado → converter em `usage` por delta (guardar snapshot anterior por sessão).
- `request/header` (`EpochHeader.config`) + `request/context` → `model` (com `contextWindow`).
- Sem sessão local (`subagent/*​.local === false`) → mostrar `telemetria indisponível`, nunca inventar.

## 4. `dwg-cli` — comandos (todos com `--json` e saída em `logs/`)

| comando | faz |
|---|---|
| `dwg status` | resumo: sessões/pessoas, estado do plugin, modelo barato ativo |
| `dwg doctor` | portões: node, assets, testes rápidos, config DSH, rota de modelo |
| `dwg logs [--tail N]` | mostra/segue `logs/dwg.log` (JSONL) |
| `dwg test [--unit\|--browser]` | corre a suíte (node --test) e grava relatório |
| `dwg demo [--port N]` | sobe a demo estática e mostra a URL |
| `dwg plugin build\|check` | valida o pacote do plugin (exports, patch, sintaxe) |
| `dwg macmini setup\|test\|logs` | delega nos scripts ssh correspondentes |
| `dwg models` | lista rotas de modelo efetivas e indica a barata recomendada |

Saída: texto humano por omissão, `--json` para máquina. Exit codes: 0 ok · 1 falha · 2 uso inválido · 3 dependência em falta.

## 5. Remoto (ex.: macmini) — **ssh direto, sem subsistema próprio**

Não há scripts nem comandos dedicados ao macmini: trata-se de mais um destino acessível por
`ssh macmini '...'` (acesso já configurado). Padrão de uso:

```bash
ssh macmini 'zsh -l -c "cd /Volumes/Ext2TB/Projects/dsh-work-game && git pull && node --test \"tests/**/*.test.mjs\""'
ssh macmini '<comando>' > logs/macmini-execucao.log 2>&1   # logs sempre em ficheiro
```

- Instalação: `git pull` (ou clone do repo público) + `node -v` — sem `npm install` (o projeto não tem deps).
- Execução: `node --test` no diretório remoto; o exit code propaga-se.
- Logs: redirecionar para `logs/macmini-*.log` local; nunca imprimir segredos.
- A instalação de ferramentas remotas (ex.: Chrome para os testes de browser) faz-se com as
  rotinas normais da máquina (`brew`), não com tooling próprio do projeto.

## 6. Modelo barato para agentes

Rota verificada a funcionar: **`provider: 'openrouter-extra'`, `model: 'deepseek/deepseek-v4-flash-0731'`**
(1.31M contexto · $0.021/M input · $0.32/M output). Registada em `settings.yaml` nas duas
máquinas com `reasoningEfforts` (obrigatório no schema pi-ai).


## 7. `dsh-plugin/src/surface.js` — ponte REAL do runtime do browser (2026-09-28)

Único ponto que lê o DSH no browser. API verificada no checkout `deepseek-harness`
(0.1.6-alpha.2) em `packages/api/session-controller/src/client/contract/sessions.ts`
(`ISessions`) e `client/sessions/service.ts`:

- `ctx.sessions` (ou `ctx.reflect.get('sessions')`) → `ISessions`;
- `.list` é um `ObservableSnapshot<SessionListState>`: `getSnapshot()` + `subscribe(fn)`
  (**não** é `list()` — nome de método verificado no `.d.ts`);
- `SessionListState` = `{ ids, byId: Record<id, SessionSummary>, subagentsByParent }`;
- `SessionSummary` = `{ id, displayTitle, cwd?, parentId?, origin?, running, updatedAt,
  projectionValues? }` com `projectionValues` = `tokenUsage` (acumulado),
  `contextPressure {projectedTokens?, pressureTokens?, contextWindow?}` e
  `modelSelection {lastUsed, next}`;
- `subagentsByParent[parent].entries` lista os filhos diretos (`SubagentListEntry`).

`extrairSuperficie(ctx, {agora})` devolve `{catalogo(), assinar(fn), velocidadeDe(id)}`
ou `null` sem canal (e o painel diz "à espera do host", nunca inventa). Diffa snapshots
sucessivos e emite o vocabulário §1 com estas regras:

- `usage` leva **deltas** (o estado soma): o 1.º vislumbre emite o acumulado para o
  custo estimado total aparecer; depois só deltas positivos (anti-dupla-contagem por sessão);
- `status` só em mudança (running/idle); `model`/`ctx` saem das projeções
  (`projectedTokens ?? pressureTokens`, janela de `contextPressure`);
- filhos (`parentId`/`entries`) pareiam `subagent/start|end` com `runId = childId`;
- velocidade de tokens calculada aqui (o estado é puro e sem relógio) por deltas de
  `output` sobre o tempo — `velocidadeDe(id)` → tok/s ou `null`;
- preços são NOSSOS (`PRECOS_USD_POR_TOKEN`, USD/token; resolução por chave exata e
  por inclusão para ids namespaced) — o DSH não publica preços; sem preço → "custo —".

O bundle (`client.js`) não pode importar irmãos (module table do loader), por isso a
fonte vive em `surface.js` e está embutida no bundle; o teste de paridade
`tests/plugin/client-surface.test.mjs` exige que os dois emitam exatamente os mesmos
eventos para o mesmo cenário (guarda contra drift).

Futuro (lado host, `adapter.js`): eventos de fio em tempo real (turn/end, tool/*,
user-questions, approval/*) via `SessionReference` + `eventSource` (modelo
`retain(target, {source})`, como `ui-workspace` faz com `source: 'mainView'`).
