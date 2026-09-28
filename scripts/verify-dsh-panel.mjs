#!/usr/bin/env node
/*
 * scripts/verify-dsh-panel.mjs — valida o painel do escritório NUM DSH web real.
 *
 * Uso:  node scripts/verify-dsh-panel.mjs <url-base> [pasta-de-saída] [--acoes] [--recrutar]
 *       (CHROME_PATH escolhe o browser: Chrome, Chromium ou Brave)
 *       --acoes    rato real: clicar seleciona, arrastar não clica, "Abrir conversa" navega
 *       --recrutar lugar livre → conversa nova no workspace (pode criar uma em branco)
 *
 * Abre a UI do DSH num browser headless, espera que o bundle do plugin ative
 * (window.__wgDiag), clica em "Modo jogo", abre o painel do escritório e verifica:
 *   - ativação do factory do plugin (diagnóstico legível);
 *   - o painel está ligado ao DSH (sem o banner "à espera do host");
 *   - os WORKSPACES do DSH viram mesas com o seu título (nada colapsa em "geral");
 *   - os bonecos desenham-se: cada <use> aponta para um <symbol> que existe, com
 *     caixa real no ecrã, e nenhuma referência #… fica sem destino;
 *   - clicar numa pessoa mostra o inspetor com os chips de telemetria;
 *   - zero erros de consola.
 * Grava capturas de evidência e sai com código != 0 se algo falhar.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { launchBrowser, sleep } from '../tests/helpers/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const posicionais = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ACOES = process.argv.includes('--acoes');       // rato real + "Abrir conversa"
const RECRUTAR = process.argv.includes('--recrutar'); // + lugar livre (pode criar conversa em branco)
const base = posicionais[0];
if (!base) {
  console.error('uso: node scripts/verify-dsh-panel.mjs <url-base> [pasta-de-saída] [--acoes] [--recrutar]');
  process.exit(2);
}
const OUT = resolve(posicionais[1] || join(ROOT, 'logs', 'verify-dsh'));
mkdirSync(OUT, { recursive: true });

const ok = (nome, detalhe) => console.log(`✔ ${nome}${detalhe ? ` — ${detalhe}` : ''}`);

const browser = await launchBrowser({ width: 1440, height: 900 });
const page = browser.page;
try {
  await page.goto(base, 'document.readyState === "complete" && !!window.__DSH_BOOT__');
  await page.waitFor(
    `typeof window.__wgDiag === 'string' && window.__wgDiag.indexOf('factory:fim') >= 0`,
    20000,
  );
  const diag = await page.eval('window.__wgDiag');
  assert.ok(/factory:react-ok/.test(diag), `React do bundle não carregou: ${diag}`);
  ok('bundle do plugin ativado no DSH', diag.slice(0, 120));

  // Deixar a composição dos slots assentar antes de clicar (o runner monta os
  // registos dos slots depois do factory do bundle).
  await sleep(1500);

  // Botão "Modo jogo" (slot sidebar.footer.action) → abre o painel do escritório.
  await page.eval(`(() => { const b = document.querySelector('button[aria-label="Modo jogo"]'); if (!b) throw new Error('botão Modo jogo ausente'); b.click(); return true; })()`);
  await sleep(700);
  const diagApos = await page.eval('window.__wgDiag');
  assert.ok(/abrir:chamado/.test(diagApos), `clique em "Modo jogo" não chegou ao handler: ${diagApos}`);
  ok('botão "Modo jogo" abriu o painel', diagApos.split('|').slice(-1)[0]);

  try {
    await page.waitFor('!!document.querySelector(".wg-painel")', 15000);
  } catch (erro) {
    const d = await page.eval('window.__wgDiag');
    console.error(`diagnóstico: __wgDiag=${d} __wgSnap=${await page.eval('window.__wgSnap ?? null')} erros=${JSON.stringify(page.consoleErrors)}`);
    throw erro;
  }

  // O catálogo (sessões + workspaces) carrega de forma assíncrona: observar.
  let painel = null;
  for (let tentativa = 0; tentativa < 20; tentativa += 1) {
    await sleep(1000);
    painel = await page.eval(`(() => {
      const t = (s) => { const el = document.querySelector(s); return el ? el.textContent.trim() : null; };
      const p = document.querySelector('.wg-painel');
      let snap = null;
      try { snap = JSON.parse(window.__wgSnap); } catch { snap = null; }
      return {
        banner: t('.wg-banner'),
        conta: t('.wg-conta'),
        pessoas: document.querySelectorAll('.wg-svg .character').length,
        mesas: [...document.querySelectorAll('.wg-svg .desk-module')].map((m) => ({
          kind: m.getAttribute('data-kind'),
          rotulo: (m.querySelector('.desk-label') || {}).textContent || '',
          sub: (m.querySelector('.desk-subtitle') || {}).textContent || '',
        })),
        snap,
        visivel: !!p && p.offsetParent !== null,
      };
    })()`);
    const snapPronto = painel.snap && typeof painel.snap === 'object';
    if (painel.pessoas > 0 && snapPronto && painel.snap.ws !== null) break;
  }
  await page.screenshot(join(OUT, '01-painel.png'));
  console.log(`   · diagnóstico: ${painel.conta} · visível=${painel.visivel} · snap=${JSON.stringify(painel.snap)}`);
  console.log(`   · mesas: ${painel.mesas.map((m) => `${m.rotulo}${m.kind === 'main' ? '' : ` (${m.kind})`}`).join(' | ')}`);

  assert.ok(!/à espera do host/.test(painel.banner ?? ''), `o painel continua sem canal: ${painel.banner}`);
  ok('painel ligado ao canal real do DSH', painel.banner ? `estado honesto: "${painel.banner}"` : `${painel.pessoas} pessoas na sala`);
  const snap = painel.snap;
  assert.ok(!(snap && snap.raizes > 0 && painel.pessoas === 0),
    `o catálogo tem ${snap && snap.raizes} conversa(s) visível(is) mas a sala mostra 0 pessoas — falha de renderização`);

  // Workspaces do DSH → mesas com o seu título (nunca tudo em "geral").
  assert.ok(!painel.mesas.some((m) => m.rotulo === 'geral'), 'nenhuma mesa pode chamar-se "geral" (workspaces colapsados)');
  if (snap && Number.isInteger(snap.ws)) {
    const principais = painel.mesas.filter((m) => m.kind === 'main' && m.rotulo !== 'Sem workspace');
    assert.ok(principais.length >= snap.ws, `o DSH tem ${snap.ws} workspace(s) mas a sala só mostra ${principais.length} mesa(s) de workspace`);
    ok('workspaces do DSH viram mesas', `${snap.ws} workspace(s): ${principais.map((m) => m.rotulo).join(', ')}`);
  } else {
    ok('sem serviço de workspaces', 'a sala agrupa por pasta (cwd)');
  }

  // Bonecos: cada <use> aponta para um <symbol> existente e tem caixa real.
  const bonecos = await page.eval(`(() => {
    const usos = [...document.querySelectorAll('.wg-svg .character use')];
    const semSimbolo = usos.filter((u) => !document.getElementById((u.getAttribute('href') || '').slice(1)));
    const caixas = usos.map((u) => { const r = u.getBoundingClientRect(); return r.width > 4 && r.height > 4; });
    const trace = (window.__wgTrace || []).filter((t) => t.ponto === 'refs-verificadas').slice(-1)[0] || null;
    return { usos: usos.length, semSimbolo: semSimbolo.length, comCaixa: caixas.filter(Boolean).length, trace: trace && trace.detalhe };
  })()`);
  assert.equal(bonecos.usos, painel.pessoas, 'um <use> por pessoa sentada');
  assert.equal(bonecos.semSimbolo, 0, 'todo o boneco aponta para um <symbol> que existe no sprite');
  assert.equal(bonecos.comCaixa, bonecos.usos, 'todo o boneco tem caixa real no ecrã');
  assert.ok(bonecos.trace && bonecos.trace.partidas === 0, `referências #… sem destino: ${JSON.stringify(bonecos.trace)}`);
  ok('bonecos desenhados', `${bonecos.usos} bustos, ${bonecos.trace.refs} referências, 0 partidas`);

  // Inspetor: clicar numa pessoa mostra os chips de telemetria.
  if (painel.pessoas > 0) {
    await page.click('.wg-svg .seat[data-session-id]');
    await sleep(300);
    const inspetor = await page.eval(`(() => ({
      nome: (document.querySelector('.wg-inspetor-nome') || {}).textContent || null,
      chips: [...document.querySelectorAll('.wg-inspetor .wg-chip')].map((c) => c.textContent.trim()),
      avatar: !!document.querySelector('.wg-inspetor-avatar use'),
    }))()`);
    await page.screenshot(join(OUT, '02-pessoa.png'));
    assert.ok(inspetor.nome, 'o inspetor mostra o nome da pessoa');
    assert.ok(inspetor.chips.length >= 3, `o inspetor deve trazer chips de telemetria: ${JSON.stringify(inspetor.chips)}`);
    ok('inspetor da pessoa selecionada', `${inspetor.nome}: ${inspetor.chips.join(' · ')}`);
  } else {
    ok('sem conversas visíveis', 'o painel mostra o estado honesto (nada inventado)');
  }

  if (ACOES && painel.pessoas > 1) {
    const centroDe = (indice) => page.eval(`(() => {
      const el = document.querySelectorAll('.wg-svg .seat[role="button"][data-session-id]')[${indice}];
      const r = el.querySelector('.seat-card').getBoundingClientRect();
      return { id: el.getAttribute('data-session-id'), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    const selecionada = () => page.eval(`(() => { const s = document.querySelector('.wg-svg .seat.selected'); return s ? s.getAttribute('data-session-id') : null; })()`);

    // 1) rato REAL (Input do CDP): o clique num boneco seleciona-o.
    const alvo = await centroDe(1);
    await page.clickAt(alvo.x, alvo.y);
    await sleep(300);
    assert.equal(await selecionada(), alvo.id, 'clique real num boneco seleciona-o');
    ok('clique real (rato) seleciona o boneco', alvo.id);

    // 2) arrastar a partir de um boneco explora a sala e NÃO é clique.
    const antes = await page.eval(`document.querySelector('.wg-mundo').style.transform`);
    const outro = await centroDe(0);
    await page.drag(outro.x, outro.y, outro.x + 140, outro.y + 70);
    await sleep(300);
    const depois = await page.eval(`document.querySelector('.wg-mundo').style.transform`);
    assert.notEqual(depois, antes, 'arrastar move a sala');
    assert.equal(await selecionada(), alvo.id, 'largar o arrastar noutro sítio não muda a seleção');
    ok('arrastar move a sala sem disparar cliques', `${antes} → ${depois}`);

    // 2b) teclado: Enter numa pessoa com foco seleciona-a (lugares são role="button").
    const porTeclado = await page.eval(`(() => {
      const lugares = document.querySelectorAll('.wg-svg .seat[role="button"][data-session-id]');
      const el = lugares[lugares.length - 1];
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      return el.getAttribute('data-session-id');
    })()`);
    await sleep(250);
    assert.equal(await selecionada(), porTeclado, 'Enter numa pessoa com foco seleciona-a');
    ok('teclado (Enter) seleciona a pessoa com foco', porTeclado);

    // 3) "Abrir conversa" (uiWorkspace.openSession) mostra a conversa no DSH.
    assert.ok(await page.eval(`!!document.querySelector('.wg-abrir-conversa')`), 'o inspetor oferece "Abrir conversa"');
    await page.eval(`document.querySelector('.wg-abrir-conversa').click()`);
    await page.waitFor(`!document.querySelector('.wg-painel')`, 8000);
    await sleep(500);
    await page.screenshot(join(OUT, '03-conversa.png'));
    ok('"Abrir conversa" levou à conversa no DSH');

    // 4) lugar livre recruta (uiWorkspace.startSession) — só com --recrutar,
    //    porque pode criar uma conversa em branco no workspace.
    if (RECRUTAR) {
      await page.eval(`document.querySelector('button[aria-label="Modo jogo"]').click()`);
      await page.waitFor('!!document.querySelector(".wg-svg .slot-free.recrutavel")', 15000);
      await sleep(800);
      const livre = await page.eval(`(() => {
        const el = document.querySelector('.wg-svg .slot-free.recrutavel');
        const r = el.querySelector('.seat-card').getBoundingClientRect();
        return { ws: el.getAttribute('data-workspace-id'), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`);
      await page.clickAt(livre.x, livre.y);
      await page.waitFor(`!document.querySelector('.wg-painel')`, 8000);
      const rasto = await page.eval(`(window.__wgTrace || []).filter((t) => t.ponto === 'nova-sessao').map((t) => t.detalhe)`);
      assert.ok(rasto.includes(livre.ws), `startSession no workspace do lugar: ${JSON.stringify(rasto)}`);
      await sleep(500);
      await page.screenshot(join(OUT, '04-recrutar.png'));
      ok('lugar livre abriu conversa nova no workspace', livre.ws);
    }
  }

  assert.deepEqual(page.consoleErrors, [], 'zero erros de consola');
  ok('zero erros de consola');
  writeFileSync(join(OUT, 'resultado.json'), JSON.stringify({ painel, bonecos }, null, 1));
  console.log(`\nVERIFICAÇÃO DO PAINEL OK — evidências em ${OUT}`);
} finally {
  await browser?.close();
}
