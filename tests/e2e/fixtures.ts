/**
 * Loads the machine-readable stack fixture written by
 * `rgb-sdk-web-demo/scripts/start-lsp-web.sh` (MIGRATION-PLAN-v3 §6.0k).
 *
 * The e2e suite reads provisioned values (asset id, pubkeys, URLs) from this
 * file instead of scraping logs; `stop` deletes it, so a stale fixture cannot
 * point the suite at a torn-down stack.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface WebFixtures {
  generatedAt: string;
  platform: 'web';
  ASSET_ID: string;
  LSP_PUBKEY: string;
  FAUCET_PUBKEY: string;
  GATEWAY_URL: string;
  GATEWAY_WS_URL: string;
  TRANSPORT_URL: string;
  LSP_URL: string;
  FAUCET_URL: string;
  UTEXO_LSP_URL: string;
  INDEXER_URL: string;
  LSP_PEER_PORT: number;
  FAUCET_PEER_PORT: number;
  /** Present only when the stack was started with VSS=1. */
  VSS_URL?: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.resolve(
  here,
  '../../../rgb-sdk-web-demo/e2e-fixtures.json'
);

export function loadFixtures(): WebFixtures {
  const p = process.env.RGB_E2E_FIXTURES ?? DEFAULT_PATH;
  if (!fs.existsSync(p)) {
    throw new Error(
      `e2e fixtures not found: ${p}\n` +
        'Bring the stack up first — rgb-sdk-web-demo/scripts/start-lsp-web.sh ' +
        'writes e2e-fixtures.json when provisioning completes. ' +
        'Or point RGB_E2E_FIXTURES at the file.'
    );
  }
  const f = JSON.parse(fs.readFileSync(p, 'utf8')) as WebFixtures;
  if (f.platform !== 'web') {
    throw new Error(
      `fixtures at ${p} are for platform "${f.platform}", expected "web"`
    );
  }
  return f;
}

/**
 * Fund an address and mine, via the gateway's dev endpoint — from Node, so no
 * CORS involvement and the test stays ordinary JS (§7a.1).
 */
export async function gatewayFund(
  f: WebFixtures,
  address: string,
  amountBtc: number,
  mineBlocks: number
): Promise<void> {
  const r = await fetch(`${f.GATEWAY_URL}/dev/regtest/fund`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      address,
      amount_btc: amountBtc,
      mine_blocks: mineBlocks,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`gateway /dev/regtest/fund → HTTP ${r.status}: ${body}`);
  }
}
