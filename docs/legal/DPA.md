# Accord de Traitement des Données Personnelles (ATD)
## Conforme à l'Article 28 du Règlement (UE) 2016/679 (RGPD)

**Version : 2.5 — Janvier 2026**

---

**Entre les soussignés :**

**Le Responsable de Traitement (RT) :**
Désignation complète : ___________________________________________
Forme juridique : ___________________________________________
Numéro SIREN/SIRET ou équivalent : ___________________________________________
Siège social : ___________________________________________
Représenté par : ___________________________________________, agissant en qualité de ___________________________________________
Ci-après dénommé **« le RT »** ou **« le Client »**

**ET**

**Le Sous-traitant (ST) :**
Désignation complète : [Éditeur KYC-AML Platform]
Forme juridique : Société par Actions Simplifiée (SAS)
Numéro SIREN/SIRET : ___________________________________________
Siège social : ___________________________________________
Représenté par : ___________________________________________, agissant en qualité de Directeur Général
Ci-après dénommé **« le ST »** ou **« l'Éditeur »**

Ensemble dénommés **« les Parties »**.

---

**Préambule**

Le présent Accord de Traitement des Données (ci-après « ATD » ou « l'Accord ») est conclu conformément aux dispositions de l'article 28 du Règlement (UE) 2016/679 du Parlement européen et du Conseil du 27 avril 2016 relatif à la protection des personnes physiques à l'égard du traitement des données à caractère personnel et à la libre circulation de ces données (ci-après « le RGPD »).

Le ST fournit au RT une plateforme SaaS de conformité réglementaire dénommée **KYC-AML Platform v2.5**, destinée à la lutte contre le blanchiment de capitaux et le financement du terrorisme (LAB/FT), à la connaissance du client (KYC) et au screening de sanctions, dans le cadre du Contrat de Services (ci-après « le Contrat Principal ») conclu entre les Parties.

Dans le cadre de l'exécution de ce Contrat Principal, le ST est amené à traiter des données à caractère personnel pour le compte du RT, en qualité de sous-traitant au sens du RGPD. Le présent ATD définit les conditions dans lesquelles le ST effectue ces traitements.

Le présent ATD fait partie intégrante du Contrat Principal et prévaut sur toute disposition contraire de ce dernier en ce qui concerne la protection des données à caractère personnel.

---

## ARTICLE 1 — OBJET

1.1 Le présent ATD a pour objet de définir les conditions dans lesquelles le ST s'engage à effectuer, pour le compte du RT, les opérations de traitement de données à caractère personnel décrites en Annexe 1 du présent accord.

1.2 Dans le cadre de l'exécution des prestations définies au Contrat Principal, le ST agit en qualité de **sous-traitant** au sens de l'article 4(8) du RGPD. À ce titre, le ST traite uniquement les données à caractère personnel sur instruction documentée du RT, conformément aux dispositions du présent ATD.

1.3 Le ST reconnaît et accepte qu'il n'a pas de pouvoir de décision quant aux finalités et aux moyens essentiels du traitement des données à caractère personnel objet du présent accord. Ces finalités et ces moyens essentiels sont déterminés exclusivement par le RT.

1.4 En cas de contradiction entre les dispositions du présent ATD et celles du Contrat Principal sur les matières couvertes par le RGPD, les dispositions du présent ATD prévalent.

---

## ARTICLE 2 — DURÉE

2.1 Le présent ATD entre en vigueur à la date de signature par les deux Parties et demeure en vigueur pendant toute la durée du Contrat Principal, y compris pendant toute période de renouvellement ou de prorogation de celui-ci.

2.2 Le présent ATD prend fin automatiquement à l'expiration ou à la résiliation du Contrat Principal, pour quelque cause que ce soit, sous réserve des dispositions de l'Article 10 relatif au sort des données en fin de contrat.

2.3 En cas de résiliation anticipée du Contrat Principal, les obligations du ST en matière de traitement de données à caractère personnel demeurent applicables jusqu'à la complète exécution des obligations de restitution ou de destruction prévues à l'Article 10.

2.4 Les dispositions du présent ATD qui sont, par nature, destinées à survivre à son expiration ou à sa résiliation (notamment les dispositions relatives à la confidentialité, à la conservation des données et aux obligations de coopération avec les autorités de contrôle) demeurent en vigueur après la fin de l'ATD pour la durée nécessaire à leur plein effet.

---

## ARTICLE 3 — NATURE ET FINALITÉ DU TRAITEMENT

3.1 **Nature des opérations de traitement**

Dans le cadre de l'exécution du Contrat Principal, le ST effectue, pour le compte du RT et sur ses instructions, les opérations de traitement suivantes :
- Collecte et enregistrement des données d'identité des personnes concernées (clients, bénéficiaires effectifs, donneurs d'ordre) transmises par le RT ;
- Stockage sécurisé des données et documents KYC dans l'infrastructure du ST ;
- Consultation et comparaison des données avec les listes de sanctions et bases de données PEP tiers ;
- Traitement automatisé des données transactionnelles en vue de détecter des comportements suspects (moteur AML) ;
- Génération de scores de risque et d'alertes à destination des analystes du RT ;
- Conservation d'un journal d'audit des opérations effectuées sur la plateforme ;
- Restitution des données au RT sur demande ou en fin de contrat ;
- Destruction sécurisée des données à l'issue des durées de conservation applicables.

