#!/usr/bin/env node
/*
 * scripts/verify-dsh-panel.mjs — valida o painel do escritório NUM DSH web real.
 *
 * Uso:  node scripts/verify-dsh-panel.mjs <url-base> [pasta-de-saída]
 *
 * Abre a UI do DSH num Chrome headless, espera que o bundle do plugin ative
 * (window.__wgDiag), clica em "Modo jogo", abre o painel do escritório e verifica:
 *   - ativação do factory do plugin (diagnóstico legível);
 *   - o painel está ligado ao DSH (sem o banner "à espera do host");
 *   - existem pessoas REAIS do catálogo (ou o estado honesto "sem sessões");
 *   - clicar numa pessoa mostra os chips de telemetria (modelo/custo/CTX).
 * Grava capturas de evidência e sai com código != 0 se algo falhar.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { launchBrowser, sleep } from '../tests/helpers/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2];
if (!base) {
  console.error('uso: node scripts/verify-dsh-panel.mjs <url-base> [pasta-de-saída]');
  process.exit(2);
}
const OUT = resolve(process.argv[3] || join(ROOT, 'logs', 'verify-dsh'));
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
    const diag = await page.eval('window.__wgDiag');
    console.error(`diagnóstico: __wgDiag=${diag} __wgSnap=${await page.eval('window.__wgSnap ?? null')} erros=${JSON.stringify(page.consoleErrors)}`);
    throw erro;
  }

  // O catálogo do host carrega de forma assíncrona: dar-lhe tempo e observar.
  let painel = null;
  for (let tentativa = 0; tentativa < 15; tentativa += 1) {
    await sleep(1000);
    painel = await page.eval(`(() => {
      const t = (s) => { const el = document.querySelector(s); return el ? el.textContent.trim() : null; };
      const p = document.querySelector('.wg-painel');
      return {
        banner: t('.wg-banner'),
        conta: t('.wg-conta'),
        pessoas: document.querySelectorAll('[data-session-id]').length,
        snap: window.__wgSnap ?? null,
        visivel: !!p && p.offsetParent !== null,
      };
    })()`);
    if (painel.pessoas > 0) break;
  }
  await page.screenshot(join(OUT, '01-painel.png'));
  console.log(`   · diagnóstico: pessoas=${painel.pessoas} visível=${painel.visivel} snap=${painel.snap} banner="${painel.banner ?? ''}"`);

  assert.ok(!/à espera do host/.test(painel.banner ?? ''), `o painel continua sem canal: ${painel.banner}`);
  ok('painel ligado ao canal real do DSH', painel.banner ? `estado honesto: "${painel.banner}"` : `${painel.pessoas} pessoas na sala`);
  const snap = painel.snap ? JSON.parse(painel.snap) : null;
  assert.ok(!(snap && snap.n > 0 && painel.pessoas === 0),
    `o catálogo tem ${snap.n} linha(s) mas a sala mostra 0 pessoas — falha de renderização`);

  // Telemetria ao vivo: clicar numa pessoa e ler os chips do rodapé.
  if (painel.pessoas > 0) {
    await page.click('[data-session-id]');
    await sleep(250);
    const rodape = await page.eval(`[...document.querySelectorAll('.wg-rodape .wg-chip')].map((c) => c.textContent.trim())`);
    await page.screenshot(join(OUT, '02-pessoa.png'));
    assert.ok(rodape.length >= 3, `o rodapé deve trazer chips de telemetria: ${JSON.stringify(rodape)}`);
    ok('telemetria da pessoa selecionada', rodape.join(' · '));
  } else {
    ok('sem sessões no catálogo', 'o painel mostra o estado honesto (nada inventado)');
  }

  console.log(`\nVERIFICAÇÃO DO PAINEL OK — evidências em ${OUT}`);
} finally {
  await browser?.close();
}
