# Manuel d'Intégration Technique — KYC-AML Platform v2.0

> **Document destiné aux équipes techniques des banques et fintechs clientes**
> Classification : CONFIDENTIEL — Usage Restreint Partenaires
> Version : 2.0.0 — Mise à jour : 2026-03-29

---

## Table des matières

1. [Vue d'ensemble de l'intégration](#1-vue-densemble-de-lintégration)
2. [Authentification](#2-authentification)
3. [Intégration CBS — Mode Webhook (recommandé)](#3-intégration-cbs--mode-webhook-recommandé)
4. [Onboarding Client KYC via API](#4-onboarding-client-kyc-via-api)
5. [Scoring de Risque Temps Réel](#5-scoring-de-risque-temps-réel)
6. [Consultation des Alertes](#6-consultation-des-alertes)
7. [Export de Données (Data Lake)](#7-export-de-données-data-lake)
8. [Environnements](#8-environnements)
9. [Codes d'Erreur](#9-codes-derreur)
10. [SDK et Exemples de Code](#10-sdk-et-exemples-de-code)

---

## 1. Vue d'ensemble de l'intégration

### 1.1 Architecture d'intégration

La plateforme KYC-AML s'intègre avec votre CBS (Core Banking System) et vos systèmes front-office selon le schéma suivant :

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VOTRE SYSTÈME                                 │
│                                                                     │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│   │     CBS      │    │   Front KYC  │    │   Data Lake / BI     │  │
│   │ (transactions│    │ (onboarding) │    │  (export/reporting)  │  │
│   │  en temps    │    │              │    │                      │  │
│   │   réel)      │    │              │    │                      │  │
│   └──────┬───────┘    └──────┬───────┘    └──────────┬───────────┘  │
│          │                  │                        │              │
└──────────┼──────────────────┼────────────────────────┼──────────────┘
           │                  │                        │
           │ Webhook HMAC     │ API REST/tRPC          │ API (pagination)
           │ POST /webhooks/  │ Bearer JWT             │ Bearer JWT
           │ transaction      │                        │
           ▼                  ▼                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       KYC-AML PLATFORM                               │
│                                                                      │
│   Express + tRPC     │   Moteur AML     │   Scheduler pKYC/Screening │
│   PostgreSQL         │   ML Service     │   Redis (cache/sessions)   │
│   Stockage docs      │   Règles dyn.    │   Prometheus/Métriques     │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 Trois modes d'intégration

| Mode | Cas d'usage | Protocole | Authentification |
|------|-------------|-----------|-----------------|
| **Webhook push** (recommandé) | CBS envoie les transactions en temps réel | HTTP POST | HMAC-SHA256 |
| **API pull** | Systèmes front-office, onboarding, consultation | tRPC over HTTP | Bearer JWT |
| **Batch file** | Export données, data lake, reporting périodique | API paginée (JSON/CSV) | Bearer JWT |

### 1.3 Flux de données typique

**Scénario : Transaction client → Alerte → Décision**

```
1. Client effectue un virement de 15 000 EUR via votre CBS
         │
         ▼
2. CBS déclenche le webhook → POST /webhooks/transaction
   (payload JSON signé HMAC)
         │
         ▼
3. Plateforme exécute le moteur AML (< 200 ms)
   - 12 règles évaluées
   - Score AML calculé : 78/100
   - Règle déclenchée : "Seuil transaction > 10 000 EUR"
         │
         ▼
4. Alerte créée automatiquement (priority: HIGH)
   → Notification analyste en attente
         │
         ▼
5. Analyste consulte l'alerte via l'interface (API)
   → Assigne, analyse, résout ou escalade
         │
         ▼
6. Si escalade → Dossier (Case) créé
   → Décision compliance officer : SAR déposée
```

---

## 2. Authentification

### 2.1 Obtenir un token JWT

Toutes les requêtes API (hors webhook et health check) nécessitent un token Bearer JWT.

**Endpoint :** `POST /trpc/auth.login`

```bash
curl -X POST https://api.votre-domaine.fr/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "integration@votre-banque.fr",
    "password": "VotreMotDePasse!Sécurisé"
  }'
```

**Réponse :**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "user": {
    "id": 7,
    "email": "integration@votre-banque.fr",
    "name": "Compte Intégration API",
    "role": "analyst"
  }
}
```

**Utiliser le token dans les requêtes suivantes :**
```bash
curl -H "Authorization: Bearer eyJhbGciOi..." \
  https://api.votre-domaine.fr/trpc/customers.list
```

### 2.2 Connexion avec MFA TOTP activé

Si le compte a le MFA activé, le code TOTP à 6 chiffres est **obligatoire** :

```bash
curl -X POST https://api.votre-domaine.fr/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "compliance@votre-banque.fr",
    "password": "VotreMotDePasse!",
    "totpCode": "847392"
  }'
```

### 2.3 Rotation des refresh tokens

L'`accessToken` a une durée de vie de **15 minutes**. Avant expiration, utilisez le `refreshToken` pour obtenir une nouvelle paire :

```bash
curl -X POST https://api.votre-domaine.fr/trpc/auth.refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJhbGciOi..."}'
```

Le `refreshToken` utilisé est immédiatement **invalidé** (rotation sécurisée). La durée de vie du refresh token est de **7 jours**.

### 2.4 Durées de vie des tokens

| Type | Durée de vie | Variable d'env |
|------|-------------|----------------|
| Access Token | 15 minutes | — (fixe) |
| Refresh Token | 7 jours | — (fixe) |

### 2.5 Gestion des erreurs 401

Lorsque vous recevez un `401 Unauthorized` :

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Token invalide ou expiré"
  }
}
```

**Procédure de récupération automatique :**

```
1. Intercepter le 401
2. Tenter un refresh → POST /trpc/auth.refresh
3. Si le refresh réussit → retenter la requête originale avec le nouveau token
4. Si le refresh échoue (401) → déconnecter l'utilisateur → POST /trpc/auth.login
```

---

## 3. Intégration CBS — Mode Webhook (recommandé)

### 3.1 Configuration côté CBS

Configurez votre CBS pour envoyer les transactions à l'endpoint webhook :

| Paramètre | Valeur |
|-----------|--------|
| **URL** | `https://api.votre-domaine.fr/webhooks/transaction` |
| **Méthode** | `POST` |
| **Content-Type** | `application/json` |
| **Header signature** | `x-webhook-signature: sha256=<hmac>` |

Le `WEBHOOK_SECRET` vous est fourni lors de l'onboarding. Conservez-le en lieu sûr — il permet à la plateforme d'authentifier l'origine des requêtes CBS.

### 3.2 Format du payload JSON

```json
{
  "transactionId": "CBS-2024-TX-089451",
  "customerId": 42,
  "amount": "15000.00",
  "currency": "EUR",
  "transactionType": "TRANSFER",
  "channel": "ONLINE",
  "counterparty": "ACME Corp GmbH",
  "counterpartyCountry": "DE",
  "counterpartyBank": "Deutsche Bank AG",
  "purpose": "Règlement facture F-2024-0089",
  "transactionDate": "2024-11-15T14:32:00Z"
}
```

**Champs obligatoires :** `transactionId`, `customerId`, `amount`, `currency`, `transactionType`

**Champs optionnels mais fortement recommandés :** `counterparty`, `counterpartyCountry`, `counterpartyBank`, `purpose`

| Champ | Type | Description |
|-------|------|-------------|
| `transactionId` | string (max 50) | Identifiant CBS unique — clé d'idempotence |
| `customerId` | integer | ID interne du client sur la KYC Platform |
| `amount` | string (décimal) | Montant avec 2 décimales obligatoires |
| `currency` | string (ISO 4217) | Code devise, ex: `EUR`, `USD`, `MAD` |
| `transactionType` | enum | `TRANSFER`, `DEPOSIT`, `WITHDRAWAL`, `PAYMENT`, `EXCHANGE` |
| `channel` | enum | `ONLINE`, `MOBILE`, `BRANCH`, `ATM`, `API` |
| `counterparty` | string (max 200) | Nom de la contrepartie |
| `counterpartyCountry` | string (ISO 3166-1) | Code pays contrepartie |
| `counterpartyBank` | string (max 200) | Nom de la banque contrepartie |
| `purpose` | string | Motif déclaré de l'opération |
| `transactionDate` | string (ISO 8601) | Date/heure UTC de l'opération |

### 3.3 Signature HMAC-SHA256

Chaque requête webhook doit inclure une signature HMAC calculée sur le **body brut** (bytes avant décodage JSON).

**Algorithme :**
```
signature = HMAC-SHA256(clé = WEBHOOK_SECRET, message = body_brut_bytes)
header = "sha256=" + hex(signature)
```

**Important :** La plateforme utilise `express.raw()` sur ce endpoint pour capturer le body brut. Toute transformation (re-sérialisation JSON, ajout d'espaces) invalide la signature.

#### Exemple Python

```python
import hmac
import hashlib
import json
import requests

WEBHOOK_SECRET = "votre_webhook_secret_ici"
API_URL = "https://api.votre-domaine.fr/webhooks/transaction"

def send_transaction_webhook(payload: dict) -> dict:
    # Sérialiser le payload de façon déterministe
    body = json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode('utf-8')

    # Calculer la signature HMAC-SHA256
    signature = hmac.new(
        WEBHOOK_SECRET.encode('utf-8'),
        body,
        hashlib.sha256
    ).hexdigest()

    headers = {
        "Content-Type": "application/json",
        "x-webhook-signature": f"sha256={signature}"
    }

    response = requests.post(API_URL, data=body, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()

# Utilisation
result = send_transaction_webhook({
    "transactionId": "CBS-2024-TX-089451",
    "customerId": 42,
    "amount": "15000.00",
    "currency": "EUR",
    "transactionType": "TRANSFER",
    "channel": "ONLINE",
    "counterparty": "ACME Corp GmbH",
    "counterpartyCountry": "DE",
    "counterpartyBank": "Deutsche Bank AG",
    "purpose": "Règlement facture F-2024-0089",
    "transactionDate": "2024-11-15T14:32:00Z"
})

print(f"Score AML : {result['amlResult']['score']}")
print(f"Alerte créée : {result['amlResult']['alertCreated']}")
```

#### Exemple Node.js / TypeScript

```typescript
import crypto from 'crypto';
import axios from 'axios';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;
const API_URL = 'https://api.votre-domaine.fr/webhooks/transaction';

interface TransactionPayload {
  transactionId: string;
  customerId: number;
  amount: string;
  currency: string;
  transactionType: 'TRANSFER' | 'DEPOSIT' | 'WITHDRAWAL' | 'PAYMENT' | 'EXCHANGE';
  channel?: 'ONLINE' | 'MOBILE' | 'BRANCH' | 'ATM' | 'API';
  counterparty?: string;
  counterpartyCountry?: string;
  counterpartyBank?: string;
  purpose?: string;
  transactionDate?: string;
}

async function sendTransactionWebhook(payload: TransactionPayload) {
  // Sérialiser le payload (ordre des clés déterministe)
  const body = JSON.stringify(payload);

  // Calculer la signature HMAC-SHA256
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('hex');

  const response = await axios.post(API_URL, body, {
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-signature': `sha256=${signature}`,
    },
    timeout: 10_000,
  });

  return response.data;
}

// Utilisation
const result = await sendTransactionWebhook({
  transactionId: 'CBS-2024-TX-089451',
  customerId: 42,
  amount: '15000.00',
  currency: 'EUR',
  transactionType: 'TRANSFER',
  channel: 'ONLINE',
  counterparty: 'ACME Corp GmbH',
  counterpartyCountry: 'DE',
  counterpartyBank: 'Deutsche Bank AG',
  purpose: 'Règlement facture F-2024-0089',
  transactionDate: new Date().toISOString(),
});

console.log('Score AML :', result.amlResult.score);
console.log('Alerte créée :', result.amlResult.alertCreated);
```

#### Exemple cURL complet

```bash
#!/bin/bash
WEBHOOK_SECRET="votre_webhook_secret_ici"
API_URL="https://api.votre-domaine.fr/webhooks/transaction"

PAYLOAD='{"transactionId":"CBS-2024-TX-089451","customerId":42,"amount":"15000.00","currency":"EUR","transactionType":"TRANSFER","channel":"ONLINE","counterparty":"ACME Corp GmbH","counterpartyCountry":"DE","counterpartyBank":"Deutsche Bank AG","purpose":"Règlement facture","transactionDate":"2024-11-15T14:32:00Z"}'

# Calcul de la signature HMAC-SHA256
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')

curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

### 3.4 Idempotence et gestion des retries

Le champ `transactionId` est la **clé d'idempotence**. Si votre CBS envoie plusieurs fois la même transaction (réseau instable, retry automatique), la plateforme retourne la transaction existante **sans la retraiter**.

**Stratégie de retry recommandée côté CBS :**

```
Tentative 1 → Timeout ou 5xx → attendre 1 s
Tentative 2 → Timeout ou 5xx → attendre 5 s
Tentative 3 → Timeout ou 5xx → attendre 30 s
Tentative 4+ → Alerte manuelle / file morte
```

**Codes de réponse à gérer :**
- `200` ou `201` → Succès (ne pas retenter)
- `400` → Payload invalide (ne pas retenter — corriger le payload)
- `401` → Signature invalide (vérifier WEBHOOK_SECRET)
- `409` → Transaction déjà traitée (idempotence — ne pas retenter)
- `5xx` → Erreur serveur transitoire → retenter avec backoff exponentiel

### 3.5 Réponse du webhook

```json
{
  "id": 8941,
  "transactionId": "CBS-2024-TX-089451",
  "customerId": 42,
  "amount": "15000.00",
  "currency": "EUR",
  "transactionType": "TRANSFER",
  "status": "FLAGGED",
  "riskScore": 78,
  "isSuspicious": true,
  "flagReason": "Score AML 78 — Règle RULE-THRESH-10K déclenchée",
  "riskRules": [
    {
      "ruleId": "RULE-THRESH-10K",
      "ruleName": "Seuil transaction unique > 10 000 EUR",
      "category": "THRESHOLD",
      "triggered": true,
      "score": 70,
      "details": {
        "amount": 15000,
        "threshold": 10000,
        "delta": 5000
      }
    }
  ],
  "amlResult": {
    "score": 78,
    "triggered": true,
    "alertCreated": true,
    "alertId": "ALT-2024-05521"
  },
  "transactionDate": "2024-11-15T14:32:00Z",
  "createdAt": "2024-11-15T14:32:05Z"
}
```

---

## 4. Onboarding Client KYC via API

### 4.1 Étape 1 — Créer le client

```bash
curl -X POST https://api.votre-domaine.fr/trpc/customers.create \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Marie",
    "lastName": "Dupont",
    "email": "marie.dupont@email.fr",
    "phone": "+33612345678",
    "dateOfBirth": "1985-03-15",
    "nationality": "FR",
    "residenceCountry": "FR",
    "address": "12 Rue de la Paix, 75001 Paris",
    "city": "Paris",
    "profession": "Ingénieur",
    "employer": "Tech Corp SA",
    "sourceOfFunds": "Salaire",
    "monthlyIncome": "3500.00",
    "customerType": "INDIVIDUAL"
  }'
```

**Réponse :**
```json
{
  "id": 42,
  "customerId": "CUST-FR-00042",
  "firstName": "Marie",
  "lastName": "Dupont",
  "kycStatus": "PENDING",
  "riskLevel": "LOW",
  "riskScore": 0,
  "sanctionStatus": "PENDING",
  "createdAt": "2024-11-15T14:30:00Z"
}
```

Notez l'`id` retourné (`42`) — c'est l'identifiant interne à utiliser dans toutes les requêtes suivantes.

### 4.2 Étape 2 — Uploader les documents d'identité

L'upload de document utilise un endpoint REST multipart (pas tRPC) :

```bash
curl -X POST https://api.votre-domaine.fr/api/documents/upload \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@/chemin/vers/passeport.pdf" \
  -F "customerId=42" \
  -F "documentType=PASSPORT"
```

**Réponse :**
```json
{
  "success": true,
  "document": {
    "id": 789,
    "customerId": 42,
    "documentType": "PASSPORT",
    "status": "PENDING",
    "ekycStatus": "PROCESSING",
    "ekycScore": null,
    "ocrConfidence": null,
    "createdAt": "2024-11-15T14:32:50Z"
  }
}
```

Le traitement OCR et eKYC est **synchrone** — la réponse finale inclut les résultats :

```json
{
  "success": true,
  "document": {
    "id": 789,
    "status": "VERIFIED",
    "ekycStatus": "PASS",
    "ekycScore": 87,
    "ekycChecks": {
      "documentAuthenticity": true,
      "faceMatch": true,
      "mrzValidity": true,
      "expiryValid": true,
      "ocrCoherence": true
    },
    "ocrData": {
      "lastName": "DUPONT",
      "firstName": "MARIE",
      "dateOfBirth": "15 03 1985",
      "documentNumber": "24AB12345",
      "expiryDate": "15 03 2030",
      "nationality": "FRA"
    },
    "ocrConfidence": 94
  }
}
```

**Types de documents acceptés :** `PASSPORT`, `ID_CARD`, `DRIVING_LICENSE`, `PROOF_OF_ADDRESS`, `SELFIE`, `BANK_STATEMENT`
**Formats acceptés :** PDF, JPEG, PNG — **taille maximale : 10 MB**

### 4.3 Étape 3 — Mettre à jour le statut KYC

Après validation des documents par un analyste :

```bash
curl -X PATCH https://api.votre-domaine.fr/trpc/customers.updateKycStatus \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 42,
    "status": "APPROVED",
    "notes": "Documents vérifiés — eKYC PASS, score 87/100"
  }'
```

### 4.4 Workflow KYC complet

```
PENDING
  │
  │  [upload documents + vérification eKYC]
  ▼
IN_REVIEW
  │
  ├─── [eKYC PASS + analyste OK] ──► APPROVED
  │
  └─── [eKYC FAIL ou documents invalides] ──► REJECTED
                                                │
                                                │ [re-soumission]
                                                ▼
                                              PENDING

APPROVED ──── [expiration] ──► EXPIRED ──── [nouvelle revue] ──► IN_REVIEW
```

### 4.5 Webhook de retour de statut KYC

Si vous souhaitez être notifié des changements de statut KYC sur votre propre endpoint, configurez un webhook sortant dans le panneau d'administration. La plateforme enverra une requête POST signée HMAC à votre URL à chaque changement de statut :

```json
{
  "event": "kyc.status_changed",
  "customerId": 42,
  "previousStatus": "IN_REVIEW",
  "newStatus": "APPROVED",
  "changedAt": "2024-11-16T09:05:00Z",
  "changedBy": 7
}
```

---

## 5. Scoring de Risque Temps Réel

### 5.1 Soumettre une transaction via API

Si votre architecture n'utilise pas le webhook CBS (mode pull), vous pouvez soumettre les transactions directement via l'API tRPC :

```bash
curl -X POST https://api.votre-domaine.fr/trpc/transactions.create \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "CBS-TX-2024-089451",
    "customerId": 42,
    "amount": "15000.00",
    "currency": "EUR",
    "transactionType": "TRANSFER",
    "channel": "ONLINE",
    "counterparty": "ACME Corp GmbH",
    "counterpartyCountry": "DE",
    "counterpartyBank": "Deutsche Bank AG",
    "purpose": "Règlement facture F-2024-0089",
    "transactionDate": "2024-11-15T14:32:00Z"
  }'
```

### 5.2 Interpréter la réponse AML

```json
{
  "id": 8941,
  "transactionId": "CBS-TX-2024-089451",
  "status": "FLAGGED",
  "riskScore": 78,
  "isSuspicious": true,
  "flagReason": "Score AML 78 — 2 règles déclenchées",
  "riskRules": [
    {
      "ruleId": "RULE-THRESH-10K",
      "ruleName": "Seuil transaction unique > 10 000 EUR",
      "category": "THRESHOLD",
      "triggered": true,
      "score": 70,
      "details": {
        "amount": 15000,
        "threshold": 10000
      }
    },
    {
      "ruleId": "RULE-GEO-RISK",
      "ruleName": "Contrepartie en pays GAFI liste grise",
      "category": "GEOGRAPHY",
      "triggered": false,
      "score": 0,
      "details": {
        "country": "DE",
        "onWatchList": false
      }
    }
  ],
  "amlResult": {
    "score": 78,
    "triggered": true,
    "alertCreated": true,
    "alertId": "ALT-2024-05521"
  }
}
```

### 5.3 Interprétation du score AML

| Plage de score | Signification | Action recommandée |
|---------------|---------------|--------------------|
| 0–29 | Risque faible | Transaction validée automatiquement |
| 30–59 | Risque modéré | Enregistrement sans alerte |
| 60–79 | Risque élevé | Alerte créée (priorité MEDIUM ou HIGH) |
| 80–100 | Risque critique | Alerte CRITICAL + transaction FLAGGED |

### 5.4 Actions en fonction du statut retourné

| `status` | Description | Action CBS recommandée |
|----------|-------------|----------------------|
| `COMPLETED` | Score < seuil, aucune règle critique | Laisser passer |
| `PENDING` | En cours de traitement (rare) | Attendre notification |
| `FLAGGED` | Score élevé, alerte créée | Suspendre le paiement en attente |
| `BLOCKED` | Bloqué manuellement par un analyste | Bloquer définitivement |

### 5.5 Latence attendue

| Configuration | Latence P50 | Latence P99 |
|--------------|-------------|-------------|
| Moteur de règles seul | < 50 ms | < 200 ms |
| Règles + ML scoring | < 200 ms | < 500 ms |
| Règles + ML + screening temps réel | < 500 ms | < 1000 ms |

---

## 6. Consultation des Alertes

### 6.1 Lister les alertes ouvertes

```bash
curl "https://api.votre-domaine.fr/trpc/alerts.list?status=OPEN&priority=HIGH&limit=20&page=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Réponse :**
```json
{
  "data": [
    {
      "id": 5521,
      "alertId": "ALT-2024-05521",
      "customerId": 42,
      "transactionId": 8941,
      "scenario": "Transaction supérieure au seuil STR",
      "alertType": "THRESHOLD",
      "priority": "HIGH",
      "status": "OPEN",
      "riskScore": 78,
      "reason": "Montant 15 000 EUR dépasse seuil 10 000 EUR",
      "enrichmentData": {
        "velocityLast24h": 1,
        "customerAvgAmount": 2800,
        "amountRatio": 5.36,
        "counterpartyFirstSeen": true
      },
      "createdAt": "2024-11-15T14:32:10Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### 6.2 Filtres disponibles

| Paramètre | Valeurs | Description |
|-----------|---------|-------------|
| `status` | `OPEN`, `IN_REVIEW`, `ESCALATED`, `CLOSED`, `FALSE_POSITIVE` | Filtre par statut |
| `priority` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | Filtre par priorité |
| `alertType` | `THRESHOLD`, `PATTERN`, `VELOCITY`, `SANCTIONS`, `PEP`, `FRAUD`, `NETWORK` | Filtre par type |
| `assignedTo` | integer (userId) | Alertes assignées à un analyste |
| `dateFrom` | ISO 8601 | Date de début |
| `dateTo` | ISO 8601 | Date de fin |
| `page` | integer ≥ 1 | Page (défaut : 1) |
| `limit` | integer 1–1000 | Résultats par page (défaut : 20) |

### 6.3 Traitement d'une alerte (assign → review → resolve)

**Étape 1 — Assigner l'alerte à un analyste :**

```bash
curl -X POST https://api.votre-domaine.fr/trpc/alerts.assign \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": 5521, "userId": 7}'
```

**Étape 2 — Résoudre l'alerte :**

```bash
curl -X POST https://api.votre-domaine.fr/trpc/alerts.resolve \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 5521,
    "resolution": "FALSE_POSITIVE",
    "notes": "Virement récurrent justifié — client a fourni le contrat"
  }'
```

### 6.4 Stratégie de polling

Si vous intégrez la gestion des alertes dans votre système interne, utilisez le polling sur les alertes OPEN :

```
Toutes les 5 minutes → GET /trpc/alerts.list?status=OPEN&dateFrom=<last_check>
```

**Optimisation :** Utilisez le paramètre `dateFrom` avec la date de votre dernier poll pour ne récupérer que les nouvelles alertes.

---

## 7. Export de Données (Data Lake)

### 7.1 Format d'export

Tous les endpoints de liste retournent du JSON paginé. Pour un export data lake, utilisez la pagination avec `limit=1000` (maximum).

### 7.2 Pagination

```bash
# Page 1
curl "https://api.votre-domaine.fr/trpc/transactions.list?page=1&limit=1000&dateFrom=2024-01-01T00:00:00Z" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Page 2
curl "https://api.votre-domaine.fr/trpc/transactions.list?page=2&limit=1000&dateFrom=2024-01-01T00:00:00Z" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Objet de pagination dans chaque réponse :**
```json
{
  "pagination": {
    "page": 1,
    "limit": 1000,
    "total": 45230,
    "totalPages": 46,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Algorithme d'export complet :**
```python
def export_all(endpoint, params, access_token):
    results = []
    page = 1
    while True:
        params['page'] = page
        params['limit'] = 1000
        response = api_get(endpoint, params, access_token)
        results.extend(response['data'])
        if not response['pagination']['hasNext']:
            break
        page += 1
    return results
```

### 7.3 Filtres disponibles par endpoint

**Transactions :**
```
?page=&limit=&customerId=&status=&transactionType=&dateFrom=&dateTo=&search=&isSuspicious=
```

**Clients :**
```
?page=&limit=&search=&riskLevel=&kycStatus=&customerType=&sanctionStatus=
```

**Alertes :**
```
?page=&limit=&status=&priority=&alertType=&assignedTo=&dateFrom=&dateTo=
```

**Screening :**
```
?page=&limit=&customerId=&status=&screeningType=
```

### 7.4 Rate limiting

La plateforme applique un rate limit de **100 requêtes par minute** par token JWT. Les headers de contrôle sont retournés dans chaque réponse :

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Limite totale (100) |
| `X-RateLimit-Remaining` | Requêtes restantes |
| `X-RateLimit-Reset` | Timestamp Unix de réinitialisation |

En cas de dépassement, la réponse est `429 Too Many Requests`. Implémentez un backoff de 60 secondes avant de réessayer.

**Recommandation pour les exports massifs :** Planifiez les exports en dehors des heures de pointe (nuit) et espacez les requêtes de 700 ms minimum.

---

## 8. Environnements

### 8.1 URLs des environnements

| Environnement | URL de base | Usage |
|--------------|-------------|-------|
| **Production** | `https://api.{votre-domaine}/` | Données réelles — accès restreint |
| **Staging** | `https://staging-api.{votre-domaine}/` | Tests d'intégration et UAT |
| **Développement local** | `http://localhost:3000/` | Développement interne |

### 8.2 Variables d'environnement requises côté client

Configurez ces variables dans votre système d'intégration :

```bash
# Authentification
KYC_API_URL=https://api.votre-domaine.fr
KYC_API_EMAIL=integration@votre-banque.fr
KYC_API_PASSWORD=VotreMotDePasse!Sécurisé

# Webhook CBS
KYC_WEBHOOK_SECRET=votre_webhook_secret_fourni_a_lonboarding

# Optionnel — timeout HTTP
KYC_API_TIMEOUT_MS=10000
```

### 8.3 Comptes de service recommandés

Créez un compte de service dédié à l'intégration avec le **rôle minimum nécessaire** :

| Cas d'usage | Rôle recommandé |
|-------------|-----------------|
| CBS webhook uniquement | Authentification HMAC (pas de JWT) |
| Consultation alertes | `analyst` |
| Export data lake | `analyst` |
| Onboarding clients | `analyst` |
| Décisions SAR/STR | `compliance_officer` |
| Administration | `admin` (accès très restreint) |

---

## 9. Codes d'Erreur

### 9.1 Format standard d'erreur JSON

Toutes les erreurs retournent le format suivant :

```json
{
  "error": {
    "code": "CODE_METIER",
    "message": "Description lisible de l'erreur",
    "details": {
      "field": "amount",
      "reason": "Doit être un nombre positif avec maximum 2 décimales"
    }
  }
}
```

### 9.2 Table complète des codes d'erreur

| HTTP | Code métier | Message type | Action corrective |
|------|-------------|-------------|-------------------|
| `400` | `BAD_REQUEST` | Paramètre manquant ou invalide | Vérifier le payload selon la spec OpenAPI |
| `400` | `VALIDATION_ERROR` | Champ `amount` : format invalide | Corriger le champ indiqué dans `details` |
| `401` | `UNAUTHORIZED` | Token manquant ou expiré | Renouveler le token via `auth.refresh` |
| `401` | `INVALID_HMAC` | Signature webhook invalide | Vérifier le WEBHOOK_SECRET et la sérialisation |
| `401` | `MFA_REQUIRED` | Code TOTP requis | Inclure `totpCode` dans le login |
| `401` | `INVALID_TOTP` | Code TOTP invalide ou expiré | Vérifier l'horloge système (NTP) |
| `403` | `FORBIDDEN` | Droits insuffisants | Utiliser un compte avec le rôle adéquat |
| `403` | `CUSTOMER_FROZEN` | Client gelé — opération interdite | Contacter le compliance officer |
| `404` | `NOT_FOUND` | Ressource introuvable | Vérifier l'ID dans l'URL/paramètre |
| `409` | `CONFLICT` | Transaction déjà existante | Idempotence — ignorer, utiliser la réponse existante |
| `409` | `DUPLICATE_CUSTOMER` | Client avec cet ID déjà existant | Utiliser `customers.update` à la place |
| `422` | `UNPROCESSABLE` | Transition de statut invalide | Consulter les transitions autorisées dans la spec |
| `429` | `TOO_MANY_REQUESTS` | Rate limit dépassé | Attendre `X-RateLimit-Reset` secondes |
| `500` | `INTERNAL_ERROR` | Erreur serveur interne | Contacter le support P1 avec le `traceId` |
| `503` | `SERVICE_UNAVAILABLE` | Service temporairement indisponible | Retenter avec backoff exponentiel |

### 9.3 Erreurs spécifiques au webhook

| HTTP | Code | Cause |
|------|------|-------|
| `401` | `INVALID_HMAC` | `x-webhook-signature` absent ou incorrect |
| `401` | `MISSING_SIGNATURE` | Header `x-webhook-signature` absent |
| `400` | `INVALID_PAYLOAD` | JSON malformé |
| `400` | `MISSING_CUSTOMER` | `customerId` ne correspond à aucun client |
| `409` | `DUPLICATE_TX` | `transactionId` déjà traité (idempotence) |

### 9.4 Gestion des erreurs en production

```typescript
// Exemple de wrapper de gestion d'erreurs robuste
async function apiCall<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error.response?.status;
      const code = error.response?.data?.error?.code;

      // Erreurs non-retriables
      if ([400, 401, 403, 404, 409, 422].includes(status)) {
        throw error; // Ne pas retenter
      }

      // Rate limit — attendre la réinitialisation
      if (status === 429) {
        const resetAt = error.response.headers['x-ratelimit-reset'];
        const waitMs = (parseInt(resetAt) * 1000) - Date.now() + 1000;
        await sleep(Math.max(waitMs, 1000));
        continue;
      }

      // Erreurs serveur — backoff exponentiel
      if (status >= 500 || !status) {
        if (attempt === retries) throw error;
        await sleep(1000 * Math.pow(2, attempt)); // 2s, 4s, 8s
        continue;
      }
    }
  }
  throw new Error('Max retries reached');
}
```

---

## 10. SDK et Exemples de Code

### 10.1 Client TypeScript complet

```typescript
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

export class KycAmlClient {
  private http: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly email: string,
    private readonly password: string,
    private readonly webhookSecret: string
  ) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 10_000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Intercepteur pour ajouter automatiquement le Bearer token
    this.http.interceptors.request.use(async (config) => {
      if (!config.url?.includes('/trpc/auth')) {
        await this.ensureValidToken();
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  async login(totpCode?: string): Promise<void> {
    const response = await this.http.post('/trpc/auth.login', {
      email: this.email,
      password: this.password,
      ...(totpCode ? { totpCode } : {}),
    });
    this.accessToken = response.data.accessToken;
    this.refreshToken = response.data.refreshToken;
    this.tokenExpiresAt = new Date(Date.now() + response.data.expiresIn * 1000);
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.accessToken) {
      await this.login();
      return;
    }
    // Renouveler 60s avant expiration
    const expiresIn = this.tokenExpiresAt!.getTime() - Date.now();
    if (expiresIn < 60_000) {
      const response = await this.http.post('/trpc/auth.refresh', {
        refreshToken: this.refreshToken,
      });
      this.accessToken = response.data.accessToken;
      this.refreshToken = response.data.refreshToken;
      this.tokenExpiresAt = new Date(Date.now() + response.data.expiresIn * 1000);
    }
  }

  // ─── Clients ───────────────────────────────────────────────────────────────

  async createCustomer(data: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
    nationality?: string;
    residenceCountry?: string;
    customerType?: 'INDIVIDUAL' | 'CORPORATE' | 'PEP' | 'FOREIGN';
    sourceOfFunds?: string;
    monthlyIncome?: string;
  }) {
    const response = await this.http.post('/trpc/customers.create', data);
    return response.data;
  }

  async getCustomer(id: number) {
    const response = await this.http.get('/trpc/customers.get', { params: { id } });
    return response.data;
  }

  async listCustomers(params?: {
    page?: number;
    limit?: number;
    riskLevel?: string;
    kycStatus?: string;
    search?: string;
  }) {
    const response = await this.http.get('/trpc/customers.list', { params });
    return response.data;
  }

  async updateKycStatus(id: number, status: string, notes?: string) {
    const response = await this.http.patch('/trpc/customers.updateKycStatus', {
      id, status, notes,
    });
    return response.data;
  }

  // ─── Transactions ──────────────────────────────────────────────────────────

  async createTransaction(data: {
    transactionId: string;
    customerId: number;
    amount: string;
    currency: string;
    transactionType: string;
    channel?: string;
    counterparty?: string;
    counterpartyCountry?: string;
    purpose?: string;
    transactionDate?: string;
  }) {
    const response = await this.http.post('/trpc/transactions.create', data);
    return response.data;
  }

  async listTransactions(params?: {
    page?: number;
    limit?: number;
    customerId?: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const response = await this.http.get('/trpc/transactions.list', { params });
    return response.data;
  }

  // ─── Alertes ───────────────────────────────────────────────────────────────

  async listAlerts(params?: {
    status?: string;
    priority?: string;
    alertType?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await this.http.get('/trpc/alerts.list', { params });
    return response.data;
  }

  async resolveAlert(id: number, resolution: 'FALSE_POSITIVE' | 'CLOSED' | 'ESCALATED', notes?: string) {
    const response = await this.http.post('/trpc/alerts.resolve', { id, resolution, notes });
    return response.data;
  }

  // ─── Webhook ───────────────────────────────────────────────────────────────

  buildWebhookPayload(transaction: Record<string, unknown>): {
    body: string;
    signature: string;
    headers: Record<string, string>;
  } {
    const body = JSON.stringify(transaction);
    const signature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body, 'utf8')
      .digest('hex');

    return {
      body,
      signature: `sha256=${signature}`,
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': `sha256=${signature}`,
      },
    };
  }
}

// ─── Utilisation ──────────────────────────────────────────────────────────────

const client = new KycAmlClient(
  'https://api.votre-domaine.fr',
  'integration@votre-banque.fr',
  process.env.KYC_API_PASSWORD!,
  process.env.KYC_WEBHOOK_SECRET!
);

// Onboarding complet
async function onboardClient() {
  // 1. Créer le client
  const customer = await client.createCustomer({
    firstName: 'Marie',
    lastName: 'Dupont',
    email: 'marie.dupont@email.fr',
    dateOfBirth: '1985-03-15',
    nationality: 'FR',
    residenceCountry: 'FR',
    sourceOfFunds: 'Salaire',
    monthlyIncome: '3500.00',
  });
  console.log('Client créé :', customer.customerId);

  // 2. Mettre à jour le statut après vérification
  await client.updateKycStatus(customer.id, 'APPROVED', 'Documents vérifiés');
  console.log('KYC approuvé');

  return customer;
}

// Export data lake des transactions
async function exportTransactions(dateFrom: string, dateTo: string) {
  const all: unknown[] = [];
  let page = 1;

  while (true) {
    const result = await client.listTransactions({
      page,
      limit: 1000,
      dateFrom,
      dateTo,
    });
    all.push(...result.data);
    if (!result.pagination.hasNext) break;
    page++;
    // Respecter le rate limit
    await new Promise(r => setTimeout(r, 700));
  }

  return all;
}
```

### 10.2 Client Python complet

```python
import hmac
import hashlib
import json
import time
import requests
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

class KycAmlClient:
    def __init__(
        self,
        base_url: str,
        email: str,
        password: str,
        webhook_secret: str = ""
    ):
        self.base_url = base_url.rstrip('/')
        self.email = email
        self.password = password
        self.webhook_secret = webhook_secret
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.token_expires_at: Optional[float] = None
        self.session = requests.Session()

    # ─── Auth ──────────────────────────────────────────────────────────────

    def login(self, totp_code: Optional[str] = None) -> None:
        payload = {"email": self.email, "password": self.password}
        if totp_code:
            payload["totpCode"] = totp_code

        response = self.session.post(
            f"{self.base_url}/trpc/auth.login",
            json=payload,
            timeout=10
        )
        response.raise_for_status()
        data = response.json()

        self.access_token = data["accessToken"]
        self.refresh_token = data["refreshToken"]
        self.token_expires_at = time.time() + data["expiresIn"]

    def _ensure_valid_token(self) -> None:
        if not self.access_token:
            self.login()
            return
        # Renouveler 60s avant expiration
        if self.token_expires_at and time.time() > self.token_expires_at - 60:
            response = self.session.post(
                f"{self.base_url}/trpc/auth.refresh",
                json={"refreshToken": self.refresh_token},
                timeout=10
            )
            if response.status_code == 401:
                self.login()
                return
            response.raise_for_status()
            data = response.json()
            self.access_token = data["accessToken"]
            self.refresh_token = data["refreshToken"]
            self.token_expires_at = time.time() + data["expiresIn"]

    def _headers(self) -> Dict[str, str]:
        self._ensure_valid_token()
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

    # ─── Clients ───────────────────────────────────────────────────────────

    def create_customer(self, **kwargs) -> Dict:
        response = self.session.post(
            f"{self.base_url}/trpc/customers.create",
            json=kwargs,
            headers=self._headers(),
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    def list_customers(self, page=1, limit=20, **filters) -> Dict:
        params = {"page": page, "limit": limit, **filters}
        response = self.session.get(
            f"{self.base_url}/trpc/customers.list",
            params=params,
            headers=self._headers(),
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    def update_kyc_status(self, customer_id: int, status: str, notes: str = "") -> Dict:
        response = self.session.patch(
            f"{self.base_url}/trpc/customers.updateKycStatus",
            json={"id": customer_id, "status": status, "notes": notes},
            headers=self._headers(),
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    # ─── Transactions ──────────────────────────────────────────────────────

    def create_transaction(self, **kwargs) -> Dict:
        response = self.session.post(
            f"{self.base_url}/trpc/transactions.create",
            json=kwargs,
            headers=self._headers(),
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    def list_transactions(self, page=1, limit=20, **filters) -> Dict:
        params = {"page": page, "limit": limit, **filters}
        response = self.session.get(
            f"{self.base_url}/trpc/transactions.list",
            params=params,
            headers=self._headers(),
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    # ─── Alertes ───────────────────────────────────────────────────────────

    def list_alerts(self, page=1, limit=20, **filters) -> Dict:
        params = {"page": page, "limit": limit, **filters}
        response = self.session.get(
            f"{self.base_url}/trpc/alerts.list",
            params=params,
            headers=self._headers(),
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    def resolve_alert(self, alert_id: int, resolution: str, notes: str = "") -> Dict:
        response = self.session.post(
            f"{self.base_url}/trpc/alerts.resolve",
            json={"id": alert_id, "resolution": resolution, "notes": notes},
            headers=self._headers(),
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    # ─── Screening ─────────────────────────────────────────────────────────

    def screen_customer(self, customer_id: int) -> Dict:
        response = self.session.post(
            f"{self.base_url}/trpc/screening.screenCustomer",
            json={"customerId": customer_id},
            headers=self._headers(),
            timeout=30
        )
        response.raise_for_status()
        return response.json()

    # ─── Webhook ───────────────────────────────────────────────────────────

    def send_webhook(self, payload: Dict) -> Dict:
        body = json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        signature = hmac.new(
            self.webhook_secret.encode('utf-8'),
            body,
            hashlib.sha256
        ).hexdigest()

        response = self.session.post(
            f"{self.base_url}/webhooks/transaction",
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-webhook-signature": f"sha256={signature}"
            },
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    # ─── Export paginé ─────────────────────────────────────────────────────

    def export_all(self, endpoint: str, **filters) -> List[Dict]:
        """Exporte toutes les données d'un endpoint en gérant la pagination."""
        results = []
        page = 1
        while True:
            response = self.session.get(
                f"{self.base_url}/{endpoint}",
                params={"page": page, "limit": 1000, **filters},
                headers=self._headers(),
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            results.extend(data.get("data", []))
            if not data.get("pagination", {}).get("hasNext", False):
                break
            page += 1
            time.sleep(0.7)  # Respecter le rate limit (100 req/min)
        return results


# ─── Utilisation ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os

    client = KycAmlClient(
        base_url="https://api.votre-domaine.fr",
        email="integration@votre-banque.fr",
        password=os.environ["KYC_API_PASSWORD"],
        webhook_secret=os.environ["KYC_WEBHOOK_SECRET"]
    )

    # Exemple 1 : Onboarding
    customer = client.create_customer(
        firstName="Jean",
        lastName="Martin",
        email="jean.martin@email.fr",
        dateOfBirth="1970-05-20",
        nationality="FR",
        residenceCountry="FR",
        sourceOfFunds="Revenus locatifs",
        customerType="INDIVIDUAL"
    )
    print(f"Client créé : {customer['customerId']}")

    # Exemple 2 : Envoyer une transaction via webhook
    result = client.send_webhook({
        "transactionId": "CBS-2024-TX-001",
        "customerId": customer["id"],
        "amount": "5000.00",
        "currency": "EUR",
        "transactionType": "TRANSFER",
        "channel": "ONLINE",
        "counterparty": "Fournisseur ABC",
        "counterpartyCountry": "FR",
        "transactionDate": datetime.now(timezone.utc).isoformat()
    })
    print(f"Score AML : {result['riskScore']}")
    print(f"Alerte créée : {result['amlResult']['alertCreated']}")

    # Exemple 3 : Export data lake des transactions du mois
    transactions = client.export_all(
        "trpc/transactions.list",
        dateFrom="2024-11-01T00:00:00Z",
        dateTo="2024-11-30T23:59:59Z"
    )
    print(f"Total transactions exportées : {len(transactions)}")
```

### 10.3 Hint Postman Collection

Pour générer une collection Postman à partir de la spécification OpenAPI :

1. Ouvrir Postman → **Import** → **OpenAPI 3.0**
2. Sélectionner le fichier `docs/api/OPENAPI_SPEC.yaml`
3. Postman génère automatiquement tous les endpoints avec les schémas

**Variables d'environnement Postman à configurer :**

```json
{
  "base_url": "https://api.votre-domaine.fr",
  "access_token": "",
  "refresh_token": "",
  "webhook_secret": "{{votre_webhook_secret}}"
}
```

**Pre-request Script pour le refresh automatique :**

```javascript
// À placer dans le Pre-request Script de la collection Postman
const tokenExpiresAt = pm.environment.get('token_expires_at');
const now = Date.now();

if (!tokenExpiresAt || now > parseInt(tokenExpiresAt) - 60000) {
  pm.sendRequest({
    url: pm.environment.get('base_url') + '/trpc/auth.refresh',
    method: 'POST',
    header: { 'Content-Type': 'application/json' },
    body: {
      mode: 'raw',
      raw: JSON.stringify({ refreshToken: pm.environment.get('refresh_token') })
    }
  }, (err, res) => {
    if (!err && res.code === 200) {
      const data = res.json();
      pm.environment.set('access_token', data.accessToken);
      pm.environment.set('refresh_token', data.refreshToken);
      pm.environment.set('token_expires_at', Date.now() + data.expiresIn * 1000);
    }
  });
}
```

---

## Annexe A — Checklist d'intégration

Avant de passer en production, vérifiez les points suivants :

- [ ] Compte de service créé avec le rôle minimal nécessaire
- [ ] MFA TOTP activé sur le compte de service
- [ ] `WEBHOOK_SECRET` stocké de façon sécurisée (vault, secret manager)
- [ ] Signature HMAC validée en environnement staging
- [ ] Gestion des erreurs implémentée (401, 429, 5xx)
- [ ] Stratégie de retry avec backoff exponentiel
- [ ] Idempotence vérifiée (tests de doublons `transactionId`)
- [ ] Rate limiting pris en compte (espacer les requêtes à > 700 ms en batch)
- [ ] Health check `/health` intégré dans votre monitoring
- [ ] Métriques Prometheus `/metrics` connectées à votre Grafana
- [ ] Logs d'audit activés côté client (conservation 5 ans)
- [ ] Tests de charge validés en staging avant go-live

## Annexe B — Support et escalade

| Niveau | Contact | Délai de réponse |
|--------|---------|-----------------|
| P1 — Incident production | incidents@kyc-aml.platform | < 1 heure 24/7 |
| P2 — Problème majeur | support@kyc-aml.platform | < 4 heures (jours ouvrés) |
| P3 — Question technique | docs@kyc-aml.platform | < 2 jours ouvrés |
| Documentation | https://docs.kyc-aml.platform | — |

Pour tout incident, inclure dans votre message :
- L'environnement concerné (production/staging)
- Le `traceId` présent dans les headers de réponse
- Le timestamp UTC de l'incident
- Le code d'erreur reçu
