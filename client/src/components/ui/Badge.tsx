import { useI18n } from "../../hooks/useI18n";

interface BadgeProps {
  label:    string;
  variant?: "risk" | "status" | "priority" | "default";
  className?: string;
  dot?:     boolean;
}

type BS = { bg: string; color: string; border: string };

const RISK: Record<string, BS> = {
  LOW:      { bg:"rgba(45,212,160,0.09)",   color:"#2DD4A0", border:"rgba(45,212,160,0.22)"  },
  MEDIUM:   { bg:"rgba(245,158,11,0.10)",   color:"#F59E0B", border:"rgba(245,158,11,0.22)"  },
  HIGH:     { bg:"rgba(255,101,112,0.10)",  color:"#FF6570", border:"rgba(255,101,112,0.22)" },
  CRITICAL: { bg:"rgba(255,101,112,0.16)",  color:"#FCA5A5", border:"rgba(255,101,112,0.38)" },
};

const STATUS: Record<string, BS> = {
  OPEN:                { bg:"rgba(74,158,255,0.10)",   color:"#4A9EFF", border:"rgba(74,158,255,0.22)"   },
  IN_REVIEW:           { bg:"rgba(245,158,11,0.10)",   color:"#F59E0B", border:"rgba(245,158,11,0.22)"   },
  UNDER_INVESTIGATION: { bg:"rgba(251,146,60,0.10)",   color:"#FB923C", border:"rgba(251,146,60,0.22)"   },
  PENDING_APPROVAL:    { bg:"rgba(167,139,250,0.10)",  color:"#A78BFA", border:"rgba(167,139,250,0.22)"  },
  CLOSED:              { bg:"rgba(100,116,139,0.09)",  color:"#94A3B8", border:"rgba(100,116,139,0.18)"  },
  FALSE_POSITIVE:      { bg:"rgba(100,116,139,0.09)",  color:"#78909C", border:"rgba(100,116,139,0.18)"  },
  ESCALATED:           { bg:"rgba(255,101,112,0.10)",  color:"#FF6570", border:"rgba(255,101,112,0.22)"  },
  SAR_SUBMITTED:       { bg:"rgba(192,132,252,0.10)",  color:"#C084FC", border:"rgba(192,132,252,0.22)"  },
  APPROVED:            { bg:"rgba(45,212,160,0.09)",   color:"#2DD4A0", border:"rgba(45,212,160,0.22)"   },
  PENDING:             { bg:"rgba(245,158,11,0.10)",   color:"#F59E0B", border:"rgba(245,158,11,0.22)"   },
  REJECTED:            { bg:"rgba(255,101,112,0.10)",  color:"#FF6570", border:"rgba(255,101,112,0.22)"  },
  DRAFT:               { bg:"rgba(100,116,139,0.09)",  color:"#94A3B8", border:"rgba(100,116,139,0.18)"  },
  SUBMITTED:           { bg:"rgba(74,158,255,0.10)",   color:"#4A9EFF", border:"rgba(74,158,255,0.22)"   },
  REVIEW:              { bg:"rgba(245,158,11,0.10)",   color:"#F59E0B", border:"rgba(245,158,11,0.22)"   },
  FLAGGED:             { bg:"rgba(255,101,112,0.10)",  color:"#FF6570", border:"rgba(255,101,112,0.22)"  },
  BLOCKED:             { bg:"rgba(255,101,112,0.16)",  color:"#FCA5A5", border:"rgba(255,101,112,0.34)"  },
  COMPLETED:           { bg:"rgba(45,212,160,0.09)",   color:"#2DD4A0", border:"rgba(45,212,160,0.22)"   },
  CLEAR:               { bg:"rgba(45,212,160,0.09)",   color:"#2DD4A0", border:"rgba(45,212,160,0.22)"   },
  MATCH:               { bg:"rgba(255,101,112,0.10)",  color:"#FF6570", border:"rgba(255,101,112,0.22)"  },
  TESTING:             { bg:"rgba(245,158,11,0.10)",   color:"#F59E0B", border:"rgba(245,158,11,0.22)"   },
  ACTIVE:              { bg:"rgba(45,212,160,0.09)",   color:"#2DD4A0", border:"rgba(45,212,160,0.22)"   },
  INACTIVE:            { bg:"rgba(100,116,139,0.09)",  color:"#94A3B8", border:"rgba(100,116,139,0.18)"  },
  TRANSFER:            { bg:"rgba(74,158,255,0.10)",   color:"#4A9EFF", border:"rgba(74,158,255,0.22)"   },
  DEPOSIT:             { bg:"rgba(45,212,160,0.09)",   color:"#2DD4A0", border:"rgba(45,212,160,0.22)"   },
  WITHDRAWAL:          { bg:"rgba(251,146,60,0.10)",   color:"#FB923C", border:"rgba(251,146,60,0.22)"   },
  PAYMENT:             { bg:"rgba(167,139,250,0.10)",  color:"#A78BFA", border:"rgba(167,139,250,0.22)"  },
  EXCHANGE:            { bg:"rgba(34,211,238,0.10)",   color:"#22D3EE", border:"rgba(34,211,238,0.22)"   },
  THRESHOLD:           { bg:"rgba(255,101,112,0.10)",  color:"#FF6570", border:"rgba(255,101,112,0.22)"  },
  PATTERN:             { bg:"rgba(251,146,60,0.10)",   color:"#FB923C", border:"rgba(251,146,60,0.22)"   },
  VELOCITY:            { bg:"rgba(245,158,11,0.10)",   color:"#F59E0B", border:"rgba(245,158,11,0.22)"   },
  SANCTIONS:           { bg:"rgba(192,132,252,0.10)",  color:"#C084FC", border:"rgba(192,132,252,0.22)"  },
  FRAUD:               { bg:"rgba(255,101,112,0.16)",  color:"#FCA5A5", border:"rgba(255,101,112,0.38)"  },
  NETWORK:             { bg:"rgba(34,211,238,0.10)",   color:"#22D3EE", border:"rgba(34,211,238,0.22)"   },
  PEP:                 { bg:"rgba(245,158,11,0.10)",   color:"#F59E0B", border:"rgba(245,158,11,0.22)"   },
  INDIVIDUAL:          { bg:"rgba(74,158,255,0.10)",   color:"#4A9EFF", border:"rgba(74,158,255,0.22)"   },
  CORPORATE:           { bg:"rgba(167,139,250,0.10)",  color:"#A78BFA", border:"rgba(167,139,250,0.22)"  },
  ONLINE:              { bg:"rgba(74,158,255,0.10)",   color:"#4A9EFF", border:"rgba(74,158,255,0.22)"   },
  MOBILE:              { bg:"rgba(34,211,238,0.10)",   color:"#22D3EE", border:"rgba(34,211,238,0.22)"   },
  BRANCH:              { bg:"rgba(20,184,166,0.10)",   color:"#14B8A6", border:"rgba(20,184,166,0.22)"   },
  ATM:                 { bg:"rgba(251,146,60,0.10)",   color:"#FB923C", border:"rgba(251,146,60,0.22)"   },
  API:                 { bg:"rgba(100,116,139,0.09)",  color:"#94A3B8", border:"rgba(100,116,139,0.18)"  },
  CUSTOM:              { bg:"rgba(20,184,166,0.10)",   color:"#14B8A6", border:"rgba(20,184,166,0.22)"   },
};

