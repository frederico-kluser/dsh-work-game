# Voz e transcrição — como funciona (2026-10-03)

O microfone do celular do Modo jogo grava uma mensagem de voz, mostra o nível
da voz enquanto se fala e transcreve-a para a CAIXA de mensagem (para rever e
enviar — nunca envia sozinho). Contrato resumido: `docs/contratos-plugin.md` §10.

## Peças

| peça | onde | o que faz |
|---|---|---|
| `dsh-plugin/src/voz.js` | fonte única (ES module) | matemática do nível, gravador, transcrição, configuração |
| `dsh-plugin/src/client.js` | bloco `=== INÍCIO/FIM voz.js embutido ===` | cópia embutida (paridade por teste) |
| `scripts/embutir-voz.py` | `--embutir` / `--verificar` | regenera/verifica a cópia embutida |
| `tests/plugin/voz.test.mjs` | `node --test` | testes puros do módulo (plataforma injetada) |
| `tests/plugin/telefone.test.mjs` | `node --test` | estados do microfone e da tela de Definições |
| `tests/plugin/render.test.mjs` | `node --test` | navegação config → grupos e round-trip da chave |

Regenerar a cópia embutida depois de tocar em `voz.js`:

```
python3 scripts/embutir-voz.py --embutir --alvo client
python3 scripts/embutir-voz.py --verificar
```

## Fluxo (botão de microfone, na conversa)

1. **Sem chave da API** → o botão está ATIVO mas o toque abre as **Definições**
   (título `Mensagem de voz: use o DSH`).
2. **Gravar** (`Gravar mensagem de voz`, `aria-pressed`) → getUserMedia +
   MediaRecorder (webm/opus → webm → mp4, o primeiro que o browser aceitar) com
   pedaços de 1 s; o AnalyserNode do MESMO stream alimenta as barras (28, o
   nível em dBFS suavizado, ataque 20 ms / queda 250 ms) num loop rAF que para
   com a aba escondida ou o painel em `.wg-oculto`; sob `prefers-reduced-motion`
   mostra-se só o indicador estático. Faixa: barras + cronómetro mm:ss +
   "Toque para parar". **Auto-stop aos 2 minutos.**
3. **Parar** → `A transcrever…` → `POST https://api.openai.com/v1/audio/transcriptions`
   (multipart `file` + `model` [+ `language`], `Authorization: Bearer` — sem
   `Content-Type` manual) → o `text` entra na caixa com um espaço antes quando
   já há texto. O estado limpa-se; nada é enviado sem o utilizador carregar em
   enviar.
4. **Erro** → mensagem mapeada em pt-PT + **"Tentar de novo"** (retranscreve o
   MESMO áudio; sem áudio guardado, grava de novo).

## API da OpenAI (verificada ao vivo, 2026-10-03)

- **Modelo**: `gpt-transcribe` — `POST /v1/audio/transcriptions`, multipart
  (`file` blob webm/opus ou mp4, `model`, `language` opcional; resposta
  `{text, usage, languages?}`; limite de 25 MB).
- **CORS de browser**: confirmado — o preflight permite `authorization` e o
  `POST` devolve `Access-Control-Allow-Origin`.
- **Cadeia de fallback** (só quando a API diz que o modelo não existe — 4xx com
  "The model `x` does not exist" ou `error.code: 'model_not_found'`):
  `gpt-transcribe` → `gpt-4o-transcribe` → `gpt-4o-mini-transcribe` → `whisper-1`.
- **Erros verificados**: 401 → `{"error":{"message":"Incorrect API key provided…"}}`
  (→ `chave-invalida`); modelo desconhecido → **404**
  `{"error":{"code":"model_not_found","message":"The model \`x\` does not exist…"}}`
  (→ tentativa seguinte; a documentação fala em 400, a resposta real é 404).
  402/429 → `limite`; 413 ou blob > 25 MB → `audio-grande`; falha de rede →
  `rede`; resto → `api`.
- **Smoke test vivo** (2026-10-03, chave de teste temporária, nunca guardada):
  um webm curto transcrito com `gpt-transcribe` → texto em português correto e
  `usage: {type: 'duration', seconds: 5}`; o fallback por modelo inexistente e
  o mapeamento do 401 foram confirmados na mesma sessão.

## Segurança e privacidade

- A chave da API fica em `localStorage` (`dsh-work-game:config`), fornecida pelo
  utilizador numa **chave dedicada com limite de gasto** — o aviso da tela de
  Definições diz-o e remete para `platform.openai.com` para revogação.
- A chave NUNCA é registada em logs nem mostrada em claro: o ecrã mostra
  `mascararChave` (`sk-…abcd`) e o campo de escrita é `type="password"`.
- O áudio gravado vive só em memória (chunks do MediaRecorder); depois da
  transcrição (ou de `cancelar()`) é descartado — nada é guardado.
- `limparConfig` remove a chave do navegador; guardar vazio mantém a chave
  atual (apaga-se explicitamente com "Limpar chave").

## Verificação

```
node --test tests/plugin/voz.test.mjs        # módulo puro (17 testes)
node --test tests/plugin/telefone.test.mjs   # estados de UI do microfone/config
npm test                                     # a suíte inteira
python3 scripts/embutir-voz.py --verificar   # paridade da cópia embutida
```

Smoke test ao vivo (opcional): com uma chave de teste num ficheiro local,
chamar `transcreverAudio(blob, {chave, fetch: globalThis.fetch})` de Node com um
`.webm` curto (ex.: gerado por `ffmpeg`) e confirmar que `text` vem preenchido.
A chave nunca se imprime nem se escreve no repositório.
