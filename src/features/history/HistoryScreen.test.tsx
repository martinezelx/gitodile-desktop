import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { createHistoryController } from "./controller";
import type { HistoryPage } from "./domain";
import { HistoryScreen } from "./HistoryScreen";
import type { HistoryPort } from "./port";

function emptyPage(token: string): HistoryPage {
  return {
    repositoryId: "/repo", snapshotToken: token, branch: "main", headState: "branch", headCommit: null,
    upstream: null, versions: [], nextCursor: null, hasMore: false, shallow: false, warnings: [],
  };
}

afterEach(cleanup);

describe("HistoryScreen lifecycle", () => {
  it("does not fetch on navigation and freezes announcements while hidden", async () => {
    const port: HistoryPort = {
      readPage: vi.fn(async () => emptyPage("unexpected")),
      readDetail: vi.fn(),
      readFileDiff: vi.fn(),
    };
    const controller = createHistoryController(port);
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    await controller.refresh(query);
    vi.mocked(port.readPage).mockClear();
    const lifecycle = createScreenLifecycleController("active");
    render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HistoryScreen controller={controller} projectPath="/repo" sessionEpoch="epoch-1" />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    );
    expect(screen.getByText("No saved versions yet")).toBeInTheDocument();
    expect(port.readPage).not.toHaveBeenCalled();

    act(() => lifecycle.transition("hidden"));
    act(() => controller.supersede(query));
    expect(port.readPage).not.toHaveBeenCalled();
    act(() => lifecycle.transition("active"));
    expect(screen.getByText("No saved versions yet")).toBeInTheDocument();
  });
});
