import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, tenants, screens, categories, menu_items } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { limitsFor } from '../lib/plans.js';

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
};

export default meRoutes;