3.2 **Finalités du traitement**

Les traitements effectués par le ST pour le compte du RT poursuivent exclusivement les finalités suivantes :
- **KYC (Know Your Customer)** : Vérification de l'identité des clients du RT, évaluation du risque client, gestion du cycle de vie de la relation client conformément aux obligations légales LAB/FT ;
- **AML (Anti-Money Laundering)** : Surveillance des transactions financières, détection des schémas suspects, génération d'alertes, gestion des investigations ;
- **Screening de sanctions** : Vérification des noms des personnes et entités contre les listes de sanctions internationales (OFAC SDN, EU FSF, UN SC, UK FCDO) et les listes de Personnes Politiquement Exposées (PEP) ;
- **Reporting réglementaire** : Assistance à la production de déclarations de soupçon (DS/SAR) et de rapports à destination des autorités compétentes (TRACFIN, UTRF/ANRF, GoAML) ;
- **pKYC (Perpetual KYC)** : Surveillance comportementale continue des clients pour détecter les dérives de profil.

3.3 **Le ST s'interdit formellement** d'utiliser les données traitées pour le compte du RT à d'autres fins que celles listées au présent article, et notamment à des fins commerciales propres, de prospection ou d'entraînement de modèles d'IA génériques non contractualisés avec le RT.

---

## ARTICLE 4 — CATÉGORIES DE DONNÉES ET DE PERSONNES CONCERNÉES

4.1 **Catégories de personnes concernées**

Les traitements portent sur les catégories de personnes suivantes :
- Clients personnes physiques du RT (particuliers, professionnels) ;
- Représentants légaux et mandataires de clients personnes morales ;
- Bénéficiaires effectifs (UBO — Ultimate Beneficial Owners) de clients personnes morales ;
- Donneurs d'ordre et bénéficiaires de transactions financières ;
- Personnes Politiquement Exposées (PEP) identifiées lors des screenings ;
- Personnes et entités figurant ou susceptibles de figurer sur des listes de sanctions ;
- Utilisateurs de la plateforme du côté du RT (analystes, compliance officers, administrateurs).

4.2 **Catégories de données à caractère personnel traitées**

| Catégorie | Données | Sensibilité |
|-----------|---------|-------------|
| Données d'identité civile | Nom, prénom, date et lieu de naissance, nationalité, numéro de pièce d'identité, pays de résidence | Standard |
| Données de contact | Adresse postale, adresse email, numéro de téléphone | Standard |
| Données économiques | Revenus déclarés, patrimoine estimé, profession, secteur d'activité | Standard |
| Données transactionnelles | Montants, dates, contreparties, canaux de paiement, références | Standard |
| Documents d'identité | Scan CNI, passeport, justificatif de domicile, extrait K-bis | Standard (peuvent contenir données sensibles) |
| Données de scoring | Score de risque KYC, score AML, historique d'alertes | Standard |
| Données comportementales | Fréquence de transactions, patterns d'utilisation, scoring pKYC | Standard |
| Données de sanctions/PEP | Statut de sanction, statut PEP, source de désignation | Standard |
| Données d'audit | Logs d'actions utilisateurs, horodatages, adresses IP internes | Standard |

4.3 **Catégories particulières de données**

Le traitement peut, accessoirement, conduire à traiter des catégories particulières de données au sens de l'article 9 du RGPD (notamment des données révélant des origines raciales ou ethniques apparaissant sur des documents d'identité, ou des données relatives à des condamnations pénales dans le cadre de la vérification PEP). Ces données ne sont traitées que dans la stricte mesure nécessaire à l'exécution des obligations légales LAB/FT du RT, sur le fondement de l'article 9(2)(g) du RGPD (intérêt public substantiel).

---

## ARTICLE 5 — INSTRUCTIONS DU RESPONSABLE DE TRAITEMENT

5.1 Le ST traite les données à caractère personnel uniquement sur instruction documentée du RT, à moins qu'il ne soit tenu d'y procéder en vertu d'une exigence légale à laquelle il est soumis. Dans ce cas, le ST informe le RT de cette exigence légale avant le traitement, sauf si cette information est interdite pour des motifs importants d'intérêt public.

5.2 Les instructions du RT sont formalisées dans :
- Le présent ATD et ses Annexes ;
- Le Contrat Principal et ses cahiers des charges ;
- La documentation de configuration de la plateforme ;
- Les demandes ponctuelles adressées par écrit (email ou ticket de support) par les personnes habilitées du RT.

5.3 Les personnes habilitées à donner des instructions au ST au nom du RT sont :
- Le Responsable de la Conformité / RCLCB du RT ;
- Le Délégué à la Protection des Données (DPO) du RT, si nommé ;
- Le Directeur des Systèmes d'Information (DSI) du RT, pour les instructions à caractère technique.

