/*
 * tests/contracts.test.mjs — suíte de TESTES ESTÁTICOS de CONTRATOS do
 * projeto "dsh-work-game" (front-end puro, zero dependências, zero build).
 *
 * Valida os contratos dos ficheiros estáticos, sem executar a app no browser:
 *   - data.js     → globalThis.window.DSH_DEMO_DATA (nomes, outputs, tasks);
 *   - expressions.js → window.DSH_EXPRESSIONS (14 presets com enums REAIS do
 *                     Avataaars, identidades e resolve() com fallback);
 *   - index.html  → sem sidebar/cabeçalho de sala, ids essenciais e ordem
 *                   exata dos scripts;
 *   - README.md   → links relativos existentes e instrução de servidor local.
 *
 * Executar a partir da raiz do projeto:
 *   node --test tests/
 *
 * Sem rede, sem timers, sem dependências npm. Caminhos resolvidos via
 * import.meta.url.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/* Infraestrutura mínima                                               */
/* ------------------------------------------------------------------ */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/*
 * Carrega um script "browser" (atribui window.*) num sandbox mínimo {window:{}}
 * via node:vm. Qualquer erro de execução fica registado para os testes
 * reportarem com clareza em vez de rebentar a suíte.
 */
function tryLoad(relPath) {
  try {
    const codigo = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(codigo, sandbox, { filename: relPath });
    return { sandbox, erro: null };
  } catch (erro) {
    return { sandbox: { window: {} }, erro };
  }
}

const dataLoad = tryLoad('data.js');
const exprLoad = tryLoad('expressions.js');
const DATA = dataLoad.sandbox.window.DSH_DEMO_DATA;
const EXPR = exprLoad.sandbox.window.DSH_EXPRESSIONS;

/* NOTA: os arrays vêm do realm do `vm`; copiá-los para o realm do host
   ([...x]) para que assert.deepEqual compare só o conteúdo, não o
   protótipo de Array de outro realm. */
const firstNames = Array.isArray(DATA?.firstNames) ? [...DATA.firstNames] : [];
const lastNames = Array.isArray(DATA?.lastNames) ? [...DATA.lastNames] : [];
const outputs = Array.isArray(DATA?.outputs) ? [...DATA.outputs] : [];
const tasks = Array.isArray(DATA?.tasks) ? [...DATA.tasks] : [];

const presets = Array.isArray(EXPR?.presets) ? [...EXPR.presets] : [];
const identities = EXPR?.identities && typeof EXPR.identities === 'object' ? EXPR.identities : {};
const resolveFn = typeof EXPR?.resolve === 'function' ? EXPR.resolve : () => undefined;

/* Enums REGISTADOS na biblioteca Avataaars (fangpenlin/avataaars,
 * src/avatar/face/{eyes,eyebrow,mouth}/index.tsx). Valores fora destas
 * listas não são renderizáveis — ex.: 'FrownNatural' NÃO existe. */
const EYE_TYPES = new Set([
  'Close', 'Cry', 'Default', 'Dizzy', 'EyeRoll', 'Happy',
  'Hearts', 'Side', 'Squint', 'Surprised', 'Wink', 'WinkWacky'
]);
const EYEBROW_TYPES = new Set([
  'Angry', 'AngryNatural', 'Default', 'DefaultNatural', 'FlatNatural',
  'RaisedExcited', 'RaisedExcitedNatural', 'SadConcerned', 'SadConcernedNatural',
  'UnibrowNatural', 'UpDown', 'UpDownNatural'
]);
const MOUTH_TYPES = new Set([
  'Concerned', 'Default', 'Disbelief', 'Eating', 'Grimace', 'Sad',
  'ScreamOpen', 'Serious', 'Smile', 'Tongue', 'Twinkle', 'Vomit'
]);

const KINDS_VALIDOS = new Set(['file', 'tool', 'test', 'result', 'message']);
const EMOJI = /\p{Extended_Pictographic}/u;

/* ------------------------------------------------------------------ */
/* data.js — globalThis.window.DSH_DEMO_DATA                           */
/* ------------------------------------------------------------------ */

test('data.js executa sem erros num sandbox mínimo {window:{}}', () => {
  assert.equal(dataLoad.erro, null, `data.js rebentou ao executar: ${dataLoad.erro ? dataLoad.erro.message : ''}`);
});

test('data.js define globalThis.window.DSH_DEMO_DATA', () => {
  assert.ok(DATA && typeof DATA === 'object', 'window.DSH_DEMO_DATA não ficou definido como objeto após executar data.js');
});

