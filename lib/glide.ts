// How long a vehicle marker takes to glide to a newly reported position. It only ever moves between two reported points.

const MIN_MS = 1000, MAX_MS = 30000;
const PAUSED_MS = 90000; // no movement reported for this long: the vehicle was parked or silent, so the gap says nothing about its pace
const MAX_SPEED = 60; // m/s (216 km/h): anything faster over the glide is a correction or a lost stretch, not driving

/** Glide for as long as the last update interval, so the marker arrives about when the next position does. */
export function glideMs(sinceLastMoveMs: number, distanceM: number) {
  if (sinceLastMoveMs >= PAUSED_MS) return MIN_MS;
  const ms = Math.min(MAX_MS, Math.max(MIN_MS, sinceLastMoveMs));
  return distanceM / (ms / 1000) > MAX_SPEED ? MIN_MS : ms;
}
