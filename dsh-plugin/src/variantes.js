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
export const VARIANTES_EVENTOS = {
  tool:    { pool: ['tool', 'searching', 'focused', 'thinking'], base: 'working', prob: 0.85 },
  error:   { pool: ['error', 'surprised', 'disbelief'], base: 'error', prob: 1 },
  working: { pool: ['working', 'focused', 'thinking', 'searching', 'wink'], base: 'working', prob: 0.5 },
  success: { pool: ['success', 'celebrating', 'approval', 'wink'], base: 'success', prob: 0.9 },
  waiting: { pool: ['waiting'], base: 'waiting', prob: 0.7 },
  idle:    { pool: ['idle'], base: 'idle', prob: 1 }
};

/* FNV-1a → uint32. Personalidade estável por (pessoa, variante) e sementes. */
export function varianteHash(texto) {
  var h = 2166136261 >>> 0;
  var s = String(texto == null ? '' : texto);
  for (var i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* xorshift32: um passo do PRNG (uint32, nunca 0). */
export function variantePasso(estado) {
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
export function poolDeVariante(evento, disponiveis) {
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
export function varianteSorteio(entrada) {
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
export function criarReatorVariante(opts) {
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
