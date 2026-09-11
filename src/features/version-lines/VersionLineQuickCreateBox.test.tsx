import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import type { CreateVersionLinePlan, VersionLine, VersionLinesSnapshot } from "./domain";
import { VersionLineQuickCreateBox } from "./VersionLineQuickCreateBox";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

function plan(overrides: Partial<CreateVersionLinePlan> = {}): CreateVersionLinePlan {
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

function line(overrides: Partial<VersionLine> = {}): VersionLine {
  return {
    name: "main",
    tip: { commit: "main-commit", shortCommit: "main-com", subject: "first version", committedAt: "2026-07-01T00:00:00Z" },
    isActive: false,
    upstream: null,
    isRetainedElsewhere: false,
    uniqueCommitCount: null,
    worktreePath: null,
    upstreamAhead: null,
    upstreamBehind: null,
    upstreamGone: false,
    isDefault: false,
    ...overrides,
  };
}

function snapshot(): VersionLinesSnapshot {
  return {
    branch: "feature/z",
    headState: "branch",
    currentCommit: "abc123",
    lines: [],
    totalCount: 1,
    isTruncated: false,
    unreadableCount: 0,
  };
}

function renderBox(props: Partial<React.ComponentProps<typeof VersionLineQuickCreateBox>> = {}) {
  const onOperationStart = vi.fn(() => true);
  const onOperationFinish = vi.fn();
  const onOperationPhaseChange = vi.fn();
  const onCreated = vi.fn();
  const listRef = React.createRef<HTMLDivElement>();
  const utils = render(
    <LanguageProvider>
      <div ref={listRef}>
        <VersionLineQuickCreateBox
          projectPath="/repo"
          sessionEpoch="epoch-1"
          forceSwitch={false}
          mainLine={null}
          activeLine={null}
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
  return container.querySelector(".version-lines-quick-create")?.className.includes("--expanded") ?? false;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("VersionLineQuickCreateBox", () => {
  it("starts closed and opens on focus, without asking Git for anything", async () => {
    const { container } = renderBox();
    expect(isExpanded(container)).toBe(false);
    expect(mockedInvoke).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText("New line name"));
    expect(isExpanded(container)).toBe(true);
  });

  it("closes again on blur when left empty, but not while a draft is there", async () => {
    const { container } = renderBox();
    render(<button type="button">elsewhere</button>);
    const name = screen.getByLabelText("New line name");
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });

    await userEvent.click(name);
    expect(isExpanded(container)).toBe(true);
    await userEvent.click(elsewhere);
    expect(isExpanded(container)).toBe(false);

    await userEvent.click(name);
    await userEvent.type(name, "feature/z");
    await userEvent.click(elsewhere);
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
      if (!this.classList.contains("version-lines-quick-create")) {
        return rect;
      }
      const height = this.classList.contains("version-lines-quick-create--expanded")
        ? EXPANDED_HEIGHT
        : COLLAPSED_HEIGHT;
      return { ...rect, height };
    };
    try {
      const listRef = React.createRef<HTMLDivElement>();
      render(
        <LanguageProvider>
          <div ref={listRef}>
            <VersionLineQuickCreateBox
              projectPath="/repo"
              sessionEpoch="epoch-1"
              forceSwitch={false}
              mainLine={null}
              activeLine={null}
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

      await userEvent.click(screen.getByLabelText("New line name"));
      expect(scrollElement.scrollTop).toBe(300 + (EXPANDED_HEIGHT - COLLAPSED_HEIGHT));

      await userEvent.click(screen.getByRole("button", { name: "Discard draft" }));
      expect(scrollElement.scrollTop).toBe(300);
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
    }
  });

  it("the dismiss button clears the draft and closes the box", async () => {
    const { container } = renderBox();
    const name = screen.getByLabelText("New line name");
    await userEvent.type(name, "feature/z");

    await userEvent.click(screen.getByRole("button", { name: "Discard draft" }));

    expect(name).toHaveValue("");
    expect(isExpanded(container)).toBe(false);
  });

  it("Escape does the same as the dismiss button", async () => {
    const { container } = renderBox();
    const name = screen.getByLabelText("New line name");
    await userEvent.type(name, "feature/z");

    await userEvent.keyboard("{Escape}");

    expect(name).toHaveValue("");
    expect(isExpanded(container)).toBe(false);
  });

  it("creates and switches by default, then clears the draft", async () => {
    const { onOperationStart, onOperationPhaseChange, onCreated } = renderBox();
    await userEvent.type(screen.getByLabelText("New line name"), "feature/z");

    mockedInvoke.mockResolvedValueOnce(plan());
    mockedInvoke.mockResolvedValueOnce(snapshot());
    await userEvent.click(screen.getByRole("button", { name: "Create line" }));

    expect(await screen.findByText("Created “feature/z” and switched to it.")).toBeInTheDocument();
    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "plan_create_version_line", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      name: "feature/z",
      switch: true,
      startCommit: null,
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "create_version_line", {
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
    expect(screen.getByLabelText("New line name")).toHaveValue("");
  });

  it("submits on Enter in the name field", async () => {
    renderBox();
    await userEvent.type(screen.getByLabelText("New line name"), "feature/z");

    mockedInvoke.mockResolvedValueOnce(plan());
    mockedInvoke.mockResolvedValueOnce(snapshot());
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("Created “feature/z” and switched to it.")).toBeInTheDocument();
  });

  it("creates without switching when the toggle is off", async () => {
    renderBox();
    await userEvent.type(screen.getByLabelText("New line name"), "feature/z");
    await userEvent.click(screen.getByRole("switch", { name: "Switch to it" }));

    mockedInvoke.mockResolvedValueOnce(plan({ willSwitch: false }));
    mockedInvoke.mockResolvedValueOnce(snapshot());
    await userEvent.click(screen.getByRole("button", { name: "Create line" }));

    expect(await screen.findByText("Created “feature/z”.")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenNthCalledWith(
      1,
      "plan_create_version_line",
      expect.objectContaining({ switch: false }),
    );
  });

  it("does nothing without a name, even if Create is reached some other way", async () => {
    renderBox();
    expect(screen.getByRole("button", { name: "Create line" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("New line name"), "  ");
    expect(screen.getByRole("button", { name: "Create line" })).toBeDisabled();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("does nothing when another session already owns a mutation", async () => {
    const onOperationStart = vi.fn(() => false);
    renderBox({ onOperationStart });
    await userEvent.type(screen.getByLabelText("New line name"), "feature/z");

    await userEvent.click(screen.getByRole("button", { name: "Create line" }));

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("on a detached HEAD, hides the switch choice and forces it on", async () => {
    renderBox({ forceSwitch: true });
    await userEvent.click(screen.getByLabelText("New line name"));

    expect(screen.queryByRole("switch", { name: "Switch to it" })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "This project isn't on a version line right now, so GitOdile will switch to the new one to keep this commit easy to find.",
      ),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("New line name"), "recover/here");
    mockedInvoke.mockResolvedValueOnce(plan({ name: "recover/here", willSwitch: true }));
    mockedInvoke.mockResolvedValueOnce(snapshot());
    await userEvent.click(screen.getByRole("button", { name: "Create line" }));

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenNthCalledWith(
        1,
        "plan_create_version_line",
        expect.objectContaining({ switch: true }),
      ),
    );
  });

  it("shows the failure inline, keeps the typed name, and releases the lock immediately", async () => {
    const { onOperationStart, onOperationFinish } = renderBox();
    await userEvent.type(screen.getByLabelText("New line name"), "feature/z");

    mockedInvoke.mockRejectedValueOnce({
      code: "git_command_failed",
      message: "x",
      remediation: null,
      detail: null,
    });
    await userEvent.click(screen.getByRole("button", { name: "Create line" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("New line name")).toHaveValue("feature/z");
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
    await userEvent.click(screen.getByRole("button", { name: "Create line" }));

    expect(await screen.findByText("Created “feature/z” and switched to it.")).toBeInTheDocument();
    expect(onOperationStart).toHaveBeenCalledTimes(2);
  });

  describe("choosing the starting line", () => {
    it("offers no choice, and starts from the active line, when main and active are the same commit", async () => {
      const shared = line({ name: "main", tip: { ...line().tip, commit: "shared-commit" }, isDefault: true, isActive: true });
      renderBox({ mainLine: shared, activeLine: shared });
      await userEvent.click(screen.getByLabelText("New line name"));

      expect(screen.queryByText("Main line")).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText("New line name"), "feature/z");
      mockedInvoke.mockResolvedValueOnce(plan());
      mockedInvoke.mockResolvedValueOnce(snapshot());
      await userEvent.click(screen.getByRole("button", { name: "Create line" }));

      await waitFor(() =>
        expect(mockedInvoke).toHaveBeenNthCalledWith(
          1,
          "plan_create_version_line",
          expect.objectContaining({ startCommit: "shared-commit" }),
        ),
      );
    });

    it("offers a choice when main and active differ, defaulting to the active line", async () => {
      const main = line({ name: "main", tip: { ...line().tip, commit: "main-commit" }, isDefault: true });
      const activeLine = line({ name: "feature/other", tip: { ...line().tip, commit: "other-commit" }, isActive: true });
      renderBox({ mainLine: main, activeLine });
      await userEvent.click(screen.getByLabelText("New line name"));

      expect(screen.getByRole("radio", { name: "Main line" })).toBeInTheDocument();
      const activeOption = screen.getByRole("radio", { name: "feature/other" });
      expect(activeOption).toHaveAttribute("aria-checked", "true");

      await userEvent.type(screen.getByLabelText("New line name"), "feature/z");
      mockedInvoke.mockResolvedValueOnce(plan());
      mockedInvoke.mockResolvedValueOnce(snapshot());
      await userEvent.click(screen.getByRole("button", { name: "Create line" }));

      await waitFor(() =>
        expect(mockedInvoke).toHaveBeenNthCalledWith(
          1,
          "plan_create_version_line",
          expect.objectContaining({ startCommit: "other-commit" }),
        ),
      );
    });

    it("does not collapse the box when a source option is clicked with no name typed yet", async () => {
      // The bug the segmented control replaced `FilterCapsule` to fix: a
      // label wrapping a hidden radio input didn't reliably carry
      // `relatedTarget` on blur, so clicking it while the name field was
      // empty read as focus leaving the box entirely and collapsed it.
      const main = line({ name: "main", tip: { ...line().tip, commit: "main-commit" }, isDefault: true });
      const activeLine = line({ name: "feature/other", tip: { ...line().tip, commit: "other-commit" }, isActive: true });
      const { container } = renderBox({ mainLine: main, activeLine });
      await userEvent.click(screen.getByLabelText("New line name"));
      expect(container.querySelector(".version-lines-quick-create")?.className).toContain("--expanded");

      await userEvent.click(screen.getByRole("radio", { name: "Main line" }));

      expect(container.querySelector(".version-lines-quick-create")?.className).toContain("--expanded");
      expect(screen.getByRole("radio", { name: "Main line" })).toHaveAttribute("aria-checked", "true");
    });

    it("switches to the default line's commit when 'Main line' is chosen", async () => {
      const main = line({ name: "main", tip: { ...line().tip, commit: "main-commit" }, isDefault: true });
      const activeLine = line({ name: "feature/other", tip: { ...line().tip, commit: "other-commit" }, isActive: true });
      renderBox({ mainLine: main, activeLine });
      await userEvent.click(screen.getByLabelText("New line name"));
      await userEvent.click(screen.getByRole("radio", { name: "Main line" }));

      await userEvent.type(screen.getByLabelText("New line name"), "feature/z");
      mockedInvoke.mockResolvedValueOnce(plan({ startingCommit: "main-commit", fromSavedVersion: true }));
      mockedInvoke.mockResolvedValueOnce(snapshot());
      await userEvent.click(screen.getByRole("button", { name: "Create line" }));

      await waitFor(() =>
        expect(mockedInvoke).toHaveBeenNthCalledWith(
          1,
          "plan_create_version_line",
          expect.objectContaining({ startCommit: "main-commit" }),
        ),
      );
      await waitFor(() =>
        expect(mockedInvoke).toHaveBeenNthCalledWith(
          2,
          "create_version_line",
          expect.objectContaining({ startCommit: "main-commit" }),
        ),
      );
    });

    it("hides the choice on a detached HEAD and always starts from where the project stands", async () => {
      const main = line({ name: "main", tip: { ...line().tip, commit: "main-commit" }, isDefault: true });
      const activeLine = line({ name: "feature/other", tip: { ...line().tip, commit: "other-commit" } });
      renderBox({ forceSwitch: true, mainLine: main, activeLine });
      await userEvent.click(screen.getByLabelText("New line name"));

      expect(screen.queryByText("Main line")).not.toBeInTheDocument();
      expect(screen.queryByText("feature/other")).not.toBeInTheDocument();

      await userEvent.type(screen.getByLabelText("New line name"), "recovered");
      mockedInvoke.mockResolvedValueOnce(plan({ name: "recovered" }));
      mockedInvoke.mockResolvedValueOnce(snapshot());
      await userEvent.click(screen.getByRole("button", { name: "Create line" }));

      await waitFor(() =>
        expect(mockedInvoke).toHaveBeenNthCalledWith(
          1,
          "plan_create_version_line",
          expect.objectContaining({ startCommit: null }),
        ),
      );
    });
  });
});
