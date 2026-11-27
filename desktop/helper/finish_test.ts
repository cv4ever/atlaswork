import assert from "node:assert/strict";
import { finishing } from "./finish.ts";

Deno.test("asked to finish while idle, the helper stops at once (D85)", () => {
  const finish = finishing();
  assert.equal(finish.begin(), true);
  assert.equal(finish.end(), false, "work that ended with nothing asked goes on");
  assert.equal(finish.ask(), true, "between work, an ask stops it now");
});

Deno.test("asked to finish mid-job, the helper ends the job, then stops and starts nothing new (D85)", () => {
  const finish = finishing();
  assert.equal(finish.begin(), true);
  assert.equal(finish.ask(), false, "the job it holds isn't cut short");
  assert.equal(finish.end(), true, "it stops once the job ends");
  assert.equal(finish.begin(), false, "and no work starts after the ask");
});
