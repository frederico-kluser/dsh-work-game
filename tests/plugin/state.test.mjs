/*
 * tests/plugin/state.test.mjs — testes da lógica PURA do escritório
 * (dsh-plugin/src/state.js), conforme docs/contratos-plugin.md (secções 1 e 2)
 * e docs/conhecimento/07-features-futuras.md.
 *
 * Cobre: API exportada, ciclo de vida do status (done só com turn/end completed),
 * pergunta persistente, precedência de emojis, CTX, custo por deltas com
 * anti-dupla-contagem (inheritedEventCount), expressão derivada, mesas e alertas,
 * e pureza (applyEvent nunca muta o estado de entrada).
 *
 * Executar a partir da raiz do projeto:
 *   node --test tests/plugin/
 *
 * Zero dependências: apenas node:test + node:assert/strict.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as stateApi from '../../dsh-plugin/src/state.js';
import {
  createOfficeState,
  applyEvent,
  personView,
  officeView,
  setPrices
} from '../../dsh-plugin/src/state.js';
import { VARIANTES_EVENTOS } from '../../dsh-plugin/src/variantes.js';

/* As expressões durante o trabalho são SORTEADAS dentro dos pools de variantes
 * (variantes.js): cada evento tem o seu pool e o disparo é aleatório, com
 * anti-repetição e personalidade por pessoa. As asserções conferem POOL
 * (nunca um valor fixo). */
const POOL = (evento) => VARIANTES_EVENTOS[evento].pool;
const dentroDoPool = (expressao, evento, contexto) =>
  assert.ok(POOL(evento).includes(expressao), `${contexto}: '${expressao}' ∈ pool de ${evento} (${POOL(evento).join('·')})`);

/** Estado com a sessão "s1" (workspace "m1", modelo deepseek-chat) pronta. */
function office(extra = []) {
  let state = applyEvent(createOfficeState(), {
    type: 'session/added',
    sessionId: 's1',
    workspaceId: 'm1',
    model: 'deepseek-chat'
  });
  for (const evento of extra) state = applyEvent(state, evento);
  return state;
}

const PRECO = { 'deepseek-chat': { input: 2, output: 3, cacheRead: 0.5, cacheWrite: 1 } };

/* ------------------------------------------------------------------ */
/* API e estado inicial                                                */
/* ------------------------------------------------------------------ */

test('módulo exporta exatamente as funções do contrato', () => {
  assert.deepEqual(
    Object.keys(stateApi).sort(),
    ['applyEvent', 'createOfficeState', 'officeView', 'personView', 'planoDeParagem', 'setPrices']
  );
});

test('createOfficeState devolve escritório vazio (sem pessoas nem preços)', () => {
  const state = createOfficeState();
  assert.deepEqual(state, { people: {}, prices: {} });
  assert.deepEqual(officeView(state), { people: [], teams: [], alerts: [] });
});

test('personView devolve null para sessão desconhecida', () => {
  assert.equal(personView(createOfficeState(), 'nunca-vista'), null);
});

/* ------------------------------------------------------------------ */
/* Sessões                                                             */
/* ------------------------------------------------------------------ */

test('session/added cria pessoa com os padrões do contrato', () => {
  const v = personView(office(), 's1');
  assert.equal(v.name, 's1');
  assert.equal(v.avatar, null);
  assert.equal(v.status, 'idle');
  assert.equal(v.statusLabel, 'à espera');
  assert.equal(v.emoji, '💤');
  assert.equal(v.emojiLabel, 'Ocioso');
  assert.equal(v.expression, 'idle');
  assert.equal(v.ctx, null);
  assert.equal(v.cost, null);
  assert.equal(v.question, null);
  assert.deepEqual(v.approvals, []);
  assert.deepEqual(v.subagents, []);
  assert.deepEqual(v.outputs, []);
  assert.deepEqual(v.model, { provider: null, model: 'deepseek-chat', contextWindow: null });
});

test('session/added aceita nome e avatar opcionais', () => {
  const state = applyEvent(createOfficeState(), {
    type: 'session/added',
    sessionId: 's2',
    name: 'Bia',
    avatar: 'bia.svg'
  });
  const v = personView(state, 's2');
  assert.equal(v.name, 'Bia');
  assert.equal(v.avatar, 'bia.svg');
  assert.deepEqual(v.model, null);
});

