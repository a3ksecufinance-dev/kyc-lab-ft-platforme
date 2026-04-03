# Cartographie de Conformité Réglementaire
## KYC-AML Platform v2.5

**Version : 2.5 — Janvier 2026 | Document interne Conformité**

---

## PRÉAMBULE

Le présent document constitue la cartographie officielle de conformité réglementaire de la plateforme KYC-AML Platform v2.5. Il recense les exigences réglementaires applicables aux institutions financières utilisatrices de la plateforme et la manière dont les fonctionnalités de la plateforme y répondent.

Ce document est destiné aux Compliance Officers, DPO, Responsables RCLCB et équipes d'audit interne et externe. Il est révisé semestriellement et à chaque évolution réglementaire majeure.

---

## CADRE RÉGLEMENTAIRE COUVERT

| Référentiel | Texte | Version couverte |
|-------------|-------|-----------------|
| **Union Européenne** | Directive (UE) 2018/843 — 5ème Directive Anti-Blanchiment (AMLD5) | Transposition nationale applicable |
| **Union Européenne** | Directive (UE) 2018/1673 — 6ème Directive Anti-Blanchiment (AMLD6) | En vigueur depuis décembre 2020 |
| **International** | Recommandations du GAFI/FATF — 40 Recommandations | Révision de 2023 |
| **France** | Ordonnance n°2016-1635 du 1er décembre 2016 | En vigueur |
| **France** | Code monétaire et financier — Titre VI | Version consolidée en vigueur |
| **France** | Lignes directrices ACPR sur la LAB/FT | Dernière version applicable |
| **France** | Procédure TRACFIN — déclarations de soupçon | Format XML en vigueur |
| **Maroc** | Loi n°43-05 relative à la lutte contre le blanchiment de capitaux | Telle qu'amendée |
| **Maroc** | Circulaire n°5/W/2023 de Bank Al-Maghrib | En vigueur depuis 2023 |
| **Maroc** | Liste ANRF (Autorité Nationale du Renseignement Financier) | Mise à jour continue |
| **International** | Format GoAML (UNODC — Nations Unies) | Version XML en vigueur |
| **Protection des données** | Règlement (UE) 2016/679 — RGPD | En vigueur depuis mai 2018 |

---

## 1. MATRICE AMLD6 — 6ÈME DIRECTIVE ANTI-BLANCHIMENT

**Référence :** Directive (UE) 2018/1673 du Parlement européen et du Conseil du 23 octobre 2018

