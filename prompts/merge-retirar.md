# Prompt — Merge final e retirada do axente

> **Cando enviar:** o coordinador envía este prompt COMPLETO a un axente que xa
> terminou o seu traballo nunha branch de un worktree git do repo, e debe
> integrala, limpar e encerrarse. Non é unha conversa: é unha orde de execución.
> **Parámetros opcionais** (se non se pasan, o axente descúbreos na Fase 0):
> `{{WORKTREE}}` = camiño absoluto do worktree asignado ao axente;
> `{{BRANCH}}` = nome da branch de traballo do axente.
> **Repos de proba locales** (projects/micro-*) non teñen remoto: o axente debe
> detectalo e adaptar Fases 1 e 7 sen inventar un remoto.

---

## 1. Rol e obxectivo

Es un axente que rematou o seu traballo na branch que ocupa o teu worktree git.
O teu obxectivo é, POR ESTA ORDE E SEN OMITIR NINGÚN PASO:

1. Facer rebase da túa branch sobre `main`.
2. Resolver **todos** os conflitos que xurdan durante o rebase, un por un, sen atallos.
3. Verificar que a branch quedou íntegra sobre `main`.
4. Correr os testes do repo (se os define) sobre o resultado do rebase.
5. Integrar (merge) a túa branch en `main`.
6. Empurrar a `main` (só se o repo ten remoto configurado).
7. Eliminar o teu worktree e a túa branch.
8. Encerrar: entregar o informe final e terminar o teu turno, sen deixar nada a medias.

## 2. Regras de ferro (improrrogables)

1. **Cada paso ten verificación.** Despois de cada acción executa o comando de
   verificación indicado e confirma que o resultado é o esperado ANTES de pasar ao
   seguinte. Nunca avances cunha verificación pendente ou fallida.
2. **Sen atallos.** Prohibido: opcións de resolución automática (`-X theirs|ours`
   en `rebase`/`merge`, `checkout --ours|--theirs`), `reset --hard` fóra do protocolo
   de aborto, `clean -fdx`, `branch -D`, `push --force`, editar ficheiros de `.git`
   a man, nin `git stash` como fuxida (cómitese ou bórrase explicitamente, nunca se
   esconde traballo).
3. **Nunca destrúas traballo alleo.** O checkout principal (onde vive `main`) non é
   teu: se está sucio con cambios que non fixeches ti, DETENTE na Fase 1 e informa.
4. **Fallo = parar e informar, non emendar a tolas.** Se un paso falla: le o
   mensaxe de git, diagnostica e tenta a corrección da propia fase; se non o
   resolves, deixa o repo exactamente como estaba (uso exclusivo de
   `git rebase --abort` ou `git merge --abort` para volver ao estado previo) e
   informa ao coordinador co estado preciso. Nunca "arranxes" cun comando non
   listado neste prompt.
5. **Ámbito.** Toca exclusivamente a túa branch, o teu worktree e `main` (só para
   integrala). Non toques worktrees nin branches doutros axentes, aínda que estean
   no mesmo repo.
6. **Non deixes procesos en segundo plano, servidores nin ficheiros temporais.**
7. **Non inventes resultados.** Todo o que reportes no informe final ten que estar
   respaldado pola saída real dos comandos que executaches.

## 3. Fase 0 — Descubrir o terreo (verificación)

Determina onde estás e que repo tes:

```bash
pwd
git rev-parse --show-toplevel          # raíz do repo onde estás (a túa worktree)
git worktree list --porcelain          # todas as worktrees do repo
git branch --show-current              # a túa branch actual
```

- **Raíz do repo / checkout principal** (`$RAIZ`): a entrada de
  `git worktree list --porcelain` cuxa carpeta contén un directorio `.git`
  (`test -d "$RAIZ/.git"`). É onde vive `main`.
- **Teu worktree** (`$WT`): o teu directorio de traballo actual (o que che asignou
  o coordinador, ou `{{WORKTREE}}` se che foi pasado explícito). O teu `.git` é un
  **ficheiro**, non un directorio — así verificas que estás na worktree ligada.
- **Túa branch** (`$BRANCH`): `git -C "$WT" branch --show-current` (ou
  `{{BRANCH}}` se che foi pasada).

Verificación: `git -C "$WT" status --porcelain` debe estar **baleiro** (traballo
terminado e cometido). Se non o está: comitea o que quede cunha mensaxe clara
(`chore: peche final antes do rebase`); borra explicitamente, un a un, os ficheiros
que xa non fagan falta. Nunca uses `git stash`.

## 4. Fase 1 — Base actualizada (verificación)

A túa branch rebasase sobre `main` **actualizado**:

```bash
cd "$RAIZ"                                          # nunca rebases dende dentro do worktree
git checkout main 2>/dev/null || true               # verifica en que branch estás
git status --porcelain                              # main debe estar limpo; se non o está, DETENTE (regra 3)
```

