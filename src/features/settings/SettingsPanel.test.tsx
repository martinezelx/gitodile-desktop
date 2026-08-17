import React, { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { DEFAULT_DIFF_PREFERENCES, type DiffPreferences } from "../changes";
import { SettingsPanel } from "./SettingsPanel";
import type { SettingsPort } from "./port";
import type { GitDiagnostics, GitLineEndings, GitUpdateStatus, SettingsSection } from "./domain";

afterEach(cleanup);

function createPort(overrides: Partial<SettingsPort> = {}): SettingsPort {
  return {
    readDiagnostics: vi.fn(async () => ({ state: "available", version: "2.45.0" }) as GitDiagnostics),
    checkUpdate: vi.fn(async () => ({ state: "up_to_date", cached: false }) as GitUpdateStatus),
    installGit: vi.fn(async () => ({ outcome: "started" as const, platform: "windows" as const, guidanceUrl: null })),
    updateGit: vi.fn(async () => ({ outcome: "started" as const })),
    getIdentity: vi.fn(async () => ({ name: null, email: null })),
    setIdentity: vi.fn(async () => undefined),
    readLineEndings: vi.fn(
      async () =>
        ({ mode: "not_set", source: "unset", eol: null, projectAttributes: false }) as GitLineEndings,
    ),
    setLineEndings: vi.fn(async () => undefined),
    readPlatform: vi.fn(() => "windows"),
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
  diffPreferences: DiffPreferences;
  setDiffPreferences: (update: (previous: DiffPreferences) => DiffPreferences) => void;
  project: { path: string; sessionEpoch: string } | null;
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
      diffPreferences={overrides.diffPreferences ?? DEFAULT_DIFF_PREFERENCES}
      setDiffPreferences={overrides.setDiffPreferences ?? vi.fn()}
      defaults={{ reopenLastProject: false, confirmCloseProject: true }}
      project={overrides.project ?? null}
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

describe("Settings panel line endings", () => {
  it("reports that nothing is set, and writes the choice that is picked", async () => {
    const port = createPort();
    renderPanel(port, { initialSection: "line-endings" });

    await waitFor(() => expect(port.readLineEndings).toHaveBeenCalledWith(null));
    expect(
      await screen.findByText("Nothing is set, so Git falls back to its own default for this system."),
    ).toBeInTheDocument();
    // Nothing is in effect, so no option reads as the active one and there is
    // no caveat block to explain away.
    expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
    expect(document.querySelector(".line-endings__caveat")).toBeNull();

    // The label the user clicks never mentions autocrlf; only the adapter and
    // Rust know which config value each choice writes.
    await userEvent.click(
      screen.getByRole("radio", {
        name: /Save the shared format, keep the Windows one on your computer/,
      }),
    );
    await waitFor(() => expect(port.setLineEndings).toHaveBeenCalledWith("windows_checkout"));
    // Read back after the write rather than assumed, so a project override is
    // still reported after saving.
    await waitFor(() => expect(port.readLineEndings).toHaveBeenCalledTimes(2));
  });

  it("marks the choice that suits this platform", async () => {
    renderPanel(createPort({ readPlatform: vi.fn(() => "macos") }), { initialSection: "line-endings" });

    const recommended = await screen.findByText("Recommended here");
    expect(recommended.closest("[role='radio']")).toHaveTextContent(
      "Save the shared format, leave your files as they are",
    );
  });

  it("says a project overrides the global setting instead of reporting a value that isn't in effect", async () => {
    const port = createPort({
      readLineEndings: vi.fn(async () => ({
        mode: "normalize" as const,
        source: "project" as const,
        eol: "lf",
        projectAttributes: true,
      })),
    });
    renderPanel(port, {
      initialSection: "line-endings",
      project: { path: "C:/projects/site", sessionEpoch: "epoch-1" },
    });

    await waitFor(() =>
      expect(port.readLineEndings).toHaveBeenCalledWith({
        path: "C:/projects/site",
        sessionEpoch: "epoch-1",
      }),
    );
    expect(
      await screen.findByText(
        "This project sets its own, so your general choice doesn't apply while you work here.",
      ),
    ).toBeInTheDocument();
    // Both exceptions share one warning block rather than arriving as separate
    // pills in different tones.
    const caveat = document.querySelector(".line-endings__caveat");
    expect(caveat).not.toBeNull();
    expect(caveat).toHaveTextContent(/ships line-ending rules of its own/);
    expect(caveat).toHaveTextContent(/core\.eol\): lf/);
  });

  it("reports a failed write as a failure", async () => {
    const port = createPort({ setLineEndings: vi.fn(async () => Promise.reject(new Error("nope"))) });
    renderPanel(port, { initialSection: "line-endings" });

    await userEvent.click(await screen.findByRole("radio", { name: /Don't convert anything/ }));

    const notice = await screen.findByText("Couldn't save that.", {
      selector: ".settings-row__hint--danger span",
    });
    expect(notice).toBeInTheDocument();
  });
});

describe("Settings panel option groups", () => {
  it("is one Tab stop per group, with the arrow keys moving inside it", async () => {
    renderPanel(createPort(), { initialSection: "appearance" });

    const [system, light, dark] = screen.getAllByRole("radio", { name: /System|Light|Dark/ });
    expect(system).toHaveAttribute("tabindex", "0");
    expect(light).toHaveAttribute("tabindex", "-1");

    system.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(light).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(dark).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(system).toHaveFocus();
  });

  it("does not change a line-ending choice merely by arrowing past it", async () => {
    const port = createPort();
    renderPanel(port, { initialSection: "line-endings" });

    // The ARIA radio pattern usually selects as focus moves. Here that would
    // write to the user's global Git config on every arrow key, so focus moves
    // and the choice waits for Space or Enter.
    const options = await screen.findAllByRole("radio");
    options[0].focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(options[2]).toHaveFocus();
    expect(port.setLineEndings).not.toHaveBeenCalled();

    await userEvent.keyboard(" ");
    await waitFor(() => expect(port.setLineEndings).toHaveBeenCalledWith("keep_as_is"));
  });

  it("keeps a group with nothing selected reachable by keyboard", async () => {
    renderPanel(createPort(), { initialSection: "line-endings" });

    // Nothing is chosen, so there is no selected option to carry the Tab stop;
    // without a fallback the whole group would be unreachable.
    const options = await screen.findAllByRole("radio");
    expect(options.map((option) => option.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
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
    expect(screen.getByRole("tab", { name: "Line endings" })).toHaveAttribute("aria-selected", "true");
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

  it("edits the diff reading preferences without touching the others", async () => {
    const setDiffPreferences = vi.fn();
    renderPanel(createPort(), { initialSection: "reading", setDiffPreferences });

    await userEvent.click(screen.getByRole("switch", { name: "Wrap long lines" }));
    expect(setDiffPreferences).toHaveBeenCalledTimes(1);
    // The setter takes an updater so two controls changed in quick succession
    // cannot overwrite each other with a stale snapshot.
    const update = setDiffPreferences.mock.calls[0][0] as (p: DiffPreferences) => DiffPreferences;
    expect(update(DEFAULT_DIFF_PREFERENCES)).toEqual({ ...DEFAULT_DIFF_PREFERENCES, wrapLines: false });

    await userEvent.click(screen.getByRole("radio", { name: "2" }));
    const tabUpdate = setDiffPreferences.mock.calls[1][0] as (p: DiffPreferences) => DiffPreferences;
    expect(tabUpdate(DEFAULT_DIFF_PREFERENCES)).toEqual({ ...DEFAULT_DIFF_PREFERENCES, tabWidth: 2 });
  });

  it("offers its own reset once a diff preference is off its default", async () => {
    const setDiffPreferences = vi.fn();
    renderPanel(createPort(), {
      initialSection: "reading",
      diffPreferences: { ...DEFAULT_DIFF_PREFERENCES, tabWidth: 2 },
      setDiffPreferences,
    });

    // Reading has its own reset, covering only the diff preferences.
    const reset = screen.getByRole("button", { name: "Reset this section" });
    expect(reset).toBeEnabled();

    await userEvent.click(reset);
    const update = setDiffPreferences.mock.calls[0][0] as (p: DiffPreferences) => DiffPreferences;
    expect(update({ ...DEFAULT_DIFF_PREFERENCES, tabWidth: 2 })).toEqual(DEFAULT_DIFF_PREFERENCES);
  });

  it("marks the Git section when the installation needs attention", () => {
    renderPanel(createPort(), { gitDiagnostics: { state: "missing", version: null } });

    expect(screen.getByRole("tab", { name: /Git/ })).toContainElement(
      screen.getByRole("img", { name: "Git needs attention" }),
    );
  });
});
