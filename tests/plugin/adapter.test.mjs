/*
 * tests/plugin/adapter.test.mjs — fixtures DSH por tipo de evento para
 * dsh-plugin/src/adapter.js (secção 3 de docs/contratos-plugin.md).
 *
 * Executar a partir da raiz do projeto:
 *   node --test tests/plugin/adapter.test.mjs
 *
 * As fixtures espelham a superfície REAL verificada no checkout
 * deepseek-harness (0.1.6-alpha.2, ddefc45): catálogo host
 * (sessions.list() → Session[] + session/created|disposed), firehose
 * session/event (session, event), agent/status {agent, status},
 * subagent/start|end (info, parent), waterfalls user-questions/request e
 * approval/request (payload, next), e o registry de projeções
 * (snapshot(session, keys?) + onChanged((session, key, value, seq))) com as
 * wire views reais tokenUsage/modelSelection/contextPressure.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAdapter } from '../../dsh-plugin/src/adapter.js'
import * as adapterModule from '../../dsh-plugin/src/adapter.js'

/* ------------------------------------------------------------------ */
/* Infraestrutura mínima                                               */
/* ------------------------------------------------------------------ */

/*
 * Fonte simulada do DSH (lado host). Superfície consumida:
 *   fonte.sessions.list()            → Session[] (objetos {id, header})
 *   fonte.sessions.on/waterfall      → subscrição por canal
 *   fonte.projections.snapshot/onChanged → registry de projeções
 * Atajos para injetar vida ao catálogo e à sessão:
 *   fonte.addSession({id})           — emite 'session/created'
 *   fonte.disposeSession(id)         — emite 'session/disposed'
 *   fonte.appendEvent(sessionId, data) — evento durável: dobra as projeções
 *                                        e emite 'session/event' (session, event)
 *   fonte.emit(name, ...args)        — canais runtime (agent/status, subagent/*)
 *   fonte.emitWaterfall(name, ...args) — waterfalls (handler(payload, next))
 * Semea inicial via `projections:` (por sessionId): tokenUsage {4 buckets},
 * modelSelection {lastUsed, pending}, contextPressure {contextWindow}.
 */
