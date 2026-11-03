// Route playback (the iTrack "Playback" screen): the time of each stored point, cleaning, parking stops and the play timeline.
// Pure functions, shared by the /api/playback route (server) and the playback page (browser).

import { distanceKm } from "./fleet";
import { STAY_RADIUS_M } from "./silence";
import { addDays, fromWall, startOfDay, wall } from "./tz";

const WEEK = 7 * 864e5;
const ROLLOVER = 1024 * WEEK; // GPS week-number rollover: a fix dated exactly 1024 weeks back
const H8 = 8 * 36e5;

/**
 * When a stored point was really taken. Normally its fix time. Two known tracker faults are undone, both proven by the server
 * receipt time, never guessed: GT06 trackers that had their clock on UTC+8 (fix 8 h after the server got it, before
 * decoder.timezone was set), and fixes dated 1024 weeks back (before the server upgrade of 2026-10-31). Anything else is kept.
 */
export function trueTime(fixMs: number, serverMs: number): number {
  let t = fixMs;
  if (serverMs - t > ROLLOVER - 2 * WEEK) t += ROLLOVER; // dated ~2007
  const ahead = t - serverMs;
  if (ahead > 7.5 * 36e5 && ahead < 8.5 * 36e5) t -= H8; // factory China clock
  return t;
}

/** One point as the page uses it. kmh rounded to 0.1, course in degrees, ign undefined when the tracker does not report it. */
export type Pt = { t: number; lat: number; lng: number; kmh: number; course: number; valid: boolean; ign?: boolean };
/** Wire form: [t, lat, lng, kmh, course, valid 1/0, ignition 1/0/-1]. */
export type Wire = [number, number, number, number, number, number, number];

type Stored = { fixTime: string; serverTime: string; latitude: number; longitude: number; speed: number; course: number; valid: boolean; attributes?: Record<string, unknown> };

/**
 * Server side: Traccar route rows → compact points inside [from, to], ordered by true time, one per instant. Rows that repeat an
 * earlier fix (status packets copying the last location, same fix time) are dropped: they add no place and no time.
 */
export function toWire(rows: Stored[], from: number, to: number): Wire[] {
  const out = new Map<number, Wire>();
  for (const r of rows) {
    const f = Date.parse(r.fixTime), s = Date.parse(r.serverTime);
    if (!Number.isFinite(f) || !Number.isFinite(s) || (r.latitude === 0 && r.longitude === 0)) continue;
    const t = trueTime(f, s);
    if (t < from || t > to || out.has(t)) continue;
    const ign = r.attributes?.ignition;
    out.set(t, [t, +r.latitude.toFixed(6), +r.longitude.toFixed(6), Math.round(r.speed * 1.852 * 10) / 10, Math.round(r.course || 0), r.valid ? 1 : 0, ign === true ? 1 : ign === false ? 0 : -1]);
  }
  return [...out.values()].sort((a, b) => a[0] - b[0]);
}

export const fromWire = (w: Wire): Pt => ({ t: w[0], lat: w[1], lng: w[2], kmh: w[3], course: w[4], valid: w[5] === 1, ign: w[6] === -1 ? undefined : w[6] === 1 });

const metres = (a: Pt, b: Pt) => distanceKm(a, b) * 1000;
const DRIFT_KMH = 220, DRIFT_MIN_M = 300;

/**
 * "Remove drift location": drops points that could only be reached faster than 220 km/h from the last kept point (a jump of the
 * GPS, not a drive), and points without a GPS fix that put the vehicle somewhere else. A no-fix point at the same place is kept:
 * trackers send them while parked under a roof, and they are the evidence of when it arrived. With `on` false every point is kept.
 */
export function clean(pts: Pt[], on: boolean): Pt[] {
  if (!on) return pts;
  const out: Pt[] = [];
  for (const p of pts) {
    const prev = out.at(-1);
    if (!p.valid && (!prev || metres(prev, p) > STAY_M)) continue;
    if (prev) {
      const m = metres(prev, p), h = (p.t - prev.t) / 36e5;
      if (m > DRIFT_MIN_M && (h <= 0 || m / 1000 / h > DRIFT_KMH)) continue;
    }
    out.push(p);
  }
  return out;
}

export type Stop = { i: number; lat: number; lng: number; s: number; e: number; open: boolean };
const STAY_M = STAY_RADIUS_M, SLOW_KMH = 3; // the same place = a circle 300 m across, as for the waiting time on the card
const SHUFFLE_M = 500, SHUFFLE_KMH = 20; // less than this between two stops is repositioning in a yard, not a trip
const HALT_MS = 60000; // a still moment shorter than this (a slow point while driving) is not parking and is never merged into one

/**
 * Parking stops of at least `minMs`. A stop is a run of still points (under 3 km/h, or engine off) at one place (within 150 m); it ends at the
 * first point that moves or is elsewhere: when the vehicle was seen leaving (creeping off counts from its first metre). Trackers send
 * almost nothing while parked, so the points around the departure are the only evidence of it. Two stops joined only by a short slow movement (under 500 m, never
 * over 20 km/h: repositioning in a yard) are one stop. A stop still going on at the last point ends at `end` (open).
 */
