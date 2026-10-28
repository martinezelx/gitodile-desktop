import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import type { CreateBranchPlan, Branch, BranchesSnapshot } from "./domain";
import { BranchQuickCreateBox } from "./BranchQuickCreateBox";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

function plan(overrides: Partial<CreateBranchPlan> = {}): CreateBranchPlan {
  return {
    operationKind: "local-mutation",
    summary: "Create and switch",
    steps: [],
    risks: [],
    recovery: "",
    requiresConfirmation: true,
    stateToken: "create-token",
    name: "feature/z",
    headState: "branch",
    startingCommit: "abc123",
    fromSavedVersion: false,
    willSwitch: true,
    hasUnsavedWork: false,
    ...overrides,
  };
}

function branch(overrides: Partial<Branch> = {}): Branch {
  return {
    name: "main",
    tip: { commit: "main-commit", shortCommit: "main-com", subject: "first version", committedAt: "2026-07-01T00:00:00Z" },
    isActive: false,
    upstream: null,
    isRetainedElsewhere: false,
    isFinished: false,
    uniqueCommitCount: null,
    worktreePath: null,
    upstreamAhead: null,
    upstreamBehind: null,
    upstreamGone: false,
    isDefault: false,
    ...overrides,
  };
}

function snapshot(): BranchesSnapshot {
  return {
    branch: "feature/z",
    headState: "branch",
    currentCommit: "abc123",
    branches: [],
    totalCount: 1,
    isTruncated: false,
    unreadableCount: 0,
  };
}

function renderBox(props: Partial<React.ComponentProps<typeof BranchQuickCreateBox>> = {}) {
  const onOperationStart = vi.fn(() => true);
  const onOperationFinish = vi.fn();
  const onOperationPhaseChange = vi.fn();
  const onCreated = vi.fn();
  const listRef = React.createRef<HTMLDivElement>();
  const utils = render(
    <LanguageProvider>
      <div ref={listRef}>
        <BranchQuickCreateBox
          projectPath="/repo"
          sessionEpoch="epoch-1"
          forceSwitch={false}
          mainBranch={null}
          activeBranch={null}
          existingNames={[]}
          listRef={listRef}
          onOperationStart={onOperationStart}
          onOperationFinish={onOperationFinish}
          onOperationPhaseChange={onOperationPhaseChange}
          onCreated={onCreated}
          {...props}
        />
      </div>
    </LanguageProvider>,
  );
  return { onOperationStart, onOperationFinish, onOperationPhaseChange, onCreated, ...utils };
}

