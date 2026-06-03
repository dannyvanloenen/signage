import type { FastifyPluginAsync } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tenants, screens, categories, menu_items } from '../db/schema.js';

const displayRoutes: FastifyPluginAsync = async (app) => {
  // Geen auth — public_token (van een scherm) is het toegangsgeheim.
  app.get<{ Params: { public_token: string } }>('/:public_token', async (request, reply) => {
    const { public_token } = request.params;

    const [screen] = await db
      .select()
      .from(screens)
      .where(eq(screens.public_token, public_token))
      .limit(1);

    if (!screen) return reply.status(404).send({ error: 'Scherm niet gevonden' });

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, screen.tenant_id))
      .limit(1);

    if (!tenant) return reply.status(404).send({ error: 'Scherm niet gevonden' });

    const [cats, items] = await Promise.all([
      db.select().from(categories).where(eq(categories.tenant_id, tenant.id)).orderBy(asc(categories.sort_order)),
      db.select().from(menu_items).where(eq(menu_items.tenant_id, tenant.id)).orderBy(asc(menu_items.sort_order)),
    ]);

    // Selectie + volgorde: category_ids leeg/null = alle categorieën (op sort_order),
    // anders precies de gekozen categorieën in de opgegeven volgorde.
    const selected = screen.category_ids && screen.category_ids.length > 0 ? screen.category_ids : null;
    const orderedCats = selected
      ? selected.map((id) => cats.find((c) => c.id === id)).filter((c): c is (typeof cats)[number] => Boolean(c))
      : cats;

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        bg_image_url: screen.bg_image_path ? `/uploads/${screen.bg_image_path}-1600w.webp` : null,
        bg_video_url: screen.bg_video_path ? `/uploads/${screen.bg_video_path}` : null,
        ticker_text: screen.ticker_text ?? null,
        theme: screen.theme,
        layout: screen.layout,
        font: screen.font,
      },
      categories: orderedCats.map((c) => ({
        id: c.id,
        name: c.name,
        sort_order: c.sort_order,
        text_scale: c.text_scale,
        items: items
          .filter((i) => i.category_id === c.id)
          .map((i) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            price_cents: i.price_cents,
            image_url: i.image_path ? `/uploads/${i.image_path}-800w.webp` : null,
            is_available: i.is_available,
            sort_order: i.sort_order,
          })),
      })),
    };
  });
};

export default displayRoutes;
