# Avatares locais — proveniência e uso

## Origem e licença

- Download realizado em **2026-09-27 (UTC)**, durante o desenvolvimento, diretamente do renderer [avataaars.io](https://avataaars.io/). Os oito downloads finais responderam HTTP 200 com `Content-Type: image/svg+xml`.
- **Todos os rostos, cabelos, barbas, óculos, corpos e roupas são desenhos originais da biblioteca Avataaars, renderizados pelo serviço indicado. Não são rostos redesenhados nem gerados por IA.** A referência visual do usuário orientou somente a escolha de opções e cores.
- Licença MIT, copyright **2017 Pablo Stanley, Fang-Pen Lin**: [texto oficial consultado](https://raw.githubusercontent.com/fangpenlin/avataaars/master/LICENSE), preservado integralmente em [AVATAARS-LICENSE.txt](AVATAARS-LICENSE.txt).
- A referência visual fornecida pelo usuário foi apenas lida; não foi modificada nem incorporada aos SVGs.

## Inteiramente locais/offline

**O uso destes avatares no app não faz chamadas externas.** Carregue os arquivos locais por `<img src="assets/avatars/rui.svg">`, trocando apenas o nome. As URLs abaixo são registros de proveniência, não uma dependência de execução. Não há backend, plugin, framework, biblioteca instalada, script, fonte remota, imagem externa ou chamada à API necessária para exibir os avatares.

Todos usam `avatarStyle=Transparent`, `eyeType=Default` e `eyebrowType=DefaultNatural`. As bocas são exclusivamente `Smile` ou `Default`. O fundo permanece transparente, sem disco ou retângulo opaco.

## Arquivos e URLs exatas de origem

| Arquivo local | Aparência | Boca | Cor final da roupa |
| --- | --- | --- | --- |
| [rui.svg](avatars/rui.svg) | Cabelo curto preto, barba preta, óculos, hoodie preto | `Smile` | `#262E33` |
| [bia.svg](avatars/bia.svg) | Cabelo comprido castanho, camiseta violeta | `Smile` | `#8357BF` |
| [lia.svg](avatars/lia.svg) | Cabelo comprido castanho escuro, camiseta preta | `Default` | `#262E33` |
| [pesquisa.svg](avatars/pesquisa.svg) | Pele escura, cabelo curto preto, óculos, roupa verde com gola | `Default` | `#3C8652` |
| [codigo.svg](avatars/codigo.svg) | Cabelo curto castanho, barba castanha, hoodie laranja | `Smile` | `#D47A36` |
| [testes.svg](avatars/testes.svg) | Cabelo comprido loiro, camiseta rosa | `Smile` | `#FF488E` |
| [alex.svg](avatars/alex.svg) | Cabelo curto castanho escuro, camiseta azul | `Smile` | `#5199E4` |
| [maya.svg](avatars/maya.svg) | Cabelo preto comprido, camiseta verde-azulada | `Smile` | `#2F9A94` |

1. **Rui:** [SVG original](https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&accessoriesType=Prescription02&hairColor=Black&facialHairType=BeardMedium&facialHairColor=Black&clotheType=Hoodie&clotheColor=Black&mouthType=Smile&skinColor=Light)
2. **Bia:** [SVG original](https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairCurly&accessoriesType=Blank&hairColor=Brown&facialHairType=Blank&facialHairColor=Brown&clotheType=ShirtCrewNeck&clotheColor=PastelBlue&mouthType=Smile&skinColor=Light)
3. **Lia:** [SVG original](https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairCurvy&accessoriesType=Blank&hairColor=BrownDark&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Black&mouthType=Default&skinColor=Light)
4. **Pesquisa:** [SVG original](https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&accessoriesType=Prescription02&hairColor=Black&facialHairType=Blank&facialHairColor=Black&clotheType=CollarSweater&clotheColor=PastelGreen&mouthType=Default&skinColor=DarkBrown)
5. **Código:** [SVG original](https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=ShortHairShortCurly&accessoriesType=Blank&hairColor=Brown&facialHairType=BeardMedium&facialHairColor=Brown&clotheType=Hoodie&clotheColor=PastelOrange&mouthType=Smile&skinColor=Light)
6. **Testes:** [SVG original](https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairStraight2&accessoriesType=Blank&hairColor=Blonde&facialHairType=Blank&facialHairColor=Blonde&clotheType=ShirtCrewNeck&clotheColor=Pink&mouthType=Smile&skinColor=Light)
7. **Alex:** [SVG original](https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=ShortHairShortFlat&accessoriesType=Blank&hairColor=BrownDark&facialHairType=Blank&facialHairColor=BrownDark&clotheType=ShirtCrewNeck&clotheColor=Blue02&mouthType=Smile&skinColor=Tanned)
8. **Maya:** [SVG original](https://avataaars.io/?avatarStyle=Transparent&eyeType=Default&eyebrowType=DefaultNatural&topType=LongHairStraight&accessoriesType=Blank&hairColor=Black&facialHairType=Blank&facialHairColor=Black&clotheType=ShirtCrewNeck&clotheColor=PastelGreen&mouthType=Smile&skinColor=Tanned)

`CollarSweater` é a opção oficial com gola usada para a camisa de Pesquisa. Os [tipos de roupa oficiais](https://raw.githubusercontent.com/fangpenlin/avataaars/master/src/avatar/clothes/index.tsx) e a [paleta oficial](https://raw.githubusercontent.com/fangpenlin/avataaars/master/src/avatar/clothes/Colors.tsx) foram consultados para manter valores válidos nas queries.

## Adaptações locais, somente na cor das roupas

A paleta oficial não inclui violeta nem verde-azulado; suas opções verde e laranja são pastéis. Para corresponder ao pedido, somente **um atributo `fill` da roupa por arquivo** foi substituído nestes quatro casos:

| Arquivo | Opção válida usada no download | Substituição local |
| --- | --- | --- |
| [bia.svg](avatars/bia.svg) | `PastelBlue` | `#B1E2FF` → `#8357BF` |
| [pesquisa.svg](avatars/pesquisa.svg) | `PastelGreen` | `#A7FFC4` → `#3C8652` |
| [codigo.svg](avatars/codigo.svg) | `PastelOrange` | `#FFDEB5` → `#D47A36` |
| [maya.svg](avatars/maya.svg) | `PastelGreen` | `#A7FFC4` → `#2F9A94` |

Nenhum traço facial, cabelo, geometria, máscara, dimensão ou fundo foi alterado. Os outros quatro arquivos são idênticos aos bytes baixados. Nos quatro recoloridos, desfazer somente a substituição acima reproduziu exatamente o SHA-256 do download original, validando que não houve nenhuma outra alteração.

## Dimensões e posicionamento

- Todos: `viewBox="0 0 264 280"`, `width="264px"`, `height="280px"`.
- Proporção largura:altura **33:35**. Exemplos sem distorção: **132 × 140 px**, **198 × 210 px**, **264 × 280 px**.
- Para uma largura qualquer `w`, a altura é `w × 35 / 33`.
- Use a base em `y=280` alinhada ao tampo da mesa; laptop e mesa podem sobrepor a parte inferior do busto. Não remova o espaço transparente próprio do enquadramento.
- Preferir `<img>` a concatenar os SVGs inline: cada imagem mantém seus próprios IDs de máscaras isolados.

Exemplo de integração, apenas documental; nenhum arquivo da aplicação foi alterado por esta tarefa:

```html
<img src="assets/avatars/rui.svg" width="132" height="140" alt="Rui">
```

```css
.avatar {
  display: block;
  width: 132px;
  height: auto;
  aspect-ratio: 33 / 35;
  object-fit: contain;
  object-position: center bottom;
}
```

## Validação realizada

- **8/8 arquivos** analisados com `xml.etree.ElementTree` da biblioteca padrão Python; raiz SVG e `viewBox` conferidos.
- Ausência de scripts, eventos `on*`, `foreignObject`, animações, DTD, entidades externas, instruções de stylesheet, importações CSS e recursos externos.
- Todos os `href`/`xlink:href` e `url(...)` usados nos SVGs são fragmentos locais `#...`; declarações `xmlns` identificam namespaces, não provocam downloads.
- Olhos, bocas, roupa, barba e óculos conferidos nos grupos do renderer.
- Renderização local com `rsvg-convert` e inspeção RGBA com ImageMagick, ambos já disponíveis: 8/8 imagens não vazias, com alfa transparente nos quatro cantos. A validação raster ocorreu em memória, sem criar arquivos extras.
- Enquadramento opaco aproximado em pixels, usando limites superiores exclusivos:

| Avatar | Limites `(x0, y0, x1, y1)` |
| --- | --- |
| Rui | `(32, 9, 232, 280)` |
| Bia | `(24, 10, 240, 280)` |
| Lia | `(25, 16, 240, 280)` |
| Pesquisa | `(32, 9, 232, 280)` |
| Código | `(32, 9, 232, 280)` |
| Testes | `(32, 15, 240, 280)` |
| Alex | `(32, 17, 232, 280)` |
| Maya | `(32, 18, 232, 280)` |

### SHA-256 dos arquivos finais

| Arquivo | SHA-256 |
| --- | --- |
| [rui.svg](avatars/rui.svg) | `08ec2b485698390d52c913cd575261f31d59c931435d218c39c0172e6a64c21e` |
| [bia.svg](avatars/bia.svg) | `fd4a558d59940a01b9457cc66e88bdeb9ed3ca2e8d2cd05f84dde64d03ffa4c0` |
| [lia.svg](avatars/lia.svg) | `2e33658fe4ca1cd6529eb62352339644f3c470ad8b9bd2c769981c04310d3996` |
| [pesquisa.svg](avatars/pesquisa.svg) | `eaacd42d2334e96b891ca5d21d567b64ca31bd800ce5224a2b74aaec92b6ca33` |
| [codigo.svg](avatars/codigo.svg) | `67c53f89921e52c6c80209c726297921d82adebd24eb658c3aad852b686a1e45` |
| [testes.svg](avatars/testes.svg) | `15a96176c6cc5a08eb4d135ca965523d33c4252283ecfc36a85aa6a765878cba` |
| [alex.svg](avatars/alex.svg) | `43139d42f89bdf934feee1463fa8460d7690d56c2119c3abadd494dc69f8887c` |
| [maya.svg](avatars/maya.svg) | `3eac8af6c77b3d936b1024521981b00f8ff66d1d11bbbe969a269ed4c4de9379` |

Os IDs internos gerados pelo renderer podem variar em um download futuro; estes hashes identificam os arquivos locais entregues, não uma promessa de conteúdo idêntico em requisições futuras.
