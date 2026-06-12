# Plan de Test — KYC-AML Platform v2.5
## Préparation Démo Investisseur

> **Date** : Mai 2026
> **Environnement** : Local (localhost)
> **Comptes de test** : Voir section Prérequis

---

## Prérequis — Comptes de démonstration

| Rôle | Email | Mot de passe | Permissions |
|------|-------|-------------|-------------|
| Administrateur | admin@labft.ma | Admin2026!LabFT | Accès total |
| Analyste | analyste@labft.ma | Analyst2026! | KYC, transactions, alertes |
| Superviseur | superviseur@labft.ma | Superv2026! | + validation, escalade |
| Compliance Officer | compliance@labft.ma | Compli2026! | + rapports, dual control |

---

## MODULE 1 — Authentification & Sécurité

### 1.1 Connexion standard

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur http://localhost:5173/login | Page de connexion affichée avec logo WatchReg | |
| 2 | Saisir email: `analyste@labft.ma` + password: `Analyst2026!` | Champs acceptés | |
| 3 | Cliquer "Se connecter" | Redirection vers Dashboard | |
| 4 | Vérifier le nom affiché dans la sidebar | "Youssef BENALI" affiché | |

### 1.2 Protection par rôle

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Connecté en analyste, aller sur http://localhost:5173/admin | Redirection vers Dashboard (accès refusé) | |
| 2 | Connecté en analyste, aller sur http://localhost:5173/amld6 | Redirection vers Dashboard | |
| 3 | Se connecter en admin, aller sur /admin | Page Administration accessible | |

### 1.3 Sécurité — tentatives échouées

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Saisir un mauvais mot de passe 3 fois | Message d'erreur "Identifiants incorrects" | |
| 2 | Essayer 10 fois | Message "Trop de tentatives — réessayez dans 15 minutes" | |

---

## MODULE 2 — Dashboard

### 2.1 Dashboard Opérationnel (onglet par défaut)

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Se connecter en analyste | Dashboard affiché | |
| 2 | Observer les KPI cards | 6 cartes: Clients HIGH/CRITICAL, Alertes ouvertes, Dossiers ouverts, Tx FLAGGED, Score risque moyen, STR/SAR | |
| 3 | Observer le graphique tendances | Courbe 30 jours des alertes/transactions suspectes | |
| 4 | Observer la distribution des risques | Donut LOW/MEDIUM/HIGH/CRITICAL avec %age | |
| 5 | Observer les alertes récentes | Liste 5 dernières alertes avec priorité colorée | |
| 6 | Cliquer sur une alerte récente | Navigation vers /alerts | |

### 2.2 Dashboard Direction — ComCo (onglet "Direction")

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Cliquer sur onglet "Direction — ComCo" | Vue KPI direction affichée | |
| 2 | Observer KPI "Couverture KYC" | Valeur en % avec cible ≥ 95% (badge vert/rouge) | |
| 3 | Observer KPI "STR déposées YTD" | Nombre de rapports soumis depuis 1er janvier | |
| 4 | Observer KPI "Délai moyen STR" | Valeur en jours avec cible ≤ 5 jours | |
| 5 | Observer KPI "Alertes CRITICAL" | Nombre d'alertes CRITICAL ouvertes | |
| 6 | Observer tableau Screening | Liste des sanctions avec statut PENDING | |

---

## MODULE 3 — Workflow KYC Complet

### 3.1 Liste des clients

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur /customers | Liste de 20 clients avec KPI bar (Total, APPROVED, PENDING, HIGH, CRITICAL) | |
| 2 | Filtrer par risque "CRITICAL" | 2 clients affichés: Hassan QADIRI + SHELL HOLDINGS BVI | |
| 3 | Filtrer par statut KYC "IN_REVIEW" | Clients en cours de vérification | |
| 4 | Rechercher "QADIRI" | Hassan QADIRI trouvé avec badge CRITICAL | |
| 5 | Cliquer "Créer un client" | Modale de création ouverte | |
| 6 | Remplir: Prénom "Test", Nom "Démo", Type "INDIVIDUAL" | Formulaire accepté | |
| 7 | Valider | Client créé, liste rafraîchie | |

