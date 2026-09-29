/*
 * tests/plugin/paragem.test.mjs — paragem em cascata: "Parar" uma pessoa e TODA
 * a sua subárvore de subagentes.
 *
 * Contexto verificado no checkout do DSH (tool-subagent-control e
 * session-controller): o DSH NÃO tem esta feature — `session.cancel()` e o
 * `interrupt_agent` param APENAS o alvo ("descendants keep running") e o
 * contrato de `cancel()` diz que "pending queued work remains and resumes in
 * FIFO order after the Host reaches cancellation quiescence" (sem largar a fila,
 * a tarefa adicional que se mandou por mensagem retoma sozinha).
 *
 * Cobre: o plano (alvo + subárvore, pai-primeiro, ciclos), a paridade do plano
 * embutido no bundle com o state.js, a execução host (cancel + fila largada por
 * sessão, release uma vez, falhas isoladas) e o modelo da barra lateral (quando
 * o botão aparece e qual é o alcance).
 *
 * Executar a partir da raiz do projeto:
 *   node --test tests/plugin/
 *
 * Zero dependências: apenas node:test + node:assert/strict.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planoDeParagem } from '../../dsh-plugin/src/state.js';

/* Bundle embutido (client.js) — mesmo harness do render.test.mjs. */
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

/** Entrada de catálogo no formato `SessionSummary` do DSH. */
const sessao = (sessionId, parentSessionId) => (parentSessionId ? { sessionId, parentSessionId } : { sessionId });

/* ------------------------------------------------------------------ */
/* planoDeParagem — a subárvore, pai-primeiro                          */
/* ------------------------------------------------------------------ */

test('planoDeParagem: sem alvo não há plano', () => {
  assert.deepEqual(planoDeParagem([sessao('s1')], null), []);
  assert.deepEqual(planoDeParagem([sessao('s1')], undefined), []);
});

test('planoDeParagem: alvo sem filhos é o plano inteiro', () => {
  assert.deepEqual(planoDeParagem([sessao('s1'), sessao('c1', 'outro')], 's1'), [{ id: 's1', nivel: 0 }]);
});

test('planoDeParagem: o alvo e toda a subárvore, pai-primeiro e por nível', () => {
  const catalogo = [
    sessao('s1'), sessao('raiz2'),
    sessao('c1', 's1'), sessao('c2', 's1'), sessao('fora', 'raiz2'),
    sessao('g1', 'c1'), sessao('g2', 'c2'), sessao('n1', 'g1'),
  ];
  assert.deepEqual(planoDeParagem(catalogo, 's1'), [
    { id: 's1', nivel: 0 },
    { id: 'c1', nivel: 1 },
    { id: 'c2', nivel: 1 },
    { id: 'g1', nivel: 2 },
    { id: 'g2', nivel: 2 },
    { id: 'n1', nivel: 3 },
  ]);
});

test('planoDeParagem: ciclos e links repetidos entram uma única vez', () => {
  const catalogo = [
    sessao('a', 'b'), sessao('b', 'a'), /* ciclo */
    sessao('b', 'a'),                   /* repetido */
    sessao('c', 'a'), sessao('c', 'b'), /* dois pais: uma entrada por pai */
  ];
  const ids = planoDeParagem(catalogo, 'a').map((e) => e.id);
  assert.deepEqual(ids, ['a', 'b', 'c']);
  assert.equal(new Set(ids).size, ids.length, 'nenhum id repetido');
});

test('planoDeParagem: catálogo inválido não rebenta — fica o alvo', () => {
  assert.deepEqual(planoDeParagem(null, 's1'), [{ id: 's1', nivel: 0 }]);
  assert.deepEqual(planoDeParagem([null, {}, { sessionId: 'x' }, { parentSessionId: 's1' }], 's1'), [{ id: 's1', nivel: 0 }]);
});

