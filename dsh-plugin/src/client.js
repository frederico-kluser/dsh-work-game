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
 * Funcionalidades desta tarefa (verificadas no checkout deepseek-harness
 * v0.1.6-alpha.2, read-only):
 *
 * (1) Botão "Modo jogo" imediatamente ao lado do botão de settings.
 *     Achado do checkout: `sidebar.panellist` ordena as entradas pelo campo
 *     `order` (ascendente, default 0, empates por ordem de registo; ver
 *     packages/client/ui-sidebar/src/client/index.ts). MAS o item de settings
 *     NÃO está na panellist: neste checkout o único registrante nativo é
 *     `plugins` (order 0). Settings ocupa `sidebar.settings` no pé da barra,
 *     e o slot que o contrato de ui-sidebar descreve como "Optional actions
 *     beside Settings at the sidebar foot" é `sidebar.footer.action` —
 *     também ordenado por `order` (regra geral das listas; ver
 *     ui-renderer/src/client/scoped-slots.tsx). Por isso o botão registra-se
 *     em `sidebar.footer.action` { order: 0 }: fica pegado à fila de settings
 *     (wide e rail 56px), com ícone e tooltip "Modo jogo". O clique abre o
 *     painel do escritório via `ctx.layout.selectPanel(PANEL_ID)` — API
 *     pública do serviço `layout` (ui-layout/src/client/service.ts) que
 *     seleciona o slot 'main' com a key 'dsh-work-game'.
 *
 * (2) Auto-associação: quando chega uma sessão/agente sem nome/estilo
 *     associado, gera-se nome aleatório + estilo de avatar aleatório e
 *     guarda-se a associação em localStorage (chave 'dsh-work-game:assoc'),
 *     estável entre renders. Singleton a nível de módulo, tolerante a falhas
 *     de armazenamento (modo privado -> só em memória).
 *
 * (3) Reações: o estado visual (emoji/expressão/ficha) deriva EXCLUSIVAMENTE
 *     dos eventos recebidos do adaptador (applyEvent -> recalcular). Não há
 *     temporizadores que mudem emoji/expressão/ficha: os indicadores
 *     transitórios (retry, compactação) limpiam-se por eventos posteriores,
 *     nunca por timer. O único setTimeout que resta é a expiração de
 *     apresentação dos outputs (~1s, contrato §2): só retira balões e nunca
 *     toca o estado visual da pessoa.
 *
 * Um bundle servido não consegue importar ficheiros ESM irmãos (a resolução
 * do module table só conhece seed words, linhas do grafo e chunks
 * factory-form client.*.js). Quando a integração ganhar um canal host→browser
 * (ou um passo de build), estas projeções trocam-se pelos módulos reais
 * src/state.js, src/adapter.js e src/render.js sem mudar a wiring do apply().
 */
