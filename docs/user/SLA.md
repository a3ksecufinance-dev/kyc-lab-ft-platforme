# Contrat de Niveau de Service (SLA)
## KYC-AML Platform v2.x

**Document :** SLA-KYC-AML-v2.5
**Version :** 2.5
**Date d'entrée en vigueur :** 1er avril 2026
**Classification :** Contractuel — Diffusion restreinte aux parties signataires
**Révision suivante prévue :** 1er avril 2027

---

## Parties Contractantes

**L'Éditeur :** Société éditrice de la Plateforme KYC-AML, ci-après désignée « l'Éditeur »

**Le Client :** Établissement financier ou assujetti au sens de la 5e Directive Anti-Blanchiment (AMLD5), ci-après désigné « le Client »

Le présent Contrat de Niveau de Service (« SLA », de l'anglais *Service Level Agreement*) est annexé au Contrat Principal de Licence et de Services entre l'Éditeur et le Client. En cas de contradiction entre les dispositions du présent SLA et celles du Contrat Principal, les dispositions du Contrat Principal prévalent, sauf disposition expresse contraire dans le présent SLA.

---

## 1. Objet et Champ d'Application

### 1.1 Objet

Le présent Contrat de Niveau de Service a pour objet de définir, de manière précise et opposable, les engagements de disponibilité, de performance et de support de la Plateforme KYC-AML (ci-après « la Plateforme ») fournie par l'Éditeur au Client dans le cadre du Contrat Principal.

Ce document constitue la référence contractuelle unique pour :
- Les niveaux de disponibilité garantis de la Plateforme et de ses composants critiques ;
- Les objectifs de performance mesurables pour chaque catégorie d'opération ;
- Les niveaux de service du support technique et les délais d'intervention associés ;
- Les modalités de calcul et d'application des pénalités contractuelles (crédits de service) en cas de manquement aux engagements ;
- Les obligations respectives de l'Éditeur et du Client pour le maintien de la qualité de service ;
- Les procédures de signalement, de gestion et de clôture des incidents.

### 1.2 Champ d'Application

Le présent SLA s'applique à l'ensemble des composants et fonctionnalités de la Plateforme KYC-AML v2.x déployée dans l'environnement de production du Client ou hébergée par l'Éditeur (mode SaaS), à savoir :

- **Module KYC (Know Your Customer)** : Onboarding client, gestion du cycle de vie KYC, vérification documentaire, pKYC (periodic KYC) et scoring de dérive comportementale ;
- **Moteur AML (Anti-Money Laundering)** : Analyse des transactions, application des 12 règles AML, génération des alertes, gestion des dossiers d'investigation ;
- **Module de Screening** : Criblage temps réel contre les 6 listes de sanctions (OFAC, UE, ONU, UK FCDO, PEP via OpenSanctions, BAM/ANRF) ;
- **Service ML** : Scoring XGBoost, réentraînement du modèle, évaluation des 21 features comportementales ;
- **Interfaces de Reporting** : Génération des rapports PDF, exports TRACFIN XML, exports GoAML XML, tableaux de bord analytiques ;
- **API tRPC** : Ensemble des endpoints exposés aux intégrations CBS (Core Banking System) du Client ;
- **Infrastructure technique** : Services Docker Compose (app, postgres, redis, nginx, certbot, ml, prometheus, grafana, loki, backup).

### 1.3 Entrée en Vigueur et Durée

Le présent SLA entre en vigueur à la **date de mise en production** de la Plateforme, telle que définie et constatée conjointement par les parties dans le procès-verbal de recette. Il demeure en vigueur pour la **durée du Contrat Principal** et suit les mêmes conditions de renouvellement et de résiliation.

### 1.4 Périmètre Géographique

Les engagements du présent SLA s'appliquent depuis les infrastructures de production hébergées dans les datacenters désignés au Contrat Principal, jusqu'aux points de terminaison réseau de l'Éditeur (edge de sortie). La qualité du réseau entre les équipements du Client et les datacenters de l'Éditeur n'entre pas dans le périmètre des engagements du présent SLA.

---

## 2. Définitions

Aux fins du présent SLA, les termes suivants ont la signification qui leur est attribuée ci-dessous :

**Alerte** : Notification générée automatiquement par le moteur AML en réponse à la détection d'un comportement transactionnel correspondant à l'une des règles AML configurées.

**Batch nuitier** : Traitement automatisé exécuté chaque nuit entre 01h00 et 06h00 UTC, incluant notamment le scoring pKYC et la mise à jour des listes de sanctions.

**Canal officiel de support** : Email support@[éditeur] ou portail de ticketing accessible à l'adresse support.[éditeur].com. Tout signalement effectué par un autre canal (messagerie instantanée, appel téléphonique non suivi d'email) n'engage pas les délais de réponse contractuels, sauf pour les incidents P0 qui font l'objet d'une procédure d'astreinte dédiée.

