import { describe, it, expect } from 'vitest';
import { buildPreviewUrl, nextScale, SCALE_STEPS } from '../src/lib/display-link';

describe('admin — nextScale (fontschaal-cyclus)', () => {
  it('doorloopt 100 → 125 → 150 → 100', () => {
    expect(nextScale(100)).toBe(125);
    expect(nextScale(125)).toBe(150);
    expect(nextScale(150)).toBe(100);
  });

  it('valt terug op 100 bij een onbekende waarde', () => {
    expect(nextScale(999)).toBe(100);
  });

  it('SCALE_STEPS bevat de verwachte stappen', () => {
    expect([...SCALE_STEPS]).toEqual([100, 125, 150]);
  });
});

describe('admin — buildPreviewUrl', () => {
  const base = 'http://localhost:4000';

  it('geeft # zonder token', () => {
    expect(buildPreviewUrl(base, null, 'dark', 'default')).toBe('#');
    expect(buildPreviewUrl(base, undefined, 'dark', 'default')).toBe('#');
  });

  it('bouwt token + thema zonder font bij default', () => {
    expect(buildPreviewUrl(base, 'abc', 'warm', 'default'))
      .toBe('http://localhost:4000/?token=abc&theme=warm');
  });

  it('voegt &font= toe bij een niet-default font', () => {
    expect(buildPreviewUrl(base, 'abc', 'cool', 'serif'))
      .toBe('http://localhost:4000/?token=abc&theme=cool&font=serif');
  });
});
