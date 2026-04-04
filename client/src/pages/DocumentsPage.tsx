import { useState, useRef, useCallback } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import { formatRelative } from "../lib/utils";
import { getAccessToken } from "../lib/auth";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { useI18n } from "../hooks/useI18n";
import type { TDict } from "../hooks/useI18n";
import {
  Upload, FileText, Eye, CheckCircle, XCircle,
  AlertTriangle, RefreshCw, ShieldCheck, ShieldAlert,
  Clock, ChevronDown, ChevronUp,
} from "lucide-react";

const C = {
  surface: "var(--wr-card)",
  border:  "var(--wr-border)",
  border2: "var(--wr-border2)",
  text1:   "var(--wr-text-1)",
  text2:   "var(--wr-text-2)",
  text3:   "var(--wr-text-3)",
  text4:   "var(--wr-text-4)",
  gold:    "var(--wr-gold)",
  red:     "var(--wr-red)",
  amber:   "var(--wr-amber)",
  green:   "var(--wr-green)",
  blue:    "var(--wr-blue)",
  mono:    "var(--wr-font-mono)",
  serif:   "var(--wr-font-serif)",
  hover:   "var(--wr-hover)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type EkycCheck = {
  id: string; label: string;
  status: "PASS" | "FAIL" | "SKIP" | "WARN";
  score: number; weight: number; blocking: boolean; detail?: string;
};

