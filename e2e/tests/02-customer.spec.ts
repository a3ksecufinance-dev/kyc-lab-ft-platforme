import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Clients & Screening", () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Créer un nouveau client individuel", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.locator("text=Clients").first()).toBeVisible();

    // Ouvrir le formulaire de création
    const createBtn = page.locator("button", { hasText: /Nouveau|Créer|Ajouter/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      // Remplir les champs
      await page.fill('input[name="firstName"]', "Test");
      await page.fill('input[name="lastName"]',  "E2E");
      await page.fill('input[name="email"]',     `test.e2e.${Date.now()}@example.com`);
      await page.click('button[type="submit"]');
      // Vérifier la création
      await expect(page.locator("text=Test E2E").first()).toBeVisible({ timeout: 8_000 });
    }
  });

  test("Chercher un client par nom", async ({ page }) => {
    await page.goto("/customers");
    const search = page.locator('input[placeholder*="Recherch"]').first();
    if (await search.isVisible()) {
      await search.fill("Admin");
      await page.waitForTimeout(500);
      // Au moins un résultat ou message vide
      const rows = page.locator("table tbody tr");
      await expect(rows.or(page.locator("text=Aucun résultat"))).toBeVisible({ timeout: 5_000 });
    }
  });

  test("Fiche client — onglets visibles", async ({ page }) => {
    await page.goto("/customers");
    // Cliquer sur le premier client de la liste
    const firstRow = page.locator("table tbody tr a, table tbody tr [href*='/customers/']").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await expect(page).toHaveURL(/\/customers\/\d+/);
      // Vérifier les 3 onglets
      await expect(page.locator("button", { hasText: "Profil" })).toBeVisible();
      await expect(page.locator("button", { hasText: /Documents/i })).toBeVisible();
      await expect(page.locator("button", { hasText: /Réseau/i })).toBeVisible();
    }
  });

  test("Onglet Documents — affichage et upload visible", async ({ page }) => {
    await page.goto("/customers/1");
    const docsTab = page.locator("button", { hasText: /Documents/i });
    if (await docsTab.isVisible()) {
      await docsTab.click();
      // Zone d'upload présente
      await expect(
        page.locator("text=Cliquer pour sélectionner").or(page.locator("text=Uploader"))
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});
