/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";

const packageVersion = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion.version),
  },
  // File-type artwork is consumed as raw SVG and rendered through an `<img>`
  // adapter in `src/shared/file-icons/index.ts`, which isolates every icon's
  // internal IDs.
  plugins: [react(), Icons({ compiler: "raw" })],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/target/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "oxc",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
  test: {
    // Only the dialog/component tests touch the DOM; the pure-logic tests
    // (i18n and the repository/status/change/save domains) run just as well
    // under jsdom, so one shared environment keeps this config simple.
    environment: "jsdom",
    setupFiles: ["./src/test-fixtures/testSetup.ts"],
  },
});
