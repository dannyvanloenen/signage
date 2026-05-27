#!/usr/bin/env bash
# Redeploy-script — voer uit op de VPS na elke git push
set -euo pipefail
cd /var/www/signage

echo "=== Code ophalen ==="
git pull

echo "=== Dependencies bijwerken ==="
pnpm install

echo "=== Bouwen ==="
pnpm build

echo "=== Migraties uitvoeren ==="
cd apps/api && pnpm db:migrate && cd ../..

echo "=== PM2 herstarten ==="
pm2 reload ecosystem.config.cjs

echo "Klaar."
