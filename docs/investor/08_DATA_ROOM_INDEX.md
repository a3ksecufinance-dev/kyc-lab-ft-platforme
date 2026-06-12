# WatchReg — Data Room Index
## Structure & Checklist Due Diligence
### Confidentiel — Mai 2026

---

## ORGANISATION DU DATA ROOM

> Le data room est structuré selon les standards attendus par les fonds VC et investisseurs
> institutionnels pour une levée de fonds Seed/Pre-Series A dans le secteur SaaS B2B.
> Utiliser un outil sécurisé : Notion (accès restreint), DocSend, ou Google Drive (partage individuel).

---

## STRUCTURE DES DOSSIERS

```
WatchReg — Data Room/
├── 00_INDEX.md                        ← Ce document
├── 01_COMPANY/
│   ├── 01a_Executive_Summary.pdf
│   ├── 01b_Pitch_Deck_Investor.pdf
│   ├── 01c_Company_Overview_1pager.pdf
│   └── 01d_Founding_Story.pdf
│
├── 02_PRODUCT/
│   ├── 02a_Product_Roadmap.pdf
│   ├── 02b_Demo_Video_Link.txt         ← Lien démo enregistrée
│   ├── 02c_Technical_Architecture.pdf
│   ├── 02d_Security_Overview.pdf
│   └── 02e_Product_Screenshots.pdf
│
├── 03_MARKET/
│   ├── 03a_Competitive_Matrix.pdf
│   ├── 03b_TAM_SAM_SOM_Analysis.pdf
│   ├── 03c_Regulatory_Context_BAM.pdf
│   └── 03d_MENA_RegTech_Market_Report.pdf
│
├── 04_FINANCIALS/
│   ├── 04a_Financial_Model_5Y.xlsx
│   ├── 04b_Unit_Economics.pdf
│   ├── 04c_Pricing_Model.pdf
│   └── 04d_Cap_Table.xlsx
│
├── 05_COMMERCIAL/
│   ├── 05a_Pipeline_Commercial.pdf
│   ├── 05b_LOI_Signed_[Client1].pdf    ← (si disponible)
│   ├── 05c_POC_Agreement_Template.pdf
│   ├── 05d_Customer_References.pdf
│   └── 05e_Sales_Deck.pdf
│
├── 06_LEGAL/
│   ├── 06a_Legal_Structure.pdf
│   ├── 06b_IP_Register.pdf
│   ├── 06c_Terms_of_Service_Draft.pdf
│   ├── 06d_Privacy_Policy_Draft.pdf
│   └── 06e_Employment_Contracts.pdf    ← (si applicable)
│
├── 07_TEAM/
│   ├── 07a_Founder_CV.pdf
│   ├── 07b_Advisory_Board.pdf
│   ├── 07c_Hiring_Plan.pdf
│   └── 07d_Org_Chart.pdf
│
└── 08_TECHNICAL_DD/
    ├── 08a_Architecture_Diagram.pdf
    ├── 08b_Security_Audit_Report.pdf   ← (si disponible)
    ├── 08c_Code_Quality_Report.pdf
    ├── 08d_Test_Coverage_Report.pdf
    └── 08e_Infrastructure_Overview.pdf
```

---

## CHECKLIST — STATUT DOCUMENTS

### Dossier 01 — Company

| Document | Statut | Priorité | Commentaire |
|---------|--------|----------|-------------|
| Executive Summary (1–2 pages) | ✅ Rédigé | Critique | `/docs/investor/07_EXECUTIVE_SUMMARY.md` |
| Pitch Deck Investisseurs (PDF) | ✅ Rédigé | Critique | `/docs/investor/01_PITCH_DECK.md` → convertir PDF |
| Company Overview 1-pager | 🔄 À créer | Haute | Extraire du Pitch Deck |
| Founding Story | 🔄 À rédiger | Moyenne | Histoire fondateur, motivation |

### Dossier 02 — Product

