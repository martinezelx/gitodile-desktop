import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "./i18n";
import { DeleteVersionLineDialog, SwitchVersionLineDialog } from "./versionLinesDialog";
import type { DeleteVersionLinePlan, SwitchVersionLinePlan, VersionLinesSnapshot } from "./versionLines";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function switchPlan(overrides: Partial<SwitchVersionLinePlan> = {}): SwitchVersionLinePlan {
  return {
    operationKind: "local-mutation",
    summary: "Switch",
    steps: [],
    risks: [],
    recovery: "\"main\" stays exactly as it is.",
    requiresConfirmation: true,
    stateToken: "switch-token",
    from: "main",
    to: "feature/x",
    fromCommit: "abc123",
    toCommit: "def456",
    changedFiles: ["a.txt"],
    changedFilesTotal: 1,
    ...overrides,
  };
}

function emptySnapshot(): VersionLinesSnapshot {
  return { branch: "feature/x", headState: "branch", currentCommit: "def456", lines: [], totalCount: 0, isTruncated: false };
}

describe("SwitchVersionLineDialog", () => {
  it("offers Save version and New version line when the project is dirty", async () => {
    mockedInvoke.mockRejectedValueOnce({
      code: "dirty_working_tree",
      message: "dirty",
      remediation: null,
    });
    const onSaveVersion = vi.fn();
    const onCreateWithWork = vi.fn();
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <SwitchVersionLineDialog
          isOpen
          projectPath="/repo"
          target="feature/x"
          onClose={onClose}
          onSwitched={vi.fn()}
          onSaveVersion={onSaveVersion}
          onCreateWithWork={onCreateWithWork}
        />
      </LanguageProvider>,
    );

    const newLineButton = await screen.findByRole("button", { name: "New version line with this work" });
    await userEvent.setup().click(newLineButton);
    expect(onClose).toHaveBeenCalled();
    expect(onCreateWithWork).toHaveBeenCalled();
  });

  it("switches on confirm and reports the resulting snapshot", async () => {
    mockedInvoke.mockResolvedValueOnce(switchPlan());
    mockedInvoke.mockResolvedValueOnce(emptySnapshot());
    const onSwitched = vi.fn();
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <SwitchVersionLineDialog
          isOpen
          projectPath="/repo"
          target="feature/x"
          onClose={vi.fn()}
          onSwitched={onSwitched}
          onSaveVersion={vi.fn()}
          onCreateWithWork={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(await screen.findByText("1 file will change.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Switch" }));

    await waitFor(() => expect(onSwitched).toHaveBeenCalledWith(emptySnapshot()));
    expect(mockedInvoke).toHaveBeenCalledWith("switch_version_line", {
      path: "/repo",
      target: "feature/x",
      stateToken: "switch-token",
    });
  });
});

function deletePlan(overrides: Partial<DeleteVersionLinePlan> = {}): DeleteVersionLinePlan {
  return {
    operationKind: "destructive",
    summary: "Delete",
    steps: [],
    risks: [],
    recovery: "Reachable from: refs/heads/main",
    requiresConfirmation: true,
    stateToken: "delete-token",
    name: "feature/x",
    tipCommit: "def456",
    retainedBy: ["refs/heads/main"],
    upstream: null,
    ...overrides,
  };
}

describe("DeleteVersionLineDialog", () => {
  it("shows the retained-by proof and deletes on confirm", async () => {
    mockedInvoke.mockResolvedValueOnce(deletePlan());
    mockedInvoke.mockResolvedValueOnce(emptySnapshot());
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <DeleteVersionLineDialog
          isOpen
          projectPath="/repo"
          target="feature/x"
          onClose={vi.fn()}
          onDeleted={onDeleted}
        />
      </LanguageProvider>,
    );

    expect(await screen.findByText(/refs\/heads\/main/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(emptySnapshot()));
  });

  it("blocks deletion of unique work and offers no destructive action", async () => {
    mockedInvoke.mockRejectedValueOnce({
      code: "version_line_unique_work",
      message: "unique work",
      remediation: null,
    });
    render(
      <LanguageProvider>
        <DeleteVersionLineDialog
          isOpen
          projectPath="/repo"
          target="feature/x"
          onClose={vi.fn()}
          onDeleted={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(
      await screen.findByText(
        "This version line has saved work that isn't reachable from any other version line or remote yet.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
