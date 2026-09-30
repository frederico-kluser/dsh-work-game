/*
 * tests/plugin/partilha.test.mjs — a PARTILHA do Modo jogo (link + QR code).
 *
 * O botão "Partilhar" (SÓ desktop) gera um link público + QR code que fica
 * online até "Fechar a ação". Aqui cobre-se, em Node e sem rede:
 *   - o serviço do host (criarServicoPartilha) com o comando INJETÁVEL: o
 *     `up` publica o alvo COM token num host efémero `jogo.<domínio>`, o
 *     `down` recebe SEMPRE o host exacto (nunca `all`, nunca a porta — isso
 *     derrubaria as rotas permanentes do utilizador) e o `estado` só reconhece
 *     rotas não-persistentes do nosso upstream (as permanentes não são a
 *     partilha);
 *   - a rota exacta /api/dsh-work-game/partilha (GET estado · POST abrir/
 *     fechar) com contrato de erros (415/400/500) e corpo JSON;
 *   - o alvo publicado é construído NO HOST (authenticatedUrl + #jogo) — o
 *     cliente não escolhe o alvo;
 *   - o QR: PNG do qrencode (data URL, nunca innerHTML) com recurso ao segno
 *     SVG validado; payload com <script>/on*= é rejeitado;
 *   - o redutor puro do cliente (partilhaReduz) e o qrSeguro;
 *   - o botão só aparece FORA do modo telemóvel (guarda estática no bundle).
 *
 * Executar: node --test tests/plugin/partilha.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import moduloHost, {
  alvoDePartilha,
  candidatosDomainPy,
  criarRotaPartilha,
  criarServicoPartilha,
  gerarQrCode,
  lerJsonSaida,
  resolverDomainPy,
} from '../../dsh-plugin/src/index.js';

/* O bundle do browser, carregado como nos restantes testes do plugin. */
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
const BUNDLE = readFileSync(new URL('../../dsh-plugin/src/client.js', import.meta.url), 'utf8');

/* ── Dobos: um `correr` que regista as chamadas e responde por argv ──── */

const DOMAIN_PY = '/opt/skill/scripts/expose-port/domain.py';
const ALVO = 'http://127.0.0.1:3080/?token=TOK#jogo';

function espiao(responder) {
  const chamadas = [];
  const correr = async (argv, opcoes = {}) => {
    chamadas.push({ argv: [...argv], opcoes });
    return responder(argv, opcoes, chamadas.length);
  };
  return { correr, chamadas };
}

const pngFalso = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const SVG_LIMPO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>';

const listagem = (rotas) => JSON.stringify({
  zones: [{
    zone: 'kluser.me', tunnel: 'cfx-kluser-me', wildcard: true, running: true, connections: 4,
    routes: rotas,
  }],
  untracked_cloudflared: [],
});

const ROTA_PERMANENTE = {
  host: 'kluser.me', alias_of: null, upstream: 'http://127.0.0.1:3080',
  persist: true, gate: false, dns: 'cname', stale: false, live: true,
};
const ROTA_PERMANENTE_ALIAS = {
  host: 'www.kluser.me', alias_of: 'kluser.me', upstream: 'http://127.0.0.1:3080',
  persist: true, gate: false, dns: 'cname', stale: false, live: true,
};
const ROTA_PARTILHA_ATIVA = {
  host: 'jogo.kluser.me', alias_of: null, upstream: 'http://127.0.0.1:3080',
  persist: false, gate: false, dns: 'curinga', stale: false, live: true,
};

/* ── Serviço do host ────────────────────────────────────────────────── */

