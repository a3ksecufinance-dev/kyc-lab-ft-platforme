# eKYC — Design & Refonte
**Version 1.0 — Juillet 2026**

> Document de spécification pour la refonte complète du module OCR/eKYC.
> À valider avant implémentation.

---

## 1. Problèmes actuels (audit)

### Use Cases manquants ou mal gérés

| # | Problème | Impact |
|---|----------|--------|
| P1 | Recto ET verso obligatoires en 1 seule requête | Bloque si verso illisible/absent |
| P2 | Pas de session brouillon reprenable | Agent perd tout s'il ferme la page |
| P3 | Pas de retry OCR sur session existante | Doit tout recommencer si mauvaise photo |
| P4 | Pas de mode "OCR seul" (sans création client) | Impossible juste vérifier une CIN |
| P5 | Pas d'historique client (déjà vu ?) | Agent ne détecte pas doublon avant OCR |
| P6 | Pas de token magique pour self-service | Client final doit venir en agence |
| P7 | Batch mode absent | Agent traite 1 client à la fois |

### UX pages actuelles

| # | Problème | Impact |
|---|----------|--------|
| U1 | Flux linéaire rigide (6 étapes) | Impossible de sauter/revenir sans perdre |
| U2 | Pas de feedback pendant les 10s d'OCR | Anxiogène, sensation de plantage |
| U3 | Guide de cadrage basique (rectangle statique) | Photos souvent mal cadrées |
| U4 | Pas de détection auto qualité image | Envoi de photos floues/sombres |
| U5 | Édition champs peu ergonomique | Comparaison OCR/saisie manuelle difficile |
| U6 | Pas de résumé avant soumission | Erreurs découvertes trop tard |
| U7 | Pas responsive mobile-first | Inutilisable en agence sur tablette |
| U8 | Pas de mode dark cohérent | Fatigue visuelle en usage prolongé |

---

## 2. Nouveau modèle : Machine à états de session

```
                    ┌─────────────┐
                    │   DRAFT     │  ← Session créée, aucune image
                    └──────┬──────┘
                           │ upload recto
                           ▼
                    ┌─────────────┐
                    │ RECTO_ONLY  │  ← Recto uploadé + OCRé
                    └──────┬──────┘
                           │ upload verso (optionnel)
                           ▼
                    ┌─────────────┐
                    │  OCR_DONE   │  ← Recto + Verso analysés
                    └──────┬──────┘
                           │ agent/client valide
                           ▼
                    ┌─────────────┐
                    │ AGENT_REVIEW│  ← Champs vérifiés
                    └──────┬──────┘
                           │ soumission finale
                           ▼
                    ┌─────────────┐
                    │  DECIDED    │  ← Client créé (customerId)
                    └─────────────┘

  Transitions possibles :
  DRAFT → ABANDONED (timeout ou explicite)
  RECTO_ONLY → RECTO_ONLY (retry recto)
  OCR_DONE → RECTO_ONLY / DRAFT (retry)
  * → ABANDONED (expiration TTL)
```

### Durées TTL par canal

| Canal | TTL DRAFT | TTL après OCR |
|-------|-----------|---------------|
| CBS_API (Basikon) | 24h | 24h |
| DIGITAL_WEB (client self-service) | 30 min | 1h |
| AGENT_OFFICE (agent en agence) | 8h (fin journée) | 8h |
| MOBILE_APP (future) | 15 min | 30 min |

---

## 3. Personas & Wireframes

### 🧑‍💼 Persona 1 — Agent Basikon en agence

**Contexte** : Client physique en face de l'agent. Agent traite 20-50 clients/jour. Interface tablette ou desktop.

**Besoins clés** :
- Rapidité (raccourcis clavier)
- Vue simultanée de plusieurs sessions
- Historique client (déjà vu ?)
- Feedback OCR clair
- Correction rapide des champs

**Wireframe** :

