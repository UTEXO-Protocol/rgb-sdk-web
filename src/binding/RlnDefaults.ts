import type { Network } from '@utexo/rgb-sdk-core';

export interface RlnNetworkUrls {
  /** WebSocket proxy URL for the Lightning node */
  proxyUrl: string;
  /** HTTP endpoint for RGB consignment delivery (setDefaultRgbProxyTransport) */
  transportEndpoint: string;
  /** Esplora HTTP URL for chain indexer (goOnline) */
  indexerUrl: string;
}

export const DEFAULT_RLN_URLS: Partial<Record<Network, RlnNetworkUrls>> = {
  regtest: {
    proxyUrl: 'ws://127.0.0.1:3001',
    transportEndpoint: 'http://127.0.0.1:3001/rgb/json-rpc',
    indexerUrl: 'http://127.0.0.1:3002',
  },
  utexo: {
    proxyUrl: 'wss://rln-proxy-utexo.utexo.com/rgb/json-rpc',
    transportEndpoint: 'https://rln-proxy-utexo.utexo.com/rgb/json-rpc',
    indexerUrl: 'https://esplora-api.utexo.com',
  },
};

export function getRlnUrls(network: string): RlnNetworkUrls | undefined {
  return (DEFAULT_RLN_URLS as Record<string, RlnNetworkUrls>)[network];
}
