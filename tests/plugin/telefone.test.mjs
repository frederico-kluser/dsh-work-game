/*
 * tests/plugin/telefone.test.mjs — o CELULAR do Modo jogo (iPhone + iMessage).
 *
 * Clicar numa pessoa abre a conversa REAL dela num celular. Aqui cobre-se, em
 * Node e com as formas reais do DSH 0.1.6-alpha.2:
 *   - a parte pura: nós do alvo 'chat' do ui-chat (user, steering,
 *     assistant-step, tool-call a correr/assente, context, turn-error, moldura
 *     turn-process/turn-tail/system-prompt) → bolhas, ferramentas resumidas,
 *     linhas discretas; o fallback cru pelos eventos do eventSource;
 *   - as linhas do iMessage: agrupamento, cauda na última bolha do grupo,
 *     separadores de hora ("Hoje 14:32", "Ontem…"), recibos ("Entregue",
 *     "na fila", "Não entregue"), "a escrever…", DOM limitado;
 *   - o controlador (criarConversaTelefone) com um ctx falso: retain com o
 *     rótulo PRÓPRIO 'dshWorkGame' (nunca 'mainView'), assinaturas, ecos sem
 *     bolha dupla, envio com beginSubmission + prompt(requestId) em 'queue',
 *     subagentes sem eco do DSH, erros ("Não entregue"), release UMA vez e só
 *     depois de desligar tudo;
 *   - o núcleo: trocar de pessoa faz retain da nova antes do release da
 *     anterior; fechar, trocar a seleção, desmontar o painel e o dispose
 *     libertam — nenhuma referência fica pendurada;
 *   - segurança: o texto das mensagens nunca passa por innerHTML.
 *
 * Executar: node --test tests/plugin/telefone.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

/* ---------- formas reais do alvo 'chat' (ui-chat/contract/chat-nodes.ts) ---------- */

const T0 = new Date(2026, 8, 28, 14, 30, 0).getTime(); // hora local: independente do fuso
const min = (n) => n * 60 * 1000;
// key = conversationContextKey(kind, id) = `${kind.length}:${kind}${id}` (conversation.ts:295-297)
const chave = (kind, id) => `${kind.length}:${kind}${id}`;
const no = (kind, id, data, extra = {}) => ({
  key: chave(kind === 'user' || kind === 'steering' || kind === 'context' ? 'input-message' : kind, id),
  kind, id: String(id), target: 'chat', anchorSeq: 1, location: {}, visibility: 'visible', data, ...extra,
});
const utilizador = (id, texto, time, rpcId) => no('user', id, {
  kind: 'user', seq: 40, time, content: [{ type: 'text', text: texto }],
  source: rpcId ? { kind: 'user', rpcId } : { kind: 'user' },
});
const assistente = (id, blocos, time, status = 'settled') => no('assistant-step', id, {
  status, turn: 3, step: 1, time, blocks: blocos,
});
const ferramentaACorrer = (id, name, args, time) => no('tool-call', id, {
  root: { callId: `c${id}`, name, argsRaw: JSON.stringify(args), turn: 3, step: 1, time, subCalls: [] },
});
const ferramentaAssente = (id, name, args, time, isError = false) => no('tool-call', id, {
  root: {
    kind: 'tool-result', seq: 50, time, callId: `c${id}`, call: { name, argsRaw: JSON.stringify(args) }, callTime: time - 500,
    content: [{ type: 'text', text: 'saída' }], isError, subCalls: [],
  },
});
function chatDe(nos) {
  const mapa = new Map(nos.map((n) => [n.key, n]));
  return {
    order: nos.filter((n) => n.visibility !== 'hidden').map((n) => n.key),
    nodes: { get: (k) => mapa.get(k), source: () => ({}), processSource: () => ({}), values: () => [...mapa.values()] },
    timeline: { turnOrder: [], turns: new Map() },
    legacy: { nodes: [], partial: null, runningCalls: [] },
  };
}

