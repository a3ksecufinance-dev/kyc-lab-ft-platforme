# Biométrie Faciale Locale — InsightFace / ArcFace
## Module eKYC sans dépendance cloud — WatchReg v2.6

> **Classification :** INTERNE — Technique & Compliance
> **Version :** 2.6.0 (Juin 2026)
> **Statut :** Production-ready (validé POC)

---

## 1. Synthèse

WatchReg intègre depuis la v2.6 un module de **comparaison faciale 100% local** basé sur **InsightFace/ArcFace**.

| Critère | Valeur |
|---|---|
| Appels externes | **Zéro** — aucune API cloud |
| Modèle utilisé | ArcFace (InsightFace `buffalo_sc` / `buffalo_l`) |
| Taille modèle POC | ~14 MB (`buffalo_sc`) |
| Taille modèle production | ~300 MB (`buffalo_l`) |
| Précision `buffalo_sc` | AUC ~0.92 |
| Précision `buffalo_l` | AUC ~0.97 |
| Temps de traitement | 300–800 ms sur CPU (sans GPU) |
| Conformité RGPD | Données biométriques non transmises hors périmètre |

---

## 2. Architecture

```
Client Web (selfie JPG/PNG base64)
          │
          ▼
Node.js — ekyc.biometric.ts
  provider = "local"
          │
          ▼ POST /face/compare (réseau Docker interne)
          │ { selfie_b64, doc_photo_b64 }
          │ Header: X-Api-Key
          ▼
Python ML Service (kyc_ml:8000)
  app/face.py — FaceAnalyzer (InsightFace)
          │
          ▼
  Modèle ArcFace (stocké dans /app/models/insightface/)
  1. Détection visage (det_500m.onnx)
  2. Extraction embedding 512D (w600k_mbf.onnx)
  3. Similarité cosinus selfie ↔ document
          │
          ▼
  { status, similarity, liveness_score, detail }
          │
          ▼
Node.js — LivenessResult
  → BiometricCheck[] → audit trail
```

**Aucune donnée biométrique ne sort du réseau Docker interne.**

---

## 3. Seuils de Décision

| Similarité cosinus | Décision | Liveness score | Action |
|---|---|---|---|
| ≥ 0.40 | **PASS** | 55–100 | Onboarding automatique |
| 0.25 – 0.39 | **REVIEW** | 25–55 | File révision manuelle analyste |
| < 0.25 | **FAIL** | 0–25 | Refus onboarding immédiat |
| Visage non détecté | **FAIL** | 0 | Refus — selfie invalide |
| Pas de photo doc | **REVIEW** | 60 | Révision manuelle |

Les seuils sont configurables via les variables d'environnement :
```env
ML_FACE_PASS_THRESHOLD=0.40
ML_FACE_REVIEW_THRESHOLD=0.25
```

---

## 4. Résultats de Validation (Tests Juin 2026)

Tests exécutés sur Python 3.12 + InsightFace 1.0.1 + ONNX Runtime 1.23.2 :

| Test | Scénario | Similarity | Statut | Résultat |
|---|---|---|---|---|
| A | Même personne (selfie = document) | 1.000 | PASS | ✅ Attendu |
| B | Personnes différentes | 0.107 | FAIL | ✅ Attendu |
| C | Selfie avec visage masqué | — | FAIL | ✅ Attendu |
| D | Selfie sans photo document | — | REVIEW | ✅ Attendu |

---

## 5. Configuration

### 5.1 Variables d'environnement

```env
# Provider biométrique (local = InsightFace, onfido, sumsub)
EKYC_PROVIDER=local

# URL du service ML (réseau Docker)
ML_SERVICE_URL=http://kyc_ml:8000
ML_INTERNAL_API_KEY=<clé interne partagée>

# Modèle InsightFace
ML_FACE_MODEL_NAME=buffalo_sc      # buffalo_l pour production
ML_FACE_PASS_THRESHOLD=0.40
ML_FACE_REVIEW_THRESHOLD=0.25
```

### 5.2 docker-compose.yml

```yaml
ml:
  build:
    context: ./ml
    dockerfile: Dockerfile
  container_name: kyc_ml
  environment:
    ML_FACE_MODEL_NAME: buffalo_sc
    ML_FACE_PASS_THRESHOLD: "0.40"
    ML_FACE_REVIEW_THRESHOLD: "0.25"
  volumes:
    - ml_models:/app/models    # modèle persisté entre redémarrages
```

