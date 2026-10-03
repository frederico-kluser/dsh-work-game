/*
 * tests/plugin/filtros.test.mjs — os filtros da sala em comportamento puro:
 *
 *   FEATURE 1 — filtro contra conversas arquivadas fiável e explícito:
 *     - o evento `workspaces` leva `archived: string[]` quando o DSH o conhece
 *       (fonte 'dsh') e `null` quando é desconhecido (nunca "limpo" inventado);
 *     - `applyEvent` guarda `arquivoConhecido` + o conjunto;
 *     - com o arquivo CONHECIDO, as arquivadas não se sentam por omissão;
 *       com o arquivo DESCONHECIDO ninguém é escondido por arquivamento, as
 *       sentadas contam à parte (`escondidas.arquivoDesconhecido`) e o resumo
 *       nunca finge que está limpo;
 *     - as arquivadas ficam fora dos GRUPOS do celular quando o filtro as oculta.
 *
 *   FEATURE 2 — "Manter workspaces abertos sem ação" (mostrarAbertos, padrão):
 *     - um workspace ABERTO (com conversas-membro presentes e não arquivadas)
 *       mantém TODAS as pessoas sentadas mesmo sem ação — nem o "em branco" nem
 *       o "Só quem está a trabalhar" as escondem, nem tiram a mesa;
 *     - desligado = comportamento antigo exato;
 *     - workspaces suprimidos pelas regras contam como `escondidas.fechados`.
 *
 * Executar: node --test tests/plugin/filtros.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

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
const B = moduloBundle;

/* ---------- utilitários (forma real dos contratos) ---------- */
function pessoa(id, extra = {}) {
  return {
    id,
    name: extra.name ?? `P${id}`,
    avatar: extra.avatar ?? 'rui',
    status: extra.status ?? 'idle',
    emoji: extra.emoji ?? '💤',
    ctx: extra.ctx ?? null,
    model: extra.model ?? 'deepseek-chat',
    cost: extra.cost ?? null,
    speed: extra.speed ?? null,
    question: extra.question ?? null,
    outputs: [],
    title: extra.title ?? `Conversa ${id}`,
    cwd: 'cwd' in extra ? extra.cwd : '/Users/u/projetos/demo',
    parentId: extra.parentId ?? null,
    subagent: extra.subagent ?? false,
    blank: extra.blank ?? false,
    running: extra.running ?? false,
    subagents: extra.subagents ?? 0,
  };
}
const wsDsh = (items, archived = []) => ({ fonte: 'dsh', items, archived });
const w = (id, title, sessionIds, path = `/Users/u/Projects/${title}`) => ({ id, title, path, sessionIds });
const sentadas = (l) => l.modules.flatMap((m) => m.seats).filter((s) => typeof s === 'string');
const ESCONDIDAS_LIMPAS = { total: 0, arquivadas: 0, emBranco: 0, semWorkspace: 0, paradas: 0, fechados: 0, arquivoDesconhecido: 0 };

/* ---------- serviços falsos do DSH (superfície real) ---------- */
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
const resumo = (id, extra = {}) => ({
  id, displayTitle: `Conversa ${id}`, cwd: '/Users/u/projetos/demo',
  running: false, blank: false, updatedAt: 1, ...extra,
});
const snapshot = (byId) => ({ ids: Object.keys(byId), byId, phase: 'ready', subagentsByParent: {} });
/* Sem `archived` no extra, o snapshot NEM TEM archivedSessionIds (host antigo). */
function snapWs(items, extra = {}) {
  const snap = { items, state: 'idle', phase: 'ready', error: null };
  if ('archived' in extra) snap.archivedSessionIds = extra.archived;
  return snap;
}
const wsRaw = (workspaceId, title, sessionIds) => ({
  workspaceId, title, path: `/Users/u/Projects/${title}`, sessionIds,
});
const SEM_SONDAGEM = { intervaloWorkspaces: 0 };

/* ---------- Feature 1: arquivo conhecido vs desconhecido ---------- */

