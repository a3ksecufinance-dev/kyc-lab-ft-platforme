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
  if (status === "PASS") return <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />;
  if (status === "FAIL") return <XCircle     size={12} className="text-red-400 flex-shrink-0" />;
  if (status === "WARN") return <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />;
  return <span className="w-3 h-3 flex-shrink-0 rounded-full bg-[#30363d]" />;
}

// ─── Upload zone ─────────────────────────────────────────────────────────────

function UploadZone({ customerId, onSuccess }: { customerId: number; onSuccess: () => void }) {
  const { t } = useI18n();
  const [dragging, setDragging]   = useState(false);
  const [_uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [docType, setDocType]     = useState("PASSPORT");
  const fileRef = useRef<HTMLInputElement>(null);

  const doUpload = useCallback(async (file: File) => {
    setError(null);
    setUploading(true);
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
    } finally {
      setUploading(false);
    }
  }, [customerId, docType, onSuccess, t]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) doUpload(file);
  }, [doUpload]);

  return (
    <div className="space-y-3">
      {/* Sélecteur type de document */}
      <div>
        <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
          {t.documents.docType}
        </label>
        <select value={docType}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDocType(e.target.value)}
          className="bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]/40 w-full"
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
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragging ? "border-[#58a6ff] bg-[#1f6feb]/10" : "border-[#30363d] hover:border-[#58a6ff]/50 hover:bg-[#161b22]"
        }`}
      >
        <input
          ref={fileRef} type="file" className="hidden"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) doUpload(f);
          }}
        />
        <Upload size={24} className="text-[#484f58] mx-auto mb-2" />
        <p className="text-xs font-mono text-[#7d8590]">
          {t.documents.dragDrop}
        </p>
        <p className="text-[10px] font-mono text-[#484f58] mt-1">
          JPG, PNG, WEBP, PDF — max {10} Mo
        </p>
      </div>

      {/* Feedback */}
      {progress && (
        <div className="bg-[#1f6feb]/10 border border-[#1f6feb]/30 rounded-lg px-4 py-2.5">
          <p className="text-xs font-mono text-[#58a6ff] flex items-center gap-2">
            <RefreshCw size={11} className="animate-spin" /> {progress}
          </p>
        </div>
      )}
      {error && (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2.5">
          <p className="text-xs font-mono text-red-400">{error}</p>
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
    PASS:       { color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20", icon: ShieldCheck, label: t.documents.ekycVerified },
    REVIEW:     { color: "text-amber-400",   bg: "bg-amber-400/10 border-amber-400/20",   icon: AlertTriangle, label: t.documents.ekycReview },
    FAIL:       { color: "text-red-400",     bg: "bg-red-400/10 border-red-400/20",       icon: ShieldAlert, label: t.documents.ekycFailed },
    PROCESSING: { color: "text-[#58a6ff]",   bg: "bg-[#1f6feb]/10 border-[#1f6feb]/20",  icon: RefreshCw, label: t.documents.ekycProcessing },
    PENDING:    { color: "text-[#7d8590]",   bg: "bg-[#161b22] border-[#21262d]",        icon: Clock, label: t.documents.ekycPending },
  };

  function ekycBadge(status: string) {
    const cfg = EKYC_STATUS_CONFIG[status as keyof typeof EKYC_STATUS_CONFIG]
      ?? EKYC_STATUS_CONFIG.PENDING;
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border ${cfg.bg} ${cfg.color}`}>
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
    <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
      {/* En-tête */}
      <div className="px-4 py-3 flex items-center gap-3">
        <FileText size={16} className="text-[#484f58] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-medium text-[#e6edf3]">
              {getDocTypeLabel(doc.documentType, t)}
            </span>
            {ekycBadge(doc.ekycStatus)}
            {doc.ekycScore !== null && (
              <span className="text-[10px] font-mono text-[#484f58]">
                {t.documents.scoreLabel} {doc.ekycScore}/100
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {doc.documentNumber && (
              <span className="text-[10px] font-mono text-[#7d8590]">{t.documents.docNumber} {doc.documentNumber}</span>
            )}
            {doc.expiryDate && (
              <span className="text-[10px] font-mono text-[#7d8590]">{t.documents.expiry} {doc.expiryDate}</span>
            )}
            <span className="text-[10px] font-mono text-[#484f58]">
              {formatRelative(doc.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {doc.fileUrl && (
            <button onClick={() => setShowViewer(true)}
              className="p-1.5 hover:bg-[#161b22] rounded text-[#484f58] hover:text-[#e6edf3]"
              title={t.documents.viewDocument}>
              <Eye size={13} />
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)}
            className="p-1.5 hover:bg-[#161b22] rounded text-[#484f58] hover:text-[#e6edf3]">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Détails expandés */}
      {expanded && (
        <div className="border-t border-[#21262d] px-4 py-4 space-y-4">

          {/* Contrôles eKYC */}
          {checks.length > 0 && (
            <div>
              <p className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-2">
                {t.documents.ekycChecks}
              </p>
              <div className="space-y-1.5">
                {checks.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    {checkIcon(c.status)}
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-mono text-[#e6edf3]">{c.label}</span>
                      {c.detail && (
                        <span className="text-[10px] font-mono text-[#484f58] ml-2">{c.detail}</span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-[#484f58]">{c.score}/100</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Données OCR extraites */}
          {ocrData && Object.keys(ocrData).length > 0 && (
            <div>
              <p className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-2">
                {t.documents.ocrData}
                {doc.ocrConfidence !== null && (
                  <span className="ml-2 normal-case text-[#484f58]">
                    ({t.documents.confidence} {doc.ocrConfidence}%)
                  </span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {[
                  [t.documents.ocrFirstName,      ocrData["firstName"]],
                  [t.documents.ocrLastName,        ocrData["lastName"]],
                  [t.documents.ocrDateOfBirth,     ocrData["dateOfBirth"]],
                  [t.documents.ocrDocNumber,       ocrData["documentNumber"]],
                  [t.documents.ocrExpiry,          ocrData["expiryDate"]],
                  [t.documents.ocrNationality,     ocrData["nationality"]],
                  [t.documents.ocrIssuingCountry,  ocrData["issuingCountry"]],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between text-[10px] font-mono">
                    <span className="text-[#484f58]">{String(label)}</span>
                    <span className="text-[#e6edf3]">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions manuelles */}
          {canVerify && doc.ekycStatus !== "PASS" && (
            <div className="flex gap-2 pt-1">
              <button
                disabled={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate({ id: doc.id })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/20 rounded-md"
              >
                <CheckCircle size={11} />
                {t.documents.verifyManually}
              </button>
              {doc.ekycStatus !== "FAIL" && (
                <button
                  disabled={rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate({ id: doc.id, reason: "Rejeté manuellement" })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono bg-red-400/10 border border-red-400/30 text-red-400 hover:bg-red-400/20 rounded-md"
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowViewer(false)}>
          <div className="w-full max-w-3xl max-h-[90vh] rounded-xl overflow-hidden bg-white"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            {doc.mimeType === "application/pdf" ? (
              <iframe src={doc.fileUrl} className="w-full h-[85vh]" title="Document" />
            ) : (
              <img src={doc.fileUrl} alt="Document" className="w-full h-auto max-h-[85vh] object-contain" />
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
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">{t.documents.title}</h1>
        <p className="text-xs font-mono text-[#7d8590] mt-0.5">
          {t.documents.subtitle}
        </p>
      </div>

      {/* Sélecteur client */}
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 mb-6">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
              {t.customers.clientId}
            </label>
            <input
              type="number" value={customerId}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                setCustomerId(e.target.value)}
              placeholder="Ex : 42"
              className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40"
            />
          </div>
          {customerId && !isNaN(parseInt(customerId)) && (
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/30 rounded-md"
            >
              <Upload size={13} />
              {showUpload ? t.common.close : t.documents.upload}
            </button>
          )}
        </div>

        {showUpload && customerId && (
          <div className="mt-4 border-t border-[#21262d] pt-4">
            <UploadZone
              customerId={parseInt(customerId)}
              onSuccess={() => { setShowUpload(false); void refetch(); }}
            />
          </div>
        )}
      </div>

      {/* Liste documents */}
      {!customerId && (
        <div className="text-center py-16">
          <FileText size={36} className="text-[#21262d] mx-auto mb-3" />
          <p className="text-xs font-mono text-[#484f58]">
            {t.documents.noDocuments}
          </p>
        </div>
      )}

      {customerId && isLoading && (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-16 bg-[#0d1117] border border-[#21262d] rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {customerId && !isLoading && docs.length === 0 && (
        <div className="text-center py-12 bg-[#0d1117] border border-[#21262d] rounded-lg">
          <FileText size={28} className="text-[#30363d] mx-auto mb-2" />
          <p className="text-xs font-mono text-[#484f58]">{t.documents.noDocs}</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-3 text-xs font-mono text-[#58a6ff] hover:underline"
          >
            {t.documents.uploadFirst}
          </button>
        </div>
      )}

      {docs.length > 0 && (
        <div className="space-y-3">
          {/* Résumé eKYC */}
          <div className="flex items-center gap-4 px-1 mb-1">
            <span className="text-xs font-mono text-[#7d8590]">
              {docs.length} document(s)
            </span>
            <span className="text-[10px] font-mono text-emerald-400">
              {docs.filter(d => d.ekycStatus === "PASS").length} ✓ {t.documents.verified}
            </span>
            {docs.some(d => d.ekycStatus === "REVIEW") && (
              <span className="text-[10px] font-mono text-amber-400">
                {docs.filter(d => d.ekycStatus === "REVIEW").length} ⚠ {t.documents.ekycReview}
              </span>
            )}
            {docs.some(d => d.ekycStatus === "FAIL") && (
              <span className="text-[10px] font-mono text-red-400">
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
