import test from "node:test";
import assert from "node:assert/strict";
import { hasMarks, plainOf } from "./markdown.ts";

test("a reply's preview drops Markdown marks and keeps its words; plain text stays as it is", () => {
  const plain = "Plain words, 2 * 3 and snake_case_name; nothing to strip.";
  assert.equal(hasMarks(plain), false);
  assert.equal(plainOf(plain), plain);
  assert.equal(plainOf("**Bold** and *this* with `code` and [a link](https://example.com)."), "Bold and this with code and a link.");
  assert.equal(plainOf("Steps:\n- one\n2. two\n\n| Day | Km |\n|---|--:|\n| Mon | 5 |"), "Steps:\none\ntwo\n\nDay · Km\nMon · 5");
});
