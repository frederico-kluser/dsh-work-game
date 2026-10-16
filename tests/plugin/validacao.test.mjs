/*
 * tests/plugin/validacao.test.mjs — "arrumação" de 2026-10-12 (pedido do
 * utilizador), no Modo jogo (dsh-plugin/src/client.js):
 *
 *   FIX 1 — quem tem pergunta/aprovação pendente NUNCA aparece dormindo:
 *           - pergunta com texto vazio não fica falsy (ganha o marcador);
 *           - o `status idle` que segue o fim do turno não manda na cara;
 *           - mensagem do utilizador = novo turno ativo (o bot não fica
 *             "dormido" à espera do 1.º `status running`).
 *
 *   FIX 2 — a projeção (personView/officeView) LEVA as variantes sorteadas
 *           pelo motor — sem elas a cena desenhava sempre a cara base de cada
 *           estado e as expressões nunca mudavam durante o trabalho.
 *
 *   FIX 4 — resultado pronto POR VALIDAR (porVer): fica sinalizado até alguém
 *           VER a conversa (evento `session/seen`, emitido ao abrir a conversa
 *           no DSH, no celular ou ao clicar na janela da pessoa).
 *
 * Executar: node --test tests/plugin/validacao.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

let moduloBundle = null;
globalThis.window = {
  __ModuleLoader__: {
    load({ factory }) {
      moduloBundle = factory((nome) => {
        if (nome === 'react') return { createElement: () => null };
        throw new Error(`módulo inesperado: ${nome}`);
      });
    },
  },
};
await import('../../dsh-plugin/src/client.js');
const B = moduloBundle;

function aCorrer(extra = []) {
  let e = B.__createOfficeState({});
  e = B.__applyEvent(e, { type: 'session/added', sessionId: 'a' });
  e = B.__applyEvent(e, { type: 'status', sessionId: 'a', status: 'running', at: 1000 });
  for (const ev of extra) e = B.__applyEvent(e, ev);
  return e;
}
const pDe = (e, id = 'a') => e.people.get(id);
const caraDe = (e, id = 'a') => B.__presetDe(e.people.get(id));

/* ------------------------------------------------------------------ */
/* FIX 1 — mensagens e perguntas: o bot não dorme                       */
/* ------------------------------------------------------------------ */

test('fix1: mensagem do utilizador inicia turno ativo (o bot não dorme à espera de status)', () => {
  let e = B.__createOfficeState({});
  e = B.__applyEvent(e, { type: 'session/added', sessionId: 'a' });
  assert.equal(pDe(e).status, 'idle', 'arranca Disponível');
  e = B.__applyEvent(e, { type: 'message', sessionId: 'a', side: 'user', at: 2000 });
  assert.equal(pDe(e).status, 'working', 'a pergunta do utilizador já põe a trabalhar');
  assert.notEqual(caraDe(e), 'sleeping', 'não dorme enquanto responde');
});

test('fix1: turn/end completed → porVer; o status idle seguinte NÃO tira o "Concluído"', () => {
  let e = aCorrer([{ type: 'turn/end', sessionId: 'a', kind: 'completed', at: 2000 }]);
  assert.equal(pDe(e).porVer, true, 'terminou: resultado pronto por validar');
  assert.equal(pDe(e).status, 'done', 'Concluído');
  e = B.__applyEvent(e, { type: 'status', sessionId: 'a', status: 'idle', at: 3000 });
  assert.equal(pDe(e).porVer, true, 'o status idle não limpa a marca');
  assert.equal(pDe(e).status, 'done', 'continua "Concluído · resultado pronto" (sinaliza até validar)');
  assert.notEqual(caraDe(e), 'sleeping', 'quem tem resultado por ver não dorme');
});

/* ------------------------------------------------------------------ */
/* FIX 2 — a projeção leva as variantes (a cara muda durante o trabalho) */
/* ------------------------------------------------------------------ */

test('fix2: a projeção leva as variantes sorteadas e a marca porVer', () => {
  let e = aCorrer();
  // Motor de teste: disparo GARANTIDO (o sorteio real tem a probabilidade do
  // cenário × fator da pessoa).
  pDe(e).motor = B.__motorExpressoes({ semente: 7, probabilidade: 1 });
  e = B.__applyEvent(e, { type: 'tool', sessionId: 'a', phase: 'call', name: 'bash', at: 2000 });
  e = B.__applyEvent(e, { type: 'turn/end', sessionId: 'a', kind: 'completed', at: 4000 });
  const vista = B.__officeView(e);
  const p = vista.people.a;
  assert.ok(p.varianteFerramenta, 'houve variante de ferramenta sorteada');
  assert.equal(p.varianteFerramenta, pDe(e).varianteFerramenta, 'a variante de ferramenta viaja na projeção');
  assert.equal(p.varianteSucesso, pDe(e).varianteSucesso, 'a variante de sucesso viaja na projeção');
  assert.equal(p.porVer, true, 'a marca porVer viaja na projeção');
  // Com a variante na projeção, a cara da cena É a variante sorteada.
  assert.equal(B.__presetDe(p), p.varianteSucesso, 'a cara da cena mostra a variante sorteada');
});

/* ------------------------------------------------------------------ */
/* FIX 4 — validação: `session/seen` limpa o "por ver"                  */
/* ------------------------------------------------------------------ */

test('fix4: session/seen valida — o sinal sai e a pessoa volta a poder dormir', () => {
  let e = aCorrer([{ type: 'turn/end', sessionId: 'a', kind: 'completed', at: 2000 }]);
  e = B.__applyEvent(e, { type: 'status', sessionId: 'a', status: 'idle', at: 3000 });
  assert.equal(pDe(e).porVer, true, 'por validar antes de ver');
  e = B.__applyEvent(e, { type: 'session/seen', sessionId: 'a', at: 4000 });
  assert.equal(pDe(e).porVer, false, 'visto/validado');
  assert.equal(pDe(e).status, 'idle', 'volta a Disponível');
  assert.equal(caraDe(e), 'sleeping', 'e aí sim dorme (Modo jogo)');
});

test('fix4: turn/end interrompido/erro não deixa "por ver" — só o completed', () => {
  for (const kind of ['aborted', 'interrupted', 'error', 'blocked', 'max-tokens']) {
    const e = aCorrer([{ type: 'turn/end', sessionId: 'a', kind, at: 2000 }]);
    assert.equal(pDe(e).porVer, false, `${kind} não marca porVer`);
  }
});

test('fix4: novo trabalho não apaga a marca — só a validação', () => {
  let e = aCorrer([{ type: 'turn/end', sessionId: 'a', kind: 'completed', at: 2000 }]);
  e = B.__applyEvent(e, { type: 'status', sessionId: 'a', status: 'running', at: 3000 });
  assert.equal(pDe(e).porVer, true, 'continua por validar enquanto ninguém ver');
  assert.equal(pDe(e).status, 'working', 'mas a cara segue o trabalho atual');
  e = B.__applyEvent(e, { type: 'session/seen', sessionId: 'a', at: 4000 });
  assert.equal(pDe(e).porVer, false, 'a validação é que limpa');
});
