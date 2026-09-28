#!/usr/bin/env node
/*
 * scripts/regressivo-playwright.mjs — regressivo E2E do dsh-work-game em Playwright.
 *
 * Corre as viagens centrais do produto em DOIS motores (chromium e webkit — o
 * webkit apanha as armadilhas do Safari: animações CSS criadas só no cálculo de
 * estilo seguinte, transform-box, backdrop-filter) e em DUAS superfícies:
 *
 *   demo      a página estática (index.html) servida em http:// local;
 *   dsh       o Modo jogo num DSH web real (precisa de --dsh "<url-com-token>").
 *
 * Uso:
 *   node scripts/regressivo-playwright.mjs --dsh "http://127.0.0.1:3080/?token=…"
 *   node scripts/regressivo-playwright.mjs --so-demo
 *   node scripts/regressivo-playwright.mjs --dsh "…" --so-dsh --pasta logs/regressivo
 *
 * Dependência opcional (o npm test continua sem dependências):
 *   npm i --no-save playwright && npx playwright install chromium webkit
 * Sem o pacote, sai com código 3 e a receita acima.
 *
 * Verificações — demo: arranque com a cena-semente, zero requisições externas,
 * seleção de pessoa com barra lateral e separadores, expressões, mobile
 * 390×844 sem overflow. dsh: ativação do bundle, workspaces → mesas, bonecos
 * com <symbol> resolvido e caixa real, "zzz" de quem dorme, filtros (com
 * persistência), barra lateral com os três separadores, celular com bolhas
 * reais e libertação da conversa (0 referências), e zero erros de consola.
 *
 * Grava capturas, relatório.json e relatorio.md na pasta de saída.
 * Exit codes: 0 tudo verde · 1 alguma verificação reprovou · 2 uso inválido ·
 *             3 dependência em falta.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { startServer } from '../tests/helpers/server.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valor = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const DSH = valor('--dsh');
const SO_DEMO = args.includes('--so-demo');
const SO_DSH = args.includes('--so-dsh');
const OUT = resolve(valor('--pasta') || join(ROOT, 'logs', `regressivo-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}`));

if (args.includes('--help') || args.includes('-h')) {
  console.log('uso: node scripts/regressivo-playwright.mjs [--dsh "<url-com-token>"] [--so-demo | --so-dsh] [--pasta <saída>]');
  process.exit(0);
}
if (SO_DEMO && SO_DSH) {
  console.error('Erro: --so-demo e --so-dsh excluem-se — Solução: escolhe um, ou omite ambos para correr os dois.');
  process.exit(2);
}
if (!SO_DEMO && !DSH && !SO_DSH) {
  // Sem URL do DSH corre-se só a demo (o modo mais comum em CI local).
} else if (SO_DSH && !DSH) {
  console.error('Erro: --so-dsh precisa de --dsh "<url-com-token>" — Solução: passa a URL do DSH web (o log de arranque do dsh web mostra-a).');
  process.exit(2);
}

let pw;
try {
  pw = await import('playwright');
} catch {
  console.error('Erro: o pacote "playwright" não está instalado — Solução: npm i --no-save playwright && npx playwright install chromium webkit');
  process.exit(3);
}

mkdirSync(OUT, { recursive: true });
const resultados = []; // { motor, grupo, nome, ok, detalhe }
let capturas = 0;

const registar = (motor, grupo, nome, ok, detalhe = '') => {
  resultados.push({ motor, grupo, nome, ok, detalhe });
  console.log(`${ok ? '✔' : '✖'} [${motor}] ${grupo} · ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

/** Executa uma verificação: nunca rebenta a corrida, regista a reprovação. */
async function verificacao(motor, grupo, nome, fn, contexto) {
  if (contexto && contexto.saltadas) {
    resultados.push({ motor, grupo, nome, ok: false, detalhe: 'saltada (falhou um passo anterior)' });
    console.log(`○ [${motor}] ${grupo} · ${nome} — saltada (falhou um passo anterior)`);
    return null;
  }
  try {
    return await fn();
  } catch (erro) {
    registar(motor, grupo, nome, false, String(erro && erro.message || erro).split('\n')[0].slice(0, 220));
    if (contexto) contexto.saltadas = true;
    return null;
  }
}

