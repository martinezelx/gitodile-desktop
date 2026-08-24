import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../screenModule";
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
  };
}

function renderSection(controller: ReturnType<typeof createHistoryController>, onOpenHistory = vi.fn()) {
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
            onOpenHistory={onOpenHistory}
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
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(readPage).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open “Saved version 1” in history" }));

    expect(controller.getSnapshot(query).selectedCommit).toBe(version(1).commit);
    expect(onOpenHistory).toHaveBeenCalledOnce();
  });

  it("shows a truthful empty state after history has loaded", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([]))));
    await controller.refresh(query);
    renderSection(controller);

    expect(screen.getByText("No saved versions yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View all history" })).not.toBeInTheDocument();
  });

  it("lets the user retry a failed history read", async () => {
    const readPage = vi
      .fn<HistoryPort["readPage"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page([]));
    const controller = createHistoryController(port(readPage));
    await controller.refresh(query);
    const user = userEvent.setup();
    renderSection(controller);

    expect(screen.getByRole("alert")).toHaveTextContent("Recent history is unavailable");
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByText("No saved versions yet")).toBeInTheDocument());
    expect(readPage).toHaveBeenCalledTimes(2);
  });
});
