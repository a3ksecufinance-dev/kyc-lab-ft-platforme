import { useState } from "react";
import { Eye, EyeOff, AlertCircle, Smartphone } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

type Step = "credentials" | "mfa";

export function LoginPage() {
  const { login, completeMfaLogin } = useAuth();

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [step, setStep]           = useState<Step>("credentials");
  const [mfaUserId, setMfaUserId] = useState<number | null>(null);
  const [mfaCode, setMfaCode]     = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Identifiants invalides");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaUserId) return;
    setError(null);
    setLoading(true);
    try {
      await completeMfaLogin(mfaUserId, mfaCode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Code invalide");
      setMfaCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex"
      style={{ background: "#07070D" }}
    >
      {/* ── Panneau gauche — branding ─────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0A0A12 0%, #0E0E1A 50%, #080810 100%)",
          borderRight: "1px solid rgba(184,142,61,0.12)",
        }}
      >
        {/* Grille décorative */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: "linear-gradient(rgba(212,175,55,1) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Orbe doré */}
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(184,142,61,0.08) 0%, transparent 70%)",
          }}
        />

        {/* Logo top */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(184,142,61,0.2), rgba(212,175,55,0.1))",
              border: "1px solid rgba(184,142,61,0.35)",
              boxShadow: "0 0 20px rgba(184,142,61,0.12)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 1.5L2.5 4.5V10C2.5 14 6 17.5 10 18.5C14 17.5 17.5 14 17.5 10V4.5L10 1.5Z"
                fill="url(#lg1)"
                stroke="rgba(212,175,55,0.5)"
                strokeWidth="0.5"
              />
              <path d="M7 10.5L9 12.5L13 8.5" stroke="rgba(212,175,55,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="lg1" x1="2.5" y1="1.5" x2="17.5" y2="18.5" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="rgba(184,142,61,0.35)" />
                  <stop offset="100%" stopColor="rgba(212,175,55,0.15)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <span style={{ color: "#E0E0EC", fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Watch
            </span>
            <span style={{
              background: "linear-gradient(135deg, #D4AF37 0%, #B8953D 50%, #D4AF37 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontFamily: "Georgia, serif",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}>
              Reg
            </span>
          </div>
        </div>

        {/* Centre — titre principal */}
        <div className="relative z-10 space-y-8">
          <div>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 text-[11px] tracking-widest uppercase"
              style={{
                background: "rgba(184,142,61,0.08)",
                border: "1px solid rgba(184,142,61,0.2)",
                color: "rgba(212,175,55,0.8)",
                fontFamily: "monospace",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#D4AF37", boxShadow: "0 0 6px rgba(212,175,55,0.8)" }}
              />
              Plateforme de conformité v2.0
            </div>

            <h1
              className="text-4xl font-bold leading-tight mb-4"
              style={{ color: "#E8E8F4", fontFamily: "Georgia, serif", letterSpacing: "-0.03em" }}
            >
              Surveillance AML
              <br />
              <span style={{
                background: "linear-gradient(135deg, #D4AF37 0%, #C4A030 40%, #D4AF37 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                intelligente
              </span>
            </h1>
            <p
              className="text-[15px] leading-relaxed max-w-sm"
              style={{ color: "rgba(180,180,200,0.6)", fontFamily: "monospace", fontSize: 13 }}
            >
              Détection en temps réel · Screening sanctions · Moteur de règles no-code · Conformité AMLD6 / BAM
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { val: "< 500ms", label: "Analyse tx" },
              { val: "4 listes", label: "Sanctions" },
              { val: "AMLD6", label: "Conformité" },
            ].map(({ val, label }) => (
              <div
                key={label}
                className="rounded-lg p-3 text-center"
                style={{
                  background: "rgba(184,142,61,0.06)",
                  border: "1px solid rgba(184,142,61,0.12)",
                }}
              >
                <p
                  className="text-[15px] font-bold mb-0.5"
                  style={{
                    background: "linear-gradient(135deg, #D4AF37, #B8953D)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    fontFamily: "Georgia, serif",
                  }}
                >
                  {val}
                </p>
                <p className="text-[9px] tracking-widest uppercase" style={{ color: "rgba(180,180,200,0.4)", fontFamily: "monospace" }}>
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer branding */}
        <div className="relative z-10">
          <p className="text-[10px] tracking-[0.2em] uppercase" style={{ color: "rgba(184,142,61,0.3)", fontFamily: "monospace" }}>
            © 2026 WatchReg · AML/KYC Solutions
          </p>
        </div>
      </div>

      {/* ── Panneau droit — formulaire ────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">

          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <span style={{ color: "#E0E0EC", fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700 }}>Watch</span>
            <span style={{
              background: "linear-gradient(135deg, #D4AF37, #B8953D)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontFamily: "Georgia, serif",
              fontSize: 20,
              fontWeight: 700,
            }}>Reg</span>
          </div>

          {/* Titre formulaire */}
          <div className="mb-8">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
              style={step === "mfa" ? {
                background: "rgba(139,92,246,0.12)",
                border: "1px solid rgba(139,92,246,0.25)",
              } : {
                background: "linear-gradient(135deg, rgba(184,142,61,0.2), rgba(212,175,55,0.08))",
                border: "1px solid rgba(184,142,61,0.35)",
                boxShadow: "0 0 20px rgba(184,142,61,0.1)",
              }}
            >
              {step === "mfa"
                ? <Smartphone size={22} style={{ color: "#A78BFA" }} />
                : (
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                    <path d="M10 1.5L2.5 4.5V10C2.5 14 6 17.5 10 18.5C14 17.5 17.5 14 17.5 10V4.5L10 1.5Z" fill="url(#lg2)" stroke="rgba(212,175,55,0.5)" strokeWidth="0.5" />
                    <path d="M7 10.5L9 12.5L13 8.5" stroke="rgba(212,175,55,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <defs>
                      <linearGradient id="lg2" x1="2.5" y1="1.5" x2="17.5" y2="18.5" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="rgba(184,142,61,0.4)" />
                        <stop offset="100%" stopColor="rgba(212,175,55,0.15)" />
                      </linearGradient>
                    </defs>
                  </svg>
                )
              }
            </div>
            <h2 className="text-xl font-bold mb-1" style={{ color: "#E8E8F4", fontFamily: "Georgia, serif" }}>
              {step === "mfa" ? "Vérification 2FA" : "Connexion sécurisée"}
            </h2>
            <p className="text-[12px]" style={{ color: "rgba(160,160,180,0.6)", fontFamily: "monospace" }}>
              {step === "mfa" ? "Saisissez le code de votre application" : "Accès restreint — personnel autorisé"}
            </p>
          </div>

          {/* Carte formulaire */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(184,142,61,0.12)",
              backdropFilter: "blur(12px)",
            }}
          >
            {/* ── Étape 1 : Identifiants ── */}
            {step === "credentials" && (
              <form onSubmit={handleCredentials} className="space-y-4">
                <div>
                  <label
                    className="block text-[10px] tracking-[0.15em] uppercase mb-2"
                    style={{ color: "rgba(184,142,61,0.6)", fontFamily: "monospace" }}
                  >
                    Adresse email
                  </label>
                  <input
                    type="email" value={email} required
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    placeholder="analyste@watchreg.ma"
                    className="w-full rounded-lg px-3.5 py-2.5 text-[13px] transition-all outline-none"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(184,142,61,0.15)",
                      color: "#D8D8E8",
                      fontFamily: "monospace",
                    }}
                    onFocus={e => (e.target.style.borderColor = "rgba(212,175,55,0.4)")}
                    onBlur={e => (e.target.style.borderColor = "rgba(184,142,61,0.15)")}
                  />
                </div>

                <div>
                  <label
                    className="block text-[10px] tracking-[0.15em] uppercase mb-2"
                    style={{ color: "rgba(184,142,61,0.6)", fontFamily: "monospace" }}
                  >
                    Mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"}
                      value={password} required
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-lg px-3.5 py-2.5 pr-10 text-[13px] transition-all outline-none"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(184,142,61,0.15)",
                        color: "#D8D8E8",
                        fontFamily: "monospace",
                      }}
                      onFocus={e => (e.target.style.borderColor = "rgba(212,175,55,0.4)")}
                      onBlur={e => (e.target.style.borderColor = "rgba(184,142,61,0.15)")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: "rgba(160,160,180,0.4)" }}
                    >
                      {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    className="flex items-center gap-2.5 p-3 rounded-lg"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    <AlertCircle size={13} style={{ color: "#F87171", flexShrink: 0 }} />
                    <p className="text-[12px]" style={{ color: "#F87171", fontFamily: "monospace" }}>{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-200 disabled:opacity-50"
                  style={{
                    background: loading
                      ? "rgba(184,142,61,0.3)"
                      : "linear-gradient(135deg, #C9A227 0%, #B8953D 50%, #C9A227 100%)",
                    color: "#0A0A0F",
                    fontFamily: "Georgia, serif",
                    letterSpacing: "0.02em",
                    boxShadow: loading ? "none" : "0 4px 20px rgba(184,142,61,0.25)",
                  }}
                >
                  {loading ? "Connexion en cours..." : "Se connecter"}
                </button>

                <div className="text-center">
                  <a
                    href="/reset-password"
                    className="text-[11px] transition-colors"
                    style={{ color: "rgba(184,142,61,0.4)", fontFamily: "monospace" }}
                    onMouseEnter={e => ((e.target as HTMLElement).style.color = "rgba(212,175,55,0.7)")}
                    onMouseLeave={e => ((e.target as HTMLElement).style.color = "rgba(184,142,61,0.4)")}
                  >
                    Mot de passe oublié ?
                  </a>
                </div>
              </form>
            )}

            {/* ── Étape 2 : MFA ── */}
            {step === "mfa" && (
              <form onSubmit={handleMfa} className="space-y-4">
                <div
                  className="rounded-lg p-3 text-center"
                  style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}
                >
                  <p className="text-[11px]" style={{ color: "#A78BFA", fontFamily: "monospace" }}>
                    Google Authenticator · Authy · Bitwarden
                  </p>
                </div>

                <div>
                  <label
                    className="block text-[10px] tracking-[0.15em] uppercase mb-2"
                    style={{ color: "rgba(184,142,61,0.6)", fontFamily: "monospace" }}
                  >
                    Code MFA
                  </label>
                  <input
                    type="text" value={mfaCode} required autoFocus maxLength={8}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="w-full rounded-lg px-3.5 py-3 text-[18px] text-center tracking-[0.5em] transition-all outline-none"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(139,92,246,0.25)",
                      color: "#D8D8E8",
                      fontFamily: "monospace",
                    }}
                    onFocus={e => (e.target.style.borderColor = "rgba(139,92,246,0.5)")}
                    onBlur={e => (e.target.style.borderColor = "rgba(139,92,246,0.25)")}
                  />
                </div>

                {error && (
                  <div
                    className="flex items-center gap-2.5 p-3 rounded-lg"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    <AlertCircle size={13} style={{ color: "#F87171", flexShrink: 0 }} />
                    <p className="text-[12px]" style={{ color: "#F87171", fontFamily: "monospace" }}>{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || mfaCode.length < 6}
                  className="w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-200 disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, #7C3AED, #6D28D9)",
                    color: "#F5F3FF",
                    fontFamily: "Georgia, serif",
                    boxShadow: "0 4px 20px rgba(109,40,217,0.25)",
                  }}
                >
                  {loading ? "Vérification..." : "Vérifier"}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep("credentials"); setError(null); setMfaCode(""); }}
                  className="w-full py-1.5 text-[11px] transition-colors"
                  style={{ color: "rgba(160,160,180,0.4)", fontFamily: "monospace" }}
                >
                  ← Retour à la connexion
                </button>
              </form>
            )}
          </div>

          <p
            className="text-center text-[10px] mt-5 tracking-[0.12em] uppercase"
            style={{ color: "rgba(184,142,61,0.25)", fontFamily: "monospace" }}
          >
            Accès restreint — Système de conformité réglementaire
          </p>
        </div>
      </div>
    </div>
  );
}
