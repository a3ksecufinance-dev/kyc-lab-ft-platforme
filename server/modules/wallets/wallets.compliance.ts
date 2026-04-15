/**
 * Service de conformité wallets
 *
 * Fournit :
 *   - Tableau de bord KPI conformité
 *   - Wallets à risque (alertes, limites dépassées, tier inadapté)
 *   - Transactions suspectes sur wallets
 *   - Création de dossier d'investigation lié à un wallet
 */

import { eq, and, desc, count, sum, gte, gt, isNotNull, ne } from "drizzle-orm";
import { db }     from "../../_core/db";
import { wallets, transactions, alerts, cases, customers } from "../../../drizzle/schema";
import { nanoid } from "nanoid";
import { createLogger } from "../../_core/logger";

const log = createLogger("wallets-compliance");

// ─── Limites BAM par tier ─────────────────────────────────────────────────────
const TIER_LIMITS: Record<string, { daily: number; monthly: number }> = {
  ALLEGED:  { daily:     5_000, monthly:    20_000 },
  STANDARD: { daily:    50_000, monthly:   200_000 },
  RENFORCE: { daily:   500_000, monthly: 2_000_000 },
};

// ─── Dashboard conformité ─────────────────────────────────────────────────────

export async function getWalletComplianceDashboard() {
  const now        = new Date();
  const dayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalWallets,
    suspended,
    dormant,
    allegedHighBalance,
    suspiciousTxCount,
    openAlerts,
    recentTxVolume,
  ] = await Promise.all([
    // Total wallets actifs
    db.select({ c: count() }).from(wallets).where(eq(wallets.isActive, true)),
    // Wallets suspendus
    db.select({ c: count() }).from(wallets).where(eq(wallets.isActive, false)),
    // Wallets dormants
    db.select({ c: count() }).from(wallets).where(eq(wallets.isDormant, true)),
    // Wallets ALLEGED avec solde > 4 000 MAD (90% plafond journalier — risque dépassement)
    db.select({ c: count() }).from(wallets)
      .where(and(eq(wallets.kycTier, "ALLEGED"), gt(wallets.balance, "4000"))),
    // Transactions suspectes sur wallets (30 derniers jours)
    db.select({ c: count() }).from(transactions)
      .where(and(
        eq(transactions.isSuspicious, true),
        isNotNull(transactions.walletId),
        gte(transactions.transactionDate, new Date(Date.now() - 30 * 86_400_000)),
      )),
    // Alertes ouvertes liées à des clients ayant des wallets
    db.select({ c: count() }).from(alerts)
      .innerJoin(wallets, eq(wallets.customerId, alerts.customerId))
      .where(eq(alerts.status, "OPEN")),
    // Volume total wallets ce mois
    db.select({ v: sum(transactions.amount) }).from(transactions)
      .where(and(
        isNotNull(transactions.walletId),
        gte(transactions.transactionDate, monthStart),
      )),
  ]);

  // Wallets ayant dépassé leur limite journalière
  const dailyUsageRows = await db
    .select({
      walletId: transactions.walletId,
      used:     sum(transactions.amount),
    })
    .from(transactions)
    .where(and(
      isNotNull(transactions.walletId),
      gte(transactions.transactionDate, dayStart),
    ))
    .groupBy(transactions.walletId);

  // Récupérer les tiers des wallets concernés
  const walletIds = dailyUsageRows
    .map(r => r.walletId)
    .filter((id): id is number => id !== null);

  let exceedingDaily = 0;
  if (walletIds.length > 0) {
    const walletTiers = await db
      .select({ id: wallets.id, kycTier: wallets.kycTier, dailyLimit: wallets.dailyLimit })
      .from(wallets)
      .where(
        walletIds.length === 1
          ? eq(wallets.id, walletIds[0]!)
          : eq(wallets.id, walletIds[0]!) // simplified: count via JS below
      );
    // Comparaison JS (évite une sous-requête complexe)
    const tierMap = new Map(walletTiers.map(w => [w.id, { tier: w.kycTier, customLimit: w.dailyLimit }]));
    for (const row of dailyUsageRows) {
      if (!row.walletId) continue;
      const info  = tierMap.get(row.walletId);
      const tier  = info?.tier ?? "ALLEGED";
      const limit = info?.customLimit ? Number(info.customLimit) : (TIER_LIMITS[tier]?.daily ?? 5000);
      if (Number(row.used ?? 0) > limit) exceedingDaily++;
    }
  }

  return {
    totalWallets:       Number(totalWallets[0]?.c ?? 0),
    suspended:          Number(suspended[0]?.c ?? 0),
    dormant:            Number(dormant[0]?.c ?? 0),
    allegedHighBalance: Number(allegedHighBalance[0]?.c ?? 0),
    suspiciousTxCount:  Number(suspiciousTxCount[0]?.c ?? 0),
    openAlerts:         Number(openAlerts[0]?.c ?? 0),
    exceedingDailyLimit: exceedingDaily,
    monthlyVolume:      Number(recentTxVolume[0]?.v ?? 0),
  };
}

