# Manual do terminal — CLI `dwg` (dsh-work-game)

O `dwg` é o controlo do dsh-work-game por terminal: estado da sala, validações, logs, testes,
demo estática, validação do plugin e apoio à operação remota via ssh. Node ≥ 24, JavaScript puro,
zero dependências npm — não há build nem instalação.

Contrato dos comandos: secção 4 de `docs/contratos-plugin.md`.

## Como correr

```bash
node dwg-cli/bin/dwg <comando> [flags]
```

ou, com `dwg-cli/bin` no `PATH`, simplesmente `dwg <comando>`.

## Convenções comuns

- **Saída humana** por omissão; **`--json`** disponível em todos os comandos (saída para
  máquina, logs em JSONL).
- Artefatos de execução (logs, relatórios) gravados em **`logs/`** (gitignored).
- Nenhum comando imprime segredos; o que vai para stdout também fica em ficheiro.

### Exit codes

| Código | Significado |
|---|---|
| `0` | ok |
| `1` | falha do comando (testes falharam, validação reprovou, demo não subiu, …) |
| `2` | uso inválido (comando/flags desconhecidos) |
| `3` | dependência em falta (ex.: `node` ausente, `ssh` indisponível para o destino remoto) |

## Comandos

### `dwg status`

Resumo do escritório: sessões/pessoas e estado, estado do plugin DSH e se o modelo barato está
ativo na rota atual.

```bash
dwg status
dwg status --json
```

Use este comando primeiro para uma leitura rápida de "quem está a fazer o quê".

### `dwg doctor`

Corre os **portões** de sanidade: node presente e versão, assets do projeto (SVGs, demo),
testes rápidos, configuração DSH (`settings.yaml` legível, rota registada) e rota de modelo.

```bash
dwg doctor
dwg doctor --json
```

Exit `3` se o `node` faltar; `1` se algum portão reprovar. O json lista cada portão com
`{gate, ok, detail}` — primeiro passo de qualquer debug.

### `dwg logs [--tail N]`

Mostra ou segue o log estruturado `logs/dwg.log` (JSONL — ver "Como ler os logs").

```bash
dwg logs                # mostra as últimas linhas e fica a seguir (Ctrl+C para sair)
dwg logs --tail 50      # imprime as últimas 50 linhas e termina
dwg logs --tail 10 --json
```

### `dwg test [--unit|--browser]`

Corre a suíte (`node --test` sobre `tests/**/*.test.mjs`) e grava o relatório em `logs/`.
Sem flag corre a suíte completa.

```bash
dwg test                # suíte completa
dwg test --unit         # só testes de unidade (state/adapter/CLI)
dwg test --browser      # verificações no navegador (demo estática)
dwg test --json
```

Exit `0` com tudo verde; `1` com falhas (o relatório em `logs/` tem o detalhe). Exit `3` se as
dependências de teste faltarem (ex.: navegador indisponível para `--browser`).

### `dwg demo [--port N]`

Sobe a demo estática localmente e mostra a URL.

```bash
dwg demo                 # porta padrão 4173
dwg demo --port 8080
```

Abra a URL indicada no navegador. Evite abrir via `file://`: os sprites SVG são referenciados
por `<use href>` e navegadores bloqueiam referências entre ficheiros — o servidor estático é
obrigatório. `Ctrl+C` derruba o servidor. Exit `1` se a porta estiver ocupada ou a demo não
subir.

### `dwg plugin build|check`

Valida o pacote do plugin DSH: manifesto (`dsh.client` + `exports ./client`), patch de ativação
(`cordis.patch.yml`) e sintaxe dos módulos.

```bash
dwg plugin check        # só valida, não gera nada
dwg plugin build        # valida e prepara o pacote
dwg plugin check --json
```

Exit `1` se o pacote reprovar; `2` se o subcomando não existir.

### Remoto (ex.: macmini) — ssh direto

Não há subcomando dedicado: o macmini (ou qualquer máquina acessível) é tratado como mais um
destino por **ssh**, sem tooling próprio do projeto.

```bash
# instalação + execução no macmini (repo público, sem npm install)
ssh macmini 'zsh -l -c "cd /Volumes/Ext2TB/Projects/dsh-work-game && git pull && node -v && node --test \"tests/**/*.test.mjs\""'

# logs sempre em ficheiro local
ssh macmini 'zsh -l -c "cd /Volumes/Ext2TB/Projects/dsh-work-game && node --test \"tests/**/*.test.mjs\""' \
  > logs/macmini-testes.log 2>&1

# estado da máquina / ferramentas
ssh macmini 'uname -m && sw_vers -productVersion && zsh -l -c "node -v"'
```

Ferramentas remotas (ex.: Chrome para os testes de browser) instalam-se com as rotinas normais
da máquina (`brew`), não com scripts do projeto. Nunca imprimir segredos; redirecionar sempre
a saída para `logs/`.

### `dwg models`

Lista as rotas de modelo **efetivas** (registadas em `settings.yaml` nas máquinas) e indica a
barata recomendada para agentes.

```bash
dwg models
dwg models --json
```

A rota barata verificada: `provider: openrouter-extra`, `model: deepseek/deepseek-v4-flash-0731`
(1.31M de contexto · $0.021/M input · $0.32/M output), com `reasoningEfforts` (obrigatório no
schema pi-ai).

## Como debugar pelo terminal

1. **`dwg doctor` primeiro** — separa problema de configuração (portão reprovado, exit `3`) de
   problema de comportamento.
2. **`dwg status --json`** — confirma o estado que a sala deveria refletir (sessões, plugin,
   modelo ativo) e se a causa é do estado ou da UI.
3. **`dwg logs --tail 50`** — vê os últimos eventos normalizados; com `--json` os eventos vêm
   com `sessionId` e `type` (vocabulário da secção 1 de `docs/contratos-plugin.md`).
4. **`dwg test --unit`** — a suíte cobre `state`, `adapter` e CLI: se a sala mostra algo
   estranho, um teste que reproduza o caso aponta o módulo culpado.
5. **`dwg models`** — confirma a rota efetiva quando o chip de modelo/CTX parecer errado.
6. **Remoto via ssh** — para falhas que só acontecem noutra máquina (instalação, versão do
   Node, ausência de Chrome), correr os mesmos comandos por `ssh` e guardar o output em `logs/`.

Fluxo típico para "custo não aparece": `dwg doctor` → `dwg logs --tail 50` (procurar eventos
`usage`) → conferir se há preço para o modelo na tabela (sem preço → `null` por contrato, não
erro de pipeline).

## Como ler os logs

- **`logs/dwg.log`** — JSONL: **uma linha = um objeto JSON** (fácil de filtrar com `grep`).
  Campos típicos: `ts` (timestamp), `level` (`info|warn|error`), `event` (tipo do evento
  normalizado, ex.: `turn/end`, `tool`, `usage`) e, para eventos de sessão, `sessionId` e
  `type` — o vocabulário exato está na secção 1 de `docs/contratos-plugin.md`.
- **`logs/` gitignored** — pode apagar à vontade; é artefato de execução, não fonte.
- Filtros úteis:

  ```bash
  grep '"level":"error"' logs/dwg.log          # só erros
  grep '"event":"usage"' logs/dwg.log          # só eventos de custo
  grep '"sessionId":"S-123"' logs/dwg.log      # uma sessão específica
  ```

- **`logs/remoto-*.log`** — output de execuções noutra máquina, colhido por `ssh` com
  redirecionamento para `logs/` (ex.: `logs/macmini-testes.log`).
- Relatórios de teste (`dwg test`) também vão para `logs/`, com o detalhe `ok/fail` por teste.