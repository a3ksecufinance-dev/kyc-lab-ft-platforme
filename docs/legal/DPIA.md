# Analyse d'Impact relative à la Protection des Données (AIPD / DPIA)
## KYC-AML Platform v2.5 — Système de Lutte Anti-Blanchiment et Contre le Financement du Terrorisme

---

**Document** : DPIA-KYC-AML-v2.5
**Version** : 1.0
**Date de création** : 2026-03-29
**Prochaine révision** : 2027-03-29
**Statut** : VALIDÉ
**Classification** : CONFIDENTIEL — Usage interne et communication DPO/CNIL

---

## SECTION 1 — INFORMATIONS GÉNÉRALES

### 1.1 Identification du Responsable de Traitement

| Champ | Valeur |
|-------|--------|
| Raison sociale | *(à compléter par le client)* |
| Forme juridique | *(SA / SAS / Banque / Assurance)* |
| Adresse du siège | *(à compléter)* |
| Numéro SIREN | *(à compléter)* |
| Secteur d'activité | Établissement de crédit / Services financiers / Assurance / Fintech |
| Représentant légal | *(Nom, Prénom, Fonction)* |
| Coordonnées | *(Email, Téléphone)* |

### 1.2 Délégué à la Protection des Données (DPO)

| Champ | Valeur |
|-------|--------|
| Nom et prénom du DPO | *(à compléter)* |
| Coordonnées directes | *(Email DPO désigné — ex. dpo@institution.fr)* |
| Date de désignation CNIL | *(à compléter)* |
| Numéro de désignation CNIL | *(à compléter)* |

> **Note** : La désignation d'un DPO est obligatoire pour les établissements financiers en application de l'article 37(1)(b) RGPD, qui traitent des données à grande échelle dans le cadre de leurs activités principales.

### 1.3 Sous-Traitant (Éditeur de la Plateforme)

| Champ | Valeur |
|-------|--------|
| Raison sociale | KYC-Lab FT Platforme |
| Rôle RGPD | Sous-traitant au sens de l'Art.4(8) RGPD |
| DPA signé | Oui — voir document DPA.md |
| Coordonnées | *(à compléter)* |

### 1.4 Méthodologie Utilisée

Cette DPIA a été réalisée conformément aux référentiels suivants :

- **PIA CNIL v3** (Guide de la CNIL « PIA — La méthode », version 3.0, novembre 2023)
- **ISO/IEC 29134:2017** — Lignes directrices pour l'évaluation d'impact sur la vie privée
- **RGPD Art.35** et les lignes directrices du Comité Européen de la Protection des Données (CEPD) WP248 rev.01 sur la DPIA
- **Référentiel sectoriel ACPR/AMF** pour les établissements financiers
- **EBIOS Risk Manager** pour la méthodologie d'évaluation des risques

La notation des risques utilise la grille CNIL à deux axes :
- **Vraisemblance** : Négligeable (1) / Limitée (2) / Importante (3) / Maximale (4)
- **Gravité** : Négligeable (1) / Limitée (2) / Importante (3) / Maximale (4)
- **Niveau de risque** = Vraisemblance × Gravité → FAIBLE (<4) / MOYEN (4-8) / ÉLEVÉ (9-12) / CRITIQUE (>12)

---

## SECTION 2 — DESCRIPTION DU TRAITEMENT

### 2.1 Dénomination et Identification du Traitement

**Dénomination officielle** : « Système KYC/AML de lutte contre le blanchiment de capitaux et le financement du terrorisme »

**Référence dans le registre des traitements** : *(à compléter par le Responsable de traitement)*

**Date de mise en œuvre** : *(à compléter)*

### 2.2 Finalités du Traitement

Le traitement poursuit les finalités suivantes, strictement délimitées :

#### Finalité 1 — Vérification de l'identité des clients (KYC — Know Your Customer)
Vérification de l'identité des personnes physiques et morales conformément aux obligations de vigilance imposées par la 5e et 6e Directive Anti-Blanchiment (AMLD5/6), la loi française de 1990 modifiée et les circulaires BAM. Cela comprend la collecte et la vérification des pièces justificatives d'identité, la vérification de l'adresse, l'identification des bénéficiaires effectifs (UBO), et la classification du profil de risque client.

#### Finalité 2 — Détection des opérations suspectes (AML — Anti-Money Laundering)
Analyse automatisée des transactions financières au moyen d'un moteur de règles (12 règles AML) et de modèles de scoring par apprentissage automatique afin de détecter des opérations susceptibles de constituer du blanchiment de capitaux ou du financement du terrorisme. Le traitement inclut la génération d'alertes, l'évaluation comportementale (pKYC) et le calcul de scores de risque.

#### Finalité 3 — Conformité réglementaire LAB/FT (Lutte Anti-Blanchiment / Financement du Terrorisme)
Génération et transmission des Déclarations de Soupçon (DS) aux autorités compétentes (TRACFIN en France, CRF/ANRF au Maroc), conservation des preuves d'audit, et production des rapports réglementaires requis par l'ACPR, l'AMF, et les autorités équivalentes.

#### Finalité 4 — Screening des listes de sanctions et des personnes politiquement exposées (PEP)
Vérification des clients, contreparties et bénéficiaires effectifs au regard des listes de sanctions officielles (OFAC SDN, EU FSF, ONU SC, FCDO UK, OpenSanctions) et des listes PEP, avec mise à jour automatique des données de screening.

#### Finalité 5 — Authentification et contrôle d'accès des utilisateurs internes
Gestion de l'authentification des analystes, superviseurs, compliance officers et administrateurs utilisant la plateforme, incluant le MFA (Multi-Factor Authentication) et la journalisation des accès.

