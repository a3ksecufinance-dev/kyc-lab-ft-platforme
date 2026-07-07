/**
 * eKYC Session Service — Refonte v5.1
 *
 * Nouveau workflow session-driven qui remplace/complète les endpoints
 * /api/cbs/ocr et /api/cbs/confirm actuels.
 *
 * Machine à états :
 *   DRAFT → RECTO_ONLY → OCR_DONE → AGENT_REVIEW → DECIDED
 *                                                → ABANDONED
 *
 * Fonctionnalités clés :
 *  - Upload progressif recto/verso (verso optionnel)
 *  - Session brouillon persistante (reprise possible)
 *  - Retry OCR sans repartir de zéro
 *  - Magic link pour self-service client final
 *  - Historique par CIN pour détection doublon anticipé
 */

import { and, desc, eq, gte, lt, or } from "drizzle-orm";
import { nanoid }       from "nanoid";
import { createHash, randomBytes } from "node:crypto";
import { db }           from "../../_core/db";
import { createLogger } from "../../_core/logger";
import {
  kycSessions, customers,
  type KycSession,
} from "../../../drizzle/schema";
import {
  ocrCinMaroc, verifyModifiedFields, computeMatchScore,
  type CinMarocFields, type CinMarocOcrResult, type GlobalMatchScore,
} from "./ocr-cin-maroc.service";
import { insertCustomer } from "../customers/customers.repository";
import { screenCustomer } from "../screening/screening.service";
import { notifyCbs }      from "../connectors/cbs-notify.service";
import { checkImageQuality, type ImageQualityReport } from "./image-quality.service";

const log = createLogger("ekyc-session");

// TTL par canal (millisecondes)
const TTL_MS: Record<KycSession["channel"], number> = {
  CBS_API:      24 * 3600 * 1000,   // 24h pour Basikon
  DIGITAL_WEB:  60 * 60 * 1000,     // 1h pour agent en web
  AGENT_OFFICE: 8 * 3600 * 1000,    // 8h (fin de journée)
  MOBILE_APP:   30 * 60 * 1000,     // 30 min (self-service client)
};

// Limite de retries OCR par session
const MAX_OCR_RETRIES = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  channel:      KycSession["channel"];
  agentUserId?: number;
  cbsRef?:      string;
  cbsCode?:     string;
  cbsFields?:   Partial<CinMarocFields>;
}

export interface UploadImageInput {
  sessionRef: string;
  side:       "recto" | "verso";
  buffer:     Buffer;
  mimeType:   string;
  skipQualityGate?: boolean;
}

export interface UploadImageResult {
  session:          KycSession;
  ocrResult:        Partial<CinMarocOcrResult>;
  quality:          ImageQualityReport;
  qualityWarning:   boolean;
  extracted:        Partial<CinMarocFields>;
  confidence:       number;
  matchScore?:      GlobalMatchScore;              // Si session avait cbsFields
  duplicate?: {                                     // Doublon CIN détecté à l'OCR
    exists:       boolean;
    customerId?:  number;
    customerRef?: string;
    kycStatus?:   string;
    riskLevel?:   string;
  };
}

export interface FinalizeSessionInput {
  sessionRef:      string;
  fields:          CinMarocFields;
  modified:        boolean;
  modifiedFields?: string[];
}

// ─── Créer une session brouillon ─────────────────────────────────────────────

export async function createSession(input: CreateSessionInput): Promise<KycSession> {
  const sessionRef = `OCR-${nanoid(10).toUpperCase()}`;
  const now        = new Date();
  const ttl        = TTL_MS[input.channel] ?? TTL_MS.DIGITAL_WEB;
  const expiresAt  = new Date(now.getTime() + ttl);

  const [session] = await db.insert(kycSessions).values({
    sessionRef,
    channel:     input.channel,
    status:      "DRAFT",
    cbsRef:      input.cbsRef  ?? null,
    cbsCode:     input.cbsCode ?? null,
    cbsFields:   (input.cbsFields ?? null) as unknown as null,
    agentUserId: input.agentUserId ?? null,
    startedAt:   now,
    expiresAt,
    createdAt:   now,
    updatedAt:   now,
  }).returning();

  log.info({ sessionRef, channel: input.channel, agentUserId: input.agentUserId }, "Session eKYC créée (DRAFT)");
  return session!;
}

