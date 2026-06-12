# Script Démo B — Technique & Fonctionnel
## Audience : Équipe technique / Compliance / Architecte sécurité
## Durée cible : 10–12 minutes
## Résolution recommandée : 1920×1080 — zoom navigateur 90%

---

## PRÉREQUIS AVANT D'APPUYER SUR "REC"

```bash
# Terminal 1
pnpm tsx drizzle/seed.demo.ts --reset   # données fraîches

# Terminal 2
pnpm dev:all                            # frontend + backend

# Navigateur
# Vider les cookies/session : F12 → Application → Clear site data
# Ouvrir http://localhost:5173/login
# Fenêtre plein écran
```

---

## SCÈNE 1 — Authentification & Contrôle d'accès (1 min 30)

**Narration :**
> "La plateforme repose sur un système d'authentification JWT avec refresh token,
> bcrypt 12 rounds, et contrôle d'accès basé sur 4 rôles hiérarchiques :
> analyst → supervisor → compliance_officer → admin."

**Actions :**

1. Page `/login` ouverte → montrer le formulaire
2. Saisir `analyste@labft.ma` / `Analyst2026!` → **Se connecter**
3. → Dashboard chargé, nom "Youssef BENALI" visible dans la sidebar
4. Taper dans la barre d'adresse : `http://localhost:5173/admin`
5. → Redirection automatique vers `/` *(accès refusé — rôle insuffisant)*
6. Taper : `http://localhost:5173/amld6`
7. → Redirection vers `/` *(compliance_officer requis)*

**Montrer dans le code** *(optionnel, 15 sec) :*
> "Côté backend, chaque route tRPC est protégée par un middleware `permissionProc`
> qui vérifie le rôle avant tout accès aux données."

8. Se déconnecter → retour `/login`
9. Connexion **admin@labft.ma** / `Admin2026!LabFT`
10. → Accès `/admin` confirmé

---

## SCÈNE 2 — Dashboard Opérationnel (1 min 30)

**Narration :**
> "Le dashboard opérationnel agrège en temps réel les métriques issues de 5 modules.
> Il se rafraîchit toutes les 30 secondes via polling tRPC."

**Actions :**

1. Sur `/` onglet **Opérationnel** — pointer les 4 KPI cards :
   - "20 clients — 17 approuvés"
   - "5 alertes ouvertes — **2 CRITICAL**" *(badge rouge)*
   - "2 dossiers ouverts"
   - Transactions du jour
2. **Filtre Tendances** → cliquer `7j`, `30j`, `90j` — graphique se recharge
3. **Filtre Activité** → `24h` → `7j` — liste alertes récentes change
4. **Filtre Priorité** → cliquer `CRITICAL` → seules les 2 alertes CRITICAL s'affichent

> "Les filtres Tendances et Activité envoient de nouveaux paramètres au backend.
> Le filtre Priorité est client-side — zero latence."

5. Onglet **Direction — ComCo** → sélectionner `2026`
6. → 8 KPI cards s'affichent : Couverture KYC, STR YTD, Délai moyen, etc.

---

## SCÈNE 3 — Gestion Clients & Scoring Risque (2 min)

**Narration :**
> "Le module KYC gère 20 clients avec calcul de score de risque ML,
> chiffrement AES-256-GCM des champs PII sensibles,
> et workflow de vérification documentaire."

**Actions :**

1. `/customers` — montrer la KPI bar : 20 Total, 17 APPROVED, 2 CRITICAL
2. **Filtrer** Risque → `CRITICAL` → 2 clients : Hassan QADIRI + SHELL HOLDINGS BVI
3. Cliquer **Hassan QADIRI**

**Sur CustomerDetail QADIRI :**

4. Onglet **Profil** → pointer :
   - Score **91/100** — badge CRITICAL rouge
   - Résidence : **UAE** (Dubai)
   - Statut sanctions : **REVIEW**
   - Note : *"Transactions multiples vers juridictions à risque."*
5. Bouton **"Calculer score risque"** → spinner → score mis à jour en temps réel

> "Le scoring combine : résidence, nationalité, statut PEP, historique transactions,
> résultats screening, et vélocité des flux."

6. Onglet **UBO** → "Ajouter UBO" → remplir :
   - Nom : `Khalil QADIRI` — Nationalité : `MA` — Participation : `75%` — PEP : Non
   - Valider → UBO ajouté

