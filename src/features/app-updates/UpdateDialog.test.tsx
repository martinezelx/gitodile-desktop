import React, { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import type { AppUpdatesController, AppUpdatesSnapshot } from "./controller";
import { AppUpdateDialog, AppUpdateSettingsControl } from "./UpdateDialog";

const candidate = {
  candidateId: "candidate", version: "0.3.1",
  target: "windows-x86_64" as const, publishedAt: null,
  notes: "Plain <b>text</b>\nhttps://example.invalid/image.png", highlights: [], expectedBytes: null,
};

const installed = { version: "0.3.0" };

function controller(): AppUpdatesController {
  return {
    subscribe: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(), initialize: vi.fn(), setAutomaticEnabled: vi.fn(),
    check: vi.fn(), download: vi.fn(), cancel: vi.fn(), install: vi.fn(), openManualDownload: vi.fn(), dispose: vi.fn(),
  };
}

function Harness({ snapshot, appController = controller() }: { snapshot: AppUpdatesSnapshot; appController?: AppUpdatesController }) {
  const [open, setOpen] = useState(false);
  return <LanguageProvider><button onClick={() => setOpen(true)}>Open</button><AppUpdateDialog isOpen={open} setOpen={setOpen} snapshot={snapshot} controller={appController} installed={installed} /></LanguageProvider>;
}

function snapshotOf(state: AppUpdatesSnapshot["state"]): AppUpdatesSnapshot {
  return { state, startupConfirmation: { kind: "none" }, automaticEnabled: false };
}

afterEach(cleanup);

describe("application update dialog", () => {
  it("does not act on mount, restores focus on Escape, and renders remote notes only as text", async () => {
    const user = userEvent.setup();
    render(<Harness snapshot={{ state: { kind: "available", candidate }, startupConfirmation: { kind: "none" }, automaticEnabled: false }} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);
    expect(screen.getByText("Plain <b>text</b>", { exact: false }).querySelector("b")).toBeNull();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("shows the feed's highlights in the reader's language instead of the notes", async () => {
    const user = userEvent.setup();
    localStorage.setItem("gitodile-language", "es");
    try {
      const highlights = [
        { id: "faster", icon: "cloud-download", en: "Faster updates.", es: "Actualizaciones más rápidas." },
        { id: "future", icon: "rocket", en: "A glyph this build does not know.", es: "Un glifo que esta build no conoce." },
      ];
      render(<Harness snapshot={{ state: { kind: "available", candidate: { ...candidate, highlights } }, startupConfirmation: { kind: "none" }, automaticEnabled: false }} />);
      await user.click(screen.getByRole("button", { name: "Open" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Versión instalada: 0.3.0")).toBeInTheDocument();
      expect(within(dialog).getByRole("heading", { name: "0.3.1" })).toBeInTheDocument();
      const list = within(dialog).getByRole("list");
      expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
        "Actualizaciones más rápidas.",
        "Un glifo que esta build no conoce.",
      ]);
      // An unknown icon name still draws a glyph rather than an empty slot.
      expect(list.querySelectorAll(".release-highlights__icon svg")).toHaveLength(2);
      expect(within(dialog).getByText("Novedades")).toBeInTheDocument();
      expect(dialog.querySelector(".app-update-notes")).toBeNull();
    } finally {
      localStorage.removeItem("gitodile-language");
    }
  });

  it("keeps the notes' paragraphs and bullets and offers the manual download for a check-time block", async () => {
    const user = userEvent.setup();
    const notes = "First paragraph, joined.\n\n- one item\n- another item\n\nLast paragraph.";
    const error = { code: "automatic_update_not_enabled" as const, stage: "check" as const, retryable: false };
    render(<Harness snapshot={{ state: { kind: "blocked", candidate: { ...candidate, notes }, error }, startupConfirmation: { kind: "none" }, automaticEnabled: false }} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Updates" });
    const rendered = dialog.querySelector(".app-update-notes");
    expect(rendered?.textContent).toBe(notes);
    expect(within(dialog).getByRole("status")).toHaveTextContent("This build can't update itself. Use the manual download.");
    expect(within(dialog).queryByText("Can't install yet")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Manual download" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /^Download/ })).toBeNull();
  });

  it("shows the installed build, the offered release and the download size", async () => {
    const user = userEvent.setup();
    render(<Harness snapshot={{
      state: { kind: "available", candidate: { ...candidate, publishedAt: "2026-08-27T10:00:00Z", expectedBytes: 39_845_888 } },
      startupConfirmation: { kind: "none" },
      automaticEnabled: false,
    }} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    // The title is the state, and the installed build is the line under it.
    const dialog = screen.getByRole("dialog", { name: "A new version is available" });
    expect(within(dialog).getByText("Installed version: 0.3.0")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "0.3.1" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Download (38 MB)" })).toBeInTheDocument();
  });

  it("exposes honest unknown-length progress without a fabricated percentage", async () => {
    const user = userEvent.setup();
    render(<Harness snapshot={{ state: { kind: "downloading", candidate, transfer: { length: "unknown", receivedBytes: 2_097_152 } }, startupConfirmation: { kind: "none" }, automaticEnabled: false }} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const progress = screen.getByRole("progressbar");
    expect(progress).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("2 MB downloaded")).toBeInTheDocument();
  });

  it("announces bounded progress when the server supplies a length", async () => {
    const user = userEvent.setup();
    render(<Harness snapshot={{ state: { kind: "downloading", candidate, transfer: { length: "known", receivedBytes: 1_048_576, totalBytes: 4_194_304 } }, startupConfirmation: { kind: "none" }, automaticEnabled: false }} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const progress = screen.getByRole("progressbar", { name: "1 MB of 4 MB" });
    expect(progress).toHaveAttribute("aria-valuenow", "25");
  });

  it("states what installing does beside the one button that installs", async () => {
    const user = userEvent.setup();
    const appController = controller();
    render(<Harness snapshot={snapshotOf({ kind: "ready", candidate })} appController={appController} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Ready to install" });
    expect(within(dialog).getByText(/closes and reopens on the new version/)).toBeInTheDocument();
    expect(within(dialog).getByText(/project files aren't touched/)).toBeInTheDocument();
    expect(appController.install).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(appController.install).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("button", { name: "Install and restart" }));
    expect(appController.install).toHaveBeenCalledOnce();
  });

  it("says once that the restart did not land on the new version, and offers both ways forward", async () => {
    const user = userEvent.setup();
    const error = { code: "post_install_unconfirmed" as const, stage: "startup" as const, retryable: false, safeDetail: "The running version did not confirm the attempted update." };
    const appController = controller();
    render(<Harness appController={appController} snapshot={{
      state: { kind: "failed", error },
      startupConfirmation: { kind: "unconfirmed", expectedVersion: "0.3.1", error },
      automaticEnabled: false,
    }} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "The update didn't finish" });
    expect(within(dialog).getAllByRole("status")).toHaveLength(1);
    expect(within(dialog).getByRole("status")).toHaveTextContent("The app restarted, but not on version 0.3.1. Check again or use the manual download.");
    expect(within(dialog).queryByText(/Updated to/)).toBeNull();
    expect(within(dialog).queryByText(/did not confirm/)).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Manual download" })).toBeInTheDocument();
    // The button says what the sentence asks for.
    await user.click(within(dialog).getByRole("button", { name: "Check again" }));
    expect(appController.check).toHaveBeenCalledOnce();
  });

  it("does not print a bare version when the handoff record named none", async () => {
    const user = userEvent.setup();
    const error = { code: "post_install_unconfirmed" as const, stage: "startup" as const, retryable: false };
    render(<Harness snapshot={{
      state: { kind: "failed", error },
      startupConfirmation: { kind: "unconfirmed", expectedVersion: "", error },
      automaticEnabled: false,
    }} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("the new version couldn't be confirmed");
    expect(status.textContent).not.toMatch(/\bv\./);
  });

  it("names the unfinished edit that blocks an install, in the reader's language, without a manual download", async () => {
    localStorage.setItem("gitodile-language", "es");
    const user = userEvent.setup();
    try {
      const error = { code: "install_blocked" as const, stage: "admission" as const, retryable: true, blocker: "Ajustes" };
      const appController = controller();
      render(<Harness appController={appController} snapshot={snapshotOf({ kind: "blocked", candidate, error })} />);
      await user.click(screen.getByRole("button", { name: "Open" }));
      const dialog = screen.getByRole("dialog", { name: "Todavía no se puede instalar" });
      expect(within(dialog).getByRole("status")).toHaveTextContent("«Ajustes» tiene cambios sin guardar. Guárdalos o descártalos y reinténtalo.");
      expect(within(dialog).queryByRole("button", { name: "Descarga manual" })).toBeNull();
      await user.click(within(dialog).getByRole("button", { name: "Reintentar" }));
      expect(appController.install).toHaveBeenCalledOnce();
    } finally {
      localStorage.removeItem("gitodile-language");
    }
  });

  it("explains an unnamed block without pointing at a list that is not there", async () => {
    localStorage.setItem("gitodile-language", "es");
    const user = userEvent.setup();
    try {
      const error = { code: "install_blocked" as const, stage: "admission" as const, retryable: true, safeDetail: "Explicit install consent is required." };
      render(<Harness snapshot={snapshotOf({ kind: "blocked", candidate, error })} />);
      await user.click(screen.getByRole("button", { name: "Open" }));
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("Hay algo en curso que impide instalar la actualización.");
      expect(status.textContent).not.toMatch(/indicado|Explicit/);
    } finally {
      localStorage.removeItem("gitodile-language");
    }
  });

  it("offers the manual download only where its sentence recommends it", async () => {
    const user = userEvent.setup();
    const offline = { code: "offline" as const, stage: "check" as const, retryable: true };
    const { unmount } = render(<Harness snapshot={snapshotOf({ kind: "failed", error: offline })} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manual download" })).toBeNull();
    unmount();

    const handoff = { code: "install_handoff_failed" as const, stage: "install" as const, retryable: true };
    render(<Harness snapshot={snapshotOf({ kind: "failed", error: handoff })} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("button", { name: "Manual download" })).toBeInTheDocument();
  });

  it("names verification in the title and in visible text", async () => {
    const user = userEvent.setup();
    render(<Harness snapshot={snapshotOf({ kind: "verifying", candidate, receivedBytes: 1_048_576 })} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Verifying 0.3.1" });
    expect(within(dialog).getByRole("progressbar", { name: "Verifying the download…" })).toBeInTheDocument();
    expect(within(dialog).getByText("Verifying the download…", { selector: "span" })).toBeVisible();
  });

  it("closes from up to date and keeps checking again as the quieter choice", async () => {
    const user = userEvent.setup();
    const appController = controller();
    render(<Harness appController={appController} snapshot={snapshotOf({ kind: "current", checkedAt: "2026-10-01T10:00:00Z" })} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "You have the latest version" });
    // The corner button is also "Close"; the action row's is the primary one.
    expect(dialog.querySelector(".app-update-actions .primary-button")).toHaveTextContent("Close");
    await user.click(within(dialog).getByRole("button", { name: "Check again" }));
    expect(appController.check).toHaveBeenCalledOnce();
  });

  it("titles the install in progress", async () => {
    const user = userEvent.setup();
    render(<Harness snapshot={snapshotOf({ kind: "installing", candidateId: "candidate" })} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog", { name: "Installing the update" })).toBeInTheDocument();
  });

  it("says why updates are unavailable once, with the specific cause instead of the generic sentence", async () => {
    const user = userEvent.setup();
    const error = { code: "internal" as const, stage: "check" as const, retryable: false, safeDetail: "Updates aren't set up for this build." };
    const snapshot: AppUpdatesSnapshot = { state: { kind: "unavailable", error }, startupConfirmation: { kind: "none" }, automaticEnabled: false };
    render(<Harness snapshot={snapshot} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Updates" });
    expect(within(dialog).getByRole("status")).toHaveTextContent("Updates aren't set up for this build.");
    expect(within(dialog).queryByText("Not available for this installation")).toBeNull();
    expect(within(dialog).queryByText(/couldn't be completed/)).toBeNull();
  });

  it("never shows the native side's English detail to a Spanish reader", async () => {
    localStorage.setItem("gitodile-language", "es");
    const user = userEvent.setup();
    const error = { code: "post_install_unconfirmed" as const, stage: "check" as const, retryable: false, safeDetail: "The running version did not confirm the attempted update." };
    const snapshot: AppUpdatesSnapshot = { state: { kind: "unavailable", error }, startupConfirmation: { kind: "none" }, automaticEnabled: false };
    render(<Harness snapshot={snapshot} />);
    localStorage.removeItem("gitodile-language");
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.queryByText(/did not confirm/)).toBeNull();
    expect(screen.getByText(/No se encontró la nueva versión|nueva versión/)).toBeInTheDocument();
  });

  it("names a build that can't check for updates by its own code, in the reader's language", async () => {
    const user = userEvent.setup();
    const error = { code: "not_configured" as const, stage: "check" as const, retryable: false };
    const snapshot: AppUpdatesSnapshot = { state: { kind: "unavailable", error }, startupConfirmation: { kind: "none" }, automaticEnabled: false };
    render(<Harness snapshot={snapshot} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("status")).toHaveTextContent("This build can't check for updates. Download the latest one manually.");
  });

  it("puts the cause in the Settings row and keeps Details for what only the dialog shows", () => {
    const error = { code: "internal" as const, stage: "check" as const, retryable: false, safeDetail: "Updates aren't set up for this build." };
    render(
      <LanguageProvider>
        <AppUpdateSettingsControl
          snapshot={{ state: { kind: "unavailable", error }, startupConfirmation: { kind: "none" }, automaticEnabled: false }}
          controller={controller()}
          installed={installed}
          name="GitOdile"
          enabled={false}
          setEnabled={vi.fn()}
          onOpenDialog={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText("Installed version")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How you get updates" })).toBeInTheDocument();
    expect(screen.getByText("Updates aren't set up for this build.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
  });

  it.each(["downloading", "verifying", "installing"] as const)("reopens update details during %s after closing the dialog", async (kind) => {
    const user = userEvent.setup();
    const appController = controller();
    const state: AppUpdatesSnapshot["state"] = kind === "downloading"
      ? { kind, candidate, transfer: { length: "unknown", receivedBytes: 100 } }
      : kind === "verifying" ? { kind, candidate, receivedBytes: 100 }
        : { kind, candidateId: candidate.candidateId };
    function SettingsHarness() {
      const [open, setOpen] = useState(true);
      const snapshot = snapshotOf(state);
      return <LanguageProvider>
        <AppUpdateSettingsControl snapshot={snapshot} controller={appController}
          installed={installed} name="GitOdile" enabled={false} setEnabled={vi.fn()}
          onOpenDialog={() => setOpen(true)} />
        <AppUpdateDialog isOpen={open} setOpen={setOpen} snapshot={snapshot}
          controller={appController} installed={installed} />
      </LanguageProvider>;
    }
    render(<SettingsHarness />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Details" }));
    const dialog = screen.getByRole("dialog");
    if (kind === "downloading") {
      expect(within(dialog).getByRole("progressbar")).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(appController.cancel).toHaveBeenCalledOnce();
    }
    expect(appController.download).not.toHaveBeenCalled();
    expect(appController.install).not.toHaveBeenCalled();
    expect(appController.check).not.toHaveBeenCalled();
  });

  it("enables background checks only from the disclosed Settings switch", async () => {
    const user = userEvent.setup();
    const appController = controller();
    const setEnabled = vi.fn();
    render(
      <LanguageProvider>
        <AppUpdateSettingsControl
          snapshot={{ state: { kind: "idle" }, startupConfirmation: { kind: "none" }, automaticEnabled: false }}
          controller={appController}
          installed={installed}
          name="GitOdile"
          enabled={false}
          setEnabled={setEnabled}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText(/every 24 hours/)).toBeInTheDocument();
    expect(screen.getByText("0.3.0")).toBeInTheDocument();
    expect(appController.check).not.toHaveBeenCalled();
    await user.click(screen.getByRole("switch", { name: "Check for updates at startup" }));
    expect(setEnabled).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(appController.check).toHaveBeenCalledOnce();
  });
});
