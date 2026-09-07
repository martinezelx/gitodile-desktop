import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { createVersionLinesController } from "./controller";
import type { VersionLinesSnapshot } from "./domain";
import type { VersionLinesPort } from "./port";
import { VersionLinesScreen } from "./VersionLinesScreen";

function snapshot(name: string): VersionLinesSnapshot {
  return {
    branch: name,
    headState: "branch",
    currentCommit: name,
    lines: [{
      name,
      tip: { commit: name, shortCommit: name, subject: name, committedAt: "2026-08-09T00:00:00Z" },
      isActive: true,
      upstream: null,
      isRetainedElsewhere: false,
      uniqueCommitCount: null,
      worktreePath: null,
      upstreamAhead: null,
      upstreamBehind: null,
      upstreamGone: false,
      isDefault: false,
    }],
    totalCount: 1,
    isTruncated: false,
    unreadableCount: 0,
  };
}

/** The detail's on-demand read. It is the selected line's own data rather
 * than the inventory, so it is stubbed rather than asserted on here — the
 * lifecycle these tests cover is the inventory's. */
const emptyHistory = { name: "main", totalCount: 0, versions: [], hasMore: false };

afterEach(cleanup);

describe("VersionLinesScreen lifecycle", () => {
  it("runs a real refresh and reports progress from the watcher notice", async () => {
    let resolveRead!: (value: VersionLinesSnapshot) => void;
    const read = vi.fn(() => new Promise<VersionLinesSnapshot>((resolve) => { resolveRead = resolve; }));
    const port = {
      read,
      readHistory: vi.fn(async () => emptyHistory), planCreate: vi.fn(), create: vi.fn(), planSwitch: vi.fn(), switch: vi.fn(), planDelete: vi.fn(), delete: vi.fn(), planRename: vi.fn(), rename: vi.fn(),
    } satisfies VersionLinesPort;
    const controller = createVersionLinesController(port);
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    controller.commit(query, snapshot("main"));
    const lifecycle = createScreenLifecycleController("active");
    render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <VersionLinesScreen
            controller={controller}
            projectPath="/repo"
            sessionEpoch="epoch-1"
            watcherState="off"
            onOpenSettings={vi.fn()}
            onChanged={vi.fn()}
            onSaveVersion={vi.fn()}
            onOperationStart={() => true}
            onOperationFinish={vi.fn()}
            onOperationPhaseChange={vi.fn()}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Update version lines" }));
    expect(read).toHaveBeenCalledWith(query);
    expect(screen.getByRole("button", { name: "Loading version lines…" })).toBeDisabled();

    resolveRead(snapshot("feature/new"));
    expect(await screen.findAllByText("feature/new")).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Update version lines" })).toBeEnabled();
  });

  it("does not read on arrival, freezes while hidden, and synchronizes on activation", () => {
    const read = vi.fn(async () => snapshot("unexpected"));
    const port = {
      read,
      readHistory: vi.fn(async () => emptyHistory), planCreate: vi.fn(), create: vi.fn(), planSwitch: vi.fn(), switch: vi.fn(), planDelete: vi.fn(), delete: vi.fn(), planRename: vi.fn(), rename: vi.fn(),
    } satisfies VersionLinesPort;
    const controller = createVersionLinesController(port);
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    controller.commit(query, snapshot("main"));
    const lifecycle = createScreenLifecycleController("active");
    render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <VersionLinesScreen
            controller={controller}
            projectPath="/repo"
            sessionEpoch="epoch-1"
            watcherState="watching"
            onOpenSettings={vi.fn()}
            onChanged={vi.fn()}
            onSaveVersion={vi.fn()}
            onOperationStart={() => true}
            onOperationFinish={vi.fn()}
            onOperationPhaseChange={vi.fn()}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    );
    expect(screen.getAllByText("main").length).toBeGreaterThan(0);
    expect(read).not.toHaveBeenCalled();

    act(() => lifecycle.transition("hidden"));
    act(() => controller.commit(query, snapshot("feature/hidden-update")));
    expect(screen.queryByText("feature/hidden-update")).toBeNull();

    act(() => lifecycle.transition("active"));
    expect(screen.getAllByText("feature/hidden-update").length).toBeGreaterThan(0);
    expect(read).not.toHaveBeenCalled();
  });
});
