/*
 * tests/plugin/expressoes.test.mjs — o MOTOR DE EXPRESSÕES.
 *
 * Fonte única: dsh-plugin/src/expressoes.js (ES module). A superfície pura da
 * demo (expressions.js) leva cópia embutida (texto idêntico sem `export`) e a
 * paridade fonte↔cópia é imposta aqui; o bundle client.js recebe a sua cópia
 * no seguimento da integração (quando os marcadores lá estiverem, este ficheiro
 * passa a exigir a paridade também lá).
 *
 * Cobre: taxonomia de cenários (14 presets + sleeping em pools), mapeamento
 * evento→cenário (incl. limiares de contexto com histerese e gatilho absoluto
 * de 200k), arbitragem por prioridade (pergunta/erro acima de mensagem/
 * ferramenta), min-dwell por deltas de `at`, stickiness terminal, garantias do
 * shuffle bag (≥100 desenhos por cenário: todas as variantes por ciclo, zero
 * repetição imediata incluindo fronteiras), determinismo, dose-resposta (graus
 * de erro), fallback de identidades com 4 presets, pureza e a integração em
 * state.js.
 *
 * Executar: node --test tests/plugin/expressoes.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXPRESSOES_CENARIOS,
  EXPRESSOES_LIMIARES,
  EXPRESSOES_TERMINAIS,
  expressaoHash,
  expressaoPasso,
  expressaoFator,
  poolDeCenario,
  expressaoBase,
  prioridadeDeCenario,
  grauDeCenario,
  nivelDePressao,
  cenarioDeEvento,
  expressaoAplicavel,
  sortearExpressao,
  criarMotorExpressoes,
} from '../../dsh-plugin/src/expressoes.js';
import { createOfficeState, applyEvent, personView } from '../../dsh-plugin/src/state.js';

const RAIZ = new URL('../../', import.meta.url);
const FONTE = readFileSync(new URL('dsh-plugin/src/expressoes.js', RAIZ), 'utf8');
const EXPRESSIONS = readFileSync(new URL('expressions.js', RAIZ), 'utf8');
const BUNDLE = readFileSync(new URL('dsh-plugin/src/client.js', RAIZ), 'utf8');
const SEM_EXPORTS = FONTE.split('\n').map((l) => l.replace(/^export (const|function|let) /, '$1 ')).join('\n');

const TODOS_OS_PRESETS = [
  'approval', 'celebrating', 'disbelief', 'error', 'focused', 'idle', 'searching',
  'success', 'surprised', 'thinking', 'tool', 'waiting', 'wink', 'working',
];
const REDUZIDOS = ['idle', 'working', 'success', 'error']; /* identidades aleatórias r01..r12 */
const LIMIARES_MIN_DWELL = EXPRESSOES_LIMIARES.minDwellMs;
const LIMIARES_MIN_MUDANCA = EXPRESSOES_LIMIARES.minMudancaMs;

/* ------------------------------------------------------------------ */
/* Paridade: a cópia embutida é a fonte tal-e-qual (sem export)         */
/* ------------------------------------------------------------------ */

test('paridade: expressions.js embute expressoes.js tal-e-qual (sem export)', () => {
  assert.ok(EXPRESSIONS.includes(SEM_EXPORTS),
    'expressions.js tem de embutir expressoes.js tal-e-qual — regenerar: python3 scripts/embutir-expressoes-motor.py --embutir --alvo expressions');
});

test('paridade: os marcadores de embutimento existem exatamente uma vez', () => {
  assert.equal((EXPRESSIONS.match(/=== INÍCIO expressoes\.js embutido ===/g) || []).length, 1, 'expressions.js: um INÍCIO');
  assert.equal((EXPRESSIONS.match(/=== FIM expressoes\.js embutido ===/g) || []).length, 1, 'expressions.js: um FIM');
  /* client.js: o embutimento é do seguimento da integração do bundle — só se
     exige paridade quando os marcadores já lá estiverem. */
  const temBlocos = BUNDLE.includes('=== INÍCIO expressoes.js embutido ===');
  if (temBlocos) {
    assert.ok(BUNDLE.includes(SEM_EXPORTS),
      'client.js embute expressoes.js tal-e-qual — regenerar: python3 scripts/embutir-expressoes-motor.py --embutir --alvo client');
    assert.equal((BUNDLE.match(/=== INÍCIO expressoes\.js embutido ===/g) || []).length, 1, 'client.js: um INÍCIO');
    assert.equal((BUNDLE.match(/=== FIM expressoes\.js embutido ===/g) || []).length, 1, 'client.js: um FIM');
  }
});

