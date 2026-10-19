import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import type { PendingVersionsResult } from "../publish";
import type { WorkingTreeEntry, WorkingTreeStatus } from "../status";
import { EMPTY_TEAM_SYNC_STATE, type TeamSyncViewState } from "../sync";
import { deriveJourney } from "./journey";
import { OverviewDetail, overviewDetailMode } from "./OverviewDetail";
import { createWorkDetailController } from "./workDetail";

const query = { projectId: "/repo", sessionEpoch: "epoch" };

function tree(entries: WorkingTreeEntry[], lineTotals: WorkingTreeStatus["lineTotals"] = null): WorkingTreeStatus {
  const counts = { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: entries.length };
  for (const item of entries) counts[item.category] += 1;
  return {
    isClean: entries.length === 0,
    counts,
    lineTotals,
    entries,
    truncated: false,
    hasPreparedChanges: false,
    hasUnpreparedChanges: entries.length > 0,
    upstream: { branch: "main", upstream: "origin/main", ahead: 0, behind: 0 },
  };
}

function sync(state: "ahead" | "upToDate" | "behind" | "upstreamGone"): TeamSyncViewState {
  return {
    ...EMPTY_TEAM_SYNC_STATE,
    status: {
      state,
      localBranch: "main",
      localCommit: "2".repeat(40),
      upstreamRemote: "origin",
      destinationBranch: "main",
      trackingRef: "refs/remotes/origin/main",
      remoteCommit: "1".repeat(40),
      ahead: state === "ahead" ? 1 : 0,
      behind: state === "behind" ? 1 : 0,
      knowledge: "fresh",
      checkedAt: 1_000,
      warnings: [],
      nextActions: [],
      stateToken: "token",
      forecast: null,
    },
  };
}

async function setup({
  workingTree,
  pending,
  state,
  readIncoming = true,
  incomingFails = false,
  recoveryCopies = 1,
}: {
  workingTree: WorkingTreeStatus | null;
  pending: PendingVersionsResult;
  state: "ahead" | "upToDate" | "behind" | "upstreamGone";
  readIncoming?: boolean;
  incomingFails?: boolean;
  /** How many stored discards the picker could restore; none reads as no discard. */
  recoveryCopies?: number;
}) {
  const workDetail = createWorkDetailController({
    readCommitFileChanges: vi.fn(async () => [
      { path: "src/app.ts", originalPath: null, category: "changed" as const },
      { path: "src/new.ts", originalPath: null, category: "new" as const },
    ]),
    findRestorableDiscard: vi.fn(async () => (recoveryCopies > 0 ? { recoveryId: "r", createdAtMs: Date.now() - 60_000, fileCount: 3, restorableCount: recoveryCopies } : null)),
    readRemoteHome: vi.fn(async () => null),
    readIncomingVersions: vi.fn(async () => {
      if (incomingFails) throw new Error("unreadable");
      return {
      totalCount: 2,
      versions: [
        { commit: "9".repeat(40), shortCommit: "9999999", title: "fix(sync): keep the check", description: null, committedAt: "2026-10-09T10:00:00Z", author: "Ana" },
        { commit: "8".repeat(40), shortCommit: "8888888", title: "feat(history): group by day", description: null, committedAt: "2026-10-09T09:00:00Z", author: "Ana" },
      ],
      isTruncated: false,
      };
    }),
  });
  await workDetail.ensureCommitFiles(query, pending.versions.map((item) => item.commit));
  await workDetail.refreshRecovery(query);
  if (state === "behind" && readIncoming) await workDetail.ensureIncoming(query, "a..b");
  const lifecycle = createScreenLifecycleController("active");
  const handlers = {
    onReviewChanges: vi.fn(),
    onResolve: vi.fn(),
    onGetChanges: vi.fn(),
    onOpenHistory: vi.fn(),
    onRestoreDiscarded: vi.fn(),
  };
  const draw = (next: { workingTree: WorkingTreeStatus | null; pending: PendingVersionsResult; state: "ahead" | "upToDate" | "behind" | "upstreamGone" }) => {
    const journey = deriveJourney({
      workingTree: next.workingTree,
      workingTreeError: null,
      isCheckingChanges: false,
      pendingVersionsCount: next.pending.totalCount,
      teamSync: sync(next.state),
    });
    return (
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <OverviewDetail
            mode={overviewDetailMode(journey)}
            journey={journey}
            workingTree={next.workingTree}
            pendingVersions={next.pending}
            workDetail={workDetail}
            projectPath={query.projectId}
            sessionEpoch={query.sessionEpoch}
            {...handlers}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>
    );
  };
  const view = render(draw({ workingTree, pending, state }));
  return { ...view, handlers, lifecycle, redraw: (next: Parameters<typeof draw>[0]) => view.rerender(draw(next)) };
}

