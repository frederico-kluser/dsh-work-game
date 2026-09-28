#!/bin/bash
# dsh-work-game — a demo estilizada a rodar só (Linux/Windows-git-bash).
cd "$(dirname "$0")"
python3 -m http.server 4173 --bind 127.0.0.1 >/dev/null 2>&1 &
SERVIDOR=$!
sleep 1
(command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:4173/") || (command -v open >/dev/null && open "http://127.0.0.1:4173/") || echo "Abre http://127.0.0.1:4173/"
trap 'kill $SERVIDOR 2>/dev/null' EXIT
wait $SERVIDOR
