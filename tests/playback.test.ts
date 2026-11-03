// Route playback: true point times, cleaning, parking stops and the play clock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, findStops, fromLocalInput, fromWire, indexAt, presetRange, timeAt, timeline, toLocalInput, toWire, trueTime, type Pt } from "../lib/playback.ts";

const T0 = Date.parse("2026-11-02T10:00:00Z");
const MIN = 60000, H = 36e5, WEEK = 7 * 864e5;

test("true time: a correct fix keeps its own time (not the later server receipt)", () => {
  assert.equal(trueTime(T0, T0 + 1500), T0);
  // a buffered fix uploaded an hour later is still dated when it was taken
  assert.equal(trueTime(T0, T0 + H), T0);
});

test("true time: UTC+8 tracker clocks and 2007-dated fixes are put back, using the server receipt as proof", () => {
  assert.equal(trueTime(T0 + 8 * H, T0 + 2000), T0);
  assert.equal(trueTime(T0 - 1024 * WEEK, T0 + 2000), T0);
  assert.equal(trueTime(T0 - 1024 * WEEK + 8 * H, T0 + 2000), T0); // both faults at once (before decoder.timezone was set)
  // a fix 3 h ahead is not one of the known faults: left alone
  assert.equal(trueTime(T0 + 3 * H, T0), T0 + 3 * H);
});

const row = (fixMs: number, o: Partial<{ srv: number; lat: number; lng: number; kn: number; valid: boolean; ign: boolean }> = {}) => ({
  fixTime: new Date(fixMs).toISOString(), serverTime: new Date(o.srv ?? fixMs + 1000).toISOString(),
  latitude: o.lat ?? 31.25, longitude: o.lng ?? 32.3, speed: o.kn ?? 0, course: 90, valid: o.valid ?? true, attributes: o.ign === undefined ? {} : { ignition: o.ign },
});

test("wire: ordered by true time, repeated fixes and zero points dropped, window applied after correction", () => {
  const w = toWire([
    row(T0 + 2 * MIN, { kn: 10 }),
    row(T0 + MIN, { ign: true }),
    row(T0 + MIN, { srv: T0 + 6 * MIN }), // status packet repeating the same fix
    { ...row(T0 + 3 * MIN), latitude: 0, longitude: 0 },
    row(T0 + 8 * H + 4 * MIN, { srv: T0 + 4 * MIN + 1000 }), // UTC+8 clock, really at +4 min
    row(T0 + 2 * H), // outside the window
  ], T0, T0 + H);
  assert.deepEqual(w.map((x) => (x[0] - T0) / MIN), [1, 2, 4]);
  assert.equal(fromWire(w[0]).ign, true);
  assert.equal(fromWire(w[1]).ign, undefined);
  assert.equal(fromWire(w[1]).kmh, 18.5); // 10 knots
});

const pt = (min: number, lat: number, kmh = 40, valid = true): Pt => ({ t: T0 + min * MIN, lat, lng: 32.3, kmh, course: 0, valid });
const north = (m: number) => 31.25 + m / 111195; // metres north of the base point
const off = (p: Pt): Pt => ({ ...p, ign: false }); // engine switched off at this point

test("drift removal drops impossible jumps and no-fix points elsewhere, keeps no-fix points at the same place; off keeps everything", () => {
  const pts = [pt(0, north(0)), pt(1, north(800)), pt(2, north(50_000)), pt(3, north(1600)), pt(4, north(2400), 40, false), pt(5, north(1610), 0, false)];
  assert.deepEqual(clean(pts, true).map((p) => (p.t - T0) / MIN), [0, 1, 3, 5]);
  assert.equal(clean(pts, false).length, 6);
});

test("drift removal keeps the arrival of a vehicle that parks without a GPS fix (8959 on 2 Nov at 15:17)", () => {
  // real sequence: last fix at 15:05:54, then no-fix points 70 m and 72 m on, standing still from 15:17:54
  const pts = [pt(0, north(0), 36), pt(2, north(70), 24, false), pt(12, north(142), 0, false), pt(12.2, north(142), 0, false), pt(38, north(156), 0)];
  const s = findStops(clean(pts, true), 3 * MIN, T0 + 60 * MIN);
  assert.equal((s[0].s - T0) / MIN, 12);
});

test("stops: from arrival to the first point seen leaving; shorter ones are not parking", () => {
  const pts = [
    pt(0, north(0)), pt(1, north(700)),
    pt(2, north(1400), 0), pt(2.5, north(1420), 1), // arrives at 10:02, nothing else while parked
    pt(30, north(1530), 5), off(pt(30.3, north(1530), 0)), // repositioned 130 m inside the yard at walking pace: still the same stop
    pt(40, north(1600)), // seen 200 m away at 10:40: it left
    pt(41, north(2300), 0), pt(42, north(2310), 0), pt(43, north(3000)), // a 2-minute halt
  ];
  const s = findStops(pts, 3 * MIN, T0 + 2 * H);
  assert.equal(s.length, 1);
  assert.equal((s[0].s - T0) / MIN, 2);
  assert.equal((s[0].e - T0) / MIN, 40);
  assert.equal(s[0].open, false);
  assert.equal(findStops(pts, MIN, T0 + 2 * H).length, 2);
});

