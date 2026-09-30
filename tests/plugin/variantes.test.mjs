/*
 * tests/plugin/variantes.test.mjs — o REATOR DE VARIANTES de expressão.
 *
 * Fonte única: dsh-plugin/src/variantes.js (ES module). Duas superfícies
 * levam cópia embutida (texto idêntico com os `export` removidos):
 *   expressions.js            (script puro da demo)
 *   dsh-plugin/src/client.js  (bundle do browser)
 * e state.js importa a fonte diretamente. Este ficheiro impõe a PARIDADE
 * fonte↔cópias e testa o algoritmo: pools por evento (os 14 presets TODOS),
 * disparo aleatório por pessoa, anti-repetição, fallback para identidades
 * com presets reduzidos e determinismo do sorteio puro.
 *
 * Executar: node --test tests/plugin/variantes.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VARIANTES_EVENTOS,
  varianteHash,
  variantePasso,
  poolDeVariante,
  varianteSorteio,
  criarReatorVariante,
} from '../../dsh-plugin/src/variantes.js';

const RAIZ = new URL('../../', import.meta.url);
const FONTE = readFileSync(new URL('dsh-plugin/src/variantes.js', RAIZ), 'utf8');
const BUNDLE = readFileSync(new URL('dsh-plugin/src/client.js', RAIZ), 'utf8');
const EXPRESSIONS = readFileSync(new URL('expressions.js', RAIZ), 'utf8');
const SEM_EXPORTS = FONTE.split('\n').map((l) => l.replace(/^export (const|function|let) /, '$1 ')).join('\n');

const TODOS_OS_PRESETS = [
  'approval', 'celebrating', 'disbelief', 'error', 'focused', 'idle', 'searching',
  'success', 'surprised', 'thinking', 'tool', 'waiting', 'wink', 'working',
];

/* ------------------------------------------------------------------ */
/* Paridade: as cópias embutidas são a fonte tal-e-qual (sem export)    */
/* ------------------------------------------------------------------ */

test('paridade: client.js e expressions.js embutem variantes.js tal-e-qual (sem export)', () => {
  assert.ok(BUNDLE.includes(SEM_EXPORTS),
    'client.js tem de embutir variantes.js tal-e-qual — regenerar: python3 scripts/embutir-variantes.py --embutir');
  assert.ok(EXPRESSIONS.includes(SEM_EXPORTS),
    'expressions.js tem de embutir variantes.js tal-e-qual — regenerar: python3 scripts/embutir-variantes.py --embutir');
});

test('paridade: os marcadores de embutimento existem exatamente uma vez em cada cópia', () => {
  for (const [nome, texto] of [['client.js', BUNDLE], ['expressions.js', EXPRESSIONS]]) {
    assert.equal((texto.match(/=== INÍCIO variantes\.js embutido ===/g) || []).length, 1, `${nome}: um INÍCIO`);
    assert.equal((texto.match(/=== FIM variantes\.js embutido ===/g) || []).length, 1, `${nome}: um FIM`);
  }
});

/* ------------------------------------------------------------------ */
/* Pools por evento — TODAS as variantes da biblioteca                 */
/* ------------------------------------------------------------------ */

test('pools: os 14 presets da biblioteca pertencem pelo menos a um pool', () => {
  assert.deepEqual(Object.keys(VARIANTES_EVENTOS).sort(), ['error', 'idle', 'success', 'tool', 'waiting', 'working']);
  const todos = new Set(Object.values(VARIANTES_EVENTOS).flatMap((ev) => ev.pool));
  assert.deepEqual([...todos].sort(), TODOS_OS_PRESETS, 'qualquer variante da biblioteca pode acontecer durante o trabalho');
  for (const [nome, ev] of Object.entries(VARIANTES_EVENTOS)) {
    assert.ok(ev.pool.length > 0, `${nome}: pool não vazio`);
    assert.ok(TODOS_OS_PRESETS.includes(ev.base), `${nome}: base (${ev.base}) é um preset da biblioteca`);
    assert.ok(ev.prob > 0 && ev.prob <= 1, `${nome}: probabilidade em (0,1]`);
  }
});

