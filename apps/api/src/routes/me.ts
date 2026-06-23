import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users, tenants, screens, categories, menu_items } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { limitsFor } from '../lib/plans.js';

const tenantUpdateBody = z.object({ name: z.string().min(1).max(255) });

const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const [user] = await db.select().from(users).where(eq(users.id, request.user.sub)).limit(1);
    if (!user) return reply.status(404).send({ error: 'Gebruiker niet gevonden' });

    let tenant = null;
    if (user.tenant_id) {
      const [t] = await db.select().from(tenants).where(eq(tenants.id, user.tenant_id)).limit(1);
      tenant = t ?? null;
    }

    if (!tenant) return { user, tenant: null, limits: null, usage: null };

    const limits = limitsFor(tenant.plan);
    const [sc, ca, it] = await Promise.all([
      db.select({ id: screens.id }).from(screens).where(eq(screens.tenant_id, tenant.id)),
      db.select({ id: categories.id }).from(categories).where(eq(categories.tenant_id, tenant.id)),
      db.select({ id: menu_items.id }).from(menu_items).where(eq(menu_items.tenant_id, tenant.id)),
    ]);
    const usage = { screens: sc.length, categories: ca.length, items: it.length };

    return { user, tenant, limits, usage };
  });

  // Eigen bedrijfsnaam (shoptitel) wijzigen — alleen voor de eigen tenant.
  app.put('/tenant', { preHandler: requireAuth }, async (request, reply) => {
    const { tenantId, role } = request.user;
    if (!tenantId) return reply.status(403).send({ error: 'Geen tenant gekoppeld' });
    if (role !== 'owner' && role !== 'admin') return reply.status(403).send({ error: 'Geen rechten om de naam te wijzigen' });

    const parsed = tenantUpdateBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Vul een geldige naam in (1–255 tekens).' });

    const [tenant] = await db.update(tenants).set({ name: parsed.data.name }).where(eq(tenants.id, tenantId)).returning();
    if (!tenant) return reply.status(404).send({ error: 'Niet gevonden' });
    return tenant;
  });
};

export default meRoutes;
