# KYC-AML Platform — Couverture Fonctionnelle Complète

**Document de réponse au cahier des charges — Intégration CBS Basikon**
**Date : 22/06/2026 | Version 2.0**
**Classification : Confidentiel**

---

## Table des matières

1. [Vue d'ensemble de la plateforme](#1-vue-densemble)
2. [Architecture d'intégration CBS Basikon](#2-architecture-cbs-basikon)
3. [Matrice des rôles et permissions](#3-matrice-des-rôles)
4. [Cas d'usage par profil utilisateur](#4-cas-dusage-par-profil)
5. [Tableau de couverture fonctionnelle](#5-couverture-fonctionnelle)
6. [Comparatif avec Reis™ RCS (Vneuron)](#6-comparatif-reis-rcs)
7. [Workflows d'intégration CBS Basikon](#7-workflows-cbs)
8. [Avantages différenciants](#8-avantages-différenciants)

---

## 1. Vue d'ensemble

### 1.1 Proposition de valeur

La plateforme KYC-AML est une solution complète de conformité et de lutte contre le blanchiment de capitaux et le financement du terrorisme (LCB/FT), conçue pour les établissements financiers réglementés. Elle couvre l'intégralité du cycle de conformité :

- **Connaissance client (KYC)** — onboarding, vigilance standard et renforcée (CDD/EDD)
- **Évaluation des risques** — scoring ML hybride (XGBoost + Isolation Forest) + règles métier
- **Screening sanctions** — filtrage temps réel sur 7 listes (OFAC, UE, ONU, UK, PPE, BAM, listes internes)
- **Surveillance des transactions (AML)** — 11 règles post-facto configurables + scoring ML
- **Gestion des alertes et des cas** — workflow Maker-Checker multi-niveaux
- **Déclarations réglementaires** — SAR/STR, GoAML XML, TRACFIN, rapports BAM/ANRF
- **Intégration CBS** — connecteurs bidirectionnels temps réel (webhook + API REST)
- **Audit et traçabilité** — piste d'audit chaînée (hash SHA-256), conforme AMLD6

### 1.2 Couverture réglementaire

| Réglementation | Couverture |
|----------------|------------|
| AMLD6 (6ème Directive Anti-Blanchiment UE) | Complète |
| Recommandations GAFI (R.1 à R.40) | R.10 (CDD), R.13 (Correspondent Banking), R.16 (Travel Rule) |
| Circulaire BAM 5/W/2023 | Chiffrement PII, déclarations ANRF |
| RGPD / Loi 09-08 (Maroc) | Droit à l'effacement, explicabilité IA (Art. 22) |
| ISO 20022 | pacs.008 (virement), camt.053 (relevé) |
| IVMS 101 | Travel Rule (R.16 GAFI) |

### 1.3 Architecture technique

| Composant | Technologie |
|-----------|-------------|
| Backend API | Node.js / TypeScript / tRPC |
| Frontend | React / TypeScript / Vite |
| Base de données | PostgreSQL 16 |
| Cache / Queue | Redis |
| ML Scoring | Python / FastAPI / XGBoost / Isolation Forest |
| Biométrie | InsightFace / ArcFace (local, sans appel externe) |
| Screening | NLP fuzzy matching, phonétique, translittération |
| Authentification | JWT + MFA TOTP + refresh token rotation |

---

## 2. Architecture d'intégration CBS Basikon

```
┌──────────────────────┐                              ┌──────────────────────────────┐
│                      │                              │                              │
│    CBS Basikon       │    Webhook (temps réel)       │   Plateforme KYC-AML         │
│                      │ ────────────────────────────→ │                              │
│  ■ Clients           │                              │  ■ Moteur AML (11 règles)    │
│  ■ Comptes           │    Réponse enrichie          │  ■ Scoring ML (XGBoost)      │
│  ■ Transactions      │ ←──────────────────────────── │  ■ Screening sanctions       │
│  ■ Soldes            │    (riskScore, isSuspicious)  │  ■ Gestion alertes/cas       │
│                      │                              │  ■ Déclarations SAR/STR      │
│                      │    Queue CBS sortante         │  ■ Audit trail chaîné        │
│                      │ ←──────────────────────────── │  ■ Rapports réglementaires   │
│                      │    (KYC sync, gel, alertes)   │  ■ Network analysis          │
│                      │                              │                              │
│                      │    Consultation API           │                              │
│                      │ ←──────────────────────────── │                              │
│                      │    (clients, comptes, soldes) │                              │
│                      │                              │                              │
└──────────────────────┘                              └──────────────────────────────┘
                                                              │
                                                       ┌──────┴──────┐
                                                       │  ML Service │
                                                       │  (Python)   │
                                                       │  XGBoost    │
                                                       │  InsightFace│
                                                       └─────────────┘
```

### 2.1 Modes d'intégration supportés

| Mode | Direction | Usage | Protocole |
|------|-----------|-------|-----------|
| **Webhook Push** | CBS → Plateforme | Ingestion transactions temps réel | HTTPS + HMAC-SHA256 |
| **API Pull** | Plateforme → CBS | Consultation clients, comptes, soldes | REST + Bearer Token |
| **Queue sortante** | Plateforme → CBS | KYC sync, gel comptes, alertes AML | Queue Redis + retry |
| **Import batch** | CBS → Plateforme | Import CSV / MT940 | Fichier + API |

### 2.2 Sécurité de l'intégration

- **Signature HMAC-SHA256** sur chaque webhook entrant
- **Tolérance temporelle** ±5 minutes (anti-replay)
- **Déduplication** par transactionId (idempotence 24h via Redis)
- **Circuit breaker** : 5 échecs → ouverture → cooldown 30s → test → fermeture
- **Retry exponentiel** : 1s → 2s → 4s → 8s → 16s (max 5 tentatives)
- **Dead-letter queue** pour les jobs échoués (supervision via dashboard)

---

## 3. Matrice des rôles et permissions

### 3.1 Hiérarchie des rôles

| Niveau | Rôle | Description |
|--------|------|-------------|
| 1 | **Analyste** | Consultation, saisie, monitoring quotidien |
| 2 | **Superviseur** | Validation, escalade, configuration règles |
| 3 | **Compliance Officer** | Approbation finale, déclarations, transmission |
| 4 | **Administrateur** | Gestion système, utilisateurs, configuration |

### 3.2 Matrice détaillée des permissions

| Fonctionnalité | Analyste | Superviseur | Compliance | Admin |
|----------------|:--------:|:-----------:|:----------:|:-----:|
| **Clients** | | | | |
| Consulter fiche client | ✅ | ✅ | ✅ | ✅ |
| Créer client | ✅ | ✅ | ✅ | ✅ |
| Modifier client | ✅ | ✅ | ✅ | ✅ |
| Calculer score risque | ✅ | ✅ | ✅ | ✅ |
| Geler comptes | ❌ | ✅ | ✅ | ✅ |
| Exporter données client | ✅ | ✅ | ✅ | ✅ |
| Demande effacement RGPD | ✅ | ✅ | ✅ | ✅ |
| Traiter effacement RGPD | ❌ | ❌ | ✅ | ✅ |
| **Transactions** | | | | |
| Consulter transactions | ✅ | ✅ | ✅ | ✅ |
| Créer transaction | ✅ | ✅ | ✅ | ✅ |
| Bloquer transaction | ❌ | ✅ | ✅ | ✅ |
| Importer fichier (CSV/MT940) | ❌ | ✅ | ✅ | ✅ |
| **Alertes** | | | | |
| Consulter alertes | ✅ | ✅ | ✅ | ✅ |
| Assigner alerte | ✅ | ✅ | ✅ | ✅ |
| Résoudre alerte | ✅ | ✅ | ✅ | ✅ |
| Statistiques alertes | ✅ | ✅ | ✅ | ✅ |
| **Cas / Investigations** | | | | |
| Consulter cas | ✅ | ✅ | ✅ | ✅ |
| Créer cas | ✅ | ✅ | ✅ | ✅ |
| Assigner cas | ❌ | ✅ | ✅ | ✅ |
| Décision finale (SAR/STR) | ❌ | ❌ | ✅ | ✅ |
| Ajouter findings | ✅ | ✅ | ✅ | ✅ |
| Timeline investigation | ✅ | ✅ | ✅ | ✅ |
| **Screening** | | | | |
| Lancer screening client | ✅ | ✅ | ✅ | ✅ |
| Screening batch | ❌ | ❌ | ✅ | ✅ |
| Revoir match (CONFIRM/DISMISS) | ❌ | ❌ | ✅ | ✅ |
| Gérer listes internes | ❌ | ✅ | ✅ | ✅ |
| Forcer refresh listes | ❌ | ❌ | ❌ | ✅ |
| **Règles AML** | | | | |
| Consulter règles | ✅ | ✅ | ✅ | ✅ |
| Créer/modifier règle | ❌ | ✅ | ✅ | ✅ |
| Activer/désactiver règle | ❌ | ✅ | ✅ | ✅ |
| Backtester règle | ❌ | ✅ | ✅ | ✅ |
| Feedback faux positif | ✅ | ✅ | ✅ | ✅ |
| Explication IA (XAI) | ✅ | ✅ | ✅ | ✅ |
| **Déclarations** | | | | |
| Consulter rapports | ✅ | ✅ | ✅ | ✅ |
| Créer SAR/STR (brouillon) | ✅ | ✅ | ✅ | ✅ |
| Soumettre pour revue | ✅ | ✅ | ✅ | ✅ |
| Rejeter rapport | ❌ | ✅ | ✅ | ✅ |
| Approuver rapport | ❌ | ❌ | ✅ | ✅ |
| Transmettre GoAML/TRACFIN | ❌ | ❌ | ✅ | ✅ |
| Suivi ANRF | ❌ | ❌ | ✅ | ✅ |
| Export PDF SAR/STR | ❌ | ❌ | ✅ | ✅ |
| Statistiques AMLD6 | ❌ | ❌ | ✅ | ✅ |
| **Approbations (Dual Control)** | | | | |
| Consulter approbations | ❌ | ✅ | ✅ | ✅ |
| Revoir/approuver étape | ❌ | ✅ | ✅ | ✅ |
| Escalader approbation | ❌ | ✅ | ✅ | ✅ |
| Créer chaîne multi-niveaux | ❌ | ❌ | ❌ | ✅ |
| Déléguer pouvoir approbation | ❌ | ✅ | ✅ | ✅ |
| **Documents** | | | | |
| Consulter documents | ✅ | ✅ | ✅ | ✅ |
| Vérifier document | ❌ | ✅ | ✅ | ✅ |
| Rejeter document | ❌ | ✅ | ✅ | ✅ |
| Supprimer document | ❌ | ❌ | ✅ | ✅ |
| **Administration** | | | | |
| Gérer utilisateurs | ❌ | ❌ | ❌ | ✅ |
| Reset MFA utilisateur | ❌ | ❌ | ❌ | ✅ (+ MFA) |
| Logs d'audit | ❌ | ✅ | ✅ | ✅ |
| Configuration système | ❌ | ❌ | ❌ | ✅ |
| Licence | ❌ | ❌ | ❌ | ✅ |
| Réentraîner modèle ML | ❌ | ❌ | ❌ | ✅ |
| Connecteurs CBS | ❌ | ✅ | ✅ | ✅ |
| **Notifications** | | | | |
| Recevoir notifications | ✅ | ✅ | ✅ | ✅ |
| Marquer lues | ✅ | ✅ | ✅ | ✅ |
| Cleanup ancien | ❌ | ❌ | ❌ | ✅ |

---

## 4. Cas d'usage par profil utilisateur

### 4.1 Analyste — 42 cas d'usage

#### Consultation et monitoring quotidien
| # | Cas d'usage | Description |
|---|-------------|-------------|
| A1 | Consulter le dashboard | Vue d'ensemble : KPI, alertes, cas, transactions, tendances |
| A2 | Voir l'activité récente | Flux d'activité des dernières 24h |
| A3 | Consulter la distribution des risques | Répartition par niveau de risque, statut KYC, top 10 clients |
| A4 | Voir les tendances | Évolution alertes, transactions, suspects sur N jours |
| A5 | Recevoir et lire les notifications | Alertes assignées, cas escaladés, SLA breach |

#### Gestion des clients
| # | Cas d'usage | Description |
|---|-------------|-------------|
| A6 | Rechercher un client | Filtres par nom, risque, statut KYC, pays, type |
| A7 | Créer un nouveau client | Saisie des données démographiques complètes |
| A8 | Consulter la fiche client 360° | Profil, comptes, transactions, alertes, screening, UBO |
| A9 | Modifier les données client | Mise à jour coordonnées, informations KYC |
| A10 | Calculer le score de risque | Scoring ML automatique avec explication |
| A11 | Ajouter un bénéficiaire effectif (UBO) | Saisie UBO avec pourcentage de détention |
| A12 | Consulter les documents client | Liste des pièces justificatives |
| A13 | Demander l'effacement RGPD | Initier une demande de droit à l'oubli |

#### Screening sanctions
| # | Cas d'usage | Description |
|---|-------------|-------------|
| A14 | Lancer un screening client | Filtrage temps réel contre 7 listes de sanctions |
| A15 | Consulter les résultats screening | Score de similarité, méthode de matching, détails du hit |
| A16 | Vérifier la santé des listes | Fraîcheur et disponibilité de chaque liste |

#### Transactions
| # | Cas d'usage | Description |
|---|-------------|-------------|
| A17 | Consulter les transactions | Liste paginée avec filtres (montant, date, type, statut) |
| A18 | Voir le détail d'une transaction | Données complètes, score risque, règles déclenchées |
| A19 | Saisir une transaction manuelle | Enregistrement avec déclenchement automatique AML |
| A20 | Voir les alertes par client | Alertes AML liées aux transactions d'un client |
| A21 | Exporter les données transactions | Export CSV pour analyse externe |

#### Alertes AML
| # | Cas d'usage | Description |
|---|-------------|-------------|
| A22 | Consulter les alertes | Liste avec filtres (statut, priorité, type, date) |
| A23 | Voir le détail d'une alerte | Transactions liées, règle déclenchée, score, contexte |
| A24 | S'assigner une alerte | Prise en charge pour investigation |
| A25 | Résoudre une alerte | Fermer, marquer faux positif, ou escalader |
| A26 | Statistiques alertes | Répartition par statut, priorité, tendances |

#### Cas / Investigations
| # | Cas d'usage | Description |
|---|-------------|-------------|
| A27 | Consulter les cas | Liste avec filtres (statut, sévérité, client) |
| A28 | Créer un cas d'investigation | Ouvrir un dossier avec alertes liées |
| A29 | Mettre à jour le statut du cas | Progression de l'investigation |
| A30 | Ajouter des findings | Résultats d'enquête, pièces justificatives |
| A31 | Consulter la timeline | Historique chronologique de toutes les actions |
| A32 | Statistiques cas | KPI investigations (durée, volume, résolution) |

#### Règles AML
| # | Cas d'usage | Description |
|---|-------------|-------------|
| A33 | Consulter les règles AML | 11 règles par défaut + règles personnalisées |
| A34 | Voir les statistiques par règle | Déclenchements, faux positifs, performance |
| A35 | Signaler un faux positif | Feedback pour amélioration continue (auto-demotion si >20%) |
| A36 | Demander l'explication ML | XAI — explicabilité du scoring IA (RGPD Art. 22) |

#### Rapports
| # | Cas d'usage | Description |
|---|-------------|-------------|
| A37 | Consulter les rapports SAR/STR | Liste avec filtres |
| A38 | Créer un brouillon SAR | Pré-remplissage automatique depuis le cas |
| A39 | Créer un brouillon STR | Déclaration de transaction suspecte |
| A40 | Soumettre pour revue | Envoyer le brouillon au superviseur |

#### Autres
| # | Cas d'usage | Description |
|---|-------------|-------------|
| A41 | Analyse réseau transactionnel | Graphe des liens entre clients et transactions |
| A42 | Consulter le SLA monitoring | État des SLA (alertes, cas, screening) |

---

### 4.2 Superviseur — 27 cas d'usage additionnels (+ tous les cas analyste)

#### Validation et contrôle
| # | Cas d'usage | Description |
|---|-------------|-------------|
| S1 | Geler les comptes d'un client | Gel conservatoire en cas de soupçon |
| S2 | Dégeler les comptes d'un client | Levée du gel après investigation |
| S3 | Bloquer une transaction | Suspension manuelle d'une transaction suspecte |
| S4 | Assigner un cas à un analyste | Répartition de la charge de travail |
| S5 | Importer des transactions fichier | Import CSV ou MT940 avec mode dry-run |
| S6 | KPI compliance | Alertes critiques ouvertes, cas en attente, retards |

#### Screening avancé
| # | Cas d'usage | Description |
|---|-------------|-------------|
| S7 | Gérer les listes internes | Ajouter/supprimer des entrées à la liste personnalisée |
| S8 | Consulter les matches en attente | File des résultats screening à revoir |

#### Configuration AML
| # | Cas d'usage | Description |
|---|-------------|-------------|
| S9 | Créer une règle AML personnalisée | Définir conditions, seuils, score, priorité |
| S10 | Modifier une règle existante | Ajuster les paramètres d'une règle |
| S11 | Activer/désactiver une règle | Passage en mode test ou production |
| S12 | Backtester une règle | Simulation sur données historiques |
| S13 | Gérer les juridictions | Définir les seuils SAR/STR par pays |

#### Documents
| # | Cas d'usage | Description |
|---|-------------|-------------|
| S14 | Vérifier un document | Validation de pièce justificative |
| S15 | Rejeter un document | Demande de document conforme |

#### Approbations
| # | Cas d'usage | Description |
|---|-------------|-------------|
| S16 | Revoir une demande d'approbation | Valider ou rejeter une étape du dual control |
| S17 | Escalader une approbation | Transférer au senior management |
| S18 | Déléguer son pouvoir d'approbation | Délégation temporaire (congé, absence) |
| S19 | Révoquer une délégation | Annuler une délégation en cours |

#### Logs et supervision
| # | Cas d'usage | Description |
|---|-------------|-------------|
| S20 | Consulter les logs d'audit | Recherche dans la piste d'audit (action, entité, date, user) |
| S21 | Exporter les logs d'audit | Export pour contrôle externe |
| S22 | Statistiques audit | Volume par type d'action, par entité, 24h/7j |

#### Rejeter un rapport
| # | Cas d'usage | Description |
|---|-------------|-------------|
| S23 | Rejeter un rapport SAR/STR | Retour au brouillon avec commentaire |

#### Connecteurs CBS
| # | Cas d'usage | Description |
|---|-------------|-------------|
| S24 | Dashboard connecteurs | Vue santé CBS, circuit breaker, queue |
| S25 | Vérifier la santé CBS | Ping + latence du CBS Basikon |
| S26 | Voir les jobs échoués | Dead-letter queue CBS |
| S27 | Relancer un job échoué | Retry manuel sur un job spécifique |

---

### 4.3 Compliance Officer — 22 cas d'usage additionnels (+ tous les cas superviseur)

#### Décisions finales
| # | Cas d'usage | Description |
|---|-------------|-------------|
| C1 | Décision finale sur cas | Clôture ou soumission SAR/STR (principe des 4 yeux) |
| C2 | Approuver un rapport SAR/STR | Validation finale avant transmission |
| C3 | Transmettre à TRACFIN/GoAML | Génération XML + envoi automatique |
| C4 | Télécharger le XML GoAML | Export sans transmission |
| C5 | Suivi ANRF | Mise à jour statut : DEPOSEE → ACCUSEE → CLASSEE → SUIVI |
| C6 | Exporter SAR/STR en PDF | Document formalisé pour archive |
| C7 | Exporter fiche KYC en PDF | Dossier KYC complet pour contrôle |
| C8 | Statistiques AMLD6 | KPI réglementaires (délais, volumes, taux) |
| C9 | Export CSV AMLD6 | Données pour reporting réglementaire |
| C10 | Export PDF AMLD6 | Rapport AMLD6 formaté |

#### Screening
| # | Cas d'usage | Description |
|---|-------------|-------------|
| C11 | Revoir un match screening | Décision : CONFIRMED / DISMISSED / ESCALATED |
| C12 | Lancer un screening batch | Screening de masse sur tout le portefeuille |
| C13 | Vérifier le statut du batch | Suivi de la progression |

#### Approbations
| # | Cas d'usage | Description |
|---|-------------|-------------|
| C14 | Demander une approbation dual-control | SAR_TRANSMIT, CASE_DECIDE, CUSTOMER_BLOCK |
| C15 | Consulter la chaîne d'approbation | Voir les niveaux et statuts par étape |

#### Wallets (si activé)
| # | Cas d'usage | Description |
|---|-------------|-------------|
| C16 | Geler un portefeuille (réglementaire) | Gel avec motif obligatoire |
| C17 | Dégeler un portefeuille | Levée du gel réglementaire |
| C18 | Recalculer tous les risques wallets | Scoring de masse |
| C19 | Réconciliation CBS | Vérification soldes plateforme vs CBS |

#### Correspondent Banking (si activé)
| # | Cas d'usage | Description |
|---|-------------|-------------|
| C20 | Soumettre une évaluation FATF R.13 | 4 critères × 25 points |

#### Rapports BAM (si activé)
| # | Cas d'usage | Description |
|---|-------------|-------------|
| C21 | Générer rapport mensuel BAM | Rapport réglementaire pour Bank Al-Maghrib |
| C22 | Exporter rapport BAM en CSV | Export données BAM |

---

### 4.4 Administrateur — 28 cas d'usage additionnels (+ tous les cas compliance)

#### Gestion des utilisateurs
| # | Cas d'usage | Description |
|---|-------------|-------------|
| AD1 | Lister les utilisateurs | Annuaire avec filtres (rôle, statut, département) |
| AD2 | Créer un utilisateur | Création avec assignation de rôle (requiert MFA step-up) |
| AD3 | Modifier un utilisateur | Changement rôle, département, statut |
| AD4 | Désactiver un utilisateur | Suspension d'accès |
| AD5 | Reset mot de passe | Réinitialisation forcée (requiert MFA step-up) |
| AD6 | Reset MFA | Réinitialisation du TOTP d'un utilisateur (MFA step-up) |

#### Configuration système
| # | Cas d'usage | Description |
|---|-------------|-------------|
| AD7 | Consulter la configuration | Tous les paramètres par catégorie |
| AD8 | Modifier un paramètre | Mise à jour avec audit trail |
| AD9 | Initialiser la configuration par défaut | Seed des valeurs initiales |

#### Règles AML avancées
| # | Cas d'usage | Description |
|---|-------------|-------------|
| AD10 | Supprimer une règle AML | Suppression définitive |
| AD11 | Initialiser les règles par défaut | Seed des 11 règles standard |

#### Screening avancé
| # | Cas d'usage | Description |
|---|-------------|-------------|
| AD12 | Forcer le refresh des listes sanctions | Mise à jour immédiate de toutes les listes |

#### ML et Intelligence Artificielle
| # | Cas d'usage | Description |
|---|-------------|-------------|
| AD13 | Consulter le statut du modèle ML | Version, date entraînement, métriques |
| AD14 | Déclencher un réentraînement ML | Entraînement sur l'historique des transactions |

#### Licence
| # | Cas d'usage | Description |
|---|-------------|-------------|
| AD15 | Voir le statut de la licence | Type, modules, expiration, sièges |
| AD16 | Activer une licence | Saisie de la clé de licence |
| AD17 | Historique des licences | Journal d'activation |
| AD18 | Vérifier les sièges | Utilisation vs limite |

#### Approbations avancées
| # | Cas d'usage | Description |
|---|-------------|-------------|
| AD19 | Créer une chaîne d'approbation | Multi-niveaux avec rôles par étape |
| AD20 | Désactiver une chaîne | Suppression logique |
| AD21 | Auto-escalade des approbations | Escalade automatique des demandes expirées |

#### Connecteurs CBS avancés
| # | Cas d'usage | Description |
|---|-------------|-------------|
| AD22 | Relancer tous les jobs échoués | Retry en masse de la dead-letter queue |
| AD23 | Purger la dead-letter queue | Nettoyage des jobs abandonnés |
| AD24 | Réinitialiser le circuit breaker | Forçage de l'état du circuit breaker |
| AD25 | Envoyer un job test CBS | Test de connectivité CBS via job |

#### pKYC et maintenance
| # | Cas d'usage | Description |
|---|-------------|-------------|
| AD26 | Forcer un cycle pKYC complet | Exécution du scoring drift sur tout le portefeuille |
| AD27 | Statut du scheduler pKYC | Vérification du planificateur |

#### Notifications
| # | Cas d'usage | Description |
|---|-------------|-------------|
| AD28 | Cleanup notifications anciennes | Purge des notifications obsolètes |

---

### Résumé des cas d'usage par profil

| Profil | Cas propres | Total cumulé |
|--------|:-----------:|:------------:|
| **Analyste** | 42 | **42** |
| **Superviseur** | 27 | **69** |
| **Compliance Officer** | 22 | **91** |
| **Administrateur** | 28 | **119** |
| **Total unique** | — | **119 cas d'usage** |

---

## 5. Couverture fonctionnelle — Tableau détaillé

### 5.1 Filtrage et gestion des listes (Screening)

| # | Fonctionnalité | Détails |
|---|----------------|---------|
| 1 | Intégration native des listes sanctions | OFAC (SDN), UE, ONU, UK (HMT), PPE (OpenSanctions), BAM/ANRF — data-feed avec stockage local, mise à jour automatique configurable (cron) |
| 2 | Listes internes personnalisables | Ajout/suppression d'entrées manuelles, recherche incluse dans tous les screenings |
| 3 | Mise à jour automatique des listes | Cron configurable (défaut : 02:00 UTC quotidien), mises à jour complètes, alerte si liste stale (>36h) |
| 4 | Fuzzy matching / NLP | Correspondance floue, phonétique, score de similarité 0-100, seuils configurables (match ≥75, review ≥40) |
| 5 | Filtrage temps réel (single) | API screening par client — résultat instantané avec score et détails du hit |
| 6 | Filtrage batch (portefeuille) | Screening de masse asynchrone avec suivi de progression |
| 7 | Filtrage ad-hoc | Recherche rapide d'un nom contre les listes sélectionnées |
| 8 | Historique de filtrage | Audit trail complet de chaque opération de screening |
| 9 | Gestion des pays à haut risque | Liste GAFI configurable, impact direct sur le scoring risque et les règles AML |
| 10 | Santé des listes | Monitoring de fraîcheur, alerte automatique si source indisponible |

### 5.2 Traitement d'alertes et Case Management

| # | Fonctionnalité | Détails |
|---|----------------|---------|
| 11 | Files d'alertes Maker-Checker | Distribution par priorité et type, accès basé sur les rôles, mécanisme d'escalade |
| 12 | Case Management multi-niveaux | Workflow d'investigation avec 4 niveaux (analyste → superviseur → compliance → admin), timeline, findings, commentaires |
| 13 | Priorisation des alertes | Scoring automatique (LOW/MEDIUM/HIGH/CRITICAL), tri par score et ancienneté |
| 14 | Escalade automatique (SLA) | Monitoring SLA avec auto-escalade si délai dépassé |
| 15 | Notifications temps réel | In-app : alerte assignée, cas escaladé, SLA breach, screening match, approbation |
| 16 | Dual Control / 4 yeux | Approbation multi-niveaux obligatoire pour SAR/STR, gel comptes, décision cas |
| 17 | Délégation d'approbation | Pouvoir délégué temporairement (congés, absence), avec date d'expiration |

### 5.3 Connaissance client (KYC) et évaluation du risque

| # | Fonctionnalité | Détails |
|---|----------------|---------|
| 18 | Fiche client complète | Données démographiques, adresse, contact, type (PP/PM), notes, pièces |
| 19 | Scoring de risque hybride | ML (XGBoost + Isolation Forest) + règles métier, score 0-100 avec explicabilité (XAI) |
| 20 | Bénéficiaires effectifs (UBO) | Gestion des UBO avec pourcentage de détention et lien vers le client |
| 21 | KYC tiering (si wallets) | 3 tiers : ALLEGED (simplifié), STANDARD, RENFORCE (EDD), avec plafonds par tier |
| 22 | Onboarding renforcé (EDD) | Checklist configurable, entretien, workflow de validation superviseur |
| 23 | pKYC — Revue perpétuelle | Scoring drift nightly, alerte automatique si seuil dépassé, file de revue |
| 24 | Intégration CBS bidirectionnelle | Sync KYC vers Basikon, consultation client depuis Basikon |
| 25 | Vue 360° client | Profil, comptes, transactions, alertes, screening, UBO, documents — vue unifiée |

### 5.4 Surveillance des transactions (AML)

| # | Fonctionnalité | Détails |
|---|----------------|---------|
| 26 | 11 règles AML par défaut | Seuil réglementaire, seuil critique, pays GAFI, PEP, fréquence, volume spike, round amounts, canal inhabituel, structuration, PEP+montant, wallet AML |
| 27 | Moteur de règles configurable | Création de règles personnalisées avec conditions dynamiques (montant, type, canal, pays, score client) |
| 28 | Backtesting / Simulation | Test des règles sur données historiques avant mise en production |
| 29 | Feedback faux positifs | Signalement par les analystes, auto-demotion si taux >20% |
| 30 | Scoring ML temps réel | XGBoost supervisé + Isolation Forest non-supervisé, scoring 0-100 par transaction |
| 31 | Explicabilité IA (XAI) | Explication en langage naturel du score ML — conformité RGPD Art. 22 |
| 32 | Analyse réseau | Graphe des transactions inter-clients, détection de clusters suspects |
| 33 | Import fichiers transactions | CSV et MT940 avec mode dry-run (prévisualisation sans import) |
| 34 | Connecteurs mobile money | Orange Money, Wave, CIH Mobile — webhooks HMAC-signés, idempotence Redis |

### 5.5 Déclarations réglementaires

| # | Fonctionnalité | Détails |
|---|----------------|---------|
| 35 | SAR / STR | Création brouillon → revue → approbation → transmission, pré-remplissage automatique |
| 36 | GoAML XML | Génération conforme au schéma GoAML pour TRACFIN et BAM |
| 37 | Transmission TRACFIN | Envoi automatique avec accusé de réception |
| 38 | Suivi ANRF | États : DEPOSEE → ACCUSEE → CLASSEE → SUIVI, historique complet |
| 39 | Rapports BAM mensuels | Génération automatique pour Bank Al-Maghrib |
| 40 | Statistiques AMLD6 | KPI réglementaires : délais, volumes, taux de conversion |
| 41 | Export multi-format | PDF, CSV, XML — SAR/STR, KYC, AMLD6, BAM, transactions |

### 5.6 Standards internationaux

| # | Fonctionnalité | Détails |
|---|----------------|---------|
| 42 | ISO 20022 — pacs.008 | Génération de virements FI-to-FI au format pacs.008 |
| 43 | ISO 20022 — camt.053 | Génération de relevés de compte au format camt.053 |
| 44 | IVMS 101 — Travel Rule | Génération et envoi de messages Travel Rule (GAFI R.16) |
| 45 | Correspondent Banking FATF R.13 | Évaluation des banques correspondantes (4 critères × 25 pts) |

### 5.7 Administration et sécurité

| # | Fonctionnalité | Détails |
|---|----------------|---------|
| 46 | RBAC 4 niveaux | Analyste, Superviseur, Compliance Officer, Admin — permissions granulaires |
| 47 | MFA TOTP | Authentification à deux facteurs avec QR code, codes de secours, step-up pour opérations sensibles |
| 48 | Piste d'audit chaînée | Hash SHA-256 enchaîné (blockchain-like), anti-falsification |
| 49 | Chiffrement PII | AES-256 des données personnelles (conforme BAM 5/W/2023) |
| 50 | Rate limiting | 10 tentatives login / 15 min, 100 requêtes API / 60s |
| 51 | Gestion de sessions | JWT access (15 min) + refresh (7 jours), déconnexion auto |
| 52 | Configuration dynamique | Paramétrage système par catégorie sans redémarrage |
| 53 | Licensing modulaire | Clé signée HMAC, activation par modules, limite de sièges |
| 54 | Multi-langue | Français et anglais, commutation instantanée |

### 5.8 Intégration et connecteurs

| # | Fonctionnalité | Détails |
|---|----------------|---------|
| 55 | SDK TypeScript CBS | Client typé pour intégration CBS (get, push, block, alert) |
| 56 | Webhook entrant transactions | HMAC-SHA256, idempotence 24h, tolérance ±5 min |
| 57 | Webhooks mobile money | Orange Money, Wave, CIH Mobile — normalisation automatique |
| 58 | Queue CBS sortante | Redis, retry exponentiel (5×), dead-letter, monitoring |
| 59 | Circuit breaker | 5 échecs → OPEN → 30s cooldown → HALF_OPEN → 2 succès → CLOSED |
| 60 | Dashboard connecteurs | Santé CBS, état circuit breaker, stats queue, jobs échoués |

---

## 6. Comparatif avec Reis™ RCS (Vneuron)

### 6.1 Tableau comparatif fonctionnel

| # | Fonctionnalité | Reis™ RCS | Notre plateforme | Avantage |
|---|----------------|:---------:|:----------------:|:--------:|
| | **FILTRAGE & LISTES** | | | |
| 1 | Listes sanctions natives (OFAC, UE, ONU, UK) | ✅ | ✅ + BAM/ANRF + PPE | **Nous** — BAM natif |
| 2 | Connecteurs data providers privés | ✅ (prêts à l'emploi) | Via API/webhook | Reis |
| 3 | Mise à jour auto des listes | ✅ | ✅ + alerte si stale >36h | **Nous** — monitoring santé |
| 4 | Listes internes | ✅ | ✅ | = |
| 5 | Fuzzy matching / translittération / phonétique | ✅ (NLP + IA) | ✅ (NLP + score) | = |
| 6 | Réduction faux positifs | ✅ (seuils configurables) | ✅ + auto-demotion règles >20% FP | **Nous** — feedback loop |
| 7 | Filtrage temps réel API | ✅ | ✅ | = |
| 8 | Filtrage batch portefeuille | ✅ | ✅ (async avec suivi) | = |
| 9 | Filtrage ad-hoc | ✅ | ✅ | = |
| 10 | Import en masse | ✅ | ✅ (CSV/MT940 + dry-run) | **Nous** — dry-run |
| 11 | Configuration multi-listes / seuils | ✅ | ✅ | = |
| 12 | Filtrage navires | ✅ | ❌ | Reis |
| 13 | Historique filtrage | ✅ | ✅ (audit trail chaîné SHA-256) | **Nous** — anti-falsification |
| 14 | Liste d'exclusion (Good Guys) | ✅ (avec expiration) | ❌ | Reis |
| 15 | Pays à risque élevé | ✅ | ✅ (GAFI + configurable par juridiction) | **Nous** — par juridiction |
| | **ALERTES & CASE MANAGEMENT** | | | |
| 16 | Files Maker-Checker | ✅ | ✅ (multi-niveaux configurable) | = |
| 17 | Case Management multi-niveaux | ✅ (≥4 niveaux) | ✅ (4 niveaux + chaînes configurables) | = |
| 18 | Priorisation alertes | ✅ | ✅ + scoring ML | **Nous** — ML |
| 19 | Règles d'automatisation | ✅ | ✅ + auto-demotion + SLA auto-escalade | **Nous** |
| 20 | Notifications email | ✅ | ✅ (in-app + configurable) | = |
| | **KYC & ÉVALUATION DU RISQUE** | | | |
| 21 | Formulaires KYC personnalisés | ✅ (No-Code IA) | Formulaire structuré (code) | Reis — No-Code |
| 22 | Scoring risque multi-facteurs | ✅ (≥6 facteurs, multi-matrices) | ✅ (ML hybride XGBoost + IF + règles) | **Nous** — ML hybride |
| 23 | Parties liées / contamination risque | ✅ | ✅ (UBO + analyse réseau) | = |
| 24 | Workflow entrée en relation (EER) | ✅ | ✅ (EDD + dual control) | = |
| 25 | Forçage niveau de risque | ✅ (manuel + auto) | ✅ (via règles + approbation) | = |
| 26 | Revue périodique KYC | ✅ | ✅ (pKYC nightly automatique + drift scoring) | **Nous** — pKYC ML |
| 27 | Statistiques KYC | ✅ | ✅ (dashboard + tendances) | = |
| 28 | Référentiel client | ✅ | ✅ (vue 360° complète) | = |
| 29 | Intégration CBS | ✅ (sync + async) | ✅ (webhook + API + queue + circuit breaker) | **Nous** — résilience |
| | **FILTRAGE TRANSACTIONS (PRÉ-FACTO)** | | | |
| 30 | Filtrage pré-facto temps réel | ✅ (HOLD/CLEAN/BLOCKED) | ✅ (via webhook — score + blocage) | = |
| 31 | Multi-canaux | ✅ (SWIFT, cartes, mobile) | ✅ (ONLINE, MOBILE, BRANCH, ATM, API, mobile money) | = |
| 32 | Intégration CBS | ✅ (3 modes) | ✅ (webhook + API REST + batch) | = |
| 33 | Upload batch transactions | ✅ | ✅ (CSV/MT940 + dry-run) | **Nous** — dry-run |
| 34 | Filtrage manuel à la demande | ✅ | ✅ | = |
| 35 | Moteur de règles transactionnelles | ✅ (conditions combinées) | ✅ (11 règles + conditions dynamiques + backtesting) | **Nous** — backtesting |
| 36 | Search Rules (sur résultats filtrage) | ✅ | ✅ (via conditions de règles) | = |
| 37 | Alertes TFS + gestion dossiers | ✅ | ✅ | = |
| 38 | Escalade automatisée | ✅ | ✅ (SLA monitoring + auto-escalade) | = |
| 39 | Case Management transactions | ✅ | ✅ (workflow complet + timeline) | = |
| 40 | Décision finale transaction | ✅ | ✅ (CLOSED / FALSE_POSITIVE / ESCALATED) | = |
| | **SURVEILLANCE TRANSACTIONS (POST-FACTO)** | | | |
| 41 | Segmentation clients | ✅ (IA configurable) | ✅ (risque, KYC, type, pays) | = |
| 42 | Scénarios LCB/FT configurables | ✅ (seuils, agrégation) | ✅ (11 scénarios + création libre) | = |
| 43 | Analyses périodiques | ✅ | ✅ (pKYC nightly + screening batch) | = |
| 44 | Génération alertes | ✅ | ✅ (auto + Maker-Checker) | = |
| 45 | Priorisation ML | ✅ (ML) | ✅ (XGBoost + Isolation Forest) | = |
| 46 | Modèle pertinence ML | ✅ (boucle retour analystes) | ✅ (feedback + auto-demotion >20% FP) | **Nous** — auto-demotion |
| 47 | Règles de silence (Silencing) | ✅ | ❌ | Reis |
| 48 | Investigation multi-niveaux | ✅ (≥4 niveaux) | ✅ (4 niveaux + dual control + délégation) | **Nous** — délégation |
| 49 | Suivi alertes + notifications | ✅ (watchers, mentions) | ✅ (notifications in-app, assignation) | = |
| 50 | Vue 360° client | ✅ | ✅ | = |
| | **DÉCLARATION DE SOUPÇON** | | | |
| 51 | SAR/STR avec workflow | ✅ (Déclarant + Validateur) | ✅ (4 étapes + dual control + GoAML XML) | **Nous** — GoAML natif |
| | **COMPLÉMENTAIRES AML** | | | |
| 52 | Ajout manuel suspect | ✅ | ✅ (création cas manuelle) | = |
| 53 | Rétropropagation risque | ✅ | ✅ (recalcul automatique) | = |
| 54 | Données statistiques / analytiques | ✅ | ✅ (dashboard + AMLD6 + tendances) | = |
| 55 | Liste exclusion AML (Good Guys) | ✅ | ❌ | Reis |
| 56 | Référentiels AML | ✅ | ✅ (clients, transactions, alertes, comptes) | = |
| 57 | Simulation / backtesting | ✅ | ✅ (backtest par règle avec dry-run) | = |
| | **TBML (Blanchiment par commerce)** | | | |
| 58-64 | Module TBML complet | ✅ (7 fonctionnalités) | ❌ | Reis |
| | **STUDIO NO-CODE (IA)** | | | |
| 65-71 | Configuration No-Code IA | ✅ (7 fonctionnalités) | Configuration par interface admin (pas No-Code) | Reis — UX No-Code |
| | **INTERMODULES** | | | |
| 72 | Piste d'audit | ✅ | ✅ (hash chain SHA-256 — anti-falsification) | **Nous** — intégrité crypto |
| 73 | Workflow collaboratif | ✅ (CMMN + BPMN 2.0) | ✅ (multi-niveaux + dual control + délégation) | Reis — BPMN standard |
| 74 | Unités organisationnelles | ✅ | ✅ (départements par utilisateur) | Reis — plus granulaire |
| 75 | Administration RBAC | ✅ (utilisateurs illimités, LDAP, MFA) | ✅ (RBAC 4 niveaux, MFA TOTP, MFA step-up) | = |
| 76 | Reporting & Dashboards | ✅ (rapports manuels/auto, widgets) | ✅ (dashboard, AMLD6, BAM, PDF/CSV export) | = |
| 77 | Répertoires (Repository) | ✅ | ✅ (clients, transactions, alertes, cas, rapports) | = |
| 78 | Gestion documents (DMC) | ✅ (multi-formats) | ✅ (local + S3/MinIO, multi-formats) | **Nous** — S3 natif |
| 79 | Multi-langue | ✅ (FR, EN + autres) | ✅ (FR, EN) | Reis — plus de langues |
| 80 | Operations Hub | ✅ | ✅ (dashboard + SLA monitoring + health checks) | = |
| 81 | Multi-tenant | ✅ | ✅ (multi-institution via feature flags) | Reis — plus mature |
| 82 | Scalabilité | ✅ | ✅ (stateless, Redis cache, queue async) | = |

### 6.2 Fonctionnalités EXCLUSIVES de notre plateforme (absentes chez Reis™)

| # | Fonctionnalité | Valeur ajoutée |
|---|----------------|----------------|
| 1 | **Scoring ML hybride (XGBoost + Isolation Forest)** | Détection supervisée ET non-supervisée — identifie des patterns inconnus |
| 2 | **Explicabilité IA (XAI)** | Explication en langage naturel de chaque score ML — conformité RGPD Art. 22 |
| 3 | **pKYC (Perpetual KYC)** | Scoring drift nightly automatique — revue continue vs revue périodique statique |
| 4 | **Auto-demotion des règles AML** | Si >20% faux positifs → demotion automatique — réduction opérationnelle mesurable |
| 5 | **Backtesting / dry-run** | Simulation avant mise en production — zéro risque de faux positifs en prod |
| 6 | **Piste d'audit chaînée SHA-256** | Hash chain type blockchain — preuve d'intégrité pour les régulateurs |
| 7 | **Circuit breaker CBS** | Résilience automatique si le CBS est en panne — aucune transaction perdue |
| 8 | **Connecteurs mobile money natifs** | Orange Money, Wave, CIH Mobile — prêts à l'emploi pour le marché africain |
| 9 | **ISO 20022 natif** | pacs.008 + camt.053 — interopérabilité avec les systèmes de paiement modernes |
| 10 | **IVMS 101 Travel Rule** | Conformité GAFI R.16 — obligatoire pour les transferts crypto et internationaux |
| 11 | **Comparaison faciale locale (InsightFace)** | eKYC biométrique sans appel externe — souveraineté des données |
| 12 | **MFA step-up pour opérations sensibles** | Double vérification pour création utilisateur, reset MFA, gel comptes |
| 13 | **Délégation d'approbation** | Continuité métier pendant les congés — traçabilité complète |
| 14 | **Chiffrement PII AES-256** | Conformité BAM Circulaire 5/W/2023 — données personnelles chiffrées en base |
| 15 | **Correspondent Banking FATF R.13** | Évaluation des banques correspondantes intégrée nativement |
| 16 | **Wallets + KYC Tiering** | 3 tiers avec plafonds — adapté aux microfinances et établissements de paiement |
| 17 | **Réseau d'agents** | Gestion float, scoring risque, suspension — adapté au mobile money |
| 18 | **Analyse réseau transactionnel** | Graphe des liens inter-clients — détection de réseaux criminels |

### 6.3 Fonctionnalités Reis™ absentes de notre plateforme

| # | Fonctionnalité Reis™ | Impact | Mitigation |
|---|----------------------|--------|------------|
| 1 | **Module TBML** (Trade-Based Money Laundering) | Pertinent pour les banques avec activité Trade Finance | Développement futur si besoin client |
| 2 | **Studio No-Code IA** | UX de configuration plus accessible | Configuration par interface admin + API |
| 3 | **Filtrage navires** (IMO) | Spécifique au Trade Finance maritime | Non prioritaire sauf activité maritime |
| 4 | **Règles de silence (Silencing)** | Réduction charge de travail sur alertes récurrentes | Auto-demotion des règles couvre partiellement ce besoin |
| 5 | **Liste exclusion AML (Good Guys)** | Exclusion temporaire de clients du monitoring | Développement rapide si requis |
| 6 | **BPMN 2.0 / CMMN** | Standard de workflow industriel | Workflow custom équivalent fonctionnellement |
| 7 | **Import LDAP** | Intégration annuaire entreprise | Création manuelle ou API |
| 8 | **Connecteurs data providers privés** | World-Check, Dow Jones, etc. | Intégrable via API/webhook |

---

## 7. Workflows d'intégration CBS Basikon

### 7.1 FLUX 1 — Ingestion transactions (CBS → Plateforme)

```
CBS Basikon                                      Plateforme KYC-AML
    │                                                │
    │  POST /webhooks/transaction                     │
    │  + Header: X-Webhook-Signature (HMAC-SHA256)   │
    │  + Body JSON: {                                 │
    │      transactionId, customerId,                 │
    │      amount, currency, type,                    │
    │      channel, counterparty,                     │
    │      counterpartyCountry, timestamp             │
    │    }                                            │
    │ ─────────────────────────────────────────────→  │
    │                                                │
    │                           1. Vérification HMAC  │
    │                           2. Vérification ±5min │
    │                           3. Déduplication 24h  │
    │                           4. Insertion DB       │
    │                           5. Moteur AML (11 règles)
    │                           6. Scoring ML         │
    │                           7. Création alerte si suspect
    │                                                │
    │  ←─────────────────────────────────────────────│
    │  {                                             │
    │    success: true,                              │
    │    transactionId: "TX-001",                    │
    │    riskScore: 75,                              │
    │    isSuspicious: true                          │
    │  }                                             │
```

### 7.2 FLUX 2 — Sync KYC (Plateforme → CBS)

```
Plateforme KYC-AML                               CBS Basikon
    │                                                │
    │  Analyste approuve KYC                         │
    │  → Queue: PUSH_KYC_UPDATE                      │
    │                                                │
    │  POST /customers/{id}/kyc-status               │
    │  { kycStatus, riskLevel, validUntil, source }  │
    │ ─────────────────────────────────────────────→  │
    │                                                │
    │  ←─────────────────────────────────────────────│
    │  { acknowledged: true }                        │
```

### 7.3 FLUX 3 — Gel de comptes (Plateforme → CBS)

```
Plateforme KYC-AML                               CBS Basikon
    │                                                │
    │  SAR validée + dual control approuvé           │
    │  → Queue: BLOCK_ACCOUNTS                       │
    │                                                │
    │  POST /customers/{id}/block                    │
    │  { reason, blockedBy, reference }              │
    │ ─────────────────────────────────────────────→  │
    │                                                │
    │  ←─────────────────────────────────────────────│
    │  { success: true, frozenAt: "..." }            │
```

### 7.4 FLUX 4 — Push alertes AML (Plateforme → CBS)

```
Plateforme KYC-AML                               CBS Basikon
    │                                                │
    │  Alerte AML créée (règle ou ML)                │
    │  → Queue: PUSH_ALERT                           │
    │                                                │
    │  POST /alerts                                  │
    │  { customerId, alertType, severity,            │
    │    description, linkedTransactions }            │
    │ ─────────────────────────────────────────────→  │
    │                                                │
    │  ←─────────────────────────────────────────────│
    │  { alertId: "...", received: true }             │
```

### 7.5 FLUX 5 — Consultation client (Plateforme → CBS)

```
Plateforme KYC-AML                               CBS Basikon
    │                                                │
    │  GET /customers/{id}                           │
    │ ─────────────────────────────────────────────→  │
    │                                                │
    │  ←─────────────────────────────────────────────│
    │  { id, firstName, lastName, kycStatus,         │
    │    riskLevel, accounts: [...] }                │
```

### 7.6 FLUX 6 — Historique transactions (Plateforme → CBS)

```
Plateforme KYC-AML                               CBS Basikon
    │                                                │
    │  GET /accounts/{id}/transactions               │
    │  ?from=2026-01-01&to=2026-06-22&limit=50      │
    │ ─────────────────────────────────────────────→  │
    │                                                │
    │  ←─────────────────────────────────────────────│
    │  { items: [...], total: 234, hasMore: true }   │
```

### 7.7 Résumé des endpoints CBS Basikon requis

| # | Méthode | Endpoint Basikon | Usage |
|---|---------|-----------------|-------|
| 1 | `POST` | `http://10.10.1.185:3000/webhooks/transaction` | CBS pousse les transactions |
| 2 | `POST` | `/customers/{id}/kyc-status` | Plateforme sync le KYC |
| 3 | `POST` | `/customers/{id}/block` | Plateforme gèle les comptes |
| 4 | `POST` | `/customers/{id}/unblock` | Plateforme dégèle |
| 5 | `POST` | `/alerts` | Plateforme envoie les alertes AML |
| 6 | `GET` | `/customers/{id}` | Plateforme consulte un client |
| 7 | `GET` | `/customers/search?email=...` | Plateforme recherche un client |
| 8 | `GET` | `/accounts/{id}/transactions` | Plateforme consulte l'historique |
| 9 | `GET` | `/transactions/{id}` | Plateforme consulte une transaction |
| 10 | `GET` | `/health` | Monitoring connectivité |

---

## 8. Avantages différenciants

### 8.1 Intelligence Artificielle et Machine Learning

| Capacité | Détail |
|----------|--------|
| **Scoring ML hybride** | XGBoost (supervisé) + Isolation Forest (non-supervisé) — détecte les patterns connus ET inconnus |
| **Réentraînement automatique** | Planifié (hebdomadaire) ou à la demande — le modèle s'améliore en continu |
| **Explicabilité (XAI)** | Chaque score est accompagné d'une explication en langage naturel — conformité RGPD Art. 22 |
| **Comparaison faciale** | InsightFace/ArcFace en local — vérification biométrique sans dépendance externe |
| **Auto-demotion** | Les règles avec >20% de faux positifs sont automatiquement rétrogradées |
| **pKYC drift scoring** | Détection continue des changements de comportement client vs baseline |

### 8.2 Résilience et fiabilité

| Capacité | Détail |
|----------|--------|
| **Circuit breaker CBS** | Protection automatique si le CBS est indisponible — aucun job perdu |
| **Queue avec retry exponentiel** | 5 tentatives (1s → 16s), dead-letter queue, supervision dashboard |
| **Déduplication Redis** | Idempotence 24h sur tous les webhooks entrants |
| **Piste d'audit chaînée** | Hash SHA-256 enchaîné — preuve cryptographique d'intégrité pour les auditeurs |
| **Chiffrement PII** | AES-256 des données personnelles en base — conformité BAM 5/W/2023 |

### 8.3 Adaptabilité au marché africain

| Capacité | Détail |
|----------|--------|
| **Connecteurs mobile money** | Orange Money, Wave, CIH Mobile — natifs, prêts à l'emploi |
| **Wallets + KYC tiering** | 3 niveaux de vérification avec plafonds — adapté à l'inclusion financière |
| **Réseau d'agents** | Gestion float, scoring risque, suspension — pour les réseaux de distribution |
| **Rapports BAM/ANRF** | Conformité Bank Al-Maghrib native |
| **Correspondent Banking R.13** | Évaluation intégrée des partenaires bancaires |

### 8.4 Conformité réglementaire avancée

| Capacité | Détail |
|----------|--------|
| **GoAML XML natif** | Génération + transmission automatique à TRACFIN et BAM |
| **ISO 20022** | pacs.008 + camt.053 — prêt pour les nouveaux standards de paiement |
| **IVMS 101 Travel Rule** | Conformité GAFI R.16 pour les transferts internationaux |
| **AMLD6 KPI** | Statistiques réglementaires avec export PDF/CSV |
| **RGPD / Loi 09-08** | Droit à l'effacement, explicabilité IA, chiffrement PII |

---

**Document généré le 22/06/2026 — Version 2.0**
**119 cas d'usage | 60 fonctionnalités | 82 points de comparaison**
