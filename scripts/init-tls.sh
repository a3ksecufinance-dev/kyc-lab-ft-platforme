#!/usr/bin/env bash
# ─── Provisionnement initial du certificat TLS (Let's Encrypt) ───────────────
# Usage : ./scripts/init-tls.sh --domain kyc.votre-domaine.fr --email admin@votre-domaine.fr
#
# Ce script :
#   1. Génère nginx.conf à partir du template avec le domaine fourni
#   2. Démarre Nginx en HTTP pour le challenge ACME
#   3. Obtient le certificat via Certbot
#   4. Redémarre Nginx en HTTPS
#
# Prérequis : docker, docker compose v2
# À exécuter UNE SEULE FOIS sur le serveur de production.

set -euo pipefail

DOMAIN=""
EMAIL=""
STAGING=false     # true pour tester sans rate-limit Let's Encrypt
COMPOSE_FILE="docker/docker-compose.prod.yml"
ENV_FILE=".env.production"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)  DOMAIN="$2";  shift 2 ;;
    --email)   EMAIL="$2";   shift 2 ;;
    --staging) STAGING=true; shift   ;;
    *) echo "Argument inconnu : $1"; exit 1 ;;
  esac
done

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage : $0 --domain kyc.votre-domaine.fr --email admin@votre-domaine.fr [--staging]"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║            Provisionnement TLS — Let's Encrypt               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo "   Domaine : ${DOMAIN}"
echo "   Email   : ${EMAIL}"
[[ "$STAGING" == "true" ]] && echo "   Mode    : STAGING (certificat de test)"
echo ""

# ── 1. Générer nginx.conf depuis le template ──────────────────────────────────
echo "── 1/4  Génération nginx.conf pour ${DOMAIN}"

if [[ ! -f "docker/nginx.conf.template" ]]; then
  echo "❌  docker/nginx.conf.template introuvable"
  exit 1
fi

DOMAIN="${DOMAIN}" envsubst '${DOMAIN}' < docker/nginx.conf.template > docker/nginx.conf
echo "✅  docker/nginx.conf généré"

# ── 2. Démarrer Nginx HTTP (sans SSL pour le challenge) ───────────────────────
echo ""
echo "── 2/4  Démarrage Nginx HTTP (challenge ACME)"

# Créer une config nginx temporaire HTTP-only pour le challenge
cat > /tmp/nginx-acme.conf <<NGINX_EOF
user nginx;
worker_processes 1;
events { worker_connections 64; }
http {
  server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ {
      root /var/www/certbot;
    }
    location / {
      return 200 'kyc-aml certbot challenge';
      add_header Content-Type text/plain;
    }
  }
}
NGINX_EOF

# Démarrer un Nginx temporaire
docker run -d --name kyc_nginx_acme \
  -p 80:80 \
  -v /tmp/nginx-acme.conf:/etc/nginx/nginx.conf:ro \
  -v kyc_certbot_www:/var/www/certbot \
  nginx:alpine

echo "✅  Nginx HTTP démarré (port 80)"

# ── 3. Obtenir le certificat ──────────────────────────────────────────────────
echo ""
echo "── 3/4  Obtention du certificat Let's Encrypt"

STAGING_FLAG=""
[[ "$STAGING" == "true" ]] && STAGING_FLAG="--staging"

docker run --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v kyc_certbot_www:/var/www/certbot \
  certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    ${STAGING_FLAG} \
    -d "${DOMAIN}"

echo "✅  Certificat obtenu : /etc/letsencrypt/live/${DOMAIN}/"

# Arrêter le Nginx temporaire
docker stop kyc_nginx_acme && docker rm kyc_nginx_acme

# ── 4. Démarrer Nginx HTTPS ───────────────────────────────────────────────────
echo ""
echo "── 4/4  Démarrage Nginx HTTPS"

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
  up -d nginx

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    TLS configuré ✅                          ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  URL     : https://${DOMAIN}"
echo "║  Cert    : /etc/letsencrypt/live/${DOMAIN}/"
echo "║  Expire  : 90 jours (renouvellement automatique)"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📋  Renouvellement automatique — ajouter au crontab du serveur :"
echo "    0 3 * * * docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v kyc_certbot_www:/var/www/certbot certbot/certbot renew --quiet && docker compose -f $(pwd)/${COMPOSE_FILE} --env-file $(pwd)/${ENV_FILE} exec nginx nginx -s reload"
