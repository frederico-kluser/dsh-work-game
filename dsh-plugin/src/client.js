/*
 * client.js — dsh-work-game · metade navegador do plugin DSH
 *
 * Este ficheiro É o bundle do browser: package.json aponta exports["./client"]
 * para cá e o sistema de módulos do DSH serve-o tal qual (script clássico via
 * /plugins/.../client.js). Por isso usa a forma oficial dos exemplos do DSH:
 * `window.__ModuleLoader__.load({ id, factory })`, com a face { inject, apply }
 * — a função que o runtime do browser chama é `exports.apply(ctx)`.
 *
 * Sem build e sem dependências npm: o único `require` é `react`, fornecido
 * pela seed da plataforma (o shell injeta react no module table).
 *
 * Projeção dos contratos do projeto (docs/contratos-plugin.md):
 *   §1  eventos normalizados (vocabulário fechado)
 *   §2  createOfficeState / applyEvent / personView / officeView + regras
 *       (emoji por precedência, CTX, custo por deltas, pergunta persistente,
 *       outputs com expiração ~1s, setPrices)
 *   §3  createAdapter({ onEvent, sessions, projections }) -> { start, stop }
 *   §4  renderOffice(state) -> SVG (render.js) — versão autocontida, sem
 *       depender de assets/furniture.svg (inalcançável a partir da webapp).
 *
 * Um bundle servido não consegue importar ficheiros ESM irmãos (a resolução
 * do module table só conhece seed words, linhas do grafo e chunks
 * factory-form client.*.js). Quando a integração ganhar um canal host→browser
 * (ou um passo de build), estas projeções trocam-se pelos módulos reais
 * src/state.js, src/adapter.js e src/render.js sem mudar a wiring do apply().
 */
