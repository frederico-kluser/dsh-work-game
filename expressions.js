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

  /* =====================================================================
   * REATOR DE VARIANTES — expressões que acontecem DURANTE o trabalho.
   * Bloco embutido a partir de dsh-plugin/src/variantes.js (fonte única):
   * regenerar com `python3 scripts/embutir-variantes.py --embutir`.
   * A paridade fonte↔cópias é imposta por teste (tests/plugin/variantes.test.mjs).
   * ===================================================================== */
  /* === INÍCIO variantes.js embutido === */
/*
 * dsh-plugin/src/variantes.js — REATOR DE VARIANTES de expressão (FONTE).
 *
 * As expressões da biblioteca Avataaars acontecem DURANTE o trabalho: eventos
 * reais (ferramenta, erro, mensagem, sucesso, espera, repouso) disparam
 * SORTEIOS de variantes dentro de pools semânticos. Cada variante tem o(s)
 * seu(s) disparo(s) — o pool de eventos a que pertence — e cada pessoa tem O
 * SEU disparo aleatório: probabilidade própria (evento × pessoa, derivada da
 * semente) e sorteio com anti-repetição (nunca repete a cara atual). Presets e
 * identidades: expressions.js / assets/AVATARS-EXPRESSIONS.md.
 *
 * DUAS FORMAS, um só algoritmo:
 *   varianteSorteio(…)   — PURO: estado uint32 entra, estado uint32 sai, sem
 *                          relógio nem Math.random. Usado por state.js
 *                          (determinístico; o estado vive na pessoa e clona-se).
 *   criarReatorVariante  — reator com estado interno (arranque determinístico
 *                          por semente; a entropia real entra pelo `sal` de
 *                          cada evento — ex.: o seu carimbo de tempo), para as
 *                          superfícies de apresentação (app.js demo e client.js
 *                          Modo jogo).
 *
 * CÓPIAS EMBUTIDAS (paridade por teste — regenerar quando este ficheiro mudar;
 * o texto embutido é este ficheiro tal-e-qual com os `export` removidos):
 *   expressions.js            — script puro da demo (window.DSH_EXPRESSIONS.variantes)
 *   dsh-plugin/src/client.js  — bundle do browser (não importa irmãos)
 */

/* Pools por evento. TODOS os 14 presets da biblioteca pertencem pelo menos a
 * um pool — as variantes TUDO o que a biblioteca desenha pode acontecer durante
 * o trabalho. `base` é o fallback quando a identidade não tem nenhum preset do
 * pool (ex.: identidades aleatórias só têm idle/working/success/error).
 * `prob` é a probabilidade-base do disparo (0..1); cada pessoa ainda a modula. */
const VARIANTES_EVENTOS = {
  tool:    { pool: ['tool', 'searching', 'focused', 'thinking'], base: 'working', prob: 0.85 },
  error:   { pool: ['error', 'surprised', 'disbelief'], base: 'error', prob: 1 },
  working: { pool: ['working', 'focused', 'thinking', 'searching', 'wink'], base: 'working', prob: 0.5 },
  success: { pool: ['success', 'celebrating', 'approval', 'wink'], base: 'success', prob: 0.9 },
  waiting: { pool: ['waiting'], base: 'waiting', prob: 0.7 },
  idle:    { pool: ['idle'], base: 'idle', prob: 1 }
};

