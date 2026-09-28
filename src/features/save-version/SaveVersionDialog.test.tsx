import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import { SaveVersionDialog } from "./SaveVersionDialog";
import type { SaveVersionPlan, SaveVersionPreview, SaveVersionResult } from "./domain";

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
    files: [],
    ...overrides,
  };
}

/** "More details" is folded behind "Add details" until asked for, or until a
 * draft already has some. */
async function detailsField(): Promise<HTMLElement> {
  const add = screen.queryByRole("button", { name: "Add details" });
  if (add) {
    await userEvent.click(add);
  }
  return screen.getByLabelText("More details (optional)");
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
  localStorage.clear();
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

    expect(await screen.findByText("2 files")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Version name")).toHaveFocus());
    expect(mockedInvoke).toHaveBeenCalledWith("plan_save_version", { path: "/repo", sessionEpoch: "epoch-1", selectedPaths: null });
  });

  it("shows both the version name and the optional details fields", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();

    const title = await screen.findByLabelText("Version name");
    expect(title).toBeRequired();
    // The length hint is not a standing line of grey: it appears only once
    // the name runs past 50 characters.
    expect(title).not.toHaveAccessibleDescription();
    await userEvent.type(title, "x".repeat(51));
    expect(title).toHaveAccessibleDescription("Short names read better in History.");
    // Details are one click away, and that click puts the cursor in them.
    expect(screen.queryByLabelText("More details (optional)")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add details" }));
    await waitFor(() => expect(screen.getByLabelText("More details (optional)")).toHaveFocus());
  });

  function pendingPlan(): { resolve: (value: SaveVersionPlan) => void; reject: (error: unknown) => void } {
    const handle = {
      resolve: (_value: SaveVersionPlan): void => undefined,
      reject: (_error: unknown): void => undefined,
    };
    mockedInvoke.mockImplementationOnce(
      () =>
        new Promise<SaveVersionPlan>((resolve, reject) => {
          handle.resolve = resolve;
          handle.reject = reject;
        }),
    );
    return handle;
  }

  const previewOf = (overrides: Partial<SaveVersionPreview> = {}): SaveVersionPreview => ({
    branch: "main",
    isFirstVersion: false,
    totalFiles: 2,
    remainingFiles: 0,
    hasPreparedChanges: false,
    counts: { changed: 1, new: 1, deleted: 0, renamed: 0, conflicted: 0, total: 2 },
    files: [],
    ...overrides,
  });

  it("opens in its final shape with the version name focused while the plan is still out", async () => {
    const pending = pendingPlan();
    renderDialog();

    const title = screen.getByLabelText("Version name");
    expect(screen.getByRole("button", { name: "Add details" })).toBeInTheDocument();
    await waitFor(() => expect(title).toHaveFocus());
    // Nothing to save on yet: Save waits for the plan that decides.
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();

    // What was typed while Git answered is still there, and still focused.
    await userEvent.type(title, "fix the thing");
    await act(async () => pending.resolve(plan()));

    expect(await screen.findByText("2 files")).toBeInTheDocument();
    expect(title).toHaveValue("fix the thing");
    expect(title).toHaveFocus();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("draws placeholders where the summary will be when there is nothing to preview", async () => {
    const pending = pendingPlan();
    renderDialog();

    expect(screen.getByText("Preparing a preview…").closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByText("2 files")).not.toBeInTheDocument();

    await act(async () => pending.resolve(plan()));
    expect(await screen.findByText("2 files")).toBeInTheDocument();
    expect(screen.queryByText("Preparing a preview…")).not.toBeInTheDocument();
  });

  it("shows the session's preview at once and holds Save back until the plan confirms it", async () => {
    const pending = pendingPlan();
    renderDialog({
      preview: previewOf({
        totalFiles: 3,
        counts: { changed: 3, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 3 },
      }),
    });

    expect(screen.getByText("3 files")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Checking…");
    const held = screen.getByRole("button", { name: "Checking…" });
    expect(held).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Version name"), "x");
    await userEvent.click(held);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);

    // The fresh plan decides: a different count replaces the preview's.
    await act(async () => pending.resolve(plan()));
    expect(await screen.findByText("2 files")).toBeInTheDocument();
    expect(screen.queryByText("3 files")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("saves with the fresh plan's state token, never the preview's", async () => {
    const pending = pendingPlan();
    renderDialog({ preview: previewOf() });
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    await act(async () => pending.resolve(plan({ stateToken: "fresh-token" })));
    mockedInvoke.mockResolvedValueOnce(saveResult());

    await userEvent.click(await screen.findByRole("button", { name: "Save" }));

    expect(mockedInvoke).toHaveBeenLastCalledWith(
      "save_version",
      expect.objectContaining({ stateToken: "fresh-token" }),
    );
  });

  it("replaces the form with the blocker when the plan is refused after a preview", async () => {
    const pending = pendingPlan();
    renderDialog({ preview: previewOf() });
    expect(screen.getByLabelText("Version name")).toBeInTheDocument();

    await act(async () =>
      pending.reject({
        code: "unresolved_conflicts",
        message: "Some files have overlapping changes that need to be resolved first.",
      }),
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByLabelText("Version name")).not.toBeInTheDocument();
  });

  it("names the first version from the preview's own first-version flag", () => {
    pendingPlan();
    renderDialog({ preview: previewOf({ isFirstVersion: true }) });

    expect(screen.getByRole("heading", { name: "Save your first version" })).toBeInTheDocument();
    expect(screen.getByText("This will be the first saved version on main.")).toBeInTheDocument();
  });

  it("renders the form copy in Spanish", async () => {
    localStorage.setItem("gitodile-language", "es");
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    localStorage.removeItem("gitodile-language");

    expect(await screen.findByLabelText("Nombre de la versión")).toBeRequired();
    expect(screen.getByRole("button", { name: "Añadir detalles" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Publicar después de guardar" })).toBeInTheDocument();
    expect(screen.getByText("Solo en este ordenador hasta que publiques.")).toBeInTheDocument();
  });

  it("shows a first-version note only when the plan says so", async () => {
    mockedInvoke.mockResolvedValueOnce(plan({ isFirstVersion: true }));
    renderDialog();

    expect(await screen.findByText("This will be the first saved version on main.")).toBeInTheDocument();
  });

  it("names the version line this version will be saved to, from the plan", async () => {
    mockedInvoke.mockResolvedValueOnce(plan({ branch: "0.2.0-preview.1" }));
    renderDialog();

    expect(await screen.findByText("2 files")).toBeInTheDocument();
    expect(screen.getByText("0.2.0-preview.1").closest(".save-version-branch")).toHaveAttribute(
      "data-tooltip",
      "0.2.0-preview.1",
    );
  });

  it("names no destination when the plan has no version line to name", async () => {
    // A detached `HEAD`: there is a commit to make and no line to make it on.
    // Inventing a name here would be the one thing a destination must not do.
    mockedInvoke.mockResolvedValueOnce(plan({ branch: null }));
    renderDialog();

    expect(
      await screen.findByText(
        "You're not on a version line. Create one so this version is easy to find.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("2 files")).toBeInTheDocument();
    expect(document.querySelector(".save-version-branch")).toBeNull();
  });

  it("says what the publish choice means where it is made, and follows the choice", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();

    expect(await screen.findByText("Only on this computer until you publish.")).toBeInTheDocument();
    const publishAfter = screen.getByRole("checkbox", { name: "Publish after saving" });
    expect(publishAfter).toHaveAccessibleDescription("Only on this computer until you publish.");
    await userEvent.click(publishAfter);
    expect(publishAfter).toHaveAccessibleDescription("You'll review it before anything is published.");
    expect(screen.getByText("You'll review it before anything is published.")).toBeInTheDocument();
    expect(screen.queryByText("Only on this computer until you publish.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and publish" })).toBeEnabled();
  });

  it("offers only Close when there is nothing to save, since retrying can't change that", async () => {
    mockedInvoke.mockRejectedValueOnce({ code: "nothing_to_save", message: "x", remediation: null });
    const { onClose } = renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("There's nothing to save yet.");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a localized blocker and offers to try again when planning fails", async () => {
    mockedInvoke.mockRejectedValueOnce({ code: "permission_denied", message: "x", remediation: null });
    renderDialog();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Give the version a short name.")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(1); // only the plan fetch
  });

  it("blocks a whitespace-only version name, even with optional details filled in", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("Version name");

    await userEvent.type(screen.getByLabelText("Version name"), "   ");
    await userEvent.type(await detailsField(), "some context");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Give the version a short name.")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(1); // only the plan fetch
  });

  it("clears the inline validation message as soon as the user types", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("Version name");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Give the version a short name.");

    await userEvent.type(screen.getByLabelText("Version name"), "a");

    expect(screen.queryByText("Give the version a short name.")).not.toBeInTheDocument();
  });

  it("saves successfully with only a name, shows the short commit, and refreshes the caller", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    const { onSaved } = renderDialog();
    await screen.findByLabelText("Version name");

    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    mockedInvoke.mockResolvedValueOnce(saveResult());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText('“fix the thing” is on “main”, only on this computer.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Version saved" })).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent('“fix the thing” is on “main”, only on this computer.');
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
      await detailsField(),
      "line one{enter}{enter}line two",
    );
    mockedInvoke.mockResolvedValueOnce(
      saveResult({ description: "line one\n\nline two" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText('“fix the thing” is on “main”, only on this computer.')).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Add details" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("checkbox", { name: "Publish after saving" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();

    mockedInvoke.mockResolvedValueOnce(saveResult({ title: "keyboard save" }));
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText('“keyboard save” is on “main”, only on this computer.')).toBeInTheDocument();
  });

  it("accepts long names and details without imposing a hard limit", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    const longTitle = "A".repeat(120);
    const longDetails = `Context ${"x".repeat(1000)}\n\n${"y".repeat(1000)}`;
    fireEvent.change(await screen.findByLabelText("Version name"), { target: { value: longTitle } });
    fireEvent.change(await detailsField(), { target: { value: longDetails } });

    mockedInvoke.mockResolvedValueOnce(saveResult({ title: longTitle, description: longDetails }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText(`“${longTitle}” is on “main”, only on this computer.`);
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

  it("folds the plan's files behind Show files, and says how many the list leaves out", async () => {
    mockedInvoke.mockResolvedValueOnce(
      plan({
        totalFiles: 3,
        counts: { changed: 1, new: 1, deleted: 0, renamed: 1, conflicted: 0, total: 3 },
        files: [
          { path: "src/app.ts", originalPath: null, category: "changed" },
          { path: "docs/new.md", originalPath: "docs/old.md", category: "renamed" },
        ],
      }),
    );
    renderDialog();
    const toggle = await screen.findByRole("button", { name: "Show files" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Files in this version" })).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide files" })).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Files in this version" });
    expect(list).toHaveTextContent("editedsrc/app.ts");
    expect(list).toHaveTextContent("renameddocs/old.md → docs/new.md");
    expect(screen.getByText("And 1 more — Changes lists every file.")).toBeInTheDocument();
  });

  it("saves with Ctrl+Enter from the details", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByRole("button", { name: "Save" });

    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    mockedInvoke.mockResolvedValueOnce(saveResult({ description: "why" }));
    await userEvent.type(await detailsField(), "why{Control>}{Enter}{/Control}");
    await screen.findByText('“fix the thing” is on “main”, only on this computer.');
    expect(mockedInvoke).toHaveBeenLastCalledWith("save_version", expect.objectContaining({ description: "why" }));
  });

  it("saves with Enter in the name once the plan is in", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByRole("button", { name: "Save" });
    mockedInvoke.mockResolvedValueOnce(saveResult());
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing{Enter}");
    await screen.findByText('“fix the thing” is on “main”, only on this computer.');
  });

  it("ignores Enter while the plan is still out", async () => {
    pendingPlan();
    renderDialog();
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing{Enter}");
    expect(mockedInvoke).not.toHaveBeenCalledWith("save_version", expect.anything());
  });

  it("trims surrounding whitespace from both fields before saving", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("Version name");

    await userEvent.type(screen.getByLabelText("Version name"), "  fix the thing  ");
    await userEvent.type(await detailsField(), "  details  ");
    mockedInvoke.mockResolvedValueOnce(saveResult({ description: "details" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText('“fix the thing” is on “main”, only on this computer.');
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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText('“fix the thing” is on “main”, only on this computer.');

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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText('“done” is on “main”, only on this computer.')).toBeInTheDocument();

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

    expect(screen.getByText('“done” is on “main”, only on this computer.')).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
  });

  it("reports a save failure, keeps the form (name and details), and can reveal the technical detail", async () => {
    mockedInvoke.mockResolvedValueOnce(plan());
    renderDialog();
    await screen.findByLabelText("Version name");
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    await userEvent.type(await detailsField(), "some context");

    mockedInvoke.mockRejectedValueOnce({
      code: "hook_rejected",
      message: "x",
      remediation: null,
      detail: "pre-commit exited 1",
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

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
      screen.queryByRole("button", { name: "Save without running hooks" }),
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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A Git hook rejected this version.");
    // Open without being asked for: the hook's message is the only thing that
    // says what to fix, so it is not hidden behind a toggle here.
    expect(screen.getByText("pre-commit: 2 files need formatting")).toBeInTheDocument();

    mockedInvoke.mockResolvedValueOnce(saveResult());
    await userEvent.click(screen.getByRole("button", { name: "Save without running hooks" }));

    await screen.findByText('“fix the thing” is on “main”, only on this computer.');
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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Save without running hooks" }),
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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(container.querySelector(".save-version-backdrop") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    resolveSave?.(saveResult({ title: "save safely" }));
    expect(await screen.findByText('“save safely” is on “main”, only on this computer.')).toBeInTheDocument();
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

  it("keeps a typed title and details across a close without saving, and clears them once a save succeeds", async () => {
    function Harness(): React.JSX.Element {
      const [isOpen, setIsOpen] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setIsOpen((value) => !value)}>
            toggle open
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
    await userEvent.type(await screen.findByLabelText("Version name"), "fix the thing");
    await userEvent.type(await detailsField(), "some context");

    // A stray Cancel — or a backdrop click, or Escape, all the same path —
    // used to throw this away with no confirmation.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    mockedInvoke.mockResolvedValueOnce(plan());
    await userEvent.click(screen.getByRole("button", { name: "toggle open" }));

    await screen.findByLabelText("Version name");
    expect(screen.getByLabelText("Version name")).toHaveValue("fix the thing");
    expect(screen.getByLabelText("More details (optional)")).toHaveValue("some context");
    // Opened by the draft, and kept open while it is cleared: the field does
    // not fold away under the cursor.
    const drafted = screen.getByLabelText("More details (optional)");
    await userEvent.clear(drafted);
    expect(screen.getByLabelText("More details (optional)")).toBe(drafted);
    await userEvent.type(drafted, "some context");

    // A save that actually succeeds is the one thing that does clear it —
    // the draft became the version's own record, not still-editable text.
    mockedInvoke.mockResolvedValueOnce(saveResult());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText('“fix the thing” is on “main”, only on this computer.');

    await userEvent.click(screen.getByRole("button", { name: "toggle open" }));
    mockedInvoke.mockResolvedValueOnce(plan());
    await userEvent.click(screen.getByRole("button", { name: "toggle open" }));

    await screen.findByLabelText("Version name");
    expect(screen.getByLabelText("Version name")).toHaveValue("");
    // Nothing drafted, so the details are folded again.
    expect(screen.queryByLabelText("More details (optional)")).not.toBeInTheDocument();
  });
});
