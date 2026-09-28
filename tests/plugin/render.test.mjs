/*
 * tests/plugin/render.test.mjs — a SALA do Modo jogo dentro do bundle do plugin.
 *
 * Cobre a distribuição pela sala (montarEscritorio) e a cena (renderOffice +
 * sprite), com as regressões que motivaram esta versão:
 *   - os WORKSPACES do DSH aparecem como mesas (título, caminho, ordem do DSH,
 *     cores dos temas da demo) — antes tudo colapsava numa mesa "geral";
 *   - a visibilidade segue a barra lateral do DSH (subagentes, arquivadas e
 *     conversas em branco sem lugar próprio) e a delegação em curso usa a mesa
 *     violeta da demo com o lugar de casa reservado;
 *   - os bonecos são <use> de <symbol>s únicos no sprite, todas as referências
 *     #… resolvem e a máscara pendurada dos bustos (fonte de bonecos invisíveis
 *     fora do Chromium) não chega à página;
 *   - REGRA DE OURO: a arte embutida é byte a byte a da demo (assets/).
 *
 * Executar: node --test tests/plugin/render.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

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
await import('../../dsh-plugin/src/client.js');
const B = moduloBundle;
const RAIZ = new URL('../../', import.meta.url);
const BUNDLE = readFileSync(new URL('dsh-plugin/src/client.js', RAIZ), 'utf8');

function pessoa(id, extra = {}) {
  return {
    id,
    name: extra.name ?? `P${id}`,
    avatar: extra.avatar ?? 'rui',
    status: extra.status ?? 'idle',
    emoji: extra.emoji ?? '💤',
    ctx: extra.ctx ?? null,
    model: extra.model ?? 'deepseek-chat',
    cost: extra.cost ?? null,
    speed: extra.speed ?? null,
    question: extra.question ?? null,
    outputs: [],
    title: extra.title ?? `Conversa ${id}`,
    cwd: 'cwd' in extra ? extra.cwd : '/Users/u/projetos/demo',
    parentId: extra.parentId ?? null,
    subagent: extra.subagent ?? false,
    blank: extra.blank ?? false,
    running: extra.running ?? false,
    subagents: extra.subagents ?? 0,
  };
}
const wsDsh = (items, archived = []) => ({ fonte: 'dsh', items, archived });
const w = (id, title, sessionIds, path = `/Users/u/Projects/${title}`) => ({ id, title, path, sessionIds });

const idsDe = (svg) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const refsDe = (svg) => [
  ...[...svg.matchAll(/(?:xlink:href|href)="#([^"]+)"/g)].map((m) => m[1]),
  ...[...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]),
];
const rotulos = (svg) => [...svg.matchAll(/class="desk-label"[^>]*>([^<]*)</g)].map((m) => m[1]);
const subtitulos = (svg) => [...svg.matchAll(/class="desk-subtitle"[^>]*>([^<]*)</g)].map((m) => m[1]);

/* ---------- distribuição pela sala ---------- */

test('layout: uma mesa por workspace do DSH, na ordem do DSH, com título e caminho (~)', () => {
  const pessoas = [pessoa('a'), pessoa('b'), pessoa('c')];
  const l = B.__montarEscritorio(pessoas, wsDsh([
    w('w1', 'newsletter-crawler', ['b', 'a']),
    w('w2', 'daf-chat', ['c']),
    w('w3', 'vazio', []),
  ]));
  assert.deepEqual([...l.equipas.values()].map((e) => [e.name, e.path, e.theme]), [
    ['newsletter-crawler', '~/Projects/newsletter-crawler', 'blue'],
    ['daf-chat', '~/Projects/daf-chat', 'teal'],
    ['vazio', '~/Projects/vazio', 'coral'],
  ]);
  assert.deepEqual(l.modules.map((m) => [m.teamId, m.kind, m.seats]), [
    ['ws:w1', 'main', ['b', 'a', null, null]],
    ['ws:w2', 'main', ['c', null, null, null]],
    ['ws:w3', 'main', [null, null, null, null]],
  ], 'ordem manual do workspace (sessionIds) e workspace vazio com 4 lugares livres');
  assert.equal(l.visiveis, 3);
});

