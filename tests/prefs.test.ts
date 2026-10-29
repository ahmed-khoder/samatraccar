// Look-and-feel prefs are shared between devices; layout prefs are not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS, SYNCED_KEYS, normalizePrefs, pickSynced, sameSynced, parsePrefs } from "../lib/prefs-shared.ts";

test("only appearance settings are synced, layout stays per device", () => {
  for (const k of ["nav", "navMode", "list", "listMode", "ctl"]) assert.ok(!(SYNCED_KEYS as readonly string[]).includes(k), k);
  for (const k of ["colorMode", "iconSize", "autoScale", "labels", "cMoving", "theme"]) assert.ok((SYNCED_KEYS as readonly string[]).includes(k), k);
});

test("normalizePrefs repairs invalid input and never throws", () => {
  const p = normalizePrefs({ iconSize: 99, colorMode: "nonsense", cMoving: "red", labels: false, evil: "<script>" });
  assert.equal(p.iconSize, 2);
  assert.equal(p.colorMode, DEFAULT_PREFS.colorMode);
  assert.equal(p.cMoving, DEFAULT_PREFS.cMoving);
  assert.equal(p.labels, false);
  assert.ok(!("evil" in p));
});

test("pickSynced keeps only synced fields; sameSynced ignores layout", () => {
  const a = { ...DEFAULT_PREFS, nav: "top" as const, colorMode: "device" as const };
  assert.deepEqual(Object.keys(pickSynced(a)).sort(), [...SYNCED_KEYS].sort());
  assert.equal(sameSynced(a, { ...DEFAULT_PREFS, nav: "end" as const, colorMode: "device" as const }), true);
  assert.equal(sameSynced(a, DEFAULT_PREFS), false);
});

test("cookie parsing still works", () => {
  const raw = encodeURIComponent(JSON.stringify({ iconSize: 1.4, colorMode: "device" }));
  assert.equal(parsePrefs(raw).iconSize, 1.4);
  assert.equal(parsePrefs("%%%bad").colorMode, DEFAULT_PREFS.colorMode);
  assert.equal(parsePrefs(null), DEFAULT_PREFS);
});

test("approved defaults (settings screenshot)", () => {
  assert.deepEqual(DEFAULT_PREFS, {
    theme: "light", nav: "end", navMode: "hover", list: "start", listMode: "hover", limit: 80, trails: true, labels: true,
    tile: "light", geo: "server", colorMode: "state", cMoving: "#22c55e", cIdle: "#f59e0b", cStopped: "#70cfff", cOver: "#f01919",
    cOffline: "#64748b", autoScale: true, iconSize: 1.4, ctl: "auto",
  });
});

test("no saved value -> defaults; saved values (incl. old defaults and false) are kept", () => {
  assert.deepEqual(normalizePrefs({}), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs(undefined), DEFAULT_PREFS);
  const mine = { theme: "dark", nav: "start", limit: 100, tile: "auto", iconSize: 1, labels: false, trails: false, autoScale: false, cStopped: "#ef4444" };
  const p = normalizePrefs(mine);
  assert.deepEqual({ ...p }, { ...DEFAULT_PREFS, ...mine });
  assert.equal(parsePrefs(encodeURIComponent(JSON.stringify(mine))).theme, "dark");
});
