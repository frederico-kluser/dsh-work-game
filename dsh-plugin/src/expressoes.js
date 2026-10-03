/*
 * dsh-plugin/src/expressoes.js — MOTOR DE EXPRESSÕES (FONTE).
 *
 * Escolhe a expressão facial de uma pessoa a cada evento real do trabalho:
 * (a) TAXONOMIA de cenários (EXPRESSOES_CENARIOS) mapeada do vocabulário
 *     normalizado de eventos (docs/contratos-plugin.md §1);
 * (b) SORTEIO de variantes dentro de cada cenário com shuffle bag PURO —
 *     uma cópia por variante, sem reposição, com anti-repetição e correção de
 *     fronteira entre ciclos;
 * (c) ARBITRAGEM/tempo (expressaoAplicavel): min-dwell, cadência máxima,
 *     prioridades explícitas e "stickiness" terminal — tudo com carimbos `at`
 *     do evento, nunca com relógio.
 *
 * Base de evidência: pesquisas/2026-10-02-que-taxonomia-de-expressoes-faciais-
 * regras-de-mapeamento-eve.md (Q3/Q8 = transições e anti-flicker; Q9 = shuffle
 * bag; Q10 = tempos de categorização/duração; Q11 = dose-resposta por
 * intensidade; Q12 = limiares de pressão de contexto).
 *
 * DUAS FORMAS, um só algoritmo:
 *   sortearExpressao(…)     — PURO: estado uint32 + sacos entram, estado +
 *                             sacos saem; sem relógio nem Math.random. Usado
 *                             por state.js (o estado vive na pessoa e clona-se).
 *   criarMotorExpressoes    — motor com estado interno (arranque determinístico
 *                             por semente; a entropia real entra pelo `sal` de
 *                             cada evento — ex.: o seu carimbo `at`), para as
 *                             superfícies de apresentação (app.js demo e o
 *                             Modo jogo do client.js).
 *
 * CÓPIAS EMBUTIDAS (paridade por teste — regenerar quando este ficheiro mudar;
 * o texto embutido é este ficheiro tal-e-qual com os `export` removidos):
 *   expressions.js            — script puro da demo (window.DSH_EXPRESSIONS.expressoes)
 *   dsh-plugin/src/client.js  — bundle do browser (seguimento à parte)
 * Regenerar: python3 scripts/embutir-expressoes-motor.py --embutir --alvo todos.
 *
 * NOTA de autocontenção: este módulo NÃO importa variantes.js — o bloco
 * embutido tem de ser executável sozinho (expressions.js/client.js não podem
 * importar irmãos). Por isso o hash/PRNG têm nomes próprios (expressaoHash,
 * expressaoPasso) em vez de reutilizar varianteHash/variantePasso.
 */

/* ------------------------------------------------------------------ */
/* Limiares e tempos (Q10/Q12)                                          */
/* ------------------------------------------------------------------ */

/*
 * Q10 (ronda 2): a categorização CONSCIENTE de uma expressão demora ~0,6–1,0 s
 * e a janela de macroexpressão vai de 0,5 a 4 s → minDwellMs = 1200 ms para
 * desenhos de prioridade inferior; minMudancaMs = 1000 ms é a cadência máxima
 * (~1 mudança/s [Q3/S29]; nunca <0,5 s ou lê-se microexpressão/piscar [Q3/S24]);
 * duracaoMensagemMs = 2800 ms é a duração por mensagem (Q10: 2,5–3,0 s, banda
 * 2,0–4,0) usada pelas superfícies de apresentação.
 *
 * Q12 (ronda 2): NÃO existem limiares de preenchimento de contexto validados —
 * aviso 0.7 / sobrecarga 0.85 são EXTRAPOLAÇÃO declarada (convenção 50/75/90
 * do Agent Zero), tal como o gatilho absoluto de 200 000 tokens do pedido do
 * utilizador ("contexto > 200k"). A histerese segue o padrão de deadband
 * ANSI/ISA-18.2 [S56]: um nível ativo só desativa 5 pontos abaixo do limiar
 * de entrada (anti-flicker em rajadas de medições).
 */
