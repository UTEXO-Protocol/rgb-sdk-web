import base from './playwright.config.mjs';

/**
 * Raw fixture capture (ADR-0002 step 0): `npm run capture:fixtures`. Not part
 * of `npm run test:e2e`; rerun it when `@utexo/rgb-lib-wasm` changes.
 */
export default {
  ...base,
  testMatch: '**/*.capture.mjs',
  timeout: 900_000,
};
