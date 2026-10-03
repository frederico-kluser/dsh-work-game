/*
 * tests/plugin/voz.test.mjs — VOZ E TRANSCRIÇÃO (dsh-plugin/src/voz.js).
 *
 * O módulo PURO/INJETÁVEL do botão de microfone do celular: matemática do
 * nível (RMS → dBFS → envelope → altura das barras), gravador
 * (getUserMedia + MediaRecorder + AnalyserNode), transcrição na OpenAI
 * (multipart, cadeia de modelos, erros tipados) e a configuração guardada
 * no navegador (chave da API + idioma).
 *
 * Tudo aqui é Node puro: a plataforma ENTRA POR INJEÇÃO (fetch, FormData,
 * getUserMedia, MediaRecorder, AudioContext, agora) — o módulo não chama
 * Date.now nem Math.random (também imposto aqui).
 *
 * Executar: node --test tests/plugin/voz.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VOZ_MODELOS, VOZ_LIMITE_BYTES, VOZ_DURACAO_MAX_MS, VOZ_URL_TRANSCRICAO, CHAVE_CONFIG,
  escolherMimeType, rmsParaDb, suavizarDb, dbParaAltura,
  criarGravadorVoz, transcreverAudio,
  lerConfig, guardarConfig, limparConfig, mascararChave,
} from '../../dsh-plugin/src/voz.js';

const FONTE = readFileSync(new URL('../../dsh-plugin/src/voz.js', import.meta.url), 'utf8');
const BUNDLE = readFileSync(new URL('../../dsh-plugin/src/client.js', import.meta.url), 'utf8');
const SEM_EXPORTS = FONTE.split('\n')
  .map((l) => l.replace(/^export (const|function|let|async function) /, '$1 '))
  .join('\n');

/* ------------------------------------------------------------------ */
/* Paridade e autocontenção                                            */
/* ------------------------------------------------------------------ */

test('paridade: client.js embute voz.js tal-e-qual (sem export)', () => {
  assert.ok(BUNDLE.includes(SEM_EXPORTS),
    'client.js embute voz.js tal-e-qual — regenerar: python3 scripts/embutir-voz.py --embutir --alvo client');
  assert.equal((BUNDLE.match(/=== INÍCIO voz\.js embutido ===/g) || []).length, 1, 'client.js: um INÍCIO');
  assert.equal((BUNDLE.match(/=== FIM voz\.js embutido ===/g) || []).length, 1, 'client.js: um FIM');
});

