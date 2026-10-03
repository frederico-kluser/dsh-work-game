/*
 * dsh-plugin/src/voz.js — VOZ E TRANSCRIÇÃO (FONTE).
 *
 * O botão de microfone do celular grava a mensagem de voz, mostra o nível
 * enquanto se fala e transcreve-a (OpenAI speech-to-text) para a caixa de
 * mensagem — para REVER e enviar. A chave da API vive nas Definições do
 * telemóvel (localStorage), nunca no código nem nos registos.
 *
 * Este módulo é PURO onde a matemática o permite e INJETÁVEL onde o mundo
 * entra: sem relógio próprio (`agora` entra por injeção — nada de Date.now
 * nem de Math.random aqui), sem `fetch`/`FormData`/`Blob`/`navigator`
 * embutidos nas assinaturas — tudo o que é plataforma entra por opções e cai
 * nos globais do browser quando não há injeção (os testes injetam sempre).
 *
 * DUAS CAMADAS:
 *   (a) MATEMÁTICA do nível (rmsParaDb/suavizarDb/dbParaAltura) — dBFS puro,
 *       envelope de ataque/queda e gama de desenho das barras;
 *   (b) PLATAFORMA (criarGravadorVoz/transcreverAudio/config) — getUserMedia
 *       + MediaRecorder + AnalyserNode, POST multipart a
 *       https://api.openai.com/v1/audio/transcriptions com a cadeia de
 *       modelos gpt-transcribe → gpt-4o-transcribe → gpt-4o-mini-transcribe
 *       → whisper-1 (retentativa SÓ quando a API diz que o modelo não
 *       existe) e erros TIPADOS {codigo, mensagem}.
 *
 * API verificada AO VIVO (2026-10-03, docs/VOZ-TRANSCRICAO.md): o modelo
 * `gpt-transcribe` em POST multipart (file + model [+ language]) responde
 * {text, usage, languages?}; o CORS do browser funciona (preflight permite
 * authorization; nunca se define Content-Type à mão — o boundary do
 * multipart é do browser); 401 devolve {"error":{"message":"Incorrect API
 * key provided…"}} e um modelo desconhecido devolve erro 4xx com "The model `x`
 * does not exist" / error.code 'model_not_found' (404 visto ao vivo; é o único
 * caso que desencadeia a cadeia de fallback).
 *
 * CÓPIA EMBUTIDA (paridade por teste — regenerar quando este ficheiro mudar;
 * o texto embutido é este ficheiro tal-e-qual com os `export` removidos):
 *   dsh-plugin/src/client.js  — bundle do browser (não importa irmãos)
 * Regenerar: python3 scripts/embutir-voz.py --embutir --alvo client.
 *
 * NOTA de autocontenção: o bloco embutido tem de ser executável sozinho —
 * por isso os nomes internos levam prefixo `voz` e nada se importa de fora.
 */

/* ------------------------------------------------------------------ */
/* Constantes                                                           */
/* ------------------------------------------------------------------ */

/* Cadeia de modelos de transcrição, por ordem de preferência. A retentativa
 * automática só anda para o seguinte quando a API responde "o modelo não
 * existe" (chaves diferentes têm acesso a modelos diferentes). */
export const VOZ_MODELOS = ['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'];

/* Limite do endpoint de transcrição: 25 MB por ficheiro de áudio. */
export const VOZ_LIMITE_BYTES = 25 * 1024 * 1024;

/* Duas minutos e PARA: a mensagem de voz é curta (iMessage) e o modelo não
 * precisa de mais; a gravação para sozinha e transcreve o que há. */
export const VOZ_DURACAO_MAX_MS = 2 * 60 * 1000;

/* Onde vive a configuração do utilizador (chave OpenAI + idioma). */
export const CHAVE_CONFIG = 'dsh-work-game:config';

/* POST multipart da transcrição (a resposta é JSON por omissão). */
export const VOZ_URL_TRANSCRICAO = 'https://api.openai.com/v1/audio/transcriptions';

/* Amostragem do analisador: ~10 níveis/s (as barras interpolam no rAF). */
const VOZ_AMOSTRAGEM_MS = 100;

/* Silêncio digital: por baixo disto já não há sinal útil (dBFS). */
const VOZ_PISO_DB = -100;

/* ------------------------------------------------------------------ */
/* Erros tipados                                                        */
/* ------------------------------------------------------------------ */

