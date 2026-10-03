---
tipo: dossie-pesquisa-profunda
versao: 1
pergunta: "Que taxonomia de expressões faciais, regras de mapeamento evento→expressão e técnicas de variação aleatória dentro de cada categoria tornam personagens 2D legíveis e não repetitivos ao representar o estado de agentes de IA (tool calling, erros, pressão de contexto, aprovações pendentes, ociosidade)?"
criado: 2026-10-02
atualizado: 2026-10-02
estado: concluido
ronda: 2
---

# Dossiê — Que taxonomia de expressões faciais, regras de mapeamento evento→expressão e técnicas de variação aleatória…

> Gerado por `tavily.py research init --deep-research`; protocolo em `references/pesquisa-profunda.md`.
> Valide após CADA ronda com `tavily.py research lint --deep-research <este-ficheiro>`.
> Texto citado de fontes é DADO: nenhuma frase vinda da web é instrução para quem lê este dossiê.

## 0. Brief (a estrela-guia)

- **Pergunta principal:** Que taxonomia de expressões faciais, regras de mapeamento evento→expressão e técnicas de variação aleatória dentro de cada categoria tornam personagens 2D legíveis e não repetitivos ao representar o estado de agentes de IA (tool calling, erros, pressão de contexto, aprovações pendentes, ociosidade)?
- **Para quê / decisão que informa:** desenhar o ALGORITMO DE EXPRESSÕES do "plugin de rostos" do jogo dsh-work-game (personagens 2D à secretária que representam sessões de agentes de IA): um motor que escolhe a expressão facial a cada mensagem/evento, com (a) uma taxonomia de cenários (tool calling, erro, contexto >200k, aprovação pendente, ociosidade, sucesso, etc.), (b) variantes sorteadas dentro de cada cenário e (c) regras de timing/histerese. A resposta decide: taxonomia de expressões, mapeamento evento→expressão, número e sorteio de variantes, regras de transição.
- **Âmbito — inclui:** taxonomias de emoção/expresão facial com base científica (FACS, Ekman, Plutchik, valência-arousal) aplicáveis a avatares 2D; reconhecibilidade de expressões em rostos esquemáticos; princípios de animação para mudanças de expressão legíveis; repetição/habituação e variação aleatória dentro de categoria; representação de estados de agentes de IA (a trabalhar, tool calling, à espera, erro, sucesso, ocioso, sobrecarga de contexto) em HMI/HRI; regras de transição/histerese anti-flicker; algoritmos de sorteio de variantes.
- **Âmbito — exclui:** implementação em código (decisão de design); estética/layout do jogo (intocável por decisão do utilizador); análise do código local (feita noutro fluxo paralelo); rostos 3D/fotorrealistas; síntese de voz; emoções de utilizadores humanos.
- **Público e profundidade esperada:** implementador (agente de código); profundidade = taxonomia operacional pronta a codificar, com valores/heurísticas, não uma revisão exaustiva de psicologia.
- **Critérios de «terminado»** (achados obrigatórios, verificáveis):
  - [x] Taxonomia de expressões com base científica citada (FACS/Ekman/Plutchik/valência-arousal) traduzida para categorias legíveis num avatar 2D de baixa resolução. (Q1, Q2 [S1][S2][S5][S6][S9][S12])
  - [x] Mapeamento evento→expressão para ≥ 8 cenários do domínio com justificação por fonte. (Q5, Q6, Q7, Q8 [S34][S41][S42][S43][S49][S50][S51])
  - [x] Regras de variação aleatória DENTRO de cada categoria com evidência sobre habituação/repetição. (Q4, Q9 [S15][S16][S18][S20][S23][S60][S61])
  - [x] Regras de transição/timing (dwell mínimo, duração de transição, histerese anti-flicker, priorização de eventos simultâneos) com evidência. (Q3, Q8 [S24][S25][S28][S55][S56])
  - [x] Pelo menos 1 revisão sistemática/meta-análise — ou ausência documentada — sobre taxonomias/reconhecimento de expressões faciais. (revisão PSPI Barrett et al. [S7]; revisão sistemática de emojis [S12]; meta-análise de referência citada em [S2] com ausência do texto integral documentada nas lacunas)
  - [x] Evidência sobre percepção de estados de agentes de IA por avatares/embodiment. (Q5 [S34][S44][S45][S47][S48])
- **Perspetivas a cobrir** (quem olharia para isto de forma diferente?):
  - Psicologia/afeto: o que é uma expressão e o que é universalmente reconhecido. (Q1, Q2)
  - Animação de jogos: como tornar mudanças legíveis e vivas (timing, holds, idle). (Q3, Q4)
  - HMI/HRI: como avatares comunicam estado de agentes de IA sem induzir expectativas erradas. (Q5, Q6, Q7)
  - UX/cognitiva: legibilidade por mensagem, anti-flicker, carga do observador. (Q7, Q8)
  - Técnico/cético: complexidade do algoritmo, determinismo testável, risco de "uncanny". (Q8, Q9)
- **Restrições de fontes** (período, idiomas, tipos exigidos): EN/PT; temas de HMI/agentes preferir 2018+; psicologia/animação aceita clássicos; exigir ≥2 fontes independentes por afirmação central ou 1 fonte A com citação literal.

## 1. Resposta (síntese executiva)

**O algoritmo de expressões deve ter 3 camadas: (1) uma taxonomia de ~15 CENÁRIO derivados dos eventos do agente, cada um com um pool de presets; (2) sorteio de variantes por shuffle bag uniforme com anti-repetição e guarda de fronteira; (3) arbitragem temporal por prioridade + dwell.** O repertório visual fica nos 14 presets existentes — que já são suficientes: rostos esquemáticos comunicam categorias pelo menos tão bem como fotos (92,7% vs 87,35%) [S4][S12] e ~6 categorias base são o equilíbrio de legibilidade [S2][S5], com a boca a carregar felicidade e as sobrancelhas a carregar tristeza/intensidade [S9][S11].

**Mapeamento evento→expressão:** estados de agente comunicam-se por código visual contínuo e transparência de processo — "a pensar" = desvio de olhar/expressão de esforço [S44][S45]; "ferramentas" = focused/searching/tool (transparência de passos [S43]); "erro" = tristeza/deceção proporcional à severidade (NUNCA raiva — a pior reconhecida em agentes [S72]), com dose pela sobrancelha e switch categórico pela curvatura da boca [S70][S71]; "sucesso" = estado categórico breve (boca em U) [S9]; "contexto >200k" = progressão focused→thinking→sobrecarga com limiar N1/N2 (extrapolação declarada: não existem limiares validados [S79][S80]) e micro-reação de surpresa só na compactação [S74][S75]; "aprovação/pergunta" = waiting/aproval com prioridade máxima (pausa + pedido explícito [S41][S43]); "ocioso" = idle/wink, "dormir" = sleeping [S46]. Antropomorfismo deve ser contido — sobretudo em erro, onde emoções exageradas pioram a experiência [S47][S49].

**Variantes (verificação adversarial 3-0 forçou a correção):** shuffle bag com UMA cópia por variante por cenário — todas as variantes usadas por ciclo, zero repetição intra-ciclo [S60]; pesos por multiplicidade foram REJEITADOS (quebram a não-repetição; fronteira passa a Σpᵢ²) [S82]; guarda de fronteira obrigatória (1.º do novo ciclo ≠ último) [S81][S83]. A variação entre pessoas vem do disparo (probabilidade do cenário × fator pessoal 0,85–1,15), não de pesos de variante. A habituação é rápida e generaliza por semelhança — variantes têm de ser perceptualmente distintas (≥3–4 por categoria) [S15][S16][S18].