### 3.2 Profil client — Hassan QADIRI (client CRITICAL)

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Cliquer sur Hassan QADIRI | Page CustomerDetail ouverte | |
| 2 | Onglet "Profil" | Informations: Résidence UAE, Score 91/100, CRITICAL, Sanctionné REVIEW | |
| 3 | Voir les notes | "Transactions multiples vers juridictions à risque." | |
| 4 | Cliquer "Calculer score risque" | Score recalculé en temps réel, badge mis à jour | |

### 3.3 Documents KYC

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Sur CustomerDetail, onglet "Documents" | Section upload + liste documents | |
| 2 | Sélectionner type "PASSPORT" | Menu déroulant fonctionnel | |
| 3 | Glisser un fichier JPG/PDF dans la zone | Barre de progression affichée | |
| 4 | Attendre upload | Message "Document uploadé avec succès" + carte document affichée | |
| 5 | Connecté en superviseur — cliquer "Vérifier manuellement" | Statut → VERIFIED, badge vert | |
| 6 | Cliquer "Rejeter" sur un autre document | Statut → FAILED, badge rouge | |

### 3.4 Scoring pKYC (Periodic KYC)

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Sur CustomerDetail, onglet "pKYC" | Section "Scoring pKYC — Dérive comportementale" | |
| 2 | Cliquer "Lancer le scoring" | Spinner + calcul en cours | |
| 3 | Résultat affiché | Cards: Score dérive, Revue déclenchée (OUI/NON), Client ID | |
| 4 | Observer historique | Tableau dates/scores sur 30 jours | |

### 3.5 UBO — Bénéficiaire effectif

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Sur CustomerDetail, onglet "UBO" | Liste des bénéficiaires + bouton "Ajouter UBO" | |
| 2 | Cliquer "Ajouter UBO" | Modale avec champs Nom, Nationalité, % participation, PEP | |
| 3 | Remplir et valider | UBO ajouté à la liste | |

### 3.6 Gel de compte (Supervision)

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Connecté en superviseur, sur profil QADIRI | Bouton "Geler le compte" visible | |
| 2 | Saisir raison: "Investigation en cours — gel préventif" | Champ accepté | |
| 3 | Confirmer | Badge "FROZEN" affiché, bouton devient "Dégeler" | |

---

## MODULE 4 — Transactions

### 4.1 Liste des transactions

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur /transactions | Liste paginée avec KPI (Total, FLAGGED, BLOCKED, Montant total) | |
| 2 | Filtrer par statut "FLAGGED" | Transactions suspectes (rouge/orange) | |
| 3 | Filtrer par type "TRANSFER" | Virements uniquement | |
| 4 | Filtrer "Suspectes uniquement" | Transactions avec isSuspicious=true | |
| 5 | Cliquer sur une transaction | Modale détail: montant, contrepartie, pays, score risque, raison | |

### 4.2 Création manuelle de transaction

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Cliquer "Créer transaction" | Modale de création | |
| 2 | Saisir: Client #1, Montant 50000 MAD, Type TRANSFER, Canal ONLINE | Formulaire rempli | |
| 3 | Valider | Transaction créée, score risque calculé automatiquement | |
| 4 | Si montant > 10 000 MAD | Alerte AML automatiquement créée (visible dans /alerts) | |

### 4.3 Webhook CBS (Core Banking Simulation)

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Ouvrir http://localhost:5173/cbs (sans auth) | Page simulateur CBS | |
| 2 | Sélectionner un client dans la liste | Client affiché | |
| 3 | Saisir montant 485000 MAD, type TRANSFER, pays BVI | Formulaire prêt | |
| 4 | Cliquer "Envoyer webhook" | Réponse JSON avec transactionId + riskScore | |
| 5 | Aller sur /alerts | Nouvelle alerte CRITICAL créée automatiquement | |

