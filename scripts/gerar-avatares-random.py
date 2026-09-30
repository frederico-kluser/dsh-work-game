#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gerar-avatares-random.py — gera os 48 SVGs das identidades aleatórias (r01..r12).

A FONTE de verdade é `expressions.js` (config de cada identidade + presets).
Este script:

  1. lê `expressions.js` (identidades aleatórias e triples dos presets);
  2. descarrega cada `assets/avatars/random/<id>/<preset>.svg` do renderer
     avataaars.io (dev-time; a app nunca chama o serviço em runtime);
  3. valida TUDO (XML/viewBox, sem scripts nem URLs externas, identidade FIXA
     entre presets — só olhos/sobrancelha/boca mudam —, regras de género da
     piscina e rasterização não vazia);
  4. atualiza as partes mecânicas de `assets/AVATARS-EXPRESSIONS.md`
     (tabela de config, URLs de proveniência, tamanhos e SHA-256).

Regras de desenho da piscina (2026-09-29, pedido do utilizador):
  - género coerente: identidades `gender:'f'` NUNCA têm barba/bigode;
  - zero chapéus/bonés (`Hat`, `WinterHat1..4`) — o "boné" repetido saiu;
  - 12 `topType` todos distintos;
  - óculos só de lente transparente (`Prescription01/02`, `Round`) — as
    expressões da demo mudam os olhos e lentes opacas escondê-las-iam.

Uso:
  python3 scripts/gerar-avatares-random.py               # gerar + validar + doc
  python3 scripts/gerar-avatares-random.py --validar      # só validar o disco
  python3 scripts/gerar-avatares-random.py --validar --doc # validar + atualizar o doc
  python3 scripts/gerar-avatares-random.py --sem-doc      # sem tocar no .md
  python3 scripts/gerar-avatares-random.py --so r01,r02   # só estas identidades