### 2.3 Base Légale du Traitement

| Finalité | Base légale RGPD | Détail |
|----------|-----------------|--------|
| KYC / Vérification identité | Art. 6(1)(c) — Obligation légale | Directive AMLD5 (2015/849), AMLD6 (2018/1673), transposées en droit français (CMF L.561-2 et s.), Circulaire BAM 5/W/2023 |
| AML / Détection soupçons | Art. 6(1)(c) + Art. 6(1)(f) | Obligation légale LAB/FT + intérêt légitime à prévenir les pertes financières et les sanctions réglementaires |
| Déclarations de soupçon | Art. 6(1)(c) | CMF L.561-15 (TRACFIN), obligation de déclaration sous peine de sanction pénale |
| Screening sanctions/PEP | Art. 6(1)(c) | Règlements UE gel d'avoirs, Art. 13 AMLD5 sur les PEP |
| Authentification MFA | Art. 6(1)(a) + Art. 6(1)(f) | Consentement lors de l'enrôlement MFA + intérêt légitime sécurité |
| Logs d'audit | Art. 6(1)(c) + Art. 6(1)(f) | Obligation RGPD Art.32 de traçabilité + démonstration conformité Art.5(2) |

> **Sur le traitement des données PEP et de sanctions** : Ces données ne constituent pas des données sensibles au sens strict de l'Art.9 RGPD, mais elles présentent un caractère particulièrement sensible en raison de leurs implications sur les droits et libertés des personnes. Leur traitement est explicitement autorisé par l'Art.13 AMLD5 et les règlements UE relatifs aux mesures restrictives.

### 2.4 Description des Opérations de Traitement

Le cycle de traitement des données comprend les étapes suivantes :

