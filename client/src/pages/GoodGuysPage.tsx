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
  ShieldCheck, Plus, X, UserCheck, Ban,
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

const CATEGORY_COLORS: Record<string, string> = {
  TRUSTED: C.green,
  INSTITUTIONAL: C.blue,
  GOVERNMENT: C.gold,
  REGULATORY: C.amber,
  TEMPORARY: C.text3,
};

export function GoodGuysPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isSupervisor = hasRole(user, "supervisor");

  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [revokeId, setRevokeId] = useState<number | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  // Form state
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formCategory, setFormCategory] = useState<"TRUSTED" | "INSTITUTIONAL" | "GOVERNMENT" | "REGULATORY" | "TEMPORARY">("TRUSTED");
  const [formValidUntil, setFormValidUntil] = useState("");

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.goodGuys.list.useQuery({ page, limit: 20 });
  const addMutation = trpc.goodGuys.add.useMutation({
    onSuccess: () => {
      utils.goodGuys.list.invalidate();
      setShowAdd(false);
      resetForm();
    },
  });
  const revokeMutation = trpc.goodGuys.revoke.useMutation({
    onSuccess: () => {
      utils.goodGuys.list.invalidate();
      setRevokeId(null);
      setRevokeReason("");
    },
  });

  function resetForm() {
    setFormCustomerId("");
    setFormReason("");
    setFormCategory("TRUSTED");
    setFormValidUntil("");
  }

  function handleAdd() {
    const cid = parseInt(formCustomerId, 10);
    if (isNaN(cid) || !formReason || formReason.length < 10) return;
    addMutation.mutate({
      customerId: cid,
      reason: formReason,
      category: formCategory,
      validUntil: formValidUntil ? new Date(formValidUntil).toISOString() : null,
    });
  }

  function handleRevoke() {
    if (revokeId == null || revokeReason.length < 10) return;
    revokeMutation.mutate({ id: revokeId, reason: revokeReason });
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const categoryLabel = (cat: string) => {
    const map: Record<string, string> = {
      TRUSTED: t.goodGuys.categoryTrusted,
      INSTITUTIONAL: t.goodGuys.categoryInstitutional,
      GOVERNMENT: t.goodGuys.categoryGovernment,
      REGULATORY: t.goodGuys.categoryRegulatory,
      TEMPORARY: t.goodGuys.categoryTemporary,
    };
    return map[cat] ?? cat;
  };

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
              {t.goodGuys.title}
            </h1>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
              {t.goodGuys.subtitle} — {total} {total === 1 ? "entrée" : "entrées"}
            </p>
          </div>
          {isSupervisor && (
            <Button variant="gold" icon={Plus} onClick={() => setShowAdd(true)}>
              {t.goodGuys.addEntry}
            </Button>
          )}
        </div>

        {/* Add form modal */}
        {showAdd && (
          <div style={{
            background: C.surface, border: `1px solid ${C.gold}30`,
            borderRadius: 10, padding: 20,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontFamily: C.mono, color: C.gold, fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                {t.goodGuys.addEntry}
              </p>
              <button onClick={() => { setShowAdd(false); resetForm(); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.text3 }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.goodGuys.customerId}</span>
                <input
                  type="number" value={formCustomerId} onChange={e => setFormCustomerId(e.target.value)}
                  placeholder="123"
                  style={{ padding: "8px 12px", fontSize: 12, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text1, outline: "none" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.goodGuys.category}</span>
                <select
                  value={formCategory} onChange={e => setFormCategory(e.target.value as typeof formCategory)}
                  style={{ padding: "8px 12px", fontSize: 12, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text1, outline: "none" }}
                >
                  {(["TRUSTED", "INSTITUTIONAL", "GOVERNMENT", "REGULATORY", "TEMPORARY"] as const).map(c => (
                    <option key={c} value={c}>{categoryLabel(c)}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.goodGuys.reason} (min 10 car.)</span>
                <textarea
                  value={formReason} onChange={e => setFormReason(e.target.value)}
                  rows={2}
                  style={{ padding: "8px 12px", fontSize: 12, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text1, outline: "none", resize: "vertical" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t.goodGuys.validUntil} ({t.goodGuys.permanent})</span>
                <input
                  type="date" value={formValidUntil} onChange={e => setFormValidUntil(e.target.value)}
                  style={{ padding: "8px 12px", fontSize: 12, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text1, outline: "none" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Button variant="secondary" onClick={() => { setShowAdd(false); resetForm(); }}>
                {t.common.cancel}
              </Button>
              <Button
                variant="gold"
                icon={UserCheck}
                onClick={handleAdd}
                disabled={addMutation.isPending || !formCustomerId || formReason.length < 10}
              >
                {addMutation.isPending ? t.common.loading : t.goodGuys.addEntry}
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "80px 1fr 120px 120px 120px 100px 80px",
            padding: "10px 18px",
            borderBottom: `1px solid ${C.border}`,
            gap: 8,
          }}>
            {[t.goodGuys.customerId, t.goodGuys.reason, t.goodGuys.category, t.goodGuys.validUntil, t.goodGuys.addedBy, t.goodGuys.status, ""].map((h, i) => (
              <span key={i} style={{ fontSize: 9, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600 }}>
                {h}
              </span>
            ))}
          </div>

          {/* Loading */}
          {isLoading && (
            <div style={{ padding: "40px 18px", textAlign: "center" }}>
              <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3 }}>{t.common.loading}</p>
            </div>
          )}

          {/* Empty */}
          {!isLoading && rows.length === 0 && (
            <div style={{ padding: "40px 18px", textAlign: "center" }}>
              <ShieldCheck size={24} style={{ color: C.text3, marginBottom: 8 }} />
              <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3 }}>{t.goodGuys.noEntries}</p>
            </div>
          )}

          {/* Rows */}
          {rows.map((row: {
            id: number; customerId: number; reason: string; category: string;
            validFrom: string | Date; validUntil: string | Date | null;
            isActive: boolean; addedBy: number; revokedAt: string | Date | null;
            createdAt: string | Date;
          }) => (
            <div
              key={row.id}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 120px 120px 120px 100px 80px",
                padding: "12px 18px",
                borderBottom: `1px solid ${C.border}20`,
                gap: 8,
                alignItems: "center",
                transition: "background 0.12s",
                opacity: row.isActive ? 1 : 0.5,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--wr-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 12, fontFamily: C.mono, color: C.blue, fontWeight: 600 }}>
                #{row.customerId}
              </span>

              <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.reason}
              </span>

              <span>
                <span style={{
                  fontSize: 10, fontFamily: C.mono, padding: "2px 8px", borderRadius: 4,
                  background: `${CATEGORY_COLORS[row.category] ?? C.text3}14`,
                  border: `1px solid ${CATEGORY_COLORS[row.category] ?? C.text3}30`,
                  color: CATEGORY_COLORS[row.category] ?? C.text3,
                }}>
                  {categoryLabel(row.category)}
                </span>
              </span>

              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>
                {row.validUntil ? new Date(row.validUntil).toLocaleDateString() : t.goodGuys.permanent}
              </span>

              <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>
                #{row.addedBy} · {formatRelative(row.createdAt)}
              </span>

              <span>
                {row.isActive ? (
                  <Badge label={t.goodGuys.active} variant="status" />
                ) : (
                  <span style={{ fontSize: 10, fontFamily: C.mono, color: C.red }}>{t.goodGuys.revoked}</span>
                )}
              </span>

              <span>
                {row.isActive && isSupervisor && (
                  <Button variant="danger" size="sm" icon={Ban} onClick={() => setRevokeId(row.id)}>
                    {t.goodGuys.revokeEntry}
                  </Button>
                )}
              </span>
            </div>
          ))}
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

        {/* Revoke modal */}
        {revokeId != null && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
          }} onClick={() => setRevokeId(null)}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: C.surface, border: `1px solid ${C.red}30`,
                borderRadius: 10, padding: 24, width: 400, maxWidth: "90vw",
              }}
            >
              <p style={{ fontSize: 13, fontFamily: C.mono, color: C.red, fontWeight: 600, margin: "0 0 16px" }}>
                {t.goodGuys.confirmRevoke}
              </p>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {t.goodGuys.revokeReason} (min 10 car.)
                </span>
                <textarea
                  value={revokeReason} onChange={e => setRevokeReason(e.target.value)}
                  rows={3}
                  style={{ padding: "8px 12px", fontSize: 12, fontFamily: C.mono, background: "var(--wr-hover)", border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text1, outline: "none", resize: "vertical" }}
                />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="secondary" onClick={() => { setRevokeId(null); setRevokeReason(""); }}>
                  {t.common.cancel}
                </Button>
                <Button
                  variant="danger" icon={Ban}
                  onClick={handleRevoke}
                  disabled={revokeMutation.isPending || revokeReason.length < 10}
                >
                  {revokeMutation.isPending ? t.common.loading : t.goodGuys.revokeEntry}
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
