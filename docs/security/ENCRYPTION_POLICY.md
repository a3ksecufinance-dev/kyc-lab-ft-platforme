# Politique de Chiffrement — KYC-AML Platform

**Classification :** CONFIDENTIEL — Usage interne RSSI/DevSecOps
**Version :** 1.0
**Date :** Mars 2026
**Propriétaire :** RSSI

---

## 1. Périmètre

Ce document couvre l'ensemble des mécanismes de chiffrement utilisés dans la plateforme KYC-AML : données en transit, données au repos, gestion des clés, et procédures de rotation.

---

## 2. Données en transit

### 2.1 Transport Layer Security (TLS)

| Composant | Protocole minimum | Certificat | Notes |
|-----------|-------------------|------------|-------|
| API HTTPS (reverse proxy) | TLS 1.2 (TLS 1.3 recommandé) | Let's Encrypt / CA interne | Nginx/Caddy en frontal |
| Connexion PostgreSQL | TLS 1.2 | Certificat serveur DB | `sslmode=require` dans `DATABASE_URL` |
| Connexion Redis | TLS 1.2 | Certificat serveur Redis | `rediss://` pour Redis TLS |
| Service ML interne | HTTP (réseau privé Docker) | N/A | Isolé sur réseau docker interne |
| Webhooks CBS entrants | HTTPS + HMAC-SHA256 | TLS côté CBS | Vérification signature obligatoire |

**Algorithmes autorisés (TLS 1.3) :**
- `TLS_AES_256_GCM_SHA384`
- `TLS_CHACHA20_POLY1305_SHA256`
- `TLS_AES_128_GCM_SHA256`

**Algorithmes interdits :**
- SSLv2, SSLv3, TLS 1.0, TLS 1.1
- RC4, DES, 3DES, MD5, SHA-1 (signatures)
- Cipher suites avec EXPORT ou anon

### 2.2 Vérification HMAC des webhooks

```
HMAC-SHA256(WEBHOOK_SECRET, raw_body_bytes)
```

Le secret doit faire au moins 32 caractères (`WEBHOOK_SECRET` ≥ 16 caractères imposé par le schéma Zod, recommandé ≥ 32).

---

## 3. Données au repos

### 3.1 Chiffrement PII (Personally Identifiable Information)

**Algorithme :** AES-256-GCM (mode AEAD)
**Clé :** `PII_ENCRYPTION_KEY` (minimum 32 caractères, encodée base64 recommandée)
**Champ concerné :** `customers.piiData` (JSONB chiffré)
**Implémentation :** `server/modules/customers/pii.service.ts`

```
Clé dérivée : PBKDF2(PII_ENCRYPTION_KEY, salt_aléatoire_16bytes, 100000_iterations, SHA-256)
IV : 12 bytes aléatoires (GCM standard)
Tag d'authentification : 16 bytes (128 bits)
Format stocké : base64(iv || tag || ciphertext)
```

**Données chiffrées dans `piiData` :**
- Numéro de pièce d'identité
- Numéro de passeport
- Date de naissance
- Adresse complète
- Numéro de téléphone personnel
- Données biométriques OCR

### 3.2 Chiffrement TOTP MFA

**Algorithme :** AES-256-GCM
**Clé :** `MFA_ENCRYPTION_KEY` (minimum 32 caractères)
**Champ concerné :** `users.mfaSecret`
**Usage :** Stockage des seeds TOTP des utilisateurs

### 3.3 Hachage des mots de passe

**Algorithme :** bcrypt
**Facteur de travail :** 12 (configurable — min. 10 recommandé en production)
**Salage :** Automatique (bcrypt intègre le sel dans le hash)
**Implémentation :** `bcryptjs` (pure JS, pas de dépendance native)

```
$2b$12$<salt_22chars><hash_31chars>
```

**Interdits :** MD5, SHA-1, SHA-256 seuls, bcrypt < 10.

### 3.4 Chiffrement disque

**Recommandation production :** Chiffrement du volume PostgreSQL et du répertoire `uploads/` au niveau OS/hyperviseur (LUKS sur Linux, chiffrement Oracle Cloud Block Volume).

---

## 4. Gestion des tokens JWT

**Access Token :**
- Algorithme : HS256 (HMAC-SHA256)
- Clé : `JWT_ACCESS_SECRET` (minimum 32 caractères)
- Durée de vie : 15 minutes (configurable `JWT_ACCESS_EXPIRES_IN`)
- Contenu : `{ sub: userId, role, email, iat, exp }`

**Refresh Token :**
- Algorithme : HS256
- Clé : `JWT_REFRESH_SECRET` (minimum 32 caractères — **doit différer de ACCESS_SECRET**)
- Durée de vie : 7 jours (configurable `JWT_REFRESH_EXPIRES_IN`)
- Stockage : Haché en base (`refreshTokenHash`) — jamais en clair

