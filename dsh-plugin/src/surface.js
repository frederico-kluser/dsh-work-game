/*
 * dsh-plugin/src/surface.js — ponte REAL do DSH (browser) para eventos normalizados §1.
 *
 * É o único ponto que lê o runtime do browser do DSH. Superfícies verificadas no
 * checkout deepseek-harness (0.1.6-alpha.2):
 *
 *   SESSÕES — packages/api/session-controller/src/client/contract/sessions.ts (ISessions)
 *   e src/client/sessions/service.ts:
 *     ctx.sessions.list : ObservableSnapshot<SessionListState>   // getSnapshot() + subscribe(fn)
 *       SessionListState { ids (ordem do host), byId, phase, subagentsByParent }
 *         — só `ids` exprime a pertença ao catálogo do host; `byId` junta linhas
 *           locais de gerações vivas (aqui aproveitadas só para subagentes).
 *       SessionSummary   { id, title?, displayTitle, cwd?, parentId?, origin?: 'subagent',
 *                          running, blank, updatedAt, projectionValues? }
 *       projectionValues (Partial<SessionProjectionMap>, last-wins):
 *         tokenUsage      { uncachedInputTokens, outputTokens, cacheReadTokens,
 *                           cacheWriteTokens }          (acumulado)
 *         contextPressure { pressureTokens?, projectedTokens?, contextWindow? }
 *         modelSelection  { lastUsed: {provider, model}|null, next? }
 *       subagentsByParent[pai].entries : SubagentListEntry
 *         { kind: 'child', id, activity: 'running'|'inactive', label? } | { kind: 'diagnostic' }
 *
 *   WORKSPACES — packages/api/workspace-controller/src/client/{service,model}.ts (IWorkspaces)
 *     ctx.get('workspaces').list : { items: WorkspaceView[], archivedSessionIds, phase }
 *       WorkspaceView { workspaceId, path, title, sessionIds (ordem manual) }
 *     A pertença de uma sessão vem SÓ de `sessionIds` (como o owningGroupKey do
 *     ui-workspace); o que nenhum workspace reclama fica "Ungrouped".
 *     Lido SEM `inject`: no Cordis do DSH toda a dependência declarada é obrigatória
 *     e um serviço ausente deixa a entrada 'pending' — o boot web aborta e a UI
 *     inteira não monta. `ctx.get` lê o serviço sem bloquear a ativação; a ligação é
 *     tardia (o serviço pode ativar depois do plugin) e, sem ele, a sala agrupa as
 *     sessões por pasta (cwd).
 *
 * O contrato do BUNDLE (vocabulário §1) recebe DELTAS em `usage` (o estado soma),
 * por isso este módulo diffa snapshots sucessivos e emite:
 *
 *   session/added   {sessionId, title?, cwd?, parentId?, subagent, blank, model?}
 *   session/meta    {sessionId, title?, cwd?, parentId?, subagent, blank} — só em mudança
 *   session/removed {sessionId}
 *   workspaces      {fonte: 'dsh'|'nenhuma', items: [{id, title, path, sessionIds}], archived}
 *   subagent/start|end {sessionId: pai, childId, runId: childId}
 *                   — só subagentes (origin 'subagent') A CORRER: o catálogo guarda
 *                     os terminados, que não são delegação em curso
 *   status {sessionId, status: 'running'|'idle'}               — só em mudança
 *   usage  {sessionId, model?, uncachedInput, output, cacheRead, cacheWrite}
 *          — 1.º vislumbre emite o ACUMULADO (custo estimado total visível);
 *            depois, só deltas positivos (anti-dupla-contagem por sessão).
 *   model  {sessionId, model?, contextWindow?}
 *   ctx    {sessionId, used, window?}                          — projected ?? pressure
 *
 * Velocidade de tokens: calculada aqui (o estado é puro e sem relógio) SÓ dentro
 * do turno — os tokens de `output` do turno a dividir pelo tempo desde que ele
 * começou (status → running) até à última atualização de usage; o tempo parado
 * antes do turno não conta. `velocidadeDe(id)` devolve tok/s enquanto a sessão
 * corre e null fora do turno (nunca fica presa a quem já está parado).
 *
 * Honestidade: nada é inventado. Sem canal (`ctx.sessions` ausente) devolve-se
 * `null` e o painel diz "à espera do host"; sem projeções, os campos ficam
 * indisponíveis ("—" / "custo —"), nunca zero.
 */

