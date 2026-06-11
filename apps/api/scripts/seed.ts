import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { config } from '../src/config.js';
import { tenants, users, magic_tokens, categories, menu_items, screens } from '../src/db/schema.js';

const EMAIL = process.env.SEED_EMAIL ?? 'demo@signage.local';

const client = postgres(config.DATABASE_URL);
const db = drizzle(client);

async function seed() {
  console.log('Seeding database…');

  // Tenant
  let [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'demo'));
  if (!tenant) {
    [tenant] = await db.insert(tenants).values({
      name: 'Demo Snackbar',
      slug: 'demo',
      public_token: randomBytes(24).toString('hex'),
    }).returning();
    console.log('  created tenant:', tenant.name);
  } else {
    console.log('  tenant already exists:', tenant.name);
  }

  // User
  let [user] = await db.select().from(users).where(eq(users.email, EMAIL));
  if (!user) {
    [user] = await db.insert(users).values({
      email: EMAIL,
      tenant_id: tenant.id,
      role: 'owner',
    }).returning();
    console.log('  created user:', EMAIL);
  } else {
    if (!user.tenant_id) {
      await db.update(users).set({ tenant_id: tenant.id }).where(eq(users.id, user.id));
    }
    console.log('  user already exists:', EMAIL);
  }

  // Standaardscherm (Hoofdscherm) — hergebruikt de tenant-token, net als de
  // backfill en self-service signup. Idempotent: overslaan als er al een scherm is.
  const existingScreen = await db.select({ id: screens.id }).from(screens).where(eq(screens.tenant_id, tenant.id)).limit(1);
  if (existingScreen.length === 0) {
    await db.insert(screens).values({
      tenant_id: tenant.id,
      name: 'Hoofdscherm',
      public_token: tenant.public_token,
      sort_order: 0,
    });
    console.log('  created default screen: Hoofdscherm');
  } else {
    console.log('  screen already exists, skipping');
  }

  // Categories + items
  const existing = await db.select().from(categories).where(eq(categories.tenant_id, tenant.id));
  if (existing.length === 0) {
    const cats = [
      {
        name: 'Snacks',
        items: [
          { name: 'Friet klein', price_cents: 250 },
          { name: 'Friet groot', price_cents: 350 },
          { name: 'Kroket', price_cents: 175, description: 'Huisgemaakte rundvleeskroket' },
          { name: 'Frikandel', price_cents: 165 },
          { name: 'Kaassoufflé', price_cents: 185 },
        ],
      },
      {
        name: 'Burgers',
        items: [
          { name: 'Classic Burger', price_cents: 695, description: 'Rundvlees, sla, tomaat, ui' },
          { name: 'Cheeseburger', price_cents: 745, description: 'Met gesmolten cheddar' },
          { name: 'Chicken Burger', price_cents: 725, description: 'Krokante kipfilet' },
        ],
      },
      {
        name: 'Dranken',
        items: [
          { name: 'Cola 0,33L', price_cents: 250 },
          { name: 'Fanta 0,33L', price_cents: 250 },
          { name: 'Spa Rood 0,5L', price_cents: 200 },
          { name: 'Koffie', price_cents: 175 },
        ],
      },
      {
        name: 'Sauzen',
        items: [
          { name: 'Mayonaise', price_cents: 50 },
          { name: 'Ketchup', price_cents: 50 },
          { name: 'Currysaus', price_cents: 50 },
          { name: 'Satésaus', price_cents: 75 },
        ],
      },
    ];

    for (let i = 0; i < cats.length; i++) {
      const { name, items } = cats[i];
      const [cat] = await db.insert(categories).values({
        tenant_id: tenant.id,
        name,
        sort_order: i,
      }).returning();

      for (let j = 0; j < items.length; j++) {
        const { name: itemName, price_cents, description } = items[j] as { name: string; price_cents: number; description?: string };
        await db.insert(menu_items).values({
          tenant_id: tenant.id,
          category_id: cat.id,
          name: itemName,
          description: description ?? null,
          price_cents,
          sort_order: j,
          is_available: true,
        });
      }
    }
    console.log('  created 4 categories with sample items');
  } else {
    console.log('  categories already exist, skipping');
  }

  // Magic login token (valid 24h)
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(magic_tokens).values({ token, user_id: user.id, expires_at: expires });

  console.log('\nDone. Login link (valid 24h):');
  console.log(`  ${config.ADMIN_URL}/verify?token=${token}`);
  console.log('\nDisplay URL:');
  console.log(`  http://localhost:4000/?token=${tenant.public_token}`);
}

seed()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => client.end());
