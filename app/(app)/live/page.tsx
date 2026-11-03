"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrefs } from "@/lib/prefs";
import {
  Search, Battery, Gauge, KeyRound, Satellite, History, X, MapPin, Signal, ChevronsLeft, GripHorizontal, Pin, PinOff,
  Palette, Fuel, ChevronLeft, ChevronUp, ChevronDown, AlertTriangle, List, Clock, Navigation, IdCard, Route,
} from "lucide-react";
import { powerOf, useAddress, useDevices, useGeofences, usePositions, useSimCut, useStateSince, useStay } from "@/lib/api";
import { fixAt, fmtDuration, fmtDurationFull, fmtNum, knToKmh, mToKm, noFix, timeAgo } from "@/lib/format";
import { iconOf } from "@/lib/vehicle";
import { distanceKm, mapsDirections, neighbour } from "@/lib/fleet";
import { timeDate } from "@/lib/tz";
import { vehState } from "@/lib/vstate";
import type { VisualState } from "@/lib/format";
import { usePersisted } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Device, Position, Stop } from "@/lib/types";
import { Skeleton } from "@/components/ui";
import type { Key } from "@/lib/dict";
import DeviceEditor from "@/components/DeviceEditor";
import VehicleInfo from "@/components/VehicleInfo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });
const sk = (st: string): Key => (st === "idle" ? "state.idle" : st === "over" ? "state.over" : st === "moving" ? "state.moving" : st === "stopped" ? "state.stopped" : st === "nofix" ? "state.nofix" : "state.offline");
const FILTERS = ["all", "moving", "stopped"] as const;
type Row = { d: Device; p?: Position; st: string; vs: VisualState; color: string };

const DRAWER = {
  left: {
    box: "md:inset-x-auto md:left-0 md:top-0 md:bottom-auto md:h-full md:w-[350px] md:border-t-0 md:border-e",
    hide: "md:translate-y-0 md:-translate-x-[calc(100%-18px)]",
    handle: "md:inset-x-auto md:right-0 md:inset-y-0 md:w-[18px] md:h-auto",
    pad: "md:pt-0 md:pr-[18px]",
  },
  right: {
    box: "md:inset-x-auto md:right-0 md:top-0 md:bottom-auto md:h-full md:w-[350px] md:border-t-0 md:border-s",
    hide: "md:translate-y-0 md:translate-x-[calc(100%-18px)]",
    handle: "md:inset-x-auto md:left-0 md:inset-y-0 md:w-[18px] md:h-auto",
    pad: "md:pt-0 md:pl-[18px]",
  },
  bottom: { box: "md:h-[40%]", hide: "", handle: "", pad: "" },
} as const;

// docked (fixed) panel: logical start/end so flex order follows the writing direction
const DOCK = {
  start: "md:order-first md:h-full md:w-[350px] md:border-e md:border-t-0",
  end: "md:order-last md:h-full md:w-[350px] md:border-s md:border-t-0",
  bottom: "md:order-last md:h-[38%] md:w-full",
} as const;
const DOCK_FLOW = { start: "md:flex-row", end: "md:flex-row", bottom: "md:flex-col" } as const;

