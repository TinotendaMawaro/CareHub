import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, expiryLabel, expiryState, ownerKind, storagePath, ymdIn } from "./documents";

test("daysUntil counts calendar days and crosses month/year boundaries", () => {
  assert.equal(daysUntil("2026-11-17", "2026-11-17"), 0);
  assert.equal(daysUntil("2026-12-01", "2026-11-17"), 14);
  assert.equal(daysUntil("2027-01-01", "2026-12-31"), 1);
  assert.equal(daysUntil("2026-11-10", "2026-11-17"), -7);
});

test("expiryState: expires at end of day; 30-day warning window", () => {
  const today = "2026-11-17";
  assert.equal(expiryState(null, today), "none");
  assert.equal(expiryState("2026-11-16", today), "expired");
  assert.equal(expiryState("2026-11-17", today), "expiring");
  assert.equal(expiryState("2026-12-17", today), "expiring");
  assert.equal(expiryState("2026-12-18", today), "valid");
});

test("expiryLabel reads naturally", () => {
  const today = "2026-11-17";
  assert.equal(expiryLabel(null, today), "No expiry");
  assert.equal(expiryLabel("2026-11-16", today), "Expired yesterday");
  assert.equal(expiryLabel("2026-11-07", today), "Expired 10 days ago");
  assert.equal(expiryLabel("2026-11-17", today), "Expires today");
  assert.equal(expiryLabel("2026-11-18", today), "Expires tomorrow");
  assert.equal(expiryLabel("2026-11-27", today), "Expires in 10 days");
  assert.equal(expiryLabel("2027-06-01", today), "Expires 2027-06-01");
});

test("ymdIn uses the organisation timezone, not UTC", () => {
  // 2026-11-17 14:30 UTC is already the 18th in Sydney (UTC+11).
  assert.equal(ymdIn(new Date("2026-11-17T14:30:00Z"), "Australia/Sydney"), "2026-11-18");
  assert.equal(ymdIn(new Date("2026-11-17T14:30:00Z"), "UTC"), "2026-11-17");
});

test("ownerKind and storagePath", () => {
  assert.equal(ownerKind({ caregiver_id: "a", client_id: null }), "caregiver");
  assert.equal(ownerKind({ caregiver_id: null, client_id: "b" }), "client");
  assert.equal(ownerKind({ caregiver_id: null, client_id: null }), "organisation");
  assert.equal(storagePath("office", "My Plan (v2).pdf", 5), "office/5-My_Plan__v2_.pdf");
  assert.equal(storagePath("u1", "../../etc/passwd", 5), "u1/5-.._.._etc_passwd");
});
