import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "./i18n";
import { SaveVersionDialog } from "./saveVersionDialog";
import type { SaveVersionPlan, SaveVersionResult } from "./saveVersion";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

function plan(overrides: Partial<SaveVersionPlan> = {}): SaveVersionPlan {
  return {
    operationKind: "history-mutation",
    requiresConfirmation: true,
    stateToken: "token-1",
    branch: "main",
    isFirstVersion: false,
    totalFiles: 2,
    remainingFiles: 0,
    isPartial: false,
    hasPreparedChanges: false,
    counts: { changed: 1, new: 1, deleted: 0, renamed: 0, conflicted: 0, total: 2 },
    ...overrides,
  };
}

function renderDialog(props: Partial<React.ComponentProps<typeof SaveVersionDialog>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onPublishNow = vi.fn();
  const utils = render(
    <LanguageProvider>
      <SaveVersionDialog
        isOpen
        projectPath="/repo"
        selectedPaths={null}
        onClose={onClose}
        onSaved={onSaved}
        onPublishNow={onPublishNow}
        {...props}
      />
    </LanguageProvider>,
  );
  return { onClose, onSaved, onPublishNow, ...utils };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SaveVersionDialog", () => {
  it("renders nothing when closed, and never calls the planner", () => {
    const { container } = render(
      <LanguageProvider>
        <SaveVersionDialog
          isOpen={false}
          projectPath="/repo"
          selectedPaths={null}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("shows the file summary once the plan loads, and focuses the description field", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();

    expect(await screen.findByText("2 files will be saved.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("What changed?")).toHaveFocus());
    expect(mockedInvoke).toHaveBeenCalledWith("plan_save_version", { path: "/repo", selectedPaths: null });
  });

  it("shows a first-version note only when the plan says so", async () => {
    mockedInvoke.mockResolvedValueOnce(plan({ isFirstVersion: true }));
    renderDialog();

    expect(await screen.findByText("This will be this project's first saved version.")).toBeInTheDocument();
  });

  it("shows a localized blocker and offers to try again when planning fails", async () => {
    mockedInvoke.mockRejectedValueOnce({ code: "nothing_to_save", message: "x", remediation: null });
    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "There's nothing to save right now. Make some changes first.",
    );
    expect(screen.queryByLabelText("What changed?")).not.toBeInTheDocument();

    mockedInvoke.mockResolvedValueOnce(plan());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("What changed?")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });

  it("blocks an empty description locally, without calling save_version", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("What changed?");

    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(await screen.findByText("Write a short description before saving.")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(1); // only the plan fetch
  });

  it("clears the inline validation message as soon as the user types", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("What changed?");
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    await screen.findByText("Write a short description before saving.");

    await userEvent.type(screen.getByLabelText("What changed?"), "a");

    expect(screen.queryByText("Write a short description before saving.")).not.toBeInTheDocument();
  });

  it("saves successfully, shows the short commit, and refreshes the caller", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onSaved } = renderDialog();
    await screen.findByLabelText("What changed?");

    await userEvent.type(screen.getByLabelText("What changed?"), "fix the thing");
    const result: SaveVersionResult = {
      commit: "abc123abc123abc123abc123abc123abc123ab",
      shortCommit: "abc123a",
      description: "fix the thing",
      branch: "main",
      savedFiles: 2,
    };
    mockedInvoke.mockResolvedValueOnce(result);
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(await screen.findByText("Saved as abc123a.")).toBeInTheDocument();
    expect(screen.getByText("Saved on this computer. Not published to a remote project yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish now" })).toBeEnabled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenLastCalledWith("save_version", {
      path: "/repo",
      description: "fix the thing",
      stateToken: "token-1",
      selectedPaths: null,
    });
  });

  it("Publish now closes the dialog and hands off to the caller's publish flow", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onClose, onPublishNow } = renderDialog();
    await screen.findByLabelText("What changed?");
    await userEvent.type(screen.getByLabelText("What changed?"), "fix the thing");

    const result: SaveVersionResult = {
      commit: "abc123abc123abc123abc123abc123abc123ab",
      shortCommit: "abc123a",
      description: "fix the thing",
      branch: "main",
      savedFiles: 2,
    };
    mockedInvoke.mockResolvedValueOnce(result);
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    await screen.findByText("Saved as abc123a.");

    await userEvent.click(screen.getByRole("button", { name: "Publish now" }));

    expect(onPublishNow).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps showing success even if the parent recomputes an equivalent selection afterward", async () => {
    // Regression test: `onSaved` triggers a background status refresh, which
    // recomputes `selectedPaths` as a *new array reference* with the same
    // logical content. That must not be treated as the user changing their
    // selection mid-dialog — it used to re-fetch the plan and silently
    // overwrite the success screen with the form again.
    mockedInvoke.mockResolvedValueOnce(plan());
    const { rerender } = render(
      <LanguageProvider>
        <SaveVersionDialog
          isOpen
          projectPath="/repo"
          selectedPaths={["a.txt"]}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );
    await screen.findByLabelText("What changed?");
    await userEvent.type(screen.getByLabelText("What changed?"), "done");

    const result: SaveVersionResult = {
      commit: "abc123abc123abc123abc123abc123abc123ab",
      shortCommit: "abc123a",
      description: "done",
      branch: "main",
      savedFiles: 1,
    };
    mockedInvoke.mockResolvedValueOnce(result);
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    expect(await screen.findByText("Saved as abc123a.")).toBeInTheDocument();

    rerender(
      <LanguageProvider>
        <SaveVersionDialog
          isOpen
          projectPath="/repo"
          selectedPaths={["a.txt"]}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText("Saved as abc123a.")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });

  it("reports a save failure, keeps the form, and can reveal the technical detail", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("What changed?");
    await userEvent.type(screen.getByLabelText("What changed?"), "fix the thing");

    mockedInvoke.mockRejectedValueOnce({
      code: "hook_rejected",
      message: "x",
      remediation: null,
      detail: "pre-commit exited 1",
    });
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A Git hook rejected this version.");
    // The form (and the already-typed description) is still there to retry.
    expect(screen.getByLabelText("What changed?")).toHaveValue("fix the thing");

    expect(screen.queryByText("pre-commit exited 1")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show technical details" }));
    expect(screen.getByText("pre-commit exited 1")).toBeInTheDocument();
  });

  it("closes on Escape and restores focus to the element that opened it", async () => {
    // `useModalFocus` only restores focus once `isOpen` actually flips back
    // to `false`, and it only captures "what had focus" at the moment it
    // *opens* — so this needs a stateful harness where a real click (not a
    // fire-and-forget `onClose` mock) both focuses the opener and flips
    // `isOpen`, matching how this actually happens in the app.
    function Harness(): React.JSX.Element {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            open
          </button>
          <SaveVersionDialog
            isOpen={isOpen}
            projectPath="/repo"
            selectedPaths={null}
            onClose={() => setIsOpen(false)}
            onSaved={vi.fn()}
            onPublishNow={vi.fn()}
          />
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
    await screen.findByLabelText("What changed?");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByLabelText("What changed?")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "open" })).toHaveFocus();
  });

  it("cancel button closes the dialog without saving", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onClose } = renderDialog();
    await screen.findByLabelText("What changed?");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });
});
