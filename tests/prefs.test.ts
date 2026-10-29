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
