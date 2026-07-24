import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '../..');

/**
 * E2E suite — runs against the local regtest stack provisioned by
 * `rgb-sdk-web-demo/scripts/start-lsp-web.sh` (see tests/e2e/README.md).
 *
 * wasm needs a real browser (§7a.4: indexedDB + WebSocket as globals), so the
 * suite drives the harness page in Chromium. One worker: the specs share one
 * regtest chain, and interleaved mining makes failures non-reproducible.
 */
export default defineConfig({
  testDir: here,
  testMatch: '**/*.spec.ts',
  timeout: 240_000,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --config tests/e2e/vite.config.ts',
    cwd: pkgRoot,
    url: 'http://localhost:5173/',
    timeout: 60_000,
    // The port is pinned to 5173 (gateway CORS allowlist). Never reuse: a
    // demo dev server on the same port would serve the wrong page.
    reuseExistingServer: false,
  },
});