/*
 * Todo o erro que sai deste módulo é {codigo, mensagem}:
 *   sem-chave      falta a chave da API (não há nada que tentar);
 *   chave-invalida a API rejeitou a chave (401);
 *   limite         quota/crédito esgotado (402/429);
 *   audio-grande   áudio acima do limite do endpoint (413 ou > 25 MB);
 *   rede           sem ligação / fetch rebentou;
 *   microfone      getUserMedia/MediaRecorder indisponível ou negado;
 *   api            qualquer outra resposta da API (a mensagem vem da API).
 */
function vozErro(codigo, mensagem) {
  return { codigo, mensagem: String(mensagem || codigo) };
}

function vozMensagemDe(e) {
  if (!e) return 'erro desconhecido';
  if (typeof e === 'string') return e;
  const m = e.mensagem ?? e.message ?? (e.error && e.error.message) ?? e.code;
  return typeof m === 'string' && m ? m : String(e);
}

/* O corpo de erro da API OpenAI: {"error":{"message":"…"}}. */
async function vozCorpoDeErro(resposta) {
  if (!resposta) return null;
  try {
    if (typeof resposta.json === 'function') return await resposta.json();
  } catch { /* não é JSON: tenta texto */ }
  try {
    if (typeof resposta.text === 'function') {
      const texto = await resposta.text();
      return texto ? { error: { message: String(texto).slice(0, 400) } } : null;
    }
  } catch { /* corpo ilegível */ }
  return null;
}

/* "O modelo não existe" é o ÚNICO caso que anda na cadeia de fallback. A API
 * nem sequer responde sempre 400: verificado AO VIVO (2026-10-03), um modelo
 * inexistente devolve 404 com error.code 'model_not_found' — por isso aceitam-se
 * os dois (e a mensagem em inglês ou português). */
function vozErroDeModelo(mensagem, codigo) {
  const m = String(mensagem || '');
  return /does not exist/i.test(m) || /não existe/i.test(m) || /invalid model/i.test(m)
    || String(codigo || '') === 'model_not_found';
}

/* 401/402/429/413/outro → código tipado (a mensagem vem da API quando há). */
function vozMapearStatus(status, mensagem) {
  if (status === 401) return vozErro('chave-invalida', mensagem || 'Chave da API OpenAI inválida.');
  if (status === 402 || status === 429) return vozErro('limite', mensagem || 'Limite da API OpenAI atingido.');
  if (status === 413) return vozErro('audio-grande', mensagem || 'Áudio demasiado grande para a API.');
  return vozErro('api', mensagem || `API OpenAI respondeu ${status}.`);
}

/* ------------------------------------------------------------------ */
/* Matemática do nível (pura — testada em tests/plugin/voz.test.mjs)    */
/* ------------------------------------------------------------------ */

/*
 * RMS (0..1) → dBFS = 20·log10(rms), com piso: o silêncio digital não é
 * -∞ (log de 0) nem uma varanda sem fundo — corta-se a -100 dB.
 */
export function rmsParaDb(rms) {
  const r = Number.isFinite(rms) ? Math.max(0, rms) : 0;
  return Math.max(VOZ_PISO_DB, 20 * Math.log10(Math.max(r, 1e-7)));
}

/*
 * Envelope de um medidor de nível (VU digital): sobe depressa (ataque 20 ms
 * — a consoante está lá logo) e desce devagar (queda 250 ms — a vogal
 * "segura"). Fator 1-exp(-dt/tau): independente do intervalo de amostragem.
 * Sem tempo (dt não positivo — sem relógio injetado) aceita-se a amostra.
 */
export function suavizarDb(atual, novo, dtMs, opcoes = {}) {
  const { ataqueMs = 20, quedaMs = 250 } = opcoes || {};
  const a = Number.isFinite(atual) ? atual : VOZ_PISO_DB;
  const n = Number.isFinite(novo) ? novo : a;
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  if (dt === 0) return n;
  const tau = n > a
    ? (Number.isFinite(ataqueMs) && ataqueMs > 0 ? ataqueMs : 20)
    : (Number.isFinite(quedaMs) && quedaMs > 0 ? quedaMs : 250);
  return a + (n - a) * (1 - Math.exp(-dt / tau));
}

/*
 * dB → altura das barras (0..1): janela útil [minDb, maxDb] normalizada e
 * gama < 1 para o grave do silêncio não esconder a fala (padrão 0.6).
 */
