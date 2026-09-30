# Pipeline de assets Avataaars — expressões com identidade fixa

## Produtos e licença

Três produtos distintos, não confundir:

- **getavataaars.com** — editor hospedado na web (design de Pablo Stanley, desenvolvimento de Fang-Pen Lin);
- **fangpenlin/avataaars-generator** — código-fonte do editor;
- **fangpenlin/avataaars** — biblioteca React que renderiza o SVG: busto frontal, `viewBox="0 0 264 280"`, proporção **33:35** (para largura `w`, altura = `w × 35 / 33`; exemplos sem distorção: 132×140, 198×210, 264×280).

`avatarStyle='Transparent'` remove o círculo/fundo atrás da cabeça — **não** remove o torso: ombros e roupa continuam visíveis.

Licença **MIT** (2017 Pablo Stanley, Fang-Pen Lin), preservada em `assets/AVATAARS-LICENSE.txt`. O site declara uso livre pessoal e comercial. A licença CC0 do Sketch original **não foi confirmada**; ao redistribuir, preservar procedência (design Pablo Stanley, dev Fang-Pen Lin) e avisos de licença.

## Regra da identidade fixa

Regra do projeto, sem exceções: os rostos são **sempre** os SVGs originais do Avataaars — nunca redesenhados nem gerados por IA. Entre expressões mudam **apenas** olhos (`eyeType`), sobrancelha (`eyebrowType`) e boca (`mouthType`); cabelo, pele, roupa e acessórios ficam **fixos por pessoa**. Assim cada personagem é reconhecível em qualquer estado.

## Como gerar uma variante de expressão

Geração **dev-time** via download do renderer `avataaars.io` com query params — a app **nunca** chama o serviço em runtime (tudo local, sem rede):

```
https://avataaars.io/?avatarStyle=Transparent&eyeType=…&eyebrowType=…&topType=…&hairColor=…&accessoriesType=…&facialHairType=…&facialHairColor=…&clotheType=…&clotheColor=…&mouthType=…&skinColor=…
```

Composição: opções fixas da pessoa (topType, hairColor, accessoriesType, facialHairType/Color, clotheType/Color, skinColor) + o triple do preset (`eyeType`/`eyebrowType`/`mouthType`). `avatarStyle=Transparent` sempre. Cada URL responde `Content-Type: image/svg+xml`; copiar o SVG para o caminho local do preset.

**Recolorização** — documentada e mínima: no máximo **1 `fill` de roupa por ficheiro**, apenas em 4 identidades (`bia` → `#8357BF`, `pesquisa` → `#3C8652`, `codigo` → `#D47A36`, `maya` → `#2F9A94`), reversível e registada em `assets/AVATARS-SOURCES.md`. Os restantes ficheiros são byte-idênticos ao download. Nada mais muda: geometria, máscaras, dimensões e fundo ficam intactos.

## Presets e dedupe

14 presets, cada um com o seu triple (`eyeType`/`eyebrowType`/`mouthType`):

| Preset | Triple |
| --- | --- |
| `idle` | Default / DefaultNatural / Smile |
| `working` | Happy / DefaultNatural / Twinkle |
| `focused` | Squint / FlatNatural / Serious |
| `tool` | WinkWacky / RaisedExcited / Smile |
| `searching` | Side / UpDown / Concerned |
| `thinking` | Squint / UnibrowNatural / Concerned |
| `waiting` | Default / SadConcerned / Sad |
| `approval` | Wink / RaisedExcited / Smile |
| `success` | Happy / RaisedExcitedNatural / Smile |
| `celebrating` | WinkWacky / RaisedExcited / Tongue |
| `error` | Cry / AngryNatural / Grimace |
| `surprised` | Surprised / RaisedExcited / ScreamOpen |
| `disbelief` | EyeRoll / UpDownNatural / Disbelief |
| `wink` | Wink / RaisedExcited / Smile |

**Dedupe:** `wink` e `approval` partilham o mesmo triple (`Wink`/`RaisedExcited`/`Smile`) → mesmo ficheiro copiado, sem novo download. São **13 triples distintos** para 14 presets.

