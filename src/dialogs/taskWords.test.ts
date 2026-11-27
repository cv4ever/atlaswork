import assert from "node:assert/strict";
import test from "node:test";
import { readTaskWords } from "./taskWords.ts";

// Sunday 22 November 2026.
const today = "2026-11-22";

test("a title names its day, time and length, and keeps the rest as the title", () => {
  assert.deepEqual(readTaskWords("Call the clinic tomorrow at 16:30 for 15 min", today),
    { title: "Call the clinic", due: "2026-11-23", at: "16:30", length: 15, found: ["tomorrow", "at 16:30", "for 15 min"] });
  assert.deepEqual(readTaskWords("Pay rent on Friday at 9am", today), { title: "Pay rent", due: "2026-11-27", at: "09:00", found: ["on Friday", "at 9am"] });
  assert.deepEqual(readTaskWords("Stretch tonight for half an hour", today), { title: "Stretch", due: today, at: "evening", length: 30, found: ["tonight", "for half an hour"] });
  assert.deepEqual(readTaskWords("Read the lease this afternoon for 1.5 hours", today), { title: "Read the lease", at: "afternoon", length: 90, found: ["this afternoon", "for 1.5 hours"] });
});

test("words that can be part of a name stay in it", () => {
  for (const title of ["Morning run", "Friday drinks plan", "Buy sun cream", "Book 3 tickets", "Today's list", "Sat nav update"])
    assert.deepEqual(readTaskWords(title, today), { title, found: [] });
});

test("a weekday naming today means the one a week on; 'at 4' is the afternoon", () => {
  assert.equal(readTaskWords("Team call on Sunday", today).due, "2026-11-29");
  assert.equal(readTaskWords("Pick up the bike at 4", today).at, "16:00");
  assert.equal(readTaskWords("Long ride for 3 hours", today).length, 120);
});
