/// <reference types="node" />
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Version shown in Settings -> About. CI sets VITE_APP_VERSION; locally use the root package.json.
process.env.VITE_APP_VERSION ||= JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

export default defineConfig({
  // "/" for normal hosting, Electron and Capacitor; "/<repo>/" for GitHub Pages (set VITE_BASE in CI).
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  // One .env at the repository root serves both server and client (only VITE_* reaches the client).
  envDir: "../..",
  server: {
    port: 5173,
    // Listen on the LAN so phones on the same network can join during development.
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
  },
});
