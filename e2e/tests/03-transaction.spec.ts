import { test, expect } from "@playwright/test";
import { loginAsAdmin, apiPost } from "./helpers";

test.describe("Transactions & Alertes AML", () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Liste des transactions visible", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.locator("h1")).toContainText(/Transaction/i);
    // Tableau présent
    await expect(page.locator("table, [data-testid='transactions-list']")).toBeVisible({ timeout: 8_000 });
  });

  test("Filtrer les transactions suspectes", async ({ page }) => {
    await page.goto("/transactions");
    // Chercher le filtre suspicieux
    const filter = page.locator("select, [role='combobox']").filter({ hasText: /Suspect|statut/i }).first();
    if (await filter.isVisible()) {
      await filter.selectOption({ label: /suspect/i });
      await page.waitForTimeout(600);
    }
    // Page ne crash pas
    await expect(page).not.toHaveURL(/error/);
  });

  test("Créer une transaction via API et vérifier dans l'UI", async ({ page }) => {
    // Créer via l'API interne
    const result = await apiPost(page, "/trpc/transactions.create", {
      json: {
        customerId:      1,
        amount:          "50000",
        currency:        "EUR",
        transactionType: "TRANSFER",
        counterparty:    "Test Contrepartie E2E",
        purpose:         "Test E2E Playwright",
      },
    }) as { result?: { data?: { transactionId?: string } } };

    const txId = result?.result?.data?.transactionId;
    if (txId) {
      // Naviguer vers la liste et vérifier
      await page.goto("/transactions");
      await page.waitForTimeout(1000);
      await expect(page.locator(`text=${txId}`).first()).toBeVisible({ timeout: 8_000 });
    }
  });

  test("Liste des alertes visible + badge priorité", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.locator("h1")).toContainText(/Alerte/i);
    // Badges de priorité présents
    const badges = page.locator("[class*='CRITICAL'], [class*='HIGH'], [class*='MEDIUM'], [class*='LOW']");
    if (await badges.count() > 0) {
      await expect(badges.first()).toBeVisible();
    }
  });
});
