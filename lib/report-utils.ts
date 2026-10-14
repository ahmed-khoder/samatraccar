import { addAgg, avgSpeed, driverScore, emptyAgg, type AnalyticsResponse, type DayAgg } from "./agg";
import type { Key } from "./dict";

export interface VRow {
  id: number; name: string; a: DayAgg; days: Record<string, DayAgg>;
  km: number; trips: number; stops: number; moving: number; idle: number; stop: number; idlePct: number;
  avg: number; max: number; over: number; overMs: number; harsh: number; score: number; activeDays: number; kmPerActive: number;
}

export function vehicleRows(resp: AnalyticsResponse | undefined, ids?: number[]): VRow[] {
  const sel = ids && ids.length ? new Set(ids) : null;
  return Object.entries(resp?.devices ?? {})
    .filter(([id]) => !sel || sel.has(Number(id)))
    .map(([id, v]) => {
      let a = emptyAgg();
      let stops = 0, active = 0;
      for (const d of Object.values(v.days)) {
        a = addAgg(a, d);
        stops += d.stopList?.length ?? 0;
        if (d.dist > 1000) active++;
      }
      const run = a.movingMs + a.idleMs;
      return {
        id: Number(id), name: v.name, a, days: v.days,
        km: a.dist / 1000, trips: a.trips, stops, moving: a.movingMs, idle: a.idleMs, stop: a.stopMs,
        idlePct: run ? (a.idleMs / run) * 100 : 0, avg: avgSpeed(a), max: a.maxSpeed,
        over: a.overCount, overMs: a.overMs, harsh: a.harshBrake + a.harshAccel, score: driverScore(a),
        activeDays: active, kmPerActive: active ? a.dist / 1000 / active : 0,
      };
    })
    .sort((x, y) => y.km - x.km);
}

/** Roll a set of vehicle rows up into one fleet-level row. */
export function totals(rows: VRow[]) {
  let a = emptyAgg();
  let stops = 0;
  rows.forEach((r) => { a = addAgg(a, r.a); stops += r.stops; });
  const run = a.movingMs + a.idleMs;
  const act = rows.filter((r) => r.km > 1);
  return {
    a, km: a.dist / 1000, trips: a.trips, stops, moving: a.movingMs, idle: a.idleMs, stop: a.stopMs,
    idlePct: run ? (a.idleMs / run) * 100 : 0, avg: avgSpeed(a), max: a.maxSpeed, over: a.overCount, harsh: a.harshBrake + a.harshAccel,
    score: act.length ? Math.round(act.reduce((s, r) => s + r.score, 0) / act.length) : 0, active: act.length,
  };
}

export type Tot = ReturnType<typeof totals>;

export interface Insight { tone: "good" | "warn" | "info"; key: Key; vars: Record<string, string | number> }

export function insights(rows: VRow[], perDay: [string, DayAgg][], fmt: (n: number, d?: number) => string): Insight[] {
  const out: Insight[] = [];
  const act = rows.filter((r) => r.km > 1);
  if (!act.length) return out;
  const top = act[0];
  out.push({ tone: "info", key: "ins.top", vars: { name: top.name, km: fmt(top.km) } });
  const idler = [...act].filter((r) => r.moving + r.idle > 36e5).sort((a, b) => b.idlePct - a.idlePct)[0];
  if (idler && idler.idlePct > 15) out.push({ tone: "warn", key: "ins.idle", vars: { name: idler.name, p: fmt(idler.idlePct) } });
  const sc = [...act].sort((a, b) => b.score - a.score);
  if (sc.length > 1) {
    out.push({ tone: "good", key: "ins.best", vars: { name: sc[0].name, s: sc[0].score } });
    if (sc[sc.length - 1].score < 85) out.push({ tone: "warn", key: "ins.worst", vars: { name: sc[sc.length - 1].name, s: sc[sc.length - 1].score } });
  }
  const over = [...act].sort((a, b) => b.over - a.over)[0];
  if (over && over.over > 0) out.push({ tone: "warn", key: "ins.over", vars: { name: over.name, n: over.over } });
  const day = [...perDay].sort((a, b) => b[1].dist - a[1].dist)[0];
  if (day && day[1].dist > 0) out.push({ tone: "info", key: "ins.day", vars: { day: day[0], km: fmt(day[1].dist / 1000) } });
  const idle = rows.length - act.length;
  if (idle > 0) out.push({ tone: "info", key: "ins.inactive", vars: { n: idle } });
  const hot = [...act].sort((a, b) => b.max - a.max)[0];
  if (hot && hot.max > 110) out.push({ tone: "warn", key: "ins.max", vars: { name: hot.name, v: fmt(hot.max) } });
  return out;
}

/** All local days (yyyy-mm-dd) covered by an ISO window. */
export function dayKeys(w: { from: string; to: string }) {
  const out: string[] = [];
  const d = new Date(w.from); d.setHours(0, 0, 0, 0);
  const end = new Date(w.to).getTime();
  while (d.getTime() < end && out.length < 100) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export const PALETTE = ["#22d3ee", "#8b5cf6", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c", "#a3e635", "#f87171", "#2dd4bf"];

export function useSortRows<T>(rows: T[], key: keyof T | null, dir: 1 | -1) {
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const x = a[key], y = b[key];
    return (typeof x === "string" ? (x as string).localeCompare(y as string) : (x as number) - (y as number)) * dir;
  });
}
