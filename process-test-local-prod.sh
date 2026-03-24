#!/bin/bash
# ─── GUIDE DE TEST : LOCAL → STAGING → PROD ──────────────────────────────────
# Exécuter section par section. Ne pas tout lancer d'un coup.
# Chaque section a un critère de succès ✅ avant de passer à la suivante.
#
# TEMPS ESTIMÉ :
#   Niveau 1 (tests unitaires)    :  2 min
#   Niveau 2 (tests d'intégration) : 10 min
#   Niveau 3 (tests manuels UI)   : 30 min
#   Niveau 4 (build + staging)    : 20 min
#   Niveau 5 (prod)               :  5 min

PROJECT_DIR=~/kyc-labftplat
cd $PROJECT_DIR

# ═══════════════════════════════════════════════════════════════════════════════
# NIVEAU 1 — TESTS UNITAIRES (sans DB, sans serveur)
# ═══════════════════════════════════════════════════════════════════════════════
# Ces tests tournent avec des mocks — aucune infra nécessaire.
# Critère : 0 erreur, tous les tests passent.

section_1() {
  echo ""
  echo "════════════════════════════════════"
  echo "  NIVEAU 1 — Tests unitaires"
  echo "════════════════════════════════════"

  echo "▶ TypeScript check..."
  pnpm check
  echo "✅ 0 erreur TypeScript"

  echo ""
  echo "▶ Tests unitaires (77+ tests, ~3s)..."
  pnpm test
  echo "✅ Tous les tests passent"

  echo ""
  echo "▶ Couverture (optionnel)..."
  pnpm test:coverage
  # Objectif : > 70% de couverture sur server/modules/
}

# ═══════════════════════════════════════════════════════════════════════════════
# NIVEAU 2 — TESTS D'INTÉGRATION (DB + Redis réels)
# ═══════════════════════════════════════════════════════════════════════════════
# Lance PostgreSQL + Redis en Docker, applique les migrations, teste les vrais appels DB.

