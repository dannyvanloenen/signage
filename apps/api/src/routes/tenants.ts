import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { tenants } from '../db/schema.js';
import { requireAuth, requireAdmin } from '../lib/auth.js';

const createBody = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Alleen kleine letters, cijfers en koppeltekens'),
});

const updateBody = z.object({ name: z.string().min(1).max(255) });

const tenantsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAdmin }, async () => {
    return db.select().from(tenants);
  });

  app.post('/', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const { name, slug } = parsed.data;
    const public_token = randomBytes(16).toString('hex');

    try {
      const [tenant] = await db.insert(tenants).values({ name, slug, public_token }).returning();
      return reply.status(201).send(tenant);
    } catch (err: any) {
      if (err?.code === '23505') return reply.status(409).send({ error: 'Slug bestaat al' });
      throw err;
    }
  });

  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params;
    if (request.user.role !== 'admin' && request.user.tenantId !== id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!tenant) return reply.status(404).send({ error: 'Niet gevonden' });
    return tenant;
  });

  app.put<{ Params: { id: string } }>('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [tenant] = await db.update(tenants).set(parsed.data).where(eq(tenants.id, request.params.id)).returning();
    if (!tenant) return reply.status(404).send({ error: 'Niet gevonden' });
    return tenant;
  });

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const [deleted] = await db.delete(tenants).where(eq(tenants.id, request.params.id)).returning();
    if (!deleted) return reply.status(404).send({ error: 'Niet gevonden' });
    return reply.status(204).send();
  });
};

export default tenantsRoutes;
