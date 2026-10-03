/*
 * tests/plugin/contacto.test.mjs — o "Adicionar contacto" das CADEIRAS VAZIAS.
 *
 * Clicar num lugar livre abre o celular no layout de recruta (§11 do contrato):
 * nome livre, preview do boneco (com "Trocar"), a área do prompt, as skills por
 * checkbox — que entram no prompt como tokens `/nome`, o gesto de invocação do
 * DSH — e o modelo que vai correr tudo. Aqui cobre-se, em Node e com as formas
 * reais do DSH:
 *   - a identidade escolhida (identidadeDeNome): o boneco nasce do MESMO
 *     gênero do nome (regra de 2026-09-29) e o "Trocar" roda o pool desse
 *     gênero; determinística para o mesmo nome + salto;
 *   - o prompt final (comporPromptContacto): texto + `Skills: /a /b` —
 *     exatamente o que o pre-step dsh-tool-skill lê para injetar as skills;
 *   - o núcleo: a cadeira abre a vista 'adicionar-contacto' com o lugar fora
 *     do `telefone` (a forma de getTelefone() é contrato), o "‹" cancela e
 *     fechar limpa tudo;
 *   - criarContacto de ponta a ponta: cria a sessão NO WORKSPACE do lugar,
 *     grava a identidade escolhida (o nome e o boneco que a ficha vai ter),
 *     abre a conversa, instala o modelo escolhido e envia o prompt final;
 *   - o catálogo: skills da sessão de referência e modelos do host, com
 *     degradação honesta (notas) quando o DSH não expõe um dos canais;
 *   - o render da tela (react falso que guarda a árvore): nome, boneco, prompt,
 *     checkboxes das skills, modelo e o botão que chama criarContacto.
 *
 * Executar: node --test tests/plugin/contacto.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

let moduloBundle = null;
// React falso: createElement guarda a ÁRVORE; hooks mínimos com backend
// substituível (usarHooksComEstado) para percorrer o formulário como o React.
const noDe = (tipo, props, ...filhos) => ({ tipo, props: props || {}, filhos: filhos.flat(Infinity).filter((f) => f != null && f !== false) });
const hooksSemEstado = {
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useRef: (v) => ({ current: v }),
};
let hooksBackend = hooksSemEstado;
const reactFalso = {
  createElement: noDe,
  useState: (v) => hooksBackend.useState(v),
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (f) => f(),
  useRef: (v) => hooksBackend.useRef(v),
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

const nosDe = (no, pred, fora = []) => {
  if (!no || typeof no !== 'object') return fora;
  if (pred(no)) fora.push(no);
  for (const f of no.filhos || []) nosDe(f, pred, fora);
  return fora;
};
const usarHooksComEstado = () => {
  const slots = [];
  let i = 0;
  hooksBackend = {
    useState: (v) => {
      const k = i; i += 1;
      if (!(k in slots)) slots[k] = { valor: typeof v === 'function' ? v() : v };
      return [slots[k].valor, (novo) => { slots[k].valor = typeof novo === 'function' ? novo(slots[k].valor) : novo; }];
    },
    useRef: (v) => {
      const k = i; i += 1;
      if (!(k in slots)) slots[k] = { valor: { current: v } };
      return slots[k].valor;
    },
  };
  return {
    render: (componente, props) => { i = 0; return componente(props); },
    restaurar: () => { hooksBackend = hooksSemEstado; },
  };
};
const comStorage = (dados = new Map()) => {
  globalThis.window.localStorage = {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => { dados.set(k, String(v)); },
    removeItem: (k) => { dados.delete(k); },
  };
  return dados;
};

/* ---------- fakes do DSH (catálogo, criação e conversa) ---------- */

// ctx Cordis falso para o núcleo: `sessions.create` + `remote.{session,skills}`.
function ctxFalso({ skills = [], modelos = [], padrao = null, idNovo = 'novo-1', semRemote = false } = {}) {
  const reg = { creates: [], selects: [], skillCalls: [], catalogCalls: 0 };
  const remote = {
    session: {
      async modelCatalog() {
        reg.catalogCalls += 1;
        return {
          ok: true,
          value: {
            default: padrao || { provider: 'prov', model: 'm1' },
            routableProviders: ['prov'],
            groups: [{ id: 'prov', name: 'Provedor', models: modelos.length ? modelos : [{ id: 'm1', name: 'Modelo 1' }] }],
            failures: [],
          },
        };
      },
      async selectModel(pedido) {
        reg.selects.push(pedido);
        return { ok: true, value: { selected: { provider: pedido.provider, model: pedido.model } } };
      },
    },
    skills: {
      async list(pedido) {
        reg.skillCalls.push(pedido);
        return { ok: true, value: { skills } };
      },
    },
  };
  const ctx = {
    sessions: {
      async create(opcoes) { reg.creates.push(opcoes); return idNovo; },
    },
    get(nome) {
      if (semRemote) return undefined;
      // O DSH lê os namespaces do `remote` pelo nome completo (inject).
      if (nome === 'remote.session') return remote.session;
      if (nome === 'remote.skills') return remote.skills;
      return undefined;
    },
  };
  return { ctx, reg, remote };
}

