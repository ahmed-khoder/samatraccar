// Red "no entry" sign: only for a tracker that was healthy and then went silent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lastPower, mergePower, silenceCause, stayStep, stillSince, type Stay } from "../lib/silence.ts";

const row = (attributes: Record<string, unknown>) => ({ attributes });

test("power connected, then silence -> network (the red sign)", () => {
  assert.equal(silenceCause([row({ charge: true, batteryLevel: 100 }), row({ motion: false })]), "network");
});

test("a power-cut alarm anywhere in the last messages -> power, whatever the battery says (device 8958)", () => {
  assert.equal(silenceCause([row({ charge: true, batteryLevel: 100 }), row({ charge: false, batteryLevel: 100, alarm: "powerCut,powerCut" })]), "power");
});

test("no external power and an empty battery -> power (device 1969: battery 0, not charging)", () => {
  assert.equal(silenceCause([row({ charge: false, batteryLevel: 0 }), row({ motion: false })]), "power");
});

test("running on its battery only is not proof either way", () => {
  assert.equal(silenceCause([row({ charge: false, batteryLevel: 80 })]), "unknown");
});

test("trackers that report no power data (gps103) get no verdict; a healthy battery alone counts as network", () => {
  assert.equal(silenceCause([row({ ignition: false, door: false })]), "unknown");
  assert.equal(silenceCause([]), "unknown");
  assert.equal(silenceCause([row({ batteryLevel: 90 })]), "network");
  assert.equal(silenceCause([row({ batteryLevel: 5 })]), "unknown");
});

test("only the last messages count: an old power alarm does not stick forever", () => {
  const old = row({ alarm: "powerCut" });
  const healthy = Array.from({ length: 12 }, () => row({ charge: true, batteryLevel: 100 }));
  assert.equal(silenceCause([old, ...healthy]), "network");
});

const at = (min: number, lat = 31.2, lng = 32.36) => ({ latitude: lat, longitude: lng, serverTime: new Date(Date.parse("2026-11-02T18:00:00Z") + min * 60000).toISOString() });

test("still since: the start of the unbroken stay at the last position", () => {
  // drives until minute 30, then stays (GPS noise of a few metres) until minute 90
  const rows = [at(0, 31.0), at(10, 31.05), at(30, 31.197), at(31, 31.20001), at(50, 31.20002, 32.36001), at(90)];
  const r = stillSince(rows)!;
  assert.equal(r.t, Date.parse(at(31).serverTime));
  assert.equal(r.atLeast, false);
});

test("still since: a stay that fills the whole window is 'at least' that long", () => {
  const r = stillSince([at(0), at(20), at(60)])!;
  assert.equal(r.t, Date.parse(at(0).serverTime));
  assert.equal(r.atLeast, true);
});

test("still since: a vehicle that was still moving, no rows, zero coordinates, unreadable times", () => {
  assert.equal(stillSince([at(0, 31.0), at(5, 31.2)]), null); // the last message is alone at its place
  assert.equal(stillSince([at(0)]), null);
  assert.equal(stillSince([]), null);
  assert.equal(stillSince([{ latitude: 0, longitude: 0, serverTime: "2026-11-02T18:00:00Z" }]), null);
  assert.equal(stillSince([{ ...at(0), serverTime: "garbage" }]), null);
});

test("still since: moving about inside the 300 m circle does not restart the stay; leaving it does", () => {
  const m = (min: number, metresNorth: number) => at(min, 31.2 + metresNorth / 111000);
  // 120 m from the last position is still the same place, 200 m is not
  assert.equal(stillSince([m(0, 0), m(20, 120), m(40, 60), m(60, 0)])!.t, Date.parse(m(0, 0).serverTime));
  assert.equal(stillSince([m(0, 200), m(20, 60), m(40, 0), m(60, 0)])!.t, Date.parse(m(20, 0).serverTime));
});

const stay = (o: Partial<Stay>): Stay => ({ at: 1_000_000, lat: 31.2, lng: 32.36, failed: false, still: null, ...o });
const here = { lat: 31.2, lng: 32.36 };
const far = { lat: 31.2 + 0.0027, lng: 32.36 }; // ~300 m away

test("stay cache: keep for 5 minutes, refresh after; one request at a time", () => {
  assert.deepEqual(stayStep(undefined, 1_000_000, here, false), { do: "fetch" });
  assert.deepEqual(stayStep(undefined, 1_000_000, here, true), { do: "join" });
  assert.deepEqual(stayStep(stay({}), 1_000_000 + 4 * 60000, here, false), { do: "keep" });
  assert.deepEqual(stayStep(stay({}), 1_000_000 + 5 * 60000, here, false), { do: "fetch" });
  assert.deepEqual(stayStep(stay({}), 1_000_000 + 5 * 60000, here, true), { do: "join" });
});

test("stay cache: leaving the circle asks again, but at most once a minute; a failure waits a minute", () => {
  assert.deepEqual(stayStep(stay({}), 1_000_000 + 20000, far, false), { do: "wait", ms: 40000 });
  assert.deepEqual(stayStep(stay({}), 1_000_000 + 60000, far, false), { do: "fetch" });
  assert.deepEqual(stayStep(stay({ failed: true }), 1_000_000 + 30000, far, false), { do: "keep" });
  assert.deepEqual(stayStep(stay({ failed: true }), 1_000_000 + 60000, here, false), { do: "keep" }); // TTL not over, not left
});

const pr = (min: number, attributes: Record<string, unknown>) => ({ attributes, serverTime: new Date(Date.parse("2026-11-02T18:00:00Z") + min * 60000).toISOString() });

test("last power: GPS rows without battery do not hide the last status message", () => {
  const w = lastPower([pr(0, { batteryLevel: 100, rssi: 4, charge: true }), pr(1, { sat: 9 }), pr(2, { sat: 8 })])!;
  assert.deepEqual(w, { batteryLevel: 100, rssi: 4, charge: true, at: Date.parse(pr(0, {}).serverTime) });
});

test("last power: each value comes from the newest row that has it; unreadable rows are skipped; none gives null", () => {
  const w = lastPower([pr(0, { batteryLevel: 90, charge: true }), pr(10, { rssi: 3 }), pr(20, { batteryLevel: 88, charge: false }), { attributes: { batteryLevel: 5 }, serverTime: "garbage" }])!;
  assert.equal(w.batteryLevel, 88); assert.equal(w.rssi, 3); assert.equal(w.charge, false);
  assert.equal(lastPower([pr(0, { sat: 9 })]), null);
  assert.equal(lastPower([pr(0, { batteryLevel: "x", rssi: NaN })]), null);
});

test("merge power: newer readings win, missing ones are filled from the older", () => {
  const old = { batteryLevel: 80, rssi: 2, charge: true, at: 1000 };
  assert.deepEqual(mergePower(old, { batteryLevel: 100, at: 2000 }), { batteryLevel: 100, rssi: 2, charge: true, at: 2000 });
  assert.deepEqual(mergePower(old, { batteryLevel: 50, rssi: 4, at: 500 }), { batteryLevel: 80, rssi: 2, charge: true, at: 1000 }); // an older reading never overrides
  assert.equal(mergePower(undefined, null), undefined);
  assert.deepEqual(mergePower(old, null), old);
});