| Document | Statut | Priorité | Commentaire |
|---------|--------|----------|-------------|
| Product Roadmap | ✅ Rédigé | Critique | `/docs/investor/02_ROADMAP_PRODUIT.md` |
| Démo vidéo enregistrée | 🔄 À filmer | Critique | Scripts B et C disponibles |
| Technical Architecture | ✅ Rédigé | Haute | `/docs/investor/09_TECHNICAL_ARCHITECTURE.md` |
| Security Overview | 🔄 À extraire | Haute | Extraire de l'architecture + code |
| Screenshots produit | 🔄 À capturer | Haute | 10–15 captures annotées |

### Dossier 03 — Market

| Document | Statut | Priorité | Commentaire |
|---------|--------|----------|-------------|
| Competitive Matrix | ✅ Rédigé | Critique | `/docs/investor/03_COMPETITIVE_MATRIX.md` |
| TAM/SAM/SOM Analysis | ✅ Dans Pitch Deck | Critique | Slide 5–6 du Pitch Deck |
| Regulatory Context BAM | 🔄 À extraire | Haute | Résumer Circulaire 5/W/2023 + FATF |
| MENA RegTech Market Report | 🔄 À sourcer | Moyenne | Rapport public ou synthèse |

### Dossier 04 — Financials

| Document | Statut | Priorité | Commentaire |
|---------|--------|----------|-------------|
| Financial Model 5Y (Excel) | 🔄 À créer | Critique | Modèle mensuel avec hypothèses |
| Unit Economics | 🔄 À créer | Critique | CAC, LTV, Payback Period |
| Pricing Model | ✅ Dans Pitch Deck | Haute | Détailler par tier et module |
| Cap Table | 🔄 À créer | Critique | Structure actuelle + post-money |

### Dossier 05 — Commercial

| Document | Statut | Priorité | Commentaire |
|---------|--------|----------|-------------|
| Pipeline Commercial | 🔄 À créer | Critique | Tableau prospects qualifiés |
| LOI(s) signée(s) | 🔄 À signer | Critique | Template disponible |
| POC Agreement Template | ✅ Rédigé | Haute | `/docs/investor/05_POC_AGREEMENT.md` |
| Customer References | 🔄 À obtenir | Critique | 1–2 contacts beta / pilotes |
| Sales Deck (version courte) | 🔄 À créer | Haute | 10 slides pour prospects |

### Dossier 06 — Legal

| Document | Statut | Priorité | Commentaire |
|---------|--------|----------|-------------|
| Legal Structure | 🔄 À documenter | Critique | SARL/SA, siège, ICE, RC |
| IP Register | 🔄 À créer | Haute | Code, marque, nom de domaine |
| Terms of Service Draft | 🔄 À rédiger | Haute | CGV SaaS + SLA |
| Privacy Policy Draft | 🔄 À rédiger | Haute | RGPD + Loi 09-08 Maroc |
| Employment Contracts | 🔄 N/A si solo | Moyenne | Si recrutement en cours |

### Dossier 07 — Team

| Document | Statut | Priorité | Commentaire |
|---------|--------|----------|-------------|
| Founder CV (version investisseur) | 🔄 À préparer | Critique | 1–2 pages, focus achievements |
| Advisory Board | ✅ Rédigé | Haute | `/docs/investor/06_ADVISORY_BOARD.md` |
| Hiring Plan | 🔄 À créer | Haute | Plan recrutement 12 mois |
| Org Chart | 🔄 À créer | Moyenne | Structure actuelle + cible |

### Dossier 08 — Technical Due Diligence

| Document | Statut | Priorité | Commentaire |
|---------|--------|----------|-------------|
| Architecture Diagram | ✅ Rédigé | Critique | `/docs/investor/09_TECHNICAL_ARCHITECTURE.md` |
| Security Audit | 🔄 À réaliser | Haute | Pentest ou auto-audit documenté |
| Code Quality Report | ✅ Partiel | Haute | 216/216 tests, 0 erreurs TS |
| Test Coverage Report | ✅ Disponible | Haute | `pnpm test` output |
| Infrastructure Overview | 🔄 À créer | Haute | Cloud provider, SLA, backup |

---

## DOCUMENTS CRITIQUES POUR LEVÉE DE FONDS

Les 8 documents sans lesquels un investisseur sérieux ne peut pas compléter
sa due diligence :

