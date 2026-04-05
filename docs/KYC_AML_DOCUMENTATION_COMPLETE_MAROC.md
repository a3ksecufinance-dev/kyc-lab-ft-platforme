# KYC-AML Lab Platform — Documentation Fonctionnelle & Technique Complète
## Contexte Réglementaire Marocain

**Version** : 2.5 — Avril 2026
**Institution type** : `PAYMENT_INSTITUTION` (établissement de paiement)
**Référentiel réglementaire** : Bank Al-Maghrib (BAM) / ANRF / GAFI / AMLD6

---

## TABLE DES MATIÈRES

1. [Contexte réglementaire marocain](#1-contexte-réglementaire-marocain)
2. [Architecture fonctionnelle](#2-architecture-fonctionnelle)
3. [Architecture technique](#3-architecture-technique)
4. [Schéma de base de données](#4-schéma-de-base-de-données)
5. [Surface API — tRPC (150+ procédures)](#5-surface-api--trpc-150-procédures)
6. [Intégration CBS — Webhook temps réel](#6-intégration-cbs--webhook-temps-réel)
7. [Import de transactions par fichier](#7-import-de-transactions-par-fichier)
8. [Connectors Mobile Money (Orange Money, Wave, CIH)](#8-connectors-mobile-money-orange-money-wave-cih)
9. [Moteur AML & gestion des règles](#9-moteur-aml--gestion-des-règles)
10. [Screening sanctions & PEP](#10-screening-sanctions--pep)
11. [Gestion des wallets & tiers KYC](#11-gestion-des-wallets--tiers-kyc)
12. [Rapports réglementaires BAM / GoAML](#12-rapports-réglementaires-bam--goaml)
13. [Matrice de droits d'accès](#13-matrice-de-droits-daccès)
14. [Matrice de tests complète](#14-matrice-de-tests-complète)
15. [Déploiement & configuration](#15-déploiement--configuration)
16. [Glossaire](#16-glossaire)

---

## 1. Contexte Réglementaire Marocain

### 1.1 Cadre légal applicable

| Texte | Objet | Impact plateforme |
|-------|-------|-------------------|
| **Loi 43-05** (modifiée 2021) | Lutte contre le blanchiment et le financement du terrorisme | Obligations KYC, gel d'avoirs, déclaration de soupçon |
| **Circulaire BAM 5/W/2017** | Obligations de vigilance des établissements de crédit | Profil de risque client, revue périodique, EDD PEP |
| **Circulaire BAM 4/W/2019** | Etablissements de paiement — agrément et surveillance | Portefeuilles électroniques, tiers KYC allégé/standard/renforcé |
| **Instruction BAM n°1/DIR/2023** | Reporting prudentiel des établissements de paiement | Rapports BAM mensuels/trimestriels/annuels |
| **Décret 2-14-652** | ANRF (Autorité nationale du renseignement financier) | Déclaration de soupçon via GoAML |
| **FATF Recommandations 2023** | Normes internationales LCB-FT | 40 recommandations — risk-based approach |
| **GDPR / Loi 09-08** | Protection des données personnelles | Droit à l'effacement, chiffrement PII, audit trail |

### 1.2 Seuils réglementaires Maroc (MAD)

| Seuil | Valeur | Base légale |
|-------|--------|-------------|
| Identification obligatoire (transaction unique) | 100 000 MAD | Circulaire BAM 5/W/2017 art.12 |
| Déclaration systématique de soupçon (STR) | > 150 000 MAD | Loi 43-05 art.15 |
| KYC Allégé — plafond transaction | 5 000 MAD / 20 000 MAD/mois | Circulaire BAM 4/W/2019 |
| KYC Standard — plafond transaction | 50 000 MAD / 200 000 MAD/mois | Circulaire BAM 4/W/2019 |
| KYC Renforcé (EDD) — plafond transaction | 500 000 MAD / 2 000 000 MAD/mois | Circulaire BAM 4/W/2019 |
| Détection structuration | 3 séries < 30 000 MAD en 24h | FATF Rec.7 |
| Gel d'avoirs immédiat | Sur liste ANRF/ONU | Décret 2-14-652 |
| Délai déclaration STR à l'ANRF | 24h après détection | Loi 43-05 art.16 |
| Délai déclaration SAR à l'ANRF | 72h après suspicion | Loi 43-05 art.17 |
| Revue périodique PEP/HIGH | 90 jours | Circulaire BAM 5/W/2017 art.22 |
| Revue périodique LOW/MEDIUM | 180-365 jours | Circulaire BAM 5/W/2017 art.22 |
| Conservation des documents | 10 ans | Loi 43-05 art.35 |

### 1.3 Listes de sanctions applicables au Maroc

| Liste | Fournisseur | Fréquence MAJ | Champ d'application |
|-------|-------------|---------------|---------------------|
| OFAC SDN | US Treasury | Quotidien | Transactions USD / entités américaines |
| Sanctions UE | Commission européenne | Quotidien | Transactions EUR / entités EU |
| Résolutions ONU | Conseil de sécurité | Hebdomadaire | Universal — toutes devises |
| UK HM Treasury | His Majesty's Treasury | Quotidien | Transactions GBP |
| PEP OpenSanctions | OpenSanctions.org | Hebdomadaire | Personnes politiquement exposées |
| Liste BAM / ANRF | Bank Al-Maghrib | Variable | Gel avoirs marocains |
| Blocklist custom | Usage interne | Temps réel | Entités identifiées localement |

### 1.4 Flux de conformité cible

```
Client ──► Onboarding KYC ──► Screening sanctions/PEP ──► Profil de risque
                │                        │                        │
                ▼                        ▼                        ▼
         Documents vérifiés       Score de correspondance    LOW/MED/HIGH/CRIT
         eKYC (OCR + liveness)    (seuil 80% MATCH)
                │
                ▼
         Transaction ──► Moteur AML (11+ règles) ──► Alerte générée
                │                │                         │
                ▼                ▼                         ▼
          ML Scoring        Règle déclenchée          Analyst revoit
         (fire-and-forget)  ruleExecution log         Dossier/rapport
                                                           │
                                                           ▼
                                                    SAR/STR → ANRF GoAML
```

---

## 2. Architecture Fonctionnelle

### 2.1 Modules fonctionnels

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        KYC-AML LAB PLATFORM v2.5                             │
├─────────────────┬────────────────┬──────────────────┬────────────────────────┤
│  ONBOARDING     │  SURVEILLANCE  │  INVESTIGATION   │  REPORTING             │
│                 │                │                  │                        │
│ • Création      │ • Moteur AML   │ • Alertes        │ • SAR / STR            │
│   client        │   11 règles    │ • Dossiers       │ • GoAML XML            │
│ • KYC docs      │ • ML scoring   │   compliance     │ • BAM mensuel          │
│ • eKYC OCR      │ • Screening    │ • Chronologie    │ • AMLD6 KPIs           │
│ • UBO           │   sanctions    │ • Décision 4-yeux│ • Export PDF           │
│ • EDD renforcé  │ • PEP watch    │                  │                        │
│ • pKYC          │ • Wallets KYC  │                  │                        │
├─────────────────┴────────────────┴──────────────────┴────────────────────────┤
│  INTÉGRATIONS EXTERNES                                                        │
│                                                                               │
│ • CBS Webhook (HMAC-SHA256)      • Orange Money webhook                      │
│ • Import fichier CSV / MT940     • Wave webhook                              │
│ • Onfido / SumSub eKYC           • CIH Mobile webhook                       │
│ • ANRF GoAML (transmission)      • HashiCorp Vault (secrets)                │
│ • S3 / MinIO (documents)         • ML Service Python (scoring)              │
│ • Prometheus (métriques)         • Redis (cache, rate-limit, dédup)         │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Types d'institutions supportées

| Flag | CLASSIC_BANK | MICROFINANCE | PAYMENT_INSTITUTION |
|------|:---:|:---:|:---:|
| Portefeuilles mobiles (`wallets`) | — | ✓ | ✓ |
| Comptes agents (`agentAccounts`) | — | ✓ | ✓ |
| Types mobiles de transactions | — | ✓ | ✓ |
| KYC par tiers wallet | — | ✓ | ✓ |
| EDD renforcé | — | — | ✓ |
| Règles AML wallet | — | ✓ | ✓ |
| Rapports BAM | — | — | ✓ |
| Connecteurs mobile money | — | — | ✓ |
| Réseau d'agents | — | ✓ | ✓ |

> **Configuration** : Variable d'environnement `INSTITUTION_TYPE=PAYMENT_INSTITUTION`

### 2.3 Rôles utilisateurs

| Rôle | Niveau | Responsabilité principale |
|------|--------|--------------------------|
| `analyst` | 1 | Onboarding, saisie transactions, suivi alertes/dossiers |
| `supervisor` | 2 | Validation, escalade, blocage transactions, gestion règles AML |
| `compliance_officer` | 3 | Approbation rapports, transmission ANRF, gestion listes |
| `admin` | 4 | Gestion utilisateurs, configuration système, retrain ML |

### 2.4 Cycle de vie d'un client

```
PENDING ──[soumission docs]──► IN_REVIEW ──[approbation superviseur]──► APPROVED
                                    │
                              [rejet / docs invalides]
                                    │
                                    ▼
                               REJECTED ──[re-soumission]──► IN_REVIEW

APPROVED ──[expiration KYC]──► EXPIRED ──[renouvellement]──► IN_REVIEW
```

### 2.5 Cycle de vie d'une alerte

```
[Transaction créée]
       │
       ▼
[Moteur AML évalue 11+ règles + ML scoring]
       │
   [Règle déclenchée]
       │
       ▼
    OPEN ──[assignation analyst]──► IN_REVIEW
       │                                │
  [escalade]                       [résolution]
       │                                │
       ▼                         ┌──────┴──────┐
  ESCALATED                   CLOSED     FALSE_POSITIVE

OPEN/IN_REVIEW ──[escalade supervisor]──► ESCALATED
```

### 2.6 Cycle de vie d'un rapport SAR/STR

```
[Analyst crée rapport]
       │
       ▼
    DRAFT ──[submitForReview]──► REVIEW ──[supervisor reject]──► DRAFT
                                    │
                          [compliance_officer approve]
                                    │
                                    ▼
                               SUBMITTED ──[transmit]──► ANRF GoAML
                                    │
                             [downloadXml]
                                    │
                              XML GoAML 2.0
```

---

## 3. Architecture Technique

### 3.1 Stack technologique

| Couche | Technologie | Version |
|--------|-------------|---------|
| **Runtime** | Node.js | 20+ (ES modules) |
| **Framework serveur** | Express | 4.21 |
| **RPC** | tRPC | 11.6 |
| **ORM** | Drizzle | 0.44.5 |
| **Base de données** | PostgreSQL | 14+ |
| **Cache / Rate-limit** | Redis (ioredis) | 5.6 |
| **Auth** | JWT (jose) + bcryptjs | — |
| **Validation** | Zod | 4.1 |
| **Logging** | Pino | 9.6 |
| **PDF** | pdfmake | 0.3 |
| **XML GoAML** | xml2js | 0.6 |
| **Métriques** | prom-client (Prometheus) | — |
| **Framework frontend** | React | 19.2 |
| **Routing frontend** | Wouter | 3.7 |
| **State async** | React Query (TanStack) | 5.90 |
| **Client tRPC** | @trpc/react-query | 11.6 |
| **UI** | Radix UI + Tailwind CSS | 4.1 |
| **Charts** | Recharts | 2.15 |
| **Icônes** | Lucide React | — |
| **Toasts** | Sonner | — |
| **Tests** | Vitest | 2.1 |
| **Tests E2E** | Playwright | 1.58 |
| **Bundler** | Vite 7.1 + esbuild | — |
| **Package manager** | pnpm | 10.4 |

### 3.2 Arborescence du projet

```
kyc-lab-ft-platforme/
├── client/                     # Application React (SPA)
│   └── src/
│       ├── pages/              # 21 pages (LoginPage, CustomersPage, …)
│       ├── components/         # Composants partagés (AppLayout, Sidebar, …)
│       ├── context/            # AuthContext, InstitutionContext
│       ├── lib/                # trpc.ts, auth.ts, utils.ts
│       └── main.tsx
├── server/                     # API Node.js
│   ├── _core/                  # Infrastructure (db, redis, trpc, auth, env)
│   └── modules/                # 19 modules fonctionnels
│       ├── auth/
│       ├── customers/          # + pkyc, enhanced-onboarding
│       ├── transactions/       # + import, webhook
│       ├── alerts/
│       ├── cases/
│       ├── aml/                # + rules engine, backtest, ml-scoring, jurisdictions
│       ├── screening/
│       ├── reports/            # + bam
│       ├── documents/
│       ├── wallets/
│       ├── agents/
│       ├── network/
│       ├── connectors/         # Orange Money, Wave, CIH Mobile
│       ├── dashboard/
│       ├── institution/
│       └── admin/
├── shared/                     # Types partagés (frontend + backend)
│   ├── institution.types.ts
│   ├── types.ts
│   ├── permissions.ts
│   └── const.ts
├── drizzle/                    # Schéma et migrations PostgreSQL
│   ├── schema.ts
│   └── migrations/
├── e2e/                        # Tests Playwright
├── docs/                       # Documentation
├── .env                        # Variables d'environnement
└── docker-compose.yml
```

### 3.3 Flux de sécurité

```
Request HTTP
    │
    ▼
Rate Limiter (100 req/60s par IP)
    │
    ▼
CORS Check (CORS_ORIGINS)
    │
    ▼
Express middleware (body parser — rawBody préservé pour HMAC)
    │
    ▼
tRPC Handler
    │
    ▼
createContext → verifyAccessToken(JWT)
    │
    ▼
requireRole middleware (hiérarchie : user<analyst<supervisor<compliance<admin)
    │
    ▼
Procédure métier (validation Zod)
    │
    ▼
Service → Repository → PostgreSQL (Drizzle)
    │
    ▼
Audit log (action, userId, ip, entityType, entityId)
    │
    ▼
Réponse JSON
```

### 3.4 Chiffrement et sécurité des données

| Donnée | Méthode | Clé |
|--------|---------|-----|
| Mots de passe | bcryptjs (10 rounds) | — |
| Secrets MFA (TOTP) | AES-256-GCM | `MFA_ENCRYPTION_KEY` |
| PII sensibles (email, téléphone, DDN) | AES-256-GCM | `PII_ENCRYPTION_KEY` |
| Tokens JWT | HMAC-SHA256 | `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` |
| Signature webhook CBS | HMAC-SHA256 | `WEBHOOK_SECRET` |
| Backup codes MFA | Stockés hashés | — |
| Secrets prod | HashiCorp Vault (optionnel) | `VAULT_TOKEN` |

---

## 4. Schéma de Base de Données

### 4.1 Vue d'ensemble (19 tables)

```
users ◄────────────────────────────────────────────────────────┐
  │                                                             │
  │ (analyst, createdBy, …)                                     │
  ▼                                                             │
customers ──────────────────────────────────────────────────┐  │
  │                                                          │  │
  ├──► documents                                             │  │
  ├──► ubos                                                  │  │
  ├──► screening_results                                     │  │
  ├──► wallets ──► kyc_tier_snapshots                        │  │
  ├──► pkyc_snapshots                                        │  │
  ├──► transactions ──► alerts ──► cases ──► case_timeline   │  │
  │         │                │         │                     │  │
  │         ▼                │         └──► reports ─────────┘  │
  │    aml_rule_executions   │                                   │
  │         │                └──► agent_accounts ───────────────┘
  │         ▼
  │    aml_rules ──► aml_rule_feedback
  │
  └──► jurisdiction_profiles
       audit_logs
```

### 4.2 Détail des tables

#### Table `customers`

| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | serial | PK | Identifiant interne |
| `customerId` | varchar(50) | UNIQUE | ID externe (KYC-XXXXXXXX) |
| `firstName` | varchar(100) | NOT NULL | Prénom |
| `lastName` | varchar(100) | NOT NULL | Nom |
| `email` | varchar(320) | — | Email (chiffré PII) |
| `phone` | varchar(50) | — | Téléphone |
| `dateOfBirth` | date | — | Date de naissance |
| `nationality` | varchar(3) | — | Code ISO 3166-1 alpha-2 |
| `residenceCountry` | varchar(3) | — | Pays de résidence |
| `address` | text | — | Adresse postale |
| `city` | varchar(100) | — | Ville |
| `profession` | varchar(100) | — | Profession |
| `employer` | varchar(100) | — | Employeur |
| `sourceOfFunds` | varchar(200) | — | Origine des fonds |
| `monthlyIncome` | numeric(15,2) | — | Revenu mensuel (MAD) |
| `customerType` | enum | NOT NULL | INDIVIDUAL/CORPORATE/PEP/FOREIGN/AGENT/MERCHANT |
| `kycStatus` | enum | NOT NULL | PENDING/IN_REVIEW/APPROVED/REJECTED/EXPIRED |
| `riskLevel` | enum | NOT NULL | LOW/MEDIUM/HIGH/CRITICAL |
| `riskScore` | int (0-100) | NOT NULL | Score numérique |
| `pepStatus` | boolean | default false | Personne politiquement exposée |
| `sanctionStatus` | enum | NOT NULL | CLEAR/MATCH/REVIEW/PENDING |
| `frozenAt` | timestamptz | — | Date gel compte |
| `frozenReason` | text | — | Motif gel |
| `frozenBy` | FK → users | — | Auteur du gel |
| `erasureRequestedAt` | timestamptz | — | Date demande effacement RGPD |
| `erasureCompletedAt` | timestamptz | — | Date effectivité effacement |
| `lastReviewDate` | date | — | Dernière revue KYC |
| `nextReviewDate` | date | — | Prochaine revue KYC |
| `assignedAnalyst` | FK → users | — | Analyste responsable |
| `notes` | text | — | Notes internes |
| `createdAt` / `updatedAt` | timestamptz | — | Horodatage |

#### Table `transactions`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | — |
| `transactionId` | varchar UNIQUE | TXN-XXXXXXXXXX |
| `customerId` | FK → customers | — |
| `amount` | numeric(15,2) | Montant |
| `currency` | varchar(3) | ISO 4217 (MAD, EUR, USD…) |
| `transactionType` | enum | TRANSFER/DEPOSIT/WITHDRAWAL/PAYMENT/EXCHANGE/AGENT_CASH_IN/AGENT_CASH_OUT/MOBILE_MONEY_IN/MOBILE_MONEY_OUT/P2P_TRANSFER/MERCHANT_PAYMENT/BILL_PAYMENT/BULK_DISBURSEMENT |
| `channel` | enum | ONLINE/MOBILE/BRANCH/ATM/API/AGENT/USSD/ORANGE_MONEY/WAVE/CIH_MOBILE |
| `transactionStatus` | enum | PENDING/COMPLETED/FLAGGED/BLOCKED/REVERSED |
| `counterparty` | varchar | Nom contrepartie |
| `counterpartyCountry` | varchar(3) | Pays contrepartie |
| `counterpartyBank` | varchar | Banque contrepartie |
| `purpose` | varchar | Motif de la transaction |
| `isSuspicious` | boolean | Marquée suspecte par AML |
| `riskScore` | int | Score calculé par ML/AML |
| `riskRules` | jsonb | Règles AML déclenchées |
| `flagReason` | text | Motif de blocage |
| `walletId` | FK → wallets | — |
| `agentId` | FK → agent_accounts | — |
| `transactionDate` | timestamptz | Date de la transaction |
| `completedAt` | timestamptz | Date de clôture |

#### Table `wallets` (PAYMENT_INSTITUTION / MICROFINANCE)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | — |
| `customerId` | FK → customers | — |
| `provider` | varchar | Orange Money / Wave / CIH Mobile / … |
| `externalId` | varchar | ID côté opérateur |
| `phoneNumber` | varchar | Numéro de téléphone |
| `msisdn` | varchar | MSISDN international |
| `currency` | varchar(3) | MAD par défaut |
| `kycTier` | enum | ALLEGED / STANDARD / RENFORCE |
| `isDormant` | boolean | Inactif > seuil |
| `dormantSince` | timestamptz | — |
| `balance` | numeric(15,2) | Solde en temps réel |

#### Table `jurisdiction_profiles`

| Colonne | Type | Description |
|---------|------|-------------|
| `jurisdictionCode` | varchar(10) UNIQUE | Code pays (MA, FR, US, …) |
| `thresholdSingleTx` | numeric | Seuil transaction unique (MAD/devise) |
| `thresholdStructuring` | numeric | Seuil structuration |
| `structuringWindowH` | int | Fenêtre détection structuration (heures) |
| `cashThreshold` | numeric | Seuil espèces |
| `strMandatoryAbove` | numeric | STR obligatoire au-dessus de ce montant |
| `strDelayHours` | int | Délai max déclaration STR (heures) |
| `sarDelayHours` | int | Délai max déclaration SAR (heures) |
| `enhancedDdPep` | boolean | EDD obligatoire pour PEP |
| `enhancedDdHighRisk` | boolean | EDD obligatoire pour HIGH/CRITICAL |
| `regulatorName` | varchar | ANRF / TRACFIN / FinCEN … |
| `goamlEntityType` | varchar | Type entité GoAML |
| `reportingFormat` | varchar | GOAML_2 (défaut) |
| `coveredCountries` | jsonb | Liste de pays couverts |

---

## 5. Surface API — tRPC (150+ procédures)

### 5.1 Module `auth`

| Procédure | Garde | Type | Description |
|-----------|-------|------|-------------|
| `auth.login` | public | mutation | Connexion avec email/password → JWT (+ étape MFA si activé) |
| `auth.mfaLoginComplete` | public | mutation | Validation code TOTP (étape 2) |
| `auth.register` | public | mutation | Inscription (rôle `user` par défaut) |
| `auth.refresh` | public | mutation | Renouvellement access token |
| `auth.logout` | protégé | mutation | Invalidation tokens |
| `auth.me` | protégé | query | Profil utilisateur courant |
| `auth.changePassword` | protégé | mutation | Changement de mot de passe |
| `auth.mfaSetup` | protégé | mutation | Génération secret TOTP + QR code |
| `auth.mfaConfirm` | protégé | mutation | Activation MFA + backup codes |
| `auth.mfaVerify` | public | mutation | Vérification code MFA |
| `auth.mfaDisable` | protégé | mutation | Désactivation MFA |
| `auth.mfaStatus` | protégé | query | État MFA (activé, codes restants) |
| `auth.mfaRegenerateBackup` | protégé | mutation | Nouveaux codes de secours |
| `auth.requestReset` | public | mutation | Demande réinitialisation mot de passe |
| `auth.confirmReset` | public | mutation | Application du token de réinitialisation |

### 5.2 Module `customers`

| Procédure | Garde | Type | Input | Output |
|-----------|-------|------|-------|--------|
| `customers.list` | analyst | query | `{ page, limit, search?, riskLevel?, kycStatus?, country?, customerType? }` | `PaginatedResponse<Customer>` |
| `customers.getById` | analyst | query | `{ id }` | `Customer` |
| `customers.create` | analyst | mutation | `{ firstName, lastName, email?, phone?, dateOfBirth?, nationality?, residenceCountry?, address?, city?, profession?, employer?, sourceOfFunds?, monthlyIncome?, customerType }` | `Customer` |
| `customers.update` | analyst | mutation | `{ id, kycStatus?, riskLevel?, riskScore?, pepStatus?, notes?, assignedAnalyst?, nextReviewDate? }` | `Customer` |
| `customers.calculateRiskScore` | analyst | mutation | `{ id }` | `{ riskScore, riskLevel, factors[] }` |
| `customers.stats` | analyst | query | — | `CustomerStatsModel` |
| `customers.getDocuments` | analyst | query | `{ customerId }` | `Document[]` |
| `customers.getUBOs` | analyst | query | `{ customerId }` | `UBO[]` |
| `customers.addUBO` | analyst | mutation | `{ customerId, firstName, lastName, nationality?, dateOfBirth?, ownershipPercentage?, role?, pepStatus }` | `UBO` |
| `customers.getScreening` | analyst | query | `{ customerId }` | `ScreeningResult[]` |
| `customers.getTransactions` | analyst | query | `{ customerId, limit }` | `Transaction[]` |
| `customers.freeze` | supervisor | mutation | `{ id, reason }` | `Customer` |
| `customers.unfreeze` | supervisor | mutation | `{ id }` | `Customer` |
| `customers.requestErasure` | analyst | mutation | `{ id }` | `Customer` |
| `customers.processErasure` | compliance | mutation | `{ id }` | `Customer` |

### 5.3 Module `transactions`

| Procédure | Garde | Type | Input | Output |
|-----------|-------|------|-------|--------|
| `transactions.list` | analyst | query | `{ page, limit, customerId?, status?, isSuspicious?, dateFrom?, dateTo?, amountMin?, amountMax?, search?, transactionType? }` | `PaginatedResponse<Transaction>` |
| `transactions.getById` | analyst | query | `{ id }` | `Transaction` |
| `transactions.create` | analyst | mutation | `{ customerId, amount, currency, transactionType, channel?, counterparty?, counterpartyCountry?, counterpartyBank?, purpose? }` | `Transaction` |
| `transactions.complete` | analyst | mutation | `{ id }` | `Transaction` |
| `transactions.block` | supervisor | mutation | `{ id, reason }` | `Transaction` |
| `transactions.stats` | analyst | query | — | `TransactionStatsModel` |
| `transactions.getAlertsByCustomer` | analyst | query | `{ customerId }` | `Alert[]` |
| `transactions.importFile` | supervisor | mutation | `{ customerId, content, dryRun }` | `{ success, parseResult, preview, inserted, insertErrors }` |

### 5.4 Module `alerts`

| Procédure | Garde | Input | Output |
|-----------|-------|-------|--------|
| `alerts.list` | analyst | `{ page, limit, status?, priority?, alertType?, customerId? }` | `PaginatedResponse<Alert>` |
| `alerts.getById` | analyst | `{ id }` | `Alert` |
| `alerts.assign` | analyst | `{ id, userId }` | `Alert` |
| `alerts.resolve` | analyst | `{ id, resolution, note }` | `Alert` |
| `alerts.stats` | analyst | — | `AlertStatsModel` |

### 5.5 Module `aml-rules`

| Procédure | Garde | Description |
|-----------|-------|-------------|
| `amlRules.list` | analyst | Liste toutes les règles |
| `amlRules.getById` | analyst | Détail d'une règle |
| `amlRules.stats` | analyst | Statistiques d'exécution (trigs, FP, score moyen) |
| `amlRules.recentExecutions` | analyst | Derniers déclenchements |
| `amlRules.create` | supervisor | Créer nouvelle règle |
| `amlRules.update` | supervisor | Modifier une règle |
| `amlRules.toggleStatus` | supervisor | ACTIVE / INACTIVE / TESTING |
| `amlRules.delete` | admin | Supprimer définitivement |
| `amlRules.seedDefaults` | admin | Injecter les 11 règles BAM par défaut |
| `amlRules.backtest` | supervisor | Simulation sur historique (N jours, M transactions) |
| `amlRules.feedback` | analyst | Signaler faux positif (auto-dégrade si FP > 20%) |

### 5.6 Module `jurisdictions`

| Procédure | Garde | Description |
|-----------|-------|-------------|
| `jurisdictions.list` | analyst | Liste des profils de juridiction |
| `jurisdictions.getById` | analyst | Détail par id |
| `jurisdictions.effectiveThresholds` | analyst | Seuils effectifs par code pays (ex: `MA`, `FR`) |
| `jurisdictions.upsert` | supervisor | Créer ou mettre à jour un profil |
| `jurisdictions.toggle` | supervisor | Activer / désactiver |

### 5.7 Module `screening`

| Procédure | Garde | Description |
|-----------|-------|-------------|
| `screening.run` | analyst | Screening immédiat d'un client |
| `screening.getByCustomer` | analyst | Historique screening d'un client |
| `screening.getPending` | compliance | Matches en attente de revue |
| `screening.review` | compliance | Valider/rejeter un match |
| `screening.listsStatus` | supervisor | Santé des 7 listes (fraîcheur, nombre d'entrées) |
| `screening.listsHealth` | analyst | Alerte si liste > 36h sans MAJ |
| `screening.forceRefresh` | admin | Re-téléchargement immédiat de toutes les listes |
| `screening.getCustomList` | supervisor | Blocklist interne |
| `screening.addCustomEntry` | supervisor | Ajouter à la blocklist |
| `screening.removeCustomEntry` | supervisor | Retirer de la blocklist |
| `screening.batchScreen` | compliance | Re-screening asynchrone par filtre |
| `screening.batchStatus` | compliance | Statut du job de batch |

### 5.8 Module `cases`

| Procédure | Garde | Description |
|-----------|-------|-------------|
| `cases.list` | analyst | Liste paginée avec filtres |
| `cases.getById` | analyst | Dossier complet + timeline |
| `cases.create` | analyst | Ouvrir un nouveau dossier |
| `cases.updateStatus` | analyst | Changer le statut |
| `cases.assign` | supervisor | Assigner analyste + superviseur |
| `cases.addFindings` | analyst | Ajouter des constatations |
| `cases.decide` | supervisor | Décision finale (principe des 4 yeux) |
| `cases.getTimeline` | analyst | Historique des actions |
| `cases.stats` | analyst | Compteurs par statut/sévérité |

### 5.9 Module `reports`

| Procédure | Garde | Description |
|-----------|-------|-------------|
| `reports.list` | analyst | Liste paginée |
| `reports.getById` | analyst | Détail |
| `reports.createSar` | analyst | Créer un SAR (déclaration d'activité suspecte) |
| `reports.createStr` | analyst | Créer un STR (déclaration transaction structurée) |
| `reports.updateContent` | analyst | Modifier contenu (DRAFT/REJECTED seulement) |
| `reports.submitForReview` | analyst | DRAFT → REVIEW |
| `reports.reject` | supervisor | REVIEW → DRAFT avec feedback |
| `reports.approve` | compliance | REVIEW → SUBMITTED |
| `reports.transmit` | compliance | Envoi GoAML à l'ANRF |
| `reports.downloadXml` | compliance | Téléchargement XML GoAML 2.0 |
| `reports.transmissionStatus` | analyst | Statut de transmission |
| `reports.amld6Stats` | permission | KPIs AMLD6 |
| `reports.amld6ExportCsv` | permission | Export CSV KPIs |
| `reports.exportReportPdf` | compliance | PDF du SAR/STR |
| `reports.exportKycPdf` | compliance | Fiche KYC client |
| `reports.amld6ExportPdf` | permission | Rapport AMLD6 PDF |

### 5.10 Module `wallets` (PAYMENT_INSTITUTION / MICROFINANCE)

| Procédure | Garde | Description |
|-----------|-------|-------------|
| `wallets.list` | analyst | Liste paginée des portefeuilles |
| `wallets.byCustomer` | analyst | Portefeuilles d'un client |
| `wallets.get` | analyst | Détail d'un portefeuille |
| `wallets.create` | supervisor | Créer portefeuille mobile |
| `wallets.promoteTier` | supervisor | Passage à un tier KYC supérieur |
| `wallets.tierHistory` | analyst | Historique des passages de tier |
| `wallets.reactivate` | supervisor | Réactiver un portefeuille dormant |
| `wallets.stats` | analyst | KPIs portefeuilles |

### 5.11 Module `documents`

| Procédure | Garde | Description |
|-----------|-------|-------------|
| `documents.getByCustomer` | analyst | Documents d'un client |
| `documents.getById` | analyst | Détail + URL signée (S3) |
| `documents.stats` | analyst | Compteurs par statut (customerId) |
| `documents.verify` | supervisor | Vérification manuelle → VERIFIED |
| `documents.reject` | supervisor | Rejet avec motif → REJECTED |
| `documents.remove` | compliance | Suppression définitive |

### 5.12 Module `dashboard`

| Procédure | Garde | Description |
|-----------|-------|-------------|
| `dashboard.overview` | analyst | Tous les KPIs en 1 appel (cache 30s) |
| `dashboard.recentActivity` | analyst | Feed 24h (alertes, dossiers, transactions) |
| `dashboard.riskDistribution` | analyst | Distribution par niveau de risque |
| `dashboard.trends` | analyst | Séries temporelles (N jours) |
| `dashboard.complianceKpis` | supervisor | KPIs de management (alertes critiques, dossiers en attente…) |

### 5.13 Module `admin`

| Procédure | Garde | Description |
|-----------|-------|-------------|
| `admin.listUsers` | admin | Gestion des utilisateurs |
| `admin.getUser` | admin | Détail utilisateur |
| `admin.createUser` | admin | Créer un compte |
| `admin.updateUser` | admin | Modifier rôle / département / statut |
| `admin.resetPassword` | admin | Réinitialiser le mot de passe |
| `admin.listAuditLogs` | supervisor | Journal d'audit paginé |
| `admin.auditStats` | supervisor | Statistiques du journal |
| `admin.mlRetrainStatus` | admin | Statut du modèle ML |
| `admin.mlRetrain` | admin | Forcer le ré-entraînement |

---

## 6. Intégration CBS — Webhook Temps Réel

### 6.1 Description

Le **Core Banking System (CBS)** de l'établissement envoie les transactions en temps réel à la plateforme via un **webhook HTTP sécurisé par HMAC-SHA256**. Dès réception, la transaction est créée en base, le moteur AML est déclenché, et le score ML est calculé.

### 6.2 Endpoint

```
POST /webhooks/transactions
Content-Type: application/json
X-Webhook-Signature: sha256=<hmac_hex>
```

### 6.3 Payload CBS (JSON)

```json
{
  "transactionId":       "CBS-TXN-20260405-001234",
  "customerId":          42,
  "amount":              "75000.00",
  "currency":            "MAD",
  "transactionType":     "TRANSFER",
  "channel":             "BRANCH",
  "counterparty":        "Mohammed Alami",
  "counterpartyCountry": "MA",
  "counterpartyBank":    "CIH Bank",
  "purpose":             "Achat immobilier",
  "transactionDate":     "2026-04-05T10:30:00Z",
  "timestamp":           1743847800000
}
```

#### Champs obligatoires

| Champ | Type | Description |
|-------|------|-------------|
| `transactionId` | string | Identifiant unique côté CBS (déduplication) |
| `customerId` | number | ID du client dans la plateforme KYC |
| `amount` | string | Montant décimal ("75000.00") |
| `transactionType` | string | TRANSFER / DEPOSIT / WITHDRAWAL / PAYMENT / EXCHANGE / OTHER |
| `timestamp` | number | Unix ms — tolérance ±5 minutes |

#### Champs optionnels

| Champ | Type | Description |
|-------|------|-------------|
| `currency` | string | ISO 4217 — défaut : EUR |
| `channel` | string | ONLINE / MOBILE / BRANCH / ATM / API / WIRE / OTHER |
| `counterparty` | string | Nom de la contrepartie |
| `counterpartyCountry` | string | ISO 3166-1 alpha-2 |
| `counterpartyBank` | string | Nom de la banque contrepartie |
| `purpose` | string | Motif de la transaction |
| `transactionDate` | string | ISO 8601 — défaut : now |

#### Mapping des types vers l'énumération interne

| Valeur CBS | Valeur interne |
|-----------|---------------|
| `TRANSFER` | `TRANSFER` |
| `DEPOSIT` | `DEPOSIT` |
| `WITHDRAWAL` | `WITHDRAWAL` |
| `PAYMENT` | `PAYMENT` |
| `EXCHANGE` | `EXCHANGE` |
| `OTHER` | `TRANSFER` (défaut) |
| Canal `WIRE` | `API` (défaut) |
| Canal `OTHER` | `API` (défaut) |

### 6.4 Signature HMAC

```bash
# Génération côté CBS
BODY='{"transactionId":"CBS-001","customerId":42,"amount":"1000.00","transactionType":"TRANSFER","timestamp":1743847800000}'
SIGNATURE="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/SHA2-256(stdin)= //')"
# ou en one-liner :
SIGNATURE="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "votre_secret_ici" -hex | awk '{print $2}')"

curl -X POST https://kyc-lab.exemple.com/webhooks/transactions \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$BODY"
```

### 6.5 Réponses

#### Succès (200)
```json
{
  "success":       true,
  "transactionId": "TXN-3Xk9Lm7Nqp",
  "riskScore":     72,
  "isSuspicious":  true
}
```

#### Transaction dupliquée (200)
```json
{
  "success":   true,
  "duplicate": true
}
```

#### Erreur signature (401)
```json
{ "error": "Signature invalide" }
```

#### Timestamp hors tolérance (400)
```json
{ "error": "Timestamp hors tolérance (±5 min)" }
```

#### Client non trouvé (500)
```json
{ "error": "Customer not found: 999" }
```

#### Client KYC rejeté (500)
```json
{ "error": "Customer KYC is not approved" }
```

### 6.6 Garanties d'idempotence

- Chaque `transactionId` CBS est stocké dans Redis avec TTL 24h
- Un deuxième envoi du même `transactionId` retourne `{ duplicate: true }` sans créer de doublon
- Clé Redis : `webhook:dedup:{transactionId}`

### 6.7 Traitement post-réception

```
CBS Webhook reçu
      │
      ├─ [1] Vérification HMAC-SHA256
      ├─ [2] Validation fraîcheur timestamp (±5 min)
      ├─ [3] Déduplication Redis (24h)
      ├─ [4] Validation champs obligatoires
      │
      ▼
createTransaction(payload)
      │
      ├─ [5] Vérification client (KYC APPROVED requis)
      ├─ [6] Génération transactionId interne (TXN-XXXXXXXXXX)
      ├─ [7] INSERT en base → status=PENDING
      │
      ├─ [8] Moteur AML dynamique (11+ règles configurables)
      │         └─ Si règle déclenchée → INSERT alert + UPDATE isSuspicious=true
      │
      ├─ [9] ML scoring asynchrone (fire-and-forget)
      │         └─ POST ML_SERVICE_URL/score → UPDATE riskScore
      │
      └─ [10] Audit log (action=TRANSACTION_CBS_INGESTED)
```

---

## 7. Import de Transactions par Fichier

### 7.1 Formats supportés

| Format | Extension | Description |
|--------|-----------|-------------|
| **CSV générique** | `.csv`, `.txt` | Séparateur auto-détecté (`,`, `;`, `|`, `\t`) — colonnes en-têtes libres |
| **SWIFT MT940** | `.mt940`, `.txt` | Relevé bancaire standard — tags `:20:`, `:25:`, `:61:`, `:86:` |

### 7.2 Import via API tRPC

```typescript
// Appel depuis le frontend ou depuis un script
await trpc.transactions.importFile.mutate({
  customerId: 42,
  content:    fileContent,  // string (texte brut du fichier)
  dryRun:     true,         // true = preview sans insertion en base
});
```

**Réponse `dryRun: true`** :
```json
{
  "success":    true,
  "parseResult": {
    "format": "csv",
    "total":  150,
    "parsed": 148,
    "skipped": 2,
    "errors": [
      { "line": 45, "error": "Montant invalide : \"abc\"" },
      { "line": 112, "error": "Date invalide : \"32/13/2026\"" }
    ]
  },
  "preview": [
    {
      "externalRef": "A3F7B2C1D4E5",
      "amount":      "5000.00",
      "currency":    "MAD",
      "transactionType": "TRANSFER",
      "transactionDate": "2026-04-01T00:00:00.000Z",
      "counterparty": "BMCE Bank",
      "purpose": "Virement régulier"
    }
  ]
}
```

**Réponse `dryRun: false`** (insertion réelle) :
```json
{
  "success":  true,
  "inserted": 148,
  "insertErrors": []
}
```

### 7.3 Format CSV — spécification

#### En-têtes reconnus (insensible à la casse, caractères spéciaux ignorés)

| Colonne | Alias acceptés | Obligatoire |
|---------|---------------|:-----------:|
| `amount` | `montant`, `betrag`, `importe` | **Oui** |
| `date` | `datum`, `fecha` | **Oui** |
| `currency` | `devise`, `wahrung` | Non (défaut: EUR) |
| `type` | `typetransaction`, `nature` | Non |
| `counterparty` | `contrepartie`, `beneficiaire`, `tiers` | Non |
| `bank` | `banque`, `bic` | Non |
| `reference` | `ref`, `id`, `transactionid` | Non |
| `purpose` | `motif`, `description`, `libelle` | Non |

#### Formats de date acceptés

| Format | Exemple |
|--------|---------|
| ISO 8601 | `2026-04-05` |
| DD/MM/YYYY | `05/04/2026` |
| YYYYMMDD | `20260405` |
| Avec heure | `2026-04-05T10:30:00Z` |

#### Formats de montant acceptés

| Exemple | Résultat |
|---------|----------|
| `1234.56` | 1234.56 |
| `1 234,56` | 1234.56 |
| `1.234,56` (séparateur milliers) | 1234.56 |
| `1234,56` (virgule décimale) | 1234.56 |

#### Exemple de fichier CSV valide

```csv
date,amount,currency,type,counterparty,bank,reference,purpose
2026-04-01,5000.00,MAD,TRANSFER,Ahmed Benali,CIH Bank,REF001,Loyer mensuel
2026-04-02,75000.00,MAD,TRANSFER,Société Rachidi,Attijariwafa,REF002,Facture fournisseur
2026-04-03,12000.50,MAD,WITHDRAWAL,,ATM Casablanca,REF003,Retrait espèces
2026-04-04,3500.00,EUR,PAYMENT,Orange Maroc,,REF004,Abonnement
```

#### Inférence du type de transaction

| Mot-clé dans `type` ou `purpose` | Type inféré |
|---------------------------------|-------------|
| `vir`, `transfer`, `sepa` | TRANSFER |
| `depot`, `deposit`, `credit` | DEPOSIT |
| `retrait`, `withdraw`, `debit` | WITHDRAWAL |
| `paiement`, `payment`, `carte` | PAYMENT |
| (défaut) | PAYMENT |

### 7.4 Format SWIFT MT940 — spécification

```
:20:RELEVE-20260405         ← Référence du relevé
:25:MAR001/1234567890/MAD   ← Compte + devise
:28C:00001/001             ← N° de séquence
:60F:C260401MAD120000,00    ← Solde initial
:61:260405C5000,00NTRFREF001//CBS-001
                            ← Date YYMMDD | C/D = crédit/débit | Montant | Ref
:86:Virement Benali Ahmed - Loyer mensuel
:61:260405D75000,00NTRFREF002//CBS-002
:86:Paiement fournisseur Rachidi - Facture 2026-03
:62F:C260405MAD50000,00     ← Solde final
```

**Règles de parsing MT940** :
- `:61:` → chaque ligne de transaction
- `C` = crédit → type `DEPOSIT`, `D` = débit → type `WITHDRAWAL`
- Format montant : virgule = séparateur décimal (`5000,00` → 5000.00)
- Format date : YYMMDD (`260405` → 2026-04-05)
- `:86:` → libellé/purpose de la transaction précédente
- Déduplication via hash(date + montant + ref)

### 7.5 Limites et contraintes

| Paramètre | Valeur | Raison |
|-----------|--------|--------|
| Lignes max par import | 5 000 | Protection mémoire / timeout |
| Montant minimum | > 0.00 | Validation métier |
| Montant maximum | 999 999 999 999.99 | Limite numérique DB (15,2) |
| Encodage CSV | UTF-8 | Noms avec accents marocains |
| Déduplication | Hash(date+montant+ref) sur 24h | Idempotence réimports |
| Rôle requis | `supervisor` | Import modifie des données en masse |

### 7.6 Intégration avec un CBS via SFTP (pattern recommandé)

```bash
# Script d'import automatique CBS → plateforme
# À exécuter via cron ou job scheduler côté CBS

#!/bin/bash
CBS_FILE="/srv/sftp/exports/transactions_$(date +%Y%m%d).csv"
API_URL="https://kyc-lab.exemple.com/trpc/transactions.importFile"
TOKEN=$(cat /etc/kyc-lab/supervisor_token)
CUSTOMER_ID=0   # 0 = import global (tous clients dans le CSV)

curl -s -X POST "$API_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"customerId\": $CUSTOMER_ID,
    \"content\": $(jq -Rs . < $CBS_FILE),
    \"dryRun\": false
  }" | jq '.result.data'
```

---

## 8. Connectors Mobile Money (Orange Money, Wave, CIH)

### 8.1 Description

Les opérateurs de mobile money envoient leurs transactions via des webhooks dédiés. Chaque connecteur a son propre format de payload, mais tous aboutissent à `createTransaction()`.

### 8.2 Endpoints

```
POST /webhooks/orange-money    → handleOrangeMoney()
POST /webhooks/wave            → handleWave()
POST /webhooks/cih-mobile      → handleCihMobile()
```

> **Prérequis** : `INSTITUTION_TYPE=PAYMENT_INSTITUTION` (flag `mobileConnectors: true`)

### 8.3 Payload Orange Money

```json
{
  "transactionRef":  "OM-20260405-123456",
  "clientId":        42,
  "amount":          "500.00",
  "currency":        "MAD",
  "operationType":   "CASH_IN",
  "counterparty":    "0612345678",
  "timestamp":       1743847800000
}
```

Types `operationType` supportés : `CASH_IN` → `AGENT_CASH_IN`, `CASH_OUT` → `AGENT_CASH_OUT`, `TRANSFER` → `P2P_TRANSFER`, `PAYMENT` → `MERCHANT_PAYMENT`

Canal résultant : `ORANGE_MONEY`

### 8.4 Payload Wave

```json
{
  "reference":    "WV-20260405-789012",
  "userId":       42,
  "amount":       "200.00",
  "currency":     "MAD",
  "type":         "P2P",
  "recipient":    "0698765432",
  "timestamp":    1743847800000
}
```

Types : `P2P` → `P2P_TRANSFER`, `BILL` → `BILL_PAYMENT`, `MERCHANT` → `MERCHANT_PAYMENT`

Canal résultant : `WAVE`

### 8.5 Payload CIH Mobile

```json
{
  "txRef":          "CIH-20260405-345678",
  "accountId":      42,
  "amount":         "1500.00",
  "currency":       "MAD",
  "operation":      "VIREMENT",
  "beneficiaire":   "Hassan Khalil",
  "timestamp":      1743847800000
}
```

Types : `VIREMENT` → `TRANSFER`, `DEPOT` → `MOBILE_MONEY_IN`, `RETRAIT` → `MOBILE_MONEY_OUT`

Canal résultant : `CIH_MOBILE`

### 8.6 Sécurité des connecteurs

- Feature flag `mobileConnectors: true` requis → sinon 403
- Pas de HMAC sur ces connecteurs (simplification démo) — en production, ajouter une clé par opérateur
- Déduplication Redis (24h) par référence de transaction
- Validation fraîcheur timestamp identique au webhook CBS (±5 min)

---

## 9. Moteur AML & Gestion des Règles

### 9.1 Règles par défaut — `seedDefaults`

L'administrateur peut injecter les **11 règles AML par défaut** via `amlRules.seedDefaults` (idempotent).

| # | Nom | Catégorie | Seuil | Priorité | Score de base |
|---|-----|-----------|-------|----------|--------------|
| 1 | Seuil transaction unique | THRESHOLD | 100 000 MAD | HIGH | 70 |
| 2 | Structuration détectée | PATTERN | 3× < 30 000 MAD en 24h | CRITICAL | 90 |
| 3 | Vélocité haute fréquence | VELOCITY | 10 transactions en 24h | HIGH | 75 |
| 4 | Seuil espèces | THRESHOLD | 50 000 MAD | HIGH | 65 |
| 5 | PEP en transaction | PATTERN | pepStatus=true | CRITICAL | 85 |
| 6 | Pays à risque élevé | GEOGRAPHIC | Liste FATF/GAFI | HIGH | 80 |
| 7 | Volume inhabituel | PATTERN | Variation > 300% sur 7j | HIGH | 70 |
| 8 | Transaction dormant réactivé | PATTERN | Inactivité > 90j | MEDIUM | 55 |
| 9 | Accumulation petits montants | PATTERN | 20+ < 5 000 MAD en 48h | HIGH | 72 |
| 10 | Dépassement seuil structuration | THRESHOLD | Structurations cumulées > 100k | CRITICAL | 88 |
| 11 | Réseau d'agents suspect | NETWORK | Score réseau > seuil | HIGH | 78 |

> + 5 règles wallet (si `walletAml: true`) : P2P_VELOCITY, AGENT_MULE, SMALL_ACCUMULATION, MERCHANT_BYPASS, DORMANT_REACTIVATION

### 9.2 Flux d'exécution AML

```
createTransaction()
       │
       ▼
runDynamicAmlRules(tx, customer)
       │
       ├─► Pour chaque règle ACTIVE en base :
       │      ├─ Évaluer conditions (jsonb)
       │      ├─ Si match → INSERT aml_rule_executions
       │      └─ Si score > seuil → CREATE alert
       │
       ├─► Si aucune règle en base → fallback runAmlRules() (moteur statique)
       │
       └─► callMlScoring(tx, customer) [parallèle, fire-and-forget]
                │
                └─► POST {ML_SERVICE_URL}/score
                        → UPDATE tx.riskScore
```

### 9.3 Backtest d'une règle

```typescript
// Test d'une règle sur les 30 derniers jours, max 10 000 transactions
const result = await trpc.amlRules.backtest.mutate({
  ruleId:            5,
  daysPeriod:        30,
  maxTx:             10000,
  compareWithActive: true,   // compare avec toutes les règles actives
});

// Résultat :
{
  simulation: {
    triggered:   127,          // transactions déclenchées
    triggerRate: 0.0127,       // 1.27%
  },
  durationMs: 342,
}
```

### 9.4 Gestion des faux positifs

```typescript
// Un analyst signale un faux positif sur la règle 3
await trpc.amlRules.feedback.mutate({ ruleId: 3, note: "Client régulier — activité saisonnière" });

// Si le taux de FP de la règle dépasse 20% → la règle passe automatiquement en TESTING
// Le supervisor doit manuellement la repasser en ACTIVE après révision
```

---

## 10. Screening Sanctions & PEP

### 10.1 Algorithme de correspondance

```
Nom client : "Mohammed Al-Rachidi"
              │
              ▼
        Normalisation (minuscules, diacritiques, tirets)
              │
              ▼
     Comparaison avec chaque entrée des 7 listes
              │
     ┌────────┴────────┐
     │                 │
     ▼                 ▼
Score ≥ 80%        50% ≤ Score < 80%
(MATCH)                (REVIEW)
     │                 │
     ▼                 ▼
Alerte SANCTIONS   Alerte REVIEW    → Analyste examine
Gel possible       (manuel)
```

### 10.2 Fraîcheur des listes

```
Cron quotidien 02:00 UTC
      │
      ▼
Téléchargement depuis URLs officielles
(OFAC, EU, UN, UK, PEP OpenSanctions, BAM)
      │
      ▼
Parsing → stockage en Redis
(clé: screening:list_count:{provider})
(clé: screening:last_update:{provider})
      │
      ▼
Si délai > SCREENING_STALE_THRESHOLD_HOURS (36h)
      → listsHealth() retourne staleProviders
      → Dashboard affiche alerte
```

### 10.3 Screening en batch (compliance_officer)

```typescript
// Re-screener tous les clients HIGH/CRITICAL
const job = await trpc.screening.batchScreen.mutate({
  onlyHighRisk: true,
});
// jobId: "batch_screening_1743847800000"

// Vérifier l'avancement
const status = await trpc.screening.batchStatus.query({ jobId: job.jobId });
// { status: "running", processed: 45, total: 120, errors: [] }
```

---

## 11. Gestion des Wallets & Tiers KYC

### 11.1 Tiers KYC et plafonds (Circulaire BAM 4/W/2019)

| Tier | Documents requis | Plafond transaction | Plafond mensuel | Revue |
|------|-----------------|--------------------|--------------------|-------|
| **ALLEGED** (Allégé) | CIN | 5 000 MAD | 20 000 MAD | 180 jours |
| **STANDARD** | CIN + Justificatif domicile | 50 000 MAD | 200 000 MAD | 365 jours |
| **RENFORCE** (EDD) | CIN + Justificatif + Relevé bancaire | 500 000 MAD | 2 000 000 MAD | 90 jours |

### 11.2 Passage de tier

```typescript
// Passage d'un wallet de ALLEGED vers STANDARD
await trpc.wallets.promoteTier.mutate({
  walletId:   12,
  customerId: 42,
  newTier:    "STANDARD",
  reason:     "Documents complémentaires vérifiés — Circulaire BAM 4/W/2019",
});

// Crée automatiquement un KycTierSnapshot (audit trail)
// Met à jour le wallet.kycTier
```

### 11.3 Réactivation d'un wallet dormant

```typescript
// Wallet inactif depuis > 90 jours
await trpc.wallets.reactivate.mutate({ walletId: 12 });
// isDormant = false, dormantSince = null
// Déclenchement automatique d'une alerte DORMANT_REACTIVATION si walletAml = true
```

---

## 12. Rapports Réglementaires BAM / GoAML

### 12.1 Transmission GoAML à l'ANRF

```typescript
// 1. Créer le rapport SAR
const report = await trpc.reports.createSar.mutate({
  customerId:      42,
  caseId:          15,
  title:           "Suspicion de blanchiment — Transactions atypiques Q1 2026",
  suspicionType:   "LAYERING",
  amountInvolved:  "850000.00",
  currency:        "MAD",
  content: {
    subjectDescription:   "Client CORPORATE, importateur agro-alimentaire, KYC APPROVED",
    suspiciousActivities: ["Fractionnnement", "Transactions pays FATF", "Bénéficiaires multiples"],
    evidenceSummary:      "12 transactions de 68-72 000 MAD vers 4 banques différentes en 3 jours",
    narrativeSummary:     "Profil comportemental anormal par rapport aux 18 mois d'historique...",
    relatedTransactions:  [101, 102, 103, 104, 105],
    relatedAlerts:        [55, 56],
  },
});

// 2. Soumettre pour révision
await trpc.reports.submitForReview.mutate({ id: report.id });

// 3. Approbation compliance_officer
await trpc.reports.approve.mutate({ id: report.id, regulatoryRef: "ANRF-2026-04-0042" });

// 4. Transmission GoAML
const result = await trpc.reports.transmit.mutate({
  id:                   report.id,
  declarantFirstName:   "Karim",
  declarantLastName:    "Benjelloun",
  declarantTitle:       "Responsable Conformité",
  declarantPhone:       "+212522000000",
  declarantEmail:       "compliance@banque-exemple.ma",
});
// {
//   reportId:        report.id,
//   transmissionId:  "TX-20260405-001",
//   fiuRefNumber:    "ANRF-2026-TX-001",
//   status:          "TRANSMITTED",
//   mode:            "SIMULATION",       // REAL en production
//   sentAt:          "2026-04-05T14:30:00Z",
//   xmlChecksum:     "sha256:a3f7b2c1...",
//   xmlSize:         4096,
// }
```

### 12.2 Téléchargement XML GoAML 2.0

```typescript
const xml = await trpc.reports.downloadXml.mutate({ id: report.id });
// {
//   xml:           "<goAML xmlns=\"...\"...>...",
//   checksum:      "sha256:a3f7b2c1...",
//   reportCode:    "SAR",
//   schemaVersion: "2.0",
//   generatedAt:   "2026-04-05T14:25:00Z",
//   filename:      "SAR_ANRF-2026-04-0042_20260405.xml",
// }
```

### 12.3 Mode de transmission

| Variable | Valeur | Comportement |
|----------|--------|-------------|
| `TRANSMISSION_MODE` | `SIMULATION` | XML généré et retourné, aucun envoi réseau |
| `TRANSMISSION_MODE` | `REAL` | XML envoyé à l'endpoint GoAML de l'ANRF |

### 12.4 KPIs AMLD6 (reporting réglementaire EU)

```typescript
const kpis = await trpc.reports.amld6Stats.query({
  from: "2026-01-01",
  to:   "2026-03-31",
});
// {
//   totalSar: 12, totalStr: 8,
//   totalCustomersOnboarded: 450,
//   totalSuspiciousTransactions: 67,
//   avgDaysToSarSubmission: 1.8,
//   highRiskCustomers: 23,
//   pepCustomers: 5,
// }
```

---

## 13. Matrice de Droits d'Accès

### 13.1 Permissions par rôle

| Permission | analyst | supervisor | compliance_officer | admin |
|-----------|:-------:|:----------:|:-----------------:|:-----:|
| `customers:read` | ✓ | ✓ | ✓ | ✓ |
| `customers:create` | ✓ | ✓ | ✓ | ✓ |
| `customers:update` | ✓ | ✓ | ✓ | ✓ |
| `customers:change_risk_level` | — | ✓ | ✓ | ✓ |
| `customers:export` | — | — | ✓ | ✓ |
| `customers:delete` | — | — | — | ✓ |
| `transactions:read` | ✓ | ✓ | ✓ | ✓ |
| `transactions:create` | ✓ | ✓ | ✓ | ✓ |
| `transactions:block` | — | ✓ | ✓ | ✓ |
| `transactions:importFile` | — | ✓ | ✓ | ✓ |
| `alerts:read` | ✓ | ✓ | ✓ | ✓ |
| `alerts:assign` | ✓ | ✓ | ✓ | ✓ |
| `alerts:resolve` | — | ✓ | ✓ | ✓ |
| `alerts:escalate` | — | ✓ | ✓ | ✓ |
| `cases:create` | ✓ | ✓ | ✓ | ✓ |
| `cases:assign` | — | ✓ | ✓ | ✓ |
| `cases:decide` | — | ✓ | ✓ | ✓ |
| `screening:run` | ✓ | ✓ | ✓ | ✓ |
| `screening:review` | — | — | ✓ | ✓ |
| `screening:manage_lists` | — | — | ✓ | ✓ |
| `screening:force_refresh` | — | — | — | ✓ |
| `reports:create` | ✓ | ✓ | ✓ | ✓ |
| `reports:submit` | ✓ | ✓ | ✓ | ✓ |
| `reports:reject` | — | ✓ | ✓ | ✓ |
| `reports:approve` | — | — | ✓ | ✓ |
| `reports:transmit` | — | — | ✓ | ✓ |
| `reports:export_xml` | — | — | ✓ | ✓ |
| `reports:amld6_stats` | — | — | ✓ | ✓ |
| `aml_rules:create` | — | ✓ | ✓ | ✓ |
| `aml_rules:delete` | — | — | ✓ | ✓ |
| `aml_rules:seedDefaults` | — | — | — | ✓ |
| `wallets:create` | — | ✓ | ✓ | ✓ |
| `wallets:promoteTier` | — | ✓ | ✓ | ✓ |
| `customers:freeze` | — | ✓ | ✓ | ✓ |
| `customers:processErasure` | — | — | ✓ | ✓ |
| `users:manage` | — | — | — | ✓ |
| `system:config` | — | — | — | ✓ |
| `audit:read` | — | ✓ | ✓ | ✓ |

---

## 14. Matrice de Tests Complète

### 14.1 Auth — Authentification & MFA

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| AUTH-01 | Login valide sans MFA | `{ email: "admin@kyc-aml.local", password: "AdminKYC2024!" }` | `{ user: {...}, tokens: { accessToken, refreshToken } }` | `200` + tokens valides | ✓ PASS |
| AUTH-02 | Login avec email inexistant | `{ email: "x@x.com", password: "any" }` | `{ code: "UNAUTHORIZED" }` | `401` sans énumération email | ✓ PASS |
| AUTH-03 | Mot de passe incorrect | `{ email: "admin@...", password: "wrong" }` | `{ code: "UNAUTHORIZED" }` | `401` identique à AUTH-02 | ✓ PASS |
| AUTH-04 | Rate limiting (11ème tentative en 15min) | 11× POST auth.login | `{ code: "TOO_MANY_REQUESTS" }` | `429` après 10 tentatives | ✓ PASS |
| AUTH-05 | Login avec MFA activé | Credentials valides | `{ mfaRequired: true, userId: 1 }` | Étape 2 requise | ✓ PASS |
| AUTH-06 | Validation code MFA correct | `{ userId: 1, code: "123456" }` | `{ user, tokens }` | `200` + tokens | ✓ PASS |
| AUTH-07 | Code MFA expiré | TOTP avec décalage > 90s | `{ code: "UNAUTHORIZED" }` | `401` code invalide | ✓ PASS |
| AUTH-08 | Code de secours MFA | `{ userId: 1, code: "AAAA-BBBB" }` | `{ success: true, usedBackup: true }` | Code consommé, non réutilisable | ✓ PASS |
| AUTH-09 | Token access expiré (15min) | `Authorization: Bearer <expired>` | `{ code: "UNAUTHORIZED" }` | `401` | ✓ PASS |
| AUTH-10 | Refresh token valide | `{ refreshToken: "..." }` | `{ accessToken, refreshToken }` | Nouveau token émis | ✓ PASS |
| AUTH-11 | Logout → token invalidé | Logout puis requête avec ancien token | `{ code: "UNAUTHORIZED" }` | `401` | ✓ PASS |
| AUTH-12 | Changement de mot de passe | `{ currentPassword: "...", newPassword: "Nouveau!123" }` | `{ success: true }` | Ancien mot de passe refusé ensuite | ✓ PASS |
| AUTH-13 | Mot de passe < 8 caractères | `{ newPassword: "abc" }` | Erreur Zod validation | `400` format invalide | ✓ PASS |
| AUTH-14 | Mot de passe sans majuscule | `{ newPassword: "password123!" }` | Erreur Zod validation | `400` format invalide | ✓ PASS |

### 14.2 Customers — Gestion des clients

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| CUST-01 | Création client INDIVIDUAL | `{ firstName: "Youssef", lastName: "Alami", customerType: "INDIVIDUAL" }` | `{ id, customerId: "KYC-XXXXXXXX", riskLevel: "LOW", riskScore: 10 }` | Client créé, KYC PENDING | ✓ PASS |
| CUST-02 | Création client avec email | `{ ..., email: "y.alami@email.com" }` | `{ id, customerId, email }` | Email stocké (chiffré PII) | ✓ PASS |
| CUST-03 | Doublon email (si unique) | 2× même email | `{ code: "CONFLICT" }` | `409` | ✓ PASS |
| CUST-04 | Recherche par nom | `{ search: "Alami" }` | Liste avec Alami en résultat | Filtre case-insensitive | ✓ PASS |
| CUST-05 | Filtre par riskLevel | `{ riskLevel: "HIGH" }` | Uniquement clients HIGH | Filtrage correct | ✓ PASS |
| CUST-06 | Calcul score de risque | `{ id: 42 }` (customers.calculateRiskScore) | `{ riskScore: 75, riskLevel: "HIGH", factors: ["PEP", "HIGH_TRANSACTION_VOLUME"] }` | Score 0-100 + facteurs | ✓ PASS |
| CUST-07 | Gel d'un compte (supervisor) | `{ id: 42, reason: "Soupçon structuration" }` | `{ frozenAt: "2026-04-05...", frozenReason: "..." }` | Transactions bloquées après gel | ✓ PASS |
| CUST-08 | Gel par analyst (refus) | Appel freeze par analyst | `{ code: "FORBIDDEN" }` | `403` rôle insuffisant | ✓ PASS |
| CUST-09 | Ajout UBO > 25% | `{ customerId: 42, firstName: "Said", ownershipPercentage: 30 }` | `{ id, ownershipPercentage: 30 }` | UBO créé, audit loggé | ✓ PASS |
| CUST-10 | Demande effacement RGPD | `{ id: 42 }` (requestErasure) | `{ erasureRequestedAt: "2026-04-05..." }` | Marqué en attente effacement | ✓ PASS |
| CUST-11 | Effacement effectif (compliance) | `{ id: 42 }` (processErasure) | `{ erasureCompletedAt: "2026-04-05..." }` | PII anonymisée | ✓ PASS |
| CUST-12 | Statistiques globales | `customers.stats.query()` | `{ total, byRiskLevel, byKycStatus, highRisk, pendingKyc }` | Compteurs cohérents avec DB | ✓ PASS |

### 14.3 Transactions — Cycle de vie

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| TXN-01 | Création transaction normale | `{ customerId: 1, amount: "5000.00", transactionType: "TRANSFER" }` | `{ transactionId: "TXN-...", status: "PENDING", isSuspicious: false }` | Format TXN-XXXXXXXXXX | ✓ PASS |
| TXN-02 | Transaction déclenchant AML seuil | `{ customerId: 1, amount: "120000.00", transactionType: "TRANSFER" }` | `{ isSuspicious: true, riskScore: > 70 }` | Alerte créée automatiquement | ✓ PASS |
| TXN-03 | Client KYC REJECTED | `{ customerId: 99 }` (client KYC=REJECTED) | `{ code: "FORBIDDEN" }` | `403` transaction bloquée | ✓ PASS |
| TXN-04 | Client KYC PENDING | `{ customerId: 77 }` (client KYC=PENDING) | `{ code: "FORBIDDEN" }` | `403` transaction bloquée | ✓ PASS |
| TXN-05 | Complétion d'une transaction | `{ id: 10 }` (complete) | `{ status: "COMPLETED", completedAt: "..." }` | Statut mis à jour | ✓ PASS |
| TXN-06 | Blocage par supervisor | `{ id: 10, reason: "Fraude suspectée" }` | `{ status: "BLOCKED", isSuspicious: true, flagReason: "Fraude..." }` | Blocage immédiat | ✓ PASS |
| TXN-07 | Blocage d'une transaction COMPLETED | `{ id: 10 }` (tx déjà COMPLETED) | `{ code: "BAD_REQUEST" }` | `400` statut terminal | ✓ PASS |
| TXN-08 | Structuration détectée | 3 transactions 29 000 MAD en 2h | 3× `isSuspicious: true` + alerte STRUCTURING | Règle #2 déclenchée | ✓ PASS |
| TXN-09 | Webhook CBS valide | Payload JSON + HMAC correct | `{ success: true, transactionId: "TXN-..." }` | Transaction créée + AML | ✓ PASS |
| TXN-10 | Webhook CBS signature invalide | Payload + HMAC incorrect | `{ error: "Signature invalide" }` | `401` refusé | ✓ PASS |
| TXN-11 | Webhook CBS timestamp > 5min | Payload avec timestamp -10min | `{ error: "Timestamp hors tolérance (±5 min)" }` | `400` refusé | ✓ PASS |
| TXN-12 | Webhook CBS dupliqué | 2× même transactionId | 2ème : `{ success: true, duplicate: true }` | Idempotence garantie | ✓ PASS |
| TXN-13 | Filtre transactions suspectes | `{ isSuspicious: true }` | Uniquement transactions flaggées | Filtrage correct | ✓ PASS |

### 14.4 Import Fichier — CSV & MT940

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| IMP-01 | CSV valide (séparateur `,`) | 100 lignes, toutes valides | `{ parsed: 100, skipped: 0, errors: [] }` | Toutes insérées | ✓ PASS |
| IMP-02 | CSV séparateur `;` | 50 lignes avec `;` | `{ format: "csv", parsed: 50 }` | Auto-détection séparateur | ✓ PASS |
| IMP-03 | CSV séparateur `|` | 30 lignes avec `|` | `{ format: "csv", parsed: 30 }` | Auto-détection séparateur | ✓ PASS |
| IMP-04 | CSV montant virgule décimale | `"1.234,56"` | `parsed amount: "1234.56"` | Normalisation correcte | ✓ PASS |
| IMP-05 | CSV date DD/MM/YYYY | `"05/04/2026"` | `transactionDate: 2026-04-05` | Parsing correct | ✓ PASS |
| IMP-06 | CSV date YYYYMMDD | `"20260405"` | `transactionDate: 2026-04-05` | Parsing correct | ✓ PASS |
| IMP-07 | CSV montant invalide (`"abc"`) | Ligne avec `amount: "abc"` | `{ errors: [{line: N, error: "Montant invalide"}] }` | Ligne skippée, pas d'échec global | ✓ PASS |
| IMP-08 | CSV date invalide (`"32/13/2026"`) | Date impossible | `{ errors: [{line: N, error: "Date invalide"}] }` | Ligne skippée | ✓ PASS |
| IMP-09 | CSV sans colonne `amount` | En-têtes sans `amount` | `{ errors: [{line: 1, error: "Colonne 'amount' introuvable"}] }` | Import refusé | ✓ PASS |
| IMP-10 | CSV vide (0 lignes) | Fichier vide | `{ errors: [{error: "Fichier CSV vide"}] }` | Import refusé | ✓ PASS |
| IMP-11 | CSV > 5000 lignes | 6000 lignes | `total: 5000` (tronqué) | Limite respectée | ✓ PASS |
| IMP-12 | MT940 valide | Relevé standard `:20:`, `:61:`, `:86:` | `{ format: "mt940", parsed: N }` | Transactions créées | ✓ PASS |
| IMP-13 | MT940 crédit/débit | `:61:260405C5000,00…` | `transactionType: "DEPOSIT"` | C → DEPOSIT | ✓ PASS |
| IMP-14 | MT940 débit | `:61:260405D3000,00…` | `transactionType: "WITHDRAWAL"` | D → WITHDRAWAL | ✓ PASS |
| IMP-15 | MT940 libellé `:86:` | `:86:Virement Ahmed` | `purpose: "Virement Ahmed"` | Libellé extrait | ✓ PASS |
| IMP-16 | MT940 montant virgule | `:61:260405C5000,50…` | `amount: "5000.50"` | Virgule → point | ✓ PASS |
| IMP-17 | Format inconnu | Fichier XML non reconnu | `{ format: "unknown", errors: ["Format non reconnu"] }` | Refusé proprement | ✓ PASS |
| IMP-18 | dryRun=true | CSV valide, dryRun | `{ preview: [...], inserted: 0 }` | Aucune insertion en base | ✓ PASS |
| IMP-19 | Déduplication réimport | Import 2× même fichier | 2ème import : `inserted: 0, errors: 0` | Doublons ignorés | ✓ PASS |
| IMP-20 | Import par analyst (refus) | Analyst appelle importFile | `{ code: "FORBIDDEN" }` | `403` supervisor requis | ✓ PASS |

### 14.5 Alertes — Workflow de traitement

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| ALR-01 | Alerte créée après transaction > seuil | Transaction 120 000 MAD | Alerte THRESHOLD AUTO créée | priority = HIGH, status = OPEN | ✓ PASS |
| ALR-02 | Assignation analyst | `{ id: 5, userId: 3 }` | `{ assignedTo: 3, status: "IN_REVIEW" }` | Analyst notifié | ✓ PASS |
| ALR-03 | Résolution CLOSED | `{ id: 5, resolution: "CLOSED", note: "Activité justifiée" }` | `{ status: "CLOSED", resolvedAt: "..." }` | Alerte fermée | ✓ PASS |
| ALR-04 | Résolution FALSE_POSITIVE | `{ id: 5, resolution: "FALSE_POSITIVE" }` | `{ status: "FALSE_POSITIVE" }` | Feed-back règle AML | ✓ PASS |
| ALR-05 | Escalade vers dossier | `{ id: 5, resolution: "ESCALATED" }` | `{ status: "ESCALATED" }` | Dossier créé manuellement | ✓ PASS |
| ALR-06 | Filtrage par priorité | `{ priority: "CRITICAL" }` | Uniquement alertes CRITICAL | Filtre correct | ✓ PASS |
| ALR-07 | Stats alertes | `alerts.stats.query()` | `{ total, open, highPriority, critical, last30d }` | Compteurs corrects | ✓ PASS |

### 14.6 Screening — Sanctions & PEP

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| SCR-01 | Client non présent dans listes | `{ customerId: 1, customerName: "Jean Dupont" }` | `{ status: "CLEAR", matchScore: 0 }` | CLEAR | ✓ PASS |
| SCR-02 | Correspondance forte (≥ 80%) | Nom proche d'une entrée OFAC | `{ status: "MATCH", matchScore: 92, matchedEntity: "..." }` | MATCH + alerte SANCTIONS | ✓ PASS |
| SCR-03 | Correspondance partielle (50-79%) | Nom similaire | `{ status: "REVIEW", matchScore: 65 }` | REVIEW — examen manuel | ✓ PASS |
| SCR-04 | Revue CONFIRMED par compliance | `{ id: 8, decision: "CONFIRMED", reason: "..." }` | `{ decision: "CONFIRMED", status: "MATCH" }` | Client signalé à l'ANRF | ✓ PASS |
| SCR-05 | Revue DISMISSED | `{ id: 8, decision: "DISMISSED" }` | `{ decision: "DISMISSED", status: "CLEAR" }` | Client blanchi | ✓ PASS |
| SCR-06 | Santé listes (MAJ récente) | `screening.listsHealth.query()` | `{ allHealthy: true, staleProviders: [] }` | Toutes listes < 36h | ✓ PASS |
| SCR-07 | Liste stale (> 36h) | Simuler lastUpdate > 36h | `{ allHealthy: false, staleProviders: ["ofac"] }` | Alerte affichée | ✓ PASS |
| SCR-08 | Ajout entrée blocklist custom | `{ name: "Entité Suspecte", reason: "Fraude locale" }` | `{ id: 1, name: "...", addedAt: "..." }` | Entrée active pour prochain screening | ✓ PASS |
| SCR-09 | Batch screening HIGH RISK | `{ onlyHighRisk: true }` | `{ jobId: "batch_..." }` | Job Redis créé | ✓ PASS |
| SCR-10 | Force refresh (admin) | `screening.forceRefresh.mutate()` | `{ total: 7, statuses: [{provider, count}] }` | Toutes listes re-téléchargées | ✓ PASS |

### 14.7 Dossiers — Investigation (Cases)

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| CASE-01 | Création dossier | `{ customerId: 42, title: "Enquête LCB", severity: "HIGH" }` | `{ id, caseId: "CASE-...", status: "OPEN" }` | Dossier OPEN | ✓ PASS |
| CASE-02 | Passage UNDER_INVESTIGATION | `{ id: 1, status: "UNDER_INVESTIGATION", note: "..." }` | `{ status: "UNDER_INVESTIGATION" }` | Timeline mise à jour | ✓ PASS |
| CASE-03 | Assignation (supervisor) | `{ id: 1, assignedTo: 3, supervisorId: 5 }` | Dossier assigné | Audit loggé | ✓ PASS |
| CASE-04 | Ajout constatations | `{ id: 1, findings: "12 transactions atypiques..." }` | `{ findings: "..." }` | Champ mis à jour | ✓ PASS |
| CASE-05 | Décision SAR_FILED (supervisor) | `{ id: 1, decision: "SAR_FILED", decisionNotes: "..." }` | `{ status: "SAR_SUBMITTED", decision: "SAR_FILED" }` | Rapport SAR lié | ✓ PASS |
| CASE-06 | Décision CLOSED_NO_ACTION | `{ id: 1, decision: "CLOSED_NO_ACTION" }` | `{ status: "CLOSED" }` | Dossier archivé | ✓ PASS |
| CASE-07 | Timeline complète | `cases.getTimeline({ id: 1 })` | `[{action, note, performedBy, createdAt}…]` | Toutes actions tracées | ✓ PASS |
| CASE-08 | Stats dossiers | `cases.stats.query()` | `{ total, open, pendingApproval, criticalSeverity, closed }` | Compteurs corrects | ✓ PASS |

### 14.8 Rapports — SAR/STR et GoAML

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| RPT-01 | Création SAR | SAR avec contenu complet | `{ status: "DRAFT", reportType: "SAR" }` | Rapport DRAFT | ✓ PASS |
| RPT-02 | Modification DRAFT | `{ id: 1, title: "Titre mis à jour" }` | `{ title: "Titre mis à jour" }` | Modifiable en DRAFT | ✓ PASS |
| RPT-03 | Modification SUBMITTED (refus) | `updateContent` sur rapport SUBMITTED | `{ code: "BAD_REQUEST" }` | `400` rapport immuable | ✓ PASS |
| RPT-04 | Soumission review | `submitForReview({ id: 1 })` | `{ status: "REVIEW" }` | DRAFT → REVIEW | ✓ PASS |
| RPT-05 | Rejet supervisor | `reject({ id: 1 })` | `{ status: "DRAFT" }` | Retour en DRAFT | ✓ PASS |
| RPT-06 | Approbation compliance | `approve({ id: 1 })` | `{ status: "SUBMITTED" }` | REVIEW → SUBMITTED | ✓ PASS |
| RPT-07 | Transmission GoAML SIMULATION | `transmit({ id: 1, ... })` | `{ mode: "SIMULATION", fiuRefNumber: "..." }` | XML généré, pas d'envoi réseau | ✓ PASS |
| RPT-08 | Téléchargement XML | `downloadXml({ id: 1 })` | `{ xml: "<goAML...>", checksum: "sha256:..." }` | XML GoAML 2.0 valide | ✓ PASS |
| RPT-09 | Export PDF SAR | `exportReportPdf({ id: 1 })` | `{ base64: "...", filename: "SAR_..." }` | PDF base64 valide | ✓ PASS |
| RPT-10 | Export KYC PDF client | `exportKycPdf({ customerId: 42 })` | `{ base64: "...", filename: "KYC_..." }` | Fiche KYC complète | ✓ PASS |
| RPT-11 | AMLD6 stats Q1 2026 | `{ from: "2026-01-01", to: "2026-03-31" }` | `{ totalSar, totalStr, avgDaysToSubmit, ... }` | KPIs cohérents | ✓ PASS |

### 14.9 Wallets — Tiers KYC (PAYMENT_INSTITUTION)

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| WAL-01 | Création wallet Orange Money | `{ customerId: 42, provider: "Orange Money", phoneNumber: "0612345678", kycTier: "ALLEGED" }` | `{ id, kycTier: "ALLEGED", balance: "0.00" }` | Wallet créé | ✓ PASS |
| WAL-02 | Passage ALLEGED → STANDARD | `{ walletId: 1, newTier: "STANDARD", reason: "Docs complémentaires vérifiés" }` | `{ kycTier: "STANDARD" }` + KycTierSnapshot | Snapshot créé | ✓ PASS |
| WAL-03 | Passage STANDARD → RENFORCE | `{ walletId: 1, newTier: "RENFORCE", reason: "EDD complète" }` | `{ kycTier: "RENFORCE" }` + KycTierSnapshot | Snapshot créé | ✓ PASS |
| WAL-04 | Création par analyst (refus) | Analyst appelle wallets.create | `{ code: "FORBIDDEN" }` | `403` supervisor requis | ✓ PASS |
| WAL-05 | Réactivation wallet dormant | `{ walletId: 5 }` (isDormant=true) | `{ isDormant: false }` | Réactivé | ✓ PASS |
| WAL-06 | Historique tiers | `tierHistory({ walletId: 1 })` | `[{tier: "ALLEGED", tieredAt}, {tier: "STANDARD", tieredAt}]` | Chronologie correcte | ✓ PASS |
| WAL-07 | Wallets non visibles sans flag | `INSTITUTION_TYPE=CLASSIC_BANK` | Nav "Wallets" absente, onglet client absent | Feature-gated correctement | ✓ PASS |

### 14.10 Connecteurs Mobile Money

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| MCN-01 | Orange Money — flag désactivé | Payload OM + `mobileConnectors: false` | `{ error: "non activés" }` | `403` | ✓ PASS |
| MCN-02 | Orange Money — JSON invalide | Body `"not-json{{"` | `{ error: "JSON invalide" }` | `400` | ✓ PASS |
| MCN-03 | Orange Money — payload valide | `{ transactionRef: "REF-001", clientId: 42, amount: "500.00", operationType: "TRANSFER" }` | `{ success: true, transactionId: "TXN-..." }` | Transaction créée, canal ORANGE_MONEY | ✓ PASS |
| MCN-04 | Orange Money — CASH_IN | `operationType: "CASH_IN"` | `transactionType: "AGENT_CASH_IN"` | Mapping correct | ✓ PASS |
| MCN-05 | Wave — P2P | `type: "P2P"` | `transactionType: "P2P_TRANSFER"`, canal `WAVE` | Mapping correct | ✓ PASS |
| MCN-06 | Wave — BILL | `type: "BILL"` | `transactionType: "BILL_PAYMENT"` | Mapping correct | ✓ PASS |
| MCN-07 | CIH Mobile — VIREMENT | `operation: "VIREMENT"` | `transactionType: "TRANSFER"`, canal `CIH_MOBILE` | Mapping correct | ✓ PASS |
| MCN-08 | Déduplication webhook | 2× même ref dans 24h | 2ème : `{ success: true, duplicate: true }` | Idempotence | ✓ PASS |

### 14.11 AML Rules — Moteur de règles

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| AML-01 | Seed règles par défaut (admin) | `amlRules.seedDefaults()` | `{ seeded: 11, message: "..." }` | 11 règles insérées | ✓ PASS |
| AML-02 | Seed idempotent (2ème appel) | `amlRules.seedDefaults()` 2× | `{ seeded: 0, message: "Règles déjà présentes" }` | Aucun doublon | ✓ PASS |
| AML-03 | Toggle règle INACTIVE | `{ id: 1, status: "INACTIVE" }` | `{ status: "INACTIVE" }` | Règle désactivée | ✓ PASS |
| AML-04 | Backtest 30j | `{ ruleId: 1, daysPeriod: 30, maxTx: 10000 }` | `{ simulation: { triggered: N, triggerRate: X } }` | Stats correctes | ✓ PASS |
| AML-05 | Feedback faux positif | `{ ruleId: 3, note: "Client régulier" }` | `{ type: "FALSE_POSITIVE" }` | Compteur FP incrémenté | ✓ PASS |
| AML-06 | Auto-dégradation si FP > 20% | 5 FP sur 20 exécutions | `rule.status = "TESTING"` | Dégradation automatique | ✓ PASS |
| AML-07 | Création règle custom (supervisor) | `{ name: "Règle MAD spécifique", threshold: 150000, ... }` | `{ id, status: "ACTIVE" }` | Règle active immédiatement | ✓ PASS |
| AML-08 | Suppression règle (admin) | `{ id: 5 }` | `{ success: true }` | Règle et exécutions supprimées | ✓ PASS |
| AML-09 | Seuils pays Maroc | `effectiveThresholds({ countryCode: "MA" })` | `{ thresholdSingleTx: 100000, strMandatoryAbove: 150000, strDelayHours: 24 }` | Seuils BAM corrects | ✓ PASS |

### 14.12 Documents — Vérification eKYC

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| DOC-01 | Vérification manuelle (supervisor) | `{ id: 3, notes: "Document authentique" }` | `{ status: "VERIFIED", verifiedAt: "..." }` | Statut mis à jour | ✓ PASS |
| DOC-02 | Rejet document | `{ id: 3, reason: "Document expiré" }` | `{ status: "REJECTED", rejectionReason: "Document expiré" }` | Rejet enregistré | ✓ PASS |
| DOC-03 | Suppression (compliance) | `{ id: 3 }` | `{ success: true }` | Fichier supprimé de S3/local | ✓ PASS |
| DOC-04 | Suppression par supervisor (refus) | Supervisor appelle remove | `{ code: "FORBIDDEN" }` | `403` compliance requis | ✓ PASS |
| DOC-05 | Stats documents client | `{ customerId: 42 }` | `{ total: 3, verified: 2, pending: 1, rejected: 0 }` | Compteurs corrects | ✓ PASS |
| DOC-06 | eKYC pass automatique | EKYC_PROVIDER=onfido, liveness 95%, OCR 98% | `{ ekycStatus: "PASS", status: "VERIFIED" }` | Auto-vérification | ✓ PASS |
| DOC-07 | eKYC review (liveness partielle) | liveness 60%, OCR 98% | `{ ekycStatus: "REVIEW" }` | Examen manuel requis | ✓ PASS |

### 14.13 Dashboard — KPIs & Monitoring

| ID | Scénario | Résultat donné | Résultat attendu | Statut |
|----|---------|----------------|-----------------|--------|
| DASH-01 | Overview global | `{ customers: {total, highRisk}, transactions: {today, suspiciousRate}, alerts: {open, critical} }` | Données fraîches (< 30s) | ✓ PASS |
| DASH-02 | Distribution risque | `{ byRiskLevel: {LOW: 300, MEDIUM: 150, HIGH: 45, CRITICAL: 8} }` | Somme = total clients | ✓ PASS |
| DASH-03 | Tendances 30j | `trends({ days: 30 })` → `series[30]` | 30 entrées date + métriques | ✓ PASS |
| DASH-04 | KPIs management (supervisor) | `{ openCriticalAlerts: 3, overdueKycReviews: 12, alertTrend: {variationPct: +15} }` | Données cohérentes | ✓ PASS |
| DASH-05 | Top clients HIGH risk | `riskDistribution()` → `highRiskCustomers[]` | Liste triée par riskScore décroissant | ✓ PASS |

### 14.14 Admin — Gestion utilisateurs & ML

| ID | Scénario | Input | Résultat donné | Résultat attendu | Statut |
|----|---------|-------|----------------|-----------------|--------|
| ADM-01 | Création utilisateur | `{ email: "analyste@banque.ma", role: "analyst", password: "AnalysteKYC!1" }` | `{ id, email, role: "analyst" }` | Utilisateur actif | ✓ PASS |
| ADM-02 | Accès admin par supervisor (refus) | Supervisor appelle admin.createUser | `{ code: "FORBIDDEN" }` | `403` admin requis | ✓ PASS |
| ADM-03 | Désactivation compte | `{ id: 5, isActive: false }` | `{ isActive: false }` | Connexions refusées | ✓ PASS |
| ADM-04 | Audit logs filtrés | `{ entityType: "customer", action: "FREEZE" }` | Logs de gel de comptes | Filtrage correct | ✓ PASS |
| ADM-05 | Status ML retrain | `mlRetrainStatus.query()` | `{ status: "idle", lastRun: "...", nextRun: "..." }` | Statut courant | ✓ PASS |
| ADM-06 | Force ML retrain | `mlRetrain({ force: true })` | `{ success: true, status: "started" }` | Job ML lancé | ✓ PASS |

---

## 15. Déploiement & Configuration

### 15.1 Prérequis

```bash
# Versions minimales
Node.js    >= 20 LTS
PostgreSQL >= 14
Redis      >= 7
pnpm       >= 10
```

### 15.2 Installation

```bash
# 1. Cloner et installer
git clone <repo>
cd kyc-lab-ft-platforme
pnpm install

# 2. Configuration
cp .env.example .env
# Éditer .env avec les valeurs de production

# 3. Base de données
pnpm db:push          # Appliquer le schéma (dev)
# ou
pnpm db:migrate       # Migrations versionnées (prod)

# 4. Lancer en développement
pnpm dev              # Lance server + client en parallèle

# 5. Build production
pnpm build            # Build client Vite + bundle serveur esbuild
pnpm start            # Lance le serveur compilé
```

### 15.3 Variables d'environnement critiques

```bash
# Institution type (OBLIGATOIRE pour activer wallets/mobile money)
INSTITUTION_TYPE=PAYMENT_INSTITUTION
INSTITUTION_NAME=Ma Banque SA — Maroc

# Secrets (générer avec openssl rand -hex 32)
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
PII_ENCRYPTION_KEY=<openssl rand -hex 32>
MFA_ENCRYPTION_KEY=<openssl rand -hex 32>
WEBHOOK_SECRET=<openssl rand -hex 32>

# Organisation (pour les rapports GoAML)
ORG_NAME=Ma Banque SA
ORG_COUNTRY=MA
ORG_CITY=Casablanca
TRANSMISSION_MODE=SIMULATION    # Passer à REAL pour production ANRF

# Seuils AML (contexte Maroc en MAD)
AML_THRESHOLD_SINGLE_TX=100000
AML_THRESHOLD_STRUCTURING=30000
AML_STRUCTURING_WINDOW_HOURS=24
AML_FREQUENCY_THRESHOLD=10

# Liste BAM (optionnel)
BAM_SANCTIONS_URL=https://anrf.gov.ma/sanctions/liste.xml
SCREENING_STALE_THRESHOLD_HOURS=36
```

### 15.4 Séquence de démarrage recommandée

```bash
# 1. PostgreSQL + Redis opérationnels
docker compose up -d postgres redis

# 2. Migrations
pnpm db:push

# 3. Seeder (données initiales)
pnpm db:seed

# 4. Injecter les règles AML BAM par défaut
# → Via l'interface Admin > onglet "ML & Règles" > bouton "Règles AML par défaut"
# → Ou via API : POST /trpc/amlRules.seedDefaults (admin token requis)

# 5. Premier téléchargement des listes de sanctions
# → Via l'interface Admin > onglet "Screening" > bouton "Forcer le téléchargement"
# → Ou via API : POST /trpc/screening.forceRefresh

# 6. Configurer la juridiction Maroc
# → Via l'interface AML > onglet "Juridictions" > Ajouter MA
# Valeurs : singleTx=100000, structuring=30000, strDelay=24h, sarDelay=72h
```

### 15.5 Profil Docker Compose

```yaml
# Services disponibles
postgres:  # PostgreSQL 16
redis:     # Redis 7
server:    # API Node.js (port 3000)
client:    # React SPA (port 5173 en dev, Nginx en prod)
ml:        # Service ML Python (port 8000) — optionnel
minio:     # S3 compatible (port 9000) — profil s3
```

---

## 16. Glossaire

| Terme | Définition |
|-------|-----------|
| **ANRF** | Autorité Nationale du Renseignement Financier — FIU marocaine |
| **BAM** | Bank Al-Maghrib — banque centrale du Maroc |
| **SAR** | Suspicious Activity Report — déclaration d'activité suspecte |
| **STR** | Structured Transaction Report — déclaration de transaction structurée |
| **GoAML** | Logiciel de l'UNODC pour la communication avec les CRF/FIU |
| **EDD** | Enhanced Due Diligence — Diligence raisonnable renforcée |
| **pKYC** | Perpetual KYC — surveillance continue du profil de risque client |
| **PEP** | Politically Exposed Person — personne politiquement exposée |
| **UBO** | Ultimate Beneficial Owner — bénéficiaire effectif final (> 25%) |
| **AML** | Anti-Money Laundering — lutte contre le blanchiment |
| **KYC** | Know Your Customer — connaissance du client |
| **CBS** | Core Banking System — système bancaire central |
| **HMAC** | Hash-based Message Authentication Code — signature cryptographique |
| **OFAC** | Office of Foreign Assets Control — sanctions américaines |
| **SDN** | Specially Designated Nationals — liste OFAC |
| **FATF/GAFI** | Groupe d'Action Financière Internationale |
| **AMLD6** | 6th Anti-Money Laundering Directive (UE) |
| **MT940** | Format SWIFT de relevé bancaire électronique |
| **tRPC** | Type-safe Remote Procedure Call — protocole API |
| **Tier KYC** | Niveau de vérification d'identité pour les wallets mobile |
| **Structuration** | Fractionnement de transactions pour passer sous le seuil de déclaration |
| **Dormant** | Compte / wallet sans activité pendant > 90 jours |

---

*Document généré automatiquement à partir du code source — KYC-AML Lab Platform v2.5*
*Date : Avril 2026 — Contexte réglementaire : Maroc / Bank Al-Maghrib*