window.__ModuleLoader__.load({
  // O id TEM de ser o nome do pacote: é a chave com que o boot data
  // (window.__DSH_BOOT__.entries) regista o módulo — um id diferente faz o
  // loader não encontrar o factory e o pacote falhar com "import failed".
  id: 'dsh-work-game-plugin',
  factory: (require) => {
    'use strict';
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    // Diagnóstico de ativação: fica em window.__wgDiag para leitura headless
    // (o loader apenas reporta "import failed" e manda ver a consola).
    try { window.__wgDiag = 'factory:start'; } catch { /* sem window */ }
    let react;
    try {
      react = require('react');
      try { window.__wgDiag = 'factory:react-ok'; } catch { /* sem window */ }
    } catch (erro) {
      try { window.__wgDiag = 'factory:react-erro: ' + String(erro && erro.message).slice(0, 180); } catch { /* sem window */ }
      react = { createElement: () => null };
    }
    const h = react.createElement;

    /* ================================================================
     * 0. Associação nome+estilo por sessão (tarefa 2)
     * ================================================================ */

    // Persistência simples no cliente (localStorage): a identidade de uma
    // sessão é gerada uma única vez e não muda entre renders.
    const CLAVE_ASSOC = 'dsh-work-game:assoc';

    // Banco de nomes neutros (sem apelidos nem dados pessoais).
    const NOMES = [
      'Ada', 'Bruno', 'Carla', 'Dino', 'Elsa', 'Félix', 'Greta', 'Hugo',
      'Iris', 'Júlio', 'Kira', 'Lino', 'Mara', 'Nuno', 'Olga', 'Pedro',
      'Rita', 'Sofia', 'Tino', 'Vera', 'Yuki', 'Zane',
    ];

    // Banco de estilos: forma do avatar + paleta (fundo/borde/acento).
    // Cada estilo identifica visualmente ao ocupante na sala.
    const ESTILOS = [
      { id: 'azul', forma: 'circulo', paleta: { fundo: '#2e5a86', borde: '#1d3a55', acento: '#4a90d9' } },
      { id: 'bosque', forma: 'cuadrado', paleta: { fundo: '#2f6d4f', borde: '#1f4a35', acento: '#58b368' } },
      { id: 'amanecer', forma: 'hexagono', paleta: { fundo: '#b3573a', borde: '#7a3826', acento: '#e08a4c' } },
      { id: 'grafito', forma: 'circulo', paleta: { fundo: '#46525e', borde: '#2f3942', acento: '#8a97a5' } },
      { id: 'lavanda', forma: 'cuadrado', paleta: { fundo: '#6d5a94', borde: '#4a3c66', acento: '#9a86c9' } },
      { id: 'caramelo', forma: 'hexagono', paleta: { fundo: '#a0713f', borde: '#6e4c26', acento: '#c9996a' } },
    ];

    const aleatorioDe = (lista) => lista[Math.floor(Math.random() * lista.length)];

    // Associador: cache em memória + localStorage. Cria uma associação
    // { name, style } na primeira visita de cada id e reutiliza-a depois,
    // mesmo após recargar a página.
    function criarAssociador() {
      let cache = null; // null = ainda não lido

      const ler = () => {
        try {
          const bruto = window.localStorage.getItem(CLAVE_ASSOC);
          const obj = bruto ? JSON.parse(bruto) : {};
          cache = (typeof obj === 'object' && obj !== null) ? obj : {};
        } catch {
          // Acesso bloqueado (modo privado, iframe sandbox): só em memória.
          cache = {};
        }
      };

      const guardar = () => {
        try {
          window.localStorage.setItem(CLAVE_ASSOC, JSON.stringify(cache));
        } catch {
          // Persistência não disponível: a associação vive nesta página.
        }
      };

      return {
        // Associação estável para `id`; `dado` permite que o próprio evento
        // (futuro transporte) traia nome/avatar explícitos se os houver.
        para(id, dado = {}) {
          if (cache === null) ler();
          let a = cache[id];
          if (typeof a !== 'object' || a === null) {
            a = {
              name: typeof dado.name === 'string' && dado.name ? dado.name : aleatorioDe(NOMES),
              avatar: typeof dado.avatar === 'string' ? dado.avatar : null,
              style: dado.style ?? aleatorioDe(ESTILOS),
            };
            cache[id] = a;
            guardar();
          }
          return a;
        },
      };
    }

    // Singleton a nível de módulo: uma única associação por id em toda a
    // vida da página, independente do número de apply() (HMR/recarga).
    const associador = criarAssociador();

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

    function criarPessoa(id, modelo, a, evento) {
      const asoc = a ?? null; // { name, avatar, style } | null (tarefa 2)
      return {
        id,
        name: asoc ? asoc.name : nomeDe(id),
        avatar: asoc ? asoc.avatar : null, // o painel não inventa URLs
        style: asoc ? asoc.style : null,   // { forma, paleta } do avatar
        teamId: evento && evento.teamId ? evento.teamId : 'geral',
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
          retry: false, compactacao: false,
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
      // Histórico limitado a 6: retira o mais antigo (Array.shift não existe).
      if (p.outputs.length > 6) p.outputs.splice(0, 1);
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
    // Reações (tarefa 3): as únicas escrituras de emoji/status/expression
    // acontecem aqui, derivadas do evento recebido — nunca de um timer. Os
    // indicadores transitórios limpiam-se por eventos posteriores; o
    // `associador` toca localStorage só ao criar uma pessoa nova.
    function applyEvent(estado, evento) {
      const pessoas = new Map(estado.people);
      const p = (id) => pessoas.get(id);

      switch (evento.type) {
        case 'session/added':
          if (!pessoas.has(evento.sessionId)) {
            const asoc = associador.para(evento.sessionId, evento);
            pessoas.set(evento.sessionId, criarPessoa(evento.sessionId, evento.model, asoc, evento));
          }
          break;
        case 'session/removed':
          // A associação fica em localStorage: se a sessão voltar, mantenga
          // nome e estilo (identidade estável entre desconexões).
          pessoas.delete(evento.sessionId);
          break;
        case 'status': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          const emExecucion = evento.status === 'running';
          pessoa.flags.ocioso = !emExecucion;
          // Nova execução supera as marcas transitórias; arranque de turno
          // também limpa o erro anterior.
          pessoa.flags.concluido = false;
          pessoa.flags.ferramenta = false;
          pessoa.flags.retry = false;
          if (emExecucion) pessoa.flags.erro = false;
          break;
        }
        case 'turn/end': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          const kind = evento.kind;
          // Fin de turno: limpa os indicadores transitórios.
          pessoa.flags.ocioso = true;
          pessoa.flags.ferramenta = false;
          pessoa.flags.retry = false;
          pessoa.flags.compactacao = false;
          if (kind === 'completed') {
            pessoa.flags.erro = false;
            pessoa.flags.concluido = true;
            adicionarOutput(pessoa, 'result', 'turno concluído');
          } else if (kind === 'error' || kind === 'blocked' || kind === 'max-tokens') {
            pessoa.flags.erro = true;
            pessoa.flags.concluido = false;
            adicionarOutput(pessoa, 'message', kind === 'error' ? 'erro no turno' : kind === 'blocked' ? 'bloqueado' : 'máx. de tokens');
          } else {
            // aborted | interrupted — interrupção não é erro.
            pessoa.flags.erro = false;
            pessoa.flags.concluido = false;
            adicionarOutput(pessoa, 'message', 'interrompido');
          }
          break;
        }
        case 'tool': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          pessoa.flags.ocioso = false;
          pessoa.flags.concluido = false;
          pessoa.flags.retry = false;
          pessoa.flags.compactacao = false;
          if (evento.phase === 'call') {
            // Nova chamada = progresso: supera o erro anterior (se o houver).
            pessoa.flags.ferramenta = true;
            pessoa.flags.erro = false;
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
          pessoa.flags.retry = false;
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
          pessoa.flags.concluido = false;
          pessoa.flags.retry = false;
          break;
        }
        case 'approval/decided': {
          const pessoa = p(evento.sessionId);
          if (pessoa) pessoa.approvals = pessoa.approvals.filter((a) => a.id !== evento.id);
          break;
        }
        case 'subagent/start': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          pessoa.subagents += 1;
          // Subagente a correr = trabalho em curso, não conclusão.
          pessoa.flags.ocioso = false;
          pessoa.flags.concluido = false;
          pessoa.flags.retry = false;
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
          const preco = precoDe(estado.precos, pessoa.model);
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
          // llm/retry-started: sem evento de fim no vocabulário, o seguinte
          // evento para esta pessoa (status/tool/turn-end/...) supera o
          // indicador — nunca um temporizador.
          pessoa.flags.retry = true;
          pessoa.flags.ocioso = false;
          pessoa.flags.concluido = false;
          break;
        }
        case 'compaction': {
          const pessoa = p(evento.sessionId);
          if (!pessoa) break;
          // O vocabulário tem phase 'start'|'end': o indicador vive exatamente
          // o tempo que os próprios eventos digam — sem temporizador.
          pessoa.flags.compactacao = evento.phase === 'start';
          if (evento.phase === 'start') pessoa.flags.ocioso = false;
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
        id: p.id, name: p.name, avatar: p.avatar, style: p.style, status: p.status,
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

    // Expiração (~1s) só de outputs na UI (contrato §2). Presentação pura:
    // nunca recalcula emoji/expressão/ficha — as reações visuais dependem
    // somente de eventos (tarefa 3), este timer não as toca.
    function purgar(estado, agora = Date.now()) {
      const pessoas = new Map(estado.people);
      let mudou = false;
      for (const p of pessoas.values()) {
        const antes = p.outputs.length;
        p.outputs = p.outputs.filter((o) => o.expiraEm > agora);
        if (p.outputs.length !== antes) mudou = true;
      }
      return mudou ? { ...estado, people: pessoas } : estado;
    }

    /* ================================================================
     * 2. Adaptador — contrato §3 (projeção browser)
     * ================================================================ */

    // createAdapter({ onEvent, sessions, projections, surface }) -> { start, stop }.
    // `surface` é o transporte real host->browser (feature-detected em apply):
    //   surface.catalogo() -> [{ id, model? }]
    //   surface.assinar(fn) -> devolve função de libertação (ou null)
    // Sem canal, o painel mostra "telemetria indisponível" — nunca inventa
    // sessões nem eventos.

    // Normaliza um evento bruto do DSH para o vocabulário do contrato §1.
    // Tipos desconhecidos devolvem null (ignorados, nunca fabricados).
    // Tipos já no vocabulário normalizado (vindos da superfície de snapshots)
    // passam tal-e-qual; só os eventos brutos do fio são traduzidos.
    const TIPOS_NORMALIZADOS = new Set([
      'session/added', 'session/removed', 'status', 'usage', 'model', 'ctx',
      'subagent/start', 'subagent/end', 'question', 'question/answered',
      'approval', 'approval/decided', 'retry', 'compaction',
    ]);
    function normalizarEventoDSH(bruto) {
      if (!bruto || typeof bruto !== 'object') return null;
      const t = String(bruto.type ?? bruto.event ?? '');
      if (TIPOS_NORMALIZADOS.has(t)) return bruto;
      const sid = bruto.sessionId ?? bruto.session?.id ?? bruto.agent?.session?.id;
      const base = sid ? { sessionId: sid } : {};
      switch (t) {
        case 'turn/end': {
          const r = bruto.reason ?? bruto.payload?.reason;
          const kind = typeof r === 'string' ? r : (r?.kind ?? 'error');
          return { type: 'turn/end', ...base, kind };
        }
        case 'agent/status':
          return { type: 'status', ...base, status: bruto.status ?? bruto.payload?.status };
        case 'tool/call':
          return { type: 'tool', ...base, phase: 'call', name: bruto.name ?? bruto.payload?.name };
        case 'tool/result':
          return { type: 'tool', ...base, phase: 'result', name: bruto.name ?? bruto.payload?.name, ok: bruto.ok ?? bruto.payload?.ok };
        case 'subagent/start':
          return { type: 'subagent/start', ...base, childId: bruto.id ?? bruto.payload?.id, runId: bruto.runId ?? bruto.payload?.runId, local: bruto.local ?? bruto.payload?.local };
        case 'subagent/end':
          return { type: 'subagent/end', ...base, childId: bruto.id ?? bruto.payload?.id, runId: bruto.runId ?? bruto.payload?.runId, stopReason: bruto.stopReason ?? bruto.payload?.stopReason };
        case 'approval/asked':
          return { type: 'approval', ...base, id: bruto.id, toolName: bruto.toolName ?? bruto.payload?.toolName, callId: bruto.callId ?? bruto.payload?.callId, reason: bruto.reason ?? bruto.payload?.reason };
        case 'approval/decided':
          return { type: 'approval/decided', ...base, id: bruto.id, outcome: bruto.outcome ?? bruto.payload?.outcome };
        case 'llm/retry-started':
          return { type: 'retry', ...base };
        case 'compaction/start':
          return { type: 'compaction', ...base, phase: 'start' };
        case 'compaction/end':
          return { type: 'compaction', ...base, phase: 'end' };
        default:
          return null;
      }
    }

    function createAdapter({ onEvent, sessions = [], projections = {}, surface = null }) {
      let ativo = false;
      const limpeza = [];
      return {
        start() {
          if (ativo) return;
          ativo = true;
          // Semente inicial a partir do catálogo de sessões fornecido.
          for (const sessao of sessions) {
            onEvent({
              type: 'session/added', sessionId: sessao.id, model: sessao.model,
              name: sessao.name, teamId: sessao.teamId,
            });
          }
          // Transporte real: assinar eventos brutos e normalizá-los.
          if (surface && typeof surface.assinar === 'function') {
            try {
              const libertar = surface.assinar((bruto) => {
                const ev = normalizarEventoDSH(bruto);
                if (ev) onEvent(ev);
              });
              if (typeof libertar === 'function') limpeza.push(libertar);
            } catch {
              /* sem transporte utilizável: mantém "telemetria indisponível" */
            }
          }
          // Projeções (ctx/model/uso) chegam já normalizadas quando o canal existe.
          if (surface && typeof surface.assinarProjecoes === 'function') {
            try {
              const libertar = surface.assinarProjecoes(onEvent);
              if (typeof libertar === 'function') limpeza.push(libertar);
            } catch { /* idem */ }
          }
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

    // Avatar desenhado a partir do estilo associado (tarefa 2): forma +
    // paleta. O estilo vem da associação estável (localStorage), assim o
    // ocupante não muda de aspecto entre renders. Sem estilo (seam com
    // state.js, que não conhece `style`) -> círculo neutro.
    function avatarPorEstilo(estilo, cx, cy) {
      const paleta = estilo?.paleta ?? { fundo: '#2e5a86', borde: '#1d3a55', acento: '#4a90d9' };
      const forma = estilo?.forma ?? 'circulo';
      let corpo;
      if (forma === 'cuadrado') {
        corpo = `<rect x="${cx - 30}" y="${cy - 30}" width="60" height="60" rx="10" fill="${paleta.fundo}" stroke="${paleta.borde}" stroke-width="2.5"/>`;
      } else if (forma === 'hexagono') {
        const pts = `${cx},${cy - 36} ${cx + 31},${cy - 18} ${cx + 31},${cy + 18} ${cx},${cy + 36} ${cx - 31},${cy + 18} ${cx - 31},${cy - 18}`;
        corpo = `<polygon points="${pts}" fill="${paleta.fundo}" stroke="${paleta.borde}" stroke-width="2.5"/>`;
      } else {
        corpo = `<circle cx="${cx}" cy="${cy}" r="40" fill="${paleta.fundo}" stroke="${paleta.borde}" stroke-width="2.5"/>`;
      }
      return corpo;
    }

    // Pessoa: balão (se perguntar), emoji sobre a cabeça e avatar com estilo.
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
          : avatarPorEstilo(p.style, cx, 150) +
            `<text x="${cx}" y="158" text-anchor="middle" font-size="20" fill="${p.style?.paleta?.acento ?? '#f4f7fa'}">${esc(iniciais(nome))}</text>`,
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
      const excedeu = num(p.ctx && p.ctx.used) > LIMIAR_CTX;
      const velocidade = p.speed ? ` · ${Math.round(p.speed)} tok/s` : '';
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
        ctx.largura ? `<rect x="${cx - 85}" y="${Y_CARTAO + 82}" width="${ctx.largura}" height="5" rx="2.5" fill="${excedeu ? '#c2603f' : '#4a90d9'}"/>` : '',
        `<text x="${cx}" y="${Y_CARTAO + 102}" text-anchor="middle" font-size="11" fill="${excedeu ? '#a2543a' : '#8b958e'}">${excedeu ? '⚠ ' : ''}${ctx.texto}${velocidade}</text>`,
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
      '.wg-chip-alerta{background:#f9e5de;border-color:#e2b6a6;color:#a2543a;font-weight:600}',
      '.wg-rodape .wg-dica{color:#8b958e;font-size:12px}',
      // Botão "Modo jogo" do pé (tarefa 1): o contrato de ui-sidebar diz que
      // cada ocupante de `sidebar.footer.action` possui a sua própria
      // geometria e hover chrome. Cor neutra herdada de currentColor para se
      // fundir com o resto do pé.
      '.wg-jogar{display:inline-flex;align-items:center;gap:6px;height:28px;min-width:28px;padding:0 9px;border:0;background:transparent;border-radius:6px;color:currentColor;cursor:pointer}',
      '.wg-jogar:hover{background:rgba(90,104,120,0.14)}',
      '.wg-jogar .wg-jogar-rotulo{font-size:13px;color:currentColor}',
    ].join('');

    // Painel principal: sala SVG com zoom/pan mínimos e inspeção por pessoa.
    function PainelEscritorio(props) {
      const { getView, getSelecao, subscribe, iniciar, parar, selecionar } = props;
      const temCanal = typeof props.temCanal === 'function' ? props.temCanal : () => false;
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
          sel.speed ? h('span', { className: 'wg-chip' }, `${sel.speed} tok/s`) : null,
          sel.ctx && num(sel.ctx.used) > LIMIAR_CTX
            ? h('span', { className: 'wg-chip wg-chip-alerta' }, '⚠ contexto >200k')
            : null,
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
            ? h('div', { className: 'wg-banner' }, temCanal()
              ? 'Ligado ao DSH — sem sessões no catálogo. Abra (ou retome) uma conversa e ela aparece aqui. Nada é simulado.'
              : 'Telemetria indisponível — à espera do host do plugin (nada é simulado)')
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

    // Botão do pé da barra lateral (tarefa 1): abre o painel do escritório.
    // Ocupa `sidebar.footer.action`, o slot que ui-sidebar define como
    // "Optional actions beside Settings at the sidebar foot" — fica justo ao
    // lado do botão de settings (wide e rail). Tooltip nativo no `title`,
    // nome acessível no `aria-label`; em wide mostra também o rótulo, como a
    // própria fila de settings faz.
    // Ação de abertura do painel, preenchida em apply(). Vive em closure para o
    // botão não depender da forma como o slot injeta props (que varia entre
    // versões do runtime).
    let abrirPainel = () => {};

    function BotaoModoJogo(props) {
      const wide = props && props.wide;
      return h('button', {
        type: 'button',
        className: 'wg-jogar',
        onClick: () => {
          try {
            abrirPainel();
            window.__wgDiag = (window.__wgDiag || '') + '|abrir:chamado';
          } catch (erro) {
            try { window.__wgDiag = (window.__wgDiag || '') + '|abrir-erro: ' + String(erro && erro.message).slice(0, 220); } catch { /* sem window */ }
          }
        },
        title: 'Modo jogo',
        'aria-label': 'Modo jogo',
      },
        IconeEscritorio({ size: wide ? 16 : 18 }),
        wide ? h('span', { className: 'wg-jogar-rotulo' }, 'Modo jogo') : null,
      );
    }

    /* ================================================================
     * 5. Núcleo do painel e face do bundle
     * ================================================================ */

    // Núcleo: estado + adaptador + seleção + expirações (ciclo de vida da fibra).
    function criarNucleo() {
      let estado = createOfficeState(PRECOS);
      const ouvintes = new Set();
      let adaptador = null;
      let timerPurga = null;

      const notificar = () => {
        for (const fn of [...ouvintes]) fn();
      };

      const temPendentes = () => {
        for (const p of estado.people.values()) {
          if (p.outputs.length > 0) return true;
        }
        return false;
      };

      // Expiração (~1s) só dos balões de output na UI (contrato §2): o timer
      // jamais muda emoji/expressão/ficha — essas reações vêm dos eventos
      // do adaptador (tarefa 3).
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
        getView: () => {
          const vista = officeView(estado);
          for (const p of Object.values(vista.people)) {
            p.speed = superficieDSH && typeof superficieDSH.velocidadeDe === 'function'
              ? superficieDSH.velocidadeDe(p.id)
              : null;
          }
          return vista;
        },
        temCanal: () => !!superficieDSH,
        getSelecao: () => estado.selecionada,
        subscribe: (fn) => {
          ouvintes.add(fn);
          return () => { ouvintes.delete(fn); };
        },
        iniciar: () => {
          if (!adaptador) {
            const transporte = superficieDSH;
            adaptador = createAdapter({
              onEvent: (evento) => {
                estado = applyEvent(estado, evento);
                notificar();
                agendarPurga();
              },
              // Catálogo real de sessões + transporte de eventos (feature-detected).
              sessions: transporte && typeof transporte.catalogo === 'function'
                ? (transporte.catalogo() ?? [])
                : [],
              projections: {},
              surface: transporte,
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

    // O id partilhado pela entrada do pé da barra e pelo painel em `main`.
    const PANEL_ID = 'dsh-work-game';

    // Superfície de transporte real (catálogo + eventos) — preenchida em apply().
    // Fica null quando o runtime não expõe `sessions`; nesse caso o painel
    // mostra "telemetria indisponível" e nada é inventado.
    let superficieDSH = null;

    /* ── Superfície REAL do runtime do browser ─────────────────────────────
       Cópia embutida de src/surface.js (o bundle não pode importar irmãos —
       ver cabeçalho). API verificada no checkout deepseek-harness 0.1.6:
       ctx.sessions.list = ObservableSnapshot<SessionListState> com
       getSnapshot()/subscribe(fn); SessionSummary {id, displayTitle, cwd,
       parentId, running, projectionValues}; projectionValues traz
       tokenUsage (acumulado), contextPressure {projectedTokens?,
       pressureTokens?, contextWindow?} e modelSelection {lastUsed,next};
       subagentsByParent[parent].entries lista os filhos diretos. */
    const LIMIAR_CTX = 200000; /* aviso humano de contexto: >200k */
    const PRECOS = { /* USD por token — tabela NOSSA (o DSH não publica preços) */
      'deepseek-chat': { input: 2.7e-7, output: 1.1e-6, cacheRead: 2.7e-8, cacheWrite: 2.7e-7 },
      'deepseek-reasoner': { input: 5.5e-7, output: 2.19e-6, cacheRead: 5.5e-8, cacheWrite: 5.5e-7 },
      'mimo-v2.6-pro': { input: 6e-7, output: 2.4e-6, cacheRead: 6e-8, cacheWrite: 6e-7 },
    };

    function precoDe(precos, modelo) {
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

    function linhasDoSnapshot(snap) {
      if (!snap || typeof snap !== 'object') return [];
      const linhas = [];
      const vistos = new Set();
      const byId = snap.byId && typeof snap.byId === 'object' ? snap.byId : {};
      for (const bruto of Object.values(byId)) {
        const linha = normalizarLinha(bruto, null);
        if (linha && !vistos.has(linha.id)) { vistos.add(linha.id); linhas.push(linha); }
      }
      const sub = snap.subagentsByParent && typeof snap.subagentsByParent === 'object'
        ? snap.subagentsByParent : {};
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
      const sel = linha && linha.projectionValues && linha.projectionValues.modelSelection;
      const m = sel && ((sel.lastUsed && sel.lastUsed.model) || (sel.next && sel.next.model) || sel.model);
      return typeof m === 'string' && m ? m : null;
    }

    function bucketsDaLinha(linha) {
      const tu = linha && linha.projectionValues && linha.projectionValues.tokenUsage;
      if (!tu || typeof tu !== 'object') return null;
      return {
        uncachedInput: num(tu.uncachedInputTokens),
        output: num(tu.outputTokens),
        cacheRead: num(tu.cacheReadTokens),
        cacheWrite: num(tu.cacheWriteTokens),
      };
    }

    function pressaoDaLinha(linha) {
      const cp = linha && linha.projectionValues && linha.projectionValues.contextPressure;
      if (!cp || typeof cp !== 'object') return null;
      const janela = Number.isFinite(Number(cp.contextWindow)) ? Number(cp.contextWindow) : null;
      const usado = Number.isFinite(Number(cp.projectedTokens)) ? Number(cp.projectedTokens)
        : (Number.isFinite(Number(cp.pressureTokens)) ? Number(cp.pressureTokens) : null);
      return { usado, janela };
    }

    function teamDaLinha(linha) {
      if (!linha || !linha.cwd) return null;
      const partes = String(linha.cwd).split(/[\\/]/).filter(Boolean);
      return partes.length ? partes[partes.length - 1] : null;
    }

    function extrairSuperficie(ctx, opts = {}) {
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

      const ler = () => { try { return list.getSnapshot(); } catch { return null; } };

      const catalogo = () => linhasDoSnapshot(ler()).map((l) => ({
        id: l.id,
        model: modeloDaLinha(l),
        name: l.displayTitle ?? undefined,
        teamId: teamDaLinha(l) ?? undefined,
      }));

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
        /* Diagnóstico para leitura headless (mesmo padrão de __wgDiag). */
        try {
          window.__wgSnap = JSON.stringify({
            n: linhas.length,
            fase: snap.phase ?? null,
            byId: snap.byId ? Object.keys(snap.byId).length : 0,
            sub: snap.subagentsByParent ? Object.keys(snap.subagentsByParent).length : 0,
          });
        } catch { /* sem window */ }
        const atuais = new Map(linhas.map((l) => [l.id, l]));

        for (const [id, antes] of [...anterior]) {
          if (atuais.has(id)) continue;
          anterior.delete(id);
          velocidades.delete(id);
          if (antes.parentId) emitir({ type: 'subagent/end', sessionId: antes.parentId, childId: id, runId: id });
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
          if (linha.parentId && antes.parentId !== linha.parentId) {
            if (antes.parentId) emitir({ type: 'subagent/end', sessionId: antes.parentId, childId: id, runId: id });
            antes.parentId = linha.parentId;
            emitir({ type: 'subagent/start', sessionId: linha.parentId, childId: id, runId: id });
          }
          const aCorrer = linha.running === true;
          if (antes.running !== aCorrer) {
            antes.running = aCorrer;
            emitir({ type: 'status', sessionId: id, status: aCorrer ? 'running' : 'idle' });
          }
          const modelo = modeloDaLinha(linha);
          const pressao = pressaoDaLinha(linha);
          const janela = pressao ? pressao.janela : null;
          if (modelo !== antes.modelo || janela !== antes.janela) {
            antes.modelo = modelo;
            antes.janela = janela;
            emitir({ type: 'model', sessionId: id, model: modelo ?? undefined, contextWindow: janela ?? undefined });
          }
          const usado = pressao ? pressao.usado : null;
          if (usado !== null && usado !== antes.usado) {
            antes.usado = usado;
            emitir({ type: 'ctx', sessionId: id, used: usado, window: janela ?? undefined });
          }
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
          try { return list.subscribe(() => difs(emitir)); } catch { return null; }
        },
        velocidadeDe(id) {
          const reg = velocidades.get(String(id));
          return reg && reg.v >= 1 ? Math.round(reg.v) : null;
        },
      };
    }

    // 'layout' é o serviço que ui-layout fornece via ctx.reflect.provide:
    // dá a transição pública de painel (ui-layout/src/client/service.ts).
    // Serviços exigidos ao runner do cliente. NOTA: só pedir nomes de serviço
    // comprovadamente injetáveis ('sessions', 'slots', 'locale' são os do
    // exemplo oficial) — um nome desconhecido faz a ATIVAÇÃO inteira falhar
    // ("1 entry did not activate / import failed") mesmo com o bundle válido.
    exports.inject = ['slots', 'layout'];

    // A função que o runtime do browser chama (padrão dos exemplos oficiais).
    exports.apply = function apply(ctx) {
      superficieDSH = extrairSuperficie(ctx);
      // Ação de abertura do painel, capturada em closure pelo botão: não
      // depende da forma como o slot injeta props (varia entre runtimes).
      abrirPainel = () => {
        const lay = ctx.layout ?? (typeof ctx.get === 'function' ? ctx.get('layout') : null);
        if (lay && typeof lay.selectPanel === 'function') lay.selectPanel(PANEL_ID);
        else { window.__wgDiag = (window.__wgDiag || '') + '|abrir:sem-layout'; }
      };
      injetarEstilos(document);
      const nucleo = criarNucleo();

      // Cleanup correto: parar o adaptador e limpar timers quando a fibra
      // do plugin for descartada (reload HMR, unload, dependência morta).
      ctx.effect(() => () => { nucleo.dispose(); }, 'dsh-work-game: escritório');

      // Painel em `main`, keyed: a mesma key que os botões selecionam.
      // Protegido por try/catch para um slot inválido não matar a ativação.
      try {
        ctx.slots.inject('main', () =>
          ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            inject: () => nucleo,
          }, PainelEscritorio),
        );
      } catch (erro) {
        try { window.__wgDiag = (window.__wgDiag || '') + '|slot-main-erro: ' + String(erro && erro.message).slice(0, 220); } catch { /* sem window */ }
        console.warn('[dsh-work-game] slot main indisponível:', String(erro && erro.message || erro));
      }

      // Botão "Modo jogo" no pé, justo ao lado do botão de settings (tarefa 1).
      // Achado do checkout (v0.1.6-alpha.2): o item de settings NÃO está em
      // `sidebar.panellist` — essa lista ordena-se pelo campo `order`
      // (ascendente, default 0; a única entrada nativa é `plugins` a order 0,
      // ver ui-sidebar/src/client/index.ts). Settings é o ocupante de
      // `sidebar.settings` no pé da barra, e o slot contiguo para ações é
      // `sidebar.footer.action` (também ordenado por `order`). Com order 0
      // — e sem outros registrantes — o botão fica pegado à fila de settings
      // em wide e em rail (56px).
      // DEFESA DE ATIVAÇÃO: nomes de slot são tipados (SlotMap) e um nome
      // inválido rebenta o apply inteiro — por isso cada inject é protegido e há
      // fallback para `sidebar.panellist` (slot comprovado nos exemplos oficiais).
      const registarBotao = (slot, Componente) => {
        try {
          return ctx.slots.inject(slot, () => ctx.slots.register({
            name: slot,
            id: PANEL_ID,
            order: 0,
            label: () => 'Modo jogo',
            inject: () => ({}),
          }, Componente));
        } catch (erro) {
          try { window.__wgDiag = (window.__wgDiag || '') + '|slot-' + slot + '-erro: ' + String(erro && erro.message).slice(0, 180); } catch { /* sem window */ }
          console.warn('[dsh-work-game] slot indisponível:', slot, String(erro && erro.message || erro));
          return null;
        }
      };
      // Só o botão do pé: ele já fica ao lado de settings e abre o painel.
      // (Uma entrada em sidebar.panellist seria redundante e confundiria com
      // outra abertura do mesmo painel.)
      const disposers = [
        registarBotao('sidebar.footer.action', BotaoModoJogo),
      ].filter(Boolean);
      ctx.effect(() => () => { for (const libertar of disposers) { try { libertar(); } catch { /* já libertado */ } } }, 'dsh-work-game: botão');
    };

    // Exposto apenas para testes (não faz parte do contrato do runtime).
    exports.__extrairSuperficie = extrairSuperficie;
    exports.__precoDe = precoDe;

    try { window.__wgDiag = (window.__wgDiag || '') + '|factory:fim'; } catch { /* sem window */ }
    return module.exports;
  },
});