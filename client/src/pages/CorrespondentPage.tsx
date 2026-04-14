/**
 * Correspondent Banking Risk — FATF R.13
 * Gestion des banques correspondantes, évaluations de risque, revue annuelle.
 */

import { useState } from "react";
import type React from "react";
import { trpc } from "../lib/trpc";
import { AppLayout } from "../components/layout/AppLayout";
import {
  Building2, AlertTriangle,
  ChevronDown, ChevronUp, Plus, Shield, RefreshCw,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  LOW:          "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  MEDIUM:       "bg-amber-500/15 text-amber-400 border-amber-500/30",
  HIGH:         "bg-orange-500/15 text-orange-400 border-orange-500/30",
  UNACCEPTABLE: "bg-red-500/15 text-red-400 border-red-500/30",
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:       "bg-emerald-500/15 text-emerald-400",
  UNDER_REVIEW: "bg-amber-500/15 text-amber-400",
  SUSPENDED:    "bg-orange-500/15 text-orange-400",
  TERMINATED:   "bg-red-500/15 text-red-400",
};

const FATF_STATUS_COLOR: Record<string, string> = {
  compliant:  "text-emerald-400",
  grey_list:  "text-amber-400",
  black_list: "text-red-400",
};

function riskBar(score: number): React.ReactElement {
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

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value, sub, color }: {
  label: string; value: number | string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white/4 border border-white/8 rounded-xl px-5 py-4">
      <div className={`text-2xl font-bold ${color ?? "text-white"}`}>{value}</div>
      <div className="text-xs text-white/50 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-white/30 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Assessment Modal ─────────────────────────────────────────────────────────

function AssessmentModal({ bankId, onClose }: { bankId: number; onClose: () => void }) {
  const [form, setForm] = useState({
    amlFrameworkScore:    0,
    ownershipTranspScore: 0,
    supervisoryScore:     0,
    sanctionsRiskScore:   0,
    findings:             "",
    recommendation:       "approve" as "approve" | "conditional" | "reject",
  });

  const assess = trpc.correspondent.assess.useMutation({
    onSuccess: (data) => {
      if (data.requiresApproval) {
        alert(`Demande d'approbation créée (ID: ${data.approvalId}). Un second valideur doit approuver.`);
      }
      onClose();
    },
  });

  const total = form.amlFrameworkScore + form.ownershipTranspScore + form.supervisoryScore + form.sanctionsRiskScore;
  const riskLevel = total <= 25 ? "LOW" : total <= 50 ? "MEDIUM" : total <= 75 ? "HIGH" : "UNACCEPTABLE";

  const ScoreSlider = ({ field, label }: { field: keyof typeof form; label: string }) => (
    <div>
      <div className="flex justify-between mb-1">
        <label className="text-xs text-white/60">{label}</label>
        <span className="text-xs font-mono text-white/80">{form[field] as number}/25</span>
      </div>
      <input
        type="range" min={0} max={25}
        value={form[field] as number}
        onChange={(e) => setForm(prev => ({ ...prev, [field]: Number(e.target.value) }))}
        className="w-full accent-indigo-500"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1117] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="p-5 border-b border-white/8 flex justify-between items-center">
          <h2 className="font-semibold text-white">Évaluation FATF R.13</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <ScoreSlider field="amlFrameworkScore"    label="Dispositif AML du correspondant" />
          <ScoreSlider field="ownershipTranspScore" label="Transparence de l'actionnariat" />
          <ScoreSlider field="supervisoryScore"     label="Qualité de la supervision locale" />
          <ScoreSlider field="sanctionsRiskScore"   label="Exposition aux sanctions" />

          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${RISK_COLOR[riskLevel]}`}>
            <Shield size={14} />
            <span>Score total : <strong>{total}/100</strong> → Risque <strong>{riskLevel}</strong></span>
          </div>

          <textarea
            placeholder="Conclusions et observations (optionnel)…"
            value={form.findings}
            onChange={(e) => setForm(prev => ({ ...prev, findings: e.target.value }))}
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none"
          />

          <div>
            <label className="text-xs text-white/60 block mb-1">Recommandation</label>
            <select
              value={form.recommendation}
              onChange={(e) => setForm(prev => ({ ...prev, recommendation: e.target.value as typeof form.recommendation }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="approve">Approuver</option>
              <option value="conditional">Approuver avec conditions</option>
              <option value="reject">Rejeter</option>
            </select>
          </div>
        </div>
        <div className="p-5 border-t border-white/8 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/50 hover:text-white">Annuler</button>
          <button
            onClick={() => assess.mutate({ bankId, ...form })}
            disabled={assess.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {assess.isPending ? "Soumission…" : "Soumettre l'évaluation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bank Row ─────────────────────────────────────────────────────────────────

function BankRow({ bank, onAssess, onApprove }: {
  bank: {
    id: number; name: string; bic: string | null; country: string;
    riskScore: number; riskLevel: string; status: string;
    fatfStatus: string | null; nextReviewDate: string | null;
    jurisdiction: string | null;
  };
  onAssess: () => void;
  onApprove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: assessments } = trpc.correspondent.getAssessments.useQuery(
    { id: bank.id }, { enabled: open }
  );

  const isOverdue = bank.nextReviewDate && new Date(bank.nextReviewDate) < new Date();

  return (
    <>
      <tr
        className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors"
        onClick={() => setOpen(!open)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {open ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
            <div>
              <div className="font-medium text-sm text-white">{bank.name}</div>
              {bank.bic && <div className="text-xs text-white/40 font-mono">{bank.bic}</div>}
            </div>
          </div>
        </td>
        <td className="py-3 px-4 text-xs text-white/60">{bank.country}{bank.jurisdiction ? ` / ${bank.jurisdiction}` : ""}</td>
        <td className="py-3 px-4">
          {bank.fatfStatus && (
            <span className={`text-xs font-mono ${FATF_STATUS_COLOR[bank.fatfStatus] ?? "text-white/50"}`}>
              {bank.fatfStatus}
            </span>
          )}
        </td>
        <td className="py-3 px-4 min-w-[120px]">{riskBar(bank.riskScore)}</td>
        <td className="py-3 px-4">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${RISK_COLOR[bank.riskLevel]}`}>
            {bank.riskLevel}
          </span>
        </td>
        <td className="py-3 px-4">
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[bank.status]}`}>
            {bank.status}
          </span>
        </td>
        <td className="py-3 px-4 text-xs text-white/50">
          {bank.nextReviewDate ? (
            <span className={isOverdue ? "text-red-400 font-medium" : ""}>
              {isOverdue && <AlertTriangle size={10} className="inline mr-1" />}
              {new Date(bank.nextReviewDate).toLocaleDateString("fr-FR")}
            </span>
          ) : "—"}
        </td>
        <td className="py-3 px-4">
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onAssess}
              className="text-xs px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded"
            >Évaluer</button>
            {bank.status === "UNDER_REVIEW" && (
              <button
                onClick={onApprove}
                className="text-xs px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded"
              >Approuver</button>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-white/2">
          <td colSpan={8} className="px-8 py-4">
            {!assessments ? (
              <span className="text-xs text-white/30">Chargement…</span>
            ) : assessments.length === 0 ? (
              <span className="text-xs text-white/30">Aucune évaluation enregistrée</span>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-white/50 font-medium mb-2">Historique des évaluations</div>
                {assessments.map((a) => (
                  <div key={a.id} className="bg-white/4 border border-white/8 rounded-lg p-3 grid grid-cols-5 gap-3 text-xs">
                    <div>
                      <div className="text-white/40 mb-0.5">AML Framework</div>
                      <div className="font-mono">{a.amlFrameworkScore}/25</div>
                    </div>
                    <div>
                      <div className="text-white/40 mb-0.5">Actionnariat</div>
                      <div className="font-mono">{a.ownershipTranspScore}/25</div>
                    </div>
                    <div>
                      <div className="text-white/40 mb-0.5">Supervision</div>
                      <div className="font-mono">{a.supervisoryScore}/25</div>
                    </div>
                    <div>
                      <div className="text-white/40 mb-0.5">Sanctions</div>
                      <div className="font-mono">{a.sanctionsRiskScore}/25</div>
                    </div>
                    <div>
                      <div className={`font-medium ${RISK_COLOR[a.riskLevel]?.split(" ")[1]}`}>{a.riskLevel}</div>
                      <div className="text-white/30">{new Date(a.createdAt).toLocaleDateString("fr-FR")}</div>
                    </div>
                    {a.findings && (
                      <div className="col-span-5 text-white/50 italic">{a.findings}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: "", bic: "", country: "", jurisdiction: "", amlRegulator: "",
    fatfStatus: "" as "" | "compliant" | "grey_list" | "black_list",
    notes: "",
  });

  const create = trpc.correspondent.create.useMutation({
    onSuccess: () => { utils.correspondent.list.invalidate(); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1117] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-5 border-b border-white/8 flex justify-between items-center">
          <h2 className="font-semibold text-white">Nouvelle banque correspondante</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          {[
            { key: "name",         label: "Nom *",                     required: true },
            { key: "bic",          label: "BIC / SWIFT",               required: false },
            { key: "country",      label: "Pays (ISO 3166 alpha-3) *",  required: true },
            { key: "jurisdiction", label: "Juridiction",                required: false },
            { key: "amlRegulator", label: "Régulateur AML local",       required: false },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs text-white/50 block mb-1">{label}</label>
              <input
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-white/50 block mb-1">Statut FATF</label>
            <select
              value={form.fatfStatus}
              onChange={(e) => setForm(prev => ({ ...prev, fatfStatus: e.target.value as typeof form.fatfStatus }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Non renseigné</option>
              <option value="compliant">Conforme</option>
              <option value="grey_list">Liste grise</option>
              <option value="black_list">Liste noire</option>
            </select>
          </div>
        </div>
        <div className="p-5 border-t border-white/8 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/50 hover:text-white">Annuler</button>
          <button
            onClick={() => create.mutate({
              name:    form.name,
              country: form.country,
              ...(form.bic          && { bic:          form.bic }),
              ...(form.jurisdiction && { jurisdiction: form.jurisdiction }),
              ...(form.amlRegulator && { amlRegulator: form.amlRegulator }),
              ...(form.fatfStatus   && { fatfStatus:   form.fatfStatus }),
            })}
            disabled={create.isPending || !form.name || !form.country}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {create.isPending ? "Création…" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CorrespondentPage() {
  const [page, setPage] = useState(1);
  const [assessBankId, setAssessBankId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.correspondent.list.useQuery({
    page, limit: 20,
  });
  const { data: stats } = trpc.correspondent.stats.useQuery();

  const approve = trpc.correspondent.approve.useMutation({
    onSuccess: () => utils.correspondent.list.invalidate(),
  });

  const banks = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / 20);

  return (
    <AppLayout>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Building2 size={20} className="text-indigo-400" />
            Banques Correspondantes
          </h1>
          <p className="text-sm text-white/40 mt-0.5">
            FATF R.13 — Évaluation et supervision des relations de correspondance bancaire
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 text-white/40 hover:text-white/70 border border-white/8 rounded-lg"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg"
          >
            <Plus size={14} /> Nouvelle banque
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatPill label="Total" value={stats.total} />
          <StatPill label="Actives" value={stats.active} color="text-emerald-400" />
          <StatPill label="En revue" value={stats.underReview} color="text-amber-400" />
          <StatPill label="Haut risque" value={stats.highRisk} color="text-orange-400" />
          <StatPill
            label="Revue échue" value={stats.overdueReview}
            color={stats.overdueReview > 0 ? "text-red-400" : "text-white"}
          />
        </div>
      )}

      {/* FATF R.13 reminder */}
      <div className="flex items-start gap-3 bg-indigo-500/8 border border-indigo-500/20 rounded-xl p-4">
        <Shield size={16} className="text-indigo-400 mt-0.5 shrink-0" />
        <div className="text-xs text-white/60 leading-relaxed">
          <span className="text-indigo-400 font-medium">FATF R.13</span> — Toute nouvelle relation de
          correspondance doit faire l'objet d'une évaluation préalable (4 critères, 0-100) et d'une
          approbation de la direction générale. Revue périodique obligatoire (annuelle ou semestrielle
          selon le niveau de risque).
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
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
                <th className="py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-10 text-white/30 text-sm">Chargement…</td></tr>
              ) : banks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10">
                    <Building2 size={28} className="mx-auto text-white/15 mb-2" />
                    <div className="text-sm text-white/30">Aucune banque correspondante enregistrée</div>
                    <div className="text-xs text-white/20 mt-1">Ajoutez votre première banque correspondante pour commencer l'évaluation FATF R.13</div>
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
                    onAssess={() => setAssessBankId(bank.id)}
                    onApprove={() => approve.mutate({ id: bank.id })}
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
              >Préc.</button>
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

      {/* Modals */}
      {assessBankId !== null && (
        <AssessmentModal bankId={assessBankId} onClose={() => setAssessBankId(null)} />
      )}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
    </div>
    </AppLayout>
  );
}
