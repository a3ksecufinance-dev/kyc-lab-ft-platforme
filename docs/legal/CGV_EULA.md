# Conditions Générales de Vente et Licence d'Utilisation
## KYC-AML Platform — Version en vigueur : Janvier 2026

**Document contractuel B2B — Confidentiel**

---

# PARTIE I — CONDITIONS GÉNÉRALES DE VENTE (CGV)

---

## ARTICLE 1 — OBJET ET CHAMP D'APPLICATION

1.1 Les présentes Conditions Générales de Vente (ci-après « CGV ») s'appliquent à toute commande, souscription ou abonnement à la plateforme SaaS KYC-AML Platform (ci-après « le Service ») proposée par l'Éditeur à des clients professionnels (ci-après « le Client »).

1.2 Les présentes CGV constituent, avec le Bon de Commande (BC) signé entre les Parties et l'Accord de Traitement des Données Personnelles (ATD), l'intégralité du contrat liant les Parties (ci-après « le Contrat »). En cas de contradiction entre les présentes CGV et le Bon de Commande, les stipulations du Bon de Commande prévalent.

1.3 Les présentes CGV s'appliquent exclusivement aux professionnels agissant dans le cadre de leur activité commerciale, industrielle, artisanale, libérale ou agricole. Elles excluent tout rapport avec des consommateurs au sens du droit de la consommation.

1.4 Toute commande passée par le Client implique son acceptation pleine et entière des présentes CGV. Toute condition contraire ou particulière invoquée par le Client, à défaut d'acceptation expresse de l'Éditeur, est inopposable à ce dernier quelle que soit la date à laquelle elle a pu être portée à sa connaissance.

1.5 L'Éditeur se réserve le droit de modifier les présentes CGV à tout moment. Les modifications entrent en vigueur à la date de leur publication sur le site de l'Éditeur. En cas de modification substantielle, l'Éditeur en informe le Client par email avec un préavis minimum de **60 jours calendaires**. La poursuite de l'utilisation du Service après l'entrée en vigueur des nouvelles CGV vaut acceptation par le Client.

---

## ARTICLE 2 — DÉFINITIONS

Dans le cadre des présentes CGV, les termes ci-après définis ont la signification suivante :

**« Éditeur »** désigne [Dénomination de la société éditrice], société par actions simplifiée au capital de [montant] euros, dont le siège social est situé à [adresse], immatriculée au RCS de Paris sous le numéro [numéro], représentée par [nom et qualité].

**« Client »** désigne toute personne morale ayant souscrit au Service de l'Éditeur dans le cadre de son activité professionnelle, conformément au Bon de Commande signé entre les Parties.

**« Utilisateur »** désigne toute personne physique habilitée par le Client à accéder au Service, dans la limite du nombre d'utilisateurs défini au Bon de Commande.

**« Service »** désigne la plateforme SaaS KYC-AML Platform v2.5 et l'ensemble des modules, fonctionnalités et services associés mis à disposition du Client par l'Éditeur via internet, dans les conditions définies au Bon de Commande et aux présentes CGV.

**« Données »** désigne l'ensemble des données à caractère personnel et des données professionnelles traitées par le Service pour le compte du Client.

