/**
 * Servidor HTTP estático mínimo para os testes — apenas stdlib do Node.
 * Serve a raiz do projeto para que a app corra em http:// (file:// bloqueia SVGs).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

export async function startServer(root, port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const abs = normalize(join(root, rel));
      if (!abs.startsWith(normalize(root))) {
        res.writeHead(403).end('fora da raiz');
        return;
      }
      const info = await stat(abs);
      const file = info.isDirectory() ? join(abs, 'index.html') : abs;
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('não encontrado');
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const actual = server.address().port;
  return {
    url: `http://127.0.0.1:${actual}`,
    port: actual,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
