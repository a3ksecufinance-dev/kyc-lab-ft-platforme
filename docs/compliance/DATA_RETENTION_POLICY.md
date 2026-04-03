# Politique de Rétention et de Suppression des Données
## KYC-AML Platform v2.5 — Conforme RGPD + AMLD6

**Version : 2.5 — Janvier 2026 | Classification : Confidentiel — Usage interne**
**Propriétaire : DPO / Équipe Conformité | Approbateur : Compliance Officer + DPO**
**Prochaine révision : Janvier 2027**

---

## 1. OBJECTIF ET BASE LÉGALE

### 1.1 Objectif

La présente politique définit les règles de rétention, d'archivage et de suppression des données traitées par la plateforme KYC-AML Platform v2.5. Elle vise à :
- Respecter les obligations légales de conservation imposées par la réglementation LAB/FT ;
- Mettre en oeuvre le principe de limitation de la conservation prévu par le RGPD ;
- Définir des procédures claires pour l'archivage, l'effacement et la destruction sécurisée des données ;
- Permettre aux institutions financières clientes de justifier leur politique de rétention auprès des autorités de contrôle.

### 1.2 Base légale — Tableau de synthèse

| Réglementation | Disposition | Obligation de conservation | Catégorie de données |
|----------------|------------|--------------------------|---------------------|
| **AMLD6** | Art.40 | 5 ans à compter de la fin de la relation d'affaires ou de la transaction occasionnelle | Données KYC, documents d'identité, données transactionnelles |
| **FATF** | Recommandation 11 | 5 ans minimum (les pays peuvent imposer jusqu'à 10 ans) | Résultats des mesures de vigilance, données de transactions |
| **FATF** | Recommandation 20 | 10 ans pour les Suspicious Activity Reports (SAR) | Déclarations de soupçon et dossiers d'investigation |
| **Code monétaire et financier (France)** | Art. L.561-12 | 5 ans après la fin de la relation | Documents et informations relatifs aux opérations |
| **BAM Circ. 5/W/2023 (Maroc)** | Section VII | 10 ans | Opérations financières et données associées |
| **RGPD** | Art.5(1)(e) | Limitation de la conservation — données ne doivent pas être conservées au-delà du nécessaire | Toutes données à caractère personnel |
| **RGPD** | Art.17(3)(b) | Exception au droit à l'effacement si obligation légale de conservation | Données LAB/FT soumises à obligation légale |

### 1.3 Principe général

La politique de rétention applique le principe suivant : **les données sont conservées pendant la durée la plus longue des durées applicables** (obligation légale LAB/FT ou nécessité opérationnelle), dans la limite du strict nécessaire à chaque finalité. Passé ce délai, les données sont supprimées ou anonymisées de manière sécurisée et définitive.

---

## 2. TABLEAU DE RÉTENTION PAR CATÉGORIE

| # | Catégorie | Sous-catégorie | Durée active (base de données principale) | Durée archivage (archive froide chiffrée) | Durée totale de conservation | Base légale | Suppression automatique | Méthode de suppression |
|---|-----------|----------------|------------------------------------------|------------------------------------------|------------------------------|-------------|------------------------|----------------------|
| R-01 | **Données d'identité — Clients actifs** | Nom, prénom, date de naissance, nationalité, numéro de pièce d'identité, adresse, téléphone, email | Pendant toute la relation d'affaires | 5 ans post-clôture de la relation | Relation + 5 ans | AMLD6 Art.40 ; CMF Art.L.561-12 | Oui — déclenchée à J+5 ans après clôture | Pseudonymisation des champs PII + suppression de l'original |
| R-02 | **Données d'identité — Clients inactifs / clôturés** | Même périmètre que R-01 après clôture du compte | N/A (archivage immédiat à la clôture) | 5 ans post-clôture | 5 ans post-clôture | AMLD6 Art.40 | Oui — déclenchée à J+5 ans après clôture | Pseudonymisation des champs PII + suppression de l'original chiffré |
| R-03 | **Documents KYC** | CIN, passeport, carte de séjour, justificatif de domicile, extrait K-bis, statuts sociaux, procurations, attestations | Pendant la relation (accès rapide) | 5 ans post-clôture | Relation + 5 ans | AMLD6 Art.40 ; FATF R.11 | Oui — déclenchée à J+5 ans après clôture | Suppression sécurisée du fichier (écrasement cryptographique) + invalidation du lien de stockage |
| R-04 | **Transactions financières** | Montant, devise, date, donneur d'ordre, bénéficiaire, canal, référence, libellé, statut | 2 ans en base active (accès fréquent) | 8 ans en archive froide | **10 ans** | FATF R.11 (étendue nationale) ; BAM Circ.5/W/2023 (Maroc) | Oui — passage en archive à 2 ans, suppression à 10 ans | Archivage chiffré AES-256 → suppression définitive |
| R-05 | **Alertes AML et décisions** | Alertes générées, règle déclenchée, score, décision analyste (confirmé/infirmé/faux positif), justification | 2 ans en base active | 8 ans en archive froide | **10 ans** | FATF R.11 ; AMLD6 Art.40 ; cohérence avec dossiers d'investigation | Oui — passage en archive à 2 ans, suppression à 10 ans | Archivage chiffré → suppression définitive |
| R-06 | **Dossiers d'investigation (Cases)** | Toutes les données du dossier : alertes regroupées, preuves, commentaires, décisions, pièces jointes, timeline | 2 ans en base active | 8 ans en archive froide | **10 ans** | FATF R.11 ; AMLD6 Art.40 ; nécessité pour procédures judiciaires | Oui — passage en archive à 2 ans, suppression à 10 ans | Archivage chiffré + index → suppression définitive de l'index à 10 ans |
| R-07 | **Déclarations de soupçon (SAR / DS)** | Contenu de la déclaration, pièces jointes, accusé de réception, référence TRACFIN/UTRF, suites données | 2 ans en base active | 8 ans en archive froide | **10 ans** | FATF R.20 ; AMLD6 Art.33 ; exigences TRACFIN ; BAM Circ. | Oui — passage en archive à 2 ans, suppression à 10 ans | Archivage chiffré haute sécurité → suppression définitive |
| R-08 | **Résultats de screening sanctions** | Score de matching, source de liste, version de liste, décision, entrée correspondante, analyste | 2 ans en base active | 3 ans en archive froide | **5 ans** | AMLD6 Art.40 ; FATF R.6 | Oui — passage en archive à 2 ans, suppression à 5 ans | Suppression des PII → conservation des données agrégées |
| R-09 | **Snapshots pKYC comportementaux** | Score de dérive, facteurs contributifs, date du snapshot, comparaison avec baseline | 6 mois en cache actif | 18 mois en archive (pour analyse de tendance) | **2 ans** | Nécessité analytique pour la surveillance continue ; FATF R.10 | Oui — suppression automatique à 2 ans | Suppression des snapshots ; conservation du score courant uniquement |
| R-10 | **Logs d'audit applicatifs** | Actions utilisateurs : connexion, accès, modification, export ; timestamp, userId, IP, ressource, avant/après | 1 an en log actif (accès direct Loki) | 4 ans en archive compressée chiffrée | **5 ans** | AMLD6 Art.40 (traçabilité) ; RGPD Art.5(1)(f) (intégrité/confidentialité) | Oui — passage en archive à 1 an, suppression à 5 ans | Compression + chiffrement → suppression définitive |
| R-11 | **Sessions JWT / Tokens d'accès** | Access Token JWT (courte durée), Refresh Token (longue durée), blacklist des tokens révoqués | Access Token : 15 minutes (expiration automatique Redis) ; Refresh Token : 7 jours (expiration automatique Redis) ; Blacklist : 7 jours | N/A | **15 min (AT) / 7 jours (RT)** | Sécurité technique ; RGPD Art.5(1)(e) | Oui — expiration automatique Redis (TTL) | Expiration TTL Redis (pas de suppression explicite nécessaire) |
| R-12 | **Données UBO (Bénéficiaires Effectifs)** | Identité des bénéficiaires effectifs, pourcentage de détention, date de désignation, source de vérification | Pendant la relation d'affaires | 5 ans post-clôture de la relation | Relation + 5 ans | AMLD6 Art.45 ; FATF R.24 | Oui — déclenchée à J+5 ans après clôture | Pseudonymisation des PII + suppression des originaux chiffrés |
| R-13 | **Emails de notification** | Contenu des emails transactionnels envoyés via Resend.com (alertes, rapports, notifications d'incident) | N/A côté plateforme (gestion Resend) | 6 mois (logs d'envoi internes) | **6 mois** | Nécessité opérationnelle (support, débogage) | Oui — suppression des logs d'envoi à 6 mois | Suppression des logs ; les emails sont hors de la plateforme une fois envoyés |
| R-14 | **Données de configuration** | Paramètres des règles AML, seuils, listes blanches, configuration organisationnelle | Pendant la durée du contrat | 2 ans post-fin de contrat (pour justification de la configuration à une date donnée) | Contrat + 2 ans | Nécessité de justification de conformité ; AMLD6 (approche basée risques) | Oui — passage en archive à fin de contrat, suppression à 2 ans post-fin | Archivage chiffré → suppression définitive |

---

## 3. PROCÉDURE D'EFFACEMENT (RIGHT TO ERASURE / ART.17 RGPD)

### 3.1 Principe de limitation du droit à l'effacement

L'article 17(3)(b) du RGPD prévoit explicitement que le droit à l'effacement ne s'applique pas lorsque le traitement est nécessaire au respect d'une obligation légale qui requiert le traitement en vertu du droit de l'Union ou du droit d'un État membre auquel le responsable du traitement est soumis.

En conséquence, les données LAB/FT (données transactionnelles, alertes AML, dossiers d'investigation, déclarations de soupçon, résultats de screening) **ne peuvent pas faire l'objet d'un effacement complet** pendant les durées légales de conservation obligatoire, nonobstant toute demande de la personne concernée.

### 3.2 Procédure de réponse à une demande d'effacement

Lorsque le Client (Responsable de Traitement) reçoit une demande d'exercice du droit à l'effacement (Art.17 RGPD) et le transmet à la plateforme :

**Étape 1 — Identification de la personne concernée**
- Vérification de l'identité du demandeur
- Localisation de l'ensemble des données associées à la personne dans la plateforme (via l'API d'export `GET /customers/{id}/data-export`)
- Évaluation de l'applicabilité du droit à l'effacement

**Étape 2 — Décision sur l'effacement ou la pseudonymisation**

| Catégorie de données | Action | Justification |
|---------------------|--------|--------------|
| Données d'identité PII (nom, prénom, date de naissance, numéro de pièce d'identité, adresse, email, téléphone) | **Pseudonymisation** | Obligation de conservation LAB/FT — effacement complet impossible mais les PII sont remplacés par des identifiants pseudonymes |
| Documents d'identité (scans) | **Suppression** si délai AMLD6 écoulé ; **Pseudonymisation du lien** sinon | Documents non nécessaires à la justification de la surveillance LAB/FT si délai légal écoulé |
| Données transactionnelles (montants, dates, canaux) | **Conservation obligatoire** — non effaçables pendant 10 ans | Obligation légale FATF R.11 / BAM |
| Alertes AML et dossiers | **Conservation obligatoire** | Obligation légale FATF R.11 |
| Déclarations de soupçon | **Conservation obligatoire — 10 ans** | Obligation légale FATF R.20 |
| Données de scoring et pKYC | **Pseudonymisation** | Les scores sont disjoints des PII après pseudonymisation |
| Logs d'audit | **Conservation obligatoire** (mais PII pseudonymisés) | Traçabilité obligatoire |
| Sessions / Tokens | **Expiration automatique** (TTL Redis) — non concernés | Durée de vie très courte |

**Étape 3 — Exécution de la pseudonymisation**

La fonction `requestErasure(customerId)` exécute les opérations suivantes :

```
requestErasure(customerId) :
  1. Remplacement des champs PII dans la table customers :
     - first_name → "ANONYME_[hash court]"
     - last_name → "ANONYME_[hash court]"
     - date_of_birth → NULL
     - id_number → "ANONYMISÉ"
     - address → NULL
     - email → "anonyme-[hash]@deleted.local"
     - phone → NULL

  2. Suppression des documents physiques (fichiers) de stockage
     - Invalidation du lien de stockage dans la base
     - Suppression du fichier sur le stockage objet (S3 / local)

  3. Conservation des données non-PII :
     - customer_id (pseudonyme)
     - risk_score (historique)
     - transactions (montants, dates, canaux — sans PII contrepartie si possible)
     - alertes et décisions (sans PII)
     - screening_results (sans nom — score et source conservés)

  4. Enregistrement de l'opération d'effacement dans l'audit trail :
     - erasure_requested_at (timestamp)
     - erasure_executed_at (timestamp)
     - erasure_executed_by (userId du Compliance Officer)
     - erasure_scope (liste des champs pseudonymisés / suppressions)

  5. Génération d'une attestation d'effacement partiel (PDF)
```

**Étape 4 — Réponse au demandeur**

Le Client (RT) répond à la personne concernée dans un délai maximum de **30 jours** à compter de la réception de la demande :
- Confirmation de l'effacement des données PII ;
- Explication de la limitation légale (obligation LAB/FT) justifiant la conservation des données non-PII ;
- Base légale invoquée (Art.17(3)(b) RGPD + obligation LAB/FT applicable).

### 3.3 Droit à la portabilité (Art.20 RGPD)

Le droit à la portabilité peut être exercé pour les données fournies directement par la personne concernée. La plateforme fournit un export JSON structuré des données client via l'endpoint `GET /customers/{id}/data-export`. Les données d'analyse (scores, alertes) sont exclues du périmètre de portabilité car elles résultent d'un traitement élaboré par le RT.

---

## 4. PROCÉDURE D'ARCHIVAGE FROID

### 4.1 Définition

L'archivage froid désigne le transfert de données de la base de données active vers un stockage sécurisé hors ligne ou semi-offline, à coût réduit, pour la durée d'archivage définie dans le Tableau de Rétention (Section 2).

### 4.2 Déclenchement

L'archivage froid est déclenché automatiquement par des jobs planifiés :
- **Job quotidien** (03h00 UTC) : Détection des enregistrements ayant atteint leur durée de conservation active et transfert en archive ;
- **Job mensuel** (1er de chaque mois) : Vérification complète de la cohérence entre la base active et les archives ; génération du rapport de rétention.

### 4.3 Processus d'archivage

```
Archivage froid — Processus :
  1. Sélection des enregistrements à archiver
     (WHERE last_activity_date + active_retention_period <= NOW())

  2. Export au format JSON structuré avec métadonnées :
     - archive_id (UUID unique de l'archive)
     - archived_at (timestamp UTC)
     - retention_category (ex: TRANSACTION_10Y)
     - expiry_date (date de suppression définitive calculée)
     - encryption_key_version (référence de la clé de chiffrement)
     - checksum_sha256 (intégrité)

  3. Compression (gzip niveau 9)

  4. Chiffrement AES-256-GCM avec clé dédiée archive
     (clé distincte des clés de production)

  5. Stockage sur support hors-ligne ou stockage objet
     (OVH Object Storage "Archive" / S3 Glacier si déployé AWS)

  6. Mise à jour de l'index d'archive en base de données
     (permet la recherche et la restauration sur demande autorité)

  7. Suppression des enregistrements de la base active
     (HARD DELETE après confirmation de l'intégrité de l'archive)

  8. Log d'archivage dans l'audit trail
```

### 4.4 Restauration depuis l'archive

La restauration d'archives est possible dans les cas suivants :
- Demande d'une autorité judiciaire ou de contrôle ;
- Audit interne ou externe ;
- Contentieux nécessitant l'accès aux données historiques.

La restauration est tracée dans l'audit trail avec : date, demandeur, motif, données restaurées.

### 4.5 Sécurité des archives

| Mesure | Description |
|--------|-------------|
| Chiffrement | AES-256-GCM avec clé dédiée archive (rotation annuelle) |
| Intégrité | Checksum SHA-256 calculé avant et vérifié après restauration |
| Accès | Accès restreint aux seuls administrateurs avec MFA + approbation double |
| Géo-redondance | Copie sur deux sites géographiques distincts (pour les données 10 ans) |
| Test de restauration | Test semestriel de restauration d'un échantillon d'archives |

---

## 5. AUDIT ANNUEL DE LA RÉTENTION

### 5.1 Objectif

Un audit annuel de la politique de rétention est réalisé chaque janvier pour s'assurer que :
- Les durées de conservation sont conformes à la réglementation en vigueur ;
- Les suppressions automatiques se sont exécutées correctement ;
- Les archives sont intègres et récupérables ;
- La politique elle-même est à jour avec les évolutions réglementaires.

### 5.2 Checklist de l'audit annuel de rétention

**Section A — Vérification des suppressions**

- [ ] Rapport de toutes les suppressions automatiques exécutées au cours de l'année (catégorie, nombre d'enregistrements, date)
- [ ] Vérification que les suppressions correspondent aux durées définies dans le Tableau de Rétention (Section 2)
- [ ] Contrôle aléatoire d'un échantillon d'enregistrements : vérification que les données dont la durée de conservation est dépassée ont bien été supprimées
- [ ] Vérification de l'absence d'enregistrements "orphelins" (données non rattachées à un client actif ou archivé)

