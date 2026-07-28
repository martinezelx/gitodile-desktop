import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "./i18n";
import { PublishDialog } from "./publishDialog";
import type { PublishPlan, PublishResult, RemoteDiscovery } from "./publish";

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
    remote: "origin",
    localBranch: "main",
    destinationBranch: "main",
    willCreateUpstream: false,
    commitCount: 1,
    commitSummary: ["fix the thing"],
    hasUnsavedFiles: false,
    ...overrides,
  };
}

function renderDialog(props: Partial<React.ComponentProps<typeof PublishDialog>> = {}) {
  const onClose = vi.fn();
  const onPublished = vi.fn();
  const utils = render(
    <LanguageProvider>
      <PublishDialog isOpen projectPath="/repo" onClose={onClose} onPublished={onPublished} {...props} />
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
        <PublishDialog isOpen={false} projectPath="/repo" onClose={vi.fn()} onPublished={vi.fn()} />
      </LanguageProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("shows the plan summary once it loads", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();

    expect(await screen.findByText('Publish to "origin" (main).')).toBeInTheDocument();
    expect(screen.getByText("1 saved version will be published.")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("plan_publish", { path: "/repo", remote: undefined });
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
  });

  it("shows a localized blocker and offers to try again", async () => {
    mockedInvoke.mockRejectedValueOnce({ code: "nothing_to_publish", message: "x", remediation: null });
    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("Every saved version is already published.");

    mockedInvoke.mockResolvedValueOnce(plan());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText('Publish to "origin" (main).')).toBeInTheDocument();
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
    expect(mockedInvoke).toHaveBeenCalledWith("discover_remotes", { path: "/repo" });

    mockedInvoke.mockResolvedValueOnce(plan({ remote: "upstream" }));
    await userEvent.click(screen.getByText("upstream"));

    expect(await screen.findByText('Publish to "upstream" (main).')).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenLastCalledWith("plan_publish", { path: "/repo", remote: "upstream" });
  });

  it("publishes successfully and refreshes the caller", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onPublished } = renderDialog();
    await screen.findByText('Publish to "origin" (main).');

    const result: PublishResult = {
      remote: "origin",
      localBranch: "main",
      destinationBranch: "main",
      previousRemoteCommit: "def456",
      publishedCommit: "abc123",
      publishedCount: 1,
      createdUpstream: false,
    };
    mockedInvoke.mockResolvedValueOnce(result);
    await userEvent.click(screen.getByRole("button", { name: "Publish now" }));

    expect(await screen.findByText('1 saved version was published to "origin".')).toBeInTheDocument();
    expect(onPublished).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenLastCalledWith("publish", {
      path: "/repo",
      remote: "origin",
      stateToken: "publish-token-1",
    });
  });

  it("shows the upstream-created note only when the result says so", async () => {
    mockedInvoke.mockResolvedValueOnce(plan({ willCreateUpstream: true }));
    renderDialog();
    await screen.findByText('Publish to "origin" (main).');

    const result: PublishResult = {
      remote: "origin",
      localBranch: "main",
      destinationBranch: "main",
      previousRemoteCommit: null,
      publishedCommit: "abc123",
      publishedCount: 1,
      createdUpstream: true,
    };
    mockedInvoke.mockResolvedValueOnce(result);
    await userEvent.click(screen.getByRole("button", { name: "Publish now" }));

    expect(await screen.findByText("This version line now tracks the remote branch.")).toBeInTheDocument();
  });

  it("reports a publish failure and keeps the plan visible to retry", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByText('Publish to "origin" (main).');

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

  it("closes on Escape and restores focus to the element that opened it", async () => {
    function Harness(): React.JSX.Element {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            open
          </button>
          <PublishDialog isOpen={isOpen} projectPath="/repo" onClose={() => setIsOpen(false)} onPublished={vi.fn()} />
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
    await screen.findByText('Publish to "origin" (main).');

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByText('Publish to "origin" (main).')).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "open" })).toHaveFocus();
  });

  it("cancel button closes the dialog without publishing", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onClose } = renderDialog();
    await screen.findByText('Publish to "origin" (main).');

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });
});