/* ------------------------------------------------------------------ */
/* Taxonomia de cenários                                                */
/* ------------------------------------------------------------------ */

test('cada cenário tem pool/base/prob/prioridade válidos', () => {
  const nomes = Object.keys(EXPRESSOES_CENARIOS);
  assert.deepEqual(nomes, [
    'pergunta', 'aprovacao', 'erro', 'sucesso', 'ferramenta-erro', 'erro-transitorio',
    'cancelado', 'compactacao', 'sobrecarga', 'ferramenta', 'contexto', 'mensagem',
    'subagente', 'ocioso', 'dormir'
  ], 'os 15 cenários da taxonomia, pela ordem de prioridade');
  for (const [nome, cen] of Object.entries(EXPRESSOES_CENARIOS)) {
    assert.ok(cen.pool.length > 0, `${nome}: pool não vazio`);
    /* `base` é o fallback de identidades SEM presets do pool (como em
       variantes.js): tem de ser um preset válido, mas não precisa de estar no
       pool (ex.: 'ferramenta' cai em 'working'). */
    assert.ok(TODOS_OS_PRESETS.includes(cen.base) || cen.base === 'sleeping',
      `${nome}: base (${cen.base}) é um preset da biblioteca`);
    assert.ok(cen.prob > 0 && cen.prob <= 1, `${nome}: probabilidade em (0,1]`);
    assert.ok(Number.isInteger(cen.prioridade) && cen.prioridade >= 0, `${nome}: prioridade inteira`);
    if (cen.graus) {
      assert.ok(cen.graus.length > 0 && cen.graus.every((g) => g.presets.length > 0),
        `${nome}: graus não vazios`);
    }
  }
});

test('os 14 presets da biblioteca pertencem a pelo menos um pool (mais o sleeping do Modo jogo)', () => {
  const todos = new Set(Object.values(EXPRESSOES_CENARIOS).flatMap((c) => c.pool));
  for (const p of TODOS_OS_PRESETS) assert.ok(todos.has(p), `preset ${p} coberto por algum cenário`);
  assert.ok(todos.has('sleeping'), "'sleeping' coberto pelo cenário 'dormir' (Modo jogo)");
  assert.deepEqual([...todos].sort(), [...TODOS_OS_PRESETS, 'sleeping'].sort(), 'nada mais entra em pools');
});

test('limiares: os valores quantificados da ronda 2 (Q10/Q12) estão fixados', () => {
  assert.deepEqual(EXPRESSOES_LIMIARES, {
    aviso: 0.7,          /* Q12: extrapolação declarada (convenção 50/75/90) */
    sobrecarga: 0.85,    /* Q12: extrapolação declarada */
    histerese: 0.05,     /* Q8/S56: deadband anti-flicker (5 pontos) */
    minDwellMs: 1200,    /* Q10: categorização consciente ~0,6–1,0 s */
    minMudancaMs: 1000,  /* Q3/Q10: no máximo ~1 mudança/s */
    duracaoMensagemMs: 2800, /* Q10: duração por mensagem 2,5–3,0 s */
    avisoAbsoluto: 200000    /* pedido do utilizador: contexto > 200k */
  });
});

test('prioridades: pergunta/aprovação no topo, erro acima de ação, repouso no fundo', () => {
  assert.equal(prioridadeDeCenario('pergunta'), 95);
  assert.equal(prioridadeDeCenario('aprovacao'), 95);
  assert.equal(prioridadeDeCenario('erro'), 90);
  assert.equal(prioridadeDeCenario('sucesso'), 85);
  assert.equal(prioridadeDeCenario('ferramenta'), 50);
  assert.equal(prioridadeDeCenario('mensagem'), 40);
  assert.equal(prioridadeDeCenario('ocioso'), 10);
  assert.equal(prioridadeDeCenario('dormir'), 5);
  assert.equal(prioridadeDeCenario('desconhecido'), 0);
  /* pergunta/erro batem mensagem/ferramenta (arbitragem em rajadas, Q8) */
  assert.ok(prioridadeDeCenario('pergunta') > prioridadeDeCenario('mensagem'));
  assert.ok(prioridadeDeCenario('erro') > prioridadeDeCenario('ferramenta'));
  assert.deepEqual(EXPRESSOES_TERMINAIS, ['sucesso', 'erro', 'cancelado']);
});

/* ------------------------------------------------------------------ */
/* Mapeamento evento → cenário                                          */
/* ------------------------------------------------------------------ */

