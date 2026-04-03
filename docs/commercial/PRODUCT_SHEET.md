# Fiche Produit — KYC-AML Platform

**Version :** 2.5
**Date :** Mars 2026

---

## La solution RegTech tout-en-un pour la conformité LAB/FT

**KYC-AML Platform** est une plateforme SaaS/on-premise de conformité réglementaire dédiée aux établissements financiers, fintech, et assureurs soumis aux obligations de Lutte Anti-Blanchiment et de Financement du Terrorisme (LAB/FT).

---

## Chiffres Clés

| Indicateur | Valeur |
|------------|--------|
| Règles AML embarquées | **11 règles** dont 3 règles MENA spécifiques |
| Listes de sanctions couvertes | **6 listes** (OFAC, UE, ONU, UK, BAM/ANRF, PPE) |
| Algorithme de matching | **Jaro-Winkler** — taux de faux négatifs < 2% |
| Langages supportés | Français, Arabe (noms translittérés) |
| Uptime garanti | **99,5%** (SLA production) |
| RTO / RPO | **4h / 1h** |
| Conformité réglementaire | AMLD5/6, FATF 40, BAM, RGPD |

---

## Modules Fonctionnels

### KYC — Know Your Customer
- Onboarding client digital avec score de risque automatique
- Vérification d'identité eKYC (provider local, Onfido, Sum Sub)
- OCR des documents d'identité (CNI, passeport, titre de séjour)
- Classification : client standard / EDD (diligences renforcées)
- **pKYC (Perpetual KYC)** : réévaluation automatique continue du risque — détection des dérives comportementales

### AML — Transaction Monitoring
Moteur de détection basé sur **11 règles déterministes** + **scoring ML** :
- Seuil unique dépassé (configurable)
- Structuring / smurfing (fractionnement)
- Haute fréquence de transactions
- Spike de volume inhabituel
- Pays à risque critique (KP, IR, CU, SY) et risque élevé (FATF liste noire/grise)
- Transactions PPE (Personnes Politiquement Exposées)
- Contrepartie en liste de sanctions
- Montants ronds
- Canal inhabituel
- Pattern Hawala (réseaux de transfert informels)
- MENA Structuring (spécifique Maghreb/Levant)

### Screening & Sanctions
- Consultation en temps réel de 6 listes de sanctions internationales
- Mise à jour automatique planifiée (configurable)
- Matching phonétique et translittération arabe/latin
- Gestion des correspondances : MATCH / REVIEW / NO_MATCH
- Contrôle de fraîcheur des listes avec alertes

### Gestion des Alertes et Cas
- File de traitement des alertes avec priorités (CRITICAL → LOW)
- Dossiers d'investigation avec timeline complète
- Workflow d'escalade et d'assignation entre analystes
- Génération de déclarations SAR (Suspicious Activity Report)

### Reporting Réglementaire
- Transmission TRACFIN (France) et GoAML (international)
- Rapports AMLD6 conformes
- Statistiques mensuelles et tableaux de bord direction
- Export PDF, CSV, XML

### Administration & Sécurité
- RBAC 5 niveaux : user, analyst, supervisor, compliance_officer, admin
- Authentification MFA TOTP obligatoire pour les comptes sensibles
- Audit trail immuable de toutes les actions
- Chiffrement des données PII (AES-256-GCM)

---

## Architecture Technique

```
┌─────────────────────────────────────────────┐
│              Interface Web React              │
│         (Dashboard | Alertes | KYC)          │
└──────────────────┬──────────────────────────┘
                   │ tRPC (TypeScript end-to-end)
┌──────────────────▼──────────────────────────┐
│           API Node.js (Express + tRPC)        │
│   AML Engine | Screening | KYC | Reports      │
└──────┬───────────────────┬──────────────────┘
       │                   │
┌──────▼──────┐   ┌────────▼──────┐
│ PostgreSQL  │   │     Redis      │
│  (données) │   │ (cache/sessions)│
└─────────────┘   └───────────────┘
       │
┌──────▼──────┐   ┌───────────────┐
│  S3 / MinIO │   │  ML Service   │
│ (documents) │   │  (Python)     │
└─────────────┘   └───────────────┘
```

