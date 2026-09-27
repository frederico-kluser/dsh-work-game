/*
 * tests/plugin/adapter.test.mjs — fixtures DSH simuladas por tipo de evento
 * para dsh-plugin/src/adapter.js (secção 3 de docs/contratos-plugin.md).
 *
 * Executar a partir da raiz do projeto:
 *   node --test tests/plugin/adapter.test.mjs
 *
 * As fixtures espelham os payloads REAIS verificados no checkout
 * deepseek-harness (0.1.6-alpha.2, ddefc45): user-questions/request e
 * approval/request (waterfall/runtime), approval/asked|decided, turn/end
 * (reason.kind), agent/status, tool/call|result, subagent/start|end
 * (SubagentRunInfo/EndInfo), request/header|context, llm/retry-started,
 * compaction/start|end e a projeção acumulada tokenUsage.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAdapter } from '../../dsh-plugin/src/adapter.js'
import * as adapterModule from '../../dsh-plugin/src/adapter.js'

/* ------------------------------------------------------------------ */
/* Infraestrutura mínima                                               */
/* ------------------------------------------------------------------ */

/*
 * Fonte simulada do DSH: implementa a superfície consumida pelo adaptador
 * (sessions.list/on/waterfall + projections.tokenUsage/subscribe/
 * deriveTurnTokenUsage) e permite injetar eventos por tipo:
 *   fonte.emit(nome, payload)          — eventos duráveis e projeção
 *   fonte.emitWaterfall(nome, payload) — canais runtime (devolve a promessa)
 *   fonte.useUsage(sessionId, snapshot) — atalho p/ 'tokenUsage'
 *   fonte.setTurnUsage(sessionId, dados) — atalho p/ deriveTurnTokenUsage
 * `projecoes: { uso: {sid: snapshot}, turno: {sid: TurnTokenUsage} }` semeia
 * o estado inicial das projeções (para testar a linha de base do custo).
 */
function createSource({ sessions: seed = [], projections: seedProjections = {} } = {}) {
  const usage = new Map(Object.entries(seedProjections.uso ?? {}))
  const perTurn = new Map(Object.entries(seedProjections.turno ?? {}))
  const onChannels = new Map()        // sessions.on
  const waterfallChannels = new Map() // sessions.waterfall
  const projectionChannels = new Map() // projections.subscribe
  const register = (map, name, handler) => {
    let set = map.get(name)
    if (!set) { set = new Set(); map.set(name, set) }
    set.add(handler)
    return () => set.delete(handler)
  }
  const sessions = {
    list: () => seed,
    on: (name, handler) => register(onChannels, name, handler),
    waterfall: (name, handler) => register(waterfallChannels, name, handler),
  }
  const projections = {
    tokenUsage: (sessionId) => usage.get(sessionId) ?? null,
    deriveTurnTokenUsage: (sessionId) => perTurn.get(sessionId) ?? null,
    subscribe: (name, handler) => register(projectionChannels, name, handler),
  }
  const source = {
    sessions,
    projections,
    emit(name, payload) {
      for (const handler of projectionChannels.get(name) ?? []) handler(payload)
      for (const handler of onChannels.get(name) ?? []) handler(payload)
      return undefined
    },
    emitWaterfall(name, payload) {
      return [...(waterfallChannels.get(name) ?? [])][0](payload)
    },
    useUsage(sessionId, snapshot) { source.emit('tokenUsage', { sessionId, snapshot }) },
    setTurnUsage(sessionId, data) { perTurn.set(sessionId, data) },
  }
  return source
}

function setup(options = {}) {
  const events = []
  const source = createSource(options)
  const adapter = createAdapter({
    onEvent: (event) => events.push(event),
    sessions: source.sessions,
    projections: source.projections,
  })
  return { adapter, source, events }
}

/* ------------------------------------------------------------------ */
/* Contrato do módulo e validação                                      */
/* ------------------------------------------------------------------ */

test('contrato: o módulo exporta apenas createAdapter', () => {
  assert.deepEqual(Object.keys(adapterModule), ['createAdapter'])
})

test('createAdapter: exige onEvent, sessions e projections (fail loud)', () => {
  assert.throws(() => createAdapter({}), /onEvent/)
  assert.throws(() => createAdapter({ onEvent() {} }), /sessions\.list/)
  assert.throws(
    () => createAdapter({ onEvent() {}, sessions: { list() {}, on() {} } }),
    /sessions\.waterfall/,
  )
  assert.throws(
    () => createAdapter({ onEvent() {}, sessions: { list() {}, on() {}, waterfall() {} } }),
    /projections\.tokenUsage/,
  )
})