test('cenarioDeEvento: vocabulário normalizado §1 → cenários da taxonomia', () => {
  const casos = [
    [{ type: 'question', sessionId: 's', id: 'q' }, 'pergunta'],
    [{ type: 'approval', sessionId: 's', id: 'a' }, 'aprovacao'],
    [{ type: 'turn/end', sessionId: 's', kind: 'completed' }, 'sucesso'],
    [{ type: 'turn/end', sessionId: 's', kind: 'error' }, 'erro'],
    [{ type: 'turn/end', sessionId: 's', kind: 'blocked' }, 'erro'],
    [{ type: 'turn/end', sessionId: 's', kind: 'max-tokens' }, 'erro'],
    [{ type: 'turn/end', sessionId: 's', kind: 'aborted' }, 'cancelado'],
    [{ type: 'turn/end', sessionId: 's', kind: 'interrupted' }, 'cancelado'],
    [{ type: 'turn/end', sessionId: 's', kind: 'misterioso' }, null],
    [{ type: 'tool', sessionId: 's', phase: 'call', name: 'bash' }, 'ferramenta'],
    [{ type: 'tool', sessionId: 's', phase: 'result', name: 'bash', ok: true }, 'ferramenta'],
    [{ type: 'tool', sessionId: 's', phase: 'result', name: 'bash' }, 'ferramenta'],
    [{ type: 'tool', sessionId: 's', phase: 'result', name: 'bash', ok: false }, 'ferramenta-erro'],
    [{ type: 'message', sessionId: 's', side: 'user' }, 'mensagem'],
    [{ type: 'message', sessionId: 's', side: 'assistant' }, 'mensagem'],
    [{ type: 'retry', sessionId: 's' }, 'erro-transitorio'],
    [{ type: 'compaction', sessionId: 's', phase: 'start' }, 'compactacao'],
    [{ type: 'compaction', sessionId: 's', phase: 'end' }, null],
    [{ type: 'subagent/start', sessionId: 's', childId: 'c', runId: 'r' }, 'subagente'],
    [{ type: 'subagent/end', sessionId: 's', childId: 'c', runId: 'r' }, null],
    [{ type: 'status', sessionId: 's', status: 'idle' }, 'ocioso'],
    [{ type: 'status', sessionId: 's', status: 'running' }, null],
    [{ type: 'question/answered', sessionId: 's', id: 'q' }, null],
    [{ type: 'approval/decided', sessionId: 's', id: 'a' }, null],
    [{ type: 'usage', sessionId: 's' }, null],
    [{ type: 'session/added', sessionId: 's' }, null],
  ];
  for (const [evento, esperado] of casos) {
    assert.equal(cenarioDeEvento(evento, null), esperado, `${evento.type}${evento.kind ? '/' + evento.kind : ''}`);
  }
  /* Modo jogo: quem está Disponível dorme */
  assert.equal(cenarioDeEvento({ type: 'status', status: 'idle' }, { modoJogo: true }), 'dormir');
});

test('cenarioDeEvento/ctx: limiares de pressão com histerese e gatilho absoluto de 200k', () => {
  const ctx = (used, window) => ({ type: 'ctx', sessionId: 's', used, window });
  /* abaixo do aviso: nada */
  assert.equal(cenarioDeEvento(ctx(50000, 100000), null), null);
  /* ≥ aviso (0.7): contexto · ≥ sobrecarga (0.85): sobrecarga */
  assert.equal(cenarioDeEvento(ctx(72000, 100000), null), 'contexto');
  assert.equal(cenarioDeEvento(ctx(90000, 100000), null), 'sobrecarga');
  /* gatilho absoluto: contexto > 200k mesmo com janela desconhecida */
  assert.equal(cenarioDeEvento({ type: 'ctx', used: 210000 }, null), 'contexto');
  assert.equal(cenarioDeEvento({ type: 'ctx', used: 150000 }, null), null);
  /* histerese (deadband ANSI/ISA-18.2): um nível ativo só desativa 5 pontos abaixo */
  assert.equal(cenarioDeEvento(ctx(68000, 100000), { ctxNivel: 'contexto' }), 'contexto', '0.68 < 0.70 mas mantém (histerese)');
  assert.equal(cenarioDeEvento(ctx(64000, 100000), { ctxNivel: 'contexto' }), null, 'abaixo de 0.65 desativa');
  assert.equal(cenarioDeEvento(ctx(82000, 100000), { ctxNivel: 'sobrecarga' }), 'sobrecarga', '0.82 < 0.85 mas mantém');
  assert.equal(cenarioDeEvento(ctx(78000, 100000), { ctxNivel: 'sobrecarga' }), 'contexto', 'abaixo de 0.80 desce um degrau');
  /* histerese também no gatilho absoluto (5% de 200k) */
  assert.equal(cenarioDeEvento({ type: 'ctx', used: 195000 }, { ctxNivel: 'contexto' }), 'contexto');
  assert.equal(cenarioDeEvento({ type: 'ctx', used: 189000 }, { ctxNivel: 'contexto' }), null);
  /* a projeção `model` também traz pressão (used = projectedTokens ?? pressureTokens) */
  assert.equal(cenarioDeEvento({ type: 'model', projectedTokens: 90000, contextWindow: 100000 }, null), 'sobrecarga');
  assert.equal(cenarioDeEvento({ type: 'model', pressureTokens: 260000 }, null), 'contexto');
});

