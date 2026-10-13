import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { ToastProvider } from "../../shared/ui";
import type { SyncController } from "./controller";
import type { GetTeamChangesPlan, GetTeamChangesResult, IncomingForecast, TeamSyncStatus } from "./domain";
import { GetTeamChangesDialog, type GetTeamIntent, type PublishAfterGet } from "./GetTeamChangesDialog";

afterEach(cleanup);

const clearForecast: IncomingForecast = {
  outcome: "clear",
  integration: "fastForward",
  remoteCommit: "2222222222222222222222222222222222222222",
  incomingCount: 2,
  localCount: 0,
  incomingFileCount: 3,
  authors: ["Ada", "Grace"],
  authorCount: 2,
  carriedUnsavedCount: 2,
  combinedUnsaved: [],
  combinedUnsavedCount: 0,
  overlaps: [],
  overlapCount: 0,
  blocker: null,
};

const basePlan: GetTeamChangesPlan = {
  operationKind: "history-mutation",
  requiresConfirmation: true,
  projectId: "/repo",
  sessionEpoch: "epoch-1",
  stateToken: "opaque-token",
  branch: "main",
  target: { remote: "origin", destinationBranch: "main" },
  trackingRef: "refs/remotes/origin/main",
  localCommit: "1111111111111111111111111111111111111111",
  remoteCommit: "2222222222222222222222222222222222222222",
  integration: "fastForward",
  incomingCount: 2,
  incomingVersions: [
    { commit: "2", shortCommit: "2222222", title: "Team work", description: null, committedAt: "2026-08-16T10:00:00Z", author: "Ada", fileCount: 2 },
    { commit: "3", shortCommit: "3333333", title: "Docs", description: null, committedAt: "2026-08-16T11:00:00Z", author: "Grace", fileCount: 1 },
  ],
  versionsTruncated: false,
  localCount: 0,
  localVersions: [],
  fileImpact: {
    totalCount: 3,
    counts: { added: 1, modified: 2, deleted: 0, renamed: 0, binary: 0 },
    files: [],
    isTruncated: false,
  },
  forecast: clearForecast,
  mergeMessage: null,
  recovery: {
    reference: "refs/gitodile/recovery/v1/get-team-changes/worktree-a/1",
    explanation: "protected",
    retention: "newest 20",
    retentionLimit: 20,
  },
};

const mergePlan: GetTeamChangesPlan = {
  ...basePlan,
  integration: "merge",
  localCount: 1,
  localVersions: [{ commit: "4", shortCommit: "4444444", title: "Mine", description: null, committedAt: "2026-08-16T09:00:00Z", author: "Me" }],
  forecast: { ...clearForecast, integration: "merge", localCount: 1, carriedUnsavedCount: 0 },
  mergeMessage: "Merge remote-tracking branch 'origin/main'",
};

const syncStatus = (remoteCommit: string): TeamSyncStatus => ({
  state: "behind", localBranch: "main", localCommit: basePlan.localCommit,
  upstreamRemote: "origin", destinationBranch: "main", trackingRef: basePlan.trackingRef,
  remoteCommit, ahead: 0, behind: 3, knowledge: "fresh", checkedAt: 1,
  warnings: [], nextActions: ["reviewAndGet"], stateToken: "fresh", forecast: null,
});