**Crédit de service** : Réduction appliquée sur la facture mensuelle suivante en compensation d'un manquement aux engagements de disponibilité. Les crédits de service ne constituent pas un remboursement en numéraire.

**Dégradation significative** : Situation dans laquelle la Plateforme reste techniquement accessible mais où les temps de réponse dépassent de manière continue (pendant plus de 15 minutes consécutives) les seuils P99 définis à la Section 4, ou dans laquelle plus de 20% des requêtes reçoivent une erreur HTTP 5xx.

**Disponibilité** : Pourcentage du temps pendant lequel la Plateforme répond aux requêtes dans les délais spécifiés à la Section 4, mesuré sur un mois civil. Une indisponibilité est caractérisée par l'incapacité de la Plateforme à répondre à des requêtes valides, qu'elle soit totale ou partielle (dégradation significative). La mesure de disponibilité est effectuée via des sondes Prometheus exécutant des healthchecks toutes les 30 secondes sur les endpoints `/health` et `/api/trpc/system.health`.

**Environnement de production** : L'instance de la Plateforme utilisée pour le traitement des données réelles du Client, par opposition aux environnements de développement, test ou staging, qui ne sont pas couverts par le présent SLA.

**Escalade** : Processus par lequel un incident est porté à l'attention d'un niveau de responsabilité supérieur au sein de l'organisation de l'Éditeur, lorsque le délai de résolution cible approche ou est dépassé.

**Fenêtre de maintenance** : Plage horaire réservée aux interventions techniques planifiées : **samedi et dimanche entre 02h00 et 06h00 UTC**. Les indisponibilités survenant pendant la fenêtre de maintenance et résultant de travaux préalablement notifiés ne sont pas comptabilisées dans le calcul de disponibilité.

**Force majeure** : Événement imprévisible, irrésistible et extérieur à la volonté des parties, y compris notamment : catastrophe naturelle, incendie détruisant les infrastructures, coupure électrique totale et durable non couverte par les systèmes de redondance, cyberattaque de type DDoS d'ampleur exceptionnelle (trafic >100× le volume nominal), décision gouvernementale ou réglementaire contraignante.

**Heure ouvrable** : Toute heure comprise entre 09h00 et 18h00 CET (heure d'Europe centrale), du lundi au vendredi, hors jours fériés légaux français.

**Incident** : Toute interruption non planifiée ou dégradation significative d'un service de la Plateforme, détectée par l'Éditeur via son système de monitoring ou signalée par le Client via le canal officiel de support.

**Maintenance planifiée** : Toute intervention technique sur les infrastructures de production, préalablement planifiée et communiquée par l'Éditeur au Client conformément aux délais de préavis définis à la Section 10. La durée de maintenance planifiée ne peut excéder 4 heures par mois civil.

**Mois civil** : Période de référence pour le calcul de disponibilité, commençant le premier jour du mois à 00h00 UTC et se terminant le dernier jour du mois à 23h59 UTC.

**Point de contact technique** : Personne désignée par le Client, disposant des compétences techniques nécessaires pour collaborer avec les équipes de l'Éditeur lors de la résolution d'incidents.

**RTO (Recovery Time Objective)** : Durée maximale acceptable entre la détection d'un incident et le retour à un état opérationnel normal, tel que défini dans le Plan de Reprise d'Activité (PRA) annexé au présent SLA.

**RPO (Recovery Point Objective)** : Quantité maximale acceptable de données pouvant être perdues en cas d'incident grave, exprimée en durée (1 heure pour la Plateforme KYC-AML).

**Scoring AML** : Opération par laquelle le moteur de règles AML de la Plateforme évalue le niveau de risque d'une transaction en appliquant les 12 règles configurées et, le cas échéant, le modèle ML XGBoost, pour produire un score de risque et, si nécessaire, générer une alerte.

**Temps de résolution** : Délai écoulé entre le moment où l'Éditeur a pris connaissance de l'incident (via son monitoring ou via le signalement du Client) et le moment où la Plateforme est revenue à son état opérationnel normal, confirmé par les deux parties.

**Ticket** : Dossier ouvert dans le système de suivi des incidents de l'Éditeur, auquel est attribué un numéro unique de référence permettant le suivi de bout en bout de l'incident.

---

## 3. Engagements de Disponibilité

### 3.1 Disponibilité Mensuelle Garantie

L'Éditeur s'engage à maintenir une **disponibilité mensuelle de la Plateforme d'au moins 99,5%**, soit une indisponibilité cumulée maximale de **3 heures et 36 minutes** par mois civil.

### 3.2 Formule de Calcul

La disponibilité mensuelle est calculée selon la formule suivante :

```
Disponibilité (%) = ((M - I) / M) × 100

Où :
  M = Nombre total de minutes dans le mois civil considéré
      (ex. : 43 200 minutes pour un mois de 30 jours)
  I = Nombre de minutes d'indisponibilité effective durant le mois,
      après application des exclusions définies à la Section 3.3
```

**Exemple de calcul** pour un mois de janvier (31 jours = 44 640 minutes) avec 45 minutes d'indisponibilité effective :

```
Disponibilité = ((44 640 - 45) / 44 640) × 100 = 99,899%
→ Seuil de 99,5% respecté. Aucun crédit applicable.
```

**Exemple de calcul** avec 240 minutes d'indisponibilité effective :

```
Disponibilité = ((44 640 - 240) / 44 640) × 100 = 99,462%
→ Seuil de 99,5% non atteint. Seuil 99,0%–99,5% : crédit de 5% applicable.
```

### 3.3 Exclusions du Calcul de Disponibilité

Les périodes suivantes ne sont **pas comptabilisées** dans le calcul des minutes d'indisponibilité :

**a) Maintenances planifiées :**
Toute indisponibilité survenant pendant une fenêtre de maintenance préalablement notifiée par l'Éditeur au Client, dans le respect des délais de préavis définis à la Section 10. La durée totale de maintenance planifiée est plafonnée à 4 heures par mois civil. Au-delà de ce plafond, les minutes excédentaires sont comptabilisées dans le calcul de disponibilité.

