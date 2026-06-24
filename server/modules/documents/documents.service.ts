import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { db } from "../../_core/db";
import { customers } from "../../../drizzle/schema";
import { saveFile, deleteFile, validateUploadedFile, getFileUrl } from "../../_core/upload";
import { runOcr } from "./ocr.service";
import { runEkyc } from "./ekyc.service";
import {
  insertDocument, findDocumentById, findDocumentsByCustomer,
  updateDocument, deleteDocument, getDocumentStats,
} from "./documents.repository";
import { createLogger } from "../../_core/logger";
import { screenCustomer } from "../screening/screening.service";
import { notifyCbs }      from "../connectors/cbs-notify.service";

const log = createLogger("documents");

// ─── Upload + OCR + eKYC pipeline ────────────────────────────────────────────

export async function uploadAndProcessDocument(input: {
  customerId:   number;
  documentType: string;
  buffer:       Buffer;
  originalName: string;
  mimeType:     string;
  size:         number;
}): Promise<Awaited<ReturnType<typeof findDocumentById>>> {
  const { customerId, documentType, buffer, originalName, mimeType, size } = input;

  // Valider le fichier
  const validation = validateUploadedFile(originalName, mimeType, size);
  if (!validation.valid) {
    throw new TRPCError({ code: "BAD_REQUEST", message: validation.error ?? "Fichier invalide" });
  }

  // Charger le client
  const [customer] = await db.select().from(customers)
    .where(eq(customers.id, customerId)).limit(1);
  if (!customer) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Client #${customerId} introuvable` });
  }

  // Stocker le fichier
  const stored = await saveFile(buffer, originalName, mimeType, `customer_${customerId}`);

  // Créer l'entrée DB avec statut PROCESSING
  const doc = await insertDocument({
    customerId,
    documentType:    documentType as "PASSPORT" | "ID_CARD" | "DRIVING_LICENSE" | "PROOF_OF_ADDRESS" | "SELFIE" | "BANK_STATEMENT" | "OTHER",
    fileName:        originalName,
    filePath:        stored.path,
    fileUrl:         stored.url,
    fileSize:        stored.size,
    mimeType,
    storageBackend:  stored.backend,
    status:          "PENDING",
    ekycStatus:      "PROCESSING",
  });

  // Lancer OCR + eKYC en asynchrone (fire-and-forget avec update DB)
  void processDocumentAsync(doc.id, buffer, mimeType, documentType, customer);

  return doc;
}