**« Données Client »** désigne les données appartenant au Client (données de ses propres clients, données transactionnelles, paramètres de configuration, résultats d'analyse) stockées dans le Service.

**« Incident »** désigne tout dysfonctionnement du Service entraînant une interruption ou une dégradation significative de ses fonctionnalités, classifié selon les niveaux définis à l'Annexe SLA du Bon de Commande.

**« Module »** désigne un ensemble cohérent de fonctionnalités du Service pouvant faire l'objet d'une activation séparée et d'une tarification spécifique.

**« Environnement »** désigne l'ensemble des ressources informatiques (serveurs, bases de données, réseaux) sur lesquelles le Service est déployé et exploité.

**« Bon de Commande (BC) »** désigne le document contractuel signé entre les Parties précisant notamment les modules souscrits, le nombre d'utilisateurs, le volume de clients gérés, les tarifs et la durée du Contrat.

**« SLA »** désigne le Service Level Agreement (Accord de Niveau de Service) définissant les engagements de disponibilité et de performance de l'Éditeur.

---

## ARTICLE 3 — DESCRIPTION DES SERVICES ET MODULES

### 3.1 Service principal

L'Éditeur met à disposition du Client la plateforme KYC-AML Platform v2.5, solution SaaS de conformité réglementaire LAB/FT (Lutte Anti-Blanchiment et Financement du Terrorisme) accessible via navigateur web standard (HTTPS). Le Service comprend les modules suivants :

### 3.2 Modules inclus dans l'abonnement standard

| Module | Description | Inclus Standard |
|--------|-------------|----------------|
| **KYC & Onboarding** | Workflow de connaissance client, scoring de risque multi-critères, gestion du cycle de vie client (actif/inactif/gelé), révision périodique | Oui |
| **Moteur AML** | 12 règles de détection de comportements suspects (THRESHOLD, STRUCTURING, HIGH_FREQUENCY, VOLUME_SPIKE, HIGH_RISK_COUNTRY, PEP_TRANSACTION, SANCTION_COUNTERPARTY, ROUND_AMOUNT, UNUSUAL_CHANNEL, HAWALA_PATTERN, MENA_STRUCTURING, CASH_INTENSIVE), scoring 0-100 | Oui |
| **Screening Sanctions & PEP** | Vérification contre 6 listes officielles (OFAC SDN, EU FSF, UN SC, UK FCDO, OpenSanctions PEP, BAM/ANRF Maroc), matching fuzzy configurable | Oui |
| **Gestion des Alertes** | Workflow de traitement des alertes, escalade, commentaires, décision analyste, audit trail | Oui |
| **Dossiers d'Investigation (Cases)** | Regroupement d'alertes en dossiers d'investigation, workflow d'enquête, timeline, pièces jointes | Oui |
| **Reporting Réglementaire** | Génération de SAR/DS (PDF), export TRACFIN XML, rapport GoAML international | Oui |
| **pKYC Comportemental** | Surveillance comportementale continue, score de dérive, 5 facteurs d'analyse, file d'attente de révision | Oui |
| **Réseau d'Entités** | Graphe de relations entre entités, détection des bénéficiaires effectifs (UBO), identification de circuits | Oui |
| **Administration & Audit** | RBAC 5 niveaux, gestion des utilisateurs, journal d'audit complet, configuration des règles, gestion des organisations | Oui |
| **API & Webhooks** | API REST documentée (OpenAPI), webhooks CBS entrant et sortant (HMAC-SHA256) | Oui |
| **Tableau de Bord & KPIs** | Indicateurs en temps réel, statistiques LAB/FT, suivi des volumes | Oui |
| **Gestion de la Documentation** | Stockage et gestion des documents KYC (CNI, passeports, justificatifs), OCR basique | Oui |

### 3.3 Modules optionnels (sur devis)

| Module | Description | Tarification |
|--------|-------------|-------------|
| **ML Avancé** | Modèle XGBoost de scoring prédictif, réentraînement automatique sur les données du client, explicabilité (SHAP values), détection d'anomalies non supervisée | Sur devis |
| **eKYC Onfido** | Intégration avec la solution de vérification d'identité Onfido (vérification biométrique, comparaison faciale, OCR avancé) | Sur devis |
| **eKYC SumSub** | Intégration avec la solution de vérification d'identité Sum&Substance (workflow KYC digital complet) | Sur devis |
| **Support Premium** | SLA renforcé (disponibilité 99,9%, temps de réponse P0 < 30 min), gestionnaire de compte dédié, support téléphonique H24/7J | Sur devis |
| **Formation Certifiée** | Sessions de formation en présentiel ou distanciel, certification interne des équipes | Sur devis |
| **Déploiement On-Premise** | Déploiement de la plateforme sur l'infrastructure propre du Client (Docker), assistance à l'installation et à la configuration | Sur devis |

### 3.4 Évolution des services

L'Éditeur se réserve le droit de faire évoluer le Service, notamment pour l'enrichir de nouvelles fonctionnalités, l'adapter aux évolutions réglementaires ou améliorer ses performances. Ces évolutions sont déployées sans interruption de service significative. En cas de modification substantielle des fonctionnalités ou de changement d'interface, l'Éditeur en informe le Client au moins **30 jours** à l'avance.

---

## ARTICLE 4 — TARIFICATION

### 4.1 Modèle de tarification

La tarification du Service est basée sur :
- Un **abonnement mensuel récurrent** calculé en fonction du volume de clients gérés (actifs en base KYC) selon les tranches tarifaires définies au Bon de Commande ;
- Des **frais de setup uniques** facturés lors de la mise en production initiale, couvrant l'installation, la configuration, la personnalisation et la formation initiale ;
- Des **frais additionnels** pour les modules optionnels souscrits, selon tarifs définis au Bon de Commande.

### 4.2 Tranches tarifaires indicatives (abonnement mensuel)

| Tranche clients gérés | Tarif mensuel HT (indicatif) | Inclus |
|----------------------|------------------------------|--------|
| Jusqu'à 1 000 clients | À définir au Bon de Commande | Tous modules standard, 10 utilisateurs |
| De 1 001 à 5 000 clients | À définir au Bon de Commande | Tous modules standard, 25 utilisateurs |
| De 5 001 à 20 000 clients | À définir au Bon de Commande | Tous modules standard, 50 utilisateurs |
| Plus de 20 000 clients | Sur devis | Tous modules standard, utilisateurs illimités |

*Les tarifs définitifs sont ceux figurant au Bon de Commande signé entre les Parties. Les tarifs indicatifs ci-dessus peuvent être modifiés sans préavis pour les nouvelles souscriptions.*

### 4.3 Révision annuelle des tarifs

Les tarifs d'abonnement sont susceptibles d'être révisés annuellement à la date anniversaire du Contrat, dans la limite de **5% par an** ou de l'indice Syntec (whichever is lower), sans qu'il soit nécessaire de modifier le Bon de Commande. L'Éditeur informe le Client de toute révision tarifaire au moins **60 jours** avant son entrée en vigueur.

### 4.4 Frais hors périmètre

Ne sont pas inclus dans le tarif d'abonnement : les coûts d'infrastructure tiers (si déploiement on-premise chez le Client), les frais de personnalisation spécifique hors catalogue, les formations supplémentaires au-delà du pack initial.

---

## ARTICLE 5 — DURÉE DU CONTRAT

5.1 **Durée initiale**

Le Contrat est conclu pour une durée initiale de **12 mois** à compter de la date de signature du Bon de Commande (ci-après « Date de Démarrage »), sauf durée différente expressément stipulée au Bon de Commande.

5.2 **Tacite reconduction**

À l'issue de la durée initiale et de chaque période de renouvellement, le Contrat se renouvelle automatiquement par tacite reconduction pour des périodes successives de **12 mois**, sauf dénonciation par l'une ou l'autre des Parties dans les conditions définies à l'article 5.3.

5.3 **Préavis de non-renouvellement**

Pour éviter la tacite reconduction, chaque Partie doit notifier son intention de ne pas renouveler le Contrat par lettre recommandée avec accusé de réception ou email avec confirmation de lecture adressé au représentant désigné de l'autre Partie, avec un préavis minimum de **3 mois** avant la date d'échéance du Contrat en cours.

5.4 **Période d'engagement minimale**

La durée minimale d'engagement est de 12 mois. En cas de résiliation avant le terme de la période initiale ou d'une période de renouvellement pour des raisons autres que la faute de l'Éditeur, le Client est redevable de l'intégralité des loyers dus jusqu'au terme de la période en cours.

---

## ARTICLE 6 — FACTURATION ET PAIEMENT

### 6.1 Facturation

Les frais de setup font l'objet d'une facturation unique à la date de mise en production (ou à la signature du Bon de Commande, selon ce qui est stipulé au BC). L'abonnement mensuel est facturé **mensuellement à terme échu**, soit à la fin de chaque mois d'utilisation.

### 6.2 Modalités de paiement

Les factures sont payables dans un délai de **30 jours** à compter de la date d'émission de la facture, par virement bancaire sur le compte de l'Éditeur dont les coordonnées figurent sur la facture, sauf modalité différente stipulée au Bon de Commande.

### 6.3 Pénalités de retard

Conformément à la loi n°92-1442 du 31 décembre 1992 et à l'article L.441-6 du Code de commerce, tout retard de paiement entraîne de plein droit l'application de pénalités de retard calculées sur la base d'un taux égal à **trois (3) fois le taux d'intérêt légal** en vigueur, appliqué au montant de la facture impayée, et ce à compter du jour suivant la date d'échéance figurant sur la facture.

Une indemnité forfaitaire pour frais de recouvrement d'un montant de **40 euros** est également due de plein droit par le débiteur en retard, conformément à l'article D.441-5 du Code de commerce. Lorsque les frais de recouvrement exposés sont supérieurs à ce montant forfaitaire, l'Éditeur peut demander une indemnisation complémentaire sur justification.

### 6.4 Suspension pour impayé

En cas de non-paiement d'une facture dans un délai de **15 jours** suivant l'envoi d'une mise en demeure par email ou courrier, l'Éditeur se réserve le droit de suspendre l'accès au Service après en avoir informé le Client. La suspension ne dispense pas le Client de ses obligations de paiement. L'accès est rétabli dans les 24h suivant la réception du paiement intégral des sommes dues.

### 6.5 Taxes

Tous les tarifs sont exprimés hors taxes (HT). La TVA applicable en France (actuellement 20%) est facturée en sus au taux en vigueur à la date d'émission de la facture. En cas d'exonération applicable (autoliquidation pour les clients UE non établis en France), le Client en informe l'Éditeur et fournit son numéro de TVA intracommunautaire valide.

---

## ARTICLE 7 — OBLIGATIONS ET GARANTIES DE L'ÉDITEUR

### 7.1 Accès au Service

L'Éditeur s'engage à mettre à disposition du Client le Service dans les conditions et selon les niveaux de service définis au présent Contrat et à l'Annexe SLA.

### 7.2 Disponibilité et SLA

L'Éditeur s'engage à maintenir une disponibilité du Service de **99,5%** mesurée mensuellement, hors :
- Maintenances planifiées notifiées au moins 48h à l'avance, réalisées de préférence en dehors des heures ouvrées ;
- Événements de force majeure au sens de l'article 1218 du Code civil ;
- Incidents liés à l'infrastructure du Client (connexion internet, CBS) ;
- Attaques de déni de service distribué (DDoS) d'ampleur exceptionnelle.

En cas de non-respect du SLA, le Client bénéficie de crédits de service selon les modalités définies à l'Annexe SLA.

### 7.3 Conformité fonctionnelle

L'Éditeur garantit que le Service est conforme aux spécifications fonctionnelles décrites dans la documentation officielle mise à disposition du Client. En cas de non-conformité avérée, l'Éditeur s'engage à corriger le dysfonctionnement dans les délais prévus au SLA selon la sévérité de l'incident.

### 7.4 Conformité réglementaire

L'Éditeur s'engage à maintenir la conformité du Service avec les réglementations LAB/FT en vigueur (AMLD5/6, recommandations FATF, BAM Circulaire 5/W/2023) et à intégrer les évolutions réglementaires dans un délai raisonnable suivant leur entrée en vigueur.

### 7.5 Exclusion de garantie sur les taux de faux positifs

L'Éditeur ne garantit pas un taux de faux positifs ou de faux négatifs spécifique dans la détection des alertes AML ou des correspondances de screening. L'efficacité des règles de détection dépend de la qualité et de la complétude des données transmises par le Client, ainsi que des paramètres de configuration choisis par le Client. La configuration des seuils de détection relève de la responsabilité du Client en tant que Responsable de Traitement.

### 7.6 Support technique

L'Éditeur fournit un support technique aux Utilisateurs selon les niveaux définis au Bon de Commande :
- **Support Standard** : Accès au portail de support (tickets) en jours ouvrés (lundi-vendredi, 9h-18h CET), délai de première réponse < 4h pour incidents P1, < 24h pour P2/P3.
- **Support Premium** (option) : Disponibilité 24h/24 et 7j/7, délai de première réponse < 30 min pour P0.

---

## ARTICLE 8 — OBLIGATIONS DU CLIENT

8.1 Le Client s'engage à :
- Payer les redevances dans les délais convenus ;
- Utiliser le Service conformément à sa destination et à la documentation fournie ;
- Transmettre des données exactes et à jour ;
- Gérer les accès des Utilisateurs et s'assurer que seules les personnes habilitées accèdent au Service ;
- Informer l'Éditeur de tout incident, anomalie ou suspicion de compromission ;
- Respecter les obligations légales qui lui incombent en qualité de Responsable de Traitement ;
- Configurer les règles AML et les seuils de détection de manière appropriée à son profil de risque ;
- Ne pas tenter de contourner les mécanismes de sécurité du Service.

8.2 Le Client est seul responsable de la conformité de ses décisions (acceptation, refus, déclaration de soupçon) avec la réglementation LAB/FT applicable. La plateforme est un outil d'aide à la décision : la décision finale appartient au Client.

---

## ARTICLE 9 — LIMITATION DE RESPONSABILITÉ

### 9.1 Plafond de responsabilité

La responsabilité contractuelle totale de l'Éditeur envers le Client au titre du présent Contrat, pour tout type de préjudice subi par le Client, est limitée au montant total des redevances effectivement **payées par le Client au cours des 12 mois précédant le fait générateur** du dommage.

### 9.2 Exclusion des dommages indirects

En aucun cas l'Éditeur ne sera tenu responsable de dommages indirects subis par le Client ou des tiers, tels que notamment : perte de chiffre d'affaires, perte de bénéfices, perte de clientèle, perte de données, atteinte à l'image, manque à gagner, trouble commercial, surcoûts résultant d'un recours à une solution alternative.

### 9.3 Cas d'exclusion de responsabilité

La responsabilité de l'Éditeur ne saurait être engagée en cas de :
- Non-respect par le Client des recommandations de configuration et d'utilisation ;
- Utilisation du Service en dehors des conditions contractuelles ;
- Défaillance des infrastructures tiers non sous le contrôle de l'Éditeur ;
- Sanction, amende ou pénalité administrative infligée au Client par une autorité de régulation, sauf faute directe de l'Éditeur dûment démontrée ;
- Décision prise par le Client sur la base des résultats fournis par le Service.

### 9.4 Inapplicabilité

Les limitations de responsabilité prévues au présent article ne s'appliquent pas en cas de dommage corporel, de faute lourde ou dolosive, de fraude, ou dans les cas prévus par des dispositions légales impératives.

---

## ARTICLE 10 — PROPRIÉTÉ INTELLECTUELLE

### 10.1 Droits de l'Éditeur

Le Service, son code source, ses algorithmes, son architecture, ses interfaces, ses bases de données, sa documentation, ses marques et tous les éléments qui les composent sont et demeurent la propriété exclusive de l'Éditeur ou de ses concédants. Aucune disposition du présent Contrat ne transfère au Client de droits de propriété intellectuelle sur le Service ou ses composants.

### 10.2 Licence accordée au Client

Dans le cadre et pour la durée du Contrat, l'Éditeur concède au Client une **licence d'utilisation non-exclusive, non-transférable et révocable** du Service, limitée à l'usage interne du Client pour les besoins de son activité de conformité LAB/FT. Cette licence est précisée et encadrée par la Partie II (EULA) des présentes.

### 10.3 Propriété des Données Client

Les Données Client demeurent la propriété exclusive du Client. L'Éditeur ne dispose d'aucun droit d'utilisation des Données Client autres que ceux strictement nécessaires à l'exécution du Service. Se référer à l'ATD pour les détails.

### 10.4 Feedback et améliorations

Si le Client communique à l'Éditeur des suggestions, idées ou retours sur le Service, l'Éditeur peut les utiliser librement pour améliorer le Service, sans compensation. Le Client cède à l'Éditeur tous droits sur ces suggestions dans la mesure où elles seraient susceptibles d'être protégées.

---

## ARTICLE 11 — CONFIDENTIALITÉ

### 11.1 Obligation de confidentialité mutuelle

Chaque Partie s'engage à garder strictement confidentielles les informations désignées comme telles ou dont la nature confidentielle est évidente (notamment : informations techniques, commerciales, financières, savoir-faire, données client, tarifs) communiquées par l'autre Partie dans le cadre du Contrat (ci-après « Informations Confidentielles »).

### 11.2 Durée de l'obligation

L'obligation de confidentialité s'applique pendant toute la durée du Contrat et pendant **5 ans** suivant son expiration ou sa résiliation.

### 11.3 Exceptions

L'obligation de confidentialité ne s'applique pas aux informations :
- Qui sont ou deviennent publiques sans violation du présent article ;
- Que la Partie concernée connaissait déjà avant leur communication par l'autre Partie ;
- Dont la communication est requise par une disposition légale ou réglementaire, une décision judiciaire ou une injonction d'autorité administrative, à condition d'en informer préalablement l'autre Partie si légalement possible.

### 11.4 Utilisation des informations confidentielles

Chaque Partie s'engage à n'utiliser les Informations Confidentielles de l'autre que dans le cadre de l'exécution du Contrat, et à ne les communiquer qu'aux seuls membres de son personnel ou sous-traitants qui en ont besoin pour ladite exécution et qui sont soumis à des obligations de confidentialité équivalentes.

---

## ARTICLE 12 — LOI APPLICABLE ET JURIDICTION COMPÉTENTE

12.1 Le présent Contrat est soumis au **droit français**.

12.2 En cas de litige relatif à l'interprétation, à l'exécution ou à la résiliation du présent Contrat, les Parties s'engagent à tenter de résoudre le différend à l'amiable dans un délai de **30 jours** à compter de la notification du litige par l'une des Parties.

12.3 À défaut de résolution amiable dans ce délai, tout litige sera soumis à la compétence exclusive du **Tribunal de Commerce de Paris**, nonobstant pluralité de défendeurs ou appel en garantie, même pour les procédures d'urgence ou conservatoires en référé.

---

## ARTICLE 13 — RÉSILIATION

### 13.1 Résiliation pour manquement

Chaque Partie peut résilier le Contrat en cas de manquement grave de l'autre Partie à ses obligations contractuelles, si ce manquement n'est pas remédié dans un délai de **30 jours calendaires** suivant l'envoi d'une mise en demeure par lettre recommandée avec accusé de réception détaillant le manquement constaté.

Constituent notamment des manquements graves justifiant une résiliation immédiate sans préavis :
- La violation de l'obligation de confidentialité ;
- Le non-paiement de deux (2) factures successives ou plus ;
- La violation des droits de propriété intellectuelle de l'Éditeur ;
- L'utilisation du Service à des fins illicites.

### 13.2 Résiliation pour insolvabilité

Chaque Partie peut résilier le Contrat de plein droit, sans préavis ni mise en demeure préalable, en cas d'ouverture d'une procédure de sauvegarde, de redressement judiciaire ou de liquidation judiciaire à l'encontre de l'autre Partie.

### 13.3 Effets de la résiliation

La résiliation du Contrat entraîne :
- La cessation immédiate du droit d'accès au Service pour le Client et ses Utilisateurs ;
- L'obligation pour le Client de s'acquitter de toutes les sommes dues à la date de résiliation ;
- La restitution ou la destruction des Données Client dans les conditions prévues à l'ATD (Article 10 de l'ATD) ;
- La survie des obligations de confidentialité, des dispositions relatives à la propriété intellectuelle et des clauses de limitation de responsabilité.