test('paridade: o plano embutido no bundle é o mesmo do state.js', () => {
  assert.ok(typeof B.__planoDeParagem === 'function', 'o bundle expõe o plano para testes');
  const cenarios = [
    [[sessao('s1')], null],
    [[sessao('s1'), sessao('c1', 's1'), sessao('g1', 'c1')], 's1'],
    [[sessao('a', 'b'), sessao('b', 'a'), sessao('c', 'a')], 'a'],
    [null, 's1'],
  ];
  for (const [catalogo, alvo] of cenarios) {
    assert.deepEqual(B.__planoDeParagem(catalogo, alvo), planoDeParagem(catalogo, alvo), `paridade em ${JSON.stringify(cenarios)}`);
  }
});

/* ------------------------------------------------------------------ */
/* pararComSubagentes — cancel + largar a fila, sessão a sessão        */
/* ------------------------------------------------------------------ */

/** Fake do DSH: `ctx.sessions` na forma real (ObservableSnapshot + retain). */
function fakeDsh({ catalogo = [], filhosPorPai = {}, filas = {}, reterFalha = [], cancelRecusa = [], listaSimples = false }) {
  const registo = { ordem: [], cancel: [], fila: [], releases: [], moradas: [] };
  // Forma real do catálogo: byId (com parentId) + subagentsByParent (os filhos
  // que só aparecem no catálogo de filhos do pai).
  const ids = catalogo.map((e) => e.sessionId);
  const byId = {};
  for (const e of catalogo) byId[e.sessionId] = { id: e.sessionId, parentId: e.parentSessionId ?? null, origin: e.origin };
  const subagentsByParent = {};
  for (const [pai, filhos] of Object.entries(filhosPorPai)) {
    subagentsByParent[pai] = { entries: filhos.map((id) => ({ id })) };
  }
  const lista = listaSimples
    ? [...catalogo.map((e) => ({ sessionId: e.sessionId, parentSessionId: e.parentSessionId ?? null })),
      ...Object.entries(filhosPorPai).flatMap(([pai, filhos]) => filhos.map((id) => ({ sessionId: id, parentSessionId: pai })))]
    : { getSnapshot: () => ({ ids, byId, subagentsByParent }) };
  const sessoes = {
    list: lista,
    retain: (alvo) => {
      // O retain recebe o id OU a morada explícita do subagente
      // ({parentSessionId, childSessionId, mode}) — sem morada o cancel()
      // do filho cai na rota errada e o host recusa.
      const id = typeof alvo === 'string' ? alvo : alvo?.childSessionId;
      const morada = typeof alvo === 'string' ? null : alvo;
      if (morada) registo.moradas.push(morada);
      if (reterFalha.includes(id)) throw new Error(`sessão desconhecida: ${id}`);
      registo.ordem.push(id);
      return {
        binding: {
          session: {
            cancel: async () => {
              registo.cancel.push(id);
              return cancelRecusa.includes(id) ? { ok: false, error: 'ocupado' } : { ok: true };
            },
            projections: {
              faceOf: () => ({
                getSnapshot: () => ({
                  'next-turn': filas[id] ?? [],
                  'next-step': [],
                }),
              }),
            },
            updateQueue: async (itemId, acao) => {
              registo.fila.push({ id, itemId, acao });
              return { ok: true };
            },
          },
        },
        release: () => registo.releases.push(id),
      };
    },
  };
  return { ctx: { sessions: sessoes }, registo };
}

const msgFila = (id) => ({ id, source: { kind: 'user' }, content: [{ type: 'text', text: 'tarefa adicional' }] });

