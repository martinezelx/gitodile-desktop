import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import { ToastProvider } from "../../shared/ui";
import { CleanUpBranchesDialog } from "./CleanUpBranchesDialog";
import type {
  CleanUpBranch,
  CleanUpBranchesPlan,
  CleanUpBranchesResult,
  Branch,
  BranchesSnapshot,
} from "./domain";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function branch(name: string, overrides: Partial<Branch> = {}): Branch {
  return {
    name,
    tip: { commit: `${name}-tip`, shortCommit: "abc1234", subject: name, committedAt: "2026-07-01T00:00:00Z" },
    isActive: false,
    upstream: null,
    isRetainedElsewhere: true,
    isFinished: true,
    uniqueCommitCount: 0,
    worktreePath: null,
    upstreamAhead: null,
    upstreamBehind: null,
    upstreamGone: false,
    isDefault: false,
    ...overrides,
  };
}

function planBranch(name: string, overrides: Partial<CleanUpBranch> = {}): CleanUpBranch {
  return {
    name,
    tipCommit: `${name}-tip`,
    retainedBy: ["refs/heads/main"],
    published: null,
    stateToken: `${name}-token`,
    ...overrides,
  };
}

function plan(branches: CleanUpBranch[], overrides: Partial<CleanUpBranchesPlan> = {}): CleanUpBranchesPlan {
  return {
    operationKind: "destructive",
    summary: "Delete",
    steps: [],
    risks: [],
    recovery: "kept",
    requiresConfirmation: true,
    branches,
    excluded: [],
    recoveryPoint: {
      reference: "refs/gitodile/recovery/v1/clean-up-branches/worktree-main/1",
      explanation: "",
      retention: "",
      retentionLimit: 50,
    },
    ...overrides,
  };
}

function emptySnapshot(): BranchesSnapshot {
  return {
    branch: "main",
    headState: "branch",
    currentCommit: "abc",
    branches: [],
    totalCount: 0,
    isTruncated: false,
    unreadableCount: 0,
  };
}

function deletedResult(names: string[]): CleanUpBranchesResult {
  return {
    snapshot: emptySnapshot(),
    branches: names.map((name) => ({
      name,
      outcome: "deleted",
      reason: null,
      remoteDeleted: null,
      remoteError: null,
      recoveryReference: `refs/gitodile/recovery/v1/clean-up-branches/worktree-main/${name}`,
    })),
  };
}

const published = (name: string) => ({ remote: "origin", branch: name, shortName: `origin/${name}` });

/** Answers the plan, then the clean-up, by command name. */
function answer(planned: CleanUpBranchesPlan | Error, result?: CleanUpBranchesResult | Error) {
  mockedInvoke.mockImplementation(async (command: string) => {
    if (command === "plan_clean_up_branches") {
      if (planned instanceof Error || !("branches" in planned)) throw planned;
      return planned;
    }
    if (command === "clean_up_branches") {
      if (!result || result instanceof Error || !("snapshot" in result)) throw result;
      return result;
    }
    throw new Error(`unexpected ${command}`);
  });
}

function renderDialog(branches: Branch[], props: Partial<React.ComponentProps<typeof CleanUpBranchesDialog>> = {}) {
  const onClose = vi.fn();
  const onCleanedUp = vi.fn();
  render(
    <LanguageProvider>
      <ToastProvider>
        <CleanUpBranchesDialog
          isOpen
          projectPath="/repo"
          sessionEpoch="epoch-1"
          branches={branches}
          onClose={onClose}
          onCleanedUp={onCleanedUp}
          {...props}
        />
      </ToastProvider>
    </LanguageProvider>,
  );
  return { onClose, onCleanedUp };
}

const cleanUpCalls = () => mockedInvoke.mock.calls.filter(([command]) => command === "clean_up_branches");

