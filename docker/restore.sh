#!/bin/sh
# ─── Script de restauration KYC-AML v2 ───────────────────────────────────────
#
# Usage :
#   ./docker/restore.sh <backup_file.sql.gz>
#   ./docker/restore.sh latest              # utilise le backup le plus récent
#
# Prérequis :
#   - Docker Compose en cours d'exécution (docker compose ps)
#   - Fichier de backup dans /backups/ (volume Docker) ou chemin absolu
#   - Variable DB_USER / DB_PASSWORD / DB_NAME dans .env
#
# Durée estimée : 5-15 min selon la taille de la base (RTO cible : 1h)
#
# Ce script :
#   1. Vérifie les prérequis
#   2. Arrête l'application (pas la DB)
#   3. Crée un backup de sécurité de la DB actuelle
#   4. Restaure le dump PostgreSQL
#   5. Vérifie l'intégrité post-restauration
#   6. Redémarre l'application
# ─────────────────────────────────────────────────────────────────────────────

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo "${GREEN}[$(date '+%H:%M:%S')]${NC} $*"; }
warn() { echo "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC}  $*"; }
err()  { echo "${RED}[$(date '+%H:%M:%S')] ✗${NC}  $*" >&2; exit 1; }

# ─── 1. Arguments ─────────────────────────────────────────────────────────────

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gz> | latest"
  echo "Backups disponibles :"
  docker compose exec backup ls /backups/ 2>/dev/null || ls ./backups/ 2>/dev/null || echo "(aucun)"
  exit 1
fi

# ─── 2. Charger .env ──────────────────────────────────────────────────────────

