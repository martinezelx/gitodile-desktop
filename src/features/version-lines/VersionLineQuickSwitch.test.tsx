import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import { LanguageProvider } from "../../i18n";
import type { CreateVersionLinePlan, VersionLine, VersionLinesSnapshot } from "./domain";
import type { VersionLineCreateContext } from "./VersionLineQuickCreateBox";
import { VersionLineQuickSwitch } from "./VersionLineQuickSwitch";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

function createContext(overrides: Partial<VersionLineCreateContext> = {}): VersionLineCreateContext {
  return {
    projectPath: "/repo",
    sessionEpoch: "epoch-1",
    onOperationStart: vi.fn(() => true),
    onOperationFinish: vi.fn(),
    onOperationPhaseChange: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  };
}

function line(name: string, options: Partial<VersionLine> = {}): VersionLine {
  return {
    name,
    tip: {
      commit: name.padEnd(40, "0").slice(0, 40),
      shortCommit: name.padEnd(7, "0").slice(0, 7),
      subject: `Latest saved work for ${name}`,
      committedAt: "2026-08-28T10:00:00Z",
    },
    isActive: false,
    upstream: null,
    isRetainedElsewhere: false,
    uniqueCommitCount: 1,
    worktreePath: null,
    upstreamAhead: null,
    upstreamBehind: null,
    upstreamGone: false,
    isDefault: false,
    ...options,
  };
}

const snapshot: VersionLinesSnapshot = {
  branch: "main",
  headState: "branch",
  currentCommit: "1111111111111111111111111111111111111111",
  lines: [
    line("main", { isActive: true, uniqueCommitCount: null }),
    ...Array.from({ length: 7 }, (_, index) => line(`feature/${index + 1}`)),
    line("feature/in-other-worktree", { worktreePath: "C:\\other" }),
  ],
  totalCount: 9,
  isTruncated: false,
  unreadableCount: 0,
};

afterEach(() => cleanup());

