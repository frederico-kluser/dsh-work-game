# DSH Office — análise, direção visual e plano de referência

## 1. Conclusão

**A ideia é viável como uma interface espacial do DSH, com aparência de jogo, sem criar outro motor de agentes.** A sala torna visíveis projetos, sessões, ferramentas e delegações que já existem no harness.

A direção refinada pelo usuário é um **cartoon 2D contemporâneo, flat, divertido e simples de reconstruir em SVG**. Os rostos/bustos Avataaars já vêm prontos; mesas, cadeiras, braços, corpos complementares, computadores, cenário e ícones serão componentes próprios em SVG/HTML. A câmera é quase frontal e a profundidade vem apenas da sobreposição de formas, sem volume renderizado.

**Restrição de arte:** cores chapadas, formas geométricas arredondadas, contornos limpos e poucos detalhes. Sem gradientes, sombras, texturas, reflexos, blur ou iluminação realista. A diversão deve vir das proporções e expressões, não dos efeitos. Os prompts são destinados ao gerador de imagens da OpenAI e pedem referências visuais, não arquivos SVG finais.

O principal desafio não é desenhar uma sala bonita. É preservar simultaneamente:

1. Rostos e expressões legíveis.
2. Quatro lugares por módulo de mesa.
3. Computadores voltados para seus donos.
4. Hierarquia de agentes compreensível.
5. Fidelidade aos estados reais do DSH.
6. Uma interface tão rápida de usar quanto o chat convencional.

**Entregável desta etapa:** pesquisa, decisões de design e [10 prompts prontos para gerar referências](PROMPTS-DSH-OFFICE.md). Não foi implementado o plugin, iniciado servidor ou alterado o DSH.

---

## 2. O que foi pesquisado e o que ainda não foi testado

### Material utilizado