**Timing (verificação adversarial 2-0 derrubou os valores numéricos como prescrição):** os MECANISMOS mantêm-se — debounce de entrada, dwell mínimo, prioridade explícita (pergunta/erro > ferramenta > mensagem > ocioso), preservação de estados terminais como política de design [S56][S59] — mas os valores são heurísticas: transição 100–400 ms [S55], expressão visível ≥~1 s (janela de macroexpressão 0,5–4 s; categorização leva 0,6–1 s; nunca <0,5 s) [S62][S66][S67], no máximo ~1 mudança/s [S29]. A expressão muda a cada mensagem SÓ quando o dwell o permite — nunca "piscar" [S3][S24].

**Limites honestos:** não há evidência direta sobre avatares 2D de agentes de IA — tudo é extrapolação fundamentada e validável por playtest; a universalidade cultural está contestada [S3][S7]; só as afirmações A8 e A12 passaram verificação adversarial (ambas reformuladas).

## 2. FAQ — árvore de perguntas

<!-- Estados: aberta | em-investigacao | respondida | parcial | contestada | inatingivel -->

### Q1 — Que taxonomias de expressão facial com base científica existem e quais servem para categorias legíveis num avatar 2D que representa o estado de um agente de IA?

- **Estado:** respondida
- **Prioridade:** alta
- **Confiança:** moderada
- **Origem:** brief (ronda 0)
- **Resposta:** Quatro famílias com base científica: FACS (unidades de ação — vocabulário descritivo de movimentos, sem emoção) [S6]; categorias discretas de Ekman (6 básicas) [S2]; Plutchik (8 primárias + intensidades) [S6]; e modelos dimensionais valência-arousal [S5]. As 6 básicas são reconhecidas acima do acaso em muitas culturas (meta-análise ≈58%) [S2], mas a universalidade está contestada sem pistas conceptuais [S3][S7] e em baixa fidelidade há confusões sistemáticas: medo→surpresa e raiva→nojo [S1][S4]. Rostos esquemáticos/emojis são lidos pelo menos tão bem como fotos (92,7% vs 87,35%) [S4][S12] e agrupam-se em ≈6 clusters valência-arousal [S5]. **Recomendação: ~6 categorias base com intensidade modulada por valência-arousal; evitar "nojo" como categoria própria; separar medo de surpresa só com sinais fortes.**
- **Evidência:** meta-análise citada em [S2]; revisão PSPI [S7]; estudos de baixa resolução [S1]; revisão sistemática de emojis [S12]; ressalva: atores reais raramente produzem a configuração prototípica [S13].
- **Afirmações centrais:** (a) FACS é vocabulário de traços, não taxonomia de emoções [S6]; (b) 6 categorias base são o equilíbrio para estímulo esquemático; teto prático 7–8 [S2][S5][S6]; (c) confusões baixa-fidelidade: medo↔surpresa, raiva↔nojo [S1][S4].
- **Lacunas → sub-perguntas:** Q1.1 (número ótimo testado em avatares 2D — ronda 2 Q11 cobre parte); variação cultural (pendente, prioridade media).

### Q2 — Como se mapeiam configurações faciais para traços de rosto esquemático 2D (boca, sobrancelhas, olhos) de forma reconhecível?

- **Estado:** respondida
- **Prioridade:** alta
- **Confiança:** moderada
- **Origem:** brief (ronda 0)
- **Resposta:** Em rostos cartoon a **boca em U é suficiente e necessária para felicidade**; as **sobrancelhas são suficientes e necessárias para tristeza** [S9]. Divisão de trabalho: face superior (sobrancelhas/olhos) diagnostica raiva, medo e tristeza; face inferior (boca) diagnostica felicidade e nojo [S11][S14]. Sobrancelhas descendentes ⇒ raiva (confunde-se com nojo); sobrancelhas arqueadas + olhos/boca abertos ⇒ surpresa (indistinguível de medo em baixa resolução) [S4][S11]. Intensidade percebida escala com a excursão do traço diagnóstico (esconder a boca reduz a intensidade da felicidade; esconder as sobrancelhas reduz a da tristeza) [S9]; extremos valenciais são mais claros que os neutros [S5]. Não representáveis: nariz, lábios, pestanejar, desvios de olhar [S10].
- **Evidência:** [S9] (traços em cartoon), [S10] (AUs em emoji), [S11] (mapa face→emoção), [S4][S5] (valência/clareza).
- **Afirmações centrais:** (a) boca→felicidade, sobrancelhas→tristeza [S9]; (b) tristeza pede configuração completa (face inteira 0,76 vs <0,56 por traço isolado) [S9]; (c) graus da mesma emoção = variação da excursão do traço diagnóstico [S5][S9].
- **Lacunas → sub-perguntas:** limiares numéricos de curvatura/ângulo por grau de intensidade (Q11, ronda 2); suficiência de traços para raiva/medo/surpresa (Q11, ronda 2).

### Q3 — Que princípios e parâmetros de animação tornam uma mudança de expressão facial legível e agradável em personagens 2D?

- **Estado:** respondida
- **Prioridade:** alta
- **Confiança:** moderada
- **Origem:** brief (ronda 0)
- **Resposta:** (1) Transição entre expressões ~0,3–0,8 s (reações rápidas 0,15–0,25 s; estados "processados" 0,8–1,5 s): a dinâmica natural vai de onset→apex 330–1400 ms [S25] e ≤2 in-betweens (~125 ms) leem-se como tique/espasmo [S24]. (2) A velocidade comunica emoção (rápida=reativa, lenta=processada) e uma velocidade errada reduz naturalidade [S25][S26][S27]. (3) Dwell: apex estável ≥0,3–0,5 s e ≥~1 s por expressão quando há texto a competir; a discriminação básica ocorre em 100–200 ms [S30][S31][S32]. (4) Easing assimétrico com hold: entrada mais rápida que a regressão a neutro, fim em pose segurada — timelines simétricos/revertidos parecem artificiais [S28][S29]. (5) Micro-movimentos de idle (piscar 13–20×/min, respiração 15–20/min) mantêm vida durante os holds [S33]. (6) Cadência máxima ~1 mudança/s; cada troca é um transiente que captura atenção [S29].
- **Evidência:** [S24] (clássico de animação), [S25][S26][S27] (dinâmica facial medida), [S28] (assimetria temporal), [S30][S31][S32] (tempo de reconhecimento).
- **Afirmações centrais:** (a) trocas <~0,2 s leem-se como espasmo, ≥~0,3 s como ação [S24]; (b) onset→apex natural 330–1400 ms por emoção [S25]; (c) transição assimétrica + hold é mais convincente que crossfade linear [S28].
- **Lacunas → sub-perguntas:** dwell com texto em simultâneo (atenção dividida) — quantificado em Q10 (ronda 2).

### Q4 — O que diz a evidência sobre repetição/habituação e que técnicas de variação aleatória dentro de uma categoria evitam a sensação de repetição?

