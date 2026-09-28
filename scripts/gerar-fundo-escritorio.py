#!/usr/bin/env python3
"""Gera o fundo de escritório (a parede do topo do mundo) do Modo jogo.

Arte original, só geometria vetorial (forro ripado com sanca, parede sálvia,
ripado de madeira, rodapé, janela grande com vista, figueira, quadros, relógio
e estante baixa), no mesmo traço do assets/furniture.svg. Python 3 da
biblioteca padrão, sem dependências. É a FONTE de:

  assets/office-backdrop.svg        — SVG standalone (viewBox 0 0 2900 360)
  dsh-plugin/src/cenario-fundo.txt  — o MESMO desenho como fragmento (só o
                                      <g class="wg-bg">, sem o <svg> exterior)
  dsh-plugin/src/client.js          — a constante FUNDO_ESCRITORIO (= o
                                      fragmento, embutido: o bundle não importa
                                      ficheiros irmãos)

Uso (na raiz do repositório; a raiz também pode ir como argumento):

  python3 scripts/gerar-fundo-escritorio.py              # regenera o .svg e o .txt
  python3 scripts/gerar-fundo-escritorio.py --embutir    # … e re-embute no client.js
  python3 scripts/gerar-fundo-escritorio.py --verificar  # só compara (sai 1 se diferir)

--embutir troca SÓ o texto entre "const FUNDO_ESCRITORIO = `" e "`;" no
client.js (idempotente). Depois de mudar o desenho: gerar, --embutir e correr
os testes (tests/plugin/render.test.mjs exige o fragmento byte a byte no
client.js e no assets/office-backdrop.svg). A largura W é a do mundo com
GRID.cols = 3 (40 + 3·940 + 40 = 2900): mudar as colunas obriga a mudar W
aqui. A sangria lateral da parede (renderOffice, sangriaParede) repete as
faixas do grupo wg-bg-parede com a mesma fase das ripas — um teste de
geometria compara as duas.

REGRA DE OURO: o visual do jogo não se re-estiliza sem pedido explícito do
utilizador. Este gerador existe para reproduzir EXATAMENTE os ficheiros
atuais (--verificar sem diferenças), não para os "melhorar".
"""
import sys
from pathlib import Path

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
REPO = Path(ARGS[0]) if ARGS else Path(__file__).resolve().parent.parent
W = 2900
H = 360

# ---------------------------------------------------------------- paleta
PAREDE = '#e4e8dc'          # sálvia muito clara (não compete com as mesas)
FORRO = '#efe6d4'
FORRO_RIPA = '#e0d3bb'
SANCA_A = '#faf6ed'
SANCA_B = '#f1ebdd'
SANCA_C = '#fbf8f1'
SANCA_TRACO = '#dcd1bc'
SANCA_BASE = '#d3c8b1'
LUZ = '#fbf6e4'
RIPADO = '#e2cfae'
RIPADO_FRISO = '#d0b78f'
RIPADO_BRILHO = '#ead9bd'
RODAMEIO = '#f4ecdc'
RODAMEIO_TRACO = '#cdbb9b'
RODAPE = '#cdb089'
RODAPE_TRACO = '#b09370'
RODAPE_BRILHO = '#dcc49f'
GUARNICAO = '#f7f3ea'
GUARNICAO_TRACO = '#d2c6af'
CORTINA = '#efe2cc'
CORTINA_TRACO = '#d4c2a2'
CORTINA_DOBRA = '#e2d1b3'
VARAO = '#b39a78'
QUADRO_TRACO = '#b7a283'
FOLHA = ['#5d9264', '#79a477', '#83aa79', '#64986b']
FOLHA_TRACO = '#477454'
VASO = '#fffaf0'
VASO_TRACO = '#d8d4c8'
MOVEL = '#f7f2e7'
MOVEL_TRACO = '#c8b99e'
LIVROS = ['#a9bfd2', '#d8b6a4', '#b6cdb3', '#cdc2dc', '#e3cfa6']

# Geometria da parede (referencial do mundo, origem 0,0)
Y_FORRO = 24          # forro ripado 0..24
Y_SANCA = 50          # sanca 22..50
Y_RAIL = 238          # rodameio 238..252
Y_RIPADO = 252        # ripado 252..334
Y_RODAPE = 334        # rodapé 334..H


