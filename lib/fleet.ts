// Phone views of the fleet (vehicle list, alerts, navigation): small pure helpers.

/** Google Maps directions to a point; on a phone it opens the Maps app, which shows the route, distance and time. */
export const mapsDirections = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}&travelmode=driving`;

/** The list tab a vehicle belongs to: "online" while Traccar has it connected, everything else is "offline". */
export const fleetTab = (status: string) => (status === "online" ? "online" : "offline");

/** Alerts newer than the moment the list was last opened count as unread. */
export const isUnread = (eventTime: string, seenAt: number) => {
  const t = Date.parse(eventTime);
  return Number.isFinite(t) && t > seenAt;
};

/** Straight-line distance in km between two points (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** The vehicle after / before `current` in the list, wrapping around; with nothing selected, the first / last. */
export function neighbour(ids: number[], current: number | null, dir: 1 | -1) {
  if (!ids.length) return null;
  const i = current == null ? -1 : ids.indexOf(current);
  if (i < 0) return dir > 0 ? ids[0] : ids[ids.length - 1];
  return ids[(i + dir + ids.length) % ids.length];
}

export type FleetCounts = { total: number; online: number; offline: number; moving: number; engineOn: number };

/** The numbers of the fleet bar. Moving and engine-on only count connected vehicles: a silent one's last reading is not "now". */
export function fleetCounts(rows: { status: string; base: string; ignition?: unknown }[]): FleetCounts {
  const c: FleetCounts = { total: rows.length, online: 0, offline: 0, moving: 0, engineOn: 0 };
  for (const r of rows) {
    if (r.status !== "online") { c.offline++; continue; }
    c.online++;
    if (r.base === "moving") c.moving++;
    if (r.ignition === true) c.engineOn++;
  }
  return c;
}

export type FleetFilter = "all" | "online" | "offline" | "moving" | "engine";

/** Does a vehicle belong in the list when this bar tile is selected? Same rules as fleetCounts, so a tile's number is its list length. */
export function matchesFilter(f: FleetFilter, r: { status: string; base: string; ignition?: unknown }): boolean {
  if (f === "all") return true;
  const live = r.status === "online";
  if (f === "online") return live;
  if (f === "offline") return !live;
  if (f === "moving") return live && r.base === "moving";
  return live && r.ignition === true;
}
