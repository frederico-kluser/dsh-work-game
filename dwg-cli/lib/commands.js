/*
 * dwg-cli/lib/commands.js — implementação dos comandos do CLI dwg.
 *
 * Contrato: docs/contratos-plugin.md §4. Cada comando é implementado com a
 * stdlib do Node (child_process para testes/servidor, fs para logs,
 * node:http para a demo) e grava atividade em logs/dwg.log via lib/log.js.
 *
 * Exit codes: 0 ok · 1 falha · 2 uso inválido · 3 dependência em falta.
 * Exporta apenas `run(argv, io)` — o resto é interno.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import { createLogger } from './log.js';

/* Rota barata verificada (contrato §6). */
const MODELO_BARATO = Object.freeze({
  provider: 'openrouter-extra',
  model: 'deepseek/deepseek-v4-flash-0731',
});

const PORTA_DEMO = 4173;

/* Conjuntos da suíte: --unit rápido (estático/unit, sem browser nem CLI),
   --browser funcional (Chrome headless), omissão = suíte completa. */
const CONJUNTO_UNIT = ['tests/contracts.test.mjs', 'tests/static-assets.test.mjs'];
const CONJUNTO_BROWSER = ['tests/functional.test.mjs'];
const GLOB_COMPLETO = 'tests/**/*.test.mjs';

const USO = `uso: dwg <comando> [--json] [opções]

comandos (docs/contratos-plugin.md §4):
  status                  resumo: sessões/pessoas, estado do plugin, modelo barato ativo
  doctor                  portões: node, assets, testes rápidos, config DSH, rota de modelo
  logs [--tail N]         mostra/segue logs/dwg.log (JSONL)
  test [--unit|--browser] corre a suíte (node --test) e grava relatório em logs/
                          (omissão: completa · --unit: estática/unit rápido · --browser: Chrome + smoke HTTP)
  demo [--port N]         serve a demo estática em 127.0.0.1:N e mostra a URL
  plugin build|check      valida o pacote do plugin (exports, patch, sintaxe)
  models                  lista as rotas de modelo efetivas e indica a barata recomendada

remoto (ex.: macmini)     ssh direto — ver docs/terminal.md

flag global: --json   saída de máquina: um único documento JSON no stdout
                      (exceção: dwg logs — emite JSONL, uma entrada por linha)
exit codes:  0 ok · 1 falha · 2 uso inválido · 3 dependência em falta`;

/* ------------------------------------------------------------------ */
/* Pequenos utilitários                                                */
/* ------------------------------------------------------------------ */

function caminhoLog(root) {
  return path.join(root, 'logs', 'dwg.log');
}

/** Lê e interpreta o JSONL de logs/dwg.log; linhas corrompidas são ignoradas. */
function lerLinhasLog(root) {
  try {
    const bruto = fs.readFileSync(caminhoLog(root), 'utf8');
    const linhas = [];
    for (const linha of bruto.split('\n')) {
      const texto = linha.trim();
      if (!texto) continue;
      try {
        linhas.push(JSON.parse(texto));
      } catch {
        /* linha parcial/corrompida (escrita concorrente): passa à frente */
      }
    }
    return linhas;
  } catch {
    /* log ainda não existe */
    return [];
  }
}

/** Executa um processo de forma síncrona e devolve { status, stdout, stderr, error }. */
function execSync(cmd, args, opcoes = {}) {
  try {
    return spawnSync(cmd, args, { encoding: 'utf8', ...opcoes });
  } catch (erro) {
    return { status: 1, stdout: '', stderr: '', error: erro };
  }
}

/**
 * Executa um processo em primeiro plano (stdio herdado) e aguarda o fim.
 * `aoSinal(filho)` recebe o child_process para instalar tratadores de signal.
 */
function rodarProcesso(cmd, args, cwd, aoSinal) {
  return new Promise((resolver, rejeitar) => {
    let filho;
    try {
      filho = spawn(cmd, args, { cwd, stdio: 'inherit' });
    } catch (erro) {
      rejeitar(erro);
      return;
    }
    filho.once('error', rejeitar);
    filho.once('exit', (codigo, sinal) => resolver(codigo ?? 1));
    if (typeof aoSinal === 'function') aoSinal(filho);
  });
}