test('itensDoChat: nós reais do ui-chat → bolhas, ferramentas e linhas discretas (sem a moldura do DSH)', () => {
  const chat = chatDe([
    no('system-prompt', 's', { text: 'És um agente…' }),
    utilizador('u1', 'corrige o teste', T0, 'rq-1'),
    no('context', 'ctx1', { kind: 'context', seq: 41, time: T0 + 100, content: [{ type: 'text', text: '# AGENTS.md…' }], source: { kind: 'agents-md' }, producer: { role: 'instructions', label: '@deepseek-ai/dsh-system-prompt' }, form: null }),
    no('turn-process', 'p3', { turn: 3, controlAnchorSeq: 40, processStartSeq: 41, answerAnchorSeq: null, answerStep: null, inlineReasoning: true, messageCount: 2, toolCallCount: 1, subagentCount: 0 }),
    assistente('3:1', [{ kind: 'reasoning', text: 'Vou ver…' }, { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' }], T0 + 1200),
    ferramentaAssente('c1', 'bash', { command: 'cd /Volumes/X/projeto && npm test' }, T0 + 1500, true),
    ferramentaACorrer('c2', 'read', { path: '/Volumes/X/projeto/dsh-plugin/src/client.js' }, T0 + 1600),
    assistente('3:2', [{ kind: 'reasoning', text: 'hmm' }, { kind: 'text', text: 'Encontrei o erro em' }], T0 + 2000, 'running'),
    no('turn-error', 'e3', { kind: 'turn-error', seq: 60, time: T0 + 3000, turn: 3, step: 2, message: 'rate limit' }),
    no('turn-tail', 't3', { turn: 3, seq: 61, time: T0 + 3000, closing: null, branchUnavailable: false }),
    no('steering', 'st', { kind: 'steering', messageId: 'm9', seq: 62, time: T0 + 3100, content: [{ type: 'text', text: 'e o outro ficheiro?' }, { type: 'image', attachment: { attachmentId: 'a1', mediaType: 'image/png', bytes: 3, width: 1, height: 1, name: 'ecra.png' } }], source: { kind: 'user', rpcId: 'rq-2' } }),
    no('assistant-step', 'oculto', { status: 'settled', turn: 4, step: 1, time: T0 + 4000, blocks: [{ kind: 'text', text: 'invisível' }] }, { visibility: 'hidden' }),
    no('workflow-run', 'w1', { time: T0 + 5000 }),
    no('plugin-desconhecido', 'x1', { time: T0 + 5000 }),
  ]);
  // o nó hidden fica também fora do `order` real; aqui força-se a presença para provar o filtro
  chat.order.push(chave('assistant-step', 'oculto'));
  const itens = B.__itensDoChat(chat);
  assert.deepEqual(itens.map((i) => `${i.tipo}:${i.lado ?? i.variante ?? i.estado}`), [
    'msg:eu', 'sistema:info', 'ferramenta:erro', 'ferramenta:a-correr', 'msg:ele', 'sistema:erro', 'msg:eu', 'sistema:info',
  ], 'moldura (system-prompt, turn-process, turn-tail), passo só com pensamento, hidden e kinds desconhecidos ficam de fora');
  const [eu, ctx, bash, read, ele, erro, steering, workflow] = itens;
  assert.equal(eu.texto, 'corrige o teste');
  assert.equal(eu.rpcId, 'rq-1');
  assert.equal(eu.time, T0);
  assert.equal(ctx.texto, 'Contexto · dsh-system-prompt', 'o produtor sem o @scope/');
  assert.equal(bash.nome, 'bash');
  assert.equal(bash.resumo, 'npm test', '"cd pasta &&" sai do resumo');
  assert.equal(read.resumo, '/Volumes/X/projeto/dsh-plugin/src/client.js', 'caminho curto: inteiro');
  assert.equal(B.__resumoArgs({ file_path: '/Volumes/Ext2TB/Projects/dsh-work-game/dsh-plugin/src/client.js' }), '…Projects/dsh-work-game/dsh-plugin/src/client.js', 'caminhos longos: o fim é o que conta');
  assert.equal(ele.texto, 'Encontrei o erro em', 'o pensamento (reasoning) fica de fora');
  assert.equal(ele.estado, 'a-transmitir', 'status running = a transmitir');
  assert.equal(erro.texto, 'Erro no turno: rate limit');
  assert.equal(steering.lado, 'eu', 'steering é uma mensagem minha');
  assert.deepEqual(steering.anexos, [{ tipo: 'imagem', nome: 'ecra.png' }]);
  assert.equal(workflow.texto, 'Workflow em execução');
  assert.deepEqual(B.__itensDoChat(undefined), [], 'antes de o alvo ativar, o snapshot é undefined');
});

test('itensDoChat: em streaming relê nodes.get(key) — o `order` não muda, os nós sim', () => {
  const n1 = assistente('1:1', [{ kind: 'text', text: 'Ol' }], T0, 'running');
  const mapa = new Map([[n1.key, n1]]);
  const chat = { order: [n1.key], nodes: { get: (k) => mapa.get(k) } };
  assert.equal(B.__itensDoChat(chat)[0].texto, 'Ol');
  mapa.set(n1.key, assistente('1:1', [{ kind: 'text', text: 'Olá, tudo certo.' }], T0, 'settled'));
  const [depois] = B.__itensDoChat(chat);
  assert.equal(depois.texto, 'Olá, tudo certo.');
  assert.equal(depois.estado, 'ok');
});

test('itensDoFluxo: fallback sem uiConversation dobra os eventos crus do eventSource', () => {
  const ev = (seq, type, data) => ({ type: 'event', event: { type, seq, time: T0 + seq * 1000, data } });
  const janela = {
    hasMore: false, revision: 3,
    entries: [
      ev(1, 'turn/start', { turn: 1 }),
      ev(2, 'user/message', { id: 'm1', role: 'user', content: [{ type: 'text', text: 'lista os ficheiros' }], source: { kind: 'user', rpcId: 'rq-9' } }),
      ev(3, 'user/message', { id: 'm2', role: 'user', content: [{ type: 'text', text: 'AGENTS.md…' }], source: { kind: 'plugin', plugin: 'agents-md' } }),
      ev(4, 'tool/call', { turn: 1, step: 1, callId: 'k1', name: 'bash', arguments: { command: 'ls -la' } }),
      ev(5, 'tool/result', { turn: 1, step: 1, message: { content: [{ type: 'tool-result', toolCallId: 'k1', content: [{ type: 'text', text: 'a b' }] }] } }),
      ev(6, 'assistant/message', { turn: 1, step: 2, message: { id: 'a1', role: 'assistant', content: [{ type: 'reasoning', text: 'x' }, { type: 'text', text: 'Há 2 ficheiros.' }], source: { kind: 'model', provider: 'p', model: 'm' } }, stream: [] }),
      ev(7, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      { type: 'transient', event: { type: 'assistant/live-chunk', seq: 7, time: T0 + 8000, data: { attemptId: 'at1', turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text: 'A pens' } } } },
      { type: 'transient', event: { type: 'assistant/live-chunk', seq: 7, time: T0 + 8100, data: { attemptId: 'at1', turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text: 'ar…' } } } },
    ],
  };
  const itens = B.__itensDoFluxo(janela);
  assert.deepEqual(itens.map((i) => `${i.tipo}:${i.lado ?? i.variante ?? ''}:${i.estado ?? ''}`), [
    'msg:eu:ok', 'sistema:info:', 'ferramenta::ok', 'msg:ele:ok', 'msg:ele:a-transmitir',
  ]);
  assert.equal(itens[0].rpcId, 'rq-9');
  assert.equal(itens[2].resumo, 'ls -la');
  assert.equal(itens[3].texto, 'Há 2 ficheiros.');
  assert.equal(itens[4].texto, 'A pensar…', 'os text-delta transitórios juntam-se numa bolha a transmitir');
});

/* ---------- linhas do iMessage (puras) ---------- */

const msg = (key, lado, time, texto = key, extra = {}) => ({ key, tipo: 'msg', lado, time, texto, anexos: [], estado: 'ok', ...extra });
const conversa = (itens, extra = {}) => ({
  sessionId: 's1', fase: 'aberta', erro: null, itens, ecos: [], fila: [], falhados: [],
  aCorrer: false, aguardaPrimeiroTurno: false, temMais: false, aCarregarAntigas: false,
  removida: false, subagente: false, erroEnvio: null, erroAgente: null, fonte: 'chat', ...extra,
});
const sóMsgs = (linhas) => linhas.filter((l) => l.tipo === 'msg');

test('linhas: bolhas seguidas do mesmo lado agrupam-se e só a última de cada grupo tem cauda', () => {
  const { linhas } = B.__linhasDoTelefone(conversa([
    msg('a', 'eu', T0), msg('b', 'eu', T0 + 1000),
    msg('c', 'ele', T0 + 2000), msg('d', 'ele', T0 + 3000),
    { key: 'f1', tipo: 'ferramenta', time: T0 + 3500, nome: 'bash', resumo: 'npm test', estado: 'ok' },
    { key: 'f2', tipo: 'ferramenta', time: T0 + 3600, nome: 'read', resumo: 'a.js', estado: 'ok' },
    msg('e', 'ele', T0 + 4000),
  ]), { agora: T0 + min(1) });
  const m = Object.fromEntries(sóMsgs(linhas).map((l) => [l.key, l]));
  assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map((k) => [m[k].inicioGrupo, m[k].cauda]), [
    [true, false], [false, true], [true, false], [false, true], [true, true],
  ]);
  const ferr = linhas.filter((l) => l.tipo === 'ferramentas');
  assert.equal(ferr.length, 1, 'ferramentas seguidas numa só linha');
  assert.deepEqual(ferr[0].itens.map((i) => i.nome), ['bash', 'read']);
  assert.equal(m.b.recibo, 'Entregue', '"Entregue" sob a última mensagem minha');
  assert.equal(m.a.recibo, null);
});

test('linhas: separadores de hora no início, após 15 min de silêncio e noutro dia (Hoje/Ontem/dia da semana)', () => {
  const ontem = T0 - 24 * 3600 * 1000;
  const { linhas } = B.__linhasDoTelefone(conversa([
    msg('a', 'eu', ontem), msg('b', 'ele', ontem + min(2)),
    msg('c', 'eu', T0), msg('d', 'ele', T0 + min(10)), msg('e', 'eu', T0 + min(40)),
  ]), { agora: T0 + min(41) });
  const datas = linhas.filter((l) => l.tipo === 'data');
  assert.deepEqual(datas.map((d) => `${d.dia} ${d.hora}`), ['Ontem 14:30', 'Hoje 14:30', 'Hoje 15:10']);
  assert.equal(linhas[0].tipo, 'data', 'a conversa abre com a hora');
  assert.deepEqual(B.__rotuloData(T0 - 3 * 86400000, T0), { dia: ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][new Date(T0 - 3 * 86400000).getDay()], hora: '14:30' });
  assert.deepEqual(B.__rotuloData(new Date(2026, 5, 2, 9, 5).getTime(), T0), { dia: '2 de jun.', hora: '09:05' });
  assert.deepEqual(B.__rotuloData(new Date(2025, 11, 31, 23, 59).getTime(), T0), { dia: '31 de dez. de 2025', hora: '23:59' });
});

