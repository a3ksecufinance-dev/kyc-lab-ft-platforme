# Script Démo C — Workflow End-to-End
## Audience : Banque / Régulateur BAM / Compliance Officer
## Durée cible : 12–15 minutes
## Fil rouge : Un virement suspect de 485 000 MAD depuis Hassan QADIRI (Dubai) vers les BVI déclenche l'ensemble de la chaîne de traitement jusqu'à la transmission ANRF.

---

## PRÉREQUIS AVANT D'APPUYER SUR "REC"

```bash
pnpm tsx drizzle/seed.demo.ts --reset
pnpm dev:all
# Navigateur : vider session, ouvrir http://localhost:5173/login
# Avoir deux fenêtres de navigateur prêtes (ou deux profils)
#   Fenêtre A : compte analyste
#   Fenêtre B : compte compliance (pour dual control)
```

**Comptes à préparer :**
| Fenêtre | Email | Mot de passe | Rôle |
|---------|-------|-------------|------|
| A | analyste@labft.ma | Analyst2026! | Analyste — Youssef BENALI |
| B | compliance@labft.ma | Compli2026! | Compliance Officer — Khalid MANSOURI |

---

## INTRODUCTION (30 sec — voix-off)

> "Bienvenue sur WatchReg KYC-AML Platform.
> Nous allons suivre en temps réel un cas réel de blanchiment présumé :
> un client résident UAE effectue un virement de 485 000 MAD
> vers une société offshore aux Îles Vierges Britanniques.
>
> De la détection automatique à la transmission à l'ANRF,
> vous allez voir comment la plateforme orchestre chaque étape
> conformément aux exigences BAM Circulaire 5/W/2023 et FATF R.10 à R.16."

---

## ACTE 1 — L'INCIDENT SE PRODUIT (2 min)
### Simulation d'un virement entrant via Core Banking

**Narration :**
> "La banque reçoit un ordre de virement via son Core Banking System.
> La plateforme expose un webhook sécurisé qui consomme ces événements en temps réel."

**Actions — Fenêtre A (analyste) :**

