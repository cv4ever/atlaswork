// The admin page (DEVELOPMENT.md, "Admin page"): the agents' defaults and exact system prompts, their tools, the limits and
// caps, the hosted project's operations figures and the design showcase, in one place. Dev server only, at
// /dev/admin/: `vite build` bundles index.html alone, so production never ships it. Its routes are dev/admin/server.ts.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { skin } from "../../src/skin.ts";
import "../../src/styles.css";
import "../../src/WorkbenchShell.css";
import Admin from "./Admin.tsx";
import "./admin.css";

skin.restoreStartup();
createRoot(document.getElementById("root")!).render(<StrictMode><Admin /></StrictMode>);
