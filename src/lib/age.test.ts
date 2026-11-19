import { test } from "node:test";
import assert from "node:assert/strict";
import { ageFrom } from "./age";

test("ageFrom counts whole years and respects the birthday", () => {
  const today = new Date(2026, 10, 19); // 19 Nov 2026
  assert.equal(ageFrom("1998-11-19", today), 28);
  assert.equal(ageFrom("1998-11-20", today), 27);
  assert.equal(ageFrom("1998-12-01", today), 27);
  assert.equal(ageFrom("1998-01-01", today), 28);
});

test("ageFrom returns null for missing or bad dates", () => {
  assert.equal(ageFrom(null), null);
  assert.equal(ageFrom(""), null);
  assert.equal(ageFrom("not a date"), null);
  assert.equal(ageFrom("2999-01-01", new Date(2026, 0, 1)), null);
});