**b) Force majeure :**
Tout événement qualifiable de force majeure au sens de la définition donnée à la Section 2 et de l'article 1218 du Code civil français, dûment constaté et documenté. L'Éditeur s'engage à notifier le Client dans les 4 heures suivant la survenance d'un tel événement et à fournir une documentation justificative dans les 5 jours ouvrés.

**c) Incidents imputables au Client :**
- Mauvaise configuration des paramètres d'intégration CBS fournis par le Client ;
- Saturation du réseau côté Client entraînant l'impossibilité d'atteindre les endpoints de la Plateforme ;
- Dépassement délibéré ou non des limites de débit (rate limiting) sans accord préalable de l'Éditeur ;
- Modifications non autorisées des paramètres de configuration de la Plateforme effectuées par le Client ;
- Tests de charge ou tests de performance menés sans coordination préalable avec l'Éditeur.

**d) Indisponibilité des services tiers :**
- Indisponibilité temporaire des sources de mise à jour des listes de sanctions (OFAC SDN list, UE EU Sanctions Map, ONU Consolidated List, UK FCDO, OpenSanctions PEP, BAM/ANRF). La Plateforme dispose d'un mécanisme de cache Redis permettant de continuer les opérations de screening en cas d'indisponibilité des sources pendant 23 heures.
- Indisponibilité du service d'envoi d'email (notifications, alertes) imputable au prestataire email tiers.
- Indisponibilité des services d'infrastructure tiers (CDN, DNS externe) non opérés par l'Éditeur.

### 3.4 Disponibilité par Composant

En complément de l'engagement global, l'Éditeur maintient les objectifs de disponibilité par composant suivants (indicatifs, non soumis à pénalité individuelle) :

| Composant | Disponibilité cible | Impact en cas d'indisponibilité |
|---|---|---|
| API tRPC principale (app) | 99,5% | Critique — service indisponible |
| PostgreSQL 16 | 99,9% | Critique — perte de fonctionnalité totale |
| Redis 7 (cache + blacklist JWT) | 99,5% | Majeur — dégradation des performances, mode sans cache |
| Service ML FastAPI | 99,0% | Modéré — scoring ML désactivé, règles AML restent actives |
| Nginx (TLS/proxy) | 99,9% | Critique — accès externe impossible |
| Service de backup | 99,0% | Mineur — pas d'impact opérationnel immédiat |
| Prometheus/Grafana | 98,0% | Faible — perte de visibilité monitoring |
| Loki (logs) | 98,0% | Faible — perte de centralisation des logs |

---

## 4. Niveaux de Performance — Temps de Réponse API

Les engagements de performance sont mesurés par les histogrammes Prometheus collectés en production sur des fenêtres glissantes de 5 minutes, et consolidés dans les rapports mensuels. Les percentiles suivants sont garantis **hors maintenances planifiées et hors incidents déclarés** :

### 4.1 Tableau des Engagements de Performance

