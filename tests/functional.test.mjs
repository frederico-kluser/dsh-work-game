/**
 * Testes funcionais do dsh-work-game — cobrem TODAS as funcionalidades da demo
 * através do comportamento real da página em Chrome headless (CDP), sem dependências.
 *
 * Correr:  node --test tests/
 *
 * Cobertura funcional:
 *   1. arranque e cena-semente · 2. estrutura (sem sidebar/sem header de sala)
 *   3. fichas e estados · 4. seleção + inspetor · 5. contexto simulado
 *   6. computador e primeira tarefa · 7. expressões (troca real de rosto)
 *   8. recrutamento aleatório · 9. crescimento de mesa com empurrão
 *   10. novo time · 11. delegação e mesa de equipe · 12. retorno sem duplicar avatar
 *   13. balões de output (substituição e expiração) · 14. câmera (zoom/pan/teclado)
 *   15. recomeçar demo · 16. mobile · 17. offline e ausência de erros de consola
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startServer } from './helpers/server.mjs';
import { launchBrowser, sleep } from './helpers/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let server, browser, page;

const scene = `(() => ({
  modules: [...document.querySelectorAll('g.desk-module')].map((m) => ({
    id: m.dataset.module,
    team: m.dataset.team,
    label: m.querySelector('.desk-label')?.textContent,
    seats: m.querySelectorAll('g.seat[role="button"]').length,
    people: [...m.querySelectorAll('[data-character-id]')].map((e) => e.dataset.characterId)
  })),
  stats: {
    people: document.querySelector('#stats-people').textContent,
    teams: document.querySelector('#stats-teams').textContent,
    tables: document.querySelector('#stats-tables').textContent
  },
  reserved: [...document.querySelectorAll('g.slot-reserved')].map((g) => g.textContent.trim().slice(0, 40)),
  free: document.querySelectorAll('g.slot-free').length,
  bubbles: document.querySelectorAll('#bubbles-layer [data-bubble]').length
}))()`;

before(async () => {
  server = await startServer(ROOT);
  browser = await launchBrowser();
  page = browser.page;
  await page.goto(server.url);
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/** Recarrega a cena-semente e desliga o motor de atividade (determinismo). */
async function reset() {
  await page.reload();
  await page.eval('clearTimeout(activityTimer); true');
}

// ─────────────────────────────── 1–2. Arranque e estrutura ───────────────────────────────

test('arranque: cena-semente com 2 times, 3 mesas e 8 pessoas', async () => {
  await reset();
  const s = await page.eval(scene);
  assert.equal(s.modules.length, 3, 'devem existir 3 módulos de mesa');
  assert.equal(s.modules.reduce((n, m) => n + m.people.length, 0), 8, '8 pessoas na cena-semente');
  assert.deepEqual(s.modules.map((m) => m.seats), [4, 4, 4], 'todas as mesas têm exatamente 4 lugares');
  assert.equal(s.reserved.length, 1, 'a cadeira reservada de Lia deve existir');
  assert.equal(s.free, 3, '3 lugares livres na cena-semente');
  assert.match(s.stats.people, /^8 pessoas$/);
  assert.match(s.stats.teams, /^2 times$/);
  assert.match(s.stats.tables, /^3 mesas$/);
});

test('estrutura: uma sala só, sem sidebar e sem cabeçalho de sala', async () => {
  const s = await page.eval(`(() => ({
    sidebar: !!document.querySelector('.sidebar'),
    roomHeader: !!document.querySelector('.studio-toolbar'),
    globalHeader: !!document.querySelector('.app-header'),
    viewport: !!document.querySelector('#viewport'),
    inspectorHidden: document.querySelector('#inspector').hidden
  }))()`);
  assert.equal(s.sidebar, false, 'não pode existir sidebar lateral');
  assert.equal(s.roomHeader, false, 'não pode existir cabeçalho por sala');
  assert.equal(s.globalHeader, true, 'o cabeçalho global é obrigatório');
  assert.equal(s.viewport, true, 'a sala deve ocupar o espaço principal');
  assert.equal(s.inspectorHidden, true, 'o inspetor começa fechado');
});

