"use client";
import type { LucideIcon } from "lucide-react";
import type { Range } from "@/lib/format";

export function Kpi({ label, value, unit, icon: Icon, color = "#22d3ee", sub }: {
  label: string; value: string | number; unit?: string; icon: LucideIcon; color?: string; sub?: string;
}) {
  return (
    <div className="glass p-4 relative overflow-hidden">
      <div className="absolute -right-6 -top-6 size-24 rounded-full blur-2xl opacity-25" style={{ background: color }} />
      <div className="flex items-center justify-between text-muted text-xs">
        <span>{label}</span>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  );
}

export function Card({ title, right, children, className = "" }: {
  title: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`glass p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-sm font-medium">{title}</h3>{right}
      </div>
      {children}
    </section>
  );
}

const RANGES: [Range, string][] = [["today", "Today"], ["yesterday", "Yesterday"], ["7d", "7 days"], ["30d", "30 days"]];
export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {RANGES.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} className={`btn ${value === k ? "btn-on" : ""}`}>{l}</button>
      ))}
    </div>
  );
}

export const chartTip = {
  contentStyle: { background: "#0d1424", border: "1px solid rgba(148,163,184,.2)", borderRadius: 12, fontSize: 12 },
  labelStyle: { color: "#8a99b3" },
  cursor: { fill: "rgba(255,255,255,.04)" },
};

export function Empty({ text = "No data for this period" }: { text?: string }) {
  return <div className="text-center text-muted text-sm py-10">{text}</div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/5 ${className}`} />;
}