test('session/added é idempotente: sessão existente não é recriada', () => {
  let state = applyEvent(createOfficeState(), { type: 'session/added', sessionId: 's1', name: 'Original' });
  state = applyEvent(state, { type: 'session/added', sessionId: 's1', name: 'Cópia' });
  assert.equal(personView(state, 's1').name, 'Original');
});

test('session/removed tira a pessoa; remoção de desconhecida é inofensiva', () => {
  let state = office();
  state = applyEvent(state, { type: 'session/removed', sessionId: 's1' });
  assert.equal(personView(state, 's1'), null);
  assert.equal(officeView(state).people.length, 0);
  state = applyEvent(state, { type: 'session/removed', sessionId: 'nunca-vista' });
  assert.equal(officeView(state).people.length, 0);
});

test('eventos de sessão desconhecida são ignorados (sem erro, sem pessoa)', () => {
  const state = office();
  const depois = applyEvent(state, { type: 'usage', sessionId: 'fantasma', model: 'x', output: 5 });
  assert.equal(officeView(depois).people.length, 1);
  assert.equal(personView(depois, 'fantasma'), null);
});

test('applyEvent ignora tipo de evento desconhecido', () => {
  const state = office();
  const depois = applyEvent(state, { type: 'bailarina', sessionId: 's1' });
  assert.deepEqual(personView(depois, 's1'), personView(state, 's1'));
});

/* ------------------------------------------------------------------ */
/* Status e fim de turno                                               */
/* ------------------------------------------------------------------ */

test('status running/idle alterna entre working e idle (emoji 📝/💤)', () => {
  let state = office();
  state = applyEvent(state, { type: 'status', sessionId: 's1', status: 'running' });
  let v = personView(state, 's1');
  assert.equal(v.status, 'working');
  assert.equal(v.statusLabel, 'trabalhando');
  assert.equal(v.emoji, '📝');
  assert.equal(v.emojiLabel, 'Trabalhando');
  assert.equal(v.expression, 'working');
  state = applyEvent(state, { type: 'status', sessionId: 's1', status: 'idle' });
  v = personView(state, 's1');
  assert.equal(v.status, 'idle');
  assert.equal(v.statusLabel, 'à espera');
  assert.equal(v.emoji, '💤');
  assert.equal(v.expression, 'idle');
});

test('message: durante o trabalho cada mensagem pode disparar uma variante nova (sorteio por pessoa)', () => {
  let state = office([{ type: 'status', sessionId: 's1', status: 'running' }]);
  assert.equal(personView(state, 's1').expression, 'working', 'sem mensagens ainda: a cara de trabalho base');
  const vistas = [];
  for (let i = 0; i < 40; i += 1) {
    state = applyEvent(state, { type: 'message', sessionId: 's1', side: i % 2 ? 'assistant' : 'user' });
    vistas.push(personView(state, 's1').expression);
  }
  for (const v of vistas) dentroDoPool(v, 'working', 'durante o trabalho');
  assert.ok(new Set(vistas).size >= 3, `ao longo de 40 mensagens aparecem várias caras (${[...new Set(vistas)].join('·')})`);
  // Os estados fortes mandam na cara mesmo com mensagens a chegar.
  state = applyEvent(state, { type: 'question', sessionId: 's1', id: 'q1', text: 'ok?' });
  state = applyEvent(state, { type: 'message', sessionId: 's1', side: 'assistant' });
  assert.equal(personView(state, 's1').expression, 'waiting', 'esperar resposta manda sobre as variantes');
  // Fora do trabalho, as variantes ficam guardadas mas não mandam (idle).
  state = applyEvent(state, { type: 'question/answered', sessionId: 's1', id: 'q1' });
  state = applyEvent(state, { type: 'status', sessionId: 's1', status: 'idle' });
  assert.equal(personView(state, 's1').expression, 'idle');
});

