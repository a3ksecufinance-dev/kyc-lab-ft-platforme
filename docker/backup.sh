#!/bin/sh
# ─── Backup PostgreSQL automatique ───────────────────────────────────────────
# Exécuté par crond dans le conteneur backup (docker-compose.prod.yml)
# Schedule : quotidien à 02:00 UTC (configurer via crontab ou entrypoint)
#
# Variables attendues dans l'environnement :
#   PGPASSWORD   — mot de passe PostgreSQL
#   DB_USER      — utilisateur PostgreSQL (défaut: kyc_user)
#   DB_NAME      — nom de la base (défaut: kyc_aml_db)
#   DB_HOST      — host PostgreSQL (défaut: postgres)
#   RETENTION_DAYS — nb de jours à conserver (défaut: 30)

set -e

DB_USER="${DB_USER:-kyc_user}"
DB_NAME="${DB_NAME:-kyc_aml_db}"
DB_HOST="${DB_HOST:-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="${BACKUP_DIR}/kyc_aml_${TIMESTAMP}.sql.gz"

echo "[$(date -Iseconds)] Démarrage backup → ${FILENAME}"

# Dump compressé
pg_dump \
  -h "${DB_HOST}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  | gzip -9 > "${FILENAME}"

SIZE=$(du -sh "${FILENAME}" | cut -f1)
echo "[$(date -Iseconds)] Backup terminé — ${SIZE}"

# Supprimer les backups plus vieux que RETENTION_DAYS jours
find "${BACKUP_DIR}" -name "kyc_aml_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
REMAINING=$(find "${BACKUP_DIR}" -name "kyc_aml_*.sql.gz" | wc -l)
echo "[$(date -Iseconds)] Rétention ${RETENTION_DAYS}j — ${REMAINING} backup(s) conservé(s)"
