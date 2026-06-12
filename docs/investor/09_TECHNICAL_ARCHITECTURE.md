# WatchReg — Architecture Technique
## Document Due Diligence Technique
### Confidentiel — Mai 2026

---

## RÉSUMÉ EXÉCUTIF TECHNIQUE

WatchReg est construite sur une **stack TypeScript full-stack moderne** avec séparation
claire frontend/backend, API type-safe via tRPC, base de données PostgreSQL avec
Drizzle ORM, et chiffrement AES-256-GCM des données personnelles sensibles.

La plateforme est conçue pour être déployée en mode **cloud SaaS multi-tenant**
(roadmap Q4 2026) ou **on-premise** selon les exigences du client.

**Métriques qualité actuelles :**
- 216/216 tests automatisés passants
- 0 erreur TypeScript (strict mode)
- 0 warning ESLint
- Temps de réponse webhook AML : < 200ms
- Couverture réglementaire BAM Circulaire 5/W/2023 : 100%

---

## ARCHITECTURE GLOBALE

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│                                                                 │
│  React 18 + TypeScript  │  TanStack Query  │  Tailwind CSS     │
│  SPA (Vite)             │  React Router v6 │  Shadcn/UI        │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ HTTPS / tRPC over HTTP
┌─────────────────────────────────▼───────────────────────────────┐
│                         API LAYER (tRPC)                        │
│                                                                 │
│  Express.js + tRPC     │  JWT Auth (RS256)  │  Rate Limiting   │
│  TypeScript strict     │  RBAC Middleware   │  CORS strict      │
│  Zod v4 validation     │  Audit Logging     │  Helmet.js        │
└──────────┬──────────────────────┬────────────────────┬──────────┘
           │                      │                    │
┌──────────▼──────────┐  ┌───────▼────────┐  ┌───────▼──────────┐
│   BUSINESS LOGIC    │  │  AML ENGINE    │  │  SCHEDULER       │
│                     │  │                │  │                  │
│  - KYC Service      │  │  - Rule Engine │  │  - pKYC cron     │
│  - SAR/STR Service  │  │  - Scoring ML  │  │  - ML retrain    │
│  - Screening Svc    │  │  - Webhook CBS │  │  - List refresh  │
│  - Cases Service    │  │  - Alert Svc   │  │  - SLA monitor   │
│  - Reports Service  │  │                │  │                  │
└──────────┬──────────┘  └───────┬────────┘  └───────┬──────────┘
           │                     │                    │
┌──────────▼─────────────────────▼────────────────────▼──────────┐
│                      DATA LAYER                                  │
│                                                                 │
│  PostgreSQL 15+      │  Drizzle ORM      │  AES-256-GCM PII    │
│  Transactions ACID   │  Type-safe queries│  Encrypted columns  │
└─────────────────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                              │
│                                                                 │
│  ML Microservice     │  Sanctions Lists   │  CBS Webhook       │
│  (Python FastAPI)    │  (OFAC/EU/UN/UK/   │  (Core Banking     │
│  Score calculation   │   BAM — auto-sync) │   System input)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## STACK TECHNIQUE DÉTAILLÉE

### Frontend

| Composant | Technologie | Version | Rôle |
|-----------|------------|---------|------|
| Framework | React | 18.x | UI réactive |
| Build tool | Vite | 5.x | Dev server + bundling |
| Langage | TypeScript | 5.x | Typage strict |
| Routing | React Router | v6 | Navigation SPA |
| State/Cache | TanStack Query | v5 | Cache API + refetch |
| API client | tRPC client | v11 | Appels type-safe |
| Styling | Tailwind CSS | v3 | Utility-first CSS |
| Composants | Shadcn/UI | latest | Design system |
| Formulaires | React Hook Form | v7 | Validation forms |
| Validation | Zod | v4 | Schémas types |
| Charts | Recharts | v2 | Dashboard KPIs |
| Icons | Lucide React | latest | Iconographie |

### Backend

| Composant | Technologie | Version | Rôle |
|-----------|------------|---------|------|
| Runtime | Node.js | 20 LTS | Environnement serveur |
| Langage | TypeScript | 5.x | Typage strict |
| Framework | Express.js | v4 | HTTP server |
| API | tRPC | v11 | API type-safe end-to-end |
| Validation | Zod | v4 | Schémas input/output |
| Auth | JWT (RS256) + JTI | — | Auth stateless anti-replay |
| MFA | TOTP (otplib) | — | Authentification 2FA |
| Password | bcrypt | 12 rounds | Hash mots de passe |
| Rate limit | express-rate-limit | — | Protection API |
| Security | Helmet.js | — | Headers HTTP sécurisés |