/* ------------------------------------------------------------------ */
/* Catálogo de sessões                                                 */
/* ------------------------------------------------------------------ */

test('session/added: catálogo inicial, campos opcionais e dedupe', () => {
  const { adapter, source, events } = setup({
    sessions: [
      { sessionId: 's1', workspaceId: 'w1', model: 'deepseek/deepseek-v4-flash-0731' },
      { sessionId: 's2' },
    ],
  })
  adapter.start()
  // repetição ao vivo de uma sessão já conhecida: dedupe, sem evento novo
  source.emit('session/added', { sessionId: 's1', workspaceId: 'w1', model: 'outro' })
  // sessão nova nascida ao vivo: entra com o que o catálogo trouxer
  source.emit('session/added', { sessionId: 's3', workspaceId: 'w2' })
  assert.deepEqual(events, [
    { type: 'session/added', sessionId: 's1', workspaceId: 'w1', model: 'deepseek/deepseek-v4-flash-0731' },
    { type: 'session/added', sessionId: 's2' },
    { type: 'session/added', sessionId: 's3', workspaceId: 'w2' },
  ])
})

test('session/removed: emite, limpa e repetida é no-op', () => {
  const { adapter, source, events } = setup({ sessions: [{ sessionId: 's1' }] })
  adapter.start()
  events.length = 0
  source.emit('session/removed', { sessionId: 's1' })
  assert.deepEqual(events, [{ type: 'session/removed', sessionId: 's1' }])
  source.emit('session/removed', { sessionId: 's1' }) // já foi: silêncio
  source.emit('session/removed', { sessionId: 'desconhecida' })
  assert.equal(events.length, 1)
})

/* ------------------------------------------------------------------ */
/* Estados e fim de turno                                              */
/* ------------------------------------------------------------------ */

test('agent/status: idle/running passam tal qual', () => {
  const { adapter, source, events } = setup({ sessions: [{ sessionId: 's1' }] })
  adapter.start()
  events.length = 0
  source.emit('agent/status', { sessionId: 's1', status: 'running' })
  source.emit('agent/status', { sessionId: 's1', status: 'idle' })
  assert.deepEqual(events, [
    { type: 'status', sessionId: 's1', status: 'running' },
    { type: 'status', sessionId: 's1', status: 'idle' },
  ])
})

test('turn/end: reason.kind mapeia o vocabulário fechado; desconhecido ⇒ error', () => {
  const casos = [
    ['completed', 'completed'],
    ['aborted', 'aborted'],
    ['blocked', 'blocked'],
    ['error', 'error'],
    ['max-tokens', 'max-tokens'],
    ['interrupted', 'interrupted'],
  ]
  for (const [entrada, saida] of casos) {
    const { adapter, source, events } = setup()
    adapter.start()
    source.emit('turn/end', { sessionId: 's1', turn: 1, reason: { kind: entrada } })
    assert.deepEqual(events, [{ type: 'turn/end', sessionId: 's1', kind: saida }])
  }
  // a causa interna de um aborted (user/parent/hook/…) fica escondida
  const { adapter, source, events } = setup()
  adapter.start()
  source.emit('turn/end', { sessionId: 's1', turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } })
  source.emit('turn/end', { sessionId: 's1', turn: 3, reason: { kind: 'plano-b' } }) // plugado
  source.emit('turn/end', { sessionId: 's1', turn: 4, reason: {} })                  // sem reason
  assert.deepEqual(events, [
    { type: 'turn/end', sessionId: 's1', kind: 'aborted' },
    { type: 'turn/end', sessionId: 's1', kind: 'error' },
    { type: 'turn/end', sessionId: 's1', kind: 'error' },
  ])
})

/* ------------------------------------------------------------------ */
/* Ferramentas e subagentes                                            */
/* ------------------------------------------------------------------ */

