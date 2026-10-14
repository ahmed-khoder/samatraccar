"use client";
import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Car, Zap, Route, Gauge, Clock, Navigation, BatteryWarning, Bell, Activity } from "lucide-react";
import Link from "next/link";
import { useDevices, usePositions, useReport } from "@/lib/api";
import { deviceState, fmtDateTime, fmtDuration, fmtNum, knToKmh, mToKm, Range, rangeDates, STATE_COLOR } from "@/lib/format";
import type { Summary, TEvent, Trip } from "@/lib/types";
import { Card, chartTip, Empty, Kpi, RangePicker, Skeleton } from "@/components/ui";

const AX = { stroke: "#8a99b3", fontSize: 11, tickLine: false, axisLine: false } as const;
const PALETTE = ["#22d3ee", "#8b5cf6", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c", "#a3e635"];

export default function Dashboard() {
  const [range, setRange] = useState<Range>("7d");
  const r = useMemo(() => rangeDates(range), [range]);
  const { data: devices } = useDevices();
  const { data: positions } = usePositions();
  const { data: summary } = useReport<Summary[]>("summary", r);
  const { data: daily } = useReport<Summary[]>("summary", r, null, "&daily=true");
  const { data: trips } = useReport<Trip[]>("trips", r);
  const { data: events } = useReport<TEvent[]>("events", r);

  const devName = useMemo(() => new Map((devices ?? []).map((d) => [d.id, d.name])), [devices]);
  const posMap = useMemo(() => new Map((positions ?? []).map((p) => [p.deviceId, p])), [positions]);

  const live = useMemo(() => {
    const c = { moving: 0, stopped: 0, offline: 0, unknown: 0 };
    (devices ?? []).forEach((d) => { c[deviceState(d, posMap.get(d.id)) as keyof typeof c]++; });
    return c;
  }, [devices, posMap]);

  const tot = useMemo(() => {
    const s = summary ?? [];
    const dist = s.reduce((a, x) => a + x.distance, 0);
    return {
      dist: mToKm(dist),
      max: Math.max(0, ...s.map((x) => x.maxSpeed)),
      hours: s.reduce((a, x) => a + x.engineHours, 0),
      avg: s.length ? s.reduce((a, x) => a + x.averageSpeed, 0) / s.filter((x) => x.averageSpeed > 0).length || 0 : 0,
    };
  }, [summary]);

  const dailySeries = useMemo(() => {
    const m = new Map<string, number>();
    (daily ?? []).forEach((x) => {
      const k = new Date(x.startTime).toLocaleDateString("en-CA");
      m.set(k, (m.get(k) ?? 0) + mToKm(x.distance));
    });
    return [...m].sort().map(([date, km]) => ({ date: date.slice(5), km: +km.toFixed(1) }));
  }, [daily]);

  const perVehicle = useMemo(() =>
    (summary ?? []).filter((x) => x.distance > 0).sort((a, b) => b.distance - a.distance).slice(0, 8)
      .map((x) => ({ name: x.deviceName, km: +mToKm(x.distance).toFixed(1) })), [summary]);

  const hourly = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ h: `${i}`, trips: 0 }));
    (trips ?? []).forEach((t) => { h[new Date(t.startTime).getHours()].trips++; });
    return h;
  }, [trips]);

  const speedDist = useMemo(() => {
    const b = [["0", 0], ["1-30", 0], ["30-60", 0], ["60-90", 0], ["90-120", 0], ["120+", 0]] as [string, number][];
    (positions ?? []).forEach((p) => {
      const k = knToKmh(p.speed);
      b[k < 1 ? 0 : k < 30 ? 1 : k < 60 ? 2 : k < 90 ? 3 : k < 120 ? 4 : 5][1]++;
    });
    return b.map(([name, n]) => ({ name, n }));
  }, [positions]);

  const eventTypes = useMemo(() => {
    const m = new Map<string, number>();
    (events ?? []).forEach((e) => m.set(e.type, (m.get(e.type) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, n]) => ({ type, n }));
  }, [events]);

  const lowBattery = useMemo(() => (positions ?? [])
    .filter((p) => (p.attributes.batteryLevel ?? 100) < 25)
    .sort((a, b) => (a.attributes.batteryLevel ?? 0) - (b.attributes.batteryLevel ?? 0)).slice(0, 5), [positions]);

  const topSpeed = useMemo(() => [...(summary ?? [])].sort((a, b) => b.maxSpeed - a.maxSpeed).slice(0, 5), [summary]);
  const loading = !summary || !devices;

  const donut = [
    { name: "Moving", v: live.moving, c: STATE_COLOR.moving },
    { name: "Stopped", v: live.stopped, c: STATE_COLOR.stopped },
    { name: "Offline", v: live.offline + live.unknown, c: STATE_COLOR.offline },
  ];

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Fleet analytics</h1>
          <p className="text-xs text-muted">Live status and performance across all vehicles</p>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <Kpi label="Vehicles" value={devices?.length ?? "–"} icon={Car} sub={`${live.moving + live.stopped} online`} />
        <Kpi label="Moving now" value={live.moving} icon={Navigation} color="#34d399" />
        <Kpi label="Distance" value={fmtNum(tot.dist)} unit="km" icon={Route} color="#8b5cf6" />
        <Kpi label="Trips" value={trips?.length ?? "–"} icon={Activity} color="#60a5fa" />
        <Kpi label="Max speed" value={fmtNum(knToKmh(tot.max))} unit="km/h" icon={Gauge} color="#f43f5e" />
        <Kpi label="Avg speed" value={fmtNum(knToKmh(tot.avg))} unit="km/h" icon={Zap} color="#fbbf24" />
        <Kpi label="Engine hours" value={fmtNum(tot.hours / 3.6e6, 1)} unit="h" icon={Clock} color="#f472b6" />
        <Kpi label="Events" value={events?.length ?? "–"} icon={Bell} color="#fb923c" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Distance per day (km)" className="lg:col-span-2">
          {loading ? <Skeleton className="h-60" /> : dailySeries.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dailySeries}>
                <defs><linearGradient id="gd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid stroke="rgba(148,163,184,.1)" vertical={false} />
                <XAxis dataKey="date" {...AX} /><YAxis {...AX} width={40} />
                <Tooltip {...chartTip} />
                <Area dataKey="km" stroke="#22d3ee" strokeWidth={2} fill="url(#gd)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card title="Fleet status (live)">
          <div className="relative">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={donut} dataKey="v" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
                  {donut.map((d) => <Cell key={d.name} fill={d.c} />)}
                </Pie>
                <Tooltip {...chartTip} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center"><div className="text-2xl font-semibold">{devices?.length ?? 0}</div><div className="text-[10px] text-muted">vehicles</div></div>
            </div>
          </div>
          <div className="flex justify-center gap-4 text-xs text-muted">
            {donut.map((d) => <span key={d.name} className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: d.c }} />{d.name} {d.v}</span>)}
          </div>
        </Card>

        <Card title="Top vehicles by distance (km)" className="lg:col-span-2">
          {perVehicle.length ? (
            <ResponsiveContainer width="100%" height={Math.max(180, perVehicle.length * 34)}>
              <BarChart data={perVehicle} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid stroke="rgba(148,163,184,.1)" horizontal={false} />
                <XAxis type="number" {...AX} /><YAxis type="category" dataKey="name" {...AX} width={100} />
                <Tooltip {...chartTip} />
                <Bar dataKey="km" radius={[0, 6, 6, 0]}>{perVehicle.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : loading ? <Skeleton className="h-48" /> : <Empty />}
        </Card>

        <Card title="Live speed distribution (km/h)">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={speedDist}>
              <CartesianGrid stroke="rgba(148,163,184,.1)" vertical={false} />
              <XAxis dataKey="name" {...AX} /><YAxis {...AX} width={30} allowDecimals={false} />
              <Tooltip {...chartTip} />
              <Bar dataKey="n" name="vehicles" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Trips by hour of day" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly}>
              <CartesianGrid stroke="rgba(148,163,184,.1)" vertical={false} />
              <XAxis dataKey="h" {...AX} /><YAxis {...AX} width={30} allowDecimals={false} />
              <Tooltip {...chartTip} />
              <Bar dataKey="trips" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Event types">
          {eventTypes.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={eventTypes} layout="vertical">
                <XAxis type="number" hide /><YAxis type="category" dataKey="type" {...AX} width={110} />
                <Tooltip {...chartTip} />
                <Bar dataKey="n" fill="#fb923c" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>

        <Card title="Highest speeds">
          <ul className="space-y-2 text-sm">
            {topSpeed.map((s) => (
              <li key={s.deviceId} className="flex justify-between"><Link className="hover:text-accent" href={`/devices/${s.deviceId}`}>{s.deviceName}</Link>
                <span className="tabular-nums text-rose-400">{fmtNum(knToKmh(s.maxSpeed))} km/h</span></li>
            ))}
            {!topSpeed.length && <Empty />}
          </ul>
        </Card>

        <Card title="Low battery" right={<BatteryWarning size={16} className="text-amber-400" />}>
          <ul className="space-y-2 text-sm">
            {lowBattery.map((p) => (
              <li key={p.deviceId} className="flex justify-between"><span>{devName.get(p.deviceId)}</span>
                <span className="tabular-nums text-amber-400">{fmtNum(p.attributes.batteryLevel ?? 0)}%</span></li>
            ))}
            {!lowBattery.length && <Empty text="All batteries healthy" />}
          </ul>
        </Card>

        <Card title="Recent events">
          <ul className="space-y-2 text-xs max-h-56 overflow-y-auto">
            {(events ?? []).slice(-12).reverse().map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span className="truncate">{devName.get(e.deviceId) ?? e.deviceId} <span className="text-muted">· {e.type}</span></span>
                <span className="text-muted shrink-0">{fmtDateTime(e.eventTime)}</span>
              </li>
            ))}
            {!events?.length && <Empty />}
          </ul>
        </Card>
      </div>

      <Card title="Vehicle summary">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted text-xs text-left"><tr>
              {["Vehicle", "Distance", "Avg speed", "Max speed", "Engine hours"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {(summary ?? []).map((s) => (
                <tr key={s.deviceId} className="border-t border-line">
                  <td className="py-2 pr-4"><Link className="hover:text-accent" href={`/devices/${s.deviceId}`}>{s.deviceName}</Link></td>
                  <td className="pr-4 tabular-nums">{fmtNum(mToKm(s.distance), 1)} km</td>
                  <td className="pr-4 tabular-nums">{fmtNum(knToKmh(s.averageSpeed))} km/h</td>
                  <td className="pr-4 tabular-nums">{fmtNum(knToKmh(s.maxSpeed))} km/h</td>
                  <td className="tabular-nums">{fmtDuration(s.engineHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary && !summary.length && <Empty />}
        </div>
      </Card>
    </div>
  );
}