test('só turn/end completed produz done — nenhum outro evento conta como conclusão', () => {
  const eventos = [
    { type: 'status', sessionId: 's1', status: 'running' },
    { type: 'status', sessionId: 's1', status: 'idle' },
    { type: 'tool', sessionId: 's1', phase: 'result', name: 'bash', ok: true },
    { type: 'question/answered', sessionId: 's1', id: 'q0' },
    { type: 'retry', sessionId: 's1' }
  ];
  let state = office();
  for (const e of eventos) state = applyEvent(state, e);
  assert.notEqual(personView(state, 's1').status, 'done');
  state = applyEvent(state, { type: 'turn/end', sessionId: 's1', kind: 'completed' });
  const v = personView(state, 's1');
  assert.equal(v.status, 'done');
  assert.equal(v.statusLabel, 'Concluído');
  assert.equal(v.emoji, '✅');
  dentroDoPool(v.expression, 'success', 'turno concluído');
});

test('mapeamento completo de turn/end.kind para status e emoji', () => {
  const casos = [
    ['aborted', 'aborted', '⏹️'],
    ['blocked', 'blocked', '🚫'],
    ['max-tokens', 'blocked', '🚫'],
    ['error', 'error', '⚠️'],
    ['interrupted', 'aborted', '⏹️']
  ];
  for (const [kind, status, emoji] of casos) {
    let state = office();
    state = applyEvent(state, { type: 'turn/end', sessionId: 's1', kind });
    const v = personView(state, 's1');
    assert.equal(v.status, status, `turn/end ${kind} → status`);
    assert.equal(v.emoji, emoji, `turn/end ${kind} → emoji`);
    if (kind === 'error') dentroDoPool(v.expression, 'error', 'turno em erro');
  }
});

test('turn/end com kind desconhecido mantém o status anterior', () => {
  const state = office();
  const depois = applyEvent(state, { type: 'turn/end', sessionId: 's1', kind: 'misterioso' });
  assert.equal(personView(depois, 's1').status, 'idle');
});

test('status idle depois de done volta a mostrar "à espera"', () => {
  let state = office();
  state = applyEvent(state, { type: 'turn/end', sessionId: 's1', kind: 'completed' });
  state = applyEvent(state, { type: 'status', sessionId: 's1', status: 'idle' });
  const v = personView(state, 's1');
  assert.equal(v.status, 'idle');
  assert.equal(v.statusLabel, 'à espera');
  assert.equal(v.emoji, '💤');
});

/* ------------------------------------------------------------------ */
/* Pergunta persistente e aprovações                                  */
/* ------------------------------------------------------------------ */

test('question mostra ❓/waiting e é persistente por cima de turn/end completed', () => {
  let state = office();
  state = applyEvent(state, {
    type: 'question', sessionId: 's1', id: 'q1', text: 'Continuo?',
    options: [{ label: 'sim' }], multiSelect: false
  });
  let v = personView(state, 's1');
  assert.equal(v.emoji, '❓');
  assert.equal(v.emojiLabel, 'Aguardando resposta');
  assert.equal(v.expression, 'waiting');
  assert.deepEqual(v.question, { id: 'q1', text: 'Continuo?', options: [{ label: 'sim' }], multiSelect: false });
  assert.equal(v.status, 'idle'); /* o ciclo de vida não é alterado pela pergunta */
  /* turno termina com pergunta em aberto: status vira done, emoji continua ❓ */
  state = applyEvent(state, { type: 'turn/end', sessionId: 's1', kind: 'completed' });
  v = personView(state, 's1');
  assert.equal(v.status, 'done');
  assert.equal(v.emoji, '❓');
  assert.equal(v.expression, 'waiting');
  /* só question/answered com o id certo resolve a pergunta */
  state = applyEvent(state, { type: 'question/answered', sessionId: 's1', id: 'q1' });
  v = personView(state, 's1');
  assert.equal(v.question, null);
  assert.equal(v.emoji, '✅');
  dentroDoPool(v.expression, 'success', 'pergunta respondida em turno concluído');
});

test('pergunta nova substitui a ativa e a antiga fica no painel', () => {
  let state = office();
  state = applyEvent(state, { type: 'question', sessionId: 's1', id: 'q1', text: 'Primeira' });
  state = applyEvent(state, { type: 'question', sessionId: 's1', id: 'q2', text: 'Segunda' });
  const v = personView(state, 's1');
  assert.equal(v.question.id, 'q2');
  assert.equal(v.outputs[0].kind, 'question');
  assert.equal(v.outputs[0].text, 'Primeira');
});