export function dbParaAltura(db, opcoes = {}) {
  const { minDb = -60, maxDb = 0, gama = 0.6 } = opcoes || {};
  const d = Number.isFinite(db) ? db : minDb;
  const span = maxDb - minDb;
  const t = span > 0 ? Math.min(1, Math.max(0, (d - minDb) / span)) : 0;
  const g = Number.isFinite(gama) && gama > 0 ? gama : 1;
  return Math.min(1, Math.max(0, Math.pow(t, g)));
}

/* ------------------------------------------------------------------ */
/* Gravador (getUserMedia + MediaRecorder + AnalyserNode)               */
/* ------------------------------------------------------------------ */

/*
 * Tipo do ficheiro gravado. iOS pode MENTIR em isTypeSupported (diz que
 * suporta o que depois não grava) e até atirar: por isso cada candidato vai
 * em try/catch e, no fim, deixa-se o browser escolher (''). Ordem: o opus em
 * webm é o que a API prefere; webm liso; mp4 é o do Safari/iOS; '' = default.
 */
export function escolherMimeType(isTypeSupported) {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
  const suporta = typeof isTypeSupported === 'function' ? isTypeSupported : () => false;
  for (const tipo of candidatos) {
    if (tipo === '') return ''; // último recurso: o browser escolhe sozinho
    try {
      if (suporta(tipo)) return tipo;
    } catch { /* iOS: isTypeSupported pode atirar — segue para o seguinte */ }
  }
  return '';
}

/*
 * Fábrica assíncrona do gravador. Dependências da plataforma ENTREM POR
 * INJEÇÃO (os testes passam fakes; o client.js passa os do browser):
 *   getUserMedia({audio:true}) -> Promise<MediaStream>
 *   MediaRecorder              construtor (+ .isTypeSupported estático)
 *   AudioContext               construtor (createMediaStreamSource/Analyser)
 *   agora()                    relógio em ms (sem relógio: dt = 0 e o
 *                              auto-stop temporal cai só no setTimeout)
 * Devolve { parar() -> Promise<Blob>, cancelar(), assinarNivel(fn),
 * duracaoMs() }:
 *   - parar() resolve com UM Blob (type = recorder.mimeType) e PÁRA SEMPRE
 *     todos os tracks do stream + fecha o AudioContext;
 *   - cancelar() faz o mesmo mas descarta o áudio (blob vazio);
 *   - assinarNivel(fn) chama fn(nivel0..1, {db, duracaoMs}) ~10×/s e devolve
 *     a função de desinscrição;
 *   - passados VOZ_DURACAO_MAX_MS a gravação PARA sozinha (parar() devolve o
 *     mesmo blob).
 */
