# Plan de Formation — KYC-AML Platform

**Version :** 1.0
**Date :** Mars 2026
**Propriétaire :** Conformité / RH
**Cible :** Tous les utilisateurs de la plateforme

---

## 1. Objectifs du Plan de Formation

Ce plan de formation vise à :
- Assurer la **maîtrise opérationnelle** de la plateforme par chaque profil d'utilisateur
- Garantir la **conformité réglementaire** : AMLD5/6, FATF, BAM, RGPD
- Développer les **compétences AML/KYC** nécessaires à l'exercice des fonctions
- Maintenir les connaissances à jour face à l'**évolution des menaces** et des réglementations
- Satisfaire aux **exigences de traçabilité** des formations (audit réglementaire)

---

## 2. Profils Utilisateurs et Parcours

### 2.1 Matrice Formations × Profils

| Formation | Analyste AML | Superviseur | Compliance Officer | Admin | DevOps |
|-----------|:---:|:---:|:---:|:---:|:---:|
| Prise en main plateforme | ✅ | ✅ | ✅ | ✅ | ✅ |
| KYC et Diligences renforcées | ✅ | ✅ | ✅ | — | — |
| Moteur AML — règles et alertes | ✅ | ✅ | ✅ | — | — |
| Gestion des cas et SAR | ✅ | ✅ | ✅ | — | — |
| Screening sanctions et PPE | ✅ | ✅ | ✅ | — | — |
| Reporting réglementaire TRACFIN/GoAML | — | ✅ | ✅ | — | — |
| Administration et gestion des rôles | — | ✅ | — | ✅ | — |
| RGPD et protection des données | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sécurité applicative | — | — | — | — | ✅ |
| Architecture et déploiement | — | — | — | — | ✅ |

### 2.2 Durée et modalités par profil

| Profil | Formation initiale | Recyclage annuel | Modalité |
|--------|------------------|------------------|----------|
| Analyste AML | 3 jours | 1 jour | Présentiel + e-learning |
| Superviseur AML | 4 jours | 1,5 jour | Présentiel + e-learning |
| Compliance Officer | 5 jours | 2 jours | Présentiel + e-learning |
| Administrateur | 2 jours | 0,5 jour | Présentiel + documentation |
| DevOps | 1 jour | 0,5 jour | Documentation + atelier technique |

---

## 3. Modules de Formation

### Module 1 — Prise en Main de la Plateforme (4h)
**Cible :** Tous les profils
**Prérequis :** Aucun

**Contenu :**
- Tour d'horizon de l'interface (dashboard, navigation, thèmes)
- Connexion et authentification MFA (TOTP setup)
- Gestion de son profil et sécurité du compte
- Navigation dans les menus principaux
- Accès à la documentation intégrée
- Exercices pratiques : connexion, changement de mot de passe, activation MFA

**Évaluation :** QCM 10 questions — seuil 80%

---

### Module 2 — KYC et Diligences Clients (8h)
**Cible :** Analyste, Superviseur, Compliance Officer
**Prérequis :** Module 1

**Contenu :**
- Cadre réglementaire : AMLD5/6, FATF Recommandation 10, BAM Circulaire 5/W/2023
- Classification des clients : standard, renforcé, simplifié
- Workflow de création et vérification d'un client
- Documents acceptés et OCR : lecture des résultats d'extraction
- eKYC : processus de vérification automatique vs manuelle
- Score de risque : facteurs, pondération, interprétation
- Diligences renforcées (EDD) : déclencheurs et procédure
- Mise à jour du profil client (pKYC) : comprendre les alertes de dérive
- Cas pratiques : onboarding de 3 profils de risque différents

**Évaluation :** Étude de cas pratique — 30 minutes

---

### Module 3 — Moteur AML : Règles et Alertes (8h)
**Cible :** Analyste, Superviseur, Compliance Officer
**Prérequis :** Module 2

