import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    globals: true,
    server: {
      deps: {
        // ts-algochat uses "moduleResolution": "bundler" so its compiled ESM
        // omits .js extensions. Inlining it lets Vite's resolver handle the
        // extensionless imports instead of Node.js strict ESM resolution.
        inline: ['@corvidlabs/ts-algochat'],
      },
    },
  },
});
