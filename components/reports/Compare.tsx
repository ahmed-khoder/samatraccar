"use client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDuration, fmtNum } from "@/lib/format";
import { PALETTE, type VRow } from "@/lib/report-utils";
import { useI18n } from "@/lib/i18n";
import { Card, chartTip, Delta, Empty, VehiclePicker } from "@/components/ui";
import { useExport, type RCtx } from "./shared";
import type { Key } from "@/lib/dict";

const AX = { stroke: "#8a99b3", fontSize: 11, tickLine: false, axisLine: false } as const;

type MKey = "km" | "trips" | "moving" | "idlePct" | "avg" | "max" | "over" | "harsh" | "score" | "activeDays";
const METRICS: { k: MKey; label: Key; good: "up" | "down" | null; fmt: (v: number) => string; val?: (r: VRow) => number }[] = [
  { k: "km", label: "kpi.distance", good: "up", fmt: (v) => fmtNum(v, 1) },
  { k: "trips", label: "kpi.trips", good: null, fmt: (v) => String(v) },
  { k: "moving", label: "kpi.driving", good: null, fmt: (v) => fmtDuration(v), val: (r) => +(r.moving / 36e5).toFixed(1) },
  { k: "idlePct", label: "tbl.idlepct", good: "down", fmt: (v) => `${fmtNum(v)}%` },
  { k: "avg", label: "kpi.avgspeed", good: null, fmt: (v) => fmtNum(v) },
  { k: "max", label: "kpi.maxspeed", good: null, fmt: (v) => fmtNum(v) },
  { k: "over", label: "kpi.overspeed", good: "down", fmt: (v) => String(v) },
  { k: "harsh", label: "kpi.harsh", good: "down", fmt: (v) => String(v) },
  { k: "score", label: "kpi.score", good: "up", fmt: (v) => String(v) },
  { k: "activeDays", label: "tbl.activedays", good: "up", fmt: (v) => String(v) },
];

