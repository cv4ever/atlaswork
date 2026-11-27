import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, describeComputers, inputsIn, installerName, latestJson, nextVersion, prunable } from "./publish-desktop.mjs";

test("a release numbers the desktop app from what's published, unless the app starts a newer minor line (D85)", () => {
  assert.equal(nextVersion("0.6.0", null), "0.6.0", "the first publish is the app's own version");
  assert.equal(nextVersion("0.6.0", "0.6.0"), "0.6.1");
  assert.equal(nextVersion("0.6.0", "0.6.9"), "0.6.10", "patches count past 9");
  assert.equal(nextVersion("0.7.0", "0.6.12"), "0.7.0", "a minor line chosen by hand starts at its own number");
  assert.equal(nextVersion("1.0.0", "0.9.3"), "1.0.0");
  assert.equal(nextVersion("0.6.0", "0.7.2"), "0.7.3", "an older line in the app never goes back");
  assert.equal(compareVersions("0.6.10", "0.6.9"), 1, "versions compare by number, not as text");
});

test("only changes to the app, its build or what the helper compiles in need a new version (D85)", () => {
  const inputs = ["desktop/", ".env.production", "scripts/build-desktop.mjs", "src/model.ts"];
  assert.deepEqual(inputsIn(["desktop/helper/job.ts", "src/model.ts", "src/ChatViews.tsx", "docs/agents-design.md", ".env.production"], inputs),
    ["desktop/helper/job.ts", "src/model.ts", ".env.production"]);
  assert.deepEqual(inputsIn(["src/model.test.ts", "desktopish.md"], inputs), [], "a name that only starts the same isn't one");
});

test("latest.json names the installer with its signature, and only the newest two installers stay (D85)", () => {
  assert.deepEqual(latestJson({ version: "0.6.1", commit: "abcdef0123", signature: "sig", url: "https://x/Atlaswork_0.6.1_x64-setup.exe", at: "2026-11-25T23:00:00Z" }),
    { version: "0.6.1", notes: "Atlaswork 0.6.1 (abcdef0)", pub_date: "2026-11-25T23:00:00Z", platforms: { "windows-x86_64": { signature: "sig", url: "https://x/Atlaswork_0.6.1_x64-setup.exe" } } });
  const listed = ["latest.json", "published.json", installerName("0.6.9"), installerName("0.6.10"), installerName("0.6.2")];
  assert.deepEqual(prunable(listed), [installerName("0.6.2")], "0.6.10 and 0.6.9 stay, and the other files are never touched");
  assert.deepEqual(prunable([installerName("0.6.0")]), []);
});

test("the plan counts the computers seen in 30 days by version, newest first, behind ones marked, never named (D85)", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  const seen = (days, version) => ({ last_seen: new Date(now - days * 86_400_000).toISOString(), version });
  const rows = [seen(1, "0.6.2"), seen(2, "0.6.10"), seen(0, "0.6.10"), seen(3, null), seen(40, "0.5.0"), { last_seen: null, version: null }];
  assert.equal(describeComputers(rows, "0.6.10", now), "Computers seen in the last 30 days: 2 on 0.6.10, 1 on 0.6.2 (behind), 1 too old to update itself");
  assert.equal(describeComputers(rows, null, now), "Computers seen in the last 30 days: 2 on 0.6.10, 1 on 0.6.2, 1 too old to update itself",
    "nothing is behind before anything is published");
  assert.equal(describeComputers([seen(31, "0.6.0")], "0.6.0", now), "Computers: none seen in the last 30 days");
});