test('layout: órfãs vão para "Sem workspace" (o Ungrouped do DSH), no fim; 5+ pessoas expandem a mesa', () => {
  const pessoas = ['a', 'b', 'c', 'd', 'e', 'x'].map((id) => pessoa(id));
  const l = B.__montarEscritorio(pessoas, wsDsh([w('w1', 'site', ['a', 'b', 'c', 'd', 'e'])]));
  assert.deepEqual(l.modules.map((m) => [m.teamId, m.kind]), [
    ['ws:w1', 'main'], ['ws:w1', 'expansion'], ['sem-workspace', 'main'],
  ]);
  const semWs = l.equipas.get('sem-workspace');
  assert.equal(semWs.name, 'Sem workspace');
  assert.equal(semWs.path, 'Ungrouped no DSH');
  const svg = B.__renderOffice({ people: Object.fromEntries(pessoas.map((p) => [p.id, p])), layout: l });
  assert.deepEqual(rotulos(svg), ['site', 'site', 'Sem workspace']);
  assert.ok(subtitulos(svg).includes('Mais espaço do time site'), 'mesa de expansão com o texto da demo');
});

test('layout: esconde como a barra do DSH — subagentes, arquivadas e em branco (a menos que corram)', () => {
  const pessoas = [
    pessoa('a'),
    pessoa('arq'),
    pessoa('vazia', { blank: true }),
    pessoa('nova', { blank: true, running: true }),
    pessoa('sub', { subagent: true, parentId: 'a' }),
  ];
  const l = B.__montarEscritorio(pessoas, wsDsh([w('w1', 'site', ['a', 'arq', 'vazia', 'nova'])], ['arq']));
  const sentadas = l.modules.flatMap((m) => m.seats).filter((s) => typeof s === 'string');
  assert.deepEqual(sentadas, ['a', 'nova']);
});

