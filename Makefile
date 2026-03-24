# ─── KYC-AML v2 — Makefile ───────────────────────────────────────────────────
# Usage : make <cible>
# Nécessite : make, docker, pnpm

.PHONY: help dev prod-up prod-down prod-logs prod-status \
        db-migrate db-seed db-backup db-restore db-studio \
        test check build deploy ssl-renew clean

# ─── Aide ─────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  KYC-AML v2 — Commandes disponibles"
	@echo ""
	@echo "  Développement"
	@echo "    make dev          Lance le serveur de dev (tsx watch)"
	@echo "    make test         Lance les tests Vitest"
	@echo "    make check        TypeScript check"
	@echo "    make build        Build production (vite + esbuild)"
	@echo ""
	@echo "  Docker développement"
	@echo "    make db-up        Lance PostgreSQL + Redis locaux"
	@echo "    make db-down      Arrête les conteneurs locaux"
	@echo ""
	@echo "  Production"
	@echo "    make prod-up      Lance tous les services prod"
	@echo "    make prod-down    Arrête les services prod"
	@echo "    make prod-logs    Logs en temps réel"
	@echo "    make prod-status  Statut des conteneurs"
	@echo "    make deploy       Pull image + redémarrage rolling"
	@echo ""
	@echo "  Base de données"
	@echo "    make db-migrate   Applique les migrations"
	@echo "    make db-seed      Insère les données initiales"
	@echo "    make db-backup    Backup manuel immédiat"
	@echo "    make db-restore F=<fichier.sql.gz>  Restauration"
	@echo "    make db-studio    Ouvre Drizzle Studio"
	@echo ""
	@echo "  SSL"
	@echo "    make ssl-renew    Renouvelle le certificat Let's Encrypt"
	@echo ""

# ─── Développement ────────────────────────────────────────────────────────────
dev:
	pnpm dev

test:
	pnpm test

test-ml:
	cd ml && pip install -r requirements.txt -r requirements-dev.txt -q && pytest -v

check:
	pnpm check

build:
	pnpm build

# ─── Docker développement ─────────────────────────────────────────────────────
db-up:
	docker compose -f docker/docker-compose.yml up -d postgres redis
	@echo "✅ PostgreSQL + Redis démarrés"
	@echo "   PostgreSQL : localhost:5432"
	@echo "   Redis      : localhost:6379"

db-down:
	docker compose -f docker/docker-compose.yml down

# ─── Production ───────────────────────────────────────────────────────────────
COMPOSE_PROD = docker compose -f docker/docker-compose.prod.yml

prod-up:
	$(COMPOSE_PROD) up -d
	@echo "✅ Stack prod démarrée"

prod-down:
	$(COMPOSE_PROD) down

prod-logs:
	$(COMPOSE_PROD) logs -f --tail=100

prod-status:
	$(COMPOSE_PROD) ps
	@echo ""
	@curl -sf http://localhost:3000/health | python3 -m json.tool || echo "⚠️  Health check Node.js échoué"
	@echo ""
	@curl -sf http://localhost:8000/health | python3 -m json.tool || echo "⚠️  ML service indisponible (optionnel)"

ml-retrain:
	@curl -sf -X POST http://localhost:8000/retrain \
	  -H "X-Api-Key: $$ML_INTERNAL_API_KEY" \
	  -H "Content-Type: application/json" \
	  -d '{"days_history": 180}' | python3 -m json.tool
	@echo "✅ Réentraînement lancé"

ml-info:
	@curl -sf http://localhost:8000/model/info \
	  -H "X-Api-Key: $$ML_INTERNAL_API_KEY" | python3 -m json.tool

# Déploiement rolling (0 downtime) — pull nouvelle image puis restart app seul
deploy:
	$(COMPOSE_PROD) pull app
	$(COMPOSE_PROD) up -d --no-deps --force-recreate app
	@sleep 10
	@curl -sf http://localhost:3000/health || (echo "❌ Health check échoué — rollback" && $(COMPOSE_PROD) up -d --no-deps app && exit 1)
	@echo "✅ Déploiement réussi"
	@$(COMPOSE_PROD) exec -T app node dist/index.js migrate

# ─── Base de données ──────────────────────────────────────────────────────────
db-migrate:
	$(COMPOSE_PROD) exec app pnpm db:migrate

db-seed:
	$(COMPOSE_PROD) exec app pnpm db:seed

db-backup:
	$(COMPOSE_PROD) exec backup /backup.sh
	@echo "✅ Backup créé dans /backups/"

# Usage : make db-restore F=kyc_aml_20240115-020000.sql.gz
db-restore:
	@test -n "$(F)" || (echo "❌ Usage: make db-restore F=<fichier.sql.gz>" && exit 1)
	@echo "⚠️  Restauration de $(F) — les données actuelles seront écrasées"
	@read -p "Confirmer ? [oui/non] " confirm && [ "$$confirm" = "oui" ]
	gunzip -c /backups/$(F) | $(COMPOSE_PROD) exec -T postgres psql -U $$DB_USER -d $$DB_NAME
	@echo "✅ Restauration terminée"

db-studio:
	pnpm db:studio

# ─── SSL ──────────────────────────────────────────────────────────────────────
ssl-renew:
	certbot renew --quiet
	docker exec kyc_nginx nginx -s reload
	@echo "✅ Certificat renouvelé"

# ─── Nettoyage ────────────────────────────────────────────────────────────────
clean:
	docker system prune -f
	docker volume prune -f
	@echo "✅ Images et volumes inutilisés supprimés"