test('DSH_DEMO_DATA.firstNames tem pelo menos 40 nomes', () => {
  assert.ok(firstNames.length >= 40, `Esperados pelo menos 40 firstNames, encontrados ${firstNames.length}`);
});

test('DSH_DEMO_DATA.firstNames não tem nomes repetidos', () => {
  const repetidos = firstNames.filter((nome, i) => firstNames.indexOf(nome) !== i);
  assert.deepEqual(repetidos, [], 'firstNames repetidos: ' + [...new Set(repetidos)].join(', '));
});

test('DSH_DEMO_DATA.lastNames tem pelo menos 20 apelidos', () => {
  assert.ok(lastNames.length >= 20, `Esperados pelo menos 20 lastNames, encontrados ${lastNames.length}`);
});

test('DSH_DEMO_DATA.lastNames não tem apelidos repetidos', () => {
  const repetidos = lastNames.filter((nome, i) => lastNames.indexOf(nome) !== i);
  assert.deepEqual(repetidos, [], 'lastNames repetidos: ' + [...new Set(repetidos)].join(', '));
});

test('DSH_DEMO_DATA.nameGenders cobre todos os firstNames (gênero casa nome ↔ boneco)', () => {
  const genders = DATA?.nameGenders && typeof DATA.nameGenders === 'object' ? DATA.nameGenders : {};
  const problemas = [];
  for (const nome of firstNames) {
    const g = genders[nome];
    if (!['f', 'm', 'any'].includes(g)) {
      problemas.push(`"${nome}" sem gênero válido (valor: ${JSON.stringify(g)})`);
    }
  }
  for (const chave of Object.keys(genders)) {
    if (!firstNames.includes(chave)) problemas.push(`nameGenders tem "${chave}", que não está em firstNames`);
  }
  assert.equal(problemas.length, 0, 'nameGenders divergente de firstNames:\n' + problemas.join('\n'));
});

test('DSH_DEMO_DATA.outputs tem pelo menos 40 entradas', () => {
  assert.ok(outputs.length >= 40, `Esperados pelo menos 40 outputs, encontrados ${outputs.length}`);
});

test('todos os outputs usam kinds do conjunto {file,tool,test,result,message}', () => {
  const invalidos = outputs
    .filter((o) => !KINDS_VALIDOS.has(o?.kind))
    .map((o, i) => `#${i}: ${JSON.stringify(o?.kind)}`);
  assert.deepEqual(invalidos, [], 'Outputs com kind inválido: ' + invalidos.join(', '));
});

test('todos os textos de output têm no máximo 60 caracteres', () => {
  const longos = outputs
    .map((o) => (typeof o?.text === 'string' ? o.text : ''))
    .filter((texto) => Array.from(texto).length > 60)
    .map((texto) => `"${texto}" (${Array.from(texto).length})`);
  assert.deepEqual(longos, [], 'Textos de output acima de 60 caracteres: ' + longos.join(', '));
});

test('nenhum texto de output contém emoji', () => {
  const comEmoji = outputs
    .map((o) => (typeof o?.text === 'string' ? o.text : ''))
    .filter((texto) => EMOJI.test(texto))
    .map((texto) => `"${texto}"`);
  assert.deepEqual(comEmoji, [], 'Textos de output com emoji: ' + comEmoji.join(', '));
});

test('DSH_DEMO_DATA.tasks tem pelo menos 10 tarefas', () => {
  assert.ok(tasks.length >= 10, `Esperadas pelo menos 10 tasks, encontradas ${tasks.length}`);
});

/* ------------------------------------------------------------------ */
/* expressions.js — window.DSH_EXPRESSIONS                             */
/* ------------------------------------------------------------------ */

test('expressions.js executa sem erros num sandbox mínimo {window:{}}', () => {
  assert.equal(exprLoad.erro, null, `expressions.js rebentou ao executar: ${exprLoad.erro ? exprLoad.erro.message : ''}`);
});

test('expressions.js define window.DSH_EXPRESSIONS', () => {
  assert.ok(EXPR && typeof EXPR === 'object', 'window.DSH_EXPRESSIONS não ficou definido como objeto após executar expressions.js');
});

test('DSH_EXPRESSIONS define exatamente 14 presets de expressão', () => {
  assert.equal(presets.length, 14, `Esperados exatamente 14 presets, encontrados ${presets.length}`);
});

