/**
 * Testes das features de telemetria e pipeline do dsh-work-game:
 *   18. gasto por agente + velocidade de tokens + total por mesa
 *   19. contexto com aviso acima de 200k
 *   20. pergunta: sinalizador → sheet inferior com opções, input, boneco+nome e sombreado
 *   21. sinal claro de fim de turno (turn/end reason.kind)
 *   22. pilha de papéis na mesa (fila editável + submeter agora)
 *   23. arquivo de agentes eliminados (histórico preservado)
 *   24. feed de ações em tempo real
 *
 * Correr:  node --test tests/features.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startServer } from './helpers/server.mjs';
import { launchBrowser, sleep } from './helpers/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let server, browser, page;

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

/** Recarrega a cena-semente e desliga os motores (determinismo). */
async function reset() {
  await page.reload();
  await page.eval('clearTimeout(activityTimer); clearInterval(telemetryTimer); true');
}

// ─────────────────────────────── 18. Gasto, velocidade e custo por mesa ───────────────────────────────

test('telemetria: fichas mostram gasto e tok/s, painel detalha os 4 buckets e o custo acumula', async () => {
  await reset();
  const ficha = await page.eval(`document.querySelector('g.seat[data-agent="p-rui"] .seat-card-role').textContent`);
  assert.match(ficha, /CTX ~/i, 'a ficha mantém a ocupação de contexto');
  assert.match(ficha, /US\$ /, 'a ficha mostra o gasto do agente');
  assert.match(ficha, /\d+ tok\/s/, 'a ficha mostra a velocidade de tokens');

  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  const tv = await page.eval(`(() => ({
    velocidade: document.querySelector('#tv-speed').textContent,
    custo: document.querySelector('#tv-cost').textContent,
    buckets: [...document.querySelectorAll('.cost-row')].map((r) => r.textContent),
    modelo: document.querySelector('#model-select').value
  }))()`);
  assert.match(tv.velocidade, /^\d+ tok\/s$/);
  assert.match(tv.custo, /^US\$ /);
  assert.equal(tv.buckets.length, 4, 'entrada, saída, cache de leitura e cache de escrita');
  assert.ok(tv.buckets.some((b) => /Entrada/.test(b)) && tv.buckets.some((b) => /Saída/.test(b)));
  assert.equal(tv.modelo, 'deepseek-chat');

  const antes = await page.eval(`costOf(personById('p-rui'))`);
  await page.eval('telemetryTick(); true');
  const depois = await page.eval(`costOf(personById('p-rui'))`);
  assert.ok(depois > antes, 'o gasto acumula quando a pessoa está a trabalhar');

  const mesa = await page.eval(`document.querySelector('g.desk-module[data-module="m-site"] .desk-counter').textContent`);
  assert.match(mesa, /US\$ /, 'a mesa mostra o gasto total dos seus lugares');

  await page.eval(`(() => { const s = document.querySelector('#model-select'); s.value = 'mimo-v2.6-pro'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const janela = await page.eval(`document.querySelector('.context-total span').textContent`);
  assert.match(janela, /256k/, 'trocar de modelo recalcula a janela de contexto');
  assert.equal(await page.eval(`state.people.find((p) => p.id === 'p-rui').model`), 'mimo-v2.6-pro');
});

// ─────────────────────────────── 19. Aviso de contexto acima de 200k ───────────────────────────────

test('contexto: aviso claro quando passa de 200k, na cena e no painel', async () => {
  await reset();
  const seed = await page.eval(`(() => ({
    classe: document.querySelector('g.seat[role="button"][data-agent="p-pesquisa"]').classList.contains('context-over'),
    aria: document.querySelector('g.seat[role="button"][data-agent="p-pesquisa"]').getAttribute('aria-label'),
    marcador: !!document.querySelector('g.seat[data-agent="p-pesquisa"] .context-warn-marker')
  }))()`);
  assert.ok(seed.classe, 'quem passou de 200k na cena-semente fica sinalizado');
  assert.match(seed.aria, /200k/, 'o aviso também está no rótulo acessível');
  assert.ok(seed.marcador, 'o marcador visual existe na ficha');

  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  await page.click('[data-action="sim-event"][data-event="context-pressure"]');
  const depois = await page.eval(`(() => ({
    banner: !document.querySelector('#ctx-warning').hidden,
    contexto: state.people.find((p) => p.id === 'p-rui').context,
    classe: document.querySelector('g.seat[role="button"][data-agent="p-rui"]').classList.contains('context-over')
  }))()`);
  assert.ok(depois.contexto >= 200, 'a pressão de contexto é injetada');
  assert.ok(depois.banner, 'o painel mostra o aviso de contexto');
  assert.ok(depois.classe, 'a cena mostra o marcador na pessoa');
});

// ─────────────────────────────── 20. Pergunta: sinalizador → sheet inferior ───────────────────────────────

test('pergunta: sinalizador sobre a pessoa abre sheet com opções, input, quem perguntou e sombreado', async () => {
  await reset();
  assert.ok(await page.eval(`!!document.querySelector('[data-action="open-question"][data-agent="p-bia"]')`),
    'quem pergunta recebe um sinalizador clicável sobre a cabeça');

  await page.click('[data-action="open-question"][data-agent="p-bia"]');
  await page.waitFor('!document.querySelector("#question-sheet").hidden');
  await sleep(420); /* deixa a animação de entrada terminar antes de medir */
  const sheet = await page.eval(`(() => {
    const r = document.querySelector('#question-sheet').getBoundingClientRect();
    const o = document.querySelector('#question-overlay').getBoundingClientRect();
    const asker = document.querySelector('#question-asker').getBoundingClientRect();
    const opts = document.querySelector('#question-options').getBoundingClientRect();
    return {
      coladoAbase: Math.abs(r.bottom - innerHeight) < 2,
      sombreado: o.width >= innerWidth && o.height >= innerHeight,
      opcoes: [...document.querySelectorAll('#question-options input')].map((i) => i.value),
      input: !!document.querySelector('#question-custom'),
      quem: document.querySelector('#question-asker strong').textContent,
      boneco: document.querySelector('#question-asker img')?.getAttribute('src') || '',
      quemEmbaixo: asker.top > opts.bottom,
      titulo: document.querySelector('#question-title').textContent
    };
  })()`);
  assert.ok(sheet.coladoAbase, 'a pergunta aparece embaixo da tela');
  assert.ok(sheet.sombreado, 'um sombreado cobre o resto da tela');
  assert.ok(sheet.opcoes.length >= 2, 'as opções aparecem');
  assert.ok(sheet.input, 'há campo de resposta livre');
  assert.equal(sheet.quem, 'Bia', 'o nome de quem perguntou aparece embaixo');
  assert.match(sheet.boneco, /assets\/avatars\//, 'o boneco de quem perguntou aparece embaixo');
  assert.ok(sheet.quemEmbaixo, 'boneco e nome ficam abaixo da pergunta');
  assert.ok(sheet.titulo.length > 3);

  // "Responder depois" NÃO responde: o sinalizador continua lá.
  await page.click('[data-action="close-question-sheet"]');
  assert.equal(await page.eval(`document.querySelector("#question-sheet").hidden`), true);
  assert.ok(await page.eval(`!!document.querySelector('[data-action="open-question"][data-agent="p-bia"]')`),
    'fechar sem responder mantém a pergunta pendente');
  assert.equal(await page.eval(`personById('p-bia').questions[0].status`), 'pending');

  // Responder de verdade: escolher opção + enviar.
  await page.click('[data-action="open-question"][data-agent="p-bia"]');
  await page.waitFor('!document.querySelector("#question-sheet").hidden');
  await page.click('#question-options input');
  await page.click('#question-form button[type="submit"]');
  await page.waitFor('document.querySelector("#question-sheet").hidden');
  const r = await page.eval(`(() => {
    const bia = personById('p-bia');
    return {
      sinalizador: !!document.querySelector('[data-action="open-question"][data-agent="p-bia"]'),
      estado: bia.status,
      resposta: bia.questions[0].answer,
      status: bia.questions[0].status
    };
  })()`);
  assert.equal(r.sinalizador, false, 'o sinalizador some depois de respondida');
  assert.equal(r.status, 'answered');
  assert.ok(r.resposta.selected.length === 1 || r.resposta.custom, 'a resposta fica registada');
  assert.equal(r.estado, 'working', 'o agente volta a trabalhar');
});

// ─────────────────────────────── 21. Fim de turno inequívoco ───────────────────────────────

test('fim de turno: fita de conclusão visível, razões mapeadas e nova tarefa aposenta o sinal', async () => {
  await reset();
  const seed = await page.eval(`(() => ({
    fita: document.querySelector('g.seat[data-agent="p-testes"] .finish-ribbon')?.dataset.finish,
    texto: document.querySelector('g.seat[data-agent="p-testes"] .finish-ribbon text')?.textContent || ''
  }))()`);
  assert.equal(seed.fita, 'completed', 'quem terminou mostra o sinal de conclusão');
  assert.match(seed.texto, /Concluído · resultado pronto/, 'o sinal diz explicitamente que terminou');

  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  await page.click('[data-action="sim-event"][data-event="turn-error"]');
  const erro = await page.eval(`(() => ({
    fita: document.querySelector('g.seat[data-agent="p-rui"] .finish-ribbon')?.dataset.finish,
    estado: personById('p-rui').status
  }))()`);
  assert.equal(erro.fita, 'error', 'turn/end com error vira sinal de erro');
  assert.equal(erro.estado, 'error');

  await page.click('[data-action="sim-event"][data-event="turn-abort"]');
  assert.equal(await page.eval(`document.querySelector('g.seat[data-agent="p-rui"] .finish-ribbon')?.dataset.finish`), 'aborted');

  await page.click('[data-action="tab"][data-tab="activity"]');
  const fim = await page.eval(`document.querySelector('.finish-card')?.dataset.finish || ''`);
  assert.equal(fim, 'aborted', 'a aba Atividade mostra o fim de turno com a razão');

  await page.click('[data-action="tab"][data-tab="computer"]');
  await page.type('#demo-task', 'uma tarefa nova que aposenta o sinal');
  await page.click('[data-action="simulate-task"]');
  const depois = await page.eval(`(() => ({
    fita: !!document.querySelector('g.seat[data-agent="p-rui"] .finish-ribbon'),
    finish: personById('p-rui').finish
  }))()`);
  assert.equal(depois.fita, false, 'uma tarefa nova aposenta o sinal de fim');
  assert.equal(depois.finish, null);
});

// ─────────────────────────────── 22. Pilha de papéis na mesa ───────────────────────────────

test('pilha de papéis: acumula na mesa, abre para editar e submeter agora', async () => {
  await reset();
  const pilha = await page.eval(`(() => {
    const g = document.querySelector('.paper-stack[data-agent="p-pesquisa"]');
    return { existe: !!g, contagem: g?.querySelector('.paper-count text')?.textContent || '', rotulo: g?.getAttribute('aria-label') || '' };
  })()`);
  assert.ok(pilha.existe, 'a pilha aparece na mesa de quem tem tarefas na fila');
  assert.equal(pilha.contagem, '2', 'a contagem mostra os papéis acumulados');
  assert.match(pilha.rotulo, /2 tarefa\(s\) na fila/);

  await page.click('.paper-stack[data-agent="p-pesquisa"]');
  await page.waitFor('document.querySelector("#papers-dialog").open');
  const dialogo = await page.eval(`(() => ({
    titulo: document.querySelector('#papers-title').textContent,
    linhas: document.querySelectorAll('.paper-row').length,
    editaveis: [...document.querySelectorAll('.paper-text')].filter((t) => !t.readOnly).length,
    botoes: [...document.querySelectorAll('.paper-row button')].map((b) => b.textContent.trim())
  }))()`);
  assert.match(dialogo.titulo, /A pilha de papéis de Pesquisa/);
  assert.equal(dialogo.linhas, 2);
  assert.equal(dialogo.editaveis, 2, 'papéis não submetidos são editáveis');
  assert.ok(dialogo.botoes.some((b) => /Submeter agora/.test(b)), 'existe submeter agora por papel');

  // editar um papel não submetido (o do topo da pilha = primeiro da lista)
  const idEditado = await page.eval(`document.querySelector('[data-paper-edit]').dataset.paperEdit`);
  await page.eval(`(() => { const t = document.querySelector('[data-paper-edit]'); t.value = 'prompt editado antes de submeter'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  assert.equal(await page.eval(`personById('p-pesquisa').taskQueue.find((t) => t.id === '${idEditado}').text`),
    'prompt editado antes de submeter', 'a edição entra no prompt do papel');

  // submeter agora
  await page.click('.paper-row button[data-action="submit-paper"]');
  const submetido = await page.eval(`(() => {
    const p = personById('p-pesquisa');
    return { ativo: p.taskQueue.find((t) => t.status === 'active')?.text, estado: p.status, tarefa: p.task, editaveis: [...document.querySelectorAll('.paper-text')].filter((t) => !t.readOnly).length };
  })()`);
  assert.equal(submetido.ativo, 'prompt editado antes de submeter', 'submeter agora executa o papel na hora');
  assert.equal(submetido.estado, 'working');
  assert.equal(submetido.tarefa, 'prompt editado antes de submeter');
  assert.equal(submetido.editaveis, 1, 'o papel submetido deixa de ser editável');

  await page.click('#papers-dialog [data-close-dialog]');
  await page.click('g.seat[role="button"][data-agent="p-pesquisa"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  await page.click('[data-action="tab"][data-tab="computer"]');
  await page.type('#paper-task', 'mais um papel na pilha');
  await page.click('[data-action="queue-task"]');
  const fila = await page.eval(`(() => {
    const p = personById('p-pesquisa');
    return { fila: p.taskQueue.filter((t) => t.status === 'queued').length, textos: p.taskQueue.map((t) => t.text) };
  })()`);
  assert.equal(fila.fila, 2, 'colocar na mesa acumula sem submeter');
  assert.ok(fila.textos.includes('mais um papel na pilha'));

  // remover um papel da fila
  await page.click('.paper-stack[data-agent="p-pesquisa"]');
  await page.waitFor('document.querySelector("#papers-dialog").open');
  await page.click('.paper-row button[data-action="remove-paper"]');
  assert.equal(await page.eval(`personById('p-pesquisa').taskQueue.filter((t) => t.status === 'queued').length`), 1,
    'remover tira o papel da fila');
});

// ─────────────────────────────── 23. Arquivo de eliminados ───────────────────────────────

test('arquivo: eliminados saem da sala mas ficam com o histórico acessível', async () => {
  await reset();
  await page.click('g.seat[role="button"][data-agent="p-alex"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');

  // Prevenção de erro: o primeiro clique NÃO elimina — pede confirmação.
  await page.click('[data-action="eliminate-agent"][data-agent="p-alex"]');
  const armado = await page.eval(`(() => ({
    aindaLá: !!document.querySelector('g.seat[role="button"][data-agent="p-alex"]'),
    confirmar: !!document.querySelector('[data-action="eliminate-confirm"]'),
    cancelar: !!document.querySelector('[data-action="eliminate-cancel"]')
  }))()`);
  assert.ok(armado.aindaLá, 'o primeiro clique apenas arma a eliminação');
  assert.ok(armado.confirmar, 'surge a ação explícita de confirmar');
  assert.ok(armado.cancelar, 'há como cancelar');

  await page.click('[data-action="eliminate-confirm"][data-agent="p-alex"]');
  await page.waitFor('!document.querySelector(\'g.seat[role="button"][data-agent="p-alex"]\')');

  const arq = await page.eval(`(() => ({
    total: state.archived.length,
    nome: state.archived[0].name,
    acoes: state.archived[0].actions.length,
    custo: state.archived[0].cost,
    tokens: state.archived[0].usage.output,
    contagem: document.querySelector('#archive-count').textContent
  }))()`);
  assert.equal(arq.total, 1);
  assert.equal(arq.nome, 'Alex');
  assert.ok(arq.acoes >= 1, 'o histórico de ações sobrevive à eliminação');
  assert.ok(arq.custo > 0, 'o gasto final fica registado');
  assert.ok(arq.tokens > 0, 'os tokens ficam registados');
  assert.equal(arq.contagem, '1', 'o botão do Arquivo mostra a contagem');

  await page.click('#archive-button');
  await page.waitFor('document.querySelector("#archive-dialog").open');
  await page.click('[data-action="archive-detail"][data-archive="0"]');
  const detalhe = await page.eval(`(() => ({
    visivel: !document.querySelector('[data-archive-detail="0"]').hidden,
    itens: document.querySelectorAll('[data-archive-detail="0"] li').length,
    estatisticas: document.querySelectorAll('.archive-card .archive-stats div').length
  }))()`);
  assert.ok(detalhe.visivel, 'o histórico abre por dentro do Arquivo');
  assert.ok(detalhe.itens >= 1, 'as ações do eliminado aparecem');
  assert.ok(detalhe.estatisticas >= 5, 'as estatísticas finais aparecem');
  await page.click('#archive-dialog [data-close-dialog]');

  // subagentes recolhidos também ficam no Arquivo
  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.click('[data-action="sim-event"][data-event="subagent-start"]');
  await page.waitFor('state.people.filter((p) => p.away).length === 5');
  await page.click('[data-action="sim-event"][data-event="subagent-end"]');
  await page.waitFor(`state.archived.some((a) => /equipe recolhida/.test(a.reason))`);
  const recolhidos = await page.eval(`state.archived.filter((a) => /equipe recolhida/.test(a.reason)).length`);
  assert.ok(recolhidos >= 3, 'os subagentes recolhidos entram no Arquivo com histórico');
});

// ─────────────────────────────── 24. Feed de ações em tempo real ───────────────────────────────

test('feed: ações aparecem em tempo real, com hora, e clicar leva à pessoa', async () => {
  await reset();
  const inicial = await page.eval(`(() => ({
    itens: document.querySelectorAll('#live-feed-list li').length,
    primeira: document.querySelector('#live-feed-list li .feed-copy span').textContent,
    tempo: Number(document.querySelector('#live-feed-list li time').dataset.feedTime)
  }))()`);
  assert.ok(inicial.itens >= 5, 'o feed abre com as ações da cena-semente');
  assert.ok(inicial.tempo > 0, 'cada ação traz o instante em que aconteceu');

  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  await page.click('[data-action="sim-event"][data-event="tool-call"]');
  const topo = await page.eval(`document.querySelector('#live-feed-list li .feed-copy span').textContent`);
  assert.match(topo, /ferramenta de build/, 'a ação nova entra no topo do feed');

  await page.click('#live-feed-list li');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  assert.equal(await page.eval(`document.querySelector('.agent-heading h2').textContent`), 'Rui',
    'clicar numa ação abre a pessoa que a executou');

  await page.click('[data-action="toggle-feed"]');
  assert.equal(await page.eval(`document.querySelector('#live-feed').classList.contains('collapsed')`), true,
    'o feed pode ser recolhido');

  // ações por pessoa também ficam na aba Atividade, com tempo relativo
  await page.click('[data-action="tab"][data-tab="activity"]');
  const acoes = await page.eval(`document.querySelectorAll('#activity-list li').length`);
  assert.ok(acoes >= 1, 'a aba Atividade mostra as ações da pessoa');
});

// ─────────────────────────────── achados da auditoria UX implementados ───────────────────────────────

test('auditoria: progressive disclosure, confirmação destrutiva, feedback e métricas da ficha', async () => {
  await reset();
  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');

  // Finding-1/4: blocos recolhidos — simulador, mapa e custo por bucket atrás de disclosure.
  const disclosures = await page.eval(`(() => ({
    total: document.querySelectorAll('.inspector .disclosure').length,
    simuladorFechado: !document.querySelector('#sim-disclosure').open,
    mapaDentro: !!document.querySelector('.disclosure .context-map'),
    custoDentro: !!document.querySelector('.disclosure .cost-table')
  }))()`);
  assert.ok(disclosures.total >= 3, 'há disclosures na aba Contexto e no simulador');
  assert.ok(disclosures.simuladorFechado, 'o simulador de eventos começa recolhido');
  assert.ok(disclosures.mapaDentro, 'o mapa de 72 células fica atrás de "Ver detalhe"');
  assert.ok(disclosures.custoDentro, 'a tabela de buckets fica atrás de "Ver detalhe"');

  // Finding-2: os alvos de clique crescem quando a câmara afasta.
  const hitAntes = await page.eval(`Number(getComputedStyle(document.querySelector('#world')).getPropertyValue('--hit-scale'))`);
  await page.click('#zoom-in');
  const hitDentro = await page.eval(`Number(getComputedStyle(document.querySelector('#world')).getPropertyValue('--hit-scale'))`);
  await page.click('#zoom-out');
  const hitFora = await page.eval(`Number(getComputedStyle(document.querySelector('#world')).getPropertyValue('--hit-scale'))`);
  assert.ok(hitFora > hitDentro, 'afastar a câmara aumenta a área de clique dos sinais');
  assert.ok(hitAntes > 1, 'mesmo no enquadramento inicial os alvos já estão ampliados');

  // Finding-6: separadores por cor + alternador de métricas da ficha.
  const metricas = await page.eval(`(() => ({
    tspans: document.querySelectorAll('g.seat[role="button"][data-agent="p-rui"] .seat-card-role tspan').length,
    botao: document.querySelector('#card-metrics').textContent
  }))()`);
  assert.equal(metricas.tspans, 3, 'CTX, custo e velocidade ficam em métricas separadas');
  assert.match(metricas.botao, /Métricas/);
  await page.click('#card-metrics');
  assert.match(await page.eval(`document.querySelector('#card-metrics').textContent`), /contexto \+ custo$/);
  assert.equal(await page.eval(`document.querySelectorAll('g.seat[role="button"][data-agent="p-rui"] .seat-card-role tspan').length`), 2,
    'a ficha passa a mostrar só as métricas escolhidas');
  await page.click('#card-metrics');
  await page.click('#card-metrics');

  // Finding-5: a edição de um papel confirma que guardou.
  await page.click('.paper-stack[data-agent="p-pesquisa"]');
  await page.waitFor('document.querySelector("#papers-dialog").open');
  await page.eval(`(() => { const t = document.querySelector('[data-paper-edit]'); t.value = 'edição com feedback'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(520);
  assert.equal(await page.eval(`document.querySelector('.paper-row .paper-saved').hidden`), false,
    'o chip "guardado" aparece após a edição');
});
