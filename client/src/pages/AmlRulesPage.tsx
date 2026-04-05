/**
 * Sprint 5 — No-Code AML Rule Builder
 * Fichier : client/src/pages/AmlRulesPage.tsx (REMPLACE l'existant)
 *
 * Nouveautés vs version actuelle :
 *  1. Builder visuel multi-conditions avec AND/OR imbriqués
 *  2. Prévisualisation JSON temps réel
 *  3. Simulateur : tester la règle sur une transaction fictive
 *  4. Graphe de performance recharts (triggerRate 30j)
 *  5. Feedback loop : analyste signale faux positif → réentraînement ML
 *  6. Templates de règles prêtes à l'emploi (BAM Maroc, FATF, MENA)
 */

import { useState } from "react";
import { AppLayout }    from "../components/layout/AppLayout";
import { trpc }         from "../lib/trpc";
import { useAuth }      from "../hooks/useAuth";
import { hasRole }      from "../lib/auth";
import { useI18n }      from "../hooks/useI18n";
import {
  Shield, Plus, Trash2, FlaskConical,
  ChevronDown, ChevronRight, Zap, AlertTriangle,
  Play, Copy, CheckCircle, ToggleLeft, ToggleRight,
  GitBranch, TrendingUp, ThumbsDown, Code, Globe, Pencil,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type AmlRule = {
  id: number; ruleId: string; name: string; description: string | null;
  category: string; status: "ACTIVE" | "INACTIVE" | "TESTING";
  baseScore: number; priority: string; alertType: string;
  thresholdValue: string | null; windowMinutes: number | null;
  countThreshold: number | null; conditions: unknown;
  createdAt: Date; updatedAt: Date;
};

type SimpleCondition = {
  type: "simple";
  field: string;
  op: ">=" | "<=" | ">" | "<" | "==" | "!=" | "in" | "not_in";
  value: string;
};

type CompoundCondition = {
  type: "compound";
  logic: "AND" | "OR";
  rules: Condition[];
};

type Condition = SimpleCondition | CompoundCondition;

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  THRESHOLD: "Seuil", FREQUENCY: "Fréquence", PATTERN: "Pattern",
  GEOGRAPHY: "Géographie", COUNTERPARTY: "Contrepartie",
  VELOCITY: "Vélocité", CUSTOMER: "Client",
};

const CATEGORY_COLORS: Record<string, string> = {
  THRESHOLD:    "text-amber-400  bg-amber-400/10  border-amber-400/20",
  FREQUENCY:    "text-blue-400   bg-blue-400/10   border-blue-400/20",
  PATTERN:      "text-purple-400 bg-purple-400/10 border-purple-400/20",
  GEOGRAPHY:    "text-red-400    bg-red-400/10    border-red-400/20",
  COUNTERPARTY: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  VELOCITY:     "text-cyan-400   bg-cyan-400/10   border-cyan-400/20",
  CUSTOMER:     "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
};

const FIELDS = [
  { group: "Transaction", options: [
    { value: "amount",             label: "Montant (MAD/EUR)" },
    { value: "currency",           label: "Devise" },
    { value: "channel",            label: "Canal (ONLINE/ATM...)" },
    { value: "transactionType",    label: "Type (TRANSFER...)" },
    { value: "counterpartyCountry",label: "Pays contrepartie (ISO)" },
    { value: "counterpartyBank",   label: "Banque contrepartie" },
    { value: "amountIsRound",      label: "Montant rond (≥5000, %1000)" },
    { value: "isHighAmount",       label: "Montant élevé (≥seuil ENV)" },
  ]},
  { group: "Client", options: [
    { value: "pepStatus",          label: "Statut PEP (true/false)" },
    { value: "riskLevel",          label: "Niveau risque (LOW/HIGH...)" },
    { value: "riskScore",          label: "Score risque (0-100)" },
    { value: "kycStatus",          label: "Statut KYC" },
    { value: "customerType",       label: "Type client (INDIVIDUAL...)" },
    { value: "residenceCountry",   label: "Pays résidence (ISO)" },
    { value: "nationality",        label: "Nationalité (ISO)" },
  ]},
  { group: "Agrégés 24h", options: [
    { value: "recentTxCount",      label: "Nb transactions récentes" },
    { value: "recentTxVolume",     label: "Volume total récent (MAD)" },
    { value: "volumeVariation",    label: "Variation volume (%)" },
  ]},
];

const OPERATORS = [
  { value: ">=", label: "≥  supérieur ou égal" },
  { value: "<=", label: "≤  inférieur ou égal" },
  { value: ">",  label: ">  strictement supérieur" },
  { value: "<",  label: "<  strictement inférieur" },
  { value: "==", label: "=  égal à" },
  { value: "!=", label: "≠  différent de" },
  { value: "in",     label: "in  dans la liste (virgule)" },
  { value: "not_in", label: "not_in  hors liste" },
];

