"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, ParkingCircle, Pause, Play, SlidersHorizontal, X } from "lucide-react";
import { useDevices } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import { useI18n } from "@/lib/i18n";
import { fmtDuration, fmtNum } from "@/lib/format";
import { stamp } from "@/lib/tz";
import { distanceKm } from "@/lib/fleet";
import {
  MAX_RANGE_MS, clean, findStops, fromLocalInput, fromWire, indexAt, presetRange, timeAt, timeline, toLocalInput, type Preset, type Pt, type Wire,
} from "@/lib/playback";
import type { Position } from "@/lib/types";
import type { Key } from "@/lib/dict";
import { Skeleton } from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });

const SPEEDS = [1, 2, 4, 6, 8, 16, 32];
const PARK_MIN = [1, 3, 5, 10, 15, 30, 60];
const PRESETS: [Preset, Key][] = [["today", "pb.today"], ["yesterday", "pb.yesterday"], ["thisweek", "pb.thisweek"], ["lastweek", "pb.lastweek"], ["thismonth", "pb.thismonth"], ["lastmonth", "pb.lastmonth"]];
/** route seconds played per real second at ×1 */
const BASE_RATE = 10;

type Loaded = { id: number; from: number; to: number; pts: Pt[]; lastSeen: number | null; loadedAt: number };

