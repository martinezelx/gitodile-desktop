import React, { useRef, useState } from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { ChangesPanel } from "./features/changes/ChangesPanel";
import { changesPort, createChangesController, type ChangesController } from "./features/changes";
import { LanguageProvider } from "./i18n";
import type { WorkingTreeStatus } from "./features/status";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
const defaultResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  globalThis.ResizeObserver = defaultResizeObserver;
  // Vitest runs without `globals`, so Testing Library never registers its own
  // automatic cleanup — without this, every render in this file stacks up in
  // the same document and "get by role" starts finding duplicates.
  cleanup();
});

/** `ChangesPanel` no longer owns `selectedPath`, the save-version dialog's
 * open state, or the diff cache — all lifted so a project session can
 * remember them across navigation (see tasks 012 and 019). This wrapper plays
 * the same role `main.tsx` does in the real app: holding that state and
 * passing it down as controlled props. `diffCache` may be supplied by a test
 * that needs it to outlive a remount; otherwise each wrapper gets its own. */
function ControlledChangesPanel(
  props: Omit<
    React.ComponentProps<typeof ChangesPanel>,
    | "controller"
    | "sessionEpoch"
    | "selectedPath"
    | "onSelectedPathChange"
    | "isSaveVersionOpen"
    | "onOpenSaveVersion"
    | "onCloseSaveVersion"
    | "onSaveVersionPhaseChange"
    | "onSaveCompleted"
    | "workingTreeCheckedAt"
  > & {
    controller?: ChangesController;
    workingTreeCheckedAt?: number | null;
  },
): React.JSX.Element {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isSaveVersionOpen, setIsSaveVersionOpen] = useState(false);
  const ownController = useRef(createChangesController(changesPort));
  return (
    <ChangesPanel
      {...props}
      controller={props.controller ?? ownController.current}
      sessionEpoch="test-epoch"
      workingTreeCheckedAt={props.workingTreeCheckedAt ?? null}
      selectedPath={selectedPath}
      onSelectedPathChange={setSelectedPath}
      isSaveVersionOpen={isSaveVersionOpen}
      onOpenSaveVersion={() => setIsSaveVersionOpen(true)}
      onCloseSaveVersion={() => setIsSaveVersionOpen(false)}
      onSaveVersionPhaseChange={() => {}}
      onSaveCompleted={() => {}}
    />
  );
}

const workingTree: WorkingTreeStatus = {
  isClean: false,
  counts: { changed: 1, new: 1, deleted: 0, renamed: 0, conflicted: 0, total: 2 },
  entries: [
    {
      path: "edited.txt",
      originalPath: null,
      category: "changed",
      isPrepared: false,
      hasUnpreparedChanges: true,
    },
    {
      path: "new.txt",
      originalPath: null,
      category: "new",
      isPrepared: false,
      hasUnpreparedChanges: true,
    },
  ],
  truncated: false,
  hasPreparedChanges: false,
  hasUnpreparedChanges: true,
  upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
};

