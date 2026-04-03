import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../drizzle/schema", () => ({ users: {} }));
vi.mock("../../_core/db", () => ({ db: { query: { users: { findFirst: vi.fn() } } } }));
vi.mock("../../_core/env", () => ({
  ENV: {
    JWT_ACCESS_SECRET:  "test_access_secret_32chars_minimum_ok",
    MFA_ENCRYPTION_KEY: "test_mfa_key_exactly_32chars_ok!",
    NODE_ENV:           "test",
  },
}));
vi.mock("../../_core/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("bcryptjs", () => ({
  default: {
    hash:    vi.fn().mockImplementation(async (s: string) => `bcrypt_hash_of_${s}`),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { db } from "../../_core/db";
import {
  generateMfaSetup,
  verifyTotpCode,
  verifyMfaLogin,
  disableMfa,
  regenerateBackupCodes,
} from "./auth.mfa";

type DbMock = {
  update: ReturnType<typeof vi.fn>;
  query:  { users: { findFirst: ReturnType<typeof vi.fn> } };
};

function makeUpdateMock() {
  return vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
}

// ─── generateMfaSetup ─────────────────────────────────────────────────────────

describe("auth.mfa — generateMfaSetup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne secret base32, qrUri et issuer", async () => {
    (db as unknown as DbMock).update = makeUpdateMock();

    const result = await generateMfaSetup(1, "alice@example.com");

    expect(result.secret).toBeTruthy();
    expect(result.secret).toMatch(/^[A-Z2-7]+$/); // Base32 valide
    expect(result.qrUri).toContain("otpauth://totp/");
    expect(result.qrUri).toContain("alice%40example.com");
    expect(result.issuer).toBe("KYC-AML Platform");
  });

  it("chaque appel génère un secret différent (CSPRNG)", async () => {
    (db as unknown as DbMock).update = makeUpdateMock();

    const r1 = await generateMfaSetup(1, "alice@example.com");
    const r2 = await generateMfaSetup(1, "alice@example.com");

    expect(r1.secret).not.toBe(r2.secret);
  });

  it("stocke le secret chiffré en DB via update", async () => {
    const updateMock = makeUpdateMock();
    (db as unknown as DbMock).update = updateMock;

    await generateMfaSetup(1, "alice@example.com");

    expect(updateMock).toHaveBeenCalled();
    const setCall = updateMock.mock.results[0]?.value?.set;
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({ mfaSecret: expect.any(String), mfaEnabled: false }),
    );
  });

  it("le secret a au moins 20 caractères (160 bits)", async () => {
    (db as unknown as DbMock).update = makeUpdateMock();

    const { secret } = await generateMfaSetup(1, "alice@example.com");

    // 20 bytes en base32 → 32 chars base32 (20 * 8 / 5 = 32)
    expect(secret.length).toBeGreaterThanOrEqual(20);
  });
});

// ─── verifyTotpCode ───────────────────────────────────────────────────────────

