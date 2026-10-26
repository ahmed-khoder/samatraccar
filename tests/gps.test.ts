// Behaviour tests for live GPS handling. Run with `npm test` (Node's built-in runner, TypeScript stripped natively).
import { test } from "node:test";
import assert from "node:assert/strict";
import { clockAhead, deviceState, fixAt } from "../lib/format.ts";
import { mergePolled, mergePushed, newestSane } from "../lib/live-merge.ts";
import type { Position } from "../lib/types.ts";

const H = 36e5, now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const pos = (o: Partial<Position> & { id: number; deviceId: number }): Position => ({
  protocol: "gt06", serverTime: iso(now), deviceTime: iso(now), fixTime: iso(now), valid: true, latitude: 31.2, longitude: 32.3,
  altitude: 0, speed: 0, course: 0, address: null, accuracy: 0, attributes: {}, ...o,
});
const online = { status: "online" };

test("a fresh fix with speed is moving", () => {
  assert.equal(deviceState(online, { fixTime: iso(now - 5000), serverTime: iso(now - 4000), speed: 20, valid: true }), "moving");
});

test("an old fix repeated by a status packet is not moving, whatever its speed", () => {
  // tracker 9721: last real fix ~10 h ago at 14 km/h, still repeated every 5 min
  assert.equal(deviceState(online, { fixTime: iso(now - 10 * H), serverTime: iso(now - 60000), speed: 7.6, valid: true }), "stopped");
});

test("an invalid fix is shown as no GPS fix", () => {
  assert.equal(deviceState(online, { fixTime: iso(now - 5000), serverTime: iso(now), speed: 20, valid: false }), "nofix");
});

test("a pre-2020 fix is no GPS fix; offline stays offline", () => {
  assert.equal(deviceState(online, { fixTime: "1980-01-06T00:00:19Z", serverTime: iso(now), speed: 0 }), "nofix");
  assert.equal(deviceState({ status: "offline" }, { fixTime: iso(now), serverTime: iso(now), speed: 20 }), "offline");
});

test("UTC+8 tracker: a live fix (whole-hour offset) counts as measured on arrival", () => {
  const p = { fixTime: iso(now - 2000 + 8 * H), serverTime: iso(now - 2000) };
  assert.equal(clockAhead(p), true);
  assert.equal(fixAt(p), p.serverTime);
  assert.equal(deviceState(online, { ...p, speed: 20, valid: true }), "moving");
});

test("UTC+8 tracker: a repeated old location has an unknown age and is not moving", () => {
  const p = { fixTime: iso(now + 3 * H + 17 * 60000), serverTime: iso(now) };
  assert.equal(fixAt(p), null);
  assert.equal(deviceState(online, { ...p, speed: 20, valid: true }), "stopped");
});

test("a normal clock uses the fix time", () => {
  const p = { fixTime: iso(now - 40 * 60000), serverTime: iso(now) };
  assert.equal(clockAhead(p), false);
  assert.equal(fixAt(p), p.fixTime);
});

test("push: a newer position replaces, an older one is ignored", () => {
  const cur = [pos({ id: 10, deviceId: 1 }), pos({ id: 20, deviceId: 2 })];
  const out = mergePushed(cur, [pos({ id: 11, deviceId: 1 }), pos({ id: 19, deviceId: 2 })]);
  assert.deepEqual(out.map((p) => p.id).sort((a, b) => a - b), [11, 20]);
});

test("push: a clock-ahead status packet never replaces a sane fix (transition after the timezone fix)", () => {
  const real = pos({ id: 100, deviceId: 73, fixTime: iso(now - 3000), serverTime: iso(now - 2000) });
  const stuck = pos({ id: 101, deviceId: 73, fixTime: iso(now + 6 * H), serverTime: iso(now) });
  assert.equal(mergePushed([real], [stuck])[0].id, 100);
});

test("poll: device list comes from the poll, a newer pushed position is kept, nothing rolls back", () => {
  const pushed = [pos({ id: 50, deviceId: 1 }), pos({ id: 7, deviceId: 9 })];
  const polled = [pos({ id: 49, deviceId: 1 }), pos({ id: 30, deviceId: 2 })];
  const out = mergePolled(pushed, polled);
  assert.deepEqual(out.map((p) => [p.deviceId, p.id]), [[1, 50], [2, 30]]);
});

test("transition: the newest sane fix wins over a status packet that re-copied the stuck future location", () => {
  const H8 = 8 * H;
  const list = [
    pos({ id: 1, deviceId: 73, fixTime: iso(now - 9 * H + H8), serverTime: iso(now - 9 * H) }), // old, before the fix (+8 h)
    pos({ id: 5, deviceId: 73, fixTime: iso(now - 20 * 60000), serverTime: iso(now - 20 * 60000 + 1000), latitude: 30.1 }), // corrected
    pos({ id: 6, deviceId: 73, fixTime: iso(now - 15 * 60000), serverTime: iso(now - 15 * 60000 + 1000), latitude: 30.2 }), // corrected
    pos({ id: 9, deviceId: 73, fixTime: iso(now + 5 * H), serverTime: iso(now) }), // status packet copying the stuck fix
  ];
  assert.equal(newestSane(list)?.id, 6);
  assert.equal(newestSane([list[0], list[3]]), null); // nothing corrected yet: keep Traccar's latest
  assert.equal(newestSane([], list[2])?.id, 6); // incremental query with no news keeps the previous one
});

test("transition: an old status packet that only looks sane is ignored when it arrived before the correction", () => {
  const since = now - 60 * 60000;
  // parked > 8 h before the fix: its copies carry (old fix + 8 h), which is already in the past when they arrive
  const oldCopy = pos({ id: 3, deviceId: 73, fixTime: iso(now - 2 * H - 5 * 60000), serverTime: iso(now - 2 * H) });
  assert.equal(newestSane([oldCopy], null, since), null);
  const real = pos({ id: 8, deviceId: 73, fixTime: iso(now - 10 * 60000), serverTime: iso(now - 10 * 60000 + 900) });
  assert.equal(newestSane([oldCopy, real], null, since)?.id, 8);
});
