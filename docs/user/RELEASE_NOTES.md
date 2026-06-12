# Release Notes — WatchReg KYC-AML Platform

> Historique des versions, changements majeurs et notes de migration.

---

## v2.6.0 — Juin 2026

### Nouveautés — Modules locaux 100% souverains (sans dépendance cloud)

- **Biométrie InsightFace/ArcFace** : comparaison faciale selfie ↔ document entièrement locale, sans appel externe. Modèle `buffalo_sc` (~14 MB) téléchargé une fois, puis embarqué. Seuils configurables (`ML_FACE_PASS_THRESHOLD=0.40`, `ML_FACE_REVIEW_THRESHOLD=0.25`). Endpoint `POST /face/compare` sur le service ML Python.
- **OCR confirmé 100% local** : Tesseract.js (fra+eng+ara) — aucun appel AWS/Azure/Google. Support arabe via `OCR_LANG_ARABIC=true`.
- **ML Scoring intégré Docker** : le service Python (IsolationForest + XGBoost) démarre automatiquement avec `docker compose up -d` (suppression du profil optionnel `ml`).
- **Configuration face via Docker** : variables `ML_FACE_MODEL_NAME` (buffalo_sc/buffalo_l), `ML_FACE_PASS_THRESHOLD`, `ML_FACE_REVIEW_THRESHOLD` dans `docker-compose.yml`.

### Résultats de tests biométrie validés

| Scénario | Résultat | Similarité |
|---|---|---|
| Même personne (selfie = document) | PASS | 1.000 (100%) |
| Personnes différentes | FAIL | 0.107 (10%) |
| Visage masqué / illisible | FAIL | — |
| Selfie sans photo document | REVIEW | — |

### Améliorations
- `ekyc.biometric.ts` : provider `local` appelle désormais `ML_SERVICE_URL/face/compare` avec fallback REVIEW automatique si service ML indisponible (pas de blocage onboarding).
- `ml/app/face.py` : module InsightFace avec lazy loading thread-safe, sélection visage le plus grand, similarité cosinus ArcFace.
- Dockerfile ML : ajout libs système OpenCV (`libgl1`, `libglib2.0-0`, `libsm6`, `libxrender1`, `libxext6`).

### Dépendances ajoutées (ml/requirements.txt)
- `insightface==0.7.3`
- `onnxruntime==1.19.2`
- `opencv-python-headless==4.10.0.84`

### Notes de déploiement
- **1er démarrage** : InsightFace télécharge le modèle automatiquement (~14 MB pour buffalo_sc, ~300 MB pour buffalo_l). Le service est disponible dès le téléchargement. Prévoir le stockage dans le volume `ml_models`.
- **Modèle recommandé POC** : `buffalo_sc` (rapide, suffisant). **Modèle production** : `buffalo_l` (précision maximale).
- Aucune clé API externe requise pour l'eKYC en mode `local`.

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
