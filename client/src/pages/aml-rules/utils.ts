import type { Condition } from "./types";

export function conditionToJson(c: Condition): unknown {
  if (c.type === "simple") {
    const isNum = [">=", "<=", ">", "<"].includes(c.op);
    const isArr = ["in", "not_in"].includes(c.op);
    const v = isArr
      ? c.value.split(",").map(s => s.trim()).filter(Boolean)
      : isNum ? Number(c.value) : c.value === "true" ? true : c.value === "false" ? false : c.value;
    return { field: c.field, op: c.op, value: v };
  }
  return { logic: c.logic, rules: c.rules.map(conditionToJson) };
}

export function evaluateCondition(c: Condition, tx: Record<string, unknown>): boolean {
  if (c.type === "compound") {
    if (c.logic === "AND") return c.rules.every(r => evaluateCondition(r as Condition, tx));
    return c.rules.some(r => evaluateCondition(r as Condition, tx));
  }
  const raw = tx[c.field];
  const fv = raw !== undefined ? raw : null;
  const isArr = ["in", "not_in"].includes(c.op);
  const listVals = isArr ? c.value.split(",").map(s => s.trim()) : [];
  switch (c.op) {
    case ">=": return Number(fv) >= Number(c.value);
    case "<=": return Number(fv) <= Number(c.value);
    case ">":  return Number(fv) >  Number(c.value);
    case "<":  return Number(fv) <  Number(c.value);
    case "==": return String(fv) === c.value || fv === (c.value === "true");
    case "!=": return String(fv) !== c.value;
    case "in":     return listVals.includes(String(fv));
    case "not_in": return !listVals.includes(String(fv));
    default: return false;
  }
}