| Endpoint / Opération | Médiane (P50) | 95ème percentile (P95) | 99ème percentile (P99) | Outil de mesure |
|---|---|---|---|---|
| Scoring AML transaction | < 100 ms | < 300 ms | < 500 ms | Prometheus histogram `aml_scoring_duration_seconds` |
| Scoring ML (XGBoost) | < 200 ms | < 500 ms | < 1 000 ms | Prometheus histogram `ml_scoring_duration_seconds` |
| Screening sanctions temps réel | < 200 ms | < 500 ms | < 1 000 ms | Prometheus histogram `screening_duration_seconds` |
| Onboarding client KYC | < 500 ms | < 1 000 ms | < 2 000 ms | Prometheus histogram `kyc_onboarding_duration_seconds` |
| Consultation alertes (liste paginée) | < 100 ms | < 300 ms | < 500 ms | Prometheus histogram `alert_list_duration_seconds` |
| Génération rapport PDF | < 3 000 ms | < 8 000 ms | < 15 000 ms | Prometheus histogram `pdf_generation_duration_seconds` |
| Génération export TRACFIN XML | < 5 000 ms | < 15 000 ms | < 30 000 ms | Prometheus histogram `tracfin_export_duration_seconds` |
| Batch pKYC nuitier | Complété avant 06h00 UTC | — | — | Logs scheduler `pkyc_batch_completed` |
| Mise à jour listes de sanctions | Complétée avant 04h00 UTC | — | — | Logs scheduler `sanctions_update_completed` |

### 4.2 Conditions de Mesure

- Les mesures sont effectuées en conditions normales d'exploitation, sans pic de charge anormal (volume transactionnel inférieur à 2× la moyenne mensuelle).
- Les temps de réponse sont mesurés côté serveur, de la réception de la requête HTTP complète à l'envoi du dernier octet de la réponse.
- La latence réseau entre le Client et les datacenters de l'Éditeur n'est pas incluse dans la mesure.
- Les opérations de génération PDF et d'export XML incluent le temps de collecte des données, de rendu et de compression, mais excluent le temps de téléchargement du fichier par le Client.

### 4.3 Dépassement des Seuils de Performance

Un dépassement ponctuel et isolé des seuils de performance (durée inférieure à 5 minutes) ne constitue pas un incident au sens du présent SLA. Un dépassement continu supérieur à **15 minutes** des seuils P99 est qualifié d'incident P1 ou P2 selon les critères définis à la Section 5.

---

## 5. Niveaux de Support

### 5.1 Classification des Incidents

| Criticité | Définition | Exemples représentatifs | Délai de première réponse | Temps de résolution cible |
|---|---|---|---|---|
| **P0 — Critique** | Plateforme totalement inaccessible pour tous les utilisateurs, ou moteur AML/Screening totalement inopérant, entraînant l'impossibilité de traiter toute transaction | Crash applicatif total, base de données PostgreSQL inaccessible, Nginx ne répond plus, toutes les requêtes API retournent HTTP 503 | **15 minutes** (24h/24, 7j/7) | **4 heures** |
| **P1 — Majeur** | Module critique de la Plateforme hors service, ou dégradation sévère des performances affectant la capacité de traitement | Module de screening hors service, alertes non générées pour les transactions dépassant les seuils, scoring AML retournant des erreurs sur >50% des requêtes, temps de réponse API >5s de manière continue | **1 heure** (24h/24, 7j/7) | **8 heures ouvrées** |
| **P2 — Modéré** | Fonctionnalité secondaire dégradée, sans impact direct sur la conformité réglementaire du Client | Génération PDF lente ou en échec partiel, tableau de bord Grafana inaccessible, export TRACFIN intermittent, pagination défectueuse, service ML indisponible (règles AML restent actives) | **4 heures ouvrées** | **48 heures ouvrées** |
| **P3 — Mineur** | Anomalie cosmétique, comportement non conforme sans impact sur les fonctions métier, demande d'amélioration mineure | Libellé incorrect dans l'interface, graphique manquant dans un rapport, traduction manquante en mode i18n, message d'erreur non explicite | **24 heures ouvrées** | **Prochaine version mineure (≤90 jours)** |

### 5.2 Plages Horaires de Support

| Niveau | Plage horaire |
|---|---|
| **P0 et P1** — Astreinte | 24 heures sur 24, 7 jours sur 7, 365 jours par an |
| **P2 et P3** — Support standard | Lundi au vendredi, 09h00–18h00 CET, hors jours fériés légaux français |

### 5.3 Canaux de Contact

**Pour les incidents P0 et P1 :**
1. Appel téléphonique immédiat au numéro d'astreinte communiqué lors de la mise en production (disponible dans le livrable « Kit de démarrage »).
2. Email simultané à support@[éditeur] avec le tag `[P0]` ou `[P1]` dans l'objet.
3. L'Éditeur accuse réception et ouvre un ticket dans le délai contractuel défini.

**Pour les incidents P2 et P3 :**
1. Email à support@[éditeur] ou ouverture de ticket via le portail support.[éditeur].com.
2. Description de l'incident, impact observé, captures d'écran ou logs si disponibles.
3. L'Éditeur accuse réception et ouvre un ticket dans le délai contractuel défini.

### 5.4 Escalade

