import React, { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { ChangesPanel } from "./changes";
import { LanguageProvider } from "./i18n";
import type { WorkingTreeStatus } from "./repositoryOverview";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

/** `ChangesPanel` no longer owns `selectedPath` or the save-version dialog's
 * open state — both are lifted so a project session can remember them (see
 * task 012). This wrapper plays the same role `main.tsx` does in the real
 * app: holding that state and passing it down as controlled props. */
function ControlledChangesPanel(
  props: Omit<
    React.ComponentProps<typeof ChangesPanel>,
    | "selectedPath"
    | "onSelectedPathChange"
    | "isSaveVersionOpen"
    | "onOpenSaveVersion"
    | "onCloseSaveVersion"
    | "onSaveVersionPhaseChange"
  >,
): React.JSX.Element {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isSaveVersionOpen, setIsSaveVersionOpen] = useState(false);
  return (
    <ChangesPanel
      {...props}
      selectedPath={selectedPath}
      onSelectedPathChange={setSelectedPath}
      isSaveVersionOpen={isSaveVersionOpen}
      onOpenSaveVersion={() => setIsSaveVersionOpen(true)}
      onCloseSaveVersion={() => setIsSaveVersionOpen(false)}
      onSaveVersionPhaseChange={() => {}}
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
      if (command === "read_working_tree_diffs") {
        // The background batch warm-up; returning nothing keeps this
        // suite's per-file cache behavior easy to reason about, since it
        // still counts as one invoke call per snapshot either way.
        return Promise.resolve([]);
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

    await userEvent.click(screen.getByRole("button", { name: "Select none" }));
    expect(screen.getByRole("button", { name: "Save version" })).toBeDisabled();

    await userEvent.click(edited);
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("plan_save_version", {
        path: "/repo",
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

    // 3, not 1: selecting "edited.txt" fetches it directly, prefetches its
    // one neighbor ("new.txt") in the background, and the whole-snapshot
    // batch warm-up (`read_working_tree_diffs`) fires once per snapshot too.
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(3));
    await userEvent.click(panel.getByRole("button", { name: /new\.txt/ }));
    expect(mockedInvoke).toHaveBeenCalledTimes(3);

    await userEvent.click(panel.getByRole("button", { name: /edited\.txt/ }));
    expect(mockedInvoke).toHaveBeenCalledTimes(3);

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

    // A new working-tree snapshot resets the store, so the selected file,
    // its prefetched neighbor, and the batch warm-up all fire again: 3 more.
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(6));
  });

  it("only shows diff loading feedback when a read remains pending", async () => {
    // Keyed by path, not a single shared resolver: the background prefetch
    // of the neighboring file starts a second, concurrent invoke call, so a
    // single "last call wins" resolver would resolve the wrong one.
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

    // 3, not 1: selecting "edited.txt" also kicks off a background prefetch
    // of its neighbor ("new.txt") and the whole-snapshot batch warm-up.
    // (The batch call's `args` has no `filePath`, so it lands under the
    // `undefined` key here and is simply never resolved — harmless, since
    // nothing in this test awaits it.)
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(3));
    await userEvent.click(panel.getByRole("button", { name: /new\.txt/ }));
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(3));
    await userEvent.click(panel.getByRole("button", { name: /edited\.txt/ }));
    expect(mockedInvoke).toHaveBeenCalledTimes(3);

    resolvers.get("edited.txt")?.({ kind: "unchanged", path: "edited.txt" });
    resolvers.get("new.txt")?.({ kind: "unchanged", path: "new.txt" });
    await waitFor(() => expect(screen.queryByText("Reading the difference…")).not.toBeInTheDocument());
  });

  it("renders a multi-hunk text diff through the virtualized line list", async () => {
    // Exercises the real `DiffHunkList` render path (every other test here
    // uses an "unchanged" diff, which never reaches it) under jsdom, which
    // has no real layout engine and no `ResizeObserver` by default — the
    // combination `@tanstack/react-virtual` needs to handle gracefully.
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

    expect(await screen.findByText("line one")).toBeInTheDocument();
    expect(screen.getByText("line two changed")).toBeInTheDocument();
    expect(screen.getByText("47 unchanged lines")).toBeInTheDocument();
    expect(screen.getByText("line fifty removed")).toBeInTheDocument();
  });
});
