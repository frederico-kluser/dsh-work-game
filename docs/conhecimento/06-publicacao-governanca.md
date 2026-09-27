# Publicação, licenças, auditoria e governança — dsh-work-game

Registo factual da publicação do projeto no GitHub, da auditoria de privacidade pré-push, do
quadro de licenças, das convenções do repositório e da política de governança da memória CoALA
local. Fonte: publicação dsh-work-game, 2026-09-27.

## Publicação

Ferramentas usadas: a skill `github-agent-skill` (gh CLI + git), o diagnóstico **read-only**
`scripts/github-doctor.sh` executado **antes de qualquer ação**, e o wrapper `scripts/gh-run.py`
para obter saída JSON estruturada. A conta autenticada foi `frederico-kluser`, com escopos
`gist`, `read:org`, `repo` e `workflow`. Regra inegociável: nunca imprimir nem gravar valores de
token — apenas se confirma que a autenticação e os escopos estão corretos.

O repositório foi criado público com `gh repo create`, **sem** README nem licença gerados pelo
GitHub — todo o conteúdo entrou por push. Resultado:

- URL: https://github.com/frederico-kluser/dsh-work-game · branch por omissão: `main`.
- Descrição (About), em inglês: "A playful 2D virtual office for AI agents — SVG desks,
  Avataaars people, speech-bubble activity and expandable teams. Front-end demo, no backend."
- 8 topics: `ai-agents`, `agent-visualization`, `virtual-office`, `avataaars`, `svg`,
  `javascript`, `frontend-demo`, `prototype`.
- Homepage (About) em branco.

Conteúdo publicado no commit inicial `feat: escritório 2D de agentes — sala única, mesas
expansíveis e expressões Avataaars` (187 ficheiros): app (`index.html`, `styles.css`, `app.js`,
`data.js`, `expressions.js`); assets SVG (`furniture.svg`, `desk-module.svg`, 160 avatares);
docs (`README.md` em PT-BR com English summary, `PLANO-VISUAL-DSH-OFFICE.md`,
`PROMPTS-DSH-OFFICE.md`, `THIRD_PARTY_NOTICES.md`, `assets/AVATARS-SOURCES.md`,
`assets/AVATARS-EXPRESSIONS.md`, `assets/AVATAARS-LICENSE.txt`); `LICENSE` (MIT, "Copyright (c)
2026 dsh-work-game contributors"); capturas `demo-preview.png` e `demo-contexto.png`; `.gitignore`.

## Auditoria pré-publicação (achados → correções)

A auditoria foi feita por um agente dedicado, estritamente **read-only**, antes do push. Todos os
achados foram corrigidos antes da publicação:

1. **MÉDIO — caminhos pessoais em documentos.** Apareciam caminhos absolutos do diretório home
   do utilizador, incluindo anexos do `.dsh` com hashes internos e caminhos do checkout local do
   DSH. → Substituídos por texto neutro e por URLs públicas upstream do GitHub
   (`deepseek-ai/deepseek-harness`).
2. **MÉDIO — artefato binário desatualizado.** Um zip com marca antiga estava prestes a entrar no
   histórico. → Excluído do git via `.gitignore` (e regenerado localmente no fim, sem versionar).
3. **BAIXO — links relativos quebrados** em `assets/AVATARS-SOURCES.md` (resolviam para
   `assets/assets/…`). → Corrigidos para caminhos relativos à própria pasta.
4. **BAIXO — capturas de ecrã com marca antiga** ("DSH Office"). → Regeneradas com a build final.

Verificado limpo (zero ocorrências): segredos, e-mails, tracking, dados reais e requisições
externas em runtime; os SVGs não contêm `script`, `foreignObject` nem URLs externas.

## Licenças e atribuições

- **Código:** MIT, no ficheiro `LICENSE` ("Copyright (c) 2026 dsh-work-game contributors").
- **Ativos Avataaars:** MIT (2017 Pablo Stanley, Fang-Pen Lin), com o notice preservado em
  `assets/AVATAARS-LICENSE.txt`.
- **Renderer avataaars.io:** usado apenas em dev-time, nunca em runtime.
- **Transparência:** `THIRD_PARTY_NOTICES.md` declara explicitamente que **nenhum** rosto foi
  redesenhado nem gerado por IA.
- **Compatibilidade confirmada:** o MIT permite modificação e redistribuição, desde que se
  mantenham o aviso de copyright e o texto da permissão — por isso a redistribuição dos avatares
  com o notice intacto é conforme.

## Convenções do repo

- Mensagem de commit no formato `feat: <resumo>`, com corpo detalhado em PT-BR.
- `README.md` em PT-BR, incluindo uma secção *English summary*.
- Comando padrão do servidor no README com `--bind 127.0.0.1` — e não `0.0.0.0` — para não expor
  a aplicação na LAN por omissão.

## Governança da memória CoALA

Política git do projeto, com regra `ignore` explícita:

- `memory/coala.sqlite` **fica fora do git**: é uma base binária local e pode conter detalhes de
  infraestrutura que não devem ser publicados.
- **Versiona-se** a skill local: `SKILL.md`, `scripts/`, `references/`, `ingest.json` e
  `coala.json`, para que o conhecimento procedural e o schema viajem com o repositório.

## Checklist para futuras publicações

1. Correr `scripts/github-doctor.sh` (read-only) antes de qualquer ação de GitHub; usar
   `scripts/gh-run.py` quando se precisa de saída JSON; confirmar conta e escopos sem nunca
   imprimir tokens.
2. Rodar auditoria de privacidade dedicada e read-only: procurar caminhos pessoais, hashes
   internos, segredos, e-mails, tracking, dados reais, binários desatualizados, links relativos
   quebrados e capturas com marcas antigas — corrigir tudo **antes** do push.
3. Garantir `LICENSE` (MIT) + `THIRD_PARTY_NOTICES.md` + notice de terceiros preservado, e
   verificar compatibilidade de licença de cada ativo incorporado.
4. Criar o repo com `gh repo create` sem template GitHub; preencher descrição e topics; deixar a
   homepage em branco se não houver demo pública estável.
5. Commit `feat: <resumo>` com corpo em PT-BR; README PT-BR + *English summary*; servidor
   documentado com `--bind 127.0.0.1`.
6. Confirmar que `memory/coala.sqlite` continua ignorado pelo git e que a skill CoALA local está
   versionada antes de fazer push.
