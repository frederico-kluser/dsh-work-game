# Algoritmo de expressões — dsh-work-game

Descrição humana do **motor de expressões** (`dsh-plugin/src/expressoes.js`): como os
eventos de uma sessão de agente de IA se transformam na cara do personagem à secretária.
Contrato compacto: `docs/contratos-plugin.md` §9. Base de evidência:
`pesquisas/2026-10-02-que-taxonomia-de-expressoes-faciais-regras-de-mapeamento-eve.md`
(dossiê de pesquisa; as citações Q3/Q8/Q9/Q10/Q11/Q12 referem as perguntas desse dossiê).

O motor é **puro**: sem relógio, sem `Math.random`. Toda a entropia vem da semente da
pessoa e do `sal` de cada evento (o carimbo `at`), e todo o estado (PRNG uint32 + sacos
de shuffle bag) é serializável e clonável — vive na pessoa (`state.js`) e clona-se com o
resto do estado.

## 1. Taxonomia de cenários

15 cenários, cada um com pool de variantes, base de reserva, probabilidade de disparo e
prioridade de arbitragem. Os 14 presets da biblioteca Avataaars pertencem todos a pelo
menos um pool; `sleeping` (Modo jogo) é o 15.º preset.

| cenário | evento (vocabulário §1) | pool | base | prob | prioridade |
|---|---|---|---|---|---|
| `pergunta` | `question` | waiting · thinking · surprised | waiting | 1 | 95 |
| `aprovacao` | `approval` | approval · waiting · surprised | waiting | 1 | 95 |
| `erro` | `turn/end` error\|blocked\|max-tokens | error · surprised · disbelief | error | 1 | 90 |
| `sucesso` | `turn/end` completed | success · celebrating · approval · wink | success | 0.9 | 85 |
| `ferramenta-erro` | `tool` result `ok === false` | surprised · disbelief · error | error | 1 | 80 |
| `erro-transitorio` | `retry` | surprised · thinking · disbelief | thinking | 1 | 75 |
| `cancelado` | `turn/end` aborted\|interrupted | disbelief · waiting · idle | idle | 1 | 70 |
| `compactacao` | `compaction` start | surprised · disbelief · thinking | thinking | 1 | 65 |
| `sobrecarga` | `ctx`/`model` com pressão ≥ 0.85 | thinking · disbelief · surprised | thinking | 1 | 60 |
| `ferramenta` | `tool` call / result ok | tool · searching · focused · thinking | working | 0.85 | 50 |
| `contexto` | `ctx`/`model` com pressão ≥ 0.70 (ou used ≥ 200k) | focused · thinking | focused | 1 | 45 |
| `mensagem` | `message` (user/assistant) | working · focused · thinking · wink | working | 0.5 | 40 |
| `subagente` | `subagent/start` | thinking · tool · focused | working | 0.6 | 35 |
| `ocioso` | `status` idle | idle · wink | idle | 0.7 | 10 |
| `dormir` | `status` idle no Modo jogo | sleeping | sleeping | 1 | 5 |

`base` é o fallback quando a identidade **nenhum** preset do pool tem (identidades
aleatórias r01..r12 só têm idle/working/success/error — aí `ferramenta` cai em
`working`, `sucesso` em `success`, etc.).

Eventos **sem** cenário (não mudam a cara): `question/answered`, `approval/decided`,
`subagent/end`, `compaction` end, `usage`, `session/*`, `status` running.

### Mapeamento de eventos

```
question ────────────────► pergunta          turn/end completed ─────► sucesso
approval ────────────────► aprovacao         turn/end error/blocked/  ► erro
                                              max-tokens
tool call ───────────────► ferramenta        turn/end aborted/        ► cancelado
tool result ok ──────────► ferramenta         interrupted
tool result ok===false ──► ferramenta-erro   retry ──────────────────► erro-transitorio
message (user|assistant) ► mensagem          compaction start ───────► compactacao
subagent/start ──────────► subagente         status idle ────────────► ocioso (dormir no
ctx/model com pressão ───► contexto |         Modo jogo)
                            sobrecarga
```

## 2. Sorteio de variantes — shuffle bag puro

