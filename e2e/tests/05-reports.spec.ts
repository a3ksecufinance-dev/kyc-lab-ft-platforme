import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Rapports & Conformité", () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page rapports accessible", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.locator("h1")).toContainText(/Rapport/i);
  });

  test("Créer un rapport SAR — formulaire visible", async ({ page }) => {
    await page.goto("/reports");
    const createBtn = page.locator("button", { hasText: /Nouveau|Créer|SAR|STR/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await expect(
        page.locator("text=SAR").or(page.locator("text=Rapport"))
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("Dashboard AMLD6 accessible (compliance)", async ({ page }) => {
    await page.goto("/amld6");
    await expect(page.locator("h1")).toContainText(/AMLD6|Conformité|Reporting/i);
    // KPIs présents
    await expect(
      page.locator("text=Transactions").or(page.locator("text=Alertes"))
    ).toBeVisible({ timeout: 8_000 });
  });

  test("Export CSV AMLD6 — bouton cliquable", async ({ page }) => {
    await page.goto("/amld6");
    const exportBtn = page.locator("button", { hasText: /Export CSV|CSV/i }).first();
    if (await exportBtn.isVisible()) {
      // Attendre le téléchargement
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 10_000 }),
        exportBtn.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/AMLD6.*\.csv/i);
    }
  });

  test("Page MFA settings accessible", async ({ page }) => {
    await page.goto("/mfa");
    await expect(page.locator("h1")).toContainText(/MFA|Sécurité/i);
    // Bouton activer ou statut MFA visible
    await expect(
      page.locator("text=Activer le MFA")
        .or(page.locator("text=MFA activé"))
        .or(page.locator("text=MFA désactivé"))
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Health check répond healthy", async ({ page }) => {
    const res  = await page.request.get("/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { status?: string };
    expect(body.status ?? "").toMatch(/healthy|ok/i);
  });

  test("Endpoint /metrics expose les métriques Prometheus", async ({ page }) => {
    const res  = await page.request.get("/metrics");
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    expect(text).toContain("http_request_duration_seconds");
    expect(text).toContain("nodejs_version_info");
  });
});