---

## ARTICLE 14 — FORCE MAJEURE

14.1 Aucune Partie ne sera tenue responsable de tout manquement à ses obligations contractuelles dû à un cas de force majeure au sens de l'article 1218 du Code civil. Constitue notamment un cas de force majeure : catastrophe naturelle, pandémie, acte terroriste, cyberattaque d'ampleur nationale, décision gouvernementale, grève générale des services d'internet.

14.2 La Partie invoquant la force majeure doit en informer l'autre Partie par écrit dans les meilleurs délais et prendre toutes mesures raisonnables pour limiter l'impact de l'événement.

14.3 Si le cas de force majeure se prolonge au-delà de **60 jours** consécutifs, chaque Partie peut résilier le Contrat sans indemnité par lettre recommandée avec accusé de réception.

---

# PARTIE II — LICENCE D'UTILISATION FINALE (EULA — End User License Agreement)

---

## ARTICLE 15 — LICENCE ACCORDÉE

### 15.1 Étendue de la licence

Sous réserve du respect intégral des présentes conditions et du paiement des redevances dues, l'Éditeur accorde au Client une **licence d'utilisation** du Service KYC-AML Platform v2.5 présentant les caractéristiques suivantes :
- **Non-exclusive** : L'Éditeur conserve le droit de concéder des licences identiques ou similaires à d'autres clients ;
- **Non-transférable** : Le Client ne peut en aucun cas céder, transférer ou sous-licencier la présente licence à un tiers sans accord écrit préalable de l'Éditeur ;
- **Révocable** : L'Éditeur peut révoquer la licence en cas de violation de ses termes, conformément à l'Article 13 ;
- **Limitée dans le temps** : La licence est accordée pour la durée du Contrat uniquement ;
- **Limitée dans l'objet** : La licence couvre uniquement l'accès et l'utilisation du Service via l'interface web fournie (mode SaaS) ou via l'API REST documentée.

