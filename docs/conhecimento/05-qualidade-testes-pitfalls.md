# Qualidade, testes e pitfalls — dsh-work-game

## Como se verifica este projeto

dsh-work-game é front-end puro (sem build, sem framework, sem test runner): a verificação de qualidade
combina cheques estáticos leves com verificação manual/automatizada num Chromium isolado via tool
`bctl` (skill `browser-controll`):

```bash
bctl --session jogo --headless launch --url http://127.0.0.1:4173
```

Comandos usados: `eval` (JS na página — o principal instrumento de asserção), `click`, `type`,
`press`, `wait`, `shot` (captura de ecrã), `cdp Emulation.setDeviceMetricsOverride` (viewport
mobile), `cdp Page.reload {"ignoreCache":true}` (reload sem cache) e `close`.

Fluxo de verificação recomendado: lançar a sessão → inspecionar o estado real via `eval` (DOM e
`state` da app) → interagir (`click`/`type`/`press`) → **confirmar via `eval`** antes de confiar em
qualquer captura → `shot` apenas como registo visual → repetir em mobile com
`setDeviceMetricsOverride` → `Page.reload {"ignoreCache":true}` para provar que o comportamento não
depende de cache → `close`.

Cheques estáticos leves (sem dependências): `node --check` em `app.js`, `data.js` e
`expressions.js`; validação XML dos SVGs (160 ficheiros, todos sem `<script>` nem
`<foreignObject>`); e verificação de zero requisições externas em runtime via
`performance.getEntriesByType("resource")`.

## Cenários cobertos

- **Seed inicial**: 3 módulos, 8 pessoas, 1 cadeira reservada, 3 lugares livres.
- **Recrutamento aleatório**: pessoa nova com nome + avatar `r11`, sem computador, status
  `available`.
- **Crescimento de mesa**: mensagem "Site lotou" → nova mesa inserida a seguir à principal, mesa de
  equipe empurrada para a direita; a API cresceu de 2 para 4 pessoas.
- **Delegação**: 2 subagentes, 2 cadeiras reservadas, avatares únicos, sem duplicação do
  coordenador.
- **Balão de output**: apresenta o texto correto.
- **Expressões**: 14 presets listados e troca real do `href` da imagem (ex.:
  `assets/avatars/expressions/rui/waiting.svg`).
- **Mobile 390×844**: sem overflow horizontal, dialog contido dentro do viewport.
- **Rede**: 0 requisições externas em runtime.
- **Estáticos**: `node --check` nos três JS e validação XML dos 160 SVGs.

## Bugs corrigidos (com lição)

1. **Índice global vs. relativo ao time** — a detecção da mesa de delegação principal comparava o
   índice GLOBAL do módulo com um `findIndex` relativo ao time. Corrigido para comparação de
   identidade: `teamModules(...).filter(kind==='delegation')[0] === mod`. *Lição: comparar
   identidade de objeto, nunca índices de listas com escopos diferentes.*
2. **String de classe malformada** — um ternário dos botões de estado produzia `'active : '' : ''`.
   Corrigido para `person.status === key ? 'active' : ''`. *Lição: classes geradas por ternário
   merecem verificação visual do HTML renderizado.*
3. **Cadeira perdida no recrutamento** — o diálogo de recrutamento perdia a cadeira clicada porque
   `recruitRoll.moduleId` não era passado. Corrigido com propagação do id do módulo em
   `openRecruit` e validação `m.teamId === teamId` ao submeter. *Lição: dados do contexto de um
   diálogo têm de viajar explicitamente até ao submit.*
4. **Bloco de delegação partido** — módulos de delegação eram acrescentados no FIM global,
   quebrando a contiguidade do bloco do time. Criado `appendDelegationModule(teamId)` que insere em
   `teamRunEnd(teamId)+1`. *Lição: invariantes de layout (contiguidade) precisam de função própria
   de inserção.*
5. **`avatarKind` de string vazia** — `makePerson` calculava `avatarKind` a partir de string vazia
   quando o avatar era sorteado. Corrigido calculando a partir do id já resolvido. *Lição: derivar
   sempre de valores resolvidos, nunca de placeholders.*
6. **Área de clique pequena** — só cadeira/laptop/ficha reagiam ao clique. Adicionado retângulo
   transparente de hit de 208×234 por lugar. *Lição: alvo de interação tem de ser generoso,
   sobretudo em SVG.*
7. **Declaração removida por engano** — uma edição removeu `const info = STATUS[...]`; foi reposta.
   *Lição: reler sempre o trecho alterado após `edit`.*
8. **Scroll nativo duplicado** — `overflow:hidden` no viewport permitia scroll duplicado ao focar
   elementos SVG (`scrollTop` 241). Corrigido com `overflow:clip` + handler `focusin` que move a
   câmara para manter o foco visível. *Lição: `hidden` ainda permite scroll programático/foco;
   `clip` não.*

## Armadilhas de automação

- **`shot` após `Page.reload` pode capturar um frame DESATUALIZADO.** Confirmar sempre o estado via
  `eval` do DOM antes de confiar na captura; a imagem é registo, não asserção.
- **Cada pessoa tem DOIS grupos `.seat`** — um só visual (`data-character-id`) e outro interativo
  (`role=button` com ficha). `closest('.seat')` pode devolver o visual. Usar
  `g.seat[role=button][data-agent=…]` ou o estado da app (`state.people`).
- **Em SVG, `transform` como atributo não anima com `transition` CSS.** Animar via Web Animations
  API (`el.animate`) ou propriedade CSS transform.
- **Animação de transferência do coordenador**: medir o bounding rect antes/depois do re-render e
  animar o MESMO elemento (translate + salto de 38px), nunca clonar o avatar; respeitar
  `prefers-reduced-motion`.

## Roteiro manual rápido (10 passos)

1. Servir o projeto em `http://127.0.0.1:4173` e lançar Chromium isolado: `bctl --session jogo
   --headless launch --url http://127.0.0.1:4173`.
2. Confirmar o seed por `eval`: 3 módulos, 8 pessoas, 1 cadeira reservada, 3 lugares livres.
3. Recrutar aleatoriamente e verificar nome + avatar, sem computador, status `available`.
4. Encher a API até "Site lotou" e confirmar: nova mesa a seguir à principal, mesa de equipe à
   direita, API de 2 → 4 pessoas.
5. Delegar: 2 subagentes, 2 cadeiras reservadas, avatares únicos, coordenador não duplicado.
6. Verificar o balão de output (texto correto) e os 14 presets de expressão com troca real do
   `href` da imagem.
7. Testar clique em cada lugar (hit de 208×234) e o diálogo de recrutamento preservando a cadeira
   clicada.
8. Mudar para 390×844 (`cdp Emulation.setDeviceMetricsOverride`): sem overflow horizontal, dialog
   no viewport; focar elementos SVG e confirmar que não há scroll fantasma.
9. `cdp Page.reload {"ignoreCache":true}` e repetir os pontos 2 e 4; confirmar via `eval`, não por
   `shot`.
10. Fechar com `close` e correr os cheques estáticos: `node --check app.js data.js
    expressions.js`, validação XML dos 160 SVGs e 0 requisições externas em runtime.
