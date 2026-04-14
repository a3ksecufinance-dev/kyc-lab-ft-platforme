import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { trpc } from "../lib/trpc";
import { formatDateTime, formatRelative, formatNumber } from "../lib/utils";
import {
  Shield, Activity, Plus, Key, ToggleLeft, ToggleRight, Brain, Eye, ShieldOff,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";

const C = {
  surface: "var(--wr-card)",
  border:  "var(--wr-border)",
  border2: "var(--wr-border2)",
  text1:   "var(--wr-text-1)",
  text2:   "var(--wr-text-2)",
  text3:   "var(--wr-text-3)",
  text4:   "var(--wr-text-4)",
  gold:    "var(--wr-gold)",
  red:     "var(--wr-red)",
  amber:   "var(--wr-amber)",
  green:   "var(--wr-green)",
  blue:    "var(--wr-blue)",
  mono:    "var(--wr-font-mono)",
  serif:   "var(--wr-font-serif)",
  hover:   "var(--wr-hover)",
};

type User = {
  id: number; email: string; name: string;
  role: "user" | "analyst" | "supervisor" | "compliance_officer" | "admin";
  department: string | null; isActive: boolean;
  lastSignedIn: Date | null; createdAt: Date;
  mfaEnabled?: boolean;
};

type AuditLog = {
  id: number; userId: number | null; action: string;
  entityType: string; entityId: string | null;
  details: unknown; ipAddress: string | null; createdAt: Date;
};

// ROLE_OPTIONS is now generated inside components using t.admin.roles.*

const ACTION_COLORS: Record<string, string> = {
  AUTH_LOGIN:            "green",
  AUTH_LOGIN_FAILED:     "red",
  AUTH_LOGOUT:           "text4",
  USER_ROLE_CHANGED:     "amber",
  USER_DEACTIVATED:      "red",
  AUTH_PASSWORD_CHANGED: "amber",
  REPORT_SUBMITTED:      "blue",
  REPORT_APPROVED:       "green",
  REPORT_REJECTED:       "red",
  CASE_CREATED:          "blue",
  SCREENING_MATCH_FOUND: "red",
  ALERT_ESCALATED:       "red",
  TRANSACTION_BLOCKED:   "red",
};

function actionColor(action: string): string {
  const key = ACTION_COLORS[action];
  if (!key) return C.text1;
  if (key === "green") return C.green;
  if (key === "red")   return C.red;
  if (key === "amber") return C.amber;
  if (key === "blue")  return C.blue;
  return C.text4;
}

// ─── Onglets ──────────────────────────────────────────────────────────────────

type Tab = "users" | "audit" | "ml";

export function AdminPage() {
  const { t } = useI18n();
  const { user: me } = useAuth();
  const [tab, setTab] = useState<Tab>("users");

  const tabs = [
    { key: "users" as Tab, label: t.admin.users },
    { key: "audit" as Tab, label: t.admin.auditLog },
    { key: "ml"    as Tab, label: "ML / Scoring" },
  ];

  return (
    <AppLayout>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px" }}>{t.admin.title}</h1>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>{t.admin.subtitle}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: `${C.red}14`, border: `1px solid ${C.red}40`, borderRadius: 6 }}>
          <Shield size={11} style={{ color: C.red }} />
          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.red }}>ADMIN ONLY</span>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
        {tabs.map((t2) => (
          <button key={t2.key} onClick={() => setTab(t2.key)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 14px", fontSize: 11, fontFamily: C.mono,
            color: tab === t2.key ? C.gold : C.text3,
            background: "none", border: "none", borderBottom: `2px solid ${tab === t2.key ? C.gold : "transparent"}`,
            cursor: "pointer", marginBottom: -1,
          }}>
            {t2.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab meId={me?.id ?? undefined} />}
      {tab === "audit" && <AuditTab />}
      {tab === "ml" && <MlTab />}
    </AppLayout>
  );
}

// ─── Tab Utilisateurs ─────────────────────────────────────────────────────────

function UsersTab({ meId }: { meId?: number | undefined }) {
  const { t } = useI18n();
  const ROLE_OPTIONS = [
    { value: "analyst",            label: t.admin.roles.analyst },
    { value: "supervisor",         label: t.admin.roles.supervisor },
    { value: "compliance_officer", label: t.admin.roles.compliance_officer },
    { value: "admin",              label: t.admin.roles.admin },
  ];
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [detailTarget, setDetailTarget] = useState<User | null>(null);
  const [mfaTarget, setMfaTarget] = useState<User | null>(null);

  const { data: userDetail } = trpc.admin.getUser.useQuery(
    { id: detailTarget?.id ?? 0 }, { enabled: !!detailTarget }
  );

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.listUsers.useQuery({
    page, limit: 20,
    ...(search     ? { search }     : {}),
    ...(roleFilter ? { role: roleFilter as User["role"] } : {}),
  }, { placeholderData: keepPreviousData });

  const updateMutation  = trpc.admin.updateUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setEditTarget(null); },
  });
  const resetMutation   = trpc.admin.resetPassword.useMutation({
    onSuccess: () => { setResetTarget(null); setNewPassword(""); },
  });
  const mfaResetMutation = trpc.admin.adminMfaReset.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); setMfaTarget(null); },
  });

  const COLUMNS: Column<User>[] = [
    {
      key: "name", header: t.common.name,
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${C.blue}1a`, border: `1px solid ${C.blue}4d`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontFamily: C.mono, color: C.blue }}>{r.name.charAt(0).toUpperCase()}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, color: C.text1, fontWeight: 500, margin: "0 0 1px" }}>{r.name}</p>
            <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role", header: t.admin.role, width: "w-40",
      render: (r) => (
        <div>
          <Badge label={r.role} />
          {r.department && <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, marginTop: 2 }}>{r.department}</p>}
        </div>
      ),
    },
    {
      key: "status", header: t.common.status, width: "w-24",
      render: (r) => r.isActive
        ? <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: C.mono, color: C.green }}><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />{t.admin.active}</span>
        : <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: C.mono, color: C.text4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.text4, display: "inline-block" }} />{t.admin.inactive}</span>,
    },
    {
      key: "mfa", header: "MFA", width: "w-16",
      render: (r) => r.mfaEnabled
        ? <span title="MFA activé" style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontFamily: C.mono, color: C.green }}><Shield size={10} />ON</span>
        : <span title="MFA désactivé" style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontFamily: C.mono, color: C.text4 }}><ShieldOff size={10} />OFF</span>,
    },
    {
      key: "lastSeen", header: t.admin.lastLogin, width: "w-36",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text3 }}>{r.lastSignedIn ? formatRelative(r.lastSignedIn) : "Jamais"}</span>,
    },
    {
      key: "created", header: t.common.date, width: "w-28",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text3 }}>{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: "actions", header: "", width: "w-32",
      render: (r) => r.id === meId ? (
        <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text4 }}>Vous</span>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDetailTarget(r); }}
            style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 3 }}><Eye size={10} /></button>
          <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); setEditTarget(r); }}
            style={{ fontSize: 10, fontFamily: C.mono, color: C.blue, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>{t.admin.editUser}</button>
          <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); setResetTarget(r); }}
            style={{ fontSize: 10, fontFamily: C.mono, color: C.amber, background: "none", border: "none", cursor: "pointer", padding: 0 }}>MDP</button>
          <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); setMfaTarget(r); }}
            title="Gérer le MFA"
            style={{ fontSize: 10, fontFamily: C.mono, color: r.mfaEnabled ? C.green : C.text4, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}><Shield size={10} /></button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearch(e.target.value); setPage(1); }}
          placeholder={`${t.common.search}...`}
          style={{ flex: 1, minWidth: 192, background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text1, outline: "none" }}
        />
        <select
          value={roleFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setRoleFilter(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
        >
          <option value="">{t.common.all}</option>
          {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button
          onClick={() => setShowCreate(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, fontSize: 11, fontFamily: C.mono, color: C.blue, cursor: "pointer" }}
        >
          <Plus size={12} /> {t.admin.addUser}
        </button>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <DataTable
          columns={COLUMNS}
          data={(data?.data ?? []) as User[]}
          keyFn={(r) => r.id}
          isLoading={isLoading}
          total={data?.total}
          page={page}
          limit={20}
          onPageChange={setPage}
          emptyMessage={t.common.noData}
        />
      </div>

      {/* Modal création */}
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}

      {/* Modal édition */}
      {editTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 384 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, marginBottom: 16, marginTop: 0 }}>
              Modifier — {editTarget.name}
            </h3>
            <EditUserForm
              user={editTarget}
              onSave={(patch) => updateMutation.mutate({ id: editTarget.id, ...patch })}
              onClose={() => setEditTarget(null)}
              isPending={updateMutation.isPending}
            />
          </div>
        </div>
      )}

      {/* Modal reset MDP */}
      {resetTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.amber}40`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 384 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Key size={15} style={{ color: C.amber }} />
              <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: 0 }}>Réinitialiser le mot de passe</h3>
            </div>
            <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, marginBottom: 16, marginTop: 0 }}>{resetTarget.email}</p>
            <input
              type="password" value={newPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
              placeholder="Nouveau mot de passe (min 8 caractères)"
              style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setResetTarget(null); setNewPassword(""); }}
                style={{ flex: 1, padding: "8px 0", fontSize: 11, fontFamily: C.mono, background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, cursor: "pointer" }}>{t.common.cancel}</button>
              <button
                disabled={newPassword.length < 8 || resetMutation.isPending}
                onClick={() => resetMutation.mutate({ id: resetTarget.id, newPassword })}
                style={{ flex: 1, padding: "8px 0", fontSize: 11, fontFamily: C.mono, background: `${C.amber}14`, border: `1px solid ${C.amber}40`, borderRadius: 7, color: C.amber, cursor: "pointer", opacity: (newPassword.length < 8 || resetMutation.isPending) ? 0.4 : 1 }}
              >
                {resetMutation.isPending ? "En cours..." : "Réinitialiser"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal MFA admin */}
      {mfaTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 384 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Shield size={15} style={{ color: mfaTarget.mfaEnabled ? C.green : C.text4 }} />
              <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, margin: 0 }}>Gestion MFA</h3>
            </div>
            <p style={{ fontSize: 12, fontFamily: C.mono, color: C.text3, marginBottom: 16, marginTop: 0 }}>{mfaTarget.name} — {mfaTarget.email}</p>
            <div style={{ background: C.hover, borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              {mfaTarget.mfaEnabled
                ? <><Shield size={13} style={{ color: C.green }} /><span style={{ fontSize: 12, fontFamily: C.mono, color: C.green }}>MFA activé</span></>
                : <><ShieldOff size={13} style={{ color: C.text4 }} /><span style={{ fontSize: 12, fontFamily: C.mono, color: C.text4 }}>MFA non activé</span></>}
            </div>
            {mfaTarget.mfaEnabled && (
              <div style={{ background: `${C.red}0d`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontFamily: C.mono, color: C.red, margin: 0 }}>
                  Réinitialiser le MFA supprimera le secret TOTP et tous les codes de secours de cet utilisateur. L'utilisateur devra reconfigurer son application d'authentification.
                </p>
              </div>
            )}
            {mfaResetMutation.error && (
              <p style={{ fontSize: 11, fontFamily: C.mono, color: C.red, marginBottom: 12 }}>{mfaResetMutation.error.message}</p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setMfaTarget(null); mfaResetMutation.reset(); }}
                style={{ flex: 1, padding: "8px 0", fontSize: 11, fontFamily: C.mono, background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, cursor: "pointer" }}>Fermer</button>
              {mfaTarget.mfaEnabled && (
                <button
                  disabled={mfaResetMutation.isPending}
                  onClick={() => mfaResetMutation.mutate({ id: mfaTarget.id })}
                  style={{ flex: 1, padding: "8px 0", fontSize: 11, fontFamily: C.mono, background: `${C.red}14`, border: `1px solid ${C.red}40`, borderRadius: 7, color: C.red, cursor: "pointer", opacity: mfaResetMutation.isPending ? 0.4 : 1 }}
                >
                  {mfaResetMutation.isPending ? "Réinitialisation..." : "Réinitialiser le MFA"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail utilisateur */}
      {detailTarget && userDetail && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 400 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${C.blue}1a`, border: `1px solid ${C.blue}4d`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 16, fontFamily: C.mono, color: C.blue }}>{userDetail.name.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.text1, margin: 0 }}>{userDetail.name}</p>
                <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>{userDetail.email}</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Rôle",           value: userDetail.role },
                { label: "Département",    value: userDetail.department ?? "—" },
                { label: "Statut",         value: userDetail.isActive ? "Actif" : "Inactif" },
                { label: "Dernière conn.", value: userDetail.lastSignedIn ? formatRelative(userDetail.lastSignedIn) : "Jamais" },
                { label: "Créé le",        value: formatDateTime(userDetail.createdAt) },
                { label: "MFA",            value: userDetail.mfaEnabled ? "Activé" : "Désactivé" },
                ...(userDetail.mfaEnabled ? [
                  { label: "MFA activé le", value: userDetail.mfaEnabledAt ? formatDateTime(userDetail.mfaEnabledAt) : "—" },
                  { label: "Codes secours", value: `${userDetail.backupCodesLeft} restant(s)` },
                ] : []),
              ].map(({ label, value }) => (
                <div key={label} style={{ background: C.hover, borderRadius: 6, padding: "8px 10px" }}>
                  <p style={{ fontSize: 9, fontFamily: C.mono, textTransform: "uppercase", letterSpacing: "0.1em", color: C.text3, margin: "0 0 2px" }}>{label}</p>
                  <p style={{ fontSize: 11, fontFamily: C.mono, color: label === "MFA" ? (userDetail.mfaEnabled ? C.green : C.text4) : C.text1, margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setDetailTarget(null)}
              style={{ width: "100%", padding: "7px 0", fontSize: 12, fontFamily: C.mono, color: C.text3, background: "none", border: `1px solid ${C.border2}`, borderRadius: 7, cursor: "pointer" }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function EditUserForm({ user, onSave, onClose, isPending }: {
  user: User;
  onSave: (patch: { name?: string; role?: User["role"]; department?: string; isActive?: boolean }) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const { t } = useI18n();
  const ROLE_OPTIONS = [
    { value: "analyst",            label: t.admin.roles.analyst },
    { value: "supervisor",         label: t.admin.roles.supervisor },
    { value: "compliance_officer", label: t.admin.roles.compliance_officer },
    { value: "admin",              label: t.admin.roles.admin },
  ];
  const [name, setName]         = useState(user.name);
  const [role, setRole]         = useState<User["role"]>(user.role);
  const [dept, setDept]         = useState(user.department ?? "");
  const [isActive, setIsActive] = useState(user.isActive);

  const fieldStyle = { width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box" as const };
  const labelStyle = { display: "block", fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 6 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={labelStyle}>{t.common.name}</label>
        <input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} style={fieldStyle} />
      </div>
      <div>
        <label style={labelStyle}>{t.admin.role}</label>
        <select value={role} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRole(e.target.value as User["role"])}
          style={{ ...fieldStyle, color: C.text2 }}>
          {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Département</label>
        <input value={dept} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDept(e.target.value)}
          placeholder="Ex : Compliance, Back-office..."
          style={fieldStyle} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
        <span style={{ fontSize: 12, fontFamily: C.mono, color: C.text2 }}>Compte actif</span>
        <button onClick={() => setIsActive(!isActive)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          {isActive
            ? <ToggleRight size={22} style={{ color: C.green }} />
            : <ToggleLeft  size={22} style={{ color: C.text4 }} />}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
        <button onClick={onClose}
          style={{ flex: 1, padding: "8px 0", fontSize: 11, fontFamily: C.mono, background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, cursor: "pointer" }}>{t.common.cancel}</button>
        <button
          disabled={isPending}
          onClick={() => onSave({
            ...(name !== user.name         ? { name }     : {}),
            ...(role !== user.role         ? { role }     : {}),
            ...(dept !== (user.department ?? "") ? { department: dept } : {}),
            ...(isActive !== user.isActive ? { isActive } : {}),
          })}
          style={{ flex: 1, padding: "8px 0", fontSize: 11, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: isPending ? 0.4 : 1 }}
        >
          {isPending ? "Enregistrement..." : t.common.save}
        </button>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const ROLE_OPTIONS = [
    { value: "analyst",            label: t.admin.roles.analyst },
    { value: "supervisor",         label: t.admin.roles.supervisor },
    { value: "compliance_officer", label: t.admin.roles.compliance_officer },
    { value: "admin",              label: t.admin.roles.admin },
  ];
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    email: "", name: "", password: "", role: "analyst" as User["role"], department: "",
  });
  const mutation = trpc.admin.createUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); onClose(); },
  });

  const fieldStyle = { width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: C.mono, color: C.text1, outline: "none", boxSizing: "border-box" as const };
  const labelStyle = { display: "block", fontSize: 9, fontFamily: C.mono, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 384 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: C.mono, color: C.text1, marginBottom: 16, marginTop: 0 }}>Nouvel utilisateur</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { key: "email",    label: "Email *",      type: "email",    placeholder: "utilisateur@domaine.com" },
            { key: "name",     label: "Nom *",        type: "text",     placeholder: "Jean Dupont" },
            { key: "password", label: "Mot de passe *", type: "password", placeholder: "Min 8 caractères" },
            { key: "department", label: "Département", type: "text",   placeholder: "Compliance, Back-office..." },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input type={type} value={form[key as keyof typeof form]}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f: typeof form) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                style={fieldStyle}
              />
            </div>
          ))}
          <div>
            <label style={labelStyle}>{t.admin.role} *</label>
            <select value={form.role} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, role: e.target.value as User["role"] }))}
              style={{ ...fieldStyle, color: C.text2 }}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        {mutation.error && <p style={{ marginTop: 12, fontSize: 12, fontFamily: C.mono, color: C.red }}>{mutation.error.message}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: "8px 0", fontSize: 11, fontFamily: C.mono, background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.text2, cursor: "pointer" }}>{t.common.cancel}</button>
          <button
            disabled={!form.email || !form.name || form.password.length < 8 || mutation.isPending}
            onClick={() => mutation.mutate({
              email: form.email, name: form.name, password: form.password,
              role: form.role,
              ...(form.department ? { department: form.department } : {}),
            })}
            style={{ flex: 1, padding: "8px 0", fontSize: 11, fontFamily: C.mono, background: `${C.blue}14`, border: `1px solid ${C.blue}40`, borderRadius: 7, color: C.blue, cursor: "pointer", opacity: (!form.email || !form.name || form.password.length < 8 || mutation.isPending) ? 0.4 : 1 }}
          >
            {mutation.isPending ? "Création..." : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Audit ────────────────────────────────────────────────────────────────

function AuditTab() {
  const [page, setPage]           = useState(1);
  const [entityType, setEntityType] = useState("");
  const [action, setAction]       = useState("");

  const { data: stats } = trpc.admin.auditStats.useQuery();
  const { data, isLoading } = trpc.admin.listAuditLogs.useQuery({
    page, limit: 50,
    ...(entityType ? { entityType } : {}),
    ...(action     ? { action }     : {}),
  }, { placeholderData: keepPreviousData });

  const COLUMNS: Column<AuditLog>[] = [
    {
      key: "date", header: "Horodatage", width: "w-36",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text3 }}>{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: "user", header: "Utilisateur", width: "w-24",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text3 }}>{r.userId ? `#${r.userId}` : "—"}</span>,
    },
    {
      key: "action", header: "Action",
      render: (r) => (
        <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 500, color: actionColor(r.action) }}>
          {r.action}
        </span>
      ),
    },
    {
      key: "entity", header: "Entité", width: "w-36",
      render: (r) => (
        <div>
          <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>{r.entityType}</span>
          {r.entityId && <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text4 }}> #{r.entityId}</span>}
        </div>
      ),
    },
    {
      key: "ip", header: "IP", width: "w-28",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text4 }}>{r.ipAddress ?? "—"}</span>,
    },
  ];

  return (
    <>
      {/* Stats */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          <StatCard label="Total logs" value={formatNumber(stats.total)} icon={Activity} />
          <StatCard label="Dernières 24h" value={formatNumber(stats.last24h)} icon={Activity} accent="default" />
          <StatCard label="Derniers 7 jours" value={formatNumber(stats.last7d)} icon={Activity} />
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <select
          value={entityType}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setEntityType(e.target.value); setPage(1); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
        >
          <option value="">Toutes les entités</option>
          {stats && Object.keys(stats.byEntity).sort().map((e) => (
            <option key={e} value={e}>{e} ({stats.byEntity[e]})</option>
          ))}
        </select>
        <input
          value={action}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAction(e.target.value); setPage(1); }}
          placeholder="Filtrer par action..."
          style={{ flex: 1, maxWidth: 320, background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text1, outline: "none" }}
        />
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <DataTable
          columns={COLUMNS}
          data={(data?.data ?? []) as AuditLog[]}
          keyFn={(r) => r.id}
          isLoading={isLoading}
          total={data?.total}
          page={page}
          limit={50}
          onPageChange={setPage}
          emptyMessage="Aucun log d'audit"
        />
      </div>
    </>
  );
}