// Controlador de conversa falso: regista o que se envia.
function conversaFalsa(id = 'novo-1') {
  const reg = { envios: [], libertada: false };
  return {
    reg,
    sessionId: id,
    getSnapshot: () => ({
      sessionId: id, fase: 'aberta', erro: null, itens: [], ecos: [], fila: [], falhados: [],
      aCorrer: false, aguardaPrimeiroTurno: false, temMais: false, aCarregarAntigas: false,
      removida: false, subagent: false, erroEnvio: null, erroAgente: null, erroFila: null,
      fonte: 'chat', inerte: false,
    }),
    subscribe: () => () => {},
    enviar: async (texto) => { reg.envios.push(texto); return { ok: true }; },
    reenviar: async () => ({ ok: true }),
    enviarAgora: async () => ({ ok: true }),
    descartar: async () => ({ ok: true }),
    maisAntigas: async () => {},
    libertar: () => { reg.libertada = true; },
  };
}

/* ---------- identidade escolhida (nome livre + boneco) ---------- */

test('identidadeDeNome: o boneco nasce do MESMO gênero do nome (regra de 2026-09-29)', () => {
  for (const [nome, genero] of [['Maya', 'f'], ['Bia', 'f'], ['Rui', 'm'], ['Théo', 'm']]) {
    const id = B.__identidadeDeNome(nome);
    assert.equal(id.name, nome);
    assert.equal(B.__GENERO_AVATAR[id.avatar], genero, `${nome} → boneco ${genero}`);
    assert.ok(id.style && id.style.id, 'tem estilo (paleta) derivado');
  }
});

test('identidadeDeNome: determinística, e o "Trocar" (salto) roda o pool do gênero', () => {
  const a = B.__identidadeDeNome('Maya', 0);
  const b = B.__identidadeDeNome('Maya', 0);
  assert.deepEqual(a, b, 'o mesmo nome + salto dá o mesmo boneco em qualquer browser');
  const outro = B.__identidadeDeNome('Maya', 1);
  assert.notEqual(outro.avatar, a.avatar, 'salto seguinte troca o boneco');
  assert.equal(B.__GENERO_AVATAR[outro.avatar], 'f', 'e continua do gênero do nome');
  // Nome com gênero desconhecido: pool inteiro, mas estável.
  const x = B.__identidadeDeNome('Zorblatt', 0);
  const y = B.__identidadeDeNome('Zorblatt', 0);
  assert.deepEqual(x, y);
  assert.ok(B.__GENERO_AVATAR[x.avatar], 'mesmo nome desconhecido ganha um boneco do banco');
  assert.equal(B.__identidadeDeNome('  Maya  ').name, 'Maya', 'o nome entra aparado');
});

/* ---------- prompt final: texto + skills ---------- */

test('comporPromptContacto: as skills escolhidas entram no prompt como /nome', () => {
  assert.equal(
    B.__comporPromptContacto('faz X', ['tavily-agent-skill', 'github-agent-skill']),
    'faz X\n\nSkills: /tavily-agent-skill /github-agent-skill',
  );
  assert.equal(B.__comporPromptContacto('', ['a-skill']), 'Skills: /a-skill', 'sem texto: só as skills');
  assert.equal(B.__comporPromptContacto('  só texto  ', []), 'só texto', 'sem skills: só o texto aparado');
  assert.equal(B.__comporPromptContacto('x', null), 'x', 'sem lista: o texto');
});

test('comporPromptContacto: só nomes kebab-case viram tokens (caminhos e nomes compostos ficam de fora)', () => {
  assert.equal(
    B.__comporPromptContacto('t', ['Nome Inválido', '/usr/bin', 'ok-name', 'skills/x', 'a-b-c']),
    't\n\nSkills: /ok-name /a-b-c',
  );
});

/* ---------- núcleo: a cadeira vazia abre a tela e guarda o lugar ---------- */

