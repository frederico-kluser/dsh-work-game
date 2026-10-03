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
 *   - REGRA DE OURO: a arte embutida é byte a byte a da demo (assets/);
 *   - a cena viva pedida pelo utilizador: quem está Disponível dorme (olhos
 *     fechados + "zzz"), quem trabalha balança (fase por pessoa, contínua
 *     entre re-montagens), o portátil fica junto ao peito (abaixo do queixo)
 *     e o topo do mundo é a parede do escritório (fundo com janela à esquerda);
 *   - os FILTROS da sala (arquivadas, "Sem workspace", só quem trabalha, em
 *     branco — cada um, com a contagem de escondidas e a persistência) e a
 *     BARRA LATERAL da demo (modelo de dados puro: contexto real, 4 buckets
 *     de tokens + custo estimado, linha do tempo dos eventos recebidos).
 *
 * Executar: node --test tests/plugin/render.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  const ws = wsDsh([w('w1', 'site', ['a', 'arq', 'vazia', 'nova'])], ['arq']);
  // As regras da barra do DSH, com "Manter workspaces abertos sem ação" DESLIGADO.
  const l = B.__montarEscritorio(pessoas, ws, { mostrarAbertos: false });
  const sentadas = l.modules.flatMap((m) => m.seats).filter((s) => typeof s === 'string');
  assert.deepEqual(sentadas, ['a', 'nova']);
  // Por omissão (mostrarAbertos) o workspace aberto mantém as pessoas sem ação:
  // a em branco fica sentada e só a arquivada sai (detalhe em filtros.test.mjs).
  const abertos = B.__montarEscritorio(pessoas, ws);
  assert.deepEqual(abertos.modules.flatMap((m) => m.seats).filter((s) => typeof s === 'string'), ['a', 'vazia', 'nova']);
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