| # | Exigence | Article AMLD6 | Module / Fonctionnalité | Evidence / Preuve de conformité | Statut |
|---|----------|--------------|------------------------|--------------------------------|--------|
| A6-01 | **Extension du périmètre des infractions sous-jacentes au blanchiment** — 22 infractions prédéterminées constituant la liste harmonisée des infractions sous-jacentes, incluant la cybercriminalité et les infractions fiscales | Art.2 & Art.3 | Moteur AML — règles CASH_INTENSIVE, HIGH_RISK_COUNTRY, UNUSUAL_CHANNEL ; Base de connaissance typologique ; Champ `predicate_offense` dans les dossiers d'investigation | Règles AML couvrant les typologies liées aux 22 infractions ; Champ libre `predicate_offense` dans les Cases pour catégoriser | CONFORME |
| A6-02 | **Approche basée sur les risques (ABR)** — Les entités assujetties doivent mettre en oeuvre une approche proportionnée fondée sur l'évaluation des risques | Art.7 | Module KYC — Scoring de risque multi-critères (pays, activité, type client, transactions) ; Règles AML avec seuils configurables ; Paramétrage par profil de risque | Scoring KYC 5 niveaux (VERY_LOW / LOW / MEDIUM / HIGH / VERY_HIGH) ; Documentation de la méthodologie de scoring accessible | CONFORME |
| A6-03 | **Vigilance standard — Customer Due Diligence (CDD) obligatoire** — Identification et vérification de l'identité du client avant l'entrée en relation | Art.10 | Module KYC & Onboarding — Workflow KYC complet : collecte identité, vérification documents, screening initial, scoring risque | Workflow KYC obligatoire avant activation client ; Statut KYC_PENDING → KYC_APPROVED bloquant les transactions ; Audit trail de chaque étape | CONFORME |
| A6-04 | **CDD simplifiée** — Mesures de vigilance allégées pour les clients à faible risque dûment justifié | Art.14 | Module KYC — Profil de risque VERY_LOW/LOW avec fréquence de révision réduite (24 mois vs 12 mois standard) ; Règles AML avec seuils relevés pour clients low-risk | Configuration de la fréquence de révision par profil de risque ; Justification documentée du profil simplifié dans l'audit trail | CONFORME PARTIEL — La liste positive des critères justifiant la CDD simplifiée nécessite une configuration manuelle par le Client |
| A6-05 | **CDD renforcée** — Mesures de vigilance renforcées pour les clients à risque élevé, pays tiers à risque et situations spécifiques | Art.16 | Module KYC — Profil HIGH/VERY_HIGH : approbation superviseur obligatoire, révision 6 mois, vérifications complémentaires ; Workflow de validation deux niveaux | Obligation d'approbation superviseur pour tout client HIGH_RISK ; Révision automatique tous les 6 mois ; Champ de justification obligatoire | CONFORME |
| A6-06 | **Surveillance continue** — Les entités dosujetties doivent exercer une surveillance continue de la relation d'affaires et des transactions | Art.15 | Module pKYC — Score de dérive comportementale ; Surveillance continue des patterns transactionnels ; Moteur AML temps réel ; File de révision automatique | Score pKYC calculé en temps réel ; Alerte automatique si score de dérive > seuil ; Révision planifiée visible dans le dashboard | CONFORME |
| A6-07 | **Personnes Politiquement Exposées (PEP)** — Mesures renforcées pour les PEP, leurs proches et associés | Art.12 | Module Screening — Base OpenSanctions PEP (1,7M+ entités) ; Statut PEP automatiquement traduit en profil HIGH_RISK KYC ; Alerte PEP_TRANSACTION dans le moteur AML | Règle PEP_TRANSACTION déclenchée si contrepartie PEP ; Statut PEP visible dans le profil client ; Escalade automatique au superviseur | CONFORME |
| A6-08 | **Tiers pays à risque élevé** — Application de mesures de vigilance renforcée pour les relations avec des pays figurant sur les listes UE/GAFI | Art.18 | Module KYC — Pays HIGH_RISK dans le scoring ; Règle AML HIGH_RISK_COUNTRY ; Listes pays mises à jour selon publication UE/GAFI | Base pays à risque maintenue à jour selon listes GAFI (ICRG) et Commission européenne (actes délégués) ; Intégration dans scoring risque | CONFORME — Nécessite mise à jour manuelle de la liste pays à risque lors de nouvelles publications |
| A6-09 | **Mesures renforcées — Correspondance bancaire** — Vigilance accrue sur les relations de correspondance bancaire avec des établissements de pays tiers | Art.19 | Module KYC — Profil client "Institution Financière Correspondante" avec CDD renforcée intégrée ; Champs spécifiques : évaluation AML du correspondant, approbation direction | Profil CLIENT_TYPE = CORRESPONDENT_BANK déclenche workflow CDD renforcée ; Champs de documentation des diligences spécifiques à la correspondance bancaire | CONFORME PARTIEL — Champs documentaires disponibles mais workflow spécifique à la correspondance bancaire à configurer par l'institution |
| A6-10 | **Déclaration de soupçon (DS)** — Obligation de déclarer aux autorités compétentes (CRF/FIU) toute opération suspecte | Art.33 | Module Reporting — Génération automatique de SAR/DS (PDF et XML) ; Export TRACFIN XML ; Statut de déclaration dans l'audit trail ; Conservation 10 ans | Export DS au format TRACFIN XML valide ; PDF DS avec tous les champs obligatoires ; Horodatage et traçabilité de la transmission | CONFORME |
| A6-11 | **Non-divulgation (tipping-off)** — Interdiction d'informer le client concerné qu'une déclaration de soupçon a été faite | Art.43 | Plateforme — Interface design : séparation stricte des profils client "vu par le client" et "investigation interne" ; Formation utilisateur ; Gel d'avoirs sans notification client | Gel d'avoirs technique sans notification client ; Interface investigation séparée des vues client ; Alerte dans la formation sur le tipping-off | CONFORME — La responsabilité du respect du tipping-off incombe à l'institution, la plateforme fournit les outils techniques nécessaires |
| A6-12 | **Conservation des données — 5 ans** — Conservation des données CDD et des transactions pendant 5 ans à compter de la fin de la relation d'affaires | Art.40 | Module Rétention — Politique de rétention automatisée ; Conservation 5 ans post-clôture pour données KYC ; 10 ans pour SAR et données transactionnelles | Politique de rétention configurée et documentée (voir DATA_RETENTION_POLICY.md) ; Suppression automatique à échéance ; Audit trail de la suppression | CONFORME |
| A6-13 | **Registre des bénéficiaires effectifs (UBO)** — Accès aux informations sur les bénéficiaires effectifs des personnes morales | Art.45 | Module Réseau d'Entités — Graphe UBO, saisie et conservation des UBO avec pourcentage de détention, visualisation des structures d'actionnariat | Champs UBO obligatoires pour clients personnes morales ; Visualisation graphe de propriété ; Historique des modifications UBO | CONFORME |
| A6-14 | **Politiques et procédures au niveau du groupe** — Établissements appartenant à un groupe doivent appliquer des politiques homogènes | Art.45bis | Module Administration — Gestion multi-organisations avec paramètres centraux partagés ; Configuration des règles AML partagée au niveau groupe | Fonctionnalité multi-organisations avec règles groupe et règles locales ; Hiérarchie ADMIN_GROUP > ADMIN_LOCAL | CONFORME PARTIEL — La fonctionnalité groupe est disponible ; l'implémentation de la politique groupe relève de la configuration du Client |
| A6-15 | **Formation des employés** — Les entités assujetties doivent former leur personnel à la reconnaissance des opérations de blanchiment | Art.46 | Plan de Formation KYC-AML Platform (document séparé) — 8 modules certifiants couvrant la réglementation et l'utilisation de la plateforme ; Certification interne avec QCM | Documentation de formation fournie avec la plateforme ; Programme de certification interne disponible ; Attestations exportables | CONFORME — Formation assurée via le programme certifiant fourni par l'Éditeur |
| A6-16 | **Sanctions pénales harmonisées** — Sanctions pénales pour les infractions de blanchiment de capitaux | Art.6 & Art.7 | Hors périmètre direct de la plateforme — La plateforme fournit les outils de documentation et de déclaration nécessaires en cas de suspicion d'infraction | La plateforme génère les DS, conserve les preuves et assure la traçabilité nécessaire à toute procédure judiciaire ultérieure | HORS PÉRIMÈTRE — Responsabilité de l'institution et des autorités judiciaires |