test('tool/call + tool/result: pareiam por callId e derivam ok', () => {
  const { adapter, source, events } = setup({ sessions: [{ sessionId: 's1' }] })
  adapter.start()
  events.length = 0
  source.emit('tool/call', { sessionId: 's1', turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{}' })
  source.emit('tool/result', { sessionId: 's1', turn: 1, step: 1, callId: 'c1', message: {} })
  source.emit('tool/result', { sessionId: 's1', turn: 1, step: 1, callId: 'c1', message: {}, error: { name: 'E', code: 'X' } })
  assert.deepEqual(events, [
    { type: 'tool', sessionId: 's1', phase: 'call', name: 'bash' },
    { type: 'tool', sessionId: 's1', phase: 'result', name: 'bash', ok: true },
    { type: 'tool', sessionId: 's1', phase: 'result', name: 'bash', ok: false },
  ])
})

test('subagent/start|end: childId/runId/local/stopReason; local false = telemetria indisponível', () => {
  const { adapter, source, events } = setup({ sessions: [{ sessionId: 'pai' }] })
  adapter.start()
  events.length = 0
  source.emit('subagent/start', { sessionId: 'pai', runId: 'r1', provider: 'openrouter-extra', id: 'filho1', local: true })
  source.emit('subagent/end', { sessionId: 'pai', runId: 'r1', provider: 'openrouter-extra', id: 'filho1', local: true, stopReason: 'completed' })
  // filho remoto: local:false passa tal qual — a UI mostra "telemetria
  // indisponível" e o adaptador nunca inventa dados para a sessão remota.
  source.emit('subagent/start', { sessionId: 'pai', runId: 'r2', provider: 'acme', id: 'filho2', local: false })
  source.emit('subagent/end', { sessionId: 'pai', runId: 'r2', provider: 'acme', id: 'filho2', local: false, stopReason: 'error' })
  assert.deepEqual(events, [
    { type: 'subagent/start', sessionId: 'pai', childId: 'filho1', runId: 'r1', local: true },
    { type: 'subagent/end', sessionId: 'pai', childId: 'filho1', runId: 'r1', stopReason: 'completed' },
    { type: 'subagent/start', sessionId: 'pai', childId: 'filho2', runId: 'r2', local: false },
    { type: 'subagent/end', sessionId: 'pai', childId: 'filho2', runId: 'r2', stopReason: 'error' },
  ])
})

/* ------------------------------------------------------------------ */
/* Perguntas e aprovações (waterfall/runtime)                          */
/* ------------------------------------------------------------------ */

test('user-questions/request: captura ao vivo e responde o waterfall', async () => {
  const { adapter, source, events } = setup({ sessions: [{ sessionId: 's1' }] })
  adapter.start()
  events.length = 0
  const pending = source.emitWaterfall('user-questions/request', {
    sessionId: 's1',
    questions: [
      { id: 'q1', question: 'Seguir?', options: [{ label: 'Sim' }, { label: 'Não', description: 'cancela' }] },
      {
        id: 'q2',
        question: 'Cor?',
        multiSelect: true,
        detail: 'só visual',
        header: 'Escolha',
        intent: { kind: 'plan-review', approve: 'Sim' },
      },
    ],
  })
  // só os campos do contrato vazam (detail/header/intent ficam no DSH)
  assert.deepEqual(events, [
    { type: 'question', sessionId: 's1', id: 'q1', text: 'Seguir?', options: [{ label: 'Sim' }, { label: 'Não', description: 'cancela' }] },
    { type: 'question', sessionId: 's1', id: 'q2', text: 'Cor?', multiSelect: true },
  ])
  // id desconhecido com lote ativo: erro claro
  assert.throws(() => adapter.answer({ sessionId: 's1', id: 'fantasma', selected: [] }), /desconhecida/)
  adapter.answer({ sessionId: 's1', id: 'q1', selected: ['Sim'] })
  assert.deepEqual(events[2], { type: 'question/answered', sessionId: 's1', id: 'q1' })
  // duplo clique: segunda resposta à mesma pergunta é no-op
  adapter.answer({ sessionId: 's1', id: 'q1', selected: ['Sim'] })
  assert.equal(events.length, 3)
  adapter.answer({ sessionId: 's1', id: 'q2', selected: ['azul'], custom: 'verde-água' })
  const resposta = await pending
  assert.deepEqual(resposta, {
    answers: [
      { id: 'q1', selected: ['Sim'] },
      { id: 'q2', selected: ['azul'], custom: 'verde-água' },
    ],
  })
  assert.deepEqual(events[3], { type: 'question/answered', sessionId: 's1', id: 'q2' })
  // responder a perguntas que já não existem (lote fechado): erro claro
  assert.throws(() => adapter.answer({ sessionId: 's1', id: 'q1', selected: [] }), /pendente/)
})

test('user-questions/request: lote vazio responde logo; aborto remove sem responder', async () => {
  const { adapter, source } = setup({ sessions: [{ sessionId: 's1' }] })
  adapter.start()
  const vazio = source.emitWaterfall('user-questions/request', { sessionId: 's1', questions: [] })
  assert.deepEqual(await vazio, { answers: [] })
  // aborto (ASK_ABORTED): a pergunta sai de cena e nunca é respondida
  const control = new AbortController()
  source.emitWaterfall('user-questions/request', {
    sessionId: 's1',
    questions: [{ id: 'q1', question: 'Seguir?' }],
    signal: control.signal,
  })
  control.abort()
  assert.throws(() => adapter.answer({ sessionId: 's1', id: 'q1', selected: [] }), /pendente/)
})

test('approval: asked/decided duráveis + waterfall devolve outcome fechado', async () => {
  const { adapter, source, events } = setup({ sessions: [{ sessionId: 's1' }] })
  adapter.start()
  events.length = 0
  source.emit('approval/asked', { sessionId: 's1', id: 'ap1', toolName: 'bash', callId: 'c9', reason: 'permite escrever' })
  source.emit('approval/decided', { sessionId: 's1', id: 'ap1', outcome: 'allowed-once' })
  // pedido sem callId/reason: os campos opcionais ficam de fora
  source.emit('approval/asked', { sessionId: 's1', id: 'ap2', toolName: 'read' })
  // waterfall: a decisão da UI devolve o outcome ao DSH
  const pending = source.emitWaterfall('approval/request', {
    sessionId: 's1',
    agent: { id: 's1' },
    toolName: 'bash',
    callId: 'c9',
    reason: 'permite escrever',
  })
  adapter.decide({ sessionId: 's1', outcome: 'rejected' })
  assert.equal(await pending, 'rejected')
  assert.deepEqual(events, [
    { type: 'approval', sessionId: 's1', id: 'ap1', toolName: 'bash', callId: 'c9', reason: 'permite escrever' },
    { type: 'approval/decided', sessionId: 's1', id: 'ap1', outcome: 'allowed-once' },
    { type: 'approval', sessionId: 's1', id: 'ap2', toolName: 'read' },
  ])
  assert.throws(() => adapter.decide({ sessionId: 's1', outcome: 'talvez' }), /inválido/)
  assert.throws(() => adapter.decide({ sessionId: 's2', outcome: 'rejected' }), /pendente/)
})

/* ------------------------------------------------------------------ */
/* Custo, modelo, retentativas e compactação                           */
/* ------------------------------------------------------------------ */

test('usage: deltas por sessão com linha de base e atribuição por turno', () => {
  const { adapter, source, events } = setup({
    sessions: [{ sessionId: 's1' }],
    projections: {
      // já gasto antes do arranque: serve de linha de base, nunca é delta
      uso: { s1: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5 } },
    },
  })
  adapter.start()
  assert.equal(events.length, 1) // só session/added — arranque não emite usage
  source.setTurnUsage('s1', {
    uncachedInputTokens: 200, outputTokens: 120, totalTokens: 320,
    cacheReadTokens: 40, cacheWriteTokens: 20,
    routes: [{ provider: 'openrouter-extra', model: 'deepseek/deepseek-v4-flash-0731' }],
  })
  source.useUsage('s1', { uncachedInputTokens: 300, outputTokens: 150, cacheReadTokens: 30, cacheWriteTokens: 10 })
  assert.deepEqual(events[1], {
    type: 'usage',
    sessionId: 's1',
    provider: 'openrouter-extra',
    model: 'deepseek/deepseek-v4-flash-0731',
    uncachedInput: 200, output: 100, cacheRead: 20, cacheWrite: 5,
  })
  source.useUsage('s1', { uncachedInputTokens: 300, outputTokens: 150, cacheReadTokens: 30, cacheWriteTokens: 10 })
  assert.equal(events.length, 2) // delta zero: silêncio
  source.useUsage('s1', { uncachedInputTokens: 400, outputTokens: 160, cacheReadTokens: 35, cacheWriteTokens: 12 })
  assert.deepEqual(events[2], {
    type: 'usage',
    sessionId: 's1',
    provider: 'openrouter-extra',
    model: 'deepseek/deepseek-v4-flash-0731',
    uncachedInput: 100, output: 10, cacheRead: 5, cacheWrite: 2,
  })
})

test('usage: sem atribuição a base fica parada e o delta chega com a rota', () => {
  const { adapter, source, events } = setup({ sessions: [{ sessionId: 's2' }] })
  adapter.start()
  events.length = 0
  // sem routes por turno nem modelo conhecido: base fixada, nada emitido
  source.useUsage('s2', { uncachedInputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 })
  assert.equal(events.length, 0)
  source.emit('request/header', {
    sessionId: 's2',
    reason: 'initial',
    header: { config: { provider: 'p', model: 'm' } },
  })
  assert.deepEqual(events[0], { type: 'model', sessionId: 's2', provider: 'p', model: 'm' })
  // o próximo gasto atribui o delta ACUMULADO desde a base — nada se perde
  source.useUsage('s2', { uncachedInputTokens: 150, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 })
  assert.deepEqual(events[1], {
    type: 'usage', sessionId: 's2', provider: 'p', model: 'm',
    uncachedInput: 50, output: 10, cacheRead: 0, cacheWrite: 0,
  })
})

test('model: request/header define a rota; request/context traz capacity (last-wins)', () => {
  const { adapter, source, events } = setup({ sessions: [{ sessionId: 's1' }] })
  adapter.start()
  events.length = 0
  source.emit('request/header', { sessionId: 's1', reason: 'initial', header: { config: { provider: 'p1', model: 'm1' } } })
  assert.deepEqual(events, [{ type: 'model', sessionId: 's1', provider: 'p1', model: 'm1' }])
  source.emit('request/context', { sessionId: 's1', provider: 'p1', model: 'm1', contextWindow: 131072 })
  assert.deepEqual(events[1], { type: 'model', sessionId: 's1', provider: 'p1', model: 'm1', contextWindow: 131072 })
  // mesmo contexto repetido: sem evento novo
  source.emit('request/context', { sessionId: 's1', provider: 'p1', model: 'm1', contextWindow: 131072 })
  assert.equal(events.length, 2)
  // troca de rota por header: mantém a capacidade antiga (trade-off do DSH)
  source.emit('request/header', { sessionId: 's1', reason: 'change', header: { config: { provider: 'p2', model: 'm2' } } })
  assert.deepEqual(events[2], { type: 'model', sessionId: 's1', provider: 'p2', model: 'm2', contextWindow: 131072 })
  // mudança de capacidade: novo evento
  source.emit('request/context', { sessionId: 's1', provider: 'p2', model: 'm2', contextWindow: 65536 })
  assert.deepEqual(events[3], { type: 'model', sessionId: 's1', provider: 'p2', model: 'm2', contextWindow: 65536 })
})

test('retry e compaction: sinais simples', () => {
  const { adapter, source, events } = setup({ sessions: [{ sessionId: 's1' }] })
  adapter.start()
  events.length = 0
  source.emit('llm/retry-started', { sessionId: 's1', retryId: 'r9', turn: 1, step: 2, retry: {} })
  source.emit('compaction/start', { sessionId: 's1', compactionId: 'c1', turn: 3 })
  source.emit('compaction/end', { sessionId: 's1', compactionId: 'c1', turn: 3 })
  assert.deepEqual(events, [
    { type: 'retry', sessionId: 's1' },
    { type: 'compaction', sessionId: 's1', phase: 'start' },
    { type: 'compaction', sessionId: 's1', phase: 'end' },
  ])
})

/* ------------------------------------------------------------------ */
/* Ciclo de vida                                                       */
/* ------------------------------------------------------------------ */

test('start/stop: idempotente, desliga e religa com reconciliação', () => {
  const { adapter, source, events } = setup({ sessions: [{ sessionId: 's1' }] })
  adapter.start()
  adapter.start() // segundo start é no-op
  assert.deepEqual(events, [{ type: 'session/added', sessionId: 's1' }])
  adapter.stop()
  events.length = 0
  source.emit('agent/status', { sessionId: 's1', status: 'running' })
  assert.equal(events.length, 0) // desligado: nada chega ao estado
  adapter.stop() // parar repetido é no-op
  adapter.start() // religar = reconciliação: novo snapshot completo
  assert.deepEqual(events, [{ type: 'session/added', sessionId: 's1' }])
  source.emit('agent/status', { sessionId: 's1', status: 'running' })
  assert.deepEqual(events[1], { type: 'status', sessionId: 's1', status: 'running' })
})