En cas de non-respect des délais de résolution cible, la procédure d'escalade suivante s'applique :
- **P0 à 2h sans résolution** : Escalade automatique au Responsable Technique de l'Éditeur.
- **P0 à 3h30 sans résolution** : Escalade à la Direction Technique de l'Éditeur. Information du point de contact Direction du Client.
- **P1 à 6h ouvrées sans résolution** : Escalade au Responsable Technique de l'Éditeur.
- **P1 à 7h ouvrées sans résolution** : Escalade à la Direction Technique de l'Éditeur.

---

## 6. Pénalités de Service (Crédits)

### 6.1 Barème des Crédits

Si la disponibilité mensuelle effective de la Plateforme est inférieure aux seuils définis ci-dessous, le Client est éligible à un crédit de service déductible de la prochaine facture mensuelle :

| Disponibilité mensuelle effective | Crédit de service applicable |
|---|---|
| ≥ 99,5% | Aucun crédit (engagement respecté) |
| ≥ 99,0% et < 99,5% | 5% de la redevance mensuelle HT |
| ≥ 98,0% et < 99,0% | 10% de la redevance mensuelle HT |
| ≥ 95,0% et < 98,0% | 20% de la redevance mensuelle HT |
| < 95,0% | 30% de la redevance mensuelle HT |

### 6.2 Modalités d'Application des Crédits

**a) Nature des crédits :** Les crédits de service sont exclusivement déductibles de la prochaine facture émise par l'Éditeur. Ils ne constituent en aucun cas un remboursement en numéraire, un avoir monnayable ou une reconnaissance de responsabilité contractuelle extracontractuelle de l'Éditeur.

**b) Plafond mensuel :** Le montant total des crédits de service applicables sur un mois civil donné ne peut excéder l'équivalent d'**un mois de redevance mensuelle HT**, quel que soit le nombre ou la durée des incidents survenus au cours du mois.

**c) Procédure de demande :** Pour bénéficier d'un crédit de service, le Client doit formuler une demande écrite motivée à l'adresse support@[éditeur] dans un délai de **30 jours calendaires** suivant la fin du mois civil concerné. La demande doit préciser : le ou les incidents invoqués (référence ticket), la durée d'indisponibilité constatée et le montant de crédit sollicité. Passé ce délai, le droit au crédit est réputé forfait.

**d) Instruction de la demande :** L'Éditeur instruit la demande de crédit dans un délai de 15 jours ouvrés suivant sa réception. La décision est notifiée au Client par écrit. En cas d'acceptation, le crédit est appliqué sur la facture du mois suivant. En cas de contestation par l'Éditeur, les données de disponibilité issues de Prometheus font foi, sous réserve du droit du Client d'apporter la preuve contraire par tout moyen.

**e) Non-cumul :** Les crédits de service ne se cumulent pas avec d'autres pénalités contractuelles pouvant résulter du même incident, sauf disposition expresse contraire du Contrat Principal.

**f) Exclusivité :** Les crédits de service constituent le seul et unique recours contractuel du Client en cas de manquement aux engagements de disponibilité définis dans le présent SLA, dans la limite du plafond de responsabilité défini au Contrat Principal.

---

## 7. Obligations du Client

Le respect des engagements de disponibilité et de performance définis dans le présent SLA est conditionné au respect par le Client des obligations suivantes :

### 7.1 Obligations Techniques

**a) Connectivité réseau :** Le Client s'engage à maintenir une connectivité réseau stable et suffisante entre ses systèmes d'information (Core Banking System, postes de travail des analystes) et les endpoints API de la Plateforme. La bande passante minimale recommandée est de 10 Mbit/s dédié pour les intégrations CBS et de 2 Mbit/s par utilisateur concurrent pour les accès interface.

**b) Respect des limites de débit (rate limiting) :** Le Client s'engage à ne pas dépasser les limites de débit configurées pour son compte : **100 requêtes par minute** par défaut pour les intégrations CBS (configurable sur demande justifiée). Le dépassement répété des limites de débit peut entraîner la suspension temporaire automatique des accès et n'ouvre pas droit à crédit de service.

**c) Compatibilité des intégrations :** Le Client s'engage à maintenir ses intégrations CBS en compatibilité avec la version de l'API tRPC en production. L'Éditeur notifie les breaking changes conformément à la Section 10. Le Client dispose d'un délai de migration défini lors de la notification de breaking change.

**d) Sécurité des accès :** Le Client est responsable de la sécurité des credentials d'accès (tokens JWT, secrets webhook) qui lui sont attribués. En cas de compromission suspectée, il en informe immédiatement l'Éditeur.

### 7.2 Obligations Organisationnelles

**e) Désignation d'un référent technique :** Le Client désigne un point de contact technique nommément identifié, disponible pendant les heures ouvrables, capable d'interagir avec les équipes de support de l'Éditeur. Le Client notifie l'Éditeur de tout changement de référent dans un délai de 5 jours ouvrés.

