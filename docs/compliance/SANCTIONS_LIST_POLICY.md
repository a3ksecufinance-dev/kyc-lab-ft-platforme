# Politique de Gestion des Listes de Sanctions et PEP
## KYC-AML Platform v2.5

**Version : 2.5 — Janvier 2026 | Classification : Confidentiel — Usage interne**
**Propriétaire : Équipe Conformité | Approbateur : Compliance Officer**
**Prochaine révision : Janvier 2027**

---

## 1. OBJET ET PÉRIMÈTRE

### 1.1 Objet

La présente politique définit les règles et procédures applicables à la gestion des listes de sanctions financières internationales et des listes de Personnes Politiquement Exposées (PEP) au sein de la plateforme KYC-AML Platform v2.5.

Elle couvre notamment :
- Les sources officielles de données utilisées pour le screening ;
- Les procédures de mise à jour automatique et manuelle des listes ;
- L'algorithme de matching utilisé pour la comparaison des noms ;
- Les seuils de correspondance et leur justification réglementaire ;
- Les workflows de traitement en cas de correspondance positive (match) ;
- Les procédures de gel d'avoirs ;
- La conservation des résultats de screening.

### 1.2 Périmètre réglementaire

La présente politique s'inscrit dans le cadre des obligations suivantes :

| Référentiel | Disposition | Obligation |
|-------------|------------|-----------|
| **FATF — Recommandation 6** | Sanctions financières ciblées (FT/prolifération) | Mise en oeuvre des résolutions du CSNU ; Gel immédiat des avoirs |
| **FATF — Recommandation 7** | Sanctions financières ciblées (prolifération) | Screening des armes de destruction massive |
| **FATF — Recommandation 12** | Personnes Politiquement Exposées | Mesures de vigilance renforcée pour les PEP |
| **FATF — Recommandation 38** | Gel et confiscation | Coopération internationale pour le gel d'avoirs |
| **AMLD6 — Art.12** | PEP (Directive UE) | Identification PEP, surveillance renforcée |
| **AMLD6 — Art.43** | Non-divulgation | Interdiction de tipping-off |
| **AMLD6 — Art.47** | Gel d'avoirs | Mise en oeuvre effective du gel |
| **Règlement UE 2580/2001** | Sanctions UE (terrorisme) | Application des listes FSF UE |
| **BAM Circ. 5/W/2023** | Screening liste ANRF | Obligation de screening contre liste nationale marocaine |

### 1.3 Destinataires

La présente politique s'adresse à :
- L'équipe de développement et d'exploitation de la plateforme (implémentation technique) ;
- Les Compliance Officers et analystes LAB/FT utilisant la plateforme ;
- Les équipes d'audit interne et externe ;
- Les institutions financières clientes de la plateforme (référence dans leur propre documentation de conformité).

---

## 2. SOURCES OFFICIELLES UTILISÉES

### 2.1 Vue d'ensemble

La plateforme KYC-AML Platform v2.5 intègre **6 sources officielles** de listes de sanctions et PEP, sélectionnées pour leur couverture géographique, leur fiabilité et leur statut réglementaire.

### 2.2 Tableau des sources