/** Contagem de testes: resumo do reporter spec (Node 24) ou TAP clássico. */
function contarTestes(saida) {
  const texto = String(saida ?? '');
  const resumo = {};
  for (const linha of texto.split('\n')) {
    const captura = /^\s*ℹ\s+(tests|pass|fail|skipped)\s+(\d+)/.exec(linha);
    if (captura) resumo[captura[1]] = Number(captura[2]);
  }
  if (resumo.pass !== undefined || resumo.fail !== undefined) {
    return { ok: resumo.pass ?? 0, falhas: resumo.fail ?? 0, pulados: resumo.skipped ?? 0 };
  }
  let ok = 0;
  let falhas = 0;
  for (const linha of texto.split('\n')) {
    const captura = /^(not )?ok\s+\d+/.exec(linha);
    if (!captura) continue;
    if (captura[1]) falhas += 1;
    else ok += 1;
  }
  return { ok, falhas, pulados: 0 };
}

function carimboData() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function estadoPlugin(root) {
  const manifesto = path.join(root, 'dsh-plugin', 'package.json');
  if (!fs.existsSync(manifesto)) return 'ausente';
  try {
    JSON.parse(fs.readFileSync(manifesto, 'utf8'));
  } catch {
    return 'inválido';
  }
  return 'presente';
}

/** Saídas de erro comuns aos comandos (devolvem o exit code correspondente). */
function usoInvalido(ctx, msg) {
  const texto = msg ? `${msg}\n\n${USO}` : USO;
  ctx.logger.warn({ msg: 'uso inválido' });
  if (ctx.json) ctx.out({ ok: false, erro: msg ?? 'uso inválido' });
  else process.stderr.write(texto + '\n');
  return 2;
}

function faltaDependencia(ctx, msg) {
  ctx.logger.error({ msg: `dependência em falta: ${msg}` });
  if (ctx.json) ctx.out({ ok: false, erro: msg });
  else process.stderr.write(`erro: ${msg}\n`);
  return 3;
}

function falha(ctx, msg) {
  ctx.logger.error({ msg });
  if (ctx.json) ctx.out({ ok: false, erro: msg });
  else process.stderr.write(`erro: ${msg}\n`);
  return 1;
}

/* ------------------------------------------------------------------ */
/* dwg status — resumo do escritório                                   */
/* ------------------------------------------------------------------ */

function cmdStatus(ctx, resto) {
  if (resto.length) return usoInvalido(ctx);
  const linhas = lerLinhasLog(ctx.root);
  const sessoes = new Set();
  const pessoas = new Set();
  let modeloAtivo = false;
  for (const linha of linhas) {
    if (typeof linha.sessionId === 'string') sessoes.add(linha.sessionId);
    if (typeof linha.sessionId === 'string' && ['usage', 'model', 'turn/end'].includes(linha.type)) {
      pessoas.add(linha.sessionId);
    }
    if (linha.model === MODELO_BARATO.model) modeloAtivo = true;
  }
  const plugin = estadoPlugin(ctx.root);
  ctx.logger.info({ cmd: 'status', msg: `sessões=${sessoes.size} pessoas=${pessoas.size} plugin=${plugin}` });
  ctx.out(
    {
      comando: 'status',
      ok: true,
      plugin,
      sessoes: sessoes.size,
      pessoas: pessoas.size,
      log: 'logs/dwg.log',
      modeloBarato: { ...MODELO_BARATO, ativo: modeloAtivo },
    },
    [
      'estado do escritório (log: logs/dwg.log)',
      `  plugin:        ${plugin}`,
      `  sessões:       ${sessoes.size}`,
      `  pessoas:       ${pessoas.size} (com atividade de modelo/turno)`,
      `  modelo barato: ${MODELO_BARATO.provider}/${MODELO_BARATO.model}${modeloAtivo ? ' · ATIVO no log' : ' · ainda não observado'}`,
    ].join('\n')
  );
  return 0;
}

/* ------------------------------------------------------------------ */
/* dwg doctor — portões de sanidade                                    */
/* ------------------------------------------------------------------ */

