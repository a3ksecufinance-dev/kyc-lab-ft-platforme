import { Plus, Trash2, GitBranch } from "lucide-react";
import { Button } from "../../components/ui/Button";
import {
  C, FIELDS, OPERATORS,
  type Condition, type SimpleCondition,
} from "./types";

export function ConditionBuilder({
  cond, onChange, onRemove, depth = 0,
}: {
  cond: Condition;
  onChange: (c: Condition) => void;
  onRemove?: (() => void) | undefined;
  depth?: number | undefined;
}) {
  const indent = depth > 0 ? "ml-5 pl-4 border-l border-[var(--wr-border2)]" : "";

  if (cond.type === "compound") {
    const addSimple = () => onChange({
      ...cond,
      rules: [...cond.rules, { type: "simple", field: "amount", op: ">=", value: "" }],
    });
    const addGroup = () => onChange({
      ...cond,
      rules: [...cond.rules, { type: "compound", logic: "AND", rules: [
        { type: "simple", field: "amount", op: ">=", value: "" },
      ]}],
    });
    const toggleLogic = () => onChange({ ...cond, logic: cond.logic === "AND" ? "OR" : "AND" });
    const updateChild = (i: number, child: Condition) => {
      const rules = [...cond.rules];
      rules[i] = child;
      onChange({ ...cond, rules });
    };
    const removeChild = (i: number) => {
      onChange({ ...cond, rules: cond.rules.filter((_, idx) => idx !== i) });
    };

    return (
      <div className={`space-y-2 ${indent}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleLogic}
            style={{
              padding: "3px 10px", fontSize: 10, fontFamily: C.mono, fontWeight: 700,
              borderRadius: 4, cursor: "pointer",
              border: `1px solid ${cond.logic === "AND" ? "rgba(74,158,255,0.4)" : "rgba(245,158,11,0.4)"}`,
              background: cond.logic === "AND" ? "rgba(74,158,255,0.12)" : "rgba(245,158,11,0.12)",
              color: cond.logic === "AND" ? C.blue : C.amber,
            }}
          >{cond.logic}</button>
          <span className="text-[10px] font-mono text-[var(--wr-text-4)]">
            {cond.logic === "AND" ? "toutes les conditions" : "au moins une condition"}
          </span>
          {onRemove && (
            <button onClick={onRemove} className="ml-auto text-[var(--wr-text-4)] hover:text-red-400 transition-colors">
              <Trash2 size={12} />
            </button>
          )}
        </div>
        {cond.rules.map((child, i) => (
          <ConditionBuilder
            key={i}
            cond={child as Condition}
            onChange={c => updateChild(i, c)}
            onRemove={cond.rules.length > 1 ? () => removeChild(i) : undefined}
            depth={depth + 1}
          />
        ))}
        <div className="flex gap-2 pt-1">
          <Button onClick={addSimple} variant="ghost" size="sm" icon={Plus}>
            Condition
          </Button>
          {depth < 2 && (
            <Button onClick={addGroup} variant="ghost" size="sm" icon={GitBranch}>
              Groupe AND/OR
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Simple condition
  return (
    <div className={`flex items-center gap-2 ${indent}`}>
      <select
        value={cond.field}
        onChange={e => onChange({ ...cond, field: e.target.value })}
        className="bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2 py-1.5 text-[11px] font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50 w-44"
      >
        {FIELDS.map(g => (
          <optgroup key={g.group} label={g.group}>
            {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
      <select
        value={cond.op}
        onChange={e => onChange({ ...cond, op: e.target.value as SimpleCondition["op"] })}
        className="bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2 py-1.5 text-[11px] font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50 w-36"
      >
        {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input
        value={cond.value}
        onChange={e => onChange({ ...cond, value: e.target.value })}
        placeholder={cond.op === "in" || cond.op === "not_in" ? "KP,IR,RU" : "valeur"}
        className="bg-[var(--wr-bg)] border border-[var(--wr-border2)] rounded px-2 py-1.5 text-[11px] font-mono text-[var(--wr-text-1)] focus:outline-none focus:border-[var(--wr-blue)]/50 w-28 placeholder-[var(--wr-text-4)]"
      />
      {onRemove && (
        <button onClick={onRemove} className="text-[var(--wr-text-4)] hover:text-red-400 transition-colors flex-shrink-0">
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