test('linhas: eco pendente, fila ("na fila"), envio falhado ("Não entregue") e erro do agente', () => {
  const { linhas } = B.__linhasDoTelefone(conversa([msg('a', 'eu', T0), msg('b', 'ele', T0 + 1000)], {
    ecos: [{ requestId: 'rq-5', texto: 'já vai', time: T0 + 2000, placement: 'transcript' }],
    fila: [{ id: 'q1', texto: 'depois isto', anexos: [] }, { id: 'q2', texto: 'e isto', anexos: [] }],
    falhados: [{ id: 'f1', texto: 'não foi', time: T0 + 3000, erro: 'sem rede' }],
    erroAgente: 'provider 500',
  }), { agora: T0 });
  const m = sóMsgs(linhas);
  assert.deepEqual(m.map((l) => `${l.key}:${l.estado}:${l.recibo}`), [
    'a:ok:Entregue', 'b:ok:null', 'eco:rq-5:pendente:null', 'fila:q1:fila:null', 'fila:q2:fila:na fila', 'falhou:f1:falhou:Não entregue',
  ]);
  assert.equal(m[5].erro, 'sem rede');
  assert.equal(m[5].id, 'f1', 'o id serve para "tentar de novo"');
  const ultimo = linhas[linhas.length - 1];
  assert.equal(ultimo.tipo, 'sistema');
  assert.equal(ultimo.variante, 'erro');
  assert.match(ultimo.texto, /provider 500/);
});

test('"a escrever…": a correr, à espera do 1.º turno, entre steps ou com ferramenta — e nunca parada, apagada ou com erro', () => {
  const base = [msg('a', 'eu', T0)];
  assert.equal(B.__aEscrever(conversa(base)), false);
  assert.equal(B.__aEscrever(conversa(base, { aCorrer: true })), true);
  assert.equal(B.__aEscrever(conversa(base, { aguardaPrimeiroTurno: true })), true);
  // Como no iMessage: quando a resposta já aparece a crescer, os três pontos
  // saem (a bolha é o sinal) — a correr ou não.
  const aCrescer = [...base, msg('b', 'ele', T0, 'Ol', { estado: 'a-transmitir' })];
  assert.equal(B.__aEscrever(conversa(aCrescer)), false, 'a bolha a transmitir substitui o "a escrever…"');
  assert.equal(B.__aEscrever(conversa(aCrescer, { aCorrer: true })), false, 'também com a conversa a correr');
  const semTexto = B.__linhasDoTelefone(conversa(aCrescer, { aCorrer: true }), { agora: T0 }).linhas;
  assert.equal(semTexto.filter((l) => l.tipo === 'a-escrever').length, 0, 'nada de "•••" por baixo da bolha a crescer');
  assert.equal(B.__aEscrever(conversa([...base, msg('b', 'ele', T0, '  ', { estado: 'a-transmitir' })], { aCorrer: true })), true, 'bolha ainda sem texto: os três pontos continuam');
  // Entre steps (a resposta anterior já assentou, o turno continua): três pontos.
  assert.equal(B.__aEscrever(conversa([...base, msg('b', 'ele', T0, 'Vou ver.')], { aCorrer: true })), true, 'entre steps');
  assert.equal(B.__aEscrever(conversa([...base, { key: 'f', tipo: 'ferramenta', time: T0, nome: 'bash', resumo: '', estado: 'a-correr' }])), true);
  assert.equal(B.__aEscrever(conversa(base, { aCorrer: true, removida: true })), false);
  assert.equal(B.__aEscrever(conversa(base, { aCorrer: true, fase: 'erro' })), false);
  const { linhas } = B.__linhasDoTelefone(conversa(base, { aCorrer: true }), { agora: T0 });
  assert.equal(linhas[linhas.length - 1].tipo, 'a-escrever', 'os três pontos ficam sempre no fim');
});

test('DOM limitado: só as últimas N linhas; as antigas ficam contadas para "Mensagens anteriores"', () => {
  const itens = Array.from({ length: 450 }, (_, i) => msg(`m${i}`, i % 2 ? 'ele' : 'eu', T0 + i * 1000));
  const { linhas, escondidas, total } = B.__linhasDoTelefone(conversa(itens), { agora: T0 });
  assert.equal(B.__MAX_ITENS_TELEFONE, 200);
  assert.equal(total, 450);
  assert.equal(escondidas, 250);
  const m = sóMsgs(linhas);
  assert.equal(m.length, 200);
  assert.equal(m[0].key, 'm250');
  assert.equal(m[m.length - 1].key, 'm449', 'as mais recentes ficam');
  assert.equal(B.__linhasDoTelefone(conversa(itens), { agora: T0, max: 1000 }).escondidas, 0);
});

test('texto: blocos ``` em mono, `código` inline, **negrito**, títulos e listas — tudo como segmentos de texto', () => {
  const segs = B.__segmentosDeTexto('Veja:\n## Passo 2\n- **`df/mapa`** usa `x`\n---\n```js\nconst a = 1;\n```\nFim');
  assert.deepEqual(segs, [
    { tipo: 'texto', texto: 'Veja:\n' },
    { tipo: 'negrito', texto: 'Passo 2' },
    { tipo: 'texto', texto: '\n• ' },
    { tipo: 'codigo', texto: 'df/mapa' },
    { tipo: 'texto', texto: ' usa ' },
    { tipo: 'codigo', texto: 'x' },
    { tipo: 'texto', texto: '\n' },
    { tipo: 'bloco', texto: 'const a = 1;' },
    { tipo: 'texto', texto: 'Fim' },
  ]);
  const aTransmitir = B.__segmentosDeTexto('Código:\n```\nlinha 1\nlinha');
  assert.deepEqual(aTransmitir[aTransmitir.length - 1], { tipo: 'bloco', texto: 'linha 1\nlinha' }, 'bloco ainda sem fecho (streaming)');
  assert.deepEqual(B.__segmentosDeTexto('<img src=x onerror=alert(1)>'), [{ tipo: 'texto', texto: '<img src=x onerror=alert(1)>' }], 'HTML fica texto');
  assert.deepEqual(B.__segmentosDeTexto('ver [lib/repo.ts](lib/repo.ts) e **já re…'), [{ tipo: 'texto', texto: 'ver lib/repo.ts e já re…' }], 'links pelo rótulo; "**" sem par sai');
});

