import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRpcError } from "./shift-rpc";

test("parseRpcError splits a database 'code: message' error so the UI can branch on the code", () => {
  assert.deepEqual(parseRpcError(new Error("not_complete: this shift has not finished")), {
    code: "not_complete",
    message: "this shift has not finished",
  });
  assert.deepEqual(parseRpcError({ message: "worker_clash: an assigned staff member already has a shift\nat that time" }), {
    code: "worker_clash",
    message: "an assigned staff member already has a shift\nat that time",
  });
  assert.deepEqual(parseRpcError(new Error("plain failure")), { code: "error", message: "plain failure" });
});
