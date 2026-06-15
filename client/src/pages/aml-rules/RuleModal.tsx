import { useState } from "react";
import type React from "react";
import { Shield, Play, Copy, GitBranch, Zap, Code, FlaskConical } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { useI18n } from "../../hooks/useI18n";
import {
  C, TEMPLATES, CATEGORY_LABELS, CATEGORY_STYLE,
  inputCls, labelCls, btnBlue, btnGhost,
  type Condition,
} from "./types";
import { conditionToJson } from "./utils";
import { ConditionBuilder } from "./ConditionBuilder";
import { RuleSimulator } from "./RuleSimulator";

export function RuleModal({
  onClose, initial, editId,
}: {
  onClose: () => void;
  editId?: number;
  initial?: Partial<{
    name: string; description: string; category: string; status: string;
    score: number; priority: string; alertType: string;
    conditions: Condition; threshold: string; window: string;
  }>;
}) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const isEdit = editId !== undefined;
  const [tab, setTab] = useState<"builder" | "simulate" | "json" | "templates" | "backtest">(isEdit ? "builder" : "builder");

  const [name,      setName]     = useState(initial?.name      ?? "");
  const [desc,      setDesc]     = useState(initial?.description ?? "");
  const [category,  setCategory] = useState(initial?.category  ?? "THRESHOLD");
  const [status,    setStatus]   = useState(initial?.status    ?? "ACTIVE");
  const [score,     setScore]    = useState(initial?.score      ?? 50);
  const [priority,  setPriority] = useState(initial?.priority  ?? "MEDIUM");
  const [alertType, setAlertType]= useState(initial?.alertType ?? "THRESHOLD");
  const [threshold, setThreshold]= useState(initial?.threshold ?? "");
  const [window_,   setWindow]   = useState(initial?.window    ?? "");
  const [cond, setCond] = useState<Condition>(
    initial?.conditions ?? { type: "simple", field: "amount", op: ">=", value: "" }
  );

  const jsonPreview = JSON.stringify(conditionToJson(cond), null, 2);

  const createMut = trpc.amlRules.create.useMutation({
    onSuccess: () => { utils.amlRules.list.invalidate(); onClose(); },
  });
  const updateMut = trpc.amlRules.update.useMutation({
    onSuccess: () => { utils.amlRules.list.invalidate(); onClose(); },
  });
  const mutation = isEdit ? updateMut : createMut;
  const [backtestDays, setBacktestDays] = useState(90);
  const [backtestMaxTx, setBacktestMaxTx] = useState(2000);
  const backtestMut = trpc.amlRules.backtest.useMutation();

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setCond(t.conditions);
    setCategory(t.category);
    setPriority(t.priority);
    setScore(t.score);
    setAlertType(t.alertType);
    setDesc(t.desc);
    if (!name) setName(t.label);
    setTab("builder");
  };

  const isValid = name.trim().length >= 3 && (
    cond.type === "simple" ? cond.value.trim() !== "" : true
  );

  const TABS = [
    ...(isEdit ? [] : [{ id: "templates", label: "Templates", icon: <Zap size={11} /> }]),
    { id: "builder",   label: "Builder",    icon: <GitBranch size={11} /> },
    { id: "simulate",  label: "Simulateur", icon: <Play size={11} /> },
    { id: "json",      label: "JSON",       icon: <Code size={11} /> },
    ...(isEdit ? [{ id: "backtest", label: "Backtest", icon: <FlaskConical size={11} /> }] : []),
  ] as { id: "templates" | "builder" | "simulate" | "json" | "backtest"; label: string; icon: React.ReactNode }[];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--wr-border)] flex-shrink-0">
          <h3 className="text-sm font-semibold text-[var(--wr-text-1)] font-mono flex items-center gap-2">
            <Shield size={14} className="text-[var(--wr-blue)]" /> {isEdit ? "Modifier la règle" : "Nouvelle règle AML"}
          </h3>
          <p className="text-[10px] font-mono text-[var(--wr-text-4)] mt-0.5">
            {isEdit ? "Modifications appliquées immédiatement" : "Active immédiatement — aucun redéploiement requis"}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--wr-border)] flex-shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-mono border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[var(--wr-blue)] text-[var(--wr-blue)]"
                  : "border-transparent text-[var(--wr-text-3)] hover:text-[var(--wr-text-1)]"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">

          {/* Métadonnées (toujours visible) */}
          {tab !== "templates" && (
            <div className="space-y-3 mb-5 pb-4 border-b border-[var(--wr-border)]">
              <div>
                <label className={labelCls}>Nom <span className="text-red-400">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ex: Seuil TRACFIN 10 000 MAD" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Description réglementaire</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
                  placeholder="Référence BAM, FATF, AMLD6..." className={`${inputCls} resize-none`} />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Catégorie", val: category, set: setCategory, opts: Object.entries(CATEGORY_LABELS).map(([v,l]) => ({v,l})) },
                  { label: "Statut", val: status, set: setStatus, opts: [{v:"ACTIVE",l:"Actif"},{v:"TESTING",l:"Test A/B"},{v:"INACTIVE",l:"Inactif"}] },
                  { label: "Priorité", val: priority, set: setPriority, opts: [{v:"LOW",l:"Faible"},{v:"MEDIUM",l:"Moyenne"},{v:"HIGH",l:"Haute"},{v:"CRITICAL",l:"Critique"}] },
                  { label: "Type alerte", val: alertType, set: setAlertType, opts: [{v:"THRESHOLD",l:"Seuil"},{v:"PATTERN",l:"Pattern"},{v:"VELOCITY",l:"Vélocité"},{v:"SANCTIONS",l:"Sanctions"},{v:"PEP",l:"PEP"},{v:"FRAUD",l:"Fraude"}] },
                ].map(({label, val, set, opts}) => (
                  <div key={label}>
                    <label className={labelCls}>{label}</label>
                    <select value={val} onChange={e => set(e.target.value)} className={inputCls}>
                      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>Score risque (0-100)</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={100} value={score}
                      onChange={e => setScore(Number(e.target.value))}
                      className="flex-1 accent-[var(--wr-blue)]" />
                    <span className="text-xs font-mono text-[var(--wr-blue)] w-8 text-right">{score}</span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Seuil (pour stats)</label>
                  <input value={threshold} onChange={e => setThreshold(e.target.value)}
                    placeholder="10000.00" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Fenêtre (minutes)</label>
                  <input type="number" value={window_} onChange={e => setWindow(e.target.value)}
                    placeholder="1440 = 24h" className={inputCls} />
                </div>
              </div>
            </div>
          )}

          {/* Tab: Templates */}
          {tab === "templates" && (
            <div className="space-y-2">
              <p className="text-[10px] font-mono text-[var(--wr-text-3)] mb-3">
                Règles pré-configurées BAM Maroc / FATF / MENA — cliquer pour appliquer
              </p>
              {TEMPLATES.map((t, i) => (
                <button key={i} onClick={() => applyTemplate(t)}
                  className="w-full text-left p-3 bg-[var(--wr-card)] border border-[var(--wr-border2)] rounded-lg hover:border-[var(--wr-blue)]/40 hover:bg-[var(--wr-hover)] transition-all group">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-semibold text-[var(--wr-text-1)] group-hover:text-[var(--wr-blue)] transition-colors">
                        {t.label}
                      </p>
                      <p className="text-[10px] font-mono text-[var(--wr-text-3)] mt-0.5 truncate">{t.desc}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <span style={{ fontSize: 9, fontFamily: C.mono, padding: "2px 6px", borderRadius: 4, ...(CATEGORY_STYLE[t.category] ?? {}) }}>
                        {CATEGORY_LABELS[t.category]}
                      </span>
                      <span style={{ fontSize: 9, fontFamily: C.mono, padding: "2px 6px", borderRadius: 4,
                        color:      t.priority === "CRITICAL" ? C.red : t.priority === "HIGH" ? C.amber : C.blue,
                        background: t.priority === "CRITICAL" ? "rgba(255,101,112,0.09)" : t.priority === "HIGH" ? "rgba(245,158,11,0.09)" : "rgba(74,158,255,0.09)",
                        border:     `1px solid ${t.priority === "CRITICAL" ? "rgba(255,101,112,0.22)" : t.priority === "HIGH" ? "rgba(245,158,11,0.22)" : "rgba(74,158,255,0.22)"}`,
                      }}>{t.priority}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Tab: Builder */}
          {tab === "builder" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-widest">
                  Conditions de déclenchement
                </p>
                {cond.type === "simple" && (
                  <button
                    onClick={() => setCond({ type: "compound", logic: "AND", rules: [cond] })}
                    className={`${btnGhost} flex items-center gap-1`}
                  >
                    <GitBranch size={10} /> Ajouter groupe AND/OR
                  </button>
                )}
              </div>
              <div className="bg-[var(--wr-card)] border border-[var(--wr-border)] rounded-lg p-4">
                <ConditionBuilder cond={cond} onChange={setCond} />
              </div>
              <p className="text-[9px] font-mono text-[var(--wr-text-4)]">
                Champs agrégés (recentTxCount, recentTxVolume, volumeVariation) utilisent les données des 24h précédentes.
              </p>
            </div>
          )}

          {/* Tab: Simulateur */}
          {tab === "simulate" && (
            <RuleSimulator cond={cond} />
          )}

          {/* Tab: JSON */}
          {tab === "json" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-widest">
                  Aperçu JSON envoyé à l'API
                </p>
                <button
                  onClick={() => navigator.clipboard.writeText(jsonPreview)}
                  className={`${btnGhost} flex items-center gap-1`}
                >
                  <Copy size={10} /> Copier
                </button>
              </div>
              <pre className="bg-[var(--wr-card)] border border-[var(--wr-border)] rounded-lg p-4 text-[11px] font-mono text-[var(--wr-blue)] overflow-x-auto whitespace-pre-wrap">
                {jsonPreview}
              </pre>
            </div>
          )}

          {/* Tab: Backtest (edit only) */}
          {tab === "backtest" && isEdit && (
            <div className="space-y-4">
              <p className="text-[10px] font-mono text-[var(--wr-text-3)]">
                Simule la règle sur les transactions historiques sans créer d'alertes réelles.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Période (jours)</label>
                  <input type="number" min={7} max={180} value={backtestDays}
                    onChange={e => setBacktestDays(Number(e.target.value))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Max transactions</label>
                  <input type="number" min={100} max={10000} value={backtestMaxTx}
                    onChange={e => setBacktestMaxTx(Number(e.target.value))}
                    className={inputCls} />
                </div>
              </div>
              <button
                disabled={backtestMut.isPending}
                onClick={() => backtestMut.mutate({ ruleId: editId!, daysPeriod: backtestDays, maxTx: backtestMaxTx, compareWithActive: true })}
                className={`${btnBlue} flex items-center gap-1.5 disabled:opacity-40`}
              >
                <Play size={11} /> {backtestMut.isPending ? "Simulation en cours..." : "Lancer le backtest"}
              </button>

              {backtestMut.isError && (
                <p style={{ fontSize: 12, fontFamily: C.mono, color: C.red }}>{backtestMut.error.message}</p>
              )}

              {backtestMut.data && (() => {
                const r = backtestMut.data;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Transactions analysées", val: r.corpus.analyzed },
                        { label: "Déclenchements",         val: r.simulation.triggered },
                        { label: "Taux déclench.",         val: `${r.simulation.triggerRate}%` },
                        { label: "Score moyen",            val: r.simulation.avgScore },
                        { label: "Durée (ms)",             val: r.durationMs },
                        { label: "Période",                val: `${r.period.days}j` },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-[var(--wr-card)] border border-[var(--wr-border)] rounded p-2">
                          <div className="text-xs font-mono font-bold text-[var(--wr-text-1)]">{String(val)}</div>
                          <div className="text-[9px] font-mono text-[var(--wr-text-4)] mt-0.5">{label}</div>
                        </div>
                      ))}
                    </div>
                    {r.comparison && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                        <p className="text-[9px] font-mono text-amber-400 uppercase tracking-widest mb-2">Comparaison avec alertes existantes</p>
                        <div className="grid grid-cols-4 gap-2 text-[11px] font-mono">
                          <div><span className="text-[var(--wr-text-3)]">Alertes actuelles :</span> <span className="text-[var(--wr-text-1)]">{r.comparison.existingAlerts}</span></div>
                          <div><span className="text-[var(--wr-text-3)]">Overlap :</span> <span className="text-[var(--wr-text-1)]">{r.comparison.overlap}</span></div>
                          <div><span className="text-[var(--wr-text-3)]">Nouveaux hits :</span> <span className="text-emerald-400">{r.comparison.newDetections}</span></div>
                          <div><span className="text-[var(--wr-text-3)]">FP estimés :</span> <span className="text-red-400">{r.comparison.estimatedFP}</span></div>
                        </div>
                      </div>
                    )}
                    {r.simulation.sampleTriggers.length > 0 && (
                      <div>
                        <p className="text-[9px] font-mono text-[var(--wr-text-4)] uppercase tracking-widest mb-1">Échantillon déclenchements</p>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {r.simulation.sampleTriggers.slice(0, 5).map((s, i) => (
                            <div key={i} className="flex items-center gap-3 text-[11px] font-mono bg-[var(--wr-card)] border border-[var(--wr-border)] rounded px-3 py-1.5">
                              <span className="text-[var(--wr-blue)]">{s.transactionId}</span>
                              <span className="text-[var(--wr-text-3)]">Client #{s.customerId}</span>
                              <span className="text-[var(--wr-text-1)]">{s.amount.toLocaleString()} {s.currency}</span>
                              <span className={`ml-auto ${s.score >= 70 ? "text-red-400" : "text-amber-400"}`}>score {s.score}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--wr-border)] flex gap-2 flex-shrink-0">
          {mutation.error && (
            <p className="text-xs font-mono text-red-400 mr-auto self-center">{mutation.error.message}</p>
          )}
          <button onClick={onClose} className={btnGhost}>{t.common.cancel}</button>
          {tab !== "backtest" && (
            <button
              disabled={!isValid || mutation.isPending}
              onClick={() => {
                const payload = {
                  name:           name.trim(),
                  description:    desc || undefined,
                  category:       category as "THRESHOLD" | "FREQUENCY" | "PATTERN" | "GEOGRAPHY" | "COUNTERPARTY" | "VELOCITY" | "CUSTOMER",
                  status:         status as "ACTIVE" | "INACTIVE" | "TESTING",
                  baseScore:      score,
                  priority:       priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
                  alertType:      alertType as "THRESHOLD" | "PATTERN" | "VELOCITY" | "SANCTIONS" | "FRAUD" | "PEP" | "NETWORK",
                  conditions:     conditionToJson(cond),
                  thresholdValue: threshold || undefined,
                  windowMinutes:  window_ ? parseInt(window_) : undefined,
                };
                if (isEdit) {
                  updateMut.mutate({ id: editId!, ...payload });
                } else {
                  createMut.mutate(payload);
                }
              }}
              className={`${btnBlue} disabled:opacity-40`}
            >
              {mutation.isPending ? (isEdit ? "Enregistrement..." : "Création...") : (isEdit ? "Enregistrer" : t.amlRules.addRule)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
