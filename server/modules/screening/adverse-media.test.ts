import { describe, it, expect } from "vitest";
import { scoreHit } from "./adverse-media.service";

describe("scoreHit (adverse media)", () => {
  it("titre + snippet vides → 0", () => {
    expect(scoreHit("", "")).toBe(0);
  });

  it("aucun mot-clé négatif → 0", () => {
    expect(scoreHit("Le président visite un hôpital", "Cérémonie officielle")).toBe(0);
  });

  it("un mot-clé (fraude) → 20", () => {
    expect(scoreHit("Fraude bancaire déjouée", "")).toBe(20);
  });

  it("deux mots-clés (blanchiment + corruption) → 40", () => {
    expect(scoreHit("Blanchiment et corruption", "")).toBe(40);
  });

  it("mots-clés dans le snippet aussi comptés", () => {
    expect(scoreHit("Titre neutre", "Il a été arrêté pour fraude")).toBe(40);
  });

  it("normalisation casse — 'FRAUDE' compte comme 'fraude'", () => {
    expect(scoreHit("FRAUDE", "")).toBe(20);
  });

  it("mot-clé anglais reconnu", () => {
    expect(scoreHit("Money laundering scheme", "")).toBe(20);
  });

  it("cap à 100 même avec beaucoup de matches", () => {
    // Titre chargé pour saturer
    const title = "fraude blanchiment corruption détournement escroquerie arrêté condamné inculpé sanctionné poursuivi scandale terrorisme mafia trafic";
    expect(scoreHit(title, "")).toBe(100);
  });

  it("word boundary strict — 'fraudes' (avec s) ne match pas 'fraude'", () => {
    // \b<mot>\b : "fraudes" n'est pas un mot 'fraude' isolé
    expect(scoreHit("fraudes multiples", "")).toBe(0);
  });

  it("word boundary — pas de faux positif sur substring inclus", () => {
    // "corrupt" est dans la liste mais "corrupted" ne match que si on cherche corrupt exact
    expect(scoreHit("His plan was corrupted", "")).toBe(0);
    // "corruption" match "corruption" exact
    expect(scoreHit("Corruption scandal", "")).toBe(40); // corruption + scandal
  });
});
