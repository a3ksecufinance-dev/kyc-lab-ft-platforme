# WatchReg — Pitch Deck
## KYC-AML Compliance Platform for African & MENA Financial Institutions
### Confidentiel — Mai 2026

---

## SLIDE 1 — COUVERTURE

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   W A T C H R E G                                        ║
║   ─────────────────────────────────────────────────────  ║
║   La conformité réglementaire,                           ║
║   automatisée et auditée.                                ║
║                                                          ║
║   KYC · AML · SAR/STR · Dual Control · Audit Trail       ║
║                                                          ║
║   Série Seed — Mai 2026                                  ║
║   Confidentiel                                           ║
╚══════════════════════════════════════════════════════════╝
```

**Contact :** [Fondateur] · contact@watchreg.ma
**Version :** 2.5 Production-Ready

---

## SLIDE 2 — LE PROBLÈME

### Les banques marocaines passent en moyenne **18 mois** à construire leur conformité AML manuellement.

**3 douleurs critiques identifiées :**

```
┌─────────────────────────────────────────────────────────┐
│  ❌  MANUEL & FRAGMENTÉ                                  │
│      Excel + emails + fichiers PDF circulants.          │
│      Aucune traçabilité. Risque d'inspection BAM.       │
├─────────────────────────────────────────────────────────┤
│  ❌  COÛT PROHIBITIF DES SOLUTIONS ÉTRANGÈRES           │
│      Oracle FCCM, Actimize : 2–5M€/an.                  │
│      Inaccessibles pour 80% du marché.                  │
├─────────────────────────────────────────────────────────┤
│  ❌  NON-CONFORMITÉ BAM = SANCTIONS CROISSANTES         │
│      Circulaire 5/W/2023 : nouvelles obligations.       │
│      Amende jusqu'à 1% du capital social par infraction.│
└─────────────────────────────────────────────────────────┘
```

> **Chiffre clé :** En 2025, Bank Al-Maghrib a émis 14 rappels à l'ordre
> pour défaillances AML auprès d'établissements financiers marocains.

---

## SLIDE 3 — LA SOLUTION

### WatchReg : La première plateforme KYC-AML SaaS conçue pour la réglementation BAM & FATF, opérationnelle aujourd'hui.

```
  DÉTECTION          INVESTIGATION        CONFORMITÉ
  AUTOMATIQUE        STRUCTURÉE           RÉGLEMENTAIRE

  ┌──────────┐       ┌──────────┐         ┌──────────┐
  │ Webhook  │──────▶│ Dossiers │────────▶│ SAR/STR  │
  │ CBS/Core │       │ Timeline │         │ ANRF     │
  │ Banking  │       │ Workflow │         │ AMLD6    │
  └──────────┘       └──────────┘         └──────────┘
       │                   │                    │
       ▼                   ▼                    ▼
  ┌──────────┐       ┌──────────┐         ┌──────────┐
  │ Scoring  │       │ 4-Yeux   │         │ Audit    │
  │ AML/ML   │       │ Dual     │         │ Trail    │
  │ 94/100   │       │ Control  │         │ Inaltér. │
  └──────────┘       └──────────┘         └──────────┘
