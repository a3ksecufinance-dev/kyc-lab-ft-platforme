import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { useI18n } from "../hooks/useI18n";
import { Sidebar } from "../components/layout/Sidebar";
import {
  Cog, Save, RefreshCw, Database, Shield, Wallet,
  Gauge, Building2, Check, AlertTriangle,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { icon: typeof Cog; color: string }> = {
  aml:         { icon: Shield,    color: "#EF4444" },
  screening:   { icon: Shield,    color: "#8B5CF6" },
  wallet:      { icon: Wallet,    color: "#3B82F6" },
  sla:         { icon: Gauge,     color: "#F59E0B" },
  institution: { icon: Building2, color: "#2DD4A0" },
};

type ConfigRow = {
  id: number;
  key: string;
  value: unknown;
  category: string;
  label: string;
  description: string | null;
  updatedBy: number | null;
  updatedAt: Date | string;
};

// ─── Page ───────────────────────────────────────────────────────────────────

export function ConfigPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = hasRole(user, "admin");

  const CATEGORY_LABELS: Record<string, string> = {
    aml:         t.config.catAml,
    screening:   t.config.catScreening,
    wallet:      t.config.catWallet,
    sla:         t.config.catSla,
    institution: t.config.catInstitution,
  };

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ key: string; ok: boolean } | null>(null);

  const configQuery = trpc.config.getAll.useQuery();
  const updateMutation = trpc.config.update.useMutation();
  const seedMutation = trpc.config.seed.useMutation();
  const utils = trpc.useUtils();

  const grouped = configQuery.data?.grouped ?? {};
  const categories = Object.keys(grouped);
  const selected = activeCategory ?? categories[0] ?? "";
  const rows: ConfigRow[] = (grouped[selected] ?? []) as ConfigRow[];

  const handleEdit = (key: string, val: string) => {
    setEditValues(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async (key: string) => {
    const rawVal = editValues[key];
    if (rawVal === undefined) return;

    // Parse: try number first, then boolean, else string
    let parsed: unknown = rawVal;
    if (/^-?\d+(\.\d+)?$/.test(rawVal)) parsed = Number(rawVal);
    else if (rawVal === "true") parsed = true;
    else if (rawVal === "false") parsed = false;

    setSaving(key);
    try {
      await updateMutation.mutateAsync({ key, value: parsed as never });
      setFeedback({ key, ok: true });
      setEditValues(prev => { const n = { ...prev }; delete n[key]; return n; });
      utils.config.getAll.invalidate();
    } catch {
      setFeedback({ key, ok: false });
    }
    setSaving(null);
    setTimeout(() => setFeedback(null), 2000);
  };

  const handleSeed = async () => {
    await seedMutation.mutateAsync();
    utils.config.getAll.invalidate();
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--wr-bg)" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "28px 36px", overflow: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Cog size={22} style={{ color: "var(--wr-accent)" }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--wr-text-1)" }}>
              Configuration système
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => configQuery.refetch()}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 6,
                border: "1px solid var(--wr-border)",
                background: "var(--wr-card)", cursor: "pointer",
                fontSize: 12, color: "var(--wr-text-2)",
              }}
            >
              <RefreshCw size={12} />
              {t.common.refresh}
            </button>
            {isAdmin && (
              <button
                onClick={handleSeed}
                disabled={seedMutation.isPending}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 6,
                  border: "1px solid rgba(139,92,246,0.25)",
                  background: "rgba(139,92,246,0.08)", cursor: "pointer",
                  fontSize: 12, color: "#8B5CF6",
                }}
              >
                <Database size={12} />
                Initialiser valeurs par défaut
              </button>
            )}
          </div>
        </div>

        {configQuery.isLoading ? (
          <div style={{ color: "var(--wr-text-3)", padding: 40, textAlign: "center" }}>
            {t.common.loading}
          </div>
        ) : categories.length === 0 ? (
          <div style={{
            padding: 60, textAlign: "center", color: "var(--wr-text-3)",
          }}>
            <Cog size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
            <div>{t.config.noConfig}</div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 24 }}>
            {/* Category sidebar */}
            <div style={{ width: 220, flexShrink: 0 }}>
              {categories.map(cat => {
                const style = CATEGORY_STYLE[cat] ?? { icon: Cog, color: "#6B7280" };
                const cfg = { ...style, label: CATEGORY_LABELS[cat] ?? cat };
                const Icon = cfg.icon;
                const isActive = cat === selected;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "10px 14px", borderRadius: 8, marginBottom: 4,
                      border: isActive
                        ? `1px solid ${cfg.color}44`
                        : "1px solid transparent",
                      background: isActive ? `${cfg.color}11` : "transparent",
                      cursor: "pointer", textAlign: "left",
                      color: isActive ? cfg.color : "var(--wr-text-2)",
                      fontSize: 13, fontWeight: isActive ? 600 : 400,
                      transition: "all 0.15s",
                    }}
                  >
                    <Icon size={14} />
                    {cfg.label}
                    <span style={{
                      marginLeft: "auto", fontSize: 10,
                      fontFamily: "var(--wr-font-mono)", opacity: 0.5,
                    }}>
                      {(grouped[cat] as unknown[])?.length ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Config values */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rows.map(row => {
                  const editVal = editValues[row.key];
                  const currentVal = editVal !== undefined ? editVal : String(row.value);
                  const isModified = editVal !== undefined;
                  const isSaving = saving === row.key;
                  const fb = feedback?.key === row.key ? feedback : null;

                  return (
                    <div
                      key={row.key}
                      style={{
                        padding: "14px 18px", borderRadius: 8,
                        background: "var(--wr-card)",
                        border: isModified
                          ? "1px solid rgba(20,184,166,0.3)"
                          : "1px solid var(--wr-border)",
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--wr-text-1)" }}>
                            {row.label}
                          </span>
                          <span style={{
                            marginLeft: 8, fontSize: 10,
                            fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)", opacity: 0.6,
                          }}>
                            {row.key}
                          </span>
                        </div>
                        {isAdmin && isModified && (
                          <button
                            onClick={() => handleSave(row.key)}
                            disabled={isSaving}
                            style={{
                              display: "flex", alignItems: "center", gap: 4,
                              padding: "4px 10px", borderRadius: 5,
                              border: "1px solid rgba(45,212,160,0.3)",
                              background: "rgba(45,212,160,0.08)",
                              cursor: "pointer", fontSize: 11, color: "#2DD4A0",
                            }}
                          >
                            <Save size={11} />
                            {isSaving ? "..." : t.config.save}
                          </button>
                        )}
                        {fb && (
                          <span style={{
                            display: "flex", alignItems: "center", gap: 4,
                            fontSize: 11, color: fb.ok ? "#2DD4A0" : "#EF4444",
                          }}>
                            {fb.ok ? <Check size={12} /> : <AlertTriangle size={12} />}
                            {fb.ok ? "Sauvegardé" : "Erreur"}
                          </span>
                        )}
                      </div>
                      {row.description && (
                        <p style={{
                          fontSize: 11, color: "var(--wr-text-3)", margin: "0 0 8px",
                          lineHeight: 1.4,
                        }}>
                          {row.description}
                        </p>
                      )}
                      <input
                        type="text"
                        value={currentVal}
                        onChange={e => handleEdit(row.key, e.target.value)}
                        disabled={!isAdmin}
                        style={{
                          width: "100%", padding: "8px 12px", borderRadius: 6,
                          border: "1px solid var(--wr-border)",
                          background: isAdmin ? "var(--wr-bg)" : "rgba(255,255,255,0.02)",
                          color: "var(--wr-text-1)", fontSize: 13,
                          fontFamily: typeof row.value === "number" ? "var(--wr-font-mono)" : "inherit",
                          outline: "none",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
