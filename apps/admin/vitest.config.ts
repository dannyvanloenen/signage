import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom levert fetch / localStorage / File / FormData voor de
    // api-client tests; de helper-tests zijn puur.
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    reporters: ['default', './tests/rootcause-reporter.ts'],
  },
});
