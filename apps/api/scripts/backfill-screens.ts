/**
 * Eenmalige backfill: geeft elke tenant zonder schermen één "Hoofdscherm".
 * Het scherm hergebruikt de bestaande tenant.public_token en neemt de huidige
 * achtergrond/video/ticker over, zodat bestaande display-URLs blijven werken.
 * category_ids = null betekent "alle categorieën van de tenant".
 *
 * Idempotent: tenants die al een scherm hebben worden overgeslagen.
 *
 *   pnpm tsx scripts/backfill-screens.ts
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { tenants, screens } from '../src/db/schema.js';

async function main(): Promise<void> {
  const allTenants = await db.select().from(tenants);
  let created = 0;

  for (const t of allTenants) {
    const existing = await db.select({ id: screens.id }).from(screens).where(eq(screens.tenant_id, t.id)).limit(1);
    if (existing.length > 0) continue;

    await db.insert(screens).values({
      tenant_id: t.id,
      name: 'Hoofdscherm',
      public_token: t.public_token,
      theme: 'dark',
      layout: 'auto',
      font: 'default',
      bg_image_path: t.bg_image_path,
      bg_video_path: t.bg_video_path,
      ticker_text: t.ticker_text,
      category_ids: null,
      sort_order: 0,
    });
    created += 1;
    console.log(`✓ Hoofdscherm aangemaakt voor "${t.name}" (token ${t.public_token.slice(0, 8)}…)`);
  }

  console.log(`\nKlaar: ${created} scherm(en) aangemaakt, ${allTenants.length - created} tenant(s) overgeslagen.`);
  await (db.$client as unknown as { end: (o?: unknown) => Promise<void> }).end({ timeout: 5 });
}

main().catch((err) => {
  console.error('Backfill mislukt:', err);
  process.exit(1);
});
