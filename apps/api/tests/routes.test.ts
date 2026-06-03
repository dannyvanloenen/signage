import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { buildApp } from '../src/app';
import { db } from '../src/db/index';
import { tenants, users, categories, screens } from '../src/db/schema';

const TEST_CAT = '__regressietest_cat__';
const TEST_SCREEN = '__regressietest_screen__';

let app: FastifyInstance;
let publicToken: string;
let tenantId: string;
let jwtToken: string;
let catId: string | undefined;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();

  // Gebruik bestaande (geseede) data zodat de tests deterministisch zijn.
  const [t] = await db.select().from(tenants).limit(1);
  if (!t) throw new Error('Geen tenant in de database — draai eerst `pnpm db:seed`.');
  publicToken = t.public_token;
  tenantId = t.id;

  const [u] = await db.select().from(users).where(eq(users.tenant_id, tenantId)).limit(1);
  if (!u) throw new Error('Geen gebruiker voor de tenant gevonden.');
  jwtToken = app.jwt.sign({ sub: u.id, tenantId, role: u.role }, { expiresIn: '1h' });

  const [c] = await db.select().from(categories).where(eq(categories.tenant_id, tenantId)).limit(1);
  catId = c?.id;
});

afterAll(async () => {
  // Ruim test-categorieën en -schermen op en sluit de DB-connectie netjes.
  await db.delete(categories).where(and(eq(categories.tenant_id, tenantId), eq(categories.name, TEST_CAT))).catch(() => {});
  await db.delete(screens).where(and(eq(screens.tenant_id, tenantId), eq(screens.name, TEST_SCREEN))).catch(() => {});
  await app.close();
  await (db.$client as unknown as { end: (o?: unknown) => Promise<void> }).end({ timeout: 5 }).catch(() => {});
});

const auth = () => ({ authorization: `Bearer ${jwtToken}` });

describe('API — health & display', () => {
  it('GET /health geeft 200 en status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('GET /display/:token geeft 404 bij onbekend token', async () => {
    const res = await app.inject({ method: 'GET', url: '/display/onbekend-token-xyz' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /display/:token geeft het juiste payload-formaat incl. text_scale', async () => {
    const res = await app.inject({ method: 'GET', url: `/display/${publicToken}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // tenant-velden die de display gebruikt
    expect(body.tenant).toHaveProperty('bg_video_url');
    expect(body.tenant).toHaveProperty('bg_image_url');
    expect(body.tenant).toHaveProperty('ticker_text');
    // categorieën dragen text_scale (regressie voor de fontschaal-feature)
    expect(Array.isArray(body.categories)).toBe(true);
    for (const c of body.categories) {
      expect(typeof c.text_scale).toBe('number');
    }
  });
});

describe('API — authenticatie', () => {
  it('GET /me zonder token geeft 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /categories zonder token geeft 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/categories' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me met geldig token geeft 200 en de gebruiker', async () => {
    const res = await app.inject({ method: 'GET', url: '/me', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toHaveProperty('id');
  });
});

describe('API — categorie-validatie & CRUD', () => {
  it('GET /categories met token geeft een array', async () => {
    const res = await app.inject({ method: 'GET', url: '/categories', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /categories met ongeldige body geeft 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/categories', headers: auth(), payload: { naam: 'fout' } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /categories maakt een categorie met text_scale 100, daarna DELETE 204', async () => {
    const created = await app.inject({ method: 'POST', url: '/categories', headers: auth(), payload: { name: TEST_CAT } });
    expect(created.statusCode).toBe(201);
    const cat = created.json();
    expect(cat.text_scale).toBe(100);

    const del = await app.inject({ method: 'DELETE', url: `/categories/${cat.id}`, headers: auth() });
    expect(del.statusCode).toBe(204);
  });
});

describe('API — schermen (multi-screen)', () => {
  let screenId: string;
  let screenToken: string;

  it('GET /screens zonder token geeft 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/screens' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /screens met token geeft minstens het Hoofdscherm', async () => {
    const res = await app.inject({ method: 'GET', url: '/screens', headers: auth() });
    expect(res.statusCode).toBe(200);
    const arr = res.json();
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /screens maakt een scherm met token (64 hex) en defaults', async () => {
    const res = await app.inject({ method: 'POST', url: '/screens', headers: auth(), payload: { name: TEST_SCREEN } });
    expect(res.statusCode).toBe(201);
    const s = res.json();
    expect(s.public_token).toMatch(/^[0-9a-f]{64}$/);
    expect(s.theme).toBe('dark');
    expect(s.layout).toBe('auto');
    expect(s.font).toBe('default');
    expect(s.category_ids).toBeNull();
    screenId = s.id;
    screenToken = s.public_token;
  });

  it('PUT /screens/:id zet categorie-selectie + thema', async () => {
    expect(catId).toBeTruthy();
    const res = await app.inject({ method: 'PUT', url: `/screens/${screenId}`, headers: auth(), payload: { category_ids: [catId], theme: 'cool', layout: 'grid' } });
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.theme).toBe('cool');
    expect(s.category_ids).toEqual([catId]);
  });

  it('GET /display/:token toont de scherm-selectie en -config', async () => {
    const res = await app.inject({ method: 'GET', url: `/display/${screenToken}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tenant.theme).toBe('cool');
    expect(body.tenant.layout).toBe('grid');
    expect(body.categories.length).toBe(1);
    expect(body.categories[0].id).toBe(catId);
  });

  it('PUT /screens/:id met ongeldig thema geeft 400', async () => {
    const res = await app.inject({ method: 'PUT', url: `/screens/${screenId}`, headers: auth(), payload: { theme: 'paars' } });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /screens/:id verwijdert het testscherm (204)', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/screens/${screenId}`, headers: auth() });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE van het laatste scherm wordt geweigerd (400)', async () => {
    const list = await app.inject({ method: 'GET', url: '/screens', headers: auth() });
    const arr = list.json();
    expect(arr.length).toBe(1); // alleen het Hoofdscherm resteert
    const res = await app.inject({ method: 'DELETE', url: `/screens/${arr[0].id}`, headers: auth() });
    expect(res.statusCode).toBe(400);
  });
});

describe('API — auth-routes', () => {
  it('POST /auth/magic-link geeft altijd een generieke melding', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/magic-link', payload: { email: 'iemand@voorbeeld.nl' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBeTruthy();
  });

  it('GET /auth/verify/:token geeft 400 bij een ongeldige link', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/verify/ongeldige-token' });
    expect(res.statusCode).toBe(400);
  });
});
