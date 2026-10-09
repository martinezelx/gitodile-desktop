import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { createHistoryController, type HistoryPage, type SavedVersionSummary } from "../history";
import type { PendingVersionsResult } from "../publish";
import type { WorkingTreeEntry, WorkingTreeStatus } from "../status";
import { EMPTY_TEAM_SYNC_STATE, type TeamSyncViewState } from "../sync";
import { deriveJourney } from "./journey";
import { OverviewDetail, overviewDetailMode } from "./OverviewDetail";
import { playSceneTransition } from "./sceneMotion";
import { createWorkDetailController } from "./workDetail";

vi.mock("./sceneMotion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sceneMotion")>()),
  playSceneTransition: vi.fn(),
}));

const query = { projectId: "/repo", sessionEpoch: "epoch" };

function version(index: number, publication: SavedVersionSummary["publication"]): SavedVersionSummary {
  return {
    commit: `${index}`.repeat(40),
    shortCommit: `${index}`.repeat(7),
    parents: [],
    subject: `Saved version ${index}`,
    description: "",
    author: { name: "Lin", email: "lin@example.com" },
    authoredAt: { unixSeconds: 1_700_000_000, offsetMinutes: 0 },
    committedAt: { unixSeconds: 1_700_000_000, offsetMinutes: 0 },
    decorations: [],
    isRoot: false,
    isMerge: false,
    publication,
    subjectTruncated: false,
    descriptionTruncated: false,
    decorationsTruncated: false,
    messageUnavailable: null,
  };
}

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

function sync(state: "ahead" | "upToDate" | "behind"): TeamSyncViewState {
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
    },
  };
}