test('poolDeVariante: identidade com presets reduzidos cai no base do evento', () => {
  // Identidades aleatórias da demo (r01..r12) só têm idle/working/success/error.
  const reduzidos = ['idle', 'working', 'success', 'error'];
  assert.deepEqual(poolDeVariante('working', reduzidos), ['working'], 'só o que a identidade tem');
  assert.deepEqual(poolDeVariante('tool', reduzidos), ['working'], 'sem ferramenta: o base do evento');
  assert.deepEqual(poolDeVariante('error', reduzidos), ['error']);
  assert.deepEqual(poolDeVariante('success', reduzidos), ['success']);
  assert.deepEqual(poolDeVariante('waiting', reduzidos), [], 'sem base disponível: nada a sortear');
  assert.deepEqual(poolDeVariante('tool', null), VARIANTES_EVENTOS.tool.pool, 'sem restrição: o pool inteiro');
});

/* ------------------------------------------------------------------ */
/* Sorteio puro: determinístico, anti-repetição, disparo por pessoa    */
/* ------------------------------------------------------------------ */

test('varianteSorteio: puro e determinístico — mesma entrada, mesma saída', () => {
  const entrada = { estado: 42, evento: 'working', atual: null, semente: 7, sal: 1000, disponiveis: null, probabilidade: 1 };
  assert.deepEqual(varianteSorteio(entrada), varianteSorteio(entrada), 'sem efeitos colaterais entre chamadas');
  assert.notEqual(variantePasso(42), variantePasso(43), 'o passo do PRNG muda com o estado');
  assert.equal(varianteHash('rui'), varianteHash('rui'), 'hash estável');
  assert.notEqual(varianteHash('rui'), varianteHash('bia'), 'hash separa pessoas');
});

test('varianteSorteio: o disparo é aleatório (probabilidade) e a cara atual nunca repete', () => {
  // probabilidade 0 → nunca dispara; 1 → dispara sempre.
  assert.equal(varianteSorteio({ estado: 1, evento: 'error', semente: 3, probabilidade: 0 }).preset, null);
  assert.ok(varianteSorteio({ estado: 1, evento: 'error', semente: 3, probabilidade: 1 }).preset);
  // Anti-repetição: a cara atual sai do pool em sorteios consecutivos.
  let estado = 4242;
  let atual = 'working';
  for (let i = 0; i < 40; i += 1) {
    const r = varianteSorteio({ estado, evento: 'working', atual, semente: 7, sal: i, probabilidade: 1 });
    estado = r.estado;
    assert.notEqual(r.preset, atual, `sorteio ${i} não repete a cara atual`);
    assert.ok(VARIANTES_EVENTOS.working.pool.includes(r.preset), `sorteio ${i} dentro do pool`);
    atual = r.preset;
  }
});

test('varianteSorteio: o `sal` do evento muda a sequência (entropia real entre execuções)', () => {
  const um = varianteSorteio({ estado: 9, evento: 'tool', semente: 5, sal: 1700000000000, probabilidade: 1 });
  const outro = varianteSorteio({ estado: 9, evento: 'tool', semente: 5, sal: 1700000000500, probabilidade: 1 });
  assert.notDeepEqual(um, outro, 'carimbos diferentes → desfechos diferentes');
});

test('criarReatorVariante: cada pessoa tem o SEU disparo (fator) e sorteios independentes', () => {
  const a = criarReatorVariante({ semente: 7, probabilidade: 1 });
  const b = criarReatorVariante({ semente: 99, probabilidade: 1 });
  assert.notEqual(a.fator, undefined, 'o fator da pessoa é exposto');
  assert.ok(a.fator >= 0.85 && a.fator <= 1.15, 'fator de personalidade em [0.85, 1.15]');
  const sequencia = (reator) => {
    let atual = 'working';
    const saida = [];
    for (let i = 0; i < 12; i += 1) {
      const p = reator.aoEvento('working', atual, 500 + i);
      if (p) { saida.push(p); atual = p; }
    }
    return saida;
  };
  const sa = sequencia(a);
  const sb = sequencia(b);
  assert.ok(sa.length > 3 && sb.length > 3, 'com probabilidade 1 dispara sempre');
  assert.notDeepEqual(sa, sb, 'sequências próprias por pessoa');
  // Disponiveis da identidade filtram o pool (ex.: r01 só tem 4 presets).
  const reduzido = criarReatorVariante({ semente: 7, probabilidade: 1, disponiveis: ['idle', 'working', 'success', 'error'] });
  const vistas = new Set();
  for (let i = 0; i < 30; i += 1) {
    const p = reduzido.aoEvento('tool', 'working', i * 1000);
    if (p) vistas.add(p);
  }
  assert.deepEqual([...vistas], ['working'], 'sem ferramenta na identidade: fica no base');
});