5.4 Si le ST estime qu'une instruction viole le RGPD ou toute autre disposition applicable en matière de protection des données, il en informe immédiatement le RT par écrit. Le ST n'est pas tenu d'exécuter une instruction illégale.

5.5 Le RT s'engage à ne donner que des instructions conformes au RGPD et à la réglementation LAB/FT applicable, et à informer le ST de tout changement dans le cadre réglementaire qui pourrait avoir une incidence sur les traitements effectués par ce dernier.

---

## ARTICLE 6 — OBLIGATIONS DU SOUS-TRAITANT

### 6.1 Obligation de confidentialité

6.1.1 Le ST s'engage à ce que les personnes autorisées à traiter les données à caractère personnel pour le compte du RT soient soumises à une obligation de confidentialité appropriée (contractuelle ou statutaire) et aient reçu une formation adéquate en matière de protection des données.

6.1.2 Le ST maintient une liste à jour des personnes ayant accès aux données traitées pour le compte du RT et la met à disposition du RT sur demande.

6.1.3 L'accès aux données est limité aux seules personnes qui en ont besoin pour accomplir leurs missions (principe du moindre privilège). Des contrôles d'accès techniques (RBAC — Role-Based Access Control) sont mis en oeuvre à cet effet.

### 6.2 Sécurité — Article 32 RGPD

6.2.1 Le ST met en oeuvre les mesures techniques et organisationnelles appropriées visées à l'article 32 du RGPD, tenant compte de l'état des connaissances, des coûts de mise en oeuvre, de la nature, de la portée, du contexte et des finalités du traitement, ainsi que des risques, dont le degré de probabilité et de gravité varie, pour les droits et libertés des personnes concernées.

6.2.2 Ces mesures sont détaillées en **Annexe 2** du présent accord et incluent notamment :
- Le chiffrement des données personnelles au repos (AES-256-GCM) et en transit (TLS 1.3) ;
- L'authentification forte des utilisateurs (MFA TOTP) ;
- La gestion des accès et des habilitations (RBAC 5 niveaux) ;
- La journalisation de toutes les opérations (audit trail immuable) ;
- Les tests de sécurité réguliers (pentests annuels, scans de vulnérabilités) ;
- Les procédures de sauvegarde et de restauration.

6.2.3 Le ST met régulièrement à jour ses mesures de sécurité pour tenir compte de l'évolution des menaces et des meilleures pratiques du secteur.

### 6.3 Assistance en cas d'exercice des droits

6.3.1 Le ST assiste le RT dans l'accomplissement de son obligation de donner suite aux demandes d'exercice des droits des personnes concernées (accès, rectification, effacement, opposition, limitation, portabilité), dans la mesure du possible eu égard à la nature du traitement et aux informations à sa disposition.

6.3.2 À cette fin, le ST met à disposition du RT les fonctionnalités techniques permettant d'identifier, d'exporter et, le cas échéant, de supprimer ou d'anonymiser les données d'une personne concernée identifiée, dans le respect des obligations légales de conservation LAB/FT.

6.3.3 En cas de demande directement adressée au ST par une personne concernée, le ST transmet immédiatement la demande au RT sans y donner suite lui-même, sauf instruction contraire du RT.

### 6.4 Assistance en cas de violation de données

6.4.1 Le ST notifie au RT toute violation de données à caractère personnel dans les meilleurs délais et, si possible, dans les **72 heures** après en avoir pris connaissance, conformément à l'article 33 du RGPD. Cette notification est adressée au DPO du RT (ou, à défaut, au Responsable de la Conformité) par email à l'adresse communiquée par le RT.

6.4.2 La notification comprend au minimum :
- La description de la nature de la violation ;
- Les catégories et le nombre approximatif de personnes concernées ;
- Les catégories et le nombre approximatif d'enregistrements de données concernés ;
- Les conséquences probables de la violation ;
- Les mesures prises ou envisagées pour remédier à la violation.

6.4.3 Le ST assiste le RT dans le respect de ses propres obligations de notification à la CNIL (dans les 72h) et, le cas échéant, aux personnes concernées.

### 6.5 Assistance à la réalisation des DPIA

6.5.1 Le ST assiste le RT, dans la mesure du possible et sur demande, dans la réalisation des analyses d'impact relatives à la protection des données (DPIA) requises en vertu de l'article 35 du RGPD.

6.5.2 À cet effet, le ST met à disposition du RT la documentation technique nécessaire à la réalisation d'une DPIA, incluant la description des mesures de sécurité, des flux de données et des sous-traitants ultérieurs.

6.5.3 Une DPIA pré-remplie relative aux traitements de la plateforme KYC-AML est disponible dans la documentation fournie par le ST avec la plateforme.

### 6.6 Sort des données en fin de contrat

Se référer à l'Article 10 du présent accord.

### 6.7 Registre des traitements

