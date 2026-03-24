#!/bin/bash
# ─── fix-check-test.sh ────────────────────────────────────────────────────────
# Correctif : 2 erreurs pnpm check + 1 test cassé
# Usage : bash fix-check-test.sh
# À exécuter depuis la racine du projet : ~/kyc-labftplat

set -e
cd "$(dirname "$0")" 2>/dev/null || true

# ─── Vérification répertoire ──────────────────────────────────────────────────
if [ ! -f "package.json" ]; then
  echo "❌ Exécuter depuis la racine du projet (~/kyc-labftplat)"
  exit 1
fi

echo "▶ Application des correctifs..."

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 1 — aml-rules.router.ts ligne ~138
# exactOptionalPropertyTypes : remplacer le spread par un patch construit explicitement
# ═══════════════════════════════════════════════════════════════════════════════

python3 - << 'PYEOF'
import re, sys

path = "server/modules/aml/aml-rules.router.ts"
content = open(path).read()

old = """    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const { id, ...updates } = input;
      const rule = await updateRule(id, {
        ...updates,
        conditions: updates.conditions as unknown as null | undefined,
        updatedBy:  ctx.user.id,
      });"""

new = """    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const { id, ...updates } = input;

      // exactOptionalPropertyTypes : construire le patch sans clés undefined
      const patch: Parameters<typeof updateRule>[1] = { updatedBy: ctx.user.id };
      if (updates.name           !== undefined) patch.name           = updates.name;
      if (updates.description    !== undefined) patch.description    = updates.description;
      if (updates.status         !== undefined) patch.status         = updates.status;
      if (updates.baseScore      !== undefined) patch.baseScore      = updates.baseScore;
      if (updates.priority       !== undefined) patch.priority       = updates.priority;
      if (updates.alertType      !== undefined) patch.alertType      = updates.alertType;
      if (updates.thresholdValue !== undefined) patch.thresholdValue = updates.thresholdValue;
      if (updates.windowMinutes  !== undefined) patch.windowMinutes  = updates.windowMinutes;
      if (updates.countThreshold !== undefined) patch.countThreshold = updates.countThreshold;
      if (updates.conditions     !== undefined) {
        patch.conditions = updates.conditions as unknown as null;
      }

      const rule = await updateRule(id, patch);"""

if old not in content:
    print(f"  ⚠️  Pattern FIX 1 non trouvé dans {path} — peut-être déjà appliqué")
    sys.exit(0)

content = content.replace(old, new, 1)
open(path, "w").write(content)
print(f"  ✅ FIX 1 appliqué : {path}")
PYEOF

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 2 — aml-rules.router.ts ligne ~190
# [{ total }] destructuring → totalRows[0]?.total ?? 0
# ═══════════════════════════════════════════════════════════════════════════════

python3 - << 'PYEOF'
import sys

path = "server/modules/aml/aml-rules.router.ts"
content = open(path).read()

old = """      const [{ total }] = await db.select({ total: count() }).from(amlRules);

      if (Number(total) > 0) {"""

new = """      const totalRows = await db.select({ total: count() }).from(amlRules);
      if (Number(totalRows[0]?.total ?? 0) > 0) {"""

if old not in content:
    print(f"  ⚠️  Pattern FIX 2 non trouvé dans {path} — peut-être déjà appliqué")
    sys.exit(0)

content = content.replace(old, new, 1)
open(path, "w").write(content)
print(f"  ✅ FIX 2 appliqué : {path}")
PYEOF

# ═══════════════════════════════════════════════════════════════════════════════
# FIX 3 — transactions.test.ts
# Ajouter les mocks pour runDynamicAmlRules et callMlScoring
# Corriger l'assertion du test createTransaction
# ═══════════════════════════════════════════════════════════════════════════════

python3 - << 'PYEOF'
import sys

path = "server/modules/transactions/transactions.test.ts"
content = open(path).read()

# 3a — Ajouter ML_SERVICE_URL et ML_INTERNAL_API_KEY dans le mock ENV
old_env = """  ENV: {
    AML_THRESHOLD_SINGLE_TX: 10000, AML_THRESHOLD_STRUCTURING: 3000,
    AML_STRUCTURING_WINDOW_HOURS: 24, AML_FREQUENCY_THRESHOLD: 10,
    AML_VOLUME_VARIATION_THRESHOLD: 300,
  },"""

