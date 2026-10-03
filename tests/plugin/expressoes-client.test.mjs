/*
 * tests/plugin/expressoes-client.test.mjs — o MOTOR DE EXPRESSÕES no Modo jogo
 * (dsh-plugin/src/client.js): o WIRING eventos → cenários → campos.
 *
 * O algoritmo puro (taxonomia, shuffle bag, dose-resposta, arbitragem) é
 * testado em tests/plugin/expressoes.test.mjs — que também impõe a paridade da
 * cópia embutida de client.js (reutiliza-se daí; aqui não se duplica). O que se
 * testa aqui é a LIGAÇÃO no bundle:
 *   - `retry` desenha 'erro-transitorio' e ESCALA com pessoa.retries (Q11);
 *   - `ctx` com used ≥ 200k dispara 'contexto' e a razão ≥ 0.85 'sobrecarga'
 *     (Q12, gatilho absoluto incluído) no Modo jogo;
 *   - `turn/end` aborted|interrupted desenha 'cancelado' (antes só completed e
 *     error desenhavam);
 *   - `question`/`approval` desenham 'pergunta'/'aprovacao' mas a cara visível
 *     é 'waiting' (vence as variantes — que ficam para as reações one-shot);
 *   - `tool` result ok:false guarda 'ferramenta-erro' (grau 1) mas mantém a
 *     cara persistente 'error' (pin de tests/plugin/state.test.mjs:362);
 *   - identidades com 4 presets (r01..r12) caem na BASE do cenário;
 *   - stickiness terminal: só message do utilizador (ou prioridade ≥) desgruda;
 *   - a arbitragem usa os carimbos `at` (min-dwell 1200ms para prioridade
 *     inferior) e o desenho ANTECEDE a mudança de estado;
 *   - quem está Disponível dorme ('sleeping', Modo jogo).
 *
 * Executar: node --test tests/plugin/expressoes-client.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPRESSOES_CENARIOS } from '../../dsh-plugin/src/expressoes.js';

let moduloBundle = null;
globalThis.window = {
  __ModuleLoader__: {
    load({ factory }) {
      moduloBundle = factory((nome) => {
        if (nome === 'react') return { createElement: () => null };
        throw new Error(`módulo inesperado: ${nome}`);
      });
    },
  },
};
await import('../../dsh-plugin/src/client.js');
const B = moduloBundle;

/* Estado com uma pessoa 'a' já a correr (sem desenhos ainda: status running
 * não dispara cara nova). Os eventos levam `at` explícito — a arbitragem e o
 * sorteio andam por carimbos, nunca por relógio. */
function aCorrer(extra = []) {
  let e = B.__createOfficeState({});
  e = B.__applyEvent(e, { type: 'session/added', sessionId: 'a' });
  e = B.__applyEvent(e, { type: 'status', sessionId: 'a', status: 'running', at: 1000 });
  for (const ev of extra) e = B.__applyEvent(e, ev);
  return e;
}
const pDe = (e, id = 'a') => e.people.get(id);
const caraDe = (e, id = 'a') => B.__presetDe(e.people.get(id));
/* Motor de teste: disparo GARANTIDO (probabilidade 1) — o sorteio real tem a
 * probabilidade do cenário × fator da pessoa. */
const comDisparo = (e, id = 'a') => {
  pDe(e, id).motor = B.__motorExpressoes({ semente: 7, probabilidade: 1 });
  return e;
};
const dentro = (valor, pool, contexto) =>
  assert.ok(pool.includes(valor), `${contexto}: '${valor}' ∈ pool (${pool.join('·')})`);

/* ------------------------------------------------------------------ */
/* Dose-resposta Q11: retry escala 'erro-transitorio'                   */
/* ------------------------------------------------------------------ */

test('wiring: retry desenha erro-transitorio e ESCALA com as retentativas consecutivas (Q11)', () => {
  let e = comDisparo(aCorrer());
  // Os graus de 'erro-transitorio' são escalões de UM preset cada:
  // 1 → surprised, 2 → thinking, 3+ → disbelief (saturação).
  const escala = ['surprised', 'thinking', 'disbelief'];
  for (let i = 0; i < escala.length; i += 1) {
    e = B.__applyEvent(e, { type: 'retry', sessionId: 'a', at: 2000 + i * 1500 });
    const p = pDe(e);
    assert.equal(p.retries, i + 1, `retentativa #${i + 1}: conta consecutiva`);
    assert.equal(p.varianteTrabalho, escala[i], `retentativa #${i + 1}: grau ${i + 1} → ${escala[i]}`);
    assert.equal(p.expressaoCenario, 'erro-transitorio', 'o cenário é o da taxonomia');
  }
  // Saturação: a 5.ª seguida continua no último escalão…
  e = B.__applyEvent(e, { type: 'retry', sessionId: 'a', at: 7000 });
  e = B.__applyEvent(e, { type: 'retry', sessionId: 'a', at: 8500 });
  assert.equal(pDe(e).retries, 5);
  assert.equal(pDe(e).varianteTrabalho, 'disbelief', 'saturação no último escalão');
  // …e o fim do turno zera a conta (como em state.js).
  e = B.__applyEvent(e, { type: 'turn/end', sessionId: 'a', kind: 'completed', at: 10000 });
  assert.equal(pDe(e).retries, 0, 'turno acabou: retentativas zeram');
});