async function processDocumentAsync(
  docId:        number,
  buffer:       Buffer,
  mimeType:     string,
  documentType: string,
  customer:     { id: number; firstName: string; lastName: string; dateOfBirth: string | null },
): Promise<void> {
  try {
    // Étape 1 : OCR
    log.info({ docId, documentType }, "Démarrage OCR");
    const ocr = await runOcr(buffer, mimeType, documentType);

    await updateDocument(docId, {
      ocrData:       ocr as unknown as null,
      ocrRawText:    ocr.rawText,
      ocrConfidence: ocr.confidence,
      ocrProcessedAt: new Date(),
      mrzData:       (ocr.mrz ?? null) as unknown as null,
      // Mettre à jour les champs document si OCR les a extraits
      ...(ocr.documentNumber ? { documentNumber: ocr.documentNumber } : {}),
      ...(ocr.expiryDate     ? { expiryDate:     ocr.expiryDate     } : {}),
      ...(ocr.issuingCountry ? { issuingCountry: ocr.issuingCountry } : {}),
      ekycStatus: "PROCESSING",
    });

    // Étape 2 : eKYC
    log.info({ docId }, "Démarrage eKYC");
    const ekyc = await runEkyc(ocr, documentType, {
      id:          customer.id,
      firstName:   customer.firstName,
      lastName:    customer.lastName,
      dateOfBirth: customer.dateOfBirth,
    }, undefined, buffer);

    const docStatus: "VERIFIED" | "PENDING" | "REJECTED" =
      ekyc.status === "PASS"   ? "VERIFIED"
      : ekyc.status === "FAIL" ? "REJECTED"
      : "PENDING";

    await updateDocument(docId, {
      ekycStatus:      ekyc.status,
      ekycScore:       ekyc.score,
      ekycChecks:      ekyc.checks as unknown as null,
      ekycProvider:    ekyc.provider,
      ekycProcessedAt: ekyc.processedAt,
      status:          docStatus,
      // Enrichir les champs document depuis eKYC
      ...(ekyc.extractedDocNumber ? { documentNumber: ekyc.extractedDocNumber } : {}),
      ...(ekyc.extractedExpiry    ? { expiryDate:     ekyc.extractedExpiry    } : {}),
      ...(ekyc.extractedCountry   ? { issuingCountry: ekyc.extractedCountry   } : {}),
    });

    // ── Post-approbation : re-screening + mise à jour KYC ────────────────────
    if (ekyc.status === "PASS" && documentType !== "PROOF_OF_ADDRESS" && documentType !== "SELFIE") {
      const doc     = await findDocumentById(docId);
      const custId  = doc!.customerId;
      const cust    = await db.select().from(customers).where(eq(customers.id, custId)).limit(1).then(r => r[0]!);
      const now     = new Date();

      // Re-screening sanctions (document approuvé = opportunité de re-vérifier)
      try {
        const fullName = `${cust.lastName} ${cust.firstName}`.trim();
        const screening = await screenCustomer(custId, fullName);

        if (screening.status === "MATCH") {
          // Sanctions match découvert lors de la validation du document
          await db.update(customers)
            .set({ kycStatus: "REJECTED", sanctionStatus: "MATCH", updatedAt: now })
            .where(eq(customers.id, custId));

          await notifyCbs({
            event: "KYC_REJECTED", customerId: custId,
            customerRef: cust.customerId, cin: cust.nicNumber,
            cbsRef: cust.cbsRef, riskLevel: cust.riskLevel,
            reason: `Correspondance sanctions détectée lors de la validation du document : ${screening.sanctionsResult.matchedEntity}`,
            timestamp: now.toISOString(),
          });
          log.warn({ custId, matched: screening.sanctionsResult.matchedEntity }, "Sanctions match post-upload document");
          return;
        }
      } catch (screenErr) {
        log.error({ screenErr, custId }, "Re-screening post-document échoué — poursuite");
      }

      // Document valide + screening CLEAR → APPROVED
      const previousStatus = cust.kycStatus;
      const nextReview     = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

      await db.update(customers)
        .set({ kycStatus: "APPROVED", nextReviewDate: nextReview, lastReviewDate: now, updatedAt: now })
        .where(eq(customers.id, custId));

      // Notifier le CBS si le client était bloqué
      if (previousStatus !== "APPROVED") {
        await notifyCbs({
          event: "KYC_APPROVED", customerId: custId,
          customerRef: cust.customerId, cin: cust.nicNumber,
          cbsRef: cust.cbsRef, riskLevel: cust.riskLevel,
          reason: `Nouveau document validé (OCR+eKYC PASS) — client réactivé (était ${previousStatus})`,
          timestamp: now.toISOString(),
        });
        log.info({ custId, previousStatus }, "Client réactivé après validation document");
      }

      log.info({ docId, custId }, "KYC client mis à jour : APPROVED");
    }

    log.info({ docId, ekycStatus: ekyc.status, score: ekyc.score }, "Document traité");

  } catch (err) {
    log.error({ err, docId }, "Erreur traitement document");
    await updateDocument(docId, {
      ekycStatus: "FAIL",
      status:     "PENDING",
      notes:      `Erreur traitement : ${err instanceof Error ? err.message : String(err)}`,
    }).catch(() => undefined);
  }
}

// ─── Autres opérations ────────────────────────────────────────────────────────

export async function getDocument(id: number) {
  const doc = await findDocumentById(id);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: `Document #${id} introuvable` });

  // Générer une URL signée si S3
  if (doc.storageBackend === "s3" && doc.filePath) {
    const signedUrl = await getFileUrl(doc.filePath, "s3");
    return { ...doc, fileUrl: signedUrl };
  }
  return doc;
}

export async function getCustomerDocuments(customerId: number) {
  return findDocumentsByCustomer(customerId);
}

export async function manuallyVerifyDocument(
  id: number, verifiedBy: number, notes?: string
) {
  const doc = await findDocumentById(id);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: `Document #${id} introuvable` });

  return updateDocument(id, {
    status:     "VERIFIED",
    ekycStatus: "PASS",
    verifiedBy,
    verifiedAt: new Date(),
    ...(notes ? { notes } : {}),
  });
}

export async function rejectDocument(id: number, reason: string) {
  const doc = await findDocumentById(id);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: `Document #${id} introuvable` });
  return updateDocument(id, { status: "REJECTED", ekycStatus: "FAIL", notes: reason });
}

export async function removeDocument(id: number) {
  const doc = await findDocumentById(id);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: `Document #${id} introuvable` });
  if (doc.filePath) {
    await deleteFile(doc.filePath, (doc.storageBackend as "local" | "s3") ?? "local");
  }
  await deleteDocument(id);
}

export { getDocumentStats };
