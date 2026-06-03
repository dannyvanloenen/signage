import { describe, it, expect } from 'vitest';
import { slugify } from '../src/lib/slug';

describe('slugify', () => {
  it('maakt nette slugs van bedrijfsnamen', () => {
    expect(slugify('Friet Palace')).toBe('friet-palace');
    expect(slugify('  Café de Hoek!! ')).toBe('cafe-de-hoek');
    expect(slugify("Joe's Diner")).toBe('joe-s-diner');
  });

  it('valt terug op "menu" zonder bruikbare tekens', () => {
    expect(slugify('@@@')).toBe('menu');
    expect(slugify('')).toBe('menu');
  });

  it('begrenst de lengte', () => {
    expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(60);
  });
});
