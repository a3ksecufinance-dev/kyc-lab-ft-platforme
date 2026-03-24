#!/bin/bash
# ─── KYC-AML v2 — Déploiement initial VPS ────────────────────────────────────
# Usage : bash setup-vps.sh <votre-domaine.com>
# Prérequis : Ubuntu 22.04 / 24.04 LTS, accès root, DNS pointant sur ce VPS
#
# Ce script :
#   1. Installe Docker + Docker Compose
#   2. Installe Nginx + Certbot pour SSL Let's Encrypt
#   3. Configure le répertoire de l'application
#   4. Génère les secrets automatiquement
#   5. Lance les conteneurs

set -euo pipefail

DOMAIN="${1:?Usage: bash setup-vps.sh votre-domaine.com}"
APP_DIR="/opt/kyc-aml-v2"
APP_USER="kyc"

echo "═══════════════════════════════════════════════"
echo "  KYC-AML v2 — Setup VPS pour ${DOMAIN}"
echo "═══════════════════════════════════════════════"

# ─── 1. Mise à jour système ───────────────────────────────────────────────────
echo ""
echo "▶ Mise à jour système..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git ufw

# ─── 2. Docker ────────────────────────────────────────────────────────────────
echo ""
echo "▶ Installation Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# ─── 3. Firewall UFW ─────────────────────────────────────────────────────────
echo ""
echo "▶ Configuration firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ─── 4. Certbot (SSL Let's Encrypt) ──────────────────────────────────────────
echo ""
echo "▶ Installation Certbot..."
apt-get install -y -qq certbot

# Obtenir le certificat (nginx doit être arrêté ou port 80 libre)
certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email "admin@${DOMAIN}" \
  -d "${DOMAIN}" \
  -d "www.${DOMAIN}" || echo "⚠️  Certbot échoué — vérifie que le DNS pointe sur ce VPS"

# Renouvellement automatique
echo "0 3 * * * root certbot renew --quiet --deploy-hook 'docker exec kyc_nginx nginx -s reload'" \
  >> /etc/crontab

# ─── 5. Répertoire application ────────────────────────────────────────────────
echo ""
echo "▶ Création répertoire application..."
mkdir -p "${APP_DIR}"
mkdir -p "${APP_DIR}/docker/postgres"
mkdir -p /backups

# ─── 6. Génération des secrets ────────────────────────────────────────────────
echo ""
echo "▶ Génération des secrets..."
DB_PASSWORD=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 32)
JWT_ACCESS_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)

# ─── 7. Fichier .env ─────────────────────────────────────────────────────────
echo ""
echo "▶ Création du fichier .env..."
cat > "${APP_DIR}/.env" <<EOF
NODE_ENV=production
PORT=3000

DB_USER=kyc_user
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=kyc_aml_db
DB_HOST=postgres
DATABASE_URL=postgresql://kyc_user:${DB_PASSWORD}@postgres:5432/kyc_aml_db

REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

ADMIN_EMAIL=admin@${DOMAIN}
ADMIN_PASSWORD=$(openssl rand -base64 16)!Kyc

DOMAIN=${DOMAIN}
RETENTION_DAYS=30
EOF

chmod 600 "${APP_DIR}/.env"

# ─── 8. Mettre à jour nginx.conf avec le bon domaine ─────────────────────────
echo ""
echo "▶ Configuration nginx pour ${DOMAIN}..."
# (sera écrasé par le vrai nginx.conf du repo lors du clone)
cat > "${APP_DIR}/docker/nginx.conf" <<'NGINX'
# Placeholder — sera remplacé par docker/nginx.conf du repo
NGINX

# ─── 9. Résumé ────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  ✅ VPS configuré pour ${DOMAIN}"
echo ""
echo "  Étapes suivantes :"
echo ""
echo "  1. Cloner le repo dans ${APP_DIR} :"
echo "     cd ${APP_DIR}"
echo "     git clone https://github.com/TON_ORG/kyc-aml-v2.git ."
echo ""
echo "  2. Mettre à jour nginx.conf :"
echo "     sed -i 's/your-domain.com/${DOMAIN}/g' docker/nginx.conf"
echo ""
echo "  3. Lancer les conteneurs :"
echo "     docker compose -f docker/docker-compose.prod.yml up -d"
echo ""
echo "  4. Appliquer les migrations :"
echo "     docker compose -f docker/docker-compose.prod.yml exec app"
echo "       pnpm db:migrate"
echo ""
echo "  5. Seed admin initial :"
echo "     docker compose -f docker/docker-compose.prod.yml exec app"
echo "       pnpm db:seed"
echo ""
echo "  Secrets générés dans : ${APP_DIR}/.env"
echo "  ⚠️  Sauvegarder ces secrets en lieu sûr !"
echo "═══════════════════════════════════════════════"