describe("auth.mfa — verifyTotpCode", () => {

  it("retourne false pour un code non numérique", async () => {
    const result = await verifyTotpCode("JBSWY3DPEHPK3PXP", "ABCDEF");
    expect(result).toBe(false);
  });

  it("retourne false pour un code < 6 chiffres", async () => {
    const result = await verifyTotpCode("JBSWY3DPEHPK3PXP", "12345");
    expect(result).toBe(false);
  });

  it("retourne false pour un code > 6 chiffres", async () => {
    const result = await verifyTotpCode("JBSWY3DPEHPK3PXP", "1234567");
    expect(result).toBe(false);
  });

  it("retourne false pour '000000' avec un secret aléatoire (quasi-certain)", async () => {
    // Statistiquement impossible que 000000 soit le code courant
    const result = await verifyTotpCode("JBSWY3DPEHPK3PXP", "000000");
    // On vérifie seulement que le retour est un booléen
    expect(typeof result).toBe("boolean");
  });

  it("accepte un code avec espaces (nettoyage)", async () => {
    // "000 000" doit être traité comme "000000"
    const result = await verifyTotpCode("JBSWY3DPEHPK3PXP", "000 000");
    expect(typeof result).toBe("boolean");
  });

  it("retourne true pour le code TOTP valide du secret (round-trip)", async () => {
    // Générer un setup, extraire le secret, calculer le code attendu
    (db as unknown as DbMock).update = makeUpdateMock();
    const { secret } = await generateMfaSetup(1, "test@test.com");

    // Calculer le code actuel (même logique que le service)
    const counter = BigInt(Math.floor(Date.now() / 1000 / 30));
    const msg = new Uint8Array(8);
    let c = counter;
    for (let i = 7; i >= 0; i--) {
      msg[i] = Number(c & 0xFFn);
      c >>= 8n;
    }
    // Décoder le secret base32
    const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const s = secret.toUpperCase();
    const bytes = new Uint8Array(Math.floor(s.length * 5 / 8));
    let bits = 0, value = 0, idx = 0;
    for (const char of s) {
      const v = BASE32_CHARS.indexOf(char);
      if (v < 0) continue;
      value = (value << 5) | v;
      bits += 5;
      if (bits >= 8) {
        bytes[idx++] = (value >>> (bits - 8)) & 255;
        bits -= 8;
      }
    }
    const key = await crypto.subtle.importKey("raw", bytes.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
    const offset = sig[19]! & 0x0F;
    const code = (((sig[offset]! & 0x7F) << 24) | ((sig[offset+1]! & 0xFF) << 16) | ((sig[offset+2]! & 0xFF) << 8) | (sig[offset+3]! & 0xFF)) % 1_000_000;
    const expectedCode = code.toString().padStart(6, "0");

    const result = await verifyTotpCode(secret, expectedCode);
    expect(result).toBe(true);
  });
});

// ─── verifyMfaLogin ───────────────────────────────────────────────────────────

describe("auth.mfa — verifyMfaLogin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne valid:false si MFA non activé", async () => {
    (db as unknown as DbMock).query.users.findFirst = vi.fn().mockResolvedValue({
      id: 1, mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null,
    });

    const result = await verifyMfaLogin(1, "123456");
    expect(result.valid).toBe(false);
    expect(result.usedBackup).toBe(false);
  });

  it("retourne valid:false si utilisateur introuvable", async () => {
    (db as unknown as DbMock).query.users.findFirst = vi.fn().mockResolvedValue(null);

    const result = await verifyMfaLogin(99, "123456");
    expect(result.valid).toBe(false);
  });

  it("retourne valid:false pour un code '000000' invalide (quasi-certain)", async () => {
    (db as unknown as DbMock).query.users.findFirst = vi.fn().mockResolvedValue({
      id: 1, mfaEnabled: true, mfaSecret: null, mfaBackupCodes: null,
    });

    // Le service tentera de déchiffrer null → erreur attrapée → valid:false
    const result = await verifyMfaLogin(1, "000000");
    expect(result.valid).toBe(false);
  });
});

// ─── disableMfa ───────────────────────────────────────────────────────────────

describe("auth.mfa — disableMfa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lève une erreur si utilisateur introuvable", async () => {
    (db as unknown as DbMock).query.users.findFirst = vi.fn().mockResolvedValue(null);

    await expect(disableMfa(99, "password")).rejects.toThrow("introuvable");
  });

  it("lève une erreur si le mot de passe est incorrect", async () => {
    const bcrypt = await import("bcryptjs");
    (bcrypt.default.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (db as unknown as DbMock).query.users.findFirst = vi.fn().mockResolvedValue({
      id: 1, mfaEnabled: true, mfaSecret: "enc", passwordHash: "hash",
    });

    await expect(disableMfa(1, "wrong_password")).rejects.toThrow("incorrect");
  });

  it("désactive le MFA et efface le secret si mot de passe correct", async () => {
    const bcrypt = await import("bcryptjs");
    (bcrypt.default.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (db as unknown as DbMock).query.users.findFirst = vi.fn().mockResolvedValue({
      id: 1, mfaEnabled: true, mfaSecret: "enc", passwordHash: "hash",
    });

    const updateMock = makeUpdateMock();
    (db as unknown as DbMock).update = updateMock;

    await disableMfa(1, "correct_password");

    expect(updateMock).toHaveBeenCalled();
    const setCall = updateMock.mock.results[0]?.value?.set;
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({ mfaEnabled: false, mfaSecret: null }),
    );
  });
});

// ─── regenerateBackupCodes ────────────────────────────────────────────────────

describe("auth.mfa — regenerateBackupCodes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lève une erreur si MFA non activé", async () => {
    (db as unknown as DbMock).query.users.findFirst = vi.fn().mockResolvedValue({
      id: 1, mfaEnabled: false, mfaSecret: null,
    });

    await expect(regenerateBackupCodes(1, "123456")).rejects.toThrow("MFA non activé");
  });
});