def fmt(v):
    s = f'{v:.1f}'.rstrip('0').rstrip('.')
    return s


def linhas_verticais(x0, passo, y0, y1, x_max=W):
    partes = []
    x = x0
    while x < x_max:
        partes.append(f'M{fmt(x)} {y0}V{y1}')
        x += passo
    return ''.join(partes)


def folha(x, y, ang, esc, cor):
    """Folha larga (tipo figueira-lira) com base em (x,y), a apontar para cima rodada `ang` graus."""
    return (
        f'<g transform="translate({fmt(x)} {fmt(y)}) rotate({fmt(ang)}) scale({fmt(esc)})">'
        f'<path d="M0 0C9-5 21-24 21-41C21-57 11-64 0-64C-11-64-21-57-21-41C-21-24-9-5 0 0Z" fill="{cor}" stroke="{FOLHA_TRACO}" stroke-width="2.4"/>'
        f'<path d="M0-4V-52" stroke="#a7c69b" stroke-width="2" fill="none"/>'
        '</g>'
    )


def parede():
    out = []
    out.append('<g class="wg-bg-parede">')
    out.append(f'<rect width="{W}" height="{H}" fill="{PAREDE}"/>')
    # forro ripado (teto)
    out.append(f'<rect width="{W}" height="{Y_FORRO}" fill="{FORRO}"/>')
    out.append(f'<path d="{linhas_verticais(14, 30, 0, Y_FORRO)}" stroke="{FORRO_RIPA}" stroke-width="2"/>')
    # sanca em degraus
    out.append(f'<rect y="22" width="{W}" height="12" fill="{SANCA_A}"/>')
    out.append(f'<rect y="34" width="{W}" height="10" fill="{SANCA_B}"/>')
    out.append(f'<rect y="44" width="{W}" height="6" fill="{SANCA_C}"/>')
    out.append(f'<path d="M0 23H{W}M0 34H{W}" stroke="{SANCA_TRACO}" stroke-width="2"/>')
    out.append(f'<path d="M0 50H{W}" stroke="{SANCA_BASE}" stroke-width="2.5"/>')
    # luz quente da sanca a cair na parede (dois degraus planos, sem gradiente)
    out.append(f'<rect y="51" width="{W}" height="12" fill="{LUZ}" opacity=".7"/>')
    out.append(f'<rect y="63" width="{W}" height="14" fill="{LUZ}" opacity=".3"/>')
    # ripado (lambri de madeira até meia altura)
    out.append(f'<rect y="{Y_RIPADO}" width="{W}" height="{Y_RODAPE - Y_RIPADO}" fill="{RIPADO}"/>')
    out.append(f'<path d="{linhas_verticais(17, 26, Y_RIPADO + 2, Y_RODAPE - 2)}" stroke="{RIPADO_BRILHO}" stroke-width="2"/>')
    out.append(f'<path d="{linhas_verticais(13, 26, Y_RIPADO + 2, Y_RODAPE - 2)}" stroke="{RIPADO_FRISO}" stroke-width="3"/>')
    # rodameio (moldura por cima do ripado)
    out.append(f'<rect y="{Y_RAIL}" width="{W}" height="{Y_RIPADO - Y_RAIL}" fill="{RODAMEIO}"/>')
    out.append(f'<path d="M0 {Y_RAIL + 8}H{W}" stroke="#e6d9c1" stroke-width="2"/>')
    out.append(f'<path d="M0 {Y_RAIL}H{W}M0 {Y_RIPADO}H{W}" stroke="{RODAMEIO_TRACO}" stroke-width="2.5"/>')
    # rodapé
    out.append(f'<rect y="{Y_RODAPE}" width="{W}" height="{H - Y_RODAPE}" fill="{RODAPE}"/>')
    out.append(f'<path d="M0 {Y_RODAPE + 5}H{W}" stroke="{RODAPE_BRILHO}" stroke-width="3"/>')
    out.append(f'<path d="M0 {Y_RODAPE}H{W}M0 {H - 1}H{W}" stroke="{RODAPE_TRACO}" stroke-width="2.5"/>')
    out.append('</g>')
    return out


