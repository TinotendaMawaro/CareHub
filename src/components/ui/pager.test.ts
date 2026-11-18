import { test } from "node:test";
import assert from "node:assert/strict";
import { pageWindow } from "./pager";

test("pageWindow keeps first, last and neighbours with gaps", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(5, 10), [1, null, 4, 5, 6, null, 10]);
  assert.deepEqual(pageWindow(1, 10), [1, 2, null, 10]);
  assert.deepEqual(pageWindow(10, 10), [1, null, 9, 10]);
});