test('abrir() publica o alvo COM token no host efémero e devolve URL + QR', async () => {
  const { correr, chamadas } = espiao((argv) => {
    if (argv[1] === 'up') {
      return {
        code: 0,
        stdout: `${JSON.stringify({
          ok: true, url: 'https://jogo.kluser.me/?token=TOK#jogo', host: 'jogo.kluser.me',
          aliases: [], upstream: 'http://127.0.0.1:3080', persist: false, gate: false,
          keep_host: false, probe: 200, seconds: 0.7, down: 'python3 … down jogo.kluser.me',
        })}\n`,
        stderr: '',
      };
    }
    if (argv[0] === 'qrencode') return { code: 0, stdout: pngFalso, stderr: '' };
    throw new Error(`comando inesperado: ${argv.join(' ')}`);
  });
  const servico = criarServicoPartilha({ correr, alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY });
  const r = await servico.abrir();
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://jogo.kluser.me/?token=TOK#jogo');
  assert.equal(r.host, 'jogo.kluser.me');
  assert.equal(r.probe, 200);
  assert.equal(r.qr.tipo, 'png');
  assert.ok(r.qr.dados.startsWith('data:image/png;base64,'));
  // o up leva o alvo tal e qual (query ?token= e âncora #jogo preservadas)
  assert.deepEqual(chamadas[0].argv, [DOMAIN_PY, 'up', ALVO, '--name', 'jogo', '--json']);
  // o QR é gerado do URL público que sai do up
  assert.deepEqual(chamadas[1].argv, ['qrencode', '-t', 'PNG', '-o', '-', 'https://jogo.kluser.me/?token=TOK#jogo']);
});

test('abrir() devolve erro legível quando o domain.py recusa (ok:false + solução)', async () => {
  const { correr } = espiao(() => ({
    code: 1,
    stdout: `${JSON.stringify({ ok: false, erro: 'jogo.kluser.me tem um registo DNS de terceiros', solucao: 'usar --name outro' })}\n`,
    stderr: '',
  }));
  const servico = criarServicoPartilha({ correr, alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY });
  const r = await servico.abrir();
  assert.equal(r.ok, false);
  assert.match(r.erro, /registo DNS de terceiros/);
  assert.equal(r.solucao, 'usar --name outro');
});

test('fechar() derruba SEMPRE o host exacto — nunca "all" nem a porta', async () => {
  const { correr, chamadas } = espiao((argv) => {
    if (argv[1] === 'up') {
      return { code: 0, stdout: `${JSON.stringify({ ok: true, url: 'https://jogo.kluser.me/?token=TOK#jogo', host: 'jogo.kluser.me', probe: 200 })}\n`, stderr: '' };
    }
    if (argv[0] === 'qrencode') return { code: 0, stdout: pngFalso, stderr: '' };
    if (argv[1] === 'down') {
      return { code: 0, stdout: `${JSON.stringify({ ok: true, down: [{ host: 'jogo.kluser.me', zone: 'kluser.me', dns: 'curinga' }], edge_now: { 'jogo.kluser.me': 404 }, seconds: 0.3 })}\n`, stderr: '' };
    }
    throw new Error(`comando inesperado: ${argv.join(' ')}`);
  });
  const servico = criarServicoPartilha({ correr, alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY });
  await servico.abrir();
  const r = await servico.fechar();
  assert.equal(r.ok, true);
  assert.equal(r.host, 'jogo.kluser.me');
  const downs = chamadas.filter((c) => c.argv[1] === 'down');
  assert.equal(downs.length, 1);
  assert.deepEqual(downs[0].argv, [DOMAIN_PY, 'down', 'jogo.kluser.me', '--json']);
  for (const c of chamadas) {
    assert.ok(!c.argv.includes('all'), `nunca "all": ${c.argv.join(' ')}`);
    assert.ok(!c.argv.includes('3080'), `nunca a porta (derrubaria as rotas permanentes): ${c.argv.join(' ')}`);
  }
});

test('fechar() sem partilha ativa não corre down nenhum (idempotente)', async () => {
  const { correr, chamadas } = espiao((argv) => {
    if (argv[1] === 'list') return { code: 0, stdout: listagem([ROTA_PERMANENTE, ROTA_PERMANENTE_ALIAS]), stderr: '' };
    throw new Error(`comando inesperado: ${argv.join(' ')}`);
  });
  const servico = criarServicoPartilha({ correr, alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY });
  const r = await servico.fechar();
  assert.deepEqual(r, { ok: true, ja: true });
  assert.ok(chamadas.every((c) => c.argv[1] !== 'down'));
});

