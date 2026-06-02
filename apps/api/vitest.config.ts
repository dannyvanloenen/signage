import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Geldige URL-defaults zodat de config-validatie niet struikelt over een
    // afwijkende BASE_URL/ADMIN_URL in de host-omgeving. DATABASE_URL e.d.
    // blijven uit de .env komen.
    env: {
      BASE_URL: 'http://localhost:3000',
      ADMIN_URL: 'http://localhost:3001',
    },
    // Integratietests draaien tegen de echte (geseede) Postgres via app.inject().
    reporters: ['default', './tests/rootcause-reporter.ts'],
    hookTimeout: 20000,
    testTimeout: 20000,
    // Eén DB-verbinding tegelijk houdt de integratietests deterministisch.
    fileParallelism: false,
  },
});