### Base de données

| Composant | Technologie | Version | Rôle |
|-----------|------------|---------|------|
| SGBD | PostgreSQL | 15+ | Stockage principal |
| ORM | Drizzle ORM | latest | Requêtes type-safe |
| Migrations | Drizzle Kit | — | Gestion schéma |
| PII Encryption | AES-256-GCM | — | Chiffrement champs sensibles |
| Seed | pnpm tsx | — | Données de démo/test |

### Chiffrement et sécurité des données

```typescript
// Champs PII chiffrés en AES-256-GCM :
// - phone (téléphone)
// - dateOfBirth (date de naissance)
// - address (adresse complète)
// - taxId (identifiant fiscal)
// - idNumber (numéro document d'identité)

// Clé de chiffrement : PII_ENCRYPTION_KEY (env variable, 32 bytes)
// IV : aléatoire par chiffrement (12 bytes)
// Auth tag : 16 bytes (intégrité garantie)
// Format stockage : "iv:authTag:ciphertext" (base64)
```

### ML Microservice

| Composant | Technologie | Rôle |
|-----------|------------|------|
| Framework | Python FastAPI | API REST pour inférence ML |
| Modèle | Gradient Boosting / RF | Scoring risque client |
| Déploiement | Docker container | Service indépendant |
| Communication | REST HTTP (interne) | `kyc_ml:8000` |
| Fallback | Score déterministe | Si service indisponible |

---

## SCHÉMA DE BASE DE DONNÉES — ENTITÉS PRINCIPALES

```
customers ──────────────────────────────────────────────
  id (uuid PK)
  externalId, type (INDIVIDUAL/CORPORATE)
  riskScore (0–100), riskLevel (LOW/MEDIUM/HIGH/CRITICAL)
  kycStatus, sanctionStatus
  piiEncrypted: { phone, dob, address, taxId, idNumber }
  createdAt, updatedAt

transactions ──────────────────────────────────────────
  id (uuid PK)
  customerId (FK → customers)
  amount, currency, type
  counterparty, counterpartyCountry (ISO 3166-1)
  riskScore, status (NORMAL/FLAGGED/BLOCKED)
  flagReason, amlRulesMatched (array)
  createdAt

alerts ────────────────────────────────────────────────
  id (uuid PK)
  transactionId (FK → transactions)
  customerId (FK → customers)
  priority (LOW/MEDIUM/HIGH/CRITICAL)
  status (OPEN/IN_REVIEW/ESCALATED/FALSE_POSITIVE/CLOSED)
  scenario, riskScore
  assignedTo (FK → users)
  resolutionNote, slaDeadline
  createdAt, resolvedAt

reports (SAR/STR) ─────────────────────────────────────
  id (uuid PK)
  customerId (FK → customers)
  type (SAR/STR), title
  status (DRAFT/REVIEW/SUBMITTED/APPROVED)
  anrfReference, anrfDepositDate, anrfStatus (ACCUSEE/CLASSEE)
  amountInvolved, suspicionType, description
  createdBy (FK → users)

cases ─────────────────────────────────────────────────
  id (uuid PK)
  customerId (FK → customers)
  title, description, severity
  status (OPEN/IN_PROGRESS/CLOSED/ARCHIVED)
  assignedTo (FK → users)
  caseTimeline (array d'événements horodatés)

approvalRequests (Dual Control) ───────────────────────
  id (uuid PK)
  requestedBy (FK → users)
  approvedBy (FK → users, DIFFERENT de requestedBy)
  entityType, entityId
  action (SAR_TRANSMIT, CASE_ESCALATE, etc.)
  status (PENDING/APPROVED/REJECTED)
  requestNote, approvalNote
  createdAt, decidedAt
  — CONSTRAINT: requestedBy ≠ approvedBy (4-yeux)

auditLog ─────────────────────────────────────────────
  id (uuid PK)
  userId (FK → users)
  action (enum 40+ actions)
  entityType, entityId
  metadata (JSON — before/after state)
  ipAddress, userAgent
  createdAt (immutable — no UPDATE allowed)
```

---

## SÉCURITÉ — ARCHITECTURE DÉFENSE EN PROFONDEUR

### Couche 1 — Réseau

```
✅ HTTPS obligatoire (TLS 1.2+)
✅ CORS strict — whitelist domaines explicites
✅ Rate limiting global (100 req/min par IP)
✅ Helmet.js — headers sécurisés (CSP, HSTS, XSS protection)
✅ Webhook CBS authentifié (secret HMAC ou Bearer token)
```

### Couche 2 — Authentification