export async function criarGravadorVoz(opcoes = {}) {
  const { getUserMedia, MediaRecorder, AudioContext, agora, Blob: BlobImpl } = opcoes || {};
  const relogio = typeof agora === 'function' ? agora : () => 0;
  const FazBlob = typeof BlobImpl === 'function'
    ? BlobImpl
    : (typeof Blob === 'function' ? Blob : null);
  if (typeof getUserMedia !== 'function') {
    throw vozErro('microfone', 'Sem getUserMedia: este browser não dá acesso ao microfone.');
  }
  if (typeof MediaRecorder !== 'function') {
    throw vozErro('microfone', 'Sem MediaRecorder: este browser não grava áudio.');
  }

  let stream;
  try {
    stream = await getUserMedia({ audio: true });
  } catch (e) {
    throw vozErro('microfone', `Sem microfone: ${vozMensagemDe(e)}`);
  }

  // Tipo gravado: candidatos em try/catch e, se o construtor rejeitar o tipo,
  // fica o default do browser (nunca se define Content-Type à mão aqui).
  let tipoPedido = '';
  try {
    tipoPedido = escolherMimeType((t) => MediaRecorder.isTypeSupported(t));
  } catch { /* sem isTypeSupported: default do browser */ }
  let rec;
  try {
    rec = tipoPedido ? new MediaRecorder(stream, { mimeType: tipoPedido }) : new MediaRecorder(stream);
  } catch {
    try {
      rec = new MediaRecorder(stream);
    } catch (e) {
      pararStream();
      throw vozErro('microfone', `MediaRecorder recusou o áudio: ${vozMensagemDe(e)}`);
    }
  }

  // O analisador sai do MESMO stream que grava (uma só permissão, um só
  // microfone): fftSize 2048 → RMS da onda → dBFS suavizado.
  let ctxAudio = null;
  let analisador = null;
  try {
    if (typeof AudioContext === 'function') {
      ctxAudio = new AudioContext();
      const fonte = ctxAudio.createMediaStreamSource(stream);
      analisador = ctxAudio.createAnalyser();
      analisador.fftSize = 2048;
      if (typeof fonte.connect === 'function') fonte.connect(analisador);
    }
  } catch { /* sem análise: as barras ficam mudas, a gravação continua */ }

  const pedacos = [];
  const assinantes = new Set();
  const inicio = Math.max(0, relogio());
  let ultimoDb = VOZ_PISO_DB;
  let ultimaLeitura = inicio;
  let parado = false;
  let cancelado = false;
  let blobFinal = null;
  let resolverResultado = null;
  const resultado = new Promise((res) => { resolverResultado = res; });

  function pararStream() {
    try {
      const tracks = stream && typeof stream.getTracks === 'function' ? stream.getTracks() : [];
      for (const t of tracks) { try { t.stop(); } catch { /* track já morta */ } }
    } catch { /* sem tracks */ }
  }

  function encerrarTudo() {
    pararStream();
    if (intervalo !== null) { clearInterval(intervalo); intervalo = null; }
    if (autoStop !== null) { clearTimeout(autoStop); autoStop = null; }
    if (ctxAudio && typeof ctxAudio.close === 'function') {
      try {
        const f = ctxAudio.close();
        if (f && typeof f.catch === 'function') f.catch(() => {});
      } catch { /* contexto já fechado */ }
    }
    ctxAudio = null;
    analisador = null;
  }

  function aoTerminar() {
    if (parado) return;
    parado = true;
    if (cancelado) pedacos.length = 0;
    encerrarTudo();
    const tipo = (rec && rec.mimeType) || tipoPedido || 'audio/webm';
    blobFinal = FazBlob ? new FazBlob(pedacos, { type: tipo }) : null;
    if (resolverResultado) resolverResultado(blobFinal);
  }

  function amostrar() {
    if (parado) return;
    const t = Math.max(0, relogio());
    if (analisador && typeof analisador.getFloatTimeDomainData === 'function') {
      const dados = new Float32Array(analisador.fftSize || 2048);
      try {
        analisador.getFloatTimeDomainData(dados);
        let soma = 0;
        for (let i = 0; i < dados.length; i += 1) soma += dados[i] * dados[i];
        const rms = Math.sqrt(soma / Math.max(1, dados.length));
        ultimoDb = suavizarDb(ultimoDb, rmsParaDb(rms), t - ultimaLeitura, undefined);
      } catch { /* analisador morto: mantém o último nível */ }
    }
    ultimaLeitura = t;
    const nivel = dbParaAltura(ultimoDb);
    for (const fn of assinantes) {
      try { fn(nivel, { db: ultimoDb, duracaoMs: Math.max(0, t - inicio) }); } catch { /* assinante mau */ }
    }
    // Auto-stop pelo relógio INJETADO (testável) — o setTimeout abaixo é a
    // rede de segurança para quem não injeta relógio nenhum.
    if (t - inicio >= VOZ_DURACAO_MAX_MS) parar();
  }

  rec.ondataavailable = (e) => {
    if (e && e.data && e.data.size > 0) pedacos.push(e.data);
  };
  rec.onstop = () => aoTerminar();

  let intervalo = setInterval(amostrar, VOZ_AMOSTRAGEM_MS);
  let autoStop = setTimeout(() => { parar().catch(() => {}); }, VOZ_DURACAO_MAX_MS);
  // Em Node (testes) os temporizadores não seguram o processo.
  if (intervalo && typeof intervalo.unref === 'function') intervalo.unref();
  if (autoStop && typeof autoStop.unref === 'function') autoStop.unref();

  try {
    rec.start(1000); // timeslice 1 s: pedaços de 1 em 1 s, nada se perde se fechar
  } catch (e) {
    encerrarTudo();
    throw vozErro('microfone', `Não deu para começar a gravar: ${vozMensagemDe(e)}`);
  }

  function parar() {
    if (parado) return Promise.resolve(blobFinal);
    let largado = false;
    try {
      if (rec && typeof rec.stop === 'function' && rec.state !== 'inactive') {
        rec.stop(); // o browser dispara 'dataavailable' (último pedaço) e 'stop'
        largado = true;
      }
    } catch { /* stop() rebentou: termina à mão */ }
    if (!largado) {
      aoTerminar();
    } else if (!parado) {
      // Rede de segurança: um MediaRecorder que nunca dispare 'stop' não deixa
      // a promessa pendurada — passados 500 ms termina-se com o que há.
      const salvaguarda = setTimeout(() => aoTerminar(), 500);
      if (salvaguarda && typeof salvaguarda.unref === 'function') salvaguarda.unref();
    }
    return resultado;
  }

  function cancelar() {
    if (parado) return;
    cancelado = true;
    try {
      if (rec && typeof rec.stop === 'function' && rec.state !== 'inactive') rec.stop();
    } catch { /* stop() rebentou */ }
    aoTerminar();
  }

  function assinarNivel(fn) {
    if (typeof fn !== 'function') return () => {};
    assinantes.add(fn);
    return () => { assinantes.delete(fn); };
  }

  function duracaoMs() {
    return Math.max(0, Math.max(0, relogio()) - inicio);
  }

  return { parar, cancelar, assinarNivel, duracaoMs };
}

