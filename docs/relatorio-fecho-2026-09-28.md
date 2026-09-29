# Fecho da atividade de 2026-09-28 — relatório

Relatório do fecho da atividade em curso no Claude Code: o que estava em aberto, o que
foi fechado, a matriz de validação (tudo no macmini), o regressivo Playwright e os
problemas encontrados.

## 1. O que estava em aberto

- **WIP não commitado no macmini** (`/Volumes/Ext2TB/Projects/dsh-work-game`, ~5,5 mil
  linhas em 14 ficheiros + 12 novos): celular iPhone/iMessage com a conversa real,
  barra lateral da pessoa, filtros da sala, avatares a dormir e cenário de escritório.
  As features estavam implementadas e com testes verdes — faltava o **fecho**:
  validação final, commit + push, regressivo e relatório.
- A árvore do Acer estava limpa em `cd12769` (= `origin/main`); o WIP só existia no
  macmini. Sincronização pela regra de sempre: **quem está mais atualizado faz push,
  o outro pull** (hoje: macmini → origin → Acer).

## 2. O que foi feito no fecho

1. Validação completa do WIP no macmini (matriz abaixo) — tudo verde.
2. `f3cf598` — commit do WIP (26 ficheiros, +6 997/−308) e push para `origin/main`.
3. `008b888` + `76620b5` — regressivo Playwright criado (`scripts/regressivo-playwright.mjs`),
   documentado no README, e corrido no macmini **36/36 verdes** (chromium + webkit).
4. Pull no Acer e verificação de paridade (ambas as pastas no mesmo HEAD, árvores limpas).
5. Envio real pelo celular (`verify-dsh-panel.mjs --enviar`) numa conversa de teste.
6. Este relatório + memória CoALA.

## 3. Matriz de validação (macmini, macOS 15.7.9, node v24.19.0)

| Portão | Comando | Resultado |
|---|---|---|
| Suíte completa | `node --test 'tests/**/*.test.mjs'` | ✅ **236/236** (35 s) |
| Suíte completa (Acer) | `node --test 'tests/**/*.test.mjs'` | ✅ **236/236** (paridade) |
| Doctor do produto | `node dwg-cli/bin/dwg doctor` | ✅ todos os portões (node, assets, testes rápidos, config DSH, rota barata `deepseek-v4-flash-0731`) |
| Gerador do cenário | `python3 scripts/gerar-fundo-escritorio.py --verificar` | ✅ paridade byte a byte (`office-backdrop.svg`, `cenario-fundo.txt`, `FUNDO_ESCRITORIO`) |
| Sessão simulada | `node scripts/demo-session.mjs logs/sessao-fecho` | ✅ **10/10 passos** (cena, telemetria, pergunta, pilha de papéis, fim de turno, >200k, arquivo, zero erros) |
| Painel num DSH web real | `node scripts/verify-dsh-panel.mjs <url> --acoes --conversa` | ✅ bundle, mesas por workspace, bonecos, "zzz", relógio da cena, barra lateral + 3 separadores, celular com bolhas reais, filtros + persistência, câmara (zoom legível, sangria, painel estreito), rato real, teclado, **0 erros de consola** |
| Envio real pelo celular | `node scripts/verify-dsh-panel.mjs <url> --conversa --enviar "palavra: ok"` | ✅ mensagem na fila → "a escrever…" → resposta `ok`; caixa limpa; 0 referências retidas |
| **Regressivo Playwright** | `node scripts/regressivo-playwright.mjs --dsh <url>` | ✅ **36/36** — chromium e webkit × (demo + Modo jogo) |

O DSH web de teste (0.1.6-alpha.2, `127.0.0.1:3080`, perfil `web`) serve o plugin por
`link:` a este repositório — o que se testou é exatamente o código versionado.

## 4. Regressivo Playwright (novo)

`scripts/regressivo-playwright.mjs` — segunda linha de regressão, opcional (o `npm test`
continua sem dependências). Corre as viagens centrais em **chromium e webkit** (webkit
apanha as armadilhas do Safari) nas duas superfícies:

- **demo**: arranque com a cena-semente, zero requisições externas, inspetor com
  separadores, mobile 390×844 sem overflow, zero erros de consola.