### 15.2 Accès au Service

L'accès au Service s'effectue exclusivement :
- Via l'interface web sécurisée (HTTPS) en utilisant les identifiants fournis par l'Éditeur ;
- Via l'API REST documentée, en utilisant les clés API générées dans la console d'administration.

---

## ARTICLE 16 — UTILISATEURS AUTORISÉS

### 16.1 Utilisateurs nommés

La licence est accordée pour un nombre déterminé d'**utilisateurs nommés** (personnes physiques identifiées), tel que défini au Bon de Commande. Chaque utilisateur dispose de ses propres identifiants de connexion, non partagés. Tout partage d'identifiants est interdit.

### 16.2 Gestion des utilisateurs

Le Client est responsable de la création, de la gestion et de la suppression des comptes utilisateurs via la console d'administration. Le Client s'engage à désactiver immédiatement le compte de tout utilisateur ayant quitté son organisation ou n'ayant plus besoin d'accéder au Service.

### 16.3 Dépassement du nombre d'utilisateurs

Si le nombre d'utilisateurs actifs dépasse le nombre prévu au Bon de Commande, le Client est tenu d'en informer l'Éditeur et de souscrire aux utilisateurs supplémentaires nécessaires. L'Éditeur se réserve le droit de facturer rétroactivement les utilisateurs en excédent.

