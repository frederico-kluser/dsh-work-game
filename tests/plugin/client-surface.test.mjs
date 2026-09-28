/*
 * tests/plugin/client-surface.test.mjs — a ponte REAL do runtime do browser
 * (cópia embutida em dsh-plugin/src/client.js e fonte em dsh-plugin/src/surface.js).
 *
 * A superfície consumida é a verificada no checkout deepseek-harness 0.1.6:
 *   ctx.sessions.list : ObservableSnapshot<SessionListState> (getSnapshot/subscribe)
 *     SessionListState { ids, byId: Record<id, SessionSummary>, subagentsByParent }
 *     SessionSummary { id, displayTitle, cwd, parentId, running, projectionValues }
 *     projectionValues { tokenUsage, contextPressure, modelSelection }
 *     subagentsByParent[parent].entries : SubagentListEntry[]
 *
 * Cobre: sem canal -> null; catálogo; diff de snapshots (altas/baixas, status,
 * subagentes por parentId); usage em DELTAS com 1.º vislumbre acumulado; modelo
 * e CTX (projected ?? pressure); velocidade de tokens com relógio injetado;
 * resolução de preços exata e por inclusão; e PARIDADE bundle ↔ surface.js.
 *
 * Executar: node --test tests/plugin/client-surface.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as surface from '../../dsh-plugin/src/surface.js';

/* ---------- carregar o bundle do browser em Node (loader falso) ---------- */
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

