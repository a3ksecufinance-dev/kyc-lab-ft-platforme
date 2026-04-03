# Documentation KYC-AML Platform v2.5

> Documentation exhaustive à destination des clients, partenaires et régulateurs.
> Toute la documentation est en français sauf la spécification OpenAPI (YAML).

---

## Structure de la Documentation

```
docs/
├── README.md                          ← Ce fichier (index)
├── TECHNICAL_DEPLOYMENT.md            ← Runbook déploiement production complet
│
├── api/                               ── Pour les Développeurs & Chefs de Projet
│   ├── OPENAPI_SPEC.yaml              ← Spécification API complète (OpenAPI 3.0.3)
│   ├── DATA_DICTIONARY.md             ← Dictionnaire des 16 tables + classification RGPD
│   └── INTEGRATION_MANUAL.md         ← Manuel d'intégration CBS (webhook, API, exemples code)
│
├── user/                              ── Pour les Analystes LAB/FT & Compliance
│   ├── USER_GUIDE.md                  ← Guide utilisateur complet par fonctionnalité
│   ├── RISK_ENGINE_METHODOLOGY.md     ← Méthodologie des 12 règles AML + pKYC + ML
│   ├── SLA.md                         ← Engagements de service (disponibilité, performance, support)
│   └── RELEASE_NOTES.md              ← Historique des versions v1.0 (2024) → v2.5 (2026)
│
├── security/                          ── Pour le DSI & RSSI
│   ├── DAT.md                         ← Dossier d'Architecture Technique (ADR, flux, matrice sécu)
│   ├── ENCRYPTION_POLICY.md          ← Politique de chiffrement et gestion des clés
│   ├── PENTEST_SUMMARY.md            ← Résumé exécutif du test d'intrusion (Mars 2026)
│   └── BCP_DRP.md                    ← Plan de Reprise/Continuité d'Activité (RTO 4h, RPO 1h)
│
├── legal/                             ── Pour le DPO & Direction Juridique
│   ├── DPIA.md                        ← Analyse d'Impact RGPD Art.35 (CNIL PIA v3)
│   ├── DPA.md                         ← Accord de Traitement des Données Art.28
│   └── CGV_EULA.md                   ← Conditions Générales de Vente + Licence Utilisateur
│
├── compliance/                        ── Pour le Responsable Conformité & Régulateurs
│   ├── REGULATORY_MAPPING.md         ← Matrice AMLD6 × FATF × BAM × RGPD
│   ├── SANCTIONS_LIST_POLICY.md      ← Politique listes sanctions (6 sources, matching, gel avoirs)
│   └── DATA_RETENTION_POLICY.md     ← Durées de conservation légales par catégorie
│
├── operations/                        ── Pour les Équipes Ops & CSIRT
│   ├── INCIDENT_RESPONSE.md          ← Plan de réponse aux incidents de sécurité
│   └── TRAINING_PLAN.md              ← Plan de formation par rôle + certification interne
│
└── commercial/
    └── PRODUCT_SHEET.md              ← Fiche produit (pour la direction et les décideurs)
```

---

## Par Interlocuteur Chez Vos Clients

### Développeurs / Chefs de Projet
| Document | Description |
|---|---|
| [OpenAPI Spec](api/OPENAPI_SPEC.yaml) | Tous les endpoints, schémas, authentification — intégration CBS |
| [Dictionnaire de Données](api/DATA_DICTIONARY.md) | Schéma complet BDD, classification RGPD par champ |
| [Manuel d'Intégration](api/INTEGRATION_MANUAL.md) | Webhook HMAC, onboarding KYC, scoring AML, exemples Node.js/Python |

### Analystes LAB/FT / Compliance Officers
| Document | Description |
|---|---|
| [Guide Utilisateur](user/USER_GUIDE.md) | Navigation, alertes, screening, rapports TRACFIN, pKYC |
| [Méthodologie Moteur de Risque](user/RISK_ENGINE_METHODOLOGY.md) | 12 règles AML expliquées, pKYC, ML — aucune boîte noire |
| [SLA](user/SLA.md) | Disponibilité 99,5%, temps de réponse, support P0→P3, pénalités |
| [Release Notes](user/RELEASE_NOTES.md) | Historique versions, nouvelles fonctionnalités, migrations |

### DSI / RSSI
| Document | Description |
|---|---|
| [Architecture Technique (DAT)](security/DAT.md) | Infrastructure, flux réseau, sécurité, décisions d'architecture |
| [Politique de Chiffrement](security/ENCRYPTION_POLICY.md) | AES-256-GCM, TLS 1.3, rotation des clés, Vault |
| [Rapport Pentest](security/PENTEST_SUMMARY.md) | Audit sécurité Mars 2026 — 0 critique, plan de remédiation |
| [PCA/PRA](security/BCP_DRP.md) | RTO 4h, RPO 1h, runbooks de restauration, scénarios de panne |

### DPO / Direction Juridique
| Document | Description |
|---|---|
| [DPIA](legal/DPIA.md) | Analyse d'impact RGPD complète, droits des personnes |
| [DPA / ATD](legal/DPA.md) | Contrat de sous-traitance RGPD Art.28 prêt à signer |
| [CGV + EULA](legal/CGV_EULA.md) | Conditions générales + licence utilisateur |

### Responsable Conformité / Régulateurs
| Document | Description |
|---|---|
| [Cartographie Réglementaire](compliance/REGULATORY_MAPPING.md) | AMLD6 × FATF × BAM × RGPD — matrice complète |
| [Politique Listes Sanctions](compliance/SANCTIONS_LIST_POLICY.md) | 6 sources, mise à jour automatique, gel d'avoirs |
| [Politique de Rétention](compliance/DATA_RETENTION_POLICY.md) | Durées légales par catégorie (5-10 ans LAB/FT) |

### Équipes Opérationnelles / CSIRT
| Document | Description |
|---|---|
| [Déploiement Production](TECHNICAL_DEPLOYMENT.md) | Runbook complet VPS → Docker → TLS → CI/CD |
| [Plan de Réponse Incidents](operations/INCIDENT_RESPONSE.md) | Playbooks par scénario, notifications CNIL, post-mortem |
| [Plan de Formation](operations/TRAINING_PLAN.md) | Parcours par rôle, certification interne, modules |

### Direction / Décideurs
| Document | Description |
|---|---|
| [Fiche Produit](commercial/PRODUCT_SHEET.md) | Proposition de valeur, modules, conformité, architecture, démo |

---

## Informations Rapides

| Métrique | Valeur |
|---|---|
| Version actuelle | 2.5.0 (Avril 2026) |
| Disponibilité SLA | 99,5% mensuel |
| Règles AML | 12 (dont 3 spécifiques MENA) |
| Sources de screening | 6 (OFAC, EU, UN, UK, PEP OpenSanctions, BAM/ANRF) |
| Entités PEP indexées | 1,7M+ (OpenSanctions) |
| Latence scoring AML | < 100ms (P50) |
| Tests automatisés | 145 (9 suites Vitest) |
| Chiffrement PII | AES-256-GCM (NIST SP 800-38D) |
| Authentification | JWT HS256 + MFA TOTP RFC 6238 |
| Conformité | AMLD5/6, FATF 40 Rec., BAM, TRACFIN, GoAML, RGPD |

---

*Dernière mise à jour : Avril 2026 — KYC-AML Platform v2.5*
