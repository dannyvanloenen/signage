# Signage — Digitaal menuboard SaaS

Monorepo met drie apps:

| App | Pad | Poort |
|-----|-----|-------|
| API (Fastify) | `apps/api` | 3000 |
| Admin PWA (SvelteKit) | `apps/admin` | 3001 |
| Display SPA (Vite) | `apps/display` | 4000 |

---

## Vereisten

- Node.js ≥ 22
- pnpm ≥ 9
- Docker (voor PostgreSQL + Redis)

---

## Opstarten

### 1. Afhankelijkheden installeren

```bash
pnpm install
```

### 2. Database en Redis starten

```bash
docker compose -f docker/docker-compose.yml up -d
```

### 3. Omgevingsvariabelen instellen

```bash
cp apps/api/.env.example apps/api/.env
```

Pas `MAGIC_LINK_SECRET` aan naar een willekeurige string van minimaal 16 tekens.

### 4. Migraties uitvoeren

```bash
cd apps/api
pnpm db:migrate
```

### 5. Demodata inladen

```bash
pnpm db:seed
```

De seed maakt een tenant "Demo Snackbar", een gebruiker (`demo@signage.local`),
vier categorieën met items, en print een directe login-URL + display-URL.

Om een ander e-mailadres te gebruiken:

```bash
SEED_EMAIL=jouw@email.nl pnpm db:seed
```

### 6. Alle apps tegelijk starten

```bash
# Vanuit de root
pnpm dev
```

Of elk apart:

```bash
cd apps/api     && pnpm dev   # API op :3000
cd apps/admin   && pnpm dev   # Admin op :3001
cd apps/display && pnpm dev   # Display op :4000
```

---

## Inloggen

De API stuurt magic-link e-mails via Ethereal (geen echte SMTP nodig tijdens ontwikkeling).
De preview-URL verschijnt in de API-terminal na het aanvragen van een link.

Snellere manier tijdens ontwikkeling: gebruik de login-URL die `pnpm db:seed` print.

---

## Display bekijken

Open de URL die de seed print, of bouw hem zelf:

```
http://localhost:4000/?token=<public_token>&theme=dark
```

Beschikbare thema's: `dark` (standaard), `warm`, `cool`, `minimal`

---

## Productie bouwen

```bash
pnpm build
```

---

## Deployen naar VPS (Ubuntu 22.04)

### Eenmalige setup

SSH in op je VPS en voer uit:

```bash
curl -fsSL https://raw.githubusercontent.com/dannyvanloenen/signage/master/scripts/setup-vps.sh \
  | bash -s -- <VPS_IP>
```

Vervang `<VPS_IP>` door het IP-adres van je server (bijv. `1.2.3.4`).

Het script installeert automatisch: Node.js 22, pnpm, PM2, Docker, Nginx, de app zelf, en voert migraties + seed uit.

Na afloop:

| URL | Wat |
|-----|-----|
| `http://<VPS_IP>` | Display scherm |
| `http://<VPS_IP>:3001` | Admin dashboard |
| `http://<VPS_IP>:3000` | API |

### Updaten na een nieuwe push

```bash
ssh gebruiker@<VPS_IP> "bash /var/www/signage/scripts/deploy.sh"
```

### HTTPS toevoegen (later, als je een domeinnaam hebt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d jouwdomein.nl
```

---

## Projectstructuur

```
apps/
  api/
    src/
      db/          – Drizzle schema + migraties
      lib/         – Auth, e-mail, uploads
      routes/      – Fastify route-handlers
    scripts/
      seed.ts      – Demodata
    drizzle/       – SQL-migraties
  admin/
    src/
      routes/      – SvelteKit pagina's (login, verify, dashboard)
      lib/         – API-client, stores
  display/
    src/           – Vanilla TS: main, render, api, socket, style
packages/
  shared/          – Gedeelde TypeScript types
docker/
  docker-compose.yml
```
