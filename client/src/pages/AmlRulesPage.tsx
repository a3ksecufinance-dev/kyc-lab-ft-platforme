/**
 * Sprint 5 — No-Code AML Rule Builder
 * Fichier : client/src/pages/AmlRulesPage.tsx
 *
 * Main page component — sub-components extracted to ./aml-rules/
 */

import { useState } from "react";
import type React from "react";
import { AppLayout }    from "../components/layout/AppLayout";
import { Button }       from "../components/ui/Button";
import { trpc }         from "../lib/trpc";
import { useAuth }      from "../hooks/useAuth";
import { hasRole }      from "../lib/auth";
import { useI18n }      from "../hooks/useI18n";
import {
  Shield, Plus, FlaskConical, Globe, Search,
  Filter, Activity,
} from "lucide-react";

import { C, type AmlRule } from "./aml-rules/types";
import { RuleModal }          from "./aml-rules/RuleModal";
import { RuleCard }           from "./aml-rules/RuleCard";
import { JurisdictionsPanel } from "./aml-rules/JurisdictionsPanel";

export function AmlRulesPage() {
  const { t }       = useI18n();
  const { user }    = useAuth();
  const canEdit     = hasRole(user, "supervisor");
  const canDelete   = hasRole(user, "admin");
  const [showCreate, setShowCreate] = useState(false);
  const [pageTab, setPageTab] = useState<"rules" | "jurisdictions">("rules");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "TESTING" | "INACTIVE">("ALL");

  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.amlRules.list.useQuery();

  const seedMut = trpc.amlRules.seedDefaults.useMutation({
    onSuccess: () => utils.amlRules.list.invalidate(),
  });

  const filteredRules = rules?.filter((r: AmlRule) => {
    if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())
      && !(r.description ?? "").toLowerCase().includes(search.toLowerCase())
      && !r.ruleId.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const active   = rules?.filter((r: AmlRule) => r.status === "ACTIVE").length   ?? 0;
  const testing  = rules?.filter((r: AmlRule) => r.status === "TESTING").length  ?? 0;
  const inactive = rules?.filter((r: AmlRule) => r.status === "INACTIVE").length ?? 0;
  const avgScore = rules?.length
    ? Math.round(rules.reduce((s: number, r: AmlRule) => s + r.baseScore, 0) / rules.length)
    : 0;

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* ── Sticky Header ─────────────────────────────────────────────── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 20,
          background: "var(--wr-page)",
          paddingBottom: 12,
          borderBottom: "1px solid var(--wr-border)",
          marginLeft: -24, marginRight: -24, paddingLeft: 24, paddingRight: 24,
          marginTop: -24, paddingTop: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 2px", display: "flex", alignItems: "center", gap: 8 }}>
                <Shield size={16} style={{ color: C.blue, flexShrink: 0 }} /> {t.amlRules.title}
              </h1>
              <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
                {t.amlRules.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {pageTab === "rules" && canEdit && rules?.length === 0 && (
                <Button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
                  variant="secondary" size="sm" icon={FlaskConical}>
                  {seedMut.isPending ? t.common.loading : t.amlRules.loadBamRules}
                </Button>
              )}
              {pageTab === "rules" && canEdit && (
                <Button onClick={() => setShowCreate(true)}
                  variant="primary" size="md" icon={Plus}>
                  {t.amlRules.addRule}
                </Button>
              )}
            </div>
          </div>

          {/* Page-level tabs */}
          <div className="flex gap-0 mt-3" style={{ borderBottom: "1px solid var(--wr-border)" }}>
            {([
              ["rules",         "Règles AML",     Shield],
              ["jurisdictions", "Juridictions",   Globe ],
            ] as [typeof pageTab, string, React.ElementType][]).map(([t, label, Icon]) => (
              <button key={t} onClick={() => setPageTab(t)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono border-b-2 transition-colors ${
                  pageTab === t
                    ? "border-[var(--wr-blue)] text-[var(--wr-blue)]"
                    : "border-transparent text-[var(--wr-text-3)] hover:text-[var(--wr-text-1)]"
                }`}>
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab: Règles AML */}
        {pageTab === "rules" && (
          <>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                { label: "Actives",     val: active,   sub: "en production",      color: C.green, filter: "ACTIVE" as const },
                { label: "En test A/B", val: testing,  sub: "sans alerte réelle", color: C.amber, filter: "TESTING" as const },
                { label: "Inactives",   val: inactive, sub: "désactivées",        color: C.text4, filter: "INACTIVE" as const },
                { label: "Score moyen", val: avgScore, sub: "sur 100",            color: C.blue,  filter: "ALL" as const },
              ].map(({ label, val, sub, color, filter }) => (
                <button key={label} onClick={() => setFilterStatus(filter === filterStatus ? "ALL" : filter)}
                  style={{
                    background: filterStatus === filter && filter !== "ALL" ? "var(--wr-hover)" : C.surface,
                    border: `1px solid ${filterStatus === filter && filter !== "ALL" ? "var(--wr-border2)" : C.border}`,
                    borderRadius: 8, padding: "10px 14px", textAlign: "left",
                    cursor: "pointer", transition: "all 0.15s",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 22, fontWeight: 600, fontFamily: C.mono, color }}>{val}</div>
                    {filterStatus === filter && filter !== "ALL" && (
                      <Activity size={12} style={{ color, opacity: 0.7 }} />
                    )}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text1, marginTop: 2 }}>{label}</div>
                  <div style={{ fontSize: 9,  fontFamily: C.mono, color: C.text4, marginTop: 2 }}>{sub}</div>
                </button>
              ))}
            </div>

            {/* Search + Filter bar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px",
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
            }}>
              <Search size={14} style={{ color: C.text3, flexShrink: 0 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher par nom, description ou ID..."
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  fontSize: 12, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-1)",
                }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)",
                }}>Effacer</button>
              )}
              <div style={{ width: 1, height: 16, background: "var(--wr-border)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Filter size={11} style={{ color: C.text3 }} />
                <span style={{ fontSize: 10, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)" }}>
                  {filteredRules?.length ?? 0}/{rules?.length ?? 0}
                </span>
              </div>
            </div>

            {/* Liste */}
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ height: 64, borderRadius: 8, background: "var(--wr-hover)" }} className="wr-skeleton" />
                ))}
              </div>
            ) : !rules?.length ? (
              <div className="text-center py-16 border border-dashed border-[var(--wr-border)] rounded-lg">
                <Shield size={32} className="mx-auto text-[var(--wr-border)] mb-3" />
                <p className="text-sm font-mono text-[var(--wr-text-4)]">{t.amlRules.noRules}</p>
                <p className="text-[10px] font-mono text-[var(--wr-text-4)] mt-1 mb-4">
                  Cliquez sur "Charger règles BAM" pour démarrer avec les règles BAM Maroc pré-configurées
                </p>
                {canEdit && (
                  <Button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
                    variant="primary" size="md" icon={FlaskConical}>
                    {seedMut.isPending ? t.common.loading : t.amlRules.loadBamRules}
                  </Button>
                )}
              </div>
            ) : filteredRules?.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-[var(--wr-border)] rounded-lg">
                <Search size={24} className="mx-auto text-[var(--wr-border)] mb-2" />
                <p className="text-xs font-mono text-[var(--wr-text-4)]">
                  Aucune règle ne correspond à votre recherche
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRules!.map((rule: AmlRule) => (
                  <RuleCard key={rule.id} rule={rule} canEdit={canEdit} canDelete={canDelete} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab: Juridictions */}
        {pageTab === "jurisdictions" && (
          <JurisdictionsPanel canEdit={canEdit} />
        )}
      </div>

      {showCreate && <RuleModal onClose={() => setShowCreate(false)} />}
    </AppLayout>
  );
}
