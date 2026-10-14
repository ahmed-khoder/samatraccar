"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Battery, Gauge, KeyRound, Satellite, History, X, MapPin, Signal } from "lucide-react";
import { useDevices, useGeofences, usePositions } from "@/lib/api";
import { deviceState, fmtNum, knToKmh, mToKm, STATE_COLOR, timeAgo } from "@/lib/format";
import { Skeleton } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });
const FILTERS = ["all", "moving", "stopped", "offline"] as const;

export default function Live() {
  const { data: devices } = useDevices();
  const { data: positions } = usePositions();
  const { data: geofences } = useGeofences();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [sel, setSel] = useState<number | null>(null);

  const posMap = useMemo(() => new Map((positions ?? []).map((p) => [p.deviceId, p])), [positions]);
  const rows = useMemo(() => (devices ?? [])
    .map((d) => ({ d, p: posMap.get(d.id), st: deviceState(d, posMap.get(d.id)) }))
    .filter((r) => (filter === "all" || r.st === filter) && r.d.name.toLowerCase().includes(q.toLowerCase())),
  [devices, posMap, q, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: devices?.length ?? 0, moving: 0, stopped: 0, offline: 0 };
    (devices ?? []).forEach((d) => { const s = deviceState(d, posMap.get(d.id)); c[s] = (c[s] ?? 0) + 1; });
    return c;
  }, [devices, posMap]);

  const selRow = sel ? rows.find((r) => r.d.id === sel) ?? (devices ?? []).map((d) => ({ d, p: posMap.get(d.id), st: deviceState(d, posMap.get(d.id)) })).find((r) => r.d.id === sel) : null;

  return (
    <div className="h-full flex flex-col-reverse md:flex-row">
      <div className="md:w-[360px] h-[42%] md:h-full shrink-0 flex flex-col border-t md:border-t-0 md:border-r border-line bg-solid/70 backdrop-blur z-10">
        <div className="p-3 space-y-2.5 border-b border-line">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search vehicles…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`btn capitalize whitespace-nowrap ${filter === f ? "btn-on" : ""}`}>
                {f !== "all" && <span className="size-2 rounded-full" style={{ background: STATE_COLOR[f] }} />}
                {f} <span className="text-muted">{counts[f] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {!devices && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          {rows.map(({ d, p, st }) => (
            <button key={d.id} onClick={() => setSel(d.id)}
              className={`w-full text-left p-3 rounded-xl border transition ${sel === d.id ? "border-accent/60 bg-accent/10" : "border-transparent hover:bg-white/5"}`}>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full shrink-0" style={{ background: STATE_COLOR[st] }} />
                <span className="font-medium text-sm truncate flex-1">{d.name}</span>
                <span className="text-sm tabular-nums" style={{ color: STATE_COLOR[st] }}>{fmtNum(knToKmh(p?.speed))} <span className="text-[10px] text-muted">km/h</span></span>
              </div>
              <div className="text-[11px] text-muted mt-1 pl-4.5 truncate">
                {st} · {timeAgo(p?.fixTime ?? d.lastUpdate)}{p?.address ? ` · ${p.address}` : ""}
              </div>
            </button>
          ))}
          {devices && !rows.length && <p className="text-center text-muted text-sm py-8">No vehicles match</p>}
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        <MapView devices={devices} positions={positions} geofences={geofences} selectedId={sel} onSelect={setSel} />
        {selRow && <Detail row={selRow} onClose={() => setSel(null)} />}
      </div>
    </div>
  );
}

function Detail({ row: { d, p, st }, onClose }: { row: { d: import("@/lib/types").Device; p?: import("@/lib/types").Position; st: string }; onClose: () => void }) {
  const a = p?.attributes ?? {};
  const batt = a.batteryLevel;
  const Stat = ({ icon: I, label, value }: { icon: typeof Gauge; label: string; value: string }) => (
    <div className="bg-white/[.04] rounded-xl p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted"><I size={12} />{label}</div>
      <div className="text-sm font-medium mt-0.5 tabular-nums">{value}</div>
    </div>
  );
  return (
    <div className="glass absolute z-[600] left-3 right-3 bottom-3 md:left-auto md:right-16 md:top-3 md:bottom-auto md:w-80 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{d.name}</h3>
          <p className="text-xs flex items-center gap-1.5" style={{ color: STATE_COLOR[st] }}>
            <span className="size-2 rounded-full" style={{ background: STATE_COLOR[st] }} />{st} · {timeAgo(p?.fixTime ?? d.lastUpdate)}
          </p>
        </div>
        <button onClick={onClose} className="btn !p-1.5" aria-label="Close"><X size={14} /></button>
      </div>
      {p ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={Gauge} label="Speed" value={`${fmtNum(knToKmh(p.speed))} km/h`} />
            <Stat icon={Battery} label="Battery" value={batt != null ? `${fmtNum(batt)}%` : a.battery != null ? `${a.battery} V` : "—"} />
            <Stat icon={KeyRound} label="Ignition" value={a.ignition == null ? "—" : a.ignition ? "On" : "Off"} />
            <Stat icon={Satellite} label="Satellites" value={a.sat != null ? String(a.sat) : "—"} />
            <Stat icon={Signal} label="Signal" value={a.rssi != null ? String(a.rssi) : "—"} />
            <Stat icon={MapPin} label="Odometer" value={a.totalDistance != null ? `${fmtNum(mToKm(a.totalDistance))} km` : "—"} />
          </div>
          <p className="text-xs text-muted flex gap-1.5"><MapPin size={13} className="shrink-0 mt-0.5" />
            {p.address || `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`}</p>
        </>
      ) : <p className="text-sm text-muted">No position received yet.</p>}
      <Link href={`/devices/${d.id}`} className="btn btn-on w-full justify-center"><History size={14} />Trip history &amp; analytics</Link>
    </div>
  );
}