**Technologies :** Node.js 20, TypeScript, React 18, PostgreSQL 15, Redis 7, Docker Compose, Drizzle ORM, tRPC, Vite, shadcn/ui.

**Déploiement :** On-premise (Docker Compose) ou Cloud (Oracle Cloud, AWS, Azure, GCP).

---

## Positionnement Concurrentiel

| Critère | KYC-AML Platform | Solutions legacy | Startups RegTech |
|---------|:---:|:---:|:---:|
| Open source / Audit du code | ✅ | ❌ | ❌ |
| Règles MENA spécifiques | ✅ | Partiel | ❌ |
| pKYC continu | ✅ | ❌ | Partiel |
| Déploiement on-premise | ✅ | ✅ | ❌ |
| Time-to-production | < 1 semaine | 3–6 mois | 1–3 mois |
| Coût annuel (PME) | Sur devis | 50–200K€ | 20–80K€ |
| Conformité BAM (Maroc) | ✅ | Partiel | ❌ |
| API tRPC typée | ✅ | ❌ | Rare |

---

## Cas d'Usage

### Banque commerciale
Surveillance de 500 000+ transactions mensuelles. Intégration CBS via webhook HMAC signé. Transmission automatique TRACFIN. Réduction de 60% du temps d'investigation par cas.

### Fintech / Néobanque
Onboarding entièrement digital avec eKYC et scoring en < 5 secondes. Conformité AMLD5 dès le lancement. Aucun compliance officer nécessaire pour les cas standard.

### Société de gestion d'actifs
Screening des contreparties avant chaque transaction. Alerte PPE immédiate. Rapports DDA (Due Diligence Avancée) automatisés pour les clients institutionnels.

### Établissement de paiement (Maroc)
Conformité BAM Circulaire 5/W/2023. Règles MENA Structuring et Hawala pattern intégrées. Transmission BAM/ANRF native.

---

## Niveaux de Service (SLA)

| Service | Disponibilité | Support |
|---------|--------------|---------|
| API (production) | 99,5% / mois | 24h/7j pour P1 |
| Mise à jour listes sanctions | < 24h après publication officielle | — |
| Correctifs sécurité critiques | < 24h | — |
| Support fonctionnel | Jours ouvrables 9h–18h | Ticket / Slack |

---

## Conformité Réglementaire Couverte

- **France :** TRACFIN, AMLD5/6 transposée, Code monétaire et financier
- **UE :** Directives AML 4/5/6, RGPD (données personnelles)
- **International :** FATF 40 Recommandations, Recommandation 16 (virements)
- **Maroc :** BAM Circulaire 5/W/2023, ANRF
- **Standards :** ISO 20022, goAML 4.0, OFAC SDN, Listes ONU/UE/UK

---

## Options et Modules Complémentaires

| Option | Description |
|--------|-------------|
| **World-Check Connect** | Intégration Refinitiv World-Check (provider payant) |
| **Formation sur site** | Pack formation 2 jours pour l'équipe compliance |
| **Audit de déploiement** | Revue de sécurité et de configuration par nos experts |
| **Reporting Custom** | Développement de rapports sur mesure (formats régulateurs locaux) |
| **SLA Premium** | RTO 1h, RPO 15min, support dédié 24h/7j |
| **Multi-tenant** | Déploiement mutualisé pour groupes avec plusieurs entités |

---

## Pour en Savoir Plus

**Documentation complète :** `docs/` (USER_GUIDE, INTEGRATION_MANUAL, API Spec)
**Démo en ligne :** Environnement de démonstration disponible sur demande
**Contact commercial :** compliance@kyc-aml.io

---

*KYC-AML Platform — Éditeur de solutions RegTech*
*© 2024-2026 — Tous droits réservés*
