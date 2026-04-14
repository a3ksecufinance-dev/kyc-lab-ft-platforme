# Guide de Déploiement On-Premises — KYC-AML Platform v2.5
## Installation sur infrastructure cliente

> **Classification :** CONFIDENTIEL — Document remis au client
> **Version plateforme :** 2.5
> **Date :** Avril 2026
> **Contact :** a.bensleten@cyberstrat.ma

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Prérequis serveur](#2-prérequis-serveur)
3. [Architecture on-premises recommandée](#3-architecture-on-premises-recommandée)
4. [Installation des dépendances système](#4-installation-des-dépendances-système)
5. [Configuration PostgreSQL](#5-configuration-postgresql)
6. [Configuration Redis](#6-configuration-redis)
7. [Déploiement de l'application](#7-déploiement-de-lapplication)
8. [Variables d'environnement](#8-variables-denvironnement)
9. [Configuration Nginx et TLS](#9-configuration-nginx-et-tls)
10. [Service systemd](#10-service-systemd)
11. [Déploiement Docker Compose (alternatif)](#11-déploiement-docker-compose-alternatif)
12. [Migration base de données](#12-migration-base-de-données)
13. [Premier démarrage et compte admin](#13-premier-démarrage-et-compte-admin)
14. [Sauvegarde on-premises](#14-sauvegarde-on-premises)
15. [Monitoring interne](#15-monitoring-interne)
16. [Mise à jour (release)](#16-mise-à-jour-release)
17. [Réseau et sécurité périmétrique](#17-réseau-et-sécurité-périmétrique)
18. [Checklist go-live](#18-checklist-go-live)
19. [Procédures d'urgence](#19-procédures-durgence)

---

## 1. Vue d'ensemble

### Topologie on-premises

```
LAN Interne Client
──────────────────────────────────────────────────────────────────

  [Firewall / Proxy]
         │
         │ HTTPS :443
         ▼
  ┌──────────────────┐        ┌────────────────────┐
  │   Serveur Web    │        │  Serveur BD        │
  │   (APP + Nginx)  │◄──────►│  PostgreSQL 15     │
  │   Node.js 20     │        │  Redis 7           │
  │   Port 3000      │        │  Port 5432 / 6379  │
  └──────────────────┘        └────────────────────┘
         │
         ▼
  [NAS / SAN interne]
  Stockage documents KYC


  OU topology monobloc (petite installation) :
  ┌────────────────────────────────────────────┐
  │         Serveur unique                     │
  │  Nginx :443 → Node.js :3000                │
  │  PostgreSQL :5432                          │
  │  Redis :6379                               │
  │  Stockage local /opt/kyc-aml/uploads       │
  └────────────────────────────────────────────┘
```

### Modèles de déploiement

| Modèle | Usage | Nb serveurs |
|---|---|---|
| **Monobloc** | < 2 000 clients, équipe ≤ 10 utilisateurs | 1 |
| **2 serveurs** | 2 000–20 000 clients, HA partielle | 2 |
| **Haute disponibilité** | > 20 000 clients, SLA exigeant | 3+ |

---

## 2. Prérequis serveur

### Dimensionnement

| Modèle | CPU | RAM | Disque OS | Disque données |
|---|---|---|---|---|
| **Monobloc** | 4 cœurs | 8 GB | 50 GB SSD | 200 GB SSD |
| **App Server** | 4 cœurs | 8 GB | 50 GB SSD | 50 GB SSD |
| **DB Server** | 4 cœurs | 16 GB | 50 GB SSD | 500 GB SSD (RAID 1) |
| **HA (chaque nœud)** | 8 cœurs | 16 GB | 100 GB SSD | 1 TB SSD |

### Systèmes d'exploitation supportés

| OS | Version | Statut |
|---|---|---|
| Ubuntu Server | 22.04 LTS | ✅ Recommandé |
| Ubuntu Server | 20.04 LTS | ✅ Supporté |
| Debian | 12 (Bookworm) | ✅ Supporté |
| RHEL / CentOS Stream | 8, 9 | ✅ Supporté |
| Oracle Linux | 8, 9 | ✅ Supporté |
| Windows Server | 2022 | ⚠️ Via WSL2 ou Docker |

### Réseau requis

- IP fixe sur le réseau interne (ex: `192.168.1.50`)
- Sortie Internet pour : mises à jour, listes sanctions OFAC/ONU/UE (HTTPS 443)
- Ports internes ouverts :
  - `443` (HTTPS) — accès utilisateurs
  - `80` (HTTP) → redirection HTTPS
  - `3000` (interne uniquement) — Node.js
  - `5432` (interne uniquement) — PostgreSQL
  - `6379` (interne uniquement) — Redis
  - `22` — SSH pour maintenance (limiter aux IP d'administration)

---

## 3. Architecture on-premises recommandée

### Option A — Monobloc (recommandé pour démarrage)

```
Serveur unique Ubuntu 22.04
├── Nginx            (proxy HTTPS → :3000)
├── Node.js 20       (application, port 3000)
├── PostgreSQL 15    (port 5432, localhost only)
└── Redis 7          (port 6379, localhost only)
```

### Option B — 2 serveurs séparés (production)

```
Serveur APP [192.168.1.50]        Serveur DB [192.168.1.51]
├── Nginx :443                    ├── PostgreSQL 15 :5432
└── Node.js :3000                 └── Redis 7 :6379
```

### Option C — Haute disponibilité (critique)

```
[Load Balancer HAProxy]
       ├── APP-1 (actif)
       └── APP-2 (standby)
              ↓
[PostgreSQL Primary] ──streaming replication──► [PostgreSQL Replica]
[Redis Sentinel]     ──replication──────────── [Redis Replica]
```

---

## 4. Installation des dépendances système

### Ubuntu 22.04 — Installation complète

```bash
# Mise à jour du système
sudo apt update && sudo apt upgrade -y

# ── Node.js 20 LTS ───────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # doit afficher v20.x.x

# ── pnpm ─────────────────────────────────────────────────────────
sudo npm install -g pnpm
pnpm --version

# ── PostgreSQL 15 ────────────────────────────────────────────────
sudo apt install -y postgresql-15 postgresql-client-15
sudo systemctl enable --now postgresql
sudo systemctl status postgresql   # doit être active (running)

# ── Redis 7 ──────────────────────────────────────────────────────
sudo apt install -y redis-server
sudo systemctl enable --now redis-server

# ── Nginx ────────────────────────────────────────────────────────
sudo apt install -y nginx
sudo systemctl enable --now nginx

# ── Outils utilitaires ───────────────────────────────────────────
sudo apt install -y git curl wget unzip certbot python3-certbot-nginx \
  htop iotop net-tools ufw fail2ban

# ── Pare-feu UFW ─────────────────────────────────────────────────
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

### RHEL / Oracle Linux 9

```bash
# Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# PostgreSQL 15
sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm
sudo dnf -qy module disable postgresql
sudo dnf install -y postgresql15-server postgresql15
sudo /usr/pgsql-15/bin/postgresql-15-setup initdb
sudo systemctl enable --now postgresql-15

# Redis 7
sudo dnf install -y redis7
sudo systemctl enable --now redis7

# Nginx
sudo dnf install -y nginx
sudo systemctl enable --now nginx
```

---

## 5. Configuration PostgreSQL

```bash
# Créer l'utilisateur et la base de données
sudo -u postgres psql << 'EOF'
CREATE USER kyc_user WITH PASSWORD 'CHANGER_CE_MOT_DE_PASSE_FORT';
CREATE DATABASE kyc_aml OWNER kyc_user ENCODING 'UTF8' LC_COLLATE 'fr_FR.UTF-8' LC_CTYPE 'fr_FR.UTF-8' TEMPLATE template0;
GRANT ALL PRIVILEGES ON DATABASE kyc_aml TO kyc_user;
\q
EOF

# Activer l'extension pgcrypto (pour chiffrement données sensibles)
sudo -u postgres psql -d kyc_aml -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
sudo -u postgres psql -d kyc_aml -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

### Sécurisation PostgreSQL

```bash
# Éditer pg_hba.conf pour limiter les accès
sudo nano /etc/postgresql/15/main/pg_hba.conf
```

Remplacer le contenu par :
```
# TYPE  DATABASE   USER      ADDRESS         METHOD
local   all        postgres                  peer
local   kyc_aml    kyc_user                  md5
host    kyc_aml    kyc_user  127.0.0.1/32    scram-sha-256
host    kyc_aml    kyc_user  ::1/128         scram-sha-256
# Si serveur DB séparé, ajouter l'IP du serveur APP :
# host  kyc_aml    kyc_user  192.168.1.50/32 scram-sha-256
```

```bash
# Paramètres de performance
sudo nano /etc/postgresql/15/main/postgresql.conf
```

```ini
# Performance (adapter selon la RAM disponible — exemple 16 GB)
max_connections            = 200
shared_buffers             = 4GB
effective_cache_size       = 12GB
maintenance_work_mem       = 1GB
checkpoint_completion_target = 0.9
wal_buffers                = 64MB
default_statistics_target  = 100
random_page_cost           = 1.1
effective_io_concurrency   = 200

# Logging (audit)
log_destination            = 'stderr'
logging_collector          = on
log_directory              = '/var/log/postgresql'
log_filename               = 'postgresql-%Y-%m-%d.log'
log_rotation_age           = 1d
log_rotation_size          = 100MB
log_min_duration_statement = 1000    # Log requêtes > 1s
log_connections            = on
log_disconnections         = on
```

```bash
sudo systemctl restart postgresql
# Vérifier la connexion
psql "postgresql://kyc_user:VOTRE_PASS@localhost:5432/kyc_aml" -c "SELECT version();"
```

---

## 6. Configuration Redis

```bash
sudo nano /etc/redis/redis.conf
```

Modifier ces paramètres :
```ini
# Sécurité — écouter seulement localhost
bind 127.0.0.1 ::1

# Mot de passe obligatoire
requirepass CHANGER_CE_MOT_DE_PASSE_REDIS

# Persistance (évite de perdre les listes sanctions au redémarrage)
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Mémoire maximale
maxmemory 2gb
maxmemory-policy allkeys-lru

# Désactiver les commandes dangereuses
rename-command FLUSHALL ""
rename-command FLUSHDB  ""
rename-command CONFIG   ""
rename-command DEBUG    ""
```

```bash
sudo systemctl restart redis-server
# Tester la connexion
redis-cli -a "VOTRE_MOT_DE_PASSE_REDIS" ping
# → PONG
```

---

## 7. Déploiement de l'application

```bash
# Créer le répertoire de l'application
sudo mkdir -p /opt/kyc-aml
sudo chown -R $USER:$USER /opt/kyc-aml

# Transférer les fichiers (depuis le poste de déploiement)
# Option 1 : via SCP
scp -r ./dist             user@192.168.1.50:/opt/kyc-aml/
scp -r ./drizzle          user@192.168.1.50:/opt/kyc-aml/
scp    ./package.json     user@192.168.1.50:/opt/kyc-aml/

# Option 2 : via Git (si le serveur a accès au dépôt)
cd /opt/kyc-aml
git clone https://github.com/votre-org/kyc-aml.git .
pnpm install --frozen-lockfile --prod
pnpm build

# Créer le fichier .env (voir section 8)
sudo nano /opt/kyc-aml/.env
sudo chmod 600 /opt/kyc-aml/.env
sudo chown root:root /opt/kyc-aml/.env

# Créer le répertoire uploads
sudo mkdir -p /opt/kyc-aml/uploads
sudo chown -R node:node /opt/kyc-aml
```

---

## 8. Variables d'environnement

Fichier `/opt/kyc-aml/.env` — **permissions 600, propriétaire root** :

```ini
# ── Application ─────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://kyc.intranet.client.ma
CORS_ORIGINS=https://kyc.intranet.client.ma

# ── Base de données ─────────────────────────────────────────────
DATABASE_URL=postgresql://kyc_user:VOTRE_PASS_PG@127.0.0.1:5432/kyc_aml

# ── Redis ───────────────────────────────────────────────────────
REDIS_URL=redis://:VOTRE_PASS_REDIS@127.0.0.1:6379

# ── Secrets cryptographiques ────────────────────────────────────
# Générer : openssl rand -hex 64
JWT_ACCESS_SECRET=<générer>
JWT_REFRESH_SECRET=<générer>
# Générer : openssl rand -hex 32
MFA_ENCRYPTION_KEY=<générer>
PII_ENCRYPTION_KEY=<générer>

# ── Email interne (serveur SMTP du client) ───────────────────────
SMTP_HOST=smtp.intranet.client.ma
SMTP_PORT=587
SMTP_USER=kyc-aml@client.ma
SMTP_PASS=<mot-de-passe>
SMTP_FROM=KYC-AML <kyc-aml@client.ma>

# ── Stockage documents ──────────────────────────────────────────
UPLOAD_DIR=/opt/kyc-aml/uploads

# ── CBS (Core Banking) ──────────────────────────────────────────
CBS_MODE=mock             # mock | live
# CBS_BASE_URL=http://cbs.intranet.client.ma/api/v2
# CBS_API_KEY=<clé-api>

# ── Screening ───────────────────────────────────────────────────
SCREENING_MATCH_THRESHOLD=80
SCREENING_REVIEW_THRESHOLD=50
SCREENING_STALE_THRESHOLD_HOURS=48

# ── Institution ─────────────────────────────────────────────────
INSTITUTION_TYPE=CLASSIC_BANK

# ── Rate limiting ───────────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=200
```

**Génération des secrets (à exécuter sur le serveur) :**
```bash
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 64)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 64)"
echo "MFA_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "PII_ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

> ⚠️ Conserver ces valeurs dans un coffre-fort numérique (KeePass, HashiCorp Vault interne).
> Ne **jamais** les changer après la mise en production sans procédure de migration.

---

## 9. Configuration Nginx et TLS

### Certificat SSL

**Option A — Let's Encrypt (serveur accessible depuis Internet)**
```bash
sudo certbot --nginx -d kyc.votre-domaine.ma \
  --email a.bensleten@cyberstrat.ma \
  --agree-tos --non-interactive

# Renouvellement automatique
echo "0 3 1 * * root certbot renew --quiet && nginx -s reload" \
  | sudo tee -a /etc/cron.d/certbot-renew
```

**Option B — Certificat interne (PKI d'entreprise)**
```bash
# Copier les certificats fournis par le service IT
sudo cp votre-certificat.crt /etc/ssl/certs/kyc-aml.crt
sudo cp votre-cle-privee.key  /etc/ssl/private/kyc-aml.key
sudo chmod 640 /etc/ssl/private/kyc-aml.key
sudo chown root:ssl-cert /etc/ssl/private/kyc-aml.key
```

**Option C — Certificat auto-signé (test/staging uniquement)**
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/kyc-aml.key \
  -out /etc/ssl/certs/kyc-aml.crt \
  -subj "/C=MA/ST=Casablanca/O=Client/CN=kyc.intranet.client.ma"
```

### Configuration Nginx

```bash
sudo nano /etc/nginx/sites-available/kyc-aml
```

```nginx
# /etc/nginx/sites-available/kyc-aml

# Redirection HTTP → HTTPS
server {
    listen      80;
    listen      [::]:80;
    server_name kyc.votre-domaine.ma;
    return 301  https://$host$request_uri;
}

server {
    listen      443 ssl http2;
    listen      [::]:443 ssl http2;
    server_name kyc.votre-domaine.ma;

    # Certificat SSL
    ssl_certificate     /etc/letsencrypt/live/kyc.votre-domaine.ma/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kyc.votre-domaine.ma/privkey.pem;

    # Protocoles et ciphers sécurisés
    ssl_protocols             TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers               ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_session_timeout       1d;
    ssl_session_cache         shared:SSL:10m;
    ssl_stapling              on;
    ssl_stapling_verify       on;

    # En-têtes de sécurité
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options            DENY                                  always;
    add_header X-Content-Type-Options     nosniff                               always;
    add_header X-XSS-Protection           "1; mode=block"                       always;
    add_header Referrer-Policy            "strict-origin-when-cross-origin"     always;

    # Taille maximale pour l'upload de documents (20 MB)
    client_max_body_size 20M;

    # Proxy vers l'application Node.js
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "keep-alive";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    # Logs d'accès
    access_log /var/log/nginx/kyc-aml-access.log;
    error_log  /var/log/nginx/kyc-aml-error.log warn;
}
```

```bash
# Activer la configuration
sudo ln -s /etc/nginx/sites-available/kyc-aml /etc/nginx/sites-enabled/
sudo nginx -t        # Vérification de la syntaxe
sudo systemctl reload nginx
```

---

## 10. Service systemd

```bash
sudo nano /etc/systemd/system/kyc-aml.service
```

```ini
[Unit]
Description=KYC-AML Platform v2.5
Documentation=https://cyberstrat.ma
After=network.target postgresql.service redis-server.service
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=node
Group=node
WorkingDirectory=/opt/kyc-aml
EnvironmentFile=/opt/kyc-aml/.env

# Commande de démarrage
ExecStart=/usr/bin/node dist/server/index.js

# Redémarrage automatique
Restart=always
RestartSec=5
StartLimitBurst=5
StartLimitIntervalSec=60

# Sécurité système
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/kyc-aml/uploads /tmp

# Logs
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kyc-aml

[Install]
WantedBy=multi-user.target
```

```bash
# Créer l'utilisateur système dédié
sudo useradd --system --no-create-home --shell /bin/false node 2>/dev/null || true

# Permissions
sudo chown -R node:node /opt/kyc-aml
sudo chmod 750 /opt/kyc-aml

# Activer et démarrer
sudo systemctl daemon-reload
sudo systemctl enable kyc-aml
sudo systemctl start  kyc-aml

# Vérifier le statut
sudo systemctl status kyc-aml
sudo journalctl -u kyc-aml -n 50 --no-pager
```

---

## 11. Déploiement Docker Compose (alternatif)

Si Docker est disponible sur le serveur, cette méthode simplifie la gestion.

### Installation Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo systemctl enable --now docker
```

### docker-compose.yml

```yaml
# /opt/kyc-aml/docker-compose.yml

services:

  app:
    image: kyc-aml:v2.5          # ou chemin vers l'archive .tar
    # build: .                   # décommenter pour build local
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:3000:3000"   # exposer seulement sur localhost (Nginx devant)
    volumes:
      - uploads:/opt/kyc-aml/uploads
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB:       kyc_aml
      POSTGRES_USER:     kyc_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}   # depuis .env
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kyc_user -d kyc_aml"]
      interval: 10s
      timeout: 5s
      retries: 5
    # Ne pas exposer PostgreSQL sur le réseau externe
    expose:
      - "5432"

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 2gb
      --maxmemory-policy allkeys-lru
      --appendonly yes
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    expose:
      - "6379"

volumes:
  pgdata:
  redisdata:
  uploads:
```

```bash
# Démarrage
cd /opt/kyc-aml
docker compose up -d

# Vérification
docker compose ps
docker compose logs -f app

# Arrêt propre
docker compose down
```

---

## 12. Migration base de données

```bash
# Migration initiale (avant le premier démarrage)
# Si déploiement direct Node.js :
DATABASE_URL="postgresql://kyc_user:PASS@127.0.0.1:5432/kyc_aml" \
  npx drizzle-kit migrate

# Si déploiement Docker Compose :
docker compose run --rm app \
  node -e "import('./dist/server/scripts/migrate.js').then(m => m.runMigrations())"

# Vérifier les tables créées
psql "postgresql://kyc_user:PASS@127.0.0.1:5432/kyc_aml" \
  -c "\dt" | head -30
```

> Les migrations sont **idempotentes** — il est safe de les relancer à chaque déploiement.

---

## 13. Premier démarrage et compte admin

### Vérifier que l'application répond

```bash
curl -s http://localhost:3000/api/health
# Réponse attendue :
# {"status":"ok","db":"connected","redis":"connected","version":"2.5.0"}
```

### Créer le compte administrateur initial

**Via SQL (méthode directe) :**
```bash
# Générer le hash du mot de passe (bcrypt rounds=12)
node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('MotDePasseForte123!', 12).then(h => console.log(h));
"

# Insérer l'administrateur
psql "postgresql://kyc_user:PASS@127.0.0.1:5432/kyc_aml" << EOF
INSERT INTO users (email, name, password_hash, role, is_active, created_at, updated_at)
VALUES (
  'admin@votre-domaine.ma',
  'Administrateur',
  '\$2a\$12\$LE_HASH_GENERE_CI_DESSUS',
  'admin',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;
EOF
```

**Via l'API (si un token bootstrap est disponible) :**
```bash
curl -X POST https://kyc.votre-domaine.ma/api/trpc/auth.register \
  -H "Content-Type: application/json" \
  -d '{"json":{"email":"admin@votre-domaine.ma","name":"Admin","password":"MotDePasseForte123!"}}'
# Puis mettre le rôle admin via SQL ou interface
```

### Première connexion

1. Accéder à `https://kyc.votre-domaine.ma`
2. Se connecter avec `admin@votre-domaine.ma`
3. Aller dans **Admin** → Créer les comptes utilisateurs
4. Activer le **MFA** sur le compte admin (fortement recommandé)
5. Configurer le **type d'institution** si nécessaire

---

## 14. Sauvegarde on-premises

### Script de sauvegarde automatique

```bash
sudo nano /opt/kyc-aml/scripts/backup.sh
sudo chmod +x /opt/kyc-aml/scripts/backup.sh
```

```bash
#!/bin/bash
# /opt/kyc-aml/scripts/backup.sh
# Sauvegarde complète : base de données + documents uploadés

set -euo pipefail

BACKUP_DIR="/var/backups/kyc-aml"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Variables (adapter selon votre configuration)
DB_URL="postgresql://kyc_user:VOTRE_PASS@127.0.0.1:5432/kyc_aml"
UPLOAD_DIR="/opt/kyc-aml/uploads"

mkdir -p "${BACKUP_DIR}/db"
mkdir -p "${BACKUP_DIR}/uploads"

# ── Dump PostgreSQL ───────────────────────────────────────────────
echo "[$(date)] Sauvegarde base de données..."
pg_dump "${DB_URL}" \
  --format=custom \
  --compress=9 \
  --no-password \
  --file="${BACKUP_DIR}/db/kyc_aml_${DATE}.dump"

echo "[$(date)] ✅ DB sauvegardée : kyc_aml_${DATE}.dump"

# ── Sauvegarde des documents ─────────────────────────────────────
echo "[$(date)] Sauvegarde des documents uploadés..."
tar -czf "${BACKUP_DIR}/uploads/uploads_${DATE}.tar.gz" \
  -C "$(dirname ${UPLOAD_DIR})" \
  "$(basename ${UPLOAD_DIR})"

echo "[$(date)] ✅ Documents sauvegardés : uploads_${DATE}.tar.gz"

# ── Nettoyage des anciennes sauvegardes ─────────────────────────
find "${BACKUP_DIR}" -name "*.dump" -mtime +${RETENTION_DAYS} -delete
find "${BACKUP_DIR}" -name "*.tar.gz" -mtime +${RETENTION_DAYS} -delete

echo "[$(date)] ✅ Sauvegarde terminée. Espace utilisé : $(du -sh ${BACKUP_DIR} | cut -f1)"
```

### Planification crontab

```bash
sudo crontab -e
```

```cron
# Sauvegarde quotidienne à 02h00
0 2 * * * /opt/kyc-aml/scripts/backup.sh >> /var/log/kyc-aml-backup.log 2>&1

# Vérification hebdomadaire (test de restauration partielle)
0 4 * * 0 pg_restore --list /var/backups/kyc-aml/db/$(ls -t /var/backups/kyc-aml/db/*.dump | head -1) > /dev/null && echo "OK" || echo "ERREUR BACKUP"
```

### Restauration

```bash
# Identifier la sauvegarde
ls -lh /var/backups/kyc-aml/db/

# Restaurer la base de données
pg_restore \
  --dbname="postgresql://kyc_user:PASS@127.0.0.1:5432/kyc_aml" \
  --clean \
  --if-exists \
  --no-owner \
  /var/backups/kyc-aml/db/kyc_aml_YYYYMMDD_HHMMSS.dump

# Restaurer les documents
sudo tar -xzf /var/backups/kyc-aml/uploads/uploads_YYYYMMDD_HHMMSS.tar.gz \
  -C /opt/kyc-aml/

# Relancer l'application
sudo systemctl restart kyc-aml
```

---

## 15. Monitoring interne

### Surveillance du service

```bash
# Statut en temps réel
sudo systemctl status kyc-aml
sudo journalctl -u kyc-aml -f          # logs en direct
sudo journalctl -u kyc-aml --since "1 hour ago"

# Health check
watch -n 30 "curl -s http://localhost:3000/api/health | python3 -m json.tool"

# Ressources système
htop
iotop
df -h /opt/kyc-aml/uploads
```

### Script de surveillance simple

```bash
sudo nano /opt/kyc-aml/scripts/healthcheck.sh
```

```bash
#!/bin/bash
# Alerte par email si l'application ne répond pas

HEALTH_URL="http://localhost:3000/api/health"
ALERT_EMAIL="admin@votre-domaine.ma"
APP_NAME="KYC-AML Platform"

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${HEALTH_URL}")

if [ "${RESPONSE}" != "200" ]; then
  echo "⚠️ ${APP_NAME} ne répond pas (HTTP ${RESPONSE}) — $(date)" | \
    mail -s "ALERTE: ${APP_NAME} DOWN" "${ALERT_EMAIL}"

  # Tentative de redémarrage automatique
  sudo systemctl restart kyc-aml
  echo "Redémarrage automatique tenté — $(date)" >> /var/log/kyc-aml-health.log
fi
```

```bash
# Vérification toutes les 5 minutes
echo "*/5 * * * * /opt/kyc-aml/scripts/healthcheck.sh" | sudo crontab -
```

### Rotation des logs

```bash
sudo nano /etc/logrotate.d/kyc-aml
```

```
/var/log/nginx/kyc-aml-*.log
/var/log/kyc-aml-backup.log
/var/log/kyc-aml-health.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        nginx -s reopen
    endscript
}
```

---

## 16. Mise à jour (release)

```bash
#!/bin/bash
# /opt/kyc-aml/scripts/update.sh — Procédure de mise à jour

set -euo pipefail

NEW_VERSION="${1:-}"
if [ -z "${NEW_VERSION}" ]; then
    echo "Usage: $0 <version>"
    echo "Exemple: $0 v2.6"
    exit 1
fi

echo "=== Mise à jour KYC-AML vers ${NEW_VERSION} ==="

# 1. Sauvegarde préalable
echo "[1/6] Sauvegarde de sécurité..."
/opt/kyc-aml/scripts/backup.sh

# 2. Récupérer la nouvelle version
echo "[2/6] Téléchargement de la nouvelle version..."
# Via SCP depuis le poste Cyberstrat :
# scp -r dist/ user@192.168.1.50:/opt/kyc-aml/dist-new/
# Ou via Git :
# git pull origin main

# 3. Exécuter les migrations
echo "[3/6] Migration base de données..."
DATABASE_URL="$(grep DATABASE_URL /opt/kyc-aml/.env | cut -d= -f2-)" \
    node /opt/kyc-aml/dist-new/server/scripts/migrate.js

# 4. Remplacer les fichiers
echo "[4/6] Déploiement des nouveaux fichiers..."
sudo systemctl stop kyc-aml
sudo rsync -av --delete /opt/kyc-aml/dist-new/ /opt/kyc-aml/dist/
sudo rm -rf /opt/kyc-aml/dist-new

# 5. Redémarrer
echo "[5/6] Redémarrage du service..."
sudo systemctl start kyc-aml
sleep 5

# 6. Vérification
echo "[6/6] Vérification..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
if [ "${HEALTH}" = "200" ]; then
    echo "✅ Mise à jour réussie — KYC-AML ${NEW_VERSION} opérationnel"
else
    echo "❌ ERREUR — L'application ne répond pas (HTTP ${HEALTH})"
    echo "Rollback : restaurer /var/backups/kyc-aml/db/ et relancer l'ancienne version"
    exit 1
fi
```

---

## 17. Réseau et sécurité périmétrique

### Règles pare-feu (UFW)

```bash
# Réinitialiser et configurer
sudo ufw --force reset

# SSH — limiter aux IP d'administration
sudo ufw allow from 192.168.1.0/24 to any port 22

# Web — tout le monde
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# PostgreSQL et Redis — localhost uniquement (pas de règle = bloqué par défaut)
# Si serveur DB séparé :
# sudo ufw allow from 192.168.1.50 to any port 5432
# sudo ufw allow from 192.168.1.50 to any port 6379

sudo ufw --force enable
sudo ufw status verbose
```

### Fail2ban — Protection anti-brute-force

```bash
sudo nano /etc/fail2ban/jail.local
```

```ini
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled  = true
port     = ssh
maxretry = 3
bantime  = 86400

[nginx-http-auth]
enabled  = true

[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
action   = iptables-multiport[name=ReqLimit, port="http,https"]
logpath  = /var/log/nginx/kyc-aml-error.log
findtime = 600
maxretry = 10
bantime  = 7200
```

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
```

### Durcissement SSH

```bash
sudo nano /etc/ssh/sshd_config
```

```
PermitRootLogin            no
PasswordAuthentication     no      # Clés SSH uniquement
PubkeyAuthentication       yes
MaxAuthTries               3
ClientAliveInterval        300
ClientAliveCountMax        2
AllowUsers                 <votre-user>
```

```bash
sudo systemctl restart sshd
```

---

## 18. Checklist go-live

### Système

```
[ ] Ubuntu 22.04 LTS à jour (apt upgrade)
[ ] PostgreSQL 15 opérationnel (systemctl status postgresql → active)
[ ] Redis 7 opérationnel (systemctl status redis-server → active)
[ ] Nginx opérationnel avec TLS valide
[ ] Service kyc-aml opérationnel (systemctl status kyc-aml → active)
[ ] UFW activé — seuls ports 22, 80, 443 ouverts
[ ] Fail2ban actif
[ ] SSH : accès root désactivé, clés uniquement
```

### Application

```
[ ] Variables d'environnement en place (/opt/kyc-aml/.env, chmod 600)
[ ] 4 secrets cryptographiques générés et sauvegardés dans coffre-fort
[ ] Migrations Drizzle : 0 erreur (npx drizzle-kit migrate)
[ ] Health check : GET /api/health → {"status":"ok","db":"connected","redis":"connected"}
[ ] Compte admin créé et MFA activé
[ ] Test de connexion depuis le navigateur client
[ ] Test de screening : résultat retourné en < 5s
[ ] Test upload document : fichier visible dans /opt/kyc-aml/uploads
[ ] Email de test envoyé et reçu
```

### Sauvegarde et reprise

```
[ ] Script backup.sh testé manuellement → fichier .dump créé
[ ] Crontab configuré (sauvegarde 02h00 quotidienne)
[ ] Test de restauration partielle réussi
[ ] Procédure de rollback documentée et testée
[ ] Espace disque suffisant : > 50% libre sur /var/backups
```

### Conformité et documentation

```
[ ] .env stocké hors-dépôt dans un coffre-fort sécurisé
[ ] Identifiants base de données documentés (accès restreint RSSI)
[ ] Procédure d'accès d'urgence documentée
[ ] Contact d'urgence Cyberstrat communiqué à l'équipe IT
```

---

## 19. Procédures d'urgence

### Application ne démarre pas

```bash
# 1. Vérifier les logs
sudo journalctl -u kyc-aml -n 100 --no-pager

# 2. Vérifier les variables d'environnement
sudo -u node cat /opt/kyc-aml/.env | grep -E "DATABASE_URL|REDIS_URL"

# 3. Tester la connexion BD
psql "$DATABASE_URL" -c "SELECT 1"

# 4. Tester Redis
redis-cli -u "$REDIS_URL" ping

# 5. Relancer manuellement pour voir les erreurs
sudo -u node NODE_ENV=production node /opt/kyc-aml/dist/server/index.js
```

### Base de données inaccessible

```bash
# Vérifier le statut
sudo systemctl status postgresql

# Vérifier l'espace disque (cause fréquente)
df -h /var/lib/postgresql

# Redémarrer PostgreSQL
sudo systemctl restart postgresql

# Vérifier les logs PostgreSQL
sudo tail -50 /var/log/postgresql/postgresql-$(date +%Y-%m-%d).log
```

### Restauration d'urgence complète

```bash
# 1. Arrêter l'application
sudo systemctl stop kyc-aml

# 2. Lister les sauvegardes disponibles
ls -lht /var/backups/kyc-aml/db/ | head -5

# 3. Restaurer la dernière sauvegarde valide
LATEST=$(ls -t /var/backups/kyc-aml/db/*.dump | head -1)
pg_restore \
  --dbname="postgresql://kyc_user:PASS@127.0.0.1:5432/kyc_aml" \
  --clean --if-exists --no-owner \
  "${LATEST}"

# 4. Restaurer les documents
LATEST_UPLOADS=$(ls -t /var/backups/kyc-aml/uploads/*.tar.gz | head -1)
tar -xzf "${LATEST_UPLOADS}" -C /opt/kyc-aml/

# 5. Relancer
sudo systemctl start kyc-aml

# 6. Vérifier
curl -s http://localhost:3000/api/health
```

### Rollback vers version précédente

```bash
# Si la dernière mise à jour a cassé l'application :

# 1. Arrêt
sudo systemctl stop kyc-aml

# 2. Restaurer le dist précédent
sudo rsync -av /opt/kyc-aml/dist-backup/ /opt/kyc-aml/dist/

# 3. Redémarrer
sudo systemctl start kyc-aml

# 4. Vérifier
curl -s http://localhost:3000/api/health
```

---

## Contact & Support

| Canal | Coordonnées |
|---|---|
| Email support | a.bensleten@cyberstrat.ma |
| Site | cyberstrat.ma |
| Urgences production | Inclus dans le contrat de maintenance |

> **SLA Production On-Premises :** Disponibilité 99% — RTO 4h — RPO 1h
> Temps de réponse support : 4h en heures ouvrées, 8h hors heures ouvrées.
> Voir le Contrat de Prestation de Services (CPS) pour les détails complets.
