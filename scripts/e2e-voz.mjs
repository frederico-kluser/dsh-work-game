#!/usr/bin/env node
/*
 * scripts/e2e-voz.mjs — E2E da voz→transcrição no telemóvel do Modo jogo.
 *
 * Corre num Chromium com microfone FALSO (--use-fake-device-for-media-capture)
 * e a API da OpenAI INTERCEPTADA (page.route → resposta fixa), para provar o
 * fluxo completo de UI sem gastar créditos nem depender de hardware:
 *   sem chave → microfone abre as Definições → guardar chave → voltar à
 *   conversa → gravar (faixa .wg-tel-voz-estado com barras a animar-se) →
 *   parar → "A transcrever…" → texto na caixa (NUNCA enviado sozinho).
 *
 * A API real já é provada à parte (smoke com a chave de teste em /tmp).
 *
 * Uso:
 *   node scripts/e2e-voz.mjs --dsh "http://127.0.0.1:3199/?token=…"
 *   node scripts/e2e-voz.mjs --dsh "…" --pasta logs/e2e-voz
 *
 * Dependência opcional (o npm test continua sem dependências):
 *   npm i --no-save playwright && npx playwright install chromium
 *
 * Exit codes: 0 tudo verde · 1 alguma verificação reprovou · 2 uso inválido ·
 *             3 dependência em falta.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valor = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const DSH = valor('--dsh');
const PASTA = valor('--pasta') || join(ROOT, 'logs', 'e2e-voz');
const CHAVE_E2E = 'sk-e2e-falsa-nunca-real-0000000000';
const TEXTO_MOCK = 'Olá mundo, transcrição de voz a funcionar';

if (!DSH || args.includes('--help') || args.includes('-h')) {
  console.error('uso: node scripts/e2e-voz.mjs --dsh "http://127.0.0.1:PORT/?token=…" [--pasta logs/e2e-voz]');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('E2E: falta o playwright — npm i --no-save playwright && npx playwright install chromium');
  process.exit(3);
}

mkdirSync(PASTA, { recursive: true });
const resultados = [];
let falhas = 0;

async function verificacao(nome, fn) {
  try {
    const detalhe = await fn();
    resultados.push({ nome, ok: true, detalhe: detalhe ?? '' });
    console.log(`✔ ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  } catch (erro) {
    falhas += 1;
    resultados.push({ nome, ok: false, detalhe: String(erro?.message || erro) });
    console.log(`✘ ${nome} — ${erro?.message || erro}`);
  }
}

const captura = async (page, nome) => {
  try { await page.screenshot({ path: join(PASTA, `${nome}.png`) }); } catch { /* melhor esforço */ }
};

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-capture',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.grantPermissions(['microphone'], { origin: new URL(DSH).origin });
const page = await ctx.newPage();

/* API OpenAI interceptada: nunca sai rede real, e prova-se o pedido feito. */
let pedidoTranscricao = null;
await page.route('https://api.openai.com/**', async (rota) => {
  const req = rota.request();
  if (req.url().includes('/audio/transcriptions')) {
    pedidoTranscricao = {
      metodo: req.method(),
      autorizacao: req.headers()['authorization'] || '',
      modelo: (req.postData() || '').includes('gpt-transcribe') ? 'gpt-transcribe' : 'outro',
    };
    await rota.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ text: TEXTO_MOCK, usage: { type: 'duration', seconds: 2 } }),
    });
    return;
  }
  await rota.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"message":"não interceptado"}}' });
});

