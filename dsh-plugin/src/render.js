/*
 * render.js — dsh-work-game
 * Renderização SVG do escritório para o painel do plugin.
 *
 * Módulo puro, sem dependências: recebe o estado do escritório e devolve o
 * markup SVG (string) que o client.js injeta no DOM. A geometria dos móveis
 * NÃO é copiada: os símbolos vêm de assets/furniture.svg por href (desk,
 * chair, laptop, connector e icon-*), tal como a demo index.html já usa.
 *
 * Entrada aceite (tolerante por construção — state.js evolui em paralelo):
 *   state.people   -> map { id: pessoa } OU array de pessoas.
 *                     pessoa: { id, name, avatar?, status?, label?, emoji?,
 *                               ctx?: {used, window} | null, model?: string|null,
 *                               cost?: number|null, question?: string | {text} | null,
 *                               teamId? }
 *   state.teams    -> opcional: { [teamId]: { name?, color?, panel?, stroke? } }
 *   state.modules  -> opcional: [{ id, teamId, kind?, seats: [personId|null|'reserved'] }]
 *
 * Sem `modules`, a função distribui as pessoas por mesas de 4 lugares (uma
 * mesa por equipa, com expansões adicionais) — o mesmo crescimento que o
 * state.js aplica — para render.js funcionar sozinho em testes e no demo.
 *
 * Layout: mesas de 4 lugares em grade de 3 colunas. As mesas de cada linha
 * encostam-se em x = 900 (como o sprite desk indica) e cada emenda recebe um
 * connector. Balões de pergunta ficam por cima das pessoas; as fichas
 * (modelo, custo e barra CTX) ficam no cartão de cada lugar, sob a mesa.
 */

const SPRITE = 'assets/furniture.svg';
const COLUNAS = 3;            // grade do escritório: 3 colunas
const LUGARES = 4;            // lugares por mesa
const PASSO_LUGAR = 225;      // distância entre centros de lugares vizinhos
const LARGURA_MESA = 900;     // largura do símbolo desk
const ALTURA_LINHA = 880;     // pitch vertical entre linhas da grade
const Y_MESA = 365;           // topo do tampo da mesa (coordenada local)
const Y_CADEIRA = 212;        // topo das cadeiras (frente da mesa)
const Y_CARTAO = 686;         // topo do cartão/ficha sob a mesa
const Y_LAPTOP = 372;         // portáteis sobre o tampo, um por ocupante

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/* Escapa texto para uso seguro em markup SVG (atributos e conteúdo). */
const esc = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/* Referência a um símbolo reutilizado de assets/furniture.svg. */
const use = (id, x, y, w, h, extra = '') =>
  `<use href="${SPRITE}#${id}" x="${x}" y="${y}" width="${w}" height="${h}" ${extra}/>`;

/* Iniciais do nome (até duas palavras) para o avatar circular genérico. */
const iniciais = (nome) => {
  const partes = String(nome ?? '').trim().split(/\s+/).slice(0, 2);
  const sigla = partes.map((p) => p[0] ?? '').join('');
  return (sigla || '?').toUpperCase();
};

/* Nome curto do modelo, tolerando string ou objeto {provider, model}. */
const nomeModelo = (m) => {
  if (!m) return 'modelo —';
  const nome = typeof m === 'string' ? m : (m.model ?? m.provider ?? '');
  return String(nome).slice(0, 18);
};

/* Custo formatado à PT-BR; sem número finito mostra "custo indisponível". */
const formatoCusto = (custo) =>
  typeof custo === 'number' && Number.isFinite(custo)
    ? `US$ ${custo.toFixed(2).replace('.', ',')}`
    : 'custo —';

/* Barra CTX: percentagem usada da janela; sem janela conhecida -> "CTX —". */
const formatoCtx = (ctx) => {
  if (!ctx || !Number.isFinite(ctx.window) || ctx.window <= 0) {
    return { texto: 'CTX —', largura: 0 };
  }
  const pct = Math.round(((Number(ctx.used) || 0) / ctx.window) * 100);
  return { texto: `CTX ${Math.min(999, pct)}%`, largura: Math.max(2, Math.min(170, pct * 1.7)) };
};