export default function Live() {
  const { t, dir } = useI18n();
  const { prefs, set } = usePrefs();
  const { data: devices } = useDevices();
  const { data: positions } = usePositions();
  const { data: geofences } = useGeofences();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [sel, setSel] = useState<number | null>(null);
  // /live?v=<id> (from the phone vehicle list) opens with that vehicle selected; read after hydration so server and client agree
  useEffect(() => {
    const v = Number(new URLSearchParams(window.location.search).get("v"));
    if (v) setSel(v); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);
  const { cut: simCut, still } = useSimCut(devices);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null); // the device's own position, while "my location" is on
  const [editDev, setEditDev] = useState<Device | null>(null);
  const [infoId, setInfoId] = useState<number | null>(null);
  const [hover, setHover] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const fixed = prefs.listMode === "fixed";
  const open = fixed || hover;
  const enter = () => { window.clearTimeout(timer.current); setHover(true); };
  const leave = () => { timer.current = window.setTimeout(() => setHover(false), 400); };

  // logical side (start/end) -> physical side for the current writing direction
  const side: "left" | "right" | "bottom" = prefs.list === "bottom" ? "bottom" : (prefs.list === "start") === (dir === "ltr") ? "left" : "right";
  const ctrlSide = side === "left" ? "right" : side === "right" ? "left" : "right";
  const drawer = DRAWER[side];

  const posMap = useMemo(() => new Map((positions ?? []).map((p) => [p.deviceId, p])), [positions]);
  const all: Row[] = useMemo(() => (devices ?? []).map((d) => { const p = posMap.get(d.id), v = vehState(prefs, d, p); return { d, p, st: v.base, vs: v.vs, color: v.color }; }), [devices, posMap, prefs]);
  const chip: Record<string, string> = { moving: prefs.cMoving, stopped: prefs.cStopped };
  // a vehicle that stopped reporting counts as stopped, like it looks on the map
  const isMoving = (st: string) => st === "moving";
  const rows = useMemo(() => all.filter((r) => (filter === "all" || (filter === "moving") === isMoving(r.st)) && (r.d.name.toLowerCase().includes(q.toLowerCase()) || r.d.uniqueId.includes(q) || (r.d.phone ?? "").includes(q))), [all, q, filter]);
  const counts = useMemo(() => {
    const c = { all: all.length, moving: 0, stopped: 0 };
    all.forEach((r) => { if (isMoving(r.st)) c.moving++; else c.stopped++; });
    return c;
  }, [all]);
  const selRow = sel ? all.find((r) => r.d.id === sel) : null;
  const withPos = useMemo(() => all.filter((r) => r.p).map((r) => r.d.id), [all]);
  const PinI = fixed ? PinOff : Pin;

  const legendPlace = side === "left" ? "md:left-8" : side === "right" ? "md:right-8" : "md:left-3";

  const listContent = (
    <>
      <div className="p-3 space-y-2.5 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="live-dot" /><span className="text-xs text-muted flex-1">{t("live.updating")}</span>
          <button onClick={() => set({ listMode: fixed ? "hover" : "fixed" })} className={`btn !p-1.5 ${fixed ? "btn-on" : ""}`} aria-label={t("live.pin")} title={t("live.pin")}><PinI size={14} /></button>
        </div>
        <div className="relative">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input !ps-9" placeholder={t("live.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`btn whitespace-nowrap ${filter === f ? "btn-on" : ""}`}>
              {f !== "all" && <span className="size-2 rounded-full" style={{ background: chip[f] }} />}
              {t(`state.${f}` as const)} <span className="text-muted">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {!devices && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        {rows.map(({ d, p, st, vs, color: c }) => {
          const I = iconOf(d.category);
          return (
            <button key={d.id} onClick={() => { setSel(d.id); if (window.matchMedia("(max-width: 767px)").matches) setHover(false); }}
              className={`w-full text-start p-3 rounded-xl border transition ${sel === d.id ? "border-accent/60 bg-accent/10" : "border-transparent hover:bg-fg/5"}`}>
              <div className="flex items-center gap-2.5">
                <span className="size-9 rounded-xl grid place-items-center shrink-0" style={{ background: c + "26", color: c }}><I size={19} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate flex-1">{d.name}</span>
                    <span className="text-sm tabular-nums" style={{ color: c }}>{fmtNum(st === "nofix" ? 0 : knToKmh(p?.speed))} <span className="text-[10px] text-muted">{t("unit.kmh")}</span></span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5 truncate flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full shrink-0" style={{ background: c }} />
                    {t(sk(vs))} · {p ? (fixAt(p) ? timeAgo(fixAt(p)) : t("live.timeunknown")) : timeAgo(d.lastUpdate)}
                  </div>
                  <div className="text-[11px] text-fg/75 tabular-nums truncate" dir="ltr">{d.uniqueId}{d.phone ? ` · ${d.phone}` : ""}</div>
                </div>
              </div>
            </button>
          );
        })}
        {devices && !rows.length && <p className="text-center text-muted text-sm py-8">{t("live.nomatch")}</p>}
      </div>
    </>
  );

  return (
    <div className={`h-full flex flex-col ${fixed ? DOCK_FLOW[prefs.list] : ""}`}>
      <div className="relative flex-1 min-h-0 min-w-0">
        <div className="absolute inset-0 z-0">
          <MapView devices={devices} positions={positions} geofences={geofences} selectedId={sel} onSelect={setSel} onDeselect={() => setSel(null)} follow={!!sel} controlsSide={ctrlSide} onMe={setMe} simCut={simCut}
            popup={selRow && <Detail key={selRow.d.id} row={selRow} still={still.get(selRow.d.id)} onClose={() => setSel(null)} onInfo={() => setInfoId(selRow.d.id)} />} />
        </div>

        {/* compact mode: the list is docked to an edge and slides out when the pointer comes close.
            Phones never show it on the map: the vehicle list is its own tab there, as in the iTrack app */}
        {!fixed && (
          <div onPointerEnter={(e) => e.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches && enter()} onPointerLeave={(e) => e.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches && leave()}
            className={`max-md:hidden absolute z-[700] flex flex-col bg-solid/92 backdrop-blur-md border-line transition-transform duration-300 ease-out
              bottom-0 inset-x-0 h-[48%] border-t max-md:rounded-t-3xl max-md:overflow-hidden ${drawer.box}
              ${open ? "translate-x-0 translate-y-0" : `translate-y-[calc(100%-34px)] ${drawer.hide}`}`}
            style={{ boxShadow: open ? "0 10px 40px var(--shadow)" : undefined }}>
            <button onClick={() => setHover((v) => !v)} aria-label={t("live.showpanel")}
              className={`absolute z-10 top-0 inset-x-0 h-[34px] grid place-items-center text-muted hover:text-accent ${drawer.handle}`}>
              {side === "bottom" ? <><GripHorizontal size={18} className="max-md:hidden" /><i className="md:hidden block h-1.5 w-10 rounded-full bg-fg/25" /></> : (
                <>
                  <i className="md:hidden block h-1.5 w-10 rounded-full bg-fg/25" />
                  <span className="hidden md:grid place-items-center gap-1"><List size={13} /><i className="block w-0.5 h-10 rounded bg-current opacity-50" /></span>
                </>
              )}
            </button>
            <div className={`flex-1 min-h-0 flex flex-col pt-[34px] ${drawer.pad}`}>{listContent}</div>
          </div>
        )}

        {/* previous / next vehicle, on the right edge (phone and desktop) */}
        {withPos.length > 0 && (
          <div className="absolute z-[640] right-2 top-[56%] md:right-3 md:top-1/2 md:-translate-y-1/2 flex flex-col rounded-lg bg-white/95 text-slate-500 overflow-hidden" style={{ boxShadow: "0 2px 10px rgba(0,0,0,.35)" }}>
            <button onClick={() => setSel(neighbour(withPos, sel, -1))} className="grid place-items-center w-11 h-11 md:w-9 md:h-9 active:bg-slate-200 md:hover:bg-slate-100" title={t("veh.prev")} aria-label={t("veh.prev")}><ChevronUp size={26} /></button>
            <i className="h-px bg-slate-300 mx-1.5" />
            <button onClick={() => setSel(neighbour(withPos, sel, 1))} className="grid place-items-center w-11 h-11 md:w-9 md:h-9 active:bg-slate-200 md:hover:bg-slate-100" title={t("veh.next")} aria-label={t("veh.next")}><ChevronDown size={26} /></button>
          </div>
        )}

        {/* phones: the iTrack-style bar for the selected vehicle: address and distance, then its actions */}
        {selRow && <SelBar row={selRow} me={me} onClose={() => setSel(null)} onEdit={() => setEditDev(selRow.d)} onInfo={() => setInfoId(selRow.d.id)} />}
        {infoId != null && (() => { const r = all.find((x) => x.d.id === infoId); return r && <VehicleInfo device={r.d} position={r.p} onClose={() => setInfoId(null)} onEdit={() => { setEditDev(r.d); setInfoId(null); }} />; })()}
        {editDev && <DeviceEditor device={editDev} onClose={() => setEditDev(null)} />}

        <div className={`glass absolute z-[500] bottom-3 hidden md:flex gap-3 px-3 py-2 text-xs ${legendPlace} ${side === "bottom" && !fixed ? "md:bottom-[calc(34px+0.75rem)]" : ""}`}>
          {(["moving", "stopped"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: chip[s] }} />{t(`state.${s}` as const)} {counts[s]}</span>
          ))}
        </div>
      </div>

      {/* fixed mode: the list is a normal docked panel */}
      {fixed && (
        <div className={`max-md:hidden order-last shrink-0 h-[42%] flex flex-col bg-solid/70 backdrop-blur border-t border-line ${DOCK[prefs.list]}`}>{listContent}</div>
      )}
    </div>
  );
}