window.__ModuleLoader__.load({
  id: 'dsh-work-game',
  factory: (require) => {
    'use strict';
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const react = require('react');
    const h = react.createElement;

    /* ================================================================
     * 1. Estado do escritório — contrato §2 (projeção browser)
     * ================================================================ */

    // Precedência de emoji (contrato §2): ❓/⚖️ > ⚠️ > 🔧/📝/🔍 > 🔄/📦/⏳ > ✅ > 💤.
    const PRECEDENCIA = {
      pergunta: 10, aprovacao: 10, erro: 8, ferramenta: 6, subagentes: 5,
      retry: 4, compactacao: 4, concluido: 2, ocioso: 0,
    };

    // Estado visual: id -> rótulo e expression Avataaars derivada.
    const ROTULOS = {
      idle: 'à espera', working: 'a trabalhar', tool: 'ferramenta',
      waiting: 'a aguardar', error: 'erro', done: 'concluído',
    };
    const EXPRESSAO = {
      idle: 'idle', working: 'working', tool: 'tool',
      waiting: 'waiting', error: 'error', done: 'success',
    };

    const nomeDe = (id) => `Agente ${String(id).slice(-5)}`;

    function criarPessoa(id, modelo) {
      return {
        id,
        name: nomeDe(id),
        avatar: null, // o painel não inventa URLs; desenha círculo com iniciais
        status: 'idle',
        emoji: '💤',
        expression: 'idle',
        ctx: null, // { used, window } | null -> UI mostra "CTX —"
        model: modelo ?? null,
        cost: null, // null -> "custo indisponível", nunca zero inventado
        question: null, // persistente até question/answered
        approvals: [],
        subagents: 0,
        outputs: [],
        flags: {
          ocioso: true, concluido: false, erro: false, ferramenta: false,
          retry: false, retryDesde: 0, compactacao: false, compactacaoDesde: 0,
        },
      };
    }

    // Regra §2: só o emoji mais relevante fica visível (o resto fica no painel).
    function emojiDa(p) {
      const f = p.flags;
      if (p.question) return { e: '❓', status: 'waiting', prioridade: PRECEDENCIA.pergunta };
      if (p.approvals.length > 0) return { e: '⚖️', status: 'waiting', prioridade: PRECEDENCIA.aprovacao };
      if (f.erro) return { e: '⚠️', status: 'error', prioridade: PRECEDENCIA.erro };
      if (f.ferramenta) return { e: '🔧', status: 'tool', prioridade: PRECEDENCIA.ferramenta };
      if (p.subagents > 0) return { e: '🤝', status: 'working', prioridade: PRECEDENCIA.subagentes };
      if (f.retry) return { e: '🔄', status: 'working', prioridade: PRECEDENCIA.retry };
      if (f.compactacao) return { e: '📦', status: 'working', prioridade: PRECEDENCIA.compactacao };
      if (f.concluido) return { e: '✅', status: 'done', prioridade: PRECEDENCIA.concluido };
      return { e: '💤', status: 'idle', prioridade: PRECEDENCIA.ocioso };
    }

    function recalcular(p) {
      const r = emojiDa(p);
      p.emoji = r.e;
      p.status = r.status;
      p.expression = EXPRESSAO[r.status];
    }

    // Outputs expiram em ~1s na UI (contrato §2); histórico limitado a 6.
    function adicionarOutput(p, kind, texto) {
      p.outputs.push({ kind, text: texto, expiraEm: Date.now() + 1000 });
      if (p.outputs.length > 6) p.outputs.shift();
    }

    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

    // Construtor do estado (contrato §2): recebe tabela de preços opcional.
    function createOfficeState(precos = {}) {
      return {
        people: new Map(), // sessionId -> pessoa
        teams: {},
        modules: [],
        alerts: [],
        precos: new Map(Object.entries(precos)),
        selecionada: null,
        setPrices(map) { this.precos = new Map(Object.entries(map ?? {})); },
      };
    }

    // Evento normalizado (vocabulário §1) -> NOVO estado (puro).
    function applyEvent(estado, evento) {
      const pessoas = new Map(estado.people);
      const p = (id) => pessoas.get(id);
      const agora = Date.now();

      switch (evento.type) {
        case 'session/added':
          if (!pessoas.has(evento.sessionId)) {
            pessoas.set(evento.sessionId, criarPessoa(evento.sessionId, evento.model));
          }
          break;
        case 'session/removed':
          pessoas.delete(evento.sessionId);
          break;
        case 'status': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          pessoa.flags.ocioso = evento.status === 'idle';
          pessoa.flags.concluido = false;
          break;
        }
        case 'turn/end': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          const kind = evento.kind;
          pessoa.flags.ocioso = true;
          if (kind === 'completed') {
            pessoa.flags.concluido = true;
            adicionarOutput(pessoa, 'result', 'turno concluído');
          } else if (kind === 'error' || kind === 'blocked' || kind === 'max-tokens') {
            pessoa.flags.erro = true;
            adicionarOutput(pessoa, 'message', kind === 'error' ? 'erro no turno' : kind === 'blocked' ? 'bloqueado' : 'máx. de tokens');
          } else {
            // aborted | interrupted
            adicionarOutput(pessoa, 'message', 'interrompido');
          }
          break;
        }
        case 'tool': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          pessoa.flags.ocioso = false;
          pessoa.flags.concluido = false;
          if (evento.phase === 'call') {
            pessoa.flags.ferramenta = true;
          } else {
            pessoa.flags.ferramenta = false;
            if (evento.ok === false) pessoa.flags.erro = true;
          }
          break;
        }
        case 'question': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          pessoa.question = evento.text ?? 'Pergunta';
          pessoa.flags.concluido = false;
          break;
        }
        case 'question/answered': {
          const pessoa = p(evento.sessionId);
          if (pessoa) pessoa.question = null;
          break;
        }
        case 'approval': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          pessoa.approvals = [...pessoa.approvals, { id: evento.id, toolName: evento.toolName ?? 'ferramenta' }];
          break;
        }
        case 'approval/decided': {
          const pessoa = p(evento.sessionId);
          if (pessoa) pessoa.approvals = pessoa.approvals.filter((a) => a.id !== evento.id);
          break;
        }
        case 'subagent/start': {
          const pessoa = p(evento.sessionId);
          if (pessoa) pessoa.subagents += 1;
          break;
        }
        case 'subagent/end': {
          const pessoa = p(evento.sessionId);
          if (pessoa) pessoa.subagents = Math.max(0, pessoa.subagents - 1);
          break;
        }
        case 'usage': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          pessoa.model = evento.model ?? pessoa.model;
          const preco = estado.precos.get(pessoa.model);
          if (!preco) {
            // Sem preço conhecido para o modelo -> custo indisponível.
            pessoa.cost = null;
            break;
          }
          const delta = num(evento.uncachedInput) * preco.input
            + num(evento.output) * preco.output
            + num(evento.cacheRead) * preco.cacheRead
            + num(evento.cacheWrite) * preco.cacheWrite;
          pessoa.cost = Math.round(((pessoa.cost ?? 0) + delta) * 10000) / 10000;
          break;
        }
        case 'model': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          pessoa.model = evento.model ?? pessoa.model;
          if (evento.contextWindow != null) {
            pessoa.ctx = { used: pessoa.ctx ? pessoa.ctx.used : null, window: evento.contextWindow };
          }
          break;
        }
        // Pressão de contexto (extensão prevista do vocabulário): used é o
        // projectedTokens ?? pressureTokens que o adaptador vier a entregar.
        case 'ctx': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          pessoa.ctx = { used: evento.used, window: evento.window ?? (pessoa.ctx ? pessoa.ctx.window : null) };
          break;
        }
        case 'retry': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          pessoa.flags.retry = true;
          pessoa.flags.retryDesde = agora;
          break;
        }
        case 'compaction': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          pessoa.flags.compactacao = evento.phase === 'start';
          pessoa.flags.compactacaoDesde = agora;
          break;
        }
        default:
          break;
      }

      for (const pessoa of pessoas.values()) recalcular(pessoa);
      return { ...estado, people: pessoas };
    }

    // Regra §2: view de apresentação pronta para a UI.
    function personView(estado, sessionId) {
      const p = estado.people.get(sessionId);
      if (!p) return null;
      return {
        id: p.id, name: p.name, avatar: p.avatar, status: p.status,
        emoji: p.emoji, expression: p.expression, ctx: p.ctx, model: p.model,
        cost: p.cost, question: p.question, approvals: p.approvals,
        subagents: p.subagents, outputs: p.outputs,
      };
    }

    function officeView(estado) {
      const people = {};
      for (const p of estado.people.values()) people[p.id] = personView(estado, p.id);
      return { people, teams: estado.teams, alerts: estado.alerts };
    }

    // Expiração (~1s) de outputs e de indicadores transitórios (retry/compacção).
    function purgar(estado, agora = Date.now()) {
      const pessoas = new Map(estado.people);
      let mudou = false;
      for (const p of pessoas.values()) {
        const antes = p.outputs.length;
        p.outputs = p.outputs.filter((o) => o.expiraEm > agora);
        if (p.outputs.length !== antes) mudou = true;
        if (p.flags.retry && agora - p.flags.retryDesde > 1000) {
          p.flags.retry = false;
          mudou = true;
        }
        if (p.flags.compactacao && agora - p.flags.compactacaoDesde > 1000) {
          p.flags.compactacao = false;
          mudou = true;
        }
        if (mudou) recalcular(p);
      }
      return mudou ? { ...estado, people: pessoas } : estado;
    }

    /* ================================================================
     * 2. Adaptador — contrato §3 (projeção browser)
     * ================================================================ */

    // createAdapter({ onEvent, sessions, projections }) -> { start, stop }.
    // O transporte real host->browser pluga-se em start() (abaixo, o ponto de
    // assinatura). Sem canal, o painel mostra "telemetria indisponível" —
    // nunca inventa sessões nem eventos.
    function createAdapter({ onEvent, sessions = [], projections = {} }) {
      let ativo = false;
      const limpeza = [];
      return {
        start() {
          if (ativo) return;
          ativo = true;
          // Semente inicial a partir do catálogo de sessões fornecido.
          for (const sessao of sessions) {
            onEvent({ type: 'session/added', sessionId: sessao.id, model: sessao.model });
          }
          // Ponto de assinatura do transporte real (eventos/projeções):
          // assinaturas entram em `limpeza` para o stop() as libertar.
          void projections;
        },
        stop() {
          if (!ativo) return;
          ativo = false;
          for (const liberar of limpeza.splice(0)) liberar();
        },
      };
    }

    /* ================================================================
     * 3. Renderização — contrato render.js (projeção browser)
     * ================================================================ */

    const PASSO_LUGAR = 225;   // distância entre centros de lugares vizinhos
    const LARGURA_MESA = 900;  // largura do tampo
    const Y_MESA = 216;        // topo do tampo da mesa
    const Y_CARTAO = 290;      // topo da ficha sob a mesa
    const ALTURA_LINHA = 880;  // pitch vertical entre linhas da grade
    const COLUNAS = 3;

    const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

    // Formatação partilhada entre o render e o rodapé do painel.
    function formatoCtx(ctx) {
      if (!ctx || !Number.isFinite(ctx.window) || ctx.window <= 0) {
        return { texto: 'CTX —', largura: 0 };
      }
      const pct = Math.round((num(ctx.used) / ctx.window) * 100);
      return { texto: `CTX ~${Math.min(999, pct)}%`, largura: Math.max(2, Math.min(160, pct * 1.6)) };
    }

    function formatoCusto(custo) {
      return typeof custo === 'number' && Number.isFinite(custo)
        ? `US$ ${custo.toFixed(2).replace('.', ',')}`
        : 'custo —';
    }

    function nomeModelo(m) {
      if (!m) return 'modelo —';
      return String(typeof m === 'string' ? m : (m.model ?? m.provider ?? '')).slice(0, 18);
    }

    // Distribui pessoas por mesas de 4 lugares, agrupadas por equipa.
    function gerarModulos(pessoas) {
      const porEquipa = new Map();
      for (const p of pessoas) {
        const equipa = p.teamId ?? 'geral';
        if (!porEquipa.has(equipa)) porEquipa.set(equipa, []);
        porEquipa.get(equipa).push(p.id);
      }
      const modulos = [];
      let n = 0;
      for (const [equipa, ids] of porEquipa) {
        for (let i = 0; i < ids.length; i += 4) {
          modulos.push({
            id: `mesa-${n}`,
            teamId: equipa,
            kind: i === 0 ? 'main' : 'expansion',
            seats: Array.from({ length: 4 }, (_, k) => ids[i + k] ?? null),
          });
          n += 1;
        }
      }
      return modulos;
    }

    // Balão persistente de pergunta (features futuras nº 1), 2 linhas máx.
    function balao(cx, pergunta) {
      const texto = String(pergunta ?? '').replace(/\s+/g, ' ').trim() || 'Pergunta';
      const linhas = [];
      let resto = texto;
      while (resto.length > 26 && linhas.length < 1) {
        const corte = resto.lastIndexOf(' ', 26);
        linhas.push(resto.slice(0, corte > 0 ? corte : 26));
        resto = resto.slice(corte > 0 ? corte : 26).trim();
      }
      if (resto.length > 26) resto = `${resto.slice(0, 25)}…`;
      linhas.push(resto);
      const largura = 220;
      const x = cx - largura / 2;
      return [
        `<g class="wg-balao" role="note" aria-label="pergunta: ${esc(texto)}">`,
        `<rect x="${x}" y="2" width="${largura}" height="${12 + linhas.length * 18}" rx="10" fill="#fffdf4" stroke="#d8b25c" stroke-width="1.5"/>`,
        linhas.map((l, i) =>
          `<text x="${cx}" y="${20 + i * 18}" text-anchor="middle" font-size="13" fill="#4a4332">${esc(l)}</text>`).join(''),
        '</g>',
      ].join('');
    }

    // Pessoa: balão (se perguntar), emoji sobre a cabeça e avatar.
    function renderPessoa(p, cx, selecionada) {
      const nome = p.name ?? 'Pessoa';
      const estado = `${p.emoji} ${ROTULOS[p.status] ?? p.status ?? '—'}`;
      const anel = selecionada
        ? `<circle class="wg-anel" cx="${cx}" cy="150" r="47" fill="none" stroke="#f2a20c" stroke-width="3.5"/>`
        : '';
      return [
        `<g class="wg-pessoa" role="img" aria-label="${esc(nome)}: ${esc(estado)}" data-session-id="${esc(p.id)}">`,
        p.question ? balao(cx, p.question) : '',
        `<text x="${cx}" y="96" text-anchor="middle" font-size="26">${p.emoji}<title>${esc(estado)}</title></text>`,
        anel,
        p.avatar
          ? `<image href="${esc(p.avatar)}" x="${cx - 40}" y="112" width="80" height="80" preserveAspectRatio="xMidYMax meet"/>`
          : `<circle cx="${cx}" cy="150" r="40" fill="#2e5a86" stroke="#1d3a55" stroke-width="2"/>` +
            `<text x="${cx}" y="158" text-anchor="middle" font-size="20" fill="#f4f7fa">${esc(iniciais(nome))}</text>`,
        '</g>',
      ].join('');
    }

    const iniciais = (nome) => {
      const sigla = String(nome ?? '').trim().split(/\s+/).slice(0, 2)
        .map((p) => p[0] ?? '').join('');
      return (sigla || '?').toUpperCase();
    };

    // Ficha do lugar: nome, estado, chips de modelo/custo e barra CTX.
    function renderFicha(p, cx) {
      const ctx = formatoCtx(p.ctx);
      return [
        '<g class="wg-ficha">',
        `<rect x="${cx - 99}" y="${Y_CARTAO}" width="198" height="114" rx="10" fill="#fbfaf4" stroke="#d8dbcf" stroke-width="1.5"/>`,
        `<text x="${cx}" y="${Y_CARTAO + 22}" text-anchor="middle" font-size="15" font-weight="600" fill="#23272b">${esc(p.name ?? 'Lugar')}</text>`,
        `<text x="${cx}" y="${Y_CARTAO + 41}" text-anchor="middle" font-size="12" fill="#64707c">${p.emoji} ${esc(ROTULOS[p.status] ?? '—')}</text>`,
        `<rect x="${cx - 93}" y="${Y_CARTAO + 50}" width="88" height="22" rx="11" fill="#eef1f5"/>`,
        `<text x="${cx - 49}" y="${Y_CARTAO + 65}" text-anchor="middle" font-size="11" fill="#3d4854">${esc(nomeModelo(p.model))}</text>`,
        `<rect x="${cx + 5}" y="${Y_CARTAO + 50}" width="88" height="22" rx="11" fill="#e9f2ea"/>`,
        `<text x="${cx + 49}" y="${Y_CARTAO + 65}" text-anchor="middle" font-size="11" fill="#2f5d36">${esc(formatoCusto(p.cost))}</text>`,
        `<rect x="${cx - 85}" y="${Y_CARTAO + 82}" width="170" height="5" rx="2.5" fill="#e3e6ea"/>`,
        ctx.largura ? `<rect x="${cx - 85}" y="${Y_CARTAO + 82}" width="${ctx.largura}" height="5" rx="2.5" fill="#4a90d9"/>` : '',
        `<text x="${cx}" y="${Y_CARTAO + 102}" text-anchor="middle" font-size="11" fill="#8b958e">${ctx.texto}</text>`,
        '</g>',
      ].join('');
    }

    function renderLugar(mod, i, pessoas, selecionada) {
      const cx = 112.5 + i * PASSO_LUGAR;
      const ocupante = mod.seats[i];
      const saida = [`<ellipse cx="${cx}" cy="196" rx="72" ry="26" fill="#8a5a33" opacity="0.85"/>`];
      if (typeof ocupante === 'string' && ocupante !== 'reserved' && pessoas[ocupante]) {
        saida.push(renderPessoa(pessoas[ocupante], cx, selecionada === ocupante));
      } else {
        saida.push(`<text x="${cx}" y="206" text-anchor="middle" font-size="13" fill="#aeb7b3">${ocupante === 'reserved' ? 'Reservado' : 'Lugar livre'}</text>`);
      }
      return saida.join('');
    }

    function renderModulo(mod, pessoas, selecionada) {
      const nomeEquipa = mod.teamId ?? 'Equipa';
      const ocupados = mod.seats.filter((s) => typeof s === 'string' && s !== 'reserved').length;
      const comPessoa = (i) => {
        const s = mod.seats[i];
        return typeof s === 'string' && s !== 'reserved' && pessoas[s];
      };
      return [
        `<g class="wg-modulo" data-module-id="${esc(mod.id ?? '')}" data-team-id="${esc(mod.teamId ?? '')}">`,
        mod.seats.map((_, i) => renderLugar(mod, i, pessoas, selecionada)).join(''),
        // Tampo e pernas da mesa (mobiliário autocontido).
        `<rect x="0" y="${Y_MESA}" width="${LARGURA_MESA}" height="38" rx="6" fill="#2869a6" stroke="#1d4a75" stroke-width="2"/>`,
        `<rect x="36" y="${Y_MESA + 38}" width="26" height="72" fill="#1d4a75"/>`,
        `<rect x="${LARGURA_MESA - 62}" y="${Y_MESA + 38}" width="26" height="72" fill="#1d4a75"/>`,
        // Portáteis no tampo, um por ocupante.
        mod.seats.map((_, i) => comPessoa(i)
          ? `<rect x="${112.5 + i * PASSO_LUGAR - 44}" y="${Y_MESA + 8}" width="88" height="20" rx="4" fill="#d8dbe0" stroke="#aab2ba"/>`
          : '').join(''),
        `<text x="28" y="${Y_MESA + 26}" font-size="17" font-weight="600" fill="#f4f0e6">${esc(nomeEquipa)}</text>`,
        `<text x="872" y="${Y_MESA + 26}" text-anchor="end" font-size="13" fill="#d5e2ee">${ocupados} de 4</text>`,
        mod.seats.map((_, i) => comPessoa(i) ? renderFicha(pessoas[mod.seats[i]], 112.5 + i * PASSO_LUGAR) : '').join(''),
        '</g>',
      ].join('');
    }

    // renderOffice(state) -> markup SVG do escritório (contrato render.js).
    function renderOffice(state = {}) {
      const bruto = state.people instanceof Map
        ? [...state.people.values()]
        : Object.values(state.people ?? {});
      const pessoas = Object.fromEntries(bruto.map((p) => [p.id, p]));
      const modulos = Array.isArray(state.modules) && state.modules.length > 0
        ? state.modules
        : gerarModulos(bruto);
      const selecionada = state.selecionada ?? null;

      if (modulos.length === 0) {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2700 880" class="wg-escritorio" '
          + 'role="img" aria-label="Escritório de agentes">'
          + '<text x="1350" y="440" text-anchor="middle" font-size="22" fill="#8b958e">'
          + 'Escritório vazio — à espera de telemetria</text></svg>';
      }

      const linhasConteudo = [];
      const totalLinhas = Math.ceil(modulos.length / COLUNAS);
      for (let r = 0; r < totalLinhas; r += 1) {
        const linha = [];
        for (let c = 0; c < COLUNAS; c += 1) {
          const mod = modulos[r * COLUNAS + c];
          if (!mod) break;
          const x = c * LARGURA_MESA;
          const y = r * ALTURA_LINHA;
          linha.push(`<g transform="translate(${x} ${y})">${renderModulo(mod, pessoas, selecionada)}</g>`);
          if (c < COLUNAS - 1 && modulos[r * COLUNAS + c + 1]) {
            linha.push(`<rect x="${x + LARGURA_MESA - 22}" y="${y + 130}" width="44" height="140" rx="8" fill="#d8dbcf"/>`);
          }
        }
        linhasConteudo.push(linha.join(''));
      }

      const largura = COLUNAS * LARGURA_MESA;
      const altura = totalLinhas * ALTURA_LINHA;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" `
        + 'class="wg-escritorio" role="img" aria-label="Escritório de agentes">'
        + `${linhasConteudo.join('')}</svg>`;
    }

    /* ================================================================
     * 4. Componentes React (sem JSX, via createElement)
     * ================================================================ */

    const CSS_PAINEL = [
      '.wg-painel{display:flex;flex-direction:column;height:100%;min-height:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#23272b;background:#f7f5ef}',
      '.wg-toolbar{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid #e2ddd0}',
      '.wg-toolbar h1{font-size:14px;font-weight:600;margin:0 10px 0 0;white-space:nowrap}',
      '.wg-toolbar .wg-conta{font-size:12px;color:#64707c;margin-left:auto}',
      '.wg-toolbar button{min-width:30px;height:26px;border:1px solid #cfc9b8;border-radius:6px;background:#fffdf6;cursor:pointer;font-size:14px;line-height:1}',
      '.wg-toolbar button:hover{background:#f1ecdd}',
      '.wg-tela{flex:1;min-height:0;position:relative;overflow:hidden;background:#efece2;touch-action:none;cursor:grab}',
      '.wg-tela:active{cursor:grabbing}',
      '.wg-mundo{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform}',
      '.wg-svg svg{display:block;width:2700px;max-width:none}',
      '.wg-svg .wg-pessoa{cursor:pointer}',
      '.wg-banner{position:absolute;left:16px;right:16px;top:12px;padding:8px 12px;border-radius:8px;background:#fff8e1;border:1px solid #e5cf8a;color:#7a6530;font-size:13px}',
      '.wg-rodape{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid #e2ddd0;font-size:13px;min-height:36px}',
      '.wg-rodape .wg-chip{padding:2px 10px;border-radius:11px;background:#eef1f5;color:#3d4854}',
      '.wg-rodape .wg-chip-verde{background:#e9f2ea;color:#2f5d36}',
      '.wg-rodape .wg-dica{color:#8b958e;font-size:12px}',
    ].join('');

    // Painel principal: sala SVG com zoom/pan mínimos e inspeção por pessoa.
    function PainelEscritorio(props) {
      const { getView, getSelecao, subscribe, iniciar, parar, selecionar } = props;
      const [tick, setTick] = react.useState(0);
      const [camera, setCamera] = react.useState({ zoom: 0.3, x: 32, y: 64 });
      const telaRef = react.useRef(null);
      const cameraRef = react.useRef(camera);
      cameraRef.current = camera;

      // Face estável do núcleo: assina e liga o adaptador uma única vez.
      react.useEffect(() => {
        iniciar();
        const desligar = subscribe(() => setTick((t) => t + 1));
        return () => { desligar(); parar(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      // Wheel nativo (não-passivo): zoom ancorado no cursor com ctrl/meta,
      // pan simples sem modificadores.
      react.useEffect(() => {
        const tela = telaRef.current;
        if (!tela) return undefined;
        const onWheel = (e) => {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            const rect = tela.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            setCamera((c) => {
              const zoom = Math.min(1.5, Math.max(0.15, c.zoom * fator));
              const wx = (px - c.x) / c.zoom;
              const wy = (py - c.y) / c.zoom;
              return { zoom, x: px - wx * zoom, y: py - wy * zoom };
            });
          } else {
            setCamera((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
          }
        };
        tela.addEventListener('wheel', onWheel, { passive: false });
        return () => tela.removeEventListener('wheel', onWheel);
      }, []);

      const caber = () => {
        const tela = telaRef.current;
        if (!tela) return;
        const vista = getView();
        const quantos = Math.max(1, Object.keys(vista.people).length);
        const alturaBase = Math.ceil(quantos / 12) * ALTURA_LINHA;
        const zoom = Math.min(tela.clientWidth / (COLUNAS * LARGURA_MESA), tela.clientHeight / alturaBase, 1.2);
        setCamera({
          zoom,
          x: (tela.clientWidth - COLUNAS * LARGURA_MESA * zoom) / 2,
          y: (tela.clientHeight - alturaBase * zoom) / 2,
        });
      };

      const arrastar = (e) => {
        const tela = telaRef.current;
        if (!tela) return;
        tela.setPointerCapture(e.pointerId);
        const inicio = { x: e.clientX - cameraRef.current.x, y: e.clientY - cameraRef.current.y };
        const mover = (ev) => setCamera((c) => ({ ...c, x: ev.clientX - inicio.x, y: ev.clientY - inicio.y }));
        const soltar = () => {
          window.removeEventListener('pointermove', mover);
          window.removeEventListener('pointerup', soltar);
        };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
      };

      const clicar = (e) => {
        const alvo = e.target.closest ? e.target.closest('[data-session-id]') : null;
        selecionar(alvo ? alvo.getAttribute('data-session-id') : null);
      };

      const view = getView();
      const selecionada = getSelecao();
      const pessoas = Object.values(view.people);
      const svg = renderOffice({ people: view.people, teams: view.teams, modules: view.modules, selecionada });
      const sel = selecionada && view.people[selecionada] ? view.people[selecionada] : null;
      const ctx = sel ? formatoCtx(sel.ctx) : null;

      const rodape = sel
        ? [
          h('span', { className: 'wg-chip' }, `${sel.emoji} ${ROTULOS[sel.status] ?? sel.status}`),
          h('span', { className: 'wg-chip' }, nomeModelo(sel.model)),
          h('span', { className: 'wg-chip wg-chip-verde' }, formatoCusto(sel.cost)),
          h('span', { className: 'wg-chip' }, ctx ? ctx.texto : 'CTX —'),
          sel.question ? h('span', { className: 'wg-chip' }, `❓ ${String(sel.question).slice(0, 48)}`) : null,
        ]
        : [h('span', { className: 'wg-dica' }, 'Clique numa pessoa para inspecionar')];

      return h('div', { className: 'wg-painel' },
        h('div', { className: 'wg-toolbar' },
          h('h1', null, 'Escritório'),
          h('button', { type: 'button', onClick: () => setCamera((c) => ({ ...c, zoom: Math.min(1.5, c.zoom * 1.2) })), 'aria-label': 'Aproximar' }, '+'),
          h('button', { type: 'button', onClick: () => setCamera((c) => ({ ...c, zoom: Math.max(0.15, c.zoom / 1.2) })), 'aria-label': 'Afastar' }, '−'),
          h('button', { type: 'button', onClick: caber, 'aria-label': 'Ajustar à janela' }, '⤢'),
          h('span', { className: 'wg-conta' }, pessoas.length === 1 ? '1 pessoa' : `${pessoas.length} pessoas`),
        ),
        h('div', {
          className: 'wg-tela', ref: telaRef,
          onPointerDown: arrastar, onClick: clicar,
        },
          pessoas.length === 0
            ? h('div', { className: 'wg-banner' }, 'Telemetria indisponível — à espera do host do plugin (nada é simulado)')
            : null,
          h('div', {
            className: 'wg-mundo',
            style: { transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` },
          },
            h('div', { className: 'wg-svg', dangerouslySetInnerHTML: { __html: svg } }),
          ),
        ),
        h('div', { className: 'wg-rodape' }, ...rodape),
      );
    }

    // Ícone da entrada da barra lateral (glifo simples, sem dependências).
    function IconeEscritorio(props) {
      const tamanho = props.size ?? 18;
      const cor = props.active ? 'var(--wg-icone-ativo, #fff)' : 'currentColor';
      return h('svg', {
        width: tamanho, height: tamanho, viewBox: '0 0 24 24',
        fill: 'none', stroke: cor, strokeWidth: 1.8, strokeLinecap: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M4 20V6l8-3 8 3v14' }),
        h('path', { d: 'M3 20h18' }),
        h('path', { d: 'M9 20v-6h6v6' }),
        h('path', { d: 'M9 8h.01M12 8h.01M15 8h.01' }),
      );
    }

    /* ================================================================
     * 5. Núcleo do painel e face do bundle
     * ================================================================ */

    // Núcleo: estado + adaptador + seleção + expirações (ciclo de vida da fibra).
    function criarNucleo() {
      let estado = createOfficeState();
      const ouvintes = new Set();
      let adaptador = null;
      let timerPurga = null;

      const notificar = () => {
        for (const fn of [...ouvintes]) fn();
      };

      const temPendentes = () => {
        for (const p of estado.people.values()) {
          if (p.outputs.length > 0 || p.flags.retry || p.flags.compactacao) return true;
        }
        return false;
      };

      // Expirações (~1s) de outputs e indicadores transitórios na UI.
      const agendarPurga = () => {
        if (timerPurga !== null || !temPendentes()) return;
        timerPurga = setTimeout(() => {
          timerPurga = null;
          const novo = purgar(estado);
          if (novo !== estado) {
            estado = novo;
            notificar();
          }
          agendarPurga();
        }, 400);
      };

      const face = {
        getView: () => officeView(estado),
        getSelecao: () => estado.selecionada,
        subscribe: (fn) => {
          ouvintes.add(fn);
          return () => { ouvintes.delete(fn); };
        },
        iniciar: () => {
          if (!adaptador) {
            adaptador = createAdapter({
              onEvent: (evento) => {
                estado = applyEvent(estado, evento);
                notificar();
                agendarPurga();
              },
              // Catálogo de sessões e projeções: alimentados pelo futuro
              // transporte host->browser (o plugin nunca simula sessões).
              sessions: [],
              projections: {},
            });
          }
          adaptador.start();
          agendarPurga();
        },
        parar: () => {
          if (adaptador) adaptador.stop();
        },
        selecionar: (id) => {
          if (estado.selecionada !== id) {
            estado = { ...estado, selecionada: id };
            notificar();
          }
        },
        dispose: () => {
          if (timerPurga !== null) {
            clearTimeout(timerPurga);
            timerPurga = null;
          }
          if (adaptador) adaptador.stop();
          ouvintes.clear();
        },
      };
      return face;
    }

    function injetarEstilos(destino) {
      if (destino.querySelector(`style[data-plugin-css="dsh-work-game"]`)) return;
      const el = destino.createElement('style');
      el.setAttribute('data-plugin-css', 'dsh-work-game');
      el.textContent = CSS_PAINEL;
      destino.head.append(el);
    }

    // O id partilhado pela entrada da barra lateral e pelo painel em `main`.
    const PANEL_ID = 'dsh-work-game';

    exports.inject = ['slots'];

    // A função que o runtime do browser chama (padrão dos exemplos oficiais).
    exports.apply = function apply(ctx) {
      injetarEstilos(document);
      const nucleo = criarNucleo();

      // Cleanup correto: parar o adaptador e limpar timers quando a fibra
      // do plugin for descartada (reload HMR, unload, dependência morta).
      ctx.effect(() => () => { nucleo.dispose(); }, 'dsh-work-game: escritório');

      ctx.slots.inject('main', () =>
        ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          inject: () => nucleo,
        }, PainelEscritorio),
      );

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 0,
          label: () => 'Escritório',
        }, IconeEscritorio),
      );
    };

    return module.exports;
  },
});