#!/bin/bash
# dsh-work-game — a demo estilizada a rodar só (sem plugin, sem extensão).
# Duplo-clique no macOS: sobe o servidor local e abre no browser.
cd "$(dirname "$0")"
python3 -m http.server 4173 --bind 127.0.0.1 >/dev/null 2>&1 &
SERVIDOR=$!
sleep 1
open "http://127.0.0.1:4173/"
echo "Demo a rodar em http://127.0.0.1:4173/ — fecha esta janela para parar."
trap 'kill $SERVIDOR 2>/dev/null' EXIT
wait $SERVIDOR