6.7.1 Le ST tient, en sa qualité de sous-traitant, un registre de toutes les catégories d'activités de traitement effectuées pour le compte du RT, conformément à l'article 30(2) du RGPD.

6.7.2 Ce registre est mis à disposition du RT et de la CNIL sur demande.

---

## ARTICLE 7 — SOUS-TRAITANTS ULTÉRIEURS AUTORISÉS

7.1 Le RT autorise le ST à faire appel aux sous-traitants ultérieurs listés en **Annexe 3** du présent accord pour l'exécution de services spécifiques dans le cadre du traitement des données à caractère personnel.

7.2 Le ST informe le RT de tout changement envisagé concernant l'ajout ou le remplacement d'autres sous-traitants. Le ST communique cette information par écrit (email ou interface de notification de la plateforme) au moins **30 jours calendaires** avant l'entrée en vigueur du changement, afin de donner au RT la possibilité de s'y opposer.

7.3 En cas d'opposition motivée du RT à un changement de sous-traitant ultérieur, les Parties se concerteront de bonne foi pour trouver une solution alternative. Si aucune solution n'est trouvée dans un délai de 30 jours, chacune des Parties pourra résilier le Contrat Principal avec un préavis de 30 jours, sans pénalité.

7.4 Le ST impose à chaque sous-traitant ultérieur, par contrat, les mêmes obligations en matière de protection des données que celles lui incombant en vertu du présent ATD. Le ST demeure pleinement responsable envers le RT de l'exécution par le sous-traitant ultérieur de ses obligations.

7.5 **Sous-traitants ultérieurs actuellement autorisés :**

| Sous-traitant | Service fourni | Pays | Base légale du transfert |
|---------------|---------------|------|------------------------|
| **Resend.com** (Resend Inc.) | Service d'envoi d'emails transactionnels et de notification (alertes, rapports, notifications d'incidents) | États-Unis | Clauses Contractuelles Types (CCT) — Décision 2021/914/UE |
| **OVH SAS** | Hébergement de l'infrastructure principale (serveurs, stockage), selon déploiement | France (EU) | Aucune (pays adéquat — UE) |
| **Hetzner Online GmbH** | Hébergement de l'infrastructure alternative ou secondaire, selon déploiement | Allemagne (EU) | Aucune (pays adéquat — UE) |
| **Amazon Web Services EMEA SARL** | Stockage de documents sur option (S3), selon configuration du client | Luxembourg (EU) | Aucune (pays adéquat — UE) |

7.6 La liste complète et à jour des sous-traitants ultérieurs est maintenue en **Annexe 3** du présent accord et sur la page de transparence disponible sur le site de l'Éditeur.

---

## ARTICLE 8 — TRANSFERTS HORS UNION EUROPÉENNE

8.1 **Principe de localisation préférentielle**

Dans la mesure du possible, le ST maintient les données à caractère personnel traitées pour le compte du RT au sein de l'Espace Économique Européen (EEE). L'infrastructure principale est hébergée dans des centres de données situés en Union Européenne (France ou Allemagne).

8.2 **Transferts identifiés**

Certains sous-traitants ultérieurs (notamment Resend.com) peuvent impliquer des transferts de données vers des pays tiers, en particulier vers les États-Unis.

8.3 **Garanties applicables aux transferts**

Tout transfert de données à caractère personnel vers un pays tiers est encadré par des garanties appropriées conformément au Chapitre V du RGPD (articles 44 à 50), et notamment :
- Les **Clauses Contractuelles Types (CCT)** adoptées par la Commission européenne dans sa décision d'exécution 2021/914/UE du 4 juin 2021 (modules applicables selon la nature du transfert) ;
- Les mesures techniques supplémentaires (chiffrement de bout en bout, pseudonymisation) réduisant au minimum les risques liés au transfert.

8.4 **Data Privacy Framework (DPF)**

Pour les transferts vers les États-Unis, le ST s'assure, dans la mesure du possible, que les sous-traitants ultérieurs concernés sont certifiés au titre du **EU-U.S. Data Privacy Framework** adopté par la décision d'adéquation de la Commission européenne du 10 juillet 2023, ou que des CCT sont en place à défaut.

8.5 Le ST tient à disposition du RT et de la CNIL, sur demande, les instruments juridiques encadrant les transferts hors EEE (CCT, certifications DPF).

8.6 En cas d'évolution de la réglementation applicable aux transferts internationaux (notamment en cas d'invalidation du DPF), le ST en informe le RT dans les meilleurs délais et prend les mesures nécessaires pour rétablir une base juridique valide pour les transferts.

---

## ARTICLE 9 — MESURES DE SÉCURITÉ

9.1 Le ST met en oeuvre et maintient un ensemble de mesures techniques et organisationnelles de sécurité conformes à l'article 32 du RGPD et adaptées aux risques spécifiques des traitements de données LAB/FT, dont la nature implique des données particulièrement sensibles.

9.2 Les mesures de sécurité mises en oeuvre sont détaillées en **Annexe 2** du présent accord.

9.3 Le ST fait référence à sa **Politique de Chiffrement et de Sécurité** (document interne disponible sur demande) pour la description détaillée des mécanismes cryptographiques déployés.

