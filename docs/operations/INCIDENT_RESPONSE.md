# Plan de Réponse aux Incidents de Sécurité

**Plateforme :** KYC-AML Platform v2.5.0
**Version :** 1.0
**Date :** Mars 2026
**Propriétaire :** RSSI
**Classification :** CONFIDENTIEL

---

## 1. Objectifs

Ce document définit les procédures de détection, qualification, containment, éradication et communication pour les incidents de sécurité affectant la plateforme KYC-AML. Il est conforme aux exigences :
- **RGPD Art. 33** : Notification à la CNIL dans les 72 heures
- **RGPD Art. 34** : Communication aux personnes concernées
- **DORA** (en préparation) : Reporting incidents TIC aux superviseurs financiers
- **BAM Circulaire** : Notification des incidents opérationnels significatifs

---

## 2. Classification des Incidents

### Niveaux de sévérité

| Niveau | Critères | Exemples |
|--------|----------|---------|
| **P1 — Critique** | Impact immédiat sur les données personnelles OU service totalement indisponible OU compromission active | Exfiltration DB, ransomware, accès non autorisé confirmé, panne totale > 4h |
| **P2 — Majeur** | Impact partiel sur les services OU risque potentiel de violation de données | Service AML dégradé, tentative d'intrusion détectée, fuite de logs |
| **P3 — Modéré** | Dysfonctionnement sans impact sécurité | Bug critique en prod, performance dégradée, erreur de configuration |
| **P4 — Mineur** | Anomalie avec impact limité | Erreur isolée, alerte de monitoring spurious |

---

## 3. Équipe de Réponse aux Incidents (IRT)

| Rôle | Responsabilité |
|------|----------------|
| **RSSI** (Incident Commander) | Coordination globale, décisions d'escalade |
| **DevOps Lead** | Diagnostic technique, containment, restauration |
| **DPO** | Qualification RGPD, rédaction notifications CNIL |
| **DSI** | Ressources, communication direction |
| **Juridique** | Conseils légaux, contacts régulateurs |
| **Communication** | Messages externes si nécessaire |

---

## 4. Procédure Générale

### Phase 1 : DÉTECTION (0–30 min)

**Sources de détection :**
- Alertes Prometheus / monitoring automatique
- Rapport d'un utilisateur ou d'un client
- Analyse des logs Pino (`/health` en échec, erreurs 500 répétées)
- Scan automatique (IDS, WAF)
- Notification tiers (CERT, provider cloud)

**Actions immédiates :**
```bash
# 1. Collecter les premiers indicateurs
docker logs kyc_server --since 1h 2>&1 | grep -E "ERROR|FATAL|panic"
curl -s http://localhost:3000/health | jq .
tail -100 /var/log/nginx/error.log

# 2. Créer un ticket d'incident
# INC-YYYYMMDD-NNN — Titre court

# 3. Notifier le RSSI (< 30 min si P1/P2)
```

### Phase 2 : QUALIFICATION (30 min – 2h)

**Questions de qualification :**
1. Y a-t-il eu accès non autorisé à des données personnelles ?
2. Y a-t-il eu exfiltration ou modification de données ?
3. Quel est le périmètre affecté (quels clients, quelles données) ?
4. L'incident est-il toujours actif ?
5. Quelle est la cause probable ?

**Décision RGPD :**
- Si violation de données personnelles probable → **DPO à notifier dans les 4h**
- Si violation confirmée → **Notification CNIL sous 72h** (voir Section 6)

### Phase 3 : CONTAINMENT (immédiat après qualification)

```bash
# Option A : Isolation applicative (service maintenu partiellement)
# Bloquer les endpoints affectés au niveau Nginx
location /trpc/admin {
    deny all;
    return 403;
}

# Option B : Mode maintenance
# Retourner 503 sur toutes les routes
echo "MAINTENANCE_MODE=true" >> .env
docker compose restart kyc_server

# Option C : Isolation réseau complète (P1 uniquement)
iptables -I INPUT -p tcp --dport 443 -j DROP
# OU : retirer du Load Balancer
```

### Phase 4 : INVESTIGATION