// Templates BAM Maroc / FATF
const TEMPLATES = [
  {
    label: "Seuil BAM 10 000 MAD",
    icon: "🇲🇦",
    conditions: { type: "simple", field: "amount", op: ">=", value: "10000" } as Condition,
    category: "THRESHOLD", priority: "HIGH", score: 60, alertType: "THRESHOLD",
    desc: "Transaction unique ≥ 10 000 MAD — seuil déclaratoire BAM Circulaire 5/W/2023",
  },
  {
    label: "Pays FATF risque élevé",
    icon: "🌍",
    conditions: { type: "simple", field: "counterpartyCountry", op: "in", value: "KP,IR,MM,BY,RU,SY,YE,AF" } as Condition,
    category: "GEOGRAPHY", priority: "HIGH", score: 70, alertType: "THRESHOLD",
    desc: "Contrepartie dans un pays sous sanctions FATF ou liste grise",
  },
  {
    label: "Client PEP + montant > 5000",
    icon: "👤",
    conditions: {
      type: "compound", logic: "AND",
      rules: [
        { type: "simple", field: "pepStatus",  op: "==", value: "true"  },
        { type: "simple", field: "amount",     op: ">=", value: "5000"  },
      ],
    } as Condition,
    category: "CUSTOMER", priority: "HIGH", score: 65, alertType: "PEP",
    desc: "Transaction PEP ≥ 5 000 MAD — vigilance renforcée AMLD6 Art.18",
  },
  {
    label: "Structuring (Smurfing)",
    icon: "📊",
    conditions: {
      type: "compound", logic: "AND",
      rules: [
        { type: "simple", field: "recentTxCount", op: ">=", value: "3"    },
        { type: "simple", field: "amount",         op: "<",  value: "9999" },
      ],
    } as Condition,
    category: "PATTERN", priority: "CRITICAL", score: 85, alertType: "PATTERN",
    desc: "≥3 transactions sous 10 000 MAD en 24h — pattern structuring",
  },
  {
    label: "Variation volume +300%",
    icon: "📈",
    conditions: { type: "simple", field: "volumeVariation", op: ">=", value: "300" } as Condition,
    category: "VELOCITY", priority: "MEDIUM", score: 55, alertType: "VELOCITY",
    desc: "Volume journalier > 3× la moyenne historique 30j",
  },
  {
    label: "Hawala / Réseau informel",
    icon: "🕸️",
    conditions: {
      type: "compound", logic: "AND",
      rules: [
        { type: "simple", field: "channel",           op: "in", value: "BRANCH,ATM" },
        { type: "simple", field: "recentTxCount",      op: ">=", value: "5"          },
        { type: "simple", field: "residenceCountry",   op: "!=", value: "MA"         },
      ],
    } as Condition,
    category: "PATTERN", priority: "HIGH", score: 75, alertType: "PATTERN",
    desc: "Pattern hawala : flux cash agence/ATM + fréquence élevée + non-résident",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls  = "w-full bg-[var(--wr-hover)] border border-[var(--wr-border2)] rounded-md px-3 py-2 text-xs font-mono text-[var(--wr-text-1)] placeholder-[var(--wr-text-4)] focus:outline-none focus:border-[var(--wr-blue)] transition-colors";
const labelCls  = "block text-[10px] font-mono text-[var(--wr-text-3)] tracking-widest uppercase mb-1.5";
const btnBlue   = "px-3 py-1.5 text-xs font-mono bg-[var(--wr-blue)]/20 border border-[var(--wr-blue)]/40 text-[var(--wr-blue)] rounded-md hover:bg-[var(--wr-blue)]/30 transition-colors";
const btnGhost  = "px-3 py-1.5 text-xs font-mono border border-[var(--wr-border2)] text-[var(--wr-text-3)] rounded-md hover:border-[var(--wr-border)] transition-colors";
const btnRed    = "px-3 py-1.5 text-xs font-mono bg-red-500/10 border border-red-500/20 text-red-400 rounded-md hover:bg-red-500/20 transition-colors";

function conditionToJson(c: Condition): unknown {
  if (c.type === "simple") {
    const isNum = [">=", "<=", ">", "<"].includes(c.op);
    const isArr = ["in", "not_in"].includes(c.op);
    const v = isArr
      ? c.value.split(",").map(s => s.trim()).filter(Boolean)
      : isNum ? Number(c.value) : c.value === "true" ? true : c.value === "false" ? false : c.value;
    return { field: c.field, op: c.op, value: v };
  }
  return { logic: c.logic, rules: c.rules.map(conditionToJson) };
}

function evaluateCondition(c: Condition, tx: Record<string, unknown>): boolean {
  if (c.type === "compound") {
    if (c.logic === "AND") return c.rules.every(r => evaluateCondition(r as Condition, tx));
    return c.rules.some(r => evaluateCondition(r as Condition, tx));
  }
  const raw = tx[c.field];
  const fv = raw !== undefined ? raw : null;
  const isArr = ["in", "not_in"].includes(c.op);
  const listVals = isArr ? c.value.split(",").map(s => s.trim()) : [];
  switch (c.op) {
    case ">=": return Number(fv) >= Number(c.value);
    case "<=": return Number(fv) <= Number(c.value);
    case ">":  return Number(fv) >  Number(c.value);
    case "<":  return Number(fv) <  Number(c.value);
    case "==": return String(fv) === c.value || fv === (c.value === "true");
    case "!=": return String(fv) !== c.value;
    case "in":     return listVals.includes(String(fv));
    case "not_in": return !listVals.includes(String(fv));
    default: return false;
  }
}

// ─── ConditionBuilder — composant récursif ─────────────────────────────────

function ConditionBuilder({
  cond, onChange, onRemove, depth = 0,
}: {
  cond: Condition;
  onChange: (c: Condition) => void;
  onRemove?: (() => void) | undefined;
  depth?: number | undefined;
}) {
  const indent = depth > 0 ? "ml-5 pl-4 border-l border-[var(--wr-border2)]" : "";

  if (cond.type === "compound") {
    const addSimple = () => onChange({
      ...cond,
      rules: [...cond.rules, { type: "simple", field: "amount", op: ">=", value: "" }],
    });
    const addGroup = () => onChange({
      ...cond,
      rules: [...cond.rules, { type: "compound", logic: "AND", rules: [
        { type: "simple", field: "amount", op: ">=", value: "" },
      ]}],
    });
    const toggleLogic = () => onChange({ ...cond, logic: cond.logic === "AND" ? "OR" : "AND" });
    const updateChild = (i: number, child: Condition) => {
      const rules = [...cond.rules];
      rules[i] = child;
      onChange({ ...cond, rules });
    };
    const removeChild = (i: number) => {
      onChange({ ...cond, rules: cond.rules.filter((_, idx) => idx !== i) });
    };

    return (
      <div className={`space-y-2 ${indent}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleLogic}
            className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded border transition-colors ${
              cond.logic === "AND"
                ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                : "bg-amber-500/20 border-amber-500/40 text-amber-400"
            }`}
          >{cond.logic}</button>
          <span className="text-[10px] font-mono text-[var(--wr-text-4)]">
            {cond.logic === "AND" ? "toutes les conditions" : "au moins une condition"}
          </span>
          {onRemove && (
            <button onClick={onRemove} className="ml-auto text-[var(--wr-text-4)] hover:text-red-400 transition-colors">
              <Trash2 size={12} />
            </button>
          )}
        </div>
        {cond.rules.map((child, i) => (
          <ConditionBuilder
            key={i}
            cond={child as Condition}
            onChange={c => updateChild(i, c)}
            onRemove={cond.rules.length > 1 ? () => removeChild(i) : undefined}
            depth={depth + 1}
          />
        ))}
        <div className="flex gap-2 pt-1">
          <button onClick={addSimple} className={`${btnGhost} flex items-center gap-1`}>
            <Plus size={10} /> Condition
          </button>
          {depth < 2 && (
            <button onClick={addGroup} className={`${btnGhost} flex items-center gap-1`}>
              <GitBranch size={10} /> Groupe AND/OR
            </button>
          )}
        </div>
      </div>
    );
  }

  // Simple condition
  return (
    <div className={`flex items-center gap-2 ${indent}`}>
      <select
        value={cond.field}
        onChange={e => onChange({ ...cond, field: e.target.value })}
        className="bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2 py-1.5 text-[11px] font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50 w-44"
      >
        {FIELDS.map(g => (
          <optgroup key={g.group} label={g.group}>
            {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
      <select
        value={cond.op}
        onChange={e => onChange({ ...cond, op: e.target.value as SimpleCondition["op"] })}
        className="bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2 py-1.5 text-[11px] font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50 w-36"
      >
        {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input
        value={cond.value}
        onChange={e => onChange({ ...cond, value: e.target.value })}
        placeholder={cond.op === "in" || cond.op === "not_in" ? "KP,IR,RU" : "valeur"}
        className="bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2 py-1.5 text-[11px] font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50 w-28 placeholder-[var(--wr-text-4)]"
      />
      {onRemove && (
        <button onClick={onRemove} className="text-[var(--wr-text-4)] hover:text-red-400 transition-colors flex-shrink-0">
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Simulateur ───────────────────────────────────────────────────────────────

function RuleSimulator({ cond }: { cond: Condition }) {
  const [tx, setTx] = useState({
    amount: "8500", currency: "MAD", channel: "ONLINE",
    transactionType: "TRANSFER", counterpartyCountry: "MA",
    pepStatus: "false", riskLevel: "LOW", riskScore: "20",
    kycStatus: "APPROVED", residenceCountry: "MA", nationality: "MA",
    recentTxCount: "2", recentTxVolume: "17000", volumeVariation: "120",
    amountIsRound: "false", isHighAmount: "false",
  });

  const txParsed: Record<string, unknown> = {
    ...tx,
    amount: Number(tx.amount),
    pepStatus: tx.pepStatus === "true",
    riskScore: Number(tx.riskScore),
    recentTxCount: Number(tx.recentTxCount),
    recentTxVolume: Number(tx.recentTxVolume),
    volumeVariation: Number(tx.volumeVariation),
    amountIsRound: Number(tx.amount) >= 5000 && Number(tx.amount) % 1000 === 0,
    isHighAmount: Number(tx.amount) >= 10000,
  };

  let triggered = false;
  try { triggered = evaluateCondition(cond, txParsed); } catch {}

  const simuFields = [
    ["amount", "Montant"], ["currency", "Devise"], ["channel", "Canal"],
    ["transactionType", "Type tx"], ["counterpartyCountry", "Pays contrepartie"],
    ["pepStatus", "PEP"], ["riskLevel", "Niveau risque"],
    ["recentTxCount", "Nb tx 24h"], ["recentTxVolume", "Volume 24h"],
    ["volumeVariation", "Variation volume %"],
  ];

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-widest">Transaction de test</p>
      <div className="grid grid-cols-2 gap-2">
        {simuFields.map(([key, label]) => (
          <div key={key}>
            <label className="text-[9px] font-mono text-[var(--wr-text-4)] uppercase block mb-0.5">{label}</label>
            <input
              value={tx[key as keyof typeof tx]}
              onChange={e => setTx(prev => ({ ...prev, [key as string]: e.target.value }))}
              className="w-full bg-[var(--wr-card)] border border-[var(--wr-border)] rounded px-2 py-1 text-[11px] font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/40"
            />
          </div>
        ))}
      </div>
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${
        triggered
          ? "bg-red-500/10 border-red-500/30"
          : "bg-emerald-500/10 border-emerald-500/30"
      }`}>
        {triggered
          ? <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
          : <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
        }
        <div>
          <p className={`text-xs font-mono font-bold ${triggered ? "text-red-400" : "text-emerald-400"}`}>
            {triggered ? "RÈGLE DÉCLENCHÉE" : "Aucun déclenchement"}
          </p>
          <p className="text-[10px] font-mono text-[var(--wr-text-3)]">
            {triggered ? "Cette transaction créerait une alerte AML" : "Transaction passerait sans alerte"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Modal création/édition ───────────────────────────────────────────────────

function RuleModal({
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
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[t.category] ?? ""}`}>
                        {CATEGORY_LABELS[t.category]}
                      </span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                        t.priority === "CRITICAL" ? "text-red-400 bg-red-400/10 border-red-400/20"
                        : t.priority === "HIGH"   ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                        : "text-blue-400 bg-blue-400/10 border-blue-400/20"
                      }`}>{t.priority}</span>
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
                <Play size={11} /> {backtestMut.isPending ? "Simulation en cours…" : "Lancer le backtest"}
              </button>

              {backtestMut.isError && (
                <p className="text-xs font-mono text-red-400">{backtestMut.error.message}</p>
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
              {mutation.isPending ? (isEdit ? "Enregistrement…" : "Création...") : (isEdit ? "Enregistrer" : t.amlRules.addRule)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Carte de règle ───────────────────────────────────────────────────────────

function RuleCard({ rule, canEdit, canDelete }: { rule: AmlRule; canEdit: boolean; canDelete: boolean }) {
  const { t } = useI18n();
  const utils  = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [showEdit, setShowEdit] = useState(false);

  const { data: stats } = trpc.amlRules.stats.useQuery(
    { id: rule.id, days: 30 },
    { enabled: open }
  );
  const { data: executions } = trpc.amlRules.recentExecutions.useQuery(
    { id: rule.id, limit: 30 },
    { enabled: open }
  );

  const toggleMut = trpc.amlRules.toggleStatus.useMutation({
    onSuccess: () => utils.amlRules.list.invalidate(),
  });
  const deleteMut = trpc.amlRules.delete.useMutation({
    onSuccess: () => utils.amlRules.list.invalidate(),
  });
  const feedbackMut = trpc.amlRules.feedback.useMutation({
    onSuccess: () => { setShowFeedback(false); setFeedbackNote(""); utils.amlRules.list.invalidate(); },
  });

  // Préparer les données recharts depuis les executions
  const chartData = executions
    ? (() => {
        const byDay: Record<string, { date: string; triggered: number; total: number }> = {};
        for (const e of executions) {
          const day = new Date(e.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
          if (!byDay[day]) byDay[day] = { date: day, triggered: 0, total: 0 };
          byDay[day].total += 1;
          if (e.triggered) byDay[day].triggered += 1;
        }
        return Object.values(byDay).slice(-14);
      })()
    : [];

  const STATUS_LABELS = { ACTIVE: "Actif", INACTIVE: "Inactif", TESTING: "Test A/B" };
  const STATUS_STYLES = {
    ACTIVE:   "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    INACTIVE: "text-[var(--wr-text-4)]  bg-[var(--wr-border)]      border-[var(--wr-border2)]",
    TESTING:  "text-amber-400  bg-amber-400/10   border-amber-400/20",
  };

  return (
    <div className={`bg-[var(--wr-card)] border rounded-lg transition-all ${
      open ? "border-[var(--wr-blue)]/30" : "border-[var(--wr-border)] hover:border-[var(--wr-border2)]"
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-semibold text-[var(--wr-text-1)]">{rule.name}</span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[rule.category] ?? ""}`}>
                {CATEGORY_LABELS[rule.category] ?? rule.category}
              </span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${STATUS_STYLES[rule.status]}`}>
                {STATUS_LABELS[rule.status]}
              </span>
              {rule.status === "ACTIVE" && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              )}
            </div>
            {rule.description && (
              <p className="text-[10px] font-mono text-[var(--wr-text-3)] mt-1 line-clamp-1">{rule.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-center">
              <div className={`text-sm font-mono font-bold ${
                rule.baseScore >= 75 ? "text-red-400" : rule.baseScore >= 50 ? "text-amber-400" : "text-emerald-400"
              }`}>{rule.baseScore}</div>
              <div className="text-[9px] font-mono text-[var(--wr-text-4)]">score</div>
            </div>

            {canEdit && (
              <>
                <button
                  onClick={() => setShowEdit(true)}
                  className="text-[var(--wr-text-4)] hover:text-[var(--wr-blue)] transition-colors"
                  title="Modifier la règle"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => toggleMut.mutate({
                    id: rule.id,
                    status: rule.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                  })}
                  className="text-[var(--wr-text-4)] hover:text-[var(--wr-blue)] transition-colors"
                  title={rule.status === "ACTIVE" ? "Désactiver" : "Activer"}
                >
                  {rule.status === "ACTIVE"
                    ? <ToggleRight size={18} className="text-emerald-400" />
                    : <ToggleLeft size={18} />
                  }
                </button>
              </>
            )}

            <button
              onClick={() => setShowFeedback(true)}
              className="text-[var(--wr-text-4)] hover:text-amber-400 transition-colors"
              title="Signaler faux positif"
            >
              <ThumbsDown size={14} />
            </button>

            {canDelete && (
              <button
                onClick={() => { if (confirm("Supprimer cette règle ?")) deleteMut.mutate({ id: rule.id }); }}
                className="text-[var(--wr-text-4)] hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}

            <button onClick={() => setOpen(!open)} className="text-[var(--wr-text-4)] hover:text-[var(--wr-text-1)] transition-colors">
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Feedback modal faux positif */}
      {showFeedback && (
        <div className="mx-4 mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-[10px] font-mono text-amber-400 uppercase tracking-widest mb-2">
            Signaler un faux positif
          </p>
          <textarea
            value={feedbackNote}
            onChange={e => setFeedbackNote(e.target.value)}
            placeholder="Décrivez pourquoi cette règle génère trop de faux positifs..."
            rows={2}
            className={`${inputCls} mb-2 text-[11px]`}
          />
          <div className="flex gap-2">
            <button onClick={() => setShowFeedback(false)} className={btnGhost}>{t.common.cancel}</button>
            <button
              onClick={() => feedbackMut.mutate({ ruleId: rule.id, note: feedbackNote })}
              disabled={feedbackNote.length < 10 || feedbackMut.isPending}
              className={`${btnRed} disabled:opacity-40`}
            >
              {feedbackMut.isPending ? "Envoi..." : "Signaler"}
            </button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <RuleModal
          onClose={() => setShowEdit(false)}
          editId={rule.id}
          initial={{
            name:        rule.name,
            description: rule.description ?? "",
            category:    rule.category,
            status:      rule.status,
            score:       rule.baseScore,
            priority:    rule.priority,
            alertType:   rule.alertType,
            conditions:  rule.conditions as Condition,
            threshold:   rule.thresholdValue ?? "",
            window:      rule.windowMinutes ? String(rule.windowMinutes) : "",
          }}
        />
      )}

      {/* Expand: stats + graph */}
      {open && (
        <div className="border-t border-[var(--wr-border)] p-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Exécutions 30j",   val: stats?.totalExecutions ?? 0 },
              { label: "Déclenchements",   val: stats?.totalTriggered  ?? 0 },
              { label: "Taux déclench.",   val: `${stats?.triggerRate ?? 0}%` },
              { label: "Règle ID",         val: rule.ruleId },
            ].map(({ label, val }) => (
              <div key={label} className="bg-[var(--wr-bg)] border border-[var(--wr-border)] rounded p-2">
                <div className="text-xs font-mono font-bold text-[var(--wr-text-1)]">{String(val)}</div>
                <div className="text-[9px] font-mono text-[var(--wr-text-4)] mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Graphe recharts */}
          {chartData.length > 0 && (
            <div>
              <p className="text-[9px] font-mono text-[var(--wr-text-4)] uppercase tracking-widest mb-2 flex items-center gap-1">
                <TrendingUp size={10} /> Déclenchements / jour (14 derniers jours)
              </p>
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--wr-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--wr-text-4)", fontFamily: "monospace" }} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--wr-text-4)", fontFamily: "monospace" }} width={20} />
                  <Tooltip
                    contentStyle={{ background: "var(--wr-card)", border: "1px solid var(--wr-border)", borderRadius: 4, fontSize: 10, fontFamily: "monospace", color: "var(--wr-text-1)" }}
                    labelStyle={{ color: "var(--wr-text-2)" }}
                  />
                  <Line type="monotone" dataKey="triggered" stroke="var(--wr-amber)" strokeWidth={1.5} dot={false} name="Déclenchés" />
                  <Line type="monotone" dataKey="total" stroke="var(--wr-border2)" strokeWidth={1} dot={false} name="Analysés" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Conditions JSON */}
          <div>
            <p className="text-[9px] font-mono text-[var(--wr-text-4)] uppercase tracking-widest mb-1">Conditions JSON</p>
            <pre className="bg-[var(--wr-bg)] border border-[var(--wr-border)] rounded p-3 text-[10px] font-mono text-[var(--wr-blue)] overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(rule.conditions, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

// ─── Jurisdiction types ───────────────────────────────────────────────────────

type JurisdictionProfile = {
  id: number;
  jurisdictionCode: string;
  jurisdictionName: string;
  isActive: boolean;
  currencyCode: string;
  thresholdSingleTx: string | null;
  thresholdStructuring: string | null;
  strMandatoryAbove: string | null;
  strDelayHours: number;
  sarDelayHours: number;
  enhancedDdPep: boolean;
  enhancedDdHighRisk: boolean;
  regulatorName: string | null;
  regulatorCode: string | null;
  reportingFormat: string;
  coveredCountries: string[] | null;
};

// ─── Jurisdictions panel ──────────────────────────────────────────────────────

function JurisdictionsPanel({ canEdit }: { canEdit: boolean }) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.jurisdictions.list.invalidate();
  const { data: jurisdictions, isLoading } = trpc.jurisdictions.list.useQuery();
  const toggleMut = trpc.jurisdictions.toggle.useMutation({ onSuccess: invalidate });
  const upsertMut = trpc.jurisdictions.upsert.useMutation({ onSuccess: () => { invalidate(); setEditing(null); } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<Partial<JurisdictionProfile> | Record<string, any> | null>(null);
  const [lookupCode, setLookupCode] = useState("");
  const { data: thresholds } = trpc.jurisdictions.effectiveThresholds.useQuery(
    { countryCode: lookupCode.toUpperCase() },
    { enabled: lookupCode.length === 2 }
  );

  const activeCount   = jurisdictions?.filter(j => j.isActive).length ?? 0;
  const inactiveCount = (jurisdictions?.length ?? 0) - activeCount;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Juridictions actives", val: activeCount,   color: "text-emerald-400" },
          { label: "Désactivées",          val: inactiveCount, color: "text-[var(--wr-text-4)]"   },
          { label: "Total configuré",      val: jurisdictions?.length ?? 0, color: "text-[var(--wr-blue)]" },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-[var(--wr-card)] border border-[var(--wr-border)] rounded-lg p-4">
            <div className={`text-xl font-mono font-bold ${color}`}>{val}</div>
            <div className="text-xs font-mono text-[var(--wr-text-1)] mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Add new */}
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={() => setEditing({ jurisdictionCode: "", jurisdictionName: "", isActive: true, currencyCode: "EUR", strDelayHours: 24, sarDelayHours: 72, enhancedDdPep: true, enhancedDdHighRisk: true, reportingFormat: "GOAML_2" })}
            className={`${btnBlue} flex items-center gap-1.5`}>
            <Plus size={12} /> Nouvelle juridiction
          </button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-[11px] font-mono text-[var(--wr-text-4)]">Chargement…</div>
      ) : !jurisdictions?.length ? (
        <div className="text-center py-16 border border-dashed border-[var(--wr-border)] rounded-lg">
          <Globe size={32} className="mx-auto text-[var(--wr-border)] mb-3" />
          <p className="text-sm font-mono text-[var(--wr-text-4)]">Aucune juridiction configurée</p>
        </div>
      ) : (
        <div className="bg-[var(--wr-bg)] border border-[var(--wr-border)] rounded-lg overflow-hidden">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="border-b border-[var(--wr-border)] text-[var(--wr-text-4)] text-[10px] uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">Code</th>
                <th className="text-left px-4 py-2.5">Juridiction</th>
                <th className="text-left px-4 py-2.5">Devise</th>
                <th className="text-right px-4 py-2.5">Seuil tx</th>
                <th className="text-right px-4 py-2.5">Seuil struct.</th>
                <th className="text-left px-4 py-2.5">Délai STR</th>
                <th className="text-left px-4 py-2.5">Régulateur</th>
                <th className="text-left px-4 py-2.5">Statut</th>
                {canEdit && <th className="text-right px-4 py-2.5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--wr-border)]/50">
              {jurisdictions.map((j) => (
                <tr key={j.id} className={`hover:bg-[var(--wr-card)] transition-colors ${!j.isActive ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5">
                    <span className="bg-[var(--wr-blue)]/15 text-[var(--wr-blue)] border border-[var(--wr-blue)]/30 px-1.5 py-0.5 rounded text-[10px]">
                      {j.jurisdictionCode}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--wr-text-1)]">{j.jurisdictionName}</td>
                  <td className="px-4 py-2.5 text-[var(--wr-text-3)]">{j.currencyCode}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--wr-text-1)]">
                    {j.thresholdSingleTx ? Number(j.thresholdSingleTx).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--wr-text-1)]">
                    {j.thresholdStructuring ? Number(j.thresholdStructuring).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--wr-text-3)]">{j.strDelayHours}h</td>
                  <td className="px-4 py-2.5 text-[var(--wr-text-3)] truncate max-w-[120px]">
                    {j.regulatorCode ?? j.regulatorName ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] border ${j.isActive ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" : "text-[var(--wr-text-4)] bg-[var(--wr-border)] border-[var(--wr-border2)]"}`}>
                      {j.isActive ? "ACTIVE" : "OFF"}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditing(j)}
                          className="text-[var(--wr-text-3)] hover:text-[var(--wr-blue)] transition-colors">
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => toggleMut.mutate({ id: j.id, isActive: !j.isActive })}
                          disabled={toggleMut.isPending}
                          className={`transition-colors disabled:opacity-50 ${j.isActive ? "text-emerald-400 hover:text-[var(--wr-text-3)]" : "text-[var(--wr-text-4)] hover:text-emerald-400"}`}>
                          {j.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lookup seuils effectifs */}
      <div className="bg-[var(--wr-card)] border border-[var(--wr-border)] rounded-lg p-4">
        <h3 className="text-[10px] font-mono font-semibold text-[var(--wr-text-3)] uppercase tracking-widest mb-3">
          Seuils effectifs par pays
        </h3>
        <div className="flex gap-3 items-center mb-3">
          <input
            value={lookupCode}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLookupCode(e.target.value.slice(0, 2))}
            placeholder="FR, MA, US…"
            maxLength={2}
            className="w-24 bg-[var(--wr-hover)] border border-[var(--wr-border2)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--wr-text-1)] uppercase outline-none"
          />
          <span className="text-[10px] font-mono text-[var(--wr-text-4)]">Saisir un code ISO-2 pour consulter les seuils appliqués</span>
        </div>
        {thresholds && lookupCode.length === 2 && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            {([
              ["Seuil transaction unique",  thresholds.singleTx,           thresholds.currency],
              ["Seuil structuration",       thresholds.structuring,         thresholds.currency],
              ["Fenêtre structuration",     thresholds.structuringWindowH,  "heures"],
              ["Fréquence max",             thresholds.frequencyCount,      "tx"],
              ["Seuil espèces",             thresholds.cash,                thresholds.currency],
              ["STR obligatoire au-dessus", thresholds.strMandatoryAbove,   thresholds.currency],
              ["Délai STR",                 thresholds.strDelayHours,       "heures"],
              ["Délai SAR",                 thresholds.sarDelayHours,       "heures"],
              ["Format rapport",            thresholds.reportingFormat,     ""],
              ["Code régulateur",           thresholds.regulatorCode,       ""],
            ] as [string, number | string, string][]).map(([label, value, unit]) => (
              <div key={label} className="flex justify-between items-center text-[10px] font-mono py-1 border-b border-[var(--wr-border)]/30">
                <span className="text-[var(--wr-text-4)]">{label}</span>
                <span className="text-[var(--wr-text-1)] font-semibold">
                  {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
                  {unit && <span className="text-[var(--wr-text-4)] font-normal ml-1">{unit}</span>}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center text-[10px] font-mono py-1 border-b border-[var(--wr-border)]/30">
              <span className="text-[var(--wr-text-4)]">DD renforcée PEP</span>
              <span className={thresholds.enhancedDdPep ? "text-amber-400 font-semibold" : "text-[var(--wr-text-4)]"}>
                {thresholds.enhancedDdPep ? "OUI" : "NON"}
              </span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono py-1 border-b border-[var(--wr-border)]/30">
              <span className="text-[var(--wr-text-4)]">DD renforcée haut risque</span>
              <span className={thresholds.enhancedDdHighRisk ? "text-amber-400 font-semibold" : "text-[var(--wr-text-4)]"}>
                {thresholds.enhancedDdHighRisk ? "OUI" : "NON"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Edit / Create modal */}
      {editing !== null && (
        <JurisdictionModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(data) => upsertMut.mutate(data as Parameters<typeof upsertMut.mutate>[0])}
          saving={upsertMut.isPending}
        />
      )}
    </div>
  );
}

// ─── Jurisdiction modal ───────────────────────────────────────────────────────

function JurisdictionModal({
  initial, onClose, onSave, saving,
}: {
  initial: Partial<JurisdictionProfile>;
  onClose: () => void;
  onSave: (data: unknown) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    jurisdictionCode:     initial.jurisdictionCode ?? "",
    jurisdictionName:     initial.jurisdictionName ?? "",
    isActive:             initial.isActive ?? true,
    currencyCode:         initial.currencyCode ?? "EUR",
    thresholdSingleTx:    initial.thresholdSingleTx ?? "",
    thresholdStructuring: initial.thresholdStructuring ?? "",
    strMandatoryAbove:    initial.strMandatoryAbove ?? "",
    strDelayHours:        initial.strDelayHours ?? 24,
    sarDelayHours:        initial.sarDelayHours ?? 72,
    enhancedDdPep:        initial.enhancedDdPep ?? true,
    enhancedDdHighRisk:   initial.enhancedDdHighRisk ?? true,
    regulatorName:        initial.regulatorName ?? "",
    regulatorCode:        initial.regulatorCode ?? "",
    reportingFormat:      initial.reportingFormat ?? "GOAML_2",
    coveredCountries:     (initial.coveredCountries ?? []).join(","),
  });

  const field = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const handleSave = () => {
    const data = {
      jurisdictionCode:     form.jurisdictionCode.toUpperCase(),
      jurisdictionName:     form.jurisdictionName,
      isActive:             form.isActive,
      currencyCode:         form.currencyCode,
      thresholdSingleTx:    form.thresholdSingleTx || undefined,
      thresholdStructuring: form.thresholdStructuring || undefined,
      strMandatoryAbove:    form.strMandatoryAbove || undefined,
      strDelayHours:        Number(form.strDelayHours),
      sarDelayHours:        Number(form.sarDelayHours),
      enhancedDdPep:        form.enhancedDdPep,
      enhancedDdHighRisk:   form.enhancedDdHighRisk,
      regulatorName:        form.regulatorName || undefined,
      regulatorCode:        form.regulatorCode || undefined,
      reportingFormat:      form.reportingFormat,
      coveredCountries:     form.coveredCountries ? form.coveredCountries.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) : [],
    };
    onSave(data);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--wr-card)] border border-[var(--wr-border2)] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--wr-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold font-mono text-[var(--wr-text-1)] flex items-center gap-2">
            <Globe size={14} className="text-[var(--wr-blue)]" />
            {initial.id ? "Modifier juridiction" : "Nouvelle juridiction"}
          </h2>
          <button onClick={onClose} className="text-[var(--wr-text-4)] hover:text-[var(--wr-text-3)]">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Code ISO *</label>
              <input value={form.jurisdictionCode} onChange={field("jurisdictionCode")} maxLength={10}
                placeholder="FR, MA, UK…" disabled={!!initial.id}
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50 disabled:opacity-50" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Devise</label>
              <input value={form.currencyCode} onChange={field("currencyCode")} maxLength={3}
                placeholder="EUR, MAD, GBP…"
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Nom de la juridiction *</label>
            <input value={form.jurisdictionName} onChange={field("jurisdictionName")}
              placeholder="France, Maroc, Royaume-Uni…"
              className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Seuil tx unique</label>
              <input value={form.thresholdSingleTx} onChange={field("thresholdSingleTx")}
                placeholder="10000"
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Seuil structuring</label>
              <input value={form.thresholdStructuring} onChange={field("thresholdStructuring")}
                placeholder="3000"
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Délai STR (heures)</label>
              <input type="number" value={form.strDelayHours} onChange={field("strDelayHours")}
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Délai SAR (heures)</label>
              <input type="number" value={form.sarDelayHours} onChange={field("sarDelayHours")}
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Code régulateur</label>
              <input value={form.regulatorCode} onChange={field("regulatorCode")}
                placeholder="BAM, ACPR, FCA…"
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Format rapport</label>
              <select value={form.reportingFormat} onChange={field("reportingFormat")}
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none">
                {["GOAML_2", "GOAML_3", "TRACFIN_V3", "CUSTOM"].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">
              Pays couverts (ISO 2 séparés par virgules)
            </label>
            <input value={form.coveredCountries} onChange={field("coveredCountries")}
              placeholder="GP, MQ, RE, PM…"
              className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
          </div>

          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-[11px] font-mono text-[var(--wr-text-3)] cursor-pointer">
              <input type="checkbox" checked={form.enhancedDdPep}
                onChange={e => setForm(p => ({ ...p, enhancedDdPep: e.target.checked }))}
                className="rounded" />
              DD renforcée PPE
            </label>
            <label className="flex items-center gap-2 text-[11px] font-mono text-[var(--wr-text-3)] cursor-pointer">
              <input type="checkbox" checked={form.enhancedDdHighRisk}
                onChange={e => setForm(p => ({ ...p, enhancedDdHighRisk: e.target.checked }))}
                className="rounded" />
              DD renforcée haut risque
            </label>
            <label className="flex items-center gap-2 text-[11px] font-mono text-[var(--wr-text-3)] cursor-pointer">
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                className="rounded" />
              Active
            </label>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[var(--wr-border)] flex justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>Annuler</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.jurisdictionCode || !form.jurisdictionName}
            className={`${btnBlue} disabled:opacity-50`}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AmlRulesPage() {
  const { t }       = useI18n();
  const { user }    = useAuth();
  const canEdit     = hasRole(user, "supervisor");
  const canDelete   = hasRole(user, "admin");
  const [showCreate, setShowCreate] = useState(false);
  const [pageTab, setPageTab] = useState<"rules" | "jurisdictions">("rules");

  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.amlRules.list.useQuery();

  const seedMut = trpc.amlRules.seedDefaults.useMutation({
    onSuccess: () => utils.amlRules.list.invalidate(),
  });

  const active   = rules?.filter((r: AmlRule) => r.status === "ACTIVE").length   ?? 0;
  const testing  = rules?.filter((r: AmlRule) => r.status === "TESTING").length  ?? 0;
  const inactive = rules?.filter((r: AmlRule) => r.status === "INACTIVE").length ?? 0;
  const avgScore = rules?.length
    ? Math.round(rules.reduce((s: number, r: AmlRule) => s + r.baseScore, 0) / rules.length)
    : 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[var(--wr-text-1)] font-mono flex items-center gap-2">
              <Shield size={18} className="text-[var(--wr-blue)]" /> {t.amlRules.title}
            </h1>
            <p className="text-[11px] font-mono text-[var(--wr-text-3)] mt-0.5">
              {t.amlRules.subtitle}
            </p>
          </div>
          <div className="flex gap-2">
            {pageTab === "rules" && canEdit && rules?.length === 0 && (
              <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
                className={`${btnGhost} flex items-center gap-1.5`}>
                <FlaskConical size={12} />
                {seedMut.isPending ? "Chargement..." : "Charger règles BAM"}
              </button>
            )}
            {pageTab === "rules" && canEdit && (
              <button onClick={() => setShowCreate(true)}
                className={`${btnBlue} flex items-center gap-1.5`}>
                <Plus size={12} /> {t.amlRules.addRule}
              </button>
            )}
          </div>
        </div>

        {/* Page-level tabs */}
        <div className="flex gap-0 border-b border-[var(--wr-border)]">
          {([
            ["rules",         "Règles AML",     Shield],
            ["jurisdictions", "Juridictions",   Globe ],
          ] as [typeof pageTab, string, React.ElementType][]).map(([t, label, Icon]) => (
            <button key={t} onClick={() => setPageTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono border-b-2 transition-colors ${
                pageTab === t
                  ? "border-[var(--wr-blue)] text-[var(--wr-blue)]"
                  : "border-transparent text-[var(--wr-text-3)] hover:text-[var(--wr-text-1)]"
              }`}>
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Règles AML ── */}
        {pageTab === "rules" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Actives",     val: active,   sub: "en production",      color: "text-emerald-400" },
                { label: "En test A/B", val: testing,  sub: "sans alerte réelle", color: "text-amber-400"  },
                { label: "Inactives",   val: inactive, sub: "désactivées",        color: "text-[var(--wr-text-4)]"  },
                { label: "Score moyen", val: avgScore, sub: "sur 100",            color: "text-[var(--wr-blue)]"  },
              ].map(({ label, val, sub, color }) => (
                <div key={label} className="bg-[var(--wr-card)] border border-[var(--wr-border)] rounded-lg p-4">
                  <div className={`text-xl font-mono font-bold ${color}`}>{val}</div>
                  <div className="text-xs font-mono text-[var(--wr-text-1)] mt-0.5">{label}</div>
                  <div className="text-[9px] font-mono text-[var(--wr-text-4)]">{sub}</div>
                </div>
              ))}
            </div>

            {/* Liste */}
            {isLoading ? (
              <div className="text-center py-12 text-[11px] font-mono text-[var(--wr-text-4)]">
                Chargement des règles...
              </div>
            ) : !rules?.length ? (
              <div className="text-center py-16 border border-dashed border-[var(--wr-border)] rounded-lg">
                <Shield size={32} className="mx-auto text-[var(--wr-border)] mb-3" />
                <p className="text-sm font-mono text-[var(--wr-text-4)]">{t.amlRules.noRules}</p>
                <p className="text-[10px] font-mono text-[var(--wr-text-4)] mt-1">
                  Cliquez sur "Charger règles BAM" pour démarrer avec les règles BAM Maroc pré-configurées
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule: AmlRule) => (
                  <RuleCard key={rule.id} rule={rule} canEdit={canEdit} canDelete={canDelete} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Tab: Juridictions ── */}
        {pageTab === "jurisdictions" && (
          <JurisdictionsPanel canEdit={canEdit} />
        )}
      </div>

      {showCreate && <RuleModal onClose={() => setShowCreate(false)} />}
    </AppLayout>
  );
}
