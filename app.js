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
const CAPACITY = 128;
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
  teams: [], modules: [], people: [],
  selected: null, tab: 'context', zoom: 0.5, pan: { x: 0, y: 0 },
  bubbles: new Map()
};
let seq = 20, toastTimer, activityTimer, recruitRoll = null, delegateTarget = null, dragging = null;
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
const pct = (p) => Math.min(100, Math.round((p.context / CAPACITY) * 100));

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
    outputs: [], expressionPreset: null
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
  state.teams = [
    { id: 'site', name: 'Site', path: '~/workspaces/site', theme: 'blue', completed: 0 },
    { id: 'api', name: 'API & integrações', path: '~/workspaces/api', theme: 'teal', completed: 0 }
  ];
  const P = (id, name, avatarId, teamId, status, context, hasComputer) => ({
    id, name, avatarId, avatarKind: avatarKindOf(avatarId), teamId,
    homeModuleId: null, homeSeat: null, away: false,
    status, context, hasComputer, task: '', outputs: [], expressionPreset: null
  });
  state.people = [
    P('p-rui', 'Rui', 'rui', 'site', 'working', 43.5, true),
    P('p-bia', 'Bia', 'bia', 'site', 'working', 27.8, true),
    P('p-lia', 'Lia', 'lia', 'site', 'working', 53.3, true),
    P('p-pesquisa', 'Pesquisa', 'pesquisa', 'site', 'working', 18.4, true),
    P('p-codigo', 'Código', 'codigo', 'site', 'tool', 36.2, true),
    P('p-testes', 'Testes', 'testes', 'site', 'working', 12.8, true),
    P('p-alex', 'Alex', 'alex', 'api', 'working', 31.6, true),
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
    return `<g class="seat slot-free" role="button" tabindex="0" aria-label="Recrutar pessoa no lugar ${index + 1} desta mesa" data-action="recruit-slot" data-workspace="${mod.teamId}" data-slot="${index}" data-module="${mod.id}">
      ${hit}<circle class="empty-seat-plus" cx="${cx}" cy="307" r="24"/><text class="empty-seat-plus-sign" x="${cx}" y="318" text-anchor="middle">+</text>
      <rect class="seat-card" x="${cx - 99}" y="426" width="198" height="77" rx="9"/><text class="seat-card-name" x="${cx}" y="451" text-anchor="middle" style="font-size:18px;fill:#8b958e">Lugar livre</text><text class="seat-card-role" x="${cx}" y="473" text-anchor="middle">Clique para recrutar</text></g>`;
  }
  const info = STATUS[person.status] || STATUS.available;
  const selected = person.id === state.selected ? ' selected' : '';
  const laptop = person.hasComputer
    ? `<g class="character-laptop">${use('laptop', cx - 76, 323, 152, 95)}${glyph(info.icon === 'plus' ? 'code' : info.icon, cx - 14, 350, 28, '#f4f7f8')}</g>` : '';
  return `<g class="seat${selected}" role="button" tabindex="0" aria-label="Abrir ${esc(person.name)}, ${esc(info.label)}" data-action="select" data-agent="${person.id}">
    <title>${esc(person.name)} · ${esc(info.label)} · clique para ver contexto</title>${hit}${laptop}
    <rect class="seat-card" x="${cx - 99}" y="426" width="198" height="77" rx="9"/>
    <text class="seat-card-name" x="${cx}" y="450" text-anchor="middle">${esc(person.name)}</text>
    <text class="seat-card-role" x="${cx}" y="469" text-anchor="middle">CTX ${person.hasComputer ? '~' + pct(person) + '%' : '—'} · ${person.outputs.length ? 'último output' : 'sem output'}</text>
    <circle cx="${cx - 73}" cy="487" r="5.5" fill="${info.color}"/><text class="seat-card-status" x="${cx - 60}" y="492" fill="${info.color}">${esc(info.label)}</text>
    <rect class="selection-line" x="${cx - 33}" y="415" width="66" height="4" rx="2" fill="#3881b4"/>
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
    ? sceneButton(548, 111, 149, 'Subagentes', 'more-children', attributes, 'plus') + sceneButton(710, 111, 151, 'Voltar à mesa', 'return', attributes, 'return')
    : sceneButton(721, 111, 140, 'Recrutar', 'recruit-slot', attributes, 'plus');
  const title = mod.kind === 'delegation'
    ? (isLeadTable ? `Equipe de ${esc(leadName(mod))}` : `Apoio de ${esc(leadName(mod))}`)
    : team.name;
  const subtitle = mod.kind === 'delegation'
    ? `${esc(leadName(mod))} + subagentes`
    : (mod.kind === 'expansion' ? `Mais espaço do time ${esc(team.name)}` : team.path);
  return `<g class="desk-module" data-module="${mod.id}" data-team="${mod.teamId}" data-seats="4" transform="translate(${pos.x} ${pos.y})" style="${themeStyle(mod.kind === 'delegation' ? 'violet' : team.theme)}">
      ${controls}${chairs}${characters}${use('desk', 0, 365, W, 288)}
      ${mod.seats.map((s, i) => renderSeat(mod, typeof s === 'string' && s !== 'reserved' ? personById(s) : s, i)).join('')}
      ${glyph(mod.kind === 'delegation' ? 'team' : 'browser', 64, 548, 48, '#f7f9f3')}
      <text class="desk-label" x="139" y="577">${title}</text>
      <text class="desk-subtitle" x="141" y="609">${subtitle}</text>
      <text class="desk-counter" x="840" y="610" text-anchor="end">${people}/4 lugares</text>
    </g>`;
}
function leadName(mod) {
  const lead = state.people.find((p) => p.away && p.teamId === mod.teamId);
  return lead ? lead.name : 'equipe';
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
  if (!person.hasComputer) return `<div class="section-heading"><h3>Contexto da sessão</h3><span class="estimated-tag">EXEMPLO</span></div><div class="context-total"><strong>—</strong><span>/ 128k tokens</span></div><div class="empty-context">Essa pessoa acabou de chegar.<br>Abra <strong>Computador</strong> e simule uma primeira tarefa para ver o notebook aparecer.</div>`;
  const parts = [
    { name: 'Conversa', value: person.context * 0.44, color: '#729bbb' },
    { name: 'Arquivos', value: person.context * 0.27, color: '#8ca997' },
    { name: 'Ferramentas', value: person.context * 0.13, color: '#bd9a66' },
    { name: 'Instruções', value: person.context * 0.16, color: '#a48ac0' }
  ];
  const cumulative = parts.reduce((list, p) => { list.push((list.at(-1) || 0) + p.value); return list; }, []);
  const cells = Array.from({ length: 72 }, (_, i) => {
    const token = ((i + 0.5) / 72) * CAPACITY;
    const cat = cumulative.findIndex((n) => token < n);
    return `<span ${cat >= 0 ? `style="background:${parts[cat].color}"` : ''}></span>`;
  }).join('');
  return `<div class="section-heading"><h3>Janela de contexto</h3><span class="estimated-tag">SIMULADO</span></div>
    <div class="context-total"><strong>~${formatK(person.context)}</strong><span>/ 128k tokens</span></div>
    <p class="context-caption">${pct(person)}% ocupado · espaço para a próxima ideia</p>
    <div class="context-bar" role="meter" aria-label="Ocupação simulada do contexto" aria-valuemin="0" aria-valuemax="128" aria-valuenow="${person.context}">${parts.map((p) => `<span style="width:${(p.value / CAPACITY) * 100}%;background:${p.color}" title="${p.name}"></span>`).join('')}</div>
    <div class="context-scale"><span>0</span><span>128k</span></div>
    <div class="context-legend">${parts.map((p) => `<div class="context-legend-row"><i style="background:${p.color}"></i><span>${p.name}</span><strong>~${formatK(p.value)}</strong></div>`).join('')}</div>
    <div class="context-map" aria-hidden="true">${cells}</div><div class="token-map-caption">Um mapa visual do espaço ocupado.</div>
    <div class="context-message">${icon('check')}<span>Ocupação de contexto, não custo nem progresso. Os números desta demo são fictícios.</span></div>`;
}
function computerView(person) {
  const logs = person.outputs.slice(-6).reverse();
  return `<div class="section-heading"><h3>${person.hasComputer ? 'O que está acontecendo' : 'A primeira tarefa começa aqui.'}</h3><span class="estimated-tag">DEMO</span></div>
    <textarea id="demo-task" class="task-textarea" maxlength="300" placeholder="Ex.: criar a tela inicial do projeto…" aria-label="Tarefa de demonstração">${esc(person.task)}</textarea>
    <button class="button button-primary button-full" data-action="simulate-task">${icon('play')}Simular tarefa</button>
    <p class="simulation-label">Nada é enviado. Apenas muda a cena e o balão de output.</p>
    <div class="inspector-rule"></div>
    <div class="section-heading"><h3>Outputs recentes</h3><span class="estimated-tag">${person.outputs.length} itens</span></div>
    ${person.hasComputer && logs.length ? `<ol class="activity">${logs.map((o) => `<li>${icon(o.kind === 'file' ? 'file' : o.kind === 'tool' ? 'code' : o.kind === 'test' ? 'flask' : o.kind === 'message' ? 'hand' : 'check')}<div><strong>${esc(o.text)}</strong><small>${esc(o.kind)} · apareceu no balão por 1s</small></div></li>`).join('')}</ol>`
      : `<div class="empty-context">Sem outputs ainda. Simule uma tarefa e observe o balão acima da cabeça.</div>`}
    <div class="inspector-rule"></div>
    <div class="section-heading"><h3>Estado visual</h3><span class="estimated-tag">SIMULADO</span></div>
    <div class="simulation-controls">${Object.entries(STATUS).map(([key, s]) => `<button data-action="set-status" data-status="${key}" class="${person.status === key ? 'active' : ''}" aria-pressed="${person.status === key}">${icon(s.icon)}${s.label}</button>`).join('')}</div>
    <p class="simulation-label">O estado muda rótulo, ícone e expressão. Nenhum evento real do DSH existe aqui.</p>`;
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
      <button role="tab" aria-selected="${state.tab === 'expressions'}" class="${state.tab === 'expressions' ? 'active' : ''}" data-action="tab" data-tab="expressions">${icon('brush')}Expressões</button>
    </div>
    <div class="inspector-content" role="tabpanel">
      ${state.tab === 'context' ? contextView(person) : state.tab === 'computer' ? computerView(person) : expressionsView(person)}
      <div class="inspector-actions">
        ${!person.away ? `<button class="button button-violet button-full" data-action="delegate-agent" data-agent="${person.id}">${icon('team')}Montar uma equipe</button>` : ''}
        ${mod.kind === 'delegation' ? `<button class="button button-light button-full" data-action="add-module" data-workspace="${team.id}">${icon('plus')}Encaixar mais uma mesa</button>
        <button class="button button-light button-full" data-action="return" data-workspace="${team.id}">${icon('return')}Recolher equipe e voltar</button>` : ''}
        ${person.hasComputer ? `<button class="button button-light button-full" data-action="set-status" data-status="done">${icon('check')}Simular conclusão</button>` : ''}
      </div>
      <p class="inspector-note">Só frontend. Sem agentes, ferramentas ou custos reais.</p>
    </div>`;
}

