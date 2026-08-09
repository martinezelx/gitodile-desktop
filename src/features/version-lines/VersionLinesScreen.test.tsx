import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../screenModule";
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
    }],
    totalCount: 1,
    isTruncated: false,
    unreadableCount: 0,
  };
}

afterEach(cleanup);

describe("VersionLinesScreen lifecycle", () => {
  it("does not read on arrival, freezes while hidden, and synchronizes on activation", () => {
    const read = vi.fn(async () => snapshot("unexpected"));
    const port = {
      read,
      planCreate: vi.fn(), create: vi.fn(), planSwitch: vi.fn(), switch: vi.fn(), planDelete: vi.fn(), delete: vi.fn(),
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
