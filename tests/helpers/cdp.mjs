/**
 * Driver CDP mínimo para testes funcionais — apenas stdlib do Node (WebSocket global).
 * Lança Chrome/Chromium headless, liga-se ao DevTools Protocol e expõe uma página
 * com eval/click/type/teclado/arraste/mobilidade. Sem dependências npm.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser',
  'brave-browser', 'brave', 'microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
].filter(Boolean);

export function findChrome() {
  for (const name of CANDIDATES) {
    try {
      const found = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (found) return found;
    } catch { /* tenta o próximo */ }
  }
  throw new Error('Chrome/Chromium não encontrado. Define CHROME_PATH para o executável.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }
  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout CDP: ${method}`));
        }
      }, 30000);
    });
  }
}

async function fetchJson(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch { /* DevTools ainda a arrancar */ }
    await sleep(250);
  }
  throw new Error(`DevTools HTTP indisponível: ${url}`);
}

export async function launchBrowser({ width = 1440, height = 900 } = {}) {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'dwg-chrome-'));
  const proc = spawn(chrome, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--disable-dev-shm-usage', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${width},${height}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsBase = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('timeout ao esperar DevTools')), 30000);
    proc.stderr.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome saiu com código ${code}`)); });
  });

  const port = new URL(wsBase).port;
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) throw new Error('nenhum target de página no DevTools');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('falha ao ligar ao WebSocket CDP')), { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const consoleErrors = [];
  const networkRequests = [];
  cdp.on((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails?.exception?.description || 'exceção sem descrição');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args?.map((a) => a.value || a.description).join(' ') || 'erro de consola');
    }
    if (msg.method === 'Network.requestWillBeSent') {
      const url = msg.params.request?.url || '';
      if (/^https?:/.test(url)) networkRequests.push(url);
    }
  });

  let filaCapturas = Promise.resolve(); // page.screenshot: uma de cada vez
  const page = {
    consoleErrors,
    networkRequests,
    async goto(url, ready = 'document.readyState === "complete" && !!document.querySelector("#world svg")') {
      await cdp.send('Page.navigate', { url });
      await page.waitFor(ready);
    },
    async reload() {
      await cdp.send('Page.reload', { ignoreCache: true });
      await page.waitFor('document.readyState === "complete" && !!document.querySelector("#world svg")');
    },
    /** Avalia uma expressão JS na página e devolve o valor (JSON-serializável). */
    async eval(expression) {
      const result = await cdp.send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true, userGesture: true
      });
      if (result.exceptionDetails) {
        const detail = result.exceptionDetails;
        throw new Error(`eval falhou: ${detail.exception?.description || detail.text}`);
      }
      return result.result?.value;
    },
    /** Espera que uma expressão devolva valor verdadeiro. */
    async waitFor(expression, timeout = 8000) {
      const started = Date.now();
      for (;;) {
        let value = false;
        try { value = await page.eval(expression); } catch { /* página ainda a montar */ }
        if (value) return value;
        if (Date.now() - started > timeout) throw new Error(`waitFor expirou: ${expression}`);
        await sleep(60);
      }
    },
    async click(selector) {
      await page.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, 8000);
      await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      })()`);
    },
    async type(selector, text) {
      await page.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, 8000);
      await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        el.focus(); el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
    },
    async key(targetSelector, key) {
      await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(targetSelector)});
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }));
        return true;
      })()`);
    },
    /** Escrita real no elemento com foco (Input.insertText: input nativo, serve a contenteditable). */
    async insertText(text) {
      await cdp.send('Input.insertText', { text });
    },
    /** Clique real via Input do CDP (pointerdown/up/click nativos nas coordenadas). */
    async clickAt(x, y) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    },
    /** Arraste real via Input do CDP (gera pointer events com pointerId válido). */
    async drag(fromX, fromY, toX, toY) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y: fromY, button: 'left', buttons: 1, clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: toX, y: toY, button: 'left', buttons: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left', buttons: 1, clickCount: 1 });
    },
    async setViewport(w, h, mobile = false) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
      // Toque emulado com o modo telemóvel: é isto que põe `pointer: coarse`
      // a casar (sem ele, as media queries continuam de rato/ambiente de trabalho).
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: !!mobile, maxTouchPoints: mobile ? 5 : 1 }); // 1–16 em ambos os modos
    },
    /** Tecla real via Input do CDP (keydown/keyup nativos no elemento com foco,
     *  como o keyboard.press do Puppeteer: Enter leva o texto "\r"). */
    async press(key, { code = key, keyCode = 0, shift = false } = {}) {
      const texto = key === 'Enter' ? '\r' : undefined;
      const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers: shift ? 8 : 0 };
      await cdp.send('Input.dispatchKeyEvent', texto ? { type: 'keyDown', ...base, text: texto, unmodifiedText: texto } : { type: 'rawKeyDown', ...base });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
    /** Grava um PNG do estado atual da página (evidência de sessão); `clip`
     *  ({x, y, width, height, scale}) recorta uma região, com zoom opcional.
     *  As capturas vão numa FILA (uma de cada vez): duas Page.captureScreenshot
     *  em simultâneo — uma com clip, outra sem — corrompem a imagem (um mosaico
     *  do recorte) sem erro nenhum; assim, mesmo sem await, cada uma sai certa. */
    screenshot(path, clip) {
      const vez = filaCapturas.then(async () => {
        const shot = await cdp.send('Page.captureScreenshot', clip ? { format: 'png', clip: { scale: 1, ...clip } } : { format: 'png' });
        writeFileSync(path, Buffer.from(shot.data, 'base64'));
        return path;
      });
      filaCapturas = vez.catch(() => {}); // uma captura falhada não trava as seguintes
      return vez;
    }
  };

  return {
    page,
    /** Sessão CDP crua da página (ex.: Target.createTarget para esconder a aba). */
    cdp,
    /** PID do processo principal do browser (medições de CPU da árvore de processos). */
    pid: proc.pid,
    async close() {
      try { ws.close(); } catch { /* já fechado */ }
      proc.kill('SIGKILL');
      await sleep(150);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* perfil temporário */ }
    }
  };
}
