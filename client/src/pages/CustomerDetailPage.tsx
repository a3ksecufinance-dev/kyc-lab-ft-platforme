import { useState } from "react";
import { useParams } from "wouter";
import { AppLayout } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { formatDate, formatDateTime, formatAmount } from "../lib/utils";
import { User, Building2, MapPin, Shield, FileText, Network, Upload, CheckCircle, AlertTriangle, Clock, RefreshCw, Lock, Unlock, Trash2, Download, Wallet, ClipboardCheck, Users2, Plus, X } from "lucide-react";
import { getAccessToken } from "../lib/auth";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { useI18n } from "../hooks/useI18n";
import { useInstitution } from "../context/InstitutionContext";

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customerId = parseInt(id ?? "0");
  const { user } = useAuth();
  const { t } = useI18n();
  const canVerifyDoc  = hasRole(user, "supervisor");
  const canFreeze     = hasRole(user, "supervisor");
  const canErasure    = hasRole(user, "compliance_officer");

  const flags = useInstitution();
  const [activeTab, setActiveTab] = useState<"info" | "documents" | "network" | "wallets" | "edd" | "pkyc" | "ubo">("info");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [freezeReason, setFreezeReason] = useState("");
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

  const { data: customerWallets, refetch: refetchWallets } =
    trpc.wallets.byCustomer.useQuery(
      { customerId },
      { enabled: !!customerId && activeTab === "wallets" && flags.wallets }
    );

  const utils = trpc.useUtils();
  const invalidateCustomer = () => utils.customers.getById.invalidate({ id: customerId });

  const verifyDocMutation = trpc.documents.verify.useMutation({
    onSuccess: () => refetchDocs(),
  });
  const rejectDocMutation = trpc.documents.reject.useMutation({
    onSuccess: () => refetchDocs(),
  });

  const freezeMut    = trpc.customers.freeze.useMutation({ onSuccess: invalidateCustomer });
  const unfreezeMut  = trpc.customers.unfreeze.useMutation({ onSuccess: invalidateCustomer });
  const reqErasureMut = trpc.customers.requestErasure.useMutation({ onSuccess: invalidateCustomer });
  const procErasureMut = trpc.customers.processErasure.useMutation({ onSuccess: invalidateCustomer });
  const exportKycPdfMutation = trpc.reports.exportKycPdf.useMutation();
  const promoteTierMut = trpc.wallets.promoteTier.useMutation({ onSuccess: () => refetchWallets() });

  const { data: eddOpenCase, refetch: refetchEdd } =
    trpc.enhancedOnboarding.getOpen.useQuery(
      { customerId },
      { enabled: !!customerId && activeTab === "edd" && flags.enhancedOnboarding }
    );

  const { data: eddHistory } =
    trpc.enhancedOnboarding.history.useQuery(
      { customerId },
      { enabled: !!customerId && activeTab === "edd" && flags.enhancedOnboarding }
    );

  const eddWallets =
    trpc.wallets.byCustomer.useQuery(
      { customerId },
      { enabled: !!customerId && activeTab === "edd" && flags.enhancedOnboarding && flags.wallets }
    ).data;

  const initEddMut = trpc.enhancedOnboarding.init.useMutation({ onSuccess: () => refetchEdd() });
  const updateItemMut = trpc.enhancedOnboarding.updateItem.useMutation({ onSuccess: () => refetchEdd() });
  const recordInterviewMut = trpc.enhancedOnboarding.recordInterview.useMutation({ onSuccess: () => refetchEdd() });
  const completeEddMut = trpc.enhancedOnboarding.complete.useMutation({ onSuccess: () => refetchEdd() });
  const rejectEddMut = trpc.enhancedOnboarding.reject.useMutation({ onSuccess: () => refetchEdd() });

  const { data: pkycHistory, refetch: refetchPkyc } = trpc.pkyc.customerHistory.useQuery(
    { customerId, days: 30 },
    { enabled: !!customerId && activeTab === "pkyc" }
  );
  const pkycRunMut = trpc.pkyc.runForCustomer.useMutation({ onSuccess: () => refetchPkyc() });

  const calcRiskMut = trpc.customers.calculateRiskScore.useMutation({ onSuccess: invalidateCustomer });

  // ── UBOs ────────────────────────────────────────────────────────────────────
  const [showAddUbo, setShowAddUbo] = useState(false);
  const [uboForm, setUboForm] = useState({ firstName: "", lastName: "", nationality: "", dateOfBirth: "", ownershipPercentage: "", role: "", pepStatus: false });
  const { data: ubos, refetch: refetchUbos } = trpc.customers.getUBOs.useQuery(
    { customerId },
    { enabled: !!customerId && activeTab === "ubo" }
  );
  const { data: eddTemplate } = trpc.enhancedOnboarding.checklistTemplate.useQuery(
    undefined,
    { enabled: !!customerId && activeTab === "edd" && flags.enhancedOnboarding }
  );

  const addUboMut = trpc.customers.addUBO.useMutation({
    onSuccess: () => { refetchUbos().catch(() => undefined); setShowAddUbo(false); setUboForm({ firstName: "", lastName: "", nationality: "", dateOfBirth: "", ownershipPercentage: "", role: "", pepStatus: false }); },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 wr-card-modern animate-pulse" />
          ))}
        </div>
      </AppLayout>
    );
  }

  if (!customer) {
    return (
      <AppLayout>
        <div className="text-center py-16 text-[#7d8590] font-mono text-sm">{t.customerDetail.notFound}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: t.nav.customers, href: "/customers" }, { label: `${customer.firstName} ${customer.lastName}` }]}>
      {/* Header — modernisé Plus Jakarta Sans + teal */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 52, height: 52, borderRadius: 12,
              background: "rgba(20,184,166,0.12)",
              border: "1px solid rgba(20,184,166,0.28)",
            }}
          >
            {customer.customerType === "CORPORATE"
              ? <Building2 size={22} style={{ color: "var(--wr-accent)" }} />
              : <User      size={22} style={{ color: "var(--wr-accent)" }} />}
          </div>
          <div>
            <h1
              style={{
                fontSize: 22, fontWeight: 700,
                fontFamily: "var(--wr-font-sans)",
                color: "var(--wr-text-1)",
                letterSpacing: "-0.5px",
                margin: "0 0 4px",
              }}
            >
              {customer.firstName} {customer.lastName}
            </h1>
            <p style={{ fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)", margin: 0, letterSpacing: "0.06em" }}>
              {customer.customerId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge label={customer.kycStatus} variant="status" />
          <Badge label={customer.riskLevel} variant="risk" />
          {customer.pepStatus && (
            <span className="text-[11px] font-mono bg-amber-400/10 border border-amber-400/20 text-amber-400 px-2 py-0.5 rounded">PPE</span>
          )}
          {customer.frozenAt && (
            <span className="flex items-center gap-1 text-[11px] font-mono bg-red-400/10 border border-red-400/20 text-red-400 px-2 py-0.5 rounded">
              <Lock size={10} /> GEL
            </span>
          )}
          <button
            onClick={() => exportKycPdfMutation.mutate({ customerId }, {
              onSuccess: (data: { base64: string; filename: string; sizeKb: number }) => {
                const arr  = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
                const blob = new Blob([arr], { type: "application/pdf" });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement("a");
                a.href     = url;
                a.download = data.filename;
                a.click();
                URL.revokeObjectURL(url);
              },
            })}
            disabled={exportKycPdfMutation.isPending}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px",
              fontSize: 12, fontFamily: "var(--wr-font-mono)", fontWeight: 600,
              background: "rgba(20,184,166,0.10)",
              border: "1px solid rgba(20,184,166,0.30)",
              color: "var(--wr-accent)",
              borderRadius: 7,
              cursor: exportKycPdfMutation.isPending ? "not-allowed" : "pointer",
              opacity: exportKycPdfMutation.isPending ? 0.5 : 1,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(20,184,166,0.18)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(20,184,166,0.10)")}
            title="Exporter fiche KYC PDF"
          >
            <Download size={13} />
            {exportKycPdfMutation.isPending ? "…" : "KYC PDF"}
          </button>
        </div>
      </div>

      {/* Onglets — pill modernes */}
      <div className="flex gap-2 mb-6 flex-wrap" style={{ borderBottom: "1px solid var(--wr-border)", paddingBottom: 0 }}>
        {([
          ["info",      t.customerDetail.identity,     Shield   ],
          ["documents", t.customerDetail.kycDocuments, FileText ],
          ["network",   t.customerDetail.network,      Network  ],
          ...(flags.wallets         ? [["wallets", "Wallets", Wallet] as [typeof activeTab, string, React.ElementType]] : []),
          ...(flags.enhancedOnboarding ? [["edd", "EDD", ClipboardCheck] as [typeof activeTab, string, React.ElementType]] : []),
          ["pkyc", "pKYC", RefreshCw] as [typeof activeTab, string, React.ElementType],
          ["ubo",  "UBO",  Users2   ] as [typeof activeTab, string, React.ElementType],
        ] as [typeof activeTab, string, React.ElementType][]).map(([tab, label, Icon]) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px",
                fontSize: 12, fontFamily: "var(--wr-font-sans)", fontWeight: active ? 600 : 500,
                background: active ? "rgba(20,184,166,0.12)" : "transparent",
                border: `1px solid ${active ? "rgba(20,184,166,0.30)" : "transparent"}`,
                color: active ? "var(--wr-accent)" : "var(--wr-text-3)",
                borderRadius: 8,
                cursor: "pointer",
                marginBottom: -1,
                transition: "all 0.12s",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--wr-text-2)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--wr-text-3)"; }}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Onglet Profil ── */}
      {activeTab === "info" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="wr-card-modern">
              <h2 className="wr-section-label mb-3">{t.customerDetail.identity}</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                <InfoRow label={t.common.status} value={<Badge label={customer.customerType} />} />
                <InfoRow label={t.customers.nationality} value={customer.nationality ?? "—"} />
                <InfoRow label={t.customerDetail.dateOfBirth} value={formatDate(customer.dateOfBirth)} />
                <InfoRow label={t.customerDetail.email} value={customer.email ?? "—"} />
                <InfoRow label={t.customerDetail.phone} value={customer.phone ?? "—"} />
                <InfoRow label={t.customerDetail.registeredOn} value={formatDateTime(customer.createdAt)} />
                {customer.profession && <InfoRow label={t.customerDetail.occupation} value={customer.profession} />}
                {customer.employer   && <InfoRow label={t.customerDetail.employer}  value={customer.employer} />}
                {customer.sourceOfFunds && <InfoRow label={t.customerDetail.sourceOfFunds} value={customer.sourceOfFunds} />}
              </div>
            </div>

            {(customer.address || customer.city || customer.residenceCountry) && (
              <div className="wr-card-modern">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={12} className="text-[#7d8590]" />
                  <h2 className="wr-section-label">{t.customerDetail.address}</h2>
                </div>
                <p className="text-sm font-mono text-[#e6edf3]">
                  {[customer.address, customer.city, customer.residenceCountry].filter(Boolean).join(", ")}
                </p>
              </div>
            )}

            <div className="wr-card-modern-flush">
              <div className="px-4 py-3 border-b border-[#21262d]">
                <h2 className="wr-section-label">{t.customerDetail.recentTransactions}</h2>
              </div>
              <div className="divide-y divide-[#21262d]/50">
                {!transactions?.length ? (
                  <p className="px-4 py-6 text-xs font-mono text-[#484f58] text-center">{t.customerDetail.noTransactions}</p>
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
            <div className="wr-card-modern">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={12} className="text-[#7d8590]" />
                <h2 className="wr-section-label">{t.customerDetail.riskScore}</h2>
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
              <button
                onClick={() => calcRiskMut.mutate({ id: customerId })}
                disabled={calcRiskMut.isPending}
                className="w-full mt-3 text-[11px] font-mono py-1.5 rounded border border-[#30363d] text-[#7d8590] hover:text-[#58a6ff] hover:border-[#58a6ff]/40 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw size={10} className={calcRiskMut.isPending ? "animate-spin" : ""} />
                {calcRiskMut.isPending ? "Calcul…" : "Recalculer le score"}
              </button>
              {calcRiskMut.data && (
                <div className="mt-3 space-y-1">
                  <p className="text-[9px] font-mono text-[#7d8590] uppercase tracking-widest">Facteurs de risque</p>
                  {calcRiskMut.data.factors.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] font-mono py-0.5">
                      <span className="text-[#7d8590]">{f.rule}</span>
                      <span className={f.score >= 30 ? "text-red-400" : f.score >= 15 ? "text-amber-400" : "text-emerald-400"}>+{f.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="wr-card-modern">
              <h2 className="wr-section-label mb-3">KYC</h2>
              <div className="space-y-2">
                <InfoRow label={t.common.status} value={<Badge label={customer.kycStatus} variant="status" />} />
                {customer.nextReviewDate && <InfoRow label={t.customerDetail.nextReview} value={formatDate(customer.nextReviewDate)} />}
              </div>
            </div>

            {/* ── Gel des avoirs ── */}
            <div className={`bg-[#0d1117] border rounded-lg p-4 ${
              customer.frozenAt ? "border-red-500/40" : "border-[#21262d]"
            }`}>
              <div className="flex items-center gap-2 mb-3">
                {customer.frozenAt
                  ? <Lock size={12} className="text-red-400" />
                  : <Unlock size={12} className="text-[#7d8590]" />}
                <h2 className="wr-section-label">
                  {t.customerDetail.assetFreeze}
                </h2>
              </div>

              {customer.frozenAt ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-red-400">
                    <Lock size={10} />
                    <span>{t.customerDetail.frozenSince} {formatDate(customer.frozenAt)}</span>
                  </div>
                  {customer.frozenReason && (
                    <p className="text-[10px] font-mono text-[#7d8590] break-words">{customer.frozenReason}</p>
                  )}
                  {canFreeze && (
                    <button
                      onClick={() => unfreezeMut.mutate({ id: customerId })}
                      disabled={unfreezeMut.isPending}
                      className="w-full mt-2 text-[11px] font-mono py-1.5 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors">
                      {unfreezeMut.isPending ? t.common.loading : t.customerDetail.liftFreeze}
                    </button>
                  )}
                </div>
              ) : (
                canFreeze ? (
                  <div className="space-y-2">
                    <textarea
                      value={freezeReason}
                      onChange={(e) => setFreezeReason(e.target.value)}
                      placeholder={t.customerDetail.freezeReason}
                      rows={2}
                      className="w-full bg-[#161b22] border border-[#30363d] rounded px-2 py-1.5 text-[11px] font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/50 resize-none"
                    />
                    <button
                      onClick={() => { if (freezeReason.trim().length >= 5) { freezeMut.mutate({ id: customerId, reason: freezeReason }); setFreezeReason(""); } }}
                      disabled={freezeMut.isPending || freezeReason.trim().length < 5}
                      className="w-full text-[11px] font-mono py-1.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors">
                      {freezeMut.isPending ? t.common.loading : t.customerDetail.freezeAssets}
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] font-mono text-[#484f58]">{t.customerDetail.noActiveFreeze}</p>
                )
              )}
            </div>

            {/* ── RGPD — Effacement ── */}
            <div className="wr-card-modern">
              <div className="flex items-center gap-2 mb-3">
                <Trash2 size={12} className="text-[#7d8590]" />
                <h2 className="wr-section-label">RGPD — Effacement</h2>
              </div>
              {customer.erasureCompletedAt ? (
                <p className="text-[10px] font-mono text-emerald-400">
                  Données anonymisées le {formatDate(customer.erasureCompletedAt)}
                </p>
              ) : customer.erasureRequestedAt ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-mono text-amber-400">
                    Demande du {formatDate(customer.erasureRequestedAt)}
                  </p>
                  {canErasure && (
                    <button
                      onClick={() => procErasureMut.mutate({ id: customerId })}
                      disabled={procErasureMut.isPending}
                      className="w-full text-[11px] font-mono py-1.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors">
                      {procErasureMut.isPending ? "Traitement…" : "Anonymiser les données PII"}
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => reqErasureMut.mutate({ id: customerId })}
                  disabled={reqErasureMut.isPending}
                  className="w-full text-[11px] font-mono py-1.5 rounded border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#484f58] disabled:opacity-50 transition-colors">
                  {reqErasureMut.isPending ? "En cours…" : "Demander l'effacement"}
                </button>
              )}
            </div>

            {screenings && screenings.length > 0 && (
              <div className="wr-card-modern-flush">
                <div className="px-4 py-3 border-b border-[#21262d]">
                  <h2 className="wr-section-label">Derniers screenings</h2>
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
          <div className="wr-card-modern">
            <div className="flex items-center justify-between mb-3">
              <h2 className="wr-section-label">
                {t.customerDetail.uploadDocument}
              </h2>
              <select value={docType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setDocType(e.target.value)}
                className="bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs font-mono text-[#e6edf3] focus:outline-none">
                {[
                  ["PASSPORT",         t.documents.typePassport],
                  ["ID_CARD",          t.documents.typeIdCard],
                  ["DRIVING_LICENSE",  t.documents.typeDrivingLicense],
                  ["PROOF_OF_ADDRESS", t.documents.typeProofAddress],
                  ["SELFIE",           t.documents.typeSelfie],
                  ["OTHER",            t.documents.typeOther],
                ].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[#30363d] hover:border-[#58a6ff]/50 rounded-lg py-4 cursor-pointer transition-colors">
              <Upload size={16} className="text-[#484f58]" />
              <span className="text-xs font-mono text-[#7d8590]">
                {uploadingDoc ? t.common.uploading : "JPG, PNG, PDF — max 10 Mo"}
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
                    if (!data.success) setUploadError(data.error ?? t.common.uploadError);
                    else { void refetchDocs(); }
                  } catch { setUploadError(t.common.networkError); }
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
              {[1, 2].map(i => <div key={i} className="h-16 wr-card-modern animate-pulse" />)}
            </div>
          ) : !documents?.length ? (
            <div className="text-center py-10 wr-card-modern">
              <FileText size={24} className="text-[#30363d] mx-auto mb-2" />
              <p className="text-xs font-mono text-[#484f58]">{t.common.noData}</p>
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
                  <div key={doc.id} className="wr-card-modern px-4 py-3">
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
                            {t.customerDetail.rejectKyc}
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
        <div className="wr-card-modern p-6 text-center">
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

      {/* ── Onglet Wallets ── */}
      {activeTab === "wallets" && flags.wallets && (
        <WalletsTab
          wallets={customerWallets ?? []}
          onPromote={(walletId, newTier, reason) =>
            promoteTierMut.mutate({ walletId, customerId, newTier, reason })
          }
          isPending={promoteTierMut.isPending}
        />
      )}

      {/* ── Onglet EDD ── */}
      {activeTab === "edd" && flags.enhancedOnboarding && (
        <>
          <EddTab
            openCase={eddOpenCase ?? null}
            history={eddHistory ?? []}
            wallets={(eddWallets ?? []).map(w => ({ id: w.id, walletId: w.walletId, kycTier: w.kycTier }))}
            onInit={(walletId) => initEddMut.mutate({ customerId, walletId })}
            onUpdateItem={(caseId, itemId, done, notes) =>
              updateItemMut.mutate({ caseId, itemId, done, ...(notes !== undefined ? { notes } : {}) })
            }
            onRecordInterview={(caseId, interviewDate, notes) =>
              recordInterviewMut.mutate({ caseId, interviewDate, notes })
            }
            onComplete={(caseId, walletId, decision) =>
              completeEddMut.mutate({ caseId, walletId, customerId, decision })
            }
            onReject={(caseId, reason) => rejectEddMut.mutate({ caseId, reason })}
            isPending={initEddMut.isPending || updateItemMut.isPending || recordInterviewMut.isPending || completeEddMut.isPending || rejectEddMut.isPending}
          />
          {eddTemplate && !eddOpenCase && (
            <div className="wr-card-modern mt-4">
              <p className="text-[9px] font-mono text-[#7d8590] uppercase tracking-widest mb-3">
                Template checklist EDD standard ({eddTemplate.items.length} éléments)
              </p>
              <div className="space-y-1.5">
                {eddTemplate.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-[10px] font-mono text-[#7d8590]">
                    <span className="w-3 h-3 rounded border border-[#30363d] flex-shrink-0" />
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {/* ── Onglet pKYC ── */}
      {activeTab === "pkyc" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">Scoring pKYC — Dérive comportementale</h3>
              <p className="text-[10px] font-mono text-[#7d8590] mt-0.5">Historique 30 jours · Analyse de dérive de risque</p>
            </div>
            <button
              onClick={() => pkycRunMut.mutate({ customerId })}
              disabled={pkycRunMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-blue-500/20 border border-blue-500/40 text-blue-400 rounded-md hover:bg-blue-500/30 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={11} className={pkycRunMut.isPending ? "animate-spin" : ""} />
              {pkycRunMut.isPending ? "Calcul en cours…" : "Lancer le scoring"}
            </button>
          </div>

          {pkycRunMut.data && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-[9px] font-mono text-blue-400 uppercase tracking-widest mb-2">Résultat du scoring</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Score dérive",       value: pkycRunMut.data.driftScore },
                  { label: "Revue déclenchée",   value: pkycRunMut.data.reviewTriggered ? "OUI" : "NON" },
                  { label: "Client ID",          value: pkycRunMut.data.customerId },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[#0d1117] border border-[#21262d] rounded p-2">
                    <div className="text-xs font-mono font-bold text-[#e6edf3]">{String(value)}</div>
                    <div className="text-[9px] font-mono text-[#7d8590] mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!pkycHistory ? (
            <div className="text-center py-12 text-[11px] font-mono text-[#7d8590]">{t.common.loading}</div>
          ) : pkycHistory.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-[#21262d] rounded-lg">
              <RefreshCw size={28} className="mx-auto text-[#21262d] mb-3" />
              <p className="text-sm font-mono text-[#7d8590]">{t.common.noData}</p>
              <p className="text-[10px] font-mono text-[#7d8590] mt-1">Cliquez sur "Lancer le scoring" pour générer un profil</p>
            </div>
          ) : (
            <div className="wr-card-modern-flush">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-[#21262d] text-[#7d8590] text-[9px] uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-right px-4 py-2.5">Drift Score</th>
                    <th className="text-right px-4 py-2.5">Fenêtre</th>
                    <th className="text-left px-4 py-2.5">Revue</th>
                    <th className="text-left px-4 py-2.5">Baseline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]/50">
                  {pkycHistory.map((row, i) => (
                    <tr key={i} className="hover:bg-[#161b22] transition-colors">
                      <td className="px-4 py-2.5 text-[#7d8590]">{formatDate(row.snapshotDate)}</td>
                      <td className="px-4 py-2.5 text-right font-bold" style={{ color: row.driftScore >= 70 ? "#F87171" : row.driftScore >= 40 ? "#FBB924" : "#34D399" }}>{row.driftScore}</td>
                      <td className="px-4 py-2.5 text-right text-[#7d8590]">{row.windowDays}j</td>
                      <td className="px-4 py-2.5">
                        <Badge label={row.reviewTriggered ? "REVIEW" : "OK"} variant="status" />
                      </td>
                      <td className="px-4 py-2.5 text-[#7d8590]">{row.baselineDays}j baseline</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Onglet UBO ── */}
      {activeTab === "ubo" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">Bénéficiaires Effectifs (UBO)</h3>
              <p className="text-[10px] font-mono text-[#7d8590] mt-0.5">Personnes physiques détenant +25% du capital ou du contrôle</p>
            </div>
            <button
              onClick={() => setShowAddUbo(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-blue-500/20 border border-blue-500/40 text-blue-400 rounded-md hover:bg-blue-500/30 transition-colors"
            >
              <Plus size={11} /> Ajouter UBO
            </button>
          </div>

          {!ubos ? (
            <div className="text-center py-8 text-[11px] font-mono text-[#7d8590]">{t.common.loading}</div>
          ) : ubos.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-[#21262d] rounded-lg">
              <Users2 size={28} className="mx-auto text-[#21262d] mb-3" />
              <p className="text-sm font-mono text-[#7d8590]">{t.common.noData}</p>
            </div>
          ) : (
            <div className="wr-card-modern-flush">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-[#21262d] text-[#7d8590] text-[9px] uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5">Nom</th>
                    <th className="text-left px-4 py-2.5">Nationalité</th>
                    <th className="text-left px-4 py-2.5">Rôle</th>
                    <th className="text-right px-4 py-2.5">% Capital</th>
                    <th className="text-left px-4 py-2.5">PEP</th>
                    <th className="text-left px-4 py-2.5">Sanctions</th>
                    <th className="text-left px-4 py-2.5">Date naissance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]/50">
                  {ubos.map((ubo) => (
                    <tr key={ubo.id} className="hover:bg-[#161b22] transition-colors">
                      <td className="px-4 py-2.5 text-[#e6edf3] font-semibold">{ubo.firstName} {ubo.lastName}</td>
                      <td className="px-4 py-2.5 text-[#7d8590]">{ubo.nationality ?? "—"}</td>
                      <td className="px-4 py-2.5 text-[#7d8590]">{ubo.role ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right text-[#e6edf3]">{ubo.ownershipPercentage ? `${ubo.ownershipPercentage}%` : "—"}</td>
                      <td className="px-4 py-2.5">
                        {ubo.pepStatus
                          ? <span className="text-amber-400 font-semibold">OUI</span>
                          : <span className="text-[#484f58]">NON</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge label={ubo.sanctionStatus} variant="status" />
                      </td>
                      <td className="px-4 py-2.5 text-[#7d8590]">{ubo.dateOfBirth ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal ajout UBO */}
          {showAddUbo && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
              onClick={() => setShowAddUbo(false)}>
              <div role="dialog" aria-modal="true" aria-label="Ajouter un bénéficiaire effectif"
                className="bg-[#0d1117] border border-[#21262d] rounded-2xl p-6 w-full max-w-lg"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-sm font-semibold text-[#e6edf3] font-mono">Ajouter un bénéficiaire effectif</h2>
                  <button onClick={() => setShowAddUbo(false)} aria-label={t.common.close} className="text-[#7d8590] hover:text-[#e6edf3] transition-colors"><X size={16} /></button>
                </div>

                {addUboMut.error && (
                  <div className="mb-4 px-3 py-2 bg-red-400/10 border border-red-400/30 rounded-lg text-xs font-mono text-red-400">
                    {addUboMut.error.message}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {([
                    ["firstName", "Prénom *"],
                    ["lastName",  "Nom *"],
                    ["nationality", "Nationalité (ISO)"],
                    ["dateOfBirth", "Date de naissance"],
                    ["ownershipPercentage", "% de détention"],
                    ["role", "Rôle / Fonction"],
                  ] as [keyof typeof uboForm, string][]).map(([k, label]) => (
                    <div key={k}>
                      <label className="block text-[9px] font-mono text-[#7d8590] uppercase tracking-wider mb-1">{label}</label>
                      <input
                        value={uboForm[k] as string}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUboForm(f => ({ ...f, [k]: e.target.value }))}
                        className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-2.5 py-1.5 text-xs font-mono text-[#e6edf3] outline-none"
                      />
                    </div>
                  ))}
                  <div className="col-span-2 flex items-center gap-2">
                    <input type="checkbox" id="ubo-pep" checked={uboForm.pepStatus}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUboForm(f => ({ ...f, pepStatus: e.target.checked }))}
                      className="cursor-pointer" />
                    <label htmlFor="ubo-pep" className="text-xs font-mono text-[#7d8590] cursor-pointer">Personne Politiquement Exposée (PEP)</label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowAddUbo(false)}
                    className="px-4 py-1.5 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md hover:text-[#e6edf3] transition-colors">
                    Annuler
                  </button>
                  <button
                    disabled={addUboMut.isPending || !uboForm.firstName || !uboForm.lastName}
                    onClick={() => addUboMut.mutate({
                      customerId,
                      firstName: uboForm.firstName,
                      lastName: uboForm.lastName,
                      pepStatus: uboForm.pepStatus,
                      ...(uboForm.nationality         ? { nationality: uboForm.nationality } : {}),
                      ...(uboForm.dateOfBirth         ? { dateOfBirth: uboForm.dateOfBirth } : {}),
                      ...(uboForm.ownershipPercentage ? { ownershipPercentage: uboForm.ownershipPercentage } : {}),
                      ...(uboForm.role                ? { role: uboForm.role } : {}),
                    })}
                    className="px-4 py-1.5 text-xs font-mono bg-blue-500/20 border border-blue-500/40 text-blue-400 rounded-md disabled:opacity-40 hover:bg-blue-500/30 transition-colors"
                  >
                    {addUboMut.isPending ? "Ajout…" : "Ajouter"}
                  </button>
                </div>
              </div>
            </div>
          )}
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

// ─── Composant onglet Wallets ─────────────────────────────────────────────────

type KycTier = "ALLEGED" | "STANDARD" | "RENFORCE";

const TIER_COLORS: Record<KycTier, string> = {
  ALLEGED:  "#F87171",
  STANDARD: "#FBB924",
  RENFORCE: "#34D399",
};

function TierBadge({ tier }: { tier: string }) {
  const color = TIER_COLORS[(tier as KycTier)] ?? "#F87171";
  return (
    <span style={{
      fontSize: 10, fontFamily: "monospace", fontWeight: 600,
      letterSpacing: "0.07em", padding: "2px 7px", borderRadius: 5,
      background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>
      {tier}
    </span>
  );
}

interface WalletRow {
  id: number; walletId: string; provider: string;
  kycTier: string; balance: string; currency: string;
  isDormant: boolean; isActive: boolean;
}

function WalletsTab({
  wallets, onPromote, isPending,
}: {
  wallets: WalletRow[];
  onPromote: (walletId: number, newTier: KycTier, reason: string) => void;
  isPending: boolean;
}) {
  const { t } = useI18n();
  const [promoting, setPromoting] = useState<WalletRow | null>(null);
  const [newTier, setNewTier] = useState<KycTier>("STANDARD");
  const [reason, setReason] = useState("");

  if (wallets.length === 0) {
    return (
      <div className="wr-card-modern p-8 text-center">
        <Wallet size={26} className="text-[#30363d] mx-auto mb-3" />
        <p className="text-xs font-mono text-[#7d8590]">{t.common.noData}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {wallets.map(w => (
          <div key={w.id} className="wr-card-modern flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Wallet size={15} className="text-[#58a6ff] flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-mono text-[#58a6ff] truncate">{w.walletId}</p>
                <p className="text-[10px] text-[#7d8590] mt-0.5">{w.provider}</p>
              </div>
            </div>
            <div className="flex items-center gap-6 flex-shrink-0">
              <div className="text-right">
                <p className="text-xs font-mono text-[#e6edf3]">{Number(w.balance).toLocaleString()} {w.currency}</p>
                <p className="text-[10px] text-[#7d8590]">solde</p>
              </div>
              <TierBadge tier={w.kycTier} />
              {w.isDormant && (
                <span className="text-[10px] font-mono text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded px-2 py-0.5">
                  DORMANT
                </span>
              )}
              <button
                onClick={() => { setPromoting(w); setNewTier("STANDARD"); setReason(""); }}
                className="text-[10px] font-mono px-3 py-1 rounded border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#484f58] transition-colors"
              >
                Changer tier
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal promotion */}
      {promoting && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div role="dialog" aria-modal="true" aria-label="Promotion de tier"
            className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 w-80">
            <h3 className="text-sm font-semibold text-[#e6edf3] mb-1">Promotion de tier</h3>
            <p className="text-[10px] font-mono text-[#7d8590] mb-4">{promoting.walletId}</p>
            <div className="mb-3">
              <label className="text-[10px] text-[#7d8590] block mb-1.5">Nouveau tier</label>
              <select value={newTier} onChange={e => setNewTier(e.target.value as KycTier)}
                className="w-full text-xs bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-2.5 py-1.5 outline-none">
                <option value="ALLEGED">ALLEGED — 5 000 / 20 000 MAD</option>
                <option value="STANDARD">STANDARD — 50 000 / 200 000 MAD</option>
                <option value="RENFORCE">RENFORCE — 500 000 / 2 000 000 MAD</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="text-[10px] text-[#7d8590] block mb-1.5">Motif</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                placeholder="Documents vérifiés, entretien EDD…"
                className="w-full text-xs bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-2.5 py-1.5 outline-none resize-none font-mono" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPromoting(null)}
                className="flex-1 text-xs py-1.5 rounded-md border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] transition-colors">
                Annuler
              </button>
              <button
                disabled={reason.trim().length < 5 || isPending}
                onClick={() => { onPromote(promoting.id, newTier, reason); setPromoting(null); }}
                className="flex-1 text-xs py-1.5 rounded-md border border-[#1f6feb]/40 bg-[#1f6feb]/10 text-[#58a6ff] disabled:opacity-40 transition-colors">
                {isPending ? "…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Composant onglet EDD ─────────────────────────────────────────────────────

interface EddCaseRow {
  id: number; caseId: string; title: string; status: string;
  decision: string; findings: string | null;
  createdAt: Date; updatedAt: Date;
}

interface EddChecklistItem {
  id: string; label: string; done: boolean; notes?: string; doneAt?: string;
}

interface EddChecklist {
  items: EddChecklistItem[];
  interview: boolean;
  interviewDate?: string;
  interviewNotes?: string;
}

function EddTab({
  openCase, history, wallets, onInit, onUpdateItem,
  onRecordInterview, onComplete, onReject, isPending,
}: {
  openCase: EddCaseRow | null;
  history: EddCaseRow[];
  wallets: Array<{ id: number; walletId: string; kycTier: string }>;
  onInit: (walletId: number) => void;
  onUpdateItem: (caseId: number, itemId: string, done: boolean, notes?: string) => void;
  onRecordInterview: (caseId: number, date: string, notes: string) => void;
  onComplete: (caseId: number, walletId: number, decision: string) => void;
  onReject: (caseId: number, reason: string) => void;
  isPending: boolean;
}) {
  const { t } = useI18n();
  const [selectedWalletId, setSelectedWalletId] = useState<number>(wallets[0]?.id ?? 0);
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [showInterview, setShowInterview] = useState(false);
  const [decisionText, setDecisionText] = useState("");
  const [rejectText, setRejectText] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  const [showReject, setShowReject] = useState(false);

  const checklist: EddChecklist | null = openCase?.findings
    ? (() => { try { return JSON.parse(openCase.findings) as EddChecklist; } catch { return null; } })()
    : null;

  const allItemsDone   = checklist?.items.every(i => i.done) ?? false;
  const interviewDone  = checklist?.interview ?? false;
  const canComplete    = allItemsDone && interviewDone;

  // Trouver le walletId depuis le titre du dossier EDD ouvert
  const caseWalletId: number | null = (() => {
    if (!openCase) return null;
    const m = openCase.title?.match(/Wallet #(\d+)/);
    return m?.[1] ? parseInt(m[1]) : null;
  })();

  const STATUS_COLOR: Record<string, string> = {
    OPEN:   "#34D399",
    CLOSED: "#7d8590",
  };

  return (
    <div className="space-y-4">

      {/* ── Dossier EDD ouvert ── */}
      {!openCase ? (
        <div className="wr-card-modern p-6">
          <div className="flex items-center gap-3 mb-4">
            <ClipboardCheck size={18} className="text-[#30363d]" />
            <p className="text-xs font-mono text-[#7d8590]">{t.common.noData}</p>
          </div>
          {wallets.length > 0 && (
            <div className="flex items-center gap-3">
              <select
                value={selectedWalletId}
                onChange={e => setSelectedWalletId(Number(e.target.value))}
                className="text-xs bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-2.5 py-1.5 outline-none font-mono"
              >
                {wallets.map(w => (
                  <option key={w.id} value={w.id}>{w.walletId} — {w.kycTier}</option>
                ))}
              </select>
              <button
                disabled={isPending || !selectedWalletId}
                onClick={() => onInit(selectedWalletId)}
                className="text-xs px-4 py-1.5 rounded-md border border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399] hover:bg-[#34D399]/20 disabled:opacity-40 transition-colors font-mono"
              >
                {isPending ? "…" : "Démarrer la procédure EDD"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="wr-card-modern divide-y divide-[#21262d]">
          {/* Header dossier */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardCheck size={14} className="text-[#34D399]" />
              <span className="text-xs font-mono text-[#58a6ff]">{openCase.caseId}</span>
              <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 600,
                padding: "1px 7px", borderRadius: 4,
                background: `${STATUS_COLOR[openCase.status] ?? "#7d8590"}18`,
                color: STATUS_COLOR[openCase.status] ?? "#7d8590",
                border: `1px solid ${STATUS_COLOR[openCase.status] ?? "#7d8590"}40`,
              }}>
                {openCase.status}
              </span>
            </div>
            <span className="text-[10px] font-mono text-[#7d8590]">
              Ouvert le {new Date(openCase.createdAt).toLocaleDateString("fr-MA")}
            </span>
          </div>

          {/* Checklist */}
          {checklist && (
            <div className="p-4">
              <p className="text-[10px] font-mono text-[#7d8590] uppercase tracking-wider mb-3">Checklist de diligence</p>
              <div className="space-y-2">
                {checklist.items.map(item => (
                  <div key={item.id} className="flex items-start gap-3">
                    <button
                      onClick={() => onUpdateItem(openCase.id, item.id, !item.done)}
                      disabled={isPending}
                      className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        item.done
                          ? "bg-[#34D399]/20 border-[#34D399]/60"
                          : "bg-transparent border-[#30363d] hover:border-[#484f58]"
                      }`}
                    >
                      {item.done && <CheckCircle size={10} className="text-[#34D399]" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-mono ${item.done ? "text-[#7d8590] line-through" : "text-[#e6edf3]"}`}>
                        {item.label}
                      </p>
                      {item.done && item.doneAt && (
                        <p className="text-[10px] font-mono text-[#7d8590] mt-0.5">
                          ✓ {new Date(item.doneAt).toLocaleDateString("fr-MA")}
                          {item.notes && ` — ${item.notes}`}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entretien */}
          <div className="p-4">
            {interviewDone && checklist?.interviewDate ? (
              <div className="flex items-center gap-2 text-xs font-mono text-[#34D399]">
                <CheckCircle size={12} />
                Entretien enregistré le {checklist.interviewDate}
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowInterview(!showInterview)}
                  className="text-xs font-mono text-[#7d8590] hover:text-[#e6edf3] flex items-center gap-2 transition-colors"
                >
                  <Clock size={12} />
                  {showInterview ? "Masquer" : "Enregistrer l'entretien EDD"}
                </button>
                {showInterview && (
                  <div className="mt-3 space-y-3">
                    <input
                      type="date"
                      value={interviewDate}
                      onChange={e => setInterviewDate(e.target.value)}
                      className="w-full text-xs bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-2.5 py-1.5 outline-none font-mono"
                    />
                    <textarea
                      value={interviewNotes}
                      onChange={e => setInterviewNotes(e.target.value)}
                      rows={3}
                      placeholder="Compte-rendu de l'entretien, observations…"
                      className="w-full text-xs bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-2.5 py-1.5 outline-none resize-none font-mono"
                    />
                    <button
                      disabled={!interviewDate || interviewNotes.length < 20 || isPending}
                      onClick={() => {
                        onRecordInterview(openCase.id, interviewDate, interviewNotes);
                        setShowInterview(false);
                      }}
                      className="text-xs px-3 py-1.5 rounded-md border border-[#58a6ff]/40 bg-[#58a6ff]/10 text-[#58a6ff] disabled:opacity-40 transition-colors font-mono"
                    >
                      {isPending ? "…" : "Enregistrer l'entretien"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Validation / Rejet (supervisor) */}
          <div className="p-4 flex items-center gap-3 flex-wrap">
            {!showComplete && !showReject && (
              <>
                <button
                  disabled={!canComplete || isPending}
                  onClick={() => setShowComplete(true)}
                  title={!canComplete ? "Checklist incomplète ou entretien manquant" : undefined}
                  className="text-xs px-4 py-1.5 rounded-md border border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399] disabled:opacity-30 transition-colors font-mono"
                >
                  Valider l'EDD
                </button>
                <button
                  disabled={isPending}
                  onClick={() => setShowReject(true)}
                  className="text-xs px-4 py-1.5 rounded-md border border-red-400/40 bg-red-400/10 text-red-400 disabled:opacity-30 transition-colors font-mono"
                >
                  Rejeter l'EDD
                </button>
              </>
            )}

            {showComplete && (
              <div className="w-full space-y-2">
                <textarea
                  value={decisionText}
                  onChange={e => setDecisionText(e.target.value)}
                  rows={3}
                  placeholder="Résumé des vérifications effectuées et conclusion…"
                  className="w-full text-xs bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-2.5 py-1.5 outline-none resize-none font-mono"
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowComplete(false)}
                    className="text-xs px-3 py-1.5 rounded-md border border-[#30363d] text-[#7d8590] transition-colors font-mono">
                    Annuler
                  </button>
                  <button
                    disabled={decisionText.length < 20 || isPending || caseWalletId === null}
                    onClick={() => {
                      if (caseWalletId !== null)
                        onComplete(openCase.id, caseWalletId, decisionText);
                    }}
                    className="text-xs px-4 py-1.5 rounded-md border border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399] disabled:opacity-40 transition-colors font-mono"
                  >
                    {isPending ? "…" : "Confirmer la validation"}
                  </button>
                </div>
              </div>
            )}

            {showReject && (
              <div className="w-full space-y-2">
                <textarea
                  value={rejectText}
                  onChange={e => setRejectText(e.target.value)}
                  rows={3}
                  placeholder="Raison du refus de la promotion au tier RENFORCÉ…"
                  className="w-full text-xs bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-2.5 py-1.5 outline-none resize-none font-mono"
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowReject(false)}
                    className="text-xs px-3 py-1.5 rounded-md border border-[#30363d] text-[#7d8590] transition-colors font-mono">
                    Annuler
                  </button>
                  <button
                    disabled={rejectText.length < 20 || isPending}
                    onClick={() => onReject(openCase.id, rejectText)}
                    className="text-xs px-4 py-1.5 rounded-md border border-red-400/40 bg-red-400/10 text-red-400 disabled:opacity-40 transition-colors font-mono"
                  >
                    {isPending ? "…" : "Confirmer le rejet"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Historique EDD ── */}
      {history.length > 0 && (
        <div className="wr-card-modern">
          <p className="text-[10px] font-mono text-[#7d8590] uppercase tracking-wider mb-3">Historique EDD</p>
          <div className="space-y-1">
            {history.map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs font-mono py-1">
                <span className="text-[#58a6ff]">{c.caseId}</span>
                <span style={{ fontSize: 10, color: STATUS_COLOR[c.status] ?? "#7d8590" }}>{c.status}</span>
                <span className="text-[#7d8590] text-[10px]">{c.decision}</span>
                <span className="text-[#484f58] text-[10px]">
                  {new Date(c.createdAt).toLocaleDateString("fr-MA")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
