/*
 * tests/static-assets.test.mjs — suíte de TESTES ESTÁTICOS dos assets do
 * projeto "dsh-work-game" (front-end puro HTML/CSS/JS+SVG, zero dependências,
 * zero build).
 *
 * Cobre apenas a camada estática/contratos dos ficheiros em disco:
 *   - todos os SVGs de assets/ são XML bem formado e "seguros" (sem scripts,
 *     sem foreignObject, sem atributos de evento, sem URLs externas, sem
 *     DOCTYPE, sem imagens remotas; hrefs só locais);
 *   - contagens congeladas dos avatares (160 expressões/aleatórios, 8 bustos,
 *     3 assets raiz);
 *   - símbolos obrigatórios de assets/furniture.svg;
 *   - independência e geometria de assets/desk-module.svg;
 *   - higiene do repositório (sem caminhos /home/, sem TODO/FIXME).
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
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/* Infraestrutura mínima                                               */
/* ------------------------------------------------------------------ */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_DIR = path.join(ROOT, 'assets');

const MSG_CONTAGEM =
  'Se a alteração de contagem é INTENCIONAL, atualize este teste de forma deliberada; caso contrário, restaure os assets.';

function rel(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile()) out.push(abs);
  }
  return out.sort();
}

function listSvg(dir) {
  return walk(dir).filter((p) => p.endsWith('.svg'));
}

function parseAttributes(attrText) {
  const attrs = [];
  const re = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("[^"]*"|'[^']*')/g;
  let m;
  while ((m = re.exec(attrText)) !== null) {
    attrs.push({ name: m[1], value: m[2].slice(1, -1) });
  }
  return attrs;
}

/*
 * Parser estrutural mínimo (regex estável, sem bibliotecas):
 * percorre o texto, exige que cada '<' inicie uma tag bem formada, e valida o
 * aninhamento por pilha. Também recolhe nome, atributos e tipo de cada tag.
 */
function parseSvgTags(rawText) {
  const cleaned = rawText
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '');
  const tagRe = /<(\/?)([A-Za-z_][A-Za-z0-9_.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  const tags = [];
  const errors = [];
  const stack = [];
  let cursor = 0;
  while (cursor < cleaned.length) {
    const lt = cleaned.indexOf('<', cursor);
    if (lt === -1) break;
    tagRe.lastIndex = lt;
    const m = tagRe.exec(cleaned);
    if (!m || m.index !== lt) {
      errors.push(`tag mal formada perto de: ${JSON.stringify(cleaned.slice(lt, lt + 40))}`);
      break;
    }
    const closing = m[1] === '/';
    const name = m[2];
    const selfClosing = !closing && /\/\s*$/.test(m[3]);
    tags.push({ name, closing, selfClosing, attrs: parseAttributes(m[3]), raw: m[0] });
    if (closing) {
      const abertura = stack.pop();
      if (abertura !== name) {
        errors.push(`fecho </${name}> não corresponde à abertura <${abertura || '(nenhuma)'}>`);
      }
    } else if (!selfClosing) {
      stack.push(name);
    }
    cursor = tagRe.lastIndex;
  }
  if (stack.length > 0) {
    errors.push(`tags sem fecho: ${stack.join(', ')}`);
  }
  return { tags, errors, cleaned };
}

function attr(tag, name) {
  const found = tag.attrs.find((a) => a.name === name);
  return found ? found.value : null;
}

function todosOsAtributos(analysis, name) {
  const out = [];
  for (const tag of analysis.tags) {
    for (const a of tag.attrs) {
      if (a.name === name) out.push({ tag, value: a.value });
    }
  }
  return out;
}

const svgFiles = listSvg(ASSETS_DIR);
const svgAnalisados = svgFiles.map((file) => {
  const text = fs.readFileSync(file, 'utf8');
  const parsed = parseSvgTags(text);
  return { file, relPath: rel(file), text, ...parsed };
});

/* ------------------------------------------------------------------ */
/* XML bem formado e regras de segurança dos SVGs                       */
/* ------------------------------------------------------------------ */

test('todos os SVGs de assets/ são XML bem formado (tags balanceadas e estrutura consistente)', () => {
  const problemas = [];
  for (const svg of svgAnalisados) {
    if (svg.tags.length === 0) problemas.push(`${svg.relPath}: sem nenhuma tag XML`);
    for (const erro of svg.errors) problemas.push(`${svg.relPath}: ${erro}`);
    const entidades = svg.cleaned.match(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9A-Fa-f]+;)/g);
    if (entidades) problemas.push(`${svg.relPath}: ${entidades.length} '&' sem escape nem entidade válida`);
  }
  assert.equal(
    problemas.length, 0,
    'SVGs mal formados encontrados:\n' + problemas.join('\n')
  );
});

