import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  sub?: string;
  iconSize?: number;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, message, sub, iconSize = 24, compact = false }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: compact ? "24px 0" : "48px 0",
      textAlign: "center",
    }}>
      {Icon && (
        <Icon
          size={iconSize}
          style={{ color: "var(--wr-text-4)", opacity: 0.45, marginBottom: compact ? 8 : 12, display: "block" }}
        />
      )}
      <p style={{
        fontSize: compact ? 11 : 12,
        fontFamily: "var(--wr-font-mono)",
        color: "var(--wr-text-3)",
        margin: "0",
        fontWeight: 500,
      }}>
        {message}
      </p>
      {sub && (
        <p style={{
          fontSize: 10,
          fontFamily: "var(--wr-font-mono)",
          color: "var(--wr-text-4)",
          margin: "4px 0 0",
        }}>
          {sub}
        </p>
      )}
    </div>
  );
}