try {
  /* ── arranque + abertura do Modo jogo ─────────────────────────────── */
  await page.goto(DSH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__wgDiag === 'string' && window.__wgDiag.indexOf('factory:fim') >= 0, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  await verificacao('botão "Modo jogo" abre o painel', async () => {
    await page.click('button[aria-label="Modo jogo"]');
    await page.waitForSelector('.wg-painel', { timeout: 15000 });
  });

  await verificacao('clicar numa pessoa abre o telemóvel com composer', async () => {
    await page.click('.wg-svg .seat[role="button"][data-session-id] .seat-card');
    await page.waitForSelector('.wg-telefone .wg-tel-campo textarea', { timeout: 10000 });
    await page.waitForSelector('.wg-tel-voz', { timeout: 5000 });
    await captura(page, '01-conversa');
  });

  /* ── sem chave: o microfone abre as Definições ────────────────────── */
  await verificacao('sem chave, o microfone abre as Definições', async () => {
    await page.click('.wg-telefone .wg-tel-voz');
    await page.waitForSelector('.wg-telefone[data-vista="config"]', { timeout: 5000 });
    const r = await page.evaluate(() => ({
      titulo: document.querySelector('.wg-telefone[data-vista="config"]')?.textContent || '',
      password: !!document.querySelector('.wg-telefone[data-vista="config"] input[type="password"]'),
    }));
    assert(r.password, 'a tela de Definições não tem campo de chave');
    assert(/chave/i.test(r.titulo), 'a tela de Definições não fala em chave');
    await captura(page, '02-definicoes');
    return 'campo de chave presente';
  });

  await verificacao('guardar a chave (mascarada) e aviso de confiança', async () => {
    await page.fill('.wg-telefone[data-vista="config"] input[type="password"]', CHAVE_E2E);
    await page.click('.wg-telefone[data-vista="config"] button:has-text("Guardar")');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const tel = document.querySelector('.wg-telefone[data-vista="config"]');
      return {
        texto: tel?.textContent || '',
        guardada: window.localStorage.getItem('dsh-work-game:config') || '',
      };
    });
    assert(r.guardada.includes('openai') || r.guardada.includes('chave') || r.guardada.includes('Key'), 'a chave não persistiu em dsh-work-game:config');
    assert(!r.texto.includes(CHAVE_E2E), 'a chave aparece EM CLARO na UI');
    assert(/platform\.openai\.com|revoga/i.test(r.texto), 'falta o aviso de confiança (revogar em platform.openai.com)');
    await captura(page, '03-chave-guardada');
    return 'persistida e nunca em claro';
  });

  /* ── voltar à conversa (Configurações → Grupos → grupo → conversa) ─ */
  await verificacao('voltar da Definições aos Grupos', async () => {
    await page.click('.wg-telefone[data-vista="config"] .wg-tel-nav button');
    await page.waitForSelector('.wg-telefone[data-vista="grupos"]', { timeout: 5000 });
  });

  await verificacao('reabrir a conversa pela mesa (composer pronto)', async () => {
    // Caminho robusto: a mesa da sala reabre sempre a conversa real (não
    // depende do feed do grupo ter mensagens — os grupos vazios são legítimos).
    await page.click('.wg-svg .seat[role="button"][data-session-id] .seat-card');
    await page.waitForSelector('.wg-telefone .wg-tel-campo textarea', { timeout: 8000 });
    const r = await page.evaluate(() => ({
      composer: !!document.querySelector('.wg-telefone .wg-tel-campo textarea'),
      config: !!document.querySelector('.wg-telefone[data-vista="config"]'),
    }));
    assert(r.composer && !r.config, 'não voltámos à conversa com composer');
  });

  /* ── gravação com barras de decibéis ─────────────────────────────── */
  await verificacao('gravar: faixa viva com barras de decibéis a animar', async () => {
    await page.click('.wg-telefone .wg-tel-voz');
    await page.waitForSelector('.wg-telefone .wg-tel-voz-estado', { timeout: 5000 });
    await page.waitForSelector('.wg-telefone .wg-tel-voz-barras', { timeout: 5000 });
    const amostras = [];
    for (let i = 0; i < 6; i += 1) {
      amostras.push(await page.evaluate(() => [...document.querySelectorAll('.wg-tel-voz-barras span')]
        .map((s) => s.style.transform || '')));
      await page.waitForTimeout(180);
    }
    const escreveu = amostras.some((linha) => linha.some((t) => /scaleY/.test(t)));
    assert(escreveu, 'nenhuma barra recebeu transform:scaleY (loop de nível morto)');
    const mudou = new Set(amostras.map((l) => l.join('|'))).size > 1;
    const barras = amostras[0].length;
    assert(barras >= 10, `poucas barras (${barras})`);
    await captura(page, '04-a-gravar');
    return `${barras} barras · transform escrito · valores ${mudou ? 'variaram' : 'estáveis (dispositivo falso calmo)'}`;
  });

  await verificacao('parar → "A transcrever…" → texto na caixa, sem enviar', async () => {
    await page.click('.wg-telefone .wg-tel-voz');
    await page.waitForFunction(() => {
      const t = document.querySelector('.wg-telefone .wg-tel-campo textarea');
      return t && t.value.length > 0;
    }, null, { timeout: 15000 });
    const r = await page.evaluate(() => {
      const tel = document.querySelector('.wg-telefone');
      const t = tel.querySelector('.wg-tel-campo textarea');
      return {
        valor: t.value,
        enviadas: [...tel.querySelectorAll('.wg-tel-eu .wg-tel-bolha')].map((b) => b.textContent).filter((x) => x.includes('Olá mundo')).length,
      };
    });
    assert.equal(r.valor, TEXTO_MOCK, `caixa com "${r.valor}"`);
    assert.equal(r.enviadas, 0, 'a transcrição foi ENVIADA sozinha — tem de ficar para rever');
    await captura(page, '05-transcrito');
    return 'texto na caixa para rever';
  });

  await verificacao('pedido à OpenAI: Bearer + modelo gpt-transcribe', async () => {
    assert(pedidoTranscricao, 'a API nunca foi chamada');
    assert.equal(pedidoTranscricao.metodo, 'POST');
    assert.equal(pedidoTranscricao.autorizacao, `Bearer ${CHAVE_E2E}`, 'Authorization errado');
    assert.equal(pedidoTranscricao.modelo, 'gpt-transcribe', 'modelo errado');
    return 'POST multipart com Bearer e gpt-transcribe';
  });

  /* ── limpeza: a chave pode ser removida ───────────────────────────── */
  await verificacao('"Limpar chave" apaga a configuração', async () => {
    // Da conversa: "‹" (.wg-tel-voltar) sobe SEMPRE para os Grupos (nunca
    // fecha); a engrenagem tem aria-label próprio (o texto visível da linha é
    // 'Chave da API OpenAI' e não casa por regex).
    await page.click('.wg-telefone .wg-tel-voltar');
    await page.waitForSelector('.wg-telefone[data-vista="grupos"]', { timeout: 5000 });
    await page.click('.wg-telefone button[aria-label="Abrir as Configurações"]');
    await page.waitForSelector('.wg-telefone[data-vista="config"]', { timeout: 5000 });
    await page.click('.wg-telefone[data-vista="config"] button:has-text("Limpar")');
    await page.waitForTimeout(300);
    const guardada = await page.evaluate(() => window.localStorage.getItem('dsh-work-game:config') || '');
    assert(!guardada.includes(CHAVE_E2E), 'a chave sobreviveu ao "Limpar chave"');
    await captura(page, '06-chave-limpa');
  });
} finally {
  await browser.close();
  writeFileSync(join(PASTA, 'relatorio.json'), JSON.stringify({ dsh: DSH.replace(/token=[^&]+/, 'token=…'), resultados }, null, 2));
}

console.log(`\nE2E voz: ${resultados.length - falhas}/${resultados.length} verificações · relatório em ${PASTA}`);
process.exit(falhas ? 1 : 0);