---

## MODULE 5 — Alertes AML

### 5.1 Tableau des alertes

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur /alerts | 6+ alertes avec KPI bar | |
| 2 | Filtrer CRITICAL | 2 alertes: QADIRI + SHELL | |
| 3 | Filtrer statut "OPEN" | Alertes non traitées | |
| 4 | Observer l'alerte QADIRI | Priorité CRITICAL, score 94, scénario "HIGH_AMOUNT + STRUCTURING" | |

### 5.2 Traitement d'une alerte

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Cliquer sur alerte QADIRI | Modale détail: transaction liée, raison, historique client | |
| 2 | Cliquer "Assigner à moi" | Alerte assignée à l'utilisateur connecté | |
| 3 | Saisir note de résolution | Champ texte disponible | |
| 4 | Cliquer "Résoudre — Escalader" | Statut → ESCALATED | |
| 5 | Sur alerte CHRAIBI (faux positif), cliquer "Faux positif" | Statut → FALSE_POSITIVE, compteur mis à jour | |

---

## MODULE 6 — Dossiers d'Investigation

### 6.1 Liste des dossiers

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur /cases | 4 dossiers avec KPI (Total, Ouverts, En approbation, CRITICAL, Clôturés) | |
| 2 | Filtrer CRITICAL | Dossier QADIRI + SHELL | |
| 3 | Cliquer sur dossier QADIRI | Page CaseDetail avec timeline | |

### 6.2 Création d'un dossier

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Cliquer "Ouvrir un dossier" | Modale de création | |
| 2 | Saisir: Client #2, Titre "Surveillance renforcée", Sévérité HIGH | Formulaire valide | |
| 3 | Valider | Dossier créé, visible dans la liste | |

### 6.3 Workflow dossier complet

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Sur dossier UNDER_INVESTIGATION | Bouton "4-yeux" visible (si compliance officer) | |
| 2 | Cliquer "4-yeux" | Confirmation "Soumettre pour Dual Control ?" | |
| 3 | Confirmer | Approval request créée → visible dans /approvals | |
| 4 | Aller sur /approvals en tant qu'autre compliance officer | Demande PENDING visible | |
| 5 | Approuver la demande | Statut → APPROVED | |

---

## MODULE 7 — Screening Sanctions

### 7.1 Screening d'un client

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur /screening | Page multi-onglets: Recherche, Batch, Pending, Listes, Personnalisé | |
| 2 | Onglet "Recherche" — saisir "Hassan QADIRI" | Résultats de matching | |
| 3 | Observer match score | Match 58% sur OFAC SDN List | |
| 4 | Cliquer "Confirmer match" | Décision → CONFIRMED | |

### 7.2 Résultats en attente

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Onglet "Pending" | Résultats SHELL (72%) + QADIRI (58%) affichés | |
| 2 | Sur Shell 72% — cliquer "Rejeter" | Décision → DISMISSED | |
| 3 | Sur QADIRI — cliquer "Escalader" | Décision → ESCALATED, dossier créé | |

### 7.3 Santé des listes

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Onglet "Listes" | Santé des listes OFAC/EU/UN/UK/PEP avec dernière mise à jour | |
| 2 | Observer statut | Vert (< 36h) ou Ambre/Rouge (stale) | |

---

## MODULE 8 — Rapports SAR/STR

### 8.1 Liste des rapports

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur /reports | 4 rapports: SAR QADIRI (SUBMITTED), STR SHELL (REVIEW), SAR ATLAS (DRAFT), SAR HAFIDI (APPROVED) | |
| 2 | Observer KPI | Total, DRAFT, REVIEW, SUBMITTED, APPROVED | |
| 3 | Filtrer par type SAR | 3 SAR affichés | |
| 4 | Filtrer par statut DRAFT | 1 rapport: SAR ATLAS | |

