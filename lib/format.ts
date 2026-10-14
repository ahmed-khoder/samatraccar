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

export function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(LOCALE, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function timeAgo(iso?: string | null) {
  const ar = LOCALE.startsWith("ar");
  if (!iso) return ar ? "أبدًا" : "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const f = (n: number, a: string, e: string) => (ar ? `منذ ${n} ${a}` : `${n}${e} ago`);
  if (s < 60) return ar ? "الآن" : "just now";
  if (s < 3600) return f(Math.floor(s / 60), "د", "m");
  if (s < 86400) return f(Math.floor(s / 3600), "س", "h");
  return f(Math.floor(s / 86400), "ي", "d");
}

export type Range = "today" | "yesterday" | "7d" | "30d" | "month" | "lastmonth";

const sod = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function rangeDates(r: Range): { from: string; to: string } {
  const now = new Date();
  const today = sod(now);
  let from = today, to = now;
  if (r === "yesterday") { from = addDays(today, -1); to = today; }
  if (r === "7d") from = addDays(today, -6);
  if (r === "30d") from = addDays(today, -29);
  if (r === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
  if (r === "lastmonth") { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1); }
  return { from: from.toISOString(), to: to.toISOString() };
}

/** yyyy-mm-dd (local) -> inclusive day range. */
export function customRange(fromDate: string, toDate: string) {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const end = addDays(new Date(ty, tm - 1, td), 1);
  const to = end.getTime() > Date.now() ? new Date() : end;
  return { from: from.toISOString(), to: to.toISOString() };
}

/** The window of equal length immediately before `w` (whole local days). */
export function prevRange(w: { from: string; to: string }) {
  const from = sod(new Date(w.from));
  const to = sod(new Date(w.to));
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5) + (new Date(w.to).getTime() > to.getTime() ? 1 : 0));
  return { from: addDays(from, -days).toISOString(), to: from.toISOString() };
}

export const toDateInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const daysIn = (w: { from: string; to: string }) =>
  Math.max(1, Math.ceil((new Date(w.to).getTime() - sod(new Date(w.from)).getTime()) / 864e5));

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

export function deviceState(d: { status: string }, p?: { speed: number; fixTime: string }) {
  if (d.status !== "online") return d.status === "offline" ? "offline" : "unknown";
  if (p && !hasRealFix(p)) return "nofix";
  return knToKmh(p?.speed) > 2 ? "moving" : "stopped";
}

export const STATE_COLOR: Record<string, string> = {
  moving: "#06b6d4",
  stopped: "#f59e0b",
  nofix: "#a78bfa",
  offline: "#64748b",
  unknown: "#64748b",
};
