#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""embutir-variantes.py — embute o reator de variantes nas suas CÓPIAS.

A FONTE é `dsh-plugin/src/variantes.js` (ES module). Duas superfícies não o
podem importar e levam uma cópia embutida (texto idêntico, `export` removido):

  expressions.js            — script puro da demo (window.DSH_EXPRESSIONS.variantes)
  dsh-plugin/src/client.js  — bundle do browser (não importa irmãos)

A cópia vive entre os marcadores `/* === INÍCIO variantes.js embutido === */`
e `/* === FIM variantes.js embutido === */`. A paridade fonte↔cópias é imposta
por teste (tests/plugin/variantes.test.mjs).

Uso:
  python3 scripts/embutir-variantes.py --embutir     # (re)embutir (idempotente)
  python3 scripts/embutir-variantes.py --verificar   # conferir sem escrever

Regras:
  - NUNCA se altera o algoritmo durante a cópia: só se remove o prefixo
    `export ` das linhas de declaração (const|function|let), como na ponte
    surface.js → client.js.
  - Idempotente: segunda chamada sem mudanças = NO-OP.

Exit codes: 0 sucesso · 1 verificação falhou/marcador em falta · 2 uso inválido.
"""

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FONTE = RAIZ / 'dsh-plugin' / 'src' / 'variantes.js'
ALVOS = [RAIZ / 'expressions.js', RAIZ / 'dsh-plugin' / 'src' / 'client.js']

INICIO = '/* === INÍCIO variantes.js embutido === */'
FIM = '/* === FIM variantes.js embutido === */'


def erro(msg):
    print(f'Erro: {msg}', file=sys.stderr)
    sys.exit(1)


def uso_invalido(msg):
    print(f'Erro: {msg} — Solução: use --embutir ou --verificar', file=sys.stderr)
    sys.exit(2)


def copia_embutida():
    """Texto da fonte com os `export ` removidos (só nas declarações)."""
    linhas = FONTE.read_text(encoding='utf-8').split('\n')
    return '\n'.join(re.sub(r'^export (const|function|let) ', r'\1 ', l) for l in linhas)


def embutido_no(texto, alvo_nome):
    if texto.count(INICIO) != 1 or texto.count(FIM) != 1:
        erro(f'marcadores variantes.js não aparecem exatamente uma vez em {alvo_nome}')
    i = texto.index(INICIO) + len(INICIO)
    f = texto.index(FIM)
    return texto[i:f]


def principal(argv):
    embutir = '--embutir' in argv
    verificar = '--verificar' in argv
    if embutir == verificar:  # ambos ou nenhum
        uso_invalido('escolha exatamente um de --embutir / --verificar')
    if not FONTE.exists():
        erro(f'{FONTE.relative_to(RAIZ)} não existe')

    alvo = '\n' + copia_embutida() + '\n  '
    desatualizados = []
    for caminho in ALVOS:
        texto = caminho.read_text(encoding='utf-8')
        if embutido_no(texto, caminho.name) == alvo:
            continue
        desatualizados.append(caminho)
        if not verificar:
            i = texto.index(INICIO) + len(INICIO)
            f = texto.index(FIM)
            caminho.write_text(texto[:i] + alvo + texto[f:], encoding='utf-8')

    if not desatualizados:
        print(f'OK: {len(ALVOS)} cópias de variantes.js já embutidas (NO-OP)')
        return 0
    if verificar:
        nomes = ', '.join(str(p.relative_to(RAIZ)) for p in desatualizados)
        print(f'Erro: cópia desatualizada em {nomes} — Solução: '
              f'python3 scripts/embutir-variantes.py --embutir', file=sys.stderr)
        return 1
    nomes = ', '.join(str(p.relative_to(RAIZ)) for p in desatualizados)
    print(f'OK: variantes.js embutido em {nomes}')
    return 0


if __name__ == '__main__':
    sys.exit(principal(sys.argv[1:]))
