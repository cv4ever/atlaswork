import test from "node:test";
import assert from "node:assert/strict";
import { launchIntentOf, sharedText } from "./launch.ts";

const at = (search: string) => launchIntentOf(new URL(`https://app.atlaswork.app/${search}`));

test("a shared page saves as a link, wherever the app put its address", () => {
  // Chrome on Android sends the page title and puts the address in `text`.
  assert.equal(sharedText("Kale soup", "https://example.com/soup"), "https://example.com/soup");
  assert.equal(sharedText("Kale soup", "", "https://example.com/soup"), "https://example.com/soup");
  assert.equal(sharedText("Kale soup", "Kale soup https://example.com/soup"), "https://example.com/soup");
});

test("shared words keep every part once, so they save as a note", () => {
  assert.equal(sharedText("", "Buy oat milk"), "Buy oat milk");
  assert.equal(sharedText("Recipe", "Try this tonight https://example.com/soup"), "Recipe\nTry this tonight https://example.com/soup");
  assert.equal(sharedText("Recipe", "Try this tonight", "https://example.com/soup"), "Recipe\nTry this tonight\nhttps://example.com/soup");
});

test("the address bar says what the app was opened to do", () => {
  assert.deepEqual(at("?share_title=Soup&share_text=https%3A%2F%2Fexample.com%2Fsoup"), { kind: "share", text: "https://example.com/soup" });
  assert.equal(at("?share_text="), null);
  assert.deepEqual(at("?do=atlas"), { kind: "atlas" });
  assert.deepEqual(at("?do=needs&tab=today"), { kind: "needs" });
  assert.equal(at("?do=delete"), null);
  assert.equal(at("?tab=today"), null);
  // A routine's notification (D55) opens its chat; anything that isn't a chat id opens nothing.
  assert.deepEqual(at("?do=open&thread=agent%3Aatlas"), { kind: "open", thread: "agent:atlas" });
  assert.equal(at("?do=open&thread=javascript%3Aalert(1)"), null);
  assert.equal(at("?do=open"), null);
});