test('nivelDePressao é puro e conserva o nível até à histerese', () => {
  assert.deepEqual(nivelDePressao({ used: 10, window: 100 }, null), 'nenhum');
  assert.deepEqual(nivelDePressao({ used: 70, window: 100 }, null), 'contexto');
  assert.deepEqual(nivelDePressao({ used: 85, window: 100 }, 'contexto'), 'sobrecarga');
  assert.deepEqual(nivelDePressao({ used: null, window: null }, 'sobrecarga'), 'nenhum', 'sem dados: sem pressão');
});

/* ------------------------------------------------------------------ */
/* Arbitragem temporal (min-dwell, cadência, terminal)                  */
/* ------------------------------------------------------------------ */

test('expressaoAplicavel: prioridade superior aplica-se SEMPRE (pergunta/erro nunca se escondem)', () => {
  /* dentro do min-dwell: inferior é suprimido, superior passa */
  const base = { at: 1500, ultimaAt: 1000 };
  assert.equal(expressaoAplicavel({ ...base, prioridadeAtual: 40, prioridadeNova: 95 }), true, 'pergunta sobre mensagem');
  assert.equal(expressaoAplicavel({ ...base, prioridadeAtual: 50, prioridadeNova: 90 }), true, 'erro sobre ferramenta');
  assert.equal(expressaoAplicavel({ ...base, prioridadeAtual: 50, prioridadeNova: 40 }), false, 'mensagem sobre ferramenta: espera');
});

test('expressaoAplicavel: min-dwell 1200ms para prioridade inferior (Q10)', () => {
  const p = (delta) => expressaoAplicavel({ prioridadeAtual: 50, prioridadeNova: 40, ultimaAt: 1000, at: 1000 + delta });
  assert.equal(p(0), false);
  assert.equal(p(LIMIARES_MIN_DWELL - 1), false, 'ainda dentro do dwell');
  assert.equal(p(LIMIARES_MIN_DWELL), true, 'dwell cumprido');
  assert.equal(p(5000), true);
  /* sem carimbos não há tempo que impor: o desenho passa */
  assert.equal(expressaoAplicavel({ prioridadeAtual: 50, prioridadeNova: 40, at: null, ultimaAt: null }), true);
});

test('expressaoAplicavel: prioridade igual só redesenha a partir de minMudancaMs (Q3/Q10)', () => {
  const p = (delta) => expressaoAplicavel({ prioridadeAtual: 40, prioridadeNova: 40, ultimaAt: 1000, at: 1000 + delta });
  assert.equal(p(LIMIARES_MIN_MUDANCA - 1), false, 'cadência máxima: ~1 mudança/s');
  assert.equal(p(LIMIARES_MIN_MUDANCA), true);
});

test('expressaoAplicavel: stickiness terminal — sucesso/erro/cancelado ficam até novo turno ou prioridade igual/superior (Q6/Q8)', () => {
  const com = (extra) => expressaoAplicavel({ at: 2000, ultimaAt: 1000, ...extra });
  /* cara de sucesso (85): mensagem (40) não a substitui… */
  assert.equal(com({ terminal: 'sucesso', prioridadeAtual: 85, prioridadeNova: 40 }), false);
  /* …um message do utilizador (novo turno) sim… */
  assert.equal(com({ terminal: 'sucesso', prioridadeAtual: 85, prioridadeNova: 40, novoTurno: true }), true);
  /* …e um erro (90) ou outro sucesso (85) também */
  assert.equal(com({ terminal: 'sucesso', prioridadeAtual: 85, prioridadeNova: 90 }), true);
  assert.equal(com({ terminal: 'sucesso', prioridadeAtual: 85, prioridadeNova: 85 }), true);
  /* cara de erro (90): só prioridade ≥ 90 ou novo turno */
  assert.equal(com({ terminal: 'erro', prioridadeAtual: 90, prioridadeNova: 85 }), false);
  assert.equal(com({ terminal: 'erro', prioridadeAtual: 90, prioridadeNova: 95 }), true);
  /* cara de cancelado (70): compactação (65) fica por baixo, retentativa (75) passa */
  assert.equal(com({ terminal: 'cancelado', prioridadeAtual: 70, prioridadeNova: 65 }), false);
  assert.equal(com({ terminal: 'cancelado', prioridadeAtual: 70, prioridadeNova: 75 }), true);
  /* sem terminal, as regras normais mandam */
  assert.equal(com({ terminal: null, prioridadeAtual: 85, prioridadeNova: 40 }), false, 'min-dwell protege a cara nova');
});

