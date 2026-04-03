#!/usr/bin/env bash
# ─── Génération des secrets de production ────────────────────────────────────
# Usage : ./scripts/generate-secrets.sh [--env .env.production]
#
# Génère tous les secrets cryptographiques nécessaires à la prod
# et les écrit dans un fichier .env.production (sans écraser le .env dev).
#
# Prérequis : openssl

set -euo pipefail

TARGET="${1:-.env.production}"

if ! command -v openssl &>/dev/null; then
  echo "❌  openssl requis (brew install openssl)"
  exit 1
fi

gen32()  { openssl rand -hex 32; }  # 256 bits — JWT, WEBHOOK
gen64()  { openssl rand -hex 64; }  # 512 bits — JWT refresh

echo "🔑  Génération des secrets de production → ${TARGET}"
echo ""

# Lire le .env existant pour conserver les valeurs non-secrets
if [[ ! -f .env ]]; then
  echo "❌  .env introuvable (lancer depuis la racine du projet)"
  exit 1
fi

# Extraire les valeurs non-secrets depuis .env
db_url=$(grep "^DATABASE_URL=" .env | cut -d= -f2-)
redis_url=$(grep "^REDIS_URL=" .env | cut -d= -f2-)
redis_pw=$(grep "^REDIS_PASSWORD=" .env | cut -d= -f2-)
admin_email=$(grep "^ADMIN_EMAIL=" .env | cut -d= -f2-)
ml_url=$(grep "^ML_SERVICE_URL=" .env | cut -d= -f2-)
cors=$(grep "^CORS_ORIGINS=" .env | cut -d= -f2-)
org_name=$(grep "^ORG_NAME=" .env | cut -d= -f2-)
org_email=$(grep "^ORG_EMAIL=" .env | cut -d= -f2-)
tracfin_id=$(grep "^TRACFIN_ENTITY_ID=" .env | cut -d= -f2-)

# Générer les secrets
JWT_ACCESS_SECRET=$(gen32)
JWT_REFRESH_SECRET=$(gen32)
MFA_ENCRYPTION_KEY=$(gen32)
PII_ENCRYPTION_KEY=$(gen32)
ML_INTERNAL_API_KEY=$(gen32)
WEBHOOK_SECRET=$(gen32)
ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '=+/' | head -c 20)Aa1!"

echo "✅  JWT_ACCESS_SECRET      : ${JWT_ACCESS_SECRET:0:16}… (${#JWT_ACCESS_SECRET} chars)"
echo "✅  JWT_REFRESH_SECRET     : ${JWT_REFRESH_SECRET:0:16}… (${#JWT_REFRESH_SECRET} chars)"
echo "✅  PII_ENCRYPTION_KEY     : ${PII_ENCRYPTION_KEY:0:16}… (AES-256-GCM activé)"
echo "✅  MFA_ENCRYPTION_KEY     : ${MFA_ENCRYPTION_KEY:0:16}…"
echo "✅  ML_INTERNAL_API_KEY    : ${ML_INTERNAL_API_KEY:0:16}…"
echo "✅  WEBHOOK_SECRET         : ${WEBHOOK_SECRET:0:16}…"
echo "✅  ADMIN_PASSWORD         : généré (voir ${TARGET})"
echo ""

cat > "${TARGET}" <<EOF
# ─── KYC-AML Platform — Production secrets ───────────────────────────────────
# Généré automatiquement le $(date -Iseconds)
# ⚠️  Ne jamais committer ce fichier — s'assurer qu'il est dans .gitignore
# ─────────────────────────────────────────────────────────────────────────────

NODE_ENV=production
PORT=3000