const result = (
  outcome: "completed" | "uncertain",
  integration: GetTeamChangesResult["integration"] = "fastForward",
): GetTeamChangesResult => ({
  outcome,
  projectId: "/repo",
  sessionEpoch: "epoch-1",
  branch: "main",
  target: basePlan.target,
  trackingRef: basePlan.trackingRef,
  integration,
  previousCommit: basePlan.localCommit,
  resultingCommit: outcome === "completed" ? basePlan.remoteCommit : null,
  observedHead: basePlan.remoteCommit,
  receivedCount: 2,
  combinedUnsavedCount: 0,
  recovery: {
    schemaVersion: 1,
    recoveryId: "1",
    reference: basePlan.recovery.reference,
    createdAtMs: 1,
    operation: "get-team-changes",
    ownerId: "worktree-a",
    branch: "main",
    previousCommit: basePlan.localCommit,
    targetCommit: basePlan.remoteCommit,
    remote: "origin",
    destinationBranch: "main",
    trackingRef: basePlan.trackingRef,
    stateToken: basePlan.stateToken,
    retentionLimit: 20,
  },
  syncStatus: outcome === "completed" ? { ...syncStatus(basePlan.remoteCommit), state: "upToDate", behind: 0 } : null,
  warnings: outcome === "uncertain" ? [{ code: "localUpdateUncertain", message: "Observed state needs review" }] : [],
  inspectionInstructions: outcome === "uncertain" ? "Inspect safely" : null,
});

function controller(plan: GetTeamChangesPlan = basePlan, overrides: Partial<SyncController> = {}): SyncController {
  return {
    planGet: vi.fn(async () => plan),
    get: vi.fn(async () => result("completed", plan.integration)),
    ...overrides,
  } as unknown as SyncController;
}

function renderDialog(
  syncController: SyncController,
  options: {
    intent?: GetTeamIntent;
    canPublish?: boolean;
    runHooks?: boolean;
    refreshRemote?: (() => Promise<TeamSyncStatus | null>) | null;
    upstreamGone?: boolean;
    onSaveVersion?: () => void;
    onRevealFile?: (path: string) => void;
    onPublishAfter?: () => Promise<PublishAfterGet>;
  } = {},
) {
  const onClose = vi.fn();
  const onPhaseChange = vi.fn();
  const onApplied = vi.fn(async () => undefined);
  render(
    <LanguageProvider>
      <ToastProvider>
        <GetTeamChangesDialog
          isOpen
          controller={syncController}
          projectPath="/repo"
          sessionEpoch="epoch-1"
          intent={options.intent}
          runHooks={options.runHooks ?? true}
          canPublish={options.canPublish}
          refreshRemote={options.refreshRemote}
          upstreamGone={options.upstreamGone}
          onClose={onClose}
          onApplied={onApplied}
          onPhaseChange={onPhaseChange}
          onSaveVersion={options.onSaveVersion}
          onRevealFile={options.onRevealFile}
          onPublishAfter={options.onPublishAfter}
        />
      </ToastProvider>
    </LanguageProvider>,
  );
  return { onApplied, onClose, onPhaseChange };
}