test('question/answered com id errado não limpa a pergunta', () => {
  let state = office();
  state = applyEvent(state, { type: 'question', sessionId: 's1', id: 'q1', text: 'Continuo?' });
  state = applyEvent(state, { type: 'question/answered', sessionId: 's1', id: 'q2' });
  assert.equal(personView(state, 's1').question.id, 'q1');
});

test('approval mostra ⚖️/waiting; approval/decided remove a pendência', () => {
  let state = office();
  state = applyEvent(state, {
    type: 'approval', sessionId: 's1', id: 'a1', toolName: 'bash',
    callId: 'c-1', reason: 'rodar a suíte'
  });
  let v = personView(state, 's1');
  assert.equal(v.emoji, '⚖️');
  assert.equal(v.emojiLabel, 'Precisa de aprovação');
  assert.equal(v.expression, 'waiting');
  assert.deepEqual(v.approvals, [
    { id: 'a1', toolName: 'bash', callId: 'c-1', reason: 'rodar a suíte' }
  ]);
  /* campos opcionais ficam null */
  state = applyEvent(state, { type: 'approval', sessionId: 's1', id: 'a2', toolName: 'cp' });
  assert.deepEqual(personView(state, 's1').approvals[1], { id: 'a2', toolName: 'cp', callId: null, reason: null });
  state = applyEvent(state, { type: 'approval/decided', sessionId: 's1', id: 'a1', outcome: 'allowed-once' });
  v = personView(state, 's1');
  assert.deepEqual(v.approvals.map((a) => a.id), ['a2']);
  state = applyEvent(state, { type: 'approval/decided', sessionId: 's1', id: 'a2', outcome: 'rejected' });
  v = personView(state, 's1');
  assert.deepEqual(v.approvals, []);
  assert.equal(v.emoji, '💤');
});

/* ------------------------------------------------------------------ */
/* Precedência de emojis                                              */
/* ------------------------------------------------------------------ */

test('precedência: ❓ vence ⚖️, em qualquer ordem', () => {
  let state = office();
  state = applyEvent(state, { type: 'approval', sessionId: 's1', id: 'a1', toolName: 'bash' });
  state = applyEvent(state, { type: 'question', sessionId: 's1', id: 'q1', text: 'Posso?' });
  assert.equal(personView(state, 's1').emoji, '❓');
  let state2 = office();
  state2 = applyEvent(state2, { type: 'question', sessionId: 's1', id: 'q1', text: 'Posso?' });
  state2 = applyEvent(state2, { type: 'approval', sessionId: 's1', id: 'a1', toolName: 'bash' });
  assert.equal(personView(state2, 's1').emoji, '❓');
});

test('precedência: ❓ e ⚖️ vencem erro e ferramenta', () => {
  let state = office();
  state = applyEvent(state, { type: 'tool', sessionId: 's1', phase: 'call', name: 'bash' });
  state = applyEvent(state, { type: 'turn/end', sessionId: 's1', kind: 'error' });
  let v = personView(state, 's1');
  assert.equal(v.status, 'error');
  assert.equal(v.emoji, '⚠️'); /* erro vence o sinal de ferramenta */
  state = applyEvent(state, { type: 'question', sessionId: 's1', id: 'q1', text: 'Continuo?' });
  assert.equal(personView(state, 's1').emoji, '❓');
  assert.equal(personView(state, 's1').expression, 'waiting');
});

test('ferramentas: 🔧 por omissão, 🔍 para leitura/pesquisa, ❓ e ⚖️ acima', () => {
  let state = office();
  state = applyEvent(state, { type: 'tool', sessionId: 's1', phase: 'call', name: 'bash' });
  assert.equal(personView(state, 's1').emoji, '🔧');
  dentroDoPool(personView(state, 's1').expression, 'tool', 'ferramenta a correr');
  state = applyEvent(state, { type: 'tool', sessionId: 's1', phase: 'call', name: 'read_file' });
  assert.equal(personView(state, 's1').emoji, '🔍');
  state = applyEvent(state, { type: 'tool', sessionId: 's1', phase: 'call', name: 'search_src' });
  assert.equal(personView(state, 's1').emoji, '🔍');
  state = applyEvent(state, { type: 'question', sessionId: 's1', id: 'q1', text: 'E agora?' });
  assert.equal(personView(state, 's1').emoji, '❓'); /* pergunta vence a ferramenta */
  state = applyEvent(state, { type: 'question/answered', sessionId: 's1', id: 'q1' });
  state = applyEvent(state, { type: 'approval', sessionId: 's1', id: 'a1', toolName: 'bash' });
  assert.equal(personView(state, 's1').emoji, '⚖️'); /* aprovação vence a ferramenta */
});