## Estrutura de ficheiros

160 SVGs locais, ~2,4 MiB no total:

- 8 identidades nomeadas (`rui`, `bia`, `lia`, `pesquisa`, `codigo`, `testes`, `alex`, `maya`) × 14 presets = **112** em `assets/avatars/expressions/<id>/<preset>.svg`;
- 12 identidades totalmente aleatórias (`r01`..`r12`) × 4 presets (`idle`, `working`, `success`, `error`) = **48** em `assets/avatars/random/<id>/<preset>.svg` — re-geradas em **2026-09-29** com `scripts/gerar-avatares-random.py` (gênero coerente; ver secção seguinte).
- Fora destas contagens e da demo: **8** SVGs em `assets/avatars/sleeping/<id>.svg` (1 por identidade nomeada) — o preset `sleeping` do plugin (quem está Disponível dorme no Modo jogo, embutido no `dsh-plugin/src/client.js`), triple `Close`/`DefaultNatural`/`Serious`; proveniência em `assets/AVATARS-EXPRESSIONS.md`.

Contrato `window.DSH_EXPRESSIONS` (script puro, sem módulos): `presets[{id,label,eyeType,eyebrowType,mouthType,when}]`, `namedIdentityIds`, `randomIdentityIds`, `identities`, `basePreset='idle'` e `resolve(identityId, presetId)` → caminho local com cadeia de fallback: preset pedido → `idle` → `assets/avatars/<id>.svg` (só nomeadas) → `null`. As identidades aleatórias têm só 4 presets renderizados; os restantes estados caem em `idle`. Todas as identidades declaram `gender: 'f' | 'm'`.

## Piscina aleatória: gênero coerente (2026-09-29)

Regra do utilizador (2026-09-29): **o gênero do boneco tem de bater com o gênero do nome** — a versão anterior tinha mulheres de barba/bigode, três chapéus/bonés repetidos e tons de pele `Yellow`, e o nome sorteado não casava com o avatar. Estado atual:

- **Piscina (`expressions.js` + `assets/avatars/random/`)**: 6 identidades femininas (`r01`–`r06`) **sem qualquer barba/bigode**, 6 masculinas (`r07`–`r12`); 12 `topType` distintos e **zero chapéus/bonés** (`Hat`, `WinterHat1..4` proibidos); óculos só de lente transparente (`Prescription01/02`, `Round`) para as expressões se verem; `facialHairColor` acompanha `hairColor`; 6 tons de pele, sem `Yellow`.
- **Emparelhamento demo (`data.js` + `app.js`)**: `DSH_DEMO_DATA.nameGenders` classifica cada primeiro nome (`'f' | 'm' | 'any'`); `sortearPessoa()` sorteia gênero primeiro e tira nome **e** avatar desse mesmo gênero (`genderOfName`/`avatarGenderOf`); o avatar ainda evita repetir quem está na sala. `makePerson()` aplica a mesma regra quando só falta um dos dois.
- **Emparelhamento do plugin (`dsh-plugin/src/client.js`)**: `identidadeDe()` deriva o gênero de um hash próprio (`${id}|genero`) e escolhe nome e boneco **ambos** desse gênero (`GENERO_NOME`/`GENERO_AVATAR`); o cache `dsh-work-game:assoc` passou a `v: 3` — as entradas `v: 2` com pares trocados são re-derivadas uma única vez.
- **Regeneração**: `python3 scripts/gerar-avatares-random.py` (lê `expressions.js`, descarrega os 48 SVGs, valida e atualiza as partes mecânicas de `assets/AVATARS-EXPRESSIONS.md`). Validação só: `--validar`; validar + doc: `--validar --doc`.

## Validações

Obrigatórias em todo SVG gerado/alterado:

