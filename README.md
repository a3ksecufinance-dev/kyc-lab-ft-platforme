# KYC-AML Platform v2

Plateforme RegTech de conformité KYC/AML/LabFT — monolithe modulaire Node.js + React.

## Stack

- **Backend** : Node.js + Express + tRPC v11 + Drizzle ORM
- **Frontend** : React 19 + Vite + Tailwind + shadcn/ui
- **Base de données** : PostgreSQL 16
- **Cache** : Redis 7
- **Auth** : JWT (jose) + bcrypt
- **Tests** : Vitest
- **CI/CD** : GitHub Actions
- **Infra** : Docker Compose (dev) → Docker + Nginx (prod)

## Démarrage rapide

```bash
# 1. Cloner et installer
git clone https://github.com/your-org/kyc-aml-v2
cd kyc-aml-v2
pnpm install

# 2. Variables d'environnement
cp .env.example .env
# Éditer .env avec vos valeurs

# 3. Démarrer PostgreSQL + Redis
docker compose -f docker/docker-compose.yml up -d

# 4. Migrations + seed
pnpm db:migrate
pnpm db:seed

# 5. Démarrer en développement
pnpm dev
```

## Comptes de démonstration (dev uniquement)

| Email | Mot de passe | Rôle |
|---|---|---|
| admin@kyc-aml.local | (voir .env ADMIN_PASSWORD) | Admin |
| analyst@kyc-aml.local | Demo123! | Analyste |
| supervisor@kyc-aml.local | Demo123! | Superviseur |
| compliance@kyc-aml.local | Demo123! | Responsable Conformité |

## Architecture

```
server/
  _core/       → Infrastructure (DB, Redis, tRPC, Auth, Audit, Logger)
  modules/     → Modules métier isolés
    auth/      → JWT login/logout/refresh
    customers/ → KYC onboarding
    transactions/ → Monitoring transactions
    aml/       → Moteur de règles AML déterministe
    alerts/    → Gestion des alertes
    cases/     → Gestion des dossiers
    screening/ → Screening OFAC/EU/ONU
    reports/   → SAR/STR reporting
    dashboard/ → Métriques temps réel
    admin/     → Administration système
```

## Tests

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage report
```

## Déploiement

```bash
# Build image Docker
docker build -f docker/Dockerfile -t kyc-aml-v2 .

# Production
docker compose -f docker/docker-compose.prod.yml up -d
```

## Conformité réglementaire

- FATF Recommandation 10 : Scoring AML déterministe avec règles auditables
- AMLD6 Art.40 : Audit trail exhaustif sur toutes les mutations (rétention 5 ans)
- AMLD6 Art.26 : RBAC 4 niveaux (analyst / supervisor / compliance_officer / admin)
- FATF R.6 : Screening listes sanctions OFAC/EU/ONU avec score de confiance
- FATF R.29 : Workflow SAR/STR avec principe des 4 yeux
