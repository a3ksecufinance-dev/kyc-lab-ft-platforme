
interface BadgeProps {
  label:    string;
  variant?: "risk" | "status" | "priority" | "default";
  className?: string;
}

type BS = { bg: string; color: string; border: string };

const RISK: Record<string, BS> = {
  LOW:      { bg:"rgba(52,211,153,0.12)",  color:"#34D399", border:"rgba(52,211,153,0.25)"  },
  MEDIUM:   { bg:"rgba(251,191,36,0.12)",  color:"#FBBF24", border:"rgba(251,191,36,0.25)"  },
  HIGH:     { bg:"rgba(248,113,113,0.12)", color:"#F87171", border:"rgba(248,113,113,0.25)" },
  CRITICAL: { bg:"rgba(248,113,113,0.18)", color:"#FCA5A5", border:"rgba(248,113,113,0.4)"  },
};

const STATUS: Record<string, BS> = {
  OPEN:                { bg:"rgba(56,189,248,0.12)",  color:"#38BDF8", border:"rgba(56,189,248,0.25)"  },
  IN_REVIEW:           { bg:"rgba(251,191,36,0.12)",  color:"#FBBF24", border:"rgba(251,191,36,0.25)"  },
  UNDER_INVESTIGATION: { bg:"rgba(251,146,60,0.12)",  color:"#FB923C", border:"rgba(251,146,60,0.25)"  },
  PENDING_APPROVAL:    { bg:"rgba(167,139,250,0.12)", color:"#A78BFA", border:"rgba(167,139,250,0.25)" },
  CLOSED:              { bg:"rgba(100,116,139,0.1)",  color:"#94A3B8", border:"rgba(100,116,139,0.2)"  },
  FALSE_POSITIVE:      { bg:"rgba(100,116,139,0.1)",  color:"#78909C", border:"rgba(100,116,139,0.2)"  },
  ESCALATED:           { bg:"rgba(248,113,113,0.12)", color:"#F87171", border:"rgba(248,113,113,0.25)" },
  SAR_SUBMITTED:       { bg:"rgba(192,132,252,0.12)", color:"#C084FC", border:"rgba(192,132,252,0.25)" },
  APPROVED:            { bg:"rgba(52,211,153,0.12)",  color:"#34D399", border:"rgba(52,211,153,0.25)"  },
  PENDING:             { bg:"rgba(251,191,36,0.12)",  color:"#FBBF24", border:"rgba(251,191,36,0.25)"  },
  REJECTED:            { bg:"rgba(248,113,113,0.12)", color:"#F87171", border:"rgba(248,113,113,0.25)" },
  DRAFT:               { bg:"rgba(100,116,139,0.1)",  color:"#94A3B8", border:"rgba(100,116,139,0.2)"  },
  SUBMITTED:           { bg:"rgba(56,189,248,0.12)",  color:"#38BDF8", border:"rgba(56,189,248,0.25)"  },
  REVIEW:              { bg:"rgba(251,191,36,0.12)",  color:"#FBBF24", border:"rgba(251,191,36,0.25)"  },
  FLAGGED:             { bg:"rgba(248,113,113,0.12)", color:"#F87171", border:"rgba(248,113,113,0.25)" },
  BLOCKED:             { bg:"rgba(239,68,68,0.18)",   color:"#FCA5A5", border:"rgba(239,68,68,0.35)"   },
  COMPLETED:           { bg:"rgba(52,211,153,0.12)",  color:"#34D399", border:"rgba(52,211,153,0.25)"  },
  CLEAR:               { bg:"rgba(52,211,153,0.12)",  color:"#34D399", border:"rgba(52,211,153,0.25)"  },
  MATCH:               { bg:"rgba(248,113,113,0.12)", color:"#F87171", border:"rgba(248,113,113,0.25)" },
  TESTING:             { bg:"rgba(251,191,36,0.12)",  color:"#FBBF24", border:"rgba(251,191,36,0.25)"  },
  ACTIVE:              { bg:"rgba(52,211,153,0.12)",  color:"#34D399", border:"rgba(52,211,153,0.25)"  },
  INACTIVE:            { bg:"rgba(100,116,139,0.1)",  color:"#94A3B8", border:"rgba(100,116,139,0.2)"  },
  TRANSFER:            { bg:"rgba(96,165,250,0.12)",  color:"#60A5FA", border:"rgba(96,165,250,0.25)"  },
  DEPOSIT:             { bg:"rgba(52,211,153,0.12)",  color:"#34D399", border:"rgba(52,211,153,0.25)"  },
  WITHDRAWAL:          { bg:"rgba(251,146,60,0.12)",  color:"#FB923C", border:"rgba(251,146,60,0.25)"  },
  PAYMENT:             { bg:"rgba(167,139,250,0.12)", color:"#A78BFA", border:"rgba(167,139,250,0.25)" },
  EXCHANGE:            { bg:"rgba(34,211,238,0.12)",  color:"#22D3EE", border:"rgba(34,211,238,0.25)"  },
  THRESHOLD:           { bg:"rgba(248,113,113,0.12)", color:"#F87171", border:"rgba(248,113,113,0.25)" },
  PATTERN:             { bg:"rgba(251,146,60,0.12)",  color:"#FB923C", border:"rgba(251,146,60,0.25)"  },
  VELOCITY:            { bg:"rgba(251,191,36,0.12)",  color:"#FBBF24", border:"rgba(251,191,36,0.25)"  },
  SANCTIONS:           { bg:"rgba(192,132,252,0.12)", color:"#C084FC", border:"rgba(192,132,252,0.25)" },
  FRAUD:               { bg:"rgba(248,113,113,0.18)", color:"#FCA5A5", border:"rgba(248,113,113,0.4)"  },
  NETWORK:             { bg:"rgba(34,211,238,0.12)",  color:"#22D3EE", border:"rgba(34,211,238,0.25)"  },
  PEP:                 { bg:"rgba(251,191,36,0.12)",  color:"#FBBF24", border:"rgba(251,191,36,0.25)"  },
  INDIVIDUAL:          { bg:"rgba(96,165,250,0.12)",  color:"#60A5FA", border:"rgba(96,165,250,0.25)"  },
  CORPORATE:           { bg:"rgba(167,139,250,0.12)", color:"#A78BFA", border:"rgba(167,139,250,0.25)" },
  ONLINE:              { bg:"rgba(96,165,250,0.12)",  color:"#60A5FA", border:"rgba(96,165,250,0.25)"  },
  MOBILE:              { bg:"rgba(34,211,238,0.12)",  color:"#22D3EE", border:"rgba(34,211,238,0.25)"  },
  BRANCH:              { bg:"rgba(212,175,55,0.12)",  color:"#D4AF37", border:"rgba(212,175,55,0.25)"  },
  ATM:                 { bg:"rgba(251,146,60,0.12)",  color:"#FB923C", border:"rgba(251,146,60,0.25)"  },
  API:                 { bg:"rgba(100,116,139,0.12)", color:"#94A3B8", border:"rgba(100,116,139,0.2)"  },
  CUSTOM:              { bg:"rgba(212,175,55,0.12)",  color:"#D4AF37", border:"rgba(212,175,55,0.25)"  },
};

