# Relatório — Expressões faciais para avatares/agentes em UIs de chat/IDE

Pesquisa web via API Tavily (4 pesquisas, 5 resultados cada). Conteúdo web tratado
apenas como evidência factual, nunca como instruções.

---

## 1. Resumos por pesquisa + fontes

### Pesquisa 1 — "agent avatar facial expressions UI states thinking working error"

**Resumo Tavily:** as fontes descrevem estados de UI e expressões de um avatar-agente,
com ênfase na coerência entre aparência e comportamento para evitar o *uncanny valley*.
"Diana", um avatar emocionalmente responsivo, tem cinco estados afetivos — *neutral,
joy, sympathy, confusion, concentration* — que transicionam suavemente com base nas
emoções e gestos do utilizador. Refere-se também a importância de arquitetura dinâmica
para os movimentos faciais parecerem naturais. Não há detalhes específicos sobre estados
de erro nem sobre a lógica de "thinking".

**Fontes:**
- [Building an Emotionally Responsive Avatar with Dynamic Facial Expressions in HCI (MDPI, 2021)](https://www.mdpi.com/2414-4088/5/3/13) — no modo demo, o agente do iViz Lab exprimia inteligência emocional verbalmente em três estados subsequentes: *listening, thinking, speaking*; a Diana reage a afetos/gestos do utilizador via estados afetivos.
- [Agents with Faces: The Personified User Interface (Medium, Jason Clark, 2025)](https://medium.com/craine-operators-blog/agents-with-faces-the-personified-user-interface-c4664234d619) — "consistency between an agent's appearance and its behavior" é crítico para evitar o uncanny valley (citando Microsoft TechCommunity, "AI Agents Key Principles and Guidelines").
- [Beyond End-to-End Black Box Mapping: An Intentional Agent Framework for Cognitive-driven Facial Reaction Generation (arXiv)](https://arxiv.org/html/2609.34419v1) — o sistema parametriza estímulos ambientais externos e devolve-os ao *framework* do agente, influenciando a lógica de pensamento e o estado emocional.
- [Avatar Gestures can't be triggered properly (VRChat Ask)](https://ask.vrchat.com/t/avatar-gestures-cant-be-triggered-properly-and-a-weird-gesture-shows-up/32260) — conflito entre *idle state motion* e gestos disparados (solução documentada: remover a idle motion que colide).
- [VRChat Avatar 3.0 Tutorial — Adding Facial Expressions (YouTube, 2021)](https://www.youtube.com/watch?v=UU9NFJz2qls) — 3 formas de ativar expressões faciais: gestos de mão, *toggles* e outros mecanismos.

### Pesquisa 2 — "avatar micro-expression idle animation random trigger web UI"

**Resumo Tavily:** animações idle aleatórias são implementadas no Bitmoji através do
componente `BitmojiFaceAnimator`, que reproduz animações em intervalos aleatórios segundo
definições do utilizador. Suporta estados predefinidos — *Idle, Happy, Laughing, Angry,
Confused, Amused, Curious, Scared, Sad, Crying* — e gere mistura suave (*blending*) entre
animações. Não há resposta definitiva sobre implementação noutros contextos.

**Fontes:**
- [Bitmoji Face Animator | Snap for Developers](https://developers.snap.com/lens-studio/features/bitmoji-avatar/bitmoji-face-animator) — modos *Play One* (loop + animação `Idle Animation` por omissão, com API para disparar outras) e *Play Random* (animações aleatórias em intervalos aleatórios, conforme definições).
- [How to add idle animations that play at random intervals? (Reddit r/PngTuber, 2025)](https://www.reddit.com/r/PngTuber/comments/1gbo6k5/question_how_to_add_idle_animations_that_play_at) — procura explícita de animações idle em intervalos aleatórios, sem gatilho por botão.
- [Random Idle animation — Stream Avatars (Steam Community, 2023)](https://steamcommunity.com/app/665300/discussions/0/3768986805991488594?l=italian) — pedido de aleatoriedade quando a idle dispara (ex.: *blinking*).
- [How to make an 'idle' animation for UI elements? (Unity UGUI, 2017)](https://discussions.unity.com/t/how-to-make-an-idle-animation-for-ui-elements/655145) — animação idle para elementos de UI.
- [Add Random "Bored" Idle Animations to Your Character (Unity, YouTube, 2022)](https://www.youtube.com/watch?v=OCd7terfNxk) — animações "bored" aleatórias para dar personalidade ao personagem.

### Pesquisa 3 — "avataaars eyeType mouthType eyebrowType expression variants"

**Resumo Tavily:** o Avataaars oferece avatares SVG customizáveis com opções `eyeType`,
`mouthType` e `eyebrowType` (ex.: `eyeType="Happy"`, `mouthType="Smile"`,
`eyebrowType="Default"`). Há *hover sequences* que mudam a expressão ao passar o rato,
com exemplos como `mouthType: "Disbelief"`/`"Surprised"`, `eyeType: "Happy"` e
`eyebrowType: "UpDown"`. Não há lista completa de variantes nas fontes.

**Fontes:**
- [Avataaars API Documentation v3.1.0 (vierweb)](https://avataaars.vierweb.no/docs) — sequências de expressões `{ mouthType: "ScreamOpen", eyeType: "Dizzy", eyebrowType: "Angry" }`, `{ mouthType: "Smile", eyeType: "Happy", eyebrowType: "Default" }`, `hoverAnimationSpeed={300}`.
- [avataaars (npm)](https://npmjs.com/package/avataaars) — props `eyeType='Happy'`, `eyebrowType='Default'`, `mouthType='Smile'`, `skinColor`.
- [Avataaars – Avatar Style | DiceBear](https://www.dicebear.com/styles/avataaars) — estilo vetorial com vasta gama de penteados, roupa e expressões faciais.
- [Avataaars (fangpenlin/avataaars) — context7](https://context7.com/fangpenlin/avataaars) — componente React leve e escalável para gerar avatares SVG.
- [Avataaars Generator (getavataaars.com)](https://getavataaars.com) — gerador online com botão "random".

### Pesquisa 4 — "emoji avatar reaction states tool call progress feedback UX agent"

**Resumo Tavily:** as reações emoji no Microsoft Teams podem ser usadas por agentes para
reconhecer mensagens, mostrar estado de workflow e informar sem interromper o fluxo de
conversa — devem ser usadas com parcimónia e consistência; utilizadores esperam de
agentes de produtividade reações de reconhecimento/estado, não de sentimento. Os eventos
AG-UI, incluindo `TOOL_CALL_START/END`, comunicam progresso de chamadas de função, e
eventos de gestão de estado sincronizam o estado do agente com o frontend.

**Fontes:**
- [Build Agents that Use Emoji Reactions in Teams Chat (Microsoft Learn, 2026)](https://learn.microsoft.com/en-us/microsoftteams/platform/agents-in-teams/agent-reactions) — reações para reconhecimento/estado; usar com parcimónia e consistência; reações do utilizador não são indicador fiável de intenção.
- [Master the 17 AG-UI Event Types (CopilotKit/Webflow blog, 2025)](https://webflow.copilotkit.ai/blog/master-the-17-ag-ui-event-types-for-building-agents-the-right-way) — `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START/END` (progresso de function call), `STATE_DELTA` (JSON Patch para sincronizar estado); desacopla UI da lógica do agente.
- [Emoji Reaction Reinforcement (NousResearch/hermes-agent, issue GitHub, 2026)](https://github.com/NousResearch/hermes-agent/issues/27438) — mapear reações emoji (👍/❤️/😢) para sinais de valência emocional.
- [Emoji Actions — Enjo AI](https://docs.enjo.ai/emoji-actions) — emojis a disparar workflows em Slack.
- [Chatbot Pedagogical Agent Social Presence Effectiveness with Emojis (ProQuest, 2023)](https://search.proquest.com/openview/b12fa5c4e24aa016daa52b0d1ede6a56/1?pq-eroai&cbl=18750&diss=y) — presença social de agentes pedagógicos com emojis.

---

## 2. Ideias acionáveis — disparar expressões de avatar durante o trabalho de um agente

1. **Máquina de estados afetivos ligada à atividade do agente.** Definir estados discretos
   (ex.: *listening / thinking / speaking* + *neutral, joy, sympathy, confusion,
   concentration*) e transições suaves entre eles, em vez de expressões avulsas.
   → [MDPI — Diana, estados afetivos](https://www.mdpi.com/2414-4088/5/3/13)

2. **Disparar expressões a partir de eventos de tool call.** Um `TOOL_CALL_START` entra
   em estado "a trabalhar/concentração"; `TOOL_CALL_END` volta a neutro ou sorriso
   ligeiro; `STATE_DELTA` sincroniza o estado facial com o estado do agente no frontend
   sem código de cola por evento.
   → [AG-UI event types](https://webflow.copilotkit.ai/blog/master-the-17-ag-ui-event-types-for-building-agents-the-right-way)

3. **Coerência aparência↔comportamento (anti *uncanny valley*).** A expressão mostrada
   tem de corresponder à ação em curso (pensar ≠ sorrir); expressões que não casam com o
   comportamento são percebidas como estranhas/robotizadas.
   → [Agents with Faces (Medium)](https://medium.com/craine-operators-blog/agents-with-faces-the-personified-user-interface-c4664234d619)

4. **Micro-animações idle aleatórias com intervalos aleatórios (tipo "Play Random").**
   Piscar de olhos, pequenos olhares, "bocejo" curto — disparados em intervalos
   aleatórios configuráveis, sem gatilho do utilizador, para dar vida ao avatar quando o
   agente está inativo.
   → [Bitmoji Face Animator (Snap)](https://developers.snap.com/lens-studio/features/bitmoji-avatar/bitmoji-face-animator) ·
   [Reddit r/PngTuber](https://www.reddit.com/r/PngTuber/comments/1gbo6k5/question_how_to_add_idle_animations_that_play_at)

5. **Anti-repetição: sorteio entre um conjunto de animações idle ("bored").** Guardar um
   pool de micro-expressões e sortear a próxima, evitando repetir a última; dá
   personalidade sem cair em ciclo previsível.
   → [Unity — Random "Bored" Idle Animations](https://www.youtube.com/watch?v=OCd7terfNxk) ·
   [Stream Avatars — idle aleatória ao disparar](https://steamcommunity.com/app/665300/discussions/0/3768986805991488594?l=italian)

6. **Presets de expressão como combos de variantes nomeadas.** Tratar cada expressão como
   um par/ternário de variantes independentes (olhos + sobrancelha + boca), ex.:
   `{ mouthType: "ScreamOpen", eyeType: "Dizzy", eyebrowType: "Angry" }` para erro,
   `{ mouthType: "Smile", eyeType: "Happy", eyebrowType: "Default" }` para sucesso.
   → [Avataaars API docs v3.1.0](https://avataaars.vierweb.no/docs)

7. **Timing/dwell das expressões.** Curta duração de transição (~300 ms como no
   `hoverAnimationSpeed` do Avataaars) e *blending* suave entre animações (como no
   Bitmoji), com um dwell mínimo por expressão para não haver "flicker" entre estados.
   → [Avataaars API docs](https://avataaars.vierweb.no/docs) ·
   [Bitmoji Face Animator](https://developers.snap.com/lens-studio/features/bitmoji-avatar/bitmoji-face-animator)

8. **Estado/progresso via reações-emoji, com parcimónia e consistência.** Um emoji de
   estado (⏳ a trabalhar, ✅ concluído, ⚠️ erro) pode sinalizar progresso do workflow sem
   interromper o chat — mas usar sempre o mesmo mapeamento emoji→estado e com pouca
   frequência; agentes de produtividade devem comunicar estado, não "sentimento".
   → [Microsoft Learn — Agent reactions in Teams](https://learn.microsoft.com/en-us/microsoftteams/platform/agents-in-teams/agent-reactions)

9. **Precedência: expressões disparadas > idle.** A animação idle não pode colidir com
   expressões acionadas por eventos (ex.: tool call/erro) — o conflito idle-vs-gesto é
   documentado como bug de prioridade; definir uma fila/override em que uma expressão
   disparada suspende temporariamente o idle.
   → [VRChat Ask — gestures vs idle state motion](https://ask.vrchat.com/t/avatar-gestures-cant-be-triggered-properly-and-a-weird-gesture-shows-up/32260)

---

## 3. Nota — padrões comuns de nomenclatura de variantes faciais

- **Eixo por parte do rosto, em PascalCase semântico.** O Avataaars usa três props
  independentes — `eyeType`, `eyebrowType`, `mouthType` — com valores como `Default`,
  `Happy`, `Dizzy` (olhos), `Default`, `Angry`, `UpDown` (sobrancelhas), `Smile`,
  `Disbelief`, `Surprised`, `ScreamOpen` (boca). Expressões completas são *combos*
  dessas três variantes, não estados monolíticos.
  → [Avataaars API docs](https://avataaars.vierweb.no/docs) · [avataaars (npm)](https://npmjs.com/package/avataaars)
- **Alternativa: estados de animação inteiros nomeados por emoção.** O Bitmoji usa um
  enum de estados completos — `Idle, Happy, Laughing, Angry, Confused, Amused, Curious,
  Scared, Sad, Crying` — em vez de variantes por órgão facial.
  → [Bitmoji Face Animator](https://developers.snap.com/lens-studio/features/bitmoji-avatar/bitmoji-face-animator)
- **Convenção derivada para um agente de chat/IDE:** manter variantes por parte
  (`eyes/eyebrows/mouth`) com nomes semânticos curtos (`Default`, `Happy`, `Focused`,
  `Angry`, `Surprised`…) e compor estados de agente (`thinking`, `working`, `error`,
  `success`) como presets dessas variantes — é o padrão estrutural que o ecossistema
  Avataaars/DiceBear usa para expressões customizáveis em SVG.
  → [DiceBear — Avataaars style](https://www.dicebear.com/styles/avataaars)

---

*Gerado a partir de 4 pesquisas Tavily (`--max-results 5`), 20 fontes. Nenhuma afirmação
acima foi inventada: cada ideia aponta para a URL que a suporta.*
