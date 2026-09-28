/*
 * dsh-work-game — FRONTEND-ONLY DEMO
 * No backend, plugin, DSH import, model call, filesystem access or runtime network request.
 * Teams, people, outputs, tasks and context numbers are in-memory presentation data.
 * Faces are ORIGINAL Avataaars SVGs bundled in assets/ — never redrawn here.
 *
 * VISUAL IDEAS FOR EXPRESSIONS (kept as code hooks, not wired to real events):
 *   1. STATUS → PRESET: each status maps to one Avataaars preset (see STATUS below).
 *   2. DIRECT PRESET: the "Expressões" tab sets person.expressionPreset explicitly.
 *   3. OUTPUT KIND → PRESET: tool/file lines nudge toward `tool`, results toward `success`.
 *   4. CONTEXT PRESSURE → PRESET: high simulated CTX can switch to `thinking`/`focused`.
 *   5. ONE-SHOT REACTION: `success`/`error` for 1.2s, then back to the status preset.
 *   6. IDENTITY IS FIXED: only eyeType/eyebrowType/mouthType change — hair/skin/clothes never do.
 * Real integration later would replace the simulator below with DSH events.
 */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => min + Math.random() * (max - min);

const FURNITURE = 'assets/furniture.svg';
const GRID = { cols: 3, pitchX: 940, pitchY: 730, originX: 40, originY: 40 };
const W = 900;
const THEMES = {
  blue: { color: '#2869a6', panel: '#25629b', stroke: '#244e72' },
  teal: { color: '#408a80', panel: '#378176', stroke: '#2c625b' },
  violet: { color: '#8064ae', panel: '#765ba4', stroke: '#59467c' },
  coral: { color: '#bb7861', panel: '#b36c57', stroke: '#855441' }
};
const STATUS = {
  available: { label: 'Disponível', color: '#9aa6ad', icon: 'plus', preset: 'idle' },
  working: { label: 'Trabalhando', color: '#299875', icon: 'play', preset: 'working' },
  tool: { label: 'Executando ferramenta', color: '#5e8cad', icon: 'code', preset: 'tool' },
  waiting: { label: 'Aguardando', color: '#c08c45', icon: 'hand', preset: 'waiting' },
  error: { label: 'Precisa de atenção', color: '#bd7961', icon: 'alert', preset: 'error' },
  done: { label: 'Concluído', color: '#299875', icon: 'check', preset: 'success' }
};

/* ---------- telemetry: models, prices, turn endings (everything SIMULATED) ----------
   Vocabulary mirrors the real DSH signals documented in docs/conhecimento/07-features-futuras.md:
   TokenUsage buckets (input = uncached), turn/end reason kinds, user-questions payloads. */
const CONTEXT_WARN_K = 200; /* the human-facing warning threshold: above 200k of context */
const MODELS = {
  'deepseek-chat': { id: 'deepseek-chat', label: 'deepseek-chat', provider: 'deepseek', contextWindowK: 200, prices: { input: 0.27, output: 1.10, cacheRead: 0.027, cacheWrite: 0.27 } },
  'deepseek-reasoner': { id: 'deepseek-reasoner', label: 'deepseek-reasoner', provider: 'deepseek', contextWindowK: 200, prices: { input: 0.55, output: 2.19, cacheRead: 0.055, cacheWrite: 0.55 } },
  'mimo-v2.6-pro': { id: 'mimo-v2.6-pro', label: 'mimo-v2.6-pro', provider: 'xiaomi', contextWindowK: 256, prices: { input: 0.60, output: 2.40, cacheRead: 0.06, cacheWrite: 0.60 } }
};
const MODEL_IDS = Object.keys(MODELS);
const PRICE_UNIT = 'US$ / 1M tokens';

/* turn/end reason.kind → the visual finish signal (NEVER inferred from silence). */
const FINISH_REASONS = {
  completed: { kind: 'completed', label: 'Concluído', note: 'resultado pronto', icon: 'check', color: '#299875' },
  aborted: { kind: 'aborted', label: 'Interrompido', note: 'turno cancelado', icon: 'return', color: '#c08c45' },
  interrupted: { kind: 'interrupted', label: 'Interrompido', note: 'prefixo entregue', icon: 'return', color: '#c08c45' },
  error: { kind: 'error', label: 'Erro no turno', note: 'precisa de atenção', icon: 'alert', color: '#bd7961' },
  blocked: { kind: 'blocked', label: 'Bloqueado', note: 'sem como continuar', icon: 'hand', color: '#bd7961' },
  'max-tokens': { kind: 'max-tokens', label: 'Máx. tokens', note: 'limite atingido', icon: 'alert', color: '#bd7961' }
};

/* Question payloads mirror AskUserQuestionItem: question, detail, options, multiSelect. */
const QUESTION_POOL = [
  {
    header: 'DECISÃO',
    question: 'Qual é o próximo passo desta tarefa?',
    detail: 'O agente parou e ficou à espera de uma decisão sua antes de continuar.',
    options: [{ label: 'Continuar como está' }, { label: 'Rever o plano antes de avançar', description: 'pausa e mostra o plano' }, { label: 'Cancelar esta tarefa' }]
  },
  {
    question: 'Posso alterar o arquivo de configuração?',
    detail: 'A mudança afeta o comportamento do projeto inteiro.',
    multiSelect: true,
    options: [{ label: 'Sim, pode alterar' }, { label: 'Só com a minha aprovação depois' }, { label: 'Não altere nada' }]
  },
  {
    question: 'Qual modelo devo usar nesta rodada?',
    detail: 'A escolha muda a capacidade de contexto e o custo estimado.',
    options: [{ label: 'deepseek-chat' }, { label: 'deepseek-reasoner' }, { label: 'mimo-v2.6-pro' }]
  },
  {
    question: 'Os testes que falharam devem ser corrigidos agora?',
    detail: 'Há 2 testes a falhar no último relatório.',
    options: [{ label: 'Corrigir agora' }, { label: 'Deixar para a próxima tarefa' }, { label: 'Ignorar por enquanto' }]
  }
];

const modelOf = (person) => MODELS[person.model] || MODELS['deepseek-chat'];
const windowOf = (person) => modelOf(person).contextWindowK;
function costOf(person) {
  const prices = modelOf(person).prices;
  const u = person.usage || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  return (u.input * prices.input + u.output * prices.output + u.cacheRead * prices.cacheRead + u.cacheWrite * prices.cacheWrite) / 1e6;
}
function formatUSD(n) {
  return 'US$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return 'agora';
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  return `há ${Math.floor(m / 60)} h`;
}

/* Fallback used only while expressions.js is absent; same contract as the real module. */
const FALLBACK_EXPRESSIONS = {
  basePreset: 'idle',
  namedIdentityIds: ['rui', 'bia', 'lia', 'pesquisa', 'codigo', 'testes', 'alex', 'maya'],
  randomIdentityIds: [],
  presets: [
    { id: 'idle', label: 'Disponível', eyeType: 'Default', eyebrowType: 'DefaultNatural', mouthType: 'Default', when: 'sem atividade' },
    { id: 'working', label: 'Trabalhando', eyeType: 'Squint', eyebrowType: 'FlatNatural', mouthType: 'Serious', when: 'turno em andamento' },
    { id: 'focused', label: 'Focado', eyeType: 'Squint', eyebrowType: 'AngryNatural', mouthType: 'Serious', when: 'atenção máxima' },
    { id: 'tool', label: 'Tool call', eyeType: 'Side', eyebrowType: 'RaisedExcitedNatural', mouthType: 'Twinkle', when: 'chamando ferramenta' },
    { id: 'searching', label: 'Procurando', eyeType: 'Squint', eyebrowType: 'UpDownNatural', mouthType: 'Default', when: 'lendo ou buscando' },
    { id: 'thinking', label: 'Pensando', eyeType: 'Default', eyebrowType: 'UpDown', mouthType: 'Serious', when: 'planejando' },
    { id: 'waiting', label: 'Esperando', eyeType: 'Side', eyebrowType: 'FlatNatural', mouthType: 'Default', when: 'parado' },
    { id: 'approval', label: 'Aprovação', eyeType: 'Default', eyebrowType: 'RaisedExcited', mouthType: 'Concerned', when: 'precisa de decisão' },
    { id: 'success', label: 'Concluído', eyeType: 'Happy', eyebrowType: 'RaisedExcited', mouthType: 'Smile', when: 'resultado pronto' },
    { id: 'celebrating', label: 'Comemorando', eyeType: 'Happy', eyebrowType: 'RaisedExcitedNatural', mouthType: 'Twinkle', when: 'grande vitória' },
    { id: 'error', label: 'Erro', eyeType: 'Default', eyebrowType: 'SadConcerned', mouthType: 'Sad', when: 'algo falhou' },
    { id: 'surprised', label: 'Surpreso', eyeType: 'Surprised', eyebrowType: 'UpDown', mouthType: 'Default', when: 'inesperado' },
    { id: 'disbelief', label: 'Incrédulo', eyeType: 'EyeRoll', eyebrowType: 'FlatNatural', mouthType: 'Disbelief', when: 'resultado estranho' },
    { id: 'wink', label: 'Cúmplice', eyeType: 'Wink', eyebrowType: 'DefaultNatural', mouthType: 'Smile', when: 'aquele aceno' }
  ],
  resolve(identityId, presetId) {
    if (this.namedIdentityIds.includes(identityId)) return `assets/avatars/${identityId}.svg`;
    return null;
  }
};
const EXPR = window.DSH_EXPRESSIONS || FALLBACK_EXPRESSIONS;
const DATA = window.DSH_DEMO_DATA || {
  firstNames: ['Lia', 'Rui', 'Bia', 'Tom', 'Maya', 'Alex', 'Nara', 'Caio', 'Iris', 'Otto'],
  lastNames: ['Silva', 'Rocha', 'Lima', 'Melo'],
  outputs: [
    { kind: 'file', text: 'atualizou o arquivo do projeto' },
    { kind: 'tool', text: 'rodou os testes do pacote' },
    { kind: 'test', text: 'os testes passaram' },
    { kind: 'result', text: 'resultado pronto para revisão' },
    { kind: 'message', text: 'preciso de uma decisão' }
  ],
  tasks: ['criar a tela inicial', 'corrigir os testes', 'revisar o fluxo']
};

/* ---------- tiny store ---------- */
const state = {
  teams: [], modules: [], people: [], archived: [],
  selected: null, tab: 'context', zoom: 0.5, pan: { x: 0, y: 0 },
  bubbles: new Map(), feed: [], feedOpen: true
};
let seq = 20, toastTimer, activityTimer, telemetryTimer, recruitRoll = null, delegateTarget = null, papersTarget = null, questionTarget = null, dragging = null;
let worldSize = { width: 2820, height: 730 };