/* ------------------------------------------------------------------ */
/* Shuffle bag: garantias sobre ≥100 desenhos por cenário               */
/* ------------------------------------------------------------------ */

/* Corre N desenhos de um cenário (probabilidade 1, sem grau) e devolve as
 * sequências por ciclo, lendo o estado serializável dos sacos. */
function correrCenario(cenario, semente, n, disponiveis = null) {
  let estado = expressaoHash('teste|' + cenario + '|' + semente) || 1;
  let sacos = {};
  let atual = null;
  const ciclos = [];
  let anterior = null;
  for (let i = 0; i < n; i += 1) {
    const r = sortearExpressao({
      estado, sacos, cenario, atual, semente, sal: 1000 + i * 37,
      disponiveis, probabilidade: 1, grau: null, pessoa: null
    });
    estado = r.estado;
    sacos = r.sacos;
    if (!r.preset) continue;
    const saco = sacos[cenario];
    if (anterior === null || saco.ciclo !== anterior) { ciclos.push([]); anterior = saco.ciclo; }
    ciclos[ciclos.length - 1].push(r.preset);
    atual = r.preset;
  }
  return ciclos;
}

test('shuffle bag: cada ciclo é uma permutação do pool — todas as variantes antes de qualquer repetição', () => {
  for (const [cenario, cen] of Object.entries(EXPRESSOES_CENARIOS)) {
    const pool = cen.pool.slice().sort();
    const ciclos = correrCenario(cenario, 7, 120);
    assert.ok(ciclos.length >= 2, `${cenario}: vários ciclos em 120 desenhos`);
    for (const ciclo of ciclos) {
      assert.deepEqual([...ciclo].sort(), pool,
        `${cenario}: cada ciclo usa TODAS as variantes do pool, uma vez cada`);
    }
  }
});

test('shuffle bag: zero repetição imediata — inclusive nas fronteiras entre ciclos (Q9)', () => {
  for (const [cenario, cen] of Object.entries(EXPRESSOES_CENARIOS)) {
    if (cen.pool.length < 2) continue;
    const ciclos = correrCenario(cenario, 11, 120);
    const tudo = ciclos.flat();
    for (let i = 1; i < tudo.length; i += 1) {
      assert.notEqual(tudo[i], tudo[i - 1],
        `${cenario}: desenho ${i} (${tudo[i]}) não repete o anterior (${tudo[i - 1]})`);
    }
  }
});

test('shuffle bag: anti-repetição contra a cara atual — nunca repete quando há alternativa', () => {
  let estado = 4242;
  let sacos = {};
  let atual = 'working';
  for (let i = 0; i < 60; i += 1) {
    const r = sortearExpressao({
      estado, sacos, cenario: 'mensagem', atual, semente: 7, sal: i,
      disponiveis: null, probabilidade: 1
    });
    estado = r.estado;
    sacos = r.sacos;
    assert.notEqual(r.preset, atual, `desenho ${i} nunca devolve a cara atual`);
    assert.ok(EXPRESSOES_CENARIOS.mensagem.pool.includes(r.preset), `desenho ${i} dentro do pool`);
    atual = r.preset;
  }
});

test('shuffle bag: o estado dos sacos é pequeno e serializável ({ordem, i, ciclo} por cenário)', () => {
  let estado = 5;
  let sacos = {};
  for (let i = 0; i < 8; i += 1) {
    const r = sortearExpressao({ estado, sacos, cenario: 'sucesso', atual: null, semente: 3, sal: i, probabilidade: 1 });
    estado = r.estado;
    sacos = r.sacos;
  }
  const saco = sacos.sucesso;
  assert.deepEqual(Object.keys(saco).sort(), ['ciclo', 'i', 'ordem']);
  assert.ok(Array.isArray(saco.ordem) && saco.ordem.every((p) => typeof p === 'string'));
  assert.equal(JSON.parse(JSON.stringify(sacos)).sucesso.ciclo, saco.ciclo, 'sobrevive a JSON');
});

/* ------------------------------------------------------------------ */
/* Determinismo e pureza                                                */
/* ------------------------------------------------------------------ */