type KycDocument = {
  id: number; customerId: number; documentType: string;
  fileName: string | null; fileUrl: string | null; fileSize: number | null;
  mimeType: string | null; storageBackend: string | null;
  status: string; ekycStatus: string; ekycScore: number | null;
  ekycChecks: EkycCheck[] | null; ocrConfidence: number | null;
  documentNumber: string | null; expiryDate: string | null;
  issuingCountry: string | null; verifiedAt: Date | null;
  notes: string | null; createdAt: Date;
  ocrData: Record<string, unknown> | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDocTypeLabel(type: string, t: TDict): string {
  const map: Record<string, string> = {
    PASSPORT:         t.documents.typePassport,
    ID_CARD:          t.documents.typeIdCard,
    DRIVING_LICENSE:  t.documents.typeDrivingLicense,
    PROOF_OF_ADDRESS: t.documents.typeProofAddress,
    SELFIE:           t.documents.typeSelfie,
    BANK_STATEMENT:   t.documents.typeBankStatement,
    OTHER:            t.documents.typeOther,
  };
  return map[type] ?? type;
}

function checkIcon(status: EkycCheck["status"]) {
  if (status === "PASS") return <CheckCircle size={12} style={{ color: C.green, flexShrink: 0 }} />;
  if (status === "FAIL") return <XCircle     size={12} style={{ color: C.red, flexShrink: 0 }} />;
  if (status === "WARN") return <AlertTriangle size={12} style={{ color: C.amber, flexShrink: 0 }} />;
  return <span style={{ width: 12, height: 12, flexShrink: 0, borderRadius: "50%", background: C.border2, display: "inline-block" }} />;
}

// ─── Upload zone ─────────────────────────────────────────────────────────────

function UploadZone({ customerId, onSuccess }: { customerId: number; onSuccess: () => void }) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [docType, setDocType]     = useState("PASSPORT");
  const fileRef = useRef<HTMLInputElement>(null);

  const doUpload = useCallback(async (file: File) => {
    setError(null);
    setProgress(t.common.loading);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("customerId", String(customerId));
      formData.append("documentType", docType);

      const token = getAccessToken();
      const res   = await fetch("/api/documents/upload", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
        body:    formData,
      });

      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? t.common.uploadError);
        return;
      }

      setProgress(t.documents.uploadDone);
      setTimeout(() => { setProgress(null); onSuccess(); }, 2000);

    } catch {
      setError(t.common.networkError);
    }
  }, [customerId, docType, onSuccess, t]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) doUpload(file);
  }, [doUpload]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Sélecteur type de document */}
      <div>
        <label style={{ display: "block", fontSize: 10, fontFamily: C.mono, color: C.text3, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>
          {t.documents.docType}
        </label>
        <select value={docType}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDocType(e.target.value)}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "6px 10px", fontSize: 11, fontFamily: C.mono, color: C.text1, width: "100%", outline: "none" }}
        >
          {(["PASSPORT","ID_CARD","DRIVING_LICENSE","PROOF_OF_ADDRESS","SELFIE","BANK_STATEMENT","OTHER"] as const).map((k) => (
            <option key={k} value={k}>{getDocTypeLabel(k, t)}</option>
          ))}
        </select>
      </div>

      {/* Zone drag & drop */}
      <div
        onDragOver={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? C.blue : C.border2}`,
          borderRadius: 10, padding: "32px 20px", textAlign: "center" as const,
          cursor: "pointer",
          background: dragging ? `${C.blue}08` : C.hover,
        }}
      >
        <input
          ref={fileRef} type="file" style={{ display: "none" }}
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            if (f) doUpload(f);
          }}
        />
        <Upload size={24} style={{ color: C.text4, margin: "0 auto 8px", display: "block" }} />
        <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
          {t.documents.dragDrop}
        </p>
        <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, marginTop: 4 }}>
          JPG, PNG, WEBP, PDF — max {10} Mo
        </p>
      </div>

      {/* Feedback */}
      {progress && (
        <div style={{ background: `${C.blue}0a`, border: `1px solid ${C.blue}30`, borderRadius: 8, padding: "10px 14px" }}>
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.blue, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <RefreshCw size={11} className="animate-spin" /> {progress}
          </p>
        </div>
      )}
      {error && (
        <div style={{ background: `${C.red}0a`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "10px 14px" }}>
          <p style={{ fontSize: 12, fontFamily: C.mono, color: C.red, margin: 0 }}>{error}</p>
        </div>
      )}
    </div>
  );
}

// ─── Carte document ───────────────────────────────────────────────────────────

interface DocumentCardProps {
  doc: KycDocument;
  canVerify: boolean;
  onRefresh: () => void;
}

function DocumentCard({ doc, canVerify, onRefresh }: DocumentCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const utils = trpc.useUtils();

  const EKYC_STATUS_CONFIG = {
    PASS:       { color: C.green,  bgColor: `${C.green}1a`,  borderColor: `${C.green}33`,  icon: ShieldCheck,   label: t.documents.ekycVerified },
    REVIEW:     { color: C.amber,  bgColor: `${C.amber}1a`,  borderColor: `${C.amber}33`,  icon: AlertTriangle, label: t.documents.ekycReview },
    FAIL:       { color: C.red,    bgColor: `${C.red}1a`,    borderColor: `${C.red}33`,    icon: ShieldAlert,   label: t.documents.ekycFailed },
    PROCESSING: { color: C.blue,   bgColor: `${C.blue}1a`,   borderColor: `${C.blue}33`,   icon: RefreshCw,     label: t.documents.ekycProcessing },
    PENDING:    { color: C.text3,  bgColor: C.hover,          borderColor: C.border,        icon: Clock,         label: t.documents.ekycPending },
  };

  function ekycBadge(status: string) {
    const cfg = EKYC_STATUS_CONFIG[status as keyof typeof EKYC_STATUS_CONFIG]
      ?? EKYC_STATUS_CONFIG.PENDING;
    const Icon = cfg.icon;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 10, fontFamily: C.mono, padding: "3px 8px",
        borderRadius: 5, border: `1px solid ${cfg.borderColor}`,
        background: cfg.bgColor, color: cfg.color,
      }}>
        <Icon size={11} className={status === "PROCESSING" ? "animate-spin" : ""} />
        {cfg.label}
      </span>
    );
  }

  const verifyMutation = trpc.documents.verify.useMutation({
    onSuccess: () => { utils.documents.getByCustomer.invalidate(); onRefresh(); },
  });
  const rejectMutation = trpc.documents.reject.useMutation({
    onSuccess: () => { utils.documents.getByCustomer.invalidate(); onRefresh(); },
  });

  const checks = (doc.ekycChecks ?? []) as EkycCheck[];
  const ocrData = doc.ocrData as Record<string, unknown> | null;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      {/* En-tête */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <FileText size={16} style={{ color: C.text4, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontFamily: C.mono, fontWeight: 500, color: C.text1 }}>
              {getDocTypeLabel(doc.documentType, t)}
            </span>
            {ekycBadge(doc.ekycStatus)}
            {doc.ekycScore !== null && (
              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text4 }}>
                {t.documents.scoreLabel} {doc.ekycScore}/100
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
            {doc.documentNumber && (
              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{t.documents.docNumber} {doc.documentNumber}</span>
            )}
            {doc.expiryDate && (
              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{t.documents.expiry} {doc.expiryDate}</span>
            )}
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text4 }}>
              {formatRelative(doc.createdAt)}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {doc.fileUrl && (
            <button onClick={() => setShowViewer(true)}
              style={{ padding: 6, background: "none", border: "none", cursor: "pointer", color: C.text4, borderRadius: 6, display: "flex", alignItems: "center" }}
              title={t.documents.viewDocument}>
              <Eye size={13} />
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)}
            style={{ padding: 6, background: "none", border: "none", cursor: "pointer", color: C.text4, borderRadius: 6, display: "flex", alignItems: "center" }}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Détails expandés */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Contrôles eKYC */}
          {checks.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, letterSpacing: "0.16em", textTransform: "uppercase" as const, marginBottom: 8, fontWeight: 600 }}>
                {t.documents.ekycChecks}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {checks.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    {checkIcon(c.status)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text1 }}>{c.label}</span>
                      {c.detail && (
                        <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, marginLeft: 8 }}>{c.detail}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text4 }}>{c.score}/100</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Données OCR extraites */}
          {ocrData && Object.keys(ocrData).length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, letterSpacing: "0.16em", textTransform: "uppercase" as const, marginBottom: 8, fontWeight: 600 }}>
                {t.documents.ocrData}
                {doc.ocrConfidence !== null && (
                  <span style={{ marginLeft: 8, textTransform: "none" as const, color: C.text4 }}>
                    ({t.documents.confidence} {doc.ocrConfidence}%)
                  </span>
                )}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 24, rowGap: 4 }}>
                {[
                  [t.documents.ocrFirstName,      ocrData["firstName"]],
                  [t.documents.ocrLastName,        ocrData["lastName"]],
                  [t.documents.ocrDateOfBirth,     ocrData["dateOfBirth"]],
                  [t.documents.ocrDocNumber,       ocrData["documentNumber"]],
                  [t.documents.ocrExpiry,          ocrData["expiryDate"]],
                  [t.documents.ocrNationality,     ocrData["nationality"]],
                  [t.documents.ocrIssuingCountry,  ocrData["issuingCountry"]],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: C.mono }}>
                    <span style={{ color: C.text4 }}>{String(label)}</span>
                    <span style={{ color: C.text1 }}>{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions manuelles */}
          {canVerify && doc.ekycStatus !== "PASS" && (
            <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
              <button
                disabled={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate({ id: doc.id })}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: `${C.green}14`, border: `1px solid ${C.green}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.green, cursor: "pointer" }}
              >
                <CheckCircle size={11} />
                {t.documents.verifyManually}
              </button>
              {doc.ekycStatus !== "FAIL" && (
                <button
                  disabled={rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate({ id: doc.id, reason: "Rejeté manuellement" })}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: `${C.red}14`, border: `1px solid ${C.red}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.red, cursor: "pointer" }}
                >
                  <XCircle size={11} />
                  {t.documents.reject}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Viewer document (iframe/image) */}
      {showViewer && doc.fileUrl && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
          onClick={() => setShowViewer(false)}>
          <div style={{ width: "100%", maxWidth: 768, maxHeight: "90vh", borderRadius: 12, overflow: "hidden", background: "#fff" }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            {doc.mimeType === "application/pdf" ? (
              <iframe src={doc.fileUrl} style={{ width: "100%", height: "85vh", display: "block" }} title="Document" />
            ) : (
              <img src={doc.fileUrl} alt="Document" style={{ width: "100%", height: "auto", maxHeight: "85vh", objectFit: "contain", display: "block" }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function DocumentsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canVerify = hasRole(user, "supervisor");

  // Lire le customerId depuis l'URL si présent
  const params = new URLSearchParams(window.location.search);
  const presetCustomerId = params.get("customerId");

  const [customerId, setCustomerId] = useState(presetCustomerId ?? "");
  const [showUpload, setShowUpload] = useState(false);

  const { data: documents, isLoading, refetch } = trpc.documents.getByCustomer.useQuery(
    { customerId: parseInt(customerId) },
    { enabled: !!customerId && !isNaN(parseInt(customerId)) }
  );

  const docs = (documents ?? []) as KycDocument[];

  return (
    <AppLayout>
      {/* Page header */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px" }}>{t.documents.title}</h1>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>{t.documents.subtitle}</p>
        </div>
      </div>

      {/* Sélecteur client */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 10, fontFamily: C.mono, color: C.text3, letterSpacing: "0.16em", textTransform: "uppercase" as const, marginBottom: 6 }}>
              {t.customers.clientId}
            </label>
            <input
              type="number" value={customerId}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCustomerId(e.target.value)}
              placeholder="Ex : 42"
              style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 10px", fontSize: 11, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          {customerId && !isNaN(parseInt(customerId)) && (
            <button
              onClick={() => setShowUpload(!showUpload)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.blue, cursor: "pointer" }}
            >
              <Upload size={13} />
              {showUpload ? t.common.close : t.documents.upload}
            </button>
          )}
        </div>

        {showUpload && customerId && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
            <UploadZone
              customerId={parseInt(customerId)}
              onSuccess={() => { setShowUpload(false); void refetch(); }}
            />
          </div>
        )}
      </div>

      {/* Liste documents */}
      {!customerId && (
        <div style={{ textAlign: "center", padding: "64px 20px" }}>
          <FileText size={36} style={{ color: C.border, margin: "0 auto 12px", display: "block" }} />
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text4 }}>
            {t.documents.noDocuments}
          </p>
        </div>
      )}

      {customerId && isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2].map(i => (
            <div key={i} style={{ height: 64, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }} />
          ))}
        </div>
      )}

      {customerId && !isLoading && docs.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <FileText size={28} style={{ color: C.border2, margin: "0 auto 8px", display: "block" }} />
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text4 }}>{t.documents.noDocs}</p>
          <button
            onClick={() => setShowUpload(true)}
            style={{ marginTop: 12, fontSize: 11, fontFamily: C.mono, color: C.blue, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            {t.documents.uploadFirst}
          </button>
        </div>
      )}

      {docs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Résumé eKYC */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 4px 4px" }}>
            <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text3 }}>
              {docs.length} document(s)
            </span>
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.green }}>
              {docs.filter(d => d.ekycStatus === "PASS").length} ✓ {t.documents.verified}
            </span>
            {docs.some(d => d.ekycStatus === "REVIEW") && (
              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.amber }}>
                {docs.filter(d => d.ekycStatus === "REVIEW").length} ⚠ {t.documents.ekycReview}
              </span>
            )}
            {docs.some(d => d.ekycStatus === "FAIL") && (
              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.red }}>
                {docs.filter(d => d.ekycStatus === "FAIL").length} ✗ {t.documents.ekycFailed}
              </span>
            )}
          </div>

          {docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              canVerify={canVerify}
              onRefresh={(): void => { refetch().catch(() => undefined); }}
            />
          ))}
        </div>
      )}
    </AppLayout>
  );
}
