import { test } from "node:test";
import assert from "node:assert/strict";
import { occurrenceDates, minWorkers, isoWeekday } from "./recurrence";

// These cases mirror supabase/tests/db.test.mjs so the dialog preview and create_shifts() agree.
test("weekly Mon/Wed/Fri for two weeks gives 6 shifts", () => {
  const d = occurrenceDates("2027-03-01", { freq: "weekly", weekdays: [1, 3, 5], until: "2027-03-14" });
  assert.deepEqual(d, ["2027-03-01", "2027-03-03", "2027-03-05", "2027-03-08", "2027-03-10", "2027-03-12"]);
});

test("every other week with a count", () => {
  assert.deepEqual(occurrenceDates("2027-03-01", { freq: "weekly", interval: 2, weekdays: [1], count: 3, until: "2027-06-01" }), [
    "2027-03-01", "2027-03-15", "2027-03-29",
  ]);
});

test("daily with a count", () => {
  assert.equal(occurrenceDates("2027-04-05", { freq: "daily", count: 3 }).length, 3);
});

test("no repeat is a single date; bad ranges give none", () => {
  assert.deepEqual(occurrenceDates("2027-03-01", { freq: "none" }), ["2027-03-01"]);
  assert.deepEqual(occurrenceDates("2027-03-01", { freq: "daily", until: "2025-01-01" }), []);
  assert.deepEqual(occurrenceDates("2027-03-01", { freq: "daily", until: "2029-01-01" }), []);
});

test("weekday maths and ratio cover", () => {
  assert.equal(isoWeekday("2027-03-01"), 1); // Monday
  assert.equal(isoWeekday("2027-03-07"), 7); // Sunday
  assert.equal(minWorkers("1:4", 4), 1);
  assert.equal(minWorkers("1:2", 3), 2);
  assert.equal(minWorkers("1:1", 2), 2);
});