| # | Source | Organisme émetteur | URL officielle | Type d'entités couvertes | Volume estimé (entrées uniques) | Fréquence de mise à jour | Format technique |
|---|--------|-------------------|---------------|--------------------------|--------------------------------|------------------------|----------------|
| 1 | **OFAC SDN** (Specially Designated Nationals and Blocked Persons List) | US Department of the Treasury — Office of Foreign Assets Control | https://ofac.treasury.gov/sanctions-list-service | Individus, entités, navires et avions sanctionnés par les États-Unis ; programmes SDGT, SDNTK, IRAN, RUSSIA, etc. | ~17 000 entrées | Quotidienne (mise à jour immédiate après désignation) | XML / CSV / JSON via API OFAC |
| 2 | **EU FSF** (Financial Sanctions Files) | Commission européenne — Direction générale des Affaires financières | https://webgate.ec.europa.eu/fsd/fsf | Individus et entités sanctionnés dans le cadre des politiques étrangères et de sécurité de l'UE ; mesures restrictives UE | ~4 500 entrées | Hebdomadaire (et dès publication au Journal Officiel UE) | XML (format EU) |
| 3 | **UN SC** (United Nations Security Council Consolidated List) | Nations Unies — Comité du Conseil de Sécurité | https://scsanctions.un.org | Individus et entités sanctionnés par les résolutions du Conseil de Sécurité de l'ONU (Al-Qaida, Daech, Talibans, Corée du Nord, etc.) | ~750 entrées | Hebdomadaire (et dès modification) | XML (format CSNU) |
| 4 | **UK FCDO** (Foreign Commonwealth and Development Office Sanctions List) | Gouvernement du Royaume-Uni | https://www.gov.uk/government/publications/the-uk-sanctions-list | Individus et entités sanctionnés par le Royaume-Uni post-Brexit ; programmes OFSI (Russia, Belarus, Iran, Myanmar, etc.) | ~3 000 entrées | Hebdomadaire (consolidée hebdomadaire + mise à jour immédiate pour nouvelles désignations) | CSV / XML via API OFSI |
| 5 | **OpenSanctions PEP** | OpenSanctions.org (base de données open source) | https://data.opensanctions.org | PEP mondiaux : chefs d'État, membres de gouvernements, parlementaires, dirigeants de partis politiques, hauts fonctionnaires, juges, généraux et leurs proches et associés connus | ~1 700 000 entrées (PEP + sanctions croisées) | Hebdomadaire | JSON Lines via API REST OpenSanctions |
| 6 | **BAM/ANRF** (Liste nationale marocaine) | Banque Al-Maghrib / Autorité Nationale du Renseignement Financier | Sur agrément institutionnel (accès restreint) | Individus et entités désignés dans le cadre de la réglementation marocaine LAB/FT ; liste nationale de gel d'avoirs | Variable (diffusion officielle) | Selon diffusion officielle BAM/ANRF | Format officiel BAM |

### 2.3 Justification du choix des sources

Le choix de ces 6 sources répond aux exigences réglementaires suivantes :
- **OFAC SDN** : Obligatoire pour toutes les institutions ayant des relations avec des contreparties américaines ou des transactions en USD ;
- **EU FSF** : Obligatoire pour les institutions établies dans l'UE ou ayant des relations avec des contreparties européennes ;
- **UN SC** : Obligatoire pour toutes les institutions — résolutions CSNU d'application universelle ;
- **UK FCDO** : Recommandé post-Brexit pour les institutions ayant des relations avec le Royaume-Uni ;
- **OpenSanctions PEP** : Source de référence pour l'identification des PEP, couvrant 1,7M+ entités dans 200+ pays, conformément à FATF R.12 et AMLD6 Art.12 ;
- **BAM/ANRF** : Obligatoire pour les institutions assujetties à la réglementation marocaine (Loi 43-05, Circ. BAM 5/W/2023).

---

## 3. PROCÉDURE DE MISE À JOUR AUTOMATIQUE

### 3.1 Architecture technique de mise à jour

La mise à jour des listes de sanctions est entièrement automatisée via un processus cron planifié.

**Variable d'environnement** : `SCREENING_UPDATE_CRON=0 2 * * *`

