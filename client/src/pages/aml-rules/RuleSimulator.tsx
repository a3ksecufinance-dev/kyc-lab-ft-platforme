import { useState } from "react";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import { C, type Condition } from "./types";
import { evaluateCondition } from "./utils";

export function RuleSimulator({ cond }: { cond: Condition }) {
  const { t } = useI18n();
  const [tx, setTx] = useState({
    amount: "8500", currency: "MAD", channel: "ONLINE",
    transactionType: "TRANSFER", counterpartyCountry: "MA",
    pepStatus: "false", riskLevel: "LOW", riskScore: "20",
    kycStatus: "APPROVED", residenceCountry: "MA", nationality: "MA",
    recentTxCount: "2", recentTxVolume: "17000", volumeVariation: "120",
    amountIsRound: "false", isHighAmount: "false",
  });

  const txParsed: Record<string, unknown> = {
    ...tx,
    amount: Number(tx.amount),
    pepStatus: tx.pepStatus === "true",
    riskScore: Number(tx.riskScore),
    recentTxCount: Number(tx.recentTxCount),
    recentTxVolume: Number(tx.recentTxVolume),
    volumeVariation: Number(tx.volumeVariation),
    amountIsRound: Number(tx.amount) >= 5000 && Number(tx.amount) % 1000 === 0,
    isHighAmount: Number(tx.amount) >= 10000,
  };

  let triggered = false;
  try { triggered = evaluateCondition(cond, txParsed); } catch {}

  const simuFields = [
    ["amount", "Montant"], ["currency", "Devise"], ["channel", "Canal"],
    ["transactionType", "Type tx"], ["counterpartyCountry", "Pays contrepartie"],
    ["pepStatus", "PEP"], ["riskLevel", "Niveau risque"],
    ["recentTxCount", "Nb tx 24h"], ["recentTxVolume", "Volume 24h"],
    ["volumeVariation", "Variation volume %"],
  ];

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-widest">Transaction de test</p>
      <div className="grid grid-cols-2 gap-2">
        {simuFields.map(([key, label]) => (
          <div key={key}>
            <label className="text-[9px] font-mono text-[var(--wr-text-4)] uppercase block mb-0.5">{label}</label>
            <input
              value={tx[key as keyof typeof tx]}
              onChange={e => setTx(prev => ({ ...prev, [key as string]: e.target.value }))}
              className="w-full bg-[var(--wr-card)] border border-[var(--wr-border)] rounded px-2 py-1 text-[11px] font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/40"
            />
          </div>
        ))}
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 8,
        background: triggered ? "rgba(255,101,112,0.08)" : "rgba(45,212,160,0.08)",
        border: `1px solid ${triggered ? "rgba(255,101,112,0.25)" : "rgba(45,212,160,0.25)"}`,
      }}>
        {triggered
          ? <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0 }} />
          : <CheckCircle  size={16} style={{ color: C.green, flexShrink: 0 }} />
        }
        <div>
          <p style={{ fontSize: 12, fontFamily: C.mono, fontWeight: 700, color: triggered ? C.red : C.green, margin: "0 0 2px" }}>
            {triggered ? t.amlRules.ruleTriggered : t.amlRules.noTrigger}
          </p>
          <p style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {triggered ? "Cette transaction créerait une alerte AML" : "Transaction passerait sans alerte"}
          </p>
        </div>
      </div>
    </div>
  );
}
