import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { trpc } from "../lib/trpc";
import { formatRelative } from "../lib/utils";
import {
  Search, ShieldCheck, ShieldAlert, AlertTriangle,
  RefreshCw, Plus, Trash2, Shield, Database, Clock,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";

type Tab = "search" | "lists" | "custom" | "pending";

const TAB_LABELS: Record<Tab, string> = {
  search:  "Screening",
  lists:   "État des listes",
  custom:  "Liste personnalisée",
  pending: "En attente",
};

export function ScreeningPage() {
  const { user } = useAuth();
  const canReview = hasRole(user, "compliance_officer");
  const canAdmin  = hasRole(user, "admin");
  const canEdit   = hasRole(user, "supervisor");

  const [tab, setTab] = useState<Tab>("search");

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">Screening sanctions</h1>
        <p className="text-xs font-mono text-[#7d8590] mt-0.5">
          OFAC · UE · ONU · UK · Liste personnalisée
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-0 border-b border-[#21262d] mb-6">
        {(["search", "lists", "custom", "pending"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-mono border-b-2 transition-colors ${
              tab === t
                ? "border-[#58a6ff] text-[#58a6ff]"
                : "border-transparent text-[#7d8590] hover:text-[#e6edf3]"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "search"  && <SearchTab canReview={canReview} />}
      {tab === "lists"   && <ListsTab canAdmin={canAdmin} />}
      {tab === "custom"  && <CustomListTab canEdit={canEdit} />}
      {tab === "pending" && canReview && <PendingTab />}
      {tab === "pending" && !canReview && (
        <p className="text-xs font-mono text-[#484f58] text-center py-10">
          Accès réservé aux Compliance Officers
        </p>
      )}
    </AppLayout>
  );
}

// ─── Onglet Screening ─────────────────────────────────────────────────────────

function SearchTab({ canReview }: { canReview: boolean }) {
  const [customerId, setCustomerId]     = useState("");
  const [customerName, setCustomerName] = useState("");
  const [reviewTarget, setReviewTarget] = useState<{ id: number; name: string } | null>(null);
  const [decision, setDecision] = useState<"CONFIRMED" | "DISMISSED" | "ESCALATED">("DISMISSED");
  const [reason, setReason] = useState("");

  const runMutation    = trpc.screening.run.useMutation();
  const reviewMutation = trpc.screening.review.useMutation({
    onSuccess: () => { setReviewTarget(null); setReason(""); },
  });

  const result   = runMutation.data;
  const hasMatch = result?.status && result.status !== "CLEAR";

  const inputCls = "w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2.5 text-sm font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40";

  return (
    <>
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 mb-6">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">ID Client *</label>
            <input type="number" value={customerId}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setCustomerId(e.target.value)}
              placeholder="Ex : 42" className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">Nom complet *</label>
            <input value={customerName}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setCustomerName(e.target.value)}
              placeholder="Ex : Jean Dupont" className={inputCls} />
          </div>
        </div>
        <button
          onClick={() => runMutation.mutate({ customerId: parseInt(customerId), customerName })}
          disabled={!customerId || customerName.length < 2 || runMutation.isPending}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 hover:bg-[#1f6feb]/30 text-[#58a6ff] rounded-md transition-colors disabled:opacity-40"
        >
          <Search size={13} />
          {runMutation.isPending ? "Analyse en cours..." : "Lancer le screening"}
        </button>
      </div>

      {result && (
        <div className="space-y-4 animate-slide-in">
          <div className={`flex items-center gap-3 p-4 rounded-lg border ${
            hasMatch ? "bg-red-400/10 border-red-400/30" : "bg-emerald-400/10 border-emerald-400/30"
          }`}>
            {hasMatch
              ? <ShieldAlert size={20} className="text-red-400" />
              : <ShieldCheck size={20} className="text-emerald-400" />
            }
            <div className="flex-1">
              <p className={`text-sm font-semibold font-mono ${hasMatch ? "text-red-400" : "text-emerald-400"}`}>
                {hasMatch ? "Correspondance détectée" : "Aucune correspondance"}
              </p>
              <p className="text-xs font-mono text-[#7d8590] mt-0.5">Statut : {result.status}</p>
            </div>
            <Badge label={result.status} variant="status" />
          </div>

          {result.sanctionsResult && (
            <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-2">
              <h3 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">Résultat</h3>
              {result.sanctionsResult.matchedEntity
                ? <p className="text-sm font-mono text-[#e6edf3]">Entité : {result.sanctionsResult.matchedEntity}</p>
                : <p className="text-sm font-mono text-[#7d8590]">Aucune entité sanctionnée identifiée</p>
              }
              {result.sanctionsResult.matchScore !== undefined && (
                <p className="text-xs font-mono text-[#7d8590]">
                  Score : <span className={result.sanctionsResult.matchScore >= 80 ? "text-red-400" : "text-amber-400"}>
                    {result.sanctionsResult.matchScore}/100
                  </span>
                  {result.sanctionsResult.listSource && (
                    <span className="ml-3 text-[#484f58]">Liste : {result.sanctionsResult.listSource}</span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {canReview && reviewTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={15} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">Réviser — #{reviewTarget.id}</h3>
            </div>
            <div className="space-y-3 mb-4">
              <div className="flex gap-2">
                {(["DISMISSED", "CONFIRMED", "ESCALATED"] as const).map((d) => (
                  <button key={d} onClick={() => setDecision(d)}
                    className={`flex-1 py-1.5 text-[10px] font-mono rounded-md border transition-colors ${
                      decision === d
                        ? d === "DISMISSED" ? "bg-emerald-400/15 border-emerald-400/40 text-emerald-400"
                        : d === "CONFIRMED" ? "bg-red-400/15 border-red-400/40 text-red-400"
                        :                     "bg-amber-400/15 border-amber-400/40 text-amber-400"
                        : "border-[#30363d] text-[#7d8590]"
                    }`}>
                    {d === "DISMISSED" ? "REJETÉ" : d === "CONFIRMED" ? "CONFIRMÉ" : "ESCALADÉ"}
                  </button>
                ))}
              </div>
              <textarea value={reason}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setReason(e.target.value)}
                rows={3} placeholder="Justification (min 10 caractères)..."
                className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setReviewTarget(null); setReason(""); }}
                className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md">Annuler</button>
              <button disabled={reason.length < 10 || reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ id: reviewTarget.id, decision, reason })}
                className="flex-1 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 text-[#58a6ff] rounded-md disabled:opacity-40">
                {reviewMutation.isPending ? "Enregistrement..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Onglet État des listes ───────────────────────────────────────────────────

function ListsTab({ canAdmin }: { canAdmin: boolean }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.screening.listsStatus.useQuery();
  const refreshMutation = trpc.screening.forceRefresh.useMutation({
    onSuccess: () => utils.screening.listsStatus.invalidate(),
  });

  const SOURCE_COLORS: Record<string, string> = {
    OFAC: "text-blue-400   bg-blue-400/10   border-blue-400/20",
    EU:   "text-purple-400 bg-purple-400/10 border-purple-400/20",
    UN:   "text-cyan-400   bg-cyan-400/10   border-cyan-400/20",
    UK:   "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    CUSTOM: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  };

  return (
    <div className="space-y-4">
      {/* Stat global */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Entités totales"
          value={data ? String(data.total) : "—"}
          icon={Database}
        />
        <StatCard
          label="Listes actives"
          value={data ? String(data.providers.filter((p: { inCache: boolean }) => p.inCache).length) + " / " + String(data.providers.length) : "—"}
          icon={Shield}
        />
        <StatCard
          label="Dernière mise à jour"
          value={data?.updatedAt ? formatRelative(new Date(data.updatedAt)) : "—"}
          icon={Clock}
        />
      </div>

      {/* Tableau des listes */}
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          <h2 className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase">Listes de sanctions</h2>
          {canAdmin && (
            <button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono bg-amber-400/10 border border-amber-400/30 text-amber-400 hover:bg-amber-400/20 rounded-md disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={11} className={refreshMutation.isPending ? "animate-spin" : ""} />
              {refreshMutation.isPending ? "Mise à jour..." : "Forcer la mise à jour"}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-5 h-5 border-2 border-[#58a6ff]/30 border-t-[#58a6ff] rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="divide-y divide-[#21262d]/50">
            {data?.providers.map((p: {
              provider: string; count: number;
              lastUpdate: string | null; inCache: boolean;
            }) => (
              <div key={p.provider} className="px-4 py-4 flex items-center gap-4">
                {/* Badge source */}
                <span className={`text-[10px] font-mono px-2 py-1 rounded border font-semibold w-16 text-center ${
                  SOURCE_COLORS[p.provider] ?? "text-[#7d8590] bg-[#161b22] border-[#30363d]"
                }`}>
                  {p.provider}
                </span>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    {/* Statut cache */}
                    <span className={`flex items-center gap-1 text-[10px] font-mono ${
                      p.inCache ? "text-emerald-400" : "text-[#484f58]"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${p.inCache ? "bg-emerald-400" : "bg-[#484f58]"}`} />
                      {p.inCache ? "En cache" : "Non chargé"}
                    </span>
                    {/* Nombre d'entrées */}
                    <span className="text-xs font-mono text-[#e6edf3] font-medium">
                      {p.count > 0 ? `${p.count.toLocaleString("fr-FR")} entités` : "—"}
                    </span>
                  </div>
                  {/* Dernière mise à jour */}
                  <p className="text-[10px] font-mono text-[#484f58] mt-0.5">
                    {p.lastUpdate
                      ? `Mis à jour ${formatRelative(new Date(p.lastUpdate))}`
                      : "Jamais chargé"}
                  </p>
                </div>

                {/* Source officielle */}
                <div className="text-right text-[10px] font-mono text-[#484f58] hidden sm:block">
                  {p.provider === "OFAC"   && "US Treasury"}
                  {p.provider === "EU"     && "Commission EU"}
                  {p.provider === "UN"     && "Conseil de sécurité ONU"}
                  {p.provider === "UK"     && "HM Treasury OFSI"}
                  {p.provider === "CUSTOM" && "Liste locale"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Résultat du refresh */}
      {refreshMutation.data && (
        <div className="bg-emerald-400/10 border border-emerald-400/20 rounded-lg p-4">
          <p className="text-xs font-mono text-emerald-400 font-semibold mb-2">
            ✅ Mise à jour terminée — {refreshMutation.data.total.toLocaleString("fr-FR")} entités chargées
          </p>
          <div className="space-y-1">
            {refreshMutation.data.statuses.map((s: {
              provider: string; count: number; fromCache: boolean; error?: string;
            }) => (
              <p key={s.provider} className="text-[10px] font-mono text-[#7d8590]">
                {s.error ? "⚠️" : s.fromCache ? "📦" : "🔄"} {s.provider} :
                {" "}{s.count.toLocaleString("fr-FR")} entités
                {s.fromCache ? " (cache)" : " (rechargé)"}
                {s.error ? ` — ${s.error}` : ""}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Note explicative */}
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
        <p className="text-[10px] font-mono text-[#484f58] leading-relaxed">
          Les listes sont chargées en cache Redis à 02:00 UTC chaque nuit (TTL 23h).
          La mise à jour forcée re-télécharge toutes les listes depuis leurs sources officielles.
          En cas d'échec d'une source, les données en cache sont conservées automatiquement.
        </p>
      </div>
    </div>
  );
}

// ─── Onglet Liste personnalisée ───────────────────────────────────────────────

type CustomEntry = {
  id: string; name: string; aliases: string[];
  country: string; reason: string; addedAt: string; addedBy: number | string;
};

function CustomListTab({ canEdit }: { canEdit: boolean }) {
  const utils = trpc.useUtils();
  const { data: entries, isLoading } = trpc.screening.getCustomList.useQuery();
  const addMutation    = trpc.screening.addCustomEntry.useMutation({
    onSuccess: () => { utils.screening.getCustomList.invalidate(); setShowAdd(false); resetForm(); },
  });
  const removeMutation = trpc.screening.removeCustomEntry.useMutation({
    onSuccess: () => utils.screening.getCustomList.invalidate(),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", aliases: "", country: "", reason: "" });

  function resetForm() {
    setForm({ name: "", aliases: "", country: "", reason: "" });
  }

  const COUNTRIES = [
    { code: "",   label: "Tous pays" },
    { code: "AF", label: "Afghanistan" }, { code: "BY", label: "Biélorussie" },
    { code: "CF", label: "Centrafrique" }, { code: "CD", label: "Congo (RDC)" },
    { code: "CU", label: "Cuba" }, { code: "KP", label: "Corée du Nord" },
    { code: "IR", label: "Iran" }, { code: "IQ", label: "Irak" },
    { code: "LY", label: "Libye" }, { code: "ML", label: "Mali" },
    { code: "MM", label: "Myanmar" }, { code: "NI", label: "Nicaragua" },
    { code: "RU", label: "Russie" }, { code: "SO", label: "Somalie" },
    { code: "SS", label: "Soudan du Sud" }, { code: "SY", label: "Syrie" },
    { code: "VE", label: "Venezuela" }, { code: "YE", label: "Yémen" },
    { code: "ZW", label: "Zimbabwe" },
  ];

  const inputCls = "w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono text-[#7d8590]">
            {entries?.length ?? 0} entrée(s) — incluses dans chaque screening
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/30 rounded-md"
          >
            <Plus size={12} /> Ajouter une entrée
          </button>
        )}
      </div>

      {/* Liste */}
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-5 h-5 border-2 border-[#58a6ff]/30 border-t-[#58a6ff] rounded-full animate-spin mx-auto" />
          </div>
        ) : !entries?.length ? (
          <div className="p-8 text-center">
            <Shield size={28} className="text-[#30363d] mx-auto mb-2" />
            <p className="text-xs font-mono text-[#484f58]">Aucune entrée personnalisée</p>
            <p className="text-[10px] font-mono text-[#30363d] mt-1">
              Ajoutez des personnes ou entités spécifiques à surveiller
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#21262d]/50">
            {(entries as CustomEntry[]).map((e) => (
              <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-medium text-[#e6edf3]">{e.name}</span>
                    {e.country && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#161b22] border border-[#30363d] rounded text-[#7d8590]">
                        {e.country}
                      </span>
                    )}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-amber-400/10 border border-amber-400/20 rounded text-amber-400">
                      CUSTOM
                    </span>
                  </div>
                  {e.aliases.length > 0 && (
                    <p className="text-[10px] font-mono text-[#484f58] mt-0.5">
                      Aliases : {e.aliases.join(", ")}
                    </p>
                  )}
                  <p className="text-[10px] font-mono text-[#7d8590] mt-0.5">{e.reason}</p>
                  <p className="text-[10px] font-mono text-[#30363d] mt-0.5">
                    Ajouté {formatRelative(new Date(e.addedAt))}
                  </p>
                </div>
                {canEdit && (
                  <button
                    onClick={() => removeMutation.mutate({ id: e.id })}
                    disabled={removeMutation.isPending}
                    className="p-1.5 hover:bg-red-400/10 rounded transition-colors flex-shrink-0"
                  >
                    <Trash2 size={13} className="text-[#484f58] hover:text-red-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal ajout */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-[#21262d]">
              <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">
                Nouvelle entrée personnalisée
              </h3>
              <p className="text-[10px] font-mono text-[#484f58] mt-1">
                Sera incluse dans tous les screenings futurs
              </p>
            </div>

            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1">
                  Nom <span className="text-red-400">*</span>
                </label>
                <input value={form.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex : Jean Dupont, Société XYZ"
                  className={inputCls} />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1">
                  Aliases (séparés par des virgules)
                </label>
                <input value={form.aliases}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, aliases: e.target.value }))}
                  placeholder="Ex : J. Dupont, Dupont Jean"
                  className={inputCls} />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1">
                  Pays (optionnel)
                </label>
                <select value={form.country}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, country: e.target.value }))}
                  className={inputCls}>
                  {COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1">
                  Motif de surveillance <span className="text-red-400">*</span>
                </label>
                <textarea value={form.reason}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, reason: e.target.value }))}
                  rows={2} placeholder="Ex : Suspicion de fraude documentée, Client PEP identifié..."
                  className={`${inputCls} resize-none`} />
              </div>

              {addMutation.error && (
                <p className="text-xs font-mono text-red-400">{addMutation.error.message}</p>
              )}
            </div>

            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => { setShowAdd(false); resetForm(); }}
                className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md">
                Annuler
              </button>
              <button
                disabled={form.name.length < 2 || form.reason.length < 5 || addMutation.isPending}
                onClick={() => addMutation.mutate({
                  name:    form.name,
                  aliases: form.aliases.split(",").map((s: string) => s.trim()).filter(Boolean),
                  ...(form.country ? { country: form.country } : {}),
                  reason:  form.reason,
                })}
                className="flex-1 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/30 rounded-md disabled:opacity-40"
              >
                {addMutation.isPending ? "Ajout..." : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet En attente ────────────────────────────────────────────────────────

function PendingTab() {
  const [reviewTarget, setReviewTarget] = useState<{ id: number; name: string } | null>(null);
  const [decision, setDecision] = useState<"CONFIRMED" | "DISMISSED" | "ESCALATED">("DISMISSED");
  const [reason, setReason] = useState("");

  const { data, isLoading } = trpc.screening.getPending.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const reviewMutation = trpc.screening.review.useMutation({
    onSuccess: () => { utils.screening.getPending.invalidate(); setReviewTarget(null); setReason(""); },
  });

  if (isLoading) return <div className="h-16 bg-[#0d1117] border border-[#21262d] rounded-lg animate-pulse" />;

  return (
    <>
      {!data?.length ? (
        <div className="text-xs font-mono text-[#484f58] bg-[#0d1117] border border-[#21262d] rounded-lg px-4 py-8 text-center">
          <ShieldCheck size={28} className="text-[#30363d] mx-auto mb-2" />
          Aucun screening en attente de révision
        </div>
      ) : (
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
          <div className="divide-y divide-[#21262d]/50">
            {data.map((s: {
              id: number; customerId: number; screeningType: string;
              status: string; matchScore: number; matchedEntity: string | null;
              listSource: string | null; decision: string; createdAt: Date;
            }) => (
              <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#161b22]">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-[#e6edf3]">
                    Client #{s.customerId}
                    {s.matchedEntity && <span className="text-red-400 ml-2">→ {s.matchedEntity}</span>}
                  </p>
                  <p className="text-[10px] font-mono text-[#7d8590] mt-0.5">
                    {s.listSource ?? s.screeningType}
                    {s.matchScore > 0 && <span className="ml-2 text-amber-400">score {s.matchScore}/100</span>}
                    <span className="ml-2">{formatRelative(s.createdAt)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge label={s.status} variant="status" />
                  <button
                    onClick={() => setReviewTarget({ id: s.id, name: `Client #${s.customerId}` })}
                    className="text-[10px] font-mono text-[#58a6ff] hover:underline"
                  >
                    Réviser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={15} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">
                Réviser — {reviewTarget.name}
              </h3>
            </div>
            <div className="space-y-3 mb-4">
              <div className="flex gap-2">
                {(["DISMISSED", "CONFIRMED", "ESCALATED"] as const).map((d) => (
                  <button key={d} onClick={() => setDecision(d)}
                    className={`flex-1 py-1.5 text-[10px] font-mono rounded-md border transition-colors ${
                      decision === d
                        ? d === "DISMISSED" ? "bg-emerald-400/15 border-emerald-400/40 text-emerald-400"
                        : d === "CONFIRMED" ? "bg-red-400/15 border-red-400/40 text-red-400"
                        :                     "bg-amber-400/15 border-amber-400/40 text-amber-400"
                        : "border-[#30363d] text-[#7d8590]"
                    }`}>
                    {d === "DISMISSED" ? "REJETÉ" : d === "CONFIRMED" ? "CONFIRMÉ" : "ESCALADÉ"}
                  </button>
                ))}
              </div>
              <textarea value={reason}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setReason(e.target.value)}
                rows={3} placeholder="Justification (min 10 caractères)..."
                className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setReviewTarget(null); setReason(""); }}
                className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md">Annuler</button>
              <button disabled={reason.length < 10 || reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ id: reviewTarget.id, decision, reason })}
                className="flex-1 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 text-[#58a6ff] rounded-md disabled:opacity-40">
                {reviewMutation.isPending ? "Enregistrement..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