### 8.2 Création d'un SAR

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Cliquer "Nouveau rapport" | Onglets SAR / STR | |
| 2 | Onglet SAR — sélectionner client Hassan QADIRI | Client trouvé | |
| 3 | Saisir titre, type de suspicion, description | Formulaire rempli | |
| 4 | Valider | Rapport créé en DRAFT avec ID SAR-XXXXXXXXXX | |

### 8.3 Workflow validation SAR

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Sur SAR ATLAS (DRAFT) — cliquer "Soumettre" | Statut → REVIEW | |
| 2 | Sur même rapport — cliquer "4-yeux" (si compliance officer) | Approval request créée | |
| 3 | Aller sur /approvals | Demande SAR_TRANSMIT visible | |
| 4 | Connecté en autre compte compliance — approuver | Statut APPROVED, rapport peut être transmis | |

### 8.4 Suivi ANRF

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Cliquer sur SAR QADIRI (SUBMITTED) — "Voir détail" | Section "Suivi ANRF" visible | |
| 2 | Observer statut | ANRF/2026/00127 — ACCUSEE (badge bleu) | |
| 3 | Cliquer "Modifier suivi ANRF" | Formulaire: statut dropdown + référence + date dépôt | |
| 4 | Changer statut → CLASSEE | Mis à jour, badge change | |

---

## MODULE 9 — Dual Control (F6)

### 9.1 Liste des demandes

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Connecté en compliance@labft.ma — aller sur /approvals | 4 demandes visibles: 2 PENDING, 1 APPROVED, 1 REJECTED | |
| 2 | KPI bar | Compteurs par statut colorés | |
| 3 | Filtrer "En attente" | 2 demandes affichées avec badge orange "En attente" | |
| 4 | Filtrer action "SAR_TRANSMIT" | Demandes de transmission SAR uniquement | |

### 9.2 Principe des 4 yeux — validation

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Connecté en superviseur@labft.ma | Créer une approval request depuis /reports (bouton 4-yeux) | |
| 2 | Se connecter en compliance@labft.ma — aller sur /approvals | Demande PENDING visible | |
| 3 | Cliquer sur la demande — développer | Note du demandeur + boutons Approuver/Rejeter | |
| 4 | Cliquer "Approuver" | Dialog de confirmation: "Confirmer la décision : APPROUVER ?" | |
| 5 | Saisir note: "Documents vérifiés — validation autorisée" | Note enregistrée | |
| 6 | Confirmer | Statut → APPROVED, badge vert | |

### 9.3 Blocage auto-approbation

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Connecté en compliance@labft.ma — créer une demande | Demande créée | |
| 2 | Sur la même demande — tenter d'approuver | Message: "Principe des 4 yeux — vous ne pouvez pas approuver votre propre demande" | |

---

## MODULE 10 — Règles AML

### 10.1 Liste des règles

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur /aml-rules (compte analyste min.) | Règles avec catégories, status ACTIVE/INACTIVE/TESTING | |
| 2 | Observer graphique de performance | Courbe taux de déclenchement 30 jours | |
| 3 | Filtrer par catégorie "THRESHOLD" | Règles de seuil monétaire | |

### 10.2 Simulateur de règle

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Cliquer sur une règle — onglet Simulateur | Formulaire de test | |
| 2 | Saisir transaction fictive: 50 000 MAD, TRANSFER, pays: BVI | Paramètres saisis | |
| 3 | Cliquer "Tester" | Résultat: DÉCLENCHÉ / NON DÉCLENCHÉ + score | |

### 10.3 Création d'une règle

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Cliquer "Nouvelle règle" | Builder visuel avec conditions AND/OR | |
| 2 | Ajouter condition: amount > 10000 | Condition ajoutée | |
| 3 | Ajouter condition: country IN ["BVI", "KY"] | Deuxième condition | |
| 4 | Prévisualiser JSON | Arbre de conditions affiché | |
| 5 | Enregistrer | Règle créée en statut TESTING | |

---

## MODULE 11 — Administration

