#!/usr/bin/env bash
# teste-e2e.sh — fluxo ponta a ponta do ciclo de integración dun axente en worktree.
#
# Percorre cada micro-proxecto de projects/ (micro-*) e executa, con verificación
# por paso, o ciclo completo:
#
#   worktree → branch → commit → rebase con conflito proposital → resolución →
#   merge en main → limpeza do worktree e da branch
#
# As mesmas operacións que prescribe o prompt ../prompts/merge-retirar.md, pero
# mecánicas e deterministas. Git local, sen remoto, sen rede, sen dependencias.
#
# Uso:  bash projects/teste-e2e.sh          (dende calquera directório)
# Exit: 0 se todos os pasos PASS · 1 se algún FAIL.
#
# Cada execución restaura cada micro ao commit etiquetado `e2e-base` e limpa
# restos de execucións anteriores (worktrees órfanos, branches mortas, carpeta
# .worktrees/) para que o resultado sexa repetible.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # = projects/
WTBASE="$ROOT/.worktrees"

PASS=0
FAIL=0
STEPNO=0

# ---------------------------------------------------------------- helpers ----

say()      { printf '%s\n' "$*"; }
pass_step() { PASS=$((PASS + 1)); printf '  [PASS] %s\n' "$1"; }
fail_step() { FAIL=$((FAIL + 1)); printf '  [FAIL] %s\n' "$1"; }
begin()    { STEPNO=$((STEPNO + 1)); printf '\n== [%02d] %s · %s\n' "$STEPNO" "$1" "$2"; }

# ----------------------------------------------------------- pre-flight -----

if ! command -v git >/dev/null 2>&1; then
  echo "ERRO: git non está no PATH." >&2
  exit 1
fi

# git >= 2.28 para 'git init -b main' (usado ao crear os micros).
read -r maj min <<< "$(git --version | sed -E 's/^git version ([0-9]+)\.([0-9]+).*/\1 \2/')"
if [ "${maj:-0}" -lt 2 ] || { [ "${maj:-0}" -eq 2 ] && [ "${min:-0}" -lt 28 ]; }; then
  echo "ERRO: git ${maj}.${min} é demasiado antigo (mín. 2.28 para --initial-branch)." >&2
  exit 1
fi

# Descubrir micro-proxectos: calquera micro-* con repo git propio.
projects=()
for d in "$ROOT"/micro-*; do
  [ -d "$d/.git" ] || continue
  projects+=("$d")
done

if [ "${#projects[@]}" -eq 0 ]; then
  echo "ERRO: non se atoparon micro-proxectos en $ROOT (procúranse directórios micro-*/ con .git)." >&2
  exit 1
fi

say "Teste e2e do ciclo worktree→branch→commit→rebase(conflito)→merge→limpeza"
say "  git: $(git --version) · micro-proxectos: ${#projects[@]}"
for d in "${projects[@]}"; do say "    - $(basename "$d")"; done

# ------------------------------------------------------- micro individual ----