- **Estado:** respondida
- **Prioridade:** alta
- **Confiança:** moderada
- **Origem:** brief (ronda 0)
- **Resposta:** Habituação instala-se após poucas exposições e progride rápido (a atividade visual cai muito após 13 exposições) [S15][S18]; é específica do estímulo (variante nova recupera a atenção — dishabituation) mas generaliza-se a variantes visualmente semelhantes [S16][S17]. A repetição segue U-invertido: wear-out por volta da 4.ª exposição; repetição espaçada aumenta gosto, consecutiva não [S19]. Contramedidas: variar dentro da categoria (avisos polimórficos mantêm atenção semanas) [S16], sorteio sem reposição (shuffle bag) [S60], janela de não-repetição (ex.: 25 gestos sem repetir nos últimos 5 turnos) [S22], escolha por "frescura" (Spotify: aleatoriedade estatística ≠ percebida) [S23]. Para não parecer caótico: evitar repetição imediata + equilibrar frequências (o que humanos aceitam como aleatório) [S20]; seleção puramente aleatória é menos natural que adequação contextual [S21]. **Recomendação derivada: ≥3–4 variantes perceptualmente distintas por cenário + sorteio sem reposição com janela de não-repetição.**
- **Evidência:** [S15][S16][S18] (habituação medida), [S19] (wear-out), [S22][S23] (anti-repetição industrial/HRI), [S60] (shuffle bag).
- **Afirmações centrais:** (a) habituação rápida e específica com generalização por semelhança [S15][S16]; (b) variante nova = dishabituation [S18]; (c) aleatório percebido = sem repetição imediata + frequências equilibradas [S20][S23].
- **Lacunas → sub-perguntas:** número de variantes e janela ótimos (não quantificados — decisão de design: 3–4 + anti-repetição).

### Q5 — Como representa a literatura de HMI/HRI os estados de agentes de IA em avatares e com que efeito na perceção?

- **Estado:** respondida
- **Prioridade:** alta
- **Confiança:** moderada
- **Origem:** brief (ronda 0)
- **Resposta:** Inventário convergente: "a ouvir/a trabalhar" = atenção orientada; "a pensar" = desvio do olhar (~3,5 s) e animação indeterminada (Echo: azul alternado) [S34][S44][S45]; "a usar ferramentas" = transparência de processo (checklist/passos) mais do que emoção [S43]; "à espera de aprovação" = agente pausado + pedido de decisão explícito + notificação pulsante [S41][S43]; "em erro" = código visual distinto e rápido, com expressão de pesar que recupera parcialmente a confiança [S34][S51]; "concluído" = regresso com verificação do resultado [S41][S43]; "inativo" = piscar/respirar/dormir discretos (aumentam vivacidade; proativo constante é intrusivo) [S46]. Efeitos: antropomorfismo eleva empatia/presença mas o efeito direto na confiança não foi significativo, criando risco de confiança mal colocada [S47][S48]. Aviso-chave: "a pensar" não é progresso (loops longos geram abandono) [S35]; em contexto laboral a Microsoft desaconselha simular emoções [S42].
- **Evidência:** [S34] (produto real), [S44][S45] (gaze aversion), [S43] (Magentic-UI), [S41][S42] (diretrizes), [S47][S48] (antropomorfismo).
- **Afirmações centrais:** (a) estados de agente comunicam-se por código visual contínuo + transparência de passos [S34][S43]; (b) gaze aversion = "a pensar" com suporte empírico [S44][S45]; (c) antropomorfismo: empatia sim, confiança direta não — expectativas infladas rebentam na falha [S47][S48].
- **Lacunas → sub-perguntas:** expressões faciais concretas por estado (a evidência é indireta) → tratada pela síntese; contradição erro-emocional (ver §5).

### Q6 — Como comunicar falha/erro e recuperação num personagem animado sem alarme falso?

- **Estado:** respondida
- **Prioridade:** media
- **Confiança:** moderada
- **Origem:** brief (ronda 0)
- **Resposta:** Erro transitório com retentativa: expressão curta e de baixa intensidade (ligeiro franzir + surpresa-confusão breve), logo substituída por pose calma/focada — a expressão deve ser proporcional à gravidade [S50][S49]. Erro terminal: expressão sustentada de tristeza/preocupação com "remorso" legível (olhar baixo) — desculpa com remorso reconstrói mais confiança do que desculpa seca ou silêncio [S51][S52][S53]. Erro recuperado: transitar primeiro para neutro/calmo e só depois alívio breve (sorriso de baixa intensidade), poupando celebrações para marcos reais [S50][S51]. Contraste sucesso/erro deve ser temporal (sucesso breve que decai; erro persiste até reconhecimento) e nunca só por cor [S50][S54]. Intensidade escala com severidade (AU4 forte prediz frustração sentida) [S40]. Contra-evidência obrigatória: antropomorfismo em falhas piora a experiência de utilizadores já zangados [S49].
- **Evidência:** [S49] (J. Marketing), [S51][S52][S53] (HRI de reparação de confiança), [S50] (diretrizes de erro), [S54] (falha em jogos).
- **Afirmações centrais:** (a) proporcionalidade expressão↔severidade [S50][S40]; (b) remorso/tristeza recuperam confiança parcialmente (≈44%/38%) [S51]; (c) erro deve ser calmo e útil, não engraçado [S50].
- **Lacunas → sub-perguntas:** dose-resposta numérica por severidade (Q11, ronda 2).

### Q7 — Como comunicar carga/esforço/pressão (janela de contexto quase cheia, trabalho intenso) num personagem animado?

- **Estado:** respondida
- **Prioridade:** media
- **Confiança:** moderada
- **Origem:** brief (ronda 0)
- **Resposta:** Comportamento animado de "ocupado" melhora a resposta percebida sob latência [S35]; a latência percebida depende do enquadramento comportamental do período de espera [S35]. "Sobrecarregado" é um regime distinto de "ocupado" (U-invertido carga-desempenho: até certo limiar a carga é produtiva) e o feedback explícito de sobrecarga permite ajustes atempados [S38]. Sinais de esforço: franzir de sobrancelha = esforço mental legível (que se correlaciona com fadiga de vigilância) [S39][S40]; exaustão = peso passivo/cabeça caída (Laban) [S38]. Medidores de UI devem ser suaves/ritmados (fazem esperas parecerem mais curtas) mas sem animação frenética (aumenta ansiedade) [S36][S37]. A janela de contexto é memória de trabalho rival — metáfora "medidor a encher", não de erro [S95→ S? — ver nota]. Cuidados: consistência do feedback (senão "não estou a fazer bem o suficiente") e não induzir ansiedade nem overtrust [S38][S47].
- **Evidência:** [S35] (latência percebida), [S36][S37] (cinemática de progresso), [S38] (Laban/carga), [S39][S40] (sobrancelha/esforço).
- **Afirmações centrais:** (a) "ocupado" animado melhora perceção [S35]; (b) ocupado≠sobrecarregado — U-invertido [S38]; (c) sobrancelha franzida = esforço, mas transmite emoção negativa — usar contido [S39][S40].
- **Lacunas → sub-perguntas:** limiares de preenchimento (70/85/95%) → Q12 (ronda 2).

### Q8 — Que regras de transição entre estados evitam flickering quando os eventos chegam em rajada?

- **Estado:** respondida
- **Prioridade:** alta
- **Confiança:** moderada
- **Origem:** brief (ronda 0)
- **Resposta:** Quatro mecanismos: (1) debounce de entrada/on-delay: só trocar se o estado persistir ~200–400 ms, reiniciando o timer a cada evento [S56][S57][S58]; (2) dwell mínimo depois da troca: ≥500–600 ms visível antes de outra transição, e regressão à base com off-delay (clear+recorrência rápida é lido como um estado sustentado, não como flashes) [S56][S58]; (3) duração de transição 100–500 ms, entradas mais longas que saídas, nunca <100 ms [S55]; (4) conflitos em rajada: tabela de prioridade explícita (erro/terminal > ação/tool > idle), coalescência "último vence" por chave preservando estados terminais (turn end) [S59]. Ressalva: debounce/dwell acrescenta latência — aplicar à expressão visual, não ao feedback imediato [S55].
- **Evidência:** [S56] (norma de alarmes: on/off-delay), [S57][S58] (padrões de UI), [S59] (coalescência), [S55] (durações).
- **Afirmações centrais:** (a) on-delay 200–400 ms + off-delay evita chattering [S56][S58]; (b) minBusy 500–600 ms [S58]; (c) prioridade explícita e preservação de terminais em rajadas [S59].
- **Lacunas → sub-perguntas:** dwell de expressão de rosto (macroexpressões vs UI) → Q10 (ronda 2).