describe("Get project changes dialog", () => {
  it("says in one line what comes in and what of yours stays, without waiting on the network", async () => {
    const sync = controller();
    renderDialog(sync);
    expect(await screen.findByRole("heading", { name: "Get 2 versions from origin" })).toBeInTheDocument();
    expect(screen.getByText("From Ada and Grace · 3 files")).toBeInTheDocument();
    expect(screen.getByText("Nothing of yours overlaps. Your 2 unsaved files stay as they are.")).toBeInTheDocument();
    expect(screen.getByText("A recovery point is saved first.")).toBeInTheDocument();
    // The list of versions is there but folded; technical evidence too.
    expect(screen.getByText("What comes in")).toBeInTheDocument();
    expect(screen.getByText("Team work")).not.toBeVisible();
    expect(sync.planGet).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1" });
  });

  it("gets with one press, passing the hooks switch, and closes on a toast", async () => {
    const sync = controller();
    const { onApplied, onClose, onPhaseChange } = renderDialog(sync, { runHooks: false });
    await userEvent.click(await screen.findByRole("button", { name: "Get" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(sync.get).toHaveBeenCalledWith(expect.objectContaining({
      stateToken: "opaque-token",
      recoveryReference: basePlan.recovery.reference,
      runHooks: false,
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPhaseChange).toHaveBeenLastCalledWith("success");
  });

  it("offers to combine a diverged line, and to publish in the same confirmation", async () => {
    const sync = controller(mergePlan);
    const onPublishAfter = vi.fn(async () => ({ publishedCount: 2, remote: "origin" }));
    const { onClose } = renderDialog(sync, { canPublish: true, onPublishAfter });
    expect(await screen.findByRole("heading", { name: "Get 2 versions and combine them with yours" })).toBeInTheDocument();
    expect(screen.getByText(/A merge version joins both lines/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get and combine" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Get, combine and publish" }));
    await waitFor(() => expect(onPublishAfter).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("leads with publishing when that is what was asked for", async () => {
    const onPublishAfter = vi.fn(async () => ({ publishedCount: 2, remote: "origin" }));
    renderDialog(controller(mergePlan), { intent: "getAndPublish", onPublishAfter });
    expect(await screen.findByRole("heading", { name: "Publish 1 version to origin" })).toBeInTheDocument();
    expect(screen.getByText("First 2 versions come in from Ada and Grace.")).toBeInTheDocument();
    expect(screen.getByText(/Then your version and the merge version are published to origin/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Get and publish" }));
    await waitFor(() => expect(onPublishAfter).toHaveBeenCalled());
  });

  it("keeps the project up to date and offers to retry when only the publish fails", async () => {
    const onPublishAfter = vi.fn()
      .mockRejectedValueOnce({ code: "remote_rejected", message: "no", remediation: null })
      .mockResolvedValueOnce({ publishedCount: 2, remote: "origin" });
    const { onClose } = renderDialog(controller(mergePlan), { intent: "getAndPublish", onPublishAfter });
    await userEvent.click(await screen.findByRole("button", { name: "Get and publish" }));
    expect(await screen.findByText("Your project is up to date, but publishing failed.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try publishing again" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPublishAfter).toHaveBeenCalledTimes(2);
  });

  it("names unsaved edits it keeps on top of incoming ones", async () => {
    renderDialog(controller({
      ...basePlan,
      forecast: { ...clearForecast, carriedUnsavedCount: 0, combinedUnsaved: ["README.md"], combinedUnsavedCount: 1 },
    }));
    expect(await screen.findByText("Your unsaved edits to README.md stay unsaved, on top of the incoming ones.")).toBeInTheDocument();
  });

  it("refuses overlaps with the files and no way through", async () => {
    const sync = controller({
      ...mergePlan,
      forecast: {
        ...mergePlan.forecast,
        outcome: "overlap",
        overlaps: [{ path: "src/auth.ts", side: "saved" }, { path: "README.md", side: "unsaved" }],
        overlapCount: 3,
      },
    });
    renderDialog(sync);
    const alert = await screen.findByRole("alertdialog", { name: "Your changes and origin's overlap" });
    expect(alert).toHaveTextContent("src/auth.ts");
    expect(alert).toHaveTextContent("your saved version");
    expect(alert).toHaveTextContent("your unsaved changes");
    expect(alert).toHaveTextContent("And 1 more.");
    expect(screen.queryByRole("button", { name: /Get/ })).not.toBeInTheDocument();
    expect(sync.get).not.toHaveBeenCalled();
  });

  it("explains what is in the way and offers the way through", async () => {
    const onRevealFile = vi.fn();
    renderDialog(controller({
      ...basePlan,
      forecast: { ...clearForecast, outcome: "blocked", blocker: { kind: "untrackedCollision", path: "assets/logo.svg" } },
    }), { onRevealFile });
    expect(await screen.findByRole("alertdialog", { name: "A file of yours would be overwritten" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show in folder" }));
    expect(onRevealFile).toHaveBeenCalledWith("assets/logo.svg");
  });

  it("hands a prepared overlap over to Save version", async () => {
    const onSaveVersion = vi.fn();
    renderDialog(controller({
      ...basePlan,
      forecast: { ...clearForecast, outcome: "blocked", blocker: { kind: "preparedOverlap", path: "lines.txt" } },
    }), { onSaveVersion });
    await userEvent.click(await screen.findByRole("button", { name: "Save version" }));
    expect(onSaveVersion).toHaveBeenCalled();
  });

  it("checks the remote in the background and re-plans in place when it moved", async () => {
    const newer = { ...basePlan, remoteCommit: "9999999999999999999999999999999999999999", incomingCount: 3 };
    const planGet = vi.fn().mockResolvedValueOnce(basePlan).mockResolvedValue(newer);
    let finishCheck: (status: TeamSyncStatus) => void = () => undefined;
    const refreshRemote = vi.fn(() => new Promise<TeamSyncStatus | null>((resolve) => { finishCheck = resolve; }));
    renderDialog(controller(basePlan, { planGet } as Partial<SyncController>), { refreshRemote });
    expect(await screen.findByRole("heading", { name: "Get 2 versions from origin" })).toBeInTheDocument();
    expect(screen.getByText("Checking origin for anything newer…")).toBeInTheDocument();
    finishCheck(syncStatus(newer.remoteCommit));
    expect(await screen.findByRole("heading", { name: "Get 3 versions from origin" })).toBeInTheDocument();
    expect(screen.getByText("Something changed while this was open. This is the updated summary.")).toBeInTheDocument();
  });

  it("shows the new summary instead of an error when the plan went stale", async () => {
    const newer = { ...basePlan, incomingCount: 3 };
    const planGet = vi.fn().mockResolvedValueOnce(basePlan).mockResolvedValue(newer);
    const get = vi.fn().mockRejectedValue({ code: "stale_get_team_changes_plan", message: "stale", remediation: null });
    renderDialog(controller(basePlan, { planGet, get } as Partial<SyncController>));
    await userEvent.click(await screen.findByRole("button", { name: "Get" }));
    expect(await screen.findByRole("heading", { name: "Get 3 versions from origin" })).toBeInTheDocument();
    expect(screen.getByText("Something changed while this was open. This is the updated summary.")).toBeInTheDocument();
  });

  it("reports an uncertain result with its recovery evidence", async () => {
    renderDialog(controller(basePlan, { get: vi.fn(async () => result("uncertain")) } as Partial<SyncController>));
    await userEvent.click(await screen.findByRole("button", { name: "Get" }));
    expect(await screen.findByRole("alertdialog", { name: "Result not confirmed" })).toBeInTheDocument();
    expect(screen.getByText(/refs\/gitodile\/recovery\/v1\/get-team-changes\/worktree-a\/1/)).toBeInTheDocument();
  });

  it("offers nothing to get from a line whose remote branch is gone", async () => {
    const sync = controller();
    renderDialog(sync, { upstreamGone: true });
    expect(await screen.findByRole("alertdialog", { name: "The update stopped safely" })).toBeInTheDocument();
    expect(screen.getByText("The branch this line tracks no longer exists on the remote.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(sync.planGet).not.toHaveBeenCalled();
  });

  it("stops when the background check finds the remote branch gone", async () => {
    let finishCheck: (status: TeamSyncStatus) => void = () => undefined;
    const refreshRemote = vi.fn(() => new Promise<TeamSyncStatus | null>((resolve) => { finishCheck = resolve; }));
    renderDialog(controller(), { refreshRemote });
    expect(await screen.findByRole("heading", { name: "Get 2 versions from origin" })).toBeInTheDocument();
    finishCheck({ ...syncStatus(basePlan.remoteCommit), state: "upstreamGone", behind: 0, nextActions: ["checkAgain"] });
    expect(await screen.findByText("The branch this line tracks no longer exists on the remote.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get" })).not.toBeInTheDocument();
  });

  it("closes a deterministic refusal without offering a retry", async () => {
    renderDialog(controller(basePlan, {
      planGet: vi.fn().mockRejectedValue({ code: "nothing_to_get", message: "x", remediation: null }),
    } as Partial<SyncController>));
    expect(await screen.findByRole("alertdialog", { name: "The update stopped safely" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