test('arquivo: o evento workspaces leva archived[] conhecido e null desconhecido (nunca [] inventado)', () => {
  const sessions = criarFonte(snapshot({ a: resumo('a') }));
  const workspaces = criarFonte(snapWs([wsRaw('w1', 'site', ['a'])], { archived: ['z'] }));
  let disponivel = true;
  const ctx = { sessions, get: (nome) => (nome === 'workspaces' && disponivel ? workspaces : undefined) };
  const s = B.__extrairSuperficie(ctx, SEM_SONDAGEM);
  const eventos = [];
  const libertar = s.assinar((ev) => eventos.push(ev));

  const ev = eventos.find((e) => e.type === 'workspaces');
  assert.equal(ev.fonte, 'dsh');
  assert.deepEqual(ev.archived, ['z'], 'lista do WorkspaceBaseline conhecida: array');

  // Baseline sem archivedSessionIds (host antigo): DESCONHECIDO, não "limpo".
  workspaces.atualizar(snapWs([wsRaw('w1', 'site', ['a'])]));
  assert.equal(eventos.filter((e) => e.type === 'workspaces').at(-1).archived, null);

  // Serviço desaparece: fonte 'nenhuma' e arquivo desconhecido.
  disponivel = false;
  sessions.atualizar(snapshot({ a: resumo('a') }));
  const ultimo = eventos.filter((e) => e.type === 'workspaces').at(-1);
  assert.equal(ultimo.fonte, 'nenhuma');
  assert.equal(ultimo.archived, null, 'sem serviço não há arquivo: desconhecido, não vazio');
  libertar();
  assert.equal(workspaces.ouvintes.size, 0);
});

test('arquivo: applyEvent guarda o conjunto e se ele é conhecido (arquivoConhecido)', () => {
  const conhecido = B.__applyEvent(B.__createOfficeState(), { type: 'workspaces', fonte: 'dsh', items: [], archived: ['s2'] });
  assert.equal(conhecido.workspaces.arquivoConhecido, true);
  assert.deepEqual(conhecido.workspaces.archived, ['s2']);

  const desconhecido = B.__applyEvent(B.__createOfficeState(), { type: 'workspaces', fonte: 'nenhuma', items: [], archived: null });
  assert.equal(desconhecido.workspaces.arquivoConhecido, false);
  assert.equal(desconhecido.workspaces.archived, null);

  // Evento antigo (sem o campo archived): também é desconhecido.
  const antigo = B.__applyEvent(B.__createOfficeState(), { type: 'workspaces', fonte: 'dsh', items: [] });
  assert.equal(antigo.workspaces.arquivoConhecido, false);
  assert.equal(antigo.workspaces.archived, null);
});

test('arquivo: com o arquivo CONHECIDO as arquivadas não se sentam por omissão (também via evento workspaces)', () => {
  let e = B.__createOfficeState();
  for (const ev of [
    { type: 'session/added', sessionId: 'a', title: 'Trabalho', cwd: '/Users/u/Projects/site' },
    { type: 'session/added', sessionId: 'arq', title: 'Velho', cwd: '/Users/u/Projects/site' },
    { type: 'workspaces', fonte: 'dsh', items: [w('w1', 'site', ['a', 'arq'])], archived: ['arq'] },
  ]) e = B.__applyEvent(e, ev);
  const view = B.__officeView(e);
  const pessoas = Object.values(view.people);

  const l = B.__montarEscritorio(pessoas, view.workspaces);
  assert.deepEqual(sentadas(l), ['a']);
  assert.deepEqual(l.escondidas, { ...ESCONDIDAS_LIMPAS, total: 1, arquivadas: 1 });
  assert.deepEqual([...l.arquivadas], [], 'escondidas não levam a ficha cinzenta');

  // O interruptor mantém-se: ligado, sentam-se com a ficha "Arquivada" em cinzento.
  const comArquivadas = B.__montarEscritorio(pessoas, view.workspaces, { mostrarArquivadas: true });
  assert.deepEqual(sentadas(comArquivadas), ['a', 'arq']);
  assert.deepEqual([...comArquivadas.arquivadas], ['arq']);
  assert.equal(comArquivadas.escondidas.total, 0);
});