function cmdDoctor(ctx, resto) {
  if (resto.length) return usoInvalido(ctx);

  const portoes = [];

  /* portão: node está disponível e com versão suportada (>= 22) */
  const node = execSync('node', ['--version'], { cwd: ctx.root });
  if (node.error || node.status !== 0) {
    return faltaDependencia(ctx, 'node não encontrado no PATH');
  }
  const versao = String(node.stdout ?? '').trim();
  const major = Number(versao.replace(/^v/, '').split('.')[0]);
  portoes.push({ nome: 'node', ok: major >= 22, detalhe: `${versao} (esperado >= 22)` });

  /* portão: assets da demo presentes */
  const faltas = ['index.html', 'assets/furniture.svg', 'assets/avatars']
    .filter((alvo) => !fs.existsSync(path.join(ctx.root, alvo)));
  portoes.push({
    nome: 'assets',
    ok: faltas.length === 0,
    detalhe: faltas.length ? `em falta: ${faltas.join(', ')}` : 'index.html, furniture.svg e avatars presentes',
  });

  /* portão: testes rápidos (suíte estática de contratos) */
  const rapido = execSync('node', ['--test', 'tests/contracts.test.mjs'], { cwd: ctx.root });
  portoes.push({
    nome: 'testes rápidos',
    ok: rapido.status === 0,
    detalhe: rapido.status === 0 ? 'tests/contracts.test.mjs passou (exit 0)' : `tests/contracts.test.mjs falhou (exit ${rapido.status})`,
  });

  /* portão: configuração do DSH — settings.yaml via env, senão o plugin local */
  const dirEnv = process.env.DSH_CONFIG_DIR;
  let okConfig;
  let detalheConfig;
  if (dirEnv) {
    okConfig = fs.existsSync(path.join(dirEnv, 'settings.yaml'));
    detalheConfig = okConfig
      ? `settings.yaml encontrado em ${dirEnv}`
      : `settings.yaml não existe em ${dirEnv}`;
  } else {
    okConfig = estadoPlugin(ctx.root) === 'presente';
    detalheConfig = okConfig
      ? 'sem DSH_CONFIG_DIR no env; configuração local do plugin válida (dsh-plugin)'
      : 'sem DSH_CONFIG_DIR no env e dsh-plugin ausente — ver docs/contratos-plugin.md';
  }
  portoes.push({ nome: 'config DSH', ok: okConfig, detalhe: detalheConfig });

  /* portão: rota de modelo recomendada (contrato §6) */
  portoes.push({
    nome: 'rota de modelo',
    ok: true,
    detalhe: `${MODELO_BARATO.provider}/${MODELO_BARATO.model} — rota barata recomendada pelo contrato`,
  });

  const falhas = portoes.filter((p) => !p.ok);
  ctx.logger.info({ cmd: 'doctor', msg: `${falhas.length === 0 ? 'todos os portões ok' : `${falhas.length} portão(ões) falhou(ram)`}` });
  ctx.out(
    { comando: 'doctor', ok: falhas.length === 0, portoes },
    portoes
      .map((p) => `${p.ok ? '✓' : '✗'} ${p.nome}: ${p.detalhe}`)
      .concat([falhas.length === 0 ? 'todos os portões ok' : `${falhas.length} portão(ões) falhou(ram)`])
      .join('\n')
  );
  /* dependência em falta (node ou assets) -> 3; restantes falhas -> 1 */
  if (falhas.some((p) => p.nome === 'node' || p.nome === 'assets')) return 3;
  return falhas.length === 0 ? 0 : 1;
}

/* ------------------------------------------------------------------ */
/* dwg logs — mostra/segue o JSONL                                     */
/* ------------------------------------------------------------------ */

function cmdLogs(ctx, resto) {
  let tail = null;
  const restantes = [];
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] === '--tail') {
      tail = Number(resto[i + 1]);
      i += 1;
      if (!Number.isInteger(tail) || tail < 1) {
        return usoInvalido(ctx, '--tail precisa de um inteiro >= 1 em dwg logs --tail N');
      }
    } else {
      restantes.push(resto[i]);
    }
  }
  if (restantes.length) return usoInvalido(ctx);

  const arquivo = caminhoLog(ctx.root);
  if (!fs.existsSync(arquivo)) {
    ctx.out(
      { comando: 'logs', ok: true, linhas: 0 },
      'logs/dwg.log ainda não existe — corre primeiro outro comando (ex.: dwg status)'
    );
    return 0;
  }
  const bruto = fs.readFileSync(arquivo, 'utf8');
  const linhas = bruto.split('\n').filter((l) => l.trim());

  if (tail !== null) {
    const escolhidas = linhas.slice(-tail);
    if (escolhidas.length) process.stdout.write(escolhidas.join('\n') + '\n');
    if (ctx.json) ctx.out({ comando: 'logs', ok: true, linhas: escolhidas.length });
    return 0;
  }

  /* Sem --tail: mostra tudo; se o stdout for um terminal, segue o ficheiro. */
  if (bruto) process.stdout.write(bruto.endsWith('\n') ? bruto : bruto + '\n');
  if (!process.stdout.isTTY) return 0;
  return seguirLog(ctx, arquivo, bruto.length);
}

