import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label:   string;
  value:   string | number;
  sub?:    string;
  icon?:   LucideIcon;
  accent?: "default" | "danger" | "warning" | "success";
}

const ACCENT_TOP: Record<string, string> = {
  default: "linear-gradient(90deg, var(--wr-gold), rgba(212,175,55,0.05))",
  danger:  "linear-gradient(90deg, #F87171, rgba(248,113,113,0.05))",
  warning: "linear-gradient(90deg, #FB923C, rgba(251,146,60,0.05))",
  success: "linear-gradient(90deg, #34D399, rgba(52,211,153,0.05))",
};

const ICON_COLORS: Record<string, { bg: string; color: string }> = {
  default: { bg: "var(--wr-accent-muted)",     color: "var(--wr-gold)" },
  danger:  { bg: "rgba(248,113,113,0.1)",       color: "var(--wr-red)" },
  warning: { bg: "rgba(251,146,60,0.1)",        color: "var(--wr-amber)" },
  success: { bg: "rgba(52,211,153,0.1)",        color: "var(--wr-green)" },
};

const VALUE_COLORS: Record<string, string> = {
  default: "var(--wr-text-1)",
  danger:  "var(--wr-red)",
  warning: "var(--wr-amber)",
  success: "var(--wr-green)",
};

export function StatCard({ label, value, sub, icon: Icon, accent = "default" }: StatCardProps) {
  const ic = ICON_COLORS[accent] ?? ICON_COLORS["default"]!;
  return (
    <div style={{
      position: "relative",
      background: "var(--wr-card)",
      border: "1px solid var(--wr-border)",
      borderRadius: 10,
      padding: "16px 18px",
      overflow: "hidden",
      cursor: "default",
      transition: "border-color 0.2s, box-shadow 0.2s",
      boxShadow: "var(--wr-shadow-sm)",
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLElement).style.borderColor = "var(--wr-accent-border)";
      (e.currentTarget as HTMLElement).style.boxShadow = "var(--wr-shadow-md)";
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLElement).style.borderColor = "var(--wr-border)";
      (e.currentTarget as HTMLElement).style.boxShadow = "var(--wr-shadow-sm)";
    }}
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
            fontFamily: "var(--wr-font-mono)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--wr-text-3)",
            margin: "0 0 10px",
          }}>
            {label}
          </p>

          {/* Valeur */}
          <p style={{
            fontSize: 28,
            fontWeight: 600,
            fontFamily: "var(--wr-font-serif)",
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
              fontFamily: "var(--wr-font-mono)",
              color: "var(--wr-text-4)",
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
