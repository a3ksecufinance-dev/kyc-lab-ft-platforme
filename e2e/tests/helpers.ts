import { type Page, expect } from "@playwright/test";

export const ADMIN = {
  email:    process.env["E2E_ADMIN_EMAIL"]    ?? "admin@kyc-aml.local",
  password: process.env["E2E_ADMIN_PASSWORD"] ?? "AdminKYC2024!",
};

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Attendre la redirection vers le dashboard
  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
}

export async function loginAsAdmin(page: Page) {
  return loginAs(page, ADMIN.email, ADMIN.password);
}

export async function waitForToast(page: Page, text: string) {
  await expect(page.locator(`text=${text}`).first()).toBeVisible({ timeout: 8_000 });
}

export async function apiPost(page: Page, path: string, body: object): Promise<unknown> {
  const token = await page.evaluate(() => localStorage.getItem("kyc_access_token"));
  const res = await page.request.post(path, {
    headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
    data:    body,
  });
  return res.json();
}