```
┌─────────────────────────────────────────────────────────────────────┐
│  eKYC Digital — Mode Agent                    [+] Nouveau  [☰] Menu │
├─────────┬──────────────────────────────────────────┬────────────────┤
│Sessions │  Session OCR-XY9K3    [DRAFT] 14:32       │ Historique CIN │
│actives  │                                            │                │
│(3)      │  ┌───────────────────────────────────┐    │ Aucun résultat │
│         │  │  CAPTURE CIN                       │    │ pour ce CIN    │
│●OCR-A1  │  │                                    │    │                │
│ BENALI  │  │  ┌─────────────┐  ┌─────────────┐ │    │                │
│ 12:15   │  │  │  RECTO ✓    │  │  VERSO      │ │    │                │
│         │  │  │             │  │             │ │    │                │
│●OCR-B2  │  │  │  [Preview]  │  │  [Upload]   │ │    │                │
│ TAZI    │  │  │             │  │             │ │    │                │
│ 13:47   │  │  │  Confidence:│  │             │ │    │                │
│         │  │  │  54%        │  │             │ │    │                │
│◐OCR-XY9K│  │  └─────────────┘  └─────────────┘ │    │                │
│ (courant│  │                                    │    │                │
│ 14:32   │  │  ┌───────────────────────────────┐│    │                │
│         │  │  │ CHAMPS EXTRAITS               ││    │                │
│─────────│  │  │                               ││    │                │
│Ma queue │  │  │ Prénom    OCR:  ---           ││    │                │
│         │  │  │           You:  [___________] ││    │                │
│⏳ 8 en   │  │  │                               ││    │                │
│ attente │  │  │ Nom       OCR:  ---           ││    │                │
│ revue   │  │  │           You:  [___________] ││    │                │
│         │  │  │                               ││    │                │
│         │  │  │ N° CIN    OCR:  K01234567 ✓   ││    │                │
│         │  │  │           You:  K01234567     ││    │                │
│         │  │  │                               ││    │                │
│         │  │  │ Date naiss OCR: 1978-11-29 ✓  ││    │                │
│         │  │  │            You: 1978-11-29    ││    │                │
│         │  │  └───────────────────────────────┘│    │                │
│         │  │                                    │    │                │
│         │  │  [Retry OCR]  [Sauver]  [Valider] │    │                │
│         │  └────────────────────────────────────┘    │                │
└─────────┴──────────────────────────────────────────┴────────────────┘
```

**Raccourcis clavier** :
- `Ctrl+N` : Nouvelle session
- `Tab` / `Shift+Tab` : Navigation entre champs
- `Ctrl+S` : Sauver brouillon
- `Ctrl+Enter` : Valider et soumettre
- `Esc` : Annuler la session courante
- `1-9` : Passer à session N (dans la sidebar)

---

### 📱 Persona 2 — Client final self-service (mobile)

**Contexte** : Client scan sa CIN chez lui avec son smartphone. Interface guidée, rassurante, avec explications.

**Besoins clés** :
- Guide visuel simple
- Explications à chaque étape ("pourquoi ?")
- Rassurance sur la confidentialité
- Retry facile
- Assistance en cas de blocage

**Wireframe (mobile 375×667)** :

```
┌─────────────────────────┐
│ ← Étape 2/5             │
│ Progress ●●○○○           │
├─────────────────────────┤
│                         │
│  📄 Photo de votre CIN  │
│                         │
│  Placez le RECTO         │
│  de votre carte dans     │
│  le cadre                │
│                         │
│  ┌───────────────────┐  │
│  │ ┌───────────────┐ │  │
│  │ │               │ │  │
│  │ │   [CAMERA     │ │  │
│  │ │    FEED]      │ │  │
│  │ │               │ │  │
│  │ │  ┌─────────┐  │ │  │
│  │ │  │  CADRE  │  │ │  │  ← Cadre teal
│  │ │  │  auto   │  │ │  │    devient vert
│  │ │  │  vert   │  │ │  │    quand aligné
│  │ │  └─────────┘  │ │  │
│  │ │               │ │  │
│  │ └───────────────┘ │  │
│  └───────────────────┘  │
│                         │
│  ✓ Bon éclairage         │
│  ✓ Cadre bien aligné     │
│  ⚠ Rapprochez-vous       │
│                         │
│  [📷 Capturer]           │
│                         │
│  ─── ou ───              │
│                         │
│  [📁 Importer photo]     │
│                         │
│  ℹ️ Vos données sont     │
│  chiffrées et effacées   │
│  après validation.       │
│                         │
└─────────────────────────┘
```

