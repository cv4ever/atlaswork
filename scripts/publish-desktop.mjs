// Publishes the desktop app's update (agents-design D85) in the project's public `desktop` bucket (migration
// 20261125230000_desktop_updates.sql), where the app reads `latest.json` hourly. A release ships a new version whenever
// the app's folder, its build or anything the helper compiles in changed since the published one (`desktopPlan`,
// which the release plan prints with the computers counted by version), numbered from the published version
// (`nextVersion`), and publishes it after the deploy: the installer first, then `latest.json` naming it with its
// signature, then `published.json` (the version and
// its commit, for the next plan), so a computer never reads a version whose installer isn't there yet. Only the
// newest two installers stay. It writes through the Storage API with the project's secret key, replacing each object
// in place (the Supabase CLI's `cp` refuses one that exists): with `--remote` the hosted project's, from
// `SUPABASE_SECRET_KEY` or else Bitwarden (WORKBENCH_SUPABASE_SECRET_KEY, through `bws`), else the local stack's.
// Usage: node scripts/publish-desktop.mjs --installer <path> --version <x.y.z> --commit <sha> [--remote]
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const bucket = "desktop";
export const installerName = (version) => `Atlaswork_${version}_x64-setup.exe`;
const root = fileURLToPath(new URL("..", import.meta.url));
const git = (...args) => execFileSync("git", args, { encoding: "utf8", cwd: root, maxBuffer: 64 * 1024 * 1024 }).trim();

/** The files whose change needs a new version: the app's folder (a folder input ends with "/"), its build, the hosted
 * project its release build reaches, and every module of this repo the helper compiles in. */