def blocos(gx0, base, lista):
    """Silhueta de prédios: lista de (dx0, dx1, topo) relativa ao vidro; blocos contíguos formam um só contorno."""
    d = []
    anterior = None
    for (dx0, dx1, topo) in lista:
        x0, x1 = gx0 + dx0, gx0 + dx1
        if anterior is None or x0 != anterior:
            if anterior is not None:
                d.append(f'V{base}Z')
            d.append(f'M{x0} {base}V{topo}')
        else:
            d.append(f'V{topo}')
        d.append(f'H{x1}')
        anterior = x1
    d.append(f'V{base}Z')
    return ''.join(d)


def janela():
    """Janela grande à esquerda, com vista (céu, sol, nuvens, prédios, árvores) e cortinas."""
    x0, y0, w, h = 110, 78, 700, 154      # caixilho 110..810 x 78..232
    gx0, gy0, gw, gh = x0 + 9, y0 + 9, w - 18, h - 18   # vidro 119..801 x 87..223
    base = gy0 + gh                       # 223
    cx = x0 + w // 2                      # eixo da janela (460), para espelhar a cortina
    out = ['<g class="wg-bg-janela">']
    # guarnição (alizar) + caixilho + vidro
    out.append(f'<rect x="{x0 - 12}" y="{y0 - 12}" width="{w + 24}" height="{h + 20}" rx="8" fill="{GUARNICAO}" stroke="{GUARNICAO_TRACO}" stroke-width="2.5"/>')
    out.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="6" fill="#a2bac7"/>')
    out.append(f'<rect x="{gx0}" y="{gy0}" width="{gw}" height="{gh}" rx="4" fill="#cde6ee"/>')
    # sol e nuvens
    out.append('<circle cx="706" cy="122" r="18" fill="#f4eed6"/>')
    out.append('<path d="M234 132H294Q302 132 300 124Q298 117 288 118Q286 106 273 105Q262 104 257 114Q250 109 243 114Q238 118 239 123Q230 124 230 128Q230 132 234 132Z" fill="#e8f4f6"/>')
    out.append('<path d="M520 110H562Q568 110 567 104Q565 99 558 100Q555 92 546 92Q538 92 535 99Q529 96 524 100Q520 103 521 106Q516 107 516 109Q516 110 520 110Z" fill="#e8f4f6"/>')
    # prédios ao longe (a mesma cor do wg-window) e mais perto
    longe = [(0, 36, 170), (36, 74, 146), (74, 104, 176), (104, 140, 128), (140, 176, 164), (176, 212, 154),
             (262, 288, 164), (288, 322, 136), (322, 358, 160), (358, 394, 118), (394, 430, 168), (430, 468, 148),
             (536, 570, 160), (570, 606, 136), (606, 642, 172), (642, 682, 150)]
    perto = [(0, 44, 188), (44, 86, 174), (86, 126, 196), (126, 164, 184),
             (318, 352, 192), (352, 392, 170), (392, 428, 190),
             (470, 510, 186), (510, 548, 174), (548, 590, 194)]
    out.append(f'<path d="{blocos(gx0, base, longe)}" fill="#b7d8e3"/>')
    out.append(f'<path d="{blocos(gx0, base, perto)}" fill="#a9cedb"/>')
    # janelinhas acesas nos prédios mais altos (só se veem de perto)
    luzes = ''.join(f'M{gx0 + dx} {y}h6' for (dx, y) in ((112, 140), (124, 140), (112, 152), (124, 152), (368, 130), (380, 130), (368, 142), (380, 142), (580, 150), (592, 150)))
    out.append(f'<path d="{luzes}" stroke="#d6ecf1" stroke-width="5" stroke-linecap="butt"/>')
    # copas de árvores na base da vista
    out.append(f'<path d="M{gx0 + 196} {base}Q{gx0 + 198} 200 {gx0 + 218} 202Q{gx0 + 224} 190 {gx0 + 242} 196Q{gx0 + 258} 188 {gx0 + 268} 202Q{gx0 + 286} 200 {gx0 + 290} {base}Z'
               f'M{gx0 + 592} {base}Q{gx0 + 592} 204 {gx0 + 610} 204Q{gx0 + 618} 194 {gx0 + 634} 200Q{gx0 + 650} 194 {gx0 + 660} 204Q{gx0 + gw} 204 {gx0 + gw} {base}Z" fill="#b5d5c2"/>')
    # reflexos no vidro
    out.append(f'<path d="M{gx0 + 50} 172L{gx0 + 84} 126M{gx0 + 64} 178L{gx0 + 92} 140M{gx0 + 480} 150L{gx0 + 508} 112" stroke="#e7f4f5" stroke-width="4" opacity=".75"/>')
    # montantes (3 folhas) e peitoril interior
    m1, m2 = gx0 + gw // 3, gx0 + 2 * gw // 3
    out.append(f'<path d="M{m1} {gy0}V{base}M{m2} {gy0}V{base}" stroke="#a2bac7" stroke-width="7"/>')
    out.append(f'<path d="M{gx0} {base - 5}H{gx0 + gw}" stroke="#e7f4f5" stroke-width="8"/>')
    # peitoril exterior (assenta no rodameio)
    out.append(f'<rect x="{x0 - 18}" y="{y0 + h - 2}" width="{w + 36}" height="12" rx="4" fill="#faf7f0" stroke="{GUARNICAO_TRACO}" stroke-width="2.5"/>')
    # varão e cortinas
    out.append(f'<path d="M{x0 - 26} 62H{x0 + w + 26}" stroke="{VARAO}" stroke-width="5"/>')
    out.append(f'<circle cx="{x0 - 28}" cy="62" r="7" fill="#c9b08b" stroke="#a68c69" stroke-width="2"/>')
    out.append(f'<circle cx="{x0 + w + 28}" cy="62" r="7" fill="#c9b08b" stroke="#a68c69" stroke-width="2"/>')
    esq = ('M88 64H152Q144 150 164 238Q146 244 128 238Q110 244 92 238Q82 150 88 64Z', 'M110 68Q104 150 110 236M132 68Q128 150 142 236')
    out.append(f'<g fill="{CORTINA}" stroke="{CORTINA_TRACO}" stroke-width="2.5">')
    out.append(f'<path d="{esq[0]}"/>')
    out.append(f'<path d="{esq[0]}" transform="translate({2 * cx} 0) scale(-1 1)"/>')
    out.append('</g>')
    out.append(f'<g fill="none" stroke="{CORTINA_DOBRA}" stroke-width="2.5">')
    out.append(f'<path d="{esq[1]}"/>')
    out.append(f'<path d="{esq[1]}" transform="translate({2 * cx} 0) scale(-1 1)"/>')
    out.append('</g>')
    # argolas no varão
    argolas = ''.join(f'M{x} 59v7' for x in (94, 116, 138, 2 * cx - 94, 2 * cx - 116, 2 * cx - 138))
    out.append(f'<path d="{argolas}" stroke="#a68c69" stroke-width="3"/>')
    out.append('</g>')
    return out