test('núcleo: a cadeira vazia abre "adicionar-contacto" — o lugar fica FORA de getTelefone() (contrato de 5 campos)', () => {
  const { ctx } = ctxFalso();
  const n = B.__criarNucleo({ ctx, abrirConversa: () => conversaFalsa() });
  assert.deepEqual(n.getTelefone(), { aberto: false, sessionId: null, vista: 'conversa', grupoId: null, origem: 'cena' });
  n.abrirAdicionarContacto({ workspaceId: 'w1', lugar: '2', referencia: 's-ref' });
  assert.deepEqual(n.getTelefone(), { aberto: true, sessionId: null, vista: 'adicionar-contacto', grupoId: null, origem: 'cena' },
    'a MESMA forma de getTelefone(), sem campos novos');
  assert.deepEqual(n.getRecruta(), { workspaceId: 'w1', lugar: '2', referencia: 's-ref' });
  // "‹" cancela o recruta e volta aos grupos (o lugar fica livre outra vez).
  n.voltarTelefone();
  assert.deepEqual(n.getTelefone(), { aberto: true, sessionId: null, vista: 'grupos', grupoId: null, origem: 'cena' });
  assert.equal(n.getRecruta(), null, 'o recruta desfez-se');
  n.dispose();
});

test('núcleo: fechar o celular limpa o recruta pendente', () => {
  const { ctx } = ctxFalso();
  const n = B.__criarNucleo({ ctx, abrirConversa: () => conversaFalsa() });
  n.abrirAdicionarContacto({ workspaceId: 'w1', lugar: '0', referencia: null });
  n.fecharTelefone();
  assert.equal(n.getTelefone().aberto, false);
  assert.equal(n.getRecruta(), null);
  n.dispose();
});

/* ---------- criarContacto: ponta a ponta ---------- */

test('criarContacto: cria a sessão no workspace do lugar, grava a identidade, abre a conversa, instala o modelo e envia o prompt', async () => {
  const antes = globalThis.window.localStorage;
  try {
    const dados = comStorage();
    const { ctx, reg } = ctxFalso({ skills: [], modelos: [{ id: 'gpt-x', name: 'GPT-X' }] });
    const conv = conversaFalsa('novo-1');
    const n = B.__criarNucleo({ ctx, abrirConversa: () => conv });
    n.abrirAdicionarContacto({ workspaceId: 'w1', lugar: '1', referencia: 's-ref' });

    const r = await n.criarContacto({
      identidade: { name: 'Maya', avatar: 'maya', style: { id: 'azul' } },
      prompt: 'faz X',
      skills: ['tavily-agent-skill'],
      modelo: { provider: 'prov', model: 'gpt-x' },
    });
    assert.deepEqual(r, { ok: true, sessionId: 'novo-1' });
    assert.deepEqual(reg.creates, [{ workspaceId: 'w1' }], 'a sessão nasce NO WORKSPACE da cadeira');
    assert.deepEqual(reg.selects, [{ sessionId: 'novo-1', provider: 'prov', model: 'gpt-x' }],
      'o modelo escolhido é instalado antes do primeiro prompt');
    assert.deepEqual(conv.reg.envios, ['faz X\n\nSkills: /tavily-agent-skill'], 'o prompt final (com as skills) foi enviado');
    // A identidade escolhida fica guardada: é o nome e o boneco que a ficha
    // vai ter quando a sessão aparecer na sala.
    const assoc = JSON.parse(dados.get('dsh-work-game:assoc'));
    assert.deepEqual(assoc['novo-1'], {
      name: 'Maya', avatar: 'maya', style: { id: 'azul' }, v: 3, escolhido: true,
    });
    // E o celular fica na conversa do novo contacto.
    assert.deepEqual(n.getTelefone(), { aberto: true, sessionId: 'novo-1', vista: 'conversa', grupoId: null, origem: 'cena' });
    assert.equal(n.getRecruta(), null, 'recrutar consumiu o lugar');
    n.dispose();
  } finally {
    globalThis.window.localStorage = antes;
  }
});

test('criarContacto: sem nome não cria nada; sem prompt cria a sessão e não envia', async () => {
  const antes = globalThis.window.localStorage;
  try {
    comStorage();
    const { ctx, reg } = ctxFalso();
    const conv = conversaFalsa();
    const n = B.__criarNucleo({ ctx, abrirConversa: () => conv });
    n.abrirAdicionarContacto({ workspaceId: 'w1', lugar: '0', referencia: null });

    const vazio = await n.criarContacto({ identidade: { name: '   ' } });
    assert.equal(vazio.ok, false);
    assert.equal(vazio.motivo, 'nome');
    assert.deepEqual(reg.creates, [], 'nada é criado sem nome');

    const r = await n.criarContacto({
      identidade: { name: 'Rui', avatar: 'rui', style: { id: 'bosque' } }, prompt: '   ', skills: [],
    });
    assert.equal(r.ok, true);
    assert.deepEqual(conv.reg.envios, [], 'sem prompt não há mensagem — o contacto fica por falar');
    n.dispose();
  } finally {
    globalThis.window.localStorage = antes;
  }
});