/** Preços estimados: USD por token (tabela NOSSA — o DSH não publica preços). */
export const PRECOS_USD_POR_TOKEN = {
  'deepseek-chat': { input: 2.7e-7, output: 1.1e-6, cacheRead: 2.7e-8, cacheWrite: 2.7e-7 },
  'deepseek-reasoner': { input: 5.5e-7, output: 2.19e-6, cacheRead: 5.5e-8, cacheWrite: 5.5e-7 },
  'mimo-v2.6-pro': { input: 6e-7, output: 2.4e-6, cacheRead: 6e-8, cacheWrite: 6e-7 },
};

/** Limiar humano de aviso de contexto (features futuras: >200k). */
export const LIMIAR_CTX = 200000;

/** Resolve o preço por modelo: chave exata e, na falta, por inclusão
 *  (ids reais passam por namespaces, ex. "openrouter/xiaomi/mimo-v2.6-pro"). */
export function precoDe(precos, modelo) {
  if (!precos || !modelo) return undefined;
  const direto = precos instanceof Map ? precos.get(modelo) : precos[modelo];
  if (direto) return direto;
  const alvo = String(modelo);
  const entradas = precos instanceof Map ? [...precos] : Object.entries(precos ?? {});
  for (const [chave, preco] of entradas) {
    if (chave && alvo.includes(chave)) return preco;
  }
  return undefined;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* Diagnóstico para leitura headless (window.__wgSnap, mesmo padrão de __wgDiag). */
function diagnostico(chave, valor) {
  try {
    if (typeof window !== 'undefined' && window) window[chave] = valor;
  } catch { /* sem window */ }
}

/** Lê um serviço do contexto Cordis SEM o exigir no inject: `ctx.get` não bloqueia
 *  a ativação e devolve undefined quando o serviço não existe ou ainda não está
 *  ativo. Objetos simples (testes) caem no acesso direto à propriedade — num
 *  contexto Cordis real essa via nunca é usada para serviços não declarados. */
export function servicoDe(ctx, nome) {
  if (!ctx || (typeof ctx !== 'object' && typeof ctx !== 'function')) return null;
  try {
    if (typeof ctx.get === 'function') return ctx.get(nome) ?? null;
    if (ctx.reflect && typeof ctx.reflect.get === 'function') return ctx.reflect.get(nome) ?? null;
    return ctx[nome] ?? null;
  } catch {
    return null; /* serviço indisponível: falha silenciosa, sem rebentar o apply */
  }
}

/* Normaliza uma linha do catálogo (SessionSummary ou SubagentListEntry) num
 * resumo mínimo. Nomes de campo variam entre linhas do DSH: feature-detected,
 * sem inventar. Entradas de diagnóstico do catálogo de filhos são ignoradas. */
function normalizarLinha(bruto, parentIdForcado) {
  if (!bruto || typeof bruto !== 'object') return null;
  if (bruto.kind === 'diagnostic') return null;
  const id = bruto.id ?? bruto.sessionId;
  if (id == null || id === '') return null;
  const titulo = [bruto.displayTitle, bruto.title, bruto.label]
    .find((t) => typeof t === 'string' && t.trim());
  return {
    id: String(id),
    displayTitle: titulo ? titulo.trim() : null,
    running: bruto.running === true || bruto.activity === 'running',
    parentId: parentIdForcado ?? (bruto.parentId != null ? String(bruto.parentId) : null),
    /* subagente = origem declarada ou listado num catálogo de filhos; um fork
       também tem parentId mas é uma conversa normal (visível na barra do DSH) */
    subagente: bruto.origin === 'subagent' || parentIdForcado != null,
    blank: bruto.blank === true,
    cwd: typeof bruto.cwd === 'string' && bruto.cwd ? bruto.cwd : null,
    projectionValues: bruto.projectionValues && typeof bruto.projectionValues === 'object'
      ? bruto.projectionValues
      : null,
  };
}

/* Linhas de um snapshot: o catálogo do host (ordem de `ids`), as linhas locais
 * de subagentes vivos e os catálogos de filhos por pai — fundidas por id. */
export function linhasDoSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return [];
  const byId = snap.byId && typeof snap.byId === 'object' ? snap.byId : {};
  const ordem = Array.isArray(snap.ids) ? snap.ids : Object.keys(byId);
  const linhas = new Map();
  const juntar = (linha) => {
    if (!linha) return;
    const antes = linhas.get(linha.id);
    if (!antes) {
      linhas.set(linha.id, linha);
      return;
    }
    linhas.set(linha.id, {
      ...antes,
      displayTitle: antes.displayTitle ?? linha.displayTitle,
      running: antes.running || linha.running,
      parentId: antes.parentId ?? linha.parentId,
      subagente: antes.subagente || linha.subagente,
      cwd: antes.cwd ?? linha.cwd,
      projectionValues: antes.projectionValues ?? linha.projectionValues,
    });
  };
  for (const id of ordem) juntar(normalizarLinha(byId[id] ?? null, null));
  for (const [id, bruto] of Object.entries(byId)) {
    if (!linhas.has(String(id)) && bruto && bruto.origin === 'subagent') juntar(normalizarLinha(bruto, null));
  }
  const sub = snap.subagentsByParent && typeof snap.subagentsByParent === 'object'
    ? snap.subagentsByParent
    : {};
  for (const [pai, catalogo] of Object.entries(sub)) {
    const entradas = Array.isArray(catalogo) ? catalogo
      : (catalogo && Array.isArray(catalogo.entries) ? catalogo.entries : []);
    for (const bruto of entradas) juntar(normalizarLinha(bruto, String(pai)));
  }
  return [...linhas.values()];
}

