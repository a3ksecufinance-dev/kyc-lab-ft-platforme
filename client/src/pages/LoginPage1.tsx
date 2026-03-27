import { useState } from "react";
import { Shield, Eye, EyeOff, AlertCircle, Smartphone } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

type Step = "credentials" | "mfa";

export function LoginPage() {
  const { login, completeMfaLogin } = useAuth();

  // Étape 1 — identifiants
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // Étape 2 — MFA
  const [step, setStep]       = useState<Step>("credentials");
  const [mfaUserId, setMfaUserId] = useState<number | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputCls = "w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2.5 text-sm text-[#e6edf3] font-mono placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/60 focus:ring-1 focus:ring-[#58a6ff]/20 transition-colors";

  // ── Étape 1 : email + mot de passe ────────────────────────────────────────
  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired && result.userId) {
        setMfaUserId(result.userId);
        setStep("mfa");
      }
      // Si mfaRequired=false → useAuth a déjà stocké les tokens → redirect auto
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Identifiants invalides");
    } finally {
      setLoading(false);
    }
  }

  // ── Étape 2 : code MFA ────────────────────────────────────────────────────
  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaUserId) return;
    setError(null);
    setLoading(true);
    try {
      await completeMfaLogin(mfaUserId, mfaCode);
      // completeMfaLogin stocke les tokens → App redirige automatiquement
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Code invalide");
      setMfaCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080c10] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: "linear-gradient(#58a6ff 1px, transparent 1px), linear-gradient(90deg, #58a6ff 1px, transparent 1px)", backgroundSize: "40px 40px" }}
      />

      <div className="relative w-full max-w-sm animate-slide-in">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className={`w-12 h-12 rounded-xl border flex items-center justify-center mb-4 ${
            step === "mfa"
              ? "bg-purple-400/15 border-purple-400/30"
              : "bg-[#1f6feb]/15 border-[#1f6feb]/30"
          }`}>
            {step === "mfa"
              ? <Smartphone size={22} className="text-purple-400" />
              : <Shield     size={22} className="text-[#58a6ff]" />
            }
          </div>
          <h1 className="text-xl font-semibold text-[#e6edf3] font-mono">LabFT</h1>
          <p className="text-[#7d8590] text-sm mt-1 font-mono">
            {step === "mfa" ? "Vérification en 2 étapes" : "Plateforme KYC / AML"}
          </p>
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-xl p-6">

          {/* ── Étape 1 : Identifiants ── */}
          {step === "credentials" && (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
                  Adresse email
                </label>
                <input
                  type="email" value={email} required
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setEmail(e.target.value)}
                  className={inputCls} placeholder="analyste@domaine.com"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={password} required
                    onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setPassword(e.target.value)}
                    className={`${inputCls} pr-10`} placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#7d8590]">
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-400/10 border border-red-400/20 rounded-md">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-400 font-mono">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 px-4 bg-[#1f6feb] hover:bg-[#388bfd] disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors font-mono">
                {loading ? "Connexion..." : "Se connecter"}
              </button>

              <div className="text-center">
                <a href="/reset-password"
                  className="text-xs font-mono text-[#484f58] hover:text-[#7d8590] transition-colors">
                  Mot de passe oublié ?
                </a>
              </div>
            </form>
          )}

          {/* ── Étape 2 : Code MFA ── */}
          {step === "mfa" && (
            <form onSubmit={handleMfa} className="space-y-4">
              <div className="bg-purple-400/10 border border-purple-400/20 rounded-lg p-3 text-center">
                <p className="text-xs font-mono text-purple-400">
                  Saisissez le code à 6 chiffres de votre application d'authentification
                </p>
                <p className="text-[10px] font-mono text-[#484f58] mt-1">
                  Google Authenticator · Authy · Bitwarden
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">
                  Code MFA
                </label>
                <input
                  type="text" value={mfaCode} required
                  autoFocus maxLength={8}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                    setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={`${inputCls} text-center tracking-[0.4em] text-lg`}
                  placeholder="000000"
                />
                <p className="text-[10px] font-mono text-[#484f58] mt-1 text-center">
                  Ou saisissez un code de secours à 8 caractères
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-400/10 border border-red-400/20 rounded-md">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-400 font-mono">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading || mfaCode.length < 6}
                className="w-full py-2.5 px-4 bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors font-mono">
                {loading ? "Vérification..." : "Vérifier"}
              </button>

              <button type="button" onClick={() => { setStep("credentials"); setError(null); setMfaCode(""); }}
                className="w-full py-2 text-xs font-mono text-[#484f58] hover:text-[#7d8590]">
                ← Retour à la connexion
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[10px] font-mono text-[#484f58] mt-4">
          Accès restreint — Système de conformité réglementaire
        </p>
      </div>
    </div>
  );
}
