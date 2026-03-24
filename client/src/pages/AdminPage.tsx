import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { trpc } from "../lib/trpc";
import { formatDateTime, formatRelative, formatNumber } from "../lib/utils";
import {
  Shield, Activity, Plus, Key, ToggleLeft, ToggleRight,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";

type User = {
  id: number; email: string; name: string;
  role: "user" | "analyst" | "supervisor" | "compliance_officer" | "admin";
  department: string | null; isActive: boolean;
  lastSignedIn: Date | null; createdAt: Date;
};

type AuditLog = {
  id: number; userId: number | null; action: string;
  entityType: string; entityId: string | null;
  details: unknown; ipAddress: string | null; createdAt: Date;
};

const ROLE_OPTIONS = [
  { value: "analyst",            label: "Analyste" },
  { value: "supervisor",         label: "Superviseur" },
  { value: "compliance_officer", label: "Compliance Officer" },
  { value: "admin",              label: "Administrateur" },
];

const ACTION_COLORS: Record<string, string> = {
  AUTH_LOGIN:          "text-emerald-400",
  AUTH_LOGIN_FAILED:   "text-red-400",
  AUTH_LOGOUT:         "text-slate-400",
  USER_ROLE_CHANGED:   "text-amber-400",
  USER_DEACTIVATED:    "text-red-400",
  AUTH_PASSWORD_CHANGED: "text-amber-400",
  REPORT_SUBMITTED:    "text-blue-400",
  REPORT_APPROVED:     "text-emerald-400",
  REPORT_REJECTED:     "text-red-400",
  CASE_CREATED:        "text-blue-400",
  SCREENING_MATCH_FOUND: "text-red-400",
  ALERT_ESCALATED:     "text-red-400",
  TRANSACTION_BLOCKED: "text-red-400",
};

// ─── Onglets ──────────────────────────────────────────────────────────────────

type Tab = "users" | "audit";

export function AdminPage() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<Tab>("users");

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">Administration</h1>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            Gestion des utilisateurs · Journaux d'audit
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-400/10 border border-red-400/20 rounded-md">
          <Shield size={11} className="text-red-400" />
          <span className="text-[10px] font-mono text-red-400">ADMIN ONLY</span>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-0 border-b border-[#21262d] mb-6">
        {(["users", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-mono border-b-2 transition-colors ${
              tab === t
                ? "border-[#58a6ff] text-[#58a6ff]"
                : "border-transparent text-[#7d8590] hover:text-[#e6edf3]"
            }`}
          >
            {t === "users" ? "Utilisateurs" : "Journaux d'audit"}
          </button>
        ))}
      </div>

      {tab === "users" ? <UsersTab meId={me?.id ?? undefined} /> : <AuditTab />}
    </AppLayout>
  );
}

// ─── Tab Utilisateurs ─────────────────────────────────────────────────────────

function UsersTab({ meId }: { meId?: number | undefined }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

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

  const COLUMNS: Column<User>[] = [
    {
      key: "name", header: "Utilisateur",
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[#1f6feb]/20 border border-[#1f6feb]/30 flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-mono text-[#58a6ff]">{r.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[#e6edf3] font-medium">{r.name}</p>
            <p className="text-[10px] font-mono text-[#7d8590] truncate">{r.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role", header: "Rôle", width: "w-40",
      render: (r) => (
        <div>
          <Badge label={r.role} />
          {r.department && <p className="text-[10px] font-mono text-[#484f58] mt-0.5">{r.department}</p>}
        </div>
      ),
    },
    {
      key: "status", header: "Statut", width: "w-24",
      render: (r) => r.isActive
        ? <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />Actif</span>
        : <span className="flex items-center gap-1 text-[11px] font-mono text-[#484f58]"><span className="w-1.5 h-1.5 rounded-full bg-[#484f58]" />Inactif</span>,
    },
    {
      key: "lastSeen", header: "Dernière connexion", width: "w-36",
      render: (r) => <span className="font-mono text-[10px] text-[#7d8590]">{r.lastSignedIn ? formatRelative(r.lastSignedIn) : "Jamais"}</span>,
    },
    {
      key: "created", header: "Créé le", width: "w-28",
      render: (r) => <span className="font-mono text-[10px] text-[#7d8590]">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: "actions", header: "", width: "w-32",
      render: (r) => r.id === meId ? (
        <span className="text-[10px] font-mono text-[#484f58]">Vous</span>
      ) : (
        <div className="flex gap-2">
          <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); setEditTarget(r); }}
            className="text-[10px] font-mono text-[#58a6ff] hover:underline">Modifier</button>
          <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); setResetTarget(r); }}
            className="text-[10px] font-mono text-amber-400/70 hover:text-amber-400 hover:underline">MDP</button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Rechercher un utilisateur..."
          className="flex-1 min-w-48 bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40"
        />
        <select
          value={roleFilter}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setRoleFilter(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
        >
          <option value="">Tous les rôles</option>
          {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 hover:bg-[#1f6feb]/30 text-[#58a6ff] rounded-md transition-colors"
        >
          <Plus size={12} /> Nouvel utilisateur
        </button>
      </div>

      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
        <DataTable
          columns={COLUMNS}
          data={(data?.data ?? []) as User[]}
          keyFn={(r) => r.id}
          isLoading={isLoading}
          total={data?.total}
          page={page}
          limit={20}
          onPageChange={setPage}
          emptyMessage="Aucun utilisateur"
        />
      </div>

      {/* Modal création */}
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}

      {/* Modal édition */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 w-full max-w-sm animate-slide-in">
            <h3 className="text-sm font-semibold text-[#e6edf3] font-mono mb-4">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-[#0d1117] border border-amber-400/20 rounded-xl p-6 w-full max-w-sm animate-slide-in">
            <div className="flex items-center gap-2 mb-4">
              <Key size={15} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-[#e6edf3] font-mono">Réinitialiser le mot de passe</h3>
            </div>
            <p className="text-xs font-mono text-[#7d8590] mb-4">{resetTarget.email}</p>
            <input
              type="password" value={newPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setNewPassword(e.target.value)}
              placeholder="Nouveau mot de passe (min 8 caractères)"
              className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-amber-400/40 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => { setResetTarget(null); setNewPassword(""); }}
                className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md">Annuler</button>
              <button
                disabled={newPassword.length < 8 || resetMutation.isPending}
                onClick={() => resetMutation.mutate({ id: resetTarget.id, newPassword })}
                className="flex-1 py-2 text-xs font-mono bg-amber-400/10 border border-amber-400/30 text-amber-400 hover:bg-amber-400/20 rounded-md disabled:opacity-40"
              >
                {resetMutation.isPending ? "En cours..." : "Réinitialiser"}
              </button>
            </div>
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
  const [name, setName]         = useState(user.name);
  const [role, setRole]         = useState<User["role"]>(user.role);
  const [dept, setDept]         = useState(user.department ?? "");
  const [isActive, setIsActive] = useState(user.isActive);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">Nom</label>
        <input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setName(e.target.value)}
          className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]/40" />
      </div>
      <div>
        <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">Rôle</label>
        <select value={role} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setRole(e.target.value as User["role"])}
          className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40">
          {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">Département</label>
        <input value={dept} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDept(e.target.value)}
          placeholder="Ex : Compliance, Back-office..."
          className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40" />
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-xs font-mono text-[#7d8590]">Compte actif</span>
        <button onClick={() => setIsActive(!isActive)} className="transition-colors">
          {isActive
            ? <ToggleRight size={22} className="text-emerald-400" />
            : <ToggleLeft  size={22} className="text-[#484f58]" />}
        </button>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onClose}
          className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md">Annuler</button>
        <button
          disabled={isPending}
          onClick={() => onSave({
            ...(name !== user.name         ? { name }     : {}),
            ...(role !== user.role         ? { role }     : {}),
            ...(dept !== (user.department ?? "") ? { department: dept } : {}),
            ...(isActive !== user.isActive ? { isActive } : {}),
          })}
          className="flex-1 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/30 rounded-md disabled:opacity-40"
        >
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    email: "", name: "", password: "", role: "analyst" as User["role"], department: "",
  });
  const mutation = trpc.admin.createUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 w-full max-w-sm animate-slide-in">
        <h3 className="text-sm font-semibold text-[#e6edf3] font-mono mb-4">Nouvel utilisateur</h3>
        <div className="space-y-3">
          {[
            { key: "email",    label: "Email *",      type: "email",    placeholder: "utilisateur@domaine.com" },
            { key: "name",     label: "Nom *",        type: "text",     placeholder: "Jean Dupont" },
            { key: "password", label: "Mot de passe *", type: "password", placeholder: "Min 8 caractères" },
            { key: "department", label: "Département", type: "text",   placeholder: "Compliance, Back-office..." },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">{label}</label>
              <input type={type} value={form[key as keyof typeof form]}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40"
              />
            </div>
          ))}
          <div>
            <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">Rôle *</label>
            <select value={form.role} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f: typeof form) => ({ ...f, role: e.target.value as User["role"] }))}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40">
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        {mutation.error && <p className="mt-3 text-xs font-mono text-red-400">{mutation.error.message}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2 text-xs font-mono border border-[#30363d] text-[#7d8590] rounded-md">Annuler</button>
          <button
            disabled={!form.email || !form.name || form.password.length < 8 || mutation.isPending}
            onClick={() => mutation.mutate({
              email: form.email, name: form.name, password: form.password,
              role: form.role,
              ...(form.department ? { department: form.department } : {}),
            })}
            className="flex-1 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/30 rounded-md disabled:opacity-40"
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
      render: (r) => <span className="font-mono text-[10px] text-[#7d8590]">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: "user", header: "Utilisateur", width: "w-24",
      render: (r) => <span className="font-mono text-[10px] text-[#7d8590]">{r.userId ? `#${r.userId}` : "—"}</span>,
    },
    {
      key: "action", header: "Action",
      render: (r) => (
        <span className={`font-mono text-[11px] font-medium ${ACTION_COLORS[r.action] ?? "text-[#e6edf3]"}`}>
          {r.action}
        </span>
      ),
    },
    {
      key: "entity", header: "Entité", width: "w-36",
      render: (r) => (
        <div>
          <span className="text-[10px] font-mono text-[#7d8590]">{r.entityType}</span>
          {r.entityId && <span className="text-[10px] font-mono text-[#484f58]"> #{r.entityId}</span>}
        </div>
      ),
    },
    {
      key: "ip", header: "IP", width: "w-28",
      render: (r) => <span className="font-mono text-[10px] text-[#484f58]">{r.ipAddress ?? "—"}</span>,
    },
  ];

  return (
    <>
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Total logs" value={formatNumber(stats.total)} icon={Activity} />
          <StatCard label="Dernières 24h" value={formatNumber(stats.last24h)} icon={Activity} accent="default" />
          <StatCard label="Derniers 7 jours" value={formatNumber(stats.last7d)} icon={Activity} />
        </div>
      )}

      {/* Filtres */}
      <div className="flex gap-3 mb-4">
        <select
          value={entityType}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setEntityType(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#7d8590] focus:outline-none focus:border-[#58a6ff]/40"
        >
          <option value="">Toutes les entités</option>
          {stats && Object.keys(stats.byEntity).sort().map((e) => (
            <option key={e} value={e}>{e} ({stats.byEntity[e]})</option>
          ))}
        </select>
        <input
          value={action}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setAction(e.target.value); setPage(1); }}
          placeholder="Filtrer par action..."
          className="flex-1 max-w-xs bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40"
        />
      </div>

      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
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
