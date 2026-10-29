// Vehicle card: when the current engine / motion state began, and how its time and durations are written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SINCE_GAP, SINCE_TTL, sinceStep, stateSince, type Since } from "../lib/state-since.ts";
import { fmtDurationFull, setLocale } from "../lib/format.ts";
import { timeDate } from "../lib/tz.ts";

const ev = (type: string, iso: string) => ({ type, eventTime: iso });
const NOW = Date.parse("2026-10-29T00:10:00Z");

test("a repeated event is not a new transition: the state began at the first event of the trailing run", () => {
  // real sequence seen on device 6916: one ignitionOn, then four ignitionOff in a row
  const e = [ev("ignitionOn", "2026-10-28T02:00:00Z"), ev("ignitionOff", "2026-10-28T08:58:49Z"), ev("ignitionOff", "2026-10-28T09:07:02Z"),
    ev("ignitionOff", "2026-10-28T17:39:49Z"), ev("ignitionOff", "2026-10-28T17:52:31Z")];
  assert.equal(stateSince(e, "ignition", false, NOW), Date.parse("2026-10-28T08:58:49Z"));
});

test("moving and stopped, engine on and off, each from its own pair", () => {
  // real sequence seen on device 9134
  const e = [ev("ignitionOn", "2026-10-28T16:04:50Z"), ev("deviceMoving", "2026-10-28T16:23:30Z"), ev("ignitionOff", "2026-10-28T20:05:09Z"), ev("deviceStopped", "2026-10-28T20:06:13Z")];
  assert.equal(stateSince(e, "motion", false, NOW), Date.parse("2026-10-28T20:06:13Z"));
  assert.equal(stateSince(e, "ignition", false, NOW), Date.parse("2026-10-28T20:05:09Z"));
  const moving = [ev("deviceStopped", "2026-10-28T21:00:00Z"), ev("deviceMoving", "2026-10-28T23:30:00Z"), ev("ignitionOff", "2026-10-28T20:00:00Z"), ev("ignitionOn", "2026-10-28T23:28:00Z")];
  assert.equal(stateSince(moving, "motion", true, NOW), Date.parse("2026-10-28T23:30:00Z"));
  assert.equal(stateSince(moving, "ignition", true, NOW), Date.parse("2026-10-28T23:28:00Z"));
});

test("events delivered out of order are put back in time order", () => {
  const e = [ev("ignitionOff", "2026-10-28T23:00:00Z"), ev("ignitionOn", "2026-10-28T10:00:00Z"), ev("ignitionOff", "2026-10-28T12:00:00Z"), ev("ignitionOn", "2026-10-28T11:00:00Z")];
  // on 10:00, on 11:00, off 12:00, off 23:00 -> off since 12:00
  assert.equal(stateSince(e, "ignition", false, NOW), Date.parse("2026-10-28T12:00:00Z"));
});

test("no duration when the newest event disagrees with the state reported now", () => {
  assert.equal(stateSince([ev("ignitionOn", "2026-10-28T10:00:00Z"), ev("ignitionOff", "2026-10-28T20:00:00Z")], "ignition", true, NOW), null);
  assert.equal(stateSince([ev("deviceMoving", "2026-10-28T10:00:00Z"), ev("deviceStopped", "2026-10-28T20:06:13Z")], "motion", true, NOW), null);
});

test("no duration when nothing opposite precedes the run inside the window (start unproven)", () => {
  assert.equal(stateSince([ev("deviceStopped", "2026-10-28T20:06:13Z")], "motion", false, NOW), null);
  assert.equal(stateSince([ev("ignitionOff", "2026-10-28T08:00:00Z"), ev("ignitionOff", "2026-10-28T20:00:00Z")], "ignition", false, NOW), null);
  assert.equal(stateSince([ev("deviceOnline", "2026-10-28T20:00:00Z")], "motion", false, NOW), null); // other types don't count
});