new_env = """  ENV: {
    AML_THRESHOLD_SINGLE_TX: 10000, AML_THRESHOLD_STRUCTURING: 3000,
    AML_STRUCTURING_WINDOW_HOURS: 24, AML_FREQUENCY_THRESHOLD: 10,
    AML_VOLUME_VARIATION_THRESHOLD: 300,
    ML_SERVICE_URL: "http://localhost:8000",
    ML_INTERNAL_API_KEY: "test_key",
  },"""

if old_env in content:
    content = content.replace(old_env, new_env, 1)
    print("  ✅ FIX 3a : ENV mock mis à jour")

# 3b — Ajouter les mocks runDynamicAmlRules et callMlScoring
old_mock = """// Moteur AML mocké — spy simple, sans logique réelle dans ces tests
vi.mock("../aml/aml.engine", () => ({ runAmlRules: vi.fn().mockResolvedValue([]) }));

import * as repo from "./transactions.repository";
import * as customerRepo from "../customers/customers.repository";
import * as amlEngine from "../aml/aml.engine";
import { listTransactions, getTransactionOrThrow, createTransaction, blockTransaction } from "./transactions.service";"""

new_mock = """// Moteur AML statique (fallback)
vi.mock("../aml/aml.engine", () => ({ runAmlRules: vi.fn().mockResolvedValue([]) }));
// Moteur AML dynamique (prioritaire)
vi.mock("../aml/aml-rules.engine", () => ({ runDynamicAmlRules: vi.fn().mockResolvedValue([]) }));
// ML scoring (fire-and-forget)
vi.mock("../aml/ml-scoring.client", () => ({ callMlScoring: vi.fn().mockResolvedValue(null) }));

import * as repo from "./transactions.repository";
import * as customerRepo from "../customers/customers.repository";
import * as amlEngine from "../aml/aml.engine";
import * as amlRulesEngine from "../aml/aml-rules.engine";
import * as mlScoring from "../aml/ml-scoring.client";
import { listTransactions, getTransactionOrThrow, createTransaction, blockTransaction } from "./transactions.service";"""

if old_mock in content:
    content = content.replace(old_mock, new_mock, 1)
    print("  ✅ FIX 3b : mocks runDynamicAmlRules + callMlScoring ajoutés")

# 3c — Corriger l'assertion du test createTransaction
old_test = """  it("crée une transaction et déclenche le moteur AML", async () => {
    vi.mocked(customerRepo.findCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(repo.insertTransaction).mockResolvedValue(mockTransaction);

    await createTransaction({ customerId: 1, amount: "5000.00", transactionType: "TRANSFER" });

    expect(repo.insertTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING", isSuspicious: false })
    );
    expect(amlEngine.runAmlRules).toHaveBeenCalledWith(mockTransaction, mockCustomer);
  });"""

new_test = """  it("crée une transaction et déclenche le moteur AML dynamique", async () => {
    vi.mocked(customerRepo.findCustomerById).mockResolvedValue(mockCustomer);
    vi.mocked(repo.insertTransaction).mockResolvedValue(mockTransaction);

    await createTransaction({ customerId: 1, amount: "5000.00", transactionType: "TRANSFER" });

    expect(repo.insertTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING", isSuspicious: false })
    );
    // Le moteur dynamique est appelé en priorité
    expect(amlRulesEngine.runDynamicAmlRules).toHaveBeenCalledWith(mockTransaction, mockCustomer);
    // Le ML scoring est appelé en parallèle
    expect(mlScoring.callMlScoring).toHaveBeenCalledWith(mockTransaction, mockCustomer);
    // Le moteur statique ne doit PAS être appelé directement (seulement en fallback)
    expect(amlEngine.runAmlRules).not.toHaveBeenCalled();
  });"""

if old_test in content:
    content = content.replace(old_test, new_test, 1)
    print("  ✅ FIX 3c : assertion test corrigée")

open(path, "w").write(content)
print(f"  ✅ FIX 3 terminé : {path}")
PYEOF

# ═══════════════════════════════════════════════════════════════════════════════
# Vérification finale
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "▶ Vérification TypeScript..."
pnpm check && echo "✅ pnpm check → 0 erreurs" || echo "❌ Erreurs restantes"

echo ""
echo "▶ Lancement des tests..."
pnpm test && echo "✅ pnpm test → tous passent" || echo "❌ Tests en échec"