run_project() {
  local d="$1" proj wt br
  proj="$(basename "$d")"
  wt="$WTBASE/$proj"
  br="feat/${proj}-e2e"

  # -- 1. Restauración determinista ------------------------------------------
  begin "$proj" "preparación: limpar restos e reset a e2e-base"
  git -C "$d" worktree prune >/dev/null 2>&1 || true
  while read -r p; do
    [ -n "$p" ] || continue
    [ "$p" = "$d" ] && continue
    git -C "$d" worktree remove --force "$p" >/dev/null 2>&1 || true
  done < <(git -C "$d" worktree list --porcelain | sed -n 's/^worktree //p')
  while read -r b; do
    [ -n "$b" ] || continue
    git -C "$d" branch -D "$b" >/dev/null 2>&1 || true
  done < <(git -C "$d" for-each-ref --format='%(refname:short)' refs/heads | grep -v '^main$')
  if ! git -C "$d" rev-parse --verify -q e2e-base >/dev/null 2>&1; then
    fail_step "falta a etiqueta e2e-base en $proj — recrea o micro como en projects/README.md"
    return 1
  fi
  # e2e-base ten que ser o commit inicial (raíz): se apunta a outro commit
  # (ex.: un merge dun run anterior), o reinicio non é deterministico.
  if [ "$(git -C "$d" rev-list --count e2e-base)" -ne 1 ]; then
    fail_step "e2e-base en $proj non é un commit raíz — re-créaa con: git tag -f e2e-base $(git -C "$d" rev-list --max-parents=0 e2e-base)"
    return 1
  fi
  git -C "$d" reset --hard e2e-base >/dev/null 2>&1
  rm -rf "$wt"
  mkdir -p "$wt"
  if [ -n "$(git -C "$d" status --porcelain)" ]; then
    fail_step "main de $proj non quedou limpa tras o reset"
    return 1
  fi
  pass_step "estado base restaurado (worktrees/branches limpos · main == e2e-base)"

  # -- 2. Worktree + branch ---------------------------------------------------
  begin "$proj" "crear worktree e branch $br a partir de main"
  if ! git -C "$d" worktree add -b "$br" "$wt" main >/dev/null 2>&1; then
    fail_step "git worktree add -b $br $wt main fallou"
    return 1
  fi
  if [ "$(git -C "$wt" branch --show-current)" != "$br" ]; then
    fail_step "a branch activa do worktree non é $br"
    return 1
  fi
  if [ ! -f "$wt/feature.txt" ]; then
    fail_step "feature.txt non está no worktree"
    return 1
  fi
  if ! git -C "$d" worktree list --porcelain | grep -q "^worktree $wt$"; then
    fail_step "o worktree non aparece en git worktree list"
    return 1
  fi
  pass_step "worktree $wt creado coa branch $br"

  # -- 3. Commit do axente na branch (toque na liña 3) ------------------------
  begin "$proj" "commit do axente na branch (liña 3 de feature.txt)"
  if ! sed -i '3s/.*/linha-3-AGENTE/' "$wt/feature.txt"; then
    fail_step "sed fallou sobre $wt/feature.txt"
    return 1
  fi
  if ! git -C "$wt" add feature.txt >/dev/null 2>&1 \
     || ! git -C "$wt" commit -m "feat: toque do axente na liña 3 (e2e)" >/dev/null 2>&1; then
    fail_step "add/commit na branch fallou"
    return 1
  fi
  if [ "$(git -C "$wt" log -1 --format=%s)" != "feat: toque do axente na liña 3 (e2e)" ]; then
    fail_step "o commit da branch non ten a mensaxe esperada"
    return 1
  fi
  if [ -n "$(git -C "$wt" status --porcelain)" ]; then
    fail_step "a branch quedou sucia tras o commit"
    return 1
  fi
  if ! grep -q '^linha-3-AGENTE$' "$wt/feature.txt"; then
    fail_step "o contido final da liña 3 non é o do axente"
    return 1
  fi
  pass_step "commit '$br' feito e WC limpo"

  # -- 4. Commit concorrente en main (mesma liña 3 → conflito garantido) -------
  begin "$proj" "commit concorrente en main (mesma liña 3)"
  if ! sed -i '3s/.*/linha-3-MAIN/' "$d/feature.txt" \
     || ! git -C "$d" add feature.txt >/dev/null 2>&1 \
     || ! git -C "$d" commit -m "feat: toque concorrente en main (e2e)" >/dev/null 2>&1; then
    fail_step "commit concorrente en main fallou"
    return 1
  fi
  if [ "$(git -C "$d" log -1 --format=%s)" != "feat: toque concorrente en main (e2e)" ] \
     || [ -n "$(git -C "$d" status --porcelain)" ] \
     || ! grep -q '^linha-3-MAIN$' "$d/feature.txt"; then
    fail_step "verificación do commit concorrente reprobada"
    return 1
  fi
  pass_step "commit concorrente en main feito (base para o conflito)"

  # -- 5. Rebase → conflito proposital -----------------------------------------
  begin "$proj" "rebase da branch sobre main (debe parar por conflito)"
  if git -C "$wt" rebase main >/dev/null 2>&1; then
    git -C "$wt" rebase --abort >/dev/null 2>&1 || true
    fail_step "o rebase terminou sen conflito — o diseño do conflito roto (revisa feature.txt)"
    return 1
  fi
  um="$(git -C "$wt" diff --name-only --diff-filter=U)"
  if [ "$um" != "feature.txt" ]; then
    git -C "$wt" rebase --abort >/dev/null 2>&1 || true
    fail_step "conflito inesperado en [$um] — espérase só feature.txt"
    return 1
  fi
  if ! grep -qE '^(<<<<<<< |=======|>>>>>>> )' "$wt/feature.txt"; then
    git -C "$wt" rebase --abort >/dev/null 2>&1 || true
    fail_step "non hai marcadores de conflito en feature.txt"
    return 1
  fi
  pass_step "rebase parado con conflito UNMERGED en feature.txt (esperado)"

  # -- 6. Resolución sen atallos + continue -----------------------------------
  begin "$proj" "resolver o conflito (quitar marcadores, quedar cos dous contidos)"
  # Resolución intencionada: quedan as DÚAS versións, cada unha na súa liña.
  awk '
    /^<<<<<<< / { print "linha-3-AGENTE"; next }
    /^=======$/ { print "linha-3-MAIN";    next }
    /^>>>>>>> / { next }
    { print }
  ' "$wt/feature.txt" > "$wt/.resolto.txt"
  mv "$wt/.resolto.txt" "$wt/feature.txt"
  if ! git -C "$wt" add feature.txt >/dev/null 2>&1; then
    fail_step "git add da resolución fallou"
    return 1
  fi
  if grep -nE '^(<{7}|={7}|>{7})' "$wt/feature.txt" >/dev/null 2>&1; then
    fail_step "quedaron marcadores de conflito en feature.txt"
    return 1
  fi
  if ! GIT_EDITOR=true git -C "$wt" rebase --continue >/dev/null 2>&1; then
    fail_step "git rebase --continue fallou"
    return 1
  fi
  if [ -d "$(git -C "$wt" rev-parse --git-path rebase-merge 2>/dev/null)" ] \
     || [ -d "$(git -C "$wt" rev-parse --git-path rebase-apply 2>/dev/null)" ]; then
    fail_step "o rebase segue en curso tras --continue"
    return 1
  fi
  if [ -n "$(git -C "$wt" status --porcelain)" ]; then
    fail_step "a branch quedou sucia tras o --continue"
    return 1
  fi
  if ! grep -q '^linha-3-AGENTE$' "$wt/feature.txt" \
     || ! grep -q '^linha-3-MAIN$' "$wt/feature.txt"; then
    fail_step "o contido resolto non ten as dúas versións"
    return 1
  fi
  pass_step "conflito resolto: rebase continuado e rematado"

  # -- 7. Integridade tras o rebase ---------------------------------------------
  begin "$proj" "verificar integridade tras o rebase"
  if ! git -C "$wt" merge-base --is-ancestor main HEAD; then
    fail_step "main non é ancestral da HEAD da branch"
    return 1
  fi
  if [ "$(git -C "$wt" log --format=%s main..HEAD)" != "feat: toque do axente na liña 3 (e2e)" ]; then
    fail_step "a lista de commits main..HEAD non é exactamente o commit do axente"
    return 1
  fi
  if [ -n "$(git -C "$wt" status --porcelain)" ]; then
    fail_step "WC da branch sucio tras o rebase"
    return 1
  fi
  pass_step "main ancestral · un só commit da branch · WC limpo"

  # -- 8. Merge --no-ff en main --------------------------------------------------
  begin "$proj" "merge --no-ff da branch en main (commit de integración)"
  if ! git -C "$d" merge --no-ff "$br" -m "merge: $br en main (e2e)" >/dev/null 2>&1; then
    fail_step "git merge --no-ff fallou"
    return 1
  fi
  if [ "$(git -C "$d" log -1 --format=%s)" != "merge: $br en main (e2e)" ]; then
    fail_step "o HEAD de main non é o commit de merge"
    return 1
  fi
  if ! git -C "$d" for-each-ref --merged=main --format='%(refname:short)' refs/heads | grep -qx "$br"; then
    fail_step "a branch non figura como totalmente mergeada"
    return 1
  fi
  if [ -n "$(git -C "$d" status --porcelain)" ]; then
    fail_step "main sucio tras o merge"
    return 1
  fi
  # e2e-base + toque en main + toque do axente + merge = 3 commits netos.
  if [ "$(git -C "$d" rev-list --count e2e-base..HEAD)" -ne 3 ]; then
    fail_step "a historia neta tras o merge non ten 3 commits"
    return 1
  fi
  pass_step "merge commit creado: as dúas liñas (AGENTE + MAIN) están en main"

  # -- 9. Limpeza do worktree ------------------------------------------------------
  begin "$proj" "eliminar o worktree e podar metadatos"
  if [ -n "$(git -C "$wt" status --porcelain)" ]; then
    fail_step "o worktree non está limpo antes de eliminalo"
    return 1
  fi
  if ! git -C "$d" worktree remove "$wt" >/dev/null 2>&1; then
    fail_step "git worktree remove fallou"
    return 1
  fi
  git -C "$d" worktree prune >/dev/null 2>&1 || true
  if [ -e "$wt" ]; then
    fail_step "o directório do worktree segue existindo"
    return 1
  fi
  if git -C "$d" worktree list --porcelain | grep -q "^worktree $wt$"; then
    fail_step "o worktree segue rexistrado en git worktree list"
    return 1
  fi
  pass_step "worktree eliminado e podado"

  # -- 10. Eliminar a branch + estado final ---------------------------------------
  begin "$proj" "eliminar a branch ($br) e verificar estado final"
  if ! git -C "$d" branch -d "$br" >/dev/null 2>&1; then
    fail_step "git branch -d fallou (a branch non está totalmente mergeada?)"
    return 1
  fi
  if [ -n "$(git -C "$d" branch --list "$br")" ]; then
    fail_step "a branch segue existindo tras eliminála"
    return 1
  fi
  if [ "$(git -C "$d" branch --show-current)" != "main" ]; then
    fail_step "main non é a branch activa"
    return 1
  fi
  if [ -n "$(git -C "$d" status --porcelain)" ]; then
    fail_step "main sucia ao final"
    return 1
  fi
  if ! git -C "$d" log --format=%s | grep -q '^feat: toque concorrente en main (e2e)$' \
     || ! git -C "$d" log --format=%s | grep -q '^feat: toque do axente na liña 3 (e2e)$'; then
    fail_step "no histórico final de main faltan os dous toques"
    return 1
  fi
  if [ "$(git -C "$d" worktree list --porcelain | sed -n 's/^worktree //p' | wc -l)" -ne 1 ]; then
    fail_step "quedan worktrees alleas rexistradas (espérase só o checkout principal)"
    return 1
  fi
  pass_step "$br eliminada · main limpa · historia completa · un só worktree"
  return 0
}

# ------------------------------------------------------------- execución -----

for d in "${projects[@]}"; do
  run_project "$d"
done

say ""
say "================ RESUMEN ================"
printf '  PASS: %d · FAIL: %d · pasos: %d\n' "$PASS" "$FAIL" "$STEPNO"
if [ "$FAIL" -eq 0 ]; then
  say "RESULTADO: OK — o ciclo worktree→branch→commit→rebase(conflito)→merge→limpeza funciona en todos os micros."
  exit 0
else
  say "RESULTADO: FALLO — revisa os pasos [FAIL] de arriba."
  exit 1
fi