9.4 Les principales mesures incluent notamment :
- **Chiffrement des données au repos** : AES-256-GCM pour les données PII (champs d'identité, documents) stockées en base de données PostgreSQL ;
- **Chiffrement des données en transit** : TLS 1.3 pour toutes les communications entre le client et le serveur, et entre les composants de l'architecture ;
- **Authentification forte** : JWT (JSON Web Tokens) avec expiration courte (15 minutes), combiné avec MFA TOTP obligatoire pour les utilisateurs ayant accès aux données sensibles ;
- **Contrôle des accès** : RBAC 5 niveaux (VIEWER, ANALYST, SUPERVISOR, COMPLIANCE_OFFICER, ADMIN), cloisonnement des données par organisation (multi-tenant avec isolation garantie) ;
- **Intégrité des webhooks** : Signature HMAC-SHA256 de tous les messages sortants ;
- **Hachage des mots de passe** : bcrypt avec facteur de coût adapté ;
- **Journalisation** : Journal d'audit immuable de toutes les actions (accès, modification, suppression) avec horodatage UTC et identité de l'opérateur ;
- **Tests de sécurité** : Pentest annuel réalisé par un prestataire externe indépendant, scans automatiques de vulnérabilités dans la chaîne CI/CD (GitHub Actions).

9.5 En cas d'évolution significative de l'architecture de sécurité, le ST en informe le RT et met à jour l'Annexe 2.

---

## ARTICLE 10 — SORT DES DONNÉES EN FIN DE CONTRAT

10.1 À l'issue du Contrat Principal, pour quelque cause que ce soit (expiration, résiliation, résolution), le ST est tenu, dans un délai de **30 jours calendaires** à compter de la date d'effet de la fin du contrat, au choix du RT :

**Option A — Restitution :** Restituer l'intégralité des données à caractère personnel traitées pour le compte du RT dans un format structuré, couramment utilisé et lisible par machine (JSON ou CSV, selon la nature des données), accompagné de la documentation nécessaire à leur exploitation.

**Option B — Destruction :** Procéder à la destruction sécurisée et définitive de l'intégralité des données à caractère personnel traitées pour le compte du RT, en utilisant des méthodes conformes aux normes en vigueur (écrasement cryptographique, suppression sécurisée).

10.2 Le RT communique son choix (restitution ou destruction) par écrit au ST au plus tard à la date d'effet de la fin du contrat. À défaut, le ST procède à la destruction sécurisée des données.

10.3 Après l'opération de restitution ou de destruction, le ST délivre au RT, dans les 15 jours calendaires suivants, une **attestation écrite** certifiant la complète restitution ou la destruction sécurisée des données, précisant les catégories de données concernées et les méthodes employées.

10.4 Le ST peut conserver les données à caractère personnel traitées pour le compte du RT au-delà du délai de 30 jours dans les cas suivants :
- Lorsqu'une disposition légale ou réglementaire applicable au ST l'impose expressément ;
- Lorsqu'une procédure judiciaire ou administrative en cours le nécessite, sous réserve d'en informer le RT.

10.5 Le ST ne conserve, après la fin du contrat, aucune copie des données à caractère personnel traitées pour le compte du RT, à l'exception des cas visés à l'article 10.4 et des données anonymisées ou agrégées ne permettant plus l'identification des personnes concernées.

10.6 Pendant la période d'exportation ou de migration, le ST maintient la disponibilité et l'intégrité des données et garantit leur sécurité jusqu'à la confirmation par le RT de la bonne réception des données.

---

## ARTICLE 11 — ASSISTANCE AU RESPONSABLE DE TRAITEMENT

11.1 **Assistance pour les droits des personnes concernées**

Le ST met à disposition du RT les moyens techniques nécessaires pour répondre aux demandes d'exercice des droits des personnes concernées dans les délais prescrits par le RGPD. Ces moyens incluent notamment :
- Une API d'export des données d'un client identifié par son identifiant unique ;
- Une fonctionnalité de pseudonymisation des données PII permettant de mettre en oeuvre le droit à l'effacement tout en conservant les données AML/compliance non-personnelles requises par la réglementation LAB/FT ;
- Un journal complet des traitements appliqués à un client donné (droit d'accès).

11.2 **Assistance en cas de violation de données personnelles**

En cas de violation de données à caractère personnel, le ST :
- Notifie le RT dans les meilleurs délais (objectif : < 24h, maximum 72h après prise de connaissance) ;
- Fournit au RT toutes les informations nécessaires pour permettre à ce dernier de procéder à sa propre notification à la CNIL (formulaire RGPD Art.33) dans le délai de 72h ;
- Assiste le RT dans la préparation de la notification aux personnes concernées si le risque est élevé (Art.34 RGPD) ;
- Documente l'incident dans son registre des violations.

11.3 **Assistance pour les DPIA (Analyses d'Impact)**

Le ST fournit au RT, sur demande, l'assistance nécessaire pour la réalisation des analyses d'impact relatives à la protection des données (DPIA) requises par l'article 35 du RGPD. Cette assistance comprend :
- La mise à disposition de la documentation technique de la plateforme (architecture, flux de données, mesures de sécurité) ;
- Une DPIA de référence pré-remplie par le ST pour les traitements types de la plateforme ;
- La réponse aux questionnaires et aux demandes d'information complémentaires du RT ou de son DPO dans un délai raisonnable.

11.4 **Registre des traitements**

Le ST met à disposition du RT un extrait de son propre registre des activités de traitement (Art.30 RGPD) concernant les traitements effectués pour le compte du RT, afin de permettre à ce dernier de tenir son propre registre à jour.

---

## ARTICLE 12 — MISE À DISPOSITION DES PREUVES ET DROIT D'AUDIT

12.1 **Mise à disposition de la documentation**

Le ST met à disposition du RT toute la documentation nécessaire pour démontrer le respect des obligations découlant du présent ATD, et notamment :
- La description des mesures techniques et organisationnelles de sécurité (Annexe 2) ;
- Le registre des activités de traitement (Art.30 RGPD) ;
- La liste des sous-traitants ultérieurs autorisés (Annexe 3) ;
- Les attestations de conformité et certifications disponibles.

12.2 **Droit d'audit**

Le RT dispose du droit de vérifier, directement ou par l'intermédiaire d'un auditeur mandaté, le respect par le ST de ses obligations au titre du présent ATD. À cet effet :

a) Le RT notifie au ST sa demande d'audit par écrit avec un préavis minimum de **30 jours calendaires** ;
b) L'audit est conduit aux frais du RT, sauf si des manquements significatifs aux obligations du présent ATD sont constatés, auquel cas les frais d'audit sont à la charge du ST ;
c) L'auditeur est soumis à une obligation de confidentialité documentée préalablement à l'audit ;
d) L'audit ne peut porter que sur les systèmes, données et processus directement liés aux traitements effectués pour le compte du RT ;
e) La fréquence des audits est limitée à **une fois par an**, sauf en cas d'incident de sécurité avéré.

