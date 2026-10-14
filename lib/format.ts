export const knToKmh = (kn?: number | null) => (kn ?? 0) * 1.852;
export const mToKm = (m?: number | null) => (m ?? 0) / 1000;

export function fmtNum(n: number, d = 0) {
  return n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
}

export function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

export function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function timeAgo(iso?: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export type Range = "today" | "yesterday" | "7d" | "30d";

export function rangeDates(r: Range): { from: string; to: string } {
  const now = new Date();
  const sod = new Date(now); sod.setHours(0, 0, 0, 0);
  let from = sod, to = now;
  if (r === "yesterday") { from = new Date(sod.getTime() - 864e5); to = sod; }
  if (r === "7d") from = new Date(sod.getTime() - 6 * 864e5);
  if (r === "30d") from = new Date(sod.getTime() - 29 * 864e5);
  return { from: from.toISOString(), to: to.toISOString() };
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

export function deviceState(d: { status: string }, p?: { speed: number }) {
  if (d.status !== "online") return d.status === "offline" ? "offline" : "unknown";
  return knToKmh(p?.speed) > 2 ? "moving" : "stopped";
}

export const STATE_COLOR: Record<string, string> = {
  moving: "#22d3ee",
  stopped: "#fbbf24",
  offline: "#64748b",
  unknown: "#475569",
};
