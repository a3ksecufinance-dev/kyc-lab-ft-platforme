/**
 * Page eKYC — Canal Digital — Entrée en relation
 *
 * Workflow multi-étapes :
 *  1. Capture CIN Recto   (WebRTC caméra live + guide cadrage)
 *  2. Capture CIN Verso   (WebRTC caméra live + guide cadrage)
 *  3. Lecture NFC CNIE    (Chrome Android / Web NFC API) — optionnel
 *  4. Selfie + Face match (caméra frontale → comparaison serveur)
 *  5. Revue champs OCR    (agent corrige si besoin)
 *  6. Soumission          (POST /api/cbs/ocr → /confirm)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { Button }    from "../components/ui/Button";
import {
  Camera, CreditCard, Smartphone, User, CheckCircle2, ChevronRight,
  ChevronLeft, RefreshCw, Upload, AlertTriangle, Loader2, Wifi,
  Eye, Check, X, Edit3, Send,
} from "lucide-react";
import { useAuth }  from "../hooks/useAuth";
import { useI18n }  from "../hooks/useI18n";
import { loadFaceModels, matchFaces } from "../lib/face-match";

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  bg:      "var(--wr-page)",
  card:    "var(--wr-card)",
  border:  "var(--wr-border)",
  border2: "var(--wr-border2)",
  text1:   "var(--wr-text-1)",
  text2:   "var(--wr-text-2)",
  text3:   "var(--wr-text-3)",
  teal:    "var(--wr-accent)",
  red:     "var(--wr-red)",
  amber:   "var(--wr-amber)",
  green:   "var(--wr-green)",
  mono:    "var(--wr-font-mono)",
  sans:    "var(--wr-font-sans)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "intro" | "recto" | "verso" | "nfc" | "selfie" | "review" | "submit" | "done";

interface CapturedImages {
  recto?:  string;  // base64
  verso?:  string;  // base64
  selfie?: string;  // base64
}

interface OcrFields {
  nom?:            string;
  prenom?:         string;
  cin?:            string;
  dateNaissance?:  string;
  dateExpiration?: string;
  lieuNaissance?:  string;
  sexe?:           string;
  adresse?:        string;
  quartier?:       string;
  ville?:          string;
}

interface OcrResult {
  cbsRef:      string;
  extracted:   OcrFields;
  confidence:  { recto: number; verso: number; overall: number };
  mrzValid:    boolean;
  validation?: {
    score:   number;
    valid:   string[];
    missing: string[];
    status:  string;
  };
  fieldsToReview: string[];
}

interface FaceMatchResult {
  score:     number;   // 0-100
  matched:   boolean;
  message:   string;
}

// ─── Étapes visuelles ─────────────────────────────────────────────────────────

const STEPS: { id: Step; label: string; icon: React.ElementType }[] = [
  { id: "recto",  label: "CIN Recto",  icon: CreditCard  },
  { id: "verso",  label: "CIN Verso",  icon: CreditCard  },
  { id: "nfc",    label: "NFC",        icon: Wifi        },
  { id: "selfie", label: "Selfie",     icon: User        },
  { id: "review", label: "Révision",   icon: Eye         },
  { id: "submit", label: "Envoi",      icon: Send        },
];

// ─── Composant capture caméra ─────────────────────────────────────────────────

function CameraCapture({
  title, hint, onCapture, capturedImage, onRetake, facingMode = "environment",
}: {
  title:          string;
  hint:           string;
  onCapture:      (base64: string) => void;
  capturedImage?: string;
  onRetake:       () => void;
  facingMode?:    "user" | "environment";
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const [streaming, setStreaming]       = useState(false);
  const [error, setError]               = useState<string>("");
  const [capturing, setCapturing]       = useState(false);

  const startCamera = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setStreaming(true);
      }
    } catch (err) {
      setError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }, []);

  useEffect(() => {
    if (!capturedImage) startCamera();
    return () => stopCamera();
  }, [capturedImage, startCamera, stopCamera]);

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width  = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    const base64 = c.toDataURL("image/jpeg", 0.92).split(",")[1]!;
    stopCamera();
    onCapture(base64);
    setCapturing(false);
  }, [onCapture, stopCamera]);

  // Gestionnaire upload fichier (alternative caméra)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const base64 = (ev.target?.result as string).split(",")[1]!;
      stopCamera();
      onCapture(base64);
    };
    reader.readAsDataURL(file);
  };

  if (capturedImage) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `2px solid ${C.teal}` }}>
          <img src={`data:image/jpeg;base64,${capturedImage}`} alt="captured"
            style={{ width: "100%", maxWidth: 480, display: "block" }} />
          <div style={{
            position: "absolute", top: 10, right: 10,
            background: C.teal, borderRadius: 20, padding: "4px 10px",
            fontSize: 11, fontFamily: C.mono, color: "#fff",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <Check size={11} /> Capturé
          </div>
        </div>
        <Button variant="secondary" icon={RefreshCw} onClick={onRetake}>
          Reprendre
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, margin: 0, textAlign: "center" }}>
        {hint}
      </p>

      {/* Viewfinder */}
      <div style={{
        position: "relative", width: "100%", maxWidth: 480,
        borderRadius: 12, overflow: "hidden",
        background: "#000",
        border: `2px solid ${streaming ? C.teal : C.border2}`,
        aspectRatio: "4/3",
      }}>
        <video ref={videoRef} muted playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", display: streaming ? "block" : "none" }} />

        {/* Guide cadrage document */}
        {streaming && facingMode === "environment" && (
          <div style={{
            position: "absolute", inset: "10%",
            border: "2px dashed rgba(20,184,166,0.7)",
            borderRadius: 8, pointerEvents: "none",
          }}>
            {/* Coins du cadre */}
            {[
              { top: -2, left: -2, borderTop: `3px solid ${C.teal}`, borderLeft: `3px solid ${C.teal}`, borderRadius: "4px 0 0 0" },
              { top: -2, right: -2, borderTop: `3px solid ${C.teal}`, borderRight: `3px solid ${C.teal}`, borderRadius: "0 4px 0 0" },
              { bottom: -2, left: -2, borderBottom: `3px solid ${C.teal}`, borderLeft: `3px solid ${C.teal}`, borderRadius: "0 0 0 4px" },
              { bottom: -2, right: -2, borderBottom: `3px solid ${C.teal}`, borderRight: `3px solid ${C.teal}`, borderRadius: "0 0 4px 0" },
            ].map((s, i) => (
              <div key={i} style={{ position: "absolute", width: 20, height: 20, ...s }} />
            ))}
            <span style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              fontSize: 10, fontFamily: C.mono, color: "rgba(20,184,166,0.8)",
              whiteSpace: "nowrap",
            }}>
              Centrez le document ici
            </span>
          </div>
        )}

        {/* Ovale guide selfie */}
        {streaming && facingMode === "user" && (
          <div style={{
            position: "absolute", inset: "10% 20%",
            border: `2px dashed rgba(20,184,166,0.7)`,
            borderRadius: "50%", pointerEvents: "none",
          }} />
        )}

        {!streaming && !error && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
          }}>
            <Loader2 size={32} style={{ color: C.teal, animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {error && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 12,
            background: "rgba(0,0,0,0.85)",
          }}>
            <AlertTriangle size={28} style={{ color: C.amber }} />
            <p style={{ fontSize: 12, fontFamily: C.mono, color: C.amber, margin: 0, textAlign: "center", padding: "0 20px" }}>
              {error}
            </p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {streaming && (
          <Button variant="gold" icon={Camera} onClick={capture} disabled={capturing}>
            {capturing ? "Capture..." : "Capturer"}
          </Button>
        )}
        {error && (
          <Button variant="secondary" icon={RefreshCw} onClick={startCamera}>
            Réessayer
          </Button>
        )}
        {/* Alternative : upload fichier */}
        <label style={{ cursor: "pointer" }}>
          <Button variant="secondary" icon={Upload} onClick={() => {}}>
            Importer photo
          </Button>
          <input type="file" accept="image/*" onChange={handleFileUpload}
            style={{ display: "none" }} />
        </label>
      </div>
    </div>
  );
}

