# Guide Wallets Phase B — Renforcement Conformité

> Scoring risque, gel réglementaire, enforcement limites, réconciliation CBS.
> Version 1.0 — Juin 2026

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Scoring risque wallet](#2-scoring-risque-wallet)
3. [Gel réglementaire (freeze)](#3-gel-réglementaire-freeze)
4. [Enforcement temps réel des limites](#4-enforcement-temps-réel-des-limites)
5. [Réconciliation solde CBS](#5-réconciliation-solde-cbs)
6. [Nouveaux endpoints tRPC](#6-nouveaux-endpoints-trpc)
7. [Actions d'audit](#7-actions-daudit)
8. [Modifications de schéma](#8-modifications-de-schéma)
9. [Migration BDD](#9-migration-bdd)
10. [FAQ](#10-faq)

---

## 1. Vue d'ensemble

La Phase B renforce le module wallets avec 4 fonctionnalités de conformité :

| Fonctionnalité | Objectif | Rôle minimum |
|----------------|----------|-------------|
| **Scoring risque** | Évaluer le risque de chaque wallet (0–100) | Supervisor |
| **Gel réglementaire** | Bloquer un wallet sur décision réglementaire | Compliance Officer |
| **Enforcement limites** | Vérifier les plafonds AVANT chaque transaction | Analyst |
| **Réconciliation CBS** | Comparer les soldes locaux vs Core Banking System | Compliance Officer |

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `drizzle/schema.ts` | +5 colonnes, +2 index sur la table `wallets` |
| `server/modules/wallets/wallets.service.ts` | +6 fonctions (~200 lignes) |
| `server/modules/wallets/wallets.router.ts` | +6 endpoints tRPC |
| `server/_core/audit.ts` | +4 actions d'audit |

---

## 2. Scoring risque wallet

### Principe

Chaque wallet reçoit un **score de risque de 0 à 100**, décomposé en 5 facteurs pondérés :

| # | Facteur | Points max | Détail |
|---|---------|-----------|--------|
| 1 | Transactions suspectes (30j) | **+30** | +10 par transaction suspecte, plafonné à 30 |
| 2 | Alertes ouvertes | **+25** | +8 par alerte ouverte du client, plafonné à 25 |
| 3 | Utilisation % des plafonds | **+15** | Basé sur le max(daily%, monthly%) — ≥100%: 15, ≥90%: 12, ≥70%: 8, ≥50%: 4 |
| 4 | Dormance / réactivation | **+15** | Réactivation <30j: 15, <90j: 8, dormant actuel: 5 |
| 5 | Risque client (hérité) | **+15** | 15% du score de risque du client propriétaire |

### Niveaux de risque

| Niveau | Score | Couleur suggérée |
|--------|-------|-----------------|
| **LOW** | 0 – 29 | 🟢 Vert |
| **MEDIUM** | 30 – 59 | 🟡 Jaune |
| **HIGH** | 60 – 79 | 🟠 Orange |
| **CRITICAL** | 80 – 100 | 🔴 Rouge |

### Colonnes BDD

```sql
ALTER TABLE wallets ADD COLUMN wallet_risk_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wallets ADD COLUMN wallet_risk_level VARCHAR(20) NOT NULL DEFAULT 'LOW';
CREATE INDEX wallets_risk_score_idx ON wallets (wallet_risk_score);
```

### Utilisation

```typescript
// Calculer le risque d'un wallet spécifique
const result = await trpc.wallets.calculateRisk.mutate({ walletId: 42 });
// → { walletId: 42, score: 65, level: "HIGH", factors: { ... }, wallet: { ... } }

// Recalculer tous les wallets actifs (batch)
const batch = await trpc.wallets.recalculateAllRisks.mutate();
// → { total: 1500, updated: 1498, errors: 2 }
```

### Détail des facteurs retournés

```json
{
  "factors": {
    "suspiciousTransactions": { "count": 2, "points": 20 },
    "openAlerts": { "count": 1, "points": 8 },
    "limitUsage": { "maxPct": 85, "points": 8 },
    "dormancy": { "points": 0 },
    "customerRisk": { "score": 45, "points": 7 }
  }
}
```

---

## 3. Gel réglementaire (freeze)

### Distinction gel vs suspension

| | Suspension (`isActive=false`) | Gel réglementaire (`frozenAt`) |
|--|-------------------------------|-------------------------------|
| **Nature** | Opérationnelle | Réglementaire / judiciaire |
| **Motif** | Inactivité, fraude suspectée | Décision officielle (tribunal, régulateur) |
| **Rôle** | Supervisor | Compliance Officer |
| **Traçabilité** | Basique (audit) | Complète (motif, auteur, horodatage en BDD) |
| **Réversibilité** | Immédiate | Nécessite autorisation compliance |

### Colonnes BDD

```sql
ALTER TABLE wallets ADD COLUMN frozen_at TIMESTAMP;
ALTER TABLE wallets ADD COLUMN frozen_reason TEXT;
ALTER TABLE wallets ADD COLUMN frozen_by INTEGER REFERENCES users(id);
CREATE INDEX wallets_frozen_idx ON wallets (frozen_at);
```

### Utilisation

```typescript
// Geler un wallet
await trpc.wallets.freeze.mutate({
  walletId: 42,
  reason: "Décision tribunal de commerce Casablanca — dossier n°2026/1234",
});

// Dégeler un wallet
await trpc.wallets.unfreeze.mutate({ walletId: 42 });
```

### Comportement

- Un wallet gelé est **bloqué** par `checkWalletLimits()` — aucune transaction ne passe
- Le motif de gel est affiché dans les raisons de blocage
- Le gel est **cumulable** avec la suspension : un wallet peut être à la fois suspendu ET gelé
- L'action est tracée dans l'audit trail (`WALLET_FROZEN` / `WALLET_UNFROZEN`)

### Protections

- Impossible de geler un wallet déjà gelé (erreur explicite)
- Impossible de dégeler un wallet non gelé
- Seul un `compliance_officer` ou `admin` peut geler/dégeler

---

## 4. Enforcement temps réel des limites

### Principe

La fonction `checkWalletLimits(walletId, amount)` vérifie **4 conditions** avant qu'une transaction soit autorisée :

| # | Vérification | Condition de blocage |
|---|-------------|---------------------|
| 1 | **Gel réglementaire** | `frozenAt IS NOT NULL` |
| 2 | **Suspension** | `isActive = false` |
| 3 | **Plafonds de tier** | Usage journalier ou mensuel + montant > limite |
| 4 | **Montant unitaire** | Montant > plafond journalier du tier |

### Plafonds BAM par tier

| Tier | Plafond journalier | Plafond mensuel |
|------|-------------------|----------------|
| **ALLÉGÉ** | 5 000 MAD | 20 000 MAD |
| **STANDARD** | 50 000 MAD | 200 000 MAD |
| **RENFORCÉ** | 500 000 MAD | 2 000 000 MAD |

Les limites personnalisées (`dailyLimit`, `monthlyLimit` sur le wallet) ont priorité sur les limites de tier.

### Utilisation

```typescript
const check = await trpc.wallets.checkLimits.query({
  walletId: 42,
  amount: 15000,
});

if (!check.allowed) {
  console.error("Transaction bloquée :", check.reasons);
  // ["Plafond journalier dépassé : 18000 / 5000 MAD (tier ALLEGED)"]
}
```

### Réponse

```json
{
  "allowed": false,
  "walletId": 42,
  "amount": 15000,
  "currency": "MAD",
  "tier": "ALLEGED",
  "dailyUsed": 3000,
  "dailyLimit": 5000,
  "monthlyUsed": 12000,
  "monthlyLimit": 20000,
  "reasons": [
    "Plafond journalier dépassé : 18000 / 5000 MAD (tier ALLEGED)"
  ]
}
```

### Intégration recommandée

Appeler `checkWalletLimits()` **avant** toute insertion dans la table `transactions` :

```typescript
// Dans votre flow de création de transaction
const check = await checkWalletLimits(walletId, amount);
if (!check.allowed) {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: check.reasons.join(" | "),
  });
}
// → Sinon, procéder à l'insertion
```

---

## 5. Réconciliation solde CBS

### Principe

Compare les soldes des wallets stockés localement avec les soldes fournis par le Core Banking System (CBS). Détecte les écarts supérieurs à **0.01** (1 centime).

### Utilisation

```typescript
const result = await trpc.wallets.reconcileCbs.mutate({
  entries: [
    { walletId: "WAL-ABC123", cbsBalance: 15000.00, cbsCurrency: "MAD" },
    { walletId: "WAL-DEF456", cbsBalance: 8750.50,  cbsCurrency: "MAD" },
    // ... jusqu'à 10 000 entrées
  ],
});
```

### Réponse

```json
{
  "total": 2,
  "matched": 1,
  "discrepancies": 1,
  "details": [
    {
      "walletId": "WAL-DEF456",
      "localBalance": 8800.00,
      "cbsBalance": 8750.50,
      "difference": 49.50,
      "currency": "MAD"
    }
  ]
}
```

### Flux recommandé

1. **Export CBS** : extraire les soldes du CBS (format CSV ou API)
2. **Appel API** : envoyer les entrées via `reconcileCbs`
3. **Analyse** : examiner les écarts dans `details`
4. **Action** : corriger manuellement ou déclencher une investigation

### Limites

- Maximum **10 000 entrées** par appel
- Les wallets non trouvés en BDD sont **ignorés** (pas comptés en erreur)
- Tolérance de **0.01** (1 centime) pour les arrondis
- L'action est tracée dans l'audit trail (`CBS_RECONCILIATION`)

---

## 6. Nouveaux endpoints tRPC

| Endpoint | Méthode | Rôle min | Description |
|----------|---------|----------|-------------|
| `wallets.calculateRisk` | mutation | Supervisor | Calculer le risque d'un wallet |
| `wallets.recalculateAllRisks` | mutation | Compliance | Recalculer tous les wallets actifs |
| `wallets.freeze` | mutation | Compliance | Geler un wallet (réglementaire) |
| `wallets.unfreeze` | mutation | Compliance | Dégeler un wallet |
| `wallets.checkLimits` | query | Analyst | Vérifier les limites avant transaction |
| `wallets.reconcileCbs` | mutation | Compliance | Réconciliation soldes CBS |

---

## 7. Actions d'audit

| Action | Déclencheur | Détails enregistrés |
|--------|-------------|-------------------|
| `WALLET_RISK_CALCULATED` | `calculateRisk` / `recalculateAllRisks` | score, level, factors |
| `WALLET_FROZEN` | `freeze` | walletId, reason |
| `WALLET_UNFROZEN` | `unfreeze` | walletId |
| `CBS_RECONCILIATION` | `reconcileCbs` | total, matched, discrepancies |

---

## 8. Modifications de schéma

### Table `wallets` — colonnes ajoutées

| Colonne | Type | Default | Description |
|---------|------|---------|-------------|
| `wallet_risk_score` | `INTEGER NOT NULL` | `0` | Score de risque 0–100 |
| `wallet_risk_level` | `VARCHAR(20) NOT NULL` | `'LOW'` | Niveau : LOW, MEDIUM, HIGH, CRITICAL |
| `frozen_at` | `TIMESTAMP` | `NULL` | Date/heure du gel |
| `frozen_reason` | `TEXT` | `NULL` | Motif du gel réglementaire |
| `frozen_by` | `INTEGER FK users(id)` | `NULL` | Utilisateur ayant effectué le gel |

### Index ajoutés

| Index | Colonne |
|-------|---------|
| `wallets_risk_score_idx` | `wallet_risk_score` |
| `wallets_frozen_idx` | `frozen_at` |

---

## 9. Migration BDD

Appliquer les changements de schéma :

```bash
npx drizzle-kit push
# ou
npx drizzle-kit generate && npx drizzle-kit migrate
```

---

## 10. FAQ

### Le scoring est-il automatique ?

Non. Le score est calculé **à la demande** via `calculateRisk` ou en batch via `recalculateAllRisks`. Pour un scoring automatique, planifier un CRON appelant `recalculateAllRisks` (ex: toutes les heures).

### Un wallet peut-il être gelé ET suspendu ?

Oui. Les deux mécanismes sont indépendants. `checkWalletLimits()` vérifie les deux conditions.

### Que se passe-t-il si un wallet est gelé pendant une transaction en cours ?

La vérification se fait **avant** la transaction. Une transaction déjà enregistrée n'est pas annulée par un gel postérieur.

### Les limites personnalisées ont-elles priorité sur les limites de tier ?

Oui. Si `dailyLimit` ou `monthlyLimit` sont définis sur le wallet, ils remplacent les plafonds BAM du tier.

### La réconciliation CBS modifie-t-elle les soldes ?

Non. Elle est **en lecture seule** — elle détecte et rapporte les écarts sans les corriger. La correction est manuelle.
