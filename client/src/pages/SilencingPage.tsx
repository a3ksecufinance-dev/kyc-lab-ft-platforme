import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { useI18n } from "../hooks/useI18n";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { formatRelative } from "../lib/utils";
import {
  VolumeX, Plus, X, Trash2,
  ChevronLeft, ChevronRight,
} from "lucide-react";

const C = {
  surface: "var(--wr-card)",
  border:  "var(--wr-border)",
  border2: "var(--wr-border2)",
  text1:   "var(--wr-text-1)",
  text2:   "var(--wr-text-2)",
  text3:   "var(--wr-text-3)",
  gold:    "var(--wr-gold)",
  red:     "var(--wr-red)",
  amber:   "var(--wr-amber)",
  green:   "var(--wr-green)",
  blue:    "var(--wr-blue)",
  mono:    "var(--wr-font-mono)",
  serif:   "var(--wr-font-serif)",
};

const MATCHER_FIELDS = ["scenario", "alertType", "priority", "customerId", "ruleId"] as const;

function getRuleStatus(rule: { isActive: boolean; validUntil: string | Date; matchCount: number; maxMatches: number | null }, t: { silencing: { active: string; revoked: string; expired: string; exhausted: string } }) {
  if (!rule.isActive) return { label: t.silencing.revoked, color: C.red };
  if (new Date(rule.validUntil) < new Date()) return { label: t.silencing.expired, color: C.text3 };
  if (rule.maxMatches && rule.matchCount >= rule.maxMatches) return { label: t.silencing.exhausted, color: C.amber };
  return { label: t.silencing.active, color: C.green };
}

