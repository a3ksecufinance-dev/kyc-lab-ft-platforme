# Guide Licensing — KYC-AML Platform

> Système de gestion des licences modulaires par type d'institution.
> Version 1.0 — Juin 2026

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture technique](#2-architecture-technique)
3. [Les 13 modules](#3-les-13-modules)
4. [Les 4 packs commerciaux](#4-les-4-packs-commerciaux)
5. [Format de la clé de licence](#5-format-de-la-clé-de-licence)
6. [Générer une licence](#6-générer-une-licence)
7. [Activer une licence](#7-activer-une-licence)
8. [Mode développement (sans licence)](#8-mode-développement-sans-licence)
9. [Gestion des sièges](#9-gestion-des-sièges)
10. [Expiration et période de grâce](#10-expiration-et-période-de-grâce)
11. [Interface d'administration](#11-interface-dadministration)
12. [Configuration production](#12-configuration-production)
13. [Sécurité](#13-sécurité)
14. [FAQ](#14-faq)

---

## 1. Vue d'ensemble

Le système de licensing permet de commercialiser la plateforme KYC/AML **module par module**, avec contrôle du nombre d'utilisateurs et de la durée de validité.

### Deux modes de fonctionnement

| Mode | Condition | Comportement |
|------|-----------|-------------|
| **Licence** (production) | `LICENSE_KEY` et `LICENSE_SIGNING_SECRET` configurés | Les feature flags sont dérivés des modules présents dans la licence |
| **Legacy** (développement) | Pas de `LICENSE_KEY` | Les feature flags suivent la matrice `INSTITUTION_TYPE` (tout activé selon le type) |

Le mode legacy est **100% rétrocompatible** — aucun changement de comportement pour les déploiements existants sans licence.

---

## 2. Architecture technique

```
┌───────────────────────────────────────────────────────┐
│                   CLÉ DE LICENCE                       │
│        LIC.{base64url(payload)}.{base64url(hmac)}      │
└──────────────────────┬────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │  server/_core/license.ts │
         │  - Décode le payload     │
         │  - Vérifie HMAC-SHA256   │
         │  - Cache singleton       │
         └────────────┬────────────┘
                      │
         ┌────────────▼────────────┐
         │ server/_core/institution│
         │ buildFlagsFromLicense() │
         │ MODULE_TO_FLAGS mapping │
         └────────────┬────────────┘
                      │
         ┌────────────▼────────────┐
         │  InstitutionFeatureFlags │  ← identiques à avant
         │  wallets: true/false     │
         │  bamReports: true/false  │
         │  ...                     │
         └──────────────────────────┘
```

### Fichiers clés

| Fichier | Rôle |
|---------|------|
| `shared/license.types.ts` | Types partagés : modules, packs, payload, mapping |
| `server/_core/license.ts` | Validation HMAC, décodage, singleton |
| `server/_core/institution.ts` | Dérivation feature flags (licence OU legacy) |
| `server/modules/license/license.service.ts` | Activation, sièges, historique BDD |
| `server/modules/license/license.router.ts` | Endpoints tRPC (6 routes) |
| `scripts/generate-license.ts` | CLI de génération de clés |
| `client/src/pages/LicensePage.tsx` | Page admin frontend |
| `drizzle/schema.ts` | Table `licenses` |

---

## 3. Les 13 modules

| Module | Identifiant | Contenu | Cible |
|--------|------------|---------|-------|
| **Core KYC/AML** | `core` | KYC clients, screening sanctions, alertes, dossiers, documents, audit trail, dual control | Tous |
| **Moteur AML** | `aml_engine` | 11 règles AML + règles dynamiques JSON + seuils configurables | Tous |
| **Wallets** | `wallets` | Gestion wallets, tiers KYC (Allégé/Standard/Renforcé), import CSV | Microfinance, EP |
| **Règles AML Wallet** | `wallet_aml` | 5 règles AML spécifiques mobile money (P2P velocity, agent mule, etc.) | Microfinance, EP |
| **Réseau Agents** | `agents` | Gestion des agents/distributeurs, comptes agents | Microfinance, EP |
| **Banques Correspondantes** | `correspondent` | FATF R.13, évaluation risque, dual control, revue annuelle | Banques, EP |
| **eKYC** | `ekyc` | OCR documents, vérification identité, Enhanced Due Diligence | Tous |
| **Reporting** | `reporting` | SAR/STR, TRACFIN XML, GoAML, export réglementaire | Tous |
| **Rapports BAM** | `bam_reports` | Rapports spécifiques Bank Al-Maghrib (circulaire EP marocains) | EP Maroc |
| **Perpetual KYC** | `pkyc` | Score de dérive comportementale, revues KYC automatiques | Premium |
| **Travel Rule** | `travel_rule` | FATF Travel Rule, transferts internationaux | Banques, EP |
| **Scoring ML** | `ml_scoring` | XGBoost + Isolation Forest, ré-entraînement automatique | Premium |
| **Intégration CBS** | `cbs_connect` | Webhooks entrants, SDK sortant, connecteurs mobile money | Tous |

### Mapping modules → feature flags

Chaque module active un ou plusieurs feature flags existants :

```
wallets      → wallets, walletKyc, mobileTransactionTypes
wallet_aml   → walletAml
agents       → agentAccounts, agentNetwork
correspondent→ correspondentBanking
ekyc         → enhancedOnboarding
bam_reports  → bamReports
cbs_connect  → mobileConnectors
```

Les modules `core`, `aml_engine`, `reporting`, `pkyc`, `travel_rule`, `ml_scoring` n'ont pas de feature flags — ils sont disponibles dès que la licence est valide.

---

## 4. Les 4 packs commerciaux

| Pack | Modules inclus | Cas d'usage |
|------|---------------|-------------|
| **Essential** | core, aml_engine, reporting | Petites structures, conformité de base |
| **Standard** | Essential + ekyc, cbs_connect | Banques classiques |
| **Mobile** | Standard + wallets, wallet_aml, agents | Microfinance, établissements de paiement |
| **Enterprise** | Tous les 13 modules | Grandes institutions |

Les packs sont des **presets** — il est possible de créer des combinaisons sur mesure avec `--modules`.

---

## 5. Format de la clé de licence

La clé de licence est un token signé HMAC-SHA256 au format :

```
LIC.{base64url(payload_json)}.{base64url(signature_hmac)}
```

### Payload JSON

```json
{
  "lid": "fb53cd1d-386b-4d74-be23-3fd6c821a347",
  "client": "Banque Al Amal SA",
  "type": "PAYMENT_INSTITUTION",
  "modules": ["core", "aml_engine", "wallets", "wallet_aml", "agents", ...],
  "maxUsers": 25,
  "iat": 1781278889,
  "exp": 1812382889
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `lid` | UUID | Identifiant unique de la licence |
| `client` | string | Nom du client |
| `type` | enum | `CLASSIC_BANK`, `MICROFINANCE`, `PAYMENT_INSTITUTION` |
| `modules` | string[] | Liste des modules activés |
| `maxUsers` | number | Nombre max d'utilisateurs actifs simultanés |
| `iat` | number | Timestamp d'émission (epoch seconds) |
| `exp` | number | Timestamp d'expiration (epoch seconds) |

---

## 6. Générer une licence

### Prérequis

- Node.js 22+
- Un secret de signature d'au moins 32 caractères

### Avec un pack prédéfini

```bash
npx tsx scripts/generate-license.ts \
  --client "Banque Al Amal SA" \
  --type PAYMENT_INSTITUTION \
  --pack enterprise \
  --users 25 \
  --months 12 \
  --secret "votre-secret-de-signature-32-chars-min" \
  --verify
```

### Avec des modules individuels

```bash
npx tsx scripts/generate-license.ts \
  --client "Petite Banque" \
  --type CLASSIC_BANK \
  --modules core,aml_engine,reporting,ekyc,correspondent \
  --users 10 \
  --months 6 \
  --secret "votre-secret"
```

### Options du script

| Option | Requis | Description |
|--------|--------|-------------|
| `--client` | Oui | Nom du client |
| `--type` | Oui | Type d'institution |
| `--pack` | Oui* | Pack prédéfini (essential/standard/mobile/enterprise) |
| `--modules` | Oui* | Modules séparés par virgule |
| `--users` | Non | Nombre max d'utilisateurs (défaut: 25) |
| `--months` | Non | Durée en mois (défaut: 12) |
| `--secret` | Oui | Clé de signature (ou env `LICENSE_SIGNING_SECRET`) |
| `--verify` | Non | Vérifier la clé générée |
| `--help` | Non | Afficher l'aide |

*`--pack` ou `--modules` requis (pas les deux).

Le module `core` est **automatiquement ajouté** s'il n'est pas dans la liste.

---

## 7. Activer une licence

### Méthode 1 : Variable d'environnement (recommandé)

Ajouter dans `.env.production` :

```env
LICENSE_KEY=LIC.eyJsaW...signature
LICENSE_SIGNING_SECRET=votre-secret-de-signature-32-chars-min
```

La licence est validée au **démarrage du serveur**. Le log affiche :

```
✅ Licence active : Banque Al Amal SA — 13 modules — expire dans 365j
```

### Méthode 2 : Interface admin

1. Se connecter en tant qu'administrateur
2. Aller dans **Système > Licence** (sidebar)
3. Coller la clé de licence dans le champ d'activation
4. Cliquer sur **Activer**

La licence est immédiatement active. Un redémarrage du serveur est recommandé pour appliquer les changements à tous les processus.

### Méthode 3 : API tRPC

```typescript
// Appel tRPC (admin uniquement)
const result = await trpc.license.activate.mutate({
  licenseKey: "LIC.eyJsaW...signature"
});
// result.success === true
```

---

## 8. Mode développement (sans licence)

Quand `LICENSE_KEY` n'est pas configuré, la plateforme fonctionne en **mode legacy** :

- Les feature flags sont dérivés de `INSTITUTION_TYPE` (env var)
- Tous les modules du type choisi sont activés
- Pas de limite de sièges
- Pas d'expiration

C'est le mode recommandé pour le développement local et les tests.

---

## 9. Gestion des sièges

Le champ `maxUsers` de la licence définit le nombre maximum d'**utilisateurs actifs** simultanés.

- Le comptage se fait sur les utilisateurs avec `isActive = true` dans la table `users`
- La vérification est effectuée :
  - Via l'endpoint `license.checkSeat` (page admin)
  - Le dépassement **n'empêche pas** le login des utilisateurs existants
  - Il **empêche** la création de nouveaux utilisateurs au-delà de la limite

### Vérification

```bash
# Via l'API (admin)
trpc.license.checkSeat.query()
# → { ok: true, current: 12, max: 25 }
```

---

## 10. Expiration et période de grâce

| Phase | Durée | Comportement |
|-------|-------|-------------|
| **Active** | Jusqu'à `exp` | Fonctionnement normal |
| **Grâce** | 15 jours après `exp` | Lecture seule — bannière d'avertissement |
| **Expirée** | Après la grâce | Tous les modules désactivés |

### Comportement en période de grâce

- Les données existantes restent **accessibles en lecture**
- Aucune **nouvelle donnée** ne peut être créée
- Un bandeau d'avertissement s'affiche dans l'interface
- Les logs serveur indiquent le nombre de jours restants

### Comportement après expiration

- Tous les feature flags passent à `false`
- Seule la page de licence admin reste accessible
- Le système revient à un état minimal (login + page licence)

---

## 11. Interface d'administration

La page `/license` (accessible aux administrateurs uniquement) affiche :

### KPIs

| Carte | Information |
|-------|-----------|
| **Statut** | Active / Grâce / Expirée / Mode dev |
| **Modules** | X / 13 modules activés |
| **Sièges** | X / Y utilisateurs actifs |
| **Expiration** | Date + jours restants |

### Grille des modules

Affichage visuel des 13 modules avec statut activé/désactivé.

### Activation

Champ de saisie pour coller une nouvelle clé de licence. L'activation :
1. Vérifie la signature HMAC
2. Vérifie l'expiration
3. Révoque la licence précédente
4. Enregistre la nouvelle licence en BDD
5. Trace l'action dans l'audit trail

### Historique

Tableau des licences précédentes avec client, type, modules, sièges, expiration et statut.

---

## 12. Configuration production

### Variables d'environnement

```env
# ─── Licensing ───────────────────────────────────────────────
# Clé de licence générée par scripts/generate-license.ts
LICENSE_KEY=LIC.xxxxx.xxxxx

# Secret de signature — DOIT correspondre au secret utilisé pour générer la clé
# Minimum 32 caractères
LICENSE_SIGNING_SECRET=votre-secret-de-signature-production

# ─── Institution (fallback si pas de licence) ────────────────
INSTITUTION_TYPE=CLASSIC_BANK
INSTITUTION_NAME=Votre Banque SA
```

### Docker Compose

Les variables sont injectées via le fichier `.env.production` :

```yaml
services:
  app:
    env_file: .env.production
    # LICENSE_KEY et LICENSE_SIGNING_SECRET sont lus au démarrage
```

### Migration BDD

La table `licenses` doit être créée. Exécuter :

```bash
npx drizzle-kit push
# ou
npx drizzle-kit generate && npx drizzle-kit migrate
```

---

## 13. Sécurité

### Protection de la clé de signature

Le `LICENSE_SIGNING_SECRET` est le secret critique du système :

- **Ne jamais** le committer dans le code source
- **Ne jamais** le partager avec le client
- Le stocker dans un **coffre-fort** (HashiCorp Vault, AWS Secrets Manager)
- Utiliser un secret **différent** par environnement

### Protection de la clé de licence

La clé de licence (`LICENSE_KEY`) est un token signé :

- Elle peut être partagée avec le client (elle ne contient pas le secret)
- Elle ne peut **pas être modifiée** sans le secret de signature
- Elle contient les modules, sièges, et dates en clair (base64url)

### Audit

Toute activation de licence est tracée dans l'audit trail :

- Action : `LICENSE_ACTIVATED`
- Détails : nom client, modules, sièges, expiration
- Utilisateur : admin qui a effectué l'activation
- IP et User-Agent enregistrés

---

## 14. FAQ

### Puis-je changer les modules sans regénérer la licence ?

Non. La clé est signée — toute modification invalidera la signature. Il faut générer une nouvelle clé.

### Que se passe-t-il si le client modifie la clé ?

La vérification HMAC échouera. Le système passera en mode `INVALID` et aucun module ne sera activé.

### Puis-je avoir plusieurs licences actives ?

Non. L'activation d'une nouvelle licence **révoque automatiquement** la précédente.

### Le mode dev est-il sécurisé en production ?

Non. Sans licence, tous les modules sont activés. En production, toujours configurer `LICENSE_KEY`.

### Comment renouveler une licence ?

1. Générer une nouvelle clé avec `generate-license.ts`
2. L'activer via l'interface admin ou la variable d'environnement
3. L'ancienne licence est automatiquement révoquée

### Le système a-t-il besoin d'une connexion internet ?

Non. La validation est **entièrement locale** (HMAC-SHA256). Aucun appel réseau n'est effectué — compatible déploiement on-premise air-gapped.