7. Onglet **pKYC** → **"Lancer le scoring"**
   → Cards : Score dérive, Revue déclenchée, historique

8. Retour liste → cliquer **SHELL HOLDINGS BVI** (score 95)
9. Pointer : KYC `PENDING`, sanctionStatus `REVIEW`, BVI — bénéficiaire non identifié

---

## SCÈNE 4 — Transactions & Détection AML (1 min 30)

**Narration :**
> "Chaque transaction entrant via API CBS, webhook, ou saisie manuelle
> est scorée par le moteur AML et peut déclencher une alerte automatiquement."

**Actions :**

1. `/transactions` — montrer KPI bar : 20 tx, 9 suspectes (FLAGGED), 1 BLOCKED
2. **Filtre** Statut → `FLAGGED` → transactions orange/rouge s'affichent
3. Cliquer sur la transaction **485 000 MAD** (QADIRI → BVI)
4. → Modale : montant, contrepartie VP Bank BVI, pays VG, flagReason **HIGH_AMOUNT + HIGH_RISK_COUNTRY**

5. Ouvrir onglet : `http://localhost:5173/cbs` *(sans auth — simulateur CBS public)*
6. → Page CBS Simulator
7. Sélectionner client dans la liste → saisir :
   - Montant : `200000` — Type : `TRANSFER` — Pays : `VG`
8. **"Envoyer webhook"** → réponse JSON : `{ transactionId, riskScore: 92 }`
9. Aller sur `/alerts` → nouvelle alerte CRITICAL apparue automatiquement en tête de liste

> "Le webhook est consommé par le moteur AML qui évalue 6 règles FATF
> et crée l'alerte en < 200ms."

---

## SCÈNE 5 — Gestion Alertes & Workflow Résolution (1 min 30)

**Narration :**
> "Les alertes AML suivent un workflow structuré :
> OPEN → IN_REVIEW → ESCALATED / FALSE_POSITIVE / CLOSED.
> Chaque action est auditée."

**Actions :**

1. `/alerts` — 8 alertes visibles, KPI bar en haut
2. **Filtre** `CRITICAL` → 2 alertes : QADIRI (score 94) + SHELL (score 95)
3. Cliquer alerte **QADIRI** — scénario : `HIGH_AMOUNT + HIGH_RISK_COUNTRY + STRUCTURING`
4. Modale ouverte → pointer :
   - Transaction liée : 485 000 MAD → BVI
   - Raison détaillée
5. **"Assigner à moi"** → alerte assignée à Youssef BENALI
6. Saisir note : `"Escalade vers dossier — demande dual control SAR."`
7. **"Résoudre — Escalader"** → statut → `ESCALATED`

8. Revenir liste → cliquer alerte **CHRAIBI** (LOW — FOREIGN_TRANSFER)
9. Statut actuel : `FALSE_POSITIVE` — pointer la resolutionNote :
   *"Virement familial confirmé. Faux positif."*

---

## SCÈNE 6 — Dossiers Investigation & Dual Control (1 min 30)

**Narration :**
> "Le principe des 4 yeux (ACPR art.13) est implémenté nativement.
> Aucune décision critique ne peut être validée par son propre initiateur."

**Actions :**

1. `/cases` — 4 dossiers : KPI (Total/Ouverts/CRITICAL)
2. Filtrer `CRITICAL` → dossiers QADIRI + SHELL
3. Cliquer dossier **"Investigation — Transactions offshore QADIRI"**
4. Timeline visible : création, assignation, escalade

5. Bouton **"Soumettre pour approbation 4-yeux"** → Dialog
6. Note : `"Éléments constitutifs blanchiment. Recommande SAR + gel."` → Confirmer
7. → Toast : *"Demande d'approbation créée"*

8. **Se déconnecter** → connexion **compliance@labft.ma** / `Compli2026!`
9. `/approvals` — 2 demandes PENDING visibles (+ 1 APPROVED + 1 REJECTED)
10. Ouvrir demande PENDING QADIRI → lire la note demandeur
11. **"Approuver"** → Dialog confirmation : saisir note → Confirmer
12. → Statut → `APPROVED` — badge vert

