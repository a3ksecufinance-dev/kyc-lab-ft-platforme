# Plan de Continuité d'Activité (PCA) & Plan de Reprise après Sinistre (PRA)

**Plateforme :** KYC-AML Platform v2.5.0
**Version :** 1.0
**Date :** Mars 2026
**Propriétaire :** RSSI / DSI
**Classification :** CONFIDENTIEL

---

## 1. Objectifs et Niveaux de Service

### 1.1 Définitions

| Indicateur | Définition |
|------------|------------|
| **RTO** (Recovery Time Objective) | Durée maximale d'interruption acceptable |
| **RPO** (Recovery Point Objective) | Perte de données maximale acceptable |
| **MTTR** | Temps moyen de restauration |
| **MTBF** | Temps moyen entre deux incidents |

### 1.2 Objectifs par niveau de service

| Tier | Services | RTO | RPO |
|------|----------|-----|-----|
| **Critique** | API tRPC, authentification, webhook CBS | **4 heures** | **1 heure** |
| **Important** | Module AML, alertes, screening | **8 heures** | **4 heures** |
| **Standard** | Reporting, back-office admin, ML | **24 heures** | **8 heures** |
| **Marginal** | Métriques Prometheus, logs historiques | **72 heures** | **24 heures** |

---

## 2. Architecture de Continuité

### 2.1 Topologie de référence (Production)

```
Internet
    │
[CDN / WAF]
    │
[Load Balancer]
    ├─── [Node 1 — Serveur Principal]
    │         ├── kyc_server (API)
    │         ├── kyc_frontend (Nginx)
    │         └── kyc_ml (Python)
    └─── [Node 2 — Réplica chaud] ← Bascule automatique < 30s
          ├── kyc_server (standby)
          └── kyc_frontend (standby)

[PostgreSQL Primary] ←→ [PostgreSQL Replica] ← Streaming replication
[Redis Primary]      ←→ [Redis Replica]       ← Redis Sentinel
[S3 MinIO / Object Storage] ← Multi-zone
```

### 2.2 Stratégie de sauvegarde

| Composant | Fréquence | Rétention | Méthode |
|-----------|-----------|-----------|---------|
| Base de données PostgreSQL | Toutes les heures | 30 jours | `pg_dump` + upload S3 chiffré |
| Sauvegardes complètes DB | Quotidienne (02:00 UTC) | 90 jours | Snapshot RDS ou `pg_basebackup` |
| Fichiers documents (uploads) | Continue | 10 ans (RGPD) | Réplication S3 cross-region |
| Configuration serveur | À chaque déploiement | Durée indéfinie | Git + CI/CD |
| Secrets/Vault | Hebdomadaire | 1 an | Export chiffré Vault |
| Logs applicatifs | Continue | 1 an (RGPD AML) | Agrégation centralisée (ELK/Loki) |

---

## 3. Scénarios et Procédures de Reprise

### Scénario 1 — Panne Serveur API (RTO : 4h)

**Déclencheur :** Serveur principal inaccessible > 5 minutes (health check `/health` en échec)

**Procédure :**

```bash
# Étape 1 : Vérification de l'état (5 min)
docker ps -a | grep kyc_server
docker logs kyc_server --tail 100
curl -f http://localhost:3000/health || echo "SERVEUR KO"

# Étape 2 : Tentative de redémarrage (5 min)
docker compose restart kyc_server
sleep 30
curl -f http://localhost:3000/health && echo "REPRISE OK" && exit 0

# Étape 3 : Redémarrage complet de la stack (10 min)
docker compose down
docker compose up -d
sleep 60
curl -f http://localhost:3000/health

# Étape 4 : Bascule vers Node 2 si Node 1 KO (15 min)
# Mettre à jour le Load Balancer pour pointer vers Node 2
# Notifier l'équipe (PagerDuty / astreinte)
```

**Escalade :** Si RTO > 30min → Activer PRA complet.

