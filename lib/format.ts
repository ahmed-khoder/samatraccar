import { TZ, addDays as addDaysTz, dayKey, fromWall, startOfDay, wall } from "./tz";

let LOCALE = "en-GB";
export const setLocale = (l: string) => { LOCALE = l; };
export const getLocale = () => LOCALE;

export const knToKmh = (kn?: number | null) => (kn ?? 0) * 1.852;
export const mToKm = (m?: number | null) => (m ?? 0) / 1000;

export function fmtNum(n: number, d = 0) {
  return n.toLocaleString(LOCALE, { maximumFractionDigits: d, minimumFractionDigits: d });
}

export function fmtDuration(ms: number) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ar = LOCALE.startsWith("ar");
  const U = ar ? { d: "ي", h: "س", m: "د", s: "ث" } : { d: "d", h: "h", m: "m", s: "s" };
  if (d) return `${d}${U.d} ${h}${U.h}`;
  if (h) return `${h}${U.h} ${m}${U.m}`;
  if (m) return `${m}${U.m}`;
  return `${s}${U.s}`;
}

/** Every unit down to the second, from the largest non-zero one: 10ساعة11دقيقة21ثانية / 10h 11m 21s (the vehicle card). */
export function fmtDurationFull(ms: number) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const ar = LOCALE.startsWith("ar");
  const parts = [[Math.floor(s / 86400), "يوم", "d"], [Math.floor((s % 86400) / 3600), "ساعة", "h"], [Math.floor((s % 3600) / 60), "دقيقة", "m"], [s % 60, "ثانية", "s"]] as const;
  const i = parts.findIndex(([n]) => n > 0);
  return parts.slice(i < 0 ? 3 : i).map(([n, a, e]) => `${n}${ar ? a : e}`).join(ar ? "" : " ");
}

/** An ISO time that Date can read; tracker data can carry unreadable strings, which must show as "—", not "Invalid Date" / "NaN". */
const readable = (iso?: string | null): iso is string => !!iso && Number.isFinite(Date.parse(iso));

export function fmtDateTime(iso?: string | null) {
  if (!readable(iso)) return "—";
  return new Date(iso).toLocaleString(LOCALE, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ,
  });
}

export function fmtTime(iso?: string | null) {
  if (!readable(iso)) return "—";
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

export function timeAgo(iso?: string | null) {
  const ar = LOCALE.startsWith("ar");
  if (!iso) return ar ? "أبدًا" : "never";
  if (!readable(iso)) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const f = (n: number, a: string, e: string) => (ar ? `منذ ${n} ${a}` : `${n}${e} ago`);
  if (s < 60) return ar ? "الآن" : "just now";
  if (s < 3600) return f(Math.floor(s / 60), "د", "m");
  if (s < 86400) return f(Math.floor(s / 3600), "س", "h");
  return f(Math.floor(s / 86400), "ي", "d");
}

export type Range = "today" | "yesterday" | "7d" | "30d" | "month" | "lastmonth";

// day boundaries are Cairo midnights (see lib/tz), not the viewer's local ones
const sod = (d: Date) => new Date(startOfDay(d.getTime()));
const addDays = (d: Date, n: number) => new Date(addDaysTz(d.getTime(), n));

export function rangeDates(r: Range): { from: string; to: string } {
  const now = new Date();
  const today = sod(now);
  let from = today, to = now;
  if (r === "yesterday") { from = addDays(today, -1); to = today; }
  if (r === "7d") from = addDays(today, -6);
  if (r === "30d") from = addDays(today, -29);
  const w = wall(now.getTime());
  if (r === "month") from = new Date(fromWall(w.y, w.m, 1));
  if (r === "lastmonth") { from = new Date(fromWall(w.y, w.m - 1, 1)); to = new Date(fromWall(w.y, w.m, 1)); }
  return { from: from.toISOString(), to: to.toISOString() };
}

/** yyyy-mm-dd (Cairo days) -> inclusive day range. */
export function customRange(fromDate: string, toDate: string) {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const from = new Date(fromWall(fy, fm, fd));
  const end = new Date(fromWall(ty, tm, td + 1));
  const to = end.getTime() > Date.now() ? new Date() : end;
  return { from: from.toISOString(), to: to.toISOString() };
}

/** The window of equal length immediately before `w` (whole local days). */
export function prevRange(w: { from: string; to: string }) {
  const from = sod(new Date(w.from));
  const to = sod(new Date(w.to));
  // round: a range across a DST change is a whole number of days that is 1 h short or long
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5) + (new Date(w.to).getTime() > to.getTime() ? 1 : 0));
  return { from: addDays(from, -days).toISOString(), to: from.toISOString() };
}

