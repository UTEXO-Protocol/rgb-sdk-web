/**
 * Bundles the harness page with esbuild and serves it, with the rgb-lib-wasm
 * binary, on RGB_E2E_PORT (default 5180). Playwright starts this as its
 * webServer; `npm run build` must run first so `dist/` is current.
 *
 * `/vss/*` is proxied to the local VSS server (RGB_E2E_VSS_PORT, default
 * 8181): it sends no CORS headers, so the page reaches it same-origin.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '.out');
const require = (await import('node:module')).createRequire(import.meta.url);
const wasmDir = path.dirname(
  require.resolve('@utexo/rgb-lib-wasm/package.json')
);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
await build({
  entryPoints: [path.join(here, 'harness/main.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: path.join(out, 'bundle.js'),
  logLevel: 'warning',
});
fs.copyFileSync(
  path.join(here, 'harness/index.html'),
  path.join(out, 'index.html')
);
fs.copyFileSync(
  path.join(wasmDir, 'rgb_lib_wasm_bindings_bg.wasm'),
  path.join(out, 'rgb_lib_wasm_bindings_bg.wasm')
);

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
};
const port = Number(process.env.RGB_E2E_PORT ?? 5180);
const vssPort = Number(process.env.RGB_E2E_VSS_PORT ?? 8181);

function proxyVss(req, res) {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: vssPort,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `127.0.0.1:${vssPort}` },
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    }
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
}

http
  .createServer((req, res) => {
    if (req.url?.startsWith('/vss/')) {
      proxyVss(req, res);
      return;
    }
    const name =
      new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html';
    const file = path.join(out, path.basename(name));
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': types[path.extname(file)] ?? 'application/octet-stream',
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, '127.0.0.1', () => console.log(`e2e harness on :${port}`));
