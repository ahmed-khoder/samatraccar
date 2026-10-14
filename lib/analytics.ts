import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DayAgg, emptyAgg, TripSeg, StopSeg } from "./agg";
import { traccarUrl } from "./traccar";

interface P { fixTime: string; deviceTime: string; serverTime: string; latitude: number; longitude: number; speed: number; valid: boolean; attributes: { ignition?: boolean } }

const CACHE_FILE = path.join(process.env.CACHE_DIR || path.join(process.cwd(), ".cache"), "analytics.json");
type Entry = { agg: DayAgg; at: number; final: boolean };
let cache: Map<string, Entry> | null = null;
let dirty = false;

function load() {
  if (cache) return cache;
  cache = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as Record<string, Entry>;
    for (const [k, v] of Object.entries(raw)) if (v.final) cache.set(k, v);
  } catch {}
  return cache;
}
function persist() {
  if (!dirty || !cache) return;
  dirty = false;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const out: Record<string, Entry> = {};
    cache.forEach((v, k) => { if (v.final) out[k] = v; });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(out));
  } catch {}
}

const rad = (d: number) => (d * Math.PI) / 180;
export function haversine(a: P, b: P) {
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(x));
}

export function compute(pos: P[], offsetMin: number, limit: number): DayAgg {
  const g = emptyAgg();
  g.tripList = []; g.stopList = [];
  const ps = pos.filter((p) => p.latitude !== 0 || p.longitude !== 0);
  g.points = ps.length;
  const STOP_MIN = 3 * 60000;
  type Trip = TripSeg & { spd: number };
  let trip: Trip | null = null;
  let pend: { t: number; lat: number; lon: number; ign: boolean } | null = null;
  let stop: StopSeg | null = null;
  let lastBrake = 0, lastAccel = 0, overActive = false;

  const endTrip = () => {
    if (trip && trip.dist >= 200) { trip.avg = trip.mov ? trip.spd / trip.mov : 0; g.tripList!.push({ s: trip.s, e: trip.e, sLat: trip.sLat, sLon: trip.sLon, eLat: trip.eLat, eLon: trip.eLon, dist: trip.dist, max: trip.max, avg: trip.avg, mov: trip.mov }); }
    trip = null;
  };
  const endStop = () => { if (stop && stop.e - stop.s >= STOP_MIN) g.stopList!.push(stop); stop = null; };

  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1], b = ps[i];
    const ta = Date.parse(a.fixTime), tb = Date.parse(b.fixTime);
    const dt = tb - ta;
    if (!(dt > 0)) continue;
    const kmhA = a.speed * 1.852, kmhB = b.speed * 1.852;
    const okA = kmhA < 220, okB = kmhB < 220;
    if (okB) g.maxSpeed = Math.max(g.maxSpeed, kmhB);
    if (dt > 10 * 60000) { endTrip(); endStop(); pend = null; continue; } // data gap
    const hour = new Date(ta - offsetMin * 60000).getUTCHours();
    const d = haversine(a, b);
    const implied = d / (dt / 1000) * 3.6;
    const moving = okA && kmhA >= 3;
    if (moving) {
      g.movingMs += dt; g.hourMoving[hour] += dt; g.speedSum += kmhA * dt;
      const dd = implied <= 220 && d < 5000 ? d : 0;
      g.dist += dd; g.hourDist[hour] += dd;
      endStop(); pend = null;
      if (!trip) trip = { s: ta, e: tb, sLat: a.latitude, sLon: a.longitude, eLat: b.latitude, eLon: b.longitude, dist: 0, max: 0, avg: 0, mov: 0, spd: 0 };
      trip.e = tb; trip.eLat = b.latitude; trip.eLon = b.longitude; trip.dist += dd; trip.mov += dt; trip.spd += kmhA * dt;
      if (okB) trip.max = Math.max(trip.max, kmhB);
    } else {
      if (a.attributes.ignition) g.idleMs += dt; else g.stopMs += dt;
      if (!pend && !stop) pend = { t: ta, lat: a.latitude, lon: a.longitude, ign: !!a.attributes.ignition };
      if (pend && tb - pend.t >= STOP_MIN) { endTrip(); if (!stop) stop = { s: pend.t, e: tb, lat: pend.lat, lon: pend.lon, ign: pend.ign }; }
      if (stop) stop.e = tb;
    }
    const bin = kmhA < 3 ? 0 : kmhA < 30 ? 1 : kmhA < 60 ? 2 : kmhA < 90 ? 3 : kmhA < 120 ? 4 : 5;
    g.hist[bin] += dt;
    if (okA && kmhA > limit) { g.overMs += dt; if (!overActive) { g.overCount++; overActive = true; } } else overActive = false;
    if (dt <= 15000 && okA && okB) {
      const acc = (kmhB - kmhA) / (dt / 1000);
      if (acc <= -8 && kmhA >= 20 && tb - lastBrake > 5000) { g.harshBrake++; lastBrake = tb; }
      if (acc >= 8 && tb - lastAccel > 5000) { g.harshAccel++; lastAccel = tb; }
    }
  }
  endTrip(); endStop();
  g.trips = g.tripList.length;
  return g;
}

async function tget<T>(token: string, p: string): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i++) { // the upstream sometimes drops connections; retry with a short back-off
    try {
      const r = await fetch(`${traccarUrl()}/api/${p}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(25000) });
      if (r.status === 401) throw new Error("401");
      if (!r.ok) throw new Error(`${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
      if (e instanceof Error && e.message === "401") throw e;
      await new Promise((res) => setTimeout(res, 400 * (i + 1)));
    }
  }
  throw last;
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export async function analyze(token: string, fromMs: number, toMs: number, offsetMin: number, limit: number, only?: number[]) {
  const c = load();
  const devices = await tget<{ id: number; name: string }[]>(token, "devices");
  const list = devices.filter((d) => !only || only.includes(d.id));
  const DAY = 864e5;
  const startLocal = Math.floor((fromMs - offsetMin * 60000) / DAY) * DAY; // local midnight expressed as UTC-shifted
  const jobs: { id: number; day: string; s: number; e: number }[] = [];
  for (let d = startLocal; d + offsetMin * 60000 < toMs; d += DAY) {
    const s = d + offsetMin * 60000;
    const day = new Date(d).toISOString().slice(0, 10);
    for (const dev of list) jobs.push({ id: dev.id, day, s, e: s + DAY });
  }
  const now = Date.now();
  const result: Record<string, { name: string; days: Record<string, DayAgg> }> = {};
  list.forEach((d) => { result[d.id] = { name: d.name, days: {} }; });
  await pool(jobs, 6, async (j) => {
    const key = `v2|${j.id}|${j.day}|${offsetMin}|${limit}`;
    const hit = c.get(key);
    if (hit && (hit.final || now - hit.at < 45000)) { result[j.id].days[j.day] = hit.agg; return; }
    const q = new URLSearchParams({ deviceId: String(j.id), from: new Date(j.s).toISOString(), to: new Date(Math.min(j.e, now + 36e5 * 12)).toISOString() });
    let agg: DayAgg;
    try { agg = compute(await tget<P[]>(token, `reports/route?${q}`), offsetMin, limit); }
    catch { agg = hit?.agg ?? emptyAgg(); }
    // final once the day ended > 14h ago (devices may back-fill late; some clocks run hours ahead)
    const final = j.e < now - 14 * 36e5;
    c.set(key, { agg, at: now, final }); if (final) dirty = true;
    result[j.id].days[j.day] = agg;
  });
  persist();
  return result;
}
