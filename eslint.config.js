// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  // ── Ignore patterns ──────────────────────────────────────────────────────────
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "drizzle/migrations/**",
      "e2e/**",
      "eslint.config.js",
    ],
  },

  // ── Base JS recommended ───────────────────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript recommended (sans type-checking — pas de parserOptions.project requis) ──
  ...tseslint.configs.recommended,

  // ── Config globale TS/TSX ─────────────────────────────────────────────────────
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // ── Variables & types ────────────────────────────────────────────────────
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern:        "^_",
          varsIgnorePattern:        "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any":   "warn",
      "@typescript-eslint/prefer-as-const":   "error",
      "@typescript-eslint/ban-ts-comment":    "warn",

      // ── Désactivés — nécessitent parserOptions.project (type-aware linting) ──
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises":  "off",
      "@typescript-eslint/await-thenable":       "off",

      // ── Code style ───────────────────────────────────────────────────────────
      "prefer-const":  "error",
      "no-var":        "error",
      "no-empty":      ["error", { allowEmptyCatch: true }],

      // ── Console — warn pour le code serveur métier (utilise Pino) ──
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // ── Fichiers de test — règles relâchées ──────────────────────────────────────
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console":                         "off",
    },
  },

  // ── Scripts, seed, config — règles relâchées (pas de code métier) ───────────
  {
    files: ["drizzle/*.ts", "scripts/**/*.ts", "server/_core/env.ts", "server/_core/index.ts"],
    rules: {
      "no-console":                         "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment":  "off",
    },
  },

  // ── Fichiers de configuration et scripts de génération ────────────────────────
  {
    files: ["**/*.config.ts", "**/generate-*.ts", "**/setup-*.ts"],
    rules: {
      "no-console": "off",
    },
  },
);