**Section B — Vérification des archives**

- [ ] Test de restauration d'un échantillon de 10 archives de chaque catégorie (intégrité checksum)
- [ ] Vérification des dates d'expiration des archives (aucune archive ne doit dépasser sa durée totale de conservation)
- [ ] Contrôle de la sécurité des accès aux archives (journaux d'accès)
- [ ] Vérification du chiffrement des archives (algorithme et version de clé)

**Section C — Conformité réglementaire**

- [ ] Revue des évolutions réglementaires de l'année (nouvelles obligations de conservation, modifications AMLD, FATF, BAM)
- [ ] Mise à jour du Tableau de Rétention si nécessaire
- [ ] Vérification de la conformité avec l'ATD (Accord de Traitement des Données)

**Section D — Rapport au DPO**

- [ ] Rédaction du rapport annuel de rétention
- [ ] Présentation au DPO et validation
- [ ] Intégration dans le registre des activités de traitement (Art.30 RGPD)

### 5.3 Livrables de l'audit

| Livrable | Destinataire | Délai |
|----------|-------------|-------|
| Rapport d'audit de rétention | DPO, Compliance Officer | Fin janvier |
| Mise à jour du Tableau de Rétention (si modifications) | Toutes équipes | Fin janvier |
| Attestation de conformité rétention | Direction | Fin février |

---

## 6. EXCEPTIONS ET CAS PARTICULIERS

### 6.1 Litiges en cours et contentieux

En cas de litige, de procédure judiciaire, d'arbitrage ou d'enquête administrative impliquant des données dont la durée de conservation standard est expirée ou sur le point d'expirer, une **prolongation de conservation** peut être décidée par le Compliance Officer ou le Directeur Juridique.

**Procédure :**
1. Identification des données concernées (par référence de dossier judiciaire ou de procédure) ;
2. Décision écrite de prolongation avec motif, durée estimée et signataire ;
3. Marquage technique des enregistrements concernés (flag `legal_hold = true`, `legal_hold_reason`, `legal_hold_set_by`) ;
4. Suspension des suppressions automatiques pour ces enregistrements uniquement ;
5. Révision trimestrielle de la prolongation ;
6. Levée du Legal Hold par décision écrite en fin de procédure.

### 6.2 Demandes des autorités judiciaires et de contrôle

Lorsqu'une autorité judiciaire (juge d'instruction, parquet) ou une autorité de contrôle (ACPR, TRACFIN, ANRF, CNIL) requiert la production de données, y compris des données dont la durée de conservation est expirée :
- La demande est documentée (référence, autorité, objet, date) ;
- Les données sont restaurées depuis l'archive si nécessaire ;
- La production est tracée dans l'audit trail ;
- La conservation peut être prolongée le temps de la procédure.