async function setup({
  workingTree,
  pending,
  state,
  readIncoming = true,
  incomingFails = false,
}: {
  workingTree: WorkingTreeStatus | null;
  pending: PendingVersionsResult;
  state: "ahead" | "upToDate" | "behind";
  readIncoming?: boolean;
  incomingFails?: boolean;
}) {
  const page: HistoryPage = {
    repositoryId: query.projectId,
    snapshotToken: "s",
    scope: { kind: "currentLine" },
    branch: "main",
    headState: "branch",
    headCommit: "2".repeat(40),
    upstream: { remote: "origin", destinationBranch: "main", trackingRef: "refs/remotes/origin/main", commit: "1".repeat(40) },
    versions: [version(2, state === "ahead" ? "local-only" : "published"), version(1, "published")],
    nextCursor: null,
    hasMore: false,
    shallow: false,
    warnings: [],
  };
  const history = createHistoryController({
    readPage: vi.fn(async () => page),
    readDetail: vi.fn(),
    readFileDiff: vi.fn(),
    readImagePreview: vi.fn(),
  });
  await history.refresh(query);
  const workDetail = createWorkDetailController({
    readCommitFileChanges: vi.fn(async () => [
      { path: "src/app.ts", originalPath: null, category: "changed" as const },
      { path: "src/new.ts", originalPath: null, category: "new" as const },
    ]),
    getDiscardRecovery: vi.fn(async () => ({ recoveryId: "r", createdAtMs: Date.now() - 60_000, fileCount: 3, selectedPath: null, stateToken: "t" })),
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
    onOpenProjectSettings: vi.fn(),
    onRestoreDiscarded: vi.fn(),
  };
  const draw = (next: { workingTree: WorkingTreeStatus | null; pending: PendingVersionsResult; state: "ahead" | "upToDate" | "behind" }) => {
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
            historyController={history}
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
  vi.mocked(playSceneTransition).mockClear();
});

const ONE_PENDING: PendingVersionsResult = {
  totalCount: 1,
  versions: [{ commit: "2".repeat(40), shortCommit: "2222222", title: "Saved version 2", description: null, committedAt: "2026-10-09T10:00:00Z", author: "Lin" }],
  isTruncated: false,
};

describe("OverviewDetail", () => {
  it("shows what the next version will hold, with the way back as one line", async () => {
    const entry = (path: string): WorkingTreeEntry => ({ path, originalPath: null, category: "changed", isPrepared: false, hasUnpreparedChanges: true });
    const { handlers } = await setup({
      workingTree: tree([entry("src/a.ts"), entry("src/b.ts")], { added: 12, removed: 3 }),
      pending: NO_PENDING,
      state: "upToDate",
    });

    expect(screen.getByRole("heading", { name: "What you'll save" })).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.getByLabelText("12 lines added, 3 removed")).toBeInTheDocument();
    expect(screen.getByText("Stays here until you publish.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Review src/a.ts" }));
    expect(handlers.onReviewChanges).toHaveBeenCalledWith("src/a.ts");

    // The scene leads the column, small, saying what is unsaved here; the
    // detail comes under it.
    const scene = screen.getByRole("region", { name: "Where your work is" });
    expect(scene).toHaveClass("work-scene--small");
    expect(scene).toHaveTextContent("2 unsaved");
    const heading = screen.getByRole("heading", { name: "What you'll save" });
    expect(scene.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(screen.getByText("Seen by anyone on this line.")).toBeInTheDocument();
  });

  it("draws where the work is once nothing is waiting, and opens the restore picker for a discard", async () => {
    const { handlers } = await setup({ workingTree: tree([]), pending: NO_PENDING, state: "upToDate" });

    const scene = screen.getByRole("region", { name: "Where your work is" });
    expect(scene).toHaveClass("work-scene--large");
    expect(scene).toHaveTextContent("Here");
    expect(scene).toHaveTextContent("origin");
    expect(scene).toHaveTextContent("up to date");
    expect(scene.querySelector(".work-scene__path--synced")).not.toBeNull();
    expect(scene).toHaveAttribute("title", expect.stringContaining("if something happens to one"));
    expect(screen.getByText("Discarded changes")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(handlers.onRestoreDiscarded).toHaveBeenCalledOnce();
  });

  it("names the versions waiting on the remote, and shows them arriving in the scene", async () => {
    const { handlers } = await setup({ workingTree: tree([]), pending: NO_PENDING, state: "behind" });

    expect(screen.getByRole("heading", { name: "What you'll get" })).toBeInTheDocument();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    expect(screen.getByText("fix(sync): keep the check")).toBeInTheDocument();
    expect(screen.getByText("You'll see what changes first.")).toBeInTheDocument();
    const scene = screen.getByRole("region", { name: "Where your work is" });
    expect(scene.querySelectorAll(".work-scene__dot--in")).toHaveLength(1);
    expect(scene).toHaveTextContent("1 new");
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

  it("stands the scene's shape in until the project has been read, so it never jumps", async () => {
    await setup({ workingTree: null, pending: NO_PENDING, state: "upToDate" });

    expect(screen.getByRole("status")).toHaveTextContent("Reading where your work is…");
    expect(screen.queryByRole("region", { name: "Where your work is" })).toBeNull();
  });

  it("moves the scene once when its state changes, never on its first drawing", async () => {
    const { redraw } = await setup({ workingTree: tree([]), pending: ONE_PENDING, state: "ahead" });
    expect(playSceneTransition).not.toHaveBeenCalled();

    redraw({ workingTree: tree([]), pending: NO_PENDING, state: "upToDate" });

    expect(playSceneTransition).toHaveBeenCalledOnce();
    const [element, before, after] = vi.mocked(playSceneTransition).mock.calls[0];
    expect(element).toBe(screen.getByRole("region", { name: "Where your work is" }));
    expect(before).toMatchObject({ outgoing: 1, synced: false });
    expect(after).toMatchObject({ outgoing: 0, synced: true });
  });

  it("keeps a change made while the Overview was hidden for when it comes back", async () => {
    const { redraw, lifecycle } = await setup({ workingTree: tree([]), pending: ONE_PENDING, state: "ahead" });

    act(() => lifecycle.transition("hidden"));
    redraw({ workingTree: tree([]), pending: NO_PENDING, state: "upToDate" });
    expect(playSceneTransition).not.toHaveBeenCalled();

    act(() => lifecycle.transition("active"));
    await waitFor(() => expect(playSceneTransition).toHaveBeenCalledOnce());
    expect(vi.mocked(playSceneTransition).mock.calls[0][1]).toMatchObject({ outgoing: 1 });
  });
});
