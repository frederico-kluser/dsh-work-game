/*
 * tests/plugin/cli.test.mjs — suíte de testes do CLI `dwg` (secção 4 de
 * docs/contratos-plugin.md), escrita CONTRA O CONTRATO.
 *
 * Dispara o bin real via child_process e valida:
 *   - cada subcomando do contrato existe e é reconhecido;
 *   - `--json` devolve JSON válido no stdout (JSONL no caso de `logs`);
 *   - exit codes: 0 ok · 2 uso inválido · 3 dependência em falta;
 *   - os comandos escrevem logs em logs/dwg.log (JSONL);
 *   - `dwg doctor` detecta dependência em falta (exit 3).
 *
 * O bin ainda não existe (2026-09-27): enquanto `dwg-cli/bin/dwg` não for
 * implementado, os testes de execução ficam em `skip` (ver SKIP_SEM_BIN).
 * Executar a partir da raiz do projeto:
 *   node --test tests/plugin/
 *
 * Sem rede, sem dependências npm, sem segredos. Caminhos via import.meta.url
 * (nunca /home/<user>). Todo o spawn vai por process.execPath para não
 * depender do bit de execução nem do PATH.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/* Infraestrutura mínima                                               */
/* ------------------------------------------------------------------ */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = path.join(ROOT, 'dwg-cli', 'bin', 'dwg');
const BIN_EXISTE = fs.existsSync(BIN);

/* NOTA: esperando implementação — sem o bin, quem dispara fica em skip;
   ao implementar o CLI, os testes passam a correr automaticamente. */
const SKIP_SEM_BIN = BIN_EXISTE
  ? false
  : 'dwg-cli/bin/dwg ainda não existe (NOTA: esperando implementação)';

/*
 * Dispara `dwg <args>` num subprocesso e devolve resumo estável:
 *   status  → exit code (null se morto pelo timeout);
 *   signal  → sinal recebido (SIGTERM quando derrubado pelo timeout);
 *   stdout/stderr → saídas aparadas;
 *   derrubado → true se o timeout matou o processo (ainda estava a correr).
 */
function rodar(args, { cwd = ROOT, timeoutMs = 10_000 } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });
  return {
    status: r.status,
    signal: r.signal,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim(),
    derrubado: r.signal === 'SIGTERM',
  };
}

/* Interpreta stdout como um único documento JSON e devolve o valor. */
function jsonUnico(texto, rotulo) {
  assert.ok(texto.length > 0, `${rotulo}: stdout vazio com --json`);
  let valor;
  assert.doesNotThrow(() => { valor = JSON.parse(texto); },
    `${rotulo}: stdout não é JSON válido`);
  return valor;
}

/* Diretório temporário vazio (sem assets/) para simular dependência em falta. */
function cwdSemDependencias() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dwg-cli-teste-'));
}

/* ------------------------------------------------------------------ */
/* Cada subcomando existe                                              */
/* ------------------------------------------------------------------ */

/*
 * Tabela dos subcomandos do contrato (secção 4). Regras:
 *   - ok: exit codes aceites; 2 (uso inválido) falha sempre — é o sinal de
 *     comando desconhecido;
 *   - toleraBloqueio: `demo` sobe servidor (fica vivo → matado pelo timeout) —
 *     ser morto pelo timeout conta como reconhecido.
 * O acesso remoto (ex.: macmini) é ssh direto, sem subcomando próprio.
 */
const SUBCOMANDOS = [
  { nome: 'status', args: ['status', '--json'], ok: [0] },
  { nome: 'doctor', args: ['doctor', '--json'], ok: [0] },
  { nome: 'logs', args: ['logs', '--json'], ok: [0] },
  /* --unit mantém o teste rápido; a suíte completa pode sair com 1 se
     alguma parte não estiver verde — reconhecimento é o que aqui importa. */
  { nome: 'test', args: ['test', '--unit', '--json'], ok: [0, 1], timeoutMs: 20_000 },
  { nome: 'plugin check', args: ['plugin', 'check', '--json'], ok: [0] },
  { nome: 'plugin build', args: ['plugin', 'build', '--json'], ok: [0] },
  /* Porta alta aleatória para não colidir com outros servidores locais. */
  {
    nome: 'demo',
    args: ['demo', '--port', String(39000 + Math.floor(Math.random() * 2000)), '--json'],
    ok: [0],
    toleraBloqueio: true,
    timeoutMs: 3_000,
  },
];

test('todos os subcomandos do contrato são reconhecidos', { skip: SKIP_SEM_BIN }, () => {
  for (const sub of SUBCOMANDOS) {
    const r = rodar(sub.args, { timeoutMs: sub.timeoutMs ?? 10_000 });
    const aceite = sub.ok.includes(r.status) || (sub.tolaBloqueio && r.derrubado);
    assert.ok(aceite,
      `${sub.nome}: esperado exit ${sub.ok.join(' ou ')}` +
      `${sub.tolaBloqueio ? ' (ou processo vivo)' : ''}, obtido ` +
      `${r.status ?? 'morto (' + r.signal + ')'}\nstdout: ${r.stdout.slice(0, 400)}\nstderr: ${r.stderr.slice(0, 400)}`);
  }
});

