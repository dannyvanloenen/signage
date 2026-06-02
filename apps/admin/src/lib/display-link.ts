// Pure helpers voor het dashboard — los getest in tests/display-link.test.ts.

/** Beschikbare fontschalen (procenten) die de A-knop doorloopt. */
export const SCALE_STEPS = [100, 125, 150] as const;

/** Volgende schaal in de cyclus 100 → 125 → 150 → 100. Onbekend = 100. */
export function nextScale(current: number): number {
  const idx = SCALE_STEPS.indexOf(current as (typeof SCALE_STEPS)[number]);
  return SCALE_STEPS[(idx + 1) % SCALE_STEPS.length];
}

/**
 * Bouwt de display-preview-URL. Zonder token → '#'.
 * `font` wordt alleen toegevoegd als het niet 'default' is (consistent met
 * de display, die 'default' als standaard behandelt).
 */
export function buildPreviewUrl(
  displayUrl: string,
  token: string | null | undefined,
  theme: string,
  font: string,
): string {
  if (!token) return '#';
  const fontPart = font && font !== 'default' ? `&font=${font}` : '';
  return `${displayUrl}/?token=${token}&theme=${theme}${fontPart}`;
}
