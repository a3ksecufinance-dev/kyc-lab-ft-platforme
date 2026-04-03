# Documentation Technique — Déploiement en Production
## Plateforme KYC/AML RegTech — v2.0.0

> **Classification :** CONFIDENTIEL — Usage interne compliance uniquement
> **Dernière mise à jour :** 2026-03-29
> **Version plateforme :** 2.0.0
> **Statut :** Production-ready

---

## Table des matières

1. [Architecture Globale](#1-architecture-globale)
2. [Prérequis Serveur](#2-prérequis-serveur)
3. [Variables d'Environnement](#3-variables-denvironnement)
4. [Infrastructure Docker](#4-infrastructure-docker)
5. [Intégration CBS (Core Banking System)](#5-intégration-cbs-core-banking-system)
6. [Systèmes Connectés](#6-systèmes-connectés)
7. [Procédure de Déploiement Initial (VPS)](#7-procédure-de-déploiement-initial-vps)
8. [Pipeline CI/CD](#8-pipeline-cicd)
9. [Procédures Opérationnelles](#9-procédures-opérationnelles)
10. [Sécurité Production](#10-sécurité-production)
11. [Accès Initial Admin](#11-accès-initial-admin)
12. [Architecture des Modules Métier](#12-architecture-des-modules-métier)
13. [Support et Contact](#13-support-et-contact)

---

## 1. Architecture Globale

### 1.1 Diagramme d'architecture

```
                        INTERNET
                           │
                    ┌──────▼──────┐
                    │   Nginx     │  Ports 80/443 (HTTPS)
                    │  + Certbot  │  TLS 1.2/1.3, HSTS
                    │  (Alpine)   │  Rate limiting: API 100r/m
                    └──────┬──────┘       Auth 10r/m
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     /trpc/*│       /health│      /metrics│
     /uploads
            │
    ┌────────▼─────────────────────────────────────────┐
    │              Application Node.js 22               │
    │                   (Express + tRPC)                │
    │                                                   │
    │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
    │  │  auth    │  │customers │  │ transactions  │   │
    │  │  router  │  │  router  │  │   router      │   │
    │  └──────────┘  └──────────┘  └──────────────┘   │
    │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
    │  │  alerts  │  │  cases   │  │  screening   │   │
    │  │  router  │  │  router  │  │   router      │   │
    │  └──────────┘  └──────────┘  └──────────────┘   │
    │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
    │  │ reports  │  │  admin   │  │  amlRules    │   │
    │  │  router  │  │  router  │  │   router      │   │
    │  └──────────┘  └──────────┘  └──────────────┘   │
    │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
    │  │documents │  │ network  │  │    pkyc      │   │
    │  │  router  │  │  router  │  │   router      │   │
    │  └──────────┘  └──────────┘  └──────────────┘   │
    │                                                   │
    │  Schedulers actifs :                              │
    │  - Sanctions (cron 0 2 * * *)                    │
    │  - ML Retrain (cron 0 3 * * 0)                   │
    │  - pKYC (cron 0 1 * * *)                         │
    └──────────┬───────────────────────┬───────────────┘
               │                       │
      ┌────────▼──────┐       ┌────────▼──────┐
      │  PostgreSQL 16 │       │    Redis 7    │
      │  (kyc_postgres)│       │  (kyc_redis)  │
      │               │       │               │
      │  Volumes :    │       │  Volumes :    │
      │  postgres_data│       │  redis_data   │
      │  (named vol.) │       │  (named vol.) │
      └───────────────┘       └───────────────┘
               │
      ┌────────▼──────┐
      │  ML Service   │
      │  Python FastAPI│
      │  (kyc_ml:8000) │
      │               │
      │  Volumes :    │
      │  ml_models    │
      └───────────────┘
               │
    ┌──────────┼───────────────────────┐
    │          │                       │
┌───▼────┐ ┌──▼──────┐  ┌────────────▼──────────────┐
│ OFAC   │ │  EU /UN │  │      TRACFIN / BAM         │
│  SDN   │ │  UK /PEP│  │   (SIMULATION → PROD)      │
│  XML   │ │  Lists  │  │                             │
└────────┘ └─────────┘  └───────────────────────────┘
                         Listes mises à jour : 02:00 UTC

    ┌─────────────────────────────────────────────────┐
    │              Observabilité                       │
    │  ┌───────────┐  ┌──────────┐  ┌─────────────┐  │
    │  │ Prometheus │  │  Loki    │  │  Grafana    │  │
    │  │ (scrape    │  │ (logs    │  │  (port 3001) │  │
    │  │  15s)      │  │  aggr.)  │  │  dashboards) │  │
    │  └───────────┘  └──────────┘  └─────────────┘  │
    │  ┌───────────┐                                  │
    │  │  Backup   │  pg_dump quotidien 02:00 UTC     │
    │  │  service  │  rétention 30 jours              │
    │  └───────────┘                                  │
    └─────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────┐
    │              Frontend (production)               │
    │  React 19 + Vite (assets servis par Express)    │
    │  Radix UI + shadcn/ui + TailwindCSS 4           │
    │  Tanstack Query + tRPC client + Wouter           │
    └─────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────┐
    │           CBS (Core Banking System)              │
    │  POST /webhooks/transaction                      │
    │  HMAC-SHA256 signature (WEBHOOK_SECRET)          │
    └─────────────────────────────────────────────────┘
```

### 1.2 Stack technologique

| Couche | Technologie | Version |
|--------|-------------|---------|
| Runtime serveur | Node.js | 22 (LTS) |
| Gestionnaire de paquets | pnpm | 10.4.1 |
| Framework serveur | Express | 4.x |
| API protocol | tRPC | v11 |
| Frontend | React + Vite | 19 / 7.x |
| ORM | Drizzle ORM | 0.44.x |
| Base de données | PostgreSQL | 16 (Alpine) |
| Cache / sessions | Redis | 7 (Alpine) |
| ML Service | Python FastAPI | microservice interne |
| Validation schémas | Zod | v4 |
| Tests | Vitest | 2.x |
| Tests E2E | Playwright | 1.x |
| Conteneurisation | Docker + Compose v2 | - |
| Reverse proxy | Nginx | Alpine |
| Métriques | Prometheus + prom-client | 15.x |
| Logs | Pino + Pino-Loki | 9.x |
| Dashboards | Grafana | 10.4.0 |
| Agrégation logs | Loki | 2.9.5 |
| TLS | Let's Encrypt / Certbot | - |
| Authentification | JWT (JOSE) + TOTP MFA | - |
| Chiffrement PII | AES-256-GCM | - |
| Génération PDF | pdfmake | 0.3.x |
| Génération DOCX | docx | 9.x |
| Stockage fichiers | Local FS ou S3/MinIO | - |
| Secrets (optionnel) | HashiCorp Vault | - |

### 1.3 Topologie de déploiement

```
VPS Ubuntu 22.04
├── /opt/kyc-aml-v2/
│   ├── docker/docker-compose.prod.yml
│   ├── .env.production              (chmod 600, non versionné)
│   ├── docker/nginx.conf
│   ├── scripts/
│   │   ├── generate-secrets.sh
│   │   ├── deploy.sh
│   │   └── init-tls.sh
│   └── docker/backup.sh
│
├── /etc/letsencrypt/                (certificats TLS)
│
└── Docker volumes (managed) :
    ├── kyc_postgres_data_prod       (données PostgreSQL)
    ├── kyc_redis_data_prod          (données Redis)
    ├── kyc_ml_models                (modèles ML entraînés)
    ├── kyc_backups                  (dumps pg_dump quotidiens)
    ├── kyc_certbot_www              (challenge ACME)
    ├── kyc_prometheus_data          (métriques 30j)
    ├── kyc_grafana_data             (dashboards)
    └── kyc_loki_data                (logs)
```

---

## 2. Prérequis Serveur

### 2.1 Spécifications matérielles minimales

| Ressource | Minimum | Recommandé |
|-----------|---------|------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| RAM | 4 Go | 8 Go |
| CPU | 2 vCPU | 4 vCPU |
| Disque système | 40 Go SSD | 80 Go SSD |
| Disque données | 20 Go | 100 Go (selon volume transactions) |
| Réseau | 100 Mbit/s | 1 Gbit/s |
| IP | 1 IP publique | 1 IP publique dédiée |

> **Note :** Le service ML se voit allouer 1 Go RAM et 1 CPU (limits Docker). L'application Node.js est limitée à 512 Mo RAM / 1 CPU. En charge, prévoir 4 Go RAM minimum pour l'ensemble de la stack.

### 2.2 Logiciels requis sur l'hôte

```bash
# Docker Engine 24+
curl -fsSL https://get.docker.com | bash
systemctl enable --now docker

# Vérifier docker compose v2 (plugin, pas docker-compose v1)
docker compose version
# Docker Compose version v2.24.0 (minimum)

# Outils système
apt-get install -y git openssl curl python3 jq

# Optionnel : ufw (pare-feu)
apt-get install -y ufw
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (challenge ACME + redirect HTTPS)
ufw allow 443/tcp   # HTTPS
ufw enable
```

### 2.3 Accès réseau sortant requis

| Destination | Port | Usage |
|-------------|------|-------|
| ghcr.io | 443 | Pull image Docker depuis GitHub Container Registry |
| registry-1.docker.io | 443 | Pull images Docker Hub (postgres, redis, nginx) |
| treasury.gov | 443 | Liste OFAC SDN |
| webgate.ec.europa.eu | 443 | Liste sanctions EU |
| scsanctions.un.org | 443 | Liste sanctions ONU |
| data.opensanctions.org | 443 | Liste PEP |
| acme-v02.api.letsencrypt.org | 443 | Certification TLS |

---

## 3. Variables d'Environnement

> **Génération automatique :** `./scripts/generate-secrets.sh --env .env.production`
> **Validation avant déploiement :** `./scripts/deploy.sh` (valide les variables critiques)

### 3.1 Serveur

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `NODE_ENV` | Environnement d'exécution | Oui | `development` | `production` |
| `PORT` | Port d'écoute du serveur Express | Oui | `3000` | `3000` |

### 3.2 Base de données (PostgreSQL)

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `DATABASE_URL` | URL de connexion PostgreSQL (DSN complet) | Oui | - | `postgresql://kyc_user:pwd@postgres:5432/kyc_aml_db` |

> **Sécurité :** Ne jamais exposer `DATABASE_URL` en clair dans les logs. En production Docker, le conteneur PostgreSQL n'expose aucun port sur l'hôte — accessible uniquement via le réseau `kyc_network_prod`.

### 3.3 Redis

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `REDIS_URL` | URL de connexion Redis | Oui | `redis://localhost:6379` | `redis://redis:6379` |
| `REDIS_PASSWORD` | Mot de passe Redis | **Oui en prod** | *(vide)* | `$(openssl rand -hex 32)` |

> **Sécurité :** `REDIS_PASSWORD` est obligatoire en production. Redis est configuré avec `--requiers` et `--appendonly yes` pour la persistance AOF.

### 3.4 JWT — Authentification

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `JWT_ACCESS_SECRET` | Clé de signature JWT access token | **Critique** | Valeur placeholder | `$(openssl rand -hex 32)` |
| `JWT_REFRESH_SECRET` | Clé de signature JWT refresh token | **Critique** | Valeur placeholder | `$(openssl rand -hex 32)` (différent du access) |
| `JWT_ACCESS_EXPIRES_IN` | Durée de vie access token | Non | `15m` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Durée de vie refresh token | Non | `7d` | `7d` |

> **Sécurité :** Les deux secrets doivent être différents (validé par `deploy.sh`). Longueur minimale : 32 caractères hexadécimaux (64 chars). Générés avec `openssl rand -hex 32`.

### 3.5 Compte Admin Initial

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `ADMIN_EMAIL` | Email du compte administrateur créé au démarrage | Oui | `admin@kyc-aml.local` | `admin@votre-banque.fr` |
| `ADMIN_PASSWORD` | Mot de passe admin initial | **Critique** | `ChangeMe!Admin123` | Généré par `generate-secrets.sh` |
| `ADMIN_NAME` | Nom d'affichage de l'admin | Non | `Administrateur` | `Administrateur Système` |

> **Sécurité :** Le mot de passe par défaut `ChangeMe!Admin123` est **bloquant** pour le déploiement (validé par `deploy.sh`). Changer immédiatement après le premier démarrage.

### 3.6 Chiffrement PII (AES-256-GCM)

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `PII_ENCRYPTION_KEY` | Clé AES-256-GCM pour chiffrement des données personnelles | **Obligatoire en prod** | *(vide)* | `$(openssl rand -hex 32)` |

> **Sécurité :** Sans `PII_ENCRYPTION_KEY`, les PII (données personnelles) sont stockées en clair. Cette variable est obligatoire en production pour la conformité RGPD/DORA.

### 3.7 MFA TOTP

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `MFA_ENCRYPTION_KEY` | Clé de chiffrement des secrets TOTP (stockés chiffrés en base) | **Critique** | Valeur placeholder | `$(openssl rand -hex 32)` |

### 3.8 ML Service

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `ML_SERVICE_URL` | URL interne du microservice ML Python | Oui | `http://kyc_ml:8000` | `http://ml:8000` |
| `ML_INTERNAL_API_KEY` | Clé API pour authentifier les appels au service ML | **Critique** | `dev_ml_key_changeme_in_prod` | `$(openssl rand -hex 32)` |
| `ML_RETRAIN_AUTO` | Activer le réentraînement automatique | Non | `true` | `true` |
| `ML_RETRAIN_CRON` | Cron du réentraînement (UTC) | Non | `0 3 * * 0` | `0 3 * * 0` (dim. 03:00) |
| `ML_RETRAIN_DAYS_HISTORY` | Fenêtre historique pour le réentraînement (jours) | Non | `180` | `180` |

### 3.9 pKYC — Perpetual KYC

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `PKYC_ENABLED` | Activer l'analyse nocturne de dérive comportementale | Non | `true` | `true` |
| `PKYC_CRON` | Cron pKYC (UTC) | Non | `0 1 * * *` | `0 1 * * *` (01:00 UTC) |
| `PKYC_DRIFT_THRESHOLD` | Seuil de score de dérive déclenchant une revue KYC (0-100) | Non | `40` | `40` |
| `PKYC_BASELINE_DAYS` | Fenêtre de référence comportementale (jours) | Non | `30` | `30` |
| `PKYC_WINDOW_DAYS` | Fenêtre d'analyse récente (jours) | Non | `7` | `7` |

### 3.10 Screening — Listes de sanctions

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `OFAC_SDN_URL` | URL XML liste OFAC SDN (Trésor US) | Oui | URL OFAC officielle | *(voir .env.example)* |
| `EU_SANCTIONS_URL` | URL XML liste sanctions UE | Oui | URL Commission européenne | *(voir .env.example)* |
| `UN_SANCTIONS_URL` | URL XML liste ONU (Conseil de sécurité) | Oui | URL ONU officielle | *(voir .env.example)* |
| `UK_SANCTIONS_URL` | URL XML liste OFSI (Royaume-Uni) | Oui | URL GOV.UK officielle | *(voir .env.example)* |
| `PEP_LIST_URL` | URL CSV liste PEP (OpenSanctions) | Oui | URL OpenSanctions | *(voir .env.example)* |
| `BAM_SANCTIONS_URL` | URL liste nationale marocaine (BAM/ANRF) | Non | *(vide)* | Fourni sur agrément BAM |
| `SCREENING_STALE_THRESHOLD_HOURS` | Seuil d'alerte si liste non mise à jour (heures) | Non | `36` | `36` |
| `SCREENING_MATCH_THRESHOLD` | Score minimum pour un match positif (0-100) | Non | `80` | `80` |
| `SCREENING_REVIEW_THRESHOLD` | Score minimum pour une revue manuelle (0-100) | Non | `50` | `50` |
| `SCREENING_AUTO_UPDATE` | Mise à jour automatique des listes | Non | `true` | `true` |
| `SCREENING_UPDATE_CRON` | Cron de mise à jour des listes (UTC) | Non | `0 2 * * *` | `0 2 * * *` (02:00 UTC) |

### 3.11 Règles AML

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `AML_THRESHOLD_SINGLE_TX` | Seuil montant transaction unique (alerte) | Non | `10000` | `10000` |
| `AML_THRESHOLD_STRUCTURING` | Seuil montant pour détection structuring | Non | `3000` | `3000` |
| `AML_STRUCTURING_WINDOW_HOURS` | Fenêtre temporelle structuring (heures) | Non | `24` | `24` |
| `AML_FREQUENCY_THRESHOLD` | Seuil nombre transactions (fréquence) | Non | `10` | `10` |
| `AML_VOLUME_VARIATION_THRESHOLD` | Seuil variation volume (%) | Non | `300` | `300` |

### 3.12 TRACFIN

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `TRANSMISSION_MODE` | Mode de transmission TRACFIN | **Critique** | `SIMULATION` | `PRODUCTION` |
| `TRACFIN_ENTITY_ID` | Identifiant déclarant TRACFIN | Oui | Placeholder | `TR-2024-XXXXX` |
| `ORG_NAME` | Raison sociale de l'établissement | Oui | Placeholder | `Banque Exemple SA` |
| `ORG_ADDRESS` | Adresse de l'établissement | Oui | Placeholder | `1 Rue de la Compliance` |
| `ORG_CITY` | Ville | Oui | `Paris` | `Paris` |
| `ORG_POSTAL_CODE` | Code postal | Oui | `75001` | `75001` |
| `ORG_COUNTRY` | Pays (code ISO 2) | Oui | `FR` | `FR` |
| `ORG_PHONE` | Téléphone de l'établissement | Oui | Placeholder | `+33100000000` |
| `ORG_EMAIL` | Email compliance | Oui | Placeholder | `compliance@banque.fr` |

> **Attention :** `TRANSMISSION_MODE=SIMULATION` ne transmet pas réellement à TRACFIN. Passer à `PRODUCTION` uniquement après validation opérationnelle complète.

### 3.13 eKYC

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `EKYC_PROVIDER` | Fournisseur eKYC (`local`, `onfido`, `sumsub`) | Oui | `local` | `onfido` |
| `ONFIDO_API_TOKEN` | Token API Onfido | Si provider=onfido | - | `api_live_XXXX` |
| `SUMSUB_APP_TOKEN` | Token application SumSub | Si provider=sumsub | - | `sbx:XXXX` |
| `SUMSUB_SECRET_KEY` | Clé secrète SumSub | Si provider=sumsub | - | `$(openssl rand -hex 32)` |

### 3.14 Webhook CBS

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `WEBHOOK_SECRET` | Clé HMAC-SHA256 pour validation des webhooks CBS | **Critique** | Placeholder | `$(openssl rand -hex 32)` |

### 3.15 Stockage documents

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `STORAGE_BACKEND` | Backend de stockage (`local` ou `s3`) | Oui | `local` | `s3` |
| `UPLOAD_DIR` | Répertoire uploads (si backend local) | Non | `./uploads` | `/data/uploads` |
| `UPLOAD_MAX_SIZE_MB` | Taille maximale fichier (Mo) | Non | `10` | `10` |
| `S3_BUCKET` | Nom du bucket S3/MinIO (si backend s3) | Si s3 | - | `kyc-documents` |
| `S3_REGION` | Région AWS (si backend s3) | Si s3 | - | `eu-west-1` |
| `S3_ENDPOINT` | Endpoint S3 custom (MinIO) | Non | - | `https://minio.votre-domaine.fr` |
| `S3_ACCESS_KEY_ID` | Access key S3 | Si s3 | - | `AKIAIOSFODNN7EXAMPLE` |
| `S3_SECRET_ACCESS_KEY` | Secret key S3 | Si s3 | - | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |

### 3.16 HashiCorp Vault (optionnel)

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `VAULT_ADDR` | URL de l'instance Vault | Non | - | `https://vault.votre-domaine.fr` |
| `VAULT_TOKEN` | Token d'accès Vault | Non | - | `hvs.XXXXXXXXXXXX` |
| `VAULT_PATH` | Chemin du secret dans Vault | Non | - | `secret/data/kyc-aml` |

### 3.17 Rate limiting et CORS

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `RATE_LIMIT_MAX` | Nb max requêtes par fenêtre | Non | `100` | `100` |
| `RATE_LIMIT_WINDOW_SECONDS` | Taille de la fenêtre (secondes) | Non | `60` | `60` |
| `CORS_ORIGINS` | Origines autorisées (CORS), séparées par virgule | Oui | `http://localhost:5173,...` | `https://kyc.votre-domaine.fr` |

> **Sécurité :** En production, `CORS_ORIGINS` doit ne contenir que le(s) domaine(s) de production réel(s). Ne jamais utiliser `*`.

### 3.18 Logs

| Variable | Description | Requis | Défaut | Exemple |
|----------|-------------|--------|--------|---------|
| `LOG_LEVEL` | Niveau de log Pino (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) | Non | `info` | `info` |
| `LOG_FORMAT` | Format des logs (`pretty` ou `json`) | Non | `pretty` | `json` (prod) |

> En production, utiliser `LOG_FORMAT=json` pour l'intégration avec Loki/Grafana. `pretty` est réservé au développement.

### 3.19 Récapitulatif sécurité — Variables critiques

| Variable | Action requise en production |
|----------|------------------------------|
| `JWT_ACCESS_SECRET` | Générer avec `openssl rand -hex 32` — NE PAS utiliser la valeur placeholder |
| `JWT_REFRESH_SECRET` | Générer avec `openssl rand -hex 32` — doit être différent du précédent |
| `PII_ENCRYPTION_KEY` | **Obligatoire** — sans cette clé, les PII sont stockées en clair |
| `MFA_ENCRYPTION_KEY` | Générer avec `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | Changer immédiatement la valeur par défaut |
| `WEBHOOK_SECRET` | Générer avec `openssl rand -hex 32` — communiquer au CBS |
| `ML_INTERNAL_API_KEY` | Générer avec `openssl rand -hex 32` |
| `REDIS_PASSWORD` | Mot de passe fort obligatoire |
| `TRANSMISSION_MODE` | Passer à `PRODUCTION` après validation — sinon aucune déclaration TRACFIN n'est transmise |

---

## 4. Infrastructure Docker

### 4.1 Services et rôles

| Service | Image | Rôle | Port interne | Port exposé |
|---------|-------|------|-------------|-------------|
| `app` | `ghcr.io/<repo>:<sha>` | Application Node.js 22 | 3000 | 3000 (via Nginx) |
| `migrate` | `ghcr.io/<repo>:<sha>` | Migration Drizzle (one-shot) | - | - |
| `postgres` | `postgres:16-alpine` | Base de données | 5432 | **aucun** |
| `redis` | `redis:7-alpine` | Cache + sessions | 6379 | **aucun** |
| `nginx` | `nginx:alpine` | Reverse proxy + TLS | 80, 443 | 80, 443 |
| `certbot` | `certbot/certbot:latest` | Renouvellement TLS | - | - |
| `ml` | `kyc-ml:<tag>` | Microservice scoring ML | 8000 | **aucun** |
| `backup` | `postgres:16-alpine` | Backup pg_dump quotidien | - | - |
| `prometheus` | `prom/prometheus:v2.51.0` | Collecte métriques | 9090 | **aucun** |
| `grafana` | `grafana/grafana:10.4.0` | Dashboards | 3000 | 3001 |
| `loki` | `grafana/loki:2.9.5` | Agrégation logs | 3100 | **aucun** |

### 4.2 Volumes de persistance

| Volume | Nom Docker | Contenu | Service |
|--------|-----------|---------|---------|
| `postgres_data` | `kyc_postgres_data_prod` | Données PostgreSQL | postgres |
| `redis_data` | `kyc_redis_data_prod` | AOF Redis (persistance) | redis |
| `ml_models` | `kyc_ml_models` | Modèles ML entraînés (pickle/ONNX) | ml |
| `backups` | `kyc_backups` | Dumps pg_dump `.sql.gz` | backup |
| `certbot_www` | `kyc_certbot_www` | Challenge ACME Let's Encrypt | nginx, certbot |
| `prometheus_data` | `kyc_prometheus_data` | Séries temporelles (rétention 30j) | prometheus |
| `grafana_data` | `kyc_grafana_data` | Dashboards et users Grafana | grafana |
| `loki_data` | `kyc_loki_data` | Logs agrégés | loki |

### 4.3 Configuration réseau

Tous les services communiquent sur le réseau Docker interne `kyc_network_prod`. Seuls Nginx (80/443) et Grafana (3001) exposent des ports sur l'hôte. PostgreSQL et Redis ne sont **jamais** accessibles de l'extérieur.

```yaml
networks:
  default:
    name: kyc_network_prod
```

### 4.4 Health checks

| Service | Commande | Intervalle | Timeout | Retries |
|---------|----------|-----------|---------|---------|
| `app` | `curl -f http://localhost:3000/health` | 30s | 10s | 3 |
| `postgres` | `pg_isready -U $DB_USER -d $DB_NAME` | 10s | 5s | 5 |
| `redis` | `redis-cli -a $REDIS_PASSWORD ping` | 10s | 5s | 5 |
| `nginx` | `wget -qO- http://localhost/health` | 30s | 5s | 3 |
| `ml` | `curl -f http://localhost:8000/health` | 30s | 10s | 3 (start_period: 60s) |
| `prometheus` | `wget --spider http://localhost:9090/-/healthy` | 30s | 5s | - |
| `grafana` | `curl -f http://localhost:3000/api/health` | 30s | - | - |
| `loki` | `wget --spider http://localhost:3100/ready` | 30s | - | - |

### 4.5 Ressources allouées (limits Docker)

| Service | RAM max | CPU max |
|---------|---------|---------|
| `app` | 512 Mo | 1.0 core |
| `ml` | 1 Go | 1.0 core |
| Autres | Pas de limite explicite | Pas de limite explicite |

### 4.6 Build Docker — Image multi-étages

L'image est construite en 3 étapes (`docker/Dockerfile`) :

```
Stage 1 (deps)     : node:22-alpine — installation des dépendances pnpm
Stage 2 (builder)  : node:22-alpine — build Vite (frontend) + esbuild (serveur)
Stage 3 (runner)   : node:22-alpine — image finale minimale
                     Utilisateur non-root : kyc (uid 1001)
                     Artifacts : dist/, node_modules/, drizzle/
                     CMD : node dist/index.js
```

---

## 5. Intégration CBS (Core Banking System)

### 5.1 Pattern d'intégration

Le CBS envoie les transactions en temps réel via webhook HTTP POST. La plateforme KYC-AML reçoit, valide la signature HMAC-SHA256, et applique le moteur AML.

```
CBS                          KYC-AML Platform
 │                                │
 │  POST /webhooks/transaction     │
 │  X-Signature: sha256=<hmac>    │
 │  Content-Type: application/json │
 │  body: Buffer (raw)            │
 │ ──────────────────────────────► │
 │                                 │  1. Vérification HMAC (express.raw)
 │                                 │  2. Parse JSON body
 │                                 │  3. handleTransactionWebhook()
 │                                 │  4. Moteur AML (11 règles)
 │                                 │  5. Scoring ML
 │                                 │  6. Génération alertes
 │  { success: true, ... }        │
 │ ◄────────────────────────────── │
```

### 5.2 Endpoint webhook

```
POST /webhooks/transaction
```

**Important :** Ce endpoint utilise `express.raw()` (pas `express.json()`) pour capturer le corps brut avant parsing — nécessaire pour la vérification HMAC.

### 5.3 Authentification — Signature HMAC-SHA256

Chaque requête CBS doit inclure un header de signature :

```
X-Signature: sha256=<hex_digest>
```

Le digest est calculé ainsi :

```
HMAC-SHA256(secret=WEBHOOK_SECRET, message=<raw_body_bytes>)
```

Exemple de calcul côté CBS (Node.js) :

```javascript
const crypto = require('crypto');

function signPayload(body, secret) {
  return 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(Buffer.isBuffer(body) ? body : Buffer.from(body))
    .digest('hex');
}

// Utilisation
const signature = signPayload(JSON.stringify(payload), process.env.WEBHOOK_SECRET);
```

### 5.4 Format de la requête

```json
{
  "transactionId": "TXN-20240115-001234",
  "customerId": "CUST-00042",
  "amount": 9500.00,
  "currency": "EUR",
  "transactionType": "TRANSFER",
  "channel": "ONLINE",
  "counterparty": "SARL Exemple",
  "counterpartyCountry": "MA",
  "counterpartyBank": "Attijariwafa Bank",
  "purpose": "Règlement facture F-2024-001",
  "transactionDate": "2024-01-15T14:32:00Z"
}
```

**Champs `transactionType` acceptés :** `TRANSFER`, `DEPOSIT`, `WITHDRAWAL`, `PAYMENT`, `EXCHANGE`
**Champs `channel` acceptés :** `ONLINE`, `MOBILE`, `BRANCH`, `ATM`, `API`

### 5.5 Format de la réponse

```json
{
  "success": true,
  "transactionId": "TXN-20240115-001234",
  "riskScore": 72,
  "status": "FLAGGED",
  "alertsCreated": 2,
  "rulesTriggered": ["THRESHOLD_EXCEEDED", "HIGH_RISK_COUNTRY"]
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `success` | boolean | `true` si la transaction a été traitée |
| `transactionId` | string | Echo de l'identifiant de transaction |
| `riskScore` | integer | Score de risque calculé (0-100) |
| `status` | string | Statut final : `PENDING`, `COMPLETED`, `FLAGGED`, `BLOCKED` |
| `alertsCreated` | integer | Nombre d'alertes AML générées |
| `rulesTriggered` | string[] | Liste des règles AML déclenchées |

**Codes HTTP :**
- `200` : Transaction reçue et traitée
- `400` : Corps de requête invalide
- `401` : Signature HMAC invalide ou manquante
- `500` : Erreur interne (réessayer)

### 5.6 Politique de retry recommandée

| Situation | Action |
|-----------|--------|
| HTTP 2xx | Succès — pas de retry |
| HTTP 4xx (sauf 429) | Erreur permanente — ne pas retry, alerter |
| HTTP 429 | Rate limiting — retry après `Retry-After` secondes |
| HTTP 5xx | Retry exponentiel : 1s, 2s, 4s, 8s, 16s (max 5 retries) |
| Timeout (>30s) | Retry exponentiel identique |

### 5.7 Exemple curl de test

```bash
# Calculer la signature
BODY='{"transactionId":"TEST-001","customerId":"CUST-00001","amount":15000,"currency":"EUR","transactionType":"TRANSFER","channel":"ONLINE"}'
SECRET="votre_webhook_secret"
SIGNATURE="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)"

# Envoyer la requête
curl -X POST https://kyc.votre-domaine.fr/webhooks/transaction \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIGNATURE" \
  -d "$BODY"
```

---

## 6. Systèmes Connectés

### 6.1 TRACFIN — Déclarations de soupçon (SAR/DS)

**Objet :** Transmission des déclarations de soupçon (DS) au TRACFIN (Traitement du renseignement et action contre les circuits financiers clandestins), conformément à l'article L561-15 du CMF.

| Paramètre | Description |
|-----------|-------------|
| Protocole | Génération XML + transmission via portail TRACFIN ou API |
| Mode SIMULATION | Génère les rapports XML sans transmission (développement/tests) |
| Mode PRODUCTION | Transmission effective via portail télédéclaration TRACFIN |
| Format rapport | XML GOAML_2 (standard ONUDC/TRACFIN) |
| Entité déclarante | Configurée via `TRACFIN_ENTITY_ID` + variables `ORG_*` |

**Configuration :**

```bash
# En test/préproduction
TRANSMISSION_MODE=SIMULATION

# En production (après validation et agrément)
TRANSMISSION_MODE=PRODUCTION
TRACFIN_ENTITY_ID=TR-2024-VOTRE-ID   # Fourni par TRACFIN lors de l'inscription
ORG_NAME=Banque Exemple SA
ORG_EMAIL=compliance@banque-exemple.fr
```

**Vérification :**

```bash
# Tester la génération XML TRACFIN (mode simulation)
curl -X POST https://kyc.votre-domaine.fr/trpc/reports.generateTracfinXml \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{"caseId":"CASE-00001"}}'
```

### 6.2 Listes de sanctions — Screening automatique

**Objet :** Vérification des clients contre les listes de sanctions internationales et listes PEP (Personnes Politiquement Exposées).

| Liste | Source | Format | Mise à jour |
|-------|--------|--------|-------------|
| OFAC SDN | US Treasury | XML | Quotidienne (02:00 UTC) |
| EU Sanctions | Commission européenne | XML | Quotidienne (02:00 UTC) |
| UN Consolidated | ONU / Conseil de sécurité | XML | Quotidienne (02:00 UTC) |
| UK OFSI | UK Government | XML | Quotidienne (02:00 UTC) |
| PEP OpenSanctions | OpenSanctions.org | CSV | Quotidienne (02:00 UTC) |
| BAM/ANRF | Banque Al-Maghrib | XML | Sur agrément BAM |

**Configuration :**

```bash
SCREENING_AUTO_UPDATE=true
SCREENING_UPDATE_CRON="0 2 * * *"       # 02:00 UTC quotidien
SCREENING_STALE_THRESHOLD_HOURS=36      # Alerte si liste non mise à jour
SCREENING_MATCH_THRESHOLD=80            # Score ≥ 80 → MATCH (blocage)
SCREENING_REVIEW_THRESHOLD=50           # Score ≥ 50 → REVIEW (revue manuelle)
```

**Algorithme de matching :** Distance de Levenshtein (bibliothèque `fast-levenshtein`) avec normalisation des noms (accents, casse, caractères spéciaux).

**Vérification état des listes :**

```bash
curl -s https://kyc.votre-domaine.fr/health | python3 -m json.tool
# Vérifier le champ services.screening dans la réponse
```

### 6.3 ML Service — Microservice Python

**Objet :** Calcul du score de risque ML pour chaque transaction, basé sur l'historique comportemental du client. Réentraînement automatique sur les décisions des analystes (feedback loop).

| Paramètre | Valeur |
|-----------|--------|
| Protocole | HTTP REST interne (réseau Docker) |
| URL | `http://ml:8000` (interne) |
| Authentification | Header `X-Api-Key: $ML_INTERNAL_API_KEY` |
| Health check | `GET http://ml:8000/health` |
| Réentraînement | Dimanche 03:00 UTC (configurable) |
| Données | 180 derniers jours de décisions analystes |

**Configuration :**

```bash
ML_SERVICE_URL=http://kyc_ml:8000
ML_INTERNAL_API_KEY=$(openssl rand -hex 32)   # Partagé entre app et ml via .env.production
ML_RETRAIN_AUTO=true
ML_RETRAIN_CRON="0 3 * * 0"
ML_RETRAIN_DAYS_HISTORY=180
```

**Test de santé ML :**

```bash
docker compose -f docker/docker-compose.prod.yml exec app \
  curl -s http://ml:8000/health | python3 -m json.tool
```

### 6.4 Fournisseurs eKYC

**Objet :** Vérification documentaire (OCR, MRZ, liveness check) des pièces d'identité clients.

| Provider | Variable de sélection | Tokens requis |
|----------|-----------------------|---------------|
| `local` | `EKYC_PROVIDER=local` | Aucun (traitement OCR local) |
| `onfido` | `EKYC_PROVIDER=onfido` | `ONFIDO_API_TOKEN` |
| `sumsub` | `EKYC_PROVIDER=sumsub` | `SUMSUB_APP_TOKEN` + `SUMSUB_SECRET_KEY` |

**Configuration pour Onfido :**

```bash
EKYC_PROVIDER=onfido
ONFIDO_API_TOKEN=api_live_XXXXXXXXXXXXXXXXXXXX
```

**Configuration pour SumSub :**

```bash
EKYC_PROVIDER=sumsub
SUMSUB_APP_TOKEN=sbx:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SUMSUB_SECRET_KEY=$(openssl rand -hex 32)
```

### 6.5 HashiCorp Vault (optionnel)

**Objet :** Gestion centralisée et rotation automatique des secrets cryptographiques en production sensible.

**Configuration :**

```bash
VAULT_ADDR=https://vault.votre-domaine.fr
VAULT_TOKEN=hvs.XXXXXXXXXXXXXXXXXXXX
VAULT_PATH=secret/data/kyc-aml
```

**Structure du secret dans Vault :**

```json
{
  "JWT_ACCESS_SECRET": "...",
  "JWT_REFRESH_SECRET": "...",
  "PII_ENCRYPTION_KEY": "...",
  "MFA_ENCRYPTION_KEY": "...",
  "WEBHOOK_SECRET": "...",
  "ML_INTERNAL_API_KEY": "..."
}
```

**Test de connexion Vault :**

```bash
VAULT_ADDR=https://vault.votre-domaine.fr \
VAULT_TOKEN=hvs.XXXX \
vault kv get secret/data/kyc-aml
```

### 6.6 Email SMTP — Notifications critiques

**Objet :** Envoi des notifications d'alerte critique (pic d'alertes AML, match sanctions, indisponibilité service).

> **Note :** La configuration SMTP se fait via les variables `SMTP_*` si activée (dépend de l'implémentation du module mailer). Configurer le destinataire `notifyCriticalAlert` dans la configuration admin.

**Configuration recommandée (post-déploiement via interface admin) :**

- Destinataire alerte critique : `compliance@votre-banque.fr`
- Seuil d'alerte : 5 alertes CRITICAL en 10 minutes (voir `CriticalAmlAlertSpike` dans `alerts.yml`)

---

## 7. Procédure de Déploiement Initial (VPS)

### Étape 1 — Provisionner le VPS

```bash
# Ubuntu 22.04 LTS recommandé
# 4 Go RAM minimum, 2 vCPU, 80 Go SSD
# Vérifier l'OS
lsb_release -a
```

### Étape 2 — Installer Docker et docker compose v2

```bash
# Installation Docker Engine
curl -fsSL https://get.docker.com | bash
systemctl enable --now docker

# Vérification
docker --version
docker compose version   # doit afficher v2.x

# Ajouter l'utilisateur déployeur au groupe docker (optionnel)
usermod -aG docker $USER
```

### Étape 3 — Cloner le dépôt

```bash
mkdir -p /opt/kyc-aml-v2
cd /opt/kyc-aml-v2

# Cloner depuis GitHub
git clone https://github.com/<organisation>/kyc-aml-v2.git .

# Ou copier les fichiers nécessaires manuellement
# (docker/, scripts/, .env.example)
```

### Étape 4 — Générer les secrets de production

```bash
cd /opt/kyc-aml-v2

# Le script génère automatiquement tous les secrets cryptographiques
# et écrit .env.production avec chmod 600
./scripts/generate-secrets.sh --env .env.production

# Sortie attendue :
# ✅  JWT_ACCESS_SECRET      : abcdef0123456789… (64 chars)
# ✅  JWT_REFRESH_SECRET     : fedcba9876543210… (64 chars)
# ✅  PII_ENCRYPTION_KEY     : 1234567890abcdef… (AES-256-GCM activé)
# ...

# Générer manuellement si préféré :
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET (différent !)
openssl rand -hex 32   # PII_ENCRYPTION_KEY
openssl rand -hex 32   # MFA_ENCRYPTION_KEY
openssl rand -hex 32   # WEBHOOK_SECRET
openssl rand -hex 32   # ML_INTERNAL_API_KEY
```

### Étape 5 — Configurer .env.production

```bash
# Éditer le fichier généré
nano .env.production

# Variables obligatoires à renseigner manuellement :
# 1. DATABASE_URL — adapter si PostgreSQL externe (RDS, Supabase, Neon)
# 2. REDIS_PASSWORD — définir un mot de passe fort
# 3. ADMIN_EMAIL — email de l'administrateur réel
# 4. TRACFIN_ENTITY_ID — identifiant fourni par TRACFIN
# 5. ORG_NAME, ORG_EMAIL, ORG_ADDRESS — coordonnées de l'établissement
# 6. CORS_ORIGINS — domaine de production (ex: https://kyc.votre-domaine.fr)

# Vérifier les permissions
ls -la .env.production   # doit afficher -rw------- (600)
```

### Étape 6 — Provisionner le certificat TLS

```bash
# S'assurer que le domaine pointe sur ce VPS (DNS A record)
# Exécuter le script de provisionnement TLS (une seule fois)
./scripts/init-tls.sh \
  --domain kyc.votre-domaine.fr \
  --email admin@votre-domaine.fr

# Pour tester sans rate-limit Let's Encrypt (staging) :
./scripts/init-tls.sh \
  --domain kyc.votre-domaine.fr \
  --email admin@votre-domaine.fr \
  --staging

# Le script :
# 1. Génère docker/nginx.conf depuis docker/nginx.conf.template
# 2. Démarre Nginx HTTP pour le challenge ACME
# 3. Obtient le certificat via Certbot
# 4. Redémarre Nginx en HTTPS

# Mettre à jour docker/nginx.conf avec le domaine réel
sed -i 's/your-domain.com/kyc.votre-domaine.fr/g' docker/nginx.conf
```

### Étape 7 — Initialiser la base de données

```bash
cd /opt/kyc-aml-v2

# Via le script de déploiement (recommandé — valide .env avant migration)
./scripts/deploy.sh --env .env.production

# Ou manuellement :
# 1. Démarrer PostgreSQL uniquement
docker compose -f docker/docker-compose.prod.yml \
  --env-file .env.production up -d postgres

# 2. Attendre que PostgreSQL soit healthy
docker compose -f docker/docker-compose.prod.yml ps

# 3. Exécuter les migrations Drizzle
docker compose -f docker/docker-compose.prod.yml \
  --env-file .env.production \
  run --rm migrate
```

### Étape 8 — Démarrer tous les services

```bash
cd /opt/kyc-aml-v2

docker compose -f docker/docker-compose.prod.yml \
  --env-file .env.production \
  up -d --pull always

# Vérifier l'état de démarrage
docker compose -f docker/docker-compose.prod.yml ps
```

### Étape 9 — Vérifier le health check

```bash
# Health check application
curl -s https://kyc.votre-domaine.fr/health | python3 -m json.tool

# Réponse attendue :
# {
#   "status": "healthy",
#   "timestamp": "2026-03-29T10:00:00.000Z",
#   "services": {
#     "database": { "status": "healthy" },
#     "redis":    { "status": "healthy" },
#     "storage":  { "status": "healthy" }
#   },
#   "version": "2.0.0",
#   "env": "production"
# }

# Vérifier les logs
docker compose -f docker/docker-compose.prod.yml logs -f app
```

### Étape 10 — Configurer les GitHub Secrets pour le CI/CD

Dans le dépôt GitHub, aller dans **Settings → Secrets and variables → Actions** et créer :

| Secret | Valeur |
|--------|--------|
| `VPS_HOST` | IP ou FQDN du VPS (`kyc.votre-domaine.fr`) |
| `VPS_USER` | Utilisateur SSH (`ubuntu`, `deploy`, etc.) |
| `VPS_SSH_KEY` | Clé SSH privée (contenu complet, PEM format) |
| `VPS_PORT` | Port SSH (défaut: `22`) |

```bash
# Générer une clé SSH dédiée au déploiement
ssh-keygen -t ed25519 -C "kyc-aml-deploy" -f ~/.ssh/kyc_aml_deploy

# Ajouter la clé publique sur le VPS
cat ~/.ssh/kyc_aml_deploy.pub >> ~/.ssh/authorized_keys

# Copier la clé privée dans le secret GitHub VPS_SSH_KEY
cat ~/.ssh/kyc_aml_deploy
```

---

## 8. Pipeline CI/CD

### 8.1 Pipeline CI (`.github/workflows/ci.yml`)

**Déclencheurs :**
- Tout push sur toutes les branches
- Pull request vers `main` ou `develop`

**Stratégie :** Annulation automatique des runs concurrents sur la même branche (`cancel-in-progress: true`).

**Services de test spinup :**

```
- PostgreSQL 16 (kyc_user/kyc_password/kyc_aml_test)
- Redis 7 (sans mot de passe)
```

**Étapes du job `check` :**

| Étape | Commande | Description |
|-------|----------|-------------|
| 1 | `pnpm install --frozen-lockfile` | Installation dépendances (cache pnpm) |
| 2 | `pnpm check` | TypeScript strict — 0 erreur tolérée |
| 3 | `pnpm lint` | ESLint — 0 warning toléré (`--max-warnings 0`) |
| 4 | `pnpm db:migrate` | Migrations Drizzle sur la base de test |
| 5 | `pnpm test --reporter=verbose` | Tests unitaires et d'intégration Vitest |

**Job `build` (après `check`) :**
- Build Docker complet (sans push) pour valider la construction de l'image
- Cache GitHub Actions (`type=gha`)

### 8.2 Pipeline CD (`.github/workflows/deploy.yml`)

**Déclencheurs :**
- Push sur `main` (déploiement automatique en production)
- `workflow_dispatch` manuel avec choix de l'environnement (`production`, `staging`)

**Stratégie :** Pas d'annulation automatique (`cancel-in-progress: false`) — un déploiement en cours ne doit jamais être interrompu.

**Étapes :**

```
1. docker/setup-buildx-action      — Configuration BuildKit multi-plateforme
2. docker/login-action (ghcr.io)   — Authentification GHCR avec GITHUB_TOKEN
3. docker/metadata-action          — Tags : sha-<sha>, latest (main), staging (develop)
4. docker/build-push-action        — Build + push vers ghcr.io/<repo>:<sha>
5. appleboy/ssh-action             — Déploiement SSH sur le VPS
```

**Script de déploiement SSH (rolling update) :**

```bash
# Sur le VPS
APP_DIR="/opt/kyc-aml-v2"
IMAGE="ghcr.io/<repo>:sha-<sha>"

# 1. Pull nouvelle image
docker pull "$IMAGE"

# 2. Mise à jour tag dans .env.production
sed -i "s|APP_IMAGE=.*|APP_IMAGE=$IMAGE|" "$APP_DIR/.env.production"

# 3. Migrations (conteneur éphémère)
docker run --rm --env-file .env.production "$IMAGE" node dist/index.js migrate

# 4. Rolling update — scale temporaire à 2 répliques
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d --no-deps --scale app=2 app
sleep 15

# 5. Health check nouvelle instance
curl -sf http://localhost:3000/health | \
  python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d['status']=='healthy' else 1)"

# 6. Retour à 1 réplique
docker compose -f docker-compose.prod.yml up -d --no-deps --scale app=1 app

# 7. Nettoyage images obsolètes
docker image prune -f
```

### 8.3 Secrets GitHub requis

| Secret | Description | Obtention |
|--------|-------------|-----------|
| `VPS_HOST` | IP ou FQDN du VPS | Fourni par le prestataire VPS |
| `VPS_USER` | Utilisateur SSH | `ubuntu` (Ubuntu), `deploy` (custom) |
| `VPS_SSH_KEY` | Clé SSH privée PEM complète | `ssh-keygen -t ed25519` |
| `VPS_PORT` | Port SSH (optionnel) | `22` par défaut |

### 8.4 Procédure de rollback

En cas d'échec du déploiement, la plateforme reste opérationnelle sur l'ancienne version grâce au rolling update. Pour rollback manuel :

```bash
# Sur le VPS
cd /opt/kyc-aml-v2

# Lister les images disponibles
docker images | grep kyc-aml

# Revenir à l'image précédente
PREVIOUS_IMAGE="ghcr.io/<repo>:sha-<previous_sha>"
docker compose -f docker/docker-compose.prod.yml \
  --env-file .env.production \
  up -d --no-deps app \
  --image "$PREVIOUS_IMAGE"

# Vérifier
curl -s http://localhost:3000/health | python3 -m json.tool
```

---

## 9. Procédures Opérationnelles

### 9.1 Migrations de base de données

**Générer une nouvelle migration (développement) :**

```bash
# Après modification de drizzle/schema.ts
pnpm db:generate     # génère le fichier SQL dans drizzle/migrations/

# Appliquer en local
pnpm db:migrate
```

**Appliquer les migrations en production :**

```bash
# Via le service migrate (docker-compose.prod.yml)
docker compose -f docker/docker-compose.prod.yml \
  --env-file .env.production \
  run --rm migrate

# Le service migrate s'exécute puis s'arrête automatiquement (restart: "no")
```

**Rollback de migration :**

```bash
# Drizzle ORM ne propose pas de rollback automatique
# Procédure manuelle :

# 1. Restaurer le backup du jour précédent (voir section backup)
./docker/restore.sh latest

# 2. Ou appliquer un SQL de rollback manuel
docker compose -f docker/docker-compose.prod.yml \
  --env-file .env.production \
  exec postgres psql -U kyc_user -d kyc_aml_db -f /dev/stdin < rollback.sql
```

### 9.2 Backup PostgreSQL

**Backup automatique :** Quotidien à 02:00 UTC via le conteneur `backup` (script `docker/backup.sh`).

```bash
# Backup manuel immédiat
docker compose -f docker/docker-compose.prod.yml \
  --env-file .env.production \
  exec backup /backup.sh

# Lister les backups disponibles
docker compose -f docker/docker-compose.prod.yml \
  --env-file .env.production \
  exec backup ls -lh /backups/

# Copier un backup sur l'hôte
docker cp kyc_backup:/backups/kyc_aml_<timestamp>.sql.gz ./
```

**Paramètres de rétention :**
- Durée : 30 jours (variable `RETENTION_DAYS=30`)
- Format : `kyc_aml_YYYYMMDD-HHMMSS.sql.gz` (gzip niveau 9)
- Volume Docker : `kyc_backups`

**Restauration :**

```bash
# Restauration interactive avec confirmation et backup de sécurité pré-restauration
./docker/restore.sh kyc_aml_20240115-020001.sql.gz

# Restaurer le backup le plus récent
./docker/restore.sh latest

# Le script :
# 1. Arrête l'application et le service ML
# 2. Crée un backup de sécurité de l'état actuel
# 3. Restaure le dump SQL
# 4. Vérifie l'intégrité (tables users, customers, transactions, alerts)
# 5. Applique les migrations Drizzle
# 6. Redémarre l'application
# 7. Vérifie le health check
```

**Fréquence recommandée :**
- Backup quotidien : activé par défaut (02:00 UTC)
- Backup avant chaque migration majeure : manuel
- Test de restauration : mensuel

### 9.3 Gestion des logs

**Configuration :**

```bash
LOG_LEVEL=info    # production : info ou warn
LOG_FORMAT=json   # production : json (pour Loki/Grafana)
```

**Accès aux logs :**

```bash
# Logs application en temps réel
docker compose -f docker/docker-compose.prod.yml logs -f app

# Logs avec niveau de détail
docker compose -f docker/docker-compose.prod.yml logs -f --tail=200 app

# Logs Nginx
docker compose -f docker/docker-compose.prod.yml logs -f nginx

# Logs ML service
docker compose -f docker/docker-compose.prod.yml logs -f ml

# Tous les services
docker compose -f docker/docker-compose.prod.yml logs -f
```

**Agrégation Loki :** Les logs JSON de l'application sont collectés par Loki via `pino-loki` et visualisables dans Grafana (`https://kyc.votre-domaine.fr:3001`).

### 9.4 Monitoring — Endpoints et métriques

**Endpoint de santé :**

```bash
GET /health

# Réponse :
{
  "status": "healthy" | "degraded",
  "timestamp": "2026-03-29T10:00:00.000Z",
  "services": {
    "database": { "status": "healthy" | "unhealthy" },
    "redis":    { "status": "healthy" | "unhealthy" },
    "storage":  { "status": "healthy" | "unhealthy" }
  },
  "version": "2.0.0",
  "env": "production"
}
```

Code HTTP `200` = healthy, `503` = dégradé.

**Endpoint Prometheus :**

```bash
GET /metrics   # format text/plain Prometheus
```

**Métriques clés à surveiller :**

| Métrique | Alerte configurée | Seuil |
|----------|------------------|-------|
| `http_requests_total{status_code=~"5.."}` | `HighErrorRate` | > 5% sur 5 min |
| `http_request_duration_seconds` p95 | `SlowRequests` / `VerySlowRequests` | > 1s / > 3s |
| `trpc_errors_total` | `HighTrpcErrorRate` | > 10% sur 5 min |
| `aml_alerts_total{priority="CRITICAL"}` | `CriticalAmlAlertSpike` | > 5 en 10 min |
| `screening_checks_total{status="MATCH"}` | `SanctionsMatchDetected` | > 0 |
| `aml_ml_score_duration_seconds` p95 | `MlScoringSlowdown` / `MlScoringCritical` | > 2s / > 5s |
| `db_connected` | `DatabaseDown` | == 0 pendant 1 min |
| `redis_connected` | `RedisDown` | == 0 pendant 1 min |
| `nodejs_heap_size_used_bytes` / total | `HighHeapUsage` | > 90% |
| `nodejs_eventloop_lag_p99_seconds` | `HighEventLoopLag` | > 100 ms |

**Dashboards Grafana :**

Grafana est accessible sur le port 3001 (protéger avec Nginx en production) :

```bash
# Ouvrir via tunnel SSH si non exposé publiquement
ssh -L 3001:localhost:3001 user@kyc.votre-domaine.fr
# Puis accéder à : http://localhost:3001
# Identifiants : GRAFANA_USER / GRAFANA_PASSWORD (dans .env.production)
```

### 9.5 Commandes de gestion des services

```bash
# Alias utile
COMPOSE="docker compose -f /opt/kyc-aml-v2/docker/docker-compose.prod.yml --env-file /opt/kyc-aml-v2/.env.production"

# Statut de tous les services
$COMPOSE ps

# Redémarrer l'application
$COMPOSE restart app

# Redémarrer tous les services
$COMPOSE restart

# Arrêt gracieux de l'application
$COMPOSE stop app
# L'application intercepte SIGTERM et ferme les connexions proprement
# Timeout de force-kill : 10 secondes

# Arrêt complet de la plateforme
$COMPOSE down

# Arrêt + suppression des volumes (DESTRUCTIF — perte de données)
$COMPOSE down -v   # NE JAMAIS exécuter en prod sans backup préalable

# Mise à jour d'un service spécifique
$COMPOSE pull app
$COMPOSE up -d --no-deps app
```

---

## 10. Sécurité Production

### 10.1 Checklist pré-production obligatoire

- [ ] `JWT_ACCESS_SECRET` — remplacé par `openssl rand -hex 32`
- [ ] `JWT_REFRESH_SECRET` — remplacé par `openssl rand -hex 32` (valeur différente)
- [ ] `PII_ENCRYPTION_KEY` — défini (AES-256-GCM actif pour les données personnelles)
- [ ] `MFA_ENCRYPTION_KEY` — remplacé par `openssl rand -hex 32`
- [ ] `WEBHOOK_SECRET` — remplacé par `openssl rand -hex 32` et communiqué au CBS
- [ ] `ML_INTERNAL_API_KEY` — remplacé par `openssl rand -hex 32`
- [ ] `REDIS_PASSWORD` — mot de passe fort défini
- [ ] `ADMIN_PASSWORD` — valeur par défaut `ChangeMe!Admin123` remplacée
- [ ] `TRANSMISSION_MODE` — resté à `SIMULATION` jusqu'à validation, puis `PRODUCTION`
- [ ] `CORS_ORIGINS` — ne contient que le domaine de production réel
- [ ] `LOG_FORMAT=json` — activé pour production
- [ ] `.env.production` — permissions `600`, non commité dans Git
- [ ] `.gitignore` — contient `.env.production` et `.env`
- [ ] `TRACFIN_ENTITY_ID` — identifiant réel fourni par TRACFIN
- [ ] Variables `ORG_*` — coordonnées réelles de l'établissement

### 10.2 TLS/HTTPS — Configuration Nginx

Le fichier `docker/nginx.conf` configure :

- **Redirect HTTP → HTTPS** (301) pour toutes les requêtes non-ACME
- **TLS 1.2 et 1.3** uniquement (`ssl_protocols TLSv1.2 TLSv1.3`)
- **HSTS** : `max-age=31536000; includeSubDomains`
- **Certificats** : Let's Encrypt via Certbot (renouvellement automatique toutes les 12h)
- **En-têtes de sécurité** : `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`
- **Rate limiting** :
  - API générale (`/trpc/`) : 100 req/min, burst 20
  - Authentification (`/trpc/auth`) : 10 req/min, burst 5

**Renouvellement TLS automatique :**

```bash
# Certbot tourne en continu dans le conteneur certbot
# Vérifie toutes les 12h — renouvelle si < 30 jours restants

# Vérification manuelle de l'expiration
echo | openssl s_client -servername kyc.votre-domaine.fr \
  -connect kyc.votre-domaine.fr:443 2>/dev/null | \
  openssl x509 -noout -dates
```

### 10.3 Isolation réseau

```
Exposition externe :
  - Port 80  (Nginx HTTP → redirect HTTPS)
  - Port 443 (Nginx HTTPS)
  - Port 3001 (Grafana — recommandé de limiter à IP management)

Interne seulement (réseau kyc_network_prod) :
  - Port 3000 (app Node.js)
  - Port 5432 (PostgreSQL)
  - Port 6379 (Redis)
  - Port 8000 (ML service)
  - Port 9090 (Prometheus)
  - Port 3100 (Loki)
```

**Pare-feu (ufw) :**

```bash
ufw allow 22/tcp    # SSH (restreindre aux IP management si possible)
ufw allow 80/tcp    # HTTP (challenge ACME)
ufw allow 443/tcp   # HTTPS
ufw deny 5432/tcp   # PostgreSQL — jamais exposé
ufw deny 6379/tcp   # Redis — jamais exposé
ufw deny 9090/tcp   # Prometheus — jamais exposé publiquement
ufw enable
```

### 10.4 Rotation des secrets

**Procédure de rotation d'un secret :**

```bash
# 1. Générer un nouveau secret
NEW_SECRET=$(openssl rand -hex 32)

# 2. Mettre à jour .env.production
sed -i "s/^JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET=${NEW_SECRET}/" .env.production

# 3. Redémarrer l'application
docker compose -f docker/docker-compose.prod.yml \
  --env-file .env.production \
  up -d --no-deps app

# Note : La rotation de JWT_*_SECRET invalide toutes les sessions actives
# Les utilisateurs devront se reconnecter

# 4. Vérifier le health check
curl -s https://kyc.votre-domaine.fr/health
```

**Avec HashiCorp Vault :**

Configurer les variables `VAULT_*` permet à l'application de charger les secrets dynamiquement depuis Vault, permettant une rotation sans redéploiement.

### 10.5 Sécurité applicative

- **Utilisateur non-root Docker :** L'application tourne sous l'utilisateur `kyc` (uid 1001)
- **En-têtes de sécurité HTTP :** Configurés dans Nginx et dans Express (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`)
- **CORS strict :** Seules les origines listées dans `CORS_ORIGINS` sont acceptées
- **Body limit :** `express.json({ limit: "10mb" })` — protège contre les requêtes oversized
- **Chiffrement PII :** AES-256-GCM sur les données personnelles (`PII_ENCRYPTION_KEY` obligatoire)
- **MFA TOTP :** Disponible pour tous les comptes, obligatoire recommandé pour les rôles `admin` et `compliance_officer`
- **Audit logs :** Toutes les actions sensibles sont tracées dans la table `audit_logs`

---

## 11. Accès Initial Admin

### 11.1 Identifiants par défaut

Les identifiants admin initiaux sont définis dans `.env.production` :

```bash
ADMIN_EMAIL=admin@votre-banque.fr     # Email admin (à configurer)
ADMIN_PASSWORD=<généré_automatiquement> # Mot de passe fort généré par generate-secrets.sh
```

> Le compte admin est créé automatiquement au premier démarrage de l'application si aucun compte `admin` n'existe en base de données.

### 11.2 Première connexion

1. Accéder à l'interface : `https://kyc.votre-domaine.fr`
2. Se connecter avec `ADMIN_EMAIL` et `ADMIN_PASSWORD`
3. **Changer le mot de passe immédiatement** via le menu profil
4. **Activer le MFA TOTP** (paramètres de sécurité du compte)
   - Scanner le QR code avec Google Authenticator ou Aegis
   - Sauvegarder les codes de secours dans un gestionnaire de mots de passe sécurisé

### 11.3 Créer des comptes utilisateurs

L'admin peut créer des comptes via **Admin → Gestion des utilisateurs**.

**Rôles disponibles :**

| Rôle | Description | Permissions |
|------|-------------|-------------|
| `user` | Lecture seule | Consultation dashboards |
| `analyst` | Analyste AML | Traitement alertes, revue KYC, screening |
| `supervisor` | Superviseur | + Validation cas, approbation rapports |
| `compliance_officer` | Responsable compliance | + Soumission TRACFIN, configuration règles |
| `admin` | Administrateur système | Toutes permissions + gestion utilisateurs |

**Recommandation :**
- Principe du moindre privilège : attribuer le rôle minimal nécessaire
- Maximum 2-3 comptes `admin`
- Activer MFA obligatoire pour `compliance_officer` et `admin`

### 11.4 Activer le MFA pour un compte

Via l'interface (menu profil → Sécurité → Activer le MFA) :

1. Scanner le QR code TOTP
2. Saisir le code à 6 chiffres pour confirmation
3. Sauvegarder les 8 codes de secours (usage unique)

En cas de perte d'accès MFA, un admin peut désactiver le MFA d'un compte depuis **Admin → Gestion des utilisateurs**.

---

## 12. Architecture des Modules Métier

### 12.1 Authentication — `auth`

**Protocole :** JWT Bearer (access token 15 min) + Refresh token (7 jours, stocké Redis)
**MFA :** TOTP (RFC 6238) — secret chiffré AES-256-GCM en base (`MFA_ENCRYPTION_KEY`)
**Endpoints tRPC :** `auth.login`, `auth.logout`, `auth.refresh`, `auth.me`, `auth.enableMfa`, `auth.verifyMfa`

### 12.2 Customers — `customers`

**Cycle de vie KYC :** `PENDING → IN_REVIEW → APPROVED | REJECTED | EXPIRED`
**Types clients :** `INDIVIDUAL`, `CORPORATE`, `PEP`, `FOREIGN`
**Fonctionnalités :** Scoring de risque (0-100), gel des avoirs, UBOs, droit à l'effacement RGPD
**Index base :** `risk_level`, `kyc_status`, `residence_country`, `created_at`

### 12.3 Transactions — `transactions`

**Ingestion :** Via webhook CBS (`POST /webhooks/transaction`) ou saisie manuelle
**Traitement :** Moteur AML (11 règles) + Scoring ML asynchrone
**Statuts :** `PENDING → COMPLETED | FLAGGED | BLOCKED | REVERSED`
**Champs AML :** `risk_score`, `risk_rules` (JSONB audit), `is_suspicious`, `flag_reason`

### 12.4 Moteur AML — `amlRules`

12 règles actives configurables dynamiquement (base de données) sans redéploiement :

| Règle | Catégorie | Description |
|-------|-----------|-------------|
| `THRESHOLD_EXCEEDED` | THRESHOLD | Transaction unique > `AML_THRESHOLD_SINGLE_TX` |
| `STRUCTURING` | PATTERN | Fractionnement sous seuil dans `AML_STRUCTURING_WINDOW_HOURS` |
| `HIGH_FREQUENCY` | FREQUENCY | > `AML_FREQUENCY_THRESHOLD` transactions en fenêtre |
| `VOLUME_SPIKE` | VELOCITY | Variation volume > `AML_VOLUME_VARIATION_THRESHOLD`% |
| `HIGH_RISK_COUNTRY` | GEOGRAPHY | Contrepartie dans pays à risque élevé |
| `PEP_TRANSACTION` | CUSTOMER | Client ou contrepartie PEP identifié |
| `SANCTION_COUNTERPARTY` | COUNTERPARTY | Contrepartie en liste de sanctions |
| `ROUND_AMOUNT` | PATTERN | Montant rond suspect (multiple de 1000) |
| `UNUSUAL_CHANNEL` | PATTERN | Canal inhabituel pour le profil client |
| `HAWALA_PATTERN` | PATTERN | Schéma hawala détecté (géographie + montants) |
| `MENA_STRUCTURING` | PATTERN | Structuring spécifique aux corridors MENA |
| `CASH_INTENSIVE` | PATTERN | Concentration de transactions espèces |

**Backtesting :** Table `aml_rule_executions` — audit de chaque exécution de règle avec performance (`execution_ms`).

**Feedback loop ML :** Table `aml_rule_feedback` — décisions analystes (faux positifs/vrais positifs) alimentent le réentraînement ML.

### 12.5 Alerts — `alerts`

**Workflow :** `OPEN → IN_REVIEW → CLOSED | FALSE_POSITIVE | ESCALATED`
**Types :** `THRESHOLD`, `PATTERN`, `VELOCITY`, `SANCTIONS`, `PEP`, `FRAUD`, `NETWORK`
**Priorités :** `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
**Fonctionnalités :** Assignation à analyste, enrichissement contextuel, résolution avec motif

### 12.6 Cases — `cases`

**Workflow SAR :**

```
OPEN → UNDER_INVESTIGATION → PENDING_APPROVAL → SAR_SUBMITTED
                                              → CLOSED
                           → ESCALATED
```

**Décisions :** `PENDING`, `CLOSED_NO_ACTION`, `ESCALATED`, `SAR_FILED`, `STR_FILED`
**Fonctionnalités :** Timeline d'actions, alertes liées, supervision hiérarchique, génération rapport TRACFIN XML

### 12.7 Screening — `screening`

**Listes vérifiées :** OFAC SDN, EU Sanctions, UN Consolidated, UK OFSI, BAM/ANRF, PEP (OpenSanctions)
**Types :** `SANCTIONS`, `PEP`, `ADVERSE_MEDIA`
**Statuts :** `CLEAR`, `MATCH`, `REVIEW`, `PENDING`
**Algorithme :** Distance de Levenshtein normalisée — seuil MATCH: 80, seuil REVIEW: 50
**Scheduler :** Mise à jour automatique des listes à 02:00 UTC (`SCREENING_UPDATE_CRON`)

### 12.8 Reports — `reports`

**Types :** `SAR`, `STR`, `AML_STATISTICS`, `RISK_ASSESSMENT`, `COMPLIANCE`, `CUSTOM`
**Formats de sortie :** PDF (pdfmake), DOCX (docx), XML TRACFIN (xml2js)
**Workflow :** `DRAFT → REVIEW → SUBMITTED | APPROVED | REJECTED`

### 12.9 pKYC — Perpetual KYC (`pkyc`)

Analyse nocturne de dérive comportementale à 01:00 UTC (`PKYC_CRON`).

**Score de dérive (0-100) — 5 facteurs pondérés :**

| Facteur | Poids | Description |
|---------|-------|-------------|
| `volumeDrift` | 25% | Dérive du volume total de transactions |
| `frequencyDrift` | 20% | Dérive de la fréquence transactionnelle |
| `geoDrift` | 30% | Apparition de nouveaux pays (poids maximal) |
| `amountSpike` | 15% | Pic sur le montant moyen par transaction |
| `newCounterparties` | 10% | Nouvelles contreparties non vues en baseline |

**Déclenchement revue :** Score > `PKYC_DRIFT_THRESHOLD` (défaut: 40) → revue KYC déclenchée
**Fenêtre baseline :** `PKYC_BASELINE_DAYS` jours (défaut: 30)
**Fenêtre analyse :** `PKYC_WINDOW_DAYS` jours récents (défaut: 7)
**Historique :** Table `pkyc_snapshots` — un enregistrement par client par exécution

### 12.10 ML — Scoring et réentraînement

**Objet :** Enrichissement du score de risque AML par un modèle ML supervisé
**Protocole :** HTTP REST interne vers `http://ml:8000` (Python FastAPI)
**Authentification :** `X-Api-Key: $ML_INTERNAL_API_KEY`
**Réentraînement :** Dimanche 03:00 UTC sur 180 jours d'historique de décisions analystes
**Métriques :** `aml_ml_score_duration_seconds` (histogram Prometheus)

### 12.11 AMLD6 — Compliance infractions prédicats

Module de conformité aux 22 infractions prédicats de la 6ème Directive Anti-Blanchiment de l'UE (AMLD6), permettant de qualifier juridiquement les cas de blanchiment détectés.

### 12.12 Network — Graphe de relations

Analyse des relations entre entités (clients, contreparties, bénéficiaires) pour détecter les réseaux complexes de transactions et les structures opaques.

### 12.13 Documents — eKYC et stockage

**Fonctionnalités :** Upload multipart (`POST /api/documents/upload`), OCR (Tesseract local ou provider externe), analyse MRZ, vérification eKYC
**Statuts eKYC :** `PENDING → PROCESSING → PASS | REVIEW | FAIL`
**Stockage :** Local (`./uploads`) ou S3/MinIO (`STORAGE_BACKEND=s3`)
**Types :** `PASSPORT`, `ID_CARD`, `DRIVING_LICENSE`, `PROOF_OF_ADDRESS`, `SELFIE`, `BANK_STATEMENT`, `OTHER`

### 12.14 Admin — Gestion et configuration

**Fonctionnalités :** Gestion des utilisateurs et rôles, configuration des règles AML dynamiques, configuration des profils de juridictions, paramètres système, audit logs.

---

## 13. Support et Contact

### 13.1 Collecte des logs pour diagnostic

```bash
# Créer une archive de diagnostic
cd /opt/kyc-aml-v2

# Logs des 2 dernières heures, tous services
docker compose -f docker/docker-compose.prod.yml logs \
  --since 2h --no-color \
  > /tmp/kyc_aml_logs_$(date +%Y%m%d_%H%M%S).txt

# État des conteneurs
docker compose -f docker/docker-compose.prod.yml ps \
  >> /tmp/kyc_aml_logs_$(date +%Y%m%d_%H%M%S).txt

# Health check
curl -s https://kyc.votre-domaine.fr/health | python3 -m json.tool \
  >> /tmp/kyc_aml_logs_$(date +%Y%m%d_%H%M%S).txt

# Utilisation ressources
docker stats --no-stream \
  >> /tmp/kyc_aml_logs_$(date +%Y%m%d_%H%M%S).txt

# Compresser
gzip /tmp/kyc_aml_logs_*.txt
```

### 13.2 Signalement d'incidents

**Incident de sécurité (breach, fuite de données) :**

1. Isoler immédiatement le serveur : `ufw deny 443` et `ufw deny 80`
2. Conserver les logs Docker avant tout redémarrage
3. Contacter l'équipe sécurité et le DPO dans les 72h (obligation RGPD)
4. Ne pas supprimer de données sans accord du DPO

**Incident opérationnel (indisponibilité, perte de données) :**

1. Vérifier le health check : `curl https://kyc.votre-domaine.fr/health`
2. Consulter les logs : `docker compose logs -f --tail=500 app`
3. Vérifier les alertes Grafana : port 3001
4. Rollback si nécessaire : `./docker/restore.sh latest`

### 13.3 Checklist pré-production complète

#### Sécurité
- [ ] Tous les secrets remplacés (voir section 3.19)
- [ ] `PII_ENCRYPTION_KEY` définie (données personnelles chiffrées)
- [ ] `MFA_ENCRYPTION_KEY` définie
- [ ] TLS Let's Encrypt provisionné (`./scripts/init-tls.sh`)
- [ ] Pare-feu configuré (ports 5432, 6379, 9090 fermés)
- [ ] `.env.production` en chmod 600 et exclu de git
- [ ] Compte admin — mot de passe changé + MFA activé

#### Infrastructure
- [ ] Tous les conteneurs en statut `healthy` (`docker compose ps`)
- [ ] Health check retourne `status: healthy`
- [ ] Backup automatique actif (vérifier logs `kyc_backup`)
- [ ] Volumes Docker persistants créés

#### Conformité
- [ ] `TRACFIN_ENTITY_ID` renseigné
- [ ] Variables `ORG_*` renseignées (coordonnées établissement)
- [ ] `TRANSMISSION_MODE` validé (SIMULATION → PRODUCTION après go-live)
- [ ] Listes de sanctions à jour (vérifier `SCREENING_STALE_THRESHOLD_HOURS`)
- [ ] Profils de juridictions configurés (Admin → Juridictions)

#### Intégrations
- [ ] Webhook CBS testé (signature HMAC validée)
- [ ] Service ML opérationnel (`curl http://ml:8000/health` depuis le conteneur app)
- [ ] Provider eKYC configuré et testé
- [ ] Alertes Prometheus actives (Grafana → Alerting)

#### Opérationnel
- [ ] Comptes analystes créés
- [ ] Documentation remise aux utilisateurs
- [ ] Procédure de backup testée (test de restauration sur environnement de staging)
- [ ] CI/CD secrets GitHub configurés
- [ ] Premier déploiement CI/CD validé sur staging avant production

---

*Documentation générée pour KYC-AML Platform v2.0.0 — Confidentiel*
