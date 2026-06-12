/**
 * License Validation Core — source de vérité unique
 *
 * Décode, vérifie la signature HMAC-SHA256, et valide l'expiration
 * d'une clé de licence.
 *
 * Format de clé : LIC.{base64url(payload)}.{base64url(hmac)}
 *
 * En mode développement (pas de LICENSE_KEY configuré), le système
 * fonctionne en mode "unlicensed" avec le comportement legacy
 * (INSTITUTION_TYPE env var → feature flags hardcodés).
 */

import { createHmac } from "crypto";
import type { LicensePayload, LicenseStatus, LicenseModule, LicenseInfo } from "../../shared/license.types";
import { LICENSE_GRACE_DAYS, ALL_LICENSE_MODULES } from "../../shared/license.types";

// ─── Helpers base64url ──────────────────────────────────────────────────────

function base64urlEncode(data: string): string {
  return Buffer.from(data, "utf8").toString("base64url");
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

// ─── Signature HMAC-SHA256 ──────────────────────────────────────────────────

function computeHmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

// ─── Encodage d'une licence (utilisé par generate-license.ts) ───────────────

export function encodeLicenseKey(payload: LicensePayload, secret: string): string {
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signature = computeHmac(payloadB64, secret);
  return `LIC.${payloadB64}.${signature}`;
}

// ─── Décodage + validation signature ────────────────────────────────────────

export interface LicenseDecodeResult {
  valid: boolean;
  payload: LicensePayload | null;
  error?: string;
}

export function decodeLicenseKey(key: string, secret: string): LicenseDecodeResult {
  const parts = key.split(".");
  if (parts.length !== 3 || parts[0] !== "LIC") {
    return { valid: false, payload: null, error: "Format invalide — attendu LIC.{payload}.{signature}" };
  }

  const payloadB64 = parts[1]!;
  const signature = parts[2]!;
  const expectedSig = computeHmac(payloadB64, secret);

  // Comparaison timing-safe
  if (signature.length !== expectedSig.length) {
    return { valid: false, payload: null, error: "Signature invalide" };
  }
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  if (diff !== 0) {
    return { valid: false, payload: null, error: "Signature invalide" };
  }

  try {
    const payload = JSON.parse(base64urlDecode(payloadB64)) as LicensePayload;

    // Validation structurelle minimale
    if (!payload.lid || !payload.client || !payload.type || !Array.isArray(payload.modules)) {
      return { valid: false, payload: null, error: "Payload incomplet" };
    }
    if (typeof payload.maxUsers !== "number" || payload.maxUsers < 1) {
      return { valid: false, payload: null, error: "maxUsers invalide" };
    }
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
      return { valid: false, payload: null, error: "Timestamps manquants" };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, payload: null, error: "Payload JSON invalide" };
  }
}

// ─── Calcul du statut ───────────────────────────────────────────────────────

export function computeLicenseStatus(payload: LicensePayload): LicenseStatus {
  const now = Math.floor(Date.now() / 1000);
  if (now < payload.iat) return "INVALID";  // émise dans le futur
  if (now <= payload.exp) return "ACTIVE";
  const graceEnd = payload.exp + LICENSE_GRACE_DAYS * 86400;
  if (now <= graceEnd) return "GRACE";
  return "EXPIRED";
}

export function daysRemaining(payload: LicensePayload): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.ceil((payload.exp - now) / 86400);
}

// ─── Singleton cache ────────────────────────────────────────────────────────
// Évalué une seule fois au premier appel de getLicense().
// Si aucune clé n'est configurée → mode unlicensed (dev).

interface LicenseState {
  mode: "licensed" | "unlicensed";
  payload: LicensePayload | null;
  status: LicenseStatus;
  error?: string;
}

let _state: LicenseState | null = null;

export function getLicense(): LicenseState {
  if (_state) return _state;

  const key = process.env["LICENSE_KEY"];
  const secret = process.env["LICENSE_SIGNING_SECRET"];

  // Pas de licence configurée → mode dev / legacy
  if (!key || !secret) {
    _state = { mode: "unlicensed", payload: null, status: "NONE" };
    return _state;
  }

  const result = decodeLicenseKey(key, secret);
  if (!result.valid || !result.payload) {
    const errMsg = result.error ?? "Erreur inconnue";
    _state = { mode: "licensed", payload: null, status: "INVALID", error: errMsg };
    console.error(`❌ Licence invalide : ${errMsg}`);
    return _state;
  }

  const status = computeLicenseStatus(result.payload);
  _state = { mode: "licensed", payload: result.payload, status };

  if (status === "EXPIRED") {
    console.error("❌ Licence expirée — fonctionnalités désactivées");
  } else if (status === "GRACE") {
    const graceRemaining = LICENSE_GRACE_DAYS + daysRemaining(result.payload);
    console.warn(`⚠️  Licence expirée — période de grâce : ${graceRemaining}j restants (lecture seule)`);
  } else if (status === "ACTIVE") {
    const days = daysRemaining(result.payload);
    console.warn(`✅ Licence active : ${result.payload.client} — ${result.payload.modules.length} modules — expire dans ${days}j`);
  }

  return _state;
}

/** Vérifie si un module spécifique est licencié */
export function isModuleLicensed(module: LicenseModule): boolean {
  const state = getLicense();
  if (state.mode === "unlicensed") return true;  // dev mode = tout activé
  if (state.status === "EXPIRED" || state.status === "INVALID") return false;
  if (!state.payload) return false;
  return state.payload.modules.includes(module);
}

/** Retourne la liste des modules actifs */
export function getLicensedModules(): LicenseModule[] {
  const state = getLicense();
  if (state.mode === "unlicensed") return [...ALL_LICENSE_MODULES];
  if (!state.payload || state.status === "EXPIRED" || state.status === "INVALID") return [];
  return state.payload.modules;
}

/** Construit le LicenseInfo pour le frontend */
export function buildLicenseInfo(currentUserCount: number): LicenseInfo {
  const state = getLicense();

  if (state.mode === "unlicensed" || !state.payload) {
    return {
      status: state.status,
      licenseId: null,
      clientName: null,
      institutionType: null,
      modules: state.mode === "unlicensed" ? [...ALL_LICENSE_MODULES] : [],
      maxUsers: 999,
      currentUsers: currentUserCount,
      issuedAt: null,
      expiresAt: null,
      daysRemaining: null,
      graceMode: false,
    };
  }

  const p = state.payload;
  return {
    status: state.status,
    licenseId: p.lid,
    clientName: p.client,
    institutionType: p.type,
    modules: p.modules,
    maxUsers: p.maxUsers,
    currentUsers: currentUserCount,
    issuedAt: new Date(p.iat * 1000).toISOString(),
    expiresAt: new Date(p.exp * 1000).toISOString(),
    daysRemaining: daysRemaining(p),
    graceMode: state.status === "GRACE",
  };
}

/** Réinitialise le singleton — uniquement pour les tests */
export function _resetLicenseState(): void {
  _state = null;
}
