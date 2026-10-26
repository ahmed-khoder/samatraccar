import type { Position } from "./types";

// Merging the two live sources (polled /api/live and pushed /api/stream) without ever showing an older position.
// A higher position id means Traccar received it later. A clock-ahead fix (fixTime well after serverTime) is either a
// timezone error or a status packet repeating a stuck future-dated location, so it never replaces a sane one.

const ahead = (p: Position) => Date.parse(p.fixTime) - Date.parse(p.serverTime) > 2 * 60000;
const newer = (p: Position, than: Position) => p.id > than.id && !(ahead(p) && !ahead(than));

/** Pushed positions update the devices they name; everything else stays. */
export function mergePushed(cur: Position[] | undefined, pushed: Position[]) {
  const m = new Map((cur ?? []).map((p) => [p.deviceId, p]));
  for (const p of pushed) {
    const c = m.get(p.deviceId);
    if (!c || newer(p, c)) m.set(p.deviceId, p);
  }
  return [...m.values()];
}

/** The poll decides which devices exist; per device it only keeps a pushed position that is newer than the polled one. */
export function mergePolled(cur: Position[] | undefined, polled: Position[]) {
  const m = new Map((cur ?? []).map((p) => [p.deviceId, p]));
  return polled.map((p) => {
    const c = m.get(p.deviceId);
    return c && newer(c, p) ? c : p;
  });
}

/**
 * For a tracker whose clock was corrected (decoder.timezone, at `sinceMs`) while Traccar's "latest" is still a future-dated
 * fix: the newest position received since the correction with a sane time. It is newer real information than the stuck
 * "latest" — even when a later status packet (higher id) re-copied the stuck location.
 */
export function newestSane(list: Position[], prev: Position | null = null, sinceMs = 0) {
  let best = prev;
  // received after the correction only: an older status packet can look sane once its copied future time has passed
  for (const p of list) if (!ahead(p) && Date.parse(p.serverTime) > sinceMs && (!best || p.id > best.id)) best = p;
  return best;
}

export const isAhead = ahead;
