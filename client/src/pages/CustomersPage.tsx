import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { useUrlParams } from "../hooks/useUrlParams";
import { AppLayout } from "../components/layout/AppLayout";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { hasRole } from "../lib/auth";
import { useI18n } from "../hooks/useI18n";
import { formatDate, formatNumber } from "../lib/utils";
import { Search, Plus, Pencil, X } from "lucide-react";
import { Button } from "../components/ui/Button";

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

type Customer = {
  id: number; customerId: string; firstName: string; lastName: string;
  customerType: string; kycStatus: string; riskLevel: string;
  riskScore: number; pepStatus: boolean; createdAt: Date;
  nationality: string | null;
};

// ─── Modal création / édition ─────────────────────────────────────────────────

type CreateForm = {
  firstName: string; lastName: string; email: string; phone: string;
  dateOfBirth: string; nationality: string; residenceCountry: string;
  address: string; city: string; profession: string; employer: string;
  sourceOfFunds: string; monthlyIncome: string;
  customerType: "INDIVIDUAL" | "CORPORATE" | "PEP" | "FOREIGN";
};

const EMPTY_CREATE: CreateForm = {
  firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "",
  nationality: "", residenceCountry: "", address: "", city: "",
  profession: "", employer: "", sourceOfFunds: "", monthlyIncome: "",
  customerType: "INDIVIDUAL",
};

