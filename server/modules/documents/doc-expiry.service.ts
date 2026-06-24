/**
 * Service expiration documents KYC — avec délai de grâce + escalade progressive
 *
 * Workflow oscillation complet :
 *
 * AVANT EXPIRATION :
 *   J-30 : alerte MEDIUM "expire bientôt" + notify CBS KYC_DOC_EXPIRING_SOON
 *   J-7  : alerte HIGH "expire dans 7j" + notify CBS KYC_DOC_EXPIRING_SOON
 *
 * APRÈS EXPIRATION (période de grâce = DOC_EXPIRY_GRACE_DAYS, défaut 15j) :
 *   J+0  : document marqué EXPIRED + alerte CRITICAL + notify CBS KYC_DOC_EXPIRED
 *          kycStatus reste APPROVED pendant la grâce (compte toujours actif)
 *   J+15 : fin de grâce approche — alerte HIGH + notify CBS KYC_GRACE_ENDING
 *          kycStatus passe IN_REVIEW (plafond réduit côté CBS)
 *   J+30 : blocage total requis — alerte CRITICAL + notify CBS KYC_BLOCK_REQUIRED
 *          kycStatus = REJECTED si non régularisé
 *
 * Anti-doublon : une seule alerte par client par niveau par 24h.
 */

import { and, eq, gte, lte, lt, ne, isNotNull, inArray } from "drizzle-orm";
import { nanoid }       from "nanoid";
import { db }           from "../../_core/db";
import { createLogger } from "../../_core/logger";
import { ENV }          from "../../_core/env";
import { documents, customers, alerts } from "../../../drizzle/schema";
import { notifyCbs }    from "../connectors/cbs-notify.service";

const log = createLogger("doc-expiry");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocExpiryResult {
  processed:    number;
  expired:      number;
  expiringSoon: number;
  graceEnding:  number;
  blocked:      number;
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
  nicNumber:    string | null;
  cbsRef:       string | null;
  riskLevel:    string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

async function hasRecentAlert(customerId: number, scenario: string, hours = 23): Promise<boolean> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await db.select({ id: alerts.id })
    .from(alerts)
    .where(and(
      eq(alerts.customerId, customerId),
      eq(alerts.scenario, scenario),
      ne(alerts.status, "FALSE_POSITIVE"),
      gte(alerts.createdAt, since),
    ))
    .limit(1);
  return rows.length > 0;
}

// ─── Run principal ────────────────────────────────────────────────────────────

