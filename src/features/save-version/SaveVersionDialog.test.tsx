import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import { SaveVersionDialog } from "./SaveVersionDialog";
import type { SaveVersionPlan, SaveVersionResult } from "./domain";

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

function saveResult(overrides: Partial<SaveVersionResult> = {}): SaveVersionResult {
  return {
    commit: "abc123abc123abc123abc123abc123abc123ab",
    shortCommit: "abc123a",
    title: "fix the thing",
    description: null,
    branch: "main",
    savedFiles: 2,
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
        sessionEpoch="epoch-1"
        selectedPaths={null}
        runHooks={false}
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
          sessionEpoch="epoch-1"
          selectedPaths={null}
          runHooks={false}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("shows the file summary once the plan loads, and focuses the version name field", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();

    expect(await screen.findByText("2 files will be saved.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Version name")).toHaveFocus());
    expect(mockedInvoke).toHaveBeenCalledWith("plan_save_version", { path: "/repo", sessionEpoch: "epoch-1", selectedPaths: null });
  });

  it("shows both the version name and the optional details fields", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();

    const title = await screen.findByLabelText("Version name");
    expect(title).toBeRequired();
    expect(title).toHaveAccessibleDescription(
      "Around 50 characters is easy to scan, but longer names are allowed.",
    );
    expect(screen.getByLabelText("More details (optional)")).toBeInTheDocument();
  });

  it("focuses the version name after a realistically delayed plan", async () => {
    let resolvePlan: ((value: SaveVersionPlan) => void) | undefined;
    mockedInvoke.mockImplementationOnce(
      () =>
        new Promise<SaveVersionPlan>((resolve) => {
          resolvePlan = resolve;
        }),
    );
    renderDialog();

    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    await act(async () => resolvePlan?.(plan()));

    await waitFor(() => expect(screen.getByLabelText("Version name")).toHaveFocus());
  });

  it("renders the form copy in Spanish", async () => {
    localStorage.setItem("gitodrile-language", "es");
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    localStorage.removeItem("gitodrile-language");

    expect(await screen.findByLabelText("Nombre de la versión")).toBeRequired();
    expect(screen.getByLabelText("Más detalles (opcional)")).toBeInTheDocument();
    expect(
      screen.getByText("Unas 50 letras se leen de un vistazo, pero se permiten nombres más largos."),
    ).toBeInTheDocument();
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
    expect(screen.queryByLabelText("Version name")).not.toBeInTheDocument();

    mockedInvoke.mockResolvedValueOnce(plan());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Version name")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });

  it("blocks an empty version name locally, without calling save_version", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("Version name");

    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(await screen.findByText("Write a short name before saving.")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(1); // only the plan fetch
  });

  it("blocks a whitespace-only version name, even with optional details filled in", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("Version name");

    await userEvent.type(screen.getByLabelText("Version name"), "   ");
    await userEvent.type(screen.getByLabelText("More details (optional)"), "some context");
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(await screen.findByText("Write a short name before saving.")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(1); // only the plan fetch
  });

  it("clears the inline validation message as soon as the user types", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("Version name");
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    await screen.findByText("Write a short name before saving.");

    await userEvent.type(screen.getByLabelText("Version name"), "a");

    expect(screen.queryByText("Write a short name before saving.")).not.toBeInTheDocument();
  });

  it("saves successfully with only a name, shows the short commit, and refreshes the caller", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onSaved } = renderDialog();
    await screen.findByLabelText("Version name");

    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    mockedInvoke.mockResolvedValueOnce(saveResult());
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(await screen.findByText('Saved "fix the thing" as abc123a.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Version saved" })).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent('Saved "fix the thing" as abc123a.');
    expect(screen.getByText("Saved on this computer. Not published to a remote project yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish now" })).toBeEnabled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenLastCalledWith("save_version", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      title: "fix the thing",
      description: null,
      stateToken: "token-1",
      selectedPaths: null,
      runHooks: false,
    });
  });

  it("saves successfully with both a name and multiline details", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { container } = renderDialog();
    await screen.findByLabelText("Version name");

    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    await userEvent.type(
      screen.getByLabelText("More details (optional)"),
      "line one{enter}{enter}line two",
    );
    mockedInvoke.mockResolvedValueOnce(
      saveResult({ description: "line one\n\nline two" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(await screen.findByText('Saved "fix the thing" as abc123a.')).toBeInTheDocument();
    expect(container.querySelector(".save-version-success-details")?.textContent).toBe(
      "line one\n\nline two",
    );
    expect(mockedInvoke).toHaveBeenLastCalledWith("save_version", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      title: "fix the thing",
      description: "line one\n\nline two",
      stateToken: "token-1",
      selectedPaths: null,
      runHooks: false,
    });
  });

  it("supports keyboard-only completion in logical tab order", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    const title = await screen.findByLabelText("Version name");
    await userEvent.type(title, "keyboard save");

    await userEvent.tab();
    expect(screen.getByLabelText("More details (optional)")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Save version" })).toHaveFocus();

    mockedInvoke.mockResolvedValueOnce(saveResult({ title: "keyboard save" }));
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText('Saved "keyboard save" as abc123a.')).toBeInTheDocument();
  });

  it("accepts long names and details without imposing a hard limit", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    const longTitle = "A".repeat(120);
    const longDetails = `Context ${"x".repeat(1000)}\n\n${"y".repeat(1000)}`;
    fireEvent.change(await screen.findByLabelText("Version name"), { target: { value: longTitle } });
    fireEvent.change(screen.getByLabelText("More details (optional)"), { target: { value: longDetails } });

    mockedInvoke.mockResolvedValueOnce(saveResult({ title: longTitle, description: longDetails }));
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    await screen.findByText(`Saved "${longTitle}" as abc123a.`);
    expect(mockedInvoke).toHaveBeenLastCalledWith("save_version", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      title: longTitle,
      description: longDetails,
      stateToken: "token-1",
      selectedPaths: null,
      runHooks: false,
    });
  });

  it("trims surrounding whitespace from both fields before saving", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("Version name");

    await userEvent.type(screen.getByLabelText("Version name"), "  fix the thing  ");
    await userEvent.type(screen.getByLabelText("More details (optional)"), "  details  ");
    mockedInvoke.mockResolvedValueOnce(saveResult({ description: "details" }));
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    await screen.findByText('Saved "fix the thing" as abc123a.');
    expect(mockedInvoke).toHaveBeenLastCalledWith("save_version", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      title: "fix the thing",
      description: "details",
      stateToken: "token-1",
      selectedPaths: null,
      runHooks: false,
    });
  });

  it("Publish now closes the dialog and hands off to the caller's publish flow", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onClose, onPublishNow } = renderDialog();
    await screen.findByLabelText("Version name");
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");

    mockedInvoke.mockResolvedValueOnce(saveResult());
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    await screen.findByText('Saved "fix the thing" as abc123a.');

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
          sessionEpoch="epoch-1"
          selectedPaths={["a.txt"]}
          runHooks={false}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );
    await screen.findByLabelText("Version name");
    await userEvent.type(screen.getByLabelText("Version name"), "done");

    mockedInvoke.mockResolvedValueOnce(saveResult({ title: "done", savedFiles: 1 }));
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    expect(await screen.findByText('Saved "done" as abc123a.')).toBeInTheDocument();

    rerender(
      <LanguageProvider>
        <SaveVersionDialog
          isOpen
          projectPath="/repo"
          sessionEpoch="epoch-1"
          selectedPaths={["a.txt"]}
          runHooks={false}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('Saved "done" as abc123a.')).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });

  it("reports a save failure, keeps the form (name and details), and can reveal the technical detail", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("Version name");
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    await userEvent.type(screen.getByLabelText("More details (optional)"), "some context");

    mockedInvoke.mockRejectedValueOnce({
      code: "hook_rejected",
      message: "x",
      remediation: null,
      detail: "pre-commit exited 1",
    });
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A Git hook rejected this version.");
    // The form (and the already-typed name/details) is still there to retry.
    expect(screen.getByLabelText("Version name")).toHaveValue("fix the thing");
    expect(screen.getByLabelText("More details (optional)")).toHaveValue("some context");

    expect(screen.queryByText("pre-commit exited 1")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show technical details" }));
    expect(screen.getByText("pre-commit exited 1")).toBeInTheDocument();
    // This save already skipped the hooks, so "save without the hooks" is not
    // a way out of anything — offering it would be nonsense.
    expect(
      screen.queryByRole("button", { name: "Save without running the hooks" }),
    ).not.toBeInTheDocument();
  });

  it("offers a one-time save without hooks when a hook rejected it, and shows what the hook said", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onSaved } = renderDialog({ runHooks: true });
    await screen.findByLabelText("Version name");
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");

    mockedInvoke.mockRejectedValueOnce({
      code: "hook_rejected",
      message: "x",
      remediation: null,
      detail: "pre-commit: 2 files need formatting",
    });
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A Git hook rejected this version.");
    // Open without being asked for: the hook's message is the only thing that
    // says what to fix, so it is not hidden behind a toggle here.
    expect(screen.getByText("pre-commit: 2 files need formatting")).toBeInTheDocument();

    mockedInvoke.mockResolvedValueOnce(saveResult());
    await userEvent.click(screen.getByRole("button", { name: "Save without running the hooks" }));

    await screen.findByText('Saved "fix the thing" as abc123a.');
    expect(mockedInvoke).toHaveBeenLastCalledWith("save_version", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      title: "fix the thing",
      description: null,
      stateToken: "token-1",
      selectedPaths: null,
      runHooks: false,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("opens the hook's output even after a different failure collapsed the toggle", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog({ runHooks: true });
    await screen.findByLabelText("Version name");
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");

    mockedInvoke.mockRejectedValueOnce({
      code: "signing_failed",
      message: "x",
      remediation: null,
      detail: "gpg failed to sign",
    });
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("gpg failed to sign")).not.toBeInTheDocument();

    // `startExpanded` only seeds the initial state, so the detail panel has to
    // be a fresh instance when the kind of failure changes.
    mockedInvoke.mockRejectedValueOnce({
      code: "hook_rejected",
      message: "x",
      remediation: null,
      detail: "pre-commit: 2 files need formatting",
    });
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(await screen.findByText("pre-commit: 2 files need formatting")).toBeInTheDocument();
  });

  it("keeps the escape to hook rejections, not to every failure", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog({ runHooks: true });
    await screen.findByLabelText("Version name");
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");

    // Signing failed, the index was unavailable, Git fell over — none of those
    // get any better by passing `--no-verify`.
    mockedInvoke.mockRejectedValueOnce({
      code: "signing_failed",
      message: "x",
      remediation: null,
      detail: "gpg failed to sign",
    });
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Save without running the hooks" }),
    ).not.toBeInTheDocument();
  });

  it("cannot be dismissed while saving is in progress", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onClose, container } = renderDialog();
    await screen.findByLabelText("Version name");
    await userEvent.type(screen.getByLabelText("Version name"), "save safely");

    let resolveSave: ((result: SaveVersionResult) => void) | undefined;
    mockedInvoke.mockImplementationOnce(
      () =>
        new Promise<SaveVersionResult>((resolve) => {
          resolveSave = resolve;
        }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(container.querySelector(".save-version-backdrop") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    resolveSave?.(saveResult({ title: "save safely" }));
    expect(await screen.findByText('Saved "save safely" as abc123a.')).toBeInTheDocument();
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
            sessionEpoch="epoch-1"
            selectedPaths={null}
            runHooks={false}
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
    await screen.findByLabelText("Version name");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByLabelText("Version name")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "open" })).toHaveFocus();
  });

  it("cancel button closes the dialog without saving", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onClose } = renderDialog();
    await screen.findByLabelText("Version name");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });
});
