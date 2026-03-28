import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label:   string;
  value:   string | number;
  sub?:    string;
  icon?:   LucideIcon;
  accent?: "default" | "danger" | "warning" | "success";
}

const ACCENT_TOP: Record<string, string> = {
  default: "linear-gradient(90deg, #D4AF37, rgba(212,175,55,0.05))",
  danger:  "linear-gradient(90deg, #F87171, rgba(248,113,113,0.05))",
  warning: "linear-gradient(90deg, #FB923C, rgba(251,146,60,0.05))",
  success: "linear-gradient(90deg, #34D399, rgba(52,211,153,0.05))",
};

const ICON_COLORS: Record<string, { bg: string; color: string }> = {
  default: { bg: "rgba(212,175,55,0.1)",  color: "#D4AF37" },
  danger:  { bg: "rgba(248,113,113,0.1)", color: "#F87171" },
  warning: { bg: "rgba(251,146,60,0.1)",  color: "#FB923C" },
  success: { bg: "rgba(52,211,153,0.1)",  color: "#34D399" },
};

const VALUE_COLORS: Record<string, string> = {
  default: "#D8E8F8",
  danger:  "#F87171",
  warning: "#FB923C",
  success: "#34D399",
};

export function StatCard({ label, value, sub, icon: Icon, accent = "default" }: StatCardProps) {
  const ic = ICON_COLORS[accent];
  return (
    <div style={{
      position: "relative",
      background: "#1E2A40",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10,
      padding: "16px 18px",
      overflow: "hidden",
      cursor: "default",
      transition: "border-color 0.2s",
    }}
    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "rgba(212,175,55,0.18)")}
    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)")}
    >
      {/* Barre accent haut */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: ACCENT_TOP[accent],
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Label */}
          <p style={{
            fontSize: 10,
            fontFamily: "monospace",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#3A5070",
            margin: "0 0 10px",
          }}>
            {label}
          </p>

          {/* Valeur */}
          <p style={{
            fontSize: 28,
            fontWeight: 600,
            fontFamily: "'Playfair Display', Georgia, serif",
            color: VALUE_COLORS[accent],
            lineHeight: 1,
            margin: "0 0 6px",
            letterSpacing: "-0.5px",
          }}>
            {value}
          </p>

          {/* Sous-titre */}
          {sub && (
            <p style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: "#2E4260",
              margin: 0,
            }}>
              {sub}
            </p>
          )}
        </div>

        {/* Icône */}
        {Icon && (
          <div style={{
            width: 36, height: 36,
            borderRadius: 8,
            background: ic.bg,
            border: `1px solid ${ic.color}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <Icon size={15} style={{ color: ic.color }} />
          </div>
        )}
      </div>
    </div>
  );
}
