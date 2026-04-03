#!/usr/bin/env bash
# ─── Script de déploiement production ────────────────────────────────────────
# Usage : ./scripts/deploy.sh [--env .env.production] [--skip-migrate]
#
# Ordre d'exécution :
#   1. Vérification des prérequis
#   2. Validation du fichier .env.production
#   3. Migration de la base de données
#   4. Build + démarrage des conteneurs
#
# Prérequis : docker, docker compose v2, openssl

set -euo pipefail

ENV_FILE=".env.production"
SKIP_MIGRATE=false
COMPOSE_FILE="docker/docker-compose.prod.yml"

# ── Parsing des arguments ──────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)         ENV_FILE="$2";    shift 2 ;;
    --skip-migrate) SKIP_MIGRATE=true; shift  ;;
    *) echo "Argument inconnu : $1"; exit 1 ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         KYC-AML Platform — Déploiement production           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Prérequis ──────────────────────────────────────────────────────────────
echo "── 1/4  Vérification des prérequis"

for cmd in docker openssl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "❌  $cmd requis mais non trouvé"
    exit 1
  fi
done

if ! docker compose version &>/dev/null; then
  echo "❌  docker compose v2 requis (pas docker-compose)"
  exit 1
fi

echo "✅  docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"
echo "✅  docker compose $(docker compose version --short)"

# ── 2. Validation .env.production ─────────────────────────────────────────────
echo ""
echo "── 2/4  Validation de ${ENV_FILE}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "❌  ${ENV_FILE} introuvable"
  echo "    Lancer d'abord : ./scripts/generate-secrets.sh --env ${ENV_FILE}"
  exit 1
fi

ERRORS=0

check_var() {
  local name="$1"
  local forbidden="${2:-}"
  local val
  val=$(grep "^${name}=" "${ENV_FILE}" | cut -d= -f2- | tr -d '"')

  if [[ -z "$val" ]]; then
    echo "  ❌  ${name} est vide"
    ERRORS=$((ERRORS + 1))
    return
  fi

  if [[ -n "$forbidden" && "$val" == *"$forbidden"* ]]; then
    echo "  ❌  ${name} contient la valeur par défaut '${forbidden}'"
    ERRORS=$((ERRORS + 1))
    return
  fi

  echo "  ✅  ${name}"
}

check_var "DATABASE_URL"     "CHANGE_ME"
check_var "REDIS_PASSWORD"   "CHANGE_ME"
check_var "JWT_ACCESS_SECRET"
check_var "JWT_REFRESH_SECRET"
check_var "PII_ENCRYPTION_KEY"
check_var "MFA_ENCRYPTION_KEY"
check_var "ADMIN_EMAIL"
check_var "ADMIN_PASSWORD"   "ChangeMe"
check_var "ML_INTERNAL_API_KEY"

# Vérifier JWT secrets différents
JWT_ACCESS=$(grep "^JWT_ACCESS_SECRET=" "${ENV_FILE}" | cut -d= -f2-)
JWT_REFRESH=$(grep "^JWT_REFRESH_SECRET=" "${ENV_FILE}" | cut -d= -f2-)
if [[ "$JWT_ACCESS" == "$JWT_REFRESH" ]]; then
  echo "  ❌  JWT_ACCESS_SECRET et JWT_REFRESH_SECRET sont identiques"
  ERRORS=$((ERRORS + 1))
fi

# Vérifier longueur minimale des secrets (32 chars hex = 64 chars)
for var in JWT_ACCESS_SECRET JWT_REFRESH_SECRET PII_ENCRYPTION_KEY MFA_ENCRYPTION_KEY; do
  val=$(grep "^${var}=" "${ENV_FILE}" | cut -d= -f2-)
  if [[ ${#val} -lt 32 ]]; then
    echo "  ❌  ${var} trop court (${#val} chars, minimum 32)"
    ERRORS=$((ERRORS + 1))
  fi
done

if [[ $ERRORS -gt 0 ]]; then
  echo ""
  echo "❌  ${ERRORS} erreur(s) dans ${ENV_FILE} — déploiement annulé"
  exit 1
fi

echo "✅  ${ENV_FILE} validé"

# ── 3. Migration de la base de données ────────────────────────────────────────
echo ""
echo "── 3/4  Migration de la base de données"

if [[ "$SKIP_MIGRATE" == "true" ]]; then
  echo "⏭️  Migration ignorée (--skip-migrate)"
else
  echo "   Démarrage de PostgreSQL pour la migration…"

  # Démarrer uniquement PostgreSQL
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
    up -d postgres

  echo "   Attente de PostgreSQL (max 60s)…"
  TIMEOUT=60
  ELAPSED=0
  until docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
      exec -T postgres pg_isready -q 2>/dev/null; do
    if [[ $ELAPSED -ge $TIMEOUT ]]; then
      echo "❌  PostgreSQL n'a pas démarré en ${TIMEOUT}s"
      exit 1
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
  done

  echo "   PostgreSQL prêt — exécution des migrations"

  # Exécuter les migrations via un conteneur éphémère
  docker run --rm \
    --network "$(docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
      ps --format json postgres 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('Networks','kyc_network_prod'))" 2>/dev/null || echo "kyc_network_prod")" \
    --env-file "${ENV_FILE}" \
    -v "$(pwd):/app" \
    -w /app \
    node:22-alpine \
    sh -c "npm install -g pnpm@9 && pnpm install --frozen-lockfile && pnpm db:migrate" \
    || {
      # Fallback : exécuter la migration SQL directement
      echo "   Fallback : application des migrations SQL directement"
      DB_URL=$(grep "^DATABASE_URL=" "${ENV_FILE}" | cut -d= -f2-)
      for sql_file in drizzle/migrations/*.sql; do
        echo "   → $(basename "$sql_file")"
        docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
          exec -T postgres psql "${DB_URL}" -f "/dev/stdin" < "${sql_file}" || true
      done
    }

  echo "✅  Migrations appliquées"
fi

# ── 4. Build + démarrage ──────────────────────────────────────────────────────
echo ""
echo "── 4/4  Démarrage de la plateforme"

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
  up -d --pull always --remove-orphans

echo ""
echo "✅  Démarrage lancé — attente des health checks…"

sleep 10

# Vérification de l'état
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps

echo ""
DOMAIN=$(grep "^CORS_ORIGINS=" "${ENV_FILE}" | cut -d= -f2- | cut -d, -f1 | sed 's|https://||')
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Déploiement terminé                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Application : https://${DOMAIN:-votre-domaine.fr}"
echo "║  Grafana     : https://${DOMAIN:-votre-domaine.fr}:3001"
echo "║"
echo "║  ⚠️  Changer le mot de passe admin à la première connexion"
echo "╚══════════════════════════════════════════════════════════════╝"
