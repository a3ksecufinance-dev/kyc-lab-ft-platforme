import { useState, useEffect } from "react";
import { Shield, Mail, Lock, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useI18n } from "../hooks/useI18n";

type Step = "request" | "sent" | "confirm" | "done" | "error";

export function ResetPasswordPage() {
  const { t } = useI18n();
  const [step, setStep]         = useState<Step>("request");
  const [email, setEmail]       = useState("");
  const [token, setToken]       = useState("");
  const [newPwd, setNewPwd]     = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Lire le token dans l'URL (?token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) {
      setToken(t);
      setStep("confirm");
    }
  }, []);

  const requestMutation = trpc.auth.requestReset.useMutation({
    onSuccess: () => setStep("sent"),
    onError:   (e: { message: string }) => setError(e.message),
  });

  const confirmMutation = trpc.auth.confirmReset.useMutation({
    onSuccess: () => setStep("done"),
    onError:   (e: { message: string }) => {
      setError(e.message);
      setStep("error");
    },
  });

  const inputCls = "w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-[#e6edf3] font-mono placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/60 focus:ring-1 focus:ring-[#58a6ff]/20 transition-colors";

  function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    requestMutation.mutate({ email });
  }

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPwd !== confirmPwd) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    confirmMutation.mutate({ token, newPassword: newPwd });
  }

  return (
    <div className="min-h-screen bg-[#080c10] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(#58a6ff 1px, transparent 1px), linear-gradient(90deg, #58a6ff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#1f6feb]/15 border border-[#1f6feb]/30 flex items-center justify-center mb-4">
            <Shield size={22} className="text-[#58a6ff]" />
          </div>
          <h1 className="text-xl font-semibold text-[#e6edf3] font-mono">LabFT</h1>
          <p className="text-[#7d8590] text-sm mt-1 font-mono">{t.auth.resetPassword}</p>
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-xl p-6">

          {/* ── Étape 1 : Saisir l'email ── */}
          {step === "request" && (
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="text-center mb-2">
                <Mail size={28} className="text-[#484f58] mx-auto mb-2" />
                <p className="text-xs font-mono text-[#7d8590]">
                  Saisissez votre email — vous recevrez un lien valable 15 minutes
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
                  {t.auth.email}
                </label>
                <input
                  type="email" value={email} required autoFocus
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                    setEmail(e.target.value)}
                  className={inputCls}
                  placeholder="analyste@domaine.com"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-400/10 border border-red-400/20 rounded-md">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-400 font-mono">{error}</p>
                </div>
              )}

              <button type="submit" disabled={requestMutation.isPending}
                className="w-full py-2.5 bg-[#1f6feb] hover:bg-[#388bfd] disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors font-mono">
                {requestMutation.isPending ? t.common.loading : t.auth.sendResetLink}
              </button>

              <a href="/login"
                className="block text-center text-xs font-mono text-[#484f58] hover:text-[#7d8590] mt-2">
                ← {t.auth.backToLogin}
              </a>
            </form>
          )}

          {/* ── Étape 2 : Email envoyé ── */}
          {step === "sent" && (
            <div className="text-center space-y-4 py-2">
              <div className="w-14 h-14 rounded-full bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto">
                <Mail size={24} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#e6edf3] font-mono">{t.auth.resetEmailSent}</p>
                <p className="text-xs font-mono text-[#7d8590] mt-1">
                  {t.auth.resetEmailHint}
                </p>
              </div>
              <p className="text-[10px] font-mono text-[#484f58]">
                {t.auth.resetSpamHint}
              </p>
              <a href="/login"
                className="block text-xs font-mono text-[#58a6ff] hover:underline">
                {t.auth.backToLogin}
              </a>
            </div>
          )}

          {/* ── Étape 3 : Saisir le nouveau mot de passe ── */}
          {step === "confirm" && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div className="text-center mb-2">
                <Lock size={28} className="text-[#484f58] mx-auto mb-2" />
                <p className="text-xs font-mono text-[#7d8590]">
                  Choisissez un nouveau mot de passe
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
                  {t.auth.newPassword}
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={newPwd} required minLength={8} autoFocus
                    onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                      setNewPwd(e.target.value)}
                    className={`${inputCls} pr-10`}
                    placeholder={t.auth.passwordHint}
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#7d8590]">
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
                  {t.auth.confirmPasswordLabel}
                </label>
                <input
                  type={showPwd ? "text" : "password"}
                  value={confirmPwd} required
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                    setConfirmPwd(e.target.value)}
                  className={inputCls}
                  placeholder="••••••••"
                />
              </div>

              {/* Indicateurs de force */}
              {newPwd.length > 0 && (
                <div className="space-y-1">
                  {[
                    { ok: newPwd.length >= 8,   label: t.auth.passwordMin8 },
                    { ok: /[A-Z]/.test(newPwd), label: t.auth.passwordUppercase },
                    { ok: /[0-9]/.test(newPwd), label: t.auth.passwordDigit },
                  ].map(({ ok, label }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-[#30363d]"}`} />
                      <span className={`text-[10px] font-mono ${ok ? "text-emerald-400" : "text-[#484f58]"}`}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-400/10 border border-red-400/20 rounded-md">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-400 font-mono">{error}</p>
                </div>
              )}

              <button type="submit"
                disabled={confirmMutation.isPending || newPwd.length < 8}
                className="w-full py-2.5 bg-[#1f6feb] hover:bg-[#388bfd] disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors font-mono">
                {confirmMutation.isPending ? t.common.loading : t.auth.updatePassword}
              </button>
            </form>
          )}

          {/* ── Étape 4 : Succès ── */}
          {step === "done" && (
            <div className="text-center space-y-4 py-2">
              <div className="w-14 h-14 rounded-full bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto">
                <CheckCircle size={24} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#e6edf3] font-mono">{t.auth.passwordUpdated}</p>
                <p className="text-xs font-mono text-[#7d8590] mt-1">
                  {t.auth.passwordUpdatedDesc}
                </p>
              </div>
              <a href="/login"
                className="block w-full py-2.5 bg-[#1f6feb] hover:bg-[#388bfd] text-white text-sm font-medium rounded-md transition-colors font-mono text-center">
                {t.auth.login}
              </a>
            </div>
          )}

          {/* ── Étape 5 : Erreur token expiré ── */}
          {step === "error" && (
            <div className="text-center space-y-4 py-2">
              <div className="w-14 h-14 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto">
                <AlertCircle size={24} className="text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-red-400 font-mono">{t.auth.invalidLink}</p>
                <p className="text-xs font-mono text-[#7d8590] mt-1">{error}</p>
              </div>
              <button onClick={() => { setStep("request"); setError(null); setToken(""); }}
                className="block w-full py-2.5 border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] text-sm font-mono rounded-md transition-colors">
                {t.auth.requestNewLink}
              </button>
              <a href="/login"
                className="block text-xs font-mono text-[#484f58] hover:text-[#7d8590]">
                {t.auth.backToLogin}
              </a>
            </div>
          )}
        </div>

        <p className="text-center text-[10px] font-mono text-[#484f58] mt-4">
          Accès restreint — Système de conformité réglementaire
        </p>
      </div>
    </div>
  );
}
