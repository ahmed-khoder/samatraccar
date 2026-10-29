"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate, SWRConfiguration } from "swr";
import type { Device, Position, Geofence, Group, TEvent } from "./types";
import { usePrefs } from "./prefs";
import { type AnalyticsResponse, addAgg, emptyAgg, type DayAgg } from "./agg";
import { mergePolled, mergePushed } from "./live-merge";
import { addDays, startOfDay } from "./tz";
import { SINCE_HOURS, SINCE_TTL, STATE_EVENTS, sinceStep, stateSince, type Since } from "./state-since";

export const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (r.status === 401) { window.location.href = "/login"; throw new Error("unauthorized"); }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

const api = (p: string) => `/api/t/${p}`;

export const useDevices = () => useSWR<Device[]>(api("devices"), fetcher, { refreshInterval: 10000 });
// Live positions: /api/live (Traccar latest, corrected for trackers stuck on a future-dated fix) polled every 3 s,
// plus Traccar's own push relayed by /api/stream so a new fix shows up as soon as the server has it.
const LIVE = "/api/live";
let liveNow: Position[] | undefined; // what the map shows, shared by both sources

let stream: EventSource | null = null, streamUsers = 0;
/** One EventSource per tab, however many components use live positions. */
function useLiveStream() {
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    if (streamUsers++ === 0) {
      stream = new EventSource("/api/stream");
      stream.addEventListener("positions", (e) => {
        try { mutate(LIVE, (cur?: Position[]) => (liveNow = mergePushed(cur, JSON.parse((e as MessageEvent).data))), { revalidate: false }); } catch {}
      });
    }
    return () => { if (--streamUsers === 0) { stream?.close(); stream = null; } };
  }, []);
}

export function usePositions() {
  useLiveStream();
  // a poll that started before a pushed update must not roll the map back to the older position
  return useSWR<Position[]>(LIVE, async (u: string) => (liveNow = mergePolled(liveNow, await fetcher(u))), { refreshInterval: 3000 });
}

export const useGeofences = () => useSWR<Geofence[]>(api("geofences"), fetcher);
export const useGroups = () => useSWR<Group[]>(api("groups"), fetcher);

/** Traccar reports need explicit device ids — an empty list returns nothing. `ids` omitted = all devices. */
export function useReport<T>(kind: string, range: { from: string; to: string } | null, ids?: number[] | number | null, extra = "", cfg?: SWRConfiguration) {
  const { data: devices } = useDevices();
  const list = ids == null ? (devices ?? []).map((d) => d.id) : Array.isArray(ids) ? ids : [ids];
  const key = range && list.length
    ? `${api("reports/" + kind)}?${list.map((i) => `deviceId=${i}`).join("&")}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}${extra}`
    : null;
  return useSWR<T>(key, fetcher, { revalidateOnFocus: false, ...cfg });
}

// Engine / motion "since" for the selected vehicle only. One small events query when its card opens (the last 48 h of its four
// transition event types), cached per vehicle and asked again only when its state changes (at most once a minute) or after
// 10 min with the card open: never on map moves, zoom or position updates, never for the whole fleet. A failed query is not retried
// by itself: the card shows no durations, and the next try waits at least a minute.
const sinceCache = new Map<number, Since>();
const sinceBusy = new Map<number, Promise<unknown>>();

async function loadSince(id: number, ign: boolean | undefined, motion: boolean | undefined, sig: string): Promise<Since> {
  const to = Date.now() + 60000;
  const r = await fetch(`${api("reports/events")}?deviceId=${id}&from=${new Date(to - SINCE_HOURS * 36e5).toISOString()}&to=${new Date(to).toISOString()}${STATE_EVENTS.map((t) => `&type=${t}`).join("")}`);
  if (!r.ok) throw new Error(String(r.status));
  const ev: TEvent[] = await r.json();
  return { sig, at: Date.now(), failed: false, ign: stateSince(ev, "ignition", ign), motion: stateSince(ev, "motion", motion) };
}

/** When the current engine / motion state began (ms), or null when it can't be vouched for. Pass undefined for a state that doesn't apply. */
export function useStateSince(id: number, ign: boolean | undefined, motion: boolean | undefined, enabled: boolean) {
  const sig = `${ign}|${motion}`;
  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let off = false, timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (off) return;
      const busy = sinceBusy.get(id), step = sinceStep(sinceCache.get(id), sig, Date.now(), !!busy);
      if (step.do === "keep") return;
      if (step.do === "join") { busy!.finally(check); return; } // one request per vehicle at a time
      if (step.do === "wait") { clearTimeout(timer); timer = setTimeout(check, step.ms); return; }
      const job = loadSince(id, ign, motion, sig)
        .catch((): Since => ({ sig, at: Date.now(), failed: true, ign: null, motion: null }))
        .then((r) => { sinceCache.set(id, r); sinceBusy.delete(id); if (!off) bump((n) => n + 1); });
      sinceBusy.set(id, job);
    };
    check();
    const every = setInterval(check, SINCE_TTL);
    return () => { off = true; clearTimeout(timer); clearInterval(every); };
  }, [id, sig, enabled]); // eslint-disable-line react-hooks/exhaustive-deps -- sig is ign + motion
  const c = sinceCache.get(id);
  return enabled && c && c.sig === sig ? { ign: c.ign, motion: c.motion } : { ign: null, motion: null };
}