1. **Collecte** : Saisie directe par l'analyste via l'interface web ou API (onboarding client), import de fichiers documentaires (pièces d'identité, justificatifs)
2. **Enregistrement** : Stockage chiffré en base PostgreSQL (données structurées) et système de fichiers sécurisé (documents)
3. **Organisation** : Structuration par profil client (customerId KYC-XXXXXX), avec versioning des données KYC
4. **Conservation** : Selon les durées définies en Section 2.7
5. **Consultation** : Accès par les utilisateurs habilités (RBAC), traçabilité complète des accès
6. **Utilisation** : Exécution du moteur de règles AML, calcul des scores ML, génération d'alertes
7. **Communication** : Transmission aux autorités (TRACFIN) via export sécurisé XML/GoAML ; aux auditeurs internes/externes sur demande documentée
8. **Effacement/Anonymisation** : Selon procédure de suppression (requestErasure) ou pseudonymisation à l'issue des délais légaux de conservation

### 2.5 Catégories de Personnes Concernées

| Catégorie | Description | Volume estimé |
|-----------|-------------|---------------|
| Clients particuliers (personnes physiques) | Titulaires de comptes, bénéficiaires de virements, demandeurs de services financiers | *(selon institution)* |
| Clients entreprises (personnes morales) | Sociétés, associations, fonds | *(selon institution)* |
| Bénéficiaires effectifs (UBO) | Personnes physiques détenant >25% du capital ou du contrôle d'une personne morale cliente | *(variable)* |
| Personnes Politiquement Exposées (PEP) | Clients ou proches identifiés comme PEP selon AMLD Art.3(9) | *(variable)* |
| Utilisateurs internes | Analystes, superviseurs, compliance officers, administrateurs utilisant la plateforme | *(selon équipe)* |
| Contreparties | Personnes physiques/morales parties à des transactions surveillées | *(variable)* |

### 2.6 Catégories de Données Traitées

#### Données d'identité
- Nom, prénom(s), date et lieu de naissance
- Nationalité, pays de résidence
- Numéro et type de document d'identité (CNI, passeport, titre de séjour)
- Date de délivrance et d'expiration du document
- Photographie (dans le document d'identité)
- Numéro SIREN/SIRET (personnes morales)
- Structure d'actionnariat et registre UBO

#### Données de contact
- Adresse postale (domicile/siège social)
- Adresse email
- Numéro de téléphone

#### Données financières
- Numéro de compte/IBAN
- Historique des transactions (montant, devise, date, type, contrepartie)
- Soldes et flux financiers
- Source de fonds déclarée
- Patrimoine estimé (profil risque)

#### Documents d'identité (données particulièrement sensibles)
- Copies de pièces d'identité (PDF/image)
- Justificatifs de domicile
- Statuts sociaux, extrait K-bis
- Documents UBO

#### Données comportementales et de scoring
- Patterns de transactions (fréquence, montant moyen, pays impliqués)
- Score de risque AML (0-100)
- Statut KYC (PENDING / IN_REVIEW / APPROVED / REJECTED / SUSPENDED)
- Historique des alertes et des règles déclenchées
- Snapshots pKYC (dérive comportementale)

#### Données de statut réglementaire
- Statut PEP (YES / NO / FORMER_PEP)
- Résultats de screening sanctions (CLEAR / REVIEW / MATCH)
- Statut de gel d'avoirs
- Liens TRACFIN (référence DS)

#### Données d'authentification (utilisateurs internes)
- Identifiant utilisateur, hash du mot de passe (bcrypt)
- Secrets TOTP (MFA) — stockés chiffrés
- Tokens JWT et refresh tokens
- Adresses IP de connexion, user-agents

#### Logs et données d'audit
- Logs d'actions utilisateurs (horodatage, action, entité cible, IP)
- Logs applicatifs (niveau INFO/WARN/ERROR)
- Logs de sécurité (tentatives d'authentification, accès refusés)

### 2.7 Durées de Conservation

| Catégorie de données | Durée de conservation | Base légale | Mode de fin |
|---------------------|----------------------|-------------|-------------|
| Données KYC clients actifs | Durée de la relation commerciale + 5 ans | CMF L.561-12, AMLD6 Art.40 | Archivage puis suppression |
| Données KYC clients inactifs/clôturés | 5 ans après clôture du compte | CMF L.561-12 | Suppression planifiée |
| Transactions et alertes AML | 10 ans | FATF R.11, CMF L.561-12 al.2 | Archivage froid |
| Déclarations de soupçon (DS) | 10 ans | CMF L.561-12 | Archivage sécurisé |
| Documents d'identité | 5 ans après fin de relation | AMLD6 Art.40 | Suppression automatique |
| Résultats de screening | 5 ans | LAB/FT | Archivage |
| Logs d'audit applicatifs | 1 an (base active) + 5 ans (archive) | RGPD Art.32, RGS | Rotation automatique |
| Sessions et tokens JWT | 15 minutes (access) / 7 jours (refresh) | Sécurité | Expiration automatique Redis |
| Snapshots pKYC comportementaux | 2 ans | Analytique interne | Purge automatique |
| Données MFA/TOTP | Durée de l'habilitation utilisateur | Sécurité | Suppression à révocation |
| Logs de sécurité | 1 an | RGPD Art.32 | Rotation automatique |

### 2.8 Destinataires des Données

| Destinataire | Catégories de données transmises | Base légale de la communication | Mode de transfert |
|-------------|----------------------------------|--------------------------------|------------------|
| TRACFIN (Traitement du Renseignement et Action contre les Circuits FINanciers clandestins) | Contenu des DS (identité, transactions suspectes) | CMF L.561-15 — obligation légale | Export XML sécurisé / API TRACFIN |
| CRF/ANRF (Maroc) | Déclarations de soupçon contexte BAM | Loi 43-05 relative à la LAB/FT | Export sécurisé |
| ACPR / AMF (France) | Rapports réglementaires (sans données individuelles) | Obligation réglementaire | Rapports agrégés |
| Autorités judiciaires | Sur réquisition judiciaire | Art. 60-1 CPP | Sur réquisition |
| Auditeurs internes/externes | Données nécessaires à l'audit | Contrat d'audit + NDA | Accès limité, journalisé |
| Sous-traitants ultérieurs (hébergement, email) | Données d'infrastructure | DPA — RGPD Art.28 | Voir Section 2.9 |

> **Interdiction de divulgation (tipping-off)** : Conformément à l'Art.43 AMLD6 et au CMF L.561-19, toute divulgation à la personne concernée de l'existence d'une déclaration de soupçon ou d'une enquête en cours est strictement interdite. La plateforme implémente techniquement cette interdiction via un contrôle d'accès strict aux données de statut DS.

### 2.9 Transferts Hors Union Européenne

| Pays de destination | Sous-traitant | Type de données | Garantie appropriée | Évaluation |
|--------------------|-----------|-----------------|--------------------|-----------|
| États-Unis (si applicable) | Resend.com (emails transactionnels) | Adresse email, nom — notifications seulement | SCCs (Clauses Contractuelles Types) 2021 | Données minimisées |
| Espace économique européen | OVH / Hetzner (hébergement) | Toutes données de la plateforme | Pas de transfert hors UE — serveurs FR/DE | Sans objet |
| Maroc | Client BAM | Données clients marocains | Art.46 RGPD + Décision d'adéquation en attente — BCR client | Évaluation spécifique requise |

> **Note sur le Maroc** : Le Maroc n'a pas fait l'objet d'une décision d'adéquation de la Commission européenne à la date de rédaction de ce document. Pour les clients marocains, le déploiement en mode « on-premise » au Maroc (serveurs locaux) est recommandé pour éviter tout transfert hors UE. Si un déploiement SaaS EU est utilisé, des Clauses Contractuelles Types (CCT) doivent être mises en place.

---

## SECTION 3 — ÉVALUATION DE LA NÉCESSITÉ ET DE LA PROPORTIONNALITÉ

### 3.1 Minimisation des Données (Art.5(1)(c) RGPD)

L'analyse de minimisation a été conduite par finalité :

**KYC — Vérification d'identité** : Les données collectées sont strictement celles exigées par l'AMLD6 (Art.10-13) et le CMF. La photographie n'est pas stockée directement — seule la référence au document numérique est conservée. Le numéro de sécurité sociale (NIR) n'est jamais collecté, sauf obligation légale spécifique.

**AML — Détection** : Seules les données transactionnelles nécessaires à l'évaluation du risque sont traitées par le moteur de règles. Les données de transaction sont conservées au niveau agrégé dans les snapshots pKYC. Les données brutes ne sont accessibles qu'aux utilisateurs habilités.

**Authentification** : Les mots de passe ne sont jamais stockés en clair — hashage bcrypt avec sel aléatoire. Les secrets MFA sont chiffrés au repos (AES-256-GCM). Les logs d'authentification ne conservent pas les mots de passe.

**Mesures de minimisation implémentées** :
- Champs optionnels clairement identifiés comme tels dans l'interface
- Validation des champs obligatoires au niveau API (Zod schema validation)
- Pas de collecte de données biométriques (empreintes, reconnaissance faciale)
- Pseudonymisation dans les logs : `customerId` (KYC-XXXXXX) au lieu des données nominatives
- Accès aux données sensibles conditionné au rôle utilisateur (RBAC)

### 3.2 Limitation de la Finalité (Art.5(1)(b) RGPD)

Les données collectées pour la conformité LAB/FT ne sont utilisées qu'à cette fin. Les contrôles techniques suivants garantissent cette limitation :

- **Cloisonnement des données** : Les données KYC/AML ne sont pas partagées avec d'autres systèmes internes du client (CRM, marketing) via des contrôles d'accès API
- **Absence de profilage commercial** : La plateforme n'effectue aucun profilage à des fins commerciales — les scores AML ne sont utilisés qu'à des fins de conformité réglementaire
- **Contrat de sous-traitance** (DPA) : L'éditeur s'interdit contractuellement d'utiliser les données pour son propre compte
- **Audit des requêtes** : Toutes les requêtes sur les données clients sont journalisées et examinables

### 3.3 Exactitude des Données (Art.5(1)(d) RGPD)

- **Renouvellement KYC** : Processus de renouvellement périodique (défini selon le profil de risque : 1 an pour HIGH, 2 ans pour MEDIUM, 3 ans pour LOW)
- **Mise à jour des statuts** : Les statuts PEP et de sanctions sont mis à jour lors de chaque cycle de screening
- **Correction par l'analyste** : Interface de correction des données erronées, avec traçabilité de la modification
- **Droit de rectification** : Procédure formalisée (voir Section 6)

### 3.4 Limitation de la Conservation (Art.5(1)(e) RGPD)

Voir tableau de rétention Section 2.7. Les durées sont justifiées par :
- Les obligations légales LAB/FT (5 à 10 ans selon les données)
- L'absence de marge de manœuvre pour le responsable de traitement sur ces durées (obligation légale impérative)
- La mise en place de procédures d'archivage puis de suppression à l'échéance

### 3.5 Pseudonymisation et Anonymisation

**Pseudonymisation mise en œuvre** :
- `customerId` : Identifiant interne KYC-XXXXXX (6 caractères alphanumériques aléatoires) utilisé dans tous les logs à la place des données nominatives
- Logs applicatifs : Ne contiennent jamais de NOM, prénom, numéro de compte en clair
- Export TRACFIN : Le fichier DS contient les données nominatives requises légalement, avec chiffrement en transit

**Limites de l'anonymisation** :
L'anonymisation complète est impossible pour les données LAB/FT qui doivent rester identifiantes pour les besoins des autorités. La pseudonymisation est la mesure applicable pendant la durée légale de conservation.

---

## SECTION 4 — IDENTIFICATION ET ÉVALUATION DES RISQUES

### 4.1 Méthodologie d'Évaluation

Les risques sont évalués selon deux dimensions :
- **Vraisemblance** (V) : 1 = Négligeable / 2 = Limitée / 3 = Importante / 4 = Maximale
- **Gravité** (G) : 1 = Négligeable / 2 = Limitée / 3 = Importante / 4 = Maximale
- **Niveau brut** = V × G
- **Niveau résiduel** = niveau après application des mesures

### 4.2 Risque R1 — Accès Illégitime aux Données (Violation de Confidentialité)

**Description** : Un tiers non autorisé (externe : attaquant, ou interne : employé malveillant) accède aux données personnelles des clients, documents d'identité, ou résultats d'analyses AML.

**Sources de menace** :
- Cyberattaque externe (injection SQL, exploitation de vulnérabilité)
- Compromission de compte utilisateur (phishing, credential stuffing)
- Accès abusif d'un employé habilité
- Accès non autorisé par le sous-traitant

**Impacts potentiels** :
- Violation de la vie privée des clients
- Risque d'usurpation d'identité
- Violation du secret professionnel (art. L.511-33 CMF)
- Amendes RGPD (jusqu'à 4% du CA mondial)
- Atteinte à la réputation

| Paramètre | Valeur brute | Valeur résiduelle |
|-----------|-------------|------------------|
| Vraisemblance | 3 (Importante) | 2 (Limitée) |
| Gravité | 4 (Maximale) | 4 (Maximale) |
| **Niveau de risque** | **ÉLEVÉ (12)** | **MOYEN (8)** |

**Mesures mises en œuvre** :
- Chiffrement des données au repos : AES-256-GCM pour toutes les données PII en base PostgreSQL
- Chiffrement en transit : TLS 1.3 obligatoire (pas de TLS 1.0/1.1/1.2 autorisé)
- Authentification forte : JWT (15 min expiry) + MFA TOTP obligatoire pour tous les utilisateurs
- Contrôle d'accès basé sur les rôles (RBAC) : 4 rôles — analyst / supervisor / compliance_officer / admin
- Principe du moindre privilège : Chaque rôle n'accède qu'aux données nécessaires à sa fonction
- Audit logs immuables : Toutes les consultations de données sensibles sont journalisées
- Rate limiting : Protection contre les attaques par force brute sur l'API (100 req/15min par IP)
- Réseau Docker isolé : Pas d'exposition directe de la base de données
- Clés d'API distinctes par environnement (prod/staging/dev)
- Rotation des secrets : Procédure de rotation trimestrielle des clés de chiffrement
- Tests de pénétration annuels par prestataire externe certifié

**Mesures organisationnelles** :
- Habilitations revues annuellement et à chaque changement de poste
- Procédure de révocation immédiate en cas de départ ou suspension
- Formation sécurité obligatoire pour les utilisateurs de la plateforme
- NDA signé par tout le personnel accédant aux données

### 4.3 Risque R2 — Modification Non Désirée des Données (Atteinte à l'Intégrité)

**Description** : Des données personnelles sont modifiées de manière non autorisée, accidentelle, ou frauduleuse, altérant la fiabilité des analyses KYC/AML et potentiellement la conformité réglementaire.

**Sources de menace** :
- Erreur de saisie par un analyste
- Modification frauduleuse pour dissimuler un blanchiment (corruption interne)
- Bug applicatif provoquant une écrasement de données
- Attaque de type "man-in-the-middle" sur les données en transit

**Impacts potentiels** :
- Décisions KYC erronées (approbation d'un client à risque élevé, rejet injustifié)
- Responsabilité réglementaire de l'institution (défaut de vigilance)
- Préjudice pour les personnes injustement catégorisées

| Paramètre | Valeur brute | Valeur résiduelle |
|-----------|-------------|------------------|
| Vraisemblance | 2 (Limitée) | 1 (Négligeable) |
| Gravité | 3 (Importante) | 3 (Importante) |
| **Niveau de risque** | **MOYEN (6)** | **FAIBLE (3)** |

**Mesures mises en œuvre** :
- Audit trail complet : Toute modification de données est tracée (qui, quand, quelle valeur avant/après)
- Immutabilité des logs : Les logs d'audit sont écrits en append-only, aucune modification possible par les utilisateurs
- Versioning des données KYC : Chaque mise à jour crée une nouvelle version, l'historique est conservé
- Validation des données : Contrôles de cohérence (Zod schemas) avant toute écriture en base
- Séparation des fonctions : Un analyste ne peut pas à la fois créer une alerte et la valider
- Checksum des documents : Signature numérique des documents d'identité à l'import
- HTTPS obligatoire : Chiffrement en transit empêchant la modification des données en transit

### 4.4 Risque R3 — Disparition des Données (Atteinte à la Disponibilité)

**Description** : Des données personnelles sont perdues de manière permanente suite à une défaillance technique, une attaque ransomware, ou une erreur d'exploitation, rendant impossible le respect des obligations légales de conservation.

**Sources de menace** :
- Panne matérielle (disque, serveur)
- Attaque ransomware chiffrant ou détruisant les données
- Suppression accidentelle par un administrateur
- Sinistre (incendie, inondation du datacenter)
- Corruption de la base de données

**Impacts potentiels** :
- Non-respect des obligations de conservation LAB/FT (sanction ACPR)
- Impossibilité de répondre aux réquisitions judiciaires
- Perte de capacité opérationnelle

| Paramètre | Valeur brute | Valeur résiduelle |
|-----------|-------------|------------------|
| Vraisemblance | 2 (Limitée) | 1 (Négligeable) |
| Gravité | 3 (Importante) | 2 (Limitée) |
| **Niveau de risque** | **MOYEN (6)** | **FAIBLE (2)** |

**Mesures mises en œuvre** :
- Sauvegardes automatiques quotidiennes (base PostgreSQL + fichiers documents)
- RPO (Recovery Point Objective) : 1 heure (sauvegardes toutes les heures pour les données critiques)
- RTO (Recovery Time Objective) : 4 heures (procédure de reprise documentée)
- Sauvegardes chiffrées stockées dans un emplacement géographiquement distinct
- Tests de restauration trimestriels (procédure documentée, résultats archivés)
- Monitoring de la disponibilité (Prometheus/Grafana) avec alertes sur seuil
- Redondance des conteneurs Docker (restart policies)
- Archivage froid pour les données conservées au-delà de 1 an

### 4.5 Risque R4 — Profilage Discriminatoire ou Décision Automatisée Injuste

**Description** : Le moteur de règles AML ou le modèle ML génère des alertes ou des scores discriminatoires basés sur des caractéristiques protégées (origine nationale, religion, etc.), entraînant un traitement inéquitable des personnes concernées.

**Sources de menace** :
- Biais dans les données d'entraînement du modèle ML
- Règles AML corrélant indirectement avec des caractéristiques protégées (ex. : pays d'origine)
- Absence de surveillance du modèle (drift de performance)
- Décision entièrement automatisée sans révision humaine

**Impacts potentiels** :
- Discrimination indirecte illégale (Art.14 CEDH, Loi Informatique et Libertés)
- Violation de l'Art.22 RGPD (décision automatisée)
- Atteinte aux droits fondamentaux des personnes concernées
- Responsabilité juridique de l'institution

| Paramètre | Valeur brute | Valeur résiduelle |
|-----------|-------------|------------------|
| Vraisemblance | 2 (Limitée) | 1 (Négligeable) |
| Gravité | 3 (Importante) | 2 (Limitée) |
| **Niveau de risque** | **MOYEN (6)** | **FAIBLE (2)** |

**Mesures mises en œuvre** :
- **Révision humaine obligatoire** : Aucune décision de rejet, suspension ou déclaration de soupçon n'est prise sans validation par un analyste habilité. Le système génère des alertes et des recommandations — pas des décisions finales.
- **Explicabilité du moteur** : Chaque alerte indique la ou les règles AML déclenchées et leur justification (ex. : "VELOCITY_RULE — 8 transactions en 24h, seuil : 5")
- **Score ML avec intervalles de confiance** : Le score ML est présenté avec son niveau de confiance et les facteurs contributifs principaux
- **Surveillance du modèle** : Monitoring des métriques de performance (taux de faux positifs, distribution des scores) avec alerte si dérive détectée
- **Audit annuel des biais** : Revue annuelle des règles et du modèle ML par l'équipe conformité pour détecter les biais potentiels
- **Documentation des règles** : Chaque règle AML est documentée avec sa justification réglementaire et ses paramètres
- **Pas de variable protégée** : L'origine ethnique, la religion, l'orientation sexuelle ne sont jamais des variables du modèle

### 4.6 Risque R5 — Fuite de Données PII vers des Tiers Non Autorisés

**Description** : Des données à caractère personnel transitent ou sont accessibles à des tiers non autorisés via des vulnérabilités dans l'architecture (réseau, API, logs).

**Sources de menace** :
- Logs applicatifs contenant des données nominatives
- Erreur de configuration exposant un endpoint public
- Exfiltration via un sous-traitant ultérieur compromis
- Erreur d'envoi d'un rapport (mauvais destinataire)

**Impacts potentiels** :
- Violation du RGPD Art.5(1)(f) (intégrité et confidentialité)
- Notification CNIL obligatoire (Art.33)
- Atteinte à la réputation

| Paramètre | Valeur brute | Valeur résiduelle |
|-----------|-------------|------------------|
| Vraisemblance | 2 (Limitée) | 1 (Négligeable) |
| Gravité | 3 (Importante) | 2 (Limitée) |
| **Niveau de risque** | **MOYEN (6)** | **FAIBLE (2)** |

**Mesures mises en œuvre** :
- Réseau Docker isolé : Les containers ne sont pas exposés directement sur Internet (reverse proxy Nginx)
- Pseudonymisation dans les logs : Remplacement des données nominatives par le `customerId`
- DPA avec tous les sous-traitants ultérieurs (OVH, Hetzner, Resend)
- Chiffrement en transit (TLS 1.3) sur toutes les communications
- Validation des destinations d'export (liste blanche d'adresses IP TRACFIN)
- Pas de données en clair dans les variables d'environnement exposées (secrets via fichiers .env chiffrés ou vault)

---

## SECTION 5 — MESURES TECHNIQUES ET ORGANISATIONNELLES

### 5.1 Mesures Techniques de Sécurité

#### Chiffrement
| Mesure | Détail technique | Données concernées |
|--------|-----------------|-------------------|
| Chiffrement au repos | AES-256-GCM, clé dérivée via PBKDF2 | Toutes les colonnes PII en PostgreSQL |
| Chiffrement en transit | TLS 1.3 (ECDHE + AES-256-GCM) | Toutes les communications client-serveur et inter-services |
| Hashage des mots de passe | bcrypt, facteur de coût 12 | Mots de passe utilisateurs |
| Chiffrement des secrets MFA | AES-256-GCM | Secrets TOTP |
| Chiffrement des sauvegardes | AES-256-CBC | Fichiers de sauvegarde S3/stockage objet |

#### Contrôle d'Accès
| Mesure | Détail | Périmètre |
|--------|--------|----------|
| RBAC (Role-Based Access Control) | 4 rôles : analyst / supervisor / compliance_officer / admin | Toutes les ressources API |
| JWT Access Token | Expiration 15 minutes, RS256 | Authentification API |
| JWT Refresh Token | Expiration 7 jours, révocable | Renouvellement de session |
| MFA TOTP | Standard RFC 6238, intervalle 30s | Tous les utilisateurs |
| Principe du moindre privilège | Accès aux seules données nécessaires au rôle | RBAC middleware |
| Blocage automatique | Après 5 tentatives échouées, blocage 15 min | Authentification |

#### Journalisation et Surveillance
| Mesure | Détail | Durée |
|--------|--------|-------|
| Audit trail applicatif | Toutes les actions sur données sensibles (CRUD) | 1 an actif + 5 ans archive |
| Logs de sécurité | Connexions, erreurs d'auth, accès refusés | 1 an |
| Monitoring Prometheus | Métriques applicatives et infrastructure | Temps réel |
| Alertes Grafana | Seuils sur erreurs, latence, disponibilité | Temps réel |
| Logs centralisés | Agrégation Loki ou équivalent | 1 an |

#### Infrastructure
| Mesure | Détail |
|--------|--------|
| Isolation réseau | Réseau Docker interne, pas d'exposition directe DB |
| Rate limiting | 100 req/15min par IP sur endpoints publics |
| CORS restrictif | Liste blanche des origines autorisées |
| Headers de sécurité | HSTS, CSP, X-Frame-Options, X-Content-Type-Options |
| Scan de vulnérabilités | Trivy sur images Docker, npm audit sur dépendances |
| Pentest annuel | Prestataire externe certifié PASSI |

### 5.2 Mesures Organisationnelles

#### Gouvernance
- **Politique de sécurité des systèmes d'information (PSSI)** : Document formel définissant les règles de sécurité, révisé annuellement
- **Registre des traitements** : Mis à jour à chaque nouveau traitement ou modification significative
- **Responsable de la sécurité (RSSI)** : Désigné formellement, interlocuteur du DPO pour les questions techniques
- **Comité de sécurité** : Réunion trimestrielle pour la revue des incidents, des audits et des évolutions

#### Personnel et Habilitations
- **Habilitations formalisées** : Fiche d'habilitation signée pour chaque utilisateur, précisant le rôle et le périmètre d'accès
- **Revue annuelle des habilitations** : Audit des comptes actifs, révocation des comptes inutilisés
- **Procédure d'arrivée** : Création de compte uniquement sur demande signée du responsable hiérarchique
- **Procédure de départ** : Révocation immédiate des accès à J-0 du départ
- **Formation initiale obligatoire** : Module sécurité et RGPD avant tout accès à la plateforme
- **Engagement de confidentialité** : NDA signé par tout personnel accédant aux données

#### Gestion des Incidents
- **Procédure de notification des violations** : Délai de 72h pour notification CNIL (Art.33 RGPD), délai de communication aux personnes concernées si risque élevé (Art.34)
- **Registre des violations** : Toutes les violations documentées, même non notifiées
- **Plan de réponse aux incidents** : Voir document INCIDENT_RESPONSE.md

#### Sous-traitants
- **DPA obligatoire** : Accord de traitement signé avant tout accès aux données
- **Évaluation des sous-traitants** : Due diligence sécurité avant sélection
- **Audits** : Droit d'audit contractuellement prévu

---

## SECTION 6 — DROITS DES PERSONNES CONCERNÉES

### 6.1 Information des Personnes (Art.13/14 RGPD)

> **Responsabilité** : L'information des personnes concernées (clients, UBO, PEP) est de la responsabilité du **Responsable de traitement** (l'institution financière cliente de la plateforme). L'éditeur met à disposition les informations techniques nécessaires à la rédaction des mentions légales.

**Mentions légales minimales requises dans la politique de confidentialité du client** :
- Identité et coordonnées du responsable de traitement et du DPO
- Finalités et base légale du traitement KYC/AML
- Catégories de données collectées
- Destinataires (TRACFIN, ACPR, etc.)
- Durées de conservation
- Droits des personnes et modalités d'exercice
- Droit de réclamation auprès de la CNIL

**Note sur la limitation de l'information** : Conformément à l'Art.14(5)(b) RGPD, l'obligation d'information peut être limitée lorsque la communication à la personne concernée risque de compromettre un traitement ou une enquête LAB/FT (tipping-off). Dans ce cas, l'information est différée jusqu'à la levée du risque.

### 6.2 Droit d'Accès (Art.15 RGPD)

**Modalités d'exercice** :
- Demande adressée au DPO de l'institution par écrit (email ou courrier)
- Vérification de l'identité du demandeur obligatoire
- Délai de réponse : 1 mois (extensible à 3 mois pour les demandes complexes)

**Mise en œuvre technique** :
- Endpoint API : `GET /trpc/customers.get` (accès par les analystes habilités)
- Export complet sur demande DPO : Format JSON structuré incluant toutes les données relatives au client
- Limitation : Les données faisant l'objet d'une enquête active ou d'une DS transmise à TRACFIN peuvent être exclues de la communication (Art.15(4) + CMF L.561-19)

### 6.3 Droit de Rectification (Art.16 RGPD)

**Modalités d'exercice** :
- Demande de rectification adressée au DPO avec justificatifs
- Traitement par un analyste habilité via l'interface de gestion clients
- Traçabilité : Toute modification est journalisée (ancien + nouvelle valeur, auteur, date)
- Délai : 1 mois
- Information aux destinataires (TRACFIN) si les données rectifiées ont déjà été transmises

### 6.4 Droit à l'Effacement (Art.17 RGPD)

**Modalités d'exercice** :
- Demande adressée au DPO
- Traitement via l'endpoint `POST /trpc/customers.requestErasure`

**Limitations légales importantes** :
Le droit à l'effacement est limité par les obligations légales de conservation LAB/FT :
- Les données KYC doivent être conservées 5 ans après la fin de la relation (CMF L.561-12) — **obligation légale impérative faisant obstacle à l'effacement**
- Les données AML et les DS sont conservées 10 ans — **même limitation**

**Mise en œuvre** :
- Lorsque la demande d'effacement est reçue pendant la durée légale de conservation : **pseudonymisation renforcée** (remplacement de toutes les données identificatoires par des tokens, dissociation de l'identité) + notification au demandeur des limitations légales
- À l'issue de la durée légale : suppression effective et notification au demandeur

### 6.5 Droit à la Portabilité (Art.20 RGPD)

**Applicabilité** : Le droit à la portabilité s'applique uniquement aux traitements fondés sur le consentement (Art.6(1)(a)) ou le contrat (Art.6(1)(b)). Pour les traitements fondés sur l'obligation légale (Art.6(1)(c) — majorité des traitements KYC/AML), le droit à la portabilité ne s'applique pas.

**Pour les données relevant de la portabilité** (ex. : données de contact collectées dans un contexte contractuel) :
- Export disponible en format JSON et CSV via l'interface DPO
- Endpoint : `GET /trpc/customers.export?format=json`

### 6.6 Droit d'Opposition et Décision Automatisée (Art.21-22 RGPD)

**Opposition au profilage** : Le droit d'opposition (Art.21) est limité pour les traitements fondés sur l'obligation légale (Art.6(1)(c)). La personne ne peut pas s'opposer au traitement KYC/AML obligatoire — sans quoi la relation commerciale avec l'institution financière ne peut pas être établie.

**Décision automatisée (Art.22 RGPD)** :
La plateforme est conçue pour ne jamais produire de décision finale entièrement automatisée susceptible d'affecter significativement une personne. Spécifiquement :
- **Scores AML et alertes** : Sont des outils d'aide à la décision, pas des décisions finales
- **Validation humaine obligatoire** : Tout rejet de dossier KYC, toute déclaration de soupçon, tout gel d'avoirs nécessite une validation par un analyste ou superviseur habilité
- **Droit à l'intervention humaine** : Garanti structurellement par l'architecture de la plateforme
- **Droit de contester la décision** : Procédure formalisée permettant au client de contester une décision KYC défavorable auprès du service conformité

### 6.7 Droit de Réclamation (Art.77 RGPD)

Toute personne concernée peut introduire une réclamation auprès de :
- **CNIL** (France) : www.cnil.fr — 3 Place de Fontenoy, 75007 Paris
- **CNDP** (Maroc) : www.cndp.ma — Commission Nationale de contrôle de la protection des Données à caractère Personnel

---

## SECTION 7 — AVIS DU DPO ET CONCLUSION

### 7.1 Synthèse des Risques Résiduels

| Risque | Niveau brut | Niveau résiduel | Acceptable ? |
|--------|------------|----------------|-------------|
| R1 — Accès illégitime | ÉLEVÉ (12) | MOYEN (8) | Oui (mesures proportionnées, risque inhérent au secteur) |
| R2 — Modification non désirée | MOYEN (6) | FAIBLE (3) | Oui |
| R3 — Disparition des données | MOYEN (6) | FAIBLE (2) | Oui |
| R4 — Profilage discriminatoire | MOYEN (6) | FAIBLE (2) | Oui |
| R5 — Fuite PII vers tiers | MOYEN (6) | FAIBLE (2) | Oui |

**Niveau de risque résiduel global : FAIBLE À MOYEN**

### 7.2 Avis du DPO

*[À compléter par le DPO de l'institution]*

> Après examen de la présente DPIA, je considère que :
>
> 1. Le traitement est **nécessaire** au regard des obligations légales LAB/FT auxquelles l'institution est soumise. Il n'existe pas d'alternative moins intrusive permettant de remplir ces obligations.
>
> 2. Les **mesures techniques et organisationnelles** mises en œuvre par l'éditeur (KYC-Lab FT Platforme) et par l'institution sont proportionnées aux risques identifiés.
>
> 3. Le **risque résiduel** est acceptable au regard des obligations légales impératives qui justifient le traitement.
>
> 4. La **consultation préalable de la CNIL** (Art.36 RGPD) **n'est pas requise** : le risque résiduel, après application des mesures, est faible à moyen et ne présente pas un risque élevé résiduel au sens de l'Art.36(1) RGPD.
>
> **Recommandations du DPO** :
> - Mettre en œuvre le plan d'action défini en Section 7.3
> - Procéder à la révision annuelle de cette DPIA
> - Documenter tout incident de sécurité, même mineur, dans le registre des violations
> - S'assurer que les mentions légales à destination des clients intègrent bien les informations relatives au traitement KYC/AML
>
> *Date de l'avis : [À compléter]*
> *Signature du DPO : [À compléter]*

### 7.3 Plan d'Action

| Action | Responsable | Priorité | Échéance |
|--------|-------------|----------|---------|
| Signature du DPA avec l'éditeur | DPO / Direction juridique | HAUTE | Avant mise en production |
| Mise à jour de la politique de confidentialité clients (mentions RGPD KYC/AML) | DPO / Conformité | HAUTE | Avant mise en production |
| Formation des utilisateurs (TRAINING_PLAN.md) | RH / Conformité | HAUTE | Avant activation des accès |
| Mise en place de la procédure de gestion des droits des personnes | DPO | HAUTE | Avant mise en production |
| Revue des habilitations RBAC et création des comptes | RSSI / Admin | HAUTE | Avant mise en production |
| Test de restauration des sauvegardes | RSSI / Ops | MOYENNE | Dans les 30 jours suivant la mise en production |
| Audit annuel des biais du modèle ML | Conformité / Data Science | MOYENNE | 12 mois après mise en production |
| Pentest de la plateforme | RSSI / Prestataire PASSI | HAUTE | Dans les 3 mois suivant la mise en production |
| Révision annuelle de la DPIA | DPO | NORMALE | Annuellement à la date d'anniversaire |

### 7.4 Calendrier de Révision

Cette DPIA doit être révisée :
- **Annuellement** : Révision complète à la date anniversaire de la présente version
- **En cas de changement significatif** : Nouveau module ou fonctionnalité majeure, nouvelle catégorie de données, nouveau sous-traitant, modification de la base légale, violation de données, évolution réglementaire significative (nouvelle directive AML, etc.)
- **Après un incident de sécurité** : Révision de la section risques concernée

### 7.5 Historique des Révisions

| Version | Date | Auteur | Modifications |
|---------|------|--------|--------------|
| 1.0 | 2026-03-29 | KYC-Lab FT Platforme | Version initiale |
| | | | |

---

## ANNEXE A — Glossaire

| Terme | Définition |
|-------|-----------|
| RGPD | Règlement Général sur la Protection des Données (UE 2016/679) |
| DPIA / AIPD | Data Protection Impact Assessment / Analyse d'Impact relative à la Protection des Données |
| DPO | Délégué à la Protection des Données |
| LAB/FT | Lutte Anti-Blanchiment / Financement du Terrorisme |
| KYC | Know Your Customer — Connaissance du Client |
| AML | Anti-Money Laundering — Anti-Blanchiment |
| UBO | Ultimate Beneficial Owner — Bénéficiaire Effectif |
| PEP | Personne Politiquement Exposée |
| TRACFIN | Traitement du Renseignement et Action contre les Circuits FINanciers clandestins |
| DS | Déclaration de Soupçon |
| RBAC | Role-Based Access Control — Contrôle d'accès basé sur les rôles |
| MFA | Multi-Factor Authentication — Authentification multi-facteurs |
| SAR | Suspicious Activity Report — équivalent anglo-saxon de la DS |
| RPO | Recovery Point Objective — Point de reprise objectif |
| RTO | Recovery Time Objective — Délai de reprise objectif |

## ANNEXE B — Références Réglementaires

- Règlement UE 2016/679 (RGPD)
- Directive UE 2015/849 (AMLD5), modifiée par Directive UE 2018/843
- Directive UE 2018/1673 (AMLD6)
- Code Monétaire et Financier français, Articles L.561-1 à L.561-50
- Loi n°78-17 du 6 janvier 1978 relative à l'informatique, aux fichiers et aux libertés (modifiée)
- Circulaire BAM 5/W/2023 relative aux exigences LAB/FT
- Loi marocaine 43-05 relative à la lutte contre le blanchiment de capitaux
- Lignes directrices CEPD WP248 rev.01 sur la DPIA
- Guide PIA CNIL v3 (novembre 2023)
- ISO/IEC 29134:2017 — Privacy Impact Assessment

---

*Document confidentiel. Usage restreint au DPO, à la Direction Conformité et aux auditeurs habilités. Toute diffusion externe doit être autorisée par le DPO.*

*KYC-Lab FT Platforme — DPIA v1.0 — 2026-03-29*