test('tool/result ok volta ao estado de trabalho; ok:false vira erro ⚠️', () => {
  let state = office();
  state = applyEvent(state, { type: 'status', sessionId: 's1', status: 'running' });
  state = applyEvent(state, { type: 'tool', sessionId: 's1', phase: 'call', name: 'bash' });
  assert.equal(personView(state, 's1').emoji, '🔧');
  state = applyEvent(state, { type: 'tool', sessionId: 's1', phase: 'result', name: 'bash', ok: true });
  let v = personView(state, 's1');
  assert.equal(v.emoji, '📝');
  assert.deepEqual(v.outputs[0], { kind: 'tool', text: 'bash', ok: true });
  /* resultado sem ok explícito conta como sucesso */
  state = applyEvent(state, { type: 'tool', sessionId: 's1', phase: 'result', name: 'ls', ok: undefined });
  v = personView(state, 's1');
  assert.equal(v.outputs[0].ok, true);
  /* falha da ferramenta sinaliza erro */
  state = applyEvent(state, { type: 'tool', sessionId: 's1', phase: 'result', name: 'deploy', ok: false });
  v = personView(state, 's1');
  assert.equal(v.status, 'error');
  assert.equal(v.emoji, '⚠️');
  assert.equal(v.expression, 'error');
  assert.equal(v.outputs[0].ok, false);
});

test('retry mostra 🔄 e compaction mostra 📦; ambos são transitórios', () => {
  let state = office();
  state = applyEvent(state, { type: 'status', sessionId: 's1', status: 'running' });
  state = applyEvent(state, { type: 'compaction', sessionId: 's1', phase: 'start' });
  let v = personView(state, 's1');
  assert.equal(v.emoji, '📦');
  assert.equal(v.emojiLabel, 'Compactando contexto');
  state = applyEvent(state, { type: 'compaction', sessionId: 's1', phase: 'end' });
  assert.equal(personView(state, 's1').emoji, '📝'); /* volta ao trabalho */
  state = applyEvent(state, { type: 'retry', sessionId: 's1' });
  v = personView(state, 's1');
  assert.equal(v.emoji, '🔄'); /* retry vence o emoji de trabalho */
  state = applyEvent(state, { type: 'turn/end', sessionId: 's1', kind: 'completed' });
  v = personView(state, 's1');
  assert.equal(v.emoji, '✅'); /* fim de turno limpa retry e compaction */
  assert.equal(v.status, 'done');
});

/* ------------------------------------------------------------------ */
/* Subagentes                                                          */
/* ------------------------------------------------------------------ */

test('subagent/start mostra 🤝 (mesmo ocioso); subagent/end encerra', () => {
  let state = office();
  state = applyEvent(state, { type: 'subagent/start', sessionId: 's1', childId: 'c1', runId: 'r1', local: false });
  let v = personView(state, 's1');
  assert.equal(v.emoji, '🤝');
  assert.equal(v.emojiLabel, 'Coordenando subagentes');
  assert.deepEqual(v.subagents, [{ childId: 'c1', runId: 'r1', local: false }]);
  /* end sem par correspondente é ignorado */
  state = applyEvent(state, { type: 'subagent/end', sessionId: 's1', childId: 'c1', runId: 'r2', stopReason: 'completed' });
  v = personView(state, 's1');
  assert.equal(v.subagents.length, 1);
  assert.equal(v.outputs.length, 0);
  state = applyEvent(state, { type: 'subagent/end', sessionId: 's1', childId: 'c1', runId: 'r1', stopReason: 'completed' });
  v = personView(state, 's1');
  assert.deepEqual(v.subagents, []);
  assert.equal(v.emoji, '💤');
  assert.deepEqual(v.outputs[0], { kind: 'subagent', text: 'Subagente c1 terminou (completed)' });
  assert.equal(v.outputs[0].text.startsWith('Subagente c1'), true);
});

