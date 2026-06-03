import type { FastifyPluginAsync } from 'fastify';
import { eq, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { categories } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { publishMenuUpdate } from '../lib/events.js';
import { planLimits } from '../lib/plans.js';

const createBody = z.object({
  name: z.string().min(1).max(255),
  sort_order: z.number().int().min(0).default(0),
  text_scale: z.number().int().min(100).max(200).default(100),
});

const updateBody = createBody.partial();

const reorderBody = z.array(z.object({
  id: z.string().uuid(),
  sort_order: z.number().int().min(0),
})).min(1);

const categoriesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });
    return db.select().from(categories).where(eq(categories.tenant_id, tenantId)).orderBy(asc(categories.sort_order));
  });

  app.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const existing = await db.select({ id: categories.id }).from(categories).where(eq(categories.tenant_id, tenantId));
    const limits = await planLimits(tenantId);
    if (existing.length >= limits.categories) {
      return reply.status(403).send({ error: `Je abonnement staat maximaal ${limits.categories} categorieën toe.` });
    }
    const [category] = await db.insert(categories).values({ ...parsed.data, tenant_id: tenantId }).returning();
    void publishMenuUpdate(tenantId);
    return reply.status(201).send(category);
  });

  app.put<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });
    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [category] = await db
      .update(categories)
      .set(parsed.data)
      .where(and(eq(categories.id, request.params.id), eq(categories.tenant_id, tenantId)))
      .returning();
    if (!category) return reply.status(404).send({ error: 'Niet gevonden' });
    void publishMenuUpdate(tenantId);
    return category;
  });

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });
    const [deleted] = await db
      .delete(categories)
      .where(and(eq(categories.id, request.params.id), eq(categories.tenant_id, tenantId)))
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
        db.update(categories).set({ sort_order }).where(and(eq(categories.id, id), eq(categories.tenant_id, tenantId)))
      )
    );
    void publishMenuUpdate(tenantId);
    return { ok: true };
  });
};

export default categoriesRoutes;
