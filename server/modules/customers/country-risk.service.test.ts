import { describe, it, expect } from "vitest";
import { assessCountryRisk } from "./country-risk.service";

describe("assessCountryRisk", () => {
  describe("code vide / invalide", () => {
    it("retourne LOW pour string vide", () => {
      const r = assessCountryRisk("");
      expect(r.level).toBe("LOW");
      expect(r.score).toBe(0);
      expect(r.listSource).toBe("NONE");
    });

    it("retourne LOW pour null / undefined", () => {
      expect(assessCountryRisk(null).level).toBe("LOW");
      expect(assessCountryRisk(undefined).level).toBe("LOW");
    });

    it("trim les espaces", () => {
      expect(assessCountryRisk("  IR  ").level).toBe("CRITICAL");
    });

    it("normalise la casse", () => {
      expect(assessCountryRisk("ir").level).toBe("CRITICAL");
      expect(assessCountryRisk("Ir").level).toBe("CRITICAL");
    });
  });

  describe("FATF Black list + embargo → CRITICAL", () => {
    it.each([
      ["KP", "Corée du Nord"],
      ["IR", "Iran"],
      ["MM", "Myanmar"],
      ["CU", "Cuba (embargo)"],
      ["SY", "Syrie (embargo)"],
    ])("%s (%s) → CRITICAL avec score 100", (code) => {
      const r = assessCountryRisk(code);
      expect(r.level).toBe("CRITICAL");
      expect(r.score).toBe(100);
      expect(["FATF_BLACK", "EMBARGO"]).toContain(r.listSource);
    });
  });

  describe("Alpha-3 → alpha-2 conversion", () => {
    it("PRK → KP → CRITICAL", () => {
      const r = assessCountryRisk("PRK");
      expect(r.countryCode).toBe("KP");
      expect(r.level).toBe("CRITICAL");
    });
    it("IRN → IR → CRITICAL", () => {
      expect(assessCountryRisk("IRN").countryCode).toBe("IR");
    });
    it("MAR → MA → LOW", () => {
      const r = assessCountryRisk("MAR");
      expect(r.countryCode).toBe("MA");
      expect(r.level).toBe("LOW");
    });
  });

  describe("High risk additional → HIGH", () => {
    it.each(["RU", "BY", "AF", "LY", "SO"])("%s → HIGH", (code) => {
      const r = assessCountryRisk(code);
      expect(r.level).toBe("HIGH");
      expect(r.score).toBe(75);
      expect(r.listSource).toBe("HIGH_RISK_ADDITIONAL");
    });
  });

  describe("FATF Grey list → MEDIUM", () => {
    it.each(["BF", "CM", "HT", "NG", "VN"])("%s → MEDIUM", (code) => {
      const r = assessCountryRisk(code);
      expect(r.level).toBe("MEDIUM");
      expect(r.score).toBe(50);
      expect(r.listSource).toBe("FATF_GREY");
    });
  });

  describe("Pays neutres → LOW", () => {
    it.each(["MA", "FR", "ES", "US", "GB"])("%s → LOW score 10", (code) => {
      const r = assessCountryRisk(code);
      expect(r.level).toBe("LOW");
      expect(r.score).toBe(10);
      expect(r.listSource).toBe("NONE");
    });
  });

  describe("Ordre de sévérité", () => {
    it("SY appartient à embargo + FATF grey → CRITICAL (embargo prime)", () => {
      const r = assessCountryRisk("SY");
      expect(r.level).toBe("CRITICAL");
      expect(r.listSource).toBe("EMBARGO");
    });
  });
});