export async function runDocExpiryCheck(): Promise<DocExpiryResult> {
  const start     = Date.now();
  const now       = new Date();
  const warnDays  = ENV.DOC_EXPIRY_WARN_DAYS;
  const graceDays = (ENV as Record<string, unknown>)["DOC_EXPIRY_GRACE_DAYS"] as number ?? 15;
  const blockDays = (ENV as Record<string, unknown>)["DOC_EXPIRY_BLOCK_DAYS"] as number ?? 30;

  const todayStr   = now.toISOString().split("T")[0]!;
  const warnStr    = new Date(now.getTime() + warnDays * 86_400_000).toISOString().split("T")[0]!;
  const blockDate  = new Date(now.getTime() - blockDays * 86_400_000).toISOString().split("T")[0]!;

  log.info({ todayStr, warnStr, graceDays, blockDays }, "Vérification expiration documents");

  // Tous les documents APPROVED avec expiryDate <= warnDate
  const docsRaw = await db
    .select({
      docId:        documents.id,
      customerId:   documents.customerId,
      documentType: documents.documentType,
      expiryDate:   documents.expiryDate,
      firstName:    customers.firstName,
      lastName:     customers.lastName,
      kycStatus:    customers.kycStatus,
      nicNumber:    customers.nicNumber,
      cbsRef:       customers.cbsRef,
      riskLevel:    customers.riskLevel,
    })
    .from(documents)
    .innerJoin(customers, eq(documents.customerId, customers.id))
    .where(and(
      eq(documents.status, "APPROVED"),
      isNotNull(documents.expiryDate),
      lte(documents.expiryDate, warnStr),
      ne(customers.kycStatus, "REJECTED"),
    )) as DocToCheck[];

  if (docsRaw.length === 0) {
    return { processed: 0, expired: 0, expiringSoon: 0, graceEnding: 0, blocked: 0, errors: 0, durationMs: Date.now() - start };
  }

  // Dédupliquer : document le plus urgent par client
  const byCustomer = new Map<number, DocToCheck>();
  for (const doc of docsRaw) {
    const ex = byCustomer.get(doc.customerId);
    if (!ex || doc.expiryDate < ex.expiryDate) byCustomer.set(doc.customerId, doc);
  }

  let expired = 0, expiringSoon = 0, graceEnding = 0, blocked = 0, errors = 0;

  for (const [customerId, doc] of byCustomer) {
    try {
      const expiryDate = new Date(doc.expiryDate);
      const daysOver   = daysDiff(expiryDate, now);   // >0 = expiré depuis X jours
      const daysLeft   = daysDiff(now, expiryDate);    // >0 = expire dans X jours

      const customerInfo = {
        customerId,
        customerRef: `${doc.firstName} ${doc.lastName}`,
        cin:         doc.nicNumber,
        cbsRef:      doc.cbsRef,
        riskLevel:   doc.riskLevel,
        timestamp:   now.toISOString(),
      };

      // ── Cas 1 : Blocage total requis (J+blockDays) ────────────────────────
      if (doc.expiryDate <= blockDate) {
        if (await hasRecentAlert(customerId, "DOCUMENT_BLOCK")) continue;

        log.warn({ customerId, daysOver, docExpiry: doc.expiryDate }, "J+30 : blocage CBS requis");

        await db.update(customers)
          .set({ kycStatus: "REJECTED", updatedAt: now })
          .where(eq(customers.id, customerId));

        await db.insert(alerts).values({
          alertId:        `DOCBLK-${nanoid(8).toUpperCase()}`,
          customerId,
          scenario:       "DOCUMENT_BLOCK",
          alertType:      "PATTERN",
          priority:       "CRITICAL",
          status:         "OPEN",
          riskScore:      95,
          reason:         `Blocage requis — document ${doc.documentType} expiré depuis ${daysOver} jours` +
                          ` (>${blockDays}j de grâce dépassés) — Client ${doc.firstName} ${doc.lastName}`,
          enrichmentData: { docExpiry: doc.expiryDate, daysOver, blockDays, action: "BLOCK_REQUIRED" },
          createdAt:      now,
          updatedAt:      now,
        });

        await notifyCbs({ ...customerInfo, event: "KYC_BLOCK_REQUIRED",
          reason: `Document expiré depuis ${daysOver}j — blocage total requis` });

        blocked++;
        continue;
      }

      // ── Cas 2 : Fin de grâce approche (J+graceDays) ──────────────────────
      if (daysOver > 0 && daysOver >= graceDays) {
        if (await hasRecentAlert(customerId, "DOCUMENT_GRACE_ENDING")) continue;

        // Passer en IN_REVIEW si pas encore fait
        if (doc.kycStatus === "APPROVED") {
          await db.update(customers)
            .set({ kycStatus: "IN_REVIEW", updatedAt: now })
            .where(eq(customers.id, customerId));
        }

        await db.insert(alerts).values({
          alertId:        `DOCGRACE-${nanoid(8).toUpperCase()}`,
          customerId,
          scenario:       "DOCUMENT_GRACE_ENDING",
          alertType:      "PATTERN",
          priority:       "HIGH",
          status:         "OPEN",
          riskScore:      80,
          reason:         `Fin de grâce — document ${doc.documentType} expiré depuis ${daysOver}j` +
                          ` (grâce ${graceDays}j). Blocage dans ${blockDays - daysOver}j si non régularisé.` +
                          ` Client ${doc.firstName} ${doc.lastName}`,
          enrichmentData: { docExpiry: doc.expiryDate, daysOver, graceDays, daysUntilBlock: blockDays - daysOver },
          createdAt:      now,
          updatedAt:      now,
        });

        await notifyCbs({ ...customerInfo, event: "KYC_GRACE_ENDING",
          daysExpired: daysOver, daysUntilBlock: blockDays - daysOver,
          reason: `Fin de grâce — passage IN_REVIEW — blocage dans ${blockDays - daysOver}j` });

        graceEnding++;
        continue;
      }

      // ── Cas 3 : Expiré (J+0 à J+graceDays) ──────────────────────────────
      if (daysOver > 0) {
        if (await hasRecentAlert(customerId, "DOCUMENT_EXPIRY")) continue;

        // Pendant la grâce : kycStatus reste APPROVED (compte actif)
        // → on marque juste le document EXPIRED et on alerte
        await db.update(documents)
          .set({ status: "EXPIRED", updatedAt: now })
          .where(eq(documents.id, doc.docId));

        await db.insert(alerts).values({
          alertId:        `DOCEXP-${nanoid(8).toUpperCase()}`,
          customerId,
          scenario:       "DOCUMENT_EXPIRY",
          alertType:      "PATTERN",
          priority:       "CRITICAL",
          status:         "OPEN",
          riskScore:      85,
          reason:         `Document ${doc.documentType} expiré depuis ${daysOver} jour(s) (${doc.expiryDate}).` +
                          ` Période de grâce : ${graceDays - daysOver}j restants avant IN_REVIEW.` +
                          ` Client ${doc.firstName} ${doc.lastName}`,
          enrichmentData: { docExpiry: doc.expiryDate, daysOver, graceDays, daysLeft: graceDays - daysOver },
          createdAt:      now,
          updatedAt:      now,
        });

        await notifyCbs({ ...customerInfo, event: "KYC_DOC_EXPIRED",
          daysExpired: daysOver, daysUntilBlock: blockDays - daysOver,
          reason: `Document ${doc.documentType} expiré (grâce ${graceDays - daysOver}j restants)` });

        expired++;
        continue;
      }

      // ── Cas 4 : Expire bientôt (avant J-0) ──────────────────────────────
      const priority = daysLeft <= 7 ? "HIGH" : "MEDIUM";
      const scenario = "DOCUMENT_EXPIRY_WARNING";

      if (await hasRecentAlert(customerId, scenario)) continue;

      await db.insert(alerts).values({
        alertId:        `DOCWARN-${nanoid(8).toUpperCase()}`,
        customerId,
        scenario,
        alertType:      "PATTERN",
        priority,
        status:         "OPEN",
        riskScore:      priority === "HIGH" ? 60 : 40,
        reason:         `Document ${doc.documentType} expire dans ${daysLeft} jour(s) (${doc.expiryDate})` +
                        ` — Client ${doc.firstName} ${doc.lastName}`,
        enrichmentData: { docExpiry: doc.expiryDate, daysLeft, warnDays },
        createdAt:      now,
        updatedAt:      now,
      });

      await notifyCbs({ ...customerInfo, event: "KYC_DOC_EXPIRING_SOON",
        daysUntilBlock: daysLeft,
        reason: `Document ${doc.documentType} expire dans ${daysLeft}j` });

      expiringSoon++;

    } catch (err) {
      errors++;
      log.error({ customerId, err }, "Erreur traitement expiration document");
    }
  }

  const durationMs = Date.now() - start;
  log.info({ expired, expiringSoon, graceEnding, blocked, errors, durationMs }, "Expiration documents terminée");
  return { processed: expired + expiringSoon + graceEnding + blocked, expired, expiringSoon, graceEnding, blocked, errors, durationMs };
}

