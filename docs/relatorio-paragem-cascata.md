# Paragem em cascata — relatório (2026-09-28)

Tarefa: *"criar agentes, mandar tarefa adicional pra eles por mensagem e parar um agente no meio —
QUANDO PARAMOS UM AGENTE PARAMOS TODOS OS SUBAGENTES DELE TAMBÉM (nem o DSH tem essa feature)"*.

**Resultado: implementado, testado com agentes reais no macmini e verde em toda a bateria.**

## 1. O que o DSH faz hoje (verificado no código, tag `dsh-v0.1.6-alpha.2`)

| Mecanismo | Comportamento do DSH | Consequência |
|---|---|---|
| `session.cancel()` | "Cancel the running turn. **Pending queued work remains and resumes in FIFO order** after the Host reaches cancellation quiescence" | parar não impede a tarefa seguinte da fila de entrar em execução |
| `interrupt_agent` (tool-subagent-control) | "Stops only the target's current turn… **descendants keep running**" | os subagentes do alvo continuam a correr |
| `session.cancel()` em sessão de subagente | recusado: `session/agent-busy` — "is owned by subagent routing · use subagent delivery for this child session" | sem rota `session.cancel` para filhos |
| rota correta para filhos | `subagents.interruptByParent(child, parent, 'continuable')` — o `cancel()` do próprio cliente já a usa **quando tem a morada** | o retain tem de levar a morada `{parentSessionId, childSessionId, mode}` |
| `interruptByParent` em alvo não-residente | aceite mas **inócuo** (no-op silencioso) | o resultado `{accepted:true}` não prova que parou |

## 2. O que foi construído

**"Parar pessoa / Parar pessoa e equipa"** na barra lateral do Modo jogo (`dsh-plugin/src/client.js`,
`pararComSubagentes` + `state.js`, `planoDeParagem`):

1. **Plano em cascata** — o alvo e toda a subárvore de subagentes, **pai-primeiro** (o líder não pode
   re-delegar a meio da desmontagem), por nível, com proteção contra ciclos. A árvore sai do snapshot
   real do DSH (`byId.parentId` + `subagentsByParent`); forks entram como sessões normais.
2. **Por sessão** (referência retida por instantes, `await ref.ready`, release único):
   - **largar a fila ANTES de cancelar** (`updateQueue {kind:'remove'}` em `next-step`/`next-turn`) —
     sem isto as tarefas adicionais retomam sozinhas (contrato do `cancel()`);
   - **`cancel()`** com **morada explícita** no retain dos filhos (roteio `interruptByParent`);
   - **martelo de quietude**: repetir fila+cancel (máx. 4 rondas, 400 ms) enquanto houver fila ou
     turno vivo — o cancel num momento sem turno é aceite mas inócuo.
3. Falhas por id nunca abortam o resto do plano. Diagnóstico: `window.__wgParagem`.

## 3. O teste pedido (macmini, DSH web 0.1.6-alpha.2, trabalho real)

`node scripts/e2e-paragem.mjs "<url-dsh>" logs/e2e-paragem "palavra: ok"` — conversa de teste:

1. **Criar agentes** — tarefa de delegação enviada pelo celular → mesa violeta "Equipe de Kai" com
   **Nara e Tati a trabalhar** (subagentes reais, loops de 3 min).
2. **Tarefas adicionais por mensagem** — ao líder (entra na fila) e ao subagente Nara.
3. **Parar a meio** — botão "Parar pessoa e equipa" (com o alcance no título).
4. **Exigido e verificado**:
   - `window.__wgParagem.plano` cobre o líder e TODA a subárvore (11 sessões na ronda final,
     incluindo subagentes de rondas anteriores), `parados == plano`, **0 falhas**;
   - turnos cancelados em todas, filas largadas (as tarefas adicionais **não** sobreviveram);
   - **"líder e TODOS os subagentes parados"** — ninguém "Trabalhando" ≤ 30 s depois;
   - sem tarefas "na fila" no fim · **zero erros de consola**.

## 4. Problemas encontrados (e corrigidos) pelo teste

| # | Problema | Correção |
|---|---|---|
| 1 | `cancel()` **recusado** nos subagentes: retain por id não resolvia a morada → o cliente caía na rota `session.cancel` (host: "owned by subagent routing") | retain com morada explícita `{parentSessionId, childSessionId, mode}` + `await ref.ready` antes de agir (`a4ee5f4`) |
| 2 | A tarefa adicional **ressuscitava** após a paragem (fila mantida pelo `cancel` com `keepInbox`) | largar a fila ANTES do cancel + martelo de quietude até não haver sinais de vida (`00b07b6`, `b147886`) |
| 3 | O líder ficava **"Trabalhando" em fantasma** 30 s+ depois do Parar, com as sessões todas quietas: a ponte (diffs) e o adaptador (eventos reais) emitem **dois** `subagent/start` por filho (runIds diferentes) e o contador somava eventos — de um filho cancelado só chega um dos `end` | contagem por **filho ativo** (`subagentAtivos: Set`), com teste de regressão (`d520dd0`) |

## 5. Bateria final (macmini, tudo verde)

| Portão | Resultado |
|---|---|
| `node --test 'tests/**/*.test.mjs'` | ✅ **254/254** (macmini e Acer) |
| `dwg doctor` · gerador `--verificar` | ✅ portões ok · paridade byte a byte |
| `verify-dsh-panel.mjs --acoes --conversa` | ✅ painel OK, 0 erros de consola |
| `regressivo-playwright.mjs --dsh …` | ✅ **36/36** (chromium + webkit × demo + Modo jogo) |
| `e2e-paragem.mjs` | ✅ **PARAGEM EM CASCATA OK** (agentes reais) |

Testes novos: 18 em `tests/plugin/paragem.test.mjs` (plano e ciclos, paridade bundle ↔ `state.js`,
execução com fakes do DSH, fila largada, falhas isoladas, moradas, botão da barra lateral e a
regressão do fantasma).

## 6. Como repetir

```bash
cd /Volumes/Ext2TB/Projects/dsh-work-game
zsh -l -c "node --test 'tests/**/*.test.mjs'"                       # 254 testes
node scripts/e2e-paragem.mjs "<url-dsh>" logs/e2e-paragem "palavra: ok"   # gasta tokens (rota barata)
```

O contrato completo (fontes do DSH, rota `interruptByParent`, martelo de quietude) está em
[contratos-plugin.md](contratos-plugin.md) §"Paragem em cascata".
