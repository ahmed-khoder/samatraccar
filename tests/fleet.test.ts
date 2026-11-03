// Phone fleet views: navigation link, list tabs and unread alerts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, fleetTab, isUnread, mapsDirections, neighbour } from "../lib/fleet.ts";

test("navigation opens Google Maps driving directions to the vehicle", () => {
  assert.equal(mapsDirections(29.5235871, 30.8767052), "https://www.google.com/maps/dir/?api=1&destination=29.523587,30.876705&travelmode=driving");
});

test("only connected vehicles are in the online tab", () => {
  assert.equal(fleetTab("online"), "online");
  assert.equal(fleetTab("offline"), "offline");
  assert.equal(fleetTab("unknown"), "offline");
});

test("alerts after the last visit are unread; unreadable times are not", () => {
  const seen = Date.parse("2026-11-02T10:00:00Z");
  assert.equal(isUnread("2026-11-02T10:00:01Z", seen), true);
  assert.equal(isUnread("2026-11-02T09:59:59Z", seen), false);
  assert.equal(isUnread("garbage", seen), false);
});

test("distance between two points in km", () => {
  assert.equal(distanceKm({ lat: 30, lng: 31 }, { lat: 30, lng: 31 }), 0);
  assert.ok(Math.abs(distanceKm({ lat: 30.0444, lng: 31.2357 }, { lat: 31.2001, lng: 29.9187 }) - 179) < 3); // Cairo - Alexandria
});

test("next / previous vehicle wraps around and starts from the ends when nothing is selected", () => {
  const ids = [5, 7, 9];
  assert.equal(neighbour(ids, 5, 1), 7);
  assert.equal(neighbour(ids, 9, 1), 5);
  assert.equal(neighbour(ids, 5, -1), 9);
  assert.equal(neighbour(ids, null, 1), 5);
  assert.equal(neighbour(ids, null, -1), 9);
  assert.equal(neighbour(ids, 42, 1), 5); // a vehicle that is not in the list
  assert.equal(neighbour([], 5, 1), null);
});

test("fleet bar counts: connected, silent, moving and engine-on (connected only)", async () => {
  const { fleetCounts } = await import("../lib/fleet.ts");
  const c = fleetCounts([
    { status: "online", base: "moving", ignition: true },
    { status: "online", base: "stopped", ignition: true },
    { status: "online", base: "stopped", ignition: false },
    { status: "online", base: "stopped" },
    { status: "offline", base: "offline", ignition: true },
    { status: "unknown", base: "unknown" },
  ]);
  assert.deepEqual(c, { total: 6, online: 4, offline: 2, moving: 1, engineOn: 2 });
});

test("every bar tile filters to exactly the vehicles it counts", async () => {
  const { fleetCounts, matchesFilter } = await import("../lib/fleet.ts");
  const rows = [
    { status: "online", base: "moving", ignition: true }, { status: "online", base: "stopped", ignition: true },
    { status: "online", base: "stopped", ignition: false }, { status: "offline", base: "offline", ignition: true }, { status: "unknown", base: "unknown" },
  ];
  const c = fleetCounts(rows);
  assert.equal(rows.filter((r) => matchesFilter("all", r)).length, c.total);
  assert.equal(rows.filter((r) => matchesFilter("online", r)).length, c.online);
  assert.equal(rows.filter((r) => matchesFilter("offline", r)).length, c.offline);
  assert.equal(rows.filter((r) => matchesFilter("moving", r)).length, c.moving);
  assert.equal(rows.filter((r) => matchesFilter("engine", r)).length, c.engineOn);
});