// ─── Récupération ────────────────────────────────────────────────────────────

export async function findSessionByRef(sessionRef: string): Promise<KycSession | null> {
  const rows = await db.select().from(kycSessions)
    .where(eq(kycSessions.sessionRef, sessionRef))
    .limit(1);
  return rows[0] ?? null;
}

export async function findSessionByMagicToken(token: string): Promise<KycSession | null> {
  const hash = hashToken(token);
  const rows = await db.select().from(kycSessions)
    .where(and(
      eq(kycSessions.magicToken, hash),
      gte(kycSessions.magicTokenExpiresAt, new Date()),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function requireValidSession(sessionRef: string): Promise<KycSession> {
  const session = await findSessionByRef(sessionRef);
  if (!session) throw new Error(`Session ${sessionRef} introuvable`);
  if (session.status === "ABANDONED") throw new Error(`Session ${sessionRef} abandonnée`);
  if (session.expiresAt < new Date()) {
    await db.update(kycSessions)
      .set({ status: "ABANDONED", abandonedAt: new Date(), updatedAt: new Date() })
      .where(eq(kycSessions.id, session.id));
    throw new Error(`Session ${sessionRef} expirée`);
  }
  return session;
}

// ─── Upload d'une image (recto ou verso) ─────────────────────────────────────

export async function uploadImage(input: UploadImageInput): Promise<UploadImageResult> {
  const session = await requireValidSession(input.sessionRef);
  const now = new Date();

  // ── 1. Quality check côté serveur (soft warning) ──────────────────────────
  const quality = input.skipQualityGate
    ? { score: 100, passed: true, issues: [], metrics: {} } as ImageQualityReport
    : await checkImageQuality(input.buffer);

  // ── 2. OCR (traite les 2 sides même si un seul buffer — pour code réutilisé) ─
  //     On applique la même image en recto+verso pour bénéficier du parser
  //     unifié qui merge les 2 sides, puis on filtre le side voulu.
  const ocrResult = await ocrCinMaroc(input.buffer, input.buffer, input.mimeType);

  // Extraction : le "recto" contient les champs identité, le "verso" contient l'adresse
  const extracted = input.side === "recto" ? ocrResult.recto : ocrResult.verso;
  const confidence = input.side === "recto" ? ocrResult.confidence.recto : ocrResult.confidence.verso;

  // ── 3. Merger avec le résultat déjà existant sur l'autre side ─────────────
  const existingQualityChecks = (session.qualityChecks ?? {}) as Record<string, ImageQualityReport>;
  const updatedQualityChecks = { ...existingQualityChecks, [input.side]: quality };

  const patch: Partial<KycSession> = {
    updatedAt: now,
    qualityChecks: updatedQualityChecks as unknown as null,
  };

  if (input.side === "recto") {
    patch.rectoUploaded   = true;
    patch.rectoOcrData    = extracted as unknown as null;
    patch.rectoConfidence = Math.round(confidence);
  } else {
    patch.versoUploaded   = true;
    patch.versoOcrData    = extracted as unknown as null;
    patch.versoConfidence = Math.round(confidence);
  }

  // ── 4. Machine à états ───────────────────────────────────────────────────
  const willHaveRecto = input.side === "recto" ? true : session.rectoUploaded;
  const willHaveVerso = input.side === "verso" ? true : session.versoUploaded;

  if (willHaveRecto && willHaveVerso) {
    patch.status = "OCR_DONE";
  } else if (willHaveRecto) {
    patch.status = "RECTO_ONLY";
  }
  // Si session avait déjà un statut plus avancé, on ne rétrograde pas

  // ── 5. Fusionner les champs candidats ───────────────────────────────────
  const currentCandidates = (session.candidateFields ?? {}) as Partial<CinMarocFields>;
  const merged: Partial<CinMarocFields> = { ...currentCandidates };
  for (const [k, v] of Object.entries(extracted)) {
    if (v && !merged[k as keyof CinMarocFields]) {
      (merged as Record<string, unknown>)[k] = v;
    }
  }
  patch.candidateFields = merged as unknown as null;

  // ── 6. Match score CBS ↔ OCR (si le CBS a fourni des champs de référence) ──
  let matchScore: GlobalMatchScore | undefined;
  const cbsFields = (session.cbsFields ?? null) as Partial<CinMarocFields> | null;
  if (cbsFields && Object.keys(cbsFields).length > 0) {
    matchScore = computeMatchScore(cbsFields, merged);
  }

  // ── 7. Détection doublon CIN dès l'OCR (BAM anti-blanchiment) ─────────────
  let duplicate: UploadImageResult["duplicate"];
  const detectedCin = merged.cin;
  if (detectedCin && (input.side === "recto" || !session.rectoUploaded)) {
    const dup = await findExistingCustomerByCin(detectedCin);
    if (dup) duplicate = dup;
  }

  // Persister matchScore + duplicate dans decisionResult pour audit
  if (matchScore || duplicate) {
    const currentDecision = (session.decisionResult ?? {}) as Record<string, unknown>;
    patch.decisionResult = {
      ...currentDecision,
      ...(matchScore ? { matchScore } : {}),
      ...(duplicate  ? { duplicate }  : {}),
    } as unknown as null;
  }

  const [updated] = await db.update(kycSessions)
    .set(patch)
    .where(eq(kycSessions.id, session.id))
    .returning();

  log.info({
    sessionRef: input.sessionRef,
    side: input.side,
    confidence: Math.round(confidence),
    quality: quality.score,
    newStatus: patch.status,
    matchScore: matchScore?.score,
    matchVerdict: matchScore?.verdict,
    duplicate: duplicate?.exists,
  }, "Image uploadée et OCRée");

  return {
    session:  updated!,
    ocrResult: input.side === "recto" ? { recto: extracted, confidence: ocrResult.confidence, mrzValid: ocrResult.mrzValid } : { verso: extracted, confidence: ocrResult.confidence },
    quality,
    qualityWarning: !quality.passed,
    extracted,
    confidence: Math.round(confidence),
    ...(matchScore ? { matchScore } : {}),
    ...(duplicate  ? { duplicate }  : {}),
  };
}

// ─── Retry OCR sur une image déjà uploadée ───────────────────────────────────
// Note : le buffer image n'est pas stocké par défaut (RGPD). L'appelant doit
// re-fournir l'image via un nouvel upload.

export async function retryOcr(sessionRef: string, buffer: Buffer, side: "recto" | "verso", mimeType = "image/jpeg"): Promise<UploadImageResult> {
  const session = await requireValidSession(sessionRef);
  if (session.retryCount >= MAX_OCR_RETRIES) {
    throw new Error(`Limite de ${MAX_OCR_RETRIES} retries OCR atteinte pour cette session`);
  }
  const result = await uploadImage({ sessionRef, side, buffer, mimeType });
  await db.update(kycSessions)
    .set({ retryCount: session.retryCount + 1, updatedAt: new Date() })
    .where(eq(kycSessions.id, session.id));
  return result;
}

// ─── Mise à jour partielle de la session (PATCH) ─────────────────────────────

export async function patchSession(sessionRef: string, patch: {
  fields?: Partial<CinMarocFields>;
  cbsFields?: Partial<CinMarocFields>;
}): Promise<KycSession> {
  const session = await requireValidSession(sessionRef);
  const now = new Date();

  const dbPatch: Partial<KycSession> = { updatedAt: now };

  if (patch.fields) {
    const current = (session.candidateFields ?? {}) as Partial<CinMarocFields>;
    const merged: Partial<CinMarocFields> = { ...current, ...patch.fields };
    dbPatch.candidateFields = merged as unknown as null;

    // ── Audit trail BAM/GAFI : consigner les champs modifiés vs OCR ──────
    // Un champ n'est audité que s'il différait déjà de la valeur OCR d'origine
    // (rectoOcrData / versoOcrData). Modifier un champ vide n'est pas une
    // "modification", c'est un simple complément.
    const rectoOcr = (session.rectoOcrData ?? {}) as Partial<CinMarocFields>;
    const versoOcr = (session.versoOcrData ?? {}) as Partial<CinMarocFields>;
    const ocrOrigin: Partial<CinMarocFields> = { ...rectoOcr, ...versoOcr };

    const existingModified = new Set(
      (Array.isArray(session.modifiedFields) ? session.modifiedFields : []) as string[]
    );

    for (const [field, newVal] of Object.entries(patch.fields)) {
      const key    = field as keyof CinMarocFields;
      const oldVal = String(current[key] ?? "").trim();
      const nextVal = String(newVal ?? "").trim();
      const ocrVal = String(ocrOrigin[key] ?? "").trim();
      // Vraie modification par l'agent : la valeur change et une valeur OCR existait
      if (nextVal !== oldVal && ocrVal && nextVal !== ocrVal) {
        existingModified.add(field);
      }
    }
    dbPatch.modifiedFields = Array.from(existingModified) as unknown as null;
  }
  if (patch.cbsFields) {
    dbPatch.cbsFields = patch.cbsFields as unknown as null;
  }

  const [updated] = await db.update(kycSessions).set(dbPatch)
    .where(eq(kycSessions.id, session.id))
    .returning();

  return updated!;
}

/**
 * Marque une session comme prête pour la revue agent.
 * Utilisé côté client self-service : le client confirme, l'agent traite.
 * Passe uniquement OCR_DONE → AGENT_REVIEW (idempotent si déjà après).
 */
export async function submitForAgentReview(sessionRef: string): Promise<KycSession> {
  const session = await requireValidSession(sessionRef);

  // Idempotent : si déjà en revue ou décidé, on retourne tel quel
  if (session.status === "AGENT_REVIEW" || session.status === "PENDING_CA" ||
      session.status === "DECIDED") {
    return session;
  }
  // Prérequis : au moins OCR terminé (recto + verso)
  if (session.status !== "OCR_DONE") {
    throw new Error(`Statut invalide pour soumission : ${session.status}`);
  }

  const [updated] = await db.update(kycSessions).set({
    status:    "AGENT_REVIEW",
    updatedAt: new Date(),
  }).where(eq(kycSessions.id, session.id)).returning();

  log.info({ sessionRef }, "Session soumise pour revue agent");
  return updated!;
}

// ─── Finalisation : création client final ────────────────────────────────────

export async function finalizeSession(input: FinalizeSessionInput): Promise<{
  session: KycSession;
  customerId: number;
  customerRef: string;
  kycStatus: string;
  screening: { status: string; matchScore: number; matchedEntity: string | null };
  modificationReport?: Array<{ field: string; submitted: string; ocr: string; coherent: boolean }>;
}> {
  const session = await requireValidSession(input.sessionRef);
  if (session.status === "DECIDED") {
    throw new Error(`Session ${input.sessionRef} déjà décidée (customer #${session.customerId})`);
  }
  if (!session.rectoUploaded) {
    throw new Error("Aucun recto uploadé — impossible de finaliser");
  }

  const now = new Date();
  const f = input.fields;

  // ── Vérification cohérence modifs vs OCR original ────────────────────────
  let modifCheck: Array<{ field: string; submitted: string; ocr: string; coherent: boolean }> = [];
  if (input.modified && input.modifiedFields?.length) {
    const ocrCombined: CinMarocOcrResult = {
      recto: (session.rectoOcrData ?? {}) as CinMarocFields,
      verso: (session.versoOcrData ?? {}) as CinMarocFields,
      merged: (session.candidateFields ?? {}) as CinMarocFields,
      confidence: { recto: session.rectoConfidence ?? 0, verso: session.versoConfidence ?? 0, overall: Math.round(((session.rectoConfidence ?? 0) + (session.versoConfidence ?? 0)) / 2) },
      mrzValid: false,
      rawRecto: "",
      rawVerso: "",
    };
    modifCheck = verifyModifiedFields(input.modifiedFields, f, ocrCombined);
  }

  // ── Vérification doublon CIN ─────────────────────────────────────────────
  if (f.cin) {
    const existing = await db.select({ id: customers.id, customerId: customers.customerId })
      .from(customers).where(eq(customers.nicNumber, f.cin.toUpperCase())).limit(1);
    if (existing.length > 0) {
      throw new Error(`Client CIN ${f.cin} déjà enregistré (${existing[0]!.customerId})`);
    }
  }

  // ── Création client ──────────────────────────────────────────────────────
  const customerRef = `KYC-${nanoid(8).toUpperCase()}`;
  const customer = await insertCustomer({
    customerId:   customerRef,
    firstName:    f.prenom ?? "",
    lastName:     (f.nom ?? "").toUpperCase(),
    dateOfBirth:  f.dateNaissance ?? null,
    nationality:  "MA",
    customerType: "INDIVIDUAL",
    kycStatus:    "PENDING",
    riskLevel:    "LOW",
    riskScore:    0,
    pepStatus:    false,
    nicNumber:    f.cin?.toUpperCase() ?? null,
    birthCity:    f.lieuNaissance ?? null,
    address:      f.adresse ?? null,
    city:         f.ville ?? null,
    cbsRef:       session.cbsRef ?? input.sessionRef,
  });

  // ── Screening sanctions ──────────────────────────────────────────────────
  const fullName        = `${f.nom ?? ""} ${f.prenom ?? ""}`.trim();
  const screeningResult = await screenCustomer(customer.id, fullName);

  let finalKycStatus: "PENDING" | "IN_REVIEW" | "REJECTED" = "PENDING";
  if (screeningResult.status === "MATCH")   finalKycStatus = "REJECTED";
  else if (screeningResult.status === "REVIEW") finalKycStatus = "IN_REVIEW";

  await db.update(customers)
    .set({
      kycStatus:      finalKycStatus,
      sanctionStatus: screeningResult.status === "CLEAR" ? "CLEAR" : screeningResult.status,
      updatedAt:      now,
    })
    .where(eq(customers.id, customer.id));

  // ── Notification CBS (si canal CBS_API) ─────────────────────────────────
  if (session.channel === "CBS_API") {
    await notifyCbs({
      event:       finalKycStatus === "PENDING" ? "KYC_APPROVED" : finalKycStatus === "REJECTED" ? "KYC_REJECTED" : "KYC_IN_REVIEW",
      customerId:  customer.id,
      customerRef: customer.customerId,
      cin:         f.cin ?? null,
      cbsRef:      session.cbsRef ?? input.sessionRef,
      riskLevel:   "LOW",
      reason:      `eKYC session finalisée — ${finalKycStatus}`,
      timestamp:   now.toISOString(),
    });
  }

  // ── Session status → DECIDED ────────────────────────────────────────────
  const [updated] = await db.update(kycSessions).set({
    status:         "DECIDED",
    customerId:     customer.id,
    decisionResult: {
      kycStatus:     finalKycStatus,
      screening:     screeningResult.status,
      matchScore:    screeningResult.sanctionsResult.matchScore,
      matchedEntity: screeningResult.sanctionsResult.matchedEntity,
    } as unknown as null,
    modifiedFields: (input.modifiedFields ?? []) as unknown as null,
    decidedAt:      now,
    updatedAt:      now,
  })
    .where(eq(kycSessions.id, session.id))
    .returning();

  log.info({
    sessionRef: input.sessionRef,
    customerId: customer.id,
    kycStatus:  finalKycStatus,
    channel:    session.channel,
    duration:   now.getTime() - session.startedAt.getTime(),
  }, "Session eKYC finalisée");

  return {
    session:      updated!,
    customerId:   customer.id,
    customerRef:  customer.customerId,
    kycStatus:    finalKycStatus,
    screening: {
      status:        screeningResult.status,
      matchScore:    screeningResult.sanctionsResult.matchScore ?? 0,
      matchedEntity: screeningResult.sanctionsResult.matchedEntity,
    },
    ...(modifCheck.length > 0 ? { modificationReport: modifCheck } : {}),
  };
}

// ─── Abandon explicite ───────────────────────────────────────────────────────

export async function abandonSession(sessionRef: string, reason?: string): Promise<void> {
  const session = await findSessionByRef(sessionRef);
  if (!session || session.status === "DECIDED" || session.status === "ABANDONED") return;

  await db.update(kycSessions).set({
    status: "ABANDONED",
    abandonedAt: new Date(),
    updatedAt: new Date(),
  })
    .where(eq(kycSessions.id, session.id));

  log.info({ sessionRef, reason }, "Session eKYC abandonnée");
}

// ─── Liste des sessions (filtrable) ──────────────────────────────────────────

export async function listSessions(opts: {
  agentUserId?: number;
  channel?:     KycSession["channel"];
  status?:      KycSession["status"] | KycSession["status"][];
  limit?:       number;
}): Promise<KycSession[]> {
  const conditions = [];
  if (opts.agentUserId) conditions.push(eq(kycSessions.agentUserId, opts.agentUserId));
  if (opts.channel)     conditions.push(eq(kycSessions.channel, opts.channel));
  if (opts.status) {
    if (Array.isArray(opts.status)) {
      conditions.push(or(...opts.status.map(s => eq(kycSessions.status, s)))!);
    } else {
      conditions.push(eq(kycSessions.status, opts.status));
    }
  }

  const query = conditions.length > 0
    ? db.select().from(kycSessions).where(and(...conditions))
    : db.select().from(kycSessions);

  return query
    .orderBy(desc(kycSessions.startedAt))
    .limit(opts.limit ?? 50);
}

// ─── Historique par CIN (détection doublon anticipée) ────────────────────────

export async function findExistingCustomerByCin(cin: string): Promise<{
  exists: boolean;
  customerRef?: string;
  customerId?: number;
  kycStatus?: string;
  riskLevel?: string;
} | null> {
  if (!cin) return { exists: false };
  const rows = await db.select({
    id:         customers.id,
    customerId: customers.customerId,
    kycStatus:  customers.kycStatus,
    riskLevel:  customers.riskLevel,
  })
    .from(customers)
    .where(eq(customers.nicNumber, cin.toUpperCase()))
    .limit(1);

  if (rows.length === 0) return { exists: false };
  const r = rows[0]!;
  return {
    exists:      true,
    customerId:  r.id,
    customerRef: r.customerId,
    kycStatus:   r.kycStatus,
    riskLevel:   r.riskLevel,
  };
}

// ─── Magic link pour self-service client ─────────────────────────────────────

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function generateMagicLink(sessionRef: string, validityMinutes = 30): Promise<{
  token: string;
  url:   string;
  expiresAt: Date;
}> {
  const session = await requireValidSession(sessionRef);

  // Token clair envoyé au client, hash stocké en DB (comme un password)
  const rawToken = randomBytes(24).toString("base64url");
  const hash     = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + validityMinutes * 60 * 1000);

  await db.update(kycSessions).set({
    magicToken:            hash,
    magicTokenExpiresAt:   expiresAt,
    updatedAt:             new Date(),
  })
    .where(eq(kycSessions.id, session.id));

  const baseUrl = process.env["PUBLIC_BASE_URL"] ?? "http://localhost:3000";
  const url = `${baseUrl}/kyc/${rawToken}`;

  log.info({ sessionRef, expiresAt, validityMinutes }, "Magic link généré");

  return { token: rawToken, url, expiresAt };
}

// ─── Nettoyage sessions expirées ─────────────────────────────────────────────

export async function abandonExpiredSessions(): Promise<number> {
  const now = new Date();
  const expired = await db.select({ id: kycSessions.id })
    .from(kycSessions)
    .where(and(
      lt(kycSessions.expiresAt, now),
      or(
        eq(kycSessions.status, "DRAFT"),
        eq(kycSessions.status, "RECTO_ONLY"),
        eq(kycSessions.status, "OCR_DONE"),
      )!,
    ));

  if (expired.length === 0) return 0;

  await db.update(kycSessions).set({
    status: "ABANDONED",
    abandonedAt: now,
    updatedAt: now,
  })
    .where(and(
      lt(kycSessions.expiresAt, now),
      or(
        eq(kycSessions.status, "DRAFT"),
        eq(kycSessions.status, "RECTO_ONLY"),
        eq(kycSessions.status, "OCR_DONE"),
      )!,
    ));

  log.info({ count: expired.length }, "Sessions eKYC expirées marquées abandonnées");
  return expired.length;
}