export const EXPRESSOES_LIMIARES = {
  aviso: 0.7,
  sobrecarga: 0.85,
  histerese: 0.05,
  minDwellMs: 1200,
  minMudancaMs: 1000,
  duracaoMensagemMs: 2800,
  /* gatilho absoluto de pressão (tokens), independente da janela */
  avisoAbsoluto: 200000
};

/* ------------------------------------------------------------------ */
/* Taxonomia de cenários                                                */
/* ------------------------------------------------------------------ */

/*
 * Cada cenário tem:
 *   pool       variantes que podem ser sorteadas (os 14 presets da biblioteca
 *              pertencem todos a pelo menos um pool; 'sleeping' é o 15.º, do
 *              Modo jogo);
 *   base       preset de reserva — fallback quando a identidade NENHUM preset
 *              do pool tem (ex.: identidades aleatórias só têm
 *              idle/working/success/error);
 *   prob       probabilidade-base do disparo (0..1); cada pessoa ainda a modula
 *              com o seu fator (0.85..1.15);
 *   prioridade arbitragem em rajadas: erro/pergunta/aprovação (95-90) acima de
 *              ação/ferramenta (50) acima de mensagem (40) acima de repouso
 *              (10) [Q8/S59: tabela de prioridade explícita];
 *   graus      (opcional, Q11) dose-resposta: a intensidade da expressão é
 *              legível pela AMPLITUDE do traço diagnóstico, em passos ≥20% —
 *              20–40% leem-se como neutro, ≥60% é confiável. Sem amplitude
 *              variável nos SVGs, a dose entra pela ESCOLHA do preset: cada
 *              grau ordena os presets do pool por amplitude percebida (da mais
 *              contida para a mais intensa) e um desenho com `grau` usa o
 *              escalão pedido (1-based, saturado; sem `grau` usa o pool todo).
 */
export const EXPRESSOES_CENARIOS = {
  pergunta: {
    pool: ['waiting', 'thinking', 'surprised'], base: 'waiting', prob: 1, prioridade: 95
  },
  aprovacao: {
    pool: ['approval', 'waiting', 'surprised'], base: 'waiting', prob: 1, prioridade: 95
  },
  erro: {
    pool: ['error', 'surprised', 'disbelief'], base: 'error', prob: 1, prioridade: 90,
    /* terminal: mantém o pool todo por omissão; o grau doseia por severidade */
    graus: [
      { grau: 1, intensidade: 0.3, presets: ['surprised'] },
      { grau: 2, intensidade: 0.7, presets: ['disbelief'] },
      { grau: 3, intensidade: 1.0, presets: ['error'] }
    ]
  },
  sucesso: {
    pool: ['success', 'celebrating', 'approval', 'wink'], base: 'success', prob: 0.9, prioridade: 85
  },
  'ferramenta-erro': {
    pool: ['surprised', 'disbelief', 'error'], base: 'error', prob: 1, prioridade: 80,
    /* transitório de BAIXA intensidade [Q6: surpresa-confusão breve] */
    graus: [
      { grau: 1, intensidade: 0.3, presets: ['surprised'] },
      { grau: 2, intensidade: 0.7, presets: ['disbelief'] },
      { grau: 3, intensidade: 1.0, presets: ['error'] }
    ]
  },
  'erro-transitorio': {
    pool: ['surprised', 'thinking', 'disbelief'], base: 'thinking', prob: 1, prioridade: 75,
    /* ESCALA a cada retentativa consecutiva [Q6/Q11] — ver grauDeCenario */
    graus: [
      { grau: 1, intensidade: 0.3, presets: ['surprised'] },
      { grau: 2, intensidade: 0.6, presets: ['thinking'] },
      { grau: 3, intensidade: 1.0, presets: ['disbelief'] }
    ]
  },
  cancelado: {
    pool: ['disbelief', 'waiting', 'idle'], base: 'idle', prob: 1, prioridade: 70
  },
  compactacao: {
    /* micro-reação breve seguida de regresso a 'contexto' [Q12] */
    pool: ['surprised', 'disbelief', 'thinking'], base: 'thinking', prob: 1, prioridade: 65
  },
  sobrecarga: {
    /* nível alto RARO e CURTO [Q12]: após este desenho, o próximo desenho de
       prioridade inferior regressa a 'contexto'/'focused' (estado limitado no
       tempo — ver docs/ALGORITMO-EXPRESSOES.md) */
    pool: ['thinking', 'disbelief', 'surprised'], base: 'thinking', prob: 1, prioridade: 60
  },
  ferramenta: {
    pool: ['tool', 'searching', 'focused', 'thinking'], base: 'working', prob: 0.85, prioridade: 50
  },
  contexto: {
    pool: ['focused', 'thinking'], base: 'focused', prob: 1, prioridade: 45
  },
  mensagem: {
    pool: ['working', 'focused', 'thinking', 'wink'], base: 'working', prob: 0.5, prioridade: 40
  },
  subagente: {
    pool: ['thinking', 'tool', 'focused'], base: 'working', prob: 0.6, prioridade: 35
  },
  ocioso: {
    /* 'wink' é micro-interação de repouso (vive EM CIMA do hold, não o
       substitui [Q3/S33]) — nas superfícies é reação one-shot */
    pool: ['idle', 'wink'], base: 'idle', prob: 0.7, prioridade: 10
  },
  dormir: {
    /* Modo jogo: quem está Disponível dorme (assets/avatars/sleeping/) */
    pool: ['sleeping'], base: 'sleeping', prob: 1, prioridade: 5
  }
};

