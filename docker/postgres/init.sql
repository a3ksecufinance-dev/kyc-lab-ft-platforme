-- Init PostgreSQL pour KYC-AML
-- Exécuté une seule fois à la création du conteneur

-- Extensions utiles pour AML/KYC
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- Fuzzy text search (screening)
CREATE EXTENSION IF NOT EXISTS "btree_gin";     -- Index GIN sur colonnes simples

-- Index trigram pour le fuzzy matching du screening
-- (sera utilisé sur les noms des entités sanctionnées)
