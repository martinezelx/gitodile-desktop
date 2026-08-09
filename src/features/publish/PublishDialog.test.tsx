import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
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

function renderDialog(props: Partial<React.ComponentProps<typeof PublishDialog>> = {}) {
  const onClose = vi.fn();
  const onPublished = vi.fn(async () => undefined);
  const utils = render(
    <LanguageProvider>
      <PublishDialog isOpen projectPath="/repo" sessionEpoch="epoch-1" onClose={onClose} onPublished={onPublished} {...props} />
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
        <PublishDialog isOpen={false} projectPath="/repo" sessionEpoch="epoch-1" onClose={vi.fn()} onPublished={vi.fn()} />
      </LanguageProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("shows the plan summary once it loads", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();

    expect(await screen.findByRole("heading", { name: "Destination" })).toBeInTheDocument();
    expect(screen.getByText("origin")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("1 saved version will be published.")).toBeInTheDocument();
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

  it("shows the names, without hashes, of saved versions that will remain unpublished", async () => {
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

    expect(await screen.findByText("polish the empty state")).toHaveClass("publish-stays__pill");
    expect(screen.getByText("add keyboard navigation")).toHaveClass("publish-stays__pill");
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

  it("shows the upstream-tracking note only when the plan will create it", async () => {
    mockedInvoke.mockResolvedValueOnce(plan({ willCreateUpstream: true }));
    renderDialog();

    expect(await screen.findByText("This version line will start tracking the remote branch.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Publish for the first time" })).toBeInTheDocument();
  });

  it("notes that unsaved files stay local when the plan reports them", async () => {
    mockedInvoke.mockResolvedValueOnce(plan({ hasUnsavedFiles: true }));
    renderDialog();

    expect(
      await screen.findByText("Unsaved files on this computer will stay local — only saved versions are published."),
    ).toBeInTheDocument();
    expect(screen.getByText("Unsaved file changes")).toHaveClass("publish-stays__pill--unsaved");
  });

  it("shows a localized blocker and offers to try again", async () => {
    mockedInvoke.mockRejectedValueOnce({ code: "nothing_to_publish", message: "x", remediation: null });
    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("Every saved version is already published.");

    mockedInvoke.mockResolvedValueOnce(plan());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Destination" })).toBeInTheDocument();
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

    expect(await screen.findByText("upstream")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenLastCalledWith("plan_publish", { path: "/repo", sessionEpoch: "epoch-1", remote: "upstream", upTo: undefined });
  });

  it("publishes successfully and refreshes the caller", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onPublished } = renderDialog();
    await screen.findByRole("heading", { name: "Destination" });

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
    await userEvent.click(screen.getByRole("button", { name: "Publish now" }));

    expect(await screen.findByText('1 saved version was published to "origin".')).toBeInTheDocument();
    expect(onPublished).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenLastCalledWith("publish", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      remote: "origin",
      stateToken: "publish-token-1",
      upTo: undefined,
    });
  });

  it("shows the upstream-created note only when the result says so", async () => {
    mockedInvoke.mockResolvedValueOnce(plan({ willCreateUpstream: true }));
    renderDialog();
    await screen.findByRole("heading", { name: "Destination" });

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
    await userEvent.click(screen.getByRole("button", { name: "Publish now" }));

    expect(await screen.findByText("This version line now tracks the remote branch.")).toBeInTheDocument();
  });

  it("reports a publish failure and keeps the plan visible to retry", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByRole("heading", { name: "Destination" });

    mockedInvoke.mockRejectedValueOnce({
      code: "remote_rejected",
      message: "x",
      remediation: null,
      detail: "pre-receive hook declined",
    });
    await userEvent.click(screen.getByRole("button", { name: "Publish now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The remote project rejected this publish.");
    expect(screen.getByRole("button", { name: "Publish now" })).toBeInTheDocument();

    expect(screen.queryByText("pre-receive hook declined")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show technical details" }));
    expect(screen.getByText("pre-receive hook declined")).toBeInTheDocument();
  });

  it("replans instead of retrying a stale state token", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByRole("heading", { name: "Destination" });

    mockedInvoke.mockRejectedValueOnce({
      code: "stale_publish_plan",
      message: "x",
      remediation: null,
    });
    await userEvent.click(screen.getByRole("button", { name: "Publish now" }));

    const reviewButton = await screen.findByRole("button", { name: "Review updated plan" });
    mockedInvoke.mockResolvedValueOnce(plan({ stateToken: "publish-token-2" }));
    await userEvent.click(reviewButton);

    await screen.findByRole("heading", { name: "Destination" });
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
    await screen.findByRole("heading", { name: "Destination" });

    let resolvePublish: ((result: PublishResult) => void) | undefined;
    mockedInvoke.mockImplementationOnce(
      () =>
        new Promise<PublishResult>((resolve) => {
          resolvePublish = resolve;
        }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Publish now" }));

    expect(await screen.findByText("Keep this window open while GitOdrile confirms the remote result.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(container.querySelector(".save-version-backdrop") as HTMLElement);
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
    expect(await screen.findByText('1 saved version was published to "origin".')).toBeInTheDocument();
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
    await screen.findByRole("heading", { name: "Destination" });

    await userEvent.click(screen.getByRole("button", { name: "Publish now" }));

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
          <PublishDialog isOpen={isOpen} projectPath="/repo" sessionEpoch="epoch-1" onClose={() => setIsOpen(false)} onPublished={vi.fn()} />
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
    await screen.findByRole("heading", { name: "Destination" });

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "open" })).toHaveFocus();
  });

  it("cancel button closes the dialog without publishing", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onClose } = renderDialog();
    await screen.findByRole("heading", { name: "Destination" });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });
});
