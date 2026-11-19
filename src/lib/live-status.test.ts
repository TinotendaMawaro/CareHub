import { test } from "node:test";
import assert from "node:assert/strict";
import { barGeometry, liveState } from "./live-status";

const H = 3_600_000;
const base = { start: 10 * H, end: 14 * H };

test("liveState covers every stage of a shift", () => {
  assert.equal(liveState({ ...base, clockIn: null, clockOut: null, now: 9 * H }), "scheduled");
  assert.equal(liveState({ ...base, clockIn: null, clockOut: null, now: 10 * H + 4 * 60_000 }), "scheduled");
  assert.equal(liveState({ ...base, clockIn: null, clockOut: null, now: 10 * H + 6 * 60_000 }), "late");
  assert.equal(liveState({ ...base, clockIn: 10 * H, clockOut: null, now: 12 * H }), "on_shift");
  assert.equal(liveState({ ...base, clockIn: 10 * H, clockOut: null, now: 14 * H + 10 * 60_000 }), "on_shift");
  assert.equal(liveState({ ...base, clockIn: 10 * H, clockOut: null, now: 14 * H + 20 * 60_000 }), "overdue");
  assert.equal(liveState({ ...base, clockIn: 10 * H, clockOut: 14 * H, now: 15 * H }), "completed");
  assert.equal(liveState({ ...base, clockIn: null, clockOut: null, now: 15 * H }), "missed");
});

test("barGeometry clips to the window", () => {
  assert.deepEqual(barGeometry(0, 10, 0, 100), { left: 0, width: 10 });
  assert.deepEqual(barGeometry(-50, 10, 0, 100), { left: 0, width: 10 });
  assert.deepEqual(barGeometry(90, 150, 0, 100), { left: 90, width: 10 });
  assert.equal(barGeometry(100, 150, 0, 100), null);
});

test("packTracks stacks overlapping bars and reuses free tracks", async () => {
  const { packTracks } = await import("./live-status");
  const r = packTracks([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 10, end: 20 }, { start: 16, end: 18 }]);
  assert.equal(r.tracks, 2);
  assert.deepEqual(r.placed.map((p) => p.track), [0, 1, 0, 1]);
  assert.equal(packTracks([]).tracks, 1);
});
