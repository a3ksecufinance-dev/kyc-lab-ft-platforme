/**
 * Service expiration documents KYC
 *
 * Logique métier :
 *  - EXPIRÉ       : expiryDate < aujourd'hui
 *                   → kycStatus = IN_REVIEW + alerte DOCUMENT_EXPIRY CRITICAL
 *  - BIENTÔT      : expiryDate dans [aujourd'hui, aujourd'hui + warnDays]
 *                   → alerte DOCUMENT_EXPIRY HIGH (pas de changement KYC)
 *
 * Anti-doublon : on vérifie qu'il n'existe pas déjà une alerte DOCUMENT_EXPIRY
 * ouverte pour ce client dans les 24 dernières heures.
 */

import { and, eq, gte, lte, lt, ne, isNotNull, inArray } from "drizzle-orm";
import { nanoid }       from "nanoid";
import { db }           from "../../_core/db";
import { createLogger } from "../../_core/logger";
import { ENV }          from "../../_core/env";
import { documents, customers, alerts } from "../../../drizzle/schema";

const log = createLogger("doc-expiry");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocExpiryResult {
  processed:    number;
  expired:      number;
  expiringSoon: number;
  errors:       number;
  durationMs:   number;
}

interface DocToCheck {
  docId:        number;
  customerId:   number;
  documentType: string;
  expiryDate:   string;
  firstName:    string;
  lastName:     string;
  kycStatus:    string;
}

// ─── Run principal ────────────────────────────────────────────────────────────

export async function runDocExpiryCheck(): Promise<DocExpiryResult> {
  const start    = Date.now();
  const now      = new Date();
  const warnDays = ENV.DOC_EXPIRY_WARN_DAYS;

  // Date limite pour l'avertissement (aujourd'hui + warnDays)
  const warnDate = new Date(now);
  warnDate.setDate(warnDate.getDate() + warnDays);

  const todayStr    = now.toISOString().split("T")[0]!;         // "YYYY-MM-DD"
  const warnDateStr = warnDate.toISOString().split("T")[0]!;

  log.info({ todayStr, warnDateStr, warnDays }, "Vérification expiration documents");

  // Récupérer tous les documents APPROVED avec expiryDate <= warnDate
  // (varchar "YYYY-MM-DD" — comparaison lexicographique fonctionne)
  const docsToCheck = await db
    .select({
      docId:        documents.id,
      customerId:   documents.customerId,
      documentType: documents.documentType,
      expiryDate:   documents.expiryDate,
      firstName:    customers.firstName,
      lastName:     customers.lastName,
      kycStatus:    customers.kycStatus,
    })
    .from(documents)
    .innerJoin(customers, eq(documents.customerId, customers.id))
    .where(
      and(
        eq(documents.status, "APPROVED"),
        isNotNull(documents.expiryDate),
        lte(documents.expiryDate, warnDateStr),
        // Ignorer les clients déjà révoqués/bloqués
        ne(customers.kycStatus, "REJECTED"),
      )
    ) as DocToCheck[];

  if (docsToCheck.length === 0) {
    log.info("Aucun document expirant dans la période — rien à faire");
    return { processed: 0, expired: 0, expiringSoon: 0, errors: 0, durationMs: Date.now() - start };
  }

  // Dédupliquer par client (un client peut avoir plusieurs docs qui expirent)
  // On garde le document le plus urgent par client
  const byCustomer = new Map<number, DocToCheck>();
  for (const doc of docsToCheck) {
    const existing = byCustomer.get(doc.customerId);
    if (!existing || doc.expiryDate < existing.expiryDate) {
      byCustomer.set(doc.customerId, doc);
    }
  }

  // Vérifier quels clients ont déjà une alerte DOCUMENT_EXPIRY ouverte récente (< 24h)
  const customerIds = [...byCustomer.keys()];
  const since24h    = new Date(now.getTime() - 24 * 3_600_000);

  const recentAlerts = await db
    .select({ customerId: alerts.customerId })
    .from(alerts)
    .where(
      and(
        inArray(alerts.customerId, customerIds),
        eq(alerts.scenario, "DOCUMENT_EXPIRY"),
        ne(alerts.status, "FALSE_POSITIVE"),
        gte(alerts.createdAt, since24h),
      )
    );

  const alreadyAlerted = new Set(recentAlerts.map(a => a.customerId));

  let expired      = 0;
  let expiringSoon = 0;
  let errors       = 0;

  for (const [customerId, doc] of byCustomer) {
    try {
      const isExpired = doc.expiryDate < todayStr;

      // Skip si alerte récente déjà émise
      if (alreadyAlerted.has(customerId)) {
        log.debug({ customerId, expiryDate: doc.expiryDate }, "Alerte déjà émise dans les 24h — ignoré");
        continue;
      }

      if (isExpired) {
        await handleExpiredDocument(doc, now);
        expired++;
      } else {
        await handleExpiringSoonDocument(doc, now, warnDays);
        expiringSoon++;
      }
    } catch (err) {
      errors++;
      log.error({ customerId, err }, "Erreur traitement expiration document");
    }
  }

  const durationMs = Date.now() - start;
  const processed  = expired + expiringSoon;

  log.info({ processed, expired, expiringSoon, errors, durationMs }, "Expiration documents terminée");
  return { processed, expired, expiringSoon, errors, durationMs };
}

