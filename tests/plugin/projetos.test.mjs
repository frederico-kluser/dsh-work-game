/*
 * tests/plugin/projetos.test.mjs — ORDEM DOS PROJETOS e a label ONLINE.
 *
 * Dois pedidos do utilizador, um contrato cada:
 *   - "quando tiverem projetos, quero por ordem de qual commitou por último
 *     aparecendo primeiro — e não por ordem alfabética ou qualquer outra":
 *     o HOST lê o git (`git log -1 --format=%cI`) na rota
 *     /api/dsh-work-game/projetos e o cliente reordena grupos e mesas;
 *   - "no celular, nos grupos, tenha a label de online para quem está a
 *     trabalhar": a linha do grupo mostra o ponto verde e "N online".
 *
 * Aqui testa-se o que é determinístico: o caminho (~ expandido, pasta
 * validada), o último commit (comando injetado, cache curta, falhas), a rota
 * (JSON, 415, 400) e o ordenador puro do cliente (commit mais recente
 * primeiro, empate = ordem do DSH, "Sem workspace" sempre no fim).
 *
 * Executar: node --test tests/plugin/projetos.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  expandirCaminho,
  ultimoCommit,
  criarServicoProjetos,
  criarRotaProjetos,
  ROTA_PROJETOS,
} from '../../dsh-plugin/src/index.js';

const BUNDLE = readFileSync(new URL('../../dsh-plugin/src/client.js', import.meta.url), 'utf8');

/* ---------- bundle do cliente (react falso, como nos outros testes) ---------- */

let moduloBundle = null;
const reactFalso = {
  createElement: (tipo, props, ...filhos) => ({ tipo, props: props || {}, filhos: filhos.flat(Infinity) }),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (f) => f(),
  useRef: (v) => ({ current: v }),
};
globalThis.window = {
  __ModuleLoader__: {
    load({ factory }) {
      moduloBundle = factory((nome) => {
        if (nome === 'react') return reactFalso;
        throw new Error(`módulo inesperado: ${nome}`);
      });
    },
  },
};
await import('../../dsh-plugin/src/client.js');
const B = moduloBundle;

/* ---------- caminho (~, absoluto, vazio) ---------- */

test('expandirCaminho: ~ vira a pasta pessoal, o resto fica absoluto', () => {
  assert.equal(expandirCaminho('~/Projects/x', '/home/u'), '/home/u/Projects/x');
  assert.equal(expandirCaminho('~', '/home/u'), '/home/u');
  assert.equal(expandirCaminho('/opt/proj', '/home/u'), '/opt/proj');
  assert.equal(expandirCaminho('   ', '/home/u'), '');
  // Relativo resolve contra a pasta de trabalho do processo (comportamento padrão).
  assert.equal(expandirCaminho('relativo/x', '/home/u'), path.resolve('relativo/x'));
});

/* ---------- último commit (git injetado) ---------- */

test('ultimoCommit: ISO do git, null quando falha ou não é data', async () => {
  const correrOk = async () => ({ code: 0, stdout: '2026-10-20T14:05:00-03:00\n', stderr: '' });
  assert.equal(await ultimoCommit('/p/x', correrOk), '2026-10-20T14:05:00-03:00');

  const correrFalha = async () => ({ code: 128, stdout: '', stderr: 'not a git repository' });
  assert.equal(await ultimoCommit('/p/y', correrFalha), null);

  const correrLixo = async () => ({ code: 0, stdout: 'fatal: bad object\n', stderr: '' });
  assert.equal(await ultimoCommit('/p/z', correrLixo), null);
});

/* ---------- serviço: resolver + commits com cache ---------- */

const servicoFake = (over = {}) => criarServicoProjetos({
  home: '/home/u',
  existe: (c) => ['/home/u/Projects/alfa', '/home/u/Projects/zeta', '/home/u/Projects/arquivo.txt'].includes(c),
  pasta: (c) => c !== '/home/u/Projects/arquivo.txt',
  correr: async (argv) => ({
    code: 0,
    stdout: argv[2] === '/home/u/Projects/zeta' ? '2026-10-20T10:00:00Z\n' : '2026-10-01T10:00:00Z\n',
    stderr: '',
  }),
  agora: () => 1000,
  ttlMs: 30000,
  ...over,
});

test('resolver: só devolve caminho que existe e é pasta, com o erro para o utilizador', () => {
  const servico = servicoFake();
  const ok = servico.resolver('~/Projects/alfa');
  assert.equal(ok.ok, true);
  assert.equal(ok.path, '/home/u/Projects/alfa');

  const inexistente = servico.resolver('~/Projects/nada');
  assert.equal(inexistente.ok, false);
  assert.match(inexistente.erro, /não encontrei a pasta/);
  assert.ok(inexistente.solucao);

  const arquivo = servico.resolver('~/Projects/arquivo.txt');
  assert.equal(arquivo.ok, false);
  assert.match(arquivo.erro, /não é uma pasta/);

  assert.equal(servico.resolver('  ').ok, false);
});