function createSource({ sessions: seed = [], projections: seedProjections = {} } = {}) {
  const live = seed.map((s) => ({ id: String(s.id), header: s.header ?? {} }))
  const logs = new Map()              // sessionId → SessionEvent[]
  const onChannels = new Map()        // sessions.on
  const waterfallChannels = new Map() // sessions.waterfall
  const register = (map, name, handler) => {
    let set = map.get(name)
    if (!set) { set = new Set(); map.set(name, set) }
    set.add(handler)
    return () => set.delete(handler)
  }
  const sessions = {
    list: () => live.slice(),
    on: (name, handler) => register(onChannels, name, handler),
    waterfall: (name, handler) => register(waterfallChannels, name, handler),
  }

  /* ---------- registry de projeções (folds reais simplificados) ---------- */

  const sameSelection = (a, b) => a === b || (a !== null && b !== null
    && a.provider === b.provider && a.model === b.model)

  const sameBuckets = (a, b) => a.uncachedInputTokens === b.uncachedInputTokens
    && a.outputTokens === b.outputTokens
    && a.cacheReadTokens === b.cacheReadTokens
    && a.cacheWriteTokens === b.cacheWriteTokens

  // tokenUsage: acumulado por settlement; llm/retry-started abre o slot de
  // substituição (espelho de usage-projection.ts).
  const foldTokenUsage = (state, event) => {
    if (event.type === 'llm/retry-started') {
      const { turn, step } = event.data
      if (state.last === null || state.last.turn !== turn || state.last.step !== step) return state
      return { ...state, last: null }
    }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return state
    const usage = event.data?.usage
    if (!usage) return state
    const { turn, step } = event.data
    const buckets = {
      uncachedInputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
    }
    const previous = state.last !== null && state.last.turn === turn && state.last.step === step
      ? state.last.buckets
      : undefined
    if (previous !== undefined && sameBuckets(previous, buckets)) return state
    const totals = {
      uncachedInputTokens: state.totals.uncachedInputTokens - (previous?.uncachedInputTokens ?? 0) + buckets.uncachedInputTokens,
      outputTokens: state.totals.outputTokens - (previous?.outputTokens ?? 0) + buckets.outputTokens,
      cacheReadTokens: state.totals.cacheReadTokens - (previous?.cacheReadTokens ?? 0) + buckets.cacheReadTokens,
      cacheWriteTokens: state.totals.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0) + buckets.cacheWriteTokens,
    }
    return { totals, last: { turn, step, buckets } }
  }

  // modelSelection: folds model/selection (pending) e request/header (lastUsed).
  const foldModelSelection = (state, event) => {
    if (event.type === 'model/selection') {
      const selected = { provider: event.data.provider, model: event.data.model }
      if (sameSelection(selected, state.pending)) return state
      return { lastUsed: state.lastUsed, pending: selected }
    }
    if (event.type !== 'request/header') return state
    const config = event.data?.header?.config
    if (!config?.provider || !config?.model) return state
    const lastUsed = { provider: config.provider, model: config.model }
    const pending = sameSelection(lastUsed, state.pending) ? null : state.pending
    if (sameSelection(lastUsed, state.lastUsed) && pending === state.pending) return state
    return { lastUsed, pending }
  }

  // contextPressure: capacidade last-wins via request/context (simplificado).
  const foldContextPressure = (state, event) => {
    if (event.type !== 'request/context') return state
    const window = event.data?.contextWindow
    if (window === undefined || window === state.contextWindow) return state
    return { contextWindow: window }
  }

  const wireTokenUsage = (t) => ({
    uncachedInputTokens: t.totals.uncachedInputTokens,
    outputTokens: t.totals.outputTokens,
    cacheReadTokens: t.totals.cacheReadTokens,
    cacheWriteTokens: t.totals.cacheWriteTokens,
  })
  const wireModelSelection = (s) => ({ lastUsed: s.lastUsed, next: s.pending ?? s.lastUsed })
  const wireContextPressure = (s) => s.contextWindow === undefined ? {} : { contextWindow: s.contextWindow }

  const states = new Map()    // sessionId → {tokenUsage, modelSelection, contextPressure}
  const prevViews = new Map() // sessionId → últimas wire views por chave
  const listeners = new Set()

  const stateOf = (session) => {
    const sid = session.id
    let st = states.get(sid)
    if (st === undefined) {
      const tu = seedProjections.tokenUsage?.[sid]
      const ms = seedProjections.modelSelection?.[sid]
      const cp = seedProjections.contextPressure?.[sid]
      st = {
        tokenUsage: {
          totals: {
            uncachedInputTokens: tu?.uncachedInputTokens ?? 0,
            outputTokens: tu?.outputTokens ?? 0,
            cacheReadTokens: tu?.cacheReadTokens ?? 0,
            cacheWriteTokens: tu?.cacheWriteTokens ?? 0,
          },
          last: null,
        },
        modelSelection: {
          lastUsed: ms?.lastUsed ?? null,
          pending: ms?.pending ?? null,
        },
        contextPressure: { contextWindow: cp?.contextWindow },
      }
      states.set(sid, st)
    }
    return st
  }

  const projections = {
    snapshot(session, keys) {
      const st = stateOf(session)
      const selected = keys === undefined ? null : new Set(keys)
      const values = {}
      if (selected === null || selected.has('tokenUsage')) {
        values.tokenUsage = wireTokenUsage(st.tokenUsage)
      }
      if (selected === null || selected.has('modelSelection')) {
        values.modelSelection = wireModelSelection(st.modelSelection)
      }
      if ((selected === null || selected.has('contextPressure')) && st.contextPressure.contextWindow !== undefined) {
        values.contextPressure = wireContextPressure(st.contextPressure)
      }
      return { asOfSeq: -1, values }
    },
    onChanged(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  // Uma dobra de evento notifica apenas as wire views que cambian por Object.is.
  const drive = (session, event) => {
    const st = stateOf(session)
    const sid = session.id
    const changes = []
    const consider = (key, next) => {
      if (next === st[key]) return
      st[key] = next
      const view = key === 'tokenUsage' ? wireTokenUsage(next)
        : key === 'modelSelection' ? wireModelSelection(next)
        : wireContextPressure(next)
      let prev = prevViews.get(sid)
      if (prev === undefined) { prev = {}; prevViews.set(sid, prev) }
      if (!Object.is(prev[key], view)) {
        prev[key] = view
        changes.push([key, view])
      }
    }
    consider('tokenUsage', foldTokenUsage(st.tokenUsage, event))
    consider('modelSelection', foldModelSelection(st.modelSelection, event))
    consider('contextPressure', foldContextPressure(st.contextPressure, event))
    for (const [key, value] of changes) {
      for (const listener of listeners) listener(session, key, value, event.seq)
    }
  }

  const source = {
    sessions,
    projections,
    addSession(partial) {
      const s = { id: String(partial.id), header: partial.header ?? {} }
      live.push(s)
      for (const handler of onChannels.get('session/created') ?? []) handler(s)
      return s
    },
    disposeSession(id) {
      const index = live.findIndex((s) => s.id === id)
      if (index === -1) return
      const [s] = live.splice(index, 1)
      for (const handler of onChannels.get('session/disposed') ?? []) handler(s)
    },
    appendEvent(sessionId, data) {
      const session = live.find((s) => s.id === sessionId) ?? { id: sessionId, header: {} }
      const prefix = logs.get(sessionId) ?? []
      const event = { type: data.type, seq: prefix.length, time: Date.now(), data: { ...data } }
      delete event.data.type
      logs.set(sessionId, [...prefix, event])
      drive(session, event)
      for (const handler of onChannels.get('session/event') ?? []) handler(session, event)
      return event
    },
    emit(name, ...args) {
      for (const handler of onChannels.get(name) ?? []) handler(...args)
    },
    emitWaterfall(name, ...args) {
      const handler = [...(waterfallChannels.get(name) ?? [])][0]
      const next = () => Promise.resolve({ answers: [] })
      if (!handler) return Promise.resolve({ answers: [] })
      return Promise.resolve(handler(...args, next))
    },
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

/* Signal falso com a superfície de AbortSignal que o adaptador usa. */
class FakeSignal {
  constructor() { this.aborted = false; this.listeners = new Set() }
  addEventListener(name, callback) { if (name === 'abort') this.listeners.add(callback) }
  removeEventListener(name, callback) { if (name === 'abort') this.listeners.delete(callback) }
  abort() {
    if (this.aborted) return
    this.aborted = true
    for (const callback of [...this.listeners]) callback()
    this.listeners.clear()
  }
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
    /projections\.snapshot/,
  )
  assert.throws(
    () => createAdapter({
      onEvent() {}, sessions: { list() {}, on() {}, waterfall() {} }, projections: { snapshot() {} },
    }),
    /projections\.onChanged/,
  )
})

/* ------------------------------------------------------------------ */
/* Catálogo de sessões                                                 */
/* ------------------------------------------------------------------ */

test('session/added: catálogo inicial (list), dedupe e sessão criada ao vivo', () => {
  const { adapter, source, events } = setup({ sessions: [{ id: 's1' }, { id: 's2' }] })
  adapter.start()
  // repetição ao vivo de uma sessão já conhecida: dedupe, sem evento novo
  source.addSession({ id: 's1' })
  // sessão nova nascida ao vivo: entra com o que o catálogo trouxer
  source.addSession({ id: 's3' })
  assert.deepEqual(events, [
    { type: 'session/added', sessionId: 's1' },
    { type: 'session/added', sessionId: 's2' },
    { type: 'session/added', sessionId: 's3' },
  ])
})

test('session/added: model? do catálogo vem da projeção modelSelection', () => {
  const { adapter, events } = setup({
    sessions: [{ id: 's1' }],
    projections: {
      modelSelection: {
        s1: { lastUsed: { provider: 'openrouter-extra', model: 'deepseek/deepseek-v4-flash-0731' }, pending: null },
      },
    },
  })
  adapter.start()
  assert.deepEqual(events, [
    { type: 'session/added', sessionId: 's1', model: 'deepseek/deepseek-v4-flash-0731' },
  ])
})

test('session/removed: dispose emite, limpa e repetida é no-op', () => {
  const { adapter, source, events } = setup({ sessions: [{ id: 's1' }] })
  adapter.start()
  events.length = 0
  source.disposeSession('s1')
  assert.deepEqual(events, [{ type: 'session/removed', sessionId: 's1' }])
  source.disposeSession('s1') // já foi: silêncio
  source.disposeSession('desconhecida')
  assert.equal(events.length, 1)
})

/* ------------------------------------------------------------------ */
/* Estados e fim de turno                                              */
/* ------------------------------------------------------------------ */

test('agent/status: idle/running passam tal qual (agent.session.id)', () => {
  const { adapter, source, events } = setup({ sessions: [{ id: 's1' }] })
  adapter.start()
  events.length = 0
  source.emit('agent/status', { agent: { session: { id: 's1' } }, status: 'running' })
  source.emit('agent/status', { agent: { session: { id: 's1' } }, status: 'idle' })
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
    source.appendEvent('s1', { type: 'turn/end', turn: 1, reason: { kind: entrada } })
    assert.deepEqual(events, [{ type: 'turn/end', sessionId: 's1', kind: saida }])
  }
  // a causa interna de um aborted (user/parent/hook/…) fica escondida
  const { adapter, source, events } = setup()
  adapter.start()
  source.appendEvent('s1', { type: 'turn/end', turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } })
  source.appendEvent('s1', { type: 'turn/end', turn: 3, reason: { kind: 'plano-b' } }) // plugado
  source.appendEvent('s1', { type: 'turn/end', turn: 4, reason: {} })                  // sem reason
  assert.deepEqual(events, [
    { type: 'turn/end', sessionId: 's1', kind: 'aborted' },
    { type: 'turn/end', sessionId: 's1', kind: 'error' },
    { type: 'turn/end', sessionId: 's1', kind: 'error' },
  ])
})

