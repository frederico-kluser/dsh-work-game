/*
 * tests/plugin/client-surface.test.mjs — a ponte REAL do runtime do browser
 * (fonte em dsh-plugin/src/surface.js, cópia embutida em dsh-plugin/src/client.js).
 *
 * Superfícies consumidas (verificadas no checkout deepseek-harness 0.1.6):
 *   ctx.sessions.list : ObservableSnapshot<SessionListState> (getSnapshot/subscribe)
 *     SessionListState { ids, byId: Record<id, SessionSummary>, phase, subagentsByParent }
 *     SessionSummary { id, displayTitle, cwd, parentId, origin, running, blank, projectionValues }
 *   ctx.get('workspaces').list : { items: WorkspaceView[], archivedSessionIds, phase }
 *     WorkspaceView { workspaceId, path, title, sessionIds }
 *
 * Cobre: sem canal -> null; catálogo; diff de snapshots (altas/baixas, status,
 * metadados); delegação só com subagentes A CORRER (forks não são subagentes);
 * usage em DELTAS com 1.º vislumbre acumulado; modelo e CTX; velocidade com
 * relógio injetado; preços; workspaces (ctx.get sem inject, baseline pendente,
 * ligação tardia, sem tocar em ctx.workspaces num contexto Cordis) e PARIDADE
 * bundle ↔ surface.js.
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

/* ---------- serviços falsos (forma real dos contratos) ---------- */
function criarFonte(inicial) {
  let snap = inicial;
  const ouvintes = new Set();
  return {
    list: {
      getSnapshot: () => snap,
      subscribe(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    },
    atualizar(novo) { snap = novo; for (const fn of [...ouvintes]) fn(); },
    ouvintes,
  };
}
const criarSessions = criarFonte;

function resumo(id, extra = {}) {
  return {
    id,
    displayTitle: extra.displayTitle ?? `Conversa ${id}`,
    cwd: extra.cwd ?? '/Users/u/projetos/demo',
    running: extra.running ?? false,
    blank: extra.blank ?? false,
    updatedAt: extra.updatedAt ?? 1,
    ...(extra.parentId ? { parentId: extra.parentId } : {}),
    ...(extra.origin ? { origin: extra.origin } : {}),
    projectionValues: extra.projectionValues,
  };
}
const sub = (id, pai, extra = {}) => resumo(id, { ...extra, parentId: pai, origin: 'subagent' });

function snapshot(byId, subagentsByParent = {}) {
  return { ids: Object.keys(byId), byId, phase: 'ready', subagentsByParent, jobsBySession: {} };
}

function snapWs(items, extra = {}) {
  return { items, archivedSessionIds: extra.archived ?? [], state: 'idle', phase: extra.phase ?? 'ready', error: null };
}
const ws = (workspaceId, title, sessionIds, path = `/Users/u/projetos/${title}`) => ({
  workspaceId, title, path, sessionIds, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const USAGE_A = {
  tokenUsage: { uncachedInputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 100 },
  contextPressure: { projectedTokens: 42000, contextWindow: 200000 },
  modelSelection: { lastUsed: { provider: 'deepseek', model: 'deepseek-chat' }, next: null },
};

const SEM_SONDAGEM = { intervaloWorkspaces: 0 };
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

test('surface: catalogo devolve id, modelo, título, pasta, origem e "em branco"', () => {
  const sessions = criarSessions(snapshot({
    s1: resumo('s1', { displayTitle: 'Corrigir testes', cwd: '/Users/u/projetos/site', projectionValues: USAGE_A }),
    s2: resumo('s2', { cwd: '/Users/u/projetos/api', blank: true }),
    f1: sub('f1', 's1'),
  }));
  const s = surface.extrairSuperficie({ sessions }, SEM_SONDAGEM);
  assert.deepEqual(s.catalogo(), [
    { id: 's1', model: 'deepseek-chat', title: 'Corrigir testes', cwd: '/Users/u/projetos/site', parentId: undefined, subagent: false, blank: false },
    { id: 's2', model: undefined, title: 'Conversa s2', cwd: '/Users/u/projetos/api', parentId: undefined, subagent: false, blank: true },
    { id: 'f1', model: undefined, title: 'Conversa f1', cwd: '/Users/u/projetos/demo', parentId: 's1', subagent: true, blank: false },
  ]);
});

test('surface: alta emite session/added (com metadados) + status; baixa emite session/removed', () => {
  const sessions = criarSessions(snapshot({ s1: resumo('s1', { projectionValues: USAGE_A }) }));
  const s = surface.extrairSuperficie({ sessions }, SEM_SONDAGEM);
  const { eventos, libertar } = eventosDe(s);
  const alta = eventos.find((e) => e.type === 'session/added' && e.sessionId === 's1');
  assert.equal(alta.model, 'deepseek-chat');
  assert.equal(alta.title, 'Conversa s1');
  assert.equal(alta.cwd, '/Users/u/projetos/demo');
  assert.equal(alta.subagent, false);
  assert.ok(eventos.some((e) => e.type === 'status' && e.sessionId === 's1' && e.status === 'idle'));

  sessions.atualizar(snapshot({}));
  assert.ok(eventos.some((e) => e.type === 'session/removed' && e.sessionId === 's1'));
  libertar();
});

test('surface: título gerado depois do 1.º turno chega como session/meta', () => {
  const sessions = criarSessions(snapshot({ s1: resumo('s1', { displayTitle: 'demo', blank: true }) }));
  const s = surface.extrairSuperficie({ sessions }, SEM_SONDAGEM);
  const { eventos, libertar } = eventosDe(s);
  sessions.atualizar(snapshot({ s1: resumo('s1', { displayTitle: 'Migrar a API de pagamentos', blank: false }) }));
  const meta = eventos.filter((e) => e.type === 'session/meta');
  assert.equal(meta.length, 1, 'uma mudança de metadados = um evento');
  assert.equal(meta[0].title, 'Migrar a API de pagamentos');
  assert.equal(meta[0].blank, false);
  sessions.atualizar(snapshot({ s1: resumo('s1', { displayTitle: 'Migrar a API de pagamentos', blank: false }) }));
  assert.equal(eventos.filter((e) => e.type === 'session/meta').length, 1, 'sem mudança, sem evento');
  libertar();
});

test('surface: delegação = subagente A CORRER; parado não conta e fork não é subagente', () => {
  const sessions = criarSessions(snapshot({
    pai: resumo('pai', { running: true }),
    filho: sub('filho', 'pai', { running: true }),
    velho: sub('velho', 'pai', { running: false }),
    fork: resumo('fork', { parentId: 'pai' }),
  }, { pai: { entries: [{ kind: 'child', id: 'filho', activity: 'running', mode: 'one-shot' }] } }));
  const s = surface.extrairSuperficie({ sessions }, SEM_SONDAGEM);
  const { eventos, libertar } = eventosDe(s);

  const inicios = eventos.filter((e) => e.type === 'subagent/start');
  assert.deepEqual(inicios.map((e) => e.childId), ['filho'], 'só o subagente a correr abre delegação');
  assert.equal(inicios[0].sessionId, 'pai');
  assert.equal(eventos.find((e) => e.type === 'session/added' && e.sessionId === 'fork').subagent, false, 'fork é conversa normal');
  const statusPai = eventos.filter((e) => e.type === 'status' && e.sessionId === 'pai');
  assert.equal(statusPai.length, 1, 'status só deve ser emitido na mudança');

  /* o filho termina: fecha a delegação; depois sai do catálogo sem novo end */
  sessions.atualizar(snapshot({
    pai: resumo('pai', { running: false }),
    filho: sub('filho', 'pai', { running: false }),
  }, { pai: { entries: [{ kind: 'child', id: 'filho', activity: 'inactive', mode: 'one-shot' }] } }));
  assert.equal(eventos.filter((e) => e.type === 'subagent/end' && e.childId === 'filho').length, 1);
  sessions.atualizar(snapshot({ pai: resumo('pai', { running: false }) }));
  assert.equal(eventos.filter((e) => e.type === 'subagent/end' && e.childId === 'filho').length, 1, 'sem end duplicado');
  assert.ok(eventos.some((e) => e.type === 'session/removed' && e.sessionId === 'filho'));
  assert.ok(eventos.some((e) => e.type === 'status' && e.sessionId === 'pai' && e.status === 'idle'));
  libertar();
});

test('surface: entradas do catálogo de filhos (activity/label) contam e diagnósticos ignoram-se', () => {
  const sessions = criarSessions(snapshot({ pai: resumo('pai') }, {
    pai: { entries: [
      { kind: 'child', id: 'c1', activity: 'running', mode: 'continuable', label: 'Revisor' },
      { kind: 'diagnostic', id: 'c2', reason: 'corrupt' },
    ] },
  }));
  const s = surface.extrairSuperficie({ sessions }, SEM_SONDAGEM);
  const { eventos, libertar } = eventosDe(s);
  const alta = eventos.find((e) => e.type === 'session/added' && e.sessionId === 'c1');
  assert.equal(alta.title, 'Revisor');
  assert.equal(alta.subagent, true);
  assert.ok(eventos.some((e) => e.type === 'subagent/start' && e.childId === 'c1'));
  assert.ok(!eventos.some((e) => e.sessionId === 'c2'), 'entrada de diagnóstico não vira pessoa');
  libertar();
});

test('surface: usage em deltas — 1.º vislumbre emite o acumulado, depois só o delta', () => {
  const v1 = { ...USAGE_A };
  const sessions = criarSessions(snapshot({ s1: resumo('s1', { projectionValues: v1 }) }));
  const s = surface.extrairSuperficie({ sessions }, SEM_SONDAGEM);
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
  const s = surface.extrairSuperficie({ sessions }, SEM_SONDAGEM);
  const { eventos, libertar } = eventosDe(s);
  const modelo = eventos.find((e) => e.type === 'model');
  assert.equal(modelo.model, 'openrouter/xiaomi/mimo-v2.6-pro');
  assert.equal(modelo.contextWindow, 256000);
  const ctx = eventos.find((e) => e.type === 'ctx');
  assert.equal(ctx.used, 214600, 'sem projectedTokens usa pressureTokens');
  assert.equal(ctx.window, 256000);
  libertar();
});

test('surface: velocidade de tokens derivada dos deltas com relógio injetado', () => {
  let agora = 1000;
  const sessions = criarSessions(snapshot({
    s1: resumo('s1', { running: true, projectionValues: USAGE_A }),
  }));
  const s = surface.extrairSuperficie({ sessions }, { agora: () => agora, intervaloWorkspaces: 0 });
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

/* ---------- workspaces ---------- */

test('workspaces: lidos com ctx.get (sem inject) e emitidos na ordem do DSH', () => {
  const sessions = criarSessions(snapshot({ a: resumo('a'), b: resumo('b') }));
  const workspaces = criarFonte(snapWs([
    ws('w1', 'newsletter-crawler', ['b', 'a']),
    ws('w2', 'daf-chat', []),
  ], { archived: ['z'] }));
  const pedidos = [];
  /* contexto à Cordis: get(nome) não bloqueia; ctx.workspaces NUNCA é tocado */
  const ctx = {
    sessions,
    get(nome) { pedidos.push(nome); return nome === 'workspaces' ? workspaces : undefined; },
    get workspaces() { throw new Error('property workspaces is not registered, declare it as inject'); },
  };
  const s = surface.extrairSuperficie(ctx, SEM_SONDAGEM);
  const { eventos, libertar } = eventosDe(s);
  const ev = eventos.find((e) => e.type === 'workspaces');
  assert.ok(ev, 'emite a lista de workspaces');
  assert.equal(ev.fonte, 'dsh');
  assert.deepEqual(ev.items.map((w) => [w.id, w.title, w.sessionIds]), [
    ['w1', 'newsletter-crawler', ['b', 'a']],
    ['w2', 'daf-chat', []],
  ]);
  assert.equal(ev.items[0].path, '/Users/u/projetos/newsletter-crawler');
  assert.deepEqual(ev.archived, ['z']);
  assert.ok(pedidos.includes('workspaces'));

  workspaces.atualizar(snapWs([ws('w1', 'newsletter-crawler', ['b', 'a']), ws('w2', 'daf-chat', ['a'])]));
  assert.equal(eventos.filter((e) => e.type === 'workspaces').length, 2, 'mudança no DSH = nova lista');
  libertar();
  assert.equal(workspaces.ouvintes.size, 0, 'libertar solta a subscrição dos workspaces');
});

test('workspaces: baseline pendente não emite; o "ready" emite', () => {
  const sessions = criarSessions(snapshot({ a: resumo('a') }));
  const workspaces = criarFonte(snapWs([], { phase: 'pending' }));
  const s = surface.extrairSuperficie({ sessions, workspaces }, SEM_SONDAGEM);
  const { eventos, libertar } = eventosDe(s);
  assert.equal(eventos.filter((e) => e.type === 'workspaces').length, 0, 'sem baseline, mantém o agrupamento por pasta');
  workspaces.atualizar(snapWs([ws('w1', 'site', ['a'])]));
  assert.equal(eventos.filter((e) => e.type === 'workspaces' && e.fonte === 'dsh').length, 1);
  libertar();
});

test('workspaces: ligação tardia — o serviço aparece depois do plugin', async () => {
  const sessions = criarSessions(snapshot({ a: resumo('a') }));
  const workspaces = criarFonte(snapWs([ws('w1', 'site', ['a'])]));
  let disponivel = false;
  const ctx = { sessions, get: (nome) => (nome === 'workspaces' && disponivel ? workspaces : undefined) };
  const s = surface.extrairSuperficie(ctx, { intervaloWorkspaces: 5 });
  const { eventos, libertar } = eventosDe(s);
  assert.equal(eventos.filter((e) => e.type === 'workspaces').length, 0);
  disponivel = true;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(eventos.filter((e) => e.type === 'workspaces' && e.fonte === 'dsh').length, 1, 'a sondagem liga o serviço quando aparece');
  libertar();
});

test('workspaces: perder o serviço volta ao agrupamento por pasta', () => {
  const sessions = criarSessions(snapshot({ a: resumo('a') }));
  const workspaces = criarFonte(snapWs([ws('w1', 'site', ['a'])]));
  let disponivel = true;
  const ctx = { sessions, get: (nome) => (nome === 'workspaces' && disponivel ? workspaces : undefined) };
  const s = surface.extrairSuperficie(ctx, SEM_SONDAGEM);
  const { eventos, libertar } = eventosDe(s);
  disponivel = false;
  sessions.atualizar(snapshot({ a: resumo('a') }));
  const ultimo = eventos.filter((e) => e.type === 'workspaces').at(-1);
  assert.equal(ultimo.fonte, 'nenhuma');
  libertar();
});

/* ---------- paridade: o bundle embutido tem de se comportar como a fonte ---------- */

test('paridade: extrairSuperficie do bundle == extrairSuperficie de surface.js', () => {
  assert.ok(moduloBundle && typeof moduloBundle.__extrairSuperficie === 'function', 'bundle expõe o hook de teste');
  const cenario = () => snapshot({
    s1: resumo('s1', { running: true, projectionValues: USAGE_A }),
    s2: resumo('s2', { projectionValues: { modelSelection: { lastUsed: { model: 'mimo-v2.6-pro' } } } }),
    f1: sub('f1', 's1', { running: true }),
    k: resumo('k', { parentId: 's1' }),
  }, { s1: { entries: [{ kind: 'child', id: 'sub1', activity: 'running', mode: 'one-shot', label: 'Revisor' }] } });

  const correr = (extrair) => {
    const sessions = criarSessions(cenario());
    const workspaces = criarFonte(snapWs([ws('w1', 'site', ['s2', 's1']), ws('w2', 'api', ['k'])]));
    const s = extrair({ sessions, workspaces }, { agora: () => 0, intervaloWorkspaces: 0 });
    const { eventos, libertar } = eventosDe(s);
    sessions.atualizar(snapshot({
      s1: resumo('s1', { running: false, displayTitle: 'Título novo', projectionValues: USAGE_A }),
      f1: sub('f1', 's1', { running: false }),
    }, { s1: { entries: [] } }));
    workspaces.atualizar(snapWs([ws('w1', 'site', ['s1'])], { archived: ['s2'] }));
    libertar();
    return eventos;
  };

  assert.deepEqual(
    correr(moduloBundle.__extrairSuperficie),
    correr(surface.extrairSuperficie),
    'o bundle embutido e a fonte surface.js têm de emitir os mesmos eventos'
  );
});

test('paridade: a cópia embutida da ponte é o texto de surface.js (sem export)', async () => {
  const { readFile } = await import('node:fs/promises');
  const fonte = await readFile(new URL('../../dsh-plugin/src/surface.js', import.meta.url), 'utf8');
  const bundle = await readFile(new URL('../../dsh-plugin/src/client.js', import.meta.url), 'utf8');
  const esperado = fonte.trimEnd().split('\n')
    .map((l) => l.replace(/^export (const|function|let) /, '$1 '))
    .map((l) => (l.trim() ? `    ${l}` : ''))
    .join('\n');
  assert.ok(bundle.includes(esperado), 'client.js tem de embutir surface.js tal-e-qual (regenerar a secção 0)');
});
