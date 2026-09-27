# DSH Office — prompts para OpenAI · cartoon 2D simples para SVG

## Direção corrigida: divertido pelas formas, não pelos efeitos

**Estilo: cartoon 2D contemporâneo, flat, geométrico e expressivo.** Como um desenho animado moderno feito de recortes vetoriais: curvas limpas, formas arredondadas, cores chapadas e poucos detalhes. Divertido, mas não infantilizado; simples, mas não um wireframe sem personalidade.

**Os rostos/bustos Avataaars já vêm prontos.** A referência deve mostrar como encaixá-los na sala, não propor um novo estilo para eles. Mesas, cadeiras, corpos complementares, braços, computadores, cenário, ícones e controles serão construídos com SVG/HTML.

A regra principal é: **se a aparência de um objeto depende de textura, iluminação, sombras ou pinceladas, ele está elaborado demais para esta direção.**

### Vocabulário visual

| Elemento | Como desenhar |
|---|---|
| Mesa | Tampo de cor sólida, retângulo arredondado ou polígono simples, pernas como poucos traços/formas. |
| Cadeira | Encosto arredondado, assento simples e base mínima; sem estofamento realista. |
| Notebook | Tampa como retângulo arredondado e base como faixa/polígono; sem reflexos ou brilho de tela. |
| Corpo complementar | Poucas formas arredondadas; braços curtos, mãos simplificadas, sem anatomia detalhada. |
| Sala | Uma área chapada para parede e outra para piso; sem textura de madeira, rejunte ou iluminação ambiental. |
| Decoração | No máximo poucos objetos grandes e simples, como uma planta de três folhas e uma janela de quatro formas. |
| Interface | Botões chapados, cantos arredondados, rótulos curtos, ícones de poucos traços e foco por contorno. |

- Contornos dos elementos novos em carvão, de espessura média consistente, com pontas arredondadas. Preservar o traço original dos rostos prontos.
- Cerca de 6–8 cores sólidas para cenário e móveis; os avatares mantêm suas próprias cores. Base creme e areia clara, com verde-água, azul lavado, ocre e coral usados com moderação.
- Uma cor de preenchimento por peça; uma segunda cor sólida só quando ajuda a separar tampo/base ou partes funcionais, nunca como sombreamento gradual.
- Profundidade apenas por **sobreposição e posição no quadro**. Quando necessário, um trapézio simples sugere um tampo. Não usar diorama 3D ou isometria elaborada.
- Nenhum gradiente, sombra projetada, sombra suave, reflexo, brilho, glow, blur, granulação, material realista, volume inflado ou efeito de vidro.
- A graça vem das proporções, das expressões Avataaars, das pequenas poses e dos móveis arredondados — não de partículas, confetes ou efeitos luminosos.

## Como usar no gerador de imagens da OpenAI

