/** Maakt een URL-vriendelijke slug van een vrije tekst (bijv. bedrijfsnaam). */
export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '') // accenten weg
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'menu';
}