test("stops: still parked at the end of the route lasts until the end of the window", () => {
  const pts = [pt(0, north(0)), pt(10, north(900), 0), pt(11, north(905), 0)];
  const s = findStops(pts, 3 * MIN, T0 + 60 * MIN);
  assert.equal(s.length, 1);
  assert.equal((s[0].e - T0) / MIN, 60);
  assert.equal(s[0].open, true);
});

test("play clock: real seconds between points, long gaps capped at a minute; index and time map back exactly", () => {
  const pts = [pt(0, north(0)), pt(0.5, north(300)), pt(120.5, north(310)), pt(121, north(600))];
  const tl = timeline(pts);
  assert.deepEqual(tl, [0, 30, 90, 120]);
  assert.equal(indexAt(tl, 0), 0);
  assert.equal(indexAt(tl, 60), 1.5);
  assert.equal(indexAt(tl, 999), 3);
  // halfway through the 2-hour stop, the clock shows halfway through its real time
  assert.equal((timeAt(pts, 1.5) - T0) / MIN, 60.5);
  assert.equal(timeAt(pts, 3), pts[3].t);
});

test("quick ranges in Cairo time: today, yesterday, weeks from Saturday, months", () => {
  const now = Date.parse("2026-11-03T08:30:00Z"); // Tuesday 10:30 in Cairo (UTC+2)
  const iso = (r: { from: number; to: number }) => [new Date(r.from).toISOString(), new Date(r.to).toISOString()];
  assert.deepEqual(iso(presetRange("today", now)), ["2026-11-02T22:00:00.000Z", "2026-11-03T08:30:00.000Z"]);
  assert.deepEqual(iso(presetRange("yesterday", now)), ["2026-11-01T22:00:00.000Z", "2026-11-02T22:00:00.000Z"]);
  assert.deepEqual(iso(presetRange("thisweek", now)), ["2026-10-30T22:00:00.000Z", "2026-11-03T08:30:00.000Z"]); // Saturday 31 Oct
  assert.deepEqual(iso(presetRange("lastweek", now)), ["2026-10-23T21:00:00.000Z", "2026-10-30T22:00:00.000Z"]); // Sat 24 Oct (summer time ended 29 Oct)
  assert.deepEqual(iso(presetRange("thismonth", now)), ["2026-10-31T22:00:00.000Z", "2026-11-03T08:30:00.000Z"]);
  assert.deepEqual(iso(presetRange("lastmonth", now)), ["2026-09-30T21:00:00.000Z", "2026-10-31T22:00:00.000Z"]);
});

test("datetime inputs are Cairo wall time to the minute, both ways", () => {
  const t = Date.parse("2026-11-02T20:11:00Z");
  assert.equal(toLocalInput(t), "2026-11-02T22:11");
  assert.equal(fromLocalInput("2026-11-02T22:11"), t);
  assert.ok(Number.isNaN(fromLocalInput("")));
});

test("stops: repositioning inside a yard is one stop; a stop at a light before driving on is not merged (9136 on 2 Nov)", () => {
  const pts = [
    pt(0, north(0), 30), pt(1, north(400), 8), off(pt(1.2, north(420), 0)), // parks 14:53
    pt(56, north(560), 6), off(pt(56.2, north(560), 0)), // moves 140 m at walking pace at 15:49, parks again
    pt(76, north(640), 8), off(pt(77, north(650), 0)), // and 90 m at 16:09
    pt(91, north(700), 7), pt(92, north(900), 24), pt(93, north(1300), 40), // leaves for real at 16:24
  ];
  const s = findStops(pts, 3 * MIN, T0 + 3 * H);
  assert.equal(s.length, 1);
  assert.equal((s[0].s - T0) / MIN, 1.2);
  assert.equal((s[0].e - T0) / MIN, 91); // creeping off at 7 km/h is already leaving
  // a 1-minute halt at a light 300 m before a parking, with normal driving in between, stays separate
  const light = [pt(0, north(0), 40), pt(1, north(500), 0), pt(2, north(510), 0), pt(2.5, north(700), 35), pt(3, north(800), 30), off(pt(3.2, north(810), 0)), pt(30, north(1100), 30)];
  const s2 = findStops(light, 0, T0 + 3 * H);
  assert.equal(s2.length, 2);
  assert.equal((s2[1].s - T0) / MIN, 3.2);
});

test("stops: the departure is when it starts moving off, not when it crosses the circle (9134 on 2 Nov at 14:27)", () => {
  const pts = [
    pt(0, north(0), 0), pt(24, north(1), 0), // parked from 10:00
    pt(24.02, north(2), 7), pt(24.4, north(30), 6), pt(25, north(70), 6), pt(25.3, north(90), 17), pt(25.7, north(160), 27), pt(26, north(330), 30),
  ];
  const s = findStops(pts, 3 * MIN, T0 + 3 * H);
  assert.equal(s.length, 1);
  assert.equal((s[0].e - T0) / MIN, 24.02);
});

test("stops: a single slow point while driving is not glued onto the parking that follows (2362 on 2 Nov at 00:09)", () => {
  const pts = [pt(0, north(0), 2), pt(2, north(63), 15), pt(4.5, north(356), 9), pt(5.5, north(415), 0), off(pt(5.7, north(415), 5)), pt(17.4, north(432), 10), pt(18, north(700), 19)];
  const s = findStops(pts, 3 * MIN, T0 + 3 * H);
  assert.equal(s.length, 1);
  assert.equal((s[0].s - T0) / MIN, 5.5);
});