1. Ouvrir `http://localhost:5173/cbs` *(accessible sans authentification — point d'intégration CBS)*
2. → Page **Simulateur Core Banking**
3. Sélectionner **Hassan QADIRI** dans la liste clients
4. Remplir le formulaire :
   - Montant : **`485000`** MAD
   - Type : **TRANSFER**
   - Contrepartie : `Shell Holdings BVI Ltd`
   - Pays destination : **`VG`** (Îles Vierges Britanniques)
   - Motif : `Prestation de conseil international`
5. Cliquer **"Envoyer webhook"**
6. → Réponse JSON affichée :
   ```json
   {
     "transactionId": "TXN-AML-XXXXX",
     "riskScore": 94,
     "status": "FLAGGED",
     "alertCreated": true
   }
   ```

> "En moins de 200ms, le moteur AML a évalué 6 règles FATF :
> montant supra-seuil, juridiction à risque FATF liste noire, et pattern structuring.
> Score de risque : 94/100. Une alerte CRITICAL est créée automatiquement."

---

## ACTE 2 — LA DÉTECTION (2 min)
### L'analyste découvre l'alerte

**Narration :**
> "L'analyste Youssef BENALI prend sa session de travail.
> Le dashboard lui présente immédiatement les alertes prioritaires."

**Actions — Fenêtre A (analyste, connecté) :**

1. Connexion `analyste@labft.ma` / `Analyst2026!`
2. → Dashboard — pointer :
   - KPI "Alertes CRITICAL" : **2** *(en rouge)*
3. **Filtre Priorité** → `CRITICAL` → 2 alertes visibles
4. Alerte #1 en tête de liste : scénario **HIGH_AMOUNT + HIGH_RISK_COUNTRY + STRUCTURING**
   - Score : 94 — Priorité : CRITICAL — Statut : OPEN

5. Aller sur `/alerts` → même alerte visible
6. **Filtrer** `CRITICAL` → alerte QADIRI bien présente

7. Cliquer sur l'alerte → **Modale détail** :
   - Transaction : **485 000 MAD → VP Bank BVI**
   - Raison : *"Virement 485 000 MAD vers BVI — 3 règles FATF. Structuring détecté."*
   - Client lié : Hassan QADIRI — riskScore 94

> "L'alerte est corrélée automatiquement à la transaction et au profil client.
> L'analyste a tout le contexte en un clic."

---

## ACTE 3 — L'INVESTIGATION KYC (2 min 30)
### Profilage du client suspect

**Narration :**
> "Avant d'escalader, l'analyste consulte le dossier complet du client.
> La plateforme centralise toutes les informations KYC, PII chiffrées,
> et l'historique comportemental."

**Actions — Fenêtre A :**

1. `/customers` — **Filtrer** `CRITICAL`
2. Cliquer **Hassan QADIRI**

**Onglet Profil :**
3. Pointer les signaux d'alerte :
   - Score risque : **91/100** — Niveau : CRITICAL
   - Résidence : **Dubai, UAE** *(juridiction surveillance BAM)*
   - Sanctionné : **REVIEW** *(58% match OFAC SDN)*
   - KYC Status : **IN_REVIEW** *(non finalisé)*
   - Note : *"Transactions multiples vers juridictions à risque."*

4. Bouton **"Calculer score risque"** → spinner → score confirmé : 91

**Onglet Transactions :**
5. → Historique : 4 transactions FLAGGED visibles
   - **485 000 MAD → BVI** (il y a 2h)
   - **9 800 MAD** + **9 500 MAD** + **9 200 MAD** vers Hassan Qadiri Jr
   > "3 virements sous le seuil de 10 000 MAD en 24h : pattern de structuring classique."

**Onglet Screening :**
6. → Résultat : **58% match** — OFAC SDN — `"Qadiri Hassan Akbar"` — Décision PENDING

> "Le client présente 4 signaux convergents :
> résidence juridiction à risque, KYC incomplet, structuring,
> et correspondance sanctions OFAC à 58%.
> L'ouverture d'un dossier d'investigation s'impose."

---

## ACTE 4 — OUVERTURE DU DOSSIER D'INVESTIGATION (1 min 30)

**Narration :**
> "L'analyste escalade vers un dossier formel.
> La piste d'audit enregistre chaque action."

**Actions — Fenêtre A :**

1. `/cases` → bouton **"Ouvrir un dossier"**
2. Remplir :
   - Client : **Hassan QADIRI** *(sélectionner dans la liste)*
   - Titre : `Investigation — Structuring + transfert offshore BVI`
   - Sévérité : **CRITICAL**
   - Description : `Virement 485 000 MAD vers BVI. Pattern structuring 3 tx sous seuil. KYC incomplet. Match OFAC 58%.`
3. **Valider** → Dossier créé — ID CASE-XXXXXX
4. Le dossier apparaît dans la liste avec statut **OPEN**

5. Cliquer le dossier → **Timeline** :
   - Entrée : *"Dossier créé par Youssef BENALI"*

6. Bouton **"Assigner à superviseur"** → assigner à Fatima EZZAHRAOUI
7. → Timeline mise à jour

> "Toutes ces actions sont enregistrées dans l'Audit Trail avec IP, timestamp
> et utilisateur — impossibles à modifier a posteriori."

---

## ACTE 5 — RÉDACTION DU SAR (2 min)

**Narration :**
> "Les éléments réunis justifient la rédaction d'un Suspicious Activity Report.
> La plateforme pré-remplit le rapport à partir des données collectées."

**Actions — Fenêtre A (re-connexion compliance@labft.ma pour accès /reports) :**

> *(Optionnel : montrer que l'analyste n'a pas accès à la création de SAR —
> il faut au minimum supervisor. Se connecter en compliance@labft.ma.)*

**Fenêtre B — compliance@labft.ma :**

1. `/reports` → **"Nouveau rapport"** → onglet **SAR**
2. Remplir :
   - Client : **Hassan QADIRI**
   - Titre : `SAR — QADIRI Hassan — Structuring + offshore BVI`
   - Type de suspicion : `Structuring + Transferts haute juridiction à risque`
   - Montant impliqué : **504 200 MAD** *(485 000 + 3×9 800)*
   - Description :
     ```
     Client non-résident (UAE) effectuant des virements répétés
     vers BVI. Pattern de structuring détecté sur 3 jours.
     Match OFAC SDN à 58%.
     ```
3. **Valider** → SAR créé en **DRAFT** avec ID `SAR-XXXXXXXXXX`

4. Sur le SAR → **"Soumettre"** → statut → **REVIEW**

> "Le rapport est prêt pour la double validation réglementaire
> selon le principe des 4 yeux imposé par l'ACPR."

---

## ACTE 6 — DOUBLE VALIDATION (PRINCIPE DES 4 YEUX) (2 min)

**Narration :**
> "La réglementation ACPR art.13 impose qu'aucune décision de transmission
> ne soit validée par son propre initiateur.
> La plateforme l'applique nativement et bloque techniquement toute auto-approbation."

**Actions — Fenêtre B (compliance@labft.ma) :**

1. Sur le SAR en REVIEW → bouton **"Soumettre pour approbation 4-yeux"**
2. Dialog :
   - Action : `SAR_TRANSMIT`
   - Note : `"Éléments probants réunis. Match OFAC 58%. Recommande transmission ANRF urgente."`
3. **Confirmer** → Toast : *"Demande d'approbation créée"*

**Basculer sur Fenêtre A — superviseur ou 2ème compliance :**

4. Connexion `superviseur@labft.ma` / `Superv2026!`
5. `/approvals` → demande PENDING visible :
   - Action : SAR_TRANSMIT
   - Demandeur : Khalid MANSOURI
   - Note : *"Éléments probants réunis..."*
6. Cliquer → **développer** → lire le contexte
7. **"Approuver"** → Dialog de confirmation :
   - Note : `"Documents vérifiés. Pattern structuring avéré. Transmission TRACFIN autorisée."`
8. **Confirmer** → Statut → **APPROVED** — badge vert

> "Démonstration du blocage — retour sur le compte compliance :
> tenter d'approuver sa propre demande affiche :
> 'Principe des 4 yeux — vous ne pouvez pas approuver votre propre demande'."

*(Si temps disponible : démontrer le message de blocage)*

---

## ACTE 7 — TRANSMISSION & SUIVI ANRF (1 min)

**Narration :**
> "Le SAR approuvé peut être transmis à l'ANRF — Autorité Nationale du Renseignement Financier.
> La plateforme trace chaque étape du suivi post-transmission."

**Actions — Fenêtre B :**

1. `/reports` → SAR approuvé → **"Voir détail"**
2. Section **Suivi ANRF** :
   - *(Sur SAR QADIRI existant)* Référence : `ANRF/2026/00127`
   - Statut : **ACCUSEE** *(badge bleu — accusé de réception reçu)*
   - Date dépôt : il y a 2 jours

3. **"Modifier suivi ANRF"** → changer statut :
   - Sélectionner **CLASSEE** *(décision finale)*
4. **Sauvegarder** → badge mis à jour → vert "CLASSEE"

> "Le cycle est complet : détection automatique, investigation, rédaction SAR,
> double validation, transmission ANRF, et suivi de décision — tout dans une seule plateforme."

---

## ACTE 8 — PREUVE D'AUDIT (1 min)

**Narration :**
> "En cas d'inspection BAM, chaque action est exportable en CSV
> avec timestamp, IP, utilisateur, et détail de l'opération."

**Actions — Connexion admin@labft.ma :**

1. `/audit`
2. → Journal : AUTH_LOGIN, APPROVAL_REQUESTED, APPROVAL_GRANTED, REPORT_STATUS_CHANGED...
3. **Filtrer** par action `APPROVAL_GRANTED` → validation du SAR visible
4. **Filtrer** par utilisateur → actions de Khalid MANSOURI

5. **"Exporter CSV"** → `audit-log.csv` téléchargé
6. *(Si possible)* Ouvrir le CSV → montrer colonnes : timestamp, userId, action, entityType, entityId, ipAddress

> "Ce journal est la piste d'audit réglementaire. Il ne peut pas être modifié
> ou supprimé par aucun utilisateur, y compris l'administrateur."

---

## CONCLUSION (30 sec)

**Narration :**
> "Récapitulatif de ce que nous venons de voir :
>
> ✓ Détection automatique en < 200ms via webhook CBS
> ✓ Scoring AML multi-règles FATF (R.10–R.16)
> ✓ Workflow KYC complet : profil, screening, scoring pKYC
> ✓ Dossier investigation avec timeline et assignation
> ✓ Rédaction SAR guidée avec données pré-remplies
> ✓ Dual control technique — blocage auto-approbation
> ✓ Suivi ANRF intégré
> ✓ Audit trail inaltérable exportable
>
> De l'alerte à la transmission réglementaire : 8 étapes,
> un seul système, zéro email, zéro tableur Excel."

**Plan final :**
- Dashboard Direction → 8 KPIs côte à côte
- Enchaîner sur le logo WatchReg sidebar

---

## RÉCAPITULATIF DES COMPTES UTILISÉS

| Acte | Compte | Email | Rôle |
|------|--------|-------|------|
| 1 | *(sans auth)* | — | CBS Simulator |
| 2–4 | Youssef BENALI | analyste@labft.ma | Analyst |
| 5–7 | Khalid MANSOURI | compliance@labft.ma | Compliance Officer |
| 6 (2ème valideur) | Fatima EZZAHRAOUI | superviseur@labft.ma | Supervisor |
| 8 | Administrateur | admin@labft.ma | Admin |

## DONNÉES RÉELLES UTILISÉES

| Élément | Valeur |
|---------|--------|
| Transaction principale | 485 000 MAD → VP Bank BVI |
| Pattern structuring | 9 800 + 9 500 + 9 200 MAD (24h) |
| Score risque QADIRI | 91/100 — CRITICAL |
| Match OFAC | 58% — "Qadiri Hassan Akbar" |
| SAR existant | ANRF/2026/00127 — ACCUSEE |
| SAR HAFIDI (référence) | ANRF/2026/00098 — CLASSEE — 143 000 MAD |

## TIMINGS CIBLES

| Acte | Durée |
|------|-------|
| Intro | 0:30 |
| Acte 1 — CBS Webhook | 2:00 |
| Acte 2 — Détection | 2:00 |
| Acte 3 — Investigation KYC | 2:30 |
| Acte 4 — Dossier | 1:30 |
| Acte 5 — Rédaction SAR | 2:00 |
| Acte 6 — Dual Control | 2:00 |
| Acte 7 — Suivi ANRF | 1:00 |
| Acte 8 — Audit | 1:00 |
| Conclusion | 0:30 |
| **TOTAL** | **~15 min** |

## NOTES RÉALISATEUR

| # | Point critique |
|---|---------------|
| 1 | Acte 1 : bien faire voir la réponse JSON complète avant de couper |
| 2 | Acte 3 : zoomer sur le pattern structuring (3 tx 9 200–9 800 MAD) |
| 3 | Acte 6 : coupure nette entre les 2 comptes — annoter à l'écran "Compte A / Compte B" |
| 4 | Acte 7 : attendre que le badge ANRF change de couleur à l'écran avant de couper |
| 5 | Acte 8 : ouvrir le CSV téléchargé si la démo est pour un régulateur |
| 6 | Garder une fenêtre CBS ouverte en arrière-plan pour l'Acte 1 |