describe("VersionLineQuickSwitch", () => {
  it("offers a bounded, searchable dialog and returns only the chosen target", async () => {
    const onSwitch = vi.fn();
    const onSeeAll = vi.fn();
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          variant="status"
          onSwitch={onSwitch}
          onSeeAll={onSeeAll}
        />
      </LanguageProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Change version line (main)" });
    await userEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "Switch version line" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search version lines…" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "main" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "feature/7" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "feature/in-other-worktree" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "feature/2" }));
    expect(onSwitch).toHaveBeenCalledWith("feature/2");
    expect(screen.queryByRole("dialog", { name: "Switch version line" })).not.toBeInTheDocument();

    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("finds an eligible line beyond the initial status-bar rows", async () => {
    const onSwitch = vi.fn();
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          variant="status"
          onSwitch={onSwitch}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search version lines…" }), "feature/7");
    await userEvent.click(screen.getByRole("button", { name: "feature/7" }));
    expect(onSwitch).toHaveBeenCalledWith("feature/7");
  });

  it("keeps the status selector open while its own results scroll and shows commit context", async () => {
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          variant="status"
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    const dialog = screen.getByRole("dialog", { name: "Switch version line" });
    expect(screen.getByText("Latest saved work for feature/1")).toBeVisible();

    const results = dialog.querySelector(".version-lines-quick-switch__results");
    expect(results).not.toBeNull();
    fireEvent.scroll(results as HTMLElement);
    expect(dialog).toBeInTheDocument();

    fireEvent.scroll(document);
    expect(screen.queryByRole("dialog", { name: "Switch version line" })).not.toBeInTheDocument();
  });

  it("sorts favourites first and filters to them without closing the dialog", async () => {
    const favouriteLines = new Set(["feature/4"]);
    const onToggleFavourite = vi.fn();
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          favouriteLines={favouriteLines}
          onToggleFavourite={onToggleFavourite}
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    const lineButtons = screen.getAllByRole("button", { name: /^feature\/\d$/ });
    expect(lineButtons[0]).toHaveAccessibleName("feature/4");
    await userEvent.click(screen.getByRole("button", { name: "Add feature/2 to favourites" }));
    expect(onToggleFavourite).toHaveBeenCalledWith("feature/2");

    await userEvent.click(screen.getByRole("button", { name: "Show favourites only" }));
    expect(screen.getByRole("button", { name: "feature/4" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "feature/1" })).not.toBeInTheDocument();
  });

  it("renders a non-interactive line label when switching is unavailable", () => {
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="Specific saved version"
          canSwitch={false}
          variant="status"
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText("Specific saved version")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change version line/ })).not.toBeInTheDocument();
  });

  it("does not offer the session's current line while a cached snapshot catches up", async () => {
    const staleSnapshot: VersionLinesSnapshot = {
      ...snapshot,
      lines: snapshot.lines.map((entry) => ({ ...entry, isActive: entry.name === "feature/1" })),
    };
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={staleSnapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    expect(screen.queryByRole("button", { name: "main" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "feature/1" })).not.toBeInTheDocument();
  });

  it("states the context in front of the value, without repeating it to a screen reader", () => {
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="0.2.0-preview.1"
          contextLabel="Working on"
          canSwitch
          variant="status"
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText("Working on")).toBeInTheDocument();
    // The words are the sentence around the control, and the trigger's own
    // name already says what pressing it does, so they are not announced twice.
    expect(screen.getByText("Working on")).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByRole("button", { name: "Change version line (0.2.0-preview.1)" }),
    ).toBeInTheDocument();
  });

  it("makes a new line inside the popup, and hands managing lines to the Lines screen", async () => {
    const onSeeAll = vi.fn();
    const create = createContext();
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          contextLabel="Working on"
          canSwitch
          variant="status"
          onSwitch={vi.fn()}
          create={create}
          onSeeAll={onSeeAll}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    await userEvent.click(screen.getByRole("button", { name: "New line" }));
    // The composer docks at the popup's foot, in place of the footer, under
    // the list that stays: no modal, and no lock taken until the press.
    const field = screen.getByRole("textbox", { name: "New line name" });
    expect(field).toHaveValue("");
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "feature/1" })).toBeInTheDocument();
    expect(create.onOperationStart).not.toHaveBeenCalled();

    // Escape folds it back into the footer and leaves the popup open.
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "New line name" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "New line" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "New line name" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Manage lines" }));
    expect(onSeeAll).toHaveBeenCalledOnce();
  });

  it("offers a searched name no line has as a new line, and creates it in place", async () => {
    const create = createContext();
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          variant="status"
          onSwitch={vi.fn()}
          create={create}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    // A name a line already has — the active one, which the list leaves out —
    // is never offered.
    await userEvent.type(screen.getByRole("searchbox"), "main");
    expect(screen.queryByRole("button", { name: /Create “/ })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "feature/login");
    // Enter on a search that matched nothing opens the create view with the
    // name in it; it does not make the line.
    await userEvent.keyboard("{Enter}");
    const field = screen.getByRole("textbox", { name: "New line name" });
    expect(field).toHaveValue("feature/login");
    expect(mockedInvoke).not.toHaveBeenCalled();

    const plan: CreateVersionLinePlan = {
      operationKind: "local-mutation",
      summary: "Create",
      steps: [],
      risks: [],
      recovery: "",
      requiresConfirmation: false,
      stateToken: "create-token",
      name: "feature/login",
      headState: "branch",
      startingCommit: null,
      fromSavedVersion: false,
      willSwitch: true,
      hasUnsavedWork: false,
    };
    const created = { ...snapshot, branch: "feature/login" };
    mockedInvoke.mockResolvedValueOnce(plan);
    mockedInvoke.mockResolvedValueOnce(created);
    await userEvent.click(screen.getByRole("button", { name: "Create and switch" }));

    await waitFor(() => expect(create.onCreated).toHaveBeenCalledWith(created));
    expect(create.onOperationStart).toHaveBeenCalledOnce();
    expect(mockedInvoke).toHaveBeenCalledWith(
      "create_version_line",
      expect.objectContaining({ name: "feature/login", switch: true, stateToken: "create-token" }),
    );
    // Made, the popup closes: the control it hangs from names the line now.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers no way to create a line where the host gives it nowhere to make one", async () => {
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          variant="status"
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    await userEvent.type(screen.getByRole("searchbox"), "feature/login");
    expect(screen.queryByRole("button", { name: "New line" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create “/ })).not.toBeInTheDocument();
  });

  it("keeps the status strip free of a second creation control", async () => {
    // 34px of chrome across the whole window: the dropdown carries the action,
    // and only the roomier control beside Overview's cards shows a button too.
    const props = {
      snapshot,
      isLoadingSnapshot: false,
      currentValue: "main",
      canSwitch: true,
      onSwitch: vi.fn(),
      create: createContext(),
      onSeeAll: vi.fn(),
    } as const;
    const view = render(
      <LanguageProvider>
        <VersionLineQuickSwitch {...props} variant="status" />
      </LanguageProvider>,
    );
    expect(screen.queryByRole("button", { name: "New line" })).not.toBeInTheDocument();

    view.rerender(
      <LanguageProvider>
        <VersionLineQuickSwitch {...props} variant="control" />
      </LanguageProvider>,
    );
    expect(screen.getByRole("button", { name: "New line" })).toBeInTheDocument();
  });

  it("states the line actions it does not have yet, opened from the row's More button", async () => {
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="main"
          canSwitch
          variant="status"
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change version line (main)" }));
    // The `⋯` is present before the pointer is: it is not a hover affordance.
    await userEvent.click(screen.getByRole("button", { name: "What “feature/1” can do" }));

    // Each action names both ends, and none is enabled: the flows are not built.
    expect(screen.getByRole("menuitem", { name: /Merge into “main”/ })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /Rebase “main” onto this/ })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /Compare with “main”/ })).toBeDisabled();
    expect(screen.getByText("Merge, rebase and compare are coming soon.")).toBeInTheDocument();
    // Renaming and deleting stay on the Lines screen, not here.
    expect(screen.queryByRole("menuitem", { name: /Rename|Delete/ })).not.toBeInTheDocument();

    // Back returns to the list without closing the control that opened it.
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("dialog", { name: "Switch version line" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search version lines…" })).toBeInTheDocument();
  });

  it("says nothing selectable when there is no line to be on", () => {
    // Detached, unborn and unavailable are facts, not lines: the value is
    // static and the words in front of it still read correctly.
    render(
      <LanguageProvider>
        <VersionLineQuickSwitch
          snapshot={snapshot}
          isLoadingSnapshot={false}
          currentValue="Specific saved version"
          contextLabel="Working on"
          canSwitch={false}
          variant="status"
          onSwitch={vi.fn()}
          onSeeAll={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText("Working on")).toBeInTheDocument();
    expect(screen.getByText("Specific saved version")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change version line/ })).not.toBeInTheDocument();
  });
});