test('texto: tabelas Markdown viram "a · b" (cabeçalho a negrito) e réguas "---" não deixam buracos', () => {
  const segs = B.__segmentosDeTexto('Relatório final:\n\n---\n\n| Domínio | Registos ativos |\n|---|---:|\n| crawler | **12** |\n| chat | `3` |\n\n---\n');
  assert.deepEqual(segs, [
    { tipo: 'texto', texto: 'Relatório final:\n\n' },
    { tipo: 'negrito', texto: 'Domínio · Registos ativos' },
    { tipo: 'texto', texto: '\ncrawler · ' },
    { tipo: 'negrito', texto: '12' },
    { tipo: 'texto', texto: '\nchat · ' },
    { tipo: 'codigo', texto: '3' },
  ], 'sem pipes, sem a linha |---|, uma só linha vazia no lugar da régua e nada pendurado no fim');
  const texto = segs.map((x) => x.texto).join('');
  assert.ok(!texto.includes('|') && !/\n{3,}/.test(texto));
  // Sem linha separadora não há cabeçalho; uma régua sozinha entre parágrafos = uma linha vazia.
  assert.deepEqual(B.__segmentosDeTexto('| a | b |\n| c | d |'), [{ tipo: 'texto', texto: 'a · b\nc · d' }]);
  assert.deepEqual(B.__segmentosDeTexto('Antes\n\n\n***\n\n\nDepois'), [{ tipo: 'texto', texto: 'Antes\n\nDepois' }]);
  assert.deepEqual(B.__segmentosDeTexto('\n\nOlá\n\n'), [{ tipo: 'texto', texto: 'Olá' }], 'sem linhas vazias nas pontas da bolha');
  // Blocos de código ficam intactos (uma tabela dentro de ``` é código).
  assert.deepEqual(B.__segmentosDeTexto('```\n| x | y |\n|---|---|\n```'), [{ tipo: 'bloco', texto: '| x | y |\n|---|---|' }]);
});

test('texto: spans de código como no CommonMark — n crases, "\\`" literal, um espaço de cada lado sai', () => {
  const S = B.__segmentosDeTexto;
  // Crase escapada: literal, não abre código nem junta células.
  assert.deepEqual(B.__celulasDaTabela('| \\`a | b\\` |'), ['\\`a', 'b\\`'], '"\\`" não abre um span: 2 células');
  assert.deepEqual(S('| \\`a | b\\` |'), [{ tipo: 'texto', texto: '`a · b`' }], 'mostra-se "`" sem a barra');
  assert.deepEqual(S('usa \\`x\\` literal'), [{ tipo: 'texto', texto: 'usa `x` literal' }]);
  // Crases duplas: a célula e o texto concordam (antes: crases soltas e espaços no código).
  assert.deepEqual(S('| `` a|b `` | c |'), [{ tipo: 'codigo', texto: 'a|b' }, { tipo: 'texto', texto: ' · c' }]);
  assert.deepEqual(S('``x`y`` e `z`'), [{ tipo: 'codigo', texto: 'x`y' }, { tipo: 'texto', texto: ' e ' }, { tipo: 'codigo', texto: 'z' }], 'uma crase simples não fecha um span de duas');
  assert.deepEqual(S('`` `a` ``'), [{ tipo: 'codigo', texto: '`a`' }], 'um espaço de cada lado sai');
  assert.deepEqual(S('`sem fecho e **negrito**'), [{ tipo: 'texto', texto: '`sem fecho e ' }, { tipo: 'negrito', texto: 'negrito' }], 'crase sem par é texto');
  assert.deepEqual(S('`a\nb`'), [{ tipo: 'texto', texto: '`a\nb`' }], 'o código inline não atravessa linhas');
});

test('texto: células das tabelas — "|" em `código` e "\\|" não partem colunas; células vazias ficam ("—")', () => {
  const C = B.__celulasDaTabela;
  assert.deepEqual(C('| a | b |'), ['a', 'b']);
  assert.deepEqual(C('| estado | `idle|running` |'), ['estado', '`idle|running`'], 'pipe dentro de código');
  assert.deepEqual(C('| a \\| b | c |'), ['a | b', 'c'], 'pipe escapado, mostrado sem a barra');
  assert.deepEqual(C('| `a\\|b` | c |'), ['`a|b`', 'c'], 'escapado dentro do código também (GFM)');
  assert.deepEqual(C('| ``x`|`y`` | z |'), ['``x`|`y``', 'z'], 'span de duas crases: a crase simples não o fecha');
  assert.deepEqual(C('| `sem fecho | z |'), ['`sem fecho', 'z'], 'crase sem par é literal e o "|" separa');
  assert.deepEqual(C('|  | b |  |'), ['', 'b', ''], 'vazias ficam, pela ordem');
  assert.deepEqual(C('| a |'), ['a']);
  assert.equal(C('a | b'), null, 'não começa por "|"');

  const segs = B.__segmentosDeTexto('| Campo | Tipo | Nota |\n|---|---|---|\n| status | `idle|running` | |\n| x \\| y | | ok |');
  assert.deepEqual(segs, [
    { tipo: 'negrito', texto: 'Campo · Tipo · Nota' },
    { tipo: 'texto', texto: '\nstatus · ' },
    { tipo: 'codigo', texto: 'idle|running' },
    { tipo: 'texto', texto: ' · —\nx | y · — · ok' },
  ], 'as colunas não desalinham: 3 células em cada linha');
  // Linha só com células vazias não deixa "— · —" solto.
  assert.deepEqual(B.__segmentosDeTexto('| a | b |\n|  |  |\n| c | d |'), [{ tipo: 'texto', texto: 'a · b\n\nc · d' }]);
});

test('histórico da conversa → Atividade: pedidos, ferramentas (✓/✕/a correr), respostas assentes e erros, com a hora', () => {
  const h = B.__historicoDaConversa([
    msg('u1', 'eu', T0, 'corre   os\ntestes'),
    { key: 'f1', tipo: 'ferramenta', time: T0 + 1000, nome: 'bash', resumo: 'npm test', estado: 'ok' },
    { key: 'f2', tipo: 'ferramenta', time: null, nome: 'read', resumo: 'a.js', estado: 'erro' },
    { key: 'c', tipo: 'sistema', variante: 'info', time: T0 + 1500, texto: 'Contexto · AGENTS.md' },
    msg('r1', 'ele', T0 + 2000, 'Todos verdes.'),
    { key: 'e', tipo: 'sistema', variante: 'erro', time: T0 + 3000, texto: 'Erro no turno: rate limit' },
    { key: 'f3', tipo: 'ferramenta', time: T0 + 4000, nome: 'grep', resumo: '', estado: 'a-correr' },
    msg('r2', 'ele', T0 + 5000, 'A pen', { estado: 'a-transmitir' }),
  ]);
  assert.deepEqual(h.map((x) => [x.tipo, x.texto, x.at]), [
    ['pedido', 'Pediu: corre os testes', T0],
    ['ferramenta', 'Usou bash · npm test', T0 + 1000],
    ['ferramenta-erro', 'Falhou read · a.js', T0 + 1000],
    ['resposta', 'Respondeu: Todos verdes.', T0 + 2000],
    ['turno-erro', 'Erro no turno: rate limit', T0 + 3000],
    ['ferramenta-a-correr', 'A usar grep', T0 + 4000],
  ], 'sem hora própria herda a anterior; o contexto e o texto a transmitir ficam de fora');
  assert.ok(h.every((x) => x.origem === 'conversa'));
  assert.equal(B.__historicoDaConversa(Array.from({ length: 80 }, (_, k) => msg(`m${k}`, 'eu', T0 + k))).length, B.__MAX_ATIVIDADE);
  assert.deepEqual(B.__historicoDaConversa(undefined), []);
});

