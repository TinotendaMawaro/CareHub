import { test } from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_TYPE, readableOn, resolveShiftType } from "./shift-type";

const types = [
  { id: "std", name: "Standard", colour: "#0EA5E9", isDefault: true, sort: 0 },
  { id: "pc", name: "Personal care", colour: "#EC4899", isDefault: false, sort: 1 },
  { id: "sl", name: "Sleepover", colour: "#8B5CF6", isDefault: false, sort: 4 },
];

test("a shift's own type wins, then sleepover, then the default", () => {
  assert.equal(resolveShiftType({ shiftTypeId: "pc", isSleepover: true }, types).id, "pc");
  assert.equal(resolveShiftType({ isSleepover: true }, types).id, "sl");
  assert.equal(resolveShiftType({}, types).id, "std");
  // a deleted type falls back instead of showing nothing
  assert.equal(resolveShiftType({ shiftTypeId: "gone" }, types).id, "std");
  assert.equal(resolveShiftType({}, []), FALLBACK_TYPE);
});

test("text colour stays readable on light and dark tags", () => {
  assert.equal(readableOn("#FFFFFF"), "#000000");
  assert.equal(readableOn("#F59E0B"), "#000000");
  assert.equal(readableOn("#1E293B"), "#FFFFFF");
  assert.equal(readableOn("nonsense"), "#000000");
});