test('criarContacto: sem canal de sessões o erro vem à vista (nada de ficar preso)', async () => {
  const { ctx } = ctxFalso({ semRemote: true });
  ctx.sessions = undefined;
  const n = B.__criarNucleo({ ctx, abrirConversa: () => conversaFalsa() });
  n.abrirAdicionarContacto({ workspaceId: 'w1', lugar: '0', referencia: null });
  const r = await n.criarContacto({ identidade: { name: 'Maya', avatar: 'maya', style: { id: 'azul' } } });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'criar');
  assert.ok(r.erro, 'com o motivo a explicação');
  n.dispose();
});

/* ---------- catálogo: skills e modelos ---------- */

test('catalogoContacto: skills da sessão de referência e modelos do host, achatados com provider/model', async () => {
  const { ctx, reg } = ctxFalso({
    skills: [
      { name: 'tavily-agent-skill', description: 'Pesquisa web', modelInvocable: true },
      { name: 'github-agent-skill', description: 'GitHub', modelInvocable: false },
    ],
    modelos: [{ id: 'gpt-x', name: 'GPT-X' }, { id: 'gpt-y', name: 'GPT-Y' }],
    padrao: { provider: 'prov', model: 'gpt-y' },
  });
  const n = B.__criarNucleo({ ctx, abrirConversa: () => conversaFalsa() });
  const cat = await n.catalogoContacto('s-ref');
  assert.deepEqual(reg.skillCalls, [{ sessionId: 's-ref' }], 'o catálogo de skills é o da sessão de referência (cwd + preset)');
  assert.deepEqual(cat.skills.map((s) => s.name), ['tavily-agent-skill', 'github-agent-skill']);
  assert.deepEqual(cat.modelos, [
    { provider: 'prov', model: 'gpt-x', nome: 'GPT-X', grupo: 'Provedor' },
    { provider: 'prov', model: 'gpt-y', nome: 'GPT-Y', grupo: 'Provedor' },
  ]);
  assert.deepEqual(cat.modeloPadrao, { provider: 'prov', model: 'gpt-y' });
  assert.deepEqual(cat.notas, [], 'sem notas quando os canais respondem');
  n.dispose();
});

test('catalogoContacto: sem sessão de referência nem catálogo, as notas explicam e nada rebenta', async () => {
  const { ctx, reg } = ctxFalso({ skills: [] });
  const n = B.__criarNucleo({ ctx, abrirConversa: () => conversaFalsa() });
  const sem = await n.catalogoContacto(null);
  assert.deepEqual(reg.skillCalls, [], 'sem referência não se pede o catálogo de skills');
  assert.equal(sem.skills.length, 0);
  assert.match(sem.notas.join(' '), /Skills indisponíveis/);

  const { ctx: ctx2 } = ctxFalso({ semRemote: true });
  const n2 = B.__criarNucleo({ ctx: ctx2, abrirConversa: () => conversaFalsa() });
  const vazio = await n2.catalogoContacto('s-ref');
  assert.match(vazio.notas.join(' '), /Skills indisponíveis/);
  assert.match(vazio.notas.join(' '), /Modelos indisponíveis/);
  n.dispose();
  n2.dispose();
});

/* ---------- render da tela ---------- */

const catalogoDeTeste = {
  skills: [
    { name: 'tavily-agent-skill', description: 'Pesquisa web via API Tavily' },
    { name: 'github-agent-skill', description: 'Controla o GitHub' },
  ],
  modelos: [
    { provider: 'prov', model: 'gpt-x', nome: 'GPT-X', grupo: 'Provedor' },
    { provider: 'prov', model: 'gpt-y', nome: 'GPT-Y', grupo: 'Provedor' },
  ],
  modeloPadrao: { provider: 'prov', model: 'gpt-y' },
  notas: [],
};
const recrutaDeTeste = { workspaceId: 'w1', lugar: '1', referencia: 's-ref' };

