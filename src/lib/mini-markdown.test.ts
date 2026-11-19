import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseMarkdown, safeHref, toPlainText } from "./mini-markdown";

test("headings, lists and paragraphs", () => {
  const b = parseMarkdown("# Arrival\nKey is in the lockbox.\nCode 1234\n\n- Shoes off\n- Wash hands\n1. Meds\n2. Lunch");
  assert.deepEqual(b.map((x) => x.t), ["h", "p", "ul", "ol"]);
  assert.deepEqual((b[1] as any).c, [{ t: "text", v: "Key is in the lockbox.\nCode 1234" }]);
  assert.equal((b[2] as any).items.length, 2);
  assert.equal((b[3] as any).items.length, 2);
});

test("bold, italic and links", () => {
  assert.deepEqual(parseInline("**Do not** leave *alone*"), [
    { t: "b", c: [{ t: "text", v: "Do not" }] }, { t: "text", v: " leave " }, { t: "i", c: [{ t: "text", v: "alone" }] },
  ]);
  const l = parseInline("See [the plan](https://example.com/plan) or www.ndis.gov.au.");
  assert.equal(l[1].t, "link");
  assert.equal((l[1] as any).href, "https://example.com/plan");
  assert.equal((l[3] as any).href, "https://www.ndis.gov.au");
  assert.deepEqual(l[4], { t: "text", v: "." }, "trailing full stop is not part of the link");
});

test("unsafe links stay as text", () => {
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.deepEqual(parseInline("[x](javascript:alert(1))")[0].t, "text");
  assert.equal(safeHref("tel:+61 400 000 000"), "tel:+61 400 000 000");
});

test("snake_case words and lone asterisks are not italic", () => {
  assert.deepEqual(parseInline("use file_name_here and 2 * 3 * 4"), [{ t: "text", v: "use file_name_here and 2 * 3 * 4" }]);
});

test("plain text preview", () => {
  assert.equal(toPlainText("# Hi\n- **one**\n- two"), "Hi • one • two");
});