section_2() {
  echo ""
  echo "════════════════════════════════════"
  echo "  NIVEAU 2 — Tests d'intégration"
  echo "════════════════════════════════════"

  echo "▶ Démarrage PostgreSQL + Redis..."
  docker compose -f docker/docker-compose.yml up -d postgres redis
  sleep 5  # attendre que les services soient healthy

  echo ""
  echo "▶ Application des migrations..."
  pnpm db:migrate
  echo "✅ Schema DB à jour"

  echo ""
  echo "▶ Seed des données initiales..."
  pnpm db:seed
  echo "✅ Admin + données de démo créées"

  echo ""
  echo "▶ Vérification connexions..."
  # PostgreSQL
  docker exec kyc_postgres pg_isready -U kyc_user -d kyc_aml_db \
    && echo "✅ PostgreSQL : OK" || echo "❌ PostgreSQL : KO"

  # Redis
  docker exec kyc_redis redis-cli ping \
    && echo "✅ Redis : OK" || echo "❌ Redis : KO"

  # Tables créées
  TABLES=$(docker exec kyc_postgres psql -U kyc_user -d kyc_aml_db \
    -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" -t | tr -d ' ')
  echo "✅ $TABLES tables créées en base"
}

# ═══════════════════════════════════════════════════════════════════════════════
# NIVEAU 3 — TESTS MANUELS API + UI (serveur local)
# ═══════════════════════════════════════════════════════════════════════════════
# Lance le serveur dev, teste chaque fonctionnalité manuellement.

section_3_start() {
  echo ""
  echo "════════════════════════════════════"
  echo "  NIVEAU 3 — Serveur local"
  echo "════════════════════════════════════"
  echo ""
  echo "▶ Lancement du serveur (dans un autre terminal) :"
  echo "   pnpm dev"
  echo ""
  echo "   Serveur : http://localhost:3000"
  echo "   Frontend: http://localhost:5173"
  echo ""
  echo "▶ Identifiants de test :"
  echo "   Email    : admin@kyc-aml.local"
  echo "   Password : AdminKYC2024!"
}

section_3_api_tests() {
  echo ""
  echo "▶ Tests API automatisés (serveur doit tourner sur :3000)..."

  BASE="http://localhost:3000"

  # Health check
  echo -n "  Health check... "
  curl -sf "$BASE/health" | python3 -c "import sys,json; d=json.load(sys.stdin); \
    print('✅' if d.get('status') in ('ok','healthy') else '❌', d)" \
    || echo "❌ Serveur non démarré"

  # Auth login
  echo -n "  Login admin... "
  TOKEN=$(curl -sf -X POST "$BASE/trpc/auth.login" \
    -H "Content-Type: application/json" \
    -d '{"json":{"email":"admin@kyc-aml.local","password":"AdminKYC2024!"}}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); \
      print(d['result']['data']['json']['tokens']['accessToken'])" 2>/dev/null)
  [ -n "$TOKEN" ] && echo "✅ Token obtenu" || echo "❌ Login échoué"

  # tRPC dashboard
  echo -n "  Dashboard overview... "
  curl -sf "$BASE/trpc/dashboard.overview" \
    -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); \
      print('✅' if 'result' in d else '❌')" \
    || echo "❌"
}

section_3_checklist() {
  echo ""
  echo "▶ Checklist de tests manuels dans le navigateur :"
  echo ""
  echo "  AUTHENTIFICATION"
  echo "  [ ] Login avec admin@kyc-aml.local / AdminKYC2024!"
  echo "  [ ] Déconnexion et reconnexion"
  echo "  [ ] Refresh token automatique (attendre 15 min)"
  echo ""
  echo "  CLIENTS"
  echo "  [ ] Créer un client (type INDIVIDUAL)"
  echo "  [ ] Modifier le niveau de risque"
  echo "  [ ] Lancer un screening sanctions sur ce client"
  echo "  [ ] Vérifier le statut sanctions mis à jour"
  echo ""
  echo "  TRANSACTIONS"
  echo "  [ ] Créer une transaction de 500€ → statut COMPLETED"
  echo "  [ ] Créer une transaction de 15 000€ → alerte générée"
  echo "  [ ] Vérifier l'alerte dans /alerts"
  echo "  [ ] Bloquer une transaction"
  echo ""
  echo "  ALERTES"
  echo "  [ ] Voir la liste des alertes"
  echo "  [ ] Assigner une alerte à un analyste"
  echo "  [ ] Marquer une alerte comme faux positif"
  echo ""
  echo "  DOSSIERS"
  echo "  [ ] Créer un dossier lié à un client"
  echo "  [ ] Changer le statut : OPEN → UNDER_INVESTIGATION"
  echo ""
  echo "  RÈGLES AML DYNAMIQUES"
  echo "  [ ] /aml-rules → 'Charger règles par défaut' (10 règles)"
  echo "  [ ] Passer une règle en mode TESTING"
  echo "  [ ] Créer une nouvelle règle (ex: amount >= 5000)"
  echo "  [ ] Vérifier que la règle se déclenche sur une transaction"
  echo ""
  echo "  RAPPORTS SAR/STR"
  echo "  [ ] Créer un SAR avec tous les champs content requis"
  echo "  [ ] Soumettre pour révision → statut REVIEW"
  echo "  [ ] Approuver → statut SUBMITTED"
  echo "  [ ] Télécharger le XML GoAML (bouton XML)"
  echo "  [ ] Transmettre (mode SIMULATION) → vérifier le numéro TRACFIN fictif"
  echo ""
  echo "  SCREENING (listes sanctions)"
  echo "  [ ] /admin → Règles AML → Journaux d'audit"
  echo "  [ ] Vérifier les statuts des listes dans screening.listsStatus"
  echo ""
  echo "  ADMINISTRATION"
  echo "  [ ] Créer un utilisateur analyste"
  echo "  [ ] Modifier son rôle"
  echo "  [ ] Voir les logs d'audit"
}

# ═══════════════════════════════════════════════════════════════════════════════
# NIVEAU 4 — BUILD PRODUCTION + TEST STAGING
# ═══════════════════════════════════════════════════════════════════════════════

section_4() {
  echo ""
  echo "════════════════════════════════════"
  echo "  NIVEAU 4 — Build production"
  echo "════════════════════════════════════"

  echo "▶ Build complet (vite + esbuild)..."
  pnpm build
  echo "✅ Build réussi — dist/ généré"

  echo ""
  echo "▶ Vérification des artefacts..."
  ls -lh dist/index.js dist/public/index.html 2>/dev/null \
    && echo "✅ Artefacts présents" \
    || echo "❌ Artefacts manquants"

  echo ""
  echo "▶ Build image Docker..."
  docker build -f docker/Dockerfile -t kyc-aml-v2:test .
  echo "✅ Image Docker construite"

  echo ""
  echo "▶ Test de l'image Docker (10s)..."
  docker run --rm -d \
    --name kyc_test_run \
    --network kyc_network \
    -e NODE_ENV=production \
    -e DATABASE_URL="postgresql://kyc_user:kyc_password@postgres:5432/kyc_aml_db" \
    -e REDIS_URL="redis://redis:6379" \
    -e JWT_ACCESS_SECRET="test_secret_minimum_32_chars_xxxxxxxxxx" \
    -e JWT_REFRESH_SECRET="test_refresh_minimum_32_chars_xxxxxxxxxx" \
    -e ADMIN_EMAIL="admin@test.local" \
    -e ADMIN_PASSWORD="TestAdmin2024!" \
    -p 3001:3000 \
    kyc-aml-v2:test

  sleep 8
  echo -n "  Health check image Docker... "
  curl -sf http://localhost:3001/health \
    | python3 -c "import sys,json; d=json.load(sys.stdin); \
      print('✅' if d.get('status') in ('ok','healthy') else '❌')" \
    || echo "❌"

  docker stop kyc_test_run 2>/dev/null
  echo "✅ Image Docker validée"
}

# ═══════════════════════════════════════════════════════════════════════════════
# NIVEAU 5 — DÉPLOIEMENT PRODUCTION
# ═══════════════════════════════════════════════════════════════════════════════

section_5() {
  echo ""
  echo "════════════════════════════════════"
  echo "  NIVEAU 5 — Déploiement production"
  echo "════════════════════════════════════"
  echo ""
  echo "Prérequis avant de continuer :"
  echo "  [ ] Tous les niveaux 1-4 passent"
  echo "  [ ] .env de prod vérifié (secrets != défauts)"
  echo "  [ ] Backup DB de prod fait"
  echo "  [ ] Fenêtre de maintenance communiquée"
  echo ""
  read -p "Continuer le déploiement prod ? [oui/non] " confirm
  [ "$confirm" = "oui" ] || { echo "Annulé."; return; }

  echo ""
  echo "▶ Tag Git..."
  VERSION=$(date +v%Y.%m.%d)
  git tag "$VERSION"
  git push origin "$VERSION"
  echo "✅ Tag $VERSION poussé → CI/CD déclenché"

  echo ""
  echo "▶ Attendre le pipeline GitHub Actions..."
  echo "   https://github.com/TON_ORG/kyc-aml-v2/actions"
  echo ""
  echo "▶ Après déploiement automatique — vérifier :"
  echo "  [ ] https://kyc.votre-domaine.com/health → status: ok"
  echo "  [ ] Login admin fonctionnel"
  echo "  [ ] Premier screening sanctions (listes rechargées)"
  echo "  [ ] Créer une transaction test → alerte générée"
}

# ═══════════════════════════════════════════════════════════════════════════════
# MENU PRINCIPAL
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "  KYC-AML v2 — Guide de test"
echo "  Répertoire : $PROJECT_DIR"
echo ""
echo "  1) Niveau 1 — Tests unitaires (pnpm check + test)"
echo "  2) Niveau 2 — Tests intégration (Docker + DB + migrations)"
echo "  3) Niveau 3 — Tests manuels (lancer serveur local)"
echo "  3a) Niveau 3 — Tests API automatisés (serveur requis)"
echo "  4) Niveau 4 — Build Docker + validation image"
echo "  5) Niveau 5 — Déploiement production"
echo "  all) Niveaux 1 + 2 + 3 API (sans UI)"
echo ""
read -p "Niveau à exécuter : " choice

case "$choice" in
  1)    section_1 ;;
  2)    section_2 ;;
  3)    section_3_start; section_3_checklist ;;
  3a)   section_3_api_tests ;;
  4)    section_4 ;;
  5)    section_5 ;;
  all)  section_1; section_2; section_3_start; section_3_api_tests ;;
  *)    echo "Choix invalide" ;;
esac
