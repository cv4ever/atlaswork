import { execSync } from "node:child_process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { adminPlugin } from "./dev/admin/server.ts";
import { chatGptPlugin } from "./dev/chatgpt/server.ts";
import { emblemAssets } from "./dev/emblemAssets.ts";

export default defineConfig(({ command, mode }) => {
  // omp runs on Bun, which loads .env.local from the folder it starts in into its own environment and every shell it
  // opens. That frozen copy of VITE_* would beat the mode's env files (Vite lets process.env win), so a `--mode e2e`
  // server kept talking to the hosted project. Here the env files win; a VITE_* only the shell sets still passes.
  const shell = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("VITE_")));
  for (const key of Object.keys(shell)) delete process.env[key];
  const files = loadEnv(mode, process.cwd(), "VITE_");
  Object.assign(process.env, shell, files);
  // The build's commit and day, shown in Settings → About and remembered to say "Updated" after a new version loads.
  try { process.env.VITE_APP_VERSION = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { process.env.VITE_APP_VERSION = "dev"; }
  process.env.VITE_APP_BUILT = new Date().toISOString().slice(0, 10);
  console.info(`[env] ${mode}: backend ${process.env.VITE_SUPABASE_URL || "none (agents offline)"}`);
  // Dev-only bridges (dev/chatgpt/README.md): through `tailscale serve` on TAILNET_HOST only the logins in
  // TAILNET_LOGINS (comma-separated) pass; loopback always does.
  const env: Record<string, string | undefined> = command === "serve" ? { ...loadEnv(mode, process.cwd(), "TAILNET_"), ...process.env } : {};
  const logins = (env.TAILNET_LOGINS ?? "").split(",").map((login) => login.trim()).filter(Boolean);
  const tailnetHost = env.TAILNET_HOST?.trim() || undefined;
  return {
    // Libraries that change far less often than the app get chunks of their own, so an installed app's update downloads
    // only what changed instead of React, Base UI and Supabase again with every release.
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return undefined;
            if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
            if (/node_modules[\\/]@(base-ui|floating-ui)[\\/]/.test(id)) return "ui";
            if (/node_modules[\\/]@supabase[\\/]/.test(id)) return "supabase";
            return undefined;
          },
        },
      },
    },
    // `tailscale serve` proxies the tailnet name to the loopback dev server; Vite rejects unknown hosts otherwise.
    server: { allowedHosts: tailnetHost ? [tailnetHost] : [] },
    plugins: [
      // Dev-only ChatGPT plan bridge (dev/chatgpt/README.md): Settings → AI model → ChatGPT plan, and the admin page's
      // routes (DEVELOPMENT.md, "Admin page"), same tailnet rule.
      ...command === "serve" ? [chatGptPlugin(logins, tailnetHost), adminPlugin(logins, tailnetHost), {
        // The dev server installs on a phone as its own app, "Atlaswork dev" with a clay icon (dev/app), so it never
        // reads as the real one; production builds keep vite-plugin-pwa's manifest.
        name: "atlaswork-dev-app",
        transformIndexHtml: (html: string) => html.replace("</head>", `  <link rel="manifest" href="/dev/app/manifest.webmanifest" />\n</head>`),
      }] : [],
      // The emblem drawings (dev/emblemAssets.ts) and the `virtual:emblems` list of what each family draws.
      emblemAssets(),
      // React Compiler memoizes components and hooks, so a change redraws only what depends on it (docs/adr/0002).
      react({ babel: { plugins: ["babel-plugin-react-compiler"] } }),
      VitePWA({
        // A new version waits until it's safe to load (src/update.ts): at once while the app is in the background,
        // else when you tap Reload, so an update never reloads under your fingers mid-sentence.
        registerType: "prompt",
        includeAssets: ["icon.svg", "atlas.webp", "fonts/*.woff2"],
        manifest: {
          name: "Atlaswork",
          short_name: "Atlaswork",
          description: "Notes, tasks and a crew of AI agents for your life.",
          theme_color: "#f7f5ef",
          background_color: "#f7f5ef",
          display: "standalone",
          // Android needs PNGs to install well and masks the icon to its own shape, so the maskable one fills the square
          // (icon.svg without its rounded corners; regenerate all three when icon.svg changes).
          icons: [
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
          // Long-press the home-screen icon (agents-design D52); src/launch.ts runs `do`.
          shortcuts: [
            { name: "New note", url: "/?do=note" },
            // Capture, listening (agents-design D53).
            { name: "Speak", url: "/?do=voice" },
            { name: "Ask Atlas", url: "/?do=atlas" },
            { name: "Today", url: "/?do=today" },
            { name: "Needs you", url: "/?do=needs" },
          ],
          // Android's Share sheet lists the installed app; a share opens Capture with its text (src/launch.ts).
          share_target: {
            action: "/",
            method: "GET",
            params: { title: "share_title", text: "share_text", url: "share_url" },
          },
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,webp,woff2}"],
          // pdf.js loads only when an agent opens a PDF (agents-design D47), so installs don't download it up front;
          // of the thousands of emblem drawings an install keeps only the ones it shows (runtimeCaching below), and crew
          // styles other than Storybook (public/agents/<style>/, agents-design D16) load once chosen, then stay cached.
          globIgnores: ["**/pdf-*.js", "**/pdf.worker*", "emblems/**", "agents/*/**"],
          runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith("/emblems/"), handler: "CacheFirst",
            options: { cacheName: "emblems", expiration: { maxEntries: 400 } } },
          { urlPattern: /\/agents\/[a-z]+\/[a-z]+\.webp$/, handler: "StaleWhileRevalidate",
            options: { cacheName: "crew-styles", expiration: { maxEntries: 160 } } }],
          navigateFallback: "/index.html",
          // Google's Calendar consent returns to /connectors/callback, which Cloudflare forwards to the connectors
          // function (DEVELOPMENT.md, "Accounts and server storage"); answering it with the app shell would drop the code.
          navigateFallbackDenylist: [/^\/connectors\//],
          // Routine pushes (agents-design D55): the push and notification-click handlers live beside the generated worker.
          importScripts: ["/push-sw.js"],
        },
      }),
    ],
  };
});
