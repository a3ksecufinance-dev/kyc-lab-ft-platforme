import { test, expect } from "@playwright/test";
import { ADMIN, loginAsAdmin } from "./helpers";

test.describe("Authentification", () => {

  test("Login avec email + mot de passe valides", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toContainText("LabFT");

    await page.fill('input[type="email"]',    ADMIN.email);
    await page.fill('input[type="password"]', ADMIN.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    // Dashboard chargé
    await expect(page.locator("text=Dashboard").first()).toBeVisible();
  });

  test("Login avec mauvais mot de passe → erreur", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]',    ADMIN.email);
    await page.fill('input[type="password"]', "MotDePasseFaux!");
    await page.click('button[type="submit"]');

    // Erreur visible sans redirection
    await expect(page.locator("text=invalide").or(page.locator("text=incorrect")))
      .toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/login/);
  });

  test("Lien mot de passe oublié visible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=Mot de passe oublié")).toBeVisible();
    await page.click("text=Mot de passe oublié");
    await expect(page).toHaveURL(/reset-password/);
  });

  test("Logout déconnecte et redirige vers login", async ({ page }) => {
    await loginAsAdmin(page);
    // Cliquer sur déconnexion dans la sidebar
    await page.locator("text=Déconnexion").or(page.locator("[data-testid='logout']")).click();
    await expect(page).toHaveURL(/login/, { timeout: 5_000 });
  });

  test("Accès route protégée sans auth → redirige vers login", async ({ page }) => {
    await page.goto("/customers");
    await expect(page).toHaveURL(/login/);
  });
});