export default function Compare({ ctx }: { ctx: RCtx }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"vehicles" | "periods">("vehicles");
  const [pick, setPick] = useState<number[] | null>(null);
  const active = useMemo(() => ctx.rows.filter((r) => r.km > 0), [ctx.rows]);
  const chosen = useMemo(() => {
    const ids = pick ?? active.slice(0, 4).map((r) => r.id);
    return ctx.rows.filter((r) => ids.includes(r.id)).slice(0, 6);
  }, [pick, active, ctx.rows]);
  const col = (id: number) => PALETTE[chosen.findIndex((r) => r.id === id) % PALETTE.length];

  // radar: each metric scaled to the best value among the chosen vehicles (0-100)
  const radar = useMemo(() => {
    const dims: { key: string; get: (r: VRow) => number }[] = [
      { key: t("kpi.distance"), get: (r) => r.km }, { key: t("kpi.trips"), get: (r) => r.trips }, { key: t("kpi.avgspeed"), get: (r) => r.avg },
      { key: t("kpi.score"), get: (r) => r.score }, { key: t("tbl.activedays"), get: (r) => r.activeDays }, { key: t("rep.efficiency"), get: (r) => 100 - r.idlePct },
    ];
    return dims.map((d) => {
      const mx = Math.max(1, ...chosen.map(d.get));
      const row: Record<string, number | string> = { dim: d.key };
      chosen.forEach((r) => { row[r.name] = Math.round((d.get(r) / mx) * 100); });
      return row;
    });
  }, [chosen, t]);

  const exportRows = useMemo(() => (mode === "vehicles"
    ? METRICS.map((m) => ({ [t("tbl.metric")]: t(m.label), ...Object.fromEntries(chosen.map((r) => [r.name, m.fmt(r[m.k] as number)])) }))
    : METRICS.map((m) => ({ [t("tbl.metric")]: t(m.label), [t("rep.current")]: m.fmt(ctx.tot[m.k as keyof typeof ctx.tot] as number ?? 0), [t("rep.previous")]: ctx.prevTot ? m.fmt((ctx.prevTot as never)[m.k] ?? 0) : "" }))),
  [mode, chosen, ctx.tot, ctx.prevTot, t]);
  useExport(ctx, "compare", exportRows);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <div className="flex gap-1.5">
          <button className={`btn ${mode === "vehicles" ? "btn-on" : ""}`} onClick={() => setMode("vehicles")}>{t("rep.cmpveh")}</button>
          <button className={`btn ${mode === "periods" ? "btn-on" : ""}`} onClick={() => setMode("periods")}>{t("rep.cmpper")}</button>
        </div>
        {mode === "vehicles" && (
          <>
            <VehiclePicker devices={ctx.devices.filter((d) => ctx.rows.some((r) => r.id === d.id))} value={chosen.map((r) => r.id)} onChange={setPick} max={6} />
            <span className="text-xs text-muted">{t("rep.cmpmax")}</span>
          </>
        )}
      </div>

      {mode === "vehicles" ? (chosen.length < 2 ? <Card id="c.none" title={t("tab.compare")} collapsible={false}><Empty text={t("rep.cmppick")} /></Card> : (
        <>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {METRICS.filter((m) => ["km", "moving", "idlePct", "avg", "max", "score", "trips", "over"].includes(m.k)).map((m) => (
              <Card key={m.k} id={`c.${m.k}`} title={t(m.label)}>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={chosen.map((r) => ({ name: r.name, v: m.val ? m.val(r) : +(r[m.k] as number).toFixed(1), id: r.id }))}>
                    <CartesianGrid stroke="rgba(148,163,184,.22)" vertical={false} />
                    <XAxis dataKey="name" {...AX} /><YAxis {...AX} width={34} /><Tooltip {...chartTip} />
                    <Bar dataKey="v" radius={[6, 6, 0, 0]}>{chosen.map((r) => <Cell key={r.id} fill={col(r.id)} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card id="c.radar" title={t("rep.radar")}>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke="rgba(148,163,184,.3)" /><PolarAngleAxis dataKey="dim" tick={{ fill: "#8a99b3", fontSize: 11 }} />
                  {chosen.map((r) => <Radar key={r.id} dataKey={r.name} stroke={col(r.id)} fill={col(r.id)} fillOpacity={0.15} strokeWidth={2} />)}
                  <Legend wrapperStyle={{ fontSize: 11 }} /><Tooltip {...chartTip} />
                </RadarChart>
              </ResponsiveContainer>
            </Card>
            <Card id="c.table" title={t("rep.sidebyside")}>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted"><tr><th className="py-2 pe-3 text-start font-medium">{t("tbl.metric")}</th>{chosen.map((r) => <th key={r.id} className="pe-3 text-start font-medium" style={{ color: col(r.id) }}>{r.name}</th>)}</tr></thead>
                  <tbody>{METRICS.map((m) => {
                    const vals = chosen.map((r) => r[m.k] as number);
                    const best = m.good === "up" ? Math.max(...vals) : m.good === "down" ? Math.min(...vals) : null;
                    return (
                      <tr key={m.k} className="border-t border-line">
                        <td className="py-2 pe-3 text-muted whitespace-nowrap">{t(m.label)}</td>
                        {chosen.map((r) => { const v = r[m.k] as number; return <td key={r.id} className={`pe-3 tabular-nums whitespace-nowrap ${best !== null && v === best && vals.some((x) => x !== best) ? "text-emerald-400 font-semibold" : ""}`}>{m.fmt(v)}</td>; })}
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )) : (
        !ctx.prevTot ? <Card id="c.wait" title={t("tab.compare")} collapsible={false}><Empty text={ctx.loading ? t("rep.loading") : t("common.nodata")} /></Card> : (
          <PeriodCompare ctx={ctx} />
        )
      )}
    </div>
  );
}

function PeriodCompare({ ctx }: { ctx: RCtx }) {
  const { t } = useI18n();
  const cur = ctx.tot, prev = ctx.prevTot!;
  const series = useMemo(() => {
    const a = ctx.days.map((d) => (ctx.perDay.find(([x]) => x === d)?.[1].dist ?? 0) / 1000);
    const prevMap = new Map(ctx.prevPerDay ?? []);
    const pk = [...prevMap.keys()].sort();
    const b = pk.map((k) => (prevMap.get(k)!.dist ?? 0) / 1000);
    const n = Math.max(a.length, b.length);
    return Array.from({ length: n }, (_, i) => ({ day: i + 1, cur: +(a[i] ?? 0).toFixed(1), prev: +(b[i] ?? 0).toFixed(1) }));
  }, [ctx.days, ctx.perDay, ctx.prevPerDay]);
  const prevRows = useMemo(() => new Map((ctx.prevRows ?? []).map((r) => [r.id, r])), [ctx.prevRows]);
  const get = (o: unknown, k: MKey) => (o as Record<string, number>)[k === "activeDays" ? "active" : k] ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card id="p.kpis" title={t("rep.cmpper")} collapsible={false}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2 text-start font-medium">{t("tbl.metric")}</th><th className="text-start font-medium">{t("rep.current")}</th><th className="text-start font-medium">{t("rep.previous")}</th><th className="text-start font-medium">Δ</th></tr></thead>
            <tbody>{METRICS.map((m) => {
              const c = get(cur, m.k), p = get(prev, m.k);
              return (
                <tr key={m.k} className="border-t border-line">
                  <td className="py-2 text-muted whitespace-nowrap pe-2">{t(m.label)}</td><td className="tabular-nums pe-2">{m.fmt(c)}</td><td className="tabular-nums text-muted pe-2">{m.fmt(p)}</td>
                  <td><Delta cur={c} prev={p} good={m.good ?? "up"} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </Card>
        <Card id="p.chart" title={t("rep.dailycmp")} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={series}>
              <CartesianGrid stroke="rgba(148,163,184,.22)" vertical={false} />
              <XAxis dataKey="day" {...AX} /><YAxis {...AX} width={40} /><Tooltip {...chartTip} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="cur" name={t("rep.current")} stroke="#22d3ee" strokeWidth={2.5} dot={false} />
              <Line dataKey="prev" name={t("rep.previous")} stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <Card id="p.veh" title={t("rep.byvehicle")} collapsible={false}>
        <div className="overflow-auto max-h-[50vh]">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted sticky top-0 bg-solid"><tr>
              {(["tbl.vehicle", "kpi.distance", "rep.previous", "Δ", "kpi.score", "rep.previous", "Δ"] as const).map((h, i) => <th key={i} className="py-2 pe-4 text-start font-medium whitespace-nowrap">{h === "Δ" ? "Δ" : t(h)}</th>)}
            </tr></thead>
            <tbody>{ctx.rows.map((r) => {
              const p = prevRows.get(r.id);
              return (
                <tr key={r.id} className="border-t border-line hover:bg-fg/5">
                  <td className="py-2 pe-4 font-medium">{r.name}</td><td className="pe-4 tabular-nums">{fmtNum(r.km, 1)}</td><td className="pe-4 tabular-nums text-muted">{fmtNum(p?.km ?? 0, 1)}</td>
                  <td className="pe-4"><Delta cur={r.km} prev={p?.km ?? 0} /></td><td className="pe-4 tabular-nums">{r.score}</td><td className="pe-4 tabular-nums text-muted">{p?.score ?? "—"}</td>
                  <td><Delta cur={r.score} prev={p?.score ?? 0} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
