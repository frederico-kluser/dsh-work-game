/*
 * dsh-plugin/src/adapter.js — adaptador de eventos DSH → eventos normalizados
 *
 * Único módulo do projeto que fala com o DSH (secção 3 de
 * docs/contratos-plugin.md): converte os eventos/projeções REAIS nos eventos
 * normalizados da secção 1 que o state.js consome. O state.js nunca vê o DSH.
 *
 * Vocabulário e payloads verificados no checkout deepseek-harness
 * (0.1.6-alpha.2, ddefc45 — 2026-09-27). Superfície consumida (lado HOST do
 * catálogo; cada handler recebe EXACTAMENTE os argumentos do evento real):
 *
 *   sessions.list()                 → Session[]  (SessionStore.list(): vivos,
 *                                     .id + .header; no host não há retain)
 *   sessions.on(name, handler)      → () => void
 *     'session/event'               (session, event: SessionEvent {type, seq, time, data})
 *     'session/created'             (session)             — alta ao vivo
 *     'session/disposed'            (session)             — baixa ao vivo
 *     'agent/status'                ({agent, status: 'idle'|'running'})
 *     'subagent/start'              (info: SubagentRunInfo, parent: Agent)
 *     'subagent/end'                (info: SubagentRunEndInfo, parent: Agent)
 *   sessions.waterfall(name, handler) → () => void  — handler(payload, next)
 *     'user-questions/request'      ({questions, agent?, signal?}, next)
 *     'approval/request'            ({agent, toolName, callId?, reason?, signal?}, next)
 *   projections.snapshot(session, keys?) → {asOfSeq, values}
 *   projections.onChanged((session, key, value, seq)) → () => void
 *
 * Projeções registradas no DSH (wire views verificadas):
 *   tokenUsage     acumulado {uncachedInputTokens, outputTokens,
 *                             cacheReadTokens, cacheWriteTokens}
 *   modelSelection {lastUsed: {provider, model, reasoningEffort?}|null,
 *                   next: pending ?? lastUsed}
 *   contextPressure {pressureTokens?, projectedTokens?, contextWindow?}
 *
 * Mapeamento aplicado aqui (tabela da secção 1 do contrato):
 *   - session/event (firehose durável) → turn/end, tool/call|result,
 *     approval/asked|decided, retry, compaction;
 *   - request/header|context e model/selection NÃO se leem do firehose: as
 *     projeções modelSelection + contextPressure (folds duráveis desses
 *     eventos) dirigen `model` — a rota vem de modelSelection
 *     (next ?? lastUsed) e a capacidade de contextPressure (contextWindow
 *     last-wins, trade-off do DSH: trocar de rota pareia a capacidade antiga);
 *   - tokenUsage (acumulado) → `usage` por delta com linha de base por sessão
 *     semeada no primeiro vislumbre (start ou session/created);
 *   - turn/end.reason.kind → vocabulário fechado; causa desconhecida ⇒ 'error'
 *     (fail-closed);
 *   - agent/status.sessionId = agent.session.id; subagent.sessionId =
 *     parent.session.id (o segundo argumento real dos eventos subagent/*);
 *   - subagent/*.local === false → telemetria indisponível: `local` passa tal
 *     qual e nada é inventado para a sessão remota;
 *   - perguntas e aprovações vivem em waterfall/runtime → captura ao vivo;
 *     `approval` normalizado usa o par durável approval/asked (único com id);
 *     um pedido sem agente/sessão não se pode atribuir → delega com next();
 *   - o estado nunca quebra a fila de eventos do DSH: erros de `onEvent`
 *     ficam contidos.
 *
 * Para além de start()/stop(), o adaptador expõe duas pontes para a UI
 * responder aos waterfalls (sem elas as promessas ficam pendentes para sempre):
 *   adapter.answer({sessionId, id, selected, custom?}) — responde uma `question`;
 *   adapter.decide({sessionId, outcome})               — decide uma `approval` pendente.
 */