```

**Résultat démontré en démo :**
De la détection d'un virement suspect à la transmission ANRF : **< 15 minutes** vs **72h en moyenne** actuellement.

---

## SLIDE 4 — DÉMONSTRATION PRODUIT

### Ce qui est livrable aujourd'hui — v2.5 Production-Ready

| Module | Statut | Différenciation |
|--------|--------|----------------|
| KYC Onboarding & Scoring | ✅ Production | Score ML + OCR + pKYC périodique |
| Détection AML temps réel | ✅ Production | Webhook CBS < 200ms, 6 règles FATF |
| Screening Sanctions | ✅ Production | OFAC + EU + ONU + UK + BAM |
| Gestion alertes & dossiers | ✅ Production | Workflow OPEN→ESCALATED→SAR |
| SAR/STR avec suivi ANRF | ✅ Production | Seule solution avec tracking ANRF natif |
| Dual Control (4-yeux) | ✅ Production | ACPR art.13 — blocage technique |
| Audit Trail inaltérable | ✅ Production | Export CSV pour inspection BAM |
| Dashboard Direction | ✅ Production | 8 KPIs BAM/FATF pour ComCo |
| Correspondent Banking | 🔄 Q3 2026 | FATF R.13 — module F1 |
| CBS SDK TypeScript | 🔄 Q3 2026 | Intégration natif core banking |
| API publique | 📅 Q4 2026 | Ouverture partenaires |

**Stack technique :** TypeScript · React · tRPC · PostgreSQL · Docker
**Tests :** 216/216 ✅ · 0 erreur TypeScript · 0 warning ESLint
**Sécurité :** AES-256-GCM PII · JWT + JTI · Rate limiting · CORS strict

---

## SLIDE 5 — MARCHÉ (TAM/SAM/SOM)

### Un marché réglementaire non-optionnel

```
                    TAM — Marché Adressable Total
         ┌─────────────────────────────────────────────┐
         │   RegTech AML/KYC — Afrique & MENA          │
         │          2,4 Md USD (2026)                  │
         │      CAGR : 22% jusqu'en 2030               │
         └───────────────┬─────────────────────────────┘
                         │
                    SAM — Marché Marocain + Maghreb
              ┌──────────┴──────────────────┐
              │  Maroc · Tunisie · Algérie   │
              │  ~180M USD de dépenses       │
              │  compliance/an (estimé)      │
              └──────────┬──────────────────┘
                         │
                    SOM — Cible Prioritaire (3 ans)
                   ┌─────┴──────┐
                   │   Maroc    │
                   │  ~28M USD  │
                   │  atteignable│
                   └────────────┘
```

**Marché marocain — cibles primaires :**

| Segment | Nb. établissements | Dépenses compliance/an | Potentiel WatchReg |
|---------|-------------------|----------------------|-------------------|
| Banques (BAM agréées) | 24 | 2–8M MAD/an | 800K–2M MAD ACV |
| Établissements paiement | 31 | 500K–2M MAD/an | 200–600K MAD ACV |
| Bureaux de change | 218 | 80–300K MAD/an | 60–120K MAD ACV |
| Sociétés de financement | 45 | 300K–1M MAD/an | 150–400K MAD ACV |
| Sociétés d'assurance | 22 | 1–3M MAD/an | 300–800K MAD ACV |
| **TOTAL MAROC** | **~340** | **~400M MAD/an** | **~85M MAD potentiel** |

---

## SLIDE 6 — BUSINESS MODEL

### SaaS B2B — Revenus récurrents annuels (ARR)

```
  ┌────────────────────────────────────────────────────────┐
  │  TIER 1 — ENTERPRISE (Grandes banques)                 │
  │  ACV : 800K – 2M MAD/an                               │
  │  Modules : All-in + support dédié + SLA 99.9%         │
  │  Onboarding : 3–6 mois                                │
  ├────────────────────────────────────────────────────────┤
  │  TIER 2 — PROFESSIONAL (Banques moyennes, paiement)    │
  │  ACV : 200K – 800K MAD/an                             │
  │  Modules : Core KYC/AML + SAR/STR + Audit             │
  │  Onboarding : 1–3 mois                                │
  ├────────────────────────────────────────────────────────┤
  │  TIER 3 — STARTER (Bureaux de change, microfinance)    │
  │  ACV : 60K – 200K MAD/an                              │
  │  Modules : KYC + Screening + Alertes                  │
  │  Onboarding : 2–4 semaines                            │
  └────────────────────────────────────────────────────────┘
