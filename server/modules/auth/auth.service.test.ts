import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../drizzle/schema", () => ({ users: {} }));
vi.mock("../../_core/db", () => ({ db: {} }));
vi.mock("../../_core/env", () => ({
  ENV: {
    JWT_ACCESS_SECRET:      "test_access_secret_32chars_minimum_ok",
    JWT_REFRESH_SECRET:     "test_refresh_secret_32chars_minimum_ok",
    JWT_ACCESS_EXPIRES_IN:  "15m",
    JWT_REFRESH_EXPIRES_IN: "7d",
    NODE_ENV:               "test",
  },
}));
vi.mock("../../_core/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("../../_core/redis", () => ({
  redis:     { setex: vi.fn(), get: vi.fn(), del: vi.fn() },
  RedisKeys: { refreshToken: (id: number) => `refresh:${id}` },
}));
// Mock bcrypt : par défaut compare retourne true, hash retourne un faux hash bcrypt
vi.mock("bcryptjs", () => ({
  default: {
    hash:    vi.fn().mockResolvedValue("$2b$12$mockedHashForTestingPurposes00000"),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { db }    from "../../_core/db";
import { redis } from "../../_core/redis";
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshTokens,
  verifyAccessToken,
  changePassword,
  generateTokenPair,
} from "./auth.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type User = Parameters<typeof generateTokenPair>[0];

function makeUser(overrides: Partial<Record<string, unknown>> = {}): User {
  return {
    id:           1,
    email:        "alice@example.com",
    name:         "Alice",
    role:         "analyst",
    department:   null,
    isActive:     true,
    mfaEnabled:   false,
    mfaSecret:    null,
    passwordHash: "$2b$12$mockedHashForTestingPurposes00000",
    lastSignedIn: null,
    createdAt:    new Date("2024-01-01"),
    updatedAt:    new Date("2024-01-01"),
    ...overrides,
  } as unknown as User;
}

function mockSelectReturning(rows: unknown[]) {
  (db as unknown as { select: ReturnType<typeof vi.fn> }).select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }),
    }),
  });
}

function mockUpdate() {
  const updateMock = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  (db as unknown as { update: typeof updateMock }).update = updateMock;
  return updateMock;
}

// ─── registerUser ─────────────────────────────────────────────────────────────