function nomeDaPasta(caminho) {
  const partes = String(caminho ?? '').split(/[\\/]/).filter(Boolean);
  return partes.length ? partes[partes.length - 1] : null;
}

/** Snapshot de IWorkspaces → evento `workspaces` (null enquanto a baseline não
 *  chegou ou quando o serviço falhou sem dados: a sala mantém o agrupamento por
 *  pasta em vez de despejar tudo em "Sem workspace"). */
export function workspacesDoSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return null;
  if (snap.phase === 'pending') return null;
  const items = Array.isArray(snap.items) ? snap.items : [];
  if (snap.state === 'error' && items.length === 0) return null;
  return {
    type: 'workspaces',
    fonte: 'dsh',
    items: items.filter((w) => w && w.workspaceId != null).map((w) => ({
      id: String(w.workspaceId),
      title: typeof w.title === 'string' && w.title.trim()
        ? w.title.trim()
        : (nomeDaPasta(w.path) ?? String(w.workspaceId)),
      path: typeof w.path === 'string' ? w.path : '',
      sessionIds: Array.isArray(w.sessionIds) ? w.sessionIds.map(String) : [],
    })),
    archived: Array.isArray(snap.archivedSessionIds) ? snap.archivedSessionIds.map(String) : [],
  };
}

function modeloDaLinha(linha) {
  const sel = linha?.projectionValues?.modelSelection;
  const m = sel?.lastUsed?.model ?? sel?.next?.model ?? null;
  return typeof m === 'string' && m ? m : (typeof sel?.model === 'string' && sel.model ? sel.model : null);
}

function bucketsDaLinha(linha) {
  const tu = linha?.projectionValues?.tokenUsage;
  if (!tu || typeof tu !== 'object') return null;
  return {
    uncachedInput: num(tu.uncachedInputTokens),
    output: num(tu.outputTokens),
    cacheRead: num(tu.cacheReadTokens),
    cacheWrite: num(tu.cacheWriteTokens),
  };
}

