/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  // tests/e2e is Playwright's (npm run test:e2e) — jest must not collect it.
  testPathIgnorePatterns: ['<rootDir>/tests/e2e/'],
  // Use ESM for tests since we have experimental flags
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          skipLibCheck: true,
        },
        diagnostics: {
          ignoreCodes: [1343, 2351, 6059, 7016], // Ignore missing declaration file errors
        },
        isolatedModules: true,
        useESM: true,
      },
    ],
  },
  // Don't transform ESM modules - let Node.js handle them with experimental flags
  transformIgnorePatterns: [
    'node_modules/(?!(@metamask|bitcoindevkit|@types|@noble)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@noble/hashes/sha2$': '<rootDir>/node_modules/@noble/hashes/sha2.js',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts'],
  testTimeout: 30000, // Increased timeout for crypto operations
  // Set NODE_OPTIONS for WASM support
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};
