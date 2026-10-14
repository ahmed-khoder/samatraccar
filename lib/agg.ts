// Shared (client + server) analytics aggregate types and helpers.
export const HIST_BINS = ["0-3", "3-30", "30-60", "60-90", "90-120", "120+"] as const;

export interface TripSeg {
  s: number; e: number; sLat: number; sLon: number; eLat: number; eLon: number;
  dist: number; max: number; avg: number; mov: number;
}
export interface StopSeg { s: number; e: number; lat: number; lon: number; ign: boolean }

export interface DayAgg {
  dist: number;        // metres
  maxSpeed: number;    // km/h
  movingMs: number;
  idleMs: number;      // ignition on, not moving
  stopMs: number;      // ignition off, not moving
  speedSum: number;    // km/h * ms while moving (for time-weighted avg)
  hourDist: number[];  // 24
  hourMoving: number[];// 24 (ms)
  hist: number[];      // ms per speed bin
  overMs: number;
  overCount: number;
  harshBrake: number;
  harshAccel: number;
  trips: number;
  points: number;
  tripList?: TripSeg[];
  stopList?: StopSeg[];
}

export const emptyAgg = (): DayAgg => ({
  dist: 0, maxSpeed: 0, movingMs: 0, idleMs: 0, stopMs: 0, speedSum: 0,
  hourDist: Array(24).fill(0), hourMoving: Array(24).fill(0), hist: Array(6).fill(0),
  overMs: 0, overCount: 0, harshBrake: 0, harshAccel: 0, trips: 0, points: 0,
});

export function addAgg(a: DayAgg, b: DayAgg): DayAgg {
  const r = emptyAgg();
  (["dist", "movingMs", "idleMs", "stopMs", "speedSum", "overMs", "overCount", "harshBrake", "harshAccel", "trips", "points"] as const)
    .forEach((k) => { r[k] = a[k] + b[k]; });
  r.maxSpeed = Math.max(a.maxSpeed, b.maxSpeed);
  for (let i = 0; i < 24; i++) { r.hourDist[i] = a.hourDist[i] + b.hourDist[i]; r.hourMoving[i] = a.hourMoving[i] + b.hourMoving[i]; }
  for (let i = 0; i < 6; i++) r.hist[i] = a.hist[i] + b.hist[i];
  r.tripList = [...(a.tripList ?? []), ...(b.tripList ?? [])];
  r.stopList = [...(a.stopList ?? []), ...(b.stopList ?? [])];
  return r;
}

export const avgSpeed = (a: DayAgg) => (a.movingMs ? a.speedSum / a.movingMs : 0);

/** 0-100 driving score from overspeed share and harsh events per 100 km. */
export function driverScore(a: DayAgg) {
  const km = Math.max(a.dist / 1000, 1);
  const overShare = a.movingMs ? a.overMs / a.movingMs : 0;
  const harsh = (a.harshBrake + a.harshAccel) / km * 100;
  return Math.max(0, Math.round(100 - overShare * 60 - Math.min(harsh * 3, 40)));
}

export interface AnalyticsResponse {
  devices: Record<string, { name: string; days: Record<string, DayAgg> }>;
  limit: number;
  from: string;
  to: string;
}