test('commits: mapa caminho → ISO, falha vira null, cache evita repetir o git', async () => {
  let chamadas = 0;
  const servico = servicoFake({ correr: async (argv) => { chamadas += 1; return { code: 0, stdout: argv[2].endsWith('zeta') ? '2026-10-20T10:00:00Z\n' : '2026-10-01T10:00:00Z\n', stderr: '' }; } });

  const r1 = await servico.commits(['~/Projects/alfa', '~/Projects/zeta', '/caminho/que/nao/existe']);
  assert.equal(r1.ok, true);
  assert.equal(r1.commits['/home/u/Projects/alfa'], '2026-10-01T10:00:00Z');
  assert.equal(r1.commits['/home/u/Projects/zeta'], '2026-10-20T10:00:00Z');
  assert.equal(r1.commits['/caminho/que/nao/existe'], null, 'pasta inexistente não vai ao git');
  assert.equal(chamadas, 2);

  await servico.commits(['~/Projects/alfa']);
  assert.equal(chamadas, 2, 'dentro do TTL o git não é chamado de novo');

  const velho = servicoFake({ agora: () => 1e9, correr: async () => { chamadas += 1; return { code: 0, stdout: '', stderr: '' }; } });
  await velho.commits(['~/Projects/alfa']);
  assert.equal(chamadas, 3, 'fora do TTL volta a perguntar');
});

/* ---------- rota do host ---------- */

const pedidoJson = (corpo, tipo = 'application/json') => new Request('http://x/api/dsh-work-game/projetos', {
  method: 'POST',
  headers: { 'content-type': tipo },
  body: JSON.stringify(corpo),
});

test('rota: caminho exacto e as três respostas da partilha de projetos', async () => {
  const rota = criarRotaProjetos(servicoFake());
  assert.equal(rota.path, ROTA_PROJETOS);
  assert.equal(ROTA_PROJETOS, '/api/dsh-work-game/projetos');

  const commits = await rota.fetch(pedidoJson({ acao: 'commits', paths: ['~/Projects/zeta'] }));
  assert.equal(commits.status, 200);
  const corpoCommits = await commits.json();
  assert.equal(corpoCommits.ok, true);
  assert.equal(corpoCommits.commits['/home/u/Projects/zeta'], '2026-10-20T10:00:00Z');

  const resolvido = await (await rota.fetch(pedidoJson({ acao: 'resolver', path: '~/Projects/alfa' }))).json();
  assert.equal(resolvido.ok, true);
  assert.equal(resolvido.path, '/home/u/Projects/alfa');

  assert.equal((await rota.fetch(pedidoJson({ acao: 'inventar' }))).status, 400);
  assert.equal((await rota.fetch(pedidoJson({ acao: 'commits' }, 'text/plain'))).status, 415);

  const get = await rota.fetch(new Request('http://x/api/dsh-work-game/projetos?path=%2Fhome%2Fu%2FProjects%2Fzeta'));
  assert.equal(get.status, 200);
  assert.equal((await get.json()).commits['/home/u/Projects/zeta'], '2026-10-20T10:00:00Z');
});

/* ---------- ordenador puro do cliente ---------- */

const equipasFake = () => new Map([
  ['ws:1', { id: 'ws:1', name: 'alfa', caminho: '/p/alfa' }],
  ['ws:2', { id: 'ws:2', name: 'zeta', caminho: '/p/zeta' }],
  ['ws:3', { id: 'ws:3', name: 'sem-git', caminho: '/p/sem-git' }],
  ['sem-workspace', { id: 'sem-workspace', name: 'Sem workspace', caminho: null }],
]);

test('ordem: commit mais recente primeiro, empate/sem commit mantém a ordem do DSH', () => {
  const ordem = (commits) => B.__ordenarEquipasPorCommit(equipasFake(), commits).map(([id]) => id);

  assert.deepEqual(ordem({
    '/p/alfa': '2026-10-01T10:00:00Z',
    '/p/zeta': '2026-10-20T10:00:00Z',
  }), ['ws:2', 'ws:1', 'ws:3', 'sem-workspace'], 'zeta (mais recente) primeiro; "Sem workspace" no fim');

  assert.deepEqual(ordem({
    '/p/alfa': '2026-10-20T10:00:00Z',
    '/p/zeta': '2026-10-01T10:00:00Z',
  }), ['ws:1', 'ws:2', 'ws:3', 'sem-workspace'], 'inverte quando o commit de alfa é mais novo');

  assert.deepEqual(ordem(null), ['ws:1', 'ws:2', 'ws:3', 'sem-workspace'], 'sem dados = ordem do DSH');
  assert.deepEqual(ordem({ '/p/alfa': 'lixo' }), ['ws:1', 'ws:2', 'ws:3', 'sem-workspace'], 'data inválida não ordena');
});

