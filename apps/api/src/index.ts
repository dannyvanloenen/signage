import './config.js';
import { Server as SocketServer } from 'socket.io';
import { eq } from 'drizzle-orm';
import { config } from './config.js';
import { db } from './db/index.js';
import { screens } from './db/schema.js';
import { subscriber } from './lib/redis.js';
import { buildApp } from './app.js';

const app = await buildApp();

// ── Socket.io ──────────────────────────────────────────────────────────────
const io = new SocketServer(app.server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

const displayNs = io.of('/display');

displayNs.on('connection', async (socket) => {
  const public_token = socket.handshake.query.public_token as string | undefined;
  if (!public_token) { socket.disconnect(); return; }

  const [screen] = await db
    .select({ tenantId: screens.tenant_id })
    .from(screens)
    .where(eq(screens.public_token, public_token))
    .limit(1);

  if (!screen) { socket.disconnect(); return; }

  socket.join(`tenant:${screen.tenantId}`);
  socket.emit('connected', { tenantId: screen.tenantId });
});

// ── Redis → Socket.io brug ─────────────────────────────────────────────────
subscriber.on('message', (_channel: string, tenantId: string) => {
  displayNs.to(`tenant:${tenantId}`).emit('menu:updated');
});
await subscriber.subscribe('menu:updated');

await app.listen({ port: config.PORT, host: '0.0.0.0' });
