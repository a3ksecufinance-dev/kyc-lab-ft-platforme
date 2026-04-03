# Dictionnaire de Données — KYC-AML Platform v2.0

> **Document interne — Classification : CONFIDENTIEL**
> Dernière mise à jour : 2026-03-29
> Version schéma : drizzle/schema.ts (Sprint 5)

---

## Table des matières

1. [Conventions et légende](#1-conventions-et-légende)
2. [Tables](#2-tables)
   - [users](#21-users)
   - [customers](#22-customers)
   - [transactions](#23-transactions)
   - [alerts](#24-alerts)
   - [cases](#25-cases)
   - [case_timeline](#26-case_timeline)
   - [reports](#27-reports)
   - [documents](#28-documents)
   - [screening_results](#29-screening_results)
   - [aml_rules](#210-aml_rules)
   - [aml_rule_executions](#211-aml_rule_executions)
   - [aml_rule_feedback](#212-aml_rule_feedback)
   - [audit_logs](#213-audit_logs)
   - [ubos](#214-ubos)
   - [pkyc_snapshots](#215-pkyc_snapshots)
   - [jurisdiction_profiles](#216-jurisdiction_profiles)
3. [Référence complète des enums](#3-référence-complète-des-enums)
4. [Description du modèle ERD](#4-description-du-modèle-erd)
5. [Lignage des données](#5-lignage-des-données)
6. [Classification RGPD et sensibilité des données](#6-classification-rgpd-et-sensibilité-des-données)
7. [Champs chiffrés PII](#7-champs-chiffrés-pii)

---

## 1. Conventions et légende

### Niveaux de sensibilité RGPD

| Niveau | Description |
|--------|-------------|
| `PUBLIC` | Données non sensibles, divulgables sans restriction |
| `INTERNAL` | Usage interne uniquement, non divulguable aux tiers |
| `CONFIDENTIAL` | Données personnelles ou métier sensibles |
| `RESTRICTED` | Données hautement sensibles — accès strict, chiffrement requis |

### Conventions de nommage

- Les champs sont en **snake_case** en base de données, **camelCase** en TypeScript.
- Les timestamps sont stockés en UTC, type `TIMESTAMP WITHOUT TIME ZONE`.
- Les montants financiers utilisent le type `NUMERIC(15,2)` — jamais `FLOAT`.
- Les codes pays suivent la norme **ISO 3166-1 alpha-2** (ex: `FR`, `MA`, `DE`).
- Les codes devise suivent la norme **ISO 4217** (ex: `EUR`, `USD`, `MAD`).

### Abréviations

- **PEP** : Personne Politiquement Exposée
- **SAR** : Suspicious Activity Report (Déclaration de Soupçon)
- **STR** : Suspicious Transaction Report
- **LCB-FT** : Lutte Contre le Blanchiment et le Financement du Terrorisme
- **eKYC** : Electronic Know Your Customer
- **OCR** : Optical Character Recognition
- **MRZ** : Machine Readable Zone (passeports, CI)
- **pKYC** : Perpetual KYC
- **OFAC** : Office of Foreign Assets Control (sanctions US)
- **goAML** : Logiciel de reporting ONUDC/GAFI

---

## 2. Tables

---

### 2.1 `users`

**Description :** Comptes utilisateurs de la plateforme KYC-AML. Représente les agents internes (analystes, superviseurs, compliance officers, administrateurs). Cette table ne contient **pas** les clients finaux (voir `customers`).

**Rôle métier :** Contrôle d'accès basé sur les rôles (RBAC), traçabilité des actions via `audit_logs`, assignation des alertes et dossiers.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne auto-incrémenté | `7` |
| `email` | `VARCHAR(320)` UNIQUE | Non | Adresse email professionnelle — identifiant de connexion | `analyste@ma-banque.fr` |
| `password_hash` | `VARCHAR(255)` | Non | Hash bcrypt du mot de passe (coût recommandé : 12) | `$2b$12$...` |
| `name` | `VARCHAR(200)` | Non | Nom complet de l'utilisateur | `Sophie Martin` |
| `role` | `ENUM(user_role)` | Non | Rôle RBAC — détermine les autorisations (défaut : `analyst`) | `analyst` |
| `department` | `VARCHAR(100)` | Oui | Département ou service de rattachement | `Compliance` |
| `is_active` | `BOOLEAN` | Non | Compte actif (false = désactivé sans suppression) | `true` |
| `last_signed_in` | `TIMESTAMP` | Oui | Dernière connexion réussie | `2024-11-15T09:32:00Z` |
| `mfa_enabled` | `BOOLEAN` | Non | MFA TOTP activé sur ce compte | `true` |
| `mfa_secret` | `VARCHAR(200)` | Oui | Secret TOTP **chiffré AES-256-GCM** (clé : `MFA_ENCRYPTION_KEY`) | *(chiffré)* |
| `mfa_backup_codes` | `JSONB` | Oui | Codes de secours hachés (bcrypt), usage unique | `["$2b$12$...", ...]` |
| `mfa_enabled_at` | `TIMESTAMP` | Oui | Date d'activation du MFA | `2024-10-01T10:00:00Z` |
| `created_at` | `TIMESTAMP` | Non | Date de création du compte | `2024-01-15T08:00:00Z` |
| `updated_at` | `TIMESTAMP` | Non | Dernière mise à jour (trigger auto) | `2024-11-10T14:20:00Z` |

**Index :** `users_email_idx` (UNIQUE), `users_role_idx`

**Règles métier :**
- Un utilisateur désactivé (`is_active = false`) ne peut pas se connecter.
- Le `mfa_secret` ne doit jamais être exposé via l'API.
- Les codes de secours sont invalidés après usage.
- La suppression physique est interdite — utiliser `is_active = false`.

**Relations sortantes :** Référencé par `customers.assigned_analyst`, `alerts.assigned_to`, `alerts.resolved_by`, `cases.assigned_to`, `cases.supervisor_id`, `cases.decision_by`, `screening_results.reviewed_by`, `reports.submitted_by`, `reports.approved_by`, `aml_rules.created_by`, `audit_logs.user_id`, et autres.

---

### 2.2 `customers`

**Description :** Profils des clients soumis aux obligations KYC/LCB-FT. Contient à la fois les personnes physiques (INDIVIDUAL) et morales (CORPORATE), les PEP et les clients étrangers à risque élevé.

**Rôle métier :** Entité centrale du modèle de données. Toutes les transactions, alertes, dossiers, documents et résultats de screening y sont rattachés.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne auto-incrémenté | `42` |
| `customer_id` | `VARCHAR(50)` UNIQUE | Non | Identifiant métier unique (format libre, ex: CBS ID) | `CUST-FR-00042` |
| `first_name` | `TEXT` | Non | Prénom | `Marie` |
| `last_name` | `TEXT` | Non | Nom de famille | `Dupont` |
| `email` | `TEXT` | Oui | Adresse email du client | `marie.dupont@email.fr` |
| `phone` | `TEXT` | Oui | Numéro de téléphone (format international) | `+33612345678` |
| `date_of_birth` | `TEXT` | Oui | Date de naissance (ISO 8601) | `1985-03-15` |
| `nationality` | `VARCHAR(10)` | Oui | Nationalité (code ISO 3166-1 alpha-2) | `FR` |
| `residence_country` | `VARCHAR(10)` | Oui | Pays de résidence (code ISO 3166-1 alpha-2) | `FR` |
| `address` | `TEXT` | Oui | Adresse complète | `12 Rue de la Paix, 75001 Paris` |
| `city` | `VARCHAR(100)` | Oui | Ville | `Paris` |
| `profession` | `VARCHAR(200)` | Oui | Profession déclarée | `Ingénieur informatique` |
| `employer` | `VARCHAR(200)` | Oui | Employeur | `Tech Corp SA` |
| `source_of_funds` | `VARCHAR(200)` | Oui | Origine des fonds déclarée | `Salaire` |
| `monthly_income` | `NUMERIC(15,2)` | Oui | Revenu mensuel déclaré (devise : `EUR` par défaut) | `3500.00` |
| `customer_type` | `ENUM(customer_type)` | Non | Type de client (défaut : `INDIVIDUAL`) | `INDIVIDUAL` |
| `kyc_status` | `ENUM(kyc_status)` | Non | Statut du processus KYC (défaut : `PENDING`) | `APPROVED` |
| `risk_level` | `ENUM(risk_level)` | Non | Niveau de risque calculé (défaut : `LOW`) | `HIGH` |
| `risk_score` | `INTEGER` | Non | Score de risque agrégé (0-100, défaut : 0) | `72` |
| `pep_status` | `BOOLEAN` | Non | Personne Politiquement Exposée (défaut : false) | `false` |
| `sanction_status` | `ENUM(sanction_status)` | Non | Statut screening sanctions (défaut : `PENDING`) | `CLEAR` |
| `last_review_date` | `TIMESTAMP` | Oui | Date de la dernière revue KYC | `2024-06-01T00:00:00Z` |
| `next_review_date` | `TIMESTAMP` | Oui | Date de la prochaine revue programmée | `2025-06-01T00:00:00Z` |
| `assigned_analyst` | `INTEGER` FK→`users.id` | Oui | Analyste en charge du dossier | `7` |
| `notes` | `TEXT` | Oui | Commentaires internes libres | `Client VIP — traitement prioritaire` |
| `frozen_at` | `TIMESTAMP` | Oui | Date et heure du gel des avoirs | `2024-11-10T16:45:00Z` |
| `frozen_reason` | `TEXT` | Oui | Motif juridique du gel | `Décision judiciaire n°2024-JUD-0891` |
| `frozen_by` | `INTEGER` FK→`users.id` | Oui | Utilisateur ayant ordonné le gel | `3` |
| `erasure_requested_at` | `TIMESTAMP` | Oui | Date de la demande d'effacement RGPD | `2024-12-01T10:00:00Z` |
| `erasure_completed_at` | `TIMESTAMP` | Oui | Date de l'effacement effectif | `2024-12-15T10:00:00Z` |
| `erasure_requested_by` | `INTEGER` FK→`users.id` | Oui | Utilisateur ayant reçu la demande | `2` |
| `erasure_completed_by` | `INTEGER` FK→`users.id` | Oui | Utilisateur ayant exécuté l'effacement | `1` |
| `created_at` | `TIMESTAMP` | Non | Date de création | `2024-01-20T09:00:00Z` |
| `updated_at` | `TIMESTAMP` | Non | Dernière mise à jour | `2024-11-15T14:00:00Z` |

**Index :** `customers_customer_id_idx` (UNIQUE), `customers_risk_level_idx`, `customers_kyc_status_idx`, `customers_country_idx`, `customers_created_at_idx`

**Relations sortantes :** `documents`, `ubos`, `transactions`, `alerts`, `cases`, `screening_results`, `reports`, `pkyc_snapshots`

**Règles métier :**
- Le `customer_id` est la clé d'intégration avec le CBS — il doit être unique et immuable.
- Un client gelé (`frozen_at IS NOT NULL`) voit toutes ses transactions nouvelles bloquées automatiquement.
- L'effacement RGPD anonymise les champs PII mais conserve les données d'audit (LCB-FT : 5 ans).
- Le `risk_score` est recalculé à chaque transaction ou événement de screening.
- Les PEP (`pep_status = true`) sont soumis à la Vigilance Renforcée (EDD).

---

### 2.3 `transactions`

**Description :** Transactions financières soumises à l'analyse AML. Chaque enregistrement représente une opération unitaire reçue du CBS (webhook ou API).

**Rôle métier :** Déclencheur principal du moteur AML. Le champ `risk_rules` (JSONB) conserve l'audit complet des règles évaluées pour chaque transaction.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `8941` |
| `transaction_id` | `VARCHAR(50)` UNIQUE | Non | Identifiant CBS — **clé d'idempotence** | `CBS-TX-2024-089451` |
| `customer_id` | `INTEGER` FK→`customers.id` | Non | Client émetteur/bénéficiaire | `42` |
| `amount` | `NUMERIC(15,2)` | Non | Montant de la transaction | `15000.00` |
| `currency` | `VARCHAR(10)` | Non | Devise ISO 4217 (défaut : `EUR`) | `EUR` |
| `transaction_type` | `ENUM(transaction_type)` | Non | Nature de l'opération | `TRANSFER` |
| `channel` | `ENUM(channel)` | Non | Canal d'exécution (défaut : `ONLINE`) | `ONLINE` |
| `counterparty` | `VARCHAR(200)` | Oui | Nom de la contrepartie | `ACME Corp GmbH` |
| `counterparty_country` | `VARCHAR(10)` | Oui | Pays de la contrepartie (ISO 3166-1) | `DE` |
| `counterparty_bank` | `VARCHAR(200)` | Oui | Banque de la contrepartie | `Deutsche Bank AG` |
| `purpose` | `TEXT` | Oui | Objet déclaré de la transaction | `Règlement facture F-2024-0089` |
| `risk_score` | `INTEGER` | Non | Score AML calculé (0-100, défaut : 0) | `78` |
| `risk_rules` | `JSONB` | Oui | Règles AML déclenchées (audit immuable) | `[{"ruleId":"RULE-001","triggered":true,...}]` |
| `status` | `ENUM(transaction_status)` | Non | Statut de la transaction (défaut : `PENDING`) | `FLAGGED` |
| `is_suspicious` | `BOOLEAN` | Non | Marqué comme suspect (défaut : false) | `true` |
| `flag_reason` | `TEXT` | Oui | Motif de marquage suspect | `Score AML > 70 : seuil STR dépassé` |
| `transaction_date` | `TIMESTAMP` | Non | Date/heure de la transaction | `2024-11-15T14:32:00Z` |
| `created_at` | `TIMESTAMP` | Non | Date d'ingestion dans la plateforme | `2024-11-15T14:32:05Z` |

**Index :** `transactions_tx_id_idx` (UNIQUE), `transactions_customer_idx`, `transactions_status_idx`, `transactions_date_idx`, `transactions_suspicious_idx`

**Contrainte :** `ON DELETE RESTRICT` sur `customer_id` — impossible de supprimer un client ayant des transactions.

**Règles métier :**
- Le `transaction_id` CBS est la clé d'idempotence : un doublon retourne la transaction existante sans retraitement.
- Le moteur AML est déclenché **synchroniquement** à la création.
- Si `risk_score >= seuil_alerte`, une alerte est créée automatiquement dans `alerts`.
- Si `risk_score >= seuil_str` (configurable par juridiction), la transaction passe à `FLAGGED`.
- Le champ `risk_rules` est **immuable** après écriture (audit trail AML).

---

### 2.4 `alerts`

**Description :** Alertes AML générées automatiquement par le moteur de règles lors de l'analyse des transactions ou lors d'événements de screening. Gérées par les analystes dans une file de traitement.

**Rôle métier :** Point d'entrée du workflow compliance. Une alerte non traitée dans les délais réglementaires génère une escalade automatique.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `5521` |
| `alert_id` | `VARCHAR(50)` UNIQUE | Non | Identifiant métier unique | `ALT-2024-05521` |
| `customer_id` | `INTEGER` FK→`customers.id` | Non | Client concerné | `42` |
| `transaction_id` | `INTEGER` FK→`transactions.id` | Oui | Transaction déclencheuse (si applicable) | `8941` |
| `scenario` | `VARCHAR(200)` | Non | Libellé du scénario AML ayant déclenché l'alerte | `Virement > 10 000 EUR vers pays à risque` |
| `alert_type` | `ENUM(alert_type)` | Non | Catégorie de l'alerte | `THRESHOLD` |
| `priority` | `ENUM(alert_priority)` | Non | Niveau de priorité (défaut : `MEDIUM`) | `HIGH` |
| `status` | `ENUM(alert_status)` | Non | Statut dans le workflow (défaut : `OPEN`) | `IN_REVIEW` |
| `risk_score` | `INTEGER` | Non | Score AML ayant déclenché l'alerte (défaut : 0) | `78` |
| `reason` | `TEXT` | Oui | Explication détaillée du déclenchement | `Montant 15 000 EUR dépasse seuil 10 000 EUR` |
| `enrichment_data` | `JSONB` | Oui | Données contextuelles d'enrichissement | `{"velocityLast24h": 3, "avgAmount": 2000}` |
| `assigned_to` | `INTEGER` FK→`users.id` | Oui | Analyste assigné | `7` |
| `resolved_by` | `INTEGER` FK→`users.id` | Oui | Utilisateur ayant résolu | `7` |
| `resolved_at` | `TIMESTAMP` | Oui | Date et heure de résolution | `2024-11-16T10:00:00Z` |
| `resolution` | `TEXT` | Oui | Commentaire de résolution | `Virement justifié par contrat signé` |
| `created_at` | `TIMESTAMP` | Non | Date de création de l'alerte | `2024-11-15T14:32:10Z` |
| `updated_at` | `TIMESTAMP` | Non | Dernière mise à jour | `2024-11-16T10:00:00Z` |

**Index :** `alerts_alert_id_idx` (UNIQUE), `alerts_customer_idx`, `alerts_status_idx`, `alerts_priority_idx`, `alerts_created_at_idx`

**Contrainte :** `ON DELETE RESTRICT` sur `customer_id` ; `ON DELETE SET NULL` sur `transaction_id`, `assigned_to`, `resolved_by`

**Règles métier :**
- Une alerte `CRITICAL` non assignée dans les 24h déclenche une notification au superviseur.
- Une alerte peut être escaladée vers un `Case` (dossier d'investigation).
- Le champ `enrichment_data` est alimenté par le module d'enrichissement contextuel (vélocité, historique, réseau).

---

### 2.5 `cases`

**Description :** Dossiers d'investigation ouverts suite à une ou plusieurs alertes. Représente l'unité de travail du compliance officer pour la prise de décision finale (SAR, STR, classement sans suite).

**Rôle métier :** Gestion du workflow d'investigation, traçabilité des décisions réglementaires, production des rapports SAR/STR.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `34` |
| `case_id` | `VARCHAR(50)` UNIQUE | Non | Identifiant métier unique | `CASE-2024-00034` |
| `customer_id` | `INTEGER` FK→`customers.id` | Non | Client faisant l'objet de l'investigation | `42` |
| `title` | `VARCHAR(300)` | Non | Titre du dossier | `Opérations structurées Q4 2024` |
| `description` | `TEXT` | Oui | Description détaillée de l'objet de l'investigation | |
| `status` | `ENUM(case_status)` | Non | Statut du dossier (défaut : `OPEN`) | `UNDER_INVESTIGATION` |
| `severity` | `ENUM(case_severity)` | Non | Niveau de gravité (défaut : `MEDIUM`) | `HIGH` |
| `assigned_to` | `INTEGER` FK→`users.id` | Oui | Analyste responsable du dossier | `7` |
| `supervisor_id` | `INTEGER` FK→`users.id` | Oui | Superviseur validant les décisions | `3` |
| `linked_alerts` | `JSONB` | Oui | Tableau des IDs d'alertes liées | `[5521, 5522, 5530]` |
| `findings` | `TEXT` | Oui | Constats et éléments de preuve | |
| `decision` | `ENUM(case_decision)` | Non | Décision finale (défaut : `PENDING`) | `SAR_FILED` |
| `decision_notes` | `TEXT` | Oui | Justification obligatoire de la décision | |
| `decision_by` | `INTEGER` FK→`users.id` | Oui | Utilisateur ayant pris la décision finale | `2` |
| `decision_at` | `TIMESTAMP` | Oui | Date et heure de la décision | `2024-11-20T11:00:00Z` |
| `due_date` | `TIMESTAMP` | Oui | Date limite de traitement | `2024-11-22T23:59:59Z` |
| `created_at` | `TIMESTAMP` | Non | Date de création du dossier | `2024-11-16T09:00:00Z` |
| `updated_at` | `TIMESTAMP` | Non | Dernière mise à jour | `2024-11-20T11:00:00Z` |

**Index :** `cases_case_id_idx` (UNIQUE), `cases_customer_idx`, `cases_status_idx`, `cases_created_at_idx`

**Règles métier :**
- La décision `SAR_FILED` ou `STR_FILED` nécessite un `decision_notes` non vide et le rôle `compliance_officer` ou `admin`.
- Chaque changement de statut crée automatiquement une entrée dans `case_timeline`.
- Un dossier `PENDING_APPROVAL` ne peut être clôturé que par le superviseur.

---

### 2.6 `case_timeline`

**Description :** Journalisation chronologique de toutes les actions effectuées sur un dossier. Constitue l'historique immuable de l'investigation.

**Rôle métier :** Traçabilité réglementaire, preuve d'audit, conformité aux exigences LCB-FT de documentation des investigations.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `892` |
| `case_id` | `INTEGER` FK→`cases.id` | Non | Dossier concerné (CASCADE DELETE) | `34` |
| `action` | `VARCHAR(200)` | Non | Code/libellé de l'action effectuée | `STATUS_CHANGED_TO_UNDER_INVESTIGATION` |
| `description` | `TEXT` | Oui | Détail textuel de l'action | `Dossier pris en charge par Sophie Martin` |
| `performed_by` | `INTEGER` FK→`users.id` | Oui | Utilisateur ayant effectué l'action | `7` |
| `metadata` | `JSONB` | Oui | Données complémentaires structurées | `{"from":"OPEN","to":"UNDER_INVESTIGATION"}` |
| `created_at` | `TIMESTAMP` | Non | Horodatage de l'action | `2024-11-16T09:05:00Z` |

**Index :** `case_timeline_case_idx`

**Contrainte :** `ON DELETE CASCADE` sur `case_id` — la timeline est supprimée avec le dossier (uniquement en cas de purge administrative).

**Règles métier :** Les entrées de timeline sont **immuables** — aucune mise à jour ou suppression n'est autorisée après insertion.

---

### 2.7 `reports`

**Description :** Rapports réglementaires produits par la plateforme : Déclarations de Soupçon (SAR/DOS), Déclarations de Transaction Suspecte (STR), rapports statistiques AML, évaluations des risques.

**Rôle métier :** Interface entre la plateforme et les autorités de régulation (TRACFIN, BAM, CENTIF, goAML). La référence réglementaire (`regulatory_ref`) est attribuée par l'autorité après réception.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `123` |
| `report_id` | `VARCHAR(50)` UNIQUE | Non | Identifiant métier unique | `RPT-SAR-2024-00123` |
| `report_type` | `ENUM(report_type)` | Non | Type de rapport | `SAR` |
| `customer_id` | `INTEGER` FK→`customers.id` | Oui | Client concerné (si applicable) | `42` |
| `case_id` | `INTEGER` FK→`cases.id` | Oui | Dossier lié (si applicable) | `34` |
| `title` | `VARCHAR(300)` | Non | Titre du rapport | `Déclaration de soupçon — Opérations structurées` |
| `status` | `ENUM(report_status)` | Non | Statut du rapport (défaut : `DRAFT`) | `SUBMITTED` |
| `suspicion_type` | `VARCHAR(200)` | Oui | Nature de la suspicion | `Structuration — fragmentation des virements` |
| `amount_involved` | `NUMERIC(15,2)` | Oui | Montant total impliqué | `87500.00` |
| `currency` | `VARCHAR(10)` | Oui | Devise | `EUR` |
| `content` | `JSONB` | Oui | Contenu structuré du rapport (format goAML ou libre) | |
| `submitted_by` | `INTEGER` FK→`users.id` | Oui | Utilisateur ayant soumis le rapport | `2` |
| `submitted_at` | `TIMESTAMP` | Oui | Date de soumission | `2024-11-21T10:00:00Z` |
| `approved_by` | `INTEGER` FK→`users.id` | Oui | Superviseur ayant validé | `1` |
| `approved_at` | `TIMESTAMP` | Oui | Date de validation | `2024-11-21T09:30:00Z` |
| `regulatory_ref` | `VARCHAR(100)` | Oui | Référence attribuée par l'autorité | `TRACFIN-2024-0089451` |
| `created_at` | `TIMESTAMP` | Non | Date de création | `2024-11-20T14:00:00Z` |
| `updated_at` | `TIMESTAMP` | Non | Dernière mise à jour | `2024-11-21T10:00:00Z` |

**Index :** `reports_report_id_idx` (UNIQUE), `reports_status_idx`, `reports_type_idx`

**Règles métier :**
- Un rapport `SAR` ou `STR` doit être validé (`APPROVED`) avant soumission à l'autorité.
- Une fois `SUBMITTED`, le rapport ne peut plus être modifié.
- Le délai de déclaration STR est paramétré par juridiction (`str_delay_hours` dans `jurisdiction_profiles`).

---

### 2.8 `documents`

**Description :** Documents d'identité et pièces justificatives uploadés pour le processus KYC. Chaque document est traité automatiquement par OCR et eKYC.

**Rôle métier :** Support de la vérification d'identité eKYC — extraction automatique des données, détection de fraude documentaire, scoring de confiance.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `789` |
| `customer_id` | `INTEGER` FK→`customers.id` | Non | Client propriétaire du document (CASCADE) | `42` |
| `document_type` | `ENUM(document_type)` | Non | Type de document | `PASSPORT` |
| `file_name` | `VARCHAR(255)` | Oui | Nom original du fichier | `passeport_marie_dupont.pdf` |
| `file_path` | `TEXT` | Oui | Chemin local ou clé S3 | `uploads/42/789_passport.pdf` |
| `file_url` | `TEXT` | Oui | URL signée (S3) ou URL locale | `https://s3.../signed-url` |
| `file_size` | `INTEGER` | Oui | Taille en octets | `2097152` |
| `mime_type` | `VARCHAR(100)` | Oui | Type MIME | `application/pdf` |
| `storage_backend` | `VARCHAR(20)` | Non | Backend de stockage (défaut : `local`) | `s3` |
| `status` | `ENUM(document_status)` | Non | Statut de vérification (défaut : `PENDING`) | `VERIFIED` |
| `expiry_date` | `VARCHAR(20)` | Oui | Date d'expiration du document | `2030-05-15` |
| `document_number` | `VARCHAR(100)` | Oui | Numéro du document | `24AB12345` |
| `issuing_country` | `VARCHAR(10)` | Oui | Pays émetteur (ISO 3166-1 alpha-2) | `FR` |
| `ocr_data` | `JSONB` | Oui | Champs extraits par OCR (Tesseract) | `{"lastName":"DUPONT","firstName":"MARIE",...}` |
| `ocr_raw_text` | `TEXT` | Oui | Texte brut complet extrait par OCR | |
| `ocr_confidence` | `INTEGER` | Oui | Score de confiance OCR (0-100) | `94` |
| `ocr_processed_at` | `TIMESTAMP` | Oui | Date/heure de traitement OCR | `2024-11-15T14:33:00Z` |
| `mrz_data` | `JSONB` | Oui | Données Machine Readable Zone parsées | `{"surname":"DUPONT","givenNames":"MARIE",...}` |
| `ekyc_status` | `ENUM(ekyc_status)` | Non | Statut eKYC (défaut : `PENDING`) | `PASS` |
| `ekyc_score` | `INTEGER` | Oui | Score de confiance global eKYC (0-100) | `87` |
| `ekyc_checks` | `JSONB` | Oui | Résultat détaillé de chaque contrôle eKYC | `{"faceMatch":true,"docAuth":true,...}` |
| `ekyc_provider` | `VARCHAR(50)` | Non | Fournisseur eKYC (défaut : `local`) | `local` |
| `ekyc_processed_at` | `TIMESTAMP` | Oui | Date/heure de traitement eKYC | `2024-11-15T14:33:05Z` |
| `verified_by` | `INTEGER` FK→`users.id` | Oui | Analyste ayant validé manuellement | `7` |
| `verified_at` | `TIMESTAMP` | Oui | Date de validation manuelle | `2024-11-16T09:00:00Z` |
| `notes` | `TEXT` | Oui | Commentaires de l'analyste | `Document authentique — MRZ conforme` |
| `created_at` | `TIMESTAMP` | Non | Date d'upload | `2024-11-15T14:32:50Z` |
| `updated_at` | `TIMESTAMP` | Non | Dernière mise à jour | `2024-11-16T09:00:00Z` |

**Index :** `documents_customer_idx`, `documents_status_idx`, `documents_ekyc_idx`

**Contrainte :** `ON DELETE CASCADE` sur `customer_id`.

**Règles métier :**
- Un document `EXPIRED` (date d'expiration dépassée) déclenche une alerte pKYC.
- Le `file_path` pointe vers le stockage local ou S3 selon `STORAGE_BACKEND`.
- Les champs `ocr_raw_text` et `file_path` sont considérés RESTRICTED (PII).
- Le statut `ekyc_status = PASS` est requis pour faire passer le client en `kycStatus = APPROVED`.

---

### 2.9 `screening_results`

**Description :** Résultats des contrôles de screening effectués sur les clients : sanctions internationales (OFAC, UE, ONU, UK), PEP (OpenSanctions), et médias adverses.

**Rôle métier :** Détection des personnes sanctionnées ou politiquement exposées. Mise à jour automatique du `sanction_status` du client. Les listes sont rafraîchies quotidiennement à 02h00 UTC.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `3401` |
| `customer_id` | `INTEGER` FK→`customers.id` | Non | Client screené | `42` |
| `screening_type` | `ENUM(screening_type)` | Non | Type de screening | `SANCTIONS` |
| `status` | `ENUM(screening_status)` | Non | Résultat du screening (défaut : `PENDING`) | `CLEAR` |
| `match_score` | `INTEGER` | Non | Score de correspondance (0-100, défaut : 0) | `0` |
| `matched_entity` | `VARCHAR(300)` | Oui | Entité correspondante dans la liste | `DUPONT JEAN alias J. DUPONT` |
| `list_source` | `VARCHAR(200)` | Oui | Source de la liste ayant généré le match | `OFAC SDN` |
| `confidence_score` | `INTEGER` | Non | Score de confiance du match (0-100, défaut : 0) | `95` |
| `details` | `JSONB` | Oui | Données brutes du match (programme sanctions, pays, date) | |
| `reviewed_by` | `INTEGER` FK→`users.id` | Oui | Analyste ayant révisé le match | `7` |
| `reviewed_at` | `TIMESTAMP` | Oui | Date de révision | `2024-11-16T10:30:00Z` |
| `decision` | `ENUM(screening_decision)` | Non | Décision sur le match (défaut : `PENDING`) | `DISMISSED` |
| `decision_reason` | `TEXT` | Oui | Justification de la décision | `Homonymie — dates de naissance différentes` |
| `created_at` | `TIMESTAMP` | Non | Date du screening | `2024-11-15T14:35:00Z` |

**Index :** `screening_customer_idx`, `screening_status_idx`, `screening_type_idx`

**Seuils de décision (configurables) :**
- `SCREENING_MATCH_THRESHOLD=80` : au-dessus → statut `MATCH`
- `SCREENING_REVIEW_THRESHOLD=50` : entre 50 et 79 → statut `REVIEW`
- En dessous de 50 → statut `CLEAR`

---

### 2.10 `aml_rules`

**Description :** Règles AML dynamiques configurables sans redéploiement. Le moteur évalue chaque règle active lors de l'analyse des transactions.

**Rôle métier :** Cœur du moteur de détection AML. Permet aux compliance officers de créer, modifier et tester des règles sans intervention technique.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `12` |
| `rule_id` | `VARCHAR(50)` UNIQUE | Non | Identifiant métier unique de la règle | `RULE-THRESH-10K` |
| `name` | `VARCHAR(200)` | Non | Libellé de la règle | `Seuil transaction unique > 10 000 EUR` |
| `description` | `TEXT` | Oui | Description détaillée et justification réglementaire | |
| `category` | `ENUM(aml_rule_category)` | Non | Catégorie de détection | `THRESHOLD` |
| `status` | `ENUM(aml_rule_status)` | Non | Statut d'activation (défaut : `ACTIVE`) | `ACTIVE` |
| `conditions` | `JSONB` | Non | Logique de la règle sérialisée | `{"field":"amount","operator":">=","value":10000}` |
| `base_score` | `INTEGER` | Non | Score de base attribué si déclenchée (0-100, défaut : 50) | `70` |
| `priority` | `VARCHAR(10)` | Non | Priorité de l'alerte générée (défaut : `MEDIUM`) | `HIGH` |
| `alert_type` | `VARCHAR(20)` | Non | Type d'alerte générée (défaut : `THRESHOLD`) | `THRESHOLD` |
| `threshold_value` | `NUMERIC(15,2)` | Oui | Seuil monétaire simple (surcharge `conditions`) | `10000.00` |
| `window_minutes` | `INTEGER` | Oui | Fenêtre temporelle d'analyse (en minutes) | `1440` |
| `count_threshold` | `INTEGER` | Oui | Seuil de comptage (nombre d'opérations) | `5` |
| `version` | `INTEGER` | Non | Version de la règle (incrémentée à chaque modification, défaut : 1) | `3` |
| `created_by` | `INTEGER` FK→`users.id` | Oui | Créateur de la règle | `1` |
| `updated_by` | `INTEGER` FK→`users.id` | Oui | Dernier modificateur | `2` |
| `created_at` | `TIMESTAMP` | Non | Date de création | `2024-01-10T08:00:00Z` |
| `updated_at` | `TIMESTAMP` | Non | Dernière mise à jour | `2024-09-01T10:00:00Z` |

**Index :** `aml_rules_rule_id_idx` (UNIQUE), `aml_rules_status_idx`, `aml_rules_category_idx`

**Règles métier :**
- Le statut `TESTING` permet le backtesting sans générer d'alertes en production.
- Toute modification incrémente `version` — l'historique d'exécution référence `rule_id` (pas `id`) pour la lisibilité.
- Le format `conditions` JSONB supporte les opérateurs : `>=`, `<=`, `>`, `<`, `=`, `IN`, `NOT_IN`, et la logique `AND`/`OR` imbriquée.

---

### 2.11 `aml_rule_executions`

**Description :** Historique de chaque exécution d'une règle AML sur une transaction spécifique. Permet le backtesting, le monitoring des performances et l'audit réglementaire.

**Rôle métier :** Traçabilité du moteur AML. Permet de rejouer des règles sur des données historiques et de mesurer les performances (temps d'exécution, taux de déclenchement).

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `45892` |
| `rule_id` | `INTEGER` FK→`aml_rules.id` | Non | Règle exécutée (CASCADE DELETE) | `12` |
| `transaction_id` | `INTEGER` FK→`transactions.id` | Oui | Transaction évaluée | `8941` |
| `customer_id` | `INTEGER` FK→`customers.id` | Oui | Client évalué | `42` |
| `triggered` | `BOOLEAN` | Non | La règle a-t-elle été déclenchée (défaut : false) | `true` |
| `score` | `INTEGER` | Non | Score attribué lors de l'exécution (0-100, défaut : 0) | `70` |
| `details` | `JSONB` | Oui | Contexte d'exécution (valeurs comparées, résultat) | `{"amount":15000,"threshold":10000,"delta":5000}` |
| `execution_ms` | `INTEGER` | Oui | Durée d'exécution en millisecondes (monitoring perf) | `12` |
| `created_at` | `TIMESTAMP` | Non | Horodatage de l'exécution | `2024-11-15T14:32:08Z` |

**Index :** `aml_exec_rule_idx`, `aml_exec_tx_idx`, `aml_exec_date_idx`, `aml_exec_triggered_idx`

**Règles métier :** Volume élevé — archivage recommandé après 90 jours pour les enregistrements non déclenchés. Les enregistrements `triggered = true` doivent être conservés 5 ans (LCB-FT).

---

### 2.12 `aml_rule_feedback`

**Description :** Retours des analystes sur les faux positifs générés par les règles AML. Alimente le réentraînement du modèle ML.

**Rôle métier :** Boucle de rétroaction pour l'amélioration continue du moteur AML. Permet de calculer le taux de faux positifs par règle et de prioriser les ajustements.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `2201` |
| `rule_id` | `INTEGER` FK→`aml_rules.id` | Non | Règle concernée (CASCADE DELETE) | `12` |
| `user_id` | `INTEGER` FK→`users.id` | Oui | Analyste ayant fourni le feedback | `7` |
| `type` | `VARCHAR(30)` | Non | Type de feedback (défaut : `FALSE_POSITIVE`) | `FALSE_POSITIVE` |
| `note` | `TEXT` | Oui | Commentaire explicatif | `Virement récurrent salarié — pas suspect` |
| `created_at` | `TIMESTAMP` | Non | Date du feedback | `2024-11-16T11:00:00Z` |

**Index :** `aml_feedback_rule_idx`, `aml_feedback_date_idx`

**Valeurs de `type` :** `FALSE_POSITIVE`, `TRUE_POSITIVE`, `THRESHOLD_TOO_LOW`, `THRESHOLD_TOO_HIGH`, `RULE_IRRELEVANT`

---

### 2.13 `audit_logs`

**Description :** Journal d'audit complet de toutes les actions effectuées sur la plateforme. Enregistrement immuable pour la conformité réglementaire et la sécurité.

**Rôle métier :** Conformité LCB-FT (conservation 5 ans), détection des accès anormaux, investigation post-incident. Alimente les rapports d'audit réglementaires.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `892341` |
| `user_id` | `INTEGER` FK→`users.id` | Oui | Utilisateur ayant effectué l'action (null si système) | `7` |
| `action` | `VARCHAR(200)` | Non | Code de l'action effectuée | `CUSTOMER_KYC_APPROVED` |
| `entity_type` | `VARCHAR(100)` | Non | Type d'entité concernée | `customer` |
| `entity_id` | `VARCHAR(100)` | Oui | Identifiant de l'entité concernée | `42` |
| `details` | `JSONB` | Oui | Détails de l'action (avant/après, paramètres) | `{"before":"PENDING","after":"APPROVED"}` |
| `ip_address` | `VARCHAR(50)` | Oui | Adresse IP de l'acteur | `192.168.1.45` |
| `user_agent` | `TEXT` | Oui | User-Agent du client HTTP | `Mozilla/5.0 ...` |
| `created_at` | `TIMESTAMP` | Non | Horodatage de l'action | `2024-11-16T09:05:00Z` |

**Index :** `audit_logs_user_idx`, `audit_logs_entity_idx`, `audit_logs_action_idx`, `audit_logs_created_at_idx`

**Règles métier :**
- Les entrées sont **immuables** — aucune mise à jour ou suppression n'est autorisée.
- Conservation minimale : **5 ans** (directive LCB-FT, recommandation GAFI).
- Les actions système (scheduler, webhook) ont `user_id = NULL`.

---

### 2.14 `ubos`

**Description :** Bénéficiaires Effectifs Ultimes (BEU/UBO) des clients de type CORPORATE. Représente les personnes physiques qui contrôlent in fine l'entité cliente.

**Rôle métier :** Conformité au Registre des Bénéficiaires Effectifs (RBE). Obligation KYC pour toutes les entreprises : identifier les personnes détenant plus de 25% du capital ou des droits de vote.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `88` |
| `customer_id` | `INTEGER` FK→`customers.id` | Non | Entité cliente parente (CASCADE DELETE) | `42` |
| `first_name` | `VARCHAR(100)` | Non | Prénom du bénéficiaire effectif | `Jean` |
| `last_name` | `VARCHAR(100)` | Non | Nom de famille | `Dupont` |
| `nationality` | `VARCHAR(10)` | Oui | Nationalité (ISO 3166-1 alpha-2) | `FR` |
| `date_of_birth` | `VARCHAR(20)` | Oui | Date de naissance (ISO 8601) | `1960-07-22` |
| `ownership_percentage` | `NUMERIC(5,2)` | Oui | Pourcentage de détention | `51.00` |
| `role` | `VARCHAR(100)` | Oui | Fonction dans l'entité | `Directeur Général` |
| `pep_status` | `BOOLEAN` | Non | Personne Politiquement Exposée (défaut : false) | `false` |
| `sanction_status` | `ENUM(sanction_status)` | Non | Statut sanctions (défaut : `PENDING`) | `CLEAR` |
| `created_at` | `TIMESTAMP` | Non | Date d'enregistrement | `2024-11-15T14:30:00Z` |

**Index :** `ubos_customer_idx`

**Règles métier :**
- Obligatoire pour `customer_type = CORPORATE` (directive 5e AMLD).
- Un UBO avec `pep_status = true` déclenche la Vigilance Renforcée pour l'entité cliente.
- Le seuil réglementaire de déclaration est 25% (modifiable par juridiction).

---

### 2.15 `pkyc_snapshots`

**Description :** Instantanés de dérive comportementale calculés nuitièrement par le module pKYC (Perpetual KYC). Mesure l'écart entre le comportement récent d'un client et sa baseline historique.

**Rôle métier :** Identification proactive des clients dont le comportement transactionnel a significativement évolué, nécessitant une revue KYC sans attendre la prochaine échéance calendaire.

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `10234` |
| `customer_id` | `INTEGER` FK→`customers.id` | Non | Client analysé (CASCADE DELETE) | `42` |
| `snapshot_date` | `TIMESTAMP` | Non | Date du calcul du snapshot | `2024-11-15T01:00:00Z` |
| `drift_score` | `INTEGER` | Non | Score de dérive global (0-100, défaut : 0) | `67` |
| `drift_factors` | `JSONB` | Oui | Décomposition du score par facteur de dérive | `{"volumeDrift":0.8,"frequencyDrift":0.2,...}` |
| `review_triggered` | `BOOLEAN` | Non | Revue KYC déclenchée (score > PKYC_DRIFT_THRESHOLD) | `true` |
| `baseline_days` | `INTEGER` | Non | Fenêtre de référence en jours (défaut : 30) | `30` |
| `window_days` | `INTEGER` | Non | Fenêtre d'analyse récente en jours (défaut : 7) | `7` |

**Index :** `pkyc_customer_idx`, `pkyc_date_idx`, `pkyc_score_idx`

**Facteurs de dérive dans `drift_factors` :**

| Facteur | Description |
|---------|-------------|
| `volumeDrift` | Variation du volume transactionnel total |
| `frequencyDrift` | Variation de la fréquence des transactions |
| `geoDrift` | Apparition de nouveaux pays de contrepartie |
| `amountSpike` | Montant unitaire anormalement élevé |
| `newCounterparties` | Nouvelles contreparties non vues dans la baseline |
| `newCountries` | Nouveaux pays non présents dans la baseline |

---

### 2.16 `jurisdiction_profiles`

**Description :** Profils de configuration des juridictions AML. Définit les seuils réglementaires, les obligations de déclaration et les paramètres du régulateur pour chaque pays ou zone géographique.

**Rôle métier :** Paramétrage multi-juridictionnel de la plateforme. Permet d'opérer dans plusieurs pays avec des règles différentes (seuils STR, délais de déclaration, format goAML).

| Champ | Type SQL | Nullable | Description métier | Exemple |
|-------|----------|----------|--------------------|---------|
| `id` | `SERIAL` PK | Non | Identifiant interne | `1` |
| `jurisdiction_code` | `VARCHAR(10)` UNIQUE | Non | Code ISO de la juridiction | `FR` |
| `jurisdiction_name` | `VARCHAR(200)` | Non | Nom complet de la juridiction | `France` |
| `is_active` | `BOOLEAN` | Non | Juridiction active (défaut : true) | `true` |
| `threshold_single_tx` | `NUMERIC(15,2)` | Oui | Seuil de déclaration transaction unique | `10000.00` |
| `threshold_structuring` | `NUMERIC(15,2)` | Oui | Seuil de détection de structuration | `3000.00` |
| `structuring_window_h` | `INTEGER` | Oui | Fenêtre de détection structuration (heures) | `24` |
| `frequency_threshold` | `INTEGER` | Oui | Nombre max de transactions sur la fenêtre | `10` |
| `cash_threshold` | `NUMERIC(15,2)` | Oui | Seuil pour les opérations en espèces | `1000.00` |
| `currency_code` | `VARCHAR(10)` | Non | Devise de référence (défaut : `EUR`) | `EUR` |
| `str_mandatory_above` | `NUMERIC(15,2)` | Oui | Seuil de déclaration STR obligatoire | `50000.00` |
| `str_delay_hours` | `INTEGER` | Oui | Délai légal de déclaration STR (heures, défaut : 24) | `24` |
| `sar_delay_hours` | `INTEGER` | Oui | Délai légal de déclaration SAR (heures, défaut : 72) | `72` |
| `enhanced_dd_pep` | `BOOLEAN` | Non | Vigilance Renforcée obligatoire pour PEP (défaut : true) | `true` |
| `enhanced_dd_high_risk` | `BOOLEAN` | Non | Vigilance Renforcée obligatoire pour clients HIGH_RISK (défaut : true) | `true` |
| `regulator_name` | `VARCHAR(200)` | Oui | Nom de l'autorité de régulation | `TRACFIN` |
| `regulator_code` | `VARCHAR(50)` | Oui | Code identifiant du régulateur | `TRACFIN-FR` |
| `goaml_entity_type` | `VARCHAR(50)` | Oui | Type d'entité pour le reporting goAML | `BANK` |
| `reporting_format` | `VARCHAR(50)` | Non | Format de reporting (défaut : `GOAML_2`) | `GOAML_2` |
| `covered_countries` | `JSONB` | Non | Liste des codes pays couverts par ce profil | `["FR","MC","GP","MQ"]` |
| `created_by` | `INTEGER` FK→`users.id` | Oui | Créateur du profil | `1` |
| `updated_by` | `INTEGER` FK→`users.id` | Oui | Dernier modificateur | `2` |
| `created_at` | `TIMESTAMP` | Non | Date de création | `2024-01-01T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | Non | Dernière mise à jour | `2024-11-01T00:00:00Z` |

**Index :** UNIQUE sur `jurisdiction_code`

---

## 3. Référence complète des enums

### `user_role`
| Valeur | Description | Droits principaux |
|--------|-------------|-------------------|
| `user` | Utilisateur standard | Lecture seule |
| `analyst` | Analyste compliance | Traitement alertes, mise à jour KYC |
| `supervisor` | Superviseur | Validation, gel avoirs, escalade |
| `compliance_officer` | Responsable conformité | Décision SAR/STR, approbation rapports |
| `admin` | Administrateur | Administration complète, pKYC force run |

### `customer_type`
| Valeur | Description |
|--------|-------------|
| `INDIVIDUAL` | Personne physique |
| `CORPORATE` | Personne morale / Entreprise |
| `PEP` | Personne Politiquement Exposée (catégorie propre) |
| `FOREIGN` | Ressortissant étranger à risque élevé |

### `kyc_status`
| Valeur | Description | Transition autorisée |
|--------|-------------|----------------------|
| `PENDING` | En attente de traitement | → `IN_REVIEW` |
| `IN_REVIEW` | Dossier en cours d'examen | → `APPROVED`, `REJECTED` |
| `APPROVED` | KYC validé | → `EXPIRED` |
| `REJECTED` | KYC refusé | → `PENDING` (re-soumission) |
| `EXPIRED` | KYC expiré — revue requise | → `IN_REVIEW` |

### `risk_level`
| Valeur | Description | Vigilance requise |
|--------|-------------|-------------------|
| `LOW` | Risque faible | Vigilance simplifiée (SDD) |
| `MEDIUM` | Risque moyen | Vigilance standard (CDD) |
| `HIGH` | Risque élevé | Vigilance Renforcée (EDD) |
| `CRITICAL` | Risque critique | EDD + approbation superviseur |

### `sanction_status`
| Valeur | Description |
|--------|-------------|
| `CLEAR` | Aucune correspondance dans les listes |
| `MATCH` | Correspondance confirmée — action requise |
| `REVIEW` | Correspondance possible — révision manuelle requise |
| `PENDING` | Screening non encore effectué |

### `document_type`
| Valeur | Description |
|--------|-------------|
| `PASSPORT` | Passeport biométrique |
| `ID_CARD` | Carte nationale d'identité |
| `DRIVING_LICENSE` | Permis de conduire |
| `PROOF_OF_ADDRESS` | Justificatif de domicile |
| `SELFIE` | Photo selfie pour vérification faciale |
| `BANK_STATEMENT` | Relevé bancaire (justificatif de fonds) |
| `OTHER` | Autre document |

### `document_status`
| Valeur | Description |
|--------|-------------|
| `PENDING` | En attente de vérification |
| `VERIFIED` | Vérifié et authentifié |
| `REJECTED` | Rejeté (document invalide, frauduleux, illisible) |
| `EXPIRED` | Document expiré |

### `ekyc_status`
| Valeur | Description |
|--------|-------------|
| `PENDING` | Pas encore analysé |
| `PROCESSING` | OCR en cours |
| `PASS` | Tous les contrôles validés |
| `REVIEW` | Contrôles partiels — révision manuelle requise |
| `FAIL` | Contrôles échoués (document frauduleux détecté) |

### `transaction_type`
| Valeur | Description |
|--------|-------------|
| `TRANSFER` | Virement (national ou international) |
| `DEPOSIT` | Dépôt (espèces ou chèque) |
| `WITHDRAWAL` | Retrait |
| `PAYMENT` | Paiement (carte, virement commercial) |
| `EXCHANGE` | Change de devises |

### `channel`
| Valeur | Description |
|--------|-------------|
| `ONLINE` | Banque en ligne / web |
| `MOBILE` | Application mobile |
| `BRANCH` | Agence physique |
| `ATM` | Distributeur automatique |
| `API` | Intégration CBS via API/webhook |

### `transaction_status`
| Valeur | Description |
|--------|-------------|
| `PENDING` | En attente de traitement AML |
| `COMPLETED` | Traitée — aucun risque détecté |
| `FLAGGED` | Suspecte — alerte générée |
| `BLOCKED` | Bloquée manuellement |
| `REVERSED` | Annulée / Contre-passée |

### `alert_type`
| Valeur | Description |
|--------|-------------|
| `THRESHOLD` | Dépassement de seuil monétaire |
| `PATTERN` | Pattern comportemental (ex: structuration) |
| `VELOCITY` | Vélocité anormale (volume/fréquence) |
| `SANCTIONS` | Match liste de sanctions |
| `PEP` | Personne Politiquement Exposée détectée |
| `FRAUD` | Suspicion de fraude |
| `NETWORK` | Anomalie détectée dans le réseau de transactions |

### `alert_priority`
| Valeur | SLA de traitement |
|--------|------------------|
| `LOW` | 5 jours ouvrés |
| `MEDIUM` | 3 jours ouvrés |
| `HIGH` | 24 heures |
| `CRITICAL` | 4 heures |

### `alert_status`
| Valeur | Description |
|--------|-------------|
| `OPEN` | Alerte ouverte — non traitée |
| `IN_REVIEW` | En cours d'analyse par un analyste |
| `ESCALATED` | Escaladée vers un superviseur ou un dossier |
| `CLOSED` | Clôturée après traitement |
| `FALSE_POSITIVE` | Faux positif confirmé |

### `case_status`
| Valeur | Description |
|--------|-------------|
| `OPEN` | Dossier ouvert |
| `UNDER_INVESTIGATION` | Investigation active |
| `PENDING_APPROVAL` | En attente de validation superviseur |
| `ESCALATED` | Escaladé à la hiérarchie |
| `CLOSED` | Clôturé sans suite |
| `SAR_SUBMITTED` | Déclaration de soupçon soumise |

### `case_decision`
| Valeur | Description |
|--------|-------------|
| `PENDING` | Décision non encore prise |
| `CLOSED_NO_ACTION` | Classé sans suite |
| `ESCALATED` | Escalade hiérarchique |
| `SAR_FILED` | Déclaration de Soupçon déposée |
| `STR_FILED` | Déclaration de Transaction Suspecte déposée |

### `screening_type`
| Valeur | Description | Listes utilisées |
|--------|-------------|-----------------|
| `SANCTIONS` | Sanctions internationales | OFAC SDN, EU, ONU, UK, BAM |
| `PEP` | Personnes Politiquement Exposées | OpenSanctions PEP |
| `ADVERSE_MEDIA` | Médias adverses | Agrégateurs tiers |

### `screening_decision`
| Valeur | Description |
|--------|-------------|
| `CONFIRMED` | Match confirmé — mesures d'escalade requises |
| `DISMISSED` | Match écarté (homonymie, etc.) |
| `ESCALATED` | Escaladé pour décision hiérarchique |
| `PENDING` | Décision non encore prise |

### `report_type`
| Valeur | Description |
|--------|-------------|
| `SAR` | Suspicious Activity Report (Déclaration de Soupçon — DOS) |
| `STR` | Suspicious Transaction Report |
| `AML_STATISTICS` | Statistiques AML périodiques |
| `RISK_ASSESSMENT` | Évaluation nationale des risques |
| `COMPLIANCE` | Rapport de conformité réglementaire |
| `CUSTOM` | Rapport personnalisé |

### `aml_rule_category`
| Valeur | Description | Exemples de règles |
|--------|-------------|-------------------|
| `THRESHOLD` | Seuils monétaires | Transaction > 10 000 EUR |
| `FREQUENCY` | Fréquence d'opérations | Plus de 10 tx en 24h |
| `PATTERN` | Patterns comportementaux | Structuration (montants juste sous seuil) |
| `GEOGRAPHY` | Géographie et pays à risque | Contrepartie dans un pays GAFI non-coopératif |
| `COUNTERPARTY` | Contrepartie suspecte | Nouveau bénéficiaire inconnu + montant élevé |
| `VELOCITY` | Vélocité et volume | Volume x3 vs baseline 30 jours |
| `CUSTOMER` | Profil client | Client PEP ou CRITICAL + transaction |

---

## 4. Description du modèle ERD

### Entité centrale : `customers`

`customers` est l'entité pivot du modèle. Elle est référencée par :
- `transactions` (1–N) : toutes les transactions d'un client
- `alerts` (1–N) : toutes les alertes générées pour un client
- `cases` (1–N) : tous les dossiers d'investigation
- `documents` (1–N) : tous les documents d'identité (CASCADE)
- `ubos` (1–N) : bénéficiaires effectifs (CASCADE)
- `screening_results` (1–N) : résultats de screening
- `pkyc_snapshots` (1–N) : snapshots pKYC (CASCADE)
- `reports` (0–N) : rapports impliquant le client

### Flux principal (transaction → alerte → dossier → rapport)

```
CBS/webhook
    │
    ▼
transactions ──────────────► aml_rule_executions
    │                                │
    │ (si score > seuil)             │ (historique)
    ▼                                │
alerts ◄─────────────────────────────┘
    │
    │ (escalade)
    ▼
cases ──────► case_timeline (immuable)
    │
    │ (décision SAR/STR)
    ▼
reports ──────► [TRACFIN / BAM / goAML]
```

### Relations clés

| Table source | Champ FK | Table cible | Cardinalité | On Delete |
|-------------|----------|-------------|-------------|-----------|
| `customers` | `assigned_analyst` | `users` | N:1 | SET NULL |
| `transactions` | `customer_id` | `customers` | N:1 | RESTRICT |
| `alerts` | `customer_id` | `customers` | N:1 | RESTRICT |
| `alerts` | `transaction_id` | `transactions` | N:1 | SET NULL |
| `cases` | `customer_id` | `customers` | N:1 | RESTRICT |
| `case_timeline` | `case_id` | `cases` | N:1 | CASCADE |
| `documents` | `customer_id` | `customers` | N:1 | CASCADE |
| `ubos` | `customer_id` | `customers` | N:1 | CASCADE |
| `screening_results` | `customer_id` | `customers` | N:1 | RESTRICT |
| `pkyc_snapshots` | `customer_id` | `customers` | N:1 | CASCADE |
| `aml_rule_executions` | `rule_id` | `aml_rules` | N:1 | CASCADE |
| `aml_rule_feedback` | `rule_id` | `aml_rules` | N:1 | CASCADE |
| `reports` | `case_id` | `cases` | N:1 | RESTRICT |

---

## 5. Lignage des données

### Cycle de vie d'un client

```
Création (API/CBS)
    ↓
customers.kyc_status = PENDING
    ↓
Upload documents → documents.ekyc_status → PASS/FAIL
    ↓
Screening → screening_results → customers.sanction_status
    ↓
Décision analyste → customers.kyc_status = APPROVED/REJECTED
    ↓
[pKYC nuitier] → pkyc_snapshots → si drift_score > seuil → revue
```

### Cycle de vie d'une transaction

```
Réception (webhook CBS ou API directe)
    ↓
transactions (création)
    ↓
Moteur AML → aml_rule_executions (N règles évaluées)
    ↓
risk_score calculé → transactions.risk_score + risk_rules (JSONB)
    ↓
Si score > seuil → alerts (création automatique)
    ↓
Analyste → alerts.status = IN_REVIEW
    ↓
Décision → alerts.status = CLOSED / FALSE_POSITIVE / ESCALATED
    ↓
Si ESCALATED → cases (dossier d'investigation)
    ↓
Investigation → case_timeline (immuable)
    ↓
Décision finale → cases.decision = SAR_FILED / CLOSED_NO_ACTION
    ↓
Si SAR_FILED → reports (génération) → soumission autorité
```

### Sources de données externes

| Source | Données ingérées | Table cible | Fréquence |
|--------|-----------------|-------------|-----------|
| CBS (webhook) | Transactions | `transactions` | Temps réel |
| OFAC SDN XML | Liste sanctions US | Mémoire/Redis | Quotidien 02h00 |
| EU Sanctions XML | Liste sanctions UE | Mémoire/Redis | Quotidien 02h00 |
| UN Consolidated XML | Liste ONU | Mémoire/Redis | Quotidien 02h00 |
| UK Sanctions XML | Liste UK | Mémoire/Redis | Quotidien 02h00 |
| OpenSanctions CSV | PEP | Mémoire/Redis | Quotidien 02h00 |
| BAM (Maroc) | Liste nationale | Mémoire/Redis | Selon configuration |
| ML Service (Python) | Scores ML | `transactions.risk_score` | Temps réel |

---

## 6. Classification RGPD et sensibilité des données

### Table `users`

| Champ | Classification | Base légale RGPD |
|-------|---------------|-----------------|
| `email` | CONFIDENTIAL | Intérêt légitime (employeur) |
| `password_hash` | RESTRICTED | Intérêt légitime |
| `mfa_secret` | RESTRICTED | Intérêt légitime |
| `mfa_backup_codes` | RESTRICTED | Intérêt légitime |
| `name` | CONFIDENTIAL | Intérêt légitime |
| `last_signed_in` | INTERNAL | Intérêt légitime |

### Table `customers`

| Champ | Classification | Base légale RGPD |
|-------|---------------|-----------------|
| `first_name`, `last_name` | RESTRICTED | Obligation légale (LCB-FT) |
| `email`, `phone` | RESTRICTED | Obligation légale |
| `date_of_birth` | RESTRICTED | Obligation légale |
| `nationality`, `residence_country` | CONFIDENTIAL | Obligation légale |
| `address`, `city` | RESTRICTED | Obligation légale |
| `profession`, `employer` | CONFIDENTIAL | Obligation légale |
| `source_of_funds`, `monthly_income` | CONFIDENTIAL | Obligation légale |
| `risk_score`, `risk_level` | INTERNAL | Intérêt légitime |
| `pep_status` | CONFIDENTIAL | Obligation légale |
| `frozen_reason` | INTERNAL | Obligation légale |
| `notes` | CONFIDENTIAL | Intérêt légitime |

### Table `documents`

| Champ | Classification |
|-------|---------------|
| `file_path`, `file_url` | RESTRICTED |
| `ocr_raw_text` | RESTRICTED |
| `ocr_data`, `mrz_data` | RESTRICTED |
| `document_number` | RESTRICTED |
| `ekyc_checks` | CONFIDENTIAL |

### Table `transactions`

| Champ | Classification |
|-------|---------------|
| `amount`, `currency` | CONFIDENTIAL |
| `counterparty`, `counterparty_bank` | CONFIDENTIAL |
| `purpose` | CONFIDENTIAL |
| `risk_rules` | INTERNAL |

### Tables `audit_logs`, `case_timeline`

| Classification générale | INTERNAL (opérationnelle) / CONFIDENTIAL (si détails PII) |
|------------------------|----------------------------------------------------------|
| Conservation | 5 ans minimum (LCB-FT) |
| Droit à l'effacement | **Non applicable** (obligation légale) |

---

## 7. Champs chiffrés PII

La plateforme chiffre optionnellement les données PII en base avec **AES-256-GCM** (clé `PII_ENCRYPTION_KEY`). En production, ce chiffrement est **obligatoire**.

### Champs chiffrés côté application (avant stockage)

| Table | Champ | Algorithme | Clé utilisée |
|-------|-------|-----------|-------------|
| `users` | `mfa_secret` | AES-256-GCM | `MFA_ENCRYPTION_KEY` |
| `customers` | `first_name`, `last_name` | AES-256-GCM | `PII_ENCRYPTION_KEY` |
| `customers` | `email`, `phone` | AES-256-GCM | `PII_ENCRYPTION_KEY` |
| `customers` | `date_of_birth` | AES-256-GCM | `PII_ENCRYPTION_KEY` |
| `customers` | `address` | AES-256-GCM | `PII_ENCRYPTION_KEY` |
| `ubos` | `first_name`, `last_name`, `date_of_birth` | AES-256-GCM | `PII_ENCRYPTION_KEY` |

### Chiffrement au niveau stockage

- **Local** : Fichiers documents stockés dans `UPLOAD_DIR` — chiffrement disque recommandé.
- **S3** : Chiffrement SSE-S3 ou SSE-KMS activé obligatoirement (`STORAGE_BACKEND=s3`).
- **PostgreSQL** : Chiffrement TDE (Transparent Data Encryption) recommandé en production.
- **Redis** : Les tokens JWT en cache ne contiennent pas de données PII — seul le `userId` et le `jti` sont stockés.

### Gestion des clés

Les clés de chiffrement doivent être gérées via **HashiCorp Vault** en production (`VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_PATH`). La rotation des clés nécessite un processus de re-chiffrement planifié.
