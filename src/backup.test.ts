import test from "node:test";
import assert from "node:assert/strict";
import { backupOf, backupReminderDue, readBackup } from "./backup.ts";
import { initialSession } from "./session.ts";
import { normalize } from "./workspace.ts";

test("a backup restores files and images byte for byte, with their names and types", async () => {
  const data = normalize(null).data;
  const bytes = new Uint8Array(70_000).map((_, at) => at % 251);
  data.notes = [{ id: "photo", domain: data.domains[0].name, projectId: "", title: "Photo", body: "", updatedAt: "", kind: "image",
    file: new File([bytes], "garden.png", { type: "image/png", lastModified: 1700000000000 }) }];
  const restored = readBackup(await (await backupOf(data, initialSession)).text());
  const file = restored.data.notes[0].file!;
  assert.ok(file instanceof File);
  assert.equal(file.name, "garden.png");
  assert.equal(file.type, "image/png");
  assert.equal(file.lastModified, 1700000000000);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  assert.equal(restored.missingFiles, 0);
  assert.deepEqual(restored.data.domains, data.domains);
  assert.deepEqual(restored.session, initialSession);
});

test("an older backup restores without the files it never kept, and other files are refused", () => {
  const data = normalize(null).data;
  const old = JSON.stringify({ version: 1, exportedAt: "2026-10-30T10:00:00.000Z", session: initialSession, data: { ...data,
    notes: [{ id: "receipts", domain: data.domains[0].name, projectId: "", title: "Receipts", body: "", updatedAt: "", kind: "file", file: {} }] } });
  const restored = readBackup(old);
  assert.equal(restored.missingFiles, 1);
  assert.equal(restored.data.notes[0].title, "Receipts");
  assert.ok(!("file" in restored.data.notes[0]));
  assert.throws(() => readBackup("not json"), /isn't a workspace backup/);
  assert.throws(() => readBackup(JSON.stringify({ version: 3, data })), /isn't a workspace backup/);
  assert.throws(() => readBackup(JSON.stringify({ version: 2, data: { notes: [] } })), /isn't a workspace backup/);
});

test("the first backup reminder waits three full days after content, not onboarding", () => {
  const firstContent = "2026-11-08T14:00:00.000Z";
  const due = Date.parse("2026-11-11T14:00:00.000Z");
  assert.equal(backupReminderDue("", null, null, due), false, "no content clock yet");
  assert.equal(backupReminderDue(firstContent, null, null, due - 1), false);
  assert.equal(backupReminderDue(firstContent, null, null, due), true);
});

test("a recent export and a snooze each postpone a reminder until their own boundary", () => {
  const firstContent = "2026-11-01T14:00:00.000Z";
  const lastBackup = "2026-11-08T14:00:00.000Z";
  const weeklyDue = Date.parse("2026-11-15T14:00:00.000Z");
  assert.equal(backupReminderDue(firstContent, lastBackup, null, weeklyDue - 1), false);
  assert.equal(backupReminderDue(firstContent, lastBackup, null, weeklyDue), true);
  const snoozedUntil = "2026-11-18T14:00:00.000Z";
  const snoozeEnds = Date.parse(snoozedUntil);
  assert.equal(backupReminderDue(firstContent, lastBackup, snoozedUntil, snoozeEnds - 1), false);
  assert.equal(backupReminderDue(firstContent, lastBackup, snoozedUntil, snoozeEnds), true);
});