/* Quebra de texto curto para o balão (largura fixa, no máximo 3 linhas). */
const quebraTexto = (texto) => {
  const limpo = String(texto ?? '').replace(/\s+/g, ' ').trim() || 'Pergunta';
  const linhas = [];
  let resto = limpo;
  while (resto.length > 26 && linhas.length < 2) {
    const corte = resto.lastIndexOf(' ', 26);
    const fim = corte > 0 ? corte : 26;
    linhas.push(resto.slice(0, fim));
    resto = resto.slice(fim).trim();
  }
  if (resto.length > 26) resto = `${resto.slice(0, 25)}…`;
  linhas.push(resto);
  return linhas;
};

/* Balão persistente de pergunta (features futuras nº 1), acima da pessoa. */
const balao = (cx, pergunta) => {
  const texto = typeof pergunta === 'string'
    ? pergunta
    : (pergunta && typeof pergunta.text === 'string' ? pergunta.text : 'Pergunta');
  const linhas = quebraTexto(texto);
  const altura = 20 + linhas.length * 20;
  const largura = 248;
  const x = cx - largura / 2;
  const cauda = `${cx - 12} ${2 + altura} ${cx + 12} ${2 + altura} ${cx} ${2 + altura + 14}`;
  return [
    '<g class="wg-balao" role="note" aria-label="pergunta: ' + esc(texto) + '">',
    `<polygon points="${cauda}" fill="#fffdf4" stroke="#d8b25c" stroke-width="1.5"/>`,
    `<rect x="${x}" y="2" width="${largura}" height="${altura}" rx="12" fill="#fffdf4" stroke="#d8b25c" stroke-width="1.5"/>`,
    linhas.map((linha, i) =>
      `<text x="${cx}" y="${24 + i * 20}" text-anchor="middle" font-size="15" fill="#4a4332">${esc(linha)}</text>`,
    ).join(''),
    '</g>',
  ].join('');
};

/* Pessoa: balão (opcional), emoji sobre a cabeça e avatar (imagem ou círculo). */
const renderPessoa = (p, cx) => {
  const nome = p?.name ?? 'Pessoa';
  const emoji = p?.emoji || (p?.question ? '❓' : '💤');
  const estado = p?.label ?? p?.status ?? '—';
  return [
    `<g class="wg-pessoa" role="img" aria-label="${esc(nome)}: ${esc(estado)}" data-session-id="${esc(p?.id ?? '')}">`,
    p?.question ? balao(cx, p.question) : '',
    `<text x="${cx}" y="100" text-anchor="middle" font-size="28">${emoji}<title>${esc(estado)}</title></text>`,
    p?.avatar
      ? `<image href="${esc(p.avatar)}" x="${cx - 45}" y="122" width="90" height="100" preserveAspectRatio="xMidYMax meet"/>`
      : `<circle cx="${cx}" cy="162" r="46" fill="#2e5a86" stroke="#1d3a55" stroke-width="2"/>` +
        `<text x="${cx}" y="172" text-anchor="middle" font-size="24" fill="#f4f7fa">${esc(iniciais(nome))}</text>`,
    '</g>',
  ].join('');
};