test('voz.js é autocontido: sem relógio nem sorteio próprios (tudo por injeção)', () => {
  assert.ok(!/Date\.now\(/.test(FONTE), 'sem Date.now — o relógio entra por `agora`');
  assert.ok(!/Math\.random\(/.test(FONTE), 'sem Math.random');
  assert.ok(!/\bimport\b/.test(FONTE.replace(/\/\*[\s\S]*?\*\//g, '')), 'sem imports de irmãos');
});

test('constantes: modelos, limite de 25 MB, 2 minutos e a chave do storage', () => {
  assert.deepEqual(VOZ_MODELOS, ['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1']);
  assert.equal(VOZ_LIMITE_BYTES, 25 * 1024 * 1024);
  assert.equal(VOZ_DURACAO_MAX_MS, 2 * 60 * 1000);
  assert.equal(CHAVE_CONFIG, 'dsh-work-game:config');
  assert.equal(VOZ_URL_TRANSCRICAO, 'https://api.openai.com/v1/audio/transcriptions');
});

/* ------------------------------------------------------------------ */
/* Tipo de ficheiro gravado                                            */
/* ------------------------------------------------------------------ */

test('escolherMimeType: ordem opus → webm → mp4 → default, tolerando isTypeSupported mentiroso', () => {
  assert.equal(escolherMimeType((t) => t !== 'nada'), 'audio/webm;codecs=opus', 'opus é a primeira escolha');
  assert.equal(escolherMimeType((t) => t === 'audio/webm' || t === 'audio/mp4'), 'audio/webm');
  assert.equal(escolherMimeType((t) => t === 'audio/mp4'), 'audio/mp4', 'Safari/iOS');
  assert.equal(escolherMimeType(() => false), '', 'nada suportado: deixa o browser escolher');
  assert.equal(escolherMimeType(undefined), '', 'sem isTypeSupported: default');
  // iOS pode ATIRAR em isTypeSupported: cada candidato vai em try/catch e
  // um candidato que rebenta passa a vez ao seguinte.
  assert.equal(escolherMimeType((t) => {
    if (t === 'audio/webm;codecs=opus') throw new Error('iOS a mentir');
    return t === 'audio/mp4';
  }), 'audio/mp4');
  assert.equal(escolherMimeType(() => { throw new Error('tudo rebenta'); }), '', 'se rebentar tudo: default');
});

/* ------------------------------------------------------------------ */
/* Matemática do nível                                                 */
/* ------------------------------------------------------------------ */

test('rmsParaDb: dBFS com piso a -100 (o silêncio digital não é -∞)', () => {
  assert.ok(Math.abs(rmsParaDb(1) - 0) < 1e-9, 'rms 1 = 0 dBFS');
  assert.ok(Math.abs(rmsParaDb(0.1) - -20) < 1e-9, 'rms 0.1 = -20 dBFS');
  assert.ok(Math.abs(rmsParaDb(0.01) - -40) < 1e-9, 'rms 0.01 = -40 dBFS');
  assert.equal(rmsParaDb(0), -100, 'silêncio: no piso');
  assert.equal(rmsParaDb(1e-9), -100, 'abaixo do piso: no piso');
  assert.equal(rmsParaDb(-3), -100, 'rms negativo (impossível) trata-se como 0');
});

test('suavizarDb: ataque rápido (20 ms), queda lenta (250 ms), independente do dt', () => {
  // Ataque: de -100 para 0 com dt = tau (20 ms) → 1-exp(-1) ≈ 0,632 do caminho.
  const a = suavizarDb(-100, 0, 20, undefined);
  assert.ok(Math.abs(a - (-100 + 100 * (1 - Math.exp(-1)))) < 1e-9, `ataque: ${a}`);
  // Queda: de 0 para -100 com dt = 20 ms → só 1-exp(-20/250) ≈ 0,077 do caminho.
  const q = suavizarDb(0, -100, 20, undefined);
  assert.ok(Math.abs(q - (0 - 100 * (1 - Math.exp(-20 / 250)))) < 1e-9, `queda: ${q}`);
  assert.ok(Math.abs(q) < Math.abs(a), 'a queda é muito mais lenta que o ataque');
  // Metade de tau duas vezes seguidas dá o mesmo que tau inteiro.
  const dois = suavizarDb(suavizarDb(-100, 0, 10, undefined), 0, 10, undefined);
  assert.ok(Math.abs(dois - a) < 1e-9, 'dt composto ≈ dt total');
  // Igual não anda; sem tempo (dt ≤ 0) aceita-se a amostra.
  assert.equal(suavizarDb(-30, -30, 100, undefined), -30);
  assert.equal(suavizarDb(-30, -10, 0, undefined), -10);
  assert.equal(suavizarDb(-30, -10, -5, undefined), -10);
  // Opções: quem quiser outros tempos tem-nos (e tau inválido cai no padrão).
  assert.ok(Math.abs(suavizarDb(-100, 0, 20, { ataqueMs: 20, quedaMs: 20 }) - a) < 1e-9);
  assert.ok(Math.abs(suavizarDb(-100, 0, 20, { ataqueMs: 0 }) - a) < 1e-9, 'tau inválido (0) não rebenta: usa o padrão');
  assert.ok(Math.abs(suavizarDb(-100, 0, 20, { ataqueMs: 'x' }) - a) < 1e-9, 'tau não numérico: idem');
});

test('dbParaAltura: janela [-60, 0] com gama 0.6, sempre em [0, 1]', () => {
  assert.equal(dbParaAltura(-60), 0, 'limite inferior: sem altura');
  assert.equal(dbParaAltura(0), 1, 'limite superior: altura toda');
  assert.equal(dbParaAltura(-100), 0, 'abaixo do mínimo: 0');
  assert.equal(dbParaAltura(6), 1, 'acima do máximo: 1');
  const meio = dbParaAltura(-30);
  assert.ok(Math.abs(meio - Math.pow(0.5, 0.6)) < 1e-9, `gama 0.6 no meio: ${meio}`);
  assert.ok(meio > 0.5, 'a gama < 1 deixa o grave do silêncio não esconder a fala');
  assert.equal(dbParaAltura(-30, { minDb: -60, maxDb: 0, gama: 1 }), 0.5, 'gama 1: linear');
  assert.equal(dbParaAltura(-20, { minDb: -40, maxDb: 0, gama: 1 }), 0.5, 'janela própria');
  for (const db of [-1000, -60, -17.3, 0, 1000]) {
    const v = dbParaAltura(db);
    assert.ok(v >= 0 && v <= 1, `altura de ${db} em [0,1]`);
  }
});

/* ------------------------------------------------------------------ */
/* Transcrição (fetch/FormData injetados)                              */
/* ------------------------------------------------------------------ */

class FormDataFalso {
  constructor() { this.campos = []; }
  append(nome, valor, ficheiro) { this.campos.push({ nome, valor, ficheiro }); }
}

const blobFalso = (type, size = 3) => ({ type, size });

function fetchQue(...respostas) {
  const chamadas = [];
  let i = 0;
  const f = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    const r = respostas[Math.min(i, respostas.length - 1)];
    i += 1;
    if (typeof r === 'function') return r();
    if (r instanceof Error) throw r;
    return {
      ok: r.ok ?? (r.status >= 200 && r.status < 300),
      status: r.status,
      json: async () => {
        if (r.body instanceof Error) throw r.body;
        return r.body;
      },
    };
  };
  f.chamadas = chamadas;
  return f;
}

test('transcreverAudio: multipart file+model[+language], SÓ Authorization (nunca Content-Type)', async () => {
  const blob = blobFalso('audio/webm;codecs=opus');
  const fetch = fetchQue({ status: 200, body: { text: 'olá mundo', usage: { type: 'duration', seconds: 1.5 } } });
  const r = await transcreverAudio(blob, {
    chave: 'sk-teste', idioma: 'pt', fetch, FormData: FormDataFalso,
  });
  assert.deepEqual(r, { text: 'olá mundo', modeloUsado: 'gpt-transcribe', usage: { type: 'duration', seconds: 1.5 } });
  const { url, opcoes } = fetch.chamadas[0];
  assert.equal(url, VOZ_URL_TRANSCRICAO);
  assert.equal(opcoes.method, 'POST');
  assert.deepEqual(opcoes.headers, { Authorization: 'Bearer sk-teste' }, 'um só cabeçalho');
  assert.ok(!('Content-Type' in opcoes.headers), 'o Content-Type é do browser (boundary do multipart)');
  const campos = opcoes.body.campos;
  assert.deepEqual(campos.map((c) => c.nome), ['file', 'model', 'language']);
  assert.equal(campos[0].valor, blob, 'o blob vai tal e qual');
  assert.equal(campos[0].ficheiro, 'gravacao.webm', 'nome do ficheiro pela extensão do mime');
  assert.equal(campos[1].valor, 'gpt-transcribe');
  assert.equal(campos[2].valor, 'pt');
  // Sem idioma (ou 'auto'): o campo language NÃO vai — a API deteta sozinha.
  const f2 = fetchQue({ status: 200, body: { text: 'hi' } });
  await transcreverAudio(blobFalso('audio/mp4'), { chave: 'sk-t', idioma: 'auto', fetch: f2, FormData: FormDataFalso });
  assert.deepEqual(f2.chamadas[0].opcoes.body.campos.map((c) => c.nome), ['file', 'model']);
  assert.equal(f2.chamadas[0].opcoes.body.campos[0].ficheiro, 'gravacao.m4a', 'extensão pelo mime (mp4 → m4a)');
});

test('transcreverAudio: cadeia de modelos SÓ quando a API diz que o modelo não existe', async () => {
  const naoExiste = { status: 400, body: { error: { message: 'The model `gpt-transcribe` does not exist or you do not have access to it.' } } };
  const ok = { status: 200, body: { text: 'feito', usage: null } };
  const fetch = fetchQue(naoExiste, ok);
  const r = await transcreverAudio(blobFalso('audio/webm'), { chave: 'sk-t', fetch, FormData: FormDataFalso });
  assert.equal(r.modeloUsado, 'gpt-4o-transcribe', 'anda para o seguinte da cadeia');
  assert.equal(r.text, 'feito');
  assert.deepEqual(fetch.chamadas.map((c) => c.opcoes.body.campos.find((x) => x.nome === 'model').valor),
    ['gpt-transcribe', 'gpt-4o-transcribe']);
  // O pedido começa onde se pede: a partir de whisper-1 não há mais ninguém.
  const f2 = fetchQue(ok);
  const r2 = await transcreverAudio(blobFalso('audio/webm'), { chave: 'sk-t', modelo: 'whisper-1', fetch: f2, FormData: FormDataFalso });
  assert.equal(r2.modeloUsado, 'whisper-1');
  assert.equal(f2.chamadas.length, 1);
  // Modelo fora da lista: tenta-se ele e depois a cadeia inteira.
  const f3 = fetchQue(naoExiste, naoExiste, ok);
  const r3 = await transcreverAudio(blobFalso('audio/webm'), { chave: 'sk-t', modelo: 'gpt-voz-9000', fetch: f3, FormData: FormDataFalso });
  assert.equal(r3.modeloUsado, 'gpt-4o-transcribe', 'dois modelos não existem: fica no terceiro');
  assert.deepEqual(f3.chamadas.map((c) => c.opcoes.body.campos.find((x) => x.nome === 'model').valor),
    ['gpt-voz-9000', 'gpt-transcribe', 'gpt-4o-transcribe']);
  // A cadeia toda sem sucesso: o ÚLTIMO erro da API é o que se vê.
  const f4 = fetchQue(naoExiste);
  await assert.rejects(
    () => transcreverAudio(blobFalso('audio/webm'), { chave: 'sk-t', fetch: f4, FormData: FormDataFalso }),
    (e) => e.codigo === 'api' && /does not exist/.test(e.mensagem) && f4.chamadas.length === VOZ_MODELOS.length,
  );
  // O caso REAL visto ao vivo (2026-10-03): 404 com error.code
  // 'model_not_found' — não 400 — e também tem de andar na cadeia.
  const naoExiste404 = {
    status: 404,
    body: { error: { message: 'The model `x` does not exist or you do not have access to it.', code: 'model_not_found', type: 'invalid_request_error' } },
  };
  const f6 = fetchQue(naoExiste404, ok);
  const r6 = await transcreverAudio(blobFalso('audio/webm'), { chave: 'sk-t', fetch: f6, FormData: FormDataFalso });
  assert.equal(r6.modeloUsado, 'gpt-4o-transcribe', '404 model_not_found anda para o seguinte');
  // Um 400 que NÃO é de modelo não anda na cadeia.
  const f5 = fetchQue({ status: 400, body: { error: { message: 'Invalid file format.' } } });
  await assert.rejects(
    () => transcreverAudio(blobFalso('audio/webm'), { chave: 'sk-t', fetch: f5, FormData: FormDataFalso }),
    (e) => e.codigo === 'api' && /Invalid file format/.test(e.mensagem) && f5.chamadas.length === 1,
  );
});

test('transcreverAudio: erros tipados — 401 chave-invalida · 402/429 limite · 413 audio-grande · rede · api', async () => {
  const caso = async (resposta, codigo, trecho) => {
    const fetch = fetchQue(resposta);
    await assert.rejects(
      () => transcreverAudio(blobFalso('audio/webm'), { chave: 'sk-t', fetch, FormData: FormDataFalso }),
      (e) => {
        assert.equal(e.codigo, codigo);
        if (trecho) assert.ok(e.mensagem.includes(trecho), `mensagem: ${e.mensagem}`);
        return true;
      },
    );
  };
  await caso({ status: 401, body: { error: { message: 'Incorrect API key provided: sk-****. You can find your API key at https://platform.openai.com.' } } },
    'chave-invalida', 'Incorrect API key provided');
  await caso({ status: 402, body: { error: { message: 'You exceeded your current quota.' } } }, 'limite', 'current quota');
  await caso({ status: 429, body: { error: { message: 'Rate limit reached.' } } }, 'limite', 'Rate limit');
  await caso({ status: 413, body: { error: { message: 'Request too large.' } } }, 'audio-grande', 'Request too large');
  await caso({ status: 500, body: { error: { message: 'The server had an error.' } } }, 'api', 'server had an error');
  await caso(new TypeError('fetch failed'), 'rede', 'fetch failed');
  // Sem chave: nem se fala com a rede.
  const f = fetchQue();
  await assert.rejects(
    () => transcreverAudio(blobFalso('audio/webm'), { chave: '  ', fetch: f, FormData: FormDataFalso }),
    (e) => e.codigo === 'sem-chave' && f.chamadas.length === 0,
  );
  // Acima de 25 MB: recusa-se ANTES de qualquer upload.
  const f2 = fetchQue();
  await assert.rejects(
    () => transcreverAudio({ type: 'audio/webm', size: VOZ_LIMITE_BYTES + 1 }, { chave: 'sk-t', fetch: f2, FormData: FormDataFalso }),
    (e) => e.codigo === 'audio-grande' && f2.chamadas.length === 0,
  );
});

/* ------------------------------------------------------------------ */
/* Configuração (localStorage)                                         */
/* ------------------------------------------------------------------ */

test('config: ler/guardar/limpar com storage falso, normalizando e sem rebentar', () => {
  const dados = new Map();
  const storage = {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
  };
  assert.deepEqual(lerConfig(storage), { chaveOpenAI: '', idioma: 'auto' }, 'nada guardado: padrão');
  assert.equal(guardarConfig(storage, { chaveOpenAI: '  sk-abc1234  ', idioma: 'pt' }), true);
  assert.deepEqual(lerConfig(storage), { chaveOpenAI: 'sk-abc1234', idioma: 'pt' }, 'volta igual, sem espaços');
  assert.equal(dados.get(CHAVE_CONFIG), JSON.stringify({ chaveOpenAI: 'sk-abc1234', idioma: 'pt' }));
  // Campos desconhecidos e tipos errados caem no padrão (como normalizarFiltros).
  dados.set(CHAVE_CONFIG, JSON.stringify({ chaveOpenAI: 7, idioma: 'klingon', lixo: 1 }));
  assert.deepEqual(lerConfig(storage), { chaveOpenAI: '', idioma: 'auto' });
  dados.set(CHAVE_CONFIG, '{isto não é json');
  assert.deepEqual(lerConfig(storage), { chaveOpenAI: '', idioma: 'auto' }, 'JSON estragado: padrão, sem rebentar');
  guardarConfig(storage, { chaveOpenAI: 'sk-x9999', idioma: 'en' });
  assert.equal(limparConfig(storage), true);
  assert.deepEqual(lerConfig(storage), { chaveOpenAI: '', idioma: 'auto' }, 'limpar remove a chave');
  // Storage de modo privado (tudo rebenta): gracioso, nunca lança.
  const privado = {
    getItem: () => { throw new Error('bloqueado'); },
    setItem: () => { throw new Error('bloqueado'); },
    removeItem: () => { throw new Error('bloqueado'); },
  };
  assert.deepEqual(lerConfig(privado), { chaveOpenAI: '', idioma: 'auto' });
  assert.equal(guardarConfig(privado, { chaveOpenAI: 'sk-x' }), false);
  assert.equal(limparConfig(privado), false);
  assert.deepEqual(lerConfig(null), { chaveOpenAI: '', idioma: 'auto' }, 'sem storage: padrão');
  assert.equal(guardarConfig(null, {}), false);
});

test('config: mascararChave mostra só o prefixo e os 4 últimos — nunca a chave', () => {
  assert.equal(mascararChave('sk-proj-1234abcd'), 'sk-…abcd');
  assert.equal(mascararChave('sk-1234'), 'sk-…1234');
  assert.equal(mascararChave('abcd'), '…', 'curta demais para mostrar nada');
  assert.equal(mascararChave(''), '');
  assert.equal(mascararChave(undefined), '');
  const chave = 'sk-proj-segredo-total-98765';
  const m = mascararChave(chave);
  assert.ok(!m.includes('segredo'), 'o meio da chave nunca aparece');
  assert.ok(m.endsWith(chave.slice(-4)) && m.startsWith(chave.slice(0, 3)));
});

/* ------------------------------------------------------------------ */
/* Gravador (plataforma falsa injetada)                                */
/* ------------------------------------------------------------------ */

/* Fabrica um gravador falso: stream com tracks contáveis, MediaRecorder que
 * emite pedaços e 'stop', AudioContext com analisador de amplitude fixa. */
function plataformaFalsa({ tipos = [], amplitude = 0.5, mimeDoRecorder } = {}) {
  const estado = {
    tracks: 0, parouStream: 0, fechouCtx: 0, timeslice: null,
    pedacos: [], rec: null, ctx: null,
  };
  const stream = {
    getTracks: () => [{ stop: () => { estado.parouStream += 1; } }, { stop: () => { estado.parouStream += 1; } }],
  };
  const getUserMedia = async (requisicao) => {
    estado.requisicao = requisicao;
    return stream;
  };
  class MediaRecorderFalso {
    static isTypeSupported(t) { return tipos.includes(t); }

    constructor(_stream, opcoes) {
      estado.rec = this;
      this.mimeType = mimeDoRecorder ?? (opcoes && opcoes.mimeType) ?? 'audio/webm';
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
    }

    start(timeslice) {
      estado.timeslice = timeslice;
      this.state = 'recording';
    }

    stop() {
      this.state = 'inactive';
      // Comportamento do browser: um último 'dataavailable' e depois 'stop'.
      const pedaco = new Blob(['abc'], { type: this.mimeType });
      estado.pedacos.push(pedaco);
      if (this.ondataavailable) this.ondataavailable({ data: pedaco });
      if (this.onstop) this.onstop();
    }
  }
  class AudioContextFalso {
    constructor() { estado.ctx = this; }

    createMediaStreamSource() { return { connect() {} }; }

    createAnalyser() {
      return {
        fftSize: 2048,
        getFloatTimeDomainData(buf) { buf.fill(amplitude); },
      };
    }

    close() { estado.fechouCtx += 1; }
  }
  return { estado, getUserMedia, MediaRecorder: MediaRecorderFalso, AudioContext: AudioContextFalso };
}

const dormir = (ms) => new Promise((res) => setTimeout(res, ms));

test('gravador: pedaços → blob com o mimeType do recorder, tracks e contexto SEMPRE mortos', async () => {
  const p = plataformaFalsa({ tipos: ['audio/mp4'], mimeDoRecorder: 'audio/mp4' });
  const g = await criarGravadorVoz({ ...p, agora: () => 0 });
  assert.deepEqual(p.estado.requisicao, { audio: true }, 'pede o microfone');
  assert.equal(p.estado.timeslice, 1000, 'timeslice de 1 s (nada se perde se fechar)');
  assert.equal(p.estado.rec.mimeType, 'audio/mp4', 'o tipo escolhido é o primeiro suportado');
  const blob = await g.parar();
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'audio/mp4', 'blob com o mimeType do recorder');
  assert.equal(blob.size, 3, 'os pedaços juntam-se');
  assert.equal(p.estado.parouStream, 2, 'todos os tracks parados (parar)');
  assert.equal(p.estado.fechouCtx, 1, 'AudioContext fechado (parar)');
  assert.equal(g.duracaoMs(), 0, 'sem relógio injetado: duração 0');
  assert.equal(await g.parar(), blob, 'parar duas vezes devolve o mesmo blob');
  assert.equal(p.estado.parouStream, 2, 'sem efeitos duplos');
});

test('gravador: cancelar() descarta o áudio (blob vazio) e liberta TUDO', async () => {
  const p = plataformaFalsa({});
  const g = await criarGravadorVoz({ ...p, agora: () => 0 });
  g.cancelar();
  const blob = await g.parar();
  assert.equal(blob.size, 0, 'cancelar não devolve áudio');
  assert.equal(p.estado.parouStream, 2, 'tracks parados (cancelar)');
  assert.equal(p.estado.fechouCtx, 1, 'AudioContext fechado (cancelar)');
});

test('gravador: assinarNivel recebe níveis SUAVIZADOS em [0, 1] e desinscreve', async () => {
  const p = plataformaFalsa({ amplitude: 0.5 }); // rms 0.5 → ~-6 dBFS
  let t = 0;
  const niveis = [];
  const g = await criarGravadorVoz({ ...p, agora: () => t });
  const soltar = g.assinarNivel((nivel, detalhe) => {
    niveis.push(nivel);
    assert.ok(detalhe.db <= 0, 'o detalhe traz o dBFS');
    assert.ok(detalhe.duracaoMs >= 0, 'e a duração da gravação');
  });
  t = 50; await dormir(180);
  t = 150; await dormir(180);
  soltar();
  const antes = niveis.length;
  t = 250; await dormir(150);
  assert.equal(niveis.length, antes, 'desinscrito: já não chegam níveis');
  assert.ok(niveis.length >= 2, `~10 amostras/s (${niveis.length})`);
  for (const n of niveis) assert.ok(n > 0 && n <= 1, `nível em [0,1]: ${n}`);
  for (let i = 1; i < niveis.length; i += 1) {
    assert.ok(niveis[i] >= niveis[i - 1] - 1e-9, 'do silêncio para a fala: o envelope sobe');
  }
  const esperado = dbParaAltura(rmsParaDb(0.5));
  assert.ok(Math.abs(niveis[niveis.length - 1] - esperado) < 0.1,
    `converge para o nível da fala (${niveis[niveis.length - 1].toFixed(3)} ≈ ${esperado.toFixed(3)})`);
  await g.parar();
});

test('gravador: auto-stop aos 2 minutos (relógio injetado) — parar() devolve o blob', async () => {
  const p = plataformaFalsa({});
  let t = 0;
  const g = await criarGravadorVoz({ ...p, agora: () => t });
  assert.equal(g.duracaoMs(), 0);
  t = VOZ_DURACAO_MAX_MS + 1; // o relógio salta para além do limite
  await dormir(180); // a amostragem vê o limite e PARA sozinha
  assert.equal(p.estado.rec.state, 'inactive', 'auto-stop: o recorder parou sozinho');
  assert.equal(p.estado.parouStream, 2, 'tracks mortos no auto-stop');
  const blob = await g.parar(); // quem chegar depois recebe o mesmo blob
  assert.ok(blob.size > 0, 'o áudio gravado até ao limite chega ao fim');
  assert.equal(g.duracaoMs(), VOZ_DURACAO_MAX_MS + 1);
});

test('gravador: sem MediaRecorder ou sem microfone → erro tipado de microfone', async () => {
  await assert.rejects(
    () => criarGravadorVoz({ getUserMedia: undefined, MediaRecorder: class {}, AudioContext: class {} }),
    (e) => e.codigo === 'microfone',
  );
  await assert.rejects(
    () => criarGravadorVoz({
      getUserMedia: async () => { throw new Error('Permission denied'); },
      MediaRecorder: class {}, AudioContext: class {},
    }),
    (e) => e.codigo === 'microfone' && /Permission denied/.test(e.mensagem),
  );
});