**f) Signalement rapide des incidents :** Le Client s'engage à signaler tout incident ou dégradation constatée dans les meilleurs délais via le canal officiel de support. Un signalement tardif peut limiter les droits au crédit de service.

**g) Notification des changements d'infrastructure :** Le Client notifie l'Éditeur avec un préavis minimum de **10 jours ouvrés** avant tout changement d'infrastructure susceptible d'affecter les intégrations avec la Plateforme : migration du CBS, changement d'adresses IP, modification des règles de firewall, évolution des protocoles d'authentification.

**h) Coopération lors des incidents :** Le Client met à disposition ses équipes techniques pour assister l'Éditeur lors de la résolution d'incidents susceptibles d'être liés à son environnement. Le refus de coopération peut entraîner la suspension des délais de résolution.

**i) Maintien des accréditations réglementaires :** Le Client s'assure que son utilisation de la Plateforme est conforme à ses propres obligations réglementaires LCB-FT. L'Éditeur n'est pas responsable des manquements réglementaires résultant d'une utilisation incorrecte ou non conforme de la Plateforme par le Client.

---

## 8. Procédure de Signalement et de Gestion des Incidents

### 8.1 Phases de Gestion d'un Incident

**Phase 1 — Détection**
La détection des incidents peut intervenir par les canaux suivants :
- **Monitoring automatisé** : Les sondes Prometheus exécutent des healthchecks toutes les 30 secondes sur les endpoints `/health` de chaque service. Une alerte est déclenchée automatiquement si 3 healthchecks consécutifs échouent (soit 1 minute 30 d'indisponibilité). Les alertes sont routées vers Grafana AlertManager, qui notifie l'équipe de permanence par email et par PagerDuty.
- **Alertes de performance** : Des alerting rules Prometheus sont configurées pour déclencher des alertes lorsque les percentiles P95 dépassent les seuils SLA pendant plus de 5 minutes consécutives.
- **Signalement utilisateur** : Le Client ou ses utilisateurs détectent un dysfonctionnement et le signalent via le canal officiel de support.

**Phase 2 — Qualification**
L'ingénieur de permanence de l'Éditeur analyse le signal d'alerte reçu et le qualifie selon la grille de criticité définie à la Section 5.1, en évaluant :
- La portée fonctionnelle (quel module ou service est affecté ?)
- L'impact métier (les opérations de conformité du Client sont-elles bloquées ?)
- L'étendue géographique (tous les clients ou un seul ?)
- La tendance (situation stable, en amélioration ou en dégradation ?)

**Phase 3 — Signalement et Ouverture de Ticket**

*Pour les incidents P0/P1 :*
- L'ingénieur de permanence appelle immédiatement le point de contact technique du Client.
- Un email est envoyé à support@[client] avec le numéro de ticket, la qualification, l'impact connu et le délai estimé d'une première mise à jour.
- Un ticket est ouvert dans le système de suivi avec horodatage de détection.

*Pour les incidents P2/P3 :*
- Un email de confirmation de prise en charge est envoyé au Client dans les délais définis à la Section 5.1.
- Un ticket est ouvert dans le système de suivi.

**Phase 4 — Résolution et Suivi**

*Fréquence des mises à jour de statut :*
- **P0** : Mise à jour toutes les **60 minutes** jusqu'à résolution.
- **P1** : Mise à jour toutes les **4 heures ouvrées** jusqu'à résolution.
- **P2** : Mise à jour à mi-parcours et en clôture.
- **P3** : Mise à jour en clôture uniquement.

Les mises à jour sont transmises par email au point de contact technique du Client et au référent conformité si désigné.

**Phase 5 — Clôture**
- L'Éditeur confirme par écrit la résolution de l'incident.
- Le Client dispose de **4 heures ouvrées** pour valider la clôture ou signaler une récurrence.
- Pour les incidents P0 et P1, un **rapport post-incident (Post-Incident Report, PIR)** est transmis au Client dans les **48 heures ouvrées** suivant la résolution. Ce rapport contient : chronologie de l'incident, cause racine identifiée, actions correctives menées, mesures préventives planifiées.

### 8.2 Page de Statut

L'Éditeur maintient une page de statut publique accessible à status.[éditeur].com, affichant l'état en temps réel des composants de la Plateforme. Le Client peut s'abonner aux notifications email ou webhook de changement de statut.

---

## 9. Rapports de Performance Mensuels

### 9.1 Contenu des Rapports

L'Éditeur transmet au Client, dans les **10 jours ouvrés suivant la fin de chaque mois civil**, un rapport de performance mensuel structuré couvrant les éléments suivants :

**a) Disponibilité :**
- Taux de disponibilité mesuré du mois (pourcentage, calcul détaillé)
- Comparaison avec l'engagement contractuel (99,5%)
- Graphique de disponibilité journalière (courbe Prometheus)

