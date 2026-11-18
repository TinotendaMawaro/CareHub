import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dayLabel, isoWeekday, mondayOf, weekDays, weekRangeLabel } from "./week";

test("weeks start on Monday and cross month and year ends", () => {
  assert.equal(isoWeekday("2026-11-16"), 1);
  assert.equal(isoWeekday("2026-11-22"), 7);
  assert.equal(mondayOf("2026-11-18"), "2026-11-16");
  assert.equal(mondayOf("2026-11-22"), "2026-11-16");
  assert.equal(mondayOf("2026-11-16"), "2026-11-16");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(weekDays("2026-12-28"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
});

test("labels", () => {
  assert.deepEqual(dayLabel("2026-11-18"), { weekday: "Wed", day: 18, month: "Nov" });
  assert.equal(weekRangeLabel("2026-11-16"), "16 - 22 Nov 2026");
  assert.equal(weekRangeLabel("2026-11-30"), "30 Nov - 6 Dec 2026");
  assert.equal(weekRangeLabel("2026-12-28"), "28 Dec 2026 - 3 Jan 2027");
});