def figueira():
    """Planta alta de chão (figueira-lira) junto à janela."""
    px = 908
    out = ['<g class="wg-bg-planta">']
    # tronco e ramos
    out.append(f'<path d="M{px} 300C{px - 2} 262 {px + 4} 214 {px - 2} 150M{px - 1} 246C{px - 14} 232 {px - 24} 222 {px - 34} 210M{px + 1} 212C{px + 14} 200 {px + 24} 188 {px + 30} 176" fill="none" stroke="#8a735d" stroke-width="4"/>')
    folhas = [
        (px - 1, 284, -100, .66, FOLHA[3]),
        (px + 1, 280, 98, .62, FOLHA[1]),
        (px - 2, 262, -84, .82, FOLHA[0]),
        (px + 1, 258, 84, .78, FOLHA[2]),
        (px - 1, 232, -66, .92, FOLHA[3]),
        (px + 1, 222, 64, .9, FOLHA[1]),
        (px - 34, 210, -48, .86, FOLHA[2]),
        (px + 30, 176, 50, .84, FOLHA[0]),
        (px - 1, 176, -30, .92, FOLHA[1]),
        (px + 1, 170, 34, .86, FOLHA[3]),
        (px - 2, 152, 0, 1.0, FOLHA[0]),
    ]
    out.extend(folha(*f) for f in folhas)
    # vaso (mesma linguagem do wg-plant)
    out.append(f'<path d="M{px - 30} 302H{px + 30}L{px + 23} 352Q{px} 360 {px - 23} 352Z" fill="{VASO}" stroke="{VASO_TRACO}" stroke-width="2.5"/>')
    out.append(f'<rect x="{px - 34}" y="294" width="68" height="11" rx="4" fill="#f4efe4" stroke="{VASO_TRACO}" stroke-width="2.5"/>')
    out.append('</g>')
    return out


