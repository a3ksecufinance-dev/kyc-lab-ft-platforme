/**
 * Correspondent Banking Risk — FATF R.13
 *
 * Phase C — UI affinée :
 *   - Filtres (pays, niveau de risque, statut) + recherche
 *   - Panel latéral détaillé avec actions (suspend, terminate, notes)
 *   - Assessment modal amélioré avec feedback inline
 *   - Dialogs de confirmation pour actions destructives
 *   - Utilisation des composants UI existants (Badge, StatCard, ScoreBadge)
 */

import { useState, useCallback } from "react";
import type React from "react";
import { trpc } from "../lib/trpc";
import { AppLayout } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { ScoreBadge } from "../components/ui/ScoreBadge";
import { useI18n } from "../hooks/useI18n";
import {
  Building2, AlertTriangle, Plus, Shield,
  RefreshCw, Search, X, Eye, Snowflake, Ban, FileText, Check,
  Filter, Clock, Globe, Activity,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ACTIVE:       "Actif",
  UNDER_REVIEW: "En revue",
  SUSPENDED:    "Suspendu",
  TERMINATED:   "Terminé",
};

const FATF_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  compliant:  { label: "Conforme",     color: "text-emerald-400" },
  grey_list:  { label: "Liste grise",  color: "text-amber-400" },
  black_list: { label: "Liste noire",  color: "text-red-400" },
};

const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "UNACCEPTABLE"] as const;
const STATUSES = ["ACTIVE", "UNDER_REVIEW", "SUSPENDED", "TERMINATED"] as const;

// ─── Risk Bar ────────────────────────────────────────────────────────────────

function RiskBar({ score }: { score: number }): React.ReactElement {
  const color = score <= 25 ? "bg-emerald-500" : score <= 50 ? "bg-amber-500" : score <= 75 ? "bg-orange-500" : "bg-red-600";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs tabular-nums text-white/50 w-6 text-right">{score}</span>
    </div>
  );
}

// ─── Feedback Banner ─────────────────────────────────────────────────────────