test('subagent/start repetido com o mesmo runId substitui a entrada', () => {
  let state = office();
  state = applyEvent(state, { type: 'subagent/start', sessionId: 's1', childId: 'c1', runId: 'r1', local: true });
  state = applyEvent(state, { type: 'subagent/start', sessionId: 's1', childId: 'c1', runId: 'r1', local: false });
  const v = personView(state, 's1');
  assert.equal(v.subagents.length, 1);
  assert.equal(v.subagents[0].local, false);
});

/* ------------------------------------------------------------------ */
/* CTX e modelo                                                        */
/* ------------------------------------------------------------------ */

test('ctx: sem dados → null; projectedTokens + contextWindow → razão', () => {
  let state = office();
  assert.equal(personView(state, 's1').ctx, null);
  state = applyEvent(state, {
    type: 'model', sessionId: 's1', provider: 'openrouter-extra',
    model: 'deepseek/deepseek-v4-flash-0731', contextWindow: 100000, projectedTokens: 24000
  });
  let v = personView(state, 's1');
  assert.deepEqual(v.ctx, { used: 24000, window: 100000, ratio: 0.24 });
  assert.deepEqual(v.model, {
    provider: 'openrouter-extra', model: 'deepseek/deepseek-v4-flash-0731', contextWindow: 100000
  });
  /* pressureTokens é o fallback quando projectedTokens não vem */
  state = applyEvent(state, { type: 'model', sessionId: 's1', pressureTokens: 5000 });
  v = personView(state, 's1');
  assert.equal(v.ctx.used, 5000);
  assert.equal(v.ctx.window, 100000); /* janela é last-wins independente */
  assert.equal(v.ctx.ratio, 0.05);
});

test('ctx: só contextWindow deixa used/ratio null; só tokens deixa window null', () => {
  let state = office();
  state = applyEvent(state, { type: 'model', sessionId: 's1', contextWindow: 200000 });
  assert.deepEqual(personView(state, 's1').ctx, { used: null, window: 200000, ratio: null });
  let state2 = office();
  state2 = applyEvent(state2, { type: 'model', sessionId: 's1', projectedTokens: 3000 });
  assert.deepEqual(personView(state2, 's1').ctx, { used: 3000, window: null, ratio: null });
});

/* ------------------------------------------------------------------ */
/* Custo                                                               */
/* ------------------------------------------------------------------ */

test('custo: sem preço → null; com preço acumula deltas (período sem preço não é cobrado)', () => {
  let state = office();
  state = applyEvent(state, {
    type: 'usage', sessionId: 's1', model: 'deepseek-chat',
    uncachedInput: 10, output: 5, cacheRead: 4, cacheWrite: 2
  });
  assert.equal(personView(state, 's1').cost, null); /* custo indisponível */
  state = setPrices(state, PRECO);
  assert.equal(personView(state, 's1').cost, null); /* passado não é reescrito */
  /* período com preço: só os deltas desde o último uso (o período sem preço não conta) */
  state = applyEvent(state, {
    type: 'usage', sessionId: 's1', model: 'deepseek-chat',
    uncachedInput: 14, output: 7, cacheRead: 5, cacheWrite: 3
  });
  assert.equal(personView(state, 's1').cost, 4 * 2 + 2 * 3 + 1 * 0.5 + 1 * 1); /* 15.5 */
  state = applyEvent(state, {
    type: 'usage', sessionId: 's1', model: 'deepseek-chat',
    uncachedInput: 16, output: 9, cacheRead: 3, cacheWrite: 3
  });
  assert.equal(personView(state, 's1').cost, 15.5 + 2 * 2 + 2 * 3); /* 25.5; cacheRead 5→3 não dá negativo */
  /* estado fresco com preço desde o início: a entrada inteira conta como delta */
  let estadoComPreco = setPrices(office(), PRECO);
  estadoComPreco = applyEvent(estadoComPreco, {
    type: 'usage', sessionId: 's1', model: 'deepseek-chat',
    uncachedInput: 10, output: 5, cacheRead: 4, cacheWrite: 2
  });
  assert.equal(personView(estadoComPreco, 's1').cost, 39);
  /* modelo sem preço → custo indisponível outra vez */
  estadoComPreco = applyEvent(estadoComPreco, {
    type: 'usage', sessionId: 's1', model: 'gpt-desconhecido',
    uncachedInput: 20, output: 10, cacheRead: 5, cacheWrite: 5
  });
  assert.equal(personView(estadoComPreco, 's1').cost, null);
  /* bucket sem preço conta como zero */
  let state3 = office();
  state3 = setPrices(state3, { m: { input: 1 } });
  state3 = applyEvent(state3, { type: 'usage', sessionId: 's1', model: 'm', uncachedInput: 3, output: 2 });
  assert.equal(personView(state3, 's1').cost, 3);
});

