import { describe, it, expect } from "vitest";
import { EKYC_SCORE } from "./ekyc.scores";

describe("EKYC_SCORE constants", () => {
  it("PASS > REVIEW (assure ordre lisible dans les rapports)", () => {
    expect(EKYC_SCORE.PASS).toBeGreaterThan(EKYC_SCORE.REVIEW);
  });

  it("REVIEW < PENDING (verdict négatif plus bas que 'en cours')", () => {
    expect(EKYC_SCORE.REVIEW).toBeLessThan(EKYC_SCORE.PENDING);
  });

  it("PENDING < PASS", () => {
    expect(EKYC_SCORE.PENDING).toBeLessThan(EKYC_SCORE.PASS);
  });

  it("FAIL < REVIEW", () => {
    expect(EKYC_SCORE.FAIL).toBeLessThan(EKYC_SCORE.REVIEW);
  });

  it("LIVENESS_WEAK < LIVENESS_OK", () => {
    expect(EKYC_SCORE.LIVENESS_WEAK).toBeLessThan(EKYC_SCORE.LIVENESS_OK);
  });

  it("toutes les valeurs sont dans [0, 100]", () => {
    for (const [name, v] of Object.entries(EKYC_SCORE)) {
      expect(v, name).toBeGreaterThanOrEqual(0);
      expect(v, name).toBeLessThanOrEqual(100);
    }
  });
});