test('todos os SVGs de assets/ têm elemento raiz <svg>', () => {
  const problemas = [];
  for (const svg of svgAnalisados) {
    const raiz = svg.tags[0];
    if (!raiz || raiz.name !== 'svg' || raiz.closing || raiz.selfClosing) {
      problemas.push(`${svg.relPath}: a primeira tag deve ser o elemento raiz <svg> (encontrado: ${raiz ? raiz.raw.slice(0, 40) : '(nenhuma)'})`);
    }
  }
  assert.equal(problemas.length, 0, 'SVGs sem raiz <svg>:\n' + problemas.join('\n'));
});

test('todos os SVGs de assets/ declaram viewBox', () => {
  // NOTA: assets/furniture.svg é uma biblioteca de símbolos — a raiz não tem
  // viewBox porque cada <symbol> tem o seu (necessário para <use> externo).
  // A regra aceita viewBox na raiz OU em todos os símbolos do ficheiro.
  const problemas = [];
  for (const svg of svgAnalisados) {
    const raiz = svg.tags[0];
    const raizTemViewBox = !!raiz && attr(raiz, 'viewBox') !== null;
    const simbolos = svg.tags.filter((t) => t.name === 'symbol' && !t.closing);
    const simbolosSemViewBox = simbolos.filter((t) => attr(t, 'viewBox') === null);
    if (!raizTemViewBox && (simbolos.length === 0 || simbolosSemViewBox.length > 0)) {
      problemas.push(`${svg.relPath}: sem viewBox na raiz e sem viewBox em todos os ${simbolos.length} <symbol>`);
    }
  }
  assert.equal(problemas.length, 0, 'SVGs sem viewBox:\n' + problemas.join('\n'));
});

test('nenhum SVG de assets/ contém <script>', () => {
  const problemas = svgAnalisados
    .filter((svg) => /<script[\s/>]/i.test(svg.text))
    .map((svg) => svg.relPath);
  assert.deepEqual(problemas, [], 'SVGs com <script> (proibido): ' + problemas.join(', '));
});

test('nenhum SVG de assets/ contém <foreignObject>', () => {
  const problemas = svgAnalisados
    .filter((svg) => /<foreignobject[\s/>]/i.test(svg.text))
    .map((svg) => svg.relPath);
  assert.deepEqual(problemas, [], 'SVGs com <foreignObject> (proibido): ' + problemas.join(', '));
});

test('nenhum SVG de assets/ usa atributos de evento on…=', () => {
  const problemas = [];
  for (const svg of svgAnalisados) {
    for (const tag of svg.tags) {
      for (const a of tag.attrs) {
        if (/^on/i.test(a.name)) {
          problemas.push(`${svg.relPath}: atributo de evento "${a.name}" na tag <${tag.name}>`);
        }
      }
    }
  }
  assert.equal(problemas.length, 0, 'Atributos de evento encontrados:\n' + problemas.join('\n'));
});

test('nenhum SVG de assets/ contém <!DOCTYPE>', () => {
  const problemas = svgAnalisados
    .filter((svg) => /<!DOCTYPE/i.test(svg.text))
    .map((svg) => svg.relPath);
  assert.deepEqual(problemas, [], 'SVGs com <!DOCTYPE> (proibido): ' + problemas.join(', '));
});

