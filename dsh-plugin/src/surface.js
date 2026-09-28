/*
 * dsh-plugin/src/surface.js — ponte REAL do DSH (browser) para eventos normalizados §1.
 *
 * É o único ponto que lê o runtime do browser do DSH. Superfície verificada no
 * checkout deepseek-harness (0.1.6-alpha.2) — packages/api/session-controller/
 * src/client/contract/sessions.ts (ISessions) e src/client/sessions/service.ts:
 *
 *   ctx.sessions (ou ctx.reflect.get('sessions'))
 *     .list : ObservableSnapshot<SessionListState>   // getSnapshot() + subscribe(fn)
 *       SessionListState { ids, byId: Record<id, SessionSummary>, subagentsByParent }
 *       SessionSummary   { id, displayTitle, cwd?, parentId?, origin?, running,
 *                          updatedAt, projectionValues? }
 *       projectionValues (Partial<SessionProjectionMap>, last-wins):
 *         tokenUsage      { uncachedInputTokens, outputTokens, cacheReadTokens,
 *                           cacheWriteTokens }          (acumulado)
 *         contextPressure { pressureTokens?, projectedTokens?, contextWindow? }
 *         modelSelection  { lastUsed: {provider, model}|null, next? }
 *       subagentsByParent[parent].entries : SubagentListEntry[]  (id/sessionId)
 *
 * O contrato do BUNDLE (vocabulário §1) recebe DELTAS em `usage` (o estado soma),
 * por isso este módulo diffa snapshots sucessivos e emite:
 *
 *   session/added {sessionId, model?, name?, teamId?}  — idempotente no estado
 *   session/removed {sessionId}
 *   subagent/start|end {sessionId: parent, childId, runId: childId}
 *   status {sessionId, status: 'running'|'idle'}        — só em mudança
 *   usage {sessionId, model?, uncachedInput, output, cacheRead, cacheWrite}
 *         — 1.º vislumbre emite o ACUMULADO (custo estimado total visível);
 *           depois, só deltas positivos (anti-dupla-contagem por sessão).
 *   model {sessionId, model?, contextWindow?}
 *   ctx {sessionId, used, window?}                      — projected ?? pressure
 *
 * Velocidade de tokens: calculada aqui (o estado é puro e sem relógio) a partir
 * dos deltas de `output` sobre o tempo — `velocidadeDe(id)` devolve tok/s ou null.
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
  const direto = precos.get ? precos.get(modelo) : precos[modelo];
  if (direto) return direto;
  const alvo = String(modelo);
  const entradas = precos instanceof Map ? [...precos] : Object.entries(precos ?? {});
  for (const [chave, preco] of entradas) {
    if (chave && alvo.includes(chave)) return preco;
  }
  return undefined;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* Normaliza uma entrada de catálogo (SessionSummary ou SubagentListEntry)
 * num resumo mínimo {id, displayTitle, running, parentId, cwd, projectionValues}.
 * Nomes de campo variam entre linhas do DSH: feature-detected, sem inventar. */
function normalizarLinha(bruto, parentIdForcado) {
  if (!bruto || typeof bruto !== 'object') return null;
  const id = bruto.id ?? bruto.sessionId;
  if (id == null || id === '') return null;
  return {
    id: String(id),
    displayTitle: typeof bruto.displayTitle === 'string' && bruto.displayTitle
      ? bruto.displayTitle
      : (typeof bruto.title === 'string' && bruto.title ? bruto.title : null),
    running: bruto.running === true,
    parentId: parentIdForcado ?? (bruto.parentId != null ? String(bruto.parentId) : null),
    cwd: typeof bruto.cwd === 'string' ? bruto.cwd : null,
    projectionValues: bruto.projectionValues && typeof bruto.projectionValues === 'object'
      ? bruto.projectionValues
      : null,
  };
}

/* Linhas visíveis num snapshot: byId (raízes + filhos locais) + catálogos de
 * subagentes por pai (subagentsByParent[parent].entries). */
export function linhasDoSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return [];
  const linhas = [];
  const vistos = new Set();
  const byId = snap.byId && typeof snap.byId === 'object' ? snap.byId : {};
  for (const bruto of Object.values(byId)) {
    const linha = normalizarLinha(bruto, null);
    if (linha && !vistos.has(linha.id)) { vistos.add(linha.id); linhas.push(linha); }
  }
  const sub = snap.subagentsByParent && typeof snap.subagentsByParent === 'object'
    ? snap.subagentsByParent
    : {};
  for (const [pai, catalogo] of Object.entries(sub)) {
    const entradas = Array.isArray(catalogo) ? catalogo
      : (catalogo && Array.isArray(catalogo.entries) ? catalogo.entries : []);
    for (const bruto of entradas) {
      const linha = normalizarLinha(bruto, String(pai));
      if (linha && !vistos.has(linha.id)) { vistos.add(linha.id); linhas.push(linha); }
    }
  }
  return linhas;
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