- Os três anexos fornecidos pelo usuário (**Configuração e uso avançado**, **Plugin Cordis** e **Análise do DSH**), lidos como evidência de planejamento. O primeiro é uma linha única; para a leitura integral foi usada uma cópia temporária com quebras mecânicas, sem alterar o original.
- O [editor Avataaars](https://getavataaars.com/), o [repositório do gerador](https://github.com/fangpenlin/avataaars-generator), a [biblioteca React](https://github.com/fangpenlin/avataaars) e fontes/licenças/release relevantes.
- O código local do DSH, em vez de presumir que exemplos antigos dos anexos ainda representam suas APIs atuais. O checkout examinado declara `0.1.6-alpha.2`; isso não atesta que a GUI em execução carregou essa mesma revisão.
- Pesquisa direcionada via Tavily e leitura de fontes primárias sobre Pixel Agents, Agent Virtual Office e acessibilidade.

### Limites da análise

- Pesquisa direcionada; o protocolo especial da skill Tavily só é ativado com `--deep-research`, flag que não foi usada nesta solicitação.
- Não houve instalação ou teste de execução do Avataaars dentro do DSH.
- Não houve teste visual de um plugin ou inspeção do DOM da GUI atual. As imagens propostas são conceitos novos, não reproduções de uma tela observada.
- As superfícies de extensão foram examinadas no checkout disponível. A compatibilidade final deve ser validada contra a composição e as versões efetivamente carregadas na instalação-alvo.
- Nada aqui confirma uma licença CC0 para o pacote original de arte.

---

## 3. Avataaars: serve para quê, exatamente?

### São três coisas diferentes

| Componente | O que é | Como usar neste projeto |
|---|---|---|
| [getavataaars.com](https://getavataaars.com/) | Editor visual hospedado | Definir aparências e exportar referências/SVGs. |
| [avataaars-generator](https://github.com/fangpenlin/avataaars-generator) | Aplicação que implementa o editor | Referência para personalização e exportação; não carregar o editor inteiro no DSH. |
| [avataaars](https://github.com/fangpenlin/avataaars) | Componente React que renderiza SVG | Avaliar um adaptador de avatar ou reaproveitar SVGs, conforme teste de compatibilidade. |

### O que a biblioteca realmente oferece

- Busto frontal vetorial: cabeça, pescoço, ombros e roupa.
- Seleção de olhos, sobrancelhas, boca, cabelo, acessórios, roupa e pele.
- `avatarStyle='Transparent'`, que retira o círculo/fundo, **não** transforma o busto em uma cabeça isolada.
- Peças individuais via `Piece`, úteis para composição personalizada.
- SVG escalável, apropriado para avatares e expressões em uma interface web.

Ela **não** fornece corpo inteiro articulado, pernas, pose sentada, caminhada, visão de costas, cabeça isométrica, esqueleto de animação ou motor de jogo. Rotacionar o SVG com CSS não cria uma nova vista do rosto.

**Composição recomendada:** cenário → cadeira/corpo próprio → busto transparente → braços/mesa/notebook. Aproveitar o busto atrás do tampo evita precisar extrair e reconstruir uma cabeça completa.

Fonte: [documentação e código da biblioteca](https://github.com/fangpenlin/avataaars/tree/93aa902c729b1a9eaf2b5917c6d1ebe9de32af75/src).

### Compatibilidade: não confundir risco com impedimento

- A publicação consultada é `avataaars@2.0.0`, com peer React `^17.0.0` e release de 2021. Isso recomenda cautela, mas a idade sozinha não prova que o componente falha.
- O DSH local declara React `^18.2.0`; foi encontrada a instalação `18.3.1`. **Não é correto dizer que este checkout está bloqueado por React 19.**
- React 18 está fora da faixa peer declarada pelo Avataaars. Há relatos de resolução de dependências e warnings; o funcionamento real no host permanece sem teste nesta etapa.
- A biblioteca usa `childContextTypes`, `getChildContext` e `contextTypes`. O React 19 removeu esse contexto legado: uma migração futura para 19 exige adaptação ou uma estratégia que não execute esse componente antigo.

**Minha escolha para um primeiro protótipo visual:** pequeno conjunto de identidades com SVGs locais pré-exportados por expressão, exibidos como imagens independentes. Para personalização arbitrária, avaliar um renderer adaptado ou um teste controlado do componente na versão exata do host. Não inserir uma segunda cópia de React 17 na árvore do DSH nem ignorar peers sem investigação.

Fontes: [release 2.0.0](https://github.com/fangpenlin/avataaars/releases/tag/v2.0.0), [relato de peer com React 18](https://github.com/fangpenlin/avataaars/issues/63), [remoção do contexto legado no React 19](https://react.dev/blog/2024/04/25/react-19-upgrade-guide#removed-removing-legacy-context), [declaração React no DSH](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/web/package.json#L54-L55).

### Licenciamento e SVGs repetidos

- O código do [gerador](https://github.com/fangpenlin/avataaars-generator/blob/master/LICENSE) e o da [biblioteca](https://github.com/fangpenlin/avataaars/blob/master/LICENSE) têm licença MIT. Preservar os avisos exigidos quando reutilizar código ou porções substanciais.
- O [site](https://getavataaars.com/) declara uso gratuito pessoal e comercial e credita Pablo Stanley pelo design. Não foi confirmada uma licença separada CC0 do Sketch original; para redistribuição de um pacote de arte, guardar a procedência e confirmar seus termos específicos.
- A release 2.0.0 já anuncia correção de IDs SVG não únicos. Não afirmar que a biblioteca atual necessariamente quebra ao renderizar vários avatares.
- **Outro caso:** copiar repetidamente o mesmo SVG exportado para dentro do DOM preserva IDs idênticos. Usar imagens SVG independentes ou prefixar IDs e referências de recorte/máscara por instância; testar múltiplas identidades e expressões.

---

## 4. Referências próximas — o que aproveitar e o que não copiar

### Pixel Agents

O [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) já explora agentes como pessoas em um escritório, atividades visuais, editor de layout e representação de subagentes. É uma referência relevante de interação e organização espacial, não uma integração DSH pronta.

**Aproveitar conceitualmente:** identidade persistente por agente, sinais claros de espera/aprovação, posição reconhecível e separação entre evento técnico e animação.

**Não presumir:** que o protocolo de hooks de Claude Code é o protocolo do DSH; que as barras e a orquestração descritas no roadmap já existem; que código e todos os assets têm necessariamente os mesmos termos.

### Agent Virtual Office

O [Agent Virtual Office](https://github.com/KbWen/agent-virtual-office) documenta uma abordagem com React e SVG, personagens associados a sinais de execução e interface de escritório. É uma referência útil para avaliar um cenário leve sem adotar uma engine completa.

**Aproveitar conceitualmente:** a separação entre estado observado e ornamentação da sala.

**Não copiar para este MVP:** simulações sociais, pausas inventadas ou inferências de falha baseadas apenas em silêncio. A prioridade aqui é operar projetos com precisão.

### O diferencial da proposta

Não é apenas “ver um boneco digitando”. É conectar:

**Projeto → mesa → pessoa/sessão → tarefa → computador → ferramentas → contexto → equipe de subagentes → resultados.**

Essa cadeia precisa ser compreensível sem exigir que o usuário aprenda a arquitetura interna do harness.

---

## 5. Contrato visual proposto

Tudo nesta seção é **decisão de produto sugerida**, não comportamento nativo já implementado pelo DSH.

| Elemento da sala | Significado | Regra importante |
|---|---|---|
| Sala | Visão dos projetos selecionados | Não pressupõe um processo DSH por sala ou projeto. |
| Mesa principal | Projeto associado a workspace | Nome visual e identidade técnica são separados. |
| Quatro lugares | Capacidade de um módulo visual | Não limita a quantidade real de agentes que o DSH pode executar. |
| Pessoa | Sessão/agente com identidade persistente | Cabelo/roupa/pele não mudam a cada evento. |
| Computador | Acesso à tarefa e à atividade da pessoa | Não significa uma VM ou desktop remoto real. |
| Expressão + ícone + rótulo | Estado observado | Não são emoções reais nem leitura de pensamentos. |
| CTX | Ocupação aproximada do contexto | Não é vida, cansaço, gasto acumulado ou conclusão da tarefa. |
| Mesa satélite | Grupo de delegações associado a um agente do projeto | Não vira um novo projeto independente. |
| Cadeira reservada | Lugar original do coordenador deslocado | Não renderizar um segundo avatar do pai. |

### Câmera e geometria

Uma mesa realista com pessoas em lados opostos mostraria alguém de costas. Isso conflita com o principal valor do Avataaars: o rosto frontal.

**Solução recomendada:** mesa modular de quatro postos em **U raso/pequeno arco**, duas posições centrais e duas laterais discretamente anguladas, com os bustos voltados à câmera. É uma convenção cenográfica deliberada, não simulação física estrita.

- Câmera fixa, quase frontal; um tampo pode ser sugerido por um trapézio ou retângulo arredondado, sem perspectiva complexa.
- Profundidade apenas por sobreposição e posição dos elementos, nunca por sombras ou iluminação. Sem rotação livre no MVP.
- Notebooks baixos, tela voltada ao personagem, tampa voltada ao observador.
- Cabeças e rótulos nunca ocultos por monitores, móveis ou outras pessoas.
- O painel de atividade é plano e legível, separado por linha ou cor sólida: não tentar ler código numa tela minúscula em perspectiva.
- Deixar áreas de encaixe ao lado das mesas para expansão, sem reorganizar a sala inteira.

### Construção SVG: a simplicidade é requisito, não apenas preferência

- **Mesas:** poucos retângulos arredondados/polígonos, com uma cor sólida por peça. Cor de madeira significa ocre liso, não textura ou veios.
- **Cadeiras:** encosto arredondado, assento e base mínimos, sem estofamento realista.
- **Computadores:** tampa e base como duas formas simples; sem brilho de tela, reflexos ou teclas individuais.
- **Corpos complementares e braços:** poucas curvas e formas arredondadas, mãos simplificadas. Não redesenhar os rostos/bustos prontos.
- **Sala:** áreas chapadas de parede e piso. Decoração reduzida a poucos objetos simples, como uma planta de três folhas.
- **Interface:** botões chapados, contornos consistentes, ícones de poucos traços. Foco por contorno; prévia de mesa por tracejado, sem glow ou blur.

Paleta de cerca de 6–8 cores para cenário/móveis, além das cores próprias dos avatares. Sem gradientes, sombras, iluminação ambiental, texturas, reflexos, vidro, granulação, volume inflado ou aparência de maquete 3D. Isso limita deliberadamente o desenho; não significa que SVG seja tecnicamente incapaz de efeitos.

**Critério visual:** se um objeto só parece bonito por causa da luz, da textura ou da sombra, deve ser simplificado. Se é reconhecível e simpático pela silhueta, proporção e poucas cores, está na direção certa.

### Direções de arte para comparar

Todas mantêm o mesmo cartoon 2D flat e a mesma facilidade de construção; mudam apenas paleta ou composição.

1. **Cartoon claro — recomendado:** creme, areia, ocre liso, verde-água, azul lavado e pequenos acentos coral. Formas arredondadas e expressivas, sem infantilização excessiva.
2. **Cartoon noturno:** azul-acinzentado e grafite chapados, preservando as cores e a leitura dos avatares. Sem iluminação noturna, brilho de tela ou neon.
3. **Palco frontal:** organização quase frontal e máximo uso de formas simples; personagens e móveis mantêm personalidade nas proporções, não nos efeitos.

Não recomendo começar com pixel art se a intenção é preservar Avataaars: misturar personagens SVG arredondados com mobiliário em pixels cria dois vocabulários visuais. Isso pode ser uma escolha artística posterior, mas exige redesenho consciente.

---

## 6. Fluxo principal

### A. Criar uma mesa

1. Clicar em **+ Mesa**.
2. Dar nome ao projeto e escolher um workspace/pasta existente.
3. Usar posicionamento automático por padrão; posicionamento manual em modo de edição opcional.
4. Confirmar: surge o módulo com quatro cadeiras vazias, sem pessoas e sem computadores.

Criar uma mesa não deve executar comandos, criar agentes silenciosamente ou alterar permissões.

### B. Adicionar uma pessoa

1. Clicar no **+** de uma cadeira, ou em **+ Pessoa** com uma mesa selecionada.
2. Definir nome; aceitar avatar e modelo padrão, com opções de personalização recolhidas.
3. Confirmar: a pessoa ocupa o lugar escolhido, ou o primeiro lugar livre segundo uma ordem estável.
4. Ela começa **disponível, sem computador**, até receber sua primeira tarefa.

Se o módulo estiver cheio, oferecer um novo módulo do mesmo projeto ou outra mesa. Não inventar um quinto lugar e não rejeitar a execução do DSH por causa de uma limitação puramente gráfica.

### C. Enviar a tarefa

1. Clicar na pessoa.
2. Abrir um painel com nome, projeto e campo **O que você quer que eu faça?**.
3. Enviar a mensagem pela operação real do DSH.
4. Mostrar confirmação/fila real. Só marcar “executando” quando houver o respectivo sinal; o computador pode aparecer após a aceitação da primeira tarefa.
5. Em erro de envio, preservar o texto para nova tentativa e não animar trabalho inexistente.

Depois da primeira tarefa, o computador pode permanecer sobre a mesa, em repouso, como acesso ao histórico. Ausência de computador significa “ainda sem primeira tarefa”, não “não está executando agora”.

### D. Ver o computador

Clicar na pessoa ou no notebook abre o mesmo painel de trabalho, sem virar a câmera ou esconder toda a sala.

- **Conversa:** mensagens disponíveis e campo para nova instrução.
- **Ferramentas:** chamadas, estado, argumentos/saídas apropriados e resultados.
- **Arquivos:** alterações e artefatos quando essa informação estiver disponível no DSH.
- **Contexto:** valor aproximado, capacidade e indicação de indisponibilidade quando necessário.
- **Ações:** enviar, interromper e responder a aprovações, conforme as capacidades reais do host.

“Computador” é uma metáfora de interface. Não promete acesso a raciocínio privado, sistema operacional virtualizado ou terminal interativo novo sem integração específica.

### E. Delegar e voltar

1. O DSH confirma um subagente local real; o plugin cria sua representação visual, sem disparar uma segunda execução.
2. Ele aparece perto do coordenador. O sistema organiza um módulo satélite encostado à mesa do projeto.
3. Para a referência principal: o pai ocupa um lugar no satélite, com **três filhos nos outros três lugares**. Seu lugar original fica reservado e vazio.
4. Mais filhos usam novos módulos de quatro lugares, associados ao mesmo grupo. Não sobrepor pessoas nem duplicar o pai para ocupar cada módulo.
5. Terminadas as execuções do grupo observado, mostrar resultados e recolher a expansão quando apropriado. O pai volta ao lugar original.
6. Filhos continuáveis permanecem no histórico e podem reaparecer com a mesma identidade em nova execução. Recolher a mesa não destrói sessões.

**Detalhes indispensáveis:** término de um turno, estado ocioso e término de uma sessão não são a mesma coisa. Um filho esperando aprovação não deve desaparecer por tempo decorrido. Uma execução encerrada com erro deve preservar o resultado e a indicação de falha. Um descendente que continua ativo impede o recolhimento automático do grupo correspondente.

---

## 7. Expressões e contexto

### Presets visuais possíveis com opções reais do Avataaars

Os nomes de estado abaixo são uma proposta do plugin. As combinações são valores da biblioteca, não uma classificação semântica oferecida pelo Avataaars.

| Estado visual | `eyeType` | `eyebrowType` | `mouthType` | Sinal adicional |
|---|---|---|---|---|
| Disponível | `Default` | `DefaultNatural` | `Default` | Rótulo Disponível. |
| Trabalhando | `Squint` | `FlatNatural` | `Serious` | Atividade observada. |
| Ferramenta | `Side` | `RaisedExcitedNatural` | `Twinkle` | Ícone da categoria e nome curto da ferramenta. |
| Aprovação | `Default` | `RaisedExcited` | `Concerned` | Mão/aviso e ação explícita. |
| Concluído | `Happy` | `RaisedExcited` | `Smile` | Confirmação da execução, não só fim do streaming. |
| Erro | `Default` | `SadConcerned` | `Sad` | Alerta e razão real quando disponível. |

Usar poucas trocas de expressão, estáveis e discretas. Uma rajada de ferramentas não deve produzir um rosto piscando a cada token. Contexto alto é um aviso adicional, não substitui o estado da atividade.

### CTX não pode usar o total de tokens gastos

No código atual, a [projeção de tokens](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/token-meter/src/projection.ts#L7-L75) diferencia:

- `tokenUsage`: uso **acumulado** ao longo do histórico.
- `contextPressure.pressureTokens`: tamanho do prompt do último pedido medido.
- `contextPressure.projectedTokens`: aproximação do tamanho do próximo prompt, ancorada na medição e ajustada pelas mudanças da superfície.
- `contextPressure.contextWindow`: capacidade reportada pelo modelo/rota.

**Regra visual proposta:** usar `projectedTokens` quando disponível, com fallback para `pressureTokens`, comparado com `contextWindow`. Identificar o número como aproximado.

Exemplo fictício: **CTX ~43,5k / 128k · ~34%**.

Se faltarem dados, mostrar **CTX —** ou **telemetria indisponível**, nunca um “0%” inventado. Após trocar o modelo, valores podem refletir observações de momentos diferentes; não usar esse medidor como mecanismo de autorização ou cobrança.

Os limites de atenção, por exemplo 70% e 85%, seriam preferências do plugin, não limites universais do DSH. Compactação pode reduzir o indicador. Não retratar isso como “curar” um agente ou recuperar pontos de vida.

Também não somar ingenuamente totais do pai e dos filhos como custo do projeto: um filho originado por fork pode carregar eventos herdados, causando dupla contagem. Métrica financeira fica fora do primeiro protótipo.

---

## 8. Como isso se encaixa no DSH

### Abordagem sugerida

**Plugin Cordis com interface cliente própria**, mantendo o DSH como fonte de verdade.

Fluxo lógico:

```text
Sessões, workspaces, execuções, ferramentas e projeções reais do DSH
                         ↓
Adaptador do plugin: IDs, snapshot inicial, eventos e capacidades
                         ↓
Estado visual: projeto, lugar, avatar, atividade, contexto e delegações
                         ↓
Sala React/SVG + painel HTML acessível do computador
                         ↓
Ações explícitas do usuário → operações existentes do DSH
```

Os nomes e a separação do adaptador são uma proposta arquitetural; não se assume uma API chamada “Office” já existente.

### Superfícies e cautelas verificadas

- O cliente oferece slots. Há padrão de painel próprio por chave em `main`, com entrada correspondente em `sidebar.panellist`, como mostra o [exemplo oficial de painel](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/src/client/index.ts#L78-L100). Um painel novo de raiz precisa gerenciar a seleção de sessões; não recebe automaticamente o contexto de uma conversa existente.
- `shell.overlay` é uma possibilidade aditiva para elementos globais, mas não é motivo para cobrir a interface inteira ou injetar DOM sem contrato.
- O código do cliente deve entrar pela superfície de plugin/bundle do DSH. Não substituir o fallback global nem iniciar outro servidor achando que isso modifica a GUI existente.
- O adaptador deve combinar snapshot inicial com atualizações, reconciliar reconexões e usar identidades estáveis. Animações não podem ser o único registro de criação ou término.
- Eventos `subagent/start` e `subagent/end` carregam identidade de execução; o mesmo filho continuável pode ter várias execuções. Não inventar `parentId` nesse payload: o vínculo depende do escopo e dos descritores/catálogo de sessão.
- `parentSession` também pode representar um fork comum. Confirmar a origem de subagente antes de criar uma mesa de delegação.
- Um provider remoto pode não ter sessão local, contexto ou transcript completos. No MVP, priorizar subagentes locais; para os demais, mostrar apenas a telemetria realmente disponível.
- Layout e avatar são dados do plugin; sessão, permissões, execução e resultados continuam pertencendo ao DSH.
- Não presumir que todos os eventos do host já estejam expostos ao navegador. Se a visão global precisar de dados adicionais, usar um pequeno agregador observacional no plugin host, com descarte de listeners e transporte existente, em vez de interceptar a execução para animá-la.
- O cliente tem operações reais de submissão, fila e cancelamento no [contrato de sessão](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/session-controller/src/client/contract/session.ts#L63-L112). Preferir envio para a fila por padrão e uma ação diferenciada para redirecionamento; não apresentar interrupção como exclusão da fila inteira.

### Sinais de execução e tradução visual

| Sinal verificado | Tradução visual proposta | Não concluir automaticamente |
|---|---|---|
| `turn/start` / `turn/end` | Início e resultado do turno | Fim de streaming não prova sucesso da tarefa. |
| `tool/call` / `tool/result` | Ícone de ferramenta, atividade e resultado | Resultado de uma ferramenta não encerra toda a sessão. |
| `approval/asked` / `approval/decided` | Mão levantada e ação explícita | Clicar no avatar não é consentimento para executar. |
| `subagent/start` / `subagent/end` | Entradas/saídas de uma execução ou ativação observada | Encerrar ativação não apaga a identidade continuável. |
| Projeção `contextPressure` | Medidor aproximado CTX | Uso acumulado de tokens não é ocupação de contexto. |

Referências locais adicionais: [identidade e eventos de sessão](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/types.ts#L93-L382), [lifecycle de subagentes](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md#L124-L171) e [contrato de workspace](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/workspace-controller/src/types.ts#L14-L26). As expressões são uma camada de apresentação nossa; não existem eventos nativos de humor a assumir.

**Stack inicial sugerida:** React da própria instalação + SVG/DOM para a sala e HTML para o painel. Antes de adotar Canvas, PixiJS ou uma engine, medir a necessidade com a quantidade real de personagens. Não há motivo para introduzir Unity nesta etapa.

### Ajustes necessários em relação aos anexos

Os anexos ajudam a formular a ideia, mas não devem ser usados literalmente como contrato atual:

1. O código atual tem workspaces múltiplos; **não é obrigatório abrir uma instância DSH por mesa/projeto**.
2. O histórico atual examinado usa eventos persistidos em JSONL; não basear a integração numa suposição de que tudo é SQLite.
3. `ctx.intercept` não deve ser tratado como um interceptador genérico de métodos. Exemplos desse tipo precisam ser confrontados com a API real.
4. Para subprocessos, as assinaturas e o lifecycle dos exemplos antigos não são intercambiáveis com o contrato atual.
5. A documentação de plugin consultada cobre outra faixa de versões que o checkout atual. Validar tipos e versão efetivamente resolvidos antes de escrever código.

A versão e os contratos devem ser fixados no futuro teste de integração. A pesquisa não garante compatibilidade automática com todas as instalações DSH.

---

## 9. Regras de UX que protegem a ideia

Esta é uma revisão qualitativa do conceito, não um teste de usabilidade nem uma pontuação de acessibilidade certificada.

### Prioridade alta

- **Estado também em texto/ícone.** Expressão e cor sozinhas são ambíguas. Referência: [WCAG — uso da cor](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).
- **Aprovação não é animação.** Deve haver motivo, operação solicitada e ação explícita; nada é aprovado ao clicar no rosto ou recolher uma mesa.
- **Rostos clicáveis, sem microalvos.** Buscar áreas de interação de 44 × 44 CSS px como meta confortável; o mínimo AA de 24 × 24 tem condições e exceções. Referência: [WCAG — tamanho de alvo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- **Alternativa em lista e navegação por teclado.** A mesma sessão deve ser acessível sem localizar um personagem no mapa. Arrastar não pode ser o único jeito de criar ou mover mesas.
- **Remover da sala não é apagar ou interromper.** Ações distintas, nomes distintos e confirmações adequadas.
- **Falha de conexão é desconhecimento, não sucesso.** Mostrar estado desatualizado/reconectando; não deixar o boneco fingir trabalho sem telemetria.

### Prioridade média

- Uma única pessoa inspecionada por vez; um painel de trabalho, não vários laptops sobrepostos.
- Nomes e indicadores essenciais ficam visíveis; detalhes de ferramenta só na seleção ou no painel.
- Sem animação perpétua de caminhada. Deslocamento curto apenas quando explica uma mudança real de lugar/grupo.
- Respeitar movimento reduzido; foco não muda de lugar porque a mesa satélite apareceu.
- Não permitir que uma nova delegação empurre todas as mesas. Reservar espaços e oferecer recolhimento por grupo quando a sala crescer.
- Ao reduzir o zoom, agregar visualmente grupos e manter a lista operacional. Não tornar texto ilegível a única forma de acesso.
- Modelo escolhido, workspace, identidade visual e autorização são conceitos separados; aparência não concede ferramentas nem permissões.

---

## 10. Plano após a aprovação das imagens

### Etapa 1 — Fechar a direção visual

Gerar as referências com o gerador de imagens da OpenAI e aprovar sala, mesa em detalhe, computador aberto e delegação. Escolher câmera, proporções, paleta e posição do painel, respeitando o cartoon 2D flat. Usar o [kit de prompts](PROMPTS-DSH-OFFICE.md), com imagens dos avatares prontos como referência. A geração não substitui os SVGs finais: rostos reais serão inseridos, móveis e cenário serão reconstruídos com formas simples.

**Saída esperada:** imagens de referência e decisões, ainda sem integração com agentes.

### Etapa 2 — Prova visual com dados simulados

- Uma sala, uma mesa, quatro lugares.
- Adicionar pessoa, selecionar e abrir o painel.
- Estado disponível sem computador e primeira tarefa aceita com computador.
- Poucas expressões, indicadores CTX aproximados e fallback sem dados.
- Testar SVGs reais no React da instalação-alvo.

**Critério de aprovação:** quatro rostos legíveis, nenhum monitor os oculta, cliques previsíveis, mobiliário/cenário feitos de poucas formas SVG sem depender de efeitos, e nenhuma dependência do componente legado assumida sem teste.

### Etapa 3 — Integração mínima real

- Painel de plugin coexistindo com a interface normal do DSH.
- Associar mesa a workspace e pessoa a sessão.
- Enviar tarefa, observar execução/ferramentas e abrir atividade.
- Exibir contexto com a projeção correta.
- Preservar permissões, erros, interrupção e reconexão.

**Critério de aprovação:** nenhuma ação acontece duas vezes por causa de animação/reconexão; estado visual sempre reconciliável com o host.

### Etapa 4 — Delegações locais e persistência do layout

- Reconhecer pai/filho real sem confundir fork comum.
- Criar satélite com pai + três filhos e reservar lugar original.
- Tratar mais filhos com novos módulos, sem limitar o backend a quatro.
- Retornar sem destruir a identidade ou o histórico dos filhos.
- Persistir posições e aparências separadamente dos eventos de execução.

**Critério de aprovação:** um único avatar por sessão, nenhum quinto lugar, resultados acessíveis e retomada continuável coerente.

### Fora do primeiro escopo

Engine de jogo completa, física, mundo multiplayer, economia/pontos, avatares caminhando livremente, personalização infinita de móveis, terminal remoto próprio, controle indiscriminado de descendentes e métricas financeiras agregadas.

---

## 11. Próxima decisão prática

**Gerar primeiro os prompts 01, 06 e 07** do [kit](PROMPTS-DSH-OFFICE.md): visão geral, computador e subagentes.

São as três referências que mais reduzem incerteza. Uma imagem bonita da sala, sozinha, não resolve o painel de trabalho nem a lógica espacial da delegação.

Ao enviar as imagens, indicar qual manda no estilo e o que deseja manter ou alterar. A partir delas, o próximo plano pode se apoiar em proporções e componentes concretos, sem começar a implementação por suposições estéticas.
