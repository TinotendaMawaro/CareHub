import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePolicy } from "./policy-body";

test("parsePolicy groups lists, keeps headings and fills in the organisation name", () => {
  const blocks = parsePolicy("# Title\n\n{{organisation}} cares.\n\n## Do\n- one\n- two\n\n1. first\n2. second\nEnd.", "Bright Care");
  assert.deepEqual(blocks, [
    { kind: "h", level: 1, text: "Title" },
    { kind: "p", text: "Bright Care cares." },
    { kind: "h", level: 2, text: "Do" },
    { kind: "ul", items: ["one", "two"] },
    { kind: "ol", items: ["first", "second"] },
    { kind: "p", text: "End." },
  ]);
});