/* ------------------------------------------------------------------ */
/* Ferramentas e subagentes                                            */
/* ------------------------------------------------------------------ */

test('tool/call + tool/result: pareiam por callId (message.source) e derivam ok', () => {
  const { adapter, source, events } = setup({ sessions: [{ id: 's1' }] })
  adapter.start()
  events.length = 0
  source.appendEvent('s1', { type: 'tool/call', turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{}' })
  source.appendEvent('s1', {
    type: 'tool/result', turn: 1, step: 1,
    message: { source: { kind: 'tool', callId: 'c1' }, content: [] },
  })
  source.appendEvent('s1', {
    type: 'tool/result', turn: 1, step: 1,
    message: { source: { kind: 'tool', callId: 'c1' }, content: [] },
    error: { name: 'E', code: 'X' },
  })
  assert.deepEqual(events, [
    { type: 'tool', sessionId: 's1', phase: 'call', name: 'bash' },
    { type: 'tool', sessionId: 's1', phase: 'result', name: 'bash', ok: true },
    { type: 'tool', sessionId: 's1', phase: 'result', name: 'bash', ok: false },
  ])
})

test('subagent/start|end: (info, parent) → sessionId=pai; local false = telemetria indisponível', () => {
  const { adapter, source, events } = setup({ sessions: [{ id: 'pai' }] })
  adapter.start()
  events.length = 0
  const pai = { session: { id: 'pai' } }
  source.emit('subagent/start', { runId: 'r1', provider: 'openrouter-extra', id: 'filho1', local: true }, pai)
  source.emit('subagent/end', {
    runId: 'r1', provider: 'openrouter-extra', id: 'filho1', local: true, stopReason: 'completed',
  }, pai)
  // filho remoto: local:false passa tal qual — a UI mostra "telemetria
  // indisponível" e o adaptador nunca inventa dados para a sessão remota.
  source.emit('subagent/start', { runId: 'r2', provider: 'acme', id: 'filho2', local: false }, pai)
  source.emit('subagent/end', {
    runId: 'r2', provider: 'acme', id: 'filho2', local: false, stopReason: 'error',
  }, pai)
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

test('user-questions/request: captura ao vivo (agent.session.id) e responde o waterfall', async () => {
  const { adapter, source, events } = setup({ sessions: [{ id: 's1' }] })
  adapter.start()
  events.length = 0
  const pending = source.emitWaterfall('user-questions/request', {
    agent: { session: { id: 's1' } },
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
  const { adapter, source } = setup({ sessions: [{ id: 's1' }] })
  adapter.start()
  const vazio = source.emitWaterfall('user-questions/request', { agent: { session: { id: 's1' } }, questions: [] })
  assert.deepEqual(await vazio, { answers: [] })
  // aborto (ASK_ABORTED): a pergunta sai de cena e nunca é respondida
  const signal = new FakeSignal()
  source.emitWaterfall('user-questions/request', {
    agent: { session: { id: 's1' } },
    questions: [{ id: 'q1', question: 'Seguir?' }],
    signal,
  })
  signal.abort()
  assert.throws(() => adapter.answer({ sessionId: 's1', id: 'q1', selected: [] }), /pendente/)
  // pedido sem agent: impossível atribuir a sessão → delega (nunca inventar)
  const semAgente = source.emitWaterfall('user-questions/request', {
    questions: [{ id: 'q9', question: 'Órfana?' }],
  })
  assert.deepEqual(await semAgente, { answers: [] })
})

test('approval: asked/decided duráveis + waterfall devolve outcome fechado', async () => {
  const { adapter, source, events } = setup({ sessions: [{ id: 's1' }] })
  adapter.start()
  events.length = 0
  source.appendEvent('s1', { type: 'approval/asked', id: 'ap1', toolName: 'bash', callId: 'c9', reason: 'permite escrever' })
  source.appendEvent('s1', { type: 'approval/decided', id: 'ap1', outcome: 'allowed-once' })
  // pedido sem callId/reason: os campos opcionais ficam de fora
  source.appendEvent('s1', { type: 'approval/asked', id: 'ap2', toolName: 'read' })
  // waterfall: a decisão da UI devolve o outcome ao DSH
  const pending = source.emitWaterfall('approval/request', {
    agent: { session: { id: 's1' } },
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

test('usage: deltas de tokenUsage com linha de base e atribuição modelSelection', () => {
  const { adapter, source, events } = setup({
    sessions: [{ id: 's1' }],
    projections: {
      // já gastado antes do arranque: serve de linha de base, nunca é delta
      tokenUsage: { s1: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5 } },
      // atribuição de rota: modelSelection (durable) já sabe o modelo
      modelSelection: {
        s1: { lastUsed: { provider: 'openrouter-extra', model: 'deepseek/deepseek-v4-flash-0731' }, pending: null },
      },
    },
  })
  adapter.start()
  // model? do catálogo vem da projeção; arranque não emite usage
  assert.deepEqual(events, [
    { type: 'session/added', sessionId: 's1', model: 'deepseek/deepseek-v4-flash-0731' },
  ])
  const assistant = (turn, usage) => ({
    type: 'assistant/message', turn, step: 1, message: {}, stream: [], usage,
  })
  source.appendEvent('s1', assistant(1, {
    inputTokens: 200, outputTokens: 50, cacheReadTokens: 20, cacheWriteTokens: 10,
  }))
  assert.deepEqual(events[1], {
    type: 'usage',
    sessionId: 's1',
    provider: 'openrouter-extra',
    model: 'deepseek/deepseek-v4-flash-0731',
    uncachedInput: 200, output: 50, cacheRead: 20, cacheWrite: 10,
  })
  // repetição do mesmo settlement: sem delta, silêncio
  source.appendEvent('s1', assistant(1, {
    inputTokens: 200, outputTokens: 50, cacheReadTokens: 20, cacheWriteTokens: 10,
  }))
  assert.equal(events.length, 2)
  source.appendEvent('s1', assistant(2, {
    inputTokens: 300, outputTokens: 60, cacheReadTokens: 25, cacheWriteTokens: 12,
  }))
  assert.deepEqual(events[2], {
    type: 'usage',
    sessionId: 's1',
    provider: 'openrouter-extra',
    model: 'deepseek/deepseek-v4-flash-0731',
    uncachedInput: 300, output: 60, cacheRead: 25, cacheWrite: 12,
  })
})

test('usage: sem atribuição a base fica parada e o delta chega com a rota', () => {
  const { adapter, source, events } = setup({ sessions: [{ id: 's2' }] })
  adapter.start()
  events.length = 0
  // sem modelSelection nem request/header: base fixada, nada emitido
  source.appendEvent('s2', {
    type: 'assistant/message', turn: 1, step: 1, message: {}, stream: [],
    usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
  })
  assert.equal(events.length, 0)
  // request/header dobra modelSelection → a rota chega pela projeção
  source.appendEvent('s2', {
    type: 'request/header', reason: 'initial', header: { config: { provider: 'p', model: 'm' } },
  })
  assert.deepEqual(events[0], { type: 'model', sessionId: 's2', provider: 'p', model: 'm' })
  // o próximo gasto atribui o delta ACUMULADO desde a base (100+150) — nada se perde
  source.appendEvent('s2', {
    type: 'assistant/message', turn: 2, step: 1, message: {}, stream: [],
    usage: { inputTokens: 150, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
  })
  assert.deepEqual(events[1], {
    type: 'usage', sessionId: 's2', provider: 'p', model: 'm',
    uncachedInput: 250, output: 30, cacheRead: 0, cacheWrite: 0,
  })
})

test('model: modelSelection define a rota; contextPressure traz capacity (last-wins)', () => {
  const { adapter, source, events } = setup({ sessions: [{ id: 's1' }] })
  adapter.start()
  events.length = 0
  source.appendEvent('s1', {
    type: 'request/header', reason: 'initial', header: { config: { provider: 'p1', model: 'm1' } },
  })
  assert.deepEqual(events, [{ type: 'model', sessionId: 's1', provider: 'p1', model: 'm1' }])
  source.appendEvent('s1', { type: 'request/context', provider: 'p1', model: 'm1', contextWindow: 131072 })
  assert.deepEqual(events[1], { type: 'model', sessionId: 's1', provider: 'p1', model: 'm1', contextWindow: 131072 })
  // mesmo contexto repetido: sem evento novo
  source.appendEvent('s1', { type: 'request/context', provider: 'p1', model: 'm1', contextWindow: 131072 })
  assert.equal(events.length, 2)
  // troca de rota por header: mantém a capacidade antiga (trade-off do DSH)
  source.appendEvent('s1', {
    type: 'request/header', reason: 'change', header: { config: { provider: 'p2', model: 'm2' } },
  })
  assert.deepEqual(events[2], { type: 'model', sessionId: 's1', provider: 'p2', model: 'm2', contextWindow: 131072 })
  // mudança de capacidade: novo evento
  source.appendEvent('s1', { type: 'request/context', provider: 'p2', model: 'm2', contextWindow: 65536 })
  assert.deepEqual(events[3], { type: 'model', sessionId: 's1', provider: 'p2', model: 'm2', contextWindow: 65536 })
})

test('retry e compaction: sinais simples', () => {
  const { adapter, source, events } = setup({ sessions: [{ id: 's1' }] })
  adapter.start()
  events.length = 0
  source.appendEvent('s1', { type: 'llm/retry-started', retryId: 'r9', turn: 1, step: 2, retry: {} })
  source.appendEvent('s1', { type: 'compaction/start', compactionId: 'c1', turn: 3 })
  source.appendEvent('s1', { type: 'compaction/end', compactionId: 'c1', turn: 3 })
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
  const { adapter, source, events } = setup({ sessions: [{ id: 's1' }] })
  adapter.start()
  adapter.start() // segundo start é no-op
  assert.deepEqual(events, [{ type: 'session/added', sessionId: 's1' }])
  adapter.stop()
  events.length = 0
  source.emit('agent/status', { agent: { session: { id: 's1' } }, status: 'running' })
  assert.equal(events.length, 0) // desligado: nada chega ao estado
  adapter.stop() // parar repetido é no-op
  adapter.start() // religar = reconciliação: novo snapshot completo
  assert.deepEqual(events, [{ type: 'session/added', sessionId: 's1' }])
  source.emit('agent/status', { agent: { session: { id: 's1' } }, status: 'running' })
  assert.deepEqual(events[1], { type: 'status', sessionId: 's1', status: 'running' })
})