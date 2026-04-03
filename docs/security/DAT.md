# Dossier d'Architecture Technique (DAT)
## Plateforme KYC/AML — Architecture Technique Détaillée

---

| Champ            | Valeur                                         |
|------------------|------------------------------------------------|
| Document         | DAT-KYC-AML-001                                |
| Version          | 1.2                                            |
| Date             | Mars 2026                                      |
| Statut           | APPROUVÉ                                       |
| Classification   | CONFIDENTIEL — Usage interne et clients directs |
| Auteur           | Équipe Architecture & Sécurité                 |
| Réviseurs        | DSI, RSSI, Architecte Principal                |

---

## Historique des versions

| Version | Date        | Auteur               | Modifications                                    |
|---------|-------------|----------------------|--------------------------------------------------|
| 1.0     | Oct. 2025   | Architecte Principal | Version initiale                                 |
| 1.1     | Jan. 2026   | Équipe Sécurité      | Ajout section observabilité, flux réseau         |
| 1.2     | Mars 2026   | Équipe Architecture  | Mise à jour ADR-004, ADR-005 ; ajout pKYC        |

---

## Table des matières

1. Présentation Générale
2. Architecture Applicative
3. Architecture des Données
4. Architecture des Services Docker
5. Flux de Communication
6. Architecture de Sécurité
7. Architecture de Disponibilité
8. Architecture d'Observabilité
9. Intégration CBS (Core Banking System)
10. Scalabilité et Limites
11. Décisions d'Architecture (ADR)

---

## 1. Présentation Générale

### 1.1 Objectif du document

Le présent Dossier d'Architecture Technique (DAT) décrit de manière exhaustive l'architecture logicielle, infrastructure, réseau et sécurité de la plateforme KYC/AML. Ce document constitue la référence technique principale pour les équipes DSI, les architectes et les responsables sécurité des organisations clientes souhaitant comprendre, évaluer ou certifier le niveau technique de la solution avant déploiement ou intégration.

Ce document vise à répondre aux exigences suivantes :

- Fournir une vision claire et documentée de l'ensemble des composants techniques de la plateforme
- Permettre l'évaluation de la conformité aux standards de sécurité (ISO 27001, RGPD, DSP2, DORA)
- Servir de base aux audits de sécurité et aux revues d'architecture
- Documenter les décisions techniques structurantes et leur justification
- Permettre aux équipes ops de comprendre les dépendances et les procédures d'exploitation

### 1.2 Périmètre couvert

Le présent document couvre l'intégralité de la plateforme KYC/AML, incluant :

- L'application frontend (React 19, SPA)
- L'application backend (Node.js 22, Express 4, tRPC v11)
- Le service de scoring ML (Python FastAPI, XGBoost)
- L'infrastructure Docker Compose (10 services)
- La couche réseau et sécurité (Nginx, TLS, rate limiting)
- La couche de persistance (PostgreSQL 16, Redis 7)
- La couche d'observabilité (Prometheus, Grafana, Loki)
- Les intégrations externes (listes de sanctions, CBS, TRACFIN/GoAML, eKYC)
- La chaîne CI/CD (GitHub Actions)

Ce document ne couvre pas :