export function deriveAnalytics(data?: AnalyticsResponse) {
  const perDevice = new Map<number, DayAgg>();
  const perDay = new Map<string, DayAgg>();
  let fleet = emptyAgg();
  Object.entries(data?.devices ?? {}).forEach(([id, v]) => {
    let sum = emptyAgg();
    Object.entries(v.days).forEach(([day, a]) => {
      sum = addAgg(sum, a);
      perDay.set(day, addAgg(perDay.get(day) ?? emptyAgg(), a));
    });
    perDevice.set(Number(id), sum);
    fleet = addAgg(fleet, sum);
  });
  return { perDevice, perDay: [...perDay].sort(([a], [b]) => a.localeCompare(b)), fleet };
}

export function useAnalytics(range: { from: string; to: string }, ids?: number[], limitArg?: number, refresh = 60000) {
  const { prefs } = usePrefs();
  const limit = limitArg ?? prefs.limit;
  const q = `/api/analytics?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&limit=${limit}${ids ? `&devices=${ids.join(",")}` : ""}`;
  const swr = useSWR<AnalyticsResponse>(q, fetcher, { revalidateOnFocus: false, refreshInterval: refresh, keepPreviousData: true });
  const derived = useMemo(() => deriveAnalytics(swr.data), [swr.data]);
  return { ...swr, ...derived };
}

const chunkCache = new Map<string, { at: number; data: AnalyticsResponse }>();
const MAX_DAYS = 92;

/**
 * Analytics for any window: split into <=7 day chunks (each cached server-side per day),
 * fetched 3 at a time so long ranges fill in progressively instead of one long request.
 */
export function useAnalyticsRange(range: { from: string; to: string } | null, ids?: number[], limitArg?: number, refresh = 0) {
  const { prefs } = usePrefs();
  const limit = limitArg ?? prefs.limit;
  const [data, setData] = useState<AnalyticsResponse | undefined>();
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const idsKey = ids?.join(",") ?? "";
  const run = useRef(0);

  useEffect(() => {
    if (!refresh) return;
    const t = setInterval(() => setTick((x) => x + 1), refresh);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!range) return;
    const id = ++run.current;
    // 7-day chunks starting at Cairo midnights (the server buckets by Cairo day as well)
    const end = new Date(range.to).getTime();
    const chunks: { from: string; to: string }[] = [];
    for (let d = startOfDay(new Date(range.from).getTime()), n = 0; d < end && n < MAX_DAYS; n += 7) {
      const e = addDays(d, 7);
      chunks.push({ from: new Date(d).toISOString(), to: new Date(Math.min(e, end)).toISOString() });
      d = e;
    }
    setProgress({ done: 0, total: chunks.length }); setError(false);
    const merged: AnalyticsResponse = { devices: {}, limit, from: range.from, to: range.to };
    let done = 0, next = 0;
    const quiet = tick > 0; // background refresh: swap data in once, no flicker
    const fetchChunk = async (c: { from: string; to: string }) => {
      const url = `/api/analytics?from=${encodeURIComponent(c.from)}&to=${encodeURIComponent(c.to)}&limit=${limit}${idsKey ? `&devices=${idsKey}` : ""}`;
      const hit = chunkCache.get(url);
      const live = new Date(c.to).getTime() > Date.now() - 36e5;
      if (hit && Date.now() - hit.at < (live ? 30000 : 3600000)) return hit.data;
      const r = await fetch(url);
      if (r.status === 401) { window.location.href = "/login"; throw new Error("unauthorized"); }
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as AnalyticsResponse;
      chunkCache.set(url, { at: Date.now(), data: j });
      return j;
    };
    const worker = async () => {
      while (next < chunks.length && run.current === id) {
        const c = chunks[next++];
        try {
          const j = await fetchChunk(c);
          if (run.current !== id) return;
          for (const [dev, v] of Object.entries(j.devices)) {
            merged.devices[dev] ??= { name: v.name, days: {} };
            Object.assign(merged.devices[dev].days, v.days);
          }
        } catch { if (run.current === id) setError(true); }
        done++;
        if (run.current === id) { setProgress({ done, total: chunks.length }); if (!quiet || done === chunks.length) setData({ ...merged, devices: { ...merged.devices } }); }
      }
    };
    Promise.all([worker(), worker(), worker()]);
    return () => { run.current++; };
  }, [range?.from, range?.to, idsKey, limit, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const derived = useMemo(() => deriveAnalytics(data), [data]);
  const loading = progress.total > 0 && progress.done < progress.total;
  return { data, progress, loading, error, ...derived };
}

export async function updateDevice(id: number, patch: (d: Device) => Device) {
  const cur: Device = await fetcher(api(`devices/${id}`));
  const r = await fetch(api(`devices/${id}`), {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch(cur)),
  });
  if (!r.ok) throw new Error(await r.text());
  await mutate(api("devices"));
  return r.json() as Promise<Device>;
}

export function useAddress(lat?: number, lon?: number, existing?: string | null) {
  const { prefs } = usePrefs();
  const lang = typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ar";
  const bad = lat == null || lon == null || (lat === 0 && lon === 0) || !!existing || prefs.geo === "off";
  const key = bad ? null : prefs.geo === "osm"
    ? `/api/geocode?lat=${lat!.toFixed(4)}&lon=${lon!.toFixed(4)}&lang=${lang}`
    : api(`server/geocode?latitude=${lat!.toFixed(5)}&longitude=${lon!.toFixed(5)}`);
  const { data } = useSWR<string>(
    key,
    async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(); return r.text(); },
    { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 3600000 },
  );
  return existing || data || null;
}