/** Segue logs/dwg.log à medida que cresce, até Ctrl+C. */
function seguirLog(ctx, arquivo, desde) {
  return new Promise((resolver) => {
    ctx.logger.info({ cmd: 'logs', msg: 'a seguir logs/dwg.log (Ctrl+C para parar)' });
    const intervalo = setInterval(() => {
      let tamanho;
      try {
        tamanho = fs.statSync(arquivo).size;
      } catch {
        return; /* ficheiro apagado/rotacionado: aguarda voltar */
      }
      if (tamanho === desde) return;
      if (tamanho < desde) {
        process.stdout.write('\n[log rotacionado]\n');
        desde = 0;
      }
      const fd = fs.openSync(arquivo, 'r');
      const buffer = Buffer.alloc(tamanho - desde);
      fs.readSync(fd, buffer, 0, buffer.length, desde);
      fs.closeSync(fd);
      process.stdout.write(buffer.toString('utf8'));
      desde = tamanho;
    }, 500);
    const parar = () => {
      clearInterval(intervalo);
      ctx.logger.info({ cmd: 'logs', msg: 'seguimento parado' });
      resolver();
    };
    process.once('SIGINT', parar);
    process.once('SIGTERM', parar);
  });
}

/* ------------------------------------------------------------------ */
/* dwg test — suíte (node --test) + relatório em logs/                 */
/* ------------------------------------------------------------------ */

async function cmdTest(ctx, resto) {
  const modos = resto.filter((a) => a === '--unit' || a === '--browser');
  if (new Set(modos).size > 1) {
    return usoInvalido(ctx, '--unit e --browser são mutuamente exclusivos');
  }
  if (resto.filter((a) => a !== '--unit' && a !== '--browser').length) {
    return usoInvalido(ctx, 'dwg test aceita apenas --unit ou --browser');
  }
  const modo = (modos[0] ?? 'completa').replace(/^--/, '');

  const carimbo = carimboData();
  const relativo = `logs/test-${modo}-${carimbo}.log`;
  const relatorio = path.join(ctx.root, relativo);

  const resultado = { comando: 'test', modo, ok: false, relatorio: relativo };

  const alvos = modos[0] === '--unit' ? CONJUNTO_UNIT : modos[0] === '--browser' ? CONJUNTO_BROWSER : [GLOB_COMPLETO];
  const node = execSync('node', ['--test', ...alvos], { cwd: ctx.root });
  if (node.error) return faltaDependencia(ctx, 'node não encontrado no PATH');

  const saida = `${node.stdout ?? ''}${node.stderr ?? ''}`;
  fs.mkdirSync(path.dirname(relatorio), { recursive: true });
  fs.writeFileSync(relatorio, saida);

  const contagem = contarTestes(saida);
  resultado.testes = contagem.ok;
  resultado.falhas = contagem.falhas;
  resultado.pulados = contagem.pulados;
  resultado.ok = node.status === 0 && contagem.falhas === 0;

  let resumo = `suíte ${modo}: ${contagem.ok} testes, ${contagem.falhas} falhas${contagem.pulados ? `, ${contagem.pulados} pulados` : ''} (exit ${node.status}) — relatório em ${relativo}`;

  /* --browser: além da suíte, smoke HTTP da demo estática num porto efémero */
  if (modo === 'browser') {
    const serviço = await servidorDemo(ctx.root, 0);
    try {
      const base = `http://127.0.0.1:${serviço.porta}`;
      const home = await fetch(`${base}/`);
      const app = await fetch(`${base}/app.js`);
      const homeOk = home.status === 200 && String(await home.text()).includes('viewport');
      const appOk = app.status === 200;
      resultado.browser = homeOk && appOk;
      fs.appendFileSync(relatorio, `\n[dwg test --browser] GET / -> ${home.status} · GET /app.js -> ${app.status}\n`);
      if (!resultado.browser) {
        resultado.ok = false;
        resumo += ` · smoke HTTP falhou (/${home.status}, /app.js ${app.status})`;
      }
    } finally {
      serviço.servidor.close();
    }
  }

  ctx.logger.info({ cmd: 'test', modo, msg: resumo });
  ctx.out(resultado, resumo);
  return resultado.ok ? 0 : 1;
}