---

## 2. MATRICE FATF — 40 RECOMMANDATIONS GAFI

**Référence :** Standards internationaux sur la lutte contre le blanchiment de capitaux et le financement du terrorisme et de la prolifération — GAFI, révision 2023

| # | Recommandation | Thème | Module / Fonctionnalité | Evidence / Preuve | Statut |
|---|----------------|-------|------------------------|-------------------|--------|
| R1-01 | **R.1 — Approche basée sur les risques (ABR)** — Les pays et les entités déclarantes doivent identifier, évaluer et comprendre les risques de BC/FT qui les concernent et prendre des mesures proportionnées | Fondamental | Module KYC — Scoring de risque 5 niveaux ; Paramétrage des seuils AML par profil de risque ; Rapports de distribution des risques | Méthodologie de scoring documentée ; Configuration des seuils par profil client ; Rapport KPI de distribution risque disponible dans le dashboard | CONFORME |
| R1-02 | **R.10 — Vigilance relative à la clientèle (CDD)** — Mesures d'identification et de vérification lors de l'entrée en relation et pendant la relation | CDD | Module KYC & Onboarding — Workflow CDD complet : identification, vérification pièces d'identité, compréhension de la relation d'affaires, surveillance continue | Workflow KYC obligatoire ; Vérification documentaire ; Surveillance continue via pKYC et moteur AML | CONFORME |
| R1-03 | **R.12 — Personnes politiquement exposées (PEP)** — Mesures de vigilance renforcée pour les PEP nationaux, étrangers et les organisations internationales | PEP | Module Screening — Base PEP OpenSanctions (1,7M+ entités) ; Règle AML PEP_TRANSACTION ; Profil KYC automatiquement HIGH si PEP identifié | Screening PEP systématique à l'onboarding et à chaque transaction ; Escalade automatique supervisor ; Conservation du résultat de screening 5 ans | CONFORME |
| R1-04 | **R.13 — Correspondance bancaire** — Mesures de vigilance renforcée pour les relations de correspondance bancaire transfrontalière | Correspondance | Module KYC — Profil CLIENT_TYPE = CORRESPONDENT_BANK ; Champs spécifiques pour évaluation AML du correspondant ; Approbation direction requise | Profil client dédié ; Workflow d'approbation renforcée ; Documentation des diligences de correspondance | CONFORME PARTIEL — Fonctionnalité disponible ; configuration spécifique requise |
| R1-05 | **R.14 — Services de transfert de fonds ou de valeurs (STFV)** — Réglementation et surveillance des opérateurs de transfert | STFV | Module KYC — Profil CLIENT_TYPE = MONEY_SERVICE_BUSINESS ; Règles AML avec seuils adaptés aux activités de transfert ; Règle HAWALA_PATTERN spécifique | Règle HAWALA_PATTERN dédiée aux réseaux hawala ; Surveillance renforcée des MSB ; Détection des réseaux de transfert informels | CONFORME |
| R1-06 | **R.16 — Virements électroniques** — Exigences de traçabilité pour les virements : information sur le donneur d'ordre et le bénéficiaire | Virements | Module AML — Capture des données donneur d'ordre / bénéficiaire dans les transactions ; Alerte si données manquantes (champs obligatoires) ; Règle STRUCTURING sur les séries de virements | Champs obligatoires donneur d'ordre et bénéficiaire dans le modèle transaction ; Validation à l'ingestion CBS ; Rapport sur les virements incomplets | CONFORME PARTIEL — Dépend de la complétude des données transmises par le CBS du Client |
| R1-07 | **R.20 — Déclaration des opérations suspectes (DOS/SAR)** — Obligation de déclarer les opérations suspectes à la CRF/FIU | SAR/DOS | Module Reporting — Génération de SAR/DS ; Export TRACFIN XML ; GoAML international ; Workflow de validation interne avant transmission | Format TRACFIN XML valide ; Format GoAML pour déclarations internationales ; Conservation 10 ans avec audit trail | CONFORME |
| R1-08 | **R.21 — Non-divulgation et confidentialité des DOS** — Interdiction de révéler qu'une DOS a été effectuée ou est envisagée (tipping-off) | Non-divulgation | Plateforme — Architecture séparant strictement vues client et investigations internes ; Formation intégrée sur le tipping-off | Interfaces utilisateur distinctes pour vues client et investigations ; Gel d'avoirs sans notification client ; Formation spécifique | CONFORME |
| R1-09 | **R.24 — Transparence et bénéficiaires effectifs des personnes morales** — Obtention et conservation des informations sur les bénéficiaires effectifs | UBO | Module Réseau d'Entités — Saisie UBO avec pourcentage de détention ; Graphe de propriété ; Historique des modifications ; Vérification contre registres UBO | Champs UBO obligatoires pour personnes morales ; Visualisation graphe d'actionnariat ; Alertes si UBO non renseigné au-delà du seuil légal | CONFORME |
| R1-10 | **R.29 — Cellule de renseignement financier (CRF/FIU)** — Les pays doivent créer une CRF opérationnelle recevant et analysant les DOS | CRF/FIU | Module Reporting — Transmission aux CRF : TRACFIN (France), UTRF (Tunisie), ANRF (Maroc) ; Format GoAML international compatible avec la majorité des CRF membres du réseau Egmont | Export XML aux formats des CRF concernées ; Transmission directe ou via interface sécurisée ; Accusé de réception tracé | CONFORME |
| R1-11 | **R.33 — Statistiques** — Les pays et entités déclarantes doivent tenir des statistiques permettant d'évaluer l'efficacité des systèmes LAB/FT | Statistiques | Module Dashboard & KPIs — Statistiques en temps réel : nombre d'alertes par règle, taux de faux positifs, nombre de DS, distribution des risques, volumes par typologies | Tableaux de bord KPIs exportables ; Rapports statistiques mensuels/annuels ; Données exploitables pour le rapport annuel LAB/FT | CONFORME |
| R1-12 | **R.38 — Gel des avoirs et saisie** — Mesures permettant aux autorités compétentes de geler et saisir des avoirs liés au BC/FT | Gel d'avoirs | Module KYC — Statut client FROZEN ; Gel d'avoirs technique : client_status = 'FROZEN', frozenAt, frozenReason, frozenBy ; Blocage automatique des transactions ; Notification compliance officer | Workflow gel d'avoirs documenté dans SANCTIONS_LIST_POLICY.md ; Conservation de l'audit trail du gel ; Procédure de notification des autorités | CONFORME |

