// Egypt time: display and day boundaries follow Africa/Cairo rules, including daylight saving time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dayKey, fromWall, offsetMin, stamp, startOfDay } from "../lib/tz.ts";
import { daysIn } from "../lib/format.ts";
import { dayKeys } from "../lib/report-utils.ts";

const U = (s: string) => Date.parse(s);

test("offset is +3 in summer and +2 in winter (not a fixed UTC+2)", () => {
  assert.equal(offsetMin(U("2026-07-15T12:00:00Z")), 180);
  assert.equal(offsetMin(U("2027-01-15T12:00:00Z")), 120);
});

test("display stamp is Cairo wall clock", () => {
  assert.equal(stamp(U("2026-10-26T00:48:17Z")), "2026-10-26 03:48:17"); // summer
  assert.equal(stamp(U("2027-01-15T10:00:00Z")), "2027-01-15 12:00:00"); // winter
});

test("Cairo midnight and day keys around midnight UTC", () => {
  assert.equal(new Date(startOfDay(U("2026-10-26T00:48:17Z"))).toISOString(), "2026-10-25T21:00:00.000Z");
  assert.equal(dayKey(U("2026-10-25T21:30:00Z")), "2026-10-26");
  assert.equal(dayKey(U("2026-10-25T20:30:00Z")), "2026-10-25");
});

test("the day DST ends is 25 h long and day stepping stays on Cairo midnights", () => {
  // Egypt 2026: summer time ends on the last Thursday of October, clocks go back at midnight
  const days: string[] = [];
  let d = fromWall(2026, 10, 27);
  for (let i = 0; i < 5; i++) { days.push(`${dayKey(d)} ${new Date(d).toISOString().slice(11, 16)}`); d = addDays(d, 1); }
  assert.deepEqual(days.map((x) => x.slice(0, 10)), ["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
  const lengths = [];
  for (let s = fromWall(2026, 10, 27), i = 0; i < 4; i++) { const e = addDays(s, 1); lengths.push((e - s) / 36e5); s = e; }
  assert.ok(lengths.includes(25), `day lengths ${lengths}`);
  assert.equal(lengths.filter((h) => h === 24).length, 3);
});

test("the day DST starts is 23 h long", () => {
  const lengths = [];
  for (let s = fromWall(2026, 4, 22), i = 0; i < 8; i++) { const e = addDays(s, 1); lengths.push((e - s) / 36e5); s = e; }
  assert.ok(lengths.includes(23), `day lengths ${lengths}`);
});

test("a 7-day window across the DST change counts 7 days", () => {
  const w = { from: new Date(fromWall(2026, 10, 26)).toISOString(), to: new Date(fromWall(2026, 11, 2)).toISOString() };
  assert.equal(daysIn(w), 7);
  assert.equal(dayKeys(w).length, 7);
  assert.equal(dayKeys(w)[0], "2026-10-26");
  assert.equal(dayKeys(w)[6], "2026-11-01");
});