12.3 **Certifications et audits tiers**

Le ST peut, en lieu et place ou en complément d'un audit direct, mettre à disposition du RT les rapports d'audits tiers (pentest, audit de sécurité) ou les certifications obtenues (ISO 27001 en cours, SOC 2 en cours), sous réserve d'un accord de confidentialité préalable.

12.4 **Coopération avec la CNIL et les autorités de contrôle**

Le ST coopère avec la CNIL et toute autre autorité de contrôle compétente, sur demande de celle-ci ou du RT, dans le cadre des contrôles relatifs aux traitements de données effectués pour le compte du RT.

---

## ARTICLE 13 — RESPONSABILITÉ ET INDEMNISATION

13.1 **Responsabilité du ST**

Le ST est responsable du préjudice causé par un traitement de données à caractère personnel effectué en violation du présent ATD ou du RGPD, dans la mesure où il n'a pas respecté les obligations spécifiquement imposées aux sous-traitants ou a agi en dehors des instructions légales du RT.

13.2 **Responsabilité du RT**

Le RT est responsable du préjudice causé par des instructions données au ST qui seraient contraires au RGPD ou à toute autre réglementation applicable.

13.3 **Exonération**

Le ST est exonéré de sa responsabilité s'il prouve que le fait générateur du dommage ne lui est nullement imputable, notamment lorsque :
- Le ST a respecté toutes ses obligations ;
- Le dommage résulte d'une instruction du RT contraire au RGPD ;
- Le dommage résulte d'un événement de force majeure.

13.4 **Plafond de responsabilité**

La responsabilité contractuelle du ST au titre du présent ATD est limitée au montant prévu dans le Contrat Principal. Cette limitation de responsabilité ne s'applique pas en cas de faute lourde ou de dol du ST, ni en cas de violation intentionnelle des obligations de confidentialité.

13.5 **Solidarité**

Conformément à l'article 82(4) du RGPD, chaque Partie peut être tenue pour responsable de l'intégralité du dommage afin de garantir l'indemnisation effective de la personne concernée. La partie ayant indemnisé la personne lésée peut se retourner contre l'autre partie dans la mesure où celle-ci est responsable du dommage.

---

## ARTICLE 14 — DISPOSITIONS GÉNÉRALES

14.1 **Loi applicable**

Le présent ATD est régi par le droit français. En cas de conflit entre la version française et une traduction du présent accord, la version française prévaut.

14.2 **Juridiction compétente**

Tout litige relatif à l'interprétation, à l'exécution ou à la résiliation du présent ATD sera soumis à la compétence exclusive des **tribunaux compétents de Paris**, après tentative de règlement amiable d'une durée minimum de 30 jours.

14.3 **Modification**

Le présent ATD ne peut être modifié que par un avenant écrit signé par les représentants habilités des deux Parties. En cas d'évolution de la réglementation applicable imposant des modifications, le ST peut proposer des modifications au RT avec un préavis de 30 jours. Si le RT ne s'y oppose pas dans ce délai, les modifications sont réputées acceptées.

