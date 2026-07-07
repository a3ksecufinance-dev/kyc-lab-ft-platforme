# LabFT — Audit Global & Modèle d'Intégration CBS
**Version 5.0 — Juillet 2026**
**Destinataire : Équipe intégration client**

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture technique](#2-architecture-technique)
3. [Modèle d'intégration CBS complet](#3-modèle-dintégration-cbs-complet)
4. [Catalogue des Use Cases](#4-catalogue-des-use-cases)
5. [API Reference](#5-api-reference)
6. [Modèles de données](#6-modèles-de-données)
7. [Sécurité & Conformité](#7-sécurité--conformité)
8. [Limites connues & Prérequis client](#8-limites-connues--prérequis-client)
9. [Scénarios d'erreur & Résilience](#9-scénarios-derreur--résilience)
10. [Checklist Go-Live](#10-checklist-go-live)

---

## 1. Vue d'ensemble

### Positionnement fonctionnel

LabFT est le **module de conformité KYC/AML** qui s'intègre en aval du Core Banking System (Basikon).
Il ne remplace pas le CBS, il **décide** de la validation KYC d'un candidat client avant ouverture de compte.

```
┌──────────────────┐        ┌────────────────────────┐
│  BASIKON (CBS)   │        │   LABFT (Compliance)    │
│                  │        │                         │
│ • Comptes        │◄──────►│ • OCR CIN               │
│ • Transactions   │  REST  │ • Screening AML/PEP    │
│ • Interface      │  API   │ • Décision KYC          │
│   agent          │        │ • Cycle vie documents   │
└──────────────────┘        │ • Reporting BAM/ANRF    │
                            └────────────────────────┘
                                       │
                          ┌────────────┴─────────────┐
                          │                          │
                    ┌─────▼─────┐              ┌────▼────┐
                    │ PostgreSQL │              │  Redis  │
                    │  (données) │              │ (cache) │
                    └───────────┘              └─────────┘
```

### Périmètre fonctionnel LabFT

| Module | Rôle |
|--------|------|
| **Onboarding CBS** | Réception des candidats depuis Basikon, décision KYC |
| **OCR CIN marocaine** | Extraction champs recto/verso pour vérification |
| **Screening sanctions/PEP** | Match contre OFAC/EU/UN/UK + listes PEP |
| **Cycle de vie documents** | Alertes expiration, escalade progressive |
| **Dossiers investigation** | Cases pour suspicion d'activités illégales |
| **Reporting réglementaire** | SAR/STR + rapport AMLD6 annuel BAM |
| **Notifications sortantes** | Webhooks vers Basikon à chaque changement KYC |
| **Monitoring transactions** | Détection patterns AML sur flux CBS |
| **Dashboard Direction** | 8 KPIs conformité pour Comité Direction |

### Chiffres clés cible

| Métrique | Valeur cible | Comment mesuré |
|----------|--------------|-----------------|
| Latence décision onboarding | < 5s | POST /api/cbs/ocr + confirm |
| Screening MATCH threshold | ≥ 85% | Configurable via SCREENING_MATCH_THRESHOLD |
| Screening REVIEW threshold | ≥ 70% | Configurable via SCREENING_REVIEW_THRESHOLD |
| Sessions abandonnées | < 15% | GET /api/cbs/sessions-stats |
| Délai moyen STR (soumission) | ≤ 5 jours | KPI direction BAM |
| Couverture KYC | ≥ 95% | KPI direction BAM |
| Faux positifs alertes | < 30% | KPI efficacité |

---

## 2. Architecture technique

### Stack

| Couche | Technologie | Version |
|--------|-------------|---------|
| Backend | Node.js + Express + tRPC | 22.x |
| Frontend | React + Vite + Plus Jakarta Sans | 19.x |
| Database | PostgreSQL | 15 |
| Cache/Sessions | Redis | 7 |
| ORM | Drizzle | 0.44 |
| OCR | Tesseract.js | 7.0.0 |
| Pré-traitement image | Jimp (pure JS) | 1.6.1 |
| Face match | @vladmandic/face-api | 1.7.15 (client-side) |
| Reverse proxy | (à définir par client) | — |
| ML Scoring | Python + FastAPI (kyc_ml) | — |

### Composants déployés

```
┌─────────────────────────────────────────────────────────┐
│  serveur 10.10.1.185 (client)                            │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ systemd: kyc-platform.service (port 3000)         │   │
│  │  ├── LabFT API (Node.js)                          │   │
│  │  ├── OCR pipeline (Tesseract + Jimp)              │   │
│  │  ├── Schedulers (screening, doc-expiry, pKYC)     │   │
│  │  └── Notifications CBS (webhooks sortants)        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ systemd: kyc-ml.service (port 8000)               │   │
│  │  └── ML Scoring (FastAPI, sklearn)                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ PostgreSQL (port 5432) + Redis (port 6379)        │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Schedulers automatiques

| Scheduler | Heure UTC | Fonction |
|-----------|-----------|----------|
| Listes sanctions | 02:00 | Refresh OFAC/EU/UN/UK/PEP |
| pKYC drift | 01:00 | Score dérive comportementale par client |
| Doc expiry | 02:00 | Escalade documents J-30/J-7/J+0/J+15/J+30 |
| SLA monitoring | Horaire | Snapshot alertes ouvertes |
| ML retrain | Hebdo | Réentraînement modèle scoring |

---

## 3. Modèle d'intégration CBS complet

### Vue d'ensemble : les 3 flux d'intégration

```
┌────────────────────────────────────────────────────────────────┐
│  FLUX 1 — Entrée en relation (2 étapes)                         │
│  Basikon → LabFT : nouveau candidat client                      │
│                                                                  │
│    ①  POST /api/cbs/ocr          — extraction CIN               │
│    ②  POST /api/cbs/confirm      — validation agent + décision │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  FLUX 2 — Cycle de vie client                                    │
│  Basikon → LabFT : événements sur client existant              │
│                                                                  │
│    POST /api/cbs/document        — nouveau document (renewal)   │
│    POST /api/cbs/reactivation    — réactivation après blocage  │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  FLUX 3 — Notifications sortantes (Webhooks)                    │
│  LabFT → Basikon : changements statut KYC en temps réel        │
│                                                                  │
│    POST {CBS_WEBHOOK_URL}                                       │
│    Events: KYC_APPROVED, KYC_IN_REVIEW, KYC_REJECTED,          │
│            KYC_DOC_EXPIRING_SOON, KYC_DOC_EXPIRED,             │
│            KYC_GRACE_ENDING, KYC_BLOCK_REQUIRED                │
└────────────────────────────────────────────────────────────────┘
```

### Flux 1 détaillé — Entrée en relation officielle

```
┌──────────────────────────────────────────────────────────────┐
│  ÉTAPE 1 — POST /api/cbs/ocr                                  │
│                                                                │
│  Basikon envoie :                                              │
│  ┌────────────────────────────────────────────┐               │
│  │ {                                          │               │
│  │   "cin_recto":  "<base64>",                │               │
│  │   "cin_verso":  "<base64>",                │               │
│  │   "mimeType":   "image/jpeg",              │               │
│  │   "channel":    "CBS_API",                 │               │
│  │   "cbs_id":     "BASIKON-REG-001",         │               │
│  │   "cbs_code":   "entree",                  │               │
│  │   "cbs_fields": { nom, prenom, cin, ... }  │               │
│  │ }                                          │               │
│  └────────────────────────────────────────────┘               │
│                                                                │
│  LabFT effectue :                                              │
│    1. Création session KYC (DRAFT) en DB + Redis (TTL 24h)   │
│    2. Pré-traitement images (grayscale + contraste)          │
│    3. OCR Tesseract recto + verso (avec double-pass)         │
│    4. Fusion des champs recto/verso                          │
│    5. Validation OCR ↔ données CBS                            │
│    6. Session status → OCR_DONE                              │
│                                                                │
│  LabFT retourne :                                              │
│  ┌────────────────────────────────────────────┐               │
│  │ {                                          │               │
│  │   "success": true,                         │               │
│  │   "cbsRef":  "OCR-XXXXXXXXXX",             │               │
│  │   "extracted": {                           │               │
│  │     "cin": "K01234567",                    │               │
│  │     "dateNaissance": "1978-11-29",         │               │
│  │     "dateExpiration": "2029-09-09"         │               │
│  │   },                                       │               │
│  │   "confidence": { "overall": 52 },         │               │
│  │   "validation": {                          │               │
│  │     "score": 50,                           │               │
│  │     "status": "PARTIEL",                   │               │
│  │     "valid":    ["cin", "dateNaissance"],  │               │
│  │     "missing":  ["nom", "prenom"],         │               │
│  │     "mismatch": []                         │               │
│  │   },                                       │               │
│  │   "fieldsToReview": [...],                 │               │
│  │   "expiresAt": "2026-07-08T12:00:00Z"      │               │
│  │ }                                          │               │
│  └────────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────┘
                            │
                            │  Agent Basikon révise les champs
                            │  extraits, corrige si nécessaire
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  ÉTAPE 2 — POST /api/cbs/confirm                              │
│                                                                │
│  Basikon envoie :                                              │
│  ┌────────────────────────────────────────────┐               │
│  │ {                                          │               │
│  │   "cbsRef":  "OCR-XXXXXXXXXX",             │               │
│  │   "fields":  { nom, prenom, cin, ... },    │               │
│  │   "modified": true/false,                  │               │
│  │   "modifiedFields": ["nom", "adresse"]     │               │
│  │ }                                          │               │
│  └────────────────────────────────────────────┘               │
│                                                                │
│  LabFT effectue :                                              │
│    1. Récupération session (DB puis Redis)                    │
│    2. Vérif doublon CIN                                       │
│    3. Vérif cohérence modifs vs OCR original (si modified)   │
│    4. Création client LabFT                                   │
│    5. Enregistrement document CIN + OCR data                 │
│    6. Screening sanctions (OFAC/EU/UN/UK)                     │
│    7. Screening PEP séparé                                    │
│    8. Calcul score risque initial                             │
│    9. Décision finale                                         │
│   10. Notification CBS (webhook)                              │
│   11. Session status → DECIDED + customerId                   │
│                                                                │
│  LabFT retourne :                                              │
│  ┌────────────────────────────────────────────┐               │
│  │ {                                          │               │
│  │   "success": true,                         │               │
│  │   "customerId": 42,                        │               │
│  │   "customerRef": "KYC-XXXXXXXX",           │               │
│  │   "kycStatus": "APPROVED",                 │               │
│  │   "screening": {                           │               │
│  │     "status": "CLEAR",                     │               │
│  │     "matchScore": 45,                      │               │
│  │     "matchedEntity": null                  │               │
│  │   }                                        │               │
│  │ }                                          │               │
│  └────────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────┘
```

### Décisions possibles à l'étape confirm

| decision | kycStatus | Signification | Action CBS |
|----------|-----------|---------------|------------|
| `APPROVED` | APPROVED | Client validé, screening CLEAR | Activer le compte |
| `IN_REVIEW` | IN_REVIEW | Révision requise (PEP, partial match, doc expiré...) | Compte limité |
| `REJECTED` | REJECTED | Sanctions MATCH ou fraude confirmée | Bloquer / refuser |

### Codes de raison (reasonCode)

| Code | Signification |
|------|--------------|
| `APPROVED_CLEAR` | Screening CLEAR, client approuvé |
| `REJECTED_SANCTIONS_MATCH` | Correspondance sanctions (OFAC/EU/UN/UK) |
| `REJECTED_INVALID_PAYLOAD` | Payload CBS invalide |
| `REVIEW_PEP_DETECTED` | PEP détecté — EDD obligatoire |
| `REVIEW_DOCUMENT_MISMATCH` | Discordance CBS↔OCR |
| `REVIEW_DOCUMENT_EXPIRED` | Document expiré à l'ouverture |
| `REVIEW_DOCUMENT_EXPIRING_SOON` | Document expire dans < 30 jours |
| `REVIEW_SANCTIONS_PARTIAL` | Correspondance partielle (70-84) |
| `REVIEW_DUPLICATE_CIN` | CIN déjà enregistré |

---

## 4. Catalogue des Use Cases

### UC-1 : Happy Path — Client clean

```
Contexte : Client marocain, profil propre, aucun problème
Trigger  : Basikon envoie OCR + Confirm avec données conformes
Résultat : APPROVED en < 5s
```

**Séquence** :
1. Agent Basikon scanne CIN recto/verso du client
2. Basikon POST /api/cbs/ocr avec 2 images + cbs_fields
3. LabFT extrait : cin, dates, essaie nom/prénom
4. Basikon POST /api/cbs/confirm avec champs validés par agent
5. LabFT lance screening : CLEAR
6. LabFT crée client, kycStatus=APPROVED
7. LabFT notifie Basikon : webhook KYC_APPROVED
8. Basikon active le compte

**Response type** :
```json
{
  "decision": "APPROVED",
  "reasonCode": "APPROVED_CLEAR",
  "customerId": 42,
  "screening": { "status": "CLEAR", "matchScore": 45 }
}
```

### UC-2 : Sanctions Match — Rejet automatique

```
Contexte : Le nom du candidat matche une liste OFAC/EU/UN/UK
Trigger  : Score screening ≥ 85
Résultat : REJECTED immédiat + alerte CRITICAL
```

**Séquence** :
1-4. Comme UC-1
5. Screening détecte MATCH score 95 sur OFAC
6. LabFT crée client, kycStatus=REJECTED, sanctionStatus=MATCH
7. LabFT crée alerte CRITICAL (SANCTIONS_MATCH)
8. LabFT notifie Basikon : webhook KYC_REJECTED
9. Basikon refuse l'ouverture de compte

**Réglementaire** : conforme à l'article 3 de la Loi 43-05 (Maroc) qui interdit toute relation d'affaires avec entité sanctionnée.

### UC-3 : PEP Détecté — Enhanced Due Diligence

```
Contexte : Client identifié comme Politically Exposed Person
Trigger  : Match liste PEP (OpenSanctions) score ≥ 70
Résultat : IN_REVIEW + alerte HIGH + checklist EDD
```

**Séquence** :
1-4. Comme UC-1
5. Screening sanctions CLEAR
6. Screening PEP : MATCH sur "Ministre Finances Angola"
7. LabFT met customerType=PEP, pepStatus=true
8. LabFT crée alerte PEP HIGH avec checklist EDD :
   - Vérifier source des fonds
   - Approbation supervisor
   - Justificatifs patrimoine
9. LabFT crée client kycStatus=IN_REVIEW
10. LabFT notifie Basikon : webhook KYC_IN_REVIEW
11. Compliance Officer prend le dossier en manuel

### UC-4 : Discordance CBS↔OCR — Détection fraude

```
Contexte : Les champs envoyés par Basikon ne correspondent pas à ce que l'OCR extrait de l'image
Trigger  : Mismatch bloquant sur nom, prénom, date naissance ou CIN
Résultat : IN_REVIEW + alerte FRAUD HIGH
```

**Séquence** :
1. Agent Basikon saisit "BENALI Ahmed" mais scanne CIN "ALAOUI Ali"
2. LabFT OCR extrait "ALAOUI Ali"
3. LabFT compare avec similitude Levenshtein
4. Mismatch bloquant (similitude < 70%)
5. LabFT crée alerte FRAUD HIGH
6. Client créé en IN_REVIEW avec riskScore + 35
7. Investigation manuelle requise

### UC-5 : Document expiré à l'ouverture

```
Contexte : CIN scannée est déjà expirée
Trigger  : dateExpiration < aujourd'hui
Résultat : IN_REVIEW + alerte CRITICAL
```

**Séquence** :
1-4. Comme UC-1
5. LabFT détecte dateExpiration passée
6. Document créé avec status=EXPIRED
7. Alerte CRITICAL (DOCUMENT_EXPIRY)
8. Client bloqué en IN_REVIEW jusqu'à nouveau document

### UC-6 : Cycle de vie document — Escalade progressive

```
Contexte : Client actif depuis N mois, sa CIN va expirer
Trigger  : Scheduler nuitier détecte proximité expiration
Résultat : Escalade J-30 → J-7 → J+0 → J+15 → J+30
```

**Timeline** :
```
J-30 : Alerte MEDIUM  + webhook KYC_DOC_EXPIRING_SOON
J-7  : Alerte HIGH     + webhook KYC_DOC_EXPIRING_SOON
J+0  : Alerte CRITICAL + webhook KYC_DOC_EXPIRED
       (document=EXPIRED, kycStatus reste APPROVED grâce 15j)
J+15 : Alerte HIGH + webhook KYC_GRACE_ENDING
       (kycStatus=IN_REVIEW, plafond CBS réduit)
J+30 : Alerte CRITICAL + webhook KYC_BLOCK_REQUIRED
       (kycStatus=REJECTED, compte bloqué)
```

Configuration :
- `DOC_EXPIRY_WARN_DAYS=30`
- `DOC_EXPIRY_GRACE_DAYS=15`
- `DOC_EXPIRY_BLOCK_DAYS=30`

### UC-7 : pKYC — Dérive comportementale

```
Contexte : Client validé, mais comportement transactionnel change
Trigger  : Score de dérive nuitier ≥ 40
Résultat : Alerte PKYC_DRIFT + nextReviewDate = aujourd'hui
```

**5 facteurs de dérive analysés** :

| Facteur | Poids | Description |
|---------|-------|-------------|
| volumeDrift | 25% | Variation du volume transactionnel |
| frequencyDrift | 20% | Variation du nombre de transactions |
| geoDrift | 30% | Nouveaux pays de contrepartie |
| amountSpike | 15% | Pic sur transaction unique |
| newCounterparties | 10% | Part de nouvelles contreparties |

### UC-8 : Réactivation après blocage

```
Contexte : Client bloqué (UC-5 ou UC-6) revient avec nouveau document
Trigger  : POST /api/cbs/reactivation
Résultat : Re-screening complet + réactivation si CLEAR
```

**Séquence** :
1. Client vient à l'agence avec nouvelle CIN
2. Agent Basikon POST /api/cbs/reactivation
3. LabFT enregistre nouveau document
4. Re-screening sanctions COMPLET (listes peuvent avoir évolué)
5. Si CLEAR → kycStatus=APPROVED, webhook KYC_APPROVED
6. Si REJECTED → alerte + sarWarning=true (SAR à considérer si ex-actif malgré blocage)

### UC-9 : Structuring (Fractionnement)

```
Contexte : Client fait plusieurs dépôts juste sous le seuil déclaratif
Trigger  : Moteur AML détecte pattern (ex: 10 dépôts de 9500 MAD)
Résultat : Alerte PATTERN + investigation
```

### UC-10 : Doublon CIN

```
Contexte : Agent Basikon veut créer un client avec un CIN déjà en base
Trigger  : Confirm avec cin existant
Résultat : Blocage + référence existante retournée
```

Response :
```json
{
  "success": false,
  "error": "Client CIN AB123456 déjà enregistré (KYC-XXXX)",
  "existingCustomerRef": "KYC-XXXX"
}
```

---

## 5. API Reference

### Base URL Production
```
http://10.10.1.185:3000
```

### Authentification

Toutes les requêtes CBS nécessitent :
```
X-CBS-Api-Key: <cbs-onboarding-api-key>
```

Clé actuelle staging : `cbs-staging-key-change-me` (à changer avant prod).

### Endpoints Officiels

| Méthode | Endpoint | Rôle | Latence |
|---------|----------|------|---------|
| POST | `/api/cbs/ocr` | Étape 1 : extraction CIN | 8-15s |
| POST | `/api/cbs/confirm` | Étape 2 : décision + création client | 1-2s |
| POST | `/api/cbs/face-match` | Comparaison selfie vs CIN | < 1s |
| POST | `/api/cbs/document` | Nouveau document pour client existant | 3-5s |
| POST | `/api/cbs/reactivation` | Réactivation après blocage | 3-5s |
| GET | `/api/cbs/sessions/:ref` | Consultation état session | < 200ms |
| GET | `/api/cbs/sessions-stats` | Statistiques agrégées | < 200ms |
| GET | `/api/cbs/health` | Santé du service | < 100ms |

### Endpoint Legacy (déprécié)

| Méthode | Endpoint | Statut |
|---------|----------|--------|
| POST | `/api/cbs/onboarding` | Retourne header `X-Deprecated: true`. À retirer en v5.5 |

### Format erreur standardisé

```json
{
  "success": false,
  "cbsRef": "OCR-XXXXXXXXXX",
  "error": "Message d'erreur humain-readable",
  "code": "REVIEW_INTERNAL_ERROR",
  "processedAt": "2026-07-07T12:00:00.000Z"
}
```

Codes HTTP :
- `200` : succès (même si `success:false` = décision négative métier)
- `400` : payload invalide
- `401` : X-CBS-Api-Key manquant/invalide
- `404` : session/client introuvable
- `409` : conflit (session déjà décidée, doublon CIN)
- `500` : erreur serveur

---

## 6. Modèles de données

### Structure Session KYC

```typescript
interface KycSession {
  sessionRef:      string;          // OCR-XXXXXXXXXX
  channel:         "CBS_API" | "DIGITAL_WEB" | "AGENT_OFFICE" | "MOBILE_APP";
  status:          "DRAFT" | "OCR_DONE" | "AGENT_REVIEW" | "PENDING_CA" | "DECIDED" | "ABANDONED";
  cbsRef:          string | null;   // Référence Basikon (ID)
  cbsCode:         string | null;   // "entree" | "matcash"
  ocrResult:       object | null;   // Résultat OCR brut
  candidateFields: object | null;   // Champs candidats
  cbsFields:       object | null;   // Champs envoyés par CBS
  decisionResult:  object | null;   // { kycStatus, screening, ... }
  customerId:      number | null;   // Créé à l'étape confirm
  modifiedFields:  string[];        // Champs modifiés par agent
  startedAt:       datetime;
  expiresAt:       datetime;        // TTL 24h CBS_API, 1h DIGITAL_WEB
  decidedAt:       datetime | null;
  abandonedAt:     datetime | null;
}
```

### Structure Champs CIN marocaine

```typescript
interface CinMarocFields {
  nom?:             string;         // NOM DE FAMILLE
  prenom?:          string;         // PRENOM
  cin?:             string;         // Format: [A-Z]{1,2}\d{6,8}
  can?:             string;         // Card Auth Number (CNIE post-2020, 6 chiffres)
  dateNaissance?:   string;         // YYYY-MM-DD
  dateExpiration?:  string;         // YYYY-MM-DD
  lieuNaissance?:   string;         // Ville de naissance
  prefecture?:      string;         // Ex: "TANGER" pour "TANGER ASSILAH - TANGER"
  sexe?:            "M" | "F";
  adresse?:         string;         // Adresse (verso)
  quartier?:        string;
  ville?:           string;
  filiationPere?:   string;         // "Fils de" (verso)
  filiationMere?:   string;         // "et de" (verso)
  numEtatCivil?:    string;         // N° d'état civil
}
```

### Webhook payload

```typescript
interface CbsWebhookPayload {
  event:       "KYC_APPROVED" | "KYC_IN_REVIEW" | "KYC_REJECTED" |
               "KYC_DOC_EXPIRING_SOON" | "KYC_DOC_EXPIRED" |
               "KYC_GRACE_ENDING" | "KYC_BLOCK_REQUIRED";
  customerId:  number;
  customerRef: string;
  cin:         string | null;
  cbsRef:      string | null;
  riskLevel:   "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  daysExpired?:    number;
  daysUntilBlock?: number;
  reason:      string;
  timestamp:   string;
}
```

---

## 7. Sécurité & Conformité

### Authentification

- **CBS ↔ LabFT** : API Key statique (`X-CBS-Api-Key`)
- **Webhooks LabFT → CBS** : API Key statique (`X-KYC-Api-Key`)
- **Recommandation** : rotation trimestrielle des clés

### Chiffrement

- **HTTPS obligatoire** en production (reverse proxy nginx + Let's Encrypt à mettre en place côté client)
- **Base de données** : chiffrement au repos via LUKS ou pgcrypto (à configurer sur le serveur)
- **Redis** : `requirepass` obligatoire, éventuellement TLS

### Traçabilité (Audit Trail)

Tous les événements critiques sont enregistrés dans la table `audit_logs` avec :
- Utilisateur / système déclencheur
- Timestamp UTC
- IP source
- Détail complet de l'action

Hash chain SHA-256 pour intégrité — impossible de modifier l'historique sans détection.

### Conformité réglementaire

| Réglementation | Statut |
|----------------|--------|
| BAM Circulaire 19/G/2010 (KYC bancaire) | ✅ Screening + EDD PEP |
| Loi 43-05 (Anti-blanchiment Maroc) | ✅ SAR/STR + reporting ANRF |
| AMLD6 (Anti-blanchiment européenne) | ✅ Rapport annuel + 12 KPIs |
| RGPD (Protection données) | ✅ Droit effacement + audit |
| FATF Recommandations 10-11 | ✅ CDD + record keeping |

### Rôles utilisateurs

| Rôle | Permissions clés |
|------|-----------------|
| `analyst` | Consulter alertes, ouvrir dossiers, créer SAR/STR |
| `supervisor` | Approuver dossiers, ajouter Good Guys, Silencing |
| `compliance_officer` | Transmettre SAR/STR ANRF, Dashboard Direction |
| `admin` | Gestion utilisateurs, config, schedulers |

---

## 8. Limites connues & Prérequis client

### 🚨 CRITIQUE — Actions requises côté client

#### 1. Firewall WatchGuard XTM bloque l'accès Internet sortant

**Constat** : Le serveur `10.10.1.185` est derrière un firewall WatchGuard Fireware XTM qui **exige une authentification web** pour tout accès Internet. Notre backend Node.js ne peut pas s'authentifier en HTML → **toutes les listes officielles sont vides** :

```
OFAC:0(fresh)!  ← bloqué
EU:0(fresh)!    ← bloqué
UN:0(fresh)!    ← bloqué
UK:0(fresh)!    ← bloqué
PEP:0(fresh)!   ← bloqué (utilise mock actuellement)
```

**Impact réglementaire** : sans les vraies listes, le screening n'est **pas conforme BAM/ANRF** en production réelle.

**Solution obligatoire** : Whitelist des domaines suivants pour l'IP `10.10.1.185` :

```
www.treasury.gov              (OFAC SDN)
webgate.ec.europa.eu          (EU Financial Sanctions)
scsanctions.un.org            (UN Security Council)
assets.publishing.service.gov.uk (UK FCDO)
data.opensanctions.org        (PEP + fallbacks)
registry.npmjs.org            (mises à jour dépendances)
tessdata.projectnaptha.com    (modèles Tesseract)
```

**Fallback temporaire actif** : `PEP_MOCK_FALLBACK=true` charge un mock avec 14 personas OFAC connus (BIN LADEN, HUSSEIN, QADHAFI, ZAWAHIRI) + 15 PEP. **Suffisant pour démo, PAS pour production.**

#### 2. HTTPS non configuré

Actuellement le serveur écoute en HTTP sur port 3000. Pour la production :
- Installer reverse proxy nginx
- Certificat Let's Encrypt (ou certificat client interne)
- Rediriger 3000 → 443

**Raison** : Basikon transmet des données personnelles + images CIN — chiffrement TLS obligatoire selon RGPD art. 32.

#### 3. Backup PostgreSQL

Aucune stratégie de sauvegarde n'est en place. Recommandations :
- `pg_dump` quotidien vers stockage distant
- Rétention 30 jours
- Test restauration mensuel

### ⚠️ Limites fonctionnelles

#### OCR CIN marocaine — Précision limitée

Sur images réelles CIN CNIE (2020+), le taux de reconnaissance est :

| Champ | Taux de succès |
|-------|---------------|
| N° CIN | 90% |
| Date naissance | 85% |
| Date expiration | 85% |
| Nom | 30% |
| Prénom | 30% |
| Adresse verso | 40% |

**Cause** : Fond moiré de sécurité anti-copie + fonte stylisée perturbent Tesseract.

**Mitigation actuelle** : Workflow 2 étapes (OCR → Confirm) où **l'agent Basikon valide/corrige les champs** avant création du client. Les champs manquants sont saisis manuellement.

**Solutions long terme** :
- Service spécialisé (Regula, IDEMIA) : 0.5-2€/vérification, 95%+ précision
- Fine-tuning Tesseract avec dataset 500+ CIN annotées : 2-3 semaines dev
- Détection automatique de la zone photo pour crop dynamique : 2-3 jours dev

#### Face Match

Utilise `face-api.js` côté client (browser). Fonctionne bien mais dépend de la qualité :
- Éclairage
- Angle de face
- Distance à la caméra

Score < 65% = révision manuelle recommandée.

#### Modèle ML Scoring

Le service `kyc_ml` (FastAPI) fonctionne mais **le modèle n'est pas entraîné** :
```json
{"model_ready": false, "model_version": "untrained"}
```

Impact : score ML retourne des valeurs neutres. À entraîner sur données historiques du client (nécessite ~1000+ transactions annotées).

### 📋 Configuration `.env` production requise

```env
# CBS Integration
CBS_ONBOARDING_API_KEY=<clé-secrète-forte>       # À changer avant prod !
CBS_AUTH_DISABLED=false
CBS_WEBHOOK_URL=https://basikon.client.ma/api/kyc-callback
CBS_NOTIFY_ENABLED=true

# Screening
SCREENING_MATCH_THRESHOLD=85
SCREENING_REVIEW_THRESHOLD=70
SCREENING_TLS_INSECURE=true                      # Tant que proxy pas configuré
PEP_MOCK_FALLBACK=true                            # À passer false après whitelist firewall

# OCR
OCR_PREPROCESS=true
OCR_DUAL_PASS=true
OCR_SAUVOLA=false
TESSDATA_PATH=/opt/kyc-platform/tessdata

# ML Scoring
ML_SERVICE_URL=http://localhost:8000
ML_INTERNAL_API_KEY=<clé-secrète>

# Cycle vie documents
DOC_EXPIRY_WARN_DAYS=30
DOC_EXPIRY_GRACE_DAYS=15
DOC_EXPIRY_BLOCK_DAYS=30

# pKYC
PKYC_ENABLED=true
PKYC_DRIFT_THRESHOLD=40
```

---

## 9. Scénarios d'erreur & Résilience

### Session expirée

**Cause** : Confirm > 24h après OCR
**Comportement** : HTTP 404 avec `error: "Session {ref} expirée"`
**Solution client** : Recommencer par POST /api/cbs/ocr

### Doublon CIN

**Cause** : Deux confirms avec même CIN
**Comportement** : HTTP 200 avec `success:false, existingCustomerRef`
**Solution client** : Rediriger vers dossier existant

### Session déjà décidée

**Cause** : Retry accidentel après confirm réussi
**Comportement** : HTTP 409 avec référence customer existant
**Solution client** : Ne pas retenter, utiliser l'ID existant

### OCR sans résultat

**Cause** : Image trop dégradée / mauvais format
**Comportement** : Response `extracted: {}`, `confidence: 0`
**Solution client** : Agent saisit manuellement tous les champs à l'étape confirm

### Screening indisponible

**Cause** : Listes vides (firewall) + mock désactivé
**Comportement** : screening `status: CLEAR` par défaut (safe fail)
**Solution client** : Alerter admin réseau, activer mock temporaire

### Webhook LabFT → CBS échoue

**Cause** : CBS_WEBHOOK_URL inaccessible
**Comportement** : Log warning, retry 1x, puis abandon (non-bloquant)
**Solution client** : Vérifier URL webhook, endpoint doit répondre 200 OK

---

## 10. Checklist Go-Live

### Phase 1 — Prérequis réseau (client)

- [ ] Firewall WatchGuard : whitelist domaines Internet listés
- [ ] HTTPS : reverse proxy nginx configuré + certificat SSL valide
- [ ] Backup PostgreSQL : job cron quotidien vers stockage distant
- [ ] Monitoring : configurer alertes systemd pour kyc-platform.service
- [ ] Logs : rotation logrotate configurée
- [ ] Sécurité : ports 5432 (PG) et 6379 (Redis) fermés vers l'extérieur

### Phase 2 — Configuration LabFT

- [ ] Rotation `CBS_ONBOARDING_API_KEY` avec valeur forte (32+ caractères)
- [ ] `CBS_WEBHOOK_URL` pointant vers endpoint Basikon HTTPS
- [ ] `CBS_NOTIFY_ENABLED=true`
- [ ] `PEP_MOCK_FALLBACK=false` (après validation phase 1)
- [ ] `SCREENING_TLS_INSECURE=false` (idem)
- [ ] Créer comptes utilisateurs (analyst, supervisor, CO, admin)
- [ ] Configurer institution.type = "CLASSIC_BANK" ou "MICROFINANCE"

### Phase 3 — Tests d'intégration

- [ ] UC-1 Happy Path (client clean) → APPROVED
- [ ] UC-2 Sanctions (test avec nom OFAC) → REJECTED
- [ ] UC-3 PEP (test avec nom PEP) → IN_REVIEW
- [ ] UC-4 Discordance (nom modifié vs OCR) → alerte FRAUD
- [ ] UC-5 Document expiré → IN_REVIEW
- [ ] UC-6 Simulation escalade doc-expiry (setter dates test)
- [ ] UC-8 Réactivation client bloqué → APPROVED
- [ ] Webhook : vérifier réception des 7 events KYC_* côté Basikon
- [ ] Simulateur CBS : les 15 scénarios prédéfinis fonctionnent

### Phase 4 — Formation utilisateurs

- [ ] Analystes : interface Alertes + Cases + Screening
- [ ] Supervisors : Approbations + Good Guys + Silencing
- [ ] Compliance Officers : SAR/STR + Dashboard Direction + AMLD6
- [ ] Admins : Gestion utilisateurs + Config + Schedulers

### Phase 5 — Reporting réglementaire

- [ ] Test génération rapport AMLD6 annuel
- [ ] Test transmission SAR/STR GoAML vers ANRF (mode sandbox)
- [ ] Configuration organisation déclarante (`.env` : ORG_NAME, ORG_ADDRESS, TRACFIN_ENTITY_ID)
- [ ] Import listes historiques (si existant)

---

## Contact & Support

**Documentation technique** : `/opt/kyc-platform/WORKFLOWS.md`
**Repo Git** : github.com/a3ksecufinance-dev/kyc-lab-ft-platforme
**Logs live** : `journalctl -u kyc-platform -f`
**Simulateur démo** : `node cbs-simulator/server.js` → http://localhost:3100

---

*Document préparé pour intégration client — Juillet 2026 — LabFT v5.0*
