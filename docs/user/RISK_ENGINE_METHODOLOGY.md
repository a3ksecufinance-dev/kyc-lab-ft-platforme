# Méthodologie du Moteur de Risque — Transparence Algorithmique
## Plateforme KYC/AML — Version 2.5

**Destinataires :** Responsables conformité, régulateurs, DSI, auditeurs internes et externes
**Classification :** Confidentiel — Diffusion restreinte
**Version :** 2.5.0 — Mars 2026
**Objectif :** Éliminer toute opacité algorithmique — chaque décision du moteur est explicable

---

## Table des matières

1. [Principes Fondamentaux](#1-principes-fondamentaux)
2. [Score de Risque Client (0–100)](#2-score-de-risque-client-0100)
3. [Moteur de Règles AML — 12 Règles Détaillées](#3-moteur-de-règles-aml--12-règles-détaillées)
4. [Score Global de Transaction (agrégation)](#4-score-global-de-transaction-agrégation)
5. [pKYC — Score de Dérive Comportementale](#5-pkyc--score-de-dérive-comportementale)
6. [Modèle ML de Scoring (XGBoost)](#6-modèle-ml-de-scoring-xgboost)
7. [Screening Sanctions/PEP — Matching Fuzzy](#7-screening-sanctionspep--matching-fuzzy)
8. [Gouvernance des Paramètres](#8-gouvernance-des-paramètres)
9. [Limites et Biais Connus](#9-limites-et-biais-connus)

---

## 1. Principes Fondamentaux

### 1.1 Approche basée sur les risques (Risk-Based Approach)

La plateforme est conçue en conformité avec la **Recommandation 1 du GAFI** (Groupe d'Action Financière), qui impose aux États et aux entités assujetties d'identifier, évaluer et comprendre les risques de blanchiment de capitaux et de financement du terrorisme auxquels ils sont exposés, et de prendre des mesures proportionnées à ces risques.

Cette approche se traduit concrètement par :

- **Différenciation du traitement selon le niveau de risque :** Un client LOW bénéficie d'une surveillance allégée, un client HIGH fait l'objet d'une diligence renforcée (EDD — Enhanced Due Diligence).
- **Calibrage dynamique :** Les paramètres du moteur sont révisables par les administrateurs pour s'adapter à l'évolution du contexte réglementaire et à la structure du portefeuille client.
- **Proportionnalité :** Les règles de bas niveau (ROUND_AMOUNT, score 20) ne génèrent pas d'alerte standalone pour les clients LOW. Les alertes CRITICAL déclenchent des escalades automatiques.
- **Couverture réglementaire complète :** Les 12 règles AML couvrent les recommandations GAFI 10, 11, 12, 13, 20 et les articles pertinents de l'AMLD6 (6e directive anti-blanchiment de l'UE).

### 1.2 Transparence algorithmique et explicabilité

Chaque alerte générée par le moteur produit une **explication détaillée** lisible par un être humain :

```
Exemple d'alerte HAWALA_PATTERN :
"Pattern hawala détecté : canal BRANCH + 4 tx cash 48h
 + contrepartie MENA (AE)"

Données brutes associées :
- channel: "BRANCH"
- cashTxCount48h: 4
- counterpartyCountry: "AE"
- residenceCountry: "MA"
- isNonResident: false
- hawalaCond1: true (cash + MENA + fréquence ≥3)
- hawalaCond2: false
```

Aucune décision n'est prise par le moteur sans qu'un analyste humain puisse :
1. Identifier quelle règle a déclenché l'alerte
2. Comprendre les valeurs exactes qui ont satisfait la condition
3. Comparer ces valeurs avec les seuils configurés
4. Accepter ou rejeter la décision du moteur avec une justification documentée

Le moteur ne prend **aucune décision irréversible** de manière autonome. Il alerte, classe et suggère ; la décision finale appartient toujours à l'analyste humain.

### 1.3 Mise à jour continue des paramètres

Les paramètres du moteur sont révisés selon plusieurs déclencheurs :

| Déclencheur | Fréquence | Responsable |
|-------------|-----------|-------------|
| Mise à jour réglementaire GAFI/AMLD | À réception | Compliance officer |
| Évolution du taux de faux positifs (> 15%) | Mensuelle | Admin + Compliance |
| Nouveaux schémas typologiques détectés | À la demande | Admin + Compliance |
| Révision annuelle complète | Annuelle | Direction Conformité |
| Rapport TRACFIN / BAM sur typologies | Semestrielle | Compliance officer |

Toute modification fait l'objet d'un backtesting obligatoire (voir section 8).

---

## 2. Score de Risque Client (0–100)

### 2.1 Facteurs de risque client et pondérations

Le score de risque client est calculé en additionnant les points de risque de chaque facteur présent dans le profil du client. Le score est plafonné à 100.

| Facteur de risque | Points | Justification réglementaire |
|-------------------|--------|------------------------------|
| Statut PEP confirmé | +30 | GAFI Rec. 12 — Personnes Politiquement Exposées, diligences renforcées obligatoires |
| Pays de résidence à risque élevé (liste GAFI) | +20 | GAFI Rec. 19 — Pays à risques identifiés |
| Type client CORPORATE | +10 | AMLD6 Art. 3 — Structures corporatives = risque de dissimulation de bénéficiaires effectifs |
| Source de fonds non vérifiée | +15 | GAFI Rec. 10 — Mesures de vigilance : origine des fonds |
| Historique de sanctions (ancien match confirmé) | +40 | GAFI Rec. 6 — Sanctions financières ciblées |
| Juridiction d'enregistrement à risque (pour CORPORATE) | +15 | GAFI Rec. 24/25 — Bénéficiaires effectifs |
| Activité sectorielle à risque (cash intensive, métaux précieux, art) | +10 | GAFI Rec. 22/23 — Professions non financières désignées |
| UBO dans un pays à risque ou inconnu | +10 | AMLD6 Art. 43 — Transparence bénéficiaires effectifs |

### 2.2 Seuils de classification et actions associées

| Niveau | Score | Actions de diligence | Fréquence de revue KYC |
|--------|-------|---------------------|------------------------|
| **LOW** | 0–25 | Diligence standard (SDD) | Annuelle |
| **MEDIUM** | 26–50 | Diligence standard renforcée | Semestrielle |
| **HIGH** | 51–75 | Diligence renforcée (EDD) | Trimestrielle |
| **CRITICAL** | 76–100 | Diligence renforcée maximale | Mensuelle ou sur événement |

### 2.3 Calcul illustré

**Exemple — SARL Atlas Trading :**

```
Type client : CORPORATE                                    → +10
UBO Mohammed Al-Rashid : pays résidence AE                → +20
UBO Trust BVI Holdings : juridiction risque (VG)          → +10 + +15
Source de fonds : partiellement documentée                → +8 (proratisé)
─────────────────────────────────────────────────────────────────────
TOTAL                                                     = 63 → HIGH
```

### 2.4 Révision automatique vs manuelle

**Révision automatique** : Le score est recalculé automatiquement lors de :
- Chaque modification du profil client (ajout d'UBO, changement de pays, etc.)
- Résultat de screening (match PEP confirmé : +30 immédiat)
- Résultat du batch pKYC nocturne (si dérive comportementale ≥ 40)
- Réception d'un résultat de screening différentiel (nouvelles entrées sur les listes)

**Révision manuelle** : Un analyste ou superviseur peut forcer la recalculation du score, ou l'ajuster manuellement avec une justification documentée (ex : informations complémentaires reçues).

### 2.5 Impact sur la fréquence de revue KYC

Le moteur pKYC (section 5) peut forcer une révision KYC anticipée indépendamment du cycle planifié si le score de dérive comportementale dépasse le seuil configuré (défaut : 40). La `nextReviewDate` du client est alors mise à jour pour la semaine suivante.

---

## 3. Moteur de Règles AML — 12 Règles Détaillées

### Architecture du moteur

Les 12 règles sont évaluées en **parallèle** (`Promise.all`) pour chaque transaction entrante. Les résultats sont agrégés pour produire un score total et une priorité maximale. La transaction est marquée FLAGGED si au moins une règle se déclenche.

```
TRANSACTION
    │
    ├──► Règle 1  : THRESHOLD_EXCEEDED    ─┐
    ├──► Règle 2  : STRUCTURING           ─┤
    ├──► Règle 3  : HIGH_FREQUENCY        ─┤
    ├──► Règle 4  : VOLUME_SPIKE          ─┤
    ├──► Règle 5  : HIGH_RISK_COUNTRY     ─┤── Agrégation ──► Score Total
    ├──► Règle 6  : PEP_TRANSACTION       ─┤            ──► Priorité Max
    ├──► Règle 7  : ROUND_AMOUNT          ─┤            ──► Alerte créée
    ├──► Règle 8  : UNUSUAL_CHANNEL       ─┤
    ├──► Règle 9  : HAWALA_PATTERN        ─┤
    ├──► Règle 10 : MENA_STRUCTURING      ─┤
    └──► Règle 11 : CASH_INTENSIVE        ─┘
```

---

### Règle 1 — THRESHOLD_EXCEEDED

**Référence réglementaire :** GAFI Recommandation 20 (déclaration des transactions suspectes) ; AMLD4 Article 11 (obligations de déclaration) ; Règlement BAM sur les transactions en espèces

**Objectif :** Détecter les transactions dont le montant dépasse le seuil réglementaire d'obligation déclarative, qui constitue également le seuil principal des typologies de fragmentation.

**Paramètres configurables :**

| Paramètre | Variable ENV | Valeur par défaut |
|-----------|-------------|-------------------|
| Seuil de déclenchement | `AML_THRESHOLD_SINGLE_TX` | 10 000 EUR |

**Logique de déclenchement :**
```
DÉCLENCHÉ si : montant >= AML_THRESHOLD_SINGLE_TX

Score attribué :
  - montant >= seuil × 2 (≥ 20 000€) → score = 80, priorité = CRITICAL
  - seuil ≤ montant < seuil × 2       → score = 60, priorité = HIGH
```

**Exemples concrets :**
- Transaction de 10 500€ par virement SEPA vers l'Allemagne → THRESHOLD_EXCEEDED, score 60, HIGH
- Transaction de 25 000€ en cash guichet → THRESHOLD_EXCEEDED, score 80, CRITICAL (+ potentiellement ROUND_AMOUNT si multiple de 1000)

**Faux positifs typiques et mitigation :**
- Remboursement de prêt immobilier d'un montant régulier et documenté → clôturer comme faux positif avec référence contrat
- Virement de salaire d'un dirigeant d'entreprise → source de fonds vérifiée, profil CORPORATE attendu
- Transaction de change de devises pour client exportateur régulier → enrichir le profil avec l'activité professionnelle

---

### Règle 2 — STRUCTURING

**Référence réglementaire :** GAFI Recommandation 10 (connaissance du client) ; Typologies GAFI — Stade de placement : fragmentation ; Circulaire BAM 5/W/2023

**Objectif :** Détecter la fragmentation intentionnelle de transactions pour rester sous le seuil réglementaire (technique dite de "smurfing"). C'est l'une des typologies de blanchiment les plus répandues au stade du placement.

**Paramètres configurables :**

| Paramètre | Variable ENV | Valeur par défaut |
|-----------|-------------|-------------------|
| Seuil de déclenchement unique | `AML_THRESHOLD_SINGLE_TX` | 10 000 EUR |
| Seuil minimal par fragment | `AML_THRESHOLD_STRUCTURING` | 3 000 EUR |
| Fenêtre d'analyse | `AML_STRUCTURING_WINDOW_HOURS` | 24 heures |

**Logique de déclenchement :**
```
Pour la transaction courante T et la fenêtre de windowHours :
  underThreshold = transactions précédentes du client dans la fenêtre
                   telles que : 3000€ ≤ montant < 10000€ ET montant ≠ T

  totalAmount = Σ(underThreshold.montant) + T.montant

  DÉCLENCHÉ si : len(underThreshold) ≥ 2 ET totalAmount ≥ 10 000€

Score attribué : 75, priorité = HIGH
```

**Exemples concrets :**
- Client dépose 9 500€ à 09h00, 9 200€ à 14h00, puis 9 800€ à 17h00 (même jour) → STRUCTURING, total 28 500€ sur 24h
- Client effectue 3 virements de 4 000€ chacun vers la même contrepartie en 8 heures → STRUCTURING, total 12 000€

**Faux positifs typiques et mitigation :**
- Versement d'acomptes contractuels (plusieurs tranches d'un même marché commercial) → documenter le contrat
- Salaires de plusieurs employés virés le même jour → justifier avec la liste des bénéficiaires
- Règlement de plusieurs fournisseurs dans la même journée → normal pour les entreprises à fort flux

---

### Règle 3 — HIGH_FREQUENCY

**Référence réglementaire :** GAFI Recommandation 10 ; Indicateurs typologiques GAFI 2023 — activité transactionnelle inhabituelle

**Objectif :** Détecter un nombre anormalement élevé de transactions sur une courte période, indicateur de comportement automatisé ou d'activité criminelle organisée.

**Paramètres configurables :**

| Paramètre | Variable ENV | Valeur par défaut |
|-----------|-------------|-------------------|
| Seuil de fréquence | `AML_FREQUENCY_THRESHOLD` | 10 transactions/24h |

**Logique de déclenchement :**
```
count = nb de transactions du client dans les 24 dernières heures
        (hors transaction courante)

DÉCLENCHÉ si : count >= AML_FREQUENCY_THRESHOLD (10)

Score attribué :
  score = min(40 + (count - threshold) × 5, 70)
  - 10 tx → score 40 (MEDIUM)
  - 12 tx → score 50 (MEDIUM)
  - 16 tx → score 70 (HIGH)
  - ≥ threshold×2 (20 tx) → priorité HIGH

priorité = count >= threshold*2 ? "HIGH" : "MEDIUM"
```

**Exemples concrets :**
- Compte particulier avec 15 virements en une journée → score 65, HIGH
- Compte professionnel avec 25 paiements fournisseurs → possible faux positif selon le profil

**Faux positifs typiques et mitigation :**
- Commerçant en ligne avec volume élevé de règlements carte → adapter le seuil dans le profil client
- Service de paie avec virements multiples de salaires → normalement en batch unique, pas 25 transactions individuelles

---

### Règle 4 — VOLUME_SPIKE

**Référence réglementaire :** GAFI Recommandation 10 ; Indicateur typologique — pic d'activité inhabituel

**Objectif :** Détecter une transaction dont le montant est anormalement élevé par rapport à l'historique transactionnel du client, suggérant l'introduction soudaine de fonds d'origine illicite.

**Paramètres configurables :**

| Paramètre | Variable ENV | Valeur par défaut |
|-----------|-------------|-------------------|
| Seuil de variation | `AML_VOLUME_VARIATION_THRESHOLD` | 300% |
| Fenêtre historique | (fixe) | 30 jours |
| Nombre minimum de tx pour activation | (fixe) | 3 transactions |

**Logique de déclenchement :**
```
Condition préalable : au moins 3 transactions dans les 30 derniers jours
  (évite les faux positifs sur les nouveaux clients — cold start)

avgDaily = volumeMensuel / 30 (moyenne journalière)
variation = montantTx / avgDaily

DÉCLENCHÉ si : variation >= AML_VOLUME_VARIATION_THRESHOLD / 100 (= 3.0)

Score attribué :
  score = min(30 + variation × 5, 60)
  priorité = MEDIUM
```

**Exemples concrets :**
- Client avec moyenne journalière 200€ réalise une transaction de 8 000€ (variation = 40× > 300%) → VOLUME_SPIKE, score 60
- Client avec moyenne journalière 5 000€ réalise 12 000€ (variation = 240% < 300%) → pas déclenché

**Faux positifs typiques et mitigation :**
- Héritage ou donation documentée → source de fonds justifiée, clôturer comme faux positif
- Vente immobilière ou de véhicule → demander l'acte notarié ou le bon de commande

---

### Règle 5 — HIGH_RISK_COUNTRY

**Référence réglementaire :** GAFI Recommandation 19 (pays à risques accrus) ; Liste OFAC SDN ; Règlement UE 2016/1675 modifié ; BAM circulaire sur les zones géographiques à risque

**Objectif :** Détecter les transactions impliquant des pays soumis à des mesures renforcées en raison de déficiences stratégiques dans leur dispositif LAB/FT (liste noire GAFI) ou soumis à des sanctions internationales.

**Deux niveaux de pays à risque implémentés :**

**Niveau CRITICAL (embargo total — OFAC/ONU Tier 1) :**
KP (Corée du Nord), IR (Iran), CU (Cuba), SY (Syrie)

**Niveau HIGH (pays à risques élevés GAFI) :**
MM (Myanmar), BY (Biélorussie), RU (Russie), YE (Yémen), AF (Afghanistan), LY (Libye), SO (Somalie), SS (Soudan du Sud), CF (Centrafrique), CD (RDC), HT (Haïti), VE (Venezuela), PK (Pakistan), NG (Nigéria), ZA (Afrique du Sud)

**Logique de déclenchement :**
```
DÉCLENCHÉ si : tx.counterpartyCountry IN HIGH_RISK_COUNTRIES

Score et priorité :
  - Pays CRITICAL (KP/IR/CU/SY) : score = 90, priorité = CRITICAL
  - Autres pays HIGH_RISK        : score = 70, priorité = HIGH
```

**Exemples concrets :**
- Virement de 500€ vers la Corée du Nord (KP) → CRITICAL, score 90 + alerte email immédiate
- Paiement import-export vers la Russie (RU) → HIGH, score 70 (certains secteurs sous sanctions spécifiques post-2022)

**Faux positifs typiques et mitigation :**
- Multinationale avec filiale légitime dans un pays à risque → EDD obligatoire malgré tout, documenter la nature commerciale
- Aide humanitaire vers zones de conflit → exemptions OFAC possibles, requiert validation compliance_officer

---

### Règle 6 — PEP_TRANSACTION

**Référence réglementaire :** GAFI Recommandation 12 (Personnes politiquement exposées) ; AMLD4/5/6 Articles 18-24 (EDD pour PEP) ; BAM Circulaire sur les PEP

**Objectif :** Appliquer une vigilance renforcée sur les transactions effectuées par des clients identifiés comme PEP (ou leurs proches et associés), conformément à l'obligation de diligences renforcées imposée par toutes les recommandations GAFI sur ce sujet.

**Logique de déclenchement :**
```
DÉCLENCHÉ si : customer.pepStatus = true
              OU customer.customerType = "PEP"

Score attribué :
  - Montant >= AML_THRESHOLD_SINGLE_TX (10 000€) : score = 75, priorité = HIGH
  - Montant < seuil                               : score = 50, priorité = HIGH

priorité = HIGH dans tous les cas
```

**Exemples concrets :**
- Maire d'une ville de 50 000 habitants (PEP local) effectue un virement de 3 000€ → PEP_TRANSACTION, score 50
- Ministre ou ambassadeur (PEP international) effectue un virement de 15 000€ → PEP_TRANSACTION, score 75, EDD immédiate

**Faux positifs typiques et mitigation :**
- La majorité des transactions PEP sont légitimes — ne jamais clôturer automatiquement
- Les PEP font l'objet de surveillance continue par définition, même après quittance de leur mandat (période de "cooling off" 18 mois à 5 ans selon le niveau)

---

### Règle 7 — SANCTION_COUNTERPARTY

**Référence réglementaire :** GAFI Recommandation 6 (Sanctions financières ciblées) ; Règlement UE 2580/2001 ; Loi US IEEPA/OFAC ; BAM sur les mesures restrictives

**Objectif :** Détecter en temps réel les transactions dont la contrepartie figure sur une liste de sanctions financières, ce qui constitue une obligation légale absolue (zéro tolérance) indépendamment du niveau de risque du client.

**Logique de déclenchement :**
Le screening de la contrepartie est effectué en temps réel lors du traitement de chaque transaction. Si la contrepartie est identifiée avec un score ≥ `SCREENING_MATCH_THRESHOLD` (défaut 80%) sur l'une des listes de sanctions :

```
DÉCLENCHÉ si : score_screening(contrepartie) >= SCREENING_MATCH_THRESHOLD

Score attribué : dépend du score de screening (typiquement 80-100)
priorité = CRITICAL
```

**Exemples concrets :**
- Virement vers "Hassan Mohammed Al-Qaddafi" → match OFAC SDN score 93% → SANCTION_COUNTERPARTY, CRITICAL
- Paiement à une entreprise dont le dirigeant figure sur la liste UE → match confirmé → blocage immédiat

**Faux positifs typiques et mitigation :**
- Homonyme d'une personne sanctionnée → rejet du match après vérification date de naissance, nationalité
- Translittération différente du même nom → l'algorithme fuzzy est conçu pour normaliser, mais des cas limites existent

---

### Règle 8 — ROUND_AMOUNT

**Référence réglementaire :** GAFI Indicateurs typologiques — montants ronds comme indicateur de blanchiment ; Recommandation 10

**Objectif :** Détecter les montants ronds (multiples de 1 000€) pour des montants significatifs, qui constituent un indicateur typologique complémentaire souvent associé à d'autres schémas de blanchiment.

**Logique de déclenchement :**
```
DÉCLENCHÉ si : montant >= 5 000€ ET montant % 1 000 === 0

Score attribué : 20, priorité = LOW
```

**Note importante :** Cette règle a un score délibérément faible (20) car prise isolément, elle génère beaucoup de faux positifs. Elle est conçue pour augmenter le score d'une alerte déjà déclenchée par d'autres règles, et non pour générer des alertes standalone.

**Exemples concrets :**
- Virement de 10 000€ exact → THRESHOLD_EXCEEDED (60) + ROUND_AMOUNT (20) = score total 80, CRITICAL
- Paiement de 7 000€ pour un loyer → ROUND_AMOUNT uniquement, score 20 (faible signal)

---

### Règle 9 — HAWALA_PATTERN (Sprint 6 — Localisation MENA)

**Référence réglementaire :** BAM Circulaire 5/W/2023 sur les systèmes de transfert de valeurs informels ; Rapport MENAFATF sur les typologies hawala 2024 ; GAFI Recommandation 14 (services de transfert de fonds)

**Objectif :** Détecter les patterns caractéristiques des systèmes de transfert informels de type hawala, répandus dans la région MENA et utilisés pour des transferts de fonds non déclarés. Ce système repose sur un réseau de courtiers (hawaladars) qui acceptent des fonds en cash dans un pays et les restituent dans un autre sans mouvement physique de devises.

**Pays MENA couverts :** MA, DZ, TN, LY, EG, SD, SO, DJ, ER, SA, AE, QA, KW, BH, OM, YE, JO, IQ, LB, SY, PS, TR, PK, AF, IR, MR, ML, NE, SN, GM, GW, GN, SL

**Canaux cash considérés :** BRANCH (agence bancaire), ATM

**Logique de déclenchement — deux conditions alternatives :**

```
hawalaCond1 = canal CASH (BRANCH/ATM)
              ET contrepartie dans pays MENA
              ET ≥ 3 transactions cash dans les 48 dernières heures

hawalaCond2 = canal CASH
              ET client non-résident (pays résidence ≠ MA)
              ET pays de résidence du client dans MENA
              ET montant >= 2 000€

DÉCLENCHÉ si : hawalaCond1 OU hawalaCond2

Score attribué :
  - hawalaCond1 ET hawalaCond2 simultanément : score = 80, priorité = HIGH
  - une seule condition                       : score = 60, priorité = HIGH
```

**Exemples concrets :**
- Client résidant en France, originaire du Maroc, dépose 3 500€ cash 3 fois en 48h pour virer aux Émirats → hawalaCond1 + hawalaCond2 = score 80
- Client effectue 4 retraits ATM consécutifs en 48h avec contreparties au Sénégal → hawalaCond1 = score 60

**Faux positifs typiques et mitigation :**
- Travailleur migrant légal qui envoie des fonds à sa famille (transfert de migrants) → fréquent et légitime. Mitigation : vérifier si les montants et la fréquence sont cohérents avec les revenus déclarés.
- PME avec filiale commerciale au Golfe qui gère sa trésorerie en cash → demander justificatifs commerciaux.
- Attention au biais potentiel envers les populations MENA légitimes (voir section 9.2).

---

### Règle 10 — MENA_STRUCTURING (Sprint 6 — Localisation MENA)

**Référence réglementaire :** BAM Circulaire 5/W/2023 ; Typologies UTRF/ANRF Maroc 2024 ; GAFI Recommandation 10 et 20

**Objectif :** Détecter un pattern spécifique aux marchés MENA : transactions dont le montant se situe dans une "zone grise" (85–99% du seuil réglementaire) à destination de pays MENA. Ce pattern typologique, documenté par l'UTRF en 2024, représente une technique de structuring adaptée aux transferts familiaux fictifs utilisés pour le blanchiment via le système bancaire formel.

**Logique de déclenchement :**
```
inGrayZone = (montant >= seuil × 0.85) ET (montant < seuil)
             = entre 8 500€ et 9 999€ pour un seuil de 10 000€

isMenaCounterparty = pays contrepartie IN MENA_COUNTRIES

Condition de base (suffisante) :
  DÉCLENCHÉ si : inGrayZone ET isMenaCounterparty

Facteur aggravant :
  similarTx = transactions des 7 derniers jours
               avec 85%×seuil ≤ montant < seuil
               ET même pays de contrepartie

Score attribué :
  score = min(50 + similarTx.length × 10, 75)
  - 0 transaction similaire précédente : score 50
  - 1 transaction similaire : score 60
  - 3+ transactions similaires : score max 75

priorité = HIGH
```

**Exemples concrets :**
- Client envoie 9 500€ vers le Maroc (sans antécédent) → MENA_STRUCTURING, score 50
- Client envoie 9 500€ puis 9 300€ puis 9 800€ vers les Émirats en 7 jours → score 70 (3 transactions × +10)
- Client envoie 9 750€ vers la France → PAS de déclenchement (pays non MENA)

**Faux positifs typiques et mitigation :**
- Loyer mensuel d'un appartement au Maroc ou aux EAU → cohérent avec le profil si documenté
- Remboursement familial régulier documenté → contexte à vérifier avec justificatifs

---

### Règle 11 — CASH_INTENSIVE (Sprint 6 — Localisation MENA)

**Référence réglementaire :** GAFI Recommandation 20 (déclaration des transactions suspectes) ; Liste d'indicateurs typologiques BAM ; Stade 1 de blanchiment — placement de liquidités

**Objectif :** Détecter les clients dont l'activité cash (dépôts/retraits en agence ou ATM) est incompatible avec leur profil de risque déclaré, indicateur classique du stade de placement dans un schéma de blanchiment.

**Logique de déclenchement :**

Condition préalable : la transaction en cours est une opération cash (BRANCH ou ATM).

```
Sur les 30 derniers jours :
  cashTx = transactions BRANCH ou ATM
  cashTotal = Σ(cashTx.montant) + montantTxCourante

  highFreq   = (nb cashTx + 1) >= 10
  highVolume = cashTotal >= AML_THRESHOLD_SINGLE_TX × 3 (= 30 000€)

  profileInconsistent = (customer.riskLevel = "LOW") ET (highFreq OU highVolume)

DÉCLENCHÉ si : (highFreq OU highVolume)
               ET (
                 client résidant dans pays MENA  [critère zéro-tolérance]
                 OU profileInconsistent           [incohérence de profil]
               )

Score attribué :
  score = min(30
    + (highFreq ? 15 : 0)
    + (highVolume ? 15 : 0)
    + (profileInconsistent ? 10 : 0),
    60)
  - Tous critères : 30 + 15 + 15 + 10 = 70 → plafonné à 60
  - highFreq + profil incohérent : 30 + 15 + 10 = 55 (MEDIUM)
  - highVolume seul : 30 + 15 = 45 (MEDIUM)

priorité = score >= 50 ? "MEDIUM" : "LOW"
```

**Exemples concrets :**
- Client LOW_RISK (profil salarié) effectue 12 dépôts cash de 2 500€ chacun en un mois (total 30 000€) → highFreq + highVolume + profileInconsistent = score 60
- Client MEDIUM_RISK avec résidence MA effectue 11 dépôts cash → highFreq + MENA = score 45

**Faux positifs typiques et mitigation :**
- Gérant de restaurant ou d'épicerie qui dépose ses recettes quotidiennement → activité cash légitime. Mitigation : documenter l'activité commerciale dans le profil client (source de fonds = activité commerciale cash).
- Boulanger ou artisan avec recettes quotidiennes → même approche.

---

## 4. Score Global de Transaction (agrégation)

### 4.1 Calcul du score total

Le score total d'une transaction est la **somme des scores** de toutes les règles déclenchées, **plafonnée à 100** :

```
scoreTotalRaw = Σ score(règle_i) pour chaque règle déclenchée
scoreTotal    = min(scoreTotalRaw, 100)
```

**Exemple d'agrégation :**

| Règle déclenchée | Score individuel |
|------------------|------------------|
| MENA_STRUCTURING | 50 |
| HAWALA_PATTERN | 60 |
| ROUND_AMOUNT | 20 |
| **Total brut** | **130** |
| **Total plafonné** | **100** |

### 4.2 Priorité maximale

La priorité de l'alerte est le **maximum** des priorités de toutes les règles déclenchées :

```
priorityOrder = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }
maxPriority = règle déclenchée avec le plus grand priorityOrder
```

### 4.3 Type d'alerte (classification)

Le type d'alerte est déterminé par la hiérarchie de règles suivante :

```
si HAWALA_PATTERN ou MENA_STRUCTURING déclenché     → type = "PATTERN"
sinon si STRUCTURING ou HIGH_FREQUENCY ou CASH_INTENSIVE → "PATTERN"
sinon si THRESHOLD_EXCEEDED ou VOLUME_SPIKE          → "THRESHOLD"
sinon si HIGH_RISK_COUNTRY                           → "FRAUD"
sinon                                                → "VELOCITY"
```

Les règles MENA (Sprint 6) prennent la priorité de classification, garantissant que les patterns les plus sophistiqués sont identifiés comme tels.

### 4.4 Seuils de décision automatique

| Condition | Action automatique |
|-----------|-------------------|
| Score ≥ 1 ET règle déclenchée | Alerte créée, transaction FLAGGED |
| Priorité = CRITICAL | Email aux superviseurs + compliance_officer + admins actifs |
| Priorité = CRITICAL ET client PEP | Double notification + création de dossier recommandée |
| SANCTION_COUNTERPARTY confirmé | Blocage de transaction recommandé + escalade immédiate |

---

## 5. pKYC — Score de Dérive Comportementale

### 5.1 Paramètres de configuration

| Paramètre | Variable ENV | Valeur par défaut |
|-----------|-------------|-------------------|
| Activation | `PKYC_ENABLED` | true |
| Heure d'exécution | `PKYC_CRON` | 01:00 UTC chaque nuit |
| Seuil de déclenchement | `PKYC_DRIFT_THRESHOLD` | 40 |
| Fenêtre baseline | `PKYC_BASELINE_DAYS` | 30 jours |
| Fenêtre d'analyse récente | `PKYC_WINDOW_DAYS` | 7 jours |

### 5.2 Calcul détaillé de chaque facteur

#### Facteur 1 — volumeDrift (pondération 25%)

Compare le volume de transactions de la fenêtre récente (7 jours) au volume de référence (30 jours), en normalisant par la durée pour comparer des volumes journaliers.

```
volumeRecent   = Σ montants des transactions dans [J-7, J]
volumeBaseline = Σ montants des transactions dans [J-37, J-7]

volumeJournalierRecent   = volumeRecent / 7
volumeJournalierBaseline = volumeBaseline / 30

volumeDriftScore = (volumeJournalierRecent / volumeJournalierBaseline) normalisé [0, 1]
  - ratio < 1   → score 0 (volume stable ou en baisse)
  - ratio = 3   → score 0.5 (triplement du volume)
  - ratio >= 5  → score 1.0 (quintuplement)

Contribution au score total = volumeDriftScore × 0.25 × 100
```

#### Facteur 2 — frequencyDrift (pondération 20%)

```
nbTxRecent   = nb transactions dans [J-7, J]
nbTxBaseline = nb transactions dans [J-37, J-7]

freqJournaliereRecente   = nbTxRecent / 7
freqJournaliereBaseline  = nbTxBaseline / 30

frequencyDriftScore = (freqRecente / freqBaseline) normalisé [0, 1]

Contribution = frequencyDriftScore × 0.20 × 100
```

#### Facteur 3 — geoDrift (pondération 30%)

C'est le facteur le plus pondéré, car l'apparition de nouvelles zones géographiques est l'indicateur de risque comportemental le plus fort.

```
paysBaseline = ensemble des pays de contrepartie vus dans [J-37, J-7]
paysRecents  = ensemble des pays de contrepartie vus dans [J-7, J]

nouveauxPays = paysRecents \ paysBaseline (différence ensembliste)

geoDriftScore = min(|nouveauxPays| / 3, 1.0)
  - 0 nouveau pays : score 0
  - 1 nouveau pays : score 0.33
  - 2 nouveaux pays : score 0.67
  - 3+ nouveaux pays : score 1.0

Facteur aggravant : si nouveauxPays contient des pays HIGH_RISK ou CRITICAL
  → geoDriftScore multiplié par 1.5, plafonné à 1.0

Contribution = geoDriftScore × 0.30 × 100
```

#### Facteur 4 — amountSpike (pondération 15%)

```
maxAmountRecent   = max des montants dans [J-7, J]
maxAmountBaseline = max des montants dans [J-37, J-7]

amountSpikeScore = min(maxAmountRecent / (maxAmountBaseline × 2), 1.0)
  - Doublement du max historique → score 0.5
  - Quadruplement → score 1.0

Contribution = amountSpikeScore × 0.15 × 100
```

#### Facteur 5 — newCounterparties (pondération 10%)

```
contrepartiesBaseline = ensemble des contreparties vues dans [J-37, J-7]
contrepartiesRecentes = ensemble des contreparties vues dans [J-7, J]

nouvelles = contrepartiesRecentes \ contrepartiesBaseline

newCounterpartiesScore = min(|nouvelles| / 5, 1.0)
  - 0-1 nouvelle : score 0-0.2
  - 5+ nouvelles : score 1.0

Contribution = newCounterpartiesScore × 0.10 × 100
```

### 5.3 Score de dérive final

```
scoreDérive = Σ contributions(5 facteurs)
            = volumeDrift(25%) + frequencyDrift(20%) + geoDrift(30%)
              + amountSpike(15%) + newCounterparties(10%)

Score final arrondi à l'entier le plus proche, compris entre 0 et 100.
```

### 5.4 Actions automatiques déclenchées

| Condition | Action |
|-----------|--------|
| scoreDérive >= PKYC_DRIFT_THRESHOLD (40) | `nextReviewDate` = J+7 (révision dans la semaine) |
| scoreDérive >= 60 | Alerte de type PATTERN créée (priorité MEDIUM) |
| scoreDérive >= 80 | Alerte de type PATTERN créée (priorité HIGH) |
| Facteur geoDrift > 0.8 ET pays CRITICAL | Alerte CRITICAL immédiate (hors cycle nocturne) |

---

## 6. Modèle ML de Scoring (XGBoost)

> **Statut :** Fonctionnalité complémentaire et optionnelle. Le scoring ML est un signal additionnel au moteur de règles, non un remplacement. La décision finale reste déterministe et explicable via les règles.

### 6.1 Architecture du modèle

**Algorithme :** XGBoost (eXtreme Gradient Boosting) — classification binaire
**Sortie :** Probabilité de fraude/blanchiment entre 0.0 et 1.0
**Service :** Microservice Python indépendant (`ML_SERVICE_URL`, port 8000)

### 6.2 Variables d'entrée (21 features)

| Catégorie | Features |
|-----------|----------|
| Transaction | montant, devise, canal (encodage one-hot), type de transaction |
| Temporel | heure du jour, jour de la semaine, jour du mois, trimestre |
| Géographique | pays de contrepartie (encodage risque), is_high_risk_country |
| Client | niveau de risque (encodage ordinal), is_pep, ancienneté client (jours) |
| Historique | nb_tx_30j, volume_30j, max_amount_30j, nb_pays_30j, nb_contreparties_30j |
| Contexte | nb_alertes_3m, taux_fp_3m (taux faux positifs des alertes du client) |

### 6.3 Seuil de bascule et intégration

```
probabilité_fraude >= 0.7 → signal ML "HIGH RISK" ajouté aux enrichissements
probabilité_fraude >= 0.4 → signal ML "MEDIUM RISK" (informatif)
probabilité_fraude < 0.4  → signal ML "LOW RISK"
```

Le signal ML est affiché dans les données d'enrichissement de chaque alerte, mais **ne modifie pas directement le score AML** calculé par les règles déterministes. Il sert d'indicateur contextuel supplémentaire pour l'analyste.

### 6.4 Réentraînement automatique

| Paramètre | Valeur |
|-----------|--------|
| Fréquence | Hebdomadaire (dimanche 03:00 UTC) — `ML_RETRAIN_CRON=0 3 * * 0` |
| Historique utilisé | 180 jours — `ML_RETRAIN_DAYS_HISTORY=180` |
| Activation | Automatique — `ML_RETRAIN_AUTO=true` |

**Source de vérité (labels) :** Les décisions des analystes (FALSE_POSITIVE, SAR_FILED) constituent les labels d'entraînement. Chaque décision humaine améliore le modèle pour les cycles suivants.

### 6.5 Métriques de validation

| Métrique | Seuil d'acceptation | Fréquence de vérification |
|----------|---------------------|--------------------------|
| AUC-ROC | ≥ 0.80 | À chaque réentraînement |
| F1-score (classe fraude) | ≥ 0.70 | À chaque réentraînement |
| Précision globale | ≥ 0.85 | À chaque réentraînement |
| Dérive de distribution (PSI) | < 0.20 | Mensuelle |

Si les métriques passent sous les seuils, le nouveau modèle est rejeté et l'ancien est conservé. Une alerte est envoyée à l'administrateur.

---

## 7. Screening Sanctions/PEP — Matching Fuzzy

### 7.1 Algorithme de correspondance

Le moteur de screening combine deux algorithmes complémentaires :

**Distance de Levenshtein :** Mesure le nombre minimal de modifications (insertions, suppressions, substitutions) pour transformer un nom en un autre. Efficace pour les fautes de frappe et les translittérations simples.

**Token Set Ratio :** Compare les mots constitutifs des noms indépendamment de leur ordre. Efficace pour les noms prénom/nom inversés, les patronymes composés, les noms à particule.

**Score final :**
```
score = max(levenshtein_similarity, token_set_ratio)
```

### 7.2 Seuils de décision

| Seuil | Variable ENV | Valeur par défaut | Catégorie | Action |
|-------|-------------|-------------------|-----------|--------|
| Match | `SCREENING_MATCH_THRESHOLD` | 80% | MATCH | Validation manuelle obligatoire (superviseur) |
| Revue | `SCREENING_REVIEW_THRESHOLD` | 50% | REVIEW | Examen recommandé (analyste) |
| Clear | En dessous du seuil revue | < 50% | CLEAR | Aucune action |

### 7.3 Normalisation des noms

Avant comparaison, les noms subissent plusieurs transformations :

1. **Suppression des accents et diacritiques :** é→e, ñ→n, ü→u, ç→c, etc.
2. **Translittération arabe :** Normalisation des translittérations multiples (Mohammad/Mohammed/Mohamed/Muhammed → Mohammed normalisé)
3. **Translittération cyrillique :** Normalisation russe/ukrainien → Latin ISO 9
4. **Suppression des titres et qualificatifs :** Dr., Sheikh, Sayyid, Al-, El-, bin, ibn, van, von, de, etc. (traités séparément)
5. **Normalisation des caractères CJK :** Romanisation des noms chinois, japonais, coréens
6. **Mise en majuscules et suppression des espaces multiples**

### 7.4 Sources et fréquence de mise à jour

| Source | Type | URL | Fréquence de mise à jour |
|--------|------|-----|--------------------------|
| OFAC SDN | Sanctions US | `OFAC_SDN_URL` | Quotidienne (02:00 UTC) |
| UE Sanctions | Sanctions européennes | `EU_SANCTIONS_URL` | Hebdomadaire |
| ONU Consolidated | Sanctions ONU | `UN_SANCTIONS_URL` | Hebdomadaire |
| UK OFSI | Sanctions britanniques | `UK_SANCTIONS_URL` | Hebdomadaire |
| PEP OpenSanctions | Base PEP internationale | `PEP_LIST_URL` | Hebdomadaire |
| BAM/ANRF | Liste nationale marocaine | `BAM_SANCTIONS_URL` | Selon accord BAM |

**Alerte de fraîcheur :** Si une liste n'a pas été mise à jour depuis plus de `SCREENING_STALE_THRESHOLD_HOURS` heures (défaut 36h), une alerte est émise à l'administrateur et la liste concernée est signalée comme potentiellement obsolète dans l'interface.

---

## 8. Gouvernance des Paramètres

### 8.1 Droits de modification

| Paramètre | Rôle minimum requis |
|-----------|---------------------|
| Seuils AML (THRESHOLD, STRUCTURING, etc.) | admin |
| Paramètres pKYC (seuil, fenêtres) | admin |
| Seuils de screening (MATCH, REVIEW) | admin |
| Liste des pays à risque | admin (avec validation compliance_officer) |
| Configuration ML (réentraînement, seuil) | admin |

### 8.2 Procédure obligatoire de changement de paramètre

Toute modification d'un paramètre de risque doit suivre le processus suivant :

```
1. DEMANDE DE CHANGEMENT
   ─────────────────────
   Initiateur (admin ou compliance) rédige un mémo justifiant :
   - Le paramètre à modifier et sa valeur actuelle
   - La nouvelle valeur proposée
   - La justification réglementaire ou opérationnelle
   - L'impact attendu sur le taux de faux positifs / faux négatifs

2. BACKTESTING (OBLIGATOIRE)
   ─────────────────────────
   Sur les données historiques des 90 derniers jours :
   - Simuler le comportement du moteur avec les nouveaux paramètres
   - Mesurer : nb alertes générées, taux FP estimé, alertes manquées
   - Comparer avec les résultats réels de la période

3. VALIDATION
   ──────────
   - Validation superviseur + compliance_officer (double signature)
   - Pour les changements majeurs : validation comité conformité

4. DÉPLOIEMENT EN STAGING
   ───────────────────────
   - Activer les nouveaux paramètres sur l'environnement de staging
   - Période d'observation : 7 jours minimum
   - Revue des résultats par l'équipe conformité

5. DÉPLOIEMENT EN PRODUCTION
   ──────────────────────────
   - Déploiement hors heures de pointe (nuit ou week-end)
   - Monitoring renforcé pendant 72h post-déploiement
   - Possibilité de rollback immédiat

6. DOCUMENTATION
   ──────────────
   - Mise à jour de ce document de méthodologie
   - Entrée dans l'audit log (automatique)
   - Communication aux équipes concernées
```

### 8.3 Audit log des modifications

Chaque modification de paramètre est enregistrée de manière immuable dans l'audit log système avec :
- Horodatage précis (UTC)
- Identité de l'opérateur
- Paramètre modifié : valeur ancienne → valeur nouvelle
- Référence au mémo de justification

### 8.4 Backtesting obligatoire avant déploiement

Le rapport de backtesting doit documenter :

| Métrique | Objectif |
|----------|----------|
| Variation du nb total d'alertes | ± 20% maximum acceptable |
| Variation du taux de faux positifs | Réduction ou maintien |
| Détection des cas SAR historiques | 100% des DS passées doivent rester détectées |
| Absence de régression sur les cas critiques | Aucune alerte CRITICAL manquée |

---

## 9. Limites et Biais Connus

### 9.1 Taux de faux positifs attendu

En conditions de production normales, le moteur est calibré pour produire un taux de faux positifs entre **5% et 15%** des alertes générées. Ce taux est un compromis entre :

- **Sensibilité** (détecter tous les cas suspects) — favorise un seuil bas = plus de faux positifs
- **Spécificité** (ne pas sur-alarmer) — favorise un seuil haut = risque de manquer des vrais cas

Un taux de faux positifs supérieur à 15% sur 30 jours glissants doit déclencher une revue des seuils. Un taux inférieur à 5% peut indiquer que des cas suspects passent à travers les mailles (faux négatifs non détectés).

### 9.2 Biais géographique — populations MENA

Les règles HAWALA_PATTERN, MENA_STRUCTURING et CASH_INTENSIVE (Sprint 6) ont été conçues pour cibler des patterns typologiques spécifiques. Elles présentent un risque de **biais géographique et ethnique** si mal calibrées :

**Risque :** Sur-surveillance des clients d'origine MENA par rapport à des comportements identiques d'autres origines.

**Mesures de mitigation en place :**
- Les règles MENA ne se déclenchent pas sur la seule appartenance géographique — elles requièrent des combinaisons de conditions (fréquence + montant + canal + pays)
- La règle CASH_INTENSIVE requiert une incohérence de profil OU une résidence MENA (et non uniquement la résidence)
- Monitoring mensuel du taux de faux positifs segmenté par origine géographique des clients
- Revue semestrielle dédiée par le comité conformité pour détecter tout biais systémique
- Tous les faux positifs MENA sont analysés et rapportés au responsable conformité

**Recommandation :** Les analystes doivent être sensibilisés au risque de confirmation de biais. Une alerte HAWALA sur un travailleur migrant envoyant des fonds à sa famille n'est pas systématiquement suspecte. L'investigation doit être factuelle et documentée, sans a priori.

### 9.3 Cold Start — nouveaux clients

La règle VOLUME_SPIKE comporte une protection explicite contre le problème de cold start : elle ne se déclenche pas si le client a moins de 3 transactions historiques (le score de référence n'est pas significatif).

D'autres règles (STRUCTURING, HIGH_FREQUENCY, pKYC) sont également moins pertinentes pour les clients sans historique. Pour les nouvelles entrées en relation, les scores de risque client initial et le screening sont les mécanismes principaux.

### 9.4 Données manquantes ou incomplètes

Si certaines données sont manquantes (pays de contrepartie null, canal inconnu), les règles concernées retournent `triggered: false` plutôt que de générer des faux positifs sur des hypothèses. La robustesse aux données manquantes est une exigence de conception.

### 9.5 Latence du moteur et transactions haute fréquence

Le moteur fonctionne de manière synchrone pour chaque transaction. Pour des volumes très élevés (> 10 000 transactions/heure), une latence peut s'accumuler. La règle STRUCTURING et VOLUME_SPIKE impliquent des requêtes en base de données — elles sont les plus sensibles à la charge.

---

*Document produit par l'équipe Architecture & Conformité — KYC/AML Platform v2.5*
*Prochaine révision complète : septembre 2026*
*Questions techniques : dsi@kyc-aml-platform.fr*
*Questions réglementaires : compliance@kyc-aml-platform.fr*
