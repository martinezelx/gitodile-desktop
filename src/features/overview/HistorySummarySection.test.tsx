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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Some tests fit the screen to a window; the rest scroll as a page.
  delete (window as Partial<Window>).matchMedia;
});

const eight = () => [9, 8, 7, 6, 5, 4, 3, 2].map(version).map((item) => ({ ...item, publication: "published" as const }));

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
    // The unpublished version leads the timeline, grouped under one label.
    expect(screen.getByText("Only on this computer")).toBeInTheDocument();
    expect(screen.getByText("1 version")).toBeInTheDocument();
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

    // Author, reference, time — the same order the History timeline uses.
    // The group the row sits in says it is unpublished, so the row does not.
    const order = (row: HTMLElement): string[] =>
      [...row.querySelectorAll<HTMLElement>(".overview-history__meta > *")].map((element) => element.className.split(" ")[0]);
    expect(order(rows[0])).toEqual([
      "overview-history__author", "history-meta-dot", "history-ref-badge", "history-meta-dot", "overview-history__date",
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

  it("groups the unpublished versions and marks where the remote's copy begins", async () => {
    const trackingRef = "refs/remotes/origin/main";
    const upstream = { remote: "origin", destinationBranch: "main", trackingRef, commit: version(1).commit };
    const controller = createHistoryController(
      port(vi.fn(async () => ({ ...page([version(3), version(2), version(1)]), upstream }))),
    );
    await controller.refresh(query);
    const { container } = renderSection(controller);

    const group = container.querySelector<HTMLElement>(".overview-timeline__group");
    expect(group).not.toBeNull();
    expect(group).toHaveTextContent("Only on this computer");
    expect(group).toHaveTextContent("2 versions");
    expect(group?.querySelectorAll(".overview-history__row")).toHaveLength(2);
    // The mark sits between the group and the published version, and names
    // only the remote when the line has the same name as the one stood on.
    const timeline = container.querySelector<HTMLElement>(".overview-timeline");
    const children = [...(timeline?.children ?? [])].map((child) => child.className.split(" ")[0]);
    expect(children).toEqual(["overview-timeline__group", "overview-timeline__mark", "overview-timeline__item"]);
    expect(container.querySelector(".overview-timeline__mark")).toHaveTextContent("Published on origin");
  });

  it("puts the working tree first when it is given one", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(1)]))));
    await controller.refresh(query);
    const lifecycle = createScreenLifecycleController("active");
    const { container } = render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HistorySummarySection
            controller={controller}
            projectPath={query.projectId}
            sessionEpoch={query.sessionEpoch}
            onOpenHistory={vi.fn()}
            now={<span>Now node</span>}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    );

    const first = container.querySelector(".overview-timeline > li");
    expect(first).toHaveClass("overview-timeline__now");
    expect(first).toHaveTextContent("Now node");
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

    expect(container.querySelector(".overview-timeline__group")).toBeNull();
  });

  it("shows a truthful empty state after history has loaded", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([]))));
    await controller.refresh(query);
    renderSection(controller);

    expect(screen.getByText("No saved versions yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View all" })).not.toBeInTheDocument();
  });

  it("shows refresh progress beside the title while keeping cached history visible", async () => {
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
    await waitFor(() => expect(container.querySelector(".overview-history__refreshing")).not.toBeNull());
    expect(screen.getByText("Saved version 2")).toBeInTheDocument();

    finishRefresh?.(page([version(2)]));
    await refresh;
  });

  it("can enter refresh feedback immediately before its repository read starts", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(2)]))));
    await controller.refresh(query);
    const { container } = renderSection(controller, vi.fn(), true);

    expect(container.querySelector(".overview-history__refreshing")).not.toBeNull();
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

  it("ends on a fading rail, not a count, when there are more versions than it shows", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page(eight()))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    // Scrolling as a page, the timeline keeps its fixed length.
    expect(container.querySelectorAll("[data-fit-row]")).toHaveLength(6);
    expect(container.querySelector(".overview-timeline__tail")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText(/more/i)).toBeNull();
    expect(screen.getAllByRole("button", { name: "View all" })).toHaveLength(1);
  });

  it("draws no fading end when every version is shown", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(2), version(1)]))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    expect(container.querySelector(".overview-timeline__tail")).toBeNull();
  });

  it("shows as many whole versions as the window has room for when it fits the screen", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (media: string) => ({ matches: true, media, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    // A 300px box, each version row 50px tall in order.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("overview-history__fit")) return new DOMRect(0, 0, 600, 300);
      if (this.hasAttribute("data-fit-row")) {
        const index = Array.from(document.querySelectorAll("[data-fit-row]")).indexOf(this);
        return new DOMRect(0, index * 50, 600, 50);
      }
      return new DOMRect(0, 0, 0, 0);
    });
    const controller = createHistoryController(port(vi.fn(async () => page(eight()))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    // Six rows reach the bottom, but not all eight fit: the fading end takes
    // its room and five stay, none cut in half.
    await waitFor(() => expect(container.querySelectorAll("[data-fit-row]")).toHaveLength(5));
    expect(container.querySelector(".overview-timeline__tail")).not.toBeNull();
  });
});
