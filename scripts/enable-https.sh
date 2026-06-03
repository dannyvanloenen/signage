#!/usr/bin/env bash
# HTTPS + domein inschakelen op een reeds via setup-vps.sh opgezette VPS.
#
# Gebruik:  bash scripts/enable-https.sh <domein> <email>
# Voorbeeld: bash scripts/enable-https.sh menuboard.nl jij@voorbeeld.nl
#
# Vereist (DNS) — drie A-records die naar het IP van je VPS wijzen:
#   menuboard.nl         -> <VPS_IP>     (display)
#   admin.menuboard.nl   -> <VPS_IP>     (admin dashboard)
#   api.menuboard.nl     -> <VPS_IP>     (API)
set -euo pipefail

DOMAIN="${1:?Gebruik: bash scripts/enable-https.sh <domein> <email>}"
EMAIL="${2:?Geef een e-mailadres op voor de TLS-certificaten}"
APP_DIR="/var/www/signage"

cd "$APP_DIR"

echo "=== certbot installeren ==="
sudo apt-get update -y
sudo apt-get install -y certbot python3-certbot-nginx

echo "=== Omgevingsvariabelen bijwerken naar https://${DOMAIN} ==="
# API: pas alleen de URL-regels aan, behoud MAGIC_LINK_SECRET e.d.
sed -i "s#^BASE_URL=.*#BASE_URL=https://api.${DOMAIN}#"   apps/api/.env
sed -i "s#^ADMIN_URL=.*#ADMIN_URL=https://admin.${DOMAIN}#" apps/api/.env

cat > apps/admin/.env <<EOF
VITE_API_URL=https://api.${DOMAIN}
VITE_DISPLAY_URL=https://${DOMAIN}
EOF

cat > apps/display/.env <<EOF
VITE_API_URL=https://api.${DOMAIN}
EOF

echo "=== Frontends opnieuw bouwen (VITE-URLs worden bij build vastgelegd) ==="
pnpm build

echo "=== Nginx configureren (display + admin. + api.) ==="
sudo tee /etc/nginx/sites-available/signage > /dev/null <<'NGINX'
# Display (statische SPA) op het hoofddomein
server {
    listen 80;
    server_name __DOMAIN__;
    client_max_body_size 55M;

    root /var/www/signage/apps/display/dist;
    index index.html;

    location / { try_files $uri /index.html; }

    location /uploads/ {
        alias /var/www/signage/apps/api/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}

# Admin dashboard (SvelteKit node-server op :3001)
server {
    listen 80;
    server_name admin.__DOMAIN__;
    client_max_body_size 55M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# API + socket.io (Fastify op :3000)
server {
    listen 80;
    server_name api.__DOMAIN__;
    client_max_body_size 55M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

# Vul het domein in (de heredoc liet nginx-variabelen ongemoeid)
sudo sed -i "s/__DOMAIN__/${DOMAIN}/g" /etc/nginx/sites-available/signage
sudo ln -sf /etc/nginx/sites-available/signage /etc/nginx/sites-enabled/signage
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "=== Admin herstarten (nieuwe build) ==="
pm2 reload ecosystem.config.cjs

echo "=== TLS-certificaten aanvragen (Lets Encrypt) ==="
sudo certbot --nginx --non-interactive --agree-tos -m "${EMAIL}" --redirect \
  -d "${DOMAIN}" -d "admin.${DOMAIN}" -d "api.${DOMAIN}"

echo ""
echo "======================================"
echo "  HTTPS actief!"
echo "  Display: https://${DOMAIN}"
echo "  Admin:   https://admin.${DOMAIN}"
echo "  API:     https://api.${DOMAIN}"
echo "  certbot vernieuwt de certificaten automatisch."
echo "======================================"
