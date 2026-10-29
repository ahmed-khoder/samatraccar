// Egypt wall-clock time for display and for day boundaries, whatever timezone the viewer's device (or the server) is in.
// Uses the Africa/Cairo rules from Intl, so daylight saving time applies automatically — no fixed UTC+2 / UTC+3 offset.

export const TZ = "Africa/Cairo";

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

export type Wall = { y: number; m: number; d: number; h: number; mi: number; s: number };

/** Cairo wall-clock fields of an instant (month 1-12). */
export function wall(ms: number): Wall {
  const o: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second };
}

/** Minutes Cairo is ahead of UTC at this instant (120 in winter, 180 in summer). */
export function offsetMin(ms: number) {
  const w = wall(ms);
  return Math.round((Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000) / 60000);
}

/** The instant at which Cairo shows this wall-clock time. Fields may overflow (day 32, month 0…), like Date.UTC. */
export function fromWall(y: number, m: number, d = 1, h = 0, mi = 0): number {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetMin(guess) * 60000;
  t = guess - offsetMin(t) * 60000; // second pass settles the offset around a DST change
  return t;
}

/** Cairo midnight at the start of the day containing `ms`. */
export const startOfDay = (ms: number) => { const w = wall(ms); return fromWall(w.y, w.m, w.d); };

/** Cairo midnight `n` calendar days after the day containing `ms` (a day can be 23 or 25 h long). */
export const addDays = (ms: number, n: number) => { const w = wall(ms); return fromWall(w.y, w.m, w.d + n); };

const p2 = (n: number) => String(n).padStart(2, "0");
/** yyyy-mm-dd of the Cairo day containing `ms`. */
export const dayKey = (ms: number) => { const w = wall(ms); return `${w.y}-${p2(w.m)}-${p2(w.d)}`; };
/** yyyy-mm-dd hh:mm:ss in Cairo time. */
export const stamp = (ms: number) => { const w = wall(ms); return `${w.y}-${p2(w.m)}-${p2(w.d)} ${p2(w.h)}:${p2(w.mi)}:${p2(w.s)}`; };
/** hh:mm:ss dd-mm-yyyy in Cairo time (the vehicle card), or null for an invalid instant (Intl would throw on it). */
export const timeDate = (ms: number) => {
  if (!Number.isFinite(ms)) return null;
  const w = wall(ms);
  return `${p2(w.h)}:${p2(w.mi)}:${p2(w.s)} ${p2(w.d)}-${p2(w.m)}-${w.y}`;
};