export function SilencingPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isSupervisor = hasRole(user, "supervisor");

  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [revokeId, setRevokeId] = useState<number | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formValidFrom, setFormValidFrom] = useState("");
  const [formValidUntil, setFormValidUntil] = useState("");
  const [formMaxMatches, setFormMaxMatches] = useState("");
  const [matchers, setMatchers] = useState<{ key: string; value: string }[]>([{ key: "scenario", value: "" }]);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.silencing.list.useQuery({ page, limit: 20 });
  const createMutation = trpc.silencing.create.useMutation({
    onSuccess: () => {
      utils.silencing.list.invalidate();
      setShowCreate(false);
      resetForm();
    },
  });
  const revokeMutation = trpc.silencing.revoke.useMutation({
    onSuccess: () => {
      utils.silencing.list.invalidate();
      setRevokeId(null);
    },
  });

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormValidFrom("");
    setFormValidUntil("");
    setFormMaxMatches("");
    setMatchers([{ key: "scenario", value: "" }]);
  }

  function handleCreate() {
    if (!formName || formName.length < 3 || !formValidUntil) return;
    const matcherObj: Record<string, unknown> = {};
    for (const m of matchers) {
      if (m.key && m.value) {
        matcherObj[m.key] = m.key === "customerId" ? parseInt(m.value, 10) : m.value;
      }
    }
    if (Object.keys(matcherObj).length === 0) return;

    createMutation.mutate({
      name: formName,
      description: formDescription || null,
      matchers: matcherObj,
      validUntil: new Date(formValidUntil).toISOString(),
      ...(formValidFrom ? { validFrom: new Date(formValidFrom).toISOString() } : {}),
      ...(formMaxMatches ? { maxMatches: parseInt(formMaxMatches, 10) } : {}),
    });
  }

  function addMatcher() {
    setMatchers([...matchers, { key: "alertType", value: "" }]);
  }

  function removeMatcher(idx: number) {
    setMatchers(matchers.filter((_, i) => i !== idx));
  }

  function updateMatcher(idx: number, field: "key" | "value", val: string) {
    const copy = [...matchers];
    copy[idx] = { ...copy[idx]!, [field]: val };
    setMatchers(copy);
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <AppLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 20,
          background: "var(--wr-bg)", padding: "16px 0 12px",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px" }}>
              {t.silencing.title}
            </h1>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
              {t.silencing.subtitle} — {total} {total === 1 ? "règle" : "règles"}
            </p>
          </div>
          {isSupervisor && (
            <Button variant="gold" icon={Plus} onClick={() => setShowCreate(true)}>
              {t.silencing.addRule}
            </Button>
          )}
        </div>

        {/* Create form */}
        {showCreate && (
          <div style={{
            background: C.surface, border: `1px solid ${C.gold}30`,
            borderRadius: 10, padding: 20,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontFamily: C.mono, color: C.gold, fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                {t.silencing.addRule}
              </p>
              <button onClick={() => { setShowCreate(false); resetForm(); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.text3 }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.silencing.name} *</span>
                <input
                  value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="Ex: Silence test scenario"
                  style={{ padding: "8px 12px", fontSize: 12, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text1, outline: "none" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.silencing.description}</span>
                <input
                  value={formDescription} onChange={e => setFormDescription(e.target.value)}
                  style={{ padding: "8px 12px", fontSize: 12, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text1, outline: "none" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.silencing.validFrom}</span>
                <input
                  type="datetime-local" value={formValidFrom} onChange={e => setFormValidFrom(e.target.value)}
                  style={{ padding: "8px 12px", fontSize: 12, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text1, outline: "none" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.silencing.validUntil} *</span>
                <input
                  type="datetime-local" value={formValidUntil} onChange={e => setFormValidUntil(e.target.value)}
                  style={{ padding: "8px 12px", fontSize: 12, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text1, outline: "none" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.silencing.maxMatches} ({t.silencing.unlimited})</span>
                <input
                  type="number" value={formMaxMatches} onChange={e => setFormMaxMatches(e.target.value)}
                  placeholder="∞"
                  style={{ padding: "8px 12px", fontSize: 12, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text1, outline: "none" }}
                />
              </label>
            </div>

            {/* Matchers */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {t.silencing.matchers} *
                </span>
                <Button variant="ghost" size="sm" icon={Plus} onClick={addMatcher}>
                  {t.silencing.addMatcher}
                </Button>
              </div>
              <p style={{ fontSize: 9, fontFamily: C.mono, color: C.text3, margin: "0 0 8px", fontStyle: "italic" }}>
                {t.silencing.matcherFields}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {matchers.map((m, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      value={m.key}
                      onChange={e => updateMatcher(idx, "key", e.target.value)}
                      style={{ padding: "6px 10px", fontSize: 11, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 6, color: C.text1, outline: "none", width: 160 }}
                    >
                      {MATCHER_FIELDS.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    <input
                      value={m.value}
                      onChange={e => updateMatcher(idx, "value", e.target.value)}
                      placeholder={t.silencing.matcherValue}
                      style={{ flex: 1, padding: "6px 10px", fontSize: 11, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 6, color: C.text1, outline: "none" }}
                    />
                    {matchers.length > 1 && (
                      <button onClick={() => removeMatcher(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, padding: 4 }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Button variant="secondary" onClick={() => { setShowCreate(false); resetForm(); }}>
                {t.common.cancel}
              </Button>
              <Button
                variant="gold"
                icon={VolumeX}
                onClick={handleCreate}
                disabled={createMutation.isPending || formName.length < 3 || !formValidUntil || !matchers.some(m => m.key && m.value)}
              >
                {createMutation.isPending ? t.common.loading : t.silencing.addRule}
              </Button>
            </div>
          </div>
        )}

        {/* Rules list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {isLoading && (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3 }}>{t.common.loading}</p>
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "40px 18px", textAlign: "center" }}>
              <VolumeX size={24} style={{ color: C.text3, marginBottom: 8 }} />
              <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3 }}>{t.silencing.noRules}</p>
            </div>
          )}

          {rows.map((rule: {
            id: number; name: string; description: string | null;
            matchers: Record<string, unknown>;
            validFrom: string | Date; validUntil: string | Date;
            isActive: boolean; matchCount: number; maxMatches: number | null;
            createdBy: number; revokedAt: string | Date | null;
            createdAt: string | Date;
          }) => {
            const status = getRuleStatus(rule, t);
            const matcherEntries = Object.entries(rule.matchers as Record<string, unknown>);

            return (
              <div
                key={rule.id}
                style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: "14px 18px",
                  opacity: rule.isActive && new Date(rule.validUntil) >= new Date() ? 1 : 0.55,
                  transition: "all 0.12s",
                }}
              >
                {/* Top row: name + status + actions */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <VolumeX size={14} style={{ color: status.color }} />
                    <span style={{ fontSize: 13, fontFamily: C.mono, color: C.text1, fontWeight: 600 }}>
                      {rule.name}
                    </span>
                    <span style={{
                      fontSize: 9, fontFamily: C.mono, padding: "2px 8px", borderRadius: 4,
                      background: `${status.color}14`, border: `1px solid ${status.color}30`,
                      color: status.color, fontWeight: 600,
                    }}>
                      {status.label}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Match counter */}
                    <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>
                      {t.silencing.matchCount}: <strong style={{ color: C.text1 }}>{rule.matchCount}</strong>
                      {rule.maxMatches ? ` / ${rule.maxMatches}` : ` (${t.silencing.unlimited})`}
                    </span>

                    {rule.isActive && isSupervisor && (
                      <Button variant="danger" size="sm" onClick={() => setRevokeId(rule.id)}>
                        {t.silencing.revokeRule}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Description */}
                {rule.description && (
                  <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 8px" }}>
                    {rule.description}
                  </p>
                )}

                {/* Matchers + metadata row */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {/* Matcher pills */}
                  {matcherEntries.map(([k, v]) => (
                    <span key={k} style={{
                      fontSize: 10, fontFamily: C.mono, padding: "3px 8px", borderRadius: 4,
                      background: `${C.blue}12`, border: `1px solid ${C.blue}25`, color: C.blue,
                    }}>
                      {k} = {String(v)}
                    </span>
                  ))}

                  <span style={{ width: 1, height: 14, background: C.border }} />

                  {/* Dates */}
                  <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>
                    {new Date(rule.validFrom).toLocaleDateString()} → {new Date(rule.validUntil).toLocaleDateString()}
                  </span>

                  <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>
                    #{rule.createdBy} · {formatRelative(rule.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
            <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              {""}
            </Button>
            <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text3 }}>
              {page} / {totalPages}
            </span>
            <Button variant="ghost" size="sm" icon={ChevronRight} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              {""}
            </Button>
          </div>
        )}

        {/* Revoke confirm modal */}
        {revokeId != null && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
          }} onClick={() => setRevokeId(null)}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: C.surface, border: `1px solid ${C.red}30`,
                borderRadius: 10, padding: 24, width: 380, maxWidth: "90vw",
              }}
            >
              <p style={{ fontSize: 13, fontFamily: C.mono, color: C.red, fontWeight: 600, margin: "0 0 16px" }}>
                {t.silencing.confirmRevoke}
              </p>
              <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: "0 0 16px" }}>
                Rule #{revokeId}
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="secondary" onClick={() => setRevokeId(null)}>
                  {t.common.cancel}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => { if (revokeId != null) revokeMutation.mutate({ id: revokeId }); }}
                  disabled={revokeMutation.isPending}
                >
                  {revokeMutation.isPending ? t.common.loading : t.silencing.revokeRule}
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