**Fréquence** : Quotidienne, déclenchement à 02h00 UTC (heure creuse pour minimiser l'impact sur les performances).

### 3.2 Séquence de mise à jour

```
02:00 UTC — Déclenchement du cron SCREENING_UPDATE_CRON
    │
    ├── 1. Téléchargement des listes depuis les sources officielles
    │       ├── OFAC SDN API (via https://ofac.treasury.gov/sanctions-list-service)
    │       ├── EU FSF XML (via webgate.ec.europa.eu)
    │       ├── UN SC XML (via scsanctions.un.org)
    │       ├── UK FCDO CSV (via gov.uk API)
    │       ├── OpenSanctions PEP JSON Lines (via data.opensanctions.org)
    │       └── BAM/ANRF (via flux sécurisé institutionnel)
    │
    ├── 2. Validation de l'intégrité des données téléchargées
    │       ├── Vérification des checksums si disponibles
    │       ├── Validation du format (parsing sans erreur)
    │       ├── Vérification du volume minimum (alerte si volume < 80% du volume précédent)
    │       └── Horodatage UTC de la version
    │
    ├── 3. Normalisation et indexation
    │       ├── Normalisation des noms (suppression des accents, minuscules, translittération)
    │       ├── Déduplication des entrées identiques inter-sources
    │       ├── Indexation pour recherche fuzzy (index inversé + tokens)
    │       └── Calcul des empreintes numériques (fingerprints) pour chaque entrée
    │
    ├── 4. Mise en cache Redis
    │       ├── Stockage des listes normalisées dans Redis avec TTL = 23 heures
    │       ├── (Le TTL de 23h garantit une mise à jour quotidienne avant expiration)
    │       └── Mise à jour du timestamp de dernière mise à jour (SCREENING_LAST_UPDATE)
    │
    └── 5. Notification du résultat
            ├── Succès : Log de succès + statistiques (volumes par source)
            ├── Avertissement : Si une source indisponible mais fallback réussi
            └── Échec : Alerte Compliance Officer (email + notification plateforme)
```

### 3.3 Gestion du cache et fraîcheur des données

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| `SCREENING_UPDATE_CRON` | `0 2 * * *` | Planification cron (quotidien à 02h00 UTC) |
| `REDIS_SCREENING_TTL` | 23 heures | Durée de vie du cache Redis pour les listes |
| `SCREENING_STALE_THRESHOLD_HOURS` | 36 heures | Seuil de déclenchement de l'alerte "liste périmée" |
| `SCREENING_MIN_VOLUME_THRESHOLD` | 80% | Volume minimum acceptable par rapport à la version précédente |

**Justification du TTL de 23h** : Le TTL Redis est fixé à 23 heures (inférieur au délai de 24h entre les mises à jour cron) pour garantir qu'aucune requête de screening ne sera servie à partir d'un cache expiré si la mise à jour cron est légèrement retardée.

### 3.4 Surveillance de la fraîcheur

À chaque screening effectué, la plateforme vérifie l'horodatage de la dernière mise à jour des listes :
- Si `(now - SCREENING_LAST_UPDATE) > SCREENING_STALE_THRESHOLD_HOURS` (36h) : Alerte automatique envoyée au Compliance Officer désigné de l'organisation
- L'alerte est renouvelée toutes les 6 heures jusqu'à résolution
- Le résultat du screening est annoté d'un avertissement "Liste potentiellement périmée" dans l'audit trail

---

## 4. PROCÉDURE EN CAS D'INDISPONIBILITÉ D'UNE SOURCE

### 4.1 Niveaux de fallback

En cas d'indisponibilité d'une ou plusieurs sources lors de la mise à jour cron, la plateforme applique la cascade de fallback suivante :

```
Niveau 1 — Cache Redis valide (TTL < 36h)
    ├── Si toutes les sources indisponibles : Utilisation du cache Redis existant
    ├── Screening normal possible
    └── Annotation du résultat : "Screening sur liste du [date dernière mise à jour]"

Niveau 2 — Source de secours OpenSanctions (miroirs)
    ├── OpenSanctions maintient des miroirs géographiques
    ├── Tentative de téléchargement depuis les miroirs alternatifs
    └── Si succès : Mise à jour partielle réussie

Niveau 3 — Alerte "Stale" déclenchée (> SCREENING_STALE_THRESHOLD_HOURS)
    ├── Notification automatique au Compliance Officer
    ├── Email d'alerte avec détail des sources indisponibles
    └── Annotation obligatoire des résultats de screening "Données potentiellement périmées"

Niveau 4 — Procédure manuelle
    ├── Notification au responsable technique (DSI du Client)
    ├── Téléchargement manuel des listes depuis les sources officielles
    ├── Import manuel via l'interface d'administration
    └── Si indisponibilité > 72h : Escalade à la Direction Conformité
```

### 4.2 Politique de service dégradé

En cas d'indisponibilité prolongée des listes (> 36h) :
- Les screenings peuvent être réalisés sur la base du dernier cache valide, avec annotation obligatoire dans les résultats ;
- Toute transaction à risque élevé impliquant une nouvelle contrepartie (non précédemment screenée) doit faire l'objet d'une validation manuelle par un superviseur avant exécution ;
- Le Compliance Officer est informé de l'état dégradé et valide la poursuite des opérations ou l'activation de mesures compensatoires.

---

## 5. ALGORITHME DE MATCHING FUZZY

### 5.1 Problématique

L'identification des correspondances entre les noms soumis au screening et les entrées des listes de sanctions présente plusieurs difficultés :
- Variations orthographiques (Mahomet / Mohamed / Muhammad / Muhhammed) ;
- Translittérations multiples depuis l'arabe, le russe, le perse, le chinois ;
- Noms composés, noms d'usage, pseudonymes ;
- Erreurs de saisie dans les systèmes sources ;
- Noms partiels (prénom seulement, nom de famille seulement).

### 5.2 Méthode de matching

L'algorithme de matching est basé sur une combinaison de deux métriques :

**A. Distance de Levenshtein (edit distance)**
- Mesure le nombre minimal d'opérations élémentaires (insertion, suppression, substitution d'un caractère) pour transformer une chaîne en une autre.
- Utilisée pour la correspondance de noms simples et la détection d'erreurs typographiques.
- Normalisée par la longueur maximale des deux chaînes (similarité = 1 - distance / max_longueur).