test('sortearExpressao: puro e determinístico — mesma entrada, mesma saída; nada se muta', () => {
  const entrada = {
    estado: 42, sacos: {}, cenario: 'ferramenta', atual: 'tool', semente: 7,
    sal: 1700000000000, disponiveis: null, probabilidade: 1, grau: null, pessoa: null
  };
  const antes = structuredClone(entrada);
  const a = sortearExpressao(entrada);
  const b = sortearExpressao(entrada);
  assert.deepEqual(a, b, 'sem efeitos colaterais entre chamadas');
  assert.deepEqual(entrada, antes, 'a entrada nunca é mutada (sacos incluídos)');
  assert.notEqual(expressaoPasso(42), expressaoPasso(43), 'o passo do PRNG muda com o estado');
  assert.equal(expressaoHash('rui'), expressaoHash('rui'), 'hash estável');
  assert.notEqual(expressaoHash('rui'), expressaoHash('bia'), 'hash separa pessoas');
  const fator = expressaoFator(7);
  assert.ok(fator >= 0.85 && fator <= 1.15, 'fator de personalidade em [0.85, 1.15]');
});

test('determinismo: mesma semente + mesmo sal ⇒ mesmo resultado; sal diferente ⇒ sequências diferentes', () => {
  const correr = (semente, salBase) => {
    let estado = 11;
    let sacos = {};
    let atual = null;
    const saida = [];
    for (let i = 0; i < 12; i += 1) {
      const r = sortearExpressao({
        estado, sacos, cenario: 'erro', atual, semente, sal: salBase + i,
        disponiveis: null, probabilidade: 1
      });
      estado = r.estado;
      sacos = r.sacos;
      saida.push(r.preset);
      atual = r.preset;
    }
    return saida;
  };
  assert.deepEqual(correr(7, 1000), correr(7, 1000), 'execuções repetidas coincidem');
  assert.notDeepEqual(correr(7, 1000), correr(7, 5000), 'o `sal` do evento (ex.: `at`) muda a sequência');
  assert.notDeepEqual(correr(7, 1000), correr(99, 1000), 'pessoas diferentes, sequências diferentes');
});

test('sortearExpressao: o disparo é aleatório (probabilidade) — 0 nunca dispara, 1 dispara sempre', () => {
  const base = { estado: 1, sacos: {}, cenario: 'erro', atual: null, semente: 3, sal: 1 };
  assert.equal(sortearExpressao({ ...base, probabilidade: 0 }).preset, null);
  for (let i = 0; i < 20; i += 1) {
    assert.ok(sortearExpressao({ ...base, sal: i, probabilidade: 1 }).preset, 'com probabilidade 1 dispara sempre');
  }
});

/* ------------------------------------------------------------------ */
/* Dose-resposta (Q11): graus de intensidade                            */
/* ------------------------------------------------------------------ */

test('graus: ferramenta-erro é transitório de baixa intensidade (grau 1 → surprised)', () => {
  for (let i = 0; i < 10; i += 1) {
    const r = sortearExpressao({
      estado: 8 + i, sacos: {}, cenario: 'ferramenta-erro', atual: null, semente: 7,
      sal: i, probabilidade: 1, grau: 1
    });
    assert.equal(r.preset, 'surprised', 'grau 1 usa o escalão mais contido do pool');
  }
});

test('graus: erro-transitorio ESCALA por retentativa consecutiva (grau 1→2→3+, saturação)', () => {
  const graus = [1, 2, 3, 4].map((g) => sortearExpressao({
    estado: 99, sacos: {}, cenario: 'erro-transitorio', atual: null, semente: 7,
    sal: 5, probabilidade: 1, grau: g
  }).preset);
  assert.deepEqual(graus, ['surprised', 'thinking', 'disbelief', 'disbelief'], 'a expressão escala com o grau e satura no último');
  /* a contagem vem de pessoa.retries quando existe (sem grau explícito) */
  assert.equal(grauDeCenario('erro-transitorio', { retries: 2 }, null), 2);
  assert.equal(grauDeCenario('erro-transitorio', { retries: 9 }, null), 3, 'satura no último escalão');
  assert.equal(grauDeCenario('erro-transitorio', {}, null), null, 'sem contagem: pool inteiro');
  /* erro terminal mantém o pool todo por omissão (sem grau) */
  assert.equal(grauDeCenario('erro', { retries: 2 }, null), null, 'a escala automática é só do cenário de retry');
  const variados = new Set();
  for (let i = 0; i < 30; i += 1) {
    variados.add(sortearExpressao({
      estado: 3 + i, sacos: {}, cenario: 'erro', atual: null, semente: 7,
      sal: i, probabilidade: 1
    }).preset);
  }
  assert.deepEqual([...variados].sort(), ['disbelief', 'error', 'surprised'], 'erro terminal usa o pool todo');
});

