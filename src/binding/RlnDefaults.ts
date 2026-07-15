import type { Network } from '@utexo/rgb-sdk-core';

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
 * Default utexo-lsp HTTP base URLs per network. Used when the caller omits
 * lspBaseUrl in the wallet params so LSP-backed flows work out of the box.
 * Networks without an entry have no default and must be configured explicitly.
 */
const DEFAULT_LSP_BASE_URLS: Partial<Record<string, string>> = {
  utexo: 'https://lsp-signet.utexo.com',
};

/** Returns the default lspBaseUrl for a network, or undefined if none exists. */
export function getDefaultLspBaseUrl(network: string): string | undefined {
  return DEFAULT_LSP_BASE_URLS[network];
}

/**
 * Resolves the lspBaseUrl to use: the explicit value if provided, otherwise the
 * per-network default. Throws when neither is available so callers fail loudly
 * instead of silently hitting a missing LSP.
 */
export function resolveLspBaseUrl(
  network: string,
  lspBaseUrl?: string | null
): string {
  const resolved = lspBaseUrl ?? DEFAULT_LSP_BASE_URLS[network];
  if (!resolved) {
    throw new Error(
      `No lspBaseUrl configured for network "${network}" and no default is available. ` +
        'Set lspBaseUrl in the wallet params or pass an explicit LspPeer to createLsp().'
    );
  }
  return resolved;
}

/** Default Esplora/Electrum indexer URLs per network. */
export const DEFAULT_INDEXER_URLS: Record<Network, string> = {
  mainnet: 'https://esplora-mainnet.utexo.com',
  testnet: 'https://esplora-testnet3.utexo.com',
  testnet4: 'https://esplora-testnet4.utexo.com',
  signet: 'ssl://electrum.iriswallet.com:50033',
  utexo: 'https://esplora-api.utexo.com',
  regtest: 'http://127.0.0.1:3002',
};
