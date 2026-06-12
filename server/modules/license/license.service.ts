/**
 * License Service — activation, requêtes, contrôle des sièges
 */

import { eq, count } from "drizzle-orm";
import { db } from "../../_core/db";
import { licenses, users } from "../../../drizzle/schema";
import { decodeLicenseKey, computeLicenseStatus, buildLicenseInfo, _resetLicenseState } from "../../_core/license";
import type { LicenseInfo } from "../../../shared/license.types";

// ─── Compter les utilisateurs actifs ────────────────────────────────────────

export async function countActiveUsers(): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.isActive, true));
  return result[0]?.value ?? 0;
}

// ─── Vérifier la limite de sièges ───────────────────────────────────────────

export async function checkSeatLimit(maxUsers: number): Promise<{ ok: boolean; current: number; max: number }> {
  const current = await countActiveUsers();
  return { ok: current < maxUsers, current, max: maxUsers };
}

// ─── Récupérer la licence active en BDD ─────────────────────────────────────

export async function getActiveLicenseFromDb() {
  const [row] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.status, "ACTIVE"))
    .orderBy(licenses.createdAt)
    .limit(1);
  return row ?? null;
}

// ─── Activer une nouvelle licence ───────────────────────────────────────────

export async function activateLicense(
  licenseKey: string,
  signingSecret: string,
  userId: number,
): Promise<{ success: boolean; info?: LicenseInfo; error?: string }> {
  // 1. Décoder et valider
  const result = decodeLicenseKey(licenseKey, signingSecret);
  if (!result.valid || !result.payload) {
    return { success: false, error: result.error ?? "Clé invalide" };
  }

  const payload = result.payload;
  const status = computeLicenseStatus(payload);
  if (status === "EXPIRED") {
    return { success: false, error: "Licence expirée" };
  }
  if (status === "INVALID") {
    return { success: false, error: "Licence invalide (date d'émission future)" };
  }

  // 2. Vérifier que cette licence n'est pas déjà activée
  const existing = await db
    .select({ id: licenses.id })
    .from(licenses)
    .where(eq(licenses.licenseId, payload.lid))
    .limit(1);

  if (existing.length > 0) {
    return { success: false, error: "Cette licence est déjà activée" };
  }

  // 3. Révoquer les licences précédentes
  await db
    .update(licenses)
    .set({ status: "REVOKED", updatedAt: new Date() })
    .where(eq(licenses.status, "ACTIVE"));

  // 4. Insérer la nouvelle licence
  await db.insert(licenses).values({
    licenseKey,
    licenseId:       payload.lid,
    clientName:      payload.client,
    institutionType: payload.type,
    modules:         payload.modules,
    maxUsers:        payload.maxUsers,
    issuedAt:        new Date(payload.iat * 1000),
    expiresAt:       new Date(payload.exp * 1000),
    activatedBy:     userId,
    status:          "ACTIVE",
  });

  // 5. Recharger le singleton (prendra effet au prochain redémarrage en prod,
  //    mais en dev on peut forcer le reset)
  _resetLicenseState();

  // 6. Mettre à jour la variable d'environnement pour le processus courant
  process.env["LICENSE_KEY"] = licenseKey;

  const currentUsers = await countActiveUsers();
  return {
    success: true,
    info: buildLicenseInfo(currentUsers),
  };
}

// ─── Obtenir le statut complet de la licence ────────────────────────────────

export async function getLicenseStatus(): Promise<LicenseInfo> {
  const currentUsers = await countActiveUsers();
  return buildLicenseInfo(currentUsers);
}

// ─── Historique des licences ────────────────────────────────────────────────

export async function getLicenseHistory() {
  return db
    .select({
      id:              licenses.id,
      licenseId:       licenses.licenseId,
      clientName:      licenses.clientName,
      institutionType: licenses.institutionType,
      modules:         licenses.modules,
      maxUsers:        licenses.maxUsers,
      issuedAt:        licenses.issuedAt,
      expiresAt:       licenses.expiresAt,
      activatedAt:     licenses.activatedAt,
      status:          licenses.status,
    })
    .from(licenses)
    .orderBy(licenses.createdAt);
}
