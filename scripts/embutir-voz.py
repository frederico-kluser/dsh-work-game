#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""embutir-voz.py — embute o módulo de VOZ E TRANSCRIÇÃO no bundle do browser.

A FONTE é `dsh-plugin/src/voz.js` (ES module). O `dsh-plugin/src/client.js` é
um bundle à mão que NÃO importa irmãos, por isso leva uma cópia embutida
(texto idêntico, `export` removido) entre os marcadores
`/* === INÍCIO voz.js embutido === */` e `/* === FIM voz.js embutido === */`,
logo a seguir ao bloco embutido de expressoes.js. A paridade fonte↔cópia é
imposta por teste (tests/plugin/voz.test.mjs).

Uso:
  python3 scripts/embutir-voz.py --embutir
  python3 scripts/embutir-voz.py --verificar

Alvos (--alvo): `client` (único — voz.js só é usado pelo client.js; a demo
não tem telemóvel). Por omissão assume-se `client`.

Regras:
  - NUNCA se altera o algoritmo durante a cópia: só se remove o prefixo
    `export ` das linhas de declaração (const|function|let|async function),
    como no padrão de scripts/embutir-expressoes-motor.py;
  - Idempotente: segunda chamada sem mudanças = NO-OP.

Exit codes: 0 sucesso · 1 verificação falhou/marcador em falta · 2 uso inválido.
"""

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FONTE = RAIZ / 'dsh-plugin' / 'src' / 'voz.js'

ALVOS_POR_NOME = {
    'client': RAIZ / 'dsh-plugin' / 'src' / 'client.js',
}

INICIO = '/* === INÍCIO voz.js embutido === */'
FIM = '/* === FIM voz.js embutido === */'


def erro(msg):
    print(f'Erro: {msg}', file=sys.stderr)
    sys.exit(1)


def uso_invalido(msg):
    print(f'Erro: {msg} — Solução: use --embutir/--verificar e --alvo client',
          file=sys.stderr)
    sys.exit(2)


def alvos_de(argv):
    if '--alvo' not in argv:
        return [ALVOS_POR_NOME['client']]
    i = argv.index('--alvo')
    if i + 1 >= len(argv):
        uso_invalido('--alvo precisa de client')
    nome = argv[i + 1]
    if nome != 'client':
        uso_invalido(f'--alvo {nome} desconhecido (voz.js só serve o client)')
    return [ALVOS_POR_NOME[nome]]


def copia_embutida():
    """Texto da fonte com os `export ` removidos (só nas declarações)."""
    linhas = FONTE.read_text(encoding='utf-8').split('\n')
    return '\n'.join(re.sub(r'^export (const|function|let|async function) ', r'\1 ', l)
                     for l in linhas)


def embutido_no(texto, alvo_nome):
    if texto.count(INICIO) != 1 or texto.count(FIM) != 1:
        erro(f'marcadores voz.js não aparecem exatamente uma vez em {alvo_nome}')
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
        print(f'OK: {len(alvos)} cópias de voz.js já embutidas (NO-OP)')
        return 0
    if verificar:
        nomes = ', '.join(str(p.relative_to(RAIZ)) for p in desatualizados)
        print(f'Erro: cópia desatualizada em {nomes} — Solução: '
              f'python3 scripts/embutir-voz.py --embutir', file=sys.stderr)
        return 1
    nomes = ', '.join(str(p.relative_to(RAIZ)) for p in desatualizados)
    print(f'OK: voz.js embutido em {nomes}')
    return 0


if __name__ == '__main__':
    sys.exit(principal(sys.argv[1:]))
