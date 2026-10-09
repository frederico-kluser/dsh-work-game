# Changelog

All notable changes to **dsh-work-game** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

- Versions are tagged as `v<MAJOR>.<MINOR>.<PATCH>` from `main`.
- Entries are **generated** from [Conventional Commits](https://www.conventionalcommits.org/) at
  release time — this file is never rewritten by hand.
- Compare views: <https://github.com/frederico-kluser/dsh-work-game/compare/>

## [Unreleased]

## [0.1.0] - 2026-10-09

### Features
- **cadeira:** modelos do DSH + Effort a seguir ao modelo no "Adicionar contacto" ([a756e4a](https://github.com/frederico-kluser/dsh-work-game/commit/a756e4a))
- **cadeira:** a cadeira vazia recruta — "Adicionar contacto" no celular ([5d433b3](https://github.com/frederico-kluser/dsh-work-game/commit/5d433b3))
- **celular:** voz→transcrição com barras de decibéis + Configurações; formatação de mensagens à prova de sintaxe ([f52259d](https://github.com/frederico-kluser/dsh-work-game/commit/f52259d))
- **plugin:** filtros de arquivo/abertos + motor de expressões com variantes por cenário ([f0ffd94](https://github.com/frederico-kluser/dsh-work-game/commit/f0ffd94))
- **partilha:** a funcionalidade Cloudflare fica EMBUTIDA no plugin ([34c4d3a](https://github.com/frederico-kluser/dsh-work-game/commit/34c4d3a))
- **expressões:** as variantes da biblioteca acontecem DURANTE o trabalho ([1a241b5](https://github.com/frederico-kluser/dsh-work-game/commit/1a241b5))
- **celular:** fila de mensagens com "Enviar agora" e "Remover" (padrão do DSH) ([3691e23](https://github.com/frederico-kluser/dsh-work-game/commit/3691e23))
- **partilha:** link + QR code no Modo jogo e "Encerrar o Cloudflare" ([0bec409](https://github.com/frederico-kluser/dsh-work-game/commit/0bec409))
- **celular:** grupos por workspace, ligar/microfone e modo telemóvel ([38005bc](https://github.com/frederico-kluser/dsh-work-game/commit/38005bc))
- **plugin:** martelo de quietude na paragem — fila/cancel repetidos até não haver sinais de vida ([b147886](https://github.com/frederico-kluser/dsh-work-game/commit/b147886))
- **plugin:** "Parar" em cascata — o agente e TODA a subárvore de subagentes ([9f2a1ca](https://github.com/frederico-kluser/dsh-work-game/commit/9f2a1ca))
- **plugin:** celular com a conversa real, barra lateral, filtros, sono e cenário ([f3cf598](https://github.com/frederico-kluser/dsh-work-game/commit/f3cf598))
- **plugin:** workspaces do DSH viram mesas, bonecos por <symbol> e ações reais no Modo jogo ([91d3f24](https://github.com/frederico-kluser/dsh-work-game/commit/91d3f24))
- **plugin:** cena da demo portada 1:1 para o Modo jogo (REGRA DE OURO do visual) ([b78632a](https://github.com/frederico-kluser/dsh-work-game/commit/b78632a))
- **plugin:** painel polido — Avataaars reais, enquadrar automático, zoom rotulado e inspetor visível ([dda3e7f](https://github.com/frederico-kluser/dsh-work-game/commit/dda3e7f))
- **plugin:** ligar a telemetria real do DSH no painel do escritório ([71f864f](https://github.com/frederico-kluser/dsh-work-game/commit/71f864f))
- implementar todos os achados da auditoria UX ([aed1d38](https://github.com/frederico-kluser/dsh-work-game/commit/aed1d38))
- telemetria por agente, perguntas em sheet, fim de turno, pilha de papéis e Arquivo ([1980f3b](https://github.com/frederico-kluser/dsh-work-game/commit/1980f3b))
- fidelidade ao DSH — a UI só oferece o que o harness realmente suporta ([27303ca](https://github.com/frederico-kluser/dsh-work-game/commit/27303ca))
- modo de jogo de ponta a ponta — botão no sidebar, eventos reais, merge/retirada e E2E ([e9f9011](https://github.com/frederico-kluser/dsh-work-game/commit/e9f9011))
- plugin ativa no DSH — entry host, manifesto completo e prova de integração ([0581dc2](https://github.com/frederico-kluser/dsh-work-game/commit/0581dc2))
- plugin DSH + CLI dwg — módulos, contratos e testes (fan-out com modelo barato) ([977613e](https://github.com/frederico-kluser/dsh-work-game/commit/977613e))
- escritório 2D de agentes — sala única, mesas expansíveis e expressões Avataaars ([02f9b41](https://github.com/frederico-kluser/dsh-work-game/commit/02f9b41))

### Bug Fixes
- **plugin:** instalar por URL Git do GitHub — a raiz declara dsh.bundle.patch ([7f824e1](https://github.com/frederico-kluser/dsh-work-game/commit/7f824e1))
- **avatares:** gênero dos bonecos bate com o nome — piscina r01-r12 refeita ([239632d](https://github.com/frederico-kluser/dsh-work-game/commit/239632d))
- **celular:** mensagens do grupo com a formatação COMPLETA da conversa ([2b398cc](https://github.com/frederico-kluser/dsh-work-game/commit/2b398cc))
- **celular:** modo telemóvel fullscreen real + "✕ Fechar" na tela inicial ([19f3f6a](https://github.com/frederico-kluser/dsh-work-game/commit/19f3f6a))
- **plugin:** contagem de subagentes POR FILHO — fim do líder 'Trabalhando' em fantasma ([d520dd0](https://github.com/frederico-kluser/dsh-work-game/commit/d520dd0))
- **plugin:** largar a fila ANTES do cancel (com varredura final) + provas do e2e antes das asserções ([00b07b6](https://github.com/frederico-kluser/dsh-work-game/commit/00b07b6))
- **plugin:** paragem com morada explícita do subagente + ready + erros com código ([a4ee5f4](https://github.com/frederico-kluser/dsh-work-game/commit/a4ee5f4))
- **plugin:** câmara legível em salas grandes e nomes O(1) com catálogos enormes ([cd12769](https://github.com/frederico-kluser/dsh-work-game/commit/cd12769))
- **plugin:** custo sem dado mostra 'custo —' e cwd chega às mesas no arranque ([11da0f9](https://github.com/frederico-kluser/dsh-work-game/commit/11da0f9))
- avatares do plugin em SVG aninhado (Safari/CSP) + demo a rodar só (DEMO.command) e aviso em file:// ([78e428d](https://github.com/frederico-kluser/dsh-work-game/commit/78e428d))
- **plugin:** sel.ctx nulo rebentava o inspetor ao selecionar (sessões sem projeções) ([d16021b](https://github.com/frederico-kluser/dsh-work-game/commit/d16021b))
- **plugin:** subscrever antes de iniciar — a explosão inicial de eventos não podia chegar à UI ([58ebc45](https://github.com/frederico-kluser/dsh-work-game/commit/58ebc45))
- **plugin:** declarar 'sessions' no inject do client — o runner só injeta o que está declarado ([77c3632](https://github.com/frederico-kluser/dsh-work-game/commit/77c3632))
- **test:** goto do driver CDP aceita condição de prontidão própria (GUI do DSH) ([31f12a1](https://github.com/frederico-kluser/dsh-work-game/commit/31f12a1))
- acessibilidade e consistência dos novos componentes ([c143235](https://github.com/frederico-kluser/dsh-work-game/commit/c143235))

### Documentation
- **oss:** fundação de governança open-source do repositório ([e2d3bc7](https://github.com/frederico-kluser/dsh-work-game/commit/e2d3bc7))
- **pesquisa:** dossiê da pesquisa profunda do motor de expressões ([998005b](https://github.com/frederico-kluser/dsh-work-game/commit/998005b))
- contratos e relatório da paragem em cascata (README + docs/) ([b686a74](https://github.com/frederico-kluser/dsh-work-game/commit/b686a74))
- relatório do fecho de 2026-09-28 (validações, regressivo Playwright, problemas) ([4489d5c](https://github.com/frederico-kluser/dsh-work-game/commit/4489d5c))
- armadilhas do runtime do browser verificadas ao vivo (inject de sessions, ordem de subscrição) ([59d7ad8](https://github.com/frederico-kluser/dsh-work-game/commit/59d7ad8))
- auditoria UX/UI das features novas (uxui-evaluator, score 70/good) ([57ba0c3](https://github.com/frederico-kluser/dsh-work-game/commit/57ba0c3))
- README e dossiê alinhados com as features novas + sessão simulada ([5ff87db](https://github.com/frederico-kluser/dsh-work-game/commit/5ff87db))
- especificar as 5 features futuras com sinais DSH verificados ([6a7ddbc](https://github.com/frederico-kluser/dsh-work-game/commit/6a7ddbc))

### Tests
- **e2e-voz:** abertura do painel por toggle robusto + autenticação por cookie ([6a4d594](https://github.com/frederico-kluser/dsh-work-game/commit/6a4d594))
- etiquetas dos filtros lidas do rótulo (não do interruptor vazio) ([76620b5](https://github.com/frederico-kluser/dsh-work-game/commit/76620b5))
- regressivo Playwright (chromium + webkit) nas duas superfícies ([008b888](https://github.com/frederico-kluser/dsh-work-game/commit/008b888))
- assentar a composição dos slots antes do clique no verificador ([21474b1](https://github.com/frederico-kluser/dsh-work-game/commit/21474b1))
- instrumentar leitura do snapshot para diagnóstico headless ([16b6c7b](https://github.com/frederico-kluser/dsh-work-game/commit/16b6c7b))
- diagnóstico do snapshot (__wgSnap) e clique nativo no verificador do painel ([160a58e](https://github.com/frederico-kluser/dsh-work-game/commit/160a58e))
- verificador do painel num DSH web real (ativação, canal, telemetria) ([89f7f1c](https://github.com/frederico-kluser/dsh-work-game/commit/89f7f1c))
- cobertura funcional completa + memória CoALA local ([919c2b4](https://github.com/frederico-kluser/dsh-work-game/commit/919c2b4))

### Build & CI
- **oss:** workflows com actions fixadas e dependabot ([531906a](https://github.com/frederico-kluser/dsh-work-game/commit/531906a))

### Chores
- **oss:** hooks de commit e rulesets do repositório ([555a8c9](https://github.com/frederico-kluser/dsh-work-game/commit/555a8c9))
- memória CoALA renomeada para vibe-coding-game-agent-skill ([a2ef979](https://github.com/frederico-kluser/dsh-work-game/commit/a2ef979))
- fechar soltas — memória CoALA descobrível, registos sincronizados e README completo ([2505853](https://github.com/frederico-kluser/dsh-work-game/commit/2505853))

<!--
  [Unreleased]: https://github.com/frederico-kluser/dsh-work-game/compare/v0.1.0...HEAD
-->
