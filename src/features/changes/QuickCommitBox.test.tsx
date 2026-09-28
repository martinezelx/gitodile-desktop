import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    files: [],
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
  vi.restoreAllMocks();
  // `publishToo` reads this on mount, shared with SaveVersionDialog's own
  // checkbox — a test that checks the option must not leak that choice into
  // the next one.
  localStorage.removeItem(PUBLISH_AFTER_SAVE_STORAGE_KEY);
  localStorage.clear();
});

describe("QuickCommitBox", () => {
  // jsdom's `hasFocus()` is false in the middle of any blur, where a browser
  // answers true for as long as the window itself has focus. The box reads it
  // to tell "the window lost focus" from "the field did", so pin the browser's
  // answer; the one test about the window losing focus overrides it.
  beforeEach(() => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  it("starts closed, with Save beside the field, and costs Git nothing until it opens", async () => {
    stubGit({ plan: plan({ branch: "feature/journey" }) });
    const { container } = renderBox();
    expect(isExpanded(container)).toBe(false);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(mockedInvoke).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText("Version name"));
    expect(isExpanded(container)).toBe(true);
    // One plan read, stated in one line over the field: what the press will
    // save and the line it lands on — the panel header no longer names it.
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("2 files")).toBeInTheDocument();
    expect(screen.getByText("feature/journey")).toBeInTheDocument();
  });

  it("asks for no plan while nothing is selected to save", async () => {
    renderBox({ canSave: false });
    await userEvent.click(screen.getByLabelText("Version name"));
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("prints only the notes that apply to this plan, and counts a partial selection once", async () => {
    stubGit({ plan: plan({ totalFiles: 1, remainingFiles: 1, isPartial: true, isFirstVersion: true, branch: "main" }) });
    renderBox({ selectedPaths: ["a.txt"] });
    await userEvent.click(screen.getByLabelText("Version name"));

    // The plan line says what is left behind; the dialog's note for it would
    // count the same files a second time.
    expect(await screen.findByText("1 of 2 files")).toBeInTheDocument();
    expect(screen.queryByText("1 other file will remain as a pending change.")).not.toBeInTheDocument();
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
    await waitFor(() => expect(isExpanded(container)).toBe(false));

    await userEvent.click(title);
    await userEvent.type(title, "wip");
    await userEvent.click(elsewhere);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(isExpanded(container)).toBe(true);
  });

  it("lets a press elsewhere land before an empty box folds away", async () => {
    // Folding between a press and its release moved the file list under the
    // pointer, so the release landed on another row, or on none, and the
    // press was lost. The click has to reach what was pressed first.
    const fileListRef = React.createRef<HTMLDivElement>();
    let expandedWhenClicked: boolean | null = null;
    const { container } = render(
      <LanguageProvider>
        <button type="button" onClick={() => { expandedWhenClicked = isExpanded(container); }}>
          a file row
        </button>
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

    await userEvent.click(screen.getByLabelText("Version name"));
    await userEvent.click(screen.getByRole("button", { name: "a file row" }));

    expect(expandedWhenClicked).toBe(true);
    await waitFor(() => expect(isExpanded(container)).toBe(false));
  });

  it("keeps an empty box open when the window, not the box, loses focus", async () => {
    const { container } = renderBox();
    const title = screen.getByLabelText("Version name");
    await userEvent.click(title);
    // Minimized or behind another app: the page keeps its own focus on the
    // field and hands it back on return.
    vi.mocked(document.hasFocus).mockReturnValue(false);
    title.blur();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(isExpanded(container)).toBe(true);
  });

  it("stays open when an empty box is pressed somewhere that takes no focus", async () => {
    const { container } = renderBox();
    await userEvent.click(screen.getByLabelText("Version name"));
    expect(isExpanded(container)).toBe(true);

    // The option's words, not its circle: a label takes no focus of its own,
    // so pressing it used to hand focus to the page and fold an empty box
    // away under the pointer.
    await userEvent.click(screen.getByText("Also publish"));
    expect(isExpanded(container)).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Also publish" })).toBeChecked();

    // Save is disabled with nothing typed, and a disabled button takes no
    // focus either.
    await userEvent.click(screen.getByRole("button", { name: "Save and publish" }));
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
      const height = this.classList.contains("docked-composer--expanded") ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
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

      await userEvent.keyboard("{Escape}");
      expect(scrollElement.scrollTop).toBe(400);
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
    }
  });

  it("leaves the list where the reader scrolled it when a press elsewhere folds the box", async () => {
    // Moving focus inside an open box used to take a scroll snapshot nothing
    // consumed; the un-anchored fold after a press elsewhere then applied it,
    // and the list jumped back to where it stood at that earlier moment.
    const originalRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const rect = originalRect.call(this);
      if (!this.classList.contains("changes-quick-commit")) return rect;
      return { ...rect, height: this.classList.contains("docked-composer--expanded") ? 150 : 32 };
    };
    try {
      const fileListRef = React.createRef<HTMLDivElement>();
      render(
        <LanguageProvider>
          <button type="button">a file row</button>
          <div ref={fileListRef}>
            <QuickCommitBox
              projectPath="/repo"
              sessionEpoch="epoch-1"
              selectedPaths={null}
              canSave={false}
              runHooks={false}
              remoteLabel={null}
              fileListRef={fileListRef}
              onSaveCompleted={vi.fn()}
              onPublishNow={vi.fn()}
            />
          </div>
        </LanguageProvider>,
      );
      const list = fileListRef.current;
      if (!list) throw new Error("fileListRef never attached");
      list.scrollTop = 400;
      await userEvent.click(screen.getByLabelText("Version name"));
      await userEvent.click(screen.getByLabelText("More details (optional)"));
      list.scrollTop = 900;

      await userEvent.click(screen.getByRole("button", { name: "a file row" }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(list.scrollTop).toBe(900);
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
    }
  });

  it("Escape clears the draft and closes the box", async () => {
    const { container } = renderBox();
    const title = screen.getByLabelText("Version name");
    await userEvent.type(title, "half-written thought");
    await userEvent.type(screen.getByLabelText("More details (optional)"), "and some detail");

    await userEvent.keyboard("{Escape}");

    expect(title).toHaveValue("");
    expect(screen.getByLabelText("More details (optional)")).toHaveValue("");
    expect(isExpanded(container)).toBe(false);
  });

  it("saves with the typed title and description, then clears the draft", async () => {
    stubGit();
    const { onSaveCompleted } = renderBox({ selectedPaths: ["a.txt", "b.txt"] });
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    await userEvent.type(screen.getByLabelText("More details (optional)"), "some context");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText('Saved “fix the thing” as abc123a.')).toBeInTheDocument();
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

    expect(await screen.findByText('Saved “fix the thing” as abc123a.')).toBeInTheDocument();
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

  it("also hands off to Publish after saving when that is checked, and says so on the button", async () => {
    stubGit();
    const { onPublishNow } = renderBox();
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    await userEvent.click(screen.getByRole("checkbox", { name: "Also publish" }));

    // The button names the consequence: this press publishes too.
    await userEvent.click(screen.getByRole("button", { name: "Save and publish" }));

    await screen.findByText('Saved “fix the thing” as abc123a.');
    expect(onPublishNow).toHaveBeenCalledTimes(1);
    // The option already took the reader there; no second offer.
    expect(screen.queryByRole("button", { name: "Publish now" })).not.toBeInTheDocument();
  });

  it("offers the next step where the publish option stood, until the next draft starts", async () => {
    stubGit();
    const { onPublishNow } = renderBox();
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText('Saved “fix the thing” as abc123a.');
    expect(screen.queryByRole("checkbox", { name: "Also publish" })).not.toBeInTheDocument();
    expect(onPublishNow).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Publish now" }));
    expect(onPublishNow).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByLabelText("Version name"), "n");
    expect(await screen.findByRole("checkbox", { name: "Also publish" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish now" })).not.toBeInTheDocument();
  });

  it("says it is saving in a word that fits beside the publish option", async () => {
    mockedInvoke.mockImplementation((command) =>
      command === "plan_save_version" ? Promise.resolve(plan()) : new Promise(() => {}),
    );
    renderBox();
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("remembers the publish option across remounts, same key SaveVersionDialog reads", () => {
    localStorage.setItem(PUBLISH_AFTER_SAVE_STORAGE_KEY, "1");
    renderBox();
    expect(screen.getByRole("checkbox", { name: "Also publish" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save and publish" })).toBeInTheDocument();
  });

  it("shows the failure inline and offers a one-time retry without hooks", async () => {
    stubGit({ save: { reject: { code: "hook_rejected", message: "x", remediation: null, detail: "pre-commit exited 1" } } });
    renderBox({ runHooks: true });
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A Git hook rejected this version.");
    // The hook's own output, open from the start: it is the only thing that
    // says what to fix, and the box prints it the way the dialog does.
    expect(screen.getByText("pre-commit exited 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide technical details" })).toBeInTheDocument();
    // Kept, not cleared — the whole point of an inline failure is to fix and
    // retry without retyping.
    expect(screen.getByLabelText("Version name")).toHaveValue("fix the thing");

    stubGit();
    await userEvent.click(screen.getByRole("button", { name: "Save without running hooks" }));

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenLastCalledWith("save_version", expect.objectContaining({ runHooks: false })),
    );
    expect(await screen.findByText('Saved “fix the thing” as abc123a.')).toBeInTheDocument();
  });

  it("does not offer the hooks escape for a failure that never ran them", async () => {
    stubGit({ save: { reject: { code: "git_command_failed", message: "x", remediation: null, detail: "fatal: signing failed" } } });
    renderBox();
    await userEvent.type(screen.getByLabelText("Version name"), "fix the thing");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("alert");
    // Any other failure keeps Git's words one press away rather than open.
    expect(screen.queryByText("fatal: signing failed")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show technical details" }));
    expect(screen.getByText("fatal: signing failed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save without running hooks" }),
    ).not.toBeInTheDocument();
  });
});