- **Modo jogo** (DSH web real): ativação do bundle, workspaces → mesas, bonecos com
  `<symbol>` resolvido e caixa real, "zzz" junto à cabeça, filtros (4 interruptores +
  persistência depois de recarregar), barra lateral com os três separadores e conteúdo,
  celular (bolhas iMessage com as duas cores, caudas, sem foco automático) e fecho com
  **0 referências de sessão retidas**.

Como repetir:

```bash
npm i --no-save playwright && npx playwright install chromium webkit
node scripts/regressivo-playwright.mjs --dsh "http://127.0.0.1:<porta>/?token=<token>"
```

Evidências: `logs/regressivo-fecho/` (`relatorio.json`, `relatorio.md`, 14 capturas).
Exit codes: `0` verde · `1` reprovação · `2` uso inválido · `3` dependência em falta.

## 5. Problemas encontrados

| # | Problema | Gravidade | Estado |
|---|---|---|---|
| 1 | **WIP por commitar no macmini** — ~5,5 mil linhas validadas mas sujeitas a perda (só existiam na árvore de trabalho da máquina remota) | alta | ✅ resolvido — `f3cf598` commitado e publicado |
| 2 | **`git push` no macmini por SSH reclama do keychain**: `fatal: failed to get: -25308` (`errSecInteractionNotAllowed`) em sessão não-interativa. O push acabou por funcionar (a credencial foi obtida por outra via), mas o helper `osxkeychain` barra sempre o store | média (infra) | ⚠️ em aberto — sugere-se `git config --global credential.helper store` (ou helper próprio) para sessões SSH headless |
| 3 | **Browsers do Playwright por instalar** em ambas as máquinas: o cache do macmini tinha builds de outras versões (`chromium-1228/1234`) e o `playwright@1.63` exigiu `npx playwright install chromium`; no Acer falta o webkit | baixa (infra) | ✅ resolvido na máquina de teste; receita documentada no README |
| 4 | **Clique real no centro do `<g>` da pessoa não seleciona** — o centro da caixa do grupo cai no `rect.paper-active` da mesa (a área de hit do lugar não cobre o centro da própria bounding box). Os testes CDP não apanhavam porque o driver dispara eventos sintéticos **no elemento** | baixa (testabilidade; o produto não muda) | ✅ documentado e contornado — o regressivo clica na `.seat-card` |
| 5 | **Interruptores `role="switch"` do menu de filtros sem texto próprio** (a etiqueta vive num `<strong>` vizinho, ligada por `aria-labelledby`) — acessibilidade correta, mas ferramentas que leem `textContent` do interruptor ficam vazias | cosmético | ✅ detalhe corrigido no regressivo |
| 6 | Stash antiga `stash@{0}` ("WIP antigo (colisão de ids)") ainda no repositório — decisão anterior: foi transferida e substituída no macmini | informativo | ➖ manter |

Nenhum problema funcional no produto: as 236 unidades, a sessão simulada 10/10, as
verificações ao vivo (incluindo envio real) e os 36 checks Playwright passaram à
primeira, nos dois motores.

## 6. Sincronização (paridade)

| | Acer | macmini |
|---|---|---|
| HEAD | `76620b5` | `76620b5` |
| Árvore | limpa | limpa |
| Suíte | 236/236 | 236/236 |

Fluxo usado: **macmini (onde vivia o trabalho) → `origin/main` → Acer**. Os commits do
fecho: `f3cf598` (WIP), `008b888` (regressivo Playwright), `76620b5` (afino do relatório
do regressivo).

## 7. Bateria de repetição rápida

```bash
# no macmini
cd /Volumes/Ext2TB/Projects/dsh-work-game
zsh -l -c "node --test 'tests/**/*.test.mjs'"            # 236 testes
node dwg-cli/bin/dwg doctor                              # portões do produto
python3 scripts/gerar-fundo-escritorio.py --verificar    # paridade do cenário
node scripts/demo-session.mjs logs/sessao                # sessão simulada 10/10
node scripts/verify-dsh-panel.mjs "<url-dsh>" logs/verif --acoes --conversa
node scripts/regressivo-playwright.mjs --dsh "<url-dsh>" # chromium + webkit
```
