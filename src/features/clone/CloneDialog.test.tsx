import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { CloneDialog } from "./CloneDialog";
import { createCloneController } from "./controller";
import type { ClonePlan, CloneResult } from "./domain";
import type { ClonePort } from "./port";
import type { AccountsPort } from "../accounts";

const planFixture: ClonePlan = {
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

function renderDialog(portOverrides: Partial<ClonePort> = {}, accountPort?: AccountsPort) {
  const port: ClonePort = {
    chooseParent: async () => null,
    plan: async () => planFixture,
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
        accountPort={accountPort}
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
  await userEvent.type(screen.getByPlaceholderText("Choose a folder"), "C:\\projects");
  await userEvent.click(screen.getByRole("button", { name: "Review" }));
  expect(await screen.findByText("https://example.test/team/project.git")).toBeInTheDocument();
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("CloneDialog", () => {
  it.each([false, true])("keeps a completed clone when account persistence fails (cleanup: %s)", async (needsCleanup) => {
    const execute = vi.fn<ClonePort["execute"]>(async () => ({ ...result, accountSelectionSaved: false,
      outcome: needsCleanup ? "cleanup-required" : "completed", cleanupPath: needsCleanup ? "C:\\projects\\temporary" : null }));
    const cleanup = vi.fn<ClonePort["cleanup"]>(async () => undefined);
    const { onVerifiedClone } = renderDialog({ execute, cleanup });
    await enterAndReview();
    await userEvent.click(screen.getByRole("button", { name: "Clone and open" }));
    if (needsCleanup) await userEvent.click(await screen.findByRole("button", { name: "Retry cleanup" }));
    expect(await screen.findByRole("heading", { name: "The project was cloned; its account needs setup" })).toBeInTheDocument();
    expect(screen.getByText(/Do not clone it again/)).toBeInTheDocument();
    expect(screen.getByText(result.destinationPath)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(onVerifiedClone).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(needsCleanup ? 1 : 0);
  });

  it("binds the reviewed identity through execution and explains its project access", async () => {
    const accountPort: AccountsPort = {
      readCatalog: vi.fn().mockResolvedValue({ providers: [{id: "github", host: "github.com"}], busy: false,
        accounts: [{id: "github:work", provider: "github", host: "github.com", login: "work", avatarDataUrl: null, available: true}] }),
      check: vi.fn(), readProject: vi.fn(), selectProject: vi.fn(),
    };
    const plan = vi.fn<ClonePort["plan"]>(async () => ({ ...planFixture, sourceDisplay: "https://github.com/team/project.git", accountId: "github:work" }));
    const execute = vi.fn<ClonePort["execute"]>(async () => result);
    renderDialog({ plan, execute }, accountPort);
    await userEvent.type(screen.getByPlaceholderText("https://example.com/team/project.git"), "https://github.com/team/project.git");
    await userEvent.selectOptions(await screen.findByRole("combobox"), "github:work");
    await userEvent.type(screen.getByPlaceholderText("Choose a folder"), "C:\\projects");
    await userEvent.click(screen.getByRole("button", {name: "Review"}));
    expect(await screen.findByText("@work")).toBeInTheDocument();
    expect(plan.mock.calls[0][0]).toMatchObject({accountId: "github:work"});
    expect(screen.getByText(/GitOdile uses the selected account/, {ignore: false})).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name: "Clone and open"}));
    await waitFor(() => expect(execute).toHaveBeenCalled());
    expect(execute.mock.calls[0][0]).toMatchObject({accountId: "github:work"});
    expect(accountPort.check).not.toHaveBeenCalled();
  });

  it("previews consequences, verifies, then hands the destination to the normal open lifecycle", async () => {
    const { onClose, onVerifiedClone } = renderDialog();
    await waitFor(() => expect(screen.getByPlaceholderText("https://example.com/team/project.git")).toHaveFocus());
    await enterAndReview();

    expect(screen.getByText("The original project doesn't change.")).toBeInTheDocument();
    // Sign-in is true and findable, but behind the details rather than beside
    // the decision.
    expect(screen.getByText(/your existing Git sign-in is used/i, { ignore: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clone and open" }));

    await waitFor(() => expect(onVerifiedClone).toHaveBeenCalledWith(result));
    expect(onClose).toHaveBeenCalledOnce();
    expect(localStorage.getItem("gitodile-clone-parent")).toBe("C:\\projects");
    expect(JSON.stringify(localStorage)).not.toContain("secret");
  });

  it("answers an empty required field inline and closes from the header button", async () => {
    const plan = vi.fn(async () => planFixture);
    const { onClose } = renderDialog({ plan });
    await userEvent.click(screen.getByRole("button", { name: "Review" }));

    expect(plan).not.toHaveBeenCalled();
    expect(await screen.findAllByText("Fill in this field.")).toHaveLength(2);
    const source = screen.getByPlaceholderText("https://example.com/team/project.git");
    expect(source).toHaveAttribute("aria-invalid", "true");
    expect(source).toHaveFocus();

    await userEvent.type(source, "https://example.test/team/project.git");
    expect(source).not.toHaveAttribute("aria-invalid");
    expect(screen.getAllByText("Fill in this field.")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("makes a late success inert when cancellation replaces the attempt", async () => {
    const execution = deferred<CloneResult>();
    const cancel = vi.fn(async () => undefined);
    const { onVerifiedClone } = renderDialog({ execute: () => execution.promise, cancel });
    await enterAndReview();
    await userEvent.click(screen.getByRole("button", { name: "Clone and open" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel clone" }));

    expect(cancel).toHaveBeenCalledWith("op-1");
    execution.resolve(result);
    expect(await screen.findByRole("heading", { name: "Clone cancelled" })).toBeInTheDocument();
    expect(screen.getByText("Nothing was added.")).toBeInTheDocument();
    expect(onVerifiedClone).not.toHaveBeenCalled();
  });
});