**B. Token Set Ratio (FuzzyWuzzy/RapidFuzz)**
- Tokenisation des noms en mots individuels, puis comparaison ensembliste des tokens après normalisation.
- Particulièrement efficace pour les noms composés dans un ordre différent (ex : "Jean-Pierre Martin" vs "Martin, Jean Pierre").
- Score calculé comme le maximum de : ratio simple, partial_ratio, token_sort_ratio, token_set_ratio.

**C. Score composite**
Le score final est la moyenne pondérée des deux métriques :
```
score_final = (0.4 × levenshtein_normalized + 0.6 × token_set_ratio) × 100
```

### 5.3 Étapes de normalisation

Avant l'application de l'algorithme, les noms sont normalisés selon les étapes suivantes :

| Étape | Transformation | Exemple |
|-------|---------------|---------|
| 1. Minuscules | Conversion en minuscules | "AHMED Al-RASHID" → "ahmed al-rashid" |
| 2. Suppression des accents | Décomposition Unicode + suppression des diacritiques | "Müller" → "muller", "Héritier" → "heritier" |
| 3. Suppression de la ponctuation | Suppression des tirets, apostrophes, points | "al-rashid" → "al rashid", "O'Brien" → "obrien" |
| 4. Normalisation des espaces | Suppression des espaces multiples et des espaces de début/fin | "ahmed  al  rashid" → "ahmed al rashid" |
| 5. Translittération cyrillique | Translittération des caractères cyrilliques vers l'alphabet latin (norme ISO 9) | "Путин" → "Putin" |
| 6. Translittération arabe | Translittération des caractères arabes vers l'alphabet latin (norme ALA-LC) | "محمد" → "muhammad" |
| 7. Expansion des alias | Inclusion des formes alternatives connues (via dictionnaire d'alias) | "Mohamed" → ["Muhammad", "Mohammed", "Muhamad", ...] |
| 8. Suppression des particules | Suppression optionnelle des particules nobiliaires/de liaison peu discriminantes | "van der", "de la", "al-", "ben" |

### 5.4 Champs comparés

Le matching est effectué sur les champs suivants, avec pondération décroissante :

| Champ | Pondération | Champs listes |
|-------|------------|--------------|
| Nom complet (nom + prénom) | 40% | whole_name, full_name |
| Nom de famille seul | 30% | last_name, family_name |
| Prénom seul | 20% | first_name, given_name |
| Alias / noms alternatifs | 10% | aka, alias |

Si la date de naissance est disponible dans les deux sources, une correspondance exacte sur la date de naissance augmente le score composite de **15 points** (boosting).

Si le pays de nationalité est disponible et correspond, le score est augmenté de **5 points** (boosting mineur).

---

## 6. SEUILS DE MATCHING ET JUSTIFICATION RÉGLEMENTAIRE

### 6.1 Tableau des seuils

| Niveau | Seuil de score | Dénomination | Action automatique | Délai de traitement |
|--------|--------------|-------------|-------------------|-------------------|
| **MATCH** | ≥ 80% | Correspondance forte | **Gel préventif immédiat** + Alerte P0 au Compliance Officer + Blocage de la transaction | Traitement analyste < 2h |
| **REVIEW** | 50% — 79% | Correspondance probable | Alerte P1 à l'analyste + Mise en file de révision + Transaction en attente | Révision obligatoire < 24h |
| **CLEAR** | < 50% | Pas de correspondance | Transaction autorisée + Log du screening | Aucune action requise |

### 6.2 Justification réglementaire des seuils

**Seuil MATCH à 80%** : Ce seuil a été calibré pour équilibrer :
- **Sensibilité** : Capturer les correspondances positives y compris avec des variations orthographiques courantes ;
- **Spécificité** : Éviter un taux de faux positifs excessivement élevé qui rendrait le système inopérant ;
- **Cohérence avec les pratiques de marché** : La majorité des systèmes de screening professionnels utilisent un seuil de 75% à 85%.

Le gel préventif au seuil MATCH est conforme à la FATF Recommandation 6 (gel "without delay") et à l'article 47 d'AMLD6.

**Seuil REVIEW à 50%** : Ce seuil permet de capturer des correspondances moins évidentes tout en imposant une revue humaine. Les faux positifs dans cette tranche sont élevés et attendus.

**Personnalisation** : Les seuils sont configurables par organisation cliente via la console d'administration, dans les limites suivantes : MATCH entre 70% et 95%, REVIEW entre 40% et 79%. Des seuils trop bas (< 50% pour MATCH) ne sont pas autorisés car contraires aux bonnes pratiques réglementaires.

### 6.3 Performance attendue

Sur la base des tests de régression réalisés avec les entités de test (Section 9) :

| Métrique | Valeur cible |
|----------|-------------|
| Taux de détection des véritables positifs (recall) | > 95% |
| Taux de faux positifs sur transactions réelles | 2% — 8% (selon configuration) |
| Temps de traitement moyen d'un screening | < 100ms |
| Couverture des translittérations cyrilliques | > 90% |
| Couverture des translittérations arabes | > 85% |

---

## 7. PROCÉDURE DE GESTION D'UN MATCH POSITIF

### 7.1 Workflow de traitement — Schéma

```
Screening déclenché
    │
    ├── Score < 50% ──────────────────────────────────────────────────► CLEAR — Transaction autorisée
    │
    ├── Score 50-79% ──────► File de révision (REVIEW_QUEUE)
    │                              │
    │                              ├── Analyste notifié (< 15 min)
    │                              ├── Délai de révision : 24h maximum
    │                              ├── Analyste confirme : ──────────► Cas traité comme MATCH (voir ci-dessous)
    │                              └── Analyste infirme : ───────────► Marqué FALSE_POSITIVE + Transaction autorisée
    │
    └── Score ≥ 80% ────────► GEL PRÉVENTIF IMMÉDIAT
                                   │
                                   ├── Status client/transaction = FROZEN
                                   ├── Notification Compliance Officer (< 5 min)
                                   ├── Délai de confirmation analyste : < 2h
                                   │
                                   ├── Analyste CONFIRME le match :
                                   │       ├── Gel définitif maintenu
                                   │       ├── Ouverture d'un dossier d'investigation (Case)
                                   │       ├── Préparation de la déclaration de soupçon (DS/SAR)
                                   │       ├── Notification à l'autorité compétente (TRACFIN / UTRF / ANRF)
                                   │       └── Conservation de l'audit trail complet
                                   │
                                   └── Analyste INFIRME le match :
                                           ├── Dégel du client/transaction
                                           ├── Marquage FALSE_POSITIVE avec justification obligatoire
                                           ├── Transaction traitée
                                           └── Feedback intégré pour amélioration de l'algorithme
```

### 7.2 Détail des actions par phase

**Phase 1 — Détection automatique**
- Le scoring de matching est calculé en temps réel à chaque onboarding client et à chaque transaction
- Les correspondances MATCH et REVIEW sont enregistrées dans la table `screening_results` avec l'horodatage UTC, le score, la source, l'entrée de liste correspondante et le contexte de la transaction

**Phase 2 — Notification**
- Les alertes P0 (MATCH) déclenchent une notification immédiate : email au Compliance Officer + notification in-app + (optionnel) SMS
- Les alertes P1 (REVIEW) sont visibles dans la file de révision du dashboard ; notification email envoyée à l'analyste assigné

**Phase 3 — Révision humaine**
- L'analyste accède au dossier complet : profil client, historique transactionnel, source de la correspondance, entrée de liste détaillée
- L'analyste dispose de 2h (MATCH) ou 24h (REVIEW) pour statuer
- La décision est documentée avec justification obligatoire et tracée dans l'audit trail

**Phase 4 — Post-décision**
- En cas de confirmation : le gel est maintenu, un dossier Case est ouvert, la DS est préparée
- En cas d'infirmation (faux positif) : le gel est levé, la transaction est libérée, le faux positif est enregistré pour analyse statistique

---

## 8. GEL D'AVOIRS (ASSET FREEZE)

### 8.1 Base légale

| Instrument | Disposition | Obligation |
|-----------|-------------|-----------|
| **FATF Recommandation 38** | Gel des fonds liés au BC/FT | Mise en oeuvre sans délai ("without delay") des mesures de gel |
| **FATF Recommandation 6** | Sanctions financières ciblées (FT) | Gel immédiat des fonds des personnes désignées CSNU |
| **AMLD6 Art.47** | Gel d'avoirs | Mesures nationales de gel et de confiscation |
| **Règlement UE 2580/2001** | Sanctions terrorisme | Gel des fonds pour les listes FSF UE |

### 8.2 Implémentation technique

Le gel d'avoirs est implémenté au niveau du statut du client dans la base de données :

| Champ | Type | Description |
|-------|------|-------------|
| `customer_status` | ENUM | Valeurs : ACTIVE, INACTIVE, FROZEN, UNDER_REVIEW |
| `frozen_at` | TIMESTAMP UTC | Date et heure exactes du gel (pour justification "without delay") |
| `frozen_reason` | TEXT | Motif du gel (source de la correspondance, entrée de liste, score) |
| `frozen_by` | UUID | Identifiant de l'utilisateur ayant confirmé le gel (ou "SYSTEM" pour gel automatique) |
| `frozen_source` | ENUM | Source ayant déclenché le gel (OFAC_SDN, EU_FSF, UN_SC, UK_FCDO, OPENSANCTIONS, BAM_ANRF) |
| `unfreeze_at` | TIMESTAMP UTC | Date et heure du dégel (si faux positif confirmé) |
| `unfreeze_by` | UUID | Identifiant de l'utilisateur ayant autorisé le dégel |
| `unfreeze_justification` | TEXT | Justification documentée du dégel (obligatoire) |

### 8.3 Effets du gel

Lorsqu'un client est en statut FROZEN :
- **Toutes les transactions** associées à ce client sont automatiquement bloquées ;
- **Aucune nouvelle relation d'affaires** ne peut être initiée ;
- Les transactions en attente de traitement sont suspendues ;
- Une alerte est affichée dans l'interface pour tout utilisateur accédant au profil client ;
- Un log d'audit est généré pour chaque tentative d'action sur le compte gelé.

### 8.4 Non-divulgation (tipping-off)

Conformément à l'article 43 d'AMLD6 et à FATF R.21, la mise en oeuvre du gel d'avoirs NE DOIT PAS être notifiée à la personne concernée ou à des tiers qui pourraient l'informer.

Mesures techniques de prévention du tipping-off :
- L'interface client (si applicable) ne révèle pas la raison du blocage mais affiche un message générique ;
- Les utilisateurs de la plateforme sont formés à l'obligation de non-divulgation (Module 5 du Plan de Formation) ;
- L'accès au motif de gel est restreint aux rôles ANALYST, SUPERVISOR et COMPLIANCE_OFFICER ;
- Les logs de consultation du motif de gel sont tracés dans l'audit trail.

### 8.5 Notification aux autorités

En cas de gel confirmé, la procédure de notification aux autorités compétentes est la suivante :

| Juridiction | Autorité | Canal de notification | Délai |
|-------------|----------|----------------------|-------|
| France | TRACFIN | Portail TRACFIN + DS XML | Dès que possible, selon procédure DS |
| Maroc | UTRF/ANRF | Déclaration GoAML | Dès que possible |
| UE (général) | Autorité nationale compétente | DS nationale | Selon procédure nationale |

---

## 9. ENTITÉS DE TEST DE LA QUALITÉ

### 9.1 Objectif

Pour garantir la qualité et la continuité du moteur de matching, un ensemble d'entités fictives de test est maintenu en permanence. Ces entités permettent de réaliser des **tests de régression automatisés** après chaque mise à jour de l'algorithme ou des listes.

### 9.2 Catégories d'entités de test

| Catégorie | Description | Nombre d'entités | Résultat attendu |
|-----------|-------------|-----------------|-----------------|
| **TP — Vrais positifs évidents** | Noms exacts correspondant à des entrées de la liste de référence de test | 20 | MATCH (score ≥ 80%) |
| **TP — Vrais positifs avec variations** | Noms avec variations orthographiques (translittérations, accents, ordre différent) | 30 | MATCH ou REVIEW selon variation |
| **FP — Faux positifs homonymes** | Noms courants pouvant générer des faux positifs (ex : "Mohamed Ali") | 15 | CLEAR (score < 50%) ou REVIEW avec infirmation |
| **TN — Vrais négatifs** | Noms sans aucune correspondance dans les listes de test | 20 | CLEAR |
| **Translittérations cyrilliques** | Noms cyrilliques et leurs translittérations latines | 10 | MATCH entre les formes équivalentes |
| **Translittérations arabes** | Noms arabes et leurs translittérations latines | 10 | MATCH entre les formes équivalentes |

### 9.3 Critères de validation

À l'issue de chaque test de régression :
- Le taux de détection (recall) des vrais positifs doit être ≥ **95%** ;
- Le taux de faux positifs doit être ≤ **15%** sur les entités de test FP ;
- Toutes les translittérations doivent atteindre un score MATCH (≥ 80%) ;
- Le temps de traitement moyen doit rester < **100ms** par entité.

En cas d'échec de ces critères, la mise à jour de l'algorithme ou de la liste est bloquée et une investigation est déclenchée.

---

## 10. CONSERVATION DES RÉSULTATS DE SCREENING

### 10.1 Obligations légales

| Référentiel | Obligation | Durée minimale |
|-------------|-----------|----------------|
| AMLD6 Art.40 | Conservation des résultats de CDD incluant le screening | 5 ans post-fin de relation |
| FATF R.11 | Conservation des résultats des mesures de vigilance | 5 ans |
| BAM Circ. 5/W/2023 | Conservation des données de screening | 5 ans (voire 10 ans pour les dossiers d'investigation liés) |

### 10.2 Données conservées

Pour chaque screening effectué, les données suivantes sont conservées dans l'audit trail :

| Champ | Description |
|-------|-------------|
| `screening_id` | Identifiant unique du screening (UUID) |
| `timestamp` | Horodatage UTC du screening |
| `customer_id` | Identifiant du client screenné (pseudonymisé si effacement PII) |
| `screened_name` | Nom soumis au screening (pseudonymisé si effacement PII) |
| `source` | Source de la liste utilisée |
| `list_version_date` | Date de version de la liste utilisée |
| `score` | Score de correspondance |
| `decision` | MATCH / REVIEW / CLEAR |
| `matched_entry` | Entrée de liste correspondante (si applicable) |
| `analyst_decision` | Confirmation / Infirmation par l'analyste (si applicable) |
| `analyst_id` | Identifiant de l'analyste (si décision manuelle) |
| `analyst_justification` | Justification de la décision (si applicable) |
| `context` | Contexte du screening (ONBOARDING / TRANSACTION / PERIODIC_REVIEW) |

### 10.3 Durée de conservation

- **Conservation active** : 2 ans (accès direct en base de données) ;
- **Archivage** : 3 ans supplémentaires en archive froide chiffrée ;
- **Durée totale** : **5 ans minimum** à compter de la date du screening ;
- Pour les screenings ayant abouti à un MATCH confirmé : **10 ans** (alignement avec les dossiers d'investigation associés).

### 10.4 Accès aux résultats archivés

Les résultats archivés peuvent être consultés sur demande de l'autorité compétente ou dans le cadre d'un audit interne. La consultation est tracée dans l'audit trail.

---

## 11. RÉVISION ANNUELLE DE LA POLITIQUE

### 11.1 Calendrier de révision

La présente politique est révisée selon le calendrier suivant :

| Occasion | Action |
|----------|--------|
| **Annuellement** (janvier) | Révision complète de la politique |
| **Lors d'une évolution réglementaire** (FATF, AMLD, BAM) | Révision partielle dans les 60 jours suivant la publication |
| **Lors d'un incident** (faux négatif avéré, indisponibilité prolongée) | Révision de la section concernée dans les 30 jours |
| **Lors d'une nouvelle version de la plateforme** | Mise à jour de la documentation technique |

### 11.2 Processus de révision

La révision de la politique suit le processus suivant :
1. Proposition de modifications par l'équipe conformité ou l'équipe technique ;
2. Validation par le Compliance Officer ;
3. Approbation par la Direction ;
4. Communication aux équipes concernées ;
5. Mise à jour du numéro de version et de la date.

### 11.3 Historique des versions

| Version | Date | Modifications principales |
|---------|------|--------------------------|
| 1.0 | Juillet 2024 | Création initiale |
| 2.0 | Janvier 2025 | Ajout source BAM/ANRF ; amélioration translittération arabe |
| 2.5 | Janvier 2026 | Révision seuils de matching ; ajout procédure tipping-off ; refonte Section 9 (entités de test) |

---

*Fin de la Politique de Gestion des Listes de Sanctions et PEP*

*Document interne Conformité — © [Éditeur KYC-AML Platform] — Version 2.5 — Janvier 2026*
*Propriétaire : Équipe Conformité | Approbateur : Compliance Officer | Prochaine révision : Janvier 2027*
