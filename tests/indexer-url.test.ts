import { describe, it, expect } from '@jest/globals';
import { resolveNodeIndexerUrl, DEFAULT_INDEXER_URLS } from '../dist/index.mjs';

/**
 * Regression guard for the signet chain-sync bug: the LN node used to ignore
 * the constructor `indexerUrl` and always use the network default. A supplied
 * URL must win; a missing one must resolve to the network default or throw.
 */
describe('resolveNodeIndexerUrl', () => {
  it('returns the caller-supplied URL, overriding the network default', () => {
    const custom = 'https://my-esplora.example.com';
    expect(resolveNodeIndexerUrl('signet', custom)).toBe(custom);
    expect(resolveNodeIndexerUrl('signet', custom)).not.toBe(
      DEFAULT_INDEXER_URLS.signet
    );
  });

  it('falls back to the per-network default when no URL is supplied', () => {
    expect(resolveNodeIndexerUrl('signet')).toBe(DEFAULT_INDEXER_URLS.signet);
    expect(resolveNodeIndexerUrl('testnet')).toBe(DEFAULT_INDEXER_URLS.testnet);
    expect(resolveNodeIndexerUrl('utexo')).toBe(DEFAULT_INDEXER_URLS.utexo);
  });

  it('treats an empty string as "not supplied"', () => {
    expect(resolveNodeIndexerUrl('signet', '')).toBe(
      DEFAULT_INDEXER_URLS.signet
    );
  });

  it('honours the supplied URL even for an unrecognised network', () => {
    const custom = 'https://my-esplora.example.com';
    expect(resolveNodeIndexerUrl('not-a-network', custom)).toBe(custom);
  });

  it('throws when no URL is supplied and none is configured', () => {
    expect(() => resolveNodeIndexerUrl('not-a-network')).toThrow();
  });
});
