import assert from "node:assert/strict";
import { checkSignup } from "./logic.ts";

Deno.test("a signup is normalised and keeps its source and token", () => {
  assert.deepEqual(checkSignup('{"email":" Ana@Example.COM ","source":"linkedin:post:hero","token":"t"}'),
    { email: "ana@example.com", source: "linkedin:post:hero", token: "t" });
});

Deno.test("a signup without a Turnstile token is refused", () => {
  assert.ok("error" in checkSignup('{"email":"ana@example.com","source":""}'));
});

Deno.test("an email or source the table would refuse is refused first", () => {
  assert.ok("error" in checkSignup('{"email":"not-an-email","token":"t"}'));
  assert.ok("error" in checkSignup('{"email":"ana@example.com","source":"<x>::hero","token":"t"}'));
  assert.ok("error" in checkSignup("not json"));
});
