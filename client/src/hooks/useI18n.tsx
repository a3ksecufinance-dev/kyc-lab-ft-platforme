import {
  createContext, useContext, useState, useCallback,
  type ReactNode,
} from "react";
import {
  translations, getStoredLang, LANG_KEY,
  type Lang,
} from "../lib/i18n";

// ─── Recursive string-value type (replaces literal types with string) ─────────
type Stringified<T> = T extends string
  ? string
  : T extends object
  ? { [K in keyof T]: Stringified<T[K]> }
  : T;

export type TDict = Stringified<typeof translations.fr>;

// ─── Context ──────────────────────────────────────────────────────────────────

interface I18nContextValue {
  lang:    Lang;
  setLang: (l: Lang) => void;
  t:       TDict;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getStoredLang);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  }, []);

  const value: I18nContextValue = {
    lang,
    setLang,
    t: translations[lang] as TDict,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
