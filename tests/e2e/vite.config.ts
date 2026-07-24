import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Serves the e2e harness page (tests/e2e/harness) with the BUILT sdk:
// '@utexo/rgb-sdk-web' resolves to dist/index.mjs, never src/ — the suite
// tests the artifact that ships, not the sources (MIGRATION-PLAN-v3 §7a.5).
//
// Port 5173 is load-bearing: the wasm-proxy-gateway started by
// rgb-sdk-web-demo/scripts/start-lsp-web.sh only allows CORS from
// http://localhost:5173 / http://127.0.0.1:5173.

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '../..');
const distEntry = path.resolve(pkgRoot, 'dist/index.mjs');
// file: dep — resolve the symlink so vite's fs allowlist matches real paths.
const coreRoot = fs.realpathSync(
  path.resolve(pkgRoot, 'node_modules/@utexo/rgb-sdk-core')
);
// Same for the wasm package: when it is a `file:` dep pointing at a local
// wasm-pack build, its .wasm lives outside pkgRoot and vite refuses to serve it
// ("outside of Vite serving allow list"). Resolved, not hardcoded, so testing a
// build from any directory needs no config change.
const rlnWasmRoot = (() => {
  try {
    return [
      fs.realpathSync(path.resolve(pkgRoot, 'node_modules/@utexo/rln-wasm')),
    ];
  } catch {
    return [];
  }
})();

export default defineConfig({
  root: path.resolve(here, 'harness'),
  plugins: [
    nodePolyfills({ globals: { Buffer: true, process: true } }), // must be first
    wasm(),
    topLevelAwait(),
  ],
  resolve: {
    alias: { '@utexo/rgb-sdk-web': distEntry },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // vss-server has no CORS — same-origin via this proxy, like the demo.
      '/vss': {
        target: 'http://127.0.0.1:8081',
        changeOrigin: true,
      },
      // utexo-lsp has no CORS either, and the gateway's allowlist does not
      // cover it — scenario J's `createLsp` would fail on /get_info without
      // this. Same-origin via the proxy, exactly as the demo does with
      // VITE_LSP_BASE_URL="/lsp".
      '/lsp': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/lsp/, ''),
      },
    },
    fs: {
      allow: [pkgRoot, coreRoot, ...rlnWasmRoot],
    },
  },
  optimizeDeps: {
    exclude: ['@utexo/rgb-sdk-web', '@utexo/rln-wasm', '@utexo/rgb-sdk-core'],
    include: ['bitcoinjs-lib'],
  },
});
