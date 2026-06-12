# WatchReg — Executive Summary
## Résumé Exécutif — Investisseurs
### Confidentiel — Mai 2026

---

## EN UNE PHRASE

**WatchReg est la première plateforme SaaS de conformité KYC-AML conçue nativement
pour les exigences réglementaires de Bank Al-Maghrib, ciblant les 86 établissements
financiers marocains soumis à la Circulaire 5/W/2023.**

---

## LE PROBLÈME — 86 ÉTABLISSEMENTS, ZÉRO SOLUTION LOCALE

Depuis janvier 2024, Bank Al-Maghrib impose via la **Circulaire 5/W/2023** à tous les
établissements financiers marocains de mettre en place des systèmes automatisés de
surveillance KYC/AML conformes aux standards FATF. Les banques et sociétés de financement
font face à un triple problème :

**1. Solutions internationales inaccessibles :**
Oracle FCCM, Actimize, SAS coûtent 2–8M€/an et nécessitent 12–24 mois de déploiement —
hors de portée pour les institutions de taille moyenne.

**2. Zéro localisation BAM :**
Aucune solution internationale ne couvre nativement le suivi ANRF (Autorité Nationale
du Renseignement Financier), les rapports BAM mensuels, ou les spécificités réglementaires
marocaines.

**3. Développements internes coûteux et risqués :**
Les banques qui développent en interne investissent 3–10M MAD et 18–36 mois pour obtenir
un système sans mises à jour réglementaires automatiques.

**Résultat : des institutions financières en situation de non-conformité réglementaire,
exposées à des sanctions BAM et à des risques opérationnels majeurs.**

---

## LA SOLUTION — WATCHREG v2.5

WatchReg est une plateforme SaaS complète de conformité financière, déployable en
**1–3 mois** à un prix **5–10x inférieur** aux solutions internationales.

### Ce qui existe en production aujourd'hui (v2.5, Mai 2026) :

| Module | Description | Statut |
|--------|-------------|--------|
| KYC Onboarding | Individuel + Corporate, scoring ML 15+ critères | ✅ Production |
| Détection AML | Webhook CBS < 200ms, moteur règles FATF | ✅ Production |
| Screening sanctions | OFAC + EU + UN + UK + BAM, fuzzy matching | ✅ Production |
| Workflow alertes | OPEN → ESCALATED, SLA 5j, dual control | ✅ Production |
| Rapports SAR/STR | Formulaires ANRF, suivi références, statuts | ✅ Production |
| Dual Control | Principe 4 yeux ACPR art.13, blocage technique | ✅ Production |
| Audit Trail | AES-256, horodaté, inaltérable, export CSV BAM | ✅ Production |
| Dashboard Direction | 8 KPIs BAM/FATF, sélecteur annuel | ✅ Production |

**Métriques produit :** 216/216 tests ✅ — 0 erreur TypeScript — 0 warning ESLint —
80+ endpoints API — Couverture BAM Circulaire 5/W/2023 : **100%**

---

## MARCHÉ

### Taille du marché adressable

| Niveau | Périmètre | Valeur |
|--------|-----------|--------|
| **TAM** | RegTech MENA total | 1,2 Md USD (2025) → 3,8 Md USD (2030) |
| **SAM** | Établissements financiers Maroc + Maghreb | 120–180 M USD |
| **SOM** | Marché marocain atteignable à 3 ans | 15–25 M USD |

### Marché cible immédiat (Maroc)

| Segment | Nb établissements | Panier moyen/an | Revenu potentiel |
|---------|------------------|-----------------|------------------|
| Banques Tier 2 (régionales, filiales) | 12–15 | 400 000–800 000 MAD | 5–12 M MAD |
| Sociétés de financement | 35–40 | 150 000–350 000 MAD | 5–14 M MAD |
| Fintechs agréées | 15–20 | 120 000–250 000 MAD | 2–5 M MAD |
| **Total SAM Maroc** | **62–75** | — | **12–31 M MAD/an** |

---

## MODÈLE ÉCONOMIQUE

**SaaS annuel** avec 3 niveaux basés sur le volume de clients gérés :

| Tier | Clients gérés | Prix annuel HT | ARR cible (3 ans) |
|------|--------------|----------------|-------------------|
| Starter | < 10 000 | 150 000–250 000 MAD | 10–15 clients |
| Growth | 10 000–100 000 | 300 000–600 000 MAD | 8–12 clients |
| Enterprise | > 100 000 | 700 000–1 200 000 MAD | 4–6 clients |