test('encerrar() é o ÚNICO que usa "all": tudo offline, túnel para, nada apagado', async () => {
  const { correr, chamadas } = espiao((argv) => {
    if (argv[1] === 'up') {
      return { code: 0, stdout: `${JSON.stringify({ ok: true, url: 'https://jogo.kluser.me/?token=TOK#jogo', host: 'jogo.kluser.me', probe: 200 })}\n`, stderr: '' };
    }
    if (argv[0] === 'qrencode') return { code: 0, stdout: pngFalso, stderr: '' };
    if (argv[1] === 'down') {
      return {
        code: 0,
        stdout: `${JSON.stringify({
          ok: true,
          down: [{ host: 'jogo.kluser.me', zone: 'kluser.me', dns: 'curinga' }, { host: 'kluser.me', zone: 'kluser.me', dns: 'cname' }, { host: 'www.kluser.me', zone: 'kluser.me', dns: 'cname' }],
          edge_now: { 'jogo.kluser.me': 404, 'kluser.me': 404, 'www.kluser.me': 404 }, seconds: 0.3,
        })}\n`,
        stderr: '',
      };
    }
    throw new Error(`comando inesperado: ${argv.join(' ')}`);
  });
  const servico = criarServicoPartilha({ correr, alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY });
  await servico.abrir();
  const r = await servico.encerrar();
  assert.equal(r.ok, true);
  assert.equal(r.encerrado, true);
  assert.deepEqual(r.hosts, ['jogo.kluser.me', 'kluser.me', 'www.kluser.me']);
  const downs = chamadas.filter((c) => c.argv[1] === 'down');
  assert.deepEqual(downs[0].argv, [DOMAIN_PY, 'down', 'all', '--json'], 'encerrar() = down all (explícito)');
  // regra de segurança mantida: o FECHO da partilha nunca usa all/porta
  const vazio = espiao((argv) => {
    if (argv[1] === 'list') return { code: 0, stdout: listagem([]), stderr: '' };
    throw new Error(`comando inesperado: ${argv.join(' ')}`);
  });
  const fecho = criarServicoPartilha({ correr: vazio.correr, alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY });
  assert.deepEqual(await fecho.fechar(), { ok: true, ja: true }, 'sem rotas, fechar é no-op (nunca cai em "all")');
  for (const c of vazio.chamadas) {
    assert.ok(!c.argv.includes('all'), `fechar nunca usa "all": ${c.argv.join(' ')}`);
    assert.ok(!c.argv.includes('3080'), `fechar nunca usa a porta: ${c.argv.join(' ')}`);
  }
});

test('depois de encerrar(), fechar() é no-op (já está tudo offline)', async () => {
  const { correr } = espiao((argv) => {
    if (argv[1] === 'down') {
      return { code: 0, stdout: `${JSON.stringify({ ok: true, down: [{ host: 'jogo.kluser.me', zone: 'kluser.me', dns: 'curinga' }] })}\n`, stderr: '' };
    }
    if (argv[1] === 'list') return { code: 0, stdout: listagem([]), stderr: '' };
    throw new Error(`comando inesperado: ${argv.join(' ')}`);
  });
  const servico = criarServicoPartilha({ correr, alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY });
  await servico.encerrar();
  assert.deepEqual(await servico.fechar(), { ok: true, ja: true });
});

test('encerrar() sem domain.py e sem túnel: erros legíveis, nunca traceback', async () => {
  const semSkill = criarServicoPartilha({ correr: async () => { throw new Error('não deve correr'); }, alvo: ALVO, nome: 'jogo', domainPy: null });
  const r = await semSkill.encerrar();
  assert.equal(r.ok, false);
  assert.match(r.erro, /cloudflare-agent-skill/);

  const vazio = criarServicoPartilha({
    correr: async () => ({ code: 0, stdout: `${JSON.stringify({ ok: true, down: [] })}\n`, stderr: '' }),
    alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY,
  });
  assert.deepEqual(await vazio.encerrar(), { ok: true, encerrado: true, hosts: [] }, 'down all sem rotas é idempotente');
});

