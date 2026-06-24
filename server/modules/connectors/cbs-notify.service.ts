/**
 * CBS Notification Service — webhooks sortants vers le CBS
 *
 * Notifie le CBS quand le statut KYC d'un client change, afin que le CBS
 * puisse adapter les limites du compte (réduction plafond, blocage, réactivation).
 *
 * Désactivable via CBS_NOTIFY_ENABLED=false (staging sans CBS réel).
 * En cas d'échec : log + retry 1x, puis abandon (non-bloquant).
 */

import { ENV }          from "../../_core/env";
import { createLogger } from "../../_core/logger";

const log = createLogger("cbs-notify");

// ─── Types ────────────────────────────────────────────────────────────────────

export type CbsKycEvent =
  | "KYC_APPROVED"          // document validé, compte pleinement actif
  | "KYC_IN_REVIEW"         // document expiré, compte en révision
  | "KYC_REJECTED"          // sanctions / fraude, compte bloqué
  | "KYC_DOC_EXPIRING_SOON" // avertissement J-30 / J-7
  | "KYC_DOC_EXPIRED"       // document expiré (J+0)
  | "KYC_GRACE_ENDING"      // fin de grâce approche (J+15)
  | "KYC_BLOCK_REQUIRED";   // blocage total requis (J+30)

export interface CbsNotifyPayload {
  event:       CbsKycEvent;
  customerId:  number;
  customerRef: string;       // KYC-XXXXXXXX
  cin:         string | null;
  cbsRef:      string | null;  // référence CBS d'origine
  riskLevel:   string;
  daysExpired?: number;
  daysUntilBlock?: number;
  reason:      string;
  timestamp:   string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export async function notifyCbs(payload: CbsNotifyPayload): Promise<void> {
  const enabled    = (ENV as Record<string, unknown>)["CBS_NOTIFY_ENABLED"] !== false;
  const webhookUrl = (ENV as Record<string, unknown>)["CBS_WEBHOOK_URL"] as string | undefined;

  if (!enabled) {
    log.debug({ event: payload.event, customerId: payload.customerId }, "CBS notify désactivé — ignoré");
    return;
  }

  if (!webhookUrl) {
    log.warn({ event: payload.event }, "CBS_WEBHOOK_URL non configurée — notification ignorée");
    return;
  }

  const apiKey = (ENV as Record<string, unknown>)["CBS_ONBOARDING_API_KEY"] as string;

  const body = JSON.stringify(payload);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "X-KYC-Api-Key": apiKey,
          "X-KYC-Source":  "KYC-AML-Platform-v2",
        },
        body,
        signal: AbortSignal.timeout(8_000),
      });

      if (!res.ok) {
        throw new Error(`CBS webhook HTTP ${res.status}`);
      }

      log.info({ event: payload.event, customerId: payload.customerId, attempt }, "CBS notifié");
      return;

    } catch (err) {
      if (attempt === 2) {
        log.error({ err, event: payload.event, customerId: payload.customerId }, "CBS notification échouée (2 tentatives)");
      } else {
        log.warn({ err, event: payload.event, attempt }, "CBS notification échouée — retry");
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }
}