def quadros():
    out = ['<g class="wg-bg-quadros" transform="translate(84 0)">']
    # quadro paisagem
    out.append(f'<path d="M1030 106L1049 90L1068 106" fill="none" stroke="{QUADRO_TRACO}" stroke-width="2"/><circle cx="1049" cy="90" r="3" fill="{QUADRO_TRACO}"/>')
    out.append(f'<rect x="990" y="104" width="118" height="86" rx="4" fill="#fbf8f1" stroke="{QUADRO_TRACO}" stroke-width="2.5"/>')
    out.append('<rect x="1002" y="116" width="94" height="62" fill="#d9e8eb"/>')
    out.append('<circle cx="1074" cy="134" r="8" fill="#eed7aa"/>')
    out.append('<path d="M1002 178V158Q1024 138 1046 154Q1066 136 1096 156V178Z" fill="#b3cdb0"/>')
    out.append('<path d="M1002 178V168Q1040 152 1070 168Q1084 162 1096 166V178Z" fill="#95b898"/>')
    # quadro retrato (abstrato, cores das mesas esbatidas)
    out.append(f'<rect x="1128" y="118" width="66" height="90" rx="4" fill="#fbf8f1" stroke="{QUADRO_TRACO}" stroke-width="2.5"/>')
    out.append('<rect x="1138" y="128" width="46" height="70" fill="#f1e3cf"/>')
    out.append('<circle cx="1161" cy="152" r="13" fill="#dfb29d"/>')
    out.append('<rect x="1144" y="174" width="34" height="10" rx="3" fill="#a9bfd3"/>')
    out.append('<rect x="1150" y="187" width="22" height="5" rx="2" fill="#b6cdb3"/>')
    out.append('</g>')
    return out


def relogio():
    cx, cy = 1664, 138
    out = ['<g class="wg-bg-relogio">']
    out.append(f'<circle cx="{cx}" cy="{cy}" r="30" fill="#fdfbf6" stroke="#8c9da7" stroke-width="5"/>')
    out.append(f'<path d="M{cx} {cy - 22}V{cy - 16}M{cx + 22} {cy}H{cx + 16}M{cx} {cy + 22}V{cy + 16}M{cx - 22} {cy}H{cx - 16}" stroke="#b3bfc6" stroke-width="3"/>')
    out.append(f'<path d="M{cx} {cy}L{cx - 12} {cy - 7}" stroke="#56666f" stroke-width="4"/>')
    out.append(f'<path d="M{cx} {cy}L{cx + 16} {cy - 10}" stroke="#56666f" stroke-width="3"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="3.5" fill="#56666f"/>')
    out.append('</g>')
    return out


