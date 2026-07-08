import { describe, it, expect } from "vitest";
import { hasAllRequiredConsents, type SessionConsents } from "./ekyc-session.service";

const NOW = new Date().toISOString();
const makeEntry = (granted: boolean) => ({ granted, at: NOW });

describe("hasAllRequiredConsents", () => {
  it("null / undefined → false", () => {
    expect(hasAllRequiredConsents(null)).toBe(false);
    expect(hasAllRequiredConsents(undefined)).toBe(false);
  });

  it("objet vide → false", () => {
    expect(hasAllRequiredConsents({})).toBe(false);
  });

  it("un seul consentement donné → false", () => {
    const c: SessionConsents = { biometric: makeEntry(true) };
    expect(hasAllRequiredConsents(c)).toBe(false);
  });

  it("trois consentements sur quatre → false", () => {
    const c: SessionConsents = {
      biometric:  makeEntry(true),
      screening:  makeEntry(true),
      cbsSharing: makeEntry(true),
      // retention manquant
    };
    expect(hasAllRequiredConsents(c)).toBe(false);
  });

  it("les quatre consentements donnés → true", () => {
    const c: SessionConsents = {
      biometric:  makeEntry(true),
      screening:  makeEntry(true),
      cbsSharing: makeEntry(true),
      retention:  makeEntry(true),
    };
    expect(hasAllRequiredConsents(c)).toBe(true);
  });

  it("un consentement explicitement refusé → false", () => {
    const c: SessionConsents = {
      biometric:  makeEntry(true),
      screening:  makeEntry(true),
      cbsSharing: makeEntry(true),
      retention:  makeEntry(false), // refusé
    };
    expect(hasAllRequiredConsents(c)).toBe(false);
  });
});