test('fichas: nome, CTX e estado por texto — sem conceito de cargo', async () => {
  const fichas = await page.eval(`(() => [...document.querySelectorAll('g.seat[role="button"]')]
    .map((g) => ({
      nome: g.querySelector('.seat-card-name')?.textContent || '',
      linha2: g.querySelector('.seat-card-role')?.textContent || '',
      estado: g.querySelector('.seat-card-status')?.textContent || ''
    })))()`);
  assert.ok(fichas.some((f) => f.nome === 'Rui'), 'Rui tem ficha própria');
  const rui = fichas.find((f) => f.nome === 'Rui');
  assert.match(rui.linha2, /CTX ~/i, 'CTX de quem tem computador é aproximado');
  assert.ok(rui.estado.length > 0, 'estado sempre por rótulo textual');
  const livre = fichas.find((f) => f.nome === 'Lugar livre');
  assert.ok(livre, 'lugares vazios são clicáveis e identificados');
  const textoPagina = await page.eval('document.body.textContent');
  assert.ok(!/Coordenação\s*·|Conteúdo\s*·|Design\s*·/.test(textoPagina), 'não pode haver cargo nas fichas');
});

// ─────────────────────────────── 4–6. Seleção, contexto e computador ───────────────────────────────

test('seleção abre o inspetor com abas Contexto, Computador, Atividade e Expressões', async () => {
  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  const info = await page.eval(`(() => ({
    nome: document.querySelector('.agent-heading h2').textContent,
    abas: [...document.querySelectorAll('.inspector-tabs button')].map((b) => b.textContent.trim()),
    selecionado: !!document.querySelector('g.seat.selected')
  }))()`);
  assert.equal(info.nome, 'Rui');
  assert.deepEqual(info.abas, ['Contexto', 'Computador', 'Atividade', 'Expressões']);
  assert.equal(info.selecionado, true, 'a ficha selecionada fica destacada');
});

test('contexto: ocupação simulada com ~ para quem tem computador e — para quem não tem', async () => {
  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.click('[data-action="tab"][data-tab="context"]');
  const comPc = await page.eval(`(() => ({
    total: document.querySelector('.context-total strong').textContent,
    tag: document.querySelector('.estimated-tag').textContent,
    legenda: document.querySelectorAll('.context-legend-row').length,
    mapa: document.querySelectorAll('.context-map span').length
  }))()`);
  assert.match(comPc.total, /^~/, 'estimativas usam ~');
  assert.ok(['SIMULADO', 'EXEMPLO'].includes(comPc.tag), 'números rotulados como simulados');
  assert.equal(comPc.legenda, 4, 'composição com 4 partes (conversa, arquivos, ferramentas, instruções)');
  assert.equal(comPc.mapa, 72, 'mapa visual do contexto');

  await page.click('g.seat[role="button"][data-agent="p-maya"]');
  const semPc = await page.eval(`(() => ({
    total: document.querySelector('.context-total strong').textContent,
    vazio: !!document.querySelector('.empty-context')
  }))()`);
  assert.equal(semPc.total, '—', 'sem computador não há contexto inventado');
  assert.equal(semPc.vazio, true, 'estado vazio explicado, sem barra falsa');
});