### 5.3 Changement de modèle buffalo_sc → buffalo_l (production)

```bash
# Arrêter le service ML
docker compose stop ml

# Mettre à jour la variable
# Dans docker-compose.yml : ML_FACE_MODEL_NAME: buffalo_l

# Redémarrer (téléchargement automatique ~300 MB au 1er démarrage)
docker compose up -d ml

# Vérifier
curl http://localhost:8000/health
# → { "model_ready": true, ... }
```

---

## 6. Endpoint API

### `POST /face/compare`

**Authentification :** Header `X-Api-Key: <ML_INTERNAL_API_KEY>`

**Requête :**
```json
{
  "selfie_b64": "<image selfie encodée base64>",
  "doc_photo_b64": "<photo document encodée base64 — optionnel>"
}
```

**Réponse :**
```json
{
  "status": "PASS",
  "similarity": 0.854,
  "liveness_score": 100,
  "detail": "Correspondance faciale confirmée (similarité: 0.854)",
  "selfie_detected": true,
  "doc_detected": true,
  "model_ready": true,
  "provider": "insightface"
}
```

**Codes d'erreur :**
- `401` — Clé API invalide
- `422` — Corps de requête invalide
- `200` avec `status: FAIL` — Visage non correspondant ou non détecté

---

## 7. Comportement de Fallback

Si le service ML est indisponible (démarrage en cours, erreur réseau) :

1. `ekyc.biometric.ts` capte le timeout (30 s) ou l'erreur HTTP
2. Retourne automatiquement `REVIEW` avec détail : *"Service ML indisponible — révision manuelle requise"*
3. L'onboarding **n'est pas bloqué** — le dossier passe en file manuelle
4. Aucune exception n'est propagée vers l'utilisateur

---

## 8. Conformité RGPD

| Article | Exigence | Implémentation |
|---|---|---|
| Art. 9 | Biométrie = donnée sensible (catégorie spéciale) | Traitement local, aucune transmission externe |
| Art. 22 | Droit à l'explication | Score + detail dans chaque réponse, auditables |
| Art. 5(e) | Limitation de la conservation | Images non stockées, traitement en mémoire uniquement |
| Art. 32 | Sécurité du traitement | Réseau Docker interne, clé API, TLS en production |

**Les images selfie et document ne sont jamais persistées** — elles transitent uniquement en mémoire entre le service Node.js et le service ML.

---

## 9. Comparaison avec Providers Externes

| Critère | InsightFace Local | Onfido | SumSub |
|---|---|---|---|
| Appels externes | Aucun | Oui | Oui |
| Coût par vérification | 0€ | ~1–2€ | ~0.5–1€ |
| Latence | 300–800 ms (CPU) | 5–30 s | 5–30 s |
| RGPD souveraineté | Totale | Partielle (UK) | Partielle (EU) |
| Précision | AUC 0.92–0.97 | AUC ~0.99 | AUC ~0.98 |
| Certifications | — | IDSP UK DIATF | BSFI / FATF |
| Configuration | Variable ENV | API Token | App Token + Secret |

**Recommandation POC :** `local` (InsightFace) — souveraineté totale, coût zéro.
**Recommandation production haute-conformité :** `onfido` ou `sumsub` si certification IDSP requise.

---

## 10. Dépannage

### Le service ML ne répond pas
```bash
# Vérifier l'état du conteneur
docker compose ps ml
docker compose logs ml --tail=50

# Health check manuel
curl http://localhost:8000/health
```

### Modèle non chargé au démarrage
```
# Symptôme dans les logs :
"InsightFace indisponible — /face/compare retournera REVIEW systématique"

# Cause possible : volume ml_models vide ou corrompu
docker compose exec ml ls /app/models/insightface/models/

# Solution : forcer le rechargement
docker compose restart ml
```

### Erreur OpenCV (libGL)
```
# Symptôme : ImportError: libGL.so.1: cannot open shared object file
# Solution : inclus dans le Dockerfile (libgl1, libglib2.0-0)
# Vérifier que l'image Docker est reconstruite après modification du Dockerfile :
docker compose build ml --no-cache
```

---

*Dernière mise à jour : **Juin 2026** — WatchReg v2.6*
