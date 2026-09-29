/*
 * tests/lei-animacao.test.mjs — a LEI de animação, IMPOSTA por teste.
 *
 * README.md § "LEI de animação" (decisão do utilizador, 2026-09-29): toda e
 * qualquer animação — demo ou plugin — move só com `transform`/`opacity`
 * (translate/scale), anima só o que está visível, pausa com a aba escondida,
 * usa `will-change` gerido e respeita `prefers-reduced-motion` (também nas
 * animações WAAPI, que não herdam a media query). Qualquer animação nova fora
 * destas regras REPROVA este ficheiro — a lei vale mesmo sem ler o README.
 *
 * Executar: node --test tests/lei-animacao.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* bundle do plugin em Node (loader falso) — o CSS final inclui os keyframes gerados */
let moduloBundle = null;
globalThis.window = {
  __ModuleLoader__: {
    load({ factory }) {
      moduloBundle = factory((nome) => {
        if (nome === 'react') return { createElement: () => null };
        throw new Error(`módulo inesperado: ${nome}`);
      });
    },
  },
};
await import('../dsh-plugin/src/client.js');
const B = moduloBundle;

const RAIZ = new URL('../', import.meta.url);
const CSS_DEMO = readFileSync(new URL('styles.css', RAIZ), 'utf8');
const CSS_PLUGIN = B.__CSS_PAINEL;
const APP = readFileSync(new URL('app.js', RAIZ), 'utf8');
const BUNDLE = readFileSync(new URL('dsh-plugin/src/client.js', RAIZ), 'utf8');

/* propriedades que PODEM animar (a lei): só estas */
const LICITAS_KEYFRAMES = new Set(['transform', 'opacity']);
/* feedback de cor pontual em hover/click — o único paint permitido (nunca em loop) */
const LICITAS_TRANSICOES = new Set([
  'transform', 'opacity', 'fill', 'stroke', 'background', 'background-color', 'border-color', 'filter', 'none',
]);

function keyframesDe(css) {
  const out = [];
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let i = m.index + m[0].length;
    let prof = 1;
    while (prof > 0 && i < css.length) {
      prof += (css[i] === '{') - (css[i] === '}');
      i += 1;
    }
    out.push({ nome: m[1], corpo: css.slice(m.index + m[0].length, i - 1) });
  }
  return out;
}