> "Tenter d'approuver sa propre demande retourne :
> 'Principe des 4 yeux — vous ne pouvez pas approuver votre propre demande'."

---

## SCÈNE 7 — Screening Sanctions (1 min)

**Narration :**
> "Le moteur de screening interroge 5 listes (OFAC, EU, UN, UK HMT, BAM)
> avec scoring de similarité fuzzy. Deux résultats PENDING en démonstration."

**Actions :**

1. `/screening` — onglet **"Pending"**
2. → SHELL HOLDINGS : **72% match** — EU Consolidated List — `"Shell Holdings International"`
3. → QADIRI Hassan : **58% match** — OFAC SDN — `"Qadiri Hassan Akbar"`
4. Sur SHELL → **"Rejeter"** → décision DISMISSED
5. Sur QADIRI → **"Confirmer match"** → CONFIRMED

6. Onglet **"Listes"** → santé des 5 listes : OFAC, EU, UN, UK, BAM
   → dernière mise à jour horodatée — statut vert/ambre/rouge

---

## SCÈNE 8 — Rapports SAR/STR & Suivi ANRF (1 min 30)

**Narration :**
> "La plateforme gère le cycle de vie complet des déclarations réglementaires :
> DRAFT → REVIEW → SUBMITTED → APPROVED, avec traçabilité ANRF intégrée."

**Actions :**

1. `/reports` (connecté en compliance@labft.ma)
2. → 4 rapports : SAR QADIRI (SUBMITTED), STR SHELL (REVIEW), SAR ATLAS (DRAFT), SAR HAFIDI (APPROVED)

3. Cliquer **SAR QADIRI** → "Voir détail"
4. Section **Suivi ANRF** :
   - Référence : `ANRF/2026/00127`
   - Statut : `ACCUSEE` (badge bleu)
   - Date dépôt : il y a 2 jours
5. **"Modifier suivi ANRF"** → dropdown statut → choisir `CLASSEE` → Sauvegarder
   → Badge mis à jour en temps réel

6. Revenir liste → **SAR ATLAS** (DRAFT)
7. **"Soumettre"** → statut → REVIEW
8. **"4-yeux"** → dialog → note → Confirmer
9. → Notification : *"Approval request créée — visible dans /approvals"*

---

## SCÈNE 9 — Administration & Audit Trail (1 min)

**Narration :**
> "Chaque action utilisateur génère une entrée d'audit horodatée, inaltérable,
> exportable CSV pour les autorités réglementaires."

**Actions :**

1. Connexion **admin@labft.ma** / `Admin2026!LabFT`
2. `/admin` → onglet **Utilisateurs** → 5 comptes avec rôles
3. Bouton **"Inviter un utilisateur"** → formulaire email + rôle → montrer sans valider

4. `/audit` (ou onglet Admin → Audit Trail)
5. → Journal : AUTH_LOGIN, APPROVAL_REQUESTED, CASE_STATUS_CHANGED, etc.
6. Filtrer par action `AUTH_LOGIN` → toutes les connexions
7. Filtrer par utilisateur → actions de Youssef BENALI
8. **"Exporter CSV"** → fichier `audit-log.csv` téléchargé

> "Ce log est la preuve légale d'activité conforme pour une inspection BAM."

---

## CLÔTURE (30 sec)

**Narration :**
> "En synthèse : détection automatique, workflow de décision tracé, principe des 4 yeux,
> déclarations réglementaires SAR/STR avec suivi ANRF, et audit trail inaltérable.
> La plateforme couvre l'intégralité des obligations BAM Circulaire 5/W/2023 et FATF R.10-R.16."

**Plan final :**
- Montrer le dashboard direction : 8 KPIs côte à côte
- Terminer sur le logo WatchReg dans la sidebar

---

## NOTES RÉALISATEUR

| # | Point d'attention |
|---|------------------|
| 1 | Attendre la fin du spinner avant de couper — les requêtes tRPC prennent ~300ms |
| 2 | Sur `/cbs`, le riskScore dans la réponse JSON doit être visible — zoomer si nécessaire |
| 3 | Pour le dual control, bien montrer les 2 comptes différents (coupure nette) |
| 4 | Le badge ANRF doit changer de couleur à l'écran — attendre la confirmation |
| 5 | L'export CSV se télécharge dans le dossier Téléchargements — prévoir de l'ouvrir |
