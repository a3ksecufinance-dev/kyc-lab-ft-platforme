/**
 * Connecteur de télédéclaration TRACFIN / GoAML
 *
 * Modes de fonctionnement :
 *  1. SIMULATION (dev/staging)    — log + stockage local, pas d'envoi réel
 *  2. TRACFIN_PORTAL (prod FR)    — API REST TRACFIN portail télédéclaration
 *  3. GOAML_DIRECT (prod intl)    — dépôt direct GoAML UNODC
 *
 * En production, TRACFIN utilise une API REST avec :
 *  - Authentification mTLS (certificat client)
 *  - Bearer token JWT (renouvelable)
 *  - Endpoint POST /declarations
 *  - Réponse : accusé de réception + numéro TRACFIN (fiu_ref_number)
 *
 * Ce module implémente l'interface complète avec simulation réaliste
 * pour le dev/staging et les hooks pour la prod.
 */

import { redis } from "../../_core/redis";
import { createLogger } from "../../_core/logger";
import { validateGoAmlXml } from "./reports.goaml";
import { ENV } from "../../_core/env";

const log = createLogger("tracfin-connector");

// ─── Configuration ────────────────────────────────────────────────────────────

const TRACFIN_BASE_URL    = ENV.TRACFIN_API_URL    ?? "";
const TRACFIN_API_KEY     = ENV.TRACFIN_API_KEY    ?? "";
const TRACFIN_ENTITY_ID   = ENV.TRACFIN_ENTITY_ID;
const GOAML_ENDPOINT      = ENV.GOAML_API_URL      ?? "";
const TRANSMISSION_MODE   = ENV.TRANSMISSION_MODE  as TransmissionMode;

type TransmissionMode = "SIMULATION" | "TRACFIN_PORTAL" | "GOAML_DIRECT";

const REDIS_PREFIX = "tracfin:transmission:";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransmissionResult {
  success:        boolean;
  reportId:       string;
  transmissionId: string;       // ID interne de transmission
  fiuRefNumber:   string | null; // Numéro TRACFIN (null si simulation/échec)
  mode:           TransmissionMode;
  sentAt:         Date;
  acknowledgedAt: Date | null;
  status:         "SENT" | "ACKNOWLEDGED" | "REJECTED" | "SIMULATED" | "ERROR";
  errorMessage?:  string;
  xmlChecksum:    string;
  xmlSize:        number;
}

export interface TransmissionStatus {
  transmissionId:    string;
  fiuRefNumber:      string | null;
  status:            string;
  lastCheckedAt:     Date;
  errorMessage?:     string;
}

// ─── Générateur de numéro TRACFIN simulé ─────────────────────────────────────

function generateSimulatedFiuRef(reportId: string): string {
  const year  = new Date().getFullYear();
  const seq   = reportId.replace(/[^0-9]/g, "").slice(-6).padStart(6, "0");
  return `TRACFIN-${year}-${TRACFIN_ENTITY_ID}-${seq}`;
}

