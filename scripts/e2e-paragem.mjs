#!/usr/bin/env node
/*
 * scripts/e2e-paragem.mjs — E2E da PARAGEM EM CASCATA com trabalho real.
 *
 * A feature que o DSH não tem: parar um agente para também TODOS os seus
 * subagentes (lá, `cancel()`/`interrupt_agent` param só o alvo — "descendants
 * keep running" — e a fila pendente retoma sozinha depois da quietude).
 *
 * Uso:
 *   node scripts/e2e-paragem.mjs <url-base> <pasta> "<regex do título>" [--equipa=2] [--segundos=300]
 *
 * O que encena (numa conversa de TESTE, a do título):
 *   1. abre a pessoa e envia pelo CELULAR uma tarefa que delega em N subagentes
 *      com trabalho lento (`for i in $(seq 1 180); …; sleep 1`) — os agentes;
 *   2. espera pela mesa violeta "Equipe de …" com os subagentes A CORRER;
 *   3. manda uma TAREFA ADICIONAL por mensagem ao líder (entra na fila) e outra
 *      a um subagente (a fila de cada um);
 *   4. carrega em "Parar pessoa e equipa" da barra lateral, A MEIO;
 *   5. exige: o plano cobre o líder e TODA a subárvore (window.__wgParagem),
 *      cada sessão teve o turno cancelado e a fila largada, e ninguém — nem os
 *      subagentes — fica "Trabalhando" (a cascata funciona).
 *
 * Capturas + observacao.json na pasta de saída. Sai com código != 0 se falhar.
 * GASTA TOKENS (rota barata): usar uma conversa de teste.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchBrowser, sleep } from '../tests/helpers/cdp.mjs';

const posicionais = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [base, pasta, tituloTxt] = posicionais;
const N_EQUIPA = Number((process.argv.find((a) => a.startsWith('--equipa=')) || '--equipa=2').split('=')[1]);
const SEGUNDOS = Number((process.argv.find((a) => a.startsWith('--segundos=')) || '--segundos=300').split('=')[1]);
if (!base || !pasta || !tituloTxt) {
  console.error('uso: node scripts/e2e-paragem.mjs <url-base> <pasta> "<regex do título>" [--equipa=2] [--segundos=300]');
  process.exit(2);
}
const OUT = resolve(pasta);
mkdirSync(OUT, { recursive: true });
const ok = (nome, detalhe) => console.log(`✔ ${nome}${detalhe ? ` — ${detalhe}` : ''}`);

const TAREFA = `Delega já, em paralelo, a ${N_EQUIPA} subagentes (usa a ferramenta de subagentes), sem esperares por nenhum deles terminar. `
  + Array.from({ length: N_EQUIPA }, (_, i) => {
    const letra = String.fromCharCode(65 + i);
    return `\n- subagente ${letra}: corre no bash este comando e nada mais: for i in $(seq 1 180); do echo "${letra} $i"; sleep 1; done`;
  }).join('')
  + `\nDepois de os lançares, escreve um relatório com 25 secções numeradas sobre boas práticas de testes automatizados (uma frase por secção).`;
const TAREFA_ADICIONAL = 'Tarefa adicional: quando terminares o que tens em mãos, escreve ainda uma lista com 3 riscos de testes frágeis.';

const browser = await launchBrowser({ width: 1440, height: 900 });
const page = browser.page;
const marcos = {};
const linhas = [];

const estadoDaSala = () => page.eval(`(() => {
  const lugares = [...document.querySelectorAll('.wg-svg .seat[role="button"][data-session-id]:not(.slot-reserved)')];
  return lugares.map((s) => ({
    id: s.getAttribute('data-session-id'),
    nome: (s.querySelector('.seat-card-name') || {}).textContent || '',
    estado: (s.querySelector('.seat-card-status') || {}).textContent || '',
    mesa: ((s.closest('.desk-module') || {}).querySelector('.desk-label') || {}).textContent || '',
  }));
})()`);

const enviarPeloCelular = async (texto) => {
  await page.waitFor('!!document.querySelector(".wg-tel-campo textarea:not([disabled])")', 8000);
  await page.eval('document.querySelector(".wg-tel-campo textarea").focus()');
  await page.insertText(texto);
  await page.eval('document.querySelector(".wg-tel-enviar").click()');
};

try {
  await page.goto(base, 'document.readyState === "complete" && !!window.__DSH_BOOT__');
  await page.waitFor('typeof window.__wgDiag === "string" && window.__wgDiag.indexOf("factory:fim") >= 0', 20000);
  await sleep(1500);
  await page.eval('document.querySelector(\'button[aria-label="Modo jogo"]\').click()');
  await page.waitFor('!!document.querySelector(".wg-painel")', 15000);
  await sleep(3000);

  /* 1) a pessoa da conversa de teste */
  const alvo = await page.eval(`(() => {
    const re = new RegExp(${JSON.stringify(tituloTxt)}, 'i');
    const lugar = [...document.querySelectorAll('.wg-svg .seat[role="button"][data-session-id]:not(.slot-reserved)')]
      .find((s) => re.test((s.querySelector('title') || {}).textContent || ''));
    return lugar ? { id: lugar.getAttribute('data-session-id'), nome: (lugar.querySelector('.seat-card-name') || {}).textContent } : null;
  })()`);
  assert.ok(alvo, `nenhuma pessoa na sala com a conversa /${tituloTxt}/`);
  ok('pessoa-alvo na sala', `${alvo.nome} (${alvo.id})`);

  /* 2) abrir (barra lateral + celular) e enviar a tarefa de delegação */
  await page.eval(`document.querySelector('.wg-svg .seat[role="button"][data-session-id="${alvo.id}"] .seat-card').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await page.waitFor('!!document.querySelector(".wg-sidebar") && !!document.querySelector(".wg-telefone")', 10000);
  await enviarPeloCelular(TAREFA);
  ok('tarefa de delegação enviada pelo celular', `${N_EQUIPA} subagentes pedidos`);

  /* 3) esperar pelos agentes criados (mesa violeta + subagentes a correr) */
  const equipaIniciadaEm = Date.now();
  let equipa = null;
  while (Date.now() - equipaIniciadaEm < SEGUNDOS * 1000) {
    equipa = await page.eval(`(() => {
      const mesa = [...document.querySelectorAll('.wg-svg .desk-module[data-kind="delegation"]')][0];
      if (!mesa) return null;
      const lugares = [...mesa.querySelectorAll('.seat[role="button"][data-session-id]:not(.slot-reserved)')];
      return {
        rotulo: (mesa.querySelector('.desk-label') || {}).textContent || '',
        membros: lugares.map((s) => ({
          id: s.getAttribute('data-session-id'),
          nome: (s.querySelector('.seat-card-name') || {}).textContent || '',
          estado: (s.querySelector('.seat-card-status') || {}).textContent || '',
        })),
      };
    })()`);
    const filhos = equipa ? equipa.membros.filter((m) => m.id !== alvo.id) : [];
    if (filhos.length >= N_EQUIPA && filhos.some((f) => f.estado === 'Trabalhando')) break;
    await sleep(1000);
  }
  assert.ok(equipa, 'a mesa violeta "Equipe de …" não apareceu — a tarefa não delegou');
  const filhos = equipa.membros.filter((m) => m.id !== alvo.id);
  assert.ok(filhos.length >= N_EQUIPA, `só ${filhos.length} subagente(s) na mesa (esperados ${N_EQUIPA})`);
  assert.ok(filhos.some((f) => f.estado === 'Trabalhando'), 'nenhum subagente a trabalhar — nada para parar em cascata');
  marcos.equipa = `${Math.round((Date.now() - equipaIniciadaEm) / 1000)}s`;
  marcos.filhos = filhos;
  ok('agentes criados e a trabalhar', `${equipa.rotulo}: ${filhos.map((f) => `${f.nome} (${f.estado})`).join(', ')}`);
  await page.screenshot(join(OUT, 'paragem-01-equipa.png'));

  /* 4) tarefas ADICIONAIS por mensagem: ao líder (fila) e a um subagente (fila) */
  await enviarPeloCelular(TAREFA_ADICIONAL);
  ok('tarefa adicional enviada ao líder', 'entra na fila enquanto ele trabalha');
  const filhoAlvo = filhos[0];
  await page.eval(`document.querySelector('.wg-svg .seat[role="button"][data-session-id="${filhoAlvo.id}"] .seat-card').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await page.waitFor(`document.querySelector('.wg-sidebar').getAttribute('data-session-id') === ${JSON.stringify(filhoAlvo.id)}`, 8000);
  await sleep(600);
  await enviarPeloCelular(TAREFA_ADICIONAL);
  ok(`tarefa adicional enviada ao subagente ${filhoAlvo.nome}`, 'a fila dele também entra no plano');
  await page.screenshot(join(OUT, 'paragem-02-filas.png'));

  /* 5) voltar ao líder e PARAR A MEIO */
  await page.eval(`document.querySelector('.wg-svg .seat[role="button"][data-session-id="${alvo.id}"] .seat-card').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await page.waitFor(`document.querySelector('.wg-sidebar').getAttribute('data-session-id') === ${JSON.stringify(alvo.id)}`, 8000);
  const botao = await page.eval(`(() => {
    const b = document.querySelector('.wg-sidebar .wg-parar');
    return b ? { rotulo: b.textContent.trim(), alcance: b.getAttribute('data-alcance'), titulo: b.title } : null;
  })()`);
  assert.ok(botao, 'o botão "Parar" não está disponível para quem está a trabalhar com equipa');
  assert.equal(botao.alcance, 'equipa', `o botão tem de dizer o alcance da equipa: ${botao.rotulo}`);
  ok('botão de paragem em cascata visível', `${botao.rotulo} · ${botao.titulo.slice(0, 70)}…`);
  await page.eval('document.querySelector(".wg-sidebar .wg-parar").click()');
  const paradoEm = Date.now();
  ok('PARAR carregado a meio do trabalho', `${alvo.nome} + ${filhos.length} subagente(s)`);

  /* 6) o resultado da cascata (window.__wgParagem) */
  await page.waitFor('!!window.__wgParagem', 15000);
  const paragem = await page.eval('JSON.parse(JSON.stringify(window.__wgParagem))');
  marcos.paragem = paragem;
  const idsFilhos = filhos.map((f) => f.id);
  for (const id of idsFilhos) {
    assert.ok(paragem.plano.includes(id), `o plano não cobre o subagente ${id} (plano: ${paragem.plano.join(', ')})`);
    assert.ok(paragem.parados.includes(id), `o subagente ${id} não foi tratado na paragem`);
  }
  assert.ok(paragem.plano.includes(alvo.id) && paragem.parados.includes(alvo.id), 'o líder tem de estar no plano e ser tratado');
  assert.deepEqual(paragem.falhas, [], `falhas na paragem: ${JSON.stringify(paragem.falhas)}`);
  assert.ok(paragem.turnosCancelados >= 2, `só ${paragem.turnosCancelados} turnos cancelados — a cascata não chegou aos filhos`);
  assert.ok(paragem.filaLimpada >= 1, `a fila pendente não foi largada (${paragem.filaLimpada}) — as tarefas adicionais retomariam sozinhas`);
  ok('plano em cascata executado', `plano=${paragem.plano.length} · turnos cancelados=${paragem.turnosCancelados} · fila largada=${paragem.filaLimpada}`);
  console.log(`   · moradas: ${(paragem.detalhes || []).map((d) => `${d.id.slice(0, 8)}=${d.morada}`).join(', ')}`);

  /* 7) ninguém fica a trabalhar — nem os subagentes (a cascata é o ponto) */
  let todosParados = false;
  let salaFinal = [];
  while (Date.now() - paradoEm < 30000) {
    salaFinal = await estadoDaSala();
    const relevantes = salaFinal.filter((l) => l.id === alvo.id || idsFilhos.includes(l.id));
    linhas.push({ t: `${Math.round((Date.now() - paradoEm) / 1000)}s`, ...relevantes });
    if (relevantes.length && relevantes.every((l) => l.estado !== 'Trabalhando')) { todosParados = true; break; }
    await sleep(1000);
  }
  // Provas ANTES das asserções: uma falha tem de deixar rasto legível.
  writeFileSync(join(OUT, 'observacao.json'), JSON.stringify({ alvo, marcos, linhas, salaFinal, errosConsola: page.consoleErrors }, null, 1));
  if (!todosParados) {
    // Diagnóstico: quem ficou a trabalhar e o que diz a conversa dele
    // (retomou a tarefa da fila? continua no trabalho antigo?).
    const presos = salaFinal.filter((l) => (l.id === alvo.id || idsFilhos.includes(l.id)) && l.estado === 'Trabalhando');
    for (const preso of presos) {
      await page.eval(`document.querySelector('.wg-svg .seat[role="button"][data-session-id="${preso.id}"] .seat-card').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
      await sleep(1200);
      const conversa = await page.eval(`(() => {
        const itens = [...document.querySelectorAll('.wg-telefone .wg-tel-msg')].slice(-4);
        return itens.map((el) => ({ texto: (el.textContent || '').trim().slice(0, 120), recibo: (el.querySelector('.wg-tel-recibo') || {}).textContent || '' }));
      })()`);
      linhas.push({ diagnostico: preso, conversa });
      console.log(`   · PRESO: ${preso.nome} (${preso.id}) · conversa: ${JSON.stringify(conversa).slice(0, 300)}`);
    }
    writeFileSync(join(OUT, 'observacao.json'), JSON.stringify({ alvo, marcos, linhas, salaFinal, errosConsola: page.consoleErrors }, null, 1));
  }
  assert.ok(todosParados, 'alguém — provavelmente um subagente — continuou "Trabalhando" depois do Parar');
  ok('líder e TODOS os subagentes parados', `em ≤ ${Math.round((Date.now() - paradoEm) / 1000)}s`);
  await sleep(1500);
  await page.screenshot(join(OUT, 'paragem-03-parados.png'));

  /* 8) a fila largada não ressuscita: a tarefa adicional não entrou em turno */
  const filaDepois = await page.eval(`(() => {
    const fila = [...document.querySelectorAll('.wg-telefone .wg-tel-recibo')].map((e) => e.textContent.trim());
    return fila.filter((t) => /fila/i.test(t)).length;
  })()`);
  assert.equal(filaDepois, 0, 'ainda há mensagens "na fila" depois da paragem');
  ok('sem tarefas na fila depois da paragem', 'as tarefas adicionais foram largadas');

  assert.deepEqual(page.consoleErrors, [], 'zero erros de consola');
  ok('zero erros de consola');
  writeFileSync(join(OUT, 'observacao.json'), JSON.stringify({ alvo, marcos, linhas, errosConsola: page.consoleErrors }, null, 1));
  console.log(`\nPARAGEM EM CASCATA OK — evidências em ${OUT}`);
} finally {
  await browser.close();
}
