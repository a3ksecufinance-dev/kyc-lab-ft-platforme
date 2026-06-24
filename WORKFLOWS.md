# Plateforme KYC-AML — Documentation des Workflows
**Version 3.0 — Juin 2026**

---

## Table des matières

1. [Architecture générale](#1-architecture-générale)
2. [Intégration CBS — Onboarding](#2-intégration-cbs--onboarding)
3. [Cycle de vie des documents (Oscillation)](#3-cycle-de-vie-des-documents-oscillation)
4. [Moteur AML — Détection des alertes](#4-moteur-aml--détection-des-alertes)
5. [Screening sanctions & PEP](#5-screening-sanctions--pep)
6. [Liste blanche (Good Guys List)](#6-liste-blanche-good-guys-list)
7. [Règles de silence (Silencing Rules)](#7-règles-de-silence-silencing-rules)
8. [pKYC — Surveillance comportementale continue](#8-pkyc--surveillance-comportementale-continue)
9. [Gestion des alertes](#9-gestion-des-alertes)
10. [Gestion des dossiers (Cases)](#10-gestion-des-dossiers-cases)
11. [Rapports SAR / STR](#11-rapports-sar--str)
12. [Dual Control (Approbations)](#12-dual-control-approbations)
13. [Dashboard Direction — KPIs AMLD6](#13-dashboard-direction--kpis-amld6)
14. [Schedulers automatiques](#14-schedulers-automatiques)

---

## 1. Architecture générale

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PLATEFORME KYC-AML v2                           │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │   CBS    │  │ Analysts │  │Supervisors│  │Compliance Officers │ │
│  │(Banking) │  │ (Web UI) │  │ (Web UI) │  │    (Web UI)        │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬───────────┘ │
│       │             │              │                  │              │
│  ┌────▼─────────────▼──────────────▼──────────────────▼───────────┐ │
│  │              API REST + tRPC (port 3000)                        │ │
│  │  /api/cbs/*  — Intégration CBS                                  │ │
│  │  /api/documents/upload — Upload multipart                       │ │
│  │  /trpc/* — Toutes les opérations plateforme                     │ │
│  └─────────────────────────┬───────────────────────────────────────┘ │
│                             │                                         │
│  ┌──────────┐  ┌────────────▼────────┐  ┌──────────────────────┐   │
│  │  Redis   │  │    PostgreSQL        │  │  Stockage fichiers   │   │
│  │ (cache   │  │  (données, alertes,  │  │  (local / S3)        │   │
│  │  listes) │  │   documents, audits) │  │                      │   │
│  └──────────┘  └─────────────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Intégration CBS — Onboarding

### Endpoint principal : `POST /api/cbs/onboarding`
**Auth** : `X-CBS-Api-Key: <clé>` | **Format** : JSON

### Pipeline synchrone (< 5 secondes)

```
CBS envoie :
{ ID, code, nom, prenom, date_naissance, CIN, nationalite,
  ville_naissance, pays_naissance, document?: { type, expiryDate,
  imageBase64?, mimeType? } }
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  1. Validation payload (nom, CIN, date_naissance)   │
│     → REJECTED si champs obligatoires manquants     │
├─────────────────────────────────────────────────────┤
│  2. Détection doublon CIN                           │
│     → IN_REVIEW si CIN déjà en base                │
├─────────────────────────────────────────────────────┤
│  3. Création client                                 │
│     (nicNumber, birthCity, birthCountry, cbsRef)    │
├─────────────────────────────────────────────────────┤
│  4. Screening sanctions (OFAC/EU/UN/UK)            │
│     → REJECTED si MATCH ≥ 85 (UC-2)               │
│     → IN_REVIEW si REVIEW 70-84                     │
├─────────────────────────────────────────────────────┤
│  5. Screening PEP séparé                           │
│     → IN_REVIEW + EDD si score ≥ 70 (UC-3)        │
├─────────────────────────────────────────────────────┤
│  6. OCR document si imageBase64 fourni             │
│     + Vérification cohérence CBS↔OCR (UC-4)        │
│     → IN_REVIEW si mismatch BLOCKING               │
├─────────────────────────────────────────────────────┤
│  7. Vérification expiration document               │
│     → IN_REVIEW si expiré (UC-5)                   │
│     → Alerte MEDIUM/HIGH si expire bientôt         │
├─────────────────────────────────────────────────────┤
│  8. Calcul score risque initial                     │
├─────────────────────────────────────────────────────┤
│  9. Décision finale + notification CBS              │
└─────────────────────────────────────────────────────┘
```

### Use Cases

| UC | Trigger | Décision | Alerte | Notification CBS |
|----|---------|----------|--------|-----------------|
| **UC-1** | Screening CLEAR, doc valide | `APPROVED` | — | `KYC_APPROVED` |
| **UC-2** | OFAC/EU/UN/UK MATCH ≥ 85 | `REJECTED` | CRITICAL | `KYC_REJECTED` |
| **UC-3** | PEP détecté (score ≥ 70) | `IN_REVIEW` | HIGH + checklist EDD | `KYC_IN_REVIEW` |
| **UC-4** | Discordance CBS↔OCR | `IN_REVIEW` | HIGH FRAUD | `KYC_IN_REVIEW` |
| **UC-5** | Document expiré à l'onboarding | `IN_REVIEW` | CRITICAL | `KYC_IN_REVIEW` |

### Réponse CBS

```json
{
  "success": true,
  "cbsRef": "CBS-XXXXXXXX",
  "decision": "APPROVED",
  "reasonCode": "APPROVED_CLEAR",
  "customer": { "id": 6, "ref": "KYC-BCEBHSSX", "riskLevel": "LOW", "riskScore": 0 },
  "screening": { "status": "CLEAR", "matchScore": 45 },
  "pep": { "detected": false, "matchScore": 0, "requiresEdd": false },
  "processedAt": "2026-06-24T12:00:00.000Z",
  "durationMs": 4200
}
```

### Codes de raison

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

## 3. Cycle de vie des documents (Oscillation)

### Vue d'ensemble

```
CRÉATION
   │  ┌─ Document valide ──────────────────────────────────────────────┐
   │  │                                                                  │
   ▼  ▼                                                                  │
[APPROVED]                                                               │
   │                                                                     │
   │  MONITORING NUITIER (02:00 UTC — doc-expiry scheduler)            │
   │                                                                     │
   ├──[J-30]──► alerte MEDIUM + notify CBS KYC_DOC_EXPIRING_SOON      │
   ├──[J-7] ──► alerte HIGH   + notify CBS KYC_DOC_EXPIRING_SOON      │
   │                                                                     │
   ├──[J+0] ──► document = EXPIRED                                     │
   │             alerte CRITICAL + notify CBS KYC_DOC_EXPIRED          │
   │             kycStatus RESTE APPROVED (période de grâce)            │
   │                                                                     │
   ├──[J+15]──► kycStatus = IN_REVIEW                                  │
   │  (grace)    alerte HIGH + notify CBS KYC_GRACE_ENDING             │
   │             Plafond CBS réduit                                      │
   │                                                                     │
   ├──[J+30]──► kycStatus = REJECTED                                   │
   │  (block)    alerte CRITICAL + notify CBS KYC_BLOCK_REQUIRED       │
   │             Compte CBS bloqué                                       │
   │                                                                     │
   │  RÉGULARISATION — 2 scénarios :                                    │
   │                                                                     │
   ├──[Scénario A] CBS pousse nouveau doc ◄────────────────────────────┘
   │  POST /api/cbs/document
   │  { CIN, document: { type, expiryDate, imageBase64? } }
   │   → OCR + re-screening → kycStatus=APPROVED + notify KYC_APPROVED
   │
   └──[Scénario B] Upload depuis la plateforme
      POST /api/documents/upload (multipart)
      → OCR → eKYC → si PASS : re-screening → kycStatus=APPROVED
      → notify CBS KYC_APPROVED
```

### Configuration délais

| Variable | Défaut | Description |
|----------|--------|-------------|
| `DOC_EXPIRY_WARN_DAYS` | 30 | Jours avant expiration pour alerte |
| `DOC_EXPIRY_GRACE_DAYS` | 15 | Jours après expiration avant IN_REVIEW |
| `DOC_EXPIRY_BLOCK_DAYS` | 30 | Jours après expiration avant REJECTED |

### Endpoints CBS — Documents

```
POST /api/cbs/document
  Body: { CIN, document: { type, expiryDate, number?, imageBase64?, mimeType? } }
  → Enregistre + OCR + re-screening + met à jour kycStatus + notify CBS

POST /api/cbs/reactivation (UC-8)
  Body: { CIN, newDocument: { type, expiryDate, number?, imageBase64? } }
  → Re-screening complet + réévaluation risque + sarWarning si ex-REJECTED
```

### Notification CBS sortante

```json
{
  "event": "KYC_DOC_EXPIRED",
  "customerId": 6,
  "customerRef": "KYC-BCEBHSSX",
  "cin": "ZZ111222",
  "cbsRef": "REG00100",
  "riskLevel": "LOW",
  "daysExpired": 5,
  "daysUntilBlock": 25,
  "reason": "Document ID_CARD expiré (grâce 10j restants)",
  "timestamp": "2026-06-24T02:00:00.000Z"
}
```

---

## 4. Moteur AML — Détection des alertes

### Deux moteurs en parallèle

```
Transaction créée
       │
       ├──[Moteur 1 : Règles codées] aml.engine.ts
       │    Règles hardcodées : montant seuil, fréquence, pays à risque,
       │    round amounts, structuring, wire layering, PEP transaction,
       │    dormant reactivation, cash-intensive
       │
       └──[Moteur 2 : Règles dynamiques] aml-rules.engine.ts
            Règles configurées en base (page Règles AML)
            Score calculé par règle active (ACTIVE/TESTING)
```

### Vérifications préalables aux deux moteurs

```
Avant exécution :
  1. Good Guys List → si client exclu : tx COMPLETED, 0 alerte
  2. Silencing Rules → si alerte matchée : tx COMPLETED sans alerte
```

### Cycle de vie d'une transaction suspecte

```
Transaction → Moteur AML
                  │
                  ├── Score < seuil bas  → COMPLETED (normale)
                  ├── Score ∈ [bas,haut[ → FLAGGED + alerte LOW/MEDIUM
                  └── Score ≥ seuil haut → FLAGGED + alerte HIGH/CRITICAL
                                │
                          Alerte créée → Assignée à analyste
                                │
                    ┌───────────┼─────────────┐
                    ▼           ▼             ▼
               CONFIRMED   FALSE_POSITIVE   ESCALATED
               (vrai pos.)  (rejeté)       → Dossier
```

### Configuration des règles dynamiques

Via la page **Règles AML** :
- **Statuts** : `ACTIVE` (appliquée), `TESTING` (log seulement), `INACTIVE`
- **Conditions** : montant, pays, fréquence, type transaction, heure
- **Score** : 0-100 (cumulatif selon les règles matchées)
- **Backtesting** : simulation sur transactions historiques
- **Juridictions** : liste des pays à risque élevé configurables

---

## 5. Screening sanctions & PEP

### Listes chargées

| Source | Type | Entités | Fréquence |
|--------|------|---------|-----------|
| OFAC SDN (US Treasury) | Sanctions | ~19 000 | Nuitier 02:00 UTC |
| EU Financial Sanctions | Sanctions | ~4 500 | Nuitier |
| UN Security Council | Sanctions | ~1 000 | Nuitier |
| UK FCDO | Sanctions | ~3 000 | Nuitier |
| OpenSanctions PEP | PEP | ~1 700 000 | Nuitier |
| BAM / ANRF Maroc | Sanctions nationales | Configurable | Nuitier |

### Seuils de matching

| Seuil | Valeur | Action |
|-------|--------|--------|
| `SCREENING_MATCH_THRESHOLD` | 85 | Sanctions MATCH → REJECTED |
| `SCREENING_REVIEW_THRESHOLD` | 70 | REVIEW → IN_REVIEW |

### Algorithme de matching
- Comparaison Levenshtein normalisée (distance d'édition)
- Multi-listes en parallèle (bySource)
- Matching sur nom principal + aliases
- Résultat : score 0-100 + entité matchée + source

### Résultats screening

| Statut | Score | Signification |
|--------|-------|---------------|
| `CLEAR` | < 70 | Aucune correspondance significative |
| `REVIEW` | 70-84 | Correspondance partielle — révision manuelle |
| `MATCH` | ≥ 85 | Correspondance forte — action immédiate |

### Re-screening automatique
- À la validation d'un nouveau document (upload ou CBS)
- À la réactivation d'un client bloqué (UC-8)
- Mensuel automatique (configurable)

---

## 6. Liste blanche (Good Guys List)

### Objectif
Exclure certains clients du monitoring AML (entités de confiance, gouvernementales, institutionnelles) sans désactiver leur compte.

### Catégories

| Catégorie | Usage |
|-----------|-------|
| `TRUSTED` | Client de confiance établie |
| `INSTITUTIONAL` | Institution financière partenaire |
| `GOVERNMENT` | Entité gouvernementale |
| `REGULATORY` | Organisme de régulation |
| `TEMPORARY` | Exclusion temporaire (ex: test CBS) |

### Comportement dans le moteur AML
```
Transaction → Vérification Good Guys (avant tout)
  → Client exclu ET validFrom ≤ aujourd'hui ≤ validUntil ?
      OUI → tx COMPLETED, aucune alerte générée
      NON → pipeline AML normal
```

### Droits d'accès
- **Analyst+** : consulter la liste
- **Supervisor+** : ajouter / révoquer

### Endpoint API : `/good-guys`
```
Page : /good-guys (menu Moteur AML)
```

---

## 7. Règles de silence (Silencing Rules)

### Objectif
Supprimer temporairement des alertes pour des scénarios connus (maintenance, tests, périodes spéciales) sans impacter le monitoring global.

### Matchers disponibles

| Champ | Type | Exemple |
|-------|------|---------|
| `scenario` | string | `"ROUND_AMOUNT"` |
| `alertType` | string | `"THRESHOLD"` |
| `priority` | string | `"LOW"` |
| `customerId` | number | `42` |
| `ruleId` | string | `"RULE-001"` |

### Comportement
```
Alerte générée → Vérification règles de silence actives
  → Matchers correspondent ?
      OUI → Alerte supprimée, matchCount++ (tx reste FLAGGED pour monitoring)
      NON → Alerte créée normalement
```

### Limites et expiration
- **Validité** : `validFrom` → `validUntil` (date/heure obligatoire)
- **Limite de matchs** : `maxMatches` (optionnel — ex: silencer 100 alertes max)
- **Statuts** : Active / Révoquée / Expirée / Limite atteinte

### Droits d'accès
- **Analyst+** : consulter
- **Supervisor+** : créer / révoquer

---

## 8. pKYC — Surveillance comportementale continue

### Objectif
Détecter une dérive du comportement transactionnel d'un client sans attendre le renouvellement KYC annuel.

### Scheduler nuitier (01:00 UTC)
```
Pour chaque client actif :
  ├── Fenêtre récente : derniers 7 jours (PKYC_WINDOW_DAYS)
  ├── Baseline : 30 jours précédents (PKYC_BASELINE_DAYS)
  └── Calcul score de dérive (0-100) sur 5 facteurs
```

### 5 facteurs de dérive

| Facteur | Poids | Description |
|---------|-------|-------------|
| `volumeDrift` | 25% | Variation du volume total des transactions |
| `frequencyDrift` | 20% | Variation du nombre de transactions |
| `geoDrift` | 30% | Nouveaux pays de contrepartie |
| `amountSpike` | 15% | Pic sur transaction unique (ratio max récent/baseline) |
| `newCounterparties` | 10% | Part de nouvelles contreparties |

### Seuils et actions

| Score | Action |
|-------|--------|
| < 40 (PKYC_DRIFT_THRESHOLD) | Snapshot enregistré, aucune action |
| ≥ 40 | `nextReviewDate = aujourd'hui` + alerte `PKYC_DRIFT` |
| ≥ 60 | Alerte priorité HIGH |
| ≥ 80 | Alerte priorité CRITICAL |

### Tableau de bord pKYC
- File de révision (clients avec drift ≥ seuil)
- Historique de dérive par client (30 jours)
- Statistiques globales (monitored, avgDrift, triggered30d)
- Déclenchement manuel par client ou run complet (admin)

---

## 9. Gestion des alertes

### Cycle de vie complet

```
OPEN (créée) → ASSIGNED (assignée à analyste)
    │
    ├──► CONFIRMED    → Vraie alerte → ouvrir un dossier
    ├──► FALSE_POSITIVE → Faux positif → fermée
    └──► CLOSED       → Résolue sans dossier
```

### Types d'alertes

| Type | Source |
|------|--------|
| `THRESHOLD` | Moteur AML — seuil montant dépassé |
| `PATTERN` | Moteur AML — pattern comportemental |
| `VELOCITY` | Moteur AML — fréquence excessive |
| `SANCTIONS` | Screening sanctions |
| `PEP` | Détection PEP |
| `FRAUD` | Discordance documents |
| `NETWORK` | Analyse réseau de connexions |
| `DOCUMENT_EXPIRY` | Expiration document |
| `DOCUMENT_BLOCK` | Blocage après délai de grâce |
| `PKYC_DRIFT` | Dérive comportementale pKYC |
| `SANCTIONS_MATCH` | Match CBS onboarding |
| `KYC_REACTIVATION` | Réactivation UC-8 |

### Priorités et SLA

| Priorité | SLA réglementaire | Action requise |
|----------|-------------------|----------------|
| `CRITICAL` | Traitement immédiat | Compliance officer notifié |
| `HIGH` | 24 heures | Supervisor review |
| `MEDIUM` | 5 jours ouvrés | Analyst review |
| `LOW` | 10 jours ouvrés | File normale |

### SLA Monitoring
- Scheduler SLA (configurable) : snapshot des alertes ouvertes
- Alerte `SLA_BREACH` si délai dépassé
- Dashboard dédié `/sla`

---

## 10. Gestion des dossiers (Cases)

### Cycle de vie

```
Alerte confirmée → OPEN (dossier créé)
       │
       ├──► PENDING_APPROVAL (soumis pour approbation)
       │         │
       │    [Dual Control]
       │         │
       ├──► ESCALATED (escaladé compliance)
       │
       ├──► CLOSED (clôturé sans suite)
       │
       └──► SUBMITTED → SAR/STR créé
```

### Sévérités

| Sévérité | Usage |
|----------|-------|
| `LOW` | Anomalie mineure |
| `MEDIUM` | Suspicion modérée |
| `HIGH` | Suspicion forte |
| `CRITICAL` | Urgence compliance |

### Droits d'accès
- **Analyst** : créer, modifier, soumettre pour approbation
- **Supervisor** : approuver, escalader, clôturer
- **Compliance Officer** : toutes actions + génération SAR/STR

---

## 11. Rapports SAR / STR

### Types de rapports

| Type | Description | Destinataire |
|------|-------------|--------------|
| `SAR` | Suspicious Activity Report | ANRF (Maroc) / GoAML |
| `STR` | Suspicious Transaction Report | ANRF (Maroc) / GoAML |
| `AML_STATISTICS` | Rapport statistique AML | Interne |
| `RISK_ASSESSMENT` | Évaluation des risques | BAM |

### Workflow SAR/STR

```
Analyst crée SAR/STR (DRAFT)
       │
       ▼
Analyst soumet (REVIEW)
       │
       ▼
[Dual Control — 4 yeux obligatoire pour transmission]
Supervisor approuve
       │
       ▼
Compliance Officer : APPROVED
       │
       ▼
Transmission GoAML (XML) → ANRF
       │
       ▼
SUBMITTED + référence ANRF enregistrée
```

### Transmission GoAML
- Génération XML format GoAML 2.0
- Checksum SHA-256
- Mode réel (`TRACFIN_MODE=live`) ou simulation (`sandbox`)
- Téléchargement XML local disponible
- Suivi dépôt ANRF : date, référence, statut (`DEPOSEE/ACCUSEE/CLASSEE/SUIVI`)

### Export PDF
- SAR/STR individuel (PDF signé)
- Fiche KYC client (PDF)
- Rapport AMLD6 annuel (PDF)

---

## 12. Dual Control (Approbations)

### Principe 4 yeux
Toute opération sensible requiert une double validation.

### Opérations concernées

| Opération | Demandeur | Valideur |
|-----------|-----------|----------|
| Transmission SAR/STR | Compliance Officer | Second CO |
| Gel des avoirs (CBS block) | Supervisor | Compliance Officer |
| Modification rôle utilisateur | Admin | Admin |
| Reset MFA | Admin | Admin |

### Cycle de vie d'une approbation

```
Demande créée (PENDING) → 48h pour décision
       │
       ├──► APPROVED → Action exécutée
       └──► REJECTED → Action annulée + notification demandeur
```

### Délai d'expiration
- 48 heures par défaut (`expiresAt`)
- Après expiration : la demande doit être re-soumise

---

## 13. Dashboard Direction — KPIs AMLD6

### Accès
- Onglet "Direction — ComCo" sur le Dashboard
- Réservé aux **Compliance Officers** et **Admins**
- Filtrage par année (N-2, N-1, N)

### 8 KPIs réglementaires

| KPI | Calcul | Cible BAM/FATF |
|-----|--------|----------------|
| Couverture KYC | KYC approuvés / total clients | ≥ 95% |
| Alertes / 1 000 tx | Alertes générées / transactions × 1 000 | < 10 |
| Efficacité alertes | 100% - taux faux positifs | ≥ 70% vrais positifs |
| STR déposées (YTD) | Count rapports STR soumis | Obligatoire ANRF |
| Délai moyen STR | Jours création → soumission ANRF | ≤ 5 jours |
| Alertes CRITICAL ouvertes | Count alertes CRITICAL + OPEN | 0 (traitement immédiat) |
| SLA breaches | Alertes ouvertes > 5 jours ouvrés | 0 |
| Clients HIGH/CRITICAL | Count clients riskLevel ≥ HIGH | Surveillance EDD requise |

### Tableaux complémentaires
- **Screening sanctions YTD** : total / MATCH / révision / CLEAR
- **Dossiers investigation YTD** : ouverts / clôturés / escaladés / SAR liés

---

## 14. Schedulers automatiques

| Scheduler | Heure (UTC) | Variable config | Fonction |
|-----------|-------------|-----------------|----------|
| **Listes sanctions** | 02:00 | `SCREENING_UPDATE_CRON` | Refresh OFAC/EU/UN/UK/PEP |
| **pKYC drift** | 01:00 | `PKYC_CRON` | Score dérive comportementale |
| **Doc expiry** | 02:00 | `DOC_EXPIRY_CRON` | Escalade expiration documents |
| **SLA monitoring** | Horaire | Configurable | Snapshot alertes ouvertes |
| **ML retrain** | Hebdo | Configurable | Réentraînement modèle scoring |

### Déclenchement manuel (admin)
```
/trpc/pkyc.forceRun          — Run pKYC immédiat
/trpc/docExpiry.forceRun     — Run doc-expiry immédiat
/trpc/screening.refreshLists — Refresh listes sanctions
```

---

## Variables d'environnement clés

```env
# CBS Integration
CBS_ONBOARDING_API_KEY=<clé-secrète>
CBS_AUTH_DISABLED=false
CBS_WEBHOOK_URL=https://cbs.bank/api/kyc-callback
CBS_NOTIFY_ENABLED=true

# Screening
SCREENING_MATCH_THRESHOLD=85
SCREENING_REVIEW_THRESHOLD=70
SCREENING_TLS_INSECURE=false
PEP_MOCK_FALLBACK=false

# Oscillation documents
DOC_EXPIRY_WARN_DAYS=30
DOC_EXPIRY_GRACE_DAYS=15
DOC_EXPIRY_BLOCK_DAYS=30

# pKYC
PKYC_ENABLED=true
PKYC_DRIFT_THRESHOLD=40
PKYC_BASELINE_DAYS=30
PKYC_WINDOW_DAYS=7
```

---

## Droits d'accès par rôle

| Fonctionnalité | Analyst | Supervisor | Compliance Officer | Admin |
|---------------|---------|------------|-------------------|-------|
| Consulter alertes | ✅ | ✅ | ✅ | ✅ |
| Traiter alertes | ✅ | ✅ | ✅ | ✅ |
| Ouvrir dossier | ✅ | ✅ | ✅ | ✅ |
| Approuver dossier | ❌ | ✅ | ✅ | ✅ |
| Créer SAR/STR | ✅ | ✅ | ✅ | ✅ |
| Transmettre SAR | ❌ | ❌ | ✅ | ✅ |
| Good Guys (add/revoke) | ❌ | ✅ | ✅ | ✅ |
| Silencing (create/revoke) | ❌ | ✅ | ✅ | ✅ |
| Dashboard Direction | ❌ | ❌ | ✅ | ✅ |
| Règles AML (modifier) | ❌ | ✅ | ✅ | ✅ |
| Admin utilisateurs | ❌ | ❌ | ❌ | ✅ |
| Force schedulers | ❌ | ❌ | ❌ | ✅ |

---

*Document généré automatiquement — Plateforme KYC-AML v2.0 — Juin 2026*
