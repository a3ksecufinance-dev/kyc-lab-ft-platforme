# Guide de Déploiement Cloud — KYC-AML Platform v2.5
## Livraison SaaS / Cloud Managé

> **Classification :** CONFIDENTIEL — Document remis au client
> **Version plateforme :** 2.5
> **Date :** Avril 2026
> **Contact :** a.bensleten@cyberstrat.ma

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architectures cloud supportées](#2-architectures-cloud-supportées)
3. [Prérequis côté client](#3-prérequis-côté-client)
4. [Variables d'environnement](#4-variables-denvironnement)
5. [Déploiement OCI (Oracle Cloud — Maroc)](#5-déploiement-oci-oracle-cloud--maroc)
6. [Déploiement AWS](#6-déploiement-aws)
7. [Déploiement Azure](#7-déploiement-azure)
8. [Déploiement GCP](#8-déploiement-gcp)
9. [Base de données en cloud](#9-base-de-données-en-cloud)
10. [Réseau, TLS et DNS](#10-réseau-tls-et-dns)
11. [Sauvegarde et reprise](#11-sauvegarde-et-reprise)
12. [Monitoring et alertes](#12-monitoring-et-alertes)
13. [Mise à jour (release)](#13-mise-à-jour-release)
14. [Checklist go-live](#14-checklist-go-live)

---

## 1. Vue d'ensemble

### Architecture applicative

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS 443
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   LOAD BALANCER / CDN                           │
│              TLS termination — certificat géré                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP 3000
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  APPLICATION SERVER (Node.js 20)                │
│   • API tRPC            • Serve React SPA (dist/client)         │
│   • Auth JWT/MFA        • Screening sanctions                   │
│   • Moteur AML          • CBS SDK                               │
└────────┬─────────────────────────────────────────┬─────────────┘
         │                                         │
         ▼                                         ▼
┌─────────────────────┐               ┌────────────────────────┐
│   PostgreSQL 15+    │               │   Redis 7+             │
│   Données clients   │               │   Sessions / cache     │
│   Audit trail       │               │   Listes sanctions     │
│   Chiffrement PII   │               │   Rate limiting        │
└─────────────────────┘               └────────────────────────┘
         │
         ▼
┌─────────────────────┐
│   Object Storage    │
│   Documents KYC     │
│   Rapports PDF      │
└─────────────────────┘
```

### Stack technique

| Composant | Technologie | Version |
|---|---|---|
| Runtime serveur | Node.js | 20 LTS |
| Framework API | tRPC + Express | - |
| Frontend | React 18 + Vite | - |
| Base de données | PostgreSQL | 15+ |
| Cache / Files | Redis | 7+ |
| ORM | Drizzle ORM | - |
| Conteneur | Docker | 24+ |
| Orchestration | Docker Compose ou Kubernetes | - |

---

## 2. Architectures cloud supportées

| Cloud | Région Maroc-proche | Base de données managée | Cache managé | Statut |
|---|---|---|---|---|
| **OCI** | Jeddah (ME-JEDDAH-1) | Autonomous DB PostgreSQL | OCI Cache (Redis) | ✅ Recommandé |
| **AWS** | eu-west-3 (Paris) / ap-south-1 | RDS PostgreSQL | ElastiCache Redis | ✅ Supporté |
| **Azure** | France Central | Azure Database for PostgreSQL | Azure Cache for Redis | ✅ Supporté |
| **GCP** | europe-west9 (Paris) | Cloud SQL PostgreSQL | Memorystore Redis | ✅ Supporté |
| **VPS dédié** | Maroc Telecom DC / Wana DC | PostgreSQL installé | Redis installé | ✅ Supporté |

---

## 3. Prérequis côté client

### Réseau

- Adresse IP publique fixe (pour le Load Balancer)
- Domaine DNS délégué ou sous-domaine (`kyc.votre-domaine.ma`)
- Ports ouverts sortants : `443`, `5432` (PostgreSQL), `6380` (Redis TLS)
- Accès SSH depuis IP de déploiement Cyberstrat

### Accès et comptes

- Accès console cloud avec droits suffisants (IAM)
- Auth Token pour le Container Registry (OCIR / ECR / ACR / GCR)
- Accès au gestionnaire de secrets (Vault / Secrets Manager)
- Email SMTP fonctionnel pour les notifications

### Dimensionnement minimal

| Environnement | CPU | RAM | Disque |
|---|---|---|---|
| **Staging** | 2 vCPU | 4 GB | 50 GB SSD |
| **Production (< 5 000 clients)** | 4 vCPU | 8 GB | 100 GB SSD |
| **Production (5 000–50 000 clients)** | 8 vCPU | 16 GB | 500 GB SSD |
| **Production (> 50 000 clients)** | 16 vCPU | 32 GB | 1 TB SSD + réplication |

---

## 4. Variables d'environnement

Tous les secrets doivent être stockés dans le gestionnaire de secrets du cloud (**jamais en clair dans le repo**).

```ini
# ── Application ─────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://kyc.votre-domaine.ma
CORS_ORIGINS=https://kyc.votre-domaine.ma

# ── Base de données ─────────────────────────────────────────────
DATABASE_URL=postgresql://kyc_user:PASS@<host>:5432/kyc_aml?sslmode=require

# ── Redis ───────────────────────────────────────────────────────
REDIS_URL=rediss://:<token>@<host>:6380

# ── Secrets cryptographiques ────────────────────────────────────
# Générer avec : openssl rand -hex 64
JWT_ACCESS_SECRET=<64-hex-chars>
JWT_REFRESH_SECRET=<64-hex-chars>
# Générer avec : openssl rand -hex 32
MFA_ENCRYPTION_KEY=<32-hex-chars>
PII_ENCRYPTION_KEY=<32-hex-chars>

# ── Email ───────────────────────────────────────────────────────
SMTP_HOST=smtp.votre-domaine.ma
SMTP_PORT=587
SMTP_USER=noreply@votre-domaine.ma
SMTP_PASS=<mot-de-passe-applicatif>
SMTP_FROM=KYC-AML Platform <noreply@votre-domaine.ma>

# ── Stockage documents ──────────────────────────────────────────
STORAGE_BUCKET=kyc-docs-prod

# ── Intégration CBS ─────────────────────────────────────────────
CBS_MODE=mock            # mock | live
# CBS_BASE_URL=https://cbs.votre-banque.ma/api/v2
# CBS_API_KEY=<clé-api>

# ── Paramètres screening ────────────────────────────────────────
SCREENING_MATCH_THRESHOLD=80
SCREENING_REVIEW_THRESHOLD=50
SCREENING_STALE_THRESHOLD_HOURS=48

# ── Institution ─────────────────────────────────────────────────
INSTITUTION_TYPE=CLASSIC_BANK   # CLASSIC_BANK | MICROFINANCE | PAYMENT_INSTITUTION

# ── Rate limiting ───────────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

**Génération des secrets :**
```bash
# Sur votre poste ou Cloud Shell
openssl rand -hex 64   # → JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
openssl rand -hex 32   # → MFA_ENCRYPTION_KEY, PII_ENCRYPTION_KEY
```

> ⚠️ Ces 4 secrets ne doivent **jamais** changer après la mise en production.
> Changer `PII_ENCRYPTION_KEY` rend illisibles toutes les données PII existantes.
> Changer `MFA_ENCRYPTION_KEY` invalide tous les tokens MFA actifs.

---

## 5. Déploiement OCI (Oracle Cloud — Maroc)

### 5.1 Services à provisionner

| Service OCI | Usage | Référence |
|---|---|---|
| Compute VM.Standard.E4.Flex | Serveur applicatif | 4 OCPU / 16 GB |
| Autonomous Database (PostgreSQL) | Base de données | 2 OCPU ECPU |
| OCI Cache with Redis | Cache | 2 GB |
| Load Balancer | TLS + HA | 100 Mbps Flexible |
| Container Registry (OCIR) | Images Docker | Standard |
| Object Storage | Documents KYC | Standard |
| Vault | Secrets | Standard |
| DNS Zones | Domaine | Standard |

### 5.2 Dockerfile

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# Build
FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY sdk/package.json    ./sdk/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Image de production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/drizzle      ./drizzle
EXPOSE 3000
USER node
CMD ["node", "dist/server/index.js"]
```

### 5.3 Procédure de déploiement

```bash
# 1. Authentification OCIR
docker login <region>.ocir.io \
  -u '<namespace>/oracleidentitycloudservice/<email>'
# Mot de passe = Auth Token OCI (IAM → Users → Auth Tokens)

# 2. Build et push de l'image
docker build -t <region>.ocir.io/<namespace>/kyc-aml:v2.5 .
docker push  <region>.ocir.io/<namespace>/kyc-aml:v2.5

# 3. Migration base de données (une seule fois par release)
docker run --rm \
  --env DATABASE_URL="postgresql://..." \
  <region>.ocir.io/<namespace>/kyc-aml:v2.5 \
  node -e "import('./dist/server/scripts/migrate.js')"

# 4. Déploiement sur la VM
ssh opc@<ip-vm>

docker pull <region>.ocir.io/<namespace>/kyc-aml:v2.5

docker stop kyc-aml 2>/dev/null; docker rm kyc-aml 2>/dev/null

docker run -d \
  --name kyc-aml \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file /opt/kyc-aml/.env \
  <region>.ocir.io/<namespace>/kyc-aml:v2.5

# 5. Vérification
curl -s http://localhost:3000/api/health
# → {"status":"ok","db":"connected","redis":"connected"}
```

### 5.4 Load Balancer OCI — Configuration TLS

1. Console OCI → **Networking** → **Load Balancers** → Create
2. Shape : **Flexible**, 10 Mbps–100 Mbps
3. Listener **HTTPS :443** → Backend Set → VM port 3000
4. Listener **HTTP :80** → Redirect Rule → HTTPS 301
5. Certificat SSL : uploader `fullchain.pem` + `privkey.pem` (Let's Encrypt)
6. Health Check : `GET /api/health` → timeout 3s → réponse 200

---

## 6. Déploiement AWS

### Services utilisés
- **ECS Fargate** (conteneurs sans serveur) ou **EC2** (VM classique)
- **RDS PostgreSQL 15** (Multi-AZ pour HA)
- **ElastiCache Redis 7** (cluster mode)
- **ALB** (Application Load Balancer) + ACM (certificat SSL gratuit)
- **ECR** (Container Registry)
- **Secrets Manager** (variables d'environnement)
- **S3** (stockage documents)

### Déploiement rapide ECS

```bash
# 1. Push image ECR
aws ecr get-login-password --region eu-west-3 \
  | docker login --username AWS --password-stdin \
    <account>.dkr.ecr.eu-west-3.amazonaws.com

docker tag  kyc-aml:v2.5 <account>.dkr.ecr.eu-west-3.amazonaws.com/kyc-aml:v2.5
docker push <account>.dkr.ecr.eu-west-3.amazonaws.com/kyc-aml:v2.5

# 2. Créer la Task Definition ECS
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-def.json

# 3. Déployer le service
aws ecs update-service \
  --cluster kyc-aml-prod \
  --service kyc-aml-service \
  --task-definition kyc-aml:1 \
  --force-new-deployment
```

`ecs-task-def.json` (extrait) :
```json
{
  "family": "kyc-aml",
  "cpu": "2048",
  "memory": "4096",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "containerDefinitions": [{
    "name": "kyc-aml",
    "image": "<account>.dkr.ecr.eu-west-3.amazonaws.com/kyc-aml:v2.5",
    "portMappings": [{ "containerPort": 3000 }],
    "secrets": [
      { "name": "DATABASE_URL",      "valueFrom": "arn:aws:secretsmanager:...:DATABASE_URL" },
      { "name": "JWT_ACCESS_SECRET", "valueFrom": "arn:aws:secretsmanager:...:JWT_ACCESS_SECRET" }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": { "awslogs-group": "/ecs/kyc-aml", "awslogs-region": "eu-west-3" }
    }
  }]
}
```

---

## 7. Déploiement Azure

### Services utilisés
- **Azure Container Apps** ou **App Service (Linux)**
- **Azure Database for PostgreSQL Flexible Server**
- **Azure Cache for Redis**
- **Azure Front Door** / Application Gateway (TLS)
- **Azure Container Registry (ACR)**
- **Azure Key Vault** (secrets)
- **Azure Blob Storage** (documents)

```bash
# Login ACR
az acr login --name kycamlprod

# Push image
docker tag  kyc-aml:v2.5 kycamlprod.azurecr.io/kyc-aml:v2.5
docker push kycamlprod.azurecr.io/kyc-aml:v2.5

# Déployer sur Container Apps
az containerapp update \
  --name kyc-aml \
  --resource-group kyc-aml-rg \
  --image kycamlprod.azurecr.io/kyc-aml:v2.5
```

---

## 8. Déploiement GCP

### Services utilisés
- **Cloud Run** (serverless) ou **GKE Autopilot** (Kubernetes)
- **Cloud SQL PostgreSQL 15**
- **Memorystore Redis**
- **Cloud Load Balancing** + Google-managed certificate
- **Artifact Registry** (images Docker)
- **Secret Manager** (variables d'environnement)
- **Cloud Storage** (documents)

```bash
# Push image
gcloud auth configure-docker europe-west9-docker.pkg.dev
docker tag  kyc-aml:v2.5 europe-west9-docker.pkg.dev/<project>/kyc-aml/kyc-aml:v2.5
docker push europe-west9-docker.pkg.dev/<project>/kyc-aml/kyc-aml:v2.5

# Déployer sur Cloud Run
gcloud run deploy kyc-aml \
  --image europe-west9-docker.pkg.dev/<project>/kyc-aml/kyc-aml:v2.5 \
  --region europe-west9 \
  --platform managed \
  --port 3000 \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --allow-unauthenticated
```

---

## 9. Base de données en cloud

### Migration initiale

```bash
# Exécuter les migrations Drizzle (idempotent — safe à relancer)
DATABASE_URL="postgresql://user:pass@host:5432/kyc_aml?sslmode=require" \
  npx drizzle-kit migrate
```

### Paramètres PostgreSQL recommandés

```sql
-- À appliquer sur la base de production
ALTER SYSTEM SET max_connections       = '200';
ALTER SYSTEM SET shared_buffers        = '2GB';
ALTER SYSTEM SET effective_cache_size  = '6GB';
ALTER SYSTEM SET maintenance_work_mem  = '512MB';
ALTER SYSTEM SET checkpoint_completion_target = '0.9';
ALTER SYSTEM SET wal_buffers           = '16MB';
ALTER SYSTEM SET default_statistics_target    = '100';
SELECT pg_reload_conf();
```

### Backup automatique

| Cloud | Service | Rétention recommandée |
|---|---|---|
| OCI | Autonomous DB — Backup automatique | 30 jours |
| AWS | RDS — Automated Backups | 30 jours |
| Azure | Flexible Server — Point-in-time restore | 35 jours |
| GCP | Cloud SQL — Automated Backups | 30 jours |

**RPO cible : 1 heure** — activer les sauvegardes continues (WAL archiving) si disponible.

---

## 10. Réseau, TLS et DNS

### Certificat SSL — Let's Encrypt (si IP publique dédiée)

```bash
# Sur un serveur avec IP publique
sudo apt install certbot

sudo certbot certonly --standalone \
  -d kyc.votre-domaine.ma \
  --email contact@votre-domaine.ma \
  --agree-tos --non-interactive

# Renouvellement automatique
echo "0 3 1 * * root certbot renew --quiet" >> /etc/crontab
```

### Configuration DNS

```
Type    Nom                  TTL    Valeur
A       kyc                  300    <IP Load Balancer>
CNAME   www.kyc              300    kyc.votre-domaine.ma
TXT     @                    3600   "v=spf1 include:votre-smtp ~all"
```

### En-têtes de sécurité HTTP (Nginx)

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options            DENY                               always;
add_header X-Content-Type-Options     nosniff                            always;
add_header X-XSS-Protection           "1; mode=block"                    always;
add_header Referrer-Policy            "strict-origin-when-cross-origin"  always;
add_header Permissions-Policy         "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;" always;
```

---

## 11. Sauvegarde et reprise

### Stratégie 3-2-1

| Copie | Emplacement | Fréquence | Rétention |
|---|---|---|---|
| 1ère | Base de données managée (snapshots auto) | Quotidienne | 30 jours |
| 2ème | Object Storage (export pg_dump) | Quotidienne | 90 jours |
| 3ème | Site secondaire / région différente | Hebdomadaire | 1 an |

### Script de sauvegarde manuelle

```bash
#!/bin/bash
# /opt/kyc-aml/scripts/backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="kyc_aml_backup_${DATE}.sql.gz"

# Dump PostgreSQL compressé
pg_dump "$DATABASE_URL" | gzip > "/tmp/${BACKUP_FILE}"

# Upload vers Object Storage (exemple AWS S3)
aws s3 cp "/tmp/${BACKUP_FILE}" "s3://kyc-backups-prod/${BACKUP_FILE}"

# Nettoyage local
rm "/tmp/${BACKUP_FILE}"

echo "✅ Sauvegarde réalisée : ${BACKUP_FILE}"
```

### Procédure de restauration

```bash
# 1. Identifier la sauvegarde à restaurer
aws s3 ls s3://kyc-backups-prod/ | sort -r | head -10

# 2. Télécharger et restaurer
aws s3 cp s3://kyc-backups-prod/kyc_aml_backup_YYYYMMDD.sql.gz /tmp/
gunzip /tmp/kyc_aml_backup_YYYYMMDD.sql.gz
psql "$DATABASE_URL" < /tmp/kyc_aml_backup_YYYYMMDD.sql

# 3. Relancer l'application
docker restart kyc-aml
```

**RTO cible : 4 heures**

---

## 12. Monitoring et alertes

### Health check endpoint

```
GET https://kyc.votre-domaine.ma/api/health

Réponse 200 :
{
  "status": "ok",
  "db": "connected",
  "redis": "connected",
  "version": "2.5.0",
  "uptime": 86400
}
```

### Métriques à surveiller

| Métrique | Seuil alerte | Seuil critique |
|---|---|---|
| CPU | > 70% pendant 5 min | > 90% pendant 2 min |
| Mémoire RAM | > 75% | > 90% |
| Connexions DB | > 150/200 | > 180/200 |
| Latence API (p95) | > 2s | > 5s |
| Taux d'erreur HTTP 5xx | > 1% | > 5% |
| Espace disque | > 70% | > 85% |

### Alertes recommandées (Uptime Robot / Grafana / OCI Monitoring)

```bash
# Exemple Uptime Robot — vérification toutes les 5 minutes
URL  : https://kyc.votre-domaine.ma/api/health
Type : HTTP(S)
Intervalle : 5 min
Alerte si : statut ≠ 200 pendant 2 checks consécutifs
Contact : a.bensleten@cyberstrat.ma
```

---

## 13. Mise à jour (release)

```bash
# Procédure de mise à jour zero-downtime

# 1. Construire la nouvelle image
docker build -t kyc-aml:v2.6 .

# 2. Pousser vers le registry
docker push <registry>/kyc-aml:v2.6

# 3. Exécuter les migrations (avant le déploiement)
docker run --rm --env-file .env <registry>/kyc-aml:v2.6 \
  node -e "import('./dist/server/scripts/migrate.js')"

# 4. Rolling update (Kubernetes / ECS / Container Apps)
kubectl set image deployment/kyc-aml kyc-aml=<registry>/kyc-aml:v2.6

# OU Docker simple
docker pull <registry>/kyc-aml:v2.6
docker stop kyc-aml && docker rm kyc-aml
docker run -d --name kyc-aml --restart unless-stopped \
  -p 3000:3000 --env-file .env \
  <registry>/kyc-aml:v2.6

# 5. Vérification post-déploiement
curl -s https://kyc.votre-domaine.ma/api/health
```

---

## 14. Checklist go-live

### Sécurité

```
[ ] JWT_ACCESS_SECRET et JWT_REFRESH_SECRET : 64 caractères hex, différents
[ ] MFA_ENCRYPTION_KEY et PII_ENCRYPTION_KEY : 32+ caractères hex, différents
[ ] CORS_ORIGINS = domaine exact (pas de wildcard *)
[ ] FRONTEND_URL = URL HTTPS du domaine final
[ ] NODE_ENV = production
[ ] Tous les secrets stockés dans le Vault cloud (pas dans .env versionné)
[ ] TLS 1.2+ uniquement, TLS 1.0/1.1 désactivés
[ ] En-têtes de sécurité HTTP actifs (HSTS, CSP, X-Frame-Options)
```

### Infrastructure

```
[ ] Health check /api/health → HTTP 200
[ ] Base de données : connexion SSL active (sslmode=require)
[ ] Redis : connexion TLS active (rediss://)
[ ] Sauvegardes automatiques activées (30 jours minimum)
[ ] Monitoring et alertes configurés
[ ] Certificat TLS valide (expiration > 60 jours)
[ ] DNS propagé et accessible depuis plusieurs régions
```

### Application

```
[ ] Migrations Drizzle exécutées : 0 erreur
[ ] Compte admin créé : email@votre-domaine.ma, rôle admin
[ ] MFA activé sur le compte admin
[ ] Institution type configuré (CLASSIC_BANK / MICROFINANCE / PAYMENT_INSTITUTION)
[ ] Test de connexion admin réussi
[ ] Test de screening sanctions : client de test → résultat CLEAR
[ ] Test de création de dossier AML
[ ] Audit trail : logs visibles dans /audit
[ ] Email de notification : test d'envoi réussi
```

### Conformité

```
[ ] Politique de rétention des données configurée
[ ] Accès restreint aux rôles (pas de compte admin partagé)
[ ] Logs d'accès activés (Cloud Logging)
[ ] Procédure de gestion des incidents documentée
[ ] Contact DPO / RSSI désigné
```

---

## Contact & Support

| Canal | Coordonnées |
|---|---|
| Email support | a.bensleten@cyberstrat.ma |
| Site | cyberstrat.ma |
| Urgences production | Inclus dans le contrat de maintenance |
| Documentation | /docs (accessible depuis l'interface admin) |

> **SLA Production :** Disponibilité 99,5% — RTO 4h — RPO 1h
> Voir le Contrat de Prestation de Services (CPS) pour les détails.
