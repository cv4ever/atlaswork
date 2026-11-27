import assert from "node:assert/strict";
import { inQuietHours, payloadOf } from "./push.ts";

Deno.test("quiet hours follow the account's clock and wrap past midnight", () => {
  const at = (iso: string) => new Date(iso);
  // 21:00–08:00 in Lisbon (UTC in November).
  assert.equal(inQuietHours("Europe/Lisbon", at("2026-11-16T22:30:00Z"), 1260, 480), true);
  assert.equal(inQuietHours("Europe/Lisbon", at("2026-11-16T07:59:00Z"), 1260, 480), true);
  assert.equal(inQuietHours("Europe/Lisbon", at("2026-11-16T08:00:00Z"), 1260, 480), false);
  // 13:00 UTC is 08:00 in New York: the morning's push may go.
  assert.equal(inQuietHours("America/New_York", at("2026-11-16T13:00:00Z"), 1260, 480), false);
  assert.equal(inQuietHours("America/New_York", at("2026-11-16T12:30:00Z"), 1260, 480), true);
  // A window that doesn't wrap, and none at all.
  assert.equal(inQuietHours("UTC", at("2026-11-16T13:00:00Z"), 720, 840), true);
  assert.equal(inQuietHours("UTC", at("2026-11-16T13:00:00Z"), 600, 600), false);
});

Deno.test("a push names who and which routine, quotes the start and opens that chat", () => {
  const payload = payloadOf({ agent: "Atlas", kind: "check-in", threadId: "agent:atlas", text: "From your plan:  I added 2 tasks.\nUndo if it isn't right." });
  assert.deepEqual(payload, { title: "Atlas · Check-in", body: "From your plan: I added 2 tasks. Undo if it isn't right.", url: "/?do=open&thread=agent%3Aatlas", tag: "agent:atlas" });
  const long = payloadOf({ agent: "Vital", kind: "report", threadId: "room:x", text: "word ".repeat(60) });
  assert.equal(long.body.length, 140);
  assert.ok(long.body.endsWith("…"));
});