/** iTrack-style playback of one vehicle's route between two times (Cairo), to the minute. */
export default function Playback({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const router = useRouter();
  const sp = useSearchParams();
  const id = Number(use(params).id);
  const { data: devices } = useDevices();
  const dev = devices?.find((d) => d.id === id);

  // the window being edited (inputs) and the one loaded
  const [initial] = useState(() => {
    const f = Number(sp.get("from")), to = Number(sp.get("to"));
    return Number.isFinite(f) && Number.isFinite(to) && f > 0 && to > f ? { from: f, to } : presetRange("today", Date.now());
  });
  const [fromIn, setFromIn] = useState(() => toLocalInput(initial.from));
  const [toIn, setToIn] = useState(() => toLocalInput(initial.to));
  const [opts, setOpts] = useState(false);
  const [mult, setMult] = useState(6);
  const [parkMin, setParkMin] = useState(3);
  const [colored, setColored] = useState(false);
  const [noDrift, setNoDrift] = useState(true);
  const [limit, setLimit] = useState(prefs.limit || 80);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [sec, setSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [list, setList] = useState(false);
  const req = useRef<AbortController | null>(null);

  async function load(from: number, to: number) {
    if (!Number.isFinite(from) || !Number.isFinite(to)) { setErr(t("pb.badtime")); return; }
    if (to <= from) { setErr(t("pb.order")); return; }
    if (to - from > MAX_RANGE_MS) { setErr(t("pb.max")); return; }
    setErr(""); setBusy(true); setPlaying(false);
    req.current?.abort();
    const ac = new AbortController(); req.current = ac;
    try {
      const r = await fetch(`/api/playback?deviceId=${id}&from=${from}&to=${to}`, { signal: ac.signal });
      if (!r.ok) throw new Error(String(r.status));
      const j: { pts: Wire[]; lastSeen: number | null } = await r.json();
      setData({ id, from, to, pts: j.pts.map(fromWire), lastSeen: j.lastSeen, loadedAt: Date.now() });
      setSec(0);
      router.replace(`/playback/${id}?from=${from}&to=${to}`, { scroll: false });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr(t("pb.fail"));
    } finally { if (req.current === ac) setBusy(false); }
  }
  // first load: the window from the link (or today)
  useEffect(() => {
    void load(initial.from, initial.to); // eslint-disable-line react-hooks/set-state-in-effect -- fetching on open is the point
    return () => req.current?.abort();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pts = useMemo(() => (data ? clean(data.pts, noDrift) : []), [data, noDrift]);
  const tl = useMemo(() => timeline(pts), [pts]);
  const total = tl.at(-1) ?? 0;
  // a stop still going on at the end lasts until the tracker was last heard from (or the end of the window, or when it was loaded)
  const end = data ? Math.min(data.to, data.loadedAt, data.lastSeen ?? data.to) : 0;
  const stops = useMemo(() => findStops(pts, parkMin * 60000, end), [pts, parkMin, end]);
  const km = useMemo(() => pts.reduce((s, p, k) => (k ? s + distanceKm(pts[k - 1], p) : 0), 0), [pts]);
  const route = useMemo(() => pts.map((p, k) => ({
    id: k, deviceId: id, latitude: p.lat, longitude: p.lng, speed: p.kmh / 1.852, course: p.course, fixTime: new Date(p.t).toISOString(),
  }) as unknown as Position), [pts, id]);
  const stopMarks = useMemo(() => stops.map((s, k) => ({
    lat: s.lat, lng: s.lng,
    label: `P${k + 1} · ${stamp(s.s).slice(5, 16)} → ${s.open ? t("pb.still") : stamp(s.e).slice(5, 16)} · ${fmtDuration(s.e - s.s)}`,
  })), [stops, t]);

  // play: the clock runs in route seconds; long stops pass quickly (lib/playback timeline)
  useEffect(() => {
    if (!playing || !total) return;
    let last = performance.now(), raf = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setSec((s) => { const n = s + dt * mult * BASE_RATE; if (n >= total) { setPlaying(false); return total; } return n; });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, mult]);

  const idx = indexAt(tl, sec);
  const at = pts.length ? timeAt(pts, idx) : NaN;
  const cur = pts[Math.min(Math.floor(idx), pts.length - 1)];
  // runs on a click, not while rendering
  const go = (k: Preset) => { const r = presetRange(k, Date.now()); setFromIn(toLocalInput(r.from)); setToIn(toLocalInput(r.to)); }; // eslint-disable-line react-hooks/purity
  const jumpTo = (i: number) => { setPlaying(false); setSec(tl[i] ?? 0); };

  return (
    <div className="h-full flex flex-col">
      {/* the iTrack bar: vehicle, from, to, options, play */}
      <div className="shrink-0 border-b border-line bg-solid px-3 py-2 flex flex-wrap items-center gap-2 text-sm relative z-[900]">
        <Link href="/devices" className="btn !p-2 rtl:rotate-180" aria-label={t("common.back")}><ArrowLeft size={16} /></Link>
        <select className="input !w-auto !py-1.5" value={id} onChange={(e) => router.push(`/playback/${e.target.value}?from=${fromLocalInput(fromIn)}&to=${fromLocalInput(toIn)}`)} aria-label={t("pb.vehicle")}>
          {(devices ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}{d.model ? ` (${d.model})` : ""}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted">{t("pb.from")}
          <input type="datetime-local" className="input !w-auto !py-1.5" dir="ltr" value={fromIn} onChange={(e) => setFromIn(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">{t("pb.to")}
          <input type="datetime-local" className="input !w-auto !py-1.5" dir="ltr" value={toIn} onChange={(e) => setToIn(e.target.value)} />
        </label>
        <button className={`btn ${opts ? "btn-on" : ""}`} onClick={() => setOpts((v) => !v)}><SlidersHorizontal size={14} />{t("pb.options")}</button>
        <button className="btn btn-on" disabled={busy} onClick={() => load(fromLocalInput(fromIn), fromLocalInput(toIn))}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{t("pb.show")}
        </button>
        <span className="hidden md:inline text-[11px] text-muted">{t("pb.maxhint")}</span>
        {err && <span className="text-xs text-rose-500">{err}</span>}

        {opts && (
          <div className="absolute top-full mt-1 start-3 glass !bg-solid p-4 space-y-3 text-sm w-[min(26rem,calc(100vw-1.5rem))] shadow-xl" role="dialog">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(([k, l]) => <button key={k} className="btn !py-1 text-xs" onClick={() => go(k)}>{t(l)}</button>)}
            </div>
            <label className="flex items-center justify-between gap-3">{t("pb.speed")}
              <select className="input !w-auto !py-1" dir="ltr" value={mult} onChange={(e) => setMult(+e.target.value)}>{SPEEDS.map((m) => <option key={m} value={m}>×{m}</option>)}</select>
            </label>
            <label className="flex items-center justify-between gap-3">{t("pb.parking")}
              <select className="input !w-auto !py-1" value={parkMin} onChange={(e) => setParkMin(+e.target.value)}>{PARK_MIN.map((m) => <option key={m} value={m}>&gt;{m} {t("pb.mins")}</option>)}</select>
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={colored} onChange={(e) => setColored(e.target.checked)} />{t("pb.colored")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={noDrift} onChange={(e) => setNoDrift(e.target.checked)} />{t("pb.drift")}</label>
            <label className="flex items-center justify-between gap-3">{t("pb.limit")}
              <span className="flex items-center gap-1.5"><input type="number" min={10} max={200} className="input !w-20 !py-1" dir="ltr" value={limit} onChange={(e) => setLimit(Math.max(10, Math.min(200, +e.target.value || 80)))} />{t("unit.kmh")}</span>
            </label>
            <p className="text-[11px] text-muted">{t("pb.optnote")}</p>
          </div>
        )}
      </div>

      <div className="relative flex-1 min-h-0 flex">
        <div className="relative flex-1 min-w-0">
          <MapView route={route} routeDevice={dev} routeMode={colored ? "speed" : "plain"} routeLimit={limit} routeStops={stopMarks} cursor={idx} follow={playing} />
          {busy && <div className="absolute inset-0 grid place-items-center z-[600] pointer-events-none"><span className="glass px-4 py-2 text-sm flex items-center gap-2"><Loader2 size={15} className="animate-spin" />{t("pb.loading")}</span></div>}
          {!busy && data && !pts.length && <div className="absolute inset-0 grid place-items-center z-[600] pointer-events-none"><span className="glass px-4 py-2 text-sm text-muted">{t("pb.none")}</span></div>}
        </div>
        {list && (
          <aside className="absolute md:static inset-x-0 bottom-0 z-[700] max-h-[45%] md:max-h-none md:w-80 overflow-y-auto bg-solid border-t md:border-t-0 md:border-s border-line">
            <div className="sticky top-0 bg-solid flex items-center justify-between px-3 py-2 border-b border-line text-sm font-medium">
              {t("pb.stops")} ({stops.length})<button className="btn !p-1" onClick={() => setList(false)} aria-label={t("common.close")}><X size={14} /></button>
            </div>
            <ol className="divide-y divide-line text-sm">
              {stops.map((s, k) => (
                <li key={s.s}>
                  <button className="w-full text-start px-3 py-2 hover:bg-fg/5" onClick={() => jumpTo(s.i)}>
                    <span className="font-semibold text-blue-600">P{k + 1}</span>{" "}
                    <span className="tabular-nums" dir="ltr">{stamp(s.s).slice(5, 16)} → {s.open ? "…" : stamp(s.e).slice(11, 16)}</span>
                    <span className="block text-xs text-muted">{fmtDuration(s.e - s.s)}{s.open ? ` · ${t("pb.still")}` : ""}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

      {/* player: play / pause, the time line, and where and when the vehicle was at this moment */}
      <div className="shrink-0 border-t border-line bg-solid px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <button className="btn btn-on !p-2" disabled={!pts.length} onClick={() => { if (sec >= total) setSec(0); setPlaying((p) => !p); }} aria-label={playing ? t("pb.pause") : t("pb.play")}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <select className="input !w-auto !py-1 !text-xs" dir="ltr" value={mult} onChange={(e) => setMult(+e.target.value)} aria-label={t("pb.speed")}>{SPEEDS.map((m) => <option key={m} value={m}>×{m}</option>)}</select>
        <input type="range" dir="ltr" min={0} max={total || 0} step={0.5} value={Math.min(sec, total)} onChange={(e) => { setPlaying(false); setSec(+e.target.value); }} className="flex-1 min-w-40 accent-blue-600" disabled={!pts.length} aria-label={t("pb.timeline")} />
        <span className="tabular-nums font-semibold" dir="ltr">{Number.isFinite(at) ? stamp(at) : "—"}</span>
        <span className="tabular-nums">{cur ? `${fmtNum(cur.kmh)} ${t("unit.kmh")}` : ""}</span>
        {cur?.ign !== undefined && <span className="text-xs text-muted">{t(cur.ign ? "fleet.engon" : "fleet.engoff")}</span>}
        <span className="text-xs text-muted tabular-nums">{fmtNum(km, 1)} {t("unit.km")} · {pts.length} {t("pb.points")}</span>
        <button className={`btn !py-1 text-xs ${list ? "btn-on" : ""}`} onClick={() => setList((v) => !v)} disabled={!pts.length}><ParkingCircle size={14} />{t("pb.stops")} {stops.length}</button>
      </div>
    </div>
  );
}