```bash
# Extraction des preuves (AVANT modification)
INCIDENT_DIR="/forensics/INC-$(date +%Y%m%d)"
mkdir -p $INCIDENT_DIR

# Logs serveur
docker logs kyc_server > $INCIDENT_DIR/server.log
docker logs kyc_db > $INCIDENT_DIR/db.log
docker logs kyc_redis > $INCIDENT_DIR/redis.log

# Snapshot de la base (état actuel)
pg_dump $DATABASE_URL | gzip > $INCIDENT_DIR/db_snapshot.sql.gz

# Logs d'audit KYC-AML (table auditLogs)
psql $DATABASE_URL -c \
  "COPY (SELECT * FROM audit_logs WHERE created_at > NOW() - INTERVAL '48 hours' ORDER BY created_at DESC) TO STDOUT CSV HEADER" \
  > $INCIDENT_DIR/audit_logs_48h.csv

# Connexions actives
psql $DATABASE_URL -c \
  "SELECT pid, usename, client_addr, state, query_start, query FROM pg_stat_activity;" \
  > $INCIDENT_DIR/db_connections.txt

# Tokens JWT actifs (sessions en cours)
redis-cli -u $REDIS_URL KEYS "session:*" > $INCIDENT_DIR/redis_sessions.txt
```

### Phase 5 : ÉRADICATION

```bash
# 1. Révoquer tous les tokens JWT (forcer re-login)
redis-cli -u $REDIS_URL FLUSHDB
# OU cibler les sessions suspectes :
redis-cli -u $REDIS_URL DEL "session:<userId>"

# 2. Changer les mots de passe compromis
# (Via admin.resetPassword tRPC ou directement en DB)

# 3. Rotation des secrets compromis
./scripts/rotate-all-secrets.sh

# 4. Patcher la vulnérabilité exploitée

# 5. Mettre à jour les images Docker si compromise
docker compose pull
docker compose up -d --force-recreate
```

### Phase 6 : REPRISE

```bash
# 1. Vérification complète avant remise en production
curl -f http://localhost:3000/health
pnpm test                    # Suite de tests complète
pnpm check                   # TypeScript
pnpm lint                    # ESLint

# 2. Test de connexion admin
# Vérifier que les nouvelles credentials fonctionnent

# 3. Vérification des données
psql $DATABASE_URL -c "SELECT COUNT(*) FROM customers WHERE updated_at > NOW() - INTERVAL '2h';"

# 4. Monitoring renforcé post-incident (48h)
# Augmenter le niveau de log : LOG_LEVEL=debug
# Activer les alertes pour tous les accès admin
```

### Phase 7 : POST-MORTEM (< 5 jours ouvrables)

Template à remplir et stocker dans `docs/incidents/INC-YYYYMMDD-NNN.md` :

```markdown
## Post-Mortem — INC-YYYYMMDD-NNN

**Date/heure de détection :**
**Date/heure de résolution :**
**Durée totale :**
**Sévérité :** P1/P2/P3/P4

### Résumé (5 lignes max)

### Chronologie détaillée

### Cause racine (5 pourquoi)

### Impact
- Utilisateurs affectés :
- Données personnelles exposées : Oui / Non
- Perte de données : Oui / Non
- Durée d'indisponibilité :

### Actions correctives
| Action | Responsable | Deadline | Statut |
|--------|-------------|----------|--------|

### Leçons apprises

### Indicateurs de succès
```

---

## 5. Playbooks par Type d'Incident

### 5.1 Accès non autorisé (intrusion confirmée)

```
1. ISOLATION IMMÉDIATE (< 5 min)
   └── Bloquer trafic entrant
2. PRÉSERVATION DES PREUVES (< 30 min)
   └── Logs, snapshot DB, connexions actives
3. QUALIFICATION RGPD (< 1h)
   └── Données personnelles accédées ? → Notifier DPO
4. NOTIFICATION CNIL (< 72h si violation RGPD)
5. ÉRADICATION
   └── Changer tous les credentials, patcher la vulnérabilité
6. RECONSTRUCTION
   └── Depuis image propre + restauration DB saine
7. POST-MORTEM
```

### 5.2 Ransomware / Destruction de données

