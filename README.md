# dsh-work-game — o escritório 2D dos seus agentes

**Front-end puro em HTML, CSS, JavaScript e SVG — zero dependências, zero build, zero backend.** Uma sala onde times de agentes trabalham lado a lado, com mesas modulares, balões de output e expressões que mudam com o estado de cada pessoa. Duas formas de a ver: a **demo** (tudo simulado em memória) e o **Modo jogo** dentro do DeepSeek Harness (DSH), com as conversas e os workspaces reais.

![Escritório 2D com mesas de 4 cadeiras, pessoas com avatares e balões de output](demo-preview.png)

## O que é

**dsh-work-game** visualiza um "escritório 2D" de agentes: uma única sala com as mesas de todos os times, pessoas sentadas, balões de output e painéis de contexto. Existe para mostrar como *parece* um time de agentes a trabalhar lado a lado — e para ser divertido de olhar.

- **A demo** ([index.html](index.html)) é uma demonstração visual: nomes, avatares, tarefas, linhas de output, ocupação de contexto e delegações são gerados e mantidos em memória, no navegador.
- **O plugin do DSH** ([dsh-plugin/](dsh-plugin/)) põe a mesma sala dentro da UI web do DSH, no botão **Modo jogo** do pé da barra lateral: cada **workspace** vira uma mesa e cada **conversa** vira uma pessoa, com a telemetria real do harness (ver [Plugin do DSH — Modo jogo](#plugin-do-dsh--modo-jogo)).

## O que não é

Para não criar expectativas erradas:

- **A demo não tem backend**, não executa agentes reais e não faz chamadas externas em runtime: nenhuma tarefa é enviada, nenhum modelo é chamado e nada é persistido.
- **O plugin não inventa nada nem age sozinho**: só mostra o que o DSH publica e só mexe no DSH quando você clica em **Abrir conversa** ou **Nova sessão** (as mesmas ações da barra lateral do DSH).

### Fidelidade ao DSH — a UI adapta-se ao harness, nunca o contrário

- **Nova sessão** e **Enviar tarefa** existem porque o DSH suporta essas ações de verdade.
- **Ninguém é movido à mão.** Uma pessoa só vai para a mesa de equipe quando a sessão **realmente chama subagentes** (`subagent/start`), e volta quando a delegação termina (`subagent/end`).
- Estados, expressões, balões, contexto e custo derivam sempre de eventos reais. O **Simulador de eventos DSH** existe só na demo offline e injeta exatamente os eventos que o harness emite — para você ver a cena responder sem inventar interações impossíveis.

## Como experimentar

- **Enquadrar a sala** — arraste o fundo para dar *pan*; use `+`, `−`, **Enquadrar**, `Ctrl` + scroll e as setas do teclado para o zoom. A sala é uma só: todas as mesas de todos os times numa grade de 3 colunas que continua para baixo, linha após linha.
- **Criar um time** — o diálogo **Novo time** pede nome, caminho visual e cor da mesa. O time nasce com uma mesa principal e lugares vazios.
- **Recrutar uma pessoa** — **Recrutar pessoa** sorteia nome e avatar totalmente aleatórios; **Sortear outro** refaz o sorteio, e você escolhe o time de destino.
- **Crescer o escritório** — cada mesa tem exatamente 4 lugares. Quando todos os lugares do time estão ocupados e você adiciona mais uma pessoa, nasce uma nova mesa ao lado da mesa principal do time e as mesas seguintes (inclusive a de equipe) são empurradas para a direita, abrindo mais 4 lugares.
- **Ler os balões de output** — a última saída de cada pessoa aparece como balão acima da cabeça: somente a mais nova substitui a anterior, ela fica 1 segundo e some com animação de entrada e saída.
- **Abrir o painel de uma pessoa** — clique nela para ver o visualizador de contexto (janela de tokens simulada, com composição e mapa) e a aba **Computador** (tarefa simulada, atividade e controles de estado visual).
- **Ver quanto cada agente gasta** — cada ficha traz `CTX ~22% · US$ 0,09 · 38 tok/s`; o painel detalha os 4 buckets de tokens (`entrada`, `saída`, `cache de leitura`, `cache de escrita`), o gasto acumulado, a velocidade de tokens, o pico de contexto e o modelo (a troca de modelo recalcula a janela e o preço). Cada mesa também mostra o gasto total dos seus lugares.
- **Acompanhar o contexto com aviso de 200k** — quando alguém passa de **200k de contexto**, a ficha ganha um marcador ⚠, o rótulo acessível avisa e o painel mostra o banner "compactação recomendada".
- **Responder perguntas** — quem pergunta recebe um **sinalizador ❓ sobre a cabeça**; ao clicar, a pergunta abre **embaixo da tela** com as opções, um campo de resposta livre, **o boneco e o nome de quem perguntou embaixo**, e um **sombreado sobre o resto da tela**. "Responder depois" não responde; cancelar é uma ação explícita.
- **Ver quem terminou** — o fim de turno aparece com uma **fita verde "Concluído · resultado pronto"** na ficha (e variantes para interrompido, erro, bloqueado e máx. tokens), além de ficar registado na aba **Atividade**. Uma tarefa nova aposenta o sinal.
- **Montar a pilha de papéis** — mais uma tarefa entra na fila como um **papel na mesa**, acumulando em cima. Clicar na pilha abre os prompts: **editáveis enquanto não forem submetidos**, com **Submeter agora** por papel e mais um campo para empilhar outro.
- **Consultar o Arquivo** — quem é eliminado sai da sala mas fica no **Arquivo** do cabeçalho, com gastos, tokens, pico de contexto, ações e papéis preservados (incluindo subagentes recolhidos no fim de uma delegação).
- **Ver as ações em tempo real** — o painel **Ações em tempo real** mostra cada evento assim que acontece (com hora e quem fez); clicar numa ação abre a pessoa. A aba **Atividade** traz o mesmo histórico por pessoa.
- **Testar expressões ao vivo** — o painel permite trocar a expressão e conferir cada preset no rosto da pessoa.
- **Montar uma equipe** — o diálogo **Montar equipe** pergunta quantos subagentes você quer. O coordenador sai da cadeira original (que fica reservada, sem duplicar o avatar) e vai para a mesa de equipe encostada, onde os subagentes ocupam os outros lugares. Ao retornar, a mesa de equipe recolhe e os resultados ficam registrados na demo.
- **Recomeçar demo** — o botão do cabeçalho restaura o exemplo inicial.

O painel de contexto — números fictícios, sempre rotulados como simulados:

![Painel lateral de uma pessoa com o visualizador de contexto simulado](demo-contexto.png)

O cabeçalho global traz a marca e as ações **Novo time**, **Recrutar pessoa**, **Recomeçar demo**, o contador **N a aguardar de ti** (perguntas pendentes) e o **Arquivo** dos eliminados. Não há sidebar lateral nem cabeçalho por sala.

## Como rodar

Na pasta do projeto:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Abra **http://127.0.0.1:4173**. É só isso: sem `npm install`, sem build, sem chave de API.

Use HTTP local em vez de abrir o `index.html` por `file://` — navegadores restringem referências entre arquivos SVG nesse modo e partes da cena não carregam.

## Plugin do DSH — Modo jogo

O plugin ([dsh-plugin/](dsh-plugin/)) é um bundle Cordis para a UI web do DSH (testado na `0.1.6-alpha.2`). Instale-o **por link**, para o DSH servir sempre o código atual do repositório:

```bash
dsh plugin --profile web add link:/caminho/para/dsh-work-game/dsh-plugin
dsh --profile web          # ou deixe o que já está a correr: o client-hmr recarrega o plugin
```

> Instalar com `file:` faz uma **cópia** congelada no perfil (`~/.dsh/profiles/web/node_modules`): o DSH passa a servir essa cópia antiga mesmo depois de o repositório mudar — foi exatamente o que deixou bonecos e workspaces a faltar. Com `link:` não há cópia.

No **Modo jogo** (pé da barra lateral, ao lado de Settings) a sala mostra:

- **Uma mesa por workspace do DSH**, na ordem do DSH, com o título e o caminho — as cores alternam azul/verde/coral como na demo. Cada conversa senta-se na mesa do workspace que a reclama (a mesma regra da barra lateral); as conversas sem workspace vão para **Sem workspace** (o *Ungrouped* do DSH). Um workspace vazio aparece com os seus 4 lugares livres. Sem o serviço de workspaces, a sala agrupa por pasta.
- **Uma pessoa por conversa visível**: subagentes, conversas arquivadas e conversas ainda em branco não têm lugar próprio — como na barra do DSH. Cada pessoa tem um nome curto e um boneco Avataaars estáveis (guardados no navegador); o título da conversa aparece no tooltip e no inspetor.
- **Estado real**: quem está a correr aparece **Trabalhando**; os outros, **Disponível**. A ficha traz contexto (`CTX`), custo estimado e velocidade de tokens a partir das projeções do DSH (sem dado, mostra `—`).
- **Delegação em curso**: quando uma conversa corre subagentes, ela senta-se na **mesa violeta "Equipe de …"** com eles e o lugar de casa fica **reservado** ("Em delegação ↗").
- **Ações reais**: clicar numa pessoa abre o inspetor, com **Abrir conversa**; **Nova sessão** e os **lugares livres** de uma mesa abrem uma conversa nova naquele workspace. Arrastar explora a sala; `Ctrl` + scroll faz zoom.

Validar num DSH web real (Chrome, Chromium ou Brave via `CHROME_PATH`):

```bash
node scripts/verify-dsh-panel.mjs "http://127.0.0.1:<porta>/?token=<token>" [pasta] [--acoes] [--recrutar]
```

O verificador abre o painel e confirma workspaces → mesas, bonecos desenhados (cada `<use>` com o seu `<symbol>`, sem referências partidas), inspetor, clique/arraste com rato real e zero erros de consola. Os contratos e as fontes verificadas no código do DSH estão em [docs/contratos-plugin.md](docs/contratos-plugin.md) e [docs/integracao-dsh.md](docs/integracao-dsh.md).

## Estrutura do repositório

- [index.html](index.html), [styles.css](styles.css) e [app.js](app.js) — o app completo, sem build.
- [package.json](package.json) — conveniência: `npm test` e `npm start`, sem qualquer dependência.
- [data.js](data.js) — nomes e frases simuladas.
- [expressions.js](expressions.js) — presets de expressão (enums do Avataaars) e resolução dos assets.
- [tests/](tests/) — suíte de testes (funcionais em Chrome headless + estáticos/contratos) com helpers sem dependências.
- [dsh-plugin/](dsh-plugin/) — o plugin do DSH: [client.js](dsh-plugin/src/client.js) (bundle do browser: sala, estado e painel), [surface.js](dsh-plugin/src/surface.js) (a ponte com as sessões e os workspaces reais, embutida no bundle) e o manifesto em [package.json](dsh-plugin/package.json).
- [scripts/verify-dsh-panel.mjs](scripts/verify-dsh-panel.mjs) — verificador do Modo jogo num DSH web real, com capturas de evidência.
- [scripts/demo-session.mjs](scripts/demo-session.mjs) — sessão simulada de ponta a ponta (tarefas, pergunta, pilha de papéis, fim de turno, aviso de 200k e Arquivo) com capturas de evidência: `node scripts/demo-session.mjs`.
- [docs/conhecimento/](docs/conhecimento/) — dossiês do projeto: decisões, arquitetura, pipeline de avatares, design, qualidade, publicação e as features futuras especificadas.
- [AGENTS.md](AGENTS.md) — bloco que liga os agentes à memória CoALA local do projeto.
- [assets/furniture.svg](assets/furniture.svg) — móveis e ícones SVG reutilizáveis.
- [assets/desk-module.svg](assets/desk-module.svg) — módulo de mesa independente, com 4 cadeiras.
- [assets/avatars/](assets/avatars/) — as 8 identidades nomeadas de avatar, em SVG.
- [assets/avatars/expressions/](assets/avatars/expressions/) e [assets/avatars/random/](assets/avatars/random/) — variantes de expressão por identidade e identidades aleatórias.
- [assets/AVATARS-SOURCES.md](assets/AVATARS-SOURCES.md), [assets/AVATARS-EXPRESSIONS.md](assets/AVATARS-EXPRESSIONS.md) e [assets/AVATAARS-LICENSE.txt](assets/AVATAARS-LICENSE.txt) — proveniência e licença dos avatares.
- [demo-preview.png](demo-preview.png) e [demo-contexto.png](demo-contexto.png) — capturas da demo.
- [LICENSE](LICENSE) e [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — MIT para o código e atribuições de terceiros.

## Arquitetura: uma sala, módulos SVG

A cena é montada a partir de módulos SVG numa grade de **3 colunas × linhas infinitas**. Cada time ocupa uma sequência contígua de módulos — mesa principal, mesas de expansão e, havendo delegação, a mesa de equipe — avançando da esquerda para a direita; quando a linha enche, a sequência continua na linha seguinte.

- **Módulo de mesa.** Cada mesa tem exatamente 4 cadeiras e ocupa um *pitch* de **900 unidades** horizontais. Crescer é repetir o mesmo símbolo deslocado em `900 × índice` — nenhuma mesa anterior precisa ser redesenhada.
- **Cor por variáveis CSS.** As variáveis de cor (`--desk-color`, `--desk-panel`, `--desk-stroke`) parametrizam a aparência das mesas por time: mudar a paleta é mudar um valor, não um desenho.
- **SVG reutilizável.** Móveis, cadeiras, notebooks e ícones vivem em [assets/furniture.svg](assets/furniture.svg) e são referenciados por `<use>`; o [módulo de mesa](assets/desk-module.svg) também funciona sozinho.

## Expressões com os enums do Avataaars

Cada pessoa muda de rosto conforme o estado — disponível, trabalhando, *tool call*, sucesso, erro, espera de aprovação e outros. Os presets são descritos com os **enums reais da biblioteca Avataaars** (`eyeType`, `eyebrowType`, `mouthType`) e materializados como **variantes SVG locais por identidade**: cada pessoa tem suas próprias expressões, sem depender de rede.

O painel lateral traz um teste de expressões ao vivo: escolha um preset e veja o rosto mudar na hora. Os detalhes das variantes estão em [assets/AVATARS-EXPRESSIONS.md](assets/AVATARS-EXPRESSIONS.md).

## Dados simulados e limitações

- Tudo é simulado em memória: nomes, avatares, tarefas, ocupação de contexto e resultados de delegação. Um pequeno motor de atividade emite linhas de output (arquivos, ferramentas, testes, resultados) para dar vida à cena.
- Os números do visualizador de contexto são **fictícios e rotulados como simulados** no próprio painel; não representam consumo real de tokens.
- **Gasto, velocidade de tokens, custo por mesa e custo por bucket são estimativas simuladas** (tabela de preços própria, rotulada no painel). Os buckets seguem o vocabulário real do DSH (`input` não-cacheado, `output`, `cacheRead`, `cacheWrite`) para a migração futura ser direta — mas nada é cobrado.
- Nome e avatar são totalmente aleatórios: não há conceito de cargo ou função.
- Nada é persistido — recarregar a página ou clicar em **Recomeçar demo** restaura o exemplo (inclusive o Arquivo e o feed).
- Todos os assets são locais: nenhuma chamada externa em runtime.

## Testes

A suíte cobre **todas as funcionalidades** — não linhas de código: cada comportamento visível da demo tem pelo menos um teste. Sem dependências npm: usa o runner nativo do Node e Chrome/Chromium headless via CDP.

```bash
node --test 'tests/**/*.test.mjs'   # ou: npm test
```

- **`tests/functional.test.mjs`** — 18 testes funcionais contra a página real: arranque e cena-semente; ausência de sidebar/cabeçalho de sala; fichas sem cargo; seleção e inspetor; contexto simulado (`~`, `CTX —`, mapa); computador e primeira tarefa; os 6 estados com rótulo/ícone/marcador; os 14 presets de expressão com troca real do rosto; recrutamento aleatório com "Sortear outro"; crescimento de mesa com empurrão da mesa de equipe; criação de time; delegação com cadeira reservada e sem avatar duplicado; retorno com resultados preservados; balões (substituição e expiração ~1s); câmera (zoom, enquadrar, arraste, teclado, sem scroll nativo); recomeçar demo; mobile 390×844; e offline (zero requisições externas e zero erros de consola).
- **`tests/features.test.mjs`** — 7 testes das features de telemetria e pipeline: gasto/velocidade por agente e acumulação real do contador; aviso de contexto acima de 200k (cena + painel + rótulo acessível); pergunta (sinalizador → sheet com opções, input, quem perguntou embaixo e sombreado; responder/cancelar/responder depois); fim de turno (fita de conclusão, razões de `turn/end`, aposentadoria do sinal); pilha de papéis (fila editável, submeter agora, remover); Arquivo de eliminados (histórico preservado, inclusive subagentes recolhidos); e feed de ações em tempo real.
- **`tests/static-assets.test.mjs`** e **`tests/contracts.test.mjs`** — validação dos 160 SVGs (XML, viewBox, sem scripts/recursos externos), contratos de `data.js` e `expressions.js` (incluindo os enums reais do Avataaars e a cadeia de fallback), estrutura do `index.html` e links do README.
- **`tests/plugin/`** — o plugin do DSH: a ponte com sessões e workspaces (deltas de uso, delegação só com subagentes a correr, ligação tardia aos workspaces e paridade bundle ↔ `surface.js`), a distribuição pela sala (uma mesa por workspace, visibilidade da barra do DSH, mesa de delegação) e a cena (geometria e cores da demo, bonecos por `<symbol>`, referências resolvidas e a arte byte a byte igual à da demo).
- **`tests/helpers/`** — servidor HTTP estático e driver CDP, ambos apenas com stdlib do Node.

Para correr os testes funcionais é preciso um Chrome/Chromium no sistema (`CHROME_PATH` aponta para o executável quando não está no `PATH`).

## Roadmap

1. **Frontend de demonstração** — a sala, as mesas, os balões, os painéis e as expressões, 100% simulados.
2. **Modo jogo no DSH** — feito: workspaces e conversas reais, estado a correr, contexto, custo, velocidade, delegação em curso e as ações Abrir conversa / Nova sessão.
3. **Eventos finos em tempo real** — ferramentas, perguntas, aprovações e fim de turno por conversa (os eventos de fio do DSH), para a sala ganhar os balões e as fitas que a demo já desenha.

## Licenças e créditos

- **Código**: [MIT](LICENSE).
- **Avataaars**: bustos e expressões baseados na biblioteca [Avataaars](https://github.com/fangpenlin/avataaars) — design original de **Pablo Stanley**, implementação de **Fang-Pen Lin** — sob licença MIT.
- **avataaars.io** foi usado apenas para baixar os SVGs durante o desenvolvimento; a demo não consulta o serviço em runtime.
- **Atribuições completas**: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); proveniência dos avatares em [assets/AVATARS-SOURCES.md](assets/AVATARS-SOURCES.md) e [assets/AVATARS-EXPRESSIONS.md](assets/AVATARS-EXPRESSIONS.md).

## English summary

**dsh-work-game** is a pure front-end prototype (HTML, CSS, JavaScript and SVG — no dependencies, no build step) that renders a 2D "agent office": one single room where teams sit at modular 4-seat desks arranged in a 3-column grid with infinite rows. People are created with fully random names and Avataaars busts; a small simulated activity engine emits output lines shown as speech bubbles that are replaced only by the newest one and fade after a second; faces change with each person's state using the real Avataaars enums (`eyeType`, `eyebrowType`, `mouthType`) with local SVG variants per identity; clicking a person opens a side panel with a simulated token-context viewer (composition and map, numbers labelled as simulated), a computer tab and a live activity tab. Each person carries simulated telemetry — spend (four token buckets priced by model), token speed and context window with a >200k warning — shown on the seat card, the inspector and the desk total; a live action feed streams every event; an agent that asks a question gets a clickable ❓ flag that opens a bottom sheet with options, a free-text input, the asker's avatar and name below, and a shade over the rest of the screen; turn endings are explicit ribbons ("Concluído · resultado pronto" and variants for aborted/error/blocked/max-tokens); queued tasks stack up as paper piles on the desk, editable until "Submeter agora"; and eliminated agents keep their full history in the Arquivo. A coordinator can delegate to an attached team desk and return. In the demo everything is in-memory and simulated. The same room also ships as a DeepSeek Harness web plugin (`dsh-plugin/`, "Modo jogo" in the sidebar foot): every DSH workspace becomes a desk and every visible conversation a seated person, with real running state, context, estimated cost, token speed, a violet team desk while subagents run, and the real "open conversation" / "new session" actions — install it with `dsh plugin --profile web add link:<repo>/dsh-plugin`. Run the demo with `python3 -m http.server 4173 --bind 127.0.0.1` and open http://127.0.0.1:4173. Code is MIT-licensed; avatars come from the MIT-licensed Avataaars library by Pablo Stanley and Fang-Pen Lin.
