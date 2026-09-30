/**
 * Entry host do plugin `dsh-work-game-plugin`.
 *
 * O escritório vive no lado browser: o módulo `modules` do web-app lê o bloco
 * `dsh.client` do manifesto (inject + platform) e serve o entrypoint
 * `exports["./client"]`. Este entry é a camada declarada em `cordis.patch.yml`
 * e tem UM único comportamento de host: a PARTILHA (link + QR code) do Modo
 * jogo — contrato em docs/contratos-plugin.md §8.
 *
 * A partilha publica a própria UI do DSH (com o token de sessão) num host
 * EFÉMERO do domínio do utilizador, via o `domain.py` EMBUTIDO no plugin
 * (`dsh-plugin/expose-port/`, toolkit vendored da cloudflare-agent-skill;
 * `up|down|list --json`), e o link fica no ar
 * até o botão "Fechar a ação" mandar `down`:
 *   - a rota é exacta `/api/dsh-work-game/partilha` (canal partilhado /api, que
 *     já aplica a vedação Host/Origin e a autenticação de browser do DSH ANTES
 *     do dispatch — pedido sem sessão válida nem chega aqui);
 *   - o URL publicado é construído NO HOST (`connection.authenticatedUrl`) e
 *     nunca vem do browser — o cliente não escolhe o alvo nem o nome do host;
 *   - `down` recebe SEMPRE o host exacto (nunca `all`, nunca a porta: `down
 *     <porta>` derrubaria também as rotas permanentes do utilizador); a ÚNICA
 *     exceção é a ação `encerrar` ("Encerrar o Cloudflare" do painel, atrás de
 *     confirmação): `down all` — tudo offline, túnel parado, nada apagado;
 *   - o nome do host partilhado é `jogo.<domínio>` (env
 *     `DSH_WORK_GAME_SHARE_NAME` muda o label).
 *
 * Sem build e sem dependências npm: só node:child_process para correr o
 * domain.py embutido (e o qrencode/segno) — a funcionalidade Cloudflare viaja
 * COM o plugin, sem depender de nenhuma skill instalada na máquina.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ── Localização do domain.py (EMBUTIDO; skill instalada só como recurso) ── */

/** `domain.py` vendored com o plugin (cloudflare-agent-skill → dsh-plugin/expose-port/). */
export const DOMAIN_PY_EMBUTIDO = fileURLToPath(new URL('../expose-port/domain.py', import.meta.url));

/**
 * Candidatos ao `domain.py`, por ordem de preferência:
 * 1. `DSH_WORK_GAME_EXPOSE_PORT` (override explícito, ex. para testes/ops);
 * 2. o EMBUTIDO em `dsh-plugin/expose-port/domain.py` (a fonte normal);
 * 3. a cloudflare-agent-skill instalada (recurso legado, se existir).
 */
export function candidatosDomainPy(env = process.env, home = homedir()) {
  const fora = env.DSH_WORK_GAME_EXPOSE_PORT;
  const raizes = [
    env.CLOUDFLARE_AGENT_SKILL_DIR,
    path.join(home, '.dsh', 'skills', 'cloudflare-agent-skill'),
    path.join(home, '.agents', 'skills', 'cloudflare-agent-skill'),
    path.join(home, 'Agent-Skills', 'cloudflare-agent-skill'),
  ].filter(Boolean);
  return [
    ...(fora ? [fora] : []),
    DOMAIN_PY_EMBUTIDO,
    ...raizes.map((r) => path.join(r, 'scripts', 'expose-port', 'domain.py')),
  ];
}

/** Primeiro candidato que exista em disco, ou null (a partilha responde com a solução). */
export function resolverDomainPy(candidatos, existe = existsSync) {
  for (const c of candidatos) { if (existe(c)) return c; }
  return null;
}

/* ── Comandos (execFile, sem shell) ─────────────────────────────────── */

/**
 * Corre um comando sem shell e resolve sempre (nunca lança).
 * @param {string[]} argv comando + argumentos
 * @param {{ timeoutMs?: number, binario?: boolean }} opcoes
 * @returns {Promise<{ code: number, stdout: string|Buffer, stderr: string, erro?: string }>}
 */