function teamDaLinha(linha) {
  if (!linha?.cwd) return null;
  const partes = String(linha.cwd).split(/[\\/]/).filter(Boolean);
  return partes.length ? partes[partes.length - 1] : null;
}

/**
 * Extrai a superfície real do runtime do browser.
 * @param {object} ctx contexto Cordis do client module (ctx.sessions / reflect.get)
 * @param {{ agora?: () => number }} opts relógio injetável (testes determinísticos)
 * @returns {null | { catalogo(): Array, assinar(fn): (function|null), velocidadeDe(id): (number|null) }}
 */
export function extrairSuperficie(ctx, opts = {}) {
  const agora = typeof opts.agora === 'function' ? opts.agora : () => Date.now();
  let servico = null;
  try {
    servico = (ctx && ctx.sessions)
      || (ctx && ctx.reflect && typeof ctx.reflect.get === 'function' ? ctx.reflect.get('sessions') : null);
  } catch {
    servico = null; /* serviço não injetado: falha silenciosa, sem rebentar o apply */
  }
  const list = servico && servico.list;
  if (!list || typeof list.getSnapshot !== 'function') return null;

  const ler = () => {
    try { return list.getSnapshot(); } catch { return null; }
  };

  /* catálogo atual (semente do adaptador) */
  const catalogo = () => linhasDoSnapshot(ler()).map((l) => ({
    id: l.id,
    model: modeloDaLinha(l),
    name: l.displayTitle ?? undefined,
    teamId: teamDaLinha(l) ?? undefined,
  }));

  /* estado anterior por sessão para diff (só muda o que mudou) */
  const anterior = new Map();      // id -> { running, usage, modelo, janela, usado, parentId }
  const velocidades = new Map();   // id -> { saida, at, v }

  const rastrearVelocidade = (id, deltaSaida) => {
    const reg = velocidades.get(id) ?? { saida: 0, at: agora(), v: 0 };
    const t = agora();
    const dt = Math.max(250, t - reg.at) / 1000;
    const instante = Math.max(0, num(deltaSaida)) / dt;
    reg.v = reg.v ? reg.v * 0.6 + instante * 0.4 : instante;
    reg.saida += Math.max(0, num(deltaSaida));
    reg.at = t;
    velocidades.set(id, reg);
  };

  const difs = (emitir) => {
    const snap = ler();
    if (!snap) return;
    const linhas = linhasDoSnapshot(snap);
    const atuais = new Map(linhas.map((l) => [l.id, l]));

    /* baixas: primeiro subagent/end (se era filho), depois session/removed */
    for (const [id, antes] of [...anterior]) {
      if (atuais.has(id)) continue;
      anterior.delete(id);
      velocidades.delete(id);
      if (antes.parentId) {
        emitir({ type: 'subagent/end', sessionId: antes.parentId, childId: id, runId: id });
      }
      emitir({ type: 'session/removed', sessionId: id });
    }

    for (const [id, linha] of atuais) {
      let antes = anterior.get(id);
      if (!antes) {
        antes = { running: null, usage: null, modelo: null, janela: null, usado: null, parentId: null };
        anterior.set(id, antes);
        emitir({
          type: 'session/added', sessionId: id,
          model: modeloDaLinha(linha) ?? undefined,
          name: linha.displayTitle ?? undefined,
          teamId: teamDaLinha(linha) ?? undefined,
        });
      }
      /* relação pai-filho (catálogo real diz quem é subagente de quem) */
      if (linha.parentId && antes.parentId !== linha.parentId) {
        if (antes.parentId) emitir({ type: 'subagent/end', sessionId: antes.parentId, childId: id, runId: id });
        antes.parentId = linha.parentId;
        emitir({ type: 'subagent/start', sessionId: linha.parentId, childId: id, runId: id });
      }

      /* estado de execução — só em mudança */
      const aCorrer = linha.running === true;
      if (antes.running !== aCorrer) {
        antes.running = aCorrer;
        emitir({ type: 'status', sessionId: id, status: aCorrer ? 'running' : 'idle' });
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
            rastrearVelocidade(id, 0);
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
    assinar(emitir) {
      if (typeof emitir !== 'function') return null;
      difs(emitir); /* vislumbre imediato do que já existe */
      if (typeof list.subscribe !== 'function') return null;
      try {
        return list.subscribe(() => difs(emitir));
      } catch {
        return null;
      }
    },
    velocidadeDe(id) {
      const reg = velocidades.get(String(id));
      return reg && reg.v >= 1 ? Math.round(reg.v) : null;
    },
  };
}
