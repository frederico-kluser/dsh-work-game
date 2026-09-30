# Contratos — plugin DSH + CLI `dwg` (dsh-work-game)

Documento de trabalho para implementação paralela. Cada módulo é independente e testável.
**Estado:** implementação em curso (2026-09-27). Nada disto substitui a API real do DSH:
o adaptador é o único sítio que fala com ela.

## Layout de ficheiros (não criar outros)

```
dsh-plugin/
  package.json          # manifesto do plugin (dsh.client + exports ./client)
  cordis.patch.yml      # camada de ativação do bundle
  src/index.js          # entry host (Cordis): a rota /api da PARTILHA (link + QR) — ver §8
  src/state.js          # lógica PURA do escritório (sem imports do DSH)
  src/adapter.js        # eventos/projeções DSH → eventos normalizados
  src/client.js         # painel no browser (slots do DSH) que renderiza a sala
  src/render.js         # SVG do escritório (reutiliza assets/furniture.svg)
  src/cenario-fundo.txt # fundo de escritório (= corpo de assets/office-backdrop.svg), embutido no client.js
  expose-port/          # funcionalidade Cloudflare EMBUTIDA (toolkit vendored da
                        #   cloudflare-agent-skill: domain.py up|down|list + wrappers,
                        #   LICENSE) — viaja COM o plugin, sem skill instalada
scripts/gerar-fundo-escritorio.py # FONTE do fundo: gera o .svg e o .txt (--embutir: client.js; --verificar)
scripts/embutir-expressoes.py # FONTE dos corpos de expressão: assets/avatars → EXPR_AVATARS do client.js
dwg-cli/
  bin/dwg               # executável Node (#!/usr/bin/env node)
  lib/commands.js       # implementação dos comandos
  lib/log.js            # logger estruturado (ficheiro + stdout, com --json)
scripts/
  macmini-setup.sh      # instala dependências + projeto no macmini (ssh)
  macmini-test.sh       # testes de instalação e execução no macmini
  macmini-logs.sh       # colhe logs do macmini para logs/ local
  verify-partilha.mjs   # verificador da PARTILHA (link + QR) num DSH web real — §8
tests/plugin/*.test.mjs # testes de state/adapter/CLI/partilha (node --test)
docs/contratos-plugin.md  # este ficheiro
docs/integracao-dsh.md    # como o plugin liga ao DSH (fontes verificadas)
docs/terminal.md          # manual do dwg (controlo/debug por terminal)
logs/                     # artefatos de execução (gitignored)
```

## 1. Eventos normalizados (contrato entre adapter e state)

O `state.js` nunca vê o DSH: recebe apenas objetos `{type, ...}`:

| type | campos | origem DSH |
|---|---|---|
| `session/added` | `sessionId, model?, title?, cwd?, parentId?, subagent, blank` | catálogo de sessões |
| `session/meta` | `sessionId, title?, cwd?, parentId?, subagent, blank` (só em mudança) | catálogo de sessões |
| `session/removed` | `sessionId` | catálogo de sessões |
| `workspaces` | `fonte: 'dsh'\|'nenhuma', items: [{id, title, path, sessionIds}], archived` | `ctx.get('workspaces').list` |
| `ctx` | `sessionId, used, window?` | projeção `contextPressure` |
| `status` | `sessionId, status: 'idle'\|'running'` | `agent/status` |
| `turn/end` | `sessionId, kind: 'completed'\|'aborted'\|'blocked'\|'error'\|'max-tokens'\|'interrupted'` | `turn/end.reason.kind` |
| `tool` | `sessionId, phase: 'call'\|'result', name, ok?` | `tool/call`, `tool/result` |
| `question` | `sessionId, id, text, options?, multiSelect?` | `user-questions/request` (runtime!) |
| `question/answered` | `sessionId, id` | retorno do waterfall |
| `approval` | `sessionId, id, toolName, callId?, reason?` | `approval/asked` |
| `approval/decided` | `sessionId, id, outcome` | `approval/decided` |
| `subagent/start` | `sessionId, childId, runId, local` | `subagent/start` (no browser: subagente `origin: 'subagent'` A CORRER) |
| `subagent/end` | `sessionId, childId, runId, stopReason` | `subagent/end` |
| `usage` | `sessionId, provider, model, uncachedInput, output, cacheRead, cacheWrite` | `tokenUsage` + `deriveTurnTokenUsage` |
| `model` | `sessionId, provider, model, contextWindow?` | `request/header` + `request/context` |
| `retry` | `sessionId` | `llm/retry-started` |
| `compaction` | `sessionId, phase: 'start'\|'end'` | `compaction/*` |
| `message` | `sessionId, side: 'user'\|'assistant'` | `user/message`, `assistant/message` (log da sessão) — sem conteúdo; cada uma pode disparar uma expressão nova da pessoa (reator de variantes) |

## 2. `dsh-plugin/src/state.js` — API

```js
export function createOfficeState() -> state
export function applyEvent(state, event) -> state      // puro: devolve NOVO estado
export function personView(state, sessionId) -> view   // apresentação pronta p/ UI
export function officeView(state) -> { people, teams, alerts }
export function planoDeParagem(catalogo, alvo) -> [{id, nivel}]  // paragem em cascata (ver abaixo)
```

`state.people[sessionId] = { id, name, avatar, status, emoji, expression, ctx, model, cost, question, approvals, subagents, outputs[] }`

Regras (verificados no DSH):
- `status` visual só fica `done` com `turn/end` `completed`; `idle` mostra "à espera".
- Pergunta (`question`) é **persistente** até `question/answered`; outputs expiram em ~1s na UI.
- Emoji por precedência: `❓/⚖️ > ⚠️ > 🔧/📝/🔍 > 🔄/📦 > ✅ > 💤` (ver tabela em docs/conhecimento/07-features-futuras.md).
- CTX: `used = projectedTokens ?? pressureTokens`, `window = contextWindow`; sem ambos → `null` (UI mostra `CTX —`).
- Custo: deltas dos 4 buckets × tabela de preços (state aceita `setPrices(map)`); sem preço → `null` ("custo indisponível").
- Agregados pai/filho: **filtrar `seq >= inheritedEventCount`** quando o evento o trouxer (anti-dupla-contagem).
- Expressão Avataaars derivada: bases `idle/working/tool/waiting/success/error` (+ override),
  cada uma com a **variante sorteada** do seu pool (ferramenta → `tool·searching·focused·thinking`;
  erro → `error·surprised·disbelief`; trabalho → `working·focused·thinking·searching·wink`;
  sucesso → `success·celebrating·approval·wink`). Os eventos do trabalho (`message`, `tool`,
  `turn/end`) disparam **sorteios** nesses pools — disparo aleatório, probabilidade e
  personalidade **próprias de cada pessoa**, com anti-repetição (reator de variantes,
  `dsh-plugin/src/variantes.js`).

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
- `user/message` e `assistant/message` (log da sessão) → `message` com `side` — sem conteúdo;
  é um dos gatilhos do reator de variantes (pode disparar uma expressão nova a cada mensagem).
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
- `SessionListState` = `{ ids, byId: Record<id, SessionSummary>, phase, subagentsByParent }`
  — só `ids` (ordem do host) exprime a pertença ao catálogo; `byId` junta linhas locais;
- `SessionSummary` = `{ id, title?, displayTitle, cwd?, parentId?, origin?: 'subagent',
  running, blank, updatedAt, projectionValues? }` com `projectionValues` = `tokenUsage`
  (acumulado), `contextPressure {projectedTokens?, pressureTokens?, contextWindow?}` e
  `modelSelection {lastUsed, next}`; **não há `workspaceId`** na sessão;
- `subagentsByParent[parent].entries` lista os filhos diretos (`SubagentListEntry`
  `{kind: 'child', id, activity: 'running'|'inactive', label?}` ou `{kind: 'diagnostic'}`).