test('tela: nome, boneco, prompt, skills por checkbox, modelo e o botão "Adicionar contacto"', () => {
  const hooks = usarHooksComEstado();
  try {
    const arvore = hooks.render(B.__TelefoneAdicionarContacto, {
      recruta: recrutaDeTeste, catalogoInicial: catalogoDeTeste, voltar: () => {},
    });
    const deExato = (classe) => nosDe(arvore, (n) => n.props.className === classe);
    assert.equal(deExato('wg-tel-contacto-nome').length, 1, 'campo do nome');
    assert.equal(deExato('wg-tel-contacto-boneco').length, 1, 'preview do boneco');
    assert.equal(deExato('wg-tel-contacto-prompt').length, 1, 'área do prompt');
    assert.equal(deExato('wg-tel-contacto-skill').length, 2, 'uma linha por skill');
    assert.equal(deExato('wg-tel-contacto-trocar').length, 1, 'o boneco pode trocar-se');
    assert.equal(deExato('wg-tel-contacto-modelo').length, 1, 'o modelo escolhe-se');
    const opcoes = nosDe(arvore, (n) => n.tipo === 'option');
    assert.deepEqual(opcoes.map((o) => o.props.value), ['prov/gpt-x', 'prov/gpt-y']);
    const botao = deExato('wg-tel-config-guardar')[0];
    assert.equal(botao.filhos.join(''), 'Adicionar contacto');
    // O preview nasce do nome vazio (boneco derivado) e mostra o <use> certo.
    const boneco = deExato('wg-tel-contacto-boneco')[0];
    assert.match(boneco.props.dangerouslySetInnerHTML.__html, /<use href="#wgav-[a-z]+-idle"/);
    // As skills escolhidas aparecem como /nome — o gesto que o DSH invoca.
    const nomes = nosDe(arvore, (n) => n.props.className === 'wg-tel-contacto-skill-nome');
    assert.deepEqual(nomes.map((n) => n.filhos.join('')), ['/tavily-agent-skill', '/github-agent-skill']);
  } finally {
    hooks.restaurar();
  }
});

test('tela: o nome escolhido muda o boneco do preview e as skills entram no prompt final', async () => {
  const hooks = usarHooksComEstado();
  try {
    const chamadas = [];
    const desenhar = () => hooks.render(B.__TelefoneAdicionarContacto, {
      recruta: recrutaDeTeste,
      catalogoInicial: catalogoDeTeste,
      criarContacto: async (dados) => { chamadas.push(dados); return { ok: true, sessionId: 'novo-1' }; },
      voltar: () => {},
    });
    let arvore = desenhar();
    const deExato = (classe) => nosDe(arvore, (n) => n.props.className === classe);
    const bonecoAtual = () => deExato('wg-tel-contacto-boneco')[0].props.dangerouslySetInnerHTML.__html.match(/#wgav-([a-z]+)-idle/)[1];

    deExato('wg-tel-contacto-nome')[0].props.onChange({ target: { value: 'Maya' } });
    deExato('wg-tel-contacto-prompt')[0].props.onChange({ target: { value: 'faz X' } });
    arvore = desenhar();
    const avatar = bonecoAtual();
    assert.equal(B.__GENERO_AVATAR[avatar], 'f', 'a "Maya" não ganha boneco de homem');
    // "Trocar boneco" roda o pool do gênero.
    deExato('wg-tel-contacto-trocar')[0].props.onClick();
    arvore = desenhar();
    const depois = bonecoAtual();
    assert.notEqual(depois, avatar);
    assert.equal(B.__GENERO_AVATAR[depois], 'f');

    // Checkbox: a skill escolhida entra no prompt final.
    assert.equal(deExato('wg-tel-contacto-final')[0].filhos.join(''), 'faz X');
    const caixas = nosDe(arvore, (n) => n.tipo === 'input' && n.props.type === 'checkbox');
    assert.equal(caixas.length, 2);
    caixas[0].props.onChange();
    arvore = desenhar();
    assert.equal(deExato('wg-tel-contacto-final')[0].filhos.join(''), 'faz X\n\nSkills: /tavily-agent-skill');

    // Enviar: os dados vão completos para o núcleo (identidade, prompt, skills e modelo).
    deExato('wg-tel-config-guardar')[0].props.onClick();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].identidade.name, 'Maya');
    assert.equal(chamadas[0].identidade.avatar, depois);
    assert.equal(chamadas[0].prompt, 'faz X');
    assert.deepEqual(chamadas[0].skills, ['tavily-agent-skill']);
    assert.deepEqual(chamadas[0].modelo, { provider: 'prov', model: 'gpt-y' }, 'o modelo do catálogo (pré-selecionado)');
  } finally {
    hooks.restaurar();
  }
});
