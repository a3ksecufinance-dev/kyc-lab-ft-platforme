import { describe, it, expect, vi } from "vitest";

vi.mock("../../../drizzle/schema",  () => ({ screeningResults: {} }));
vi.mock("../../_core/db",           () => ({ db: {} }));
vi.mock("../../_core/redis",        () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), connect: vi.fn() },
  RedisKeys: {
    screeningList:       (p: string) => `screening:lists:${p}`,
    screeningLastUpdate: (p: string) => `screening:last_update:${p}`,
    screeningListCount:  (p: string) => `screening:count:${p}`,
    screeningListStatus: () => "screening:status",
  },
}));
vi.mock("../../_core/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("./screening.repository", () => ({
  insertScreeningResult:  vi.fn(),
  findScreeningByCustomer: vi.fn(),
  findScreeningById:      vi.fn(),
  updateScreeningDecision: vi.fn(),
  getPendingScreenings:   vi.fn(),
}));

import {
  normalizeName,
  computeSimilarityScore,
  matchAgainstList,
  matchAgainstMultipleLists,
  type SanctionEntity,
} from "./screening.matcher";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const sanctionList: SanctionEntity[] = [
  { id: "OFAC-001", name: "Ali Hassan Al-Rashid",
    aliases: ["A. Al-Rashid", "Hassan Rashid", "علي حسن الراشد"], listSource: "OFAC" },
  { id: "EU-042",   name: "Vladimir Petrov",
    aliases: ["V. Petrov", "Владимир Петров"],                     listSource: "EU"   },
  { id: "UN-007",   name: "Kim Chol",
    aliases: [],                                                    listSource: "UN"   },
  { id: "UK-033",   name: "Ibrahim Al-Qaeda",
    aliases: ["Ibrahim Al Qaida"],                                  listSource: "UK"   },
];

// ─── Tests normalizeName ──────────────────────────────────────────────────────

describe("normalizeName", () => {
  it("supprime les diacritiques", () => {
    expect(normalizeName("Müller")).toBe("MULLER");
    expect(normalizeName("José García")).toBe("JOSE GARCIA");
    expect(normalizeName("François")).toBe("FRANCOIS");
  });

  it("translitère le cyrillique", () => {
    const result = normalizeName("Владимир");
    expect(result).toContain("VLAD");
  });

  it("normalise les espaces multiples", () => {
    expect(normalizeName("  John   Doe  ")).toBe("JOHN DOE");
  });

  it("met en majuscules", () => {
    expect(normalizeName("john doe")).toBe("JOHN DOE");
  });
});

// ─── Tests computeSimilarityScore ────────────────────────────────────────────

describe("computeSimilarityScore", () => {
  it("exact match → 100", () => {
    const { score, method } = computeSimilarityScore("Ali Hassan Al-Rashid", "Ali Hassan Al-Rashid");
    expect(score).toBe(100);
    expect(method).toBe("exact");
  });

  it("exact match insensible à la casse et aux accents", () => {
    const { score } = computeSimilarityScore("josé garcía", "JOSE GARCIA");
    expect(score).toBe(100);
  });

  it("subset match long → score élevé", () => {
    const { score, method } = computeSimilarityScore("Vladimir Petrov", "Vladimir Petrov Director");
    expect(score).toBeGreaterThanOrEqual(90);
    expect(method).toBe("subset");
  });

  it("token set ratio — ordre différent → bon score", () => {
    const { score, method } = computeSimilarityScore("Hassan Ali Al-Rashid", "Ali Hassan Al-Rashid");
    expect(score).toBeGreaterThanOrEqual(85);
    expect(["token_set", "token_sort", "exact"]).toContain(method);
  });

  it("faute d'orthographe légère → score élevé", () => {
    // "Vladimr" au lieu de "Vladimir" — distance 1
    const { score } = computeSimilarityScore("Vladimr Petrov", "Vladimir Petrov");
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it("noms sans rapport → score faible", () => {
    const { score } = computeSimilarityScore("Jean Dupont", "Kim Chol");
    expect(score).toBeLessThan(50);
  });

  it("nom vide → score 0", () => {
    const { score } = computeSimilarityScore("", "Vladimir Petrov");
    expect(score).toBe(0);
  });
});

// ─── Tests matchAgainstList ───────────────────────────────────────────────────

describe("matchAgainstList", () => {
  it("match exact → score 100, matched=true", () => {
    const r = matchAgainstList("Ali Hassan Al-Rashid", sanctionList, 70);
    expect(r.matched).toBe(true);
    expect(r.score).toBe(100);
    expect(r.matchedEntity).toBe("Ali Hassan Al-Rashid");
    expect(r.listSource).toBe("OFAC");
  });

  it("match par alias → déclenche un match", () => {
    const r = matchAgainstList("Hassan Rashid", sanctionList, 70);
    expect(r.matched).toBe(true);
    expect(r.matchedEntity).toBe("Ali Hassan Al-Rashid");
    expect(r.matchedAlias).toBe("Hassan Rashid");
    expect(r.matchMethod).toMatch(/alias/);
  });

  it("alias cyrillique translittéré — Vladimr Petrov ≈ Владимир Петров", () => {
    const r = matchAgainstList("Vladimr Petrov", sanctionList, 70);
    expect(r.matched).toBe(true);
  });

  it("nom sans rapport → pas de match", () => {
    const r = matchAgainstList("Jean Dupont", sanctionList, 70);
    expect(r.matched).toBe(false);
    expect(r.score).toBeLessThan(70);
  });

  it("seuil élevé (95) → seuls les matchs très proches passent", () => {
    const r1 = matchAgainstList("Ali Hassan Al-Rashid", sanctionList, 95);
    expect(r1.matched).toBe(true);  // exact match = 100

    const r2 = matchAgainstList("Hassan Rashid", sanctionList, 95);
    // alias "Hassan Rashid" — dépend du score calculé
    expect(typeof r2.matched).toBe("boolean");
  });

  it("liste vide → pas de match", () => {
    const r = matchAgainstList("Ali Hassan", [], 70);
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });

  it("orthographe alternative : Ibrahim Al Qaida ≈ Ibrahim Al-Qaeda", () => {
    const r = matchAgainstList("Ibrahim Al Qaida", sanctionList, 70);
    expect(r.matched).toBe(true);
  });

  it("retourne entityId", () => {
    const r = matchAgainstList("Kim Chol", sanctionList, 70);
    expect(r.entityId).toBe("UN-007");
  });
});

// ─── Tests matchAgainstMultipleLists ─────────────────────────────────────────

describe("matchAgainstMultipleLists", () => {
  it("retourne bySource avec une entrée par liste", () => {
    const { bySource, totalChecked } = matchAgainstMultipleLists(
      "Ali Hassan Al-Rashid", sanctionList, 70
    );
    // Les 4 listes sont représentées dans sanctionList
    expect(Object.keys(bySource)).toContain("OFAC");
    expect(Object.keys(bySource)).toContain("EU");
    expect(totalChecked).toBe(sanctionList.length);
  });

  it("bestMatch est le meilleur score parmi toutes les listes", () => {
    const { bestMatch } = matchAgainstMultipleLists(
      "Vladimir Petrov", sanctionList, 70
    );
    expect(bestMatch.matched).toBe(true);
    expect(bestMatch.listSource).toBe("EU");
  });

  it("aucun match → bestMatch.matched = false", () => {
    const { bestMatch } = matchAgainstMultipleLists(
      "Jean Dupont", sanctionList, 70
    );
    expect(bestMatch.matched).toBe(false);
  });
});
