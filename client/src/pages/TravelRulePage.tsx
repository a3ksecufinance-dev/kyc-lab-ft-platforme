import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import { formatNumber } from "../lib/utils";
import { Send, Clock, CheckCircle2, XCircle, Globe } from "lucide-react";

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
};

const STATUS_CONFIG = {
  PENDING:      { label: "En attente",  color: C.amber },
  SENT:         { label: "Envoyé",      color: C.blue  },
  ACKNOWLEDGED: { label: "Accusé",      color: C.green },
  FAILED:       { label: "Échec",       color: C.red   },
  SKIPPED:      { label: "Ignoré",      color: C.text3 },
} as const;

function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: C.text2 };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      background: `${cfg.color}20`, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

export function TravelRulePage() {
  const [txIdInput, setTxIdInput] = useState("");
  const [txRefInput, setTxRefInput] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null);

  const { data: stats, refetch: refetchStats } = trpc.travelRule.stats.useQuery();
  const { data: pending, refetch: refetchPending } = trpc.travelRule.pending.useQuery();

  const getByRef = trpc.travelRule.getByTxRef.useQuery(
    { txRef: txRefInput },
    { enabled: txRefInput.length > 3 }
  );

  const generate = trpc.travelRule.generate.useMutation({
    onSuccess: () => {
      void refetchStats();
      void refetchPending();
    },
  });

  const handleGenerate = () => {
    const id = parseInt(txIdInput);
    if (!isNaN(id)) generate.mutate({ transactionDbId: id });
  };

  return (
    <AppLayout>
      <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text1, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Globe size={20} /> Travel Rule — FATF R.16 / IVMS 101
          </h1>
          <p style={{ fontSize: 12, color: C.text2, margin: "4px 0 0" }}>
            Transmission IVMS 101 inter-VASP — Seuil ≥ 10 000 MAD (≈ 1 000 USD)
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total",       value: stats?.total ?? 0,        color: C.text1  },
            { label: "Envoyés",     value: stats?.sent ?? 0,         color: C.blue   },
            { label: "Accusés",     value: stats?.acknowledged ?? 0, color: C.green  },
            { label: "En attente",  value: stats?.pending ?? 0,      color: C.amber  },
            { label: "Échecs",      value: stats?.failed ?? 0,       color: C.red    },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color }}>{formatNumber(value)}</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

          {/* Générer un message */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: C.text2, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Générer un message IVMS 101
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: C.text2, display: "block", marginBottom: 4 }}>
                ID de transaction (DB)
              </label>
              <input
                type="number"
                value={txIdInput}
                onChange={e => setTxIdInput(e.target.value)}
                placeholder="ex: 1234"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6,
                  border: `1px solid ${C.border}`, background: C.surface,
                  color: C.text1, fontSize: 12, fontFamily: C.mono, boxSizing: "border-box",
                }}
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={generate.isPending || !txIdInput}
              style={{
                width: "100%", padding: "9px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: C.blue, border: "none", color: "#fff",
                cursor: generate.isPending || !txIdInput ? "not-allowed" : "pointer",
                opacity: generate.isPending || !txIdInput ? 0.6 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Send size={13} /> {generate.isPending ? "Envoi en cours…" : "Générer et envoyer"}
            </button>

            {generate.isSuccess && (
              <div style={{ marginTop: 10, padding: "10px", background: `${C.green}10`, border: `1px solid ${C.green}30`, borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>
                  <CheckCircle2 size={12} style={{ display: "inline", marginRight: 4 }} />
                  Message généré — Statut : {generate.data?.status}
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.text3, marginTop: 4 }}>
                  ID : {generate.data?.messageId}
                </div>
              </div>
            )}
            {generate.isError && (
              <div style={{ marginTop: 10, padding: "10px", background: `${C.red}10`, border: `1px solid ${C.red}30`, borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: C.red }}>
                  <XCircle size={12} style={{ display: "inline", marginRight: 4 }} />
                  {generate.error?.message}
                </div>
              </div>
            )}
          </div>

          {/* Rechercher par référence */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: C.text2, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Rechercher par référence
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: C.text2, display: "block", marginBottom: 4 }}>
                Référence transaction (txRef)
              </label>
              <input
                type="text"
                value={txRefInput}
                onChange={e => setTxRefInput(e.target.value)}
                placeholder="ex: TXN-20240115-ABC123"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6,
                  border: `1px solid ${C.border}`, background: C.surface,
                  color: C.text1, fontSize: 12, fontFamily: C.mono, boxSizing: "border-box",
                }}
              />
            </div>
            {getByRef.data && (
              <div style={{ padding: "10px", background: `${C.blue}10`, border: `1px solid ${C.blue}30`, borderRadius: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text1, fontWeight: 600 }}>
                    {getByRef.data.messageId}
                  </span>
                  <StatusBadge status={getByRef.data.status} />
                </div>
                <div style={{ fontSize: 10, color: C.text3, fontFamily: C.mono }}>
                  Montant : {getByRef.data.amount} {getByRef.data.currency} |
                  Créé : {new Date(getByRef.data.createdAt).toLocaleString("fr-FR")}
                </div>
                {getByRef.data.validation.errors.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 10, color: C.red }}>
                    Erreurs IVMS : {getByRef.data.validation.errors.join(", ")}
                  </div>
                )}
              </div>
            )}
            {getByRef.data === null && txRefInput.length > 3 && (
              <div style={{ fontSize: 11, color: C.text3 }}>Aucun message Travel Rule pour cette référence</div>
            )}
          </div>
        </div>

        {/* Messages en attente / échec */}
        {pending && pending.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Clock size={14} style={{ color: C.amber }} />
              <h3 style={{ fontSize: 12, fontWeight: 600, color: C.text2, margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Messages en attente / échec ({pending.length})
              </h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pending.slice(0, 20).map(rec => (
                <div
                  key={rec.messageId}
                  onClick={() => setSelectedRecord(selectedRecord === rec.messageId ? null : rec.messageId)}
                  style={{
                    padding: "10px 12px",
                    border: `1px solid ${rec.status === "FAILED" ? C.red + "40" : C.amber + "40"}`,
                    borderRadius: 7, cursor: "pointer",
                    background: selectedRecord === rec.messageId ? `${C.border2}` : "transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text1, fontWeight: 600 }}>
                      {rec.transactionRef}
                    </span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text2 }}>
                        {rec.amount} {rec.currency}
                      </span>
                      <StatusBadge status={rec.status} />
                    </div>
                  </div>
                  {selectedRecord === rec.messageId && (
                    <div style={{ marginTop: 8, fontSize: 10, color: C.text3, fontFamily: C.mono }}>
                      <div>Message ID : {rec.messageId}</div>
                      <div>Créé : {new Date(rec.createdAt).toLocaleString("fr-FR")}</div>
                      {rec.error && <div style={{ color: C.red }}>Erreur : {rec.error}</div>}
                      {rec.validation.errors.length > 0 && (
                        <div style={{ color: C.amber }}>
                          Validation : {rec.validation.errors.join(" | ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info réglementaire */}
        <div style={{
          marginTop: 16, background: `${C.blue}08`, border: `1px solid ${C.blue}25`,
          borderRadius: 8, padding: "12px 16px", fontSize: 11, color: C.text2,
        }}>
          <strong style={{ color: C.blue }}>FATF Recommandation 16</strong> — Travel Rule obligatoire pour tous les transferts ≥ 1 000 USD entre PSP.
          Standard IVMS 101 v1.0 (intervasp.org). Transport : OpenVASP / TRP Protocol / Notabene / REST bilatéral BAM.
          Conservation 5 ans (Redis). Délai envoi recommandé : &lt; 24h.
        </div>

      </div>
    </AppLayout>
  );
}
