# WatchReg — Matrice Concurrentielle RegTech
## Analyse compétitive détaillée — Marché Marocain & MENA
### Confidentiel — Mai 2026

---

## SYNTHÈSE EXÉCUTIVE

**WatchReg occupe une position unique** : seule solution combinant conformité BAM native, prix accessible aux institutions de taille moyenne, et déploiement rapide. Les solutions internationales (Oracle, Actimize) ciblent les grandes banques avec des contrats > 3M MAD/an. Les solutions légères (ComplyAdvantage) manquent de modules opérationnels complets pour le contexte réglementaire marocain.

**Fenêtre compétitive estimée : 18–24 mois** avant qu'un concurrent local ou régional n'émerge.

---

## PANORAMA DES CONCURRENTS

### TIER A — Plateformes Enterprise (Concurrents indirects)

#### 1. Oracle Financial Services AML (FCCM)
- **Positionnement :** Leader mondial, large banques internationales
- **Prix :** 3–8M€/an + implémentation 2–5M€
- **Forces :** Mature, intégré Oracle Banking, certifications mondiales
- **Faiblesses :** Prix prohibitif PME, 12–24 mois de déploiement, zéro localisation BAM
- **Présence Maroc :** 2–3 grandes banques (rumeurs)
- **Menace pour WatchReg :** Faible (segment différent)

#### 2. NICE Actimize
- **Positionnement :** Top 3 mondial AML/Fraud
- **Prix :** 2–5M€/an
- **Forces :** IA avancée, réseau mondial, références tier-1
- **Faiblesses :** Pas de module ANRF, coût intégration élevé, support anglophone
- **Présence Maroc :** Non identifiée
- **Menace pour WatchReg :** Faible à court terme

#### 3. SAS Anti-Money Laundering
- **Positionnement :** Analytics + AML intégré
- **Prix :** 1.5–4M€/an
- **Forces :** Moteur analytics puissant, reporting avancé
- **Faiblesses :** Complexité déploiement, nécessite équipe data science interne
- **Présence Maroc :** Projets ponctuels (consulting)
- **Menace pour WatchReg :** Faible

---

### TIER B — Solutions Mid-Market (Concurrents potentiels)

#### 4. ComplyAdvantage
- **Positionnement :** SaaS screening + monitoring, 1000+ clients
- **Prix :** 50–500K€/an selon volume
- **Forces :** API moderne, onboarding rapide, UX soignée, 500+ listes sanctions
- **Faiblesses :** Pas de module SAR/STR, pas de dual control, pas d'audit trail réglementaire, pas de conformité BAM
- **Présence Maroc :** Quelques fintechs (Usages API screening uniquement)
- **Menace pour WatchReg :** Modérée sur le screening uniquement

#### 5. Napier AI
- **Positionnement :** AML nouvelle génération, IA explicable
- **Prix :** 200K–1M€/an
- **Forces :** IA transparente, intégrations modernes, compliance officer UX
- **Faiblesses :** Pas localisé Maroc, pas de suivi ANRF, peu de références MENA
- **Présence Maroc :** Non identifiée
- **Menace pour WatchReg :** Modérée à 2027+

#### 6. Temenos Financial Crime Mitigation (FCM)
- **Positionnement :** Intégré au core banking Temenos
- **Prix :** Inclus dans licences Temenos ou module séparé
- **Forces :** Intégration native Temenos (utilisé par plusieurs banques marocaines)
- **Faiblesses :** Dépendance Temenos, pas de module ANRF, coûts de customisation élevés
- **Présence Maroc :** Potentielle (banques sous Temenos T24)
- **Menace pour WatchReg :** Forte pour les banques Temenos — à surveiller

---

### TIER C — Alternatives locales & DIY (Concurrents directs)

#### 7. Solutions développées en interne (Build vs. Buy)
- **Profil client :** Grandes banques avec équipe IT > 50 personnes
- **Coût estimé :** 3–10M MAD (capex) + 1–2M MAD/an maintenance
- **Forces :** Contrôle total, pas de dépendance fournisseur
- **Faiblesses :** 18–36 mois de développement, dette technique, pas de mises à jour réglementaires auto, risque de non-conformité
- **Présence Maroc :** 3–4 grandes banques (projets pluriannuels)
- **Menace pour WatchReg :** Forte pour Tier 1, nulle pour Tier 2/3

