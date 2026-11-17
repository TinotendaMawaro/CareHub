import assert from "node:assert/strict";
import { test } from "node:test";
import { bandFromName, familyFromName, parsePriceBook } from "./price-book";

test("derives time bands from item names", () => {
  assert.deepEqual(bandFromName("Assistance With Self-Care Activities - Standard - Weekday Night"), { time_band: "weekday_night", is_sleepover: false });
  assert.deepEqual(bandFromName("Short Term Accommodation - Standard - Weekday Daytime"), { time_band: "weekday_day", is_sleepover: false });
  assert.deepEqual(bandFromName("Group Activities - Standard - Public Holiday"), { time_band: "public_holiday", is_sleepover: false });
  // Sleepover wins even though the name also says Night.
  assert.deepEqual(bandFromName("Assistance With Self-Care Activities - Night-Time Sleepover"), { time_band: "any", is_sleepover: true });
  assert.deepEqual(bandFromName("Assistive Technology Mentoring"), { time_band: "any", is_sleepover: false });
});

test("families drop the trailing band segment only", () => {
  assert.equal(familyFromName("Assistance With Self-Care Activities - Standard - Weekday Night").label, "Assistance With Self-Care Activities - Standard");
  assert.equal(familyFromName("Assistance With Self-Care Activities - Night-Time Sleepover").label, "Assistance With Self-Care Activities");
  assert.equal(familyFromName("Supports in Employment - Saturday").label, "Supports in Employment");
  assert.equal(familyFromName("Assistive Technology Mentoring").label, "Assistive Technology Mentoring");
  assert.equal(familyFromName("Supported Independent Living - High Intensity - Sunday").family_key, "supported_independent_living_high_intensity");
});

test("parses a headed CSV with dollar prices", () => {
  const text = [
    "Support Item Number,Support Item Name,Unit,National,Remote,Very Remote",
    '01_002_0107_1_1,"Assistance With Self-Care Activities - Standard - Weekday Night",Hour,$82.57,$115.60,$123.86',
    '01_010_0107_1_1,"Assistance With Self-Care Activities - Night-Time Sleepover",Each,$311.79,$436.51,$467.69',
    "Page 5 of 99",
    '01_013_0107_1_1,"Assistance With Self-Care Activities - Standard - Saturday",Hour,"$1,163.46",,',
  ].join("\n");
  const { rows, families, skipped } = parsePriceBook(text);
  assert.equal(rows.length, 3);
  assert.equal(skipped, 0);
  assert.equal(rows[0].time_band, "weekday_night");
  assert.equal(rows[0].price_national, 82.57);
  assert.equal(rows[1].is_sleepover, true);
  assert.equal(rows[1].unit, "Each");
  assert.equal(rows[2].price_national, 1163.46);
  assert.equal(rows[2].price_remote, null);
  assert.equal(families.length, 2);
});

test("parses tab-separated rows without a header and dedupes repeats", () => {
  const text = [
    "01_801_0115_1_1\tAssistance in Supported Independent Living - Standard - Weekday Daytime\tHour\t73.58\t103.01\t110.37",
    "01_801_0115_1_1\tAssistance in Supported Independent Living - Standard - Weekday Daytime\tHour\t74.00\t103.01\t110.37",
    "01_804_0115_1_1\tAssistance in Supported Independent Living - Standard - Saturday\tHour\t103.54\t144.96\t155.31",
    "no code here\tjunk\t\t\t\t",
  ].join("\n");
  const { rows, skipped } = parsePriceBook(text);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.item_number === "01_801_0115_1_1")?.price_national, 74);
  assert.ok(skipped >= 0);
});

test("maps the official catalogue shape where NSW stands in for the national price", () => {
  const text = [
    "Support Item Number,Support Item Name,Unit,NSW,Remote,Very Remote",
    '04_104_0125_6_1,"Access Community Social and Rec Activ - Standard - Weekday Daytime",Hour,73.58,103.01,110.37',
  ].join("\n");
  const { rows } = parsePriceBook(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price_national, 73.58);
  assert.equal(rows[0].family_key, "access_community_social_and_rec_activ_standard");
});

test("rows without a price are counted as skipped", () => {
  const { rows, skipped } = parsePriceBook("01_002_0107_1_1,Some Support - Weekday Daytime,Hour,notaprice\n");
  assert.equal(rows.length, 0);
  assert.equal(skipped, 1);
});