def estante():
    """Estante baixa à direita, com livros, cesto, planta pendente e candeeiro."""
    x0, x1 = 2410, 2700
    top, bot = 262, 352
    meio = 308
    cols = [x0, 2507, 2603, x1]
    out = ['<g class="wg-bg-estante">']
    # pés
    out.append(f'<path d="M{x0 + 14} {bot}V358M{x1 - 14} {bot}V358" stroke="#b8a283" stroke-width="6"/>')
    # corpo, nichos (fundo ligeiramente mais escuro) e tampo
    out.append(f'<rect x="{x0}" y="{top}" width="{x1 - x0}" height="{bot - top}" rx="6" fill="{MOVEL}" stroke="{MOVEL_TRACO}" stroke-width="2.5"/>')
    nichos = []
    for i in range(3):
        for (ya, yb) in ((top + 6, meio - 3), (meio + 3, bot - 6)):
            nichos.append(f'<rect x="{cols[i] + 6}" y="{ya}" width="{cols[i + 1] - cols[i] - 12}" height="{yb - ya}" rx="3" fill="#ece3d1"/>')
    out.extend(nichos)
    out.append(f'<path d="M{x0 + 4} {meio}H{x1 - 4}M{cols[1]} {top + 4}V{bot - 4}M{cols[2]} {top + 4}V{bot - 4}" stroke="{MOVEL_TRACO}" stroke-width="2.5"/>')
    out.append(f'<rect x="{x0 - 8}" y="{top - 8}" width="{x1 - x0 + 16}" height="11" rx="4" fill="#fbf8f1" stroke="{MOVEL_TRACO}" stroke-width="2.5"/>')
    # livros em pé (nicho superior esquerdo)
    livros = [(2422, 12, 34, 0), (2435, 10, 30, 1), (2446, 14, 36, 2), (2461, 9, 28, 3), (2471, 12, 32, 4)]
    for (x, lw, lh, c) in livros:
        out.append(f'<rect x="{x}" y="{meio - 3 - lh}" width="{lw}" height="{lh}" rx="2" fill="{LIVROS[c]}" stroke="#9fa8a8" stroke-width="1.5"/>')
    # cesto (nicho superior do meio)
    out.append(f'<rect x="2521" y="{meio - 27}" width="68" height="24" rx="5" fill="#dcc8a6" stroke="#bda57f" stroke-width="2"/>')
    out.append(f'<path d="M2530 {meio - 20}H2580M2530 {meio - 11}H2580" stroke="#c9b28c" stroke-width="2"/>')
    # livros deitados (nicho superior direito)
    for (x, y, lw, c) in ((2616, meio - 13, 60, 0), (2620, meio - 23, 52, 4), (2614, meio - 33, 56, 2)):
        out.append(f'<rect x="{x}" y="{y}" width="{lw}" height="10" rx="2" fill="{LIVROS[c]}" stroke="#9fa8a8" stroke-width="1.5"/>')
    # fila de baixo: pastas (esq.), vazio calmo (meio), livros (dir.)
    for (x, lw, lh, c) in ((2424, 16, 36, 2), (2442, 16, 36, 0), (2460, 16, 36, 3)):
        out.append(f'<rect x="{x}" y="{bot - 6 - lh}" width="{lw}" height="{lh}" rx="2" fill="{LIVROS[c]}" stroke="#9fa8a8" stroke-width="1.5"/>')
    # dois cestos de tecido (nicho inferior do meio)
    for (x, cor, pega) in ((2518, '#b6cdb3', '#9dbb9a'), (2558, '#d8b6a4', '#c7a08c')):
        out.append(f'<rect x="{x}" y="{bot - 32}" width="34" height="26" rx="3" fill="{cor}" stroke="#9fa8a8" stroke-width="1.5"/>')
        out.append(f'<rect x="{x + 9}" y="{bot - 26}" width="16" height="5" rx="2" fill="{pega}"/>')
    for (x, lw, lh, c) in ((2618, 11, 32, 1), (2630, 13, 36, 4), (2644, 10, 30, 0)):
        out.append(f'<rect x="{x}" y="{bot - 6 - lh}" width="{lw}" height="{lh}" rx="2" fill="{LIVROS[c]}" stroke="#9fa8a8" stroke-width="1.5"/>')
    # planta pendente em cima (jiboia): vaso no tampo e rama a cair pelo lado esquerdo
    out.append(f'<path d="M2434 {top - 12}Q2404 {top - 12} 2400 {top + 8}Q2396 {top + 30} 2403 {top + 52}Q2407 {top + 64} 2399 {top + 78}" fill="none" stroke="{FOLHA_TRACO}" stroke-width="2"/>')
    for (x, y, a, e, c) in ((2416, top - 11, -120, .34, FOLHA[1]), (2400, top + 10, 200, .32, FOLHA[0]), (2398, top + 32, -150, .3, FOLHA[3]),
                            (2404, top + 54, 160, .32, FOLHA[1]), (2400, top + 76, -165, .28, FOLHA[0])):
        out.append(folha(x, y, a, e, c))
    out.append(f'<path d="M2426 {top - 38}H2468L2463 {top - 9}H2431Z" fill="{VASO}" stroke="{VASO_TRACO}" stroke-width="2.5"/>')
    for (x, y, a, e, c) in ((2440, top - 38, -40, .42, FOLHA[0]), (2448, top - 38, 8, .46, FOLHA[1]), (2456, top - 38, 52, .4, FOLHA[3])):
        out.append(folha(x, y, a, e, c))
    # candeeiro de mesa
    out.append(f'<path d="M2632 {top - 9}H2672" stroke="#8c9da7" stroke-width="5"/>')
    out.append(f'<path d="M2652 {top - 10}V{top - 52}" stroke="#8c9da7" stroke-width="3.5"/>')
    out.append(f'<path d="M2628 {top - 50}L2636 {top - 84}H2668L2676 {top - 50}Z" fill="#f6ead2" stroke="{MOVEL_TRACO}" stroke-width="2.5"/>')
    out.append('</g>')
    return out


