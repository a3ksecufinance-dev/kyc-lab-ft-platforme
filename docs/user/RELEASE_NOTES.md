# Release Notes — KYC-AML Platform

> Historique des versions, changements majeurs et notes de migration.

---

## v2.5.0 — Mars 2026

### Nouveautés
- **pKYC (Perpetual KYC)** : scoring de dérive nocturne automatique sur tous les clients actifs. Seuil configurable (`PKYC_DRIFT_THRESHOLD`, défaut 40). Alerte automatique si dérive > seuil.
- **Règles MENA** : deux nouvelles règles AML — `MENA_STRUCTURING` (structuration Maghreb/Levant) et `HAWALA_PATTERN` (réseaux informels de transfert). Conformité BAM Circulaire 5/W/2023.
- **ML Retraining Scheduler** : réentraînement automatique hebdomadaire du modèle de scoring (cron configurable). Déclenchement manuel depuis le back-office admin.
- **CASH_INTENSIVE** : règle de détection des secteurs cash-intensifs (taxe sur les espèces).
- **Chiffrement PII** : champ `piiData` chiffré AES-256-GCM en base (`PII_ENCRYPTION_KEY`).
- **MFA TOTP** : authentification multifacteur via TOTP (Google Authenticator, Authy).
- **Transmission GoAML/TRACFIN** : génération XML conforme goAML 4.0 et envoi direct via API TRACFIN.

### Améliorations
- Moteur AML retourne maintenant tous les résultats (11 règles) même non déclenchées — meilleure traçabilité.
- `CRITICAL_RISK_COUNTRIES` (KP, IR, CU, SY) : score 90 au lieu de 70, priorité `CRITICAL`.
- Score PEP dynamique : 75 si transaction ≥ seuil, 50 sinon (était 60 fixe).
- HAWALA : seuil de priorité `HIGH` abaissé à score ≥ 60 (était ≥ 75).
- API de health check enrichie : statut S3/MinIO inclus.
- Rate limiting Redis configurable (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECONDS`).

### Corrections
- Migration `0005_security_compliance` : tables MFA, sessions, clés de chiffrement.
- Suppression de fichiers orphelins (`avalntas6aml.engine.ts`, `As6ocr.service.ts`).
- ESLint v9 flat config : 0 erreur, 0 warning en configuration stricte.

### Migration depuis v2.4
```bash
pnpm drizzle-kit migrate
# Nouvelles variables requises
PII_ENCRYPTION_KEY=<32+ chars>
MFA_ENCRYPTION_KEY=<32+ chars>
PKYC_ENABLED=true
```

---

## v2.4.0 — Janvier 2026

### Nouveautés
- **eKYC multi-provider** : support Onfido, Sum Sub, et provider local (OCR interne).
- **Upload S3/MinIO** : backend de stockage configurable (`STORAGE_BACKEND=s3|local`).
- **Signed URLs** : accès temporaire aux documents (expiration configurable via `S3_SIGNED_URL_EXPIRES`).
- **OCR documents** : extraction automatique des données d'identité (Tesseract.js).
- **Webhook CBS** : réception des transactions en temps réel depuis le Core Banking System avec vérification HMAC-SHA256.

### Améliorations
- Logs structurés Pino avec corrélation des requêtes (`requestId`).
- Métriques Prometheus (`/metrics`) : DB, Redis, alertes actives, transactions 24h.
- Variables d'environnement validées au démarrage via Zod.
- JWT Access/Refresh avec rotation automatique des tokens.

### Migration depuis v2.3
```bash
pnpm drizzle-kit migrate
# Nouvelles variables requises
STORAGE_BACKEND=local
UPLOAD_DIR=./uploads
EKYC_PROVIDER=local
```

---

## v2.3.0 — Novembre 2025

### Nouveautés
- **Screening sanctions** : listes OFAC SDN, UE, ONU, UK, BAM/ANRF, OpenSanctions PPE.
- **Fuzzy matching** : algorithme Jaro-Winkler avec seuils configurables (`SCREENING_MATCH_THRESHOLD`, `SCREENING_REVIEW_THRESHOLD`).
- **Scheduleur screening** : mise à jour automatique des listes (cron configurable).
- **Contrôle de fraîcheur** : alerte si liste non mise à jour depuis > N heures (`SCREENING_STALE_THRESHOLD_HOURS`).
- **World-Check API** : connecteur optionnel vers le provider payant Refinitiv.

### Améliorations
- Normalisation des noms : suppression des diacritiques, variantes patronymiques.
- Batch processing des listes jusqu'à 100 000 entrées.
- Logs d'audit pour chaque consultation de liste.

---

## v2.2.0 — Septembre 2025

### Nouveautés
- **Module Cases** : dossiers d'investigation avec timeline, assignation analyste, décisions (SAR, clôture).
- **SAR (Suspicious Activity Report)** : génération automatique et transmission.
- **Module Reporting** : rapports AMLD6, statistiques mensuelles, exports PDF/CSV.
- **Back-office admin** : gestion des utilisateurs, rôles, logs d'audit, statistiques.

### Améliorations
- Rôles RBAC : `user`, `analyst`, `supervisor`, `compliance_officer`, `admin`.
- Logs d'audit immuables pour toutes les actions sensibles.

---

## v2.1.0 — Juillet 2025

### Nouveautés
- **Moteur AML** : 9 règles (THRESHOLD_EXCEEDED, STRUCTURING, HIGH_FREQUENCY, VOLUME_SPIKE, HIGH_RISK_COUNTRY, PEP_TRANSACTION, SANCTION_COUNTERPARTY, ROUND_AMOUNT, UNUSUAL_CHANNEL).
- **Scoring ML** : intégration service Python (`ML_SERVICE_URL`) avec fallback règles déterministes.
- **Module Alerts** : création, résolution, escalade des alertes AML.
- **KYC Customers** : gestion complète du cycle de vie client (création, vérification, score de risque).

---

## v2.0.0 — Mai 2025

### Refonte complète
- Migration de l'architecture monolithique vers une API tRPC typée end-to-end.
- Base de données PostgreSQL avec Drizzle ORM (remplace Mongoose/MongoDB).
- Frontend React + Vite + shadcn/ui (remplace Angular).
- Authentification JWT stateless (remplace sessions cookie).
- Infrastructure Docker Compose multi-services.

### Ruptures de compatibilité
- API REST v1 supprimée — migration vers tRPC obligatoire.
- Schéma de base de données entièrement revu — migration de données requise.
- Variables d'environnement renommées (voir `server/_core/env.ts`).

---

## v1.x — 2024

Versions de la plateforme initiale (architecture legacy).
Support terminé — migration vers v2.x recommandée.

---

*Pour les détails techniques de chaque migration, consulter `drizzle/migrations/` et les commits Git associés.*
