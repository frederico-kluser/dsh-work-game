#!/usr/bin/env node
/*
 * scripts/e2e-dsh-panel.mjs — E2E do Modo jogo com TRABALHO REAL num DSH web.
 *
 * Uso:
 *   node scripts/e2e-dsh-panel.mjs <url-base> <pasta> <título-da-conversa (regex)> "<tarefa>" [--delegacao] [--segundos=240]
 *
 * Como um utilizador: abre o Modo jogo, escolhe a pessoa cuja conversa casa com o
 * título, "Abrir no DSH" (barra lateral), escreve a tarefa no compositor do DSH (input real),
 * envia e volta ao Modo jogo. Depois observa a sala segundo a segundo e exige:
 *   - a pessoa passa a "Trabalhando" enquanto o turno corre e volta a
 *     "Disponível" no fim;
 *   - com --delegacao: aparece a mesa violeta "Equipe de <pessoa>" com o
 *     subagente sentado e o lugar de casa reservado, e a mesa recolhe no fim;
 *   - zero erros de consola.
 * A tarefa corre no processo do DSH web (o que a sala acompanha ao vivo); uma
 * tarefa lançada por outro processo (ex.: dsh --profile headless) só entra no
 * catálogo do DSH web quando este volta a puxar a lista.
 * (Clicar na pessoa abre também o celular com a conversa; "Abrir no DSH" sai do
 * painel e o celular liberta a sessão. Para enviar SEM sair do Modo jogo, pelo
 * próprio celular, ver scripts/verify-dsh-panel.mjs --enviar.)
 * Capturas e observacao.json na pasta de saída.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchBrowser, sleep } from '../tests/helpers/cdp.mjs';

const posicionais = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [base, pasta, tituloTxt, tarefa] = posicionais;
const DELEGACAO = process.argv.includes('--delegacao');
const segundos = Number((process.argv.find((a) => a.startsWith('--segundos=')) || '--segundos=240').split('=')[1]);
if (!base || !pasta || !tituloTxt || !tarefa) {
  console.error('uso: node scripts/e2e-dsh-panel.mjs <url-base> <pasta> <título (regex)> "<tarefa>" [--delegacao] [--segundos=240]');
  process.exit(2);
}
const OUT = resolve(pasta);
mkdirSync(OUT, { recursive: true });
const ok = (nome, detalhe) => console.log(`✔ ${nome}${detalhe ? ` — ${detalhe}` : ''}`);

const browser = await launchBrowser({ width: 1440, height: 900 });
const page = browser.page;
const abrirModoJogo = async () => {
  await page.eval(`document.querySelector('button[aria-label="Modo jogo"]').click()`);
  await page.waitFor('!!document.querySelector(".wg-painel")', 15000);
};
try {
  await page.goto(base, 'document.readyState === "complete" && !!window.__DSH_BOOT__');
  await page.waitFor(`typeof window.__wgDiag === 'string' && window.__wgDiag.indexOf('factory:fim') >= 0`, 20000);
  await sleep(1500);
  await abrirModoJogo();
  await sleep(3000);

  // 1) a pessoa da conversa-alvo (o título vem no <title> do lugar)
  const alvo = await page.eval(`(() => {
    const re = new RegExp(${JSON.stringify(tituloTxt)});
    const lugar = [...document.querySelectorAll('.wg-svg .seat[role="button"][data-session-id]:not(.slot-reserved)')]
      .find((s) => re.test((s.querySelector('title') || {}).textContent || ''));
    if (!lugar) return null;
    return { id: lugar.getAttribute('data-session-id'), nome: (lugar.querySelector('.seat-card-name') || {}).textContent };
  })()`);
  assert.ok(alvo, `nenhuma pessoa na sala com a conversa /${tituloTxt}/`);
  ok('pessoa-alvo na sala', `${alvo.nome} (${alvo.id})`);

  // 2) barra lateral → Abrir no DSH → compositor do DSH
  await page.eval(`document.querySelector('.wg-svg .seat[role="button"][data-session-id="${alvo.id}"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await sleep(300);
  await page.eval(`document.querySelector('.wg-abrir-conversa').click()`);
  await page.waitFor(`!document.querySelector('.wg-painel') && !!document.querySelector('[contenteditable="true"][aria-label^="Message"]')`, 15000);
  await sleep(800);
  await page.eval(`document.querySelector('[contenteditable="true"][aria-label^="Message"]').focus()`);
  await page.insertText(tarefa);
  await sleep(300);
  await page.eval(`document.querySelector('button[aria-label="Send message"]').click()`);
  const enviadaEm = Date.now();
  ok('tarefa enviada pelo compositor do DSH', tarefa.slice(0, 60));
  await sleep(700);

  // 3) de volta à sala: observar
  await abrirModoJogo();
  const linhas = [];
  const marcos = {};
  let anterior = '';
  while (Date.now() - enviadaEm < segundos * 1000) {
    const estado = await page.eval(`(() => {
      const lugar = document.querySelector('.wg-svg .seat[role="button"][data-session-id="${alvo.id}"]:not(.slot-reserved)');
      const deleg = [...document.querySelectorAll('.wg-svg .desk-module[data-kind="delegation"]')];
      return {
        estado: lugar ? (lugar.querySelector('.seat-card-status') || {}).textContent : null,
        naDelegacao: !!(lugar && lugar.closest('.desk-module[data-kind="delegation"]')),
        delegacao: deleg.map((m) => (m.querySelector('.desk-label') || {}).textContent),
        naMesaDelegacao: deleg.reduce((n, m) => n + m.querySelectorAll('.seat[role="button"][data-session-id]:not(.slot-reserved)').length, 0),
        reservado: !!document.querySelector('.wg-svg .slot-reserved[data-session-id="${alvo.id}"]'),
        conta: (document.querySelector('.wg-conta') || {}).textContent,
      };
    })()`);
    const assinatura = JSON.stringify(estado);
    if (assinatura !== anterior) {
      anterior = assinatura;
      const t = `${Math.round((Date.now() - enviadaEm) / 1000)}s`;
      linhas.push({ t, ...estado });
      console.log(`   ${t.padStart(4)} · ${estado.conta} · ${alvo.nome}: ${estado.estado}${estado.naDelegacao ? ' (na mesa de delegação)' : ''} · delegação: [${estado.delegacao.join(', ')}] · reservado: ${estado.reservado}`);
      if (estado.estado === 'Trabalhando' && !marcos.trabalhando) {
        marcos.trabalhando = t;
        await page.screenshot(join(OUT, 'e2e-01-trabalhando.png'));
      }
      if (estado.delegacao.length && estado.naMesaDelegacao > 1 && !marcos.delegacao) {
        marcos.delegacao = t;
        marcos.delegacaoDetalhe = { mesas: estado.delegacao, reservado: estado.reservado, naDelegacao: estado.naDelegacao };
        await sleep(300);
        await page.screenshot(join(OUT, 'e2e-02-delegacao.png'));
      }
      if (marcos.trabalhando && estado.estado === 'Disponível' && !estado.delegacao.length) {
        marcos.fim = t;
        await page.screenshot(join(OUT, 'e2e-03-fim.png'));
        break;
      }
    }
    await sleep(700);
  }
  writeFileSync(join(OUT, 'observacao.json'), JSON.stringify({ alvo, marcos, linhas, errosConsola: page.consoleErrors }, null, 1));

  assert.ok(marcos.trabalhando, 'a pessoa tem de aparecer "Trabalhando" enquanto o turno corre');
  ok('a pessoa trabalhou ao vivo', `após ${marcos.trabalhando}`);
  if (DELEGACAO) {
    assert.ok(marcos.delegacao, 'a mesa violeta de delegação tem de aparecer com o subagente');
    assert.ok(marcos.delegacaoDetalhe.reservado && marcos.delegacaoDetalhe.naDelegacao, 'o líder senta-se na mesa de delegação e o lugar de casa fica reservado');
    ok('delegação ao vivo', `${marcos.delegacaoDetalhe.mesas.join(', ')} após ${marcos.delegacao}`);
  }
  assert.ok(marcos.fim, 'no fim do turno a pessoa volta a "Disponível" e a mesa de delegação recolhe');
  ok('fim do turno refletido', `após ${marcos.fim}`);
  assert.deepEqual(page.consoleErrors, [], 'zero erros de consola');
  ok('zero erros de consola');
  console.log(`\nE2E OK — evidências em ${OUT}`);
} finally {
  await browser.close();
}
