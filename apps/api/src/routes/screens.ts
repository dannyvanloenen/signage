import type { FastifyPluginAsync } from 'fastify';
import { eq, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { db } from '../db/index.js';
import { screens } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { publishMenuUpdate } from '../lib/events.js';
import { planLimits } from '../lib/plans.js';

const createBody = z.object({
  name: z.string().min(1).max(255),
});

const updateBody = z.object({
  name: z.string().min(1).max(255).optional(),
  theme: z.enum(['dark', 'warm', 'cool', 'minimal']).optional(),
  layout: z.enum(['auto', 'grid', 'center']).optional(),
  font: z.enum(['default', 'serif', 'rounded', 'condensed', 'mono', 'display']).optional(),
  bg_image_path: z.string().max(500).nullable().optional(),
  bg_video_path: z.string().max(500).nullable().optional(),
  ticker_text: z.string().max(500).nullable().optional(),
  category_ids: z.array(z.string().uuid()).nullable().optional(),
});

const newToken = (): string => randomBytes(32).toString('hex');

const screensRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });
    return db.select().from(screens).where(eq(screens.tenant_id, tenantId)).orderBy(asc(screens.sort_order));
  });

  app.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const existing = await db.select({ id: screens.id }).from(screens).where(eq(screens.tenant_id, tenantId));
    const limits = await planLimits(tenantId);
    if (existing.length >= limits.screens) {
      return reply.status(403).send({ error: `Je abonnement staat maximaal ${limits.screens} schermen toe.` });
    }
    const [screen] = await db.insert(screens).values({
      tenant_id: tenantId,
      name: parsed.data.name,
      public_token: newToken(),
      sort_order: existing.length,
    }).returning();
    return reply.status(201).send(screen);
  });

  app.put<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });
    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const [screen] = await db
      .update(screens)
      .set(parsed.data)
      .where(and(eq(screens.id, request.params.id), eq(screens.tenant_id, tenantId)))
      .returning();
    if (!screen) return reply.status(404).send({ error: 'Niet gevonden' });
    void publishMenuUpdate(tenantId);
    return screen;
  });

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });

    const all = await db.select({ id: screens.id }).from(screens).where(eq(screens.tenant_id, tenantId));
    if (all.length <= 1) return reply.status(400).send({ error: 'Het laatste scherm kan niet verwijderd worden' });

    const [deleted] = await db
      .delete(screens)
      .where(and(eq(screens.id, request.params.id), eq(screens.tenant_id, tenantId)))
      .returning();
    if (!deleted) return reply.status(404).send({ error: 'Niet gevonden' });
    return reply.status(204).send();
  });
};

export default screensRoutes;