### 16.4 Habilitations et rôles

Le Client gère les rôles et habilitations de ses Utilisateurs au sein du système RBAC de la plateforme (VIEWER, ANALYST, SUPERVISOR, COMPLIANCE_OFFICER, ADMIN). Le Client est seul responsable de l'adéquation des habilitations accordées aux fonctions de ses Utilisateurs.

---

## ARTICLE 17 — RESTRICTIONS D'UTILISATION

Le Client s'interdit expressément de :

17.1 **Ingénierie inverse et décompilation** : Procéder ou faire procéder à toute opération de reverse engineering, décompilation, désassemblage ou toute tentative d'extraction du code source du Service ;

17.2 **Reproduction et modification** : Reproduire, modifier, adapter, traduire, créer des oeuvres dérivées du Service ou de tout composant de celui-ci ;

17.3 **Revente et sous-licence** : Revendre, louer, prêter, sous-licencier le Service ou l'accès au Service à des tiers, y compris des filiales ou sociétés affiliées non explicitement mentionnées au Bon de Commande ;

17.4 **Usage non conforme** : Utiliser le Service à des fins autres que la conformité LAB/FT, le KYC et les activités de conformité réglementaire correspondantes à l'activité professionnelle du Client ;

17.5 **Usage illicite** : Utiliser le Service à des fins contraires aux lois et réglementations applicables, notamment pour contourner les obligations LAB/FT, pour du profilage discriminatoire non justifié par la réglementation, ou pour toute activité frauduleuse ;