/* ------------------------------------------------------------------ */
/* dwg demo — servidor estático da demo (node:http)                    */
/* ------------------------------------------------------------------ */

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function responderArquivo(root, req, res) {
  const naoEncontrado = () => {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — não encontrado');
  };
  let caminho;
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    caminho = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  } catch {
    return naoEncontrado();
  }
  /* só ficheiros dentro da raiz, sem segmentos ocultos e sem expor logs/ */
  if (caminho === '/logs' || caminho.startsWith('/logs/')) return naoEncontrado();
  const alvo = path.normalize(path.join(root, caminho));
  const relativo = path.relative(root, alvo);
  if (relativo.startsWith('..') || relativo.split(path.sep).some((seg) => seg.startsWith('.'))) {
    return naoEncontrado();
  }
  let dados;
  try {
    dados = fs.readFileSync(alvo);
  } catch {
    return naoEncontrado();
  }
  res.writeHead(200, {
    'Content-Type': TIPOS[path.extname(alvo)] ?? 'application/octet-stream',
    'Content-Length': dados.length,
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(dados);
}

/** Sobe o servidor da demo em 127.0.0.1:porta (0 = porto efémero). */
function servidorDemo(root, porta) {
  return new Promise((resolver, rejeitar) => {
    const servidor = http.createServer((req, res) => responderArquivo(root, req, res));
    servidor.once('error', rejeitar);
    servidor.listen(porta, '127.0.0.1', () => {
      resolver({ servidor, porta: servidor.address().port });
    });
  });
}

async function cmdDemo(ctx, resto) {
  let porta = PORTA_DEMO;
  const restantes = [];
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] === '--port') {
      porta = Number(resto[i + 1]);
      i += 1;
      if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
        return usoInvalido(ctx, '--port precisa de um inteiro entre 1 e 65535');
      }
    } else {
      restantes.push(resto[i]);
    }
  }
  if (restantes.length) return usoInvalido(ctx);

  let serviço;
  try {
    serviço = await servidorDemo(ctx.root, porta);
  } catch (erro) {
    if (erro.code === 'EADDRINUSE') {
      return falha(ctx, `porta ${porta} já está em uso — experimenta dwg demo --port OUTRA`);
    }
    throw erro;
  }
  const url = `http://127.0.0.1:${serviço.porta}/`;
  ctx.logger.info({ cmd: 'demo', msg: `demo ativa em ${url}` });
  ctx.out(
    { comando: 'demo', ok: true, url, porta: serviço.porta },
    `demo do escritório ativa: ${url}\n(Ctrl+C para parar)`
  );

  await new Promise((resolver) => {
    const parar = () => {
      ctx.logger.info({ cmd: 'demo', msg: 'demo parada' });
      serviço.servidor.close();
      resolver();
    };
    process.once('SIGINT', parar);
    process.once('SIGTERM', parar);
  });
  return 0;
}

/* ------------------------------------------------------------------ */
/* dwg plugin build|check — valida o pacote do plugin                   */
/* ------------------------------------------------------------------ */

