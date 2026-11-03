import { test } from "node:test";
import assert from "node:assert/strict";
import { visualState } from "../lib/format.ts";

test("a vehicle that stopped reporting is drawn as stopped, whatever its last speed or ignition said", () => {
  for (const base of ["offline", "unknown"]) {
    assert.equal(visualState(base, 0, 80), "stopped");
    assert.equal(visualState(base, 95, 80, true), "stopped");
  }
  assert.equal(visualState("moving", 95, 80), "over");
  assert.equal(visualState("stopped", 0, 80, true), "idle");
});