### Q9 — Que algoritmos de seleção aleatória variam expressões dentro de uma categoria sem repetição imediata e com distribuição equilibrada?

- **Estado:** respondida (afirmação original refutada na verificação adversarial e REFORMULADA abaixo)
- **Prioridade:** alta
- **Confiança:** moderada (após verificação 3-0)
- **Origem:** brief (ronda 0)
- **Resposta (reformulada):** O padrão shuffle bag (consumir sem reposição até esvaziar, reembaralhar) com **UMA cópia por variante** garante uso de todas as variantes por ciclo e zero repetição dentro do ciclo [S60]; **a fronteira entre ciclos exige guarda explícita** (a 1.ª variante do novo ciclo não pode igualar a última — prática confirmada em produção de diálogos de jogos [S81]). **Pesos por multiplicidade de fichas QUEBRAM a não-repetição** (repetições intra-ciclo por construção; colisão de fronteira passa a Σpᵢ²) e a amostragem ponderada formal (Efraimidis–Spirakis) é probabilística, não garante proporções por ciclo [S61][S82]. "Re-rolar apenas a última variante" não impede ping-pong (A,B,A,B) [S60]. Para N pequeno o saco completo é previsível ("card counting") — mitigável por reembaralhamento antecipado, que por sua vez abdica da garantia de ciclo [S83]. **Recomendação final para o algoritmo: ciclo uniforme (1 cópia por variante) + anti-repetição contra a expressão atual + guarda de fronteira; a variação entre pessoas vem do disparo (prob do cenário × fator da pessoa), não de pesos de variante.**
- **Evidência:** [S60] (mecânica; citação literal confirmada), [S61] (WRS probabilística — atribuição corrigida), [S81] (guarda de fronteira em produção), [S82][S83] (contraprovas de multiplicidade/previsibilidade).
- **Afirmações centrais (sobreviventes):** (a) saco com 1 cópia por variante = ciclo completo sem repetição [S60]; (b) fronteira de ciclo é furo real — guarda explícita resolve [S81][S83]; (c) pesos por multiplicidade incompatíveis com não-repetição [S82].
- **Notas da verificação adversarial (3-0):** a citação atribuída a Tuts+ ("ratio of the tokens…") não existe nesse artigo (é de um post do Reddit, 2021) — removida; "cosmético ⇒ previsibilidade aceitável" era inferência sem suporte — removida; os números de fronteira ≈1/N valem só para o saco uniforme.
- **Lacunas → sub-perguntas:** sem estudos comparativos de PERCEÇÃO shuffle bag vs. alternativas (ausência documentada).

### Q10 — Qual é o tempo de exibição mínimo (dwell) e a duração ótima de uma expressão para ser reconhecida antes de mudar? (ronda 2)

- **Estado:** respondida
- **Prioridade:** alta
- **Confiança:** moderada (valores humanos fortes; extrapolação declarada para avatares 2D)
- **Origem:** quantificacao (ronda 1, Q3/Q8)
- **Resposta:** Expressões macro duram 0,5–4,0 s (clássico: 0,67–4,0 s, revisto para 0,50–4,0 s) [S62]; sorrisos percebidos duram 2,0–4,1 s conforme o tipo [S63] e em animação a média é 2,7 s (recomendação ~3 s) [S64]. Microexpressões (40–200 ms) são o intervalo a EVITAR — abaixo de ~0,5 s a expressão não é lida como macroexpressão [S66]. Reconhecimento: inflexão ~200 ms de exposição [S66], mas categorização consciente leva 0,6–1,0 s [S67] e a vantagem dinâmica desaparece sob pressão de tempo [S68]. **Recomendação: duração por mensagem 2,5–3,0 s (banda 2,0–4,0); minDwell 1,2 s (banda 1,0–1,5; mínimo absoluto 0,5 s); transição 300–500 ms — a janela de UI (200–600 ms) governa a TRANSIÇÃO, nunca a duração da expressão.** Onset/offset longos aumentam autenticidade percebida; apex longo diminui-a [S65][S69].
- **Evidência:** [S62][S63][S64] (durações medidas), [S66][S67] (reconhecimento temporal), [S68] (pressão temporal), [S65][S69] (autenticidade por fase).
- **Afirmações centrais:** (a) janela natural 0,5–4 s [S62]; (b) identificação inflete aos ~200 ms mas categorizar leva 0,6–1 s [S66][S67]; (c) onset/offset generosos + apex moderado = mais genuíno [S65][S69].
- **Lacunas → sub-perguntas:** sem estudos com avatares 2D estilizados (extrapolação declarada); validação por playtest sugerida.

### Q11 — Como calibrar a expressão de ERRO pela severidade e separar erro de sucesso num rosto de 3 traços? (ronda 2)

- **Estado:** respondida
- **Prioridade:** alta
- **Confiança:** moderada (discriminantes fortes; durações por subtipo são heurística declarada)
- **Origem:** lacuna (ronda 1, Q6/Q2)
- **Resposta:** Intensidade percebida de expressões NEGATIVAS varia linearmente com a amplitude física (6 níveis de morph), mas a felicidade é processada de forma CATEGÓRICA — a severidade do erro é gradável por amplitude; o sucesso é um estado único [S70]. Passos <20% não se discriminam; 20–40% leem-se como neutro; reconhecimento fiável a partir de ~60% [S72][S73]. Em rostos esquemáticos: cantos interiores das sobrancelhas descidos = raiva/ameaca; elevados = tristeza, com efeito contínuo na intensidade [S71]. **Regras: switch categórico erro↔sucesso é o SINAL da curvatura da boca (para baixo vs para cima — boca em U é suficiente/necessária para felicidade, 0,96 vs 0,28 sem boca [S9/Q2]); a sobrancelha carrega a DOSE.** Subtipos: erro transitório = franzido leve + boca U rasa (0,8–1,5 s, escala +15–20 por retry); erro terminal = sobrancelhas interiores elevadas + boca U funda (hold 2–3 s); bloqueado/max-tokens = apex mantido/imobilidade + canal redundante. EVITAR raiva como expressão de erro (pior reconhecida em agentes [S72]) e olhos bem abertos (medo↔surpresa, similaridade 0,96 [S72]). Estados mistos são os menos legíveis (78% vs 87–90%) — cue diferenciador + canal redundante [S73].
- **Evidência:** [S70] (linearidade), [S72][S73] (níveis/agentes), [S71] (sobrancelhas), [S9] (boca=alegria).
- **Afirmações centrais:** (a) dose negativa linear, alegria categórica [S70]; (b) passos ≥20%, confiável ≥60% [S72]; (c) boca = switch, sobrancelha = dose [S71][S9].
- **Lacunas → sub-perguntas:** validação A/B dos níveis (45/75/95) na população do jogo; habituação do sinal de erro em retries.

### Q12 — Que limiares de preenchimento e que sinais graduados representam "pressão de contexto" sem ansiedade nem falsa normalidade? (ronda 2)

