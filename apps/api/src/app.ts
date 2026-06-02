import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { resolve } from 'path';
import { sql } from 'drizzle-orm';
import { config } from './config.js';
import { db } from './db/index.js';
import authRoutes from './routes/auth.js';
import tenantsRoutes from './routes/tenants.js';
import categoriesRoutes from './routes/categories.js';
import itemsRoutes from './routes/items.js';
import uploadsRoutes from './routes/uploads.js';
import displayRoutes from './routes/display.js';
import meRoutes from './routes/me.js';
import libraryRoutes from './routes/library.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; tenantId: string | null; role: string };
    user: { sub: string; tenantId: string | null; role: string };
  }
}

/**
 * Bouwt de Fastify-app met alle plugins en routes, maar luistert NIET.
 * Productie (index.ts) voegt socket.io + redis toe en roept listen().
 * Tests gebruiken `app.inject()` zonder netwerk of socket.io.
 */
export async function buildApp({ logger = true }: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: config.MAGIC_LINK_SECRET });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  await app.register(staticPlugin, {
    root: resolve(config.UPLOAD_DIR),
    prefix: '/uploads/',
  });
  await app.register(staticPlugin, {
    root: resolve('./assets/library'),
    prefix: '/library/',
    decorateReply: false,
  });

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(tenantsRoutes, { prefix: '/tenants' });
  await app.register(categoriesRoutes, { prefix: '/categories' });
  await app.register(itemsRoutes, { prefix: '/items' });
  await app.register(uploadsRoutes, { prefix: '/uploads' });
  await app.register(displayRoutes, { prefix: '/display' });
  await app.register(meRoutes, { prefix: '/me' });
  await app.register(libraryRoutes, { prefix: '/library' });

  app.get('/health', async () => {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
