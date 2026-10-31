// Vehicle markers glide between reported positions at the pace of the updates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { glideMs } from "../lib/glide.ts";

test("glides for the measured update interval", () => {
  assert.equal(glideMs(10000, 150), 10000);
  assert.equal(glideMs(25000, 400), 25000);
});

test("the glide stays between 1 and 30 seconds", () => {
  assert.equal(glideMs(200, 1), 1000);
  assert.equal(glideMs(60000, 500), 30000);
});

test("the first move after a pause does not crawl", () => {
  assert.equal(glideMs(90000, 100), 1000);
  assert.equal(glideMs(3600000, 100), 1000);
});

test("an impossible jump is not drawn as a slow drive", () => {
  assert.equal(glideMs(10000, 5000), 1000);
  assert.equal(glideMs(10000, 600), 10000); // 216 km/h is still driving
});