Por **(pessoa × cenário)** o motor mantém um *shuffle bag* (saco de sorteio sem
reposição):

1. **UMA cópia por variante** do pool efetivo (pool filtrado pelos presets da identidade;
   se esvaziar, o `base`; se também faltar, não há desenho).
2. **Fisher-Yates por ciclo**, com o PRNG determinístico (xorshift32) misturado com
   `hash(semente|cenario|ciclo)` — cada ciclo tem ordem própria por pessoa.
3. **Consumo sem reposição**: cada desenho tira o próximo item do saco.
4. **Anti-repetição**: o item seguinte nunca é a cara visível (`atual`) — troca-se com o
   primeiro item diferente do saco; só repete quando o saco restante é todo a cara atual
   (pool de uma variante).
5. **Correção de fronteira** (Q9/S60): quando o saco esvazia e nasce ciclo novo, o 1.º
   item nunca repete o último desenhado (rotação/swap do 1.º).
6. **Disparo aleatório**: antes do saco, o evento só dispara com probabilidade
   `prob do cenário × fator da pessoa` (0.85–1.15, estável por semente) — a variação de
   frequência entre pessoas vem SÓ daqui.

Garantias (testadas sobre ≥100 desenhos por cenário): cada ciclo é uma **permutação** do
pool (todas as variantes antes de qualquer repetição) e **nunca há repetição imediata**,
nem nas fronteiras entre ciclos.

> Pesos por multiplicidade (várias cópias da mesma variante no saco) foram **rejeitados**:
> quebram a não-repetição (com m(v) ≥ 2 há repetições intra-ciclo por construção e
> sequências A,B,A,B têm probabilidade positiva) e re-rolar a última variante com pesos
> desiguais desvia a distribuição (verificação adversarial da pesquisa). As proporções por
> ciclo ficam uniformes; a personalidade entra no disparo e na ordem de cada ciclo.

## 3. Dose-resposta por intensidade (Q11)

A intensidade da expressão é legível pela **amplitude** do traço diagnóstico, em passos
≥20% (20–40% leem-se como neutro; ≥60% é confiável). Sem amplitude variável nos SVGs, a
dose entra pela **escolha do preset** — os cenários de erro declaram `graus`, o seu pool
ordenado da expressão mais contida para a mais intensa:

| cenário | grau 1 (0.3) | grau 2 | grau 3 (1.0) | regra |
|---|---|---|---|---|
| `erro` (terminal) | surprised | disbelief (0.7) | error | usa o pool inteiro por omissão; `grau` explícito doseia por severidade |
| `erro-transitorio` | surprised | thinking (0.6) | disbelief | **escala** 1 grau a cada `retry` consecutivo (`pessoa.retries`, saturação no 3.º) |
| `ferramenta-erro` | surprised | disbelief (0.7) | error | transitório de **baixa intensidade**: grau fixo 1 |

A contagem de retentativas é do chamador (`state.js` zera-a quando o turno termina, o
status muda ou uma ferramenta responde com sucesso); sem `pessoa.retries`, o chamador
deriva a contagem dos eventos `retry` seguidos e passa `grau` ao `sortearExpressao`.

## 4. Regras de tempo e arbitragem (Q3/Q8/Q10)

`expressaoAplicavel({prioridadeAtual, prioridadeNova, at, ultimaAt, terminal, novoTurno})`:

- **(d) Prioridade superior aplica-se SEMPRE** — erro (90), pergunta/aprovação (95) nunca
  ficam escondidos por uma cara de trabalho (Q8/S59: tabela de prioridade explícita,
  erro/terminal > ação/ferramenta > idle).
- **(a) min-dwell 1200 ms** — um desenho de prioridade **inferior** é ignorado se
  `at - ultimaAt < 1200` ms (Q10: a categorização consciente demora ~0,6–1,0 s; a janela
  de macroexpressão vai de 0,5 a 4 s). Rajadas de eventos não piscam a cara.
- **(c) cadência máxima 1000 ms** — prioridade **igual** só redesenha a partir de
  `minMudancaMs` (Q3/Q10: no máximo ~1 mudança/s; nunca abaixo de 0,5 s ou lê-se
  microexpressão/piscar).
