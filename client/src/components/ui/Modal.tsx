import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  "aria-label"?: string;
  children: ReactNode;
  width?: number | string;
  maxHeight?: string;
}

export function Modal({ open, onClose, "aria-label": ariaLabel, children, width = 480, maxHeight = "90vh" }: ModalProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{ background: "var(--wr-card)", border: "1px solid var(--wr-border)", borderRadius: 12, width, maxHeight, overflowY: "auto" }}
      >
        {children}
      </div>
    </div>
  );
}