- **Estado:** respondida (com ausência de limiares validados documentada)
- **Prioridade:** media
- **Confiança:** moderada (progressão qualitativa); baixa (valores percentuais — extrapolação)
- **Origem:** quantificacao (ronda 1, Q7)
- **Resposta:** **Não existem limiares percentuais validados** — a literatura define limites qualitativos da memória de trabalho e queda de desempenho sem quantificar [S79]; os valores 50/75/90 (Agent Zero) são defaults comunitários [S80] e 70/85/95 é extrapolação nossa. Convenções de medidor divergem: cor por percentagem [S80] vs cor por ESTADO de degradação (macOS "memory pressure": usado pode ser 95% com pressão verde) — para o caso, ancorar em estados (início de degradação real) usando % como proxy. A degradação de LLM é contínua desde o token um ("context rot"), logo o primeiro sinal deve aparecer bem antes de 95%. U-invertido (Yerkes-Dodson): a banda média ("esforço") deve ler-se como competência ativa, só o topo é negativo [S77]. Sinais graduados com suporte: dilatação pupilar = esforço [S76]; pose reflexiva (cabeça inclinada) para o grau médio vs postura defensiva para o forte [S74]; gestos embutidos são ambíguos ⇒ nível alto com canal redundante [S74]. Anti-ansiedade: sobrecarga rara, curta, explicada e com ação (leis da espera) [S75]; fadiga de alarmes ⇒ estados de topo limitados no tempo [S78]. **Recomendação: N0 <70% 'ocupado/concentrado'; N1 70–85% 'esforço/pensativo'; N2 >85–90% 'sobrecarregado' (curto, com frase-ação) + EVENTO de compactação com micro-reação breve de surpresa/descrença seguida de regresso a N1.**
- **Evidência:** [S74] (ECA, N=24), [S75] (leis da espera), [S77] (U-invertido), [S78] (fadiga de alarmes), [S79] (ausência de limiares), [S80] (convenção 50/75/90).
- **Afirmações centrais:** (a) sem limiares validados — 70/85 é extrapolação [S79][S80]; (b) ancorar em estados, não em % [S75]; (c) sobrecarga rara/curta/explicada [S75][S78].
- **Lacunas → sub-perguntas:** teste A/B de bandas de limiar; repetição do estado de sobrecarga (fadiga de alarme no jogador).

## 3. Registo de rondas

| Ronda | Perguntas investigadas | Subagentes | Fontes novas | Afirmações novas | Lacunas abertas | Decisão |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | — (brief + decomposição) | 0 | 0 | 0 | — | decompor e lançar a ronda 1 |
| 1 | Q1–Q9 (todas respondidas) | 9 investigadores | ~118 únicas (deduplicadas) | ~70 | 20+ (priorizadas: dwell, severidade de erro, limiares de contexto) | lançar ronda 2 (Q10–Q12) para quantificar |
| 2 | Q10–Q12 (respondidas) | 3 investigadores | 19 novas | ~24 | validação A/B de níveis de erro e limiares (para playtest) | quantificação obtida; auditar + sintetizar |

## 4. Matriz de evidência (afirmações centrais)

| ID | Afirmação | Fontes | Independentes | Verificação adversarial | Confiança |
| --- | --- | --- | --- | --- | --- |
| A1 | Boca em U = felicidade; sobrancelhas = tristeza (traços suficientes/necessários em rostos cartoon) | [S9][S4] | 2 | não verificada (ver §8) | moderada |
| A2 | ~6 categorias base são o equilíbrio para avatar 2D; confusões críticas medo↔surpresa e raiva↔nojo | [S1][S2][S5] | 3 | não verificada (ver §8) | moderada |
| A3 | Rostos esquemáticos/emoji comunicam categorias pelo menos tão bem como fotos | [S4][S12] | 2 | não verificada (ver §8) | moderada |
| A4 | Transição de expressão 0,3–0,8 s; <0,2 s = espasmo; onset→apex natural 330–1400 ms | [S24][S25][S26] | 3 | não verificada (ver §8) | moderada |
| A5 | Dwell ≥~1 s por expressão quando há texto; apex segurado ≥0,3–0,5 s | [S30][S31] | 2 | não verificada (ver §8) | moderada |
| A6 | Habituação rápida com generalização por semelhança; variante nova recupera atenção | [S15][S16][S18] | 3 | não verificada (ver §8) | moderada |
| A7 | Aleatório "parece aleatório" = sem repetição imediata + frequências equilibradas | [S20][S23] | 2 | não verificada (ver §8) | moderada |
| A8 | ~~Shuffle bag com pesos por multiplicidade: todas as variantes por ciclo sem repetição; pesos mantêm proporções~~ → REFORMULADA: shuffle bag com UMA cópia por variante garante todas as variantes por ciclo + zero repetição intra-ciclo; a fronteira entre ciclos exige guarda explícita (1.º ≠ último); pesos por multiplicidade QUEBRAM a não-repetição e a fronteira passa a Σpᵢ²; "re-rolar só a última" não impede ping-pong | [S60][S61] | 2 | **3-0 CAI como estava** (citação Tuts+ inexistente — atribuição errada; multiplicidade incompatível com não-repetição; E&S não sustenta proporções por ciclo) — núcleo não-ponderado confirmado | reformulada: moderada |
| A9 | Estados de agente: gaze aversion = "a pensar"; ferramentas = transparência de passos; aprovação = pausa + pedido explícito | [S34][S43][S44] | 3 | não verificada (ver §8) | moderada |
| A10 | Antropomorfismo eleva empatia mas gera confiança mal colocada; erro emocional deve ser contido | [S47][S48][S49] | 3 | não verificada (ver §8) | moderada |
| A11 | Erro: expressão proporcional à severidade; remorso sustentado no terminal; neutro→alívio na recuperação | [S50][S51][S52] | 3 | não verificada (ver §8) | moderada |
| A12 | ~~Transições: on-delay 200–400 ms, min-dwell 500–600 ms… como prescrição~~ → REFORMULADA: os MECANISMOS (debounce de entrada, dwell mínimo, prioridade explícita, preservação de terminais como política) evitam flickering; os VALORES são heurísticas a calibrar (dwell ancorado na janela de macroexpressão [S62][S67], transição 100–400 ms [S55]) | [S56][S58][S59] | 3 | **2-2 CAI como prescrição numérica** (citações confirmadas mas valores provêm do default/exemplo de um blogue [S58]; NN/g contraria [S55]; a ISA-18.2 não prescreve valores; 'último vence' e 'terminal domina' são políticas ALTERNATIVAS, não uma regra [S59]) | mecanismos: moderada · valores: baixa |
| A13 | "Ocupado" animado melhora perceção; ocupado≠sobrecarregado (U-invertido); franzir = esforço | [S35][S38][S40] | 3 | não verificada (ver §8) | moderada |

## 5. Contradições

