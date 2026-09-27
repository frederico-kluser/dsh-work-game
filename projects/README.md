# projects/ — xigantes de proba do fluxo de integración

Micro-proxectos git **locais e mínimos** (sen remoto, sen rede) para exercitar de
ponta a ponta o ciclo de vida completo dun axente que traballa nun worktree:

```
worktree → branch → commit → rebase con conflito proposital → resolución →
merge en main → limpeza do worktree e da branch
```

Este mesmo fluxo é o que describe, en linguaxe imperativa e con verificación por
paso, o prompt `../prompts/merge-retirar.md`: o script `teste-e2e.sh` é o *oráculo
mecánico* dese ciclo — executa exactamente as mesmas operacións que o prompt lle
ordena ao axente, pero de forma determinista.

## Contido

| Entrada | Que é |
|---|---|
| `micro-alpha/`, `micro-beta/`, `micro-gama/` | repos git independentes (cada un co seu `.git`, branch `main` e tag `e2e-base`) |
| `teste-e2e.sh` | script que percorre o ciclo completo en cada micro e reporta `[PASS]`/`[FAIL]` por paso |
| `.worktrees/` | carpeta onde o teste monta os worktrees efémeros (borrase en cada execución) |

## Requisitos

- `git` >= 2.28 (usa `git init -b main` e é compatible con `git worktree`).
- `bash` ≥ 4. Unicamente scripts puros de git: **sen rede, sen remotes, sen
  dependencias**.

## Como funciona `teste-e2e.sh`

1. **Restauración determinista**: ao comezar, cada micro volve ao commit da
   etiqueta `e2e-base` (borra worktrees órfanos e branches mortas de execucións
   anteriores, se as houbera).
2. **Ciclo completo**, por micro, con verificación en cada paso:
   - `git worktree add -b feat/<micro>-e2e .worktrees/<micro> main`
   - commit na branch: cambia a **liña 3** de `feature.txt`;
   - commit concorrente en `main`: cambia a **mesma liña 3** (conflito garantido);
   - `git rebase main` → detense por conflito `UNMERGED` en `feature.txt`;
   - resolución a man (sen atallos: quitar marcadores, quedar cos dous contidos),
     `git add`, `rebase --continue`;
   - verificación de integridade (main ancestral, WC limpo, sen marcadores);
   - `git merge --no-ff` en `main`;
   - `git worktree remove` + `git worktree prune`;
   - `git branch -d` (borrado seguro);
   - verificación final do estado (só `main`, historia completa, WC limpo).
3. **Resumo final**: conta de PASS/FAIL e exit code `0` (todo OK) ou `1` (algun
   paso fallou).

Execútase dende calquera directório:

```bash
bash projects/teste-e2e.sh
```

## Relación co prompt `merge-retirar.md`

| Paso do prompt | Paso equivalente no teste |
|---|---|
| Fase 0 — descubrir o terreo | preparación do script (verificación de repo/branch) |
| Fase 1 — base actualizada | (sen remoto: omítese o fetch; `main` local é a base) |
| Fase 2 — rebase sobre `main` | paso de rebase, que para por conflito |
| Fase 3 — resolver todos os conflitos | resolución con `git add` + verificación de marcadores |
| Fase 4 — integridade tras o rebase | verificación main→HEAD, WC limpo |
| Fase 6 — merge `--no-ff` en main | merge con commit de integración |
| Fase 8 — limpeza worktree e branch | `worktree remove` + `branch -d` + verificación |

O caso de uso real: o coordinador monta o worktree/branch para un axente (paso 1),
o axente fai o seu traballo e comitea, e ao final recibe `merge-retirar.md`;
`teste-e2e.sh` valida que o resto da cadea de comandos que o prompt prescribe
funciona de punta a punta, incluído o conflito.

## Crear un micro novo

Copia o patrón (todo local, sen remoto):

```bash
d="projects/micro-<nome>"
mkdir -p "$d"
printf 'linha-1\nlinha-2\nlinha-3\nlinha-4\nlinha-5\nlinha-6\n' > "$d/feature.txt"
# + un README.md propio
git -C "$d" init -b main
git -C "$d" config user.name "Micro <nome>"
git -C "$d" config user.email "micro-<nome>@localhost"
git -C "$d" add .
git -C "$d" commit -m "chore: estado inicial de micro-<nome> (base para teste e2e)"
git -C "$d" tag e2e-base
```

Requisitos do contrato do script:

- `feature.txt` ten que ter `linha-3` na **liña 3** (alí provócase o conflito).
- Debe existir a etiqueta `e2e-base` no commit inicial (restauración determinista).
- A branch por defecto chámase `main`.

O script colle automaticamente calquera `micro-*/` que apareza na carpeta.

## Notas de gobernanza

- `projects/micro-*/` e `projects/.worktrees/` están excluídos do repo pai via
  `.gitignore` da raíz: son repos anidados (cada un co seu `.git`) e non deben
  entrar no historial do proxecto.
- `projects/README.md` e `projects/teste-e2e.sh` si poden versionarse.
- Os micro-proxectos son só locais; nunca se lles engade un remoto.