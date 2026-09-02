import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../i18n";
import { DEFAULT_DIFF_PREFERENCES } from "../features/changes";
import { createProjectSettingsCache } from "../features/project-settings";
import { AppOverlays, type AppOverlaysProps } from "./AppOverlays";
import { describePlatform, formatDiagnostics, readSystemInfo, readWebviewVersion } from "./systemInfo";
import { describeStack } from "./stack";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
  Channel: class TestChannel<T> {
    onmessage?: (message: T) => void;
  },
}));
// Synchronous on purpose: that is what plugin-os actually exports for these
// three. Mocking them as promises hid a crash — the real functions throw when
// Tauri's global is missing, and the throw escapes any `.catch` chain.
vi.mock("@tauri-apps/plugin-os", () => ({
  locale: vi.fn(async () => "en-GB"),
  platform: vi.fn(() => "windows"),
  version: vi.fn(() => "10.0.26200"),
  arch: vi.fn(() => "x86_64"),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  // Only the webview test defines one; deleting the own property hands the
  // getter back to `Navigator.prototype` so the next test reads jsdom's again.
  Reflect.deleteProperty(navigator, "userAgent");
});

const closedOverlay = { isOpen: false, setOpen: vi.fn() };

function buildProps(gitDiagnostics: AppOverlaysProps["settings"]["gitTooling"]["diagnostics"]): AppOverlaysProps {
  return {
    settings: {
      ...closedOverlay,
      theme: "system",
      setTheme: vi.fn(),
      section: "general",
      setSection: vi.fn(),
      gitTooling: {
        diagnostics: gitDiagnostics,
        updateStatus: null,
        checkUpdate: vi.fn(async () => undefined),
        isCheckingUpdate: false,
        refreshDiagnostics: vi.fn(async () => undefined),
        isRefreshingDiagnostics: false,
      },
      reopenLastProject: false,
      setReopenLastProject: vi.fn(),
      confirmCloseProject: true,
      setConfirmCloseProject: vi.fn(),
      watchProjects: true,
      setWatchProjects: vi.fn(),
      remoteCheckInterval: 0,
      setRemoteCheckInterval: vi.fn(),
      confirmDiscard: true,
      setConfirmDiscard: vi.fn(),
      notificationsEnabled: true,
      setNotificationsEnabled: vi.fn(),
      runGitHooks: false,
      setRunGitHooks: vi.fn(),
      navigationItems: [],
      navigationPreferences: {
        visibleDestinationIds: [],
        destinationOrderIds: [],
        displayMode: "icons-and-text",
      },
      setNavigationPreferences: vi.fn(),
      diffPreferences: DEFAULT_DIFF_PREFERENCES,
      setDiffPreferences: vi.fn(),
      identity: {
        identity: { name: "", email: "" },
        isLoaded: true,
        isSaving: false,
        save: vi.fn(async () => undefined),
      },
      defaultBranch: {
        name: null,
        isLoaded: true,
        isSaving: false,
        save: vi.fn(async () => undefined),
      },
      lineEndings: { lineEndings: null, isSaving: false, choose: vi.fn(async () => undefined) },
    },
    projectSettings: {
      ...closedOverlay,
      project: null,
      section: "remote",
      setSection: vi.fn(),
      cache: createProjectSettingsCache(),
    },
    about: { isOpen: true, setOpen: vi.fn() },
    changelog: closedOverlay,
    shortcuts: closedOverlay,
    closeConfirmation: { ...closedOverlay, projectName: null, onConfirm: vi.fn() },
    error: { ...closedOverlay, title: "", message: null },
  };
}

function renderOverlays(): void {
  render(
    <LanguageProvider>
      <AppOverlays {...buildProps({ state: "available", version: "2.45.0" })} />
    </LanguageProvider>,
  );
}

/** No OS bridge and no Git version: the state a plain browser run is in, and
 * the only one where the environment list has nothing at all to show. */
function renderOverlaysWithoutGit(): void {
  render(
    <LanguageProvider>
      <AppOverlays {...buildProps(null)} />
    </LanguageProvider>,
  );
}

describe("describePlatform", () => {
  it("reads the Windows release off the build, not the NT version", () => {
    // The whole reason the name and the version are separate rows: Windows 11
    // reports NT 10.0, so "Windows 10.0.26200" tells the user the wrong thing.
    const win11 = { platform: "windows", version: "10.0.26200", arch: "x86_64" };
    const win10 = { platform: "windows", version: "10.0.19045", arch: "x86_64" };
    expect(describePlatform(win11)).toBe("Windows 11");
    expect(describePlatform(win10)).toBe("Windows 10");
    expect(describePlatform({ platform: "windows", version: "6.1.7601", arch: "x86" })).toBe("Windows 7");
  });

  it("names macOS by its release and leaves Linux unversioned", () => {
    expect(describePlatform({ platform: "macos", version: "15.2", arch: "aarch64" })).toBe("macOS 15");
    // `version()` is the kernel on Linux and names no distribution, so it has
    // no business in a row labelled "System".
    expect(describePlatform({ platform: "linux", version: "6.8.0-45", arch: "x86_64" })).toBe("Linux");
  });

  it("falls back to the bare platform name when the version is unreadable", () => {
    expect(describePlatform({ platform: "windows", version: "not-a-version", arch: "x86_64" })).toBe("Windows");
    expect(describePlatform({ platform: "freebsd", version: "14.1", arch: "x86_64" })).toBe("freebsd");
  });
});

describe("formatDiagnostics", () => {
  it("builds a paste-ready block and omits what it does not know", () => {
    expect(
      formatDiagnostics({
        appVersion: "0.1.0",
        system: { platform: "windows", version: "10.0.26200", arch: "x86_64" },
        webview: "Chromium 140.0.0.0",
        gitVersion: "2.50.0",
      }),
    ).toBe(
      "GitOdile 0.1.0\nSystem: Windows 11 (x86_64)\nSystem version: 10.0.26200\n" +
        "Webview: Chromium 140.0.0.0\nGit: 2.50.0",
    );

    expect(
      formatDiagnostics({ appVersion: "0.1.0", system: null, webview: null, gitVersion: null }),
    ).toBe("GitOdile 0.1.0");
  });
});

describe("readWebviewVersion", () => {
  it("names the Chromium build behind WebView2", () => {
    expect(
      readWebviewVersion(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/140.0.0.0 Safari/537.36",
      ),
    ).toBe("Chromium 140.0.0.0");
  });

  it("says nothing rather than repeating a frozen WebKit token", () => {
    // `AppleWebKit/605.1.15` is what every WKWebView and WebKitGTK has reported
    // for years regardless of the engine underneath, so printing it would put a
    // number in a bug report that means nothing.
    expect(
      readWebviewVersion("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"),
    ).toBeNull();
  });
});

describe("describeStack", () => {
  it("credits the layers shell-outwards and drops the ones it cannot resolve", () => {
    expect(
      describeStack({ tauri: "2.11.5", react: "19.2.8", typescript: "6.0.3", rust: "1.90.0" }).map(
        (layer) => `${layer.name} ${layer.version}`,
      ),
    ).toEqual(["Tauri 2.11.5", "React 19.2.8", "TypeScript 6.0.3", "Rust 1.90.0"]);

    // A frontend-only build has no Rust on PATH. The chip goes; the order of
    // what is left does not shuffle to fill the gap.
    expect(
      describeStack({ tauri: "2.11.5", react: "19.2.8", typescript: null, rust: null }).map((layer) => layer.id),
    ).toEqual(["tauri", "react"]);
    expect(describeStack({ tauri: null, react: null, typescript: null, rust: null })).toEqual([]);
  });
});

describe("readSystemInfo", () => {
  it("returns null instead of throwing when Tauri's OS bridge is absent", async () => {
    const os = await import("@tauri-apps/plugin-os");
    vi.mocked(os.platform).mockImplementationOnce(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'platform')");
    });

    // Unguarded, this throw propagates out of render and takes the whole
    // overlay tree down — which is exactly what happened in the browser.
    expect(readSystemInfo()).toBeNull();
  });
});