const PRIORITY: Record<string, BS> = {
  LOW:      { bg:"rgba(100,116,139,0.09)",  color:"#94A3B8", border:"rgba(100,116,139,0.18)"  },
  MEDIUM:   { bg:"rgba(245,158,11,0.10)",   color:"#F59E0B", border:"rgba(245,158,11,0.22)"   },
  HIGH:     { bg:"rgba(251,146,60,0.10)",   color:"#FB923C", border:"rgba(251,146,60,0.22)"   },
  CRITICAL: { bg:"rgba(255,101,112,0.16)",  color:"#FCA5A5", border:"rgba(255,101,112,0.38)"  },
};

const D: BS = { bg:"rgba(100,116,139,0.09)", color:"#94A3B8", border:"rgba(100,116,139,0.18)" };


// Statuses that show a live dot
const DOT_STATUSES = new Set(["OPEN", "ACTIVE", "MATCH", "ESCALATED", "BLOCKED", "CRITICAL", "FRAUD"]);

export function Badge({ label, variant = "default", className, dot }: BadgeProps) {
  const { t } = useI18n();
  const upper   = label.toUpperCase().replace(/ /g, "_");
  const display = (t.badges as Record<string, string>)[upper] ?? label;
  const s: BS   =
    variant === "risk"     ? (RISK[upper]     ?? D) :
    variant === "status"   ? (STATUS[upper]   ?? D) :
    variant === "priority" ? (PRIORITY[upper] ?? D) :
    (STATUS[upper] ?? RISK[upper] ?? PRIORITY[upper] ?? D);

  const showDot = dot ?? DOT_STATUSES.has(upper);

  return (
    <span
      className={className}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "2px 8px 2px 7px", borderRadius: 5,
        fontSize: 9.5, fontFamily: "var(--wr-font-mono)",
        fontWeight: 600, letterSpacing: "0.10em",
        textTransform: "uppercase", whiteSpace: "nowrap",
        backgroundColor: s.bg, color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {showDot && (
        <span style={{
          width: 4.5, height: 4.5, borderRadius: "50%",
          background: s.color, flexShrink: 0,
          opacity: 0.85,
        }} />
      )}
      {display}
    </span>
  );
}
