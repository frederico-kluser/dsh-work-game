/*
 * dwg-cli/lib/log.js — logger estruturado do CLI dwg.
 *
 * Contrato (docs/contratos-plugin.md §4): grava JSONL — uma linha por objeto
 * JSON — em logs/dwg.log e apresenta o mesmo evento no stdout em texto humano
 * por omissão; com --json, o stdout fica reservado ao documento JSON do
 * comando (o ficheiro JSONL continua a receber a atividade completa).
 * Sem dependências npm, sem segredos, sem caminhos absolutos do utilizador.
 */

import fs from 'node:fs';
import path from 'node:path';

const NIVEIS = new Set(['debug', 'info', 'warn', 'error']);

/**
 * Cria o logger da CLI.
 * @param {object} [opcoes] { root, logFile?, json? }
 *   root — raiz do projeto (resolve caminhos e cria logs/ se preciso);
 *   logFile — caminho relativo a root (default 'logs/dwg.log');
 *   json — true reserva o stdout para o documento JSON do comando
 *          (o ficheiro JSONL continua a receber a atividade completa).
 */
export function createLogger({ root, logFile = 'logs/dwg.log', json = false } = {}) {
  const arquivo = path.resolve(root, logFile);
  let ligado = true;

  /**
   * Escreve uma entrada de log: JSONL no ficheiro e, no stdout, texto humano
   * (em modo --json o stdout não é tocado). Falhas de escrita nunca abatem
   * o comando: são apenas avisos no stderr.
   */
  function emit(level, campos = {}) {
    if (!ligado) return;
    const nivel = NIVEIS.has(level) ? level : 'info';
    const entrada = { t: new Date().toISOString(), nivel, ...campos };
    const texto = JSON.stringify(entrada);
    try {
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      fs.appendFileSync(arquivo, texto + '\n');
    } catch (erro) {
      process.stderr.write(`[dwg] aviso: não foi possível gravar ${logFile}: ${erro.message}\n`);
    }
    if (json) {
      /* modo máquina: o stdout fica reservado ao documento JSON do comando;
         o ficheiro JSONL continua a receber a atividade completa. */
      return;
    }
    const hora = String(entrada.t).slice(11, 19);
    const partes = [`[${hora}]`, nivel.toUpperCase()];
    if (campos.msg) partes.push(campos.msg);
    const extras = Object.entries(campos)
      .filter(([chave]) => chave !== 'msg')
      .map(([chave, valor]) => `${chave}=${typeof valor === 'object' ? JSON.stringify(valor) : valor}`);
    if (extras.length) partes.push('· ' + extras.join(' · '));
    (nivel === 'error' ? process.stderr : process.stdout).write(partes.join(' ') + '\n');
  }

  return {
    emit,
    info: (campos) => emit('info', campos),
    warn: (campos) => emit('warn', campos),
    error: (campos) => emit('error', campos),
    parar: () => {
      ligado = false;
    },
  };
}
