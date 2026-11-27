import test from "node:test";
import assert from "node:assert/strict";
import { daysSpanned, sourcesOf } from "./sources.ts";

const today = "2026-11-23";

test("a calendar read leads the sources with its days, whatever order the reply used it in", () => {
  const [calendar, notes] = sourcesOf([{ tool: "read_notes", about: "dentist" }, { tool: "read_calendar", about: "2026-11-24/2026-11-30" }], today);
  assert.deepEqual([calendar.kind, calendar.connection, calendar.label, calendar.detail], ["calendar", true, "Checked Google Calendar", "Tue 24 – Mon 30 Nov"]);
  assert.deepEqual([notes.kind, notes.connection, notes.full], ["notes", false, "Read your notes, looking for “dentist”"]);
});

test("calendar days read as today, tomorrow, or a span across months, merged over every call", () => {
  assert.equal(sourcesOf([{ tool: "read_calendar", about: today }], today)[0].detail, "today");
  assert.equal(sourcesOf([{ tool: "free_time", about: "2026-11-24" }], today)[0].label, "Found free time in Google Calendar");
  assert.equal(sourcesOf([{ tool: "free_time", about: "2026-11-24" }], today)[0].detail, "tomorrow");
  const both = sourcesOf([{ tool: "read_calendar", about: "2026-11-28/2026-12-02" }, { tool: "free_time", about: "2026-11-25" }], today);
  assert.deepEqual([both.length, both[0].label, both[0].detail], [1, "Checked Google Calendar", "Wed 25 Nov – Wed 2 Dec"]);
  assert.deepEqual(both[0].days, ["2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"],
    "tapping the chip reads every day between the first and the last again");
  assert.equal(daysSpanned(["2026-11-01", "2026-12-31"]).length, 14, "never more than a calendar read covers");
});

test("a calendar that couldn't be read says why instead of claiming it was checked", () => {
  const [calendar] = sourcesOf([{ tool: "read_calendar", about: "2026-11-24/2026-11-30", failed: "unanswered" }], today);
  assert.deepEqual([calendar.label, calendar.detail, calendar.failed], ["Couldn't reach Google Calendar", undefined, "unanswered"]);
  const [revoked] = sourcesOf([{ tool: "read_calendar", about: today, failed: "unanswered" }, { tool: "free_time", about: today, failed: "disconnected" }], today);
  assert.deepEqual([revoked.label, revoked.failed], ["Google Calendar disconnected", "disconnected"], "a revoked grant wins: Reconnect fixes both");
  const [mixed] = sourcesOf([{ tool: "read_calendar", about: today, failed: "unanswered" }, { tool: "read_calendar", about: today }], today);
  assert.equal(mixed.label, "Checked Google Calendar", "one call that worked is a read");
});

test("files name what was opened, else what was searched; tools that change things are no source", () => {
  const [files] = sourcesOf([{ tool: "search_files", about: "receipts" }, { tool: "read_file", about: "Taxes/2025/receipts.md" }, { tool: "propose_tasks" }, { tool: "remember" }], today);
  assert.deepEqual([files.label, files.detail, files.full], ["Read a file", "receipts.md", "Searched for “receipts”. Read Taxes/2025/receipts.md"]);
  assert.equal(sourcesOf([{ tool: "search_files", about: "receipts" }], today)[0].label, "Searched your files");
  const computer = sourcesOf([{ tool: "search_computer", about: "bank letter" }, { tool: "read_file", about: "Documents/Banco/carta.pdf" }], today);
  assert.deepEqual(computer.map((source) => [source.kind, source.full]), [["files", "Searched for “bank letter”. Read Documents/Banco/carta.pdf"]],
    "a computer's search (D78) is a files source too");
  assert.deepEqual(sourcesOf([{ tool: "propose_tasks" }], today), []);
  assert.deepEqual(sourcesOf(undefined, today), []);
});

test("reads and searches on the account's computers name them, each file once, without the computer a search put first (D84)", () => {
  const [files] = sourcesOf([
    { tool: "search_computer", about: "banco", on: ["Office PC", "Laptop"] },
    { tool: "read_file", about: "Laptop: Papers/Banco/carta.docx", on: ["Laptop"] },
    { tool: "read_file", about: "Office PC: Documents/recibo.pdf", on: ["Office PC"] },
  ], today);
  assert.deepEqual([files.label, files.detail, files.full], ["Read 2 files on Laptop and Office PC", "carta.docx, recibo.pdf",
    "Searched Office PC and Laptop for “banco”. Read Papers/Banco/carta.docx on Laptop, Documents/recibo.pdf on Office PC"]);
  assert.equal(sourcesOf([{ tool: "search_computer", about: "banco", on: ["Office PC"] }], today)[0].label, "Searched Office PC");
  const [image] = sourcesOf([{ tool: "read_image", about: "Laptop: Photos/beach.jpg", on: ["Laptop"] }], today);
  assert.deepEqual([image.label, image.full], ["Looked at an image on Laptop", "Looked at an image on Laptop: Photos/beach.jpg"]);
});