const uid = (p) => `${p}-${++seq}`;
const personById = (id) => state.people.find((p) => p.id === id) || null;
const teamById = (id) => state.teams.find((t) => t.id === id) || null;
const moduleById = (id) => state.modules.find((m) => m.id === id) || null;
const teamModules = (teamId) => state.modules.filter((m) => m.teamId === teamId);
const icon = (n, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="${FURNITURE}#icon-${n}"/></svg>`;
const use = (id, x, y, w, h, extra = '') => `<use href="${FURNITURE}#${id}" x="${x}" y="${y}" width="${w}" height="${h}" ${extra}/>`;
const glyph = (id, x, y, size, color) => `<g style="color:${color}">${use(`icon-${id}`, x, y, size, size)}</g>`;
const formatK = (n) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n) + 'k';
const pct = (p) => Math.min(100, Math.round((p.context / windowOf(p)) * 100));
const overContextWarn = (p) => p.context >= CONTEXT_WARN_K;

function themeStyle(theme) {
  const t = THEMES[theme] || THEMES.blue;
  return `--desk-color:${t.color};--desk-panel:${t.panel};--desk-stroke:${t.stroke}`;
}
function toast(msg) {
  clearTimeout(toastTimer);
  $('#toast').textContent = msg;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3600);
}

/* ---------- real-time action log + live feed ----------
   Every meaningful event is logged per person AND pushed to the global feed, so the
   timeline stays accessible even after the agent is eliminated (see archivePerson). */
function logAction(person, text, kind = 'info') {
  const at = Date.now();
  person.actions.push({ text, kind, at });
  if (person.actions.length > 60) person.actions.shift();
  state.feed.unshift({
    personId: person.id, name: person.name, avatarId: person.avatarId,
    avatarKind: person.avatarKind, text, kind, at
  });
  if (state.feed.length > 200) state.feed.pop();
  renderFeed();
}
function feedIcon(kind) {
  return { tool: 'code', file: 'file', test: 'flask', result: 'check', question: 'hand', warn: 'alert', done: 'check', cost: 'context', paper: 'file' }[kind] || 'play';
}
function renderFeed() {
  const list = $('#live-feed-list');
  if (list) {
    list.innerHTML = state.feed.slice(0, 40).map((f) => `
      <li class="feed-item feed-kind-${esc(f.kind)}" data-action="select" data-agent="${f.personId}" role="button" tabindex="0" aria-label="Ação de ${esc(f.name)}: ${esc(f.text)}. Abrir pessoa.">
        <img class="feed-avatar" src="${esc(avatarSrc(f))}" alt="">
        <div class="feed-copy"><strong>${esc(f.name)}</strong><span>${esc(f.text)}</span></div>
        <time data-feed-time="${f.at}">${ago(f.at)}</time>
      </li>`).join('');
  }
  const counter = $('#live-feed-count');
  if (counter) counter.textContent = String(state.feed.length);
  updatePendingUI();
}
function updatePendingUI() {
  const pending = state.people.filter((p) => p.questions.some((q) => q.status === 'pending'));
  const btn = $('#pending-questions');
  if (btn) {
    btn.hidden = pending.length === 0;
    btn.innerHTML = `${icon('hand')}<span>${pending.length === 1 ? '1 a aguardar de ti' : `${pending.length} a aguardar de ti`}</span>`;
    btn.setAttribute('aria-label', `${pending.length} pergunta(s) por responder`);
  }
  const count = $('#archive-count');
  if (count) count.textContent = String(state.archived.length);
  const archiveBtn = $('#archive-button');
  if (archiveBtn) archiveBtn.setAttribute('aria-label', `Arquivo com ${state.archived.length} agente(s) eliminado(s)`);
}
function paintLiveValues() {
  for (const t of $$('[data-feed-time]')) t.textContent = ago(Number(t.dataset.feedTime));
  for (const p of state.people) {
    const seat = $(`g.seat[role="button"][data-agent="${p.id}"]`);
    if (!seat) continue;
    const role = seat.querySelector('.seat-card-role');
    if (role) role.textContent = seatRoleLine(p);
    seat.classList.toggle('context-over', overContextWarn(p));
  }
  const found = findSelected();
  if (found && !papersTarget && !questionTarget) {
    const p = found.person;
    const speed = $('#tv-speed');
    if (speed) speed.textContent = `${Math.round(p.tokenSpeed)} tok/s`;
    const cost = $('#tv-cost');
    if (cost) cost.textContent = formatUSD(costOf(p));
    const ctx = $('#tv-context');
    if (ctx) ctx.textContent = `~${formatK(p.context)}`;
    const agoNode = $('#tv-live-ago');
    if (agoNode) agoNode.textContent = `atualizado ${ago(Date.now())}`;
    const actList = $('#activity-list');
    if (actList) actList.innerHTML = actionsListHtml(p);
    const warn = $('#ctx-warning');
    if (warn) warn.hidden = !overContextWarn(p);
  }
}
function telemetryTick() {
  for (const p of state.people) {
    const active = p.hasComputer && !p.away && (p.status === 'working' || p.status === 'tool');
    if (active) {
      const target = p.status === 'tool' ? rand(18, 46) : rand(24, 92);
      p.tokenSpeed = p.tokenSpeed ? p.tokenSpeed * 0.55 + target * 0.45 : target;
      const produced = Math.round(p.tokenSpeed); /* ~1s of output tokens */
      p.usage.output += produced;
      p.usage.input += Math.round(produced * 0.18);
      p.usage.cacheRead += Math.round(produced * 2.1);
      p.usage.cacheWrite += Math.round(produced * 0.12);
      p.context = Math.min(windowOf(p) * 1.3, p.context + (produced / 1000) * 2.6);
      p.contextPeak = Math.max(p.contextPeak, p.context);
      if (overContextWarn(p) && !p.ctxWarned) {
        p.ctxWarned = true;
        logAction(p, `contexto acima de ${CONTEXT_WARN_K}k — compactação recomendada`, 'warn');
        toast(`${p.name} passou de ${CONTEXT_WARN_K}k de contexto.`);
      }
    } else if (p.tokenSpeed > 0) {
      p.tokenSpeed = Math.max(0, p.tokenSpeed - 12);
    }
    if (!p.contextPeak) p.contextPeak = p.context;
  }
  paintLiveValues();
}

/* ---------- people, avatars and expressions ---------- */
function randomName() { return `${pick(DATA.firstNames)} ${pick(DATA.lastNames)}`; }
function randomAvatarId() {
  const pool = EXPR.randomIdentityIds && EXPR.randomIdentityIds.length ? EXPR.randomIdentityIds : EXPR.namedIdentityIds;
  return pick(pool);
}
function avatarKindOf(id) { return (EXPR.randomIdentityIds || []).includes(id) ? 'random' : 'named'; }
function avatarSrc(person, presetId) {
  const preset = presetId || expressionOf(person);
  const resolved = EXPR.resolve && EXPR.resolve(person.avatarId, preset);
  if (resolved) return resolved;
  if (person.avatarKind === 'named') return `assets/avatars/${person.avatarId}.svg`;
  return `assets/avatars/random/${person.avatarId}/${EXPR.basePreset || 'idle'}.svg`;
}
function expressionOf(person) {
  return person.expressionPreset || (STATUS[person.status] || STATUS.available).preset || EXPR.basePreset || 'idle';
}
function makePerson({ name, avatarId, teamId }) {
  const id = avatarId || randomAvatarId();
  return {
    id: uid('person'), name: name || randomName(), avatarId: id,
    avatarKind: avatarKindOf(id), teamId,
    homeModuleId: null, homeSeat: null, away: false,
    status: 'available', context: 0, hasComputer: false, task: '',
    outputs: [], expressionPreset: null,
    model: pick(MODEL_IDS),
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    tokenSpeed: 0, contextPeak: 0, ctxWarned: false,
    taskQueue: [], questions: [], finish: null,
    actions: [], startedAt: Date.now()
  };
}
function setExpression(person, presetId) {
  /* CODE HOOK #2 — direct preset change. Identity stays untouched. */
  person.expressionPreset = presetId || null;
  render();
  const node = $(`[data-character-id="${person.id}"] image`);
  if (node && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    node.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }
}

/* ---------- layout: 3 columns × infinite rows ---------- */
function gridPos(index) {
  return {
    x: GRID.originX + (index % GRID.cols) * GRID.pitchX,
    y: GRID.originY + Math.floor(index / GRID.cols) * GRID.pitchY
  };
}
function moduleGridPos(mod) { return gridPos(state.modules.indexOf(mod)); }
function teamRunEnd(teamId) {
  let end = -1;
  state.modules.forEach((m, i) => { if (m.teamId === teamId) end = i; });
  return end;
}
function appendDelegationModule(teamId) {
  /* Delegation modules always land at the END of the team's run, so a later
     expansion insertion (right after the main table) can push them right. */
  const mod = { id: uid('module'), teamId, kind: 'delegation', seats: [null, null, null, null] };
  state.modules.splice(teamRunEnd(teamId) + 1, 0, mod);
  return mod;
}
function growTeam(teamId) {
  /* CODE HOOK — table growth. A new 4-seat module lands right after the MAIN
     table; every later module of the team (including the team table) slides right. */
  const mainIndex = state.modules.findIndex((m) => m.teamId === teamId && m.kind === 'main');
  const mod = { id: uid('module'), teamId, kind: 'expansion', seats: [null, null, null, null] };
  state.modules.splice(mainIndex + 1, 0, mod);
  return mod;
}
function freeSeatFor(teamId, includeDelegations = false) {
  for (const mod of teamModules(teamId)) {
    if (!includeDelegations && mod.kind !== 'main' && mod.kind !== 'expansion') continue;
    const idx = mod.seats.findIndex((s) => s === null);
    if (idx >= 0) return { mod, idx };
  }
  return null;
}
function addPerson(teamId, opts = {}) {
  const team = teamById(teamId);
  if (!team) return null;
  let slot = opts.slot || freeSeatFor(teamId);
  if (!slot) slot = { mod: growTeam(teamId), idx: 0 };
  const person = makePerson({ name: opts.name, avatarId: opts.avatarId, teamId });
  person.homeModuleId = slot.mod.id; person.homeSeat = slot.idx;
  slot.mod.seats[slot.idx] = person.id;
  state.people.push(person);
  return person;
}

/* ---------- seed ---------- */
function seed() {
  seq = 20;
  state.bubbles.clear();
  state.feed = [];
  state.archived = [];
  questionTarget = null;
  papersTarget = null;
  state.teams = [
    { id: 'site', name: 'Site', path: '~/workspaces/site', theme: 'blue', completed: 0 },
    { id: 'api', name: 'API & integrações', path: '~/workspaces/api', theme: 'teal', completed: 0 }
  ];
  const P = (id, name, avatarId, teamId, status, context, hasComputer, extra = {}) => ({
    id, name, avatarId, avatarKind: avatarKindOf(avatarId), teamId,
    homeModuleId: null, homeSeat: null, away: false,
    status, context, hasComputer, task: '', outputs: [], expressionPreset: null,
    model: 'deepseek-chat', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    tokenSpeed: 0, contextPeak: context, ctxWarned: context >= CONTEXT_WARN_K,
    taskQueue: [], questions: [], finish: null, actions: [], startedAt: Date.now() - 3600e3,
    ...extra
  });
  const now = Date.now();
  state.people = [
    P('p-rui', 'Rui', 'rui', 'site', 'working', 43.5, true, {
      task: 'criar a tela de login', tokenSpeed: 38,
      usage: { input: 42000, output: 61000, cacheRead: 310000, cacheWrite: 18000 },
      taskQueue: [{ id: 'paper-seed-1', text: 'criar a tela de login', status: 'active', createdAt: now - 240e3 }]
    }),
    P('p-bia', 'Bia', 'bia', 'site', 'waiting', 27.8, true, {
      tokenSpeed: 0,
      usage: { input: 21000, output: 34000, cacheRead: 150000, cacheWrite: 9000 },
      questions: [{
        id: 'q-seed-1', header: 'DECISÃO',
        question: 'Qual é o próximo passo desta tarefa?',
        detail: 'O agente parou e ficou à espera de uma decisão sua antes de continuar.',
        options: [{ label: 'Continuar como está' }, { label: 'Rever o plano antes de avançar', description: 'pausa e mostra o plano' }, { label: 'Cancelar esta tarefa' }],
        multiSelect: false, askedAt: now - 45e3, status: 'pending'
      }]
    }),
    P('p-lia', 'Lia', 'lia', 'site', 'working', 53.3, true, {
      tokenSpeed: 52,
      usage: { input: 58000, output: 84000, cacheRead: 420000, cacheWrite: 24000 }
    }),
    P('p-pesquisa', 'Pesquisa', 'pesquisa', 'site', 'working', 214.6, true, {
      tokenSpeed: 64,
      usage: { input: 210000, output: 260000, cacheRead: 2100000, cacheWrite: 110000 },
      taskQueue: [
        { id: 'paper-seed-2', text: 'comparar as duas abordagens de cache', status: 'queued', createdAt: now - 90e3 },
        { id: 'paper-seed-3', text: 'resumir as fontes encontradas', status: 'queued', createdAt: now - 40e3 }
      ]
    }),
    P('p-codigo', 'Código', 'codigo', 'site', 'tool', 36.2, true, {
      tokenSpeed: 27,
      usage: { input: 39000, output: 52000, cacheRead: 260000, cacheWrite: 15000 }
    }),
    P('p-testes', 'Testes', 'testes', 'site', 'done', 12.8, true, {
      tokenSpeed: 0,
      usage: { input: 12000, output: 19000, cacheRead: 90000, cacheWrite: 5000 },
      finish: { ...FINISH_REASONS.completed, at: now - 150e3 },
      taskQueue: [{ id: 'paper-seed-4', text: 'rodar a suíte completa', status: 'done', createdAt: now - 300e3 }]
    }),
    P('p-alex', 'Alex', 'alex', 'api', 'working', 31.6, true, {
      tokenSpeed: 45,
      usage: { input: 33000, output: 47000, cacheRead: 220000, cacheWrite: 12000 }
    }),
    P('p-maya', 'Maya', 'maya', 'api', 'available', 0, false)
  ];
  const home = (id, mod, seat) => { const p = personById(id); p.homeModuleId = mod; p.homeSeat = seat; };
  home('p-rui', 'm-site', 0); home('p-bia', 'm-site', 1); home('p-lia', 'm-site', 3);
  home('p-pesquisa', 'm-team', 1); home('p-codigo', 'm-team', 2); home('p-testes', 'm-team', 3);
  home('p-alex', 'm-api', 0); home('p-maya', 'm-api', 1);
  personById('p-lia').away = true;
  state.modules = [
    { id: 'm-site', teamId: 'site', kind: 'main', seats: ['p-rui', 'p-bia', null, 'reserved'] },
    { id: 'm-team', teamId: 'site', kind: 'delegation', seats: ['p-lia', 'p-pesquisa', 'p-codigo', 'p-testes'] },
    { id: 'm-api', teamId: 'api', kind: 'main', seats: ['p-alex', 'p-maya', null, null] }
  ];
  /* a believable opening feed so the timeline is never empty on load */
  const feedSeed = [
    ['p-pesquisa', 'contexto acima de 200k — compactação recomendada', 'warn', 210e3],
    ['p-bia', 'pergunta: qual é o próximo passo desta tarefa?', 'question', 45e3],
    ['p-rui', 'tarefa: criar a tela de login', 'message', 240e3],
    ['p-testes', 'turn/end · completed', 'done', 150e3],
    ['p-codigo', 'executou a ferramenta de build', 'tool', 60e3],
    ['p-alex', 'atualizou o arquivo do projeto', 'file', 30e3]
  ];
  for (const [pid, text, kind, dt] of feedSeed) {
    const p = personById(pid);
    if (!p) continue;
    const at = now - dt;
    p.actions.push({ text, kind, at });
    state.feed.push({ personId: pid, name: p.name, avatarId: p.avatarId, avatarKind: p.avatarKind, text, kind, at });
  }
  state.feed.sort((a, b) => b.at - a.at);
  state.selected = null; state.tab = 'context';
}

/* ---------- speech bubbles: latest output only, ~1s, animated ---------- */
function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars) { if (line) lines.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}
function bubblePosition(personId) {
  const person = personById(personId);
  if (!person) return null;
  for (const mod of state.modules) {
    const idx = mod.seats.indexOf(personId);
    if (idx >= 0) {
      const pos = moduleGridPos(mod);
      return { x: pos.x + 112.5 + idx * 225, y: pos.y + 128 };
    }
  }
  return null;
}
function showBubble(person, text, kind = 'result') {
  state.bubbles.set(person.id, { text, kind, phase: 'in', stamp: Date.now() });
  syncBubbles();
  setTimeout(() => {
    const b = state.bubbles.get(person.id);
    if (!b || b.text !== text) return;
    b.phase = 'out'; syncBubbles();
    setTimeout(() => {
      const cur = state.bubbles.get(person.id);
      if (cur && cur.text === text) { state.bubbles.delete(person.id); syncBubbles(); }
    }, 300);
  }, 1000);
}
function syncBubbles() {
  const layer = $('#bubbles-layer');
  if (!layer) return;
  const seen = new Set();
  for (const [personId, b] of state.bubbles) {
    seen.add(personId);
    const pos = bubblePosition(personId);
    if (!pos) continue;
    const lines = wrapText(b.text, 26);
    const width = Math.min(268, Math.max(132, Math.max(...lines.map((l) => l.length), 6) * 8.4 + 42));
    const height = lines.length * 21 + 40;
    const x = pos.x - width / 2, y = pos.y - height;
    let node = layer.querySelector(`[data-bubble="${personId}"]`);
    if (!node) {
      node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      node.setAttribute('data-bubble', personId);
      node.classList.add('speech-bubble', 'bubble-in');
      layer.appendChild(node);
    }
    node.classList.toggle('bubble-out', b.phase === 'out');
    node.innerHTML =
      `<rect class="bubble-body" x="${x}" y="${y}" width="${width}" height="${height}" rx="14"/>` +
      `<path class="bubble-tail" d="M${pos.x - 9} ${y + height - 1}L${pos.x} ${y + height + 15}L${pos.x + 9} ${y + height - 1}Z"/>` +
      `<text class="bubble-kind" x="${x + 14}" y="${y + 19}">${esc(b.kind.toUpperCase())}</text>` +
      lines.map((l, i) => `<text class="bubble-text" x="${x + 14}" y="${y + 39 + i * 21}">${esc(l)}</text>`).join('');
  }
  for (const node of [...layer.querySelectorAll('[data-bubble]')]) {
    if (!seen.has(node.dataset.bubble)) node.remove();
  }
}

/* ---------- simulated activity engine ---------- */
function emitOutput(person, text, kind = 'result') {
  person.outputs.push({ text, kind, at: Date.now() });
  if (person.outputs.length > 24) person.outputs.shift();
  logAction(person, text, kind);
  showBubble(person, text, kind);
}
function kindMatchesStatus(kind, status) {
  if (status === 'tool') return kind === 'tool' || kind === 'file';
  if (status === 'working') return kind === 'file' || kind === 'tool';
  if (status === 'done') return kind === 'result' || kind === 'test';
  if (status === 'error') return kind === 'message' || kind === 'result';
  if (status === 'waiting') return kind === 'message';
  return true;
}
function activityTick() {
  const workers = state.people.filter((p) => p.hasComputer && !p.away);
  if (workers.length) {
    const person = pick(workers);
    if (Math.random() < 0.42) {
      const next = pick(['working', 'tool', 'working', 'done', 'working', 'error']);
      person.status = next;
      /* CODE HOOK #3 — output kind nudges the expression, status decides the base. */
      render();
    }
    const pool = DATA.outputs.filter((o) => kindMatchesStatus(o.kind, person.status));
    const out = pick(pool.length ? pool : DATA.outputs);
    emitOutput(person, out.text, out.kind);
  }
  scheduleActivity();
}
function scheduleActivity() {
  clearTimeout(activityTimer);
  activityTimer = setTimeout(activityTick, rand(1700, 3400));
}

/* ---------- rendering ---------- */
function seatRoleLine(person) {
  if (!person.hasComputer) return `CTX — · ${person.outputs.length ? 'último output' : 'sem output'}`;
  return `CTX ~${pct(person)}% · ${formatUSD(costOf(person))} · ${Math.round(person.tokenSpeed)} tok/s`;
}
function pendingQuestionOf(person) {
  return person.questions.find((q) => q.status === 'pending') || null;
}
function questionFlagSvg(person, cx) {
  const q = pendingQuestionOf(person);
  if (!q) return '';
  return `<g class="question-flag" role="button" tabindex="0" data-action="open-question" data-agent="${person.id}" aria-label="${esc(person.name)} fez uma pergunta. Abrir pergunta.">
    <title>❓ ${esc(person.name)} fez uma pergunta — clique para responder</title>
    <circle class="question-flag-dot" cx="${cx - 72}" cy="205" r="17"/>
    <circle class="question-flag-pulse" cx="${cx - 72}" cy="205" r="17"/>
    <text class="question-flag-glyph" x="${cx - 72}" y="212" text-anchor="middle">?</text>
    <rect x="${cx - 104}" y="173" width="64" height="64" fill="transparent" pointer-events="all"/></g>`;
}
function contextWarnSvg(person, cx) {
  return `<g class="context-warn-marker" aria-hidden="true"><title>Contexto acima de ${CONTEXT_WARN_K}k</title>
    <circle cx="${cx + 72}" cy="250" r="15"/>${glyph('alert', cx + 63, 240, 18, '#795d33')}</g>`;
}
function finishRibbonSvg(person, cx) {
  const fin = person.finish;
  if (!fin) return '';
  return `<g class="finish-ribbon" data-finish="${esc(fin.kind)}" aria-hidden="true">
    <rect x="${cx - 99}" y="509" width="198" height="26" rx="13"/>
    ${glyph(fin.icon, cx - 87, 514, 16, fin.color)}
    <text x="${cx - 64}" y="526" fill="${fin.color}">${esc(fin.label)} · ${esc(fin.note)}</text></g>`;
}
function paperStackSvg(person, cx) {
  const queued = person.taskQueue.filter((t) => t.status === 'queued');
  const active = person.taskQueue.find((t) => t.status === 'active');
  if (!queued.length && !active) return '';
  const shown = queued.slice(0, 3);
  const sheets = shown.map((t, i) => `<rect class="paper-sheet" x="${-31 + i * 2}" y="${-22 - i * 5}" width="62" height="44" rx="3" transform="rotate(${i % 2 ? 2 : -2} 0 0)"/>`).join('');
  return `<g class="paper-stack" role="button" tabindex="0" data-action="open-papers" data-agent="${person.id}" transform="translate(${cx} 404)" aria-label="Pilha de ${queued.length} tarefa(s) na fila de ${esc(person.name)}. Abrir pilha de papéis.">
    <title>📋 ${queued.length} na fila — clique para ver, editar e submeter</title>
    <rect class="paper-stack-hit" x="-62" y="-52" width="124" height="96" rx="10" fill="transparent" pointer-events="all"/>
    ${active ? `<rect class="paper-active" x="${-34}" y="${-27}" width="68" height="50" rx="3" transform="rotate(1 0 0)"/>` : ''}
    ${sheets}
    ${queued.length ? `<g class="paper-count"><circle cx="36" cy="-30" r="12"/><text x="36" y="-25" text-anchor="middle">${queued.length}</text></g>` : ''}
  </g>`;
}
function renderCharacter(person, cx) {
  const src = avatarSrc(person);
  return `<g class="seat character-hit" data-action="select" data-agent="${person.id}" aria-hidden="true"><g transform="translate(${cx - 113} 147)"><g class="character" data-character-id="${person.id}" data-expression="${expressionOf(person)}"><image href="${esc(src)}" width="226" height="240" preserveAspectRatio="xMidYMax meet"/></g></g></g>`;
}
function renderSeat(mod, person, index) {
  const cx = 112.5 + index * 225;
  const hit = `<rect x="${cx - 104}" y="271" width="208" height="234" fill="transparent" pointer-events="all"/>`;
  if (typeof person === 'string' && person === 'reserved') {
    const owner = state.people.find((p) => p.homeModuleId === mod.id && p.homeSeat === index && p.away);
    const label = owner ? owner.name : 'Reservado';
    return `<g class="seat slot-reserved" role="button" tabindex="0" aria-label="${esc(label)}, lugar reservado durante delegação" data-action="select" data-agent="${owner ? owner.id : ''}">
      ${hit}${glyph('arrow', cx - 17, 290, 34, '#99a9b4')}<rect class="seat-card" x="${cx - 99}" y="426" width="198" height="77" rx="9"/>
      <text class="seat-card-name" x="${cx}" y="450" text-anchor="middle">${esc(label)}</text><text class="seat-card-role" x="${cx}" y="469" text-anchor="middle">Lugar reservado</text><text class="seat-card-status" x="${cx}" y="492" text-anchor="middle" fill="#919ea4">Em delegação ↗</text></g>`;
  }
  if (!person) {
    return `<g class="seat slot-free" role="button" tabindex="0" aria-label="Abrir nova sessão no lugar ${index + 1} desta mesa" data-action="recruit-slot" data-workspace="${mod.teamId}" data-slot="${index}" data-module="${mod.id}">
      ${hit}<circle class="empty-seat-plus" cx="${cx}" cy="307" r="24"/><text class="empty-seat-plus-sign" x="${cx}" y="318" text-anchor="middle">+</text>
      <rect class="seat-card" x="${cx - 99}" y="426" width="198" height="77" rx="9"/><text class="seat-card-name" x="${cx}" y="451" text-anchor="middle" style="font-size:18px;fill:#8b958e">Lugar livre</text><text class="seat-card-role" x="${cx}" y="473" text-anchor="middle">Clique para recrutar</text></g>`;
  }
  const info = STATUS[person.status] || STATUS.available;
  const selected = person.id === state.selected ? ' selected' : '';
  const laptop = person.hasComputer
    ? `<g class="character-laptop">${use('laptop', cx - 76, 323, 152, 95)}${glyph(info.icon === 'plus' ? 'code' : info.icon, cx - 14, 350, 28, '#f4f7f8')}</g>` : '';
  return `<g class="seat${selected}${overContextWarn(person) ? ' context-over' : ''}" role="button" tabindex="0" aria-label="Abrir ${esc(person.name)}, ${esc(info.label)}${overContextWarn(person) ? `, contexto acima de ${CONTEXT_WARN_K}k` : ''}" data-action="select" data-agent="${person.id}">
    <title>${esc(person.name)} · ${esc(info.label)} · ${esc(seatRoleLine(person))}${person.finish ? ` · ${esc(person.finish.label)}` : ''} · clique para ver contexto</title>${hit}${laptop}
    ${paperStackSvg(person, cx)}
    <rect class="seat-card" x="${cx - 99}" y="426" width="198" height="77" rx="9"/>
    <text class="seat-card-name" x="${cx}" y="450" text-anchor="middle">${esc(person.name)}</text>
    <text class="seat-card-role" x="${cx}" y="469" text-anchor="middle">${esc(seatRoleLine(person))}</text>
    <circle cx="${cx - 73}" cy="487" r="5.5" fill="${info.color}"/><text class="seat-card-status" x="${cx - 60}" y="492" fill="${info.color}">${esc(info.label)}</text>
    <rect class="selection-line" x="${cx - 33}" y="415" width="66" height="4" rx="2" fill="#3881b4"/>
    ${questionFlagSvg(person, cx)}
    ${contextWarnSvg(person, cx)}
    ${finishRibbonSvg(person, cx)}
    ${person.status === 'error' ? `<circle class="attention-marker" cx="${cx + 72}" cy="205" r="15"/>${glyph('alert', cx + 63, 195, 18, '#795d33')}` : ''}
    </g>`;
}
function renderModule(mod, index) {
  const team = teamById(mod.teamId);
  const pos = gridPos(index);
  const people = mod.seats.filter((s) => typeof s === 'string' && s !== 'reserved').length;
  const chairs = mod.seats.map((_, i) => use('chair', 112.5 + i * 225 - 81, 212, 162, 184)).join('');
  const characters = mod.seats.map((s, i) => (typeof s === 'string' && s !== 'reserved' ? renderCharacter(personById(s), 112.5 + i * 225) : '')).join('');
  const attributes = `data-workspace="${mod.teamId}" data-module-id="${mod.id}"`;
  const isLeadTable = mod.kind === 'delegation' && teamModules(mod.teamId).filter((m) => m.kind === 'delegation')[0] === mod;
  const controls = isLeadTable
    ? sceneButton(721, 111, 140, 'Nova sessão', 'recruit-slot', attributes, 'plus')
    : sceneButton(721, 111, 140, 'Nova sessão', 'recruit-slot', attributes, 'plus');
  const leadInfo = leadName(mod);
  const title = mod.kind === 'delegation'
    ? (leadInfo.coordination ? `Equipe de ${esc(leadInfo.name)}` : `Apoio de ${esc(leadInfo.name)}`)
    : team.name;
  const subtitle = mod.kind === 'delegation'
    ? `${esc(leadInfo.name)} + subagentes`
    : (mod.kind === 'expansion' ? `Mais espaço do time ${esc(team.name)}` : team.path);
  return `<g class="desk-module" data-module="${mod.id}" data-team="${mod.teamId}" data-seats="4" transform="translate(${pos.x} ${pos.y})" style="${themeStyle(mod.kind === 'delegation' ? 'violet' : team.theme)}">
      ${controls}${chairs}${characters}${use('desk', 0, 365, W, 288)}
      ${mod.seats.map((s, i) => renderSeat(mod, typeof s === 'string' && s !== 'reserved' ? personById(s) : s, i)).join('')}
      ${glyph(mod.kind === 'delegation' ? 'team' : 'browser', 64, 548, 48, '#f7f9f3')}
      <text class="desk-label" x="139" y="577">${title}</text>
      <text class="desk-subtitle" x="141" y="609">${subtitle}</text>
      <text class="desk-counter" x="840" y="610" text-anchor="end">${people}/4 lugares · ${formatUSD(deskCost(mod))} gasto</text>
    </g>`;
}
function deskCost(mod) {
  return mod.seats.reduce((sum, s) => {
    const p = typeof s === 'string' && s !== 'reserved' ? personById(s) : null;
    return sum + (p ? costOf(p) : 0);
  }, 0);
}
function leadName(mod) {
  /* A delegation table is labelled by whoever sits at seat 0 of THAT module:
     a root member coordinating (Equipe de …) or a child covering overflow (Apoio de …). */
  const seat0 = mod.seats[0];
  const owner = typeof seat0 === 'string' && seat0 !== 'reserved' ? personById(seat0) : null;
  if (owner) {
    const home = moduleById(owner.homeModuleId);
    return { name: owner.name, coordination: !home || home.kind !== 'delegation' };
  }
  const lead = state.people.find((p) => p.away && p.teamId === mod.teamId);
  return { name: lead ? lead.name : 'equipe', coordination: true };
}
function renderWorld() {
  const rows = Math.max(1, Math.ceil(state.modules.length / GRID.cols));
  worldSize = { width: GRID.originX * 2 + GRID.cols * GRID.pitchX, height: GRID.originY + rows * GRID.pitchY + 60 };
  $('#world').style.width = worldSize.width + 'px';
  $('#world').style.height = worldSize.height + 'px';
  const gridLines = [];
  for (let r = 0; r <= rows; r++) gridLines.push(`<path class="grid-line" d="M0 ${GRID.originY + r * GRID.pitchY - 20}H${worldSize.width}"/>`);
  for (let c = 0; c <= GRID.cols; c++) gridLines.push(`<path class="grid-line" d="M${GRID.originX + c * GRID.pitchX - 20} 0V${worldSize.height}"/>`);
  $('#world').innerHTML =
    `<svg class="office-scene" xmlns="http://www.w3.org/2000/svg" width="${worldSize.width}" height="${worldSize.height}" viewBox="0 0 ${worldSize.width} ${worldSize.height}" aria-label="Sala de trabalho com as mesas de todos os times">` +
    `<defs><pattern id="floor" width="72" height="72" patternUnits="userSpaceOnUse"><rect width="72" height="72" fill="#f2eee4"/><path d="M0 72L72 0M-18 18L18 -18M54 90L90 54" stroke="#ece6d7" stroke-width="2"/></pattern></defs>` +
    `<rect x="0" y="0" width="${worldSize.width}" height="${worldSize.height}" fill="url(#floor)"/>` +
    gridLines.join('') +
    state.modules.map(renderModule).join('') +
    `<g id="bubbles-layer"></g>` +
    `</svg>`;
  syncBubbles();
  $('#scene-summary').textContent = `${state.people.length} pessoas · ${state.teams.length} times · ${state.modules.length} mesas`;
  updateStats();
}
function updateStats() {
  $('#stats-people').textContent = `${state.people.length} pessoas`;
  $('#stats-teams').textContent = `${state.teams.length} times`;
  $('#stats-tables').textContent = `${state.modules.length} mesas`;
}
function sceneButton(x, y, width, label, action, attributes = '', name = 'plus') {
  return `<g class="scene-action" role="button" tabindex="0" aria-label="${esc(label)}" data-action="${action}" ${attributes} transform="translate(${x} ${y})"><rect width="${width}" height="37" rx="9" fill="#faf8f0" stroke="#d8dbcf"/>${glyph(name, 12, 10, 16, '#85939b')}<text x="36" y="24">${esc(label)}</text></g>`;
}

/* ---------- inspector ---------- */
function findSelected() {
  const person = personById(state.selected);
  if (!person) return null;
  const mod = state.modules.find((m) => m.seats.includes(person.id)) || { kind: 'main', teamId: person.teamId, seats: [] };
  return { person, mod, team: teamById(person.teamId) || { name: 'Sem time' } };
}
function contextView(person) {
  if (!person.hasComputer) return `<div class="section-heading"><h3>Contexto da sessão</h3><span class="estimated-tag">EXEMPLO</span></div><div class="context-total"><strong>—</strong><span>/ ${windowOf(person)}k tokens</span></div><div class="empty-context">Essa pessoa acabou de chegar.<br>Abra <strong>Computador</strong> e simule uma primeira tarefa para ver o notebook aparecer.</div>`;
  const win = windowOf(person);
  const parts = [
    { name: 'Conversa', value: person.context * 0.44, color: '#729bbb' },
    { name: 'Arquivos', value: person.context * 0.27, color: '#8ca997' },
    { name: 'Ferramentas', value: person.context * 0.13, color: '#bd9a66' },
    { name: 'Instruções', value: person.context * 0.16, color: '#a48ac0' }
  ];
  const cumulative = parts.reduce((list, p) => { list.push((list.at(-1) || 0) + p.value); return list; }, []);
  const cells = Array.from({ length: 72 }, (_, i) => {
    const token = ((i + 0.5) / 72) * win;
    const cat = cumulative.findIndex((n) => token < n);
    return `<span ${cat >= 0 ? `style="background:${parts[cat].color}"` : ''}></span>`;
  }).join('');
  const prices = modelOf(person).prices;
  const usageRows = [
    { key: 'input', label: 'Entrada (não-cacheada)', price: prices.input },
    { key: 'output', label: 'Saída', price: prices.output },
    { key: 'cacheRead', label: 'Leitura de cache', price: prices.cacheRead },
    { key: 'cacheWrite', label: 'Escrita de cache', price: prices.cacheWrite }
  ];
  return `<div class="section-heading"><h3>Janela de contexto</h3><span class="estimated-tag">SIMULADO</span></div>
    <div class="ctx-warning" id="ctx-warning" ${overContextWarn(person) ? '' : 'hidden'} role="alert">${icon('alert')}<span>Contexto acima de <strong>${CONTEXT_WARN_K}k</strong> — compactação recomendada.</span></div>
    <div class="context-total"><strong id="tv-context">~${formatK(person.context)}</strong><span>/ ${win}k tokens</span></div>
    <p class="context-caption">${pct(person)}% ocupado · espaço para a próxima ideia</p>
    <div class="context-bar" role="meter" aria-label="Ocupação simulada do contexto" aria-valuemin="0" aria-valuemax="${win}" aria-valuenow="${Math.round(person.context)}">${parts.map((p) => `<span style="width:${(p.value / win) * 100}%;background:${p.color}" title="${p.name}"></span>`).join('')}</div>
    <div class="context-scale"><span>0</span><span>${win}k</span></div>
    <div class="context-legend">${parts.map((p) => `<div class="context-legend-row"><i style="background:${p.color}"></i><span>${p.name}</span><strong>~${formatK(p.value)}</strong></div>`).join('')}</div>
    <div class="context-map" aria-hidden="true">${cells}</div><div class="token-map-caption">Um mapa visual do espaço ocupado.</div>
    <div class="context-message">${icon('check')}<span>Ocupação de contexto, não custo nem progresso. Os números desta demo são fictícios.</span></div>
    <div class="inspector-rule"></div>
    <div class="section-heading"><h3>Telemetria em tempo real</h3><span class="estimated-tag">SIMULADO</span></div>
    <div class="telemetry-grid">
      <div class="telemetry-cell"><small>Velocidade</small><strong id="tv-speed">${Math.round(person.tokenSpeed)} tok/s</strong></div>
      <div class="telemetry-cell"><small>Gasto acumulado</small><strong id="tv-cost">${formatUSD(costOf(person))}</strong></div>
      <div class="telemetry-cell"><small>Pico de contexto</small><strong>~${formatK(person.contextPeak)}</strong></div>
      <div class="telemetry-cell"><small>Último turno</small><strong>${person.finish ? esc(person.finish.label) : '—'}</strong></div>
    </div>
    <p class="simulation-label">Atualizado a cada segundo. ${PRICE_UNIT} · tabela simulada.</p>
    <div class="cost-table">${usageRows.map((r) => `<div class="cost-row"><span>${r.label}</span><code>${(person.usage[r.key] || 0).toLocaleString('pt-BR')} × US$ ${r.price.toFixed(3)}</code><strong>${formatUSD(((person.usage[r.key] || 0) * r.price) / 1e6)}</strong></div>`).join('')}</div>
    <div class="model-row"><label for="model-select">Modelo</label>
      <select id="model-select" aria-label="Modelo da pessoa">${MODEL_IDS.map((id) => `<option value="${id}" ${person.model === id ? 'selected' : ''}>${MODELS[id].label}</option>`).join('')}</select></div>
    <p class="inspector-note">Trocar de modelo recalcula a janela e o preço. Sem preço conhecido, o custo seria "indisponível" — nunca zero.</p>`;
}
function computerView(person) {
  const logs = person.outputs.slice(-6).reverse();
  const queued = person.taskQueue.filter((t) => t.status === 'queued');
  return `<div class="section-heading"><h3>${person.hasComputer ? 'O que está acontecendo' : 'A primeira tarefa começa aqui.'}</h3><span class="estimated-tag">DEMO</span></div>
    <textarea id="demo-task" class="task-textarea" maxlength="300" placeholder="Ex.: criar a tela inicial do projeto…" aria-label="Tarefa de demonstração">${esc(person.task)}</textarea>
    <button class="button button-primary button-full" data-action="simulate-task">${icon('play')}Enviar tarefa</button>
    <p class="simulation-label">Nada é enviado. Apenas muda a cena e o balão de output.</p>
    <div class="inspector-rule"></div>
    <div class="section-heading"><h3>Pilha de papéis</h3><span class="estimated-tag">${queued.length} na fila</span></div>
    <p class="simulation-label" style="margin:0 0 8px">Mais uma tarefa entra na fila como um papel na mesa. Enquanto não for submetida, pode ser editada ou submetida já.</p>
    <textarea id="paper-task" class="task-textarea" maxlength="300" placeholder="Escreva mais uma tarefa para a pilha…" aria-label="Nova tarefa para a pilha de papéis"></textarea>
    <div class="queue-actions">
      <button class="button button-light" data-action="queue-task">${icon('file')}Colocar na mesa</button>
      <button class="button button-violet" data-action="queue-task-now">${icon('play')}Submeter agora</button>
      <button class="button button-quiet" data-action="open-papers" data-agent="${person.id}">Abrir pilha (${person.taskQueue.length})</button>
    </div>
    <div class="inspector-rule"></div>
    <div class="section-heading"><h3>Outputs recentes</h3><span class="estimated-tag">${person.outputs.length} itens</span></div>
    ${person.hasComputer && logs.length ? `<ol class="activity">${logs.map((o) => `<li>${icon(o.kind === 'file' ? 'file' : o.kind === 'tool' ? 'code' : o.kind === 'test' ? 'flask' : o.kind === 'message' ? 'hand' : 'check')}<div><strong>${esc(o.text)}</strong><small>${esc(o.kind)} · apareceu no balão por 1s</small></div></li>`).join('')}</ol>`
      : `<div class="empty-context">Sem outputs ainda. Simule uma tarefa e observe o balão acima da cabeça.</div>`}
    <div class="inspector-rule"></div>
    <div class="section-heading"><h3>Estado visual</h3><span class="estimated-tag">SIMULADO</span></div>
    <div class="simulation-controls">${Object.entries(STATUS).map(([key, s]) => `<button data-action="set-status" data-status="${key}" class="${person.status === key ? 'active' : ''}" aria-pressed="${person.status === key}">${icon(s.icon)}${s.label}</button>`).join('')}</div>
    <p class="simulation-label">O estado muda rótulo, ícone e expressão. Nenhum evento real do DSH existe aqui.</p>`;
}
function actionsListHtml(person) {
  const actions = person.actions.slice(-16).reverse();
  if (!actions.length) return `<div class="empty-context">Sem ações registadas ainda.</div>`;
  return `<ol class="activity live-actions">${actions.map((a) => `<li class="feed-kind-${esc(a.kind)}">${icon(feedIcon(a.kind))}<div><strong>${esc(a.text)}</strong><small data-feed-time="${a.at}">${ago(a.at)}</small></div></li>`).join('')}</ol>`;
}
function activityView(person) {
  const pending = pendingQuestionOf(person);
  const answered = person.questions.filter((q) => q.status !== 'pending');
  return `<div class="section-heading"><h3>Ações em tempo real</h3><span class="estimated-tag">LIVE</span></div>
    <p class="simulation-label" style="margin:0 0 8px">Cada evento desta pessoa fica registado aqui e no feed global, mesmo depois de ela sair da sala.</p>
    <div id="activity-list">${actionsListHtml(person)}</div>
    <div class="inspector-rule"></div>
    <div class="section-heading"><h3>Fim de turno</h3><span class="estimated-tag">${person.finish ? 'turn/end' : '—'}</span></div>
    ${person.finish
      ? `<div class="finish-card" data-finish="${esc(person.finish.kind)}">${icon(person.finish.icon)}<div><strong>${esc(person.finish.label)}</strong><small>${esc(person.finish.note)} · ${ago(person.finish.at)}</small></div></div>`
      : `<div class="empty-context">Turno em curso. O fim só aparece com um sinal <code>turn/end</code> — silêncio nunca conta como feito.</div>`}
    <div class="inspector-rule"></div>
    <div class="section-heading"><h3>Perguntas</h3><span class="estimated-tag">${person.questions.length} registadas</span></div>
    ${pending ? `<div class="question-card pending">${icon('hand')}<div><strong>${esc(pending.question)}</strong><small>à espera · ${ago(pending.askedAt)}</small></div>
      <button class="button button-primary" data-action="open-question" data-agent="${person.id}">Responder</button></div>` : ''}
    ${answered.length ? `<ol class="activity">${answered.slice(-5).reverse().map((q) => `<li>${icon(q.status === 'answered' ? 'check' : 'close')}<div><strong>${esc(q.question)}</strong><small>${q.status === 'answered' ? `resposta: ${esc((q.answer && (q.answer.custom || (q.answer.selected || []).join(', '))) || '—')}` : 'cancelada'} · ${ago(q.resolvedAt || q.askedAt)}</small></div></li>`).join('')}</ol>` : ''}
    ${!pending && !answered.length ? `<div class="empty-context">Sem perguntas. O sinal ❓ aparece sobre a cabeça quando esta pessoa pede uma decisão.</div>` : ''}`;
}
function expressionsView(person) {
  const current = expressionOf(person);
  return `<div class="section-heading"><h3>Códigos de expressão</h3><span class="estimated-tag">AVATAAARS</span></div>
    <p class="simulation-label" style="margin:0 0 4px">Os presets abaixo usam os enums reais da biblioteca. A identidade (cabelo, pele, roupa) nunca muda — só olhos, sobrancelhas e boca.</p>
    <div class="expression-grid">${(EXPR.presets || []).map((p) => `
      <button class="expression-card ${current === p.id ? 'active' : ''}" data-action="set-expression" data-expression="${p.id}" aria-pressed="${current === p.id}">
        <strong>${esc(p.label)}</strong>
        <code>${esc(p.eyeType)}/${esc(p.eyebrowType)}/${esc(p.mouthType)}</code>
        <small>${esc(p.when || '')}</small>
      </button>`).join('')}</div>
    <div class="inspector-actions"><button class="button button-light button-full" data-action="set-expression" data-expression="">${icon('return')}Voltar à expressão automática</button></div>
    <p class="inspector-note">CODE HOOK: STATUS → preset · output → preset · preset direto · reação de 1,2s.</p>`;
}
function renderInspector() {
  const found = findSelected();
  if (!found) { $('#inspector').hidden = true; return; }
  const { person, mod, team } = found;
  const info = STATUS[person.status] || STATUS.available;
  $('#inspector').hidden = false;
  $('#inspector').innerHTML = `<div class="inspector-top"><span>UMA PESSOA, MUITAS IDEIAS</span><button class="icon-button" data-action="close-inspector" aria-label="Fechar painel">${icon('close')}</button></div>
    <div class="agent-heading"><div class="inspector-avatar"><img src="${esc(avatarSrc(person))}" alt="Avatar Avataaars de ${esc(person.name)}"></div>
      <div><h2>${esc(person.name)}</h2><p>${esc(team.name)} · ${esc(mod.kind === 'delegation' ? 'mesa de equipe' : mod.kind === 'expansion' ? 'mesa expandida' : 'mesa principal')}</p>
      <span class="small-status" style="color:${info.color}"><span class="live-dot" style="background:${info.color}"></span>${person.away ? 'Em delegação · ' : ''}${info.label}</span></div></div>
    <div class="inspector-tabs" role="tablist">
      <button role="tab" aria-selected="${state.tab === 'context'}" class="${state.tab === 'context' ? 'active' : ''}" data-action="tab" data-tab="context">${icon('context')}Contexto</button>
      <button role="tab" aria-selected="${state.tab === 'computer'}" class="${state.tab === 'computer' ? 'active' : ''}" data-action="tab" data-tab="computer">${icon('code')}Computador</button>
      <button role="tab" aria-selected="${state.tab === 'activity'}" class="${state.tab === 'activity' ? 'active' : ''}" data-action="tab" data-tab="activity">${icon('play')}Atividade</button>
      <button role="tab" aria-selected="${state.tab === 'expressions'}" class="${state.tab === 'expressions' ? 'active' : ''}" data-action="tab" data-tab="expressions">${icon('brush')}Expressões</button>
    </div>
    <div class="inspector-content" role="tabpanel">
      ${state.tab === 'context' ? contextView(person) : state.tab === 'computer' ? computerView(person) : state.tab === 'activity' ? activityView(person) : expressionsView(person)}
      <div class="inspector-actions">
        <div class="inspector-rule"></div>
        <div class="section-heading"><h3>Simulador de eventos DSH</h3><span class="estimated-tag">DEMO</span></div>
        <p class="simulation-label">A cena obedece ao DSH: o utilizador não move pessoas. Mesa de equipe e retorno acontecem apenas quando chega um evento real de subagente.</p>
        <div class="simulation-controls">
          <button data-action="sim-event" data-event="subagent-start">${icon('team')}subagent/start</button>
          <button data-action="sim-event" data-event="subagent-end">${icon('return')}subagent/end</button>
          <button data-action="sim-event" data-event="turn-end">${icon('check')}turn/end · completed</button>
          <button data-action="sim-event" data-event="turn-error">${icon('alert')}turn/end · error</button>
          <button data-action="sim-event" data-event="turn-abort">${icon('close')}turn/end · aborted</button>
          <button data-action="sim-event" data-event="question">${icon('hand')}user-questions</button>
          <button data-action="sim-event" data-event="context-pressure">${icon('context')}contextPressure &gt; 200k</button>
          <button data-action="sim-event" data-event="tool-call">${icon('code')}tool/call</button>
        </div>
        <button class="button button-danger button-full" data-action="eliminate-agent" data-agent="${person.id}">${icon('close')}Eliminar pessoa (guarda o histórico)</button>
      </div>
      <p class="inspector-note">Só frontend. Custos, tokens e velocidade são estimativas simuladas — sem agentes nem chamadas reais.</p>
    </div>`;
}

function render({ fit = false } = {}) {
  renderWorld();
  renderInspector();
  renderFeed();
  if (fit) requestAnimationFrame(fitScene);
}

/* ---------- camera ---------- */
function updateTransform() {
  $('#world').style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
  $('#zoom-value').textContent = Math.round(state.zoom * 100) + '%';
  $('#zoom-out').disabled = state.zoom <= 0.16;
  $('#zoom-in').disabled = state.zoom >= 1.5;
}
function fitScene() {
  const box = $('#viewport').getBoundingClientRect();
  state.zoom = Math.max(0.16, Math.min((box.width - 40) / worldSize.width, (box.height - 80) / worldSize.height, 1));
  state.pan.x = (box.width - worldSize.width * state.zoom) / 2;
  state.pan.y = (box.height - worldSize.height * state.zoom) / 2;
  updateTransform();
}
function zoomAt(next, clientX, clientY) {
  const bounds = $('#viewport').getBoundingClientRect();
  const x = (clientX ?? bounds.left + bounds.width / 2) - bounds.left;
  const y = (clientY ?? bounds.top + bounds.height / 2) - bounds.top;
  const old = state.zoom;
  next = Math.max(0.16, Math.min(1.5, next));
  state.pan.x = x - ((x - state.pan.x) * next) / old;
  state.pan.y = y - ((y - state.pan.y) * next) / old;
  state.zoom = next;
  updateTransform();
}

/* ---------- interactions ---------- */
function selectAgent(id) {
  const person = personById(id);
  if (!person) return;
  const wasOpen = !$('#inspector').hidden;
  state.selected = id;
  render();
  if (!wasOpen && innerWidth > 800) requestAnimationFrame(fitScene);
}
function openRecruit(teamId, slot, moduleId) {
  const team = teamById(teamId) || state.teams[0];
  recruitRoll = { teamId: team.id, slot: slot ?? null, moduleId: moduleId || null, name: randomName(), avatarId: randomAvatarId() };
  $('#recruit-team').innerHTML = state.teams.map((t) => `<option value="${t.id}" ${t.id === team.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  paintRecruitRoll();
  $('#recruit-dialog').showModal();
}
function paintRecruitRoll() {
  $('#recruit-name').textContent = recruitRoll.name;
  const probe = { avatarId: recruitRoll.avatarId, avatarKind: avatarKindOf(recruitRoll.avatarId), status: 'available', expressionPreset: null };
  $('#recruit-avatar').src = avatarSrc(probe, EXPR.basePreset || 'idle');
  $('#recruit-avatar').alt = `Avatar sorteado para ${recruitRoll.name}`;
}
function openDelegate(agentId) {
  const person = personById(agentId);
  if (!person) return;
  delegateTarget = { personId: person.id };
  $('#delegate-title').textContent = `Uma equipe para ${person.name}.`;
  $('#delegate-form').reset();
  $('#delegate-dialog').showModal();
}
function delegate(personId, count) {
  const person = personById(personId);
  if (!person || person.away) return;
  const teamId = person.teamId;
  const before = $(`[data-character-id="${person.id}"]`)?.getBoundingClientRect();
  let delegation = state.modules.find((m) => m.teamId === teamId && m.kind === 'delegation');
  if (!delegation) delegation = appendDelegationModule(teamId);
  /* home seat becomes a visual reservation — the avatar is NEVER duplicated */
  const home = moduleById(person.homeModuleId);
  if (home) home.seats[person.homeSeat] = 'reserved';
  person.away = true;
  let target = delegation;
  let seat = target.seats.indexOf(null);
  if (seat < 0) { target = appendDelegationModule(teamId); seat = 0; }
  target.seats[seat] = person.id;
  for (let i = 0; i < count; i++) {
    let mod = state.modules.find((m) => m.teamId === teamId && m.kind === 'delegation' && m.seats.includes(null));
    if (!mod) mod = appendDelegationModule(teamId);
    const idx = mod.seats.indexOf(null);
    const child = makePerson({ teamId });
    child.status = 'working'; child.hasComputer = true; child.context = rand(9, 38); child.away = true;
    child.homeModuleId = mod.id; child.homeSeat = idx;
    mod.seats[idx] = child.id;
    state.people.push(child);
    emitOutput(child, pick(DATA.outputs).text, pick(DATA.outputs).kind);
  }
  person.status = 'working'; person.hasComputer = true;
  if (!person.context) person.context = 22.4;
  render({ fit: true });
  animateTransfer(person.id, before);
  toast(`${person.name} reuniu a equipe. As mesas se encaixam sozinhas.`);
}
function returnTeam(teamId) {
  const team = teamById(teamId);
  if (!team) return;
  const delegationModules = state.modules.filter((m) => m.teamId === teamId && m.kind === 'delegation');
  const isSubagent = (p) => p.away && delegationModules.some((m) => m.id === p.homeModuleId);
  const returning = state.people.filter((p) => p.away && p.teamId === teamId && !isSubagent(p));
  const children = state.people.filter(isSubagent);
  if (!returning.length && !children.length) return;
  const before = $(`[data-character-id="${returning[0]?.id}"]`)?.getBoundingClientRect();
  team.completed += children.length;
  for (const lead of returning) {
    lead.outputs.push({ text: `${children.length} resultados da equipe recebidos`, kind: 'result', at: Date.now() });
    lead.away = false; lead.status = 'done'; lead.expressionPreset = null;
    const home = moduleById(lead.homeModuleId);
    if (home) home.seats[lead.homeSeat] = lead.id;
  }
  /* eliminated children keep their history accessible in the Arquivo */
  for (const child of children) archivePerson(child, 'subagent/end · equipe recolhida');
  state.people = state.people.filter((p) => !children.includes(p));
  state.modules = state.modules.filter((m) => !delegationModules.includes(m));
  for (const m of state.modules) m.seats = m.seats.map((s) => (children.some((c) => c.id === s) ? null : s));
  if (children.some((c) => c.id === state.selected)) state.selected = returning[0]?.id || null;
  render({ fit: true });
  if (returning[0]) {
    animateTransfer(returning[0].id, before);
    showBubble(returning[0], `${children.length} resultados da equipe recebidos`, 'result');
  }
  const names = returning.map((p) => p.name).join(', ') || 'A equipe';
  toast(`${names} voltou ao lugar original. Equipe recolhida.`);
}
function animateTransfer(id, before) {
  /* FRONTEND-ONLY MOTION: the ONE avatar element lifts and slides to its new
     seat. It never clones a person and never touches real execution. */
  if (!before || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  requestAnimationFrame(() => {
    const el = $(`[data-character-id="${id}"]`);
    if (!el) return;
    const after = el.getBoundingClientRect();
    const dx = (before.left - after.left) / state.zoom;
    const dy = (before.top - after.top) / state.zoom;
    el.animate(
      [
        { transform: `translate(${dx}px,${dy}px)` },
        { transform: `translate(${dx}px,${dy - 38}px)`, offset: 0.17 },
        { transform: 'translate(0,-38px)', offset: 0.81 },
        { transform: 'translate(0,0)' }
      ],
      { duration: 900, easing: 'cubic-bezier(.3,.05,.25,1)' }
    );
  });
}

/* ---------- turn endings: explicit signals only (turn/end reason.kind) ---------- */
function finishTurn(person, reasonKey = 'completed') {
  const fin = FINISH_REASONS[reasonKey] || FINISH_REASONS.completed;
  person.finish = { ...fin, at: Date.now() };
  person.status = fin.kind === 'completed' ? 'done'
    : (fin.kind === 'error' || fin.kind === 'blocked' || fin.kind === 'max-tokens') ? 'error' : 'waiting';
  person.expressionPreset = null;
  const activePaper = person.taskQueue.find((t) => t.status === 'active');
  if (activePaper) activePaper.status = fin.kind === 'completed' ? 'done' : 'failed';
  emitOutput(person, `turn/end · ${fin.kind}`, fin.kind === 'completed' ? 'result' : 'message');
  render();
  toast(`${person.name}: ${fin.label.toLowerCase()} — ${fin.note}.`);
}

/* ---------- questions: flag on the person → bottom sheet with options + input ---------- */
function askQuestion(person) {
  const existing = pendingQuestionOf(person);
  if (existing) { openQuestionSheet(person.id); return; }
  const tpl = pick(QUESTION_POOL);
  const q = {
    id: uid('question'), header: tpl.header || 'PERGUNTA', question: tpl.question, detail: tpl.detail || '',
    options: (tpl.options || []).map((o) => ({ ...o })), multiSelect: !!tpl.multiSelect,
    askedAt: Date.now(), status: 'pending', answer: null, resolvedAt: null
  };
  person.questions.push(q);
  person.status = 'waiting';
  person.expressionPreset = null;
  logAction(person, `pergunta: ${q.question}`, 'question');
  render();
  toast(`${person.name} fez uma pergunta. Clique no sinal ❓ para responder.`);
}
function openQuestionSheet(personId) {
  const person = personById(personId);
  const q = person && pendingQuestionOf(person);
  if (!person || !q) return;
  questionTarget = { personId: person.id, questionId: q.id };
  $('#question-title').textContent = q.question;
  $('#question-detail').textContent = q.detail || '';
  $('#question-header').textContent = q.header || 'PERGUNTA';
  $('#question-options').innerHTML = `<legend>${q.multiSelect ? 'Escolha uma ou mais opções' : 'Escolha uma opção'}</legend>` +
    q.options.map((o, i) => `<label class="question-option"><input type="${q.multiSelect ? 'checkbox' : 'radio'}" name="question-option" value="${esc(o.label)}" ${i === 0 && !q.multiSelect ? '' : ''}><span><strong>${esc(o.label)}</strong>${o.description ? `<small>${esc(o.description)}</small>` : ''}</span></label>`).join('');
  $('#question-custom').value = '';
  const asker = $('#question-asker');
  asker.innerHTML = `<img src="${esc(avatarSrc(person))}" alt="Avatar de ${esc(person.name)}">
    <div><strong>${esc(person.name)}</strong><small>perguntou ${ago(q.askedAt)} · aguarda resposta</small></div>`;
  $('#question-overlay').hidden = false;
  $('#question-sheet').hidden = false;
  $('#question-sheet').classList.add('sheet-in');
  const first = $('#question-options input');
  if (first) first.focus();
}
function closeQuestionSheet() {
  questionTarget = null;
  $('#question-overlay').hidden = true;
  $('#question-sheet').hidden = true;
  $('#question-sheet').classList.remove('sheet-in');
}
function resolveQuestion(status) {
  const person = personById(questionTarget && questionTarget.personId);
  const q = person && person.questions.find((x) => x.id === questionTarget.questionId);
  if (!person || !q) { closeQuestionSheet(); return; }
  const selected = $$('#question-options input:checked').map((i) => i.value);
  const custom = $('#question-custom').value.trim();
  if (status === 'answered' && !selected.length && !custom) {
    toast('Escolha uma opção ou escreva uma resposta antes de responder.');
    return;
  }
  q.status = status;
  q.answer = { selected, custom };
  q.resolvedAt = Date.now();
  person.status = status === 'answered' ? 'working' : 'available';
  person.expressionPreset = null;
  if (status === 'answered') {
    const answerText = custom || selected.join(', ');
    logAction(person, `resposta: ${answerText}`, 'result');
    showBubble(person, `resposta: ${answerText}`, 'message');
    toast(`Resposta entregue a ${person.name}.`);
  } else {
    logAction(person, 'pergunta cancelada pelo utilizador', 'warn');
    toast(`Pergunta de ${person.name} cancelada.`);
  }
  closeQuestionSheet();
  render();
}

/* ---------- paper stack: queued prompts on the desk, editable until submitted ---------- */
function addPaper(person, text, submitNow = false) {
  const paper = { id: uid('paper'), text, status: 'queued', createdAt: Date.now() };
  person.taskQueue.push(paper);
  logAction(person, `papel na fila: ${text}`, 'paper');
  if (submitNow) submitPaper(person, paper.id);
  else { render(); toast(`Papel de ${person.name} colocado na mesa. ${person.taskQueue.filter((t) => t.status === 'queued').length} na fila.`); }
}
function submitPaper(person, paperId) {
  const paper = person.taskQueue.find((t) => t.id === paperId);
  if (!paper || paper.status === 'active') return;
  for (const other of person.taskQueue) if (other.status === 'active') other.status = 'done';
  paper.status = 'active';
  submitTaskNow(person, paper.text, paper);
}
function submitTaskNow(person, text, paper = null) {
  person.task = text;
  person.hasComputer = true;
  person.status = 'working';
  person.finish = null; /* a new task retires the previous finish badge */
  person.expressionPreset = null;
  if (!person.context) person.context = rand(10, 22);
  if (paper) paper.status = 'active';
  else {
    for (const other of person.taskQueue) if (other.status === 'active') other.status = 'done';
    const fresh = { id: uid('paper'), text, status: 'active', createdAt: Date.now() };
    person.taskQueue.push(fresh);
  }
  emitOutput(person, `tarefa: ${text}`, 'message');
  render();
  const laptop = $(`[data-character-id="${person.id}"]`)?.closest('.desk-module')?.querySelectorAll('.character-laptop');
  laptop?.forEach((n) => n.classList.add('laptop-arriving'));
  toast(`Notebook pronto. A tarefa de ${person.name} é só simulação.`);
}
function removePaper(person, paperId) {
  const paper = person.taskQueue.find((t) => t.id === paperId);
  if (!paper || paper.status !== 'queued') return;
  person.taskQueue = person.taskQueue.filter((t) => t.id !== paperId);
  logAction(person, `papel removido da fila: ${paper.text}`, 'paper');
  render();
}
function openPapers(personId) {
  const person = personById(personId);
  if (!person) return;
  papersTarget = { personId: person.id };
  renderPapersDialog();
  $('#papers-dialog').showModal();
}
function renderPapersDialog() {
  const person = personById(papersTarget && papersTarget.personId);
  if (!person) return;
  $('#papers-title').textContent = `A pilha de papéis de ${person.name}`;
  $('#papers-subtitle').textContent = 'Cada papel é um prompt na fila. Enquanto não for submetido, pode ser editado ou submetido já.';
  const labels = { queued: 'na fila', active: 'em execução', done: 'concluída', failed: 'falhou' };
  $('#papers-list').innerHTML = person.taskQueue.length
    ? [...person.taskQueue].reverse().map((t) => `
      <li class="paper-row paper-${t.status}" data-paper="${t.id}">
        <div class="paper-row-head"><span class="paper-chip">${labels[t.status] || t.status}</span><small>criado ${ago(t.createdAt)}</small></div>
        <textarea class="paper-text" data-paper-edit="${t.id}" maxlength="300" ${t.status === 'queued' ? '' : 'readonly'} aria-label="Prompt do papel">${esc(t.text)}</textarea>
        <div class="paper-row-actions">
          ${t.status === 'queued' ? `<button class="button button-violet" data-action="submit-paper" data-paper="${t.id}">${icon('play')}Submeter agora</button>
            <button class="button button-quiet" data-action="remove-paper" data-paper="${t.id}">${icon('close')}Remover</button>` : ''}
          ${t.status === 'active' ? `<span class="paper-note">este papel está a ser executado agora</span>` : ''}
          ${t.status === 'done' ? `<span class="paper-note">tarefa concluída · histórico preservado</span>` : ''}
          ${t.status === 'failed' ? `<span class="paper-note">turno terminou sem sucesso</span>` : ''}
        </div>
      </li>`).join('')
    : `<li class="empty-context">A pilha está vazia. Use "Colocar na mesa" para deixar aqui a próxima tarefa.</li>`;
}

/* ---------- eliminated agents: the history stays accessible ---------- */
function archivePerson(person, reason) {
  logAction(person, `eliminado — ${reason}`, 'warn');
  state.archived.unshift({
    id: person.id, name: person.name, avatarId: person.avatarId, avatarKind: person.avatarKind,
    teamName: (teamById(person.teamId) || { name: 'Sem time' }).name,
    reason, eliminatedAt: Date.now(), startedAt: person.startedAt,
    status: person.status, finish: person.finish ? { ...person.finish } : null,
    model: person.model, usage: { ...person.usage }, cost: costOf(person),
    context: person.context, contextPeak: person.contextPeak, tokenSpeed: person.tokenSpeed,
    actions: person.actions.map((a) => ({ ...a })),
    outputs: person.outputs.map((o) => ({ ...o })),
    papers: person.taskQueue.map((t) => ({ ...t })),
    questions: person.questions.map((q) => ({ ...q }))
  });
}
function eliminatePerson(person, reason = 'eliminado pelo utilizador (demo)') {
  archivePerson(person, reason);
  for (const mod of state.modules) mod.seats = mod.seats.map((s) => (s === person.id ? null : s));
  state.people = state.people.filter((p) => p.id !== person.id);
  if (state.selected === person.id) state.selected = null;
  render({ fit: true });
  toast(`${person.name} foi eliminado. O histórico fica no Arquivo.`);
}
function renderArchive() {
  const list = $('#archive-list');
  if (!list) return;
  list.innerHTML = state.archived.length
    ? state.archived.map((a, i) => `
      <article class="archive-card" data-archive-card="${i}">
        <header class="archive-head">
          <img class="archive-avatar" src="${esc(avatarSrc(a))}" alt="Avatar de ${esc(a.name)}">
          <div class="archive-who"><strong>${esc(a.name)}</strong><small>${esc(a.teamName)} · eliminado ${ago(a.eliminatedAt)} · ${esc(a.reason)}</small></div>
          <button class="button button-light" data-action="archive-detail" data-archive="${i}" aria-expanded="false">Ver histórico</button>
        </header>
        <div class="archive-stats">
          <div><small>Gasto total</small><strong>${formatUSD(a.cost)}</strong></div>
          <div><small>Tokens (saída)</small><strong>${(a.usage.output || 0).toLocaleString('pt-BR')}</strong></div>
          <div><small>Pico de contexto</small><strong>~${formatK(a.contextPeak)}</strong></div>
          <div><small>Ações</small><strong>${a.actions.length}</strong></div>
          <div><small>Papéis</small><strong>${a.papers.length}</strong></div>
          <div><small>Modelo</small><strong>${esc(a.model)}</strong></div>
        </div>
        <div class="archive-detail" data-archive-detail="${i}" hidden>
          <h4>Últimas ações</h4>
          <ol class="activity">${a.actions.slice(-12).reverse().map((act) => `<li>${icon(feedIcon(act.kind))}<div><strong>${esc(act.text)}</strong><small>${ago(act.at)}</small></div></li>`).join('') || '<li>Sem ações.</li>'}</ol>
          <h4>Papéis (prompts)</h4>
          <ul class="archive-papers">${a.papers.map((t) => `<li><span class="paper-chip">${esc(t.status)}</span><span>${esc(t.text)}</span></li>`).join('') || '<li>Sem papéis.</li>'}</ul>
          ${a.finish ? `<h4>Fim de turno</h4><p class="simulation-label">${esc(a.finish.label)} · ${esc(a.finish.note)} · ${ago(a.finish.at)}</p>` : ''}
        </div>
      </article>`).join('')
    : `<div class="empty-context">Ninguém foi eliminado ainda. Quando alguém sair da sala, o histórico completo fica guardado aqui.</div>`;
}

/* ---------- events ---------- */
function handleAction(el) {
  const d = el.dataset;
  const found = findSelected();
  switch (d.action) {
    case 'select': selectAgent(d.agent); break;
    case 'close-inspector': state.selected = null; render({ fit: true }); break;
    case 'tab': state.tab = d.tab; renderInspector(); break;
    case 'recruit-slot': openRecruit(d.workspace, d.slot !== undefined && d.slot !== '' ? Number(d.slot) : null, d.moduleId || d.module || null); break;
    case 'reroll': recruitRoll.name = randomName(); recruitRoll.avatarId = randomAvatarId(); paintRecruitRoll(); break;
    case 'delegate-agent': openDelegate(d.agent); break;
    case 'more-children': if (found) openDelegate(found.person.id); break;
    case 'add-module': {
      const team = teamById(d.workspace);
      if (team) { growTeam(team.id); render({ fit: true }); toast('Mesa encaixada. Clique num lugar livre para recrutar.'); }
      break;
    }
    case 'return': returnTeam(d.workspace); break;
    case 'set-status': {
      if (!found) break;
      found.person.status = d.status;
      found.person.expressionPreset = null;
      if (d.status !== 'available') { found.person.hasComputer = true; if (!found.person.context) found.person.context = rand(12, 30); }
      const label = (STATUS[d.status] || STATUS.available).label.toLowerCase();
      emitOutput(found.person, `estado: ${label}`, d.status === 'error' ? 'message' : 'result');
      render();
      break;
    }
    case 'set-expression': {
      if (!found) break;
      setExpression(found.person, d.expression || null);
      break;
    }
    case 'sim-event': {
      // FIDELIDADE AO DSH: o utilizador não move pessoas — só injeta o MESMO
      // evento que o harness emite. Mesa de equipe e retorno nascem daqui.
      const atual = findSelected();
      if (!atual) break;
      const p = atual.person;
      if (d.event === 'subagent-start' && !p.away) {
        delegate(p.id, 3);
      } else if (d.event === 'subagent-end') {
        returnTeam(p.teamId);
      } else if (d.event === 'turn-end') {
        finishTurn(p, 'completed');
      } else if (d.event === 'turn-error') {
        finishTurn(p, 'error');
      } else if (d.event === 'turn-abort') {
        finishTurn(p, 'aborted');
      } else if (d.event === 'question') {
        askQuestion(p);
      } else if (d.event === 'context-pressure') {
        p.context = Math.max(p.context, 214.6);
        p.contextPeak = Math.max(p.contextPeak, p.context);
        if (!p.ctxWarned) {
          p.ctxWarned = true;
          logAction(p, `contexto acima de ${CONTEXT_WARN_K}k — compactação recomendada`, 'warn');
        }
        p.hasComputer = true;
        render();
        toast(`${p.name} está com o contexto acima de ${CONTEXT_WARN_K}k — veja o aviso.`);
      } else if (d.event === 'tool-call') {
        p.status = 'tool';
        p.hasComputer = true;
        p.expressionPreset = null;
        p.tokenSpeed = rand(18, 46);
        emitOutput(p, 'executou a ferramenta de build', 'tool');
        render();
      }
      break;
    }
    case 'simulate-task': {
      if (!found) break;
      const text = $('#demo-task').value.trim() || pick(DATA.tasks);
      submitTaskNow(found.person, text);
      break;
    }
    case 'queue-task': {
      if (!found) break;
      const text = $('#paper-task').value.trim() || pick(DATA.tasks);
      addPaper(found.person, text);
      break;
    }
    case 'queue-task-now': {
      if (!found) break;
      const text = $('#paper-task').value.trim() || pick(DATA.tasks);
      addPaper(found.person, text, true);
      break;
    }
    case 'open-papers': openPapers(d.agent || (found && found.person.id)); break;
    case 'submit-paper': {
      const person = personById(papersTarget && papersTarget.personId);
      if (person) { submitPaper(person, d.paper); renderPapersDialog(); }
      break;
    }
    case 'remove-paper': {
      const person = personById(papersTarget && papersTarget.personId);
      if (person) { removePaper(person, d.paper); renderPapersDialog(); }
      break;
    }
    case 'paper-queue': {
      const person = personById(papersTarget && papersTarget.personId);
      const text = $('#paper-input').value.trim();
      if (person && text) { addPaper(person, text); $('#paper-input').value = ''; renderPapersDialog(); }
      break;
    }
    case 'paper-submit-now': {
      const person = personById(papersTarget && papersTarget.personId);
      const text = $('#paper-input').value.trim();
      if (person && text) { addPaper(person, text, true); $('#paper-input').value = ''; renderPapersDialog(); }
      break;
    }
    case 'open-question': openQuestionSheet(d.agent || (found && found.person.id)); break;
    case 'close-question-sheet': closeQuestionSheet(); break;
    case 'cancel-question': resolveQuestion('cancelled'); break;
    case 'toggle-feed': {
      state.feedOpen = !state.feedOpen;
      $('#live-feed').classList.toggle('collapsed', !state.feedOpen);
      break;
    }
    case 'open-archive': renderArchive(); $('#archive-dialog').showModal(); break;
    case 'archive-detail': {
      const detail = $(`[data-archive-detail="${d.archive}"]`);
      const btn = $(`[data-action="archive-detail"][data-archive="${d.archive}"]`);
      if (detail) {
        detail.hidden = !detail.hidden;
        if (btn) {
          btn.setAttribute('aria-expanded', String(!detail.hidden));
          btn.textContent = detail.hidden ? 'Ver histórico' : 'Ocultar histórico';
        }
      }
      break;
    }
    case 'eliminate-agent': {
      const person = personById(d.agent) || (found && found.person);
      if (person) eliminatePerson(person);
      break;
    }
  }
}
document.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]');
  if (action) handleAction(action);
  const close = e.target.closest('[data-close-dialog]');
  if (close) close.closest('dialog').close();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && questionTarget) { closeQuestionSheet(); return; }
  const btn = e.target.closest('g[role="button"]');
  if (btn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleAction(btn); }
  if (e.key === 'Escape' && state.selected && !document.querySelector('dialog[open]') && !questionTarget) { state.selected = null; render({ fit: true }); }
});
document.addEventListener('change', (e) => {
  if (e.target.id !== 'model-select') return;
  const found = findSelected();
  if (!found) return;
  const before = windowOf(found.person);
  found.person.model = e.target.value;
  const after = windowOf(found.person);
  logAction(found.person, `modelo alterado para ${modelOf(found.person).label} (janela ${before}k → ${after}k)`, 'cost');
  render();
  toast(`Modelo de ${found.person.name}: ${modelOf(found.person).label}.`);
});
document.addEventListener('input', (e) => {
  const edit = e.target.closest('[data-paper-edit]');
  if (!edit) return;
  const person = personById(papersTarget && papersTarget.personId);
  const paper = person && person.taskQueue.find((t) => t.id === edit.dataset.paperEdit);
  if (paper && paper.status === 'queued') paper.text = edit.value;
});
for (const dialog of $$('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
}
$('#new-workspace').addEventListener('click', () => { $('#workspace-form').reset(); $('#workspace-dialog').showModal(); });
$('#recruit-agent').addEventListener('click', () => openRecruit(state.teams[0]?.id));
$('#reset-demo').addEventListener('click', () => {
  for (const d of $$('dialog[open]')) d.close();
  seed(); render({ fit: true }); scheduleActivity();
  toast('Cena inicial restaurada. Pode experimentar de novo.');
});
$('#workspace-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  const name = String(data.get('name')).trim();
  if (!name) return;
  const id = uid('team');
  const theme = THEMES[data.get('color')] ? data.get('color') : 'blue';
  state.teams.push({ id, name, path: String(data.get('path')).trim() || `~/workspaces/${name.toLowerCase().replace(/\s+/g, '-')}`, theme, completed: 0 });
  state.modules.push({ id: uid('module'), teamId: id, kind: 'main', seats: [null, null, null, null] });
  $('#workspace-dialog').close();
  render({ fit: true });
  toast(`${name} ganhou uma mesa na sala.`);
});
$('#recruit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const teamId = $('#recruit-team').value;
  const slot = recruitRoll.slot;
  const mod = slot != null ? state.modules.find((m) => m.id === recruitRoll.moduleId && m.teamId === teamId) : null;
  const person = addPerson(teamId, {
    name: recruitRoll.name,
    avatarId: recruitRoll.avatarId,
    slot: mod ? { mod, idx: slot } : null
  });
  if (!person) { toast('Não foi possível adicionar agora.'); return; }
  $('#recruit-dialog').close();
  render({ fit: true });
  toast(`${person.name} chegou! Clique nela para dar a primeira tarefa.`);
});
$('#delegate-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!delegateTarget) return;
  const count = Math.min(24, Math.max(1, Math.trunc(Number($('#subagent-count').value) || 3)));
  $('#delegate-dialog').close();
  delegate(delegateTarget.personId, count);
});
$('#question-form').addEventListener('submit', (e) => {
  e.preventDefault();
  resolveQuestion('answered');
});
$('#question-overlay').addEventListener('click', closeQuestionSheet);
$('#papers-dialog').addEventListener('close', () => { papersTarget = null; });
$('#archive-button').addEventListener('click', () => { renderArchive(); $('#archive-dialog').showModal(); });
$('#pending-questions').addEventListener('click', () => {
  const person = state.people.find((p) => p.questions.some((q) => q.status === 'pending'));
  if (person) openQuestionSheet(person.id);
});
$('#zoom-in').addEventListener('click', () => zoomAt(state.zoom * 1.18));
$('#zoom-out').addEventListener('click', () => zoomAt(state.zoom / 1.18));
$('#fit-scene').addEventListener('click', fitScene);
$('#viewport').addEventListener('wheel', (e) => {
  if (e.target.closest('.zoom-controls')) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomAt(state.zoom * Math.exp(-e.deltaY * 0.008), e.clientX, e.clientY);
  else { state.pan.x -= e.deltaX; state.pan.y -= e.deltaY; updateTransform(); }
}, { passive: false });
$('#viewport').addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('[data-action],button')) return;
  dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: { ...state.pan } };
  try { $('#viewport').setPointerCapture(e.pointerId); } catch { /* eventos sintéticos de teste */ }
  $('#viewport').classList.add('dragging');
});
$('#viewport').addEventListener('pointermove', (e) => {
  if (!dragging || dragging.id !== e.pointerId) return;
  state.pan.x = dragging.pan.x + e.clientX - dragging.x;
  state.pan.y = dragging.pan.y + e.clientY - dragging.y;
  updateTransform();
});
const stopDrag = () => { dragging = null; $('#viewport').classList.remove('dragging'); };
$('#viewport').addEventListener('pointerup', stopDrag);
$('#viewport').addEventListener('pointercancel', stopDrag);
$('#viewport').addEventListener('lostpointercapture', stopDrag);
$('#viewport').addEventListener('focusin', (e) => {
  if (!e.target.matches('g[role="button"]')) return;
  const t = e.target.getBoundingClientRect();
  const v = $('#viewport').getBoundingClientRect();
  let dx = 0, dy = 0;
  if (t.left < v.left + 18) dx = v.left + 18 - t.left;
  else if (t.right > v.right - 18) dx = v.right - 18 - t.right;
  if (t.top < v.top + 44) dy = v.top + 44 - t.top;
  else if (t.bottom > v.bottom - 66) dy = v.bottom - 66 - t.bottom;
  if (dx || dy) { state.pan.x += dx; state.pan.y += dy; updateTransform(); }
});
$('#viewport').addEventListener('keydown', (e) => {
  if (e.target !== $('#viewport')) return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(state.zoom * 1.18); }
  if (e.key === '-') { e.preventDefault(); zoomAt(state.zoom / 1.18); }
  if (e.key === '0') { e.preventDefault(); fitScene(); }
  const move = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
  if (move) { e.preventDefault(); state.pan.x += move[0]; state.pan.y += move[1]; updateTransform(); }
});
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitScene, 120); });

/* boot */
seed();
render({ fit: true });
scheduleActivity();
telemetryTimer = setInterval(telemetryTick, 1000);