14.4 **Intégralité de l'accord**

Le présent ATD, y compris ses Annexes, constitue l'intégralité de l'accord des Parties sur son objet et remplace tout accord, arrangement ou document antérieur relatif à la protection des données entre les Parties.

14.5 **Divisibilité**

Si une ou plusieurs dispositions du présent ATD sont déclarées nulles, non avenues ou inapplicables, les autres dispositions demeureront en vigueur.

14.6 **Notification**

Toute notification au titre du présent ATD est adressée par écrit à l'adresse email ou postale des représentants désignés par chaque Partie. Chaque Partie informe l'autre de tout changement de représentant ou de coordonnées dans les meilleurs délais.

**Fait à Paris, le ___________________________________________**

**En deux exemplaires originaux.**

| Pour le Responsable de Traitement | Pour le Sous-traitant |
|---|---|
| Nom et qualité : ___________________ | Nom et qualité : ___________________ |
| Signature : ___________________ | Signature : ___________________ |
| Date : ___________________ | Date : ___________________ |

---

## ANNEXE 1 — DESCRIPTION DÉTAILLÉE DU TRAITEMENT

### A1.1 Identification du traitement

| Élément | Description |
|---------|-------------|
| Dénomination du traitement | KYC-AML Platform — Traitement de conformité LAB/FT |
| Version de la plateforme | v2.5 |
| Responsable de Traitement | [Désignation du Client] |
| Sous-traitant | [Éditeur KYC-AML Platform] |
| DPO du RT | [Nom et contact] |
| DPO du ST | [Nom et contact] |
| Date de démarrage | [Date de mise en production] |

### A1.2 Finalités détaillées

| Code | Finalité | Base légale (RGPD) | Obligation légale |
|------|---------|-------------------|-----------------|
| F-KYC | Vérification d'identité et évaluation du risque client | Art.6(1)(c) — Obligation légale | AMLD6, Ordonnance 2016-1635, BAM Circ.5/W/2023 |
| F-AML | Surveillance des transactions et détection des comportements suspects | Art.6(1)(c) — Obligation légale | AMLD6 Art.33, FATF R.20 |
| F-SANC | Screening contre listes de sanctions internationales | Art.6(1)(c) — Obligation légale | FATF R.6, AMLD6, Règlements UE |
| F-PEP | Identification et surveillance des PEP | Art.6(1)(c) — Obligation légale | AMLD6 Art.12, FATF R.12 |
| F-RPT | Production de rapports réglementaires (DS/SAR) | Art.6(1)(c) — Obligation légale | AMLD6 Art.33, TRACFIN |
| F-PKYC | Surveillance comportementale continue | Art.6(1)(c) — Obligation légale | AMLD6, FATF R.10 |
| F-AUDIT | Journalisation des actions pour traçabilité | Art.6(1)(c) — Obligation légale | AMLD6 Art.40, FATF R.11 |

### A1.3 Flux de données

Les données transitent selon le flux suivant :
1. **Injection** : Le Système Central Bancaire (CBS) ou le portail du RT envoie les données clients et transactionnelles à l'API de la plateforme via webhook sécurisé (TLS 1.3, signature HMAC-SHA256) ;
2. **Traitement** : La plateforme enrichit les données, applique le scoring KYC, le moteur AML et le screening de sanctions ;
3. **Stockage** : Les données sont stockées en base PostgreSQL (chiffrée) et en cache Redis (données temporaires) ;
4. **Consultation** : Les analystes et compliance officers du RT accèdent aux données via l'interface web sécurisée (HTTPS, MFA) ;
5. **Sortie** : Les rapports et déclarations sont générés et exportés (PDF, XML) pour soumission aux autorités ;
6. **Archivage** : Les données sont archivées selon la politique de rétention (Art.40 AMLD6, FATF R.11).

### A1.4 Localisation des données

| Environnement | Localisation | Hébergeur |
|---------------|-------------|----------|
| Production principale | France (EU) ou Allemagne (EU) | OVH SAS ou Hetzner Online GmbH |
| Stockage documents (optionnel) | Luxembourg (EU) | Amazon Web Services EMEA SARL |
| Cache Redis (temporaire) | Même infrastructure que production | — |
| Notifications email | États-Unis (CCT) | Resend.com |

---

## ANNEXE 2 — MESURES TECHNIQUES ET ORGANISATIONNELLES DE SÉCURITÉ

### A2.1 Chiffrement

| Périmètre | Algorithme | Clé | Implémentation |
|-----------|-----------|-----|----------------|
| Données PII au repos (PostgreSQL) | AES-256-GCM | Clé gérée en environnement sécurisé | Chiffrement au niveau applicatif, avant stockage |
| Données en transit (API) | TLS 1.3 | Certificat X.509 (2048 bits minimum) | HTTPS obligatoire, HSTS |
| Données en transit (composants internes) | TLS 1.3 | Certificats internes | Connexions inter-services |
| Documents (uploads) | AES-256-GCM | Clé de chiffrement des fichiers | Chiffrement avant stockage |
| Sauvegardes | AES-256 | Clé de sauvegarde séparée | Chiffrement avant archivage |