/* Ficha do lugar: nome, estado, chips de modelo/custo e barra CTX. */
const renderFicha = (p, cx) => {
  const nome = p?.name ?? 'Lugar';
  const emoji = p?.emoji || (p?.question ? '❓' : '💤');
  const estado = p?.label ?? p?.status ?? '—';
  const ctx = formatoCtx(p?.ctx);
  return [
    '<g class="wg-ficha">',
    `<rect x="${cx - 99}" y="${Y_CARTAO}" width="198" height="112" rx="10" fill="#fbfaf4" stroke="#d8dbcf" stroke-width="1.5"/>`,
    `<text x="${cx}" y="${Y_CARTAO + 22}" text-anchor="middle" font-size="16" font-weight="600" fill="#23272b">${esc(nome)}</text>`,
    `<text x="${cx}" y="${Y_CARTAO + 42}" text-anchor="middle" font-size="13" fill="#64707c">${emoji} ${esc(estado)}</text>`,
    `<rect x="${cx - 93}" y="${Y_CARTAO + 52}" width="88" height="22" rx="11" fill="#eef1f5"/>`,
    `<text x="${cx - 49}" y="${Y_CARTAO + 67}" text-anchor="middle" font-size="11" fill="#3d4854">${esc(nomeModelo(p?.model))}</text>`,
    `<rect x="${cx + 5}" y="${Y_CARTAO + 52}" width="88" height="22" rx="11" fill="#e9f2ea"/>`,
    `<text x="${cx + 49}" y="${Y_CARTAO + 67}" text-anchor="middle" font-size="11" fill="#2f5d36">${esc(formatoCusto(p?.cost))}</text>`,
    `<rect x="${cx - 85}" y="${Y_CARTAO + 84}" width="170" height="5" rx="2.5" fill="#e3e6ea"/>`,
    ctx.largura ? `<rect x="${cx - 85}" y="${Y_CARTAO + 84}" width="${ctx.largura}" height="5" rx="2.5" fill="#4a90d9"/>` : '',
    `<text x="${cx}" y="${Y_CARTAO + 104}" text-anchor="middle" font-size="11" fill="#8b958e">${ctx.texto}</text>`,
    '</g>',
  ].join('');
};

/* Um dos 4 lugares: cadeira + ocupante (pessoa, reservado ou livre). */
const renderLugar = (mod, i, pessoas) => {
  const cx = 112.5 + i * PASSO_LUGAR;
  const ocupante = mod.seats[i];
  const saida = [use('chair', cx - 81, Y_CADEIRA, 162, 184)];
  if (ocupante === 'reserved') {
    saida.push(use('icon-arrow', cx - 17, 290, 34, 34, 'color="#99a9b4"'));
    saida.push(`<text x="${cx}" y="${Y_CADEIRA + 60}" text-anchor="middle" font-size="14" fill="#919ea4">Reservado</text>`);
  } else if (ocupante && pessoas[ocupante]) {
    saida.push(renderPessoa(pessoas[ocupante], cx));
  } else {
    saida.push(use('icon-plus', cx - 17, 290, 34, 34, 'color="#8b958e"'));
    saida.push(`<text x="${cx}" y="${Y_CADEIRA + 60}" text-anchor="middle" font-size="14" fill="#aeb7b3">Lugar livre</text>`);
  }
  return saida.join('');
};

/* Mesa completa: cadeiras, tampo, portáteis, fichas e rótulos da equipa. */
const renderModulo = (mod, pessoas, teams) => {
  const eq = teams?.[mod.teamId];
  const nomeEquipa = eq?.name ?? mod.teamId ?? 'Equipa';
  const ocupados = mod.seats.filter((s) => typeof s === 'string' && s !== 'reserved').length;
  const estilo = eq && (eq.color || eq.panel || eq.stroke)
    ? ` style="--desk-color:${esc(eq.color ?? '#2869a6')};--desk-panel:${esc(eq.panel ?? '#25629b')};--desk-stroke:${esc(eq.stroke ?? '#234b70')}"`
    : '';
  const comPessoa = (i) => {
    const s = mod.seats[i];
    return typeof s === 'string' && s !== 'reserved' && pessoas[s];
  };
  return [
    `<g class="wg-modulo" data-module-id="${esc(mod.id ?? '')}" data-team-id="${esc(mod.teamId ?? '')}"${estilo}>`,
    mod.seats.map((_, i) => renderLugar(mod, i, pessoas)).join(''),
    use('desk', 0, Y_MESA, LARGURA_MESA, 288),
    mod.seats.map((_, i) => comPessoa(i) ? use('laptop', 112.5 + i * PASSO_LUGAR - 90, Y_LAPTOP, 180, 112) : '').join(''),
    mod.seats.map((_, i) => comPessoa(i) ? renderFicha(pessoas[mod.seats[i]], 112.5 + i * PASSO_LUGAR) : '').join(''),
    `<text x="139" y="${Y_MESA + 212}" font-size="22" font-weight="600" fill="#f4f0e6">${esc(nomeEquipa)}</text>`,
    `<text x="141" y="${Y_MESA + 244}" font-size="14" fill="#cfc6b0">${esc(mod.kind === 'delegation' ? 'Mesa de delegação' : 'Mesa principal')}</text>`,
    `<text x="840" y="${Y_MESA + 245}" text-anchor="end" font-size="16" fill="#e8e3d4">${ocupados} de ${LUGARES} lugares</text>`,
    '</g>',
  ].join('');
};