test('cada preset tem id/label/eyeType/eyebrowType/mouthType/when preenchidos', () => {
  const problemas = [];
  for (const preset of presets) {
    for (const campo of ['id', 'label', 'eyeType', 'eyebrowType', 'mouthType', 'when']) {
      if (typeof preset?.[campo] !== 'string' || preset[campo].trim() === '') {
        problemas.push(`preset ${preset?.id || '(sem id)'}: campo "${campo}" vazio ou ausente`);
      }
    }
  }
  assert.equal(problemas.length, 0, 'Presets incompletos:\n' + problemas.join('\n'));
});

test('todos os eyeType dos presets pertencem ao enum real do Avataaars', () => {
  const invalidos = presets
    .filter((p) => !EYE_TYPES.has(p?.eyeType))
    .map((p) => `preset "${p?.id}": ${JSON.stringify(p?.eyeType)}`);
  assert.deepEqual(
    invalidos, [],
    'eyeType fora do enum registado no Avataaars (ex.: "FrownNatural" NÃO existe): ' + invalidos.join(', ')
  );
});

test('todos os eyebrowType dos presets pertencem ao enum real do Avataaars', () => {
  const invalidos = presets
    .filter((p) => !EYEBROW_TYPES.has(p?.eyebrowType))
    .map((p) => `preset "${p?.id}": ${JSON.stringify(p?.eyebrowType)}`);
  assert.deepEqual(
    invalidos, [],
    'eyebrowType fora do enum registado no Avataaars: ' + invalidos.join(', ')
  );
});

test('todos os mouthType dos presets pertencem ao enum real do Avataaars', () => {
  const invalidos = presets
    .filter((p) => !MOUTH_TYPES.has(p?.mouthType))
    .map((p) => `preset "${p?.id}": ${JSON.stringify(p?.mouthType)}`);
  assert.deepEqual(
    invalidos, [],
    'mouthType fora do enum registado no Avataaars: ' + invalidos.join(', ')
  );
});

test('DSH_EXPRESSIONS.variantes: o reator cobre os 14 presets e respeita a identidade', () => {
  const v = EXPR?.variantes;
  assert.ok(v && typeof v.criarReator === 'function' && typeof v.sortear === 'function'
    && typeof v.pool === 'function' && v.eventos && typeof v.hash === 'function',
  'window.DSH_EXPRESSIONS.variantes expõe eventos/hash/pool/sortear/criarReator');
  // As variantes TODAS da biblioteca podem acontecer durante o trabalho.
  const cobertos = new Set(Object.values(v.eventos).flatMap((ev) => ev.pool));
  for (const p of presets) assert.ok(cobertos.has(p.id), `preset ${p.id} pertence a pelo menos um pool de evento`);
  // Identidades aleatórias (só 4 presets): o evento cai no base que a identidade tem.
  // (Espalhar com [...]: os arrays do sandbox vm têm outro protótipo que o
  // deepStrictEqual do host reprova — o padrão já usado nos testes acima.)
  const reduzidos = ['idle', 'working', 'success', 'error'];
  assert.deepEqual([...v.pool('tool', reduzidos)], ['working'], 'sem ferramenta: o base do evento');
  assert.deepEqual([...v.pool('error', reduzidos)], ['error']);
  assert.deepEqual([...v.pool('success', reduzidos)], ['success']);
  assert.deepEqual([...v.pool('waiting', reduzidos)], [], 'sem base: nada a sortear');
  // Nomeadas (os 14): o pool inteiro.
  assert.deepEqual([...v.pool('tool', null)], [...v.eventos.tool.pool]);
  // O reator sorteia dentro do pool, com anti-repetição (disparo determinístico
  // no teste; o disparo real é aleatório — ver tests/plugin/variantes.test.mjs).
  const r = v.criarReator({ semente: 11, probabilidade: 1 });
  let atual = 'working';
  for (let i = 0; i < 20; i += 1) {
    const p = r.aoEvento('working', atual, i);
    assert.ok(v.eventos.working.pool.includes(p), `sorteio dentro do pool (${p})`);
    assert.notEqual(p, atual, 'nunca repete a cara atual');
    atual = p;
  }
});

test('namedIdentityIds é exatamente [rui, bia, lia, pesquisa, codigo, testes, alex, maya]', () => {
  const obtidos = Array.isArray(EXPR?.namedIdentityIds) ? [...EXPR.namedIdentityIds] : null;
  assert.deepEqual(
    obtidos,
    ['rui', 'bia', 'lia', 'pesquisa', 'codigo', 'testes', 'alex', 'maya'],
    'namedIdentityIds divergente do contrato da demo'
  );
});