test('pararComSubagentes: para o alvo e TODA a subárvore, pai-primeiro', async () => {
  const { ctx, registo } = fakeDsh({
    catalogo: [sessao('s1'), sessao('c1', 's1'), sessao('c2', 's1'), sessao('fora', 'raiz2')],
    // O neto só existe no catálogo de filhos do pai (subagentsByParent) — a
    // mesma fusão da ponte tem de o encontrar.
    filhosPorPai: { c1: ['g1'] },
  });
  const r = await B.__pararComSubagentes(ctx, 's1');
  assert.deepEqual(r.plano, ['s1', 'c1', 'c2', 'g1'], 'o plano cobre a subárvore toda, sem a sessão alheia');
  assert.deepEqual(r.parados, r.plano, 'todos as sessões do plano são tratadas');
  assert.deepEqual(registo.cancel, ['s1', 'c1', 'c2', 'g1'], 'cancel() por cada uma, pai primeiro');
  assert.equal(r.turnosCancelados, 4);
  assert.deepEqual(registo.releases, ['s1', 'c1', 'c2', 'g1'], 'uma referência retida e libertada por sessão');
  // Filhos retidos com a MORADA explícita (roteio correto do cancel): o neto
  // veio do catálogo de filhos; os filhos do byId sem origin ficam como
  // sessões normais (retain por id).
  assert.deepEqual(registo.moradas.map((m) => m.childSessionId), ['g1']);
  for (const m of registo.moradas) assert.equal(typeof m.parentSessionId, 'string');
  assert.deepEqual(r.detalhes.map((d) => d.morada), ['sessão normal', 'sessão normal', 'sessão normal', 'continuable']);
});

test('pararComSubagentes: aceita também um catálogo simples (array)', async () => {
  const { ctx, registo } = fakeDsh({
    catalogo: [sessao('s1'), sessao('c1', 's1')],
    filhosPorPai: { c1: ['g1'] },
    listaSimples: true,
  });
  const r = await B.__pararComSubagentes(ctx, 's1');
  assert.deepEqual(r.plano, ['s1', 'c1', 'g1']);
  assert.deepEqual(registo.cancel, ['s1', 'c1', 'g1']);
});

test('pararComSubagentes: filho só no catálogo raiz (origin subagent) ganha morada derivada do pai', async () => {
  const { ctx, registo } = fakeDsh({
    catalogo: [sessao('s1'), { sessionId: 'c1', parentSessionId: 's1', origin: 'subagent' }, { sessionId: 'fork', parentSessionId: 's1' }],
  });
  const r = await B.__pararComSubagentes(ctx, 's1');
  assert.deepEqual(r.plano, ['s1', 'c1', 'fork']);
  // c1 é subagente → morada derivada; o fork é conversa normal → retain por id.
  assert.deepEqual(registo.moradas.map((m) => [m.childSessionId, m.parentSessionId]), [['c1', 's1']]);
  assert.deepEqual(r.detalhes.map((d) => d.morada), ['sessão normal', 'continuable', 'sessão normal']);
});

test('pararComSubagentes: larga TODA a fila pendente (sem isto ela retoma sozinha)', async () => {
  const { ctx, registo } = fakeDsh({
    catalogo: [sessao('s1'), sessao('c1', 's1')],
    filas: {
      s1: [msgFila('q1'), msgFila('q2')],
      c1: [msgFila('q3')],
    },
  });
  const r = await B.__pararComSubagentes(ctx, 's1');
  assert.equal(r.filaLimpada, 3, 'as tarefas adicionais do líder e dos subagentes ficam largadas');
  assert.deepEqual(registo.fila.map((f) => f.itemId), ['q1', 'q2', 'q3']);
  for (const f of registo.fila) assert.deepEqual(f.acao, { kind: 'remove' }, 'remoção pela ação oficial do DSH');
});

test('pararComSubagentes: entradas da fila que não são do utilizador ficam de fora', async () => {
  const { ctx, registo } = fakeDsh({
    catalogo: [sessao('s1')],
    filas: { s1: [msgFila('q1'), { id: 'eco', source: { kind: 'outro' }, content: [] }] },
  });
  const r = await B.__pararComSubagentes(ctx, 's1');
  assert.equal(r.filaLimpada, 1);
  assert.deepEqual(registo.fila.map((f) => f.itemId), ['q1']);
});