// ─── Document expiré ─────────────────────────────────────────────────────────

async function handleExpiredDocument(doc: DocToCheck, now: Date): Promise<void> {
  // Passer le client en IN_REVIEW
  if (doc.kycStatus === "APPROVED" || doc.kycStatus === "PENDING") {
    await db.update(customers)
      .set({ kycStatus: "IN_REVIEW", updatedAt: now })
      .where(eq(customers.id, doc.customerId));
    log.info({ customerId: doc.customerId, docType: doc.documentType },
      "Client passé en IN_REVIEW — document expiré");
  }

  // Marquer le document comme EXPIRED
  await db.update(documents)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(eq(documents.id, doc.docId));

  // Créer alerte CRITICAL
  const daysOver = Math.ceil(
    (now.getTime() - new Date(doc.expiryDate).getTime()) / 86_400_000
  );

  await db.insert(alerts).values({
    alertId:    `DOCEXP-${nanoid(8).toUpperCase()}`,
    customerId: doc.customerId,
    scenario:   "DOCUMENT_EXPIRY",
    alertType:  "BEHAVIORAL",
    priority:   "CRITICAL",
    status:     "OPEN",
    riskScore:  90,
    reason:     `Document ${doc.documentType} expiré depuis ${daysOver} jour(s) ` +
                `(${doc.expiryDate}) — Client ${doc.firstName} ${doc.lastName} ` +
                `passé en révision KYC`,
    enrichmentData: {
      documentType: doc.documentType,
      expiryDate:   doc.expiryDate,
      daysExpired:  daysOver,
      previousKycStatus: doc.kycStatus,
      action: "KYC_SET_IN_REVIEW",
    },
    createdAt: now,
    updatedAt: now,
  });
}

// ─── Document expirant bientôt ───────────────────────────────────────────────

async function handleExpiringSoonDocument(
  doc: DocToCheck,
  now: Date,
  warnDays: number,
): Promise<void> {
  const daysLeft = Math.ceil(
    (new Date(doc.expiryDate).getTime() - now.getTime()) / 86_400_000
  );

  const priority = daysLeft <= 7 ? "HIGH" : "MEDIUM";

  await db.insert(alerts).values({
    alertId:    `DOCWARN-${nanoid(8).toUpperCase()}`,
    customerId: doc.customerId,
    scenario:   "DOCUMENT_EXPIRY",
    alertType:  "BEHAVIORAL",
    priority,
    status:     "OPEN",
    riskScore:  priority === "HIGH" ? 70 : 50,
    reason:     `Document ${doc.documentType} expire dans ${daysLeft} jour(s) ` +
                `(${doc.expiryDate}) — Client ${doc.firstName} ${doc.lastName}`,
    enrichmentData: {
      documentType: doc.documentType,
      expiryDate:   doc.expiryDate,
      daysLeft,
      warnDays,
      action: "EXPIRY_WARNING",
    },
    createdAt: now,
    updatedAt: now,
  });

  log.info({ customerId: doc.customerId, docType: doc.documentType, daysLeft, priority },
    "Alerte expiration document émise");
}

// ─── Stats pour le dashboard ─────────────────────────────────────────────────

export async function getDocExpiryStats() {
  const now          = new Date();
  const todayStr     = now.toISOString().split("T")[0]!;
  const in30dStr     = new Date(now.getTime() + 30 * 86_400_000).toISOString().split("T")[0]!;
  const in7dStr      = new Date(now.getTime() +  7 * 86_400_000).toISOString().split("T")[0]!;

  const [expiredDocs, expiring7d, expiring30d] = await Promise.all([
    // Documents déjà expirés (status EXPIRED ou expiryDate dépassée)
    db.select({ n: documents.id })
      .from(documents)
      .where(and(
        isNotNull(documents.expiryDate),
        lt(documents.expiryDate, todayStr),
        eq(documents.status, "APPROVED"),
      )),

    // Documents expirant dans 7 jours
    db.select({ n: documents.id })
      .from(documents)
      .where(and(
        isNotNull(documents.expiryDate),
        gte(documents.expiryDate, todayStr),
        lte(documents.expiryDate, in7dStr),
        eq(documents.status, "APPROVED"),
      )),

    // Documents expirant dans 30 jours
    db.select({ n: documents.id })
      .from(documents)
      .where(and(
        isNotNull(documents.expiryDate),
        gte(documents.expiryDate, todayStr),
        lte(documents.expiryDate, in30dStr),
        eq(documents.status, "APPROVED"),
      )),
  ]);

  return {
    expiredCount:    expiredDocs.length,
    expiring7d:      expiring7d.length,
    expiring30d:     expiring30d.length,
    generatedAt:     now.toISOString(),
  };
}