**b) Résumé des incidents :**
- Liste des incidents survenus (référence ticket, date, durée, qualification)
- Impact sur la disponibilité et les performances
- Cause racine identifiée pour les incidents P0 et P1
- Mesures correctives et préventives appliquées ou planifiées
- Statut des actions post-incident des mois précédents

**c) Métriques de performance :**
- Percentiles P50, P95, P99 pour chaque endpoint mesuré (tableau comparatif avec seuils SLA)
- Évolution mensuelle des performances (graphiques de tendance)
- Anomalies de performance et explications

**d) Statistiques d'activité :**
- Nombre total de transactions analysées par le moteur AML
- Nombre d'alertes générées, avec répartition par règle déclenchée
- Nombre de screenings effectués et taux de correspondance sanctions
- Nombre d'onboardings KYC traités
- Nombre de rapports PDF générés
- Volume d'exports TRACFIN et GoAML
- Résultats du batch pKYC nuitier (nombre de clients évalués, dérives détectées)

**e) Sécurité et mises à jour :**
- Résumé des mises à jour de sécurité déployées
- Mises à jour des listes de sanctions (dates, sources, nombre d'entrées)
- Métriques de sécurité (tentatives d'authentification échouées, tokens révoqués)

### 9.2 Format et Transmission

Les rapports sont transmis par email sous format PDF et XLSX (données brutes) au(x) destinataire(s) désigné(s) par le Client lors de la mise en production. Le Client peut demander à modifier la liste des destinataires par simple email à support@[éditeur].

### 9.3 Réunion de Revue Trimestrielle

L'Éditeur propose au Client une réunion de revue de service trimestrielle (QBR — Quarterly Business Review) en format visioconférence, permettant d'examiner les tendances de performance sur le trimestre écoulé, d'anticiper les évolutions de la Plateforme et d'aligner les roadmaps réglementaires et techniques.

---

## 10. Maintenance et Mises à Jour

### 10.1 Mises à Jour de Sécurité (Patches Critiques)

Les correctifs de sécurité classifiés « Critique » ou « Haute » (CVSS ≥ 7.0) sont déployés **dans les 72 heures** suivant leur disponibilité, sans nécessiter de préavis formel si le déploiement peut être effectué sans interruption de service (rolling update). Si le déploiement nécessite un redémarrage ou une intervention planifiée, un préavis de **24 heures** est communiqué au Client.

### 10.2 Mises à Jour Mineures

Les mises à jour mineures (versions x.y.z, corrections de bugs non critiques, améliorations de performance) sont notifiées **48 heures avant déploiement** par email. Le déploiement est effectué pendant la fenêtre de maintenance (weekend, 02h00–06h00 UTC), via rolling update garantissant la continuité de service. Les release notes correspondantes sont transmises avec la notification.

### 10.3 Mises à Jour Majeures

Les mises à jour majeures (versions x.y.0 ou x.0.0, incluant potentiellement des breaking changes) sont notifiées **2 semaines avant le déploiement prévu** par email, accompagnées :
- Des release notes complètes ;
- Du guide de migration si des breaking changes sont inclus ;
- D'une offre de double-run (coexistence ancienne/nouvelle version pendant une durée négociée) en cas de breaking changes sur l'API tRPC.

Le Client dispose d'un délai de **5 jours ouvrés** pour formuler des objections motivées. En cas d'objection, les parties conviennent d'un calendrier de déploiement alternatif.

### 10.4 Mises à Jour des Listes de Sanctions

La mise à jour des listes de sanctions (OFAC, UE, ONU, UK FCDO, PEP/OpenSanctions, BAM/ANRF) est effectuée automatiquement chaque nuit avant 04h00 UTC, **sans interruption de service** grâce au mécanisme de mise en cache Redis. Le Client n'est pas notifié des mises à jour de listes de sanctions sauf si une liste majeure est ajoutée, supprimée ou substantiellement modifiée dans sa structure.

### 10.5 Communication des Fenêtres de Maintenance

Toute maintenance planifiée est communiquée par email au(x) destinataire(s) désigné(s) avec les informations suivantes : date et plage horaire prévue, nature des travaux, impact attendu sur le service (interruption courte, dégradation partielle, ou aucun impact), et procédure de contact d'urgence si le délai de maintenance est dépassé.

---

## 11. Sécurité et Conformité

### 11.1 Engagements de Sécurité de l'Éditeur

L'Éditeur s'engage à maintenir les standards de sécurité suivants pour la durée du Contrat :
- **Chiffrement en transit** : TLS 1.2 minimum, TLS 1.3 activé par défaut, certificats Let's Encrypt renouvelés automatiquement.
- **Chiffrement au repos** : Données PII chiffrées en AES-256-GCM, mots de passe hachés en bcrypt (cost factor 10).
- **Authentification** : JWT HS256 + TOTP MFA disponible, rotation des tokens à chaque usage.
- **Journalisation** : Audit trail complet de chaque action utilisateur, logs centralisés via Loki, rétention 90 jours.
- **Tests de sécurité** : Test d'intrusion annuel par un prestataire certifié PASSI. Rapport de synthèse transmis au Client sur demande.

### 11.2 Conformité Réglementaire

La Plateforme est conçue pour faciliter la conformité réglementaire du Client au regard des directives AMLD5/AMLD6, des recommandations GAFI et, pour les implantations MENA, des circulaires BAM et standards MENAFATF. L'Éditeur s'engage à maintenir la Plateforme en conformité avec les évolutions réglementaires dans les délais raisonnables suivant leur publication officielle.

---

## 12. Limitations de Responsabilité

### 12.1 Plafond de Responsabilité

La responsabilité totale de l'Éditeur au titre du présent SLA, pour toute cause confondue sur une période de 12 mois glissants, est plafonnée à **100% des redevances annuelles HT** effectivement versées par le Client pendant la période concernée.

### 12.2 Exclusions de Responsabilité

L'Éditeur ne saurait être tenu responsable :
- Des pertes financières indirectes, pertes d'exploitation, manque à gagner ou préjudice d'image du Client résultant d'une indisponibilité de la Plateforme, dans les limites autorisées par le droit applicable ;
- Des amendes ou sanctions réglementaires infligées au Client par les autorités de supervision, sauf dans le cas où la défaillance de la Plateforme serait la cause directe et exclusive du manquement réglementaire constaté ;
- Des décisions métier prises par le Client sur la base des scores, alertes ou rapports générés par la Plateforme.

---

## 13. Révision et Amendement du SLA

### 13.1 Révision Annuelle

Le présent SLA est révisable annuellement à l'initiative de l'une ou l'autre des parties. La révision est effectuée d'un commun accord, formalisée par avenant signé, et entre en vigueur à la date anniversaire du Contrat Principal.

### 13.2 Révision à l'Initiative de l'Éditeur

L'Éditeur peut proposer une révision du SLA, notamment pour tenir compte :
- D'évolutions technologiques significatives de la Plateforme ;
- D'évolutions du contexte réglementaire (nouvelles directives AMLD, mise à jour des recommandations GAFI) ;
- De modifications substantielles des conditions d'hébergement ou d'infrastructure.

Toute modification proposée par l'Éditeur est notifiée au Client avec un préavis de **30 jours calendaires** avant l'entrée en vigueur. Le Client peut accepter, refuser ou proposer des contre-propositions dans ce délai. En cas de désaccord persistant, les conditions du SLA précédent continuent de s'appliquer jusqu'à résolution amiable ou résiliation du Contrat Principal selon ses conditions.

### 13.3 Révision à l'Initiative du Client

Le Client peut demander une révision du SLA à tout moment en adressant une demande formelle à l'Éditeur. L'Éditeur dispose de 15 jours ouvrés pour accuser réception et 30 jours ouvrés pour fournir une proposition de réponse.

---

## 14. Droit Applicable et Juridiction

Le présent SLA est régi par le droit français. En cas de litige relatif à l'interprétation ou à l'exécution du présent SLA, les parties s'engagent à rechercher une solution amiable dans un délai de 30 jours. À défaut, le litige sera porté devant les juridictions compétentes de Paris, auxquelles les parties attribuent compétence exclusive.

---

## Annexe A — Coordonnées de Contact

| Type de contact | Coordonnées |
|---|---|
| Support standard (P2/P3) | support@[éditeur].com — Lun-Ven 09h-18h CET |
| Astreinte (P0/P1) | Numéro fourni dans le Kit de démarrage |
| Portail ticketing | support.[éditeur].com |
| Page de statut | status.[éditeur].com |
| Escalade direction | direction.technique@[éditeur].com |

---

## Annexe B — Historique des Révisions du Document

| Version | Date | Auteur | Modifications |
|---|---|---|---|
| 1.0 | Janvier 2024 | Éditeur | Création initiale — SLA v1.x |
| 1.1 | Juillet 2024 | Éditeur | Ajout métriques PDF et TRACFIN |
| 2.0 | Janvier 2025 | Éditeur | Mise à jour tRPC, ajout ML scoring |
| 2.3 | Octobre 2025 | Éditeur | Ajout métriques MENA, BAM |
| 2.5 | Avril 2026 | Éditeur | Refonte complète, ajout pKYC, CI/CD, i18n |

---

*Document SLA-KYC-AML-v2.5 — Confidentiel — Propriété de l'Éditeur — Reproduction interdite sans autorisation*
*Date de dernière mise à jour : Avril 2026*
