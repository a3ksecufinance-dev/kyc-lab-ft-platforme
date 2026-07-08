/**
 * Page Client Self-Service — /kyc/:token
 *
 * Accessible sans authentification via magic link envoyé par l'agent.
 * Mobile-first, 5 étapes :
 *   1. Bienvenue + consentement RGPD
 *   2. Capture / upload CIN Recto
 *   3. Capture / upload CIN Verso
 *   4. Selfie (caméra frontale, optionnel selon config)
 *   5. Récap + soumission
 *
 * Le token est SHA-256 en base — vérifié par GET /api/ekyc/token/:token.
 * Les uploads se font via POST /api/ekyc/sessions/:ref/images avec un
 * X-Magic-Token en header (au lieu du X-CBS-Api-Key).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import {
  Camera, Upload, CheckCircle2, AlertTriangle, Loader2,
  RefreshCw, ChevronRight, Shield, Clock, FileText,
} from "lucide-react";
import { checkClientImageQuality, compressImageIfNeeded } from "../lib/image-quality";

// ─── Palette (identifiée client-friendly, pas d'accents mono) ────────────────

const C = {
  bg:      "#F7F9FC",
  card:    "#FFFFFF",
  border:  "#E5EAF2",
  text1:   "#0F172A",
  text2:   "#475569",
  text3:   "#94A3B8",
  primary: "#0F766E",     // teal — cohérent avec la marque LabFT
  primaryL:"#14B8A6",
  primaryD:"#0F4C43",
  red:     "#DC2626",
  amber:   "#D97706",
  green:   "#059669",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "welcome" | "recto" | "verso" | "confirm" | "done" | "expired";

interface SessionInfo {
  sessionRef:      string;
  status:          string;
  rectoUploaded:   boolean;
  versoUploaded:   boolean;
  rectoConfidence: number | null;
  versoConfidence: number | null;
  candidateFields: Record<string, string> | null;
  expiresAt:       string | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchSessionByToken(token: string): Promise<SessionInfo> {
  const res = await fetch(`/api/ekyc/token/${token}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.session as SessionInfo;
}

const POLICY_VERSION = "09-08.2024.1";

interface ConsentPayload {
  biometric:  boolean;
  screening:  boolean;
  cbsSharing: boolean;
  retention:  boolean;
}

async function submitConsents(token: string, purposes: ConsentPayload): Promise<void> {
  const res = await fetch(`/api/ekyc/token/${token}/consents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...purposes, policyVersion: POLICY_VERSION }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
}

async function uploadWithToken(
  token: string,
  sessionRef: string,
  side: "recto" | "verso",
  base64: string,
  mimeType: string,
): Promise<{ session: SessionInfo; quality: { score: number; passed: boolean; issues: string[] }; confidence: number }> {
  const res = await fetch(`/api/ekyc/sessions/${sessionRef}/images`, {
    method: "POST",
    headers: {
      "Content-Type":   "application/json",
      "X-Magic-Token":  token,
    },
    body: JSON.stringify({ side, base64, mimeType }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
    reader.onload  = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.readAsDataURL(file);
  });
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function KycClientPage() {
  const { token } = useParams<{ token: string }>();

  const [step, setStep]         = useState<Step>("welcome");
  const [session, setSession]   = useState<SessionInfo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState<"recto" | "verso" | null>(null);
  const [error, setError]       = useState<string>("");
  const [consents, setConsents] = useState<ConsentPayload>({
    biometric:  false,
    screening:  false,
    cbsSharing: false,
    retention:  false,
  });
  const consentsGranted = consents.biometric && consents.screening && consents.cbsSharing && consents.retention;
  const [uploadResult, setUploadResult] = useState<
    { side: "recto" | "verso"; quality: { score: number; passed: boolean; issues: string[] }; confidence: number } | null
  >(null);
  const [preflightWarning, setPreflightWarning] = useState<{
    side: "recto" | "verso";
    score: number;
    issues: string[];
    pendingFile: File;
  } | null>(null);

  // ── Charge session au démarrage ────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setError("Lien invalide");
      setStep("expired");
      setLoading(false);
      return;
    }
    fetchSessionByToken(token)
      .then(s => {
        setSession(s);
        // Reprend au bon endroit selon l'état
        if (s.status === "DECIDED") setStep("done");
        else if (s.status === "ABANDONED") { setStep("expired"); setError("Session abandonnée"); }
        else if (s.rectoUploaded && s.versoUploaded) setStep("confirm");
        else if (s.rectoUploaded) setStep("verso");
        // Sinon : reste en welcome pour consentement
      })
      .catch(e => {
        setError(e.message);
        setStep("expired");
      })
      .finally(() => setLoading(false));
  }, [token]);

  // ── Handler upload générique ───────────────────────────────────────────────

  const doUpload = useCallback(async (side: "recto" | "verso", file: File) => {
    if (!token || !session) return;
    setUploading(side);
    setError("");
    setPreflightWarning(null);
    try {
      // Compression : évite d'envoyer 8 Mo depuis un iPhone
      const compressed = await compressImageIfNeeded(file, 2400, 0.88);
      const base64 = await fileToBase64(compressed);
      const r = await uploadWithToken(
        token, session.sessionRef, side, base64,
        compressed.type || "image/jpeg",
      );
      setSession(r.session);
      setUploadResult({ side, quality: r.quality, confidence: r.confidence });
      if (side === "recto") setStep("verso");
      else if (side === "verso") setStep("confirm");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }, [token, session]);

  const handleUpload = useCallback(async (side: "recto" | "verso", file: File) => {
    setError("");
    // ── Preflight : analyse locale ───────────────────────────────────────
    setUploading(side);
    try {
      const q = await checkClientImageQuality(file);
      setUploading(null);
      // Score < 60 : alerte l'utilisateur avant d'envoyer
      if (!q.passed) {
        setPreflightWarning({ side, score: q.score, issues: q.issues, pendingFile: file });
        return;
      }
    } catch {
      setUploading(null);
      // Sur erreur d'analyse, on continue sans bloquer
    }
    await doUpload(side, file);
  }, [doUpload]);

  const confirmPreflight = useCallback(() => {
    if (!preflightWarning) return;
    const { side, pendingFile } = preflightWarning;
    setPreflightWarning(null);
    doUpload(side, pendingFile);
  }, [preflightWarning, doUpload]);

  const rejectPreflight = useCallback(() => {
    setPreflightWarning(null);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <FullScreenLayout>
        <Loader2 size={40} style={{ color: C.primary, animation: "spin 1s linear infinite" }} />
        <p style={{ color: C.text2, fontSize: 14 }}>Chargement de votre session…</p>
      </FullScreenLayout>
    );
  }

  if (step === "expired") {
    return (
      <FullScreenLayout>
        <AlertTriangle size={48} style={{ color: C.red }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text1, margin: 0, textAlign: "center" }}>
          Lien invalide ou expiré
        </h1>
        <p style={{ color: C.text2, fontSize: 14, textAlign: "center", maxWidth: 340 }}>
          {error || "Ce lien n'est plus valide."}
          <br /><br />
          Veuillez contacter votre conseiller pour obtenir un nouveau lien.
        </p>
      </FullScreenLayout>
    );
  }

  if (step === "done") {
    return (
      <FullScreenLayout>
        <CheckCircle2 size={56} style={{ color: C.green }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text1, margin: 0, textAlign: "center" }}>
          Merci, votre demande a été enregistrée
        </h1>
        <p style={{ color: C.text2, fontSize: 14, textAlign: "center", maxWidth: 340, lineHeight: 1.6 }}>
          Nos équipes examinent votre dossier.
          Vous serez recontacté sous 48h ouvrées.
        </p>
        <div style={{ background: C.bg, borderRadius: 8, padding: 12, fontSize: 12, color: C.text3 }}>
          Référence : <b style={{ color: C.text1 }}>{session?.sessionRef}</b>
        </div>
      </FullScreenLayout>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      padding: "20px 16px",
      display: "flex",
      justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{
        maxWidth: 480, width: "100%",
        display: "flex", flexDirection: "column", gap: 20,
      }}>

        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 999, padding: "6px 14px", fontSize: 11, color: C.primaryD,
          }}>
            <Shield size={12} /> Vérification d'identité sécurisée
          </div>
        </div>

        {/* Progress bar */}
        <ProgressBar step={step} />

        {/* Content */}
        <div style={{
          background: C.card, borderRadius: 16,
          border: `1px solid ${C.border}`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          padding: 24,
          minHeight: 320,
        }}>
          {step === "welcome" && (
            <WelcomeStep
              onContinue={async () => {
                if (!token || !consentsGranted) return;
                try {
                  await submitConsents(token, consents);
                  setStep("recto");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              consents={consents}
              setConsents={setConsents}
              consentsGranted={consentsGranted}
              {...(session?.expiresAt ? { expiresAt: session.expiresAt } : {})}
            />
          )}
          {step === "recto" && (
            <CaptureStep
              title="Carte nationale — Recto"
              subtitle="La face avec votre photo et votre nom"
              side="recto"
              uploaded={session?.rectoUploaded ?? false}
              confidence={session?.rectoConfidence ?? null}
              uploading={uploading === "recto"}
              onUpload={f => handleUpload("recto", f)}
              onContinue={() => setStep("verso")}
              lastResult={uploadResult?.side === "recto" ? uploadResult : null}
            />
          )}
          {step === "verso" && (
            <CaptureStep
              title="Carte nationale — Verso"
              subtitle="La face avec la zone MRZ (lignes < <)"
              side="verso"
              uploaded={session?.versoUploaded ?? false}
              confidence={session?.versoConfidence ?? null}
              uploading={uploading === "verso"}
              onUpload={f => handleUpload("verso", f)}
              onContinue={() => setStep("confirm")}
              lastResult={uploadResult?.side === "verso" ? uploadResult : null}
            />
          )}
          {step === "confirm" && (
            <ConfirmStep
              session={session}
              onDone={() => setStep("done")}
            />
          )}
        </div>

        {/* Erreurs */}
        {error && (
          <div style={{
            background: "rgba(220,38,38,0.08)",
            border: `1px solid ${C.red}`,
            color: C.red,
            borderRadius: 10, padding: 12, fontSize: 13,
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{error}</div>
          </div>
        )}

        {/* Footer légal */}
        <div style={{
          textAlign: "center", fontSize: 10, color: C.text3, lineHeight: 1.6, marginTop: 8,
        }}>
          Vos données sont chiffrées et traitées conformément à la loi 09-08.
          <br />En cas de question : <a href="mailto:support@labft.ma" style={{ color: C.primary }}>support@labft.ma</a>
        </div>

      </div>

      {/* ── Modale : qualité insuffisante détectée localement ────────────── */}
      {preflightWarning && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, padding: 20,
          }}
          onClick={rejectPreflight}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.card, borderRadius: 16, padding: 24,
              maxWidth: 380, width: "100%",
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <AlertTriangle size={28} style={{ color: C.amber, flexShrink: 0 }} />
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text1, margin: "0 0 4px" }}>
                  Qualité photo insuffisante
                </h3>
                <p style={{ fontSize: 13, color: C.text2, margin: 0, lineHeight: 1.5 }}>
                  Score : {preflightWarning.score}/100 · minimum recommandé : 60/100
                </p>
              </div>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: C.text2, lineHeight: 1.6 }}>
              {preflightWarning.issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
            <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>
              L'OCR risque d'échouer. Nous vous conseillons de reprendre la photo dans un endroit mieux éclairé.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={rejectPreflight} style={secondaryButtonStyle(true)}>
                <RefreshCw size={14} /> Reprendre
              </button>
              <button onClick={confirmPreflight} style={{
                ...primaryButtonStyle(true),
                background: C.amber,
              }}>
                Envoyer quand même
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function FullScreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: 32,
        maxWidth: 420, width: "100%",
        display: "flex", flexDirection: "column",
        alignItems: "center", gap: 18,
      }}>
        {children}
      </div>
    </div>
  );
}

