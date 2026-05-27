import './config.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { Server as SocketServer } from 'socket.io';
import { resolve } from 'path';
import { sql, eq } from 'drizzle-orm';
import { config } from './config.js';
import { db } from './db/index.js';
import { tenants } from './db/schema.js';
import { subscriber } from './lib/redis.js';
import authRoutes from './routes/auth.js';
import tenantsRoutes from './routes/tenants.js';
import categoriesRoutes from './routes/categories.js';
import itemsRoutes from './routes/items.js';
import uploadsRoutes from './routes/uploads.js';
import displayRoutes from './routes/display.js';
import meRoutes from './routes/me.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; tenantId: string | null; role: string };
    user: { sub: string; tenantId: string | null; role: string };
  }
}

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(jwt, { secret: config.MAGIC_LINK_SECRET });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
await app.register(staticPlugin, {
  root: resolve(config.UPLOAD_DIR),
  prefix: '/uploads/',
});

await app.register(authRoutes, { prefix: '/auth' });
await app.register(tenantsRoutes, { prefix: '/tenants' });
await app.register(categoriesRoutes, { prefix: '/categories' });
await app.register(itemsRoutes, { prefix: '/items' });
await app.register(uploadsRoutes, { prefix: '/uploads' });
await app.register(displayRoutes, { prefix: '/display' });
await app.register(meRoutes, { prefix: '/me' });

app.get('/health', async () => {
  await db.execute(sql`SELECT 1`);
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// ── Socket.io ──────────────────────────────────────────────────────────────
const io = new SocketServer(app.server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

const displayNs = io.of('/display');

displayNs.on('connection', async (socket) => {
  const public_token = socket.handshake.query.public_token as string | undefined;
  if (!public_token) { socket.disconnect(); return; }

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.public_token, public_token))
    .limit(1);

  if (!tenant) { socket.disconnect(); return; }

  socket.join(`tenant:${tenant.id}`);
  socket.emit('connected', { tenantId: tenant.id });
});

// ── Redis → Socket.io brug ─────────────────────────────────────────────────
subscriber.on('message', (_channel: string, tenantId: string) => {
  displayNs.to(`tenant:${tenantId}`).emit('menu:updated');
});
await subscriber.subscribe('menu:updated');

await app.listen({ port: config.PORT, host: '0.0.0.0' });