- **(b) stickiness terminal** — depois de `sucesso`/`erro`/`cancelado` a cara fica até um
  `message` do utilizador (novo turno) ou um evento de prioridade **igual/superior** (Q6:
  o erro persiste até reconhecimento; o sucesso é breve e decai — o contraste é temporal).

Sem carimbos `at`/`ultimaAt`, não há tempo que impor: as regras (a) e (c) não bloqueiam
(o estado é puro e há eventos sem data).

## 5. Pressão de contexto (Q12)

`nivelDePressao(ctx, nivelAnterior)` — dual-threshold com *deadband* (padrão
ANSI/ISA-18.2 [S56], anti-flicker em rajadas de medições):

| nível | entra quando | desativa quando |
|---|---|---|
| `contexto` | `used/window ≥ 0.70` **ou** `used ≥ 200 000` | `used/window < 0.65` **e** `used < 190 000` |
| `sobrecarga` | `used/window ≥ 0.85` | `used/window < 0.80` (desce para `contexto`) |

- O gatilho absoluto de **200 000 tokens** honra o pedido "contexto > 200k" (janelas
  grandes não disparam só pela razão).
- Os limiares 0.7/0.85 são **extrapolação declarada**: não existem limiares de
  preenchimento validados (convenção 50/75/90 do Agent Zero).
- `sobrecarga` deve ser **raro e curto**: após um desenho de `sobrecarga`, o próximo
  desenho de prioridade inferior regressa a `contexto`/`focused` (estado limitado no
  tempo). A `compactacao` gera a micro-reação breve (`compactacao`, pool
  surprised·disbelief·thinking) seguida do mesmo regresso a `contexto`.

## 6. Integração

- **`state.js`** (núcleo puro): mapeia cada evento para o cenário, arbitra o tempo e
  guarda o desenho no campo da pessoa correspondente (`varianteSucesso`, `varianteErro`,
  `varianteFerramenta`, `varianteTrabalho`, `varianteCancelado`, `varianteEspera`,
  `varianteOcioso`, `varianteFerramentaErro`) + `expressaoSacos`/`expressaoCenario`/
  `expressaoAt`/`expressaoTerminal`/`ctxNivel`/`retries`. A precedência da cara derivada
  mantém-se: `expressionOverride` > pergunta/aprovação (`waiting`, vence as variantes) >
  resultado do motor > `idle`. O repouso persistente é `idle` — a `wink` de `ocioso` é
  micro-interação de apresentação (vive em cima do hold e não o substitui [Q3/S33]).
- **`expressions.js`** embute o motor (ficheiro único da demo) em
  `window.DSH_EXPRESSIONS.expressoes`, gerado por
  `python3 scripts/embutir-expressoes-motor.py --embutir --alvo expressions` (paridade
  fonte↔cópia imposta por teste).
- **`app.js`** (demo): `reagir(person, cenario)` desenha via `criarMotorExpressoes` e
  mostra a reação one-shot (`autoExpression`) — override manual (`expressionPreset`)
  continua a ganhar; erros/sucessos duram 1,2 s, os restantes cenários a duração por
  mensagem (2,8 s, Q10).
- **`client.js`** (bundle do browser): motor embutido (`--alvo client`) e ligado —
  `sortearCara`/`presetDe`/`applyEvent` seguem a mesma tabela e regras (wiring
  evento→cenário→campo em `tests/plugin/expressoes-client.test.mjs`).

## 7. Testes

`tests/plugin/expressoes.test.mjs` impõe: paridade fonte↔cópia embutida; a taxonomia e
os limiares; o mapeamento evento→cenário (com histerese e o gatilho de 200k); a
arbitragem por prioridade; o min-dwell e a cadência por deltas de `at`; a stickiness
terminal; as garantias do shuffle bag sobre ≥100 desenhos por cenário (permutação por
ciclo + zero repetição imediata); o determinismo (mesma semente+sal ⇒ mesmo resultado);
a dose-resposta por graus; o fallback de identidades com 4 presets; a pureza (a entrada
nunca se muta) e a integração em `state.js`.