**Étapes du flow client** :

1. **Bienvenue** — explication du process
2. **CIN Recto** — capture guidée
3. **CIN Verso** (optionnel skip) — capture guidée
4. **Selfie** — vérification biométrique
5. **Récapitulatif** — validation données
6. **Soumission** — confirmation
7. **Résultat** — merci + prochaines étapes

---

## 4. Nouveaux endpoints API

### API Session-driven (remplace/complète les endpoints actuels)

```
POST   /api/ekyc/sessions
       Crée une session brouillon
       Body: { channel, cbs_id?, cbs_fields?, agent_user_id? }
       Response: { sessionRef, expiresAt, status: "DRAFT" }

PATCH  /api/ekyc/sessions/:ref
       Met à jour partiellement la session
       Body: { fields?, cbs_fields? }
       Response: session complète

POST   /api/ekyc/sessions/:ref/images
       Upload d'image progressif (recto OU verso)
       Body: { side: "recto" | "verso", base64, mimeType }
       Response: { ocrResult, confidence, extracted, status }

POST   /api/ekyc/sessions/:ref/retry-ocr
       Relance OCR sur une image déjà uploadée
       Body: { side, options?: { sauvola, dualPass, ... } }

POST   /api/ekyc/sessions/:ref/finalize
       Crée le client final et transition → DECIDED
       Body: { fields, modified, modifiedFields }
       Response: { customerId, kycStatus, screening, ... }

GET    /api/ekyc/sessions/:ref
       Consultation détaillée session
       Response: session complète + historique événements

GET    /api/ekyc/sessions
       Liste des sessions de l'utilisateur courant
       Query: ?status=DRAFT&limit=20&channel=CBS_API
       Response: [ sessions ]

DELETE /api/ekyc/sessions/:ref
       Marque session ABANDONED
       Response: { abandoned: true }

POST   /api/ekyc/sessions/:ref/magic-link
       Génère un token magique pour self-service client
       Body: { validityMinutes?: 30 }
       Response: { url: "https://.../kyc/token/xxx", expiresAt }

GET    /api/ekyc/history?cin=XXX
       Recherche client existant par CIN
       Response: { exists: true, customerRef, riskLevel, kycStatus } | { exists: false }
```

### Compatibilité avec endpoints actuels

Les endpoints `/api/cbs/ocr` et `/api/cbs/confirm` restent fonctionnels (compatibilité Basikon en cours de développement).

Nouvelle correspondance :

| Ancien | Nouveau équivalent |
|--------|-------------------|
| POST /api/cbs/ocr | POST /api/ekyc/sessions + POST /images (recto + verso) |
| POST /api/cbs/confirm | POST /api/ekyc/sessions/:ref/finalize |

---

## 5. Pipeline OCR amélioré

### Nouveau pipeline avec quality gate

```
   Image uploadée
        │
        ▼
   ┌─────────────────────┐
   │ Quality Check       │
   │  - Résolution min   │
   │  - Luminosité       │
   │  - Netteté          │
   │  - Détection bords  │
   └──────┬──────────────┘
          │
    ┌─────┴─────┐
    │ Reject    │ ─── Retry demandé, message clair
    │ Accept    │
    └─────┬─────┘
          ▼
   ┌─────────────────────┐
   │ Pré-traitement Jimp │
   │  (déjà fait)        │
   └──────┬──────────────┘
          ▼
   ┌─────────────────────┐
   │ OCR Multi-pass      │
   │  - PSM 6 image entière
   │  - PSM 7 zone nom   │
   │  - MRZ si détecté   │
   └──────┬──────────────┘
          ▼
   ┌─────────────────────┐
   │ Field Extraction    │
   │  - CIN pattern      │
   │  - Dates FR         │
   │  - Nom/Prénom       │
   │  - CAN              │
   └──────┬──────────────┘
          ▼
   ┌─────────────────────┐
   │ Confidence Report   │
   │  { fields, scores } │
   └─────────────────────┘
```