/* ------------------------------------------------------------------ */
/* Fallback de identidades com 4 presets (r01..r12)                     */
/* ------------------------------------------------------------------ */

test('identidades reduzidas: o cenário cai no base e nunca sai do que a identidade tem', () => {
  assert.deepEqual(poolDeCenario('ferramenta', REDUZIDOS), ['working'], 'sem ferramenta: o base do cenário');
  assert.deepEqual(poolDeCenario('erro', REDUZIDOS), ['error']);
  assert.deepEqual(poolDeCenario('sucesso', REDUZIDOS), ['success']);
  assert.deepEqual(poolDeCenario('pergunta', REDUZIDOS), [], 'sem base disponível: nada a sortear');
  assert.deepEqual(poolDeCenario('ferramenta', null), EXPRESSOES_CENARIOS.ferramenta.pool, 'sem restrição: o pool inteiro');
  assert.equal(expressaoBase('ferramenta', REDUZIDOS), 'working');
  assert.equal(expressaoBase('pergunta', REDUZIDOS), null, 'sem waiting/thinking/surprised: sem fallback');
  assert.equal(expressaoBase('cancelado', REDUZIDOS), 'idle');
  assert.equal(expressaoBase('mensagem', null), 'working');
  for (let i = 0; i < 20; i += 1) {
    const r = sortearExpressao({
      estado: 6 + i, sacos: {}, cenario: 'ferramenta', atual: null, semente: 7,
      sal: i, disponiveis: REDUZIDOS, probabilidade: 1
    });
    assert.equal(r.preset, 'working', 'só o que a identidade tem (ou o base)');
    assert.equal(sortearExpressao({
      estado: 6 + i, sacos: {}, cenario: 'pergunta', atual: null, semente: 7,
      sal: i, disponiveis: REDUZIDOS, probabilidade: 1
    }).preset, null, 'sem preset disponível: o disparo não acontece');
  }
});

/* ------------------------------------------------------------------ */
/* Motor (superfícies de apresentação)                                  */
/* ------------------------------------------------------------------ */

test('criarMotorExpressoes: sorteia dentro do pool com anti-repetição e guarda o estado', () => {
  const motor = criarMotorExpressoes({ semente: 7, disponiveis: null, probabilidade: 1 });
  assert.ok(motor.fator >= 0.85 && motor.fator <= 1.15, 'fator exposto');
  let atual = null;
  const vistas = [];
  for (let i = 0; i < 16; i += 1) {
    const p = motor.aoEvento('sucesso', atual, 500 + i);
    assert.ok(p, 'com probabilidade 1 dispara sempre');
    assert.ok(EXPRESSOES_CENARIOS.sucesso.pool.includes(p), `dentro do pool (${p})`);
    if (atual) assert.notEqual(p, atual, 'nunca repete a cara atual');
    vistas.push(p);
    atual = p;
  }
  assert.deepEqual([...new Set(vistas)].sort(), [...EXPRESSOES_CENARIOS.sucesso.pool].sort(), 'todas as variantes num ciclo');
  assert.equal(typeof motor.estado(), 'number', 'o estado PRNG é exposto');
  assert.ok(motor.sacos.sucesso, 'os sacos são expostos (serializáveis)');

  /* determinismo: dois motores com a mesma semente e os mesmos sal → igual */
  const a = criarMotorExpressoes({ semente: 5, probabilidade: 1 });
  const b = criarMotorExpressoes({ semente: 5, probabilidade: 1 });
  const seq = (m) => Array.from({ length: 8 }, (_, i) => m.aoEvento('ferramenta', null, i * 100));
  assert.deepEqual(seq(a), seq(b), 'motores gêmeos coincidem');
  const parado = criarMotorExpressoes({ semente: 7, probabilidade: 0 });
  assert.equal(parado.aoEvento('erro', null, 1), null, 'probabilidade 0: nada dispara');
});

/* ------------------------------------------------------------------ */
/* Integração em state.js (contratos preservados)                       */
/* ------------------------------------------------------------------ */

function escritorio(id, eventos) {
  let estado = applyEvent(createOfficeState(), { type: 'session/added', sessionId: id, model: 'deepseek-chat' });
  for (const e of eventos) estado = applyEvent(estado, { ...e, sessionId: id });
  return estado;
}

