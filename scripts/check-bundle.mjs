// Fails when the production build carries a dev-only engine (dev/chatgpt/README.md, dev/echo), the admin page
// (dev/admin, DEVELOPMENT.md "Admin page"), the Agents page's Briefings tab (dev/briefings) or the large seed
// (dev/large, speed builds only). Run after `vite build`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The ChatGPT plan bridge stays out until OpenAI approves Atlaswork for hosted plan use (launch plan D16); the echo
// engine is only for the browser checks; the admin page writes source files and reads every account.
const markers = ["/api/chatgpt/", "workbench-chatgpt-token", "workbench.dev.chatgpt",
  "workbench.dev.echo", "Dev · echo", "large-topic", "/api/admin/", "workbench-admin-token", "briefings-table"];
const files = readdirSync("dist", { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(js|html|css)$/.test(entry.name))
  .map((entry) => join(entry.parentPath, entry.name));
const leaks = files.flatMap((file) => markers.filter((marker) => readFileSync(file, "utf8").includes(marker)).map((marker) => `${file}: ${marker}`));
if (!files.length) throw new Error("dist has no build output; run vite build first.");
if (leaks.length) {
  console.error(`The production bundle contains dev-only adapter code:\n${leaks.join("\n")}`);
  process.exit(1);
}
console.log(`Bundle clean: ${files.length} files, no dev adapter markers.`);