describe("ChangesPanel save selection", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") {
        return Promise.resolve({ kind: "unchanged", path: "edited.txt" });
      }
      if (command === "plan_save_version") {
        return Promise.resolve({
          operationKind: "history-mutation",
          requiresConfirmation: true,
          stateToken: "selection-token",
          branch: "main",
          isFirstVersion: false,
          totalFiles: 1,
          remainingFiles: 1,
          isPartial: true,
          hasPreparedChanges: false,
          counts: { changed: 1, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 1 },
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
  });

  it("selects everything by default and sends only the chosen files to the planner", async () => {
    render(
      <LanguageProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onNavigateOverview={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );

    const edited = screen.getByRole("checkbox", { name: "Include edited.txt in this version" });
    const added = screen.getByRole("checkbox", { name: "Include new.txt in this version" });
    expect(edited).toBeChecked();
    expect(added).toBeChecked();
    expect(screen.getAllByText("Project root")).toHaveLength(2);

    // With nothing selected there is no count to name, so the button falls
    // back to its plain label — and is disabled.
    await userEvent.click(screen.getByRole("checkbox", { name: "Select none" }));
    expect(screen.getByRole("button", { name: "Save version" })).toBeDisabled();

    await userEvent.click(edited);
    await userEvent.click(screen.getByRole("button", { name: "Save selected (1)" }));

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("plan_save_version", {
        path: "/repo",
        sessionEpoch: "test-epoch",
        selectedPaths: ["edited.txt"],
      }),
    );
    expect(await screen.findByText("1 other file will remain as a pending change.")).toBeInTheDocument();
  });

  it("reuses a cached diff until the working-tree snapshot changes", async () => {
    const { container, rerender } = render(
      <LanguageProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onNavigateOverview={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );
    const panel = within(container);

    // Screen arrival fetches only the file it actually presents. Whole-tree
    // speculative warming is activation/invalidation-owned by the runtime.
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(1));
    await userEvent.click(panel.getByRole("button", { name: /new\.txt/ }));
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(2));

    await userEvent.click(panel.getByRole("button", { name: /edited\.txt/ }));
    expect(mockedInvoke).toHaveBeenCalledTimes(2);

    rerender(
      <LanguageProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={{ ...workingTree }}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onNavigateOverview={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );

    // A new working-tree snapshot resets the store, so the selected file is
    // read again while speculative warming remains outside the screen.
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(3));
  });

  it("re-reads nothing when the screen is left and reopened on the same snapshot", async () => {
    // The regression this guards: the cache used to live in a ref inside
    // `ChangesPanel`, so navigating to another screen and back discarded it
    // and re-ran every read (task 019).
    const controller = createChangesController(changesPort);
    const panelElement = (
      <LanguageProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          controller={controller}
          onRefresh={vi.fn()}
          onNavigateOverview={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>
    );

    const first = render(panelElement);
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(1));
    first.unmount();

    const { container } = render(panelElement);
    const panel = within(container);

    // Rendered straight from the cache, with no further Git work: the diff is
    // already on screen and the count is unchanged.
    expect(await panel.findByText("No content changed")).toBeInTheDocument();
    expect(screen.queryByText("Reading the difference…")).not.toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it("only shows diff loading feedback when a read remains pending", async () => {
    // Keyed by path so the same helper also models returning to an in-flight
    // selection without relying on a fragile "last call wins" resolver.
    const resolvers = new Map<string, (diff: { kind: "unchanged"; path: string }) => void>();
    mockedInvoke.mockImplementation((_command, args) => {
      const filePath = (args as { filePath: string }).filePath;
      return new Promise((resolve) => {
        resolvers.set(filePath, resolve);
      });
    });

    render(
      <LanguageProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onNavigateOverview={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.queryByText("Reading the difference…")).not.toBeInTheDocument();
    expect(await screen.findByText("Reading the difference…")).toBeInTheDocument();

    resolvers.get("edited.txt")?.({ kind: "unchanged", path: "edited.txt" });
    await waitFor(() => expect(screen.queryByText("Reading the difference…")).not.toBeInTheDocument());
  });

  it("shares an in-flight diff read when returning to the same file", async () => {
    const resolvers = new Map<string, (diff: { kind: "unchanged"; path: string }) => void>();
    mockedInvoke.mockImplementation((_command, args) => {
      const filePath = (args as { filePath: string }).filePath;
      return new Promise((resolve) => {
        resolvers.set(filePath, resolve);
      });
    });

    const { container } = render(
      <LanguageProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onNavigateOverview={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );
    const panel = within(container);

    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(1));
    await userEvent.click(panel.getByRole("button", { name: /new\.txt/ }));
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(2));
    await userEvent.click(panel.getByRole("button", { name: /edited\.txt/ }));
    expect(mockedInvoke).toHaveBeenCalledTimes(2);

    resolvers.get("edited.txt")?.({ kind: "unchanged", path: "edited.txt" });
    resolvers.get("new.txt")?.({ kind: "unchanged", path: "new.txt" });
    await waitFor(() => expect(screen.queryByText("Reading the difference…")).not.toBeInTheDocument());
  });

  it("renders a multi-hunk text diff through the virtualized line list", async () => {
    // Exercises the real `DiffHunkList` render path (every other test here
    // uses an "unchanged" diff, which never reaches it) under jsdom, which
    // has no real layout engine and no `ResizeObserver` by default — the
    // combination `@tanstack/react-virtual` needs to handle gracefully.
    let resizeCallback: ResizeObserverCallback | undefined;
    class CapturingResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = CapturingResizeObserver;

    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") {
        return Promise.resolve({
          kind: "text",
          path: "edited.txt",
          originalPath: null,
          change: "changed",
          truncated: false,
          hunks: [
            {
              header: "@@ -1,2 +1,2 @@",
              oldStart: 1,
              oldLines: 2,
              newStart: 1,
              newLines: 2,
              lines: [
                { kind: "context", content: "line one", oldLineNumber: 1, newLineNumber: 1 },
                { kind: "addition", content: "line two changed", oldLineNumber: null, newLineNumber: 2 },
                { kind: "addition", content: "\twide 界 and emoji 🙂", oldLineNumber: null, newLineNumber: 3 },
              ],
            },
            {
              header: "@@ -50,1 +50,1 @@",
              oldStart: 50,
              oldLines: 1,
              newStart: 50,
              newLines: 1,
              lines: [{ kind: "deletion", content: "line fifty removed", oldLineNumber: 50, newLineNumber: null }],
            },
          ],
        });
      }
      if (command === "read_working_tree_diffs") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    const { container } = render(
      <LanguageProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onNavigateOverview={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(await screen.findByText("line one")).toBeInTheDocument();
    expect(screen.getByText("line two changed")).toBeInTheDocument();
    expect(screen.getByText("wide 界 and emoji 🙂", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 47 unchanged lines" })).toBeInTheDocument();
    expect(screen.getByText("line fifty removed")).toBeInTheDocument();

    const diffViewport = container.querySelector<HTMLElement>(".diff-code");
    expect(diffViewport).not.toBeNull();
    Object.defineProperty(diffViewport, "clientWidth", { configurable: true, value: 360 });
    await act(async () => {
      resizeCallback?.([], {} as ResizeObserver);
    });
    expect(screen.getByText("wide 界 and emoji 🙂", { exact: false })).toBeInTheDocument();
  });
});

describe("ChangesPanel review controls", () => {
  /** jsdom has no `ResizeObserver`, which `DiffHunkList` observes to find its
   * wrap point. A no-op stand-in is enough: the virtualizer falls back to its
   * estimates, which is all these tests need. */
  class NoopResizeObserver implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  const editedDiff = {
    kind: "text",
    path: "edited.txt",
    originalPath: null,
    change: "changed",
    truncated: false,
    hunks: [
      {
        header: "@@ -1,2 +1,2 @@",
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 2,
        lines: [
          { kind: "deletion", content: "before one", oldLineNumber: 1, newLineNumber: null },
          { kind: "addition", content: "after one", oldLineNumber: null, newLineNumber: 1 },
        ],
      },
      {
        header: "@@ -50,1 +50,1 @@",
        oldStart: 50,
        oldLines: 1,
        newStart: 50,
        newLines: 1,
        lines: [{ kind: "addition", content: "after fifty", oldLineNumber: null, newLineNumber: 50 }],
      },
    ],
  };
  const newDiff = {
    kind: "text",
    path: "new.txt",
    originalPath: null,
    change: "new",
    truncated: false,
    hunks: [
      {
        header: "@@ -0,0 +1,1 @@",
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ kind: "addition", content: "brand new", oldLineNumber: null, newLineNumber: 1 }],
      },
    ],
  };

  beforeEach(() => {
    globalThis.ResizeObserver = NoopResizeObserver;
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") {
        const path = (args as { filePath?: string; path?: string }).filePath;
        return Promise.resolve(path === "new.txt" ? newDiff : editedDiff);
      }
      if (command === "read_working_tree_diffs") {
        return Promise.resolve([editedDiff, newDiff]);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
  });

  function renderPanel(checkedAt: number | null = null, controller = createChangesController(changesPort)): void {
    render(
      <LanguageProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          workingTreeCheckedAt={checkedAt}
          controller={controller}
          onRefresh={vi.fn()}
          onNavigateOverview={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );
  }

  it("expands the unchanged lines between hunks, and keeps a marker for the rest", async () => {
    // The first hunk covers old lines 1-2, the second starts at old line 50,
    // so the gap is 47 lines starting at new line 3. The stub returns two.
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") {
        return Promise.resolve(editedDiff);
      }
      if (command === "read_working_tree_diffs") {
        return Promise.resolve([editedDiff, newDiff]);
      }
      if (command === "read_file_lines") {
        expect(args).toMatchObject({ path: "/repo", filePath: "edited.txt", startLine: 3, endLine: 49 });
        return Promise.resolve({ startLine: 3, lines: ["context three", "context four"], truncated: true });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Show 47 unchanged lines" }));

    expect(await screen.findByText("context three")).toBeInTheDocument();
    expect(screen.getByText("context four")).toBeInTheDocument();
    // 47 hidden, 2 fetched — the rest stays openable rather than stranding
    // the gap half-open.
    expect(screen.getByRole("button", { name: "Show 45 unchanged lines" })).toBeInTheDocument();
  });

  it("reports a failed expansion in place instead of losing the diff", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") {
        return Promise.resolve(editedDiff);
      }
      if (command === "read_working_tree_diffs") {
        return Promise.resolve([editedDiff, newDiff]);
      }
      if (command === "read_file_lines") {
        return Promise.reject(new Error("nope"));
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Show 47 unchanged lines" }));

    expect(await screen.findByText("Couldn’t read those lines.")).toBeInTheDocument();
    // The diff itself is untouched, and the marker is still a live retry.
    expect(screen.getByText("before one")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 47 unchanged lines" })).toBeEnabled();
  });

  it("says how fresh the check is, and names the count the save button will save", async () => {
    renderPanel(Date.now() - 3 * 60_000);

    const freshness = await screen.findByText("Checked 3 minutes ago");
    expect(freshness).not.toHaveAttribute("role");
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save selected (2)" })).toBeEnabled();
  });

  it("shows no freshness note before the first check returns", () => {
    renderPanel(null);

    expect(screen.queryByText(/^Checked/)).not.toBeInTheDocument();
  });

  it("shows the snapshot's added and removed line totals once the diff cache is warm", async () => {
    const controller = createChangesController(changesPort);
    await controller.warmStore(controller.getStore("/repo", "test-epoch", workingTree));
    renderPanel(null, controller);

    expect(await screen.findByText("3 lines added")).toBeInTheDocument();
    expect(screen.getByText("1 line removed")).toBeInTheDocument();
  });

  it("narrows the file list as the user searches, and explains an empty result", async () => {
    renderPanel();

    const search = screen.getByRole("searchbox", { name: "Search changed files" });
    await userEvent.type(search, "new");

    expect(screen.queryByRole("button", { name: /^edited\.txt/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^new\.txt/ })).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    expect(screen.getByText("No changed file matches your search.")).toBeInTheDocument();
  });

  it("drops the file counter when a search excludes the file that is open", async () => {
    renderPanel();

    // "edited.txt" is selected by default; searching for the other file
    // narrows the list without changing what the diff pane shows.
    expect(await screen.findByText("File 1 of 2")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search changed files" }), "new");

    expect(screen.queryByText(/^File \d+ of/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous file" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next file" })).toBeDisabled();
  });

  it("steps between files with the header's arrows, disabling them at each end", async () => {
    renderPanel();

    expect(await screen.findByText("File 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous file" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next file" }));

    expect(await screen.findByText("File 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next file" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous file" })).toBeEnabled();
  });

  it("counts the current file's changes and steps through them", async () => {
    renderPanel();

    expect(await screen.findByText("Change 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous change" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next change" }));

    expect(screen.getByText("Change 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next change" })).toBeDisabled();
  });

  it("switches the diff to the side-by-side view and keeps the choice across files", async () => {
    const { container } = render(
      <LanguageProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onNavigateOverview={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(await screen.findByText("before one")).toBeInTheDocument();
    expect(container.querySelector(".diff-split-row")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Difference view (Unified)" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Split" }));

    await waitFor(() => expect(container.querySelector(".diff-split-row")).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Next file" }));

    expect(await screen.findByText("brand new")).toBeInTheDocument();
    expect(container.querySelector(".diff-split-row")).not.toBeNull();
  });

  it("keeps a thousand-file truncated project below the DOM row budget", async () => {
    const entries = Array.from({ length: 1000 }, (_, index) => ({
      path: `file-${index.toString().padStart(4, "0")}.txt`,
      originalPath: null,
      category: "changed" as const,
      isPrepared: false,
      hasUnpreparedChanges: true,
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") {
        return Promise.resolve({ kind: "unchanged", path: entries[0].path });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    const { container } = render(
      <LanguageProvider>
        <ControlledChangesPanel
          projectPath="/large-repo"
          workingTree={{
            ...workingTree,
            counts: { changed: 5000, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 5000 },
            entries,
            truncated: true,
          }}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onNavigateOverview={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );

    await screen.findByRole("button", { name: /file-0000\.txt/ });
    const rows = container.querySelectorAll(".changes-file-row");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(40);
    expect(rows[0]).toHaveAttribute("aria-setsize", "1000");
    expect(screen.queryByRole("button", { name: /file-0999\.txt/ })).not.toBeInTheDocument();
  });

  it("offers the complete diff as accessible text and supports menu keyboard navigation", async () => {
    renderPanel();

    await screen.findByText("before one");
    await userEvent.click(screen.getByRole("button", { name: "Difference view (Unified)" }));

    const unified = screen.getByRole("menuitemradio", { name: "Unified" });
    expect(unified).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitemradio", { name: "Accessible text" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    const completeDiff = screen.getByLabelText("Complete difference as accessible text");
    expect(completeDiff).toHaveTextContent("@@ -1,2 +1,2 @@");
    expect(completeDiff).toHaveTextContent("-before one");
    expect(completeDiff).toHaveTextContent("+after fifty");
    expect(screen.queryByRole("button", { name: "Next change" })).not.toBeInTheDocument();
  });
});