/* ---------- "há quanto tempo" ---------- */

test('tempoRelativo: agora, minutos, horas, dias — e vazio para lixo', () => {
  const agora = Date.now();
  const iso = (ms) => new Date(agora - ms).toISOString();
  assert.equal(B.__tempoRelativo(iso(5 * 1000)), 'agora mesmo');
  assert.equal(B.__tempoRelativo(iso(2 * 60 * 1000)), 'há 2 min');
  assert.equal(B.__tempoRelativo(iso(5 * 3600 * 1000)), 'há 5 h');
  assert.equal(B.__tempoRelativo(iso(3 * 24 * 3600 * 1000)), 'há 3 d');
  assert.equal(B.__tempoRelativo('não é data'), '');
  assert.equal(B.__tempoRelativo(null), '');
});

/* ---------- a label ONLINE está no bundle ---------- */

test('celular: a linha do grupo traz o ponto verde e "N online"', () => {
  assert.ok(BUNDLE.includes("className: 'wg-tel-online'"), 'a label online é desenhada na linha do grupo');
  assert.ok(BUNDLE.includes('.wg-tel-online-ponto{'), 'o ponto verde tem estilo próprio');
  assert.ok(BUNDLE.includes('aTrabalhar'), 'o grupo leva a contagem de quem trabalha');
  assert.ok(BUNDLE.includes('online,'), 'a lista de nomes online acompanha o grupo');
  assert.ok(BUNDLE.includes('" online"') || BUNDLE.includes(' online'), 'o texto diz "online"');
});

test('ordem: o cliente pede os commits ao host e o layout usa-os', () => {
  assert.ok(BUNDLE.includes("'/api/dsh-work-game/projetos'"), 'a rota do host está no bundle');
  assert.equal(B.__ROTA_PROJETOS, '/api/dsh-work-game/projetos');
  assert.ok(BUNDLE.includes('ordenarEquipasPorCommit(equipas, commits)'), 'o layout reordena as equipas pelos commits');
  assert.ok(BUNDLE.includes('definirCommits'), 'o núcleo aceita o mapa do host');
  assert.equal(typeof B.__montarEscritorio, 'function');
});

/* ---------- ecrã "Adicionar projeto" (vista nova do celular) ---------- */

const nosDe = (no, pred, fora = []) => {
  if (!no || typeof no !== 'object') return fora;
  if (pred(no)) fora.push(no);
  for (const f of no.filhos || []) nosDe(f, pred, fora);
  return fora;
};
const textoDe = (no) => (no.filhos || []).map((f) => (typeof f === 'string' ? f : textoDe(f))).join('');