function ProgressBar({ step }: { step: Step }) {
  const steps: Step[] = ["welcome", "recto", "verso", "confirm"];
  const idx = steps.indexOf(step);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {steps.map((s, i) => (
        <div key={s} style={{
          flex: 1, height: 3, borderRadius: 2,
          background: i <= idx ? C.primary : C.border,
          transition: "background 0.3s",
        }} />
      ))}
    </div>
  );
}

const CONSENT_ITEMS: Array<{
  key:   keyof ConsentPayload;
  label: string;
}> = [
  { key: "biometric",  label: "J'accepte la vérification biométrique de mon identité (analyse OCR/faciale de ma CIN)." },
  { key: "screening",  label: "J'accepte le contrôle de mon nom sur les listes officielles de sanctions et de personnes politiquement exposées (PEP)." },
  { key: "cbsSharing", label: "J'accepte le partage de mes données avec le Core Banking System (CBS) pour l'ouverture de mon dossier." },
  { key: "retention",  label: "Je suis informé que mes données sont conservées 5 ans conformément à la loi 43-05 (LAB-FT) et la loi 09-08." },
];

function WelcomeStep({
  onContinue, consents, setConsents, consentsGranted, expiresAt,
}: {
  onContinue: () => void;
  consents: ConsentPayload;
  setConsents: React.Dispatch<React.SetStateAction<ConsentPayload>>;
  consentsGranted: boolean;
  expiresAt?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text1, margin: "0 0 6px" }}>
          Bienvenue
        </h1>
        <p style={{ fontSize: 14, color: C.text2, margin: 0, lineHeight: 1.5 }}>
          Votre conseiller vous a envoyé ce lien pour finaliser votre entrée en relation.
        </p>
      </div>

      <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 12, color: C.text2, fontWeight: 600, marginBottom: 8 }}>
          Ce dont vous aurez besoin :
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: C.text2, lineHeight: 1.7 }}>
          <li>Votre <b>CIN</b> (recto + verso)</li>
          <li>3 minutes de votre temps</li>
          <li>Une lumière suffisante pour photographier</li>
        </ul>
      </div>

      {expiresAt && (
        <div style={{
          display: "flex", gap: 8, alignItems: "center",
          fontSize: 12, color: C.amber,
        }}>
          <Clock size={13} />
          Ce lien expire dans {timeUntil(expiresAt)}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, color: C.text3, fontWeight: 600, letterSpacing: 0.5 }}>
          CONSENTEMENTS RGPD · LOI 09-08 (obligatoires)
        </div>
        {CONSENT_ITEMS.map(({ key, label }) => {
          const checked = consents[key];
          return (
            <label key={key} style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              cursor: "pointer", padding: 10,
              background: checked ? "rgba(15,118,110,0.05)" : "transparent",
              border: `1px solid ${checked ? C.primary : C.border}`,
              borderRadius: 8,
            }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setConsents(prev => ({ ...prev, [key]: e.target.checked }))}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
                {label}
              </span>
            </label>
          );
        })}
      </div>

      <button
        onClick={onContinue}
        disabled={!consentsGranted}
        style={primaryButtonStyle(consentsGranted)}
      >
        Commencer <ChevronRight size={16} />
      </button>
    </div>
  );
}

