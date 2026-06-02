import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Custom Vitest-reporter voor de API-regressietests.
 * Schrijft `tests/REPORT.md` met per gefaalde test een vermoedelijke root cause.
 */

interface MiniTest {
  name: string;
  fullName: string;
  state: string;
  errors: string[];
}

const ROOT_CAUSE_HINTS: { match: RegExp; cause: string }[] = [
  { match: /health/i,            cause: 'API of database niet bereikbaar. Controleer of Postgres draait (`docker compose -f docker/docker-compose.yml up -d`) en `DATABASE_URL` in `.env`.' },
  { match: /text_scale|payload-formaat|display/i, cause: 'Display-payload klopt niet. Controleer `routes/display.ts` (o.a. `text_scale` in de category-mapping) en het DB-schema/migratie.' },
  { match: /401|zonder token|authenticatie/i, cause: 'Auth-bescherming werkt niet. Controleer `requireAuth` (`lib/auth.ts`) en de `preHandler` op de route.' },
  { match: /400|ongeldige body|validatie/i, cause: 'Input-validatie faalt. Controleer de zod-schema’s (`createBody` e.d.) in de betreffende route.' },
  { match: /201|maakt een categorie|crud|204/i, cause: 'CRUD-pad gebroken. Controleer de insert/delete in `routes/categories.ts` en het DB-schema (defaults zoals `text_scale = 100`).' },
  { match: /magic-link|verify|auth-routes/i, cause: 'Auth-flow gebroken. Controleer `routes/auth.ts` (magic-link genereren / token-verificatie).' },
  { match: /404|onbekend token/i, cause: 'Not-found-afhandeling klopt niet. Controleer de token-lookup in `routes/display.ts`.' },
];

function hintFor(name: string): string {
  for (const h of ROOT_CAUSE_HINTS) if (h.match.test(name)) return h.cause;
  return 'Onbekende oorzaak — zie de assertion/stacktrace hieronder.';
}

export default class RootCauseReporter {
  private start = Date.now();

  onInit(): void {
    this.start = Date.now();
  }

  onFinished(files: unknown[] = [], errors: unknown[] = []): void {
    const tests: MiniTest[] = [];

    const walk = (task: any, prefix: string): void => {
      const full = prefix ? `${prefix} › ${task.name}` : task.name;
      if (task.type === 'test' || task.type === 'custom') {
        tests.push({
          name: task.name,
          fullName: full,
          state: task.result?.state ?? 'skipped',
          errors: (task.result?.errors ?? []).map((e: any) => e?.message ?? String(e)),
        });
      }
      (task.tasks ?? []).forEach((t: any) => walk(t, full));
    };
    (files as any[]).forEach((f) => walk(f, ''));

    const passed = tests.filter((t) => t.state === 'pass').length;
    const failed = tests.filter((t) => t.state === 'fail');
    const skipped = tests.length - passed - failed.length;
    const ok = failed.length === 0 && errors.length === 0;
    const durationMs = Date.now() - this.start;

    const L: string[] = [];
    L.push('# Regressierapport — API');
    L.push('');
    L.push(`_Gegenereerd: ${new Date().toISOString()}_`);
    L.push('');
    L.push(`**Resultaat: ${ok ? '✅ GESLAAGD' : '❌ GEFAALD'}**`);
    L.push('');
    L.push('| Metric | Waarde |');
    L.push('|--------|--------|');
    L.push(`| Totaal | ${tests.length} |`);
    L.push(`| Geslaagd | ${passed} |`);
    L.push(`| Gefaald | ${failed.length} |`);
    L.push(`| Overgeslagen | ${skipped} |`);
    L.push(`| Duur | ${durationMs} ms |`);
    L.push('');

    if (errors.length) {
      L.push('## ⚠️ Uitvoeringsfouten (buiten de tests om)');
      L.push('');
      L.push('Duidt meestal op een omgevingsprobleem: database/Redis niet bereikbaar, ontbrekende `.env`, of seed niet gedraaid.');
      L.push('');
      for (const e of errors) L.push('```\n' + ((e as any)?.message ?? String(e)) + '\n```');
      L.push('');
    }

    if (failed.length) {
      L.push('## ❌ Gefaalde tests — root cause');
      L.push('');
      for (const t of failed) {
        L.push(`### ${t.fullName}`);
        L.push('');
        L.push(`- **Vermoedelijke root cause:** ${hintFor(t.fullName)}`);
        L.push('- **Details:**');
        L.push('');
        L.push('```');
        L.push(t.errors.join('\n') || '(geen foutmelding beschikbaar)');
        L.push('```');
        L.push('');
      }
    } else if (ok) {
      L.push('Alle regressietests zijn geslaagd — geen root-cause-analyse nodig.');
      L.push('');
    }

    const out = resolve(process.cwd(), 'tests', 'REPORT.md');
    writeFileSync(out, L.join('\n'), 'utf8');
    console.log(`\n[rootcause-reporter] rapport geschreven: ${out}`);
  }
}
