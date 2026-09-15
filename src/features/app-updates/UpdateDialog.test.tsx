import React, { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import type { AppUpdatesController, AppUpdatesSnapshot } from "./controller";
import { AppUpdateDialog, AppUpdateSettingsControl } from "./UpdateDialog";

const candidate = {
  candidateId: "candidate", version: "0.2.0-preview.2", channel: "preview" as const,
  target: "windows-x86_64" as const, publishedAt: null,
  notes: "Plain <b>text</b>\nhttps://example.invalid/image.png", expectedBytes: null,
};

const installed = { version: "0.2.0-preview.1", channel: "preview" as const };

function controller(): AppUpdatesController {
  return {
    subscribe: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(), initialize: vi.fn(), setAutomaticEnabled: vi.fn(),
    check: vi.fn(), download: vi.fn(), cancel: vi.fn(), install: vi.fn(), openManualDownload: vi.fn(), dispose: vi.fn(),
  };
}

function Harness({ snapshot }: { snapshot: AppUpdatesSnapshot }) {
  const [open, setOpen] = useState(false);
  return <LanguageProvider><button onClick={() => setOpen(true)}>Open</button><AppUpdateDialog isOpen={open} setOpen={setOpen} snapshot={snapshot} controller={controller()} installed={installed} /></LanguageProvider>;
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

  it("keeps the notes' paragraphs and bullets and offers the manual download for a check-time block", async () => {
    const user = userEvent.setup();
    const notes = "First paragraph, joined.\n\n- one item\n- another item\n\nLast paragraph.";
    const error = { code: "automatic_update_not_enabled" as const, stage: "check" as const, retryable: false };
    render(<Harness snapshot={{ state: { kind: "blocked", candidate: { ...candidate, notes }, error }, startupConfirmation: { kind: "none" }, automaticEnabled: false }} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Updates" });
    const rendered = dialog.querySelector(".app-update-notes");
    expect(rendered?.textContent).toBe(notes);
    expect(within(dialog).getByRole("status")).toHaveTextContent("Can't install yet");
    expect(within(dialog).getByText("This build can't install updates by itself. Get the new version with the manual download.")).toBeInTheDocument();
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
    const dialog = screen.getByRole("dialog", { name: "Updates" });
    expect(within(dialog).getByText("v0.2.0-preview.1")).toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent("New version: v0.2.0-preview.2");
    expect(within(dialog).getByRole("heading", { name: "v0.2.0-preview.2" })).toBeInTheDocument();
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

  it("requires a second, focused confirmation before install", async () => {
    const user = userEvent.setup();
    const appController = controller();
    function ReadyHarness() {
      const [open, setOpen] = useState(true);
      return <LanguageProvider><AppUpdateDialog isOpen={open} setOpen={setOpen} snapshot={{ state: { kind: "ready", candidate }, startupConfirmation: { kind: "none" }, automaticEnabled: false }} controller={appController} installed={installed} /></LanguageProvider>;
    }
    render(<ReadyHarness />);
    await user.click(screen.getByRole("button", { name: "Install…" }));
    const confirm = screen.getByRole("button", { name: "Install and restart" });
    expect(confirm).toHaveFocus();
    expect(appController.install).not.toHaveBeenCalled();
    await user.click(confirm);
    expect(appController.install).toHaveBeenCalledOnce();
  });

  it("does not claim install success when the restarted version was not confirmed", async () => {
    const user = userEvent.setup();
    render(<Harness snapshot={{
      state: { kind: "failed", error: { code: "post_install_unconfirmed", stage: "startup", retryable: false } },
      startupConfirmation: {
        kind: "unconfirmed",
        expectedVersion: "0.2.0-preview.2",
        error: { code: "post_install_unconfirmed", stage: "startup", retryable: false },
      },
      automaticEnabled: false,
    }} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText(/Couldn't confirm the update to v0.2.0-preview.2/)).toBeInTheDocument();
    expect(screen.queryByText(/Updated to/)).toBeNull();
    // The failure line is the explanation; it is not repeated under itself.
    expect(screen.getAllByText(/expected version wasn't found/)).toHaveLength(1);
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
          enabled={false}
          setEnabled={setEnabled}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText(/again every 24 hours/)).toBeInTheDocument();
    expect(screen.getByText("v0.2.0-preview.1")).toBeInTheDocument();
    expect(appController.check).not.toHaveBeenCalled();
    await user.click(screen.getByRole("switch", { name: "Check for updates at startup" }));
    expect(setEnabled).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(appController.check).toHaveBeenCalledOnce();
  });
});
