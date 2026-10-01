import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { createHistoryController, type HistoryPage, type HistoryPort, type SavedVersionSummary } from "../history";
import { HistorySummarySection } from "./HistorySummarySection";

const query = { projectId: "/repo", sessionEpoch: "overview-history-epoch" };

function version(index: number): SavedVersionSummary {
  return {
    commit: `${index}`.repeat(40),
    shortCommit: `${index}`.repeat(7),
    parents: index === 1 ? [] : [`${index - 1}`.repeat(40)],
    subject: `Saved version ${index}`,
    description: "",
    author: { name: index === 1 ? "Ada" : "Lin", email: "author@example.com" },
    authoredAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 60 },
    committedAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 60 },
    decorations: [],
    isRoot: index === 1,
    isMerge: false,
    publication: index === 1 ? "published" : "local-only",
    subjectTruncated: false,
    descriptionTruncated: false,
    decorationsTruncated: false,
    messageUnavailable: null,
  };
}

function page(versions: SavedVersionSummary[]): HistoryPage {
  return {
    repositoryId: query.projectId,
    snapshotToken: "snapshot-1",
    scope: { kind: "currentLine" } as const,
    branch: "main",
    headState: "branch",
    headCommit: versions[0]?.commit ?? null,
    upstream: null,
    versions,
    nextCursor: null,
    hasMore: false,
    shallow: false,
    warnings: [],
  };
}

function port(readPage: HistoryPort["readPage"]): HistoryPort {
  return {
    readPage,
    readDetail: vi.fn(async (request) => ({
      version: version(Number(request.commit[0])),
      comparisonBase: "",
      comparisonIsEmptyTree: false,
      comparisonIsFirstParent: false,
      files: [],
      fileCounts: { changed: 0, new: 0, deleted: 0, renamed: 0, total: 0 },
      filesTruncated: false,
      countsAreMinimum: false,
    })),
    readFileDiff: vi.fn(),
    readImagePreview: vi.fn(),
  };
}

function renderSection(
  controller: ReturnType<typeof createHistoryController>,
  onOpenHistory = vi.fn(),
  isRefreshing = false,
  selfEmail: string | null = null,
) {
  const lifecycle = createScreenLifecycleController("active");
  return {
    onOpenHistory,
    ...render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HistorySummarySection
            controller={controller}
            projectPath={query.projectId}
            sessionEpoch={query.sessionEpoch}
            isRefreshing={isRefreshing}
            onOpenHistory={onOpenHistory}
            selfEmail={selfEmail}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    ),
  };
}

afterEach(cleanup);