### Quality Gate côté client

Avant même d'envoyer l'image au serveur, faire les checks côté navigateur :

```typescript
interface ImageQuality {
  resolution: { width: number; height: number };   // Min 1000×600
  brightness: number;                              // 40-220 (0-255)
  sharpness:  number;                              // Laplacian variance ≥ 50
  edges:      { detected: boolean; alignment: number }; // Détection rectangle CIN
}
```

Si `sharpness < 50` → afficher "Photo floue, réessayez"
Si `brightness < 40` → afficher "Trop sombre"
Si `brightness > 220` → afficher "Trop clair, éliminer les reflets"

---

## 6. Plan de mise en œuvre

### Phase 1 — Backend (base des nouveaux workflows) — 1 jour

- Ajout endpoints `/api/ekyc/sessions*`
- Migration `kyc_sessions` : ajout champs `sideImagesUploaded`, `qualityChecks`, `agentUserId`
- Service `ekyc-session.service.ts` (CRUD + états)
- Service `image-quality.service.ts` (checks serveur en fallback)
- Compat backward avec anciens endpoints

### Phase 2 — Page Agent (desktop/tablette) — 1 jour

- Refonte `/ekyc` en layout 3 colonnes (sidebar sessions / capture+édition / historique)
- Raccourcis clavier
- Édition champs OCR vs saisie manuelle avec diff visuel
- Batch : plusieurs sessions ouvertes
- Historique client par CIN
- Retry OCR sur session existante

### Phase 3 — Page Client self-service (mobile) — 1 jour

- Nouvelle route `/kyc/:token` (accès par magic link)
- Layout mobile-first
- Onboarding progressif avec explications
- Guide de cadrage avancé (détection en temps réel)
- Quality gate visuel côté client
- Résumé avant soumission
- Écran de confirmation post-envoi

### Phase 4 — Améliorations pipeline OCR — 0.5 jour

- Quality gate côté client (Canvas API + WebAssembly)
- Quality check serveur (fallback)
- Detection bords CIN (Sobel + Hough transform simplifié)

---

## 7. Points à valider avant de coder

1. **Modèle de session** :
   - ✅ / ❌ Accepter que le verso soit optionnel (skip possible côté client)
   - ✅ / ❌ Autoriser les sessions "OCR seul" sans création finale

2. **Persona Agent** :
   - ✅ / ❌ Layout 3 colonnes (sidebar / travail / historique)
   - ✅ / ❌ Prioriser raccourcis clavier

3. **Persona Client** :
   - ✅ / ❌ Magic link par SMS/email (nécessite intégration Twilio/SendGrid)
   - ✅ / ❌ Selfie obligatoire avant soumission
   - ✅ / ❌ Utiliser face-api.js côté client (déjà en place) ou service tiers

4. **Compatibilité** :
   - ✅ / ❌ Garder `/api/cbs/ocr` + `/api/cbs/confirm` (Basikon a intégré ceux-là)
   - ✅ / ❌ Nouveau `/api/ekyc/*` en parallèle (recommandé)

5. **Quality gate** :
   - ✅ / ❌ Bloquer les mauvaises photos avant envoi
   - ✅ / ❌ Ou tolérer et informer (soft warning)

---

## 8. Estimation totale

| Phase | Durée | Livrable |
|-------|-------|----------|
| Phase 1 — Backend | 1j | 8 nouveaux endpoints + migration DB |
| Phase 2 — Page Agent | 1j | Layout 3 col + raccourcis + batch |
| Phase 3 — Page Client | 1j | Route /kyc/:token mobile-first |
| Phase 4 — Pipeline OCR | 0.5j | Quality gate + détection bords |
| **Total** | **3.5j** | Refonte complète eKYC |

---

*À valider avant démarrage — LabFT v5.0*
