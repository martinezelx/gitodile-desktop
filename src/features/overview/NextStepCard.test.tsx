import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import type { WorkingTreeEntry, WorkingTreeStatus } from "../status";
import { EMPTY_TEAM_SYNC_STATE, type TeamSyncViewState } from "../sync";
import { deriveJourney } from "./journey";
import { NextStepCard, type NextStepHandlers } from "./NextStepCard";
import { deriveNextStep } from "./nextStep";
import { OverviewNow } from "./OverviewNow";

function entry(path: string, category: WorkingTreeEntry["category"] = "changed"): WorkingTreeEntry {
  return { path, originalPath: null, category, isPrepared: false, hasUnpreparedChanges: true };
}

function tree(entries: WorkingTreeEntry[]): WorkingTreeStatus {
  const counts = { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: entries.length };
  for (const item of entries) counts[item.category] += 1;
  return {
    isClean: entries.length === 0,
    counts,
    lineTotals: null,
    entries,
    truncated: false,
    hasPreparedChanges: false,
    hasUnpreparedChanges: entries.length > 0,
    upstream: { branch: "main", upstream: "origin/main", ahead: 0, behind: 0 },
  };
}

const ahead: TeamSyncViewState = {
  ...EMPTY_TEAM_SYNC_STATE,
  status: {
    state: "ahead",
    localBranch: "main",
    localCommit: "1".repeat(40),
    upstreamRemote: "origin",
    destinationBranch: "main",
    trackingRef: "refs/remotes/origin/main",
    remoteCommit: "2".repeat(40),
    ahead: 2,
    behind: 0,
    knowledge: "fresh",
    checkedAt: 1_000,
    warnings: [],
    nextActions: [],
    stateToken: "token",
  },
};

function handlers(): NextStepHandlers {
  return {
    save: vi.fn(),
    reviewChanges: vi.fn(),
    resolve: vi.fn(),
    publish: vi.fn(),
    openHistory: vi.fn(),
    getChanges: vi.fn(),
    checkRemote: vi.fn(),
    checkLocal: vi.fn(),
    openSettings: vi.fn(),
    openLines: vi.fn(),
  };
}

function wrap(node: React.ReactNode) {
  return render(
    <LanguageProvider>
      <ScreenLifecycleProvider controller={createScreenLifecycleController("active")}>{node}</ScreenLifecycleProvider>
    </LanguageProvider>,
  );
}

afterEach(cleanup);

describe("NextStepCard", () => {
  it("holds the card's shape until both sides of the project are read", () => {
    const journey = deriveJourney({
      workingTree: tree([entry("a.ts")]),
      workingTreeError: null,
      isCheckingChanges: false,
      pendingVersionsCount: 0,
      teamSync: { ...EMPTY_TEAM_SYNC_STATE, isLoading: true, generation: 1 },
    });
    const { container } = wrap(
      <NextStepCard nextStep={deriveNextStep(journey, { canPublish: true })} journey={journey} handlers={handlers()} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking your project…");
    expect(container.querySelector(".next-step.loading-placeholder")).not.toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says what to publish and where, with publishing as the one primary action", async () => {
    const journey = deriveJourney({
      workingTree: tree([]),
      workingTreeError: null,
      isCheckingChanges: false,
      pendingVersionsCount: 2,
      teamSync: ahead,
    });
    const actions = handlers();
    const { container } = wrap(
      <NextStepCard nextStep={deriveNextStep(journey, { canPublish: true })} journey={journey} handlers={actions} />,
    );

    expect(container.querySelector(".next-step")).toHaveClass("next-step--ready");
    expect(screen.getByRole("heading", { name: "Publish 2 versions to origin" })).toBeInTheDocument();
    expect(screen.getByText("Next step")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 of 3 steps done" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish all 2" }));
    expect(actions.publish).toHaveBeenCalledOnce();
    expect(container.querySelectorAll(".primary-button")).toHaveLength(1);
  });

  it("wears the unsaved colour and offers to save when files have changed", async () => {
    const journey = deriveJourney({
      workingTree: tree([entry("a.ts"), entry("b.ts")]),
      workingTreeError: null,
      isCheckingChanges: false,
      pendingVersionsCount: 2,
      teamSync: ahead,
    });
    const actions = handlers();
    const { container } = wrap(
      <NextStepCard nextStep={deriveNextStep(journey, { canPublish: true })} journey={journey} handlers={actions} />,
    );

    expect(container.querySelector(".next-step")).toHaveClass("next-step--unsaved");
    expect(screen.getByRole("heading", { name: "Save your 2 changes" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    expect(actions.save).toHaveBeenCalledOnce();
  });
});

describe("OverviewNow", () => {
  it("says how much is unsaved in one line, by kind, and leads to Changes", async () => {
    const files = [...Array.from({ length: 3 }, (_, index) => entry(`src/file-${index}.ts`)), entry("src/new.ts", "new")];
    const onReview = vi.fn();
    const { container } = wrap(
      <OverviewNow
        workingTree={tree(files)}
        workingTreeError={null}
        isCheckingChanges={false}
        onReview={onReview}
        onCheckAgain={vi.fn()}
      />,
    );

    // No file names: the side column lists those.
    expect(container.querySelector(".overview-now__files")).toBeNull();
    const row = screen.getByRole("button", { name: /Now: 4 unsaved changes/ });
    expect(row).toHaveClass("overview-now--unsaved");
    expect(row.getAttribute("aria-label")).toContain("3 edited");
    expect([...row.querySelectorAll(".overview-now__kind")].map((kind) => kind.textContent)).toEqual(["3", "1"]);
    await userEvent.click(row);
    expect(onReview).toHaveBeenCalledOnce();
  });

  it("shrinks to one quiet line with nothing unsaved", () => {
    const { container } = wrap(
      <OverviewNow
        workingTree={tree([])}
        workingTreeError={null}
        isCheckingChanges={false}
        onReview={vi.fn()}
        onCheckAgain={vi.fn()}
      />,
    );

    expect(container.querySelector(".overview-now")).toHaveClass("overview-now--quiet");
    expect(screen.getByText("Nothing unsaved")).toBeInTheDocument();
  });

  it("stands a placeholder in for the count until the files are read", () => {
    const { container } = wrap(
      <OverviewNow workingTree={null} workingTreeError={null} isCheckingChanges onReview={vi.fn()} onCheckAgain={vi.fn()} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking");
    expect(container.querySelector(".overview-now .text-placeholder")).not.toBeNull();
    expect(container.querySelector(".icon--spinning")).toBeNull();
  });
});