const NO_PENDING: PendingVersionsResult = { totalCount: 0, versions: [], isTruncated: false };

afterEach(() => {
  cleanup();
  delete (window as Partial<Window>).matchMedia;
});

const ONE_PENDING: PendingVersionsResult = {
  totalCount: 1,
  versions: [{ commit: "2".repeat(40), shortCommit: "2222222", title: "Saved version 2", description: null, committedAt: "2026-10-09T10:00:00Z", author: "Lin" }],
  isTruncated: false,
};

describe("OverviewDetail", () => {
  it("shows what the next version will hold, with no note under it", async () => {
    const entry = (path: string): WorkingTreeEntry => ({ path, originalPath: null, category: "changed", isPrepared: false, hasUnpreparedChanges: true });
    const { handlers } = await setup({
      workingTree: tree([entry("src/a.ts"), entry("src/b.ts")], { added: 12, removed: 3 }),
      pending: NO_PENDING,
      state: "upToDate",
    });

    expect(screen.getByRole("heading", { name: "What you'll save" })).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.getByLabelText("12 lines added, 3 removed")).toBeInTheDocument();
    expect(screen.queryByText("Stays here until you publish.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Review src/a.ts" }));
    expect(handlers.onReviewChanges).toHaveBeenCalledWith("src/a.ts");
  });

  it("shows the files the unpublished versions carry and where they go", async () => {
    await setup({
      workingTree: tree([]),
      pending: {
        totalCount: 1,
        versions: [{ commit: "2".repeat(40), shortCommit: "2222222", title: "Saved version 2", description: null, committedAt: "2026-10-09T10:00:00Z", author: "Lin" }],
        isTruncated: false,
      },
      state: "ahead",
    });

    expect(screen.getByRole("heading", { name: "What you'll publish" })).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.getByText("in 1 version")).toBeInTheDocument();
    expect(screen.queryByText("Seen by anyone on this line.")).toBeNull();
  });

  it("scrolls what you'll publish too while the screen fits, and points to History at the end", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (media: string) => ({ matches: true, media, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    const { container } = await setup({ workingTree: tree([]), pending: ONE_PENDING, state: "ahead" });

    const list = container.querySelector<HTMLElement>(".overview-detail__files--scroll");
    if (!list) throw new Error("no scrolling list");
    expect(list.querySelectorAll(".overview-detail__file")).toHaveLength(2);
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 40 });
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 80 });
    const history = screen.getByRole("button", { name: "History" });
    list.scrollTop = 40;
    fireEvent.scroll(list);
    await waitFor(() => expect(history).toHaveClass("overview-detail__link--lead"));
  });

  it("gives the column to the discard once nothing is waiting, and opens the restore picker", async () => {
    const { handlers } = await setup({ workingTree: tree([]), pending: NO_PENDING, state: "upToDate" });

    // Alone in the column it is a card of its own, headed like its siblings.
    const card = screen.getByRole("heading", { name: "Discarded changes" }).closest(".overview-detail");
    expect(card?.parentElement).toHaveClass("overview-side");
    expect(document.querySelector(".overview-restore")).toBeNull();
    expect(screen.getByText("3 files")).toBeInTheDocument();
    expect(screen.getByText(/^discarded 1 minute ago$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(handlers.onRestoreDiscarded).toHaveBeenCalledOnce();
  });

  it("draws no column when nothing is waiting and nothing can be restored", async () => {
    const { container } = await setup({ workingTree: tree([]), pending: NO_PENDING, state: "upToDate", recoveryCopies: 0 });

    // The timeline takes the width.
    expect(container.querySelector(".overview-side")).toBeNull();
  });

  it("counts the copies when several can be restored, rather than one copy's files", async () => {
    const { redraw } = await setup({ workingTree: tree([]), pending: NO_PENDING, state: "upToDate", recoveryCopies: 3 });

    // Alone, the card counts them and dates the newest.
    expect(screen.getByText("3 copies")).toBeInTheDocument();
    expect(screen.getByText(/^latest /)).toBeInTheDocument();

    // Under a detail card the count rides the row's icon and is read out.
    redraw({ workingTree: tree([]), pending: ONE_PENDING, state: "ahead" });
    const row = screen.getByText("Discarded changes").closest(".overview-restore");
    expect(row?.querySelector(".overview-restore__badge")).toHaveTextContent("3");
    expect(screen.getByText("3 copies")).toHaveClass("visually-hidden");
  });

  it("scrolls what you'll save while the screen fits, and points to Review at the end", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (media: string) => ({ matches: true, media, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    const entry = (index: number): WorkingTreeEntry => ({ path: `src/f${index}.ts`, originalPath: null, category: "changed", isPrepared: false, hasUnpreparedChanges: true });
    const { container } = await setup({ workingTree: tree(Array.from({ length: 60 }, (_, index) => entry(index))), pending: NO_PENDING, state: "upToDate" });

    // Every file up to the cap is listed, the rest counted at the end.
    const list = container.querySelector<HTMLElement>(".overview-detail__files--scroll");
    if (!list) throw new Error("no scrolling list");
    expect(list.querySelectorAll("button.overview-detail__file")).toHaveLength(50);
    expect(list).toHaveTextContent("and 10 more");
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 900 });
    const review = screen.getByRole("button", { name: "Review" });

    fireEvent.scroll(list);
    await waitFor(() => expect(list).toHaveAttribute("data-more-below"));
    expect(review).not.toHaveClass("overview-detail__link--lead");

    list.scrollTop = 600;
    fireEvent.scroll(list);
    await waitFor(() => expect(review).toHaveClass("overview-detail__link--lead", "attention-breathe"));
    expect(list).not.toHaveAttribute("data-more-below");

    list.scrollTop = 100;
    fireEvent.scroll(list);
    await waitFor(() => expect(review).not.toHaveClass("overview-detail__link--lead"));
  });

  it("offers the discard whenever everything is saved, and never over unsaved work", async () => {
    const { redraw } = await setup({ workingTree: tree([]), pending: ONE_PENDING, state: "ahead" });

    // Saved but not published: the detail card leads, and the discard still
    // sits under it, drawn smaller.
    expect(screen.getByRole("heading", { name: "What you'll publish" })).toBeInTheDocument();
    expect(screen.getByText("Discarded changes").closest(".overview-restore")?.previousElementSibling).toHaveClass("overview-detail");

    const entry: WorkingTreeEntry = { path: "src/a.ts", originalPath: null, category: "changed", isPrepared: false, hasUnpreparedChanges: true };
    redraw({ workingTree: tree([entry]), pending: ONE_PENDING, state: "ahead" });
    expect(screen.queryByText("Discarded changes")).not.toBeInTheDocument();
  });

  it("names the versions waiting on the remote", async () => {
    const { handlers } = await setup({ workingTree: tree([]), pending: NO_PENDING, state: "behind" });

    expect(screen.getByRole("heading", { name: "What you'll get" })).toBeInTheDocument();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    expect(screen.getByText("fix(sync): keep the check")).toBeInTheDocument();
    expect(screen.queryByText("You'll see what changes first.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(handlers.onGetChanges).toHaveBeenCalledOnce();
  });

  it("says so when the versions to get cannot be read", async () => {
    await setup({ workingTree: tree([]), pending: NO_PENDING, state: "behind", incomingFails: true });

    expect(screen.getByText("Couldn't read the versions waiting. Review them to see what changes.")).toBeInTheDocument();
    expect(document.querySelector(".overview-detail__placeholder-row")).toBeNull();
  });

  it("holds the place of the versions to get until they are read", async () => {
    await setup({ workingTree: tree([]), pending: NO_PENDING, state: "behind", readIncoming: false });

    expect(screen.getByRole("heading", { name: "What you'll get" })).toBeInTheDocument();
    expect(screen.getByText("Reading the versions…")).toBeInTheDocument();
    expect(document.querySelectorAll(".overview-detail__placeholder-row")).toHaveLength(3);
  });
});
