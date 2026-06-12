# Guide Correspondent Banking — FATF R.13

> Gestion des relations de correspondance bancaire, evaluation des risques, approbation senior management.
> Version 1.0 — Juin 2026

---

## Table des matieres

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture technique](#2-architecture-technique)
3. [Schema BDD](#3-schema-bdd)
4. [Scoring de risque FATF R.13](#4-scoring-de-risque-fatf-r13)
5. [Cycle de vie d'une banque correspondante](#5-cycle-de-vie-dune-banque-correspondante)
6. [Dual control (approbation)](#6-dual-control-approbation)
7. [Revue periodique](#7-revue-periodique)
8. [Endpoints tRPC](#8-endpoints-trpc)
9. [Interface utilisateur](#9-interface-utilisateur)
10. [Actions d'audit](#10-actions-daudit)
11. [Configuration et feature flag](#11-configuration-et-feature-flag)
12. [FAQ](#12-faq)

---

## 1. Vue d'ensemble

Le module Correspondent Banking implemente les exigences de la **Recommandation 13 du GAFI (FATF R.13)** pour la gestion des relations de correspondance bancaire transfrontalieres.

### Obligations reglementaires couvertes

| Exigence FATF R.13 | Implementation |
|---------------------|----------------|
| Evaluation prealable du correspondant | 4 criteres de scoring (0-100) |
| Connaissance de l'actionnariat | Critere `ownershipTranspScore` |
| Evaluation du dispositif AML | Critere `amlFrameworkScore` |
| Qualite de la supervision locale | Critere `supervisoryScore` |
| Approbation senior management | Workflow dual control via `approval_requests` |
| Revue periodique | `nextReviewDate` auto-calculee selon le risque |
| Interdiction des shell banks | Statut FATF (compliant / grey_list / black_list) |

### Roles et permissions

| Role | Permissions |
|------|------------|
| **Analyst** | Consulter la liste, les details, les evaluations, les stats |
| **Supervisor** | Creer une banque, suspendre une relation |
| **Compliance Officer** | Soumettre une evaluation FATF R.13 |
| **Admin** | Approuver (senior management), terminer une relation |

---

## 2. Architecture technique

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                       │
│                                                          │
│  CorrespondentPage.tsx                                   │
│  ├── FilterBar (pays, risque, statut, recherche)         │
│  ├── StatCards (total, actives, en revue, risque, echue) │
│  ├── Table (liste paginee avec badges + score bar)       │
│  ├── DetailPanel (slide-out lateral)                     │
│  ├── AssessmentModal (4 sliders FATF R.13)               │
│  ├── CreateModal (formulaire onboarding)                 │
│  └── ConfirmDialog (approve / suspend / terminate)       │
└──────────────────────┬──────────────────────────────────┘
                       │ tRPC
         ┌─────────────▼───────────────┐
         │  correspondent.router.ts     │
         │  9 endpoints (query/mutation) │
         │  Feature flag guard           │
         └─────────────┬───────────────┘
                       │
         ┌─────────────▼───────────────┐
         │  correspondent.service.ts    │
         │  Scoring FATF R.13           │
         │  Dual control integration    │
         │  Review date calculation     │
         └─────────────┬───────────────┘
                       │
         ┌─────────────▼───────────────┐
         │  PostgreSQL                  │
         │  correspondent_banks         │
         │  correspondent_assessments   │
         │  approval_requests           │
         └─────────────────────────────┘
```

### Fichiers cles

| Fichier | Role |
|---------|------|
| `server/modules/correspondent/correspondent.service.ts` | Logique metier, scoring, revue |
| `server/modules/correspondent/correspondent.router.ts` | 9 endpoints tRPC |
| `client/src/pages/CorrespondentPage.tsx` | Page complete (liste, detail, modals) |
| `drizzle/schema.ts` | Tables `correspondent_banks` + `correspondent_assessments` |
| `drizzle/migrations/0007_busy_hulk.sql` | Migration BDD |

---

## 3. Schema BDD

### Table `correspondent_banks`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | `SERIAL PK` | Identifiant auto-incremente |
| `name` | `VARCHAR(200) NOT NULL` | Nom de la banque correspondante |
| `bic` | `VARCHAR(20)` | Code BIC/SWIFT |
| `country` | `VARCHAR(3) NOT NULL` | Pays (ISO 3166-1 alpha-3) |
| `jurisdiction` | `VARCHAR(100)` | Juridiction de supervision |
| `aml_regulator` | `VARCHAR(200)` | Regulateur AML local |
| `fatf_status` | `VARCHAR(50)` | `compliant` / `grey_list` / `black_list` |
| `risk_score` | `INTEGER DEFAULT 50` | Score de risque composite (0-100) |
| `risk_level` | `ENUM` | `LOW` / `MEDIUM` / `HIGH` / `UNACCEPTABLE` |
| `status` | `ENUM` | `ACTIVE` / `UNDER_REVIEW` / `SUSPENDED` / `TERMINATED` |
| `onboarded_by` | `INTEGER FK users` | Utilisateur ayant cree la fiche |
| `approved_by` | `INTEGER FK users` | Senior management ayant approuve |
| `next_review_date` | `TIMESTAMP` | Date de prochaine revue obligatoire |
| `notes` | `TEXT` | Notes internes |
| `created_at` | `TIMESTAMP` | Date de creation |
| `updated_at` | `TIMESTAMP` | Derniere modification |

**Index :** `corr_bic_idx`, `corr_country_idx`, `corr_risk_idx`, `corr_review_idx`

### Table `correspondent_assessments`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | `SERIAL PK` | Identifiant |
| `bank_id` | `INTEGER FK CASCADE` | Banque evaluee |
| `assessed_by` | `INTEGER FK CASCADE` | Evaluateur |
| `risk_score` | `INTEGER` | Score composite (0-100) |
| `risk_level` | `ENUM` | Niveau de risque resultat |
| `aml_framework_score` | `INTEGER (0-25)` | Critere 1 : dispositif AML |
| `ownership_transp_score` | `INTEGER (0-25)` | Critere 2 : transparence actionnariat |
| `supervisory_score` | `INTEGER (0-25)` | Critere 3 : supervision locale |
| `sanctions_risk_score` | `INTEGER (0-25)` | Critere 4 : exposition sanctions |
| `findings` | `TEXT` | Conclusions et observations |
| `recommendation` | `VARCHAR(50)` | `approve` / `conditional` / `reject` |
| `approval_request_id` | `INTEGER FK` | Lien vers la demande d'approbation |
| `created_at` | `TIMESTAMP` | Date de l'evaluation |

**Index :** `corr_assess_bank_idx`, `corr_assess_date_idx`

---

## 4. Scoring de risque FATF R.13

### Les 4 criteres

Le scoring est base sur 4 criteres du GAFI, chacun note de **0 a 25** :

| # | Critere | Description | Exemples de facteurs |
|---|---------|-------------|---------------------|
| 1 | **Dispositif AML** | Solidite du programme AML/CFT du correspondant | Procedures KYC, monitoring transactions, formation, reporting SAR/STR |
| 2 | **Transparence actionnariat** | Clarte de la structure actionnariale | Beneficiaires effectifs identifies, absence de structures opaques |
| 3 | **Supervision locale** | Qualite de la supervision par le regulateur local | Regulateur reconnu, inspections regulieres, sanctions effectives |
| 4 | **Exposition sanctions** | Risque lie aux sanctions internationales | Pays sous sanctions, listes OFAC/UE, mesures restrictives |

### Calcul du score

```
Score total = amlFrameworkScore + ownershipTranspScore + supervisoryScore + sanctionsRiskScore
```

**Echelle : 0 (risque minimal) a 100 (risque maximal)**

### Niveaux de risque

| Niveau | Score | Couleur | Frequence de revue | Action |
|--------|-------|---------|-------------------|--------|
| **LOW** | 0 – 25 | Vert | Annuelle (12 mois) | Fonctionnement normal |
| **MEDIUM** | 26 – 50 | Jaune | Annuelle (12 mois) | Surveillance standard |
| **HIGH** | 51 – 75 | Orange | Semestrielle (6 mois) | Surveillance renforcee |
| **UNACCEPTABLE** | 76 – 100 | Rouge | Trimestrielle (3 mois) | Suspension ou terminaison recommandee |

### Exemple de scoring

```json
{
  "amlFrameworkScore": 18,
  "ownershipTranspScore": 12,
  "supervisoryScore": 20,
  "sanctionsRiskScore": 8,
  "total": 58,
  "riskLevel": "HIGH",
  "nextReview": "+6 mois"
}
```

---

## 5. Cycle de vie d'une banque correspondante

```
   ┌──────────┐      Evaluation     ┌──────────────┐
   │          │    + Approbation     │              │
   │  CREATE  │──────────────────────▶    ACTIVE    │
   │          │                      │              │
   └──────────┘                      └──────┬───────┘
        │                                   │
        ▼                                   │ Suspension
   ┌──────────────┐                    ┌────▼─────────┐
   │              │                    │              │
   │ UNDER_REVIEW │◀───────────────────│  SUSPENDED   │
   │              │   Reactivation     │              │
   └──────────────┘                    └──────────────┘
                                            │
                                            │ Terminaison
                                       ┌────▼─────────┐
                                       │              │
                                       │  TERMINATED  │ (definitif)
                                       │              │
                                       └──────────────┘
```

### Etapes detaillees

| Etape | Acteur | Action | Resultat |
|-------|--------|--------|----------|
| 1. Onboarding | Supervisor | `create` — renseigne nom, pays, BIC, regulateur, FATF | Statut `UNDER_REVIEW`, score initial 50 |
| 2. Evaluation | Compliance Officer | `assess` — note les 4 criteres FATF R.13 | Score et niveau calcules, revue planifiee |
| 3. Approbation | Admin (senior mgmt) | `approve` — valide la relation | Statut `ACTIVE` |
| 4. Revue periodique | Compliance Officer | `assess` — reevaluation selon planning | Score mis a jour, revue replanifiee |
| 5. Suspension | Supervisor | `suspend` — bloque la relation | Statut `SUSPENDED` |
| 6. Terminaison | Admin | `terminate` — fin definitive | Statut `TERMINATED` |

### Suspension automatique

Si une evaluation conclut a une recommandation **"reject"**, la banque est automatiquement suspendue :

```typescript
// Dans submitAssessment()
status: input.recommendation === "reject" ? "SUSPENDED" : bank.status
```

---

## 6. Dual control (approbation)

Le module implemente le **controle a quatre yeux** (dual control) pour les evaluations non negatives.

### Flux d'approbation

```
Compliance Officer             Admin (Senior Mgmt)
       │                              │
       │  assess(recommend: approve)  │
       │──────────────────────────────▶│
       │                              │
       │  ← approvalRequest created   │
       │    (status: PENDING)         │
       │                              │
       │                    approve() │
       │◀──────────────────────────── │
       │                              │
       │  → assessment submitted      │
       │    bank.status = ACTIVE      │
```

### Regles

| Recommandation | Approbation requise ? | Comportement |
|---------------|-----------------------|-------------|
| `approve` | **Oui** | Cree une `approval_request`, attend validation admin |
| `conditional` | **Oui** | Idem — approbation avec conditions |
| `reject` | **Non** | Evaluation soumise directement, banque suspendue |

### Etats de la demande d'approbation

- `PENDING` — en attente de validation
- `APPROVED` — validee par un admin → l'evaluation est soumise
- `REJECTED` — refusee → une nouvelle evaluation peut etre soumise

---

## 7. Revue periodique

### Calcul automatique de la date de revue

La date de prochaine revue est calculee automatiquement apres chaque evaluation :

| Niveau de risque | Frequence | Prochaine revue |
|-----------------|-----------|-----------------|
| LOW | Annuelle | Date evaluation + 12 mois |
| MEDIUM | Annuelle | Date evaluation + 12 mois |
| HIGH | Semestrielle | Date evaluation + 6 mois |
| UNACCEPTABLE | Trimestrielle | Date evaluation + 3 mois |

### Detection des revues echues

Le dashboard affiche le nombre de banques dont la revue est echue :

```typescript
// Dans getCorrespondentStats()
const [overdue] = await db.select({ c: count() })
  .from(correspondentBanks)
  .where(lte(correspondentBanks.nextReviewDate, now));
```

L'indicateur "Revue echue" apparait en rouge dans les KPIs lorsqu'il y a des revues en retard.

### Bonnes pratiques

- Planifier un rappel automatique 30 jours avant l'echeance
- Les banques HIGH et UNACCEPTABLE doivent etre revues en priorite
- Documenter les raisons de tout changement de score entre deux revues

---

## 8. Endpoints tRPC

### Queries (lecture)

| Endpoint | Role min | Input | Description |
|----------|----------|-------|-------------|
| `correspondent.list` | Analyst | `{ page, limit, country?, riskLevel?, status? }` | Liste paginee avec filtres |
| `correspondent.get` | Analyst | `{ id }` | Detail d'une banque |
| `correspondent.getAssessments` | Analyst | `{ id }` | Historique des evaluations |
| `correspondent.stats` | Analyst | — | KPIs dashboard |

### Mutations (ecriture)

| Endpoint | Role min | Input | Description |
|----------|----------|-------|-------------|
| `correspondent.create` | Supervisor | `{ name, country, bic?, jurisdiction?, amlRegulator?, fatfStatus?, notes? }` | Onboarding |
| `correspondent.assess` | Compliance | `{ bankId, 4 scores, findings?, recommendation }` | Evaluation FATF R.13 |
| `correspondent.approve` | Admin | `{ id }` | Approbation senior management |
| `correspondent.suspend` | Supervisor | `{ id }` | Suspension de la relation |
| `correspondent.terminate` | Admin | `{ id }` | Terminaison definitive |

### Exemples d'utilisation

```typescript
// Lister les banques HIGH risk en France
const { items, total } = await trpc.correspondent.list.query({
  page: 1, limit: 20, country: "FRA", riskLevel: "HIGH",
});

// Creer une nouvelle banque correspondante
const bank = await trpc.correspondent.create.mutate({
  name: "Banque Europeenne SA",
  country: "FRA",
  bic: "BNPAFRPP",
  jurisdiction: "Union Europeenne",
  amlRegulator: "ACPR",
  fatfStatus: "compliant",
  notes: "Partenaire historique depuis 2015",
});

// Soumettre une evaluation FATF R.13
const result = await trpc.correspondent.assess.mutate({
  bankId: bank.id,
  amlFrameworkScore: 8,     // Bon dispositif AML (risque faible)
  ownershipTranspScore: 5,  // Actionnariat clair
  supervisoryScore: 10,     // Supervision locale solide
  sanctionsRiskScore: 2,    // Faible exposition sanctions
  findings: "Dispositif AML conforme, actionnariat transparent.",
  recommendation: "approve",
});

if (result.requiresApproval) {
  // L'admin doit approuver
  await trpc.correspondent.approve.mutate({ id: bank.id });
}
```

---

## 9. Interface utilisateur

### Page principale (`/correspondent`)

La page est accessible depuis la sidebar (icone Building2) pour les utilisateurs avec le role `analyst` ou superieur, **si le feature flag `correspondentBanking` est actif**.

### Composants de la page

#### 1. Barre de filtres

| Filtre | Type | Description |
|--------|------|-------------|
| Recherche | Texte | Filtre par nom ou BIC (cote client) |
| Pays | Input ISO 3 | Filtre par code pays (cote serveur) |
| Niveau de risque | Select | LOW / MEDIUM / HIGH / UNACCEPTABLE |
| Statut | Select | Actif / En revue / Suspendu / Termine |

#### 2. KPIs (5 cartes)

| Carte | Metrique | Accent |
|-------|----------|--------|
| Total | Nombre total de banques | Default |
| Actives | Banques en statut ACTIVE | Success (vert) |
| En revue | Banques UNDER_REVIEW | Warning (jaune) |
| Haut risque | Banques niveau HIGH | Danger (rouge) |
| Revue echue | Banques dont la revue est en retard | Danger si > 0 |

#### 3. Tableau principal

8 colonnes : Banque, Pays/Juridiction, FATF, Score risque (barre), Niveau (badge), Statut (badge), Prochaine revue, Actions.

- Clic sur le nom → ouvre le **panel lateral**
- Bouton oeil → ouvre le panel lateral
- Bouton bouclier → ouvre le **modal d'evaluation**

#### 4. Panel lateral (detail)

Affiche pour une banque selectionnee :
- Score visuel circulaire (ScoreBadge)
- Informations completes (pays, juridiction, regulateur, FATF)
- Prochaine revue (avec alerte si echue)
- Notes internes
- Boutons d'action : Evaluer, Approuver, Suspendre, Terminer
- Historique des evaluations avec breakdown des 4 criteres

#### 5. Modal d'evaluation FATF R.13

- 4 sliders (0-25) pour chaque critere
- Apercu du score total en temps reel (ScoreBadge + Badge risque)
- Zone de texte pour les conclusions
- Selection de la recommandation (3 boutons : Approuver / Conditionnel / Rejeter)
- Feedback inline (erreurs, succes)

#### 6. Modal de creation

Formulaire d'onboarding avec : nom, BIC, pays, juridiction, regulateur, statut FATF, notes.

#### 7. Dialogs de confirmation

Avant toute action sensible (approuver, suspendre, terminer), un dialog demande confirmation avec :
- Titre et description de l'action
- Bouton de confirmation (vert pour approuver, rouge pour suspendre/terminer)
- Indicateur de chargement pendant l'execution

---

## 10. Actions d'audit

Toutes les mutations sont tracees dans l'audit trail :

| Action | Declencheur | Details enregistres |
|--------|-------------|-------------------|
| `CORRESPONDENT_CREATED` | `create` | name, country, bic |
| `CORRESPONDENT_ASSESSED` | `assess` | riskScore, riskLevel, recommendation |
| `CORRESPONDENT_APPROVED` | `approve` | approvedBy (user ID) |
| `CORRESPONDENT_SUSPENDED` | `suspend` / `terminate` | action type |
| `APPROVAL_REQUESTED` | `assess` (si approbation requise) | dualControl, approvalId, recommendation |

---

## 11. Configuration et feature flag

### Activation du module

Le module est actif uniquement si le feature flag `correspondentBanking` est `true`.

**Via licence :**

Le module `correspondent` dans la licence active automatiquement le flag :

```typescript
// shared/license.types.ts
correspondent: ["correspondentBanking"]
```

**Via mode legacy (sans licence) :**

Le flag est active par defaut pour le type `CLASSIC_BANK` :

```typescript
// server/_core/institution.ts — FLAGS_BY_TYPE
CLASSIC_BANK: { correspondentBanking: true, ... }
```

### Packs incluant le module

| Pack | Correspondent Banking |
|------|----------------------|
| Essential | Non |
| Standard | Oui |
| Mobile | Oui |
| Enterprise | Oui |

### Migration BDD

```bash
npx drizzle-kit push
# ou
npx drizzle-kit generate && npx drizzle-kit migrate
```

La migration `0007_busy_hulk.sql` cree les tables, enums et index necessaires.

---

## 12. FAQ

### Quelle est la difference entre suspension et terminaison ?

La **suspension** est reversible — la relation peut etre reactivee apres une nouvelle evaluation. La **terminaison** est definitive — la relation ne peut plus etre reactivee.

### Qui peut approuver une relation de correspondance ?

Seul un **admin** (representant le senior management) peut approuver. C'est une exigence de la FATF R.13 qui impose l'approbation de la direction generale.

### Que se passe-t-il si une evaluation donne un score UNACCEPTABLE ?

La frequence de revue passe a **3 mois**. Si la recommandation est "reject", la banque est **automatiquement suspendue**. Il est recommande de terminer les relations UNACCEPTABLE persistantes.

### Peut-on modifier les informations d'une banque apres creation ?

Les informations sont mises a jour indirectement via les evaluations (score, niveau, date de revue). Le nom, BIC, pays et autres champs descriptifs sont fixes a la creation.

### Comment fonctionne le dual control ?

Lorsqu'un compliance officer recommande "approve" ou "conditional", une demande d'approbation est automatiquement creee. Un admin doit la valider avant que l'evaluation soit enregistree et la banque activee. Ce mecanisme garantit le controle a quatre yeux exige par la reglementation.

### Le module necessite-t-il une connexion internet ?

Non. Toute la logique est locale. Les donnees FATF (grey_list, black_list) sont saisies manuellement lors de l'onboarding — il n'y a pas de synchronisation automatique avec les listes du GAFI.

### Comment detecter les revues en retard ?

Le KPI "Revue echue" sur le dashboard affiche le nombre de banques dont `next_review_date` est depassee. Un indicateur rouge et une icone d'alerte apparaissent egalement dans la colonne "Prochaine revue" du tableau.
