# WatchReg — Accord POC (Proof of Concept)
## Contrat de Pilote Gratuit — Modèle Standard
### Confidentiel — Mai 2026

---

## ACCORD D'ÉVALUATION TECHNIQUE (POC)

**Entre les soussignés :**

**WatchReg SaaS Platform** (ci-après "WatchReg")
Société [SARL / SA / SAS] au capital de [___] MAD
RC : [___] — ICE : [___]
Siège : [Adresse], Casablanca, Maroc
Représenté par : [Nom du fondateur], en qualité de Gérant / Directeur Général

**ET**

**[NOM DE L'ÉTABLISSEMENT]** (ci-après "le Client")
[Forme juridique] au capital de [___] MAD
RC : [___] — ICE : [___]
Siège : [Adresse complète]
Représenté par : [Nom], en qualité de [Titre]
Agréé par Bank Al-Maghrib sous le n° [___]

**Il a été convenu ce qui suit :**

---

## ARTICLE 1 — OBJET

Le présent accord a pour objet de définir les conditions dans lesquelles WatchReg
met à disposition du Client, à titre gratuit et sans engagement de poursuite,
la plateforme **WatchReg KYC-AML Platform v2.5** pour une période d'évaluation technique.

L'objectif du POC est de permettre au Client de :
1. Valider l'adéquation fonctionnelle avec ses besoins de conformité BAM
2. Tester l'intégration technique avec son Core Banking System
3. Évaluer l'ergonomie et la formation requise pour ses équipes
4. Établir un dossier de décision d'achat interne

---

## ARTICLE 2 — PÉRIMÈTRE TECHNIQUE

### 2.1 Modules mis à disposition

Pendant la durée du POC, le Client a accès aux modules suivants :

| Module | Accès POC | Limitation |
|--------|-----------|-----------|
| KYC Onboarding (Individuel + Corporate) | ✅ Complet | Max [500] clients |
| Scoring risque ML | ✅ Complet | — |
| pKYC périodique | ✅ Complet | — |
| UBO Management | ✅ Complet | — |
| Détection AML temps réel | ✅ Complet | Max [10 000] tx |
| Builder règles AML | ✅ Complet | — |
| Screening sanctions (5 listes) | ✅ Complet | — |
| Workflow alertes | ✅ Complet | — |
| Rapports SAR/STR | ✅ Complet | — |
| Dual Control 4-yeux | ✅ Complet | — |
| Audit Trail | ✅ Complet | — |
| Dashboard Direction | ✅ Complet | — |
| Export CSV | ✅ Complet | — |
| API / Webhook CBS | ✅ Complet | Env. de test |

### 2.2 Environnement

Le POC est déployé dans un environnement **dédié au Client** :

- URL : `https://[client].poc.watchreg.ma`
- Hébergement : Cloud sécurisé (Maroc / EU), isolation complète
- Base de données : Instance PostgreSQL dédiée, non partagée
- Données : Données de test uniquement — aucune donnée réelle de production

### 2.3 Comptes utilisateurs

WatchReg crée [5] comptes utilisateurs test couvrant les 4 rôles :

| Rôle | Nb comptes | Fonctions |
|------|-----------|-----------|
| Admin | 1 | Gestion utilisateurs, audit, configuration |
| Compliance Officer | 1 | SAR/STR, approbations, AMLD6 |
| Supervisor | 1 | Dossiers, dual control, escalade |
| Analyst | 2 | KYC, alertes, screening |

---

## ARTICLE 3 — DURÉE

Le POC débute à la date de signature du présent accord et prend fin :

- Après **[60] jours calendaires**, ou
- À la décision conjointe des parties de le clôturer avant terme, ou
- À la conversion en contrat commercial.

**Date de début (estimée) :** [DATE]
**Date de fin (estimée) :** [DATE + 60 JOURS]

---

## ARTICLE 4 — CONDITIONS FINANCIÈRES

### 4.1 Gratuité du POC

Le présent POC est fourni **à titre entièrement gratuit**.
Aucune facturation n'est émise pendant la durée du POC.

### 4.2 Frais d'intégration

WatchReg prend en charge les coûts de déploiement et de configuration initiale.

Si des développements spécifiques d'intégration CBS sont requis au-delà du scope standard
(webhook universel REST documenté), ceux-ci peuvent faire l'objet d'un devis séparé
soumis à l'accord préalable du Client.

### 4.3 Formation

WatchReg assure **[2] demi-journées de formation** incluses :
- Session 1 : Onboarding technique (DSI + IT)
- Session 2 : Formation métier (Compliance Officer + Analystes)

Des sessions supplémentaires peuvent être organisées sur demande.

---

## ARTICLE 5 — OBLIGATIONS DE WATCHREG

WatchReg s'engage à :

1. **Déployer** l'environnement POC sous [10] jours ouvrés à compter de la signature
2. **Former** les utilisateurs désignés selon l'Article 4.3
3. **Fournir** la documentation complète (user guide, guide admin, API docs)
4. **Assurer** un support dédié par email/téléphone ([HH:HH]–[HH:HH], du lundi au vendredi)
5. **Garantir** une disponibilité de l'environnement POC ≥ 99% hors maintenance planifiée
6. **Respecter** la confidentialité absolue des données du Client (voir Article 8)
7. **Produire** un rapport d'évaluation final à la fin du POC
8. **Notifier** le Client au moins [5] jours avant toute opération de maintenance

---

## ARTICLE 6 — OBLIGATIONS DU CLIENT

Le Client s'engage à :

1. **Désigner** un référent technique (IT/DSI) et un référent métier (Conformité) dès la signature
2. **Fournir** les spécifications techniques CBS sous [5] jours ouvrés
3. **Respecter** les restrictions d'usage définies à l'Article 7
4. **Participer** aux points d'étape hebdomadaires (30 min/semaine)
5. **Produire** un retour d'évaluation structuré à la fin du POC
6. **Ne pas** transmettre les accès ou la documentation à des tiers sans accord préalable
7. **Informer** WatchReg de tout incident ou anomalie dans les [24] heures

---

## ARTICLE 7 — RESTRICTIONS D'USAGE

### 7.1 Usage autorisé

Le Client est autorisé à :
- Utiliser la plateforme pour évaluation et test fonctionnel
- Saisir des données de test (fictives ou anonymisées)
- Former ses équipes internes
- Produire des captures d'écran pour usage interne
- Partager un rapport d'évaluation interne

### 7.2 Usage interdit

Le Client s'interdit de :
- Mettre en production des données clients réels sans contrat commercial signé
- Accéder à l'infrastructure technique sous-jacente (base de données, serveurs)
- Tenter de contourner les contrôles d'accès ou les limites du POC
- Effectuer des tests de charge ou de performance non autorisés
- Reproduire, copier ou décompiler les algorithmes ou le code de la plateforme
- Partager les accès avec des personnes extérieures à l'établissement

---

## ARTICLE 8 — CONFIDENTIALITÉ ET PROTECTION DES DONNÉES

### 8.1 Confidentialité mutuelle

Les deux parties s'engagent à :
- Ne pas divulguer à des tiers les informations confidentielles échangées
- Utiliser les informations confidentielles uniquement dans le cadre du POC
- Protéger les informations confidentielles avec le même niveau de soin
  qu'elles protègent leurs propres informations confidentielles

### 8.2 Données à caractère personnel

Si des données personnelles sont saisies dans la plateforme (données test) :
- WatchReg agit en qualité de **sous-traitant** au sens du RGPD / Loi 09-08 Maroc
- Le Client reste **responsable du traitement**
- WatchReg s'engage à supprimer toutes les données à la fin du POC
- Aucune donnée n'est transmise à des tiers

### 8.3 Propriété intellectuelle

- La plateforme WatchReg, son code, ses algorithmes et sa documentation restent la propriété exclusive de WatchReg
- Les configurations, règles AML et paramètres créés par le Client pendant le POC lui appartiennent
- À la fin du POC, WatchReg peut fournir un export de ces configurations au Client

### 8.4 Durée de l'obligation de confidentialité

L'obligation de confidentialité s'applique pendant toute la durée du POC
et pendant **3 ans** après son terme, quelle qu'en soit la cause.

---

## ARTICLE 9 — CRITÈRES D'ÉVALUATION

À l'issue du POC, WatchReg remet au Client un rapport d'évaluation couvrant :

### Critères fonctionnels (sur 100 points)

| Critère | Poids | Évaluation |
|--------|-------|-----------|
| Couverture BAM Circulaire 5/W/2023 | 25 | /25 |
| Qualité du moteur AML et des règles FATF | 20 | /20 |
| Workflow SAR/STR et suivi ANRF | 15 | /15 |
| Ergonomie et facilité d'usage | 15 | /15 |
| Intégration CBS (délai et complexité) | 15 | /15 |
| Qualité des rapports Direction | 10 | /10 |

### Critères techniques (sur 50 points)

| Critère | Poids | Évaluation |
|--------|-------|-----------|
| Performance (temps de réponse) | 15 | /15 |
| Sécurité et contrôle d'accès | 15 | /15 |
| Stabilité et disponibilité | 10 | /10 |
| Qualité de la documentation | 10 | /10 |

**Seuil de recommandation d'achat :** ≥ 120/150 points

---

## ARTICLE 10 — SUITE DU POC

### 10.1 Conversion en contrat commercial

Si le Client décide de poursuivre après le POC, WatchReg s'engage à :
- Déduire [100%] du coût du POC (si payant) du contrat annuel
- Migrer les configurations et données de test vers l'environnement de production
- Maintenir les accès sans interruption pendant la transition

### 10.2 Fin sans suite

Si le Client décide de ne pas poursuivre, WatchReg s'engage à :
- Supprimer toutes les données dans les [30] jours
- Fournir un export des configurations créées par le Client
- Ne pas relancer le Client sans son accord explicite

---

## ARTICLE 11 — LIMITATION DE RESPONSABILITÉ

Dans le cadre du POC, la responsabilité de WatchReg est limitée à la mise à disposition
de la plateforme en mode test. WatchReg ne peut être tenu responsable de :

- Tout dommage résultant d'une utilisation non conforme à l'Article 7
- Toute perte de données résultant d'une défaillance technique pendant le POC
- Tout manquement réglementaire du Client pendant la période POC

WatchReg ne garantit pas que la plateforme, dans sa configuration de test, satisfait
aux exigences de production de Bank Al-Maghrib. La validation réglementaire officielle
fait partie du processus de déploiement production.

---

## ARTICLE 12 — DROIT APPLICABLE ET LITIGES

Le présent accord est soumis au **droit marocain**.

En cas de litige, les parties s'engagent à rechercher une solution amiable.
À défaut, compétence est attribuée aux **Tribunaux de Commerce de Casablanca**.

---

## ARTICLE 13 — DISPOSITIONS DIVERSES

### 13.1 Intégralité

Le présent accord, avec ses annexes, constitue l'intégralité de l'accord entre les parties
concernant le POC. Il remplace tout accord oral ou écrit antérieur sur le même sujet.

### 13.2 Modifications

Toute modification doit faire l'objet d'un avenant signé par les deux parties.

### 13.3 Nullité partielle

Si une disposition du présent accord est déclarée nulle ou inapplicable,
les autres dispositions restent en vigueur.

---

## SIGNATURES

**Fait en deux exemplaires originaux à Casablanca, le [DATE]**

### Pour [NOM DE L'ÉTABLISSEMENT] :

| | |
|--|--|
| **Nom :** | ___________________________________ |
| **Titre :** | ___________________________________ |
| **Date :** | ___________________________________ |
| **Signature + Cachet :** | |

---

### Pour WatchReg :

| | |
|--|--|
| **Nom :** | ___________________________________ |
| **Titre :** | Fondateur & Directeur Général |
| **Date :** | ___________________________________ |
| **Signature :** | ___________________________________ |

---

## ANNEXES

### Annexe 1 — Contacts dédiés pendant le POC

| Partie | Nom | Fonction | Email | Téléphone |
|--------|-----|----------|-------|-----------|
| WatchReg — Technique | [___] | Ingénieur intégration | [___] | [___] |
| WatchReg — Métier | [___] | Consultant conformité | [___] | [___] |
| [Établissement] — Technique | [___] | Référent DSI | [___] | [___] |
| [Établissement] — Métier | [___] | Compliance Officer | [___] | [___] |

### Annexe 2 — Planning détaillé du POC

| Semaine | Activité | Livrable |
|---------|----------|---------|
| S1 | Déploiement + configuration CBS | Environnement opérationnel |
| S1-S2 | Formation utilisateurs | Rapport de formation |
| S2-S4 | Tests fonctionnels modules KYC + AML | Grille d'évaluation S1 |
| S4-S6 | Tests SAR/STR + Dual Control + Audit | Grille d'évaluation S2 |
| S7-S8 | Tests de charge (optionnel) + bilan | Rapport d'évaluation final |

### Annexe 3 — Critères techniques de l'intégration CBS

WatchReg fournit un webhook universel REST :
```
POST https://[client].poc.watchreg.ma/api/webhook/cbs
Authorization: Bearer {CBS_WEBHOOK_SECRET}
Content-Type: application/json

{
  "customerId": "string",
  "amount": number,
  "currency": "MAD",
  "type": "TRANSFER | DEPOSIT | WITHDRAWAL",
  "counterparty": "string",
  "counterpartyCountry": "ISO 3166-1 alpha-2",
  "reference": "string"
}
```

Réponse synchrone (< 200ms) :
```json
{
  "transactionId": "TXN-XXXXX",
  "riskScore": 0-100,
  "status": "NORMAL | FLAGGED | BLOCKED",
  "alertCreated": boolean
}
```

---

*Document confidentiel — WatchReg — Mai 2026*
*Modèle soumis à validation juridique avant utilisation commerciale*
