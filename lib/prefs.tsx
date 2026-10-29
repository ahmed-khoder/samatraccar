"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_PREFS, normalizePrefs, pickSynced, sameSynced, type Prefs } from "./prefs-shared";
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

  // look-and-feel is also kept on the server per user, so the phone and the computer show the vehicles the same way
  const timer = useRef<number | undefined>(undefined);
  const push = (p: Prefs) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      fetch("/api/prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pickSynced(p)) }).catch(() => {});
    }, 600);
  };
  const initialRef = useRef(initial);
  useEffect(() => {
    let off = false;
    fetch("/api/prefs").then((r) => (r.ok ? r.json() : null)).then((j: { prefs: Record<string, unknown> | null } | null) => {
      if (off || !j) return;
      if (j.prefs) {
        // the server copy wins; layout settings of this device are kept
        setPrefs((cur) => { const n = { ...cur, ...pickSynced(normalizePrefs(j.prefs!)) }; if (!sameSynced(n, cur)) write(n); return sameSynced(n, cur) ? cur : n; });
      } else if (!sameSynced(initialRef.current, DEFAULT_PREFS)) {
        push(initialRef.current); // first device with customised settings seeds the server (a device on defaults never does)
      }
    }).catch(() => {});
    return () => { off = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((patch: Partial<Prefs>) => setPrefs((p) => { const n = { ...p, ...patch }; write(n); if (!sameSynced(n, p)) push(n); return n; }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = useCallback(() => setPrefs(() => { write(DEFAULT_PREFS); push(DEFAULT_PREFS); return DEFAULT_PREFS; }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const resolvedTheme = prefs.theme === "system" ? (sysLight ? "light" : "dark") : prefs.theme;
  const value = useMemo(() => ({ prefs, set, reset, resolvedTheme }), [prefs, set, reset, resolvedTheme]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function usePrefs() {
  const c = useContext(C);
  if (!c) throw new Error("PrefsProvider missing");
  return c;
}
