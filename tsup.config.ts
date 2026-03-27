import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'es2020',
  platform: 'browser',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  outExtension: () => ({
    js: '.mjs',
  }),
});
