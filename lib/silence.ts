// Why a tracker went quiet, judged from its last messages. Traccar cannot see the SIM plan, so the "network" verdict (the red
// "no entry" sign, as iTrack used for a cut mobile connection) is only given when the last messages show healthy power and then
// silence; a power cut, an empty battery or no evidence at all never earns it.

import { distanceKm } from "./fleet";

export type Silence = "power" | "network" | "unknown";
type Row = { attributes: Record<string, unknown> };

const POWER_ALARMS = /powerCut|lowBattery|powerOff/i;
const LOW_BATTERY = 20;

/** `rows` are the tracker's stored positions, oldest first, up to its last message. */
export function silenceCause(rows: Row[]): Silence {
  const recent = rows.slice(-12);
  if (recent.some((r) => typeof r.attributes.alarm === "string" && POWER_ALARMS.test(r.attributes.alarm))) return "power";
  const last = <T,>(key: string, ok: (v: unknown) => v is T): T | undefined => {
    for (let i = recent.length - 1; i >= 0; i--) { const v = recent[i].attributes[key]; if (ok(v)) return v; }
    return undefined;
  };
  const charge = last("charge", (v): v is boolean => typeof v === "boolean");
  const battery = last("batteryLevel", (v): v is number => typeof v === "number");
  if (charge === true) return "network"; // wired power was connected at its last report
  if (charge === false) return battery == null || battery <= LOW_BATTERY ? "power" : "unknown"; // on battery only: not provable
  return battery != null && battery > LOW_BATTERY ? "network" : "unknown"; // no charge flag: a healthy battery at least
}

type Fix = { latitude: number; longitude: number; serverTime: string };
export const STAY_RADIUS_M = 150; // a circle 300 m across: moving about inside it, or stopping and starting, is still the same place

/**
 * Since when the vehicle has been at its last known place: the oldest message of the unbroken run, ending at the last one, whose
 * position is within 150 m of the last position (at least two messages, else null: a single point proves no stay). Stops, starts and
 * ignition changes inside that circle do not restart it. `atLeast` is true when the run reaches the start of `rows` (it may be older).
 * Time is when the server received the message. `rows` are oldest first.
 */
export function stillSince(rows: Fix[]): { t: number; atLeast: boolean } | null {
  const ok = rows.filter((r) => Number.isFinite(Date.parse(r.serverTime)) && !(r.latitude === 0 && r.longitude === 0));
  const last = ok.at(-1);
  if (!last) return null;
  const metres = (r: Fix) => distanceKm({ lat: last.latitude, lng: last.longitude }, { lat: r.latitude, lng: r.longitude }) * 1000;
  let i = ok.length - 1;
  while (i > 0 && metres(ok[i - 1]) <= STAY_RADIUS_M) i--;
  if (i === ok.length - 1) return null; // only the last message is at this place: nothing shows it was waiting there
  return { t: Date.parse(ok[i].serverTime), atLeast: i === 0 };
}

export type Stay = { at: number; lat: number; lng: number; failed: boolean; still: { t: number; atLeast: boolean } | null };
const STAY_TTL = 5 * 60000, STAY_GAP = 60000;

/**
 * What the card should do about the stay of an online vehicle: keep the answer it has, join a request that is running, wait out the
 * one-minute pause between requests, or fetch. The answer is refreshed every 5 minutes, and sooner (at most once a minute) when the
 * vehicle has left the circle it was computed for.
 */
export function stayStep(e: Stay | undefined, now: number, here: { lat: number; lng: number }, busy: boolean): { do: "keep" | "join" | "fetch" } | { do: "wait"; ms: number } {
  if (!e) return busy ? { do: "join" } : { do: "fetch" };
  const age = now - e.at;
  if (e.failed && age < STAY_GAP) return { do: "keep" };
  const left = distanceKm({ lat: e.lat, lng: e.lng }, here) * 1000 > STAY_RADIUS_M;
  if (age < STAY_TTL && !(left && !e.failed)) return { do: "keep" };
  if (busy) return { do: "join" };
  if (age < STAY_GAP) return { do: "wait", ms: STAY_GAP - age };
  return { do: "fetch" };
}

/** Battery, signal and charging state: trackers send them in status messages between the GPS messages, so the newest message often lacks them. */
export type Power = { batteryLevel?: number; rssi?: number; charge?: boolean; at: number };
type PowerRow = { attributes: Record<string, unknown>; serverTime: string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The latest value of each of the three from `rows` (oldest first); `at` is when the newest of them was received. */
export function lastPower(rows: PowerRow[]): Power | null {
  let out = null as Power | null;
  for (const r of rows) {
    const a = r.attributes, at = Date.parse(r.serverTime);
    const batteryLevel = num(a.batteryLevel), rssi = num(a.rssi), charge = typeof a.charge === "boolean" ? a.charge : undefined;
    if (!Number.isFinite(at) || (batteryLevel === undefined && rssi === undefined && charge === undefined)) continue;
    out = { batteryLevel: batteryLevel ?? out?.batteryLevel, rssi: rssi ?? out?.rssi, charge: charge ?? out?.charge, at };
  }
  return out;
}

/** Keeps what `next` knows and fills the rest from `prev`; the newer reading of each wins. */
export function mergePower(prev: Power | undefined, next: Power | null): Power | undefined {
  if (!next) return prev;
  if (!prev) return next;
  const [old, nw] = next.at >= prev.at ? [prev, next] : [next, prev];
  return { batteryLevel: nw.batteryLevel ?? old.batteryLevel, rssi: nw.rssi ?? old.rssi, charge: nw.charge ?? old.charge, at: nw.at };
}
