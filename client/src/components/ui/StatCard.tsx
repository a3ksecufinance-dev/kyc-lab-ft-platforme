import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label:   string;
  value:   string | number;
  sub?:    string;
  icon?:   LucideIcon;
  accent?: "default" | "danger" | "warning" | "success";
  trend?:  "up" | "down" | "flat";
}

const ACCENT_LINE: Record<string, string> = {
  default: "linear-gradient(90deg, #14B8A6, rgba(20,184,166,0.06))",
  danger:  "linear-gradient(90deg, #FF6570, rgba(255,101,112,0.06))",
  warning: "linear-gradient(90deg, #F59E0B, rgba(245,158,11,0.06))",
  success: "linear-gradient(90deg, #2DD4A0, rgba(45,212,160,0.06))",
};

const ACCENT_GLOW: Record<string, string> = {
  default: "rgba(20,184,166,0.12)",
  danger:  "rgba(255,101,112,0.10)",
  warning: "rgba(245,158,11,0.10)",
  success: "rgba(45,212,160,0.10)",
};

const ICON_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  default: { bg: "rgba(20,184,166,0.10)",   color: "#14B8A6",  border: "rgba(20,184,166,0.22)"  },
  danger:  { bg: "rgba(255,101,112,0.09)",  color: "#FF6570",  border: "rgba(255,101,112,0.18)" },
  warning: { bg: "rgba(245,158,11,0.09)",   color: "#F59E0B",  border: "rgba(245,158,11,0.18)"  },
  success: { bg: "rgba(45,212,160,0.09)",   color: "#2DD4A0",  border: "rgba(45,212,160,0.18)"  },
};

const VALUE_COLORS: Record<string, string> = {
  default: "var(--wr-text-1)",
  danger:  "#FF6570",
  warning: "#F59E0B",
  success: "#2DD4A0",
};

const HOVER_BORDER: Record<string, string> = {
  default: "rgba(20,184,166,0.28)",
  danger:  "rgba(255,101,112,0.22)",
  warning: "rgba(245,158,11,0.22)",
  success: "rgba(45,212,160,0.22)",
};

export function StatCard({ label, value, sub, icon: Icon, accent = "default" }: StatCardProps) {
  const ic   = ICON_STYLES[accent]   ?? ICON_STYLES["default"]!;
  const glow = ACCENT_GLOW[accent]   ?? ACCENT_GLOW["default"]!;
  const hBorder = HOVER_BORDER[accent] ?? HOVER_BORDER["default"]!;

  return (
    <div
      style={{
        position: "relative",
        background: "var(--wr-card)",
        border: "1px solid var(--wr-border)",
        borderRadius: 11,
        padding: "18px 18px 16px",
        overflow: "hidden",
        cursor: "default",
        transition: "border-color 0.2s, box-shadow 0.2s, transform 0.2s",
        boxShadow: "var(--wr-shadow-sm), var(--wr-shadow-inset)",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = hBorder;
        el.style.boxShadow = `0 0 0 1px ${glow}, var(--wr-shadow-md), var(--wr-shadow-inset)`;
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "var(--wr-border)";
        el.style.boxShadow = "var(--wr-shadow-sm), var(--wr-shadow-inset)";
        el.style.transform = "translateY(0)";
      }}
    >
      {/* Top accent line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: ACCENT_LINE[accent],
      }} />

      {/* Background gradient glow */}
      <div style={{
        position: "absolute", top: 0, left: 0, width: "60%", height: "100%",
        background: `radial-gradient(ellipse at 0% 0%, ${glow} 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, position: "relative" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Label */}
          <p style={{
            fontSize: 9.5,
            fontFamily: "var(--wr-font-mono)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--wr-text-3)",
            margin: "0 0 12px",
            fontWeight: 600,
          }}>
            {label}
          </p>

          {/* Value */}
          <p style={{
            fontSize: 30,
            fontWeight: 700,
            fontFamily: "var(--wr-font-sans)",
            color: VALUE_COLORS[accent],
            lineHeight: 1,
            margin: "0 0 8px",
            letterSpacing: "-1px",
          }}>
            {value}
          </p>

          {/* Sub */}
          {sub && (
            <p style={{
              fontSize: 10.5,
              fontFamily: "var(--wr-font-mono)",
              color: "var(--wr-text-4)",
              margin: 0,
              letterSpacing: "0.02em",
            }}>
              {sub}
            </p>
          )}
        </div>

        {/* Icon */}
        {Icon && (
          <div style={{
            width: 38, height: 38,
            borderRadius: 9,
            background: ic.bg,
            border: `1px solid ${ic.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <Icon size={16} style={{ color: ic.color }} />
          </div>
        )}
      </div>
    </div>
  );
}