test('adicionar projeto: um campo de caminho, um botão e o erro colado ao campo', () => {
  const chamadas = { mudou: [], criou: 0, voltou: 0 };
  const arvore = B.__TelefoneAdicionarProjeto({
    projeto: { caminho: '~/Projects/alfa', erro: '', solucao: '', nota: '', aCriar: false },
    aoMudar: (t) => chamadas.mudou.push(t),
    aoCriar: () => { chamadas.criou += 1; },
    voltar: () => { chamadas.voltou += 1; },
  });
  const campos = nosDe(arvore, (n) => n.tipo === 'input');
  assert.equal(campos.length, 1, 'um só campo (o caminho)');
  assert.equal(campos[0].props.value, '~/Projects/alfa');
  assert.equal(campos[0].props.placeholder, '~/Projects/meu-projeto');
  campos[0].props.onChange({ target: { value: '~/Projects/beta' } });
  assert.deepEqual(chamadas.mudou, ['~/Projects/beta'], 'escrever avisa o núcleo');

  const submeter = nosDe(arvore, (n) => n.tipo === 'button' && n.props.type === 'submit')[0];
  assert.ok(submeter, 'há um botão de submissão');
  assert.equal(textoDe(submeter), 'Adicionar projeto');
  nosDe(arvore, (n) => n.tipo === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.equal(chamadas.criou, 1, 'submeter pede a criação');

  const cancelar = nosDe(arvore, (n) => n.tipo === 'button' && textoDe(n) === 'Cancelar')[0];
  cancelar.props.onClick();
  assert.equal(chamadas.voltou, 1, 'cancelar volta aos grupos');
});

test('adicionar projeto: erro e solução aparecem em role=alert, e a criar desativa o botão', () => {
  const arvore = B.__TelefoneAdicionarProjeto({
    projeto: { caminho: '/nada', erro: 'não encontrei a pasta /nada', solucao: 'confira o caminho', aCriar: false },
    aoMudar: () => {}, aoCriar: () => {}, voltar: () => {},
  });
  const alerta = nosDe(arvore, (n) => n.props && n.props.role === 'alert')[0];
  assert.ok(alerta, 'o erro é anunciado (role=alert)');
  assert.match(textoDe(alerta), /não encontrei a pasta \/nada/);
  assert.match(textoDe(alerta), /confira o caminho/);

  const aCriar = B.__TelefoneAdicionarProjeto({
    projeto: { caminho: '~/x', aCriar: true }, aoMudar: () => {}, aoCriar: () => {}, voltar: () => {},
  });
  const botao = nosDe(aCriar, (n) => n.tipo === 'button' && n.props.type === 'submit')[0];
  assert.equal(botao.props.disabled, true, 'enquanto cria, não se submete duas vezes');
  assert.equal(textoDe(botao), 'A adicionar…');
  const campo = nosDe(aCriar, (n) => n.tipo === 'input')[0];
  assert.equal(campo.props.disabled, true);
});

test('adicionar projeto: a lista de Grupos tem a entrada e o fluxo usa o workspaces.create', () => {
  assert.ok(BUNDLE.includes("'data-vista': 'adicionar-projeto'"), 'há um ecrã próprio na pilha do celular');
  assert.ok(BUNDLE.includes("'Adicionar projeto'"), 'a entrada "Adicionar projeto" existe');
  assert.ok(BUNDLE.includes('servico.create({ path: caminho })'), 'cria pelo workspaces.create do DSH');
  assert.ok(BUNDLE.includes("acao: 'resolver'"), 'resolve o caminho (~ → absoluto) no host antes de criar');
  assert.ok(BUNDLE.includes('definirCaminhoProjeto') && BUNDLE.includes('criarProjeto'), 'núcleo expõe o fluxo');
  assert.ok(BUNDLE.includes('.wg-tel-projeto-erro{'), 'o erro tem estilo próprio');
  assert.equal(typeof B.__TelefoneAdicionarProjeto, 'function');
});

test('ordem: a PRIMEIRA mesa é a do projeto que commitou por último (sala + grupos)', () => {
  const workspaces = {
    fonte: 'dsh',
    arquivoConhecido: true,
    archived: [],
    items: [
      { id: 'w1', title: 'antigo', path: '/p/antigo', sessionIds: ['s1'] },
      { id: 'w2', title: 'recente', path: '/p/recente', sessionIds: ['s2'] },
      { id: 'w3', title: 'sem-git', path: '/p/sem-git', sessionIds: ['s3'] },
    ],
  };
  const pessoas = ['s1', 's2', 's3'].map((id) => ({
    id, name: id.toUpperCase(), status: 'working', running: true, blank: false, flags: {}, avatar: null,
  }));
  const commits = { '/p/antigo': '2026-10-01T10:00:00Z', '/p/recente': '2026-10-20T10:00:00Z' };
  const filtros = { soTrabalhando: false, mostrarEmBranco: true, mostrarSemWorkspace: true, mostrarAbertos: true };
  const layout = B.__montarEscritorio(pessoas, workspaces, filtros, commits);
  const equipas = [...layout.equipas.values()];
  assert.deepEqual(equipas.map((e) => e.name), ['recente', 'antigo', 'sem-git'], 'grupos pela data do commit');
  assert.equal(layout.equipas.get('ws:w2').caminho, '/p/recente', 'a equipa guarda o caminho absoluto (chave do mapa)');
  assert.equal(layout.modules[0].teamId, 'ws:w2', 'a 1.ª mesa da sala é a do commit mais recente');

  const semDados = B.__montarEscritorio(pessoas, workspaces, filtros, {});
  assert.deepEqual([...semDados.equipas.values()].map((e) => e.name), ['antigo', 'recente', 'sem-git'], 'sem commits: ordem do DSH intacta');
});

test('label online: diz QUEM trabalha (até dois nomes) e passa a número a partir de três', () => {
  assert.equal(B.__rotuloOnline(['Rui']), 'Rui online');
  assert.equal(B.__rotuloOnline(['Rui', 'Bia']), 'Rui, Bia online');
  assert.equal(B.__rotuloOnline(['Rui', 'Bia', 'Alex']), '3 online');
  assert.equal(B.__rotuloOnline([]), '');
  assert.equal(B.__rotuloOnline(null), '');
  assert.equal(B.__rotuloOnline(['Ana Maria Silva']), 'Ana online', 'só o primeiro nome, cortado a 10');
});
