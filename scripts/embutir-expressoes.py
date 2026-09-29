#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""embutir-expressoes.py — FONTE dos corpos de expressão embutidos no plugin.

Os SVGs de `assets/avatars/` (expressões da demo + os de `sleeping/`) são a
FONTE; o Modo jogo do plugin não carrega ficheiros (o bundle não importa
irmãos), por isso cada corpo vive em `dsh-plugin/src/client.js` dentro de
`const EXPR_AVATARS = {` como `{ vb, corpo }` — `corpo` é o interior do SVG
byte a byte e o teste REGRA DE OURO de `tests/plugin/render.test.mjs` confere
a igualdade contra o asset.

Uso:
  python3 scripts/embutir-expressoes.py --embutir        # (re)embutir o bloco (idempotente)
  python3 scripts/embutir-expressoes.py --verificar      # conferir sem escrever
  python3 scripts/embutir-expressoes.py --embutir --presets idle,working,focused

Sem `--presets` embebe os presets canónicos (nesta ordem):
  idle, working, focused, tool, searching, thinking, waiting, error,
  success, sleeping, wink

Regras:
  - `sleeping` vem de `assets/avatars/sleeping/<id>.svg`; os restantes de
    `assets/avatars/expressions/<id>/<preset>.svg`.
  - NUNCA se redesenha nada: sai do SVG exatamente o que lá está. Um corpo com
    crase ou `${` rebenta (ficaria refém da template literal do bundle).
  - Idempotente: segunda chamada sem mudanças = NO-OP.

Exit codes: 0 sucesso · 1 verificação falhou/asset em falta · 2 uso inválido.
"""

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CLIENTE = RAIZ / 'dsh-plugin' / 'src' / 'client.js'
DIR_EXPRESSOES = RAIZ / 'assets' / 'avatars' / 'expressions'
DIR_DORMIR = RAIZ / 'assets' / 'avatars' / 'sleeping'

IDENTIDADES = ['rui', 'bia', 'lia', 'pesquisa', 'codigo', 'testes', 'alex', 'maya']
PRESETS_CANONICOS = [
    'idle', 'working', 'focused', 'tool', 'searching', 'thinking',
    'waiting', 'error', 'success', 'sleeping', 'wink',
]

INICIO_BLOCO = 'const EXPR_AVATARS = {'
FIM_BLOCO = '\n    };'


def erro(msg):
    print(f'Erro: {msg}', file=sys.stderr)
    sys.exit(1)


def uso_invalido(msg):
    print(f'Erro: {msg} — Solução: use --embutir ou --verificar [--presets a,b,…]',
          file=sys.stderr)
    sys.exit(2)


def extrair(caminho):
    """(viewBox, corpo) de um SVG — corpo = entre o <svg …> e o </svg> final."""
    texto = caminho.read_text(encoding='utf-8')
    m = re.match(r'<svg[^>]*viewBox="([^"]+)"[^>]*>(.*)</svg>\s*$', texto, re.S)
    if not m:
        erro(f'{caminho.relative_to(RAIZ)} não é um <svg viewBox=…>…</svg> reconhecível')
    vb, corpo = m.group(1), m.group(2)
    if '`' in corpo or '${' in corpo:
        erro(f'{caminho.relative_to(RAIZ)} tem crase ou expansão de template no corpo — não embutível')
    return vb, corpo


def asset_de(identidade, preset):
    if preset == 'sleeping':
        return DIR_DORMIR / f'{identidade}.svg'
    return DIR_EXPRESSOES / identidade / f'{preset}.svg'


def bloco_desejado(presets):
    # Sem a indentação da 1.ª linha: o texto antes do bloco fica intacto.
    linhas = [INICIO_BLOCO]
    for identidade in IDENTIDADES:
        linhas.append(f'      {identidade}: {{')
        for preset in presets:
            caminho = asset_de(identidade, preset)
            if not caminho.exists():
                erro(f'asset em falta: {caminho.relative_to(RAIZ)}')
            vb, corpo = extrair(caminho)
            linhas.append(f"        {preset}: {{ vb: '{vb}', corpo: `{corpo}` }},")
        linhas.append('      },')
    linhas.append('    };')
    return '\n'.join(linhas)


def bloco_atual(texto):
    i = texto.index(INICIO_BLOCO)
    f = texto.index(FIM_BLOCO, i) + len(FIM_BLOCO)
    return i, f, texto[i:f]


def principal(argv):
    embutir = '--embutir' in argv
    verificar = '--verificar' in argv
    if embutir == verificar:  # ambos ou nenhum
        uso_invalido('escolha exatamente um de --embutir / --verificar')
    presets = list(PRESETS_CANONICOS)
    if '--presets' in argv:
        k = argv.index('--presets')
        if k + 1 >= len(argv):
            uso_invalido('--presets precisa da lista separada por vírgulas')
        presets = [p.strip() for p in argv[k + 1].split(',') if p.strip()]
        if not presets:
            uso_invalido('--presets veio vazio')
        for p in presets:
            if p not in PRESETS_CANONICOS:
                uso_invalido(f'preset desconhecido: {p}')

    if not CLIENTE.exists():
        erro(f'{CLIENTE.relative_to(RAIZ)} não existe')
    texto = CLIENTE.read_text(encoding='utf-8')
    try:
        i, f, atual = bloco_atual(texto)
    except ValueError:
        erro(f'bloco "{INICIO_BLOCO}" não encontrado em {CLIENTE.relative_to(RAIZ)}')

    alvo = bloco_desejado(presets)
    if atual == alvo:
        print(f'OK: {len(IDENTIDADES)} identidades × {len(presets)} presets já embutidos (NO-OP)')
        return 0
    if verificar:
        print(f'Erro: embutimento desatualizado ({len(IDENTIDADES)} identidades × {len(presets)} '
              f'presets) — Solução: python3 scripts/embutir-expressoes.py --embutir', file=sys.stderr)
        return 1
    CLIENTE.write_text(texto[:i] + alvo + texto[f:], encoding='utf-8')
    print(f'OK: embutidos {len(IDENTIDADES)} identidades × {len(presets)} presets em '
          f'{CLIENTE.relative_to(RAIZ)}')
    return 0


if __name__ == '__main__':
    sys.exit(principal(sys.argv[1:]))