# ─── Base de données ──────────────────────────────────────────────────────────
# Remplacer par l'URL de connexion prod (RDS, Supabase, Neon…)
DATABASE_URL=${db_url:-postgresql://kyc_user:CHANGE_ME@postgres:5432/kyc_aml_db}

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_URL=${redis_url:-redis://redis:6379}
REDIS_PASSWORD=${redis_pw:-CHANGE_ME}

# ─── JWT ─────────────────────────────────────────────────────────────────────
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ─── Compte admin initial ─────────────────────────────────────────────────────
# Changer immédiatement après le premier démarrage
ADMIN_EMAIL=${admin_email:-admin@votre-domaine.fr}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_NAME=Administrateur

# ─── Chiffrement PII (AES-256-GCM) ───────────────────────────────────────────
# OBLIGATOIRE en production — données clients chiffrées au repos
PII_ENCRYPTION_KEY=${PII_ENCRYPTION_KEY}

# ─── MFA TOTP ────────────────────────────────────────────────────────────────
MFA_ENCRYPTION_KEY=${MFA_ENCRYPTION_KEY}

# ─── ML Service ──────────────────────────────────────────────────────────────
ML_SERVICE_URL=${ml_url:-http://ml:8000}
ML_INTERNAL_API_KEY=${ML_INTERNAL_API_KEY}
ML_RETRAIN_AUTO=true
ML_RETRAIN_CRON=0 3 * * 0
ML_RETRAIN_DAYS_HISTORY=180

# ─── Webhook ─────────────────────────────────────────────────────────────────
WEBHOOK_SECRET=${WEBHOOK_SECRET}

# ─── Screening — listes sanctions ────────────────────────────────────────────
OFAC_SDN_URL=https://www.treasury.gov/ofac/downloads/sdn.xml
EU_SANCTIONS_URL=https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content
UN_SANCTIONS_URL=https://scsanctions.un.org/resources/xml/en/consolidated.xml
UK_SANCTIONS_URL=https://assets.publishing.service.gov.uk/media/uk-sanctions-list.xml
PEP_LIST_URL=https://data.opensanctions.org/datasets/latest/peps/targets.simple.csv
BAM_SANCTIONS_URL=
SCREENING_STALE_THRESHOLD_HOURS=36
SCREENING_MATCH_THRESHOLD=80
SCREENING_REVIEW_THRESHOLD=50
SCREENING_AUTO_UPDATE=true
SCREENING_UPDATE_CRON=0 2 * * *

# ─── Règles AML ───────────────────────────────────────────────────────────────
AML_THRESHOLD_SINGLE_TX=10000
AML_THRESHOLD_STRUCTURING=3000
AML_STRUCTURING_WINDOW_HOURS=24
AML_FREQUENCY_THRESHOLD=10
AML_VOLUME_VARIATION_THRESHOLD=300

# ─── TRACFIN / Télédéclaration ───────────────────────────────────────────────
TRANSMISSION_MODE=SIMULATION
TRACFIN_ENTITY_ID=${tracfin_id:-TR-2024-VOTRE-ID}
ORG_NAME=${org_name:-Votre Banque SA}
ORG_ADDRESS=1 Rue de la Compliance
ORG_CITY=Paris
ORG_POSTAL_CODE=75001
ORG_COUNTRY=FR
ORG_PHONE=+33100000000
ORG_EMAIL=${org_email:-compliance@votre-banque.fr}

# ─── eKYC Provider ───────────────────────────────────────────────────────────
# Passer à "onfido" ou "sumsub" en production réelle
EKYC_PROVIDER=local
# ONFIDO_API_TOKEN=
# SUMSUB_APP_TOKEN=
# SUMSUB_SECRET_KEY=

# ─── Stockage documents ───────────────────────────────────────────────────────
STORAGE_BACKEND=local
UPLOAD_DIR=./uploads
UPLOAD_MAX_SIZE_MB=10
# Pour S3/MinIO : STORAGE_BACKEND=s3 + variables S3_* ci-dessous
# S3_BUCKET=kyc-documents
# S3_REGION=eu-west-1
# S3_ENDPOINT=
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=

# ─── HashiCorp Vault (recommandé en prod) ────────────────────────────────────
# Décommenter pour activer — sinon les secrets ENV ci-dessus sont utilisés
# VAULT_ADDR=https://vault.votre-domaine.fr
# VAULT_TOKEN=hvs.XXXXXXXXXXXX
# VAULT_PATH=secret/data/kyc-aml

# ─── Rate limiting ────────────────────────────────────────────────────────────
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_SECONDS=60

# ─── CORS ─────────────────────────────────────────────────────────────────────
# Remplacer par votre domaine réel
CORS_ORIGINS=https://kyc.votre-domaine.fr

# ─── Logs ─────────────────────────────────────────────────────────────────────
LOG_LEVEL=info
LOG_FORMAT=json
EOF

chmod 600 "${TARGET}"

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "✅  ${TARGET} créé avec permissions 600 (lecture owner seulement)"
echo ""
echo "📋  CHECKLIST avant démarrage :"
echo "  1. Vérifier DATABASE_URL pointe sur la base prod"
echo "  2. Vérifier REDIS_PASSWORD non vide"
echo "  3. Changer ADMIN_EMAIL pour l'email de l'administrateur réel"
echo "  4. Renseigner TRACFIN_ENTITY_ID (fourni par TRACFIN)"
echo "  5. Renseigner ORG_NAME, ORG_EMAIL, ORG_ADDRESS"
echo "  6. Passer TRANSMISSION_MODE=TRACFIN_PORTAL quand prêt"
echo "  7. Activer eKYC provider réel (Onfido/SumSub)"
echo "───────────────────────────────────────────────────────────────"