### A2.2 Contrôle des accès

| Mesure | Description |
|--------|-------------|
| Authentification | JWT (expiration 15 min) + Refresh Token (7 jours) |
| Facteur supplémentaire | MFA TOTP obligatoire (Google Authenticator, Authy) |
| Gestion des habilitations | RBAC 5 niveaux : VIEWER / ANALYST / SUPERVISOR / COMPLIANCE_OFFICER / ADMIN |
| Isolation multi-tenant | Cloisonnement par organisationId — aucun accès inter-tenant possible |
| Gestion des mots de passe | Hachage bcrypt (facteur de coût ≥ 12) |
| Politique de mot de passe | Complexité imposée, changement si compromission détectée |

### A2.3 Journalisation et traçabilité

| Élément | Description |
|---------|-------------|
| Scope | Toutes les actions : lecture, création, modification, suppression, export, tentative de connexion |
| Format | JSON structuré avec : timestamp UTC, userId, role, action, ressource, IP source |
| Conservation | 1 an actif + 4 ans archive (5 ans total) |
| Intégrité | Logs immuables — pas de modification/suppression possible par les utilisateurs |
| Monitoring | Prometheus + Grafana pour métriques, Loki pour agrégation de logs |

### A2.4 Sécurité applicative

| Mesure | Description |
|--------|-------------|
| Tests de sécurité | Pentest annuel par prestataire externe indépendant |
| CI/CD | Scans de vulnérabilités automatiques (GitHub Actions) à chaque déploiement |
| Dépendances | Audit des dépendances npm (npm audit) à chaque build |
| Rate limiting | Limitation du nombre de requêtes par IP et par utilisateur |
| Validation des entrées | Validation stricte de toutes les entrées (Zod schemas) |
| Protection CSRF/XSS | Headers de sécurité HTTP, validation CORS |

### A2.5 Continuité et sauvegarde

| Mesure | Description |
|--------|-------------|
| Sauvegardes | Quotidiennes, chiffrées, stockage hors-site |
| Tests de restauration | Mensuels |
| Disponibilité cible | 99,5% (hors maintenance planifiée) |
| Plan de continuité | PCA/PRA documenté, RTO < 4h, RPO < 24h |

### A2.6 Organisation

| Mesure | Description |
|--------|-------------|
| Formation | Formation sécurité et RGPD obligatoire pour tout le personnel |
| Habilitations | Principe du moindre privilège, revue semestrielle des habilitations |
| Sensibilisation | Communication régulière sur les bonnes pratiques |
| Gestion des incidents | Plan de réponse aux incidents documenté et testé |
| Sélection des sous-traitants | Évaluation sécurité préalable de tout nouveau sous-traitant |

---

## ANNEXE 3 — LISTE DES SOUS-TRAITANTS ULTÉRIEURS AUTORISÉS

| # | Dénomination | Siège | Service rendu | Données concernées | Garanties RGPD | Mise à jour |
|---|-------------|-------|--------------|-------------------|----------------|------------|
| 1 | **Resend.com** (Resend Inc.) | 548 Market St, San Francisco, CA 94104, USA | Service d'envoi d'emails transactionnels : alertes, notifications d'incidents, rapports | Adresse email du destinataire, contenu de la notification (peut contenir des données pseudonymisées) | Clauses Contractuelles Types (CCT — Décision 2021/914/UE) + DPA Resend | Janvier 2026 |
| 2 | **OVH SAS** | 2 rue Kellermann, 59100 Roubaix, France | Hébergement infrastructure principale : serveurs dédiés/VPS, stockage | Toutes données traitées par la plateforme | Accord de sous-traitance OVH conforme RGPD — hébergement UE | Janvier 2026 |
| 3 | **Hetzner Online GmbH** | Industriestrasse 25, 91710 Gunzenhausen, Allemagne | Hébergement infrastructure alternative/secondaire : serveurs dédiés, stockage | Toutes données traitées par la plateforme (selon déploiement) | Accord de traitement des données Hetzner — hébergement UE | Janvier 2026 |
| 4 | **Amazon Web Services EMEA SARL** | 38 Avenue John F. Kennedy, L-1855 Luxembourg | Stockage de documents (S3) — fonctionnalité optionnelle activée sur configuration | Documents KYC (CIN, passeports, justificatifs) — chiffrés AES-256 côté client avant envoi | Accord AWS DPA — hébergement UE (région eu-west) | Janvier 2026 |

**Note :** La liste des sous-traitants ultérieurs est susceptible d'évoluer. Toute modification fait l'objet d'une information préalable au RT conformément à l'Article 7.2 du présent accord. La version en vigueur est consultable sur demande auprès du ST.

---

*Fin de l'Accord de Traitement des Données Personnelles*

*Document interne — Confidentiel — © [Éditeur KYC-AML Platform] — Version 2.5 — Janvier 2026*