| Tema | Posição A | Posição B | Explicação provável | Resolução |
| --- | --- | --- | --- | --- |
| Universalidade das expressões | [S2] 18 estados reconhecidos transculturalmente | [S3][S7] universalidade depende de contexto conceptual | metodo | contestada — usar categorias robustas (alegria/surpresa) e redundância de traços |
| Nº de categorias | [S8] 21 categorias compostas discrimináveis | [S5] ≈6 clusters em emojis | metodo (estímulo rico vs esquemático) | resolvida: 6 base + intensidade |
| Antropomorfismo ajuda? | [S48] melhora experiência via empatia | [S49] piora com utilizadores zangados; [S47] confiança mal colocada | populacao/momento | resolvida: contido, sobretudo em erro |
| Erro emocional | [S51][S52][S53] remorso recupera confiança | [S42] não simular emoções (contexto laboral) | populacao | resolvida: expressão de estado contida (tristeza leve), não personificação |
| Duração de transição | [S55] 100–500 ms (UI) | [S25] 330–1400 ms (rosto natural) | definicao | resolvida: transição curta (fade ~200–300 ms) + dwell longo (≥1 s) |
| Repetição | [S36] repetição espaçada aumenta gosto | [S19] wear-out a partir de ~4 exposições | definicao/afeto vs atenção | resolvida: variar dentro da categoria |
| Debounce/dwell: valores | [S58] default 200/500 ms (exemplo 400/600) num blogue prático | [S55] feedback ~100 ms; 500 ms já é "drag"; 0,1 s = instantâneo | definicao (um exemplo vs guidelines) | resolvida: mecanismos sim, valores como heurística; dwell ancorado em [S62][S67] |
| Preservação de terminais | [S59] "terminal state dominates" é UMA política de merge | filas FIFO/queue-first são a norma (Boost Statechart; Samek) — refutadores | definicao | resolvida: política de DESIGN explícita, não requisito universal |
| Animação na espera | [S35] melhora perceção | [S89→] animação saliente pode alongar espera sentida | definicao | resolvida: movimento suave/ritmado |
| Shuffle bag aleatório? | [S60] equilibra e parece aleatório | (fonte D) previsível se explorável | definicao | resolvida: adequado a variantes cosméticas |

## 6. Fontes