17.6 **Atteinte à la sécurité** : Tenter de contourner les mesures de sécurité du Service, de procéder à des tests d'intrusion non autorisés, d'accéder à des données d'autres clients ;

17.7 **Surcharge du Service** : Envoyer des volumes de requêtes dépassant les limites contractuelles de manière à dégrader les performances du Service pour les autres clients (en mode SaaS mutualisé) ;

17.8 **Non-conformité RGPD** : Utiliser le Service en violation des obligations du Client en tant que Responsable de Traitement au titre du RGPD, notamment en traitant des catégories de données non prévues ou en conservant des données au-delà des durées légales.

---

## ARTICLE 18 — PROPRIÉTÉ DES DONNÉES CLIENT

18.1 Les **Données Client** (données des clients du Client, paramètres de configuration, résultats d'analyse, alertes, dossiers d'investigation) demeurent la **propriété exclusive du Client** à tout moment.

18.2 L'Éditeur n'acquiert aucun droit de propriété sur les Données Client. Il n'est autorisé à traiter ces données qu'en qualité de sous-traitant, dans le cadre et aux fins définis dans l'ATD.

18.3 L'Éditeur s'interdit d'exploiter les Données Client à des fins commerciales propres (publicité, revente, prospection) ou de les communiquer à des tiers sans instruction du Client, sauf obligation légale.