export function correrComando(argv, opcoes = {}) {
  const { timeoutMs = 30000, binario = false } = opcoes;
  return new Promise((resolve) => {
    execFile(argv[0], argv.slice(1), {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      encoding: binario ? 'buffer' : 'utf8',
    }, (erro, stdout, stderr) => {
      if (!erro) {
        resolve({ code: 0, stdout: stdout ?? (binario ? Buffer.alloc(0) : ''), stderr: String(stderr ?? '') });
        return;
      }
      resolve({
        code: typeof erro.code === 'number' ? erro.code : 1,
        stdout: stdout ?? (binario ? Buffer.alloc(0) : ''),
        stderr: String(stderr ?? ''),
        erro: erro.killed ? `tempo esgotado (${timeoutMs} ms)` : String(erro.message || erro),
      });
    });
  });
}

/** Última linha de stdout que seja um objeto JSON (o domain.py imprime um por comando). */
export function lerJsonSaida(stdout) {
  const linhas = String(stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = linhas.length - 1; i >= 0; i -= 1) {
    try { return JSON.parse(linhas[i]); } catch { /* não é a linha do JSON */ }
  }
  return null;
}

/* ── QR code (qrencode PNG; segno SVG como recurso) ──────────────────── */

/**
 * Gera o QR code de `dados`.
 * @returns {Promise<{ tipo: 'png'|'svg', dados: string }|null>} PNG data URL ou
 * SVG validado; null quando nenhuma ferramenta responde (o link chega na mesma).
 */
export async function gerarQrCode(dados, correr = correrComando) {
  const png = await correr(['qrencode', '-t', 'PNG', '-o', '-', dados], { timeoutMs: 15000, binario: true });
  const bytes = png.stdout;
  if (png.code === 0 && bytes && bytes.length > 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { tipo: 'png', dados: `data:image/png;base64,${bytes.toString('base64')}` };
  }
  const codigo = 'import segno,sys; print(segno.make(sys.argv[1], error="m").svg_inline())';
  const svg = await correr(['python3', '-c', codigo, dados], { timeoutMs: 15000 });
  const texto = String(svg.stdout ?? '').trim();
  if (svg.code === 0 && /^<svg[\s\S]*<\/svg>$/.test(texto)
    && !/<script|javascript:|on[a-z]+\s*=/i.test(texto)) {
    return { tipo: 'svg', dados: texto };
  }
  return null;
}

/* ── Serviço de partilha (testável: o comando é injetável) ───────────── */

const PROBLEMAS_PROBE = {
  'app-down': 'o túnel está OK mas a app local não respondeu — o link passa a funcionar assim que ela subir',
  'edge-pendente': 'a edge ainda não chega ao túnel — o link funciona em segundos',
  'dns-pendente': 'o DNS ainda está a propagar — o link funciona em segundos',
};

/**
 * A partilha do Modo jogo: um host efémero `nome.<domínio>` → UI do DSH.
 * @param {{ correr?: Function, alvo: () => string, nome?: string, domainPy?: string|null }} opcoes
 *   `alvo()` devolve o URL local COM token (ex.: http://127.0.0.1:3080/?token=…#jogo).
 */