/* ------------------------------------------------------------------ */
/* Pressão de contexto Q12: 200k absoluto e sobrecarga                 */
/* ------------------------------------------------------------------ */

test('wiring: ctx com ≥200k dispara contexto e a razão ≥0.85 dispara sobrecarga (Q12)', () => {
  let e = comDisparo(aCorrer());
  // GATILHO ABSOLUTO: 205k numa janela enorme (razão 0.205) → 'contexto'.
  e = B.__applyEvent(e, { type: 'ctx', sessionId: 'a', used: 205000, window: 1000000, at: 2000 });
  let p = pDe(e);
  assert.equal(p.ctxNivel, 'contexto', 'o nível sobe pelo gatilho absoluto de 200k');
  assert.equal(p.expressaoCenario, 'contexto');
  dentro(p.varianteTrabalho, EXPRESSOES_CENARIOS.contexto.pool, 'variante de contexto');
  // Razão ≥ 0.85 → 'sobrecarga' (raro e curto — prioridade acima de contexto).
  e = B.__applyEvent(e, { type: 'ctx', sessionId: 'a', used: 190000, window: 200000, at: 3500 });
  p = pDe(e);
  assert.equal(p.ctxNivel, 'sobrecarga');
  assert.equal(p.expressaoCenario, 'sobrecarga');
  dentro(p.varianteTrabalho, EXPRESSOES_CENARIOS.sobrecarga.pool, 'variante de sobrecarga');
});

/* ------------------------------------------------------------------ */
/* turn/end: aborted|interrupted → 'cancelado'                          */
/* ------------------------------------------------------------------ */

test('wiring: turn/end aborted|interrupted desenha cancelado; Disponível dorme', () => {
  for (const kind of ['aborted', 'interrupted']) {
    let e = comDisparo(aCorrer());
    e = B.__applyEvent(e, { type: 'turn/end', sessionId: 'a', kind, at: 2000 });
    const p = pDe(e);
    dentro(p.varianteCancelado, EXPRESSOES_CENARIOS.cancelado.pool, `${kind} → pool de cancelado`);
    assert.equal(p.expressaoCenario, 'cancelado');
    assert.equal(p.expressaoTerminal, 'cancelado', 'cara terminal marcada (stickiness)');
    assert.equal(caraDe(e), 'sleeping', '…e quem fica Disponível dorme (Modo jogo)');
  }
});

/* ------------------------------------------------------------------ */
/* Pergunta/aprovação: 'waiting' vence as variantes                     */
/* ------------------------------------------------------------------ */

test('wiring: question/approval desenham pergunta/aprovacao mas a cara visível é waiting', () => {
  let e = comDisparo(aCorrer());
  e = B.__applyEvent(e, { type: 'question', sessionId: 'a', id: 'q1', text: 'Posso?', at: 2000 });
  let p = pDe(e);
  dentro(p.varianteEspera, EXPRESSOES_CENARIOS.pergunta.pool, 'variante de pergunta guardada (one-shot)');
  assert.equal(p.expressaoCenario, 'pergunta');
  assert.equal(caraDe(e), 'waiting', "'waiting' vence as variantes");
  e = B.__applyEvent(e, { type: 'question/answered', sessionId: 'a', id: 'q1', at: 2500 });
  e = B.__applyEvent(e, { type: 'approval', sessionId: 'a', id: 'ap1', toolName: 'bash', at: 3000 });
  p = pDe(e);
  dentro(p.varianteEspera, EXPRESSOES_CENARIOS.aprovacao.pool, 'variante de aprovação guardada (one-shot)');
  assert.equal(caraDe(e), 'waiting', 'quem espera aprovação também');
});

/* ------------------------------------------------------------------ */
/* tool ok:false: 'ferramenta-erro' transitório, cara 'error' fixa     */
/* ------------------------------------------------------------------ */

test('wiring: tool ok:false guarda ferramenta-erro (grau 1) mas a cara persistente é error', () => {
  let e = comDisparo(aCorrer());
  e = B.__applyEvent(e, { type: 'tool', sessionId: 'a', phase: 'call', name: 'deploy', at: 2000 });
  dentro(pDe(e).varianteFerramenta, EXPRESSOES_CENARIOS.ferramenta.pool, 'variante de ferramenta');
  e = B.__applyEvent(e, { type: 'tool', sessionId: 'a', phase: 'result', name: 'deploy', ok: false, at: 3500 });
  const p = pDe(e);
  assert.equal(p.varianteFerramentaErro, 'surprised', 'ferramenta-erro fixa grau 1 (transitório de baixa intensidade)');
  assert.equal(caraDe(e), 'error', "cara PERSISTENTE da falha é 'error' (pin de state.test.mjs:362)");
});

