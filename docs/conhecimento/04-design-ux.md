# Design e UX — dsh-work-game (escritório 2D de agentes)

Material factual de decisões de design/UX aprovadas pelo utilizador (2026-09-27). PT-BR.

## Direção visual

Direção aprovada: **cartoon 2D contemporâneo, flat, geométrico e divertido** — "divertido e
simples como são os desenhos novos", sem efeitos. Cores totalmente chapadas, formas
arredondadas, contornos limpos e poucos detalhes. Cada elemento deve ser legível à primeira
olhadela, com silhuetas simples e hierarquia clara entre sala, mesas, avatares e etiquetas.

Explicitamente **PROIBIDO**: gradientes, sombras, texturas, madeira com veios, reflexos,
brilho/glow, blur, granulação, glassmorphism, volume 3D, claymorphism, isometria elaborada e
pixel art misturado. Se um efeito destes aparecer num rascunho, é removido — não é "polimento".

## Porquê da simplicidade

Quase tudo é construído à mão em SVG: mesas, computadores, cadeiras, fichas, balões e o próprio
layout da sala. Só os rostos (Avataaars) vêm prontos. Efeitos como gradientes, sombras ou
volumes multiplicariam o custo de cada forma desenhada à mão, quebrariam a coerência entre
elementos e tornariam a manutenção do SVG frágil. A imagem gerada durante o design é apenas
**referência de composição** — nunca um ativo de produção; nada do que lá aparece é copiado tal
e qual para o código.

## Regras de legibilidade

### Rostos (regra de ouro)

Os rostos têm de estar **sempre visíveis**. A mesa é de 4 lugares em **U raso/arco aberto para a
câmara**, com duas posições centrais e duas laterais ligeiramente anguladas. Uma mesa realista
com pessoas em lados opostos mostraria as costas de metade do time e esconderia as expressões —
a leitura das expressões é o ponto do jogo, pelo que a composição sacrifica o realismo a favor
da visibilidade.

### Computadores

O teclado/tampo volta-se para a pessoa; o observador vê a **traseira da tampa**, que fica
abaixo do queixo do avatar. Nunca cobrir olhos ou boca. O conteúdo real dos ecrãs lê-se num
**painel 2D lateral**, não em telas minúsculas em perspectiva — texto em ecrã inclinado seria
ilegível e só decoraria.

### Fichas (labels)

Cada ficha mostra: **nome grande + uma linha curta + estado com cor**. Não existe conceito de
cargo/função — foi removido a pedido do utilizador. A ficha deve ser compreensível sem leitura
detalhada: o nome identifica, a linha curta resume o que se passa, a cor dá o estado.

## Semântica de CTX e estados

**CTX** é uma barra/valor de **OCUPAÇÃO simulada de contexto** — nunca vida, energia, custo ou
progresso da tarefa. É uma simulação visual, pelo que todo o texto associado é fictício e
rotulado como simulado. Usar `~` para estimativas (ex.: `CTX ~34%`). Sem dados disponíveis,
mostrar `CTX —`; **nunca** inventar `0%` nem desenhar barra preenchida falsa.

**Estado é SEMPRE ícone + rótulo + cor** — a cor nunca aparece sozinha (princípio WCAG "use of
color", acessível a daltonismo e a leitura a preto e branco). Estados definidos: **Disponível,
Trabalhando, Executando ferramenta, Aguardando, Precisa de atenção, Concluído**. Cada estado tem
ícone distinto e rótulo textual; a cor é reforço, nunca o único portador de significado.

## Balões

O balão de output mostra **só a última saída**: é substituído apenas quando chega uma nova —
nunca é um mural de balões simultâneos. Duração ~1 s, com animação de entrada/saída discreta.
Cada balão traz uma etiqueta curta do tipo: `FILE` / `TOOL` / `TEST` / `RESULT` / `MESSAGE`, para
o tipo de saída ser reconhecido sem ler o conteúdo.

## Layout e acessibilidade

Sem sidebar e sem cabeçalho por sala — apenas um **header global** (marca, contadores, ações). A
sala é o elemento principal da composição e ocupa a atenção. Alvos generosos: **~44×44 px CSS**
como alvo confortável, mínimo AA 24×24 apenas com condições. Oferecer alternativas de teclado e
*pan* para quem não arrasta (arrastar não pode ser o único caminho). Respeitar
`prefers-reduced-motion`. O **foco nunca deve saltar** por causa de animações.

**Crescimento da mesa**: a mesa nova nasce ao lado da mesa principal e **desliza os módulos
seguintes do time para a direita** — a mudança deve ser compreensível, não confusa; o bloco do
time mantém-se contíguo. **Delegação**: a hierarquia comunica-se por **proximidade + rótulos**
(mesa de equipe encostada), sem teia de linhas; a cadeira do coordenador fica reservada para
evitar avatar duplicado.

## Checklist de validação visual

- [ ] Cores 100% chapadas: sem gradiente, sombra, textura, glow, blur ou granulação em nenhum elemento.
- [ ] Sem madeira com veios, reflexos, glassmorphism, volume 3D/claymorphism, isometria elaborada ou pixel art misturado.
- [ ] Formas arredondadas, contornos limpos, poucos detalhes; silhueta legível de longe.
- [ ] Todos os rostos visíveis: mesa em U raso/arco aberto para a câmara (2 centrais + 2 laterais anguladas).
- [ ] Ninguém de costas para a câmara; nenhum objeto cobre olhos ou boca.
- [ ] Computadores com teclado/tampo para a pessoa e traseira da tampa abaixo do queixo; conteúdo real em painel 2D lateral.
- [ ] Fichas com nome grande + linha curta + estado; sem cargo/função.
- [ ] CTX como ocupação simulada: `~` em estimativas, `CTX —` sem dados, nunca 0% inventado nem barra falsa; texto rotulado como simulado.
- [ ] Estado sempre com ícone + rótulo + cor (cor nunca sozinha); apenas os 6 estados definidos.
- [ ] Um único balão de output por vez, com etiqueta FILE/TOOL/TEST/RESULT/MESSAGE e ~1 s de duração.
- [ ] Só header global (marca, contadores, ações); sem sidebar nem cabeçalho por sala.
- [ ] Alvos ≥ 44×44 px CSS (mínimo AA 24×24 só com condições); alternativas de teclado e pan; `prefers-reduced-motion` respeitado; foco estável.
- [ ] Mesa nova desliza o time para a direita mantendo o bloco contíguo; delegação por proximidade + rótulos, sem teia de linhas; cadeira do coordenador reservada.
- [ ] A imagem gerada foi usada só como referência de composição — nada copiado para ativo de produção.
