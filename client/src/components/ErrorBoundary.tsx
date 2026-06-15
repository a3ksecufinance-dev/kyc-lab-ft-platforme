import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: "100vh", padding: 40,
          background: "var(--wr-bg, #0a0f1a)",
          fontFamily: "var(--wr-font-mono, monospace)",
        }}>
          <div style={{
            maxWidth: 480, textAlign: "center",
            background: "var(--wr-card, #111827)",
            border: "1px solid var(--wr-border, #1f2937)",
            borderRadius: 12, padding: "40px 32px",
          }}>
            <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.6 }}>⚠</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--wr-text-1, #e4eef8)", margin: "0 0 8px" }}>
              Une erreur inattendue est survenue
            </h1>
            <p style={{ fontSize: 12, color: "var(--wr-text-3, #6b88a6)", margin: "0 0 20px", lineHeight: 1.6 }}>
              L'application a rencontré un problème. Veuillez rafraîchir la page.
            </p>
            {this.state.error && (
              <pre style={{
                fontSize: 10, color: "var(--wr-red, #f87171)",
                background: "rgba(248,113,113,0.06)",
                border: "1px solid rgba(248,113,113,0.15)",
                borderRadius: 6, padding: "10px 14px",
                textAlign: "left", overflow: "auto", maxHeight: 120,
                margin: "0 0 20px", whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 24px", fontSize: 12, fontWeight: 600,
                borderRadius: 8, cursor: "pointer",
                background: "rgba(201,162,39,0.12)",
                border: "1px solid rgba(201,162,39,0.35)",
                color: "var(--wr-gold, #c9a227)",
              }}
            >
              Rafraîchir la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
