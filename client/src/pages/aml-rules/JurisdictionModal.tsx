import { useState } from "react";
import type React from "react";
import { Globe } from "lucide-react";
import { btnBlue, btnGhost, type JurisdictionProfile } from "./types";

export function JurisdictionModal({
  initial, onClose, onSave, saving,
}: {
  initial: Partial<JurisdictionProfile>;
  onClose: () => void;
  onSave: (data: unknown) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    jurisdictionCode:     initial.jurisdictionCode ?? "",
    jurisdictionName:     initial.jurisdictionName ?? "",
    isActive:             initial.isActive ?? true,
    currencyCode:         initial.currencyCode ?? "EUR",
    thresholdSingleTx:    initial.thresholdSingleTx ?? "",
    thresholdStructuring: initial.thresholdStructuring ?? "",
    strMandatoryAbove:    initial.strMandatoryAbove ?? "",
    strDelayHours:        initial.strDelayHours ?? 24,
    sarDelayHours:        initial.sarDelayHours ?? 72,
    enhancedDdPep:        initial.enhancedDdPep ?? true,
    enhancedDdHighRisk:   initial.enhancedDdHighRisk ?? true,
    regulatorName:        initial.regulatorName ?? "",
    regulatorCode:        initial.regulatorCode ?? "",
    reportingFormat:      initial.reportingFormat ?? "GOAML_2",
    coveredCountries:     (initial.coveredCountries ?? []).join(","),
  });

  const field = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const handleSave = () => {
    const data = {
      jurisdictionCode:     form.jurisdictionCode.toUpperCase(),
      jurisdictionName:     form.jurisdictionName,
      isActive:             form.isActive,
      currencyCode:         form.currencyCode,
      thresholdSingleTx:    form.thresholdSingleTx || undefined,
      thresholdStructuring: form.thresholdStructuring || undefined,
      strMandatoryAbove:    form.strMandatoryAbove || undefined,
      strDelayHours:        Number(form.strDelayHours),
      sarDelayHours:        Number(form.sarDelayHours),
      enhancedDdPep:        form.enhancedDdPep,
      enhancedDdHighRisk:   form.enhancedDdHighRisk,
      regulatorName:        form.regulatorName || undefined,
      regulatorCode:        form.regulatorCode || undefined,
      reportingFormat:      form.reportingFormat,
      coveredCountries:     form.coveredCountries ? form.coveredCountries.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) : [],
    };
    onSave(data);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--wr-card)] border border-[var(--wr-border2)] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--wr-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold font-mono text-[var(--wr-text-1)] flex items-center gap-2">
            <Globe size={14} className="text-[var(--wr-blue)]" />
            {initial.id ? "Modifier juridiction" : "Nouvelle juridiction"}
          </h2>
          <button onClick={onClose} className="text-[var(--wr-text-4)] hover:text-[var(--wr-text-3)]">{"\u2715"}</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Code ISO *</label>
              <input value={form.jurisdictionCode} onChange={field("jurisdictionCode")} maxLength={10}
                placeholder="FR, MA, UK..." disabled={!!initial.id}
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50 disabled:opacity-50" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Devise</label>
              <input value={form.currencyCode} onChange={field("currencyCode")} maxLength={3}
                placeholder="EUR, MAD, GBP..."
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Nom de la juridiction *</label>
            <input value={form.jurisdictionName} onChange={field("jurisdictionName")}
              placeholder="France, Maroc, Royaume-Uni..."
              className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Seuil tx unique</label>
              <input value={form.thresholdSingleTx} onChange={field("thresholdSingleTx")}
                placeholder="10000"
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Seuil structuring</label>
              <input value={form.thresholdStructuring} onChange={field("thresholdStructuring")}
                placeholder="3000"
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Délai STR (heures)</label>
              <input type="number" value={form.strDelayHours} onChange={field("strDelayHours")}
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Délai SAR (heures)</label>
              <input type="number" value={form.sarDelayHours} onChange={field("sarDelayHours")}
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Code régulateur</label>
              <input value={form.regulatorCode} onChange={field("regulatorCode")}
                placeholder="BAM, ACPR, FCA..."
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">Format rapport</label>
              <select value={form.reportingFormat} onChange={field("reportingFormat")}
                className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none">
                {["GOAML_2", "GOAML_3", "TRACFIN_V3", "CUSTOM"].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[var(--wr-text-3)] uppercase tracking-wider block mb-1">
              Pays couverts (ISO 2 séparés par virgules)
            </label>
            <input value={form.coveredCountries} onChange={field("coveredCountries")}
              placeholder="GP, MQ, RE, PM..."
              className="w-full bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50" />
          </div>

          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-[11px] font-mono text-[var(--wr-text-3)] cursor-pointer">
              <input type="checkbox" checked={form.enhancedDdPep}
                onChange={e => setForm(p => ({ ...p, enhancedDdPep: e.target.checked }))}
                className="rounded" />
              DD renforcée PPE
            </label>
            <label className="flex items-center gap-2 text-[11px] font-mono text-[var(--wr-text-3)] cursor-pointer">
              <input type="checkbox" checked={form.enhancedDdHighRisk}
                onChange={e => setForm(p => ({ ...p, enhancedDdHighRisk: e.target.checked }))}
                className="rounded" />
              DD renforcée haut risque
            </label>
            <label className="flex items-center gap-2 text-[11px] font-mono text-[var(--wr-text-3)] cursor-pointer">
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                className="rounded" />
              Active
            </label>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[var(--wr-border)] flex justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>Annuler</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.jurisdictionCode || !form.jurisdictionName}
            className={`${btnBlue} disabled:opacity-50`}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
