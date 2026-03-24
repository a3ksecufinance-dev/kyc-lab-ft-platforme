import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import { Shield, ShieldCheck, ShieldOff, Copy, CheckCircle, AlertTriangle, Key } from "lucide-react";

// ─── Composant QR Code (génère via API publique) ──────────────────────────────
// Utilise l'API QR gratuite de goqr.me sans clé

function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
  return (
    <div className="bg-white p-3 rounded-lg inline-block">
      <img src={url} alt="QR Code MFA" width={size} height={size}
        className="block" />
    </div>
  );
}

// ─── Copier dans le presse-papier ─────────────────────────────────────────────

function CopyButton({ value, label = "Copier" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 text-[10px] font-mono text-[#58a6ff] hover:underline">
      {copied ? <CheckCircle size={11} /> : <Copy size={11} />}
      {copied ? "Copié !" : label}
    </button>
  );
}

// ─── Page MFA ─────────────────────────────────────────────────────────────────

type Step = "status" | "setup" | "backup_codes" | "disable";

export function MfaSettingsPage() {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.auth.mfaStatus.useQuery();

  const [step, setStep]               = useState<Step>("status");
  const [qrData, setQrData]           = useState<{ secret: string; qrUri: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode]               = useState("");
  const [disablePass, setDisablePass] = useState("");
  const [error, setError]             = useState<string | null>(null);

  const setupMutation = trpc.auth.mfaSetup.useMutation({
    onSuccess: (data: { secret: string; qrUri: string; issuer: string }) => {
      setQrData(data);
      setStep("setup");
      setError(null);
    },
    onError: (e: { message: string }) => setError(e.message),
  });

  const confirmMutation = trpc.auth.mfaConfirm.useMutation({
    onSuccess: (data: { backupCodes: string[] }) => {
      setBackupCodes(data.backupCodes);
      setStep("backup_codes");
      utils.auth.mfaStatus.invalidate();
      setError(null);
    },
    onError: (e: { message: string }) => setError(e.message),
  });

  const disableMutation = trpc.auth.mfaDisable.useMutation({
    onSuccess: () => {
      setStep("status");
      setDisablePass("");
      utils.auth.mfaStatus.invalidate();
      setError(null);
    },
    onError: (e: { message: string }) => setError(e.message),
  });

  const regenMutation = trpc.auth.mfaRegenerateBackup.useMutation({
    onSuccess: (data: { backupCodes: string[] }) => {
      setBackupCodes(data.backupCodes);
      setStep("backup_codes");
      utils.auth.mfaStatus.invalidate();
      setError(null);
    },
    onError: (e: { message: string }) => setError(e.message),
  });

  const inputCls = "w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40 tracking-widest text-center";

  if (isLoading) return (
    <AppLayout>
      <div className="h-32 animate-pulse bg-[#0d1117] border border-[#21262d] rounded-lg" />
    </AppLayout>
  );

  const mfaEnabled = status?.enabled ?? false;

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">Sécurité — MFA</h1>
        <p className="text-xs font-mono text-[#7d8590] mt-0.5">
          Authentification à deux facteurs (TOTP — Google Authenticator, Authy, Bitwarden…)
        </p>
      </div>

      <div className="max-w-lg space-y-4">

        {/* ── Statut actuel ── */}
        {step === "status" && (
          <>
            <div className={`flex items-center gap-4 p-5 rounded-lg border ${
              mfaEnabled
                ? "bg-emerald-400/5 border-emerald-400/20"
                : "bg-[#0d1117] border-[#21262d]"
            }`}>
              {mfaEnabled
                ? <ShieldCheck size={28} className="text-emerald-400 flex-shrink-0" />
                : <Shield     size={28} className="text-[#484f58]   flex-shrink-0" />
              }
              <div className="flex-1">
                <p className={`text-sm font-semibold font-mono ${mfaEnabled ? "text-emerald-400" : "text-[#e6edf3]"}`}>
                  {mfaEnabled ? "MFA activé" : "MFA désactivé"}
                </p>
                {mfaEnabled && status?.enabledAt && (
                  <p className="text-[10px] font-mono text-[#484f58] mt-0.5">
                    Activé le {new Date(status.enabledAt).toLocaleDateString("fr-FR")}
                  </p>
                )}
                {mfaEnabled && (
                  <p className="text-[10px] font-mono text-[#484f58] mt-0.5">
                    {status?.backupCodesLeft ?? 0} code(s) de secours restant(s)
                  </p>
                )}
                {!mfaEnabled && (
                  <p className="text-[10px] font-mono text-[#484f58] mt-0.5">
                    Recommandé par EBA — protège contre les accès non autorisés
                  </p>
                )}
              </div>
            </div>

            {!mfaEnabled && (
              <button
                onClick={() => setupMutation.mutate()}
                disabled={setupMutation.isPending}
                className="w-full py-3 text-sm font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/30 rounded-lg transition-colors"
              >
                {setupMutation.isPending ? "Préparation…" : "Activer le MFA"}
              </button>
            )}

            {mfaEnabled && (
              <div className="space-y-2">
                <button
                  onClick={() => setStep("disable")}
                  className="w-full py-2.5 text-xs font-mono border border-red-400/30 text-red-400 hover:bg-red-400/10 rounded-lg"
                >
                  <span className="flex items-center justify-center gap-2">
                    <ShieldOff size={12} /> Désactiver le MFA
                  </span>
                </button>
                <button
                  onClick={() => setStep("setup")}
                  className="w-full py-2.5 text-xs font-mono border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] rounded-lg"
                >
                  <span className="flex items-center justify-center gap-2">
                    <Key size={12} /> Régénérer les codes de secours
                  </span>
                </button>
              </div>
            )}

            {error && (
              <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-3">
                <p className="text-xs font-mono text-red-400">{error}</p>
              </div>
            )}
          </>
        )}

        {/* ── Étape configuration ── */}
        {step === "setup" && qrData && (
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#21262d]">
              <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">
                {mfaEnabled ? "Régénérer les codes de secours" : "Configurer l'authentificateur"}
              </h3>
            </div>

            <div className="p-5 space-y-5">
              {!mfaEnabled && (
                <>
                  <div>
                    <p className="text-xs font-mono text-[#7d8590] mb-3">
                      1. Scannez ce QR code avec votre application d'authentification
                    </p>
                    <div className="flex justify-center">
                      <QrCode value={qrData.qrUri} size={180} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-mono text-[#7d8590] mb-2">
                      Ou saisissez manuellement la clé secrète :
                    </p>
                    <div className="bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 flex items-center justify-between">
                      <span className="text-xs font-mono text-[#e6edf3] tracking-widest break-all">
                        {qrData.secret}
                      </span>
                      <CopyButton value={qrData.secret} />
                    </div>
                  </div>
                </>
              )}

              <div>
                <p className="text-xs font-mono text-[#7d8590] mb-2">
                  {mfaEnabled
                    ? "Saisissez votre code TOTP actuel pour confirmer :"
                    : "2. Saisissez le code à 6 chiffres affiché par l'application :"}
                </p>
                <input
                  value={code}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className={inputCls}
                />
              </div>

              {error && (
                <div className="bg-red-400/10 border border-red-400/20 rounded p-2">
                  <p className="text-xs font-mono text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setStep("status"); setCode(""); setError(null); }}
                  className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md">
                  Annuler
                </button>
                <button
                  disabled={code.length !== 6 || confirmMutation.isPending || regenMutation.isPending}
                  onClick={() => {
                    if (mfaEnabled) {
                      regenMutation.mutate({ code });
                    } else {
                      confirmMutation.mutate({ code });
                    }
                  }}
                  className="flex-1 py-2 text-xs font-mono bg-emerald-400/15 border border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/25 rounded-md disabled:opacity-40"
                >
                  {confirmMutation.isPending || regenMutation.isPending ? "Vérification…" : "Confirmer"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Codes de secours ── */}
        {step === "backup_codes" && backupCodes.length > 0 && (
          <div className="bg-[#0d1117] border border-amber-400/20 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-400/20 bg-amber-400/5">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-400 font-mono">
                  Codes de secours — à sauvegarder maintenant
                </h3>
              </div>
              <p className="text-[10px] font-mono text-amber-400/70 mt-1">
                Ces codes s'affichent une seule fois. Conservez-les dans un endroit sûr.
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((c: string, i: number) => (
                  <div key={i} className="bg-[#161b22] border border-[#30363d] rounded px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-mono text-[#e6edf3] tracking-widest">{c}</span>
                    <CopyButton value={c} />
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const text = backupCodes.join("\n");
                    const blob = new Blob([text], { type: "text/plain" });
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement("a");
                    a.href     = url;
                    a.download = "kyc-aml-backup-codes.txt";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex-1 py-2 text-xs font-mono border border-amber-400/30 text-amber-400 rounded-md hover:bg-amber-400/10"
                >
                  Télécharger .txt
                </button>
                <button
                  onClick={() => { setStep("status"); setBackupCodes([]); setCode(""); }}
                  className="flex-1 py-2 text-xs font-mono bg-emerald-400/15 border border-emerald-400/30 text-emerald-400 rounded-md hover:bg-emerald-400/25"
                >
                  J'ai sauvegardé les codes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Désactivation ── */}
        {step === "disable" && (
          <div className="bg-[#0d1117] border border-red-400/20 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-red-400/20 bg-red-400/5">
              <h3 className="text-sm font-semibold text-red-400 font-mono">Désactiver le MFA</h3>
              <p className="text-[10px] font-mono text-red-400/70 mt-1">
                Votre compte sera moins protégé. Cette action est tracée dans l'audit.
              </p>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1">
                  Mot de passe de confirmation
                </label>
                <input
                  type="password"
                  value={disablePass}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                    setDisablePass(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-red-400/40"
                />
              </div>

              {error && (
                <div className="bg-red-400/10 border border-red-400/20 rounded p-2">
                  <p className="text-xs font-mono text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setStep("status"); setError(null); }}
                  className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md">
                  Annuler
                </button>
                <button
                  disabled={disablePass.length < 8 || disableMutation.isPending}
                  onClick={() => disableMutation.mutate({ password: disablePass })}
                  className="flex-1 py-2 text-xs font-mono bg-red-400/15 border border-red-400/30 text-red-400 hover:bg-red-400/25 rounded-md disabled:opacity-40"
                >
                  {disableMutation.isPending ? "Désactivation…" : "Désactiver"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
