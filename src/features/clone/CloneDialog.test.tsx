import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { CloneDialog } from "./CloneDialog";
import { createCloneController } from "./controller";
import type { ClonePlan, CloneResult } from "./domain";
import type { ClonePort } from "./port";

const plan: ClonePlan = {
  operationKind: "local-mutation",
  requiresConfirmation: true,
  operationId: "op-1",
  stateToken: "state-1",
  sourceKind: "https",
  sourceDisplay: "https://example.test/team/project.git",
  destinationParent: "C:\\projects",
  destinationName: "project",
  destinationPath: "C:\\projects\\project",
  credentialExpectation: "git-credential-helper",
  contactsNetwork: true,
  changesRemote: false,
  checksOutRemoteDefault: true,
  usesStaging: true,
};

const result: CloneResult = {
  outcome: "completed",
  operationId: "op-1",
  destinationPath: "C:\\projects\\project",
  submodules: "not-detected",
  gitLfs: "not-detected",
  cleanupPath: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function renderDialog(portOverrides: Partial<ClonePort> = {}) {
  const port: ClonePort = {
    chooseParent: async () => null,
    plan: async () => plan,
    execute: async (_request, _plan, onProgress) => {
      onProgress("cloning");
      return result;
    },
    cancel: async () => undefined,
    cleanup: async () => undefined,
    ...portOverrides,
  };
  const onClose = vi.fn();
  const onVerifiedClone = vi.fn(async () => undefined);
  render(
    <LanguageProvider>
      <CloneDialog
        isOpen
        controller={createCloneController(port)}
        onClose={onClose}
        onVerifiedClone={onVerifiedClone}
      />
    </LanguageProvider>,
  );
  return { onClose, onVerifiedClone };
}

async function enterAndReview(): Promise<void> {
  await userEvent.type(screen.getByPlaceholderText("https://example.com/team/project.git"), "https://alice:secret@example.test/team/project.git?token=hidden");
  await userEvent.type(screen.getByPlaceholderText("Choose a parent folder"), "C:\\projects");
  await userEvent.click(screen.getByRole("button", { name: "Review clone" }));
  expect(await screen.findByText("https://example.test/team/project.git")).toBeInTheDocument();
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("CloneDialog", () => {
  it("previews consequences, verifies, then hands the destination to the normal open lifecycle", async () => {
    const { onClose, onVerifiedClone } = renderDialog();
    await waitFor(() => expect(screen.getByPlaceholderText("https://example.com/team/project.git")).toHaveFocus());
    await enterAndReview();

    expect(screen.getByText(/does not publish, edit, or delete anything there/i)).toBeInTheDocument();
    expect(screen.getByText(/credential helper/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clone and open project" }));

    await waitFor(() => expect(onVerifiedClone).toHaveBeenCalledWith(result));
    expect(onClose).toHaveBeenCalledOnce();
    expect(localStorage.getItem("gitodrile-clone-parent")).toBe("C:\\projects");
    expect(JSON.stringify(localStorage)).not.toContain("secret");
  });

  it("makes a late success inert when cancellation replaces the attempt", async () => {
    const execution = deferred<CloneResult>();
    const cancel = vi.fn(async () => undefined);
    const { onVerifiedClone } = renderDialog({ execute: () => execution.promise, cancel });
    await enterAndReview();
    await userEvent.click(screen.getByRole("button", { name: "Clone and open project" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel clone" }));

    expect(cancel).toHaveBeenCalledWith("op-1");
    execution.resolve(result);
    expect(await screen.findByText(/cancelled and no destination was published/i)).toBeInTheDocument();
    expect(onVerifiedClone).not.toHaveBeenCalled();
  });
});