test('resumo de ferramentas: comando sem o "cd", caminho pelo fim, JSON estragado e vazio', () => {
  assert.equal(B.__resumoArgs('{"command":"cd \\"/a b\\" && npm test -- --watch"}'), 'npm test -- --watch');
  assert.equal(B.__resumoArgs({ command: ['git', 'status'] }), 'git status');
  assert.equal(B.__resumoArgs({ pattern: 'ctx.get', path: 'src' }), 'src');
  assert.equal(B.__resumoArgs({ query: 'cordis inject' }), 'cordis inject');
  assert.equal(B.__resumoArgs('{"command": "ls'), '{"command": "ls');
  assert.equal(B.__resumoArgs(''), '');
  assert.equal(B.__resumoArgs({ todos: [1, 2] }), '');
  assert.ok(B.__resumoArgs({ command: 'x'.repeat(200) }).length <= 60);
});

/* ---------- controlador com um ctx falso do DSH ---------- */

function dshFalso({ snapshot = {}, nos = [], comUiConversation = true, retainLanca = null, resposta = { ok: true, value: { accepted: true } }, promptLanca = null, eventos = null } = {}) {
  const reg = { retains: [], releases: 0, ordem: [], submissions: [], prompts: [], abandonos: 0, antigas: 0, abortado: false };
  let snap = {
    sessionId: 's1', pendingSubmissions: [], running: false, subagent: null, removed: false, openState: 'open',
    openError: null, hasMore: true, loadingOlder: false, promptError: null, blank: false, lastAgentError: null,
    promptAttempted: false, awaitingFirstTurn: false, ...snapshot,
  };
  let chat = chatDe(nos);
  let caixa = { 'next-turn': [], 'next-step': [] };
  const fonte = (nome, ler) => {
    const ouvintes = new Set();
    return {
      ouvintes,
      getSnapshot: ler,
      subscribe(fn) { ouvintes.add(fn); reg.ordem.push(`sub:${nome}`); return () => { ouvintes.delete(fn); reg.ordem.push(`unsub:${nome}`); }; },
      avisar() { for (const fn of [...ouvintes]) fn(); },
    };
  };
  const fSessao = fonte('sessao', () => snap);
  const fChat = fonte('chat', () => chat);
  const fCaixa = fonte('inbox', () => caixa);
  const fEventos = fonte('eventos', () => eventos ?? { entries: [], hasMore: false, revision: 0 });
  let n = 0;
  const sessao = {
    sessionId: 's1',
    getSnapshot: fSessao.getSnapshot,
    subscribe: fSessao.subscribe,
    projections: { faceOf: (k) => { assert.equal(k, 'inbox'); return fCaixa; } },
    beginSubmission(input) {
      n += 1;
      const requestId = `rq-${n}`;
      reg.submissions.push({ ...input, requestId });
      snap = { ...snap, pendingSubmissions: [...snap.pendingSubmissions, { requestId, placement: snap.running ? 'queued' : 'transcript', time: T0 + n, text: input.text, attachments: [] }] };
      fSessao.avisar();
      return { requestId, abandon() { reg.abandonos += 1; } };
    },
    async prompt(content, mode, signal, requestId) {
      reg.prompts.push({ content, mode, requestId });
      if (promptLanca) throw promptLanca;
      if (resposta && resposta.ok === false) {
        snap = { ...snap, pendingSubmissions: snap.pendingSubmissions.filter((p) => p.requestId !== requestId), promptError: { op: 'send', error: resposta.error } };
        fSessao.avisar();
      }
      return resposta;
    },
    async loadOlder() { reg.antigas += 1; },
    cancel: async () => ({ ok: true }),
  };
  const binding = { sessionId: 's1', session: sessao, eventSource: fEventos, ctx: {} };
  const ctx = {
    sessions: {
      retain(id, opcoes) {
        if (retainLanca) throw retainLanca;
        reg.retains.push({ id, source: opcoes.source, temSinal: !!opcoes.signal });
        if (opcoes.signal) opcoes.signal.addEventListener('abort', () => { reg.abortado = true; reg.ordem.push('abort'); });
        let vivo = true;
        return {
          sessionId: id,
          get binding() { if (!vivo) throw new Error(`Session reference "${id}" is released`); return binding; },
          ready: Promise.resolve(binding),
          release() { vivo = false; reg.releases += 1; reg.ordem.push('release'); },
        };
      },
    },
    get(nome) {
      if (nome === 'uiConversation' && comUiConversation) {
        return { binding: (b) => { assert.equal(b, binding); return { target: (t) => { assert.equal(t, 'chat'); return fChat; } }; } };
      }
      return undefined;
    },
  };
  return {
    ctx, reg, fSessao, fChat, fCaixa,
    mudarSessao(p) { snap = { ...snap, ...p }; fSessao.avisar(); },
    mudarChat(nos2) { chat = chatDe(nos2); fChat.avisar(); },
    mudarCaixa(c) { caixa = c; fCaixa.avisar(); },
  };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));

test('controlador: retain com o rótulo PRÓPRIO, assina sessão + inbox + alvo "chat" e publica as bolhas', async () => {
  const d = dshFalso({ nos: [utilizador('u1', 'olá', T0, 'rq-0'), assistente('1:1', [{ kind: 'text', text: 'Olá!' }], T0 + 500)] });
  const c = B.__criarConversaTelefone(d.ctx, 's1');
  assert.equal(B.__FONTE_TELEFONE, 'dshWorkGame');
  assert.deepEqual(d.reg.retains, [{ id: 's1', source: 'dshWorkGame', temSinal: true }], 'nunca "mainView" (o DSH tomaria o celular pela conversa principal)');
  assert.equal(c.getSnapshot().fonte, null, 'antes do ready ainda não há alvo "chat"');
  let avisos = 0;
  c.subscribe(() => { avisos += 1; });
  await esperar();
  const s = c.getSnapshot();
  assert.equal(s.fase, 'aberta');
  assert.equal(s.fonte, 'chat');
  assert.deepEqual(s.itens.map((i) => i.texto), ['olá', 'Olá!']);
  assert.ok(avisos >= 1);
  assert.deepEqual(d.reg.ordem.filter((x) => x.startsWith('sub:')), ['sub:sessao', 'sub:inbox', 'sub:chat']);
  assert.equal(globalThis.window.__wgTelefoneRefs, 1, 'diagnóstico: uma referência viva');

  // ao vivo: o alvo muda (streaming) e a sessão corre
  d.mudarChat([utilizador('u1', 'olá', T0, 'rq-0'), assistente('1:1', [{ kind: 'text', text: 'Olá!' }], T0 + 500), assistente('2:1', [{ kind: 'text', text: 'A pens' }], T0 + 900, 'running')]);
  d.mudarSessao({ running: true });
  assert.equal(c.getSnapshot().aCorrer, true);
  assert.equal(c.getSnapshot().itens[2].estado, 'a-transmitir');
  c.libertar();
});