1. Copie **um prompt por geração**. Cada bloco numerado é utilizável sozinho; não é necessário concatenar os dez.
2. Peça uma imagem **horizontal/paisagem** no formato disponível na interface. Não é necessário usar parâmetros de outras ferramentas, como `--ar`, nem pedir código SVG ao gerador.
3. Comece pelo **01**. Os prompts 02 e 03 comparam paleta/composição, mantendo a mesma simplicidade gráfica.
4. Anexe uma imagem dos rostos reais que pretende usar, exportados do [Avataaars Generator](https://getavataaars.com/). Uma URL sozinha não garante que o modelo veja os avatares.
5. Depois de aprovar a sala, anexe essa imagem às gerações 04–10. Preserve identidade, traço, câmera e paleta; referências antigas com efeitos não devem superar a regra de SVG simples.
6. O resultado é uma referência visual, **não um SVG editável automaticamente**. Na implementação, os avatares reais serão inseridos e os demais elementos serão reconstruídos em SVG; textos e painéis serão componentes de interface.
7. Textos e valores dos exemplos são fictícios. Corrigir legendas na implementação é mais importante que acrescentar efeitos para parecer uma captura real.

### Regras funcionais comuns

- Exatamente **quatro lugares por módulo de mesa**; mais agentes usam outros módulos, não uma quinta cadeira.
- Postos em U raso/arco aberto ao observador, com rostos frontais visíveis.
- Computador voltado para o personagem; o observador vê a traseira da tampa, abaixo do rosto.
- Pessoa recém-adicionada ainda sem tarefa fica sem computador.
- Clicar na pessoa abre um painel plano e legível, não um monitor gigante em perspectiva.
- Mesa satélite encostada ao projeto; no exemplo, pai + três filhos ocupam seus quatro lugares. Cadeira original do pai fica vazia e reservada, nunca com um segundo avatar.
- CTX é aproximado, com `~`; sem dados, usar `CTX —`, sem barra preenchida ou zero inventado.

---

## 01 — Sala geral: cartoon flat divertido — RECOMENDADO

**Objetivo:** escolher a imagem-mãe do produto sem introduzir efeitos difíceis de reconstruir.

```text
Crie uma única imagem horizontal mostrando a interface de um jogo de escritório chamado DSH Office. Quero uma referência simples para construir a interface com SVG, não uma ilustração cinematográfica ou uma renderização 3D.

ESTILO: cartoon 2D contemporâneo, flat, geométrico e simpático, como um desenho animado moderno feito de formas vetoriais. Formas arredondadas, cores totalmente chapadas, contornos carvão de espessura média consistente e poucos detalhes. A diversão deve vir das proporções, dos personagens expressivos e dos objetos ligeiramente caricatos, não de efeitos. Não faça um wireframe técnico nem uma interface corporativa sem personalidade.

IMPORTANTE: os rostos/bustos Avataaars já são assets prontos. Se houver avatares anexados, preserve a identidade e o desenho deles, sem mudar o estilo ou acrescentar volume. Todo o restante precisa parecer construível com retângulos arredondados, elipses, polígonos simples e poucos caminhos SVG: mesas, cadeiras, corpos sentados complementares, braços, notebooks, parede, piso e botões.

Mostre uma sala quase frontal, com apenas o suficiente do tampo visível para entender as mesas. Profundidade somente por sobreposição e posicionamento. Parede creme lisa, piso areia liso, tampos ocre chapados, cadeiras verde-água e pequenos detalhes azul lavado e coral. Uma planta simples e uma janela são decoração suficiente.

Três mesas de projeto: Site, API e Pesquisa. Cada módulo tem exatamente quatro postos em U raso aberto ao observador. Site tem três pessoas e um lugar vazio; API tem duas pessoas e dois lugares vazios; Pesquisa tem uma pessoa e três lugares vazios. Cadeiras vazias mostram +. Rostos grandes, frontais e desobstruídos.

Quem trabalha tem notebook baixo voltado para si; nós vemos a traseira da tampa, nunca cobrindo olhos ou boca. Uma pessoa recém-chegada está sem computador e tem o rótulo Disponível. Cada pessoa tem nome, pequeno ícone de estado e indicador CTX. Quando não houver dados, use CTX —.

Barra superior simples: DSH Office, + Mesa, + Pessoa e Ver lista. Sala como elemento principal, sem painel lateral aberto. Botões chapados e textos curtos em português.

SEM gradientes, sombras, texturas, madeira com veios, luz ambiente, reflexos, brilho, glow, desfoque, granulação, glassmorphism, 3D, claymorphism, pixel art ou perspectiva isométrica elaborada. Não transformar a cena em uma maquete. Uma única tela, sem colagem.
```

## 02 — Alternativa de paleta: cartoon flat noturno

**Objetivo:** testar fundo escuro sem transformar o desenho em uma cena iluminada ou futurista.

```text
Crie uma única imagem horizontal da interface DSH Office em uma paleta escura, mas com desenho cartoon 2D flat, simples e divertido. Isto será reconstruído em SVG. Não é uma sala 3D, uma cena cyberpunk nem uma composição cinematográfica.

Desenhe tudo com formas geométricas arredondadas, cores chapadas e poucos contornos limpos. Use parede azul-acinzentada escura, piso grafite plano, mesas ocre dessaturado e cadeiras verde-água. Os elementos devem ser distinguíveis pela cor sólida e pelo contorno, não por iluminação. Sem luz saindo dos monitores, neon, sombras, gradientes, reflexos ou texturas.

Os rostos frontais Avataaars são peças prontas: preserve os avatares anexados e suas cores. Não redesenhe nem sombreie os rostos. Complete os personagens apenas com corpos sentados e braços muito simples. Móveis e computadores devem parecer feitos de poucos retângulos, elipses e polígonos SVG.

Mostre três mesas chamadas Site, API e Pesquisa. Quatro lugares por módulo, em U raso voltado ao observador. Site tem três pessoas, API tem duas e Pesquisa tem uma. Posições restantes ficam vazias com +. Não coloque ninguém de costas.

Pessoas trabalhando têm notebooks baixos voltados para elas. Uma pessoa recém-chegada está sem computador. Nome, símbolo de estado e CTX ficam próximos de cada pessoa. Use texto e ícone para atenção, não apenas cor.

Barra superior plana com + Mesa, + Pessoa e Ver lista. Câmera quase frontal, profundidade somente por sobreposição. Não encher a sala de objetos: uma janela e uma planta simplificada bastam. A aparência deve continuar leve e simpática mesmo com fundo escuro. Uma única tela, sem colagem, sem efeitos decorativos.
```

## 03 — Alternativa de composição: palco frontal minimalista

**Objetivo:** simplificar ainda mais a geometria, sem perder a aparência de jogo.

```text
Crie uma única imagem horizontal do DSH Office como um pequeno cenário de desenho animado contemporâneo. Estilo cartoon 2D flat, amigável e geométrico, feito de cores chapadas, formas arredondadas e contornos limpos. Tudo, exceto os rostos Avataaars prontos, será reconstruído com SVG simples.

Use enquadramento quase frontal: parede como um retângulo creme, piso como uma faixa areia e dois módulos de mesa, Site e API. Os tampos são formas simples com cantos arredondados; não desenhar perspectiva complexa. Mostrar só o necessário do tampo para apoiar os notebooks. A profundidade vem da ordem de sobreposição das formas, não de sombras.

Cada mesa tem exatamente quatro postos em arco raso voltado ao observador. Site tem três pessoas e API tem duas. Os lugares livres mostram +. Avatares frontais com cabeça grande; preservar os rostos anexados sem reinterpretá-los. Corpos complementares, braços e cadeiras usam poucas formas arredondadas.

Dois agentes trabalham em notebooks voltados para si, com as tampas abaixo dos rostos. Uma pessoa disponível ainda não tem computador. Mostre nomes curtos e indicadores CTX discretos; sem dados, CTX —.

Paleta clara com pequenos acentos de verde-água, azul lavado e coral. Uma planta simples pode trazer personalidade, mas não adicionar detalhes para preencher espaços vazios. Botões + Mesa, + Pessoa e Ver lista na parte superior, chapados e legíveis.

Quero algo divertido e fácil de programar, não uma pintura, maquete, wireframe sem cor ou painel corporativo genérico. Sem gradientes, sombras, texturas, brilho, blur, reflexos, 3D ou pixel art. Uma única tela, sem painel lateral.
```

---

## 04 — Mesa ampliada: referência para construir o SVG

**Objetivo:** aprovar a geometria de uma mesa, com elementos simples e separáveis.

```text
Crie uma única imagem horizontal mostrando uma mesa do DSH Office em tamanho grande, como detalhe de uma interface de jogo. Preserve a paleta e os personagens da referência aprovada, mas mantenha obrigatoriamente o estilo cartoon 2D flat: cores chapadas, formas arredondadas, contornos simples, sem sombras, texturas, gradientes ou 3D.

Esta mesa será construída em SVG. Desenhe o tampo com poucas formas simples, pernas como retângulos ou traços e cadeiras com encostos arredondados. Notebooks são uma tampa retangular arredondada e uma base simples. Não desenhar parafusos, veios de madeira, estofamento, reflexos ou teclas individuais.

Exatamente quatro lugares em U raso aberto ao observador. Lia, Rui e Bia ocupam os três primeiros; o quarto está vazio com + Pessoa. Os rostos Avataaars são assets prontos e devem manter seu desenho. Use corpos complementares e braços simples atrás do tampo, com mãos arredondadas sem anatomia detalhada.

Lia trabalha com notebook voltado para ela, expressão concentrada e CTX ~34%. Rui aguarda aprovação, tem notebook e um pequeno símbolo de mão com rótulo Aprovação. Bia acabou de chegar, está disponível e ainda não tem computador. Rostos inteiros devem permanecer visíveis.

Uma placa simples identifica Site · 3/4. Deixe um trecho lateral reto que permita encostar outro módulo. Mostre um único estado de uma única mesa, não uma prancha com múltiplas variações. A mesa deve ter personalidade nas proporções, mas ser composta por poucos elementos vetoriais fáceis de reconhecer e separar.
```

## 05 — Adicionar pessoa: painel simples, sem efeitos

**Objetivo:** mostrar uma interação curta e preservar os lugares existentes.

```text
Crie uma única imagem horizontal do DSH Office no estado Adicionar pessoa. Use cartoon 2D flat com formas arredondadas e cores chapadas, apropriado para reconstrução em SVG. Preserve a referência aprovada. Sem sombras, gradientes, blur, efeito de vidro, texturas ou volume 3D.

A sala ocupa aproximadamente dois terços da largura; um painel plano ocupa o restante. Separe o painel com uma linha sólida simples, não com sombra. A mesa Site tem quatro lugares: Lia e Rui permanecem com seus notebooks; Bia permanece no terceiro lugar sem computador; o quarto lugar vazio está selecionado por um contorno, sem brilho.

O painel mostra Nova pessoa, uma prévia de avatar pronto Avataaars e três campos curtos: Nome com valor Tom; Mesa com Site · lugar 4; Modelo com seletor compacto. Aparência fica recolhida. Os rostos são assets existentes, não devem ser redesenhados para combinar com outro estilo.

Botão principal Adicionar à mesa e ação Cancelar. Uma frase curta informa A pessoa entra disponível; você envia a tarefa depois. Tom aparece apenas na prévia do painel, não como uma segunda pessoa já criada na sala. O posto vazio continua sem computador.

Cadeiras, mesa, braços e notebooks usam poucos retângulos, elipses e polígonos simples. Botões chapados, ícones de poucos traços e tipografia legível. O resultado deve parecer um jogo simpático com controles claros, não uma página corporativa de cadastro ou um assistente de muitas etapas. Uma única tela, sem colagem.
```

## 06 — Computador aberto: atividade legível e desenho flat

**Objetivo:** definir a tela de trabalho sem um computador cenográfico elaborado.

```text
Crie uma única imagem horizontal do DSH Office com a agente Lia selecionada e seu computador aberto como painel de interface. Preserve a identidade e a paleta da referência aprovada. Estilo cartoon 2D flat, com cores chapadas, formas arredondadas e contornos simples, reconstruível em SVG/HTML.

A sala ocupa aproximadamente 62% da largura. À direita, um painel plano ocupa 38%, separado por uma linha sólida. Não desenhar um laptop gigante, moldura física de monitor, painel flutuante, vidro ou sombra.

Na sala, Lia está na mesa Site com seu rosto Avataaars pronto, frontal e desobstruído. O notebook baixo aponta para ela; nós vemos a tampa. Indique seleção somente por um contorno simples. Móveis e corpo complementar são feitos de poucas formas geométricas.

No painel: título Computador de Lia, projeto Site, botão Fechar e estado Executando ferramenta. Indicador fictício CTX ~43,5k / 128k · ~34%, desenhado como uma barra simples. Em um estado sem telemetria, usar CTX —, sem preenchimento inventado. CTX não é vida nem progresso da tarefa.

Três abas: Conversa, Ferramentas e Arquivos. Ferramentas está ativa, com uma linha de comando de testes em execução, poucas linhas de saída e um resultado anterior. Campo de mensagem, Enviar e Interromper no rodapé. Textos curtos em português; nada de gráficos decorativos ou cartões aninhados.

A simpatia vem da personagem e das formas arredondadas, não de efeitos. Sem gradientes, sombras, luz de tela, brilho, reflexos, blur, textura, 3D ou pixel art. Uma única tela simples e utilizável.
```

## 07 — Subagentes: mesas encaixadas como peças simples

**Objetivo:** explicar o vínculo com o projeto usando geometria, não efeitos luminosos.

```text
Crie uma única imagem horizontal do DSH Office durante a delegação de Lia para três subagentes. Preserve a referência aprovada e os rostos Avataaars prontos. Estilo cartoon 2D contemporâneo, flat e divertido, com cores sólidas, contornos limpos e objetos de poucas formas SVG.

Mostre a mesa Site e outra mesa identificada Equipe de Lia fisicamente encostada ao seu lado direito. Um encaixe retangular simples une as bordas dos tampos, como dois módulos de mobiliário. Não usar portais, feixes de luz, trilhas brilhantes ou uma rede complexa de conexões. As duas mesas pertencem ao mesmo projeto.

Cada mesa tem exatamente quatro lugares em U raso voltado ao observador. Na principal, Rui e Bia permanecem em seus lugares; há uma cadeira livre e o lugar original de Lia fica vazio e reservado, com o rótulo Lia · em delegação. Lia não aparece duplicada.

No satélite estão exatamente quatro pessoas: Lia e os três subagentes Pesquisa, Código e Testes. Todos são adultos com rostos frontais Avataaars; corpos complementares, braços, cadeiras e notebooks têm construção geométrica mínima. Lia tem um pequeno símbolo de coordenação e os filhos um símbolo de vínculo. Nomes e CTX individuais, com ícone e rótulo de estado.

Os notebooks apontam para seus donos, abaixo dos rostos. O parentesco deve ficar claro pelo encaixe, pela proximidade e pelo texto Site / Lia / 3 subagentes. Deixe espaço livre para mais módulos, sem criar um quinto lugar em nenhuma mesa.

Sem sombra, gradiente, textura, reflexo, brilho, glow, 3D, pixel art ou isometria elaborada. Profundidade apenas por sobreposição. Uma única cena de trabalho, não um storyboard.
```

## 08 — Retorno: mesma pessoa, mesmo lugar, sem partículas

**Objetivo:** mostrar o fim da delegação como reorganização simples da interface.

```text
Crie uma única imagem horizontal do DSH Office depois que as três execuções delegadas por Lia terminaram. Preserve sala, câmera, paleta e rostos Avataaars prontos da referência. Cartoon 2D flat, formas geométricas arredondadas, cores chapadas e poucos contornos, para reconstrução em SVG.

Lia voltou ao lugar original na mesa Site, com o mesmo rosto, cabelo e roupa, aparecendo uma única vez. Rui e Bia continuam em suas posições. O quarto lugar segue vazio. A placa mostra Site · 3/4. O notebook de Lia permanece sobre a mesa e ela tem um sorriso moderado.

A mesa satélite já foi recolhida; o espaço lateral está livre. Mostre apenas uma etiqueta simples Equipe recolhida · 3 resultados. Nada de partículas, confetes, rastros de movimento, personagens desaparecendo ou efeitos mágicos.

À direita, um painel plano com título Delegações de Lia mostra três linhas: Pesquisa — concluída; Código — concluída; Testes — concluída. Cada linha tem um pequeno ícone de confirmação e Ver resultado. Uma nota diz Histórico preservado. Não representar que as sessões ou os arquivos foram apagados.

Mesa, cadeira, braços e notebook continuam feitos de poucas formas vetoriais. Separe o painel por uma linha, sem sombra. Botões chapados. Sem iluminação, gradientes, texturas, blur, reflexos ou 3D. Uma única tela posterior à delegação, sem montagem antes/depois.
```

## 09 — Adicionar mesa: prévia por contorno, não por efeitos

**Objetivo:** tornar a edição da sala clara e fácil de reproduzir.

```text
Crie uma única imagem horizontal do DSH Office no modo Adicionar mesa. Preserve todas as mesas, personagens e a paleta da referência aprovada. Estilo cartoon 2D flat, simpático e geométrico, inteiramente reconstruível em SVG, exceto os rostos Avataaars que já são assets prontos.

No cenário base, Site, API e Pesquisa continuam onde estavam. Uma nova mesa Docs aparece como prévia feita de contorno tracejado, com exatamente quatro cadeiras em U raso, sem pessoas nem computadores. Se a referência tiver outra quantidade de mesas, preserve-a e acrescente somente uma.

Mostre uma grade discreta de linhas sólidas apenas durante a edição. O lugar escolhido tem contorno e ícone de confirmação; não usar brilho, vidro translúcido, blur ou iluminação para indicar posição válida. Móveis são poucos retângulos arredondados e polígonos, sem textura de madeira ou detalhes de montagem.

Uma pequena caixa plana contém Nome do projeto com Docs, seletor Workspace e a informação 4 lugares. Rodapé com Confirmar mesa, Posicionar automaticamente e Cancelar. Use textos curtos, ícones simples e botões chapados com cantos arredondados.

Deixe espaço ao lado da nova mesa para futuros satélites. Não deslocar os projetos existentes e não criar pessoas automaticamente. A imagem deve explicar uma interação simples, não um editor profissional com dezenas de ferramentas.

Sem gradientes, sombras, texturas, reflexos, glow, 3D, pixel art ou perspectiva elaborada. Uma única tela, não uma sequência de etapas.
```

## 10 — Expressões: os mesmos rostos prontos, sem redesenho

**Objetivo:** escolher estados do Avataaars e indicadores simples, não criar um novo personagem.

```text
Crie uma única prancha horizontal organizada em quatro colunas por duas linhas, mostrando oito estados do mesmo avatar Lia usado no DSH Office. É uma referência de um componente, não uma colagem de telas do aplicativo.

Os rostos Avataaars já são assets prontos. Use o avatar anexado como referência de identidade, preservando proporções, cabelo, pele, roupa e linguagem visual. Mostre variações discretas de olhos, sobrancelhas e boca compatíveis com esse desenho, sem reinterpretar o rosto ou inventar um estilo novo. Se não houver referência, use apenas uma representação frontal simples da linguagem Avataaars; na produção ela será substituída pelo SVG real.

Fundo de uma única cor chapada da paleta aprovada, sem molduras circulares ou cartões com sombra. Os únicos novos elementos são ícones e rótulos flat de poucos traços, que serão construídos em SVG/HTML.

Oito rótulos: Disponível, Trabalhando, Ferramenta, Aprovação, Concluído, Erro, Contexto alto e Interrompido. Expressões moderadas, fáceis de ler: neutra amigável, concentrada, atenta, esperando resposta, sorriso, preocupação, atenção e neutralidade.

Ferramenta ganha um pequeno ícone de terminal; Aprovação uma mão simplificada; Concluído um check; Erro um alerta. Contexto alto mantém a expressão de atenção e uma barra CTX ~85%, valor fictício de design. Sem dados, CTX —. Não representar contexto como doença, cansaço ou vida. Interrompido tem um símbolo de interrupção, sem sugerir que a sessão foi apagada.

Mesma identidade e escala nas oito posições. Nada de rosto 3D, textura, pintura, gradiente, brilho, reflexo, partículas ou olhos luminosos. A finalidade é aprovar a convenção visual com assets existentes, não gerar os arquivos finais de expressão.
```

---

## Bloco de estilo para acrescentar a outras gerações

Este bloco é útil quando quiser pedir uma tela nova, fora das dez acima.

```text
ESTILO OBRIGATÓRIO: cartoon 2D contemporâneo, flat, geométrico e divertido. Como um desenho animado moderno feito de formas vetoriais simples. Cores chapadas, contornos limpos, cantos arredondados e poucos detalhes. A personalidade vem das proporções e expressões, não de efeitos visuais.

Os rostos/bustos Avataaars são assets prontos: preserve a referência e não os redesenhe. Todo o restante será construído em SVG: móveis, cenário, corpos complementares, braços, computadores e ícones. Cada objeto deve ser reconhecível com poucos retângulos, elipses, polígonos e caminhos simples.

Profundidade apenas por sobreposição e posição. Sem gradientes, sombras, iluminação realista, texturas, madeira com veios, reflexos, brilho, glow, blur, granulação, vidro, volume 3D, claymorphism ou perspectiva isométrica elaborada. Não fazer uma maquete, pintura ou imagem cinematográfica. Fazer uma referência de interface simples, simpática e possível de programar.
```

## Como corrigir uma imagem que saiu elaborada demais

```text
Simplifique a imagem anexada mantendo o layout, os rostos prontos, as quatro cadeiras por mesa e o estado de cada personagem. Não mude a identidade dos avatares.

Reduza móveis, corpos complementares e cenário a poucas formas SVG com cores totalmente chapadas e contornos simples. Remova todos os gradientes, sombras, texturas, reflexos, brilho, blur e iluminação. Troque materiais por cores sólidas: madeira vira ocre liso, metal vira cinza ou azul chapado, vidro vira uma forma plana sem reflexo. Tire detalhes pequenos e objetos decorativos que não ajudam a entender a interface.

Mantenha a diversão pelas formas arredondadas, pelas proporções levemente caricatas e pelas expressões Avataaars. O resultado deve parecer um desenho animado 2D moderno e simples, não uma maquete 3D nem um wireframe sem personalidade.
```

## O que me enviar depois

**Pacote mínimo:** 01, 06 e 07 — sala geral, computador aberto e delegação.

**Pacote ideal:** uma direção entre 01–03, mais os detalhes de 04–10.

Diga qual imagem manda no estilo e o que deseja manter ou alterar. Não é necessário gerar dez imagens antes de dar o primeiro feedback.

### Checklist da nova direção

- [ ] Parece um cartoon 2D moderno, simples e divertido?
- [ ] Os móveis e o cenário podem ser reconstruídos com poucas formas SVG?
- [ ] A imagem funciona sem sombras, gradientes, texturas ou iluminação?
- [ ] Os rostos prontos foram preservados, sem um redesign desnecessário?
- [ ] Os quatro lugares são fáceis de contar e os rostos não estão ocultos?
- [ ] Os notebooks apontam para os agentes e ficam abaixo dos rostos?
- [ ] A interface tem controles claros, sem decoração competindo com o trabalho?
- [ ] O pai aparece só uma vez e a mesa satélite realmente encosta no projeto?
- [ ] CTX não parece vida nem progresso, e há tratamento para dados indisponíveis?

**Importante:** imagem gerada é referência. Os rostos serão inseridos a partir dos assets reais e os demais elementos serão implementados em SVG/HTML. Nenhuma expressão ou animação substitui os eventos, permissões e resultados reais do DSH.
