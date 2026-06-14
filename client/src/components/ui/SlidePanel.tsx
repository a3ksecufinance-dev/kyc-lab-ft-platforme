import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

export function SlidePanel({ open, onClose, title, sub, width = 480, children, footer }: SlidePanelProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(3px)",
          zIndex: 300,
          animation: "wr-fade-in 0.18s ease",
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: Math.min(width, window.innerWidth - 48),
          background: "var(--wr-card)",
          borderLeft: "1px solid var(--wr-border)",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.35)",
          zIndex: 301,
          display: "flex",
          flexDirection: "column",
          animation: "wr-slide-in 0.22s cubic-bezier(.4,0,.2,1)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid var(--wr-border)",
          flexShrink: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          background: "linear-gradient(180deg, var(--wr-hover) 0%, transparent 100%)",
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{
              fontSize: 14, fontWeight: 600,
              color: "var(--wr-text-1)",
              margin: 0,
              fontFamily: "var(--wr-font-serif)",
              letterSpacing: "-0.2px",
            }}>
              {title}
            </h2>
            {sub && (
              <p style={{
                fontSize: 11,
                fontFamily: "var(--wr-font-mono)",
                color: "var(--wr-text-4)",
                margin: "3px 0 0",
                letterSpacing: "0.03em",
              }}>
                {sub}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              border: "1px solid var(--wr-border2)",
              background: "transparent",
              color: "var(--wr-text-3)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--wr-red)";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(248,113,113,0.35)";
              (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.08)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--wr-text-3)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--wr-border2)";
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "18px 20px",
        }}>
          {children}
        </div>

        {/* Footer — optional */}
        {footer && (
          <div style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--wr-border)",
            flexShrink: 0,
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            background: "var(--wr-hover)",
          }}>
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes wr-fade-in  { from { opacity: 0; }              to { opacity: 1; } }
        @keyframes wr-slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </>
  );
}