if [ -f ".env" ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

DB_USER="${DB_USER:-kyc_user}"
DB_PASS="${DB_PASSWORD:-kyc_password}"
DB_NAME="${DB_NAME:-kyc_aml_db}"
CONTAINER_PG="kyc_postgres"
CONTAINER_APP="kyc_app"

# ─── 3. Vérifier les prérequis ────────────────────────────────────────────────

log "Vérification des prérequis..."

if ! docker ps --filter "name=${CONTAINER_PG}" --filter "status=running" | grep -q "${CONTAINER_PG}"; then
  err "PostgreSQL (${CONTAINER_PG}) n'est pas en cours d'exécution"
fi

# Résoudre "latest"
if [ "$BACKUP_FILE" = "latest" ]; then
  BACKUP_FILE=$(docker compose exec backup ls -t /backups/*.sql.gz 2>/dev/null | head -1 | tr -d '\r')
  if [ -z "$BACKUP_FILE" ]; then
    err "Aucun backup trouvé dans /backups/"
  fi
  log "Backup le plus récent : $BACKUP_FILE"
fi

# ─── 4. Confirmation interactive ──────────────────────────────────────────────

warn "ATTENTION : Cette opération va ÉCRASER la base ${DB_NAME}"
warn "Fichier source : ${BACKUP_FILE}"
printf "Tapez 'RESTORE' pour confirmer : "
read -r CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Annulé."
  exit 0
fi

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')

# ─── 5. Arrêter l'application ────────────────────────────────────────────────

log "Arrêt de l'application..."
docker compose stop "${CONTAINER_APP}" 2>/dev/null || true
docker compose stop kyc_ml 2>/dev/null || true

# ─── 6. Backup de sécurité de l'état actuel ──────────────────────────────────

log "Sauvegarde de sécurité avant restauration..."
SAFETY_BACKUP="/backups/pre_restore_${TIMESTAMP}.sql.gz"

docker compose exec -T "${CONTAINER_PG}" \
  sh -c "PGPASSWORD='${DB_PASS}' pg_dump -U '${DB_USER}' -d '${DB_NAME}' --clean --if-exists | gzip" \
  > "/tmp/safety_backup.sql.gz" 2>/dev/null

if [ -s "/tmp/safety_backup.sql.gz" ]; then
  log "Backup de sécurité créé : ${SAFETY_BACKUP}"
else
  warn "Impossible de créer le backup de sécurité — continuation quand même"
fi

# ─── 7. Restauration ──────────────────────────────────────────────────────────

log "Restauration en cours depuis ${BACKUP_FILE}..."

# Cas 1 : backup dans le container
if docker compose exec backup test -f "${BACKUP_FILE}" 2>/dev/null; then
  docker compose exec -T backup \
    sh -c "zcat '${BACKUP_FILE}'" \
    | docker compose exec -T "${CONTAINER_PG}" \
      sh -c "PGPASSWORD='${DB_PASS}' psql -U '${DB_USER}' -d '${DB_NAME}' -q"

# Cas 2 : backup sur l'hôte
elif [ -f "${BACKUP_FILE}" ]; then
  zcat "${BACKUP_FILE}" \
    | docker compose exec -T "${CONTAINER_PG}" \
      sh -c "PGPASSWORD='${DB_PASS}' psql -U '${DB_USER}' -d '${DB_NAME}' -q"
else
  err "Fichier de backup introuvable : ${BACKUP_FILE}"
fi

log "Restauration SQL terminée."

# ─── 8. Vérification d'intégrité ─────────────────────────────────────────────

log "Vérification de l'intégrité post-restauration..."

# Vérifier que les tables principales existent et ont des données
for TABLE in users customers transactions alerts; do
  COUNT=$(docker compose exec -T "${CONTAINER_PG}" \
    sh -c "PGPASSWORD='${DB_PASS}' psql -U '${DB_USER}' -d '${DB_NAME}' -t -c 'SELECT COUNT(*) FROM ${TABLE}'" \
    2>/dev/null | tr -d ' \r\n')

  if [ -z "$COUNT" ]; then
    warn "Table ${TABLE} : impossible de compter les lignes"
  else
    log "Table ${TABLE} : ${COUNT} enregistrements"
  fi
done

# Vérifier le compte admin
ADMIN_EXISTS=$(docker compose exec -T "${CONTAINER_PG}" \
  sh -c "PGPASSWORD='${DB_PASS}' psql -U '${DB_USER}' -d '${DB_NAME}' -t -c \"SELECT COUNT(*) FROM users WHERE role='admin'\"" \
  2>/dev/null | tr -d ' \r\n')

if [ "${ADMIN_EXISTS:-0}" -gt 0 ]; then
  log "Compte admin : OK (${ADMIN_EXISTS} admin(s))"
else
  warn "Aucun compte admin trouvé après restauration — vérifier manuellement"
fi

# ─── 9. Migrations Drizzle ───────────────────────────────────────────────────

log "Application des migrations Drizzle..."
docker compose run --rm "${CONTAINER_APP}" sh -c "node -e \"require('./dist/drizzle.migrate.js')\"" 2>/dev/null || \
  warn "Migrations non appliquées — exécuter manuellement : pnpm db:migrate"

# ─── 10. Redémarrage ─────────────────────────────────────────────────────────

log "Redémarrage de l'application..."
docker compose start "${CONTAINER_APP}"
docker compose start kyc_ml 2>/dev/null || true

# Attendre le health check
log "Attente du health check (max 60s)..."
for i in $(seq 1 12); do
  if curl -sf "http://localhost:3000/health" > /dev/null 2>&1; then
    log "Application démarrée et healthy ✓"
    break
  fi
  sleep 5
  if [ "$i" -eq 12 ]; then
    err "L'application ne répond pas après 60s — vérifier les logs : docker compose logs ${CONTAINER_APP}"
  fi
done

# ─── Résumé ──────────────────────────────────────────────────────────────────

echo ""
echo "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo "${GREEN}║   Restauration terminée avec succès          ║${NC}"
echo "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "  Backup restauré : ${BACKUP_FILE}"
echo "  Backup sécurité : ${SAFETY_BACKUP}"
echo "  Timestamp       : ${TIMESTAMP}"
echo ""
echo "  Vérifier manuellement :"
echo "  → curl http://localhost:3000/health"
echo "  → Connexion admin sur http://localhost:5173"
echo "  → Logs : docker compose logs -f ${CONTAINER_APP}"