test('estado() reconhece a partilha e ignora as rotas permanentes (mesmo upstream)', async () => {
  const { correr } = espiao((argv) => {
    if (argv[1] === 'list') return { code: 0, stdout: listagem([ROTA_PERMANENTE, ROTA_PERMANENTE_ALIAS, ROTA_PARTILHA_ATIVA]), stderr: '' };
    if (argv[0] === 'qrencode') return { code: 0, stdout: pngFalso, stderr: '' };
    throw new Error(`comando inesperado: ${argv.join(' ')}`);
  });
  const servico = criarServicoPartilha({ correr, alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY });
  const r = await servico.estado();
  assert.equal(r.ok, true);
  assert.equal(r.ativo, true);
  assert.equal(r.host, 'jogo.kluser.me');
  // o URL público reconstrói-se como o domain.py: host + path/query/fragmento do alvo
  assert.equal(r.url, 'https://jogo.kluser.me/?token=TOK#jogo');
  assert.equal(r.qr.tipo, 'png');
});

test('estado() sem partilha (só rotas permanentes) → ativo:false', async () => {
  const { correr } = espiao((argv) => {
    if (argv[1] === 'list') return { code: 0, stdout: listagem([ROTA_PERMANENTE, ROTA_PERMANENTE_ALIAS]), stderr: '' };
    throw new Error(`comando inesperado: ${argv.join(' ')}`);
  });
  const servico = criarServicoPartilha({ correr, alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY });
  assert.deepEqual(await servico.estado(), { ok: true, ativo: false });
});

test('estado() não confunde uma partilha de OUTRO upstream (porta diferente)', async () => {
  const outra = { ...ROTA_PARTILHA_ATIVA, host: 'jogo.kluser.me', upstream: 'http://127.0.0.1:4173' };
  const { correr } = espiao((argv) => {
    if (argv[1] === 'list') return { code: 0, stdout: listagem([ROTA_PERMANENTE, outra]), stderr: '' };
    throw new Error(`comando inesperado: ${argv.join(' ')}`);
  });
  const servico = criarServicoPartilha({ correr, alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY });
  assert.deepEqual(await servico.estado(), { ok: true, ativo: false });
});

test('sem domain.py a partilha responde com erro + solução (nunca rebenta)', async () => {
  const servico = criarServicoPartilha({ correr: async () => { throw new Error('não deve correr'); }, alvo: ALVO, nome: 'jogo', domainPy: null });
  for (const acao of ['estado', 'abrir', 'fechar', 'encerrar']) {
    const r = await servico[acao]();
    assert.equal(r.ok, false);
    assert.match(r.erro, /cloudflare-agent-skill/);
    assert.match(r.solucao, /DSH_WORK_GAME_EXPOSE_PORT/);
  }
});

test('falha do comando vira erro legível (sem traceback para o cliente)', async () => {
  const { correr } = espiao(() => ({ code: 1, stdout: '', stderr: '', erro: 'tempo esgotado (180000 ms)' }));
  const servico = criarServicoPartilha({ correr, alvo: ALVO, nome: 'jogo', domainPy: DOMAIN_PY });
  const r = await servico.abrir();
  assert.equal(r.ok, false);
  assert.match(r.erro, /tempo esgotado/);
  assert.ok(r.solucao.length > 0);
});

/* ── Comandos auxiliares ────────────────────────────────────────────── */

test('lerJsonSaida apanha o ÚLTIMO JSON do stdout (ruído à frente não interessa)', () => {
  const saida = `a preparar…\n{"ok":true,"url":"https://x"}\n{"ok":false,"erro":"fim"}\n`;
  assert.deepEqual(lerJsonSaida(saida), { ok: false, erro: 'fim' });
  assert.equal(lerJsonSaida('sem json aqui'), null);
});