| # | Document | Blocant si absent |
|---|---------|------------------|
| 1 | Pitch Deck (PDF) | Oui — premier contact |
| 2 | Financial Model 5Y | Oui — validation thèse |
| 3 | Cap Table | Oui — conditions deal |
| 4 | Executive Summary | Oui — mémo investissement |
| 5 | Démo vidéo ou démo live | Oui — validation produit |
| 6 | Pipeline + LOI(s) | Oui — validation traction |
| 7 | Technical Architecture | Oui — DD technique |
| 8 | Founder CV | Oui — team assessment |

---

## PIPELINE COMMERCIAL — TEMPLATE

> À maintenir à jour avant chaque réunion investisseur

| # | Établissement | Type | Segment | Contact | Statut | Prochaine étape | ARR potentiel | Date |
|---|--------------|------|---------|---------|--------|----------------|---------------|------|
| 1 | [Nom] | Banque | Tier 2 | [Nom] | Discovery call | Démo planifiée | 400 000 MAD | [Date] |
| 2 | [Nom] | Soc. financement | — | [Nom] | Démo faite | POC en cours | 200 000 MAD | [Date] |
| 3 | [Nom] | Fintech | — | [Nom] | LOI signée | Contrat en négociation | 150 000 MAD | [Date] |
| ... | | | | | | | | |
| **Total pipeline** | | | | | | | **[___] MAD** | |

**Statuts possibles :**
`Prospect identifié` → `Approché` → `Discovery call` → `Démo faite` → `POC en cours` →
`LOI signée` → `Négociation contrat` → `Contrat signé` → `Client actif`

---

## MODÈLE FINANCIER — STRUCTURE RECOMMANDÉE

> Le fichier Excel doit couvrir :

### Onglet 1 — Hypothèses (Inputs)

```
- Nb clients/mois acquis (par segment)
- Prix moyen par tier
- Taux de churn mensuel
- Coût infrastructure par client
- Coût équipe (salaires)
- Coût acquisition client (CAC)
- Taux de conversion pipeline
```

### Onglet 2 — P&L Mensuel (36 mois)

```
- ARR / MRR
- Revenus reconnus
- COGS (infrastructure, support)
- Gross Profit
- OpEx (salaires, marketing, juridique)
- EBITDA
- Cash burn mensuel
- Runway restant
```

### Onglet 3 — Unit Economics

```
- CAC par canal (direct, partenaire, inbound)
- LTV (lifetime value) par tier
- Payback period
- LTV/CAC ratio (cible : > 3)
- Gross margin by cohort
```

### Onglet 4 — Cap Table

```
- Fondateur(s) : [___]%
- Advisors (BSPCE) : [1.5–3]%
- Fonds Seed (à lever) : [15–25]%
- ESOP réservé : [10]%
- Total dilué : 100%
```

### Onglet 5 — Scénarios

```
- Scenario Bear : acquisition lente (1 client/trimestre)
- Scenario Base : objectifs nominaux
- Scenario Bull : partenariat Big4 + 2 clients bancaires Year 1
```

---

## ACCÈS ET SÉCURITÉ DU DATA ROOM

### Règles d'accès

| Niveau | Qui | Contenu accessible |
|--------|-----|-------------------|
| **Teaser** | Tout investisseur intéressé | Executive Summary + Pitch Deck |
| **Niveau 1** | Après NDA signé | + Financials + Product + Market |
| **Niveau 2** | Due diligence avancée | + Legal + Technical + Cap Table |
| **Niveau 3** | Investisseur engagé (term sheet) | Tout le data room |

### Outils recommandés

| Outil | Usage | Coût |
|-------|-------|------|
| **DocSend** | Tracking des lectures (pages vues, temps) | ~30$/mois |
| **Notion** | Organisation interne + partage lien | Gratuit |
| **Google Drive** | Alternative simple avec partage par email | Gratuit |
| **Dropbox Sign** | Signature électronique NDA | ~20$/mois |

### Watermarking

Toujours inclure en bas de chaque document PDF :
```
Confidentiel — WatchReg — [Prénom Nom Investisseur] — [Date]
NDA requis — Ne pas reproduire ni distribuer
```

---

*Document confidentiel — WatchReg — Mai 2026*
*À mettre à jour avant chaque cycle de fundraising*
