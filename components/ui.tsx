"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CalendarRange, Search, TrendingDown, TrendingUp, Minus, type LucideIcon } from "lucide-react";
import { toDateInput, type Range } from "@/lib/format";
import type { Device } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { usePersisted } from "@/lib/hooks";
import type { Key } from "@/lib/dict";

export function Kpi({ label, value, unit, icon: Icon, color = "#22d3ee", sub, extra }: {
  label: string; value: string | number; unit?: string; icon: LucideIcon; color?: string; sub?: string; extra?: React.ReactNode;
}) {
  return (
    <div className="glass p-4 relative overflow-hidden rise">
      <div className="absolute -end-6 -top-6 size-24 rounded-full blur-2xl opacity-25" style={{ background: color }} />
      <div className="flex items-center justify-between text-muted text-xs gap-2">
        <span className="truncate">{label}</span>
        <Icon size={16} style={{ color }} className="shrink-0" />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
        {extra && <span className="ms-auto">{extra}</span>}
      </div>
      {sub && <div className="text-[11px] text-muted mt-1 truncate">{sub}</div>}
    </div>
  );
}

/** Foldable card; the open/closed state is remembered per `id`. */
export function Card({ id, title, right, children, className = "", collapsible = true }: {
  id?: string; title: string; right?: React.ReactNode; children: React.ReactNode; className?: string; collapsible?: boolean;
}) {
  const [open, setOpen] = usePersisted(`card.${id ?? title}`, true);
  const can = collapsible;
  const show = !can || open;
  return (
    <section className={`glass p-4 rise ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" disabled={!can} onClick={() => setOpen((v) => !v)} aria-expanded={show}
          className={`flex items-center gap-1.5 text-sm font-medium text-start ${can ? "cursor-pointer hover:text-accent" : "cursor-default"}`}>
          {can && <ChevronDown size={15} className={`transition-transform text-muted ${show ? "" : "-rotate-90 rtl:rotate-90"}`} />}
          {title}
        </button>
        {show && right}
      </div>
      <div className="collapse-body" data-open={show}><div><div className="pt-3">{children}</div></div></div>
    </section>
  );
}

const RANGES: [Range, Key][] = [["today", "range.today"], ["yesterday", "range.yesterday"], ["7d", "range.7d"], ["30d", "range.30d"], ["month", "range.month"], ["lastmonth", "range.lastmonth"]];

/** Preset chips + custom from/to dates (whole days). `value` null means a custom range is active. */
export function RangeBar({ value, custom, onPreset, onCustom, win, presets }: {
  value: Range; custom: { from: string; to: string } | null; onPreset: (r: Range) => void; onCustom: (c: { from: string; to: string } | null) => void;
  win: { from: string; to: string }; presets?: Range[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(!!custom);
  const today = toDateInput(new Date().toISOString());
  const from = custom?.from ?? toDateInput(win.from);
  const lastDay = toDateInput(new Date(new Date(win.to).getTime() - 1).toISOString());
  const to = custom?.to ?? lastDay;
  const list = RANGES.filter(([k]) => !presets || presets.includes(k));
  const set = (f: string, tt: string) => {
    if (!f || !tt) return;
    let a = f, b = tt;
    if (a > b) [a, b] = [b, a];
    const max = new Date(a); max.setDate(max.getDate() + 91);
    if (new Date(b) > max) b = toDateInput(max.toISOString());
    onCustom({ from: a, to: b > today ? today : b });
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {list.map(([k, l]) => (
        <button key={k} onClick={() => { onPreset(k); setOpen(false); }} className={`btn ${!custom && value === k ? "btn-on" : ""}`}>{t(l)}</button>
      ))}
      <button onClick={() => { setOpen((v) => !v); if (!custom) onCustom({ from, to }); }} className={`btn ${custom ? "btn-on" : ""}`}><CalendarRange size={14} />{t("range.custom")}</button>
      {(open || custom) && (
        <span className="flex items-center gap-1.5 text-xs text-muted" dir="ltr">
          <input type="date" className="input !w-auto !py-1.5" value={from} max={today} onChange={(e) => set(e.target.value, to)} aria-label={t("range.from")} />
          <span>→</span>
          <input type="date" className="input !w-auto !py-1.5" value={to} max={today} onChange={(e) => set(from, e.target.value)} aria-label={t("range.to")} />
        </span>
      )}
    </div>
  );
}

/** Multi-select dropdown for vehicles with search, select all / none. */
export function VehiclePicker({ devices, value, onChange, max }: { devices: Device[]; value: number[]; onChange: (ids: number[]) => void; max?: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [open]);
  const sel = new Set(value);
  const list = devices.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: number) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id); else if (!max || n.size < max) n.add(id);
    onChange([...n]);
  };
  const label = value.length === 0 || value.length === devices.length ? t("common.allvehicles") : value.length === 1 ? devices.find((d) => d.id === value[0])?.name ?? "" : t("rep.nvehicles", { n: value.length });
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className={`btn ${value.length && value.length < devices.length ? "btn-on" : ""}`} aria-expanded={open}>
        {label}<ChevronDown size={14} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <div className="absolute z-[2500] mt-1.5 w-72 max-w-[85vw] glass !bg-solid p-2 space-y-2 start-0 shadow-2xl">
          <div className="relative">
            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !ps-9 !py-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("live.search")} autoFocus />
          </div>
          <div className="flex gap-1.5">
            <button className="btn !py-1" onClick={() => onChange(devices.map((d) => d.id))}>{t("rep.all")}</button>
            <button className="btn !py-1" onClick={() => onChange([])}>{t("rep.none")}</button>
          </div>
          <ul className="max-h-60 overflow-y-auto space-y-0.5">
            {list.map((d) => (
              <li key={d.id}>
                <button onClick={() => toggle(d.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-fg/5 text-sm text-start">
                  <span className={`size-4 rounded border grid place-items-center ${sel.has(d.id) ? "bg-accent border-accent" : "border-line"}`}>{sel.has(d.id) && <Check size={11} className="on-accent" />}</span>
                  {d.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** +12% / -5% chip. `good` says which direction is positive for the metric. */
export function Delta({ cur, prev, good = "up", digits = 0 }: { cur: number; prev: number; good?: "up" | "down"; digits?: number }) {
  if (!prev && !cur) return <span className="text-muted">—</span>;
  if (!prev) return <span className="text-muted text-[11px]">new</span>;
  const p = ((cur - prev) / Math.abs(prev)) * 100;
  const flat = Math.abs(p) < 0.5;
  const up = p > 0;
  const ok = flat ? null : (up && good === "up") || (!up && good === "down");
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] tabular-nums ${ok === null ? "text-muted" : ok ? "text-emerald-400" : "text-rose-400"}`} dir="ltr">
      <Icon size={12} />{up ? "+" : ""}{p.toFixed(digits)}%
    </span>
  );
}

export const chartTip = {
  contentStyle: { background: "var(--panel-solid)", color: "var(--fg)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 },
  labelStyle: { color: "var(--muted)" },
  itemStyle: { color: "var(--fg)" },
  cursor: { fill: "rgba(148,163,184,.12)" },
};

export function Empty({ text }: { text?: string }) {
  const { t } = useI18n();
  return <div className="text-center text-muted text-sm py-10">{text ?? t("common.nodata")}</div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-fg/5 ${className}`} />;
}