```

**Revenus additionnels :**
- Implémentation & intégration CBS : 100K–500K MAD (one-time)
- Formation & certification compliance : 20K–50K MAD/session
- Modules add-on (Correspondent Banking, Travel Rule, Agents) : +20% ACV
- API usage (volume > seuil) : 0.02 MAD/transaction analysée

**Économie unitaire (Tier 2 type) :**
- ACV moyen : 400K MAD
- Coût acquisition (CAC) : 80K MAD
- Coût service (COGS) : 100K MAD
- Marge brute : **75%**
- Payback period : **7 mois**
- LTV (5 ans) : **2M MAD**
- LTV/CAC : **25x**

---

## SLIDE 7 — MODÈLE FINANCIER (PROJECTIONS 5 ANS)

### Hypothèses conservatrices — Maroc uniquement (Year 1–3), Maghreb (Year 4–5)

| | 2026 | 2027 | 2028 | 2029 | 2030 |
|-|------|------|------|------|------|
| **Clients actifs** | 3 | 9 | 19 | 32 | 50 |
| *dont Tier 1* | 0 | 1 | 3 | 5 | 8 |
| *dont Tier 2* | 2 | 5 | 10 | 17 | 26 |
| *dont Tier 3* | 1 | 3 | 6 | 10 | 16 |
| **ARR (KMAD)** | 900 | 3 200 | 7 800 | 15 500 | 26 000 |
| **Revenus one-time (KMAD)** | 600 | 1 200 | 1 800 | 2 400 | 3 000 |
| **Revenus totaux (KMAD)** | 1 500 | 4 400 | 9 600 | 17 900 | 29 000 |
| **Charges opex (KMAD)** | 3 200 | 5 800 | 9 000 | 13 000 | 18 000 |
| **EBITDA (KMAD)** | -1 700 | -1 400 | +600 | +4 900 | +11 000 |
| **Burn mensuel (KMAD)** | 142 | 117 | — | — | — |

**Point d'équilibre : T3 2028**
**Hypothèse churn : 8%/an** (secteur financier : contrats pluriannuels)
**NRR cible : 115%** (expansion modules)

---

## SLIDE 8 — ROADMAP PRODUIT

```
  ████████████████████  LIVRÉ v2.5 (Mai 2026)
  ├── KYC + Scoring ML + pKYC périodique
  ├── Détection AML temps réel (webhook CBS)
  ├── Screening 5 listes (OFAC/EU/ONU/UK/BAM)
  ├── SAR/STR + Suivi ANRF + Dual Control 4-yeux
  ├── Dashboard Direction 8 KPIs BAM/FATF
  └── Audit Trail inaltérable + Export CSV

  ░░░░░░░░░░░░░░░░░░░░  Q3 2026 — Expansion
  ├── Correspondent Banking Risk (FATF R.13)
  ├── CBS SDK TypeScript (intégration universelle)
  ├── Travel Rule (FATF R.16 — crypto/paiements)
  └── API publique REST + webhooks outbound

  ░░░░░░░░░░░░░░░░░░░░  Q4 2026 — Scale
  ├── Multi-tenant SaaS (isolation données)
  ├── Intégration GoAML ANRF natif
  ├── Module Microfinance & Bureau de change
  └── Mobile app compliance officer

  ░░░░░░░░░░░░░░░░░░░░  2027 — Maghreb & MENA
  ├── Localisation Tunisie (BCT) + Algérie (BA)
  ├── Module Islamic Finance AML
  ├── AI Narrative SAR (génération automatique)
  └── Marketplace règles AML communautaires
```

---

## SLIDE 9 — MATRICE CONCURRENTIELLE

### WatchReg vs. Concurrents

| Critère | WatchReg | Oracle FCCM | Nice Actimize | ComplyAdvantage | Solution interne |
|---------|:--------:|:-----------:|:-------------:|:---------------:|:----------------:|
| **Prix accessible PME** | ✅ | ❌ | ❌ | ⚠️ | ❌ |
| **Conformité BAM native** | ✅ | ❌ | ❌ | ❌ | ⚠️ |
| **Suivi ANRF intégré** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Dual Control 4-yeux** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Déploiement < 3 mois** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Webhook CBS universel** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Dashboard Direction** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **SaaS cloud + on-premise** | ✅ | ⚠️ | ⚠️ | ✅ | ❌ |
| **Support francophone BAM** | ✅ | ❌ | ❌ | ❌ | N/A |
| **Open source partiel** | ✅ | ❌ | ❌ | ❌ | N/A |
| **Prix/an (Tier 2)** | **200-800K MAD** | >5M MAD | >4M MAD | >1M MAD | >3M MAD (capex) |

**Positionnement :** WatchReg est la seule solution combinant conformité BAM native, prix accessible, et déploiement rapide pour le marché marocain.

---

## SLIDE 10 — TRACTION & VALIDATION

### Ce qui prouve la demande marché

```
  ✅  PRODUIT
      ├── v2.5 opérationnelle — 216/216 tests
      ├── Architecture production (Docker, CI/CD)
      └── Démo live disponible immédiatement

  ✅  RÉGLEMENTAIRE
      ├── Circulaire BAM 5/W/2023 — couverture 100%
      ├── FATF R.10 à R.16 — implémentés
      └── AMLD6 KPIs — rapport exportable

  🔄  EN COURS (pipeline)
      ├── 2 discussions pilotes avec établissements de paiement
      ├── 1 discussion Tier 2 (banque régionale)
      └── 1 candidat Advisory Board (ex-BAM)

  📅  CIBLES 6 MOIS
      ├── 1 LOI signé
      ├── 1 POC en production
      └── 1 premier contrat ARR
