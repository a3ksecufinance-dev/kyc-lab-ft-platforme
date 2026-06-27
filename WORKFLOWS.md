# Plateforme LabFT — Architecture & Workflows
**Version 4.1 — Juin 2026**

> ⚠️ Document de référence officiel — toute intégration externe doit s'y conformer.

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Workflow entrée en relation (OFFICIEL)](#2-workflow-entrée-en-relation-officiel)
3. [API CBS — Endpoints actifs](#3-api-cbs--endpoints-actifs)
4. [Cycle de vie des documents](#4-cycle-de-vie-des-documents)
5. [Modules complémentaires](#5-modules-complémentaires)
6. [Notifications CBS sortantes](#6-notifications-cbs-sortantes)
7. [Configuration & déploiement](#7-configuration--déploiement)

---

## 1. Vue d'ensemble

LabFT est une plateforme KYC-AML qui se connecte au CBS (Basikon) via une API REST.
Elle ne remplace pas le CBS : elle est le **module de conformité** qui décide si un dossier client peut être validé.

```
┌──────────────────────┐        ┌────────────────────────┐
│   BASIKON (CBS)       │        │   LABFT (Plateforme)    │
│                      │        │                         │
│   • Comptes clients   │◄──────►│  • OCR documents        │
│   • Transactions      │  API   │  • Screening sanctions  │
│   • Agent Basikon     │  REST  │  • Décision KYC        │
└──────────────────────┘        │  • Création client      │
                                │  • Cycle de vie docs    │
                                └────────────────────────┘
```

---

## 2. Workflow entrée en relation (OFFICIEL)

Le workflow officiel suit **2 étapes** définies avec le client. Aucun autre chemin ne doit être utilisé pour les nouveaux dossiers.

```
┌──────────────────────────────────────────────────────────────────┐
│  ÉTAPE 1 — OCR (Basikon → LabFT)                                  │
│                                                                   │
│  POST /api/cbs/ocr                                                │
│  Body : { cin_recto: base64, cin_verso: base64, cbs_fields?: ... }│
│                                                                   │
│  LabFT :                                                          │
│    1. OCR recto (MRZ + texte)                                     │
│    2. OCR verso (adresse, quartier, ville)                        │
│    3. Fusion des 2 faces → JSON unifié                            │
│    4. Comparaison avec cbs_fields (si fournis)                    │
│    5. Stockage session Redis 30 min (cbsRef)                      │
│                                                                   │
│  Réponse : { cbsRef, extracted, validation, fieldsToReview }      │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              Agent Basikon révise les champs
              (corrige ce qui doit l'être)
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  ÉTAPE 2 — CONFIRMATION (Basikon → LabFT)                         │
│                                                                   │
│  POST /api/cbs/confirm                                            │
│  Body : { cbsRef, fields, modified, modifiedFields }              │
│                                                                   │
│  LabFT :                                                          │
│    1. Récupère la session OCR depuis Redis                        │
│    2. Vérifie cohérence champs modifiés vs OCR original           │
│    3. Vérifie doublon CIN                                         │
│    4. Crée le client LabFT (kycStatus=PENDING)                    │
│    5. Stocke le document CIN avec données OCR                     │
│    6. Lance le screening sanctions                                │
│    7. Calcule le statut KYC final                                 │
│    8. Notifie le CBS du résultat                                  │
│                                                                   │
│  Réponse : { customerId, customerRef, kycStatus, screening }      │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                Le client existe dans LabFT
                avec kycStatus = APPROVED / IN_REVIEW / REJECTED
```

### Pourquoi 2 étapes ?

| Avantage | Raison |
|----------|--------|
| Validation humaine | L'agent peut corriger l'OCR avant création |
| Pas de doublon prématuré | Le client n'est créé qu'à confirm |
| Traçabilité modifs | Les champs modifiés sont loggés |
| Reprise possible | Tant que session Redis valide (30 min) |

---

## 3. API CBS — Endpoints actifs

### Endpoints OFFICIELS (à utiliser)

| Endpoint | Méthode | Usage |
|----------|---------|-------|
| `/api/cbs/ocr` | POST | Étape 1 : extraction CIN recto+verso |
| `/api/cbs/confirm` | POST | Étape 2 : validation + création client |
| `/api/cbs/face-match` | POST | Vérification biométrique CIN ↔ Selfie |
| `/api/cbs/document` | POST | Nouveau document pour client existant |
| `/api/cbs/reactivation` | POST | Réactivation après blocage |
| `/api/cbs/health` | GET | Santé du service |

### Endpoint LEGACY (déprécié)

| Endpoint | Statut | Note |
|----------|--------|------|
| `/api/cbs/onboarding` | 🟡 Deprecated | Maintenu pour rétrocompat. Header `X-Deprecated: true` retourné. À retirer dans v5.0. |

### Authentification

Toutes les requêtes nécessitent l'en-tête :
```
X-CBS-Api-Key: <CBS_ONBOARDING_API_KEY>
```

Désactivable en dev avec `CBS_AUTH_DISABLED=true`.

---

## 4. Cycle de vie des documents

```
CRÉATION (étape OCR + confirm)
   │
   │  Document stocké avec expiryDate
   ▼
[APPROVED]
   │
   │  Scheduler doc-expiry nuitier (02:00 UTC)
   │
   ├──[J-30]──► Alerte MEDIUM   + notify CBS DOC_EXPIRING_SOON
   ├──[J-7] ──► Alerte HIGH     + notify CBS DOC_EXPIRING_SOON
   │
   ├──[J+0] ──► Document EXPIRED + alerte CRITICAL
   │            kycStatus reste APPROVED (période de grâce 15j)
   │            notify CBS DOC_EXPIRED
   │
   ├──[J+15]──► kycStatus = IN_REVIEW (plafond CBS réduit)
   │            notify CBS GRACE_ENDING
   │
   └──[J+30]──► kycStatus = REJECTED (compte bloqué)
                notify CBS BLOCK_REQUIRED
```

### Régularisation — 2 voies possibles

| Voie | Endpoint | Cas d'usage |
|------|----------|-------------|
| CBS pousse un nouveau document | `POST /api/cbs/document` | Renouvellement CIN |
| Réactivation après blocage | `POST /api/cbs/reactivation` | Client revient avec nouveau doc |

---

## 5. Modules complémentaires

### Screening sanctions + PEP

| Source | Volume |
|--------|--------|
| OFAC SDN (US Treasury) | ~19 000 |
| EU Financial Sanctions | ~4 500 |
| UN Security Council | ~1 000 |
| UK FCDO | ~3 000 |
| OpenSanctions PEP | ~1 700 000 |

Seuils :
- `SCREENING_MATCH_THRESHOLD=85` → REJECTED
- `SCREENING_REVIEW_THRESHOLD=70` → IN_REVIEW

### pKYC — Surveillance comportementale

Scheduler nuitier (01:00 UTC) calcule un score de dérive sur 5 facteurs :
- Volume (25%), Fréquence (20%), Géographie (30%), Pics montant (15%), Nouvelles contreparties (10%)

Seuil par défaut `PKYC_DRIFT_THRESHOLD=40` → alerte `PKYC_DRIFT`.

### Good Guys List & Silencing Rules

| Module | Rôle |
|--------|------|
| Good Guys List | Exclure des clients de confiance du monitoring AML |
| Silencing Rules | Suppression conditionnelle d'alertes (test, maintenance) |

### Page eKYC Digital (`/ekyc`)

Canal alternatif pour entrée en relation directe par l'utilisateur final via navigateur :
- Capture CIN recto + verso via WebRTC (caméra)
- Lecture NFC CNIE optionnelle (Chrome Android)
- Selfie + face match (face-api.js côté client)
- Utilise les **mêmes endpoints** : `/api/cbs/ocr` → `/api/cbs/confirm`

---

## 6. Notifications CBS sortantes

LabFT pousse vers le CBS à chaque changement de statut KYC.

Configuration :
```env
CBS_WEBHOOK_URL=https://basikon.client.ma/api/kyc-callback
CBS_NOTIFY_ENABLED=true
```

Événements émis :

| Event | Quand |
|-------|-------|
| `KYC_APPROVED` | Client validé |
| `KYC_IN_REVIEW` | Document expiré / partial match |
| `KYC_REJECTED` | Sanctions match / blocage |
| `KYC_DOC_EXPIRING_SOON` | J-30 / J-7 avant expiration |
| `KYC_DOC_EXPIRED` | J+0 expiration document |
| `KYC_GRACE_ENDING` | J+15 fin de grâce |
| `KYC_BLOCK_REQUIRED` | J+30 blocage requis |

Format du payload :
```json
{
  "event": "KYC_APPROVED",
  "customerId": 14,
  "customerRef": "KYC-TRFXDNE1",
  "cin": "AB123456",
  "cbsRef": "REG00042",
  "riskLevel": "LOW",
  "reason": "Entrée en relation via OCR CIN — APPROVED",
  "timestamp": "2026-06-27T12:00:00.000Z"
}
```

---

## 7. Configuration & déploiement

### Variables d'environnement clés

```env
# CBS Integration
CBS_ONBOARDING_API_KEY=<clé secrète CBS>
CBS_AUTH_DISABLED=false                   # true en dev local uniquement
CBS_WEBHOOK_URL=https://...                # URL retour CBS
CBS_NOTIFY_ENABLED=true

# Screening
SCREENING_MATCH_THRESHOLD=85
SCREENING_REVIEW_THRESHOLD=70
SCREENING_TLS_INSECURE=false              # true si proxy SSL bloque
PEP_MOCK_FALLBACK=false

# Cycle de vie documents
DOC_EXPIRY_WARN_DAYS=30
DOC_EXPIRY_GRACE_DAYS=15
DOC_EXPIRY_BLOCK_DAYS=30

# pKYC
PKYC_ENABLED=true
PKYC_DRIFT_THRESHOLD=40

# OCR
OCR_LANG_ARABIC=true                      # active OCR arabe pour CIN MA
```

### Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | Node.js 22 + Express + tRPC |
| Frontend | React 19 + Vite + Plus Jakarta Sans |
| Base | PostgreSQL 15 + Redis |
| ORM | Drizzle |
| OCR | Tesseract.js (fra+eng+ara) |
| Face match | @vladmandic/face-api (client-side) |
| Hébergement | Linux (systemd) — `/opt/kyc-platform/` |

---

*Document maintenu officiellement par l'équipe LabFT — Juin 2026*