---

## 3. CONFORMITÉ BAM / MAROC

**Référence :** Circulaire n°5/W/2023 de Bank Al-Maghrib relative aux obligations de vigilance en matière de LAB/FT

### 3.1 Exigences BAM — Matrice de conformité

| # | Exigence BAM | Référence Circulaire | Fonctionnalité | Détail d'implémentation | Statut |
|---|-------------|---------------------|---------------|------------------------|--------|
| BAM-01 | **Seuils MAD pour la vigilance renforcée** — Application de mesures de vigilance renforcée au-delà des seuils en dirhams définis par la Circulaire | Section III | Moteur AML — Règle THRESHOLD avec seuil configurable en MAD ; Règle MENA_STRUCTURING dédiée aux fractionnements sous le seuil MAD | Seuils configurés selon les montants BAM : vigilance renforcée déclenchée conformément à la Circulaire ; Paramétrage MAD disponible | CONFORME |
| BAM-02 | **Liste nationale ANRF (Autorité Nationale du Renseignement Financier)** — Obligation de screening contre la liste nationale marocaine des personnes et entités désignées | Section IV | Module Screening — Source BAM/ANRF intégrée comme 6ème source de screening ; Mise à jour selon diffusion officielle | Screening systématique contre liste BAM/ANRF ; Alerte dédiée si correspondance ; Conservation des résultats 5 ans | CONFORME |
| BAM-03 | **Typologies spécifiques MENA — Hawala** — Détection et signalement des réseaux de transfert informels (hawala, hundi) particulièrement présents dans la région MENA | Section V | Moteur AML — Règle HAWALA_PATTERN : détection des schémas de transactions caractéristiques des réseaux hawala (montants ronds répétés entre entités reliées, canal inhabituel) | Règle HAWALA_PATTERN avec 4 critères de détection : fréquence, canal, montants ronds, contreparties communes ; Score spécifique | CONFORME |
| BAM-04 | **Typologies spécifiques MENA — Structuring MAD** — Détection du fractionnement de transactions pour rester sous les seuils réglementaires marocains | Section V | Moteur AML — Règle MENA_STRUCTURING : variante de STRUCTURING calibrée sur les seuils MAD de la Circulaire ; Fenêtre temporelle adaptée aux pratiques locales | Règle MENA_STRUCTURING avec seuils MAD configurés ; Fenêtre de détection 7 jours glissants ; Combinaison avec ROUND_AMOUNT | CONFORME |
| BAM-05 | **Déclaration à l'UTRF** — Déclaration des opérations suspectes à l'Unité de Traitement du Renseignement Financier (UTRF) | Section VI | Module Reporting — Export GoAML international compatible avec les exigences de l'UTRF marocain ; DS au format requis par l'UTRF | Format GoAML compatible UTRF ; Conservation 10 ans ; Workflow de validation interne avant transmission | CONFORME |
| BAM-06 | **Conservation des données — délais marocains** — Conservation des informations et documents relatifs aux opérations financières pendant 10 ans | Section VII | Module Rétention — Politique de rétention configurée : 10 ans pour données transactionnelles et dossiers d'investigation | Rétention 10 ans configurée pour toutes les catégories concernées ; Suppression automatique à l'échéance | CONFORME |
| BAM-07 | **Vigilance particulière — pays à risque élevé** — Application de mesures renforcées pour les opérations avec des pays figurant sur les listes de pays à risque | Section III | Module KYC — Règle AML HIGH_RISK_COUNTRY ; Liste pays à risque intégrant les pays classés par le GAFI et les listes UE | Base pays à risque maintenue ; Déclinaison des listes GAFI/UE/BAM dans le scoring pays | CONFORME PARTIEL — Mise à jour manuelle de la liste BAM spécifique requise |
| BAM-08 | **Formation obligatoire du personnel** — Obligation pour les entités assujetties de former leur personnel aux typologies LAB/FT locales | Section VIII | Plan de Formation KYC-AML Platform — Module 1 (cadre réglementaire) inclut spécifiquement les typologies MENA et la réglementation BAM ; Module 3 (traitement alertes) avec cas MENA | Formation certifiante couvrant la réglementation BAM ; Cas pratiques MENA dans les modules 3 et 5 ; Attestations de formation | CONFORME |