test('gerarQrCode: PNG do qrencode; recurso ao segno SVG; payloads perigosos caem fora', async () => {
  // 1) qrencode responde → data URL PNG
  const soPng = espiao((argv) => (argv[0] === 'qrencode'
    ? { code: 0, stdout: pngFalso, stderr: '' }
    : { code: 1, stdout: '', stderr: '' }));
  const a = await gerarQrCode('https://x', soPng.correr);
  assert.equal(a.tipo, 'png');
  // 2) qrencode falha → segno SVG limpo
  const soSegno = espiao((argv) => (argv[0] === 'qrencode'
    ? { code: 1, stdout: '', stderr: 'qrencode: comando não encontrado' }
    : { code: 0, stdout: `  ${SVG_LIMPO}\n`, stderr: '' }));
  const b = await gerarQrCode('https://x', soSegno.correr);
  assert.equal(b.tipo, 'svg');
  assert.ok(b.dados.startsWith('<svg'));
  // 3) o segno "responde" mas com SVG sujo → rejeitado (nunca innerHTML às cegas)
  const sujo = espiao((argv) => (argv[0] === 'qrencode'
    ? { code: 1, stdout: '', stderr: '' }
    : { code: 0, stdout: '<svg onload="alert(1)"><script>x</script></svg>', stderr: '' }));
  assert.equal(await gerarQrCode('https://x', sujo.correr), null);
  // 4) nada responde → null (o link chega na mesma, sem QR)
  const nada = espiao(() => ({ code: 1, stdout: '', stderr: '' }));
  assert.equal(await gerarQrCode('https://x', nada.correr), null);
});

test('candidatos/resolver do domain.py: env primeiro, sem caminhos adivinhados', () => {
  const candidatos = candidatosDomainPy({ DSH_WORK_GAME_EXPOSE_PORT: '/x/domain.py' }, '/home/fake');
  assert.equal(candidatos[0], '/x/domain.py');
  assert.ok(candidatos.some((c) => c.endsWith('/skills/cloudflare-agent-skill/scripts/expose-port/domain.py')));
  const visto = [];
  const resolvido = resolverDomainPy(candidatos, (p) => { visto.push(p); return p === candidatos[2]; });
  assert.equal(resolvido, candidatos[2]);
  assert.deepEqual(visto, candidatos.slice(0, 3));
  assert.equal(resolverDomainPy(['/nada'], () => false), null);
});

/* ── Rota /api/dsh-work-game/partilha ───────────────────────────────── */

const servicoFalso = () => {
  const chamadas = [];
  return {
    chamadas,
    servico: {
      abrir: async () => { chamadas.push('abrir'); return { ok: true, url: 'https://jogo.kluser.me/?token=T#jogo', host: 'jogo.kluser.me' }; },
      fechar: async () => { chamadas.push('fechar'); return { ok: true, host: 'jogo.kluser.me' }; },
      estado: async () => { chamadas.push('estado'); return { ok: true, ativo: false }; },
      encerrar: async () => { chamadas.push('encerrar'); return { ok: true, encerrado: true, hosts: ['jogo.kluser.me'] }; },
    },
  };
};

test('rota: GET devolve o estado e POST despacha abrir/fechar/encerrar', async () => {
  const { servico, chamadas } = servicoFalso();
  const rota = criarRotaPartilha(servico);
  assert.equal(rota.path, '/api/dsh-work-game/partilha');
  assert.deepEqual([...rota.methods], ['GET', 'POST']);

  const get = await rota.fetch(new Request('http://h/api/dsh-work-game/partilha'));
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { ok: true, ativo: false });

  const abrir = await rota.fetch(new Request('http://h/api/dsh-work-game/partilha', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'abrir' }),
  }));
  assert.equal(abrir.status, 200);
  assert.equal((await abrir.json()).url, 'https://jogo.kluser.me/?token=T#jogo');

  const fechar = await rota.fetch(new Request('http://h/api/dsh-work-game/partilha', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'fechar' }),
  }));
  assert.equal(fechar.status, 200);

  const encerrar = await rota.fetch(new Request('http://h/api/dsh-work-game/partilha', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'encerrar' }),
  }));
  assert.equal(encerrar.status, 200);
  assert.equal((await encerrar.json()).encerrado, true);
  assert.deepEqual(chamadas, ['estado', 'abrir', 'fechar', 'encerrar']);
});

