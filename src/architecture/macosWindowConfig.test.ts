/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type WindowConfig = Record<string, unknown>;

function windowsOf(relativePath: string): WindowConfig[] {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf8")) as {
    app?: { windows?: WindowConfig[] };
  };
  return config.app?.windows ?? [];
}

// Tauri merges a platform file as a JSON merge patch, which replaces arrays
// whole: the macOS file's window list is the only one macOS gets (task 204).
const MAC_CHROME_FIELDS = ["decorations", "titleBarStyle", "hiddenTitle", "trafficLightPosition"];

describe("macOS window configuration", () => {
  it("repeats every base window field except the native titlebar", () => {
    const [base] = windowsOf("src-tauri/tauri.conf.json");
    const mac = windowsOf("src-tauri/tauri.macos.conf.json");
    expect(mac).toHaveLength(1);

    const strip = (window: WindowConfig): WindowConfig =>
      Object.fromEntries(Object.entries(window).filter(([key]) => !MAC_CHROME_FIELDS.includes(key)));
    expect(strip(mac[0])).toEqual(strip(base));
  });

  it("uses macOS decorations under an overlay titlebar while the base keeps its own", () => {
    const [base] = windowsOf("src-tauri/tauri.conf.json");
    const [mac] = windowsOf("src-tauri/tauri.macos.conf.json");
    expect(base.decorations).toBe(false);
    expect(mac).toMatchObject({ decorations: true, titleBarStyle: "Overlay", hiddenTitle: true });
  });

  it("leaves the Windows and Linux windows to the base configuration", () => {
    expect(windowsOf("src-tauri/tauri.windows.conf.json")).toEqual([]);
    expect(windowsOf("src-tauri/tauri.linux.conf.json")).toEqual([]);
  });
});