function render({ fit = false } = {}) {
  renderWorld();
  renderInspector();
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
  const lead = state.people.find((p) => p.away && p.teamId === teamId);
  if (!team || !lead) return;
  const before = $(`[data-character-id="${lead.id}"]`)?.getBoundingClientRect();
  const delegationModules = state.modules.filter((m) => m.teamId === teamId && m.kind === 'delegation');
  const children = state.people.filter((p) => p.away && p.teamId === teamId && p.id !== lead.id);
  team.completed += children.length;
  lead.outputs.push({ text: `${children.length} resultados da equipe recebidos`, kind: 'result', at: Date.now() });
  lead.away = false; lead.status = 'done';
  lead.expressionPreset = null;
  const home = moduleById(lead.homeModuleId);
  if (home) home.seats[lead.homeSeat] = lead.id;
  state.people = state.people.filter((p) => !children.includes(p));
  state.modules = state.modules.filter((m) => !delegationModules.includes(m));
  for (const m of state.modules) m.seats = m.seats.map((s) => (children.some((c) => c.id === s) ? null : s));
  if (children.some((c) => c.id === state.selected)) state.selected = lead.id;
  render({ fit: true });
  animateTransfer(lead.id, before);
  showBubble(lead, `${children.length} resultados da equipe recebidos`, 'result');
  toast(`${lead.name} voltou ao lugar original. Equipe recolhida.`);
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
    case 'simulate-task': {
      if (!found) break;
      const text = $('#demo-task').value.trim() || pick(DATA.tasks);
      const person = found.person;
      person.task = text;
      person.hasComputer = true;
      person.status = 'working';
      if (!person.context) person.context = rand(10, 22);
      emitOutput(person, `tarefa: ${text}`, 'message');
      render();
      const laptop = $(`[data-character-id="${person.id}"]`)?.closest('.desk-module')?.querySelectorAll('.character-laptop');
      laptop?.forEach((n) => n.classList.add('laptop-arriving'));
      toast(`Notebook pronto. A tarefa de ${person.name} é só simulação.`);
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
  const btn = e.target.closest('g[role="button"]');
  if (btn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleAction(btn); }
  if (e.key === 'Escape' && state.selected && !document.querySelector('dialog[open]')) { state.selected = null; render({ fit: true }); }
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
  $('#viewport').setPointerCapture(e.pointerId);
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