test('setPrices devolve estado novo e não toca no estado original', () => {
  const state = office();
  const depois = setPrices(state, PRECO);
  assert.notEqual(depois, state);
  assert.deepEqual(state.prices, {});
  assert.deepEqual(depois.prices, PRECO);
});

test('anti-dupla-contagem: eventos herdados (seq < inheritedEventCount) não custam', () => {
  let state = setPrices(office(), PRECO);
  /* delta herdado: o pai já o contou; o snapshot avança mesmo assim */
  state = applyEvent(state, {
    type: 'usage', sessionId: 's1', model: 'deepseek-chat',
    uncachedInput: 10, output: 4, cacheRead: 1, cacheWrite: 1,
    seq: 5, inheritedEventCount: 8
  });
  assert.equal(personView(state, 's1').cost, null);
  /* primeiro delta próprio parte do snapshot herdado: 4,2,1,0 */
  state = applyEvent(state, {
    type: 'usage', sessionId: 's1', model: 'deepseek-chat',
    uncachedInput: 14, output: 6, cacheRead: 2, cacheWrite: 1,
    seq: 9, inheritedEventCount: 8
  });
  assert.equal(personView(state, 's1').cost, 4 * 2 + 2 * 3 + 1 * 0.5); /* 14.5 */
  /* evento sem seq/inheritedEventCount é contado normalmente */
  state = applyEvent(state, {
    type: 'usage', sessionId: 's1', model: 'deepseek-chat',
    uncachedInput: 16, output: 6, cacheRead: 2, cacheWrite: 2
  });
  assert.equal(personView(state, 's1').cost, 14.5 + 2 * 2 + 1); /* 19.5 */
});

/* ------------------------------------------------------------------ */
/* Expressão derivada e override                                       */
/* ------------------------------------------------------------------ */

test('expressão derivada completa: bases fortes + variante sorteada do pool do evento', () => {
  const casos = [
    [{ type: 'status', sessionId: 's1', status: 'running' }, 'working'],
    [{ type: 'tool', sessionId: 's1', phase: 'call', name: 'bash' }, 'tool'],
    [{ type: 'question', sessionId: 's1', id: 'q1', text: 'Posso?' }, 'waiting'],
    [{ type: 'turn/end', sessionId: 's1', kind: 'completed' }, 'success'],
    [{ type: 'turn/end', sessionId: 's1', kind: 'error' }, 'error']
  ];
  for (const [evento, esperado] of casos) {
    const state = office();
    const depois = applyEvent(state, evento);
    // Os eventos de trabalho disparam SORTEIOS dentro do pool do estado — a
    // asserção é de POOL; as bases ('working'/'waiting') estão nos seus pools.
    dentroDoPool(personView(depois, 's1').expression, esperado, `após ${evento.type}`);
  }
  assert.equal(personView(office(), 's1').expression, 'idle');
  const comAprovacao = applyEvent(office(), { type: 'approval', sessionId: 's1', id: 'a1', toolName: 'bash' });
  assert.equal(personView(comAprovacao, 's1').expression, 'waiting');
});