```
✅ JWT RS256 (asymétrique) — impossible à forger sans clé privée
✅ JTI (JWT ID) — anti-replay, révocation possible
✅ Access token : 15 min expiry
✅ Refresh token : 7 jours, rotation à chaque usage
✅ MFA TOTP optionnel (enforçable par admin)
✅ bcrypt 12 rounds — résistant aux attaques brute-force GPU
✅ Invitations sécurisées — token unique, expiration 72h
```

### Couche 3 — Autorisation (RBAC)

```
✅ 4 rôles hiérarchiques : ANALYST → SUPERVISOR → COMPLIANCE_OFFICER → ADMIN
✅ 50+ permissions granulaires
✅ Middleware permissionProc sur chaque endpoint tRPC
✅ Dual Control technique — requestedBy ≠ approvedBy (DB constraint)
✅ Ségrégation des données par rôle (ex: analyst ne voit pas /admin, /amld6)
```

### Couche 4 — Données

```
✅ AES-256-GCM pour PII (phone, DOB, adresse, taxId)
✅ IV aléatoire par chiffrement
✅ Auth tag GCM — intégrité cryptographique garantie
✅ Clé PII en variable d'environnement (jamais en DB)
✅ Audit trail immutable — pas d'UPDATE, pas de DELETE
✅ Transactions PostgreSQL ACID pour opérations critiques
```

### Couche 5 — Application

```
✅ Validation Zod sur toutes les entrées API (input + output schemas)
✅ Parameterized queries (Drizzle ORM — pas d'injection SQL possible)
✅ Pas de secrets dans le code (variables d'environnement)
✅ Sanitisation HTML (pas de rendu HTML non contrôlé)
✅ Content Security Policy (Helmet)
```

---

## FLUX PRINCIPAL — DÉTECTION AML (< 200ms)

```
CBS (Core Banking System)
         │
         │ POST /api/webhook/cbs
         │ { customerId, amount, currency, type,
         │   counterparty, counterpartyCountry }
         │
         ▼
    [Auth Middleware]
    Vérifier Bearer token webhook
         │
         ▼
    [AML Rule Engine]
    Évaluer 6 règles FATF en parallèle :
    R1 — HIGH_AMOUNT      (seuil configurable)
    R2 — HIGH_RISK_COUNTRY (liste pays FATF grey/black)
    R3 — STRUCTURING      (pattern < seuil répété)
    R4 — RAPID_MOVEMENT   (vélocité flux sortants)
    R5 — UNUSUAL_PATTERN  (déviation comportementale)
    R6 — SANCTIONS_MATCH  (client en screening PENDING)
         │
         ▼
    [Scoring Engine]
    Calcul riskScore 0–100
    Détermination status :
      NORMAL  (score < 50)
      FLAGGED (score 50–79)
      BLOCKED (score ≥ 80)
         │
         ├─── Si BLOCKED ou score critique
         │         │
         │         ▼
         │    [Alert Service]
         │    Créer alerte CRITICAL en DB
         │    Notifier analyste assigné
         │    Enregistrer dans audit trail
         │
         ▼
    [Response]
    { transactionId, riskScore, status, alertCreated }
    < 200ms total
```

---

## FLUX DUAL CONTROL (Principe 4 Yeux)

```
Compliance Officer A                    Superviseur B
         │                                    │
[Créer/Soumettre SAR]                         │
         │                                    │
[Demander approbation 4-yeux]                 │
  → approvalRequests.create({                 │
      requestedBy: A.id,                      │
      action: "SAR_TRANSMIT",                 │
      entityId: SAR.id                        │
    })                                        │
         │                                    │
         └──────── Notification ──────────────▶
                                    [Voir /approvals]
                                    [Lire contexte SAR]
                                    [Approuver]
                                         │
                              approvalRequests.approve({
                                approvedBy: B.id  ← MUST ≠ A.id
                                note: "..."       ← DB CONSTRAINT
                              })
                                         │
                              ✅ SAR → APPROVED
                              ✅ Audit log entry

Tentative auto-approbation (A = B) :
→ [permissionProc] : requestedBy === userId → FORBIDDEN
→ Message : "Principe des 4 yeux — vous ne pouvez pas approuver votre propre demande"
```

---

## INFRASTRUCTURE DE DÉPLOIEMENT

### Architecture cible (Production)

```
                    [CDN / WAF]
                         │
              [Load Balancer (HTTPS)]
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    [App Server 1]  [App Server 2]  [App Server 3]
    (Node.js)       (Node.js)       (Node.js)
         │               │               │
         └───────────────┼───────────────┘
                         │
              [PostgreSQL Primary]
                    │         │
            [Read Replica] [Backup]
                         │
              [ML Service Container]
              (Python FastAPI)
```

