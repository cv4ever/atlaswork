// Builds the desktop app's installer (agents-design D77): `pnpm run desktop:build`, after `desktop:helper`. Tauri signs
// the update it makes with the app's update key (D85), which comes from `TAURI_SIGNING_PRIVATE_KEY` and
// `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` when set, else from Bitwarden (WORKBENCH_DESKTOP_UPDATE_KEY and its password,
// through `bws` with the machine account in `BWS_ACCESS_TOKEN`), straight into the build's environment and never into
// a file or the output. Arguments go on to `tauri build`, e.g. `--config '{"version":"0.6.1"}'`.
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

/** Bitwarden secret ids of the update key and its password, in the `agents` project. */
const secrets = { TAURI_SIGNING_PRIVATE_KEY: "4c608d02-710f-4a4a-87bf-b50d016c947a", TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "94bb0898-fabc-46a4-aceb-b50d016c94f5" };

/** The machine account's token: this process's, else the Windows user's, which a shell started before it lacks. */
function bwsToken() {
  if (process.env.BWS_ACCESS_TOKEN) return process.env.BWS_ACCESS_TOKEN;
  if (process.platform !== "win32") return "";
  return execFileSync("powershell", ["-NoProfile", "-Command", "[Environment]::GetEnvironmentVariable('BWS_ACCESS_TOKEN','User')"], { encoding: "utf8" }).trim();
}

function signingKey() {
  if (process.env.TAURI_SIGNING_PRIVATE_KEY) return {};
  const token = bwsToken();
  if (!token) throw new Error("The update key is in Bitwarden (WORKBENCH_DESKTOP_UPDATE_KEY): set BWS_ACCESS_TOKEN, or TAURI_SIGNING_PRIVATE_KEY and its password.");
  return Object.fromEntries(Object.entries(secrets).map(([name, id]) => {
    const read = spawnSync("bws", ["secret", "get", id, "--output", "json"], { env: { ...process.env, BWS_ACCESS_TOKEN: token }, encoding: "utf8" });
    if (read.status !== 0) throw new Error(`Bitwarden didn't give ${name} (bws exited ${read.status}).`);
    return [name, JSON.parse(read.stdout).value];
  }));
}

const env = { ...process.env, ...signingKey() };
console.log("signing the update with the app's update key");
const cli = createRequire(import.meta.url).resolve("@tauri-apps/cli/tauri.js");
const built = spawnSync(process.execPath, [cli, "build", ...process.argv.slice(2)], { env, stdio: "inherit" });
process.exit(built.status ?? 1);