### 3.2 Spécificités des règles MENA

Les trois règles AML spécifiquement conçues pour les typologies MENA sont :

| Règle | Typologies visées | Paramètres clés | Seuil de déclenchement |
|-------|------------------|----------------|----------------------|
| **HAWALA_PATTERN** | Transferts informels hawala/hundi, fragmentation géographique des envois de fonds | Réseau de contreparties liées, canaux inhabituels, montants ronds en MAD | Score ≥ 60 si ≥ 3 des 4 critères détectés |
| **MENA_STRUCTURING** | Fractionnement de transactions pour passer sous les seuils réglementaires MAD | Seuil configuré selon Circulaire BAM, fenêtre 7 jours, ≥ 3 transactions | Cumul > 80% du seuil BAM sur 7 jours glissants |
| **CASH_INTENSIVE** | Activités à forte intensité d'espèces (commerces, restaurants, change) dans le contexte MENA | Ratio espèces/total > seuil, canal CASH, montants récurrents | Ratio > 70% ou montant cash > seuil MAD configuré |

---

## 4. CONFORMITÉ RGPD

**Référence :** Règlement (UE) 2016/679 du Parlement européen et du Conseil du 27 avril 2016

| # | Article RGPD | Principe / Droit | Fonctionnalité | Implémentation technique | Statut |
|---|-------------|-----------------|---------------|------------------------|--------|
| RGPD-01 | **Art.5(1)(a)** — Licéité, loyauté, transparence | Licéité du traitement | ATD Art.3 — Finalités documentées et limitées à la LAB/FT | Base légale Art.6(1)(c) documentée pour chaque finalité ; ATD signé avec le Client | CONFORME |
| RGPD-02 | **Art.5(1)(b)** — Limitation des finalités | Pas de réutilisation incompatible | Cloisonnement des finalités dans l'architecture ; Interdiction d'utilisation à d'autres fins contractuellement encadrée | Architecture technique empêchant le croisement des données entre clients (multi-tenant) ; Interdiction contractuelle dans l'ATD | CONFORME |
| RGPD-03 | **Art.5(1)(c)** — Minimisation des données | Collecte des seules données nécessaires | Formulaires KYC avec champs obligatoires / facultatifs différenciés ; Pas de collecte systématique au-delà des exigences légales | Champs facultatifs non bloquants dans le workflow KYC ; Documentation des données collectées dans l'ATD Annexe 1 | CONFORME |
| RGPD-04 | **Art.5(1)(d)** — Exactitude | Données exactes et à jour | Module pKYC — Révision périodique des données client ; Alerte si données obsolètes (document expiré, adresse non vérifiée) ; Correction facilitée par le workflow | Détection automatique des documents d'identité expirés ; File de révision pKYC pour clients avec données potentiellement obsolètes | CONFORME |
| RGPD-05 | **Art.5(1)(e)** — Limitation de la conservation | Pas de conservation au-delà du nécessaire | Module Rétention — Politique de rétention par catégorie (voir DATA_RETENTION_POLICY.md) ; Suppression automatique à l'échéance | Script d'archivage et de suppression automatique ; Audit annuel de la rétention | CONFORME |
| RGPD-06 | **Art.5(1)(f)** — Intégrité et confidentialité | Sécurité appropriée | Chiffrement AES-256-GCM au repos + TLS 1.3 en transit ; RBAC ; MFA ; Journal d'audit immuable | Voir Annexe 2 de l'ATD et INCIDENT_RESPONSE.md | CONFORME |
| RGPD-07 | **Art.13 et Art.14** — Information des personnes concernées | Transparence / Information | L'information des personnes concernées (clients du Client) est de la responsabilité du Client (RT) ; La plateforme fournit les outils techniques (export des données d'un individu) | Documentation fournie au Client pour rédiger ses notices d'information ; API d'export des données individuelles | CONFORME — Responsabilité du RT ; plateforme fournit les outils |
| RGPD-08 | **Art.15** — Droit d'accès | Droit d'accès | API d'export des données d'un client identifié ; Format structuré et lisible | Endpoint API GET /customers/{id}/data-export retournant toutes les données dans un format JSON structuré | CONFORME |
| RGPD-09 | **Art.16** — Droit de rectification | Droit de rectification | Interface de modification des données client ; Journal d'audit des modifications | Toute modification traçée avec userId, timestamp, avant/après | CONFORME |
| RGPD-10 | **Art.17** — Droit à l'effacement | Droit à l'effacement (avec limitations LAB/FT) | Fonctionnalité de pseudonymisation : suppression des données PII, conservation des données AML/compliance non-personnelles requises par la loi | Fonction requestErasure() : remplacement des PII par des identifiants pseudonymes ; Conservation des alertes, scores, dossiers sans PII | CONFORME — Limitation légale Art.17(3)(b) : les données LAB/FT ne peuvent pas être effacées pendant la durée légale de conservation |
| RGPD-11 | **Art.25** — Protection des données dès la conception et par défaut (Privacy by Design / Privacy by Default) | Privacy by Design | Architecture conçue avec isolation multi-tenant native ; Chiffrement par défaut activé ; RBAC minimal par défaut ; Minimisation à la conception des champs de données | Chiffrement AES-256-GCM activé par défaut sans option de désactivation ; Isolation multi-tenant garantie architecturalement ; Rôle VIEWER par défaut | CONFORME |
| RGPD-12 | **Art.28** — Contrat de sous-traitance | Sous-traitance encadrée | ATD (DPA.md) conforme Art.28 ; Liste des sous-traitants ultérieurs documentée (Annexe 3 de l'ATD) | ATD signé avec chaque Client ; Sous-traitants ultérieurs sous DPA équivalent | CONFORME |
| RGPD-13 | **Art.32** — Sécurité du traitement | Sécurité technique et organisationnelle | AES-256-GCM, TLS 1.3, MFA TOTP, RBAC, bcrypt, pentest annuel, CI/CD sécurisé, HMAC-SHA256 | Voir Annexe 2 ATD et INCIDENT_RESPONSE.md pour la description détaillée | CONFORME |
| RGPD-14 | **Art.33** — Notification des violations à l'autorité de contrôle | Notification CNIL 72h | Plan de Réponse aux Incidents (INCIDENT_RESPONSE.md) — Procédure de détection, notification et documentation des violations de données | Obligation contractuelle de notification au Client dans les 72h (ATD Art.6.4) ; Template de notification CNIL fourni | CONFORME |
| RGPD-15 | **Art.35** — Analyse d'impact (DPIA) | DPIA pour traitements à risque élevé | DPIA de référence fournie avec la plateforme (DPIA.md) ; Assistance à la réalisation de la DPIA du Client | Document DPIA.md disponible dans la documentation ; Assistance ATD Art.11.3 | CONFORME |
| RGPD-16 | **Art.37** — Désignation d'un DPO | DPO | Non applicable directement à l'Éditeur en tant que sous-traitant ; Recommandation au Client de désigner un DPO | Champ DPO dans le paramétrage de l'organisation Client ; Contact DPO utilisé pour les notifications de violation | RECOMMANDATION — La désignation du DPO est de la responsabilité de chaque Client |
| RGPD-17 | **Art.30** — Registre des activités de traitement | Registre des traitements | Registre des traitements du ST tenu à jour (Art.30(2)) ; Fourni au Client sur demande | Registre interne maintenu par l'Éditeur ; Disponible à la CNIL sur demande ; Extrait fourni au Client pour son propre registre | CONFORME |

---

## 5. GAPS IDENTIFIÉS ET ROADMAP DE REMÉDIATION

### 5.1 Tableau des gaps

| # | Domaine | Gap identifié | Sévérité | Impact réglementaire | Roadmap |
|---|---------|--------------|----------|---------------------|---------|
| G-01 | AMLD6 / CDD simplifiée | La liste positive des critères justifiant la CDD simplifiée n'est pas préconfigurée — le Client doit la définir manuellement | MOYEN | Risque de CDD simplifiée non documentée | **Q2 2026** : Intégration d'une liste de critères types (secteurs, structures, montants) basée sur les lignes directrices ACPR et ESAs |
| G-02 | AMLD6 / Correspondance bancaire | Le workflow spécifique à la correspondance bancaire (Art.19 AMLD6) nécessite une configuration manuelle importante | MOYEN | Non-conformité potentielle si non configuré | **Q3 2026** : Ajout d'un profil client "Correspondance bancaire" avec workflow CDD renforcée pré-configuré et checklist Art.19 |
| G-03 | FATF R.16 / Virements | La complétude des informations donneur d'ordre / bénéficiaire dépend des données transmises par le CBS du Client | FAIBLE | Alerte sur virements incomplets disponible, mais remédiation côté CBS | **Permanent** : Documentation des exigences d'intégration CBS ; assistance à la configuration des champs obligatoires |
| G-04 | BAM / Liste pays à risque | La liste spécifique BAM des pays à risque (distincte des listes GAFI/UE) nécessite une mise à jour manuelle | FAIBLE | Potentiel retard de mise à jour si publication BAM non surveillée | **Q2 2026** : Veille réglementaire automatisée avec notification ; intégration d'un flux de données BAM si disponible |
| G-05 | RGPD / DPO | Le champ DPO n'est pas obligatoire à la configuration — risque que le DPO ne soit pas renseigné | FAIBLE | Impossibilité de notifier le bon interlocuteur en cas de violation | **Q1 2026** : Rendre le champ DPO obligatoire lors de la configuration initiale de l'organisation avec rappel d'alerte si vide |
| G-06 | RGPD / Art.14 | La notice d'information des personnes concernées n'est pas automatiquement générée par la plateforme | MOYEN | Responsabilité du RT, mais absence d'outil de génération | **Q3 2026** : Ajout d'un générateur de notice d'information personnalisable selon la réglementation applicable |
| G-07 | AMLD6 / Sanctions pénales | Le reporting interne sur les incidents potentiellement constitutifs d'infractions pénales n'est pas formalisé | FAIBLE | Principalement procédural | **Q4 2026** : Ajout d'un champ "infraction sous-jacente présumée" dans les dossiers d'investigation avec référencement des 22 infractions AMLD6 |
| G-08 | ISO 27001 | La certification ISO 27001 n'est pas encore obtenue (en cours de préparation) | MOYEN | Certains clients institutionnels l'exigent comme prérequis | **Q4 2026** : Obtention de la certification ISO 27001 (audit Gap analysis réalisé en Q4 2025, plan de remédiation en cours) |
| G-09 | SOC 2 Type II | Rapport SOC 2 Type II non disponible | FAIBLE | Requis par certains grands comptes anglophones | **2027** : Initiation d'un audit SOC 2 Type II après obtention ISO 27001 |

### 5.2 Roadmap de remédiation

```
2026 Q1 (Janvier-Mars)
├── G-05 : Rendre le champ DPO obligatoire à la configuration
└── Mise à jour de la documentation réglementaire (AMLD6, FATF révision 2023)

2026 Q2 (Avril-Juin)
├── G-01 : Liste positive CDD simplifiée pré-configurée
└── G-04 : Veille réglementaire BAM automatisée

2026 Q3 (Juillet-Septembre)
├── G-02 : Profil "Correspondance bancaire" avec workflow dédié
└── G-06 : Générateur de notice d'information RGPD

2026 Q4 (Octobre-Décembre)
├── G-07 : Champ "infraction sous-jacente" dans les Cases
└── G-08 : Certification ISO 27001 (audit initial prévu)

2027
└── G-09 : SOC 2 Type II
```

### 5.3 Politique de gestion des gaps

Les gaps identifiés sont classifiés selon trois niveaux de sévérité :
- **CRITIQUE** : Gap pouvant entraîner une non-conformité réglementaire directe — remédiation dans les 30 jours
- **MOYEN** : Gap réduisant l'efficacité de la conformité ou créant un risque opérationnel — remédiation dans les 6 mois
- **FAIBLE** : Gap d'amélioration ou de documentation — remédiation dans les 12 mois

Ce document est révisé à chaque évolution réglementaire majeure et au minimum tous les **6 mois**. La prochaine révision est planifiée pour **Juillet 2026**.

---

*Fin de la Cartographie de Conformité Réglementaire*

*Document interne Conformité — © [Éditeur KYC-AML Platform] — Version 2.5 — Janvier 2026*
*Rédigé par : Équipe Conformité | Approuvé par : Compliance Officer*
