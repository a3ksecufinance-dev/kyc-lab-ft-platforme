# Déploiement Railway — Guide complet (≈ 30 min)

> **Objectif** : Mettre en production la plateforme KYC-AML + simulateur CBS sur Railway
> pour une démo client accessible via une URL publique.

---

## Architecture déployée

```
Railway Project
├── Service "kyc-aml-app"    → Node.js + Express + React SPA
│     PORT=3000              → URL publique Railway
│     /              → Dashboard KYC-AML (login requis)
│     /cbs           → Simulateur CBS (public, auto-login démo)
├── Plugin PostgreSQL         → DATABASE_URL auto-injecté
└── Plugin Redis              → REDIS_URL auto-injecté
```

---

## ÉTAPE 1 — Préparer le dépôt GitHub

```bash
# Depuis votre répertoire local
cd /Users/msp/kyc-labftplat/kyc-lab-ft-platforme

# Créer le dépôt GitHub (remplacez par votre username)
gh repo create kyc-aml-demo --private --source=. --push

# Ou si vous avez déjà un remote :
git add -A && git commit -m "feat: CBS simulator + production build config"
git push
```

---

## ÉTAPE 2 — Créer le projet Railway

1. Aller sur **[railway.app](https://railway.app)** → Se connecter avec GitHub
2. Cliquer **"New Project"** → **"Deploy from GitHub repo"**
3. Sélectionner votre dépôt `kyc-aml-demo`
4. Railway détecte automatiquement Node.js et lit `railway.json`
5. **Ne pas encore déployer** — ajouter d'abord les plugins

---

## ÉTAPE 3 — Ajouter PostgreSQL et Redis

Dans le projet Railway :

### PostgreSQL
1. Cliquer **"+ New"** → **"Database"** → **"Add PostgreSQL"**
2. Le plugin crée `DATABASE_URL` automatiquement
3. Cliquer sur le plugin PostgreSQL → noter la **Public URL** pour l'étape 5

### Redis
1. Cliquer **"+ New"** → **"Database"** → **"Add Redis"**
2. Le plugin crée `REDIS_URL` et `REDIS_PASSWORD` automatiquement

---

## ÉTAPE 4 — Configurer les variables d'environnement

Dans le **service kyc-aml-app** → onglet **Variables** → **"Raw Editor"**

Copier-coller le contenu de `.env.railway` et **remplacer** :

```bash
# Générer les secrets (exécuter en local) :
openssl rand -hex 32   # pour JWT_ACCESS_SECRET
openssl rand -hex 32   # pour JWT_REFRESH_SECRET
openssl rand -hex 32   # pour PII_ENCRYPTION_KEY
openssl rand -hex 32   # pour MFA_ENCRYPTION_KEY
openssl rand -hex 32   # pour WEBHOOK_SECRET
```

**Variables obligatoires à renseigner :**

| Variable | Valeur |
|----------|--------|
| `JWT_ACCESS_SECRET` | `<openssl rand -hex 32>` |
| `JWT_REFRESH_SECRET` | `<openssl rand -hex 32>` |
| `PII_ENCRYPTION_KEY` | `<openssl rand -hex 16>` |
| `MFA_ENCRYPTION_KEY` | `<openssl rand -hex 32>` |
| `WEBHOOK_SECRET` | `<openssl rand -hex 32>` |
| `INSTITUTION_TYPE` | `PAYMENT_INSTITUTION` |
| `CORS_ORIGINS` | `*` |
| `NODE_ENV` | `production` |

> `DATABASE_URL` et `REDIS_URL` sont **auto-injectées** par les plugins — ne pas les saisir manuellement.

---

## ÉTAPE 5 — Initialiser la base de données

Une fois le premier déploiement terminé (5-10 min), ouvrir le **Shell Railway** :

```
Railway project → service kyc-aml-app → onglet "Shell"
```

Ou via CLI Railway :
```bash
# Installer Railway CLI (si pas déjà fait)
brew install railway    # macOS
# ou : npm install -g @railway/cli

# Connexion
railway login

# Shell interactif sur le service déployé
railway run --service kyc-aml-app bash
```

Dans le shell Railway, exécuter :

```bash
# 1. Créer les tables (schéma Drizzle)
pnpm db:push

# 2. Injecter les données de démonstration
pnpm db:seed:demo

# 3. Vérifier
echo "✅ Base initialisée"
```

> **Alternative locale** : Si Railway CLI est configuré avec les env vars Railway :
> ```bash
> railway run pnpm db:setup
> ```

---

## ÉTAPE 6 — Initialiser les règles AML et les listes de sanctions

Se connecter à la plateforme avec le compte admin, puis :

### Via l'interface
1. **Admin → onglet ML & Règles** → cliquer "Règles AML par défaut"
   → Injecte les 11 règles BAM

2. **Screening → onglet Listes** → cliquer "Forcer le téléchargement"
   → Télécharge OFAC, EU, UN, PEP (30-60s)

### Via API (optionnel)
```bash
# Récupérer un token admin
TOKEN=$(curl -s https://VOTRE-URL.railway.app/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{"json":{"email":"admin@votre-banque.ma","password":"AdminDemo2026!"}}' \
  | jq -r '.result.data.json.tokens.accessToken')

# Seed règles AML
curl -s https://VOTRE-URL.railway.app/trpc/amlRules.seedDefaults \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{}}'

# Force refresh listes screening
curl -s https://VOTRE-URL.railway.app/trpc/screening.forceRefresh \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{}}'
```

---

## ÉTAPE 7 — Vérifier le déploiement

```bash
# Health check
curl https://VOTRE-URL.railway.app/health

# Réponse attendue :
# {"status":"healthy","services":{"database":{"status":"healthy"},"redis":{"status":"healthy"}}}
```

---

## URLs de démonstration

| URL | Description | Credentials |
|-----|-------------|-------------|
| `https://VOTRE-URL.railway.app/cbs` | **Simulateur CBS** — Point d'entrée démo client | Auto-login |
| `https://VOTRE-URL.railway.app/` | Plateforme KYC-AML conformité | Voir ci-dessous |

### Comptes utilisateurs (créés par seed.demo.ts)

| Email | Mot de passe | Rôle |
|-------|-------------|------|
| `demo@banque.ma` | `Demo2026!` | Analyst (utilisé par le CBS) |
| `analyste@labft.ma` | `Analyst2026!` | Analyst |
| `superviseur@labft.ma` | `Superv2026!` | Supervisor |
| `compliance@labft.ma` | `Compli2026!` | Compliance Officer |
| `admin@labft.ma` | `Admin2026!LabFT` | Admin |

---

## Domaine personnalisé (optionnel)

Dans Railway → service → **Settings → Domains** :
1. Cliquer "Generate Domain" → obtenir `kyc-aml-XXXX.up.railway.app`
2. Ou ajouter un domaine custom : `kyc-lab.votre-banque.ma`
   - Ajouter un CNAME `kyc-lab` → `kyc-aml-XXXX.up.railway.app`
   - Railway gère le SSL automatiquement (Let's Encrypt)

---

## Scénario de démo — Parcours client bout en bout

### Acte 1 — Entrée en relation (CBS)
**URL** : `/cbs` — Présentez cela comme "le système CBS de la banque"

1. **Étape 1 — Identification** :
   - Nom : `Rachid BENALI`
   - CIN : `BE678901`
   - DDN : `1985-03-15`
   - Téléphone : `+212661234567`

2. **Étape 2 — Produit** :
   - Sélectionner `Portefeuille mobile — Orange Money`
   - Dépôt initial : `150000` MAD ← déclenche une alerte AML !
   - Motif : `Activité professionnelle`

3. **Étape 3 — Compléments** :
   - Adresse : `45 Rue Hassan II`
   - Ville : `Casablanca`
   - Profession : `Entrepreneur / Commerçant`
   - Source : `Activité commerciale`
   - Revenu mensuel : `25000`

4. **Étape 4 — Transmission** :
   - Cocher l'attestation
   - Cliquer **"TRANSMETTRE AU SERVICE CONFORMITÉ"**
   - → Le système AML analyse la transaction en temps réel
   - → Alerte générée (150 000 MAD > seuil BAM)
   - → Bouton **"Ouvrir dans la Plateforme Conformité"**

### Acte 2 — Traitement par le service conformité (KYC-AML)
**URL** : `/` — Connectez-vous en tant que compliance@labft.ma

5. **Tableau de bord** : montrer les KPIs — nouvelle alerte visible
6. **Client créé** : `/customers/:id` — KYC PENDING, score risque calculé
7. **Alertes** : alerte THRESHOLD générée automatiquement
8. **Screening** : lancer un screening sanctions → montrer CLEAR ou REVIEW
9. **Dossier** : créer un dossier d'investigation lié au client
10. **Rapport** : créer un SAR → workflow DRAFT → REVIEW → SUBMITTED
11. **Transmission** : simuler la transmission GoAML à l'ANRF

---

## Tarification Railway

| Plan | Prix | Inclus |
|------|------|--------|
| **Hobby** | $5/mois | 512MB RAM, PostgreSQL + Redis inclus |
| **Pro** | $20/mois | 8GB RAM, scaling automatique |

> Pour une démo d'une journée : le plan Hobby ($5) est suffisant.
> Railway offre $5 de crédit gratuit pour les nouveaux comptes.

---

## Rollback & troubleshooting

```bash
# Voir les logs en temps réel
railway logs --service kyc-aml-app

# Erreur "Cannot find module" → rebuild
railway up --service kyc-aml-app

# Erreur DB → vérifier DATABASE_URL
railway variables --service kyc-aml-app | grep DATABASE_URL

# Reset complet des données (ATTENTION — irréversible)
railway run --service kyc-aml-app -- pnpm tsx drizzle/seed.demo.ts --reset
```

---

*KYC-AML Lab Platform v2.5 — Déploiement Railway — Avril 2026*