test('controlador: enviar = beginSubmission (eco) + prompt(…, requestId) em "queue"; o eco some quando o durável chega', async () => {
  const d = dshFalso({ nos: [utilizador('u1', 'antes', T0, 'rq-0')] });
  const c = B.__criarConversaTelefone(d.ctx, 's1');
  await esperar();
  const r = await c.enviar('Teste do celular');
  assert.deepEqual(r, { ok: true, value: { accepted: true } });
  assert.deepEqual(d.reg.submissions.map((x) => [x.mode, x.text, x.attachments.length]), [['queue', 'Teste do celular', 0]]);
  assert.deepEqual(d.reg.prompts, [{ content: [{ type: 'text', text: 'Teste do celular' }], mode: 'queue', requestId: 'rq-1' }]);
  assert.deepEqual(c.getSnapshot().ecos.map((e) => [e.requestId, e.texto, e.placement]), [['rq-1', 'Teste do celular', 'transcript']], 'eco imediato');
  // o user/message durável com source.rpcId === requestId esconde o eco no MESMO render
  d.mudarChat([utilizador('u1', 'antes', T0, 'rq-0'), utilizador('u2', 'Teste do celular', T0 + 5, 'rq-1')]);
  assert.deepEqual(c.getSnapshot().ecos, [], 'sem bolha dupla');
  const { linhas } = B.__linhasDoTelefone(c.getSnapshot(), { agora: T0 });
  assert.deepEqual(sóMsgs(linhas).map((l) => `${l.texto}:${l.recibo}`), ['antes:null', 'Teste do celular:Entregue']);
  assert.deepEqual(await c.enviar('   '), { ok: false, motivo: 'vazio' }, 'nada de mensagens vazias');
  c.libertar();
});

test('controlador: a correr, a mensagem entra na fila ("na fila") — eco "queued" e depois a projeção inbox', async () => {
  const d = dshFalso({ snapshot: { running: true } });
  const c = B.__criarConversaTelefone(d.ctx, 's1');
  await esperar();
  await c.enviar('e depois isto');
  assert.equal(d.reg.prompts[0].mode, 'queue', 'sempre "queue" (steer não é o padrão)');
  const [eco] = c.getSnapshot().ecos;
  assert.equal(eco.placement, 'queued');
  let m = sóMsgs(B.__linhasDoTelefone(c.getSnapshot(), { agora: T0 }).linhas);
  assert.equal(m[m.length - 1].recibo, 'na fila');
  // o host admite-a na fila: a inbox traz a ocorrência com o mesmo rpcId
  d.mudarCaixa({ 'next-turn': [{ id: 'm7', role: 'user', content: [{ type: 'text', text: 'e depois isto' }], source: { kind: 'user', rpcId: 'rq-1' } }], 'next-step': [] });
  assert.deepEqual(c.getSnapshot().ecos, [], 'o eco sai quando a fila o mostra');
  assert.deepEqual(c.getSnapshot().fila.map((f) => f.texto), ['e depois isto']);
  m = sóMsgs(B.__linhasDoTelefone(c.getSnapshot(), { agora: T0 }).linhas);
  assert.deepEqual(m.map((l) => `${l.estado}:${l.recibo}`), ['fila:na fila']);
  c.libertar();
});

test('controlador: envio recusado ou partido → "Não entregue" (e tentar de novo); exceção antes do prompt → abandon()', async () => {
  const d = dshFalso({ resposta: { ok: false, error: { code: 'busy', message: 'sessão ocupada', details: null } } });
  const c = B.__criarConversaTelefone(d.ctx, 's1');
  await esperar();
  await c.enviar('olá?');
  const s = c.getSnapshot();
  assert.deepEqual(s.ecos, [], 'o DSH retira o eco falhado');
  assert.deepEqual(s.falhados.map((f) => [f.texto, f.erro]), [['olá?', 'sessão ocupada']]);
  assert.equal(s.erroEnvio, 'sessão ocupada');
  const m = sóMsgs(B.__linhasDoTelefone(s, { agora: T0 }).linhas);
  assert.equal(m[0].recibo, 'Não entregue');
  await c.reenviar(s.falhados[0].id);
  assert.equal(d.reg.prompts.length, 2, 'tentar de novo reenvia o mesmo texto');
  assert.equal(c.getSnapshot().falhados.length, 1, 'e continua "Não entregue" se voltar a falhar');
  c.libertar();

  const d2 = dshFalso({ promptLanca: new Error('falha de serialização') });
  const c2 = B.__criarConversaTelefone(d2.ctx, 's1');
  await esperar();
  await c2.enviar('x');
  assert.equal(d2.reg.abandonos, 1, 'exceção de montagem: h.abandon()');
  assert.equal(c2.getSnapshot().falhados[0].erro, 'falha de serialização');
  c2.libertar();
});

test('controlador: subagente — sem beginSubmission (o requestId seria ignorado), eco local até o prompt resolver', async () => {
  const d = dshFalso({ snapshot: { subagent: { address: { mode: 'continuable' } } } });
  const c = B.__criarConversaTelefone(d.ctx, 's1');
  await esperar();
  const promessa = c.enviar('pergunta ao subagente');
  assert.equal(d.reg.submissions.length, 0);
  assert.equal(c.getSnapshot().ecos.length, 1, 'eco local');
  await promessa;
  assert.equal(d.reg.prompts[0].requestId, undefined);
  assert.equal(c.getSnapshot().ecos.length, 0);
  c.libertar();
});

test('controlador: libertar desliga TODOS os ouvintes, aborta e só depois faz release — uma única vez', async () => {
  const d = dshFalso();
  const c = B.__criarConversaTelefone(d.ctx, 's1');
  await esperar();
  let avisos = 0;
  c.subscribe(() => { avisos += 1; });
  c.libertar();
  c.libertar();
  assert.equal(d.reg.releases, 1, 'release uma vez');
  const fim = d.reg.ordem.slice(d.reg.ordem.indexOf('unsub:sessao'));
  assert.deepEqual(fim, ['unsub:sessao', 'unsub:inbox', 'unsub:chat', 'abort', 'release']);
  assert.equal(d.fSessao.ouvintes.size + d.fChat.ouvintes.size + d.fCaixa.ouvintes.size, 0, 'nenhum ouvinte pendurado');
  assert.equal(globalThis.window.__wgTelefoneRefs, 0);
  d.mudarSessao({ running: true });
  assert.equal(avisos, 0, 'depois de libertar, nada publica');
  assert.deepEqual(await c.enviar('tarde demais'), { ok: false, motivo: 'fechada' });
  assert.equal(d.reg.prompts.length, 0);
});

test('controlador: libertar ANTES do ready não liga o alvo "chat" (nem fica nada retido)', async () => {
  const d = dshFalso();
  const c = B.__criarConversaTelefone(d.ctx, 's1');
  c.libertar();
  await esperar();
  assert.ok(!d.reg.ordem.includes('sub:chat'));
  assert.equal(d.reg.releases, 1);
});