def fragmento():
    partes = ['<g class="wg-bg" pointer-events="none" stroke-linejoin="round" stroke-linecap="round">']
    for bloco in (parede(), janela(), figueira(), quadros(), relogio(), estante()):
        partes.extend('  ' + linha for linha in bloco)
    partes.append('</g>')
    return '\n'.join(partes) + '\n'


def standalone(frag):
    cabecalho = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" id="wg-bg-escritorio">\n'
        '<!-- Fundo de escritório do Modo jogo: forro ripado com sanca, parede sálvia,\n'
        f'     ripado de madeira até meia altura, rodapé (o chão começa em y={H}) e uma janela\n'
        '     grande à esquerda. Arte original, só geometria vetorial, sem texto nem raster.\n'
        '     O mesmo desenho, sem o <svg> exterior, está em dsh-plugin/src/cenario-fundo.txt. -->\n'
    )
    return cabecalho + frag + '</svg>\n'


INICIO_CONST = 'const FUNDO_ESCRITORIO = `'


def embutido(client, frag):
    """client.js com FUNDO_ESCRITORIO = o fragmento (sem a quebra final)."""
    corpo = frag.rstrip('\n')
    for proibido in ('`', '${', '\\'):
        assert proibido not in corpo, f'o fragmento não pode ter {proibido!r} (template literal)'
    assert client.count(INICIO_CONST) == 1, 'FUNDO_ESCRITORIO não encontrado (uma vez) no client.js'
    i = client.index(INICIO_CONST) + len(INICIO_CONST)
    j = client.index('`;', i)
    return client[:i] + corpo + client[j:]


def main():
    frag = fragmento()
    svg = standalone(frag)
    alvos = {
        REPO / 'assets' / 'office-backdrop.svg': svg,
        REPO / 'dsh-plugin' / 'src' / 'cenario-fundo.txt': frag,
    }
    client = REPO / 'dsh-plugin' / 'src' / 'client.js'
    if '--verificar' in sys.argv:
        diferentes = [str(p.relative_to(REPO)) for p, conteudo in alvos.items()
                      if not p.exists() or p.read_text(encoding='utf-8') != conteudo]
        atual = client.read_text(encoding='utf-8')
        if embutido(atual, frag) != atual:
            diferentes.append('dsh-plugin/src/client.js (FUNDO_ESCRITORIO)')
        if diferentes:
            print('DIFERENTE: ' + ', '.join(diferentes))
            sys.exit(1)
        print(f'igual: office-backdrop.svg ({len(svg)} B), cenario-fundo.txt ({len(frag)} B) e FUNDO_ESCRITORIO')
        return
    for p, conteudo in alvos.items():
        p.write_text(conteudo, encoding='utf-8')
    print(f'ok: H={H} svg={len(svg)}B fragmento={len(frag)}B')
    if '--embutir' in sys.argv:
        atual = client.read_text(encoding='utf-8')
        novo = embutido(atual, frag)
        if novo != atual:
            client.write_text(novo, encoding='utf-8')
            print('client.js: FUNDO_ESCRITORIO atualizado')
        else:
            print('client.js: FUNDO_ESCRITORIO já igual')


if __name__ == '__main__':
    main()
