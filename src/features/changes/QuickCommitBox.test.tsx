import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import { PUBLISH_AFTER_SAVE_STORAGE_KEY } from "../save-version";
import type { SaveVersionPlan, SaveVersionResult } from "../save-version";
import { QuickCommitBox } from "./QuickCommitBox";

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

/** Answers Git by command rather than by call order: the box asks for a plan
 * when it opens and again before it saves, so a queue of "once" answers would
 * hand the save's request the wrong reply. `save` may be a rejection. */
function stubGit({
  plan: planAnswer = plan(),
  save = saveResult(),
}: { plan?: SaveVersionPlan; save?: SaveVersionResult | { reject: unknown } } = {}): void {
  mockedInvoke.mockImplementation((command) => {
    if (command === "plan_save_version") return Promise.resolve(planAnswer);
    if (command === "save_version") {
      return "reject" in save ? Promise.reject(save.reject) : Promise.resolve(save);
    }
    return Promise.reject(new Error(`Unexpected command: ${command}`));
  });
}

function renderBox(props: Partial<React.ComponentProps<typeof QuickCommitBox>> = {}) {
  const onSaveCompleted = vi.fn();
  const onPublishNow = vi.fn();
  const fileListRef = React.createRef<HTMLDivElement>();
  const utils = render(
    <LanguageProvider>
      <div ref={fileListRef}>
        <QuickCommitBox
          projectPath="/repo"
          sessionEpoch="epoch-1"
          selectedPaths={null}
          canSave
          runHooks={false}
          remoteLabel={null}
          fileListRef={fileListRef}
          onSaveCompleted={onSaveCompleted}
          onPublishNow={onPublishNow}
          {...props}
        />
      </div>
    </LanguageProvider>,
  );
  return { onSaveCompleted, onPublishNow, ...utils };
}

function isExpanded(container: HTMLElement): boolean {
  return container.querySelector(".changes-quick-commit")?.className.includes("--expanded") ?? false;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // `publishToo` reads this on mount, shared with SaveVersionDialog's own
  // checkbox — a test that checks the toggle must not leak that choice into
  // the next one.
  localStorage.removeItem(PUBLISH_AFTER_SAVE_STORAGE_KEY);
  localStorage.clear();
});

