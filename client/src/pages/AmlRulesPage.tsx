/**
 * Sprint 5 — No-Code AML Rule Builder
 * Fichier : client/src/pages/AmlRulesPage.tsx
 *
 * Main page component — sub-components extracted to ./aml-rules/
 */

import { useState } from "react";
import type React from "react";
import { AppLayout }    from "../components/layout/AppLayout";
import { trpc }         from "../lib/trpc";
import { useAuth }      from "../hooks/useAuth";
import { hasRole }      from "../lib/auth";
import { useI18n }      from "../hooks/useI18n";
import {
  Shield, Plus, FlaskConical, Globe,
} from "lucide-react";

import { C, btnBlue, btnGhost, type AmlRule } from "./aml-rules/types";
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

  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.amlRules.list.useQuery();

  const seedMut = trpc.amlRules.seedDefaults.useMutation({
    onSuccess: () => utils.amlRules.list.invalidate(),
  });

  const active   = rules?.filter((r: AmlRule) => r.status === "ACTIVE").length   ?? 0;
  const testing  = rules?.filter((r: AmlRule) => r.status === "TESTING").length  ?? 0;
  const inactive = rules?.filter((r: AmlRule) => r.status === "INACTIVE").length ?? 0;
  const avgScore = rules?.length
    ? Math.round(rules.reduce((s: number, r: AmlRule) => s + r.baseScore, 0) / rules.length)
    : 0;

  return (
    <AppLayout>
      <div className="space-y-6">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={16} style={{ color: C.blue, flexShrink: 0 }} /> {t.amlRules.title}
            </h1>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
              {t.amlRules.subtitle}
            </p>
          </div>
          <div className="flex gap-2">
            {pageTab === "rules" && canEdit && rules?.length === 0 && (
              <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
                className={`${btnGhost} flex items-center gap-1.5`}>
                <FlaskConical size={12} />
                {seedMut.isPending ? t.common.loading : t.amlRules.loadBamRules}
              </button>
            )}
            {pageTab === "rules" && canEdit && (
              <button onClick={() => setShowCreate(true)}
                className={`${btnBlue} flex items-center gap-1.5`}>
                <Plus size={12} /> {t.amlRules.addRule}
              </button>
            )}
          </div>
        </div>

        {/* Page-level tabs */}
        <div className="flex gap-0 border-b border-[var(--wr-border)]">
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

        {/* Tab: Règles AML */}
        {pageTab === "rules" && (
          <>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                { label: "Actives",     val: active,   sub: "en production",      color: C.green },
                { label: "En test A/B", val: testing,  sub: "sans alerte réelle", color: C.amber },
                { label: "Inactives",   val: inactive, sub: "désactivées",        color: C.text4 },
                { label: "Score moyen", val: avgScore, sub: "sur 100",            color: C.blue  },
              ].map(({ label, val, sub, color }) => (
                <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 20, fontWeight: 500, fontFamily: C.mono, color }}>{val}</div>
                  <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text1, marginTop: 2 }}>{label}</div>
                  <div style={{ fontSize: 9,  fontFamily: C.mono, color: C.text4, marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Liste */}
            {isLoading ? (
              <div className="text-center py-12 text-[11px] font-mono text-[var(--wr-text-4)]">
                {t.common.loading}
              </div>
            ) : !rules?.length ? (
              <div className="text-center py-16 border border-dashed border-[var(--wr-border)] rounded-lg">
                <Shield size={32} className="mx-auto text-[var(--wr-border)] mb-3" />
                <p className="text-sm font-mono text-[var(--wr-text-4)]">{t.amlRules.noRules}</p>
                <p className="text-[10px] font-mono text-[var(--wr-text-4)] mt-1">
                  Cliquez sur "Charger règles BAM" pour démarrer avec les règles BAM Maroc pré-configurées
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule: AmlRule) => (
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
