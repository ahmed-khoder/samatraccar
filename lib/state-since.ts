// When the selected vehicle's current engine / motion state began, read from Traccar's transition events.
import type { TEvent } from "./types";

export const STATE_EVENTS = ["ignitionOn", "ignitionOff", "deviceMoving", "deviceStopped"] as const;
export type SinceKind = "ignition" | "motion";
const PAIRS: Record<SinceKind, readonly [on: string, off: string]> = { ignition: ["ignitionOn", "ignitionOff"], motion: ["deviceMoving", "deviceStopped"] };

type Ev = Pick<TEvent, "type" | "eventTime">;

/** The newest event of the pair, or "tie" when an on and an off share the newest timestamp (order unknown). */
function newest(events: Ev[], kind: SinceKind) {
  const [on, off] = PAIRS[kind];
  let type: string | null = null, t = -Infinity, tie = false;
  for (const e of events) {
    if (e.type !== on && e.type !== off) continue;
    const et = Date.parse(e.eventTime);
    if (!Number.isFinite(et) || et < t) continue;
    tie = et === t && (tie || type !== e.type);
    type = e.type; t = et;
  }
  return type === null ? null : tie ? "tie" : { type, t };
}

export const hasPair = (events: Ev[], kind: SinceKind) => newest(events, kind) !== null;

/**
 * Start (ms) of the current state, or null when the events can't vouch for it.
 * An event marks a transition at that moment (ignitionOff = engine went on -> off), so the state began at the newest event of the pair,
 * provided that event agrees with the state reported now. A run of same-type events only means a short opposite spell went unrecorded:
 * the newest one is still the latest transition.
 */
export function stateSince(events: Ev[], kind: SinceKind, current: boolean | undefined, now = Date.now()): number | null {
  if (typeof current !== "boolean") return null;
  const last = newest(events, kind);
  if (!last || last === "tie" || last.type !== PAIRS[kind][current ? 0 : 1]) return null;
  if (last.t > now + 2 * 60000) return null; // future-dated (a tracker clock running ahead): no honest duration
  return last.t;
}
