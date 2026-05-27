import type { FastifyPluginAsync } from 'fastify';
import { eq, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { menu_items, categories } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { publishMenuUpdate } from '../lib/events.js';

const createBody = z.object({
  category_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(500).nullish(),
  price_cents: z.number().int().min(0).max(9999999),
  image_path: z.string().max(500).nullish(),
  is_available: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
});

const updateBody = createBody.partial();

const reorderBody = z.array(z.object({
  id: z.string().uuid(),
  sort_order: z.number().int().min(0),
})).min(1);

const availabilityBody = z.object({ is_available: z.boolean() });

const querySchema = z.object({ category_id: z.string().uuid().optional() });

function toItemResponse(item: typeof menu_items.$inferSelect) {
  return {
    ...item,
    image_url: item.image_path ? `/uploads/${item.image_path}-800w.webp` : null,
  };
}

const itemsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });

    const q = querySchema.safeParse(request.query);
    const conditions = [eq(menu_items.tenant_id, tenantId)];
    if (q.success && q.data.category_id) {
      conditions.push(eq(menu_items.category_id, q.data.category_id));
    }

    const items = await db
      .select()
      .from(menu_items)
      .where(and(...conditions))
      .orderBy(asc(menu_items.sort_order));

    return items.map(toItemResponse);
  });

  app.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });

    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const [cat] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, parsed.data.category_id), eq(categories.tenant_id, tenantId)))
      .limit(1);
    if (!cat) return reply.status(400).send({ error: 'Categorie niet gevonden' });

    const [item] = await db.insert(menu_items).values({ ...parsed.data, tenant_id: tenantId }).returning();
    void publishMenuUpdate(tenantId);
    return reply.status(201).send(toItemResponse(item));
  });

  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });
    const [item] = await db
      .select()
      .from(menu_items)
      .where(and(eq(menu_items.id, request.params.id), eq(menu_items.tenant_id, tenantId)))
      .limit(1);
    if (!item) return reply.status(404).send({ error: 'Niet gevonden' });
    return toItemResponse(item);
  });

  app.put<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });

    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    if (parsed.data.category_id) {
      const [cat] = await db
        .select()
        .from(categories)
        .where(and(eq(categories.id, parsed.data.category_id), eq(categories.tenant_id, tenantId)))
        .limit(1);
      if (!cat) return reply.status(400).send({ error: 'Categorie niet gevonden' });
    }

    const [item] = await db
      .update(menu_items)
      .set(parsed.data)
      .where(and(eq(menu_items.id, request.params.id), eq(menu_items.tenant_id, tenantId)))
      .returning();
    if (!item) return reply.status(404).send({ error: 'Niet gevonden' });
    void publishMenuUpdate(tenantId);
    return toItemResponse(item);
  });

  app.patch<{ Params: { id: string } }>('/:id/availability', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });

    const parsed = availabilityBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const [item] = await db
      .update(menu_items)
      .set({ is_available: parsed.data.is_available })
      .where(and(eq(menu_items.id, request.params.id), eq(menu_items.tenant_id, tenantId)))
      .returning();
    if (!item) return reply.status(404).send({ error: 'Niet gevonden' });
    void publishMenuUpdate(tenantId);
    return toItemResponse(item);
  });

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });
    const [deleted] = await db
      .delete(menu_items)
      .where(and(eq(menu_items.id, request.params.id), eq(menu_items.tenant_id, tenantId)))
      .returning();
    if (!deleted) return reply.status(404).send({ error: 'Niet gevonden' });
    void publishMenuUpdate(tenantId);
    return reply.status(204).send();
  });

  app.patch('/reorder', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });
    const parsed = reorderBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    await Promise.all(
      parsed.data.map(({ id, sort_order }) =>
        db.update(menu_items).set({ sort_order }).where(and(eq(menu_items.id, id), eq(menu_items.tenant_id, tenantId)))
      )
    );
    void publishMenuUpdate(tenantId);
    return { ok: true };
  });
};

export default itemsRoutes;