### 6.3 Clôture et résiliation du contrat Client

À la fin du contrat entre l'Éditeur et le Client (institution financière) :
- Les Données Client sont restituées ou détruites dans les 30 jours selon le choix du Client (cf. ATD Art.10) ;
- La restitution inclut l'ensemble des données (actives + archives) dans un format structuré ;
- La destruction est documentée par une attestation signée ;
- L'Éditeur ne conserve aucune copie des Données Client après la destruction confirmée.

**Cas particulier — obligation légale de l'Éditeur en tant que sous-traitant :**
Si l'Éditeur est lui-même soumis à une obligation légale de conservation de certaines données (exemple : logs d'accès pour une procédure le concernant), cette conservation est limitée au strict nécessaire et le Client en est informé.

### 6.4 Corrections et rectifications de données

La rectification d'une donnée ne modifie pas sa durée de conservation. La version corrigée est conservée pour la durée applicable à sa catégorie. L'historique des modifications (avant/après) est conservé dans l'audit trail pour la même durée.

### 6.5 Données de test et environnements hors production

Les données chargées dans les environnements de test ou de recette (staging) sont **strictement anonymisées ou synthétiques**. Il est interdit de charger des données de production réelles dans un environnement de test. Les données de test font l'objet d'une suppression mensuelle automatique.

---

## 7. RESPONSABILITÉS

| Rôle | Responsabilités |
|------|----------------|
| **DPO de l'Éditeur** | Supervision de la politique de rétention ; validation des audits annuels ; réponse aux demandes d'effacement transmises par les Clients |
| **Compliance Officer** | Application de la politique ; décisions de prolongation (legal hold) ; validation des suppressions de dossiers d'investigation |
| **Équipe Technique / DevOps** | Implémentation technique des processus de suppression, archivage, chiffrement ; maintenance des scripts automatisés |
| **Client (RT)** | Réponse aux demandes des personnes concernées ; transmission des demandes d'effacement à l'Éditeur ; configuration des durées dans les limites contractuelles |

---

*Fin de la Politique de Rétention et de Suppression des Données*

*Document interne — © [Éditeur KYC-AML Platform] — Version 2.5 — Janvier 2026*
*Propriétaire : DPO / Équipe Conformité | Approbateur : Compliance Officer + DPO | Prochaine révision : Janvier 2027*