async function captura(page, motor, nome) {
  capturas += 1;
  await page.screenshot({ path: join(OUT, `${motor}-${nome}.png`), fullPage: false });
}

async function novoPage(browser, { largura = 1440, altura = 900 } = {}) {
  const contexto = await browser.newContext({ viewport: { width: largura, height: altura } });
  const page = await contexto.newPage();
  const erros = [];
  const pedidos = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push(String((e && e.message) || e)));
  page.on('request', (r) => pedidos.push(r.url()));
  return {
    page,
    erros,
    pedidos,
    externos: (origem) => pedidos.filter((u) => /^https?:/.test(u) && !u.startsWith(origem)),
    fechar: () => contexto.close(),
  };
}

/* ────────────────────────────── demo ────────────────────────────── */

async function corridaDemo(motor, browser) {
  const ctx = { saltadas: false };
  const server = await startServer(ROOT);
  const { page, erros, externos, fechar } = await novoPage(browser);
  try {
    await page.goto(server.url, { waitUntil: 'load' });

    await verificacao(motor, 'demo', 'arranque da demo (cena-semente)', async () => {
      await page.waitForFunction(() => document.querySelectorAll('g.seat[role="button"]').length >= 8, null, { timeout: 15000 });
      const r = await page.evaluate(() => ({
        lugares: document.querySelectorAll('g.seat[role="button"]').length,
        mesas: [...document.querySelectorAll('.desk-label')].map((d) => d.textContent.trim()),
        estatisticas: (document.querySelector('#stats-people') || {}).textContent?.trim() || '',
      }));
      assert(r.lugares >= 8, `só ${r.lugares} lugares na cena`);
      await captura(page, motor, 'demo-01-cena');
      registar(motor, 'demo', 'arranque da demo (cena-semente)', true, `${r.lugares} lugares · ${r.mesas.length} mesas · ${r.estatisticas}`);
    }, ctx);

    await verificacao(motor, 'demo', 'zero requisições externas', async () => {
      const fora = externos(server.url);
      assert.deepEqual(fora, [], `pedidos externos: ${fora.slice(0, 3).join(', ')}`);
      registar(motor, 'demo', 'zero requisições externas', true, 'tudo do próprio origin');
    }, ctx);

    await verificacao(motor, 'demo', 'selecionar pessoa abre o inspetor com separadores', async () => {
      // O clique vai para a FICHA da pessoa: o centro do grupo <g> cai na mesa
      // (rect.paper-active) e não seleciona — rato real exige o alvo certo.
      await page.click('g.seat[role="button"][data-agent="p-rui"] .seat-card');
      await page.waitForFunction(() => !document.querySelector('#inspector').hidden, null, { timeout: 5000 });
      const r = await page.evaluate(() => ({
        abas: [...document.querySelectorAll('.inspector-tabs button')].map((b) => b.textContent.trim()),
        nome: (document.querySelector('.agent-heading h2') || {}).textContent?.trim() || '',
        selecionado: !!document.querySelector('g.seat.selected'),
      }));
      assert(r.abas.length >= 3, `só ${r.abas.length} separadores`);
      assert(r.selecionado, 'a pessoa não ficou selecionada');
      await page.click('[data-action="tab"][data-tab="context"]');
      await captura(page, motor, 'demo-02-inspetor');
      registar(motor, 'demo', 'selecionar pessoa abre o inspetor com separadores', true, `${r.nome} · ${r.abas.join(' | ')}`);
    }, ctx);

    await verificacao(motor, 'demo', 'separadores trocam de conteúdo', async () => {
      const medir = () => page.evaluate(() => document.querySelector('.inspector-content')?.textContent?.trim().length || 0);
      await page.click('[data-action="tab"][data-tab="context"]');
      await page.waitForTimeout(150);
      const antes = await medir();
      await page.click('[data-action="tab"][data-tab="computer"]');
      await page.waitForTimeout(150);
      const depois = await medir();
      assert(antes > 0, 'separador Contexto sem conteúdo');
      assert(depois > 0, 'separador Computador sem conteúdo');
      registar(motor, 'demo', 'separadores trocam de conteúdo', true, `Contexto ${antes} car. · Computador ${depois} car.`);
    }, ctx);

    await verificacao(motor, 'demo', 'mobile 390×844 sem overflow horizontal', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        janela: window.innerWidth,
      }));
      assert(r.scroll <= r.janela + 1, `overflow: scrollWidth ${r.scroll} > ${r.janela}`);
      await captura(page, motor, 'demo-03-mobile');
      await page.setViewportSize({ width: 1440, height: 900 });
      registar(motor, 'demo', 'mobile 390×844 sem overflow horizontal', true, `scrollWidth ${r.scroll} ≤ ${r.janela}`);
    }, ctx);

    await verificacao(motor, 'demo', 'zero erros de consola', async () => {
      assert.deepEqual(erros, [], `erros: ${erros.slice(0, 2).join(' | ')}`);
      registar(motor, 'demo', 'zero erros de consola', true);
    }, ctx);
  } finally {
    await fechar();
    await server.close();
  }
}

