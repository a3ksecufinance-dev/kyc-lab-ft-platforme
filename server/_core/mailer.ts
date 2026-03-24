/**
 * Service email centralisé — Resend.com
 *
 * Notifications envoyées automatiquement :
 *   - Alerte CRITICAL générée → email au responsable assigné / superviseurs
 *   - Rapport SAR/STR créé → email au Compliance Officer pour approbation
 *   - Document KYC rejeté → email à l'analyste
 *   - Screening MATCH → email au superviseur
 *
 * Fallback dev : si RESEND_API_KEY absent → log console uniquement
 */

import { ENV } from "./env";
import { createLogger } from "./logger";

const log = createLogger("mailer");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailPayload {
  to:      string | string[];
  subject: string;
  html:    string;
  text?:   string;
}

// ─── Envoi générique ──────────────────────────────────────────────────────────

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const { to, subject, html } = payload;
  const recipients = Array.isArray(to) ? to : [to];

  if (!recipients.length || recipients.every(r => !r)) return false;

  if (!ENV.RESEND_API_KEY) {
    log.warn({ to: recipients, subject }, "Email non envoyé — RESEND_API_KEY absent (dev)");
    log.info(`[EMAIL SIMULÉ]\nÀ: ${recipients.join(", ")}\nSujet: ${subject}\n---`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${ENV.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: ENV.EMAIL_FROM ?? "noreply@kyc-aml.local",
        to:   recipients,
        subject,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log.error({ status: res.status, err, subject }, "Erreur Resend API");
      return false;
    }

    log.info({ to: recipients, subject }, "Email envoyé");
    return true;
  } catch (err) {
    log.error({ err, subject }, "Erreur envoi email");
    return false;
  }
}

// ─── Templates prêts à l'emploi ───────────────────────────────────────────────

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#080c10;font-family:monospace;">
  <div style="max-width:520px;margin:32px auto;padding:0 16px;">
    <div style="background:#0d1117;border:1px solid #21262d;border-radius:12px;overflow:hidden;">
      <div style="background:#161b22;border-bottom:1px solid #21262d;padding:16px 24px;display:flex;align-items:center;gap:10px;">
        <span style="color:#58a6ff;font-size:16px;font-weight:600;">⚡ KYC-AML Platform</span>
      </div>
      <div style="padding:24px;">${content}</div>
      <div style="border-top:1px solid #21262d;padding:12px 24px;text-align:center;">
        <span style="color:#484f58;font-size:11px;">Accès restreint — Système de conformité réglementaire</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Alerte critique
export async function notifyCriticalAlert(params: {
  to:          string[];
  alertId:     string;
  customerName: string;
  scenario:    string;
  riskScore:   number;
  alertUrl:    string;
}): Promise<void> {
  const { to, alertId, customerName, scenario, riskScore, alertUrl } = params;
  if (!to.length) return;

  const html = baseTemplate(`
    <div style="background:#f8514920;border:1px solid #f8514940;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <span style="color:#f85149;font-size:13px;font-weight:600;">⚠ Alerte CRITIQUE — Action requise</span>
    </div>
    <p style="color:#e6edf3;font-size:14px;margin:0 0 16px;">
      Une alerte de niveau <strong style="color:#f85149;">CRITIQUE</strong> a été générée.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${[
        ["Alerte",   alertId],
        ["Client",   customerName],
        ["Scénario", scenario],
        ["Score",    `${riskScore}/100`],
      ].map(([k, v]) => `
        <tr>
          <td style="color:#7d8590;font-size:12px;padding:6px 0;width:40%">${k}</td>
          <td style="color:#e6edf3;font-size:12px;padding:6px 0;">${v}</td>
        </tr>`).join("")}
    </table>
    <a href="${alertUrl}" style="display:inline-block;background:#1f6feb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">
      Voir l'alerte →
    </a>
  `);

  await sendEmail({ to, subject: `[CRITIQUE] Alerte ${alertId} — ${customerName}`, html });
}

// Rapport SAR/STR à approuver
export async function notifyReportPendingApproval(params: {
  to:         string[];
  reportId:   string;
  reportType: string;
  createdBy:  string;
  reportUrl:  string;
}): Promise<void> {
  const { to, reportId, reportType, createdBy, reportUrl } = params;
  if (!to.length) return;

  const html = baseTemplate(`
    <p style="color:#e6edf3;font-size:14px;margin:0 0 16px;">
      Un rapport <strong>${reportType}</strong> est en attente de votre approbation.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${[
        ["Rapport", reportId],
        ["Type",    reportType],
        ["Créé par", createdBy],
      ].map(([k, v]) => `
        <tr>
          <td style="color:#7d8590;font-size:12px;padding:6px 0;width:40%">${k}</td>
          <td style="color:#e6edf3;font-size:12px;padding:6px 0;">${v}</td>
        </tr>`).join("")}
    </table>
    <a href="${reportUrl}" style="display:inline-block;background:#1f6feb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">
      Réviser le rapport →
    </a>
  `);

  await sendEmail({ to, subject: `Rapport ${reportType} ${reportId} en attente d'approbation`, html });
}

// Screening MATCH
export async function notifyScreeningMatch(params: {
  to:           string[];
  customerName: string;
  customerId:   number;
  listSource:   string;
  matchScore:   number;
  screeningUrl: string;
}): Promise<void> {
  const { to, customerName, customerId, listSource, matchScore, screeningUrl } = params;
  if (!to.length) return;

  const html = baseTemplate(`
    <div style="background:#d2992220;border:1px solid #d2992240;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <span style="color:#d29922;font-size:13px;font-weight:600;">🔍 Correspondance sanctions détectée</span>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${[
        ["Client",        customerName],
        ["ID",            String(customerId)],
        ["Liste",         listSource],
        ["Score de match", `${matchScore}/100`],
      ].map(([k, v]) => `
        <tr>
          <td style="color:#7d8590;font-size:12px;padding:6px 0;width:40%">${k}</td>
          <td style="color:#e6edf3;font-size:12px;padding:6px 0;">${v}</td>
        </tr>`).join("")}
    </table>
    <a href="${screeningUrl}" style="display:inline-block;background:#d29922;color:#0d1117;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">
      Réviser la correspondance →
    </a>
  `);

  await sendEmail({ to, subject: `[SANCTIONS] Correspondance détectée — ${customerName}`, html });
}