test('cena: geometria da demo (grelha 940×730, largura 2900) abaixo da parede e temas por workspace', () => {
  const { svg } = cenario();
  // O topo do mundo é a parede do escritório (0–360); a 1.ª fila começa em
  // originY = 360 − 50 = 310 (só os balões sobem ao ripado). Altura do mundo
  // = originY + linhas·730 + 60 (a mesma fórmula da demo, com a parede).
  assert.match(svg, /<svg class="office-scene"[^>]*width="2900" height="1100"/, 'mundo = 40·2 + 3·940 por 310 + 1·730 + 60');
  assert.match(svg, /data-team-id="ws:w1"[^>]*transform="translate\(40 310\)"/);
  assert.match(svg, /data-team-id="ws:w2"[^>]*transform="translate\(980 310\)"/, 'segunda mesa a 940 da primeira');
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
  const usos = [...svg.matchAll(/<g class="character[^"]*" data-character-id="([^"]+)" data-expression="([^"]+)"[^>]*><use href="#([^"]+)" width="226" height="240"\/>/g)];
  assert.equal(usos.length, 5, 'um boneco por pessoa sentada');
  // Disponível (parado) = a dormir: olhos fechados (assets/avatars/sleeping/).
  // Pergunta, erro, concluído e trabalho mantêm as expressões da demo.
  assert.deepEqual(usos.map((u) => [u[1], u[2], u[3]]), [
    ['a', 'working', 'wgav-rui-working'],
    ['b', 'waiting', 'wgav-bia-waiting'],
    ['c', 'success', 'wgav-lia-success'],
    ['d', 'sleeping', 'wgav-maya-sleeping'],
    ['e', 'sleeping', 'wgav-alex-sleeping'],
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

/* ---------- a cena viva (pedido do utilizador) ---------- */

// Um trecho por boneco: do seu grupo .character-hit até ao próximo.
const trechosDeBoneco = (svg) => Object.fromEntries(
  svg.split('<g class="seat character-hit" data-session-id="').slice(1).map((t) => [t.slice(0, t.indexOf('"')), t]),
);
const estados = () => {
  const pessoas = [
    pessoa('t', { status: 'working', running: true }),
    pessoa('f', { status: 'tool', running: true, avatar: 'lia' }),
    pessoa('w', { status: 'waiting', question: 'Posso?' }),
    pessoa('z', { status: 'idle', avatar: 'bia' }),
    pessoa('ok', { status: 'done' }),
    pessoa('x', { status: 'error' }),
  ];
  const people = Object.fromEntries(pessoas.map((p) => [p.id, p]));
  const layout = B.__montarEscritorio(pessoas, wsDsh([w('w1', 'site', ['t', 'f', 'w', 'z']), w('w2', 'api', ['ok', 'x'])]));
  return { people, layout, svg: B.__renderOffice({ people, layout }) };
};

test('cena viva: quem está Disponível dorme — olhos fechados, "zzz" e balanço LATERAL da cabeça', () => {
  const { svg } = estados();
  const trechos = trechosDeBoneco(svg);
  const comZzz = Object.keys(trechos).filter((id) => trechos[id].includes('<g class="wg-zzz" aria-hidden="true"'));
  assert.deepEqual(comZzz, ['z'], 'pergunta, erro, concluído e trabalho não dormem');
  assert.match(trechos.z, /data-expression="sleeping" style="animation-duration:[\d.]+s;animation-delay:(-?[\d.]+)s"><use href="#wgav-bia-sleeping"/);
  // Quem dorme balança a CABEÇA lateralmente (a mesma onda do ativo, eixo X),
  // com o seu ritmo e a sua fase: nunca igual à do vizinho.
  assert.match(trechos.z, /class="character wg-balanca-lateral" data-character-id="z"/);
  const balancoLateral = Number(trechos.z.match(/animation-duration:[\d.]+s;animation-delay:(-?[\d.]+)s/)[1]);
  assert.ok(balancoLateral <= 0 && balancoLateral > -3.64, `fase negativa dentro do ciclo do ritmo: ${balancoLateral}`);
  // O grupo leva a posição; cada letra fica em (0,0), centrada — a escala e a
  // subida partem da própria letra também no Safari (o WebKit ignorava o x/y
  // do <text> com transform-box:fill-box e os "z" desciam sobre o vizinho).
  const grupo = trechos.z.match(/<g class="wg-zzz" aria-hidden="true" transform="translate\(([\d.]+) (\d+)\)">/);
  assert.ok(grupo, 'posição no grupo');
  const letras = [...trechos.z.matchAll(/<text class="wg-z" text-anchor="middle" style="animation-delay:(-?[\d.]+)s">z<\/text>/g)];
  assert.equal(letras.length, 3, 'três "z" desfasados, sem x/y próprios');
  const atrasos = letras.map((l) => Number(l[1]));
  assert.ok(atrasos.every((a) => a <= 0 && a > -3 * 3.6), `atrasos negativos (fase já a meio): ${atrasos}`);
  assert.ok(Math.abs((atrasos[0] - atrasos[1]) - 1.2) < 0.011 && Math.abs((atrasos[1] - atrasos[2]) - 1.2) < 0.011, 'um terço de ciclo entre letras');
  assert.ok(atrasos.every((a) => Math.abs(a / 0.2 - Math.round(a / 0.2)) < 1e-6), `fases em múltiplos do passo (0,2 s): ${atrasos}`);
  const cxZ = 112.5 + 3 * 225; // 'z' senta-se no 4.º lugar
  assert.ok(Number(grupo[1]) > cxZ + 56 && Number(grupo[1]) < cxZ + 112, 'à direita da cabeça, antes do vizinho');
  assert.ok(Number(grupo[2]) > 147 && Number(grupo[2]) < 294, 'à altura da cabeça (entre o topo do busto e o queixo)');
  // Por pessoa: outra identidade tem outra fase; a mesma pessoa, sempre a mesma.
  const outra = B.__renderOffice({ people: { y3: pessoa('y3') }, layout: B.__montarEscritorio([pessoa('y3')], null) });
  const atrasoOutra = Number(outra.match(/class="wg-z"[^>]*animation-delay:(-?[\d.]+)s/)[1]);
  assert.notEqual(atrasoOutra, atrasos[0], 'cada pessoa no seu ritmo');
  assert.equal(estados().svg, svg, 'determinístico: re-render com o mesmo estado = o mesmo markup');
  const css = B.__CSS_PAINEL;
  assert.ok(css.includes('.wg-svg .wg-zzz{pointer-events:none}'), 'o zzz não apanha cliques nem o arraste');
  const regra = css.match(/\.wg-svg \.wg-z\{([^}]*)\}/)[1];
  assert.match(regra, /transform-box:view-box;transform-origin:0 0/, 'origem na própria letra (nada de fill-box: o Safari erra-a)');
  assert.match(regra, /animation:wg-zzz 3\.60s steps\(1,end\) infinite paused/, 'em degraus, em pausa: o relógio da cena avança-as');
});

test('cena viva: o "zzz" sobe (e anda para a direita) a partir da orelha — geometria dos quadros-chave', () => {
  const css = B.__CSS_PAINEL;
  const kf = css.match(/@keyframes wg-zzz\{((?:[\d.]+%\{[^}]*\})+)\}/);
  assert.ok(kf, '@keyframes wg-zzz');
  const quadros = [...kf[1].matchAll(/([\d.]+)%\{opacity:([\d.]+);transform:translate\((-?[\d.]+)px,(-?[\d.]+)px\) scale\(([\d.]+)\)\}/g)]
    .map((m) => m.slice(1).map(Number));
  assert.equal(quadros.length, 19, '18 degraus de 0,2 s em 3,6 s (+ o 100%)');
  const [ini, fim] = [quadros[0], quadros[quadros.length - 1]];
  assert.deepEqual(ini, [0, 0, 0, 0, 0.6], 'nasce invisível, pequena, na orelha');
  assert.deepEqual(fim, [100, 0, 22, -60, 1.2], 'acaba ACIMA e à direita, maior, apagada');
  for (let k = 1; k < quadros.length; k += 1) {
    assert.ok(quadros[k][3] < quadros[k - 1][3], 'sempre a subir (y diminui)');
    assert.ok(quadros[k][2] >= quadros[k - 1][2], 'e a afastar-se da cara');
  }
  assert.equal(Math.max(...quadros.map((q) => q[1])), 1, 'totalmente visível a meio');
  // Sem movimento: escada parada, também a partir da própria letra.
  const reduzido = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce){'));
  assert.ok(reduzido.includes('.wg-svg .wg-z:nth-child(3){transform:translate(26px,-46px) scale(1.15)}'));
});

test('cena viva: quem trabalha (Trabalhando/Executando ferramenta) balança — só o boneco, ritmo e fase por pessoa', () => {
  const { svg } = estados();
  const balancam = [...svg.matchAll(/<g class="character wg-balanca" data-character-id="([^"]+)" data-expression="[^"]+" style="animation-duration:([\d.]+)s;animation-delay:(-?[\d.]+)s">/g)];
  assert.deepEqual(balancam.map((m) => m[1]), ['t', 'f'], 'só Trabalhando e Executando ferramenta');
  assert.equal((svg.match(/wg-balanca"/g) || []).length, 2, 'nem cadeira nem portátil balançam');
  const duracoes = balancam.map((m) => Number(m[2]));
  const [a, b] = balancam.map((m) => Number(m[3]));
  // Ninguém se move na mesma velocidade: o ritmo por pessoa (0,82×–1,30× do
  // ciclo base de 2,8 s, em passos de 0,01) vem do hash do id — determinístico.
  for (const d of duracoes) assert.ok(d >= 2.8 * 0.82 - 1e-9 && d <= 2.8 * 1.3 + 1e-9, `ritmo dentro do intervalo: ${d}`);
  const ritmos = [...Array(12)].map((_, i) => B.__ritmoDe(`conversa-${i}`));
  assert.ok(new Set(ritmos).size > 6, `ritmos variados entre pessoas: ${ritmos}`);
  assert.ok(ritmos.every((r) => r >= 0.82 && r <= 1.3), 'dentro da banda 0,82×–1,30×');
  assert.ok(a <= 0 && a > -duracoes[0] && b <= 0 && b > -duracoes[1], `atraso negativo dentro do ciclo da própria pessoa: ${a}, ${b}`);
  assert.ok([a, b].every((x) => Math.abs(x / 0.2 - Math.round(x / 0.2)) < 1e-6), 'fases em múltiplos do passo (0,2 s)');
  assert.notEqual(a, b, 'cada pessoa no seu próprio começo');
  // O mesmo ritmo é estável para a mesma conversa (hash do id) e quantiza a 0,01.
  assert.equal(B.__duracaoDe('t', 2.8), B.__duracaoDe('t', 2.8), 'ritmo determinístico');
  const r = B.__ritmoDe('t');
  assert.ok(Math.abs(r * 100 - Math.round(r * 100)) < 1e-9, `ritmo quantizado a 0,01: ${r}`);
  const css = B.__CSS_PAINEL;
  assert.ok(css.includes('.wg-svg .character.wg-balanca{transform-box:fill-box;animation:wg-balanco 2.80s steps(1,end) infinite paused}'));
  assert.ok(css.includes('.wg-svg .character.wg-balanca-lateral{transform-box:fill-box;animation:wg-balanco-lateral 2.80s steps(1,end) infinite paused}'));
  const kf = css.match(/@keyframes wg-balanco\{((?:[\d.]+%\{[^}]*\})+)\}/)[1];
  const ys = [...kf.matchAll(/%\{transform:translateY\((-?[\d.]+)(?:px)?\)\}/g)].map((m) => Number(m[1]));
  assert.equal(ys.length, 15, '14 degraus de 0,2 s num ciclo de 2,8 s (+ o 100%)');
  assert.ok(ys.every((y) => y <= 0), 'só sobe — nunca desce sobre o portátil');
  assert.equal(Math.min(...ys), -7, `sobe levemente (7 unidades ≈ 2,8 px a 40%): ${Math.min(...ys)}`);
  assert.equal(ys[0], 0);
  assert.equal(ys[ys.length - 1], 0, 'volta ao sítio: ciclo sem salto');
  // prefers-reduced-motion: sem balanço (nem lateral) e com o zzz parado (em escada).
  const reduzido = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce){'));
  for (const regra of ['.wg-svg .character.wg-balanca{animation:none}', '.wg-svg .character.wg-balanca-lateral{animation:none}', '.wg-svg .wg-z{animation:none;', '.wg-svg .question-flag-pulse{animation:none}']) {
    assert.ok(reduzido.includes(regra), regra);
  }
});

test('cena viva: quem dorme balança a cabeça LATERALMENTE — a mesma onda do ativo, no eixo X', () => {
  const css = B.__CSS_PAINEL;
  const kf = css.match(/@keyframes wg-balanco-lateral\{((?:[\d.]+%\{[^}]*\})+)\}/);
  assert.ok(kf, '@keyframes wg-balanco-lateral');
  const xs = [...kf[1].matchAll(/%\{transform:translateX\(([\d.]+)(?:px)?\)\}/g)].map((m) => Number(m[1]));
  assert.equal(xs.length, 15, 'os MESMOS 14 degraus do balanço do ativo (+ o 100%)');
  assert.ok(xs.every((x) => x >= 0), 'só se desloca para o lado e volta');
  assert.equal(Math.max(...xs), 7, 'a MESMA distância do ativo (7 unidades), mas lateral');
  assert.equal(xs[0], 0);
  assert.equal(xs[xs.length - 1], 0, 'volta ao sítio: ciclo sem salto');
  // A geometria bate certo com a do balanço vertical: mesmo cosseno, eixo trocado.
  const ky = css.match(/@keyframes wg-balanco\{((?:[\d.]+%\{[^}]*\})+)\}/)[1];
  const ys = [...ky.matchAll(/translateY\((-?[\d.]+)(?:px)?\)/g)].map((m) => Number(m[1]));
  assert.deepEqual(xs.map((x) => -x + 0), ys, 'mesma onda, eixo X em vez de Y');
});

test('cena viva: o relógio da cena põe as animações (em pausa) no degrau comum — re-montar não salta', () => {
  // Cada evento re-monta a cena; o painel põe as NOSSAS animações no mesmo
  // degrau do relógio do documento (com o atraso de cada pessoa, a fase
  // continua) — na re-montagem e 5×/s pelo temporizador; as outras não se tocam.
  const anims = [
    { animationName: 'wg-balanco', currentTime: 0 },
    { animationName: 'wg-zzz', currentTime: 5123.4 },
    { animationName: 'flag-pulse', currentTime: 999 },
  ];
  // A LISTA dos elementos animados à vista (o que o relógio guarda): só os
  // getAnimations() de cada um, nunca a subárvore inteira da sala.
  const el = (lista) => {
    const e = { getAnimations: (o) => { assert.equal(o, undefined, 'por elemento, sem subtree'); return lista; } };
    for (const x of lista) x.effect = { target: e };
    return e;
  };
  assert.equal(B.__alinharAnimacoes([el(anims.slice(0, 2)), el([anims[2]]), null], 12500), 2);
  assert.deepEqual(anims.map((a) => a.currentTime), [12500, 12500, 999], 'só as da cena viva');
  // Compatibilidade: uma raiz → a subárvore.
  const raiz = { getAnimations: (o) => { assert.deepEqual(o, { subtree: true }); return anims; } };
  assert.equal(B.__alinharAnimacoes(raiz, 12700), 2);
  assert.equal(anims[0].currentTime, 12700);
  // O relógio anda em degraus de 0,2 s e acerta-as a MEIO do degrau.
  assert.equal(B.__tempoDaCena(12400), 12500);
  assert.equal(B.__tempoDaCena(12599.9), 12500, 'o mesmo degrau até ao fim');
  assert.equal(B.__tempoDaCena(12600), 12700, 'degrau seguinte');
  assert.equal(B.__alinharAnimacoes(null), 0);
  assert.equal(B.__alinharAnimacoes({}), 0, 'motor sem Web Animations: não rebenta (ficam paradas na fase de cada um)');
  assert.match(BUNDLE, /timer = agendar\(tique, passo - \(agoraT % passo\) \+ 2\)/, 'um só temporizador, acertado aos degraus');
  assert.match(BUNDLE, /acertarAnimacoes\(animacoes, tempoDaCena\(agoraT\)\)/, 'cada degrau acerta a lista GUARDADA');
  assert.match(BUNDLE, /acertarAnimacoes\(animacoes, tempoDaCena\(agoraT\)\)/, 'o degrau acerta a lista guardada');
  assert.ok(!/alinharAnimacoes\(telaRef\.current/.test(BUNDLE), 'o painel já não percorre a tela inteira a cada degrau');
});

// Relógio falso: temporizadores, frames e visibilidade da aba à mão.
function relogioFalso({ semMovimento = false, midia = null } = {}) {
  const f = { agora: 1000, timers: new Map(), seq: 0, frames: [], ouvintes: new Map(), hidden: false, diag: { tiques: 0, elementos: 0, ativo: false } };
  f.documento = {
    get hidden() { return f.hidden; },
    addEventListener: (tipo, fn) => f.ouvintes.set(tipo, fn),
    removeEventListener: (tipo, fn) => { if (f.ouvintes.get(tipo) === fn) f.ouvintes.delete(tipo); },
  };
  f.relogio = B.__criarRelogioCena({
    documento: f.documento,
    agora: () => f.agora,
    agendar: (fn, ms) => { f.seq += 1; f.timers.set(f.seq, { fn, ms }); return f.seq; },
    cancelar: (id) => f.timers.delete(id),
    proximoQuadro: (fn) => f.frames.push(fn),
    // Com uma MediaQueryList falsa, o relógio lê-a (e ouve-a); senão, fixo.
    ...(midia ? { midiaMovimento: midia } : { semMovimento: () => semMovimento }),
    diag: f.diag,
  });
  // Corre o próximo temporizador (avança o relógio até ele).
  f.avancar = () => {
    const [id, { fn, ms }] = [...f.timers.entries()][0];
    f.timers.delete(id);
    f.agora += ms;
    fn();
  };
  f.esconder = (h) => { f.hidden = h; f.ouvintes.get('visibilitychange')(); };
  return f;
}
// Elemento animado (com a sua Animation) e a raiz da cena: getAnimations da
// subárvore conta as consultas (o tique NÃO pode consultar).
const animado = (nome = 'wg-zzz') => {
  const el = { id: nome };
  const a = { animationName: nome, currentTime: 0, effect: { target: el } };
  el.getAnimations = () => [a];
  return { a, el };
};
const raizDe = (...itens) => {
  const r = { consultas: 0, itens };
  r.getAnimations = (o) => { assert.deepEqual(o, { subtree: true }); r.consultas += 1; return r.itens.map((x) => x.a); };
  return r;
};

test('relógio da cena: só corre com zzz/balanço À VISTA e com a aba visível; acerta só a lista guardada', () => {
  const f = relogioFalso();
  assert.equal(f.timers.size, 0, 'sem nada à vista, nenhum temporizador');
  assert.equal(f.ouvintes.has('visibilitychange'), true, 'ouve a visibilidade da aba');

  const z = animado();
  const b = animado('wg-balanco');
  const fora = animado(); // na subárvore, mas não na lista (mesa fora de vista)
  const bandeira = animado('flag-pulse');
  const raiz = raizDe(z, b, fora, bandeira);
  f.relogio.definir([z.el, b.el, bandeira.el], raiz);
  assert.equal(raiz.consultas, 1, 'recolhe as animações UMA vez, numa só consulta à subárvore');
  assert.equal(z.a.currentTime, B.__tempoDaCena(1000), 'acerta logo, antes de pintar');
  assert.equal(fora.a.currentTime, 0, 'o que não está na lista não se toca');
  assert.equal(bandeira.a.currentTime, 0, 'nem animações que não são da cena viva');
  assert.deepEqual(f.relogio.estado(), { elementos: 3, animacoes: 2, ativo: true });
  assert.equal(f.timers.size, 1, 'um só temporizador');
  assert.equal([...f.timers.values()][0].ms, 200 - (1000 % 200) + 2, 'acertado ao degrau seguinte');
  assert.equal(f.frames.length, 1, 'e outra vez no frame seguinte (o WebKit cria parte das animações só aí)');
  f.agora = 1234;
  f.frames.shift()();
  assert.equal(raiz.consultas, 2, 'no frame seguinte recolhe de novo');
  assert.equal(b.a.currentTime, B.__tempoDaCena(1234));

  // Os degraus usam a lista GUARDADA: nenhuma consulta por tique…
  for (let k = 0; k < 4; k += 1) f.avancar();
  assert.equal(raiz.consultas, 2, 'o tique não chama getAnimations');
  assert.equal(z.a.currentTime, B.__tempoDaCena(f.agora), 'cada degrau acerta a lista');
  assert.equal(f.timers.size, 1, 'e reagenda-se');
  assert.equal(f.diag.ativo, true);
  // … e só recolhe outra vez a cada 5 degraus (1 s): uma animação recriada por fora não fica parada.
  const nova = { animationName: 'wg-zzz', currentTime: 0, effect: { target: z.el } };
  raiz.itens = [{ a: nova }, b, fora];
  f.avancar();
  assert.equal(raiz.consultas, 3, 'recolha periódica');
  assert.equal(nova.currentTime, B.__tempoDaCena(f.agora));
  // Uma animação guardada que o CSS cancelou (playState 'idle': animation:none,
  // prefers-reduced-motion…) nunca é acertada — ressuscitava-a — e força a recolha.
  nova.playState = 'idle';
  const congelada = nova.currentTime;
  raiz.itens = [b, fora];
  f.avancar();
  assert.equal(nova.currentTime, congelada, 'a cancelada não se toca');
  assert.equal(raiz.consultas, 4, 'recolhe logo');
  assert.equal(b.a.currentTime, B.__tempoDaCena(f.agora), 'as vivas continuam');
  assert.equal(f.relogio.estado().animacoes, 1);

  // Aba escondida: pára; ao voltar, recolhe, acerta logo e retoma.
  f.esconder(true);
  assert.equal(f.timers.size, 0, 'aba escondida: sem temporizador');
  assert.equal(f.diag.ativo, false);
  f.agora = 9876;
  f.esconder(false);
  assert.equal(raiz.consultas, 5, 'de volta: recolhe');
  assert.equal(b.a.currentTime, B.__tempoDaCena(9876), 'e acerta já');
  assert.equal(f.timers.size, 1, 'e retoma');

  // A câmara saiu de quem se mexe: lista vazia → pára (e nem consulta).
  const tiques = f.diag.tiques;
  f.relogio.definir([], raiz);
  assert.equal(raiz.consultas, 5);
  assert.equal(f.timers.size, 0, 'nada animado à vista: parado');
  assert.equal(f.frames.length, 0);
  assert.equal(f.diag.tiques, tiques);

  // Definir com a aba escondida só GUARDA a lista: nem consulta a subárvore
  // (forçava um cálculo de estilo que o browser, em segundo plano, saltaria)
  // nem liga nada; ao voltar, recolhe, acerta e retoma.
  raiz.itens = [z, b, fora];
  f.hidden = true;
  const consultasEscondida = raiz.consultas;
  f.relogio.definir([z.el], raiz);
  assert.equal(raiz.consultas, consultasEscondida, 'escondida: nenhuma consulta à subárvore');
  assert.equal(f.frames.length, 0, 'nem frame seguinte');
  assert.equal(f.timers.size, 0);
  f.agora = 20000;
  f.esconder(false);
  assert.equal(raiz.consultas, consultasEscondida + 1, 'de volta: recolhe');
  assert.equal(z.a.currentTime, B.__tempoDaCena(20000), 'e acerta já');
  assert.equal(f.timers.size, 1);

  // Elementos à vista SEM animações vivas (o CSS cancelou-as: animation:none,
  // reduzir movimento…): recolhe, não acha nada e PÁRA — nada de 5 Hz no vazio.
  const semVida = animado();
  const raizVazia = raizDe();
  f.relogio.definir([semVida.el], raizVazia);
  assert.equal(f.timers.size, 0, 'sem animações vivas: sem temporizador');
  assert.equal(f.diag.ativo, false);
  // O WebKit cria-as no frame seguinte: aí arranca.
  raizVazia.itens = [semVida];
  f.frames.shift()();
  assert.equal(f.timers.size, 1, 'no frame seguinte já há animações: arranca');
  assert.equal(semVida.a.currentTime, B.__tempoDaCena(f.agora));
  // O CSS cancela-as a meio (idle): recolhe, fica sem nada e pára.
  semVida.a.playState = 'idle';
  raizVazia.itens = [];
  const tiquesAntes = f.diag.tiques;
  f.avancar();
  assert.equal(f.timers.size, 0, 'canceladas: pára');
  assert.equal(f.diag.tiques, tiquesAntes, 'e não conta tique');
  assert.deepEqual(f.relogio.estado(), { elementos: 1, animacoes: 0, ativo: false });
  // Volta com definir (re-montagem, câmara) ou com a aba a voltar.
  raizVazia.itens = [{ a: { animationName: 'wg-zzz', currentTime: 0, effect: { target: semVida.el } } }];
  f.esconder(true);
  f.esconder(false);
  assert.equal(f.timers.size, 1, 'a aba a voltar recolhe e retoma');

  // Painel desmontado: pára e deixa de ouvir a aba.
  f.relogio.parar();
  assert.equal(f.timers.size, 0);
  assert.equal(f.ouvintes.has('visibilitychange'), false);
  f.relogio.definir([z.el], raiz);
  assert.equal(f.timers.size, 0, 'parado é parado');

  // prefers-reduced-motion: nada anima (as animações nem existem) → sem temporizador.
  const r = relogioFalso({ semMovimento: true });
  r.relogio.definir([animado().el]);
  assert.equal(r.timers.size, 0);
  assert.deepEqual(r.relogio.estado(), { elementos: 0, animacoes: 0, ativo: false });

  // …e a MUDANÇA de "Reduzir movimento" com o painel aberto é ouvida: a mesma
  // lista outra vez (desligado → o relógio arranca; ligado → pára).
  const midia = {
    matches: true, ouvinte: null,
    addEventListener(tipo, fn) { assert.equal(tipo, 'change'); this.ouvinte = fn; },
    removeEventListener(tipo, fn) { if (this.ouvinte === fn) this.ouvinte = null; },
  };
  const g = relogioFalso({ midia });
  assert.equal(typeof midia.ouvinte, 'function', 'ouve a mudança de prefers-reduced-motion');
  const mz = animado();
  const mr = raizDe(mz);
  g.relogio.definir([mz.el], mr);
  assert.equal(g.timers.size, 0, 'reduzir movimento: nada a correr');
  assert.equal(mr.consultas, 0);
  g.agora = 4321;
  midia.matches = false;
  midia.ouvinte();
  assert.equal(g.timers.size, 1, 'desligado com o painel aberto: a lista volta e o relógio arranca');
  assert.equal(mz.a.currentTime, B.__tempoDaCena(4321), 'as animações criadas em pausa no 0 vão logo para o degrau');
  midia.matches = true;
  midia.ouvinte();
  assert.equal(g.timers.size, 0, 'ligado outra vez: pára');
  g.relogio.parar();
  assert.equal(midia.ouvinte, null, 'parar deixa de ouvir');

  // Sem raiz: por elemento (motores sem a subárvore).
  const s = animado();
  assert.deepEqual(B.__recolherAnimacoes(null, [s.el, null]), [s.a]);
  assert.deepEqual(B.__recolherAnimacoes(raizDe(s), []), [], 'lista vazia: nem consulta');
});

test('degraus: a meio do degrau o quadro-chave mostrado é SEMPRE o do degrau (steps(1,end), percentagens arredondadas)', () => {
  // Réplica do motor: progresso da iteração = ((currentTime − atraso) mod D) / D
  // em vírgula flutuante; com steps(1,end) mostra-se o último quadro-chave
  // com offset ≤ progresso.
  const css = B.__CSS_PAINEL;
  const offsets = (nome) => [...css.match(new RegExp(`@keyframes ${nome}\\{((?:[\\d.]+%\\{[^}]*\\})+)\\}`))[1]
    .matchAll(/([\d.]+)%\{/g)].map((m) => Number(m[1]) / 100);
  const mostrado = (offs, progresso) => { let k = 0; while (k + 1 < offs.length && offs[k + 1] <= progresso) k += 1; return k; };
  const falhas = (offs, periodoMs, tempo) => {
    const n = offs.length - 1;
    let erradas = 0;
    for (let passoAtraso = 0; passoAtraso < n; passoAtraso += 1) {
      const atrasoS = -passoAtraso * 0.2; // fases por pessoa: múltiplos do passo, em segundos (como no CSS)
      for (let agora = 0; agora < 3 * periodoMs; agora += 7.3) {
        const t = tempo(agora);
        const local = t - atrasoS * 1000;
        const progresso = (local % periodoMs) / periodoMs;
        const esperado = (Math.floor(agora / 200) + passoAtraso) % n;
        if (mostrado(offs, progresso) !== esperado) erradas += 1;
      }
    }
    return erradas;
  };
  for (const [nome, periodo] of [['wg-zzz', 3600], ['wg-balanco', 2800]]) {
    const offs = offsets(nome);
    assert.equal(offs.length - 1, periodo / 200, `${nome}: um quadro-chave por degrau`);
    offs.forEach((o, k) => assert.ok(o <= k / (offs.length - 1) + 1e-12, `${nome}: quadro ${k} nunca acima da fração exata (${o})`));
    assert.equal(falhas(offs, periodo, B.__tempoDaCena), 0, `${nome}: nenhum degrau trocado pelo anterior`);
    // O defeito corrigido: no início do degrau, com as percentagens de antes
    // (toFixed(3), arredondadas para CIMA às vezes), havia degraus trocados.
    const antes = offs.map((_, k) => Number(((k * 100) / (offs.length - 1)).toFixed(3)) / 100);
    assert.ok(falhas(antes, periodo, (a) => Math.floor(a / 200) * 200) > 0, `${nome}: o teste apanha o defeito antigo`);
  }
});

test('só anima o que se vê: mesas fora da vista da câmara (+ ~1 mesa) ficam sem animação', () => {
  const tela = { w: 1160, h: 805 };
  // 33 mesas (11 filas) no zoom de sempre, no topo: vê-se até y ≈ 2012 do
  // mundo; com a margem (730) animam as filas 0–3 — 12 mesas, não 33.
  const topo = B.__mesasAVista(33, { zoom: 0.4, x: 0, y: 0 }, tela);
  assert.equal(topo.length, 33);
  assert.deepEqual(topo.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [...Array(12).keys()]);
  const v = B.__vistaDoMundo({ zoom: 0.4, x: 0, y: 0 }, tela);
  assert.deepEqual(v, { x0: -940, x1: 2900 + 940, y0: -730, y1: 805 / 0.4 + 730 }, 'retângulo à vista em coordenadas do mundo, com a margem');
  // A meio da sala (câmara desceu 4000 do mundo): só as filas perto da vista.
  const meio = B.__mesasAVista(33, { zoom: 0.4, x: 0, y: -4000 * 0.4 }, tela);
  const filas = [...new Set(meio.map((vis, i) => (vis ? Math.floor(i / 3) : -1)).filter((f) => f >= 0))];
  assert.deepEqual(filas, [4, 5, 6, 7, 8], `filas animadas a meio: ${filas}`);
  // Aproximado numa mesa da direita: as outras colunas saem (a margem é ~1 mesa).
  const perto = B.__mesasAVista(9, { zoom: 1.5, x: -(1920 + 450) * 1.5 + 580, y: -310 * 1.5 }, tela);
  assert.ok(perto[2] && !perto[0], `coluna da esquerda fora com zoom alto: ${perto}`);
  // Fora de tudo (arrastada para longe): nada a animar.
  assert.ok(B.__mesasAVista(9, { zoom: 0.4, x: 5000, y: 0 }, tela).every((vis) => !vis));
  assert.deepEqual(B.__mesasAVista(0, { zoom: 0.4, x: 0, y: 0 }, tela), []);
  // CSS: fora de vista = animation:none (vence a regra da animação); o painel
  // guarda a lista dos animados à vista para o relógio.
  const css = B.__CSS_PAINEL;
  assert.ok(css.includes('.wg-svg .desk-module.wg-fora .wg-z,.wg-svg .desk-module.wg-fora .character.wg-balanca,.wg-svg .desk-module.wg-fora .character.wg-balanca-lateral,.wg-svg .desk-module.wg-fora .question-flag-pulse{animation:none}'),
    'fora de vista: zzz, balanço (vertical e lateral) e o pulso contínuo da bandeira de pergunta (flag-pulse da demo) param');
  assert.match(BUNDLE, /g\.querySelectorAll\('\.character\.wg-balanca, \.character\.wg-balanca-lateral, \.wg-z'\)/);
  assert.match(BUNDLE, /relogio\(\)\.definir\(elementos, cena\)/);
});

test('só anima o que se vê: quem fica DEBAIXO do celular (ou da barra por cima da sala) não se anima', () => {
  // A pintura a 5 Hz por baixo do cabeçalho translúcido do celular
  // (backdrop-filter) obrigava a refazer o desfoque a cada degrau: medido no
  // DSH 3080, painel aberto ~16% → ~6% de CPU com os tapados parados.
  const layout = B.__montarEscritorio(
    ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => pessoa(id)),
    wsDsh([w('w1', 'site', ['a', 'b']), w('w2', 'api', ['c', 'd']), w('w3', 'web', ['e', 'f'])]),
  );
  const camera = { zoom: 0.4, x: 0, y: 0 };
  // Tela 815×805 (barra lateral aberta); celular em 444–795 × 14–774 (px da tela).
  const celular = { esq: 444, dir: 795, topo: 14, fundo: 774 };
  const T = B.__lugaresTapados;
  // Caixa animada de cada lugar em px (zoom 0,4): a 16–107, b 106–197 (livres);
  // c 392–483 (o "zzz" já debaixo do celular), d 482–573, e 768–859 (tapados);
  // f 858–950 fica para lá do celular (e da tela).
  assert.deepEqual([...T(layout, camera, [celular])].sort(), ['c', 'd', 'e']);
  // Sem nada por cima, anima tudo.
  assert.deepEqual([...T(layout, camera, [])], []);
  assert.deepEqual([...T(layout, camera, null)], []);
  // A câmara conta: a sala 400 px para a direita põe a, b e c debaixo do celular.
  assert.deepEqual([...T(layout, { zoom: 0.4, x: 400, y: 0 }, [celular])].sort(), ['a', 'b', 'c']);
  const longe = T(layout, { zoom: 0.4, x: 0, y: -2000 }, [celular]);
  assert.equal(longe.size, 0, 'a sala arrastada para cima, fora do celular: ninguém tapado');
  // Caixas de LAYOUT (sem a entrada animada), em px da tela, com topo e fundo.
  const pai = { getBoundingClientRect: () => ({ left: 280, top: 43 }), clientLeft: 0, clientTop: 0 };
  assert.deepEqual(B.__caixaNaTela({ offsetLeft: 444, offsetTop: 14, offsetWidth: 351, offsetHeight: 760, offsetParent: pai }, { left: 280, top: 43 }),
    { esq: 444, dir: 795, topo: 14, fundo: 774 });
  assert.equal(B.__caixaNaTela({ offsetLeft: 0, offsetTop: 0, offsetWidth: 0, offsetHeight: 0, offsetParent: pai }, { left: 0, top: 0 }), null);
  // CSS: os tapados ficam sem animação (e fora da lista do relógio).
  assert.ok(B.__CSS_PAINEL.includes('.wg-svg .character-hit.wg-tapado .wg-z,.wg-svg .character-hit.wg-tapado .character.wg-balanca,.wg-svg .character-hit.wg-tapado .character.wg-balanca-lateral{animation:none}'));
  assert.match(BUNDLE, /if \(!tapado\) for \(const el of g\.querySelectorAll/);
});

test('portátil: junto ao peito, centrado na pessoa e abaixo do queixo (nunca cobre olhos nem boca)', () => {
  const { svg } = estados();
  // Busto: translate(cx−113, 147), 226×240, viewBox 264×280 (xMidYMax meet).
  // No Avataaars o maxilar acaba em y≈171 do viewBox (135,6 + 36 do Body).
  const escala = Math.min(226 / 264, 240 / 280);
  const queixo = 147 + (240 - 280 * escala) + 171 * escala; // ≈ 294
  const portateis = [...svg.matchAll(/<g class="character-laptop"><use href="#wg-laptop" x="([\d.-]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"\/><g style="color:#f4f7f8"><use href="#wg-icon-[\w-]+" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g)];
  assert.equal(portateis.length, 6, 'um portátil por pessoa sentada');
  portateis.forEach((m, i) => {
    const [x, y, larg, alt, gx, gy, lado] = m.slice(1, 8).map(Number);
    const cx = 112.5 + (i % 4) * 225;
    assert.equal(x + larg / 2, cx, 'centrado na pessoa');
    assert.ok(y >= queixo + 5, `tampo abaixo do queixo (${y} ≥ ${queixo.toFixed(1)} + 5) — e o balanço só sobe`);
    assert.ok(y <= queixo + 10, `colado ao peito: o tampo começa logo abaixo do queixo (${y})`);
    assert.ok(larg >= 152 && larg <= 180, 'do tamanho da pessoa (não encolhe)');
    assert.ok(y + alt <= 426, 'a base fica na mesa, atrás da ficha');
    assert.ok(Math.abs(gx + lado / 2 - cx) <= 1 && gy > y && gy + lado < y + alt, 'ícone do estado no ecrã');
  });
});

test('fundo: a parede do escritório é o assets/office-backdrop.svg byte a byte, entre a grelha e as mesas', () => {
  const fundo = BUNDLE.match(/const FUNDO_ESCRITORIO = `([\s\S]*?)`;/)[1];
  assert.equal(fundo, readFileSync(new URL('dsh-plugin/src/cenario-fundo.txt', RAIZ), 'utf8').trimEnd(), 'fonte');
  const standalone = readFileSync(new URL('assets/office-backdrop.svg', RAIZ), 'utf8');
  assert.ok(standalone.includes(fundo), 'o mesmo desenho do ficheiro standalone');
  assert.match(standalone, /viewBox="0 0 2900 360"/, 'faixa de 2900×360: a largura do mundo com 3 colunas');
  assert.deepEqual(idsDe(fundo), [], 'sem ids: nada colide com o sprite nem com outra instância');
  assert.match(fundo, /^<g class="wg-bg" pointer-events="none"/, 'não apanha cliques nem o arraste da câmara');

  const { svg } = cenario();
  assert.equal(svg.split('<g class="wg-bg" ').length - 1, 1, 'desenhada uma vez');
  const iFundo = svg.indexOf('<g class="wg-bg" ');
  assert.ok(svg.lastIndexOf('class="grid-line"', iFundo) > 0 && svg.indexOf('class="grid-line"', iFundo) === -1, 'depois da grelha');
  assert.ok(iFundo < svg.indexOf('<g class="desk-module"'), 'antes das mesas');
  assert.match(svg, /<rect x="0" y="0" width="2900" height="1100" fill="url\(#wg-floor\)"\/>/, 'o chão continua a cobrir o mundo (abaixo do rodapé)');
  for (const m of svg.matchAll(/class="grid-line" d="M(\d+) (\d+)(H|V)(\d+)"/g)) {
    assert.ok(Number(m[2]) >= 360, `grelha só no chão (${m[0]})`);
  }
});

const temPython = (() => { try { execFileSync('python3', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
test('fundo: o gerador (scripts/gerar-fundo-escritorio.py) reproduz EXATAMENTE o .svg, o .txt e o FUNDO_ESCRITORIO', { skip: temPython ? false : 'sem python3' }, () => {
  const gerador = fileURLToPath(new URL('scripts/gerar-fundo-escritorio.py', RAIZ));
  const saida = execFileSync('python3', [gerador, '--verificar', fileURLToPath(RAIZ)], { encoding: 'utf8' });
  assert.match(saida, /^igual: office-backdrop\.svg/, saida);
  const fonte = readFileSync(gerador, 'utf8');
  assert.ok(!/\/(?:Volumes|Users|home|tmp|var)\//.test(fonte), 'sem caminhos absolutos da máquina de quem o escreveu');
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

/* ---------- câmara ---------- */

test('câmara: sala pequena cabe inteira, encostada ao topo; sala grande mostra a largura no topo', () => {
  const tela = { w: 1160, h: 805 };
  // 1 fila: mundo 2900×1100 — a parede (360) entra no enquadramento inicial,
  // mas quem manda é a largura: as mesas ficam do tamanho de sempre (0,4).
  const pequena = B.__enquadramento(B.__tamanhoMundo(3), tela);
  assert.equal(pequena.zoom, 1160 / 2900, `a parede não esmaga as mesas (${pequena.zoom})`);
  assert.equal(pequena.y, 0, 'encostada ao topo: a parede cola à toolbar (o chão continua para baixo)');
  assert.equal(pequena.x, 0);

  // 3 filas (até 9 mesas): 310 + 3·730 + 60 = 2560 → 805/2560 ≈ 0,31, ainda
  // legível: cabe tudo, com a parede, centrada na horizontal.
  const media = B.__enquadramento(B.__tamanhoMundo(9), tela);
  assert.ok(media.zoom >= 0.3 && media.zoom === 805 / 2560, `3 filas cabem legíveis (${media.zoom})`);
  assert.equal(media.y, 0);
  assert.ok(Math.abs(media.x - (1160 - 2900 * media.zoom) / 2) < 1e-9, 'centrada na horizontal');

  // 33 mesas (o DSH real do Acer: 17 workspaces + 16 de "Sem workspace").
  const grande = B.__tamanhoMundo(33);
  const auto = B.__enquadramento(grande, tela);
  assert.equal(auto.zoom, 1160 / 2900, 'largura inteira (3 colunas) em vez de pessoas minúsculas');
  assert.equal(auto.y, 0, 'alinhada ao topo: os workspaces vêm primeiro');
  assert.equal(auto.x, 0);

  const tudo = B.__enquadramento(grande, tela, true);
  assert.equal(tudo.zoom, 0.12, '"Enquadrar" mostra o máximo possível da sala inteira');
  assert.equal(tudo.y, 0, 'se nem assim cabe, começa no topo');
});

test('fundo: o chão continua abaixo do mundo e o forro acima (o quadro fica sempre cheio)', () => {
  const { svg } = cenario();
  const S = B.__SANGRIA;
  assert.ok(svg.includes(`<rect class="wg-sangria" x="0" y="1100" width="2900" height="${S}" fill="url(#wg-floor)"/>`), 'o mesmo padrão do chão, sem costura');
  assert.ok(svg.includes(`<rect class="wg-sangria" x="-${S}" y="-${S}" width="${2900 + 2 * S}" height="${S}" fill="#efe6d4"/>`), 'a cor do forro, também por cima dos lados');
  assert.ok(svg.indexOf('class="wg-sangria') < svg.indexOf('<g class="wg-bg" '), 'por baixo da parede e das mesas');
  assert.ok(svg.lastIndexOf('class="wg-sangria') < svg.indexOf('<rect x="0" y="0" width="2900" height="1100" fill="url(#wg-floor)"/>'), 'tudo antes do chão do mundo');
  assert.ok(B.__CSS_PAINEL.includes('.wg-svg svg{display:block;width:auto;max-width:none;overflow:visible}'), 'o <svg> deixa-a ver-se');
});

test('fundo: parede e chão continuam para os LADOS com as mesmas faixas e ripas (geometria, sem tocar no desenho)', () => {
  const { svg } = cenario();
  const S = B.__SANGRIA;
  const W = 2900;
  const H = 1100;
  assert.ok(S >= 3000, `sangria de pelo menos 3000 para cada lado (${S})`);
  // Dimensionada pelo PIOR caso do "Enquadrar": a sala centrada numa tela de
  // LARGURA_MAX_TELA (8K) ao zoom mínimo — nunca a faixa lisa da tela.
  assert.ok(S >= (B.__LARGURA_MAX_TELA / B.__ZOOM_MIN_ENQUADRAR - W) / 2, `cobre ${B.__LARGURA_MAX_TELA} px a ${B.__ZOOM_MIN_ENQUADRAR} (${S})`);
  // O caso que falhava com 8000: ultrawide (tela 3160×1340) com a sala de 33 mesas.
  const mundo33 = B.__tamanhoMundo(33);
  assert.equal(mundo33.altura, 8400);
  const cam33 = B.__enquadramento(mundo33, { w: 3160, h: 1340 }, true);
  assert.ok(cam33.x > 8000 * cam33.zoom, `a margem (${cam33.x.toFixed(0)} px) passava a sangria antiga (${(8000 * cam33.zoom).toFixed(0)} px)`);
  assert.ok(S * cam33.zoom >= cam33.x, 'a sangria de agora cobre-a');
  const cam12 = B.__enquadramento(mundo33, { w: 2560 - 280, h: 250 }, true);
  assert.equal(cam12.zoom, B.__ZOOM_MIN_ENQUADRAR, 'ao zoom mínimo');
  assert.ok(S * cam12.zoom >= cam12.x, 'janela de 2560 px com a barra do DSH, a 12%: coberta');
  const num = (v) => (v === undefined ? undefined : Number(v));
  const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  // Elementos de um grupo, por ordem: faixas (rect), traços horizontais e ripas (path).
  const elementos = (grupo) => [...grupo.matchAll(/<(rect|path)\s[^>]*\/>/g)].map((m) => ({ tipo: m[1], a: attrs(m[0]) }));

  // O desenho: o grupo wg-bg-parede do FUNDO_ESCRITORIO (intocado).
  const fundo = readFileSync(new URL('dsh-plugin/src/cenario-fundo.txt', RAIZ), 'utf8');
  const parede = fundo.match(/<g class="wg-bg-parede">([\s\S]*?)<\/g>/)[1];
  const doFundo = elementos(parede).map(({ tipo, a }) => {
    if (tipo === 'rect') {
      assert.equal(a.width, String(W), 'faixa a toda a largura do mundo');
      return { k: 'faixa', y: num(a.y) ?? 0, h: num(a.height), fill: a.fill, opacity: a.opacity };
    }
    const hs = [...a.d.matchAll(/M(-?[\d.]+) (-?[\d.]+)H(-?[\d.]+)/g)];
    if (hs.length) {
      hs.forEach((m) => assert.deepEqual([num(m[1]), num(m[3])], [0, W]));
      return { k: 'traco', ys: hs.map((m) => num(m[2])), stroke: a.stroke, sw: a['stroke-width'] };
    }
    const vs = [...a.d.matchAll(/M(-?[\d.]+) (-?[\d.]+)V(-?[\d.]+)/g)].map((m) => [num(m[1]), num(m[2]), num(m[3])]);
    const passo = vs[1][0] - vs[0][0];
    vs.forEach(([x, y0, y1], i) => { assert.equal(x, vs[0][0] + i * passo, 'ripas a passo constante'); assert.deepEqual([y0, y1], [vs[0][1], vs[0][2]]); });
    return { k: 'ripas', fase: vs[0][0] % passo, passo, y0: vs[0][1], y1: vs[0][2], stroke: a.stroke, sw: a['stroke-width'] };
  });
  assert.ok(doFundo.length >= 15, 'o grupo da parede foi lido');

  // Padrões da sangria (fase e altura absolutas, userSpaceOnUse).
  const padroes = Object.fromEntries([...svg.matchAll(/<pattern id="(wg-forro|wg-ripado)"([^>]*)>([\s\S]*?)<\/pattern>/g)].map((m) => {
    const a = attrs(m[2]);
    assert.equal(a.patternUnits, 'userSpaceOnUse');
    const py = num(a.y) ?? 0;
    const linhas = [...m[3].matchAll(/<path d="M(-?[\d.]+) (-?[\d.]+)V(-?[\d.]+)" stroke="([^"]+)" stroke-width="([^"]+)"/g)]
      .map((l) => ({ fase: num(l[1]), y0: py + num(l[2]), y1: py + num(l[3]), stroke: l[4], sw: l[5] }));
    return [m[1], { passo: num(a.width), y: py, h: num(a.height), linhas }];
  }));

  // Cada lado: a MESMA sequência de faixas/traços; as ripas viram um padrão com a mesma fase.
  const grupos = [...svg.matchAll(/<g class="wg-sangria wg-sangria-parede"[^>]*>([\s\S]*?)<\/g>/g)].map((m) => m[1]);
  assert.equal(grupos.length, 2, 'esquerda e direita');
  for (const [lado, x0] of [[grupos[0], -S], [grupos[1], W]]) {
    const els = elementos(lado);
    let i = 0;
    for (let j = 0; j < doFundo.length; j += 1) {
      const f = doFundo[j];
      const e = els[i];
      assert.ok(e, `falta o equivalente de ${JSON.stringify(f)}`);
      if (f.k === 'faixa') {
        assert.deepEqual([num(e.a.x), num(e.a.y), num(e.a.width), num(e.a.height), e.a.fill, e.a.opacity], [x0, f.y, S, f.h, f.fill, f.opacity], `faixa y=${f.y}`);
      } else if (f.k === 'traco') {
        const hs = [...e.a.d.matchAll(/M(-?[\d.]+) (-?[\d.]+)H(-?[\d.]+)/g)];
        assert.deepEqual(hs.map((m) => num(m[2])), f.ys, 'traços às mesmas alturas');
        hs.forEach((m) => assert.deepEqual([num(m[1]), num(m[3])], [x0, x0 + S]));
        assert.deepEqual([e.a.stroke, e.a['stroke-width']], [f.stroke, f.sw]);
      } else {
        // Ripas (uma ou mais famílias seguidas) → um rect com o padrão.
        const familias = [f];
        while (doFundo[j + 1] && doFundo[j + 1].k === 'ripas') { j += 1; familias.push(doFundo[j]); }
        const id = (e.a.fill.match(/^url\(#([\w-]+)\)$/) || [])[1];
        const p = padroes[id];
        assert.ok(p, `ripas → padrão (${e.a.fill})`);
        assert.equal(num(e.a.x), x0);
        assert.equal(num(e.a.width), S);
        assert.ok(num(e.a.y) <= p.y && num(e.a.y) + num(e.a.height) >= p.y + p.h - 1e-9, 'o rect cobre a altura do padrão');
        assert.deepEqual(p.linhas.map((l) => [l.fase % p.passo, l.y0, l.y1, l.stroke, l.sw]),
          familias.map((r) => { assert.equal(r.passo, p.passo, 'o mesmo passo'); return [r.fase, r.y0, r.y1, r.stroke, r.sw]; }), 'mesma fase, alturas e traço');
      }
      i += 1;
    }
    assert.equal(i, els.length, 'nada a mais');
  }

  // Cobertura: nenhum ponto fora do mundo (até 3000 para cada lado) fica sem pintura.
  const pintura = [...svg.matchAll(/<rect class="wg-sangria" ([^>]*)\/>/g)].map((m) => attrs(m[1]))
    .concat(grupos.map((g) => attrs(g.match(/<rect [^>]*\/>/)[0])))
    .map((a) => ({ x: num(a.x), y: num(a.y) ?? 0, w: num(a.width), h: num(a.height) }));
  for (const x of [-3000, -1200, -1, W + 1, W + 1200, W + 3000]) {
    for (const y of [-3000, -1, 0, 23, 250, 359, 360, 800, H, H + 3000]) {
      assert.ok(pintura.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h), `(${x}, ${y}) pintado`);
    }
  }
  for (const x of [-3000, 1450, W + 3000]) {
    for (const y of [-3000, -1, H, H + 3000]) {
      assert.ok(pintura.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h), `(${x}, ${y}) pintado`);
    }
  }
  // O desenho do FUNDO_ESCRITORIO não mudou (continua o assets/office-backdrop.svg).
  assert.ok(readFileSync(new URL('assets/office-backdrop.svg', RAIZ), 'utf8').includes(fundo.trimEnd()));
});

test('toolbar e painel estreito: botões sem quebra, contagem com reticências, celular sobre a barra, filtros como diálogo', () => {
  const css = B.__CSS_PAINEL;
  assert.match(css, /\.wg-botao\{[^}]*white-space:nowrap;flex:none\}/, '"＋ Zoom" nunca parte em duas linhas');
  assert.match(css, /\.wg-toolbar \.wg-conta\{[^}]*min-width:0;overflow:hidden;text-overflow:ellipsis\}/, 'a contagem encolhe com reticências');
  assert.ok(css.includes('container:wg-painel/inline-size'), 'as larguras contam pelo PAINEL (a barra do DSH abre e fecha)');
  assert.ok(css.includes('@container wg-painel (max-width:1000px){.wg-toolbar .wg-escondidas-mais{display:none}}'), 'chip curto: "6 escondidas"');
  assert.ok(css.includes('@container wg-painel (max-width:780px){.wg-toolbar .wg-conta{display:none}'));
  // Painel estreito: o celular flutua POR CIMA da barra lateral (a sala não fica tapada nem minúscula)…
  assert.ok(css.includes('@container wg-painel (max-width:920px){.wg-palco{z-index:4}.wg-telefone{right:calc(18px - var(--wg-sb,345px))}.wg-com-telefone>.wg-sidebar>*{visibility:hidden}}'));
  assert.ok(css.includes('.wg-painel{--wg-sb:310px}') && css.includes('.wg-painel{--wg-sb:375px}'), '--wg-sb acompanha a largura da barra');
  // …e a regra dos ecrãs ≤ 800 px (barra por cima da sala) vem depois e ganha:
  // o celular fica à direita, POR CIMA da barra (o palco ocupa a largura toda;
  // sem z-index no palco, o celular — z 6 — passa por cima da barra — z 3),
  // com o conteúdo da barra escondido por baixo; a sala à esquerda fica livre.
  const i800 = css.indexOf('@media(max-width:800px){.wg-palco{z-index:auto}.wg-telefone{right:18px}}');
  assert.ok(i800 > css.indexOf('@container wg-painel (max-width:920px)'), 'regra ≤ 800 px depois da do painel estreito');
  assert.ok(!/@media\(max-width:800px\)\{[^}]*\.wg-telefone\{[^}]*left:12px/.test(css), 'o celular já não vai para a esquerda (sobravam ~40 px de sala)');
  assert.ok(!css.includes('.wg-com-telefone>.wg-sidebar>*{visibility:visible}'), 'o conteúdo da barra fica escondido debaixo do celular');
  assert.ok(css.includes('.wg-svg .seat:focus{outline:none}'), 'sem o contorno por omissão do <g> a atravessar a cara (o foco vê-se no cartão)');
  assert.match(css, /\.wg-svg \.seat:focus-visible \.seat-card\{stroke:/, 'o foco pelo teclado continua visível no cartão');
  assert.ok(css.includes('.wg-interruptor,.wg-interruptor::after,.wg-escondidas,.wg-filtros-numero{corner-shape:round}'), 'interruptores redondos com o superellipse do DSH');
  assert.ok(BUNDLE.includes("'aria-haspopup': 'dialog'") && BUNDLE.includes("role: 'dialog', 'aria-label': 'Filtros da sala'"), 'diálogo com interruptores, não um menu');
  assert.ok(!BUNDLE.includes("'💬 Conversa'"), 'sem emoji a cores no botão da barra lateral (ícone de traço)');
  assert.equal(B.__textoEscondidas({ total: 6 }), '6 escondidas pelos filtros');
});

/* ---------- REGRA DE OURO: a arte é a da demo ---------- */

test('REGRA DE OURO: cada corpo embutido é byte a byte o SVG da demo (expressions/ e sleeping/)', () => {
  const bloco = BUNDLE.slice(BUNDLE.indexOf('const EXPR_AVATARS = {'));
  let conferidos = 0;
  const aDormir = [];
  for (const m of bloco.matchAll(/\n\s{6}(\w+): \{\n((?:\s{8}\w+: \{ vb: '[^']+', corpo: `[^`]*` \},\n)+)/g)) {
    for (const e of m[2].matchAll(/\s{8}(\w+): \{ vb: '([^']+)', corpo: `([^`]*)` \}/g)) {
      // O preset 'sleeping' (olhos fechados, quem está Disponível) vem de
      // assets/avatars/sleeping/<id>.svg; os restantes 14 (os presets TODOS da
      // biblioteca, para o reator de variantes disparar qualquer cara) vêm de
      // assets/avatars/expressions/<id>/<preset>.svg.
      const ficheiro = e[1] === 'sleeping'
        ? new URL(`assets/avatars/sleeping/${m[1]}.svg`, RAIZ)
        : new URL(`assets/avatars/expressions/${m[1]}/${e[1]}.svg`, RAIZ);
      assert.ok(existsSync(ficheiro), `${m[1]}/${e[1]}.svg existe`);
      const original = readFileSync(ficheiro, 'utf8');
      assert.ok(original.includes(e[3]) && original.includes(`viewBox="${e[2]}"`), `${m[1]}/${e[1]} igual ao asset`);
      if (e[1] === 'sleeping') aDormir.push(m[1]);
      conferidos += 1;
    }
  }
  assert.equal(aDormir.length, 8, `todas as identidades dormem: ${aDormir.join(', ')}`);
  assert.equal(conferidos, 120, '8 identidades × 15 presets embutidos (os 14 da biblioteca + sleeping)');
});

test('REGRA DE OURO: o mobiliário embutido é o furniture.svg da demo (ids com prefixo wg-)', () => {
  const mobiliario = BUNDLE.match(/const MOBILIARIO = `([\s\S]*?)`;/)[1];
  const original = readFileSync(new URL('assets/furniture.svg', RAIZ), 'utf8');
  const simbolos = [...mobiliario.matchAll(/<symbol id="wg-([^"]+)"[\s\S]*?<\/symbol>/g)];
  assert.ok(simbolos.length >= 20);
  for (const s of simbolos) assert.ok(original.includes(s[0].replace(`id="wg-${s[1]}"`, `id="${s[1]}"`)), s[1]);
});

test('auto-verificação e ganchos de teste expostos', () => {
  for (const nome of ['__verificarRefs', '__trace', '__extrairSuperficie', '__montarEscritorio', '__spriteDoPainel', '__renderOffice',
    '__modeloSidebar', '__normalizarFiltros', '__lerFiltros', '__guardarFiltros', '__criarNucleo',
    '__criarRelogioCena', '__mesasAVista', '__vistaDoMundo', '__zonaVisivel', '__caixaDeLayout']) {
    assert.equal(typeof B[nome], 'function', nome);
  }
});

/* ---------- nomes: identidade derivada do id ---------- */

test('nomes: nome e boneco DERIVADOS do id — a mesma conversa é a mesma pessoa em qualquer browser ou perfil', () => {
  const id = 'session-6fc98096-ea38-4960-b73b-d40effbb8a04';
  const a = B.__identidadeDe(id);
  assert.deepEqual(B.__identidadeDe(id), a, 'determinística');
  assert.ok(B.__NOMES.includes(a.name), `nome da lista da demo (${a.name})`);
  assert.ok(['rui', 'bia', 'lia', 'pesquisa', 'codigo', 'testes', 'alex', 'maya'].includes(a.avatar), `identidade real (${a.avatar})`);
  assert.ok(!BUNDLE.includes('Math.random('), 'nada de sorteio');
  // Dois "browsers" (armazenamentos vazios diferentes): a mesma pessoa.
  const antes = globalThis.window.localStorage;
  const armazenamento = () => {
    const d = {};
    return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } };
  };
  try {
    const um = armazenamento();
    globalThis.window.localStorage = um;
    const p1 = B.__criarAssociador().para(id);
    const dois = armazenamento();
    globalThis.window.localStorage = dois;
    const p2 = B.__criarAssociador().para(id);
    assert.deepEqual([p1.name, p1.avatar], [p2.name, p2.avatar], 'o mesmo nome e o mesmo boneco nos dois');
    assert.deepEqual([p1.name, p1.avatar], [a.name, a.avatar]);
    assert.equal(JSON.parse(um.d['dsh-work-game:assoc'])[id].v, 3, 'guardada (cache) com a versão');
    // Uma associação ANTIGA (sorteada) é trocada uma vez pela derivada…
    const velho = armazenamento();
    const outroNome = B.__NOMES.find((n) => n !== a.name);
    velho.d['dsh-work-game:assoc'] = JSON.stringify({ [id]: { name: outroNome, avatar: 'maya', style: { id: 'azul' } } });
    globalThis.window.localStorage = velho;
    const migrada = B.__criarAssociador();
    assert.equal(migrada.para(id).name, a.name, 'a sorteada dá lugar à derivada');
    // …e a derivada guardada fica (O(1), sem voltar a derivar nem a perguntar pelos homónimos).
    assert.equal(migrada.para(id, () => { throw new Error('não devia perguntar'); }).name, a.name);
  } finally {
    globalThis.window.localStorage = antes;
  }
  // Desempate de homónimos (fixo): o nome preferido já é de outra pessoa →
  // o seguinte da lista DO GÊNERO (a sondagem nunca sai do gênero do boneco).
  const preferido = B.__identidadeDe('x').name;
  let outro = null;
  for (let i = 0; i < 5000 && !outro; i += 1) if (B.__identidadeDe(`y${i}`).name === preferido) outro = `y${i}`;
  assert.ok(outro, 'há ids com o mesmo nome preferido');
  const comDesempate = B.__identidadeDe(outro, (n) => n === preferido);
  const genero = B.__GENERO_AVATAR[comDesempate.avatar];
  const listaGenero = B.__NOMES.filter((n) => {
    const g = B.__GENERO_NOME[n] || 'any';
    return g === genero || g === 'any';
  });
  const k = listaGenero.indexOf(preferido);
  assert.equal(comDesempate.name, listaGenero[(k + 1) % listaGenero.length], 'sondagem linear: o seguinte da lista do gênero');
  assert.equal(comDesempate.avatar, B.__identidadeDe(outro).avatar, 'o boneco não muda com o desempate');
  // No estado: a 2.ª conversa com o mesmo nome preferido não fica homónima.
  let e = B.__createOfficeState({});
  e = B.__applyEvent(e, { type: 'session/added', sessionId: 'x' });
  e = B.__applyEvent(e, { type: 'session/added', sessionId: outro });
  assert.notEqual(e.people.get('x').name, e.people.get(outro).name, 'sem homónimos na sala');
});

test('nomes: o gênero do boneco bate SEMPRE com o gênero do nome (regra 2026-09-29)', () => {
  assert.deepEqual({ ...B.__GENERO_AVATAR }, {
    rui: 'm', bia: 'f', lia: 'f', pesquisa: 'm', codigo: 'm', testes: 'f', alex: 'm', maya: 'f',
  }, 'tabela de gênero dos 8 bonecos nomeados');
  for (let i = 0; i < 600; i += 1) {
    const a = B.__identidadeDe(`session-g-${i}`);
    const gAvatar = B.__GENERO_AVATAR[a.avatar];
    const gNome = B.__GENERO_NOME[a.name] || 'any';
    assert.ok(['f', 'm'].includes(gAvatar), `session-g-${i}: boneco ${a.avatar} sem gênero`);
    assert.ok(gNome === gAvatar || gNome === 'any',
      `session-g-${i}: "${a.name}" (${gNome}) com boneco ${a.avatar} (${gAvatar}) — gêneros não batem`);
  }
  // Cobertura: cada gênero tem nomes e bonecos de sobra.
  for (const g of ['f', 'm']) {
    const nomes = B.__NOMES.filter((n) => { const gn = B.__GENERO_NOME[n] || 'any'; return gn === g || gn === 'any'; });
    assert.ok(nomes.length >= 20, `poucos nomes para o gênero ${g}: ${nomes.length}`);
    assert.ok(Object.values(B.__GENERO_AVATAR).includes(g), `sem bonecos para o gênero ${g}`);
  }
});

/* ---------- estado: buckets de tokens e atividade por pessoa ---------- */

const PRECOS_TESTE = { 'deepseek-chat': { input: 2.7e-7, output: 1.1e-6, cacheRead: 2.7e-8, cacheWrite: 2.7e-7 } };
function escritorio(eventos, precos = PRECOS_TESTE) {
  let e = B.__createOfficeState(precos);
  for (const ev of eventos) e = B.__applyEvent(e, ev);
  return e;
}
const vistaDe = (e, id) => B.__officeView(e).people[id];

test('estado: os 4 buckets reais de tokens acumulam por pessoa (null até ao 1.º usage)', () => {
  const base = [{ type: 'session/added', sessionId: 'a', model: 'deepseek-chat' }];
  assert.equal(vistaDe(escritorio(base), 'a').tokens, null, 'sem usage: "—", nunca zero');
  const e = escritorio([
    ...base,
    // 1.º vislumbre = o acumulado do DSH; depois só deltas (a ponte já difa).
    { type: 'usage', sessionId: 'a', model: 'deepseek-chat', uncachedInput: 1000, output: 200, cacheRead: 5000, cacheWrite: 0 },
    { type: 'usage', sessionId: 'a', model: 'deepseek-chat', uncachedInput: 10, output: 20, cacheRead: 0, cacheWrite: 7 },
    { type: 'usage', sessionId: 'a', uncachedInput: 'lixo', output: null },
  ]);
  assert.deepEqual(vistaDe(e, 'a').tokens, { uncachedInput: 1010, output: 220, cacheRead: 5000, cacheWrite: 7 });
  // Um modelo sem preço não apaga os tokens (só o custo fica "—").
  const semPreco = escritorio([...base, { type: 'usage', sessionId: 'a', model: 'modelo-x', uncachedInput: 5, output: 5, cacheRead: 0, cacheWrite: 0 }]);
  assert.deepEqual(vistaDe(semPreco, 'a').tokens, { uncachedInput: 5, output: 5, cacheRead: 0, cacheWrite: 0 });
  assert.equal(vistaDe(semPreco, 'a').cost, null);
});

test('estado: a atividade regista só eventos reais (transições), com a hora de chegada', () => {
  const e = escritorio([
    { type: 'session/added', sessionId: 'a', model: 'deepseek-chat', title: null, at: 1 },
    { type: 'session/added', sessionId: 'f', subagent: true, parentId: 'a', at: 2 },
    { type: 'status', sessionId: 'a', status: 'idle', at: 3 }, // 1.º status parado: não é evento
    { type: 'status', sessionId: 'a', status: 'idle', at: 4 }, // sem mudança: nada
    { type: 'status', sessionId: 'a', status: 'running', at: 5 },
    { type: 'model', sessionId: 'a', model: 'deepseek-chat', contextWindow: 128000, at: 6 }, // o mesmo: nada
    { type: 'model', sessionId: 'a', model: 'deepseek-reasoner', at: 7 },
    { type: 'subagent/start', sessionId: 'a', childId: 'f', runId: 'f', at: 8 },
    { type: 'ctx', sessionId: 'a', used: 150000, window: 256000, at: 9 },
    { type: 'ctx', sessionId: 'a', used: 210000, window: 256000, at: 10 },
    { type: 'subagent/end', sessionId: 'a', childId: 'f', runId: 'f', at: 11 },
    { type: 'session/meta', sessionId: 'a', title: 'Corrigir o login', at: 12 },
    { type: 'usage', sessionId: 'a', uncachedInput: 1, output: 1, cacheRead: 0, cacheWrite: 0, at: 13 }, // usage não polui
    { type: 'status', sessionId: 'a', status: 'idle', at: 14 },
  ]);
  const nomeFilho = vistaDe(e, 'f').name;
  assert.deepEqual(vistaDe(e, 'a').activity, [
    { at: 5, tipo: 'trabalho-inicio', texto: 'Começou a trabalhar' },
    { at: 7, tipo: 'modelo', texto: 'Trocou de modelo: deepseek-chat → deepseek-reasoner' },
    { at: 8, tipo: 'subagente-inicio', texto: `Delegou a um subagente (${nomeFilho})` },
    { at: 10, tipo: 'contexto-alto', texto: 'O contexto passou de 200k tokens' },
    { at: 11, tipo: 'subagente-fim', texto: `Subagente terminou (${nomeFilho})` },
    { at: 12, tipo: 'titulo', texto: 'A conversa ganhou título: Corrigir o login' },
    { at: 14, tipo: 'trabalho-fim', texto: 'Terminou de trabalhar' },
  ]);
  // Quem já corria quando o painel abriu: "Já estava a trabalhar" (sem inventar o início).
  const ja = escritorio([{ type: 'session/added', sessionId: 'b' }, { type: 'status', sessionId: 'b', status: 'running', at: 50 }]);
  assert.deepEqual(vistaDe(ja, 'b').activity, [{ at: 50, tipo: 'trabalho-inicio', texto: 'Já estava a trabalhar' }]);
  // Eventos de fio (quando existirem) também entram; sem hora → null, nunca inventada.
  const fio = escritorio([
    { type: 'session/added', sessionId: 'c' },
    { type: 'question', sessionId: 'c', text: 'Posso apagar?' },
    { type: 'question/answered', sessionId: 'c' },
    { type: 'turn/end', sessionId: 'c', kind: 'completed' },
    { type: 'turn/end', sessionId: 'c', kind: 'aborted' },
  ]);
  assert.deepEqual(vistaDe(fio, 'c').activity.map((a) => [a.at, a.tipo, a.texto]), [
    [null, 'pergunta', 'Fez uma pergunta: Posso apagar?'],
    [null, 'pergunta-respondida', 'Pergunta respondida'],
    [null, 'turno-concluido', 'Turno concluído'],
    [null, 'turno-interrompido', 'Turno interrompido'],
  ]);
});

test('estado: a linha do tempo guarda só os últimos 50 eventos por pessoa', () => {
  const eventos = [{ type: 'session/added', sessionId: 'a' }];
  for (let i = 0; i < 60; i += 1) eventos.push({ type: 'tool', sessionId: 'a', phase: 'call', name: `t${i}`, at: i });
  const atividade = vistaDe(escritorio(eventos), 'a').activity;
  assert.equal(B.__MAX_ATIVIDADE, 50);
  assert.equal(atividade.length, 50);
  assert.equal(atividade[0].texto, 'Usou a ferramenta t10', 'os mais antigos saem primeiro');
  assert.equal(atividade[49].texto, 'Usou a ferramenta t59');
});

/* ---------- filtros da sala ---------- */

const sentadas = (l) => l.modules.flatMap((m) => m.seats).filter((s) => typeof s === 'string');
const salaFiltros = () => ({
  pessoas: [
    pessoa('a', { running: true, status: 'working' }),
    pessoa('b'),
    pessoa('arq'),
    pessoa('vazia', { blank: true }),
    pessoa('orfa'),
    pessoa('orfa-arq'),
    pessoa('sub', { subagent: true, parentId: 'a' }),
  ],
  ws: wsDsh([w('w1', 'site', ['a', 'b', 'arq', 'vazia']), w('w2', 'vazio', [])], ['arq', 'orfa-arq']),
});

test('filtros: por omissão — arquivadas escondidas e contadas; workspaces abertos mantêm as pessoas sem ação', () => {
  assert.deepEqual({ ...B.__FILTROS_PADRAO }, {
    mostrarArquivadas: false, mostrarSemWorkspace: true, soTrabalhando: false, mostrarEmBranco: false, mostrarAbertos: true,
  });
  const { pessoas, ws } = salaFiltros();
  for (const l of [B.__montarEscritorio(pessoas, ws), B.__montarEscritorio(pessoas, ws, {}), B.__montarEscritorio(pessoas, ws, B.__FILTROS_PADRAO)]) {
    // w1 está aberto (a, b e vazia presentes e não arquivadas): a em branco
    // fica sentada ("Manter workspaces abertos sem ação"); a arquivada sai.
    assert.deepEqual(sentadas(l), ['a', 'b', 'vazia', 'orfa']);
    assert.deepEqual(l.escondidas, { total: 2, arquivadas: 2, emBranco: 0, semWorkspace: 0, paradas: 0, fechados: 0, arquivoDesconhecido: 0 }, 'subagentes não contam: nunca têm lugar próprio');
    assert.deepEqual([...l.arquivadas], []);
  }
  // Sem esse filtro: o comportamento antigo exato (a barra do DSH).
  const antigo = B.__montarEscritorio(pessoas, ws, { mostrarAbertos: false });
  assert.deepEqual(sentadas(antigo), ['a', 'b', 'orfa']);
  assert.deepEqual(antigo.escondidas, { total: 3, arquivadas: 2, emBranco: 1, semWorkspace: 0, paradas: 0, fechados: 0, arquivoDesconhecido: 0 });
  assert.equal(B.__textoEscondidas({ total: 3 }), '3 escondidas pelos filtros');
  assert.equal(B.__textoEscondidas({ total: 1 }), '1 escondida pelos filtros');
  assert.equal(B.__detalheEscondidas({ total: 3, arquivadas: 2, emBranco: 1, semWorkspace: 0, paradas: 0 }), '2 arquivadas · 1 em branco');
});

test('filtros: "Mostrar arquivadas" senta-as no seu workspace (ou em "Sem workspace") com a ficha "Arquivada" em cinzento', () => {
  const { pessoas, ws } = salaFiltros();
  // mostrarAbertos desligado para fixar o recorte clássico das mesas.
  const l = B.__montarEscritorio(pessoas, ws, { mostrarArquivadas: true, mostrarAbertos: false });
  assert.deepEqual(l.modules.map((m) => [m.teamId, m.seats]), [
    ['ws:w1', ['a', 'b', 'arq', null]],
    ['ws:w2', [null, null, null, null]],
    ['sem-workspace', ['orfa', 'orfa-arq', null, null]],
  ]);
  assert.deepEqual([...l.arquivadas].sort(), ['arq', 'orfa-arq']);
  assert.deepEqual(l.escondidas, { total: 1, arquivadas: 0, emBranco: 1, semWorkspace: 0, paradas: 0, fechados: 0, arquivoDesconhecido: 0 });
  const people = Object.fromEntries(pessoas.map((p) => [p.id, p]));
  const svg = B.__renderOffice({ people, layout: l });
  const ficha = (id) => svg.split('<g class="seat').find((t) => t.includes(`data-session-id="${id}">`) && t.includes('seat-card-status'));
  assert.match(svg, /<g class="seat arquivada" role="button"[^>]*aria-label="Abrir Parq · Conversa arq, Disponível, arquivada"/);
  assert.match(ficha('arq'), /<circle[^>]*fill="#919ea4"\/><text class="seat-card-status"[^>]*fill="#919ea4">Arquivada<\/text>/, 'estado em cinzento: "Arquivada"');
  assert.match(ficha('b'), /fill="#9aa6ad">Disponível<\/text>/, 'quem não está arquivado mantém o estado');
  assert.equal((svg.match(/>Arquivada</g) || []).length, 2, 'só as arquivadas levam a marca');
  assert.ok(B.__CSS_PAINEL.includes('.wg-svg .seat.arquivada .seat-card-name{fill:#7d8a93}'));
});

test('filtros: sem "Sem workspace" a mesa das órfãs sai e elas contam como escondidas', () => {
  const { pessoas, ws } = salaFiltros();
  // mostrarAbertos desligado: o recorte clássico (vazia em branco escondida).
  const l = B.__montarEscritorio(pessoas, ws, { mostrarSemWorkspace: false, mostrarAbertos: false });
  assert.deepEqual(sentadas(l), ['a', 'b']);
  assert.ok(!l.equipas.has('sem-workspace'), 'a mesa "Sem workspace" não se monta');
  assert.deepEqual(l.escondidas, { total: 4, arquivadas: 2, emBranco: 1, semWorkspace: 1, paradas: 0, fechados: 0, arquivoDesconhecido: 0 });
  // Delegação de um líder sem workspace também sai (é da mesma mesa).
  const deleg = [
    pessoa('lider', { running: true, subagents: 1 }),
    pessoa('filho', { subagent: true, parentId: 'lider', running: true }),
  ];
  assert.deepEqual(B.__montarEscritorio(deleg, wsDsh([]), { mostrarSemWorkspace: false }).modules, []);
  assert.equal(B.__montarEscritorio(deleg, wsDsh([])).modules.filter((m) => m.kind === 'delegation').length, 1);
});

test('filtros: "Só quem está a trabalhar" esconde quem está parado e as mesas sem ninguém a trabalhar', () => {
  const { pessoas, ws } = salaFiltros();
  // mostrarAbertos desligado: o recorte clássico (w1 só com quem trabalha).
  const l = B.__montarEscritorio(pessoas, ws, { soTrabalhando: true, mostrarAbertos: false });
  assert.deepEqual(l.modules.map((m) => [m.teamId, m.seats]), [['ws:w1', ['a', null, null, null]]],
    'nem o workspace vazio nem "Sem workspace": lugares "livres" de gente escondida convidariam a recrutar');
  assert.deepEqual(l.escondidas, { total: 5, arquivadas: 2, emBranco: 1, semWorkspace: 0, paradas: 2, fechados: 1, arquivoDesconhecido: 0 },
    'o workspace vazio (w2) sai da sala e conta como FECHADO');
  // Ferramenta ou turno a correr contam como trabalho; a delegação fica inteira.
  const deleg = [
    pessoa('lider', { running: true, status: 'working', subagents: 1 }),
    pessoa('filho', { subagent: true, parentId: 'lider', running: true }),
    pessoa('ferr', { status: 'tool' }),
  ];
  const d = B.__montarEscritorio(deleg, wsDsh([w('w1', 'site', ['lider', 'ferr'])]), { soTrabalhando: true });
  assert.deepEqual(d.modules.map((m) => [m.kind, m.seats]), [
    ['main', [{ reservado: 'lider' }, 'ferr', null, null]],
    ['delegation', ['lider', 'filho', null, null]],
  ]);
  // Ninguém a trabalhar: a cena diz que são os filtros, não "à espera de telemetria"
  // (com mostrarAbertos — o padrão — o workspace aberto mantinha-se na sala).
  const vazia = B.__montarEscritorio([pessoa('p')], wsDsh([w('w1', 'site', ['p'])]), { soTrabalhando: true, mostrarAbertos: false });
  assert.equal(vazia.modules.length, 0);
  const svg = B.__renderOffice({ people: { p: pessoa('p') }, layout: vazia });
  assert.ok(svg.includes('Os filtros escondem todas as conversas') && !svg.includes('à espera de telemetria'));
});

test('filtros: "Mostrar conversas em branco" senta as conversas novas ainda sem mensagens', () => {
  const { pessoas, ws } = salaFiltros();
  const l = B.__montarEscritorio(pessoas, ws, { mostrarEmBranco: true });
  assert.deepEqual(sentadas(l), ['a', 'b', 'vazia', 'orfa']);
  assert.deepEqual(l.escondidas, { total: 2, arquivadas: 2, emBranco: 0, semWorkspace: 0, paradas: 0, fechados: 0, arquivoDesconhecido: 0 });
  // Combinações: tudo à vista.
  const tudo = B.__montarEscritorio(pessoas, ws, { mostrarEmBranco: true, mostrarArquivadas: true });
  assert.equal(tudo.escondidas.total, 0);
  assert.deepEqual(sentadas(tudo).sort(), ['a', 'arq', 'b', 'orfa', 'orfa-arq', 'vazia']);
});

test('filtros: normalizar e persistir em localStorage (dsh-work-game:filtros), tolerando falhas', () => {
  assert.deepEqual(B.__normalizarFiltros({ mostrarArquivadas: true, soTrabalhando: 'sim', lixo: 1 }), {
    mostrarArquivadas: true, mostrarSemWorkspace: true, soTrabalhando: false, mostrarEmBranco: false, mostrarAbertos: true,
  }, 'só booleanos conhecidos; o resto cai no padrão');
  assert.deepEqual(B.__normalizarFiltros(null), { ...B.__FILTROS_PADRAO });
  assert.deepEqual(B.__FILTROS_UI.map((f) => f.rotulo), [
    'Mostrar arquivadas (ocultas por omissão)', 'Mostrar "Sem workspace"', 'Só quem está a trabalhar',
    'Mostrar conversas em branco', 'Manter workspaces abertos sem ação',
  ]);
  const antes = globalThis.window.localStorage;
  try {
    const guardado = new Map();
    globalThis.window.localStorage = { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, String(v)) };
    assert.deepEqual(B.__lerFiltros(), { ...B.__FILTROS_PADRAO }, 'nada guardado: padrão');
    assert.equal(B.__guardarFiltros({ mostrarArquivadas: true, soTrabalhando: true }), true);
    assert.deepEqual(JSON.parse(guardado.get('dsh-work-game:filtros')), {
      mostrarArquivadas: true, mostrarSemWorkspace: true, soTrabalhando: true, mostrarEmBranco: false, mostrarAbertos: true,
    });
    assert.equal(B.__lerFiltros().soTrabalhando, true, 'volta igual depois de recarregar');
    // Payload antigo (sem mostrarAbertos): o campo em falta cai no padrão verdadeiro.
    guardado.set('dsh-work-game:filtros', JSON.stringify({ mostrarArquivadas: true, soTrabalhando: true }));
    assert.deepEqual(B.__lerFiltros(), {
      mostrarArquivadas: true, mostrarSemWorkspace: true, soTrabalhando: true, mostrarEmBranco: false, mostrarAbertos: true,
    }, 'localStorage antigo (sem mostrarAbertos) aceita-se e completa com o padrão');
    guardado.set('dsh-work-game:filtros', '{isto não é json');
    assert.deepEqual(B.__lerFiltros(), { ...B.__FILTROS_PADRAO }, 'JSON estragado: padrão, sem rebentar');
    globalThis.window.localStorage = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    assert.deepEqual(B.__lerFiltros(), { ...B.__FILTROS_PADRAO }, 'localStorage bloqueado (modo privado)');
    assert.equal(B.__guardarFiltros({ mostrarArquivadas: true }), false);
  } finally {
    globalThis.window.localStorage = antes;
  }
});

test('núcleo: filtros mudam a sala e persistem; o celular abre e fecha com a pessoa selecionada', () => {
  const n = B.__criarNucleo();
  let avisos = 0;
  const soltar = n.subscribe(() => { avisos += 1; });
  assert.deepEqual(n.getFiltros(), B.__lerFiltros());
  const vistaAntes = n.getView();
  n.setFiltros({ mostrarArquivadas: !n.getFiltros().mostrarArquivadas });
  assert.equal(avisos, 1, 'mudar um filtro notifica a UI');
  assert.notEqual(n.getView(), vistaAntes, 'e a vista (layout) é refeita');
  n.setFiltros({ ...n.getFiltros() });
  assert.equal(avisos, 1, 'sem mudança, sem re-render');
  n.setFiltros({ ...B.__FILTROS_PADRAO });

  assert.deepEqual(n.getTelefone(), { aberto: false, sessionId: null, vista: 'conversa', grupoId: null, origem: 'cena' });
  n.selecionar('a');
  n.abrirTelefone('a');
  assert.deepEqual(n.getTelefone(), { aberto: true, sessionId: 'a', vista: 'conversa', grupoId: null, origem: 'cena' });
  n.fecharTelefone();
  assert.equal(n.getTelefone().aberto, false);
  n.abrirTelefone('a');
  n.selecionar(null); // fechar a barra lateral fecha o celular dessa pessoa
  assert.equal(n.getTelefone().aberto, false);
  // Navegação do celular tipo iMessage: Grupos → Grupo → Conversa e o "‹"
  // sobe a pilha; na raiz fecha (desktop) e nada fica retido.
  n.abrirGrupos();
  assert.equal(n.getTelefone().vista, 'grupos', 'a segunda funcionalidade: os grupos (workspaces)');
  n.abrirGrupo('ws:w1', ['a', 'b']);
  assert.equal(n.getTelefone().vista, 'grupo');
  assert.deepEqual(n.getGrupo().membros.map((m) => m.id), ['a', 'b'], 'o grupo retém as conversas dos membros');
  n.abrirTelefone('b', 'grupo');
  n.selecionar('b');
  assert.equal(n.getTelefone().vista, 'conversa');
  assert.equal(n.getTelefone().origem, 'grupo', 'a conversa veio do grupo: o "‹" volta lá');
  n.voltarTelefone();
  assert.equal(n.getTelefone().vista, 'grupo', '"‹" do grupo');
  n.voltarTelefone();
  assert.equal(n.getTelefone().vista, 'grupos', '"‹" dos grupos');
  n.voltarTelefone();
  assert.equal(n.getTelefone().aberto, false, 'na raiz o "‹ Escritório" fecha (desktop)');
  assert.equal(n.getGrupo().membros.length, 0, 'nada fica retido depois de fechar');
  assert.ok(n.getPrecos() instanceof Map && n.getPrecos().size > 0, 'a tabela de preços do plugin chega à barra lateral');
  soltar();
  n.dispose();
});

/* ---------- barra lateral (modelo de dados puro) ---------- */

test('barra lateral: contexto real, os 4 buckets com custo estimado e a linha do tempo (mais recente primeiro)', () => {
  const e = escritorio([
    { type: 'session/added', sessionId: 'a', model: 'deepseek-chat', title: 'Status do projeto', at: 1 },
    { type: 'status', sessionId: 'a', status: 'idle', at: 2 },
    { type: 'status', sessionId: 'a', status: 'running', at: Date.UTC(2026, 8, 28, 14, 5, 9) },
    { type: 'model', sessionId: 'a', model: 'deepseek-chat', contextWindow: 128000, at: 3 },
    { type: 'ctx', sessionId: 'a', used: 53300, window: 128000, at: 4 },
    { type: 'usage', sessionId: 'a', model: 'deepseek-chat', uncachedInput: 1000000, output: 10000, cacheRead: 2000000, cacheWrite: 0, at: 5 },
    { type: 'status', sessionId: 'a', status: 'idle', at: Date.UTC(2026, 8, 28, 14, 6, 0) },
  ]);
  const p = { ...vistaDe(e, 'a'), speed: 38 };
  const layout = B.__montarEscritorio([p], wsDsh([w('w1', 'site', ['a'])]));
  const m = B.__modeloSidebar(p, { layout, precos: e.precos });

  assert.equal(m.nome, p.name);
  assert.equal(m.titulo, 'Status do projeto');
  assert.equal(m.local, 'site · mesa principal');
  assert.deepEqual(m.estado, { rotulo: 'Disponível', cor: '#9aa6ad', emDelegacao: false, texto: 'Disponível' });
  assert.equal(m.avatarChave, `${p.avatar}|sleeping`, 'o avatar é o <symbol> do boneco com a expressão atual');

  assert.deepEqual(m.contexto, {
    usado: 53300, janela: 128000, pct: 42, usadoTxt: '~53,3k', janelaTxt: '128k',
    legenda: '42% ocupado · projeção contextPressure do DSH', largura: 42, aviso: false,
  });

  assert.deepEqual(m.custo.buckets.map((b) => [b.rotulo, b.tokensTxt, b.precoTxt, b.custoTxt]), [
    ['Entrada (não-cacheada)', '1.000.000', 'US$ 0,27 / 1M', 'US$ 0,2700'],
    ['Saída', '10.000', 'US$ 1,10 / 1M', 'US$ 0,0110'],
    ['Leitura de cache', '2.000.000', 'US$ 0,03 / 1M', 'US$ 0,0540'],
    ['Escrita de cache', '0', 'US$ 0,27 / 1M', 'US$ 0,00'],
  ]);
  assert.equal(m.custo.totalTokensTxt, '3.010.000');
  assert.equal(m.custo.custoTxt, 'US$ 0,3350', 'o custo estimado da ficha (US$ 0,34), com as casas que a barra tem espaço para mostrar');
  assert.equal(B.__renderOffice({ people: { a: p }, layout }).match(/class="metric-cost">([^<]+)</)[1], 'US$ 0,34');
  assert.equal(m.custo.temPreco, true);
  assert.equal(m.custo.modelo, 'deepseek-chat');
  // A pessoa já não trabalha: a velocidade de um turno acabado não se mostra.
  assert.equal(m.custo.velocidadeTxt, '—', 'Disponível: sem tok/s (nada preso do último turno)');
  const aTrabalhar = { ...p, running: true, status: 'working' };
  assert.equal(B.__modeloSidebar(aTrabalhar, { layout, precos: e.precos }).custo.velocidadeTxt, '38 tok/s', 'a trabalhar: a velocidade do turno');
  assert.match(B.__renderOffice({ people: { a: aTrabalhar }, layout }), /class="metric-speed">38 tok\/s</);
  assert.ok(!/tok\/s/.test(B.__renderOffice({ people: { a: p }, layout })), 'a ficha de quem está Disponível não mostra tok/s');

  assert.deepEqual(m.atividade.map((a) => [a.texto, a.icone]), [
    ['Terminou de trabalhar', 'check'],
    ['Começou a trabalhar', 'play'],
  ]);
  for (const a of m.atividade) assert.match(a.hora, /^\d{2}:\d{2}:\d{2}$/);
});

test('barra lateral: sem dados mostra "—" (nada inventado) e o aviso >200k só com contexto real acima do limiar', () => {
  const p = { ...pessoa('n'), model: null, ctx: null, cost: null };
  const m = B.__modeloSidebar(p, { layout: B.__montarEscritorio([p], null), precos: PRECOS_TESTE });
  assert.equal(m.contexto.usadoTxt, '—');
  assert.equal(m.contexto.janelaTxt, '—');
  assert.equal(m.contexto.pct, null);
  assert.equal(m.contexto.largura, 0);
  assert.equal(m.contexto.legenda, 'O DSH ainda não publicou a ocupação desta conversa');
  assert.equal(m.custo.temTokens, false);
  assert.ok(m.custo.buckets.every((b) => b.tokensTxt === '—' && b.custoTxt === '—'));
  assert.equal(m.custo.custoTxt, '—');
  assert.equal(m.custo.modelo, '—');
  assert.equal(m.custo.velocidadeTxt, '—');
  assert.equal(m.custo.temPreco, false);
  assert.deepEqual(m.atividade, []);

  const cheio = B.__modeloSidebar(pessoa('c', { ctx: { used: 214600, window: 200000 } }), {});
  assert.equal(cheio.contexto.aviso, true);
  assert.equal(cheio.contexto.pct, 107);
  assert.equal(cheio.contexto.largura, 100, 'a barra nunca passa de 100%');
  const milhao = B.__modeloSidebar(pessoa('m', { ctx: { used: 25200, window: 1048576 } }), {});
  assert.equal(milhao.contexto.janelaTxt, '1,05M', 'janelas de 1M+ em M, não "1.048,6k"');
  const soUsado = B.__modeloSidebar(pessoa('u', { ctx: { used: 9000, window: null } }), {});
  assert.equal(soUsado.contexto.usadoTxt, '~9k');
  assert.equal(soUsado.contexto.legenda, 'Janela do modelo desconhecida — só o total ocupado');
  assert.equal(B.__modeloSidebar(null), null);
});

test('barra lateral: mesa principal/expandida/de equipe, delegação e arquivada', () => {
  const pessoas = [
    pessoa('a', { name: 'Lia', running: true, status: 'working', subagents: 1 }),
    ...['b', 'c', 'd', 'e'].map((id) => pessoa(id)),
    pessoa('s1', { subagent: true, parentId: 'a', running: true }),
    pessoa('arq'),
  ];
  const layout = B.__montarEscritorio(pessoas, wsDsh([w('w1', 'site', ['a', 'b', 'c', 'd', 'e', 'arq'])], ['arq']), { mostrarArquivadas: true });
  const m = (id) => B.__modeloSidebar(pessoas.find((p) => p.id === id), { layout });
  assert.equal(m('a').local, 'site · mesa de equipe', 'quem delega senta-se na mesa violeta');
  assert.equal(m('a').estado.texto, 'Em delegação · Trabalhando');
  assert.equal(m('b').local, 'site · mesa principal');
  assert.equal(m('arq').local, 'site · mesa expandida · arquivada');
  assert.equal(m('arq').arquivada, true);
  assert.equal(m('s1').local, 'site · mesa de equipe');
  const escondida = B.__modeloSidebar(pessoa('fora'), { layout });
  assert.equal(escondida.local, 'Fora da sala · escondida pelos filtros');
});

test('barra lateral: réplica da demo (345px, #fffefa, cabeçalho, separadores) e o inspetor antigo do rodapé saiu', () => {
  const css = B.__CSS_PAINEL;
  assert.ok(css.includes('.wg-sidebar{width:345px;flex-shrink:0;background:#fffefa;border-left:1px solid #e6e7e1;'), 'mesma largura e fundo da demo (.inspector)');
  for (const regra of [
    '.wg-sidebar .wg-inspector-top>span{font-size:9px;font-weight:800;letter-spacing:1.3px;color:#96a094}',
    '.wg-sidebar .wg-inspector-avatar{height:71px;width:67px;flex-shrink:0;overflow:hidden;border-radius:17px;background:#f3ecdf}',
    '.wg-sidebar .wg-inspector-tabs button.active{color:#2869a6;border-color:#2869a6}',
    '.wg-sidebar .wg-context-total strong{font-size:31px;letter-spacing:-1px;line-height:1;font-weight:800;color:#243b50}',
  ]) assert.ok(css.includes(regra), regra);
  assert.ok(!css.includes('.wg-inspetor') && !BUNDLE.includes("'wg-inspetor"), 'o inspetor do rodapé foi substituído pela barra lateral');
  assert.ok(BUNDLE.includes("'UMA PESSOA, MUITAS IDEIAS'"));
  for (const aba of ["rotulo: 'Contexto'", "rotulo: 'Custo'", "rotulo: 'Atividade'"]) assert.ok(BUNDLE.includes(aba), aba);
});

test('câmara: com a barra lateral aberta a sala fica legível (≥ 0,4) e centra a pessoa selecionada', () => {
  const tela = { w: 1160 - 345, h: 805 };
  const mundo = B.__tamanhoMundo(3);
  // Sem foco: nunca abaixo do legível — antes caía para 0,28 (fichas e "zzz" ilegíveis).
  const c = B.__enquadramento(mundo, tela);
  assert.equal(c.zoom, 0.4, `zoom legível (${c.zoom})`);
  assert.equal(c.x, 0, 'o início da sala');
  assert.equal(c.y, 0);
  // Com a pessoa selecionada: centrada na zona à vista…
  const layout = B.__montarEscritorio(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => pessoa(id)),
    wsDsh([w('w1', 'site', ['a', 'b', 'c']), w('w2', 'api', ['d', 'e', 'f']), w('w3', 'web', ['g', 'h', 'i'])]),
  );
  const foco = B.__centroDoLugar(layout, 'e');
  assert.deepEqual(foco, { x: 40 + 940 + 112.5 + 225, y: 310 + 325 }, '2.º lugar da 2.ª mesa');
  const f = B.__enquadramento(mundo, tela, false, foco);
  assert.equal(f.zoom, 0.4);
  assert.ok(Math.abs(f.x + foco.x * 0.4 - 815 / 2) < 1e-9, 'no meio da tela');
  // … e, com o celular aberto (a zona à vista acaba à esquerda dele), ali.
  const comTel = B.__enquadramento(mundo, { ...tela, visivel: 420 }, false, foco);
  assert.ok(Math.abs(comTel.x + foco.x * 0.4 - 210) < 1e-9, 'no meio da zona à esquerda do celular');
  // Nas pontas, sem mostrar vazio antes do mundo; do lado do celular pode ir
  // até a borda direita do mundo encostar à zona à vista.
  const primeira = B.__enquadramento(mundo, { ...tela, visivel: 420 }, false, B.__centroDoLugar(layout, 'a'));
  assert.equal(primeira.x, 0);
  const ultima = B.__enquadramento(mundo, { ...tela, visivel: 420 }, false, B.__centroDoLugar(layout, 'i'));
  assert.ok(Math.abs(ultima.x - (420 - 2900 * 0.4)) < 1e-9, 'a borda direita do mundo encosta à zona à vista');
  const cxUltima = ultima.x + B.__centroDoLugar(layout, 'i').x * 0.4;
  assert.ok(cxUltima > 0 && cxUltima < 420, `a pessoa fica na zona à vista (${cxUltima.toFixed(1)})`);
  assert.equal(B.__centroDoLugar(layout, 'fora'), null, 'fora da sala: sem foco');
  // "Enquadrar" ignora o foco: a sala inteira.
  assert.equal(B.__enquadramento(mundo, tela, true, foco).zoom, 815 / 2900);
});

test('câmara: a zona à vista segue a posição REAL do celular e da barra lateral (onde quer que estejam)', () => {
  const Z = B.__zonaVisivel;
  // Sem nada por cima: a tela toda.
  assert.deepEqual(Z(815, []), { esq: 0, dir: 815 });
  // Janela larga: celular à DIREITA (sobre a sala) — a zona acaba 24 px antes dele.
  assert.deepEqual(Z(815, [{ esq: 444, dir: 797 }]), { esq: 0, dir: 420 });
  // A barra lateral AO LADO da tela (fora dela) não conta, nem a folga dela.
  assert.deepEqual(Z(815, [{ esq: 444, dir: 797 }, { esq: 815, dir: 1160 }]), { esq: 0, dir: 420 });
  // Painel estreito: o celular por cima da barra (fora da tela) não tira nada à sala.
  assert.deepEqual(Z(575, [{ esq: 600, dir: 950 }]), { esq: 0, dir: 575 });
  // Janela ≤ 800 px: celular à ESQUERDA e a barra lateral POR CIMA da sala, à direita.
  const estreita = Z(1000, [{ esq: 12, dir: 332 }, { esq: 680, dir: 1000 }]);
  assert.deepEqual(estreita, { esq: 356, dir: 656 }, 'entre o celular e a barra');
  // Só o celular à esquerda (barra fechada): da direita do celular ao fim da tela.
  assert.deepEqual(Z(780, [{ esq: 12, dir: 332 }]), { esq: 356, dir: 780 });
  // As folgas comem o espaço todo: conta a folga REAL (margem 0) — a geometria
  // real de uma janela de 780 px com o esquema antigo (celular à esquerda,
  // barra por cima da sala): tela 724, celular 12–363, barra 403–724. Antes
  // devolvia a tela inteira (0–724) e a pessoa ficava debaixo do celular.
  const j780 = Z(724, [{ esq: 12, dir: 363 }, { esq: 403, dir: 724 }]);
  assert.deepEqual(j780, { esq: 303, dir: 463 }, 'os 40 px entre o celular e a barra, alargados a 160 à volta do centro (383)');
  // Obstáculos sobrepostos com uma nesga livre: a nesga (0–12), alargada ao mínimo.
  assert.deepEqual(Z(520, [{ esq: 12, dir: 335 }, { esq: 200, dir: 520 }]), { esq: 0, dir: 160 });
  // Sem folga nenhuma (a tela toda tapada): a tela inteira.
  assert.deepEqual(Z(520, [{ esq: 0, dir: 335 }, { esq: 200, dir: 520 }]), { esq: 0, dir: 520 }, 'tapada: a tela toda');
  // O esquema de agora (≤ 800 px): o celular por cima da barra, à direita — sobra a sala à esquerda.
  assert.deepEqual(Z(724, [{ esq: 355, dir: 706 }, { esq: 404, dir: 724 }]), { esq: 0, dir: 331 });
  const pouco = Z(700, [{ esq: 12, dir: 332 }, { esq: 480, dir: 700 }]);
  assert.equal(pouco.dir - pouco.esq, 160, `mínimo de 160 px (${JSON.stringify(pouco)})`);
  assert.ok(pouco.esq >= 0 && pouco.dir <= 700);
  assert.ok(Math.abs((pouco.esq + pouco.dir) / 2 - (356 + 456) / 2) < 1e-9, 'à volta do troço livre');

  // enquadramento: a pessoa fica no meio da zona, esteja o celular à direita ou à esquerda.
  const layout = B.__montarEscritorio(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => pessoa(id)),
    wsDsh([w('w1', 'site', ['a', 'b', 'c']), w('w2', 'api', ['d', 'e', 'f']), w('w3', 'web', ['g', 'h', 'i'])]),
  );
  const mundo = B.__tamanhoMundo(3);
  const foco = B.__centroDoLugar(layout, 'e');
  const tela = { w: 1000, h: 805 };
  // Na folga dos 780 px, a pessoa da 1.ª e da última coluna fica NA folga
  // (não debaixo do celular nem da barra).
  for (const id of ['a', 'i']) {
    const f780 = B.__centroDoLugar(layout, id);
    const c780 = B.__enquadramento(mundo, { w: 724, h: 805, zona: j780 }, false, f780);
    const cx780 = c780.x + f780.x * c780.zoom;
    assert.ok(cx780 >= 303 && cx780 <= 463, `${id}: centro em ${cx780.toFixed(1)} px, dentro de 303–463`);
  }
  const esq = B.__enquadramento(mundo, { ...tela, zona: estreita }, false, foco);
  assert.equal(esq.zoom, 0.4);
  assert.ok(Math.abs(esq.x + foco.x * 0.4 - (356 + 656) / 2) < 1e-9, 'centrada ENTRE o celular (esq.) e a barra (dir.), não debaixo do celular');
  const dir = B.__enquadramento(mundo, { ...tela, zona: { esq: 0, dir: 420 } }, false, foco);
  assert.ok(Math.abs(dir.x + foco.x * 0.4 - 210) < 1e-9, 'celular à direita: à esquerda dele (como antes)');
  assert.deepEqual(dir, B.__enquadramento(mundo, { ...tela, visivel: 420 }, false, foco), '`visivel` (legado) = zona [0, visivel]');
  // Nas pontas, a borda do mundo encosta à zona (do lado do celular à esquerda, também).
  const primeira = B.__enquadramento(mundo, { ...tela, zona: estreita }, false, B.__centroDoLugar(layout, 'a'));
  assert.equal(primeira.x, 356, 'a borda esquerda do mundo encosta à direita do celular (sem vazio na zona)');
  const ultima = B.__enquadramento(mundo, { ...tela, zona: estreita }, false, B.__centroDoLugar(layout, 'i'));
  assert.ok(ultima.x + 2900 * 0.4 >= 656 - 1e-9, 'o mundo chega pelo menos à barra (sem vazio na zona)');
  const cx = ultima.x + B.__centroDoLugar(layout, 'i').x * 0.4;
  assert.ok(cx > 356 && cx < 656, `a pessoa da mesa da direita fica na zona (${cx.toFixed(1)})`);
  // Sem pessoa aberta a zona não conta (a sala inteira, como antes).
  assert.deepEqual(B.__enquadramento(mundo, { ...tela, zona: estreita }), B.__enquadramento(mundo, tela));
  // Caixas de LAYOUT (offset*, sem a animação de entrada), relativas à tela.
  const pai = { getBoundingClientRect: () => ({ left: 280 }), clientLeft: 0 };
  assert.deepEqual(B.__caixaDeLayout({ offsetLeft: 12, offsetWidth: 320, offsetParent: pai }, 280), { esq: 12, dir: 332 });
  assert.equal(B.__caixaDeLayout(null, 0), null);
  assert.equal(B.__caixaDeLayout({ offsetLeft: 0, offsetWidth: 0, offsetParent: pai }, 0), null, 'fora do layout (display:none)');
  // O painel usa a posição real dos dois (nada de "o celular está sempre à direita").
  assert.match(BUNDLE, /\[painel\.querySelector\('\.wg-telefone'\), painel\.querySelector\('\.wg-sidebar'\)\]/);
  assert.ok(!BUNDLE.includes('tel.offsetLeft - 24'), 'a suposição antiga saiu');
});

/* ---------- expressões DURANTE o trabalho (motor de expressões) + vigia ---------- */

test('expressões durante o trabalho: cada evento sorteia a SUA variante e os estados fortes mandam', () => {
  // O reator de variantes embutido cobre os 14 presets da biblioteca — qualquer
  // variante pode acontecer durante o trabalho (variantes.js / assets/AVATARS-EXPRESSIONS.md).
  assert.deepEqual(Object.keys(B.__VARIANTES_EVENTOS).sort(), ['error', 'idle', 'success', 'tool', 'waiting', 'working']);
  const todos = new Set(Object.values(B.__VARIANTES_EVENTOS).flatMap((ev) => ev.pool));
  assert.deepEqual([...todos].sort(),
    ['approval', 'celebrating', 'disbelief', 'error', 'focused', 'idle', 'searching', 'success',
      'surprised', 'thinking', 'tool', 'waiting', 'wink', 'working']);
  let e = escritorio([{ type: 'session/added', sessionId: 'a' }, { type: 'status', sessionId: 'a', status: 'running' }]);
  const cara = () => B.__presetDe(e.people.get('a'));
  assert.equal(cara(), 'working', 'sem eventos de expressão ainda: a cara de trabalho base');
  // Disparo determinístico para o teste (motor com probabilidade 1): o sorteio
  // real usa a semente da pessoa + o carimbo do evento (expressoes.js embutido).
  e.people.get('a').motor = B.__motorExpressoes({ semente: 7, probabilidade: 1 });
  const vistas = [];
  for (let i = 0; i < 8; i += 1) {
    // Mensagens com 1,2s de intervalo: a cadência (minMudancaMs = 1s) deixa
    // ~1 mudança/s — em rajadas a cara não pisca.
    e = B.__applyEvent(e, { type: 'message', sessionId: 'a', side: i % 2 ? 'assistant' : 'user', at: 1000 + i * 1200 });
    vistas.push(cara());
  }
  for (const v of vistas) {
    assert.ok(['working', 'focused', 'thinking', 'wink'].includes(v), `variante do cenário 'mensagem' (${v})`);
  }
  assert.ok(new Set(vistas).size > 1, 'as mensagens mudam de cara — o disparo é aleatório, nunca uma rotação fixa');
  // Os estados fortes mandam por cima das variantes…
  e = B.__applyEvent(e, { type: 'question', sessionId: 'a', id: 'q1', text: 'ok?', at: 10000 });
  assert.equal(cara(), 'waiting', 'quem pergunta espera');
  e = B.__applyEvent(e, { type: 'question/answered', sessionId: 'a', id: 'q1', at: 10500 });
  assert.ok(['working', 'focused', 'thinking', 'wink'].includes(cara()), 'de volta às variantes de trabalho');
  // Executar uma ferramenta → variante do cenário 'ferramenta'.
  e = B.__applyEvent(e, { type: 'tool', sessionId: 'a', phase: 'call', name: 'bash', at: 11500 });
  assert.ok(['tool', 'searching', 'focused', 'thinking'].includes(cara()), `com ferramenta: pool de ferramenta (${cara()})`);
  // Falha da ferramenta → variante transitória 'ferramenta-erro', mas a cara
  // persistente do erro é a do contrato.
  e = B.__applyEvent(e, { type: 'tool', sessionId: 'a', phase: 'result', name: 'bash', ok: false, at: 13000 });
  assert.equal(cara(), 'error', "a falha da ferramenta mantém a cara 'error' (o transitório é reação one-shot)");
  // Turno concluído → variante do cenário 'sucesso'.
  e = B.__applyEvent(e, { type: 'status', sessionId: 'a', status: 'running', at: 15000 });
  e = B.__applyEvent(e, { type: 'turn/end', sessionId: 'a', kind: 'completed', at: 16000 });
  assert.ok(['success', 'celebrating', 'approval', 'wink'].includes(cara()), `concluído: pool de sucesso (${cara()})`);
  // Disponível dorme sempre.
  e = B.__applyEvent(e, { type: 'status', sessionId: 'a', status: 'idle', at: 18000 });
  assert.equal(cara(), 'sleeping', '…e quem está Disponível dorme');
});

test('variantes: o disparo é DE CADA PESSOA — sorteios independentes e anti-repetição', () => {
  const um = B.__criarReatorVariante({ semente: 7, probabilidade: 1 });
  const outro = B.__criarReatorVariante({ semente: 99, probabilidade: 1 });
  const sequencia = (reator) => {
    let atual = 'working';
    const saida = [];
    for (let i = 0; i < 12; i += 1) {
      const p = reator.aoEvento('working', atual, 500 + i);
      if (p) { saida.push(p); atual = p; }
    }
    return saida;
  };
  const a = sequencia(um);
  const b = sequencia(outro);
  assert.ok(a.length > 3 && b.length > 3, 'com probabilidade 1 os eventos todos disparam');
  assert.notDeepEqual(a, b, 'pessoas diferentes, sequências diferentes (cada um tem a sua)');
  for (let i = 1; i < a.length; i += 1) assert.notEqual(a[i], a[i - 1], 'nunca repete a cara atual');
  // O disparo é aleatório: com probabilidade 0 nada acontece.
  const parado = B.__criarReatorVariante({ semente: 7, probabilidade: 0 });
  assert.equal(parado.aoEvento('error', 'working', 1), null, 'sem disparo, sem troca');
});

test('vigia de mensagens: conta user/assistant message das conversas a correr e liberta ao parar', async () => {
  const vistas = [];
  let libertados = 0;
  const tarefas = new Map();
  let proxId = 1;
  const agendar = (fn) => { const id = proxId; proxId += 1; tarefas.set(id, fn); return id; };
  const cancelar = (id) => { tarefas.delete(id); };
  const disparar = () => { for (const [id, fn] of [...tarefas]) { tarefas.delete(id); fn(); } };
  let snap = { entries: [] };
  const ouvintes = new Set();
  const fluxo = {
    getSnapshot: () => snap,
    subscribe(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    emitir(entries) { snap = { entries }; for (const fn of [...ouvintes]) fn(); },
  };
  const sessoes = {
    retain: (id) => ({ sessionId: id, ready: Promise.resolve({ eventSource: fluxo }), release: () => { libertados += 1; } }),
  };
  const vigia = B.__criarVigiaMensagens({
    sessoes, aoMensagem: (id, lado) => vistas.push(`${id}:${lado}`), agendar, cancelar,
    agora: () => Date.now(),
  });
  vigia.observar({ type: 'status', sessionId: 's1', status: 'running' });
  await new Promise((r) => setTimeout(r, 0)); // ref.ready resolve e a 1.ª leitura corre
  assert.equal(vigia.ligados(), 1, 'uma referência leve por conversa a correr');
  // História anterior à vigia (e a que chega DEPOIS por loadOlder): nunca conta.
  fluxo.emitir([
    { type: 'event', event: { type: 'user/message', seq: 1, time: Date.now() - 60000 } },
    { type: 'event', event: { type: 'tool/call', seq: 2, time: Date.now() - 60000 } },
    { type: 'event', event: { type: 'user/message', seq: 7, time: Date.now() - 120000 } },
  ]);
  assert.deepEqual(vistas, [], 'a história não mexe na cara');
  // O prompt que arrancou o turno (perto do retain) e as seguintes contam.
  fluxo.emitir([
    { type: 'event', event: { type: 'user/message', seq: 3, time: Date.now() - 200 } },
    { type: 'event', event: { type: 'tool/call', seq: 4, time: Date.now() - 100 } },
    { type: 'transient', event: { type: 'assistant/live-chunk', seq: 5, time: Date.now() } },
    { type: 'event', event: { type: 'assistant/message', seq: 6, time: Date.now() } },
  ]);
  assert.deepEqual(vistas, ['s1:user', 's1:assistant'], 'a que arrancou o turno e a resposta');
  // O mesmo log re-lido não conta de novo (chaves por seq).
  fluxo.emitir([{ type: 'event', event: { type: 'user/message', seq: 3, time: Date.now() - 200 } }]);
  assert.deepEqual(vistas, ['s1:user', 's1:assistant'], 'sem dupla contagem');
  // Parar agenda a libertação com graça; voltar a correr cancela-a.
  vigia.observar({ type: 'status', sessionId: 's1', status: 'idle' });
  assert.equal(tarefas.size, 1, 'a libertação fica agendada (a última mensagem chega mesmo antes de parar)');
  vigia.observar({ type: 'status', sessionId: 's1', status: 'running' });
  assert.equal(tarefas.size, 0, 'voltou a correr dentro da graça: mantém-se');
  assert.equal(libertados, 0);
  // Re-ligação não recicla mensagens antigas (as chaves sobrevivem).
  fluxo.emitir([{ type: 'event', event: { type: 'user/message', seq: 3, time: Date.now() - 200 } }]);
  assert.deepEqual(vistas, ['s1:user', 's1:assistant'], 're-ligação não conta de novo');
  // Em definitivo: liberta e desconta.
  vigia.observar({ type: 'status', sessionId: 's1', status: 'idle' });
  disparar();
  assert.equal(libertados, 1);
  assert.equal(vigia.ligados(), 0);
  // session/removed também liberta; sem canal a vigia fica quieta (nada é inventado).
  vigia.observar({ type: 'status', sessionId: 's2', status: 'running' });
  assert.equal(vigia.ligados(), 1);
  vigia.observar({ type: 'session/removed', sessionId: 's2' });
  assert.equal(vigia.ligados(), 0);
  const nula = B.__criarVigiaMensagens({ sessoes: null, aoMensagem: () => { throw new Error('não devia chamar'); } });
  nula.observar({ type: 'status', sessionId: 'x', status: 'running' });
  assert.equal(nula.ligados(), 0, 'sem ctx.sessions: sem vigia, sem mensagens inventadas');
  nula.parar();
  vigia.parar();
});

/* ---------- celular: a pilha de telas com as Definições (voz) ---------- */

test('núcleo: as Definições abrem-se dos Grupos e o "‹" volta aos grupos (nunca fecha)', () => {
  const n = B.__criarNucleo();
  n.abrirGrupos();
  n.abrirConfig();
  assert.deepEqual(n.getTelefone(), { aberto: true, sessionId: null, vista: 'config', grupoId: null, origem: 'cena' },
    'a vista "config" entra na MESMA forma de getTelefone() (sem campos novos)');
  n.voltarTelefone();
  assert.equal(n.getTelefone().vista, 'grupos', 'config → grupos');
  assert.equal(n.getTelefone().aberto, true, 'o "‹" das Definições nunca fecha o celular');
  // De qualquer tela a config abre e volta sempre aos grupos.
  n.abrirGrupo('ws:w1', ['a']);
  assert.equal(n.getTelefone().vista, 'grupo');
  n.abrirConfig();
  assert.equal(n.getTelefone().vista, 'config', 'abre-se também por cima do grupo');
  assert.equal(n.getGrupo().membros.length, 0, 'as conversas do grupo libertam-se ao abrir as Definições');
  n.voltarTelefone();
  assert.equal(n.getTelefone().vista, 'grupos');
  n.abrirConfig();
  n.voltarTelefone();
  n.voltarTelefone();
  assert.equal(n.getTelefone().aberto, false, 'na raiz dos grupos fecha (desktop)');
  n.dispose();
});

test('config: a chave da API OpenAI faz round-trip no localStorage (dsh-work-game:config) e mascara-se', () => {
  assert.equal(typeof B.__voz.transcreverAudio, 'function', 'a superfície de voz.js exposta para testes');
  assert.equal(typeof B.__voz.criarGravadorVoz, 'function');
  assert.equal(typeof B.__TelefoneConfig, 'function', 'e o componente das Definições');
  const antes = globalThis.window.localStorage;
  try {
    const guardado = new Map();
    globalThis.window.localStorage = {
      getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
      setItem: (k, v) => guardado.set(k, String(v)),
      removeItem: (k) => guardado.delete(k),
    };
    assert.deepEqual(B.__voz.lerConfig(globalThis.window.localStorage), { chaveOpenAI: '', idioma: 'auto' },
      'sem chave guardada: sem transcrição (a voz pede as Definições)');
    assert.equal(B.__voz.guardarConfig(globalThis.window.localStorage, { chaveOpenAI: 'sk-proj-1234abcd', idioma: 'pt' }), true);
    assert.equal(guardado.get('dsh-work-game:config'), JSON.stringify({ chaveOpenAI: 'sk-proj-1234abcd', idioma: 'pt' }),
      'na chave dsh-work-game:config (como os filtros)');
    assert.deepEqual(B.__voz.lerConfig(globalThis.window.localStorage), { chaveOpenAI: 'sk-proj-1234abcd', idioma: 'pt' },
      'round-trip: volta igual');
    assert.equal(B.__voz.mascararChave('sk-proj-1234abcd'), 'sk-…abcd', 'para o ecrã, só a máscara');
    B.__voz.limparConfig(globalThis.window.localStorage);
    assert.deepEqual(B.__voz.lerConfig(globalThis.window.localStorage), { chaveOpenAI: '', idioma: 'auto' },
      'limpar apaga a chave do navegador');
  } finally {
    globalThis.window.localStorage = antes;
  }
});