// ─── Tab ML / Scoring ─────────────────────────────────────────────────────────

function MlTab() {
  const { data: mlStatus } = trpc.admin.mlRetrainStatus.useQuery();
  const mlRetrainMut = trpc.admin.mlRetrain.useMutation();
  const seedMut = trpc.amlRules.seedDefaults.useMutation();

  return (
    <div style={{ maxWidth: 600 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-1)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <Brain size={14} style={{ color: "var(--wr-blue)" }} /> Moteur ML — Scoring de risque
      </h3>

      {/* Status card */}
      {mlStatus && (
        <div style={{ background: "var(--wr-card)", border: "1px solid var(--wr-border)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 8 }}>
            {[
              { label: "En cours",     value: mlStatus.isRunning ? "OUI" : "NON" },
              { label: "Dernier run",  value: mlStatus.lastRunAt ? new Date(mlStatus.lastRunAt).toLocaleDateString("fr-FR") : "—" },
              { label: "Statut run",   value: mlStatus.lastRunStatus ?? "—" },
              { label: "Prochain run", value: mlStatus.nextRunAt ? new Date(mlStatus.nextRunAt).toLocaleDateString("fr-FR") : "—" },
              { label: "Planification", value: mlStatus.config.auto ? mlStatus.config.cron : "Manuel" },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "var(--wr-hover)", borderRadius: 6, padding: "10px 12px" }}>
                <p style={{ fontSize: 9, fontFamily: "var(--wr-font-mono)", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--wr-text-3)", margin: "0 0 4px" }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--wr-font-mono)", color: "var(--wr-blue)", margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retrain */}
      <div style={{ background: "var(--wr-card)", border: "1px solid var(--wr-border)", borderRadius: 10, padding: 16 }}>
        <p style={{ fontSize: 12, color: "var(--wr-text-2)", margin: "0 0 12px", fontFamily: "var(--wr-font-mono)" }}>
          Lance un réentraînement complet du modèle ML sur les données de transactions et d'alertes récentes.
          Cette opération peut prendre plusieurs minutes.
        </p>
        {mlRetrainMut.data && (
          <div style={{ background: mlRetrainMut.data.success ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", border: `1px solid ${mlRetrainMut.data.success ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontFamily: "var(--wr-font-mono)", color: mlRetrainMut.data.success ? "var(--wr-green)" : "var(--wr-red)", margin: 0 }}>
              {mlRetrainMut.data.success ? `Réentraînement réussi — ${(mlRetrainMut.data as { message?: string }).message ?? ""}` : "Échec du réentraînement"}
            </p>
          </div>
        )}
        {mlRetrainMut.error && (
          <p style={{ fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-red)", marginBottom: 12 }}>{mlRetrainMut.error.message}</p>
        )}
        <button
          disabled={mlRetrainMut.isPending}
          onClick={() => mlRetrainMut.mutate({ force: true })}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "rgba(88,166,255,0.14)", border: "1px solid rgba(88,166,255,0.4)", borderRadius: 7, fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-blue)", cursor: "pointer", opacity: mlRetrainMut.isPending ? 0.5 : 1 }}
        >
          <Activity size={12} />
          {mlRetrainMut.isPending ? "Réentraînement en cours…" : "Lancer le réentraînement ML"}
        </button>
      </div>

      {/* Seed règles AML par défaut */}
      <div style={{ background: "var(--wr-card)", border: "1px solid var(--wr-border)", borderRadius: 10, padding: 16, marginTop: 12 }}>
        <h4 style={{ fontSize: 12, fontWeight: 600, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-1)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
          <Shield size={12} style={{ color: "var(--wr-amber)" }} /> Règles AML par défaut
        </h4>
        <p style={{ fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-text-3)", margin: "0 0 12px" }}>
          Initialise les règles AML de référence (OFAC, PEP, structuration, fréquence…). Sans effet si des règles existent déjà.
        </p>
        {seedMut.data && (
          <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 10, background: seedMut.data.seeded > 0 ? "rgba(52,211,153,0.1)" : "rgba(212,175,55,0.1)", border: `1px solid ${seedMut.data.seeded > 0 ? "rgba(52,211,153,0.3)" : "rgba(212,175,55,0.3)"}` }}>
            <p style={{ fontSize: 11, fontFamily: "var(--wr-font-mono)", margin: 0, color: seedMut.data.seeded > 0 ? "var(--wr-green)" : "var(--wr-amber)" }}>
              {seedMut.data.message} {seedMut.data.seeded > 0 && `(${seedMut.data.seeded} règles créées)`}
            </p>
          </div>
        )}
        {seedMut.error && (
          <p style={{ fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-red)", marginBottom: 10 }}>{seedMut.error.message}</p>
        )}
        <button
          disabled={seedMut.isPending}
          onClick={() => seedMut.mutate()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 7, fontSize: 11, fontFamily: "var(--wr-font-mono)", color: "var(--wr-amber)", cursor: "pointer", opacity: seedMut.isPending ? 0.5 : 1 }}
        >
          <Shield size={12} />
          {seedMut.isPending ? "Initialisation…" : "Initialiser les règles AML par défaut"}
        </button>
      </div>
    </div>
  );
}
