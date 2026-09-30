/*
 * expressions.js — módulo de presets de expressão para a demo "dsh-work-game".
 *
 * Script puro, sem módulos, sem dependências, sem chamadas de rede.
 * Define window.DSH_EXPRESSIONS com os presets de expressão e os caminhos
 * locais dos SVGs gerados a partir do renderer Avataaars (avataaars.io,
 * avatarStyle=Transparent). Todos os traços são desenhos originais da
 * biblioteca Avataaars (MIT, 2017 Pablo Stanley / Fang-Pen Lin) — ver
 * assets/AVATAARS-LICENSE.txt e a documentação em assets/AVATARS-EXPRESSIONS.md.
 *
 * Contrato:
 *   presets           [{id, label, eyeType, eyebrowType, mouthType, when}]  (14)
 *   namedIdentityIds  ['rui','bia','lia','pesquisa','codigo','testes','alex','maya']
 *   randomIdentityIds ['r01'..'r12']
 *   identities        mapa id -> config (nomeadas: só referência; aleatórias: enums completos)
 *   basePreset        'idle'
 *   resolve(id, preset) -> caminho local do SVG | null
 */
(function () {
  'use strict';

  var NAMED_DIR = 'assets/avatars/expressions/';
  var RANDOM_DIR = 'assets/avatars/random/';

  /* Presets: apenas olhos/sobrancelha/boca mudam; a identidade é fixa por pessoa.
     Enums verificados em github.com/fangpenlin/avataaars
     (src/avatar/face/eyes|eyebrow|mouth/index.tsx). */
  var presets = [
    { id: 'idle',        label: 'Em repouso',     eyeType: 'Default',   eyebrowType: 'DefaultNatural',      mouthType: 'Smile',      when: 'parado, sem tarefa em andamento' },
    { id: 'working',     label: 'Trabalhando',    eyeType: 'Happy',     eyebrowType: 'DefaultNatural',      mouthType: 'Twinkle',    when: 'executando a tarefa normal' },
    { id: 'focused',     label: 'Concentrado',    eyeType: 'Squint',    eyebrowType: 'FlatNatural',         mouthType: 'Serious',    when: 'foco profundo / modo silencioso' },
    { id: 'tool',        label: 'Com ferramenta', eyeType: 'WinkWacky', eyebrowType: 'RaisedExcited',       mouthType: 'Smile',      when: 'acionou ferramenta/terminal' },
    { id: 'searching',   label: 'Procurando',     eyeType: 'Side',      eyebrowType: 'UpDown',              mouthType: 'Concerned',  when: 'busca/varredura em andamento' },
    { id: 'thinking',    label: 'Pensando',       eyeType: 'Squint',    eyebrowType: 'UnibrowNatural',      mouthType: 'Concerned',  when: 'planejando, deliberando' },
    { id: 'waiting',     label: 'Esperando',      eyeType: 'Default',   eyebrowType: 'SadConcerned',        mouthType: 'Sad',        when: 'aguardando fila ou resposta' },
    { id: 'approval',    label: 'Aprovando',      eyeType: 'Wink',      eyebrowType: 'RaisedExcited',       mouthType: 'Smile',      when: 'aprovação / sinal positivo' },
    { id: 'success',     label: 'Sucesso',        eyeType: 'Happy',     eyebrowType: 'RaisedExcitedNatural', mouthType: 'Smile',     when: 'tarefa concluída com sucesso' },
    { id: 'celebrating', label: 'Comemorando',    eyeType: 'WinkWacky', eyebrowType: 'RaisedExcited',       mouthType: 'Tongue',     when: 'vitória, festa, conquista' },
    { id: 'error',       label: 'Erro',           eyeType: 'Cry',       eyebrowType: 'AngryNatural',        mouthType: 'Grimace',    when: 'falha, erro, derrota momentânea' },
    { id: 'surprised',   label: 'Surpreso',       eyeType: 'Surprised', eyebrowType: 'RaisedExcited',       mouthType: 'ScreamOpen', when: 'evento inesperado, bug súbito' },
    { id: 'disbelief',   label: 'Descrente',      eyeType: 'EyeRoll',   eyebrowType: 'UpDownNatural',       mouthType: 'Disbelief',  when: 'incredulidade, "não acredito"' },
    { id: 'wink',        label: 'Piscada',        eyeType: 'Wink',      eyebrowType: 'RaisedExcited',       mouthType: 'Smile',      when: 'gracejo, interação casual' }
  ];

  var namedIdentityIds = ['rui', 'bia', 'lia', 'pesquisa', 'codigo', 'testes', 'alex', 'maya'];
  var randomIdentityIds = ['r01', 'r02', 'r03', 'r04', 'r05', 'r06', 'r07', 'r08', 'r09', 'r10', 'r11', 'r12'];

  /* Identidades nomeadas: config fixa (topType/hairColor/accessories/facialHair/
     clothe/skin idênticos aos bustos em assets/avatars/*.svg); aqui fica apenas a
     referência ao busto base e ao diretório das expressões. As opções completas
     estão documentadas em assets/AVATARS-SOURCES.md. */
  var ALL_NAMED_PRESETS = presets.map(function (p) { return p.id; });

  /* `gender` ('f' | 'm') casa o avatar com o nome sorteado (regra 2026-09-29:
     o género do boneco tem de bater com o género do nome). */
  var identities = {
    rui:      { type: 'named', gender: 'm', avatar: 'assets/avatars/rui.svg',      dir: NAMED_DIR + 'rui',      presets: ALL_NAMED_PRESETS },
    bia:      { type: 'named', gender: 'f', avatar: 'assets/avatars/bia.svg',      dir: NAMED_DIR + 'bia',      presets: ALL_NAMED_PRESETS },
    lia:      { type: 'named', gender: 'f', avatar: 'assets/avatars/lia.svg',      dir: NAMED_DIR + 'lia',      presets: ALL_NAMED_PRESETS },
    pesquisa: { type: 'named', gender: 'm', avatar: 'assets/avatars/pesquisa.svg', dir: NAMED_DIR + 'pesquisa', presets: ALL_NAMED_PRESETS },
    codigo:   { type: 'named', gender: 'm', avatar: 'assets/avatars/codigo.svg',   dir: NAMED_DIR + 'codigo',   presets: ALL_NAMED_PRESETS },
    testes:   { type: 'named', gender: 'f', avatar: 'assets/avatars/testes.svg',   dir: NAMED_DIR + 'testes',   presets: ALL_NAMED_PRESETS },
    alex:     { type: 'named', gender: 'm', avatar: 'assets/avatars/alex.svg',     dir: NAMED_DIR + 'alex',     presets: ALL_NAMED_PRESETS },
    maya:     { type: 'named', gender: 'f', avatar: 'assets/avatars/maya.svg',     dir: NAMED_DIR + 'maya',     presets: ALL_NAMED_PRESETS },

    /* Identidades aleatórias: enums completos (valores registrados na biblioteca
       Avataaars), redesenhadas em 2026-09-29 para o género bater com o nome:
       6 femininas (r01–r06) SEM qualquer barba/bigode e 6 masculinas (r07–r12);
       12 topType todos distintos e ZERO chapéus/bonés (o "boné" repetido saiu);
       óculos só de lente transparente (Prescription/Round) para as expressões
       ficarem legíveis; 6 tons de pele (sem Yellow); 4 presets renderizados.
       NOTA: o renderer ignora `clotheColor` em `BlazerShirt`/`BlazerSweater`
       (paleta fixa #262E33 + #3A4C5A) — por isso essas identidades declaram
       `clotheColor: 'Black'`, que é o que sai mesmo.
       Regeneração: python3 scripts/gerar-avatares-random.py */
    r01: { type: 'random', gender: 'f', dir: RANDOM_DIR + 'r01', presets: ['idle', 'working', 'success', 'error'],
           topType: 'LongHairBob', hairColor: 'BrownDark', accessoriesType: 'Blank',
           facialHairType: 'Blank', facialHairColor: 'BrownDark',
           clotheType: 'ShirtCrewNeck', clotheColor: 'PastelBlue', skinColor: 'Pale' },
    r02: { type: 'random', gender: 'f', dir: RANDOM_DIR + 'r02', presets: ['idle', 'working', 'success', 'error'],
           topType: 'LongHairCurly', hairColor: 'Black', accessoriesType: 'Round',
           facialHairType: 'Blank', facialHairColor: 'Black',
           clotheType: 'CollarSweater', clotheColor: 'PastelGreen', skinColor: 'DarkBrown' },
    r03: { type: 'random', gender: 'f', dir: RANDOM_DIR + 'r03', presets: ['idle', 'working', 'success', 'error'],
           topType: 'LongHairStraight2', hairColor: 'Blonde', accessoriesType: 'Blank',
           facialHairType: 'Blank', facialHairColor: 'Blonde',
           clotheType: 'ShirtScoopNeck', clotheColor: 'Pink', skinColor: 'Light' },
    r04: { type: 'random', gender: 'f', dir: RANDOM_DIR + 'r04', presets: ['idle', 'working', 'success', 'error'],
           topType: 'LongHairBun', hairColor: 'Auburn', accessoriesType: 'Prescription01',
           facialHairType: 'Blank', facialHairColor: 'Auburn',
           clotheType: 'BlazerShirt', clotheColor: 'Black', skinColor: 'Tanned' },
    r05: { type: 'random', gender: 'f', dir: RANDOM_DIR + 'r05', presets: ['idle', 'working', 'success', 'error'],
           topType: 'LongHairFro', hairColor: 'Brown', accessoriesType: 'Blank',
           facialHairType: 'Blank', facialHairColor: 'Brown',
           clotheType: 'Hoodie', clotheColor: 'Red', skinColor: 'Black' },
    r06: { type: 'random', gender: 'f', dir: RANDOM_DIR + 'r06', presets: ['idle', 'working', 'success', 'error'],
           topType: 'LongHairMiaWallace', hairColor: 'SilverGray', accessoriesType: 'Blank',
           facialHairType: 'Blank', facialHairColor: 'SilverGray',
           clotheType: 'GraphicShirt', graphicType: 'Hola', clotheColor: 'PastelYellow', skinColor: 'Brown' },
    r07: { type: 'random', gender: 'm', dir: RANDOM_DIR + 'r07', presets: ['idle', 'working', 'success', 'error'],
           topType: 'ShortHairShortCurly', hairColor: 'BlondeGolden', accessoriesType: 'Blank',
           facialHairType: 'BeardLight', facialHairColor: 'BlondeGolden',
           clotheType: 'BlazerSweater', clotheColor: 'Black', skinColor: 'Tanned' },
    r08: { type: 'random', gender: 'm', dir: RANDOM_DIR + 'r08', presets: ['idle', 'working', 'success', 'error'],
           topType: 'ShortHairShortFlat', hairColor: 'Platinum', accessoriesType: 'Prescription02',
           facialHairType: 'Blank', facialHairColor: 'Platinum',
           clotheType: 'ShirtCrewNeck', clotheColor: 'White', skinColor: 'Light' },
    r09: { type: 'random', gender: 'm', dir: RANDOM_DIR + 'r09', presets: ['idle', 'working', 'success', 'error'],
           topType: 'ShortHairDreads01', hairColor: 'BrownDark', accessoriesType: 'Blank',
           facialHairType: 'Blank', facialHairColor: 'BrownDark',
           clotheType: 'Overall', clotheColor: 'Gray01', skinColor: 'Brown' },
    r10: { type: 'random', gender: 'm', dir: RANDOM_DIR + 'r10', presets: ['idle', 'working', 'success', 'error'],
           topType: 'ShortHairFrizzle', hairColor: 'Red', accessoriesType: 'Round',
           facialHairType: 'MoustacheFancy', facialHairColor: 'Red',
           clotheType: 'ShirtVNeck', clotheColor: 'Blue02', skinColor: 'Pale' },
    r11: { type: 'random', gender: 'm', dir: RANDOM_DIR + 'r11', presets: ['idle', 'working', 'success', 'error'],
           topType: 'ShortHairTheCaesar', hairColor: 'Brown', accessoriesType: 'Blank',
           facialHairType: 'BeardMedium', facialHairColor: 'Brown',
           clotheType: 'CollarSweater', clotheColor: 'PastelOrange', skinColor: 'Black' },
    r12: { type: 'random', gender: 'm', dir: RANDOM_DIR + 'r12', presets: ['idle', 'working', 'success', 'error'],
           topType: 'NoHair', hairColor: 'Black', accessoriesType: 'Blank',
           facialHairType: 'BeardMajestic', facialHairColor: 'Black',
           clotheType: 'Hoodie', clotheColor: 'Black', skinColor: 'DarkBrown' }
  };

  var basePreset = 'idle';

  /**
   * resolve(identityId, presetId) -> caminho local do SVG da expressão pedida.
   * 1. preset pedido existe para a identidade -> assets/avatars/{expressions|random}/<id>/<preset>.svg
   * 2. preset pedido falta (ou é desconhecido) -> cai para 'idle'
   * 3. ainda falta -> assets/avatars/<identityId>.svg (somente identidades nomeadas)
   * 4. caso contrário -> null
   */
  function resolve(identityId, presetId) {
    var ident = identities[identityId];
    if (!ident) { return null; }
    var list = ident.presets || [];
    var wanted = typeof presetId === 'string' ? presetId : '';
    if (list.indexOf(wanted) !== -1) {
      return ident.dir + '/' + wanted + '.svg';
    }
    if (list.indexOf(basePreset) !== -1) {
      return ident.dir + '/' + basePreset + '.svg';
    }
    if (ident.type === 'named' && ident.avatar) {
      return ident.avatar;
    }
    return null;
  }

  window.DSH_EXPRESSIONS = {
    presets: presets,
    namedIdentityIds: namedIdentityIds,
    randomIdentityIds: randomIdentityIds,
    identities: identities,
    basePreset: basePreset,
    resolve: resolve
  };
})();
