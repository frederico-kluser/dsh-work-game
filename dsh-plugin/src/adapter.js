/*
 * dsh-plugin/src/adapter.js — adaptador de eventos DSH → eventos normalizados
 *
 * Único módulo do projeto que fala com o DSH (secção 3 de
 * docs/contratos-plugin.md): converte os eventos/projeções REAIS nos eventos
 * normalizados da secção 1 que o state.js consome. O state.js nunca vê o DSH.
 *
 * Vocabulário e payloads verificados no checkout deepseek-harness
 * (0.1.6-alpha.2, ddefc45 — 2026-09-27):
 *   user-questions/request     waterfall: {questions, agent?, signal?}
 *   approval/request           waterfall: {agent, toolName, callId?, reason?, signal?}
 *   approval/asked|decided     duráveis: {id, toolName?, callId?, reason?} | {id, outcome}
 *   turn/end                   {turn, reason: TurnEndReason} (reason.kind fechado)
 *   agent/status               {agent, status: 'idle'|'running'}
 *   tool/call|result             pareiam por callId → {turn, step, callId, name, arguments} | {…, message, error?}
 *   subagent/start|end         SubagentRunInfo / SubagentRunEndInfo (pareiam por runId)
 *   request/header             {header: {config: {provider, model, …}}, reason, startsSeries?}
 *   request/context            {provider, model, contextWindow?, systemPromptUpdate?}
 *   llm/retry-started          {retryId, turn, step, retry}
 *   compaction/start|end       {compactionId, sourceCommandId?, turn, error?}
 *   tokenUsage (projeção)      acumulado {uncachedInputTokens, outputTokens,
 *                             cacheReadTokens, cacheWriteTokens}
 *   deriveTurnTokenUsage       por turno, com routes?: [{provider, model}]
 *
 * Superfície mínima consumida da camada de integração real (a camada cordis
 * implementa-a; tests/plugin/adapter.test.mjs simula-a por tipo de evento):
 *
 *   sessions.list()                   → SessionSummary[]   (snapshot síncrono)
 *   sessions.on(nome, handler)        → () => void  — handler({sessionId, …payload real})
 *   sessions.waterfall(nome, handler) → () => void  — canais runtime; o retorno do handler responde
 *   projections.tokenUsage(sessionId) → acumulado | null
 *   projections.subscribe('tokenUsage', handler) → () => void — handler({sessionId, snapshot})
 *   projections.deriveTurnTokenUsage(sessionId)  → TurnTokenUsage | null (opcional)
 *
 * Regras do contrato aplicadas aqui:
 *   - perguntas e aprovações vivem em waterfall/runtime → captura ao vivo;
 *     o `approval` normalizado usa o par durável `approval/asked` (único com id);
 *   - turn/end.reason.kind → vocabulário fechado; causa desconhecida ⇒ 'error' (fail-closed);
 *   - tokenUsage é acumulado → converte em `usage` por delta (linha de base por sessão);
 *   - request/header + request/context → `model` (contextWindow last-wins, trade-off do DSH);
 *   - subagent/*.local === false → telemetria indisponível: `local` passa tal qual e
 *     nada é inventado para a sessão remota;
 *   - o estado nunca quebra a fila de eventos do DSH: erros de `onEvent` ficam contidos.
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
  requireFn(projections?.tokenUsage, 'projections.tokenUsage')
  requireFn(projections?.subscribe, 'projections.subscribe')

  const known = new Map()            // sessionId → resumo do catálogo
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

  function bucketOf(snapshot) {
    return {
      uncachedInput: snapshot.uncachedInputTokens ?? 0,
      output: snapshot.outputTokens ?? 0,
      cacheRead: snapshot.cacheReadTokens ?? 0,
      cacheWrite: snapshot.cacheWriteTokens ?? 0,
    }
  }

  function addSession(summary) {
    if (known.has(summary.sessionId)) return // dedupe: snapshot × canal ao vivo
    known.set(summary.sessionId, summary)
    const event = { type: 'session/added', sessionId: summary.sessionId }
    if (summary.workspaceId !== undefined) event.workspaceId = summary.workspaceId
    if (summary.model !== undefined) event.model = summary.model
    emitEvent(event)
    // Linha de base do custo: só o que gastar DAQUI em diante conta como delta.
    let accumulated = null
    try { accumulated = projections.tokenUsage(summary.sessionId) } catch { accumulated = null }
    if (accumulated) usageBase.set(summary.sessionId, bucketOf(accumulated))
  }

  function removeSession(event) {
    const sessionId = event.sessionId
    if (!known.delete(sessionId)) return // remoção repetida/desconhecida é no-op
    usageBase.delete(sessionId)
    modelInfo.delete(sessionId)
    toolNames.delete(sessionId)
    pendingQuestions.delete(sessionId)
    pendingApprovals.delete(sessionId)
    emitEvent({ type: 'session/removed', sessionId })
  }

  function onStatus(event) {
    // agent/status só conhece 'idle'|'running' no DSH — passa tal qual.
    emitEvent({ type: 'status', sessionId: event.sessionId, status: event.status })
  }

  function onTurnEnd(event) {
    // reason.kind é vocabulário fechado; variante plugada desconhecida ⇒ error.
    const kind = TURN_END_KINDS.has(event.reason?.kind) ? event.reason.kind : 'error'
    emitEvent({ type: 'turn/end', sessionId: event.sessionId, kind })
  }

  function onToolCall(event) {
    let bySession = toolNames.get(event.sessionId)
    if (!bySession) { bySession = new Map(); toolNames.set(event.sessionId, bySession) }
    bySession.set(event.callId, event.name)
    emitEvent({ type: 'tool', sessionId: event.sessionId, phase: 'call', name: event.name })
  }

  function onToolResult(event) {
    const bySession = toolNames.get(event.sessionId)
    emitEvent({
      type: 'tool',
      sessionId: event.sessionId,
      phase: 'result',
      name: bySession?.get(event.callId), // tool/result não traz o nome: pareia por callId
      ok: event.error === undefined,
    })
  }

  function onSubagentStart(event) {
    // local:false → a sessão remota não tem telemetria local; a UI mostra
    // "telemetria indisponível" e o adaptador nunca inventa nada para ela.
    emitEvent({ type: 'subagent/start', sessionId: event.sessionId, childId: event.id, runId: event.runId, local: event.local })
  }

  function onSubagentEnd(event) {
    emitEvent({ type: 'subagent/end', sessionId: event.sessionId, childId: event.id, runId: event.runId, stopReason: event.stopReason })
  }

  // request/header + request/context → `model`. contextWindow é last-wins
  // (contextPressure do DSH): trocar de rota pareia a capacidade antiga com a
  // pressão nova até o próximo request/context — trade-off intencional do DSH.
  function applyModel(sessionId, route) {
    const previous = modelInfo.get(sessionId)
    const contextWindow = route.contextWindow !== undefined ? route.contextWindow : previous?.contextWindow
    const changed = !previous
      || previous.provider !== route.provider
      || previous.model !== route.model
      || previous.contextWindow !== contextWindow
    if (!changed) return
    modelInfo.set(sessionId, { provider: route.provider, model: route.model, contextWindow })
    const event = { type: 'model', sessionId, provider: route.provider, model: route.model }
    if (contextWindow !== undefined) event.contextWindow = contextWindow
    emitEvent(event)
  }

  function onRequestHeader(event) {
    const config = event.header?.config
    if (!config?.provider || !config?.model) return // sem rota: nada a registar
    applyModel(event.sessionId, { provider: config.provider, model: config.model })
  }

  function onRequestContext(event) {
    if (!event.provider || !event.model) return
    applyModel(event.sessionId, {
      provider: event.provider,
      model: event.model,
      contextWindow: event.contextWindow,
    })
  }

  function onRetry(event) {
    emitEvent({ type: 'retry', sessionId: event.sessionId })
  }

  function onCompaction(event, phase) {
    emitEvent({ type: 'compaction', sessionId: event.sessionId, phase })
  }

  // Atribuição de modelo do delta: primeiro as routes por turno
  // (deriveTurnTokenUsage), depois o último request/header|context conhecido.
  function routeForUsage(sessionId) {
    try {
      const perTurn = projections.deriveTurnTokenUsage?.(sessionId) ?? null
      const routes = perTurn?.routes
      if (routes?.length) return routes[routes.length - 1]
    } catch { /* projeção indisponível: usa o fallback */ }
    return modelInfo.get(sessionId) ?? null
  }

  function onUsage(event) {
    if (!event.snapshot) return
    // Snapshot acumulado → delta em relação à linha de base da sessão.
    const current = bucketOf(event.snapshot)
    const previous = usageBase.get(event.sessionId)
    if (!previous) { usageBase.set(event.sessionId, current); return }
    const delta = {
      uncachedInput: current.uncachedInput - previous.uncachedInput,
      output: current.output - previous.output,
      cacheRead: current.cacheRead - previous.cacheRead,
      cacheWrite: current.cacheWrite - previous.cacheWrite,
    }
    const empty = delta.uncachedInput === 0 && delta.output === 0
      && delta.cacheRead === 0 && delta.cacheWrite === 0
    if (empty) return
    const route = routeForUsage(event.sessionId)
    if (!route) return // sem atribuição: a base fica parada e o delta acumulado
    // é emitido quando houver rota — nada se perde, nada se inventa.
    usageBase.set(event.sessionId, current)
    emitEvent({
      type: 'usage',
      sessionId: event.sessionId,
      provider: route.provider,
      model: route.model,
      uncachedInput: delta.uncachedInput,
      output: delta.output,
      cacheRead: delta.cacheRead,
      cacheWrite: delta.cacheWrite,
    })
  }

  // user-questions/request (waterfall/runtime — não reconstruível do log).
  function onQuestions(event) {
    if (!Array.isArray(event.questions) || event.questions.length === 0) {
      return Promise.resolve({ answers: [] }) // lote vazio nunca fica pendente
    }
    const sessionId = event.sessionId
    const batch = {
      pending: new Map(event.questions.map((q) => [q.id, null])), // id → resposta
      resolve: null,
      signal: event.signal,
      cleanup: null,
    }
    pendingQuestions.set(sessionId, batch) // uma pergunta nova substitui a ativa
    const cleanup = () => {
      if (pendingQuestions.get(sessionId) === batch) pendingQuestions.delete(sessionId)
    }
    batch.cleanup = cleanup
    // Aborto (ASK_ABORTED): o lote sai de cena sem responder — a promessa nunca
    // reclama o waterfall; quem aborta é o próprio asker via AbortSignal.
    if (event.signal) event.signal.addEventListener('abort', cleanup, { once: true })
    for (const q of event.questions) {
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
  function onApprovalRequest(event) {
    const sessionId = event.sessionId
    const pending = { resolve: null, signal: event.signal, cleanup: null }
    pendingApprovals.set(sessionId, pending)
    const cleanup = () => {
      if (pendingApprovals.get(sessionId) === pending) pendingApprovals.delete(sessionId)
    }
    pending.cleanup = cleanup
    if (event.signal) event.signal.addEventListener('abort', cleanup, { once: true })
    return new Promise((resolve) => { pending.resolve = resolve })
  }

  function decideApproval({ sessionId, outcome }) {
    if (!APPROVAL_OUTCOMES.has(outcome)) {
      throw new Error(`adapter: outcome de aprovação inválido: ${outcome}`)
    }
    const pending = pendingApprovals.get(sessionId)
    if (!pending) throw new Error(`adapter: nenhuma aprovação pendente para a sessão ${sessionId}`)
    pendingApprovals.delete(sessionId)
    pending.signal?.removeEventListener('abort', pending.cleanup)
    pending.resolve(outcome)
  }

  // O `approval` normalizado vem do par durável approval/asked — o waterfall
  // approval/request não traz id, logo não serve de fonte para o evento.
  function onApprovalAsked(event) {
    const approval = { type: 'approval', sessionId: event.sessionId, id: event.id, toolName: event.toolName }
    if (event.callId !== undefined) approval.callId = event.callId
    if (event.reason !== undefined) approval.reason = event.reason
    emitEvent(approval)
  }

  function onApprovalDecided(event) {
    emitEvent({ type: 'approval/decided', sessionId: event.sessionId, id: event.id, outcome: event.outcome })
  }

  function subscribe(target, name, handler, mode = 'on') {
    const method = mode === 'waterfall' ? target.waterfall
      : mode === 'projection' ? target.subscribe
      : target.on
    disposers.push(method.call(target, name, handler))
  }

  function start() {
    if (started) return
    started = true
    // Subscrição ANTES do snapshot: sessões nascidas na janela chegam pelo
    // canal ao vivo; o dedupe por sessionId evita duplicados.
    subscribe(sessions, 'session/added', addSession)
    subscribe(sessions, 'session/removed', removeSession)
    subscribe(sessions, 'agent/status', onStatus)
    subscribe(sessions, 'turn/end', onTurnEnd)
    subscribe(sessions, 'tool/call', onToolCall)
    subscribe(sessions, 'tool/result', onToolResult)
    subscribe(sessions, 'subagent/start', onSubagentStart)
    subscribe(sessions, 'subagent/end', onSubagentEnd)
    subscribe(sessions, 'request/header', onRequestHeader)
    subscribe(sessions, 'request/context', onRequestContext)
    subscribe(sessions, 'llm/retry-started', onRetry)
    subscribe(sessions, 'compaction/start', (event) => onCompaction(event, 'start'))
    subscribe(sessions, 'compaction/end', (event) => onCompaction(event, 'end'))
    subscribe(sessions, 'approval/asked', onApprovalAsked)
    subscribe(sessions, 'approval/decided', onApprovalDecided)
    subscribe(sessions, 'user-questions/request', onQuestions, 'waterfall')
    subscribe(sessions, 'approval/request', onApprovalRequest, 'waterfall')
    subscribe(projections, 'tokenUsage', onUsage, 'projection')
    for (const summary of sessions.list() ?? []) addSession(summary)
  }

  function stop() {
    if (!started) return
    started = false
    for (const dispose of disposers.splice(0)) {
      try { dispose?.() } catch { /* segue com o resto da limpeza */ }
    }
    // Reinício = reconciliação: tudo volta ao vazio para o próximo start()
    // refazer o snapshot completo (linhas de base inclusas — sem dupla contagem).
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