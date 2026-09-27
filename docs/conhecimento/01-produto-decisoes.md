# dsh-work-game — Produto e decisões do utilizador

_Conhecimento de produto · sessão de 2026-09-27 · PT-BR_

## Contexto do produto

O **dsh-work-game** é uma extensão visual do DeepSeek Harness (DSH) com cara de jogo 2D: um escritório de agentes em front-end puro (HTML/CSS/JS + SVG), sem backend, publicado como repo público em `github.com/frederico-kluser/dsh-work-game`. A metáfora central é **salas com mesas = projetos**: cada mesa tem 4 lugares e cada pessoa sentada é uma sessão/agente. O utilizador gere o escritório como quem gere uma equipa: clica numa pessoa para lhe passar a tarefa; ao receber tarefa, aparece um computador virado para ela; as expressões mudam conforme o que acontece (tool calls, progresso, conclusão). Clicar na pessoa mostra o computador dela com o que está a ser feito, e o limite de contexto de cada pessoa é visível. Quando uma pessoa chama subagentes, eles aparecem como novas pessoas numa mesa que cola na mesa do projeto; a pessoa que recrutou levanta-se e vai para a mesa nova; quando a delegação termina, volta ao lugar original.

O estado atual do produto é um **protótipo de front-end**: tudo o que se vê (nomes, tarefas, outputs, contexto) é simulado em memória. A integração real com agentes/DSH é trabalho futuro, sem prazo definido.

## Evolução das decisões (cronologia · 2026-09-27)

1. **Ideia original** — extensão visual do DSH com cara de jogo 2D: salas, mesas de 4 lugares, pessoas-sessões, atribuição de tarefas por clique, computadores virados para quem trabalha, expressões reativas, limite de contexto visível e mesas de subagentes que colam na mesa do projeto.
2. **Primeiro pedido: prompts de imagem** — antes de desenvolver, o utilizador pediu prompts para gerar o design com o gerador de imagens da OpenAI. Foram criados 10 prompts; a direção inicial era "vetorial 2D acolhedor".
3. **Correção de direção** — o utilizador corrigiu o rumo: os prompts seriam para o gerador da OpenAI e o estilo devia ser **SIMPLES, sem efeitos** — "divertido e simples como são os desenhos novos" — porque o resto seria construído em SVG e só os rostos viriam prontos.
4. **Regra dos rostos** — os rostos vêm da biblioteca Avataaars indicada pelo utilizador (getavataaars.com / fangpenlin/avataaars), nunca redesenhados nem gerados por IA.
5. **Imagem de referência aprovada** — o utilizador aprovou uma imagem gerada (cartoon flat, mesas azuis, mesa de equipe violeta, notebooks cinza, fichas creme, rostos frontais) e gostou da mesa, do estilo dos computadores e das fichas dos bonecos.
6. **Mandato de implementação** — "SÓ CRIE O FRONTEND, OS SVG, nada de funções, nada de criar plugin… apenas o frontend com o design numa demo funcionar SEM LÓGICA, apenas pequenas lógicas de frontend para demonstrar as coisas".
7. **Refatoração com lógica simulada** — ao pedir a refatoração, o utilizador manteve o escopo fechado no front-end mas abriu a lógica: "ainda não vamos mexer em outras coisas, apenas no frontend, mas podemos agora começar a fazer lógica" — ou seja, lógica simulada em memória, sem backend e sem DSH.
8. **Especificação final de layout e comportamento** — ver "Decisões e porquês" abaixo.
9. **Entrega no GitHub** — primeiro commit de tudo e push para um repo **público** chamado "dsh-work-game", com ótimo README, bom About e tags; a execução devia usar MUITOS subagentes.

## Decisões e porquês

- **Tudo na mesma sala** — todas as mesas vivem numa única sala, em estilo de 3 colunas e linhas infinitas, com movimento pela sala. Abandona-se a ideia de uma sala por projeto em favor de um único espaço contínuo e navegável.
- **Balão do último output** — a última coisa do output de cada pessoa aparece como balão acima da cabeça, substituído apenas pela nova, com duração de 1 segundo e sumindo com animação. Mostra atividade sem poluir o ecrã.
- **Expressões com vários códigos** — analisar as expressões da biblioteca de rostos e criar vários códigos de mudança de expressão, para reagir ao que acontece (tarefa recebida, tool calls, conclusão).
- **Pessoas totalmente aleatórias** — cada pessoa é gerada com nome e avatar totalmente aleatórios.
- **Sem conceito de cargo** — o conceito de cargo foi removido a pedido do utilizador; não há hierarquia nominal nas fichas das pessoas.
- **Regra de expansão das mesas** — a cada 4 cadeiras preenchidas, a mesa do time ganha outra mesa ao lado da mesa principal; se já existir mesa de equipe, ela é empurrada para a direita, abrindo mais 4 lugares.
- **Sem sidebar à esquerda** — removida; a sala usa o espaço todo.
- **Sem header de sala** — só existe o header geral.
- **Front-end primeiro, lógica só para demonstrar** — nada de funções nem de plugin; a demo mostra o design com pequenas lógicas de front-end e, depois da refatoração, com lógica simulada em memória.
- **Execução com muitos subagentes** — pedido explícito do utilizador para a implementação.

## Regras inegociáveis

1. **Rostos Avataaars** — os rostos vêm sempre da biblioteca Avataaars (getavataaars.com / fangpenlin/avataaars). Nunca redesenhados, nunca gerados por IA.
2. **Só front-end** — nenhuma função real, nenhum plugin, nenhum backend; apenas o design numa demo a funcionar.
3. **Estilo simples, sem efeitos** — "divertido e simples como são os desenhos novos"; o resto do mundo é construído em SVG e só os rostos vêm prontos.
4. **Sem cargo** — o conceito de cargo não volta para o produto.
5. **Dados simulados** — nomes, tarefas, outputs e contexto são simulados em memória; nada finge ser uma integração real com o DSH.

## O que está explicitamente fora de escopo

- **Integração real com agentes/DSH** — é trabalho futuro, sem prazo; não entra nesta fase.
- **Plugin para o DeepSeek Harness** — proibido pelo mandato ("nada de criar plugin").
- **Backend, funções reais, persistência** — tudo o que não seja front-end está fora.
- **Redesenho ou geração por IA dos rostos** — fora, para sempre, por decisão do utilizador.
- **Sidebar de sala e header de sala** — removidos e sem previsão de regressão.
- **Conceito de cargo/hierarquia** — removido do produto.