```

---

## SLIDE 11 — ÉQUIPE & ADVISORY BOARD

### Fondateur

**[Nom Fondateur]** — CEO & CTO
- [Expérience technique] — spécialiste compliance fintech
- [Background] — compréhension marché marocain & réglementation BAM
- Construit WatchReg v2.5 de zéro à production en [durée]

### Advisory Board (en constitution)

| Profil recherché | Rôle | Valeur apportée |
|-----------------|------|----------------|
| **Ex-BAM (Direction Supervision)** | Regulatory Advisor | Crédibilité réglementaire, accès décideurs |
| **Compliance Officer — banque TOP5 Maroc** | Product Advisor | Validation fonctionnelle, premier client potentiel |
| **Directeur IT — établissement paiement** | Technical Advisor | Intégration CBS, cas d'usage réels |
| **Expert RegTech MENA / Investisseur** | Strategic Advisor | Expansion régionale, deal flow |

---

## SLIDE 12 — BESOIN & UTILISATION DES FONDS

### Levée Seed : 3–5M MAD

```
  ████████████████████████████████████████  Utilisation

  40%  ──  Équipe (2 devs senior + 1 commercial)
  25%  ──  Ventes & Marketing (pilotes, certifications)
  20%  ──  Infrastructure & sécurité (hosting, audits)
  10%  ──  Légal & conformité (IP, certifications BAM)
   5%  ──  Réserve opérationnelle
```

**Milestones 18 mois post-levée :**
- M6 : 3 clients payants, ARR 1,5M MAD
- M12 : 7 clients, ARR 3,5M MAD, breakeven unitaire
- M18 : 12 clients, ARR 6M MAD, expansion Tunisie amorcée

**Runway avec cette levée : 24 mois**

---

## SLIDE 13 — STRUCTURE JURIDIQUE

```
  WatchReg SARL (Maroc)
  ├── Capital social : [montant] MAD
  ├── Siège : Casablanca (CFC ou Technopark)
  ├── Activité principale : Édition logiciel SaaS (CNSS 72.11)
  ├── Propriété intellectuelle : code source déposé OMPIC
  │
  ├── [Fondateur] — [X]% — Fondateur & CEO
  ├── [Co-fondateur] — [Y]% — si applicable
  └── Pool ESOP — 10–15% — Réservé équipe future

  Post-levée Seed :
  ├── Investisseurs — 15–25%
  └── Fondateurs — 75–85%
```

**Protections IP :**
- Code source déposé OMPIC (Office Marocain de la Propriété Industrielle)
- Marque "WatchReg" déposée
- Accords de confidentialité (NDA) systématiques avec prospects

---

## SLIDE 14 — POURQUOI MAINTENANT

### La fenêtre d'opportunité est ouverte

```
  2023  ──  BAM publie Circulaire 5/W/2023 (nouvelles obligations)
  2024  ──  Délai de mise en conformité : 18 mois
  2025  ──  Premières sanctions — banques non conformes
  2026  ──  WatchReg opérationnel — LE bon timing
  2027  ──  Marché mature — coût d'acquisition augmente
```

**3 facteurs créant l'urgence :**

1. **Réglementaire** — Délai de conformité BAM expiré. Les sanctions arrivent.
2. **Budgétaire** — Les banques ont inscrit conformité AML dans leur budget 2026.
3. **Concurrentiel** — Aucun acteur local dominant. Fenêtre de 18 mois.

---

## SLIDE 15 — APPEL À L'ACTION

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   WatchReg cherche ses premiers partenaires              ║
║   stratégiques pour conquérir le marché marocain.        ║
║                                                          ║
║   Investissement Seed : 3–5M MAD                        ║
║   Valorisation pre-money : [à discuter]                  ║
║                                                          ║
║   Ce que nous offrons :                                  ║
║   ✅ Produit opérationnel — démo live disponible         ║
║   ✅ Marché régulé — churn quasi-nul                     ║
║   ✅ Timing réglementaire idéal                          ║
║   ✅ Équipe focalisée — zéro distraction                 ║
║                                                          ║
║   Prochaine étape : Demo + Discussion termes             ║
║   contact@watchreg.ma                                    ║
╚══════════════════════════════════════════════════════════╝
```

---

*Document confidentiel — Propriété exclusive WatchReg. Ne pas diffuser sans autorisation.*
*Mai 2026 — Version 1.0*