describe("auth.service — registerUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crée un utilisateur si l'email n'existe pas", async () => {
    const user = makeUser();
    mockSelectReturning([]);
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([user]) }),
    });
    (db as unknown as { insert: typeof insertMock }).insert = insertMock;

    const result = await registerUser({ email: "alice@example.com", password: "password123", name: "Alice" });

    expect(result.email).toBe("alice@example.com");
    expect(result.name).toBe("Alice");
  });

  it("lève CONFLICT si l'email existe déjà", async () => {
    mockSelectReturning([makeUser()]);

    await expect(
      registerUser({ email: "alice@example.com", password: "password123", name: "Alice" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("normalise l'email en minuscules", async () => {
    const user = makeUser();
    mockSelectReturning([]);
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([user]) }),
    });
    (db as unknown as { insert: typeof insertMock }).insert = insertMock;

    await registerUser({ email: "ALICE@EXAMPLE.COM", password: "password123", name: "Alice" });

    const setCall = insertMock.mock.results[0]?.value?.values;
    const arg = setCall?.mock?.calls?.[0]?.[0] as { email: string };
    expect(arg.email).toBe("alice@example.com");
  });

  it("lève INTERNAL_SERVER_ERROR si la DB ne retourne aucune ligne", async () => {
    mockSelectReturning([]);
    (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    });

    await expect(
      registerUser({ email: "x@x.com", password: "password123", name: "X" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

// ─── loginUser ────────────────────────────────────────────────────────────────

describe("auth.service — loginUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne mfaRequired:true si MFA activé (bcrypt.compare = true)", async () => {
    const bcrypt = await import("bcryptjs");
    (bcrypt.default.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const user = makeUser({ mfaEnabled: true });
    mockSelectReturning([user]);
    mockUpdate();
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");

    const result = await loginUser({ email: "alice@example.com", password: "AnyPassword1" });

    expect(result.mfaRequired).toBe(true);
    // @ts-expect-error — narrowing union
    expect(result.tokens).toBeNull();
  });

  it("lève UNAUTHORIZED si utilisateur introuvable", async () => {
    mockSelectReturning([]);

    await expect(
      loginUser({ email: "unknown@example.com", password: "pass" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lève UNAUTHORIZED si compte inactif", async () => {
    const user = makeUser({ isActive: false });
    mockSelectReturning([user]);

    await expect(
      loginUser({ email: "alice@example.com", password: "pass" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lève UNAUTHORIZED si mot de passe incorrect", async () => {
    const bcrypt = await import("bcryptjs");
    (bcrypt.default.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const user = makeUser();
    mockSelectReturning([user]);

    await expect(
      loginUser({ email: "alice@example.com", password: "wrong" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("retourne user + tokens si login valide (sans MFA)", async () => {
    const bcrypt = await import("bcryptjs");
    (bcrypt.default.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const user = makeUser();
    mockSelectReturning([user]);
    mockUpdate();
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");

    const result = await loginUser({ email: "alice@example.com", password: "password123" });

    expect(result.mfaRequired).toBe(false);
    // @ts-expect-error — narrowing union
    expect(result.tokens.accessToken).toBeTruthy();
    // @ts-expect-error — narrowing union
    expect(result.user.id).toBe(1);
  });
});

// ─── generateTokenPair ────────────────────────────────────────────────────────

describe("auth.service — generateTokenPair", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne accessToken, refreshToken et expiresIn=900", async () => {
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");

    const tokens = await generateTokenPair(makeUser());

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.expiresIn).toBe(900);
  });

  it("stocke le refresh token dans Redis avec TTL 7 jours", async () => {
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");

    await generateTokenPair(makeUser());

    expect(redis.setex).toHaveBeenCalledWith(
      "refresh:1",
      7 * 24 * 60 * 60,
      expect.any(String),
    );
  });

  it("génère des tokens différents à chaque appel (jti unique)", async () => {
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");

    const t1 = await generateTokenPair(makeUser());
    const t2 = await generateTokenPair(makeUser());

    expect(t1.accessToken).not.toBe(t2.accessToken);
    expect(t1.refreshToken).not.toBe(t2.refreshToken);
  });

  it("le access token est au format JWT (3 segments)", async () => {
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");

    const { accessToken } = await generateTokenPair(makeUser());

    expect(accessToken.split(".")).toHaveLength(3);
  });
});

// ─── verifyAccessToken ────────────────────────────────────────────────────────

describe("auth.service — verifyAccessToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lève UNAUTHORIZED pour un token malformé", async () => {
    await expect(verifyAccessToken("not.a.valid.jwt")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lève UNAUTHORIZED pour un token signé avec le mauvais secret", async () => {
    const { SignJWT } = await import("jose");
    const wrongSecret = new TextEncoder().encode("wrong_secret_that_is_32_chars_ok");
    const token = await new SignJWT({ email: "x@x.com", role: "analyst", name: "X", jti: "abc" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(wrongSecret);

    await expect(verifyAccessToken(token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("retourne l'utilisateur pour un token valide", async () => {
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");
    const tokens = await generateTokenPair(makeUser());

    const user = makeUser();
    mockSelectReturning([user]);

    const result = await verifyAccessToken(tokens.accessToken);

    expect(result.id).toBe(1);
    expect(result.email).toBe("alice@example.com");
  });

  it("lève UNAUTHORIZED si l'utilisateur DB est inactif", async () => {
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");
    const tokens = await generateTokenPair(makeUser());

    mockSelectReturning([makeUser({ isActive: false })]);

    await expect(verifyAccessToken(tokens.accessToken)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── refreshTokens ────────────────────────────────────────────────────────────

describe("auth.service — refreshTokens", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lève UNAUTHORIZED pour un token malformé", async () => {
    await expect(refreshTokens("invalid.token")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lève UNAUTHORIZED si le token Redis ne correspond pas (révoqué)", async () => {
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");
    const tokens = await generateTokenPair(makeUser());

    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue("different_token_in_redis");

    await expect(refreshTokens(tokens.refreshToken)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("retourne une nouvelle paire si token Redis correspond", async () => {
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");
    const tokens = await generateTokenPair(makeUser());

    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(tokens.refreshToken);
    mockSelectReturning([makeUser()]);

    const newTokens = await refreshTokens(tokens.refreshToken);

    expect(newTokens.accessToken).toBeTruthy();
    expect(newTokens.refreshToken).toBeTruthy();
  });

  it("lève UNAUTHORIZED si l'utilisateur est désactivé après émission du token", async () => {
    (redis.setex as ReturnType<typeof vi.fn>).mockResolvedValue("OK");
    const tokens = await generateTokenPair(makeUser());

    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(tokens.refreshToken);
    mockSelectReturning([makeUser({ isActive: false })]);

    await expect(refreshTokens(tokens.refreshToken)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── logoutUser ───────────────────────────────────────────────────────────────

describe("auth.service — logoutUser", () => {
  it("supprime le refresh token Redis", async () => {
    (redis.del as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    await logoutUser(1);

    expect(redis.del).toHaveBeenCalledWith("refresh:1");
  });

  it("est idempotent (appelable plusieurs fois sans erreur)", async () => {
    (redis.del as ReturnType<typeof vi.fn>).mockResolvedValue(0); // 0 = clé n'existait pas

    await expect(logoutUser(42)).resolves.toBeUndefined();
  });
});

// ─── changePassword ───────────────────────────────────────────────────────────

describe("auth.service — changePassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lève NOT_FOUND si utilisateur introuvable", async () => {
    mockSelectReturning([]);

    await expect(changePassword(99, "old", "newpassword123")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lève UNAUTHORIZED si le mot de passe actuel est incorrect", async () => {
    const bcrypt = await import("bcryptjs");
    (bcrypt.default.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    mockSelectReturning([makeUser()]);

    await expect(changePassword(1, "wrong_password", "newpass123")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("met à jour le hash et révoque le refresh token si OK", async () => {
    const bcrypt = await import("bcryptjs");
    (bcrypt.default.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    mockSelectReturning([makeUser()]);
    const updateMock = mockUpdate();
    (redis.del as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    await changePassword(1, "correct_password", "newStrongPass123");

    expect(updateMock).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith("refresh:1");
  });

  it("le nouveau mot de passe est haché, pas stocké en clair", async () => {
    const bcrypt = await import("bcryptjs");
    (bcrypt.default.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    mockSelectReturning([makeUser()]);
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((vals: { passwordHash?: string }) => {
        return { where: vi.fn().mockResolvedValue(undefined), _captured: vals };
      }),
    });
    (db as unknown as { update: typeof updateMock }).update = updateMock;
    (redis.del as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const newPassword = "MyNewPass456!";
    await changePassword(1, "correct", newPassword);

    const setArg = updateMock.mock.results[0]?.value?.set?.mock?.calls?.[0]?.[0] as { passwordHash: string };
    expect(setArg.passwordHash).not.toBe(newPassword);
    // hash mocké commence par $2b$
    expect(setArg.passwordHash).toMatch(/^\$2b\$/);
  });
});
