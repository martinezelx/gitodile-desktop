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
    repositoryId: "/repo", snapshotToken: token, scope: { kind: "currentLine" } as const, branch: "main", headState: "branch", headCommit: null,
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
      readImagePreview: vi.fn(),
    };
    const controller = createHistoryController(port);
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    await controller.refresh(query);
    vi.mocked(port.readPage).mockClear();
    const lifecycle = createScreenLifecycleController("active");
    render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HistoryScreen controller={controller} projectPath="/repo" sessionEpoch="epoch-1" watcherState="watching" onOpenSettings={() => {}} />
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

  it("takes a line another screen asked for once, and does not re-apply it on later renders", async () => {
    const port: HistoryPort = {
      readPage: vi.fn(async () => emptyPage("token-1")),
      readDetail: vi.fn(),
      readFileDiff: vi.fn(),
      readImagePreview: vi.fn(),
    };
    const controller = createHistoryController(port);
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    const setScope = vi.spyOn(controller, "setScope");
    const handled = vi.fn();
    const lifecycle = createScreenLifecycleController("active");

    function Screen({ intent }: { intent: string | null }): React.JSX.Element {
      return (
        <LanguageProvider>
          <ScreenLifecycleProvider controller={lifecycle}>
            <HistoryScreen
              controller={controller}
              projectPath="/repo"
              sessionEpoch="epoch-1"
              watcherState="watching"
              scopeLineIntent={intent}
              onScopeLineIntentHandled={handled}
              onOpenSettings={() => {}}
            />
          </ScreenLifecycleProvider>
        </LanguageProvider>
      );
    }

    const view = render(<Screen intent="feature/foo" />);
    expect(setScope).toHaveBeenCalledWith(query, { kind: "line", name: "feature/foo" });
    expect(handled).toHaveBeenCalledOnce();

    // The composition root clears the intent as soon as it is taken. From here
    // on the reader owns the scope: re-rendering the screen — which
    // `KeepAliveScreens` does on every render of the app around it — must not
    // put the earlier target back.
    setScope.mockClear();
    view.rerender(<Screen intent={null} />);
    view.rerender(<Screen intent={null} />);
    expect(setScope).not.toHaveBeenCalled();
  });
});
