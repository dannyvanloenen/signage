import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Custom Vitest-reporter die na elke run `tests/REPORT.md` schrijft.
 * Bij een gefaalde test wordt een vermoedelijke root cause vermeld, zodat
 * direct duidelijk is wélk onderdeel niet functioneert en waar te kijken.
 */

interface MiniTest {
  name: string;
  fullName: string;
  state: string;
  errors: string[];
}

// Heuristiek: koppelt (een deel van) de testnaam aan de waarschijnlijke oorzaak.
const ROOT_CAUSE_HINTS: { match: RegExp; cause: string }[] = [
  { match: /center/i,            cause: 'Center-layout wordt niet correct opgebouwd. Controleer `getLayout()` (video-detectie / `?layout`) en de links/rechts-splitsing van `.board-col` in `src/render.ts`.' },
  { match: /grid|--cols/i,       cause: 'Grid-layout of de `--cols`-berekening klopt niet. Controleer de else-tak in `render()` en de telling van zichtbare categorieën.' },
  { match: /fontschaal|cat-scale|schaal/i, cause: 'Per-categorie fontschaal wordt niet doorgegeven. Controleer `text_scale` → `--cat-scale` in `renderCategory()`.' },
  { match: /ticker/i,            cause: 'Ticker-rendering klopt niet. Controleer `tenant.ticker_text` en de `has-ticker`-class op `.board-grid`.' },
  { match: /winkelnaam|titel|header/i, cause: 'Header/titel-structuur is gewijzigd. Controleer de `.board-header` / `.board-title` markup in `render()`.' },
  { match: /xss|escaped/i,       cause: 'Output-escaping is kapot — mogelijke XSS. Controleer de `esc()`-functie in `src/render.ts`.' },
  { match: /lege categor|verbergt/i, cause: 'Filtering van lege categorieën werkt niet. Controleer de `is_available`-filter in `renderCategory()`.' },
  { match: /error-state|loading-state|state/i, cause: 'Splash-states renderen niet. Controleer `renderError()` / `renderLoading()`.' },
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
    L.push('# Regressierapport — Display');
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
      L.push('Duidt meestal op een omgevings-/configuratieprobleem (ontbrekende dependency, importfout) i.p.v. een gefaalde assertie.');
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