test('rota: contrato de erros — 415 sem JSON, 400 com ação/ corpo inválidos, 500 na exceção', async () => {
  const { servico } = servicoFalso();
  const rota = criarRotaPartilha(servico);

  const tipoErrado = await rota.fetch(new Request('http://h/api/dsh-work-game/partilha', {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'acao=abrir',
  }));
  assert.equal(tipoErrado.status, 415);

  const acaoErrada = await rota.fetch(new Request('http://h/api/dsh-work-game/partilha', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'apagar-tudo' }),
  }));
  assert.equal(acaoErrada.status, 400);

  const corpoErrado = await rota.fetch(new Request('http://h/api/dsh-work-game/partilha', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{partido',
  }));
  assert.equal(corpoErrado.status, 400);

  const quebra = criarRotaPartilha({
    estado: async () => { throw new Error('rebentou'); },
    abrir: async () => { throw new Error('rebentou'); },
    fechar: async () => { throw new Error('rebentou'); },
  });
  const erro = await quebra.fetch(new Request('http://h/api/dsh-work-game/partilha'));
  assert.equal(erro.status, 500);
  assert.equal((await erro.json()).ok, false);
});

/* ── Alvo publicado (construído no host) ────────────────────────────── */

test('alvoDePartilha: URL local do DSH COM token + âncora #jogo', () => {
  const cctx = {
    webServer: { port: 3080 },
    connection: { authenticatedUrl: (base) => `${base}?token=ABC` },
  };
  assert.equal(alvoDePartilha(cctx), 'http://127.0.0.1:3080/?token=ABC#jogo');
  assert.equal(alvoDePartilha({ webServer: { port: 3080 } }), null, 'sem connection não há alvo');
  assert.equal(alvoDePartilha({ connection: { authenticatedUrl: (b) => b } }), null, 'sem webServer não há alvo');
});

test('alvoDePartilha: no host real lê os serviços por get() — nunca pela propriedade', () => {
  // No Cordis, `ctx.webServer` sem `inject` lança
  // "cannot get property \"webServer\" without inject": o acesso é por get().
  const servicos = {
    webServer: { port: 4000 },
    connection: { authenticatedUrl: (base) => `${base}?token=Z` },
  };
  const cctx = { get: (nome) => servicos[nome] ?? null };
  Object.defineProperty(cctx, 'webServer', {
    get() { throw new Error('cannot get property "webServer" without inject'); },
  });
  assert.equal(alvoDePartilha(cctx), 'http://127.0.0.1:4000/?token=Z#jogo');
  // e um ctx sem serviços nunca rebenta o handler da rota
  assert.equal(alvoDePartilha({ get: () => { throw new Error('sem serviços'); } }), null);
});

test('o entry host não tem mais efeitos que a partilha e não rebenta sem serviços', () => {
  assert.equal(moduloHost.name, 'dsh-work-game');
  assert.deepEqual(moduloHost.inject, []);
  // sem connection/webServer: apply é um no-op sem exceções
  moduloHost.apply({});
  moduloHost.apply({ inject: () => () => {} });
});

/* ── Cliente: redutor puro + QR seguro + guarda do desktop ──────────── */

test('partilhaReduz: o ciclo gerar → online → fechar a ação', () => {
  const { __partilhaReduz: reduz, __PARTILHA_INICIAL: inicial } = B;
  let e = reduz(null, { tipo: 'inicio' });
  assert.deepEqual(e, inicial);

  e = reduz(e, { tipo: 'a-gerar' });
  assert.equal(e.fase, 'a-gerar');

  e = reduz(e, { tipo: 'gerado', url: 'https://jogo.kluser.me/?token=T#jogo', host: 'jogo.kluser.me', qr: { tipo: 'png', dados: 'data:image/png;base64,AA' }, aviso: '' });
  assert.equal(e.fase, 'online');
  assert.equal(e.url, 'https://jogo.kluser.me/?token=T#jogo');
  assert.equal(e.qr.tipo, 'png');

  e = reduz(e, { tipo: 'copiado' });
  assert.equal(e.copiado, true);

  e = reduz(e, { tipo: 'a-fechar' });
  assert.equal(e.fase, 'a-fechar');

  e = reduz(e, { tipo: 'fechado' });
  assert.deepEqual(e, inicial);

  // "Encerrar o Cloudflare" (tudo offline): repõe o painel com a nota.
  e = reduz({ ...inicial, fase: 'online', url: 'https://jogo.kluser.me/?token=T#jogo' }, { tipo: 'a-encerrar' });
  assert.equal(e.fase, 'a-encerrar');
  e = reduz(e, { tipo: 'encerrado', nota: 'Cloudflare encerrado — 3 rota(s) offline (jogo.kluser.me, kluser.me, www.kluser.me).' });
  assert.equal(e.fase, 'parado');
  assert.equal(e.url, '');
  assert.match(e.nota, /3 rota\(s\) offline/);
  e = reduz(e, { tipo: 'a-gerar' });
  assert.equal(e.nota, '', 'uma geração nova limpa a nota do encerramento');
});

