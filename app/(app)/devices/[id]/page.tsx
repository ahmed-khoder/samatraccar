"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Pause, Play, Route, Gauge, Clock, Timer, ParkingCircle, X } from "lucide-react";
import { useDevices, useReport } from "@/lib/api";
import { fmtDateTime, fmtDuration, fmtNum, fmtTime, knToKmh, mToKm, Range, rangeDates } from "@/lib/format";
import type { Position, Stop, Summary, TEvent, Trip } from "@/lib/types";
import { Card, chartTip, Empty, Kpi, RangePicker, Skeleton } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });
const AX = { stroke: "#8a99b3", fontSize: 11, tickLine: false, axisLine: false } as const;

export default function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { data: devices } = useDevices();
  const dev = devices?.find((d) => d.id === id);
  const [range, setRange] = useState<Range>("today");
  const base = useMemo(() => rangeDates(range), [range]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const win = useMemo(() => (trip ? { from: trip.startTime, to: trip.endTime } : base), [trip, base]);

  const { data: route, isLoading } = useReport<Position[]>("route", win, id);
  const { data: trips } = useReport<Trip[]>("trips", base, id);
  const { data: stops } = useReport<Stop[]>("stops", base, id);
  const { data: summary } = useReport<Summary[]>("summary", base, id);
  const { data: events } = useReport<TEvent[]>("events", base, id);

  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mult, setMult] = useState(4);
  const [tab, setTab] = useState<"trips" | "stops" | "events">("trips");
  const n = route?.length ?? 0;

  useEffect(() => { setCursor(0); setPlaying(false); }, [route]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setCursor((c) => {
      if (c >= n - 1) { setPlaying(false); return c; }
      return Math.min(n - 1, c + Math.max(1, Math.round(n / 600)) * mult);
    }), 100);
    return () => clearInterval(t);
  }, [playing, n, mult]);

  const series = useMemo(() => {
    if (!route?.length) return [];
    const step = Math.max(1, Math.floor(route.length / 400));
    return route.filter((_, i) => i % step === 0).map((p) => ({
      t: fmtTime(p.fixTime), speed: Math.round(knToKmh(p.speed)), alt: Math.round(p.altitude),
      batt: p.attributes.batteryLevel ?? null,
    }));
  }, [route]);

  const cur = route?.[Math.min(cursor, n - 1)];
  const s = summary?.[0];
  const hasBatt = series.some((x) => x.batt != null);
  const movingTime = (trips ?? []).reduce((a, t) => a + t.duration, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link href="/live" className="btn !p-2" aria-label="Back"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="text-xl font-semibold">{dev?.name ?? `Device ${id}`}</h1>
              <p className="text-xs text-muted">{dev?.model || dev?.uniqueId}</p>
            </div>
          </div>
          <RangePicker value={range} onChange={(r) => { setRange(r); setTrip(null); }} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Distance" value={fmtNum(mToKm(s?.distance), 1)} unit="km" icon={Route} color="#8b5cf6" />
          <Kpi label="Max speed" value={fmtNum(knToKmh(s?.maxSpeed))} unit="km/h" icon={Gauge} color="#f43f5e" />
          <Kpi label="Avg speed" value={fmtNum(knToKmh(s?.averageSpeed))} unit="km/h" icon={Gauge} color="#fbbf24" />
          <Kpi label="Driving time" value={fmtDuration(movingTime)} icon={Timer} color="#22d3ee" sub={`${trips?.length ?? 0} trips`} />
          <Kpi label="Engine hours" value={fmtDuration(s?.engineHours ?? 0)} icon={Clock} color="#f472b6" sub={`${stops?.length ?? 0} stops`} />
        </div>

        <div className="grid xl:grid-cols-3 gap-4">
          <section className="glass overflow-hidden xl:col-span-2 flex flex-col">
            <div className="h-[48vh] min-h-[320px] relative">
              <MapView route={route} cursor={cursor} follow={playing} />
              {trip && (
                <button onClick={() => setTrip(null)} className="btn glass absolute top-3 left-3 z-[500]">
                  <X size={14} />Trip {fmtTime(trip.startTime)}–{fmtTime(trip.endTime)}
                </button>
              )}
              {!isLoading && !n && <div className="absolute inset-0 grid place-items-center z-[400] pointer-events-none"><span className="glass px-4 py-2 text-sm text-muted">No movement in this period</span></div>}
              <div className="absolute bottom-3 left-3 z-[500] glass px-3 py-2 text-[11px] flex gap-3">
                {[["#64748b", "stopped"], ["#22d3ee", "<40"], ["#a3e635", "<80"], ["#fbbf24", "<110"], ["#f43f5e", "110+"]].map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ background: c }} />{l}</span>
                ))}
              </div>
            </div>
            <div className="p-3 border-t border-line flex items-center gap-3">
              <button className="btn btn-on !p-2" disabled={!n} onClick={() => { if (cursor >= n - 1) setCursor(0); setPlaying((p) => !p); }}>
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <input type="range" min={0} max={Math.max(0, n - 1)} value={cursor} onChange={(e) => setCursor(+e.target.value)} className="flex-1 accent-cyan-400" disabled={!n} />
              <select className="input !w-auto !py-1.5 !text-xs" value={mult} onChange={(e) => setMult(+e.target.value)}>
                {[1, 2, 4, 8, 16].map((m) => <option key={m} value={m}>{m}×</option>)}
              </select>
              <div className="text-xs text-muted tabular-nums w-28 text-right hidden sm:block">
                {cur ? <>{fmtTime(cur.fixTime)} · {fmtNum(knToKmh(cur.speed))} km/h</> : "—"}
              </div>
            </div>
          </section>

          <div className="space-y-4">
            <Card title="Speed (km/h)">
              {series.length ? (
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={series}>
                    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.5} /><stop offset="100%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="rgba(148,163,184,.1)" vertical={false} />
                    <XAxis dataKey="t" {...AX} minTickGap={40} /><YAxis {...AX} width={30} />
                    <Tooltip {...chartTip} />
                    <Area dataKey="speed" stroke="#f43f5e" fill="url(#sg)" strokeWidth={1.8} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </Card>
            <Card title="Altitude (m)">
              {series.length ? (
                <ResponsiveContainer width="100%" height={110}>
                  <AreaChart data={series}>
                    <XAxis dataKey="t" hide /><YAxis {...AX} width={34} />
                    <Tooltip {...chartTip} />
                    <Area dataKey="alt" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={1.8} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </Card>
            {hasBatt && (
              <Card title="Battery (%)">
                <ResponsiveContainer width="100%" height={110}>
                  <AreaChart data={series}>
                    <XAxis dataKey="t" hide /><YAxis {...AX} width={30} domain={[0, 100]} />
                    <Tooltip {...chartTip} />
                    <Area dataKey="batt" stroke="#34d399" fill="#34d399" fillOpacity={0.2} strokeWidth={1.8} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            )}
          </div>
        </div>

        <Card title="Activity" right={
          <div className="flex gap-1.5">
            {(["trips", "stops", "events"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`btn capitalize ${tab === t ? "btn-on" : ""}`}>{t}</button>
            ))}
          </div>}>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            {tab === "trips" && (trips?.length ? (
              <table className="w-full text-sm"><thead className="text-xs text-muted text-left"><tr>{["Start", "End", "Duration", "Distance", "Avg", "Max", "From → To"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
                <tbody>{trips.map((t, i) => (
                  <tr key={i} onClick={() => { setTrip(t); window.scrollTo?.(0, 0); }} className={`border-t border-line cursor-pointer hover:bg-white/5 ${trip === t ? "bg-accent/10" : ""}`}>
                    <td className="py-2 pr-4 whitespace-nowrap">{fmtDateTime(t.startTime)}</td><td className="pr-4 whitespace-nowrap">{fmtDateTime(t.endTime)}</td>
                    <td className="pr-4">{fmtDuration(t.duration)}</td><td className="pr-4 tabular-nums">{fmtNum(mToKm(t.distance), 1)} km</td>
                    <td className="pr-4 tabular-nums">{fmtNum(knToKmh(t.averageSpeed))}</td><td className="pr-4 tabular-nums">{fmtNum(knToKmh(t.maxSpeed))}</td>
                    <td className="text-xs text-muted min-w-64">{t.startAddress || `${t.startLat.toFixed(3)},${t.startLon.toFixed(3)}`} → {t.endAddress || `${t.endLat.toFixed(3)},${t.endLon.toFixed(3)}`}</td>
                  </tr>))}</tbody></table>
            ) : <Empty text="No trips" />)}
            {tab === "stops" && (stops?.length ? (
              <table className="w-full text-sm"><thead className="text-xs text-muted text-left"><tr>{["Start", "End", "Duration", "Location"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
                <tbody>{stops.map((t, i) => (
                  <tr key={i} className="border-t border-line"><td className="py-2 pr-4 whitespace-nowrap">{fmtDateTime(t.startTime)}</td><td className="pr-4 whitespace-nowrap">{fmtDateTime(t.endTime)}</td>
                    <td className="pr-4"><ParkingCircle size={13} className="inline mr-1 text-amber-400" />{fmtDuration(t.duration)}</td>
                    <td className="text-xs text-muted">{t.address || `${t.lat.toFixed(4)}, ${t.lon.toFixed(4)}`}</td></tr>))}</tbody></table>
            ) : <Empty text="No stops" />)}
            {tab === "events" && (events?.length ? (
              <ul className="text-sm divide-y divide-line">{[...events].reverse().map((e) => (
                <li key={e.id} className="py-2 flex justify-between"><span>{e.type}</span><span className="text-muted">{fmtDateTime(e.eventTime)}</span></li>))}</ul>
            ) : <Empty text="No events" />)}
          </div>
        </Card>
      </div>
    </div>
  );
}