### Options de déploiement clients

| Option | Description | Cible client |
|--------|------------|--------------|
| **Cloud SaaS** | Instance dédiée sur cloud (AWS/GCP EU ou Maroc) | Fintechs, sociétés financement |
| **Cloud privé Maroc** | Hébergé au Maroc (Inwi DC, Maroc Telecom DC) | Banques soucieuses localisation |
| **On-premise** | Déploiement sur infrastructure client | Grandes banques Tier 1 |
| **Hybrid** | App cloud + DB on-premise | Banques exigences souveraineté données |

### Variables d'environnement critiques (exemples)

```bash
DATABASE_URL=postgresql://...
JWT_PRIVATE_KEY=...           # RS256 private key
JWT_PUBLIC_KEY=...            # RS256 public key
PII_ENCRYPTION_KEY=...        # 32 bytes AES key (hex)
CBS_WEBHOOK_SECRET=...        # HMAC secret pour webhooks
ML_SERVICE_URL=http://...     # URL microservice ML
ANRF_API_URL=...              # URL API ANRF (optionnel)
NODE_ENV=production
PORT=3000
```

---

## QUALITÉ ET TESTS

### Métriques actuelles (Mai 2026)

| Indicateur | Valeur | Standard |
|-----------|--------|---------|
| Tests automatisés | 216/216 ✅ | — |
| Erreurs TypeScript | 0 | Strict mode |
| Warnings ESLint | 0 | Strict config |
| Tests unitaires | ✅ Services et utils | — |
| Tests d'intégration | ✅ Endpoints tRPC | — |
| Tests E2E | 🔄 Playwright (roadmap) | — |
| Couverture code | > 80% modules critiques | — |

### Pipeline CI/CD recommandé

```yaml
# .github/workflows/ci.yml (à configurer)
steps:
  - pnpm install
  - pnpm typecheck          # 0 erreurs TypeScript
  - pnpm lint               # 0 warnings ESLint
  - pnpm test               # 216/216 tests
  - pnpm build              # Build production OK
  - docker build            # Image container
  - deploy (si main)        # Deploy staging/prod
```

---

## ROADMAP TECHNIQUE Q3–Q4 2026

| Fonctionnalité | Trimestre | Impact |
|---------------|-----------|--------|
| CBS SDK TypeScript (Temenos/Oracle/Custom) | Q3 2026 | Intégration 3 semaines vs. 3 mois |
| Correspondent Banking Risk Module (FATF R.13) | Q3 2026 | Débloque banques internationales |
| Multi-tenant SaaS (isolation complète) | Q4 2026 | Onboarding autonome |
| GoAML XML export (soumission ANRF automatique) | Q4 2026 | Zéro étape manuelle SAR/STR |
| Travel Rule IVMS-101 (FATF R.16) | Q4 2026 | Segment paiements numériques |
| API publique REST/OpenAPI 3.0 | Q4 2026 | Intégrations partenaires |
| Playwright E2E tests | Q3 2026 | Couverture 95%+ |
| Certification ISO 27001 (préparation) | Q4 2026 | Due diligence banques Tier 1 |

---

## QUESTIONS FRÉQUENTES DUE DILIGENCE

**Q : La plateforme a-t-elle été auditée par un tiers ?**
> Pas encore d'audit tiers formel. L'architecture suit les meilleures pratiques OWASP.
> Un pentest est planifié avant le premier contrat bancaire Tier 1.

**Q : Quelle est la politique de backup des données ?**
> Backup PostgreSQL quotidien avec rétention 30 jours. Point-in-time recovery (PITR)
> disponible sur infrastructure cloud. RTO < 4h, RPO < 1h.

**Q : La solution est-elle compatible avec une certification ISO 27001 ?**
> L'architecture est conçue pour être certifiable. La préparation formelle ISO 27001
> est planifiée en Q4 2026, préalable à la vente aux banques Tier 1.

**Q : Comment gérez-vous les mises à jour réglementaires ?**
> Les règles FATF et BAM sont paramétrables (builder visuel) sans redéploiement.
> Les nouvelles circulaires nécessitent une mise à jour de la configuration
> déployée automatiquement pour tous les clients SaaS.

**Q : Quelle est la scalabilité de la plateforme ?**
> Architecture stateless (Node.js + PostgreSQL) permettant un scaling horizontal.
> Tests de charge réalisés jusqu'à [X] transactions/seconde sur un nœud simple.
> La roadmap multi-tenant Q4 2026 inclut le partitionnement par institution.

---

*Document confidentiel — WatchReg — Mai 2026*
*Architecture v2.5 — Sujet à évolution selon roadmap*
