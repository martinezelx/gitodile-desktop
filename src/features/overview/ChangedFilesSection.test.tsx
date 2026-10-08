import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import type { HeadState } from "../repository";
import type { WorkingTreeStatus } from "../status";
import { ChangedFilesSection } from "./ChangedFilesSection";

function cleanTree(upstream: Partial<WorkingTreeStatus["upstream"]> = {}): WorkingTreeStatus {
  return {
    isClean: true,
    counts: { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0 },
    lineTotals: null,
    entries: [],
    truncated: false,
    hasPreparedChanges: false,
    hasUnpreparedChanges: false,
    upstream: { branch: "main", upstream: "origin/main", ahead: 0, behind: 0, ...upstream },
  };
}

function renderSection(workingTree: WorkingTreeStatus, headState: HeadState = "branch") {
  const handlers = {
    onOpenFile: vi.fn(),
    onSeeAll: vi.fn(),
    onCheckAgain: vi.fn(),
    onPublish: vi.fn(),
    onGetChanges: vi.fn(),
    onOpenHistory: vi.fn(),
    onOpenSettings: vi.fn(),
  };
  render(
    <LanguageProvider>
      <ChangedFilesSection
        workingTree={workingTree}
        workingTreeError={null}
        isCheckingChanges={false}
        headState={headState}
        {...handlers}
      />
    </LanguageProvider>,
  );
  return handlers;
}

afterEach(cleanup);

describe("ChangedFilesSection with nothing to list", () => {
  it("offers to publish saved versions, then get changes or open history", async () => {
    const user = userEvent.setup();
    const handlers = renderSection(cleanTree({ ahead: 3 }));

    expect(screen.getByText("All changes are saved")).toBeInTheDocument();
    expect(screen.getByText("Files you change will show up here.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish 3 versions" }));
    await user.click(screen.getByRole("button", { name: "Get project changes" }));
    await user.click(screen.getByRole("button", { name: "View history" }));
    expect(handlers.onPublish).toHaveBeenCalledTimes(1);
    expect(handlers.onGetChanges).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("leads with getting project changes when newer ones are available", () => {
    renderSection(cleanTree({ behind: 2 }));

    expect(screen.getByRole("button", { name: "Get project changes" })).toHaveClass("primary-button");
    expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
  });

  it("has no primary action when everything is saved and published", () => {
    renderSection(cleanTree());

    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    expect(document.querySelector(".primary-button")).toBeNull();
    expect(screen.getByRole("button", { name: "Get project changes" })).toBeInTheDocument();
  });

  it("points to project settings when there is no remote", async () => {
    const user = userEvent.setup();
    const handlers = renderSection(cleanTree({ upstream: null }));

    expect(screen.getByText("Everything is saved on this computer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open project settings" }));
    expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("explains an old version without offering to publish", () => {
    renderSection(cleanTree(), "detached");

    expect(screen.getByText("You're viewing an old version")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View history" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get project changes" })).toBeNull();
  });
});
