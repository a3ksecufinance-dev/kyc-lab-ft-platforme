import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import type { Lang } from "./i18n";

const LOCALES = { fr, en: enUS } as const;
const INTL_LOCALES = { fr: "fr-FR", en: "en-US" } as const;

// Global accessor — set by useI18n provider, avoids passing lang to every call
let _currentLang: Lang = "fr";
export function setCurrentLang(lang: Lang) { _currentLang = lang; }
export function getCurrentLang(): Lang { return _currentLang; }

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | number | null, lang?: Lang): string {
  if (date === null || date === undefined) return "—";
  const l = lang ?? _currentLang;
  return format(new Date(date), l === "fr" ? "dd/MM/yyyy" : "MM/dd/yyyy", { locale: LOCALES[l] });
}

export function formatDateTime(date: Date | string | number | null, lang?: Lang): string {
  if (date === null || date === undefined) return "—";
  const l = lang ?? _currentLang;
  return format(new Date(date), l === "fr" ? "dd/MM/yyyy HH:mm" : "MM/dd/yyyy HH:mm", { locale: LOCALES[l] });
}

export function formatRelative(date: Date | string | number | null, lang?: Lang): string {
  if (date === null || date === undefined) return "—";
  const l = lang ?? _currentLang;
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: LOCALES[l] });
}

export function formatAmount(amount: string | number | null, currency = "EUR", lang?: Lang): string {
  if (amount === null || amount === undefined) return "—";
  const l = lang ?? _currentLang;
  return new Intl.NumberFormat(INTL_LOCALES[l], { style: "currency", currency }).format(Number(amount));
}

export function formatNumber(n: number, lang?: Lang): string {
  const l = lang ?? _currentLang;
  return new Intl.NumberFormat(INTL_LOCALES[l]).format(n);
}

export const RISK_COLORS: Record<string, string> = {
  LOW:      "text-emerald-400",
  MEDIUM:   "text-amber-400",
  HIGH:     "text-red-400",
  CRITICAL: "text-red-300",
};

export const RISK_BG: Record<string, string> = {
  LOW:      "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  MEDIUM:   "bg-amber-400/10 text-amber-400 border-amber-400/20",
  HIGH:     "bg-red-400/10 text-red-400 border-red-400/20",
  CRITICAL: "bg-red-300/10 text-red-300 border-red-300/20",
};

export const STATUS_BG: Record<string, string> = {
  OPEN:           "bg-blue-400/10 text-blue-400 border-blue-400/20",
  IN_REVIEW:      "bg-amber-400/10 text-amber-400 border-amber-400/20",
  CLOSED:         "bg-slate-400/10 text-slate-400 border-slate-400/20",
  FALSE_POSITIVE: "bg-slate-400/10 text-slate-500 border-slate-500/20",
  ESCALATED:      "bg-red-400/10 text-red-400 border-red-400/20",
  APPROVED:       "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  PENDING:        "bg-amber-400/10 text-amber-400 border-amber-400/20",
  REJECTED:       "bg-red-400/10 text-red-400 border-red-400/20",
  DRAFT:          "bg-slate-400/10 text-slate-400 border-slate-400/20",
  SUBMITTED:      "bg-blue-400/10 text-blue-400 border-blue-400/20",
  REVIEW:         "bg-amber-400/10 text-amber-400 border-amber-400/20",
  FLAGGED:        "bg-red-400/10 text-red-400 border-red-400/20",
  BLOCKED:        "bg-red-500/10 text-red-500 border-red-500/20",
  COMPLETED:      "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
};

export const PRIORITY_BG: Record<string, string> = {
  LOW:      "bg-slate-400/10 text-slate-400 border-slate-400/20",
  MEDIUM:   "bg-amber-400/10 text-amber-400 border-amber-400/20",
  HIGH:     "bg-red-400/10 text-red-400 border-red-400/20",
  CRITICAL: "bg-red-300/10 text-red-300 border-red-300/20",
};
