// The design showcase (README, "Design showcase"): every token, part and widget of the design system, drawn by the
// app's own stylesheets and components over the demo workspace held in memory. Dev server only, at /dev/design/:
// `vite build` bundles index.html alone, so production never ships it. Nothing here reads or writes the workspace.
import "./clock.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { skin } from "../../src/skin.ts";
import "../../src/styles.css";
import "../../src/WorkbenchShell.css";
import Showcase from "./Showcase.tsx";
import "./design.css";

skin.restoreStartup();
createRoot(document.getElementById("root")!).render(<StrictMode><Showcase /></StrictMode>);