const PRIORITY: Record<string, BS> = {
  LOW:      { bg:"rgba(100,116,139,0.1)",  color:"#94A3B8", border:"rgba(100,116,139,0.2)"  },
  MEDIUM:   { bg:"rgba(251,191,36,0.12)",  color:"#FBBF24", border:"rgba(251,191,36,0.25)"  },
  HIGH:     { bg:"rgba(251,146,60,0.12)",  color:"#FB923C", border:"rgba(251,146,60,0.25)"  },
  CRITICAL: { bg:"rgba(248,113,113,0.18)", color:"#FCA5A5", border:"rgba(248,113,113,0.4)"  },
};

const D: BS = { bg:"rgba(100,116,139,0.1)", color:"#94A3B8", border:"rgba(100,116,139,0.2)" };

const LABELS: Record<string, string> = {
  LOW:"BAS", MEDIUM:"MOYEN", HIGH:"ÉLEVÉ", CRITICAL:"CRITIQUE",
  OPEN:"OUVERT", IN_REVIEW:"EN RÉVISION", CLOSED:"FERMÉ",
  FALSE_POSITIVE:"FAUX POSITIF", ESCALATED:"ESCALADÉ",
  APPROVED:"APPROUVÉ", PENDING:"EN ATTENTE", REJECTED:"REJETÉ",
  DRAFT:"BROUILLON", SUBMITTED:"SOUMIS", REVIEW:"EN RÉVISION",
  FLAGGED:"SIGNALÉ", BLOCKED:"BLOQUÉ", COMPLETED:"COMPLÉTÉ",
  CLEAR:"CLEAR", MATCH:"MATCH", UNDER_INVESTIGATION:"EN INVESTIGATION",
  PENDING_APPROVAL:"EN APPROBATION", SAR_SUBMITTED:"SAR SOUMIS",
  INDIVIDUAL:"INDIVIDUEL", CORPORATE:"ENTREPRISE", PEP:"PPE",
  ACTIVE:"ACTIF", INACTIVE:"INACTIF", TESTING:"TEST",
  TRANSFER:"VIREMENT", DEPOSIT:"DÉPÔT", WITHDRAWAL:"RETRAIT",
  PAYMENT:"PAIEMENT", EXCHANGE:"CHANGE",
  THRESHOLD:"SEUIL", PATTERN:"PATTERN", VELOCITY:"VÉLOCITÉ",
  SANCTIONS:"SANCTIONS", FRAUD:"FRAUDE", NETWORK:"RÉSEAU",
  ONLINE:"ONLINE", MOBILE:"MOBILE", BRANCH:"AGENCE", ATM:"ATM", API:"API",
};

export function Badge({ label, variant = "default", className }: BadgeProps) {
  const upper   = label.toUpperCase().replace(/ /g, "_");
  const display = LABELS[upper] ?? label;
  const s: BS   =
    variant === "risk"     ? (RISK[upper]     ?? D) :
    variant === "status"   ? (STATUS[upper]   ?? D) :
    variant === "priority" ? (PRIORITY[upper] ?? D) :
    (STATUS[upper] ?? RISK[upper] ?? PRIORITY[upper] ?? D);

  return (
    <span
      className={className}
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 8px", borderRadius: 5,
        fontSize: 10, fontFamily: "'JetBrains Mono','Courier New',monospace",
        fontWeight: 600, letterSpacing: "0.1em",
        textTransform: "uppercase", whiteSpace: "nowrap",
        backgroundColor: s.bg, color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {display}
    </span>
  );
}
