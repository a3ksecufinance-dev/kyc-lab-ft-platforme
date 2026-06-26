import { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning" | "gold";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";
  style?: React.CSSProperties;
  ariaLabel?: string;
  "aria-label"?: string;
}

const VARIANT_STYLES: Record<Variant, { bg: string; border: string; color: string; hoverBg: string }> = {
  primary:   { bg: "rgba(74,158,255,0.12)",  border: "rgba(74,158,255,0.35)",  color: "var(--wr-blue)",  hoverBg: "rgba(74,158,255,0.2)"  },
  secondary: { bg: "transparent",             border: "var(--wr-border2)",      color: "var(--wr-text-2)", hoverBg: "var(--wr-hover)"       },
  ghost:     { bg: "transparent",             border: "transparent",            color: "var(--wr-text-3)", hoverBg: "var(--wr-hover)"       },
  danger:    { bg: "rgba(248,113,113,0.10)",  border: "rgba(248,113,113,0.30)", color: "var(--wr-red)",   hoverBg: "rgba(248,113,113,0.18)" },
  success:   { bg: "rgba(52,211,153,0.10)",   border: "rgba(52,211,153,0.30)",  color: "var(--wr-green)", hoverBg: "rgba(52,211,153,0.18)"  },
  warning:   { bg: "rgba(251,191,36,0.08)",   border: "rgba(251,191,36,0.25)",  color: "var(--wr-amber)", hoverBg: "rgba(251,191,36,0.15)"  },
  gold:      { bg: "rgba(20,184,166,0.10)",   border: "rgba(20,184,166,0.32)",  color: "var(--wr-accent)", hoverBg: "rgba(20,184,166,0.18)"  },
};

const SIZE_STYLES: Record<Size, { padding: string; fontSize: number; gap: number; iconSize: number }> = {
  sm: { padding: "3px 8px",   fontSize: 10, gap: 4, iconSize: 10 },
  md: { padding: "7px 14px",  fontSize: 12, gap: 6, iconSize: 13 },
  lg: { padding: "10px 18px", fontSize: 13, gap: 7, iconSize: 15 },
};

export function Button({
  children, onClick, disabled = false,
  variant = "secondary", size = "md",
  icon: Icon, iconPosition = "left",
  fullWidth = false, type = "button", style,
  ariaLabel, "aria-label": ariaLabelProp,
}: ButtonProps) {
  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? ariaLabelProp}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: s.gap,
        padding: s.padding,
        fontSize: s.fontSize,
        fontFamily: "var(--wr-font-mono)",
        fontWeight: 600,
        borderRadius: 7,
        border: `1px solid ${v.border}`,
        background: v.bg,
        color: v.color,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background 0.15s, opacity 0.15s",
        width: fullWidth ? "100%" : undefined,
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = v.hoverBg; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = v.bg; }}
    >
      {Icon && iconPosition === "left"  && <Icon size={s.iconSize} />}
      {children}
      {Icon && iconPosition === "right" && <Icon size={s.iconSize} />}
    </button>
  );
}
