import type { FastifyPluginAsync } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tenants, categories, menu_items } from '../db/schema.js';

const displayRoutes: FastifyPluginAsync = async (app) => {
  // Geen auth — public_token is het toegangsgeheim voor het scherm
  app.get<{ Params: { public_token: string } }>('/:public_token', async (request, reply) => {
    const { public_token } = request.params;

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.public_token, public_token))
      .limit(1);

    if (!tenant) return reply.status(404).send({ error: 'Scherm niet gevonden' });

    const [cats, items] = await Promise.all([
      db.select().from(categories).where(eq(categories.tenant_id, tenant.id)).orderBy(asc(categories.sort_order)),
      db.select().from(menu_items).where(eq(menu_items.tenant_id, tenant.id)).orderBy(asc(menu_items.sort_order)),
    ]);

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        bg_image_url: tenant.bg_image_path ? `/uploads/${tenant.bg_image_path}-1600w.webp` : null,
        bg_video_url: tenant.bg_video_path ? `/uploads/${tenant.bg_video_path}` : null,
        ticker_text: tenant.ticker_text ?? null,
      },
      categories: cats.map((c) => ({
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