/* ─────────────────────────── Modo jogo (DSH) ─────────────────────────── */

async function corridaDsh(motor, browser, base) {
  const ctx = { saltadas: false };
  const origem = new URL(base).origin;
  const { page, erros, externos, fechar } = await novoPage(browser);
  try {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__DSH_BOOT__, null, { timeout: 30000 });

    await verificacao(motor, 'dsh', 'bundle do plugin ativado', async () => {
      await page.waitForFunction(
        () => typeof window.__wgDiag === 'string' && window.__wgDiag.indexOf('factory:fim') >= 0,
        null,
        { timeout: 30000 },
      );
      const diag = await page.evaluate(() => window.__wgDiag);
      assert(/factory:react-ok/.test(diag), `React do bundle não carregou: ${diag}`);
      registar(motor, 'dsh', 'bundle do plugin ativado', true, diag.split('|').slice(0, 2).join(' · '));
    }, ctx);

    await verificacao(motor, 'dsh', 'botão "Modo jogo" abre o painel', async () => {
      await page.waitForTimeout(1500); // os slots do runner assentam depois do factory
      await page.click('button[aria-label="Modo jogo"]');
      await page.waitForSelector('.wg-painel', { timeout: 15000 });
      const diag = await page.evaluate(() => window.__wgDiag);
      assert(/abrir:chamado/.test(diag), `clique não chegou ao handler: ${diag}`);
      await captura(page, motor, 'dsh-01-painel');
      registar(motor, 'dsh', 'botão "Modo jogo" abre o painel', true);
    }, ctx);

    await verificacao(motor, 'dsh', 'workspaces do DSH viram mesas', async () => {
      let info = null;
      for (let tentativa = 0; tentativa < 20; tentativa += 1) {
        await page.waitForTimeout(1000);
        info = await page.evaluate(() => ({
          pessoas: document.querySelectorAll('.wg-svg .character').length,
          mesas: [...document.querySelectorAll('.wg-svg .desk-module')].map((m) => (m.querySelector('.desk-label') || {}).textContent?.trim() || ''),
          snap: (() => { try { return JSON.parse(window.__wgSnap); } catch { return null; } })(),
        }));
        if (info.pessoas > 0 && info.snap && info.snap.ws != null) break;
      }
      assert(info && info.mesas.length > 0, 'nenhuma mesa na sala');
      assert(info.snap && info.snap.ws != null, `catálogo não assentou: ${JSON.stringify(info && info.snap)}`);
      registar(motor, 'dsh', 'workspaces do DSH viram mesas', true, `${info.mesas.length} mesa(s): ${info.mesas.join(' | ')} · ${info.pessoas} pessoas`);
    }, ctx);

    await verificacao(motor, 'dsh', 'bonecos desenhados (<symbol> resolvido, caixa real)', async () => {
      const r = await page.evaluate(() => {
        const usos = [...document.querySelectorAll('.wg-svg .character use')];
        const ids = new Set([...document.querySelectorAll('svg symbol')].map((s) => s.id));
        const partidas = usos.filter((u) => {
          const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
          return href.startsWith('#') && !ids.has(href.slice(1));
        });
        const invisiveis = usos.filter((u) => {
          const b = u.getBoundingClientRect();
          return b.width < 4 || b.height < 4;
        });
        return { total: usos.length, partidas: partidas.length, invisiveis: invisiveis.length };
      });
      assert(r.total > 0, 'nenhum boneco na sala');
      assert.equal(r.partidas, 0, `${r.partidas} referências #… sem destino`);
      assert.equal(r.invisiveis, 0, `${r.invisiveis} bonecos sem caixa real`);
      registar(motor, 'dsh', 'bonecos desenhados (<symbol> resolvido, caixa real)', true, `${r.total} usos, 0 partidos, 0 invisíveis`);
    }, ctx);

    await verificacao(motor, 'dsh', '"zzz" de quem dorme junto à cabeça', async () => {
      const r = await page.evaluate(() => {
        const g = document.querySelector('.wg-svg .wg-zzz');
        if (!g) return { n: 0 };
        const letras = g.querySelectorAll('.wg-z').length;
        const caixaZzz = g.getBoundingClientRect();
        const boneco = g.closest('.seat')?.querySelector('.character')?.getBoundingClientRect();
        return {
          n: document.querySelectorAll('.wg-svg .wg-zzz').length,
          letras,
          junto: !!boneco && Math.abs((caixaZzz.left + caixaZzz.width / 2) - (boneco.left + boneco.width / 2)) < boneco.width,
        };
      });
      assert(r.n > 0, 'ninguém a dormir (sem .wg-zzz) — ou a sala está toda a trabalhar');
      assert.equal(r.letras, 3, `zzz com ${r.letras} letras`);
      assert(r.junto, 'o zzz não está centrado sobre o boneco');
      registar(motor, 'dsh', '"zzz" de quem dorme junto à cabeça', true, `${r.n} a dormir · ${r.letras} letras`);
    }, ctx);

    await verificacao(motor, 'dsh', 'menu de filtros com 4 interruptores', async () => {
      await page.click('.wg-filtros-botao');
      await page.waitForSelector('#wg-filtros-menu', { timeout: 5000 });
      const r = await page.evaluate(() => ({
        interruptores: [...document.querySelectorAll('#wg-filtros-menu [role="switch"]')].map((s) => s.getAttribute('aria-checked') ?? s.getAttribute('aria-pressed') ?? ''),
        etiquetas: [...document.querySelectorAll('#wg-filtros-menu .wg-filtro-texto strong')].map((s) => s.textContent.trim().slice(0, 30)),
      }));
      assert.equal(r.interruptores.length, 4, `só ${r.interruptores.length} interruptores`);
      await captura(page, motor, 'dsh-02-filtros');
      registar(motor, 'dsh', 'menu de filtros com 4 interruptores', true, r.etiquetas.join(' · '));
    }, ctx);

    await verificacao(motor, 'dsh', '"Mostrar arquivadas" mexe na sala e persiste', async () => {
      const antes = await page.evaluate(() => document.querySelectorAll('.wg-svg .character').length);
      const interruptor = page.locator('#wg-filtros-menu [data-filtro="mostrarArquivadas"]');
      await interruptor.click();
      await page.waitForTimeout(600);
      const depois = await page.evaluate(() => ({
        pessoas: document.querySelectorAll('.wg-svg .character').length,
        arquivadas: [...document.querySelectorAll('.wg-svg .seat-card-status')].filter((t) => /arquivada/i.test(t.textContent)).length,
        ligado: document.querySelector('#wg-filtros-menu [data-filtro="mostrarArquivadas"]')?.getAttribute('aria-checked'),
        guardado: window.localStorage.getItem('dsh-work-game:filtros'),
      }));
      assert.equal(depois.ligado, 'true', 'o interruptor não ligou');
      assert(depois.guardado, 'os filtros não ficaram em localStorage');
      // Persistência real: recarregar a página e reabrir o painel.
      await page.keyboard.press('Escape');
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.__wgDiag === 'string' && window.__wgDiag.indexOf('factory:fim') >= 0, null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.click('button[aria-label="Modo jogo"]');
      await page.waitForSelector('.wg-painel', { timeout: 15000 });
      await page.click('.wg-filtros-botao');
      await page.waitForSelector('#wg-filtros-menu', { timeout: 5000 });
      const estado = await page.evaluate(() => document.querySelector('#wg-filtros-menu [data-filtro="mostrarArquivadas"]')?.getAttribute('aria-checked') ?? '');
      assert.equal(estado, 'true', `o interruptor não persistiu (aria-checked=${estado})`);
      // repor o padrão para as verificações seguintes
      await page.locator('#wg-filtros-menu [data-filtro="mostrarArquivadas"]').click();
      await page.keyboard.press('Escape');
      const salaMudou = depois.pessoas !== antes || depois.arquivadas > 0;
      registar(motor, 'dsh', '"Mostrar arquivadas" mexe na sala e persiste', true,
        `${antes} → ${depois.pessoas} pessoas${salaMudou ? '' : ' (sem arquivadas nesta sessão)'} · persistiu depois de recarregar`);
    }, ctx);

    await verificacao(motor, 'dsh', 'barra lateral com os três separadores', async () => {
      await page.waitForTimeout(800);
      await page.click('.wg-svg .seat[role="button"][data-session-id] .seat-card');
      await page.waitForSelector('.wg-sidebar', { timeout: 8000 });
      await page.waitForSelector('.wg-telefone', { timeout: 8000 });
      const r = await page.evaluate(() => {
        const sb = document.querySelector('.wg-sidebar');
        return {
          abas: [...sb.querySelectorAll('[role="tab"]')].map((b) => b.getAttribute('data-aba')),
          nome: sb.querySelector('.wg-agent-heading h2')?.textContent?.trim() || '',
          largura: Math.round(sb.getBoundingClientRect().width),
        };
      });
      assert(r.abas.length >= 3, `só ${r.abas.length} separadores`);
      for (const aba of r.abas) {
        await page.click(`.wg-sidebar [role="tab"][data-aba="${aba}"]`);
        await page.waitForTimeout(250);
        const vazio = await page.evaluate(() => {
          const painel = document.querySelector('.wg-sidebar [role="tabpanel"]');
          return !painel || painel.textContent.trim().length === 0;
        });
        assert(!vazio, `separador ${aba} sem conteúdo`);
      }
      await captura(page, motor, 'dsh-03-sidebar');
      registar(motor, 'dsh', 'barra lateral com os três separadores', true, `${r.nome} · ${r.abas.join(' | ')} · ${r.largura}px`);
    }, ctx);

    await verificacao(motor, 'dsh', 'celular sem foco automático na caixa', async () => {
      const r = await page.evaluate(() => {
        const c = document.querySelector('.wg-tel-campo textarea');
        return c && { foco: document.activeElement === c, placeholder: c.placeholder };
      });
      assert(r, 'celular sem caixa de texto');
      assert(!r.foco, 'abrir o celular não pode roubar o foco para a caixa');
      assert.equal(r.placeholder, 'iMessage', `placeholder "${r.placeholder}"`);
      registar(motor, 'dsh', 'celular sem foco automático na caixa', true, `placeholder "${r.placeholder}"`);
    }, ctx);

    await verificacao(motor, 'dsh', 'celular com a conversa real (bolhas iMessage)', async () => {
      await page.waitForFunction(() => document.querySelectorAll('.wg-telefone .wg-tel-msg[data-lado]').length > 0, null, { timeout: 15000 });
      const r = await page.evaluate(() => {
        const tel = document.querySelector('.wg-telefone');
        const msgs = [...tel.querySelectorAll('.wg-tel-msg[data-lado]')];
        const cores = (lado) => {
          const m = msgs.find((x) => x.classList.contains(lado));
          return m ? getComputedStyle(m.querySelector('.wg-tel-bolha')).backgroundColor : null;
        };
        return {
          mensagens: msgs.length,
          minhas: msgs.filter((m) => m.classList.contains('wg-tel-eu')).length,
          campo: !!tel.querySelector('.wg-tel-campo textarea'),
          caudas: tel.querySelectorAll('.wg-tel-cauda').length,
          corMinha: cores('wg-tel-eu'),
          corDele: cores('wg-tel-ele'),
        };
      });
      assert(r.mensagens > 0, 'celular sem bolhas');
      assert(r.campo, 'celular sem caixa de mensagem');
      assert(r.caudas > 0, 'nenhuma cauda de iMessage nos grupos');
      assert(r.corMinha && r.corDele && r.corMinha !== r.corDele, `cores iguais/ausentes: ${r.corMinha} vs ${r.corDele}`);
      await captura(page, motor, 'dsh-04-celular');
      registar(motor, 'dsh', 'celular com a conversa real (bolhas iMessage)', true, `${r.mensagens} bolhas (${r.minhas} minhas) · ${r.caudas} caudas · ${r.corMinha} / ${r.corDele}`);
    }, ctx);

    await verificacao(motor, 'dsh', 'Esc fecha celular e barra, sem fugas de sessão', async () => {
      // O Esc só age com o foco no painel: pô-lo num separador da barra (neutro).
      await page.click('.wg-sidebar [role="tab"]');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.wg-telefone'), null, { timeout: 5000 });
      const soBarra = await page.evaluate(() => !!document.querySelector('.wg-sidebar'));
      assert(soBarra, 'o 1.º Esc devia fechar só o celular');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.wg-sidebar'), null, { timeout: 5000 });
      await page.waitForFunction(() => window.__wgTelefoneRefs === 0, null, { timeout: 5000 });
      const refs = await page.evaluate(() => window.__wgTelefoneRefs);
      assert.equal(refs, 0, `${refs} referências de sessão retidas`);
      registar(motor, 'dsh', 'Esc fecha celular e barra, sem fugas de sessão', true, '0 referências retidas');
    }, ctx);

    await verificacao(motor, 'dsh', 'zero requisições externas e zero erros de consola', async () => {
      const fora = externos(origem).filter((u) => !u.startsWith(origem));
      assert.deepEqual(fora, [], `pedidos externos: ${fora.slice(0, 3).join(', ')}`);
      assert.deepEqual(erros, [], `erros de consola: ${erros.slice(0, 2).join(' | ')}`);
      registar(motor, 'dsh', 'zero requisições externas e zero erros de consola', true);
    }, ctx);
  } finally {
    await fechar();
  }
}