/* ---------- ISessions falso (forma real do contrato) ---------- */
function criarSessions(snapInicial) {
  let snap = snapInicial;
  const ouvintes = new Set();
  return {
    list: {
      getSnapshot: () => snap,
      subscribe(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    },
    atualizar(novo) { snap = novo; for (const fn of [...ouvintes]) fn(); },
  };
}

function resumo(id, extra = {}) {
  return {
    id,
    displayTitle: extra.displayTitle ?? `Conversa ${id}`,
    cwd: extra.cwd ?? '/Users/u/projetos/demo',
    running: extra.running ?? false,
    updatedAt: extra.updatedAt ?? 1,
    ...(extra.parentId ? { parentId: extra.parentId, origin: 'subagent' } : {}),
    projectionValues: extra.projectionValues,
  };
}

function snapshot(byId, subagentsByParent = {}) {
  return { ids: Object.keys(byId), byId, phase: 'ready', subagentsByParent, jobsBySession: {} };
}

const USAGE_A = {
  tokenUsage: { uncachedInputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 100 },
  contextPressure: { projectedTokens: 42000, contextWindow: 200000 },
  modelSelection: { lastUsed: { provider: 'deepseek', model: 'deepseek-chat' }, next: null },
};

const eventosDe = (superficie) => {
  const eventos = [];
  const libertar = superficie.assinar((ev) => eventos.push(ev));
  return { eventos, libertar };
};

/* ---------- testes à fonte (surface.js) ---------- */

test('surface: sem ctx.sessions devolve null (nada é inventado)', () => {
  assert.equal(surface.extrairSuperficie({}), null);
  assert.equal(surface.extrairSuperficie(null), null);
  assert.equal(surface.extrairSuperficie({ sessions: {} }), null);
});

test('surface: catalogo devolve id, modelo, nome e equipa (cwd)', () => {
  const sessions = criarSessions(snapshot({
    s1: resumo('s1', { displayTitle: 'Corrigir testes', cwd: '/Users/u/projetos/site', projectionValues: USAGE_A }),
    s2: resumo('s2', { cwd: '/Users/u/projetos/api' }),
  }));
  const s = surface.extrairSuperficie({ sessions });
  assert.deepEqual(s.catalogo(), [
    { id: 's1', model: 'deepseek-chat', name: 'Corrigir testes', teamId: 'site' },
    { id: 's2', model: null, name: 'Conversa s2', teamId: 'api' },
  ]);
});

test('surface: alta emite session/added + status; baixa emite session/removed', () => {
  const sessions = criarSessions(snapshot({ s1: resumo('s1', { projectionValues: USAGE_A }) }));
  const s = surface.extrairSuperficie({ sessions });
  const { eventos, libertar } = eventosDe(s);
  assert.ok(eventos.some((e) => e.type === 'session/added' && e.sessionId === 's1' && e.model === 'deepseek-chat'));
  assert.ok(eventos.some((e) => e.type === 'status' && e.sessionId === 's1' && e.status === 'idle'));

  sessions.atualizar(snapshot({}));
  assert.ok(eventos.some((e) => e.type === 'session/removed' && e.sessionId === 's1'));
  libertar();
});

test('surface: running muda -> status só na mudança; subagente pareia por parentId', () => {
  const sessions = criarSessions(snapshot({
    pai: resumo('pai', { running: true }),
    filho: resumo('filho', { parentId: 'pai' }),
  }, { pai: { entries: [{ id: 'filho' }] } }));
  const s = surface.extrairSuperficie({ sessions });
  const { eventos, libertar } = eventosDe(s);

  assert.ok(eventos.some((e) => e.type === 'subagent/start' && e.sessionId === 'pai' && e.childId === 'filho' && e.runId === 'filho'));
  const statusPai = eventos.filter((e) => e.type === 'status' && e.sessionId === 'pai');
  assert.equal(statusPai.length, 1, 'status só deve ser emitido na mudança');
  assert.equal(statusPai[0].status, 'running');

  sessions.atualizar(snapshot({ pai: resumo('pai', { running: false }) }, { pai: { entries: [] } }));
  assert.ok(eventos.some((e) => e.type === 'subagent/end' && e.sessionId === 'pai' && e.childId === 'filho'));
  assert.ok(eventos.some((e) => e.type === 'session/removed' && e.sessionId === 'filho'));
  assert.ok(eventos.some((e) => e.type === 'status' && e.sessionId === 'pai' && e.status === 'idle'));
  libertar();
});

test('surface: usage em deltas — 1.º vislumbre emite o acumulado, depois só o delta', () => {
  const v1 = { ...USAGE_A };
  const sessions = criarSessions(snapshot({ s1: resumo('s1', { projectionValues: v1 }) }));
  const s = surface.extrairSuperficie({ sessions });
  const { eventos, libertar } = eventosDe(s);

  const primeiro = eventos.find((e) => e.type === 'usage');
  assert.deepEqual(
    { uncachedInput: primeiro.uncachedInput, output: primeiro.output, cacheRead: primeiro.cacheRead, cacheWrite: primeiro.cacheWrite },
    { uncachedInput: 1000, output: 500, cacheRead: 2000, cacheWrite: 100 },
    'o primeiro vislumbre traz o acumulado (custo estimado total visível)'
  );

  sessions.atualizar(snapshot({
    s1: resumo('s1', {
      projectionValues: {
        ...v1,
        tokenUsage: { uncachedInputTokens: 1300, outputTokens: 800, cacheReadTokens: 2600, cacheWriteTokens: 130 },
      },
    }),
  }));
  const usages = eventos.filter((e) => e.type === 'usage');
  assert.equal(usages.length, 2);
  const delta = usages[1];
  assert.deepEqual(
    { uncachedInput: delta.uncachedInput, output: delta.output, cacheRead: delta.cacheRead, cacheWrite: delta.cacheWrite },
    { uncachedInput: 300, output: 300, cacheRead: 600, cacheWrite: 30 },
    'o segundo evento traz só o delta'
  );
  libertar();
});

test('surface: modelo + CTX (projected ?? pressure) e janela vêm das projeções', () => {
  const sessions = criarSessions(snapshot({
    s1: resumo('s1', {
      projectionValues: {
        contextPressure: { pressureTokens: 214600, contextWindow: 256000 },
        modelSelection: { lastUsed: { provider: 'xiaomi', model: 'openrouter/xiaomi/mimo-v2.6-pro' }, next: null },
      },
    }),
  }));
  const s = surface.extrairSuperficie({ sessions });
  const { eventos } = eventosDe(s);
  const modelo = eventos.find((e) => e.type === 'model');
  assert.equal(modelo.model, 'openrouter/xiaomi/mimo-v2.6-pro');
  assert.equal(modelo.contextWindow, 256000);
  const ctx = eventos.find((e) => e.type === 'ctx');
  assert.equal(ctx.used, 214600, 'sem projectedTokens usa pressureTokens');
  assert.equal(ctx.window, 256000);
});

test('surface: velocidade de tokens derivada dos deltas com relógio injetado', () => {
  let agora = 1000;
  const sessions = criarSessions(snapshot({
    s1: resumo('s1', { running: true, projectionValues: USAGE_A }),
  }));
  const s = surface.extrairSuperficie({ sessions }, { agora: () => agora });
  const { libertar } = eventosDe(s);
  assert.equal(s.velocidadeDe('s1'), null, 'sem produção ainda não há velocidade');

  agora = 3000; /* 2 s depois */
  sessions.atualizar(snapshot({
    s1: resumo('s1', {
      running: true,
      projectionValues: {
        ...USAGE_A,
        tokenUsage: { uncachedInputTokens: 1000, outputTokens: 3500, cacheReadTokens: 2000, cacheWriteTokens: 100 },
      },
    }),
  }));
  const v = s.velocidadeDe('s1');
  assert.ok(v >= 1400 && v <= 1600, `3000 tokens de saída em 2 s ≈ 1500 tok/s (veio ${v})`);
  libertar();
});

test('surface: preços — chave exata, por inclusão (namespaces) e desconhecida', () => {
  const precos = new Map([['mimo-v2.6-pro', { input: 1 }]]);
  assert.equal(surface.precoDe(precos, 'mimo-v2.6-pro').input, 1);
  assert.equal(surface.precoDe(precos, 'openrouter/xiaomi/mimo-v2.6-pro').input, 1, 'ids namespaced resolvem por inclusão');
  assert.equal(surface.precoDe(precos, 'modelo-desconhecido'), undefined, 'desconhecido fica sem preço (custo indisponível)');
});

/* ---------- paridade: o bundle embutido tem de se comportar como a fonte ---------- */

test('paridade: extrairSuperficie do bundle == extrairSuperficie de surface.js', () => {
  assert.ok(moduloBundle && typeof moduloBundle.__extrairSuperficie === 'function', 'bundle expõe o hook de teste');
  const cenario = () => snapshot({
    s1: resumo('s1', { running: true, projectionValues: USAGE_A }),
    s2: resumo('s2', { projectionValues: { modelSelection: { lastUsed: { model: 'mimo-v2.6-pro' } } } }),
  }, { s1: { entries: [{ id: 'sub1' }] } });

  const correr = (extrair) => {
    const sessions = criarSessions(cenario());
    const s = extrair({ sessions }, { agora: () => 0 });
    const { eventos, libertar } = eventosDe(s);
    sessions.atualizar(snapshot({ s1: resumo('s1', { running: false, projectionValues: USAGE_A }) }, { s1: { entries: [] } }));
    libertar();
    return eventos;
  };

  assert.deepEqual(
    correr(moduloBundle.__extrairSuperficie),
    correr(surface.extrairSuperficie),
    'o bundle embutido e a fonte surface.js têm de emitir os mesmos eventos'
  );
});