/* ------------------------------------------------------------------ */
/* --json devolve JSON válido                                          */
/* ------------------------------------------------------------------ */

test('--json devolve um objeto JSON válido', { skip: SKIP_SEM_BIN }, () => {
  for (const args of [
    ['status', '--json'],
    ['doctor', '--json'],
    ['models', '--json'],
    ['plugin', 'check', '--json'],
    ['plugin', 'build', '--json'],
    /* NOTA: `test` e `demo` ficam de fora — suíte pesada / servidor.
       Os restantes cobrem o contrato `--json`. */
  ]) {
    const rotulo = args.join(' ');
    const r = rodar(args);
    assert.equal(r.status, 0, `${rotulo}: esperado exit 0, obtido ${r.status}\nstderr: ${r.stderr}`);
    const valor = jsonUnico(r.stdout, rotulo);
    assert.equal(typeof valor, 'object');
    assert.notEqual(valor, null);
    assert.ok(!Array.isArray(valor), `${rotulo}: esperado objeto, obtido array`);
  }
});

test('logs --json devolve JSONL (uma entrada JSON por linha)', { skip: SKIP_SEM_BIN }, () => {
  /* Garante entradas no log antes de o ler. */
  const seed = rodar(['status', '--json']);
  assert.equal(seed.status, 0, `status: esperado exit 0, obtido ${seed.status}`);
  const r = rodar(['logs', '--json']);
  assert.equal(r.status, 0, `logs: esperado exit 0, obtido ${r.status}`);
  const linhas = r.stdout.split('\n').filter((l) => l.trim().length > 0);
  assert.ok(linhas.length > 0, 'logs --json: nenhuma linha emitida');
  for (const linha of linhas) {
    assert.doesNotThrow(() => JSON.parse(linha), `linha não é JSON: ${linha.slice(0, 200)}`);
  }
});

/* ------------------------------------------------------------------ */
/* Exit codes: 0 ok · 2 uso inválido · 3 dependência em falta          */
/* ------------------------------------------------------------------ */

test('exit 0 para execução com sucesso', { skip: SKIP_SEM_BIN }, () => {
  const r = rodar(['status', '--json']);
  assert.equal(r.status, 0, `status: esperado exit 0, obtido ${r.status}\nstderr: ${r.stderr}`);
});

test('exit 2 para uso inválido (comando desconhecido)', { skip: SKIP_SEM_BIN }, () => {
  const r = rodar(['subcomando-inexistente', '--json']);
  assert.equal(r.status, 2, `esperado exit 2 (uso inválido), obtido ${r.status}`);
  assert.ok(r.stdout.length + r.stderr.length > 0, 'uso inválido deve explicar o erro na saída');
});

test('exit 3 para dependência em falta', { skip: SKIP_SEM_BIN }, () => {
  /* Cwd sem assets/ — o doctor deve acusar dependência em falta. */
  const cwd = cwdSemDependencias();
  try {
    const r = rodar(['doctor', '--json'], { cwd });
    assert.equal(r.status, 3, `doctor sem dependências: esperado exit 3, obtido ${r.status}`);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Logs em logs/dwg.log                                                */
/* ------------------------------------------------------------------ */

test('comandos escrevem logs JSONL em logs/dwg.log', { skip: SKIP_SEM_BIN }, () => {
  const r = rodar(['status', '--json']);
  assert.equal(r.status, 0, `status: esperado exit 0, obtido ${r.status}`);

  /* NOTA: o caminho é relativo à raiz do projeto (cwd do spawn = ROOT),
     como manda o layout em docs/contratos-plugin.md (logs/ gitignored). */
  const logPath = path.join(ROOT, 'logs', 'dwg.log');
  assert.ok(fs.existsSync(logPath), `logs/dwg.log não existe após correr status`);

  const conteudo = fs.readFileSync(logPath, 'utf8');
  const linhas = conteudo.split('\n').filter((l) => l.trim().length > 0);
  assert.ok(linhas.length > 0, 'logs/dwg.log está vazio');
  for (const linha of linhas) {
    assert.doesNotThrow(() => JSON.parse(linha), `linha do log não é JSON: ${linha.slice(0, 200)}`);
  }
});

/* ------------------------------------------------------------------ */
/* Doctor detecta dependência em falta                                 */
/* ------------------------------------------------------------------ */

test('doctor acusa dependência em falta (assets) e sai com 3', { skip: SKIP_SEM_BIN }, () => {
  /* Cwd vazio: o portão "assets" do doctor (secção 4) não encontra nada. */
  const cwd = cwdSemDependencias();
  try {
    const r = rodar(['doctor', '--json'], { cwd });
    assert.equal(r.status, 3, `esperado exit 3, obtido ${r.status}\nstdout: ${r.stdout.slice(0, 400)}\nstderr: ${r.stderr.slice(0, 400)}`);
    const saida = (r.stdout + ' ' + r.stderr).toLowerCase();
    assert.match(saida, /assets/,
      'doctor deve nomear a dependência em falta (portão "assets" do contrato)');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});