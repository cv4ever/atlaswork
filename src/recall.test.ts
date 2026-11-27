import test from "node:test";
import assert from "node:assert/strict";
import { recall, wordsOf } from "./recall.ts";

/** `count` memories about nothing in particular, an hour apart in November, the newest last. */
const filler = (count: number) => Array.from({ length: count }, (_, index) =>
  ({ text: `Likes walk number ${index}`, at: new Date(Date.UTC(2026, 10, 1) + index * 3_600_000).toISOString() }));
const newestFirst = <T extends { at: string }>(memories: T[]) => [...memories].sort((a, b) => b.at.localeCompare(a.at));

test("up to the limit every memory is read, newest first, whatever the message (D49, D80)", () => {
  const memories = [{ text: "Older", at: "2026-11-01T10:00:00.000Z" }, { text: "Newer", at: "2026-11-02T10:00:00.000Z" }];
  assert.deepEqual(recall(memories, "anything", 40).map((memory) => memory.text), ["Newer", "Older"]);
});

test("past the limit the memories matching the message go, even old ones, and the rest by age (D80)", () => {
  const old = [
    { text: "The 2025 receipts are in the Taxes folder", at: "2026-01-01T00:00:00.000Z" },
    { text: "Farmácia Central is the usual pharmacy", at: "2026-01-02T00:00:00.000Z" },
  ];
  const memories = [...old, ...filler(45)];
  const read = recall(memories, "Where are my RECEIPT for taxes? And the farmacia?", 40);
  assert.equal(read.length, 40);
  assert.deepEqual(read.slice(0, 38), newestFirst(filler(45)).slice(0, 38), "the rest are the newest, newest first");
  assert.deepEqual(read.slice(38).map((memory) => memory.text), [old[1].text, old[0].text],
    "a word and its plural, without case or accents, and the picked ones keep their place by age");
  assert.deepEqual(recall(memories, "the and what", 40), newestFirst(memories).slice(0, 40), "common words match nothing, so the newest go");
});

test("a memory's place counts when the caller says so, and one that matches nothing waits its turn by age (D80)", () => {
  const memories = [
    { text: "Prefers mornings", at: "2026-01-01T00:00:00.000Z", place: "Health / Annual check-up" },
    { text: "Prefers evenings", at: "2026-01-02T00:00:00.000Z", place: "Finance" },
    ...filler(40).map((memory) => ({ ...memory, place: "" })),
  ];
  const read = recall(memories, "When is the check-up?", 40, (memory) => `${memory.text} ${memory.place}`);
  assert.ok(read.some((memory) => memory.text === "Prefers mornings"));
  assert.ok(!read.some((memory) => memory.text === "Prefers evenings"));
});

test("the words that count drop case, accents, short and common words, once each", () => {
  assert.deepEqual(wordsOf("Onde está o CRÉDITO da casa? O crédito!"), ["credito", "casa"]);
});
