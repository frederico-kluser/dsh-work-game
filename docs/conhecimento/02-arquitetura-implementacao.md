# Arquitetura e implementação do front-end (dsh-work-game)

Estado verificado em 2026-09-27.

## Visão geral

O dsh-work-game é um escritório 2D de agentes construído como front-end puro — HTML, CSS,
JavaScript e SVG, sem framework, sem ferramenta de build e sem backend. Tudo roda em memória no
navegador: nomes, frases, times, tarefas e números de contexto são dados simulados de
apresentação. O runtime é 100% local e offline, com zero requisições externas. Para servir, use um
servidor estático (`python3 -m http.server 4173 --bind 127.0.0.1`); abrir via `file://` deve ser
evitado, pois navegadores bloqueiam referências entre arquivos SVG (sprites externos via
`<use href>`). A cena é um único SVG ("mundo") posicionado por CSS transform dentro de um
viewport; o estado vive num objeto simples e a interface é re-renderizada por templates de string.

## Ficheiros e responsabilidades

- `index.html` — esqueleto da página: cabeçalho com estatísticas, viewport da sala, inspetor
  lateral e três diálogos (`<dialog>`) para novo time, recrutamento e delegação.
- `styles.css` — todo o visual, incluindo animações dos balões e a mídia `prefers-reduced-motion`;
  nenhuma fonte ou estilo externo.
- `app.js` — núcleo da aplicação: store, grade, renderização SVG, balões, motor de atividade
  simulada, câmera e interações.
- `data.js` — dados simulados: nomes, outputs (`kind` + texto) e tarefas de exemplo.
- `expressions.js` — expõe `window.DSH_EXPRESSIONS` (identidades nomeadas/aleatórias e presets de
  expressão Avataaars); `app.js` traz um fallback equivalente caso o arquivo falte.
- `assets/furniture.svg` — sprite com mesa, cadeira, notebook, conector e ícones, referenciado por
  `<use href="assets/furniture.svg#id">`.
- `assets/desk-module.svg` e `assets/favicon.svg` — mesa independente e favicon.
- `assets/avatars/**` — SVGs Avataaars locais (identidades nomeadas e, sob `expressions/`, os
  presets por identidade).

## Modelo de dados

`state` contém `teams[]`, `modules[]`, `people[]`, `bubbles` (Map) e a interface: `selected`,
`tab`, `zoom`, `pan`. Módulo = `{id, teamId, kind:'main'|'expansion'|'delegation', seats[4]}`;
cada seat é `personId`, `null` (livre) ou `'reserved'`. Pessoa =
`{id, name, avatarId, avatarKind('named'|'random'), teamId, homeModuleId, homeSeat, away, status,
context, hasComputer, task, outputs[], expressionPreset}`. Os estados são `available`, `working`,
`tool`, `waiting`, `error` e `done`, cada um com label, cor, ícone e preset de expressão mapeado
(`idle`/`working`/`tool`/`waiting`/`error`/`success`). Não existe conceito de cargo.

## Grade e expansão de mesas

Grade de 3 colunas × linhas infinitas: `GRID = {cols:3, pitchX:940, pitchY:730, originX:40,
originY:40}` e `gridPos(index)` → `col = index % 3`, `row = floor(index / 3)`. A largura do mundo é
fixa em 3 colunas; as linhas crescem conforme entram módulos. Cada módulo desenha a mesa com 900
unidades (pitch horizontal do desenho) mais folga dentro dos 940 de passo da grade, com 4 cadeiras
espaçadas 225 unidades (`cx = 112.5 + seatIndex * 225`).

A lista `state.modules` mantém os módulos de cada time consecutivos: principal, expansões e, por
fim, delegações. `growTeam(teamId)` insere uma expansão em `mainIndex + 1` — empurrando para a
direita todos os módulos seguintes do time, inclusive a mesa de equipe. `appendDelegationModule(teamId)`
insere em `teamRunEnd(teamId) + 1`, no fim do bloco do time, de forma que uma expansão futura ainda
os possa empurrar. A cadeira `'reserved'` marca o lugar original de um coordenador em delegação: o
avatar nunca é duplicado e o lugar mostra o nome mais "Lugar reservado / Em delegação ↗".

## Balões de output

`state.bubbles` (Map `personId → {text, kind, phase:'in', stamp}`) guarda só o output mais recente
de cada pessoa. `syncBubbles()` faz diff do DOM em `#bubbles-layer` — cria, atualiza e remove nós
`g[data-bubble]` — em vez de reconstruir o mundo todo, para não repetir as animações. Ciclo:
aparece (entrada) → 1000 ms → `phase:'out'` (animação de saída) → +300 ms é removido. `wrapText`
limita o texto a 2 linhas × 26 caracteres. Posição: `gridPos` do módulo + `seatCx`,
`y = gridY + 128`; a caixa fica centrada nesse ponto, com o rabo apontando para a pessoa. As
classes CSS `bubble-in`/`bubble-out` respeitam `prefers-reduced-motion`.

## Motor de atividade

`scheduleActivity()` reagenda `activityTick` com `setTimeout` aleatório de 1,7–3,4 s. O tick
escolhe uma pessoa com `hasComputer && !away`; com 42% de probabilidade muda-lhe o status e depois
sempre emite um output filtrado por `kindMatchesStatus` (`tool→tool/file`, `working→file/tool`,
`done→result/test`, `error→message/result`, `waiting→message`). `emitOutput` guarda o histórico
(máx. 24 itens por pessoa) e abre o balão. O mapeamento status → preset decide a expressão base, e
o `kind` do output dá o toque final (ferramentas puxam para `tool`, resultados para `success`).

## Câmera e acessibilidade básica

Zoom de 0,16 a 1,5 e pan por CSS transform em `#world`; `fitScene` calcula o zoom pelo viewport e
centra a cena. O wheel com `ctrl`/`meta` dá zoom ancorado no cursor (`zoomAt`), sem eles dá pan; o
arraste usa `setPointerCapture`; o teclado oferece `+`/`−`/`0` e as setas. O handler `focusin`
mantém o elemento focado visível sem scroll nativo, e `.viewport` usa `overflow:clip` para impedir
que o scroll nativo duplique o pan. O inspetor lateral tem as abas Contexto / Computador /
Expressões: o contexto simulado se divide em conversa 44%, arquivos 27%, ferramentas 13% e
instruções 16% sobre uma capacidade de 128k, sempre rotulado como simulado.

## Delegação

`delegate(personId, count)` cria (ou estende) um módulo `delegation`: a cadeira de origem vira
`'reserved'`, o coordenador senta-se no primeiro lugar livre (lugar 0 em módulo novo) e os
subagentes — pessoas aleatórias com computador e contexto — preenchem os lugares restantes; mais
filhos do que lugares gera novos módulos de delegação. `returnTeam(teamId)` remove os filhos e os
módulos de delegação, repõe o coordenador na cadeira de origem com status `done`, limpa o preset
manual e soma os resultados ao contador `team.completed`, com animação de transferência do único
avatar (nunca um clone).

## Limitações

Tudo é simulação de apresentação: não há agentes, chamadas de modelo, ferramentas nem acesso ao
sistema de arquivos; números de contexto, tarefas e outputs são fictícios e rotulados como tal. O
sprite de mobiliário é obrigatório para a cena, mas `expressions.js` e os avatares têm caminhos de
fallback. Não há persistência: recarregar a página ou "Recomeçar" restaura a cena inicial. Sem
testes automatizados nem processo de build — a verificação é manual, via servidor estático local.