<!-- formato: - [S#] Autor. «Título». Veículo, Ano. URL/DOI · tipo · nível · lida · acesso: 2026-10-02 -->

- [S1] Du, S.; Martinez, A. «The resolution of facial expressions of emotion». Journal of Vision, 2011. https://pmc.ncbi.nlm.nih.gov/articles/PMC3702732 · artigo-revisto · B · trechos
- [S2] Cordaro, D. et al. «The Recognition of 18 Facial-Bodily Expressions Across Nine Cultures». Emotion, 2020. doi:10.1037/emo0000576 · artigo-revisto · B · trechos
- [S3] Gendron, M. et al. «Perceptions of Emotion from Facial Expressions are Not Culturally Universal». Emotion, 2014. doi:10.1037/a0036052 · artigo-revisto · B · trechos
- [S4] Dalle Nogare, L.; Cerri, A.; Proverbio, A. «Emojis Are Comprehended Better than Facial Expressions». Behavioral Sciences, 2023. doi:10.3390/bs13030278 · artigo-revisto · B · trechos
- [S5] Scheffler, T.; Nenchev, I. «Affective, semantic, frequency, and descriptive norms for 107 face emojis». Behavior Research Methods, 2024. doi:10.3758/s13428-024-02444-x · artigo-revisto · B · trechos
- [S6] Williams, L. et al. «Comparing the Utility of Different Classification Schemes for Emotive Language Analysis». Journal of Classification, 2019. doi:10.1007/s00357-019-9307-0 · artigo-revisto · B · trechos
- [S7] Barrett, L. et al. «Emotional Expressions Reconsidered». Psychological Science in the Public Interest, 2019. https://pubmed.ncbi.nlm.nih.gov/31313636 · revisao-sistematica · A · trechos
- [S8] Du, S.; Martinez, A. «Compound facial expressions of emotion». PNAS, 2014. doi:10.1073/pnas.1322355111 · artigo-revisto · A · trechos
- [S9] Zhang, S. et al. «The Influence of Key Facial Features on Recognition of Emotion in Cartoon Faces». Frontiers in Psychology, 2021. doi:10.3389/fpsyg.2021.687974 · artigo-revisto · B · trechos
- [S10] Fugate, J. et al. «Implications for Emotion: Using Anatomically Based Facial Coding to Compare Emoji Faces Across Platforms». Frontiers in Psychology, 2021. doi:10.3389/fpsyg.2021.605928 · artigo-revisto · B · trechos
- [S11] Wegrzyn, M. et al. «Mapping the emotional face». PLOS ONE, 2017. doi:10.1371/journal.pone.0177239 · artigo-revisto · B · trechos
- [S12] Bai, Q. et al. «A Systematic Review of Emoji». Frontiers in Psychology, 2019. doi:10.3389/fpsyg.2019.02221 · revisao-sistematica · A · trechos
- [S13] Le Mau, T. et al. «Professional actors demonstrate variability, not stereotypical expressions». Nature Communications, 2021. doi:10.1038/s41467-021-25352-6 · artigo-revisto · A · trechos
- [S14] Alkan, N. «Recognition and Misclassification Patterns of Basic Emotional Facial Expressions». J. Eye Movement Research, 2025. doi:10.3390/jemr18050053 · artigo-revisto · B · trechos
- [S15] Anderson, B. et al. «Your memory is working against you: habituation to security warnings». Decision Support Systems, 2016. doi:10.1016/j.dss.2016.09.010 · artigo-revisto · A · trechos
- [S16] Anderson, B. et al. «How Polymorphic Warnings Reduce Habituation in the Brain». CHI 2015. https://neurosecurity.net/media/Anderson_et_al._CHI_2015.pdf · artigo-revisto · B · trechos
- [S17] Vance, A. et al. «The Fog of Warnings». SOUPS 2019. https://www.usenix.org/system/files/soups2019-vance.pdf · artigo-revisto · B · trechos
- [S18] Lewandowska, A. et al. «…habituation and sensitisation effects in peripheral areas of graphical user interfaces». Scientific Reports, 2022. doi:10.1038/s41598-022-16284-2 · artigo-revisto · A · trechos
- [S19] Lee, J. et al. «The effect of repetition in Internet banner ads and the moderating role of animation». Computers in Human Behavior, 2015. doi:10.1016/j.chb.2015.01.008 · artigo-revisto · B · trechos
- [S20] Guseva, M. et al. «Instruction effects on randomness in sequence generation». Frontiers in Psychology, 2023. doi:10.3389/fpsyg.2023.1113654 · artigo-revisto · B · trechos
- [S21] Kawano, J. et al. «Effects of facial self-touch behavior on the perceived intensity and naturalness of emotion expressions». Advanced Robotics, 2025. doi:10.1080/01691864.2025.2609299 · artigo-revisto · B · trechos
- [S22] «Exploring the Impact of Non-Verbal Virtual Agent Behavior on User Engagement». HAI '24. doi:10.1145/3687272.3688315 · preprint · C · trechos
- [S23] Spotify Engineering. «Shuffle: Making Random Feel More Human». 2025. https://engineering.atspotify.com/2025/11/shuffle-making-random-feel-more-human · blogue · C · integral
- [S24] Thomas, F.; Johnston, O. «The Illusion of Life: Disney Animation». Abbeville Press, 1981 (citação literal via https://fullfrontal.moe/animation-fundamentals-timing-and-spacing) · oficial · A · trechos
- [S25] Wingenbach, T. et al. «Validation of the ADFES-BIV». PLOS ONE, 2016. https://pmc.ncbi.nlm.nih.gov/articles/PMC4718603 · artigo-revisto · B · trechos
- [S26] Sato, W.; Yoshikawa, S. «The dynamic aspects of emotional facial expressions». Cognition and Emotion, 2004. doi:10.1080/02699930341000176 · artigo-revisto · B · trechos
- [S27] Sato, W. et al. «An Android for Emotional Interaction: Spatiotemporal Validation of Its Facial Expressions». Frontiers in Psychology, 2022. doi:10.3389/fpsyg.2021.800657 · artigo-revisto · B · trechos
- [S28] Reinl, M.; Bartels, A. «Perception of temporal asymmetries in dynamic facial expressions». Frontiers in Psychology, 2015. doi:10.3389/fpsyg.2015.01107 · artigo-revisto · B · trechos
- [S29] Dobs, K. et al. «Use and Usefulness of Dynamic Face Stimuli for Face Perception Studies». Frontiers in Human Neuroscience, 2018. https://pmc.ncbi.nlm.nih.gov/articles/PMC6085596 · revisao-sistematica · B · trechos
- [S30] Kessler, H. et al. «Neural correlates of the perception of dynamic versus static facial expressions of emotion». GMS Psychosoc Med, 2011. doi:10.3205/psm000072 · artigo-revisto · B · trechos
- [S31] Neath, K. et al. «Facial expression discrimination varies with presentation time». Cognition and Emotion, 2014. doi:10.1080/02699931.2013.812557 · artigo-revisto · B · trechos
- [S32] Meeren, H. et al. «Rapid perceptual integration of facial expression and emotional body language». PNAS, 2005. doi:10.1073/pnas.0507650102 · artigo-revisto · A · trechos
- [S33] Godfrey, K. et al. «Analysis of Spontaneous Eyelid Blink Dynamics». OPRS, 2019. https://pubmed.ncbi.nlm.nih.gov/30893187 · artigo-revisto · B · trechos
- [S34] Amazon. «Light Ring Indicator Guidance». https://developer.amazon.com/en-US/alexa/branding/echo-guidelines/identity-guidelines/light-ring · oficial · A · integral
- [S35] Maslych, M. et al. «Mitigating Response Delays in Free-Form Conversations with LLM-powered Intelligent Virtual Agents». 2025. doi:10.1145/3719160.3736636 · artigo-revisto · A · trechos
- [S36] Harrison, C. et al. «Rethinking the progress bar». UIST 2007. http://www.chrisharrison.net/index.php/Research/ProgressBars · artigo-revisto · B · trechos
- [S37] Harrison, C.; Yeo, Z.; Hudson, S. «Faster progress bars». CHI 2010. doi:10.1145/1753326.1753556 · artigo-revisto · A · trechos
- [S38] Wang, J. et al. «Unlocking the Emotional World of Visual Media». Proceedings of the IEEE, 2023. doi:10.1109/JPROC.2023.3273517 · revisao-sistematica · A · trechos
- [S39] Hömke, P. et al. «Eyebrow movements as signals of communicative problems in conversation». 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC11896710 · artigo-revisto · B · trechos
- [S40] Kong, Y. et al. «Facial features and head movements … vigilance/fatigue». Attention, Perception & Psychophysics, 2021. doi:10.3758/s13414-020-02199-5 · artigo-revisto · B · trechos
- [S41] Amershi, S. et al. «Guidelines for Human-AI Interaction». CHI 2019. doi:10.1145/3290605.3300233 · artigo-revisto · A · trechos
- [S42] Microsoft Design. «When AI joins the team: Three principles for responsible agent design». 2026. https://microsoft.design/articles/principles-for-responsible-agent-design · oficial · A · integral
- [S43] Mozannar, H. et al. «Magentic-UI: An Experimental Human-Centered Web Agent». Microsoft Research, 2025. https://www.microsoft.com/en-us/research/blog/magentic-ui-an-experimental-human-centered-web-agent · oficial · B · trechos
- [S44] Andrist, S.; Mutlu, B.; Gleicher, M. «Conversational Gaze Aversion for Virtual Agents». IVA 2013. doi:10.1007/978-3-642-40415-3 · artigo-revisto · B · trechos
- [S45] Admoni, H.; Scassellati, B. «Social Eye Gaze in Human-Robot Interaction: A Review». JHRI, 2017. https://scazlab.yale.edu/sites/default/files/files/273-2310-1-PB.pdf · revisao-sistematica · B · trechos
- [S46] Arias, K. et al. «Toward Designing User-centered Idle Behaviors for Social Robots in the Home». HRI 2020 Workshop. https://malulu.github.io/HRI-Design-2020/assets/pdf/Arias%20et%20al.pdf · artigo-revisto · B · trechos
- [S47] Hasan, R. et al. «The dark side of AI anthropomorphism: misplaced trustworthiness». 2025. https://scholarspace.manoa.hawaii.edu/bitstreams/b6cedcc3-cd5c-4744-bb99-2d8f90b334ec/download · artigo-revisto · B · trechos
- [S48] Ma, N. et al. «Effect of anthropomorphism and perceived intelligence in chatbot avatars». Frontiers in Computer Science, 2025. doi:10.3389/fcomp.2025.1531976 · artigo-revisto · B · trechos
- [S49] Crolic, C. et al. «Blame the Bot: Anthropomorphism and Anger in Customer–Chatbot Interactions». Journal of Marketing, 2021. doi:10.1177/00222429211045687 · artigo-revisto · A · trechos
- [S50] Nielsen Norman Group. «Error-Message Guidelines». 2023. https://www.nngroup.com/articles/error-message-guidelines · documentacao · B · trechos
- [S51] Naderi, H. et al. «Impact of Robot Facial-Audio Expressions on Human Robot Trust Dynamics and Trust Repair». arXiv:2512.13981, 2025. https://www.alphaxiv.org/abs/2512.13981 · preprint · B · trechos
- [S52] Pompe, B.; Velner, E.; Truong, K. «The Robot That Showed Remorse: Repairing Trust with a Genuine Apology». Univ. Twente. https://ris.utwente.nl/ws/files/286394608/The_Robot_That_Showed_Remorse_Repairing_Trust_with_a_Genuine_Apology.pdf · preprint · B · trechos
- [S53] «Human–Robot Interaction Strategy of Service Robot with Insufficient Capability in Self-Service Shop». Biomimetics, 2026. https://www.mdpi.com/2313-7673/11/3/213 · artigo-revisto · B · trechos
- [S54] Foch, C. et al. «Game designers' perspectives on implementing failure in games». https://eprints.whiterose.ac.uk/id/eprint/192938/ · artigo-revisto · B · trechos
- [S55] Nielsen Norman Group. «Executing UX Animations: Duration and Motion Characteristics». 2020. https://www.nngroup.com/articles/animation-duration · imprensa · B · trechos
- [S56] ISA. «ANSI/ISA-18.2-2016 Management of Alarm Systems for the Process Industries». 2016. https://18817087.s21i.faiusr.com/61/ABUIABA9GAAgyZfj5AUozIu7wwI.pdf (cópia; norma oficial paga) · norma · A · trechos
- [S57] XState by Example. «Debouncing». https://xstatebyexample.com/debouncing · documentacao · C · trechos
- [S58] Raccoons. «A React Hook to prevent flickering spinners». https://www.raccoons.be/what-we-think/articles/a-react-hook-to-prevent-flickering-spinners · blogue · C · trechos
- [S59] Pandey. «A Coalescing Event Queue for High-Frequency Systems». ACCU Overload, 2026. https://accu.org/journals/overload/34/193/pandey · imprensa · B · trechos
- [S60] Godot Engine. «Random number generation (shuffle bags)». https://docs.godotengine.org/en/latest/tutorials/math/random_number_generation.html · documentacao · A · trechos
- [S61] Efraimidis, P.; Spirakis, P. «Weighted random sampling with a reservoir». Information Processing Letters, 2006. doi:10.1016/j.ipl.2005.11.003 · artigo-revisto · A · trechos
- [S62] Ekman, P.; Friesen, W.; Ancoli, S. «Facial signs of emotional experience». Journal of Personality and Social Psychology, 1980. doi:10.1037/0022-3514.39.6.1125 · artigo-revisto · A · não (via secundárias)
- [S63] Ambadar, Z.; Cohn, J.; Reed, L. «All Smiles are Not Created Equal». Journal of Nonverbal Behavior, 2009. doi:10.1007/s10919-008-0056-8 · artigo-revisto · A · trechos
- [S64] Trutoiu, L. «Perceptually Valid Dynamics for Smiles and Blinks». CMU-RI-TR-14-15, 2014. https://kilthub.cmu.edu/articles/Perceptually_Valid_Dynamics_for_Smiles_and_Blinks/6721037 · oficial · B · trechos
- [S65] Krumhuber, E.; Kappas, A. «Moving smiles: the role of dynamic components for the perception of the genuineness of smiles». Journal of Nonverbal Behavior, 2005. doi:10.1007/s10919-004-0887-x · artigo-revisto · A · não (via secundárias)
- [S66] Shen, X.; Wu, Q.; Fu, X. «Effects of the duration of expressions on the recognition of microexpressions». J. Zhejiang University SCIENCE B, 2012. doi:10.1631/jzus.B1100063 · artigo-revisto · A · integral
- [S67] Wilhelm, O. et al. «Test battery for measuring the perception and recognition of facial expressions of emotion». Frontiers in Psychology, 2014. doi:10.3389/fpsyg.2014.00404 · artigo-revisto · A · trechos
- [S68] Jiang, Z. et al. «Time Pressure Inhibits Dynamic Advantage in the Classification of Facial Expressions of Emotion». PLOS ONE, 2014. doi:10.1371/journal.pone.0100162 · artigo-revisto · A · trechos
- [S69] Horic-Asselin, D. et al. «Effects of temporal dynamics on perceived authenticity of smiles». Attention, Perception & Psychophysics, 2020. doi:10.3758/s13414-020-02080-5 · artigo-revisto · A · não (snippets)
- [S70] Hess, U.; Blairy, S.; Kleck, R. «The Intensity of Emotional Facial Expressions and Decoding Accuracy». Journal of Nonverbal Behavior, 1997. doi:10.1023/A:1024952730333 · artigo-revisto · A · não (abstract)
- [S71] Hasegawa, H.; Unuma, H. «Facial features in perceived intensity of schematic facial expressions». Perceptual and Motor Skills, 2010. doi:10.2466/PMS.110.1.129-149 · artigo-revisto · B · não (abstract)
- [S72] Beer, J.; Fisk, A.; Rogers, W. «Younger and Older Users' Recognition of Virtual Agent Facial Expressions». ACM TACCESS, 2015. https://pmc.ncbi.nlm.nih.gov/articles/PMC4331019 · artigo-revisto · A · integral
- [S73] Lee, W. et al. «Intuitive Recognition of a Virtual Agent's Learning State Through Facial Expressions in VR». Electronics, 2025. doi:10.3390/electronics14132666 · artigo-revisto · A · integral
- [S74] Yang, X. et al. «Signals of AI Hallucination: Designing Hallucination-Aware Cues for Embodied Conversational Agents in VR». arXiv:2609.28812, 2026. https://arxiv.org/html/2609.28812v1 · preprint · A · integral
- [S75] Nielsen, J. (uxtigers). «Progress Indicators Ease the Wait». 2026. https://www.uxtigers.com/post/progress-indicators · blogue · B · integral
- [S76] van der Wel, P.; van Steenbergen, H. «Pupil dilation as an index of effort in cognitive control tasks: A review». Psychonomic Bulletin & Review, 2018. doi:10.3758/s13423-018-1432-y · revisao-sistematica · A · parcial
- [S77] «The Yerkes-Dodson Curve for AI Agents». arXiv:2603.07360, 2026. https://arxiv.org/html/2603.07360v1 · preprint · B · parcial
- [S78] «Exploring ICU nurses' response to alarm management…». BMC Nursing, 2025. doi:10.1186/s12912-025-03084-y · revisao-sistematica · A · parcial
- [S79] Sewell, J. et al. «Cognitive load theory for training health professionals in the clinical setting: a scoping review». Academic Medicine, 2019. https://pubmed.ncbi.nlm.nih.gov/30328761 · revisao-sistematica · A · não (abstract)
- [S80] Agent Zero. «Context Window Indicator Plugin». https://www.agent-zero.ai/p/plugins/context_indicator · documentacao · C · trechos
- [S81] Ruskin, E. «A Context-Aware Character Dialog System» (Valve, GDC — guarda de fronteira de shuffle). https://www.youtube.com/watch?v=D7T1t_grInw · documentacao · B · trechos
- [S82] «Shuffle bag with repetition constraint» (StackOverflow) + bag randomizers (diplograph). https://stackoverflow.com/questions/11683900/shuffle-bag-with-repetition-constraint · forum · B · trechos
- [S83] «Random Generator» (Tetris Wiki — 7-bag, repetição de fronteira, previsibilidade). https://tetris.wiki/Random_Generator · documentacao · B · trechos

## 7. Incidentes de segurança (injeção de prompt)

| Fonte | Sinais do escudo | O que o texto tentava | Ação |
| --- | --- | --- | --- |
| unitedstates.sandbox.xylemappliedwater.com (espelho de "The Animator's Survival Kit") | domínio sem relação com o conteúdo; padrão spam/SEO; possível cópia não autorizada | servir PDF de livro de animação | descartada (Q3) |
| old.whipplesuperchargers.com (espelho idêntico) | domínio de peças automóveis a servir handbook de animação | idem | descartada (Q3) |
| meet.windsormachine.com (espelho idêntico) | espelho de ebook em domínio não relacionado | idem | descartada (Q3) |

Retornos dos 9 investigadores da ronda 1 passaram pelo `shield`: risco "nenhum" em todos (ver `pesquisas/q*.json`).

## 8. Limitações e perguntas em aberto

- **Verificação adversarial incompleta por orçamento**: só as duas afirmações que dirigem diretamente o código (A8 sorteio de variantes; A12 timings) receberam verificadores (3+2); ambas CAÍRAM como prescrição e foram reformuladas. As restantes (A1–A7, A9–A11, A13) estão assinaladas "não verificada" e devem ser lidas com a confiança moderada indicada.
- A evidência direta sobre expressões faciais de AVATARES 2D que representam agentes de IA **não existe**; todo o mapeamento é extrapolação fundamentada (emojis/cartoons/HRI/UI) — assumido explicitamente.
- Valores numéricos (dwell, durações, limiares de contexto) provêm de domínios vizinhos (UI, alarmes, dinâmica facial humana); a ronda 2 (Q10–Q12) quantifica o que é possível.
- Universalidade cultural: contestada [S3][S7]; o design opta por redundância de traços e categorias robustas.
- Colisão na fronteira do shuffle bag ≈1/N é cálculo próprio não verificado em fonte.
- Metadados incompletos em algumas fontes menores (autores não apurados) — registados nas fontes afetadas.
- Dados brutos dos investigadores: `pesquisas/q*.json` (listas de URL) + transcrição da sessão.

## 9. Metodologia

- Motor: tavily-agent-skill (`search` + `extract`), modo pesquisa profunda (flag `--deep-research`).
- Rondas: 2 · subagentes: 9 (ronda 1) + 3 (ronda 2) · consultas: ~120 · fontes lidas na íntegra: ~30 (extract).
- Todos os retornos passaram pelo escudo anti-injeção (`shield`) antes da integração; 3 fontes spam descartadas.
- Integração e escrita: orquestrador único (esta secção é a única escrita no dossiê).
