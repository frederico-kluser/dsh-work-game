#!/usr/bin/env node
/**
 * Sessão simulada do dsh-work-game — encena um turno de trabalho completo da sala
 * (tarefas, pergunta respondida, pilha de papéis, fim de turno, aviso de 200k e
 * eliminação com histórico) num Chrome headless, gravando uma captura por passo.
 *
 * Uso:  node scripts/demo-session.mjs [pasta-de-saída]
 * Sai com código != 0 se algum passo falhar. Sem dependências npm.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { startServer } from '../tests/helpers/server.mjs';
import { launchBrowser, sleep } from '../tests/helpers/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'logs', 'sessao-demo'));
mkdirSync(OUT, { recursive: true });

const passos = [];
function ok(nome, detalhe) {
  passos.push(nome);
  console.log(`✔ ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}

const server = await startServer(ROOT);
const browser = await launchBrowser({ width: 1440, height: 900 });
const page = browser.page;
try {
  await page.goto(server.url);
  await page.eval('clearTimeout(activityTimer); clearInterval(telemetryTimer); true');

  /* 1. A sala acorda com a cena-semente e o feed de ações já vivo. */
  await page.screenshot(join(OUT, '01-cena-inicial.png'));
  const feed = await page.eval(`document.querySelectorAll('#live-feed-list li').length`);
  assert.ok(feed >= 5, 'o feed de ações arranca com a cena-semente');
  ok('cena inicial + feed de ações', `${feed} ações no feed`);

  /* 2. Telemetria de um agente: gasto, velocidade, modelo e buckets. */
  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  await page.screenshot(join(OUT, '02-telemetria.png'));
  const tv = await page.eval(`({ custo: document.querySelector('#tv-cost').textContent, vel: document.querySelector('#tv-speed').textContent, modelo: document.querySelector('#model-select').value })`);
  assert.match(tv.custo, /^US\$ /);
  assert.match(tv.vel, /tok\/s/);
  ok('telemetria por agente', `${tv.modelo} · ${tv.custo} · ${tv.vel}`);

  /* 3. Pergunta: sinalizador → sheet inferior com opções, input, boneco+nome e sombreado. */
  await page.click('[data-action="open-question"][data-agent="p-bia"]');
  await page.waitFor('!document.querySelector("#question-sheet").hidden');
  await sleep(420);
  await page.screenshot(join(OUT, '03-pergunta-sheet.png'));
  const pergunta = await page.eval(`({ quem: document.querySelector('#question-asker strong').textContent, opcoes: document.querySelectorAll('#question-options input').length, sombreado: !document.querySelector('#question-overlay').hidden })`);
  assert.equal(pergunta.quem, 'Bia');
  assert.ok(pergunta.opcoes >= 2 && pergunta.sombreado);
  ok('pergunta em baixo do ecrã', `${pergunta.opcoes} opções · perguntada por ${pergunta.quem}`);
  await page.click('#question-options input');
  await page.click('#question-form button[type="submit"]');
  await page.waitFor('document.querySelector("#question-sheet").hidden');
  assert.equal(await page.eval(`personById('p-bia').questions[0].status`), 'answered');
  ok('pergunta respondida', 'Bia voltou a trabalhar');

  /* 4. Pilha de papéis: entrar na fila, editar e submeter agora. */
  await page.click('g.seat[role="button"][data-agent="p-pesquisa"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  await page.click('[data-action="tab"][data-tab="computer"]');
  await page.type('#paper-task', 'preparar o resumo da sessão');
  await page.click('[data-action="queue-task"]');
  await page.click('.paper-stack[data-agent="p-pesquisa"]');
  await page.waitFor('document.querySelector("#papers-dialog").open');
  await sleep(220);
  await page.screenshot(join(OUT, '04-pilha-de-papeis.png'));
  const pilha = await page.eval(`({ fila: personById('p-pesquisa').taskQueue.filter((t) => t.status === 'queued').length, editaveis: [...document.querySelectorAll('.paper-text')].filter((t) => !t.readOnly).length })`);
  assert.ok(pilha.fila >= 3 && pilha.editaveis === pilha.fila);
  ok('pilha de papéis na mesa', `${pilha.fila} prompts na fila, todos editáveis`);
  await page.eval(`(() => { const t = document.querySelector('[data-paper-edit]'); t.value = 'resumo editado e submetido já'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await page.click('.paper-row button[data-action="submit-paper"]');
  assert.equal(await page.eval(`personById('p-pesquisa').taskQueue.find((t) => t.status === 'active').text`), 'resumo editado e submetido já');
  ok('submeter agora', 'o papel do topo passou a execução imediata');
  await page.click('#papers-dialog [data-close-dialog]');

  /* 5. Fim de turno: sinal inequívoco de conclusão. */
  await page.click('g.seat[role="button"][data-agent="p-testes"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  await page.click('[data-action="tab"][data-tab="activity"]');
  await page.screenshot(join(OUT, '05-fim-de-turno.png'));
  const fim = await page.eval(`document.querySelector('g.seat[data-agent="p-testes"] .finish-ribbon text').textContent`);
  assert.match(fim, /Concluído · resultado pronto/);
  ok('fim de turno sinalizado', fim);

  /* 6. Aviso de contexto acima de 200k. */
  await page.click('g.seat[role="button"][data-agent="p-rui"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  await page.click('[data-action="tab"][data-tab="context"]');
  await page.click('[data-action="sim-event"][data-event="context-pressure"]');
  await sleep(160);
  await page.screenshot(join(OUT, '06-aviso-200k.png'));
  const ctx = await page.eval(`({ banner: !document.querySelector('#ctx-warning').hidden, total: state.people.find((p) => p.id === 'p-rui').context })`);
  assert.ok(ctx.banner && ctx.total >= 200);
  ok('aviso de contexto > 200k', `${ctx.total.toFixed(1)}k de contexto`);

  /* 7. Eliminação em dois passos, com histórico preservado no Arquivo. */
  await page.click('g.seat[role="button"][data-agent="p-alex"]');
  await page.waitFor('!document.querySelector("#inspector").hidden');
  await page.click('[data-action="eliminate-agent"][data-agent="p-alex"]');
  assert.equal(await page.eval(`!!document.querySelector('g.seat[role="button"][data-agent="p-alex"]')`), true,
    'o primeiro clique não elimina — pede confirmação');
  await page.click('[data-action="eliminate-confirm"][data-agent="p-alex"]');
  await page.waitFor('!document.querySelector(\'g.seat[role="button"][data-agent="p-alex"]\')');
  await page.click('#archive-button');
  await page.waitFor('document.querySelector("#archive-dialog").open');
  await page.click('[data-action="archive-detail"][data-archive="0"]');
  await sleep(160);
  await page.screenshot(join(OUT, '07-arquivo-eliminados.png'));
  const arq = await page.eval(`({ nome: state.archived[0].name, acoes: state.archived[0].actions.length, custo: state.archived[0].cost.toFixed(3), tokens: state.archived[0].usage.output })`);
  assert.equal(arq.nome, 'Alex');
  assert.ok(arq.acoes >= 2);
  ok('arquivo de eliminados', `${arq.nome}: ${arq.acoes} ações, ${arq.tokens} tokens de saída, US$ ${arq.custo}`);
  await page.click('#archive-dialog [data-close-dialog]');

  /* 8. Saúde final: sem erros de consola e sem pedidos externos. */
  await page.screenshot(join(OUT, '08-cena-final.png'));
  assert.deepEqual(page.consoleErrors, [], `erros de consola: ${page.consoleErrors.join(' | ')}`);
  const externos = page.networkRequests.filter((u) => !u.startsWith(server.url));
  assert.deepEqual(externos, [], 'a app não pode fazer pedidos externos');
  ok('saúde final', 'zero erros de consola · zero pedidos externos');

  console.log(`\nSESSÃO SIMULADA COMPLETA — ${passos.length} passos verificados`);
  console.log(`Evidências em: ${OUT}`);
} finally {
  await browser?.close();
  await server?.close();
}
