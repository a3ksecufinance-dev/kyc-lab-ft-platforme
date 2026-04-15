# Guide de mise à jour — GitHub → OCI VM
## KYC-AML Platform v2.5+

> **Audience :** Administrateur système / DevOps
> **Prérequis :** Accès SSH à la VM OCI + droits `opc`
> **Durée estimée :** 10–20 minutes (hors build Docker)

---

## Table des matières

1. [Préparation — une seule fois](#1-préparation--une-seule-fois)
2. [Procédure de mise à jour standard](#2-procédure-de-mise-à-jour-standard)
3. [Option A — Déploiement direct sur la VM (sans Docker)](#option-a--déploiement-direct-sur-la-vm-sans-docker)
4. [Option B — Build local → OCIR → VM (avec Docker)](#option-b--build-local--ocir--vm-avec-docker)
5. [Mise à jour de la base de données](#5-mise-à-jour-de-la-base-de-données)
6. [Vérification post-déploiement](#6-vérification-post-déploiement)
7. [Rollback](#7-rollback)
8. [Checklist de mise à jour](#8-checklist-de-mise-à-jour)

---

## 1. Préparation — une seule fois

Ces étapes ne sont à réaliser qu'une seule fois lors de la configuration initiale.

### 1.1 Configurer la clé SSH pour GitHub sur la VM

```bash
# Connexion à la VM OCI
ssh opc@<IP_PUBLIQUE_VM>

# Générer une clé SSH dédiée au déploiement
ssh-keygen -t ed25519 -C "deploy-kyc-aml@oci" -f ~/.ssh/github_deploy -N ""

# Afficher la clé publique → à ajouter dans GitHub
cat ~/.ssh/github_deploy.pub
```

Sur GitHub :
1. Ouvrir le repo → **Settings** → **Deploy keys** → **Add deploy key**
2. Titre : `OCI VM Production`
3. Coller la clé publique
4. **Allow write access** : NON (lecture seule suffit pour déployer)

Configurer SSH pour utiliser cette clé avec GitHub :

```bash
cat >> ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  StrictHostKeyChecking no
EOF
chmod 600 ~/.ssh/config
```

Tester la connexion :

```bash
ssh -T git@github.com
# Hi <repo>! You've successfully authenticated...
```

### 1.2 Cloner le repo sur la VM (première fois)

```bash
# Répertoire de déploiement
sudo mkdir -p /opt/kyc-aml
sudo chown opc:opc /opt/kyc-aml
cd /opt/kyc-aml

# Cloner via SSH
git clone git@github.com:<votre-org>/<votre-repo>.git .

# Copier le fichier .env de production
cp /opt/kyc-aml/.env.backup .env   # ou créer manuellement
```

### 1.3 Installer Node.js et pnpm sur la VM

```bash
# Node.js 20 LTS
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# pnpm
sudo npm install -g pnpm@10.4.1
pnpm --version   # doit afficher 10.4.1
```

---

## 2. Procédure de mise à jour standard

Chaque mise à jour suit ces étapes dans l'ordre :

```
1. git pull          → récupérer les nouveaux développements
2. pnpm install      → installer les nouvelles dépendances
3. pnpm db:push      → appliquer les migrations de base de données
4. pnpm build        → reconstruire l'application
5. redémarrer        → relancer le service
6. vérifier          → health check + test de connexion
```

> ⚠️ **Ordre critique :** toujours appliquer les migrations (`db:push`) AVANT de redémarrer
> l'application avec le nouveau code. L'inverse peut provoquer des erreurs au démarrage.

---

## Option A — Déploiement direct sur la VM (sans Docker)

Approche recommandée pour les environnements simples (une seule VM).

### Étape 1 — Se connecter à la VM

```bash
ssh opc@<IP_PUBLIQUE_VM>
cd /opt/kyc-aml
```

### Étape 2 — Récupérer les mises à jour GitHub

```bash
# Vérifier l'état avant de tirer
git status
git log --oneline -5

# Tirer les derniers commits
git pull origin main

# Vérifier ce qui a changé
git log --oneline -5
git diff HEAD@{1} HEAD --stat
```

### Étape 3 — Installer les nouvelles dépendances

```bash
# Vérifier si package.json a changé
git diff HEAD@{1} HEAD -- package.json

# Installer les dépendances (si package.json a changé ou en cas de doute)
pnpm install --frozen-lockfile
```

### Étape 4 — Appliquer les migrations de base de données

```bash
# Vérifier si le schéma a changé
git diff HEAD@{1} HEAD -- drizzle/

# Toujours appliquer avant de redémarrer (idempotent, sans risque)
pnpm db:push
```

> En cas de nouveaux champs (ex : colonnes MFA, colonnes PII) — cette commande les crée
> sans toucher aux données existantes.

### Étape 5 — Reconstruire l'application

```bash
pnpm build
# → dist/index.js       (serveur)
# → dist/client/        (frontend React)
```

### Étape 6 — Redémarrer le service

**Si vous utilisez systemd :**

```bash
sudo systemctl restart kyc-aml
sudo systemctl status kyc-aml

# Suivre les logs en temps réel
sudo journalctl -u kyc-aml -f
```

Fichier unit systemd (`/etc/systemd/system/kyc-aml.service`) :

```ini
[Unit]
Description=KYC-AML Platform
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/opt/kyc-aml
EnvironmentFile=/opt/kyc-aml/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Activer et démarrer pour la première fois :

```bash
sudo systemctl daemon-reload
sudo systemctl enable kyc-aml
sudo systemctl start kyc-aml
```

**Si vous utilisez PM2 :**

```bash
pm2 restart kyc-aml
pm2 logs kyc-aml --lines 50
```

---

## Option B — Build local → OCIR → VM (avec Docker)

Approche recommandée pour les environnements multi-VM ou CI/CD.

### Sur votre poste local (ou serveur CI)

```bash
# Depuis le répertoire du projet
cd /chemin/vers/kyc-lab-ft-platforme

# Tirer les dernières modifications
git pull origin main

# S'authentifier à OCIR
docker login <region>.ocir.io \
  -u '<namespace>/oracleidentitycloudservice/<email>'
# Mot de passe = Auth Token OCI (IAM → Users → Auth Tokens)

# Déterminer le numéro de version
VERSION=$(git describe --tags --always --dirty)
# Ou manuellement : VERSION=v2.6.0

# Construire l'image Docker
docker build -t <region>.ocir.io/<namespace>/kyc-aml:${VERSION} .
docker tag     <region>.ocir.io/<namespace>/kyc-aml:${VERSION} \
               <region>.ocir.io/<namespace>/kyc-aml:latest

# Pousser vers OCIR
docker push <region>.ocir.io/<namespace>/kyc-aml:${VERSION}
docker push <region>.ocir.io/<namespace>/kyc-aml:latest

echo "Image poussée : ${VERSION}"
```

### Sur la VM OCI

```bash
ssh opc@<IP_PUBLIQUE_VM>

# Authentification OCIR (si token expiré)
docker login <region>.ocir.io \
  -u '<namespace>/oracleidentitycloudservice/<email>'

# Tirer la nouvelle image
docker pull <region>.ocir.io/<namespace>/kyc-aml:latest

# Appliquer les migrations AVANT de redémarrer
docker run --rm \
  --env-file /opt/kyc-aml/.env \
  <region>.ocir.io/<namespace>/kyc-aml:latest \
  sh -c "DATABASE_URL=$DATABASE_URL pnpm db:push"

# Sauvegarder le nom de l'ancienne image (pour rollback)
OLD_IMAGE=$(docker inspect kyc-aml --format='{{.Config.Image}}' 2>/dev/null || echo "none")
echo "Ancienne image : ${OLD_IMAGE}"

# Arrêter et remplacer le conteneur
docker stop kyc-aml && docker rm kyc-aml

docker run -d \
  --name kyc-aml \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file /opt/kyc-aml/.env \
  <region>.ocir.io/<namespace>/kyc-aml:latest

# Vérification immédiate
sleep 3
curl -s http://localhost:3000/api/health
```

---

## 5. Mise à jour de la base de données

### Cas 1 — Nouvelles colonnes / tables (le plus courant)

```bash
# Idempotent — ne supprime jamais de données
pnpm db:push
```

### Cas 2 — Nouvelles données de référence (seeds)

```bash
# Seulement si le changelog mentionne de nouvelles données seed
pnpm db:seed
```

### Cas 3 — Migration PII (nouveau chiffrement)

Si `PII_ENCRYPTION_KEY` a changé entre deux versions :

```bash
# Vérifier si des données PII existent en clair
pnpm pii:migrate:dry

# Migrer les données en clair vers le chiffrement
pnpm pii:migrate

# OU rotation de clé (ancienne clé connue)
pnpm pii:rekey:dry -- --old-key=<ancienne-clé-hex>
pnpm pii:rekey    -- --old-key=<ancienne-clé-hex>
```

> ⚠️ Ne jamais changer `PII_ENCRYPTION_KEY` sans avoir effectué la rotation préalablement.
> Les données chiffrées avec l'ancienne clé deviendraient illisibles.

### Vérifier les migrations appliquées

```bash
# Lister les tables existantes en production
psql "$DATABASE_URL" -c "\dt"

# Comparer avec le schéma attendu
psql "$DATABASE_URL" -c "\d customers"
psql "$DATABASE_URL" -c "\d users"
```

---

## 6. Vérification post-déploiement

### Health check de base

```bash
# Depuis la VM
curl -s http://localhost:3000/api/health | jq .
# Attendu :
# {
#   "status": "ok",
#   "db": "connected",
#   "redis": "connected"
# }

# Depuis l'extérieur
curl -s https://kyc.votre-domaine.ma/api/health | jq .
```

### Test de connexion admin

```bash
curl -s -X POST https://kyc.votre-domaine.ma/api/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{"json":{"email":"admin@votre-domaine.ma","password":"<mot-de-passe>"}}' \
  | jq .result.data.json.user.role
# Attendu : "admin"
```

### Vérification des logs au démarrage

```bash
# systemd
sudo journalctl -u kyc-aml --since "2 minutes ago"

# Docker
docker logs kyc-aml --tail 50

# PM2
pm2 logs kyc-aml --lines 50
```

Lignes attendues au démarrage :
```
{"level":"info","msg":"Database connected","pool":"5"}
{"level":"info","msg":"Redis connected"}
{"level":"info","msg":"Server listening","port":3000}
```

### Vérification de la version déployée

```bash
# Option A — depuis l'application
curl -s https://kyc.votre-domaine.ma/api/health | jq .version

# Option B — depuis git
cd /opt/kyc-aml
git log --oneline -1
```

---

## 7. Rollback

### Option A — Retour à la version précédente (git)

```bash
ssh opc@<IP_PUBLIQUE_VM>
cd /opt/kyc-aml

# Identifier le commit précédent
git log --oneline -5

# Retour en arrière
git checkout <hash-du-commit-précédent>

# Reconstruire et redémarrer
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart kyc-aml
```

> ⚠️ Si des migrations ont été appliquées, le rollback de schéma doit être fait manuellement
> (Drizzle ne gère pas les migrations down). Préférez avancer vers un correctif plutôt que
> de reculer le schéma.

### Option B — Retour à l'image Docker précédente

```bash
ssh opc@<IP_PUBLIQUE_VM>

# Lister les images disponibles localement
docker images | grep kyc-aml

# Redémarrer avec l'image précédente
docker stop kyc-aml && docker rm kyc-aml

docker run -d \
  --name kyc-aml \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file /opt/kyc-aml/.env \
  <region>.ocir.io/<namespace>/kyc-aml:<version-précédente>

curl -s http://localhost:3000/api/health
```

### Option C — Restauration base de données (dernier recours)

Si une migration a corrompu des données :

```bash
# 1. Arrêter l'application
sudo systemctl stop kyc-aml

# 2. Identifier la sauvegarde avant mise à jour
ls -la /opt/kyc-aml/backups/   # ou votre emplacement Object Storage

# 3. Restaurer (⚠️ irréversible — efface les données depuis la sauvegarde)
psql "$DATABASE_URL" < backup_pre_update.sql

# 4. Redémarrer avec l'ancienne version du code
sudo systemctl start kyc-aml
```

---

## 8. Checklist de mise à jour

Cocher chaque étape avant de valider la mise à jour en production.

### Avant la mise à jour

```
[ ] Sauvegarde base de données réalisée (pg_dump)
[ ] Numéro de version/commit actuel noté (git log --oneline -1)
[ ] Fenêtre de maintenance communiquée aux utilisateurs (si interruption)
[ ] Changelog relu — nouvelles variables d'environnement identifiées
[ ] Nouvelles variables d'environnement ajoutées dans /opt/kyc-aml/.env
```

### Pendant la mise à jour

```
[ ] git pull réussi (0 conflits)
[ ] pnpm install réussi (0 erreurs)
[ ] pnpm db:push réussi (migrations appliquées)
[ ] pnpm build réussi (0 erreurs TypeScript / Vite)
[ ] Service redémarré
```

### Après la mise à jour

```
[ ] /api/health → {"status":"ok","db":"connected","redis":"connected"}
[ ] Connexion admin réussie
[ ] MFA fonctionnel
[ ] Screening sanctions : test client → résultat CLEAR
[ ] Logs : aucune erreur FATAL au démarrage
[ ] Monitoring : pas d'alerte CPU/RAM anormale
```

---

## Référence rapide — commandes courantes

```bash
# Connexion VM
ssh opc@<IP>

# Mise à jour complète (Option A)
cd /opt/kyc-aml && git pull && pnpm install --frozen-lockfile && pnpm db:push && pnpm build && sudo systemctl restart kyc-aml

# Statut service
sudo systemctl status kyc-aml

# Logs en temps réel
sudo journalctl -u kyc-aml -f

# Health check
curl -s http://localhost:3000/api/health | jq .

# Version déployée
git log --oneline -1
```
