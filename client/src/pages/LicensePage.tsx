import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useI18n } from "../hooks/useI18n";
import { Sidebar } from "../components/layout/Sidebar";
import { LICENSE_MODULES } from "../../../shared/license.types";
import type { LicenseModule } from "../../../shared/license.types";
import {
  KeyRound, Shield, CheckCircle2, XCircle, AlertTriangle,
  Copy, RefreshCw, Users, CalendarDays, Package,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof CheckCircle2; label: string }> = {
  ACTIVE:  { color: "#2DD4A0", bg: "rgba(45,212,160,0.08)", border: "rgba(45,212,160,0.25)", icon: CheckCircle2, label: "Active" },
  GRACE:   { color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", icon: AlertTriangle, label: "Période de grâce" },
  EXPIRED: { color: "#EF4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.25)",  icon: XCircle, label: "Expirée" },
  INVALID: { color: "#EF4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.25)",  icon: XCircle, label: "Invalide" },
  NONE:    { color: "#8B5CF6", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.25)", icon: KeyRound, label: "Mode développement" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function LicensePage() {
  const { t } = useI18n();
  const [keyInput, setKeyInput] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateSuccess, setActivateSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const info = trpc.license.getInfo.useQuery();
  const history = trpc.license.history.useQuery();
  const seat = trpc.license.checkSeat.useQuery();
  const activateMutation = trpc.license.activate.useMutation();
  const utils = trpc.useUtils();

  const data = info.data;
  const scKey = data?.status ?? "NONE";
  // STATUS_CONFIG always has "NONE" as fallback — guaranteed non-null
  const sc = (STATUS_CONFIG[scKey] ?? STATUS_CONFIG["NONE"])!;
  const StatusIcon = sc.icon;

  async function handleActivate() {
    if (!keyInput.trim()) return;
    setActivating(true);
    setActivateError(null);
    setActivateSuccess(false);
    try {
      const result = await activateMutation.mutateAsync({ licenseKey: keyInput.trim() });
      if (result.success) {
        setActivateSuccess(true);
        setKeyInput("");
        utils.license.getInfo.invalidate();
        utils.license.history.invalidate();
        utils.license.checkSeat.invalidate();
        utils.institution.getConfig.invalidate();
      } else {
        setActivateError(result.error ?? "Erreur inconnue");
      }
    } catch (e: any) {
      setActivateError(e.message ?? "Erreur réseau");
    } finally {
      setActivating(false);
    }
  }

  function copyLicenseId() {
    if (data?.licenseId) {
      navigator.clipboard.writeText(data.licenseId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--wr-bg)" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "28px 36px", overflow: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <KeyRound size={22} style={{ color: "#14B8A6" }} />
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--wr-text-1)" }}>
              {t.nav.license}
            </h1>
            <p style={{ fontSize: 13, color: "var(--wr-text-3)", margin: "2px 0 0" }}>
              Gestion de la licence et des modules activés
            </p>
          </div>
          <button
            onClick={() => { info.refetch(); history.refetch(); seat.refetch(); }}
            style={{
              marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 6,
              border: "1px solid var(--wr-border)", background: "var(--wr-bg-2)",
              cursor: "pointer", fontSize: 12, color: "var(--wr-text-2)",
            }}
          >
            <RefreshCw size={12} /> Rafraîchir
          </button>
        </div>

        {info.isLoading ? (
          <p style={{ color: "var(--wr-text-3)" }}>{t.common.loading}</p>
        ) : (
          <>
            {/* ── Statut principal ──────────────────────────────────────── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 16, marginBottom: 28,
            }}>
              {/* Statut */}
              <div style={{
                padding: "18px 20px", borderRadius: 10,
                background: sc.bg, border: `1px solid ${sc.border}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <StatusIcon size={16} style={{ color: sc.color }} />
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: sc.color, fontWeight: 600 }}>
                    {sc.label}
                  </span>
                </div>
                <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--wr-text-1)" }}>
                  {data?.clientName ?? "Non licencié"}
                </p>
                {data?.institutionType && (
                  <p style={{ fontSize: 11, color: "var(--wr-text-3)", margin: "4px 0 0" }}>
                    {data.institutionType.replace(/_/g, " ")}
                  </p>
                )}
              </div>

              {/* Modules */}
              <div style={{
                padding: "18px 20px", borderRadius: 10,
                background: "var(--wr-bg-2)", border: "1px solid var(--wr-border)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <Package size={14} style={{ color: "var(--wr-text-3)" }} />
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--wr-text-3)" }}>
                    Modules
                  </span>
                </div>
                <p style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "var(--wr-text-1)" }}>
                  {data?.modules.length ?? 0}
                  <span style={{ fontSize: 13, fontWeight: 400, color: "var(--wr-text-3)" }}> / 13</span>
                </p>
              </div>

              {/* Sièges */}
              <div style={{
                padding: "18px 20px", borderRadius: 10,
                background: "var(--wr-bg-2)", border: "1px solid var(--wr-border)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <Users size={14} style={{ color: "var(--wr-text-3)" }} />
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--wr-text-3)" }}>
                    Sièges
                  </span>
                </div>
                <p style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "var(--wr-text-1)" }}>
                  {seat.data?.current ?? data?.currentUsers ?? 0}
                  <span style={{ fontSize: 13, fontWeight: 400, color: "var(--wr-text-3)" }}> / {data?.maxUsers ?? "∞"}</span>
                </p>
                {seat.data && !seat.data.ok && (
                  <p style={{ fontSize: 10, color: "#EF4444", margin: "4px 0 0" }}>Limite atteinte</p>
                )}
              </div>

              {/* Expiration */}
              <div style={{
                padding: "18px 20px", borderRadius: 10,
                background: "var(--wr-bg-2)", border: "1px solid var(--wr-border)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <CalendarDays size={14} style={{ color: "var(--wr-text-3)" }} />
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--wr-text-3)" }}>
                    Expiration
                  </span>
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "var(--wr-text-1)" }}>
                  {formatDate(data?.expiresAt ?? null)}
                </p>
                {data?.daysRemaining != null && (
                  <p style={{
                    fontSize: 11, margin: "4px 0 0",
                    color: data.daysRemaining < 30 ? "#F59E0B" : "var(--wr-text-3)",
                  }}>
                    {data.daysRemaining > 0 ? `${data.daysRemaining}j restants` : "Expirée"}
                  </p>
                )}
              </div>
            </div>

            {/* ── License ID ───────────────────────────────────────────── */}
            {data?.licenseId && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", borderRadius: 8, marginBottom: 28,
                background: "var(--wr-bg-2)", border: "1px solid var(--wr-border)",
                fontFamily: "var(--wr-font-mono)", fontSize: 12,
              }}>
                <span style={{ color: "var(--wr-text-3)" }}>License ID :</span>
                <span style={{ color: "var(--wr-text-1)" }}>{data.licenseId}</span>
                <button
                  onClick={copyLicenseId}
                  style={{
                    marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 8px", borderRadius: 4,
                    border: "1px solid var(--wr-border)", background: "transparent",
                    cursor: "pointer", fontSize: 11, color: "var(--wr-text-3)",
                  }}
                >
                  <Copy size={11} /> {copied ? "Copié !" : "Copier"}
                </button>
              </div>
            )}

            {/* ── Grille des modules ───────────────────────────────────── */}
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--wr-text-1)", margin: "0 0 14px" }}>
              Modules
            </h2>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10, marginBottom: 32,
            }}>
              {(Object.entries(LICENSE_MODULES) as [LicenseModule, string][]).map(([key, label]) => {
                const active = data?.modules.includes(key) ?? false;
                return (
                  <div
                    key={key}
                    style={{
                      padding: "12px 16px", borderRadius: 8,
                      background: active ? "rgba(45,212,160,0.06)" : "var(--wr-bg-2)",
                      border: `1px solid ${active ? "rgba(45,212,160,0.20)" : "var(--wr-border)"}`,
                      display: "flex", alignItems: "center", gap: 10,
                      opacity: active ? 1 : 0.5,
                    }}
                  >
                    {active
                      ? <CheckCircle2 size={14} style={{ color: "#2DD4A0", flexShrink: 0 }} />
                      : <XCircle size={14} style={{ color: "var(--wr-text-3)", flexShrink: 0 }} />
                    }
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: "var(--wr-text-1)" }}>
                        {label}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--wr-text-3)", margin: "1px 0 0", fontFamily: "var(--wr-font-mono)" }}>
                        {key}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Activation ────────────────────────────────────────────── */}
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--wr-text-1)", margin: "0 0 14px" }}>
              Activer une licence
            </h2>
            <div style={{
              padding: "20px", borderRadius: 10,
              background: "var(--wr-bg-2)", border: "1px solid var(--wr-border)",
              marginBottom: 32,
            }}>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="text"
                  value={keyInput}
                  onChange={e => { setKeyInput(e.target.value); setActivateError(null); setActivateSuccess(false); }}
                  placeholder="LIC.xxxxx.xxxxx"
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 6,
                    border: "1px solid var(--wr-border)", background: "var(--wr-bg)",
                    color: "var(--wr-text-1)", fontSize: 13,
                    fontFamily: "var(--wr-font-mono)",
                  }}
                />
                <button
                  onClick={handleActivate}
                  disabled={activating || !keyInput.trim()}
                  style={{
                    padding: "10px 20px", borderRadius: 6,
                    background: "#14B8A6", border: "none",
                    color: "#000", fontSize: 13, fontWeight: 600,
                    cursor: activating ? "wait" : "pointer",
                    opacity: activating || !keyInput.trim() ? 0.5 : 1,
                  }}
                >
                  <Shield size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                  {activating ? "Activation…" : "Activer"}
                </button>
              </div>
              {activateError && (
                <p style={{ fontSize: 12, color: "#EF4444", margin: "10px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <XCircle size={13} /> {activateError}
                </p>
              )}
              {activateSuccess && (
                <p style={{ fontSize: 12, color: "#2DD4A0", margin: "10px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={13} /> Licence activée avec succès — les modules sont maintenant disponibles
                </p>
              )}
            </div>

            {/* ── Historique ─────────────────────────────────────────────── */}
            {history.data && history.data.length > 0 && (
              <>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--wr-text-1)", margin: "0 0 14px" }}>
                  Historique
                </h2>
                <div style={{
                  borderRadius: 10, overflow: "hidden",
                  border: "1px solid var(--wr-border)",
                }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--wr-bg-2)" }}>
                        <th style={{ padding: "10px 14px", textAlign: "left", color: "var(--wr-text-3)", fontWeight: 500 }}>Client</th>
                        <th style={{ padding: "10px 14px", textAlign: "left", color: "var(--wr-text-3)", fontWeight: 500 }}>Type</th>
                        <th style={{ padding: "10px 14px", textAlign: "center", color: "var(--wr-text-3)", fontWeight: 500 }}>Modules</th>
                        <th style={{ padding: "10px 14px", textAlign: "center", color: "var(--wr-text-3)", fontWeight: 500 }}>Sièges</th>
                        <th style={{ padding: "10px 14px", textAlign: "left", color: "var(--wr-text-3)", fontWeight: 500 }}>Expire</th>
                        <th style={{ padding: "10px 14px", textAlign: "center", color: "var(--wr-text-3)", fontWeight: 500 }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.data.map((lic) => (
                        <tr key={lic.id} style={{ borderTop: "1px solid var(--wr-border)" }}>
                          <td style={{ padding: "10px 14px", color: "var(--wr-text-1)" }}>{lic.clientName}</td>
                          <td style={{ padding: "10px 14px", color: "var(--wr-text-2)", fontFamily: "var(--wr-font-mono)", fontSize: 11 }}>
                            {lic.institutionType.replace(/_/g, " ")}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "var(--wr-text-2)" }}>
                            {(lic.modules as string[]).length}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "var(--wr-text-2)" }}>
                            {lic.maxUsers}
                          </td>
                          <td style={{ padding: "10px 14px", color: "var(--wr-text-2)" }}>
                            {lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString("fr-FR") : "—"}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            <span style={{
                              fontSize: 10, padding: "2px 8px", borderRadius: 10,
                              fontWeight: 600,
                              background: lic.status === "ACTIVE" ? "rgba(45,212,160,0.12)" : "rgba(255,255,255,0.06)",
                              color: lic.status === "ACTIVE" ? "#2DD4A0" : "var(--wr-text-3)",
                            }}>
                              {lic.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