### 11.1 Gestion des utilisateurs

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Connecté en admin — aller sur /admin | 3 onglets: Utilisateurs, Audit Trail, ML / Scoring | |
| 2 | Onglet Utilisateurs | Liste des 5 utilisateurs avec rôles | |
| 3 | Cliquer "Inviter un utilisateur" | Formulaire: email + rôle | |
| 4 | Remplir et valider | Token d'invitation généré | |
| 5 | Changer le rôle d'un utilisateur | Menu déroulant rôle modifiable | |
| 6 | Désactiver un compte | Toggle isActive → false | |

### 11.2 Audit Trail

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Onglet "Audit Trail" ou /audit (superviseur min.) | Log de toutes les actions horodatées | |
| 2 | Filtrer par action "AUTH_LOGIN" | Connexions des utilisateurs | |
| 3 | Filtrer par utilisateur | Actions d'un utilisateur spécifique | |
| 4 | Cliquer "Exporter CSV" | Fichier audit-log.csv téléchargé | |

### 11.3 Contrôles ML

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Onglet "ML / Scoring" | Statut du modèle, dernière date d'entraînement | |
| 2 | Observer métriques | Précision, rappel, F1-score du modèle | |
| 3 | Cliquer "Forcer réentraînement" | Job lancé, status: TRAINING | |

---

## MODULE 12 — Documents KYC (page globale)

### 12.1 Recherche par client

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur /documents | Champ recherche client ID | |
| 2 | Saisir l'ID d'un client (ex: 1) | Documents affichés en cartes | |
| 3 | Voir les checks eKYC | Liste des vérifications OCR + biométrie | |
| 4 | Voir score OCR | Score de confiance 0-100 | |
| 5 | Cliquer "Voir document" | Viewer PDF/Image intégré | |

---

## MODULE 13 — Réseau d'Analyse

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur /network | Graphe de relations clients/transactions | |
| 2 | Observer les nœuds | Clients reliés par transactions | |
| 3 | Cliquer sur un nœud | Détail du nœud + transactions liées | |

---

## MODULE 14 — pKYC Monitoring Global

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur /pkyc | Vue globale des scores de dérive | |
| 2 | Observer les clients avec dérive élevée | Badge rouge si dérive > 40 | |
| 3 | Filtrer par seuil de dérive | Résultats filtrés | |

---

## MODULE 15 — SLA Monitoring

| Étape | Action | Résultat attendu | ✓/✗ |
|-------|--------|-----------------|------|
| 1 | Aller sur /sla | Métriques SLA: délais alerte, investigation, rapport | |
| 2 | Observer les breaches | Alertes dépassant les délais réglementaires | |
| 3 | Observer tendances | Graphique performance sur 30 jours | |

---

## SCÉNARIOS DE DÉMONSTRATION END-TO-END

### Scénario A — Détection et Traitement AML Complet (12 min)

```
Étape 1 : Dashboard → montrer les KPIs (30 sec)
Étape 2 : /cbs → simuler une transaction suspecte 485 000 MAD vers BVI (1 min)
Étape 3 : /alerts → alerte CRITICAL apparaît automatiquement (30 sec)
Étape 4 : Ouvrir l'alerte → assigner → escalader vers dossier (1 min)
Étape 5 : /cases → ouvrir le dossier → ajouter findings (2 min)
Étape 6 : /reports → créer SAR → remplir contenu → soumettre (3 min)
Étape 7 : /approvals → dual control → approuver (2 min)
Étape 8 : /audit → montrer la piste d'audit complète (1 min)
```

**Message clé** : "De la détection automatique à la transmission réglementaire, tout est tracé et validé."

---

### Scénario B — Onboarding Client et Scoring de Risque (8 min)

