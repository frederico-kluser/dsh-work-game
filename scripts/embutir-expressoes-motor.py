#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""embutir-expressoes-motor.py — embute o MOTOR DE EXPRESSÕES nas suas CÓPIAS.

A FONTE é `dsh-plugin/src/expressoes.js` (ES module). Superfícies que não o
podem importar levam uma cópia embutida (texto idêntico, `export` removido):

  expressions.js            — script puro da demo (window.DSH_EXPRESSIONS.expressoes)
  dsh-plugin/src/client.js  — bundle do browser (não importa irmãos)

A cópia vive entre os marcadores `/* === INÍCIO expressoes.js embutido === */`
e `/* === FIM expressoes.js embutido === */`. A paridade fonte↔cópias é imposta
por teste (tests/plugin/expressoes.test.mjs).

Uso:
  python3 scripts/embutir-expressoes-motor.py --embutir --alvo expressions
  python3 scripts/embutir-expressoes-motor.py --verificar --alvo todos

Alvos (--alvo, obrigatório a menos que se queira o padrão 'todos'):
  expressions  só expressions.js
  client       só dsh-plugin/src/client.js
  todos        os dois

Regras:
  - NUNCA se altera o algoritmo durante a cópia: só se remove o prefixo
    `export ` das linhas de declaração (const|function|let), como no padrão de
    scripts/embutir-variantes.py.
  - Idempotente: segunda chamada sem mudanças = NO-OP.

TODO (seguimento): o embutimento em dsh-plugin/src/client.js fica para a
integração do bundle (outro agente gere esse ficheiro) — os marcadores ainda
não lá estão; quando lá estiverem, correr `--embutir --alvo client` (ou
`todos`) e a paridade passa a ser exigida também lá pelo teste.

Exit codes: 0 sucesso · 1 verificação falhou/marcador em falta · 2 uso inválido.
"""

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FONTE = RAIZ / 'dsh-plugin' / 'src' / 'expressoes.js'

ALVOS_POR_NOME = {
    'expressions': RAIZ / 'expressions.js',
    'client': RAIZ / 'dsh-plugin' / 'src' / 'client.js',
}

INICIO = '/* === INÍCIO expressoes.js embutido === */'
FIM = '/* === FIM expressoes.js embutido === */'


def erro(msg):
    print(f'Erro: {msg}', file=sys.stderr)
    sys.exit(1)


def uso_invalido(msg):
    print(f'Erro: {msg} — Solução: use --embutir/--verificar e --alvo '
          f'expressions|client|todos', file=sys.stderr)
    sys.exit(2)


def alvos_de(argv):
    if '--alvo' not in argv:
        return [ALVOS_POR_NOME['expressions'], ALVOS_POR_NOME['client']]
    i = argv.index('--alvo')
    if i + 1 >= len(argv):
        uso_invalido('--alvo precisa de expressions|client|todos')
    nome = argv[i + 1]
    if nome == 'todos':
        return [ALVOS_POR_NOME['expressions'], ALVOS_POR_NOME['client']]
    if nome not in ALVOS_POR_NOME:
        uso_invalido(f'--alvo {nome} desconhecido')
    return [ALVOS_POR_NOME[nome]]


def copia_embutida():
    """Texto da fonte com os `export ` removidos (só nas declarações)."""
    linhas = FONTE.read_text(encoding='utf-8').split('\n')
    return '\n'.join(re.sub(r'^export (const|function|let) ', r'\1 ', l) for l in linhas)


def embutido_no(texto, alvo_nome):
    if texto.count(INICIO) != 1 or texto.count(FIM) != 1:
        erro(f'marcadores expressoes.js não aparecem exatamente uma vez em {alvo_nome}')
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
    alvos = alvos_de(argv)

    alvo = '\n' + copia_embutida() + '\n  '
    desatualizados = []
    for caminho in alvos:
        texto = caminho.read_text(encoding='utf-8')
        if embutido_no(texto, caminho.name) == alvo:
            continue
        desatualizados.append(caminho)
        if not verificar:
            i = texto.index(INICIO) + len(INICIO)
            f = texto.index(FIM)
            caminho.write_text(texto[:i] + alvo + texto[f:], encoding='utf-8')

    if not desatualizados:
        print(f'OK: {len(alvos)} cópias de expressoes.js já embutidas (NO-OP)')
        return 0
    if verificar:
        nomes = ', '.join(str(p.relative_to(RAIZ)) for p in desatualizados)
        print(f'Erro: cópia desatualizada em {nomes} — Solução: '
              f'python3 scripts/embutir-expressoes-motor.py --embutir', file=sys.stderr)
        return 1
    nomes = ', '.join(str(p.relative_to(RAIZ)) for p in desatualizados)
    print(f'OK: expressoes.js embutido em {nomes}')
    return 0


if __name__ == '__main__':
    sys.exit(principal(sys.argv[1:]))