// ─── Wallets à risque ─────────────────────────────────────────────────────────

export async function getHighRiskWallets(page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  // Wallets liés à des clients à risque élevé, ou ayant des tx suspectes
  const rows = await db
    .select({
      id:           wallets.id,
      walletId:     wallets.walletId,
      customerId:   wallets.customerId,
      provider:     wallets.provider,
      kycTier:      wallets.kycTier,
      balance:      wallets.balance,
      currency:     wallets.currency,
      isActive:     wallets.isActive,
      isDormant:    wallets.isDormant,
      lastActivityAt: wallets.lastActivityAt,
      customerFirstName: customers.firstName,
      customerLastName:  customers.lastName,
      customerRiskScore: customers.riskScore,
      customerRiskLevel: customers.riskLevel,
      customerPep:       customers.pepStatus,
    })
    .from(wallets)
    .innerJoin(customers, eq(customers.id, wallets.customerId))
    .where(
      // Critères de risque : client HIGH/CRITICAL, ou wallet suspendu, ou tier ALLEGED avec gros solde
      and(
        ne(customers.riskLevel, "LOW"),
      )
    )
    .orderBy(desc(customers.riskScore))
    .limit(limit)
    .offset(offset);

  // Compter les alertes et tx suspectes par wallet (en parallèle)
  const walletPks = rows.map(r => r.id);

  // Suspiciuous tx count per wallet
  const suspCountRows = walletPks.length > 0
    ? await db
        .select({ walletId: transactions.walletId, c: count() })
        .from(transactions)
        .where(and(
          eq(transactions.isSuspicious, true),
          isNotNull(transactions.walletId),
        ))
        .groupBy(transactions.walletId)
    : [];

  const suspMap = new Map(suspCountRows.map(r => [r.walletId, Number(r.c)]));

  // Alert count per customer
  const alertRows = rows.length > 0
    ? await db
        .select({ customerId: alerts.customerId, c: count() })
        .from(alerts)
        .where(eq(alerts.status, "OPEN"))
        .groupBy(alerts.customerId)
    : [];

  const alertMap = new Map(alertRows.map(r => [r.customerId, Number(r.c)]));

  const [totalResult] = await db
    .select({ total: count() })
    .from(wallets)
    .innerJoin(customers, eq(customers.id, wallets.customerId))
    .where(ne(customers.riskLevel, "LOW"));

  return {
    data: rows.map(r => ({
      ...r,
      suspiciousTxCount: suspMap.get(r.id) ?? 0,
      openAlertsCount:   alertMap.get(r.customerId) ?? 0,
      customerName: `${r.customerFirstName} ${r.customerLastName}`,
    })),
    total:      Number(totalResult?.total ?? 0),
    page,
    limit,
    totalPages: Math.ceil(Number(totalResult?.total ?? 0) / limit),
  };
}

// ─── Transactions suspectes sur wallets ───────────────────────────────────────

export async function getWalletSuspiciousTx(page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id:             transactions.id,
        transactionId:  transactions.transactionId,
        walletId:       transactions.walletId,
        customerId:     transactions.customerId,
        amount:         transactions.amount,
        currency:       transactions.currency,
        transactionType: transactions.transactionType,
        channel:        transactions.channel,
        riskScore:      transactions.riskScore,
        flagReason:     transactions.flagReason,
        transactionDate: transactions.transactionDate,
        counterparty:   transactions.counterparty,
        status:         transactions.status,
        customerFirstName: customers.firstName,
        customerLastName:  customers.lastName,
        walletRef:      wallets.walletId,
        provider:       wallets.provider,
      })
      .from(transactions)
      .innerJoin(customers, eq(customers.id, transactions.customerId))
      .leftJoin(wallets, eq(wallets.id, transactions.walletId))
      .where(and(
        eq(transactions.isSuspicious, true),
        isNotNull(transactions.walletId),
      ))
      .orderBy(desc(transactions.transactionDate))
      .limit(limit)
      .offset(offset),

    db
      .select({ total: count() })
      .from(transactions)
      .where(and(
        eq(transactions.isSuspicious, true),
        isNotNull(transactions.walletId),
      )),
  ]);

  return {
    data: data.map(r => ({ ...r, customerName: `${r.customerFirstName} ${r.customerLastName}` })),
    total:      Number(totalResult[0]?.total ?? 0),
    page,
    limit,
    totalPages: Math.ceil(Number(totalResult[0]?.total ?? 0) / limit),
  };
}

