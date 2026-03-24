import { cn } from "../../lib/utils";

interface BadgeProps {
  label: string;
  variant?: "risk" | "status" | "priority" | "default";
  className?: string;
}

const RISK: Record<string, string> = {
  LOW:      "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20",
  MEDIUM:   "bg-amber-400/10 text-amber-400 border border-amber-400/20",
  HIGH:     "bg-red-400/10 text-red-400 border border-red-400/20",
  CRITICAL: "bg-red-300/10 text-red-300 border border-red-300/30",
};

const STATUS: Record<string, string> = {
  OPEN:                "bg-sky-400/10 text-sky-400 border border-sky-400/20",
  IN_REVIEW:           "bg-amber-400/10 text-amber-400 border border-amber-400/20",
  UNDER_INVESTIGATION: "bg-orange-400/10 text-orange-400 border border-orange-400/20",
  PENDING_APPROVAL:    "bg-violet-400/10 text-violet-400 border border-violet-400/20",
  CLOSED:              "bg-slate-500/10 text-slate-400 border border-slate-500/20",
  FALSE_POSITIVE:      "bg-slate-500/10 text-slate-500 border border-slate-500/20",
  ESCALATED:           "bg-red-400/10 text-red-400 border border-red-400/20",
  SAR_SUBMITTED:       "bg-purple-400/10 text-purple-400 border border-purple-400/20",
  APPROVED:            "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20",
  PENDING:             "bg-amber-400/10 text-amber-400 border border-amber-400/20",
  REJECTED:            "bg-red-400/10 text-red-400 border border-red-400/20",
  DRAFT:               "bg-slate-500/10 text-slate-400 border border-slate-500/20",
  SUBMITTED:           "bg-sky-400/10 text-sky-400 border border-sky-400/20",
  REVIEW:              "bg-amber-400/10 text-amber-400 border border-amber-400/20",
  FLAGGED:             "bg-red-400/10 text-red-400 border border-red-400/20",
  BLOCKED:             "bg-red-500/10 text-red-500 border border-red-500/20",
  COMPLETED:           "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20",
  CLEAR:               "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20",
  MATCH:               "bg-red-400/10 text-red-400 border border-red-400/20",
};

const PRIORITY: Record<string, string> = {
  LOW:      "bg-slate-500/10 text-slate-400 border border-slate-500/20",
  MEDIUM:   "bg-amber-400/10 text-amber-400 border border-amber-400/20",
  HIGH:     "bg-red-400/10 text-red-400 border border-red-400/20",
  CRITICAL: "bg-red-300/10 text-red-300 border border-red-300/30",
};

const LABELS: Record<string, string> = {
  LOW: "BAS", MEDIUM: "MOYEN", HIGH: "ÉLEVÉ", CRITICAL: "CRITIQUE",
  OPEN: "OUVERT", IN_REVIEW: "EN RÉVISION", CLOSED: "FERMÉ",
  FALSE_POSITIVE: "FAUX POSITIF", ESCALATED: "ESCALADÉ",
  APPROVED: "APPROUVÉ", PENDING: "EN ATTENTE", REJECTED: "REJETÉ",
  DRAFT: "BROUILLON", SUBMITTED: "SOUMIS", REVIEW: "EN RÉVISION",
  FLAGGED: "SIGNALÉ", BLOCKED: "BLOQUÉ", COMPLETED: "COMPLÉTÉ",
  CLEAR: "CLEAR", MATCH: "MATCH", UNDER_INVESTIGATION: "EN INVESTIGATION",
  PENDING_APPROVAL: "EN APPROBATION", SAR_SUBMITTED: "SAR SOUMIS",
  INDIVIDUAL: "INDIVIDUEL", CORPORATE: "ENTREPRISE", PEP: "PPE",
};

export function Badge({ label, variant = "default", className }: BadgeProps) {
  const upper = label.toUpperCase().replace(/ /g, "_");
  const display = LABELS[upper] ?? label;

  const cls = variant === "risk" ? (RISK[upper] ?? "bg-slate-500/10 text-slate-400 border border-slate-500/20")
    : variant === "status"       ? (STATUS[upper] ?? "bg-slate-500/10 text-slate-400 border border-slate-500/20")
    : variant === "priority"     ? (PRIORITY[upper] ?? "bg-slate-500/10 text-slate-400 border border-slate-500/20")
    : "bg-slate-500/10 text-slate-400 border border-slate-500/20";

  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium tracking-wider uppercase",
      cls, className
    )}>
      {display}
    </span>
  );
}