test('randomIdentityIds tem exatamente 12 ids no formato rNN', () => {
  const problemas = [];
  const ids = Array.isArray(EXPR?.randomIdentityIds) ? [...EXPR.randomIdentityIds] : [];
  if (ids.length !== 12) problemas.push(`esperados 12 ids, encontrados ${ids.length}`);
  for (const id of ids) {
    if (typeof id !== 'string' || !/^r\d{2}$/.test(id)) problemas.push(`id fora do formato rNN: ${JSON.stringify(id)}`);
  }
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repetidos.length > 0) problemas.push(`ids repetidos: ${[...new Set(repetidos)].join(', ')}`);
  assert.equal(problemas.length, 0, 'randomIdentityIds divergente do contrato:\n' + problemas.join('\n'));
});

test('identities: todas as identidades declaram gender "f" ou "m"', () => {
  const problemas = [];
  for (const [id, ident] of Object.entries(identities)) {
    if (ident?.gender !== 'f' && ident?.gender !== 'm') {
      problemas.push(`${id}: gender ${JSON.stringify(ident?.gender)}`);
    }
  }
  if (Object.keys(identities).length === 0) problemas.push('DSH_EXPRESSIONS.identities vazio ou ausente');
  assert.equal(problemas.length, 0, 'gender em falta nas identidades:\n' + problemas.join('\n'));
});

test('identidades aleatórias femininas nunca têm barba/bigode ("mulher de bigode" proibida)', () => {
  const problemas = [];
  for (const id of (Array.isArray(EXPR?.randomIdentityIds) ? EXPR.randomIdentityIds : [])) {
    const ident = identities[id];
    if (ident?.gender === 'f' && ident?.facialHairType !== 'Blank') {
      problemas.push(`${id}: feminina com facialHairType ${JSON.stringify(ident?.facialHairType)}`);
    }
  }
  assert.equal(problemas.length, 0, problemas.join('\n'));
});

test('identidades aleatórias: topType todos distintos e zero chapéus/bonés ("o boné repetido" proibido)', () => {
  const CHAPEUS = new Set(['Hat', 'WinterHat1', 'WinterHat2', 'WinterHat3', 'WinterHat4']);
  const tops = (Array.isArray(EXPR?.randomIdentityIds) ? EXPR.randomIdentityIds : [])
    .map((id) => identities[id]?.topType);
  const problemas = [];
  const repetidos = [...new Set(tops.filter((t, i) => tops.indexOf(t) !== i))];
  if (repetidos.length > 0) problemas.push('topType repetido: ' + repetidos.join(', '));
  const chapeus = tops.filter((t) => CHAPEUS.has(t));
  if (chapeus.length > 0) problemas.push('chapéu/boné na piscina: ' + chapeus.join(', '));
  assert.equal(problemas.length, 0, problemas.join('\n'));
});

test('identidades aleatórias: sem óculos de lente opaca (as expressões têm de se ver)', () => {
  const OPACOS = new Set(['Sunglasses', 'Wayfarers']);
  const problemas = [...(Array.isArray(EXPR?.randomIdentityIds) ? EXPR.randomIdentityIds : [])]
    .filter((id) => OPACOS.has(identities[id]?.accessoriesType))
    .map((id) => `${id}: ${identities[id]?.accessoriesType}`);
  assert.equal(problemas.length, 0, 'óculos opacos na piscina: ' + problemas.join(', '));
});

test('basePreset é "idle"', () => {
  assert.equal(EXPR?.basePreset, 'idle', `basePreset deve ser "idle" (encontrado: ${JSON.stringify(EXPR?.basePreset)})`);
});

test('resolve() devolve caminhos existentes em disco para todos os pares identidade × preset', () => {
  const problemas = [];
  const pares = Object.entries(identities);
  if (pares.length === 0) problemas.push('DSH_EXPRESSIONS.identities está vazio ou ausente');
  for (const [id, ident] of pares) {
    const lista = Array.isArray(ident?.presets) ? ident.presets : [];
    if (lista.length === 0) problemas.push(`identidade "${id}": lista de presets vazia ou ausente`);
    for (const presetId of lista) {
      const caminho = resolveFn(id, presetId);
      if (typeof caminho !== 'string' || caminho === '') {
        problemas.push(`resolve("${id}", "${presetId}") devolveu ${JSON.stringify(caminho)}`);
      } else if (!fs.existsSync(path.join(ROOT, caminho))) {
        problemas.push(`resolve("${id}", "${presetId}") -> "${caminho}" não existe em disco`);
      }
    }
  }
  assert.equal(problemas.length, 0, 'Pares identidade × preset sem asset em disco:\n' + problemas.join('\n'));
});