- Les configurations spécifiques aux déploiements clients (variables d'environnement, noms de domaine)
- Le code source applicatif (couvert par la documentation développeur)
- Les SLA contractuels (couverts par le contrat de service)

### 1.3 Acronymes et définitions

| Acronyme | Définition                                              |
|----------|---------------------------------------------------------|
| AML      | Anti-Money Laundering (Lutte contre le blanchiment)    |
| CBS      | Core Banking System (Système bancaire central)          |
| DAT      | Dossier d'Architecture Technique                        |
| DRP      | Disaster Recovery Plan                                  |
| DSI      | Direction des Systèmes d'Information                    |
| GCM      | Galois/Counter Mode (mode de chiffrement AES)           |
| HSTS     | HTTP Strict Transport Security                          |
| KYC      | Know Your Customer (Connaissance du client)             |
| MFA      | Multi-Factor Authentication                             |
| PII      | Personally Identifiable Information (Données à caractère personnel) |
| pKYC     | Perpetual KYC (KYC en continu)                          |
| RBAC     | Role-Based Access Control                               |
| RPO      | Recovery Point Objective                                |
| RSSI     | Responsable de la Sécurité des Systèmes d'Information  |
| RTO      | Recovery Time Objective                                 |
| TOTP     | Time-based One-Time Password                            |
| tRPC     | TypeScript Remote Procedure Call                        |

---

## 2. Architecture Applicative

### 2.1 Diagramme d'architecture général

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET / CLIENT                                  │
│                        Navigateur Web (React 19 SPA)                            │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │ HTTPS (TLS 1.2/1.3)
                                    │ Port 443
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         NGINX REVERSE PROXY                                     │
│                         (kyc_nginx — alpine)                                    │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │  TLS 1.2/1.3   │  │  Rate Limiting  │  │  HSTS + Security Headers         │ │
│  │  Let's Encrypt │  │  (configurable) │  │  X-Frame, X-Content-Type, CSP    │ │
│  └────────────────┘  └─────────────────┘  └──────────────────────────────────┘ │
│  Port 80 → redirect 443    Port 443 → proxy_pass → kyc_app:3000                │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │ HTTP interne Docker
                                    │ Port 3000
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    APPLICATION NODE.JS (kyc_app)                                │
│                    Node.js 22 LTS + TypeScript 5.9                              │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         EXPRESS 4 + tRPC v11                             │   │
│  │                                                                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │  Auth       │  │  KYC        │  │  AML         │  │  Admin       │  │   │
│  │  │  Router     │  │  Router     │  │  Router      │  │  Router      │  │   │
│  │  │  /login     │  │  /clients   │  │  /alerts     │  │  /users      │  │   │
│  │  │  /refresh   │  │  /documents │  │  /screening  │  │  /settings   │  │   │
│  │  │  /mfa       │  │  /onboard   │  │  /scoring    │  │  /audit      │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  │   │
│  │         └────────────────┴─────────────────┴─────────────────┘          │   │
│  │                                    │                                     │   │
│  │  ┌─────────────────────────────────▼──────────────────────────────────┐  │   │
│  │  │                    MIDDLEWARES TRANSVERSAUX                        │  │   │
│  │  │  AuthMiddleware → RBAC → PII decrypt → Audit log → Error handler  │  │   │
│  │  └────────────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐   │
│  │  Drizzle ORM     │  │  Redis Client    │  │  Pino Logger (JSON)         │   │
│  │  (PostgreSQL 16) │  │  (ioredis)       │  │  → Loki via stdout          │   │
│  └──────────┬───────┘  └──────┬───────────┘  └─────────────────────────────┘   │
└─────────────┼─────────────────┼───────────────────────────────────────────────┘
              │                 │
    ┌─────────▼──────┐    ┌─────▼───────────────────────────────────────────┐
    │ kyc_postgres   │    │                  kyc_redis                      │
    │ PostgreSQL 16  │    │  Redis 7 — maxmemory 512MB — AOF everysec       │
    │ 16 tables      │    │  • Sessions JWT (blacklist)                     │
    │ 21 enums       │    │  • Cache listes sanctions (TTL 23h)             │
    │ PII chiffré    │    │  • Rate limiting counters                       │
    │ AOF disabled   │    │  • Refresh token store                          │
    └────────────────┘    │  • pKYC baseline cache                          │
                          └─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                        ML SERVICE (kyc_ml)                                      │
│                     Python FastAPI — réseau Docker interne UNIQUEMENT           │
│                                                                                 │
│  POST /score  ←── kyc_app (avec ML_INTERNAL_API_KEY)                           │
│  POST /train  ←── scheduler cron (dimanche 03h00 UTC)                          │
│                                                                                 │
│  XGBoost model  │  Scikit-learn preprocessing  │  PostgreSQL read-only access  │
│  Modèles persistés : volume kyc_ml_models                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                      OBSERVABILITE (réseau interne)                             │
│                                                                                 │
│  ┌──────────────────┐    ┌────────────────────┐    ┌─────────────────────────┐ │
│  │   kyc_prometheus  │    │    kyc_grafana      │    │       kyc_loki          │ │
│  │   Prom v2.51     │    │    Grafana 10.4     │    │    Loki 2.9.5           │ │
│  │   Rétention 30j  │────▶    Port 3001        │    │    Agrégation logs      │ │
│  │   /metrics pull  │    │    Dashboards       │◀───│    (stdout Docker)      │ │
│  └──────────────────┘    │    AlertManager     │    └─────────────────────────┘ │
│                          └────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                         SERVICES ANNEXES                                        │
│                                                                                 │
│  ┌──────────────────────────┐    ┌───────────────────────────────────────────┐  │
│  │    kyc_certbot            │    │              kyc_backup                   │  │
│  │    Let's Encrypt          │    │   pg_dump quotidien à 02h00 UTC           │  │
│  │    Renouvellement auto    │    │   Rétention 30 jours gzip                 │  │
│  │    toutes les 12h         │    │   Volume kyc_backups                      │  │
│  └──────────────────────────┘    └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                    INTÉGRATIONS EXTERNES                                        │
│                                                                                 │
│  kyc_app → OFAC SDN List (US Treasury)        → HTTPS GET (cron 02h00)        │
│  kyc_app → EU Consolidated Sanctions          → HTTPS GET (cron 02h00)        │
│  kyc_app → UN Sanctions List                  → HTTPS GET (cron 02h00)        │
│  kyc_app → UK Sanctions List (OFSI)           → HTTPS GET (cron 02h00)        │
│  kyc_app → PEP List (OpenSanctions)           → HTTPS GET (cron 02h00)        │
│  kyc_app → BAM/ANRF Sanctions (Maroc)         → HTTPS GET (cron 02h00)        │
│  kyc_app → Resend.com (Email)                 → HTTPS POST                    │
│  kyc_app → TRACFIN / GoAML                    → HTTPS POST (télédéclaration)  │
│  kyc_app → Onfido / SumSub (eKYC optionnel)   → HTTPS POST                   │
│  kyc_app → WorldCheck (optionnel payant)       → HTTPS GET                    │
│                                                                                 │
│  CBS → kyc_app (Webhook entrant)              → HTTPS POST /api/webhook       │
│        Validation HMAC-SHA256 WEBHOOK_SECRET                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Pattern architectural : monolithe modulaire

La plateforme KYC/AML repose sur un **monolithe modulaire** — une décision délibérée et documentée (voir ADR-002). Contrairement à une architecture microservices, tous les modules fonctionnels (KYC, AML, screening, analytics, administration) s'exécutent dans un seul processus Node.js, mais sont organisés en modules internes fortement découplés avec leurs propres couches de service et de données.

**Avantages de ce choix pour le contexte actuel :**

- Déploiement simplifié sur un hôte Docker unique : adapté aux établissements financiers de taille intermédiaire
- Pas de latence réseau inter-services pour les appels synchrones critiques (scoring AML en temps réel)
- Transactions PostgreSQL ACID couvrant plusieurs domaines sans coordination distribuée
- Réduction de la surface d'attaque réseau (moins de services exposés)
- Équipe de développement de taille réduite : overhead opérationnel limité
- Montée en charge horizontale possible : l'application est stateless (sessions Redis)

**Limites assumées :**

- Pas de déploiement indépendant des modules (nécessite un rolling update complet)
- Scaling vertical des modules CPU-intensifs non possible (mais ML est isolé en service séparé)
- Couplage technique plus fort qu'en microservices (mitigé par la discipline de modules TypeScript)

### 2.3 Frontend

| Composant          | Technologie              | Version |
|--------------------|--------------------------|---------|
| Framework UI       | React                    | 19.x    |
| Build tool         | Vite                     | 7.x     |
| Styling            | Tailwind CSS             | 4.x     |
| Client tRPC        | @trpc/client             | 11.x    |
| Gestion d'état     | TanStack Query           | 5.x     |
| Validation forms   | React Hook Form + Zod    | —       |
| Graphiques         | Recharts                 | —       |
| Type safety        | TypeScript               | 5.9     |

Le frontend est une **Single Page Application (SPA)** servie par Nginx en tant que fichiers statiques compilés. Toute la communication avec le backend s'effectue via le client tRPC, qui garantit la cohérence de type de bout en bout sans génération de code.

### 2.4 Backend

| Composant          | Technologie              | Version |
|--------------------|--------------------------|---------|
| Runtime            | Node.js                  | 22 LTS  |
| Framework HTTP     | Express                  | 4.x     |
| API framework      | tRPC                     | 11.x    |
| ORM                | Drizzle ORM              | —       |
| Validation         | Zod                      | 3.x     |
| Authentification   | jsonwebtoken             | —       |
| MFA                | @otplib/preset-server    | —       |
| Logger             | Pino                     | 9.x     |
| Client Redis       | ioredis                  | —       |
| Email              | Resend                   | —       |
| PDF                | pdfmake                  | —       |
| Language           | TypeScript               | 5.9     |

### 2.5 Communication client-serveur

Le protocole de communication entre le frontend et le backend est **tRPC over HTTP/1.1**. Les procédures tRPC sont exposées sous le chemin `/api/trpc/*`. Le typage TypeScript est partagé entre client et serveur via le module `@/shared`, garantissant une cohérence totale sans documentation d'API séparée ni code généré.

- **Queries** (GET) : lecture de données (listage clients, alertes, etc.)
- **Mutations** (POST) : modifications d'état (création client, validation alerte, etc.)
- **Subscriptions** : non utilisées (polling côté client pour les mises à jour temps réel)

Le format des données est JSON. Les erreurs sont typées et gérées de manière uniforme via les codes d'erreur tRPC (UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST, INTERNAL_SERVER_ERROR).

### 2.6 Authentification et gestion de session

L'authentification repose sur un schéma **JWT stateless avec rotation des refresh tokens** :

1. Connexion : POST credentials → vérification bcrypt → génération access token (15 min, HS256) + refresh token (7 jours)
2. Accès API : Bearer token dans l'en-tête Authorization → vérification signature + expiration + blacklist Redis
3. Renouvellement : POST refresh token → vérification + rotation (ancien token blacklisté, nouveau émis)
4. MFA TOTP : si activé pour le rôle, validation du code TOTP RFC 6238 après credentials corrects
5. Déconnexion : ajout du jti (JWT ID) à la blacklist Redis (TTL = durée restante du token)

Le token d'accès contient les claims : `sub` (userId), `jti` (nanoid, identifiant unique), `role`, `iat`, `exp`.

---

## 3. Architecture des Données

### 3.1 PostgreSQL 16 — Source de vérité unique

PostgreSQL 16 (image alpine) est la base de données principale et unique source de vérité pour toutes les données persistantes. Elle n'est accessible qu'au sein du réseau Docker interne `kyc_network_prod` — aucun port n'est exposé sur l'interface hôte.

**Configuration de production :**

- Image : `postgres:16-alpine`
- Volume persistant : `kyc_postgres_data_prod` (volume Docker nommé)
- Health check : `pg_isready` toutes les 10 secondes
- Credentials : injectés via variables d'environnement (`DB_USER`, `DB_PASSWORD`, `DB_NAME`)
- Backup : `pg_dump` quotidien via le service `kyc_backup` (02h00 UTC)

### 3.2 Schéma de données

La base de données comprend **16 tables** et **21 enums** couvrant les domaines suivants :

| Domaine            | Tables principales                                           |
|--------------------|--------------------------------------------------------------|
| Utilisateurs       | `users`, `user_sessions`, `mfa_configs`                      |
| KYC Clients        | `clients`, `client_documents`, `kyc_verifications`           |
| AML               | `transactions`, `aml_alerts`, `aml_rules`                    |
| Screening          | `screening_results`, `sanctions_lists`                       |
| Audit              | `audit_logs`                                                 |
| Rapports           | `reports`, `tracfin_reports`                                 |
| Webhooks           | `webhook_events`                                             |
| Analytiques        | `analytics_events`                                           |

**Enums** couvrent notamment : statuts de vérification KYC, niveaux de risque, types d'alerte AML, types de transaction, rôles utilisateurs, statuts de screening, modes de transmission TRACFIN.

### 3.3 Chiffrement des données PII

Les champs contenant des Données à Caractère Personnel (DCP/PII) sont chiffrés en base avant stockage à l'aide de l'algorithme **AES-256-GCM** (NIST SP 800-38D). Le chiffrement est transparent pour la couche applicative : les fonctions `encryptPii()` et `decryptPii()` sont appelées par les couches de service.

**Format de stockage :**

```
enc:v1:<iv_base64url>.<ciphertext_base64url>.<authtag_base64url>
```

- `enc:v1:` : préfixe d'identification du format et de la version
- IV : 12 octets (96 bits) aléatoires générés par `crypto.randomBytes(12)` pour chaque valeur
- Ciphertext : données chiffrées AES-256-GCM
- AuthTag : tag d'authentification GCM de 16 octets (garantit l'intégrité et l'authenticité)
- Encodage : base64url (compact, URL-safe, sans padding `=`)

La clé est dérivée depuis `PII_ENCRYPTION_KEY` : accepte le format hexadécimal 64 caractères (256 bits) ou base64. Le module gère le passthrough transparent pour les valeurs non chiffrées, permettant une migration progressive.

### 3.4 Stratégie de migrations

Les migrations de base de données sont gérées par **Drizzle Kit** :

- Migrations versionnées en SQL, stockées dans le dépôt Git
- Exécution automatique au déploiement via le service `kyc_migrate` (s'exécute une fois puis se termine)
- Le service `app` ne démarre qu'après la fin réussie de `kyc_migrate`
- Les migrations sont idempotentes et testées en environnement de staging avant production

### 3.5 Redis 7 — Cache et sessions

Redis 7 (image alpine) sert de stockage secondaire pour les cas d'usage suivants :

| Usage                        | Structure Redis      | TTL                    |
|------------------------------|----------------------|------------------------|
| Blacklist tokens JWT         | SET `jti:<jti>`      | Durée restante du token |
| Cache listes sanctions       | STRING/HASH          | 23 heures              |
| Compteurs rate limiting      | STRING INCR          | Fenêtre glissante      |
| Store refresh tokens         | STRING               | 7 jours                |
| Cache baseline pKYC          | HASH                 | Configurable           |

**Configuration de production :**

```
--appendonly yes          # AOF activé
--appendfsync everysec    # Sync disque toutes les secondes
--maxmemory 512mb         # Limite mémoire
--maxmemory-policy allkeys-lru   # Éviction LRU si limite atteinte
--requirepass <REDIS_PASSWORD>   # Authentification obligatoire
```

L'application tolère une panne Redis en mode dégradé : les opérations nécessitant le cache (screening, rate limiting) continuent avec des valeurs par défaut ou des requêtes directes à PostgreSQL pour les données critiques.

---

## 4. Architecture des Services Docker

L'ensemble de la plateforme est déployé via **Docker Compose** sur un réseau isolé `kyc_network_prod`. Le fichier `docker/docker-compose.prod.yml` définit 10 services (plus le service `migrate` ponctuel).

### 4.1 Service `kyc_app` — Application principale

| Paramètre         | Valeur                                              |
|-------------------|-----------------------------------------------------|
| Image             | `ghcr.io/<REPO>:<TAG>` (buildée via GitHub Actions) |
| Container         | `kyc_app`                                           |
| Port exposé       | `3000:3000` (proxy par Nginx)                       |
| Memory limit      | `512M`                                              |
| CPU limit         | `1.0` vCPU                                          |
| Restart           | `unless-stopped`                                    |
| Health check      | `curl -f http://localhost:3000/health` (30s/10s/3)  |
| Start period      | `40s` (attente initialisation)                      |
| Dépendances       | `postgres` (healthy), `redis` (healthy), `migrate` (completed) |
| Config            | `.env.production` + `NODE_ENV=production`           |

### 4.2 Service `kyc_postgres` — Base de données

| Paramètre         | Valeur                                              |
|-------------------|-----------------------------------------------------|
| Image             | `postgres:16-alpine`                                |
| Container         | `kyc_postgres`                                      |
| Port exposé       | Aucun (réseau interne uniquement)                   |
| Volume            | `kyc_postgres_data_prod` (/var/lib/postgresql/data) |
| Restart           | `unless-stopped`                                    |
| Health check      | `pg_isready -U <user> -d <db>` (10s/5s/5)          |
| Credentials       | Via variables `DB_USER`, `DB_PASSWORD`, `DB_NAME`   |

### 4.3 Service `kyc_redis` — Cache et sessions

| Paramètre         | Valeur                                              |
|-------------------|-----------------------------------------------------|
| Image             | `redis:7-alpine`                                    |
| Container         | `kyc_redis`                                         |
| Port exposé       | Aucun (réseau interne uniquement)                   |
| Volume            | `kyc_redis_data_prod` (/data)                       |
| Restart           | `unless-stopped`                                    |
| Health check      | `redis-cli -a <pass> ping` (10s/5s/5)               |
| maxmemory         | `512mb`                                             |
| AOF               | `appendonly yes`, `appendfsync everysec`             |
| Éviction          | `allkeys-lru`                                       |
| Auth              | `requirepass <REDIS_PASSWORD>`                      |

### 4.4 Service `kyc_nginx` — Reverse proxy et TLS

| Paramètre         | Valeur                                              |
|-------------------|-----------------------------------------------------|
| Image             | `nginx:alpine`                                      |
| Container         | `kyc_nginx`                                         |
| Ports exposés     | `80:80` (redirect HTTPS), `443:443` (HTTPS)         |
| Restart           | `unless-stopped`                                    |
| Health check      | `wget -qO- http://localhost/health` (30s/5s/3)      |
| Config            | `./docker/nginx.conf` (read-only)                   |
| Volumes           | Certificats Let's Encrypt (`/etc/letsencrypt`), webroot certbot |
| TLS               | 1.2 minimum, 1.3 recommandé, HSTS activé            |
| Rate limiting     | Configurable (ex. 10 req/s par IP)                  |
| Fonctions         | Proxy pass vers `kyc_app:3000`, serve SPA statique  |

### 4.5 Service `kyc_certbot` — Renouvellement TLS

| Paramètre         | Valeur                                              |
|-------------------|-----------------------------------------------------|
| Image             | `certbot/certbot:latest`                            |
| Container         | `kyc_certbot`                                       |
| Restart           | `unless-stopped`                                    |
| Volumes           | `/etc/letsencrypt` (partagé avec Nginx), webroot    |
| Comportement      | Vérification toutes les 12h, renouvellement si < 30j restants |

### 4.6 Service `kyc_ml` — Scoring ML

| Paramètre         | Valeur                                              |
|-------------------|-----------------------------------------------------|
| Image             | `kyc-ml:<TAG>` (buildée localement)                 |
| Container         | `kyc_ml`                                            |
| Port exposé       | Aucun (réseau interne uniquement, accès via `kyc_app`) |
| Memory limit      | `1G`                                                |
| CPU limit         | `1.0` vCPU                                          |
| Restart           | `unless-stopped`                                    |
| Health check      | `curl -f http://localhost:8000/health` (30s/10s/3/60s) |
| Volume            | `kyc_ml_models` (persistance des modèles XGBoost)   |
| Auth interne      | `ML_INTERNAL_API_KEY` (min 8 chars)                 |
| Accès DB          | Read-only via `ML_DATABASE_URL` (pour retraining)   |
| Framework         | Python FastAPI                                      |
| ML               | XGBoost + Scikit-learn                              |

### 4.7 Service `kyc_backup` — Sauvegarde automatique

| Paramètre         | Valeur                                              |
|-------------------|-----------------------------------------------------|
| Image             | `postgres:16-alpine` (pour `pg_dump`)               |
| Container         | `kyc_backup`                                        |
| Restart           | `unless-stopped`                                    |
| Volume            | `kyc_backups` (/backups)                            |
| Script            | `./docker/backup.sh` (read-only)                    |
| Scheduler         | crond (cron intégré Alpine)                         |
| Planification     | 02h00 UTC quotidien                                 |
| Rétention         | 30 jours                                           |
| Format            | pg_dump + gzip                                      |

### 4.8 Service `kyc_prometheus` — Métriques

| Paramètre         | Valeur                                              |
|-------------------|-----------------------------------------------------|
| Image             | `prom/prometheus:v2.51.0`                           |
| Container         | `kyc_prometheus`                                    |
| Port exposé       | Aucun (accès via Grafana uniquement)                |
| Restart           | `unless-stopped`                                    |
| Volume            | `kyc_prometheus_data` (/prometheus)                 |
| Rétention         | `30d`                                               |
| Config            | `./docker/prometheus.yml` + `./docker/alerts.yml`   |
| Health check      | `wget --spider http://localhost:9090/-/healthy`     |

### 4.9 Service `kyc_grafana` — Dashboards

| Paramètre         | Valeur                                              |
|-------------------|-----------------------------------------------------|
| Image             | `grafana/grafana:10.4.0`                            |
| Container         | `kyc_grafana`                                       |
| Port exposé       | `3001:3000` (dashboard ops)                         |
| Restart           | `unless-stopped`                                    |
| Volume            | `kyc_grafana_data` + provisioning read-only         |
| Auth              | `GRAFANA_USER` / `GRAFANA_PASSWORD` (à changer)     |
| Signups           | Désactivés (`GF_USERS_ALLOW_SIGN_UP=false`)         |
| Télémétrie        | Désactivée (`GF_ANALYTICS_REPORTING_ENABLED=false`) |
| Sources données   | Prometheus + Loki (auto-provisionnées)              |
| Dashboards        | `kyc-overview`, `aml-operations` (auto-provisionnés)|

### 4.10 Service `kyc_loki` — Agrégation des logs

| Paramètre         | Valeur                                              |
|-------------------|-----------------------------------------------------|
| Image             | `grafana/loki:2.9.5`                                |
| Container         | `kyc_loki`                                          |
| Port exposé       | Aucun (accès interne par Grafana)                   |
| Restart           | `unless-stopped`                                    |
| Volume            | `kyc_loki_data` (/loki)                             |
| Config            | `./docker/loki.yml`                                 |
| Entrée logs       | Stdout des containers Docker (driver Loki ou Promtail) |

---

## 5. Flux de Communication

### 5.1 Flux entrants (Internet → Plateforme)

```
Internet → Nginx:443 (HTTPS/TLS 1.3)
  → [TLS termination, rate limiting, HSTS headers]
  → kyc_app:3000 (HTTP interne)
    → /api/trpc/* (tRPC API)
    → /api/webhook (CBS webhook entrant — HMAC-SHA256)
    → /health (health check Nginx)
    → /* (SPA React — fichiers statiques)

Internet → Nginx:80 (HTTP)
  → Redirect 301 vers HTTPS
  → /.well-known/acme-challenge/* (Certbot ACME)
```

### 5.2 Flux internes Docker

```
kyc_app → kyc_postgres:5432    (Drizzle ORM — pool de connexions)
kyc_app → kyc_redis:6379       (ioredis — sessions, cache, blacklist)
kyc_app → kyc_ml:8000          (HTTP + ML_INTERNAL_API_KEY — scoring)
kyc_prometheus → kyc_app:3000  (pull métriques /metrics)
kyc_grafana → kyc_prometheus:9090 (PromQL)
kyc_grafana → kyc_loki:3100    (LogQL)
kyc_backup → kyc_postgres:5432 (pg_dump PGPASSWORD)
kyc_ml → kyc_postgres:5432     (read-only pour retraining)
```

### 5.3 Flux sortants (Plateforme → Externe)

```
kyc_app → OFAC SDN       (api.treasury.gov)       : HTTPS GET — cron 02h00
kyc_app → EU Sanctions   (data.europa.eu)          : HTTPS GET — cron 02h00
kyc_app → UN Sanctions   (scsanctions.un.org)      : HTTPS GET — cron 02h00
kyc_app → UK Sanctions   (assets.publishing.service.gov.uk) : HTTPS GET — cron 02h00
kyc_app → PEP List       (OpenSanctions API)       : HTTPS GET — cron 02h00
kyc_app → BAM/ANRF       (URL configurable)        : HTTPS GET — cron 02h00
kyc_app → Resend.com     (api.resend.com)          : HTTPS POST — emails transactionnels
kyc_app → TRACFIN Portal (URL configurable)        : HTTPS POST — déclarations STR
kyc_app → GoAML Direct   (URL configurable)        : HTTPS POST — déclarations XML
kyc_app → Onfido         (api.eu.onfido.com)       : HTTPS POST — vérification eKYC (opt.)
kyc_app → SumSub         (api.sumsub.com)          : HTTPS POST — vérification eKYC (opt.)
kyc_app → WorldCheck     (URL configurable)        : HTTPS GET — screening payant (opt.)
```

### 5.4 Ports exposés vs ports internes

| Service       | Port interne | Port hôte exposé | Accessible depuis |
|---------------|-------------|------------------|-------------------|
| kyc_nginx     | 80          | 80               | Internet          |
| kyc_nginx     | 443         | 443              | Internet          |
| kyc_app       | 3000        | 3000             | kyc_nginx (proxy) |
| kyc_grafana   | 3000        | 3001             | Réseau ops (VPN conseillé) |
| kyc_postgres  | 5432        | Non exposé       | Réseau Docker     |
| kyc_redis     | 6379        | Non exposé       | Réseau Docker     |
| kyc_ml        | 8000        | Non exposé       | Réseau Docker     |
| kyc_prometheus| 9090        | Non exposé       | Réseau Docker     |
| kyc_loki      | 3100        | Non exposé       | Réseau Docker     |

**Note de sécurité :** PostgreSQL, Redis, le service ML et Prometheus ne sont jamais exposés sur l'interface réseau de l'hôte. Ils sont uniquement accessibles via le réseau Docker interne `kyc_network_prod`.

### 5.5 Matrice des flux réseau

| Source          | Destination     | Port | Protocole | Sens     | Justification                    |
|-----------------|-----------------|------|-----------|----------|----------------------------------|
| Internet        | kyc_nginx       | 443  | HTTPS     | Entrant  | Accès utilisateurs               |
| Internet        | kyc_nginx       | 80   | HTTP      | Entrant  | Redirect HTTPS + ACME            |
| kyc_nginx       | kyc_app         | 3000 | HTTP      | Interne  | Reverse proxy                    |
| kyc_app         | kyc_postgres    | 5432 | TCP       | Interne  | Accès données                    |
| kyc_app         | kyc_redis       | 6379 | TCP       | Interne  | Sessions, cache                  |
| kyc_app         | kyc_ml          | 8000 | HTTP      | Interne  | Scoring ML                       |
| kyc_app         | Internet        | 443  | HTTPS     | Sortant  | Sanctions, email, CBS, TRACFIN   |
| kyc_prometheus  | kyc_app         | 3000 | HTTP      | Interne  | Scraping métriques /metrics      |
| kyc_grafana     | kyc_prometheus  | 9090 | HTTP      | Interne  | Requêtes PromQL                  |
| kyc_grafana     | kyc_loki        | 3100 | HTTP      | Interne  | Requêtes LogQL                   |
| kyc_backup      | kyc_postgres    | 5432 | TCP       | Interne  | pg_dump backup                   |
| kyc_ml          | kyc_postgres    | 5432 | TCP       | Interne  | Retraining (read-only)           |
| Ops (VPN)       | kyc_grafana     | 3001 | HTTPS     | Entrant  | Monitoring (accès restreint)     |

---

## 6. Architecture de Sécurité

### 6.1 Défense en profondeur (Defense in depth)

La sécurité de la plateforme est organisée en couches concentriques. Chaque couche ajoute un contrôle indépendant, de sorte qu'une défaillance d'une couche n'expose pas directement les données.

```
┌─────────────────────────────────────────────────────────────┐
│  Couche 1 : Périmètre réseau                                │
│  Nginx TLS 1.2/1.3 — ports non exposés — réseau Docker isolé│
├─────────────────────────────────────────────────────────────┤
│  Couche 2 : Rate limiting                                   │
│  Nginx (IP-based) + App (Redis-based par utilisateur)       │
├─────────────────────────────────────────────────────────────┤
│  Couche 3 : Authentification                                │
│  JWT HS256 (15 min) + Refresh rotation + MFA TOTP           │
├─────────────────────────────────────────────────────────────┤
│  Couche 4 : Autorisation RBAC                               │
│  5 rôles : user / analyst / supervisor / compliance / admin  │
├─────────────────────────────────────────────────────────────┤
│  Couche 5 : Chiffrement applicatif                          │
│  AES-256-GCM sur champs PII avant écriture en base          │
├─────────────────────────────────────────────────────────────┤
│  Couche 6 : Traçabilité et audit                            │
│  Table audit_logs — chaque action avec userId, IP, avant/après│
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Périmètre réseau

Le réseau Docker `kyc_network_prod` est le réseau par défaut de la stack. Il présente les caractéristiques suivantes :

- Réseau bridge Docker isolé : les containers ne sont accessibles que depuis l'intérieur du réseau ou depuis les ports explicitement exposés
- PostgreSQL et Redis : aucun port exposé sur l'hôte — accessible uniquement depuis `kyc_app`, `kyc_backup` et `kyc_ml`
- Service ML : aucun port exposé — accessible uniquement depuis `kyc_app`
- Prometheus et Loki : aucun port exposé publiquement
- Grafana : port 3001 exposé (recommandation : restreindre via firewall hôte ou VPN)

### 6.3 Authentification

| Mécanisme           | Implémentation                                      |
|---------------------|-----------------------------------------------------|
| Mot de passe        | bcrypt, facteur de travail 10 (≈ 100ms/hash)        |
| Access token        | JWT HS256, expiration 15 minutes (`JWT_ACCESS_EXPIRES_IN`) |
| Refresh token       | JWT HS256, expiration 7 jours (`JWT_REFRESH_EXPIRES_IN`), rotation à chaque usage |
| Token ID            | `jti` nanoid(), révocation individuelle via blacklist Redis |
| MFA TOTP            | RFC 6238, secrets chiffrés AES-256-CBC (`MFA_ENCRYPTION_KEY`) |
| Webhook CBS         | HMAC-SHA256 sur le corps de la requête (`WEBHOOK_SECRET`) |

**MFA obligatoire** pour les rôles : `supervisor`, `compliance_officer`, `admin`. Les rôles `user` et `analyst` peuvent activer le MFA volontairement.

### 6.4 Autorisation RBAC

La plateforme implémente un contrôle d'accès basé sur les rôles (RBAC) à 5 niveaux :

| Rôle                | Description                                          | MFA requis |
|---------------------|------------------------------------------------------|------------|
| `user`              | Accès lecture seule aux données propres              | Non        |
| `analyst`           | Analyse KYC, consultation alertes AML                | Non        |
| `supervisor`        | Validation KYC, clôture alertes, accès rapports      | Oui        |
| `compliance_officer`| Accès complet AML, télédéclaration TRACFIN           | Oui        |
| `admin`             | Administration complète, gestion utilisateurs        | Oui        |

Les vérifications RBAC sont effectuées au niveau middleware tRPC, avant tout traitement de la requête.

### 6.5 Audit et traçabilité

Toutes les actions significatives sont journalisées dans la table `audit_logs` en base de données :

| Champ          | Description                                              |
|----------------|----------------------------------------------------------|
| `id`           | Identifiant unique UUID                                  |
| `userId`       | Identifiant de l'utilisateur ayant effectué l'action     |
| `action`       | Type d'action (ex: `CLIENT_CREATED`, `ALERT_CLOSED`)    |
| `resourceType` | Type de ressource cible                                  |
| `resourceId`   | Identifiant de la ressource cible                        |
| `before`       | État avant modification (JSON, pour les updates)         |
| `after`        | État après modification (JSON)                           |
| `ipAddress`    | Adresse IP de la requête                                 |
| `userAgent`    | User-Agent HTTP                                          |
| `timestamp`    | Horodatage UTC                                           |

Les logs d'audit sont immuables en base et ne peuvent être supprimés par aucun rôle applicatif.

### 6.6 Gestion des secrets

Les secrets sont injectés via des variables d'environnement chargées depuis le fichier `.env.production` (non versionné dans Git). La plateforme valide au démarrage la présence et la conformité de tous les secrets via le schéma Zod défini dans `server/_core/env.ts` :

- Variables obligatoires : `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- Variables avec contraintes : `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` doivent être différents, > 32 chars
- Secrets interdits en production : valeurs contenant "CHANGE_ME" causent un exit(1) au démarrage

**Option HashiCorp Vault** : la plateforme supporte optionnellement HashiCorp Vault via les variables `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_PATH` pour les déploiements avec une gestion centralisée des secrets.

---

## 7. Architecture de Disponibilité

### 7.1 Health checks

Tous les services critiques disposent d'un health check Docker configuré :

| Service        | Commande                             | Intervalle | Timeout | Retries |
|----------------|--------------------------------------|------------|---------|---------|
| kyc_app        | `curl -f http://localhost:3000/health`| 30s        | 10s     | 3       |
| kyc_postgres   | `pg_isready`                         | 10s        | 5s      | 5       |
| kyc_redis      | `redis-cli ping`                     | 10s        | 5s      | 5       |
| kyc_nginx      | `wget -qO- http://localhost/health`  | 30s        | 5s      | 3       |
| kyc_ml         | `curl -f http://localhost:8000/health`| 30s        | 10s     | 3       |
| kyc_prometheus | `wget --spider localhost:9090/-/healthy`| 30s      | 5s      | —       |
| kyc_grafana    | `curl -f http://localhost:3000/api/health`| 30s    | —       | —       |
| kyc_loki       | `wget --spider localhost:3100/ready` | 30s        | —       | —       |

### 7.2 Politique de redémarrage

Tous les services (sauf `kyc_migrate`) utilisent la politique `unless-stopped` : le service redémarre automatiquement en cas de crash, sauf si arrêté volontairement. Cette politique est préférable à `always` car elle évite les boucles de redémarrage infini lors des maintenances planifiées.

### 7.3 Procédure de mise à jour sans interruption (rolling update)

```
1. Construire la nouvelle image : docker build + push vers GHCR (GitHub Actions)
2. Sur l'hôte de production :
   a. docker compose -f docker-compose.prod.yml pull
   b. docker compose -f docker-compose.prod.yml up -d --no-deps --build app
      (Docker Compose recrée uniquement le container app avec la nouvelle image)
   c. Vérifier le health check : docker inspect kyc_app | grep Health
   d. En cas d'échec : docker compose -f docker-compose.prod.yml up -d --no-deps app
      (retour à l'image précédente en cache)
```

Pour un zero-downtime réel avec 2 instances, un load balancer Nginx upstream avec `least_conn` est requis.

### 7.4 Persistence des données

| Donnée              | Mécanisme de persistance                            |
|---------------------|-----------------------------------------------------|
| PostgreSQL          | Volume Docker nommé `kyc_postgres_data_prod`        |
| Redis               | AOF (Append Only File) + RDB snapshot               |
| Modèles ML          | Volume Docker nommé `kyc_ml_models`                 |
| Backups             | Volume Docker `kyc_backups` + export externe recommandé |
| Certificats TLS     | Bind mount `/etc/letsencrypt` (hôte)                |

---

## 8. Architecture d'Observabilité

### 8.1 Métriques Prometheus

L'application expose un endpoint `/metrics` (format Prometheus text) scraped par `kyc_prometheus` toutes les 15 secondes. Les métriques collectées incluent :

| Métrique                              | Type      | Description                                    |
|---------------------------------------|-----------|------------------------------------------------|
| `http_requests_total`                 | Counter   | Nombre de requêtes HTTP par méthode, route, status |
| `http_request_duration_seconds`       | Histogram | Latence des requêtes HTTP                      |
| `trpc_requests_total`                 | Counter   | Requêtes tRPC par procédure et statut          |
| `trpc_request_duration_seconds`       | Histogram | Latence des procédures tRPC                    |
| `aml_alerts_total`                    | Counter   | Alertes AML générées par type                  |
| `transactions_analyzed_total`         | Counter   | Transactions analysées par le moteur AML       |
| `screening_matches_total`             | Counter   | Correspondances screening par liste            |
| `pii_encryption_operations_total`     | Counter   | Opérations de chiffrement/déchiffrement PII    |
| `active_sessions`                     | Gauge     | Sessions utilisateurs actives                  |
| `postgresql_connection_pool_size`     | Gauge     | Taille du pool de connexions PostgreSQL        |

### 8.2 Dashboards Grafana

Deux dashboards sont auto-provisionnés :

**kyc-overview** — Vue générale :
- Taux de requêtes (req/s) par endpoint
- Latence p50/p95/p99
- Taux d'erreur HTTP 4xx/5xx
- Utilisateurs actifs
- Santé des services

**aml-operations** — Opérations AML :
- Alertes AML par heure/jour par type
- Transactions analysées vs alertes déclenchées
- Correspondances screening par liste de sanctions
- Distribution des scores ML
- Temps de traitement moyen (scoring)

### 8.3 Logs Pino → Loki → Grafana

Les logs applicatifs sont produits par **Pino** en format JSON structuré. En production (`LOG_FORMAT=json`), chaque ligne de log contient :

```json
{
  "level": 30,
  "time": 1711670400000,
  "pid": 1,
  "hostname": "kyc_app",
  "name": "auth",
  "msg": "Login successful",
  "userId": "usr_01HX...",
  "ip": "10.0.0.1",
  "durationMs": 127
}
```

Les logs sont collectés depuis le stdout des containers Docker par le driver Loki ou Promtail, et stockés dans `kyc_loki`. Grafana permet la corrélation entre métriques Prometheus et logs Loki via les trace IDs.

**Niveaux de log en production :**
- `trace/debug` : désactivés en production (`LOG_LEVEL=info`)
- `info` : opérations normales
- `warn` : anomalies non bloquantes
- `error` : erreurs avec stack trace et contexte

### 8.4 Alertes

Les règles d'alerte sont définies dans `docker/alerts.yml` (AlertManager) :

| Règle                         | Seuil                          | Sévérité |
|-------------------------------|--------------------------------|----------|
| HighErrorRate                 | Taux erreur 5xx > 5% sur 5min  | critical |
| HighLatency                   | p95 > 1 seconde sur 5min       | warning  |
| DiskSpaceWarning              | Disque hôte > 80%              | warning  |
| DiskSpaceCritical             | Disque hôte > 90%              | critical |
| ServiceDown                   | Health check KO > 2min         | critical |
| SanctionsListStale            | Listes non mises à jour > 36h  | warning  |
| HighAMLAlertRate              | > 100 alertes/heure            | warning  |

---

## 9. Intégration CBS (Core Banking System)

### 9.1 Pattern Webhook Push (recommandé)

Le CBS envoie des événements (nouvelles transactions, nouveaux clients) vers l'endpoint `/api/webhook` de la plateforme :

```
CBS → POST https://kyc.example.com/api/webhook
      Headers:
        Content-Type: application/json
        X-Webhook-Signature: hmac-sha256=<hex_digest>
        X-Transaction-ID: <unique_id>
      Body: { "event": "TRANSACTION_CREATED", "data": {...} }
```

**Validation HMAC-SHA256 :**

Chaque payload entrant est validé par comparaison de signature :

```
signature_attendue = HMAC-SHA256(WEBHOOK_SECRET, raw_body_bytes)
signature_reçue = X-Webhook-Signature header (hex)
Résultat = comparaison en temps constant (crypto.timingSafeEqual)
```

**Idempotence :** chaque événement porte un `transactionId` unique. La plateforme vérifie en base que l'événement n'a pas déjà été traité (`webhook_events` table), garantissant l'idempotence même en cas de rejeu du CBS.

### 9.2 Pattern API Pull (alternatif)

Si le CBS ne supporte pas les webhooks, la plateforme peut interroger périodiquement une API CBS via un job cron configuré. Ce mode est moins temps-réel mais peut convenir aux systèmes legacy.

### 9.3 Configuration requise côté CBS

| Paramètre                 | Valeur requise                             |
|---------------------------|--------------------------------------------|
| URL cible                 | `https://<domaine>/api/webhook`            |
| Méthode HTTP              | POST                                       |
| Content-Type              | `application/json`                         |
| Secret partagé            | `WEBHOOK_SECRET` (min 16 chars, partagé)   |
| En-tête de signature      | `X-Webhook-Signature: hmac-sha256=<hex>`   |
| En-tête idempotence       | `X-Transaction-ID: <unique_uuid>`          |
| Timeout attendu           | 30 secondes maximum                        |
| Retry policy CBS          | 3 tentatives avec backoff exponentiel      |

---

## 10. Scalabilité et Limites

### 10.1 Capacité nominale actuelle

| Métrique                    | Valeur nominale estimée         | Remarque                         |
|-----------------------------|----------------------------------|----------------------------------|
| Requêtes API concurrentes   | ~200 requêtes simultanées        | Pool connexions PostgreSQL       |
| Transactions AML/minute     | ~1 000 transactions/minute       | Test de charge à valider         |
| Utilisateurs actifs         | ~500 utilisateurs simultanés     | Limité par RAM (512M app)        |
| Taille base de données      | Illimitée (disque hôte)          | Performance à surveiller > 100Go |
| Listes sanctions            | 500k+ entrées en cache Redis     | Dans la limite 512MB             |

### 10.2 Bottlenecks identifiés

| Composant          | Risque                       | Mitigation                             |
|--------------------|------------------------------|----------------------------------------|
| ML scoring         | Latence CPU (XGBoost)        | Traitement asynchrone, queue           |
| Génération PDF     | CPU/mémoire (pdfmake)        | File d'attente, génération off-peak    |
| Chargement listes  | I/O réseau (cron 02h00)      | Cache Redis 23h, téléchargement async  |
| Pool PostgreSQL     | Épuisement connexions         | pgBouncer (non inclus, optionnel)      |

### 10.3 Stratégie de montée en charge

L'application est **stateless** : toutes les sessions et états partagés sont stockés dans Redis. Il est donc possible de déployer plusieurs instances `kyc_app` derrière Nginx avec `upstream` et `least_conn` :

```nginx
upstream kyc_backend {
    least_conn;
    server kyc_app_1:3000;
    server kyc_app_2:3000;
}
```

Cette approche ne nécessite pas Kubernetes pour des charges modérées.

### 10.4 Limites actuelles

| Limite                    | Description                                           |
|---------------------------|-------------------------------------------------------|
| Single Docker host        | Pas de haute disponibilité native de l'hôte           |
| Pas de Kubernetes         | Orchestration avancée non configurée                  |
| PostgreSQL single node    | Pas de réplication native (read replicas)             |
| Redis single node         | Pas de Redis Sentinel / Cluster                       |
| ML CPU-bound              | Pas de GPU, pas de batch processing distribué         |

Pour les charges supérieures ou les exigences de haute disponibilité strictes, un passage vers une infrastructure managée (RDS PostgreSQL, ElastiCache Redis, EKS ou AKS) est recommandé.

---

## 11. Décisions d'Architecture (ADR)

### ADR-001 : tRPC vs REST API

| Champ         | Valeur                                                     |
|---------------|------------------------------------------------------------|
| Statut        | ACCEPTÉ                                                    |
| Décideurs     | Lead Dev, Architecte                                       |
| Date          | Octobre 2025                                               |

**Contexte :** Choix du protocole de communication entre le frontend React et le backend Node.js.

**Options envisagées :**
- REST API avec OpenAPI/Swagger
- GraphQL (Apollo)
- tRPC

**Décision :** tRPC v11.

**Justification :**
- Type safety de bout en bout sans génération de code supplémentaire
- Les types TypeScript du serveur sont directement consommés par le client via un seul import de type
- Zod est utilisé pour la validation à la fois côté serveur (input schema) et côté client
- Pas de documentation d'API à maintenir séparément
- Excellente intégration avec TanStack Query pour le caching et le prefetching
- Performance similaire à REST (HTTP/1.1 + JSON)

**Inconvénients acceptés :**
- Couplage fort client-serveur (même dépôt, acceptable en monorepo)
- Non consommable directement depuis des clients non-TypeScript (CBS doit passer par les webhooks REST dédiés)

---

### ADR-002 : Monolithe modulaire vs microservices

| Champ         | Valeur                                                     |
|---------------|------------------------------------------------------------|
| Statut        | ACCEPTÉ                                                    |
| Décideurs     | CTO, Architecte Principal                                  |
| Date          | Septembre 2025                                             |

**Contexte :** Définir le pattern architectural principal de la plateforme.

**Options envisagées :**
- Microservices (service par domaine : KYC, AML, Auth, Screening)
- Monolithe modulaire (modules dans un seul process)

**Décision :** Monolithe modulaire.

**Justification :**
- Équipe de taille réduite : l'overhead opérationnel des microservices (service mesh, distributed tracing, déploiement indépendant) dépasse les bénéfices
- Transactions ACID multi-domaines sans coordination distribuée (ex: créer un client + déclencher un screening + logger l'audit en une transaction PostgreSQL)
- Déploiement simplifié sur un seul hôte Docker
- Le service ML est délibérément isolé car il a des dépendances Python incompatibles avec Node.js
- Latence réseau nulle pour les appels intra-domaine critiques
- Migration future possible vers microservices si besoin (modules bien délimités)

---

### ADR-003 : Drizzle ORM vs Prisma

| Champ         | Valeur                                                     |
|---------------|------------------------------------------------------------|
| Statut        | ACCEPTÉ                                                    |
| Décideurs     | Lead Dev                                                   |
| Date          | Octobre 2025                                               |

**Contexte :** Choix de l'ORM pour l'accès à PostgreSQL.

**Options envisagées :**
- Prisma (avec Prisma Client)
- Drizzle ORM
- TypeORM
- Knex.js (query builder)

**Décision :** Drizzle ORM.

**Justification :**
- Migrations en SQL pur, versionnées dans Git, lisibles et auditables par tout DBA
- Aucune couche d'abstraction cachée : les requêtes générées sont prévisibles et optimisables
- Performance supérieure (pas de proxy Prisma Client Engine)
- Schéma TypeScript-first avec inférence de types complète
- Pas de dépendance native compilée (contrairement à Prisma)
- Facilité d'écriture de requêtes complexes sans tomber dans du SQL brut

**Inconvénients acceptés :**
- Écosystème plus jeune que Prisma
- Moins de plugins/extensions disponibles

---

### ADR-004 : pdfmake vs Puppeteer pour la génération PDF

| Champ         | Valeur                                                     |
|---------------|------------------------------------------------------------|
| Statut        | ACCEPTÉ                                                    |
| Décideurs     | Lead Dev, DevOps                                           |
| Date          | Novembre 2025                                              |

**Contexte :** Génération de rapports PDF (rapports KYC, déclarations TRACFIN).

**Options envisagées :**
- Puppeteer (Chromium headless)
- pdfmake (génération programmatique)
- wkhtmltopdf
- jsPDF

**Décision :** pdfmake.

**Justification :**
- Puppeteer nécessite Chromium en production : image Docker > 800MB, surface d'attaque élargie, CVE fréquents
- pdfmake est une bibliothèque pure JavaScript : légère, pas de dépendance système
- La structure des rapports KYC est suffisamment standardisée pour être définie programmatiquement
- Pas de sandbox Chromium à configurer dans Docker
- Image Docker finale significativement plus petite

**Inconvénients acceptés :**
- Mise en page moins flexible qu'un rendu HTML→PDF
- Nécessite de définir les layouts en JSON/JS plutôt qu'en HTML/CSS

---

### ADR-005 : XGBoost vs réseau de neurones (Deep Learning)

| Champ         | Valeur                                                     |
|---------------|------------------------------------------------------------|
| Statut        | ACCEPTÉ                                                    |
| Décideurs     | Data Scientist, RSSI, Compliance Officer                   |
| Date          | Octobre 2025                                               |

**Contexte :** Algorithme de scoring de risque AML/KYC pour le service ML.

**Options envisagées :**
- XGBoost (gradient boosting sur arbres de décision)
- Random Forest
- Réseau de neurones / Deep Learning (LSTM, Transformer)

**Décision :** XGBoost.

**Justification :**
- **Interprétabilité réglementaire** : les régulateurs AML (ACPR, ABE) exigent que les décisions algorithmiques soient explicables. XGBoost fournit des feature importances et est compatible SHAP (SHapley Additive exPlanations)
- Performance supérieure aux forêts aléatoires sur les données tabulaires de transactions financières
- Retraining rapide (< 10 minutes sur 6 mois de données) vs heures pour un réseau de neurones
- Faible empreinte mémoire (< 1Go)
- Pas de GPU requis (CPU-only suffisant)
- Librairie mature avec support long terme
- Les réseaux de neurones LSTM sont plus performants sur les séries temporelles longues mais au détriment total de l'interprétabilité

**Inconvénients acceptés :**
- Performances inférieures aux LSTM pour la détection de patterns temporels très complexes
- Feature engineering manuel nécessaire (vs apprentissage automatique des features en Deep Learning)

---

*Ce document est maintenu par l'équipe Architecture & Sécurité. Toute modification doit faire l'objet d'une revue et d'une incrémentation du numéro de version.*

*Classification : CONFIDENTIEL — Ne pas diffuser en dehors du périmètre contractuel défini.*
