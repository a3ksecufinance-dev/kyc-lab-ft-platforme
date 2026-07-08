/**
 * Barème de scoring eKYC — mapping providers externes → score 0-100 interne.
 *
 * Onfido et Sum Sub ne renvoient pas de score numérique natif : leur verdict
 * est catégoriel (clear/consider/rejected pour Onfido, GREEN/YELLOW/RED pour
 * Sum Sub). On mappe ces verdicts sur une échelle commune 0-100 pour un
 * affichage cohérent + audit.
 *
 * Ces valeurs sont utilisées uniquement pour restitution/audit ; aucune règle
 * métier ne compare à un seuil dessus. Tuner ici n'a pas d'effet fonctionnel
 * en cascade, seulement sur l'affichage / les rapports.
 */

export const EKYC_SCORE = {
  /** Verdict positif (clear / GREEN). */
  PASS:            95,
  /** Verdict "à réviser manuellement" (consider / YELLOW). */
  REVIEW:          45,
  /** Vérification encore en cours (webhook en attente, statut incomplete). */
  PENDING:         50,
  /** Verdict négatif (rejected / RED). */
  FAIL:            5,
  /** Liveness confirmé côté provider. */
  LIVENESS_OK:     95,
  /** Liveness non confirmé (sans être un rejet clair). */
  LIVENESS_WEAK:   60,
} as const;
