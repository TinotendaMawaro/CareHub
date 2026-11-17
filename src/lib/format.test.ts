import { test } from "node:test";
import assert from "node:assert/strict";
import { isoToZonedInput, zonedToIso } from "./format";
import { hexToHslTriple } from "../hooks/use-organisation";

test("zoned conversions agree with the database's Sydney time bands", () => {
  // 2027-03-01 06:00 in Sydney (AEDT, UTC+11) is 19:00 UTC the day before.
  assert.equal(zonedToIso("2027-03-01T06:00", "Australia/Sydney"), "2027-02-28T19:00:00.000Z");
  // 2027-05-03 10:00 in Sydney (AEST, UTC+10) is 00:00 UTC.
  assert.equal(zonedToIso("2027-05-03T10:00", "Australia/Sydney"), "2027-05-03T00:00:00.000Z");
  assert.equal(isoToZonedInput("2027-05-03T00:00:00.000Z", "Australia/Sydney"), "2027-05-03T10:00");
  assert.equal(isoToZonedInput(zonedToIso("2027-10-04T18:00", "Australia/Sydney"), "Australia/Sydney"), "2027-10-04T18:00");
});

test("brand colour to HSL token", () => {
  assert.equal(hexToHslTriple("#ff0000"), "0 100% 50%");
  assert.equal(hexToHslTriple("nope"), null);
});
