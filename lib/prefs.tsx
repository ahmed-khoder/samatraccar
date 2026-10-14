"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { DEFAULT_PREFS, type Prefs } from "./prefs-shared";
export type { Prefs } from "./prefs-shared";

interface Ctx { prefs: Prefs; set: (p: Partial<Prefs>) => void; reset: () => void; resolvedTheme: "dark" | "light" }
const C = createContext<Ctx | null>(null);

export function PrefsProvider({ initial, children }: { initial: Prefs; children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [sysLight, setSysLight] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-color-scheme: light)");
    setSysLight(m.matches);
    const f = (e: MediaQueryListEvent) => setSysLight(e.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = prefs.theme; }, [prefs.theme]);

  const write = (p: Prefs) => { document.cookie = `prefs=${encodeURIComponent(JSON.stringify(p))};path=/;max-age=31536000;samesite=lax`; };
  const set = useCallback((patch: Partial<Prefs>) => setPrefs((p) => { const n = { ...p, ...patch }; write(n); return n; }), []);
  const reset = useCallback(() => setPrefs(() => { write(DEFAULT_PREFS); return DEFAULT_PREFS; }), []);
  const resolvedTheme = prefs.theme === "system" ? (sysLight ? "light" : "dark") : prefs.theme;
  const value = useMemo(() => ({ prefs, set, reset, resolvedTheme }), [prefs, set, reset, resolvedTheme]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function usePrefs() {
  const c = useContext(C);
  if (!c) throw new Error("PrefsProvider missing");
  return c;
}