#### 8. Cabinets de conseil (KPMG, Deloitte, EY — implémentation manuelle)
- **Positionnement :** Audit + mise en conformité manuelle + formation
- **Prix :** 500K–3M MAD/mission
- **Forces :** Crédibilité, expertise réglementaire, relation directe BAM
- **Faiblesses :** Pas de SaaS, pas de continuité, pas d'automatisation
- **Menace pour WatchReg :** Faible concurrence directe — potentiel partenariat

---

## MATRICE COMPARATIVE DÉTAILLÉE

### Fonctionnalités Opérationnelles

| Fonctionnalité | WatchReg | Oracle FCCM | Actimize | ComplyAdvantage | Napier | Temenos FCM | Interne |
|---------------|:--------:|:-----------:|:--------:|:---------------:|:------:|:-----------:|:-------:|
| KYC Onboarding digital | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| Scoring ML multi-critères | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ❌ |
| pKYC périodique auto | ✅ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ |
| UBO management | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ⚠️ |
| Webhook CBS universel | ✅ | ✅ | ✅ | ❌ | ✅ | ✅* | ❌ |
| Détection temps réel < 1s | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Builder règles AML visuel | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ❌ |
| Screening 5+ listes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Workflow SAR/STR complet | ✅ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ |
| Dual Control 4-yeux | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ |
| Audit Trail inaltérable | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| Dashboard Direction KPIs | ✅ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ |
| SLA monitoring réglementaire | ✅ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ |

*Natif Temenos uniquement

### Conformité Réglementaire Maroc

| Exigence | WatchReg | Oracle FCCM | ComplyAdvantage | Interne |
|---------|:--------:|:-----------:|:---------------:|:-------:|
| **BAM Circulaire 5/W/2023** | ✅ Natif | ❌ Customisation | ❌ | ⚠️ |
| **Suivi ANRF (Maroc)** | ✅ Intégré | ❌ | ❌ | ⚠️ |
| **AMLD6 KPIs exportables** | ✅ | ⚠️ | ❌ | ❌ |
| **FATF R.10 – R.12** | ✅ | ✅ | ⚠️ | ⚠️ |
| **FATF R.13 (Correspondant)** | 🔄 Q3 2026 | ✅ | ❌ | ❌ |
| **FATF R.15 (Crypto/Paiement)** | ✅ | ✅ | ⚠️ | ❌ |
| **FATF R.16 (Travel Rule)** | 🔄 Q4 2026 | ✅ | ⚠️ | ❌ |
| **Rapport BAM mensuel** | ✅ | ⚠️ | ❌ | ⚠️ |
| **Support francophone BAM** | ✅ | ❌ | ❌ | N/A |

### Critères Commerciaux & Opérationnels

| Critère | WatchReg | Oracle FCCM | Actimize | ComplyAdvantage | Interne |
|---------|:--------:|:-----------:|:--------:|:---------------:|:-------:|
| **Prix annuel Tier 2** | 200–800K MAD | >5M MAD | >4M MAD | >1M MAD | >3M MAD (capex) |
| **Délai déploiement** | 1–3 mois | 12–24 mois | 12–18 mois | 1–2 mois | 18–36 mois |
| **Support local Maroc** | ✅ | ❌ | ❌ | ❌ | N/A |
| **Cloud + On-premise** | ✅ | ⚠️ | ⚠️ | ✅ Cloud only | ✅ |
| **API moderne (REST/tRPC)** | ✅ | ⚠️ Legacy | ⚠️ | ✅ | ⚠️ |
| **Mises à jour réglementaires** | ✅ Automatiques | ⚠️ Payantes | ⚠️ | ✅ | ❌ |
| **SLA contractuel 99.9%** | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## ANALYSE SWOT WATCHREG

