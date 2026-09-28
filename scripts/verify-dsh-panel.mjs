#!/usr/bin/env node
/*
 * scripts/verify-dsh-panel.mjs — valida o painel do escritório NUM DSH web real.
 *
 * Uso:  node scripts/verify-dsh-panel.mjs <url-base> [pasta-de-saída] [--acoes] [--recrutar]
 *                                          [--conversa] [--enviar "<regex do título>"]
 *       (CHROME_PATH escolhe o browser: Chrome, Chromium ou Brave)
 *       --acoes    rato real: clicar seleciona, arrastar não clica, "Abrir no DSH" navega
 *       --recrutar lugar livre → conversa nova no workspace (pode criar uma em branco)
 *       --conversa o CELULAR: abre a conversa de cada pessoa, exige bolhas reais
 *                  (cores do iMessage, cauda, fim da conversa à vista), fecha com
 *                  "‹ Escritório" e Esc, troca de pessoa — e nenhuma referência
 *                  da sessão fica retida (window.__wgTelefoneRefs volta a 0)
 *       --enviar   escreve no celular da conversa cujo título casa com a regex
 *                  (Input.insertText + Enter reais do CDP), espera a bolha azul da
 *                  mensagem ("Entregue") E a resposta do agente — GASTA tokens
 *                  (mensagem: VERIFY_MENSAGEM ou a frase curta de teste)
 *
 * Abre a UI do DSH num browser headless, espera que o bundle do plugin ative
 * (window.__wgDiag), clica em "Modo jogo", abre o painel do escritório e verifica:
 *   - ativação do factory do plugin (diagnóstico legível);
 *   - o painel está ligado ao DSH (sem o banner "à espera do host");
 *   - os WORKSPACES do DSH viram mesas com o seu título (nada colapsa em "geral");
 *   - os bonecos desenham-se: cada <use> aponta para um <symbol> que existe, com
 *     caixa real no ecrã, e nenhuma referência #… fica sem destino;
 *   - clicar numa pessoa abre a BARRA LATERAL da demo ("UMA PESSOA, MUITAS
 *     IDEIAS"): nome, estado, avatar (<use> → <symbol>), separadores Contexto /
 *     Custo / Atividade com dados reais; Esc e o botão fecham-na; a sala
 *     encolhe para a largura que sobra;
 *   - clicar numa pessoa abre também o CELULAR com a conversa dela; o 1.º Esc
 *     fecha o celular e o 2.º a barra lateral;
 *   - o menu FILTROS abre, tem os 4 interruptores, mudar um mexe na sala e
 *     fica guardado em localStorage (e é reposto no fim); Esc fecha o menu;
 *   - zero erros de consola.
 * Grava capturas de evidência e sai com código != 0 se algo falhar.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { launchBrowser, sleep } from '../tests/helpers/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const posicionais = process.argv.slice(2).filter((a, i, todos) => !a.startsWith('--') && todos[i - 1] !== '--enviar');
const ACOES = process.argv.includes('--acoes');       // rato real + "Abrir conversa"
const RECRUTAR = process.argv.includes('--recrutar'); // + lugar livre (pode criar conversa em branco)
const CONVERSA = process.argv.includes('--conversa'); // celular: bolhas reais, fechar, trocar, sem fugas
const iEnviar = process.argv.indexOf('--enviar');
const ENVIAR = iEnviar >= 0 ? process.argv[iEnviar + 1] : null; // regex do título da conversa de teste
const MENSAGEM = process.env.VERIFY_MENSAGEM || 'Teste do celular do Modo jogo: responde só com a palavra ok.';
const base = posicionais[0];
if (!base) {
  console.error('uso: node scripts/verify-dsh-panel.mjs <url-base> [pasta-de-saída] [--acoes] [--recrutar] [--conversa] [--enviar "<regex do título>"]');
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

  // Sonda de geometria do "zzz" (o bug do WebKit: com fill-box a letra descia
  // sobre a cadeira do vizinho). Com a animação parada no 1.º e no último
  // quadro, a letra tem de SUBIR, à direita da cabeça e antes do vizinho.
  const zzz = await page.eval(`(() => {
    const g = document.querySelector('.wg-svg .wg-zzz');
    if (!g) return null;
    const z = g.querySelector('.wg-z');
    const boneco = g.closest('.seat').querySelector('.character').getBoundingClientRect();
    const m = /scale\\(([\\d.]+)\\)/.exec(document.querySelector('.wg-mundo').style.transform);
    const zoom = m ? Number(m[1]) : 1;
    const guardado = z.getAttribute('style');
    const em = (tr) => {
      z.style.animation = 'none'; z.style.opacity = '1'; z.style.transform = tr;
      const r = z.getBoundingClientRect();
      return { x: (r.x + r.width / 2 - boneco.x) / zoom, y: (r.y + r.height / 2 - boneco.y) / zoom };
    };
    const inicio = em('translate(0px,0px) scale(0.6)');
    const fim = em('translate(22px,-60px) scale(1.2)');
    z.setAttribute('style', guardado);
    return { inicio, fim, larguraBoneco: boneco.width / zoom, n: document.querySelectorAll('.wg-svg .wg-zzz').length };
  })()`);
  if (zzz) {
    assert.ok(zzz.fim.y < zzz.inicio.y - 40, `o "z" sobe (${zzz.inicio.y.toFixed(0)} → ${zzz.fim.y.toFixed(0)})`);
    assert.ok(zzz.fim.x > zzz.inicio.x, 'e afasta-se da cara');
    assert.ok(zzz.inicio.x > zzz.larguraBoneco / 2 && zzz.fim.x < zzz.larguraBoneco + 60, `à direita da cabeça, antes do vizinho (x ${zzz.inicio.x.toFixed(0)} → ${zzz.fim.x.toFixed(0)})`);
    assert.ok(zzz.inicio.y > 0 && zzz.inicio.y < 160, `à altura da cabeça (y ${zzz.inicio.y.toFixed(0)})`);
    ok('"zzz" de quem dorme sobe junto à cabeça', `${zzz.n} a dormir · início (${zzz.inicio.x.toFixed(0)}, ${zzz.inicio.y.toFixed(0)}) → fim (${zzz.fim.x.toFixed(0)}, ${zzz.fim.y.toFixed(0)}) no mundo`);
  }

  // Relógio da cena: com zzz/balanço à vista corre 5×/s, só sobre a lista dos
  // animados à vista, e acerta-os a MEIO do degrau (currentTime ≡ 100 mod 200).
  const lerRelogio = () => page.eval(`(() => {
    const r = window.__wgRelogio || null;
    const as = document.getAnimations().filter((a) => a.animationName === 'wg-zzz' || a.animationName === 'wg-balanco');
    return { r: r && { ...r }, animacoes: as.length, aMeio: as.every((a) => Math.abs((a.currentTime % 200) - 100) < 1e-6),
      fora: document.querySelectorAll('.wg-svg .desk-module.wg-fora').length, mesas: document.querySelectorAll('.wg-svg .desk-module').length };
  })()`);
  const rel0 = await lerRelogio();
  await sleep(1000);
  const rel1 = await lerRelogio();
  if (rel1.animacoes > 0) {
    const tiques = rel1.r.tiques - rel0.r.tiques;
    assert.ok(rel1.r.ativo && tiques >= 3 && tiques <= 7, `relógio a 5 Hz com algo animado à vista (${tiques} tiques/s, ${JSON.stringify(rel1.r)})`);
    assert.ok(rel1.aMeio, 'animações acertadas a meio do degrau');
    ok('relógio da cena', `${tiques} tiques/s · ${rel1.r.elementos} elemento(s) animado(s) à vista · ${rel1.fora}/${rel1.mesas} mesa(s) fora de vista paradas`);
  } else {
    assert.ok(!rel1.r || !rel1.r.ativo, 'sem nada animado, o relógio não corre');
    ok('relógio da cena', 'ninguém a dormir nem a trabalhar à vista: parado');
  }

  // Barra lateral: clicar numa pessoa abre a barra da demo com dados reais.
  const lerSidebar = () => page.eval(`(() => {
    const sb = document.querySelector('.wg-sidebar');
    if (!sb) return null;
    const t = (s) => { const el = sb.querySelector(s); return el ? el.textContent.trim() : null; };
    const usoAvatar = sb.querySelector('.wg-inspector-avatar use');
    const alvo = usoAvatar ? (usoAvatar.getAttribute('href') || '').slice(1) : null;
    const r = sb.getBoundingClientRect();
    return {
      id: sb.getAttribute('data-session-id'),
      topo: t('.wg-inspector-top > span'),
      nome: t('.wg-agent-heading h2'),
      local: t('.wg-agent-heading p'),
      estado: t('.wg-small-status'),
      titulo: t('.wg-conversa-card strong'),
      abas: [...sb.querySelectorAll('[role="tab"]')].map((b) => ({ id: b.getAttribute('data-aba'), rotulo: b.textContent.trim(), sel: b.getAttribute('aria-selected') })),
      painel: (sb.querySelector('[role="tabpanel"]') || {}).getAttribute ? sb.querySelector('[role="tabpanel"]').getAttribute('data-aba') : null,
      secoes: [...sb.querySelectorAll('.wg-section-heading h3')].map((h) => h.textContent.trim()),
      conteudo: (sb.querySelector('[role="tabpanel"]') || {}).textContent || '',
      avatar: alvo ? !!document.getElementById(alvo) : false,
      largura: Math.round(r.width),
      telaLargura: Math.round(document.querySelector('.wg-tela').getBoundingClientRect().width),
      botoes: [...sb.querySelectorAll('.wg-conversa-card button')].map((b) => b.textContent.trim()),
    };
  })()`);
  if (painel.pessoas > 0) {
    const telaAntes = await page.eval(`Math.round(document.querySelector('.wg-tela').getBoundingClientRect().width)`);
    await page.click('.wg-svg .seat[role="button"][data-session-id]');
    await page.waitFor('!!document.querySelector(".wg-sidebar")', 5000);
    await sleep(500);
    const sb = await lerSidebar();
    await page.screenshot(join(OUT, '02-sidebar-contexto.png'));
    assert.equal(sb.topo, 'UMA PESSOA, MUITAS IDEIAS', 'cabeçalho da barra lateral da demo');
    assert.ok(sb.nome, 'a barra lateral mostra o nome da pessoa');
    assert.ok(sb.local && / · /.test(sb.local), `workspace · mesa: ${sb.local}`);
    assert.ok(sb.estado, 'estado com ponto colorido');
    assert.ok(sb.avatar, 'o avatar é o <symbol> do boneco (referência resolvida)');
    assert.deepEqual(sb.abas.map((a) => a.rotulo), ['Contexto', 'Custo', 'Atividade']);
    assert.equal(sb.painel, 'contexto', 'abre no separador Contexto');
    assert.ok(sb.secoes.includes('Janela de contexto'), `secções: ${sb.secoes}`);
    assert.ok(sb.botoes.some((b) => /Conversa/.test(b)), `ações da conversa: ${sb.botoes}`);
    assert.ok(sb.largura >= 300 && sb.largura <= 380, `largura da demo (~345px): ${sb.largura}`);
    assert.ok(sb.telaLargura < telaAntes, `a sala encolhe para a largura que sobra (${telaAntes} → ${sb.telaLargura})`);
    ok('barra lateral da pessoa', `${sb.nome} · ${sb.local} · ${sb.estado} · ${sb.largura}px (sala ${telaAntes} → ${sb.telaLargura}px)`);
    // Câmara: com a pessoa aberta a sala fica legível (≥ 40%) e a pessoa à
    // vista — dentro da tela e fora do celular (e da barra lateral, quando se
    // sobrepõe à sala), estejam eles à direita ou à esquerda.
    const camara = await page.eval(`(() => {
      const m = /scale\\(([\\d.]+)\\)/.exec(document.querySelector('.wg-mundo').style.transform);
      const id = document.querySelector('.wg-sidebar').getAttribute('data-session-id');
      const lugar = [...document.querySelectorAll('.wg-svg .seat[role="button"][data-session-id]')].find((el) => el.getAttribute('data-session-id') === id);
      const r = lugar.querySelector('.seat-card').getBoundingClientRect();
      const t = document.querySelector('.wg-tela').getBoundingClientRect();
      const tapam = [document.querySelector('.wg-telefone'), document.querySelector('.wg-sidebar')]
        .filter(Boolean).map((el) => el.getBoundingClientRect()).filter((o) => o.right > t.left && o.left < t.right);
      const folga = tapam.length ? Math.min(...tapam.map((o) => (o.left >= r.right ? o.left - r.right : r.left - o.right))) : null;
      return { zoom: m ? Number(m[1]) : null, esq: r.left - t.left, dir: t.right - r.right, folga };
    })()`);
    assert.ok(camara.zoom >= 0.39, `zoom legível com a pessoa aberta (${camara.zoom})`);
    assert.ok(camara.esq >= 0 && camara.dir >= 0 && (camara.folga === null || camara.folga >= 0),
      `a pessoa selecionada fica à vista, fora do celular (${JSON.stringify(camara)})`);
    ok('câmara com a pessoa aberta', `zoom ${Math.round(camara.zoom * 100)}% · ficha a ${Math.round(camara.esq)} px da esquerda e ${camara.folga === null ? '—' : Math.round(camara.folga)} px do celular`);
    console.log(`   · contexto: ${sb.conteudo.replace(/\s+/g, ' ').slice(0, 150)}`);

    // Separadores: Custo (4 buckets) e Atividade (linha do tempo).
    await page.click('.wg-sidebar [role="tab"][data-aba="custo"]');
    await sleep(300);
    const custo = await lerSidebar();
    await page.screenshot(join(OUT, '03-sidebar-custo.png'));
    assert.equal(custo.painel, 'custo');
    assert.ok(custo.abas.find((a) => a.id === 'custo').sel === 'true', 'aria-selected no separador ativo');
    assert.ok(custo.secoes.includes('Tokens por tipo') && custo.secoes.includes('Custo e velocidade'), `secções: ${custo.secoes}`);
    const buckets = await page.eval(`document.querySelectorAll('.wg-sidebar .wg-cost-row[data-bucket]').length`);
    assert.ok(buckets === 4 || /ainda não publicou consumo/.test(custo.conteudo), `4 buckets ou "sem dado" honesto (${buckets})`);
    ok('separador Custo', `${buckets} buckets · ${custo.conteudo.replace(/\s+/g, ' ').slice(0, 140)}`);

    await page.click('.wg-sidebar [role="tab"][data-aba="atividade"]');
    await sleep(300);
    const atv = await lerSidebar();
    assert.equal(atv.painel, 'atividade');
    assert.ok(atv.secoes.includes('Linha do tempo'));
    // O histórico da conversa chega com o celular (pedidos, ferramentas, respostas).
    await page.waitFor(`(() => { const t = document.querySelector('.wg-telefone'); if (!t) return true;
      const f = t.getAttribute('data-fase'); return f === 'erro' || f === 'sem-canal' || (f === 'aberta' && !!t.getAttribute('data-fonte')); })()`, 20000);
    await sleep(900);
    const comBolhas = await page.eval(`document.querySelectorAll('.wg-telefone .wg-tel-msg[data-lado]').length`);
    if (comBolhas > 0) {
      await page.waitFor(`document.querySelectorAll('.wg-sidebar .wg-activity li[data-origem="conversa"]').length > 0`, 8000);
    }
    const eventos = await page.eval(`(() => ({
      total: document.querySelectorAll('.wg-sidebar .wg-activity li').length,
      historico: document.querySelectorAll('.wg-sidebar .wg-activity li[data-origem="conversa"]').length,
      primeiro: ((document.querySelector('.wg-sidebar .wg-activity li strong') || {}).textContent || '').slice(0, 80),
    }))()`);
    await page.screenshot(join(OUT, '04-sidebar-atividade.png'));
    assert.ok(comBolhas === 0 || eventos.historico > 0, 'a conversa tem mensagens: a Atividade mostra o histórico dela');
    ok('separador Atividade', `${eventos.total} evento(s) (${eventos.historico} do histórico da conversa) · mais recente: "${eventos.primeiro}"`);

    // Clicar na pessoa abriu também o celular: o 1.º Esc fecha-o (a barra
    // fica), o 2.º fecha a barra (o foco volta à sala); o botão ✕ também.
    assert.ok(await page.eval(`!!document.querySelector('.wg-telefone')`), 'clicar numa pessoa abre o celular com a conversa dela');
    // Abrir o celular não rouba o foco para a caixa (no WebKit o cursor tapava
    // o "i" do placeholder: "|Message"); o placeholder é "iMessage".
    const caixa = await page.eval(`(() => { const c = document.querySelector('.wg-tel-campo textarea'); return c && { foco: document.activeElement === c, placeholder: c.placeholder, rotulo: c.getAttribute('aria-label') }; })()`);
    assert.ok(caixa && !caixa.foco, 'abrir o celular não dá foco automático à caixa de texto');
    assert.equal(caixa.placeholder, 'iMessage');
    ok('celular sem foco automático', `placeholder "${caixa.placeholder}" · ${caixa.rotulo}`);
    await page.key('.wg-sidebar', 'Escape');
    await page.waitFor('!document.querySelector(".wg-telefone")', 3000);
    assert.ok(await page.eval(`!!document.querySelector('.wg-sidebar')`), 'o 1.º Esc fecha só o celular');
    await page.key('.wg-sidebar', 'Escape');
    await page.waitFor('!document.querySelector(".wg-sidebar")', 3000);
    await page.click('.wg-svg .seat[role="button"][data-session-id]');
    await page.waitFor('!!document.querySelector(".wg-sidebar")', 3000);
    await page.click('.wg-sidebar .wg-sidebar-fechar');
    await page.waitFor('!document.querySelector(".wg-sidebar") && !document.querySelector(".wg-telefone")', 3000);
    await page.waitFor('window.__wgTelefoneRefs === 0', 3000);
    ok('Esc fecha o celular e depois a barra lateral; o ✕ fecha os dois (0 referências retidas)');

    // Sangria lateral: a pessoa mais à DIREITA da sala aberta (barra + celular)
    // — a câmara encosta a borda direita do mundo à zona à vista e, do lado de
    // lá, o chão e a parede continuam (nunca a faixa lisa #efece2 da tela).
    const aDireita = await page.eval(`(() => {
      let melhor = null;
      for (const el of document.querySelectorAll('.wg-svg .seat[role="button"][data-session-id]:not(.slot-reserved)')) {
        const r = el.querySelector('.seat-card').getBoundingClientRect();
        if (!melhor || r.right > melhor.x) melhor = { x: r.right, el };
      }
      if (!melhor) return null;
      melhor.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return melhor.el.getAttribute('data-session-id');
    })()`);
    if (aDireita) {
      await page.waitFor('!!document.querySelector(".wg-sidebar") && !!document.querySelector(".wg-telefone")', 5000);
      await sleep(1200);
      const s = await page.eval(`(() => {
        const t = document.querySelector('.wg-tela').getBoundingClientRect();
        const mundo = document.querySelector('.wg-svg > svg').getBoundingClientRect();
        const tel = document.querySelector('.wg-telefone').getBoundingClientRect();
        const ficha = document.querySelector('.wg-svg .seat.selected .seat-card').getBoundingClientRect();
        const y = Math.round(ficha.top + ficha.height / 2);
        const xs = [mundo.right + 6, t.right - 4].filter((x) => x > mundo.right && x < t.right && (x < tel.left || x > tel.right));
        const chao = xs.map((x) => { const el = document.elementFromPoint(x, y); return el ? (el.getAttribute('class') || el.tagName) : null; });
        const parede = [...document.querySelectorAll('.wg-svg .wg-sangria-parede')].map((g) => g.getBoundingClientRect()).find((g) => g.left >= mundo.right - 1);
        return {
          alemDoMundo: Math.round(t.right - mundo.right), chao,
          parede: parede ? { esq: Math.round(parede.left - mundo.right), cobre: parede.right >= t.right && parede.top <= mundo.top + 1 } : null,
          fichaNaZona: ficha.left >= t.left && ficha.right <= tel.left,
        };
      })()`);
      await page.screenshot(join(OUT, '02b-pessoa-a-direita.png'));
      assert.ok(s.fichaNaZona, `a pessoa da direita fica à vista, à esquerda do celular (${JSON.stringify(s)})`);
      if (s.alemDoMundo > 0) {
        assert.ok(s.chao.length > 0 && s.chao.every((c) => /wg-sangria/.test(c || '')), `depois da borda do mundo vê-se o chão da sangria, não a tela: ${JSON.stringify(s.chao)}`);
        assert.ok(s.parede && s.parede.esq <= 1 && s.parede.cobre, `a parede continua para a direita: ${JSON.stringify(s.parede)}`);
      }
      ok('sangria lateral com a pessoa da direita aberta', s.alemDoMundo > 0
        ? `${s.alemDoMundo} px de tela além do mundo: chão (${s.chao.join(', ')}) e parede continuam`
        : 'a câmara não chegou à borda do mundo');
      await page.key('.wg-sidebar', 'Escape');
      await page.waitFor('!document.querySelector(".wg-telefone")', 3000);
      await page.key('.wg-sidebar', 'Escape');
      await page.waitFor('!document.querySelector(".wg-sidebar") && window.__wgTelefoneRefs === 0', 3000);
    }

    // Janela estreita: com uma pessoa aberta (barra + celular), a janela passa
    // de 1000 para 780 px SEM arrastar — a câmara em automático reenquadra no
    // ResizeObserver (caber). A ficha da 1.ª e da última pessoa tem de ficar à
    // vista: dentro da tela, fora do celular e fora da barra (≤ 800 px a barra
    // flutua por cima da sala e o celular vai por cima dela, à direita).
    for (const qual of ['primeira', 'ultima']) {
      await page.setViewport(1000, 900);
      await sleep(700);
      await page.click('.wg-toolbar button[aria-label="Enquadrar toda a sala"]'); // de volta ao automático
      await sleep(300);
      await page.eval(`(() => {
        const ls = [...document.querySelectorAll('.wg-svg .seat[role="button"][data-session-id]:not(.slot-reserved)')];
        const el = ${qual === 'primeira' ? 'ls[0]' : 'ls[ls.length - 1]'};
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      })()`);
      await page.waitFor('!!document.querySelector(".wg-telefone") && !!document.querySelector(".wg-sidebar")', 5000);
      await sleep(900);
      await page.setViewport(780, 900);
      await sleep(1500);
      const g = await page.eval(`(() => {
        const caixa = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { esq: Math.round(b.left), dir: Math.round(b.right) }; };
        const sb = document.querySelector('.wg-sidebar');
        const t = caixa(document.querySelector('.wg-tela'));
        const ficha = caixa(document.querySelector('.wg-svg .seat.selected .seat-card'));
        const tel = caixa(document.querySelector('.wg-telefone'));
        const barra = caixa(sb);
        const absoluta = !!sb && getComputedStyle(sb).position === 'absolute';
        const fora = (o) => !o || !ficha || ficha.dir <= o.esq || ficha.esq >= o.dir;
        return {
          janela: innerWidth, t, ficha, tel, barra, absoluta,
          naTela: !!ficha && ficha.esq >= t.esq && ficha.dir <= t.dir,
          livreDoCelular: fora(tel), livreDaBarra: !absoluta || fora(barra),
          celularSobreBarra: !!tel && !!barra && tel.dir > barra.esq,
        };
      })()`);
      await page.screenshot(join(OUT, `02c-janela-780-${qual}.png`));
      assert.ok(g.naTela && g.livreDoCelular && g.livreDaBarra,
        `janela 1000 → 780 px com a ${qual} pessoa aberta: a ficha fica à vista, fora do celular e da barra (${JSON.stringify(g)})`);
      ok(`janela 1000 → 780 px, ${qual} pessoa aberta`, `ficha ${g.ficha.esq}–${g.ficha.dir} px · celular ${g.tel.esq}–${g.tel.dir} · barra ${g.barra.esq}–${g.barra.dir}${g.absoluta ? ' (por cima da sala)' : ''}${g.celularSobreBarra ? ' · celular por cima da barra' : ''}`);
      await page.key('.wg-sidebar', 'Escape');
      await page.waitFor('!document.querySelector(".wg-telefone")', 3000);
      await page.key('.wg-sidebar', 'Escape');
      await page.waitFor('!document.querySelector(".wg-sidebar") && window.__wgTelefoneRefs === 0', 3000);
    }
    await page.setViewport(1440, 900);
    await sleep(900);
  } else {
    ok('sem conversas visíveis', 'o painel mostra o estado honesto (nada inventado)');
  }

  // Filtros: menu com os 4 interruptores; mudar mexe na sala e fica guardado.
  {
    const lerFiltros = () => page.eval(`(() => ({
      aberto: !!document.querySelector('#wg-filtros-menu'),
      expandido: document.querySelector('.wg-filtros-botao').getAttribute('aria-expanded'),
      interruptores: [...document.querySelectorAll('#wg-filtros-menu [role="switch"]')].map((b) => ({ f: b.getAttribute('data-filtro'), on: b.getAttribute('aria-checked') })),
      escondidas: (document.querySelector('.wg-escondidas') || {}).textContent || null,
      pessoas: document.querySelectorAll('.wg-svg .character').length,
      guardado: (() => { try { return localStorage.getItem('dsh-work-game:filtros'); } catch { return 'erro'; } })(),
    }))()`);
    await page.click('.wg-filtros-botao');
    await page.waitFor('!!document.querySelector("#wg-filtros-menu")', 3000);
    await sleep(250);
    const f0 = await lerFiltros();
    await page.screenshot(join(OUT, '05-filtros.png'));
    assert.equal(f0.expandido, 'true');
    assert.deepEqual(f0.interruptores.map((x) => x.f), ['mostrarArquivadas', 'mostrarSemWorkspace', 'soTrabalhando', 'mostrarEmBranco']);
    ok('menu de filtros', `${f0.interruptores.map((x) => `${x.f}=${x.on}`).join(' ')} · ${f0.escondidas ?? 'ninguém escondido'} · ${f0.pessoas} pessoas`);

    // Mostrar arquivadas: liga, confere a sala e o localStorage, e repõe.
    const antes = f0.interruptores.find((x) => x.f === 'mostrarArquivadas').on;
    await page.click('#wg-filtros-menu [role="switch"][data-filtro="mostrarArquivadas"]');
    await sleep(600);
    const f1 = await lerFiltros();
    assert.notEqual(f1.interruptores.find((x) => x.f === 'mostrarArquivadas').on, antes, 'o interruptor muda');
    assert.ok(f1.guardado && JSON.parse(f1.guardado).mostrarArquivadas === (antes !== 'true'), `guardado em localStorage: ${f1.guardado}`);
    const arquivadasNaSala = await page.eval(`document.querySelectorAll('.wg-svg .seat.arquivada').length`);
    await page.screenshot(join(OUT, '06-filtros-arquivadas.png'));
    ok('"Mostrar arquivadas" mexe na sala e persiste', `${f0.pessoas} → ${f1.pessoas} pessoas · ${arquivadasNaSala} ficha(s) "Arquivada"`);
    await page.click('#wg-filtros-menu [role="switch"][data-filtro="mostrarArquivadas"]');
    await sleep(400);
    const f2 = await lerFiltros();
    assert.equal(f2.pessoas, f0.pessoas, 'repor o filtro devolve a sala de antes');

    // Esc fecha o menu (antes de fechar qualquer outra coisa).
    await page.key('#wg-filtros-menu', 'Escape');
    await page.waitFor('!document.querySelector("#wg-filtros-menu")', 3000);
    ok('Esc fecha o menu de filtros');
  }

  /* ── Celular (iPhone + iMessage) com a conversa REAL ─────────────────── */
  const lerTelefone = () => page.eval(`(() => {
    const t = document.querySelector('.wg-telefone');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const sb = document.querySelector('.wg-sidebar');
    const lista = t.querySelector('.wg-tel-lista');
    const msgs = [...t.querySelectorAll('.wg-tel-msg[data-lado]')];
    const cor = (sel) => { const el = t.querySelector(sel); return el ? getComputedStyle(el).backgroundColor : null; };
    const permitidas = new Set(['SPAN', 'CODE', 'PRE', 'STRONG', 'BUTTON']);
    const estranhas = [...t.querySelectorAll('.wg-tel-bolha *')].filter((el) => !permitidas.has(el.tagName)).map((el) => el.tagName);
    const ultimaCauda = t.querySelector('.wg-tel-msg.wg-tel-cauda .wg-tel-bolha');
    return {
      id: t.getAttribute('data-session-id'),
      fase: t.getAttribute('data-fase'),
      fonte: t.getAttribute('data-fonte'),
      nome: (t.querySelector('.wg-tel-nome') || {}).textContent || '',
      eu: msgs.filter((m) => m.getAttribute('data-lado') === 'eu').length,
      ele: msgs.filter((m) => m.getAttribute('data-lado') === 'ele').length,
      estados: msgs.map((m) => m.getAttribute('data-estado')),
      textos: msgs.slice(-6).map((m) => ({ lado: m.getAttribute('data-lado'), estado: m.getAttribute('data-estado'), texto: (m.querySelector('.wg-tel-bolha') || {}).textContent || '', recibo: (m.querySelector('.wg-tel-recibo') || {}).textContent || null })),
      ferramentas: t.querySelectorAll('.wg-tel-ferramentas').length,
      datas: t.querySelectorAll('.wg-tel-data').length,
      aEscrever: !!t.querySelector('.wg-tel-a-escrever'),
      corEu: cor('.wg-tel-eu .wg-tel-bolha'),
      corEle: cor('.wg-tel-ele .wg-tel-bolha'),
      cauda: ultimaCauda ? getComputedStyle(ultimaCauda, '::before').content : null,
      noFim: lista ? lista.scrollHeight - lista.scrollTop - lista.clientHeight < 60 : false,
      estranhas,
      caixa: [r.x, r.y, r.width, r.height].map(Math.round),
      sbEsquerda: sb ? Math.round(sb.getBoundingClientRect().left) : null,
      refs: window.__wgTelefoneRefs,
      avatar: (() => { const u = t.querySelector('.wg-tel-avatar use'); return u ? !!document.getElementById((u.getAttribute('href') || '').slice(1)) : null; })(),
    };
  })()`);
  const esperarConversa = async (ms = 20000) => {
    await page.waitFor(`(() => { const t = document.querySelector('.wg-telefone'); if (!t) return false;
      const f = t.getAttribute('data-fase'); return f === 'erro' || f === 'sem-canal' || (f === 'aberta' && !!t.getAttribute('data-fonte')); })()`, ms);
    await sleep(900); // o alvo 'chat' publica a cada ~3 frames
    return lerTelefone();
  };
  const lugaresDaSala = () => page.eval(`[...document.querySelectorAll('.wg-svg .seat[role="button"][data-session-id]')].map((el, i) => {
    const r = el.querySelector('.seat-card').getBoundingClientRect();
    return { i, id: el.getAttribute('data-session-id'), titulo: (el.querySelector('title') || {}).textContent || '', x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })`);
  const clicarLugar = (i) => page.eval(`document.querySelectorAll('.wg-svg .seat[role="button"][data-session-id]')[${i}].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))`);
  const zoomTelefone = async (nome) => {
    const t = await lerTelefone();
    if (!t) return;
    const [x, y, w, hh] = t.caixa;
    await page.screenshot(join(OUT, nome), { x: Math.max(0, x - 8), y: Math.max(0, y - 8), width: w + 16, height: hh + 16, scale: 1.5 });
  };

  if (CONVERSA && painel.pessoas > 0) {
    const lugares = await lugaresDaSala();
    const vistos = [];
    for (const l of lugares) {
      await clicarLugar(l.i);
      const t = await esperarConversa();
      assert.ok(t, `clicar em ${l.titulo.split(' · ')[0]} abre o celular`);
      assert.equal(t.id, l.id, 'o celular é da pessoa clicada');
      assert.notEqual(t.fase, 'erro', `a conversa abre sem erro (${l.titulo})`);
      assert.equal(t.refs, 1, `uma só referência viva ao trocar de pessoa (${t.refs})`);
      vistos.push({ ...l, msgs: t.eu + t.ele, t });
      console.log(`   · ${t.nome.trim()}: ${t.eu} minhas + ${t.ele} do agente · ${t.ferramentas} linha(s) de ferramentas · fonte=${t.fonte}`);
    }
    const longa = vistos.reduce((a, b) => (b.msgs > a.msgs ? b : a));
    assert.ok(longa.msgs > 0, 'pelo menos uma conversa com bolhas renderizadas');
    await clicarLugar(longa.i);
    let t = await esperarConversa();
    await sleep(600);
    t = await lerTelefone();
    await page.screenshot(join(OUT, '07-celular-conversa-longa.png'));
    await zoomTelefone('08-celular-zoom.png');
    assert.equal(t.fonte, 'chat', 'as mensagens vêm do alvo "chat" do uiConversation (a montagem do próprio DSH)');
    assert.ok(t.eu + t.ele > 0, 'bolhas renderizadas');
    if (t.eu) assert.equal(t.corEu, 'rgb(11, 132, 254)', 'as minhas: azul #0B84FE');
    if (t.ele) assert.equal(t.corEle, 'rgb(233, 233, 235)', 'as do agente: cinza #E9E9EB');
    assert.ok(t.cauda && t.cauda !== 'none', 'a última bolha de cada grupo tem cauda');
    assert.ok(t.datas >= 1, 'separador de hora');
    assert.ok(t.noFim, 'abre no fim da conversa');
    assert.deepEqual(t.estranhas, [], 'dentro das bolhas só nós de texto React (sem HTML das mensagens)');
    assert.ok(t.avatar !== false, 'o avatar do cabeçalho resolve para o <symbol> do boneco');
    assert.ok(t.sbEsquerda === null || t.caixa[0] + t.caixa[2] <= t.sbEsquerda, `o celular fica à esquerda da barra lateral (${t.caixa} · barra em ${t.sbEsquerda})`);
    ok('celular com a conversa real', `${t.nome.trim()}: ${t.eu} + ${t.ele} bolhas, ${t.ferramentas} linha(s) de ferramentas, ${t.datas} separador(es) de hora · ${t.caixa[2]}×${t.caixa[3]}px`);

    // Mensagens anteriores (loadOlder) quando o DSH tem mais história.
    if (await page.eval(`!!document.querySelector('.wg-tel-antigas')`)) {
      const antes = t.eu + t.ele;
      await page.click('.wg-tel-antigas');
      await page.waitFor(`(() => { const b = document.querySelector('.wg-tel-antigas'); return !b || !b.disabled; })()`, 15000).catch(() => {});
      await sleep(1200);
      const depois = await lerTelefone();
      ok('mensagens anteriores', `${antes} → ${depois.eu + depois.ele} bolhas`);
    }

    // "‹ Escritório" fecha; "Conversa" reabre; Esc fecha — sem fugas.
    await page.click('.wg-tel-voltar');
    await page.waitFor('!document.querySelector(".wg-telefone") && window.__wgTelefoneRefs === 0', 3000);
    assert.ok(await page.eval(`!!document.querySelector('.wg-sidebar')`), '"‹ Escritório" fecha só o celular');
    await page.click('.wg-sidebar .wg-abrir-telefone');
    await esperarConversa();
    assert.equal(await page.eval('window.__wgTelefoneRefs'), 1);
    await page.key('.wg-tel-campo textarea', 'Escape');
    await page.waitFor('!document.querySelector(".wg-telefone") && window.__wgTelefoneRefs === 0', 3000);
    await page.click('.wg-sidebar .wg-sidebar-fechar');
    await page.waitFor('!document.querySelector(".wg-sidebar")', 3000);
    await sleep(900); // a tela volta à largura inteira e a câmara reenquadra (ResizeObserver)
    ok('"‹ Escritório", "Conversa" e Esc', 'abrem/fecham o celular; 0 referências retidas no fim');
  }

  if (ENVIAR) {
    const re = new RegExp(ENVIAR, 'i');
    const alvo = (await lugaresDaSala()).find((l) => re.test(l.titulo));
    assert.ok(alvo, `nenhuma pessoa na sala com o título /${ENVIAR}/ (filtros?)`);
    // Rato real (abre a barra e o celular); se o lugar estiver tapado, o clique vai por evento.
    const livre = await page.eval(`(() => { const el = document.elementFromPoint(${alvo.x}, ${alvo.y}); const s = el && el.closest && el.closest('[data-session-id]'); return !!s && s.getAttribute('data-session-id') === ${JSON.stringify(alvo.id)}; })()`);
    if (livre) await page.clickAt(alvo.x, alvo.y); else await clicarLugar(alvo.i);
    const antes = await esperarConversa();
    assert.equal(antes.fase, 'aberta', `a conversa de teste abre (${antes.fase})`);
    const r = await page.eval(`(() => { const c = document.querySelector('.wg-tel-campo textarea').getBoundingClientRect(); return { x: Math.round(c.x + c.width / 2), y: Math.round(c.y + c.height / 2) }; })()`);
    await page.clickAt(r.x, r.y);
    await page.insertText(MENSAGEM);
    await sleep(200);
    assert.equal(await page.eval(`document.querySelector('.wg-tel-campo textarea').value`), MENSAGEM, 'o texto chega à caixa (Input.insertText)');
    assert.equal(await page.eval(`document.querySelector('.wg-tel-enviar').disabled`), false, 'com texto, o botão de enviar fica ativo');
    // A conversa de teste pode já ter a mesma frase de corridas anteriores:
    // segue-se a ÚLTIMA bolha minha com o texto (a contagem tem de subir).
    const troca = `(() => {
      const ms = [...document.querySelectorAll('.wg-tel-msg[data-lado]')];
      const txt = (m) => (m.querySelector('.wg-tel-bolha') || {}).textContent || '';
      let i = -1;
      let n = 0;
      ms.forEach((m, k) => { if (m.getAttribute('data-lado') === 'eu' && txt(m) === ${JSON.stringify(MENSAGEM)}) { i = k; n += 1; } });
      const depois = i < 0 ? [] : ms.slice(i + 1).filter((m) => m.getAttribute('data-lado') === 'ele' && m.getAttribute('data-estado') === 'ok');
      return {
        n, estado: i < 0 ? null : ms[i].getAttribute('data-estado'),
        recibo: i < 0 ? null : ((ms[i].querySelector('.wg-tel-recibo') || {}).textContent || null),
        resposta: depois.length ? txt(depois[depois.length - 1]) : null,
        aEscrever: !!document.querySelector('.wg-tel-a-escrever'),
      };
    })()`;
    const antesN = (await page.eval(troca)).n;
    await page.press('Enter', { keyCode: 13 });
    await page.waitFor(`${troca}.n > ${antesN}`, 5000); // eco imediato (ou já a real)
    assert.equal(await page.eval(`document.querySelector('.wg-tel-campo textarea').value`), '', 'enviar limpa a caixa');
    await sleep(300);
    await zoomTelefone('09-celular-a-enviar.png');
    // Durável: a bolha azul "Entregue" (o eco trocou pela mensagem real).
    await page.waitFor(`${troca}.estado === 'ok'`, 30000);
    // A resposta do agente: uma bolha cinza nova depois da minha.
    const t0 = Date.now();
    let viuAEscrever = false;
    let fim = null;
    while (Date.now() - t0 < 150000) {
      const x = await page.eval(troca);
      if (x.aEscrever && !viuAEscrever) { viuAEscrever = true; await zoomTelefone('10-celular-a-escrever.png'); }
      if (x.resposta && !x.aEscrever) { fim = x; break; }
      await sleep(800);
    }
    assert.ok(fim, 'o agente respondeu no celular (bolha cinza depois da minha)');
    await sleep(600);
    await page.screenshot(join(OUT, '11-celular-troca.png'));
    await zoomTelefone('12-celular-troca-zoom.png');
    const t = await lerTelefone();
    assert.ok(!t.estados.includes('falhou'), 'nenhuma bolha "Não entregue"');
    assert.equal((await page.eval(troca)).recibo, 'Entregue', 'a minha mensagem é a última entregue ("Entregue")');
    assert.equal((await page.eval(troca)).n, antesN + 1, 'uma bolha minha nova, sem duplicados');
    ok('enviar pelo celular', `"${MENSAGEM}" → ${fim.resposta.slice(0, 80)}${viuAEscrever ? ' · viu "a escrever…"' : ''}`);
    await page.click('.wg-tel-voltar');
    await page.waitFor('window.__wgTelefoneRefs === 0', 3000);
    await page.click('.wg-sidebar .wg-sidebar-fechar');
    await page.waitFor('!document.querySelector(".wg-sidebar")', 3000);
    await sleep(900);
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

    // 3) "Abrir no DSH" (uiWorkspace.openSession) mostra a conversa no DSH.
    assert.ok(await page.eval(`!!document.querySelector('.wg-sidebar .wg-abrir-conversa')`), 'a barra lateral oferece "Abrir no DSH"');
    await page.eval(`document.querySelector('.wg-abrir-conversa').click()`);
    await page.waitFor(`!document.querySelector('.wg-painel')`, 8000);
    await sleep(500);
    await page.screenshot(join(OUT, '03-conversa.png'));
    // O painel desmontou com o celular aberto: a conversa retida foi libertada.
    await page.waitFor('window.__wgTelefoneRefs === 0', 3000);
    ok('"Abrir no DSH" levou à conversa no DSH', 'o celular largou a sessão ao sair do painel (0 referências)');

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
