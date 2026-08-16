import React, { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { SettingsPanel } from "./SettingsPanel";
import type { SettingsPort } from "./port";
import type { GitDiagnostics, GitUpdateStatus, SettingsSection } from "./domain";

afterEach(cleanup);

function createPort(overrides: Partial<SettingsPort> = {}): SettingsPort {
  return {
    readDiagnostics: vi.fn(async () => ({ state: "available", version: "2.45.0" }) as GitDiagnostics),
    checkUpdate: vi.fn(async () => ({ state: "up_to_date", cached: false }) as GitUpdateStatus),
    installGit: vi.fn(async () => ({ outcome: "started" as const, platform: "windows" as const, guidanceUrl: null })),
    updateGit: vi.fn(async () => ({ outcome: "started" as const })),
    getIdentity: vi.fn(async () => ({ name: null, email: null })),
    setIdentity: vi.fn(async () => undefined),
    openGuidance: vi.fn(async () => undefined),
    ...overrides,
  };
}

type PanelOverrides = Partial<{
  gitDiagnostics: GitDiagnostics | null;
  gitUpdateStatus: GitUpdateStatus | null;
  initialSection: SettingsSection;
  onClose: () => void;
  onRegisterCloseGuard: (guard: (() => boolean) | null) => void;
  setReopenLastProject: (value: boolean) => void;
  setConfirmCloseProject: (value: boolean) => void;
}>;

/** The section is app state in production, so the harness owns it here too. */
function Harness({ port, overrides }: { port: SettingsPort; overrides: PanelOverrides }): React.JSX.Element {
  const [section, setSection] = useState<SettingsSection>(overrides.initialSection ?? "general");
  return (
    <SettingsPanel
      theme="system"
      setTheme={vi.fn()}
      activeSection={section}
      onSectionChange={setSection}
      gitDiagnostics={overrides.gitDiagnostics ?? { state: "available", version: "2.45.0" }}
      gitUpdateStatus={overrides.gitUpdateStatus ?? null}
      onCheckGitUpdate={vi.fn(async () => undefined)}
      isCheckingGitUpdate={false}
      onRefreshGitDiagnostics={vi.fn(async () => undefined)}
      isRefreshingGitDiagnostics={false}
      reopenLastProject={false}
      setReopenLastProject={overrides.setReopenLastProject ?? vi.fn()}
      confirmCloseProject={false}
      setConfirmCloseProject={overrides.setConfirmCloseProject ?? vi.fn()}
      defaults={{ reopenLastProject: false, confirmCloseProject: true }}
      onClose={overrides.onClose}
      onRegisterCloseGuard={overrides.onRegisterCloseGuard}
      port={port}
    />
  );
}

function renderPanel(port: SettingsPort, overrides: PanelOverrides = {}) {
  return render(
    <LanguageProvider>
      <Harness port={port} overrides={overrides} />
    </LanguageProvider>,
  );
}

describe("Settings panel native boundary", () => {
  it("reads and saves the Git identity through its port instead of calling Tauri", async () => {
    const port = createPort({ getIdentity: vi.fn(async () => ({ name: "Ada", email: "ada@example.com" })) });
    renderPanel(port, { initialSection: "git" });

    await waitFor(() => expect(port.getIdentity).toHaveBeenCalledTimes(1));

    // No Save button and no edit step: the draft commits when focus leaves the
    // pair, like every other control in the panel applies on change.
    const email = await screen.findByRole("textbox", { name: "Email" });
    await userEvent.clear(email);
    await userEvent.type(email, "ada@lovelace.dev");
    await userEvent.tab();

    await waitFor(() =>
      expect(port.setIdentity).toHaveBeenCalledWith({ name: "Ada", email: "ada@lovelace.dev" }),
    );
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("opens the platform guidance page through the port when Git cannot be installed directly", async () => {
    const port = createPort({
      installGit: vi.fn(async () => ({
        outcome: "guidance" as const,
        platform: "linux" as const,
        guidanceUrl: "https://git-scm.com/download/linux",
      })),
    });
    renderPanel(port, { gitDiagnostics: { state: "missing", version: null } });

    await userEvent.click(screen.getByRole("tab", { name: /Git/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Install Git" }));

    await waitFor(() => expect(port.installGit).toHaveBeenCalledTimes(1));
    expect(port.openGuidance).toHaveBeenCalledWith("https://git-scm.com/download/linux");
  });
});

describe("Settings panel identity draft", () => {
  it("refuses to save a malformed email and says so next to the field", async () => {
    const port = createPort();
    renderPanel(port, { initialSection: "git" });

    await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), "Ada");
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ada@lovelace");
    await userEvent.tab();

    expect(await screen.findByText("That doesn't look like an email address.")).toBeInTheDocument();
    expect(port.setIdentity).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("aria-invalid", "true");
  });

  it("reports a failed save as a failure, not as a confirmation", async () => {
    const port = createPort({ setIdentity: vi.fn(async () => Promise.reject(new Error("nope"))) });
    renderPanel(port, { initialSection: "git" });

    await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), "Ada");
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ada@lovelace.dev");
    await userEvent.tab();

    // The message used to render with the same success check as "Saved.",
    // so a failure was indistinguishable from a confirmation at a glance.
    const notice = await screen.findByText("Couldn't save that.");
    expect(notice.closest("p")).toHaveClass("settings-row__hint--danger");
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  it("saves a complete draft and then closes when the dialog is dismissed", async () => {
    const port = createPort();
    const onClose = vi.fn();
    const closeGuard: { current: (() => boolean) | null } = { current: null };
    renderPanel(port, {
      initialSection: "git",
      onClose,
      onRegisterCloseGuard: (next) => {
        closeGuard.current = next;
      },
    });

    await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), "Ada");
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ada@lovelace.dev");

    // Dismissed with focus still in the field, so no blur has committed yet.
    expect(closeGuard.current?.()).toBe(true);
    await waitFor(() =>
      expect(port.setIdentity).toHaveBeenCalledWith({ name: "Ada", email: "ada@lovelace.dev" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("blocks the dismissal and asks when the draft cannot be saved", async () => {
    const port = createPort();
    const onClose = vi.fn();
    const closeGuard: { current: (() => boolean) | null } = { current: null };
    renderPanel(port, {
      initialSection: "general",
      onClose,
      onRegisterCloseGuard: (next) => {
        closeGuard.current = next;
      },
    });

    await userEvent.click(screen.getByRole("tab", { name: /Git/ }));
    await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), "Ada");

    // An email is still missing, so there is nothing to save and nothing to
    // silently drop either.
    expect(closeGuard.current?.()).toBe(true);
    expect(await screen.findByText("Your identity isn't saved yet")).toBeInTheDocument();
    expect(port.setIdentity).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Discard and close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lets an untouched panel close without interference", async () => {
    const closeGuard: { current: (() => boolean) | null } = { current: null };
    renderPanel(createPort(), {
      onRegisterCloseGuard: (next) => {
        closeGuard.current = next;
      },
    });

    expect(closeGuard.current?.()).toBe(false);
  });
});

describe("Settings panel section rail", () => {
  it("moves between sections with the arrow keys", async () => {
    renderPanel(createPort());

    const general = screen.getByRole("tab", { name: "General" });
    expect(general).toHaveAttribute("aria-selected", "true");
    // Roving tabindex: the rail is one Tab stop, not one per section.
    expect(screen.getByRole("tab", { name: "Interface" })).toHaveAttribute("tabindex", "-1");

    general.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "Interface" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Language" })).toBeInTheDocument();

    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: /Git/ })).toHaveAttribute("aria-selected", "true");
  });

  it("offers to reset only the sections that have defaults to return to", async () => {
    renderPanel(createPort());

    // General starts away from its defaults in this harness (confirm-close is
    // false, the default is true), so the action is live.
    const reset = screen.getByRole("button", { name: "Reset this section" });
    expect(reset).toBeEnabled();

    await userEvent.click(screen.getByRole("tab", { name: "Interface" }));
    // Interface is already at system/system, so there is nothing to undo.
    expect(screen.getByRole("button", { name: "Reset this section" })).toBeDisabled();

    // Git holds facts about the machine, not preferences with a factory value.
    await userEvent.click(screen.getByRole("tab", { name: /Git/ }));
    expect(screen.queryByRole("button", { name: "Reset this section" })).toBeNull();
  });

  it("puts the section's controls back to their defaults", async () => {
    const setReopenLastProject = vi.fn();
    const setConfirmCloseProject = vi.fn();
    renderPanel(createPort(), { setReopenLastProject, setConfirmCloseProject });

    await userEvent.click(screen.getByRole("button", { name: "Reset this section" }));

    expect(setReopenLastProject).toHaveBeenCalledWith(false);
    expect(setConfirmCloseProject).toHaveBeenCalledWith(true);
  });

  it("marks the Git section when the installation needs attention", () => {
    renderPanel(createPort(), { gitDiagnostics: { state: "missing", version: null } });

    expect(screen.getByRole("tab", { name: /Git/ })).toContainElement(
      screen.getByRole("img", { name: "Git needs attention" }),
    );
  });
});