**Revenus récurrents (ARR) — Projection :**

| Année | Clients | ARR (MAD) | MRR (MAD) |
|-------|---------|-----------|-----------|
| An 1 (2026) | 3–5 | 800 000–1 500 000 | 67 000–125 000 |
| An 2 (2027) | 10–15 | 3 000 000–6 000 000 | 250 000–500 000 |
| An 3 (2028) | 20–30 | 7 000 000–12 000 000 | 583 000–1 000 000 |

**Taux de churn estimé :** 5–8%/an (vs. 15–25% SaaS standard — fort switching cost réglementaire)

**Gross margin cible :** 75–85% (SaaS infrastructure légère, pas de hardware)

---

## AVANTAGES COMPÉTITIFS

1. **BAM-native** — Seule solution couvrant 100% de la Circulaire 5/W/2023 nativement
2. **ANRF intégré** — Suivi des déclarations de soupçon, unique sur le marché
3. **Prix 5–10x** — Accessible aux institutions qui représentent 80% du marché
4. **Déploiement 4–10x** — 1–3 mois vs. 12–24 mois pour les solutions enterprise
5. **Dual Control natif** — Blocage technique ACPR art.13, pas de workaround manuel
6. **Stack moderne** — TypeScript/tRPC/React, maintenance rapide, API REST native
7. **Fenêtre compétitive** — 18–24 mois avant émergence d'un concurrent local

---

## TRACTION COMMERCIALE

*(Situation Mai 2026 — en cours de constitution)*

| Indicateur | Statut |
|-----------|--------|
| Plateforme v2.5 | En production, prête à la vente |
| POC en cours | [X] en discussion / [Y] en négociation |
| Lettres d'intention | [X] signées / [Y] en cours |
| Partenariats Big4 | En discussion (KPMG/Deloitte Maroc) |
| Pipeline qualifié | [___] M MAD ARR potentiel |

---

## ÉQUIPE

**Fondateur :** [Nom], [Titre]
- Double expertise technique (full-stack, architecture SaaS) et réglementaire (conformité BAM, FATF)
- [X] ans d'expérience dans [secteur]
- Auteur de la plateforme WatchReg (100% du code)

**Advisory Board (en constitution) :**
- Ex-cadre BAM / Expert réglementaire
- Ex-CCO grande banque marocaine
- Expert FATF international
- Investisseur VC MENA

---

## UTILISATION DES FONDS

### Recherche de financement : [2–5] M MAD (Seed / Pre-Series A)

| Poste | Allocation | Objectif |
|-------|-----------|----------|
| **Commercial & Marketing** | 35% | 1 directeur commercial + campagnes sectorielles |
| **Équipe technique** | 30% | 1–2 développeurs, DevOps, sécurité |
| **Infrastructure** | 15% | Cloud souverain, certifications, SLA 99.9% |
| **Juridique & Conformité** | 10% | Structuration, IP, contrats clients |
| **Fonds de roulement** | 10% | 12 mois de runway |

### Jalons post-financement (12 mois) :

| Jalon | Délai | Indicateur |
|-------|-------|-----------|
| 3 premiers clients payants | M+3 | ARR > 900 000 MAD |
| Module Correspondent Banking livré | M+4 | FATF R.13 complet |
| Multi-tenant SaaS | M+6 | Onboarding autonome |
| 10 clients actifs | M+9 | ARR > 3 000 000 MAD |
| Expansion Tunisie (pilote) | M+10 | 1er client BCT |
| Series A readiness | M+12 | ARR > 5 000 000 MAD |

---

## POURQUOI MAINTENANT

**3 facteurs créent une fenêtre d'opportunité unique en 2026 :**

1. **Urgence réglementaire** — Le délai BAM Circulaire 5/W/2023 est expiré.
   Les établissements en retard subissent des pressions d'inspection croissantes.

2. **Budget alloué** — Les budgets conformité 2026 sont déjà votés dans la plupart
   des institutions. Les décisions d'achat peuvent être rapides (3–6 mois).

3. **Marché vierge** — Aucun acteur local dominant. WatchReg peut capturer
   le marché avant qu'un concurrent ne soit financé et opérationnel.

---

## CONTACT

**[Nom du fondateur]**
Fondateur & CEO, WatchReg
Email : [email]
Téléphone : [tel]
LinkedIn : [profil]
Démo live : disponible sur rendez-vous

---

*Document confidentiel — WatchReg — Mai 2026*
*Version 1.0 — Pour distribution aux investisseurs qualifiés uniquement*