**Contraintes enforced au démarrage :**
- `JWT_ACCESS_SECRET !== JWT_REFRESH_SECRET` (vérification `validateEnv()`)
- En production : absence de "CHANGE_ME" dans les secrets
- `ADMIN_PASSWORD !== "ChangeMe!Admin123"` en production

---

## 5. Gestion des clés

### 5.1 Stockage des secrets

**Développement / CI :**
- Fichier `.env` local (non commité — `.gitignore`)
- Variables CI/CD injectées par le runner (GitLab CI, GitHub Actions secrets)

**Production recommandée :**
- **HashiCorp Vault** : intégration native via `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_PATH`
- Le serveur charge les secrets depuis Vault au démarrage si `VAULT_ADDR` est défini
- Fallback automatique sur les variables d'environnement OS si Vault absent

```bash
# Exemple Vault KV v2
vault kv put secret/data/kyc-aml \
  JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
  JWT_REFRESH_SECRET="$(openssl rand -base64 48)" \
  PII_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  MFA_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  WEBHOOK_SECRET="$(openssl rand -hex 32)"
```

### 5.2 Génération des clés

Toutes les clés de production doivent être générées avec un CSPRNG :

```bash
# JWT secrets (48 bytes → 64 chars base64)
openssl rand -base64 48

# Clés de chiffrement AES-256 (32 bytes)
openssl rand -base64 32

# Webhook secret (32 bytes hex)
openssl rand -hex 32
```

### 5.3 Politique de rotation

| Secret | Fréquence de rotation | Procédure |
|--------|----------------------|-----------|
| `JWT_ACCESS_SECRET` | Annuelle ou après incident | Rotation sans interruption si double-validation temporaire |
| `JWT_REFRESH_SECRET` | Annuelle ou après incident | Force re-login de tous les utilisateurs |
| `PII_ENCRYPTION_KEY` | Tous les 2 ans | Re-chiffrement de toutes les données PII (script de migration) |
| `MFA_ENCRYPTION_KEY` | Tous les 2 ans | Re-chiffrement de tous les seeds TOTP |
| `WEBHOOK_SECRET` | Après chaque incident | Coordination avec le CBS pour synchronisation |
| Certificats TLS | Annuelle (Let's Encrypt : 90j automatique) | Renouvellement automatique via certbot/acme |
| Mots de passe utilisateurs | Politique interne (90j recommandé) | Imposé via règle UI |

### 5.4 Procédure de rotation PII_ENCRYPTION_KEY

```bash
# 1. Générer la nouvelle clé
NEW_KEY=$(openssl rand -base64 32)

# 2. Lancer le script de re-chiffrement (maintenance)
PII_ENCRYPTION_KEY_OLD=$PII_ENCRYPTION_KEY \
PII_ENCRYPTION_KEY_NEW=$NEW_KEY \
pnpm run scripts/rotate-pii-key.ts

# 3. Vérifier l'intégrité (tous les enregistrements déchiffrables)
# 4. Mettre à jour la variable dans Vault/CI
# 5. Redémarrer le serveur avec la nouvelle clé
```

---

## 6. Secrets interdits en production

Les contrôles suivants sont enforced au démarrage (`validateEnv()`) :

- `JWT_ACCESS_SECRET` contenant "CHANGE_ME" → démarrage refusé
- `ADMIN_PASSWORD === "ChangeMe!Admin123"` → démarrage refusé
- `JWT_ACCESS_SECRET === JWT_REFRESH_SECRET` → démarrage refusé

**Recommandations supplémentaires (non enforced) :**
- `ML_INTERNAL_API_KEY !== "dev_ml_key_changeme"`
- `WEBHOOK_SECRET` ≥ 32 caractères (minimum 16 imposé)
- Aucun secret committé dans Git (pré-commit hook `git-secrets` recommandé)

---

## 7. Audit et conformité

### Références réglementaires
- **RGPD Art. 32** : mesures techniques appropriées incluant le chiffrement
- **PCI-DSS** : AES-256 requis pour les données de carte (hors périmètre direct mais standard de référence)
- **ISO 27001 A.10** : contrôles cryptographiques
- **BAM Circulaire 5/W/2023** : protection des données clients

### Contrôles périodiques
- Revue annuelle de cette politique par le RSSI
- Test de déchiffrement des sauvegardes (trimestriel)
- Audit des accès aux secrets Vault (mensuel)
- Scan des secrets dans le code source (`truffleHog`, `git-secrets`) — à chaque PR

---

*Document propriétaire — Ne pas distribuer en dehors de l'équipe de sécurité*