export function desktopInputs(at = root) {
  const graph = JSON.parse(execFileSync("deno", ["info", "--json", "--config", "desktop/helper/deno.json", "desktop/helper/main.ts"],
    { cwd: at, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  const helper = graph.modules.flatMap((module) => module.specifier?.startsWith("file:")
    ? [relative(at, fileURLToPath(module.specifier)).replaceAll("\\", "/")] : []);
  return ["desktop/", ".env.production", "scripts/build-helper.mjs", "scripts/build-desktop.mjs", ...new Set(helper)];
}

/** The changed files that are inputs. */
export const inputsIn = (files, inputs) => files.filter((file) => inputs.some((input) => input.endsWith("/") ? file.startsWith(input) : file === input));

const parts = (version) => version.split(".").map(Number);
/** a before b: -1, the same: 0, after: 1. */
export const compareVersions = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  return Math.sign(x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
};

/** The next version: the app's own (`tauri.conf.json`) when nothing was published or it starts a newer minor line,
 * chosen by hand, else the published one with its patch one up. */
export function nextVersion(own, published) {
  if (!published) return own;
  const [o, p] = [parts(own), parts(published)];
  if (o[0] > p[0] || (o[0] === p[0] && o[1] > p[1])) return own;
  return `${p[0]}.${p[1]}.${p[2] + 1}`;
}

/** What Tauri's updater reads: the version, its notes and date, and the installer with its signature. */
export const latestJson = ({ version, commit, signature, url, at }) => ({
  version, notes: `Atlaswork ${version} (${commit.slice(0, 7)})`, pub_date: at, platforms: { "windows-x86_64": { signature, url } },
});

/** The installers to remove: every one but the newest `keep`, so a computer midway through a download still finds it. */
export function prunable(names, keep = 2) {
  const versions = names.flatMap((name) => /^Atlaswork_(\d+\.\d+\.\d+)_x64-setup\.exe$/.exec(name)?.[1] ?? []);
  const newest = [...versions].sort((a, b) => compareVersions(b, a)).slice(0, keep);
  return versions.filter((version) => !newest.includes(version)).map(installerName);
}

/** The project's address: the hosted one from .env.production, else the local stack. */
export const baseOf = (remote, at = root) => remote
  ? /^VITE_SUPABASE_URL=(.*)$/m.exec(readFileSync(join(at, ".env.production"), "utf8"))[1].trim().replace(/\/+$/, "")
  : "http://127.0.0.1:54321";
const publicUrl = (base, name) => `${base}/storage/v1/object/public/${bucket}/${name}`;

/** What the bucket says was published, or null before the first one. */
export async function publishedOf(base) {
  const response = await fetch(publicUrl(base, "published.json"), { cache: "no-store" }).catch(() => null);
  return response?.ok ? response.json() : null;
}

/** What a release of `head` does for the desktop app: what's published, the commits since that change it, the
 * version it would publish (null when nothing changed it), and the computers' versions (or why they couldn't be read). */
export async function desktopPlan(head, remote = true, at = root) {
  const base = baseOf(remote, at);
  const published = await publishedOf(base);
  const computers = await computerVersions(base, remote).then((rows) => ({ rows }), (cause) => ({ error: String(cause?.message ?? cause).slice(0, 160) }));
  const own = JSON.parse(readFileSync(join(at, "desktop/src-tauri/tauri.conf.json"), "utf8")).version;
  if (!published) return { published: null, commits: ["(nothing published yet)"], next: own, computers };
  const files = inputsIn(git("diff", "--name-only", `${published.commit}..${head}`).split("\n").filter(Boolean), desktopInputs(at));
  const commits = files.length ? git("log", "--format=%h %s", `${published.commit}..${head}`, "--", ...files).split("\n").filter(Boolean) : [];
  return { published, commits, next: commits.length ? nextVersion(own, published.version) : null, computers };
}

/** Every computer's version and when it was last seen, read with the secret key: never a name or an account. */
async function computerVersions(base, remote) {
  const key = secretKey(remote);
  const response = await fetch(`${base}/rest/v1/computers?select=version,last_seen`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`computers answered ${response.status}`);
  return response.json();
}

/** How long ago a computer was last seen for the release plan to count it. */
const recentDays = 30;

/**
 * The computers as the release plan counts them (D85): those seen in the last 30 days by app version, newest first,
 * marking the ones behind the published version, and apart those whose helper never said one, an app from before
 * the updater that a person installs over by hand. Counts only, so the plan never names someone's computer.
 */
export function describeComputers(rows, published, now = Date.now()) {
  const recent = rows.filter((row) => row.last_seen && now - Date.parse(row.last_seen) < recentDays * 86_400_000);
  if (!recent.length) return `Computers: none seen in the last ${recentDays} days`;
  const counts = new Map();
  for (const row of recent) counts.set(row.version ?? "", (counts.get(row.version ?? "") ?? 0) + 1);
  const versions = [...counts.keys()].filter(Boolean).sort((a, b) => compareVersions(b, a));
  const parts = versions.map((version) => `${counts.get(version)} on ${version}${published && compareVersions(version, published) < 0 ? " (behind)" : ""}`);
  if (counts.has("")) parts.push(`${counts.get("")} too old to update ${counts.get("") === 1 ? "itself" : "themselves"}`);
  return `Computers seen in the last ${recentDays} days: ${parts.join(", ")}`;
}

export function describeDesktop({ published, commits, next, computers }) {
  const was = published ? `${published.version} published (${published.commit.slice(0, 7)})` : "nothing published yet";
  const line = next
    ? `Desktop app: ${was}; publishes ${next}${published ? `, ${commits.length} commit${commits.length === 1 ? "" : "s"} changing it\n${commits.map((line) => `  ${line}`).join("\n")}` : ""}`
    : `Desktop app: unchanged (${was})`;
  const seen = !computers ? "" : computers.rows ? describeComputers(computers.rows, published?.version) : `Computers: couldn't be read (${computers.error})`;
  return seen ? `${line}\n  ${seen}` : line;
}

/** Bitwarden's id of the hosted project's secret key (WORKBENCH_SUPABASE_SECRET_KEY). */
const secretKeyId = "ccc03721-97e5-4863-af60-b4f701742e0b";

/** The project's secret key, which writes to the bucket: never printed. */
function secretKey(remote) {
  if (!remote) {
    const status = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: process.platform === "win32" });
    return JSON.parse(status.slice(status.indexOf("{"), status.lastIndexOf("}") + 1)).SECRET_KEY;
  }
  return process.env.SUPABASE_SECRET_KEY ?? JSON.parse(execFileSync("bws", ["secret", "get", secretKeyId, "--output", "json"], { encoding: "utf8" })).value;
}

async function publish({ installer, version, commit, remote }) {
  const base = baseOf(remote);
  const key = secretKey(remote);
  const call = async (path, init) => {
    const response = await fetch(`${base}/storage/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, ...init.headers } });
    if (!response.ok) throw new Error(`Storage refused ${path}: ${response.status} ${(await response.text()).slice(0, 200)}`);
    return response.json();
  };
  const put = (name, body, type, cacheControl) => call(`object/${bucket}/${name}`,
    { method: "POST", body, headers: { "Content-Type": type, "cache-control": cacheControl, "x-upsert": "true" } });
  const signature = readFileSync(`${installer}.sig`, "utf8").trim();
  await put(installerName(version), readFileSync(installer), "application/octet-stream", "max-age=31536000");
  const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  await put("latest.json", JSON.stringify(latestJson({ version, commit, signature, url: publicUrl(base, installerName(version)), at })), "application/json", "no-cache");
  await put("published.json", JSON.stringify({ version, commit }), "application/json", "no-cache");
  const listed = await call(`object/list/${bucket}`, { method: "POST", body: JSON.stringify({ prefix: "", limit: 1000 }), headers: { "Content-Type": "application/json" } });
  const old = prunable(listed.map((item) => item.name));
  if (old.length) await call(`object/${bucket}`, { method: "DELETE", body: JSON.stringify({ prefixes: old }), headers: { "Content-Type": "application/json" } });
  // What a computer will read: the version, and the installer it names, whole.
  const read = await (await fetch(publicUrl(base, "latest.json"), { cache: "no-store" })).json();
  const head = await fetch(read.platforms["windows-x86_64"].url, { method: "HEAD" });
  if (read.version !== version || !head.ok || Number(head.headers.get("content-length")) !== statSync(installer).size)
    throw new Error(`The bucket doesn't serve ${version} as published (latest.json says ${read.version}, the installer answers ${head.status}).`);
  console.log(`Published the desktop app ${version} (${commit.slice(0, 7)})${old.length ? `, removing ${old.join(", ")}` : ""}: ${publicUrl(base, "latest.json")}`);
}

// Run as a script, from any path to it (a checkout reached through a junction has two).
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const arg = (name) => process.argv[process.argv.indexOf(`--${name}`) + 1];
  if (!process.argv.includes("--installer") || !process.argv.includes("--version") || !process.argv.includes("--commit"))
    throw new Error("Usage: node scripts/publish-desktop.mjs --installer <path> --version <x.y.z> --commit <sha> [--remote]");
  await publish({ installer: arg("installer"), version: arg("version"), commit: arg("commit"), remote: process.argv.includes("--remote") });
}