export function criarServicoPartilha(opcoes = {}) {
  const correr = typeof opcoes.correr === 'function' ? opcoes.correr : correrComando;
  const nome = (ops => ops.nome || 'jogo')(opcoes);
  const domainPy = opcoes.domainPy ?? null;
  let memoria = null; // { host, url } da última partilha aberta por este processo

  const semSkill = () => ({
    ok: false,
    erro: 'domain.py não encontrado (embutido em dsh-plugin/expose-port)',
    solucao: 'restaurar o embutido (git checkout -- dsh-plugin/expose-port) ou definir DSH_WORK_GAME_EXPOSE_PORT=/caminho/para/domain.py',
  });

  const alvoUrl = () => {
    try {
      const alvo = typeof opcoes.alvo === 'function' ? opcoes.alvo() : opcoes.alvo;
      return typeof alvo === 'string' && alvo.length > 0 ? alvo : null;
    } catch { return null; /* sem webServer/connection: tratado como alvo indisponível */ }
  };

  /** A rota da partilha em `list --json`: label `nome`, não persistente, do nosso upstream. */
  function encontrarRota(listagem, alvo) {
    if (!listagem || !Array.isArray(listagem.zones)) return null;
    const nosso = new URL(alvo);
    const procura = memoria && memoria.host
      ? (h) => h === memoria.host
      : (h) => String(h).split('.')[0] === nome && String(h).includes('.');
    for (const zona of listagem.zones) {
      for (const rota of zona.routes || []) {
        if (rota.alias_of) continue;
        if (rota.persist) continue; // as rotas permanentes do utilizador não são a partilha
        if (!procura(rota.host)) continue;
        try {
          const u = new URL(rota.upstream);
          if (u.hostname !== nosso.hostname || String(u.port || '') !== String(nosso.port || '')) continue;
        } catch { continue; }
        return rota;
      }
    }
    return null;
  }

  async function listar() {
    const r = await correr([domainPy, 'list', '--json'], { timeoutMs: 30000 });
    return { codigo: r.code, json: lerJsonSaida(r.stdout), bruto: r };
  }

  async function estado() {
    if (!domainPy) return semSkill();
    const alvo = alvoUrl();
    if (!alvo) return { ok: false, erro: 'alvo da partilha indisponível (webServer do DSH)', solucao: 'reabrir o Modo jogo' };
    const { codigo, json, bruto } = await listar();
    if (!json) {
      return { ok: false, erro: `domain.py list falhou: ${bruto.erro || (bruto.stderr || '').trim().split('\n').pop() || `exit ${codigo}`}`, solucao: 'correr `python3 <domain.py> list` no terminal para ver o detalhe' };
    }
    const rota = encontrarRota(json, alvo);
    if (!rota) { memoria = null; return { ok: true, ativo: false }; }
    // O URL público reconstrói-se como o domain.py faz (`public_url`): host
    // efémero + path/query/fragmento do alvo (o token vai na query).
    const u = new URL(alvo);
    const url = `https://${rota.host}${u.pathname}${u.search}${u.hash}`;
    memoria = { host: rota.host, url };
    const qr = await gerarQrCode(url, correr);
    return { ok: true, ativo: true, host: rota.host, url, qr };
  }

  async function abrir() {
    if (!domainPy) return semSkill();
    const alvo = alvoUrl();
    if (!alvo) return { ok: false, erro: 'alvo da partilha indisponível (webServer do DSH)', solucao: 'reabrir o Modo jogo' };
    const r = await correr([domainPy, 'up', alvo, '--name', nome, '--json'], { timeoutMs: 180000 });
    const json = lerJsonSaida(r.stdout);
    if (!json || json.ok !== true || !json.url) {
      const erro = json && json.erro ? json.erro : (r.erro || (r.stderr || '').trim().split('\n').pop() || `domain.py up falhou (exit ${r.code})`);
      return { ok: false, erro, solucao: (json && json.solucao) || 'ver `python3 <domain.py> list` e o estado do cloudflared' };
    }
    memoria = { host: json.host, url: json.url };
    const qr = await gerarQrCode(json.url, correr);
    return {
      ok: true,
      url: json.url,
      host: json.host,
      probe: json.probe,
      aviso: PROBLEMAS_PROBE[json.probe] || null,
      qr,
    };
  }

  async function fechar() {
    if (!domainPy) return semSkill();
    const alvo = alvoUrl();
    if (!alvo) return { ok: false, erro: 'alvo da partilha indisponível (webServer do DSH)', solucao: 'reabrir o Modo jogo' };
    let host = memoria && memoria.host;
    if (!host) {
      const { json } = await listar();
      const rota = json ? encontrarRota(json, alvo) : null;
      host = rota && rota.host;
    }
    if (!host) { memoria = null; return { ok: true, ja: true }; }
    // SEMPRE o host exacto — nunca `all` nem a porta (derrubaria as rotas permanentes).
    const r = await correr([domainPy, 'down', host, '--json'], { timeoutMs: 60000 });
    const json = lerJsonSaida(r.stdout);
    memoria = null;
    if (!json || json.ok !== true) {
      const erro = json && json.erro ? json.erro : (r.erro || (r.stderr || '').trim().split('\n').pop() || `domain.py down falhou (exit ${r.code})`);
      return { ok: false, erro, solucao: (json && json.solucao) || 'ver `python3 <domain.py> list`' };
    }
    return { ok: true, down: json.down || [], host };
  }

  /**
   * "Encerrar o Cloudflare": derruba TUDO o que esta máquina publica — o link
   * da partilha E as rotas permanentes (ex.: kluser.me) — e o túnel para.
   * É a ÚNICA ação que usa `all` (pedido explícito do utilizador, 2026-09-29)
   * e a ÚNICA destrutiva do plugin: o cliente mostra-a atrás de confirmação.
   * Nada é apagado da conta Cloudflare — reativa-se voltando a publicar (`up`).
   */
  async function encerrar() {
    if (!domainPy) return semSkill();
    const r = await correr([domainPy, 'down', 'all', '--json'], { timeoutMs: 120000 });
    const json = lerJsonSaida(r.stdout);
    memoria = null;
    if (!json || json.ok !== true) {
      const erro = json && json.erro ? json.erro : (r.erro || (r.stderr || '').trim().split('\n').pop() || `domain.py down all falhou (exit ${r.code})`);
      return { ok: false, erro, solucao: (json && json.solucao) || 'ver `python3 <domain.py> list`' };
    }
    return { ok: true, encerrado: true, hosts: (json.down || []).map((d) => d.host) };
  }

  return { abrir, fechar, estado, encerrar };
}