/*
 * Normaliza a lista de mesas: usa a fornecida (completando lugares em falta)
 * ou gera uma a partir das pessoas — 4 por mesa, ordenadas por equipa.
 */
const normalizaModulos = (modulos, pessoas) => {
  if (Array.isArray(modulos) && modulos.length > 0) {
    return modulos.map((m) => ({
      ...m,
      seats: Array.from({ length: LUGARES }, (_, i) => m.seats?.[i] ?? null),
    }));
  }
  const porEquipa = new Map();
  for (const p of Object.values(pessoas)) {
    const equipa = p.teamId ?? 'geral';
    if (!porEquipa.has(equipa)) porEquipa.set(equipa, []);
    porEquipa.get(equipa).push(p.id);
  }
  const gerados = [];
  let n = 0;
  for (const [equipa, ids] of porEquipa) {
    for (let i = 0; i < ids.length; i += LUGARES) {
      gerados.push({
        id: `mod-gerado-${n}`,
        teamId: equipa,
        kind: i === 0 ? 'main' : 'expansion',
        seats: Array.from({ length: LUGARES }, (_, k) => ids[i + k] ?? null),
      });
      n += 1;
    }
  }
  return gerados;
};

/*
 * renderOffice(state) -> string de markup SVG do escritório.
 * Mesas de 4 lugares em grade de 3 colunas, com pessoas (avatar + emoji),
 * balões de pergunta persistentes e fichas (modelo, custo, CTX) por lugar.
 */
export function renderOffice(state = {}) {
  const bruto = Array.isArray(state.people) ? state.people : Object.values(state.people ?? {});
  const pessoas = Object.fromEntries(bruto.map((p) => [p.id, p]));
  const modulos = normalizaModulos(state.modules, pessoas);
  const teams = state.teams ?? {};
  const linhas = [];
  const totalLinhas = Math.ceil(modulos.length / COLUNAS);

  for (let r = 0; r < totalLinhas; r += 1) {
    const linha = [];
    const conectores = [];
    for (let c = 0; c < COLUNAS; c += 1) {
      const mod = modulos[r * COLUNAS + c];
      if (!mod) break;
      const x = c * LARGURA_MESA;
      const y = r * ALTURA_LINHA;
      linha.push(`<g transform="translate(${x} ${y})">${renderModulo(mod, pessoas, teams)}</g>`);
      if (c < COLUNAS - 1 && modulos[r * COLUNAS + c + 1]) {
        // connector a cobrir a emenda entre mesas consecutivas (x = 900)
        conectores.push(use('connector', x + LARGURA_MESA - 29, y + Y_MESA + 288 - 166, 58, 166));
      }
    }
    linhas.push(linha.join('') + conectores.join(''));
  }

  const largura = COLUNAS * LARGURA_MESA;
  const altura = totalLinhas > 0 ? totalLinhas * ALTURA_LINHA : ALTURA_LINHA;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" class="wg-escritorio" role="img" aria-label="Escritório de agentes">${linhas.join('')}</svg>`;
}