test('computador: simular tarefa cria notebook, output e balão', async () => {
  await reset();
  await page.click('g.seat[role="button"][data-agent="p-maya"]');
  await page.click('[data-action="tab"][data-tab="computer"]');
  assert.equal(await page.eval(`!!document.querySelector('[data-agent="p-maya"] .character-laptop')`), false,
    'pessoa nova ainda não tem computador');
  await page.type('#demo-task', 'criar a tela de login');
  await page.click('[data-action="simulate-task"]');
  const r = await page.eval(`(() => ({
    laptop: !!document.querySelector('[data-agent="p-maya"] .character-laptop'),
    balao: [...document.querySelectorAll('#bubbles-layer [data-bubble="p-maya"] .bubble-text')].map((t) => t.textContent).join(' '),
    historico: [...document.querySelectorAll('.activity strong')].map((e) => e.textContent),
    hasComputer: state.people.find((p) => p.id === 'p-maya').hasComputer
  }))()`);
  assert.equal(r.laptop, true, 'o notebook aparece após a primeira tarefa');
  assert.equal(r.hasComputer, true);
  assert.match(r.balao, /criar a tela de login/, 'o balão mostra a última saída');
  assert.ok(r.historico.length >= 1, 'o histórico regista a tarefa simulada');
});

test('estados: os 6 estados mudam rótulo, ícone e marcador de atenção', async () => {
  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.click('[data-action="tab"][data-tab="computer"]');
  const botoes = await page.eval(`[...document.querySelectorAll('[data-action="set-status"]')].map((b) => b.dataset.status)`);
  assert.deepEqual([...new Set(botoes)].sort(), ['available', 'done', 'error', 'tool', 'waiting', 'working'],
    'todos os estados são experimentáveis');

  await page.click('[data-action="set-status"][data-status="error"]');
  let r = await page.eval(`(() => ({
    rotulo: document.querySelector('[data-agent="p-rui"] .seat-card-status').textContent,
    alerta: !!document.querySelector('[data-agent="p-rui"] .attention-marker')
  }))()`);
  assert.equal(r.rotulo, 'Precisa de atenção');
  assert.equal(r.alerta, true, 'erro tem marcador visual, não só cor');

  await page.click('[data-action="set-status"][data-status="tool"]');
  r = await page.eval(`document.querySelector('[data-agent="p-rui"] .seat-card-status').textContent`);
  assert.equal(r, 'Executando ferramenta');

  await page.click('[data-action="set-status"][data-status="done"]');
  r = await page.eval(`document.querySelector('[data-agent="p-rui"] .seat-card-status').textContent`);
  assert.equal(r, 'Concluído');
});

// ─────────────────────────────── 7. Expressões ───────────────────────────────

test('expressões: 14 presets com enums reais e troca efetiva do rosto', async () => {
  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.click('[data-action="tab"][data-tab="expressions"]');
  const presets = await page.eval(`(() => [...document.querySelectorAll('.expression-card')].map((c) => ({
    id: c.dataset.expression,
    codigo: c.querySelector('code').textContent.trim()
  })))()`);
  assert.equal(presets.length, 14, 'são 14 presets de expressão');
  for (const p of presets) {
    assert.match(p.codigo, /^[A-Za-z]+\/[A-Za-z]+\/[A-Za-z]+$/, `preset ${p.id} tem triple eye/eyebrow/mouth`);
  }
  assert.ok(presets.some((p) => p.id === 'error') && presets.some((p) => p.id === 'tool'));

  const antes = await page.eval(`document.querySelector('[data-character-id="p-rui"] image').getAttribute('href')`);
  await page.click('.expression-card[data-expression="error"]');
  const depois = await page.eval(`(() => ({
    href: document.querySelector('[data-character-id="p-rui"] image').getAttribute('href'),
    preset: state.people.find((p) => p.id === 'p-rui').expressionPreset
  }))()`);
  assert.notEqual(depois.href, antes, 'a imagem do rosto muda de ficheiro');
  assert.match(depois.href, /expressions\/rui\/error\.svg$/, 'usa a variante local da mesma identidade');
  assert.equal(depois.preset, 'error');

  await page.click('[data-action="set-expression"][data-expression=""]');
  const auto = await page.eval(`state.people.find((p) => p.id === 'p-rui').expressionPreset`);
  assert.equal(auto, null, 'o botão automático limpa o override');
});