function pressaoDaLinha(linha) {
  const cp = linha?.projectionValues?.contextPressure;
  if (!cp || typeof cp !== 'object') return null;
  const janela = Number.isFinite(Number(cp.contextWindow)) ? Number(cp.contextWindow) : null;
  const usado = Number.isFinite(Number(cp.projectedTokens)) ? Number(cp.projectedTokens)
    : (Number.isFinite(Number(cp.pressureTokens)) ? Number(cp.pressureTokens) : null);
  return { usado, janela };
}

const metaDaLinha = (l) => ({
  title: l.displayTitle ?? undefined,
  cwd: l.cwd ?? undefined,
  parentId: l.parentId ?? undefined,
  subagent: l.subagente,
  blank: l.blank,
});

/**
 * Extrai a superfície real do runtime do browser.
 * @param {object} ctx contexto Cordis do client module (ctx.sessions; ctx.get('workspaces'))
 * @param {{ agora?: () => number, intervaloWorkspaces?: number }} opts relógio injetável
 *   (testes determinísticos) e intervalo da ligação tardia aos workspaces (0 = sem sondagem)
 * @returns {null | { catalogo(): Array, assinar(fn): function, velocidadeDe(id): (number|null) }}
 */
export function extrairSuperficie(ctx, opts = {}) {
  const agora = typeof opts.agora === 'function' ? opts.agora : () => Date.now();
  const intervaloWs = Number.isFinite(opts.intervaloWorkspaces) ? opts.intervaloWorkspaces : 1000;
  let servico = null;
  try {
    servico = (ctx && ctx.sessions) || null; /* declarado no inject: acesso direto */
  } catch {
    servico = null;
  }
  if (!servico) servico = servicoDe(ctx, 'sessions');
  const list = servico && servico.list;
  if (!list || typeof list.getSnapshot !== 'function') return null;

  diagnostico('__wgSnap', 'superficie:ok');
  const ler = () => {
    try { return list.getSnapshot(); } catch (erro) {
      diagnostico('__wgSnapErr', String(erro && (erro.message || erro)).slice(0, 200));
      return null;
    }
  };

  /* catálogo atual (semente do adaptador) */
  const catalogo = () => linhasDoSnapshot(ler()).map((l) => ({
    id: l.id, model: modeloDaLinha(l) ?? undefined, ...metaDaLinha(l),
  }));

  /* ── workspaces: ligação opcional e tardia ─────────────────────────── */
  const SEM_WORKSPACES = { type: 'workspaces', fonte: 'nenhuma', items: [], archived: [] };
  let wsList = null;        /* modelo ligado (ctx.get('workspaces').list — objeto estável) */
  let wsSoltar = null;      /* unsubscribe do modelo */
  let wsAssinatura = JSON.stringify(SEM_WORKSPACES);
  let wsContagem = null;    /* nº de workspaces na última emissão (diagnóstico) */
  let resumoSessoes = null; /* contagens do último snapshot de sessões (diagnóstico) */
  const escreverDiagnostico = () => {
    diagnostico('__wgSnap', JSON.stringify({ ...(resumoSessoes ?? {}), ws: wsContagem }));
  };

  const emitirWorkspaces = (emitir) => {
    let evento = null;
    if (wsList) {
      try { evento = workspacesDoSnapshot(wsList.getSnapshot()); } catch { evento = null; }
    }
    const final = evento ?? SEM_WORKSPACES;
    const assinatura = JSON.stringify(final);
    if (assinatura === wsAssinatura) return;
    wsAssinatura = assinatura;
    wsContagem = evento ? evento.items.length : null;
    escreverDiagnostico();
    emitir(final);
  };

  const ligarWorkspaces = (emitir) => {
    const servicoWs = servicoDe(ctx, 'workspaces');
    const novo = servicoWs && servicoWs.list && typeof servicoWs.list.getSnapshot === 'function'
      ? servicoWs.list : null;
    if (novo !== wsList) {
      if (wsSoltar) { try { wsSoltar(); } catch { /* já solto */ } }
      wsSoltar = null;
      wsList = novo;
      if (wsList && typeof wsList.subscribe === 'function') {
        try {
          const soltar = wsList.subscribe(() => emitirWorkspaces(emitir));
          wsSoltar = typeof soltar === 'function' ? soltar : null;
        } catch { wsSoltar = null; }
      }
    }
    emitirWorkspaces(emitir);
    return wsList !== null;
  };

  /* estado anterior por sessão para diff (só muda o que mudou) */
  const anterior = new Map();      // id -> { running, usage, modelo, janela, usado, meta, paiAtivo }
  const velocidades = new Map();   // id -> { inicio, saida, v } — só do turno EM CURSO

  /* velocidade: um registo por turno (criado quando a sessão passa a correr,
     apagado quando pára) — sem turno, nada conta e velocidadeDe dá null */
  const comecarTurno = (id) => { velocidades.set(id, { inicio: agora(), saida: 0, v: null }); };
  const acabarTurno = (id) => { velocidades.delete(id); };
  const rastrearVelocidade = (id, deltaSaida) => {
    const reg = velocidades.get(id);
    const d = Math.max(0, num(deltaSaida));
    if (!reg || !d) return;
    reg.saida += d;
    reg.v = reg.saida / (Math.max(250, agora() - reg.inicio) / 1000);
  };

  const difs = (emitir) => {
    const snap = ler();
    if (!snap) return;
    const linhas = linhasDoSnapshot(snap);
    resumoSessoes = {
      n: linhas.length,
      fase: snap.phase ?? null,
      ids: Array.isArray(snap.ids) ? snap.ids.length : null,
      byId: snap.byId ? Object.keys(snap.byId).length : 0,
      sub: snap.subagentsByParent ? Object.keys(snap.subagentsByParent).length : 0,
      raizes: linhas.filter((l) => !l.subagente && !l.blank).length,
    };
    escreverDiagnostico();
    const atuais = new Map(linhas.map((l) => [l.id, l]));

    /* baixas: primeiro subagent/end (se delegava), depois session/removed */
    for (const [id, antes] of [...anterior]) {
      if (atuais.has(id)) continue;
      anterior.delete(id);
      velocidades.delete(id);
      if (antes.paiAtivo) {
        emitir({ type: 'subagent/end', sessionId: antes.paiAtivo, childId: id, runId: id });
      }
      emitir({ type: 'session/removed', sessionId: id });
    }

    for (const [id, linha] of atuais) {
      const meta = metaDaLinha(linha);
      const assinaturaMeta = JSON.stringify(meta);
      let antes = anterior.get(id);
      if (!antes) {
        antes = {
          running: null, usage: null, modelo: null, janela: null, usado: null,
          meta: assinaturaMeta, paiAtivo: null,
        };
        anterior.set(id, antes);
        emitir({ type: 'session/added', sessionId: id, model: modeloDaLinha(linha) ?? undefined, ...meta });
      } else if (antes.meta !== assinaturaMeta) {
        /* título gerado depois do 1.º turno, pasta, fim do "em branco"… */
        antes.meta = assinaturaMeta;
        emitir({ type: 'session/meta', sessionId: id, ...meta });
      }

      /* estado de execução — só em mudança */
      const aCorrer = linha.running === true;
      if (antes.running !== aCorrer) {
        antes.running = aCorrer;
        if (aCorrer) comecarTurno(id); else acabarTurno(id);
        emitir({ type: 'status', sessionId: id, status: aCorrer ? 'running' : 'idle' });
      }

      /* delegação em curso: subagente a correr, pareado com o pai */
      const pai = linha.subagente && aCorrer && linha.parentId ? linha.parentId : null;
      if (pai !== antes.paiAtivo) {
        if (antes.paiAtivo) emitir({ type: 'subagent/end', sessionId: antes.paiAtivo, childId: id, runId: id });
        if (pai) emitir({ type: 'subagent/start', sessionId: pai, childId: id, runId: id });
        antes.paiAtivo = pai;
      }

      /* modelo + janela */
      const modelo = modeloDaLinha(linha);
      const pressao = pressaoDaLinha(linha);
      const janela = pressao ? pressao.janela : null;
      if (modelo !== antes.modelo || janela !== antes.janela) {
        antes.modelo = modelo;
        antes.janela = janela;
        emitir({
          type: 'model', sessionId: id,
          model: modelo ?? undefined,
          contextWindow: janela ?? undefined,
        });
      }
      const usado = pressao ? pressao.usado : null;
      if (usado !== null && usado !== antes.usado) {
        antes.usado = usado;
        emitir({ type: 'ctx', sessionId: id, used: usado, window: janela ?? undefined });
      }

      /* usage: 1.º vislumbre emite o acumulado; depois, deltas positivos */
      const atual = bucketsDaLinha(linha);
      const prev = antes.usage;
      if (atual) {
        if (!prev) {
          antes.usage = atual;
          if (atual.uncachedInput || atual.output || atual.cacheRead || atual.cacheWrite) {
            /* o acumulado do 1.º vislumbre não é velocidade (não se sabe quando foi produzido) */
            emitir({
              type: 'usage', sessionId: id, model: modelo ?? undefined,
              uncachedInput: atual.uncachedInput, output: atual.output,
              cacheRead: atual.cacheRead, cacheWrite: atual.cacheWrite,
            });
          }
        } else if (
          prev.uncachedInput !== atual.uncachedInput || prev.output !== atual.output
          || prev.cacheRead !== atual.cacheRead || prev.cacheWrite !== atual.cacheWrite
        ) {
          const delta = {
            uncachedInput: Math.max(0, atual.uncachedInput - prev.uncachedInput),
            output: Math.max(0, atual.output - prev.output),
            cacheRead: Math.max(0, atual.cacheRead - prev.cacheRead),
            cacheWrite: Math.max(0, atual.cacheWrite - prev.cacheWrite),
          };
          antes.usage = atual;
          rastrearVelocidade(id, delta.output);
          emitir({ type: 'usage', sessionId: id, model: modelo ?? undefined, ...delta });
        }
      }
    }
  };

  return {
    catalogo,
    /** Subscreve sessões e workspaces; devolve SEMPRE a função de libertação. */
    assinar(emitir) {
      if (typeof emitir !== 'function') return null;
      const soltas = [];
      difs(emitir); /* vislumbre imediato do que já existe */
      ligarWorkspaces(emitir);
      if (typeof list.subscribe === 'function') {
        try {
          const soltar = list.subscribe(() => {
            difs(emitir);
            ligarWorkspaces(emitir); /* religa se o serviço de workspaces apareceu/mudou */
          });
          if (typeof soltar === 'function') soltas.push(soltar);
        } catch { /* sem subscrição: fica o vislumbre inicial */ }
      }
      /* ligação tardia: o serviço de workspaces pode ativar depois do plugin */
      let relogio = null;
      if (wsList === null && intervaloWs > 0 && typeof setInterval === 'function') {
        let tentativas = 0;
        relogio = setInterval(() => {
          tentativas += 1;
          if (ligarWorkspaces(emitir) || tentativas >= 60) {
            clearInterval(relogio);
            relogio = null;
          }
        }, intervaloWs);
        relogio?.unref?.(); /* Node: não segura o processo (no browser é um número) */
      }
      return () => {
        for (const soltar of soltas.splice(0)) { try { soltar(); } catch { /* já solto */ } }
        if (relogio !== null) { clearInterval(relogio); relogio = null; }
        if (wsSoltar) { try { wsSoltar(); } catch { /* já solto */ } }
        wsSoltar = null;
        wsList = null;
      };
    },
    /** tok/s do turno em curso (só enquanto corre); null fora do turno ou sem produção. */
    velocidadeDe(id) {
      const reg = velocidades.get(String(id));
      return reg && reg.v !== null && reg.v >= 1 ? Math.round(reg.v) : null;
    },
  };
}
