import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // ts-algochat uses "moduleResolution": "bundler" so its compiled ESM
    // output omits .js extensions. Vite/Vitest needs this to resolve those
    // extensionless imports under Node.js ESM resolution.
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  test: {
    include: ['src/**/*.spec.ts'],
    globals: true,
  },
});
