"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Pause, Play, Route, Gauge, Timer, ParkingCircle, X, Palette, ShieldCheck, Activity, OctagonAlert, ChevronsRight, AlertTriangle } from "lucide-react";
import { useAnalyticsRange, useDevices, useReport } from "@/lib/api";
import { useRangeSel } from "@/lib/hooks";
import Place from "@/components/Place";
import { avgSpeed, driverScore, type StopSeg, type TripSeg } from "@/lib/agg";
import { fmtDateTime, fmtDuration, fmtNum, fmtTime, knToKmh, mToKm, toDateInput } from "@/lib/format";
import { evLabel } from "@/lib/events";
import { iconOf, deviceColor } from "@/lib/vehicle";
import { useI18n } from "@/lib/i18n";
import type { Position, TEvent } from "@/lib/types";
import { Card, chartTip, Empty, Kpi, RangeBar, Skeleton } from "@/components/ui";
import DeviceEditor from "@/components/DeviceEditor";
import type { Key } from "@/lib/dict";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });
const AX = { stroke: "#8a99b3", fontSize: 11, tickLine: false, axisLine: false } as const;

export default function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useI18n();
  const id = Number(use(params).id);
  const { data: devices } = useDevices();
  const dev = devices?.find((d) => d.id === id);
  const sp = useSearchParams();
  const tripParam = Number(sp.get("trip")) || null;
  const { range, setRange, custom, setCustom, win: base } = useRangeSel("today");
  // deep link from reports: open the day of that trip
  const deepLinked = useRef(false);
  useEffect(() => {
    if (tripParam && !deepLinked.current) { deepLinked.current = true; const d = toDateInput(new Date(tripParam).toISOString()); setCustom({ from: d, to: d }); }
  }, [tripParam, setCustom]);
  const [trip, setTrip] = useState<TripSeg | null>(null);
  const [edit, setEdit] = useState(false);
  const ids = useMemo(() => [id], [id]);
  const an = useAnalyticsRange(base, ids);
  const sum = an.perDevice.get(id);
  const { data: events } = useReport<TEvent[]>("events", base, id);

  // Full-resolution route only for short windows (<= 2 days) or a selected trip, to keep payloads sane.
  const win = useMemo(() => {
    if (trip) return { from: new Date(trip.s - 60000).toISOString(), to: new Date(trip.e + 60000).toISOString() };
    return new Date(base.to).getTime() - new Date(base.from).getTime() <= 2 * 864e5 + 36e5 ? base : null;
  }, [trip, base]);
  const { data: raw, isLoading } = useReport<Position[]>("route", win, id);
  const route = useMemo(() => raw?.filter((p) => p.latitude !== 0 || p.longitude !== 0), [raw]);

  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mult, setMult] = useState(4);
  const [tab, setTab] = useState<"trips" | "stops" | "events">("trips");
  const n = route?.length ?? 0;
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCursor(0); setPlaying(false); }, [route]);
  useEffect(() => {
    if (!playing || !n) return;
    let last = performance.now(), raf = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      // ~ 1x == 3 minutes of route per second of playback when sampling is dense
      setCursor((c) => { const nx = c + dt * mult * Math.max(2, n / 90); if (nx >= n - 1) { setPlaying(false); return n - 1; } return nx; });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, n, mult]);

  const series = useMemo(() => {
    if (!route?.length) return [];
    const step = Math.max(1, Math.floor(route.length / 400));
    return route.filter((_, i) => i % step === 0).map((p) => ({
      t: fmtTime(p.fixTime), speed: Math.round(knToKmh(p.speed)), alt: Math.round(p.altitude), batt: p.attributes.batteryLevel ?? null,
    }));
  }, [route]);

  useEffect(() => {
    if (tripParam && !trip) { const f = (an.data && Object.values(an.data.devices[String(id)]?.days ?? {}).flatMap((d) => d.tripList ?? []).find((x) => x.s === tripParam)); if (f) setTrip(f); }
  }, [an.data, tripParam, trip, id]);

  const trips: TripSeg[] = useMemo(() => [...(sum?.tripList ?? [])].sort((a, b) => b.s - a.s), [sum]);
  const stops: StopSeg[] = useMemo(() => [...(sum?.stopList ?? [])].sort((a, b) => b.s - a.s), [sum]);
  const cur = route?.[Math.min(Math.floor(cursor), n - 1)];
  const hasBatt = series.filter((x) => x.batt != null).length > 3;
  const hasAlt = series.some((x) => x.alt !== 0);
  const skew = useMemo(() => {
    if (!route || route.length < 5) return 0;
    const d = route.map((p) => Date.parse(p.fixTime) - Date.parse(p.serverTime)).sort((a, b) => a - b);
    const h = Math.round(d[Math.floor(d.length / 2)] / 36e5);
    return Math.abs(h) >= 1 ? h : 0;
  }, [route]);
  const I = iconOf(dev?.category);
  const color = deviceColor(dev) || "#22d3ee";

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link href="/devices" className="btn !p-2 rtl:rotate-180" aria-label={t("common.back")}><ArrowLeft size={16} /></Link>
            <span className="size-11 rounded-2xl grid place-items-center" style={{ background: color + "22", color }}><I size={24} /></span>
            <div>
              <h1 className="text-xl font-semibold">{dev?.name ?? `#${id}`}</h1>
              <p className="text-xs text-muted" dir="ltr">{dev?.uniqueId}</p>
            </div>
            {dev && <button className="btn" onClick={() => setEdit(true)}><Palette size={14} />{t("edit.customize")}</button>}
          </div>
          <RangeBar value={range} custom={custom} onPreset={(r) => { setRange(r); setTrip(null); }} onCustom={(c) => { setCustom(c); setTrip(null); }} win={base} />
        </div>

        {skew !== 0 && (
          <div className="glass p-3 text-xs text-amber-400 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />{t("dev.clock", { h: Math.abs(skew), dir: t(skew > 0 ? "dev.ahead" : "dev.behind") })}
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Kpi label={t("kpi.distance")} value={sum ? fmtNum(mToKm(sum.dist), 1) : "–"} unit={t("unit.km")} icon={Route} color="#8b5cf6" />
          <Kpi label={t("kpi.maxspeed")} value={sum ? fmtNum(sum.maxSpeed) : "–"} unit={t("unit.kmh")} icon={Gauge} color="#f43f5e" />
          <Kpi label={t("kpi.avgspeed")} value={sum ? fmtNum(avgSpeed(sum)) : "–"} unit={t("unit.kmh")} icon={Gauge} color="#fbbf24" />
          <Kpi label={t("kpi.driving")} value={sum ? fmtDuration(sum.movingMs) : "–"} icon={Timer} color="#22d3ee" sub={t("kpi.idle") + " " + (sum ? fmtDuration(sum.idleMs) : "–")} />
          <Kpi label={t("kpi.trips")} value={sum?.trips ?? "–"} icon={Activity} color="#60a5fa" sub={`${stops.length} ${t("tab.stops")}`} />
          <Kpi label={t("kpi.score")} value={sum ? driverScore(sum) : "–"} unit="/100" icon={ShieldCheck} color="#34d399" sub={sum ? t("kpi.harshsub", { b: sum.harshBrake, a: sum.harshAccel }) : undefined} />
        </div>

        <div className="grid xl:grid-cols-3 gap-4">
          <section className="glass overflow-hidden xl:col-span-2 flex flex-col rise">
            <div ref={mapRef} className="h-[50vh] min-h-[340px] relative">
              <MapView route={route} routeDevice={dev} cursor={cursor} follow={playing} />
              {trip && (
                <button onClick={() => setTrip(null)} className="btn glass absolute top-3 start-3 z-[500]">
                  <X size={14} />{t("dev.trip")} {fmtTime(new Date(trip.s).toISOString())}–{fmtTime(new Date(trip.e).toISOString())}
                </button>
              )}
              {!win && <div className="absolute inset-0 grid place-items-center z-[400] pointer-events-none"><span className="glass px-4 py-2 text-sm text-muted">{t("dev.pickTrip")}</span></div>}
              {win && !isLoading && !n && <div className="absolute inset-0 grid place-items-center z-[400] pointer-events-none"><span className="glass px-4 py-2 text-sm text-muted">{t("dev.nomove")}</span></div>}
              <div className="absolute bottom-3 start-3 z-[500] glass px-3 py-2 text-[11px] flex gap-3" dir="ltr">
                {[["#64748b", "0"], ["#22d3ee", "<40"], ["#a3e635", "<80"], ["#fbbf24", "<110"], ["#f43f5e", "110+"]].map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ background: c }} />{l}</span>
                ))}
              </div>
            </div>
            <div className="p-3 border-t border-line flex items-center gap-3">
              <button className="btn btn-on !p-2" disabled={!n} onClick={() => { if (cursor >= n - 1) setCursor(0); setPlaying((p) => !p); }} aria-label="play">
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <input type="range" dir="ltr" min={0} max={Math.max(0, n - 1)} step={0.1} value={cursor} onChange={(e) => setCursor(+e.target.value)} className="flex-1 accent-cyan-400" disabled={!n} />
              <select className="input !w-auto !py-1.5 !text-xs" value={mult} onChange={(e) => setMult(+e.target.value)} dir="ltr">
                {[1, 2, 4, 8, 16, 32].map((m) => <option key={m} value={m}>{m}×</option>)}
              </select>
              <div className="text-xs text-muted tabular-nums text-end hidden sm:block min-w-28">
                {cur ? <>{fmtTime(cur.fixTime)} · {fmtNum(knToKmh(cur.speed))} {t("unit.kmh")}</> : "—"}
              </div>
            </div>
          </section>

          <div className="space-y-4">
            <Card id="v.speed" title={`${t("stat.speed")} (${t("unit.kmh")})`}>
              {series.length ? (
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={series}>
                    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.5} /><stop offset="100%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="rgba(148,163,184,.22)" vertical={false} />
                    <XAxis dataKey="t" {...AX} minTickGap={40} /><YAxis {...AX} width={30} />
                    <Tooltip {...chartTip} />
                    <Area dataKey="speed" stroke="#f43f5e" fill="url(#sg)" strokeWidth={1.8} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </Card>
            {hasAlt && <Card id="v.alt" title={`${t("dev.altitude")} (m)`}>
              {series.length ? (
                <ResponsiveContainer width="100%" height={110}>
                  <AreaChart data={series}>
                    <XAxis dataKey="t" hide /><YAxis {...AX} width={34} />
                    <Tooltip {...chartTip} />
                    <Area dataKey="alt" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={1.8} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </Card>}
            {hasBatt && (
              <Card id="v.batt" title={`${t("stat.battery")} (%)`}>
                <ResponsiveContainer width="100%" height={110}>
                  <AreaChart data={series}>
                    <XAxis dataKey="t" hide /><YAxis {...AX} width={30} domain={[0, 100]} />
                    <Tooltip {...chartTip} />
                    <Area dataKey="batt" connectNulls stroke="#34d399" fill="#34d399" fillOpacity={0.2} strokeWidth={1.8} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            )}
            {sum && sum.overCount > 0 && (
              <div className="glass p-4 flex items-center gap-3 text-sm"><OctagonAlert className="text-rose-400" size={20} />{t("dev.overspeed", { n: sum.overCount, d: fmtDuration(sum.overMs) })}</div>
            )}
          </div>
        </div>

        <Card id="v.activity" title={t("dev.activity")} right={
          <div className="flex gap-1.5">
            {(["trips", "stops", "events"] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={`btn ${tab === k ? "btn-on" : ""}`}>{t(`tab.${k}` as Key)}</button>
            ))}
          </div>}>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            {tab === "trips" && (trips.length ? (
              <table className="w-full text-sm"><thead className="text-xs text-muted"><tr>{(["tbl.start", "tbl.end", "tbl.duration", "tbl.distance", "tbl.avg", "tbl.max", "tbl.route"] as Key[]).map((h) => <th key={h} className="py-2 pe-4 font-medium text-start">{t(h)}</th>)}</tr></thead>
                <tbody>{trips.map((tr) => (
                  <tr key={tr.s} onClick={() => { setTrip(tr); mapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className={`border-t border-line cursor-pointer hover:bg-fg/5 ${trip?.s === tr.s ? "bg-accent/10" : ""}`}>
                    <td className="py-2 pe-4 whitespace-nowrap">{fmtDateTime(new Date(tr.s).toISOString())}</td><td className="pe-4 whitespace-nowrap">{fmtDateTime(new Date(tr.e).toISOString())}</td>
                    <td className="pe-4 whitespace-nowrap">{fmtDuration(tr.e - tr.s)}</td><td className="pe-4 tabular-nums">{fmtNum(mToKm(tr.dist), 1)} {t("unit.km")}</td>
                    <td className="pe-4 tabular-nums">{fmtNum(tr.avg)}</td><td className="pe-4 tabular-nums">{fmtNum(tr.max)}</td>
                    <td className="text-xs text-muted min-w-64"><Place lat={tr.sLat} lon={tr.sLon} /> <ChevronsRight size={12} className="inline rtl:rotate-180" /> <Place lat={tr.eLat} lon={tr.eLon} /></td>
                  </tr>))}</tbody></table>
            ) : <Empty />)}
            {tab === "stops" && (stops.length ? (
              <table className="w-full text-sm"><thead className="text-xs text-muted"><tr>{(["tbl.start", "tbl.end", "tbl.duration", "tbl.location"] as Key[]).map((h) => <th key={h} className="py-2 pe-4 font-medium text-start">{t(h)}</th>)}</tr></thead>
                <tbody>{stops.map((s) => (
                  <tr key={s.s} className="border-t border-line"><td className="py-2 pe-4 whitespace-nowrap">{fmtDateTime(new Date(s.s).toISOString())}</td><td className="pe-4 whitespace-nowrap">{fmtDateTime(new Date(s.e).toISOString())}</td>
                    <td className="pe-4 whitespace-nowrap"><ParkingCircle size={13} className="inline me-1 text-amber-400" />{fmtDuration(s.e - s.s)}{s.ign ? <span className="text-orange-400 text-[10px] ms-1">{t("kpi.idle")}</span> : null}</td>
                    <td className="text-xs text-muted"><Place lat={s.lat} lon={s.lon} /></td></tr>))}</tbody></table>
            ) : <Empty />)}
            {tab === "events" && (events?.length ? (
              <ul className="text-sm divide-y divide-line">{[...events].reverse().map((e) => (
                <li key={e.id} className="py-2 flex justify-between"><span>{evLabel(t, e.type)}</span><span className="text-muted">{fmtDateTime(e.eventTime)}</span></li>))}</ul>
            ) : <Empty />)}
          </div>
        </Card>
      </div>
      {edit && dev && <DeviceEditor device={dev} onClose={() => setEdit(false)} />}
    </div>
  );
}