// ─── Composant NFC ────────────────────────────────────────────────────────────

function NfcReader({ onRead, onSkip }: { onRead: (data: Record<string, string>) => void; onSkip: () => void }) {
  const [status, setStatus] = useState<"idle" | "reading" | "done" | "unsupported">("idle");
  const [nfcData, setNfcData] = useState<Record<string, string> | null>(null);

  const startNfc = async () => {
    // Vérifier support Web NFC API
    if (!("NDEFReader" in window)) {
      setStatus("unsupported");
      return;
    }
    setStatus("reading");
    try {
      // @ts-ignore — Web NFC API non typée
      const ndef = new window.NDEFReader();
      await ndef.scan();
      ndef.addEventListener("reading", ({ serialNumber }: { serialNumber: string }) => {
        const data: Record<string, string> = {
          serialNumber,
          source: "NFC_CNIE",
          readAt: new Date().toISOString(),
        };
        setNfcData(data);
        setStatus("done");
        onRead(data);
      });
    } catch (err) {
      setStatus("unsupported");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "20px 0" }}>
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        background: status === "reading" ? `${C.teal}15` : status === "done" ? `${C.green}15` : `${C.border2}`,
        border: `2px solid ${status === "reading" ? C.teal : status === "done" ? C.green : C.border2}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: status === "reading" ? "pulse 1.5s ease-in-out infinite" : "none",
      }}>
        <Wifi size={32} style={{ color: status === "done" ? C.green : status === "reading" ? C.teal : C.text3 }} />
      </div>

      <div style={{ textAlign: "center" }}>
        {status === "idle" && (
          <>
            <p style={{ fontSize: 14, fontFamily: C.sans, color: C.text1, margin: "0 0 6px", fontWeight: 600 }}>
              Lecture NFC CNIE
            </p>
            <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, margin: 0 }}>
              Disponible sur Chrome Android avec CNIE après 2020.<br />
              Approchez votre CIN du dos de votre téléphone.
            </p>
          </>
        )}
        {status === "reading" && (
          <p style={{ fontSize: 13, fontFamily: C.mono, color: C.teal, margin: 0 }}>
            Approchez votre CIN du lecteur NFC…
          </p>
        )}
        {status === "done" && (
          <p style={{ fontSize: 13, fontFamily: C.mono, color: C.green, margin: 0 }}>
            ✓ Puce CNIE lue avec succès — données certifiées DGSN
          </p>
        )}
        {status === "unsupported" && (
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.amber, margin: 0 }}>
            NFC non disponible sur cet appareil/navigateur.<br />
            Utilisez Chrome sur Android avec NFC activé.
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {status === "idle" && (
          <Button variant="gold" icon={Wifi} onClick={startNfc}>
            Activer NFC
          </Button>
        )}
        <Button variant="secondary" onClick={onSkip}>
          {status === "done" ? "Continuer" : "Passer cette étape"}
        </Button>
      </div>
    </div>
  );
}

// ─── Composant revue champs OCR ───────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  nom: "Nom", prenom: "Prénom", cin: "N° CIN",
  dateNaissance: "Date de naissance", dateExpiration: "Date d'expiration",
  lieuNaissance: "Lieu de naissance", sexe: "Sexe",
  adresse: "Adresse", quartier: "Quartier", ville: "Ville",
};

function OcrReview({
  fields, validation, onUpdate, confidence,
}: {
  fields:      OcrFields;
  validation?: OcrResult["validation"];
  onUpdate:    (f: OcrFields) => void;
  confidence:  OcrResult["confidence"];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const startEdit = (key: string, val: string) => {
    setEditing(key);
    setEditVal(val);
  };

  const saveEdit = (key: string) => {
    onUpdate({ ...fields, [key]: editVal });
    setEditing(null);
  };

  const getFieldStatus = (key: string): "valid" | "missing" | "mismatch" | "extracted" => {
    if (!validation) return "extracted";
    if (validation.valid.includes(key))   return "valid";
    if (validation.missing.includes(key)) return "missing";
    return "extracted";
  };

  const statusColor = (s: string) =>
    s === "valid" ? C.green : s === "missing" ? C.amber : s === "mismatch" ? C.red : C.text2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Score global */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        background: `${C.teal}10`, border: `1px solid ${C.teal}25`, borderRadius: 10,
      }}>
        <div>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Confiance OCR globale
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, fontFamily: C.mono, color: C.teal }}>
              {confidence.overall}%
            </span>
            <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text3 }}>
              Recto {confidence.recto}% / Verso {confidence.verso}%
            </span>
          </div>
        </div>
        {validation && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 3px" }}>Validation CBS</p>
            <span style={{
              fontSize: 12, fontFamily: C.mono, fontWeight: 700,
              color: validation.score >= 80 ? C.green : validation.score >= 50 ? C.amber : C.red,
            }}>
              {validation.status} ({validation.score}%)
            </span>
          </div>
        )}
      </div>

      {/* Champs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {Object.entries(FIELD_LABELS).map(([key, label]) => {
          const val    = fields[key as keyof OcrFields] ?? "";
          const status = getFieldStatus(key);
          const isEditing = editing === key;

          return (
            <div key={key} style={{
              background: C.card,
              border: `1px solid ${status === "valid" ? `${C.green}30` : status === "missing" ? `${C.amber}30` : C.border}`,
              borderRadius: 8, padding: "10px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontFamily: C.mono, color: statusColor(status), textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
                  {label}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {status === "valid"   && <Check size={10} style={{ color: C.green }} />}
                  {status === "missing" && <AlertTriangle size={10} style={{ color: C.amber }} />}
                  <button onClick={() => startEdit(key, val)} style={{ background: "none", border: "none", cursor: "pointer", color: C.text3, padding: 2 }}>
                    <Edit3 size={10} />
                  </button>
                </div>
              </div>

              {isEditing ? (
                <div style={{ display: "flex", gap: 5 }}>
                  <input
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    autoFocus
                    style={{
                      flex: 1, fontSize: 12, fontFamily: C.mono, padding: "4px 6px",
                      background: "var(--wr-hover)", border: `1px solid ${C.teal}`,
                      borderRadius: 5, color: C.text1, outline: "none",
                    }}
                    onKeyDown={e => { if (e.key === "Enter") saveEdit(key); if (e.key === "Escape") setEditing(null); }}
                  />
                  <button onClick={() => saveEdit(key)} style={{ background: "none", border: "none", cursor: "pointer", color: C.green }}><Check size={14} /></button>
                  <button onClick={() => setEditing(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.red }}><X size={14} /></button>
                </div>
              ) : (
                <p style={{
                  fontSize: 13, fontFamily: key === "cin" ? C.mono : C.sans,
                  color: val ? C.text1 : C.text3, margin: 0, fontWeight: val ? 500 : 400,
                }}>
                  {val || "—"}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {validation?.missing && validation.missing.length > 0 && (
        <div style={{ padding: "10px 14px", background: `${C.amber}08`, border: `1px solid ${C.amber}25`, borderRadius: 8 }}>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.amber, margin: 0 }}>
            ⚠ Champs non extraits par OCR (à compléter) : {validation.missing.map(f => FIELD_LABELS[f] ?? f).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function EkycPage() {
  const { user }  = useAuth();
  const { t }     = useI18n();

  const [step, setStep]               = useState<Step>("intro");
  const [images, setImages]           = useState<CapturedImages>({});
  const [nfcData, setNfcData]         = useState<Record<string, string> | null>(null);
  const [faceMatch, setFaceMatch]     = useState<FaceMatchResult | null>(null);
  const [ocrResult, setOcrResult]     = useState<OcrResult | null>(null);
  const [fields, setFields]           = useState<OcrFields>({});
  const [modifiedFields, setModifiedFields] = useState<string[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string>("");
  const [finalResult, setFinalResult] = useState<Record<string, unknown> | null>(null);

  // Progression steps
  const stepIdx = STEPS.findIndex(s => s.id === step);

  // Tracker les champs modifiés
  useEffect(() => {
    if (!ocrResult) return;
    const orig = ocrResult.extracted;
    const changed = Object.keys(fields).filter(k => {
      const key = k as keyof OcrFields;
      return fields[key] !== orig[key] && fields[key];
    });
    setModifiedFields(changed);
  }, [fields, ocrResult]);

  // Précharger les modèles face-api.js en arrière-plan
  // dès l'arrivée sur la page (~6.7MB téléchargés une fois, mis en cache)
  useEffect(() => {
    loadFaceModels().catch(() => {
      // Erreur silencieuse — face match retombera en révision manuelle
    });
  }, []);

  // ── Étape OCR : envoyer recto + verso ────────────────────────────────────

  const runOcr = async () => {
    if (!images.recto || !images.verso) {
      setError("Recto et Verso obligatoires");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const apiKey = "cbs-staging-key-change-me"; // TODO: configurable
      const res = await fetch("/api/cbs/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CBS-Api-Key": apiKey },
        body: JSON.stringify({
          cin_recto: images.recto,
          cin_verso:  images.verso,
          mimeType:  "image/jpeg",
        }),
      });
      const data = await res.json() as OcrResult & { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error ?? "Erreur OCR");
      setOcrResult(data);
      setFields(data.extracted);
      setStep("selfie");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur OCR serveur");
    } finally {
      setLoading(false);
    }
  };

  // ── Face match local avec face-api.js ─────────────────────────────────────

  const runFaceMatch = async () => {
    if (!images.selfie || !images.recto) {
      setFaceMatch({ score: 0, matched: false, message: "Images manquantes" });
      setStep("review");
      return;
    }
    setLoading(true);
    try {
      // 1. Comparaison locale avec face-api.js (modèles chargés en arrière-plan)
      const local = await matchFaces(images.recto, images.selfie);

      setFaceMatch({
        score: local.score,
        matched: local.matched,
        message: local.message,
      });

      // 2. Envoi du résultat au serveur pour traçabilité (clientScore)
      try {
        await fetch("/api/cbs/face-match", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CBS-Api-Key": "cbs-staging-key-change-me" },
          body: JSON.stringify({
            cin_recto: images.recto,
            selfie: images.selfie,
            clientScore: local.score,
          }),
        });
      } catch {
        // Trace optionnelle — ne bloque pas le flow
      }
    } catch (err) {
      setFaceMatch({
        score: 0, matched: false,
        message: err instanceof Error ? err.message : "Face match indisponible — révision manuelle",
      });
    } finally {
      setLoading(false);
      setStep("review");
    }
  };

  // ── Soumission finale ─────────────────────────────────────────────────────

  const submit = async () => {
    if (!ocrResult) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cbs/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CBS-Api-Key": "cbs-staging-key-change-me" },
        body: JSON.stringify({
          cbsRef:         ocrResult.cbsRef,
          fields,
          modified:       modifiedFields.length > 0,
          modifiedFields,
          code:           "entree",
        }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!data.success && data.error) throw new Error(String(data.error));
      setFinalResult(data);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur soumission");
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: C.sans, color: C.text1, letterSpacing: "-0.5px", margin: "0 0 4px" }}>
            Entrée en relation — Canal Digital
          </h1>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            Vérification KYC en ligne · CIN + Selfie + NFC
          </p>
        </div>

        {/* Stepper */}
        {step !== "intro" && step !== "done" && (
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {STEPS.map((s, i) => {
              const done    = i < stepIdx;
              const current = s.id === step;
              const Icon    = s.icon;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: done ? C.teal : current ? `${C.teal}20` : "var(--wr-hover)",
                      border: `2px solid ${done || current ? C.teal : C.border2}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {done
                        ? <CheckCircle2 size={16} style={{ color: "#fff" }} />
                        : <Icon size={13} style={{ color: current ? C.teal : C.text3 }} />
                      }
                    </div>
                    <span style={{ fontSize: 9, fontFamily: C.mono, color: current ? C.teal : C.text3, whiteSpace: "nowrap" }}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: done ? C.teal : C.border, margin: "0 4px 16px" }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── INTRO ────────────────────────────────────────────────────────── */}
        {step === "intro" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, fontFamily: C.sans, color: C.text1, margin: "0 0 8px" }}>
                  Vérification d'identité en ligne
                </h2>
                <p style={{ fontSize: 13, fontFamily: C.sans, color: C.text2, margin: 0, lineHeight: 1.6 }}>
                  Ce module vous guide pour créer un dossier KYC complet via la caméra de votre appareil.
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { icon: CreditCard, label: "CIN Recto",  desc: "Photo identité + MRZ" },
                  { icon: CreditCard, label: "CIN Verso",   desc: "Adresse + code-barres" },
                  { icon: Wifi,       label: "NFC (optionnel)", desc: "Puce CNIE certifiée" },
                  { icon: User,       label: "Selfie",      desc: "Vérification biométrique" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} style={{
                    padding: "12px 14px", background: "var(--wr-hover)",
                    border: `1px solid ${C.border}`, borderRadius: 9,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <Icon size={18} style={{ color: C.teal, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 12, fontFamily: C.sans, color: C.text1, fontWeight: 600, margin: 0 }}>{label}</p>
                      <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="gold" icon={ChevronRight} iconPosition="right" onClick={() => setStep("recto")}>
                Commencer la vérification
              </Button>
            </div>
          </div>
        )}

        {/* ── CAPTURE CIN RECTO ────────────────────────────────────────────── */}
        {step === "recto" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: C.sans, color: C.text1, margin: "0 0 4px" }}>
              CIN — Face Recto
            </h2>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 20px" }}>
              Placez le recto de votre CIN dans le cadre
            </p>
            <CameraCapture
              title="CIN Recto"
              hint="Assurez-vous que tous les textes et la photo sont lisibles. Évitez les reflets."
              onCapture={b64 => setImages(p => ({ ...p, recto: b64 }))}
              capturedImage={images.recto}
              onRetake={() => setImages(p => ({ ...p, recto: undefined }))}
              facingMode="environment"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <Button variant="gold" icon={ChevronRight} iconPosition="right"
                disabled={!images.recto} onClick={() => setStep("verso")}>
                Suivant — Verso
              </Button>
            </div>
          </div>
        )}

        {/* ── CAPTURE CIN VERSO ────────────────────────────────────────────── */}
        {step === "verso" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: C.sans, color: C.text1, margin: "0 0 4px" }}>
              CIN — Face Verso
            </h2>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 20px" }}>
              Retournez votre CIN et placez le verso dans le cadre
            </p>
            <CameraCapture
              title="CIN Verso"
              hint="Capturez l'adresse, le quartier, la ville et le code-barres."
              onCapture={b64 => setImages(p => ({ ...p, verso: b64 }))}
              capturedImage={images.verso}
              onRetake={() => setImages(p => ({ ...p, verso: undefined }))}
              facingMode="environment"
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              <Button variant="secondary" icon={ChevronLeft} onClick={() => setStep("recto")}>
                Retour
              </Button>
              <Button variant="gold" icon={loading ? Loader2 : ChevronRight} iconPosition="right"
                disabled={!images.verso || loading}
                onClick={() => { setStep("nfc"); }}>
                Suivant — NFC
              </Button>
            </div>
          </div>
        )}

        {/* ── NFC ──────────────────────────────────────────────────────────── */}
        {step === "nfc" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: C.sans, color: C.text1, margin: "0 0 4px" }}>
              Lecture puce NFC — CNIE
            </h2>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 20px" }}>
              Optionnel · Disponible sur Chrome Android · Données certifiées DGSN
            </p>
            <NfcReader
              onRead={data => { setNfcData(data); }}
              onSkip={() => { runOcr(); }}
            />
            {nfcData && (
              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                <Button variant="gold" icon={ChevronRight} iconPosition="right" onClick={() => runOcr()}>
                  Continuer avec NFC
                </Button>
              </div>
            )}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "20px 0" }}>
                <Loader2 size={20} style={{ color: C.teal, animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: 12, fontFamily: C.mono, color: C.text3 }}>Analyse OCR en cours…</span>
              </div>
            )}
            {error && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: `${C.red}08`, border: `1px solid ${C.red}25`, borderRadius: 8 }}>
                <p style={{ fontSize: 11, fontFamily: C.mono, color: C.red, margin: 0 }}>{error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── SELFIE ───────────────────────────────────────────────────────── */}
        {step === "selfie" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: C.sans, color: C.text1, margin: "0 0 4px" }}>
              Selfie — Vérification biométrique
            </h2>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 20px" }}>
              Votre selfie sera comparé à la photo de votre CIN
            </p>
            <CameraCapture
              title="Selfie"
              hint="Regardez la caméra, visage bien éclairé, pas de lunettes de soleil."
              onCapture={b64 => setImages(p => ({ ...p, selfie: b64 }))}
              capturedImage={images.selfie}
              onRetake={() => setImages(p => ({ ...p, selfie: undefined }))}
              facingMode="user"
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              <Button variant="secondary" icon={ChevronLeft} onClick={() => setStep("nfc")}>
                Retour
              </Button>
              <Button variant="gold" icon={loading ? Loader2 : ChevronRight} iconPosition="right"
                disabled={!images.selfie || loading}
                onClick={runFaceMatch}>
                {loading ? "Analyse face match…" : "Analyser"}
              </Button>
            </div>
          </div>
        )}

        {/* ── REVIEW ───────────────────────────────────────────────────────── */}
        {step === "review" && ocrResult && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: C.sans, color: C.text1, margin: "0 0 4px" }}>
              Révision des données extraites
            </h2>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 16px" }}>
              Vérifiez et corrigez si nécessaire les champs extraits par l'OCR
            </p>

            {/* Face match résultat */}
            {faceMatch && (() => {
              const color = faceMatch.score >= 80 ? C.green
                          : faceMatch.score >= 65 ? C.teal
                          : faceMatch.score >= 50 ? C.amber : C.red;
              return (
                <div style={{
                  padding: "12px 16px", marginBottom: 16,
                  background: `${color}08`,
                  border: `1px solid ${color}30`,
                  borderRadius: 10,
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: `${color}18`,
                    border: `1px solid ${color}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <User size={18} style={{ color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                      Vérification biométrique
                    </p>
                    <p style={{ fontSize: 12, fontFamily: C.mono, color, margin: 0, fontWeight: 600 }}>
                      {faceMatch.message}
                    </p>
                  </div>
                  {faceMatch.score > 0 && (
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 24, fontWeight: 700, fontFamily: C.sans, color }}>
                        {faceMatch.score}
                      </span>
                      <span style={{ fontSize: 12, fontFamily: C.mono, color, marginLeft: 2 }}>%</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <OcrReview
              fields={fields}
              validation={ocrResult.validation}
              onUpdate={setFields}
              confidence={ocrResult.confidence}
            />

            {modifiedFields.length > 0 && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: `${C.amber}08`, border: `1px solid ${C.amber}20`, borderRadius: 8 }}>
                <p style={{ fontSize: 10, fontFamily: C.mono, color: C.amber, margin: 0 }}>
                  Champs modifiés : {modifiedFields.map(f => FIELD_LABELS[f] ?? f).join(", ")} — une note sera ajoutée au dossier.
                </p>
              </div>
            )}

            {error && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: `${C.red}08`, border: `1px solid ${C.red}25`, borderRadius: 8 }}>
                <p style={{ fontSize: 11, fontFamily: C.mono, color: C.red, margin: 0 }}>{error}</p>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              <Button variant="secondary" icon={ChevronLeft} onClick={() => setStep("selfie")}>
                Retour
              </Button>
              <Button variant="gold" icon={loading ? Loader2 : Send} iconPosition="right"
                disabled={loading} onClick={submit}>
                {loading ? "Envoi en cours…" : "Soumettre le dossier"}
              </Button>
            </div>
          </div>
        )}

        {/* ── DONE ─────────────────────────────────────────────────────────── */}
        {step === "done" && finalResult && (
          <div style={{
            background: C.card, border: `1px solid ${C.teal}30`,
            borderRadius: 12, padding: 32, textAlign: "center",
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: `${C.teal}15`, border: `2px solid ${C.teal}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
            }}>
              <CheckCircle2 size={32} style={{ color: C.teal }} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: C.sans, color: C.text1, margin: "0 0 8px" }}>
              Dossier créé avec succès
            </h2>
            <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, margin: "0 0 20px" }}>
              Le client a été enregistré sur la plateforme LabFT
            </p>
            <div style={{ display: "inline-flex", flexDirection: "column", gap: 8, textAlign: "left", padding: "14px 20px", background: "var(--wr-hover)", borderRadius: 8 }}>
              {[
                { label: "Référence KYC", value: String(finalResult.customerRef ?? "") },
                { label: "Statut KYC",    value: String(finalResult.kycStatus ?? "") },
                { label: "Screening",     value: String((finalResult.screening as Record<string, unknown>)?.status ?? "") },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", gap: 16 }}>
                  <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, minWidth: 120, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
                  <span style={{ fontSize: 12, fontFamily: C.mono, color: C.teal, fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20 }}>
              <Button variant="secondary" onClick={() => {
                setStep("intro");
                setImages({});
                setOcrResult(null);
                setFields({});
                setFaceMatch(null);
                setFinalResult(null);
              }}>
                Nouveau dossier
              </Button>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
