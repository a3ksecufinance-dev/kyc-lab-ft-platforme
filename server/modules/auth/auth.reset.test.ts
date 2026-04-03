import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../drizzle/schema", () => ({ users: {} }));
vi.mock("../../_core/db", () => ({ db: {} }));
vi.mock("../../_core/env", () => ({
  ENV: {
    JWT_ACCESS_SECRET: "test_access_secret_32chars_minimum_ok",
    APP_URL:           "http://localhost:5173",
    NODE_ENV:          "test",
  },
}));
vi.mock("../../_core/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("../../_core/redis", () => ({
  redis: { setex: vi.fn(), get: vi.fn(), del: vi.fn() },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash:    vi.fn().mockResolvedValue("$2b$12$mockedResetHashForTestingOnly000"),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

// Mock global fetch pour éviter les appels réseau
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { db }    from "../../_core/db";
import { redis } from "../../_core/redis";
import {
  requestPasswordReset,
  confirmPasswordReset,
} from "./auth.reset";

// ─── requestPasswordReset ─────────────────────────────────────────────────────

describe("auth.reset — requestPasswordReset", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne lève pas d'erreur si l'email est inconnu (anti-enumeration)", async () => {
    (db as unknown as { select: ReturnType<typeof vi.fn> }).select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    });

    // Doit retourner sans erreur, même si user inexistant
    await expect(requestPasswordReset("unknown@example.com")).resolves.toBeUndefined();
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("ne lève pas d'erreur si l'utilisateur est inactif (anti-enumeration)", async () => {
    const user = { id: 1, email: "alice@example.com", isActive: false };
    (db as unknown as { select: ReturnType<typeof vi.fn> }).select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([user]) }),
      }),
    });

    await expect(requestPasswordReset("alice@example.com")).resolves.toBeUndefined();
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("stocke le token dans Redis si utilisateur actif (sans RESEND_API_KEY)", async () => {
    const user = { id: 1, email: "alice@example.com", isActive: true };
    (db as unknown as { select: ReturnType<typeof vi.fn> }).select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([user]) }),
      }),
    });
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");

    // Sans RESEND_API_KEY — logge seulement, pas d'envoi email
    const originalKey = process.env["RESEND_API_KEY"];
    delete process.env["RESEND_API_KEY"];

    await requestPasswordReset("alice@example.com");

    expect(redis.setex).toHaveBeenCalledWith(
      "reset:token:1",
      15 * 60,
      expect.any(String),
    );

    if (originalKey) process.env["RESEND_API_KEY"] = originalKey;
  });

  it("le token stocké dans Redis est un JWT valide", async () => {
    const user = { id: 1, email: "alice@example.com", isActive: true };
    (db as unknown as { select: ReturnType<typeof vi.fn> }).select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([user]) }),
      }),
    });

    let capturedToken = "";
    (redis.setex as ReturnType<typeof vi.fn>).mockImplementation((_key: string, _ttl: number, token: string) => {
      capturedToken = token;
      return Promise.resolve("OK");
    });

    const originalKey = process.env["RESEND_API_KEY"];
    delete process.env["RESEND_API_KEY"];

    await requestPasswordReset("alice@example.com");

    // Le token doit avoir 3 parties séparées par des points (JWT)
    expect(capturedToken.split(".")).toHaveLength(3);

    if (originalKey) process.env["RESEND_API_KEY"] = originalKey;
  });

  it("envoie un email via Resend si RESEND_API_KEY est présent", async () => {
    const user = { id: 1, email: "alice@example.com", isActive: true };
    (db as unknown as { select: ReturnType<typeof vi.fn> }).select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([user]) }),
      }),
    });
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");
    fetchMock.mockResolvedValue({ ok: true });

    const originalKey = process.env["RESEND_API_KEY"];
    process.env["RESEND_API_KEY"] = "re_test_key";

    await requestPasswordReset("alice@example.com");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );

    process.env["RESEND_API_KEY"] = originalKey ?? undefined;
  });
});

// ─── confirmPasswordReset ─────────────────────────────────────────────────────

describe("auth.reset — confirmPasswordReset", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lève une erreur pour un token malformé", async () => {
    await expect(
      confirmPasswordReset("invalid.token.here", "newpassword123")
    ).rejects.toThrow(/invalide|expiré/i);
  });

  it("lève une erreur si le token Redis ne correspond pas (révoqué / réutilisé)", async () => {
    // Générer un token valide manuellement
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode("test_access_secret_32chars_minimum_ok:reset");
    const token = await new SignJWT({ userId: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secret);

    // Redis retourne un token différent
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue("different_token");

    await expect(
      confirmPasswordReset(token, "newpassword123")
    ).rejects.toThrow(/déjà utilisé|expiré/i);
  });

  it("met à jour le mot de passe et supprime le token Redis si valide", async () => {
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode("test_access_secret_32chars_minimum_ok:reset");
    const token = await new SignJWT({ userId: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secret);

    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(token);
    (redis.del as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    (db as unknown as { update: typeof updateMock }).update = updateMock;

    await confirmPasswordReset(token, "MyNewPassword123!");

    // Token supprimé de Redis (usage unique)
    expect(redis.del).toHaveBeenCalledWith("reset:token:1");
    // DB mise à jour
    expect(updateMock).toHaveBeenCalled();
  });

  it("vérifie que le nouveau mot de passe est haché (pas stocké en clair)", async () => {
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode("test_access_secret_32chars_minimum_ok:reset");
    const token = await new SignJWT({ userId: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secret);

    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(token);
    (redis.del as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    let capturedSetValues: { passwordHash?: string } = {};
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((vals: { passwordHash?: string }) => {
        capturedSetValues = vals;
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    });
    (db as unknown as { update: typeof updateMock }).update = updateMock;

    const newPassword = "MyNewPassword123!";
    await confirmPasswordReset(token, newPassword);

    // Le hash ne doit pas contenir le mot de passe en clair
    expect(capturedSetValues.passwordHash).toBeTruthy();
    expect(capturedSetValues.passwordHash).not.toBe(newPassword);
    // Hash mocké — vérifie qu'il ne contient pas le mot de passe en clair
    expect(capturedSetValues.passwordHash!.length).toBeGreaterThan(newPassword.length);
  });
});