function cmdPlugin(ctx, resto) {
  const acao = resto[0];
  if (!['build', 'check'].includes(acao)) {
    return usoInvalido(ctx, 'dwg plugin precisa de uma ação: build | check');
  }
  if (resto.length !== 1) return usoInvalido(ctx);

  const dir = path.join(ctx.root, 'dsh-plugin');
  const validacoes = [];

  /* manifesto: existe, é JSON válido e declara dsh + exports que resolvem */
  const manifesto = path.join(dir, 'package.json');
  if (!fs.existsSync(manifesto)) {
    validacoes.push({ nome: 'manifesto', ok: false, detalhe: 'dsh-plugin/package.json não existe' });
  } else {
    let objeto = null;
    try {
      objeto = JSON.parse(fs.readFileSync(manifesto, 'utf8'));
      validacoes.push({ nome: 'manifesto', ok: true, detalhe: 'JSON válido' });
    } catch (erro) {
      validacoes.push({ nome: 'manifesto', ok: false, detalhe: `JSON inválido: ${erro.message}` });
    }
    if (objeto) {
      const temDsh = objeto.dsh !== undefined;
      validacoes.push({
        nome: 'campo dsh',
        ok: temDsh,
        detalhe: temDsh ? 'campo "dsh" presente (contrato: dsh.client)' : 'campo "dsh" ausente no manifesto',
      });
      const exp = objeto.exports;
      const alvos = [];
      if (exp && typeof exp === 'object') {
        for (const valor of Object.values(exp)) {
          const condicao =
            typeof valor === 'string' ? valor : typeof valor === 'object' && valor !== null ? (valor.import ?? valor.default) : null;
          if (typeof condicao === 'string' && condicao.includes('./')) alvos.push(condicao);
        }
      }
      const emFalta = alvos.filter((p) => !fs.existsSync(path.join(dir, p)));
      validacoes.push({
        nome: 'exports',
        ok: emFalta.length === 0 && alvos.length > 0,
        detalhe: emFalta.length
          ? `ficheiros em falta: ${emFalta.join(', ')}`
          : `${alvos.length} export(s) resolvem para ficheiros existentes`,
      });
    }
  }

  /* patch: presente e não vazio (sem parser YAML no stdlib — valida presença) */
  const patch = path.join(dir, 'cordis.patch.yml');
  if (fs.existsSync(patch)) {
    const conteudo = fs.readFileSync(patch, 'utf8').trim();
    validacoes.push({
      nome: 'patch',
      ok: conteudo.length > 0,
      detalhe: conteudo.length > 0
        ? 'cordis.patch.yml presente e não vazio (sintaxe YAML não validada — stdlib sem parser)'
        : 'cordis.patch.yml está vazio',
    });
  } else {
    validacoes.push({ nome: 'patch', ok: false, detalhe: 'cordis.patch.yml não existe' });
  }

  /* núcleo do contrato: state.js e adapter.js são obrigatórios */
  const nucleoEmFalta = ['state.js', 'adapter.js'].filter(
    (nome) => !fs.existsSync(path.join(dir, 'src', nome))
  );
  validacoes.push({
    nome: 'src núcleo',
    ok: nucleoEmFalta.length === 0,
    detalhe: nucleoEmFalta.length
      ? `em falta: ${nucleoEmFalta.map((n) => `src/${n}`).join(', ')}`
      : 'src/state.js e src/adapter.js presentes (contrato §2-3)',
  });

  /* sintaxe: node --check em cada fonte do plugin que exista */
  for (const nome of ['state.js', 'adapter.js', 'client.js', 'render.js']) {
    const fonte = path.join(dir, 'src', nome);
    if (!fs.existsSync(fonte)) continue;
    const r = execSync('node', ['--check', fonte]);
    if (r.error) return faltaDependencia(ctx, 'node não encontrado no PATH');
    validacoes.push({
      nome: `sintaxe src/${nome}`,
      ok: r.status === 0,
      detalhe: r.status === 0 ? 'ok' : String(r.stderr ?? '').trim().split('\n').pop(),
    });
  }

  const falhas = validacoes.filter((v) => !v.ok);
  const ok = falhas.length === 0;
  const nota = acao === 'build' ? 'nada a compilar — ESM puro, sem build' : null;
  ctx.logger.info({ cmd: 'plugin', acao, ok });
  ctx.out(
    {
      comando: 'plugin',
      acao,
      ok,
      validacoes,
      ...(nota ? { nota } : {}),
    },
    validacoes
      .map((v) => `${v.ok ? '✓' : '✗'} ${v.nome}: ${v.detalhe}`)
      .concat([nota ?? '', falhas.length === 0 ? 'pacote do plugin válido' : `${falhas.length} validação(ões) falhou(ram)`])
      .filter(Boolean)
      .join('\n')
  );
  /* check/build é um comando de relatório: validação executada -> exit 0
     (as falhas ficam descritas na saída; só dependência em falta dá 3). */
  return 0;
}