/* ------------------------------------------------------------------ */
/* Transcrição (OpenAI speech-to-text)                                  */
/* ------------------------------------------------------------------ */

/* Nome do ficheiro multipart pela extensão do mime (a API deduz o formato). */
function vozExtensao(tipo) {
  const base = String(tipo || '').split(';')[0].trim().toLowerCase();
  const sub = base.split('/')[1] || 'webm';
  const mapa = { 'x-wav': 'wav', 'x-m4a': 'm4a', 'x-mpeg': 'mp3', mp4: 'm4a' };
  return mapa[sub] || sub.replace(/^x-/, '');
}

/*
 * Transcreve um Blob de áudio com o speech-to-text da OpenAI.
 *   POST https://api.openai.com/v1/audio/transcriptions (multipart)
 *   campos: file (blob + nome pela extensão), model, language (só se pedida)
 *   cabeçalhos: SÓ Authorization: Bearer <chave> — o Content-Type NUNCA se
 *   define à mão (o boundary do multipart é do browser; define-lo rebenta o
 *   envio) — verificado ao vivo com preflight CORS.
 * Resposta: { text, modeloUsado, usage } (usage pode ser null).
 * Cadeia de modelos: pede-se `modelo` (por omissão o primeiro da lista) e,
 * SÓ quando a API diz "o modelo não existe" (400), tenta-se o seguinte de
 * VOZ_MODELOS. Erros: {codigo, mensagem} — sem-chave · chave-invalida (401) ·
 * limite (402/429) · audio-grande (413 ou >25 MB) · rede · api.
 */