/* ────────────────────────────── corrida ────────────────────────────── */

const motores = [];
for (const nome of ['chromium', 'webkit']) {
  if (!pw[nome]) continue;
  try {
    const browser = await pw[nome].launch({ headless: true });
    motores.push({ nome, browser });
  } catch (erro) {
    console.error(`○ motor ${nome} indisponível (${String(erro && erro.message || erro).split('\n')[0].slice(0, 120)}) — instala com: npx playwright install ${nome}`);
    resultados.push({ motor: nome, grupo: 'motor', nome: 'lançar browser', ok: false, detalhe: 'indisponível (npx playwright install ' + nome + ')' });
  }
}
if (motores.length === 0) {
  console.error('Erro: nenhum motor do Playwright disponível — Solução: npx playwright install chromium webkit');
  process.exit(3);
}

const arranque = Date.now();
for (const { nome, browser } of motores) {
  console.log(`\n── motor ${nome} ──`);
  if (!SO_DSH) await corridaDemo(nome, browser);
  if (!SO_DEMO) {
    if (DSH) await corridaDsh(nome, browser, DSH);
    else console.log(`○ [${nome}] dsh — saltado (sem --dsh "<url>")`);
  }
  await browser.close();
}

/* Relatório */
const verdes = resultados.filter((r) => r.ok).length;
const vermelhos = resultados.filter((r) => !r.ok);
const relatorio = {
  quando: new Date().toISOString(),
  duracaoMs: Date.now() - arranque,
  motores: motores.map((m) => m.nome),
  superficies: [...new Set(resultados.map((r) => r.grupo))],
  total: resultados.length,
  verdes,
  vermelhos: vermelhos.length,
  resultados,
};
writeFileSync(join(OUT, 'relatorio.json'), `${JSON.stringify(relatorio, null, 2)}\n`);
writeFileSync(
  join(OUT, 'relatorio.md'),
  `# Regressivo Playwright — ${relatorio.quando}\n\n`
  + `Motores: ${relatorio.motores.join(', ')} · ${verdes}/${resultados.length} verdes · ${Math.round(relatorio.duracaoMs / 1000)} s · capturas: ${capturas}\n\n`
  + '| Motor | Superfície | Verificação | Estado | Detalhe |\n|---|---|---|---|---|\n'
  + resultados.map((r) => `| ${r.motor} | ${r.grupo} | ${r.nome} | ${r.ok ? '✅' : '❌'} | ${String(r.detalhe).replace(/\|/g, '\\|')} |`).join('\n')
  + '\n',
);
console.log(`\n${vermelhos.length === 0 ? 'REGRESSIVO OK' : `REGRESSIVO COM ${vermelhos.length} REPROVAÇÃO(ÕES)`} — ${verdes}/${resultados.length} verdes · evidências em ${OUT}`);
process.exit(vermelhos.length === 0 ? 0 : 1);
