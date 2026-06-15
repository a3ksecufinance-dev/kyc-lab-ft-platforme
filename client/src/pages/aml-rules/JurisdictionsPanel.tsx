import { useState } from "react";
import type React from "react";
import { Plus, Globe, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { formatNumber } from "../../lib/utils";
import { useI18n } from "../../hooks/useI18n";
import { C, btnBlue, type JurisdictionProfile } from "./types";
import { JurisdictionModal } from "./JurisdictionModal";

export function JurisdictionsPanel({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const invalidate = () => utils.jurisdictions.list.invalidate();
  const { data: jurisdictions, isLoading } = trpc.jurisdictions.list.useQuery();
  const toggleMut = trpc.jurisdictions.toggle.useMutation({ onSuccess: invalidate });
  const upsertMut = trpc.jurisdictions.upsert.useMutation({ onSuccess: () => { invalidate(); setEditing(null); } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<Partial<JurisdictionProfile> | Record<string, any> | null>(null);
  const [lookupCode, setLookupCode] = useState("");
  const { data: thresholds } = trpc.jurisdictions.effectiveThresholds.useQuery(
    { countryCode: lookupCode.toUpperCase() },
    { enabled: lookupCode.length === 2 }
  );

  const activeCount   = jurisdictions?.filter(j => j.isActive).length ?? 0;
  const inactiveCount = (jurisdictions?.length ?? 0) - activeCount;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Juridictions actives", val: activeCount,               color: C.green },
          { label: "Désactivées",          val: inactiveCount,             color: C.text4 },
          { label: "Total configuré",      val: jurisdictions?.length ?? 0, color: C.blue  },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 20, fontWeight: 500, fontFamily: C.mono, color }}>{val}</div>
            <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Add new */}
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={() => setEditing({ jurisdictionCode: "", jurisdictionName: "", isActive: true, currencyCode: "EUR", strDelayHours: 24, sarDelayHours: 72, enhancedDdPep: true, enhancedDdHighRisk: true, reportingFormat: "GOAML_2" })}
            className={`${btnBlue} flex items-center gap-1.5`}>
            <Plus size={12} /> Nouvelle juridiction
          </button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-[11px] font-mono text-[var(--wr-text-4)]">{t.common.loading}</div>
      ) : !jurisdictions?.length ? (
        <div className="text-center py-16 border border-dashed border-[var(--wr-border)] rounded-lg">
          <Globe size={32} className="mx-auto text-[var(--wr-border)] mb-3" />
          <p className="text-sm font-mono text-[var(--wr-text-4)]">{t.amlRules.noJurisdiction}</p>
        </div>
      ) : (
        <div className="bg-[var(--wr-bg)] border border-[var(--wr-border)] rounded-lg overflow-hidden">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="border-b border-[var(--wr-border)] text-[var(--wr-text-4)] text-[10px] uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">Code</th>
                <th className="text-left px-4 py-2.5">Juridiction</th>
                <th className="text-left px-4 py-2.5">Devise</th>
                <th className="text-right px-4 py-2.5">Seuil tx</th>
                <th className="text-right px-4 py-2.5">Seuil struct.</th>
                <th className="text-left px-4 py-2.5">Délai STR</th>
                <th className="text-left px-4 py-2.5">Régulateur</th>
                <th className="text-left px-4 py-2.5">Statut</th>
                {canEdit && <th className="text-right px-4 py-2.5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--wr-border)]/50">
              {jurisdictions.map((j) => (
                <tr key={j.id} className={`hover:bg-[var(--wr-card)] transition-colors ${!j.isActive ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5">
                    <span className="bg-[var(--wr-blue)]/15 text-[var(--wr-blue)] border border-[var(--wr-blue)]/30 px-1.5 py-0.5 rounded text-[10px]">
                      {j.jurisdictionCode}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--wr-text-1)]">{j.jurisdictionName}</td>
                  <td className="px-4 py-2.5 text-[var(--wr-text-3)]">{j.currencyCode}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--wr-text-1)]">
                    {j.thresholdSingleTx ? Number(j.thresholdSingleTx).toLocaleString() : "\u2014"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--wr-text-1)]">
                    {j.thresholdStructuring ? Number(j.thresholdStructuring).toLocaleString() : "\u2014"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--wr-text-3)]">{j.strDelayHours}h</td>
                  <td className="px-4 py-2.5 text-[var(--wr-text-3)] truncate max-w-[120px]">
                    {j.regulatorCode ?? j.regulatorName ?? "\u2014"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] border ${j.isActive ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" : "text-[var(--wr-text-4)] bg-[var(--wr-border)] border-[var(--wr-border2)]"}`}>
                      {j.isActive ? "ACTIVE" : "OFF"}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditing(j)}
                          className="text-[var(--wr-text-3)] hover:text-[var(--wr-blue)] transition-colors">
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => toggleMut.mutate({ id: j.id, isActive: !j.isActive })}
                          disabled={toggleMut.isPending}
                          className={`transition-colors disabled:opacity-50 ${j.isActive ? "text-emerald-400 hover:text-[var(--wr-text-3)]" : "text-[var(--wr-text-4)] hover:text-emerald-400"}`}>
                          {j.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lookup seuils effectifs */}
      <div className="bg-[var(--wr-card)] border border-[var(--wr-border)] rounded-lg p-4">
        <h3 className="text-[10px] font-mono font-semibold text-[var(--wr-text-3)] uppercase tracking-widest mb-3">
          Seuils effectifs par pays
        </h3>
        <div className="flex gap-3 items-center mb-3">
          <input
            value={lookupCode}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLookupCode(e.target.value.slice(0, 2))}
            placeholder="FR, MA, US..."
            maxLength={2}
            className="w-24 bg-[var(--wr-hover)] border border-[var(--wr-border2)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--wr-text-1)] uppercase outline-none"
          />
          <span className="text-[10px] font-mono text-[var(--wr-text-4)]">Saisir un code ISO-2 pour consulter les seuils appliqués</span>
        </div>
        {thresholds && lookupCode.length === 2 && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            {([
              ["Seuil transaction unique",  thresholds.singleTx,           thresholds.currency],
              ["Seuil structuration",       thresholds.structuring,         thresholds.currency],
              ["Fenêtre structuration",     thresholds.structuringWindowH,  "heures"],
              ["Fréquence max",             thresholds.frequencyCount,      "tx"],
              ["Seuil espèces",             thresholds.cash,                thresholds.currency],
              ["STR obligatoire au-dessus", thresholds.strMandatoryAbove,   thresholds.currency],
              ["Délai STR",                 thresholds.strDelayHours,       "heures"],
              ["Délai SAR",                 thresholds.sarDelayHours,       "heures"],
              ["Format rapport",            thresholds.reportingFormat,     ""],
              ["Code régulateur",           thresholds.regulatorCode,       ""],
            ] as [string, number | string, string][]).map(([label, value, unit]) => (
              <div key={label} className="flex justify-between items-center text-[10px] font-mono py-1 border-b border-[var(--wr-border)]/30">
                <span className="text-[var(--wr-text-4)]">{label}</span>
                <span className="text-[var(--wr-text-1)] font-semibold">
                  {typeof value === "number" ? formatNumber(value) : value}
                  {unit && <span className="text-[var(--wr-text-4)] font-normal ml-1">{unit}</span>}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center text-[10px] font-mono py-1 border-b border-[var(--wr-border)]/30">
              <span className="text-[var(--wr-text-4)]">DD renforcée PEP</span>
              <span className={thresholds.enhancedDdPep ? "text-amber-400 font-semibold" : "text-[var(--wr-text-4)]"}>
                {thresholds.enhancedDdPep ? "OUI" : "NON"}
              </span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono py-1 border-b border-[var(--wr-border)]/30">
              <span className="text-[var(--wr-text-4)]">DD renforcée haut risque</span>
              <span className={thresholds.enhancedDdHighRisk ? "text-amber-400 font-semibold" : "text-[var(--wr-text-4)]"}>
                {thresholds.enhancedDdHighRisk ? "OUI" : "NON"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Edit / Create modal */}
      {editing !== null && (
        <JurisdictionModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(data) => upsertMut.mutate(data as Parameters<typeof upsertMut.mutate>[0])}
          saving={upsertMut.isPending}
        />
      )}
    </div>
  );
}