describe("HistorySummarySection", () => {
  it("reuses the warmed history cache and opens the selected version", async () => {
    const readPage = vi.fn(async () => page([version(2), version(1)]));
    const controller = createHistoryController(port(readPage));
    await controller.refresh(query);
    readPage.mockClear();
    const user = userEvent.setup();
    const { onOpenHistory } = renderSection(controller);

    expect(screen.getByRole("heading", { name: "Recent history" })).toBeInTheDocument();
    expect(screen.getByText("Saved version 2")).toBeInTheDocument();
    // No label row splits the list: the unpublished rows mark themselves.
    expect(screen.getByText("Your latest saved versions, newest first.")).toBeInTheDocument();
    expect(screen.queryByText(/only on this computer/i)).toBeNull();
    expect(screen.queryByText(version(2).shortCommit)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View all" })).toBeInTheDocument();
    expect(readPage).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open “Saved version 1” in History" }));

    expect(controller.getSnapshot(query).selectedCommit).toBe(version(1).commit);
    expect(onOpenHistory).toHaveBeenCalledOnce();
  });

  it("names the line a recent version sits on without turning it into prose", async () => {
    const tip: SavedVersionSummary = {
      ...version(2),
      decorations: [
        { kind: "head", name: "HEAD", fullRef: "HEAD" },
        { kind: "localBranch", name: "main", fullRef: "refs/heads/main" },
      ],
    };
    const controller = createHistoryController(port(vi.fn(async () => page([tip, version(1)]))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    const rows = container.querySelectorAll<HTMLButtonElement>(".overview-history__row");
    const badge = rows[0].querySelector(".history-ref-badge");
    // The line being stood on is called "current": the header names it.
    expect(badge).toHaveTextContent("current");
    expect(badge).toHaveAttribute("title", expect.stringContaining("refs/heads/main"));
    expect(badge).toHaveClass("history-ref-badge--current");
    // Version 2 is still only on this computer, and the label says so last.
    expect(rows[0].getAttribute("aria-label")).toBe("Open “Saved version 2” in History — Version line main — Not published");
    expect(rows[1].querySelector(".history-ref-badge")).toBeNull();
    expect(rows[1].getAttribute("aria-label")).toBe("Open “Saved version 1” in History");

    // The unpublished mark leads, then author, reference, time — the same
    // order the History timeline uses.
    const order = (row: HTMLElement): string[] =>
      [...row.querySelectorAll<HTMLElement>(".overview-history__meta > *")].map((element) => element.className.split(" ")[0]);
    expect(order(rows[0])).toEqual([
      "state-glyph", "overview-history__author", "history-meta-dot", "history-ref-badge", "history-meta-dot", "overview-history__date",
    ]);
    expect(order(rows[1])).toEqual(["overview-history__author", "history-meta-dot", "overview-history__date"]);
  });

  it("leaves the current line's copy on the remote unbadged, keeping other lines' names", async () => {
    const trackingRef = "refs/remotes/origin/main";
    const upstreamTip: SavedVersionSummary = {
      ...version(1),
      decorations: [{ kind: "remoteBranch", name: "origin/main", fullRef: trackingRef }],
    };
    const other: SavedVersionSummary = {
      ...version(3),
      publication: "published",
      decorations: [{ kind: "remoteBranch", name: "origin/feature", fullRef: "refs/remotes/origin/feature" }],
    };
    const upstream = { remote: "origin", destinationBranch: "main", trackingRef, commit: upstreamTip.commit };
    const controller = createHistoryController(port(vi.fn(async () => ({ ...page([other, version(2), upstreamTip]), upstream }))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    const rows = container.querySelectorAll<HTMLButtonElement>(".overview-history__row");
    expect(rows[0].querySelector(".history-ref-badge")).toHaveTextContent("origin/feature");
    expect(rows[2].querySelector(".history-ref-badge")).toBeNull();
    expect(rows[2].querySelector(".history-meta-dot + .history-meta-dot")).toBeNull();
    expect(rows[2].getAttribute("aria-label")).toBe("Open “Saved version 1” in History");
  });

  it("marks unpublished versions and offers to publish up to one of them", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(2), version(1)]))));
    await controller.refresh(query);
    const onPublishUpTo = vi.fn();
    const lifecycle = createScreenLifecycleController("active");
    render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HistorySummarySection
            controller={controller}
            projectPath={query.projectId}
            sessionEpoch={query.sessionEpoch}
            canPublish
            onOpenHistory={vi.fn()}
            onPublishUpTo={onPublishUpTo}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    );

    // Only the local-only row carries the mark and the action; the
    // published one below it has neither.
    expect(screen.queryByText("Not published")).toBeNull();
    const publish = screen.getByRole("button", { name: "Publish up to here: Saved version 2" });
    await userEvent.click(publish);
    expect(onPublishUpTo).toHaveBeenCalledWith(version(2).commit);
    expect(screen.queryByRole("button", { name: /Publish up to here: Saved version 1/ })).toBeNull();
  });

  it("marks each unpublished version with History's laptop glyph and no label rows", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(3), version(2), version(1)]))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    const items = [...container.querySelectorAll<HTMLElement>(".overview-history__list > li")];
    expect(items).toHaveLength(3);
    const glyphs = items.map((item) => item.querySelector(".overview-history__meta .state-glyph"));
    expect(glyphs.map((glyph) => glyph !== null)).toEqual([true, true, false]);
    expect(glyphs[0]).toHaveAttribute("data-tooltip", "Saved locally — not published yet, so it's only on this computer");
  });

  it("keeps the publish hand-off off the rows when publishing is not possible", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(2), version(1)]))));
    await controller.refresh(query);
    renderSection(controller);

    expect(screen.queryByRole("button", { name: /Publish up to here/ })).toBeNull();
  });

  it("says You for versions saved under the user's own identity, keeping the name one hover away", async () => {
    const theirs: SavedVersionSummary = { ...version(1), author: { name: "Ada", email: "ada@example.com" } };
    const controller = createHistoryController(port(vi.fn(async () => page([version(2), theirs]))));
    await controller.refresh(query);
    const { container } = renderSection(controller, vi.fn(), false, "Author@Example.com");

    const authors = container.querySelectorAll<HTMLElement>(".overview-history__author");
    expect(authors[0]).toHaveTextContent("You");
    expect(authors[0]).toHaveAttribute("title", "Lin");
    expect(authors[1]).toHaveTextContent("Ada");
  });

  it("marks nothing when every recent version is published", async () => {
    const published = (index: number): SavedVersionSummary => ({ ...version(index), publication: "published" });
    const controller = createHistoryController(port(vi.fn(async () => page([published(2), published(1)]))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    expect(container.querySelector(".state-glyph")).toBeNull();
  });

  it("shows a truthful empty state after history has loaded", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([]))));
    await controller.refresh(query);
    renderSection(controller);

    expect(screen.getByText("No saved versions yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View all" })).not.toBeInTheDocument();
  });

  it("shows refresh progress in the section icon while keeping cached history visible", async () => {
    let finishRefresh: ((value: HistoryPage) => void) | undefined;
    const pendingRefresh = new Promise<HistoryPage>((resolve) => {
      finishRefresh = resolve;
    });
    const readPage = vi
      .fn<HistoryPort["readPage"]>()
      .mockResolvedValueOnce(page([version(2)]))
      .mockReturnValueOnce(pendingRefresh);
    const controller = createHistoryController(port(readPage));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    const refresh = controller.refresh(query);
    await waitFor(() => expect(container.querySelector(".overview-history__icon .icon--spinning")).not.toBeNull());
    expect(screen.getByText("Saved version 2")).toBeInTheDocument();

    finishRefresh?.(page([version(2)]));
    await refresh;
  });

  it("can enter refresh feedback immediately before its repository read starts", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(2)]))));
    await controller.refresh(query);
    const { container } = renderSection(controller, vi.fn(), true);

    expect(container.querySelector(".overview-history__icon .icon--spinning")).not.toBeNull();
    expect(screen.getByText("Saved version 2")).toBeInTheDocument();
  });

  it("offers a contextual retry when the first history read fails", async () => {
    const readPage = vi
      .fn<HistoryPort["readPage"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page([]));
    const controller = createHistoryController(port(readPage));
    await controller.refresh(query);
    renderSection(controller);

    expect(screen.getByRole("alert")).toHaveTextContent("Recent history is unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(readPage).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No saved versions yet")).toBeInTheDocument();
  });
});