test('partilhaReduz: erros ficam no painel com a solução e nunca partem o fluxo', () => {
  const { __partilhaReduz: reduz, __PARTILHA_INICIAL: inicial } = B;
  let e = reduz({ ...inicial, fase: 'a-gerar' }, { tipo: 'erro', erro: 'cloudflare-agent-skill não encontrada (domain.py)', solucao: 'instalar a skill' });
  assert.equal(e.fase, 'erro');
  assert.match(e.erro, /cloudflare-agent-skill/);
  assert.equal(e.solucao, 'instalar a skill');

  // estado do host a meio: online recupera URL/QR, inativo repõe tudo
  e = reduz(e, { tipo: 'estado', ativo: true, host: 'jogo.kluser.me', url: 'https://jogo.kluser.me/?token=T#jogo' });
  assert.equal(e.fase, 'online');
  e = reduz(e, { tipo: 'estado', ativo: false });
  assert.deepEqual(e, inicial);
});

test('qrSeguro: aceita PNG data URL e SVG limpo; rejeita HTML/JS', () => {
  const { __qrSeguro: seguro } = B;
  assert.equal(seguro({ tipo: 'png', dados: 'data:image/png;base64,AA' }).tipo, 'png');
  assert.equal(seguro({ tipo: 'svg', dados: '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>' }).tipo, 'svg');
  assert.equal(seguro({ tipo: 'png', dados: 'javascript:alert(1)' }), null);
  assert.equal(seguro({ tipo: 'svg', dados: '<svg onload="alert(1)"></svg>' }), null);
  assert.equal(seguro({ tipo: 'svg', dados: '<svg></svg><script>x</script>' }), null);
  assert.equal(seguro(null), null);
  assert.equal(seguro({ tipo: 'html', dados: '<b>oi</b>' }), null);
});

test('a partilha só aparece no desktop e fala com a rota fixa do host', () => {
  // guarda estática: o botão é renderizado SÓ quando não há modo telemóvel
  assert.ok(BUNDLE.includes("celular ? null : h('div', { className: 'wg-partilha' }"),
    'o botão Partilhar tem de desaparecer no modo telemóvel');
  // e o cliente só conhece a rota fixa — o alvo da partilha nunca vem do browser
  assert.equal(B.__ROTA_PARTILHA, '/api/dsh-work-game/partilha');
  assert.ok(BUNDLE.includes(`fetch(ROTA_PARTILHA`), 'os pedidos da partilha vão para a rota fixa');
  // o fecho do Modo jogo NÃO derruba o link: só "Fechar a ação"
  assert.ok(BUNDLE.includes("'fechar'") && BUNDLE.includes('Fechar a ação'));
});

test('"Encerrar o Cloudflare" é a única ação destrutiva e leva confirmação em dois passos', () => {
  // separado do "Fechar a ação", com o aviso do que derruba
  assert.ok(BUNDLE.includes('wg-partilha-perigo'), 'a zona destrutiva está separada no painel');
  assert.ok(BUNDLE.includes('Encerrar o Cloudflare'), 'o botão existe');
  assert.ok(BUNDLE.includes('derruba TUDO'), 'o aviso diz o que vai ficar offline');
  // DOIS cliques: o primeiro pede confirmação, o segundo executa
  assert.ok(BUNDLE.includes('Confirmar: tudo fica offline'), 'o primeiro clique pede confirmação');
  assert.ok(BUNDLE.includes("'encerrar'"), 'a ação encerrar despacha para o host');
  // e continua a haver o fecho SÓ da partilha
  assert.ok(BUNDLE.includes('Fechar a ação') && BUNDLE.includes("'fechar'"));
});