18.4 Le Client conserve à tout moment la possibilité d'exporter ses Données via les fonctionnalités d'export du Service (API ou interface) dans un format structuré et réutilisable.

---

## ARTICLE 19 — MISES À JOUR DU SERVICE

### 19.1 Mises à jour incluses

Les mises à jour du Service (correctifs, évolutions fonctionnelles, mises à jour réglementaires) sont **incluses dans l'abonnement** sans supplément de prix, sauf introduction d'un nouveau module optionnel faisant l'objet d'une tarification spécifique.

### 19.2 Politique de versioning

L'Éditeur s'engage à respecter la politique de versioning sémantique suivante :
- **Versions correctives (patch)** : déployées sans préavis, sans impact fonctionnel ;
- **Versions mineures** : déployées avec notification 7 jours à l'avance, sans breaking changes, rétrocompatibilité garantie ;
- **Versions majeures** : déployées avec notification **30 jours** à l'avance minimum, peuvent inclure des breaking changes documentés, migration assistée proposée.

### 19.3 Breaking changes

L'Éditeur s'engage à ne pas déployer de breaking changes (changements incompatibles avec l'intégration existante du Client) sans préavis minimum de **30 jours** et sans fournir une période de transition permettant au Client d'adapter son intégration.

### 19.4 Documentation

Toute nouvelle version est accompagnée de notes de version (release notes) documentant les changements, les correctifs et les nouvelles fonctionnalités. La documentation technique est maintenue à jour.

---

## ARTICLE 20 — SUPPORT UTILISATEUR

### 20.1 Support Standard (inclus)

Le support standard inclus dans l'abonnement comprend :
- Accès au portail de support (tickets) disponible 24h/24, 7j/7 ;
- Traitement des tickets en jours ouvrés (lundi-vendredi, 9h-18h CET) ;
- Délais de traitement selon la classification des incidents :
  - **P0 (critique)** : Première réponse < 2h, résolution ou contournement < 4h ;
  - **P1 (majeur)** : Première réponse < 4h, résolution < 8h ;
  - **P2 (modéré)** : Première réponse < 1 jour ouvré, résolution < 3 jours ouvrés ;
  - **P3 (mineur)** : Première réponse < 2 jours ouvrés, résolution selon planning.
- Accès à la base de connaissances et à la documentation en ligne ;
- Formation initiale des administrateurs (jusqu'à 2 sessions en distanciel).

### 20.2 Support Premium (option)

Le support premium optionnel comprend, en sus du support standard :
- Disponibilité 24h/24, 7j/7 y compris jours fériés ;
- Délai de première réponse P0 < 30 minutes ;
- Gestionnaire de compte dédié (Customer Success Manager) ;
- Support téléphonique direct pour les incidents P0/P1 ;
- Revue de service trimestrielle.

---

## ARTICLE 21 — AUDIT D'UTILISATION

21.1 L'Éditeur se réserve le droit de vérifier, à tout moment et sans préavis, le respect par le Client des termes de la présente licence, notamment :
- Le nombre d'utilisateurs actifs par rapport au Bon de Commande ;
- Le volume de clients gérés par rapport aux tranches souscrites ;
- L'absence d'utilisation contraire aux restrictions de l'Article 17.

21.2 À cette fin, l'Éditeur peut accéder aux données de télémétrie et aux logs d'utilisation anonymisés de la plateforme. Ces données ne comprennent pas les Données Client.

21.3 En cas de dépassement constaté, l'Éditeur notifie le Client par écrit et lui adresse une facture de régularisation. Le Client dispose de 30 jours pour régulariser sa situation ou contester les constatations.

---

## ARTICLE 22 — RÉSILIATION DE LA LICENCE

22.1 La licence prend fin automatiquement à l'expiration ou à la résiliation du Contrat pour quelque cause que ce soit.

22.2 En cas de violation des termes de la présente licence (notamment Article 17), l'Éditeur peut révoquer la licence avec un préavis de **48 heures**, après notification du manquement et absence de remédiation dans ce délai.

22.3 À la fin de la licence, quelle qu'en soit la cause :
- L'accès au Service est désactivé pour l'ensemble des Utilisateurs du Client dans un délai de **48 heures** suivant la date d'effet de la fin ;
- Le Client s'engage à cesser immédiatement toute utilisation du Service ;
- Les Données Client sont restituées ou détruites dans les conditions prévues à l'ATD (Article 10), dans un délai maximum de **30 jours calendaires** ;
- Toute copie locale de documentation ou d'exports précédemment effectués reste soumise aux obligations de confidentialité et ne peut être utilisée qu'à des fins de conformité réglementaire.

---

## ARTICLE 23 — FORMATION ET CERTIFICATION

23.1 Le Client s'engage à former ses Utilisateurs à l'utilisation du Service, en particulier en ce qui concerne les bonnes pratiques de conformité LAB/FT et les obligations réglementaires.

23.2 L'Éditeur met à disposition du Client les supports de formation (documentation, vidéos, guides) nécessaires à la formation autonome des Utilisateurs.

23.3 Le programme de certification interne décrit dans le document **Plan de Formation KYC-AML Platform** (document séparé) est recommandé pour assurer la bonne utilisation du Service et la traçabilité de la compétence des Utilisateurs auprès des autorités de contrôle.

---

## ARTICLE 24 — DISPOSITIONS FINALES DE L'EULA

24.1 La présente EULA est régie par le droit français et soumise aux mêmes dispositions relatives à la juridiction compétente que les CGV (Article 12).

24.2 La nullité d'une clause de la présente EULA n'entraîne pas la nullité des autres clauses.

24.3 Le fait pour l'Éditeur de ne pas se prévaloir d'une disposition des présentes à un moment donné ne constitue pas une renonciation à s'en prévaloir ultérieurement.

---

**Fait à Paris, le ___________________________________________**

**En deux exemplaires originaux.**

| Pour le Client | Pour l'Éditeur |
|---|---|
| Nom et qualité : ___________________ | Nom et qualité : ___________________ |
| Signature : ___________________ | Signature : ___________________ |
| Date : ___________________ | Date : ___________________ |
| Cachet : ___________________ | Cachet : ___________________ |

---

**ANNEXE A — ANNEXE SLA (Service Level Agreement)**

*(À compléter selon les niveaux de service négociés dans le Bon de Commande)*

| Niveau | Disponibilité | RTO | RPO | Crédit en cas de dépassement |
|--------|-------------|-----|-----|------------------------------|
| Standard | 99,5% / mois | < 4h | < 24h | 5% de la redevance mensuelle par tranche de 0,5% en dessous du seuil |
| Premium | 99,9% / mois | < 1h | < 4h | 10% de la redevance mensuelle par tranche de 0,1% en dessous du seuil |

---

*Fin des Conditions Générales de Vente et Licence d'Utilisation*

*Document interne — Confidentiel — © [Éditeur KYC-AML Platform] — Version en vigueur : Janvier 2026*
