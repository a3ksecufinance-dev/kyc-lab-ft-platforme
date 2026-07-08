/**
 * Country risk (FATF) — mapping code pays → niveau de risque.
 *
 * Sources :
 *  - FATF "High-Risk Jurisdictions subject to a Call for Action" (black list)
 *  - FATF "Jurisdictions under Increased Monitoring" (grey list)
 *  - Pays sous embargo total OFAC/UN (CRITICAL, embargo)
 *
 * Les listes FATF sont révisées trimestriellement — à re-vérifier régulièrement
 * sur https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html
 *
 * Codes ISO 3166-1 alpha-2 (deux lettres). Pour l'alpha-3 → conversion en amont.
 */

// FATF Black list (Call for Action) — révision oct. 2024
// Documents d'identité de ces pays = CRITICAL, refus quasi-systématique
const FATF_BLACK_LIST = new Set(["KP", "IR", "MM"]); // Corée du Nord, Iran, Myanmar

// Pays sous embargo total OFAC/UN — même niveau que FATF black
const EMBARGO = new Set(["KP", "IR", "CU", "SY"]);

// FATF Grey list (Increased Monitoring) — révision oct. 2024
// À maintenir à jour trimestriellement
const FATF_GREY_LIST = new Set([
  "BF", "CM", "CD", "GI", "HT", "JM", "MZ", "NG",
  "PH", "SN", "SS", "SY", "TZ", "TR", "VE", "VN", "YE",
]);

// Pays additionnels haut-risque (guerre, sanctions ciblées, corruption endémique)
const HIGH_RISK_ADDITIONAL = new Set([
  "AF", "BY", "LY", "RU", "SO", "SD", "CF",
]);

export type CountryRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface CountryRiskAssessment {
  countryCode: string;
  level:       CountryRiskLevel;
  score:       number;   // 0-100 — utilisé pour riskScore customer
  reason:      string;
  listSource:  "FATF_BLACK" | "FATF_GREY" | "EMBARGO" | "HIGH_RISK_ADDITIONAL" | "NONE";
}

/**
 * Évalue le risque associé à un code pays (nationality, issuing country, etc.).
 *
 * Ordre de sévérité : EMBARGO / FATF_BLACK > HIGH_RISK_ADDITIONAL > FATF_GREY > NONE.
 */
export function assessCountryRisk(rawCountryCode: string | null | undefined): CountryRiskAssessment {
  const code = (rawCountryCode ?? "").trim().toUpperCase();
  if (!code) {
    return { countryCode: "", level: "LOW", score: 0, reason: "Pays non renseigné", listSource: "NONE" };
  }

  // Alpha-3 → alpha-2 pour les cas fréquents
  const alpha2 = ALPHA3_TO_ALPHA2[code] ?? code;

  if (EMBARGO.has(alpha2) || FATF_BLACK_LIST.has(alpha2)) {
    return {
      countryCode: alpha2,
      level: "CRITICAL",
      score: 100,
      reason: EMBARGO.has(alpha2)
        ? `Pays sous embargo OFAC/UN (${alpha2})`
        : `Pays FATF Black list — Call for Action (${alpha2})`,
      listSource: EMBARGO.has(alpha2) ? "EMBARGO" : "FATF_BLACK",
    };
  }

  if (HIGH_RISK_ADDITIONAL.has(alpha2)) {
    return {
      countryCode: alpha2,
      level: "HIGH",
      score: 75,
      reason: `Pays à risque élevé (sanctions/guerre) — ${alpha2}`,
      listSource: "HIGH_RISK_ADDITIONAL",
    };
  }

  if (FATF_GREY_LIST.has(alpha2)) {
    return {
      countryCode: alpha2,
      level: "MEDIUM",
      score: 50,
      reason: `Pays FATF Grey list — Increased Monitoring (${alpha2})`,
      listSource: "FATF_GREY",
    };
  }

  return { countryCode: alpha2, level: "LOW", score: 10, reason: "Pays sans alerte FATF", listSource: "NONE" };
}

// Alpha-3 → alpha-2 pour les codes couramment extraits par OCR
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  PRK: "KP", IRN: "IR", MMR: "MM", CUB: "CU", SYR: "SY",
  BLR: "BY", RUS: "RU", AFG: "AF", LBY: "LY", SOM: "SO",
  SSD: "SS", CAF: "CF", COD: "CD", HTI: "HT", VEN: "VE",
  YEM: "YE", NGA: "NG", MAR: "MA", DZA: "DZ", TUN: "TN",
  FRA: "FR", ESP: "ES", USA: "US",
};