### Forces (Strengths)
```
✅ Seule solution BAM-native du marché
✅ Prix 5–10x moins cher que solutions internationales
✅ Déploiement 4–10x plus rapide
✅ Suivi ANRF intégré — fonctionnalité unique
✅ Dual Control technique — ACPR art.13 natif
✅ Stack moderne TypeScript/tRPC — maintenance rapide
✅ Fondateur maîtrisant réglementation et technique
✅ Produit livrable immédiatement (v2.5)
```

### Faiblesses (Weaknesses)
```
⚠️ Marque inconnue — 0 référence client
⚠️ Équipe limitée — founder-led
⚠️ Pas encore certifié par BAM officiellement
⚠️ Module Correspondent Banking en cours
⚠️ Pas de GoAML export natif encore
⚠️ Dépendance technique fondateur court terme
```

### Opportunités (Opportunities)
```
🎯 Délai conformité BAM expiré → urgence client
🎯 Aucun acteur local dominant — marché vierge
🎯 Budget compliance 2026 déjà alloué dans les banques
🎯 Expansion naturelle Maghreb (Tunisie, Algérie)
🎯 Réglementation crypto/paiements numérique en cours BAM
🎯 Partenariats Big4 (conseil + implémentation)
🎯 Financement CGEM, CFC, UM6P Ventures possible
```

### Menaces (Threats)
```
⚠️ Temenos FCM si banques migrent vers T24
⚠️ Concurrent local financé qui copierait
⚠️ Grande banque qui open-source sa solution interne
⚠️ Délai réglementaire prolongé → réduction urgence
⚠️ Résistance culturelle au SaaS cloud (données sensibles)
```

---

## STRATÉGIE COMPÉTITIVE WATCHREG

### Positionnement : "Le Compliance OS des banques marocaines"

**Contre Oracle/Actimize :**
> "Pourquoi payer 5M MAD/an une solution conçue pour JPMorgan Chase
> quand WatchReg est conçu nativement pour BAM ?"

**Contre ComplyAdvantage :**
> "ComplyAdvantage fait le screening. WatchReg fait toute la chaîne :
> de l'onboarding à la transmission ANRF — en un seul système."

**Contre le développement interne :**
> "3 ans de développement, 5M MAD de capex, et votre conformité reste à jour
> comment ? WatchReg se met à jour automatiquement à chaque circulaire BAM."

**Contre les cabinets de conseil :**
> "Deloitte vous forme une semaine. WatchReg automatise ce travail en permanence."

---

## BARRIÈRES À L'ENTRÉE CRÉÉES PAR WATCHREG

| Barrière | Mécanisme |
|---------|-----------|
| **Données client** | Historique transactions, alertes, dossiers → impossible à migrer facilement |
| **Intégration CBS** | 3–6 mois d'intégration = fort switching cost |
| **Formation équipes** | Analyste formé sur WatchReg = réticent à changer |
| **Audit Trail** | Historique légal sur WatchReg = obligation de conservation |
| **Règles AML customisées** | Règles métier propriétaires dans le moteur WatchReg |
| **Certifications** | Une fois certifié BAM sur WatchReg, re-certification sur autre solution = coût |

**Taux de churn estimé dans le secteur : 5–8%/an** (comparé à 15–25% SaaS standard)

---

## OPPORTUNITÉS DE PARTENARIAT

| Partenaire | Type | Valeur |
|-----------|------|--------|
| **Big4 (KPMG/Deloitte/EY Maroc)** | Revendeur/intégrateur | Accès décideurs, crédibilité |
| **Temenos Maroc** | Intégration technique | Accès banques T24 |
| **OCP/SNI** | Client corporatefin | Référence flagship |
| **CIH Bank / Al Barid Bank** | Pilote banque digitale | Early adopter visible |
| **Association Professionnelle des Sociétés de Financement (APSF)** | Distribution | 45 membres |
| **GPBM (Groupement Professionnel des Banques du Maroc)** | Validation sectorielle | Crédibilité institutionnelle |

---

*Document confidentiel — WatchReg — Mai 2026*
*Sources : analyses publiques, sites corporate, données marché MENA RegTech 2025-2026*
