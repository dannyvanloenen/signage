import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users, tenants } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';

const bgBody = z.object({ bg_image_path: z.string().max(500).nullable() });
const videoBody = z.object({ bg_video_path: z.string().max(500).nullable() });
const tickerBody = z.object({ ticker_text: z.string().max(500).nullable() });

const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const [user] = await db.select().from(users).where(eq(users.id, request.user.sub)).limit(1);
    if (!user) return reply.status(404).send({ error: 'Gebruiker niet gevonden' });

    let tenant = null;
    if (user.tenant_id) {
      const [t] = await db.select().from(tenants).where(eq(tenants.id, user.tenant_id)).limit(1);
      tenant = t ?? null;
    }

    return { user, tenant };
  });

  app.patch('/background', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });

    const parsed = bgBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const [tenant] = await db
      .update(tenants)
      .set({ bg_image_path: parsed.data.bg_image_path })
      .where(eq(tenants.id, tenantId))
      .returning();

    return tenant;
  });

  app.patch('/video', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });

    const parsed = videoBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const [tenant] = await db
      .update(tenants)
      .set({ bg_video_path: parsed.data.bg_video_path })
      .where(eq(tenants.id, tenantId))
      .returning();

    return tenant;
  });

  app.patch('/ticker', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });

    const parsed = tickerBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const [tenant] = await db
      .update(tenants)
      .set({ ticker_text: parsed.data.ticker_text })
      .where(eq(tenants.id, tenantId))
      .returning();

    return tenant;
  });
};

export default meRoutes;