describe("QuickCommitBox", () => {
  it("starts closed and costs Git nothing until it opens, then states the plan", async () => {
    stubGit({ plan: plan({ branch: "feature/journey" }) });
    const { container } = renderBox();
    expect(isExpanded(container)).toBe(false);
    expect(mockedInvoke).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText("Version name"));
    expect(isExpanded(container)).toBe(true);
    // One line — the files, then the line they land on — from the plan that
    // will write the version, so the two cannot disagree.
    expect(await screen.findByLabelText("2 files will be saved. This version will be saved to feature/journey.")).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.getByText("feature/journey")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it("asks for no plan while nothing is selected to save", async () => {
    renderBox({ canSave: false });
    await userEvent.click(screen.getByLabelText("Version name"));
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("prints only the notes that apply to this plan, the same ones the dialog prints", async () => {
    stubGit({ plan: plan({ totalFiles: 1, remainingFiles: 1, isPartial: true, isFirstVersion: true, branch: "main" }) });
    renderBox({ selectedPaths: ["a.txt"] });
    await userEvent.click(screen.getByLabelText("Version name"));

    expect(await screen.findByText("1 of 2 files")).toBeInTheDocument();
    expect(screen.getByText("1 other file will remain as a pending change.")).toBeInTheDocument();
    expect(screen.getByText("This will be the first saved version on main.")).toBeInTheDocument();
    expect(screen.queryByText(/prepared/i)).not.toBeInTheDocument();
  });

  it("closes again on blur when left empty, but not while a draft is there", async () => {
    const onSaveCompleted = vi.fn();
    const onPublishNow = vi.fn();
    const fileListRef = React.createRef<HTMLDivElement>();
    const { container } = render(
      <LanguageProvider>
        <button type="button">elsewhere on the page</button>
        <div ref={fileListRef}>
          <QuickCommitBox
            projectPath="/repo"
            sessionEpoch="epoch-1"
            selectedPaths={null}
            canSave
            runHooks={false}
            remoteLabel={null}
            fileListRef={fileListRef}
            onSaveCompleted={onSaveCompleted}
            onPublishNow={onPublishNow}
          />
        </div>
      </LanguageProvider>,
    );
    const title = screen.getByLabelText("Version name");
    const elsewhere = screen.getByRole("button", { name: "elsewhere on the page" });

    await userEvent.click(title);
    expect(isExpanded(container)).toBe(true);
    await userEvent.click(elsewhere);
    expect(isExpanded(container)).toBe(false);

    await userEvent.click(title);
    await userEvent.type(title, "wip");
    await userEvent.click(elsewhere);
    expect(isExpanded(container)).toBe(true);
  });

  it("shifts the file list's scroll position by exactly this box's own height change, and reverses it on close", async () => {
    // The global stub in testSetup.ts gives every element a fixed size, so
    // opening this box never actually changes anything a test can observe by
    // default. Only this test needs the box to report a real height
    // difference between its two states, so it patches just that in and
    // restores the stub afterward rather than changing it globally — this
    // exact regression (fixed by beginExpandedChange/scrollAnchorRef in
    // QuickCommitBox.tsx) took three tries to get right against a live
    // browser, precisely because it depends on real, differing measurements.
    const originalRect = Element.prototype.getBoundingClientRect;
    const COLLAPSED_HEIGHT = 32;
    const EXPANDED_HEIGHT = 150;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const rect = originalRect.call(this);
      if (!this.classList.contains("changes-quick-commit")) {
        return rect;
      }
      const height = this.classList.contains("changes-quick-commit--expanded") ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
      return { ...rect, height };
    };
    try {
      const fileListRef = React.createRef<HTMLDivElement>();
      render(
        <LanguageProvider>
          <div ref={fileListRef}>
            <QuickCommitBox
              projectPath="/repo"
              sessionEpoch="epoch-1"
              selectedPaths={null}
              canSave
              runHooks={false}
              remoteLabel={null}
              fileListRef={fileListRef}
              onSaveCompleted={vi.fn()}
              onPublishNow={vi.fn()}
            />
          </div>
        </LanguageProvider>,
      );
      const scrollElement = fileListRef.current;
      if (!scrollElement) throw new Error("fileListRef never attached");
      scrollElement.scrollTop = 400; // scrolled partway down a longer list

      await userEvent.click(screen.getByLabelText("Version name"));
      expect(scrollElement.scrollTop).toBe(400 + (EXPANDED_HEIGHT - COLLAPSED_HEIGHT));

      await userEvent.click(screen.getByRole("button", { name: "Discard draft" }));
      expect(scrollElement.scrollTop).toBe(400);
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
    }
  });

  it("the dismiss button clears the draft and closes the box", async () => {
    const { container } = renderBox();
    const title = screen.getByLabelText("Version name");
    await userEvent.type(title, "half-written thought");
    await userEvent.type(screen.getByLabelText("More details (optional)"), "and some detail");

    await userEvent.click(screen.getByRole("button", { name: "Discard draft" }));

    expect(title).toHaveValue("");
    expect(screen.getByLabelText("More details (optional)")).toHaveValue("");
    expect(isExpanded(container)).toBe(false);
  });

  it("Escape does the same as the dismiss button", async () => {
    const { container } = renderBox();
    const title = screen.getByLabelText("Version name");
    await userEvent.type(title, "half-written thought");

    await userEvent.keyboard("{Escape}");

    expect(title).toHaveValue("");
    expect(isExpanded(container)).toBe(false);
  });

  it("saves with the typed title and description, then clears the draft", async () => {
    stubGit();
    const { onSaveCompleted } = renderBox({ selectedPaths: ["a.txt", "b.txt"] });
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    await userEvent.type(screen.getByLabelText("More details (optional)"), "some context");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText('Saved "fix the thing" as abc123a.')).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("plan_save_version", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      selectedPaths: ["a.txt", "b.txt"],
    });
    // A fresh plan right before the save, for a fresh state token.
    expect(mockedInvoke).toHaveBeenLastCalledWith("save_version", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      title: "fix the thing",
      description: "some context",
      stateToken: "token-1",
      selectedPaths: ["a.txt", "b.txt"],
      runHooks: false,
    });
    expect(onSaveCompleted).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Version name")).toHaveValue("");
    expect(screen.getByLabelText("More details (optional)")).toHaveValue("");
  });

  it("submits on Enter in the summary field", async () => {
    stubGit();
    renderBox();
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");

    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText('Saved "fix the thing" as abc123a.')).toBeInTheDocument();
  });

  it("does nothing without a title, even if Save is reached some other way", async () => {
    stubGit();
    renderBox();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Version name"), "  ");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(mockedInvoke).not.toHaveBeenCalledWith("save_version", expect.anything());
  });

  it("disables Save when there is nothing selected to save, and says why", async () => {
    renderBox({ canSave: false });
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("data-tooltip", "Choose at least one file to save.");
  });

  it("also hands off to Publish after saving when the toggle is on", async () => {
    stubGit();
    const { onPublishNow } = renderBox();
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    await userEvent.click(screen.getByRole("switch", { name: "Also publish" }));

    // The label stays "Save" regardless of the toggle — see the JSX comment
    // on why it doesn't vary the way the dialog's own button does.
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText('Saved "fix the thing" as abc123a.');
    expect(onPublishNow).toHaveBeenCalledTimes(1);
    // The toggle already took the reader there; no second offer.
    expect(screen.queryByRole("button", { name: "Publish now" })).not.toBeInTheDocument();
  });

  it("offers the next step under a saved version when the toggle is off", async () => {
    stubGit();
    const { onPublishNow } = renderBox();
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText('Saved "fix the thing" as abc123a.');
    expect(onPublishNow).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Publish now" }));
    expect(onPublishNow).toHaveBeenCalledTimes(1);
  });

  it("remembers the publish toggle across remounts, same key SaveVersionDialog reads", () => {
    localStorage.setItem(PUBLISH_AFTER_SAVE_STORAGE_KEY, "1");
    renderBox();
    expect(screen.getByRole("switch", { name: "Also publish" })).toHaveAttribute("aria-checked", "true");
  });

  it("shows the failure inline and offers a one-time retry without hooks", async () => {
    stubGit({ save: { reject: { code: "hook_rejected", message: "x", remediation: null, detail: "pre-commit exited 1" } } });
    renderBox({ runHooks: true });
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A Git hook rejected this version.");
    // Kept, not cleared — the whole point of an inline failure is to fix and
    // retry without retyping.
    expect(screen.getByLabelText("Version name")).toHaveValue("fix the thing");

    stubGit();
    await userEvent.click(screen.getByRole("button", { name: "Save without running the hooks" }));

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenLastCalledWith("save_version", expect.objectContaining({ runHooks: false })),
    );
    expect(await screen.findByText('Saved "fix the thing" as abc123a.')).toBeInTheDocument();
  });

  it("does not offer the hooks escape for a failure that never ran them", async () => {
    stubGit({ save: { reject: { code: "git_command_failed", message: "x", remediation: null, detail: null } } });
    renderBox();
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Save without running the hooks" }),
    ).not.toBeInTheDocument();
  });
});
