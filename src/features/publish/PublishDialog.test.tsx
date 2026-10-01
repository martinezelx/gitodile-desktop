import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import { ToastProvider } from "../../shared/ui";
import { PublishDialog } from "./PublishDialog";
import type { PublishPlan, PublishResult, RemoteDiscovery } from "./domain";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

function plan(overrides: Partial<PublishPlan> = {}): PublishPlan {
  return {
    operationKind: "remote-mutation",
    summary: "Publish to origin",
    steps: [],
    risks: [],
    recovery: "",
    requiresConfirmation: true,
    stateToken: "publish-token-1",
    target: { remote: "origin", destinationBranch: "main" },
    localBranch: "main",
    willCreateUpstream: false,
    commitCount: 1,
    commitSummary: [{
      commit: "abc123abc123abc123abc123abc123abc123ab",
      shortCommit: "abc123a",
      title: "fix the thing",
      committedAt: "2026-08-03T10:00:00Z",
      author: "Luis Test",
      description: null,
    }],
    hasUnsavedFiles: false,
    remainingAfterPublish: 0,
    remainingCommitSummary: [],
    ...overrides,
  };
}

const PLAN_LINE = "1 version will be published to “main” on “origin”.";

function renderDialog(props: Partial<React.ComponentProps<typeof PublishDialog>> = {}) {
  const onClose = vi.fn();
  const onPublished = vi.fn(async () => undefined);
  const utils = render(
    <LanguageProvider>
      <ToastProvider>
        <PublishDialog isOpen projectPath="/repo" sessionEpoch="epoch-1" runHooks={false} onClose={onClose} onPublished={onPublished} {...props} />
      </ToastProvider>
    </LanguageProvider>,
  );
  return { onClose, onPublished, ...utils };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PublishDialog", () => {
  it("renders nothing when closed, and never calls the planner", () => {
    const { container } = render(
      <LanguageProvider>
        <PublishDialog isOpen={false} projectPath="/repo" sessionEpoch="epoch-1" runHooks={false} onClose={vi.fn()} onPublished={vi.fn()} />
      </LanguageProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("opens in its final shape while the plan is read, with Publish held back", async () => {
    let resolvePlan: ((value: ReturnType<typeof plan>) => void) | undefined;
    mockedInvoke.mockImplementationOnce(() => new Promise((resolve) => { resolvePlan = resolve; }));
    const { onClose } = renderDialog();

    expect(screen.getByText("Checking what's ready to publish…").closest("[role='status']")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Checking the remote…" })).toBeDisabled();
    expect(screen.getByText("Anyone with access to the remote project will see them.")).toBeInTheDocument();

    resolvePlan?.(plan());
    expect(await screen.findByText(PLAN_LINE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish changes" })).toBeEnabled();
    expect(screen.queryByText("Checking what's ready to publish…")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the cached preview while the remote is checked, then lets the fresh plan decide", async () => {
    let resolvePlan: ((value: ReturnType<typeof plan>) => void) | undefined;
    mockedInvoke.mockImplementationOnce(() => new Promise((resolve) => { resolvePlan = resolve; }));
    const preview = plan({ commitCount: 2, commitSummary: [
      ...plan().commitSummary,
      { ...plan().commitSummary[0]!, commit: "def456", shortCommit: "def456", title: "an older one" },
    ] });
    renderDialog({ preview });

    expect(screen.getByText("2 versions will be published to “main” on “origin”.")).toBeInTheDocument();
    expect(screen.getByText("an older one")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checking the remote…" })).toBeDisabled();

    // The remote already had the older one: the fresh plan corrects the count.
    resolvePlan?.(plan());
    expect(await screen.findByText(PLAN_LINE)).toBeInTheDocument();
    expect(screen.queryByText("an older one")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish changes" })).toBeEnabled();
  });

  it("drops the tracked remote's preview once the reader picks another remote", async () => {
    mockedInvoke.mockRejectedValueOnce({ code: "remote_selection_required", message: "x", remediation: null });
    mockedInvoke.mockResolvedValueOnce({
      remotes: [
        { name: "origin", url: "https://example.com/a.git" },
        { name: "upstream", url: "https://example.com/b.git" },
      ],
      branch: "main",
      upstream: null,
    } satisfies RemoteDiscovery);
    renderDialog({ preview: plan() });

    const choice = await screen.findByText("upstream");
    mockedInvoke.mockImplementationOnce(() => new Promise(() => undefined));
    await userEvent.click(choice);

    expect(screen.queryByText(PLAN_LINE)).not.toBeInTheDocument();
    expect(screen.getByText("Checking what's ready to publish…")).toBeInTheDocument();
  });

  it("replaces the preview with the block when the remote has moved on", async () => {
    mockedInvoke.mockRejectedValueOnce({ code: "behind_remote", message: "x", remediation: null });
    renderDialog({ preview: plan() });

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(PLAN_LINE)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish changes" })).not.toBeInTheDocument();
  });

  it("shows the plan summary once it loads", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();

    expect(await screen.findByText(PLAN_LINE)).toBeInTheDocument();
    expect(screen.getByText("Anyone with access to the remote project will see them.")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("plan_publish", { path: "/repo", sessionEpoch: "epoch-1", remote: undefined, upTo: undefined });
  });

  it("lists each version being published with its title and short hash", async () => {
    mockedInvoke.mockResolvedValueOnce(
      plan({
        commitCount: 2,
        commitSummary: [
          {
            commit: "aaa111",
            shortCommit: "aaa111",
            title: "fix the thing",
            description: null,
            committedAt: "2026-08-03T10:00:00Z",
            author: "Luis Test",
          },
          {
            commit: "bbb222",
            shortCommit: "bbb222",
            title: "add the other thing",
            description: null,
            committedAt: "2026-08-02T10:00:00Z",
            author: "Luis Test",
          },
        ],
      }),
    );
    renderDialog();

    expect(await screen.findByText("fix the thing")).toBeInTheDocument();
    expect(screen.getByText("add the other thing")).toBeInTheDocument();
    expect(screen.getByText("aaa111")).toBeInTheDocument();
    expect(screen.getByText("bbb222")).toBeInTheDocument();
  });

  it("says how many saved versions will remain unpublished", async () => {
    mockedInvoke.mockResolvedValueOnce(
      plan({
        remainingAfterPublish: 2,
        remainingCommitSummary: [
          {
            commit: "newer111",
            shortCommit: "newer1",
            title: "polish the empty state",
            description: null,
            committedAt: "2026-08-03T10:00:00Z",
            author: "Luis Test",
          },
          {
            commit: "newer222",
            shortCommit: "newer2",
            title: "add keyboard navigation",
            description: null,
            committedAt: "2026-08-02T10:00:00Z",
            author: "Luis Test",
          },
        ],
      }),
    );
    renderDialog({ upTo: "abc123" });

    expect(await screen.findByText("2 more versions stay unpublished for now.")).toBeInTheDocument();
    expect(screen.queryByText("newer1")).not.toBeInTheDocument();
    expect(screen.queryByText("newer2")).not.toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("plan_publish", { path: "/repo", sessionEpoch: "epoch-1", remote: undefined, upTo: "abc123" });
  });

  it("lazily loads and shows a commit's changed files only once it is expanded", async () => {
    mockedInvoke.mockResolvedValueOnce(
      plan({
        commitSummary: [{
          commit: "aaa111",
          shortCommit: "aaa111",
          title: "fix the thing",
          description: null,
          committedAt: "2026-08-03T10:00:00Z",
          author: "Luis Test",
        }],
      }),
    );
    renderDialog();
    await screen.findByText("fix the thing");
    expect(mockedInvoke).toHaveBeenCalledTimes(1);

    mockedInvoke.mockResolvedValueOnce([
      { path: "src/foo.ts", originalPath: null, category: "changed" },
      { path: "src/new.ts", originalPath: null, category: "new" },
    ]);
    await userEvent.click(screen.getByText("fix the thing"));

    expect(await screen.findByText("src/foo.ts")).toBeInTheDocument();
    expect(screen.getByText("src/new.ts")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenLastCalledWith("read_commit_file_changes", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      commit: "aaa111",
    });

    // Collapsing and re-expanding must not refetch — the result is cached.
    await userEvent.click(screen.getByText("fix the thing"));
    await userEvent.click(screen.getByText("fix the thing"));
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });

  it("shows a saved version's multiline details read-only when expanded", async () => {
    mockedInvoke.mockResolvedValueOnce(
      plan({
        commitSummary: [{
          commit: "aaa111",
          shortCommit: "aaa111",
          title: "fix the thing",
          description: "Why it changed.\n\nWhat collaborators should know.",
          committedAt: "2026-08-03T10:00:00Z",
          author: "Luis Test",
        }],
      }),
    );
    renderDialog();

    mockedInvoke.mockResolvedValueOnce([]);
    await userEvent.click(await screen.findByText("fix the thing"));

    expect(screen.getByText("Why it changed. What collaborators should know.")).toHaveClass(
      "publish-commit-list__message-body",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("names the line in the title when it is published for the first time", async () => {
    mockedInvoke.mockResolvedValueOnce(plan({ willCreateUpstream: true }));
    renderDialog();

    expect(await screen.findByRole("heading", { name: "Publish “main” for the first time" })).toBeInTheDocument();
  });

  it("notes that unsaved files stay local when the plan reports them", async () => {
    mockedInvoke.mockResolvedValueOnce(plan({ hasUnsavedFiles: true }));
    renderDialog();

    expect(await screen.findByText("Your unsaved changes stay on this computer.")).toBeInTheDocument();
  });

  it("offers only Close when everything is already published", async () => {
    mockedInvoke.mockRejectedValueOnce({ code: "nothing_to_publish", message: "x", remediation: null });
    const { onClose } = renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("Everything is already published.");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a localized blocker and offers to try again", async () => {
    mockedInvoke.mockRejectedValueOnce({ code: "offline", message: "x", remediation: null });
    renderDialog();

    expect(await screen.findByRole("alert")).toBeInTheDocument();

    mockedInvoke.mockResolvedValueOnce(plan());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(PLAN_LINE)).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });

  it("asks the user to choose a remote when planning is ambiguous, then plans again with that remote", async () => {
    mockedInvoke.mockRejectedValueOnce({ code: "remote_selection_required", message: "x", remediation: null });
    const discovery: RemoteDiscovery = {
      remotes: [
        { name: "origin", url: "https://example.com/a.git" },
        { name: "upstream", url: "https://example.com/b.git" },
      ],
      branch: "main",
      upstream: null,
    };
    mockedInvoke.mockResolvedValueOnce(discovery);
    renderDialog();

    expect(await screen.findByText("origin")).toBeInTheDocument();
    expect(screen.getByText("upstream")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("discover_remotes", { path: "/repo", sessionEpoch: "epoch-1" });

    mockedInvoke.mockResolvedValueOnce(plan({ target: { remote: "upstream", destinationBranch: "main" } }));
    await userEvent.click(screen.getByText("upstream"));

    expect(await screen.findByText(/on “upstream”/)).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenLastCalledWith("plan_publish", { path: "/repo", sessionEpoch: "epoch-1", remote: "upstream", upTo: undefined });
  });

  it("publishes successfully and refreshes the caller", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onPublished, onClose } = renderDialog();
    await screen.findByText(PLAN_LINE);

    const result: PublishResult = {
      target: { remote: "origin", destinationBranch: "main" },
      localBranch: "main",
      previousRemoteCommit: "def456",
      publishedCommit: "abc123",
      publishedCount: 1,
      createdUpstream: false,
      remainingAfterPublish: 0,
    };
    mockedInvoke.mockResolvedValueOnce(result);
    await userEvent.click(screen.getByRole("button", { name: "Publish changes" }));

    // No result screen to dismiss: the dialog closes and a toast says it.
    expect(await screen.findByText("1 version published to “origin”.")).toBeInTheDocument();
    expect(onPublished).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenLastCalledWith("publish", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      remote: "origin",
      stateToken: "publish-token-1",
      upTo: undefined,
      runHooks: false,
    });
  });

  it("closes with a toast after a first publish too", async () => {
    mockedInvoke.mockResolvedValueOnce(plan({ willCreateUpstream: true }));
    renderDialog();
    await screen.findByText(PLAN_LINE);

    const result: PublishResult = {
      target: { remote: "origin", destinationBranch: "main" },
      localBranch: "main",
      previousRemoteCommit: null,
      publishedCommit: "abc123",
      publishedCount: 1,
      createdUpstream: true,
      remainingAfterPublish: 0,
    };
    mockedInvoke.mockResolvedValueOnce(result);
    await userEvent.click(screen.getByRole("button", { name: "Publish changes" }));

    expect(await screen.findByText("1 version published to “origin”.")).toBeInTheDocument();
  });

  it("reports a publish failure and keeps the plan visible to retry", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByText(PLAN_LINE);

    mockedInvoke.mockRejectedValueOnce({
      code: "remote_rejected",
      message: "x",
      remediation: null,
      detail: "pre-receive hook declined",
    });
    await userEvent.click(screen.getByRole("button", { name: "Publish changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The remote rejected this publish.");
    expect(screen.getByRole("button", { name: "Publish changes" })).toBeInTheDocument();

    expect(screen.queryByText("pre-receive hook declined")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show technical details" }));
    expect(screen.getByText("pre-receive hook declined")).toBeInTheDocument();
  });

  it("replans instead of retrying a stale state token", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByText(PLAN_LINE);

    mockedInvoke.mockRejectedValueOnce({
      code: "stale_publish_plan",
      message: "x",
      remediation: null,
    });
    await userEvent.click(screen.getByRole("button", { name: "Publish changes" }));

    const reviewButton = await screen.findByRole("button", { name: "Review again" });
    mockedInvoke.mockResolvedValueOnce(plan({ stateToken: "publish-token-2" }));
    await userEvent.click(reviewButton);

    await screen.findByText(PLAN_LINE);
    expect(mockedInvoke).toHaveBeenLastCalledWith("plan_publish", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      remote: undefined,
      upTo: undefined,
    });
  });

  it("cannot be dismissed while publishing is in progress", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onClose, container } = renderDialog();
    await screen.findByText(PLAN_LINE);

    let resolvePublish: ((result: PublishResult) => void) | undefined;
    mockedInvoke.mockImplementationOnce(
      () =>
        new Promise<PublishResult>((resolve) => {
          resolvePublish = resolve;
        }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Publish changes" }));

    expect(await screen.findByText("Keep this window open until it finishes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(container.querySelector(".app-dialog-backdrop") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    resolvePublish?.({
      target: { remote: "origin", destinationBranch: "main" },
      localBranch: "main",
      previousRemoteCommit: null,
      publishedCommit: "abc123",
      publishedCount: 1,
      createdUpstream: false,
      remainingAfterPublish: 0,
    });
    expect(await screen.findByText("1 version published to “origin”.")).toBeInTheDocument();
  });

  it("keeps an uncertain result open and offers a remote recheck", async () => {
    const onPhaseChange = vi.fn();
    mockedInvoke
      .mockResolvedValueOnce(plan())
      .mockRejectedValueOnce({
        code: "publish_uncertain",
        message: "Connection lost.",
        remediation: null,
      })
      .mockRejectedValueOnce({
        code: "nothing_to_publish",
        message: "Already published.",
        remediation: null,
      });
    const { onClose } = renderDialog({ onPhaseChange });
    await screen.findByText(PLAN_LINE);

    await userEvent.click(screen.getByRole("button", { name: "Publish changes" }));

    expect(await screen.findByRole("button", { name: "Check remote again" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onPhaseChange).toHaveBeenCalledWith("uncertain");

    await userEvent.click(screen.getByRole("button", { name: "Check remote again" }));
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenLastCalledWith("plan_publish", {
        path: "/repo",
        sessionEpoch: "epoch-1",
        remote: undefined,
        upTo: undefined,
      }),
    );
    expect(onPhaseChange).toHaveBeenLastCalledWith("planning");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape and restores focus to the element that opened it", async () => {
    function Harness(): React.JSX.Element {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            open
          </button>
          <PublishDialog isOpen={isOpen} projectPath="/repo" sessionEpoch="epoch-1" runHooks={false} onClose={() => setIsOpen(false)} onPublished={vi.fn()} />
        </>
      );
    }

    mockedInvoke.mockResolvedValueOnce(plan());
    render(
      <LanguageProvider>
        <Harness />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    await screen.findByText(PLAN_LINE);

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "open" })).toHaveFocus();
  });

  it("cancel button closes the dialog without publishing", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onClose } = renderDialog();
    await screen.findByText(PLAN_LINE);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });
});
