import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users, magic_tokens, tenants, screens } from '../db/schema.js';
import { sendMagicLink } from '../lib/email.js';
import { generateToken } from '../lib/token.js';
import { slugify } from '../lib/slug.js';
import { config } from '../config.js';

const magicLinkBody = z.object({ email: z.string().email() });
const signupBody = z.object({
  email: z.string().email(),
  business_name: z.string().min(2).max(255),
});

const MAGIC_TTL_MS = 15 * 60 * 1000;

async function sendLoginLink(userId: string, email: string): Promise<void> {
  const token = generateToken();
  await db.insert(magic_tokens).values({ token, user_id: userId, expires_at: new Date(Date.now() + MAGIC_TTL_MS) });
  await sendMagicLink(email, `${config.ADMIN_URL}/verify?token=${token}`);
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/magic-link', async (request, reply) => {
    const parsed = magicLinkBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Ongeldig e-mailadres' });

    const { email } = parsed.data;
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (user) await sendLoginLink(user.id, email);

    // Geef altijd hetzelfde antwoord — lekt geen info over bestaand e-mailadres
    return { message: 'Als dit e-mailadres bekend is, ontvang je een inloglink.' };
  });

  // Self-service aanmelding: maakt een tenant + eerste gebruiker (owner) +
  // standaardscherm aan en stuurt direct een inloglink.
  app.post('/signup', async (request, reply) => {
    const parsed = signupBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Vul een geldig e-mailadres en bedrijfsnaam in.' });
    const { email, business_name } = parsed.data;

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      // Bestaat al — geen dubbele tenant; stuur gewoon een inloglink.
      await sendLoginLink(existing.id, email);
      return { message: 'Check je e-mail voor de inloglink.' };
    }

    // Unieke slug afleiden van de bedrijfsnaam.
    let slug = slugify(business_name);
    const [taken] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (taken) slug = `${slug}-${randomBytes(2).toString('hex')}`;

    const [tenant] = await db.insert(tenants).values({
      name: business_name,
      slug,
      public_token: generateToken(),
      plan: 'free',
    }).returning();

    const [user] = await db.insert(users).values({
      email,
      tenant_id: tenant.id,
      role: 'owner',
    }).returning();

    // Standaardscherm dat de tenant-token hergebruikt (consistent met de backfill).
    await db.insert(screens).values({
      tenant_id: tenant.id,
      name: 'Hoofdscherm',
      public_token: tenant.public_token,
    });

    await sendLoginLink(user.id, email);
    return reply.status(201).send({ message: 'Account aangemaakt. Check je e-mail voor de inloglink.' });
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