test('pararComSubagentes: uma falha no meio não aborta o resto do plano', async () => {
  const { ctx, registo } = fakeDsh({
    catalogo: [sessao('s1'), sessao('c1', 's1'), sessao('c2', 's1')],
    filas: { s1: [msgFila('q1')] },
    reterFalha: ['c1'],
  });
  const r = await B.__pararComSubagentes(ctx, 's1');
  assert.deepEqual(r.parados, ['s1', 'c2'], 'o filho que falhou não impede os restantes');
  assert.equal(r.falhas.length, 1);
  assert.equal(r.falhas[0].id, 'c1');
  assert.deepEqual(registo.cancel, ['s1', 'c2']);
  assert.deepEqual(registo.releases, ['s1', 'c2'], 'quem falhou ao reter não tem release');
});

test('pararComSubagentes: cancel() recusado é registado como falha daquela sessão', async () => {
  const { ctx } = fakeDsh({
    catalogo: [sessao('s1'), sessao('c1', 's1')],
    cancelRecusa: ['s1'],
  });
  const r = await B.__pararComSubagentes(ctx, 's1');
  assert.deepEqual(r.parados, ['s1', 'c1'], 'a recusa do pai não impede parar o filho');
  assert.equal(r.turnosCancelados, 1);
  assert.equal(r.falhas.length, 1);
  assert.equal(r.falhas[0].id, 's1');
});

test('pararComSubagentes: sem canal de sessões devolve falha explicada', async () => {
  const r = await B.__pararComSubagentes({}, 's1');
  assert.deepEqual(r.plano, []);
  assert.equal(r.falhas.length, 1);
  assert.match(r.falhas[0].erro, /ctx\.sessions/);
});

/* ------------------------------------------------------------------ */
/* modeloSidebar — quando o botão aparece e qual é o alcance           */
/* ------------------------------------------------------------------ */

function pessoaDoBundle(eventos, id) {
  let e = B.__createOfficeState({});
  for (const ev of eventos) e = B.__applyEvent(e, ev);
  return B.__officeView(e).people[id];
}

test('barra lateral: a trabalhar com subagentes → "Parar pessoa e equipa"', () => {
  const p = pessoaDoBundle([
    { type: 'session/added', sessionId: 's1' },
    { type: 'status', sessionId: 's1', status: 'running' },
    { type: 'subagent/start', sessionId: 's1', childId: 'c1', runId: 'r1' },
    { type: 'subagent/start', sessionId: 's1', childId: 'c2', runId: 'r2' },
  ], 's1');
  const m = B.__modeloSidebar(p, {});
  assert.equal(m.paragem.disponivel, true);
  assert.equal(m.paragem.aCorrer, true);
  assert.equal(m.paragem.subagentes, 2);
  assert.equal(m.paragem.rotulo, 'Parar pessoa e equipa');
  assert.match(m.paragem.titulo, /TODOS os 2 subagente/);
});

test('barra lateral: parado mas com equipa em curso → paragem disponível com alcance equipa', () => {
  const p = pessoaDoBundle([
    { type: 'session/added', sessionId: 's1' },
    { type: 'subagent/start', sessionId: 's1', childId: 'c1', runId: 'r1' },
  ], 's1');
  const m = B.__modeloSidebar(p, {});
  assert.equal(m.paragem.disponivel, true, 'a equipa continua a correr mesmo com o líder parado');
  assert.equal(m.paragem.rotulo, 'Parar pessoa e equipa');
});

test('barra lateral: parado e sem equipa → sem botão de parar', () => {
  const p = pessoaDoBundle([{ type: 'session/added', sessionId: 's1' }], 's1');
  const m = B.__modeloSidebar(p, {});
  assert.equal(m.paragem.disponivel, false);
  assert.equal(m.paragem.rotulo, 'Parar pessoa');
});