// ─── Stats pour le dashboard ─────────────────────────────────────────────────

export async function getDocExpiryStats() {
  const now       = new Date();
  const todayStr  = now.toISOString().split("T")[0]!;
  const in7dStr   = new Date(now.getTime() +  7 * 86_400_000).toISOString().split("T")[0]!;
  const in30dStr  = new Date(now.getTime() + 30 * 86_400_000).toISOString().split("T")[0]!;

  const [expiredDocs, expiring7d, expiring30d] = await Promise.all([
    db.select({ n: documents.id }).from(documents).where(and(
      isNotNull(documents.expiryDate),
      lt(documents.expiryDate, todayStr),
      eq(documents.status, "APPROVED"),
    )),
    db.select({ n: documents.id }).from(documents).where(and(
      isNotNull(documents.expiryDate),
      gte(documents.expiryDate, todayStr),
      lte(documents.expiryDate, in7dStr),
      eq(documents.status, "APPROVED"),
    )),
    db.select({ n: documents.id }).from(documents).where(and(
      isNotNull(documents.expiryDate),
      gte(documents.expiryDate, todayStr),
      lte(documents.expiryDate, in30dStr),
      eq(documents.status, "APPROVED"),
    )),
  ]);

  return {
    expiredCount: expiredDocs.length,
    expiring7d:   expiring7d.length,
    expiring30d:  expiring30d.length,
    graceDays:    (ENV as Record<string, unknown>)["DOC_EXPIRY_GRACE_DAYS"] as number ?? 15,
    blockDays:    (ENV as Record<string, unknown>)["DOC_EXPIRY_BLOCK_DAYS"] as number ?? 30,
    generatedAt:  now.toISOString(),
  };
}