Exit codes: 0 sucesso · 1 validação falhou · 2 uso inválido.
"""

import hashlib
import re
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
EXPRESSOES_JS = RAIZ / 'expressions.js'
DIR_RANDOM = RAIZ / 'assets' / 'avatars' / 'random'
DIR_EXPRESSOES = RAIZ / 'assets' / 'avatars' / 'expressions'
DOC = RAIZ / 'assets' / 'AVATARS-EXPRESSIONS.md'

URL_BASE = 'https://avataaars.io/'
# Ordem canónica das chaves de query (documentada em AVATARS-EXPRESSIONS.md).
CHAVES_URL = [
    ('avatarStyle', 'Transparent'),
    ('eyeType', None), ('eyebrowType', None),
    ('topType', None), ('hairColor', None), ('accessoriesType', None),
    ('facialHairType', None), ('facialHairColor', None),
    ('clotheType', None), ('graphicType', None),
    ('clotheColor', None), ('mouthType', None), ('skinColor', None),
]

CHAPEUS = {'Hat', 'WinterHat1', 'WinterHat2', 'WinterHat3', 'WinterHat4'}
OCULOS_OPAQUE = {'Sunglasses', 'Wayfarers'}
CABECAS_FACE = ('Mouth/', 'Eyes/', 'Eyebrow/')

# Paletas oficiais (src/avatar/top/HairColor.tsx, src/avatar/Skin.tsx,
# src/avatar/clothes/Colors.tsx) — usadas para provar que a cor pedida na URL
# foi mesmo a renderizada.
PALHETAS = {
    'hairColor': {'Auburn': '#A55728', 'Black': '#2C1B18', 'Blonde': '#B58143',
                  'BlondeGolden': '#D6B370', 'Brown': '#724133', 'BrownDark': '#4A312C',
                  'PastelPink': '#F59797', 'Blue': '#000FDB', 'Platinum': '#ECDCBF',
                  'Red': '#C93305', 'SilverGray': '#E8E1E1'},
    'skinColor': {'Tanned': '#FD9841', 'Yellow': '#F8D25C', 'Pale': '#FFDBB4',
                  'Light': '#EDB98A', 'Brown': '#D08B5B', 'DarkBrown': '#AE5D29',
                  'Black': '#614335'},
    'clotheColor': {'Black': '#262E33', 'Blue01': '#65C9FF', 'Blue02': '#5199E4',
                    'Blue03': '#25557C', 'Gray01': '#E6E6E6', 'Gray02': '#929598',
                    'Heather': '#3C4F5C', 'PastelBlue': '#B1E2FF', 'PastelGreen': '#A7FFC4',
                    'PastelOrange': '#FFDEB5', 'PastelRed': '#FFAFB9', 'PastelYellow': '#FFFFB1',
                    'Pink': '#FF488E', 'Red': '#FF5C5C', 'White': '#FFFFFF'},
}


def palavras_camel(nome):
    return re.findall(r'[A-Z][a-z]*|\d+', nome)


def erro(msg):
    print(f'Erro: {msg}', file=sys.stderr)
    sys.exit(1)


def uso_invalido(msg):
    print(f'Erro: {msg} — Solução: use --validar [--doc], --sem-doc ou --so r01,r02', file=sys.stderr)
    sys.exit(2)


# ------------------------------------------------------------------ #
# 1. Ler expressions.js (FONTE de verdade)                            #
# ------------------------------------------------------------------ #

def carregar_expressoes():
    """Devolve (identidades, presets) lidos de expressions.js."""
    texto = EXPRESSOES_JS.read_text(encoding='utf-8')

    presets = {}
    for m in re.finditer(
        r"\{\s*id:\s*'([^']+)'\s*,\s*label:\s*'[^']*'\s*,\s*eyeType:\s*'([^']+)'\s*,"
        r"\s*eyebrowType:\s*'([^']+)'\s*,\s*mouthType:\s*'([^']+)'", texto
    ):
        presets[m.group(1)] = {
            'eyeType': m.group(2), 'eyebrowType': m.group(3), 'mouthType': m.group(4)
        }
    if not presets:
        erro(f'nenhum preset encontrado em {EXPRESSOES_JS.name}')

    identidades = {}
    for m in re.finditer(r"\b(r\d{2}):\s*\{(.*?)\}", texto, re.S):
        bloco = m.group(2)
        campos = dict(re.findall(r"(\w+):\s*'([^']*)'", bloco))
        lista = re.search(r"presets:\s*\[([^\]]*)\]", bloco)
        campos['presets'] = re.findall(r"'([^']+)'", lista.group(1)) if lista else []
        identidades[m.group(1)] = campos
    if len(identidades) != 12:
        erro(f'esperadas 12 identidades rNN em expressions.js, encontradas {len(identidades)}')

    for id_, cfg in identidades.items():
        if cfg.get('type') != 'random':
            erro(f'{id_}: type != random em expressions.js')
        for campo in ('gender', 'topType', 'hairColor', 'accessoriesType', 'facialHairType',
                      'facialHairColor', 'clotheType', 'clotheColor', 'skinColor'):
            if not cfg.get(campo):
                erro(f'{id_}: campo obrigatório {campo!r} em falta')
        if not cfg['presets']:
            erro(f'{id_}: lista de presets vazia')
        for p in cfg['presets']:
            if p not in presets:
                erro(f'{id_}: preset desconhecido {p!r}')
    return identidades, presets


def url_de(cfg, preset, presets):
    """URL avataaars.io na ordem canónica de CHAVES_URL."""
    triple = presets[preset]
    valores = {
        'eyeType': triple['eyeType'], 'eyebrowType': triple['eyebrowType'],
        'mouthType': triple['mouthType'], 'topType': cfg['topType'],
        'hairColor': cfg['hairColor'], 'accessoriesType': cfg['accessoriesType'],
        'facialHairType': cfg['facialHairType'], 'facialHairColor': cfg['facialHairColor'],
        'clotheType': cfg['clotheType'], 'clotheColor': cfg['clotheColor'],
        'skinColor': cfg['skinColor'], 'graphicType': cfg.get('graphicType'),
    }
    pares = []
    for chave, fixo in CHAVES_URL:
        valor = fixo if fixo is not None else valores.get(chave)
        if valor:
            pares.append(f'{chave}={valor}')
    return URL_BASE + '?' + '&'.join(pares)


# ------------------------------------------------------------------ #
# 2. Descarregar                                                      #
# ------------------------------------------------------------------ #

def descarregar(url, tentativas=3):
    ultimo = None
    for tentativa in range(1, tentativas + 1):
        try:
            pedido = urllib.request.Request(url, headers={'User-Agent': 'dsh-work-game/gerar-avatares-random'})
            with urllib.request.urlopen(pedido, timeout=60) as resp:
                corpo = resp.read()
                tipo = resp.headers.get('Content-Type', '')
            if b'<svg' not in corpo[:400] or 'svg' not in tipo:
                raise ValueError(f'resposta não é SVG ({tipo}, {len(corpo)} bytes)')
            return corpo
        except Exception as exc:  # rede/5xx: repetir
            ultimo = exc
            time.sleep(2 * tentativa)
    return ultimo


# ------------------------------------------------------------------ #
# 3. Validar                                                          #
# ------------------------------------------------------------------ #

def trecho_face_mascarado(elem, mapa_ids):
    """Serial canónico do elemento; grupos de face viram marcador único."""
    id_ = elem.attrib.get('id', '')
    if id_.startswith(CABECAS_FACE):
        return ('FACE',)
    atributos = tuple(sorted(
        (k, normalizar_ids(v, mapa_ids)) for k, v in elem.attrib.items()
        if not k.startswith('{http://www.w3.org/2000/xmlns/}')
    ))
    filhos = tuple(trecho_face_mascarado(f, mapa_ids) for f in list(elem))
    return (elem.tag.split('}')[-1], atributos, filhos)


def normalizar_ids(valor, mapa_ids):
    """Ids `react-*` são globais por pedido do renderer — normalizar por ordem."""
    def sub(m):
        chave = m.group(0)
        if chave not in mapa_ids:
            mapa_ids[chave] = f'react-#{len(mapa_ids) + 1}'
        return mapa_ids[chave]
    return re.sub(r'react-[a-z]+-\d+', sub, valor)


def ids_semanticos(elem):
    return [a for a in (e.attrib.get('id', '') for e in elem.iter()) if a and not a.startswith('react-')]


def camel_para_traco(texto):
    return re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', texto)


def validar_svg(caminho, corpo, cfg, preset, presets, problemas):
    nome = f'{caminho}'
    try:
        raiz = ET.fromstring(corpo)
    except ET.ParseError as exc:
        problemas.append(f'{nome}: XML mal formado ({exc})')
        return None
    if raiz.tag.split('}')[-1] != 'svg':
        problemas.append(f'{nome}: raiz não é <svg>')
    if raiz.attrib.get('viewBox') != '0 0 264 280':
        problemas.append(f'{nome}: viewBox {raiz.attrib.get("viewBox")!r} != "0 0 264 280"')

    texto = corpo.decode('utf-8', errors='replace')
    for proibido, razao in (
        ('<script', 'script'), ('<foreignObject', 'foreignObject'), ('<!DOCTYPE', 'DOCTYPE'),
        ('<!ENTITY', 'entidade'), ('@import', '@import'), ('javascript:', 'javascript:'),
    ):
        if proibido in texto:
            problemas.append(f'{nome}: contém {razao}')
    if re.search(r'\son[a-z]+\s*=', texto):
        problemas.append(f'{nome}: atributo de evento on*')
    for m in re.finditer(r'(?:xlink:)?href="([^"]+)"', texto):
        if not m.group(1).startswith('#'):
            problemas.append(f'{nome}: href externo {m.group(1)!r}')
    for m in re.finditer(r'url\(([^)]+)\)', texto):
        if not m.group(1).strip('"\'#') or not m.group(1).lstrip('"\'').startswith('#'):
            problemas.append(f'{nome}: url() externo {m.group(1)!r}')

    # triple do preset tem de aparecer nos ids dos grupos da face
    triple = presets[preset]
    ids = ids_semanticos(raiz)
    boca = [i for i in ids if i.startswith('Mouth/')]
    olhos = [i for i in ids if i.startswith('Eyes/')]
    sobrolho = [i for i in ids if i.startswith('Eyebrow/')]
    for grupo, esperado, achados in (
        ('Mouth', triple['mouthType'], boca),
        ('Eyes', triple['eyeType'], olhos),
        ('Eyebrow', triple['eyebrowType'], sobrolho),
    ):
        if not achados:
            problemas.append(f'{nome}: grupo {grupo}/ em falta')
        elif not any(camel_para_traco(esperado) in i for i in achados):
            problemas.append(f'{nome}: {grupo} {achados[0]!r} não casa com {esperado!r}')

    # partes renderizadas têm de casar com a config da identidade (prova de que
    # a URL pediu exatamente o que expressions.js declara)
    def nos(prefixo):
        return [i for i in ids if i.startswith(prefixo)]

    def confere_partes(rotulo, prefixo, nome_opcao, problemas_):
        juntos = ' '.join(prefixo)
        # palavras só numéricas ficam de fora: p.ex. `LongHairStraight2` é
        # renderizado como `Top/Long-Hair/Straight` (o "2" não vai para o id).
        for palavra in (p for p in palavras_camel(nome_opcao) if not p.isdigit()):
            if palavra not in juntos:
                problemas_.append(f'{nome}: {rotulo} {nome_opcao} não renderizado (visto: {juntos!r})')
                return

    confere_partes('topType', [i for i in nos('Top/') if not i.startswith('Top/_Resources/')], cfg['topType'], problemas)
    if cfg['facialHairType'] == 'Blank':
        if nos('Facial-Hair/'):
            problemas.append(f'{nome}: facialHairType Blank mas renderizou {nos("Facial-Hair/")[0]!r}')
    else:
        confere_partes('facialHairType', nos('Facial-Hair/'), cfg['facialHairType'], problemas)
    if cfg['accessoriesType'] == 'Blank':
        if nos('Top/_Resources/'):
            problemas.append(f'{nome}: accessoriesType Blank mas renderizou {nos("Top/_Resources/")[0]!r}')
    else:
        confere_partes('accessoriesType', nos('Top/_Resources/'), cfg['accessoriesType'], problemas)
    confere_partes('clotheType', nos('Clothing/'), cfg['clotheType'], problemas)
    if cfg.get('graphicType'):
        confere_partes('graphicType', nos('Clothing/Graphic/'), cfg['graphicType'], problemas)

    # cores: o hex da paleta oficial tem de estar no render (comprovativo de que
    # o renderer aplicou o parâmetro e não o default)
    for campo in ('hairColor', 'skinColor', 'clotheColor'):
        hex_ = PALHETAS[campo][cfg[campo]]
        if hex_.lower() not in texto.lower():
            problemas.append(f'{nome}: {campo}={cfg[campo]} ({hex_}) ausente do render')
    if cfg['facialHairType'] != 'Blank':
        hex_ = PALHETAS['hairColor'][cfg['facialHairColor']]
        if hex_.lower() not in texto.lower():
            problemas.append(f'{nome}: facialHairColor={cfg["facialHairColor"]} ({hex_}) ausente do render')

    mapa_ids = {}
    canon = trecho_face_mascarado(raiz, mapa_ids)
    return canon


def validar_piscina(identidades, problemas):
    tops = [c['topType'] for c in identidades.values()]
    repetidos = sorted({t for t in tops if tops.count(t) > 1})
    if repetidos:
        problemas.append(f'topType repetido na piscina: {", ".join(repetidos)}')
    chapeus = sorted({t for t in tops if t in CHAPEUS})
    if chapeus:
        problemas.append(f'chapéu/boné na piscina (regra 2026-09-29): {", ".join(chapeus)}')
    for id_, cfg in identidades.items():
        if cfg['gender'] not in ('f', 'm'):
            problemas.append(f'{id_}: gender {cfg["gender"]!r} != f|m')
        if cfg['gender'] == 'f' and cfg['facialHairType'] != 'Blank':
            problemas.append(f'{id_}: feminina com facialHairType {cfg["facialHairType"]!r}')
        if cfg['accessoriesType'] in OCULOS_OPAQUE:
            problemas.append(f'{id_}: acessório opaco {cfg["accessoriesType"]} esconde as expressões')


def validar_disco(identidades, presets, so=None):
    problemas = []
    validar_piscina(identidades, problemas)
    alvos = {k: v for k, v in identidades.items() if not so or k in so}
    canons = {}
    for id_, cfg in sorted(alvos.items()):
        for preset in cfg['presets']:
            caminho = DIR_RANDOM / id_ / f'{preset}.svg'
            if not caminho.exists():
                problemas.append(f'{caminho.relative_to(RAIZ)}: em falta')
                continue
            canon = validar_svg(caminho.relative_to(RAIZ), caminho.read_bytes(), cfg, preset, presets, problemas)
            if canon is not None:
                canons.setdefault(id_, {})[preset] = canon
        variantes = canons.get(id_, {})
        if len(variantes) > 1:
            primeiro = variantes[cfg['presets'][0]]
            for preset, canon in variantes.items():
                if canon != primeiro:
                    problemas.append(
                        f'{id_}: identidade NÃO é fixa — {preset} difere de {cfg["presets"][0]} '
                        'fora dos grupos de face (olhos/sobrancelha/boca)'
                    )
    return problemas


def validar_raster(problemas):
    """Rasterização não vazia (rsvg-convert); opcional, avisa se não existir."""
    try:
        subprocess.run(['rsvg-convert', '--version'], capture_output=True, check=True)
    except Exception:
        print('aviso: rsvg-convert indisponível — rasterização não validada', file=sys.stderr)
        return
    for caminho in sorted(DIR_RANDOM.glob('r*/**/*.svg')):
        try:
            png = subprocess.run(['rsvg-convert', str(caminho)], capture_output=True, check=True).stdout
        except Exception as exc:
            problemas.append(f'{caminho.relative_to(RAIZ)}: rasterização falhou ({exc})')
            continue
        if png[:8] != b'\x89PNG\r\n\x1a\n' or len(png) < 2000:
            problemas.append(f'{caminho.relative_to(RAIZ)}: raster vazio ({len(png)} bytes)')


# ------------------------------------------------------------------ #
# 4. Atualizar o documento (partes mecânicas)                         #
# ------------------------------------------------------------------ #

def sha256_ficheiro(caminho):
    return hashlib.sha256(caminho.read_bytes()).hexdigest()


def milhar(n):
    return f'{n:,}'.replace(',', '.')


def atualizar_doc(identidades, presets):
    texto = DOC.read_text(encoding='utf-8')

    # (a) secção de configuração + URLs das identidades aleatórias
    tabela = ['| Id | gênero | topType | hairColor | accessoriesType | facialHairType | facialHairColor | clotheType | clotheColor | skinColor |',
              '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for id_, cfg in sorted(identidades.items()):
        extra = f" (`graphicType: {cfg['graphicType']}`)" if cfg.get('graphicType') else ''
        tabela.append(
            f"| `{id_}` | {cfg['gender']} | {cfg['topType']} | {cfg['hairColor']} | {cfg['accessoriesType']} | "
            f"{cfg['facialHairType']} | {cfg['facialHairColor']} | {cfg['clotheType']}{extra} | "
            f"{cfg['clotheColor']} | {cfg['skinColor']} |"
        )
    seccao_config = (
        '## Identidades aleatórias (12) — configuração completa\n\n'
        'Redesenhadas em **2026-09-29** (regeneradas com `scripts/gerar-avatares-random.py`) para o '
        '**gênero do boneco bater com o gênero do nome** sorteado — a versão anterior tinha mulheres '
        'de barba/bigode, três chapéus/bonés repetidos e seis tons de pele `Yellow`. Regras da piscina:\n\n'
        '- **6 identidades femininas (`r01`–`r06`) sem qualquer barba/bigode** e **6 masculinas (`r07`–`r12`)** — '
        'o campo `gender: \'f\' | \'m\'` de `expressions.js` casa avatar e nome;\n'
        '- **12 `topType` todos distintos e zero chapéus/bonés** (`Hat`, `WinterHat1..4` proibidos);\n'
        '- óculos **só de lente transparente** (`Prescription01/02`, `Round`) — as expressões mudam os olhos '
        'e lentes opacas (`Sunglasses`, `Wayfarers`) escondê-las-iam;\n'
        '- `facialHairColor` acompanha `hairColor`; 6 tons de pele (sem `Yellow`); 9 tipos de roupa distintos.\n'
        '- **NOTA de cor:** `BlazerShirt` e `BlazerSweater` ignoram `clotheColor` no renderer '
        '(paleta fixa `#262E33` + `#3A4C5A`) — `r04` e `r07` declaram `clotheColor: Black`, que é o que sai mesmo.\n\n'
        'Cada identidade tem 4 presets renderizados (`idle`, `working`, `success`, `error`).\n\n'
        + '\n'.join(tabela) + '\n'
    )
    texto = re.sub(
        r'## Identidades aleatórias \(12\) — configuração completa\n.*?(?=\n## Estrutura de arquivos)',
        lambda _: seccao_config, texto, count=1, flags=re.S,
    )

    # (b) URLs de proveniência das identidades aleatórias
    blocos = ['### Identidades aleatórias', '',
              'Opções fixas da tabela anterior × triple do preset — URLs exatas de origem '
              '(regeneradas em **2026-09-29**):', '']
    for id_, cfg in sorted(identidades.items()):
        blocos.append(f'#### {id_}')
        blocos.append('')
        for preset in cfg['presets']:
            caminho = f'assets/avatars/random/{id_}/{preset}.svg'
            blocos.append(f'- `{caminho}` — {url_de(cfg, preset, presets)}')
        blocos.append('')
    texto = re.sub(
        r'### Identidades aleatórias\n.*?(?=\n## Dormir \(Modo jogo do plugin\))',
        lambda _: '\n'.join(blocos).rstrip() + '\n', texto, count=1, flags=re.S,
    )

    # (c) linhas SHA-256 dos ficheiros aleatórios + expressions.js
    linhas = []
    for caminho in sorted(DIR_RANDOM.glob('r*/**/*.svg')):
        rel = caminho.relative_to(RAIZ).as_posix()
        linhas.append(f'| `{rel}` | {caminho.stat().st_size} | `{sha256_ficheiro(caminho)}` |')
    linhas.append(f'| `expressions.js` | {EXPRESSOES_JS.stat().st_size} | `{sha256_ficheiro(EXPRESSOES_JS)}` |')
    bloco_sha = '\n'.join(linhas)
    texto = re.sub(
        r'\| `assets/avatars/random/.*?\| `expressions\.js` \| [^\n]*\|',
        lambda _: bloco_sha, texto, count=1, flags=re.S,
    )

    # (d) hash combinado (path \0 conteúdo, ordem de caminho, 161 ficheiros)
    todos = sorted(
        [p.relative_to(RAIZ).as_posix() for p in DIR_EXPRESSOES.rglob('*.svg')]
        + [p.relative_to(RAIZ).as_posix() for p in DIR_RANDOM.rglob('*.svg')]
        + ['expressions.js']
    )
    h = hashlib.sha256()
    for rel in todos:
        h.update(rel.encode() + b'\0' + (RAIZ / rel).read_bytes())
    texto = re.sub(
        r'(Hash combinado \(SHA-256 sobre `caminho\\0conteúdo` de todos os \d+ arquivos acima, '
        r'em ordem de caminho\): `)[0-9a-f]+(`)',
        lambda m: m.group(1) + h.hexdigest() + m.group(2), texto, count=1,
    )

    # (e) tamanhos totais em disco
    bytes_svgs = sum(p.stat().st_size for p in DIR_EXPRESSOES.rglob('*.svg')) + \
        sum(p.stat().st_size for p in DIR_RANDOM.rglob('*.svg'))
    bytes_js = EXPRESSOES_JS.stat().st_size
    total = bytes_svgs + bytes_js
    bullet = (
        f'- **Tamanho total em disco**: **{milhar(bytes_svgs)} bytes** para os 160 SVGs '
        f'({bytes_svgs / 1024 / 1024:.2f} MiB) — `expressions/` e `random/` — e {milhar(bytes_js)} bytes '
        f'para `expressions.js`; total **{milhar(total)} bytes** (~{total / 1024 / 1024:.2f} MiB).'
    )
    texto = re.sub(r'- \*\*Tamanho total em disco\*\*:.*', lambda _: bullet, texto, count=1)

    DOC.write_text(texto, encoding='utf-8')
    print(f'doc atualizado: {DOC.relative_to(RAIZ)}')


# ------------------------------------------------------------------ #
# CLI                                                                 #
# ------------------------------------------------------------------ #

def main(argv):
    modo_validar = False
    sem_doc = False
    forcar_doc = False
    so = None
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == '--validar':
            modo_validar = True
        elif arg == '--sem-doc':
            sem_doc = True
        elif arg == '--doc':
            forcar_doc = True
        elif arg == '--so':
            i += 1
            if i >= len(argv):
                uso_invalido('--so precisa de uma lista (ex.: r01,r02)')
            so = {x.strip() for x in argv[i].split(',') if x.strip()}
        elif arg in ('-h', '--help'):
            print(__doc__)
            return 0
        else:
            uso_invalido(f'argumento desconhecido {arg!r}')
        i += 1

    identidades, presets = carregar_expressoes()
    if so and not so <= set(identidades):
        uso_invalido(f'identidades desconhecidas: {", ".join(sorted(so - set(identidades)))}')

    if not modo_validar:
        alvos = {k: v for k, v in identidades.items() if not so or k in so}
        for id_, cfg in sorted(alvos.items()):
            (DIR_RANDOM / id_).mkdir(parents=True, exist_ok=True)
            for preset in cfg['presets']:
                url = url_de(cfg, preset, presets)
                resultado = descarregar(url)
                if isinstance(resultado, Exception):
                    erro(f'{id_}/{preset}: download falhou — {resultado}')
                (DIR_RANDOM / id_ / f'{preset}.svg').write_bytes(resultado)
                print(f'ok {id_}/{preset}.svg ({len(resultado)} bytes)')

    problemas = validar_disco(identidades, presets, so)
    validar_raster(problemas)
    if problemas:
        print(f'\n{len(problemas)} problema(s):', file=sys.stderr)
        for p in problemas:
            print(f'  - {p}', file=sys.stderr)
        return 1

    print('validação OK: 48 SVGs, identidade fixa por pessoa, piscina coerente')
    if (not modo_validar or forcar_doc) and not sem_doc:
        atualizar_doc(identidades, presets)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