test('arquivo DESCONHECIDO: ninguém é escondido por arquivamento e as sentadas contam à parte', () => {
  const pessoas = [
    pessoa('a', { running: true, subagents: 1 }),
    pessoa('b'),
    pessoa('sub', { subagent: true, parentId: 'a', running: true }),
  ];
  // Antes da baseline (sem dados) e com evento sem lista: o mesmo.
  for (const ws of [null, { fonte: 'dsh', items: [w('w1', 'site', ['a', 'b'])], archived: null }]) {
    const l = B.__montarEscritorio(pessoas, ws);
    assert.deepEqual(sentadas(l).sort(), ['a', 'b', 'sub'].sort(), 'sem conhecimento de arquivo ninguém sai por arquivamento');
    assert.equal(l.escondidas.arquivadas, 0);
    assert.equal(l.escondidas.arquivoDesconhecido, 2, 'as conversas sentadas contam à parte (o subagente não)');
    assert.deepEqual({ ...l.escondidas, arquivoDesconhecido: 0 }, { ...ESCONDIDAS_LIMPAS, arquivoDesconhecido: 0 });
  }
  // Nunca "limpo": o resumo do menu diz que o arquivo é desconhecido.
  const l = B.__montarEscritorio(pessoas, null);
  assert.equal(B.__resumoFiltros(l.escondidas), 'Ninguém escondido · 2 com arquivo desconhecido');
  // Com o arquivo conhecido e nada escondido, o resumo normal.
  assert.equal(B.__resumoFiltros(ESCONDIDAS_LIMPAS), 'Ninguém escondido pelos filtros');
});

test('grupos (celular): as arquivadas não entram quando o filtro as oculta — e o toggle manda', () => {
  const ws = wsDsh([], ['arq']);
  assert.deepEqual(B.__semArquivadas(['a', 'arq', 'b'], ws, {}), ['a', 'b']);
  assert.deepEqual(B.__semArquivadas(['a', 'arq', 'b'], ws, { mostrarArquivadas: true }), ['a', 'arq', 'b'], 'o toggle honra-se na vista de grupos');
  assert.deepEqual(B.__semArquivadas(['a', 'arq'], { fonte: 'dsh', items: [], archived: null }, {}), ['a', 'arq'], 'arquivo desconhecido: nada é presumido');
  assert.deepEqual(B.__semArquivadas(['a', 'arq'], null, {}), ['a', 'arq']);
  assert.deepEqual(B.__semArquivadas(null, ws, {}), []);
});

/* ---------- Feature 2: "Manter workspaces abertos sem ação" ---------- */

test('mostrarAbertos: workspace aberto sem ação mantém as pessoas sentadas (em branco + paradas)', () => {
  const pessoas = [pessoa('vazia', { blank: true }), pessoa('parada')];
  const ws = wsDsh([w('w1', 'site', ['vazia', 'parada'])]);
  // Padrão (mostrarAbertos): o workspace aberto mantém TODOS mesmo sem ação.
  for (const l of [B.__montarEscritorio(pessoas, ws), B.__montarEscritorio(pessoas, ws, { soTrabalhando: true })]) {
    assert.deepEqual(sentadas(l), ['vazia', 'parada']);
    assert.deepEqual(l.escondidas, { ...ESCONDIDAS_LIMPAS });
  }
  // A mesa não sai mesmo sem ninguém a trabalhar.
  const t = B.__montarEscritorio(pessoas, ws, { soTrabalhando: true });
  assert.deepEqual(t.modules.map((m) => [m.teamId, m.seats]), [['ws:w1', ['vazia', 'parada', null, null]]]);
  // Desligado: o comportamento antigo exato (em branco e paradas escondidas).
  const off = B.__montarEscritorio(pessoas, ws, { mostrarAbertos: false, soTrabalhando: true });
  assert.deepEqual(sentadas(off), []);
  assert.deepEqual(off.escondidas, { ...ESCONDIDAS_LIMPAS, total: 2, emBranco: 1, paradas: 1, fechados: 1 }, 'a mesa suprimida conta como workspace FECHADO');
});

