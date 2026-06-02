import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Custom Vitest-reporter voor de admin-regressietests.
 * Schrijft `tests/REPORT.md` met per gefaalde test een vermoedelijke root cause.
 */

interface MiniTest {
  name: string;
  fullName: string;
  state: string;
  errors: string[];
}

const ROOT_CAUSE_HINTS: { match: RegExp; cause: string }[] = [
  { match: /nextScale|schaal|cyclus/i, cause: 'Fontschaal-cyclus klopt niet. Controleer `nextScale()` / `SCALE_STEPS` in `lib/display-link.ts` en `cycleScale()` in het dashboard.' },
  { match: /buildPreviewUrl|preview|font|token|thema/i, cause: 'Preview-URL-opbouw klopt niet. Controleer `buildPreviewUrl()` in `lib/display-link.ts` (token/thema/`&font=`).' },
  { match: /Authorization|jwt/i, cause: 'Auth-header-logica gebroken. Controleer het lezen van `localStorage.jwt` en de header-opbouw in `lib/api.ts`.' },
  { match: /text_scale|updateCategory|categorie-endpoint/i, cause: 'Categorie-API-call klopt niet. Controleer `api.updateCategory`/`createCategory` in `lib/api.ts` (o.a. de `text_scale`-body).' },
  { match: /FormData|uploadImage|library/i, cause: 'Upload/library-call klopt niet. Controleer dat FormData géén JSON content-type krijgt en de endpoints in `lib/api.ts`.' },
  { match: /204|!ok|response-afhandeling|statusText/i, cause: 'Response-afhandeling gebroken. Controleer de 204- en foutafhandeling in de `req()`-helper van `lib/api.ts`.' },
  { match: /request-opbouw|content-type|GET/i, cause: 'Request-opbouw klopt niet. Controleer URL-samenstelling en headers in de `req()`-helper van `lib/api.ts`.' },
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
    L.push('# Regressierapport — Admin');
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
      L.push('Duidt meestal op een configuratie-/importprobleem i.p.v. een gefaalde assertie.');
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