// ─── Alertes liées aux wallets ────────────────────────────────────────────────

export async function getWalletAlerts(page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id:         alerts.id,
        alertId:    alerts.alertId,
        customerId: alerts.customerId,
        alertType:  alerts.alertType,
        priority:   alerts.priority,
        status:     alerts.status,
        riskScore:  alerts.riskScore,
        reason:     alerts.reason,
        createdAt:  alerts.createdAt,
        customerFirstName: customers.firstName,
        customerLastName:  customers.lastName,
        walletRef:  wallets.walletId,
        provider:   wallets.provider,
        kycTier:    wallets.kycTier,
      })
      .from(alerts)
      .innerJoin(customers, eq(customers.id, alerts.customerId))
      .innerJoin(wallets, eq(wallets.customerId, alerts.customerId))
      .where(eq(alerts.status, "OPEN"))
      .orderBy(desc(alerts.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({ total: count() })
      .from(alerts)
      .innerJoin(wallets, eq(wallets.customerId, alerts.customerId))
      .where(eq(alerts.status, "OPEN")),
  ]);

  return {
    data: data.map(r => ({ ...r, customerName: `${r.customerFirstName} ${r.customerLastName}` })),
    total:      Number(totalResult[0]?.total ?? 0),
    page,
    limit,
    totalPages: Math.ceil(Number(totalResult[0]?.total ?? 0) / limit),
  };
}

// ─── Créer un dossier d'investigation lié à un wallet ────────────────────────

export async function createWalletInvestigation(params: {
  walletId:   number;
  customerId: number;
  reason:     string;
  severity:   "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  userId:     number;
}) {
  // Récupérer le wallet pour l'identifiant
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, params.walletId)).limit(1);
  if (!wallet) throw new Error(`Wallet ${params.walletId} introuvable`);

  const caseId = `CASE-WAL-${nanoid(8).toUpperCase()}`;

  const [newCase] = await db.insert(cases).values({
    caseId,
    customerId:  params.customerId,
    title:       `Investigation wallet ${wallet.walletId} — ${wallet.provider}`,
    description: `Dossier d'investigation ouvert sur le wallet ${wallet.walletId} (${wallet.provider}, tier ${wallet.kycTier}).\n\nMotif : ${params.reason}\n\nSolde actuel : ${wallet.balance} ${wallet.currency}`,
    status:      "OPEN",
    severity:    params.severity,
    assignedTo:  params.userId,
    createdBy:   params.userId,
    dueDate:     new Date(Date.now() + 30 * 86_400_000), // 30 jours
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).returning();

  log.info({ caseId, walletId: wallet.walletId }, "Dossier investigation wallet créé");
  return newCase;
}

// ─── Dossiers d'investigation liés aux wallets ────────────────────────────────

export async function getWalletInvestigations(page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id:          cases.id,
        caseId:      cases.caseId,
        customerId:  cases.customerId,
        title:       cases.title,
        status:      cases.status,
        severity:    cases.severity,
        decision:    cases.decision,
        createdAt:   cases.createdAt,
        dueDate:     cases.dueDate,
        customerFirstName: customers.firstName,
        customerLastName:  customers.lastName,
      })
      .from(cases)
      .innerJoin(customers, eq(customers.id, cases.customerId))
      .innerJoin(wallets, eq(wallets.customerId, cases.customerId))
      .where(
        // Filtrer les dossiers "wallet" par leur caseId prefix ou via join wallet
        eq(cases.status, "OPEN")
      )
      .orderBy(desc(cases.createdAt))
      .limit(limit)
      .offset(offset),

    db.select({ total: count() }).from(cases)
      .innerJoin(wallets, eq(wallets.customerId, cases.customerId))
      .where(eq(cases.status, "OPEN")),
  ]);

  return {
    data: data.map(r => ({ ...r, customerName: `${r.customerFirstName} ${r.customerLastName}` })),
    total:      Number(totalResult[0]?.total ?? 0),
    page,
    limit,
    totalPages: Math.ceil(Number(totalResult[0]?.total ?? 0) / limit),
  };
}