test('mostrarAbertos: só workspaces abertos se mantêm — fechados contam à parte e "Sem workspace" não é workspace', () => {
  // w1 aberto (a presente e não arquivada); w2 sem pessoas = fechado.
  const pessoas = [pessoa('a', { running: true, status: 'working' }), pessoa('orfa')];
  const ws = wsDsh([w('w1', 'site', ['a']), w('w2', 'vazio', [])], []);
  const l = B.__montarEscritorio(pessoas, ws, { soTrabalhando: true });
  assert.deepEqual(l.modules.map((m) => m.teamId), ['ws:w1'], 'w1 (aberto) mantém-se; w2 (sem pessoas) sai da sala');
  assert.equal(l.escondidas.fechados, 1);
  assert.equal(l.escondidas.paradas, 1, 'a órfã parada esconde-se: "Sem workspace" não é workspace');
  assert.equal(B.__detalheEscondidas(l.escondidas), '1 parada · 1 workspace fechado');

  // "Sem workspace" não é workspace: as órfãs paradas continuam a esconder-se.
  const orfa = B.__montarEscritorio([pessoa('orfa')], wsDsh([]), { soTrabalhando: true });
  assert.deepEqual(sentadas(orfa), []);
  assert.deepEqual(orfa.escondidas, { ...ESCONDIDAS_LIMPAS, total: 1, paradas: 1 });

  // Workspace cujo único membro está arquivado: não é aberto (arquivada não conta).
  const soArq = B.__montarEscritorio(
    [pessoa('arq', { blank: true })],
    wsDsh([w('w1', 'site', ['arq'])], ['arq']),
    { soTrabalhando: true, mostrarArquivadas: false },
  );
  assert.deepEqual(sentadas(soArq), []);
  assert.deepEqual(soArq.escondidas, { ...ESCONDIDAS_LIMPAS, total: 1, arquivadas: 1, fechados: 1 });
});

test('escondidas: o detalhe e o resumo refletem fechados e arquivo desconhecido', () => {
  assert.equal(
    B.__detalheEscondidas({ total: 3, arquivadas: 1, emBranco: 0, semWorkspace: 0, paradas: 1, fechados: 2, arquivoDesconhecido: 4 }),
    '1 arquivada · 1 parada · 2 workspaces fechados · 4 com arquivo desconhecido',
  );
  assert.equal(B.__resumoFiltros({ total: 1, arquivadas: 1 }), '1 escondida pelos filtros (1 arquivada)');
  assert.equal(B.__resumoFiltros({ total: 0, fechados: 2 }), 'Ninguém escondido · 2 workspaces fechados');
  assert.equal(B.__resumoFiltros(null), 'Ninguém escondido pelos filtros');
  assert.equal(B.__textoEscondidas({ total: 2 }), '2 escondidas pelos filtros');
});

test('mostrarAbertos: rótulo, ajuda e compatibilidade com payloads antigos de localStorage', () => {
  const ui = B.__FILTROS_UI.find((f) => f.chave === 'mostrarAbertos');
  assert.equal(ui.rotulo, 'Manter workspaces abertos sem ação');
  assert.ok(ui.ajuda && ui.ajuda.length > 10, 'com texto de ajuda em pt-PT');
  assert.equal(B.__FILTROS_PADRAO.mostrarAbertos, true, 'padrão: manter abertos');
  // Payload antigo (sem a chave): completa com o padrão verdadeiro.
  assert.deepEqual(B.__normalizarFiltros({ mostrarArquivadas: true, soTrabalhando: true }), {
    mostrarArquivadas: true, mostrarSemWorkspace: true, soTrabalhando: true, mostrarEmBranco: false, mostrarAbertos: true,
  });
  assert.equal(B.__normalizarFiltros({ mostrarAbertos: false }).mostrarAbertos, false, 'e aceita o novo campo quando existe');
});
