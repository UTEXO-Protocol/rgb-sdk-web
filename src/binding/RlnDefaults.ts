import type { Network } from '@utexo/rgb-sdk-core';
import {
  DEFAULT_INDEXER_URLS as CORE_DEFAULT_INDEXER_URLS,
  normalizeNetwork,
  ValidationError,
} from '@utexo/rgb-sdk-core';

export interface RlnNetworkUrls {
  /** WebSocket proxy URL for the Lightning node */
  proxyUrl: string;
  /** HTTP endpoint for RGB consignment delivery (setDefaultRgbProxyTransport) */
  transportEndpoint: string;
  /** Esplora HTTP URL for chain indexer (goOnline) */
  indexerUrl: string;
  /** Relay auth for the WS gateway (production wasm-proxy-gateway requires
   *  auth_token + node_id on every relay URL; without them the WS upgrade is
   *  rejected with 401 before the socket opens). */
  relayAuthToken?: string;
  relayNodeId?: string;
}

export const DEFAULT_RLN_URLS: Partial<Record<Network, RlnNetworkUrls>> = {
  regtest: {
    proxyUrl: 'ws://127.0.0.1:3001',
    transportEndpoint: 'http://127.0.0.1:3001/rgb/json-rpc',
    indexerUrl: 'http://127.0.0.1:3002',
  },
  utexo: {
    proxyUrl: 'wss://ln-gateway-signet.utexo.com',
    // http(s) scheme — the wasm SDK's setDefaultRgbProxyTransport rejects
    // rpc(s)://; the binding converts to rpcs:// where rgb-lib needs it.
    transportEndpoint: 'https://rgb-proxy.utexo.com/json-rpc',
    indexerUrl: 'https://esplora-api.utexo.com',
    // Client credentials for the hosted gateway relay (not a secret — they
    // ship to every browser client; the gateway pins them server-side).
    relayAuthToken:
      '2b5410f44057cd19a7b7540981d64823e83f44d1b9412034d3f3b4c28e611067',
    relayNodeId:
      '031f1239ab686edaa31971f16eceef4b66a0844d052367f52d3c6cbc8f7a9ca49c',
  },
  signet: {
    // TODO: proxyUrl is a placeholder — replace once the real WS proxy is deployed.
    proxyUrl: 'wss://rln-proxy-utexo.utexo.com/rgb/json-rpc',
    transportEndpoint: 'https://rgb-proxy.utexo.com/json-rpc',
    indexerUrl: 'ssl://electrum.iriswallet.com:50033',
  },
};

export function getRlnUrls(network: string): RlnNetworkUrls | undefined {
  return (DEFAULT_RLN_URLS as Record<string, RlnNetworkUrls>)[network];
}

/**
 * Effective esplora indexer for both the wallet go-online default and the LN
 * node's chain-sync. A non-empty `indexerUrl` wins; otherwise the network
 * default is used. Throws if neither is available (never silently guesses).
 */
export function resolveNodeIndexerUrl(
  network: string,
  indexerUrl?: string
): string {
  if (indexerUrl) return indexerUrl;
  const defaultIndexerUrl = CORE_DEFAULT_INDEXER_URLS[normalizeNetwork(network)];
  if (!defaultIndexerUrl) {
    throw new ValidationError(
      `No indexer URL configured for network "${network}" — pass indexerUrl explicitly`,
      'indexerUrl'
    );
  }
  return defaultIndexerUrl;
}

// ── Moved to @utexo/rgb-sdk-core ─────────────────────────────────────────────
// DEFAULT_LSP_BASE_URLS / getDefaultLspBaseUrl / resolveLspBaseUrl and
// DEFAULT_INDEXER_URLS were duplicated here and in rgb-sdk-rn. They now live in
// core (`constants/lsp`, `constants/endpoints`) so the two SDKs cannot disagree
// about which endpoint a network points at. Re-exported for import-site
// compatibility; DEFAULT_RLN_URLS above stays web-only (WS proxy table).

export {
  DEFAULT_LSP_BASE_URLS,
  getDefaultLspBaseUrl,
  resolveLspBaseUrl,
  DEFAULT_INDEXER_URLS,
  resolveIndexerUrl,
} from '@utexo/rgb-sdk-core';
