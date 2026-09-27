/*
 * dsh-plugin/src/state.js — lógica PURA do escritório de agentes (dsh-work-game).
 *
 * Não vê o DSH: recebe apenas eventos normalizados {type, ...} (docs/contratos-plugin.md,
 * secção 1) e devolve SEMPRE um estado NOVO — nunca muta o estado de entrada e não usa
 * relógio, timers nem aleatoriedade (determinístico e testável).
 *
 * API exportada (contrato, secção 2, nada mais):
 *   createOfficeState()          -> estado inicial vazio
 *   applyEvent(state, event)     -> novo estado após o evento
 *   personView(state, sessionId) -> apresentação pronta para a UI (ou null)
 *   officeView(state)            -> { people, teams, alerts }
 *   setPrices(state, map)        -> novo estado com a tabela de preços trocada
 */

/* turn/end.kind (vocabulário fechado) → status visível de ciclo de vida.
 * Só 'completed' produz 'done' — silêncio/inatividade nunca conta como conclusão. */
const TURN_END_STATUS = {
  completed: 'done',
  aborted: 'aborted',
  blocked: 'blocked',
  'max-tokens': 'blocked',
  error: 'error',
  interrupted: 'aborted'
};

const STATUS_LABELS = {
  idle: 'à espera',
  working: 'trabalhando',
  done: 'Concluído',
  aborted: 'interrompido',
  blocked: 'bloqueado',
  error: 'erro'
};

/* Ferramenta "de leitura/pesquisa" ganha 🔍; as restantes 🔧 (tabela em
 * docs/conhecimento/07-features-futuras.md, feature 3). */
const READ_TOOL_RE = /^(read|search|grep|find|list|ls|cat|fetch|lookup|query|browse|open)/i;

/* Buffer de outputs por pessoa; a expiração de ~1s na UI é responsabilidade do cliente. */
const MAX_OUTPUTS = 6;

/* Indica se o evento pertence ao prefixo herdado de um fork (já contado pelo pai):
 * anti-dupla-contagem quando o evento trouxer seq e inheritedEventCount. */
function isInherited(event) {
  return (
    typeof event.seq === 'number' &&
    typeof event.inheritedEventCount === 'number' &&
    event.seq < event.inheritedEventCount
  );
}

/* Emoji mais relevante, por precedência: ❓/⚖️ > ⚠️ > 🔧/📝/🔍 > 🔄/📦/🤝 > ✅/⏹️/🚫 > 💤.
 * Só um emoji fica visível; os restantes vivem no painel. */
function deriveEmoji(person) {
  if (person.question) return { emoji: '❓', label: 'Aguardando resposta' };
  if (person.approvals.length > 0) return { emoji: '⚖️', label: 'Precisa de aprovação' };
  if (person.status === 'error') return { emoji: '⚠️', label: 'Erro' };
  if (person.lastTool && person.lastTool.phase === 'call') {
    return READ_TOOL_RE.test(person.lastTool.name)
      ? { emoji: '🔍', label: 'Pesquisando' }
      : { emoji: '🔧', label: 'Usando ferramenta' };
  }
  if (person.retrying) return { emoji: '🔄', label: 'Retentativa' };
  if (person.compacting) return { emoji: '📦', label: 'Compactando contexto' };
  if (person.subagents.length > 0) return { emoji: '🤝', label: 'Coordenando subagentes' };
  switch (person.status) {
    case 'working': return { emoji: '📝', label: 'Trabalhando' };
    case 'done': return { emoji: '✅', label: 'Concluído' };
    case 'aborted': return { emoji: '⏹️', label: 'Interrompido' };
    case 'blocked': return { emoji: '🚫', label: 'Bloqueado' };
    default: return { emoji: '💤', label: 'Ocioso' };
  }
}

/* Expressão Avataaars derivada — vocabulário fechado idle/working/tool/waiting/
 * success/error — com override vencedor quando definido (ex.: 'approval'). */
function deriveExpression(person) {
  if (person.expressionOverride) return person.expressionOverride;
  if (person.question) return 'waiting';
  if (person.approvals.length > 0) return 'waiting';
  if (person.status === 'error') return 'error';
  if (person.lastTool && person.lastTool.phase === 'call') return 'tool';
  if (person.status === 'done') return 'success';
  if (person.status === 'working') return 'working';
  return 'idle';
}

/* Recalcula e guarda os campos derivados no estado (emoji/expression). */
function refresh(person) {
  const e = deriveEmoji(person);
  person.emoji = e.emoji;
  person.expression = deriveExpression(person);
}

/* Registra uma entrada no buffer de outputs (mais recente primeiro). */
function pushOutput(person, entry) {
  person.outputs.unshift(entry);
  if (person.outputs.length > MAX_OUTPUTS) person.outputs.length = MAX_OUTPUTS;
}

