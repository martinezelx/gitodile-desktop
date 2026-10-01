/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";
import packageManifest from "./package.json" with { type: "json" };

// A static import makes the manifest a watched config dependency. Reading it
// with fs would leave the dev server's injected version stale after a bump.

/** What About credits, read from what is actually installed rather than from
 * `package.json`'s ranges. `^19.3.0` is a constraint, not a version: a dialog
 * that prints it is describing the manifest instead of the build the user is
 * running. Anything unresolvable stays `null` and simply loses its chip, the
 * same rule the diagnostics block already follows. */
function installedVersion(packageName: string): string | null {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL(`./node_modules/${packageName}/package.json`, import.meta.url), "utf8"),
    ) as { version?: string };
    return manifest.version ?? null;
  } catch {
    return null;
  }
}

/** `Cargo.lock`, never `Cargo.toml`: the manifest asks for `"2"`, and only the
 * lockfile says which 2 the desktop shell was built against. */
function lockedCrateVersion(crate: string): string | null {
  try {
    const lock = readFileSync(new URL("./src-tauri/Cargo.lock", import.meta.url), "utf8");
    const entry = new RegExp(`\\[\\[package\\]\\]\\r?\\nname = "${crate}"\\r?\\nversion = "([^"]+)"`);
    return lock.match(entry)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** `rust-toolchain.toml` pins a channel, not a version, so the only truthful
 * answer is the `rustc` that the build machine resolved that channel to. A
 * frontend-only build has no Rust on `PATH`; it drops the chip rather than
 * printing a guess. */
function toolchainRustVersion(): string | null {
  const result = spawnSync("rustc", ["--version"], { encoding: "utf8", windowsHide: true });
  return result.stdout?.match(/^rustc (\d+\.\d+\.\d+)/)?.[1] ?? null;
}

/** The day each released version was tagged, `YYYY-MM-DD`, for every
 * highlights file whose `v<version>` tag this checkout has. The tag is the
 * truthful publication date; the `date` inside the file is only the day the
 * release branch was cut, and stays the fallback for a checkout without
 * tags (a development clone, or the candidate itself before it is tagged).
 * The release pipeline's build job fetches tags and refuses to build a
 * tagged release whose own tag did not resolve, so a published build never
 * silently falls back. */
function releaseTagDates(): Record<string, string> {
  const dates: Record<string, string> = {};
  let names: string[];
  try {
    names = readdirSync(new URL("./docs/release/highlights/", import.meta.url));
  } catch {
    return dates;
  }
  for (const name of names) {
    const version = name.match(/^v(.+)\.json$/)?.[1];
    if (!version) continue;
    const result = spawnSync("git", ["log", "-1", "--format=%cs", `refs/tags/v${version}`], {
      encoding: "utf8",
      windowsHide: true,
    });
    const date = result.status === 0 ? result.stdout.trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates[version] = date;
  }
  return dates;
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageManifest.version),
    __APP_RELEASE_DATES__: JSON.stringify(releaseTagDates()),
    __STACK_VERSIONS__: JSON.stringify({
      tauri: lockedCrateVersion("tauri"),
      react: installedVersion("react"),
      rust: toolchainRustVersion(),
    }),
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
    // Tool-created sibling checkouts can live below this repository while an
    // agent is active. They are separate worktrees, not part of this tree's
    // test inventory, and may target an older application version.
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
  },
});