test('nenhum SVG de assets/ referencia URLs http(s) para além dos namespaces oficiais', () => {
  const problemas = [];
  for (const svg of svgAnalisados) {
    const semNamespaces = svg.text
      .replace(/xmlns=(["'])http:\/\/www\.w3\.org\/2000\/svg\1/g, '')
      .replace(/xmlns:xlink=(["'])http:\/\/www\.w3\.org\/1999\/xlink\1/g, '');
    const m = semNamespaces.match(/https?:\/\/[^"'\s<]*/);
    if (m) problemas.push(`${svg.relPath}: URL externa ${m[0]}`);
  }
  assert.equal(
    problemas.length, 0,
    'URLs externas encontradas (só são permitidos os namespaces xmlns="http://www.w3.org/2000/svg" e xmlns:xlink="http://www.w3.org/1999/xlink"):\n' + problemas.join('\n')
  );
});

test('nenhum SVG de assets/ carrega imagens remotas via <image href="http…">', () => {
  const problemas = [];
  for (const svg of svgAnalisados) {
    for (const tag of svg.tags) {
      if (tag.name !== 'image' || tag.closing) continue;
      for (const nome of ['href', 'xlink:href']) {
        const valor = attr(tag, nome);
        if (valor && /^https?:\/\//i.test(valor)) {
          problemas.push(`${svg.relPath}: <image ${nome}="${valor}">`);
        }
      }
    }
  }
  assert.equal(problemas.length, 0, 'Imagens remotas encontradas:\n' + problemas.join('\n'));
});

test('todos os href/xlink:href dos SVGs de assets/ são fragmentos #… ou caminhos locais', () => {
  const problemas = [];
  for (const svg of svgAnalisados) {
    for (const nome of ['href', 'xlink:href']) {
      for (const { tag, value } of todosOsAtributos(svg, nome)) {
        const valido = value.startsWith('#') || /^(assets|avatars)\//.test(value);
        if (!valido) {
          problemas.push(`${svg.relPath}: <${tag.name} ${nome}="${value}"> não é fragmento #… nem caminho local assets/… ou avatars/…`);
        }
      }
    }
  }
  assert.equal(problemas.length, 0, 'Referências href inválidas:\n' + problemas.join('\n'));
});

/* ------------------------------------------------------------------ */
/* Contagens congeladas dos avatares e assets raiz                      */
/* ------------------------------------------------------------------ */

const EXPRESSIONS_DIR = path.join(ASSETS_DIR, 'avatars', 'expressions');
const RANDOM_DIR = path.join(ASSETS_DIR, 'avatars', 'random');

function subdirs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

test('assets/avatars/expressions/** mantém exatamente 112 SVGs (8 identidades × 14 presets)', () => {
  const problemas = [];
  const identidades = subdirs(EXPRESSIONS_DIR);
  if (identidades.length !== 8) {
    problemas.push(`esperadas 8 identidades nomeadas, encontradas ${identidades.length} (${identidades.join(', ')})`);
  }
  for (const id of identidades) {
    const n = listSvg(path.join(EXPRESSIONS_DIR, id)).length;
    if (n !== 14) problemas.push(`expressions/${id}: esperados 14 presets, encontrados ${n}`);
  }
  const total = listSvg(EXPRESSIONS_DIR).length;
  if (total !== 112) problemas.push(`total de expressões: esperado 112, encontrado ${total}`);
  assert.equal(problemas.length, 0, 'Contagem de expressões divergente:\n' + problemas.join('\n') + '\n' + MSG_CONTAGEM);
});

test('assets/avatars/random/** mantém exatamente 48 SVGs (12 identidades rNN × 4 presets)', () => {
  const problemas = [];
  const identidades = subdirs(RANDOM_DIR);
  if (identidades.length !== 12) {
    problemas.push(`esperadas 12 identidades aleatórias, encontradas ${identidades.length} (${identidades.join(', ')})`);
  }
  for (const id of identidades) {
    const n = listSvg(path.join(RANDOM_DIR, id)).length;
    if (n !== 4) problemas.push(`random/${id}: esperados 4 presets, encontrados ${n}`);
  }
  const total = listSvg(RANDOM_DIR).length;
  if (total !== 48) problemas.push(`total de variantes aleatórias: esperado 48, encontrado ${total}`);
  assert.equal(problemas.length, 0, 'Contagem de avatares aleatórios divergente:\n' + problemas.join('\n') + '\n' + MSG_CONTAGEM);
});

test('há exatamente 160 avatares de expressão/aleatórios (112 + 48)', () => {
  const total = listSvg(EXPRESSIONS_DIR).length + listSvg(RANDOM_DIR).length;
  assert.equal(total, 160, `Esperados 160 avatares (112 expressões + 48 aleatórias), encontrados ${total}. ${MSG_CONTAGEM}`);
});

test('assets/avatars/*.svg mantém exatamente 8 bustos base', () => {
  const bustos = fs.readdirSync(path.join(ASSETS_DIR, 'avatars'))
    .filter((nome) => nome.endsWith('.svg'))
    .sort();
  assert.equal(
    bustos.length, 8,
    `Esperados 8 bustos base em assets/avatars/*.svg, encontrados ${bustos.length}: ${bustos.join(', ')}. ${MSG_CONTAGEM}`
  );
});

test('assets/ mantém os três assets raiz: furniture.svg, desk-module.svg e favicon.svg', () => {
  const emFalta = ['furniture.svg', 'desk-module.svg', 'favicon.svg']
    .filter((nome) => !fs.existsSync(path.join(ASSETS_DIR, nome)));
  assert.deepEqual(emFalta, [], 'Assets raiz em falta em assets/: ' + emFalta.join(', '));
});

/* ------------------------------------------------------------------ */
/* furniture.svg e desk-module.svg                                      */
/* ------------------------------------------------------------------ */

function idsDeSvg(absPath) {
  const parsed = parseSvgTags(fs.readFileSync(absPath, 'utf8'));
  const ids = [];
  for (const tag of parsed.tags) {
    const id = attr(tag, 'id');
    if (id !== null) ids.push(id);
  }
  return ids;
}

test('assets/furniture.svg define os símbolos de móveis usados pela app (desk, chair, laptop, connector, plant, window)', () => {
  const ids = new Set(idsDeSvg(path.join(ASSETS_DIR, 'furniture.svg')));
  const emFalta = ['desk', 'chair', 'laptop', 'connector', 'plant', 'window']
    .filter((nome) => !ids.has(nome));
  assert.deepEqual(emFalta, [], 'Símbolos em falta em assets/furniture.svg: ' + emFalta.join(', '));
});

test('assets/furniture.svg define pelo menos 10 ícones icon-*', () => {
  const icones = idsDeSvg(path.join(ASSETS_DIR, 'furniture.svg'))
    .filter((id) => id.startsWith('icon-'))
    .sort();
  assert.ok(
    icones.length >= 10,
    `Esperados pelo menos 10 ícones icon-* em assets/furniture.svg, encontrados ${icones.length}: ${icones.join(', ')}`
  );
});

test('assets/desk-module.svg é um módulo independente com viewBox 0 0 900 500', () => {
  const parsed = parseSvgTags(fs.readFileSync(path.join(ASSETS_DIR, 'desk-module.svg'), 'utf8'));
  const raiz = parsed.tags[0];
  const viewBox = raiz ? attr(raiz, 'viewBox') : null;
  assert.equal(viewBox, '0 0 900 500', `viewBox da raiz de assets/desk-module.svg deve ser "0 0 900 500" (encontrado: ${viewBox === null ? '(ausente)' : `"${viewBox}"`})`);
});

test('assets/desk-module.svg referencia exatamente quatro cadeiras', () => {
  const parsed = parseSvgTags(fs.readFileSync(path.join(ASSETS_DIR, 'desk-module.svg'), 'utf8'));
  let usos = 0;
  for (const tag of parsed.tags) {
    for (const nome of ['href', 'xlink:href']) {
      const valor = attr(tag, nome);
      if (valor === '#chair') usos += 1;
    }
  }
  assert.equal(usos, 4, `assets/desk-module.svg deve referenciar exatamente 4 cadeiras (#chair), encontradas ${usos}`);
});

/* ------------------------------------------------------------------ */
/* Higiene do repositório (privacidade e pendências)                    */
/* ------------------------------------------------------------------ */

const EXTENSOES_TEXTO = new Set(['.md', '.js', '.html', '.css']);

function ficheirosDeTextoDoProjeto(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) ficheirosDeTextoDoProjeto(abs, out);
    else if (entry.isFile() && EXTENSOES_TEXTO.has(path.extname(entry.name))) out.push(abs);
  }
  return out.sort();
}

const ficheirosDeTexto = ficheirosDeTextoDoProjeto(ROOT);

test('nenhum ficheiro .md/.js/.html/.css do projeto contém caminhos absolutos /home/', () => {
  const padrao = new RegExp('/' + 'home' + '/');
  const problemas = [];
  for (const file of ficheirosDeTexto) {
    const linhas = fs.readFileSync(file, 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      if (padrao.test(linha)) problemas.push(`${rel(file)}:${i + 1}`);
    });
  }
  assert.deepEqual(
    problemas, [],
    'Caminhos absolutos /home/ (privacidade do repo público) encontrados em: ' + problemas.join(', ')
  );
});

test('nenhum ficheiro .md/.js/.html/.css do projeto contém TODO/FIXME por resolver', () => {
  const padrao = /\b(TODO|FIXME)\b/;
  const problemas = [];
  for (const file of ficheirosDeTexto) {
    const linhas = fs.readFileSync(file, 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      const m = linha.match(padrao);
      if (m) problemas.push(`${rel(file)}:${i + 1} (${m[1]})`);
    });
  }
  assert.deepEqual(problemas, [], 'Marcadores TODO/FIXME deixados em: ' + problemas.join(', '));
});