test('controlador: id desconhecido, sem canal, abertura falhada e fallback sem uiConversation', async () => {
  const d = dshFalso({ retainLanca: new Error('unknown session "zz"') });
  const c = B.__criarConversaTelefone(d.ctx, 'zz');
  assert.equal(c.getSnapshot().fase, 'erro');
  assert.match(c.getSnapshot().erro, /unknown session/);
  c.libertar(); // inofensivo

  const semCanal = B.__criarConversaTelefone(null, 's1');
  assert.equal(semCanal.getSnapshot().fase, 'sem-canal');
  assert.deepEqual(await semCanal.enviar('x'), { ok: false, motivo: 'sem-canal' });

  const d3 = dshFalso({ snapshot: { openState: 'error', openError: { code: 'gone', message: 'história indisponível' } } });
  const c3 = B.__criarConversaTelefone(d3.ctx, 's1');
  await esperar();
  assert.equal(c3.getSnapshot().fase, 'erro', 'o ready resolve mesmo com a abertura falhada: lê-se openState');
  assert.equal(c3.getSnapshot().erro, 'história indisponível');
  c3.libertar();

  const eventos = { entries: [{ type: 'event', event: { type: 'user/message', seq: 1, time: T0, data: { id: 'm', role: 'user', content: [{ type: 'text', text: 'cru' }], source: { kind: 'user' } } } }], hasMore: false, revision: 1 };
  const d4 = dshFalso({ comUiConversation: false, eventos });
  const c4 = B.__criarConversaTelefone(d4.ctx, 's1');
  await esperar();
  assert.equal(c4.getSnapshot().fonte, 'eventos');
  assert.deepEqual(c4.getSnapshot().itens.map((i) => i.texto), ['cru']);
  c4.libertar();
  assert.ok(d4.reg.ordem.includes('unsub:eventos'));
});

test('controlador: mensagens anteriores só quando abertas, com mais história e sem pedido em curso', async () => {
  const d = dshFalso({ snapshot: { hasMore: true } });
  const c = B.__criarConversaTelefone(d.ctx, 's1');
  await esperar();
  await c.maisAntigas();
  assert.equal(d.reg.antigas, 1);
  d.mudarSessao({ loadingOlder: true });
  await c.maisAntigas();
  d.mudarSessao({ loadingOlder: false, hasMore: false });
  await c.maisAntigas();
  assert.equal(d.reg.antigas, 1, 'no-op fora de open && hasMore && !loadingOlder');
  c.libertar();
});

/* ---------- núcleo: uma referência de cada vez, sempre libertada ---------- */

function fabricaFalsa() {
  const vivas = new Map();
  const log = [];
  const fabrica = (id) => {
    log.push(`retain:${id}`);
    const c = { sessionId: id, getSnapshot: () => null, subscribe: () => () => {}, libertar() { if (vivas.delete(c)) log.push(`release:${id}`); } };
    vivas.set(c, id);
    return c;
  };
  return { fabrica, vivas, log };
}

test('núcleo: clicar noutra pessoa faz retain da nova ANTES do release da anterior; fechar liberta', () => {
  const f = fabricaFalsa();
  const n = B.__criarNucleo({ abrirConversa: f.fabrica });
  n.abrirTelefone('a');
  n.selecionar('a');
  n.abrirTelefone('a'); // mesma pessoa: nada muda
  assert.deepEqual(f.log, ['retain:a']);
  assert.equal(n.getConversa().sessionId, 'a');
  n.abrirTelefone('b');
  n.selecionar('b');
  assert.deepEqual(f.log, ['retain:a', 'retain:b', 'release:a'], 'retain da nova e só depois release da anterior');
  n.fecharTelefone();
  assert.equal(n.getConversa(), null);
  assert.equal(f.vivas.size, 0, 'fechar liberta');
  n.dispose();
});

test('núcleo: fechar a barra, desmontar o painel (parar) e o dispose (HMR) libertam o celular', () => {
  const f = fabricaFalsa();
  const n = B.__criarNucleo({ abrirConversa: f.fabrica });
  n.abrirTelefone('a');
  n.selecionar('a');
  n.selecionar(null);
  assert.equal(n.getTelefone().aberto, false);
  assert.equal(f.vivas.size, 0, 'fechar a barra lateral fecha o celular');
  n.abrirTelefone('a');
  n.selecionar('a');
  n.parar();
  assert.equal(f.vivas.size, 0, 'o painel desmontou: nada fica retido em fundo');
  assert.equal(n.getTelefone().aberto, false);
  n.abrirTelefone('b');
  n.dispose();
  assert.equal(f.vivas.size, 0, 'HMR/descarregamento: libertado');
  assert.deepEqual(f.log.filter((x) => x.startsWith('retain')).length, f.log.filter((x) => x.startsWith('release')).length);
});

// Pessoa mínima para o modelo da barra lateral.
const pessoaSimples = (id) => ({
  id, name: 'Rui', avatar: 'rui', status: 'idle', ctx: null, model: null, cost: null, speed: null,
  question: null, title: 'Conversa', activity: [], subagents: 0,
});

test('núcleo: a Atividade recebe o histórico da conversa aberta — e guarda-o ao fechar o celular', async () => {
  const nos = [
    utilizador('u1', 'corre os testes', T0, 'rq-0'),
    ferramentaAssente('c1', 'bash', { command: 'npm test' }, T0 + 1000),
    assistente('1:1', [{ kind: 'text', text: 'Todos verdes.' }], T0 + 2000),
  ];
  const d = dshFalso({ nos });
  const n = B.__criarNucleo({ abrirConversa: (id) => B.__criarConversaTelefone(d.ctx, id) });
  let avisos = 0;
  const soltar = n.subscribe(() => { avisos += 1; });
  n.abrirTelefone('s1');
  n.selecionar('s1');
  await esperar();
  assert.deepEqual(n.getHistorico('s1').map((x) => x.texto), ['Pediu: corre os testes', 'Usou bash · npm test', 'Respondeu: Todos verdes.']);
  // A barra lateral intercala-o com os eventos ao vivo, mais recente primeiro.
  const p = { ...pessoaSimples('s1'), activity: [{ at: T0 + 1500, tipo: 'trabalho-inicio', texto: 'Começou a trabalhar' }] };
  const m = B.__modeloSidebar(p, { historico: n.getHistorico('s1'), agora: T0 + 9000 });
  assert.deepEqual(m.atividade.map((a) => [a.texto, a.icone, a.origem]), [
    ['Respondeu: Todos verdes.', 'check', 'conversa'],
    ['Começou a trabalhar', 'play', 'ao-vivo'],
    ['Usou bash · npm test', 'code', 'conversa'],
    ['Pediu: corre os testes', 'file', 'conversa'],
  ]);
  assert.match(m.atividade[0].hora, /^\d{2}:\d{2}:\d{2}$/, 'hoje: a hora');
  const ontem = B.__modeloSidebar(p, { historico: n.getHistorico('s1'), agora: T0 + 86400000 });
  assert.match(ontem.atividade[0].hora, /^Ontem \d{2}:\d{2}$/, 'outro dia: o dia e a hora');
  // Streaming: a resposta a transmitir não mexe no histórico — a sala não se redesenha a cada pedaço.
  const antes = avisos;
  d.mudarChat([...nos, assistente('2:1', [{ kind: 'text', text: 'A pen' }], T0 + 3000, 'running')]);
  d.mudarChat([...nos, assistente('2:1', [{ kind: 'text', text: 'A pensar em' }], T0 + 3000, 'running')]);
  assert.equal(avisos, antes, 'nenhuma notificação do núcleo durante o streaming');
  d.mudarChat([...nos, assistente('2:1', [{ kind: 'text', text: 'Feito.' }], T0 + 3000)]);
  assert.equal(avisos, antes + 1, 'a resposta assentou: uma notificação');
  assert.equal(n.getHistorico('s1').length, 4);
  // Fechar o celular liberta a sessão, mas a Atividade continua cheia.
  n.fecharTelefone();
  assert.equal(d.reg.releases, 1);
  assert.equal(n.getHistorico('s1').length, 4, 'fechar o celular não apaga o histórico da pessoa selecionada');
  n.selecionar('outra');
  assert.equal(n.getHistorico('s1'), null, 'outra pessoa: histórico dela, não o anterior');
  soltar();
  n.dispose();
});

