import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users, magic_tokens } from '../db/schema.js';
import { sendMagicLink } from '../lib/email.js';
import { generateToken } from '../lib/token.js';
import { config } from '../config.js';

const magicLinkBody = z.object({ email: z.string().email() });

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/magic-link', async (request, reply) => {
    const parsed = magicLinkBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Ongeldig e-mailadres' });

    const { email } = parsed.data;
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (user) {
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await db.insert(magic_tokens).values({ token, user_id: user.id, expires_at: expiresAt });
      await sendMagicLink(email, `${config.ADMIN_URL}/verify?token=${token}`);
    }

    // Geef altijd hetzelfde antwoord — lekt geen info over bestaand e-mailadres
    return { message: 'Als dit e-mailadres bekend is, ontvang je een inloglink.' };
  });

  app.get<{ Params: { token: string } }>('/verify/:token', async (request, reply) => {
    const { token } = request.params;

    const [row] = await db
      .select()
      .from(magic_tokens)
      .innerJoin(users, eq(magic_tokens.user_id, users.id))
      .where(eq(magic_tokens.token, token))
      .limit(1);

    if (!row) return reply.status(400).send({ error: 'Ongeldige link' });
    if (row.magic_tokens.used_at) return reply.status(400).send({ error: 'Link is al gebruikt' });
    if (row.magic_tokens.expires_at < new Date()) return reply.status(400).send({ error: 'Link is verlopen' });

    await db
      .update(magic_tokens)
      .set({ used_at: new Date() })
      .where(eq(magic_tokens.token, token));

    const jwt = app.jwt.sign(
      { sub: row.users.id, tenantId: row.users.tenant_id, role: row.users.role },
      { expiresIn: '30d' },
    );

    return { token: jwt };
  });
};

export default authRoutes;