function createPerson(sessionId, event) {
  return {
    id: sessionId,
    name: event.name ?? sessionId,
    avatar: event.avatar ?? null,
    workspaceId: event.workspaceId ?? null,
    status: 'idle',
    emoji: '💤',
    expression: 'idle',
    ctx: null,
    model: event.model ? { provider: null, model: event.model, contextWindow: null } : null,
    cost: null,
    question: null,
    approvals: [],
    subagents: [],
    outputs: [],
    /* campos internos (não apresentar diretamente) */
    expressionOverride: null,
    retrying: false,
    compacting: false,
    lastTool: null,
    usages: null
  };
}

/* Custo por delta dos 4 buckets × preço do modelo no momento (trocar de modelo
 * não reescreve o histórico). Sem preço na tabela → custo indisponível (null).
 * O snapshot de usos avança sempre (inclusive em eventos herdados) para que o
 * primeiro delta próprio nunca arraste o prefixo do pai. */
function applyUsage(person, prices, event) {
  const curr = {
    uncachedInput: event.uncachedInput ?? 0,
    output: event.output ?? 0,
    cacheRead: event.cacheRead ?? 0,
    cacheWrite: event.cacheWrite ?? 0
  };
  if (!isInherited(event)) {
    const prev = person.usages ?? { uncachedInput: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const price = event.model ? prices[event.model] : undefined;
    if (price) {
      const delta = (a, b) => Math.max(0, a - b);
      person.cost = (person.cost ?? 0)
        + delta(curr.uncachedInput, prev.uncachedInput) * (price.input ?? 0)
        + delta(curr.output, prev.output) * (price.output ?? 0)
        + delta(curr.cacheRead, prev.cacheRead) * (price.cacheRead ?? 0)
        + delta(curr.cacheWrite, prev.cacheWrite) * (price.cacheWrite ?? 0);
    } else {
      person.cost = null; /* custo indisponível */
    }
  }
  person.usages = curr;
}

export function createOfficeState() {
  return { people: {}, prices: {} };
}

export function applyEvent(state, event) {
  if (!state || !event || typeof event.type !== 'string') return state;
  const next = structuredClone(state);

  switch (event.type) {
    case 'session/added': {
      if (event.sessionId != null && !next.people[event.sessionId]) {
        next.people[event.sessionId] = createPerson(event.sessionId, event);
      }
      return next; /* idempotente: sessão já catalogada não é recriada */
    }
    case 'session/removed': {
      if (event.sessionId != null) delete next.people[event.sessionId];
      return next;
    }
    default: break;
  }

  const person = next.people[event.sessionId];
  if (!person) return next; /* eventos de sessão desconhecida são ignorados */

  /* Qualquer evento pode trazer um campo opcional `expression` (override da
   * expressão derivada; null limpa o override). */
  if (event.expression !== undefined) person.expressionOverride = event.expression;

  switch (event.type) {
    case 'status': {
      person.status = event.status === 'running' ? 'working' : 'idle';
      person.retrying = false;
      person.compacting = false;
      person.lastTool = null; /* turno novo: sinal de ferramenta anterior caducou */
      break;
    }
    case 'turn/end': {
      if (Object.hasOwn(TURN_END_STATUS, event.kind)) person.status = TURN_END_STATUS[event.kind];
      person.retrying = false;
      person.compacting = false;
      person.lastTool = null;
      break;
    }
    case 'tool': {
      person.lastTool = { name: event.name ?? 'desconhecida', phase: event.phase, ok: event.ok ?? true };
      if (event.phase === 'result') {
        if (event.ok === false) person.status = 'error'; /* ⚠️ também por tool/result */
        pushOutput(person, { kind: 'tool', text: person.lastTool.name, ok: event.ok !== false });
      }
      break;
    }
    case 'question': {
      /* Pergunta é persistente; uma nova substitui a ativa e a antiga fica no painel. */
      if (person.question) pushOutput(person, { kind: 'question', text: person.question.text });
      person.question = {
        id: event.id,
        text: event.text ?? '',
        options: event.options ?? null,
        multiSelect: event.multiSelect ?? false
      };
      break;
    }
    case 'question/answered': {
      if (person.question && person.question.id === event.id) {
        pushOutput(person, { kind: 'question', text: person.question.text });
        person.question = null;
      }
      break;
    }
    case 'approval': {
      const entrada = { id: event.id, toolName: event.toolName, callId: event.callId ?? null, reason: event.reason ?? null };
      const i = person.approvals.findIndex((a) => a.id === event.id);
      if (i >= 0) person.approvals[i] = entrada;
      else person.approvals.push(entrada);
      break;
    }
    case 'approval/decided': {
      person.approvals = person.approvals.filter((a) => a.id !== event.id);
      break;
    }
    case 'subagent/start': {
      const entrada = { childId: event.childId, runId: event.runId, local: event.local ?? true };
      const i = person.subagents.findIndex((s) => s.runId === event.runId);
      if (i >= 0) person.subagents[i] = entrada;
      else person.subagents.push(entrada);
      break;
    }
    case 'subagent/end': {
      const antes = person.subagents.length;
      person.subagents = person.subagents.filter(
        (s) => !(s.runId === event.runId && s.childId === event.childId)
      );
      if (person.subagents.length !== antes) {
        pushOutput(person, {
          kind: 'subagent',
          text: `Subagente ${event.childId} terminou (${event.stopReason ?? 'desconhecido'})`
        });
      }
      break;
    }
    case 'usage': {
      applyUsage(person, next.prices, event);
      break;
    }
    case 'model': {
      person.model = {
        provider: event.provider ?? person.model?.provider ?? null,
        model: event.model ?? person.model?.model ?? null,
        contextWindow: event.contextWindow !== undefined ? event.contextWindow : person.model?.contextWindow ?? null
      };
      /* CTX: used = projectedTokens ?? pressureTokens; window = contextWindow.
       * Campos last-wins independentes; sem ambos → null (UI mostra "CTX —"). */
      const used = event.projectedTokens ?? event.pressureTokens;
      const window = event.contextWindow !== undefined ? event.contextWindow : undefined;
      if (used !== undefined || window !== undefined) {
        const base = person.ctx ?? { used: null, window: null };
        const u = used !== undefined ? used : base.used;
        const w = window !== undefined ? window : base.window;
        person.ctx = { used: u, window: w, ratio: u != null && w != null ? u / w : null };
      }
      break;
    }
    case 'retry': {
      person.retrying = true;
      break;
    }
    case 'compaction': {
      person.compacting = event.phase === 'start';
      break;
    }
    default: break; /* tipo desconhecido: sem efeito */
  }

  refresh(person);
  return next;
}

export function personView(state, sessionId) {
  const p = state?.people?.[sessionId];
  if (!p) return null;
  const e = deriveEmoji(p);
  return {
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    status: p.status,
    statusLabel: STATUS_LABELS[p.status] ?? p.status,
    emoji: e.emoji,
    emojiLabel: e.label,
    expression: deriveExpression(p),
    ctx: p.ctx,
    model: p.model,
    cost: p.cost,
    question: p.question ? { ...p.question } : null,
    approvals: [...p.approvals],
    subagents: [...p.subagents],
    outputs: [...p.outputs]
  };
}

/* Mesas = agrupamento por workspaceId (sem workspaceId → mesa "solo"). */
function groupTeams(pessoas) {
  const ordem = [];
  const porMesa = new Map();
  for (const p of pessoas) {
    const chave = p.workspaceId ?? 'solo';
    if (!porMesa.has(chave)) {
      porMesa.set(chave, []);
      ordem.push(chave);
    }
    porMesa.get(chave).push(p.id);
  }
  return ordem.map((chave) => ({
    id: chave,
    label: chave === 'solo' ? 'Solo' : chave,
    people: porMesa.get(chave)
  }));
}

/* Alertas globais: contagens de perguntas e aprovações pendentes. */
function buildAlerts(pessoas) {
  const alerts = [];
  const perguntas = pessoas.filter((p) => p.question).length;
  if (perguntas > 0) {
    alerts.push({
      id: 'questions',
      level: 'info',
      message: `${perguntas} ${perguntas === 1 ? 'pergunta' : 'perguntas'} a aguardar resposta`
    });
  }
  const aprovacoes = pessoas.reduce((n, p) => n + p.approvals.length, 0);
  if (aprovacoes > 0) {
    alerts.push({
      id: 'approvals',
      level: 'warning',
      message: `${aprovacoes} ${aprovacoes === 1 ? 'aprovação' : 'aprovações'} a aguardar decisão`
    });
  }
  return alerts;
}

export function officeView(state) {
  const pessoas = Object.values(state?.people ?? {});
  return {
    people: pessoas.map((p) => personView(state, p.id)),
    teams: groupTeams(pessoas),
    alerts: buildAlerts(pessoas)
  };
}

/* Troca a tabela de preços (mapa modelId → {input, output, cacheRead, cacheWrite},
 * unidades a gosto do chamador, ex.: USD por 1M de tokens). Devolve novo estado;
 * custos já acumulados não são reescritos — cada período cobra pelo preço do
 * modelo da altura. */
export function setPrices(state, prices) {
  const next = structuredClone(state);
  next.prices = prices && typeof prices === 'object' ? { ...prices } : {};
  return next;
}