function generateTransmissionId(): string {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TX-${ts}-${rnd}`;
}

// ─── Persistance Redis des transmissions ──────────────────────────────────────

async function storeTransmission(result: TransmissionResult): Promise<void> {
  try {
    const key = `${REDIS_PREFIX}${result.reportId}`;
    await redis.setex(key, 90 * 24 * 3600, JSON.stringify(result)); // 90 jours
  } catch (err) {
    log.warn({ err }, "Erreur stockage transmission Redis");
  }
}

export async function getTransmissionStatus(reportId: string): Promise<TransmissionResult | null> {
  try {
    const data = await redis.get(`${REDIS_PREFIX}${reportId}`);
    return data ? (JSON.parse(data) as TransmissionResult) : null;
  } catch {
    return null;
  }
}

// ─── Mode SIMULATION ─────────────────────────────────────────────────────────

async function transmitSimulated(
  reportId: string,
  xml:      string,
  checksum: string,
): Promise<TransmissionResult> {
  const transmissionId = generateTransmissionId();
  const fiuRefNumber   = generateSimulatedFiuRef(reportId);

  log.info({
    reportId, transmissionId, fiuRefNumber,
    xmlSize: xml.length,
    mode:    "SIMULATION",
  }, "SIMULATION — XML GoAML prêt (pas d'envoi réel)");

  // En simulation, afficher les 200 premiers chars du XML dans les logs
  log.debug({ xmlPreview: xml.slice(0, 200) + "..." }, "XML GoAML simulé");

  const result: TransmissionResult = {
    success:        true,
    reportId,
    transmissionId,
    fiuRefNumber,
    mode:           "SIMULATION",
    sentAt:         new Date(),
    acknowledgedAt: new Date(), // simulation = accusé immédiat
    status:         "SIMULATED",
    xmlChecksum:    checksum,
    xmlSize:        xml.length,
  };

  await storeTransmission(result);
  return result;
}

// ─── Mode TRACFIN_PORTAL ──────────────────────────────────────────────────────

async function transmitTracfin(
  reportId: string,
  xml:      string,
  checksum: string,
): Promise<TransmissionResult> {
  const transmissionId = generateTransmissionId();

  if (!TRACFIN_BASE_URL || !TRACFIN_API_KEY) {
    throw new Error("TRACFIN_API_URL et TRACFIN_API_KEY requis en mode TRACFIN_PORTAL");
  }

  log.info({ reportId, transmissionId, endpoint: TRACFIN_BASE_URL }, "Envoi vers TRACFIN");

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${TRACFIN_BASE_URL}/declarations`, {
      method: "POST",
      headers: {
        "Content-Type":   "application/xml; charset=UTF-8",
        "Authorization":  `Bearer ${TRACFIN_API_KEY}`,
        "X-Report-Id":    reportId,
        "X-Checksum":     checksum,
        "X-Entity-Id":    TRACFIN_ENTITY_ID,
        "User-Agent":     "KYC-AML-Platform/2.0",
      },
      body:   xml,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`TRACFIN HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
    }

    // TRACFIN retourne un JSON avec le numéro de référence
    const ackData = await response.json() as {
      fiu_ref_number?: string;
      reference?:      string;
      status?:         string;
    };

    const fiuRefNumber = ackData.fiu_ref_number ?? ackData.reference ?? null;

    log.info({ reportId, fiuRefNumber, transmissionId }, "Accusé de réception TRACFIN reçu");

    const result: TransmissionResult = {
      success:        true,
      reportId,
      transmissionId,
      fiuRefNumber,
      mode:           "TRACFIN_PORTAL",
      sentAt:         new Date(),
      acknowledgedAt: fiuRefNumber ? new Date() : null,
      status:         fiuRefNumber ? "ACKNOWLEDGED" : "SENT",
      xmlChecksum:    checksum,
      xmlSize:        xml.length,
    };

    await storeTransmission(result);
    return result;

  } catch (err) {
    clearTimeout(timeout);
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error({ err, reportId, transmissionId }, "Erreur transmission TRACFIN");

    const result: TransmissionResult = {
      success:        false,
      reportId,
      transmissionId,
      fiuRefNumber:   null,
      mode:           "TRACFIN_PORTAL",
      sentAt:         new Date(),
      acknowledgedAt: null,
      status:         "ERROR",
      errorMessage:   errMsg,
      xmlChecksum:    checksum,
      xmlSize:        xml.length,
    };

    await storeTransmission(result);
    return result;
  }
}

// ─── Mode GOAML_DIRECT ────────────────────────────────────────────────────────

async function transmitGoAml(
  reportId: string,
  xml:      string,
  checksum: string,
): Promise<TransmissionResult> {
  const transmissionId = generateTransmissionId();

  if (!GOAML_ENDPOINT) {
    throw new Error("GOAML_API_URL requis en mode GOAML_DIRECT");
  }

  log.info({ reportId, transmissionId, endpoint: GOAML_ENDPOINT }, "Dépôt GoAML Direct");

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 30_000);

  try {
    // GoAML utilise multipart/form-data avec le fichier XML
    const formData = new FormData();
    formData.append("file", new Blob([xml], { type: "application/xml" }), `${reportId}.xml`);
    formData.append("report_id",   reportId);
    formData.append("entity_id",   TRACFIN_ENTITY_ID);
    formData.append("checksum",    checksum);

    const response = await fetch(`${GOAML_ENDPOINT}/upload`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${TRACFIN_API_KEY}`,
      },
      body:    formData,
      signal:  controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`GoAML HTTP ${response.status}`);
    }

    const ackData = await response.json() as { upload_id?: string; status?: string };

    const result: TransmissionResult = {
      success:        true,
      reportId,
      transmissionId,
      fiuRefNumber:   ackData.upload_id ?? null,
      mode:           "GOAML_DIRECT",
      sentAt:         new Date(),
      acknowledgedAt: new Date(),
      status:         "ACKNOWLEDGED",
      xmlChecksum:    checksum,
      xmlSize:        xml.length,
    };

    await storeTransmission(result);
    return result;

  } catch (err) {
    clearTimeout(timeout);
    const errMsg = err instanceof Error ? err.message : String(err);

    const result: TransmissionResult = {
      success:        false,
      reportId,
      transmissionId,
      fiuRefNumber:   null,
      mode:           "GOAML_DIRECT",
      sentAt:         new Date(),
      acknowledgedAt: null,
      status:         "ERROR",
      errorMessage:   errMsg,
      xmlChecksum:    checksum,
      xmlSize:        xml.length,
    };

    await storeTransmission(result);
    return result;
  }
}

// ─── Fonction principale ──────────────────────────────────────────────────────

export async function transmitReport(
  reportId: string,
  xml:      string,
  checksum: string,
): Promise<TransmissionResult> {
  // Validation structurelle avant envoi
  const { valid, errors } = validateGoAmlXml(xml);
  if (!valid) {
    const msg = `XML GoAML invalide : ${errors.join(", ")}`;
    log.error({ reportId, errors }, msg);
    throw new Error(msg);
  }

  switch (TRANSMISSION_MODE) {
    case "TRACFIN_PORTAL": return transmitTracfin(reportId, xml, checksum);
    case "GOAML_DIRECT":   return transmitGoAml(reportId, xml, checksum);
    case "SIMULATION":
    default:               return transmitSimulated(reportId, xml, checksum);
  }
}

export function getTransmissionMode(): TransmissionMode {
  return TRANSMISSION_MODE;
}