export const toDateInput = (iso: string) => dayKey(new Date(iso).getTime());
/** Number of Cairo calendar days the window touches (counted, since a day can be 23 or 25 h long). */
export function daysIn(w: { from: string; to: string }) {
  const end = new Date(w.to).getTime();
  let n = 0;
  for (let d = startOfDay(new Date(w.from).getTime()); d < end && n < 400; d = addDaysTz(d, 1)) n++;
  return Math.max(1, n);
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

export function speedColor(kmh: number) {
  if (kmh < 5) return "#64748b";
  if (kmh < 40) return "#22d3ee";
  if (kmh < 80) return "#a3e635";
  if (kmh < 110) return "#fbbf24";
  return "#f43f5e";
}

/** A GPS fix dated before 2020 means the receiver has no real fix (clock/week-rollover bug) — the position is stale. */
export const hasRealFix = (p?: { fixTime: string } | null) => !!p && Date.parse(p.fixTime) > Date.parse("2020-01-01");

type Fix = { speed: number; fixTime: string; serverTime?: string; valid?: boolean };
type Times = { fixTime: string; serverTime?: string };

/** fixTime later than the time the server received it: the tracker clock runs ahead (e.g. a GT06 left on UTC+8). */
export const clockAhead = (p?: Times | null) => !!p?.serverTime && Date.parse(p.fixTime) - Date.parse(p.serverTime) > 2 * 60000;

/**
 * When the shown location was really measured (ISO), or null when that can't be known.
 * - normal clock: the fix time.
 * - clock ahead by whole hours (a timezone mistake) and received right away: a live fix, measured when it arrived.
 * - clock ahead by anything else: a status packet repeating an old location, whose real age is unknown.
 */
export function fixAt(p: Times): string | null {
  if (!clockAhead(p)) return p.fixTime;
  const ahead = Date.parse(p.fixTime) - Date.parse(p.serverTime!), off = ahead % 36e5;
  return off < 3 * 60000 || off > 36e5 - 3 * 60000 ? p.serverTime! : null;
}

const FRESH_MS = 5 * 60000;

export function deviceState(d: { status: string }, p?: Fix) {
  if (d.status !== "online") return d.status === "offline" ? "offline" : "unknown";
  if (p && (!hasRealFix(p) || p.valid === false)) return "nofix"; // no GPS fix: the coordinates are not a current measurement
  // a repeated old location keeps the speed it had back then — that is not "moving now"
  const at = p ? fixAt(p) : null;
  const fresh = !!at && Date.now() - Date.parse(at) < FRESH_MS;
  return fresh && knToKmh(p?.speed) > 2 ? "moving" : "stopped";
}

export const STATE_COLOR: Record<string, string> = {
  moving: "#06b6d4",
  stopped: "#f59e0b",
  nofix: "#a78bfa",
  offline: "#64748b",
  unknown: "#64748b",
};

export type VisualState = "over" | "moving" | "idle" | "stopped" | "offline" | "nofix";

/** Finer-grained status for colouring: overspeed, and stopped-with-engine-on ("idle"). */
export function visualState(base: string, kmh: number, limit: number, ignition?: boolean): VisualState {
  if (base === "moving") return kmh > limit ? "over" : "moving";
  if (base === "stopped") return ignition ? "idle" : "stopped";
  return base === "nofix" ? "nofix" : "offline";
}