describe("About dialog", () => {
  it("reports the product and the machine, and leaves release notes to the changelog", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "Git without the bite." });
    expect(dialog).toHaveTextContent("Turns version control into clear, worry-free steps.");
    expect(dialog).toHaveTextContent("Windows 11 (x86_64)");
    expect(dialog).toHaveTextContent("10.0.26200");
    expect(dialog).toHaveTextContent("2.45.0");
    // The release list moved to its own surface. About is identity and
    // diagnostics again, which is what the version tag stopped opening.
    expect(dialog.querySelector(".changelog")).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("What's new");
  });

  it("lists the technical environment rows in a fixed order", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "Git without the bite." });
    const rows = [...dialog.querySelectorAll(".about-details > div")];
    // No webview row under jsdom: its user agent carries no Chromium token, and
    // an unknown engine is omitted rather than guessed.
    expect(rows.map((row) => row.querySelector("dt")?.textContent)).toEqual([
      "System",
      "System version",
      "Git",
    ]);
  });

  it("reports the webview between the machine and Git when it can name one", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
    });
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "Git without the bite." });
    const rows = [...dialog.querySelectorAll(".about-details > div")];
    expect(rows.map((row) => row.querySelector("dt")?.textContent)).toEqual([
      "System",
      "System version",
      "Webview",
      "Git",
    ]);
    expect(dialog).toHaveTextContent("Chromium 140.0.0.0");
  });

  it("marks the platform it is running on", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "Git without the bite." });
    // Decoration for a value that is already spelled out beside it, so it must
    // stay out of the accessibility tree rather than announce "Windows" twice.
    const mark = dialog.querySelector(".about-details__mark");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveAttribute("aria-hidden", "true");
  });

  it("credits the stack it is built on, apart from the diagnostics", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "Git without the bite." });
    const tiles = [...dialog.querySelectorAll(".about-stack__item")];
    const names = tiles.map((tile) => tile.querySelector(".about-stack__name")?.textContent);
    expect(tiles.length).toBeGreaterThan(0);
    expect(dialog).toHaveTextContent("Built with");
    // Asserted as an order, not a set. Which layers resolve depends on the
    // machine that ran the build — a frontend-only one has no Rust — but
    // whichever do must appear shell-outwards, never reshuffled to fill a gap.
    expect(names).toEqual(["Tauri", "React", "TypeScript", "Rust"].filter((name) => names.includes(name)));
    // Real versions off the lockfiles, not placeholders. Pinning the numbers
    // would mean editing this test on every dependency bump.
    for (const tile of tiles) {
      expect(tile.querySelector(".about-stack__version")?.textContent).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it("omits empty technical details without a platform bridge", async () => {
    const os = await import("@tauri-apps/plugin-os");
    vi.mocked(os.platform).mockImplementationOnce(() => {
      throw new TypeError("no bridge");
    });
    renderOverlaysWithoutGit();

    const dialog = screen.getByRole("dialog", { name: "Git without the bite." });
    expect(dialog.querySelector(".about-technical")).not.toBeInTheDocument();
  });

  it("copies a diagnostics block for a bug report", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderOverlays();

    await userEvent.click(screen.getByRole("button", { name: /Copy system info/ }));

    expect(writeText).toHaveBeenCalledWith(
      "GitOdile " + __APP_VERSION__ + "\nSystem: Windows 11 (x86_64)\nSystem version: 10.0.26200\nGit: 2.45.0",
    );
    expect(await screen.findByRole("button", { name: /Copied/ })).toBeInTheDocument();
  });

  it("keeps the heart readable to a screen reader instead of leaving a gap", () => {
    renderOverlays();

    // The sentence is "Made with <heart> by …". Hiding the glyph would read as
    // "Made with by Luis M. Martínez."
    const heart = screen.getByRole("img", { name: "love" });
    expect(heart).toHaveTextContent("♥");
    expect(heart).toHaveClass("about-dialog__heart");
  });
});