```
1. ISOLATION TOTALE (< 5 min)
   └── Couper le réseau de tous les nœuds affectés
2. NE PAS REDÉMARRER les systèmes affectés
   └── (préservation des artefacts en mémoire)
3. CONTACT FORCES DE L'ORDRE si nécessaire
4. RESTAURATION DEPUIS SAUVEGARDE SAINE
   └── Vérifier l'intégrité de la sauvegarde AVANT restauration
5. NOTIFICATION CNIL si données personnelles affectées
```

### 5.3 Fuite de secrets (JWT, PII_KEY, etc.)

```
1. ROTATION IMMÉDIATE du secret compromis
   └── ./scripts/rotate-all-secrets.sh
2. RÉVOCATION de tous les tokens émis avec l'ancien secret
   └── redis-cli FLUSHDB
3. AUDIT des actions effectuées avec les tokens compromis
   └── Analyse des auditLogs depuis la date de compromission
4. NOTIFICATION aux utilisateurs si impact sur leurs comptes
```

### 5.4 Exfiltration de données personnelles

```
1. CONTAINMENT : bloquer l'accès à la source d'exfiltration
2. QUANTIFICATION : identifier quelles données, combien de personnes
3. NOTIFICATION DPO : < 4h après découverte
4. NOTIFICATION CNIL : formulaire en ligne — < 72h
5. NOTIFICATION PERSONNES CONCERNÉES : si risque élevé pour leurs droits
6. DOCUMENTATION complète pour le registre des violations RGPD
```

---

## 6. Notification CNIL (Violation RGPD)

### Critères de notification obligatoire (Art. 33 RGPD)

Notifier si la violation est **susceptible d'engendrer un risque** pour les droits et libertés des personnes naturelles.

**Risque élevé systématique pour la plateforme KYC-AML :**
- Exfiltration de données KYC (identité, documents d'identité)
- Accès non autorisé aux données AML (profil de risque, alertes)
- Fuite de données financières (montants, contreparties)

### Procédure de notification CNIL

**Délai :** 72 heures après prise de connaissance de la violation.

**Canal :** Portail CNIL — https://notifications.cnil.fr/notifications/index

**Informations requises (Art. 33.3 RGPD) :**
1. Nature de la violation (accès non autorisé, perte, destruction)
2. Catégories et nombre approximatif de personnes concernées
3. Catégories et nombre approximatif d'enregistrements concernés
4. Coordonnées du DPO
5. Conséquences probables de la violation
6. Mesures prises ou envisagées

**Template de notification :**
```
VIOLATION DE DONNÉES PERSONNELLES — KYC-AML Platform

Date de découverte : [DATE]
Date probable de l'incident : [DATE]

Nature : [Accès non autorisé / Exfiltration / Destruction / Modification]

Personnes concernées : ~[N] clients KYC
Données concernées : [Identité / Documents / Profil de risque / ...]

DPO : [NOM] — [EMAIL] — [TÉLÉPHONE]

Description : [...]

Mesures prises : [Isolation, rotation des secrets, restauration, ...]
Mesures envisagées : [Patchs, renforcement, ...]

Risque résiduel pour les personnes : [Faible / Moyen / Élevé]
```

### Notification aux personnes concernées (Art. 34 RGPD)

**Obligatoire si** risque élevé pour les droits et libertés des personnes (ex : usurpation d'identité possible).

Délai : **Dans les meilleurs délais** (pratique : < 1 semaine après notification CNIL).

---

## 7. Contacts d'Urgence

| Contact | Coordonnées | Usage |
|---------|-------------|-------|
| RSSI | [confidentiel] | P1/P2 — H24/7j |
| DPO | [confidentiel] | Violation RGPD |
| CNIL (signalement) | notifications.cnil.fr | Violation RGPD 72h |
| CERT-FR | www.cert.ssi.gouv.fr | Incidents nationaux |
| Hébergeur (Oracle/AWS) | Support ticket | Infrastructure |
| BAM (Maroc) | [si client BAM] | Incident réglementaire |

---

*Dernière révision : Mars 2026*
*Prochaine revue : Mars 2027 ou après tout incident P1*
*Validé par : RSSI + DPO*