// ─────────────────────────────── 8–10. Recrutamento, crescimento e times ───────────────────────────────

test('recrutamento: nome e avatar sorteados, com "Sortear outro"', async () => {
  await reset();
  await page.click('g.slot-free[data-module="m-api"]');
  await page.waitFor('document.querySelector("#recruit-dialog").open');
  const sorteio1 = await page.eval(`(() => ({
    nome: document.querySelector('#recruit-name').textContent,
    avatar: document.querySelector('#recruit-avatar').getAttribute('src')
  }))()`);
  assert.ok(sorteio1.nome.length > 2, 'o nome é sorteado');
  assert.match(sorteio1.avatar, /assets\/avatars\//);

  await page.click('[data-action="reroll"]');
  const sorteio2 = await page.eval(`document.querySelector('#recruit-name').textContent`);
  assert.notEqual(sorteio2, sorteio1.nome, '"Sortear outro" sorteia nome diferente');

  await page.click('#recruit-form button[type="submit"]');
  const r = await page.eval(`(() => {
    const novo = state.people.at(-1);
    return {
      nome: novo.name, semPc: !novo.hasComputer, estado: novo.status,
      sentado: [...document.querySelectorAll('g.desk-module')].some((m) => [...m.querySelectorAll('[data-character-id]')].some((e) => e.dataset.characterId === novo.id)),
      avatar: novo.avatarId
    };
  })()`);
  assert.equal(r.nome, sorteio2, 'a pessoa adicionada usa o nome sorteado');
  assert.equal(r.semPc, true, 'entra sem computador');
  assert.equal(r.estado, 'available');
  assert.equal(r.sentado, true, 'ocupa uma cadeira da mesa escolhida');
});

test('crescimento: ao lotar, nasce mesa ao lado da principal e a mesa de equipe é empurrada', async () => {
  await reset();
  const ordemInicial = await page.eval(`[...document.querySelectorAll('g.desk-module')].map((m) => m.dataset.module)`);
  assert.deepEqual(ordemInicial, ['m-site', 'm-team', 'm-api']);

  // Site tem 2 pessoas + 1 lugar livre + 1 reservado → recrutar pelo botão da mesa enche e depois expande.
  await page.click('g[data-module="m-site"] g[data-action="recruit-slot"]');
  await page.click('#recruit-form button[type="submit"]');
  let ordem = await page.eval(`[...document.querySelectorAll('g.desk-module')].map((m) => m.dataset.module)`);
  assert.deepEqual(ordem, ordemInicial, 'com lugar livre não nasce mesa nova');

  await page.click('g[data-module="m-site"] g[data-action="recruit-slot"]');
  await page.click('#recruit-form button[type="submit"]');
  const r = await page.eval(scene);
  ordem = r.modules.map((m) => m.id);
  assert.equal(ordem.length, 4, 'nasce uma mesa de expansão');
  assert.equal(ordem[0], 'm-site', 'a mesa principal mantém-se no lugar');
  assert.equal(ordem[2], 'm-team', 'a mesa de equipe foi empurrada para depois da expansão');

  const site = r.modules.filter((m) => m.team === 'site').map((m) => m.id);
  const indices = r.modules.map((m, i) => (m.team === 'site' ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(indices, [0, 1, 2], 'os módulos do time ficam contíguos');
  assert.ok(site.length === 3);
  // A expansão deve ser a primeira depois da principal; a mesa de equipe desliza para a direita.
  const idxPrincipal = ordem.indexOf('m-site');
  const idxEquipe = ordem.indexOf('m-team');
  assert.ok(idxEquipe > idxPrincipal + 1, 'a mesa de equipe foi empurrada para a direita');
  for (const m of r.modules) assert.equal(m.seats, 4, 'cada mesa continua com 4 lugares');
});

test('novo time: nasce com uma mesa de 4 lugares vazios e atualiza os contadores', async () => {
  await reset();
  await page.click('#new-workspace');
  await page.waitFor('document.querySelector("#workspace-dialog").open');
  await page.type('#workspace-name', 'Produto mobile');
  await page.click('#workspace-form button[type="submit"]');
  const r = await page.eval(`(() => {
    const mod = [...document.querySelectorAll('g.desk-module')].find((m) => m.querySelector('.desk-label').textContent === 'Produto mobile');
    return {
      existe: !!mod,
      livres: mod ? mod.querySelectorAll('g.slot-free').length : -1,
      stats: document.querySelector('#stats-teams').textContent
    };
  })()`);
  assert.equal(r.existe, true, 'a mesa do novo time aparece na sala');
  assert.equal(r.livres, 4, 'nascem 4 lugares vazios');
  assert.equal(r.stats, '3 times');
});

// ─────────────────────────────── 11–12. Delegação e retorno ───────────────────────────────

test('delegação: cadeira reservada, sem avatar duplicado, mesa de equipe preenchida', async () => {
  await reset();
  const antes = await page.eval(scene);
  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.click('[data-action="sim-event"][data-event="subagent-start"]');
  await page.waitFor('state.people.filter((p) => p.away).length === 5');

  const r = await page.eval(`(() => {
    const ids = [...document.querySelectorAll('[data-character-id]')].map((e) => e.dataset.characterId);
    const site = [...document.querySelectorAll('g.desk-module')].filter((m) => m.dataset.team === 'site');
    return {
      reservadas: document.querySelectorAll('g.slot-reserved').length,
      unico: new Set(ids).size === ids.length,
      total: ids.length,
      delegacao: site.filter((m) => /Equipe de/.test(m.querySelector('.desk-label').textContent)).length,
      apoio: site.filter((m) => /Apoio de/.test(m.querySelector('.desk-label').textContent)).length,
      lugares: site.map((m) => m.querySelectorAll('g.seat[role="button"]').length),
      contiguo: site.map((m) => m.dataset.module)
    };
  })()`);
  assert.equal(r.reservadas, 2, 'Lia e Rui ficam com cadeira reservada');
  assert.equal(r.unico, true, 'nenhum avatar é duplicado');
  assert.ok(r.total >= antes.modules.reduce((n, m) => n + m.people.length, 0) + 2, 'os subagentes entraram na sala');
  assert.equal(r.delegacao, 2, 'cada coordenador tem a sua mesa de equipe rotulada');
  assert.ok(r.lugares.every((n) => n === 4), 'mesa de equipe também tem 4 lugares');
  const idx = await page.eval(`[...document.querySelectorAll('g.desk-module')].map((m) => m.dataset.team)`);
  const siteIdx = idx.map((t, i) => (t === 'site' ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(siteIdx, [0, 1, 2], 'as mesas do time continuam contíguas');
});

test('retorno: equipe recolhida, coordenadores voltam e resultados preservados', async () => {
  // Continuação do teste anterior: Rui e Lia estão em delegação.
  const antes = await page.eval(`state.teams.find((t) => t.id === 'site').completed`);
  await page.click('[data-action="sim-event"][data-event="subagent-end"]');
  await page.waitFor('!document.querySelector("g.desk-module[data-team=\'site\']") || [...document.querySelectorAll("g.desk-module")].filter((m) => m.dataset.team === "site").length === 1');

  const r = await page.eval(`(() => {
    const site = [...document.querySelectorAll('g.desk-module')].filter((m) => m.dataset.team === 'site');
    const rui = state.people.find((p) => p.id === 'p-rui');
    return {
      mesasSite: site.length,
      reservadas: document.querySelectorAll('g.slot-reserved').length,
      ruiDeVolta: !!document.querySelector('g.seat[role="button"][data-agent="p-rui"]'),
      ruiAway: rui.away,
      subagentes: state.people.filter((p) => p.homeModuleId && /module-/.test(p.homeModuleId) && p.away).length,
      outputs: rui.outputs.map((o) => o.text),
      completado: state.teams.find((t) => t.id === 'site').completed,
      avatares: [...document.querySelectorAll('[data-character-id]')].map((e) => e.dataset.characterId)
    };
  })()`);
  assert.equal(r.mesasSite, 1, 'a mesa de equipe recolhe, sobra a principal');
  assert.equal(r.reservadas, 0, 'nenhuma cadeira reservada depois do retorno');
  assert.equal(r.ruiDeVolta, true, 'Rui volta ao lugar original');
  assert.equal(r.ruiAway, false);
  assert.equal(new Set(r.avatares).size, r.avatares.length, 'sem duplicação de avatar');
  assert.ok(r.outputs.some((t) => /resultados da equipe recebidos/.test(t)), 'os resultados ficam registrados');
  assert.ok(r.completado > antes, 'os resultados são contabilizados');
});

// ─────────────────────────────── 13–15. Balões, câmera e reinício ───────────────────────────────

test('balões: só a última saída fica visível e expira com animação', async () => {
  await reset();
  await page.click('g.seat[role="button"][data-agent="p-bia"]');
  await page.click('[data-action="tab"][data-tab="computer"]');
  await page.type('#demo-task', 'primeira tarefa de teste');
  await page.click('[data-action="simulate-task"]');
  let baloes = await page.eval(`(() => ({
    total: document.querySelectorAll('#bubbles-layer [data-bubble="p-bia"]').length,
    texto: [...document.querySelectorAll('#bubbles-layer [data-bubble="p-bia"] .bubble-text')].map((t) => t.textContent).join(' ')
  }))()`);
  assert.equal(baloes.total, 1, 'um balão por pessoa');
  assert.match(baloes.texto, /primeira tarefa/);

  await page.type('#demo-task', 'segunda tarefa mais recente');
  await page.click('[data-action="simulate-task"]');
  baloes = await page.eval(`(() => ({
    total: document.querySelectorAll('#bubbles-layer [data-bubble="p-bia"]').length,
    texto: [...document.querySelectorAll('#bubbles-layer [data-bubble="p-bia"] .bubble-text')].map((t) => t.textContent).join(' ')
  }))()`);
  assert.equal(baloes.total, 1, 'a nova saída substitui a anterior, sem empilhar');
  assert.match(baloes.texto, /segunda tarefa/, 'o balão mostra apenas a mais recente');

  await sleep(1600);
  const depois = await page.eval(`document.querySelectorAll('#bubbles-layer [data-bubble="p-bia"]').length`);
  assert.equal(depois, 0, 'o balão expira após ~1s, com animação de saída');
});

test('câmera: zoom, enquadrar, arraste e teclado sem scroll nativo duplicado', async () => {
  await reset();
  const inicial = await page.eval(`({ zoom: document.querySelector('#zoom-value').textContent, t: document.querySelector('#world').style.transform })`);
  await page.click('#zoom-in');
  const maior = await page.eval(`({ zoom: document.querySelector('#zoom-value').textContent, t: document.querySelector('#world').style.transform })`);
  assert.notEqual(maior.zoom, inicial.zoom, 'zoom + altera a escala');

  await page.click('#zoom-out');
  const menor = await page.eval(`document.querySelector('#zoom-value').textContent`);
  assert.notEqual(menor, maior.zoom, 'zoom − altera a escala');

  await page.click('#fit-scene');
  const enquadrado = await page.eval(`document.querySelector('#world').style.transform`);
  assert.ok(enquadrado.includes('scale('), 'enquadrar recalcula a câmara');

  const panAntes = await page.eval(`state.pan.x`);
  await page.key('#viewport', 'ArrowLeft');
  const panDepois = await page.eval(`state.pan.x`);
  assert.notEqual(panDepois, panAntes, 'setas movem a sala');

  await page.drag(600, 300, 720, 360);
  const arraste = await page.eval(`({ x: state.pan.x, scrollTop: document.querySelector('#viewport').scrollTop })`);
  assert.notEqual(arraste.x, panDepois, 'arrastar move a sala');
  assert.equal(arraste.scrollTop, 0, 'o pan não pode criar scroll nativo duplicado');
});

test('recomeçar demo restaura a cena-semente', async () => {
  await page.click('#reset-demo');
  await page.waitFor('document.querySelectorAll("g.desk-module").length === 3');
  const s = await page.eval(scene);
  assert.equal(s.modules.length, 3);
  assert.equal(s.modules.reduce((n, m) => n + m.people.length, 0), 8);
  assert.equal(s.reserved.length, 1);
});

// ─────────────────────────────── 16–17. Mobile, offline e consola ───────────────────────────────

test('mobile 390×844: sem overflow horizontal e diálogos dentro do ecrã', async () => {
  await page.setViewport(390, 844, true);
  await reset();
  const largura = await page.eval(`({ page: document.documentElement.scrollWidth, win: innerWidth })`);
  assert.ok(largura.page <= largura.win, 'sem overflow horizontal');

  await page.click('#new-workspace');
  await page.waitFor('document.querySelector("#workspace-dialog").open');
  const dialogo = await page.eval(`(() => { const r = document.querySelector('#workspace-dialog').getBoundingClientRect(); return { left: r.left, right: r.right, win: innerWidth }; })()`);
  assert.ok(dialogo.left >= 0 && dialogo.right <= dialogo.win, 'o diálogo cabe no viewport mobile');
  await page.setViewport(1440, 900, false);
});

test('driver CDP: capturas disparadas sem await vão numa fila (nenhuma sai corrompida)', async () => {
  // Duas Page.captureScreenshot em simultâneo — uma com clip, outra sem —
  // davam um mosaico do recorte sem erro nenhum. Com a fila, cada uma sai
  // com o seu tamanho e o seu conteúdo.
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const pasta = mkdtempSync(join(tmpdir(), 'dwg-capturas-'));
  const dimensoes = (ficheiro) => { const b = readFileSync(ficheiro); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  try {
    const inteira = join(pasta, 'inteira.png');
    const recorte = join(pasta, 'recorte.png');
    const recorte2 = join(pasta, 'recorte2.png');
    await Promise.all([
      page.screenshot(inteira),
      page.screenshot(recorte, { x: 10, y: 10, width: 200, height: 120, scale: 2 }),
      page.screenshot(recorte2, { x: 300, y: 200, width: 90, height: 60 }),
    ]);
    const [w, h] = await page.eval('[innerWidth, innerHeight]');
    assert.deepEqual(dimensoes(inteira), [w, h], 'a inteira tem o tamanho da janela');
    assert.deepEqual(dimensoes(recorte), [400, 240], 'o recorte com zoom 2×');
    assert.deepEqual(dimensoes(recorte2), [90, 60]);
    // Uma captura falhada não trava as seguintes.
    await assert.rejects(page.screenshot(join(pasta, 'nao-existe', 'x.png')));
    assert.deepEqual(dimensoes(await page.screenshot(inteira)), [w, h]);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('offline: zero requisições externas e zero erros de consola', async () => {
  const externasPagina = await page.eval(`performance.getEntriesByType('resource')
    .filter((e) => /^https?:/.test(e.name) && !e.name.startsWith(location.origin)).length`);
  const externasRede = page.networkRequests.filter((u) => !u.startsWith(server.url)).length;
  assert.equal(externasPagina, 0, 'a app não pode chamar serviços externos');
  assert.equal(externasRede, 0, `a rede não viu pedidos externos: ${page.networkRequests.filter((u) => !u.startsWith(server.url)).slice(0, 3).join(', ')}`);
  assert.deepEqual(page.consoleErrors, [], `erros de consola: ${page.consoleErrors.join(' | ')}`);
});
