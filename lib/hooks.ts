"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { customRange, rangeDates, type Range } from "./format";

/** useState persisted in localStorage (safe against blocked storage / SSR). */
export function usePersisted<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s != null) setV(JSON.parse(s)); } catch {}
  }, [key]);
  const set = useCallback((x: T | ((p: T) => T)) => {
    setV((p) => {
      const n = typeof x === "function" ? (x as (p: T) => T)(p) : x;
      try { localStorage.setItem(key, JSON.stringify(n)); } catch {}
      return n;
    });
  }, [key]);
  return [v, set] as const;
}

/** Preset range or custom from/to dates (yyyy-mm-dd), resolved to an ISO window. */
export function useRangeSel(initial: Range) {
  const [range, setRange] = useState<Range>(initial);
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const win = useMemo(() => (custom ? customRange(custom.from, custom.to) : rangeDates(range)), [range, custom]);
  return { range, setRange: (r: Range) => { setCustom(null); setRange(r); }, custom, setCustom, win };
}
