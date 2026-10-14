"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Device } from "@/lib/types";
import type { DayAgg } from "@/lib/agg";
import type { VRow, Tot } from "@/lib/report-utils";

export interface RCtx {
  rows: VRow[];
  prevRows: VRow[] | null;
  perDay: [string, DayAgg][];
  prevPerDay: [string, DayAgg][] | null;
  tot: Tot;
  prevTot: Tot | null;
  days: string[];
  win: { from: string; to: string };
  devices: Device[];
  ids: number[];            // selected (empty = all)
  loading: boolean;
  limit: number;
  setExport: (name: string, rows: Record<string, string | number>[]) => void;
}

/** Register the rows of the active tab for the CSV export button. */
export function useExport(ctx: RCtx, name: string, rows: Record<string, string | number>[]) {
  const { setExport } = ctx;
  useEffect(() => { setExport(name, rows); }, [setExport, name, rows]);
}

export function useSort<K extends string>(initial: K, dir: 1 | -1 = -1) {
  const [key, setKey] = useState<K>(initial);
  const [d, setD] = useState<1 | -1>(dir);
  const toggle = (k: K) => { if (k === key) setD((x) => (x === 1 ? -1 : 1)); else { setKey(k); setD(-1); } };
  return { key, dir: d, toggle };
}

export function Th({ children, k, sort, className = "" }: { children: React.ReactNode; k?: string; sort?: { key: string; dir: 1 | -1; toggle: (k: never) => void }; className?: string }) {
  const on = sort && k && sort.key === k;
  return (
    <th className={`py-2 pe-4 font-medium text-start whitespace-nowrap ${k ? "cursor-pointer select-none hover:text-fg" : ""} ${className}`}
      onClick={() => k && sort?.toggle(k as never)}>
      <span className="inline-flex items-center gap-1">{children}{on && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</span>
    </th>
  );
}

export function usePaged<T>(rows: T[], size = 50) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows.length]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const slice = useMemo(() => rows.slice(page * size, page * size + size), [rows, page, size]);
  return { slice, page: Math.min(page, pages - 1), pages, setPage };
}

export function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (n: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-3 no-print">
      <button className="btn !py-1" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
      <span className="text-xs text-muted tabular-nums">{page + 1} / {pages}</span>
      <button className="btn !py-1" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
    </div>
  );
}