/* FNV-1a → uint32. Personalidade estável por (pessoa, variante) e sementes. */
function varianteHash(texto) {
  var h = 2166136261 >>> 0;
  var s = String(texto == null ? '' : texto);
  for (var i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* xorshift32: um passo do PRNG (uint32, nunca 0). */
function variantePasso(estado) {
  var a = (estado >>> 0) || 0x9E3779B9;
  a ^= a << 13; a >>>= 0;
  a ^= a >>> 17;
  a ^= a << 5; a >>>= 0;
  return a || 1;
}

function varianteFracao(estado) {
  return (estado >>> 0) / 4294967296;
}

/* Pool efetivo de um evento: os presets do pool que a identidade tem;
 * se nenhum, o `base` do evento; se também não, [] (nada a sortear). */
function poolDeVariante(evento, disponiveis) {
  var ev = VARIANTES_EVENTOS[evento] || VARIANTES_EVENTOS.working;
  if (!disponiveis || !disponiveis.length) return ev.pool.slice();
  var ok = [];
  for (var i = 0; i < ev.pool.length; i += 1) {
    if (disponiveis.indexOf(ev.pool[i]) !== -1) ok.push(ev.pool[i]);
  }
  if (ok.length) return ok;
  if (disponiveis.indexOf(ev.base) !== -1) return [ev.base];
  return [];
}

/* Fator de personalidade: cada pessoa tem A SUA probabilidade de disparo. */
function fatorDePessoa(semente) {
  return 0.85 + (varianteHash('proba|' + semente) % 31) / 100; /* 0.85..1.15 */
}

/* Sorteio PURO. entrada:
     estado       uint32 — estado do PRNG (entra e sai; determinístico)
     evento       'tool'|'error'|'working'|'success'|'waiting'|'idle'
     atual        cara visível agora (anti-repetição; null = sem cara)
     semente      uint32 — personalidade da pessoa
     sal          número | null — entropia do evento (ex.: carimbo `at`)
     disponiveis  presets da identidade | null (todos)
     probabilidade 0..1 | null — sobrepõe a probabilidade efetiva (testes)
   sai { estado, preset } — preset null = o disparo não aconteceu. */
function varianteSorteio(entrada) {
  entrada = entrada || {};
  var estado = (typeof entrada.estado === 'number' && isFinite(entrada.estado))
    ? (entrada.estado >>> 0) : 1;
  var semente = (typeof entrada.semente === 'number' && isFinite(entrada.semente))
    ? (entrada.semente >>> 0) : 0;
  var pool = poolDeVariante(entrada.evento, entrada.disponiveis || null);
  if (!pool.length) return { estado: estado, preset: null };
  var ev = VARIANTES_EVENTOS[entrada.evento] || VARIANTES_EVENTOS.working;
  var prob = (typeof entrada.probabilidade === 'number' && isFinite(entrada.probabilidade))
    ? Math.max(0, Math.min(1, entrada.probabilidade))
    : Math.max(0, Math.min(1, ev.prob * fatorDePessoa(semente)));
  var sal = (typeof entrada.sal === 'number' && isFinite(entrada.sal)) ? (entrada.sal >>> 0) : 0;

  /* 1.º passo: o DISPARO é aleatório (probabilidade evento × pessoa). */
  estado = variantePasso(estado ^ variantePasso(sal));
  if (varianteFracao(estado) >= prob) return { estado: estado, preset: null };

  /* Anti-repetição: a cara atual sai do pool (só repete se for a única). */
  var opcoes = [];
  for (var i = 0; i < pool.length; i += 1) {
    if (pool[i] !== entrada.atual) opcoes.push(pool[i]);
  }
  if (!opcoes.length) opcoes = pool.slice();

  /* Personalidade: pesos estáveis 1..3 por (pessoa, variante). */
  var pesos = [];
  var total = 0;
  for (var j = 0; j < opcoes.length; j += 1) {
    var w = 1 + (varianteHash(semente + '|' + opcoes[j]) % 3);
    pesos.push(w);
    total += w;
  }
  estado = variantePasso(estado);
  var alvo = varianteFracao(estado) * total;
  for (var k = 0; k < pesos.length; k += 1) {
    alvo -= pesos[k];
    if (alvo < 0) return { estado: estado, preset: opcoes[k] };
  }
  return { estado: estado, preset: opcoes[opcoes.length - 1] };
}

/* Reator com estado próprio (superfícies de apresentação). opts:
     identidade    id da identidade (personalidade por omissão)
     semente       uint32 — a personalidade/probabilidade DE UMA pessoa
     estado        uint32 — arranque do PRNG (por omissão, derivado da
                   semente: determinístico de propósito — a entropia real
                   entra pelo `sal` de cada evento, ex.: o seu carimbo de tempo)
     disponiveis   presets da identidade | null
     probabilidade 0..1 — sobrepõe a efetiva (testes)
   devolve { fator, probabilidade, aoEvento(evento, atual, sal) -> preset|null }. */
function criarReatorVariante(opts) {
  opts = opts || {};
  var semente = (typeof opts.semente === 'number' && isFinite(opts.semente))
    ? (opts.semente >>> 0)
    : varianteHash(opts.identidade || '');
  var estado = (typeof opts.estado === 'number' && isFinite(opts.estado))
    ? (opts.estado >>> 0)
    : (varianteHash('reitor|' + semente) || 1);
  var disponiveis = opts.disponiveis || null;
  var prob = (typeof opts.probabilidade === 'number' && isFinite(opts.probabilidade))
    ? Math.max(0, Math.min(1, opts.probabilidade)) : null;
  return {
    /* probabilidade sobrepõe TODOS os eventos (testes); sem ela, cada evento
       tem a sua prob multiplicada pelo `fator` da pessoa (o disparo DELE). */
    probabilidade: prob,
    fator: fatorDePessoa(semente),
    estado: function () { return estado; },
    aoEvento: function (evento, atual, sal) {
      var r = varianteSorteio({
        estado: estado, evento: evento, atual: atual == null ? null : atual,
        semente: semente, sal: sal == null ? null : sal,
        disponiveis: disponiveis, probabilidade: prob,
      });
      estado = r.estado;
      return r.preset;
    }
  };
}

  /* === FIM variantes.js embutido === */

  window.DSH_EXPRESSIONS = {
    presets: presets,
    namedIdentityIds: namedIdentityIds,
    randomIdentityIds: randomIdentityIds,
    identities: identities,
    basePreset: basePreset,
    resolve: resolve,
    /* Reator de variantes (dsh-plugin/src/variantes.js, embutido acima):
       eventos → pools de variantes; cada pessoa tem o SEU disparo aleatório. */
    variantes: {
      eventos: VARIANTES_EVENTOS,
      hash: varianteHash,
      passo: variantePasso,
      pool: poolDeVariante,
      sortear: varianteSorteio,
      criarReator: criarReatorVariante
    }
  };
})();