**Contenu :**
- Présentation des 11 règles AML et leur logique de déclenchement
- Seuils et paramètres configurables
- Comprendre le score de risque composite (règles + ML)
- Workflow de traitement d'une alerte :
  - Réception et priorité (CRITICAL / HIGH / MEDIUM / LOW)
  - Investigation : analyse des transactions, contexte client
  - Décision : RESOLVED / FALSE_POSITIVE / ESCALATED
  - Documentation et justification
- Alertes de pays à risque critique (KP, IR, CU, SY)
- Alertes PPE : transaction avec personne politiquement exposée
- Alertes de structuring et MENA-structuring
- Règle HAWALA : schémas de transferts informels
- Utilisation des métriques et statistiques AML
- Atelier : traitement de 10 alertes types (simulées)

**Évaluation :** Simulation traitement de 5 alertes — notation par superviseur

---

### Module 4 — Gestion des Cas et Déclarations SAR (6h)
**Cible :** Analyste (niveau 2), Superviseur, Compliance Officer
**Prérequis :** Module 3

**Contenu :**
- Qu'est-ce qu'un cas d'investigation ? Cycle de vie
- Création d'un dossier depuis une alerte escaladée
- Gestion de la timeline : ajout d'événements, pièces jointes
- Assignation et escalade entre analystes
- Critères de déclaration SAR (Suspicious Activity Report)
- Rédaction d'un SAR conforme TRACFIN/ANRF
- Décisions de clôture : SAR_FILED, CLOSED_NO_ACTION, REFERRED_TO_LEA
- Coordination avec le Compliance Officer pour validation
- Cas pratiques : 3 scénarios de décision SAR

**Évaluation :** Rédaction d'un SAR fictif — validation par le Compliance Officer

---

### Module 5 — Screening Sanctions et PPE (4h)
**Cible :** Analyste, Superviseur, Compliance Officer
**Prérequis :** Module 2

**Contenu :**
- Listes de sanctions : OFAC, UE, ONU, UK, BAM/ANRF, OpenSanctions PPE
- Algorithme de correspondance : Jaro-Winkler, normalisation des noms
- Seuils MATCH (≥80%) vs REVIEW (50–79%) : comment interpréter
- Résolution d'un match : vrai positif vs faux positif
- Fréquence de mise à jour des listes et contrôle de fraîcheur
- Cas pratiques : résolution de 5 matches de screening

**Évaluation :** QCM 15 questions — seuil 80%

---

### Module 6 — Reporting Réglementaire (6h)
**Cible :** Superviseur, Compliance Officer
**Prérequis :** Modules 3, 4, 5

**Contenu :**
- Obligations de déclaration en France : TRACFIN
- GoAML et format XML ISO 20022
- Génération des rapports AMLD6 depuis la plateforme
- Statistiques mensuelles et rapports de direction
- Délais réglementaires et responsabilités
- Mode simulation vs transmission réelle
- Exercice : génération d'un rapport mensuel complet

**Évaluation :** Génération d'un rapport en environnement de formation

---

### Module 7 — RGPD et Protection des Données (3h)
**Cible :** Tous les profils
**Prérequis :** Module 1

**Contenu :**
- Bases légales du traitement des données personnelles en KYC/AML
- Données traitées sur la plateforme et leur sensibilité
- Droits des personnes : accès, rectification, effacement (limites en contexte AML)
- Durées de conservation et politique de suppression
- Que faire en cas de demande d'exercice de droits ?
- Signaler une violation de données : procédure interne
- Bonnes pratiques : pas de captures d'écran, accès minimal nécessaire

**Évaluation :** QCM 10 questions — seuil 90%

---

### Module 8 — Administration Plateforme (4h)
**Cible :** Administrateur, Superviseur
**Prérequis :** Module 1

**Contenu :**
- Gestion des utilisateurs : création, modification, désactivation
- Attribution et révocation des rôles
- Lecture des logs d'audit : actions traçables, filtres
- Statistiques globales du back-office
- Déclenchement manuel du réentraînement ML
- Gestion des alertes système
- Réinitialisation de mot de passe (procédure sécurisée)

**Évaluation :** Exercices pratiques supervisés

---