type EditForm = {
  kycStatus: string; riskLevel: string; riskScore: string;
  pepStatus: boolean; notes: string;
};

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { t } = useI18n();
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const mut = trpc.customers.create.useMutation({
    onSuccess: (data) => {
      void utils.customers.list.invalidate();
      onCreated(data.id);
      navigate(`/customers/${data.id}`);
    },
  });

  const set = (k: keyof CreateForm, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const fieldStyle = {
    width: "100%", background: "var(--wr-hover)", border: "1px solid var(--wr-border2)",
    borderRadius: 6, padding: "7px 10px", fontSize: 11, fontFamily: C.mono,
    color: C.text1, outline: "none", boxSizing: "border-box" as const,
  };
  const labelStyle = {
    display: "block" as const, fontSize: 10, fontFamily: C.mono, color: C.text3,
    letterSpacing: "0.14em", textTransform: "uppercase" as const, marginBottom: 4,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
      onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Nouveau client" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto", padding: 24 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 400, fontFamily: C.serif, color: C.text1, margin: 0 }}>Nouveau client</h2>
          <button onClick={onClose} aria-label={t.common.close} style={{ background: "none", border: "none", cursor: "pointer", color: C.text3, padding: 4 }}><X size={16} /></button>
        </div>

        {mut.error && (
          <div style={{ background: `${C.red}0a`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.red, margin: 0 }}>{mut.error.message}</p>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {([
            ["firstName", "Prénom *"], ["lastName", "Nom *"],
            ["email", "Email"], ["phone", "Téléphone"],
            ["dateOfBirth", "Date de naissance"], ["nationality", "Nationalité (ISO)"],
            ["residenceCountry", "Pays de résidence (ISO)"], ["city", "Ville"],
            ["profession", "Profession"], ["employer", "Employeur"],
            ["sourceOfFunds", "Source des fonds"], ["monthlyIncome", "Revenu mensuel"],
          ] as [keyof CreateForm, string][]).map(([k, label]) => (
            <div key={k}>
              <label style={labelStyle}>{label}</label>
              <input value={form[k] as string} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value)} style={fieldStyle} />
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Adresse</label>
            <input value={form.address} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("address", e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Type de client</label>
            <select value={form.customerType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("customerType", e.target.value)}
              style={{ ...fieldStyle, cursor: "pointer" }}>
              {(["INDIVIDUAL", "CORPORATE", "PEP", "FOREIGN"] as const).map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={mut.isPending || !form.firstName || !form.lastName}
            onClick={() => mut.mutate({
              firstName: form.firstName, lastName: form.lastName, customerType: form.customerType,
              ...(form.email            ? { email: form.email } : {}),
              ...(form.phone            ? { phone: form.phone } : {}),
              ...(form.dateOfBirth      ? { dateOfBirth: form.dateOfBirth } : {}),
              ...(form.nationality      ? { nationality: form.nationality } : {}),
              ...(form.residenceCountry ? { residenceCountry: form.residenceCountry } : {}),
              ...(form.address          ? { address: form.address } : {}),
              ...(form.city             ? { city: form.city } : {}),
              ...(form.profession       ? { profession: form.profession } : {}),
              ...(form.employer         ? { employer: form.employer } : {}),
              ...(form.sourceOfFunds    ? { sourceOfFunds: form.sourceOfFunds } : {}),
              ...(form.monthlyIncome    ? { monthlyIncome: form.monthlyIncome } : {}),
            })}
          >
            {mut.isPending ? "Création…" : "Créer le client"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { t } = useI18n();
  const [form, setForm] = useState<EditForm>({
    kycStatus: customer.kycStatus,
    riskLevel: customer.riskLevel,
    riskScore: String(customer.riskScore),
    pepStatus: customer.pepStatus,
    notes: "",
  });
  const mut = trpc.customers.update.useMutation({
    onSuccess: () => { void utils.customers.list.invalidate(); onClose(); },
  });

  const set = (k: keyof EditForm, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const fieldStyle = {
    width: "100%", background: "var(--wr-hover)", border: "1px solid var(--wr-border2)",
    borderRadius: 6, padding: "7px 10px", fontSize: 11, fontFamily: C.mono,
    color: C.text1, outline: "none", boxSizing: "border-box" as const,
  };
  const labelStyle = {
    display: "block" as const, fontSize: 10, fontFamily: C.mono, color: C.text3,
    letterSpacing: "0.14em", textTransform: "uppercase" as const, marginBottom: 4,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
      onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Modifier — ${customer.firstName} ${customer.lastName}`} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 480, padding: 24 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 400, fontFamily: C.serif, color: C.text1, margin: 0 }}>
            Modifier — {customer.firstName} {customer.lastName}
          </h2>
          <button onClick={onClose} aria-label={t.common.close} style={{ background: "none", border: "none", cursor: "pointer", color: C.text3, padding: 4 }}><X size={16} /></button>
        </div>

        {mut.error && (
          <div style={{ background: `${C.red}0a`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontFamily: C.mono, color: C.red, margin: 0 }}>{mut.error.message}</p>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Statut KYC</label>
            <select value={form.kycStatus} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("kycStatus", e.target.value)} style={{ ...fieldStyle, cursor: "pointer" }}>
              {(["PENDING","IN_REVIEW","APPROVED","REJECTED","EXPIRED"] as const).map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Niveau de risque</label>
            <select value={form.riskLevel} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("riskLevel", e.target.value)} style={{ ...fieldStyle, cursor: "pointer" }}>
              {(["LOW","MEDIUM","HIGH","CRITICAL"] as const).map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Score de risque (0-100)</label>
            <input type="number" min={0} max={100} value={form.riskScore}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("riskScore", e.target.value)}
              style={fieldStyle} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 18 }}>
            <input type="checkbox" id="pep-edit" checked={form.pepStatus}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("pepStatus", e.target.checked)}
              style={{ cursor: "pointer" }} />
            <label htmlFor="pep-edit" style={{ fontSize: 11, fontFamily: C.mono, color: C.text2, cursor: "pointer" }}>Statut PEP</label>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={form.notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set("notes", e.target.value)}
              rows={3} style={{ ...fieldStyle, resize: "vertical" as const }} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={mut.isPending}
            onClick={() => mut.mutate({
              id: customer.id,
              kycStatus: form.kycStatus as "PENDING"|"IN_REVIEW"|"APPROVED"|"REJECTED"|"EXPIRED",
              riskLevel: form.riskLevel as "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
              riskScore: form.riskScore ? Number(form.riskScore) : undefined,
              pepStatus: form.pepStatus,
              ...(form.notes ? { notes: form.notes } : {}),
            })}
          >
            {mut.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function CustomersPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const canCreate = hasRole(user, "analyst");
  const urlParams = useUrlParams();
  const page = urlParams.getNumber("page", 1);
  const search = urlParams.get("search");
  const riskLevel = urlParams.get("riskLevel");
  const kycStatus = urlParams.get("kycStatus");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const { t } = useI18n();

  const { data: customerStats } = trpc.customers.stats.useQuery();

  const { data, isLoading } = trpc.customers.list.useQuery({
    page, limit: 20,
    ...(search    ? { search } : {}),
    ...(riskLevel ? { riskLevel: riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } : {}),
    ...(kycStatus ? { kycStatus: kycStatus as "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED" } : {}),
  }, { placeholderData: keepPreviousData });

  const COLUMNS: Column<Customer>[] = [
    {
      key: "id", header: t.customers.clientId, width: "w-36",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 12, color: C.blue }}>{r.customerId}</span>,
    },
    {
      key: "name", header: t.customers.fullName,
      render: (r) => (
        <div>
          <p style={{ fontSize: 13, color: C.text1, margin: "0 0 2px" }}>{r.firstName} {r.lastName}</p>
          <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>{r.nationality ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "type", header: t.customers.type, width: "w-28",
      render: (r) => <Badge label={r.customerType} />,
    },
    {
      key: "kyc", header: "KYC", width: "w-32",
      render: (r) => <Badge label={r.kycStatus} variant="status" />,
    },
    {
      key: "risk", header: t.customers.filterRisk, width: "w-28",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge label={r.riskLevel} variant="risk" />
          <span style={{ fontSize: 12, fontFamily: C.mono, color: C.text3 }}>{r.riskScore}</span>
        </div>
      ),
    },
    {
      key: "pep", header: t.customers.pepStatus, width: "w-16",
      render: (r) => r.pepStatus
        ? <span style={{ fontSize: 11, fontFamily: C.mono, color: C.amber }}>{t.common.yes}</span>
        : <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text4 }}>{t.common.no}</span>,
    },
    {
      key: "date", header: t.customers.createdAt, width: "w-28",
      render: (r) => <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>{formatDate(r.createdAt)}</span>,
    },
    {
      key: "actions", header: "", width: "w-16",
      render: (r) => (
        <button
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); setEditTarget(r); }}
          style={{ padding: 5, background: "none", border: `1px solid ${C.border2}`, borderRadius: 5, cursor: "pointer", color: C.text3, display: "flex", alignItems: "center" }}
          title="Modifier"
          aria-label={t.common.edit}
        >
          <Pencil size={11} />
        </button>
      ),
    },
  ];

  return (
    <AppLayout>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, fontFamily: C.serif, color: C.text1, letterSpacing: "-0.4px", margin: "0 0 4px" }}>{t.customers.title}</h1>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {data
              ? t.customers.subtitle.replace("{count}", formatNumber(data.total))
              : "—"}
          </p>
        </div>
        {canCreate && (
          <Button variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>
            Nouveau client
          </Button>
        )}
      </div>

      {/* KPI stats */}
      {customerStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
          {([
            { label: "Total clients",  value: customerStats.total,                              color: C.text1 },
            { label: "Risque HIGH",    value: customerStats.byRisk["HIGH"] ?? 0,                color: C.amber },
            { label: "Risque CRITICAL",value: customerStats.byRisk["CRITICAL"] ?? 0,            color: C.red   },
            { label: "KYC Approuvé",   value: customerStats.byStatus["APPROVED"] ?? 0,          color: C.green },
            { label: "KYC En attente", value: (customerStats.byStatus["PENDING"] ?? 0) + (customerStats.byStatus["IN_REVIEW"] ?? 0), color: C.blue },
          ] as const).map(({ label, value, color }) => (
            <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 20, fontWeight: 500, fontFamily: C.mono, color }}>{value}</div>
              <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text4, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 192 }}>
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.text4 }} />
          <input
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { urlParams.set({ search: e.target.value || null, page: null }); }}
            placeholder={t.customers.searchPlaceholder}
            style={{ width: "100%", background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, paddingTop: 7, paddingBottom: 7, paddingLeft: 30, paddingRight: 11, fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none", boxSizing: "border-box" as const }}
          />
        </div>
        <select
          value={riskLevel}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { urlParams.set({ riskLevel: e.target.value || null, page: null }); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
        >
          <option value="">{t.customers.allRisks}</option>
          <option value="LOW">{t.risk.low}</option>
          <option value="MEDIUM">{t.risk.medium}</option>
          <option value="HIGH">{t.risk.high}</option>
          <option value="CRITICAL">{t.risk.critical}</option>
        </select>
        <select
          value={kycStatus}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { urlParams.set({ kycStatus: e.target.value || null, page: null }); }}
          style={{ background: C.hover, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "7px 11px", fontSize: 11, fontFamily: C.mono, color: C.text2, outline: "none" }}
        >
          <option value="">{t.customers.allStatuses}</option>
          <option value="PENDING">{t.kyc.pending}</option>
          <option value="IN_REVIEW">{t.kyc.inReview}</option>
          <option value="APPROVED">{t.kyc.approved}</option>
          <option value="REJECTED">{t.kyc.rejected}</option>
        </select>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <DataTable
          columns={COLUMNS}
          data={(data?.data ?? []) as Customer[]}
          keyFn={(r) => r.id}
          isLoading={isLoading}
          total={data?.total}
          page={page}
          limit={20}
          onPageChange={(p) => urlParams.set({ page: p > 1 ? p : null })}
          onRowClick={(r) => navigate(`/customers/${r.id}`)}
          emptyMessage={t.common.noResults}
        />
      </div>

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <EditModal customer={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </AppLayout>
  );
}
