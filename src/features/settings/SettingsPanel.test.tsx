import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { DEFAULT_DIFF_PREFERENCES, type DiffPreferences } from "../changes";
import { SettingsPanel } from "./SettingsPanel";
import { useDefaultBranch, useGitIdentity, useLineEndings } from "./useGitConfig";
import type { SettingsPort } from "./port";
import type { GitDiagnostics, GitLineEndings, GitUpdateStatus, SettingsSection, ThemePreference } from "./domain";
import type { NavigationPreferences } from "./domain";

afterEach(cleanup);

function createPort(overrides: Partial<SettingsPort> = {}): SettingsPort {
  return {
    readDiagnostics: vi.fn(async () => ({ state: "available", version: "2.45.0" }) as GitDiagnostics),
    checkUpdate: vi.fn(async () => ({ state: "up_to_date", cached: false }) as GitUpdateStatus),
    installGit: vi.fn(async () => ({ outcome: "started" as const, platform: "windows" as const, guidanceUrl: null })),
    updateGit: vi.fn(async () => ({ outcome: "started" as const })),
    getIdentity: vi.fn(async () => ({ name: null, email: null })),
    setIdentity: vi.fn(async () => undefined),
    getDefaultBranch: vi.fn(async () => ({ name: null })),
    setDefaultBranch: vi.fn(async () => undefined),
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
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  onClose: () => void;
  onRegisterCloseGuard: (guard: (() => boolean) | null) => void;
  setReopenLastProject: (value: boolean) => void;
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  confirmCloseProject: boolean;
  setConfirmCloseProject: (value: boolean) => void;
  watchProjects: boolean;
  setWatchProjects: (value: boolean) => void;
  remoteCheckInterval: number;
  setRemoteCheckInterval: (value: number) => void;
  confirmDiscard: boolean;
  setConfirmDiscard: (value: boolean) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (value: boolean) => void;
  navigationPreferences: NavigationPreferences;
  setNavigationPreferences: (
    update: (previous: NavigationPreferences) => NavigationPreferences,
  ) => void;
  diffPreferences: DiffPreferences;
  setDiffPreferences: (update: (previous: DiffPreferences) => DiffPreferences) => void;
  runGitHooks: boolean;
  setRunGitHooks: (value: boolean) => void;
  project: { path: string; sessionEpoch: string } | null;
}>;

/** The section is app state in production, so the harness owns it here too —
 * and so are the two config reads, which run through their real hooks rather
 * than a stand-in, so these tests still exercise the whole path from the
 * panel's controls down to the port. */
function Harness({ port, overrides }: { port: SettingsPort; overrides: PanelOverrides }): React.JSX.Element {
  const [section, setSection] = useState<SettingsSection>(overrides.initialSection ?? "general");
  const identity = useGitIdentity(port);
  const defaultBranch = useDefaultBranch(port);
  const lineEndings = useLineEndings(
    port,
    overrides.project?.path ?? null,
    overrides.project?.sessionEpoch ?? null,
  );
  /* Held by the harness rather than passed as a constant: the hooks switch is
     the one control whose own state changes what the panel says underneath
     it, so a test that flips it has to see the result. */
  const [runGitHooks, setRunGitHooks] = useState(overrides.runGitHooks ?? false);
  return (
    <SettingsPanel
      theme={overrides.theme ?? "system"}
      setTheme={overrides.setTheme ?? vi.fn()}
      reducedMotion={overrides.reducedMotion ?? false}
      setReducedMotion={overrides.setReducedMotion ?? vi.fn()}
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
      confirmCloseProject={overrides.confirmCloseProject ?? false}
      setConfirmCloseProject={overrides.setConfirmCloseProject ?? vi.fn()}
      watchProjects={overrides.watchProjects ?? true}
      setWatchProjects={overrides.setWatchProjects ?? vi.fn()}
      remoteCheckInterval={overrides.remoteCheckInterval ?? 0}
      setRemoteCheckInterval={overrides.setRemoteCheckInterval ?? vi.fn()}
      confirmDiscard={overrides.confirmDiscard ?? true}
      setConfirmDiscard={overrides.setConfirmDiscard ?? vi.fn()}
      notificationsEnabled={overrides.notificationsEnabled ?? true}
      setNotificationsEnabled={overrides.setNotificationsEnabled ?? vi.fn()}
      runGitHooks={runGitHooks}
      setRunGitHooks={(value) => {
        overrides.setRunGitHooks?.(value);
        setRunGitHooks(value);
      }}
      navigationItems={[
        { id: "overview", label: "Overview", icon: <span /> },
        { id: "changes", label: "Changes", icon: <span /> },
        { id: "history", label: "History", icon: <span /> },
      ]}
      navigationPreferences={overrides.navigationPreferences ?? {
        visibleDestinationIds: ["overview", "changes", "history"],
        destinationOrderIds: ["overview", "changes", "history"],
        displayMode: "icons-and-text",
      }}
      setNavigationPreferences={overrides.setNavigationPreferences ?? vi.fn()}
      diffPreferences={overrides.diffPreferences ?? DEFAULT_DIFF_PREFERENCES}
      setDiffPreferences={overrides.setDiffPreferences ?? vi.fn()}
      identity={identity}
      defaultBranch={defaultBranch}
      lineEndingsState={lineEndings}
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

  it("reads the identity and the line endings once and keeps them across openings", async () => {
    const port = createPort({ getIdentity: vi.fn(async () => ({ name: "Ada", email: "ada@example.com" })) });

    // The shell unmounts the panel on close, so the reads live above it. This
    // harness stands in for that shell: the hooks stay mounted while the panel
    // comes and goes, which is the whole point of the change.
    function Shell(): React.JSX.Element {
      const [isOpen, setIsOpen] = useState(true);
      const identity = useGitIdentity(port);
      const defaultBranch = useDefaultBranch(port);
      const lineEndings = useLineEndings(port, null, null);
      return (
        <>
          <button type="button" onClick={() => setIsOpen((open) => !open)}>
            toggle
          </button>
          {isOpen && (
            <SettingsPanel
              theme="system"
              setTheme={vi.fn()}
              reducedMotion={false}
              setReducedMotion={vi.fn()}
              activeSection="git"
              onSectionChange={vi.fn()}
              gitDiagnostics={{ state: "available", version: "2.45.0" }}
              gitUpdateStatus={null}
              onCheckGitUpdate={vi.fn(async () => undefined)}
              isCheckingGitUpdate={false}
              onRefreshGitDiagnostics={vi.fn(async () => undefined)}
              isRefreshingGitDiagnostics={false}
              reopenLastProject={false}
              setReopenLastProject={vi.fn()}
              confirmCloseProject={false}
              setConfirmCloseProject={vi.fn()}
              watchProjects
              setWatchProjects={vi.fn()}
              remoteCheckInterval={0}
              setRemoteCheckInterval={vi.fn()}
              confirmDiscard
              setConfirmDiscard={vi.fn()}
              notificationsEnabled
              setNotificationsEnabled={vi.fn()}
              runGitHooks={false}
              setRunGitHooks={vi.fn()}
              navigationItems={[]}
              navigationPreferences={{
                visibleDestinationIds: [],
                destinationOrderIds: [],
                displayMode: "icons-and-text",
              }}
              setNavigationPreferences={vi.fn()}
              diffPreferences={DEFAULT_DIFF_PREFERENCES}
              setDiffPreferences={vi.fn()}
              identity={identity}
              defaultBranch={defaultBranch}
              lineEndingsState={lineEndings}
              port={port}
            />
          )}
        </>
      );
    }

    render(
      <LanguageProvider>
        <Shell />
      </LanguageProvider>,
    );

    expect(await screen.findByDisplayValue("Ada")).toBeInTheDocument();
    await waitFor(() => expect(port.getIdentity).toHaveBeenCalledTimes(1));
    expect(port.readLineEndings).toHaveBeenCalledTimes(1);

    const toggle = screen.getByRole("button", { name: "toggle" });
    await userEvent.click(toggle);
    expect(screen.queryByDisplayValue("Ada")).toBeNull();
    await userEvent.click(toggle);

    // Reopening shows the saved values on the first frame — `getByDisplayValue`
    // rather than `findByDisplayValue`, so a re-read that resolved later would
    // not be enough to pass — and asks the port for nothing.
    expect(screen.getByDisplayValue("Ada")).toBeInTheDocument();
    expect(port.getIdentity).toHaveBeenCalledTimes(1);
    expect(port.readLineEndings).toHaveBeenCalledTimes(1);
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
  it("offers reduced motion in Appearance and leaves it off by default", async () => {
    const setReducedMotion = vi.fn();
    renderPanel(createPort(), { initialSection: "appearance", setReducedMotion });

    const motionSwitch = screen.getByRole("switch", { name: "Reduce motion" });
    expect(motionSwitch).toHaveAttribute("aria-checked", "false");

    await userEvent.click(motionSwitch);
    expect(setReducedMotion).toHaveBeenCalledWith(true);
  });

  it("presents each theme as a preview and names its scheme for assistive tech", async () => {
    const setTheme = vi.fn();
    renderPanel(createPort(), { initialSection: "appearance", setTheme });

    const official = screen.getByRole("radiogroup", { name: "Official" });
    // "Match device" carries the auto scheme; the official pair names light/dark.
    expect(within(official).getByRole("radio", { name: "Match device, follows your device" }))
      .toHaveAttribute("aria-checked", "true");
    expect(within(official).getByRole("radio", { name: "GitOdile Light, light theme" }))
      .toHaveAttribute("aria-checked", "false");
    // Community palettes live in their own group, each with a miniature.
    const more = screen.getByRole("radiogroup", { name: "More themes" });
    expect(within(more).getByRole("radio", { name: "Catppuccin Mocha, dark theme" })).toBeInTheDocument();
    expect(more.querySelectorAll(".theme-preview").length).toBe(9);

    await userEvent.click(within(more).getByRole("radio", { name: /Catppuccin Mocha/ }));
    expect(setTheme).toHaveBeenCalledWith("catppuccin-mocha");
  });

  it("is one Tab stop per group, with the arrow keys moving inside it", async () => {
    renderPanel(createPort(), { initialSection: "appearance" });

    const official = screen.getByRole("radiogroup", { name: "Official" });
    const options = within(official).getAllByRole("radio");
    expect(options.map((option) => option.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);

    options[0].focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(options[1]).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(options[2]).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(options[0]).toHaveFocus();
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

describe("Settings panel default version line", () => {
  it("reads the stored name and selects the matching suggestion", async () => {
    const port = createPort({ getDefaultBranch: vi.fn(async () => ({ name: "master" })) });
    renderPanel(port, { initialSection: "git" });

    await waitFor(() => expect(port.getDefaultBranch).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("radio", { name: "master" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "main" })).toHaveAttribute("aria-checked", "false");
  });

  it("shows the name new projects get when nothing is stored, without writing it", async () => {
    const port = createPort();
    renderPanel(port, { initialSection: "git" });

    // An empty group reads as unfinished. `main` is what GitOdile will
    // actually name the first version line, so that is what is shown.
    expect(await screen.findByRole("radio", { name: "main" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "master" })).toHaveAttribute("aria-checked", "false");
    // Shown, not stored: nothing is written to the user's Git configuration
    // until they pick an option, and the hint has to say which state this is.
    expect(
      screen.getByText(/Not saved to your Git configuration yet/),
    ).toBeInTheDocument();
    expect(port.setDefaultBranch).not.toHaveBeenCalled();
  });

  it("writes a suggestion straight through the port", async () => {
    const port = createPort();
    renderPanel(port, { initialSection: "git" });
    await waitFor(() => expect(port.getDefaultBranch).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("radio", { name: "main" }));
    await waitFor(() => expect(port.setDefaultBranch).toHaveBeenCalledWith("main"));
    expect(await screen.findByText("Default version line saved.")).toBeInTheDocument();
  });

  it("writes once when a typed draft is abandoned for a suggestion", async () => {
    const port = createPort();
    renderPanel(port, { initialSection: "git" });
    await waitFor(() => expect(port.getDefaultBranch).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("radio", { name: "Other" }));
    await userEvent.type(screen.getByLabelText("Version-line name"), "trunk");

    // Blur fires before click. Committing the draft from the field's own
    // `onBlur` raced this button, and whichever write landed last won.
    await userEvent.click(screen.getByRole("radio", { name: "master" }));

    await waitFor(() => expect(port.setDefaultBranch).toHaveBeenCalledTimes(1));
    expect(port.setDefaultBranch).toHaveBeenCalledWith("master");
    expect(await screen.findByRole("radio", { name: "master" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("takes a typed name and reports Git's verdict on a bad one", async () => {
    const port = createPort({
      setDefaultBranch: vi.fn(async (name: string) => {
        if (name === "not a branch") {
          throw { code: "invalid_initial_branch", message: "no" };
        }
      }),
    });
    renderPanel(port, { initialSection: "git" });
    await waitFor(() => expect(port.getDefaultBranch).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("radio", { name: "Other" }));
    const field = screen.getByLabelText("Version-line name");
    await userEvent.type(field, "trunk");
    await userEvent.tab();
    await waitFor(() => expect(port.setDefaultBranch).toHaveBeenCalledWith("trunk"));

    await userEvent.clear(field);
    await userEvent.type(field, "not a branch");
    await userEvent.tab();
    // Git's own message, localized here rather than invented by the panel.
    expect(
      await screen.findByText("Choose a valid initial version-line name such as main."),
    ).toBeInTheDocument();
  });
});

describe("Settings panel Git hooks", () => {
  it("says nothing about skipping while hooks are running", async () => {
    renderPanel(createPort(), { initialSection: "git", runGitHooks: true });

    const toggle = await screen.findByRole("switch", {
      name: "Run Git hooks when saving and publishing",
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/GitOdile skips them in every project/)).toBeNull();
    // The row must not read as a property of the open project: the switch is
    // app-wide, and the copy has to say so where it is set.
    expect(screen.getByText(/applies to every project you open in GitOdile/)).toBeInTheDocument();
  });

  it("states the cost as soon as hooks are turned off", async () => {
    const setRunGitHooks = vi.fn();
    renderPanel(createPort(), { initialSection: "git", runGitHooks: true, setRunGitHooks });

    await userEvent.click(
      await screen.findByRole("switch", { name: "Run Git hooks when saving and publishing" }),
    );
    expect(setRunGitHooks).toHaveBeenCalledWith(false);
    // Turning them off is the choice that costs something, so that is the
    // state that has to explain itself.
    expect(
      await screen.findByText(/GitOdile skips them in every project/),
    ).toBeInTheDocument();
  });
});

describe("Settings panel remote-check cadence", () => {
  it("stores a preset directly", async () => {
    const setRemoteCheckInterval = vi.fn();
    renderPanel(createPort(), { setRemoteCheckInterval });

    await userEvent.click(screen.getByRole("radio", { name: "Every 30 minutes" }));
    expect(setRemoteCheckInterval).toHaveBeenCalledWith(30);
  });

  it("takes a custom number of minutes or hours", async () => {
    const setRemoteCheckInterval = vi.fn();
    renderPanel(createPort(), { setRemoteCheckInterval, remoteCheckInterval: 15 });

    await userEvent.click(screen.getByRole("radio", { name: "A custom frequency" }));
    const field = screen.getByLabelText("How often to check");
    await userEvent.clear(field);
    await userEvent.type(field, "5");
    expect(setRemoteCheckInterval).toHaveBeenLastCalledWith(5);

    await userEvent.click(screen.getByRole("radio", { name: "hours" }));
    expect(setRemoteCheckInterval).toHaveBeenLastCalledWith(300);
  });

  it("refuses a value past the bounds instead of storing it", async () => {
    const setRemoteCheckInterval = vi.fn();
    renderPanel(createPort(), { setRemoteCheckInterval, remoteCheckInterval: 15 });

    await userEvent.click(screen.getByRole("radio", { name: "A custom frequency" }));
    const field = screen.getByLabelText("How often to check");
    await userEvent.clear(field);
    setRemoteCheckInterval.mockClear();
    await userEvent.type(field, "2000");

    expect(await screen.findByText("Choose between 1 minute and 24 hours.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    // 2000 was never stored; the last accepted prefix ("200") was, and the
    // panel keeps showing what was typed.
    expect(setRemoteCheckInterval).not.toHaveBeenCalledWith(2000);
    expect(field).toHaveValue(2000);
  });

  it("opens the custom field already showing a stored value the presets cannot express", async () => {
    renderPanel(createPort(), { remoteCheckInterval: 300 });

    expect(screen.getByRole("radio", { name: "A custom frequency" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("How often to check")).toHaveValue(5);
    expect(screen.getByRole("radio", { name: "hours" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Every 5 hours")).toBeInTheDocument();
  });
});

describe("Settings panel date and number formats", () => {
  it("previews each choice with the value it would produce", async () => {
    renderPanel(createPort(), { initialSection: "appearance" });

    expect(screen.getByRole("radio", { name: "Year first: 2026-03-09" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Day first: 09/03/2026" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Dot groups: 1.234.567,89" }),
    ).toBeInTheDocument();
  });

  it("keeps the choice and applies it to the previews", async () => {
    renderPanel(createPort(), { initialSection: "appearance" });

    const dayFirst = screen.getByRole("radio", { name: "Day first: 09/03/2026" });
    expect(dayFirst).toHaveAttribute("aria-checked", "false");
    await userEvent.click(dayFirst);
    await waitFor(() => expect(dayFirst).toHaveAttribute("aria-checked", "true"));
    expect(localStorage.getItem("gitodile-date-format")).toBe("day-first");
  });
});

describe("Settings panel section rail", () => {
  it("uses the selected rail label as the single heading for one shared tabpanel", async () => {
    renderPanel(createPort());

    const panel = screen.getByRole("tabpanel", { name: "General" });
    expect(screen.queryByRole("heading", { name: "General" })).toBeNull();
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveAttribute("aria-controls", "settings-panel");
    }
    expect(panel).not.toHaveAttribute("aria-describedby");

    await userEvent.click(screen.getByRole("tab", { name: "Interface" }));
    expect(screen.getByRole("tabpanel", { name: "Interface" })).toBe(panel);
    expect(screen.queryByRole("heading", { name: "Interface" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Theme", level: 3 })).toBeInTheDocument();
  });

  it("customizes which destinations stay in the rail and its presentation", async () => {
    const setNavigationPreferences = vi.fn();
    renderPanel(createPort(), { initialSection: "navigation" });

    expect(screen.getByRole("tab", { name: "Navigation" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Sections shown in the bar" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Overview" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Icons and text/ })).toBeChecked();

    cleanup();
    renderPanel(createPort(), {
      initialSection: "navigation",
      setNavigationPreferences,
    });
    await userEvent.click(screen.getByRole("switch", { name: "Changes" }));
    const visibilityUpdate = setNavigationPreferences.mock.calls[0][0] as (
      previous: NavigationPreferences,
    ) => NavigationPreferences;
    expect(visibilityUpdate({
      visibleDestinationIds: ["overview", "changes", "history"],
      destinationOrderIds: ["overview", "changes", "history"],
      displayMode: "icons-and-text",
    })).toEqual({
      visibleDestinationIds: ["overview", "history"],
      destinationOrderIds: ["overview", "changes", "history"],
      displayMode: "icons-and-text",
    });

    await userEvent.click(screen.getByRole("radio", { name: /Icons only/ }));
    const appearanceUpdate = setNavigationPreferences.mock.calls[1][0] as (
      previous: NavigationPreferences,
    ) => NavigationPreferences;
    expect(appearanceUpdate({
      visibleDestinationIds: ["overview", "history"],
      destinationOrderIds: ["overview", "changes", "history"],
      displayMode: "icons-and-text",
    })).toEqual({
      visibleDestinationIds: ["overview", "history"],
      destinationOrderIds: ["overview", "changes", "history"],
      displayMode: "icons-only",
    });
  });

  it("reorders destinations from the drag handle without changing visibility", async () => {
    const setNavigationPreferences = vi.fn();
    renderPanel(createPort(), { initialSection: "navigation", setNavigationPreferences });

    const handle = screen.getByRole("button", { name: "Reorder: Overview" });
    handle.focus();
    await userEvent.keyboard("{ArrowDown}");

    const reorder = setNavigationPreferences.mock.calls[0][0] as (
      previous: NavigationPreferences,
    ) => NavigationPreferences;
    expect(reorder({
      visibleDestinationIds: ["overview", "changes", "history"],
      destinationOrderIds: ["overview", "changes", "history"],
      displayMode: "icons-and-text",
    })).toEqual({
      visibleDestinationIds: ["overview", "changes", "history"],
      destinationOrderIds: ["changes", "overview", "history"],
      displayMode: "icons-and-text",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Overview. New position 2 of 3.");
  });

  it("reorders with captured pointer movement over another row", () => {
    const setNavigationPreferences = vi.fn();
    renderPanel(createPort(), { initialSection: "navigation", setNavigationPreferences });
    const source = screen.getByRole("button", { name: "Reorder: Overview" });
    const target = screen.getByRole("switch", { name: "History" }).closest(".navigation-destination");
    expect(target).not.toBeNull();
    Object.defineProperties(source, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => target),
    });

    fireEvent.pointerDown(source, { button: 0, pointerId: 1 });
    fireEvent.pointerMove(source, { clientX: 400, clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(source, { pointerId: 1 });

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });

    const reorder = setNavigationPreferences.mock.calls[0][0] as (
      previous: NavigationPreferences,
    ) => NavigationPreferences;
    expect(reorder({
      visibleDestinationIds: ["overview", "changes", "history"],
      destinationOrderIds: ["overview", "changes", "history"],
      displayMode: "icons-and-text",
    }).destinationOrderIds).toEqual(["changes", "history", "overview"]);
  });

  it("moves a destination with the explicit arrow buttons", async () => {
    const setNavigationPreferences = vi.fn();
    renderPanel(createPort(), { initialSection: "navigation", setNavigationPreferences });

    expect(screen.getByRole("button", { name: "Move up: Overview" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move down: Overview" }));

    const reorder = setNavigationPreferences.mock.calls[0][0] as (
      previous: NavigationPreferences,
    ) => NavigationPreferences;
    expect(reorder({
      visibleDestinationIds: ["overview", "changes", "history"],
      destinationOrderIds: ["overview", "changes", "history"],
      displayMode: "icons-and-text",
    }).destinationOrderIds).toEqual(["changes", "overview", "history"]);
    expect(screen.getByRole("button", { name: "Move down: History" })).toBeDisabled();
  });

  it("moves between sections with the arrow keys", async () => {
    renderPanel(createPort());

    const general = screen.getByRole("tab", { name: "General" });
    expect(general).toHaveAttribute("aria-selected", "true");
    // Roving tabindex: the rail is one Tab stop, not one per section.
    expect(screen.getByRole("tab", { name: "Interface" })).toHaveAttribute("tabindex", "-1");

    general.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "Notifications" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "While you're doing something else" })).toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "Interface" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Language" })).toBeInTheDocument();

    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Updates" })).toHaveAttribute("aria-selected", "true");
  });

  it("turns notifications off from their own section and names what they cover", async () => {
    const setNotificationsEnabled = vi.fn();
    renderPanel(createPort(), { initialSection: "notifications", setNotificationsEnabled });

    const toggle = screen.getByRole("switch", { name: "Enable notifications" });
    expect(toggle).toBeChecked();
    // The section heading is the rail's job; the groups name the situation and
    // the contents, and never repeat "Notifications" back at the reader.
    expect(screen.getByRole("heading", { name: "While you're doing something else" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What you'll be told about" })).toBeInTheDocument();
    for (const event of [
      "Newer project versions",
      "A check that couldn't connect",
      "Changes you published",
    ]) {
      expect(screen.getByText(event)).toBeInTheDocument();
    }

    await userEvent.click(toggle);

    expect(setNotificationsEnabled).toHaveBeenCalledWith(false);
  });

  it("offers watching and discard confirmation as General toggles, both on by default", async () => {
    const setWatchProjects = vi.fn();
    const setConfirmDiscard = vi.fn();
    renderPanel(createPort(), { setWatchProjects, setConfirmDiscard });

    const watching = screen.getByRole("switch", { name: "Keep project screens up to date" });
    const confirming = screen.getByRole("switch", { name: "Confirm before discarding changes" });
    expect(watching).toBeChecked();
    expect(confirming).toBeChecked();

    await userEvent.click(watching);
    await userEvent.click(confirming);

    expect(setWatchProjects).toHaveBeenCalledWith(false);
    expect(setConfirmDiscard).toHaveBeenCalledWith(false);
  });

  it("offers an opt-in automatic remote-check frequency", async () => {
    const setRemoteCheckInterval = vi.fn();
    renderPanel(createPort(), { setRemoteCheckInterval });

    const frequency = screen.getByRole("radiogroup", { name: "Automatic remote check frequency" });
    expect(within(frequency).getByRole("radio", { name: "Never" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(frequency).getByRole("radio", { name: "Every 15 minutes" }));
    expect(setRemoteCheckInterval).toHaveBeenCalledWith(15);
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

  it("picks the code font, and shows each option in the font it names", async () => {
    const setDiffPreferences = vi.fn();
    renderPanel(createPort(), { initialSection: "reading", setDiffPreferences });

    // The font lives in its own group, not among the diff layout options.
    expect(screen.getByRole("heading", { name: "Code font" })).toBeInTheDocument();

    const atkinson = screen.getByRole("radio", { name: "Hyperlegible" });
    expect(atkinson).toHaveAttribute("aria-checked", "true");
    // The card is drawn in the family it selects, so someone can choose by
    // looking rather than by knowing brand names.
    expect(atkinson.style.fontFamily).toContain("Atkinson Hyperlegible Mono");
    // The specimen is for the eye only: a screen reader cannot convey a glyph
    // shape, so it must not reach the option's accessible name.
    expect(atkinson.textContent).toContain("0O 1lI");
    expect(atkinson.querySelector(".font-picker__sample")).toHaveAttribute("aria-hidden", "true");

    const jetbrains = screen.getByRole("radio", { name: "JetBrains" });
    expect(jetbrains.style.fontFamily).toContain("JetBrains Mono");
    await userEvent.click(jetbrains);
    const update = setDiffPreferences.mock.calls[0][0] as (p: DiffPreferences) => DiffPreferences;
    expect(update(DEFAULT_DIFF_PREFERENCES)).toEqual({
      ...DEFAULT_DIFF_PREFERENCES,
      codeFont: "jetbrains",
    });

    // Every stack keeps a monospaced fallback, including the system option,
    // so a face that fails to load cannot break column alignment.
    for (const name of ["Hyperlegible", "JetBrains", "Plex", "System"]) {
      expect(screen.getByRole("radio", { name }).style.fontFamily).toContain("monospace");
    }
  });

  it("marks the Git section when the installation needs attention", () => {
    renderPanel(createPort(), { gitDiagnostics: { state: "missing", version: null } });

    expect(screen.getByRole("tab", { name: /Git/ })).toContainElement(
      screen.getByRole("img", { name: "Git needs attention" }),
    );
  });
});