```
Étape 1 : /customers → créer nouveau client (Rachid BENSOUDA clone) (1 min)
Étape 2 : CustomerDetail → uploader un document PASSPORT (1 min)
Étape 3 : Observer OCR + eKYC en cours → vérifier manuellement (1 min)
Étape 4 : Onglet Screening → lancer un screening (1 min)
Étape 5 : Onglet pKYC → lancer scoring (30 sec)
Étape 6 : Calculer score de risque → voir score mis à jour (1 min)
Étape 7 : Dashboard Direction → voir KPIs mis à jour (1 min)
```

**Message clé** : "KYC digital de bout en bout avec scoring ML en temps réel."

---

### Scénario C — Conformité Réglementaire BAM (5 min)

```
Étape 1 : /screening → montrer les listes OFAC/EU/ONU/BAM (1 min)
Étape 2 : /aml-rules → montrer les règles BAM configurées + simulateur (2 min)
Étape 3 : /amld6 → rapport AMLD6 exportable (1 min)
Étape 4 : /bam → rapports BAM mensuels/trimestriels/annuels (1 min)
```

**Message clé** : "Conformité BAM et AMLD6 out-of-the-box."

---

## RÉSULTATS ATTENDUS PAR FONCTIONNALITÉ

| Fonctionnalité | Status | Données démo disponibles |
|----------------|--------|--------------------------|
| Login / Auth | ✅ Fonctionnel | 4 comptes multi-rôles |
| Dashboard Opérationnel | ✅ Fonctionnel | KPIs en temps réel |
| Dashboard Direction | ✅ Fonctionnel | KPIs BAM calculés |
| Liste Clients | ✅ Fonctionnel | 20 clients variés |
| Détail Client (profil, risk) | ✅ Fonctionnel | 8 profils réalistes |
| Documents KYC | ✅ Fonctionnel | Upload + vérif. |
| pKYC tab | ✅ Fonctionnel | Run manuel + historique |
| UBO Management | ✅ Fonctionnel | Ajout/liste |
| Gel de compte | ✅ Fonctionnel | Superviseur requis |
| Transactions | ✅ Fonctionnel | 22 transactions |
| CBS Simulator (webhook) | ✅ Fonctionnel | Sans auth, public |
| Alertes | ✅ Fonctionnel | 8 alertes (CRITICAL → FALSE_POSITIVE) |
| Dossiers | ✅ Fonctionnel | 4 dossiers réalistes |
| Screening | ✅ Fonctionnel | 6 résultats (2 PENDING) |
| Rapports SAR/STR | ✅ Fonctionnel | 4 rapports (tous statuts) |
| Dual Control (4-yeux) | ✅ Fonctionnel | 4 approval requests |
| Suivi ANRF | ✅ Fonctionnel | Référence + statut |
| Règles AML + Simulateur | ✅ Fonctionnel | Règles BAM par défaut |
| Administration | ✅ Fonctionnel | Gestion users + ML |
| Audit Trail | ✅ Fonctionnel | Export CSV |
| SLA Monitoring | ✅ Fonctionnel | Métriques calculées |
| Documents Page globale | ✅ Fonctionnel | Recherche par client |
| Réseau d'analyse | ⚠️ Partiel | Graphe de base |
| pKYC Page globale | ⚠️ Partiel | Vues disponibles |
| Correspondent Banking | ⚠️ Partiel | Module F1 en cours |
| CBS SDK TypeScript | ⚠️ Partiel | Module F5 en cours |

---

## CHECKLIST FINALE AVANT DÉMO

- [ ] `docker compose up -d` OK (postgres + redis healthy)
- [ ] `pnpm dev:all` démarré sans erreur
- [ ] `pnpm tsx drizzle/seed.demo.ts` exécuté avec succès
- [ ] Login admin@labft.ma OK
- [ ] Dashboard affiche des données (pas de NaN ou "—")
- [ ] /alerts : 8 alertes visibles
- [ ] /reports : 4 rapports visibles
- [ ] /approvals : 2 demandes PENDING visibles
- [ ] CBS Simulator accessible sur http://localhost:5173/cbs sans login
- [ ] Tester upload d'un document sur CustomerDetail
- [ ] Tester Dual Control avec 2 comptes différents
