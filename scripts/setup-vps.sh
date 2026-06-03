#!/usr/bin/env bash
# Eenmalig setup-script voor Ubuntu 22.04 VPS
# Gebruik: bash scripts/setup-vps.sh <VPS_IP>
set -euo pipefail

VPS_IP="${1:?Gebruik: bash scripts/setup-vps.sh <VPS_IP>}"

echo "=== Node.js 22 installeren ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "=== pnpm + pm2 installeren ==="
# pnpm op v9 pinnen: v10+ blokkeert build-scripts (esbuild/sharp) standaard.
sudo npm install -g pnpm@9 pm2

echo "=== Docker installeren (als nog niet aanwezig) ==="
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "  Docker geïnstalleerd. Log opnieuw in zodat de docker-groep actief is."
fi

echo "=== Nginx installeren ==="
sudo apt-get install -y nginx

echo "=== Repo clonen of bijwerken ==="
if [ -d /var/www/signage/.git ]; then
  cd /var/www/signage && git pull
else
  sudo mkdir -p /var/www/signage
  sudo chown "$USER":"$USER" /var/www/signage
  git clone https://github.com/dannyvanloenen/signage.git /var/www/signage
  cd /var/www/signage
fi

echo "=== .env bestanden aanmaken (bestaande worden behouden) ==="
if [ ! -f apps/api/.env ]; then
  cat > apps/api/.env <<EOF
DATABASE_URL=postgres://signage:signage@localhost:5432/signage
REDIS_URL=redis://localhost:6379
PORT=3000
BASE_URL=http://${VPS_IP}:3000
ADMIN_URL=http://${VPS_IP}:3001
MAGIC_LINK_SECRET=$(openssl rand -hex 32)
UPLOAD_DIR=./uploads
EOF
fi

if [ ! -f apps/admin/.env ]; then
  cat > apps/admin/.env <<EOF
VITE_API_URL=http://${VPS_IP}:3000
VITE_DISPLAY_URL=http://${VPS_IP}
EOF
fi

if [ ! -f apps/display/.env ]; then
  cat > apps/display/.env <<EOF
VITE_API_URL=http://${VPS_IP}:3000
EOF
fi

echo "=== Database + Redis starten ==="
docker compose -f docker/docker-compose.yml up -d
echo "  Wachten op database..."
sleep 5

echo "=== Dependencies installeren + bouwen ==="
pnpm install
pnpm build

echo "=== Migraties + seed + schermen-backfill uitvoeren ==="
cd apps/api
pnpm db:migrate
pnpm db:seed
pnpm tsx scripts/backfill-screens.ts
cd ../..

echo "=== Nginx configureren ==="
sudo tee /etc/nginx/sites-available/signage > /dev/null <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 55M;

    # Display SPA (statische bestanden)
    root /var/www/signage/apps/display/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    # Uploads (grote bestanden direct via nginx)
    location /uploads/ {
        alias /var/www/signage/apps/api/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/signage /etc/nginx/sites-enabled/signage
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "=== PM2 starten ==="
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup | tail -1 | sudo bash

echo ""
echo "======================================"
echo "  Deploy klaar!"
echo "  Display: http://${VPS_IP}"
echo "  Admin:   http://${VPS_IP}:3001"
echo "  API:     http://${VPS_IP}:3000"
echo "  Login-URL staat hierboven in de seed-output."
echo "======================================"