/* ------------------------------------------------------------------ */
/* Identidades reduzidas (r01..r12): fallback para a BASE do cenário   */
/* ------------------------------------------------------------------ */

test('wiring: identidades com 4 presets caem na base do cenário', () => {
  let e = comDisparo(aCorrer());
  pDe(e).expressaoDisponiveis = ['idle', 'working', 'success', 'error']; // r01..r12
  // 'ferramenta' (pool tool·searching·focused·thinking) não tem preset da
  // identidade → cai na BASE 'working'.
  e = B.__applyEvent(e, { type: 'tool', sessionId: 'a', phase: 'call', name: 'bash', at: 2000 });
  assert.equal(pDe(e).varianteFerramenta, 'working', 'base do cenário ferramenta');
  // 'sucesso' tem 'success' no pool efetivo → sorteia-o (nunca sai do que a
  // identidade tem).
  e = B.__applyEvent(e, { type: 'turn/end', sessionId: 'a', kind: 'completed', at: 4000 });
  assert.equal(pDe(e).varianteSucesso, 'success', 'pool efetivo reduzido a success');
});

/* ------------------------------------------------------------------ */
/* Stickiness terminal + arbitragem por carimbos `at`                  */
/* ------------------------------------------------------------------ */

test('wiring: cara terminal só desgruda com mensagem do utilizador (novo turno)', () => {
  let e = comDisparo(aCorrer());
  e = B.__applyEvent(e, { type: 'turn/end', sessionId: 'a', kind: 'completed', at: 2000 });
  assert.equal(pDe(e).expressaoTerminal, 'sucesso');
  // Mensagem do assistente NÃO é novo turno: o desenho é suprimido.
  e = B.__applyEvent(e, { type: 'message', sessionId: 'a', side: 'assistant', at: 3000 });
  assert.equal(pDe(e).expressaoCenario, 'sucesso', 'a cara terminal fica');
  // Mensagem do utilizador = novo turno: desgruda e desenha 'mensagem'.
  e = B.__applyEvent(e, { type: 'message', sessionId: 'a', side: 'user', at: 5000 });
  assert.equal(pDe(e).expressaoCenario, 'mensagem', 'novo turno do utilizador desenha');
  assert.equal(pDe(e).expressaoTerminal, null, 'stickiness libertado');
});

test('wiring: min-dwell 1200ms para prioridade inferior — a arbitragem usa os carimbos at', () => {
  let e = comDisparo(aCorrer());
  e = B.__applyEvent(e, { type: 'tool', sessionId: 'a', phase: 'call', name: 'bash', at: 2000 });
  assert.equal(pDe(e).expressaoCenario, 'ferramenta');
  // 'mensagem' (40) < 'ferramenta' (50): 500ms depois ainda não desenha…
  e = B.__applyEvent(e, { type: 'message', sessionId: 'a', side: 'user', at: 2500 });
  assert.equal(pDe(e).expressaoCenario, 'ferramenta', 'min-dwell respeitado');
  // …1300ms depois da última mudança já desenha.
  e = B.__applyEvent(e, { type: 'message', sessionId: 'a', side: 'user', at: 3300 });
  assert.equal(pDe(e).expressaoCenario, 'mensagem');
});

/* ------------------------------------------------------------------ */
/* compactacao / subagente: os restantes cenários do wiring             */
/* ------------------------------------------------------------------ */

test('wiring: compaction start desenha compactacao e subagent/start desenha subagente', () => {
  let e = comDisparo(aCorrer());
  e = B.__applyEvent(e, { type: 'compaction', sessionId: 'a', phase: 'start', at: 2000 });
  dentro(pDe(e).varianteTrabalho, EXPRESSOES_CENARIOS.compactacao.pool, 'variante de compactacao');
  assert.equal(pDe(e).expressaoCenario, 'compactacao');
  // O end não dispara cara nova (a taxonomia ignora-o).
  const antes = pDe(e).varianteTrabalho;
  e = B.__applyEvent(e, { type: 'compaction', sessionId: 'a', phase: 'end', at: 2500 });
  assert.equal(pDe(e).varianteTrabalho, antes, 'compaction end não mexe na cara');
  // Delegação que avança desenha 'subagente'…
  e = B.__applyEvent(e, { type: 'subagent/start', sessionId: 'a', childId: 'c1', runId: 'c1', at: 4000 });
  dentro(pDe(e).varianteTrabalho, EXPRESSOES_CENARIOS.subagente.pool, 'variante de subagente');
  assert.equal(pDe(e).expressaoCenario, 'subagente');
  // …o start REPETIDO do mesmo filho (ponte + adaptador) não é evento novo.
  const repetida = pDe(e).varianteTrabalho;
  e = B.__applyEvent(e, { type: 'subagent/start', sessionId: 'a', childId: 'c1', runId: 'c1', at: 5000 });
  assert.equal(pDe(e).varianteTrabalho, repetida, 'filho já ativo não redesenha');
});
