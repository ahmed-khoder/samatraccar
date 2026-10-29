// Vehicle card: when the current engine / motion state began, and how its time and durations are written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPair, stateSince } from "../lib/state-since.ts";
import { fmtDurationFull, setLocale } from "../lib/format.ts";
import { timeDate } from "../lib/tz.ts";

const ev = (type: string, iso: string) => ({ type, eventTime: iso });
const NOW = Date.parse("2026-10-29T00:10:00Z");

test("engine off since the newest ignitionOff; repeated offs (a missed short on-spell) keep the newest", () => {
  // real sequence seen on device 6916: four ignitionOff in a row
  const e = [ev("ignitionOn", "2026-10-28T02:00:00Z"), ev("ignitionOff", "2026-10-28T08:58:49Z"), ev("ignitionOff", "2026-10-28T17:39:49Z"), ev("ignitionOff", "2026-10-28T17:52:31Z")];
  assert.equal(stateSince(e, "ignition", false, NOW), Date.parse("2026-10-28T17:52:31Z"));
});

test("no duration when the newest event disagrees with the state reported now", () => {
  const e = [ev("ignitionOff", "2026-10-28T20:00:00Z")];
  assert.equal(stateSince(e, "ignition", true, NOW), null);
  assert.equal(stateSince([ev("deviceStopped", "2026-10-28T20:06:13Z")], "motion", true, NOW), null);
});

test("each kind reads only its own pair of events, in any order", () => {
  const e = [ev("deviceStopped", "2026-10-28T20:06:13Z"), ev("ignitionOff", "2026-10-28T20:05:09Z"), ev("deviceMoving", "2026-10-28T16:23:30Z"), ev("ignitionOn", "2026-10-28T16:04:50Z")];
  assert.equal(stateSince(e, "motion", false, NOW), Date.parse("2026-10-28T20:06:13Z"));
  assert.equal(stateSince(e, "ignition", false, NOW), Date.parse("2026-10-28T20:05:09Z"));
});

test("unknown state, no events, a tie or a future-dated event give no duration", () => {
  assert.equal(stateSince([ev("ignitionOn", "2026-10-28T20:00:00Z")], "ignition", undefined, NOW), null);
  assert.equal(stateSince([], "ignition", true, NOW), null);
  assert.equal(stateSince([ev("ignitionOn", "2026-10-28T20:00:00Z"), ev("ignitionOff", "2026-10-28T20:00:00Z")], "ignition", true, NOW), null);
  assert.equal(stateSince([ev("ignitionOn", "2026-10-29T08:10:00Z")], "ignition", true, NOW), null); // clock 8 h ahead
  assert.equal(stateSince([ev("ignitionOn", "bad")], "ignition", true, NOW), null);
});

test("hasPair tells whether the window held any transition of that kind", () => {
  const e = [ev("ignitionOff", "2026-10-28T20:00:00Z"), ev("deviceOnline", "2026-10-28T20:01:00Z")];
  assert.equal(hasPair(e, "ignition"), true);
  assert.equal(hasPair(e, "motion"), false);
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
