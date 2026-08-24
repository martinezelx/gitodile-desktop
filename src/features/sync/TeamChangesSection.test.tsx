import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { EMPTY_TEAM_SYNC_STATE, type TeamSyncStatus, type TeamSyncViewState } from "./domain";
import { TeamChangesSection } from "./TeamChangesSection";

afterEach(cleanup);

const status = (overrides: Partial<TeamSyncStatus> = {}): TeamSyncStatus => ({
  state: "upToDate",
  localBranch: "main",
  localCommit: "abc1234567890",
  upstreamRemote: "origin",
  destinationBranch: "main",
  trackingRef: "refs/remotes/origin/main",
  remoteCommit: "def1234567890",
  ahead: 0,
  behind: 0,
  knowledge: "fresh",
  checkedAt: 1_786_000_000_000,
  warnings: [],
  nextActions: ["checkAgain"],
  stateToken: "opaque",
  ...overrides,
});

function renderSection(state: TeamSyncViewState, canPublish = true, isRefreshing = false) {
  const onPublish = vi.fn();
  const onReviewAndGet = vi.fn();
  const rendered = render(
    <LanguageProvider>
      <TeamChangesSection
        state={state}
        isRefreshing={isRefreshing}
        canPublish={canPublish}
        onPublish={onPublish}
        onReviewAndGet={onReviewAndGet}
      />
    </LanguageProvider>,
  );
  return { ...rendered, onPublish, onReviewAndGet };
}

describe("Team changes section", () => {
  it("starts honest without owning a second refresh action", () => {
    renderSection(EMPTY_TEAM_SYNC_STATE);
    expect(screen.getByRole("heading", { name: "Team changes" })).toBeInTheDocument();
    expect(screen.getByText("Not checked yet")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a cached outcome as not checked in this session", () => {
    renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status({ knowledge: "cached", checkedAt: null, state: "ahead", ahead: 2 }),
    });
    expect(screen.getByText("2 saved versions are ready to publish")).toBeInTheDocument();
    expect(screen.getByText("They’re still only on this computer.")).toBeInTheDocument();
    expect(screen.getByText("Not checked this session · using saved remote information.")).toBeInTheDocument();
  });

  it("keeps a stale result visible with a non-color error cue", () => {
    renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status({ state: "ahead", ahead: 1 }),
      isStale: true,
      error: "Could not connect",
      lastSuccessfulCheckAt: 1_786_000_000_000,
    });
    expect(screen.getByText("1 saved version is ready to publish")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not connect");
    expect(screen.getByText("This result may be out of date.")).toBeInTheDocument();
  });

  it("does not flash the stale warning while a refresh is still running", () => {
    const { container } = render(
      <LanguageProvider>
        <TeamChangesSection
          state={{
      ...EMPTY_TEAM_SYNC_STATE,
      status: status(),
      isLoading: true,
      isCheckingRemote: true,
      isStale: true,
      lastSuccessfulCheckAt: 1_786_000_000_000,
          }}
          canPublish
          onPublish={vi.fn()}
          onReviewAndGet={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.queryByText("This result may be out of date.")).not.toBeInTheDocument();
    expect(screen.getByText("You’re up to date")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Checking…" })).not.toBeInTheDocument();
    expect(container.querySelector(".team-changes__icon .icon--spinning")).not.toBeNull();
  });

  it("can enter refresh feedback in the same frame as the other Overview sections", () => {
    const { container } = renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status(),
    }, true, true);

    expect(container.querySelector(".team-changes__icon .icon--spinning")).not.toBeNull();
    expect(screen.getByText("You’re up to date")).toBeInTheDocument();
  });

  it("shows the current and team lines without exposing technical details", async () => {
    const hostile = "origin<em>unsafe</em>";
    const { onReviewAndGet } = renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status({ state: "behind", behind: 3, upstreamRemote: hostile, nextActions: ["reviewAndGet"] }),
      lastSuccessfulCheckAt: 1_786_000_000_000,
    });
    const review = screen.getByRole("button", { name: /Review and get/ });
    expect(review).toBeEnabled();
    await userEvent.click(review);
    expect(onReviewAndGet).toHaveBeenCalledOnce();
    expect(screen.getByText("Current line")).toBeInTheDocument();
    expect(screen.getByText("Team line")).toBeInTheDocument();
    expect(screen.getByText(`${hostile}/main`)).toBeInTheDocument();
    expect(screen.queryByText("Technical details")).not.toBeInTheDocument();
    expect(document.querySelector("em")).toBeNull();
  });

  it("does not offer Review and get for cached or stale behind knowledge", () => {
    renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status({
        state: "behind",
        behind: 2,
        knowledge: "cached",
        checkedAt: null,
        nextActions: ["reviewAndGet"],
      }),
      isStale: true,
    });
    expect(screen.queryByRole("button", { name: "Review and get" })).not.toBeInTheDocument();
  });

  it("offers Publish changes only for an actionable ahead result", async () => {
    const { onPublish } = renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status({ state: "ahead", ahead: 2, nextActions: ["publishChanges"] }),
      lastSuccessfulCheckAt: 1_786_000_000_000,
    });
    await userEvent.click(screen.getByRole("button", { name: "Publish changes" }));
    expect(onPublish).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
  });

  it("renders only non-refresh actions authorized by the sync domain", () => {
    renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status({ state: "unknown", nextActions: ["checkAgain"] }),
    });
    expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Review and get/ })).not.toBeInTheDocument();
  });

  it("leaves a fresh up-to-date result without a card-level action", () => {
    renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status(),
      lastSuccessfulCheckAt: 1_786_000_000_000,
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps its live announcement aligned when an applied update changes the sync truth", () => {
    const props = {
      canPublish: true,
      onPublish: vi.fn(),
      onReviewAndGet: vi.fn(),
    };
    const { rerender } = render(
      <LanguageProvider>
        <TeamChangesSection
          {...props}
          state={{
            ...EMPTY_TEAM_SYNC_STATE,
            status: status({ state: "behind", behind: 1, nextActions: ["reviewAndGet"] }),
            isCheckingRemote: true,
          }}
        />
      </LanguageProvider>,
    );

    rerender(
      <LanguageProvider>
        <TeamChangesSection
          {...props}
          state={{ ...EMPTY_TEAM_SYNC_STATE, status: status(), lastSuccessfulCheckAt: 1_786_000_000_000 }}
        />
      </LanguageProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("You’re up to date. Nothing to publish or get.");

    rerender(
      <LanguageProvider>
        <TeamChangesSection
          {...props}
          state={{
            ...EMPTY_TEAM_SYNC_STATE,
            status: status({ state: "ahead", ahead: 1, nextActions: ["publishChanges"] }),
          }}
        />
      </LanguageProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 saved version is ready to publish. They’re still only on this computer.",
    );
  });
});