test("unknown state, no events, ties or future-dated events give no duration", () => {
  assert.equal(stateSince([ev("ignitionOff", "2026-10-28T10:00:00Z"), ev("ignitionOn", "2026-10-28T20:00:00Z")], "ignition", undefined, NOW), null);
  assert.equal(stateSince([], "ignition", true, NOW), null);
  // newest on and off at the same instant
  assert.equal(stateSince([ev("ignitionOff", "2026-10-28T10:00:00Z"), ev("ignitionOn", "2026-10-28T20:00:00Z"), ev("ignitionOff", "2026-10-28T20:00:00Z")], "ignition", true, NOW), null);
  // the run's first event shares its instant with the opposite one before it
  assert.equal(stateSince([ev("ignitionOff", "2026-10-28T20:00:00Z"), ev("ignitionOn", "2026-10-28T20:00:00Z"), ev("ignitionOn", "2026-10-28T21:00:00Z")], "ignition", true, NOW), null);
  // clock 8 h ahead, at the start or anywhere in the run
  assert.equal(stateSince([ev("ignitionOff", "2026-10-28T10:00:00Z"), ev("ignitionOn", "2026-10-29T08:10:00Z")], "ignition", true, NOW), null);
  assert.equal(stateSince([ev("ignitionOff", "2026-10-28T10:00:00Z"), ev("ignitionOn", "2026-10-28T20:00:00Z"), ev("ignitionOn", "2026-10-29T08:10:00Z")], "ignition", true, NOW), null);
  // unreadable times are ignored, not trusted
  assert.equal(stateSince([ev("ignitionOff", "bad"), ev("ignitionOn", "2026-10-28T20:00:00Z")], "ignition", true, NOW), null);
  assert.equal(stateSince([ev("ignitionOff", "2026-10-28T10:00:00Z"), ev("ignitionOn", "2026-10-28T20:00:00Z"), ev("ignitionOn", "bad")], "ignition", true, NOW), Date.parse("2026-10-28T20:00:00Z"));
});

const entry = (o: Partial<Since>): Since => ({ sig: "false|false", at: NOW, failed: false, ign: null, motion: null, ...o });

test("cache: a fresh answer for the same state is kept; it expires after 10 min", () => {
  assert.deepEqual(sinceStep(entry({}), "false|false", NOW + 1000, false), { do: "keep" });
  assert.deepEqual(sinceStep(entry({}), "false|false", NOW + SINCE_TTL - 1, false), { do: "keep" });
  assert.deepEqual(sinceStep(entry({}), "false|false", NOW + SINCE_TTL, false), { do: "fetch" });
  assert.deepEqual(sinceStep(undefined, "false|false", NOW, false), { do: "fetch" });
});

test("cache: a failure is remembered for a minute (no automatic retry loop)", () => {
  assert.deepEqual(sinceStep(entry({ failed: true }), "false|false", NOW + SINCE_GAP - 1, false), { do: "keep" });
  assert.deepEqual(sinceStep(entry({ failed: true }), "false|false", NOW + SINCE_GAP, false), { do: "fetch" });
});

test("cache: a state change asks again, but at most once a minute", () => {
  assert.deepEqual(sinceStep(entry({}), "true|false", NOW + 20000, false), { do: "wait", ms: SINCE_GAP - 20000 });
  assert.deepEqual(sinceStep(entry({}), "true|false", NOW + SINCE_GAP, false), { do: "fetch" });
});

test("cache: while a request for the vehicle runs, others join it instead of sending another", () => {
  assert.deepEqual(sinceStep(undefined, "false|false", NOW, true), { do: "join" });
  assert.deepEqual(sinceStep(entry({}), "true|false", NOW + 5 * SINCE_GAP, true), { do: "join" });
  assert.deepEqual(sinceStep(entry({}), "false|false", NOW + 1000, true), { do: "keep" }); // a valid answer needs no request at all
});

test("durations down to the second, from the largest non-zero unit", () => {
  setLocale("ar-EG-u-nu-latn");
  assert.equal(fmtDurationFull((10 * 3600 + 11 * 60 + 21) * 1000), "10ساعة11دقيقة21ثانية");
  assert.equal(fmtDurationFull((9 * 3600 + 59 * 60 + 50) * 1000), "9ساعة59دقيقة50ثانية");
  assert.equal(fmtDurationFull((2 * 86400 + 5) * 1000), "2يوم0ساعة0دقيقة5ثانية");
  assert.equal(fmtDurationFull(-5000), "0ثانية");
  setLocale("en-GB");
  assert.equal(fmtDurationFull((11 * 60 + 21) * 1000), "11m 21s");
});

test("card time is hh:mm:ss dd-mm-yyyy in Cairo time", () => {
  assert.equal(timeDate(Date.parse("2026-12-01T00:52:30Z")), "02:52:30 01-12-2026"); // winter, UTC+2
  assert.equal(timeDate(Date.parse("2026-10-29T00:52:30Z")), "03:52:30 29-10-2026"); // summer time still on (ends the last Thursday of October at midnight)
  assert.equal(timeDate(Date.parse("2026-07-01T21:05:09Z")), "00:05:09 02-07-2026"); // summer, UTC+3, next Cairo day
});

test("an unreadable time gives null instead of throwing (the card shows 'time unknown')", () => {
  assert.equal(timeDate(Date.parse("bad")), null);
  assert.equal(timeDate(NaN), null);
  assert.equal(timeDate(Infinity), null);
  assert.equal(timeDate(Date.parse("2026-10-29T20:59:59Z")), "23:59:59 29-10-2026"); // last second before summer time ends
  assert.equal(timeDate(Date.parse("2026-10-29T21:00:00Z")), "23:00:00 29-10-2026"); // clocks go back: 23:00 again
});