const TILE = "grid place-items-center size-11 rounded-xl bg-white";

/** Phone bar under the map for the selected vehicle, laid out like the iTrack app. */
function SelBar({ row: { d, p }, me, onClose, onEdit, onInfo }: { row: Row; me: { lat: number; lng: number } | null; onClose: () => void; onEdit: () => void; onInfo: () => void }) {
  const { t } = useI18n();
  // the ~110 m grid point nearest the vehicle, as on the card: one lookup per ~110 m, shared with the card through the cache
  const g3 = (v?: number) => (v == null ? undefined : Math.round(v * 1000) / 1000);
  const address = useAddress(g3(p?.latitude), g3(p?.longitude), p?.address);
  const km = me && p ? distanceKm(me, { lat: p.latitude, lng: p.longitude }) : null;
  const item = "flex-1 min-w-0 flex flex-col items-center gap-1.5 text-[11px] text-white";
  return (
    <div className="md:hidden absolute z-[720] inset-x-0 bottom-0 rounded-t-xl px-2 pt-2 pb-2.5 text-white" style={{ background: "rgba(58,58,60,.94)", boxShadow: "0 -4px 18px rgba(0,0,0,.35)" }}>
      <div className="flex items-start gap-2 px-1 pb-2 text-xs text-white/85">
        <div className="min-w-0 flex-1">
          <div className="truncate">{address || (p ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}` : t("fleet.nopos"))}</div>
          {km != null && <div className="text-white/70 tabular-nums">{t("loc.distance")}: {fmtNum(km, km < 10 ? 1 : 0)} {t("unit.km")} · {t("loc.straight")}</div>}
        </div>
        <button onClick={onClose} className="p-1 -m-1 text-white/70" aria-label={t("common.close")}><X size={18} /></button>
      </div>
      <div className="flex gap-1">
        <button onClick={onInfo} className={item}><span className={TILE} style={{ color: "#0ea5e9" }}><IdCard size={24} /></span>{t("info.open")}</button>
        <Link href={`/playback/${d.id}`} className={item}><span className={TILE} style={{ color: "#2563eb" }}><Route size={24} /></span>{t("pb.open")}</Link>
        <Link href={`/devices/${d.id}`} className={item}><span className={TILE} style={{ color: "#f97316" }}><History size={24} /></span>{t("veh.details")}</Link>
        {p && <a href={mapsDirections(p.latitude, p.longitude)} target="_blank" rel="noopener" className={item}><span className={TILE} style={{ color: "#7c3aed" }}><Navigation size={24} /></span>{t("fleet.navigate")}</a>}
        <button onClick={onEdit} className={item}><span className={TILE} style={{ color: "#64748b" }}><Palette size={24} /></span>{t("edit.customize")}</button>
      </div>
    </div>
  );
}

/** Re-renders every `ms` so the card's durations keep counting (local only, no requests). */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}

const Chip = ({ icon: Ic, label, value }: { icon: typeof Gauge; label: string; value: string }) => (
  <div className="bg-white/10 rounded-lg px-2 py-1.5">
    <div className="flex items-center gap-1 text-[10px] text-white/60"><Ic size={11} />{label}</div>
    <div className="text-xs font-medium tabular-nums">{value}</div>
  </div>
);

function Detail({ row: { d, p, st, vs }, still, onClose, onInfo }: { row: Row; still?: { t: number; atLeast: boolean }; onClose: () => void; onInfo: () => void }) {
  const { t } = useI18n();
  const [edit, setEdit] = useState(false);
  const [more, setMore] = usePersisted("live.detail.more2", true);
  const a = p?.attributes ?? {};
  // looked up only while the details are open, and for the ~110 m grid point nearest the vehicle: a moving vehicle then costs one
  // lookup per ~110 m instead of one per position update
  const g3 = (v?: number) => (v == null ? undefined : Math.round(v * 1000) / 1000);
  const address = useAddress(more ? g3(p?.latitude) : undefined, g3(p?.longitude), p?.address);
  const ign = typeof a.ignition === "boolean" ? a.ignition : undefined;
  // a motion duration only when the status shown and the tracker's own motion flag agree; a tracker with no usable GPS fix is parked
  // by definition (its motion flag is a leftover of its last real reading)
  const moving = st === "moving" ? true : st === "stopped" ? false : undefined;
  const motion = moving !== undefined && (a.motion === moving || (moving === false && noFix(p))) ? moving : undefined;
  const since = useStateSince(d.id, ign, motion, !!p && st !== "offline" && st !== "unknown");
  const now = useNow(1000);
  const gone = !!p && (st === "offline" || st === "unknown") && !!d.lastUpdate && Number.isFinite(Date.parse(d.lastUpdate));
  // the stay inside the 300 m circle: from the stored positions for a connected vehicle, handed in for a disconnected one
  const stay = useStay(d.id, p?.latitude, p?.longitude, !!p && !gone);
  const stayed = gone ? still : stay ?? undefined;
  // battery / signal: the newest position, else the last status message (with its age when it is not fresh)
  const pw = powerOf(d.id);
  const bat = a.batteryLevel ?? pw?.batteryLevel, rssi = a.rssi ?? pw?.rssi, charging = a.charge ?? pw?.charge;
  const old = (v: unknown, from?: number) => (v == null && from != null && now - from > 30 * 60000 ? ` · ${fmtDuration(now - from)}` : "");
  const skew = p ? (Date.parse(p.fixTime) - Date.parse(p.serverTime)) / 36e5 : 0;
  const fix = p ? fixAt(p) : null;
  const fixText = fix ? timeDate(Date.parse(fix)) : null; // null too when the tracker sent an unreadable time
  const kmh = st === "nofix" ? 0 : knToKmh(p?.speed);
  const dur = (ms: number | null) => (ms == null ? null : <span className="tabular-nums" title={t("card.since")}>({fmtDurationFull(now - ms)})</span>);
  return (
    <div className="vcard">
      <button onClick={() => setMore((v) => !v)} className="vcard-toggle" aria-label={t("card.more")} aria-expanded={more}><ChevronLeft size={22} className={more ? "-rotate-90" : ""} /></button>
      <div className="vcard-body">
        <div>{d.name}{d.model ? `(${d.model})` : ""}</div>
        <div className="text-xs text-white/85 tabular-nums" dir="ltr">IMEI {d.uniqueId}{d.phone ? ` · SIM ${d.phone}` : ""}</div>
        {p ? (
          <>
            {fixText ? <div>{t("tbl.time")}: <span className="tabular-nums" dir="ltr">{fixText}</span></div>
              : <div className="text-xs text-amber-300">{t("live.timeunknown")}</div>}
            {/* the tracker still reports, but without a new GPS fix: say so instead of passing the old location off as current */}
            {fix && fixText && Date.parse(p.serverTime) - Date.parse(fix) > 2 * 60000 && <div className="text-xs text-amber-300">{t("live.lastmsg")}: {timeAgo(p.serverTime)} · {t("live.nonewfix")}</div>}
            <div>{t("stat.state")}: {st === "moving" ? t("card.moving") : st === "stopped" ? t("card.stopped") : t(sk(vs))}{dur(since.motion)}{gone && dur(Date.parse(d.lastUpdate!))}</div>
            {/* disconnected: the stay at its last known place, from its stored positions (no stop event exists when it went silent first) */}
            {stayed && now - stayed.t >= 60000 && (
              <div>{t("card.still")}: <span className="tabular-nums">{stayed.atLeast ? `${t("card.over")} ` : ""}{fmtDurationFull(now - stayed.t)}</span>{" "}
                <span className="text-white/70 text-xs" dir="ltr">({timeDate(stayed.t)})</span></div>
            )}
            <div>{t("stat.speed")}: <span className="tabular-nums">{fmtNum(kmh)} {t("unit.kmh")}</span></div>
            {ign !== undefined && <div>{t("tbl.engine")}: {t(ign ? "card.engon" : "card.engoff")}{dur(since.ign)}</div>}
            {typeof a.door === "boolean" && <div>{t("stat.door")}: {t(a.door ? "stat.open" : "stat.closed")}</div>}
            {more && (
              <div className="space-y-1.5 pt-2 mt-1.5 border-t border-white/15">
                <div className="text-xs text-white/80 flex gap-1.5"><MapPin size={13} className="shrink-0 mt-0.5" />{address || `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <Chip icon={Battery} label={t("stat.battery")} value={bat != null ? `${fmtNum(bat)}%${charging ? " ⚡" : ""}${old(a.batteryLevel, pw?.at)}` : "—"} />
                  <Chip icon={Signal} label={t("stat.signal")} value={rssi != null ? `${rssi}${old(a.rssi, pw?.at)}` : "—"} />
                  <Chip icon={Satellite} label={t("stat.sats")} value={a.sat != null ? String(a.sat) : p.valid ? "OK" : t("stat.nofix")} />
                  {a.fuel1 != null && <Chip icon={Fuel} label={t("stat.fuel")} value={String(a.fuel1)} />}
                  <Chip icon={MapPin} label={t("stat.odometer")} value={a.totalDistance ? `${fmtNum(mToKm(a.totalDistance))} ${t("unit.km")}` : "—"} />
                </div>
                {Math.abs(skew) > 1 && (
                  <p className="text-[11px] text-amber-300 flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{t("live.clockskew", { h: `${skew > 0 ? "+" : ""}${Math.round(skew)}` })}</p>
                )}
              </div>
            )}
          </>
        ) : <div className="text-white/70">{t("live.nopos")}</div>}
        {more && (
          <div className="flex gap-2 pt-2">
            <button className="vcard-btn vdup" onClick={onInfo} title={t("info.open")} aria-label={t("info.open")}><IdCard size={14} /></button>
            <Link href={`/playback/${d.id}`} className="vcard-btn vdup" title={t("pb.open")} aria-label={t("pb.open")}><Route size={14} /></Link>
            <Link href={`/devices/${d.id}`} className="vcard-btn vdup flex-1 justify-center"><History size={14} />{t("live.history")}</Link>
            {p && <a href={mapsDirections(p.latitude, p.longitude)} target="_blank" rel="noopener" className="vcard-btn vdup" title={t("fleet.navigate")} aria-label={t("fleet.navigate")}><Navigation size={14} /></a>}
            <button className="vcard-btn" onClick={() => setEdit(true)} title={t("edit.title")}><Palette size={14} /></button>
            <button className="vcard-btn vdup" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}><X size={14} /></button>
          </div>
        )}
      </div>
      {edit && <DeviceEditor device={d} onClose={() => setEdit(false)} />}
    </div>
  );
}