### Module 9 — Sécurité Applicative & Déploiement (1 jour)
**Cible :** DevOps, DSI
**Prérequis :** Documentation technique (`TECHNICAL_DEPLOYMENT.md`, `DAT.md`)

**Contenu :**
- Architecture de sécurité : RBAC, JWT, chiffrement
- Gestion des secrets : Vault, rotation, bonnes pratiques
- Déploiement Docker Compose : variables d'environnement, healthchecks
- Monitoring : Prometheus, métriques clés, alertes
- Procédures de sauvegarde et restauration
- Réponse aux incidents : `INCIDENT_RESPONSE.md`
- Mise à jour et migrations : Drizzle, procédures de rollback

**Évaluation :** Déploiement complet en environnement de test

---

## 4. Programme de Recyclage Annuel

### 4.1 Contenu du recyclage

Chaque année, les formations de recyclage couvrent :
1. **Actualité réglementaire** (1h) : nouvelles directives FATF, AMLD, BAM
2. **Évolutions de la plateforme** (1h) : nouvelles fonctionnalités (Release Notes)
3. **Retours d'expérience** (1h) : cas réels anonymisés, erreurs fréquentes
4. **Test de connaissances** (30min) : QCM sur les modules critiques

### 4.2 Calendrier type

| Mois | Action |
|------|--------|
| Janvier | Recyclage annuel tous profils |
| Mars | Mise à jour suite nouvelles réglementations (si applicable) |
| Juin | Formation sur les nouvelles fonctionnalités v.X |
| Septembre | Exercice de simulation (traitement de cas complexes) |
| Décembre | Bilan annuel des formations, planification N+1 |

---

## 5. Suivi et Traçabilité

### 5.1 Registre des formations

Pour chaque session, documenter :
- Nom du participant
- Module(s) suivi(s)
- Date et durée
- Formateur / organisme
- Résultat de l'évaluation
- Attestation de completion (signature ou certification)

**Durée de conservation :** 5 ans (exigence audit réglementaire).

### 5.2 Conditions d'accès à la plateforme

| Condition | Plateforme production | Plateforme formation |
|-----------|-----------------------|---------------------|
| Module 1 complété | Obligatoire | Non requis |
| Module RGPD complété | Obligatoire | Non requis |
| Module métier (selon rôle) | Obligatoire | Non requis |
| Recyclage annuel à jour | Avertissement après 13 mois | — |
| Recyclage > 18 mois | Accès suspendu (admin) | — |

### 5.3 Indicateurs de suivi (KPI Formation)

| KPI | Cible |
|-----|-------|
| Taux de completion initiale | 100% sous 30j après intégration |
| Taux de recyclage à jour | ≥ 95% |
| Score moyen aux évaluations | ≥ 85% |
| Taux de satisfaction (enquête post-formation) | ≥ 4/5 |

---

## 6. Ressources de Formation

### 6.1 Documentation disponible

| Document | Cible | Localisation |
|----------|-------|--------------|
| Guide Utilisateur | Tous | `docs/user/USER_GUIDE.md` |
| Méthodologie Moteur de Risque | Analyste, Superviseur | `docs/user/RISK_ENGINE_METHODOLOGY.md` |
| Manuel d'Intégration | DevOps | `docs/api/INTEGRATION_MANUAL.md` |
| SLA | Superviseur, DSI | `docs/user/SLA.md` |
| Cartographie Réglementaire | Compliance | `docs/compliance/REGULATORY_MAPPING.md` |
| Politique Sanctions | Compliance | `docs/compliance/SANCTIONS_LIST_POLICY.md` |
| DPIA | DPO | `docs/legal/DPIA.md` |

### 6.2 Environnement de formation

Un environnement de formation dédié est disponible :
- URL : `https://training.kyc-aml.io` (séparé de la production)
- Données : clients fictifs, alertes simulées, transactions synthétiques
- Reset automatique : quotidien (données effacées à minuit)
- Accès : demander les credentials à l'administrateur

---

*Plan de formation validé par : Compliance Officer + DRH*
*Dernière révision : Mars 2026*
*Prochaine revue : Janvier 2027*
