# WatchReg — Roadmap Produit
## Version publique (investisseurs & prospects)
### Mai 2026

---

## VISION PRODUIT

> Devenir l'infrastructure de conformité financière de référence
> pour les établissements financiers d'Afrique francophone et du MENA,
> en commençant par maîtriser complètement le marché marocain.

---

## CE QUI EXISTE — v2.5 (Production, Mai 2026)

### ✅ MODULE 1 — KYC & Gestion Clients

| Fonctionnalité | Détail | Maturité |
|---------------|--------|----------|
| Onboarding client | Individual + Corporate, avec tous les champs BAM | ✅ Prod |
| Scoring de risque ML | 15+ critères, calcul temps réel, historique | ✅ Prod |
| pKYC périodique | Score de dérive comportementale, revue déclenchée auto | ✅ Prod |
| Gestion UBO | Bénéficiaires effectifs, % participation, PEP flag | ✅ Prod |
| Documents KYC | Upload, OCR, vérification manuelle, statuts | ✅ Prod |
| Gel de compte | Superviseur requis, raison obligatoire, audit | ✅ Prod |
| Effacement RGPD | Demande + workflow d'approbation | ✅ Prod |
| Assignation analyste | Répartition de charge équipe | ✅ Prod |

### ✅ MODULE 2 — Détection AML Temps Réel

| Fonctionnalité | Détail | Maturité |
|---------------|--------|----------|
| Webhook CBS | Intégration universelle Core Banking < 200ms | ✅ Prod |
| Simulateur CBS | Interface test sans authentification | ✅ Prod |
| Moteur règles AML | 6 règles FATF configurables (seuil, pattern, vélocité) | ✅ Prod |
| Scoring transaction | 0–100, multi-critères, raison détaillée | ✅ Prod |
| Blocage automatique | Transaction BLOCKED si score critique | ✅ Prod |
| Création alerte auto | CRITICAL en < 200ms après détection | ✅ Prod |
| Builder règles visuel | Interface drag-and-drop conditions AND/OR | ✅ Prod |
| Simulateur règle | Test sur transaction fictive avant activation | ✅ Prod |

### ✅ MODULE 3 — Screening Sanctions

| Fonctionnalité | Détail | Maturité |
|---------------|--------|----------|
| Listes couvertes | OFAC SDN · EU Consolidated · UN · UK HMT · BAM | ✅ Prod |
| Fuzzy matching | Score de similarité 0–100% | ✅ Prod |
| Batch screening | Screening en masse de tous les clients | ✅ Prod |
| Workflow décision | PENDING → CONFIRMED / DISMISSED / ESCALATED | ✅ Prod |
| Santé des listes | Monitoring fraîcheur, alerte si > 36h | ✅ Prod |
| Liste personnalisée | Ajout d'entités surveillées custom | ✅ Prod |

### ✅ MODULE 4 — Alertes & Investigation

| Fonctionnalité | Détail | Maturité |
|---------------|--------|----------|
| Tableau alertes | KPI bar, filtres multi-critères, pagination | ✅ Prod |
| Modale détail alerte | Transaction liée, historique client, scoring | ✅ Prod |
| Workflow résolution | OPEN → IN_REVIEW → ESCALATED / FALSE_POSITIVE / CLOSED | ✅ Prod |
| Assignation | Auto ou manuelle, notif assigné | ✅ Prod |
| Notes de résolution | Texte libre, horodaté, audité | ✅ Prod |
| Dossiers investigation | Timeline, assignation, décision formelle | ✅ Prod |
| SLA monitoring | Alertes dépassant délai réglementaire 5j | ✅ Prod |

### ✅ MODULE 5 — Rapports SAR/STR & Déclarations