function propsDe(corpo) {
  return new Set([...corpo.matchAll(/(?:^|[;{])\s*([a-z-]+)\s*:/g)].map((m) => m[1]));
}

test('LEI: todo @keyframes anima SÓ transform/opacity — demo e plugin, sem exceções', () => {
  const problemas = [];
  for (const [fonte, css] of [['styles.css', CSS_DEMO], ['client.js (CSS_PAINEL)', CSS_PLUGIN]]) {
    const kfs = keyframesDe(css);
    assert.ok(kfs.length > 0, `${fonte} tem keyframes para auditar`);
    for (const kf of kfs) {
      for (const p of propsDe(kf.corpo)) {
        if (!LICITAS_KEYFRAMES.has(p)) problemas.push(`${fonte}: @keyframes ${kf.nome} anima "${p}"`);
      }
    }
  }
  assert.deepEqual(problemas, [], 'nada de layout/paint em loop:\n' + problemas.join('\n'));
});

test('LEI: transições só em transform/opacity — cor/filtro apenas como feedback pontual', () => {
  const problemas = [];
  for (const [fonte, css] of [['styles.css', CSS_DEMO], ['client.js (CSS_PAINEL)', CSS_PLUGIN]]) {
    for (const m of css.matchAll(/transition:([^;}\'"]+)/g)) {
      // sem as funções de curva (cubic-bezier(...), linear(...)) — as vírgulas
      // dentro delas não separam propriedades
      const valor = m[1].replace(/[\w-]+\([^)]*\)/g, '');
      for (const pedaco of valor.split(',')) {
        const prop = pedaco.trim().split(/\s+/)[0]?.replace(/!important$/, '');
        if (prop && !LICITAS_TRANSICOES.has(prop)) problemas.push(`${fonte}: transition:${prop}`);
      }
    }
  }
  assert.deepEqual(problemas, [], 'transições fora da lei:\n' + problemas.join('\n'));
});

test('LEI: animações WAAPI (element.animate) só em transform/opacity e com gates', () => {
  const chamadas = [...APP.matchAll(/\.animate\(\s*\[/g)].map((m) => m.index);
  assert.equal(chamadas.length, 2, 'a demo tem exatamente 2 animações WAAPI (fade da expressão e transferência)');
  for (const i of chamadas) {
    // só o array de keyframes (até ao `]`) — as opções (duration/easing) não contam
    const bloco = APP.slice(i, APP.indexOf(']', i));
    for (const p of bloco.matchAll(/(?:^|[{,])\s*([a-zA-Z]+)\s*:/g)) {
      assert.ok(['transform', 'opacity', 'offset'].includes(p[1]), `WAAPI anima "${p[1]}" — só transform/opacity`);
    }
    const antes = APP.slice(Math.max(0, i - 700), i);
    assert.match(antes, /prefers-reduced-motion: reduce/, 'toda a WAAPI tem gate manual de reduced-motion');
    assert.match(antes, /pessoaNoEcrã|pontoNoEcrã/, 'toda a WAAPI tem gate de visibilidade');
  }
});

test('LEI: will-change é gerido — nunca fixo; só durante o gesto da câmara', () => {
  for (const [fonte, css] of [['styles.css', CSS_DEMO], ['client.js (CSS_PAINEL)', CSS_PLUGIN]]) {
    for (const m of css.matchAll(/([^{}]+)\{[^}]*?will-change:([^;}]+)[^}]*\}/g)) {
      const seletor = m[1].trim();
      const valor = m[2].trim();
      if (valor === 'auto') continue; // desligar é sempre legítimo
      assert.match(seletor, /camara-ativa/, `${fonte}: will-change fixo em "${seletor}" — tem de ser gerido (camara-ativa)`);
    }
  }
});

test('LEI: aba escondida pausa tudo (nada visível, nada anima)', () => {
  assert.match(CSS_DEMO, /html\.oculto \*\{animation-play-state:paused!important\}/, 'demo: html.oculto');
  assert.match(CSS_PLUGIN, /\.wg-painel\.wg-oculto \*[^{]*\{animation-play-state:paused!important\}/, 'plugin: .wg-painel.wg-oculto');
  assert.match(APP, /visibilitychange/, 'demo: liga o estado da aba');
  assert.match(BUNDLE, /visibilitychange/, 'plugin: liga o estado da aba');
});

test('LEI: só o visível anima — portões de visibilidade nos dois lados', () => {
  // demo: balões/portátil/fades condicionados a pessoaNoEcrã + pulso do ❓ com fora-de-vista
  assert.match(APP, /function pessoaNoEcrã/, 'demo: helper de visibilidade');
  assert.match(APP, /fora-de-vista/, 'demo: pulso do ❓ classificado por visibilidade');
  assert.match(CSS_DEMO, /\.question-flag-pulse\.fora-de-vista\{animation:none\}/, 'demo: pulso parado fora do ecrã');
  // plugin: mesas fora da vista e lugares tapados sem animação
  assert.match(CSS_PLUGIN, /\.wg-svg \.desk-module\.wg-fora [^{]*\{animation:none\}/, 'plugin: wg-fora');
  assert.match(CSS_PLUGIN, /\.wg-svg \.character-hit\.wg-tapado [^{]*\{animation:none\}/, 'plugin: wg-tapado');
});

test('LEI: reduced-motion cobre o CSS dos dois lados', () => {
  assert.match(CSS_DEMO, /@media\(prefers-reduced-motion:reduce\)/, 'demo');
  assert.match(CSS_PLUGIN, /@media\(prefers-reduced-motion:reduce\)/, 'plugin');
});