function isExpanded(container: HTMLElement): boolean {
  return container.querySelector(".branches-quick-create")?.className.includes("--expanded") ?? false;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("BranchQuickCreateBox", () => {
  // jsdom's `hasFocus()` is false in the middle of any blur, where a browser
  // answers true for as long as the window itself has focus; the shared
  // `useDockedComposerFocus` reads it. Pin the browser's answer.
  beforeEach(() => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  it("starts closed, with its button beside the field, and opens on focus without asking Git for anything", async () => {
    const { container } = renderBox();
    expect(isExpanded(container)).toBe(false);
    expect(screen.getByRole("button", { name: "Create and switch" })).toBeDisabled();
    expect(mockedInvoke).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText("New branch name"));
    expect(isExpanded(container)).toBe(true);
  });

  it("says where the new branch starts, over the field", async () => {
    const shared = branch({ name: "main", tip: { ...branch().tip, commit: "shared-commit" }, isDefault: true, isActive: true });
    renderBox({ mainBranch: shared, activeBranch: shared });
    await userEvent.click(screen.getByLabelText("New branch name"));

    expect(screen.getByText("Create from")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("stays open when an empty box is pressed on the switch option's words", async () => {
    const { container } = renderBox();
    await userEvent.click(screen.getByLabelText("New branch name"));

    // A label takes no focus of its own, so pressing its words used to hand
    // focus to the page and fold an empty box away under the pointer.
    await userEvent.click(screen.getByText("Switch to it"));

    expect(isExpanded(container)).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Switch to it" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Create branch" })).toBeInTheDocument();
  });

  it("closes again on blur when left empty, but not while a draft is there", async () => {
    const { container } = renderBox();
    render(<button type="button">elsewhere</button>);
    const name = screen.getByLabelText("New branch name");
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });

    await userEvent.click(name);
    expect(isExpanded(container)).toBe(true);
    await userEvent.click(elsewhere);
    await waitFor(() => expect(isExpanded(container)).toBe(false));

    await userEvent.click(name);
    await userEvent.type(name, "feature/z");
    await userEvent.click(elsewhere);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(isExpanded(container)).toBe(true);
  });

  it("shifts the list's scroll position by exactly this box's own height change, and reverses it on close", async () => {
    // Same technique as QuickCommitBox.test.tsx: the shared jsdom stub gives
    // every element a fixed size, so this patches just this box's own
    // measured height to observe the real correction.
    const originalRect = Element.prototype.getBoundingClientRect;
    const COLLAPSED_HEIGHT = 32;
    const EXPANDED_HEIGHT = 140;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const rect = originalRect.call(this);
      if (!this.classList.contains("branches-quick-create")) {
        return rect;
      }
      const height = this.classList.contains("docked-composer--expanded")
        ? EXPANDED_HEIGHT
        : COLLAPSED_HEIGHT;
      return { ...rect, height };
    };
    try {
      const listRef = React.createRef<HTMLDivElement>();
      render(
        <LanguageProvider>
          <div ref={listRef}>
            <BranchQuickCreateBox
              projectPath="/repo"
              sessionEpoch="epoch-1"
              forceSwitch={false}
              mainBranch={null}
              activeBranch={null}
              existingNames={[]}
              listRef={listRef}
              onOperationStart={vi.fn(() => true)}
              onOperationFinish={vi.fn()}
              onOperationPhaseChange={vi.fn()}
              onCreated={vi.fn()}
            />
          </div>
        </LanguageProvider>,
      );
      const scrollElement = listRef.current;
      if (!scrollElement) throw new Error("listRef never attached");
      scrollElement.scrollTop = 300;

      await userEvent.click(screen.getByLabelText("New branch name"));
      expect(scrollElement.scrollTop).toBe(300 + (EXPANDED_HEIGHT - COLLAPSED_HEIGHT));

      await userEvent.keyboard("{Escape}");
      expect(scrollElement.scrollTop).toBe(300);
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
    }
  });

  it.each(["Escape", "close button"])("%s folds without losing the draft or options and can reopen", async (method) => {
    const { container } = renderBox();
    expect(screen.queryByRole("button", { name: "Close create branch form" })).not.toBeInTheDocument();
    const name = screen.getByLabelText("New branch name");
    await userEvent.type(name, "feature/z");

    await userEvent.click(screen.getByRole("checkbox", { name: "Switch to it" }));
    if (method === "Escape") await userEvent.keyboard("{Escape}");
    else await userEvent.click(screen.getByRole("button", { name: "Close create branch form" }));

    expect(name).toHaveValue("feature/z");
    expect(screen.getByRole("checkbox", { name: "Switch to it" })).not.toBeChecked();
    expect(isExpanded(container)).toBe(false);
    expect(container.querySelector(".branches-quick-create")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Close create branch form" })).not.toBeInTheDocument();
    await userEvent.tab();
    expect(name).toHaveFocus();
    expect(isExpanded(container)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Close create branch form" }));
    await userEvent.click(name);
    expect(isExpanded(container)).toBe(true);
  });

  it("cannot close while creation is in flight", async () => {
    mockedInvoke.mockImplementation(() => new Promise(() => {}));
    const { container } = renderBox();
    await userEvent.type(screen.getByLabelText("New branch name"), "feature/z");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Close create branch form" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(isExpanded(container)).toBe(true);
  });

  it("creates and switches by default, then clears the draft", async () => {
    const { onOperationStart, onOperationPhaseChange, onCreated } = renderBox();
    await userEvent.type(screen.getByLabelText("New branch name"), "feature/z");

    mockedInvoke.mockResolvedValueOnce(plan());
    mockedInvoke.mockResolvedValueOnce(snapshot());
    await userEvent.click(screen.getByRole("button", { name: "Create and switch" }));

    expect(await screen.findByText("Created “feature/z” and switched to it.")).toBeInTheDocument();
    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "plan_create_branch", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      name: "feature/z",
      switch: true,
      startCommit: null,
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "create_branch", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      name: "feature/z",
      switch: true,
      startCommit: null,
      stateToken: "create-token",
    });
    expect(onOperationPhaseChange).toHaveBeenCalledWith("planning");
    expect(onOperationPhaseChange).toHaveBeenCalledWith("executing");
    expect(onOperationPhaseChange).toHaveBeenCalledWith("success");
    expect(onCreated).toHaveBeenCalledWith(snapshot());
    expect(screen.getByLabelText("New branch name")).toHaveValue("");
  });

  it("submits on Enter in the name field", async () => {
    renderBox();
    await userEvent.type(screen.getByLabelText("New branch name"), "feature/z");

    mockedInvoke.mockResolvedValueOnce(plan());
    mockedInvoke.mockResolvedValueOnce(snapshot());
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("Created “feature/z” and switched to it.")).toBeInTheDocument();
  });

  it("creates without switching when that is unchecked, and says so on the button", async () => {
    renderBox();
    await userEvent.type(screen.getByLabelText("New branch name"), "feature/z");
    await userEvent.click(screen.getByRole("checkbox", { name: "Switch to it" }));

    mockedInvoke.mockResolvedValueOnce(plan({ willSwitch: false }));
    mockedInvoke.mockResolvedValueOnce(snapshot());
    await userEvent.click(screen.getByRole("button", { name: "Create branch" }));

    expect(await screen.findByText("Created “feature/z”.")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenNthCalledWith(
      1,
      "plan_create_branch",
      expect.objectContaining({ switch: false }),
    );
  });

  it("says at once what Git would refuse in a name, and holds the button", async () => {
    renderBox();
    const field = screen.getByLabelText("New branch name");
    await userEvent.type(field, "my branch");

    expect(screen.getByText("Use hyphens instead of spaces, like my-branch.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Create and switch" })).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, "my-branch");
    expect(screen.queryByText(/can't contain spaces/)).not.toBeInTheDocument();
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  it("warns about a branch that already exists, exactly or by letter case", async () => {
    renderBox({ existingNames: ["main", "Fix/Typo"] });
    const field = screen.getByLabelText("New branch name");

    await userEvent.type(field, "main");
    expect(screen.getByText("A branch named “main” already exists.")).toBeInTheDocument();

    await userEvent.clear(field);
    await userEvent.type(field, "fix/typo");
    expect(screen.getByText(/“Fix\/Typo” already exists/)).toBeInTheDocument();
  });

  it("leaves a half-typed ending alone until the reader asks to create, then asks Git for nothing", async () => {
    const { onOperationStart } = renderBox();
    const field = screen.getByLabelText("New branch name");
    await userEvent.type(field, "feature/");

    expect(screen.queryByText("Names can't end with “/”.")).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");

    expect(screen.getByText("Names can't end with “/”.")).toBeInTheDocument();
    expect(onOperationStart).not.toHaveBeenCalled();
    expect(mockedInvoke).not.toHaveBeenCalled();

    // Typing on is what fixes it, and clears the note straight away.
    await userEvent.type(field, "x");
    expect(screen.queryByText("Names can't end with “/”.")).not.toBeInTheDocument();
  });

  it("checks the name as it is sent, so a stray trailing space is no error", async () => {
    renderBox();
    await userEvent.type(screen.getByLabelText("New branch name"), "feature/z ");
    expect(screen.queryByText(/can't contain spaces/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create and switch" })).toBeEnabled();
  });

  it("asks what the branch is for, and takes its example from the prefix the project's branches share", () => {
    renderBox({ existingNames: ["main", "fix/a", "fix/b", "docs/c"] });
    expect(screen.getByLabelText("New branch name")).toHaveAttribute("placeholder", "What will you work on?");
    expect(screen.getByText("fix/short-name")).toBeInTheDocument();
  });

  it("keeps the generic example when the project has no convention yet, until a name is typed", async () => {
    renderBox({ existingNames: ["main", "fix/a"] });
    expect(screen.getByText("feature/new-feature")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New branch name"), "feature/z");
    expect(screen.queryByText("feature/new-feature")).not.toBeInTheDocument();
  });

  it("does nothing without a name, even if Create is reached some other way", async () => {
    renderBox();
    expect(screen.getByRole("button", { name: "Create and switch" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("New branch name"), "  ");
    expect(screen.getByRole("button", { name: "Create and switch" })).toBeDisabled();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("does nothing when another session already owns a mutation", async () => {
    const onOperationStart = vi.fn(() => false);
    renderBox({ onOperationStart });
    await userEvent.type(screen.getByLabelText("New branch name"), "feature/z");

    await userEvent.click(screen.getByRole("button", { name: "Create and switch" }));

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("on a detached HEAD, hides the switch choice and forces it on", async () => {
    renderBox({ forceSwitch: true });
    await userEvent.click(screen.getByLabelText("New branch name"));

    expect(screen.queryByRole("checkbox", { name: "Switch to it" })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "You're not on a branch, so you'll switch to the new one to keep this work easy to find.",
      ),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("New branch name"), "recover/here");
    mockedInvoke.mockResolvedValueOnce(plan({ name: "recover/here", willSwitch: true }));
    mockedInvoke.mockResolvedValueOnce(snapshot());
    await userEvent.click(screen.getByRole("button", { name: "Create and switch" }));

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenNthCalledWith(
        1,
        "plan_create_branch",
        expect.objectContaining({ switch: true }),
      ),
    );
  });

  it("shows the failure inline, keeps the typed name, and releases the lock immediately", async () => {
    const { onOperationStart, onOperationFinish } = renderBox();
    await userEvent.type(screen.getByLabelText("New branch name"), "feature/z");

    mockedInvoke.mockRejectedValueOnce({
      code: "git_command_failed",
      message: "x",
      remediation: null,
      detail: null,
    });
    await userEvent.click(screen.getByRole("button", { name: "Create and switch" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("New branch name")).toHaveValue("feature/z");
    expect(onOperationStart).toHaveBeenCalledOnce();
    // Released right away, not held silently: this box is not a modal, so
    // nothing forces the reader to see or dismiss the failure before doing
    // something else (switching projects, opening Settings) — see the
    // component's own doc.
    expect(onOperationFinish).toHaveBeenCalledOnce();

    // A retry asks for the lock again, correctly: nothing was mutated by the
    // failed attempt, so there is no claim from it worth reusing.
    mockedInvoke.mockResolvedValueOnce(plan());
    mockedInvoke.mockResolvedValueOnce(snapshot());
    await userEvent.click(screen.getByRole("button", { name: "Create and switch" }));

    expect(await screen.findByText("Created “feature/z” and switched to it.")).toBeInTheDocument();
    expect(onOperationStart).toHaveBeenCalledTimes(2);
  });

  describe("choosing the starting branch", () => {
    it("offers no choice, and starts from the active branch, when main and active are the same commit", async () => {
      const shared = branch({ name: "main", tip: { ...branch().tip, commit: "shared-commit" }, isDefault: true, isActive: true });
      renderBox({ mainBranch: shared, activeBranch: shared });
      await userEvent.click(screen.getByLabelText("New branch name"));

      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText("New branch name"), "feature/z");
      mockedInvoke.mockResolvedValueOnce(plan());
      mockedInvoke.mockResolvedValueOnce(snapshot());
      await userEvent.click(screen.getByRole("button", { name: "Create and switch" }));

      await waitFor(() =>
        expect(mockedInvoke).toHaveBeenNthCalledWith(
          1,
          "plan_create_branch",
          expect.objectContaining({ startCommit: "shared-commit" }),
        ),
      );
    });

    it("offers a choice when main and active differ, defaulting to the active branch", async () => {
      const main = branch({ name: "main", tip: { ...branch().tip, commit: "main-commit" }, isDefault: true });
      const activeBranch = branch({ name: "feature/other", tip: { ...branch().tip, commit: "other-commit" }, isActive: true });
      renderBox({ mainBranch: main, activeBranch });
      await userEvent.click(screen.getByLabelText("New branch name"));

      // Both by name, the main one telling what it is on its tooltip.
      expect(screen.getByRole("radio", { name: "main" })).toHaveAttribute("data-tooltip", "Main branch");
      const activeOption = screen.getByRole("radio", { name: "feature/other" });
      expect(activeOption).toHaveAttribute("aria-checked", "true");

      await userEvent.type(screen.getByLabelText("New branch name"), "feature/z");
      mockedInvoke.mockResolvedValueOnce(plan());
      mockedInvoke.mockResolvedValueOnce(snapshot());
      await userEvent.click(screen.getByRole("button", { name: "Create and switch" }));

      await waitFor(() =>
        expect(mockedInvoke).toHaveBeenNthCalledWith(
          1,
          "plan_create_branch",
          expect.objectContaining({ startCommit: "other-commit" }),
        ),
      );
    });

    it("does not collapse the box when a source option is clicked with no name typed yet", async () => {
      // The bug the segmented control replaced `FilterCapsule` to fix: a
      // label wrapping a hidden radio input didn't reliably carry
      // `relatedTarget` on blur, so clicking it while the name field was
      // empty read as focus leaving the box entirely and collapsed it.
      const main = branch({ name: "main", tip: { ...branch().tip, commit: "main-commit" }, isDefault: true });
      const activeBranch = branch({ name: "feature/other", tip: { ...branch().tip, commit: "other-commit" }, isActive: true });
      const { container } = renderBox({ mainBranch: main, activeBranch });
      await userEvent.click(screen.getByLabelText("New branch name"));
      expect(container.querySelector(".branches-quick-create")?.className).toContain("--expanded");

      await userEvent.click(screen.getByRole("radio", { name: "main" }));

      expect(container.querySelector(".branches-quick-create")?.className).toContain("--expanded");
      expect(screen.getByRole("radio", { name: "main" })).toHaveAttribute("aria-checked", "true");
    });

    it("switches to the default branch's commit when the main branch is chosen", async () => {
      const main = branch({ name: "main", tip: { ...branch().tip, commit: "main-commit" }, isDefault: true });
      const activeBranch = branch({ name: "feature/other", tip: { ...branch().tip, commit: "other-commit" }, isActive: true });
      renderBox({ mainBranch: main, activeBranch });
      await userEvent.click(screen.getByLabelText("New branch name"));
      await userEvent.click(screen.getByRole("radio", { name: "main" }));

      await userEvent.type(screen.getByLabelText("New branch name"), "feature/z");
      mockedInvoke.mockResolvedValueOnce(plan({ startingCommit: "main-commit", fromSavedVersion: true }));
      mockedInvoke.mockResolvedValueOnce(snapshot());
      await userEvent.click(screen.getByRole("button", { name: "Create and switch" }));

      await waitFor(() =>
        expect(mockedInvoke).toHaveBeenNthCalledWith(
          1,
          "plan_create_branch",
          expect.objectContaining({ startCommit: "main-commit" }),
        ),
      );
      await waitFor(() =>
        expect(mockedInvoke).toHaveBeenNthCalledWith(
          2,
          "create_branch",
          expect.objectContaining({ startCommit: "main-commit" }),
        ),
      );
    });

    it("hides the choice on a detached HEAD and always starts from where the project stands", async () => {
      const main = branch({ name: "main", tip: { ...branch().tip, commit: "main-commit" }, isDefault: true });
      const activeBranch = branch({ name: "feature/other", tip: { ...branch().tip, commit: "other-commit" } });
      renderBox({ forceSwitch: true, mainBranch: main, activeBranch });
      await userEvent.click(screen.getByLabelText("New branch name"));

      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
      expect(screen.queryByText("feature/other")).not.toBeInTheDocument();

      await userEvent.type(screen.getByLabelText("New branch name"), "recovered");
      mockedInvoke.mockResolvedValueOnce(plan({ name: "recovered" }));
      mockedInvoke.mockResolvedValueOnce(snapshot());
      await userEvent.click(screen.getByRole("button", { name: "Create and switch" }));

      await waitFor(() =>
        expect(mockedInvoke).toHaveBeenNthCalledWith(
          1,
          "plan_create_branch",
          expect.objectContaining({ startCommit: null }),
        ),
      );
    });
  });
});