test('controlador inerte (id desconhecido, sem canal): snapshot.inerte — o celular desativa a caixa em vez de engolir o texto', async () => {
  const d = dshFalso({ retainLanca: new Error('sessions.retain: unknown session') });
  const c = B.__criarConversaTelefone(d.ctx, 'zz');
  assert.equal(c.getSnapshot().inerte, true);
  assert.equal(B.__criarConversaTelefone(null, 's1').getSnapshot().inerte, true);
  const vivo = B.__criarConversaTelefone(dshFalso().ctx, 's1');
  await esperar();
  assert.equal(vivo.getSnapshot().inerte, undefined, 'uma conversa viva não é inerte');
  vivo.libertar();
  const comp = BUNDLE.slice(BUNDLE.indexOf('function TelefoneConversa('), BUNDLE.indexOf('const TelefoneMemo'));
  assert.match(comp, /const podeEscrever = [^;]*!conv\.inerte/, 'a caixa e o botão desativam-se');
});

test('núcleo: reabrir o painel não ressuscita conversas apagadas no DSH (catálogo relido em cada arranque)', () => {
  let snap = { phase: 'ready', ids: ['a', 'b'], byId: { a: { id: 'a', displayTitle: 'A' }, b: { id: 'b', displayTitle: 'B' } } };
  const ouvintes = new Set();
  const list = { getSnapshot: () => snap, subscribe: (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); } };
  let nucleo = null;
  const antes = { document: globalThis.document };
  globalThis.document = { querySelector: () => null, createElement: () => ({ setAttribute() {} }), head: { append() {} } };
  try {
    B.apply({
      sessions: { list, retain: () => { throw new Error('sessions.retain: unknown session'); } },
      get: () => undefined,
      effect: () => {},
      slots: { inject: (_s, fn) => fn(), register: (o) => { if (o.name === 'main') nucleo = o.inject(); return () => {}; } },
    });
    const pessoas = () => Object.keys(nucleo.getView().people).sort().join(',');
    let desliga = nucleo.subscribe(() => {});
    nucleo.iniciar();
    assert.equal(pessoas(), 'a,b');
    snap = { phase: 'ready', ids: ['a'], byId: { a: { id: 'a', displayTitle: 'A' } } }; // 'b' apagada no DSH
    for (const fn of ouvintes) fn();
    assert.equal(pessoas(), 'a');
    desliga(); nucleo.parar(); // outro painel do DSH
    desliga = nucleo.subscribe(() => {});
    nucleo.iniciar(); // de volta ao Modo jogo
    assert.equal(pessoas(), 'a', 'nada de "fantasmas"');
    desliga(); nucleo.parar();
    snap = { phase: 'ready', ids: [], byId: {} }; // apagada com o painel fechado
    desliga = nucleo.subscribe(() => {});
    nucleo.iniciar();
    assert.equal(pessoas(), '', 'a ponte emite session/removed do que sumiu entretanto');
    desliga();
    nucleo.dispose();
  } finally {
    globalThis.document = antes.document;
  }
});

/* ---------- segurança e aparência ---------- */

test('segurança: o texto das mensagens nunca passa por innerHTML (só nós de texto React)', () => {
  const inicio = BUNDLE.indexOf('function TelefoneConversa(');
  const fim = BUNDLE.indexOf('\n    }\n', inicio);
  const componente = BUNDLE.slice(inicio, fim);
  assert.ok(inicio > 0 && componente.length > 1000);
  const usos = [...componente.matchAll(/dangerouslySetInnerHTML: \{\s*__html: ([^\n]+)/g)].map((m) => m[1]);
  assert.equal(usos.length, 1, 'um único innerHTML no celular');
  assert.match(usos[0], /<svg viewBox="0 0 264 280"[^`]*<use href="#\$\{idSimbolo\(/, 'e é o <use> do avatar (id gerado pelo plugin)');
  const seccao = BUNDLE.slice(BUNDLE.indexOf('4b. Celular'), BUNDLE.indexOf('5. Componentes React'));
  assert.ok(!/innerHTML/.test(seccao.replace(/nunca por innerHTML\/dangerouslySetInnerHTML/g, '')), 'a parte pura e o controlador não produzem HTML');
});

test('aparência: iPhone + iMessage (#0B84FE / #E9E9EB, 18px, cauda, Dynamic Island) à esquerda da barra lateral', () => {
  const css = B.__CSS_PAINEL;
  for (const regra of [
    '.wg-palco{flex:1;min-width:0;position:relative;display:flex;z-index:1}',
    '.wg-tel-eu .wg-tel-bolha{background:#0b84fe;color:#fff}',
    '.wg-tel-ele .wg-tel-bolha{background:#e9e9eb;color:#000}',
    '.wg-tel-eu.wg-tel-cauda .wg-tel-bolha::before{right:-7px;width:20px;background:#0b84fe;',
    '.wg-tel-ele.wg-tel-cauda .wg-tel-bolha::before{left:-7px;width:20px;background:#e9e9eb;',
    '.wg-tel-ilha{position:absolute;',
    'border-radius:46px;',
    'aspect-ratio:390/844;',
    'white-space:pre-wrap',
    '@keyframes wg-tel-entrar',
  ]) assert.ok(css.includes(regra), regra);
  assert.match(css, /\.wg-tel-bolha\{[^}]*border-radius:18px/);
  assert.match(css, /\.wg-telefone\{position:absolute;top:14px;right:18px;/, 'dentro do palco da sala: nunca cobre a barra lateral');
  assert.match(css, /corner-shape:round/, 'círculos redondos mesmo com o superellipse global do DSH');
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.wg-telefone\{animation:none\}/);
  assert.ok(BUNDLE.includes("placeholder: 'iMessage'"), 'o campo diz "iMessage", como o iMessage em português');
  assert.ok(BUNDLE.includes("'aria-label': `Mensagem para ${nome}`"), 'nome acessível em português');
  assert.ok(!/placeholder: '(?:Text )?Message'/.test(BUNDLE), 'nada de "Message" em inglês');
  // Safari/WebKit: com foco automático, o cursor largo tapava o "i" ("|Message").
  // Abrir o celular não rouba o foco (só o clique na cápsula o dá) e o
  // placeholder afasta-se 3 px do cursor — o texto escrito não anda.
  assert.ok(!/campoRef\.current;\s*if \(c && !c\.disabled\) \{ try \{ c\.focus/.test(BUNDLE), 'sem foco automático ao abrir o celular');
  assert.ok(css.includes('.wg-tel-campo textarea::placeholder{color:#b4b4b9;text-indent:3px}'));
  assert.match(css, /\.wg-tel-campo textarea\{[^}]*padding:6px 36px 6px 12px;/, 'a caixa e a cápsula não mudam');
  assert.match(BUNDLE, /className: 'wg-tel-campo',\s*\/\/[^\n]*\n\s*onClick: \(e\) => \{/, 'clicar em qualquer ponto da cápsula dá o foco à caixa');
  assert.ok(BUNDLE.includes("'Escritório')"), '"‹ Escritório" no cabeçalho');
  assert.deepEqual(B.inject, ['slots', 'layout', 'sessions'], 'o uiConversation lê-se com ctx.get — nunca no inject');
});