/* Cenários terminais: a cara fica até novo turno do utilizador ou evento de
 * prioridade igual/superior [Q6: o erro persiste até reconhecimento; Q8]. */
export const EXPRESSOES_TERMINAIS = ['sucesso', 'erro', 'cancelado'];

/* ------------------------------------------------------------------ */
/* PRNG/hash próprios (bloco embutido autocontido)                      */
/* ------------------------------------------------------------------ */

/* FNV-1a → uint32. Personalidade estável por (pessoa, cenário) e sementes. */
export function expressaoHash(texto) {
  var h = 2166136261 >>> 0;
  var s = String(texto == null ? '' : texto);
  for (var i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* xorshift32: um passo do PRNG (uint32, nunca 0). */
export function expressaoPasso(estado) {
  var a = (estado >>> 0) || 0x9E3779B9;
  a ^= a << 13; a >>>= 0;
  a ^= a >>> 17;
  a ^= a << 5; a >>>= 0;
  return a || 1;
}

function expressaoFracao(estado) {
  return (estado >>> 0) / 4294967296;
}

/* Fator de personalidade: cada pessoa tem A SUA probabilidade de disparo. */
export function expressaoFator(semente) {
  return 0.85 + (expressaoHash('proba|' + semente) % 31) / 100; /* 0.85..1.15 */
}

/* ------------------------------------------------------------------ */
/* Pools, base e prioridade                                             */
/* ------------------------------------------------------------------ */

function cenarioDe(cenario) {
  return EXPRESSOES_CENARIOS[cenario] || EXPRESSOES_CENARIOS.mensagem;
}

/* Pool efetivo de um cenário: os presets do pool que a identidade tem;
 * se nenhum, o `base` do cenário; se também não, [] (nada a sortear).
 * Mesma semântica de poolDeVariante (variantes.js). */
export function poolDeCenario(cenario, disponiveis) {
  var cen = cenarioDe(cenario);
  if (!disponiveis || !disponiveis.length) return cen.pool.slice();
  var ok = [];
  for (var i = 0; i < cen.pool.length; i += 1) {
    if (disponiveis.indexOf(cen.pool[i]) !== -1) ok.push(cen.pool[i]);
  }
  if (ok.length) return ok;
  if (disponiveis.indexOf(cen.base) !== -1) return [cen.base];
  return [];
}

/* Fallback determinístico de um cenário (sem sorteio): a `base` do cenário
 * respeitando os presets da identidade; sem a base, a primeira opção do pool
 * efetivo; sem nada, null. */
export function expressaoBase(cenario, disponiveis) {
  var cen = cenarioDe(cenario);
  if (!disponiveis || !disponiveis.length) return cen.base;
  if (disponiveis.indexOf(cen.base) !== -1) return cen.base;
  var pool = poolDeCenario(cenario, disponiveis);
  return pool.length ? pool[0] : null;
}

/* Prioridade de arbitragem de um cenário (0 para cenário desconhecido). */
export function prioridadeDeCenario(cenario) {
  var cen = EXPRESSOES_CENARIOS[cenario];
  return cen && typeof cen.prioridade === 'number' ? cen.prioridade : 0;
}

/* ------------------------------------------------------------------ */
/* Dose-resposta (Q11): grau de intensidade por subtipo                 */
/* ------------------------------------------------------------------ */

/*
 * Q11: a intensidade da expressão escala com a GRAVIDADE/escalada do evento.
 * Regra de escala de retentativas (só 'erro-transitorio'): sobe UM grau a cada
 * `retry` CONSECUTIVO do mesmo turno (o chamador conta-os em `pessoa.retries`;
 * sem esse campo, o chamador deriva a contagem dos eventos 'retry' seguidos e
 * passa `grau` a sortearExpressao). state.js zera `retries` quando o turno
 * termina, o status muda ou uma ferramenta responde com sucesso.
 * Saturação no último escalão. Os restantes cenários com `graus` só doseiam
 * com `grau` EXPLÍCITO (ex.: 'ferramenta-erro' fixa-se em grau 1, transitório
 * de baixa intensidade; 'erro' terminal usa o pool todo por omissão).
 * Sem grau pedido → pool inteiro (variedade).
 */
export function grauDeCenario(cenario, pessoa, grau) {
  var cen = EXPRESSOES_CENARIOS[cenario];
  if (!cen || !cen.graus || !cen.graus.length) return null;
  var limite = cen.graus.length;
  if (typeof grau === 'number' && isFinite(grau) && grau >= 1) {
    return Math.floor(Math.min(grau, limite));
  }
  if (cenario === 'erro-transitorio' && pessoa &&
      typeof pessoa.retries === 'number' && isFinite(pessoa.retries) && pessoa.retries >= 1) {
    return Math.floor(Math.min(pessoa.retries, limite));
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Pressão de contexto (Q12): limiares com histerese                    */
/* ------------------------------------------------------------------ */

/*
 * Dual-threshold com deadband (ANSI/ISA-18.2 [S56]):
 *   - 'sobrecarga': entra com used/window ≥ 0.85; só desativa abaixo de 0.80;
 *   - 'contexto':   entra com used/window ≥ 0.70 OU used ≥ 200 000 (pedido do
 *                   utilizador — janelas grandes não disparam só pela razão);
 *                   só desativa 5 pontos (ou 5%) abaixo do limiar de entrada.
 * Devolve 'nenhum' | 'contexto' | 'sobrecarga' — puro, lê só {used, window}.
 */
export function nivelDePressao(ctx, nivelAnterior) {
  var usado = ctx && typeof ctx.used === 'number' && isFinite(ctx.used) ? ctx.used : null;
  var janela = ctx && typeof ctx.window === 'number' && isFinite(ctx.window) ? ctx.window : null;
  var razao = (usado != null && janela != null && janela > 0) ? usado / janela : null;
  var L = EXPRESSOES_LIMIARES;
  var nivel = (nivelAnterior === 'contexto' || nivelAnterior === 'sobrecarga') ? nivelAnterior : 'nenhum';

  var entraSobrecarga = nivel === 'sobrecarga' ? L.sobrecarga - L.histerese : L.sobrecarga;
  if (razao != null && razao >= entraSobrecarga) return 'sobrecarga';

  var entraAviso = nivel === 'nenhum' ? L.aviso : L.aviso - L.histerese;
  var entraAbsoluto = nivel === 'nenhum' ? L.avisoAbsoluto : L.avisoAbsoluto * (1 - L.histerese);
  if (razao != null && razao >= entraAviso) return 'contexto';
  if (usado != null && usado >= entraAbsoluto) return 'contexto';
  return 'nenhum';
}

/* ------------------------------------------------------------------ */
/* Mapeamento evento → cenário (vocabulário normalizado §1)              */
/* ------------------------------------------------------------------ */

/*
 * Devolve o nome do cenário de EXPRESSOES_CENARIOS, ou null quando o evento
 * não dispara expressão (resolução de pendências, fim de subagente/compactação,
 * eventos de sessão, utilização...). `pessoa` (opcional) traz o nível de
 * pressão anterior (pessoa.ctxNivel) para a histerese e o modo de jogo
 * (pessoa.modoJogo → 'dormir' em vez de 'ocioso').
 */
export function cenarioDeEvento(evento, pessoa) {
  if (!evento || typeof evento.type !== 'string') return null;
  switch (evento.type) {
    case 'question': return 'pergunta';
    case 'approval': return 'aprovacao';
    case 'turn/end': {
      if (evento.kind === 'completed') return 'sucesso';
      if (evento.kind === 'error' || evento.kind === 'blocked' || evento.kind === 'max-tokens') return 'erro';
      if (evento.kind === 'aborted' || evento.kind === 'interrupted') return 'cancelado';
      return null; /* kind desconhecido: sem expressão nova */
    }
    case 'tool': {
      if (evento.phase === 'result' && evento.ok === false) return 'ferramenta-erro';
      return 'ferramenta'; /* phase 'call' ou result ok */
    }
    case 'message': return 'mensagem'; /* side 'user' | 'assistant' */
    case 'retry': return 'erro-transitorio';
    case 'compaction': return evento.phase === 'start' ? 'compactacao' : null;
    case 'subagent/start': return 'subagente';
    case 'ctx': case 'model': {
      /* a pressão de contexto chega por `ctx` ou pela projeção `model` */
      var usado = evento.used;
      if (usado == null) usado = evento.projectedTokens != null ? evento.projectedTokens : evento.pressureTokens;
      var nivel = nivelDePressao(
        { used: usado, window: evento.window != null ? evento.window : evento.contextWindow },
        pessoa ? pessoa.ctxNivel : null
      );
      if (nivel === 'sobrecarga') return 'sobrecarga';
      if (nivel === 'contexto') return 'contexto';
      return null;
    }
    case 'status': {
      if (evento.status !== 'idle') return null; /* running não dispara cara nova */
      return pessoa && pessoa.modoJogo ? 'dormir' : 'ocioso';
    }
    default: return null;
  }
}

/* ------------------------------------------------------------------ */
/* Arbitragem/tempo (Q3/Q8/Q10)                                         */
/* ------------------------------------------------------------------ */

/*
 * Decide se um desenho candidato se aplica. entrada:
 *   prioridadeAtual  prioridade da cara visível (0 = sem cara desenhada)
 *   prioridadeNova   prioridade do cenário candidato
 *   at               carimbo do evento novo (número | null)
 *   ultimaAt         carimbo da última mudança de cara (número | null)
 *   terminal         cenário terminal ativo ('sucesso'|'erro'|'cancelado') | null
 *   novoTurno        true quando o evento é `message` com side 'user'
 *
 * Regras (citações do dossiê):
 *   (a) min-dwell [Q10]: prioridade INFERIOR só desenha depois de
 *       minDwellMs (1200 ms) da última mudança — as rajadas não piscam a cara;
 *   (b) stickiness terminal [Q6/Q8]: depois de sucesso/erro/cancelado a cara
 *       fica até um message do utilizador (novo turno) ou um evento de
 *       prioridade igual/superior (erro/pergunta/aprovação nunca se escondem);
 *   (c) cadência [Q3/Q10]: prioridade IGUAL só redesenha a partir de
 *       minMudancaMs (1000 ms — no máximo ~1 mudança/s);
 *   (d) prioridade superior aplica-se SEMPRE [Q8/S59: tabela explícita
 *       erro/terminal > ação/tool > idle].
 * Sem carimbos (`at`/`ultimaAt` ausentes) não há tempo que impor: as regras
 * (a) e (c) não bloqueiam (o estado é puro e às vezes não traz datas).
 */
export function expressaoAplicavel(entrada) {
  entrada = entrada || {};
  var pAtual = typeof entrada.prioridadeAtual === 'number' && isFinite(entrada.prioridadeAtual)
    ? entrada.prioridadeAtual : 0;
  var pNova = typeof entrada.prioridadeNova === 'number' && isFinite(entrada.prioridadeNova)
    ? entrada.prioridadeNova : 0;
  var at = typeof entrada.at === 'number' && isFinite(entrada.at) ? entrada.at : null;
  var ultimaAt = typeof entrada.ultimaAt === 'number' && isFinite(entrada.ultimaAt) ? entrada.ultimaAt : null;
  var delta = (at != null && ultimaAt != null) ? at - ultimaAt : null;
  var terminal = typeof entrada.terminal === 'string' && EXPRESSOES_TERMINAIS.indexOf(entrada.terminal) !== -1
    ? entrada.terminal : null;
  var novoTurno = entrada.novoTurno === true;

  /* (b) stickiness terminal [Q6/Q8] */
  if (terminal) {
    if (pNova >= prioridadeDeCenario(terminal)) return true; /* igual/superior desgruda */
    if (novoTurno) return true; /* message do utilizador: novo turno */
    return false; /* a cara terminal fica */
  }

  /* (d) prioridade superior aplica-se SEMPRE */
  if (pNova > pAtual) return true;

  /* (a) min-dwell para prioridade inferior */
  if (pNova < pAtual && delta != null && delta < EXPRESSOES_LIMIARES.minDwellMs) return false;

  /* (c) cadência máxima para prioridade igual */
  if (pNova === pAtual && delta != null && delta < EXPRESSOES_LIMIARES.minMudancaMs) return false;

  return true;
}

/* ------------------------------------------------------------------ */
/* Sorteio de variantes — SHUFFLE BAG PURO                              */
/* ------------------------------------------------------------------ */

/*
 * Shuffle bag puro com UMA cópia por variante + guarda de fronteira +
 * anti-repetição = não-repetição garantida; pesos por multiplicidade foram
 * rejeitados porque quebram a não-repetição (verificação adversarial da
 * pesquisa): com m(v) ≥ 2 há repetições intra-ciclo por construção e
 * sequências A,B,A,B têm probabilidade positiva. A variação de frequência
 * entre pessoas vem APENAS do disparo (prob do cenário × fatorDePessoa em
 * [0.85, 1.15]) — as proporções por ciclo ficam uniformes.
 *
 * Por (pessoa × cenário): Fisher-Yates sobre o pool efetivo, PRNG
 * determinístico (xorshift32) com a mistura hash(semente|cenario|ciclo) —
 * consumo sem reposição; quando o saco esvazia, novo ciclo (com a correção de
 * fronteira: o 1.º do ciclo novo nunca repete o último desenhado [Q9/S60]) e a
 * anti-repetição contra `atual` mantém-se (só repete se o saco todo for a cara
 * atual). `sacos` é o estado serializável ({ordem, i, ciclo} por cenário).
 */

function copiaSacos(sacos) {
  var novo = {};
  for (var chave in sacos) {
    if (Object.prototype.hasOwnProperty.call(sacos, chave)) novo[chave] = sacos[chave];
  }
  return novo;
}

function sacoValido(saco, candidatos) {
  if (!saco || !saco.ordem || typeof saco.i !== 'number') return false;
  if (saco.i >= saco.ordem.length) return false;
  if (saco.ordem.length !== candidatos.length) return false;
  for (var i = 0; i < candidatos.length; i += 1) {
    if (saco.ordem.indexOf(candidatos[i]) === -1) return false;
  }
  return true;
}

/* Novo ciclo do saco: Fisher-Yates com uma cópia por variante + correção de
 * fronteira. Devolve {ordem, i, ciclo} e o estado PRNG avançado. */
function novoSaco(estado, semente, cenario, ciclo, candidatos, atual) {
  var ordem = candidatos.slice();
  estado = expressaoPasso(estado ^ expressaoHash(semente + '|' + cenario + '|' + ciclo));
  for (var i = ordem.length - 1; i > 0; i -= 1) {
    estado = expressaoPasso(estado);
    var j = Math.floor(expressaoFracao(estado) * (i + 1));
    var t = ordem[i]; ordem[i] = ordem[j]; ordem[j] = t;
  }
  /* CORREÇÃO DE FRONTEIRA [Q9/S60]: 1.º do ciclo ≠ último desenhado */
  if (ordem.length > 1 && ordem[0] === atual) {
    var troca = ordem[0]; ordem[0] = ordem[1]; ordem[1] = troca;
  }
  return { ordem: ordem, i: 0, ciclo: ciclo, estado: estado };
}

/*
 * Sorteio PURO. entrada:
 *   estado       uint32 — estado do PRNG (entra e sai; determinístico)
 *   sacos        estado dos sacos por cenário ({ordem, i, ciclo}) | null
 *   cenario      nome de EXPRESSOES_CENARIOS
 *   atual        cara visível agora (anti-repetição; null = sem cara)
 *   semente      uint32 — personalidade da pessoa
 *   sal          número | null — entropia do evento (ex.: carimbo `at`)
 *   disponiveis  presets da identidade | null (todos)
 *   probabilidade 0..1 | null — sobrepõe a probabilidade efetiva (testes)
 *   grau         número | null — escalão de intensidade (Q11)
 *   pessoa       objeto | null — lê `retries` quando `grau` não vem (Q11)
 * sai { estado, sacos, preset } — preset null = o disparo não aconteceu.
 * NUNCA muta a entrada: `sacos` novo devolvido em cada chamada.
 */
export function sortearExpressao(entrada) {
  entrada = entrada || {};
  var estado = (typeof entrada.estado === 'number' && isFinite(entrada.estado))
    ? (entrada.estado >>> 0) : 1;
  var semente = (typeof entrada.semente === 'number' && isFinite(entrada.semente))
    ? (entrada.semente >>> 0) : 0;
  var cenario = typeof entrada.cenario === 'string' && EXPRESSOES_CENARIOS[entrada.cenario]
    ? entrada.cenario : 'mensagem';
  var cen = EXPRESSOES_CENARIOS[cenario];
  var sacos = (entrada.sacos && typeof entrada.sacos === 'object') ? entrada.sacos : {};
  var sal = (typeof entrada.sal === 'number' && isFinite(entrada.sal)) ? (entrada.sal >>> 0) : 0;

  var pool = poolDeCenario(cenario, entrada.disponiveis || null);
  if (!pool.length) return { estado: estado, sacos: sacos, preset: null };

  /* Q11: o grau escolhe o escalão de intensidade (sem grau → pool inteiro). */
  var candidatos = pool;
  var grau = grauDeCenario(cenario, entrada.pessoa || null, entrada.grau);
  if (grau != null && cen.graus) {
    for (var g = grau - 1; g >= 0; g -= 1) {
      var faixa = [];
      for (var f = 0; f < cen.graus[g].presets.length; f += 1) {
        if (pool.indexOf(cen.graus[g].presets[f]) !== -1) faixa.push(cen.graus[g].presets[f]);
      }
      if (faixa.length) { candidatos = faixa; break; }
    }
  }

  /* 1.º passo: o DISPARO é aleatório (probabilidade cenário × pessoa). */
  var prob = (typeof entrada.probabilidade === 'number' && isFinite(entrada.probabilidade))
    ? Math.max(0, Math.min(1, entrada.probabilidade))
    : Math.max(0, Math.min(1, cen.prob * expressaoFator(semente)));
  estado = expressaoPasso(estado ^ expressaoPasso(sal));
  if (expressaoFracao(estado) >= prob) return { estado: estado, sacos: sacos, preset: null };

  /* 2.º passo: o saco do cenário (uma cópia por variante, sem reposição).
   * A entrada nunca se muta: o saco usado é SEMPRE uma cópia nova. */
  var saco = sacos[cenario] || null;
  if (!sacoValido(saco, candidatos)) {
    var ciclo = saco && typeof saco.ciclo === 'number' ? saco.ciclo + 1 : 1;
    var novo = novoSaco(estado, semente, cenario, ciclo, candidatos, entrada.atual == null ? null : entrada.atual);
    estado = novo.estado;
    saco = { ordem: novo.ordem, i: novo.i, ciclo: novo.ciclo };
  } else {
    saco = { ordem: saco.ordem.slice(), i: saco.i, ciclo: saco.ciclo };
  }

  /* Anti-repetição: o próximo do saco nunca é a cara atual (só repete se o
   * saco restante for todo a cara atual — pool de uma variante). */
  var ordem = saco.ordem;
  if (ordem[saco.i] === entrada.atual && entrada.atual != null) {
    for (var j = saco.i + 1; j < ordem.length; j += 1) {
      if (ordem[j] !== entrada.atual) {
        var t = ordem[saco.i]; ordem[saco.i] = ordem[j]; ordem[j] = t;
        break;
      }
    }
  }

  var preset = ordem[saco.i];
  var sacoNovo = { ordem: ordem, i: saco.i + 1, ciclo: saco.ciclo };
  var novosSacos = copiaSacos(sacos);
  novosSacos[cenario] = sacoNovo;
  return { estado: estado, sacos: novosSacos, preset: preset };
}

/* ------------------------------------------------------------------ */
/* Motor com estado próprio (superfícies de apresentação)               */
/* ------------------------------------------------------------------ */

/*
 * opts:
 *   identidade    id da identidade (personalidade por omissão)
 *   semente       uint32 — a personalidade/probabilidade DE UMA pessoa
 *   estado        uint32 — arranque do PRNG (por omissão derivado da semente:
 *                 determinístico de propósito — a entropia real entra pelo
 *                 `sal` de cada evento, ex.: o seu carimbo de tempo)
 *   disponiveis   presets da identidade | null
 *   probabilidade 0..1 — sobrepõe a efetiva (testes)
 * devolve { fator, probabilidade, aoEvento(cenario, atual, sal) -> preset|null,
 *           estado(), sacos } — `sacos` é o estado serializável dos sacos.
 */
export function criarMotorExpressoes(opts) {
  opts = opts || {};
  var semente = (typeof opts.semente === 'number' && isFinite(opts.semente))
    ? (opts.semente >>> 0)
    : expressaoHash(opts.identidade || '');
  var estado = (typeof opts.estado === 'number' && isFinite(opts.estado))
    ? (opts.estado >>> 0)
    : (expressaoHash('motor|' + semente) || 1);
  var disponiveis = opts.disponiveis || null;
  var prob = (typeof opts.probabilidade === 'number' && isFinite(opts.probabilidade))
    ? Math.max(0, Math.min(1, opts.probabilidade)) : null;
  var sacos = {};
  return {
    /* probabilidade sobrepõe TODOS os cenários (testes); sem ela, cada cenário
       tem a sua prob multiplicada pelo `fator` da pessoa (o disparo DELE). */
    probabilidade: prob,
    fator: expressaoFator(semente),
    estado: function () { return estado; },
    get sacos() { return sacos; },
    aoEvento: function (cenario, atual, sal) {
      var r = sortearExpressao({
        estado: estado, sacos: sacos, cenario: cenario,
        atual: atual == null ? null : atual,
        semente: semente, sal: sal == null ? null : sal,
        disponiveis: disponiveis, probabilidade: prob,
        grau: null, pessoa: null
      });
      estado = r.estado;
      sacos = r.sacos;
      return r.preset;
    }
  };
}
