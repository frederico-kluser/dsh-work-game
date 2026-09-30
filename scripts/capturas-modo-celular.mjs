#!/usr/bin/env node
/*
 * capturas-modo-celular.mjs — FORÇA o modo celular do Modo jogo e grava o ecrã.
 *
 * Emula um telemóvel de verdade (390×844, toque → `pointer: coarse`) DESDE O
 * ARRANQUE, abre o Modo jogo num DSH web real e percorre o celular:
 *   Grupos → Grupo (feed de todos) → Conversa individual → "‹" volta ao grupo.
 * Em cada passo grava uma captura de ECRÃ INTEIRO e regista o que aconteceu
 * (vistas, ícones, referências retidas, erros de consola) — é isto que se cola
 * na conversa para ajustar o aspeto.
 *
 * Uso:  node scripts/capturas-modo-celular.mjs <url-base> [pasta-de-saída]
 * Saída: PNGs (01..05-*.png) + resumo na consola. Exit 0 = tudo percorrido;
 *        1 = algo falhou (o resumo diz o quê); 2 = uso inválido.
 */
import { mkdirSync } from 'node:fs';
// (asserções simples: o script é evidência, não suíte)
import { join, resolve } from 'node:path';
import { launchBrowser, sleep } from '../tests/helpers/cdp.mjs';

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const [URL, OUT_ARG] = process.argv.slice(2);
if (!/^https?:\/\//.test(URL || '')) {
  console.error('uso: node scripts/capturas-modo-celular.mjs <url-base> [pasta-de-saída]');
  process.exit(2);
}
const OUT = resolve(OUT_ARG || 'logs/capturas-celular');
mkdirSync(OUT, { recursive: true });

const b = await launchBrowser({ width: 390, height: 844 });
const { page } = b;
const notas = [];
const anotar = (nome, dados) => { notas.push({ nome, ...dados }); console.log(`· ${nome}: ${JSON.stringify(dados)}`); };
const estadoCelular = () => page.eval(`(() => {
  const p = document.querySelector('.wg-painel');
  const t = document.querySelector('.wg-telefone');
  const r = t ? t.getBoundingClientRect() : null;
  return {
    painel: p ? p.className : null,
    vista: t ? t.getAttribute('data-vista') : null,
    workspace: t ? t.getAttribute('data-workspace-id') : null,
    sessao: t ? t.getAttribute('data-session-id') : null,
    voltar: t && t.querySelector('.wg-tel-voltar') ? t.querySelector('.wg-tel-voltar').textContent.trim() : null,
    ligar: t ? !!t.querySelector('.wg-tel-icone-direita') : null,
    voz: t ? !!t.querySelector('.wg-tel-voz') : null,
    ilha: t && t.querySelector('.wg-tel-ilha') ? getComputedStyle(t.querySelector('.wg-tel-ilha')).display : null,
    caixa: r ? [r.x, r.y, r.width, r.height].map(Math.round) : null,
    janela: [innerWidth, innerHeight],
    // a barra do DSH fica por baixo do celular? (o ponto 12,400 tem de estar NELE)
    barraCoberta: !!document.elementFromPoint(12, Math.round(innerHeight / 2) - 20)?.closest?.('.wg-telefone'),
    refs: window.__wgTelefoneRefs ?? null,
  };
})()`);

