import { useCallback } from "react";
import { useLocation, useSearch } from "wouter";

/**
 * Read/write URL search params for pagination, filters, etc.
 * State survives page refresh and enables deep-linking.
 */
export function useUrlParams() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);

  const get = (key: string, defaultValue = ""): string => {
    return params.get(key) ?? defaultValue;
  };

  const getNumber = (key: string, defaultValue = 1): number => {
    const val = params.get(key);
    if (!val) return defaultValue;
    const num = parseInt(val, 10);
    return isNaN(num) ? defaultValue : num;
  };

  const set = useCallback((updates: Record<string, string | number | null>) => {
    const current = new URLSearchParams(search);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === undefined) {
        current.delete(key);
      } else {
        current.set(key, String(value));
      }
    }
    const qs = current.toString();
    setLocation(window.location.pathname + (qs ? `?${qs}` : ""), { replace: true });
  }, [search, setLocation]);

  return { get, getNumber, set, params };
}