export async function transcreverAudio(blob, opcoes = {}) {
  const { chave, modelo, idioma, fetch: pedido, agora, FormData: FazFormData } = opcoes || {};
  const chaveLimpa = typeof chave === 'string' ? chave.trim() : '';
  if (!chaveLimpa) {
    throw vozErro('sem-chave', 'Sem chave da API OpenAI — guarde-a nas Definições do telemóvel.');
  }
  if (!blob || typeof blob.size !== 'number') {
    throw vozErro('api', 'Sem áudio para transcrever.');
  }
  if (blob.size > VOZ_LIMITE_BYTES) {
    throw vozErro('audio-grande', 'Gravação acima de 25 MB — parta a mensagem de voz em duas.');
  }
  const f = typeof pedido === 'function'
    ? pedido
    : (typeof fetch === 'function' ? fetch : null);
  if (!f) {
    throw vozErro('rede', 'Sem fetch: este browser não fala com a API.');
  }
  const FD = typeof FazFormData === 'function'
    ? FazFormData
    : (typeof FormData === 'function' ? FormData : null);
  if (!FD) {
    throw vozErro('rede', 'Sem FormData: este browser não envia multipart.');
  }
  void agora; // a transcrição não mede tempo — o relógio é do gravador

  const modelos = VOZ_MODELOS.slice();
  const pedidoModelo = typeof modelo === 'string' && modelo.trim() ? modelo.trim() : modelos[0];
  const cadeia = modelos.includes(pedidoModelo)
    ? modelos.slice(modelos.indexOf(pedidoModelo))
    : [pedidoModelo, ...modelos];
  const nomeFicheiro = `gravacao.${vozExtensao(blob.type)}`;

  let ultimoErro = null;
  for (const m of cadeia) {
    const fd = new FD();
    fd.append('file', blob, nomeFicheiro);
    fd.append('model', m);
    if (typeof idioma === 'string' && idioma.trim() && idioma.trim() !== 'auto') {
      fd.append('language', idioma.trim());
    }
    let resposta;
    try {
      resposta = await f(VOZ_URL_TRANSCRICAO, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chaveLimpa}` },
        body: fd,
      });
    } catch (e) {
      throw vozErro('rede', `Sem ligação à API OpenAI: ${vozMensagemDe(e)}`);
    }
    const status = resposta && Number.isFinite(resposta.status) ? resposta.status : 0;
    const ok = !!resposta && (typeof resposta.ok === 'boolean'
      ? resposta.ok
      : status >= 200 && status < 300);
    if (ok) {
      let corpo = null;
      try { corpo = await resposta.json(); } catch { corpo = null; }
      return {
        text: corpo && typeof corpo.text === 'string' ? corpo.text : '',
        modeloUsado: m,
        usage: (corpo && corpo.usage) || null,
      };
    }
    const corpoErro = await vozCorpoDeErro(resposta);
    const erroApi = corpoErro && corpoErro.error && typeof corpoErro.error === 'object' ? corpoErro.error : null;
    const mensagemApi = erroApi && erroApi.message
      ? String(erroApi.message)
      : `A API OpenAI respondeu ${status}.`;
    const erro = vozMapearStatus(status, mensagemApi);
    // Modelo inexistente/sem acesso (4xx): anda-se para o seguinte da cadeia.
    if (status >= 400 && status < 500 && vozErroDeModelo(mensagemApi, erroApi && erroApi.code)) {
      ultimoErro = erro;
      continue;
    }
    throw erro;
  }
  throw ultimoErro || vozErro('api', 'Sem modelo de transcrição disponível.');
}

/* ------------------------------------------------------------------ */
/* Configuração (chave OpenAI + idioma em localStorage)                 */
/* ------------------------------------------------------------------ */

/* Idiomas aceites na transcrição ('auto' = deixar a API detetar). */
const VOZ_IDIOMAS = ['auto', 'pt', 'en'];

function vozConfigPadrao() {
  return { chaveOpenAI: '', idioma: 'auto' };
}

/* Normaliza como `normalizarFiltros`: só campos conhecidos, tipos certos. */
function vozNormalizarConfig(bruto) {
  const c = vozConfigPadrao();
  if (bruto && typeof bruto === 'object') {
    if (typeof bruto.chaveOpenAI === 'string') c.chaveOpenAI = bruto.chaveOpenAI.trim();
    if (typeof bruto.idioma === 'string' && VOZ_IDIOMAS.includes(bruto.idioma)) c.idioma = bruto.idioma;
  }
  return c;
}

/* Lê a configuração guardada. Sem storage (modo privado, sandbox) ou JSON
 * estragado: padrão — a voz fica simplesmente desligada. */
export function lerConfig(storage) {
  try {
    const bruto = storage && typeof storage.getItem === 'function' ? storage.getItem(CHAVE_CONFIG) : null;
    return vozNormalizarConfig(bruto ? JSON.parse(bruto) : null);
  } catch {
    return vozConfigPadrao();
  }
}

/* Guarda {chaveOpenAI, idioma}. true = guardado; false = persistência
 * indisponível (a configuração vale só nesta página). A chave NUNCA é
 * registada em lado nenhum — só escrita no storage do próprio navegador. */
export function guardarConfig(storage, config) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(CHAVE_CONFIG, JSON.stringify(vozNormalizarConfig(config)));
    return true;
  } catch {
    return false;
  }
}

/* Limpa a configuração guardada (remove a chave do navegador). */
export function limparConfig(storage) {
  try {
    if (!storage) return false;
    if (typeof storage.removeItem === 'function') storage.removeItem(CHAVE_CONFIG);
    else if (typeof storage.setItem === 'function') storage.setItem(CHAVE_CONFIG, JSON.stringify(vozConfigPadrao()));
    else return false;
    return true;
  } catch {
    return false;
  }
}

/* Chave para MOSTRAR sem a revelar: 'sk-…abcd' (prefixo + 4 últimos). */
export function mascararChave(chave) {
  const c = typeof chave === 'string' ? chave.trim() : '';
  if (!c) return '';
  if (c.length <= 4) return '…';
  return `${c.slice(0, 3)}…${c.slice(-4)}`;
}