try {
  // FORÇA o modo celular antes de qualquer página carregar.
  await page.setViewport(390, 844, true);
  await page.goto(URL, `document.readyState === 'complete' && !!document.querySelector('button[aria-label="Modo jogo"]')`);
  await sleep(1200);
  await page.eval(`(() => { const b = document.querySelector('button[aria-label="Modo jogo"]'); b.click(); return true; })()`);
  await page.waitFor('!!document.querySelector(".wg-telefone")', 20000);
  await sleep(900);

  // 1) Grupos (a entrada do celular em modo telemóvel)
  let e = await estadoCelular();
  anotar('grupos (arranque em telemóvel)', e);
  await page.screenshot(join(OUT, '01-celular-grupos.png'));

  // 2) Grupo: o feed de todos a falar e a escrever
  await page.click('.wg-tel-grupo-linha');
  await page.waitFor('document.querySelector(".wg-telefone").getAttribute("data-vista") === "grupo"', 8000);
  await sleep(2200); // as conversas dos membros publicam
  e = await estadoCelular();
  const feed = await page.eval(`(() => {
    const t = document.querySelector('.wg-telefone');
    return {
      linhas: t.querySelectorAll('.wg-tel-lista > *').length,
      falam: [...new Set([...t.querySelectorAll('.wg-tel-remetente')].map((x) => x.textContent.trim()))],
      escrevendo: t.querySelectorAll('.wg-tel-a-escrever').length,
      campo: (t.querySelector('.wg-tel-campo textarea') || {}).placeholder || '',
    };
  })()`);
  anotar('grupo (feed)', { ...e, ...feed });
  await page.screenshot(join(OUT, '02-celular-grupo.png'));

  // 3) Conversa individual (clique numa mensagem de alguém)
  const alvo = await page.eval(`(() => { const m = document.querySelector('.wg-tel-msg[data-session-id][role="button"]'); return m ? m.getAttribute('data-session-id') : null; })()`);
  if (alvo) {
    await page.eval(`document.querySelector('.wg-tel-msg[data-session-id][role="button"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))`);
    await page.waitFor(`document.querySelector('.wg-telefone').getAttribute('data-session-id') === ${JSON.stringify(alvo)}`, 12000);
    await sleep(1200);
    e = await estadoCelular();
    anotar('conversa individual', e);
    await page.screenshot(join(OUT, '03-celular-conversa.png'));

    // 4) "‹" volta ao grupo
    await page.click('.wg-tel-voltar');
    await page.waitFor('document.querySelector(".wg-telefone").getAttribute("data-vista") === "grupo"', 8000);
    await sleep(600);
    e = await estadoCelular();
    anotar('‹ volta ao grupo', e);
    await page.screenshot(join(OUT, '04-celular-volta-ao-grupo.png'));
  } else {
    anotar('conversa individual', { pulada: 'sem mensagens clicáveis no grupo' });
  }

  // 5) Esc não fecha o celular (quiosque) — e a lista tem sempre saída para as telas
  await page.key('.wg-tel-lista', 'Escape');
  await sleep(500);
  const ainda = await page.eval('!!document.querySelector(".wg-telefone")');
  anotar('Esc no telemóvel', { celularAberto: ainda, esperado: true });
  await page.screenshot(join(OUT, '05-celular-final.png'));

  // 6) Tela inicial: o botao "Fechar" fecha o Modo jogo (volta ao DSH).
  await page.click('.wg-tel-voltar'); // grupo → grupos (tela inicial)
  await page.waitFor('document.querySelector(".wg-telefone").getAttribute("data-vista") === "grupos"', 8000);
  await sleep(500);
  const fecho = await page.eval(`(() => {
    const t = document.querySelector('.wg-telefone');
    const b = t && t.querySelector('.wg-tel-voltar');
    return { rotulo: b ? b.textContent.trim() : null, titulo: b ? b.getAttribute('title') : null };
  })()`);
  anotar('tela inicial com botão de fechar', fecho);
  await page.screenshot(join(OUT, '06-celular-tela-inicial.png'));
  assert(fecho.rotulo === 'Fechar', `a tela inicial tem "Fechar" (veio: ${fecho.rotulo})`);
  await page.click('.wg-tel-voltar');
  await page.waitFor('!document.querySelector(".wg-painel")', 8000);
  anotar('Modo jogo fechado', { painel: await page.eval('!!document.querySelector(".wg-painel")'), conversaDsh: await page.eval('!!document.querySelector(".wg-painel") === false') });
  await sleep(400);
  await page.screenshot(join(OUT, '07-modo-jogo-fechado.png'));

  const erros = page.consoleErrors || [];
  console.log(`\nRESUMO: ${notas.length} passos · erros de consola: ${erros.length}`);
  if (erros.length) console.log(JSON.stringify(erros.slice(0, 5), null, 2));
  console.log(`CAPTURAS EM: ${OUT}`);
  if (erros.length || !ainda) process.exit(1);
} finally {
  await b.close();
}
