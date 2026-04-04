import { useState, useEffect } from "react";
import { Mail, Lock, CheckCircle, AlertCircle, Eye, EyeOff, Shield } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useI18n } from "../hooks/useI18n";

const LOGO = "data:image/png;base64,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";

type Step = "request" | "sent" | "confirm" | "done" | "error";

export function ResetPasswordPage() {
  const { t } = useI18n();
  const [step, setStep]             = useState<Step>("request");
  const [email, setEmail]           = useState("");
  const [token, setToken]           = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) { setToken(t); setStep("confirm"); }
  }, []);

  const requestMutation = trpc.auth.requestReset.useMutation({
    onSuccess: () => setStep("sent"),
    onError:   (e: { message: string }) => setError(e.message),
  });

  const confirmMutation = trpc.auth.confirmReset.useMutation({
    onSuccess: () => setStep("done"),
    onError:   (e: { message: string }) => { setError(e.message); setStep("error"); },
  });

  function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    requestMutation.mutate({ email });
  }

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPwd !== confirmPwd) { setError("Les mots de passe ne correspondent pas"); return; }
    confirmMutation.mutate({ token, newPassword: newPwd });
  }

  const inputCls = [
    "w-full px-3 py-2.5 rounded-md text-sm font-mono",
    "bg-[#161b22] border border-[#30363d] text-[#e6edf3]",
    "placeholder-[#484f58] outline-none",
    "focus:border-[#D4AF37] transition-colors duration-150",
  ].join(" ");

  const STATS = [
    { value: "11",     label: "Règles AML" },
    { value: "KYC-12", label: "Conformité" },
    { value: "SCR-14", label: "Screening"  },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--wr-bg)", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Logo + identité */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img
            src={LOGO}
            alt="KYC-Lab Logo"
            style={{ height: 64, width: "auto", objectFit: "contain", marginBottom: 16, display: "inline-block" }}
          />
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center", marginBottom: 8 }}>
            <Shield size={13} style={{ color: "rgba(212,175,55,0.7)" }} />
            <span style={{ fontSize: 10, fontFamily: "monospace", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(212,175,55,0.65)" }}>
              Plateforme LAB-FT / KYC
            </span>
            <Shield size={13} style={{ color: "rgba(212,175,55,0.7)" }} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--wr-sidebar-text-1)", margin: "0 0 6px", letterSpacing: "-0.01em" }}>
            KYC-Lab Platform
          </h1>
          <p style={{ fontSize: 12, color: "rgba(180,196,216,0.55)", fontFamily: "monospace", margin: 0, lineHeight: 1.5 }}>
            Système de conformité réglementaire — Loi 43-05 / BAM 5/W/2023
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 28 }}>
          {STATS.map(({ value, label }) => (
            <div key={label} style={{ background: "rgba(212,175,55,0.04)", border: "1px solid rgba(212,175,55,0.1)", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(212,175,55,0.75)", fontFamily: "monospace" }}>{value}</div>
              <div style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(180,196,216,0.3)", marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Card */}
        <div style={{ background: "var(--wr-sidebar-bg, #161b22)", border: "1px solid rgba(48,54,61,0.8)", borderRadius: 12, padding: "28px 24px" }}>

          {/* ── Étape 1 : Saisir l'email ── */}
          {step === "request" && (
            <form onSubmit={handleRequest} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "8px 12px", background: "rgba(212,175,55,0.05)", border: "1px solid rgba(212,175,55,0.12)", borderRadius: 8 }}>
                  <Mail size={16} style={{ color: "#D4AF37" }} />
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--wr-text-1)", margin: 0 }}>Réinitialisation du mot de passe</h2>
                </div>
                <p style={{ fontSize: 11, color: "var(--wr-text-3)", fontFamily: "monospace", margin: 0, paddingLeft: 2 }}>
                  Saisissez votre email — vous recevrez un lien valable 15 minutes.
                </p>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(212,175,55,0.5)", marginBottom: 8 }}>
                  {t.auth.email}
                </label>
                <input
                  type="email" value={email} required autoFocus
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  className={inputCls}
                  placeholder="analyste@domaine.ma"
                />
              </div>

              {error && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8 }}>
                  <AlertCircle size={13} style={{ color: "#F87171", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#F87171", fontFamily: "monospace" }}>{error}</span>
                </div>
              )}

              <button type="submit" disabled={requestMutation.isPending}
                style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: "none", background: requestMutation.isPending ? "rgba(212,175,55,0.3)" : "#D4AF37", color: "#1A2B4B", fontSize: 13, fontWeight: 700, cursor: requestMutation.isPending ? "not-allowed" : "pointer", fontFamily: "monospace", letterSpacing: "0.05em", transition: "background 0.15s" }}>
                {requestMutation.isPending ? t.common.loading : t.auth.sendResetLink}
              </button>

              <a href="/login" style={{ display: "block", textAlign: "center", fontSize: 11, fontFamily: "monospace", color: "var(--wr-text-3)", textDecoration: "none" }}>
                ← {t.auth.backToLogin}
              </a>
            </form>
          )}

          {/* ── Étape 2 : Email envoyé ── */}
          {step === "sent" && (
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                <Mail size={24} style={{ color: "#34d399" }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--wr-text-1)", fontFamily: "monospace", margin: "0 0 6px" }}>{t.auth.resetEmailSent}</p>
                <p style={{ fontSize: 11, fontFamily: "monospace", color: "var(--wr-text-3)", margin: 0 }}>{t.auth.resetEmailHint}</p>
              </div>
              <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(180,196,216,0.35)" }}>{t.auth.resetSpamHint}</p>
              <a href="/login" style={{ fontSize: 11, fontFamily: "monospace", color: "#D4AF37", textDecoration: "none" }}>{t.auth.backToLogin}</a>
            </div>
          )}

          {/* ── Étape 3 : Nouveau mot de passe ── */}
          {step === "confirm" && (
            <form onSubmit={handleConfirm} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "8px 12px", background: "rgba(212,175,55,0.05)", border: "1px solid rgba(212,175,55,0.12)", borderRadius: 8 }}>
                  <Lock size={16} style={{ color: "#D4AF37" }} />
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--wr-text-1)", margin: 0 }}>Nouveau mot de passe</h2>
                </div>
                <p style={{ fontSize: 11, color: "var(--wr-text-3)", fontFamily: "monospace", margin: 0, paddingLeft: 2 }}>
                  Choisissez un mot de passe fort pour sécuriser votre compte.
                </p>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(212,175,55,0.5)", marginBottom: 8 }}>
                  {t.auth.newPassword}
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPwd ? "text" : "password"}
                    value={newPwd} required minLength={8} autoFocus
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPwd(e.target.value)}
                    className={`${inputCls} pr-10`}
                    placeholder={t.auth.passwordHint}
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--wr-text-3)", padding: 0 }}>
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(212,175,55,0.5)", marginBottom: 8 }}>
                  {t.auth.confirmPasswordLabel}
                </label>
                <input
                  type={showPwd ? "text" : "password"}
                  value={confirmPwd} required
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPwd(e.target.value)}
                  className={inputCls}
                  placeholder="••••••••"
                />
              </div>

              {newPwd.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {[
                    { ok: newPwd.length >= 8,   label: t.auth.passwordMin8 },
                    { ok: /[A-Z]/.test(newPwd), label: t.auth.passwordUppercase },
                    { ok: /[0-9]/.test(newPwd), label: t.auth.passwordDigit },
                  ].map(({ ok, label }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? "#34d399" : "#30363d", flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: ok ? "#34d399" : "rgba(180,196,216,0.35)" }}>{label}</span>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8 }}>
                  <AlertCircle size={13} style={{ color: "#F87171", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#F87171", fontFamily: "monospace" }}>{error}</span>
                </div>
              )}

              <button type="submit" disabled={confirmMutation.isPending || newPwd.length < 8}
                style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: "none", background: (confirmMutation.isPending || newPwd.length < 8) ? "rgba(212,175,55,0.3)" : "#D4AF37", color: "#1A2B4B", fontSize: 13, fontWeight: 700, cursor: (confirmMutation.isPending || newPwd.length < 8) ? "not-allowed" : "pointer", fontFamily: "monospace", letterSpacing: "0.05em", transition: "background 0.15s" }}>
                {confirmMutation.isPending ? t.common.loading : t.auth.updatePassword}
              </button>
            </form>
          )}

          {/* ── Étape 4 : Succès ── */}
          {step === "done" && (
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                <CheckCircle size={24} style={{ color: "#34d399" }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--wr-text-1)", fontFamily: "monospace", margin: "0 0 6px" }}>{t.auth.passwordUpdated}</p>
                <p style={{ fontSize: 11, fontFamily: "monospace", color: "var(--wr-text-3)", margin: 0 }}>{t.auth.passwordUpdatedDesc}</p>
              </div>
              <a href="/login"
                style={{ display: "block", width: "100%", padding: "10px 16px", borderRadius: 8, background: "#D4AF37", color: "#1A2B4B", fontSize: 13, fontWeight: 700, fontFamily: "monospace", textDecoration: "none", textAlign: "center" }}>
                {t.auth.login}
              </a>
            </div>
          )}

          {/* ── Étape 5 : Erreur token ── */}
          {step === "error" && (
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                <AlertCircle size={24} style={{ color: "#F87171" }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#F87171", fontFamily: "monospace", margin: "0 0 6px" }}>{t.auth.invalidLink}</p>
                <p style={{ fontSize: 11, fontFamily: "monospace", color: "var(--wr-text-3)", margin: 0 }}>{error}</p>
              </div>
              <button onClick={() => { setStep("request"); setError(null); setToken(""); }}
                style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(48,54,61,0.8)", background: "none", color: "var(--wr-text-3)", fontSize: 13, fontFamily: "monospace", cursor: "pointer", transition: "color 0.15s" }}>
                {t.auth.requestNewLink}
              </button>
              <a href="/login" style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(180,196,216,0.4)", textDecoration: "none" }}>{t.auth.backToLogin}</a>
            </div>
          )}

        </div>

        <p style={{ textAlign: "center", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--wr-text-4)", marginTop: 20 }}>
          Accès restreint — Système de conformité réglementaire
        </p>
      </div>
    </div>
  );
}
