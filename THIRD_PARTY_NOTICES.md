# Avisos de terceiros — dsh-work-game

Este repositório inclui componentes de terceiros. Os termos completos de cada
componente acompanham os arquivos indicados abaixo. O código original do
projeto está sob a licença MIT, descrita em [LICENSE](LICENSE).

---

## Avataaars — biblioteca e artwork (MIT)

- **Componente:** Avataaars — biblioteca de avatares SVG de [Fang-Pen Lin](https://github.com/fangpenlin),
  baseada na biblioteca de desenho (Sketch) Avataaars de [Pablo Stanley](https://avataaars.com/).
- **Direitos autorais:** Copyright (c) 2017 Pablo Stanley, Fang-Pen Lin.
- **Licença:** MIT.
- **Texto integral da licença:** [assets/AVATAARS-LICENSE.txt](assets/AVATAARS-LICENSE.txt)
  (cópia local preservada; idêntica ao texto oficial do repositório).
- **Repositório upstream:** <https://github.com/fangpenlin/avataaars>

Os rostos, cabelos, barbas, óculos e roupas dos avatares são **desenhos
originais da biblioteca Avataaars**, usados e redistribuídos nos termos da
licença MIT, que permite uso, modificação e redistribuição — inclusive em
trabalhos derivados — desde que o aviso de copyright e o texto da permissão
sejam mantidos em todas as cópias. Ambos estão preservados em
[assets/AVATAARS-LICENSE.txt](assets/AVATAARS-LICENSE.txt).

### Renderer avataaars.io (uso apenas em desenvolvimento)

Os SVGs dos avatares foram **gerados durante o desenvolvimento** pelo renderer
oficial [avataaars.io](https://avataaars.io/) (o editor online do projeto
Avataaars), que renderiza a mesma biblioteca. **Este aplicativo não chama
avataaars.io, nem nenhum outro serviço externo, em tempo de execução.** Todos
os avatares são arquivos locais e o app funciona offline. As URLs de origem
registradas em [assets/AVATARS-SOURCES.md](assets/AVATARS-SOURCES.md) são
proveniência documental, não dependência de execução.

### Arquivos derivados incluídos neste repositório

Os oito avatares abaixo são os arquivos gerados pelo renderer (derivados do
artwork da biblioteca Avataaars) e incluídos localmente em `assets/avatars/`:

| Arquivo | Descrição |
| --- | --- |
| [assets/avatars/rui.svg](assets/avatars/rui.svg) | Avatar "Rui" |
| [assets/avatars/bia.svg](assets/avatars/bia.svg) | Avatar "Bia" (roupa recolorizada) |
| [assets/avatars/lia.svg](assets/avatars/lia.svg) | Avatar "Lia" |
| [assets/avatars/pesquisa.svg](assets/avatars/pesquisa.svg) | Avatar "Pesquisa" (roupa recolorizada) |
| [assets/avatars/codigo.svg](assets/avatars/codigo.svg) | Avatar "Código" (roupa recolorizada) |
| [assets/avatars/testes.svg](assets/avatars/testes.svg) | Avatar "Testes" |
| [assets/avatars/alex.svg](assets/avatars/alex.svg) | Avatar "Alex" |
| [assets/avatars/maya.svg](assets/avatars/maya.svg) | Avatar "Maya" (roupa recolorizada) |

### Modificações locais — 4 recolorizações de roupa

Quatro dos oito arquivos sofreram **uma única substituição de atributo `fill`
na roupa**, para corresponder à paleta do projeto. Nenhum traço facial, cabelo,
geometria, máscara, dimensão ou fundo foi alterado. Os outros quatro arquivos
são byte a byte idênticos aos gerados. Os detalhes exatos (valor original →
valor aplicado, hashes SHA-256 e validação) estão documentados em
[assets/AVATARS-SOURCES.md](assets/AVATARS-SOURCES.md), seção
"Adaptações locais, somente na cor das roupas":

- `bia.svg` — roupa `PastelBlue` → `#8357BF`
- `pesquisa.svg` — roupa `PastelGreen` → `#3C8652`
- `codigo.svg` — roupa `PastelOrange` → `#D47A36`
- `maya.svg` — roupa `PastelGreen` → `#2F9A94`

A licença MIT não exige marcar as modificações; esta documentação é uma
cortesia de proveniência.

### Nenhum rosto foi redesenhado por IA

**Nenhum rosto, cabelo, barba, óculo ou roupa destes avatares foi redesenhado,
retratado ou gerado por inteligência artificial.** Todos são os desenhos
originais da biblioteca Avataaars, renderizados pelo serviço oficial durante o
desenvolvimento; as únicas alterações posteriores foram as quatro recolorizações
de roupa descritas acima.

---

## Proveniência completa

A proveniência detalhada de cada avatar (parâmetros exatos do renderer, datas,
dimensões, hashes SHA-256 e validações realizadas) está em
[assets/AVATARS-SOURCES.md](assets/AVATARS-SOURCES.md).
