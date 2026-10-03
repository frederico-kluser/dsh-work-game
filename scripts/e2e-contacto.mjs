#!/usr/bin/env node
/*
 * scripts/e2e-contacto.mjs — E2E do "Adicionar contacto" das CADEIRAS VAZIAS.
 *
 * Corre num Chromium headless contra um DSH web real e prova, como um
 * utilizador, o fluxo completo de UI SEM efeitos (nunca se confirma o
 * formulário — nada de sessões criadas):
 *   Modo jogo → cadeira vazia → celular no layout "Adicionar contacto" →
 *   nome (o boneco do preview acompanha) → "Trocar boneco" → prompt →
 *   skills por checkbox (entram no prompt final) → modelo do catálogo.
 *
 * Autenticação:
 *   --dsh "http://127.0.0.1:PORT/?token=…"          (instância nova)
 *   --dsh "http://127.0.0.1:3080" --cookie-file <f> (instância viva; f = "nome=valor")
 *   --dsh "http://127.0.0.1:3080"                   (cunha o cookie a partir de
 *                                                    ~/.dsh/.credentials.yaml)
 *
 * O cookie segue o esquema do Host (`browser-auth.ts`): nome
 * `dsh-auth-<b64url sha256 do Host>` e valor `v1.<payload>.<HMAC-SHA256>` sobre
 * o segredo `client-connection/browser-session`. O segredo NUNCA é impresso.
 *
 * Dependência opcional (o npm test continua sem dependências):
 *   npm i --no-save playwright && npx playwright install chromium
 *
 * Exit codes: 0 tudo verde · 1 alguma verificação reprovou · 2 uso inválido ·
 *             3 dependência em falta.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valor = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const DSH = valor('--dsh');
const COOKIE_FILE = valor('--cookie-file');
const PASTA = valor('--pasta') || join(ROOT, 'logs', 'e2e-contacto');

if (!DSH || args.includes('--help') || args.includes('-h')) {
  console.error('uso: node scripts/e2e-contacto.mjs --dsh "http://127.0.0.1:PORT[/?token=…]" [--cookie-file <f>] [--pasta logs/e2e-contacto]');
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

/* ── cookie de sessão do browser (esquema do Host, sem imprimir segredos) ── */
const b64url = (buf) => Buffer.from(buf).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function cunharCookie(url) {
  const autoridade = new URL(url).host; // ex.: 127.0.0.1:3080
  const ficheiro = join(homedir(), '.dsh', '.credentials.yaml');
  const yaml = readFileSync(ficheiro, 'utf8');
  const bloco = /client-connection\/browser-session:[\s\S]*?(?=\n\S|\n*$)/.exec(yaml);
  if (!bloco) throw new Error('sem o registo client-connection/browser-session nas credenciais do DSH');
  const segredoTxt = /secret:\s*([A-Za-z0-9_-]+)/.exec(bloco[0]);
  if (!segredoTxt) throw new Error('o registo browser-session não tem segredo');
  const segredo = Buffer.from(segredoTxt[1], 'base64url');
  const corpo = b64url(Buffer.from(JSON.stringify({
    version: 1,
    authority: autoridade,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  }), 'utf8'));
  const assinatura = b64url(createHmac('sha256', segredo).update(corpo).digest());
  const nome = `dsh-auth-${b64url(createHash('sha256').update(autoridade).digest())}`;
  return `${nome}=v1.${corpo}.${assinatura}`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const cookieTemp = join(PASTA, '.cookie');
let cookieDeTemp = false;
if (COOKIE_FILE) {
  const [name, value] = readFileSync(COOKIE_FILE, 'utf8').trim().split('=');
  await ctx.addCookies([{ name, value, domain: new URL(DSH).hostname, path: '/' }]);
} else if (!new URL(DSH).search.includes('token=')) {
  writeFileSync(cookieTemp, cunharCookie(DSH), { mode: 0o600 });
  chmodSync(cookieTemp, 0o600);
  cookieDeTemp = true;
  const [name, value] = readFileSync(cookieTemp, 'utf8').trim().split('=');
  await ctx.addCookies([{ name, value, domain: new URL(DSH).hostname, path: '/' }]);
}
const page = await ctx.newPage();

try {
  /* ── arranque + abertura do Modo jogo ─────────────────────────────── */
  await page.goto(DSH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__wgDiag === 'string' && window.__wgDiag.indexOf('factory:fim') >= 0, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  await verificacao('botão "Modo jogo" abre o painel', async () => {
    // O botão é um TOGGLE: garante-se o estado ABERTO pelo resultado.
    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      const lugares = await page.evaluate(() => document.querySelectorAll('.wg-svg .seat').length);
      if (lugares > 0) return `já aberto (${lugares} lugares)`;
      await page.click('button[aria-label="Modo jogo"]');
      try {
        await page.waitForFunction(() => document.querySelectorAll('.wg-svg .seat').length > 0, null, { timeout: 12000 });
        return 'aberto';
      } catch { /* toggle: tenta de novo */ }
    }
    throw new Error('o painel não abriu (3 tentativas)');
  });

  // A sala assenta primeiro (catálogo de sessões): é dela que sai a sessão de
  // referência das skills. Sem sessões nenhumas, segue-se na mesma.
  await page.waitForFunction(
    () => document.querySelectorAll('.wg-svg .seat[data-session-id]').length > 0,
    null, { timeout: 10000 },
  ).catch(() => {});

  await verificacao('a cadeira vazia traz a ação "adicionar-contacto"', async () => {
    const n = await page.evaluate(() => document.querySelectorAll('.wg-svg .seat.slot-free[data-action="adicionar-contacto"]').length);
    if (n === 0) throw new Error('sem cadeiras vazias recrutáveis na sala');
    return `${n} cadeira(s) vazia(s) recrutáveis`;
  });

  await verificacao('clicar na cadeira vazia abre o celular no "Adicionar contacto"', async () => {
    await page.evaluate(() => document.querySelector('.wg-svg .seat.slot-free[data-action="adicionar-contacto"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
    ));
    await page.waitForFunction(() => !!document.querySelector('.wg-telefone[data-vista="adicionar-contacto"]'), null, { timeout: 8000 });
    return 'tela aberta';
  });

  await verificacao('o formulário tem nome, boneco, prompt, skills, modelo e o botão', async () => {
    const f = await page.evaluate(() => ({
      nome: !!document.querySelector('.wg-tel-contacto-nome'),
      boneco: !!document.querySelector('.wg-tel-contacto-boneco'),
      prompt: !!document.querySelector('.wg-tel-contacto-prompt'),
      trocar: !!document.querySelector('.wg-tel-contacto-trocar'),
      modelo: !!document.querySelector('.wg-tel-contacto-modelo'),
      botao: (document.querySelector('.wg-tel-config-guardar') || {}).textContent,
      vista: (document.querySelector('.wg-telefone') || {}).getAttribute
        ? document.querySelector('.wg-telefone').getAttribute('data-vista') : null,
    }));
    assert.equal(f.vista, 'adicionar-contacto');
    for (const k of ['nome', 'boneco', 'prompt', 'trocar', 'modelo']) assert.ok(f[k], `falta ${k}`);
    assert.equal(f.botao, 'Adicionar contacto');
    return 'todos os campos';
  });

  await verificacao('o preview do boneco é do banco de avatares do jogo', async () => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('.wg-tel-contacto-boneco');
      const html = el ? el.innerHTML : '';
      const m = /<use href="#(wgav-[a-z]+-idle)"/.exec(html);
      return m ? { id: m[1], noSprite: !!document.getElementById(m[1]) } : { id: null, noSprite: false, html: html.slice(0, 80) };
    });
    assert.ok(r.id, `sem <use> do banco de avatares: ${r.html || ''}`);
    assert.ok(r.noSprite, `o símbolo ${r.id} não está no sprite do painel (o boneco sairia em branco)`);
    return `${r.id} desenhado`;
  });

  // O catálogo vem do DSH por promessa: espera-se que assente antes de o
  // avaliar (a carregar NÃO é o mesmo que indisponível).
  await verificacao('o catálogo do DSH assenta na tela', async () => {
    const r = await page.waitForFunction(
      () => (document.querySelector('.wg-tel-contacto-a-carregar') ? null : (document.querySelector('.wg-tel-contacto-nota') || {}).textContent || 'assente'),
      null, { timeout: 15000 },
    ).catch(() => null);
    assert.ok(r, 'o catálogo nunca assentou (a carregar para sempre)');
    return String(r.jsonValue ? await r.jsonValue() : r);
  });

  await verificacao('o modelo vem do catálogo REAL do DSH', async () => {
    const opts = await page.evaluate(() => [...document.querySelectorAll('.wg-tel-contacto-modelo option')].map((o) => `${o.value} (${o.textContent})`));
    if (!opts.length) throw new Error('sem modelos no catálogo');
    return `${opts.length} modelo(s): ${opts.slice(0, 3).join(' · ')}${opts.length > 3 ? ' …' : ''}`;
  });

  await verificacao('as skills do projeto aparecem por checkbox', async () => {
    const d = await page.evaluate(() => ({
      skills: [...document.querySelectorAll('.wg-tel-contacto-skill-nome')].map((n) => n.textContent),
      vazio: !!document.querySelector('.wg-tel-contacto-vazio'),
      sessoesNaSala: document.querySelectorAll('.wg-svg .seat[data-session-id]').length,
      nota: (document.querySelector('.wg-tel-contacto-nota') || {}).textContent || '',
    }));
    // Com sessões na sala há SEMPRE catálogo (o fallback usa uma delas quando
    // o lugar clicado é de uma mesa vazia). Sem sessões nenhuma, a lista pode
    // vir vazia — mas a nota explica-o.
    if (d.sessoesNaSala > 0) {
      assert.ok(d.skills.length > 0, `sala com ${d.sessoesNaSala} sessões e nenhuma skill — o fallback não funcionou`);
    } else {
      assert.ok(d.vazio && d.nota, 'sem sessões na sala: a lista vazia tem de vir com nota a explicar');
    }
    return `${d.skills.length} skill(s)${d.vazio ? ' (sem skills neste lugar)' : ''}: ${d.skills.slice(0, 3).join(' · ')}${d.skills.length > 3 ? ' …' : ''}${d.nota ? ` | nota: ${d.nota}` : ''}`;
  });

  await captura(page, '01-formulario');

  await verificacao('o nome escolhido mostra o boneco dele e "Trocar" muda-o', async () => {
    const boneco = () => page.evaluate(() => document.querySelector('.wg-tel-contacto-boneco').innerHTML);
    const idDo = (html) => (/#(wgav-[a-z]+-idle)/.exec(html) || [])[1] || null;
    const antes = idDo(await boneco());
    assert.ok(antes, 'sem boneco no preview');
    // O boneco deriva do nome por hash: nomes diferentes podem calhar no mesmo.
    // Espera-se que ALGUM destes mude o preview (é isso que se prova aqui).
    let atual = antes;
    let usado = null;
    for (const nome of ['Rui', 'Maya', 'Lia', 'Tom', 'Bia', 'Zorblatt']) {
      await page.fill('.wg-tel-contacto-nome', nome);
      await page.waitForTimeout(120);
      atual = idDo(await boneco());
      usado = nome;
      if (atual !== antes) break;
    }
    assert.notEqual(atual, antes, `o preview não acompanhou nenhum nome (ficou ${antes})`);
    assert.equal(await page.evaluate(() => document.querySelector('.wg-tel-contacto-nome').value), usado, 'o campo não guardou o nome');
    await page.click('.wg-tel-contacto-trocar');
    await page.waitForTimeout(120);
    const trocado = idDo(await boneco());
    assert.notEqual(trocado, atual, '"Trocar boneco" não mudou o boneco');
    await captura(page, '02-nome-e-boneco');
    return `${usado} → ${antes} ⇒ ${atual} ⇒ ${trocado}`;
  });

  await verificacao('a skill escolhida entra no prompt final', async () => {
    await page.fill('.wg-tel-contacto-prompt', 'acompanha os PRs e resume o que mudou');
    const tem = await page.evaluate(() => document.querySelectorAll('.wg-tel-contacto-skill input[type="checkbox"]').length);
    if (tem === 0) return 'sem skills neste lugar — nada para marcar';
    await page.evaluate(() => document.querySelector('.wg-tel-contacto-skill input[type="checkbox"]').click());
    await page.waitForTimeout(120);
    const final = await page.evaluate(() => document.querySelector('.wg-tel-contacto-final').textContent);
    assert.match(final, /Skills: \/[a-z0-9-]+/, `o prompt final não levou a skill: ${final}`);
    assert.match(final, /acompanha os PRs/);
    await captura(page, '03-prompt-final');
    return final.replace(/\n/g, ' ⏎ ');
  });

  // NUNCA se confirma o formulário: nenhuma sessão é criada por este E2E.
  await verificacao('o botão "Adicionar contacto" está pronto (sem o confirmar)', async () => {
    const pronto = await page.evaluate(() => {
      const b = document.querySelector('.wg-tel-config-guardar');
      return b ? !b.disabled : false;
    });
    assert.ok(pronto, 'o botão está desativado com o nome preenchido');
    return 'pronto a criar (não confirmado de propósito)';
  });
} finally {
  // Deixa a sala como encontrou: fecha o Modo jogo (estado por browser) e o
  // cookie cunhado de propósito nunca fica para trás.
  try {
    await page.evaluate(() => {
      const b = document.querySelector('button[aria-label="Modo jogo"]');
      if (b && document.querySelector('.wg-painel')) b.click();
    });
  } catch { /* melhor esforço */ }
  await browser.close();
  if (cookieDeTemp) { try { rmSync(cookieTemp); } catch { /* já removido */ } }
  writeFileSync(join(PASTA, 'relatorio.json'), JSON.stringify({
    dsh: DSH.replace(/token=[^&]+/, 'token=…'), resultados,
  }, null, 2));
}

console.log(falhas === 0 ? `\nTUDO VERDE (${resultados.length} verificações) — relatório em ${PASTA}` : `\n${falhas} verificação(ões) reprovada(s) — relatório em ${PASTA}`);
process.exit(falhas === 0 ? 0 : 1);