test('layout: delegação em curso = mesa violeta "Equipe de …" com o lugar de casa reservado', () => {
  const pessoas = [
    pessoa('a', { name: 'Lia', running: true, subagents: 2 }),
    pessoa('b', { name: 'Rui' }),
    pessoa('s1', { name: 'Pesquisa', subagent: true, parentId: 'a', running: true }),
    pessoa('s2', { name: 'Código', subagent: true, parentId: 'a', running: true }),
    pessoa('s3', { name: 'Velho', subagent: true, parentId: 'a', running: false }),
  ];
  const l = B.__montarEscritorio(pessoas, wsDsh([w('w1', 'site', ['a', 'b'])]));
  assert.deepEqual(l.modules.map((m) => [m.kind, m.seats]), [
    ['main', [{ reservado: 'a' }, 'b', null, null]],
    ['delegation', ['a', 's1', 's2', null]],
  ]);
  const svg = B.__renderOffice({ people: Object.fromEntries(pessoas.map((p) => [p.id, p])), layout: l });
  assert.deepEqual(rotulos(svg), ['site', 'Equipe de Lia']);
  assert.ok(subtitulos(svg).includes('Lia + subagentes'));
  assert.match(svg, /class="seat slot-reserved"[^>]*data-session-id="a"/, 'o lugar de casa fica reservado e aponta para a líder');
  assert.ok(svg.includes('Em delegação ↗'));
  assert.match(svg, /data-kind="delegation"[^>]*style="--desk-color:#8064ae/, 'mesa de delegação no violeta da demo');
});

test('layout: delegação com mais de 3 subagentes abre mesa de apoio ("Apoio de …")', () => {
  const filhos = ['s1', 's2', 's3', 's4'].map((id, i) => pessoa(id, { name: `F${i + 1}`, subagent: true, parentId: 'a', running: true }));
  const pessoas = [pessoa('a', { name: 'Lia', running: true }), ...filhos];
  const l = B.__montarEscritorio(pessoas, wsDsh([w('w1', 'site', ['a'])]));
  const deleg = l.modules.filter((m) => m.kind === 'delegation');
  assert.equal(deleg.length, 2);
  assert.deepEqual(deleg[1].seats, ['s4', null, null, null]);
  const svg = B.__renderOffice({ people: Object.fromEntries(pessoas.map((p) => [p.id, p])), layout: l });
  assert.deepEqual(rotulos(svg), ['site', 'Equipe de Lia', 'Apoio de F4']);
});

test('layout: sem o serviço de workspaces agrupa por pasta (cwd)', () => {
  const pessoas = [
    pessoa('a', { cwd: '/Users/u/Projects/site' }),
    pessoa('b', { cwd: '/Users/u/Projects/api' }),
    pessoa('c', { cwd: '/Users/u/Projects/site' }),
    pessoa('d', { cwd: null }),
  ];
  for (const ws of [null, { fonte: 'nenhuma', items: [], archived: [] }]) {
    const l = B.__montarEscritorio(pessoas, ws);
    assert.deepEqual(l.modules.map((m) => m.seats.filter(Boolean)), [['a', 'c'], ['b'], ['d']]);
    assert.deepEqual([...l.equipas.values()].map((e) => e.name), ['site', 'api', 'Sem workspace']);
  }
});

/* ---------- a cena (estética da demo) ---------- */

const cenario = () => {
  const pessoas = [
    pessoa('a', { name: 'Rui', running: true, status: 'working', cost: 0.42, speed: 38, ctx: { used: 42000, window: 200000 }, title: 'Status atual do projeto' }),
    pessoa('b', { name: 'Bia', avatar: 'bia', question: 'Posso seguir?', status: 'waiting' }),
    pessoa('c', { name: 'Lia', avatar: 'lia', status: 'done' }),
    pessoa('d', { name: 'Maya', avatar: 'maya', ctx: { used: 214600, window: 200000 } }),
    pessoa('e', { name: 'Alex', avatar: 'alex' }),
  ];
  const people = Object.fromEntries(pessoas.map((p) => [p.id, p]));
  const layout = B.__montarEscritorio(pessoas, wsDsh([w('w1', 'site', ['a', 'b', 'c']), w('w2', 'api', ['d', 'e'])]));
  return { people, layout, svg: B.__renderOffice({ people, layout, selecionada: 'a' }), sprite: B.__spriteDoPainel(layout.chaves) };
};

test('cena: geometria da demo (grelha 940×730, origem 40, largura 2900) e temas por workspace', () => {
  const { svg } = cenario();
  assert.match(svg, /<svg class="office-scene"[^>]*width="2900" height="830"/, 'mundo = 40·2 + 3·940 por 40 + 1·730 + 60');
  assert.match(svg, /data-team-id="ws:w1"[^>]*transform="translate\(40 40\)"/);
  assert.match(svg, /data-team-id="ws:w2"[^>]*transform="translate\(980 40\)"/, 'segunda mesa a 940 da primeira');
  assert.match(svg, /data-team-id="ws:w1"[^>]*style="--desk-color:#2869a6;--desk-panel:#25629b;--desk-stroke:#244e72"/);
  assert.match(svg, /data-team-id="ws:w2"[^>]*style="--desk-color:#408a80;--desk-panel:#378176;--desk-stroke:#2c625b"/);
  assert.deepEqual(rotulos(svg), ['site', 'api']);
  assert.deepEqual(subtitulos(svg), ['~/Projects/site', '~/Projects/api']);
});

test('cena: elementos da demo presentes (mesas, cadeiras, portáteis, fichas, chão, grelha, ❓, >200k, fita)', () => {
  const { svg } = cenario();
  assert.match(svg, /id="wg-floor"/);
  for (const peca of ['desk', 'chair', 'laptop']) assert.ok(svg.includes(`href="#wg-${peca}"`), peca);
  for (const classe of ['seat-card', 'desk-label', 'grid-line', 'question-flag', 'finish-ribbon', 'context-over']) {
    assert.ok(svg.includes(classe), classe);
  }
});

test('cena: nome curto na ficha, título da conversa no tooltip e "Trabalhando" para quem corre', () => {
  const { svg } = cenario();
  const nomes = [...svg.matchAll(/class="seat-card-name"[^>]*>([^<]*)</g)].map((m) => m[1]).filter((n) => n !== 'Lugar livre');
  assert.deepEqual(nomes, ['Rui', 'Bia', 'Lia', 'Maya', 'Alex']);
  assert.ok(nomes.every((n) => n.length <= 14), 'nomes cabem na ficha de 198px');
  assert.match(svg, /<title>Rui · Status atual do projeto · Trabalhando · clique para inspecionar<\/title>/);
});

test('bonecos: <use> de um <symbol> por corpo, presente no sprite, com a expressão do estado', () => {
  const { svg, sprite } = cenario();
  const usos = [...svg.matchAll(/<g class="character" data-character-id="([^"]+)" data-expression="([^"]+)"><use href="#([^"]+)" width="226" height="240"\/>/g)];
  assert.equal(usos.length, 5, 'um boneco por pessoa sentada');
  assert.deepEqual(usos.map((u) => [u[1], u[2], u[3]]), [
    ['a', 'working', 'wgav-rui-working'],
    ['b', 'waiting', 'wgav-bia-waiting'],
    ['c', 'success', 'wgav-lia-success'],
    ['d', 'idle', 'wgav-maya-idle'],
    ['e', 'idle', 'wgav-alex-idle'],
  ]);
  for (const u of usos) assert.ok(sprite.includes(`<symbol id="${u[3]}" viewBox="0 0 264 280" preserveAspectRatio="xMidYMax meet">`), u[3]);
  assert.ok(!svg.includes('<svg width="226"'), 'nada de SVG aninhado por pessoa: a cena fica leve');
});

test('REGRESSÃO: todas as referências #… resolvem (cena + sprite) e ids referenciados são únicos', () => {
  const { svg, sprite } = cenario();
  const todos = idsDe(svg + sprite);
  const ids = new Set(todos);
  const partidas = refsDe(svg + sprite).filter((r) => r && !ids.has(r));
  assert.deepEqual([...new Set(partidas)], [], 'referências sem destino = bonecos/mobiliário invisíveis');
  const referenciados = new Set(refsDe(svg + sprite));
  const repetidos = [...referenciados].filter((id) => todos.indexOf(id) !== todos.lastIndexOf(id));
  assert.deepEqual(repetidos, [], 'um id referenciado aparece uma única vez no documento');
});

test('REGRESSÃO: a máscara pendurada dos bustos (sem o círculo) não chega à página', () => {
  const corpo = '<defs><path id="p1"/></defs><g id="Avataaar" mask="url(#m-perdida)"><mask id="m1"><use xlink:href="#p1"/></mask><g mask="url(#m1)"/></g>';
  const pronto = B.__prepararCorpo(corpo, 'wgav-x');
  assert.ok(!pronto.includes('m-perdida'), 'a referência pendurada sai');
  assert.ok(pronto.includes('mask="url(#wgav-x-m1)"'), 'as máscaras que existem ficam, com escopo');
  assert.ok(pronto.includes('xlink:href="#wgav-x-p1"'));
  const { sprite } = cenario();
  for (const m of sprite.matchAll(/mask="url\(#([^)]+)\)"/g)) assert.ok(sprite.includes(`id="${m[1]}"`), m[1]);
});

test('sprite: memorizado (mesmo conjunto = mesma string) e com o mobiliário da demo', () => {
  const { layout } = cenario();
  const s1 = B.__spriteDoPainel(layout.chaves);
  const s2 = B.__spriteDoPainel([...layout.chaves].reverse());
  assert.equal(s1, s2);
  for (const peca of ['desk', 'chair', 'laptop', 'connector', 'plant', 'window']) assert.ok(s1.includes(`<symbol id="wg-${peca}"`), peca);
});

test('recrutar: com uiWorkspace, lugar livre e "Nova sessão" abrem conversa no workspace certo', () => {
  const pessoas = [
    pessoa('a', { name: 'Lia', running: true }),
    pessoa('s1', { subagent: true, parentId: 'a', running: true }),
    pessoa('x'),
  ];
  const layout = B.__montarEscritorio(pessoas, wsDsh([w('w1', 'site', ['a'])]));
  const people = Object.fromEntries(pessoas.map((p) => [p.id, p]));
  const com = B.__renderOffice({ people, layout, recrutar: true });
  const sem = B.__renderOffice({ people, layout });

  const livres = [...com.matchAll(/<g class="seat slot-free recrutavel" role="button" tabindex="0" aria-label="Abrir nova sessão no lugar (\d) desta mesa" data-action="nova-sessao" data-workspace-id="([^"]+)">/g)];
  assert.deepEqual(livres.map((m) => [m[1], m[2]]), [['2', 'w1'], ['3', 'w1'], ['4', 'w1']], 'só os lugares livres da mesa do workspace real');
  assert.ok(com.includes('Clique para recrutar'), 'texto da demo no lugar livre');
  const botoes = [...com.matchAll(/class="scene-action"[^>]*aria-label="Nova sessão" data-action="nova-sessao" data-workspace-id="([^"]+)"/g)];
  assert.deepEqual(botoes.map((m) => m[1]), ['w1'], '"Nova sessão" só na mesa do workspace (nem delegação nem Sem workspace)');

  assert.ok(!sem.includes('data-action="nova-sessao"'), 'sem uiWorkspace, nada de ações que não funcionam');
  assert.ok(!sem.includes('Clique para recrutar'));
});

/* ---------- REGRA DE OURO: a arte é a da demo ---------- */

test('REGRA DE OURO: cada corpo embutido é byte a byte o SVG da demo (assets/avatars/expressions)', () => {
  const bloco = BUNDLE.slice(BUNDLE.indexOf('const EXPR_AVATARS = {'));
  let conferidos = 0;
  for (const m of bloco.matchAll(/\n\s{6}(\w+): \{\n((?:\s{8}\w+: \{ vb: '[^']+', corpo: `[^`]*` \},\n)+)/g)) {
    for (const e of m[2].matchAll(/\s{8}(\w+): \{ vb: '([^']+)', corpo: `([^`]*)` \}/g)) {
      const ficheiro = new URL(`assets/avatars/expressions/${m[1]}/${e[1]}.svg`, RAIZ);
      assert.ok(existsSync(ficheiro), `${m[1]}/${e[1]}.svg existe`);
      const original = readFileSync(ficheiro, 'utf8');
      assert.ok(original.includes(e[3]) && original.includes(`viewBox="${e[2]}"`), `${m[1]}/${e[1]} igual ao da demo`);
      conferidos += 1;
    }
  }
  assert.equal(conferidos, 48, '8 identidades × 6 expressões');
});

test('REGRA DE OURO: o mobiliário embutido é o furniture.svg da demo (ids com prefixo wg-)', () => {
  const mobiliario = BUNDLE.match(/const MOBILIARIO = `([\s\S]*?)`;/)[1];
  const original = readFileSync(new URL('assets/furniture.svg', RAIZ), 'utf8');
  const simbolos = [...mobiliario.matchAll(/<symbol id="wg-([^"]+)"[\s\S]*?<\/symbol>/g)];
  assert.ok(simbolos.length >= 20);
  for (const s of simbolos) assert.ok(original.includes(s[0].replace(`id="wg-${s[1]}"`, `id="${s[1]}"`)), s[1]);
});

test('auto-verificação e ganchos de teste expostos', () => {
  for (const nome of ['__verificarRefs', '__trace', '__extrairSuperficie', '__montarEscritorio', '__spriteDoPainel', '__renderOffice']) {
    assert.equal(typeof B[nome], 'function', nome);
  }
});
