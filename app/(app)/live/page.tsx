"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { usePrefs } from "@/lib/prefs";
import {
  Search, Battery, Gauge, KeyRound, Satellite, History, X, MapPin, Signal, ChevronsLeft, GripHorizontal, Pin, PinOff,
  Palette, DoorOpen, Fuel, ChevronDown, AlertTriangle, List, Clock,
} from "lucide-react";
import { useAddress, useDevices, useGeofences, usePositions, useReport } from "@/lib/api";
import { fixAt, fmtDuration, fmtNum, knToKmh, mToKm, timeAgo } from "@/lib/format";
import { iconOf } from "@/lib/vehicle";
import { stamp as cairoStamp } from "@/lib/tz";
import { vehState } from "@/lib/vstate";
import type { VisualState } from "@/lib/format";
import { usePersisted } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Device, Position, Stop } from "@/lib/types";
import { Skeleton } from "@/components/ui";
import type { Key } from "@/lib/dict";
import DeviceEditor from "@/components/DeviceEditor";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });
const sk = (st: string): Key => (st === "idle" ? "state.idle" : st === "over" ? "state.over" : st === "moving" ? "state.moving" : st === "stopped" ? "state.stopped" : st === "nofix" ? "state.nofix" : "state.offline");
const FILTERS = ["all", "moving", "stopped", "offline"] as const;
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
  const chip: Record<string, string> = { moving: prefs.cMoving, stopped: prefs.cStopped, offline: prefs.cOffline };
  const isOff = (st: string) => st === "offline" || st === "unknown" || st === "nofix";
  const rows = useMemo(() => all.filter((r) => (filter === "all" || (filter === "offline" ? isOff(r.st) : r.st === filter)) && r.d.name.toLowerCase().includes(q.toLowerCase())), [all, q, filter]);
  const counts = useMemo(() => {
    const c = { all: all.length, moving: 0, stopped: 0, offline: 0 };
    all.forEach((r) => { if (r.st === "moving") c.moving++; else if (r.st === "stopped") c.stopped++; else c.offline++; });
    return c;
  }, [all]);
  const selRow = sel ? all.find((r) => r.d.id === sel) : null;
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
          <MapView devices={devices} positions={positions} geofences={geofences} selectedId={sel} onSelect={setSel} onDeselect={() => setSel(null)} follow={!!sel} controlsSide={ctrlSide}
            popup={selRow && <Detail key={selRow.d.id} row={selRow} onClose={() => setSel(null)} />} />
        </div>

        {/* compact mode: the list is docked to an edge and slides out when the pointer comes close */}
        {!fixed && (
          <div onPointerEnter={(e) => e.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches && enter()} onPointerLeave={(e) => e.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches && leave()}
            className={`absolute z-[700] flex flex-col bg-solid/92 backdrop-blur-md border-line transition-transform duration-300 ease-out
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

        <div className={`glass absolute z-[500] bottom-3 hidden md:flex gap-3 px-3 py-2 text-xs ${legendPlace} ${side === "bottom" && !fixed ? "md:bottom-[calc(34px+0.75rem)]" : ""}`}>
          {(["moving", "stopped", "offline"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: chip[s] }} />{t(`state.${s}` as const)} {counts[s]}</span>
          ))}
        </div>
      </div>

      {/* fixed mode: the list is a normal docked panel */}
      {fixed && (
        <div className={`order-last shrink-0 h-[42%] flex flex-col bg-solid/70 backdrop-blur border-t border-line ${DOCK[prefs.list]}`}>{listContent}</div>
      )}
    </div>
  );
}

/** 2026-10-18 21:48:09 in Egypt time — fixed numeric format, same in both languages. */
const stamp = (iso: string) => cairoStamp(Date.parse(iso));

function Detail({ row: { d, p, st, vs, color: c }, onClose }: { row: Row; onClose: () => void }) {
  const { t } = useI18n();
  const [edit, setEdit] = useState(false);
  const [more, setMore] = usePersisted("live.detail.more", false);
  const a = p?.attributes ?? {};
  const address = useAddress(p?.latitude, p?.longitude, p?.address);
  // how long it has been in this state: the open-ended trip / stop in Traccar's reports (last ~2 days, refreshed each minute)
  const win = useMemo(() => { const h = 36e5, to = Math.ceil(Date.now() / h) * h + h; return { from: new Date(to - 50 * h).toISOString(), to: new Date(to).toISOString() }; }, []);
  const kind = st === "moving" ? "trips" : st === "stopped" ? "stops" : null;
  const { data: segs } = useReport<{ startTime: string; endTime: string }[]>(kind ?? "stops", kind ? win : null, d.id, "", { refreshInterval: 60000 });
  const last = segs?.length ? segs.reduce((m, x) => (Date.parse(x.endTime) > Date.parse(m.endTime) ? x : m)) : null;
  const since = last && Date.now() - Date.parse(last.endTime) < 5 * 60000 ? Date.parse(last.startTime) : null;
  const skew = p ? (Date.parse(p.fixTime) - Date.parse(p.serverTime)) / 36e5 : 0;
  const fix = p ? fixAt(p) : null;
  const I = iconOf(d.category);
  const kmh = st === "nofix" ? 0 : knToKmh(p?.speed);
  const ign = a.ignition == null ? null : a.ignition ? t("wait.on") : t("wait.off");
  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="flex gap-1.5 text-[13px] leading-6"><span className="text-muted shrink-0">{k}:</span><span className="min-w-0 flex-1 break-words">{children}</span></div>
  );
  const Chip = ({ icon: Ic, label, value }: { icon: typeof Gauge; label: string; value: string }) => (
    <div className="bg-fg/[.06] rounded-lg px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] text-muted"><Ic size={11} />{label}</div>
      <div className="text-xs font-medium tabular-nums">{value}</div>
    </div>
  );
  return (
    <div className="bg-solid/95 backdrop-blur-md border border-line rounded-2xl p-3.5 space-y-1.5 max-h-[min(60vh,var(--ph,60vh))] overflow-y-auto" style={{ boxShadow: "0 12px 40px var(--shadow)" }}>
      <div className="flex items-center gap-2 pb-1">
        <span className="size-8 rounded-lg grid place-items-center shrink-0" style={{ background: c + "26", color: c }}><I size={17} /></span>
        <h3 className="font-semibold truncate flex-1">{d.name}{d.model ? <span className="text-muted font-normal"> ({d.model})</span> : null}</h3>
        <button onClick={() => setMore((v) => !v)} className="btn !p-2" aria-label="toggle"><ChevronDown size={14} className={more ? "rotate-180" : ""} /></button>
        <button onClick={onClose} className="btn !p-2" aria-label={t("common.close")}><X size={14} /></button>
      </div>
      {p ? (
        <>
          <Row k={t("tbl.time")}>{fix ? <><span className="tabular-nums" dir="ltr">{stamp(fix)}</span> <span className="text-muted text-xs">· {timeAgo(fix)}</span></> : <span className="text-amber-400 text-xs">{t("live.timeunknown")}</span>}</Row>
          {/* the tracker still reports, but without a new GPS fix: say so instead of passing the old location off as current */}
          {(!fix || Date.parse(p.serverTime) - Date.parse(fix) > 2 * 60000) && (
            <div className="flex gap-1.5 text-[13px] leading-6"><span className="text-muted shrink-0">{t("live.lastmsg")}:</span><span className="min-w-0 flex-1 break-words text-xs">{timeAgo(p.serverTime)} · <span className="text-amber-400">{t("live.nonewfix")}</span></span></div>
          )}
          <Row k={t("stat.state")}>
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: c }}><span className="size-2 rounded-full" style={{ background: c }} />{t(sk(vs))}</span>
            {st === "moving" && <span className="tabular-nums">، {fmtNum(kmh)} {t("unit.kmh")}</span>}
          </Row>
          <Row k={t("tbl.engine")}>
            {ign ?? "—"}{since ? <span className="text-muted tabular-nums"> ({t(st === "moving" ? "wait.driving" : "wait.nowhint")} {fmtDuration(Date.now() - since)})</span> : null}
          </Row>
          <Row k={t("tbl.location")}><span className="text-xs">{address || `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`}</span></Row>
          {more && (
            <div className="grid grid-cols-3 gap-1.5 pt-1.5">
              <Chip icon={Battery} label={t("stat.battery")} value={a.batteryLevel != null ? `${fmtNum(a.batteryLevel)}%` : "—"} />
              <Chip icon={Signal} label={t("stat.signal")} value={a.rssi != null ? String(a.rssi) : "—"} />
              <Chip icon={Satellite} label={t("stat.sats")} value={a.sat != null ? String(a.sat) : p.valid ? "OK" : t("stat.nofix")} />
              {a.door != null && <Chip icon={DoorOpen} label={t("stat.door")} value={a.door ? t("stat.open") : t("stat.closed")} />}
              {a.fuel1 != null && <Chip icon={Fuel} label={t("stat.fuel")} value={String(a.fuel1)} />}
              <Chip icon={MapPin} label={t("stat.odometer")} value={a.totalDistance ? `${fmtNum(mToKm(a.totalDistance))} ${t("unit.km")}` : "—"} />
            </div>
          )}
          {Math.abs(skew) > 1 && (
            <p className="text-[11px] text-amber-400 flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{t("live.clockskew", { h: `${skew > 0 ? "+" : ""}${Math.round(skew)}` })}</p>
          )}
        </>
      ) : <p className="text-sm text-muted">{t("live.nopos")}</p>}
      <div className="flex gap-2 pt-1.5">
        <Link href={`/devices/${d.id}`} className="btn btn-on flex-1 justify-center !py-2.5"><History size={14} />{t("live.history")}</Link>
        <button className="btn" onClick={() => setEdit(true)} title={t("edit.title")}><Palette size={14} /></button>
      </div>
      {edit && <DeviceEditor device={d} onClose={() => setEdit(false)} />}
    </div>
  );
}