| Fonctionnalité | Détail | Maturité |
|---------------|--------|----------|
| SAR (Rapport d'activité suspecte) | Formulaire structuré ANRF | ✅ Prod |
| STR (Déclaration de soupçon) | Obligatoire > seuil BAM | ✅ Prod |
| Workflow statuts | DRAFT → REVIEW → SUBMITTED → APPROVED | ✅ Prod |
| Suivi ANRF | Référence + date dépôt + statut (ACCUSEE/CLASSEE) | ✅ Prod |
| Dual Control | 4-yeux — blocage technique auto-approbation | ✅ Prod |
| Export AMLD6 | KPIs réglementaires AMLD6 exportables CSV | ✅ Prod |
| Rapports BAM | Mensuel / Trimestriel / Annuel | ✅ Prod |

### ✅ MODULE 6 — Conformité & Gouvernance

| Fonctionnalité | Détail | Maturité |
|---------------|--------|----------|
| Dual Control (F6) | Principle des 4 yeux ACPR art.13 | ✅ Prod |
| Audit Trail | Toutes actions horodatées, IP, userId | ✅ Prod |
| Export CSV audit | Pour inspection BAM | ✅ Prod |
| Dashboard Direction | 8 KPIs conformité BAM/FATF + sélecteur année | ✅ Prod |
| Gestion utilisateurs | Rôles, invitations, désactivation | ✅ Prod |
| AMLD6 Page | KPIs 6ème directive, export CSV | ✅ Prod |

### ✅ MODULE 7 — Sécurité (Production-Grade)

| Fonctionnalité | Détail | Maturité |
|---------------|--------|----------|
| Chiffrement PII | AES-256-GCM — téléphone, DOB, adresse | ✅ Prod |
| JWT + JTI | Rotation cryptographique, anti-replay | ✅ Prod |
| Rate limiting | Global sur toutes les mutations API | ✅ Prod |
| CORS strict | Blocage wildcard en production | ✅ Prod |
| MFA TOTP | Optionnel, enforçable par admin | ✅ Prod |
| Contrôle d'accès | 4 rôles × 50+ permissions granulaires | ✅ Prod |
| Invitations sécurisées | Token unique, expiration 72h | ✅ Prod |

---

## CE QUI VIENT — BACKLOG PRIORISÉ

### 🔥 PRIORITÉ 1 — Q3 2026 (Juillet–Septembre)

#### F1 — Correspondent Banking Risk Module (FATF R.13)
**Pourquoi maintenant :** Exigence directe BAM pour banques internationales
- Profil risque banque correspondante (pays, tier, notation FATF)
- Assessment workflow (questionnaire + scoring)
- Enhanced Due Diligence automatique
- Rapport conformité FATF R.13 exportable
- **Impact commercial :** débloque les 8 banques à réseau international

#### F5 — CBS SDK TypeScript
**Pourquoi maintenant :** Accélère les intégrations → réduit le coût d'onboarding
- SDK typé pour les 3 Core Banking principaux au Maroc (Temenos, Oracle, custom)
- Documentation OpenAPI générée automatiquement
- Exemples d'intégration par type de CBS
- Webhooks bidirectionnels
- **Impact commercial :** réduit le temps d'intégration de 3 mois à 3 semaines

#### Améliorations UX identifiées
- DocumentsPage : suppression document + stats globales
- CustomerDetailPage : onglet pKYC — historique complet + run manuel
- AdminPage : vue détail utilisateur + contrôles ML avancés

---

### 📅 PRIORITÉ 2 — Q4 2026 (Octobre–Décembre)

#### Multi-tenant SaaS
- Isolation complète données par institution
- White-labeling (logo, couleurs)
- Sous-domaine dédié (banque.watchreg.ma)
- Admin portail centralisé
- **Impact :** passe de POC single-tenant à vente SaaS scalable

#### Intégration GoAML ANRF
- Export direct format XML GoAML v4
- Soumission automatique à l'ANRF Maroc
- Accusé de réception automatique
- **Impact :** élimine la dernière étape manuelle SAR/STR

#### Travel Rule (FATF R.16)
- Pour établissements de paiement et fintechs crypto
- Compliance IVMS-101
- **Impact :** ouvre segment paiements numériques

#### API Publique
- REST endpoints documentés (OpenAPI 3.0)
- Clés API par institution
- Webhooks sortants configurables
- Rate limiting par tier
- **Impact :** permet intégrations partenaires

---

### 🌍 PRIORITÉ 3 — 2027 (Expansion)

#### Expansion Maghreb
- **Tunisie** : localisation BCT (Banque Centrale de Tunisie)
- **Algérie** : localisation Banque d'Algérie (pilote avec IMF)
- Multilinguisme arabe natif
- **Impact :** ×3 le marché adressable

#### AI Narrative Generator
- Génération automatique du narratif SAR/STR
- Fine-tuné sur jurisprudence ANRF
- Réduction de 80% du temps de rédaction
- **Impact :** différenciation forte vs. concurrents

#### Marketplace Règles AML
- Règles partagées entre institutions (anonymisées)
- Bibliothèque de scénarios BAM homologués
- Communauté compliance officiers
- **Impact :** effet réseau — lock-in marché

#### Mobile App Compliance Officer
- Notifications temps réel alertes CRITICAL
- Approbation dual control depuis mobile
- Dashboard direction sur mobile
- **Impact :** adoption + réactivité

---

## MATRICE PRIORITÉS

```
                HIGH IMPACT
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    │  CBS SDK     F1 Correspondent  │
    │  Q3 2026     Banking Q3 2026  │
    │               │               │
FAIBLE──────────────┼──────────────FORT
EFFORT             │            EFFORT
    │               │               │
    │  GoAML      Multi-tenant      │
    │  Export      Q4 2026         │
    │  Q4 2026      │               │
    └───────────────┼───────────────┘
                    │
                LOW IMPACT
```

---

## KPIs PRODUIT ACTUELS (Mai 2026)

| Indicateur | Valeur |
|-----------|--------|
| Tests automatisés | 216/216 ✅ |
| Erreurs TypeScript | 0 |
| Warnings ESLint | 0 |
| Modules livrés | 22 |
| Pages / routes | 33 |
| Endpoints tRPC | 80+ |
| Couverture réglementaire BAM | 100% Circulaire 5/W/2023 |
| Couverture FATF | R.10, R.11, R.12, R.13*, R.15, R.16* |
| Temps détection alerte | < 200ms |
| Temps onboarding nouveau client | < 2h (vs 2 semaines manuel) |

*En développement Q3 2026*

---

*Document confidentiel — WatchReg — Mai 2026*
