import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../i18n";
import { App } from "./App";
import type { HistoryPage, SavedVersionSummary } from "../features/history";
import {
  installAppTestHooks,
  mockedInvoke,
  restoredProject,
  cleanStatus,
  branches,
} from "../test-fixtures/appTestHarness";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class TestChannel<T> {
    onmessage?: (message: T) => void;
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
// Off by default, as in a browser or on Windows and Linux; the macOS test
// in App.test.tsx turns it on and drives the menu through the fake port.
vi.mock("./nativeAppMenu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./nativeAppMenu")>()),
  hasNativeMacWindowChrome: vi.fn(() => false),
}));
vi.mock("./nativeAppMenuAdapter", () => ({
  nativeAppMenuPort: { install: vi.fn(async () => ({ update: vi.fn(async () => undefined) })) },
}));

installAppTestHooks();

describe("App navigation", () => {
  it("defaults to the first file/version and preserves user context across palette, rail and tab navigation", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }));
    const files = ["README.md", "src/z.ts", "src/a.ts"].map((path) => ({ path, originalPath: null, category: "changed" as const }));
    const versions: SavedVersionSummary[] = [2, 1].map((index) => ({
      commit: String(index).repeat(40), shortCommit: String(index).repeat(7), parents: [],
      subject: index === 2 ? "Newest version" : "Older version", description: "",
      author: { name: "Ada", email: "ada@example.test" },
      authoredAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 0 },
      committedAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 0 },
      decorations: [], isRoot: true, isMerge: false, publication: "local-only",
      subjectTruncated: false, descriptionTruncated: false, decorationsTruncated: false, messageUnavailable: null,
    }));
    const history: HistoryPage = {
      repositoryId: restoredProject.path, snapshotToken: "first-selection", scope: { kind: "currentBranch" },
      branch: "main", headState: "branch", headCommit: versions[0].commit, upstream: null, versions,
      nextCursor: null, hasMore: false, shallow: false, warnings: [],
    };
    mockedInvoke.mockImplementation((command, args) => {
      const request = args as { commit?: string; filePath?: string } | undefined;
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve({
        ...cleanStatus, isClean: false, counts: { ...cleanStatus.counts, changed: 3, total: 3 },
        entries: files.map((file) => ({ ...file, isPrepared: false, hasUnpreparedChanges: true })),
      });
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_history_page") return Promise.resolve(history);
      if (command === "read_saved_version_detail") return Promise.resolve({
        version: versions.find((version) => version.commit === request?.commit) ?? versions[0],
        comparisonBase: "empty-tree", comparisonIsEmptyTree: true, comparisonIsFirstParent: false,
        files, fileCounts: { changed: 3, new: 0, deleted: 0, renamed: 0, total: 3 }, filesTruncated: false, countsAreMinimum: false,
      });
      if (command === "read_file_diff" || command === "read_saved_version_file_diff") return Promise.resolve({
        kind: "binary", path: request?.filePath, originalPath: null, change: "changed",
      });
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "get_branches") return Promise.resolve({
        ...branches, branches: branches.branches.map((branch) => ({ ...branch, isFinished: false })),
      });
      if (command === "get_branch_history") return Promise.resolve({
        name: (args as { name: string }).name, totalCount: 0, versions: [], hasMore: false, unpublished: null, route: null,
      });
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });
    const go = async (name: string): Promise<void> => {
      await user.click(screen.getByRole("combobox", { name: "Open command palette" }));
      await user.click(within(screen.getByRole("listbox", { name: "Command palette" })).getByText(name));
    };
    const firstFile = async (): Promise<void> => {
      await waitFor(() => expect(screen.getByRole("button", { name: /^src\/a\.ts/ })).toHaveAttribute("aria-current", "true"), { timeout: 5000 });
    };
    const selectedRootFile = (): void => {
      expect(screen.getByRole("button", { name: /^README\.md/ })).toHaveAttribute("aria-current", "true");
    };
    await go("Go to Changes");
    await firstFile();
    await user.click(screen.getByRole("button", { name: /^README\.md/ }));
    const changesFolder = screen.getByRole("button", { name: "src folder, 2 files" });
    await user.click(changesFolder);
    await go("Go to Changes");
    selectedRootFile();
    expect(changesFolder).toHaveAttribute("aria-expanded", "false");
    await go("Go to History");
    await firstFile();
    await user.click(screen.getByRole("treeitem", { name: /Older version/ }));
    await user.click(screen.getByRole("button", { name: /^README\.md/ }));
    const timeline = screen.getByRole("tree", { name: "Saved versions timeline" });
    timeline.scrollTop = 800;
    fireEvent.scroll(timeline);
    await go("Go to History");
    expect(screen.getByRole("treeitem", { name: /Older version/ })).toHaveAttribute("aria-selected", "true");
    selectedRootFile();
    expect(timeline.scrollTop).toBe(800);
    const nav = screen.getByRole("navigation", { name: "Project navigation" });
    await user.click(within(nav).getByRole("button", { name: "Overview" }));
    await user.click(within(nav).getByRole("button", { name: "Work" }));
    selectedRootFile();
    expect(screen.getByRole("treeitem", { name: /Older version/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tree", { name: "Saved versions timeline" })).toBe(timeline);
    expect(timeline.scrollTop).toBe(800);
    await user.click(screen.getByRole("tab", { name: "Changes" }));
    selectedRootFile();
    expect(changesFolder).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("tab", { name: "History" }));
    selectedRootFile();
    expect(screen.getByRole("treeitem", { name: /Older version/ })).toHaveAttribute("aria-selected", "true");
    expect(timeline.scrollTop).toBe(800);
    // A targeted link still overrides the retained older version.
    await user.click(within(nav).getByRole("button", { name: "Overview" }));
    await user.click(await screen.findByRole("button", { name: /Open “Newest version” in History/ }));
    expect(await screen.findByRole("treeitem", { name: /Newest version/ })).toHaveAttribute("aria-selected", "true");
    await firstFile();
    await user.click(within(nav).getByRole("button", { name: "Overview" }));
    await user.click(await screen.findByRole("button", { name: /Open “Older version” in History/ }));
    expect(await screen.findByRole("treeitem", { name: /Older version/ })).toHaveAttribute("aria-selected", "true");
    await user.click(within(nav).getByRole("button", { name: "Branches" }));
    // Like firstFile above, allow the lazy screen and deferred project snapshot
    // to settle under the parallel suite; the default findBy budget is only 1s.
    const selectedBranch = await screen.findByRole("treeitem", { name: /feature\/spike/ }, { timeout: 5000 });
    await user.click(selectedBranch);
    expect(selectedBranch).toHaveAttribute("aria-selected", "true");
    await user.click(within(nav).getByRole("button", { name: "Overview" }));
    await user.click(within(nav).getByRole("button", { name: "Branches" }));
    expect(screen.getByRole("treeitem", { name: /feature\/spike/ })).toBe(selectedBranch);
    expect(selectedBranch).toHaveAttribute("aria-selected", "true");
    expect(mockedInvoke.mock.calls.filter(([command]) => command === "read_history_page")).toHaveLength(1);
    expect(mockedInvoke.mock.calls.filter(([command]) => command === "get_branches")).toHaveLength(1);
    // This exercises two lazy panels and several full app navigations under
    // the parallel suite; the normal 5s budget is for a single interaction.
  }, 20_000);

  it("keeps a screen mounted when you navigate away from it and back", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });

    const nav = screen.getByRole("navigation", { name: "Project navigation" });
    await userEvent.click(within(nav).getByRole("button", { name: "Work" }));
    // Work opens on Changes: the tab pair heads the list panel and the
    // screen's one heading names the tab that is showing.
    const changesScreen = (
      await screen.findByRole("heading", { name: "Changes" }, { timeout: 5000 })
    ).closest(".workbench");
    expect(changesScreen).not.toBeNull();
    // The tabs are on screen from the first frame, in the loading shell; the
    // panel itself is its own chunk and arrives behind them.
    expect(screen.getByRole("tab", { name: "Changes" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(document.querySelector(".changes-view")).not.toBeNull(), { timeout: 5000 });
    expect(mockedInvoke.mock.calls.some(([command]) => command === "read_working_tree_diffs")).toBe(false);

    await userEvent.click(within(nav).getByRole("button", { name: "Overview" }));

    // Still in the DOM, but hidden: no role query can reach it, so it is out
    // of the tab order and out of the accessibility tree while Overview is
    // the screen the user is on.
    expect(document.querySelector(".workbench")).toBe(changesScreen);
    expect(screen.queryByRole("heading", { name: "Changes" })).toBeNull();
    expect(changesScreen?.closest(".screen-slot")).toHaveAttribute("hidden");

    await userEvent.click(within(nav).getByRole("button", { name: "Work" }));

    // The regression this guards (task 021): the screens used to be a ternary
    // chain, so every visit rebuilt this subtree from scratch — including the
    // diff virtualizer, whose rows measure themselves on first render. Node
    // identity is the evidence that the screen was revealed, not remounted.
    expect(await screen.findByRole("heading", { name: "Changes" })).toBeInTheDocument();
    expect(document.querySelector(".workbench")).toBe(changesScreen);

    // The tabs switch views inside the screen without a navigation: History
    // takes the heading, Changes stays mounted but hidden and inert, and the
    // way back through the rail lands on the tab that was left open.
    await userEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    // The tabs never leave the screen, not even while History's chunk loads.
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
    // The history port is not mocked here, so the panel lands in its error
    // state — still inside the tab's slot, still under the same tabs. That
    // state answers the project-activation read, which is deferred to idle (a
    // one-second timer under jsdom) and can still be ahead of the test here.
    // Waiting for the panel alone let the tab clicks below race it: the read's
    // loading and error renders rebuild the timeline header, so a click that
    // straddled them landed on a detached tab and did nothing.
    expect(await screen.findByRole("heading", { name: "Couldn't read history" }, { timeout: 5000 })).toBeInTheDocument();
    expect(mockedInvoke.mock.calls.filter(([command]) => command === "read_history_page")).toHaveLength(1);
    expect(document.querySelector(".history-screen")?.closest(".workbench__view")).not.toHaveAttribute("hidden");
    expect(document.querySelector(".changes-view")?.closest(".workbench__view")).toHaveAttribute("hidden");
    expect(screen.queryByRole("heading", { name: "Changes" })).toBeNull();
    await userEvent.click(within(nav).getByRole("button", { name: "Overview" }));
    await userEvent.click(within(nav).getByRole("button", { name: "Work" }));
    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Changes" }));
    expect(await screen.findByRole("heading", { name: "Changes" })).toBeInTheDocument();

    await waitFor(() =>
      expect(mockedInvoke.mock.calls.filter(([command]) => command === "get_branches")).toHaveLength(1),
    );
    await userEvent.click(within(nav).getByRole("button", { name: "Branches" }));
    expect(await screen.findByRole("heading", { name: "Branches" })).toBeInTheDocument();
    await userEvent.click(within(nav).getByRole("button", { name: "Overview" }));
    await userEvent.click(within(nav).getByRole("button", { name: "Branches" }));

    // Screen navigation consumes the cached snapshot. Freshness comes from
    // project activation and repository-watch invalidation, not from arrival.
    expect(mockedInvoke.mock.calls.filter(([command]) => command === "get_branches")).toHaveLength(1);
    // Three lazy chunks are fetched cold here — both Work tabs and Branches.
  }, 15000);

  it("runs the search from the field: filtering, Enter, and an idle field after Escape", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });
    const field = screen.getByRole("combobox", { name: "Open command palette" });

    await user.click(field);
    expect(screen.getByRole("listbox", { name: "Command palette" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    // Escape stays on the screen, so the results fold back into the field.
    expect(screen.getByRole("listbox", { name: "Command palette" }).parentElement).toHaveClass("palette-panel--closing");
    await waitFor(() =>
      expect(screen.queryByRole("listbox", { name: "Command palette" })).not.toBeInTheDocument(),
    );
    // The field keeps the focus after Escape, so Enter must not run the first
    // command the cleared query leaves behind (it would open Home).
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: restoredProject.name })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: /^Good / })).toBeNull();

    await user.click(field);
    await user.type(field, "home");
    const palette = screen.getByRole("listbox", { name: "Command palette" });
    // The strip's search keeps the app's raised card, not the Console pane.
    expect(palette.parentElement).not.toHaveClass("palette-panel--console");
    const options = within(palette).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Go to Home");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    // A destination changes the screen, so the results go at once rather than
    // folding back while Home draws.
    expect(screen.queryByRole("listbox", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("hands the palette to the Console's own field, keys included", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      if (command === "get_console_settings") return Promise.resolve({ confirmChanges: true });
      if (command === "read_console_host") return Promise.reject(new Error("no host"));
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });

    const nav = screen.getByRole("navigation", { name: "Project navigation" });
    await user.click(within(nav).getByRole("button", { name: "Console" }));

    // Console replaces the strip; its status line owns the search now.
    const field = await screen.findByRole("combobox", { name: "Open command palette" }, { timeout: 5000 });
    expect(screen.queryByRole("contentinfo", { name: "Project status" })).toBeNull();

    await user.keyboard("{Control>}k{/Control}");
    expect(field).toHaveFocus();
    const consolePalette = await screen.findByRole("listbox", { name: "Command palette" });
    expect(consolePalette).toBeInTheDocument();
    // The Console's field opens the results as a terminal pane.
    expect(consolePalette.parentElement).toHaveClass("palette-panel--console");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("listbox", { name: "Command palette" })).not.toBeInTheDocument(),
    );
    // The keyboard goes back to the Console prompt, so the next command can be
    // typed at once; Ctrl+K reaches the search again.
    const prompt = screen.getByRole("combobox", { name: "Console command" });
    expect(prompt).toHaveFocus();
    // Choosing Console itself also hands the keyboard to the prompt, even
    // though the search field lives inside the same screen.
    await user.keyboard("{Control>}k{/Control}");
    expect(field).toHaveFocus();
    await user.type(field, "go to console");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(prompt).toHaveFocus());
    // And a destination on another screen takes the focus too.
    await user.keyboard("{Control>}k{/Control}");
    expect(field).toHaveFocus();
    await user.type(field, "overview");
    const options = within(screen.getByRole("listbox", { name: "Command palette" })).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Go to Overview");
    await user.keyboard("{Enter}");
    const overviewHeading = await screen.findByRole("heading", { name: restoredProject.name });
    await waitFor(() => expect(overviewHeading).toHaveFocus());
  });

  it("moves the focus to the screen a palette destination opens", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });

    const field = screen.getByRole("combobox", { name: "Open command palette" });
    await user.click(field);
    await user.type(field, "work");
    await user.keyboard("{Enter}");

    // The search no longer keeps the keyboard: the screen's active tab does.
    const tab = await screen.findByRole("tab", { name: "Changes" }, { timeout: 5000 });
    await waitFor(() => expect(tab).toHaveFocus(), { timeout: 5000 });
  });
});