const TURN_END_KINDS = new Set(['completed', 'aborted', 'blocked', 'error', 'max-tokens', 'interrupted'])
const APPROVAL_OUTCOMES = new Set(['allowed-once', 'rejected', 'cancelled', 'unavailable'])

export function createAdapter({ onEvent, sessions, projections }) {
  const requireFn = (valor, nome) => {
    if (typeof valor !== 'function') throw new TypeError(`createAdapter: ${nome} é obrigatório`)
  }
  requireFn(onEvent, 'onEvent')
  requireFn(sessions?.list, 'sessions.list (catálogo de sessões)')
  requireFn(sessions?.on, 'sessions.on')
  requireFn(sessions?.waterfall, 'sessions.waterfall (canais runtime)')
  requireFn(projections?.snapshot, 'projections.snapshot')
  requireFn(projections?.onChanged, 'projections.onChanged')

  const known = new Map()            // sessionId → Session (objeto do catálogo)
  const usageBase = new Map()        // sessionId → últimos 4 buckets observados
  const modelInfo = new Map()        // sessionId → {provider, model, contextWindow?}
  const toolNames = new Map()        // sessionId → Map(callId → nome da ferramenta)
  const pendingQuestions = new Map() // sessionId → lote à espera de respostas
  const pendingApprovals = new Map() // sessionId → waterfall à espera de decisão
  const disposers = []
  let started = false

  // Emissão contida: um erro do state nunca deve quebrar a fila de eventos.
  function emitEvent(event) {
    try { onEvent(event) } catch { /* estado avariado não derruba o plugin */ }
  }

  // Session real expone `.id`; aceita também o resumo client-side `.sessionId`.
  function idOf(session) {
    return session?.id ?? session?.sessionId
  }

  // agent/status e subagent/* carregam o Agent: `agent.session.id` é a sessão.
  function sessionIdOfAgent(agent) {
    return idOf(agent?.session)
  }

  function bucketOf(snapshot) {
    return {
      uncachedInput: snapshot.uncachedInputTokens ?? 0,
      output: snapshot.outputTokens ?? 0,
      cacheRead: snapshot.cacheReadTokens ?? 0,
      cacheWrite: snapshot.cacheWriteTokens ?? 0,
    }
  }

  // Primeira vista de uma sessão: semea linha de base (nunca delta), rota e
  // capacidade das projeções duráveis — o catálogo real não traz workspaceId
  // (opcional do contrato); o `model?` vem de modelSelection.
  function addSession(session) {
    const sessionId = idOf(session)
    if (!sessionId || known.has(sessionId)) return // dedupe: snapshot × canal ao vivo
    known.set(sessionId, session)
    let model
    try {
      const snap = projections.snapshot(session, ['tokenUsage', 'modelSelection', 'contextPressure'])
      const values = snap?.values ?? {}
      if (values.tokenUsage) usageBase.set(sessionId, bucketOf(values.tokenUsage))
      const route = values.modelSelection?.next ?? values.modelSelection?.lastUsed
      const contextWindow = values.contextPressure?.contextWindow
      if (route) {
        const info = { provider: route.provider, model: route.model }
        if (contextWindow !== undefined) info.contextWindow = contextWindow
        modelInfo.set(sessionId, info)
        model = route.model
      } else if (contextWindow !== undefined) {
        modelInfo.set(sessionId, { contextWindow })
      }
    } catch { /* projeções indisponíveis: catálogo sem atributos (nunca inventar) */ }
    const event = { type: 'session/added', sessionId }
    if (model !== undefined) event.model = model
    emitEvent(event)
  }

  function removeSession(sessionId) {
    if (!known.delete(sessionId)) return // remoção repetida/desconhecida é no-op
    usageBase.delete(sessionId)
    modelInfo.delete(sessionId)
    toolNames.delete(sessionId)
    pendingQuestions.delete(sessionId)
    pendingApprovals.delete(sessionId)
    emitEvent({ type: 'session/removed', sessionId })
  }

  /* ------------------------- firehose durável ------------------------- */

  function onSessionEvent(session, event) {
    const sessionId = idOf(session)
    if (!sessionId || !event?.type) return
    const data = event.data ?? {}
    switch (event.type) {
      case 'turn/end': {
        // reason.kind é vocabulário fechado; variante plugada desconhecida ⇒ error.
        const kind = TURN_END_KINDS.has(data.reason?.kind) ? data.reason.kind : 'error'
        emitEvent({ type: 'turn/end', sessionId, kind })
        break
      }
      case 'tool/call':
        onToolCall(sessionId, data)
        break
      case 'tool/result':
        onToolResult(sessionId, data)
        break
      case 'approval/asked': {
        const approval = { type: 'approval', sessionId, id: data.id, toolName: data.toolName }
        if (data.callId !== undefined) approval.callId = data.callId
        if (data.reason !== undefined) approval.reason = data.reason
        emitEvent(approval)
        break
      }
      case 'approval/decided':
        emitEvent({ type: 'approval/decided', sessionId, id: data.id, outcome: data.outcome })
        break
      case 'llm/retry-started':
        emitEvent({ type: 'retry', sessionId })
        break
      case 'compaction/start':
        emitEvent({ type: 'compaction', sessionId, phase: 'start' })
        break
      case 'compaction/end':
        emitEvent({ type: 'compaction', sessionId, phase: 'end' })
        break
      default:
        // request/header|context e model/selection → projeções; turn/start,
        // step/*, mensagens… — sem representação no contrato.
        break
    }
  }

  function onToolCall(sessionId, data) {
    let bySession = toolNames.get(sessionId)
    if (!bySession) { bySession = new Map(); toolNames.set(sessionId, bySession) }
    bySession.set(data.callId, data.name)
    emitEvent({ type: 'tool', sessionId, phase: 'call', name: data.name })
  }

  function onToolResult(sessionId, data) {
    // tool/result não traz o nome nem callId ao nível: vem em
    // message.source.callId (ToolResultMessage); o nome pareia por callId.
    const callId = data.message?.source?.callId
    emitEvent({
      type: 'tool',
      sessionId,
      phase: 'result',
      name: toolNames.get(sessionId)?.get(callId),
      ok: data.error === undefined,
    })
  }

  /* ----------------------- runtime (ctx events) ----------------------- */

  function onAgentStatus({ agent, status }) {
    const sessionId = sessionIdOfAgent(agent)
    if (!sessionId) return
    // agent/status só conhece 'idle'|'running' no DSH — passa tal qual.
    emitEvent({ type: 'status', sessionId, status })
  }

  function onSubagentStart(info, parent) {
    const sessionId = sessionIdOfAgent(parent)
    if (!sessionId) return
    // local:false → a sessão remota não tem telemetria local; a UI mostra
    // "telemetria indisponível" e o adaptador nunca inventa nada para ela.
    emitEvent({ type: 'subagent/start', sessionId, childId: info.id, runId: info.runId, local: info.local })
  }

  function onSubagentEnd(info, parent) {
    const sessionId = sessionIdOfAgent(parent)
    if (!sessionId) return
    emitEvent({ type: 'subagent/end', sessionId, childId: info.id, runId: info.runId, stopReason: info.stopReason })
  }

  /* ------------------------ projeções (duráveis) ------------------------ */

  // Rota + capacidade → `model`. contextWindow é last-wins (contextPressure do
  // DSH): trocar de rota pareia a capacidade antiga com a pressão nova até o
  // próximo request/context — trade-off intencional do DSH.
  function applyModel(sessionId, route) {
    const previous = modelInfo.get(sessionId)
    const provider = route.provider ?? previous?.provider
    const model = route.model ?? previous?.model
    const contextWindow = route.contextWindow !== undefined
      ? route.contextWindow
      : previous?.contextWindow
    const changed = !previous
      || previous.provider !== provider
      || previous.model !== model
      || previous.contextWindow !== contextWindow
    if (!changed) return
    if (provider && model) {
      const info = { provider, model }
      if (contextWindow !== undefined) info.contextWindow = contextWindow
      modelInfo.set(sessionId, info)
      const event = { type: 'model', sessionId, provider, model }
      if (contextWindow !== undefined) event.contextWindow = contextWindow
      emitEvent(event)
    } else if (contextWindow !== undefined) {
      // Capacidade sem rota conhecida: guarda-se; o `model` chega com a rota.
      modelInfo.set(sessionId, { contextWindow })
    }
  }

  function onProjectionChanged(session, key, value) {
    const sessionId = idOf(session)
    if (!sessionId) return
    if (key === 'tokenUsage') { onUsage(sessionId, value); return }
    if (key === 'modelSelection') {
      // next = pending ?? lastUsed: a rota que o DSH já tem decidida.
      const route = value?.next ?? value?.lastUsed
      if (!route) return
      applyModel(sessionId, { provider: route.provider, model: route.model })
      return
    }
    if (key === 'contextPressure' && value?.contextWindow !== undefined) {
      applyModel(sessionId, { contextWindow: value.contextWindow })
    }
  }

  function onUsage(sessionId, snapshot) {
    if (!snapshot) return
    // Snapshot acumulado → delta em relação à linha de base da sessão.
    const current = bucketOf(snapshot)
    const previous = usageBase.get(sessionId)
    if (!previous) { usageBase.set(sessionId, current); return }
    const delta = {
      uncachedInput: current.uncachedInput - previous.uncachedInput,
      output: current.output - previous.output,
      cacheRead: current.cacheRead - previous.cacheRead,
      cacheWrite: current.cacheWrite - previous.cacheWrite,
    }
    const empty = delta.uncachedInput === 0 && delta.output === 0
      && delta.cacheRead === 0 && delta.cacheWrite === 0
    if (empty) return
    const route = modelInfo.get(sessionId)
    if (!route?.provider || !route?.model) return // sem atribuição: a base fica
    // parada e o delta ACUMULADO chega quando haja rota — nada se perde.
    usageBase.set(sessionId, current)
    emitEvent({
      type: 'usage',
      sessionId,
      provider: route.provider,
      model: route.model,
      uncachedInput: delta.uncachedInput,
      output: delta.output,
      cacheRead: delta.cacheRead,
      cacheWrite: delta.cacheWrite,
    })
  }

  /* ----------------------- waterfalls (runtime) ----------------------- */

  // user-questions/request (waterfall/runtime — não reconstruíble do log).
  function onQuestions(request, next) {
    if (!request || !Array.isArray(request.questions) || request.questions.length === 0) {
      return Promise.resolve({ answers: [] }) // lote vazio nunca fica pendente
    }
    const sessionId = sessionIdOfAgent(request.agent)
    if (!sessionId) return next?.() ?? Promise.resolve({ answers: [] }) // sem sessão: delega
    const batch = {
      pending: new Map(request.questions.map((q) => [q.id, null])), // id → resposta
      resolve: null,
      signal: request.signal,
      cleanup: null,
    }
    pendingQuestions.set(sessionId, batch) // uma pergunta nova substitui a ativa
    const cleanup = () => {
      if (pendingQuestions.get(sessionId) === batch) pendingQuestions.delete(sessionId)
    }
    batch.cleanup = cleanup
    // Aborto (ASK_ABORTED): o lote sai de cena sem responder — a promessa nunca
    // reclama o waterfall; quem aborta é o próprio asker via AbortSignal.
    if (request.signal) request.signal.addEventListener('abort', cleanup, { once: true })
    for (const q of request.questions) {
      const question = { type: 'question', sessionId, id: q.id, text: q.question }
      if (q.options !== undefined) question.options = q.options
      if (q.multiSelect !== undefined) question.multiSelect = q.multiSelect
      emitEvent(question)
    }
    return new Promise((resolve) => { batch.resolve = resolve })
  }

  function answerQuestion({ sessionId, id, selected, custom }) {
    const batch = pendingQuestions.get(sessionId)
    if (!batch) throw new Error(`adapter: nenhuma pergunta pendente para a sessão ${sessionId}`)
    if (!batch.pending.has(id)) throw new Error(`adapter: pergunta desconhecida: ${id}`)
    if (batch.pending.get(id) !== null) return // já respondida: no-op (duplo clique)
    const answer = { id, selected: Array.isArray(selected) ? selected : [] }
    if (custom !== undefined) answer.custom = custom
    batch.pending.set(id, answer)
    emitEvent({ type: 'question/answered', sessionId, id })
    const all = [...batch.pending.values()]
    if (all.every((item) => item !== null)) {
      pendingQuestions.delete(sessionId)
      batch.signal?.removeEventListener('abort', batch.cleanup)
      batch.resolve({ answers: all }) // retorno do waterfall, na ordem das perguntas
    }
  }

  // approval/request (waterfall/runtime): a decisão devolve o outcome ao DSH;
  // o par durável approval/decided (com id) chega depois pela sessão.
  function onApprovalRequest(req, next) {
    const sessionId = sessionIdOfAgent(req?.agent)
    if (!sessionId) return next?.() ?? Promise.resolve('unavailable') // sem sessão: delega
    const pending = { resolve: null, signal: req.signal, cleanup: null }
    pendingApprovals.set(sessionId, pending)
    const cleanup = () => {
      if (pendingApprovals.get(sessionId) === pending) pendingApprovals.delete(sessionId)
    }
    pending.cleanup = cleanup
    if (req.signal) req.signal.addEventListener('abort', cleanup, { once: true })
    return new Promise((resolve) => { pending.resolve = resolve })
  }

  function decideApproval({ sessionId, outcome }) {
    if (!APPROVAL_OUTCOMES.has(outcome)) {
      throw new Error(`adapter: outcome de aprovação inválido: ${outcome}`)
    }
    const pending = pendingApprovals.get(sessionId)
    if (!pending) throw new Error(`adapter: nenhuna aprovação pendente para a sessão ${sessionId}`)
    pendingApprovals.delete(sessionId)
    pending.signal?.removeEventListener('abort', pending.cleanup)
    pending.resolve(outcome)
  }

  /* --------------------------- ciclo de vida --------------------------- */

  function subscribe(target, name, handler, mode = 'on') {
    if (mode === 'projection') {
      disposers.push(target.onChanged(handler))
      return
    }
    const method = mode === 'waterfall' ? target.waterfall : target.on
    disposers.push(method.call(target, name, handler))
  }

  function start() {
    if (started) return
    started = true
    // Subscrição ANTES do snapshot: sessões nascidas na janela chegam pelo
    // canal ao vivo; o dedupe por sessionId evita duplicados.
    subscribe(sessions, 'session/event', onSessionEvent)
    subscribe(sessions, 'session/created', (session) => addSession(session))
    subscribe(sessions, 'session/disposed', (session) => {
      const sessionId = idOf(session)
      if (sessionId) removeSession(sessionId)
    })
    subscribe(sessions, 'agent/status', onAgentStatus)
    subscribe(sessions, 'subagent/start', onSubagentStart)
    subscribe(sessions, 'subagent/end', onSubagentEnd)
    subscribe(sessions, 'user-questions/request', onQuestions, 'waterfall')
    subscribe(sessions, 'approval/request', onApprovalRequest, 'waterfall')
    subscribe(projections, null, onProjectionChanged, 'projection')
    for (const session of sessions.list() ?? []) addSession(session)
  }

  function stop() {
    if (!started) return
    started = false
    for (const dispose of disposers.splice(0)) {
      try { dispose?.() } catch { /* segue com o resto da limpeza */ }
    }
    // Reinício = reconciliação: tudo volta ao vazio para o próximo start()
    // refazer o snapshot completo (linhas de base inclusas — sem dupla conta).
    known.clear()
    usageBase.clear()
    modelInfo.clear()
    toolNames.clear()
    pendingQuestions.clear()
    pendingApprovals.clear()
  }

  return {
    start,
    stop,
    answer: answerQuestion, // ponte da UI: resposta a uma pergunta ao vivo
    decide: decideApproval, // ponte da UI: decisão de aprovação pendente
  }
}