function FeedbackBanner({ message, type, onClose }: {
  message: string; type: "success" | "error" | "info"; onClose: () => void;
}) {
  const bg = type === "success" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
           : type === "error"   ? "bg-red-500/10 border-red-500/30 text-red-400"
           : "bg-blue-500/10 border-blue-500/30 text-blue-400";
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm ${bg}`}>
      <span>{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel, isPending }: {
  title: string; message: string; confirmLabel: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void; isPending?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-[#0f1117] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-5 border-b border-white/8">
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-white/60">{message}</p>
        </div>
        <div className="p-5 border-t border-white/8 flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-white/50 hover:text-white">
            {t.common.cancel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {isPending ? "En cours..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Filter Bar ──────────────────────────────────────────────────────────────

function FilterBar({ filters, onChange }: {
  filters: { search: string; country: string; riskLevel: string; status: string };
  onChange: (f: typeof filters) => void;
}) {
  const { t } = useI18n();
  const hasFilters = filters.country || filters.riskLevel || filters.status || filters.search;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder={t.correspondent.searchPlaceholder}
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/25 focus:border-indigo-500/50 focus:outline-none"
        />
      </div>

      {/* Country */}
      <div className="relative">
        <Globe size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input
          type="text"
          placeholder="Pays (ISO)"
          value={filters.country}
          onChange={(e) => onChange({ ...filters, country: e.target.value.toUpperCase().slice(0, 3) })}
          className="w-24 pl-7 pr-2 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/25 uppercase font-mono focus:border-indigo-500/50 focus:outline-none"
          maxLength={3}
        />
      </div>

      {/* Risk Level */}
      <select
        value={filters.riskLevel}
        onChange={(e) => onChange({ ...filters, riskLevel: e.target.value })}
        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:border-indigo-500/50 focus:outline-none"
      >
        <option value="">Tous les risques</option>
        {RISK_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>

      {/* Status */}
      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:border-indigo-500/50 focus:outline-none"
      >
        <option value="">Tous les statuts</option>
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
      </select>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={() => onChange({ search: "", country: "", riskLevel: "", status: "" })}
          className="flex items-center gap-1 px-2.5 py-2 text-xs text-white/40 hover:text-white/70 border border-white/8 rounded-lg"
        >
          <Filter size={12} /> Effacer
        </button>
      )}
    </div>
  );
}

// ─── Assessment Modal (improved) ─────────────────────────────────────────────

function AssessmentModal({ bankId, bankName, onClose, onSuccess }: {
  bankId: number; bankName: string; onClose: () => void; onSuccess: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    amlFrameworkScore:    0,
    ownershipTranspScore: 0,
    supervisoryScore:     0,
    sanctionsRiskScore:   0,
    findings:             "",
    recommendation:       "approve" as "approve" | "conditional" | "reject",
  });
  const [error, setError] = useState("");

  const assess = trpc.correspondent.assess.useMutation({
    onSuccess: (data) => {
      if (data.requiresApproval) {
        onSuccess(`Demande d'approbation créee (ID: ${data.approvalId}). Un second valideur doit approuver.`);
      } else {
        onSuccess(`Evaluation soumise — score ${data.assessment?.riskScore}/100, niveau ${data.assessment?.riskLevel}`);
      }
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const total = form.amlFrameworkScore + form.ownershipTranspScore + form.supervisoryScore + form.sanctionsRiskScore;
  const riskLevel = total <= 25 ? "LOW" : total <= 50 ? "MEDIUM" : total <= 75 ? "HIGH" : "UNACCEPTABLE";

  const ScoreSlider = ({ field, label }: { field: keyof typeof form; label: string }) => (
    <div>
      <div className="flex justify-between mb-1.5">
        <label className="text-xs text-white/60">{label}</label>
        <span className="text-xs font-mono text-white/80">{form[field] as number}/25</span>
      </div>
      <input
        type="range" min={0} max={25}
        value={form[field] as number}
        onChange={(e) => setForm(prev => ({ ...prev, [field]: Number(e.target.value) }))}
        className="w-full accent-indigo-500 h-1.5"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-label="Evaluation FATF R.13" className="bg-[#0f1117] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="p-5 border-b border-white/8">
          <h2 className="font-semibold text-white">Evaluation FATF R.13</h2>
          <p className="text-xs text-white/40 mt-0.5">{bankName}</p>
        </div>
        <div className="p-5 space-y-4">
          <ScoreSlider field="amlFrameworkScore"    label="Dispositif AML du correspondant" />
          <ScoreSlider field="ownershipTranspScore" label="Transparence de l'actionnariat" />
          <ScoreSlider field="supervisoryScore"     label="Qualite de la supervision locale" />
          <ScoreSlider field="sanctionsRiskScore"   label="Exposition aux sanctions" />

          {/* Live score preview */}
          <div className="flex items-center gap-4 p-3 rounded-lg border border-white/8 bg-white/3">
            <ScoreBadge score={total} size="md" />
            <div>
              <div className="text-sm font-medium text-white">Score : {total}/100</div>
              <Badge label={riskLevel} variant="risk" />
            </div>
          </div>

          <textarea
            placeholder="Conclusions et observations (optionnel)..."
            value={form.findings}
            onChange={(e) => setForm(prev => ({ ...prev, findings: e.target.value }))}
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:border-indigo-500/50 focus:outline-none"
          />

          <div>
            <label className="text-xs text-white/60 block mb-1">Recommandation</label>
            <div className="grid grid-cols-3 gap-2">
              {(["approve", "conditional", "reject"] as const).map((r) => {
                const selected = form.recommendation === r;
                const colors = r === "approve" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                             : r === "conditional" ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                             : "border-red-500/50 bg-red-500/10 text-red-400";
                const labels = { approve: "Approuver", conditional: "Conditionnel", reject: "Rejeter" };
                return (
                  <button
                    key={r}
                    onClick={() => setForm(prev => ({ ...prev, recommendation: r }))}
                    className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                      selected ? colors : "border-white/10 bg-white/3 text-white/50 hover:border-white/20"
                    }`}
                  >
                    {labels[r]}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>
        <div className="p-5 border-t border-white/8 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/50 hover:text-white">{t.common.cancel}</button>
          <button
            onClick={() => assess.mutate({ bankId, ...form })}
            disabled={assess.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {assess.isPending ? "Soumission..." : "Soumettre l'evaluation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Modal ────────────────────────────────────────────────────────────

function CreateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (msg: string) => void }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", bic: "", country: "", jurisdiction: "", amlRegulator: "",
    fatfStatus: "" as "" | "compliant" | "grey_list" | "black_list",
    notes: "",
  });

  const create = trpc.correspondent.create.useMutation({
    onSuccess: (bank) => {
      utils.correspondent.list.invalidate();
      utils.correspondent.stats.invalidate();
      onSuccess(`Banque "${bank.name}" creee avec succes`);
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const fields = [
    { key: "name",         label: "Nom *",                    placeholder: "Banque XYZ" },
    { key: "bic",          label: "BIC / SWIFT",              placeholder: "BNPAFRPP" },
    { key: "country",      label: "Pays (ISO alpha-3) *",     placeholder: "FRA" },
    { key: "jurisdiction", label: "Juridiction",              placeholder: "Union europeenne" },
    { key: "amlRegulator", label: "Regulateur AML local",     placeholder: "ACPR" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-label="Nouvelle banque correspondante" className="bg-[#0f1117] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-5 border-b border-white/8">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Plus size={16} className="text-indigo-400" />
            Nouvelle banque correspondante
          </h2>
        </div>
        <div className="p-5 space-y-3">
          {fields.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-xs text-white/50 block mb-1">{label}</label>
              <input
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm(prev => ({ ...prev, [key]: key === "country" ? e.target.value.toUpperCase().slice(0, 3) : e.target.value }))}
                placeholder={placeholder}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:border-indigo-500/50 focus:outline-none"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-white/50 block mb-1">Statut FATF</label>
            <select
              value={form.fatfStatus}
              onChange={(e) => setForm(prev => ({ ...prev, fatfStatus: e.target.value as typeof form.fatfStatus }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500/50 focus:outline-none"
            >
              <option value="">Non renseigne</option>
              <option value="compliant">Conforme</option>
              <option value="grey_list">Liste grise</option>
              <option value="black_list">Liste noire</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Notes internes (optionnel)..."
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 resize-none focus:border-indigo-500/50 focus:outline-none"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>
        <div className="p-5 border-t border-white/8 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/50 hover:text-white">{t.common.cancel}</button>
          <button
            onClick={() => create.mutate({
              name:    form.name,
              country: form.country,
              ...(form.bic          && { bic:          form.bic }),
              ...(form.jurisdiction && { jurisdiction: form.jurisdiction }),
              ...(form.amlRegulator && { amlRegulator: form.amlRegulator }),
              ...(form.fatfStatus   && { fatfStatus:   form.fatfStatus }),
              ...(form.notes        && { notes:        form.notes }),
            })}
            disabled={create.isPending || !form.name || !form.country || form.country.length < 3}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {create.isPending ? "Creation..." : "Creer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel (slide-out) ────────────────────────────────────────────────

function DetailPanel({ bankId, onClose, onAction }: {
  bankId: number; onClose: () => void;
  onAction: (action: string, bankId: number) => void;
}) {
  const { t } = useI18n();
  const { data: bank, isLoading } = trpc.correspondent.get.useQuery({ id: bankId });
  const { data: assessments } = trpc.correspondent.getAssessments.useQuery({ id: bankId });

  if (isLoading || !bank) {
    return (
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-[#0a0b0f] border-l border-white/8 shadow-2xl">
        <div className="p-6 text-white/30 text-sm">{t.common.loading}</div>
      </div>
    );
  }

  const isOverdue = bank.nextReviewDate && new Date(bank.nextReviewDate) < new Date();
  const fatf = bank.fatfStatus ? FATF_STATUS_CONFIG[bank.fatfStatus] : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-[#0a0b0f] border-l border-white/8 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#0a0b0f]/95 backdrop-blur-md border-b border-white/8 p-5 flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-white">{bank.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              {bank.bic && <span className="text-xs font-mono text-white/40">{bank.bic}</span>}
              <Badge label={bank.status} variant="status" />
              <Badge label={bank.riskLevel} variant="risk" />
            </div>
          </div>
          <button onClick={onClose} aria-label={t.common.close} className="text-white/40 hover:text-white p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Score + Info */}
          <div className="flex items-center gap-5">
            <ScoreBadge score={bank.riskScore} size="lg" showLabel />
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-white/60">
                <Globe size={12} /> {bank.country}
                {bank.jurisdiction && <span className="text-white/30">/ {bank.jurisdiction}</span>}
              </div>
              {bank.amlRegulator && (
                <div className="flex items-center gap-2 text-white/60">
                  <Shield size={12} /> {bank.amlRegulator}
                </div>
              )}
              {fatf && (
                <div className={`flex items-center gap-2 text-xs ${fatf.color}`}>
                  <Activity size={12} /> FATF: {fatf.label}
                </div>
              )}
              <div className="flex items-center gap-2 text-white/60">
                <Clock size={12} />
                Prochaine revue :{" "}
                {bank.nextReviewDate ? (
                  <span className={isOverdue ? "text-red-400 font-medium" : ""}>
                    {isOverdue && <AlertTriangle size={10} className="inline mr-1" />}
                    {new Date(bank.nextReviewDate).toLocaleDateString("fr-FR")}
                  </span>
                ) : <span className="text-white/30">Non planifiee</span>}
              </div>
            </div>
          </div>

          {/* Notes */}
          {bank.notes && (
            <div className="bg-white/3 border border-white/8 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs text-white/40 mb-2">
                <FileText size={12} /> Notes internes
              </div>
              <p className="text-sm text-white/70 whitespace-pre-wrap">{bank.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onAction("assess", bank.id)}
              className="flex flex-col items-center gap-1.5 p-3 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 rounded-xl text-indigo-400 text-xs transition-colors"
            >
              <Shield size={16} /> Evaluer
            </button>
            {bank.status === "UNDER_REVIEW" && (
              <button
                onClick={() => onAction("approve", bank.id)}
                className="flex flex-col items-center gap-1.5 p-3 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs transition-colors"
              >
                <Check size={16} /> Approuver
              </button>
            )}
            {(bank.status === "ACTIVE" || bank.status === "UNDER_REVIEW") && (
              <button
                onClick={() => onAction("suspend", bank.id)}
                className="flex flex-col items-center gap-1.5 p-3 bg-orange-600/10 hover:bg-orange-600/20 border border-orange-500/20 rounded-xl text-orange-400 text-xs transition-colors"
              >
                <Snowflake size={16} /> Suspendre
              </button>
            )}
            {bank.status !== "TERMINATED" && (
              <button
                onClick={() => onAction("terminate", bank.id)}
                className="flex flex-col items-center gap-1.5 p-3 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 rounded-xl text-red-400 text-xs transition-colors"
              >
                <Ban size={16} /> Terminer
              </button>
            )}
          </div>

          {/* Assessments history */}
          <div>
            <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2">
              <FileText size={14} /> Historique des evaluations
              <span className="text-xs text-white/30">({assessments?.length ?? 0})</span>
            </h3>

            {!assessments || assessments.length === 0 ? (
              <div className="text-xs text-white/30 bg-white/3 rounded-xl p-4 text-center">
                {t.common.noData}
              </div>
            ) : (
              <div className="space-y-2">
                {assessments.map((a) => (
                  <div key={a.id} className="bg-white/3 border border-white/8 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <ScoreBadge score={a.riskScore} size="sm" />
                        <Badge label={a.riskLevel} variant="risk" />
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-white/40">
                          {new Date(a.createdAt).toLocaleDateString("fr-FR")}
                        </div>
                        {a.recommendation && (
                          <span className={`text-xs ${
                            a.recommendation === "approve" ? "text-emerald-400"
                            : a.recommendation === "conditional" ? "text-amber-400"
                            : "text-red-400"
                          }`}>
                            {a.recommendation === "approve" ? "Approuve" : a.recommendation === "conditional" ? "Conditionnel" : "Rejete"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score breakdown */}
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      {[
                        { label: "AML", score: a.amlFrameworkScore },
                        { label: "Actionnariat", score: a.ownershipTranspScore },
                        { label: "Supervision", score: a.supervisoryScore },
                        { label: "Sanctions", score: a.sanctionsRiskScore },
                      ].map(({ label, score }) => (
                        <div key={label} className="text-center">
                          <div className="text-white/30 mb-0.5">{label}</div>
                          <div className="font-mono text-white/70">{score}/25</div>
                          <div className="mt-1 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all"
                              style={{ width: `${(score / 25) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {a.findings && (
                      <div className="mt-3 text-xs text-white/50 italic border-t border-white/5 pt-2">
                        {a.findings}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Bank Row ────────────────────────────────────────────────────────────────

function BankRow({ bank, onSelect, onAssess }: {
  bank: {
    id: number; name: string; bic: string | null; country: string;
    riskScore: number; riskLevel: string; status: string;
    fatfStatus: string | null; nextReviewDate: string | null;
    jurisdiction: string | null;
  };
  onSelect: () => void;
  onAssess: () => void;
}) {
  const { t } = useI18n();
  const isOverdue = bank.nextReviewDate && new Date(bank.nextReviewDate) < new Date();
  const fatf = bank.fatfStatus ? FATF_STATUS_CONFIG[bank.fatfStatus] : null;

  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
      <td className="py-3 px-4">
        <button
          onClick={onSelect}
          className="text-left group"
        >
          <div className="font-medium text-sm text-white group-hover:text-indigo-400 transition-colors">{bank.name}</div>
          {bank.bic && <div className="text-xs text-white/30 font-mono">{bank.bic}</div>}
        </button>
      </td>
      <td className="py-3 px-4">
        <span className="text-xs text-white/60">{bank.country}</span>
        {bank.jurisdiction && <span className="text-xs text-white/30 ml-1">/ {bank.jurisdiction}</span>}
      </td>
      <td className="py-3 px-4">
        {fatf ? (
          <span className={`text-xs font-mono ${fatf.color}`}>{fatf.label}</span>
        ) : <span className="text-xs text-white/20">--</span>}
      </td>
      <td className="py-3 px-4 min-w-[120px]"><RiskBar score={bank.riskScore} /></td>
      <td className="py-3 px-4"><Badge label={bank.riskLevel} variant="risk" /></td>
      <td className="py-3 px-4"><Badge label={bank.status} variant="status" /></td>
      <td className="py-3 px-4 text-xs text-white/50">
        {bank.nextReviewDate ? (
          <span className={isOverdue ? "text-red-400 font-medium" : ""}>
            {isOverdue && <AlertTriangle size={10} className="inline mr-1" />}
            {new Date(bank.nextReviewDate).toLocaleDateString("fr-FR")}
          </span>
        ) : <span className="text-white/20">--</span>}
      </td>
      <td className="py-3 px-4">
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onSelect}
            title="Voir les details"
            aria-label={t.common.details}
            className="p-1.5 text-white/30 hover:text-white/70 hover:bg-white/5 rounded transition-colors"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={onAssess}
            title="Evaluer"
            aria-label={t.common.validate}
            className="p-1.5 text-indigo-400/60 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
          >
            <Shield size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function CorrespondentPage() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: "", country: "", riskLevel: "", status: "" });
  const [assessBankId, setAssessBankId] = useState<number | null>(null);
  const [assessBankName, setAssessBankName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailBankId, setDetailBankId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; bankId: number } | null>(null);

  const utils = trpc.useUtils();

  // Build query input
  const queryInput = {
    page,
    limit: 20,
    ...(filters.country.length === 3 && { country: filters.country }),
    ...(filters.riskLevel && { riskLevel: filters.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "UNACCEPTABLE" }),
    ...(filters.status && { status: filters.status as "ACTIVE" | "UNDER_REVIEW" | "SUSPENDED" | "TERMINATED" }),
  };

  const { data, isLoading, refetch } = trpc.correspondent.list.useQuery(queryInput);
  const { data: stats } = trpc.correspondent.stats.useQuery();

  const approve = trpc.correspondent.approve.useMutation({
    onSuccess: () => {
      utils.correspondent.list.invalidate();
      utils.correspondent.stats.invalidate();
      setFeedback({ message: "Banque approuvee avec succes", type: "success" });
      setDetailBankId(null);
    },
    onError: (err) => setFeedback({ message: err.message, type: "error" }),
  });

  const suspend = trpc.correspondent.suspend.useMutation({
    onSuccess: () => {
      utils.correspondent.list.invalidate();
      utils.correspondent.stats.invalidate();
      setFeedback({ message: "Banque suspendue", type: "info" });
      setDetailBankId(null);
    },
    onError: (err) => setFeedback({ message: err.message, type: "error" }),
  });

  const terminate = trpc.correspondent.terminate.useMutation({
    onSuccess: () => {
      utils.correspondent.list.invalidate();
      utils.correspondent.stats.invalidate();
      setFeedback({ message: "Relation terminee", type: "info" });
      setDetailBankId(null);
    },
    onError: (err) => setFeedback({ message: err.message, type: "error" }),
  });

  // Filter by name client-side (backend doesn't support search)
  const allBanks = data?.items ?? [];
  const banks = filters.search
    ? allBanks.filter((b) =>
        b.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        (b.bic ?? "").toLowerCase().includes(filters.search.toLowerCase())
      )
    : allBanks;
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / 20);

  const handleAction = useCallback((action: string, bankId: number) => {
    if (action === "assess") {
      const bank = allBanks.find((b) => b.id === bankId);
      setAssessBankName(bank?.name ?? "");
      setAssessBankId(bankId);
    } else if (action === "approve") {
      setConfirmAction({ action: "approve", bankId });
    } else if (action === "suspend") {
      setConfirmAction({ action: "suspend", bankId });
    } else if (action === "terminate") {
      setConfirmAction({ action: "terminate", bankId });
    }
  }, [allBanks]);

  const executeConfirmedAction = useCallback(() => {
    if (!confirmAction) return;
    const { action, bankId } = confirmAction;
    if (action === "approve") approve.mutate({ id: bankId });
    else if (action === "suspend") suspend.mutate({ id: bankId });
    else if (action === "terminate") terminate.mutate({ id: bankId });
    setConfirmAction(null);
  }, [confirmAction, approve, suspend, terminate]);

  const confirmConfig: Record<string, { title: string; message: string; label: string; danger: boolean }> = {
    approve:   { title: "Approuver la banque", message: "Cette action approuve la relation de correspondance et l'active. L'approbation sera tracee dans l'audit trail.", label: "Approuver", danger: false },
    suspend:   { title: "Suspendre la banque", message: "La banque sera suspendue. Toutes les operations de correspondance seront bloquees jusqu'a reactivation.", label: "Suspendre", danger: true },
    terminate: { title: "Terminer la relation", message: "Cette action est definitive. La relation de correspondance sera terminee et ne pourra pas etre reactivee.", label: "Terminer la relation", danger: true },
  };

  return (
    <AppLayout>
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Building2 size={20} className="text-indigo-400" />
            Banques Correspondantes
          </h1>
          <p className="text-sm text-white/40 mt-0.5">
            FATF R.13 — Evaluation et supervision des relations de correspondance bancaire
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 text-white/40 hover:text-white/70 border border-white/8 rounded-lg transition-colors"
            title="Rafraichir"
            aria-label={t.common.refresh}
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
          >
            <Plus size={14} /> Nouvelle banque
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <FeedbackBanner
          message={feedback.message}
          type={feedback.type}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} icon={Building2} />
          <StatCard label="Actives" value={stats.active} icon={Check} accent="success" />
          <StatCard label="En revue" value={stats.underReview} icon={Clock} accent="warning" />
          <StatCard label="Haut risque" value={stats.highRisk} icon={AlertTriangle} accent="danger" />
          <StatCard
            label="Revue echue" value={stats.overdueReview}
            icon={RefreshCw}
            accent={stats.overdueReview > 0 ? "danger" : "default"}
            {...(stats.overdueReview > 0 && { sub: "Action requise" })}
          />
        </div>
      )}

      {/* FATF R.13 reminder */}
      <div className="flex items-start gap-3 bg-indigo-500/8 border border-indigo-500/20 rounded-xl p-4">
        <Shield size={16} className="text-indigo-400 mt-0.5 shrink-0" />
        <div className="text-xs text-white/60 leading-relaxed">
          <span className="text-indigo-400 font-medium">FATF R.13</span> — Toute nouvelle relation de
          correspondance doit faire l'objet d'une evaluation prealable (4 criteres, 0-100) et d'une
          approbation de la direction generale. Revue periodique obligatoire (annuelle ou semestrielle
          selon le niveau de risque).
        </div>
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onChange={(f) => { setFilters(f); setPage(1); }} />

      {/* Table */}
      <div className="bg-white/[0.02] border border-white/8 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs text-white/40">
                <th className="py-3 px-4 font-medium">Banque</th>
                <th className="py-3 px-4 font-medium">Pays / Juridiction</th>
                <th className="py-3 px-4 font-medium">FATF</th>
                <th className="py-3 px-4 font-medium min-w-[130px]">Score risque</th>
                <th className="py-3 px-4 font-medium">Niveau</th>
                <th className="py-3 px-4 font-medium">Statut</th>
                <th className="py-3 px-4 font-medium">Prochaine revue</th>
                <th className="py-3 px-4 font-medium w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-10 text-white/30 text-sm">{t.common.loading}</td></tr>
              ) : banks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10">
                    <Building2 size={28} className="mx-auto text-white/15 mb-2" />
                    <div className="text-sm text-white/30">
                      {filters.search || filters.country || filters.riskLevel || filters.status
                        ? "{t.common.noResults}"
                        : "{t.correspondent.noBanks}"
                      }
                    </div>
                    {!filters.search && !filters.country && !filters.riskLevel && !filters.status && (
                      <div className="text-xs text-white/20 mt-1">
                        Ajoutez votre premiere banque correspondante pour commencer l'evaluation FATF R.13
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                banks.map((bank) => (
                  <BankRow
                    key={bank.id}
                    bank={{
                      ...bank,
                      nextReviewDate: bank.nextReviewDate ? bank.nextReviewDate.toString() : null,
                    }}
                    onSelect={() => setDetailBankId(bank.id)}
                    onAssess={() => {
                      setAssessBankName(bank.name);
                      setAssessBankId(bank.id);
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/8">
            <span className="text-xs text-white/40">{total} banque{total > 1 ? "s" : ""}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs rounded border border-white/10 text-white/50 hover:text-white disabled:opacity-30"
              >Prec.</button>
              <span className="px-2 py-1 text-xs text-white/40">{page}/{pageCount}</span>
              <button
                onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
                className="px-2 py-1 text-xs rounded border border-white/10 text-white/50 hover:text-white disabled:opacity-30"
              >Suiv.</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {detailBankId !== null && (
        <DetailPanel
          bankId={detailBankId}
          onClose={() => setDetailBankId(null)}
          onAction={handleAction}
        />
      )}

      {/* Assessment Modal */}
      {assessBankId !== null && (
        <AssessmentModal
          bankId={assessBankId}
          bankName={assessBankName}
          onClose={() => setAssessBankId(null)}
          onSuccess={(msg) => setFeedback({ message: msg, type: "success" })}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => setFeedback({ message: msg, type: "success" })}
        />
      )}

      {/* Confirm Dialog */}
      {confirmAction && confirmConfig[confirmAction.action] && (
        <ConfirmDialog
          title={confirmConfig[confirmAction.action]!.title}
          message={confirmConfig[confirmAction.action]!.message}
          confirmLabel={confirmConfig[confirmAction.action]!.label}
          danger={confirmConfig[confirmAction.action]!.danger}
          onConfirm={executeConfirmedAction}
          onCancel={() => setConfirmAction(null)}
          isPending={approve.isPending || suspend.isPending || terminate.isPending}
        />
      )}
    </div>
    </AppLayout>
  );
}
