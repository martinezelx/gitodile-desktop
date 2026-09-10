import React, { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
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

function controller(): AppUpdatesController {
  return {
    subscribe: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(), initialize: vi.fn(), setAutomaticEnabled: vi.fn(),
    check: vi.fn(), download: vi.fn(), cancel: vi.fn(), install: vi.fn(), openManualDownload: vi.fn(), dispose: vi.fn(),
  };
}

function Harness({ snapshot }: { snapshot: AppUpdatesSnapshot }) {
  const [open, setOpen] = useState(false);
  return <LanguageProvider><button onClick={() => setOpen(true)}>Open</button><AppUpdateDialog isOpen={open} setOpen={setOpen} snapshot={snapshot} controller={controller()} /></LanguageProvider>;
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
      return <LanguageProvider><AppUpdateDialog isOpen={open} setOpen={setOpen} snapshot={{ state: { kind: "ready", candidate }, startupConfirmation: { kind: "none" }, automaticEnabled: false }} controller={appController} /></LanguageProvider>;
    }
    render(<ReadyHarness />);
    await user.click(screen.getByRole("button", { name: "Choose when to restart" }));
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
    expect(screen.getByText(/could not confirm it/)).toBeInTheDocument();
    expect(screen.queryByText(/is now running/)).toBeNull();
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
          enabled={false}
          setEnabled={setEnabled}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText(/at most once every 24 hours/)).toBeInTheDocument();
    expect(appController.check).not.toHaveBeenCalled();
    await user.click(screen.getByRole("switch", { name: "Check for GitOdile updates automatically" }));
    expect(setEnabled).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(appController.check).toHaveBeenCalledOnce();
  });
});
