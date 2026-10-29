// When the selected vehicle's current engine / motion state began, read from Traccar's transition events.
import type { TEvent } from "./types";

export const STATE_EVENTS = ["ignitionOn", "ignitionOff", "deviceMoving", "deviceStopped"] as const;
export type SinceKind = "ignition" | "motion";
const PAIRS: Record<SinceKind, readonly [on: string, off: string]> = { ignition: ["ignitionOn", "ignitionOff"], motion: ["deviceMoving", "deviceStopped"] };

/** One events query covers this many hours back; a state older than that gets no duration. */
export const SINCE_HOURS = 48;

type Ev = Pick<TEvent, "type" | "eventTime">;

/**
 * Start (ms) of the current state, or null when the events can't vouch for it.
 * The state began at the first event of the trailing run that agrees with it: a repeat of the same event is not a new
 * transition, and only an opposite event before that run proves the run really started there. Times are Traccar's eventTime,
 * i.e. when the server received the packet that changed the state (seconds after it happened), not the tracker's fix time.
 */
export function stateSince(events: Ev[], kind: SinceKind, current: boolean | undefined, now = Date.now()): number | null {
  if (typeof current !== "boolean") return null;
  const [on, off] = PAIRS[kind], want = current ? on : off;
  const list = events
    .filter((e) => e.type === on || e.type === off)
    .map((e) => ({ type: e.type, t: Date.parse(e.eventTime) }))
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t);
  const last = list.at(-1);
  if (!last || last.type !== want) return null; // no transition, or the newest one disagrees with the state reported now
  if (list.some((e) => e.t === last.t && e.type !== want)) return null; // on and off at the same instant: order unknown
  let i = list.length - 1;
  while (i > 0 && list[i - 1].type === want) i--;
  if (i === 0) return null; // nothing opposite before the run inside the window: where it started is unproven
  if (list[i - 1].t === list[i].t) return null;
  if (list.slice(i).some((e) => e.t > now + 2 * 60000)) return null; // future-dated (a tracker clock running ahead)
  return list[i].t;
}

export type Since = { sig: string; at: number; failed: boolean; ign: number | null; motion: number | null };
export const SINCE_TTL = 10 * 60000, SINCE_GAP = 60000;

/**
 * What the card should do for a vehicle right now, given its cache entry:
 * keep = the entry answers (or a recent failure says wait), join = a request for it is already running,
 * wait = the state changed less than a minute after the last request, fetch = send the one events query.
 */
export function sinceStep(c: Since | undefined, sig: string, now: number, busy: boolean): { do: "keep" | "join" | "fetch" } | { do: "wait"; ms: number } {
  const age = c ? now - c.at : Infinity;
  if (c && c.sig === sig && age < (c.failed ? SINCE_GAP : SINCE_TTL)) return { do: "keep" };
  if (busy) return { do: "join" };
  if (age < SINCE_GAP) return { do: "wait", ms: SINCE_GAP - age };
  return { do: "fetch" };
}