export function findStops(pts: Pt[], minMs: number, end: number): Stop[] {
  // still: under 3 km/h, or the engine is off (a speed sent with the engine off is a stale reading from before it stopped)
  const still = (p: Pt) => p.kmh <= SLOW_KMH || p.ign === false;
  const raw: (Stop & { j: number; firm: boolean })[] = [];
  let i = 0;
  while (i < pts.length) {
    if (!still(pts[i])) { i++; continue; }
    // the run of still points at this place; it ends at the first point that moves or is elsewhere: when it was seen leaving
    let j = i;
    while (j + 1 < pts.length && still(pts[j + 1]) && metres(pts[i], pts[j + 1]) <= STAY_M) j++;
    const open = j + 1 >= pts.length;
    // proof it really stood: two still points, or the engine switched off there (one point, then silence, is not enough)
    const firm = j > i || pts.slice(i, j + 2).some((p) => p.ign === false);
    raw.push({ i, j, firm, lat: pts[i].lat, lng: pts[i].lng, s: pts[i].t, e: open ? Math.max(end, pts[j].t) : pts[j + 1].t, open });
    i = j + 1;
  }
  const merged: typeof raw = [];
  for (const r of raw.filter((x) => x.firm && x.e - x.s >= HALT_MS)) {
    const prev = merged.at(-1);
    if (prev) {
      let m = 0, fast = false;
      for (let k = prev.j + 1; k <= r.i; k++) { m += metres(pts[k - 1], pts[k]); if (pts[k].kmh > SHUFFLE_KMH) fast = true; }
      if (m < SHUFFLE_M && !fast) { prev.j = r.j; prev.e = r.e; prev.open = r.open; continue; }
    }
    merged.push({ ...r });
  }
  return merged.filter((x) => x.e - x.s >= minMs).map(({ i, lat, lng, s, e, open }) => ({ i, lat, lng, s, e, open }));
}

/** Route seconds a gap may take on the play clock: a long stop passes in moments instead of hours. */
export const GAP_CAP_S = 60;

/** Play-clock seconds at each point: real time between points, but never more than GAP_CAP_S per gap. */
export function timeline(pts: Pt[]): number[] {
  const out = new Array<number>(pts.length);
  let c = 0;
  pts.forEach((p, k) => { if (k) c += Math.min(GAP_CAP_S, Math.max(0, (p.t - pts[k - 1].t) / 1000)); out[k] = c; });
  return out;
}

/** Fractional point index at a play-clock second (binary search; clamped to the route). */
export function indexAt(tl: number[], sec: number): number {
  if (!tl.length) return 0;
  if (sec <= 0) return 0;
  const last = tl.length - 1;
  if (sec >= tl[last]) return last;
  let lo = 0, hi = last;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tl[mid] <= sec) lo = mid; else hi = mid; }
  const span = tl[hi] - tl[lo];
  return lo + (span > 0 ? (sec - tl[lo]) / span : 0);
}

/** Real time (ms) at a fractional index, interpolated between the two points around it. */
export function timeAt(pts: Pt[], idx: number): number {
  if (!pts.length) return NaN;
  const i = Math.max(0, Math.min(Math.floor(idx), pts.length - 1)), j = Math.min(i + 1, pts.length - 1), f = idx - i;
  return Math.round(pts[i].t + (pts[j].t - pts[i].t) * f);
}

/** Longest playback window, as in iTrack. */
export const MAX_RANGE_MS = 31 * 864e5;

export type Preset = "today" | "yesterday" | "thisweek" | "lastweek" | "thismonth" | "lastmonth";

/** The iTrack quick ranges in Cairo time. Weeks start on Saturday, as the Egyptian working week does; ranges never pass `now`. */
export function presetRange(k: Preset, now: number): { from: number; to: number } {
  const today = startOfDay(now), w = wall(now);
  const dow = new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay(); // 0 Sunday … 6 Saturday
  const week = addDays(today, -((dow + 1) % 7));
  switch (k) {
    case "today": return { from: today, to: now };
    case "yesterday": return { from: addDays(today, -1), to: today };
    case "thisweek": return { from: week, to: now };
    case "lastweek": return { from: addDays(week, -7), to: week };
    case "thismonth": return { from: fromWall(w.y, w.m, 1), to: now };
    case "lastmonth": return { from: fromWall(w.y, w.m - 1, 1), to: fromWall(w.y, w.m, 1) };
  }
}

const p2 = (n: number) => String(n).padStart(2, "0");
/** Value for an <input type="datetime-local">, in Cairo time to the minute. */
export function toLocalInput(ms: number) {
  const w = wall(ms);
  return `${w.y}-${p2(w.m)}-${p2(w.d)}T${p2(w.h)}:${p2(w.mi)}`;
}
/** Back from an <input type="datetime-local"> value read as Cairo time; NaN when it is not one. */
export function fromLocalInput(v: string) {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? fromWall(+m[1], +m[2], +m[3], +m[4], +m[5]) : NaN;
}
