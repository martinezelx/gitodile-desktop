import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../i18n";
import { AppOverlays, type AppOverlaysProps } from "./AppOverlays";
import { describePlatform, formatDiagnostics, readSystemInfo } from "./systemInfo";

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

afterEach(cleanup);

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
      defaults: { reopenLastProject: false, confirmCloseProject: true },
    },
    about: { isOpen: true, setOpen: vi.fn() },
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
        gitVersion: "2.50.0",
      }),
    ).toBe("GitOdrile 0.1.0\nSystem: Windows 11 (x86_64)\nSystem version: 10.0.26200\nGit: 2.50.0");

    expect(formatDiagnostics({ appVersion: "0.1.0", system: null, gitVersion: null })).toBe("GitOdrile 0.1.0");
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
  it("reports the app version, the machine, and Git on separate rows", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "Git without the bite." });
    expect(dialog).toHaveTextContent(__APP_VERSION__);
    expect(dialog).toHaveTextContent("Windows 11 (x86_64)");
    expect(dialog).toHaveTextContent("10.0.26200");
    expect(dialog).toHaveTextContent("2.45.0");
  });

  it("leads the list with GitOdrile's own version, then the machine", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "Git without the bite." });
    const rows = [...dialog.querySelectorAll(".about-details > div")];
    // The rule is the first row's `border-bottom`, so "the app above, the
    // machine below" is the row order plus that row carrying the class.
    expect(rows.map((row) => row.querySelector("dt")?.textContent)).toEqual([
      "Version",
      "System",
      "System version",
      "Git",
    ]);
    expect(rows[0]).toHaveClass("about-details__app");
    expect(rows[0]).toHaveTextContent(__APP_VERSION__);
  });

  it("leaves the rule with nothing to draw when it knows nothing about the machine", async () => {
    const os = await import("@tauri-apps/plugin-os");
    vi.mocked(os.platform).mockImplementationOnce(() => {
      throw new TypeError("no bridge");
    });
    renderOverlaysWithoutGit();

    const dialog = screen.getByRole("dialog", { name: "Git without the bite." });
    const rows = [...dialog.querySelectorAll(".about-details > div")];
    // Being last-child is what suppresses the rule in CSS; a second row here
    // would put a line under the version with nothing beneath it.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveClass("about-details__app");
    expect(rows[0]).toHaveTextContent(__APP_VERSION__);
  });

  it("copies a diagnostics block for a bug report", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderOverlays();

    await userEvent.click(screen.getByRole("button", { name: /Copy system info/ }));

    expect(writeText).toHaveBeenCalledWith(
      "GitOdrile " + __APP_VERSION__ + "\nSystem: Windows 11 (x86_64)\nSystem version: 10.0.26200\nGit: 2.45.0",
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