describe("CleanUpBranchesDialog", () => {
  it("plans every branch, deletes the chosen ones with their own tokens, and closes with a toast", async () => {
    const user = userEvent.setup();
    answer(plan([planBranch("fix/one"), planBranch("fix/two"), planBranch("feature/three")]), deletedResult(["fix/one", "feature/three"]));
    const { onClose, onCleanedUp } = renderDialog([branch("fix/one"), branch("fix/two"), branch("feature/three")]);
    // Held back, and without a count, until the plan says which branches can go.
    expect(screen.getByRole("button", { name: "Delete branches" })).toBeDisabled();

    expect(mockedInvoke).toHaveBeenCalledWith("plan_clean_up_branches", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      names: ["fix/one", "fix/two", "feature/three"],
    });
    expect(screen.getByRole("dialog", { name: "Delete these branches?" })).toBeInTheDocument();
    const two = await screen.findByRole("checkbox", { name: /fix\/two/ });
    expect(screen.getByRole("checkbox", { name: /fix\/one/ })).toBeChecked();
    expect(screen.getAllByText("Kept on “main”", { selector: "small" })).toHaveLength(3);
    // Nothing in this plan is published, so there is no remote option at all.
    expect(screen.queryByRole("checkbox", { name: /Also delete/ })).not.toBeInTheDocument();
    await user.click(two);
    expect(screen.getByRole("checkbox", { name: "All branches (2 of 3)" })).toHaveProperty("indeterminate", true);

    await user.click(screen.getByRole("button", { name: "Delete 2 branches" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(cleanUpCalls()).toEqual([
      [
        "clean_up_branches",
        {
          path: "/repo",
          sessionEpoch: "epoch-1",
          branches: [
            { name: "fix/one", stateToken: "fix/one-token" },
            { name: "feature/three", stateToken: "feature/three-token" },
          ],
          deleteRemote: false,
        },
      ],
    ]);
    expect(onCleanedUp).toHaveBeenCalledWith(emptySnapshot());
    expect(await screen.findByText(/2 branches deleted\. Each one is kept in a recovery point\./)).toBeInTheDocument();
  });

  it("keeps the published-copies option in place, held back while no chosen branch has one", async () => {
    const user = userEvent.setup();
    answer(
      plan([planBranch("local"), planBranch("shared", { published: published("shared"), retainedBy: ["refs/remotes/origin/shared"] })]),
      deletedResult(["local", "shared"]),
    );
    renderDialog([branch("local"), branch("shared", { upstream: "origin/shared", upstreamAhead: 0, upstreamBehind: 0 })]);

    const remote = await screen.findByRole("checkbox", { name: /Also delete the published copy/ });
    expect(remote).not.toBeChecked();
    expect(screen.getByText("They stay, and your team still sees them.")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /^shared/ }));
    const heldBack = screen.getByRole("checkbox", { name: /Also delete the published copies/ });
    expect(heldBack).toBeDisabled();
    expect(heldBack).not.toBeChecked();
    expect(screen.getByText("None of the chosen branches is published.")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /^shared/ }));
    await user.click(screen.getByRole("checkbox", { name: /Also delete the published copy/ }));
    expect(screen.getByText("Your team won't see them anymore.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete 2 branches" }));

    await waitFor(() => expect(cleanUpCalls()).toHaveLength(1));
    expect(cleanUpCalls()[0][1]).toMatchObject({ deleteRemote: true });
  });

  it("explains a plan that cannot start and plans again on retry", async () => {
    const user = userEvent.setup();
    mockedInvoke.mockRejectedValueOnce({
      code: "git_operation_in_progress",
      message: "A Git merge is already in progress in this project.",
      remediation: null,
      detail: null,
    });
    renderDialog([branch("fix/one")]);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    answer(plan([planBranch("fix/one")]));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("checkbox", { name: /fix\/one/ })).toBeChecked();
  });

  it("keeps a partial result on screen: what was kept and what is still published", async () => {
    const user = userEvent.setup();
    answer(plan([planBranch("goes"), planBranch("stays"), planBranch("shared", { published: published("shared") })]), {
      snapshot: emptySnapshot(),
      branches: [
        { name: "goes", outcome: "deleted", reason: null, remoteDeleted: null, remoteError: null, recoveryReference: "r1" },
        {
          name: "stays",
          outcome: "skipped",
          reason: { code: "branch_is_active", message: "The active branch can't be deleted.", remediation: null, detail: null },
          remoteDeleted: null,
          remoteError: null,
          recoveryReference: null,
        },
        {
          name: "shared",
          outcome: "deleted",
          reason: null,
          remoteDeleted: false,
          remoteError: { code: "remote_rejected", message: "The remote refused to delete this branch.", remediation: null, detail: null },
          recoveryReference: "r3",
        },
      ],
    });
    const { onClose, onCleanedUp } = renderDialog([branch("goes"), branch("stays"), branch("shared")]);

    await user.click(await screen.findByRole("checkbox", { name: /Also delete the published copy/ }));
    await user.click(screen.getByRole("button", { name: "Delete 3 branches" }));

    expect(await screen.findByRole("heading", { name: "Clean-up finished" })).toBeInTheDocument();
    expect(screen.getByText("2 branches deleted, 1 kept, 1 published copy is still there.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Not deleted" })).getByText("stays")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Deleted here, still published" })).getByText("shared")).toBeInTheDocument();
    expect(onCleanedUp).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // The summary's own Close, after the header's.
    const closes = screen.getAllByRole("button", { name: "Close" });
    await user.click(closes[closes.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it("works from the keyboard: Space chooses, the select-all clears and fills", async () => {
    const user = userEvent.setup();
    answer(plan([planBranch("a"), planBranch("b")]));
    renderDialog([branch("a"), branch("b")]);

    const all = await screen.findByRole("checkbox", { name: "All branches (2 of 2)" });
    all.focus();
    await user.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: /^a/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Delete 0 branches" })).toBeDisabled();

    await user.tab();
    expect(screen.getByRole("checkbox", { name: /^a/ })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: /^a/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Delete 1 branch" })).toBeEnabled();
  });

  it("says so when nothing can be deleted, and names what was left out and why", async () => {
    const user = userEvent.setup();
    answer(
      plan([], {
        excluded: [
          {
            name: "busy",
            reason: { code: "branch_checked_out_elsewhere", message: "\"busy\" is open in another workspace.", remediation: null, detail: null },
          },
        ],
      }),
    );
    renderDialog([branch("busy")]);

    expect(await screen.findByText("None of these branches can be deleted right now.")).toBeInTheDocument();
    // A block the reader cannot lift here: warning, not the delete's danger.
    expect(screen.getByRole("alertdialog", { name: "Can't delete them yet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    await user.click(screen.getByText("1 branch left out"));
    expect(screen.getByText("busy")).toBeVisible();
  });

  it("asks for at most fifty branches and says the rest wait", async () => {
    const branches = Array.from({ length: 52 }, (_, index) => branch(`fix/${index}`));
    answer(plan(branches.slice(0, 50).map((branch) => planBranch(branch.name))));
    renderDialog(branches);

    await screen.findByRole("checkbox", { name: "All branches (50 of 50)" });
    expect(mockedInvoke.mock.calls[0][1]).toMatchObject({ names: branches.slice(0, 50).map((branch) => branch.name) });
    expect(screen.getByText("The first 50 of 52 branches. Clean up the rest afterwards.")).toBeInTheDocument();
  });

  it("reports a clean-up that happened even when the list could not be read back", async () => {
    const user = userEvent.setup();
    answer(plan([planBranch("a")]), { ...deletedResult(["a"]), snapshot: null });
    const { onClose, onCleanedUp } = renderDialog([branch("a")]);

    await user.click(await screen.findByRole("button", { name: "Delete 1 branch" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // The host refreshes on its own; the deletion is not reported as a failure.
    expect(onCleanedUp).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the preview when the clean-up itself is refused", async () => {
    const user = userEvent.setup();
    answer(plan([planBranch("a")]), Object.assign(new Error("refused"), { code: "git_operation_in_progress" }));
    const { onCleanedUp } = renderDialog([branch("a")]);

    await user.click(await screen.findByRole("button", { name: "Delete 1 branch" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onCleanedUp).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete 1 branch" })).toBeEnabled();
  });
});
