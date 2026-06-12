# Guide de Mise en Production On-Premise
# KYC-Lab FT Platform v2.0

> **Classification** : CONFIDENTIEL — Usage Interne & Partenaires
> **Version** : 2.0.0 — Date : 12 juin 2026
> **Destinataires** : Équipe DSI client, Compliance Officer, DevOps, DBA

---

## Table des matires

1. [Prrequis Infrastructure](#1-prrequis-infrastructure)
2. [Architecture de Dploiement](#2-architecture-de-dploiement)
3. [Installation tape par tape](#3-installation-tape-par-tape)
4. [Configuration Complte des Variables](#4-configuration-complte-des-variables)
5. [Intgration CBS Complte](#5-intgration-cbs-complte)
6. [Scurit & Durcissement](#6-scurit--durcissement)
7. [Monitoring & Alertes](#7-monitoring--alertes)
8. [Backup & Restauration](#8-backup--restauration)
9. [Maintenance & Oprations](#9-maintenance--oprations)
10. [Validation & Recette](#10-validation--recette)
11. [Contacts & Escalade](#11-contacts--escalade)

---

## 1. Prrequis Infrastructure

### 1.1 Serveur Minimum

| Composant | Minimum | Recommand |
|---|---|---|
| **CPU** | 4 vCPU | 8 vCPU |
| **RAM** | 8 GB | 16 GB |
| **Disque** | 100 GB SSD | 250 GB SSD (NVMe) |
| **OS** | Ubuntu 22.04 LTS / Debian 12 / RHEL 9 | Ubuntu 22.04 LTS |
| **Rseau** | 100 Mbps | 1 Gbps |

### 1.2 Logiciels Requis

```bash
# Docker Engine 24+
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Docker Compose v2
# (inclus avec Docker Engine depuis v24)

# Outils utilitaires
sudo apt install -y curl jq openssl certbot
```

### 1.3 Ports Rseau

| Port | Service | Direction | Obligatoire |
|---|---|---|---|
| **443** | HTTPS (Nginx) | Entrant | Oui |
| **80** | HTTP redirect + ACME | Entrant | Oui |
| **22** | SSH administration | Entrant | Oui |
| ~~5432~~ | PostgreSQL | **Interne Docker uniquement** | Non expos |
| ~~6379~~ | Redis | **Interne Docker uniquement** | Non expos |
| ~~3000~~ | App Node.js | **Interne Docker uniquement** | Non expos |
| ~~8000~~ | ML Python | **Interne Docker uniquement** | Non expos |
| **3001** | Grafana (optionnel) | Entrant restreint | Optionnel |

### 1.4 DNS requis

Configurer ces enregistrements DNS **avant** l'installation :

```
kyc.votre-domaine.fr          A    → IP du serveur
grafana.votre-domaine.fr      A    → IP du serveur (optionnel)
```

---

## 2. Architecture de Dploiement

```
                        Internet
                           │
                    ┌──────┴──────┐
                    │   Firewall  │  Ports 80, 443, 22
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │      Nginx (TLS)        │  Let's Encrypt auto-renew
              │  Rate limiting, HSTS    │  Security headers
              │  /:443 → app:3000      │
              └────────────┬────────────┘
                           │ Rseau Docker interne (kyc_network_prod)
          ┌────────────────┼─────────────────────────┐
          │                │                         │
    ┌─────┴─────┐   ┌─────┴─────┐            ┌──────┴──────┐
    │  App Node  │   │  ML Python│            │ Prometheus  │
    │  (tRPC)    │   │  (FastAPI)│            │ + Grafana   │
    │  port 3000 │   │  port 8000│            │ + Loki      │
    └─────┬──┬───┘   └─────┬─────┘            └─────────────┘
          │  │              │
    ┌─────┴──┴───┐   ┌─────┴─────┐
    │ PostgreSQL  │   │   Redis   │
    │    16       │   │    7      │
    │  port 5432  │   │ port 6379 │
    └─────────────┘   └───────────┘
```

**11 services Docker :**

| Service | Image | Rle |
|---|---|---|
| `app` | `ghcr.io/repo:latest` | Application Node.js (Express + tRPC + React) |
| `migrate` | mme image | Excution des migrations DB (run-once) |
| `ml` | `kyc-ml:latest` | Service ML Python (scoring AML + biomtrie) |
| `postgres` | `postgres:16-alpine` | Base de donnes principale |
| `redis` | `redis:7-alpine` | Cache, sessions, dduplication, travel rule |
| `nginx` | `nginx:alpine` | Reverse proxy TLS, rate limiting |
| `certbot` | `certbot/certbot` | Renouvellement certificats TLS (12h) |
| `backup` | `postgres:16-alpine` | Backup pg_dump quotidien, rtention 30j |
| `prometheus` | `prom/prometheus` | Collecte mtriques (rtention 30j) |
| `grafana` | `grafana/grafana` | Dashboards et visualisation |
| `loki` | `grafana/loki` | Agrgation centralise des logs |

---

## 3. Installation tape par tape

### tape 1 — Cloner le dpt

```bash
cd /opt
git clone https://github.com/VOTRE-ORG/kyc-lab-ft-platforme.git regtech
cd regtech
```

### tape 2 — Gnrer les secrets de production

```bash
chmod +x scripts/generate-secrets.sh
./scripts/generate-secrets.sh docker/.env.production
```

Ce script gnre automatiquement :
- `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` (256 bits chacun)
- `PII_ENCRYPTION_KEY` (AES-256-GCM pour donnes personnelles)
- `MFA_ENCRYPTION_KEY` (chiffrement secrets TOTP)
- `ML_INTERNAL_API_KEY` (auth service Python)
- `WEBHOOK_SECRET` ( partager avec le CBS)
- `ADMIN_PASSWORD` (mot de passe initial)

### tape 3 — Personnaliser la configuration

Ouvrir `docker/.env.production` et ajuster :

```bash
# OBLIGATOIRE — Adapter ces valeurs
ADMIN_EMAIL=compliance@votre-banque.fr
CORS_ORIGINS=https://kyc.votre-domaine.fr
INSTITUTION_TYPE=CLASSIC_BANK          # ou PAYMENT_INSTITUTION
INSTITUTION_NAME=Nom de votre tablissement

# Organisation (rapports SAR/TRACFIN)
ORG_NAME=Votre Banque SA
ORG_ADDRESS=123 Boulevard Principal
ORG_CITY=Casablanca
ORG_POSTAL_CODE=20000
ORG_COUNTRY=MA
ORG_PHONE=+212522000000
ORG_EMAIL=compliance@votre-banque.fr

# CBS — voir Section 5
CBS_MODE=live
CBS_BASE_URL=https://cbs-interne.votre-banque.fr/api/v2
CBS_API_KEY=<cl fournie par lquipe CBS>

# Rglementation
TRANSMISSION_MODE=GOAML_BAM           # Maroc
# TRANSMISSION_MODE=TRACFIN_PORTAL    # France
```

### tape 4 — Obtenir le certificat TLS

```bash
sudo certbot certonly --standalone \
  -d kyc.votre-domaine.fr \
  --agree-tos \
  --email ops@votre-domaine.fr
```

### tape 5 — Adapter la configuration Nginx

Copier le template et remplacer le domaine :

```bash
export DOMAIN="kyc.votre-domaine.fr"
envsubst '${DOMAIN}' < docker/nginx.conf.template > docker/nginx.conf
```

### tape 6 — Lancer la stack

```bash
cd /opt/regtech

docker compose -p kyc-aml \
  -f docker/docker-compose.prod.yml \
  --env-file docker/.env.production \
  up -d
```

Squence de dmarrage automatique :
1. PostgreSQL dmarre + healthcheck (30s)
2. Redis dmarre + healthcheck
3. Container `migrate` excute les migrations Drizzle
4. App Node.js dmarre (port 3000)
5. Service ML Python dmarre (port 8000)
6. Nginx dmarre (ports 80/443)
7. Monitoring (Prometheus, Grafana, Loki)
8. Backup (cron quotidien)

### tape 7 — Vrification

```bash
# Health check application
curl -s https://kyc.votre-domaine.fr/health | jq .

# Rponse attendue :
# {
#   "status": "ok",
#   "services": {
#     "database": "connected",
#     "redis": "connected",
#     "ml": "connected"
#   }
# }

# Health check ML
docker exec kyc_ml curl -s http://localhost:8000/health | jq .

# Vrifier les logs
docker logs kyc_app --tail 30
docker logs kyc_ml --tail 20
docker logs kyc_postgres --tail 10
```

### tape 8 — Premier login

1. Ouvrir `https://kyc.votre-domaine.fr`
2. Se connecter avec :
   - Email : valeur de `ADMIN_EMAIL` dans `.env.production`
   - Mot de passe : valeur de `ADMIN_PASSWORD` dans `.env.production`
3. **Changer le mot de passe immdiatement**
4. Activer le MFA (Google Authenticator)

---

## 4. Configuration Complte des Variables

### 4.1 Variables Obligatoires

| Variable | Format | Description |
|---|---|---|
| `NODE_ENV` | `production` | Mode production |
| `DATABASE_URL` | `postgresql://user:pass@postgres:5432/db` | Connexion PostgreSQL |
| `REDIS_URL` | `redis://:password@redis:6379` | Connexion Redis |
| `REDIS_PASSWORD` | string 32+ chars | Mot de passe Redis |
| `DB_USER` | string | Utilisateur PostgreSQL |
| `DB_PASSWORD` | string 32+ chars | Mot de passe PostgreSQL |
| `DB_NAME` | string | Nom de la base |
| `JWT_ACCESS_SECRET` | hex 64 chars | Secret JWT access (15 min) |
| `JWT_REFRESH_SECRET` | hex 64 chars | Secret JWT refresh (7 jours) |
| `PII_ENCRYPTION_KEY` | hex 64 chars | Cl AES-256-GCM (donnes personnelles) |
| `MFA_ENCRYPTION_KEY` | hex 64 chars | Cl AES-256-GCM (secrets TOTP) |
| `ADMIN_EMAIL` | email | Email admin initial |
| `ADMIN_PASSWORD` | string 12+ chars | Mot de passe admin initial |
| `WEBHOOK_SECRET` | hex 64 chars | Secret HMAC-SHA256 pour webhooks CBS |
| `ML_INTERNAL_API_KEY` | hex 64 chars | Auth service ML Python |
| `CORS_ORIGINS` | URL | Domaine autoris (ex: `https://kyc.bank.fr`) |

### 4.2 Variables CBS

| Variable | Format | Description |
|---|---|---|
| `CBS_MODE` | `live` / `mock` / `absent` | Mode CBS |
| `CBS_BASE_URL` | URL | Endpoint API CBS |
| `CBS_API_KEY` | string | Bearer token CBS |

### 4.3 Variables Mtier (Seuils AML)

| Variable | Dfaut | Description |
|---|---|---|
| `AML_THRESHOLD_SINGLE_TX` | 10000 | Seuil transaction unique (devise locale) |
| `AML_THRESHOLD_STRUCTURING` | 3000 | Seuil fractionnement |
| `AML_STRUCTURING_WINDOW_HOURS` | 24 | Fentre d'analyse structuring (heures) |
| `AML_FREQUENCY_THRESHOLD` | 10 | Nb max transactions avant alerte |
| `AML_VOLUME_VARIATION_THRESHOLD` | 300 | Variation volume (%) |
| `SCREENING_MATCH_THRESHOLD` | 80 | Score minimum pour MATCH sanctions |
| `SCREENING_REVIEW_THRESHOLD` | 50 | Score minimum pour REVIEW |

### 4.4 Variables pKYC (Perpetual KYC)

| Variable | Dfaut | Description |
|---|---|---|
| `PKYC_ENABLED` | `true` | Activer le scoring nightly |
| `PKYC_CRON` | `0 1 * * *` | Heure d'excution (01:00 UTC) |
| `PKYC_DRIFT_THRESHOLD` | 40 | Score de drive dclenchant revue |
| `PKYC_BASELINE_DAYS` | 30 | Fentre de rfrence (jours) |
| `PKYC_WINDOW_DAYS` | 7 | Fentre d'analyse rcente (jours) |

### 4.5 Variables Reporting

| Variable | Valeur | Description |
|---|---|---|
| `TRANSMISSION_MODE` | `SIMULATION` | Pas d'envoi rel |
| | `TRACFIN_PORTAL` | Tldclaration France |
| | `GOAML_DIRECT` | GoAML UNODC direct |
| | `GOAML_BAM` | GoAML via Bank Al-Maghrib (Maroc) |
| `GOAML_BAM_URL` | URL | Endpoint API BAM |
| `GOAML_BAM_CLIENT_ID` | string | OAuth2 client ID BAM |
| `GOAML_BAM_CLIENT_SECRET` | string | OAuth2 client secret BAM |
| `TRACFIN_ENTITY_ID` | string | Identifiant entit dclarante |

---

## 5. Intgration CBS Complte

### 5.1 Vue d'ensemble

L'intgration CBS est **bidirectionnelle** :

```
CBS (Core Banking)                   KYC-Lab Platform
─────────────────                   ─────────────────
                    ENTRANT (CBS → Plateforme)
Transactions    ──webhook──→  Ingestion + scoring AML
Mobile Money    ──webhook──→  Ingestion + scoring AML
ISO 20022       ──webhook──→  Parsing CAMT.053/PACS.008

                    SORTANT (Plateforme → CBS)
                 ←──API────  Sync statut KYC (APPROVED/REJECTED)
                 ←──API────  Gel/dgel des comptes
                 ←──API────  Push alertes critiques
                 ←──API────  Notification SAR soumis
                 ←──API────  Sync scoring de risque
```

### 5.2 Flux Entrants — Le CBS envoie des donnes  la plateforme

#### 5.2.1 Webhook Transactions

**Endpoint :** `POST https://kyc.votre-domaine.fr/webhooks/transaction`
**Authentification :** Signature HMAC-SHA256

**Le CBS DOIT appeler cet endpoint  chaque transaction client.**

**Payload JSON :**

```json
{
  "transactionId": "CBS-2026-TX-089451",
  "customerId": 42,
  "amount": "15000.00",
  "currency": "MAD",
  "transactionType": "TRANSFER",
  "channel": "ONLINE",
  "counterparty": "ACME Corp SARL",
  "counterpartyCountry": "DE",
  "counterpartyBank": "Deutsche Bank AG",
  "purpose": "Rglement facture F-2026-0089",
  "transactionDate": "2026-06-12T14:32:00Z",
  "timestamp": 1749731520000
}
```

**Champs obligatoires :**

| Champ | Type | Description |
|---|---|---|
| `transactionId` | string | Identifiant unique CBS (cl d'idempotence) |
| `customerId` | integer | ID client dans la plateforme KYC |
| `amount` | string | Montant (format dcimal : "15000.00") |
| `transactionType` | enum | `TRANSFER`, `DEPOSIT`, `WITHDRAWAL`, `PAYMENT`, `EXCHANGE` |
| `timestamp` | number | Unix milliseconds (pour vrification fracheur 5 min) |

**Champs optionnels (recommands) :**

| Champ | Type | Description |
|---|---|---|
| `currency` | string | ISO 4217 (dfaut: "EUR") |
| `channel` | enum | `ONLINE`, `MOBILE`, `BRANCH`, `ATM`, `API` |
| `counterparty` | string | Nom du bnficiaire |
| `counterpartyCountry` | string | Code pays ISO 3166-1 |
| `counterpartyBank` | string | Banque du bnficiaire |
| `purpose` | string | Motif de l'opration |
| `transactionDate` | string | Date/heure ISO 8601 |

**Rponse :**

```json
{
  "success": true,
  "transactionId": "TXN-ABCD1234EF",
  "riskScore": 78,
  "isSuspicious": true
}
```

| Champ rponse | Description |
|---|---|
| `transactionId` | ID interne plateforme (pour rfrence) |
| `riskScore` | Score de risque 0-100 |
| `isSuspicious` | `true` si alerte AML dclenche |

**Codes retour :**

| Code | Signification | Action CBS |
|---|---|---|
| 200 | Transaction traite | OK |
| 200 + `duplicate:true` | Dj traite (idempotent) | OK, ignorer |
| 400 | Payload invalide | Corriger et renvoyer |
| 401 | Signature HMAC invalide | Vrifier WEBHOOK_SECRET |
| 403 | Client KYC rejet ou compte gel | Bloquer la transaction |
| 500 | Erreur serveur | Retry avec backoff exponentiel |

---

#### 5.2.2 Signature HMAC-SHA256

**Algorithme :** Le CBS signe le body brut (bytes avant dcodage JSON) avec le `WEBHOOK_SECRET` partag.

**Header :** `x-webhook-signature: sha256={hex}`

**Implmentation Python (CBS) :**

```python
import hmac, hashlib, json, time, requests

WEBHOOK_SECRET = "3e97638651f0e902..."  # Partag par l'quipe KYC
PLATFORM_URL   = "https://kyc.votre-domaine.fr"

def send_transaction(tx_data):
    """Envoyer une transaction au KYC-Lab Platform."""
    payload = {
        "transactionId": tx_data["id"],
        "customerId":    tx_data["customer_id"],
        "amount":        str(tx_data["amount"]),
        "currency":      tx_data["currency"],
        "transactionType": tx_data["type"],
        "channel":       tx_data.get("channel", "API"),
        "counterparty":  tx_data.get("counterparty"),
        "counterpartyCountry": tx_data.get("counterparty_country"),
        "counterpartyBank": tx_data.get("counterparty_bank"),
        "purpose":       tx_data.get("purpose"),
        "transactionDate": tx_data.get("date"),
        "timestamp":     int(time.time() * 1000)
    }

    body = json.dumps(payload, separators=(',', ':'), ensure_ascii=False)
    signature = hmac.new(
        WEBHOOK_SECRET.encode('utf-8'),
        body.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    response = requests.post(
        f"{PLATFORM_URL}/webhooks/transaction",
        data=body.encode('utf-8'),
        headers={
            "Content-Type": "application/json",
            "x-webhook-signature": f"sha256={signature}"
        },
        timeout=10
    )

    result = response.json()
    return result
    # result["riskScore"]     → Score de risque AML (0-100)
    # result["isSuspicious"]  → True si alerte AML dclenche
```

**Implmentation Java (CBS) :**

```java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.http.*;
import java.time.Instant;

public class KycWebhookClient {
    private static final String WEBHOOK_SECRET = "3e97638651f0e902...";
    private static final String PLATFORM_URL = "https://kyc.votre-domaine.fr";

    public String sendTransaction(Map<String, Object> txData) throws Exception {
        txData.put("timestamp", Instant.now().toEpochMilli());

        String body = new ObjectMapper().writeValueAsString(txData);

        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(WEBHOOK_SECRET.getBytes("UTF-8"), "HmacSHA256"));
        String signature = bytesToHex(mac.doFinal(body.getBytes("UTF-8")));

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(PLATFORM_URL + "/webhooks/transaction"))
            .header("Content-Type", "application/json")
            .header("x-webhook-signature", "sha256=" + signature)
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .timeout(Duration.ofSeconds(10))
            .build();

        HttpResponse<String> response = HttpClient.newHttpClient()
            .send(request, HttpResponse.BodyHandlers.ofString());

        return response.body();
    }
}
```

**Implmentation cURL (test) :**

```bash
#!/bin/bash
WEBHOOK_SECRET="3e97638651f0e902..."
URL="https://kyc.votre-domaine.fr/webhooks/transaction"

PAYLOAD=$(cat <<JSONEOF
{"transactionId":"CBS-TEST-001","customerId":1,"amount":"5000.00","currency":"MAD","transactionType":"TRANSFER","channel":"API","counterparty":"Test Beneficiary","counterpartyCountry":"MA","timestamp":$(date +%s000)}
JSONEOF
)

SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')

curl -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: sha256=$SIG" \
  -d "$PAYLOAD" \
  -w "\nHTTP Status: %{http_code}\n"
```

---

#### 5.2.3 Webhooks Mobile Money

**Activation :** Mettre `INSTITUTION_TYPE=PAYMENT_INSTITUTION` dans `.env.production`

| Endpoint | Oprateur | Devise | Payload cl |
|---|---|---|---|
| `POST /webhooks/mobile/orange` | Orange Money | MAD | `transactionRef`, `clientId`, `operationType`, `msisdn` |
| `POST /webhooks/mobile/wave` | Wave | XOF | `id`, `customer_id`, `type`, `recipient`, `ts` (secondes!) |
| `POST /webhooks/mobile/cih` | CIH Mobile | MAD | `refOperacion`, `idCliente`, `typeOperation`, `beneficiaire` |

Mme authentification HMAC-SHA256, mme `WEBHOOK_SECRET`.

**Mapping des types d'opration :**

| Orange Money | Wave | CIH Mobile | Type interne |
|---|---|---|---|
| `CASH_IN` | - | `RECHARGE` | `AGENT_CASH_IN` |
| `CASH_OUT` | - | `RETRAIT` | `AGENT_CASH_OUT` |
| `TRANSFER` | `send` | `VIREMENT` | `P2P_TRANSFER` |
| `PAYMENT` | `payment` | `PAIEMENT` | `MERCHANT_PAYMENT` |
| - | `receive` | - | `MOBILE_MONEY_IN` |

---

### 5.3 Flux Sortants — La plateforme notifie le CBS

Le CBS **doit exposer les endpoints suivants** pour recevoir les notifications de la plateforme.

#### 5.3.1 API CBS requise — Endpoints  implmenter ct CBS

Le SDK de la plateforme (`KycCbsClient`) appelle ces endpoints sur `CBS_BASE_URL` :

```
CBS_BASE_URL = https://cbs-interne.votre-banque.fr/api/v2
```

**Authentification :** Bearer token (`CBS_API_KEY`) dans le header `Authorization`.

```
Authorization: Bearer <CBS_API_KEY>
X-Source: KYC-Platform-v2
Content-Type: application/json
```

---

##### Endpoint 1 : Synchronisation KYC Status

**Quand :** Chaque fois qu'un client est approuv, rejet ou expir sur la plateforme.

```
PUT {CBS_BASE_URL}/customers/{customerId}/kyc-status
```

**Payload :**

```json
{
  "customerId": "C-042",
  "kycStatus": "APPROVED",
  "riskLevel": "MEDIUM",
  "validUntil": "2027-06-12T00:00:00Z",
  "source": "KYC_PLATFORM_V2",
  "updatedAt": "2026-06-12T15:30:00Z"
}
```

| Champ | Type | Valeurs possibles |
|---|---|---|
| `customerId` | string | Rfrence client CBS |
| `kycStatus` | enum | `APPROVED`, `REJECTED`, `EXPIRED` |
| `riskLevel` | enum | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `validUntil` | string (ISO 8601) | Date d'expiration KYC (optionnel) |
| `source` | string | Toujours `"KYC_PLATFORM_V2"` |
| `updatedAt` | string (ISO 8601) | Horodatage de la mise  jour |

**Rponse attendue du CBS :**

```json
{
  "acknowledged": true
}
```

**vnements dclencheurs :**
- Approbation d'un dossier KYC par un analyste/compliance officer
- Rejet d'un dossier KYC
- Expiration automatique d'un KYC (via pKYC nightly scoring)
- Promotion de tier wallet (ALLEGED → STANDARD → RENFORC)

---

##### Endpoint 2 : Gel des Comptes

**Quand :** Dcision SAR/STR valide, match sanctions confirm, ou gel manuel.

```
POST {CBS_BASE_URL}/customers/{customerId}/block
```

**Payload :**

```json
{
  "customerId": "C-042",
  "reason": "SAR dpose  Case CASE-2026-00042  Structuring pattern dtect",
  "blockedBy": "compliance@votre-banque.fr",
  "reference": "CASE-2026-00042"
}
```

| Champ | Type | Description |
|---|---|---|
| `customerId` | string | Rfrence client CBS |
| `reason` | string | Motif du gel (audit trail) |
| `blockedBy` | string | Identit de l'officier compliance |
| `reference` | string | Rfrence du dossier (Case ID ou Report ID) |

**Rponse attendue du CBS :**

```json
{
  "success": true,
  "reference": "BLK-1749731520000",
  "frozenAt": "2026-06-12T15:32:00Z"
}
```

**Le CBS DOIT :**
- Geler **tous les comptes** du client immdiatement
- Bloquer tout mouvement dbiteur et crditeur
- Retourner une rfrence de blocage et l'horodatage
- Conserver la traabilit dans son propre audit log

**vnements dclencheurs :**
- Dcision SAR/STR valide dans un Case (workflow 4-yeux)
- Match sanctions confirm (screening OFAC/EU/UN/BAM)
- Gel manuel par un compliance officer

---

##### Endpoint 3 : Dgel des Comptes

**Quand :** Clture d'un dossier sans action, faux positif confirm.

```
POST {CBS_BASE_URL}/customers/{customerId}/unblock
```

**Payload :**

```json
{
  "customerId": "C-042",
  "reason": "Dossier clos sans suite  CASE-2026-00042  Faux positif confirm"
}
```

**Rponse attendue :**

```json
{
  "success": true
}
```

---

##### Endpoint 4 : Push Alertes Critiques

**Quand :** Alerte AML de svrit CRITICAL gnre.

```
POST {CBS_BASE_URL}/alerts
```

**Payload :**

```json
{
  "customerId": "C-042",
  "alertType": "TRANSACTION_THRESHOLD",
  "severity": "CRITICAL",
  "description": "Transaction 150 000 MAD  Dpassement seuil unique 100 000 MAD",
  "linkedTransactions": ["TXN-ABCD1234EF", "TXN-WXYZ5678GH"],
  "reportedAt": "2026-06-12T14:35:00Z"
}
```

| Champ | Type | Description |
|---|---|---|
| `customerId` | string | Rfrence client CBS |
| `alertType` | string | Type de rgle dclenche |
| `severity` | enum | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `description` | string | Description lisible de l'alerte |
| `linkedTransactions` | string[] | IDs des transactions lies |
| `reportedAt` | string (ISO 8601) | Horodatage de dtection |

**Types d'alertes possibles :**

| alertType | Description |
|---|---|
| `TRANSACTION_THRESHOLD` | Dpassement de seuil unique |
| `STRUCTURING` | Fractionnement dtect (smurfing) |
| `VELOCITY` | Frquence anormale de transactions |
| `HIGH_RISK_COUNTRY` | Pays GAFI/UE liste noire |
| `PEP_TRANSACTION` | Transaction impliquant un PEP |
| `SANCTIONS_MATCH` | Correspondance liste sanctions |
| `DORMANT_REACTIVATION` | Ractivation compte dormant |
| `HAWALA_PATTERN` | Schma transfert informel (MENA) |
| `ML_ANOMALY` | Anomalie dtecte par ML |
| `NETWORK_CLUSTER` | Cluster UBO suspect |

**Rponse attendue :**

```json
{
  "alertId": "CBS-ALT-2026-001",
  "received": true
}
```

---

##### Endpoint 5 : Rcupration Client (optionnel)

**Usage :** La plateforme peut interroger le CBS pour enrichir un profil client.

```
GET {CBS_BASE_URL}/customers/{customerId}
```

**Rponse attendue :**

```json
{
  "id": "C-042",
  "externalRef": "EXT-042",
  "firstName": "Youssef",
  "lastName": "Benali",
  "dateOfBirth": "1985-03-15",
  "nationality": "MA",
  "address": {
    "street": "123 Bd Anfa",
    "city": "Casablanca",
    "postalCode": "20000",
    "country": "MAR"
  },
  "phone": "+212661234567",
  "email": "youssef.benali@email.com",
  "kycStatus": "APPROVED",
  "riskLevel": "LOW",
  "accounts": [
    {
      "id": "ACC-001",
      "iban": "MA64011519000001205000534921",
      "currency": "MAD",
      "balance": 150000.00,
      "isActive": true,
      "accountType": "CURRENT",
      "openedAt": "2023-01-15T00:00:00Z"
    }
  ],
  "createdAt": "2023-01-15T00:00:00Z",
  "updatedAt": "2026-06-01T00:00:00Z"
}
```

---

##### Endpoint 6 : Rcupration Transactions (optionnel)

**Usage :** Enrichissement historique pour scoring ML.

```
GET {CBS_BASE_URL}/accounts/{accountId}/transactions?page=1&limit=50&from=2026-01-01
```

**Rponse attendue :**

```json
{
  "items": [
    {
      "id": "CBS-TX-001",
      "accountId": "ACC-001",
      "amount": 5000.00,
      "currency": "MAD",
      "direction": "DEBIT",
      "type": "WIRE",
      "channel": "ONLINE",
      "status": "COMPLETED",
      "valueDate": "2026-06-10T10:00:00Z",
      "bookingDate": "2026-06-10T10:00:00Z"
    }
  ],
  "total": 156,
  "page": 1,
  "limit": 50,
  "hasMore": true
}
```

---

##### Endpoint 7 : Ping / Health (obligatoire)

```
GET {CBS_BASE_URL}/health
```

**Rponse attendue :**

```json
{
  "status": "ok",
  "latencyMs": 12
}
```

La plateforme appelle ce endpoint au dmarrage et priodiquement pour vrifier la connectivit CBS.

---

### 5.4 Matrice Complte des Intgrations CBS

| Fonctionnalit | Direction | Endpoint | Dclencheur | Priorit |
|---|---|---|---|---|
| **Transaction monitoring** | CBS → Plateforme | `POST /webhooks/transaction` | Chaque transaction | CRITIQUE |
| **Mobile Money** | CBS → Plateforme | `POST /webhooks/mobile/*` | Chaque opration mobile | HAUTE |
| **KYC Approval** | Plateforme → CBS | `PUT /customers/{id}/kyc-status` | KYC approuv/rejet/expir | CRITIQUE |
| **Gel comptes** | Plateforme → CBS | `POST /customers/{id}/block` | SAR valide, sanctions match | CRITIQUE |
| **Dgel comptes** | Plateforme → CBS | `POST /customers/{id}/unblock` | Dossier clos sans suite | HAUTE |
| **Alertes critiques** | Plateforme → CBS | `POST /alerts` | Alerte AML CRITICAL | HAUTE |
| **Profil client** | Plateforme → CBS | `GET /customers/{id}` | Enrichissement KYC | MOYENNE |
| **Historique TX** | Plateforme → CBS | `GET /accounts/{id}/transactions` | Scoring ML, investigation | MOYENNE |
| **Health check** | Plateforme → CBS | `GET /health` | Dmarrage + priodique | HAUTE |
| **Score risque** | Plateforme → CBS | `PUT /customers/{id}/kyc-status` | Changement score pKYC | MOYENNE |

### 5.5 Diagramme de Squence Complet

```
CBS Client          KYC Platform         AML Engine       ML Service    CBS API
    │                    │                    │                │            │
    │  1. POST /webhooks/transaction (HMAC sign)             │            │
    │────────────────────>                    │                │            │
    │                    │                    │                │            │
    │                    │ 2. Vrifie HMAC    │                │            │
    │                    │ 3. Vrifie timestamp                │            │
    │                    │ 4. Ddup Redis     │                │            │
    │                    │ 5. Insre TX (PENDING)              │            │
    │                    │                    │                │            │
    │  6. Rponse {riskScore, isSuspicious}   │                │            │
    │<────────────────────                    │                │            │
    │                    │                    │                │            │
    │                    │ 7. async: AML Rules                │            │
    │                    │───────────────────>│                │            │
    │                    │                    │ valuation     │            │
    │                    │                    │ 12 rgles      │            │
    │                    │                    │                │            │
    │                    │ 8. async: ML Score │                │            │
    │                    │────────────────────────────────────>│            │
    │                    │                    │                │ XGBoost    │
    │                    │                    │                │ + Isolation│
    │                    │                    │                │ Forest     │
    │                    │                    │                │            │
    │                    │ 9. Si score > seuil│                │            │
    │                    │ → Cration Alerte  │                │            │
    │                    │                    │                │            │
    │                    │ 10. Si alerte CRITICAL              │            │
    │                    │──────────────────────────────────────────────────>
    │                    │                    │                │ pushAlert()│
    │                    │                    │                │            │
    │                    │                    │                │            │
    ═══ Plus tard : Analyst examine alerte ════════════════════════════════
    │                    │                    │                │            │
    │                    │ 11. Analyst → Escalade → Case       │            │
    │                    │ 12. Compliance → SAR dcision        │            │
    │                    │ 13. Approbation 4-yeux (dual ctrl)  │            │
    │                    │                    │                │            │
    │                    │ 14. SAR valide → Gel comptes        │            │
    │                    │──────────────────────────────────────────────────>
    │                    │                    │                │ block()    │
    │                    │                    │                │            │
    │                    │ 15. SAR soumise (TRACFIN/GoAML/BAM) │            │
    │                    │                    │                │            │
```

### 5.6 Configuration Pas--Pas pour le CBS

**tape 1 — Partager le `WEBHOOK_SECRET`**

Le secret HMAC doit tre transmis de manire scurise (jamais par email).
Mthodes recommandes : coffre-fort numrique, tte--tte physique, canal chiffr.

```bash
# Rcuprer le secret gnr
grep WEBHOOK_SECRET docker/.env.production
```

**tape 2 — Configurer les credentials CBS**

```bash
# Dans docker/.env.production :
CBS_MODE=live
CBS_BASE_URL=https://cbs-interne.votre-banque.fr/api/v2
CBS_API_KEY=<bearer_token_fourni_par_equipe_CBS>
```

**tape 3 — Le CBS implmente les endpoints**

L'quipe CBS doit implmenter les 7 endpoints dcrits en section 5.3. Les endpoints 5, 6 (GET customer, GET transactions) sont optionnels pour le lancement, les 4 premiers (KYC sync, block, unblock, alerts) sont **obligatoires**.

**tape 4 — Test de connectivit**

```bash
# Depuis le serveur KYC
# 1. Ping CBS
curl -s -H "Authorization: Bearer $CBS_API_KEY" \
  https://cbs-interne.votre-banque.fr/api/v2/health

# 2. Test webhook (depuis le CBS ou un poste autoris)
# Utiliser le script cURL de la section 5.2.2
```

**tape 5 — Redmarrage avec CBS actif**

```bash
docker compose -p kyc-aml \
  -f docker/docker-compose.prod.yml \
  --env-file docker/.env.production \
  restart app
```

Vrifier les logs :
```bash
docker logs kyc_app --tail 20 | grep CBS
# Attendu : "CBS client initialis (live)"
```

---

## 6. Scurit & Durcissement

### 6.1 Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment "SSH"
sudo ufw allow 80/tcp comment "HTTP (redirect HTTPS)"
sudo ufw allow 443/tcp comment "HTTPS"
sudo ufw enable
```

### 6.2 Fail2Ban

```bash
sudo apt install fail2ban
sudo cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 3600

[nginx-http-auth]
enabled = true
maxretry = 10
bantime = 600
EOF
sudo systemctl restart fail2ban
```

### 6.3 Scurit Docker

- Tous les conteneurs tournent en **utilisateur non-root** (`kyc:nodejs`)
- PostgreSQL et Redis ne sont **pas exposs** sur le rseau externe
- Les secrets sont dans `.env.production` avec permissions `600`
- Le fichier `.env.production` n'est **jamais commit dans Git**

### 6.4 Chiffrement

| Donne | Algorithme | Cl |
|---|---|---|
| Donnes personnelles (PII) | AES-256-GCM | `PII_ENCRYPTION_KEY` |
| Secrets MFA (TOTP) | AES-256-GCM | `MFA_ENCRYPTION_KEY` |
| Mots de passe | bcrypt (12 rounds) | — |
| JWT | HS256 (HMAC-SHA256) | `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` |
| Webhooks CBS | HMAC-SHA256 | `WEBHOOK_SECRET` |
| Transport | TLS 1.2/1.3 | Certificat Let's Encrypt |

### 6.5 RBAC (Rles & Permissions)

| Rle | Accs |
|---|---|
| `admin` | Tout (gestion utilisateurs, rgles AML, configuration) |
| `compliance_officer` | Cases, SAR, dcisions, approbations, screening |
| `supervisor` | Alertes, cases, revue KYC, approbations 4-yeux |
| `analyst` | Alertes, KYC review, cases (sans dcision SAR) |
| `user` | Lecture seule (dashboard, rapports) |

---

## 7. Monitoring & Alertes

### 7.1 Dashboards Grafana

Accs : `https://grafana.votre-domaine.fr` (ou `http://IP:3001`)
Login : `GRAFANA_USER` / `GRAFANA_PASSWORD`

### 7.2 Alertes Prometheus Configures

**14 alertes pr-configures :**

| Alerte | Svrit | Condition |
|---|---|---|
| `AppDown` | CRITICAL | App ne rpond plus (2 min) |
| `DatabaseDown` | CRITICAL | PostgreSQL hors ligne (1 min) |
| `RedisDown` | CRITICAL | Redis hors ligne (1 min) |
| `MlServiceDown` | WARNING | Service ML Python indisponible (5 min) |
| `HighErrorRate` | CRITICAL | Erreurs HTTP 5xx > 5% (5 min) |
| `SlowRequests` | WARNING | Latence p95 > 1s (10 min) |
| `VerySlowRequests` | CRITICAL | Latence p95 > 3s (5 min) |
| `HighHeapUsage` | WARNING | Heap Node.js > 90% (5 min) |
| `HighEventLoopLag` | WARNING | Event loop > 100ms (5 min) |
| `CriticalAmlAlertSpike` | CRITICAL | > 5 alertes CRITICAL en 10 min |
| `AmlAlertBurst` | WARNING | Rafale d'alertes > 0.5/s |
| `SanctionsMatchDetected` | CRITICAL | Match sanctions dtect |
| `MlScoringSlowdown` | WARNING | ML p95 > 2s |
| `MlScoringCritical` | CRITICAL | ML p95 > 5s |

### 7.3 Crons Automatiques

| Cron | Horaire (UTC) | Action |
|---|---|---|
| Screening update | 02:00 quotidien | Mise  jour listes sanctions (OFAC, EU, UN, UK, PEP, BAM) |
| pKYC drift scoring | 01:00 quotidien | Analyse drive comportementale clients |
| ML retraining | 03:00 dimanche | R-entranement modles XGBoost + Isolation Forest |
| Backup PostgreSQL | 02:00 quotidien | pg_dump compress, rtention 30j |
| Certbot renewal | 12h | Renouvellement certificat TLS |

---

## 8. Backup & Restauration

### 8.1 Backup Automatique

Le conteneur `backup` excute un `pg_dump` quotidien.

```bash
# Vrifier les backups
docker exec kyc_backup ls -la /backups/

# Backup manuel
docker exec kyc_backup /backup.sh
```

### 8.2 Restauration

```bash
# Arrter l'application
docker compose -p kyc-aml stop app ml

# Restaurer depuis un backup
docker exec -i kyc_postgres \
  psql -U kyc_user -d kyc_aml_db \
  < /backups/kyc_aml_20260612-020000.sql.gz

# Redmarrer
docker compose -p kyc-aml start app ml
```

### 8.3 Rtention

| Donne | Rtention | Rglementation |
|---|---|---|
| Backup base | 30 jours (rotatifs) | Interne |
| Audit logs | 5 ans | AMLD6 Art.40 |
| Documents KYC | 5 ans aprs fin relation | AMLD6 Art.40 |
| SAR/DS | 10 ans | BAM Circulaire 5/W/2023 |
| Transactions | 5 ans | FATF R.11 |

---

## 9. Maintenance & Oprations

### 9.1 Mise  jour de l'application

```bash
cd /opt/regtech

# Rcuprer la dernire version
git pull origin main

# Reconstruire et redployer
docker compose -p kyc-aml \
  -f docker/docker-compose.prod.yml \
  --env-file docker/.env.production \
  pull app

docker compose -p kyc-aml \
  -f docker/docker-compose.prod.yml \
  --env-file docker/.env.production \
  up -d --no-deps app migrate
```

### 9.2 Rotation des Secrets

**Frquence recommande : tous les 6 mois**

```bash
# 1. Gnrer nouveau WEBHOOK_SECRET
NEW_SECRET=$(openssl rand -hex 32)

# 2. Mettre  jour .env.production
sed -i "s/WEBHOOK_SECRET=.*/WEBHOOK_SECRET=$NEW_SECRET/" docker/.env.production

# 3. Communiquer le nouveau secret au CBS

# 4. Redmarrer l'app
docker compose -p kyc-aml restart app

# 5. Le CBS met  jour son ct

# Note : prvoir une priode de double-acceptation si ncessaire
```

### 9.3 Commandes Utiles

```bash
# tat des services
docker compose -p kyc-aml ps

# Logs en temps rel
docker compose -p kyc-aml logs -f app ml

# Redmarrage d'un service
docker compose -p kyc-aml restart app

# Accs PostgreSQL
docker exec -it kyc_postgres psql -U kyc_user -d kyc_aml_db

# Statistiques Redis
docker exec kyc_redis redis-cli -a $REDIS_PASSWORD INFO stats

# Vrifier espace disque
docker system df
```

---

## 10. Validation & Recette

### 10.1 Checklist de Recette Technique

| # | Test | Commande / Action | Rsultat attendu |
|---|---|---|---|
| 1 | Health check | `curl https://kyc.domain.fr/health` | `{"status":"ok"}` |
| 2 | Login admin | Navigateur → login | Accs dashboard |
| 3 | MFA activation | Paramtres → MFA | QR code Google Auth |
| 4 | Webhook test | Script cURL section 5.2.2 | `{"success":true}` |
| 5 | Webhook signature invalide | Envoyer avec mauvais secret | `401` |
| 6 | Webhook dduplication | Mme transactionId 2x | `{"duplicate":true}` |
| 7 | Cration client KYC | UI → Nouveau client | Client cr en PENDING |
| 8 | Approbation KYC | Analyst → Approve | KYC APPROVED + push CBS |
| 9 | Alerte AML | Webhook TX > seuil | Alerte NEW cre |
| 10 | Investigation | Alerte → Case | Case OPEN cr |
| 11 | Dcision SAR | Case → SAR Filed (4-yeux) | Comptes gels + SAR |
| 12 | Screening | Nom sanctions test | MATCH/REVIEW dtect |
| 13 | Dashboard KPIs | Page dashboard | Graphiques affichs |
| 14 | Export SAR PDF | Reports → Download | PDF gnr |
| 15 | Backup | `docker exec kyc_backup /backup.sh` | Fichier .sql.gz cr |
| 16 | Restauration | Restore depuis backup | Donnes intactes |
| 17 | Prometheus | `curl localhost:9090/-/healthy` | Healthy |
| 18 | Grafana | `http://IP:3001` | Dashboard affich |
| 19 | TLS | `curl -vI https://kyc.domain.fr` | TLS 1.3, HSTS |
| 20 | Rate limiting | 200+ requtes rapides | `429 Too Many Requests` |

### 10.2 Checklist de Recette Mtier (Compliance)

| # | Scnario | Action | Rsultat attendu |
|---|---|---|---|
| 1 | Onboarding standard | Crer client + documents | KYC workflow complet |
| 2 | Client  risque | Client PEP + pays GAFI | Risk: HIGH, screening MATCH |
| 3 | Transaction normale | Virement 5 000 MAD | Score 0, pas d'alerte |
| 4 | Transaction suspecte | Virement 150 000 MAD | Alerte THRESHOLD cre |
| 5 | Fractionnement | 5x 25 000 MAD en 24h | Alerte STRUCTURING cre |
| 6 | Frquence anormale | 15 TX en 1 heure | Alerte VELOCITY cre |
| 7 | Pays  risque | Virement vers Iran/Core Nord | Alerte HIGH_RISK_COUNTRY |
| 8 | Workflow SAR complet | Alerte → Case → SAR → Export | PDF + XML gnr |
| 9 | 4-yeux | SAR ncessite 2 approbateurs | Workflow dual-control OK |
| 10 | Gel/dgel | SAR → gel CBS → clture → dgel | Comptes gels puis dgels |
| 11 | pKYC | Attendre cron 01:00 UTC | Drift scores calculs |
| 12 | Rtention audit | Vrifier audit_logs | Traabilit complte |

---

## 11. Contacts & Escalade

### Niveaux d'escalade

| Niveau | Qui | Quand |
|---|---|---|
| **L1** — Oprationnel | quipe DevOps client | Service down, logs erreur |
| **L2** — Application | quipe KYC-Lab (CyberStrat) | Bug applicatif, config |
| **L3** — Scurit | RSSI client + CyberStrat | Incident scurit, compromission |

### SLA Support

| Svrit | Temps de rponse | Temps de rsolution |
|---|---|---|
| CRITICAL (prod down) | 1h | 4h |
| HIGH (fonctionnalit bloque) | 4h | 24h |
| MEDIUM (dgradation) | 8h | 72h |
| LOW (demande amlioration) | 48h | Sprint suivant |

---

## Annexe A — Rfrences Rglementaires

| Rfrentiel | Articles | Couverture |
|---|---|---|
| AMLD6 (2018/1673) | Art. 10, 14-16, 18-19, 26, 33, 40, 43, 45 | CDD, PEP, screening, SAR, audit |
| FATF 40 | R.1, R.10, R.12-16, R.20-21, R.24, R.29, R.33, R.38 | ABR, CDD, PEP, SAR, UBO |
| BAM Circulaire 5/W/2023 | Intgralit | Seuils MAD, ANRF, GoAML |
| RGPD | Art. 5, 15, 17, 20, 22 | PII encrypt, droit oubli, portabilit |

## Annexe B — Arborescence Docker Compose Production

```
docker/
├── docker-compose.prod.yml      ← Orchestration 11 services
├── .env.production              ← Secrets (JAMAIS commit)
├── nginx.conf                   ← Config Nginx active
├── nginx.conf.template          ← Template paramtrable
├── prometheus.yml               ← Config scraping Prometheus
├── alerts.yml                   ← 14 rgles d'alerte
├── loki.yml                     ← Config agrgation logs
├── backup.sh                    ← Script pg_dump quotidien
├── restore.sh                   ← Script de restauration
├── grafana/
│   └── provisioning/            ← Dashboards pr-configurs
└── postgres/
    └── init.sql                 ← Extensions (uuid, trigram, gin)
```

## Annexe C — Variables d'Environnement Compltes

Rfrence exhaustive des 90+ variables : voir fichier `.env.example`  la racine du projet.

---

*Document gnr le 12 juin 2026 — KYC-Lab FT Platform v2.0*
*CyberStrat — Conformit & Technologie*
