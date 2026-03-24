import { config } from "dotenv";

// Charger les vars d'env de test
config({ path: ".env.test" });

// Overrides pour les tests
process.env["NODE_ENV"] = "test";
process.env["DATABASE_URL"] ??= "postgresql://kyc_user:kyc_password@localhost:5432/kyc_aml_test";
process.env["REDIS_URL"] ??= "redis://localhost:6379";
process.env["JWT_ACCESS_SECRET"] ??= "test_access_secret_minimum_32_characters_long_enough";
process.env["JWT_REFRESH_SECRET"] ??= "test_refresh_secret_minimum_32_chars_different_value";
process.env["ADMIN_EMAIL"] ??= "admin@test.local";
process.env["ADMIN_PASSWORD"] ??= "TestAdmin123!";
process.env["LOG_LEVEL"] = "silent"; // Pas de logs pendant les tests
