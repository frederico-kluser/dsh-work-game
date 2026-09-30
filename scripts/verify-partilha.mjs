#!/usr/bin/env node
/*
 * scripts/verify-partilha.mjs — valida o botão PARTILHAR (link + QR code) num DSH web real.
 *
 * Uso:  node scripts/verify-partilha.mjs <url-base-com-token> [pasta-de-saída] [--encerrar]
 *       (CHROME_PATH escolhe o browser: Chrome, Chromium ou Brave)
 *
 * Abre a UI do DSH num browser headless, ativa o Modo jogo e verifica o ciclo
 * completo da partilha (contrato: docs/contratos-plugin.md §8):
 *   - o botão "Partilhar ▾" existe na toolbar SÓ no desktop;
 *   - o painel abre, "Gerar link e QR code" publica o link (host efémero do
 *     domínio do utilizador) com QR code e o botão ganha o ponto verde;
 *   - o link gerado está MESMO online (303 = troca de token → cookie, ou 200)
 *     e tem a âncora `#jogo` (abre já no Modo jogo);
 *   - "Fechar a ação" derruba o link (o mesmo URL passa a 404) e o painel volta
 *     ao estado inicial — e nada mais o fecha;
 *   - em TELEMÓVEL o botão não aparece (a partilha é só desktop);
 *   - zero erros de consola.
 *
 * --encerrar acrescenta o botão destrutivo "Encerrar o Cloudflare": o 1.º clique
 * pede confirmação ("Confirmar: tudo fica offline") e o 2.º derruba TODAS as
 * rotas do Cloudflare desta máquina (a partilha E as permanentes, ex.:
 * kluser.me) e para o túnel — cada host da nota final tem de responder 404.
 * A verificação NÃO repõe o que derrubou: repor com
 *   python3 <domain.py> up '<upstream>' --name <label> [--alias …] [--persist]
 *
 * NOTA: a verificação publica e derruba UM link real (usa o nome de host que o
 * servidor tiver configurado; `DSH_WORK_GAME_SHARE_NAME` muda-o). No fim o link
 * fica SEMPRE fechado.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { launchBrowser, sleep } from '../tests/helpers/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const posicionais = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ENCRERAR = process.argv.includes('--encerrar'); // DERRUBA todas as rotas Cloudflare da máquina
const base = posicionais[0];
if (!base) {
  console.error('uso: node scripts/verify-partilha.mjs <url-base-com-token> [pasta-de-saída] [--encerrar]');
  process.exit(2);
}
const OUT = resolve(posicionais[1] || join(ROOT, 'logs', 'verify-partilha'));
mkdirSync(OUT, { recursive: true });

const ok = (nome, detalhe) => console.log(`✔ ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
const erros = [];

const browser = await launchBrowser({ width: 1440, height: 900 });
const page = browser.page;
try {
  await page.goto(base, 'document.readyState === "complete" && !!window.__DSH_BOOT__');
  await page.waitFor(
    `typeof window.__wgDiag === 'string' && window.__wgDiag.indexOf('factory:fim') >= 0`,
    20000,
  );
  ok('bundle do plugin ativado no DSH');

  await sleep(1500);
  await page.eval(`(() => { const b = document.querySelector('button[aria-label="Modo jogo"]'); if (!b) throw new Error('botão Modo jogo ausente'); b.click(); return true; })()`);
  await page.waitFor('!!document.querySelector(".wg-painel")', 15000);
  await sleep(1200);
  ok('Modo jogo aberto');

  /* ── desktop: o botão existe e o painel abre ─────────────────────── */
  const botao = await page.eval(`(() => {
    const b = document.querySelector('.wg-partilha-botao');
    return b ? { texto: b.textContent.trim(), visivel: b.offsetParent !== null } : null;
  })()`);
  assert.ok(botao && botao.visivel, 'o botão "Partilhar" tem de aparecer no desktop');
  ok('botão Partilhar presente no desktop', `"${botao.texto}"`);
  assert.equal(await page.eval('!!document.querySelector(".wg-partilha-menu")'), false, 'o painel começa fechado');

  await page.click('.wg-partilha-botao');
  await page.waitFor('!!document.querySelector(".wg-partilha-menu")', 5000);
  const menuInicial = await page.eval(`(() => ({
    titulo: (document.querySelector('.wg-partilha-titulo') || {}).textContent || '',
    gerar: !!document.querySelector('.wg-partilha-acao'),
    aviso: [...document.querySelectorAll('.wg-partilha-menu p')].map((p) => p.textContent).join(' '),
  }))()`);
  assert.match(menuInicial.titulo, /PARTILHAR/i, 'o painel tem o seu título');
  assert.ok(menuInicial.gerar, 'o painel traz o botão "Gerar link e QR code"');
  assert.match(menuInicial.aviso, /Fechar a ação/, 'o painel explica que o link só cai em "Fechar a ação"');
  assert.match(menuInicial.aviso, /confia/i, 'o painel avisa que o link acede à UI do DSH');
  ok('painel da partilha aberto', menuInicial.titulo);

  /* ── gerar o link + QR (túnel real) ──────────────────────────────── */
  await page.click('.wg-partilha-acao');
  await page.waitFor('!!document.querySelector(".wg-partilha-url")', 120000);
  const gerado = await page.eval(`(() => ({
    url: (document.querySelector('.wg-partilha-url') || {}).textContent || '',
    qrImg: !!document.querySelector('img.wg-partilha-qr'),
    qrSvg: !!document.querySelector('.wg-partilha-qr svg'),
    estado: (document.querySelector('.wg-partilha-estado') || {}).textContent || '',
    ponto: !!document.querySelector('.wg-partilha-botao .wg-partilha-ponto'),
    fechar: !!document.querySelector('.wg-partilha-fechar'),
  }))()`);
  assert.match(gerado.url, /^https:\/\/\S+\?token=[A-Za-z0-9_-]+#jogo$/, `o link leva o token e a âncora #jogo: ${gerado.url}`);
  assert.ok(gerado.qrImg || gerado.qrSvg, 'o QR code foi desenhado');
  assert.match(gerado.estado, /online/i, 'o painel diz que o link está online');
  assert.ok(gerado.ponto, 'o botão ganha o ponto de "link online"');
  assert.ok(gerado.fechar, 'aparece o botão "Fechar a ação"');
  await page.screenshot(join(OUT, '01-partilha-online.png'));
  ok('link + QR code gerados', `${gerado.url.slice(0, 42)}… · QR ${gerado.qrImg ? 'PNG' : 'SVG'}`);

  // O link está MESMO online: 303 (troca do token por cookie) ou 200.
  const online = await fetch(gerado.url, { redirect: 'manual' });
  assert.ok([200, 303].includes(online.status), `o link gerado não respondeu (HTTP ${online.status})`);
  ok('link online pela edge', `HTTP ${online.status}${online.status === 303 ? ' (token → cookie de sessão)' : ''}`);

  /* ── "Fechar a ação": o link cai e o painel repõe ────────────────── */
  await page.click('.wg-partilha-fechar');
  await page.waitFor('!document.querySelector(".wg-partilha-url") && !!document.querySelector(".wg-partilha-acao")', 60000);
  const fechado = await page.eval(`(() => ({
    ponto: !!document.querySelector('.wg-partilha-botao .wg-partilha-ponto'),
    gerar: !!document.querySelector('.wg-partilha-acao'),
  }))()`);
  assert.ok(fechado.gerar && !fechado.ponto, 'depois de fechar, o painel volta ao estado inicial');
  await sleep(1200);
  const offline = await fetch(gerado.url, { redirect: 'manual' });
  assert.equal(offline.status, 404, `o link devia estar OFFLINE depois de "Fechar a ação" (HTTP ${offline.status})`);
  ok('"Fechar a ação" derruba o link', 'o mesmo URL passa a HTTP 404 e o painel repõe');

  /* ── --encerrar: "Encerrar o Cloudflare" (TUDO offline, com confirmação) ── */
  if (ENCRERAR) {
    assert.ok(await page.eval('!!document.querySelector(".wg-partilha-encerrar")'),
      'o botão "Encerrar o Cloudflare" está no painel');
    await page.click('.wg-partilha-encerrar'); // 1.º clique = pede confirmação
    const confirma = await page.eval(
      `!![...document.querySelectorAll('.wg-partilha-encerrar')].find((b) => /Confirmar/.test(b.textContent))`,
    );
    assert.ok(confirma, 'o 1.º clique NÃO executa: pede "Confirmar: tudo fica offline"');
    await page.click('.wg-partilha-encerrar'); // 2.º clique = encerra
    await page.waitFor('!!document.querySelector(".wg-partilha-nota")', 120000);
    const nota = await page.eval('(document.querySelector(".wg-partilha-nota") || {}).textContent || ""');
    assert.match(nota, /Cloudflare encerrado/i, 'o painel confirma o encerramento');
    const estado = await page.eval(`fetch(${JSON.stringify('/api/dsh-work-game/partilha')}).then((r) => r.json())`);
    assert.equal(estado.ativo, false, 'o estado da partilha repõe-se');
    // TODOS os hosts da nota final estão offline — incluindo os permanentes.
    // "Offline" tem três caras (todas contam): 404 do router (túnel vivo),
    // 530 da edge (com `down all` o túnel PARA) ou erro de resolução DNS.
    const hosts = [...nota.matchAll(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)].map((m) => m[1]);
    for (const host of hosts) {
      let resposta = null;
      try {
        resposta = (await fetch(`https://${host}/`, { redirect: 'manual' })).status;
      } catch { resposta = 'sem resolução/ligação'; }
      assert.ok(resposta === 'sem resolução/ligação' || resposta >= 400,
        `https://${host} devia estar offline (resposta: ${resposta})`);
    }
    await page.screenshot(join(OUT, '03-cloudflare-encerrado.png'));
    ok('Encerrar o Cloudflare: TUDO offline', hosts.join(', ') || 'nada estava publicado');
  }

  /* ── telemóvel: a partilha não existe ────────────────────────────── */
  await page.setViewport(390, 844, true);
  await sleep(900);
  const movel = await page.eval(`(() => ({
    botao: !!document.querySelector('.wg-partilha-botao'),
    soCelular: /wg-so-celular/.test((document.querySelector('.wg-painel') || {}).className || ''),
  }))()`);
  assert.ok(movel.soCelular, 'o painel entra em modo telemóvel');
  assert.ok(!movel.botao, 'em telemóvel o botão "Partilhar" NÃO aparece');
  ok('em telemóvel não há botão Partilhar');
  await page.screenshot(join(OUT, '02-sem-partilha-no-telemovel.png'));
  await page.setViewport(1440, 900, false);
  await sleep(600);

  /* ── higiene: zero erros de consola ─────────────────────────────── */
  erros.push(...page.consoleErrors);
  assert.deepEqual(erros, [], `erros de consola: ${JSON.stringify(erros)}`);
  ok('zero erros de consola');
  console.log(`\nTUDO VERDE — evidências em ${OUT}`);
} catch (erro) {
  erros.push(...page.consoleErrors);
  // Sempre deixar a partilha FECHADA — mesmo quando a verificação falha.
  try {
    if (await page.eval('!!document.querySelector(".wg-partilha-fechar")')) {
      await page.click('.wg-partilha-fechar');
      await sleep(3000);
    }
  } catch { /* sem painel para fechar */ }
  try { await page.screenshot(join(OUT, '99-falha.png')); } catch { /* sem captura */ }
  console.error(`FALHOU: ${erro.message}`);
  if (erros.length) console.error(`erros de consola: ${JSON.stringify(erros)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
