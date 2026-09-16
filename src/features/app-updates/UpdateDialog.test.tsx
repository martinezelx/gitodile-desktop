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
    check: vi.fn(), download: vi.fn(), cancel: vi.fn(), install: vi.fn(), setChannel: vi.fn(), openManualDownload: vi.fn(), dispose: vi.fn(),
  };
}

const followBuild = { preferred: "follow_build" as const, buildChannel: "preview" as const, channel: "preview" as const };

function Harness({ snapshot }: { snapshot: AppUpdatesSnapshot }) {
  const [open, setOpen] = useState(false);
  return <LanguageProvider><button onClick={() => setOpen(true)}>Open</button><AppUpdateDialog isOpen={open} setOpen={setOpen} snapshot={snapshot} controller={controller()} installed={installed} /></LanguageProvider>;
}

afterEach(cleanup);

describe("application update dialog", () => {
  it("does not act on mount, restores focus on Escape, and renders remote notes only as text", async () => {
    const user = userEvent.setup();
    render(<Harness snapshot={{ state: { kind: "available", candidate }, startupConfirmation: { kind: "none" }, automaticEnabled: false, channel: null }} />);
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
    render(<Harness snapshot={{ state: { kind: "blocked", candidate: { ...candidate, notes }, error }, startupConfirmation: { kind: "none" }, automaticEnabled: false, channel: null }} />);
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
      channel: null,
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
    render(<Harness snapshot={{ state: { kind: "downloading", candidate, transfer: { length: "unknown", receivedBytes: 2_097_152 } }, startupConfirmation: { kind: "none" }, automaticEnabled: false, channel: null }} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const progress = screen.getByRole("progressbar");
    expect(progress).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("2 MB downloaded")).toBeInTheDocument();
  });

  it("announces bounded progress when the server supplies a length", async () => {
    const user = userEvent.setup();
    render(<Harness snapshot={{ state: { kind: "downloading", candidate, transfer: { length: "known", receivedBytes: 1_048_576, totalBytes: 4_194_304 } }, startupConfirmation: { kind: "none" }, automaticEnabled: false, channel: null }} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const progress = screen.getByRole("progressbar", { name: "1 MB of 4 MB" });
    expect(progress).toHaveAttribute("aria-valuenow", "25");
  });

  it("requires a second, focused confirmation before install", async () => {
    const user = userEvent.setup();
    const appController = controller();
    function ReadyHarness() {
      const [open, setOpen] = useState(true);
      return <LanguageProvider><AppUpdateDialog isOpen={open} setOpen={setOpen} snapshot={{ state: { kind: "ready", candidate }, startupConfirmation: { kind: "none" }, automaticEnabled: false, channel: null }} controller={appController} installed={installed} /></LanguageProvider>;
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
      channel: null,
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
          snapshot={{ state: { kind: "idle" }, startupConfirmation: { kind: "none" }, automaticEnabled: false, channel: followBuild }}
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

  it("shows the effective channel, confirms a switch before storing it, and checks the new channel at once", async () => {
    const user = userEvent.setup();
    const publish: { current: (next: (previous: AppUpdatesSnapshot) => AppUpdatesSnapshot) => void } = { current: () => undefined };
    // The stand-in does what the controller does on a confirmed change:
    // native memory forgets the candidate, and a check of the new channel
    // starts at once.
    const setChannel = vi.fn(async (channel: "stable" | "preview") => {
      const setting = { preferred: channel, buildChannel: "stable" as const, channel };
      publish.current((previous) => ({ ...previous, state: { kind: "checking", operationId: "op", source: "manual" }, channel: setting }));
      return setting;
    });
    const appController = { ...controller(), setChannel };
    function ChannelHarness() {
      const [snapshot, setSnapshot] = useState<AppUpdatesSnapshot>({
        state: { kind: "available", candidate },
        startupConfirmation: { kind: "none" },
        automaticEnabled: false,
        channel: { preferred: "follow_build", buildChannel: "stable", channel: "stable" },
      });
      publish.current = setSnapshot;
      return (
        <LanguageProvider>
          <AppUpdateSettingsControl snapshot={snapshot} controller={appController} installed={{ version: "0.2.0", channel: "stable" }} enabled={false} setEnabled={vi.fn()} />
        </LanguageProvider>
      );
    }
    render(<ChannelHarness />);
    const group = screen.getByRole("radiogroup", { name: "Channel" });
    const stable = within(group).getByRole("radio", { name: "Stable" });
    const preview = within(group).getByRole("radio", { name: "Preview" });
    // A build that has never been told otherwise reads as its own channel.
    expect(stable).toHaveAttribute("aria-checked", "true");
    expect(preview).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Previews arrive earlier and may break/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("New version: v0.2.0-preview.2");

    stable.focus();
    await user.keyboard("{ArrowRight}");
    expect(preview).toHaveFocus();
    // Arrowing is not choosing: the choice is made with Enter or Space.
    expect(setChannel).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    // Nor is choosing yet a change: a confirmation states the consequence
    // (the installed version stays) and takes focus; declining leaves the
    // channel as it was.
    const question = screen.getByRole("group", { name: "Follow preview releases?" });
    expect(within(question).getByRole("button", { name: "Follow previews" })).toHaveFocus();
    expect(within(question).getByText(/the version you have installed stays/)).toBeInTheDocument();
    expect(setChannel).not.toHaveBeenCalled();
    await user.click(within(question).getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("group", { name: "Follow preview releases?" })).toBeNull();
    expect(stable).toHaveAttribute("aria-checked", "true");
    expect(setChannel).not.toHaveBeenCalled();
    // Escape declines too.
    await user.click(preview);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Follow preview releases?" })).toBeNull();

    await user.click(preview);
    await user.click(screen.getByRole("button", { name: "Follow previews" }));
    expect(setChannel).toHaveBeenCalledWith("preview");
    expect(screen.queryByRole("group", { name: "Follow preview releases?" })).toBeNull();
    expect(within(group).getByRole("radio", { name: "Preview" })).toHaveAttribute("aria-checked", "true");
    // The offer from the old feed is gone; the new channel is being asked.
    expect(screen.getByRole("status")).toHaveTextContent("Checking for updates…");
    // Going back asks in the same way, with the honest consequence.
    await user.click(within(group).getByRole("radio", { name: "Stable" }));
    expect(screen.queryByRole("group", { name: "Go back to stable releases?" })).toBeNull();
  });
});