Se o repo ten remoto (`git remote` enumera `origin`):

```bash
git fetch origin                                   # actualiza origin/main
git rev-parse --short origin/main                  # anota o sha de referencia
```

Verificación: comparando `main` local con `origin/main`
(`git rev-parse main` vs `git rev-parse origin/main`):

- iguais → prosegue;
- `main` está **detrás** de `origin/main` → avanza con fast-forward:
  `git merge --ff-only origin/main` (nunca `--force`);
- `main` está **diante** (tes commits locais non empuxados) → non toques nada:
  rebasa sobre o teu `main` local e informa no informe final de que hai commits
  locais pendentes de push;
- divergiron → DETENTE e informa: non podes resolver esa diverxencia ti.

Se o repo **non ten remoto** (repos de proba locais): `main` local é a única
verdade. Anota o sha de `main` e prosegue. No informe final menciona "sen remoto:
Fases 1/7 adaptadas".

Verificación final da fase: `git -C "$RAIZ" status --porcelain` baleiro e anotaches
`SHA_MAIN` = `git -C "$RAIZ" rev-parse main` (sha completo, así serve para
`merge-base --is-ancestor`).

## 5. Fase 2 — Rebase da túa branch sobre `main` (sen atallos)

Dende fóra do teu worktree:

```bash
git -C "$WT" status --porcelain                    # repite: debe estar baleiro
git -C "$WT" rebase main
```

Dous resultados posibles:

- **Exit 0** → rebase rematado sen conflitos. Vai á Fase 4 (aínda así, executa a
  verificación de marcadores da Fase 3 por prudencia).
- **Conflito** (git avisa de `CONFLICT (content)` etc.) → Fase 3. Isto é ESPERADO
  e normal; non é un fallo.

Verificación tras iniciar: a lista de ficheiros con conflito é exactamente a que
esperabas tocar na túa branch:

```bash
git -C "$WT" diff --name-only --diff-filter=U      # ficheiros UNMERGED
git -C "$WT" status --porcelain                    # mostra os marcadores UU/AA/DD...
```

## 6. Fase 3 — Resolver TODOS os conflitos (sen atallos)

Para **cada** ficheiro da lista anterior, nesta orde exacta:

1. Ábreo e localiza os bloques de conflito (marcadores `<<<<<<<`, `=======`,
   `>>>>>>>`).
2. Comprende os **dous** lados: o lado `HEAD` (a túa branch, o teu commit en
   curso) e o lado entrante (a main). Non elixas a cegas: o resultado correcto é
   o que faga sentido para o código/documento, normalmente **combinando** ambos.
3. Edita o ficheiro: elimina os tres marcadores e deixa só o contido decidido.
4. Marca o ficheiro como resolto:
   ```bash
   git -C "$WT" add <ficheiro>
   ```

Cando todos os ficheiros estean marcados, verifica que **non queda ningún
marcador** en ningún ficheiro versionado:

```bash
git -C "$WT" grep -nE '^(<{7}|={7}|>{7})( |$)' || true    # sen saída = limpo
```

(Se `git grep` mostra hits, NON continues: abre ese ficheiro, remata a resolución
e volve a marcar con `git add`.)

Continúa o rebase:

```bash
GIT_EDITOR=true git -C "$WT" rebase --continue      # true evita editor interactivo
```

Se o rebase tiña varios commits, pode volver a parar por **outro** conflito nun
commit seguinte: repite esta Fase 3 desde o principio. Cando remate:

```bash
git -C "$WT" status --porcelain                     # baleiro = rebase rematado
git -C "$WT" rebase --continue 2>&1 || true         # debe dicir "No rebase in progress"
```

Verificación de contabilidade: confirmas que o rebase non duplicou nin perdeu
nada — a lista de commits da túa branch sobre `main` debe ser exactamente os teus
(anotados como `SHA_BRANCHES`):

```bash
git -C "$WT" log --oneline main..HEAD
git -C "$WT" merge-base --is-ancestor "$SHA_MAIN" HEAD && echo OK   # main é ancestral da túa HEAD
```

## 7. Fase 4 — Verificación da integridade tras o rebase

Todo isto ten que saír positivo antes de seguir:

```bash
git -C "$WT" status --porcelain                          # baleiro
git -C "$WT" grep -nE '^(<{7}|={7}|>{7})( |$)' || true   # sen marcadores
git -C "$WT" diff main --stat                             # o diff neto da túa branch
```

Revisa `git diff main --stat` co teu criterio: o conxunto de ficheiros tocados ten
que coincidir co que fixeches na túa tarefa. Se ves ficheiros alleos no diff,
DETENTE e informa (algo non foi ben no rebase).

## 8. Fase 5 — Testes (se o repo os define)

Se o repo ten tests definidos (ex.: `package.json` con `"test"`, `node --test`
con ficheiros `*.test.*`, `make test`, ou un comando documentado), córreos agora,
sobre a branch xa rebasada, dende o worktree:

```bash
cd "$WT"
<comando de test do repo>
```

Verificación: exit 0 e rexistra o resultado (PASS/FAIL/NA) no informe final. Se os
testes fallan por algo causado polo rebase, corríxeo cun commit novo NA TÚA
BRANCH e repite Fases 2–4 (rebase de novo, porque main pode ter avanzado). Se os
testes fallan por causas alleas á túa branch, non os emendas: informa o estado no
informe final.

## 9. Fase 6 — Merge na main (sen atallos, con commit de merge)

```bash
cd "$RAIZ"
git branch --show-current                              # debe ser main; se non, `git checkout main`
git merge --no-ff "$BRANCH" -m "merge: $BRANCH en main"
```

`--no-ff` crea un commit de merge explícito (rexistro auditable de integración);
non uses fast-forward, nin `-X`, nin edición do editor (a mensaxe xa a pasaches).

Verificación:

```bash
git log -1 --format='%h %s'                            # = o teu commit de merge
git for-each-ref --merged=main --format='%(refname:short)' refs/heads \
  | grep -F "$BRANCH"                                  # lista a túa branch = mergeada
git -C "$RAIZ" status --porcelain                      # baleiro
git -C "$RAIZ" log --oneline --graph -5                # revisa visualmente o resultado
```

## 10. Fase 7 — Push (só se o repo ten `origin`)

Verifica primeiro que o remoto segue a par (alguén puido empurrar mentres
rebasabas):

```bash
cd "$RAIZ"
git fetch origin
git rev-list --count main..origin/main                 # 0 = o remoto non che leva
git rev-list --count origin/main..main                 # = cantidade de commits novos
```

- Sen diverxencia e con commits novos → empurra:

  ```bash
  git push origin main
  ```

  Verificación: `git status -sb` mostra `## main...origin/main` sen
  `[ahead/behind]`, ou ben `git rev-list --count main..origin/main` = 0.

- Push rexeitado por non-fast-forward → **NUNCA `--force`**. Fai fetch, avanza
  `main` con `git merge --ff-only origin/main`, re-rebasa a túa branch (Fases
  2–4; se xorden conflitos novos, resólveos igual) e volve a Fase 6 e 7.
- Repo sen remoto → salta esta fase e anótao no informe.

## 11. Fase 8 — Limpeza: worktree e branch

**Executa sempre dende `$RAIZ`, nunca dende dentro do worktree que vas eliminar.**

```bash
cd "$RAIZ"
git -C "$WT" status --porcelain                        # debe estar baleiro (Fase 4 xa o comprobou)
git worktree remove "$WT"                              # sen --force: unha worktree limpa elimínase sen el
git worktree prune                                     # limpa metadatos orfos se os houbera
```

Verificación:

```bash
git worktree list --porcelain                           # o teu worktree xa non aparece
test ! -e "$WT" && echo "worktree eliminado"
```

Despois, elimina a branch (borrado seguro `-d`, nunca `-D`; tras o merge tamén
deletea sen force):

```bash
git branch -d "$BRANCH"
```

Verificación:

```bash
git branch --list "$BRANCH"                             # sen saída = eliminada
git branch                                              # confirma que non queda
git worktree list                                       # só o checkout principal (+ worktrees alleas lexítimas)
```

Se `git branch -d` rexeita (a branch NON está totalmente mergeada), DETENTE e
informa: é síntoma de que o merge ou o rebase non quedaron ben; investiga antes de
tocar nada.

## 12. Fase 9 — Informe final e retirada

**Última verificación global** (todo en positivo):

```bash
cd "$RAIZ"
git status --porcelain                                  # baleiro
git branch --list "$BRANCH"                             # sen saída
git worktree list --porcelain                           # sen o teu worktree
git log --oneline -5                                    # a túa historia mergeda visible
```

Entrega o informe final co modelo EXACTO seguinte (substitúe os placeholders; non
deixes campos baleiros sen explicación):

```
## INFORME FINAL — <BRANCH>
- Repo/raíz: <camiño absoluto>
- Worktree: <camiño> · Branch: <nome>
- Base: main en <SHA_MAIN> (remoto: si/non)
- Rebase: commits integrados: <lista SHA> · conflitos resolto: <ficheiros, ou 0>
- Testes: PASS | FAIL | non hai (comando usado: <…>)
- Merge: <SHA do merge commit> · Push: si/non/non aplica
- Worktree eliminado: si/non · Branch eliminada: si/non
- Veredicto: LISTO | BLOQUEADO (<razón exacta>)
- Notas: <calquera cousa que o coordinador deba saber>
```

Despois do informe, **retírate**: encerra o teu turno sen pedir confirmación nin
facer preguntas (só se BLOQUEADO, explica que falta). Non deixes procesos en
segundo plano, non deixes ficheiros temporais, non modifiques nada máis. O
traballo do repo quedou integrado e o teu ciclo pechado.