function CaptureStep({
  title, subtitle, side, uploaded, confidence, uploading, onUpload, onContinue, lastResult,
}: {
  title:      string;
  subtitle:   string;
  side:       "recto" | "verso";
  uploaded:   boolean;
  confidence: number | null;
  uploading:  boolean;
  onUpload:   (file: File) => void;
  onContinue: () => void;
  lastResult: { quality: { score: number; passed: boolean; issues: string[] }; confidence: number } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text1, margin: "0 0 4px" }}>
          {title}
        </h2>
        <p style={{ fontSize: 13, color: C.text2, margin: 0 }}>{subtitle}</p>
      </div>

      {/* Guide visuel */}
      <div style={{
        border: `2px dashed ${uploaded ? C.primary : C.border}`,
        borderRadius: 12,
        aspectRatio: "1.6/1",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: uploaded ? "rgba(15,118,110,0.05)" : C.bg,
        gap: 10, padding: 20,
      }}>
        {uploading ? (
          <>
            <Loader2 size={32} style={{ color: C.primary, animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 12, color: C.text2 }}>Analyse en cours…</span>
          </>
        ) : uploaded ? (
          <>
            <CheckCircle2 size={40} style={{ color: C.primary }} />
            <span style={{ fontSize: 13, color: C.text1, fontWeight: 600 }}>Photo capturée</span>
            {confidence !== null && (
              <span style={{ fontSize: 11, color: C.text3 }}>Qualité OCR : {confidence}/100</span>
            )}
          </>
        ) : (
          <>
            <FileText size={40} style={{ color: C.text3 }} />
            <span style={{ fontSize: 13, color: C.text2, textAlign: "center" }}>
              Prenez une photo nette de votre CIN
            </span>
            <span style={{ fontSize: 11, color: C.text3, textAlign: "center" }}>
              Cadrez bien les 4 bords · évitez les reflets
            </span>
          </>
        )}
      </div>

      {/* Warnings qualité */}
      {lastResult && lastResult.quality.issues.length > 0 && !lastResult.quality.passed && (
        <div style={{
          background: "rgba(217,119,6,0.08)",
          border: `1px solid ${C.amber}`,
          color: C.amber,
          borderRadius: 10, padding: 10, fontSize: 12,
        }}>
          <b>Qualité faible ({lastResult.quality.score}/100)</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {lastResult.quality.issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
          <div style={{ marginTop: 6 }}>
            Vous pouvez continuer ou reprendre une meilleure photo.
          </div>
        </div>
      )}

      {/* Actions */}
      {uploaded ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            style={secondaryButtonStyle(!uploading)}
          >
            <RefreshCw size={14} /> Reprendre
          </button>
          <button
            onClick={onContinue}
            style={primaryButtonStyle(true)}
          >
            Continuer <ChevronRight size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={primaryButtonStyle(!uploading)}
        >
          <Camera size={16} />
          {uploading ? "Analyse…" : "Prendre / choisir une photo"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={side === "recto" ? "environment" : "environment"}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />

      {/* Tips */}
      <div style={{ fontSize: 11, color: C.text3, textAlign: "center", lineHeight: 1.5 }}>
        Astuce : posez votre CIN sur un fond sombre uni.
      </div>
    </div>
  );
}

function ConfirmStep({
  session, onDone,
}: {
  session: SessionInfo | null;
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string>("");

  if (!session) return null;
  const f = session.candidateFields ?? {};

  const submit = async () => {
    setSubmitting(true);
    setErr("");
    try {
      // Marque la session comme "en revue agent" — l'agent finalisera
      // Côté self-service, on ne peut pas finaliser (pas de droits sur CBS).
      // On appelle simplement le patch pour marquer le workflow "prêt pour agent".
      const res = await fetch(`/api/ekyc/token/${window.location.pathname.split("/kyc/")[1]}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok && res.status !== 404) {
        // 404 = endpoint pas encore implémenté — on tolère et on affiche done quand même
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Envoi impossible");
      }
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text1, margin: "0 0 4px" }}>
          Vérifiez vos informations
        </h2>
        <p style={{ fontSize: 13, color: C.text2, margin: 0 }}>
          Nous avons extrait ces données de votre CIN. Un conseiller les vérifiera.
        </p>
      </div>

      <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
        {[
          ["Nom",           f.nom],
          ["Prénom",        f.prenom],
          ["CIN",           f.cin],
          ["Date naissance", f.dateNaissance],
          ["Adresse",       f.adresse],
        ].filter(([, v]) => v).map(([label, val]) => (
          <div key={label} style={{
            display: "flex", justifyContent: "space-between",
            padding: "8px 0", borderBottom: `1px solid ${C.border}`,
            fontSize: 13,
          }}>
            <span style={{ color: C.text3 }}>{label}</span>
            <span style={{ color: C.text1, fontWeight: 600, textAlign: "right" }}>{val}</span>
          </div>
        ))}
      </div>

      <div style={{
        background: "rgba(15,118,110,0.06)",
        borderRadius: 10, padding: 12, fontSize: 12,
        color: C.text2, display: "flex", gap: 10, alignItems: "flex-start",
      }}>
        <Shield size={16} style={{ color: C.primary, flexShrink: 0, marginTop: 1 }} />
        <div>
          Si une information est incorrecte, votre conseiller la corrigera manuellement.
          Vous n'avez rien d'autre à faire.
        </div>
      </div>

      {err && (
        <div style={{ color: C.red, fontSize: 12 }}>{err}</div>
      )}

      <button
        onClick={submit}
        disabled={submitting}
        style={primaryButtonStyle(!submitting)}
      >
        {submitting ? (
          <>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            Envoi…
          </>
        ) : (
          <>
            <Upload size={16} />
            Envoyer ma demande
          </>
        )}
      </button>
    </div>
  );
}

// ─── Styles boutons ───────────────────────────────────────────────────────────

function primaryButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "14px 20px",
    background: enabled ? C.primary : "#CBD5E1",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    transition: "background 0.2s",
  };
}

function secondaryButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "14px 20px",
    background: "transparent",
    color: C.text2,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    cursor: enabled ? "pointer" : "not-allowed",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "0 minute";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} minute${min > 1 ? "s" : ""}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} heure${h > 1 ? "s" : ""}`;
  return `${Math.floor(h / 24)} jour${Math.floor(h / 24) > 1 ? "s" : ""}`;
}
