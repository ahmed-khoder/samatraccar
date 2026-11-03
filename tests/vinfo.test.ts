import { test } from "node:test";
import assert from "node:assert/strict";
import { infoAttr } from "../lib/vinfo.ts";
import type { Device } from "../lib/types.ts";

test("attributes: trimmed strings only", () => {
  assert.equal(infoAttr({ attributes: { iccid: " 8920 " } } as unknown as Device, "iccid"), "8920");
  assert.equal(infoAttr({ attributes: { iccid: 5 } } as unknown as Device, "iccid"), "");
});
