import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import type { SyncController } from "./controller";
import type { GetTeamChangesPlan, GetTeamChangesResult } from "./domain";
import { GetTeamChangesDialog } from "./GetTeamChangesDialog";

afterEach(cleanup);

const plan: GetTeamChangesPlan = {
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
  incomingCount: 2,
  incomingVersions: [
    { commit: "2", shortCommit: "2222222", title: "Team work", description: null, committedAt: "2026-08-16T10:00:00Z", author: "Ada" },
  ],
  versionsTruncated: true,
  fileImpact: {
    totalCount: 2,
    counts: { added: 1, modified: 0, deleted: 0, renamed: 1, binary: 1 },
    files: [
      { path: "new.bin", originalPath: null, category: "added", binary: true },
      { path: "renamed.txt", originalPath: "old.txt", category: "renamed", binary: false },
    ],
    isTruncated: false,
  },
  consequences: [], risks: [], steps: [], verification: "verified",
  recovery: {
    reference: "refs/gitodile/recovery/v1/get-team-changes/worktree-a/1",
    explanation: "protected",
    retention: "newest 20",
    retentionLimit: 20,
  },
  guarantees: {
    fastForwardOnly: true,
    noMerge: true,
    noRebase: true,
    noStash: true,
    noForce: true,
    noAutomaticConflictResolution: true,
  },
};

const result = (outcome: "completed" | "uncertain"): GetTeamChangesResult => ({
  outcome,
  projectId: "/repo",
  sessionEpoch: "epoch-1",
  branch: "main",
  target: plan.target,
  trackingRef: plan.trackingRef,
  previousCommit: plan.localCommit,
  resultingCommit: outcome === "completed" ? plan.remoteCommit : null,
  observedHead: plan.remoteCommit,
  receivedCount: 2,
  recovery: {
    schemaVersion: 1,
    recoveryId: "1",
    reference: plan.recovery.reference,
    createdAtMs: 1,
    operation: "get-team-changes",
    ownerId: "worktree-a",
    branch: "main",
    previousCommit: plan.localCommit,
    targetCommit: plan.remoteCommit,
    remote: "origin",
    destinationBranch: "main",
    trackingRef: plan.trackingRef,
    stateToken: plan.stateToken,
    retentionLimit: 20,
  },
  syncStatus: outcome === "completed" ? {
    state: "upToDate", localBranch: "main", localCommit: plan.remoteCommit,
    upstreamRemote: "origin", destinationBranch: "main", trackingRef: plan.trackingRef,
    remoteCommit: plan.remoteCommit, ahead: 0, behind: 0, knowledge: "fresh", checkedAt: 1,
    warnings: [], nextActions: ["checkAgain"], stateToken: "new-token",
  } : null,
  warnings: outcome === "uncertain" ? [{ code: "localUpdateUncertain", message: "Observed state needs review" }] : [],
  inspectionInstructions: outcome === "uncertain" ? "Inspect safely" : null,
});

function controller(overrides: Partial<SyncController> = {}): SyncController {
  return {
    planGet: vi.fn(async (_query, onProgress) => {
      onProgress("checkingTeam");
      onProgress("checkingLocalSafety");
      return plan;
    }),
    get: vi.fn(async () => result("completed")),
    ...overrides,
  } as unknown as SyncController;
}

function renderDialog(syncController: SyncController, onApplied = vi.fn(async () => undefined)) {
  const onClose = vi.fn();
  const onPhaseChange = vi.fn();
  render(
    <LanguageProvider>
      <GetTeamChangesDialog
        isOpen
        controller={syncController}
        projectPath="/repo"
        sessionEpoch="epoch-1"
        onClose={onClose}
        onApplied={onApplied}
        onPhaseChange={onPhaseChange}
      />
    </LanguageProvider>,
  );
  return { onApplied, onClose, onPhaseChange };
}

describe("Get project changes dialog", () => {
  it("leads with incoming versions, affected files, destination, guarantees, and technical evidence", async () => {
    renderDialog(controller());
    expect(await screen.findByRole("heading", { name: "2 incoming saved versions" })).toBeInTheDocument();
    expect(screen.getByText("Team work")).toBeInTheDocument();
    expect(screen.getByText("new.bin")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fast-forward only" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recovery comes first" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText(plan.recovery.reference)).toBeInTheDocument();
    expect(screen.getByText("opaque-token")).toBeInTheDocument();
  });

  it("reports real phases and commits the authoritative result before success", async () => {
    const onApplied = vi.fn(async () => undefined);
    const syncController = controller({
      get: vi.fn(async (request) => {
        request.onProgress("checkingTeam");
        request.onProgress("checkingLocalSafety");
        request.onProgress("creatingRecovery");
        request.onProgress("updatingFilesAndHistory");
        request.onProgress("verifying");
        return result("completed");
      }),
    });
    const { onPhaseChange } = renderDialog(syncController, onApplied);
    await userEvent.click(await screen.findByRole("button", { name: "Get these versions" }));
    await screen.findByRole("heading", { name: "Project changes are now included" });
    expect(onApplied).toHaveBeenCalledOnce();
    expect(onPhaseChange).toHaveBeenCalledWith("verifying");
    expect(onPhaseChange).toHaveBeenLastCalledWith("success");
  });

  it("keeps an uncertain result and recovery visible without retrying or refreshing", async () => {
    const onApplied = vi.fn(async () => undefined);
    renderDialog(controller({ get: vi.fn(async () => result("uncertain")) }), onApplied);
    await userEvent.click(await screen.findByRole("button", { name: "Get these versions" }));
    expect(await screen.findByRole("heading", { name: "The local result needs inspection" })).toBeInTheDocument();
    expect(screen.getByText(/Inspect the current files and saved version/)).toBeInTheDocument();
    expect(screen.getByText(plan.recovery.reference)).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Try|Review updated/ })).not.toBeInTheDocument();
  });

  it("explains divergence without offering a deterministic retry", async () => {
    renderDialog(controller({
      planGet: vi.fn(async (): Promise<GetTeamChangesPlan> => {
        throw { code: "diverged_histories", message: "diverged", remediation: null };
      }),
    }));
    expect(await screen.findByRole("heading", { name: "Both sides changed" })).toBeInTheDocument();
    expect(screen.getByText(/retrying unchanged would fail again/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("explains an incoming tracked-file collision without referring to version-line switching", async () => {
    renderDialog(controller({
      planGet: vi.fn(async (): Promise<GetTeamChangesPlan> => {
        throw {
          code: "incoming_tracked_change_collision",
          message: "overlap",
          remediation: null,
        };
      }),
    }));
    expect(await screen.findByText(/overlap files in the team update/)).toBeInTheDocument();
    expect(screen.queryByText(/switch version lines/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("cancels a pending preview visually and rejects its late response", async () => {
    let resolve!: (value: GetTeamChangesPlan) => void;
    const syncController = controller({
      planGet: vi.fn(() => new Promise<GetTeamChangesPlan>((done) => { resolve = done; })),
    });
    const onClose = vi.fn();
    function Harness(): React.JSX.Element {
      const [open, setOpen] = React.useState(true);
      return (
        <LanguageProvider>
          <GetTeamChangesDialog
            isOpen={open}
            controller={syncController}
            projectPath="/repo"
            sessionEpoch="epoch-1"
            onClose={() => { onClose(); setOpen(false); }}
            onApplied={async () => undefined}
            onPhaseChange={() => undefined}
          />
        </LanguageProvider>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    resolve(plan);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("Team work")).not.toBeInTheDocument();
  });
});
