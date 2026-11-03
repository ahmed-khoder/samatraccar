"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Palette, Search, History, IdCard, Copy, Truck, Wifi, WifiOff, Gauge, KeyRound, Route } from "lucide-react";
import { fleetCounts, matchesFilter, type FleetFilter } from "@/lib/fleet";
import { deviceState } from "@/lib/format";
import { powerOf, useAnalytics, useDevices, usePositions, useSimCut } from "@/lib/api";
import { fmtNum, knToKmh, mToKm, rangeDates, timeAgo } from "@/lib/format";
import { vehState } from "@/lib/vstate";
import { usePrefs } from "@/lib/prefs";
import { useI18n } from "@/lib/i18n";
import type { Device } from "@/lib/types";
import DeviceEditor from "@/components/DeviceEditor";
import { Empty, Skeleton } from "@/components/ui";
import FleetList from "@/components/FleetList";
import VehicleInfo, { copy } from "@/components/VehicleInfo";

export default function Vehicles() {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const { data: devices } = useDevices();
  const { data: positions } = usePositions();
  const { cut: simCut } = useSimCut(devices);
  const range = useMemo(() => rangeDates("today"), []);
  const an = useAnalytics(range);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Device | null>(null);
  const [info, setInfo] = useState<Device | null>(null);
  const pos = useMemo(() => new Map((positions ?? []).map((p) => [p.deviceId, p])), [positions]);
  // the phone list shows how long each vehicle has been in its state; one clock tick a minute is enough for that
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(i); }, []);
  const [filter, setFilter] = useState<FleetFilter>("all");
  const rowsInfo = useMemo(() => (devices ?? []).map((d) => {
    const p = pos.get(d.id);
    return { d, r: { status: d.status, base: deviceState(d, p), ignition: d.status === "online" ? p?.attributes.ignition : undefined } };
  }), [devices, pos, now]); // eslint-disable-line react-hooks/exhaustive-deps -- `now` re-checks whether a fix is still fresh
  const counts = useMemo(() => fleetCounts(rowsInfo.map((x) => x.r)), [rowsInfo]);
  const ql = q.toLowerCase();
  const list = rowsInfo.filter((x) => matchesFilter(filter, x.r) && (x.d.name.toLowerCase().includes(ql) || x.d.uniqueId.includes(q) || (x.d.phone ?? "").includes(q))).map((x) => x.d);
  const tiles = [
    { f: "all", k: "bar.total", n: counts.total, c: "#6366f1", I: Truck },
    { f: "online", k: "bar.online", n: counts.online, c: "#16a34a", I: Wifi },
    { f: "offline", k: "bar.offline", n: counts.offline, c: "#64748b", I: WifiOff },
    { f: "moving", k: "bar.moving", n: counts.moving, c: "#0ea5e9", I: Gauge },
    { f: "engine", k: "bar.engine", n: counts.engineOn, c: "#f59e0b", I: KeyRound },
  ] as const;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="md:hidden">
        {devices ? <FleetList devices={devices} positions={pos} now={now} simCut={simCut} /> : <Skeleton className="h-60" />}
      </div>
      <div className="hidden md:flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("nav.vehicles")}</h1>
          <p className="text-xs text-muted">{t("veh.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* five tiles: each shows a count and filters the list when pressed; pressing the active one clears the filter */}
          {tiles.map(({ f, k, n, c, I }) => {
            const on = filter === f;
            return (
              <button key={f} onClick={() => setFilter(on ? "all" : f)} aria-pressed={on} title={t(k)}
                className="group flex items-center gap-2.5 rounded-2xl border px-3.5 py-2 text-start transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
                style={{ borderColor: on ? c : "var(--line)", background: on ? c + "1f" : "var(--panel-solid)", boxShadow: on ? `0 4px 14px ${c}33` : undefined }}>
                <span className="size-8 rounded-xl grid place-items-center shrink-0 transition-transform group-hover:scale-110" style={{ background: c + "22", color: c }}><I size={16} /></span>
                <span className="leading-tight">
                  <span className="block text-lg font-bold tabular-nums" style={{ color: on ? c : undefined }}>{devices ? n : "–"}</span>
                  <span className="block text-[11px] text-muted whitespace-nowrap">{t(k)}</span>
                </span>
              </button>
            );
          })}
          <div className="relative w-56">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !ps-9" placeholder={t("live.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      {/* desktop: one plain row per vehicle, everything on one line */}
      <div className="hidden md:block glass overflow-x-auto rise">
        {!devices ? <Skeleton className="h-60" /> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line text-start [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-normal [&>th]:text-start">
                <th>{t("info.name")}</th><th>{t("stat.state")}</th><th>{t("info.imei")}</th><th>{t("info.sim")}</th>
                <th>{t("stat.battery")}</th><th>{t("veh.today")}</th><th>{t("veh.seen")}</th><th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line [&>tr>td]:px-3 [&>tr>td]:py-2.5 tabular-nums">
              {list.map((d) => {
                const p = pos.get(d.id);
                const { vs, color: c } = vehState(prefs, d, p);
                const today = an.perDevice.get(d.id);
                const bat = p?.attributes.batteryLevel ?? powerOf(d.id)?.batteryLevel;
                return (
                  <tr key={d.id} className="hover:bg-fg/[.04]">
                    <td className="whitespace-nowrap">
                      <button onClick={() => setInfo(d)} className="flex items-center gap-2 font-semibold hover:text-accent">
                        <span className="size-2.5 rounded-full shrink-0" style={{ background: c }} />{d.name}
                        {d.model && <span className="text-muted text-xs font-normal">({d.model})</span>}
                      </button>
                    </td>
                    <td className="whitespace-nowrap" style={{ color: c }}>
                      {t(`state.${vs}` as const)} <span className="text-muted">· {fmtNum(knToKmh(p?.speed))} {t("unit.kmh")}</span>
                    </td>
                    {[d.uniqueId, d.phone].map((v, i) => (
                      <td key={i} className="whitespace-nowrap" dir="ltr">
                        <span className="inline-flex items-center gap-1.5">
                          {v || "—"}
                          {v && <button className="text-muted hover:text-accent" title={t("info.copy")} aria-label={t("info.copy")} onClick={() => copy(v)}><Copy size={13} /></button>}
                        </span>
                      </td>
                    ))}
                    <td>{bat != null ? `${bat}%` : "—"}</td>
                    <td className="whitespace-nowrap">{today ? fmtNum(mToKm(today.dist), 1) : "–"} <span className="text-xs text-muted">{t("unit.km")}</span></td>
                    <td className="whitespace-nowrap">{timeAgo(p?.serverTime ?? d.lastUpdate)}</td>
                    <td className="whitespace-nowrap text-end">
                      <Link href={`/playback/${d.id}`} className="btn !p-1.5 inline-flex text-blue-600" title={t("pb.open")} aria-label={t("pb.open")}><Route size={15} /></Link>{" "}
                      <button className="btn !p-1.5" onClick={() => setInfo(d)} title={t("info.open")} aria-label={t("info.open")}><IdCard size={15} /></button>{" "}
                      <Link href={`/devices/${d.id}`} className="btn !p-1.5 inline-flex" title={t("veh.details")} aria-label={t("veh.details")}><History size={15} /></Link>{" "}
                      <button className="btn !p-1.5" onClick={() => setEdit(d)} title={t("edit.title")} aria-label={t("edit.title")}><Palette size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {devices && list.length === 0 && <Empty />}
      </div>
      {info && <VehicleInfo device={devices?.find((x) => x.id === info.id) ?? info} position={pos.get(info.id)} onClose={() => setInfo(null)} onEdit={() => { setEdit(info); setInfo(null); }} />}
      {edit && <DeviceEditor device={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