---

### Scénario 2 — Panne Base de Données PostgreSQL (RTO : 4h, RPO : 1h)

**Déclencheur :** Health check DB en échec dans `/health`, erreur `ECONNREFUSED` dans les logs

**Procédure :**

```bash
# Étape 1 : Diagnostic (10 min)
docker ps | grep kyc_db
docker logs kyc_db --tail 100
psql $DATABASE_URL -c "SELECT 1;" || echo "DB INACCESSIBLE"

# Étape 2 : Tentative de redémarrage PostgreSQL (5 min)
docker compose restart kyc_db
sleep 30

# Étape 3 : Vérification intégrité
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM aml_alerts;"

# Étape 4 : Bascule vers réplica (si disponible) — 20 min
# Promouvoir le réplica en primaire
pg_ctl promote -D /var/lib/postgresql/data
# Mettre à jour DATABASE_URL → pointer vers réplica promu
# Redémarrer kyc_server avec nouvelle URL

# Étape 5 : Restauration depuis sauvegarde (si réplica absent)
# Durée estimée : 30–90 min selon taille DB
./scripts/restore-db.sh --backup <TIMESTAMP>
```

**Script de restauration :**
```bash
#!/bin/bash
# scripts/restore-db.sh
BACKUP_FILE=$1
echo "Restauration depuis $BACKUP_FILE..."

# Arrêt de l'API
docker compose stop kyc_server

# Restauration
pg_restore --clean --no-owner \
  --dbname=$DATABASE_URL \
  $BACKUP_FILE

# Vérification
psql $DATABASE_URL -c "SELECT COUNT(*) FROM customers;"

# Redémarrage
docker compose start kyc_server
echo "Restauration terminée. Vérifier l'état: curl /health"
```

---

### Scénario 3 — Panne Redis (RTO : 8h)

**Impact :** Rate limiting inopérant, sessions potentiellement affectées, scheduleurs en pause.

**Procédure :**

```bash
# Étape 1 : Vérification
redis-cli -u $REDIS_URL ping || echo "REDIS KO"

# Étape 2 : Redémarrage
docker compose restart kyc_redis

# Étape 3 : Si Redis persistant KO → Mode dégradé
# Le serveur continue à fonctionner sans rate limiting
# Les scheduleurs (screening, pKYC, ML) reprennent au prochain cron
# Les refresh tokens en mémoire Redis sont perdus → les utilisateurs doivent se reconnecter

# Étape 4 : Reconstruction du cache (automatique au redémarrage)
```

**Mode dégradé acceptable :** Oui (API reste fonctionnelle sans Redis, avec rate limiting désactivé).

---

### Scénario 4 — Perte du Stockage Documents S3/MinIO (RTO : 24h)

**Impact :** Documents inaccessibles, uploads bloqués.

**Procédure :**

```bash
# Étape 1 : Basculer sur stockage local temporaire
# Dans .env : STORAGE_BACKEND=local
docker compose restart kyc_server

# Étape 2 : Restaurer le bucket S3 depuis réplique cross-region
aws s3 sync s3://kyc-backup-region s3://kyc-primary-region

# Étape 3 : Rebasculer vers S3
# Dans .env : STORAGE_BACKEND=s3
docker compose restart kyc_server

# Étape 4 : Vérifier l'accessibilité des documents récents
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/trpc/documents.list?input={}"
```

---

### Scénario 5 — Compromission de Sécurité / Incident Majeur (RTO : 4h)

**Déclencheur :** Accès non autorisé détecté, exfiltration de données suspectée, ransomware.

**Procédure d'urgence :**

