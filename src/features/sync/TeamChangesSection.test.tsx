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

function renderSection(state: TeamSyncViewState, canPublish = true) {
  const onCheck = vi.fn();
  const onPublish = vi.fn();
  render(
    <LanguageProvider>
      <TeamChangesSection state={state} canPublish={canPublish} onCheck={onCheck} onPublish={onPublish} />
    </LanguageProvider>,
  );
  return { onCheck, onPublish };
}

describe("Team changes section", () => {
  it("starts honest and contacts the remote only from the explicit action", async () => {
    const { onCheck } = renderSection(EMPTY_TEAM_SYNC_STATE);
    expect(screen.getByRole("heading", { name: "Not checked yet" })).toBeInTheDocument();
    expect(onCheck).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Check for team changes" }));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it("shows a cached outcome as not checked in this session", () => {
    renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status({ knowledge: "cached", checkedAt: null, state: "ahead", ahead: 2 }),
    });
    expect(screen.getByRole("heading", { name: "2 saved versions are ready to publish" })).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "1 saved version is ready to publish" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not connect");
    expect(screen.getByText("This result may be out of date.")).toBeInTheDocument();
  });

  it("does not flash the stale warning while a refresh is still running", () => {
    renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status(),
      isLoading: true,
      isCheckingRemote: true,
      isStale: true,
      lastSuccessfulCheckAt: 1_786_000_000_000,
    });
    expect(screen.queryByText("This result may be out of date.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  });

  it("keeps Review and get disabled and exposes technical truth as text", async () => {
    const hostile = "origin<em>unsafe</em>";
    renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status({ state: "behind", behind: 3, upstreamRemote: hostile, nextActions: ["reviewAndGet"] }),
      lastSuccessfulCheckAt: 1_786_000_000_000,
    });
    const review = screen.getByRole("button", { name: /Review and get/ });
    expect(review).toBeDisabled();
    await userEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(document.querySelector("em")).toBeNull();
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

  it("renders only the actions authorized by the sync domain", () => {
    renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status({ state: "unknown", nextActions: ["checkAgain"] }),
    });
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Review and get/ })).not.toBeInTheDocument();
  });

  it("keeps an explicit secondary check action after a fresh up-to-date result", async () => {
    const { onCheck } = renderSection({
      ...EMPTY_TEAM_SYNC_STATE,
      status: status(),
      lastSuccessfulCheckAt: 1_786_000_000_000,
    });
    const checkAgain = screen.getByRole("button", { name: "Check again" });
    expect(checkAgain).toHaveClass("secondary-button");
    await userEvent.click(checkAgain);
    expect(onCheck).toHaveBeenCalledOnce();
  });
});
