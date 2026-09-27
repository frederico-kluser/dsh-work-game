# dsh-work-game — o escritório 2D dos seus agentes

**Front-end puro em HTML, CSS, JavaScript e SVG — zero dependências, zero build, zero backend.** Uma sala onde times de agentes trabalham lado a lado, com mesas modulares, balões de output e expressões que mudam com o estado de cada pessoa. Tudo simulado em memória.

![Escritório 2D com mesas de 4 cadeiras, pessoas com avatares e balões de output](demo-preview.png)

## O que é

**dsh-work-game** é um protótipo de front-end que visualiza um "escritório 2D" de agentes: uma única sala com as mesas de todos os times, pessoas sentadas, balões de output e painéis de contexto. Ele existe para explorar como *parece* um time de agentes trabalhando lado a lado — e para ser divertido de olhar.

É, acima de tudo, uma demonstração visual. Tudo o que você vê — nomes, avatares, tarefas, linhas de output, ocupação de contexto e delegações — é gerado e mantido em memória, no navegador.

## O que não é

Para não criar expectativas erradas:

- **Não é um plugin do DeepSeek Harness (DSH)** e não se integra a ele.
- **Não tem backend**, não executa agentes reais e não faz chamadas externas em runtime.
- **Não existe lógica real de agentes**: nenhuma tarefa é enviada, nenhum modelo é chamado e nada é persistido.

Lógica real — e uma eventual integração com agentes de verdade — é trabalho futuro, sem prazo prometido (ver [Roadmap](#roadmap)).

## Como experimentar

- **Enquadrar a sala** — arraste o fundo para dar *pan*; use `+`, `−`, **Enquadrar**, `Ctrl` + scroll e as setas do teclado para o zoom. A sala é uma só: todas as mesas de todos os times numa grade de 3 colunas que continua para baixo, linha após linha.
- **Criar um time** — o diálogo **Novo time** pede nome, caminho visual e cor da mesa. O time nasce com uma mesa principal e lugares vazios.
- **Recrutar uma pessoa** — **Recrutar pessoa** sorteia nome e avatar totalmente aleatórios; **Sortear outro** refaz o sorteio, e você escolhe o time de destino.
- **Crescer o escritório** — cada mesa tem exatamente 4 lugares. Quando todos os lugares do time estão ocupados e você adiciona mais uma pessoa, nasce uma nova mesa ao lado da mesa principal do time e as mesas seguintes (inclusive a de equipe) são empurradas para a direita, abrindo mais 4 lugares.
- **Ler os balões de output** — a última saída de cada pessoa aparece como balão acima da cabeça: somente a mais nova substitui a anterior, ela fica 1 segundo e some com animação de entrada e saída.
- **Abrir o painel de uma pessoa** — clique nela para ver o visualizador de contexto (janela de tokens simulada, com composição e mapa) e a aba **Computador** (tarefa simulada, atividade e controles de estado visual).
- **Testar expressões ao vivo** — o painel permite trocar a expressão e conferir cada preset no rosto da pessoa.
- **Montar uma equipe** — o diálogo **Montar equipe** pergunta quantos subagentes você quer. O coordenador sai da cadeira original (que fica reservada, sem duplicar o avatar) e vai para a mesa de equipe encostada, onde os subagentes ocupam os outros lugares. Ao retornar, a mesa de equipe recolhe e os resultados ficam registrados na demo.
- **Recomeçar demo** — o botão do cabeçalho restaura o exemplo inicial.

O painel de contexto — números fictícios, sempre rotulados como simulados:

![Painel lateral de uma pessoa com o visualizador de contexto simulado](demo-contexto.png)

O cabeçalho global traz a marca e as ações **Novo time**, **Recrutar pessoa** e **Recomeçar demo**. Não há sidebar lateral nem cabeçalho por sala.

## Como rodar

Na pasta do projeto:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Abra **http://127.0.0.1:4173**. É só isso: sem `npm install`, sem build, sem chave de API.

Use HTTP local em vez de abrir o `index.html` por `file://` — navegadores restringem referências entre arquivos SVG nesse modo e partes da cena não carregam.

## Estrutura do repositório

- [index.html](index.html), [styles.css](styles.css) e [app.js](app.js) — o app completo, sem build.
- [data.js](data.js) — nomes e frases simuladas.
- [expressions.js](expressions.js) — presets de expressão (enums do Avataaars) e resolução dos assets.
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
- Nome e avatar são totalmente aleatórios: não há conceito de cargo ou função.
- Nada é persistido — recarregar a página ou clicar em **Recomeçar demo** restaura o exemplo.
- Todos os assets são locais: nenhuma chamada externa em runtime.

## Verificação manual

Não há suíte de testes automatizados; a verificação foi manual, no navegador:

- seleção de pessoa e painéis de contexto e computador;
- recrutamento (sorteio de nome e avatar, **Sortear outro**, escolha do time);
- crescimento de mesa ao lotar os 4 lugares — nova mesa nascendo e as mesas seguintes deslizando;
- delegação montada e recolhida, sem duplicar o avatar do coordenador;
- zoom e *pan* (`+`/`−`/enquadrar, `Ctrl` + scroll, arraste e setas);
- layout mobile em **390 × 844**, sem overflow horizontal;
- assets carregando offline, via HTTP local.

## Roadmap

1. **Frontend de demonstração** — este repositório: a sala, as mesas, os balões, os painéis e as expressões, 100% simulados.
2. **Lógica real** — dar comportamento verdadeiro ao que hoje é cenário: tarefas, estados e saídas vindos de execução real.
3. **Integração futura** — conectar a visualização a agentes reais, por exemplo ao DSH. Nada disso existe hoje, e não há prazo prometido.

## Licenças e créditos

- **Código**: [MIT](LICENSE).
- **Avataaars**: bustos e expressões baseados na biblioteca [Avataaars](https://github.com/fangpenlin/avataaars) — design original de **Pablo Stanley**, implementação de **Fang-Pen Lin** — sob licença MIT.
- **avataaars.io** foi usado apenas para baixar os SVGs durante o desenvolvimento; a demo não consulta o serviço em runtime.
- **Atribuições completas**: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); proveniência dos avatares em [assets/AVATARS-SOURCES.md](assets/AVATARS-SOURCES.md) e [assets/AVATARS-EXPRESSIONS.md](assets/AVATARS-EXPRESSIONS.md).

## English summary

**dsh-work-game** is a pure front-end prototype (HTML, CSS, JavaScript and SVG — no dependencies, no build step) that renders a 2D "agent office": one single room where teams sit at modular 4-seat desks arranged in a 3-column grid with infinite rows. People are created with fully random names and Avataaars busts; a small simulated activity engine emits output lines shown as speech bubbles that are replaced only by the newest one and fade after a second; faces change with each person's state using the real Avataaars enums (`eyeType`, `eyebrowType`, `mouthType`) with local SVG variants per identity; clicking a person opens a side panel with a simulated token-context viewer (composition and map, numbers labelled as simulated) and a computer tab; a coordinator can delegate to an attached team desk and return. Everything is in-memory and simulated: this is a demonstration front-end, not a DeepSeek Harness plugin, with no backend and no real agent execution — real logic and any future integration are future work. Run `python3 -m http.server 4173 --bind 127.0.0.1` and open http://127.0.0.1:4173. Code is MIT-licensed; avatars come from the MIT-licensed Avataaars library by Pablo Stanley and Fang-Pen Lin.