test('state.js: a falha de ferramenta mantém a cara de erro do contrato e guarda a variante transitória', () => {
  const id = 's1';
  let estado = escritorio(id, [{ type: 'status', status: 'running' }]);
  estado = applyEvent(estado, { type: 'tool', sessionId: id, phase: 'call', name: 'bash', at: 5 });
  estado = applyEvent(estado, { type: 'tool', sessionId: id, phase: 'result', name: 'bash', ok: false, at: 6 });
  assert.equal(personView(estado, id).expression, 'error', 'cara persistente de erro (contrato); a de baixa intensidade é reação de superfície');
  const p = estado.people[id];
  assert.ok(p.varianteFerramentaErro === null || p.varianteFerramentaErro === 'surprised',
    `a variante de 'ferramenta-erro' fica no escalão 1 (${p.varianteFerramentaErro})`);
  assert.equal(p.retries, 0);
});

test('state.js: retry escala a expressão por retentativa consecutiva e zera no fim do turno', () => {
  const id = 's1';
  let estado = escritorio(id, [{ type: 'status', status: 'running' }]);
  const vistas = [];
  for (let i = 1; i <= 3; i += 1) {
    estado = applyEvent(estado, { type: 'retry', sessionId: id, at: 1000 * i });
    vistas.push(personView(estado, id).expression);
    assert.equal(estado.people[id].retries, i, 'a contagem de retentativas sobe');
  }
  assert.deepEqual(vistas, ['surprised', 'thinking', 'disbelief'], 'a cara escala com as retentativas (Q11)');
  estado = applyEvent(estado, { type: 'turn/end', sessionId: id, kind: 'completed', at: 4000 });
  assert.equal(estado.people[id].retries, 0, 'o fim do turno zera a escala');
});

test('state.js: a pressão de contexto dispara contexto/sobrecarga com histerese', () => {
  const id = 's1';
  let estado = escritorio(id, [{ type: 'status', status: 'running' }]);
  estado = applyEvent(estado, { type: 'ctx', sessionId: id, used: 72000, window: 100000, at: 10 });
  assert.equal(estado.people[id].ctxNivel, 'contexto');
  assert.ok(EXPRESSOES_CENARIOS.contexto.pool.includes(personView(estado, id).expression),
    `pressão de aviso → pool de 'contexto' (${personView(estado, id).expression})`);
  estado = applyEvent(estado, { type: 'ctx', sessionId: id, used: 90000, window: 100000, at: 2000 });
  assert.equal(estado.people[id].ctxNivel, 'sobrecarga');
  assert.ok(EXPRESSOES_CENARIOS.sobrecarga.pool.includes(personView(estado, id).expression),
    `sobrecarga → pool de 'sobrecarga' (${personView(estado, id).expression})`);
  /* histerese: 0.78 não desativa 'sobrecarga' para baixo de um salto… */
  estado = applyEvent(estado, { type: 'ctx', sessionId: id, used: 78000, window: 100000, at: 4000 });
  assert.equal(estado.people[id].ctxNivel, 'contexto');
  /* …e 0.60 desativa por completo */
  estado = applyEvent(estado, { type: 'ctx', sessionId: id, used: 60000, window: 100000, at: 6000 });
  assert.equal(estado.people[id].ctxNivel, 'nenhum');
  assert.deepEqual(estado.people[id].ctx, { used: 60000, window: 100000, ratio: 0.6 }, 'o ctx mantém a forma do contrato');
});

test('state.js: a espera (pergunta/aprovação) vence as variantes e o repouso persistente é idle', () => {
  const id = 's1';
  let estado = escritorio(id, [{ type: 'status', status: 'running' }]);
  estado = applyEvent(estado, { type: 'question', sessionId: id, id: 'q1', text: 'Posso?', at: 100 });
  estado = applyEvent(estado, { type: 'message', sessionId: id, side: 'assistant', at: 2000 });
  assert.equal(personView(estado, id).expression, 'waiting', 'quem pergunta espera — vence as variantes');
  estado = applyEvent(estado, { type: 'question/answered', sessionId: id, id: 'q1', at: 3000 });
  estado = applyEvent(estado, { type: 'approval', sessionId: id, id: 'a1', toolName: 'bash', at: 4000 });
  assert.equal(personView(estado, id).expression, 'waiting', 'aprovação pendente também espera');
  estado = applyEvent(estado, { type: 'approval/decided', sessionId: id, id: 'a1', at: 5000 });
  estado = applyEvent(estado, { type: 'status', sessionId: id, status: 'idle', at: 6000 });
  assert.equal(personView(estado, id).expression, 'idle', 'o repouso persistente é idle (a wink de ocioso é one-shot)');
});