```bash
# Étape 1 : ISOLATION IMMÉDIATE (< 5 min)
# Bloquer tout le trafic entrant
iptables -I INPUT -j DROP
# OU via Load Balancer : retirer tous les backends

# Étape 2 : Préservation des preuves
docker logs kyc_server > /forensics/server_$(date +%Y%m%d_%H%M%S).log
docker logs kyc_db > /forensics/db_$(date +%Y%m%d_%H%M%S).log
pg_dump $DATABASE_URL | gzip > /forensics/db_snapshot_$(date +%Y%m%d_%H%M%S).sql.gz

# Étape 3 : Notification (voir Incident Response)
# - RSSI < 1h
# - DPO < 4h (si données personnelles impliquées)
# - CNIL < 72h (si violation RGPD — voir INCIDENT_RESPONSE.md)

# Étape 4 : Rotation de TOUS les secrets
./scripts/rotate-all-secrets.sh

# Étape 5 : Reconstruction depuis image propre
docker compose down --volumes
git checkout <dernière_version_saine>
docker compose up -d --force-recreate

# Étape 6 : Restauration données depuis sauvegarde vérifiée
./scripts/restore-db.sh --backup <TIMESTAMP_AVANT_INCIDENT>
```

---

## 4. Tests du Plan de Reprise

### 4.1 Programme de tests

| Test | Fréquence | Responsable | Durée |
|------|-----------|-------------|-------|
| Test de restauration DB (non-prod) | Mensuel | DevOps | 2h |
| Simulation panne Redis | Trimestriel | DevOps | 30min |
| Exercice bascule Node 1 → Node 2 | Semestriel | DSI | 4h |
| PRA complet (simulation sinistre) | Annuel | RSSI + DSI | 1 jour |

### 4.2 Checklist de test mensuel (restauration DB)

```
□ Sélectionner une sauvegarde de J-2
□ Déployer sur environnement de test isolé
□ Vérifier l'intégrité : COUNT(*) sur tables principales
□ Tester l'authentification (login admin)
□ Vérifier les alertes AML des 48h précédentes
□ Mesurer le temps de restauration (objectif < 90 min)
□ Documenter le résultat dans le registre des tests
□ Comparer RPO effectif vs RPO cible (1h)
```

---

## 5. Communication de Crise

### 5.1 Arbre de contact

| Rôle | Contact | Délai max |
|------|---------|-----------|
| Astreinte DevOps | PagerDuty / Slack #incidents | Automatique |
| RSSI | Téléphone direct | < 30 min |
| DSI | Téléphone direct | < 1h |
| DPO | Email + téléphone | < 4h (si données personnelles) |
| Direction | Email + téléphone | < 2h (si Tier Critique) |
| CBS partenaires | Contact dédié | < 2h (si webhook impacté) |

### 5.2 Page de statut

En cas d'incident, publier des mises à jour sur la page de statut :
- Interne : canal Slack `#platform-status`
- Externe : page status.kyc-aml.io (Statuspage.io ou Uptime Robot)

---

## 6. Retour à la Normale (RACI)

| Étape | Responsable | Acteur | Consulté |
|-------|-------------|--------|----------|
| Détection et premier diagnostic | DevOps (astreinte) | Monitoring automatique | RSSI |
| Décision d'activation PRA | DSI | RSSI | Direction |
| Exécution des procédures | DevOps | DSI | — |
| Validation avant remise en production | RSSI + DSI | — | Compliance |
| Communication externe | Direction | DPO | Juridique |
| Post-mortem et amélioration | RSSI | DevOps + Dev | Toute l'équipe |

---

## 7. Post-Mortem

Tout incident de niveau Critique ou Important doit faire l'objet d'un post-mortem dans les 5 jours ouvrables :

**Template :**
```
## Post-Mortem — Incident [ID] — [Date]

### Résumé (5 lignes max)
### Chronologie
### Cause racine (root cause)
### Impact mesurable (durée, données, utilisateurs)
### Actions correctives (avec responsable et date)
### Indicateurs de succès des corrections
```

Stocker dans `docs/incidents/` (non commité si données sensibles).

---

*Dernière révision : Mars 2026*
*Prochaine revue : Septembre 2026*
*Approbation : RSSI + DSI*
