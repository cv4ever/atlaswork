#!/usr/bin/env node
// Opens this computer's dev server on an Android phone over wireless debugging, without a release.
//
//   node dev/phone.mjs [port] [path]      → defaults: 5191 (pnpm dev), "/"
//
// The phone must have Wireless debugging on and be paired with this computer once (Developer options → Wireless
// debugging → Pair device with pairing code, then `adb pair <ip:port> <code>`). The script connects to the paired phone
// it finds on the network, maps the phone's localhost:<port> to this computer's (`adb reverse`), and opens it in Chrome.
// localhost is a secure context, so the service worker, microphone and install work as in production, and Vite's
// hot reload shows each saved change at once. chrome://inspect on the computer debugs the phone's tab.
// The phone keeps this origin's data apart from app.atlaswork.app: `?fresh` here never touches your real workspace.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const [port = "5191", path = "/"] = process.argv.slice(2);
const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk")]
  .filter(Boolean).map((root) => join(root, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb")).find(existsSync);
const adb = (...args) => execFileSync(sdk ?? "adb", args, { encoding: "utf8" }).trim();

const ready = () => adb("devices").split("\n").slice(1).some((line) => /\tdevice$/.test(line));
if (!ready()) {
  // A paired phone advertises its current port (it changes whenever Wireless debugging restarts).
  const found = adb("mdns", "services").match(/_adb-tls-connect\._tcp\s+(\S+:\d+)/);
  if (!found) throw new Error("No phone found: turn on Wireless debugging, keep the phone on this Wi-Fi, and pair it once (see the header).");
  console.log(adb("connect", found[1]));
}
if (!ready()) throw new Error("The phone did not accept the connection: pair it again (see the header).");
adb("reverse", `tcp:${port}`, `tcp:${port}`);
const url = `http://localhost:${port}${path}`;
adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `'${url}'`, "com.android.chrome");
console.log(`Opened ${url} on the phone. Unlock it to see the page; save a file and it reloads.`);
