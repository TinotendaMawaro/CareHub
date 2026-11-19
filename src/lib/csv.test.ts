import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "./csv";

test("csvCell quotes commas, quotes and line breaks", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("Smith, Jo"), '"Smith, Jo"');
  assert.equal(csvCell('said "hi"'), '"said ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(12.5), "12.5");
});

test("csvCell blocks spreadsheet formulas but keeps negative numbers", () => {
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell("-12.50"), "-12.50");
});

test("toCsv joins rows with CRLF", () => {
  assert.equal(toCsv([["a", "b"], ["1", "x,y"]]), 'a,b\r\n1,"x,y"');
});