test('resolve() cai para o preset base "idle" quando o preset pedido não existe', () => {
  const problemas = [];
  for (const id of Object.keys(identities)) {
    const esperado = resolveFn(id, 'idle');
    const obtido = resolveFn(id, 'preset-que-nao-existe');
    if (obtido !== esperado) {
      problemas.push(`resolve("${id}", <inexistente>) devolveu ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)} (preset base "idle")`);
    }
  }
  if (Object.keys(identities).length === 0) problemas.push('DSH_EXPRESSIONS.identities está vazio ou ausente');
  assert.equal(problemas.length, 0, 'Cadeia de fallback de preset falhou:\n' + problemas.join('\n'));
});

test('resolve() devolve null para identidade desconhecida', () => {
  const problemas = [];
  for (const presetId of ['idle', 'working', 'preset-que-nao-existe']) {
    const obtido = resolveFn('identidade-que-nao-existe', presetId);
    if (obtido !== null) {
      problemas.push(`resolve("identidade-que-nao-existe", "${presetId}") devolveu ${JSON.stringify(obtido)}, esperado null`);
    }
  }
  assert.equal(problemas.length, 0, 'Fallback de identidade desconhecida falhou:\n' + problemas.join('\n'));
});

/* ------------------------------------------------------------------ */
/* index.html — estrutura e ordem de carregamento                      */
/* ------------------------------------------------------------------ */

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('index.html não tem sidebar (nem elemento nem classe "sidebar")', () => {
  assert.ok(
    !/\bsidebar\b/i.test(html),
    'index.html não deve conter sidebar (o layout da demo não tem barra lateral): ocorrência de "sidebar" encontrada no markup'
  );
});

test('index.html não tem cabeçalho de sala (studio-toolbar)', () => {
  assert.ok(
    !html.includes('studio-toolbar'),
    'index.html não deve conter o cabeçalho de sala "studio-toolbar" (a demo usa um único cabeçalho global)'
  );
});

test('index.html tem os ids essenciais da UI (viewport, world, inspector, diálogos, toast e controlos)', () => {
  const idsEssenciais = [
    'viewport', 'world', 'inspector',
    'workspace-dialog', 'recruit-dialog', 'delegate-dialog',
    'papers-dialog', 'archive-dialog', 'question-sheet', 'question-overlay', 'live-feed',
    'pending-questions', 'archive-button',
    'toast', 'zoom-in', 'zoom-out', 'fit-scene', 'reset-demo'
  ];
  const emFalta = idsEssenciais.filter((id) => !new RegExp(`\\bid="${id}"`).test(html));
  assert.deepEqual(emFalta, [], 'Ids essenciais em falta em index.html: ' + emFalta.map((id) => '#' + id).join(', '));
});

test('index.html carrega exatamente data.js, expressions.js e app.js por ordem', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(
    scripts, ['data.js', 'expressions.js', 'app.js'],
    `Ordem/conjunto de scripts divergente (encontrado: ${JSON.stringify(scripts)}); o contrato exige exatamente data.js, expressions.js, app.js por ordem`
  );
});

/* ------------------------------------------------------------------ */
/* README.md — links e instrução de execução                           */
/* ------------------------------------------------------------------ */

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

test('todos os links relativos do README.md apontam para ficheiros existentes', () => {
  const alvos = [...readme.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g)].map((m) => m[1]);
  const emFalta = [];
  for (const alvo of alvos) {
    if (alvo.startsWith('#')) continue;                       // âncora interna
    if (/^[a-z][a-z0-9+.-]*:/i.test(alvo)) continue;          // URL externa (http:, https:, mailto: …)
    if (alvo.startsWith('//')) continue;                      // URL externa protocolo-relativa
    const semAncora = alvo.split('#')[0];
    if (semAncora === '') continue;
    if (!fs.existsSync(path.join(ROOT, semAncora))) emFalta.push(alvo);
  }
  assert.deepEqual(emFalta, [], 'Links relativos do README.md para ficheiros inexistentes: ' + emFalta.join(', '));
});

test('README.md documenta como servir a demo com python3 -m http.server', () => {
  assert.ok(
    readme.includes('python3 -m http.server'),
    'README.md deve mencionar "python3 -m http.server" como forma de servir a demo em HTTP local'
  );
});
