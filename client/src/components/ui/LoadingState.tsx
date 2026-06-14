interface LoadingStateProps {
  message?: string;
  compact?: boolean;
}

export function LoadingState({ message = "Loading…", compact = false }: LoadingStateProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: compact ? "12px 0" : "40px 0",
      gap: 8,
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: "50%",
        border: "2px solid var(--wr-border2)",
        borderTopColor: "var(--wr-gold)",
        display: "inline-block",
        animation: "spin 0.8s linear infinite",
      }} />
      <span style={{
        fontSize: 11,
        fontFamily: "var(--wr-font-mono)",
        color: "var(--wr-text-3)",
        letterSpacing: "0.04em",
      }}>
        {message}
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
