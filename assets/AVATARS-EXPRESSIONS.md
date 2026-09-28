# Expressões Avataaars locais — proveniência, presets e hashes

Módulo de expressões da demo **dsh-work-game**: cada pessoa muda de expressão conforme o estado (apenas `eyes`/`eyebrows`/`mouth`), mantendo **a mesma identidade** (cabelo, pele, roupa, acessórios) dos bustos em [assets/avatars/](assets/avatars/).

- Gerado em **2026-09-27 (UTC)**, durante o desenvolvimento, com downloads diretos do renderer [avataaars.io](https://avataaars.io/) (`avatarStyle=Transparent` em todos).
- **Todos os traços são desenhos originais da biblioteca Avataaars renderizados pelo serviço indicado — nada foi redesenhado nem gerado por IA.** Somente olhos, sobrancelhas e boca mudam entre presets; a paleta das roupas foi recolorizada apenas nos quatro casos já documentados em [AVATARS-SOURCES.md](AVATARS-SOURCES.md).
- Licença MIT, copyright **2017 Pablo Stanley, Fang-Pen Lin**, preservada em [AVATAARS-LICENSE.txt](AVATAARS-LICENSE.txt) (texto oficial: https://raw.githubusercontent.com/fangpenlin/avataaars/master/LICENSE).
- Uso **100% local/offline**: os SVGs são carregados por `<img>`; as URLs abaixo são registro de proveniência, não dependência de execução.

## Enums verificados no repositório oficial

Os enums foram conferidos no código-fonte de https://github.com/fangpenlin/avataaars (ramo `master`) antes da geração:

| Enum (query key) | Valores registrados | Fonte |
| --- | --- | --- |
| `eyeType` (12) | Close, Cry, Default, Dizzy, EyeRoll, Happy, Hearts, Side, Squint, Surprised, Wink, WinkWacky | `src/avatar/face/eyes/index.tsx` |
| `eyebrowType` (12) | Angry, AngryNatural, Default, DefaultNatural, FlatNatural, RaisedExcited, RaisedExcitedNatural, SadConcerned, SadConcernedNatural, UnibrowNatural, UpDown, UpDownNatural | `src/avatar/face/eyebrow/index.tsx` |
| `mouthType` (12) | Concerned, Default, Disbelief, Eating, Grimace, Sad, ScreamOpen, Serious, Smile, Tongue, Twinkle, Vomit | `src/avatar/face/mouth/index.tsx` |
| `topType` (35) | NoHair, Eyepatch, Hat, Hijab, Turban, WinterHat1–4, LongHairBigHair, LongHairBob, LongHairBun, LongHairCurly, LongHairCurvy, LongHairDreads, LongHairFrida, LongHairFro, LongHairFroBand, LongHairNotTooLong, LongHairShavedSides, LongHairMiaWallace, LongHairStraight, LongHairStraight2, LongHairStraightStrand, ShortHairDreads01, ShortHairDreads02, ShortHairFrizzle, ShortHairShaggyMullet, ShortHairShortCurly, ShortHairShortFlat, ShortHairShortRound, ShortHairShortWaved, ShortHairSides, ShortHairTheCaesar, ShortHairTheCaesarSidePart | `src/avatar/top/index.tsx` |
| `hairColor` (11) | Auburn, Black, Blonde, BlondeGolden, Brown, BrownDark, PastelPink, Blue, Platinum, Red, SilverGray | `src/avatar/top/HairColor.tsx` |
| `accessoriesType` (7) | Blank, Kurt, Prescription01, Prescription02, Round, Sunglasses, Wayfarers | `src/avatar/top/accessories/index.tsx` |
| `facialHairType` (6) | BeardLight, BeardMajestic, BeardMedium, Blank, MoustacheFancy, MoustacheMagnum | `src/avatar/top/facialHair/index.tsx` |
| `facialHairColor` (9) | Auburn, Black, Blonde, BlondeGolden, Brown, BrownDark, Platinum, Red, SilverGray | `src/avatar/top/facialHair/Colors.tsx` |
| `clotheType` (9) | BlazerShirt, BlazerSweater, CollarSweater, GraphicShirt, Hoodie, Overall, ShirtCrewNeck, ShirtScoopNeck, ShirtVNeck | `src/avatar/clothes/index.tsx` |
| `clotheColor` (15) | Black, Blue01, Blue02, Blue03, Gray01, Gray02, Heather, PastelBlue, PastelGreen, PastelOrange, PastelRed, PastelYellow, Pink, Red, White | `src/avatar/clothes/Colors.tsx` |
| `skinColor` (7) | Tanned, Yellow, Pale, Light, Brown, DarkBrown, Black | `src/avatar/Skin.tsx` |

As chaves de query conferem com `src/options/index.tsx` (`EyesOption=eyeType`, `EyebrowOption=eyebrowType`, `MouthOption=mouthType`, etc.).

### Divergências encontradas (e tratadas)

1. **`FrownNatural` não está registrada** em `src/avatar/face/eyebrow/index.tsx` — o arquivo `eyebrow/FrownNatural.tsx` existe, mas não entra no `<Selector>`. **Não foi usada.** O conjunto de sobrancelhas tem exatamente os 12 valores da tabela (conforme previsto no pedido).
2. **`ShortHairShaggy` não está registrada** em `src/avatar/top/index.tsx`: o componente está comentado no render com o comentário do autor `XXX: broken, fix it later`. Portanto `topType` válido tem **35** valores (e não 36); `ShortHairShaggy` foi evitada nas identidades aleatórias.
3. `BeardMagestic` aparece apenas no `dist/` (typo antigo); o nome registrado é **`BeardMajestic`**, usado aqui.
4. Nenhuma outra divergência: `CollarSweater` (gola) confirmada em `src/avatar/clothes/index.tsx`.

## Presets de expressão (14)

Cada preset troca somente `eyeType`/`eyebrowType`/`mouthType`; a identidade é fixa por pessoa.

| Preset | Rótulo | eyeType | eyebrowType | mouthType | Quando usar |
| --- | --- | --- | --- | --- | --- |
| `idle` | Em repouso | Default | DefaultNatural | Smile | parado, sem tarefa em andamento |
| `working` | Trabalhando | Happy | DefaultNatural | Twinkle | executando a tarefa normal |
| `focused` | Concentrado | Squint | FlatNatural | Serious | foco profundo / modo silencioso |
| `tool` | Com ferramenta | WinkWacky | RaisedExcited | Smile | acionou ferramenta/terminal |
| `searching` | Procurando | Side | UpDown | Concerned | busca/varredura em andamento |
| `thinking` | Pensando | Squint | UnibrowNatural | Concerned | planejando, deliberando |
| `waiting` | Esperando | Default | SadConcerned | Sad | aguardando fila ou resposta |
| `approval` | Aprovando | Wink | RaisedExcited | Smile | aprovação / sinal positivo |
| `success` | Sucesso | Happy | RaisedExcitedNatural | Smile | tarefa concluída com sucesso |
| `celebrating` | Comemorando | WinkWacky | RaisedExcited | Tongue | vitória, festa, conquista |
| `error` | Erro | Cry | AngryNatural | Grimace | falha, erro, derrota momentânea |
| `surprised` | Surpreso | Surprised | RaisedExcited | ScreamOpen | evento inesperado, bug súbito |
| `disbelief` | Descrente | EyeRoll | UpDownNatural | Disbelief | incredulidade, "não acredito" |
| `wink` | Piscada | Wink | RaisedExcited | Smile | gracejo, interação casual |

Observação de deduplicação: **`approval` e `wink` compartilham o mesmo triple** (`Wink`/`RaisedExcited`/`Smile`) — a aprovação é dada com uma piscada. O conteúdo SVG é o mesmo arquivo copiado, sem novo download. São **13 triples distintos** para 14 presets.

## Identidades nomeadas (8) — opções fixas

Opções idênticas às queries de [AVATARS-SOURCES.md](AVATARS-SOURCES.md); só olhos/sobrancelha/boca mudam entre os 14 presets de cada pessoa.

| Pessoa | topType | hairColor | accessoriesType | facialHairType | facialHairColor | clotheType | clotheColor | skinColor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rui` | ShortHairShortCurly | Black | Prescription02 | BeardMedium | Black | Hoodie | Black | Light |
| `bia` | LongHairCurly | Brown | Blank | Blank | Brown | ShirtCrewNeck | PastelBlue | Light |
| `lia` | LongHairCurvy | BrownDark | Blank | Blank | BrownDark | ShirtCrewNeck | Black | Light |
| `pesquisa` | ShortHairShortCurly | Black | Prescription02 | Blank | Black | CollarSweater | PastelGreen | DarkBrown |
| `codigo` | ShortHairShortCurly | Brown | Blank | BeardMedium | Brown | Hoodie | PastelOrange | Light |
| `testes` | LongHairStraight2 | Blonde | Blank | Blank | Blonde | ShirtCrewNeck | Pink | Light |
| `alex` | ShortHairShortFlat | BrownDark | Blank | Blank | BrownDark | ShirtCrewNeck | Blue02 | Tanned |
| `maya` | LongHairStraight | Black | Blank | Blank | Black | ShirtCrewNeck | PastelGreen | Tanned |

### Recolorizações reaplicadas

As quatro substituições locais já descritas em [AVATARS-SOURCES.md](AVATARS-SOURCES.md) foram **reaplicadas em todos os 14 variantes** de cada pessoa (mesmo `fill`, exatamente 1 ocorrência por arquivo; nenhum outro byte foi alterado):

| Pessoa | Opção válida no download | Substituição local | Arquivos afetados |
| --- | --- | --- | --- |
| `bia` | `PastelBlue` | `#B1E2FF` → `#8357BF` | `assets/avatars/expressions/bia/*.svg` (14) |
| `pesquisa` | `PastelGreen` | `#A7FFC4` → `#3C8652` | `assets/avatars/expressions/pesquisa/*.svg` (14) |
| `codigo` | `PastelOrange` | `#FFDEB5` → `#D47A36` | `assets/avatars/expressions/codigo/*.svg` (14) |
| `maya` | `PastelGreen` | `#A7FFC4` → `#2F9A94` | `assets/avatars/expressions/maya/*.svg` (14) |

As outras quatro pessoas (`rui`, `lia`, `testes`, `alex`) e todas as identidades aleatórias mantêm as cores oficiais do renderer.

## Identidades aleatórias (12) — configuração completa

Sorteio determinístico (`random.Random(20260927)`) sobre os enums registrados; cada identidade tem 4 presets renderizados (`idle`, `working`, `success`, `error`).

| Id | topType | hairColor | accessoriesType | facialHairType | facialHairColor | clotheType | clotheColor | skinColor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r01` | LongHairFrida | Blue | Prescription01 | BeardLight | Black | BlazerSweater | PastelBlue | Light |
| `r02` | LongHairStraightStrand | SilverGray | Blank | BeardMedium | Black | CollarSweater | Pink | DarkBrown |
| `r03` | ShortHairShortFlat | Brown | Prescription01 | BeardLight | Blonde | Overall | Red | Brown |
| `r04` | LongHairCurly | SilverGray | Blank | MoustacheFancy | Blonde | ShirtVNeck | White | Tanned |
| `r05` | LongHairNotTooLong | BlondeGolden | Round | Blank | Black | ShirtCrewNeck | Blue01 | Tanned |
| `r06` | Hat | PastelPink | Blank | BeardMajestic | Brown | Overall | Black | Yellow |
| `r07` | ShortHairShortWaved | Blonde | Round | BeardMajestic | Blonde | BlazerSweater | Blue03 | Tanned |
| `r08` | Hat | Blonde | Round | MoustacheFancy | Black | BlazerShirt | PastelOrange | Light |
| `r09` | WinterHat1 | Blue | Sunglasses | BeardLight | Brown | BlazerSweater | Blue03 | Black |
| `r10` | ShortHairShortFlat | Red | Round | BeardLight | Auburn | ShirtVNeck | Pink | Yellow |
| `r11` | LongHairFrida | Blue | Sunglasses | Blank | Brown | GraphicShirt | PastelYellow | Yellow |
| `r12` | LongHairStraight2 | Red | Wayfarers | MoustacheMagnum | Blonde | BlazerSweater | Pink | Tanned |

## Estrutura de arquivos e módulo de presets

```text
expressions.js                                  # window.DSH_EXPRESSIONS (contrato abaixo)
assets/AVATARS-EXPRESSIONS.md                   # este documento
assets/avatars/expressions/<pessoa>/<preset>.svg  # 8 pessoas × 14 presets = 112
assets/avatars/random/<id>/<preset>.svg           # 12 ids × 4 presets  =  48
```

Contrato de `window.DSH_EXPRESSIONS` (script puro, sem módulos):

```js
presets           // [{id,label,eyeType,eyebrowType,mouthType,when}] — 14 itens
namedIdentityIds  // ['rui','bia','lia','pesquisa','codigo','testes','alex','maya']
randomIdentityIds // ['r01'..'r12']
identities        // mapa id -> config: nomeadas = só referência (avatar base + dir + presets);
                  // aleatórias = enums completos (topType, hairColor, accessoriesType,
                  // facialHairType, facialHairColor, clotheType, clotheColor, skinColor)
basePreset        // 'idle'
resolve(identityId, presetId) // -> caminho local do SVG; se faltar o preset, cai para 'idle';
                  // se ainda faltar, 'assets/avatars/<identityId>.svg' (só nomeadas); senão null
```

Exemplos de `resolve`: `resolve("maya","disbelief")` → `assets/avatars/expressions/maya/disbelief.svg`; `resolve("r07","celebrating")` (preset sem asset para aleatórias) → `assets/avatars/random/r07/idle.svg`; `resolve("desconhecida","idle")` → `null`.

## Downloads e contagem

- **146 downloads** de `avataaars.io` (todas as respostas HTTP 200, `Content-Type: image/svg+xml`), **14 cópias locais**:
  - 8 identidades × 13 triples distintos = 104; desses, 6 arquivos `idle` reaproveitam o busto já baixado (`Default`/`DefaultNatural`/`Smile`) de `rui`, `bia`, `codigo`, `testes`, `alex` e `maya` → **98 downloads** nomeados;
  - `wink.svg` de cada pessoa = cópia do `approval.svg` (mesmo triple) → 8 cópias;
  - 12 identidades aleatórias × 4 presets = **48 downloads**.
- **160 SVGs finais** (112 nomeados + 48 aleatórios) + `expressions.js`.
- **Tamanho total em disco**: **2.506.862 bytes** para os 160 SVGs (2.39 MiB) — `expressions/` e `random/` — e 10.797 bytes para `expressions.js`; total **2.517.659 bytes** (~2.40 MiB).

## Validações executadas

1. **XML bem formado** (`xml.etree.ElementTree`) em 160/160 SVGs; raiz `<svg>` e `viewBox="0 0 264 280"` conferidos em todos.
2. **Sem `<script>`, `foreignObject`, atributos `on*`, DOCTYPE/entidades, `@import`, `javascript:` ou URLs externas** em 160/160 (declarações `xmlns` são identificadores de namespace, não URLs de recurso).
3. **Renderização local com `rsvg-convert` em 160/160** (o pedido pedia ao menos 8): todas rasterizam com conteúdo não vazio (alfa médio > 0, medido com ImageMagick em memória, sem criar arquivos extras).
4. **Identidade preservada**: comparação geométrica (multiconjunto de formas `path`/`rect`/`circle`/`ellipse` com fill efetivo) entre cada busto base e seus variantes confirma que **nenhuma forma de cabelo/pele/roupa foi trocada**; as formas diferentes são exclusivamente olhos/sobrancelha/boca (incluindo dentes/brilhos de boca). O `idle` das seis pessoas reaproveitadas é byte-idêntico ao busto base.
5. **Recolorizações**: 0 ocorrências do hex de origem restantes; o hex final aparece exatamente 1× em cada um dos 56 arquivos afetados; nenhum hex de recolorização aparece nas demais pessoas ou nas aleatórias.
6. **Contrato do módulo** testado em Node: 14 presets com campos completos, enums dentro dos conjuntos registrados, `resolve()` com fallback `idle` → busto base → `null`, e todos os caminhos retornados existem em disco (280 resoluções verificadas).

## SHA-256 dos arquivos finais

Hashes SHA-256 em minúsculas, dos bytes exatos em disco.

| Arquivo | Bytes | SHA-256 |
| --- | --- | --- |
| `assets/avatars/expressions/alex/approval.svg` | 10114 | `51b8996927d9027be7c86e8fe2a3a3fabbaae540000fcf504eb9f462d35678d6` |
| `assets/avatars/expressions/alex/celebrating.svg` | 10447 | `81f31241b68b34865da3a5d15f7403be1cf54029f12a2b3655a9af3a8344c41e` |
| `assets/avatars/expressions/alex/disbelief.svg` | 8959 | `22f4b3c377fe3d7bdb84e7dfa0790c9774138063d51e4811aecdc5a825179cce` |
| `assets/avatars/expressions/alex/error.svg` | 10543 | `c0e069348ce31d5db79f169306571e00af08cc44102dba3b2ba9b9cd1ef93b9f` |
| `assets/avatars/expressions/alex/focused.svg` | 10407 | `14c22189a060f89be3ed65b169251cc39ad5b676640c6bf9d9f160933558eab4` |
| `assets/avatars/expressions/alex/idle.svg` | 9488 | `43139d42f89bdf934feee1463fa8460d7690d56c2119c3abadd494dc69f8887c` |
| `assets/avatars/expressions/alex/searching.svg` | 11108 | `10ce79be43bc25964c799eaf0a121dc8ad353d1aad4ad546d399f6df71f4e12b` |
| `assets/avatars/expressions/alex/success.svg` | 10215 | `3e1295aabbe57deed0171cbcef12038245be6683cc22969e1732aa557daa04a4` |
| `assets/avatars/expressions/alex/surprised.svg` | 10171 | `3787b04dfb4fd125b254fc6a4f7ed1e6a4b5cb0c2c848f81b3da216f2cb101de` |
| `assets/avatars/expressions/alex/thinking.svg` | 11763 | `e18edb5aa90b70bc3b408d6197468dc282296364254d5291482115c7101d4c07` |
| `assets/avatars/expressions/alex/tool.svg` | 10144 | `8e08c0dec6ba89f69513332e21647f1a6142383d73adf4a6ae025fb43195fdb7` |
| `assets/avatars/expressions/alex/waiting.svg` | 9275 | `094a78e84913824ad1c47e965743d154f81787aaac246afa7eae53417f0535c4` |
| `assets/avatars/expressions/alex/wink.svg` | 10114 | `51b8996927d9027be7c86e8fe2a3a3fabbaae540000fcf504eb9f462d35678d6` |
| `assets/avatars/expressions/alex/working.svg` | 9763 | `59139854b9bc08fabe9c5e600201ac01d36b5782d919be6fd1c1de7e5b456e0b` |
| `assets/avatars/expressions/bia/approval.svg` | 9815 | `553e5a8779c8c701a0388d2717ab5490cf424bf528858ade551aeb95f4f4e559` |
| `assets/avatars/expressions/bia/celebrating.svg` | 10148 | `14e3d91f1d0c4a76b223a6a5ee50e0733b6194950419245ddbab30e9d07525fb` |
| `assets/avatars/expressions/bia/disbelief.svg` | 8660 | `2ba7a2dc605fa750dc983ac0f6b6ee8e6c3d4df875f38a2012faea2b120c2753` |
| `assets/avatars/expressions/bia/error.svg` | 10244 | `7d9ac472cb64373ff9405e19e4859e9772f139a10c6b67920442d6ac88f79d32` |
| `assets/avatars/expressions/bia/focused.svg` | 10108 | `9e0959087f7b4bf836cbec0c0e5d7ec1fdcbc7e67be8a6dcc9b11069fe364ce6` |
| `assets/avatars/expressions/bia/idle.svg` | 9189 | `fd4a558d59940a01b9457cc66e88bdeb9ed3ca2e8d2cd05f84dde64d03ffa4c0` |
| `assets/avatars/expressions/bia/searching.svg` | 10809 | `5ffa674f0147debc006da1471bd124fbb53c29239b47cbd54ecd57ef5b62699a` |
| `assets/avatars/expressions/bia/success.svg` | 9916 | `1f32fae6820efeed3204f405980539fd30cfbadb71ccea9f0985b2619cf9ac57` |
| `assets/avatars/expressions/bia/surprised.svg` | 9872 | `d1b0cca272f530bd4d8f30ac3a81bb73f0a454b95900cc683eb5ce68746e36a1` |
| `assets/avatars/expressions/bia/thinking.svg` | 11464 | `9ecc212636f52bdd274cfb066c6cd000b06d63cc06ec9627e82e270896a4583d` |
| `assets/avatars/expressions/bia/tool.svg` | 9845 | `8f372c52cab1856ce9612c2b818f566f8d138489060b6888bcfc02cc6ecbbc21` |
| `assets/avatars/expressions/bia/waiting.svg` | 8976 | `69c3a34f5396962c976ba84149aa1305ad0d5750227ab8fc843c9d80a46acc9f` |
| `assets/avatars/expressions/bia/wink.svg` | 9815 | `553e5a8779c8c701a0388d2717ab5490cf424bf528858ade551aeb95f4f4e559` |
| `assets/avatars/expressions/bia/working.svg` | 9464 | `99bdc611bc2085a3c70e082485cd7e4eee3538c4772025b408b7dbbd4914e2e1` |
| `assets/avatars/expressions/codigo/approval.svg` | 14849 | `fa29d75f996ebdc36ed6bd6126a466d6607c53d028d37dad618cf1a26f6fa442` |
| `assets/avatars/expressions/codigo/celebrating.svg` | 15182 | `1607590ccdd9714bd74f33575a26dc6dd3cc46ca923051eefd5430637699383d` |
| `assets/avatars/expressions/codigo/disbelief.svg` | 13694 | `6fd67be76a8ca281b7a573ca586e8c9a21dac4462bbd20e43f840e4fa7863374` |
| `assets/avatars/expressions/codigo/error.svg` | 15278 | `246c5ba51afc0565d60210c97190a969d1b4157e692b2d619645bc13425b246c` |
| `assets/avatars/expressions/codigo/focused.svg` | 15142 | `72f870a0b6a9e16454ed2e0efb73e9b3c89c92ec07b47b3ba0550230f3b19c9d` |
| `assets/avatars/expressions/codigo/idle.svg` | 14223 | `67c53f89921e52c6c80209c726297921d82adebd24eb658c3aad852b686a1e45` |
| `assets/avatars/expressions/codigo/searching.svg` | 15843 | `0747d49013404cc09644d052350f422af048a937a3644694ea435f02e2b7014e` |
| `assets/avatars/expressions/codigo/success.svg` | 14950 | `9c084b321f74b78c0dd7eb8e2efb8c34f21e862d1edea1fa2e93a2fd1df3f565` |
| `assets/avatars/expressions/codigo/surprised.svg` | 14906 | `780c3c0963a1ff6fdcb8149c328e9007064f70683d6b375d86c8fa9f6ee8fc7b` |
| `assets/avatars/expressions/codigo/thinking.svg` | 16498 | `92375393de5a19bbface033756e851cf24d81539e6c26e0a3cb40e84d5dc619a` |
| `assets/avatars/expressions/codigo/tool.svg` | 14879 | `56360ccbcc119b73dfb73e7bc991dd34127a4017f71126dbd4483f80fcf43257` |
| `assets/avatars/expressions/codigo/waiting.svg` | 14010 | `f87749f940aed15f2188378859b1e2ae33614b209ca6a8fd63ddef356a441bdd` |
| `assets/avatars/expressions/codigo/wink.svg` | 14849 | `fa29d75f996ebdc36ed6bd6126a466d6607c53d028d37dad618cf1a26f6fa442` |
| `assets/avatars/expressions/codigo/working.svg` | 14498 | `801dcb7c3e253920132080a98b6dcf135424844bccf3b23c512756020b951279` |
| `assets/avatars/expressions/lia/approval.svg` | 24801 | `f5e5dcf3f9aa863735ad7373390f4df2581c0c754c204e4488ec2434708a96da` |
| `assets/avatars/expressions/lia/celebrating.svg` | 25134 | `ebeecff4aaec00459a9f677399b37f70a35c38a65eadd43d5852503c434b4cb9` |
| `assets/avatars/expressions/lia/disbelief.svg` | 23646 | `db647f1eb0ea292b4a2448942009e1131e8c3c1a9a8dfb2e8140db66e4b8085b` |
| `assets/avatars/expressions/lia/error.svg` | 25230 | `20a116ccd2fbc39bc2d6d98f3c58adb145bc8a1cbd114a2651e22af8ae232eff` |
| `assets/avatars/expressions/lia/focused.svg` | 25094 | `466e052fad69e7da28e37ea18d256f86f39f987b2ef7e1a44a60a6d93db82656` |
| `assets/avatars/expressions/lia/idle.svg` | 24175 | `3119a6884fdc1223057f67018b090c6e6fc95754e97dd21b4b405b0ece069eb6` |
| `assets/avatars/expressions/lia/searching.svg` | 25795 | `c482705a4f871f33656965bce3cff5b2ee02f5c2e589a189188d2c0b423a2f0f` |
| `assets/avatars/expressions/lia/success.svg` | 24902 | `f8d0b1acf19908af6a2561b153253d19cac3bf4a3940dd78d9c1142ecd2aec2a` |
| `assets/avatars/expressions/lia/surprised.svg` | 24858 | `c08a0b0024069ebb5fa911c4a23c1a4a6817758fabab6d1056754de9e889e5c4` |
| `assets/avatars/expressions/lia/thinking.svg` | 26450 | `27736c55a0b97d5e0fe8fc08c77b4d4e0325d2390b7941f7ad3bf25ded0fc9e2` |
| `assets/avatars/expressions/lia/tool.svg` | 24831 | `ee4e74be3dc8f25dc0c55d26936f7a197106bd6eda7c2bae530e2e68b3e2af4f` |
| `assets/avatars/expressions/lia/waiting.svg` | 23962 | `70c080fd3de579b6732497a310117f4845619ce6984832588b07d55b08c879b7` |
| `assets/avatars/expressions/lia/wink.svg` | 24801 | `f5e5dcf3f9aa863735ad7373390f4df2581c0c754c204e4488ec2434708a96da` |
| `assets/avatars/expressions/lia/working.svg` | 24450 | `2cdaf5256b85c6a51acd5100b7ad1a7e48767265f4bf1bfc83ed27eca5da7481` |
| `assets/avatars/expressions/maya/approval.svg` | 9376 | `157d3ceed0efed650d8a6485f89e5d32bcc8901602d65ce52b6e9b48761eb96d` |
| `assets/avatars/expressions/maya/celebrating.svg` | 9709 | `2bb800d0a3f4179d352e96e4fa667efc5f2c1655709325a5a41a7f2d2fc03e57` |
| `assets/avatars/expressions/maya/disbelief.svg` | 8221 | `c2bd0ab150b6e5126c79ff21e6df9b8378c8e2048c30da00de8806768b529993` |
| `assets/avatars/expressions/maya/error.svg` | 9805 | `e7d4f83f0e234b50c40f384c59b34225a0d9befb520ad7a42bf6f001bd9031c9` |
| `assets/avatars/expressions/maya/focused.svg` | 9669 | `db73eff880f3909c989186123dd338a7e01f661ba25cff08dbfe9f3a67d06bad` |
| `assets/avatars/expressions/maya/idle.svg` | 8750 | `3eac8af6c77b3d936b1024521981b00f8ff66d1d11bbbe969a269ed4c4de9379` |
| `assets/avatars/expressions/maya/searching.svg` | 10370 | `47bc05797a88676c5ff72bff7b6f6569bf6758869c593f029a84ec4a4528ee78` |
| `assets/avatars/expressions/maya/success.svg` | 9477 | `aece464a5e87cdd5106e1255bece8880d168c647bf38051d03c34e30ff065aa4` |
| `assets/avatars/expressions/maya/surprised.svg` | 9433 | `e4f68769cbc8671f44897f9491e128a2c84f59e68cc7be7f00d7b6e8dc028cc9` |
| `assets/avatars/expressions/maya/thinking.svg` | 11025 | `661f9c3df843ca5b028ef542085b43d415a539364180b11eb05262958aa094a6` |
| `assets/avatars/expressions/maya/tool.svg` | 9406 | `50c3d5cb32d05c3998807b63fd8e5cb8e8799f475cfd68000734381b21b642e5` |
| `assets/avatars/expressions/maya/waiting.svg` | 8537 | `f6e3c00df68bad44563bbca4868a029f176a1adfe3550a59de26505f488a1515` |
| `assets/avatars/expressions/maya/wink.svg` | 9376 | `157d3ceed0efed650d8a6485f89e5d32bcc8901602d65ce52b6e9b48761eb96d` |
| `assets/avatars/expressions/maya/working.svg` | 9025 | `ad627afa3d4b8ecad958f25165f4a9489627f55b3128ae5dbc36a106d357e5ea` |
| `assets/avatars/expressions/pesquisa/approval.svg` | 14874 | `6f24dba7d75e8535bd0e8d911e2a5b80af855fe01bb9e60d5a655b4c39199bb7` |
| `assets/avatars/expressions/pesquisa/celebrating.svg` | 15207 | `6501db373fc5a4731442bac07d65002131a3b35ad5be8782a17a2d768f0d58df` |
| `assets/avatars/expressions/pesquisa/disbelief.svg` | 13719 | `63be05da478e4d2a8432523169d243b33e6768f970280318641c56952f50a633` |
| `assets/avatars/expressions/pesquisa/error.svg` | 15303 | `55a2186bc7b24393f0efc0c99bbe9e60074f8baeb2101341131c7a296972ac43` |
| `assets/avatars/expressions/pesquisa/focused.svg` | 15167 | `f81faad4fbb4ea578cbac27437d6e4e8b8225423c8009047a7c4bf42d5d21fb1` |
| `assets/avatars/expressions/pesquisa/idle.svg` | 14248 | `4ffeb79aa28893afef9f7aa1c92eb030767351e35b6eb713dbcc5747874987f7` |
| `assets/avatars/expressions/pesquisa/searching.svg` | 15868 | `bee98569f4650c1a5bdcc61b698b18e2523e812911eeb96fd85012de35ae9611` |
| `assets/avatars/expressions/pesquisa/success.svg` | 14975 | `a2fb5c239ea8c28e383b0302a01e450aab93f6d2f8b685a7d34ac35af4f796bd` |
| `assets/avatars/expressions/pesquisa/surprised.svg` | 14931 | `cc7d8a82ca327b8e1af7dcc7cd0bb1a047656b07792c6967714102ab1904dd0b` |
| `assets/avatars/expressions/pesquisa/thinking.svg` | 16523 | `67363b306643d384a99c4104ec79dc463f73dd4f5d3a3d5c00828975c9858436` |
| `assets/avatars/expressions/pesquisa/tool.svg` | 14904 | `98e4bb08a3a3a4f0b26e96b30bd958a3998c18ffc5f7d2c6aef31fabf7c1fbe0` |
| `assets/avatars/expressions/pesquisa/waiting.svg` | 14035 | `f949774e39368c95b027530c72b5ebc97d6bdd9c4834b649332508103981ee9e` |
| `assets/avatars/expressions/pesquisa/wink.svg` | 14874 | `6f24dba7d75e8535bd0e8d911e2a5b80af855fe01bb9e60d5a655b4c39199bb7` |
| `assets/avatars/expressions/pesquisa/working.svg` | 14523 | `b36958524cbd1c0d48cdd5840ab3b1f9452be4a264623bcd2572b3695372366c` |
| `assets/avatars/expressions/rui/approval.svg` | 18023 | `46d8803d7134fbb33fcee4d9c3b4d7b87ec2ff5a93c58efb20f4ea4a3fb8781e` |
| `assets/avatars/expressions/rui/celebrating.svg` | 18356 | `f582c87010ef8581853d69afa67198bbfbda99dfced79941203ac97892561135` |
| `assets/avatars/expressions/rui/disbelief.svg` | 16868 | `d28cf6fae46d62a1ca36e84c10936cac0ce8adcbb735212e0bdb516246bf9c57` |
| `assets/avatars/expressions/rui/error.svg` | 18452 | `b3a5f6c3a58f2d11b09f0c1dba310c205d7d49a388b98703b9d104fbf209aa6b` |
| `assets/avatars/expressions/rui/focused.svg` | 18316 | `87ce04d97752777ba83626e3fecc216f623c8016406809a7f2e882c0a68832c0` |
| `assets/avatars/expressions/rui/idle.svg` | 17397 | `08ec2b485698390d52c913cd575261f31d59c931435d218c39c0172e6a64c21e` |
| `assets/avatars/expressions/rui/searching.svg` | 19017 | `0b566d304935d1b3f9a8e4bfe11f5f6b04c826a3d12a6e80bf19d7f6cabcb9f9` |
| `assets/avatars/expressions/rui/success.svg` | 18124 | `4d5f004a49dfd7014504145cea4b15fb5850a3b61309dda96d218b20fc06a698` |
| `assets/avatars/expressions/rui/surprised.svg` | 18080 | `2453fd61fb7b0eea78b488bdceed7da5d1eef88c8f93627c50c7d6938174c4dd` |
| `assets/avatars/expressions/rui/thinking.svg` | 19672 | `624e01073c30be3135a04f800908ab7a1df80af5067bc0369c86f04d6b301d9f` |
| `assets/avatars/expressions/rui/tool.svg` | 18053 | `01b57267780cf9ea61f5d0251a9fd0c41e80183858656c05e85c00a223d3f510` |
| `assets/avatars/expressions/rui/waiting.svg` | 17184 | `5185e38711473ddba1abe49a0fdf862449cbdd9b0a40519f39bff48a2bf50669` |
| `assets/avatars/expressions/rui/wink.svg` | 18023 | `46d8803d7134fbb33fcee4d9c3b4d7b87ec2ff5a93c58efb20f4ea4a3fb8781e` |
| `assets/avatars/expressions/rui/working.svg` | 17672 | `867643e32499b2ffb2b9a83d0aea98118d5807eb91dfee9478fe7836beed1f9d` |
| `assets/avatars/expressions/testes/approval.svg` | 12113 | `9d95e44be3219db526b025838f178631e5c021abdb189dcd83938a8db35634b4` |
| `assets/avatars/expressions/testes/celebrating.svg` | 12446 | `f5d57c75ac258c32bc8631737165a2dc42c7db9d64d7c9da07656849b4a88352` |
| `assets/avatars/expressions/testes/disbelief.svg` | 10958 | `720f416376aac5eb6b28a8ef9f7fc8ad9fbc8b668c19b840f16bf9c7c1e58a8d` |
| `assets/avatars/expressions/testes/error.svg` | 12542 | `e2ce5cef267a2b251a3e1b2acaa58a27855bea6f4440962330147ad136507dd7` |
| `assets/avatars/expressions/testes/focused.svg` | 12406 | `36e574ef56cf84ef5c3b0d07003a1b2d343220578bbdf891f7b6f450cb854e4c` |
| `assets/avatars/expressions/testes/idle.svg` | 11487 | `15a96176c6cc5a08eb4d135ca965523d33c4252283ecfc36a85aa6a765878cba` |
| `assets/avatars/expressions/testes/searching.svg` | 13107 | `453113d8a58787d1c4b80c23fbc6450d1fbda53990897b17d2b37e286dadd156` |
| `assets/avatars/expressions/testes/success.svg` | 12214 | `16adcfdc918d8192db72b74a7d20448633acc88c9b6dba17a37051ffd55ad247` |
| `assets/avatars/expressions/testes/surprised.svg` | 12170 | `236292b66da6e3d5be438ca983c79c79de66679c474b72d2fad768a618a7e263` |
| `assets/avatars/expressions/testes/thinking.svg` | 13762 | `975811380a369de6db64351fa21728b3b2d7aa20806a9cef9c0b3a83fbf05a52` |
| `assets/avatars/expressions/testes/tool.svg` | 12143 | `b8839fe67a5eb7cba92855e22515cc8ac2b9f95d1d1c5c50d043f95e029a2fd1` |
| `assets/avatars/expressions/testes/waiting.svg` | 11274 | `8912d68f31f0f3ce4c8c9bfbc1c9331c4569940410b939594a3897098edcb8d4` |
| `assets/avatars/expressions/testes/wink.svg` | 12113 | `9d95e44be3219db526b025838f178631e5c021abdb189dcd83938a8db35634b4` |
| `assets/avatars/expressions/testes/working.svg` | 11762 | `738044450481795638e73ec18e016c4f76e5a890468d57105141ae404e6a0c30` |
| `assets/avatars/random/r01/error.svg` | 38426 | `9ba595edf5382012f0581cab953123178682bb89aa9ac8d3321af7b50aaafb52` |
| `assets/avatars/random/r01/idle.svg` | 37371 | `5e1bacbaba57de9da97680bac126e25e0ff88968c65de850223499f8a2750ecc` |
| `assets/avatars/random/r01/success.svg` | 38098 | `a4e1da9b8738bc25f2207be113209e09518ebb6967562cbdda9ca537eca0ae06` |
| `assets/avatars/random/r01/working.svg` | 37646 | `1f35c7a67bec1ca71e73e408a37cf87b716c2a387df87c5e7854659029968470` |
| `assets/avatars/random/r02/error.svg` | 16354 | `dff58730edbb341c5c36602218dc2b9656991b5b98e5346dfea4b6aeaee143a7` |
| `assets/avatars/random/r02/idle.svg` | 15299 | `71c7faa0e0e54f3092f6593b99d070334ce6572ebc706577030e8cc25c996d2b` |
| `assets/avatars/random/r02/success.svg` | 16026 | `eb22de0a1be2cf5cb1d6b559f047ea18fae7278c4f311f443cca3b7ea1f6a4db` |
| `assets/avatars/random/r02/working.svg` | 15574 | `c8da556946ba5203779ac4ffe962a57ac6b3f0712e17d3d89d06913ac675fcdc` |
| `assets/avatars/random/r03/error.svg` | 16916 | `43b9ff4269b5cd8561736ae1313bd6ccbea60b9acd48e6f94dccfd9b5f7ed486` |
| `assets/avatars/random/r03/idle.svg` | 15861 | `68dde626500d8dba0e1627b96cd2407cb3a475a433d74f8fb59620e6ecc752fd` |
| `assets/avatars/random/r03/success.svg` | 16588 | `e1dd15df93bfb6205cb1dacd055fdd792e363150616edaa50d79e2661dd7a172` |
| `assets/avatars/random/r03/working.svg` | 16136 | `3a623ad9360c7618ceb63a8e5ad55632999775691a048c142b097c2601751dd5` |
| `assets/avatars/random/r04/error.svg` | 11304 | `02ecf4888b0364e7f8446783cdd3b4c238ccd13aef846c733e860e973881c563` |
| `assets/avatars/random/r04/idle.svg` | 10249 | `22ac5bc650d3a1c49cf0001b3481abefe9199b490b9539257287a46e2965c248` |
| `assets/avatars/random/r04/success.svg` | 10976 | `ff4c66ad5c5974d8edc929d7b32b44000d35f197f774984f7c23564b2b89a4b2` |
| `assets/avatars/random/r04/working.svg` | 10524 | `77ca579b26c169ec824384604f54fe9b068b07968b0089da020f32acdf277a16` |
| `assets/avatars/random/r05/error.svg` | 12251 | `ebf820330c15ac50b2421764356a8a254593b7ccfbedb79e99028a6fc9849180` |
| `assets/avatars/random/r05/idle.svg` | 11196 | `85bd36e29d45e5378ef946f068dae939d92216646208faec13522333dadae1c7` |
| `assets/avatars/random/r05/success.svg` | 11923 | `f4833f1c21f670bd4706356d8358b7a23f1c4e10fe1e9f36cf7cb41b7cf6c7d7` |
| `assets/avatars/random/r05/working.svg` | 11471 | `9e800a4a2eb2c1c1b6cece659150ea95242f99ff888233a746e1fe8e840d6eab` |
| `assets/avatars/random/r06/error.svg` | 12613 | `c1e8bc0e0ab81469f6c60b521ea670626ad78a130a9ed382e8be22d16974b13b` |
| `assets/avatars/random/r06/idle.svg` | 11558 | `26a4261c1d5eac6e35255d4c4d8602c46eac3832a4d59e08758e0855c3c8104a` |
| `assets/avatars/random/r06/success.svg` | 12285 | `a921d1963d183fc07c0c54250b66ac24f6a982fadb433668d4a2ee0de403a894` |
| `assets/avatars/random/r06/working.svg` | 11833 | `83eb4222a570c8f10f5740dbf675dd95befe83f51063c87e2f18f24b50a4cd7f` |
| `assets/avatars/random/r07/error.svg` | 17061 | `9c8da0c9813031f009dd4bae876d841a87c6c430d2422aa305796a01c2693b2b` |
| `assets/avatars/random/r07/idle.svg` | 16006 | `5e0bfb19ae673d5eff53844b0954e4eb161a0302c8127ac8db95070f3251ccb8` |
| `assets/avatars/random/r07/success.svg` | 16733 | `e01de86c78d52dd7034dc50fcd2a69a4b1dc62c6fae8a70584fcdeb4882fafbb` |
| `assets/avatars/random/r07/working.svg` | 16281 | `92ee4606597631d4be97f7cfe3c32acce97750c6bcaf79d5720f2bd1ca97d198` |
| `assets/avatars/random/r08/error.svg` | 13859 | `30f4a3930c298918859ba8a6a9bf82c61ed9ae552fc55ee8f2e114daff7f2e4b` |
| `assets/avatars/random/r08/idle.svg` | 12804 | `7432ce96adc8188fefa4baa16a95104619b7b8bf27e13be063b59a19598cd7f0` |
| `assets/avatars/random/r08/success.svg` | 13531 | `e002e98f1cca2d0421692b2c2be0d2d0f06b77d4802947c926b15df582b50670` |
| `assets/avatars/random/r08/working.svg` | 13079 | `cc1e2d84cfd7f9b61bbe635f5fb053c586581ef4d2240281f8c02a9fb4b9b3e7` |
| `assets/avatars/random/r09/error.svg` | 19738 | `921eb70c15d1ef6609c051a7d425d3266403a5b4876063478c89e80a853b3654` |
| `assets/avatars/random/r09/idle.svg` | 18683 | `717d2b952f7472a2e059f77e8af5ae78ff75d1baf19bc81bb1c006ff7714e4d4` |
| `assets/avatars/random/r09/success.svg` | 19410 | `fe582e4b007186406d9630dafc5f63116bea2d00f479974d470d5d45d7672ae6` |
| `assets/avatars/random/r09/working.svg` | 18958 | `fb6b910c0cf7a1b63195e7f3e6386abeb340a26eb831336a194f5d3083f1fe28` |
| `assets/avatars/random/r10/error.svg` | 14967 | `ecdff50ce9288f906293831233d60603d2463634bbdf0cc5b2dfdc2cea5260aa` |
| `assets/avatars/random/r10/idle.svg` | 13912 | `7b6105b35e722b9eaced6ec840253681faea2d969a228d27b31bdb5b6774fe9c` |
| `assets/avatars/random/r10/success.svg` | 14639 | `6cda4f735aa26cf159062e1f324a29ba44796dfd4d4603f6266088e5ac306a3b` |
| `assets/avatars/random/r10/working.svg` | 14187 | `ecb405a054e5424497537e09420285a246ce86fd790c02df535b47874269dd51` |
| `assets/avatars/random/r11/error.svg` | 38368 | `de7a1c5dc2d49632076d9c8359ace5a67785a072335b94c46f7478564210870f` |
| `assets/avatars/random/r11/idle.svg` | 37313 | `9382a1a273a8f8b246f8cb54f97d430391283be7c6da716357bc16620a559ec2` |
| `assets/avatars/random/r11/success.svg` | 38040 | `7516352863d88a0aef90a2004cf2e5368e7a45267ecbe0304c8b7b6f8f260e05` |
| `assets/avatars/random/r11/working.svg` | 37588 | `0b61941a57640aff201262f55fa95f4eef65eb66194774e69b72ceb28797b937` |
| `assets/avatars/random/r12/error.svg` | 20640 | `678b7c65ceb3cdbae1c102992bdc017cb7a2d9cafa3380dbf07d75f181deb873` |
| `assets/avatars/random/r12/idle.svg` | 19585 | `b5cba6a4fc268ce08c920a9e0cd3d4878de1f2332fae97ccf7c4218f7ab0667b` |
| `assets/avatars/random/r12/success.svg` | 20312 | `02deda1853952fff000ad714b0ba4fd34deb84dd995ab96246cac3dcbc97f41c` |
| `assets/avatars/random/r12/working.svg` | 19860 | `4e9a81d2fe48002f15e50b539885d55d0504d0e26d9293f0c4a2a0c6dd8a9dac` |
| `expressions.js` | 10797 | `eff6378be7622a2973eb0074f3b9b3ab60e13f9dccdfe930de2c97ce72f372a5` |

Hash combinado (SHA-256 sobre `caminho\0conteúdo` de todos os 161 arquivos acima, em ordem de caminho): `c896e24bc861f64b9e37597bdc19645475b62da6519081b86d59079f7933aff4`.

Os IDs internos (`react-path-*`) gerados pelo renderer podem variar em downloads futuros; estes hashes identificam os arquivos locais entregues.

## Proveniência — URLs exatas

Formato usado em todos os downloads:

```text
https://avataaars.io/?avatarStyle=Transparent&eyeType=…&eyebrowType=…&topType=…&hairColor=…&accessoriesType=…&facialHairType=…&facialHairColor=…&clotheType=…&clotheColor=…&mouthType=…&skinColor=…
```

Cada URL é a composição das opções fixas da pessoa (tabelas acima) com o triple do preset (tabela de presets). Arquivos copiados localmente (`idle` reaproveitado e `wink` = `approval`) provêm da URL do próprio triple, conforme anotado.

### rui

- `assets/avatars/expressions/rui/idle.svg` — reaproveitado do busto base `assets/avatars/rui.svg` (mesmo triple `Default/DefaultNatural/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/rui/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Twinkle&skinColor=Light
- `assets/avatars/expressions/rui/focused.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=FlatNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Serious&skinColor=Light
- `assets/avatars/expressions/rui/tool.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/rui/searching.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Side&eyebrowType=UpDown&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Concerned&skinColor=Light
- `assets/avatars/expressions/rui/thinking.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=UnibrowNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Concerned&skinColor=Light
- `assets/avatars/expressions/rui/waiting.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=SadConcerned&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Sad&skinColor=Light
- `assets/avatars/expressions/rui/approval.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/rui/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/rui/celebrating.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Tongue&skinColor=Light
- `assets/avatars/expressions/rui/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Grimace&skinColor=Light
- `assets/avatars/expressions/rui/surprised.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Surprised&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=ScreamOpen&skinColor=Light
- `assets/avatars/expressions/rui/disbelief.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=EyeRoll&eyebrowType=UpDownNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Disbelief&skinColor=Light
- `assets/avatars/expressions/rui/wink.svg` — cópia local de `approval.svg` (mesmo triple `Wink/RaisedExcited/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Smile&skinColor=Light

### bia — reaplicada recolorização #B1E2FF → #8357BF

- `assets/avatars/expressions/bia/idle.svg` — reaproveitado do busto base `assets/avatars/bia.svg` (mesmo triple `Default/DefaultNatural/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/bia/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Twinkle&skinColor=Light
- `assets/avatars/expressions/bia/focused.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=FlatNatural&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Serious&skinColor=Light
- `assets/avatars/expressions/bia/tool.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/bia/searching.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Side&eyebrowType=UpDown&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Concerned&skinColor=Light
- `assets/avatars/expressions/bia/thinking.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=UnibrowNatural&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Concerned&skinColor=Light
- `assets/avatars/expressions/bia/waiting.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=SadConcerned&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Sad&skinColor=Light
- `assets/avatars/expressions/bia/approval.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/bia/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/bia/celebrating.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Tongue&skinColor=Light
- `assets/avatars/expressions/bia/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Grimace&skinColor=Light
- `assets/avatars/expressions/bia/surprised.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Surprised&eyebrowType=RaisedExcited&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=ScreamOpen&skinColor=Light
- `assets/avatars/expressions/bia/disbelief.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=EyeRoll&eyebrowType=UpDownNatural&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Disbelief&skinColor=Light
- `assets/avatars/expressions/bia/wink.svg` — cópia local de `approval.svg` (mesmo triple `Wink/RaisedExcited/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Smile&skinColor=Light

### lia

- `assets/avatars/expressions/lia/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/lia/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Twinkle&skinColor=Light
- `assets/avatars/expressions/lia/focused.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=FlatNatural&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Serious&skinColor=Light
- `assets/avatars/expressions/lia/tool.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/lia/searching.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Side&eyebrowType=UpDown&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Concerned&skinColor=Light
- `assets/avatars/expressions/lia/thinking.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=UnibrowNatural&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Concerned&skinColor=Light
- `assets/avatars/expressions/lia/waiting.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=SadConcerned&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Sad&skinColor=Light
- `assets/avatars/expressions/lia/approval.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/lia/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/lia/celebrating.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Tongue&skinColor=Light
- `assets/avatars/expressions/lia/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Grimace&skinColor=Light
- `assets/avatars/expressions/lia/surprised.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Surprised&eyebrowType=RaisedExcited&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=ScreamOpen&skinColor=Light
- `assets/avatars/expressions/lia/disbelief.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=EyeRoll&eyebrowType=UpDownNatural&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Disbelief&skinColor=Light
- `assets/avatars/expressions/lia/wink.svg` — cópia local de `approval.svg` (mesmo triple `Wink/RaisedExcited/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Smile&skinColor=Light

### pesquisa — reaplicada recolorização #A7FFC4 → #3C8652

- `assets/avatars/expressions/pesquisa/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Smile&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Twinkle&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/focused.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=FlatNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Serious&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/tool.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Smile&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/searching.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Side&eyebrowType=UpDown&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Concerned&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/thinking.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=UnibrowNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Concerned&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/waiting.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=SadConcerned&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Sad&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/approval.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Smile&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Smile&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/celebrating.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Tongue&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Grimace&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/surprised.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Surprised&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=ScreamOpen&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/disbelief.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=EyeRoll&eyebrowType=UpDownNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Disbelief&skinColor=DarkBrown
- `assets/avatars/expressions/pesquisa/wink.svg` — cópia local de `approval.svg` (mesmo triple `Wink/RaisedExcited/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Smile&skinColor=DarkBrown

### codigo — reaplicada recolorização #FFDEB5 → #D47A36

- `assets/avatars/expressions/codigo/idle.svg` — reaproveitado do busto base `assets/avatars/codigo.svg` (mesmo triple `Default/DefaultNatural/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/codigo/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Twinkle&skinColor=Light
- `assets/avatars/expressions/codigo/focused.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=FlatNatural&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Serious&skinColor=Light
- `assets/avatars/expressions/codigo/tool.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/codigo/searching.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Side&eyebrowType=UpDown&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Concerned&skinColor=Light
- `assets/avatars/expressions/codigo/thinking.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=UnibrowNatural&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Concerned&skinColor=Light
- `assets/avatars/expressions/codigo/waiting.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=SadConcerned&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Sad&skinColor=Light
- `assets/avatars/expressions/codigo/approval.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/codigo/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/codigo/celebrating.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Tongue&skinColor=Light
- `assets/avatars/expressions/codigo/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Grimace&skinColor=Light
- `assets/avatars/expressions/codigo/surprised.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Surprised&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=ScreamOpen&skinColor=Light
- `assets/avatars/expressions/codigo/disbelief.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=EyeRoll&eyebrowType=UpDownNatural&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Disbelief&skinColor=Light
- `assets/avatars/expressions/codigo/wink.svg` — cópia local de `approval.svg` (mesmo triple `Wink/RaisedExcited/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Smile&skinColor=Light

### testes

- `assets/avatars/expressions/testes/idle.svg` — reaproveitado do busto base `assets/avatars/testes.svg` (mesmo triple `Default/DefaultNatural/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/testes/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Twinkle&skinColor=Light
- `assets/avatars/expressions/testes/focused.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=FlatNatural&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Serious&skinColor=Light
- `assets/avatars/expressions/testes/tool.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/testes/searching.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Side&eyebrowType=UpDown&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Concerned&skinColor=Light
- `assets/avatars/expressions/testes/thinking.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=UnibrowNatural&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Concerned&skinColor=Light
- `assets/avatars/expressions/testes/waiting.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=SadConcerned&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Sad&skinColor=Light
- `assets/avatars/expressions/testes/approval.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/testes/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Smile&skinColor=Light
- `assets/avatars/expressions/testes/celebrating.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Tongue&skinColor=Light
- `assets/avatars/expressions/testes/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Grimace&skinColor=Light
- `assets/avatars/expressions/testes/surprised.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Surprised&eyebrowType=RaisedExcited&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=ScreamOpen&skinColor=Light
- `assets/avatars/expressions/testes/disbelief.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=EyeRoll&eyebrowType=UpDownNatural&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Disbelief&skinColor=Light
- `assets/avatars/expressions/testes/wink.svg` — cópia local de `approval.svg` (mesmo triple `Wink/RaisedExcited/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Smile&skinColor=Light

### alex

- `assets/avatars/expressions/alex/idle.svg` — reaproveitado do busto base `assets/avatars/alex.svg` (mesmo triple `Default/DefaultNatural/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Smile&skinColor=Tanned
- `assets/avatars/expressions/alex/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Twinkle&skinColor=Tanned
- `assets/avatars/expressions/alex/focused.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=FlatNatural&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Serious&skinColor=Tanned
- `assets/avatars/expressions/alex/tool.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Smile&skinColor=Tanned
- `assets/avatars/expressions/alex/searching.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Side&eyebrowType=UpDown&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Concerned&skinColor=Tanned
- `assets/avatars/expressions/alex/thinking.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=UnibrowNatural&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Concerned&skinColor=Tanned
- `assets/avatars/expressions/alex/waiting.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=SadConcerned&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Sad&skinColor=Tanned
- `assets/avatars/expressions/alex/approval.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Smile&skinColor=Tanned
- `assets/avatars/expressions/alex/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Smile&skinColor=Tanned
- `assets/avatars/expressions/alex/celebrating.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Tongue&skinColor=Tanned
- `assets/avatars/expressions/alex/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Grimace&skinColor=Tanned
- `assets/avatars/expressions/alex/surprised.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Surprised&eyebrowType=RaisedExcited&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=ScreamOpen&skinColor=Tanned
- `assets/avatars/expressions/alex/disbelief.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=EyeRoll&eyebrowType=UpDownNatural&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Disbelief&skinColor=Tanned
- `assets/avatars/expressions/alex/wink.svg` — cópia local de `approval.svg` (mesmo triple `Wink/RaisedExcited/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Smile&skinColor=Tanned

### maya — reaplicada recolorização #A7FFC4 → #2F9A94

- `assets/avatars/expressions/maya/idle.svg` — reaproveitado do busto base `assets/avatars/maya.svg` (mesmo triple `Default/DefaultNatural/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Smile&skinColor=Tanned
- `assets/avatars/expressions/maya/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Twinkle&skinColor=Tanned
- `assets/avatars/expressions/maya/focused.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=FlatNatural&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Serious&skinColor=Tanned
- `assets/avatars/expressions/maya/tool.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Smile&skinColor=Tanned
- `assets/avatars/expressions/maya/searching.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Side&eyebrowType=UpDown&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Concerned&skinColor=Tanned
- `assets/avatars/expressions/maya/thinking.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Squint&eyebrowType=UnibrowNatural&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Concerned&skinColor=Tanned
- `assets/avatars/expressions/maya/waiting.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=SadConcerned&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Sad&skinColor=Tanned
- `assets/avatars/expressions/maya/approval.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Smile&skinColor=Tanned
- `assets/avatars/expressions/maya/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Smile&skinColor=Tanned
- `assets/avatars/expressions/maya/celebrating.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=WinkWacky&eyebrowType=RaisedExcited&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Tongue&skinColor=Tanned
- `assets/avatars/expressions/maya/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Grimace&skinColor=Tanned
- `assets/avatars/expressions/maya/surprised.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Surprised&eyebrowType=RaisedExcited&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=ScreamOpen&skinColor=Tanned
- `assets/avatars/expressions/maya/disbelief.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=EyeRoll&eyebrowType=UpDownNatural&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Disbelief&skinColor=Tanned
- `assets/avatars/expressions/maya/wink.svg` — cópia local de `approval.svg` (mesmo triple `Wink/RaisedExcited/Smile`), URL de origem: https://avataaars.io/?avatarStyle=Transparent&eyeType=Wink&eyebrowType=RaisedExcited&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Smile&skinColor=Tanned

### Identidades aleatórias

#### r01

- `assets/avatars/random/r01/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairFrida&hairColor=Blue&accessoriesType=Prescription01&facialHairType=BeardLight&facialHairColor=Black&clotheType=BlazerSweater&clotheColor=PastelBlue&mouthType=Smile&skinColor=Light
- `assets/avatars/random/r01/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=LongHairFrida&hairColor=Blue&accessoriesType=Prescription01&facialHairType=BeardLight&facialHairColor=Black&clotheType=BlazerSweater&clotheColor=PastelBlue&mouthType=Twinkle&skinColor=Light
- `assets/avatars/random/r01/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=LongHairFrida&hairColor=Blue&accessoriesType=Prescription01&facialHairType=BeardLight&facialHairColor=Black&clotheType=BlazerSweater&clotheColor=PastelBlue&mouthType=Smile&skinColor=Light
- `assets/avatars/random/r01/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=LongHairFrida&hairColor=Blue&accessoriesType=Prescription01&facialHairType=BeardLight&facialHairColor=Black&clotheType=BlazerSweater&clotheColor=PastelBlue&mouthType=Grimace&skinColor=Light

#### r02

- `assets/avatars/random/r02/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairStraightStrand&hairColor=SilverGray&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Black&clotheType=CollarSweater&clotheColor=Pink&mouthType=Smile&skinColor=DarkBrown
- `assets/avatars/random/r02/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=LongHairStraightStrand&hairColor=SilverGray&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Black&clotheType=CollarSweater&clotheColor=Pink&mouthType=Twinkle&skinColor=DarkBrown
- `assets/avatars/random/r02/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=LongHairStraightStrand&hairColor=SilverGray&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Black&clotheType=CollarSweater&clotheColor=Pink&mouthType=Smile&skinColor=DarkBrown
- `assets/avatars/random/r02/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=LongHairStraightStrand&hairColor=SilverGray&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Black&clotheType=CollarSweater&clotheColor=Pink&mouthType=Grimace&skinColor=DarkBrown

#### r03

- `assets/avatars/random/r03/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=ShortHairShortFlat&hairColor=Brown&accessoriesType=Prescription01&facialHairType=BeardLight&facialHairColor=Blonde&clotheType=Overall&clotheColor=Red&mouthType=Smile&skinColor=Brown
- `assets/avatars/random/r03/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=ShortHairShortFlat&hairColor=Brown&accessoriesType=Prescription01&facialHairType=BeardLight&facialHairColor=Blonde&clotheType=Overall&clotheColor=Red&mouthType=Twinkle&skinColor=Brown
- `assets/avatars/random/r03/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=ShortHairShortFlat&hairColor=Brown&accessoriesType=Prescription01&facialHairType=BeardLight&facialHairColor=Blonde&clotheType=Overall&clotheColor=Red&mouthType=Smile&skinColor=Brown
- `assets/avatars/random/r03/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=ShortHairShortFlat&hairColor=Brown&accessoriesType=Prescription01&facialHairType=BeardLight&facialHairColor=Blonde&clotheType=Overall&clotheColor=Red&mouthType=Grimace&skinColor=Brown

#### r04

- `assets/avatars/random/r04/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairCurly&hairColor=SilverGray&accessoriesType=Blank&facialHairType=MoustacheFancy&facialHairColor=Blonde&clotheType=ShirtVNeck&clotheColor=White&mouthType=Smile&skinColor=Tanned
- `assets/avatars/random/r04/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=LongHairCurly&hairColor=SilverGray&accessoriesType=Blank&facialHairType=MoustacheFancy&facialHairColor=Blonde&clotheType=ShirtVNeck&clotheColor=White&mouthType=Twinkle&skinColor=Tanned
- `assets/avatars/random/r04/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=LongHairCurly&hairColor=SilverGray&accessoriesType=Blank&facialHairType=MoustacheFancy&facialHairColor=Blonde&clotheType=ShirtVNeck&clotheColor=White&mouthType=Smile&skinColor=Tanned
- `assets/avatars/random/r04/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=LongHairCurly&hairColor=SilverGray&accessoriesType=Blank&facialHairType=MoustacheFancy&facialHairColor=Blonde&clotheType=ShirtVNeck&clotheColor=White&mouthType=Grimace&skinColor=Tanned

#### r05

- `assets/avatars/random/r05/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairNotTooLong&hairColor=BlondeGolden&accessoriesType=Round&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=Blue01&mouthType=Smile&skinColor=Tanned
- `assets/avatars/random/r05/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=LongHairNotTooLong&hairColor=BlondeGolden&accessoriesType=Round&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=Blue01&mouthType=Twinkle&skinColor=Tanned
- `assets/avatars/random/r05/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=LongHairNotTooLong&hairColor=BlondeGolden&accessoriesType=Round&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=Blue01&mouthType=Smile&skinColor=Tanned
- `assets/avatars/random/r05/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=LongHairNotTooLong&hairColor=BlondeGolden&accessoriesType=Round&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=Blue01&mouthType=Grimace&skinColor=Tanned

#### r06

- `assets/avatars/random/r06/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=Hat&hairColor=PastelPink&accessoriesType=Blank&facialHairType=BeardMajestic&facialHairColor=Brown&clotheType=Overall&clotheColor=Black&mouthType=Smile&skinColor=Yellow
- `assets/avatars/random/r06/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=Hat&hairColor=PastelPink&accessoriesType=Blank&facialHairType=BeardMajestic&facialHairColor=Brown&clotheType=Overall&clotheColor=Black&mouthType=Twinkle&skinColor=Yellow
- `assets/avatars/random/r06/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=Hat&hairColor=PastelPink&accessoriesType=Blank&facialHairType=BeardMajestic&facialHairColor=Brown&clotheType=Overall&clotheColor=Black&mouthType=Smile&skinColor=Yellow
- `assets/avatars/random/r06/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=Hat&hairColor=PastelPink&accessoriesType=Blank&facialHairType=BeardMajestic&facialHairColor=Brown&clotheType=Overall&clotheColor=Black&mouthType=Grimace&skinColor=Yellow

#### r07

- `assets/avatars/random/r07/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=ShortHairShortWaved&hairColor=Blonde&accessoriesType=Round&facialHairType=BeardMajestic&facialHairColor=Blonde&clotheType=BlazerSweater&clotheColor=Blue03&mouthType=Smile&skinColor=Tanned
- `assets/avatars/random/r07/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=ShortHairShortWaved&hairColor=Blonde&accessoriesType=Round&facialHairType=BeardMajestic&facialHairColor=Blonde&clotheType=BlazerSweater&clotheColor=Blue03&mouthType=Twinkle&skinColor=Tanned
- `assets/avatars/random/r07/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=ShortHairShortWaved&hairColor=Blonde&accessoriesType=Round&facialHairType=BeardMajestic&facialHairColor=Blonde&clotheType=BlazerSweater&clotheColor=Blue03&mouthType=Smile&skinColor=Tanned
- `assets/avatars/random/r07/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=ShortHairShortWaved&hairColor=Blonde&accessoriesType=Round&facialHairType=BeardMajestic&facialHairColor=Blonde&clotheType=BlazerSweater&clotheColor=Blue03&mouthType=Grimace&skinColor=Tanned

#### r08

- `assets/avatars/random/r08/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=Hat&hairColor=Blonde&accessoriesType=Round&facialHairType=MoustacheFancy&facialHairColor=Black&clotheType=BlazerShirt&clotheColor=PastelOrange&mouthType=Smile&skinColor=Light
- `assets/avatars/random/r08/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=Hat&hairColor=Blonde&accessoriesType=Round&facialHairType=MoustacheFancy&facialHairColor=Black&clotheType=BlazerShirt&clotheColor=PastelOrange&mouthType=Twinkle&skinColor=Light
- `assets/avatars/random/r08/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=Hat&hairColor=Blonde&accessoriesType=Round&facialHairType=MoustacheFancy&facialHairColor=Black&clotheType=BlazerShirt&clotheColor=PastelOrange&mouthType=Smile&skinColor=Light
- `assets/avatars/random/r08/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=Hat&hairColor=Blonde&accessoriesType=Round&facialHairType=MoustacheFancy&facialHairColor=Black&clotheType=BlazerShirt&clotheColor=PastelOrange&mouthType=Grimace&skinColor=Light

#### r09

- `assets/avatars/random/r09/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=WinterHat1&hairColor=Blue&accessoriesType=Sunglasses&facialHairType=BeardLight&facialHairColor=Brown&clotheType=BlazerSweater&clotheColor=Blue03&mouthType=Smile&skinColor=Black
- `assets/avatars/random/r09/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=WinterHat1&hairColor=Blue&accessoriesType=Sunglasses&facialHairType=BeardLight&facialHairColor=Brown&clotheType=BlazerSweater&clotheColor=Blue03&mouthType=Twinkle&skinColor=Black
- `assets/avatars/random/r09/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=WinterHat1&hairColor=Blue&accessoriesType=Sunglasses&facialHairType=BeardLight&facialHairColor=Brown&clotheType=BlazerSweater&clotheColor=Blue03&mouthType=Smile&skinColor=Black
- `assets/avatars/random/r09/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=WinterHat1&hairColor=Blue&accessoriesType=Sunglasses&facialHairType=BeardLight&facialHairColor=Brown&clotheType=BlazerSweater&clotheColor=Blue03&mouthType=Grimace&skinColor=Black

#### r10

- `assets/avatars/random/r10/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=ShortHairShortFlat&hairColor=Red&accessoriesType=Round&facialHairType=BeardLight&facialHairColor=Auburn&clotheType=ShirtVNeck&clotheColor=Pink&mouthType=Smile&skinColor=Yellow
- `assets/avatars/random/r10/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=ShortHairShortFlat&hairColor=Red&accessoriesType=Round&facialHairType=BeardLight&facialHairColor=Auburn&clotheType=ShirtVNeck&clotheColor=Pink&mouthType=Twinkle&skinColor=Yellow
- `assets/avatars/random/r10/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=ShortHairShortFlat&hairColor=Red&accessoriesType=Round&facialHairType=BeardLight&facialHairColor=Auburn&clotheType=ShirtVNeck&clotheColor=Pink&mouthType=Smile&skinColor=Yellow
- `assets/avatars/random/r10/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=ShortHairShortFlat&hairColor=Red&accessoriesType=Round&facialHairType=BeardLight&facialHairColor=Auburn&clotheType=ShirtVNeck&clotheColor=Pink&mouthType=Grimace&skinColor=Yellow

#### r11

- `assets/avatars/random/r11/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairFrida&hairColor=Blue&accessoriesType=Sunglasses&facialHairType=Blank&facialHairColor=Brown&clotheType=GraphicShirt&clotheColor=PastelYellow&mouthType=Smile&skinColor=Yellow
- `assets/avatars/random/r11/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=LongHairFrida&hairColor=Blue&accessoriesType=Sunglasses&facialHairType=Blank&facialHairColor=Brown&clotheType=GraphicShirt&clotheColor=PastelYellow&mouthType=Twinkle&skinColor=Yellow
- `assets/avatars/random/r11/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=LongHairFrida&hairColor=Blue&accessoriesType=Sunglasses&facialHairType=Blank&facialHairColor=Brown&clotheType=GraphicShirt&clotheColor=PastelYellow&mouthType=Smile&skinColor=Yellow
- `assets/avatars/random/r11/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=LongHairFrida&hairColor=Blue&accessoriesType=Sunglasses&facialHairType=Blank&facialHairColor=Brown&clotheType=GraphicShirt&clotheColor=PastelYellow&mouthType=Grimace&skinColor=Yellow

#### r12

- `assets/avatars/random/r12/idle.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairStraight2&hairColor=Red&accessoriesType=Wayfarers&facialHairType=MoustacheMagnum&facialHairColor=Blonde&clotheType=BlazerSweater&clotheColor=Pink&mouthType=Smile&skinColor=Tanned
- `assets/avatars/random/r12/working.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=DefaultNatural&topType=LongHairStraight2&hairColor=Red&accessoriesType=Wayfarers&facialHairType=MoustacheMagnum&facialHairColor=Blonde&clotheType=BlazerSweater&clotheColor=Pink&mouthType=Twinkle&skinColor=Tanned
- `assets/avatars/random/r12/success.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Happy&eyebrowType=RaisedExcitedNatural&topType=LongHairStraight2&hairColor=Red&accessoriesType=Wayfarers&facialHairType=MoustacheMagnum&facialHairColor=Blonde&clotheType=BlazerSweater&clotheColor=Pink&mouthType=Smile&skinColor=Tanned
- `assets/avatars/random/r12/error.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Cry&eyebrowType=AngryNatural&topType=LongHairStraight2&hairColor=Red&accessoriesType=Wayfarers&facialHairType=MoustacheMagnum&facialHairColor=Blonde&clotheType=BlazerSweater&clotheColor=Pink&mouthType=Grimace&skinColor=Tanned

## Dormir (Modo jogo do plugin)

Expressão **"a dormir"** (olhos fechados) das 8 identidades nomeadas, para o plugin *Modo jogo* do DSH mostrar quem não está trabalhando (junto do "zzz"). Gerada em **2026-09-28 (UTC)** pelo mesmo pipeline das outras expressões ([docs/conhecimento/03-pipeline-avataaars.md](../docs/conhecimento/03-pipeline-avataaars.md)): download dev-time do renderer [avataaars.io](https://avataaars.io/) com `avatarStyle=Transparent`, as opções fixas de cada pessoa (tabela "Identidades nomeadas (8)" acima) e um triple novo. **Nada foi redesenhado**: são os desenhos originais da biblioteca Avataaars, só com a recolorização mínima já documentada.

- **Triple:** `eyeType=Close` / `eyebrowType=DefaultNatural` / `mouthType=Serious`.
- **Porquê `Serious` e não `Default`:** as duas bocas foram descarregadas e comparadas lado a lado. A `Default` do Avataaars é um meio-círculo escuro preenchido — boca **aberta** que, com os olhos fechados, se lê como gargalhada ou bocejo, e ganha destaque no tamanho pequeno da sala. A `Serious` é um traço curto **fechado**: cara serena de quem dorme, e é uma boca que o projeto já usa (preset `focused`). Os downloads com `mouthType=Default` foram descartados; nenhum ficou no repositório.
- **Não é um 15.º preset** de `window.DSH_EXPRESSIONS` nem entra na demo: fica numa pasta própria, `assets/avatars/sleeping/<pessoa>.svg`, para não alterar as contagens congeladas de `expressions/` (112) e `random/` (48). **8 arquivos, 110.269 bytes.**
- Os arquivos são carregados localmente (tal como os demais avatares); as URLs abaixo são registro de proveniência, não dependência de execução.

### Prova de reprodutibilidade (feita antes de gerar)

Para cada pessoa foi descarregado de novo o triple do preset `idle` (`Default`/`DefaultNatural`/`Smile`) com as mesmas opções fixas e comparado com `assets/avatars/expressions/<pessoa>/idle.svg`: **8/8 idênticos** depois de reaplicar a recolorização e renumerar os ids `react-*` pela ordem de 1.ª aparição. Os bytes diferem apenas nos números desses ids (o renderer usa um contador global por pedido). Repetido em 3 execuções (24 downloads do `idle`), sempre com o mesmo resultado — só então os arquivos "a dormir" foram gerados.

### Recolorização

A mesma das outras expressões, exatamente **1 `fill` de roupa** por arquivo e só nas quatro pessoas recoloridas: `bia` `#B1E2FF` → `#8357BF`, `pesquisa` `#A7FFC4` → `#3C8652`, `codigo` `#FFDEB5` → `#D47A36`, `maya` `#A7FFC4` → `#2F9A94`. Desfazer a substituição reproduz o SHA-256 do download (coluna "SHA-256 do download" abaixo). `rui`, `lia`, `testes` e `alex` são byte-idênticos ao download.

### Validações executadas

1. **XML bem formado** (`xml.etree.ElementTree` e `xmllint --noout`) em 8/8; raiz `<svg>`, `viewBox="0 0 264 280"`, `width="264px"`, `height="280px"`.
2. **Sem `<script>`, `foreignObject`, atributos `on*`, DOCTYPE/entidades, `@import`, `javascript:` nem URLs externas**; todos os `href` e `url(...)` são fragmentos `#...`. A única referência sem alvo é o `mask="url(#react-mask-N)"` do grupo `Avataaar` interior — particularidade do `avatarStyle=Transparent` (o `<g id="Mask">` sai vazio) presente em **todos** os 160 avatares existentes; foi mantida como veio.
3. **Identidade preservada** — diff estrutural contra `expressions/<pessoa>/idle.svg` (ids `react-*` normalizados): fora dos grupos `Eyes/`, `Eyebrow/` e `Mouth/` a árvore é idêntica em 8/8. Dentro deles mudam só `Eyes/Default-😀` → `Eyes/Closed-😌` e `Mouth/Smile` → `Mouth/Serious`; `Eyebrow/Natural/Default-Natural` é idêntico.
4. **Ids sem colisão:** os ids `react-*` novos (3783448–3783873) não coincidem com nenhum id dos 160 SVGs existentes nem entre os 8 arquivos novos.
5. **Rasterização** (o `rsvg-convert` não existe no macmini; usado o Chrome headless via `tests/helpers/cdp.mjs`, SVG em `data:` desenhado num canvas 264×280): 8/8 não vazias, cantos transparentes, alfa médio igual ao do `idle` e **todos os pixels diferentes do `idle` ficam dentro da caixa (92,106)–(172,166)** — olhos e boca. Conferência visual: olhos fechados e o resto igual nas 8 pessoas.
6. **Teste automático:** `tests/static-assets.test.mjs` exige exatamente 8 SVGs em `assets/avatars/sleeping/` (1 por identidade nomeada), válidos, com `Eyes/Closed` e iguais ao `idle.svg` da mesma pessoa fora de olhos/sobrancelha/boca.

### Arquivos e SHA-256

| Arquivo | Bytes | SHA-256 do arquivo final | SHA-256 do download |
| --- | --- | --- | --- |
| `assets/avatars/sleeping/alex.svg` | 9652 | `77695c27d960675b5a6c68cae8db43ebcada71a4fdb03429656751869b6b1988` | (idêntico) |
| `assets/avatars/sleeping/bia.svg` | 9353 | `6935efaabbb00c1afa6464de43fc130d189add4f32a510ffa5ab5535a2cdbd49` | `5b9cbbed2be4a5c5eff8ad019a55fe7c822f85e96466d3996da8e264cbad11de` |
| `assets/avatars/sleeping/codigo.svg` | 14387 | `451bca09fcff448025cb9c063b9672d205f472604b1e7793e0142581c597c639` | `b98a7c380c49155818f21f870ffa0edf381ea7a767202968e4d53480b3109875` |
| `assets/avatars/sleeping/lia.svg` | 24339 | `bda58adc04b100eabda7066f0229e1aff32c7a034faeab5c7c4f9863a18ead52` | (idêntico) |
| `assets/avatars/sleeping/maya.svg` | 8914 | `4a526ebbfe740359b0cb5c67ea78dbc0c538f094027c17dac695a8376c84411b` | `9b51eaeff27cae7a955e3878d837ba14f77294bb7aa8229b7655af5eaaeceb29` |
| `assets/avatars/sleeping/pesquisa.svg` | 14412 | `d7f9442da6598ec2425172edf67eca762be6619210fd5333971002cdb32ea3e4` | `c01892d3cbebf477a82370ee791597c0977ee7b745475e13662435755996ebea` |
| `assets/avatars/sleeping/rui.svg` | 17561 | `d5a194daf8710d5ca4f3913b1ad6adefb355051545c760c4c6653632c7166507` | (idêntico) |
| `assets/avatars/sleeping/testes.svg` | 11651 | `dba4fd55cb34eefcd4c59a34250ef99825376a3884fd6240230750925ed53b17` | (idêntico) |

Como nas outras expressões, os ids internos `react-*` podem variar num download futuro; estes hashes identificam os arquivos entregues.

### URLs exatas

Todas responderam HTTP 200 com `Content-Type: image/svg+xml`.

- `assets/avatars/sleeping/rui.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Close&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Serious&skinColor=Light
- `assets/avatars/sleeping/bia.svg` (recolorizado `#B1E2FF` → `#8357BF`) — https://avataaars.io/?avatarStyle=Transparent&eyeType=Close&eyebrowType=DefaultNatural&topType=LongHairCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Serious&skinColor=Light
- `assets/avatars/sleeping/lia.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Close&eyebrowType=DefaultNatural&topType=LongHairCurvy&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Serious&skinColor=Light
- `assets/avatars/sleeping/pesquisa.svg` (recolorizado `#A7FFC4` → `#3C8652`) — https://avataaars.io/?avatarStyle=Transparent&eyeType=Close&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&hairColor=Black&accessoriesType=Prescription02&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Serious&skinColor=DarkBrown
- `assets/avatars/sleeping/codigo.svg` (recolorizado `#FFDEB5` → `#D47A36`) — https://avataaars.io/?avatarStyle=Transparent&eyeType=Close&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&hairColor=Brown&accessoriesType=Blank&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Serious&skinColor=Light
- `assets/avatars/sleeping/testes.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Close&eyebrowType=DefaultNatural&topType=LongHairStraight2&hairColor=Blonde&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Serious&skinColor=Light
- `assets/avatars/sleeping/alex.svg` — https://avataaars.io/?avatarStyle=Transparent&eyeType=Close&eyebrowType=DefaultNatural&topType=ShortHairShortFlat&hairColor=BrownDark&accessoriesType=Blank&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Serious&skinColor=Tanned
- `assets/avatars/sleeping/maya.svg` (recolorizado `#A7FFC4` → `#2F9A94`) — https://avataaars.io/?avatarStyle=Transparent&eyeType=Close&eyebrowType=DefaultNatural&topType=LongHairStraight&hairColor=Black&accessoriesType=Blank&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Serious&skinColor=Tanned

URLs da prova de reprodutibilidade: as mesmas, com `eyeType=Default` e `mouthType=Smile` (são as URLs do `idle.svg` de cada pessoa já listadas em "Proveniência — URLs exatas").