test('override de expressão via campo opcional expression (null limpa)', () => {
  let state = office();
  state = applyEvent(state, { type: 'status', sessionId: 's1', status: 'running', expression: 'approval' });
  let v = personView(state, 's1');
  assert.equal(v.expression, 'approval');
  assert.equal(v.emoji, '📝'); /* o emoji não é afetado pelo override */
  state = applyEvent(state, { type: 'status', sessionId: 's1', status: 'running', expression: null });
  assert.equal(personView(state, 's1').expression, 'working');
});

/* ------------------------------------------------------------------ */
/* Outputs, mesas e alertas                                            */
/* ------------------------------------------------------------------ */

test('outputs: mais recente primeiro, buffer limitado a 6 entradas', () => {
  let state = office();
  for (let i = 1; i <= 7; i += 1) {
    state = applyEvent(state, { type: 'tool', sessionId: 's1', phase: 'result', name: `ferramenta-${i}`, ok: true });
  }
  const v = personView(state, 's1');
  assert.equal(v.outputs.length, 6);
  assert.equal(v.outputs[0].text, 'ferramenta-7');
  assert.equal(v.outputs[5].text, 'ferramenta-2');
});

test('officeView: mesas por workspaceId e alertas de perguntas/aprovações', () => {
  let state = office();
  state = applyEvent(state, { type: 'session/added', sessionId: 's2' });
  let view = officeView(state);
  assert.deepEqual(view.people.map((p) => p.id), ['s1', 's2']);
  assert.deepEqual(view.teams, [
    { id: 'm1', label: 'm1', people: ['s1'] },
    { id: 'solo', label: 'Solo', people: ['s2'] }
  ]);
  assert.deepEqual(view.alerts, []);
  /* uma pergunta em s1 */
  state = applyEvent(state, { type: 'question', sessionId: 's1', id: 'q1', text: 'Posso?' });
  view = officeView(state);
  assert.deepEqual(view.alerts, [{ id: 'questions', level: 'info', message: '1 pergunta a aguardar resposta' }]);
  /* uma aprovação em s2 e duas perguntas */
  state = applyEvent(state, { type: 'approval', sessionId: 's2', id: 'a1', toolName: 'bash' });
  state = applyEvent(state, { type: 'question', sessionId: 's2', id: 'q2', text: 'E eu?' });
  view = officeView(state);
  assert.deepEqual(view.alerts, [
    { id: 'questions', level: 'info', message: '2 perguntas a aguardar resposta' },
    { id: 'approvals', level: 'warning', message: '1 aprovação a aguardar decisão' }
  ]);
});

/* ------------------------------------------------------------------ */
/* Pureza                                                              */
/* ------------------------------------------------------------------ */

test('applyEvent é puro: estado de entrada nunca é mutado', () => {
  const estado = office([
    { type: 'question', sessionId: 's1', id: 'q1', text: 'Posso?' },
    { type: 'approval', sessionId: 's1', id: 'a1', toolName: 'bash' }
  ]);
  const antes = structuredClone(estado);
  const eventos = [
    { type: 'status', sessionId: 's1', status: 'running' },
    { type: 'tool', sessionId: 's1', phase: 'call', name: 'bash' },
    { type: 'usage', sessionId: 's1', model: 'deepseek-chat', uncachedInput: 3 },
    { type: 'turn/end', sessionId: 's1', kind: 'completed' },
    { type: 'session/added', sessionId: 's2' }
  ];
  let depois = estado;
  for (const e of eventos) depois = applyEvent(depois, e);
  assert.notEqual(depois, estado);
  assert.deepEqual(estado, antes);
  assert.equal(personView(estado, 's1').question.id, 'q1'); /* a pergunta original ficou intacta */
});

test('personView devolve cópias: mudar a vista não corrompe o estado', () => {
  const state = office([
    { type: 'approval', sessionId: 's1', id: 'a1', toolName: 'bash' },
    { type: 'subagent/start', sessionId: 's1', childId: 'c1', runId: 'r1', local: true }
  ]);
  const v = personView(state, 's1');
  v.approvals.length = 0;
  v.subagents.length = 0;
  v.outputs.push({ faz: 'lixo' });
  const limpo = personView(state, 's1');
  assert.deepEqual(limpo.approvals.map((a) => a.id), ['a1']);
  assert.deepEqual(limpo.subagents.map((s) => s.runId), ['r1']);
  assert.deepEqual(limpo.outputs, []);
});