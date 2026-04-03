# Guide Utilisateur — Plateforme KYC/AML
## Version 2.5 — Mars 2026

**Destinataires :** Analystes LAB/FT, superviseurs, responsables conformité
**Diffusion :** Confidentiel — Usage interne et clients sous contrat
**Mise à jour :** 29 mars 2026

---

## Table des matières

1. [Introduction](#1-introduction)
2. [Connexion et Sécurité](#2-connexion-et-sécurité)
3. [Tableau de Bord](#3-tableau-de-bord)
4. [Gestion des Clients (KYC)](#4-gestion-des-clients-kyc)
5. [Traitement des Alertes LAB/FT](#5-traitement-des-alertes-labft)
6. [Gestion des Dossiers d'Investigation (Cases)](#6-gestion-des-dossiers-dinvestigation-cases)
7. [Screening Sanctions et PEP](#7-screening-sanctions-et-pep)
8. [Transactions](#8-transactions)
9. [pKYC — Surveillance Comportementale Continue](#9-pkyc--surveillance-comportementale-continue)
10. [Rapports Réglementaires](#10-rapports-réglementaires)
11. [Administration](#11-administration)
12. [Raccourcis Clavier et Astuces](#12-raccourcis-clavier-et-astuces)
13. [FAQ / Problèmes Fréquents](#13-faq--problèmes-fréquents)

---

## 1. Introduction

### 1.1 Présentation de la plateforme

La plateforme KYC/AML est un système intégré de conformité réglementaire conçu pour les établissements financiers assujettis aux obligations de lutte contre le blanchiment d'argent et le financement du terrorisme (LAB/FT). Elle couvre l'intégralité du cycle de conformité, de l'entrée en relation client jusqu'à la déclaration de soupçon.

La plateforme est structurée en **14 modules fonctionnels** :

| Module | Description | Accès minimal |
|--------|-------------|---------------|
| **Dashboard** | KPIs temps réel, alertes récentes, métriques | user |
| **Customers** | Gestion KYC, fiches clients, UBO | user |
| **Transactions** | Suivi et analyse des transactions | user |
| **Alerts** | File d'attente des alertes LAB/FT | user |
| **Cases** | Dossiers d'investigation | user |
| **Screening** | Screening sanctions et PEP | user |
| **Reports** | Rapports réglementaires (SAR, TRACFIN, GoAML) | user |
| **AML Rules** | Visualisation des règles actives | analyst |
| **AMLD6** | Conformité directive européenne 6e | compliance_officer |
| **Documents** | Gestion documentaire KYC | user |
| **Network** | Graphe de réseau de transactions | analyst |
| **pKYC** | Surveillance comportementale continue | analyst |
| **MFA** | Paramètres d'authentification forte | user |
| **Admin** | Administration système | admin |

### 1.2 Accès à la plateforme

La plateforme est accessible via navigateur web moderne (Chrome 110+, Firefox 110+, Edge 110+, Safari 16+). Aucune installation client n'est requise.

**URL de production :** fournie par votre administrateur système
**URL de staging :** fournie pour les tests de recette

> **Note de sécurité :** L'accès à la plateforme depuis un réseau non sécurisé (Wi-Fi public) est formellement interdit. Utilisez exclusivement le réseau interne ou le VPN de votre établissement.

### 1.3 Rôles et permissions

La plateforme applique un contrôle d'accès basé sur les rôles (RBAC). Chaque utilisateur se voit attribuer un rôle unique par l'administrateur.

#### Tableau des permissions par rôle

| Fonctionnalité | user | analyst | supervisor | compliance_officer | admin |
|----------------|------|---------|------------|-------------------|-------|
| Tableau de bord | Lecture | Lecture | Lecture | Lecture | Lecture |
| Clients — consultation | Oui | Oui | Oui | Oui | Oui |
| Clients — modification statut KYC | Non | Oui | Oui | Oui | Oui |
| Clients — gel d'avoirs | Non | Non | Oui | Oui | Oui |
| Clients — effacement RGPD | Non | Non | Non | Oui | Oui |
| Transactions — consultation | Oui | Oui | Oui | Oui | Oui |
| Transactions — blocage | Non | Oui | Oui | Oui | Oui |
| Alertes — consultation | Oui | Oui | Oui | Oui | Oui |
| Alertes — prise en charge | Non | Oui | Oui | Oui | Oui |
| Alertes — clôture faux positif | Non | Oui | Oui | Oui | Oui |
| Alertes — escalade superviseur | Non | Oui | Oui | Oui | Oui |
| Cases — création | Non | Oui | Oui | Oui | Oui |
| Cases — décision SAR | Non | Non | Oui | Oui | Oui |
| Screening — lancement manuel | Non | Oui | Oui | Oui | Oui |
| Screening — validation match | Non | Non | Oui | Oui | Oui |
| Rapports — génération | Non | Non | Oui | Oui | Oui |
| Rapports — export TRACFIN/GoAML | Non | Non | Non | Oui | Oui |
| Règles AML — consultation | Non | Oui | Oui | Oui | Oui |
| Règles AML — modification | Non | Non | Non | Non | Oui |
| Réseau — graphe | Non | Oui | Oui | Oui | Oui |
| pKYC — consultation | Non | Oui | Oui | Oui | Oui |
| pKYC — analyse forcée | Non | Non | Non | Non | Oui |
| AMLD6 — compliance | Non | Non | Non | Oui | Oui |
| Administration — utilisateurs | Non | Non | Non | Non | Oui |
| Administration — logs système | Non | Non | Non | Non | Oui |

#### Description des rôles

**user** — Rôle de consultation de base. Peut visualiser les données mais ne peut pas modifier les statuts ni déclencher d'actions réglementaires. Typiquement attribué au personnel de back-office ou aux auditeurs internes en lecture seule.

**analyst** — Analyste LAB/FT. Traite les alertes au quotidien, effectue les screenings, crée les dossiers d'investigation. C'est le rôle opérationnel principal.

**supervisor** — Superviseur d'équipe. Valide les décisions des analystes, peut geler des avoirs, escalader les cas, approuver les déclarations de soupçon soumises par les analystes.

**compliance_officer** — Responsable conformité. Accès complet aux fonctions réglementaires : export TRACFIN, GoAML, gestion AMLD6, effacement RGPD. Interlocuteur des autorités de tutelle.

**admin** — Administrateur système. Accès total incluant la gestion des comptes utilisateurs, la configuration des règles AML et la consultation des logs d'audit système.

---

## 2. Connexion et Sécurité

### 2.1 Procédure de connexion

Accédez à la page de connexion via l'URL fournie par votre administrateur.

```
┌──────────────────────────────────────────────┐
│         PLATEFORME KYC/AML — Connexion        │
│                                              │
│  Email :  [________________________________] │
│                                              │
│  Mot de passe : [______________________] [o] │
│                                              │
│  [        Se connecter        ]              │
│                                              │
│  Mot de passe oublié ?                       │
└──────────────────────────────────────────────┘
```

**Étapes :**

1. Saisissez votre adresse email professionnelle dans le champ **Email**
2. Saisissez votre mot de passe dans le champ **Mot de passe** (l'icône oeil permet d'afficher temporairement le mot de passe)
3. Cliquez sur **Se connecter**
4. Si le MFA TOTP est activé sur votre compte, vous serez redirigé vers l'écran de saisie du code TOTP

**Politique de mots de passe :**
- Minimum 12 caractères
- Au moins une majuscule, une minuscule, un chiffre et un caractère spécial
- Ne peut pas être identique aux 5 derniers mots de passe utilisés
- Expiration automatique tous les 90 jours

**Tentatives de connexion échouées :**
- Après 5 tentatives échouées consécutives, le compte est verrouillé pendant 30 minutes
- L'administrateur peut déverrouiller le compte manuellement si nécessaire
- Chaque tentative échouée génère une entrée dans l'audit trail

### 2.2 Authentification Multi-Facteurs (MFA TOTP)

L'authentification à deux facteurs par TOTP (Time-based One-Time Password) est obligatoire pour les rôles analyst, supervisor, compliance_officer et admin. Elle est fortement recommandée pour le rôle user.

#### 2.2.1 Activation du MFA (première configuration)

1. Une fois connecté, naviguez vers **Menu utilisateur > Paramètres MFA** (route `/mfa`)
2. Cliquez sur **Activer l'authentification MFA**
3. Un QR code s'affiche à l'écran

```
┌──────────────────────────────────────────────────────┐
│         Configuration MFA — Étape 1/3                │
│                                                      │
│  Scannez ce QR code avec votre application TOTP :   │
│                                                      │
│  ┌────────────┐                                      │
│  │ ██ ██ ████ │  Applications compatibles :          │
│  │ █  █  █  █ │  • Google Authenticator (iOS/Android)│
│  │ ██ ██ █  █ │  • Microsoft Authenticator           │
│  │ █  █  ████ │  • Authy                             │
│  │ ████████ █ │  • 1Password (intégré)               │
│  └────────────┘  • FreeOTP                          │
│                                                      │
│  Ou saisissez ce code manuellement :                 │
│  JBSWY3DPEHPK3PXP                                    │
│                                                      │
│  [  Suivant  ]                                       │
└──────────────────────────────────────────────────────┘
```

4. Ouvrez votre application TOTP et scannez le QR code, ou saisissez la clé secrète manuellement
5. L'application génère un code à 6 chiffres qui change toutes les 30 secondes
6. Saisissez le code actuel pour valider la configuration

```
┌──────────────────────────────────────────────────────┐
│         Configuration MFA — Étape 2/3                │
│                                                      │
│  Saisissez le code affiché dans votre application :  │
│                                                      │
│  Code TOTP :  [_ _ _  _ _ _]                        │
│                                                      │
│  [  Vérifier  ]                                      │
└──────────────────────────────────────────────────────┘
```

7. Une liste de **10 codes de récupération** à usage unique s'affiche. **Téléchargez-les et conservez-les en lieu sûr.** Ces codes permettent de récupérer l'accès si vous perdez votre application TOTP.

```
┌──────────────────────────────────────────────────────┐
│         Configuration MFA — Étape 3/3 (IMPORTANT)   │
│                                                      │
│  CODES DE RÉCUPÉRATION — Usage unique                │
│  Conservez-les hors ligne dans un endroit sécurisé   │
│                                                      │
│  a1b2-c3d4-e5f6    g7h8-i9j0-k1l2                   │
│  m3n4-o5p6-q7r8    s9t0-u1v2-w3x4                   │
│  y5z6-a7b8-c9d0    e1f2-g3h4-i5j6                   │
│  k7l8-m9n0-o1p2    q3r4-s5t6-u7v8                   │
│  w9x0-y1z2-a3b4    c5d6-e7f8-g9h0                   │
│                                                      │
│  [  Télécharger (PDF)  ]   [  J'ai sauvegardé  ]    │
└──────────────────────────────────────────────────────┘
```

#### 2.2.2 Utilisation du MFA à chaque connexion

Après validation des identifiants, l'écran TOTP s'affiche :

```
┌──────────────────────────────────────────────────────┐
│         Vérification en deux étapes                  │
│                                                      │
│  Ouvrez votre application d'authentification         │
│  et saisissez le code à 6 chiffres.                  │
│                                                      │
│  Code TOTP :  [_ _ _  _ _ _]                        │
│                                                      │
│  Le code expire dans : 24 secondes                   │
│                                                      │
│  [  Vérifier  ]   [Utiliser un code de récupération] │
└──────────────────────────────────────────────────────┘
```

> **Conseil :** Attendez un nouveau code si le compteur est inférieur à 5 secondes pour éviter les erreurs de timing.

### 2.3 Mot de passe oublié

1. Sur la page de connexion, cliquez sur **Mot de passe oublié ?**
2. Saisissez votre adresse email professionnelle
3. Un email contenant un lien de réinitialisation sécurisé est envoyé (validité : 1 heure)
4. Cliquez sur le lien dans l'email et définissez un nouveau mot de passe conforme à la politique de sécurité

> **Important :** Le lien de réinitialisation est à usage unique et expire après 60 minutes. Si vous ne recevez pas l'email dans les 5 minutes, vérifiez votre dossier spam ou contactez votre administrateur.

La route de réinitialisation est `/reset-password`.

### 2.4 Déconnexion automatique

Pour des raisons de sécurité, la session est automatiquement terminée après **30 minutes d'inactivité**. Un avertissement s'affiche 5 minutes avant la déconnexion automatique.

Pour vous déconnecter manuellement : cliquez sur votre avatar en haut à droite > **Déconnexion**.

> **Règle de sécurité :** Ne laissez jamais votre session ouverte sans surveillance, même pour une courte durée. Utilisez le raccourci **Ctrl+Shift+L** (ou **Cmd+Shift+L** sur macOS) pour vous déconnecter rapidement.

---

## 3. Tableau de Bord

Le tableau de bord est la page d'accueil de la plateforme (route `/`). Il offre une vue synthétique de l'état de conformité en temps réel.

### 3.1 Lecture des KPIs

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TABLEAU DE BORD — KYC/AML Platform                            29 mars 2026 │
├─────────────┬──────────────────┬──────────────────┬──────────────────────────┤
│ ALERTES     │ SCORE RISQUE     │ TAUX FAUX POSITIFS│ TRANSACTIONS ANALYSÉES   │
│ OUVERTES    │ MOYEN            │ (30 derniers j.) │ (aujourd'hui)            │
│             │                  │                  │                          │
│   ┌─────┐   │   ┌──────────┐  │   ┌───────┐      │   ┌────────────────┐    │
│   │  47 │   │   │   38/100 │  │   │  7.3% │      │   │    1 284       │    │
│   └─────┘   │   └──────────┘  │   └───────┘      │   └────────────────┘    │
│   ▲ +3 vs   │   ▼ -2 vs hier  │   ▼ -0.5% vs M-1 │   ▲ +12% vs hier        │
│   hier      │                  │                  │                          │
└─────────────┴──────────────────┴──────────────────┴──────────────────────────┘
```

**Alertes ouvertes** — Nombre total d'alertes en statut OPEN ou IN_REVIEW non encore clôturées. La flèche indique la variation par rapport au même moment la veille. Un chiffre élevé ou une tendance à la hausse doit attirer l'attention du superviseur.

**Score de risque moyen** — Moyenne des scores de risque (0-100) calculés par le moteur AML sur l'ensemble des transactions des 24 dernières heures. Un score global supérieur à 50 mérite une analyse approfondie.

**Taux de faux positifs** — Pourcentage d'alertes clôturées avec le statut FALSE_POSITIVE sur les 30 derniers jours. Un taux supérieur à 15% suggère que des règles AML méritent d'être recalibrées.

**Transactions analysées** — Nombre de transactions soumises au moteur de règles AML depuis minuit (UTC). Ce compteur est mis à jour en temps réel.

### 3.2 Graphiques et tendances

La section centrale du tableau de bord affiche :

- **Graphique en barres — Alertes par priorité sur 7 jours** : visualise la répartition LOW/MEDIUM/HIGH/CRITICAL dans le temps. Une augmentation des alertes CRITICAL est un signal d'alarme immédiat.

- **Graphique camembert — Répartition par type d'alerte** : THRESHOLD, PATTERN, VELOCITY, FRAUD, SANCTION, SCREENING. Permet d'identifier les typologies dominantes.

- **Courbe de tendance — Transactions analysées vs alertes déclenchées** : ratio normal attendu entre 3% et 8% de transactions générant une alerte.

- **Carte thermique — Activité géographique** : points chauds des contreparties internationales. Les pays en rouge correspondent aux pays à risque élevé.

### 3.3 Panneau alertes récentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ALERTES RÉCENTES                                          [Voir toutes →]  │
├───────────┬──────────┬────────────┬──────────┬────────────────┬─────────────┤
│ ID        │ Client   │ Type       │ Priorité │ Score          │ Statut      │
├───────────┼──────────┼────────────┼──────────┼────────────────┼─────────────┤
│ ALT-X9K2M │ HASSAN M │ PATTERN    │ CRITICAL │ ████████░░ 82  │ OPEN        │
│ ALT-3PQ7R │ BENALI F │ THRESHOLD  │ HIGH     │ ██████░░░░ 60  │ IN_REVIEW   │
│ ALT-8WN4T │ KARIMI A │ SANCTION   │ CRITICAL │ █████████░ 90  │ OPEN        │
│ ALT-2LK9V │ DUPONT J │ VELOCITY   │ MEDIUM   │ ████░░░░░░ 40  │ IN_REVIEW   │
│ ALT-6YH1S │ MBAYE C  │ PATTERN    │ HIGH     │ ██████░░░░ 65  │ OPEN        │
└───────────┴──────────┴────────────┴──────────┴────────────────┴─────────────┘
```

Cliquez sur n'importe quelle ligne pour accéder directement au détail de l'alerte.

### 3.4 Navigation rapide

Des tuiles de navigation rapide permettent d'accéder directement aux fonctions les plus utilisées :

- **File d'alertes** — accès direct aux alertes triées par priorité décroissante
- **Clients à risque élevé** — liste filtrée des clients HIGH et CRITICAL
- **Screening en attente** — matchs screening à valider/rejeter
- **Révisions pKYC** — clients dont le score de dérive dépasse le seuil
- **Rapports à générer** — rappel des rapports mensuels non encore produits

---

## 4. Gestion des Clients (KYC)

### 4.1 Rechercher et filtrer un client

Accédez au module via le menu latéral **Clients** (route `/customers`).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CLIENTS KYC                                           [+ Nouveau client]   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Recherche : [_____________________]  Statut KYC : [Tous    ▼]             │
│  Niveau risque : [Tous ▼]  Type : [Tous ▼]  PEP : [Tous ▼]  [Rechercher] │
├───────────┬─────────────────────┬────────────┬────────────┬─────────────────┤
│ ID Client │ Nom / Raison sociale│ Statut KYC │ Niveau Rq. │ Dernière revue │
├───────────┼─────────────────────┼────────────┼────────────┼─────────────────┤
│ CL-001234 │ Hassan Mohammed     │ APPROVED   │ HIGH       │ 15/01/2026      │
│ CL-001235 │ Fatima Benali       │ IN_REVIEW  │ MEDIUM     │ 20/03/2026      │
│ CL-001236 │ SARL Atlas Trading  │ PENDING    │ HIGH       │ —              │
│ CL-001237 │ Jean-Pierre Dupont  │ APPROVED   │ LOW        │ 10/12/2025      │
└───────────┴─────────────────────┴────────────┴────────────┴─────────────────┘
│  Page 1/47                                              [<] [1] [2] [3] [>] │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Filtres disponibles :**

| Filtre | Valeurs | Description |
|--------|---------|-------------|
| Recherche textuelle | Nom, prénom, raison sociale, ID | Recherche partielle insensible à la casse |
| Statut KYC | PENDING, IN_REVIEW, APPROVED, REJECTED | Statut actuel du dossier KYC |
| Niveau de risque | LOW, MEDIUM, HIGH, CRITICAL | Score de risque client calculé |
| Type client | INDIVIDUAL, CORPORATE, PEP | Type de personne |
| Statut PEP | Oui / Non / Tous | Personnes politiquement exposées |

**Tri :** Cliquez sur l'en-tête d'une colonne pour trier (clic = croissant, double-clic = décroissant).

**Export :** Le bouton **Exporter (CSV)** en haut à droite exporte la liste filtrée courante (réservé aux rôles supervisor et supérieur).

### 4.2 Fiche client détaillée

Cliquez sur un client pour accéder à sa fiche (route `/customers/:id`).

La fiche est organisée en plusieurs onglets :

#### Onglet "Informations"

Contient les données d'identification KYC :
- Identité : nom, prénom, date de naissance, nationalité, pays de résidence
- Contact : adresse, email, téléphone
- Profil financier : type client, secteur d'activité, source de fonds
- Statut PEP et historique de sanctions
- Score de risque actuel (avec détail des facteurs contributifs)
- Dates : entrée en relation, dernière revue KYC, prochaine revue planifiée

#### Onglet "KYC"

Affiche le statut du dossier KYC avec l'historique complet des changements de statut :

```
  Statut actuel : IN_REVIEW

  Historique :
  ┌──────────────┬─────────────────┬──────────────────────────────────────────┐
  │ Date         │ Analyste        │ Action                                   │
  ├──────────────┼─────────────────┼──────────────────────────────────────────┤
  │ 20/03/2026   │ analyst@banque  │ PENDING → IN_REVIEW (entrée en relation) │
  │ 18/03/2026   │ Système         │ Création du profil client                │
  └──────────────┴─────────────────┴──────────────────────────────────────────┘
```

#### Onglet "Documents"

Liste des pièces justificatives KYC attachées au dossier (CNI, passeport, justificatif domicile, KBIS, statuts, etc.) avec leur statut de validité.

#### Onglet "Transactions"

Historique des 50 dernières transactions du client avec accès rapide aux détails et aux alertes associées.

#### Onglet "Alertes"

Toutes les alertes générées pour ce client, triées par date décroissante.

#### Onglet "UBO" (Ultimate Beneficial Owners)

Pour les clients de type CORPORATE : liste des bénéficiaires effectifs (participation ≥ 25%), avec leur propre statut KYC et score de risque.

### 4.3 Changer le statut KYC

Le workflow KYC suit un processus linéaire avec des transitions définies :

```
            ┌──────────┐
            │ PENDING  │  ← Création du profil
            └────┬─────┘
                 │
                 ▼
          ┌───────────┐
          │ IN_REVIEW │  ← Analyste examine le dossier
          └─────┬─────┘
               / \
              /   \
             ▼     ▼
      ┌──────────┐ ┌──────────┐
      │ APPROVED │ │ REJECTED │
      └──────────┘ └──────────┘
           │
           │ (révision périodique ou événement)
           ▼
      ┌──────────┐
      │ IN_REVIEW│  ← Recommence le cycle
      └──────────┘
```

**Procédure de changement de statut :**

1. Sur la fiche client, onglet **KYC**, cliquez sur **Modifier le statut**
2. Sélectionnez le nouveau statut dans la liste déroulante
3. Saisissez un **commentaire obligatoire** justifiant le changement
4. Cliquez sur **Valider**

> **Règle métier :** Un client ne peut pas passer directement de PENDING à APPROVED sans passer par IN_REVIEW. Toute modification de statut est tracée dans l'audit trail avec l'identité de l'opérateur.

**Droits nécessaires :** role analyst minimum pour modifier le statut KYC.

### 4.4 Gestion des gels d'avoirs

Le gel d'avoirs est une mesure conservatoire décidée par le superviseur ou le responsable conformité, généralement à la suite d'un screening positif sur une liste de sanctions ou d'une décision judiciaire.

**Pour geler un client :**

1. Sur la fiche client, cliquez sur le bouton **Geler les avoirs** (visible uniquement pour supervisor et supérieur)
2. Une fenêtre de confirmation s'affiche avec les champs obligatoires :
   - Motif légal du gel (référence décision, type de mesure)
   - Base réglementaire (ex : Résolution ONU 1267, décision BAM)
   - Date d'effet
3. Confirmez l'action — le statut du client passe en **FROZEN**
4. Toute tentative de transaction pour ce client sera automatiquement bloquée par le moteur
5. Une notification email est envoyée aux superviseurs et au responsable conformité

**Pour dégeler un client :**

1. Sur la fiche d'un client en statut FROZEN, cliquez sur **Lever le gel**
2. Saisissez la référence de la décision de levée et le justificatif
3. Validez — une confirmation de second niveau (double approbation) est requise si configurée

> **Avertissement :** Le gel ou la levée de gel d'avoirs est une action réglementaire à haute sensibilité. Chaque opération est enregistrée dans l'audit trail de manière immuable et ne peut pas être annulée sans traçabilité.

### 4.5 Demande d'effacement RGPD

Le droit à l'effacement (article 17 du RGPD) permet à un client de demander la suppression de ses données personnelles, sous réserve des obligations de conservation légale (5 ans minimum pour les données AML/KYC selon la directive AMLD).

**Procédure :**

1. Sur la fiche client, menu **Actions > Demander effacement RGPD** (réservé compliance_officer et admin)
2. Le système vérifie automatiquement les conditions d'éligibilité :
   - Absence de dossier d'investigation ouvert
   - Absence de gel d'avoirs actif
   - Délai légal de conservation écoulé
3. Si éligible, les données PII sont anonymisées (pseudonymisation irréversible)
4. Les données AML/KYC statistiques sont conservées sous forme agrégée anonyme pour conformité réglementaire
5. Un justificatif d'effacement est généré et archivé

### 4.6 Consultation des UBO

Les bénéficiaires effectifs (Ultimate Beneficial Owners) sont accessibles depuis l'onglet **UBO** de la fiche d'un client CORPORATE.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BÉNÉFICIAIRES EFFECTIFS — SARL Atlas Trading                               │
├─────────────────────┬──────────────────┬─────────────┬───────────┬──────────┤
│ Nom                 │ Participation %  │ Nationalité │ Risque    │ PEP      │
├─────────────────────┼──────────────────┼─────────────┼───────────┼──────────┤
│ Mohammed Al-Rashid  │ 45%              │ AE          │ HIGH      │ Non      │
│ Fatima Atlas        │ 35%              │ MA          │ MEDIUM    │ Non      │
│ Trust BVI Holdings  │ 20%              │ VG          │ CRITICAL  │ —       │
└─────────────────────┴──────────────────┴─────────────┴───────────┴──────────┘
│ ⚠ Trust BVI Holdings : juridiction à risque (Îles Vierges Britanniques)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

Chaque UBO a sa propre fiche accessible en cliquant sur son nom. Le système alerte automatiquement si un UBO est lui-même identifié PEP ou si sa juridiction est à risque.

---

## 5. Traitement des Alertes LAB/FT

Le module Alertes (route `/alerts`) est le cœur opérationnel de la plateforme. C'est ici que les analystes LAB/FT travaillent au quotidien.

### 5.1 Comprendre les priorités

Chaque alerte est classée selon quatre niveaux de priorité :

| Priorité | Score associé | Couleur | Signification | SLA de traitement |
|----------|---------------|---------|---------------|-------------------|
| **LOW** | 0–25 | Vert | Indicateur de vigilance faible | 5 jours ouvrés |
| **MEDIUM** | 26–50 | Orange | Atypicité modérée, investigation recommandée | 2 jours ouvrés |
| **HIGH** | 51–75 | Rouge | Anomalie significative, traitement prioritaire | 8 heures ouvrées |
| **CRITICAL** | 76–100 | Rouge clignotant | Risque immédiat, action urgente requise | 2 heures |

> **Règle d'escalade automatique :** Une alerte CRITICAL déclenche automatiquement un email aux superviseurs, responsables conformité et administrateurs actifs sur la plateforme. Ne pas traiter une alerte CRITICAL dans les 2 heures déclenche une escalade au responsable de l'équipe.

### 5.2 Comprendre les types d'alertes

| Type | Description | Règles AML associées typiques |
|------|-------------|-------------------------------|
| **THRESHOLD** | Dépassement de seuil réglementaire | THRESHOLD_EXCEEDED, VOLUME_SPIKE |
| **PATTERN** | Comportement transactionnel suspect (pattern récurrent) | STRUCTURING, HIGH_FREQUENCY, HAWALA_PATTERN, MENA_STRUCTURING, CASH_INTENSIVE |
| **VELOCITY** | Fréquence anormale de transactions | HIGH_FREQUENCY, ROUND_AMOUNT |
| **FRAUD** | Indicateur de fraude potentielle | HIGH_RISK_COUNTRY, UNUSUAL_CHANNEL |
| **SANCTION** | Lien avec une entité sanctionnée | SANCTION_COUNTERPARTY |
| **SCREENING** | Résultat positif screening PEP/sanctions | PEP_TRANSACTION |

### 5.3 Workflow complet de traitement

```
                          TRANSACTION ANALYSÉE
                                  │
                           Moteur AML
                                  │
                    Règle(s) déclenchée(s) ?
                         /           \
                        Non           Oui
                         │             │
                    COMPLETED    Alerte créée
                                      │
                                   OPEN
                                      │
                           Analyste prend en charge
                                      │
                                 IN_REVIEW
                                      │
                    ┌─────────────────┼──────────────────┐
                    │                 │                  │
                    ▼                 ▼                  ▼
             FALSE_POSITIVE      CLOSED            SAR_SUBMITTED
              (faux positif)  (clôture normale)  (déclaration soupçon)
```

### 5.4 Consulter la file d'alertes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ALERTES                            [Filtres ▼]  [Assigner ▼]  [Export ▼] │
├─────────────────────────────────────────────────────────────────────────────┤
│  Statut : [OPEN ▼]  Priorité : [Tous ▼]  Type : [Tous ▼]  Analyste:[Tous]│
├──────────┬──────────┬──────────┬──────────┬─────────┬────────────┬──────────┤
│ ID       │ Client   │ Type     │ Priorité │ Score   │ Date       │ Assignée │
├──────────┼──────────┼──────────┼──────────┼─────────┼────────────┼──────────┤
│ALT-K9X2M │ KARIMI A │ SANCTION │ CRITICAL │ 90      │ 29/03 9h12 │ —       │
│ALT-H8W3T │ HASSAN M │ PATTERN  │ HIGH     │ 82      │ 29/03 8h45 │ Analyst1 │
│ALT-B4N7R │ BENALI F │ THRESHOLD│ HIGH     │ 60      │ 29/03 7h30 │ —       │
│ALT-D2M1P │ DUPONT J │ VELOCITY │ MEDIUM   │ 40      │ 28/03 16h  │ Analyst2 │
└──────────┴──────────┴──────────┴──────────┴─────────┴────────────┴──────────┘
```

La file est triée par défaut par priorité décroissante puis par date d'arrivée. Les alertes non assignées apparaissent en premier.

### 5.5 Prendre en charge une alerte

1. Cliquez sur une alerte de statut OPEN
2. Le détail de l'alerte s'affiche avec :
   - Informations sur le client et la transaction concernée
   - Liste des règles AML déclenchées avec leur score individuel
   - Historique du client (alertes précédentes, statut KYC)
   - Données d'enrichissement (pays de contrepartie, canal, etc.)
3. Cliquez sur **Prendre en charge** — l'alerte passe en statut IN_REVIEW et est assignée à votre compte
4. Commencez votre investigation

> **Bonne pratique :** Avant de prendre en charge une alerte, consultez le profil du client et ses alertes précédentes pour avoir une vision contextuelle. Une alerte isolée n'a pas la même portée qu'un pattern récurrent.

### 5.6 Assigner une alerte à un analyste

Un superviseur peut assigner des alertes à des analystes spécifiques :

1. Depuis la liste des alertes, cochez une ou plusieurs alertes
2. Cliquez sur **Assigner** en haut de la liste
3. Sélectionnez l'analyste dans la liste déroulante (seuls les utilisateurs avec le rôle analyst ou supérieur apparaissent)
4. Confirmez — les analystes concernés reçoivent une notification

### 5.7 Justifier un faux positif

Lorsqu'une alerte est identifiée comme un faux positif (transaction légitime mal détectée par le moteur AML), elle doit être clôturée avec une justification documentée.

**Procédure :**

1. Sur le détail de l'alerte, cliquez sur **Clôturer comme faux positif**
2. Sélectionnez la raison principale dans la liste déroulante :
   - Client régulier — comportement connu et documenté
   - Transaction professionnelle vérifiée
   - Salaire / virement régulier identifié
   - Opération immobilière documentée
   - Erreur de seuil — montant en devise étrangère
   - Autre (champ libre obligatoire)
3. Saisissez un commentaire détaillé obligatoire (minimum 50 caractères)
4. Si disponibles, attachez des pièces justificatives (relevés, contrats, etc.)
5. Validez — l'alerte passe en statut FALSE_POSITIVE

> **Important :** La raison et le commentaire sont obligatoires et non modifiables après validation. Ils sont enregistrés dans l'audit trail et peuvent être consultés lors d'un contrôle prudentiel. La qualité de la justification est un indicateur de qualité suivi par les superviseurs.

### 5.8 Escalader vers un superviseur

Lorsqu'une alerte dépasse les compétences ou le périmètre de décision de l'analyste, elle doit être escaladée.

1. Sur le détail de l'alerte, cliquez sur **Escalader**
2. Sélectionnez le superviseur destinataire
3. Rédigez un résumé de l'investigation conduite et du motif d'escalade
4. Confirmez — le superviseur reçoit une notification prioritaire

Motifs typiques d'escalade :
- Montant très élevé ou impact systémique potentiel
- Client PEP ou lié à une personnalité politique
- Doute sur la nécessité d'une déclaration de soupçon
- Besoin de gel d'avoirs conservatoire
- Demande de renseignements reçue d'une autorité

### 5.9 Créer un dossier (Case) depuis une alerte

Lorsqu'une alerte nécessite une investigation approfondie (plusieurs transactions liées, plusieurs clients impliqués, préparation d'une DS), il est nécessaire de créer un dossier d'investigation.

1. Sur le détail de l'alerte, cliquez sur **Créer un dossier**
2. Renseignez le titre du dossier et une description initiale
3. La transaction et l'alerte sont automatiquement liées au dossier
4. Vous pouvez ajouter d'autres alertes ou transactions au même dossier

### 5.10 Audit trail — Traçabilité des actions

Chaque action effectuée sur une alerte est enregistrée dans un audit trail immuable :

```
HISTORIQUE DE L'ALERTE — ALT-H8W3T

┌─────────────────┬──────────────────┬──────────────────────────────────────────┐
│ Date / Heure    │ Utilisateur      │ Action                                   │
├─────────────────┼──────────────────┼──────────────────────────────────────────┤
│ 29/03 08:45:12  │ Système          │ Alerte créée — HAWALA_PATTERN + STRUCTURING│
│ 29/03 09:02:33  │ analyst1@banque  │ Alerte prise en charge (IN_REVIEW)       │
│ 29/03 09:15:44  │ analyst1@banque  │ Consultation fiche client CL-001234     │
│ 29/03 09:22:10  │ analyst1@banque  │ Escalade → supervisor@banque             │
│ 29/03 09:45:30  │ supervisor@banq  │ Dossier CAS-2026-0042 créé              │
└─────────────────┴──────────────────┴──────────────────────────────────────────┘
```

L'audit trail est accessible aux rôles superviseur et supérieur. Il est conservé 10 ans conformément aux obligations légales.

---

## 6. Gestion des Dossiers d'Investigation (Cases)

### 6.1 Créer un dossier

Accédez au module via le menu **Dossiers** (route `/cases`).

Un dossier (Case) est une unité d'investigation regroupant plusieurs alertes, transactions et éléments de preuve relatifs à un même schéma de blanchiment ou de financement du terrorisme suspecté.

**Pour créer un dossier :**

1. Cliquez sur **+ Nouveau dossier**
2. Renseignez les informations initiales :
   - Titre du dossier (ex : "Structuring présumé — Famille Al-Rashid")
   - Description (contexte, hypothèse initiale)
   - Assignation à un analyste référent
   - Priorité initiale
3. Ajoutez les alertes et transactions concernées (recherche par ID)
4. Ajoutez les clients impliqués
5. Validez la création — un identifiant unique `CAS-AAAA-NNNN` est attribué

### 6.2 Timeline d'investigation

La vue principale d'un dossier est une timeline chronologique de toutes les actions d'investigation :

```
DOSSIER CAS-2026-0042 — Structuring présumé — Famille Al-Rashid
Analyste référent : analyst1@banque | Superviseur : supervisor@banque
Statut : IN_PROGRESS | Créé le : 29/03/2026

TIMELINE D'INVESTIGATION
─────────────────────────────────────────────────────────────────
▶ 29/03/2026 09:45 — Ouverture du dossier
   3 alertes liées : ALT-H8W3T, ALT-K9X2M, ALT-B4N7R
   2 clients impliqués : CL-001234 (Mohammed Hassan), CL-001236 (SARL Atlas)

▶ 29/03/2026 11:20 — Note d'investigation
   "Analyse des 6 derniers mois de transactions. Pattern de dépôts cash
    réguliers en agence suivi de virements vers AE et SA. Montants toujours
    inférieurs à 10 000€. Structure typique de MENA_STRUCTURING."

▶ 29/03/2026 14:05 — Document ajouté
   Relevés de compte jan-mars 2026 (12 pages, PDF)

▶ 30/03/2026 09:00 — Consultation screening
   Screening OFAC + PEP effectué : 0 match confirmé

▶ 30/03/2026 16:30 — Décision en attente validation superviseur
─────────────────────────────────────────────────────────────────
```

### 6.3 Décisions finales

À la clôture d'une investigation, deux décisions réglementaires sont possibles :

#### SAR_FILED — Déclaration de soupçon soumise

Lorsque l'investigation conclut à un soupçon fondé de blanchiment ou de FT :

1. Cliquez sur **Préparer une déclaration de soupçon**
2. L'outil de rédaction de DS s'ouvre avec les données du dossier pré-remplies
3. Complétez les champs obligatoires (description des faits, chronologie, montants)
4. Soumettez à la validation du superviseur
5. Après validation, la DS est exportée en PDF (archive interne) et en XML TRACFIN/GoAML pour transmission
6. Le dossier passe en statut SAR_FILED — plus aucune modification n'est possible

#### CLOSED_NO_ACTION — Clôture sans suite

Lorsque l'investigation conclut à l'absence de soupçon fondé :

1. Cliquez sur **Clôturer sans suite**
2. Rédigez une conclusion motivée (minimum 200 caractères)
3. Validez — le dossier passe en statut CLOSED_NO_ACTION
4. Toutes les notes d'investigation sont archivées et conservées 5 ans

### 6.4 Soumettre une DSAR à TRACFIN

La transmission d'une Déclaration de Soupçon à TRACFIN (France) ou à l'UTRF (Maroc) s'effectue depuis le dossier en statut SAR_FILED :

1. Vérifiez que l'export XML est correct (prévisualisation disponible)
2. Cliquez sur **Transmettre à TRACFIN**
3. En mode SIMULATION (défaut en non-production), la transmission est simulée et un accusé de réception fictif est généré
4. En mode PRODUCTION, le fichier XML est transmis via le canal sécurisé configuré
5. L'accusé de réception TRACFIN est automatiquement archivé dans le dossier

> **Important :** La transmission en mode PRODUCTION est irréversible et constitue un acte réglementaire engageant la responsabilité de l'établissement. Assurez-vous que le superviseur et le responsable conformité ont validé la déclaration avant transmission.

---

## 7. Screening Sanctions et PEP

### 7.1 Présentation du module

Le module Screening (route `/screening`) permet de vérifier si un client, un bénéficiaire effectif ou une contrepartie figure sur des listes de sanctions internationales ou dans les bases de données PEP.

**Listes de référence :**
- **OFAC SDN** (Office of Foreign Assets Control, US) — mise à jour quotidienne
- **Liste UE** (Union Européenne, Règlement 2580/2001 et suivants) — hebdomadaire
- **Liste ONU** (Conseil de sécurité, Comités 1267/1988/etc.) — hebdomadaire
- **Liste UK** (OFSI, après Brexit) — hebdomadaire
- **PEP OpenSanctions** (base internationale PEP en open data) — hebdomadaire
- **BAM/ANRF** (Bank Al-Maghrib / Autorité Nationale du Renseignement Financier, Maroc) — selon accord BAM

### 7.2 Lancer un screening manuel

1. Accédez au module **Screening**
2. Cliquez sur **Nouveau screening**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  NOUVEAU SCREENING MANUEL                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Nom :          [________________________]                                  │
│  Prénom :       [________________________]                                  │
│  Date naiss. :  [JJ/MM/AAAA]   Nationalité : [__]                          │
│                                                                              │
│  Listes à vérifier :                                                        │
│  [x] OFAC SDN    [x] Union Européenne    [x] Nations Unies                 │
│  [x] Royaume-Uni [x] PEP OpenSanctions   [ ] BAM/ANRF (si configuré)      │
│                                                                              │
│  [       Lancer le screening       ]                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

3. Les résultats s'affichent en quelques secondes (SLA P50 < 200ms)

### 7.3 Interpréter les résultats

Les résultats sont classés en trois catégories selon le score de similarité calculé par l'algorithme de matching fuzzy (Levenshtein + token set ratio) :

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  RÉSULTATS SCREENING — Mohammed Hassan                  Durée : 187ms       │
├─────────────────────────────────────────────────────────────────────────────┤
│  MATCHS POTENTIELS — À VÉRIFIER                                             │
├─────────────────┬──────────┬─────────────────┬─────────────────────────────┤
│ Entité          │ Score    │ Source          │ Statut                      │
├─────────────────┼──────────┼─────────────────┼─────────────────────────────┤
│ HASSAN Mohammed │ 95%      │ OFAC SDN        │ ⚠ MATCH — À confirmer      │
│ HASSAN Mohamed  │ 87%      │ EU Sanctions    │ ⚠ REVIEW — À examiner      │
│ Hasan Muhammad  │ 62%      │ UN Consolidated │ REVIEW — Score modéré      │
│ HASSAN Ahmad    │ 41%      │ OFAC SDN        │ CLEAR — Score insuffisant  │
└─────────────────┴──────────┴─────────────────┴─────────────────────────────┘
│  CLEAR (aucun match) sur : UK Sanctions, PEP OpenSanctions                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Interprétation des seuils :**

| Score | Catégorie | Signification | Action requise |
|-------|-----------|---------------|----------------|
| ≥ 80% | MATCH | Correspondance probable | Vérification manuelle obligatoire + validation superviseur |
| 50–79% | REVIEW | Correspondance possible | Examen approfondi recommandé |
| < 50% | CLEAR | Pas de correspondance | Aucune action requise |

### 7.4 Confirmer ou rejeter un match

Pour chaque entrée en catégorie MATCH ou REVIEW :

1. Cliquez sur l'entrée pour voir le détail complet de l'entité dans la liste de sanctions (date d'inscription, motif, aliases, etc.)
2. Comparez avec les informations du client (date de naissance, nationalité, pays de résidence)
3. Choisissez :
   - **Confirmer le match** : le client est effectivement la personne sanctionnée → déclenche une alerte CRITICAL et une procédure de gel
   - **Rejeter le match** : c'est une homonyme, les données ne correspondent pas → documentez le motif de rejet dans le champ commentaire
   - **Mettre en suspens** : besoin d'informations complémentaires → l'entrée reste en statut REVIEW en attente

> **Important :** La confirmation d'un match sur une liste de sanctions est une décision réglementaire grave. Elle ne peut être confirmée que par un superviseur ou un compliance_officer. Un simple analyste peut identifier un match et le soumettre à validation, mais ne peut pas confirmer définitivement.

### 7.5 Screening automatique

Le screening est également déclenché automatiquement :
- **À chaque nouvelle entrée en relation client** (onboarding KYC)
- **À chaque transaction** vers une contrepartie non déjà screenée (en temps réel, SLA P50 < 200ms)
- **Lors des mises à jour des listes** (screening différentiel des clients existants)
- **À chaque changement de statut KYC** d'un client

---

## 8. Transactions

### 8.1 Consulter les transactions

Accédez au module via le menu **Transactions** (route `/transactions`).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TRANSACTIONS                        [Filtres avancés ▼]   [Export CSV ▼]  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Période : [01/03/2026] → [29/03/2026]   Client : [___]   Montant : [___] │
│  Statut : [Tous ▼]  Canal : [Tous ▼]  Pays : [___]   Score risque : [___] │
├───────────┬──────────┬────────┬──────────┬─────────┬────────┬───────────────┤
│ ID        │ Client   │Montant │ Canal    │ Pays CP │ Statut │ Score risque  │
├───────────┼──────────┼────────┼──────────┼─────────┼────────┼───────────────┤
│TRX-A8K2M  │HASSAN M  │9 500€  │BRANCH    │AE       │FLAGGED │ 75 (HIGH)     │
│TRX-B3P9N  │BENALI F  │12 000€ │SEPA      │FR       │FLAGGED │ 60 (HIGH)     │
│TRX-C7W1Q  │DUPONT J  │850€    │CARD      │FR       │COMPLETE│ 0 (LOW)       │
│TRX-D4X5R  │KARIMI A  │150 000€│API       │IR       │BLOCKED │ 100 (CRIT.)   │
└───────────┴──────────┴────────┴──────────┴─────────┴────────┴───────────────┘
```

**Statuts des transactions :**

| Statut | Description |
|--------|-------------|
| **PENDING** | En attente de traitement — peut être bloquée manuellement |
| **COMPLETED** | Traitée, aucune règle déclenchée |
| **FLAGGED** | Traitée, une ou plusieurs règles AML déclenchées, alerte créée |
| **BLOCKED** | Bloquée manuellement ou automatiquement (client gelé, sanction) |

### 8.2 Détail d'une transaction

Cliquez sur une transaction pour accéder à son détail complet :

```
TRANSACTION TRX-A8K2M
─────────────────────────────────────────────────────────────────────────────
Montant      : 9 500,00 EUR
Date         : 29/03/2026 08:42:15 UTC
Client       : Mohammed Hassan (CL-001234)
Canal        : BRANCH (agence)
Contrepartie : ACME Trading LLC
Pays CP      : AE (Émirats Arabes Unis)
Statut       : FLAGGED
Score risque : 75

RÈGLES AML DÉCLENCHÉES :
┌─────────────────────┬───────┬──────────┬────────────────────────────────────┐
│ Règle               │ Score │ Priorité │ Raison                             │
├─────────────────────┼───────┼──────────┼────────────────────────────────────┤
│ MENA_STRUCTURING    │ 50    │ HIGH     │ 85% du seuil (9500/10000) vers AE │
│ HAWALA_PATTERN      │ 60    │ HIGH     │ Cash BRANCH + 4 tx/48h + MENA     │
│ ROUND_AMOUNT        │ 20    │ LOW      │ Montant 9500 — multiple de 500     │
└─────────────────────┴───────┴──────────┴────────────────────────────────────┘
Score total (plafonné à 100) : 75

ALERTES ASSOCIÉES : ALT-H8W3T
DOSSIER ASSOCIÉ   : CAS-2026-0042
```

### 8.3 Bloquer une transaction PENDING

Une transaction en statut PENDING (en cours de traitement) peut être bloquée manuellement avant exécution si un analyste identifie un risque immédiat :

1. Sur le détail de la transaction PENDING, cliquez sur **Bloquer cette transaction**
2. Sélectionnez le motif de blocage
3. Rédigez un commentaire justificatif
4. Confirmez — la transaction passe en statut BLOCKED et la contrepartie ne reçoit pas les fonds

> **Délai critique :** Le blocage d'une transaction PENDING doit être effectué dans la fenêtre de traitement définie par votre système de paiement. Passé ce délai, la transaction est irréversible. Consultez votre documentation interne pour les délais spécifiques à chaque canal.

---

## 9. pKYC — Surveillance Comportementale Continue

### 9.1 Présentation du module pKYC

Le module pKYC (Perpetual KYC) est accessible via le menu **pKYC** (route `/pkyc`, requiert le rôle analyst minimum). Il permet de surveiller en continu les comportements transactionnels de l'ensemble du portefeuille client, sans attendre la prochaine révision KYC périodique.

Le moteur pKYC s'exécute chaque nuit à **01:00 UTC** (configurable via `PKYC_CRON`). Il calcule un **score de dérive comportementale** (0–100) pour chaque client actif en comparant l'activité récente (7 derniers jours) à une baseline de référence (30 derniers jours).

### 9.2 Comprendre le score de dérive (0–100)

Le score de dérive agrège cinq facteurs comportementaux, chacun contribuant selon une pondération définie :

```
SCORE DE DÉRIVE = Somme pondérée des 5 facteurs (0-100)

┌───────────────────────┬──────────────┬────────────────────────────────────────┐
│ Facteur               │ Pondération  │ Ce qu'il mesure                        │
├───────────────────────┼──────────────┼────────────────────────────────────────┤
│ geoDrift              │ 30%          │ Nouveaux pays de contrepartie          │
│ volumeDrift           │ 25%          │ Variation du volume total de tx        │
│ frequencyDrift        │ 20%          │ Variation du nombre de transactions    │
│ amountSpike           │ 15%          │ Montant maximum de transaction         │
│ newCounterparties     │ 10%          │ Nouvelles contreparties non connues    │
└───────────────────────┴──────────────┴────────────────────────────────────────┘
```

**Interprétation du score de dérive :**

| Score | Signification | Action |
|-------|---------------|--------|
| 0–25 | Comportement stable — conforme au profil | Aucune action |
| 26–39 | Légère variation — à surveiller | Surveillance renforcée |
| 40–59 | Dérive modérée — révision KYC déclenchée | Revue KYC planifiée |
| 60–79 | Dérive significative — investigation | Revue prioritaire + alerte MEDIUM |
| 80–100 | Dérive critique — action immédiate | Alerte HIGH + revue urgente |

Le seuil de déclenchement de la révision KYC est configuré à **40** par défaut (`PKYC_DRIFT_THRESHOLD=40`).

### 9.3 Interpréter les facteurs individuels

#### geoDrift (30%) — Dérive géographique

Mesure l'apparition de nouveaux pays de contrepartie dans la fenêtre récente (7 jours) qui n'étaient pas présents dans la baseline (30 jours). C'est le facteur le plus pondéré car il représente l'indicateur de risque géographique le plus fort.

**Exemple :** Un client dont toutes les transactions précédentes concernaient la France et l'Espagne commence à envoyer des fonds vers le Maroc et les Émirats Arabes Unis → geoDrift élevé.

#### volumeDrift (25%) — Dérive de volume

Compare le volume total de transactions de la semaine récente (normalisé en volume journalier) au volume journalier moyen de la baseline. Une multiplication par 3 ou plus déclenche un score élevé.

**Exemple :** Un client dont le volume mensuel habituel est de 5 000€ réalise soudainement 45 000€ de transactions en une semaine → volumeDrift = score élevé.

#### frequencyDrift (20%) — Dérive de fréquence

Compare le nombre de transactions de la fenêtre récente au nombre moyen de la baseline. Mesure la cadence transactionnelle.

**Exemple :** Un client effectuant habituellement 3–4 transactions par semaine en réalise soudainement 25 → frequencyDrift élevé.

#### amountSpike (15%) — Pic de montant

Compare le montant maximum d'une transaction unique dans la fenêtre récente au montant maximum historique. Détecte les transactions isolées de montant inhabituel.

**Exemple :** Un client dont le ticket maximum historique est 2 000€ réalise une transaction de 18 000€ → amountSpike maximal.

#### newCounterparties (10%) — Nouvelles contreparties

Mesure la proportion de contreparties nouvelles (non vues dans la baseline) dans la fenêtre récente. Un nombre élevé de nouvelles contreparties inconnues peut indiquer l'ouverture de nouveaux canaux de blanchiment.

### 9.4 File d'attente de révision KYC

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  pKYC — RÉVISIONS EN ATTENTE                        Dernière analyse: 04h12│
├─────────────────────────────────────────────────────────────────────────────┤
│  47 clients avec score de dérive ≥ 40                                       │
├──────────┬─────────────────┬──────────┬──────────────────────┬──────────────┤
│ Client   │ Nom             │ Dérive   │ Facteur principal    │ Priorité     │
├──────────┼─────────────────┼──────────┼──────────────────────┼──────────────┤
│ CL-001234│ Hassan Mohammed │ 82       │ geoDrift (AE, SA)    │ URGENT       │
│ CL-001236│ SARL Atlas Trad │ 71       │ volumeDrift (+340%)  │ PRIORITAIRE  │
│ CL-001240│ Mbaye Cheikh    │ 55       │ newCounterparties    │ STANDARD     │
│ CL-001242│ Wang Li         │ 43       │ frequencyDrift (+180%)│ STANDARD    │
└──────────┴─────────────────┴──────────┴──────────────────────┴──────────────┘
```

Pour chaque client dans la file, vous pouvez :
- Consulter le détail du score et l'historique des facteurs
- Accéder directement à la fiche client pour initier la revue KYC
- Marquer la revue comme en cours ou complétée
- Voir les transactions récentes qui ont contribué à la dérive

### 9.5 Forcer une analyse immédiate (admin)

En cas d'urgence, un administrateur peut déclencher une analyse pKYC immédiate pour un client spécifique ou pour l'ensemble du portefeuille, sans attendre le batch nocturn :

1. Sur la fiche pKYC du client, ou depuis le panneau d'administration
2. Cliquez sur **Forcer l'analyse pKYC**
3. Confirmez — l'analyse s'exécute en arrière-plan (quelques secondes pour un client unique, plusieurs minutes pour le portefeuille complet)
4. Les résultats sont disponibles dans la file de révision

> **Note :** L'analyse forcée consomme des ressources serveur significatives pour les grands portefeuilles. Ne l'utilisez que si nécessaire et évitez de la déclencher en heures de pointe.

---

## 10. Rapports Réglementaires

### 10.1 Présentation du module Rapports

Le module Rapports (route `/reports`, requiert le rôle supervisor minimum) centralise la génération de tous les documents réglementaires produits par la plateforme.

**Types de rapports disponibles :**

| Rapport | Format | Fréquence | Destinataire |
|---------|--------|-----------|--------------|
| Rapport AML mensuel | PDF | Mensuel | Direction, contrôle interne |
| Déclaration de soupçon (DS/SAR) | PDF | À la demande | Archive interne |
| Export TRACFIN | XML (ONAF) | À la demande | TRACFIN (France) |
| Export GoAML | XML | À la demande | UTRF/ANRF (international) |

### 10.2 Générer un rapport AML mensuel

1. Accédez au module **Rapports**
2. Cliquez sur **Nouveau rapport**
3. Sélectionnez **Rapport AML mensuel**
4. Choisissez la période (sélection du mois)
5. Cliquez sur **Générer**

Le rapport est produit en quelques secondes (SLA P50 < 3s) et contient :
- Résumé exécutif : nombre de transactions analysées, alertes générées, faux positifs, DS transmises
- Distribution des alertes par priorité, type et règle AML
- Top 10 des clients à risque
- Évolution du taux de faux positifs
- Statistiques de screening
- Métriques de performance du système

6. Cliquez sur **Télécharger (PDF)** pour récupérer le document
7. Le rapport est automatiquement archivé dans le module avec un horodatage immuable

### 10.3 Générer une déclaration de soupçon (DS/SAR) en PDF

Les déclarations de soupçon sont générées depuis un dossier d'investigation (module Cases). Depuis le module Rapports, vous pouvez consulter et re-télécharger les DS déjà générées.

Pour générer une nouvelle DS :
1. Accédez au dossier d'investigation concerné (module **Dossiers**)
2. Cliquez sur **Préparer une déclaration de soupçon**
3. Complétez le formulaire structuré (conforme au format réglementaire)
4. Soumettez à validation du superviseur
5. Après validation, la DS est disponible en PDF dans le module Rapports

### 10.4 Export TRACFIN XML

L'export TRACFIN génère un fichier XML conforme au format ONAF (Organisation Nationale des Activités Financières) pour transmission à TRACFIN (France).

1. Dans le module Rapports, cliquez sur **Export TRACFIN**
2. Sélectionnez la ou les DS à inclure
3. Vérifiez la prévisualisation XML
4. Cliquez sur **Générer et télécharger**

> **Important :** Le fichier XML exporté contient des données personnelles sensibles. Il doit être transmis à TRACFIN uniquement via les canaux sécurisés agréés (portail Ermes ou équivalent). Ne jamais transmettre par email non chiffré.

### 10.5 Export GoAML XML

Le format GoAML (UNODC) est utilisé pour les déclarations à destination des CRF (Cellules de Renseignement Financier) utilisant ce standard (UTRF Maroc, etc.).

La procédure est identique à l'export TRACFIN. Sélectionnez le format **GoAML XML** lors de la génération.

### 10.6 Télécharger et archiver

Tous les rapports générés sont archivés automatiquement avec :
- Horodatage de génération
- Identité de l'utilisateur ayant généré le rapport
- Hash SHA-256 du document pour garantir l'intégrité

La liste des rapports archivés est accessible depuis le module Rapports, filtrée par type, période et utilisateur.

---

## 11. Administration

> **Accès restreint :** Le module Administration (route `/admin`) est exclusivement accessible aux utilisateurs avec le rôle admin.

### 11.1 Gestion des comptes utilisateurs

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ADMINISTRATION — UTILISATEURS              [+ Nouvel utilisateur]          │
├──────────────────────┬────────────────────────┬──────────┬──────────────────┤
│ Email                │ Nom                    │ Rôle     │ Statut          │
├──────────────────────┼────────────────────────┼──────────┼──────────────────┤
│ admin@banque.fr      │ Administrateur Système │ admin    │ Actif            │
│ compliance@banque.fr │ Marie Durand           │ compli.. │ Actif            │
│ supervisor@banque.fr │ Jean Martin            │ superv.. │ Actif            │
│ analyst1@banque.fr   │ Sophie Bernard         │ analyst  │ Actif            │
│ analyst2@banque.fr   │ Ahmed Karim            │ analyst  │ Inactif          │
└──────────────────────┴────────────────────────┴──────────┴──────────────────┘
```

**Créer un compte utilisateur :**
1. Cliquez sur **+ Nouvel utilisateur**
2. Renseignez email, nom complet, rôle
3. Le système génère un mot de passe temporaire et envoie un email d'activation
4. L'utilisateur doit changer son mot de passe à la première connexion et configurer le MFA

**Modifier un compte :**
1. Cliquez sur l'utilisateur à modifier
2. Modifiez le rôle ou le nom
3. Sauvegardez — les changements sont effectifs immédiatement

**Désactiver un compte :**
1. Cliquez sur l'utilisateur
2. Cliquez sur **Désactiver le compte**
3. Confirmez — le compte est désactivé immédiatement, toutes les sessions actives sont révoquées
4. Les données et l'audit trail de l'utilisateur sont conservés

> **Sécurité :** Ne supprimez jamais un compte utilisateur — désactivez-le uniquement. La suppression romprait l'audit trail des actions passées de cet utilisateur.

### 11.2 Configurer les règles AML

Accédez à la configuration des règles AML via le module **Règles AML** (route `/aml-rules`). La modification des paramètres est réservée aux administrateurs.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  RÈGLES AML — CONFIGURATION             [Mode: Visualisation ▼]            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Seuils réglementaires                                                       │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Seuil unique transaction :    [10 000] EUR  (AML_THRESHOLD_SINGLE_TX)      │
│  Seuil structuring :           [ 3 000] EUR  (AML_THRESHOLD_STRUCTURING)    │
│  Fenêtre structuring :         [    24] heures                               │
│  Seuil fréquence :             [    10] tx/24h                               │
│  Seuil variation volume :      [   300] %                                    │
│                                                                              │
│  Screening                                                                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Seuil de match :              [    80] % (SCREENING_MATCH_THRESHOLD)        │
│  Seuil de revue :              [    50] % (SCREENING_REVIEW_THRESHOLD)       │
│                                                                              │
│  pKYC                                                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Seuil de déclenchement :      [    40] / 100 (PKYC_DRIFT_THRESHOLD)        │
│  Fenêtre baseline :            [    30] jours                                │
│  Fenêtre d'analyse :           [     7] jours                                │
│                                                                              │
│  [  Sauvegarder la configuration  ]   [  Annuler  ]                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **Procédure de changement obligatoire :** Tout changement de seuil doit faire l'objet d'un backtesting sur les données historiques des 90 derniers jours avant mise en production. Un rapport d'impact doit être validé par le responsable conformité. Voir la Méthodologie du Moteur de Risque pour le détail de la procédure.

### 11.3 Consulter les logs d'audit système

Les logs d'audit système sont accessibles depuis le panneau d'administration :

```
LOGS D'AUDIT SYSTÈME — 29/03/2026

┌──────────────────┬──────────────────┬──────────────────┬──────────────────────┐
│ Horodatage       │ Utilisateur      │ Action           │ Détail               │
├──────────────────┼──────────────────┼──────────────────┼──────────────────────┤
│ 2026-03-29 09:12 │ admin@banque.fr  │ CONFIG_CHANGE    │ AML_THRESHOLD: 10000 │
│ 2026-03-29 08:45 │ analyst1@banque  │ ALERT_REVIEWED   │ ALT-H8W3T → REVIEW  │
│ 2026-03-29 07:30 │ supervisor@banq  │ CASE_CREATED     │ CAS-2026-0042        │
│ 2026-03-29 04:12 │ SYSTEM/pKYC      │ BATCH_COMPLETED  │ 1284 clients analysés│
│ 2026-03-29 02:00 │ SYSTEM/Screening │ LISTS_UPDATED    │ OFAC+EU+UN rafraîchis│
└──────────────────┴──────────────────┴──────────────────┴──────────────────────┘
```

Les logs sont filtrables par utilisateur, type d'action et période. Ils sont conservés 10 ans et ne peuvent pas être supprimés ou modifiés, même par un administrateur.

---

## 12. Raccourcis Clavier et Astuces

### Raccourcis globaux

| Raccourci | Action |
|-----------|--------|
| **Alt+D** | Aller au tableau de bord |
| **Alt+A** | Aller aux alertes |
| **Alt+C** | Aller aux clients |
| **Alt+T** | Aller aux transactions |
| **Alt+S** | Aller au screening |
| **Ctrl+K** (Cmd+K sur Mac) | Barre de recherche rapide globale |
| **Ctrl+Shift+L** | Déconnexion rapide |
| **Escape** | Fermer la fenêtre/modal en cours |
| **?** | Afficher cette liste de raccourcis |

### Navigation dans les listes

| Raccourci | Action |
|-----------|--------|
| **↑ / ↓** | Naviguer dans la liste |
| **Entrée** | Ouvrir l'élément sélectionné |
| **Shift+Click** | Sélection multiple |
| **Ctrl+A** | Tout sélectionner (page courante) |

### Astuces d'utilisation

**Recherche rapide globale (Ctrl+K) :** Tapez n'importe quel ID de client, transaction ou alerte pour y accéder directement sans naviguer dans les menus.

**Filtres persistants :** Les filtres que vous appliquez dans les listes sont mémorisés pendant votre session. Cliquez sur **Réinitialiser les filtres** pour revenir à l'affichage par défaut.

**Mode sombre :** Disponible via le menu utilisateur en haut à droite. Recommandé pour les longues sessions de travail.

**Notifications en temps réel :** La cloche en haut à droite affiche les notifications non lues. Les alertes CRITICAL déclenchent également une notification sonore si votre navigateur le permet.

---

## 13. FAQ / Problèmes Fréquents

**Q : Je ne reçois pas l'email de réinitialisation de mot de passe.**
R : Vérifiez votre dossier spam/courrier indésirable. Si l'email n'arrive pas dans les 10 minutes, contactez votre administrateur système. Assurez-vous que l'adresse email utilisée est bien votre email professionnel enregistré dans la plateforme.

**Q : Mon code TOTP est refusé alors qu'il est correct.**
R : Vérifiez que l'heure de votre téléphone est bien synchronisée (activez la synchronisation automatique de l'heure dans les paramètres). Un décalage de plus de 30 secondes invalide les codes TOTP. Si le problème persiste, utilisez un code de récupération et reconfigurez votre application TOTP.

**Q : Je n'arrive pas à clôturer une alerte comme faux positif.**
R : Vérifiez que vous avez bien renseigné un commentaire d'au moins 50 caractères. Si le bouton est grisé, cela indique que votre rôle n'a pas les droits nécessaires — contactez votre superviseur.

**Q : Le screening d'un client ne se lance pas.**
R : Si le message "Listes de sanctions non disponibles" s'affiche, les listes n'ont pas été mises à jour depuis plus de 36 heures (seuil SCREENING_STALE_THRESHOLD_HOURS). Contactez votre administrateur pour vérifier la connectivité aux sources de listes.

**Q : Le rapport PDF ne se génère pas.**
R : La génération peut prendre jusqu'à 15 secondes pour les grandes périodes. Si le rapport n'est pas disponible après 30 secondes, actualisez la page et vérifiez la liste des rapports archivés — il a peut-être déjà été généré. Si l'erreur persiste, contactez le support technique.

**Q : Je vois des alertes que je n'ai pas créées et qui me sont assignées.**
R : Les alertes peuvent être assignées par un superviseur. Consultez l'audit trail de l'alerte pour voir qui l'a assignée et pourquoi. Si vous estimez que l'assignation est incorrecte, contactez votre superviseur.

**Q : Le score pKYC d'un client est très élevé mais ses transactions semblent normales.**
R : Le score pKYC compare l'activité récente à la baseline des 30 derniers jours. Si le client a eu une période d'inactivité suivie d'une reprise normale, cela peut générer un faux score élevé. Examinez le détail des 5 facteurs pour identifier le contributeur principal et évaluez le contexte métier du client.

**Q : Je ne peux pas voir le module pKYC dans mon menu.**
R : L'accès au module pKYC requiert le rôle analyst minimum. Si votre rôle est "user", contactez votre administrateur pour une éventuelle élévation de rôle.

**Q : Comment savoir si ma session est sur le point d'expirer ?**
R : Une bannière d'avertissement apparaît 5 minutes avant l'expiration automatique de la session (30 minutes d'inactivité). Cliquez sur **Continuer la session** pour prolonger votre connexion sans perdre votre travail en cours.

**Q : Que se passe-t-il si je clique par erreur sur "Confirmer le match" pour un screening ?**
R : La confirmation d'un match sanctions est une action irréversible qui déclenche une alerte CRITICAL et une procédure de gel. Contactez immédiatement votre superviseur et le responsable conformité pour initier une procédure de correction. Chaque étape sera documentée dans l'audit trail.

---

*Document produit par l'équipe Conformité & Produit — KYC/AML Platform v2.5*
*Révision suivante prévue : septembre 2026*
*Pour toute question : support@kyc-aml-platform.fr*
