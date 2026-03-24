import { useState } from "react";
import { useParams } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatDate, formatDateTime, formatAmount } from "../lib/utils";
import { User, Building2, MapPin, Shield, FileText, Network, Upload, CheckCircle, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { getAccessToken } from "../lib/auth";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customerId = parseInt(id ?? "0");
  const { user } = useAuth();
  const canVerifyDoc = hasRole(user, "supervisor");

  const [activeTab, setActiveTab] = useState<"info" | "documents" | "network">("info");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docType, setDocType] = useState("PASSPORT");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: customer, isLoading } = trpc.customers.getById.useQuery(
    { id: customerId },
    { enabled: !!customerId }
  );
  const { data: transactions } = trpc.customers.getTransactions.useQuery(
    { customerId, limit: 10 },
    { enabled: !!customerId }
  );
  const { data: screenings } = trpc.customers.getScreening.useQuery(
    { customerId },
    { enabled: !!customerId }
  );
  const { data: documents, refetch: refetchDocs, isFetching: docsFetching } =
    trpc.documents.getByCustomer.useQuery(
      { customerId },
      { enabled: !!customerId && activeTab === "documents" }
    );

  const verifyDocMutation = trpc.documents.verify.useMutation({
    onSuccess: () => refetchDocs(),
  });
  const rejectDocMutation = trpc.documents.reject.useMutation({
    onSuccess: () => refetchDocs(),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-[#0d1117] border border-[#21262d] rounded-lg animate-pulse" />
          ))}
        </div>
      </AppLayout>
    );
  }

  if (!customer) {
    return (
      <AppLayout>
        <div className="text-center py-16 text-[#7d8590] font-mono text-sm">Client introuvable</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1f6feb]/15 border border-[#1f6feb]/30 flex items-center justify-center flex-shrink-0">
            {customer.customerType === "CORPORATE"
              ? <Building2 size={18} className="text-[#58a6ff]" />
              : <User size={18} className="text-[#58a6ff]" />}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">
              {customer.firstName} {customer.lastName}
            </h1>
            <p className="text-xs font-mono text-[#7d8590] mt-0.5">{customer.customerId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge label={customer.kycStatus} variant="status" />
          <Badge label={customer.riskLevel} variant="risk" />
          {customer.pepStatus && (
            <span className="text-[11px] font-mono bg-amber-400/10 border border-amber-400/20 text-amber-400 px-2 py-0.5 rounded">PPE</span>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-0 border-b border-[#21262d] mb-5">
        {([
          ["info",      "Profil",          Shield   ],
          ["documents", "Documents KYC",   FileText ],
          ["network",   "Réseau",          Network  ],
        ] as [typeof activeTab, string, React.ElementType][]).map(([tab, label, Icon]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono border-b-2 transition-colors ${
              activeTab === tab
                ? "border-[#58a6ff] text-[#58a6ff]"
                : "border-transparent text-[#7d8590] hover:text-[#e6edf3]"
            }`}>
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Onglet Profil ── */}
      {activeTab === "info" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
              <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase mb-3">Identité</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                <InfoRow label="Type" value={<Badge label={customer.customerType} />} />
                <InfoRow label="Nationalité" value={customer.nationality ?? "—"} />
                <InfoRow label="Date de naissance" value={formatDate(customer.dateOfBirth)} />
                <InfoRow label="Email" value={customer.email ?? "—"} />
                <InfoRow label="Téléphone" value={customer.phone ?? "—"} />
                <InfoRow label="Enregistré le" value={formatDateTime(customer.createdAt)} />
                {customer.profession && <InfoRow label="Profession" value={customer.profession} />}
                {customer.employer   && <InfoRow label="Employeur"  value={customer.employer} />}
                {customer.sourceOfFunds && <InfoRow label="Source des fonds" value={customer.sourceOfFunds} />}
              </div>
            </div>

            {(customer.address || customer.city || customer.residenceCountry) && (
              <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={12} className="text-[#7d8590]" />
                  <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">Adresse</h2>
                </div>
                <p className="text-sm font-mono text-[#e6edf3]">
                  {[customer.address, customer.city, customer.residenceCountry].filter(Boolean).join(", ")}
                </p>
              </div>
            )}

            <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[#21262d]">
                <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">Transactions récentes</h2>
              </div>
              <div className="divide-y divide-[#21262d]/50">
                {!transactions?.length ? (
                  <p className="px-4 py-6 text-xs font-mono text-[#484f58] text-center">Aucune transaction</p>
                ) : (
                  transactions.map((tx: {
                    id: number; transactionId: string; amount: string;
                    currency: string; transactionType: string;
                    status: string; createdAt: Date;
                    transactionDate: Date; isSuspicious: boolean;
                  }) => (
                    <div key={tx.id} className="px-4 py-2.5 hover:bg-[#161b22] transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-[#e6edf3]">{tx.transactionId}</p>
                          <p className="text-[10px] font-mono text-[#7d8590] mt-0.5">
                            {formatDate(tx.transactionDate)} · {tx.transactionType}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 flex items-center gap-2">
                          {tx.isSuspicious && <span className="text-[10px] font-mono text-red-400">⚠</span>}
                          <span className={`text-sm font-mono font-medium ${tx.isSuspicious ? "text-amber-400" : "text-[#e6edf3]"}`}>
                            {formatAmount(tx.amount, tx.currency)}
                          </span>
                          <Badge label={tx.status} variant="status" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={12} className="text-[#7d8590]" />
                <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">Score de risque</h2>
              </div>
              <div className="flex items-end gap-3 mb-3">
                <span className={`text-4xl font-mono font-semibold tabular-nums ${
                  customer.riskScore >= 75 ? "text-red-400" :
                  customer.riskScore >= 50 ? "text-amber-400" : "text-emerald-400"
                }`}>{customer.riskScore}</span>
                <span className="text-xs font-mono text-[#7d8590] mb-1">/ 100</span>
              </div>
              <div className="w-full h-2 bg-[#21262d] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${customer.riskScore}%`,
                  background: customer.riskScore >= 75 ? "#f85149" : customer.riskScore >= 50 ? "#d29922" : "#3fb950",
                }} />
              </div>
              {customer.lastReviewDate && (
                <p className="text-[10px] font-mono text-[#484f58] mt-2">
                  Dernière révision le {formatDate(customer.lastReviewDate)}
                </p>
              )}
            </div>

            <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
              <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase mb-3">KYC</h2>
              <div className="space-y-2">
                <InfoRow label="Statut" value={<Badge label={customer.kycStatus} variant="status" />} />
                {customer.nextReviewDate && <InfoRow label="Prochaine révision" value={formatDate(customer.nextReviewDate)} />}
              </div>
            </div>

            {screenings && screenings.length > 0 && (
              <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-[#21262d]">
                  <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">Derniers screenings</h2>
                </div>
                <div className="divide-y divide-[#21262d]/50">
                  {screenings.slice(0, 5).map((s: {
                    id: number; screeningType: string; status: string;
                    matchScore: number; listSource: string | null;
                    decision: string; createdAt: Date;
                  }) => (
                    <div key={s.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono text-[#e6edf3] truncate">{s.listSource ?? s.screeningType}</p>
                          <p className="text-[10px] font-mono text-[#484f58]">{formatDate(s.createdAt)}</p>
                        </div>
                        <Badge label={s.status} variant="status" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Onglet Documents KYC ── */}
      {activeTab === "documents" && (
        <div className="space-y-4">
          {/* Upload rapide */}
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">
                Uploader un document
              </h2>
              <select value={docType}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                  setDocType(e.target.value)}
                className="bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs font-mono text-[#e6edf3] focus:outline-none">
                {[
                  ["PASSPORT", "Passeport"],
                  ["ID_CARD", "Carte d'identité"],
                  ["DRIVING_LICENSE", "Permis de conduire"],
                  ["PROOF_OF_ADDRESS", "Justificatif domicile"],
                  ["SELFIE", "Selfie"],
                  ["OTHER", "Autre"],
                ].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[#30363d] hover:border-[#58a6ff]/50 rounded-lg py-4 cursor-pointer transition-colors">
              <Upload size={16} className="text-[#484f58]" />
              <span className="text-xs font-mono text-[#7d8590]">
                {uploadingDoc ? "Upload en cours…" : "Cliquer pour sélectionner (JPG, PNG, PDF — max 10 Mo)"}
              </span>
              <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp,.pdf"
                disabled={uploadingDoc}
                onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  setUploadError(null);
                  setUploadingDoc(true);
                  try {
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("customerId", String(customerId));
                    fd.append("documentType", docType);
                    const res = await fetch("/api/documents/upload", {
                      method: "POST",
                      headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
                      body: fd,
                    });
                    const data = await res.json() as { success?: boolean; error?: string };
                    if (!data.success) setUploadError(data.error ?? "Erreur upload");
                    else { void refetchDocs(); }
                  } catch { setUploadError("Erreur réseau"); }
                  finally { setUploadingDoc(false); (e.target as HTMLInputElement).value = ""; }
                }}
              />
            </label>
            {uploadError && (
              <p className="text-xs font-mono text-red-400 mt-2">{uploadError}</p>
            )}
          </div>

          {/* Liste documents */}
          {docsFetching && !documents ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-16 bg-[#0d1117] border border-[#21262d] rounded-lg animate-pulse" />)}
            </div>
          ) : !documents?.length ? (
            <div className="text-center py-10 bg-[#0d1117] border border-[#21262d] rounded-lg">
              <FileText size={24} className="text-[#30363d] mx-auto mb-2" />
              <p className="text-xs font-mono text-[#484f58]">Aucun document pour ce client</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(documents as Array<{
                id: number; documentType: string; fileName: string | null;
                ekycStatus: string; ekycScore: number | null;
                status: string; createdAt: Date; fileUrl: string | null;
                mimeType: string | null; ocrConfidence: number | null;
                documentNumber: string | null; expiryDate: string | null;
              }>).map(doc => {
                const ekycIcon =
                  doc.ekycStatus === "PASS"       ? <CheckCircle  size={12} className="text-emerald-400" /> :
                  doc.ekycStatus === "FAIL"        ? <AlertTriangle size={12} className="text-red-400" /> :
                  doc.ekycStatus === "REVIEW"      ? <AlertTriangle size={12} className="text-amber-400" /> :
                  doc.ekycStatus === "PROCESSING"  ? <RefreshCw    size={12} className="text-[#58a6ff] animate-spin" /> :
                  <Clock size={12} className="text-[#484f58]" />;

                return (
                  <div key={doc.id} className="bg-[#0d1117] border border-[#21262d] rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FileText size={15} className="text-[#484f58] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-[#e6edf3] font-medium">
                            {doc.documentType.replace(/_/g, " ")}
                          </span>
                          <span className={`flex items-center gap-1 text-[10px] font-mono ${
                            doc.ekycStatus === "PASS"       ? "text-emerald-400" :
                            doc.ekycStatus === "FAIL"        ? "text-red-400" :
                            doc.ekycStatus === "REVIEW"      ? "text-amber-400" :
                            doc.ekycStatus === "PROCESSING"  ? "text-[#58a6ff]" :
                            "text-[#484f58]"
                          }`}>
                            {ekycIcon}
                            {doc.ekycStatus}
                            {doc.ekycScore !== null && ` (${doc.ekycScore}/100)`}
                          </span>
                          {doc.documentNumber && (
                            <span className="text-[10px] font-mono text-[#7d8590]">N° {doc.documentNumber}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] font-mono text-[#484f58]">
                            {formatDate(doc.createdAt)}
                          </span>
                          {doc.ocrConfidence !== null && (
                            <span className="text-[10px] font-mono text-[#484f58]">
                              OCR {doc.ocrConfidence}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {doc.fileUrl && (
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] font-mono text-[#58a6ff] hover:underline">
                            Voir
                          </a>
                        )}
                        {canVerifyDoc && doc.ekycStatus !== "PASS" && (
                          <button
                            onClick={() => verifyDocMutation.mutate({ id: doc.id })}
                            disabled={verifyDocMutation.isPending}
                            className="text-[10px] font-mono text-emerald-400 hover:underline disabled:opacity-50">
                            Vérifier
                          </button>
                        )}
                        {canVerifyDoc && doc.ekycStatus !== "FAIL" && doc.status !== "REJECTED" && (
                          <button
                            onClick={() => rejectDocMutation.mutate({ id: doc.id, reason: "Rejeté manuellement" })}
                            disabled={rejectDocMutation.isPending}
                            className="text-[10px] font-mono text-red-400 hover:underline disabled:opacity-50">
                            Rejeter
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Onglet Réseau ── */}
      {activeTab === "network" && (
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-6 text-center">
          <Network size={28} className="text-[#30363d] mx-auto mb-3" />
          <p className="text-xs font-mono text-[#7d8590] mb-3">
            Analyser le réseau de relations de ce client
          </p>
          <a href={`/network?customerId=${customerId}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/30 rounded-md transition-colors">
            <Network size={13} />
            Ouvrir dans l'analyse réseau →
          </a>
        </div>
      )}
    </AppLayout>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-mono text-[#7d8590] uppercase tracking-wider">{label}</p>
      <div className="text-xs font-mono text-[#e6edf3] mt-0.5">
        {typeof value === "string" ? value : value}
      </div>
    </div>
  );
}
