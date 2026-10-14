"use client";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Clock, Gauge, Navigation, OctagonAlert, Pause, Route, ShieldCheck, Timer, Truck, Info, AlertTriangle, Sparkles } from "lucide-react";
import { HIST_BINS } from "@/lib/agg";
import { fmtDuration, fmtNum } from "@/lib/format";
import { insights, PALETTE } from "@/lib/report-utils";
import { useI18n } from "@/lib/i18n";
import { Card, chartTip, Delta, Empty, Kpi } from "@/components/ui";
import { useExport, type RCtx } from "./shared";

const AX = { stroke: "#8a99b3", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="rgba(148,163,184,.22)" vertical={false} />;

export default function Overview({ ctx }: { ctx: RCtx }) {
  const { t } = useI18n();
  const { tot, prevTot, rows, perDay } = ctx;
  const p = prevTot;

  const ins = useMemo(() => insights(ctx.rows, ctx.perDay, fmtNum), [ctx.rows, ctx.perDay]);
  const top = useMemo(() => rows.filter((r) => r.km > 0).slice(0, 6), [rows]);
  const daily = useMemo(() => {
    const m = new Map(perDay);
    return ctx.days.map((d) => {
      const row: Record<string, number | string> = { date: d.slice(5) };
      top.forEach((v) => { row[v.name] = +((v.days[d]?.dist ?? 0) / 1000).toFixed(1); });
      const topSum = top.reduce((s, v) => s + (v.days[d]?.dist ?? 0), 0);
      row[t("rep.others")] = +(Math.max(0, (m.get(d)?.dist ?? 0) - topSum) / 1000).toFixed(1);
      return row;
    });
  }, [ctx.days, perDay, top, t]);
  const hourly = useMemo(() => tot.a.hourMoving.map((ms, h) => ({ h: String(h), hrs: +(ms / 36e5).toFixed(1) })), [tot]);
  const hist = useMemo(() => HIST_BINS.map((b, i) => ({ name: b, h: +(tot.a.hist[i] / 36e5).toFixed(1) })), [tot]);
  const split = [
    { name: t("state.moving"), v: +(tot.moving / 36e5).toFixed(1), c: "#06b6d4" },
    { name: t("chart.idling"), v: +(tot.idle / 36e5).toFixed(1), c: "#fb923c" },
    { name: t("state.stopped"), v: +(tot.stop / 36e5).toFixed(1), c: "#64748b" },
  ];
  const exportRows = useMemo(() => [
    { [t("tbl.metric")]: t("kpi.distance"), [t("tbl.value")]: +tot.km.toFixed(1) },
    { [t("tbl.metric")]: t("kpi.trips"), [t("tbl.value")]: tot.trips },
    { [t("tbl.metric")]: t("kpi.driving"), [t("tbl.value")]: fmtDuration(tot.moving) },
    { [t("tbl.metric")]: t("kpi.idle"), [t("tbl.value")]: fmtDuration(tot.idle) },
    { [t("tbl.metric")]: t("kpi.maxspeed"), [t("tbl.value")]: Math.round(tot.max) },
    { [t("tbl.metric")]: t("kpi.avgspeed"), [t("tbl.value")]: Math.round(tot.avg) },
    { [t("tbl.metric")]: t("kpi.overspeed"), [t("tbl.value")]: tot.over },
    { [t("tbl.metric")]: t("kpi.harsh"), [t("tbl.value")]: tot.harsh },
    { [t("tbl.metric")]: t("kpi.score"), [t("tbl.value")]: tot.score },
  ], [tot, t]);
  useExport(ctx, "overview", exportRows);

  const D = (cur: number, prev: number | undefined, good: "up" | "down" = "up") => (p && prev !== undefined ? <Delta cur={cur} prev={prev} good={good} /> : undefined);
  const k = (label: string, value: string | number, unit: string | undefined, icon: typeof Route, color: string, delta?: React.ReactNode, sub?: string) => (
    <Kpi label={label} value={value} unit={unit} icon={icon} color={color} sub={sub} extra={delta} />
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {k(t("rep.activeveh"), `${tot.active}/${rows.length}`, undefined, Truck, "#22d3ee", D(tot.active, p?.active))}
        {k(t("kpi.distance"), fmtNum(tot.km), t("unit.km"), Route, "#8b5cf6", D(tot.km, p?.km))}
        {k(t("kpi.trips"), tot.trips, undefined, Activity, "#60a5fa", D(tot.trips, p?.trips), t("rep.stopsn", { n: tot.stops }))}
        {k(t("kpi.driving"), fmtDuration(tot.moving), undefined, Timer, "#06b6d4", D(tot.moving, p?.moving))}
        {k(t("kpi.idle"), fmtDuration(tot.idle), undefined, Pause, "#fb923c", D(tot.idle, p?.idle, "down"), t("kpi.idlepct", { p: fmtNum(tot.idlePct) }))}
        {k(t("kpi.avgspeed"), fmtNum(tot.avg), t("unit.kmh"), Gauge, "#fbbf24", D(tot.avg, p?.avg))}
        {k(t("kpi.maxspeed"), fmtNum(tot.max), t("unit.kmh"), Navigation, "#f43f5e")}
        {k(t("kpi.overspeed"), tot.over, undefined, OctagonAlert, "#f43f5e", D(tot.over, p?.over, "down"), t("kpi.overlimit", { n: ctx.limit }))}
        {k(t("kpi.harsh"), tot.harsh, undefined, Clock, "#f472b6", D(tot.harsh, p?.harsh, "down"))}
        {k(t("kpi.score"), tot.score, "/100", ShieldCheck, "#34d399", D(tot.score, p?.score))}
      </div>

      {ins.length > 0 && (
        <Card id="r.ins" title={t("rep.insights")} right={<Sparkles size={15} className="text-accent" />}>
          <ul className="grid md:grid-cols-2 gap-2 text-sm">
            {ins.map((i, n) => {
              const Ic = i.tone === "warn" ? AlertTriangle : i.tone === "good" ? ShieldCheck : Info;
              const c = i.tone === "warn" ? "text-amber-400" : i.tone === "good" ? "text-emerald-400" : "text-accent";
              return <li key={n} className="flex gap-2 bg-fg/[.05] rounded-xl p-3"><Ic size={16} className={`shrink-0 mt-0.5 ${c}`} />{t(i.key, i.vars)}</li>;
            })}
          </ul>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card id="r.daily" title={t("chart.daily")} className="lg:col-span-2">
          {ctx.rows.some((r) => r.km > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={daily}>
                {grid}<XAxis dataKey="date" {...AX} minTickGap={16} /><YAxis {...AX} width={40} />
                <Tooltip {...chartTip} /><Legend wrapperStyle={{ fontSize: 11 }} />
                {top.map((v, i) => <Bar key={v.id} dataKey={v.name} stackId="a" fill={PALETTE[i % PALETTE.length]} />)}
                <Bar dataKey={t("rep.others")} stackId="a" fill="#64748b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card id="r.split" title={t("rep.timesplit")}>
          <div className="relative">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={split} dataKey="v" innerRadius={55} outerRadius={80} paddingAngle={3} stroke="none">{split.map((s, i) => <Cell key={i} fill={s.c} />)}</Pie>
                <Tooltip {...chartTip} formatter={(v) => `${v} ${t("unit.h")}`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
              <div><div className="text-xl font-semibold tabular-nums">{fmtNum((tot.moving + tot.idle + tot.stop) / 36e5)}</div><div className="text-[10px] text-muted">{t("unit.h")}</div></div>
            </div>
          </div>
          <div className="flex justify-center gap-3 text-xs text-muted flex-wrap">
            {split.map((s) => <span key={s.name} className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: s.c }} />{s.name} {s.v}</span>)}
          </div>
        </Card>

        <Card id="r.byveh" title={t("chart.byvehicle")}>
          {top.length ? (
            <ResponsiveContainer width="100%" height={Math.max(180, top.length * 34)}>
              <BarChart data={top.map((v) => ({ name: v.name, km: +v.km.toFixed(1) }))} layout="vertical">
                <CartesianGrid stroke="rgba(148,163,184,.22)" horizontal={false} />
                <XAxis type="number" {...AX} /><YAxis type="category" dataKey="name" {...AX} width={70} orientation="left" />
                <Tooltip {...chartTip} formatter={(v) => `${v} ${t("unit.km")}`} />
                <Bar dataKey="km" radius={[0, 6, 6, 0]}>{top.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card id="r.hour" title={t("chart.hourly")}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly}>{grid}<XAxis dataKey="h" {...AX} interval={2} /><YAxis {...AX} width={30} /><Tooltip {...chartTip} formatter={(v) => `${v} ${t("unit.h")}`} /><Bar dataKey="hrs" fill="#34d399" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>

        <Card id="r.speed" title={t("chart.speeddist")}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hist}>{grid}<XAxis dataKey="name" {...AX} /><YAxis {...AX} width={34} /><Tooltip {...chartTip} formatter={(v) => `${v} ${t("unit.h")}`} /><Bar dataKey="h" fill="#8b5cf6" radius={[6, 6, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