/* ── Rota exacta no canal /api (auth já aplicada pelo transport) ────── */

export const ROTA_PARTILHA = '/api/dsh-work-game/partilha';

export function criarRotaPartilha(servico) {
  const json = (status, corpo) => new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
  return {
    path: ROTA_PARTILHA,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      try {
        if (request.method === 'GET') return json(200, await servico.estado());
        const tipo = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (tipo !== 'application/json') {
          return json(415, { ok: false, erro: 'content type deve ser application/json' });
        }
        let corpo = null;
        try { corpo = await request.json(); } catch { /* corpo inválido abaixo */ }
        const acao = corpo && typeof corpo === 'object' ? corpo.acao : null;
        if (acao === 'abrir') return json(200, await servico.abrir());
        if (acao === 'fechar') return json(200, await servico.fechar());
        if (acao === 'encerrar') return json(200, await servico.encerrar());
        return json(400, { ok: false, erro: `ação desconhecida: ${String(acao)}` });
      } catch (erro) {
        return json(500, { ok: false, erro: String(erro && erro.message || erro) });
      }
    },
  };
}

/* ── Alvo publicado: a UI do DSH COM token + âncora do Modo jogo ─────── */

export function alvoDePartilha(cctx) {
  // O Cordis só deixa ler serviços com `inject` declarado (a propriedade
  // direta rebenta com "cannot get property … without inject"): `get()` é o
  // acesso livre e é ele que se usa aqui e no web-app do DSH.
  const pegar = (nome) => {
    try {
      if (cctx && typeof cctx.get === 'function') {
        const servico = cctx.get(nome);
        if (servico) return servico;
      }
    } catch { /* sem serviço */ }
    try { return (cctx && cctx[nome]) || null; } catch { return null; }
  };
  const web = pegar('webServer');
  const connection = pegar('connection');
  const porto = web && web.port;
  if (!porto || !connection || typeof connection.authenticatedUrl !== 'function') return null;
  // authenticatedUrl limpa path/query e põe ?token=<token do processo>: o telemóvel
  // troca-o por cookie de sessão e cai em `/`; a âncora `#jogo` sobrevive ao
  // redirect e abre já o Modo jogo.
  return `${connection.authenticatedUrl(`http://127.0.0.1:${porto}/`)}#jogo`;
}

/* ── Entry do Cordis ────────────────────────────────────────────────── */

export default {
  name: 'dsh-work-game',
  inject: [],
  reusable: true,
  apply(ctx) {
    // ÚNICO efeito de host: a rota da partilha. Nunca rebentar o boot — sem
    // connection/webServer (outras composições, testes) a partilha fica
    // simplesmente indisponível e o cliente mostra-o.
    try {
      const aoLigar = (cctx) => {
        const servico = criarServicoPartilha({
          alvo: () => alvoDePartilha(cctx),
          nome: process.env.DSH_WORK_GAME_SHARE_NAME || 'jogo',
          domainPy: resolverDomainPy(candidatosDomainPy()),
        });
        const disposar = cctx.connection.fetch.register(criarRotaPartilha(servico));
        if (typeof cctx.effect === 'function') {
          cctx.effect(() => () => { Promise.resolve(disposar).catch(() => {}); }, 'dsh-work-game: partilha');
        }
      };
      if (typeof ctx.inject === 'function') {
        const largar = ctx.inject(['connection'], aoLigar);
        if (typeof ctx.effect === 'function' && largar) {
          ctx.effect(() => largar, 'dsh-work-game: partilha (ligação)');
        }
      } else {
        const cctx = ctx.connection ? ctx : null;
        if (cctx) aoLigar(cctx);
      }
    } catch { /* sem partilha no host: o botão do cliente reporta-o */ }
  },
};
