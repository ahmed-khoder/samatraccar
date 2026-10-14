"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Car, Route, Gauge, Clock, Navigation, BatteryWarning, Bell, Activity, Timer, ShieldCheck, OctagonAlert, Pause } from "lucide-react";
import { useAnalyticsRange, useDevices, usePositions, useReport } from "@/lib/api";
import { useRangeSel } from "@/lib/hooks";
import { avgSpeed, driverScore, HIST_BINS } from "@/lib/agg";
import { deviceState, fmtDateTime, fmtDuration, fmtNum, mToKm, STATE_COLOR } from "@/lib/format";
import type { TEvent } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { evLabel } from "@/lib/events";
import { Card, chartTip, Empty, Kpi, RangeBar, Skeleton } from "@/components/ui";
import type { Key } from "@/lib/dict";

const AX = { stroke: "#8a99b3", fontSize: 11, tickLine: false, axisLine: false } as const;
const PALETTE = ["#22d3ee", "#8b5cf6", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c", "#a3e635"];
const grid = <CartesianGrid stroke="rgba(148,163,184,.22)" vertical={false} />;

export default function Dashboard() {
  const { t } = useI18n();
  const { range, setRange, custom, setCustom, win: r } = useRangeSel("7d");
  const { data: devices } = useDevices();
  const { data: positions } = usePositions();
  const an = useAnalyticsRange(r, undefined, undefined, new Date(r.to).getTime() > Date.now() - 36e5 ? 60000 : 0);
  const { data: events } = useReport<TEvent[]>("events", r);

  const name = useMemo(() => new Map((devices ?? []).map((d) => [d.id, d.name])), [devices]);
  const posMap = useMemo(() => new Map((positions ?? []).map((p) => [p.deviceId, p])), [positions]);
  const live = useMemo(() => {
    const c = { moving: 0, stopped: 0, offline: 0 };
    (devices ?? []).forEach((d) => { const s = deviceState(d, posMap.get(d.id)); c[s === "moving" ? "moving" : s === "stopped" ? "stopped" : "offline"]++; });
    return c;
  }, [devices, posMap]);

  const f = an.fleet;
  const loading = !an.data || (an.loading && an.progress.done === 0);
  const hasData = f.points > 0;

  const daily = useMemo(() => an.perDay.map(([date, a]) => ({
    date: date.slice(5), km: +mToKm(a.dist).toFixed(1), h: +(a.movingMs / 36e5).toFixed(1),
  })), [an.perDay]);

  const perVehicle = useMemo(() => [...an.perDevice].map(([id, a]) => ({ id, name: name.get(id) ?? String(id), a }))
    .filter((x) => x.a.points > 0).sort((x, y) => y.a.dist - x.a.dist), [an.perDevice, name]);

  const util = useMemo(() => perVehicle.slice(0, 10).map((x) => ({
    name: x.name,
    moving: +(x.a.movingMs / 36e5).toFixed(1), idle: +(x.a.idleMs / 36e5).toFixed(1), stopped: +(x.a.stopMs / 36e5).toFixed(1),
  })), [perVehicle]);

  const hourly = useMemo(() => f.hourMoving.map((ms, h) => ({ h: String(h), hrs: +(ms / 36e5).toFixed(1) })), [f]);
  const hist = useMemo(() => HIST_BINS.map((b, i) => ({ name: b, h: +(f.hist[i] / 36e5).toFixed(1) })), [f]);
  const eventTypes = useMemo(() => {
    const m = new Map<string, number>();
    (events ?? []).forEach((e) => m.set(e.type, (m.get(e.type) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, n]) => ({ type: evLabel(t, type), n }));
  }, [events, t]);
  const lowBattery = useMemo(() => (positions ?? []).filter((p) => (p.attributes.batteryLevel ?? 100) < 25)
    .sort((a, b) => (a.attributes.batteryLevel ?? 0) - (b.attributes.batteryLevel ?? 0)).slice(0, 5), [positions]);

  const donut = [
    { name: t("state.moving"), v: live.moving, c: STATE_COLOR.moving },
    { name: t("state.stopped"), v: live.stopped, c: STATE_COLOR.stopped },
    { name: t("state.offline"), v: live.offline, c: STATE_COLOR.offline },
  ];
  const idlePct = f.movingMs + f.idleMs ? (f.idleMs / (f.movingMs + f.idleMs)) * 100 : 0;
  const scores = perVehicle.map((x) => driverScore(x.a));
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("dash.title")}</h1>
          <p className="text-xs text-muted">{t("dash.subtitle")}</p>
        </div>
        <RangeBar value={range} custom={custom} onPreset={setRange} onCustom={setCustom} win={r} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <Kpi label={t("kpi.vehicles")} value={devices?.length ?? "–"} icon={Car} sub={t("kpi.online", { n: live.moving + live.stopped })} />
        <Kpi label={t("kpi.movingnow")} value={live.moving} icon={Navigation} color="#34d399" />
        <Kpi label={t("kpi.distance")} value={loading ? "–" : fmtNum(mToKm(f.dist))} unit={t("unit.km")} icon={Route} color="#8b5cf6" />
        <Kpi label={t("kpi.trips")} value={loading ? "–" : f.trips} icon={Activity} color="#60a5fa" />
        <Kpi label={t("kpi.maxspeed")} value={loading ? "–" : fmtNum(f.maxSpeed)} unit={t("unit.kmh")} icon={Gauge} color="#f43f5e" />
        <Kpi label={t("kpi.avgspeed")} value={loading ? "–" : fmtNum(avgSpeed(f))} unit={t("unit.kmh")} icon={Gauge} color="#fbbf24" />
        <Kpi label={t("kpi.driving")} value={loading ? "–" : fmtDuration(f.movingMs)} icon={Timer} color="#22d3ee" />
        <Kpi label={t("kpi.idle")} value={loading ? "–" : fmtDuration(f.idleMs)} icon={Pause} color="#fb923c" sub={t("kpi.idlepct", { p: fmtNum(idlePct) })} />
        <Kpi label={t("kpi.overspeed")} value={loading ? "–" : f.overCount} icon={OctagonAlert} color="#f43f5e" sub={t("kpi.overlimit", { n: an.data?.limit ?? 100 })} />
        <Kpi label={t("kpi.harsh")} value={loading ? "–" : f.harshBrake + f.harshAccel} icon={Clock} color="#f472b6" sub={t("kpi.harshsub", { b: f.harshBrake, a: f.harshAccel })} />
        <Kpi label={t("kpi.score")} value={loading ? "–" : avgScore} unit="/100" icon={ShieldCheck} color="#34d399" />
        <Kpi label={t("kpi.events")} value={events?.length ?? "–"} icon={Bell} color="#fb923c" />
      </div>

      {!loading && !hasData && <Empty text={t("dash.nodata")} />}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card id="d.daily" title={t("chart.daily")} className="lg:col-span-2">
          {loading ? <Skeleton className="h-60" /> : daily.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={daily}>
                <defs><linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient></defs>
                {grid}<XAxis dataKey="date" {...AX} /><YAxis {...AX} width={40} />
                <Tooltip {...chartTip} formatter={(v) => `${v} ${t("unit.km")}`} />
                <Area dataKey="km" name={t("unit.km")} stroke="#22d3ee" strokeWidth={2} fill="url(#gd)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card id="d.status" title={t("chart.status")}>
          <div className="relative">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={donut} dataKey="v" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
                  {donut.map((d, i) => <Cell key={i} fill={d.c} />)}
                </Pie>
                <Tooltip {...chartTip} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center"><div className="text-2xl font-semibold">{devices?.length ?? 0}</div><div className="text-[10px] text-muted">{t("kpi.vehicles")}</div></div>
            </div>
          </div>
          <div className="flex justify-center gap-4 text-xs text-muted flex-wrap">
            {donut.map((d) => <span key={d.name} className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: d.c }} />{d.name} {d.v}</span>)}
          </div>
        </Card>

        <Card id="d.veh" title={t("chart.byvehicle")} className="lg:col-span-2">
          {perVehicle.length ? (
            <ResponsiveContainer width="100%" height={Math.max(180, Math.min(8, perVehicle.length) * 34)}>
              <BarChart data={perVehicle.slice(0, 8).map((x) => ({ name: x.name, km: +mToKm(x.a.dist).toFixed(1) }))} layout="vertical">
                <CartesianGrid stroke="rgba(148,163,184,.22)" horizontal={false} />
                <XAxis type="number" {...AX} /><YAxis type="category" dataKey="name" {...AX} width={80} orientation="left" />
                <Tooltip {...chartTip} formatter={(v) => `${v} ${t("unit.km")}`} />
                <Bar dataKey="km" radius={[0, 6, 6, 0]}>{perVehicle.slice(0, 8).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : loading ? <Skeleton className="h-48" /> : <Empty />}
        </Card>

        <Card id="d.hist" title={t("chart.speeddist")}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hist}>
              {grid}<XAxis dataKey="name" {...AX} /><YAxis {...AX} width={34} />
              <Tooltip {...chartTip} formatter={(v) => `${v} ${t("unit.h")}`} />
              <Bar dataKey="h" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card id="d.util" title={t("chart.util")} className="lg:col-span-2">
          {util.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={util}>
                {grid}<XAxis dataKey="name" {...AX} /><YAxis {...AX} width={34} />
                <Tooltip {...chartTip} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="moving" name={t("state.moving")} stackId="a" fill="#22d3ee" />
                <Bar dataKey="idle" name={t("chart.idling")} stackId="a" fill="#fb923c" />
                <Bar dataKey="stopped" name={t("state.stopped")} stackId="a" fill="#475569" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card id="d.hour" title={t("chart.hourly")}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly}>
              {grid}<XAxis dataKey="h" {...AX} interval={2} /><YAxis {...AX} width={30} />
              <Tooltip {...chartTip} formatter={(v) => `${v} ${t("unit.h")}`} />
              <Bar dataKey="hrs" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card id="d.score" title={t("chart.scores")} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted text-xs text-start"><tr>
                {(["tbl.vehicle", "tbl.distance", "tbl.avg", "tbl.max", "tbl.overspeed", "tbl.harsh", "tbl.score"] as Key[]).map((h) => <th key={h} className="py-2 pe-4 font-medium text-start">{t(h)}</th>)}
              </tr></thead>
              <tbody>
                {perVehicle.map(({ id, name: n, a }) => {
                  const sc = driverScore(a);
                  return (
                    <tr key={id} className="border-t border-line">
                      <td className="py-2 pe-4"><Link className="hover:text-accent" href={`/devices/${id}`}>{n}</Link></td>
                      <td className="pe-4 tabular-nums">{fmtNum(mToKm(a.dist), 1)}</td>
                      <td className="pe-4 tabular-nums">{fmtNum(avgSpeed(a))}</td>
                      <td className="pe-4 tabular-nums">{fmtNum(a.maxSpeed)}</td>
                      <td className="pe-4 tabular-nums">{a.overCount}</td>
                      <td className="pe-4 tabular-nums">{a.harshBrake + a.harshAccel}</td>
                      <td><span className="px-2 py-0.5 rounded-lg text-xs font-medium tabular-nums" style={{ background: (sc > 80 ? "#34d399" : sc > 60 ? "#fbbf24" : "#f43f5e") + "22", color: sc > 80 ? "#34d399" : sc > 60 ? "#fbbf24" : "#f43f5e" }}>{sc}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!perVehicle.length && <Empty />}
          </div>
        </Card>

        <Card id="d.events" title={t("chart.eventtypes")}>
          {eventTypes.length ? (
            <ResponsiveContainer width="100%" height={Math.max(180, eventTypes.length * 30)}>
              <BarChart data={eventTypes} layout="vertical">
                <XAxis type="number" hide /><YAxis type="category" dataKey="type" {...AX} width={110} orientation="left" />
                <Tooltip {...chartTip} />
                <Bar dataKey="n" fill="#fb923c" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card id="d.batt" title={t("chart.lowbatt")} right={<BatteryWarning size={16} className="text-amber-400" />}>
          <ul className="space-y-2 text-sm">
            {lowBattery.map((p) => (
              <li key={p.deviceId} className="flex justify-between"><span>{name.get(p.deviceId)}</span>
                <span className="tabular-nums text-amber-400">{fmtNum(p.attributes.batteryLevel ?? 0)}%</span></li>
            ))}
            {!lowBattery.length && <Empty text={t("chart.battok")} />}
          </ul>
        </Card>

        <Card id="d.recent" title={t("chart.recent")} className="lg:col-span-2">
          <ul className="space-y-2 text-xs max-h-56 overflow-y-auto">
            {[...(events ?? [])].reverse().slice(0, 15).map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span className="truncate">{name.get(e.deviceId) ?? e.deviceId} <span className="text-muted">· {evLabel(t, e.type)}</span></span>
                <span className="text-muted shrink-0">{fmtDateTime(e.eventTime)}</span>
              </li>
            ))}
            {!events?.length && <Empty />}
          </ul>
        </Card>
      </div>
    </div>
  );
}