1. XML bem formado (`xml.etree.ElementTree`); raiz `<svg>` e `viewBox="0 0 264 280"`;
2. sem `<script>`, `foreignObject`, atributos `on*`, DOCTYPE/entidades, `@import` nem URLs externas (`href`/`url(...)` só fragmentos `#...`);
3. rasterizar com `rsvg-convert` e confirmar imagem não vazia (alfa médio > 0);
4. comparar geometria entre o busto base e as variantes (multiconjunto de formas com fill) para garantir que a identidade não mudou — as diferenças devem ser só olhos/sobrancelha/boca.

## Armadilhas

- **IDs SVG:** copiar o **mesmo** SVG inline várias vezes preserva IDs iguais — máscaras e `defs` colidem entre instâncias e a renderização corrompe. Usar `<img>` por instância (cada documento isola os IDs) ou prefixar ids + referências por instância.
- **Enums não registados:** `FrownNatural` existe como ficheiro mas **não** entra no `<Selector>` — nunca usar. `ShortHairShaggy` está comentada no render (`XXX: broken, fix it later`) → `topType` válido tem **35** valores, não 36. `BeardMagestic` é typo só no `dist/`; o nome registado é `BeardMajestic`. Só usar valores dos enums verificados: `eyeType` 12 (Close, Cry, Default, Dizzy, EyeRoll, Happy, Hearts, Side, Squint, Surprised, Wink, WinkWacky), `eyebrowType` 12 (Angry, AngryNatural, Default, DefaultNatural, FlatNatural, RaisedExcited, RaisedExcitedNatural, SadConcerned, SadConcernedNatural, UnibrowNatural, UpDown, UpDownNatural), `mouthType` 12 (Concerned, Default, Disbelief, Eating, Grimace, Sad, ScreamOpen, Serious, Smile, Tongue, Twinkle, Vomit).
- **`clotheColor` ignorado nos blazers:** `BlazerShirt` e `BlazerSweater` fixam as cores no componente (`#262E33` + `#3A4C5A`) e **não aplicam** `clotheColor` — pedir `Gray02`/`Blue03` sai igual a `Black`. As identidades que os usam declaram `clotheColor: 'Black'`, que é o que renderiza de facto (confirmar sempre o hex na paleta oficial).
- **Ids de grupo não são 1:1 com os enums:** `LongHairStraight2` renderiza com o id `Top/Long-Hair/Straight` (sem o "2") e pares como `ShortHairDreads01/02` partilham a forma do id. A prova de que a opção pedida foi a renderizada é a **URL de proveniência + hex da cor** (o `scripts/gerar-avatares-random.py` valida ambos), não o id de grupo sozinho.
- **Ids `react-*` variam entre downloads** (contador global por pedido do renderer): para comparar dois renders (identidade fixa entre presets), normalizar `react-[a-z]+-\d+` pela ordem de aparição antes de diffar.

## Comando mental passo-a-passo

1. Fixar a identidade (todas as opções exceto o triple) e confirmar os enums no repositório `fangpenlin/avataaars` — nunca confiar em valores de memória.
2. Montar a URL `avataaars.io` com `avatarStyle=Transparent` + opções fixas + triple do preset; descarregar dev-time.
3. Guardar em `assets/avatars/expressions/<id>/<preset>.svg` (ou `random/`); dedupe por triple — se o preset for `wink`, copiar o `approval` já existente.
4. Reaplicar a recolorização da roupa se a identidade for uma das 4 recoloridas (1 fill, hex registado em `AVATARS-SOURCES.md`).
5. Validar: XML, viewBox, ausência de script/URLs externas, rasterização não vazia, geometria igual ao busto base fora da face.
6. Atualizar `window.DSH_EXPRESSIONS` (presets/identities) e testar `resolve()` com os fallbacks; a app consome apenas ficheiros locais.
7. **Piscina aleatória:** mexer em `r01`..`r12` só através de `expressions.js` + `python3 scripts/gerar-avatares-random.py` (descarrega, valida as regras de gênero/provas de config e atualiza o doc); depois `npm test` para os contratos de gênero (`tests/contracts.test.mjs`, `tests/functional.test.mjs`, `tests/plugin/render.test.mjs`).
