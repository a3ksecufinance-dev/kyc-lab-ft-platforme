import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Screening sanctions", () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page screening accessible", async ({ page }) => {
    await page.goto("/screening");
    await expect(page.locator("h1")).toContainText(/Screening|Sanctions/i);
  });

  test("Onglet État des listes — 4 sources affichées", async ({ page }) => {
    await page.goto("/screening");

    // Chercher l'onglet état des listes
    const listsTab = page.locator("button, [role='tab']")
      .filter({ hasText: /état|listes/i }).first();
    if (await listsTab.isVisible()) {
      await listsTab.click();
    }

    // Vérifier les 4 sources
    for (const source of ["OFAC", "EU", "UN", "UK"]) {
      await expect(page.locator(`text=${source}`).first()).toBeVisible({ timeout: 8_000 });
    }
  });

  test("Screener un client — formulaire accessible", async ({ page }) => {
    await page.goto("/screening");

    const screenTab = page.locator("button, [role='tab']")
      .filter({ hasText: /screener|vérif/i }).first();
    if (await screenTab.isVisible()) {
      await screenTab.click();
    }

    // Champ de recherche présent
    const input = page.locator('input[placeholder*="Client"], input[type="number"]').first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill("1");

    const btn = page.locator("button", { hasText: /screener|vérif|lancer/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      // Résultat ou loading
      await expect(
        page.locator("text=CLEAR, text=MATCH, text=REVIEW, text=En cours").first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("Listes sanctions chargées (count > 0)", async ({ page }) => {
    await page.goto("/screening");

    const listsTab = page.locator("button, [role='tab']")
      .filter({ hasText: /état|listes/i }).first();
    if (await listsTab.isVisible()) await listsTab.click();

    // Au moins ONU devrait avoir des entités
    await expect(page.locator("text=1 002").or(page.locator("text=1002"))).toBeVisible({ timeout: 8_000 });
  });
});