**Workspaces** (`packages/api/workspace-controller/src/client/{service,model}.ts`):
`ctx.get('workspaces').list` é `{ items: WorkspaceView[], archivedSessionIds, state, phase }`
com `WorkspaceView { workspaceId, path, title, sessionIds }` na ordem do DSH. A pertença de
uma conversa vem **só** de `sessionIds` (primeiro workspace que a reclama — o
`owningGroupKey` de `ui-workspace/tree.ts`); o resto é *Ungrouped*. Enquanto `phase` é
`'pending'` não se emite nada (a sala agrupa por pasta até a baseline chegar).

`extrairSuperficie(ctx, {agora, intervaloWorkspaces})` devolve
`{catalogo(), assinar(fn), velocidadeDe(id)}` ou `null` sem canal (e o painel diz "à
espera do host", nunca inventa). `assinar` devolve sempre a função de libertação. Diffa
snapshots sucessivos e emite o vocabulário §1 com estas regras:

- `usage` leva **deltas** (o estado soma): o 1.º vislumbre emite o acumulado para o
  custo estimado total aparecer; depois só deltas positivos (anti-dupla-contagem por sessão);
- `status` só em mudança (running/idle); `model`/`ctx` saem das projeções
  (`projectedTokens ?? pressureTokens`, janela de `contextPressure`);
- `session/meta` quando título, pasta, origem ou "em branco" mudam (o DSH gera o título
  depois do 1.º turno);
- **delegação** = subagente (`origin: 'subagent'` ou listado em `entries`) **a correr**:
  `subagent/start|end` com `runId = childId`. Os terminados ficam no catálogo e não contam;
  um fork tem `parentId` mas é uma conversa normal;
- `workspaces` sempre que a lista do DSH muda; ligação **tardia** (sondagem de 1 s por até
  60 s e religação a cada notificação de sessões) e `fonte: 'nenhuma'` se o serviço sumir;
- velocidade de tokens calculada aqui (o estado é puro e sem relógio) por deltas de
  `output` sobre o tempo — `velocidadeDe(id)` → tok/s ou `null`;
- preços são NOSSOS (`PRECOS_USD_POR_TOKEN`, USD/token; resolução por chave exata e
  por inclusão para ids namespaced) — o DSH não publica preços; sem preço → "custo —".

O bundle (`client.js`) não pode importar irmãos (module table do loader), por isso a
fonte vive em `surface.js` e está embutida no bundle (secção 0, o texto de `surface.js`
sem `export`); os testes de paridade de `tests/plugin/client-surface.test.mjs` exigem o
mesmo texto e os mesmos eventos para o mesmo cenário (guarda contra drift).

### Desempenho de animação (regras Motion aplicadas a todas as animações)

Tudo o que anima — demo e plugin — é `transform`/`opacity`/`filter` (MotionScore **S**; nada de
layout/paint por frame) e passa por três portões: **visibilidade** (só o que está em tela anima:
mesas fora da câmara e lugares debaixo do celular ficam com `animation:none`; na demo, balões,
portátil e fades também só se animam com a pessoa no ecrã), **aba escondida** (tudo em pausa —
`html.oculto` na demo, `.wg-painel.wg-oculto` no plugin) e **`will-change` gerido** (a camada GPU
do mundo só existe durante o gesto da câmara, 220 ms de quietude e desliga). `prefers-reduced-motion`
desliga o CSS e é filtrado à mão nas animações WAAPI (que não herdam a media query). As animações
contínuas da cena (balanço, "zzz") ficam nos **degraus de 5 Hz** com um só relógio
(`criarRelogioCena`): SVG animado não compõe na GPU — springs/WAAPI a 60 fps custariam mais CPU
(medido: 31% → 2,5% com o relógio).

**A câmara não reconstrói nada.** O markup do SVG da cena (`renderOffice`) é memoizado por
identidade de ESTADO (`view`/seleção/permissões — `react.useMemo` em `PainelEscritorio`): arrastar
e dar zoom escrevem apenas `transform: translate(...) scale(...)` no `.wg-mundo` (compositor, sem
repaint e sem reavaliar o SVG). Na demo, a mesma regra: `updateTransform` só escreve o `transform`
do mundo (a escala dos hit-areas só se reescreve quando o zoom muda) e a reclassificação do que
anima faz UMA leitura de geometria por sincronia (nunca por elemento).

### A sala no bundle (`montarEscritorio` + `renderOffice`)

- **Mesas**: uma por workspace do DSH (ordem do DSH; título; caminho com `~`), cores
  azul/verde/coral por ordem (violeta = delegação), workspace vazio = 4 lugares livres,
  órfãs em **Sem workspace**; sem serviço de workspaces, agrupa por pasta (`cwd`).
- **Visibilidade** = barra do DSH (`ui-workspace/tree.ts`) por omissão: sem lugar próprio
  para subagentes, arquivadas (`archivedSessionIds`) e conversas em branco que não correm.
- **Filtros** (`montarEscritorio(pessoas, workspaces, filtros)`, puro; botão **Filtros ▾**
  na toolbar, menu com interruptores `role="switch"`, guardados em `localStorage`
  `dsh-work-game:filtros` com `try/catch` — sem armazenamento, valem só na página):
  `mostrarArquivadas` (falso: arquivadas não se sentam; verdadeiro: sentam-se na mesa do
  seu workspace ou em "Sem workspace", com a ficha **Arquivada** em cinzento),
  `mostrarSemWorkspace` (verdadeiro; falso tira a mesa das órfãs e a delegação dos seus
  líderes), `soTrabalhando` (falso; verdadeiro esconde quem está parado **e as mesas sem
  ninguém a trabalhar** — lugares "livres" de gente escondida convidariam a recrutar) e
  `mostrarEmBranco` (falso). Subagentes nunca contam: não têm lugar próprio. O layout
  devolve `escondidas {total, arquivadas, emBranco, semWorkspace, paradas}` e a toolbar
  mostra "N escondidas pelos filtros" (detalhe no tooltip e no rodapé do menu); com a sala
  vazia por causa dos filtros, a cena e o aviso dizem-no (nunca "à espera de telemetria").
  O menu é um diálogo não-modal (`aria-haspopup="dialog"`, `role="dialog"`), não um menu.
- **Toolbar em painéis estreitos**: o painel é um contentor de consultas
  (`container: wg-painel / inline-size` — conta a largura do PAINEL, não da janela: a
  barra do DSH abre e fecha). Botões `white-space:nowrap; flex:none` (nunca "＋" / "Zoom"
  em duas linhas); a contagem encolhe com reticências; ≤ 1000 px o chip fica "N
  escondidas"; ≤ 780 px a contagem sai.
- **Delegação**: quem tem subagentes a correr senta-se no lugar 0 da mesa violeta
  "Equipe de …" (mais de 3 filhos → "Apoio de …") e o lugar de casa fica reservado.
- **Geometria da demo**: grelha 3 colunas, *pitch* 940×730, `originX` 40, mundo 2900 de
  largura; `originY` = 310 porque o topo do mundo é a parede (ver *Fundo*). Altura do
  mundo = `originY + linhas·730 + 60` (1 fila = 1100).
- **Fundo de escritório** (`FUNDO_ESCRITORIO`): faixa 2900×360 no topo do mundo — forro
  ripado, parede sálvia, janela grande à esquerda, figueira, quadros, relógio, estante
  baixa; o chão começa em y=360. É o corpo de `assets/office-backdrop.svg` byte a byte
  (fonte: `dsh-plugin/src/cenario-fundo.txt`; teste de paridade), sem ids e com
  `pointer-events="none"`. Ordem: sangria → chão → grelha (só abaixo de 360) → parede →
  mesas; a 1.ª fila começa 50 acima do rodapé (só os balões sobem ao ripado). **Gerador**:
  `python3 scripts/gerar-fundo-escritorio.py` (Python stdlib) escreve
  `assets/office-backdrop.svg` e `dsh-plugin/src/cenario-fundo.txt`; `--embutir` troca só
  o texto de `FUNDO_ESCRITORIO` no `client.js` e `--verificar` compara sem escrever (sai 1
  se diferir — um teste corre-o). Regenerar dá EXATAMENTE os ficheiros atuais. Mudar
  `GRID.cols` obriga a mudar `W` no gerador e a regenerar. Fora do mundo (`<svg>` com
  `overflow:visible`), `renderOffice` prolonga a sala `SANGRIA` (8000) para cada lado: o
  **forro** (`#efe6d4`) para cima, o **chão** para baixo e para os lados (o mesmo padrão
  `#wg-floor`, sem costura) e a **parede** para os lados (`sangriaParede`: só as faixas
  horizontais do grupo `wg-bg-parede` — forro, sanca, luz, rodameio, ripado, rodapé — com
  as mesmas cores e traços, e as ripas em dois padrões, `#wg-forro` e `#wg-ripado`, com a
  MESMA fase: nada do desenho do fundo muda). A sala enche sempre o quadro, sem a faixa
  lisa `#efece2` da tela — nem com a câmara encostada à borda do mundo (a pessoa da mesa
  da direita aberta com o celular) nem no "Enquadrar" a 12%. Um teste de geometria compara
  faixa a faixa a sangria com o `wg-bg-parede` e verifica a cobertura até ±3000.
- **Quem dorme**: estado Disponível (parado) usa o preset `sleeping` (olhos fechados,
  `assets/avatars/sleeping/<id>.svg`, 8 × 1 corpos, byte a byte) e ganha um "zzz" junto à
  cabeça (`.wg-zzz`, `aria-hidden`, três letras a subir 60 e a andar 22 para a direita,
  de 0,6× a 1,2×, e a desvanecer em loop de 3,6 s). O **grupo** leva a posição
  (`translate(cx+77 226)`) e cada `<text>` fica em (0,0), `text-anchor="middle"`, com
  `transform-box: view-box; transform-origin: 0 0` — a escala e a subida partem da
  própria letra também no Safari (ver armadilhas). Pergunta, erro, concluído e trabalho
  mantêm as expressões da demo.
- **Quem trabalha balança**: Trabalhando/Executando ferramenta → `.character.wg-balanca`
  (só o boneco; cadeira e portátil quietos), `translateY` 0 → −7 → 0 em cosseno num ciclo
  de 2,8 s, `transform-box: fill-box`; só sobe, nunca desce sobre o portátil.
- **Movimento em degraus, num relógio só** (desempenho): os quadros-chave de
  `wg-zzz`/`wg-balanco` são amostrados a cada `PASSO_ANIM_S` (0,2 s) com
  `steps(1,end)` e as animações ficam em **pausa** no CSS; um só temporizador do painel
  (`criarRelogioCena`) põe-nas no mesmo degrau. O browser só trabalha 5×/s — medido no
  DSH 3080 (Chrome headless, CPU da sala parada): 6 a dormir 31% → 8,6% (estático 1%); 78
  "zzz" 75% → 18%.
  - **A meio do degrau**: `tempoDaCena(agora)` = início do degrau + 100 ms, e as
    percentagens dos quadros-chave arredondam para BAIXO (`pctQuadro`: 1/14 → 7,142%).
    Antes (início do degrau + `toFixed(3)`, que às vezes arredondava para cima), o
    progresso exato caía por vezes abaixo do quadro-chave e mostrava o degrau anterior
    (um teste replica o motor e apanha o defeito antigo).
  - **Só anima o que se vê**: `mesasAVista(n, câmara, tela)` — o retângulo do mundo à vista
    (`vistaDoMundo`, a partir de `{zoom, x, y}` e do tamanho da `.wg-tela`) com ~1 mesa de
    margem (940 × 730); as mesas fora dele levam `wg-fora` (`animation:none`). Recalcula-se
    em cada render do painel (câmara, sala, re-montagem) e no `ResizeObserver` da tela; só
    mexe no DOM quando o conjunto muda.
  - **Só corre quando é preciso**: com pelo menos um zzz/balanço à vista e a aba visível
    (`visibilitychange`: escondida, pára; ao voltar, acerta logo e retoma);
    `prefers-reduced-motion` → nada a animar, nada a correr. `window.__wgRelogio`
    `{tiques, elementos, animacoes, ativo}` (diagnóstico).
  - **Guarda a lista**: `definir(elementos, cena)` recolhe as animações dos elementos à
    vista numa SÓ consulta à subárvore da cena (`recolherAnimacoes`) e o tique só acerta
    essa lista; recolhe de novo no frame seguinte (WebKit), a cada 5 degraus (1 s) e
    quando uma guardada ficou `idle` (ver armadilhas 19–20).
  - **Medido (A/B, mediana de 3×5 s, Chrome headless, DSH 3080, 1440×900)** — antes →
    depois: 6 pessoas reais a dormir (todas à vista) 10% → 9,4% (estático 0,6–1%); sala de 78
    pessoas / 33 mesas (markup gerado pelo bundle e injetado no painel real; 70 a dormir, 8
    a trabalhar), câmara no topo 22% → 22,6% (218 → 100 animações; estilo 25,7 → 14,9
    ms/s, script 14 → 4,1 ms/s), a meio 28,4% → 23,8%, a 100% de zoom 19,6% → 20,2%
    (estilo 24,6 → 8,9 ms/s), **aba escondida 3,6% → 0,8%** (estático 0,2–0,6%). Com a sala
    parada à vista o custo que sobra é a pintura/rasterização do que se mexe no ecrã (igual
    nas duas versões): o corte fora de vista poupa estilo e script, e o que não se vê
    (outra aba, sala arrastada para longe) deixa de custar.
- **Fase por pessoa**: `animation-delay` negativo determinístico, múltiplo do passo (hash
  FNV-1a do id + mistura final do MurmurHash3); `prefers-reduced-motion` desliga balanço
  e deixa o "zzz" parado em escada.
- **Portátil** (`PORTATIL`/`portatilSvg`): 168×105 em `(cx−84, 301)` — o tampo (costas do
  ecrã, voltado para a pessoa) começa logo abaixo do queixo (y≈294; nunca cobre olhos nem
  boca) e cobre o peito; a base assenta junto à borda de trás da mesa. Ícone do estado
  centrado no ecrã.
- **Bonecos**: cada corpo Avataaars (identidade × expressão) vira um `<symbol>` único no
  sprite do painel (ids com escopo `wgav-<id>-<expr>-…`) e cada pessoa é um `<use>`. O
  pipeline dos bustos sem círculo deixou `mask="url(#…)"` para uma máscara inexistente: o
  Chromium ignora-a, outros motores podem não desenhar o boneco — `prepararCorpo` retira
  SÓ essa referência pendurada (o desenho fica o do Chromium em todos os motores). A arte
  continua byte a byte a da demo (testado contra `assets/`).
- **Nomes**: nome curto de pessoa (lista da demo) na ficha; o título da conversa vai para
  o tooltip e para a barra lateral. Associação estável em `localStorage`
  (`dsh-work-game:assoc`), com migração dos nomes antigos que eram títulos.
- **Barra lateral da pessoa** (substitui o inspetor do rodapé): clicar numa pessoa abre à
  direita a barra da demo (e o **celular** com a conversa dela — ver abaixo) (`renderInspector` de `app.js` + `.inspector*` de `styles.css`,
  portados com o prefixo `wg-`): 345 px, fundo `#fffefa`, "UMA PESSOA, MUITAS IDEIAS" +
  fechar, avatar arredondado (o `<symbol>` do boneco com a expressão atual), nome,
  "workspace · mesa principal/expandida/de equipe" (+ "arquivada"), estado com ponto
  colorido ("Em delegação · …" quando o lugar de casa está reservado), cartão da conversa
  (título, **Conversa** — ícone de traço, como os glifos da demo — e **Abrir no DSH**) e
  três separadores (`role="tab"`, setas mudam):
  **Contexto** (janela REAL: usado / janela, %, barra, aviso >200k — sem a composição
  simulada da demo, que o DSH não publica), **Custo** (os 4 buckets reais de `tokenUsage`
  somados dos eventos `usage` × a nossa tabela, com rótulo ESTIMATIVA; modelo, velocidade)
  e **Atividade** (linha do tempo, mais recente primeiro: o **histórico da conversa** —
  pedidos, ferramentas ✓/✕/a correr, respostas assentes e erros de turno, com a hora de
  cada um, etiqueta "histórico" — intercalado por hora com os eventos **ao vivo**; os
  últimos 50). O histórico sai de `historicoDaConversa(itens do celular)` (pura; uma
  resposta a transmitir fica de fora, por isso o streaming não o muda); o núcleo deriva-o
  sempre que a conversa aberta publica, só notifica quando muda (`getHistorico(id)`) e
  GUARDA-O enquanto a mesma pessoa estiver selecionada — fechar o celular não esvazia a
  Atividade. O que mostra sai de uma função pura, `modeloSidebar(pessoa, {layout,
  precos, historico})`; sem dado → "—". Fecha com **Esc** (por ordem: menu de filtros,
  celular, barra — só com o foco no painel) e com o botão; o foco volta ao lugar da
  pessoa. A tela da sala encolhe: um `ResizeObserver` reenquadra (ver *Câmara*: zoom
  legível e a pessoa centrada) ou, se o utilizador já explorou, só desloca o mínimo para
  a pessoa selecionada continuar à vista.
- **Estado por pessoa para a barra**: `tokens {uncachedInput, output, cacheRead,
  cacheWrite}` (null até ao 1.º `usage`) e `activity` — os últimos 50 eventos reais
  `{at, tipo, texto}`: começou/terminou de trabalhar (só transições; o 1.º `status` a
  correr é "Já estava a trabalhar"), troca de modelo, subagente começou/terminou (com o
  nome), contexto passou de 200k, título novo, e — quando chegarem do fio — fim de turno,
  ferramentas, perguntas, aprovações, retentativas e compactação. A hora é a de chegada
  (`evento.at`, carimbada pelo núcleo; o estado continua sem relógio).
- **Celular (iPhone + iMessage)**: clicar numa pessoa abre a barra lateral **e** o celular
  com a conversa REAL dela; **Conversa** (barra lateral) alterna-o; fecha com
  **‹ Escritório**, Esc (1.º o celular, depois a barra) e ao mudar/fechar a pessoa. Flutua
  sobre a sala (`.wg-palco`, `right:18px`), **à esquerda da barra lateral, sem a cobrir**
  (o palco tem `z-index:1`, abaixo da barra: a sombra do celular não a suja), com entrada
  suave (`wg-tel-entrar`; `prefers-reduced-motion` desliga); a câmara centra a pessoa na
  zona livre, fora dele (`zonaVisivel`, ver *Câmara*). **Painel estreito** (`@container wg-painel (max-width:920px)`, a
  sala ficaria com < ~600 px): o celular passa a flutuar **por cima da barra lateral**
  (`right: calc(18px − var(--wg-sb))`, palco `z-index:4`, o conteúdo da barra escondido
  por baixo) em vez de tapar a sala; fechar o celular devolve a barra. ≤ 800 px de janela
  fica o esquema antigo (barra por cima da sala, celular à esquerda — a câmara usa a
  posição REAL dos dois: a pessoa fica entre o celular e a barra). Moldura escura fina (cantos
  46 px, `aspect-ratio` 390/844, até 760 px de altura), Dynamic Island, barra de estado (hora
  local HH:MM, sinal/Wi-Fi/bateria em SVG), cabeçalho translúcido com **‹ Escritório**,
  avatar redondo (o `<symbol>` do boneco com a expressão atual), nome › e o título da
  conversa; câmara de vídeo azul (FaceTime) decorativa à direita. Bolhas: minhas à direita `#0B84FE`/branco, do agente à esquerda `#E9E9EB`/preto,
  18 px, agrupadas (2 px dentro do grupo, 9 px entre grupos) com **cauda** só na última de
  cada grupo; separadores de hora centrados ("Hoje 14:32", "Ontem…", dia da semana, "22 de
  set.") no início, após 15 min de silêncio e noutro dia; **Entregue** sob a última minha;
  ferramentas seguidas numa linha cinzenta centrada ("🔧 bash · npm test · +3", abre a
  lista com ✓/✕/⏳); injeções de contexto numa linha discreta ("Contexto · AGENTS.md,
  skill-catalog"); pensamento (`reasoning`) omitido; erros de turno a vermelho; **a
  escrever…** (três pontos numa bolha cinza) enquanto a conversa corre, espera o 1.º turno
  ou transmite. Texto em `pre-wrap` com Markdown leve (títulos e `**negrito**` a negrito,
  "- " → "•", blocos ```` ``` ```` e `código` em mono, tabelas `| a | b |` → "a · b" com
  o cabeçalho a negrito e o separador `|---|` fora (`celulasDaTabela`: um `|` dentro de
  `` `código` `` ou escapado `\|` não parte a célula — `\|` mostra-se `|` — e as células
  vazias ficam "—", as colunas não desalinham), réguas `---` sem buracos — nunca mais
  de uma linha vazia seguida, nem nas pontas da bolha); os segmentos ficam em cache
  (`segmentosEmCache`) e as bolhas longas só se segmentam na parte mostrada; acima de
  1600 caracteres, **Ler mais**. Entrada: "+" desativado, cápsula "iMessage"
  (`aria-label` "Mensagem para <nome>"), com a caixa vazia um microfone cinzento e, com
  texto, o círculo azul com a seta; sem sessão viva (controlador **inerte**: id
  desconhecido, sem canal — `snapshot.inerte`) a caixa desativa-se; **Enter envia**,
  Shift+Enter muda de linha; eco imediato (bolha semitransparente) e depois a real; a
  correr, a mensagem fica **na fila** — e a fila fica **sempre no fim da conversa**,
  como última mensagem (depois até do "a escrever…", como a QueueDock do DSH), com o
  recibo POR MENSAGEM ("a enviar…" no eco ainda sem entrada, "na fila" à espera do
  turno, "a entrar no turno…" depois do steer) e, na mesma linha, os botões
  **Enviar agora** (`updateQueue(id, {kind:'steer'})` — entra já no turno em curso;
  ativo só com `aCorrer`, fora disso desativado com o título "Só enquanto <nome> está a
  trabalhar") e **Remover** (`updateQueue(id, {kind:'remove'})`); sem carregar em
  nenhum, a mensagem entra sozinha quando o turno terminar (FIFO, como no DSH); envio
  recusado → "Não entregue" a vermelho com ❗ (clicar reenvia); uma ação de fila
  recusada mostra o erro numa linha vermelha no fim da fila (`erroFila`) — e
  `session/queue-item-not-found` (o item já entrou em execução) converge em silêncio.
  DOM limitado às últimas 200 linhas; ao chegar ao topo (ou em
  **Mensagens anteriores**) mostram-se as escondidas e pede-se `loadOlder`, mantendo a
  posição; rola para o fim ao abrir, ao enviar e quando chega mensagem nova se já estava
  no fim. Puro e testável: `itensDoChat` (alvo 'chat' → itens), `itensDoFluxo` (fallback
  cru), `linhasDoTelefone` (grupos, cauda, horas, recibos, fila sempre no fim), `aEscrever`,
  `rotuloDaFila`, `segmentosDeTexto`, `resumoArgs`; controlador `criarConversaTelefone`
  com `enviar`, `enviarAgora`, `descartar` e `reenviar` (receita abaixo);
  o núcleo guarda **uma** conversa (`getConversa`) e liberta-a ao fechar, ao trocar de
  pessoa (retain da nova antes do release da anterior), em `parar()` (painel desmontado)
  e no `dispose()` (HMR). O componente é `React.memo` com props primitivas e `fechar`
  estável: não se redesenha com os eventos das outras pessoas da sala, só com a própria
  conversa (e `linhasDoTelefone` corre em `useMemo`). **Segurança**: o texto das
  mensagens só chega ao ecrã como nós de texto React — o único `innerHTML` do celular é o
  `<use>` do avatar.
- **Ações** (API pública `UiWorkspace`, lida com `ctx.get('uiWorkspace')`): barra lateral →
  **Abrir no DSH** (`openSession(id)`); **Nova sessão** e lugares livres das mesas de
  workspace → `startSession(workspaceId)` (reutiliza a conversa em branco do workspace, se
  houver). Arrastar só começa após 6 px e nunca dispara cliques.
- **Câmara** (`enquadramento(mundo, tela, tudo, foco)`): automático ao montar, quando a
  sala muda de forma e quando a tela muda de tamanho, até o utilizador explorar
  (arrastar, scroll, zoom). Cabe tudo com zoom ≥ 0,3 → a sala inteira; senão fica no
  zoom "de sempre" `ZOOM_FOCO` = 0,4 (nunca menos: fichas, olhos fechados, "zzz" e
  balanço legíveis) e mostra o início da sala. Com uma pessoa selecionada
  (`centroDoLugar`), o zoom também não desce de 0,4 e a câmara **centra-a na zona à
  vista** — `zonaVisivel(largura, obstáculos)`: a tela menos o que flutua por cima dela
  (caixas de LAYOUT, `offset*`, sem a entrada animada): o celular à direita ou — janela ≤ 800
  px — à ESQUERDA, e a barra lateral quando se sobrepõe à sala (≤ 800 px); 24 px de folga,
  o maior troço livre, mínimo 160 px; o que não cruza a tela não conta. `enquadramento`
  recebe `tela.zona {esq, dir}` e não mostra vazio antes do mundo dentro da zona;
  `manterSelecionadaVisivel` usa a mesma zona. Clicar numa pessoa tira o modo "Enquadrar". **Enquadrar**
  mostra a sala inteira e volta ao automático. A sala **encosta ao topo** (a parede cola
  à toolbar; o chão continua até ao fundo). Numa fila (mundo 2900×1100, painel 1160×805)
  quem manda é a largura — zoom 0,4; até 3 filas cabe tudo legível; com a barra lateral
  aberta (815 px) o zoom fica em 0,4 (antes caía para 0,28).

Futuro (lado host, `adapter.js`): eventos de fio em tempo real (turn/end, tool/*,
user-questions, approval/*) para TODAS as pessoas via `SessionReference` + `eventSource`
— hoje só o celular retém uma sessão (a aberta), com o rótulo próprio `dshWorkGame`.

### Celular: a conversa real (receita verificada no DSH 0.1.6-alpha.2)

Fontes no checkout `deepseek-harness` (tag `dsh-v0.1.6-alpha.2`); validado ao vivo no
macmini (DSH web 3080) com `verify-dsh-panel.mjs --conversa` e `--enviar`.

1. **Retain** — `ref = ctx.sessions.retain(id, { source: 'dshWorkGame', signal })`
   (`session-controller/src/client/contract/sessions.ts:24-58`, `sessions/service.ts:287-300`):
   devolve logo `{sessionId, binding, ready, release()}` e **lança** se o id é
   desconhecido ou o controlador foi descartado (`try/catch` → celular em erro).
   `ref.binding.session` é a `SessionFace` (ISession + `getSnapshot`/`subscribe`).
2. **Assinar** a sessão (`running`, `pendingSubmissions`, `awaitingFirstTurn`,
   `openState`/`openError`, `hasMore`/`loadingOlder`, `removed`, `lastAgentError`,
   `subagent`) e a projeção **`inbox`** (`session.projections.faceOf('inbox')` →
   `{'next-turn', 'next-step'}` = a fila; `core/agent/src/types.ts:33-57`).
3. **`await ref.ready`** (o 1.º `Session.open()`: última página de 50 mensagens + stream
   ao vivo). **Resolve mesmo quando a abertura falha** — ler `openState === 'error'`; só
   rejeita em montagem/abort/release.
4. **Mensagens**: o `SessionSnapshot` não as tem. Lê-se o alvo `'chat'` do
   `uiConversation` — a mesma montagem do chat do DSH (`ui-chat/src/client/apply.ts:59-71`):
   `servicoDe(ctx, 'uiConversation').binding(binding).target('chat')`; **o 1.º
   `subscribe` ativa o alvo** (antes, `getSnapshot()` é `undefined`). `ChatSnapshot =
   {order, nodes, timeline, legacy…}`: os itens visíveis são `order.map(k => nodes.get(k))`
   (`ui-chat/src/client/contract/snapshot.ts:92-99`). Kinds usados: `user`/`steering`
   (bolha minha; `data.source.rpcId` = requestId do envio), `assistant-step`
   (`{status: 'running'|'settled'|'interrupted', blocks: [{kind:'text'|'reasoning'|…}]}`),
   `tool-call` (`data.root`: a correr sem `kind`, assente = `ToolResultNode` com `isError`),
   `context` (`producer.label`), `turn-error`, `turn-max-tokens`, `model-retry`,
   `command`, `compaction`; ignorados: `turn-process`, `turn-tail`, `system-prompt` e kinds
   desconhecidos. Sem `uiConversation`, dobra-se `binding.eventSource` (eventos
   `user/message`, `assistant/message`, `tool/call|result`, `turn/end` e os `text-delta`
   transitórios de `assistant/live-chunk`).
5. **Enviar** (como o compositor do DSH, `ui-conversation/src/client/service.ts:264-293`):
   `h = session.beginSubmission({mode: 'queue', text, attachments: []})` (eco síncrono em
   `pendingSubmissions`) → `session.prompt([{type:'text', text}], 'queue', undefined,
   h.requestId)` → `RemoteResult` (`{ok:false, error}` também vai para
   `snapshot.promptError`; o DSH retira o eco). Exceção antes do prompt → `h.abandon()`.
   Sempre `'queue'`: parada, inicia um turno; a correr, entra na fila (`steer` só entra no
   próximo step e não é o padrão). **Subagente** (`snapshot.subagent !== null`): o prompt
   ignora o requestId — sem `beginSubmission` (o eco ficaria preso), eco local.
6. **Fila (o padrão da QueueDock do DSH)**: a fila lê-se na projeção `inbox`
   (`mensagensDaCaixa` → `id`, `texto`, `anexos`, `rpcId`, `alvo` `'next-turn'`|`'next-step'`)
   e desenha-se **sempre no fim da conversa** (o bloco `fila` de `linhasDoTelefone`, depois
   do "a escrever…"). Os botões da linha usam `session.updateQueue(itemId, action)` — o
   mesmo RPC das linhas da QueueDock: **Enviar agora** = `{kind:'steer'}` (o DSH tira a
   mensagem de `next-turn` e põe-a em `next-step`: entra já no turno em curso; só com
   `snapshot.running`, senão `session/steer-unavailable` e o botão fica desativado) e
   **Remover** = `{kind:'remove'}` (funciona nos dois alvos). `session/queue-item-not-found`
   (o item já entrou em execução) converge em silêncio; as outras falhas mostram-se em
   `erroFila`, uma linha vermelha no fim da fila. Sem carregar em nenhum botão, a fila
   drena-se sozinha FIFO — 1 mensagem por turno, pelo `agent-loop` (`claim('next-turn')`).
7. **Deduplicar**: o eco cujo `requestId` já aparece como `source.rpcId` num nó do
   utilizador ou numa mensagem da `inbox` esconde-se no mesmo render (a regra
   `observedRpcIds` do `ChatView`); um eco `queued` mostra-se "a enviar…" até a inbox o ter
   ("na fila" a partir daí).
8. **Antigas**: `session.loadOlder()` só com `openState === 'open' && hasMore &&
   !loadingOlder` (no-op fora disso; página de 50); a UI mantém a posição do scroll.
9. **Libertar** — por esta ordem: tirar **todos** os `unsubscribe` (sessão, inbox, alvo
   'chat' ou eventSource) → `abort()` do sinal → `ref.release()` **uma vez**; depois disso
   `ref.binding` lança. A última referência (de qualquer fonte) fecha o stream e o scope;
   se o painel principal do DSH tiver a mesma conversa (`mainView`), só desce a contagem.
   `window.__wgTelefoneRefs` conta as referências vivas do plugin (diagnóstico).

### Celular: GRUPOS (workspaces) e modo telemóvel

A segunda funcionalidade do celular é o **Grupo** = workspace. Navegação tipo iMessage:
**Grupos → Grupo → Conversa**, com o "‹" a subir a pilha (na raiz, "‹ Escritório" fecha no
desktop; **no telemóvel não fecha** — o celular É o ecrã). Dados:

- **Grupos** (`montarEscritorio`): uma linha por equipa do layout (workspaces + "Sem workspace"),
  com as pessoas sentadas às mesas dessa equipa e o subtítulo vivo ("N está a escrever…" quando
  alguém corre; senão os nomes). Clicar abre o grupo.
- **Grupo** (`linhasDoGrupo`, pura e testada): o feed CONJUNTO das conversas dos membros —
  `criarConversaTelefone` por membro (retain enquanto o grupo está aberto, `MAX_GRUPO` = 12),
  linhas de cada uma junta por hora, com o nome de quem fala (repete depois de uma interjeição
  minha), ferramentas numa linha (`Rui · 🔧 bash`), datas na ordem junta e o "a escrever…" de
  cada membro no fim. Clicar numa mensagem (ou em quem escreve) abre a conversa individual
  (`abrirTelefone(id, 'grupo')` + `selecionar(id)`). Sem ícone de ligar no grupo; o campo fica
  "Toque numa pessoa para lhe escrever" (não há conversa de grupo a quem enviar — nada se inventa).
- **Conversa individual**: ícone de **ligar** (handset; era a câmara do FaceTime — decorativo) e
  **microfone** no lugar do "+" dos anexos (voz é no DSH). A animação de entrada do celular
  acontece só quando ele ABRE (navegar não a repete).
- **Modo telemóvel** (`emCelular()`: `(max-width: 620px) and (pointer: coarse)`): o painel recebe
  `wg-so-celular` e o celular vira **`position: fixed` fullscreen contra a JANELA** (o
  `container-type` do painel desliga-se para o fixed escapar) — cobre o DSH inteiro (a barra não se
  vê), sem toolbar/sala/barra, sem moldura (ilha e barra de casa fora) e sem animações de fundo.
  Navega-se só dentro do celular; a ÚNICA saída é o botão **✕ Fechar** da tela inicial (Grupos),
  que chama `layout.selectPanel(null)` — o Modo jogo fecha e a Conversa do DSH volta (o painel
  desmonta e liberta tudo). O Esc do painel não fecha nada no telemóvel.

A navegação é do **núcleo**: `telefone = { aberto, sessionId, vista: 'conversa'|'grupos'|'grupo',
grupoId, origem }` com `abrirGrupos()`, `abrirGrupo(wsId, membros)`, `voltarTelefone()` e
`fecharTudo()` (liberta conversa + grupo — nunca retém em fundo).

### Vigia de mensagens — a cara troca A CADA MENSAGEM

"Durante o trabalho, a cada mensagem os funcionários trocam de expressão" — mas o
`SessionSnapshot` não traz mensagens (só o log da sessão as tem). A **vigia** de
`client.js` (`criarVigiaMensagens`) é o primeiro sinal de fio ligado no browser:

1. **Liga** quando a conversa passa a `running` (evento `status`): `retain(id, {source:
   'dshWorkGame'})` — a mesma fonte do celular — e `await ref.ready` → `binding.eventSource`.
2. **Conta** cada entrada `user/message` | `assistant/message` NOVA (chave = `seq`) e emite
   `{type:'message', sessionId, side}` pelo mesmo caminho dos outros eventos. A história
   anterior ao retain não conta (nem a que chega depois, por `loadOlder`); o prompt que
   arrancou o turno conta — chega milissegundos antes do `status`, daí a graça
   `VIGIA_CORTE_MS` para trás.
3. **Liberta** `VIGIA_GRACA_MS` depois da conversa parar (a última mensagem do turno chega
   mesmo antes de ela parar; voltar a correr dentro da graça cancela a libertação), em
   `session/removed` e no fecho do painel (`parar`/`dispose`). `window.__wgVigiaRefs` conta
   as referências vivas (diagnóstico). Sem canal ou sem `eventSource`, a vigia fica quieta:
   nunca se inventa uma mensagem.

As expressões **acontecem durante o trabalho**: o reator de variantes (fonte única
`dsh-plugin/src/variantes.js` — `state.js` importa-a; `client.js` e `expressions.js` levam
cópia embutida regenerada por `python3 scripts/embutir-variantes.py --embutir`, com paridade
imposta por `tests/plugin/variantes.test.mjs`) sorteia expressões por evento: `message` →
pool de trabalho, `tool` (call) → pool de ferramenta, `tool` (result com erro) e turnos em
erro → pool de erro, `turn/end` completed → pool de sucesso. O disparo é aleatório e
**próprio de cada pessoa** (probabilidade × personalidade, derivadas do id), com
anti-repetição; `presetDe(p)` mostra a variante sorteada do estado e os estados fortes
(dormir, ferramenta, espera, erro, sucesso) continuam a mandar. Os corpos das expressões
embutem-se a partir de `assets/avatars/` com `python3 scripts/embutir-expressoes.py --embutir`
(8 identidades × 15 presets = 120 — os 14 da biblioteca + `sleeping`; idempotente;
`--verificar` confere — o teste REGRA DE OURO de `tests/plugin/render.test.mjs` garante a
igualdade byte a byte).

### Paragem em cascata — "Parar pessoa e equipa" (a feature que o DSH não tem)

O DSH **não** para subagentes com o pai: `session.cancel()` e o `interrupt_agent` do
`tool-subagent-control` param APENAS o alvo ("Stops only the target's current turn… **descendants
keep running**"). E o contrato de `cancel()` avisa que "**pending queued work remains and resumes
in FIFO order** after the Host reaches cancellation quiescence" — sem largar a fila, a tarefa
adicional que se mandou por mensagem entra em execução logo a seguir à "paragem". O `cancel()` do
próprio cliente já roteia filhos por `subagents.interruptByParent(child, parent, 'continuable')`
(morada durável do pai; funciona sem o Agent do pai vivo), mas o host recusa `session.cancel` em
sessões de subagente ("owned by subagent routing") — **sem morada explícita, o retain por id cai na
rota errada e o cancel é recusado**.

O **Parar** do Modo jogo faz a paragem real:

1. **Plano** — `planoDeParagem(catalogo, alvo)`: o alvo e toda a subárvore de subagentes,
   **pai-primeiro** (o líder não pode re-delegar a meio da desmontagem), por nível, com proteção
   contra ciclos. A árvore sai do snapshot real (`linhasDoSnapshot`: `byId.parentId` +
   `subagentsByParent`); um FORK também tem `parentId` mas não é subagente (`subagente: false`) —
   entra como sessão normal.
2. **Por sessão do plano**, com a referência retida por instantes (`source` próprio — nunca
   `mainView`) e `await ref.ready` antes de agir:
   - **largar a fila ANTES de cancelar** (projeção `inbox`, `next-step` e `next-turn`, por
     `updateQueue(id, {kind:'remove'})` — o `cancel` do DSH mantém a fila e ela retoma);
   - **`cancel()`** (retain dos filhos com a morada explícita `{parentSessionId, childSessionId,
     mode}`, para o cliente rotear para `interruptByParent`);
   - **martelo de quietude**: repetir (máx. 4 rondas, 400 ms) enquanto houver fila ou turno vivo —
     uma tarefa que assente durante a cascata vira turno sozinha e o cancel num momento sem turno é
     aceite mas inócuo. A 1.ª ronda cancela sempre.
3. **Falhas por id** nunca abortam o resto do plano; `ref.release()` uma única vez por sessão.
   Diagnóstico headless: `window.__wgParagem` = `{plano, parados, turnosCancelados, filaLimpada,
   filaItens, vidas, detalhes, falhas}`.

UI: botão **"Parar pessoa" / "Parar pessoa e equipa"** na barra lateral (`data-alcance`), visível
enquanto há trabalho a correr ou equipa em curso, com "A parar…" durante a cascata. A **contagem de
subagentes é por FILHO ativo** (`subagentAtivos: Set`): a ponte (diffs do catálogo) e o adaptador
(eventos reais) emitem AMBOS o `subagent/start` do mesmo filho, com `runId`s diferentes, e somar
eventos deixava o líder "Trabalhando" em fantasma quando só um dos `end` chegava (apanhado pelo
`scripts/e2e-paragem.mjs`, que encena tudo isto com trabalho real).

### Armadilhas do runtime verificadas ao vivo (macmini, 2026-09-28)

1. **`ctx.sessions` só existe se declarado em `exports.inject`.** O client-runner
   injecta apenas os serviços pedidos (catálogo: `layout`, `locale`, `sessions`,
   `slots`) — sem `'sessions'` na lista, `extrairSuperficie` devolve `null` e o
   painel mostra "à espera do host" mesmo com o DSH cheio de sessões.
2. **Subscrever antes de iniciar.** A explosão inicial de eventos (catálogo +
   projeções) acontece dentro de `iniciar()`; se os ouvintes da UI só forem
   registados depois, essa explosão perde-se e a sala fica presa no estado vazio
   até ao próximo evento. O efeito do painel subscreve primeiro e `iniciar()`
   termina com `notificar()`.
3. **Todo o nome no `inject` é OBRIGATÓRIO** (Cordis do DSH: sem modo opcional).
   Um serviço ausente deixa a entrada `pending` e `assertEntriesActive` aborta o boot
   web — a UI inteira não monta. Por isso só se declaram `slots`, `layout` e
   `sessions`; `workspaces` e `uiWorkspace` leem-se com `ctx.get(nome)` (não bloqueia
   e devolve `undefined` se o serviço faltar). Nunca tocar em `ctx.workspaces` sem o
   declarar: o proxy do Cordis reclama de propriedades não registadas.
4. **`ctx.get` devolve um proxy novo a cada chamada** (`getTraceable`); a propriedade
   `list` é o próprio modelo, estável — compare-se por `list`, não pelo serviço.
5. **Painéis `main` inativos são desmontados** (não escondidos): cada abertura do
   Modo jogo remonta o painel; o núcleo (estado + ponte) sobrevive e só re-subscreve.
6. **`client.js` é lido para memória e recarregado pelo client-hmr** (mtime/tamanho a
   cada 500 ms) — mudar o ficheiro no disco basta, sem reiniciar o `dsh web`. Mas a
   instalação `file:` do pnpm é uma **cópia**: o DSH continua a servir a cópia antiga.
   Instalar com `dsh plugin --profile web add link:<repo>/dsh-plugin`.
7. **Sem CSP** na página do DSH: `<style>` inline, SVG por `innerHTML` e `data:` passam.
8. **A cena é re-montada por `innerHTML` a cada evento** (e um boneco a trabalhar gera
   eventos de telemetria a toda a hora): as animações CSS dos elementos novos recomeçam
   e o balanço/"zzz" saltariam (medido: ~5 px de salto no mundo). As animações estão em
   pausa e o relógio da cena põe-nas no degrau comum (`currentTime` = relógio do
   documento no meio do degrau de 0,2 s; com o atraso negativo de cada pessoa, a fase
   continua): depois de cada re-montagem (*layout effect*, antes de pintar), outra vez no
   frame seguinte — o **WebKit** só cria parte das animações CSS no cálculo de estilo
   seguinte e o `getAnimations()` do layout effect não as vê — e 5×/s pelo temporizador.
   Arrastar/zoom não re-montam nada.
9. **Nunca `source: 'mainView'`** no retain do celular. `retainedBy.mainView > 0` é o
   sinal de "conversa principal" para o `ui-session` (painel de conversa, "não lidas"),
   o título do documento, o destaque da barra do DSH e mais; reutilizar `'sidebarChat'`
   (do `ui-subagent`) também não. Um rótulo próprio (`'dshWorkGame'`) é só uma chave de
   contagem — sem validação em runtime.
10. **`uiConversation` fica fora do `inject`** (seria obrigatório — ver 3) e lê-se com
    `ctx.get` **ao abrir o celular** (com o fiber já ativo). `binding(b)` lança se a
    sessão não estiver retida: só com a referência viva.
11. **No streaming, `order` não muda**: os nós do alvo 'chat' são substituídos a cada
    fragmento (publicação a cada ~3 frames, só com o separador visível). Relê-se
    `nodes.get(key)` em cada notificação; memoizar por `order` congelaria o texto.
12. **O eco sai um frame DEPOIS do nó durável** — sem a deduplicação por `rpcId` há uma
    bolha dupla por um instante.
13. **Cada retain/release republica `ctx.sessions.list`** (`retainedBy` muda): a ponte
    (`surface.js`) só emite em mudanças reais do que normaliza, por isso abrir/fechar o
    celular não gera eventos nem re-renders em ciclo.
14. **O DSH aplica `corner-shape: superellipse(1.5)` a tudo** (`*, ::before, ::after`):
    cantos contínuos como no iOS (bons para a moldura e as bolhas), mas um
    `border-radius: 50%` vira um quadrado arredondado. Os círculos do celular (pontos do
    "a escrever…", avatar, enviar, "+", ❗, a cauda) e os interruptores/chip dos filtros
    levam `corner-shape: round`.
15. **`aspect-ratio` + conteúdo largo**: numa caixa absoluta com `aspect-ratio`, o
    `min-width: auto` cresce até à largura mínima do conteúdo (um `pre` longo alargava o
    celular para 465 px); `min-width: 0` repõe a proporção.
16. **Animações CSS em elementos SVG da cena custam CPU a cada frame**: não são
    compostas na GPU — o browser serve-as e repinta a camada da sala (`.wg-mundo`) a 60
    fps, mesmo com a sala parada. Daí os degraus em pausa + um relógio só (ver *Movimento
    em degraus*): nada de animações contínuas na cena.
17. **`transform-box: fill-box` + `transform-origin` num `<text>` com `x`/`y` erra no
    WebKit** (Safari 27): a origem é calculada como se a caixa começasse em (0,0) — cada
    `scale(s)` desloca a letra ≈ (1−s)·(x, y) e o "zzz" descia para a cadeira do vizinho.
    Posição no `<g transform>`, letra em (0,0) e `transform-box: view-box;
    transform-origin: 0 0`: igual nos dois motores (o verificador mede-o: a letra sobe).
18. **Consultas de largura: pelo painel, não pela janela.** A barra do DSH (280 px) abre
    e fecha; `@media` acertava mal. O painel é `container: wg-painel / inline-size`.
19. **`Element.getAnimations()` por elemento é caro no Chrome**: cada chamada percorre as
    animações do documento inteiro. Com 100 elementos por degrau o script subiu para ~166
    ms/s (33 ms por tique) — pior do que a subárvore toda. Uma só consulta
    (`cena.getAnimations({subtree: true})`, filtrada pelos alvos) e a lista guardada.
20. **Acertar o `currentTime` de uma animação CSS CANCELADA ressuscita-a**: quando o CSS a
    tira (`animation:none`, `prefers-reduced-motion`, estilo mexido por fora) o objeto
    guardado fica `idle`; dar-lhe um `currentTime` põe-na de novo a aplicar o efeito,
    desligada do CSS e para sempre na subárvore (medido: 200 animações para 100
    elementos). O relógio salta as `idle` (ler `playState` força o estilo no máximo uma
    vez por degrau) e recolhe de novo.
21. **`steps(1,end)` + percentagem arredondada para cima = degrau anterior**: 1/14 =
    7,142857% escrito `7.143%` fica acima do progresso exato do degrau 1. Percentagens
    arredondadas para baixo e o relógio a meio do degrau.

Validação: `node scripts/verify-dsh-panel.mjs <url-de-um-dsh-web> [pasta] [--acoes]
[--recrutar] [--conversa] [--enviar "<regex do título>"]` — ativação, canal real,
workspaces → mesas, bonecos (`<use>` → `<symbol>` com caixa real, 0 referências
partidas), barra lateral (cabeçalho, nome, estado, avatar resolvido, separadores
Contexto/Custo/Atividade, a sala a encolher; o clique abre também o celular, o 1.º Esc
fecha-o e o 2.º a barra, o ✕ fecha os dois), menu de filtros (4 interruptores, "Mostrar
arquivadas" mexe na sala e persiste em `localStorage`, Esc fecha), rato real (clicar
seleciona, arrastar não clica, Abrir no DSH navega, lugar livre recruta) e zero erros de
consola; o relógio da cena (5 tiques/s com algo animado à vista, todas as animações a
meio do degrau, `currentTime ≡ 100 mod 200`) e a sangria lateral (a pessoa mais à direita
aberta: depois da borda do mundo, `elementFromPoint` dá o chão da sangria e o grupo da
parede cobre o lado — nunca a tela). `--conversa` abre o celular em cada pessoa (fonte = alvo 'chat', uma só
referência viva ao trocar), exige bolhas com as cores do iMessage, cauda, hora, fim da
conversa à vista, só nós de texto dentro das bolhas e o celular à esquerda da barra;
carrega mensagens anteriores; "‹ Escritório", **Conversa** e Esc — e 0 referências no
fim. Sempre: a sonda de geometria do "zzz" (animação parada no 1.º e no último quadro: a
letra SOBE, à direita da cabeça e antes do vizinho), a câmara com a pessoa aberta (zoom
≥ 40% e a ficha à vista, à esquerda do celular) e a Atividade com o histórico da conversa
quando ela tem mensagens. `--enviar` escreve com `Input.insertText` + Enter reais na
conversa cujo título casa com a regex e espera a bolha azul **Entregue** e a resposta do
agente (gasta tokens: usar uma conversa de teste). Validado no macmini, 2026-09-28:
verificador completo (`--acoes --conversa`) em Chrome; a cena (geometria do "zzz" em
degraus, barra lateral, celular, Atividade) também em Safari 27 (WebKit, via
`safaridriver`) — depois da correção do `transform-box` (armadilha 17); o celular
(`--enviar`) em Chrome.

## 8. `dsh-plugin/src/index.js` — a PARTILHA do Modo jogo (link + QR code, 2026-09-29)

O botão **Partilhar ▾** (toolbar, **SÓ desktop** — não existe no modo telemóvel) gera um
link público + **QR code** para alguém abrir o Modo jogo; o link **fica online até o botão
"Fechar a ação"** o derrubar (mais nada o fecha: sair do Modo jogo ou fechar o painel não
tocam no link). O `src/index.js` — até aqui "sem efeitos no host" — ganha UM efeito: a rota
exacta **`/api/dsh-work-game/partilha`** no canal partilhado `/api` do DSH.

| Método | Corpo | Faz | Resposta |
|---|---|---|---|
| `GET` | — | estado da partilha | `{ok, ativo, host?, url?, qr?}` |
| `POST` | `{acao:'abrir'}` | publica o link (túnel Cloudflare) | `{ok, url, host, probe, aviso?, qr}` |
| `POST` | `{acao:'fechar'}` | derruba o link (`down` do host) | `{ok, host}` ou `{ok:true, ja:true}` |
| `POST` | `{acao:'encerrar'}` | **"Encerrar o Cloudflare"**: `down all` — a partilha E as rotas permanentes ficam offline, o túnel para | `{ok, encerrado, hosts[]}` |

- **Transporte e segurança**: o canal `/api` aplica ANTES do dispatch a vedação Host/Origin
  e a autenticação de browser do DSH (`connection.requestRejection`) — sem sessão válida o
  pedido nem chega ao handler. O handler exige `content-type: application/json` no POST e
  devolve 415/400/500 com `erro` legível (nunca traceback). Erro de dependência:
  `{ok:false, erro:'domain.py não encontrado (embutido em dsh-plugin/expose-port)', solucao:'…'}`.
- **Alvo construído NO HOST**: `alvoDePartilha(ctx)` = `connection.authenticatedUrl('http://127.0.0.1:<porto do webServer>/')`
  + `#jogo` — o URL local COM `?token=<token do processo>` (o telemóvel troca-o por cookie
  e cai em `/`) e a âncora `#jogo`, que sobrevive ao redirect e abre já o Modo jogo. O
  browser **não** escolhe o alvo nem o nome do host.
- **Túnel**: `python3 <domain.py> up '<alvo>' --name jogo --json` — o `domain.py` está
  **EMBUTIDO** no plugin (`dsh-plugin/expose-port/`, toolkit vendored da
  cloudflare-agent-skill em 2026-09-30): a funcionalidade Cloudflare viaja COM o plugin e
  não depende de nenhuma skill instalada. Candidatos (por ordem):
  `DSH_WORK_GAME_EXPOSE_PORT` (override) > o embutido > a skill instalada (recurso legado:
  `~/.dsh/skills`, `~/.agents/skills`, `~/Agent-Skills`). O host público é **efémero** `jogo.<domínio>`
  (label muda com `DSH_WORK_GAME_SHARE_NAME`) — **nunca** se reutiliza uma rota existente e
  **nunca** se passa `--persist`. `fechar` corre `down <host EXACTO> --json`: `all` ou a
  porta do upstream derrubariam também as rotas permanentes do utilizador (ex.: `kluser.me`)
  — os testes garantem que nenhum comando leva `all` nem a porta.
- **"Encerrar o Cloudflare"** (ação `encerrar`) é a ÚNICA exceção e a ÚNICA ação destrutiva
  do plugin (pedido explícito do utilizador, 2026-09-29): `down all` — o link da partilha e
  **todas** as rotas publicadas pela máquina ficam offline e o túnel para; nada é apagado da
  conta Cloudflare (reativa-se com `up`). No cliente fica numa zona própria do painel, atrás
  de confirmação em DOIS cliques ("Confirmar: tudo fica offline" + "Cancelar") e com o aviso
  de que derruba mais do que a partilha. Com o túnel parado, os hosts mortos respondem **530**
  da edge (não 404: o 404 é do router, com o túnel ainda vivo) — verificado ao vivo.
- **QR code**: `qrencode -t PNG` → `data:image/png;base64,…` (desenhado com `<img>`, nunca
  `innerHTML`); recurso ao `segno` SVG **validado** (`^<svg…</svg>$`, sem `<script`/`on*=`),
  rejeitado no cliente por `qrSeguro`. Sem ferramenta → o link aparece na mesma, sem QR.
- **Cliente** (`client.js`): estado puro em `partilhaReduz` (fases `parado | a-gerar |
  online | a-fechar | a-encerrar | erro`), painel `MenuPartilha` no estilo do menu de filtros
  (link selecionável, **Copiar link**, **Fechar a ação**, aviso de confiança "quem tem o link
  acede à UI do DSH neste computador" e a zona destrutiva **"Encerrar o Cloudflare"** com
  confirmação em dois cliques), ponto verde no botão enquanto o link está online, nota de
  confirmação depois de encerrar e `estado` relido do host ao abrir o painel (a partilha pode
  já estar online de antes).
- **Testes**: `tests/plugin/partilha.test.mjs` (comando injetável — sem rede): ciclo
  abrir→online→fechar, `down` sempre com o host exacto (e `all` SÓ em `encerrar`), rotas
  permanentes ignoradas, contrato de erros da rota, QR seguro e a guarda "só desktop"
  (`celular ? null : …`). Verificação ao vivo: `scripts/verify-partilha.mjs [--encerrar]`.
