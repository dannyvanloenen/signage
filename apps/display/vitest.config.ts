import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    // 'default' toont de normale console-output; de tweede reporter schrijft
    // tests/REPORT.md met een root-cause-analyse bij elke run.
    reporters: ['default', './tests/rootcause-reporter.ts'],
  },
});