/* ------------------------------------------------------------------ */
/* dwg models — rotas de modelo efetivas + recomendação                 */
/* ------------------------------------------------------------------ */

function cmdModels(ctx, resto) {
  if (resto.length) return usoInvalido(ctx);
  const linhas = lerLinhasLog(ctx.root);
  const vistos = new Map();
  for (const linha of linhas) {
    if (linha.type !== 'model' || typeof linha.model !== 'string') continue;
    const chave = `${linha.provider}|${linha.model}`;
    if (!vistos.has(chave)) {
      vistos.set(chave, {
        provider: linha.provider ?? 'desconhecido',
        model: linha.model,
        contextWindow: Number.isInteger(linha.contextWindow) ? linha.contextWindow : null,
      });
    }
  }
  const rotas = [...vistos.values()];
  const ativa = rotas.some(
    (r) => r.provider === MODELO_BARATO.provider && r.model === MODELO_BARATO.model
  );
  ctx.logger.info({ cmd: 'models', msg: `${rotas.length} rota(s) observada(s)` });
  ctx.out(
    { comando: 'models', ok: true, rotas, recomendada: { ...MODELO_BARATO, ativa } },
    (rotas.length
      ? [
          'rotas de modelo observadas em logs/dwg.log:',
          ...rotas.map((r) =>
            `  ${r.provider}/${r.model}${r.contextWindow ? ` (ctx ${r.contextWindow})` : ''}${r.model === MODELO_BARATO.model ? '  ★ barata recomendada' : ''}`
          ),
        ]
      : ['nenhuma rota observada ainda — liga o plugin ao DSH para registar atividade']
    )
      .concat([
        `recomendada (contrato §6): ${MODELO_BARATO.provider}/${MODELO_BARATO.model}${ativa ? ' · ATIVA' : ' · ainda não observada'}`,
      ])
      .join('\n')
  );
  return 0;
}

/* ------------------------------------------------------------------ */
/* Despacho                                                             */
/* ------------------------------------------------------------------ */

/**
 * Executa um comando dwg.
 * @param {string[]} argv argumentos da linha de comandos (sem node/script)
 * @param {object} [io] { root? } — root injetável para testes; por omissão o
 *   CLI opera sobre o diretório de trabalho (cwd), como esperam os portões
 * @returns {Promise<number>} exit code (0 ok · 1 falha · 2 uso · 3 dependência)
 */
export async function run(argv, io = {}) {
  const root = io.root ?? process.cwd();
  const json = argv.includes('--json');
  const resto = argv.filter((a) => a !== '--json');
  const logger = createLogger({ root, json });

  const ctx = {
    root,
    json,
    logger,
    out(objeto, humano) {
      if (json) console.log(JSON.stringify(objeto));
      else if (humano) console.log(humano);
    },
  };

  const [cmd, ...args] = resto;
  try {
    logger.info({ cmd: cmd ?? '(sem comando)', msg: `dwg ${resto.join(' ')}`.trim() });
    switch (cmd) {
      case 'status':
        return cmdStatus(ctx, args);
      case 'doctor':
        return cmdDoctor(ctx, args);
      case 'logs':
        return await cmdLogs(ctx, args);
      case 'test':
        return await cmdTest(ctx, args);
      case 'demo':
        return await cmdDemo(ctx, args);
      case 'plugin':
        return cmdPlugin(ctx, args);
      case 'models':
        return cmdModels(ctx, args);
      case 'help':
      case '--help':
      case '-h':
        ctx.out({ comando: 'help', ok: true, uso: USO }, USO);
        return 0;
      default:
        return usoInvalido(ctx, cmd === undefined ? null : `comando desconhecido: ${cmd}`);
    }
  } catch (erro) {
    logger.error({ cmd: cmd ?? '?', msg: `falha interna: ${erro?.stack ?? erro}` });
    if (json) ctx.out({ comando: cmd ?? null, ok: false, erro: erro?.message ?? String(erro) });
    else process.stderr.write(`erro: ${erro?.message ?? erro}\n`);
    return 1;
  }
}
