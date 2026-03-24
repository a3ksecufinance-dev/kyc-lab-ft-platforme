import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { trpc } from "../lib/trpc";
import { formatRelative } from "../lib/utils";
import {
  Shield, Plus, ToggleLeft, ToggleRight, Trash2,
  FlaskConical, Activity, ChevronDown, ChevronRight,
  Zap, AlertTriangle,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type AmlRule = {
  id: number; ruleId: string; name: string; description: string | null;
  category: string; status: "ACTIVE" | "INACTIVE" | "TESTING";
  baseScore: number; priority: string; alertType: string;
  thresholdValue: string | null; windowMinutes: number | null;
  countThreshold: number | null; conditions: unknown;
  createdAt: Date; updatedAt: Date;
};

const CATEGORY_LABELS: Record<string, string> = {
  THRESHOLD: "Seuil", FREQUENCY: "Fréquence", PATTERN: "Pattern",
  GEOGRAPHY: "Géographie", COUNTERPARTY: "Contrepartie",
  VELOCITY: "Vélocité", CUSTOMER: "Client",
};

const CATEGORY_COLORS: Record<string, string> = {
  THRESHOLD:   "text-amber-400  bg-amber-400/10  border-amber-400/20",
  FREQUENCY:   "text-blue-400   bg-blue-400/10   border-blue-400/20",
  PATTERN:     "text-purple-400 bg-purple-400/10 border-purple-400/20",
  GEOGRAPHY:   "text-red-400    bg-red-400/10    border-red-400/20",
  COUNTERPARTY:"text-orange-400 bg-orange-400/10 border-orange-400/20",
  VELOCITY:    "text-cyan-400   bg-cyan-400/10   border-cyan-400/20",
  CUSTOMER:    "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
};

const STATUS_ICON = {
  ACTIVE:   <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />,
  INACTIVE: <span className="w-2 h-2 rounded-full bg-[#484f58] inline-block" />,
  TESTING:  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />,
};

// ─── Page principale ──────────────────────────────────────────────────────────

export function AmlRulesPage() {
  const { user } = useAuth();
  const canEdit   = hasRole(user, "supervisor");
  const canDelete = hasRole(user, "admin");

  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: rules, isLoading } = trpc.amlRules.list.useQuery();

  const toggleMutation = trpc.amlRules.toggleStatus.useMutation({
    onSuccess: () => utils.amlRules.list.invalidate(),
  });
  const deleteMutation = trpc.amlRules.delete.useMutation({
    onSuccess: () => utils.amlRules.list.invalidate(),
  });
  const seedMutation = trpc.amlRules.seedDefaults.useMutation({
    onSuccess: () => utils.amlRules.list.invalidate(),
  });

  const active   = rules?.filter((r: AmlRule) => r.status === "ACTIVE").length ?? 0;
  const inactive = rules?.filter((r: AmlRule) => r.status === "INACTIVE").length ?? 0;
  const testing  = rules?.filter((r: AmlRule) => r.status === "TESTING").length ?? 0;
  const avgScore = rules?.length
    ? Math.round(rules.reduce((s: number, r: AmlRule) => s + r.baseScore, 0) / rules.length)
    : 0;

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">
            Règles AML dynamiques
          </h1>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            Configuration sans redéploiement — {rules?.length ?? 0} règles
          </p>
        </div>
        <div className="flex gap-2">
          {rules?.length === 0 && canEdit && (
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono bg-amber-400/10 border border-amber-400/30 hover:bg-amber-400/20 text-amber-400 rounded-md"
            >
              <Zap size={12} />
              {seedMutation.isPending ? "Chargement..." : "Charger règles par défaut"}
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 hover:bg-[#1f6feb]/30 text-[#58a6ff] rounded-md"
            >
              <Plus size={12} /> Nouvelle règle
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Règles actives"   value={String(active)}   icon={Shield}    accent="default" />
        <StatCard label="En test A/B"      value={String(testing)}  icon={FlaskConical} />
        <StatCard label="Inactives"        value={String(inactive)} icon={ToggleLeft} />
        <StatCard label="Score moyen"      value={`${avgScore}/100`} icon={Activity} />
      </div>

      {/* Légende */}
      <div className="flex gap-4 mb-4 text-[10px] font-mono text-[#484f58]">
        <span className="flex items-center gap-1.5">{STATUS_ICON.ACTIVE}   Actif — génère des alertes</span>
        <span className="flex items-center gap-1.5">{STATUS_ICON.TESTING}  Test A/B — s'exécute sans alerter</span>
        <span className="flex items-center gap-1.5">{STATUS_ICON.INACTIVE} Inactif — ignoré</span>
      </div>

      {/* Liste des règles */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-[#161b22] border border-[#21262d] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : rules?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[#0d1117] border border-[#21262d] rounded-lg">
          <Shield size={32} className="text-[#30363d] mb-3" />
          <p className="text-sm font-mono text-[#484f58]">Aucune règle AML configurée</p>
          <p className="text-xs font-mono text-[#30363d] mt-1">
            Cliquez sur "Charger règles par défaut" pour démarrer
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {(rules ?? []).map((rule: AmlRule) => (
            <RuleCard
              key={rule.id}
              rule={rule as AmlRule}
              expanded={expandedId === rule.id}
              onToggleExpand={(): void => { setExpandedId(expandedId === rule.id ? null : rule.id); }}
              onStatusChange={(s: AmlRule["status"]): void => { toggleMutation.mutate({ id: rule.id, status: s }); }}
              onDelete={(): void => {
                if (confirm(`Supprimer "${rule.name}" ?`)) deleteMutation.mutate({ id: rule.id });
              }}
              canEdit={canEdit}
              canDelete={canDelete}
              isPending={(toggleMutation.isPending || deleteMutation.isPending) as boolean}
            />
          ))}
        </div>
      )}

      {/* Modal création */}
      {showCreate && <CreateRuleModal onClose={() => setShowCreate(false)} />}
    </AppLayout>
  );
}

// ─── Carte d'une règle ────────────────────────────────────────────────────────

function RuleCard({
  rule, expanded, onToggleExpand, onStatusChange, onDelete,
  canEdit, canDelete, isPending,
}: {
  rule: AmlRule;
  expanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (s: AmlRule["status"]) => void;
  onDelete: () => void;
  canEdit: boolean; canDelete: boolean; isPending: boolean;
}) {
  const catColor = CATEGORY_COLORS[rule.category] ?? "text-[#7d8590] bg-[#161b22] border-[#30363d]";

  function nextStatus(s: AmlRule["status"]): AmlRule["status"] {
    if (s === "ACTIVE")   return "INACTIVE";
    if (s === "INACTIVE") return "TESTING";
    return "ACTIVE";
  }

  return (
    <div className={`bg-[#0d1117] border rounded-lg overflow-hidden transition-colors ${
      rule.status === "ACTIVE"   ? "border-[#21262d]" :
      rule.status === "TESTING"  ? "border-amber-400/20" :
                                   "border-[#161b22] opacity-60"
    }`}>
      {/* Header de la carte */}
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Icône statut */}
        <div className="flex-shrink-0">{STATUS_ICON[rule.status]}</div>

        {/* Info principale */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium font-mono text-[#e6edf3]">{rule.name}</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${catColor}`}>
              {CATEGORY_LABELS[rule.category] ?? rule.category}
            </span>
            {rule.status === "TESTING" && (
              <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                <FlaskConical size={10} /> A/B TEST
              </span>
            )}
          </div>
          {rule.description && (
            <p className="text-[10px] font-mono text-[#484f58] mt-0.5 truncate">{rule.description}</p>
          )}
        </div>

        {/* Score & priorité */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs font-mono font-semibold text-[#e6edf3]">{rule.baseScore}</p>
            <p className="text-[10px] font-mono text-[#484f58]">score</p>
          </div>
          <div>
            <Badge label={rule.priority} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {canEdit && (
            <button
              disabled={isPending}
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onStatusChange(nextStatus(rule.status)); }}
              className="p-1.5 hover:bg-[#21262d] rounded transition-colors"
              title={`Passer en ${nextStatus(rule.status).toLowerCase()}`}
            >
              {rule.status === "ACTIVE"
                ? <ToggleRight size={16} className="text-emerald-400" />
                : <ToggleLeft  size={16} className="text-[#484f58]" />
              }
            </button>
          )}
          {canDelete && (
            <button
              disabled={isPending}
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 hover:bg-red-400/10 rounded transition-colors"
            >
              <Trash2 size={14} className="text-[#484f58] hover:text-red-400" />
            </button>
          )}
          <button
            onClick={onToggleExpand}
            className="p-1.5 hover:bg-[#21262d] rounded transition-colors"
          >
            {expanded
              ? <ChevronDown  size={14} className="text-[#7d8590]" />
              : <ChevronRight size={14} className="text-[#7d8590]" />
            }
          </button>
        </div>
      </div>

      {/* Détail expandable */}
      {expanded && <RuleDetail rule={rule} />}
    </div>
  );
}

// ─── Détail d'une règle (expandé) ────────────────────────────────────────────

function RuleDetail({ rule }: { rule: AmlRule }) {
  const { data: stats } = trpc.amlRules.stats.useQuery({ id: rule.id, days: 7 });

  return (
    <div className="border-t border-[#21262d] px-4 py-3 grid grid-cols-3 gap-4">
      {/* Conditions JSON */}
      <div className="col-span-2">
        <p className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-2">Conditions</p>
        <pre className="text-[10px] font-mono text-[#e6edf3] bg-[#161b22] border border-[#21262d] rounded p-2 overflow-x-auto">
          {JSON.stringify(rule.conditions, null, 2)}
        </pre>
        <div className="flex gap-4 mt-2 text-[10px] font-mono text-[#484f58]">
          {rule.thresholdValue && <span>Seuil : {rule.thresholdValue}€</span>}
          {rule.windowMinutes  && <span>Fenêtre : {rule.windowMinutes} min</span>}
          {rule.countThreshold && <span>Comptage : {rule.countThreshold}</span>}
          <span>Type alerte : {rule.alertType}</span>
          <span>Màj : {formatRelative(rule.updatedAt)}</span>
        </div>
      </div>

      {/* Stats 7 jours */}
      <div>
        <p className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-2">Stats 7 jours</p>
        {stats ? (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#7d8590]">Exécutions</span>
              <span className="text-[#e6edf3]">{stats.totalExecutions}</span>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#7d8590]">Déclenchées</span>
              <span className="text-[#e6edf3]">{stats.totalTriggered}</span>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#7d8590]">Taux</span>
              <span className={`font-medium ${
                stats.triggerRate > 20 ? "text-red-400" :
                stats.triggerRate > 5  ? "text-amber-400" : "text-emerald-400"
              }`}>{stats.triggerRate}%</span>
            </div>
            {/* Barre de taux */}
            <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden mt-1">
              <div
                className={`h-full rounded-full transition-all ${
                  stats.triggerRate > 20 ? "bg-red-400" :
                  stats.triggerRate > 5  ? "bg-amber-400" : "bg-emerald-400"
                }`}
                style={{ width: `${Math.min(stats.triggerRate, 100)}%` }}
              />
            </div>
            {stats.triggerRate > 15 && (
              <p className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                <AlertTriangle size={10} /> Taux élevé — vérifier le seuil
              </p>
            )}
          </div>
        ) : (
          <div className="text-[10px] font-mono text-[#484f58]">Chargement...</div>
        )}
      </div>
    </div>
  );
}

// ─── Modal création ───────────────────────────────────────────────────────────

function CreateRuleModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();

  const [name, setName]         = useState("");
  const [desc, setDesc]         = useState("");
  const [category, setCategory] = useState("THRESHOLD");
  const [status, setStatus]     = useState("ACTIVE");
  const [score, setScore]       = useState(50);
  const [priority, setPriority] = useState("MEDIUM");
  const [alertType, setAlertType] = useState("THRESHOLD");
  const [condType] = useState<"simple" | "compound">("simple");
  // Simple condition
  const [field, setField]       = useState("amount");
  const [op, setOp]             = useState(">=");
  const [value, setValue]       = useState("");
  // Threshold & window
  const [threshold, setThreshold] = useState("");
  const [window, setWindow]       = useState("");

  const mutation = trpc.amlRules.create.useMutation({
    onSuccess: () => { utils.amlRules.list.invalidate(); onClose(); },
  });

  function buildConditions() {
    if (condType === "simple") {
      const v = [">=", "<=", ">", "<"].includes(op) ? Number(value) : value;
      return { field, op, value: v };
    }
    return { field, op, value: Number(value) };
  }

  const inputCls = "w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40";
  const labelCls = "block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1117] border border-[#30363d] rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-[#21262d] flex-shrink-0">
          <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">Nouvelle règle AML</h3>
          <p className="text-[10px] font-mono text-[#484f58] mt-1">
            Active immédiatement — aucun redéploiement requis
          </p>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex-1 space-y-3">
          <div>
            <label className={labelCls}>Nom <span className="text-red-400">*</span></label>
            <input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setName(e.target.value)}
              placeholder="Ex : Seuil TRACFIN 10 000€" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea value={desc} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDesc(e.target.value)}
              rows={2} placeholder="Objectif réglementaire de cette règle..." className={`${inputCls} resize-none`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Catégorie</label>
              <select value={category} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setCategory(e.target.value)} className={inputCls}>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Statut initial</label>
              <select value={status} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setStatus(e.target.value)} className={inputCls}>
                <option value="ACTIVE">Actif</option>
                <option value="TESTING">Test A/B</option>
                <option value="INACTIVE">Inactif</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Score (0–100)</label>
              <input type="number" min={0} max={100} value={score}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setScore(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Priorité</label>
              <select value={priority} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setPriority(e.target.value)} className={inputCls}>
                <option value="LOW">Faible</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="HIGH">Haute</option>
                <option value="CRITICAL">Critique</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Type alerte</label>
              <select value={alertType} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setAlertType(e.target.value)} className={inputCls}>
                <option value="THRESHOLD">Seuil</option>
                <option value="PATTERN">Pattern</option>
                <option value="VELOCITY">Vélocité</option>
                <option value="SANCTIONS">Sanctions</option>
                <option value="PEP">PEP</option>
                <option value="FRAUD">Fraude</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-[#21262d]">
            <p className="text-[10px] font-mono text-[#58a6ff] mb-3 tracking-widest uppercase">Condition de déclenchement</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Champ</label>
              <select value={field} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setField(e.target.value)} className={inputCls}>
                <optgroup label="Transaction">
                  <option value="amount">Montant</option>
                  <option value="channel">Canal</option>
                  <option value="transactionType">Type</option>
                  <option value="counterpartyCountry">Pays contrepartie</option>
                  <option value="amountIsRound">Montant rond</option>
                </optgroup>
                <optgroup label="Client">
                  <option value="pepStatus">Statut PEP</option>
                  <option value="riskLevel">Niveau risque</option>
                  <option value="kycStatus">Statut KYC</option>
                </optgroup>
                <optgroup label="Agrégés (24h)">
                  <option value="recentTxCount">Nb tx récentes</option>
                  <option value="recentTxVolume">Volume récent</option>
                  <option value="volumeVariation">Variation volume %</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className={labelCls}>Opérateur</label>
              <select value={op} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setOp(e.target.value)} className={inputCls}>
                <option value=">=">≥ supérieur ou égal</option>
                <option value="<=">≤ inférieur ou égal</option>
                <option value=">">{">"} strictement supérieur</option>
                <option value="<">{"<"} strictement inférieur</option>
                <option value="==">= égal à</option>
                <option value="!=">≠ différent de</option>
                <option value="in">dans la liste</option>
                <option value="not_in">hors de la liste</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Valeur <span className="text-red-400">*</span></label>
              <input value={value}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValue(e.target.value)}
                placeholder={op === "in" || op === "not_in" ? "KP,IR,RU" : "10000"}
                className={inputCls}
              />
            </div>
          </div>

          {(op === "in" || op === "not_in") && (
            <p className="text-[10px] font-mono text-[#484f58]">
              Pour "dans la liste" : séparer les valeurs par des virgules (ex: KP,IR,RU,SY)
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Seuil (pour affichage)</label>
              <input value={threshold} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setThreshold(e.target.value)}
                placeholder="10000.00" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fenêtre (minutes)</label>
              <input type="number" value={window} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setWindow(e.target.value)}
                placeholder="1440 (= 24h)" className={inputCls} />
            </div>
          </div>

          {mutation.error && (
            <p className="text-xs font-mono text-red-400">{mutation.error.message}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#21262d] flex gap-2 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md">
            Annuler
          </button>
          <button
            disabled={!name || !value || mutation.isPending}
            onClick={() => {
              const conditions = buildConditions();
              mutation.mutate({
                name,
                description:    desc || undefined,
                category:       category as "THRESHOLD" | "FREQUENCY" | "PATTERN" | "GEOGRAPHY" | "COUNTERPARTY" | "VELOCITY" | "CUSTOMER",
                status:         status as "ACTIVE" | "INACTIVE" | "TESTING",
                baseScore:      score,
                priority:       priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
                alertType:      alertType as "THRESHOLD" | "PATTERN" | "VELOCITY" | "SANCTIONS" | "FRAUD" | "PEP" | "NETWORK",
                conditions,
                thresholdValue: threshold || undefined,
                windowMinutes:  window ? parseInt(window) : undefined,
              });
            }}
            className="flex-1 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/30 rounded-md disabled:opacity-40"
          >
            {mutation.isPending ? "Création..." : "Créer la règle"}
          </button>
        </div>
      </div>
    </div>
  );
}
