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
import type { RepositoryBrowserPort } from "../repository-browser";
const originalResizeObserver = globalThis.ResizeObserver;

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

function renderDialog(portOverrides: Partial<ClonePort> = {}, accountPort?: AccountsPort, repositoryPort?: RepositoryBrowserPort) {
  const port: ClonePort = {
    checkSource: async () => "accessible",
    cancelSourceCheck: async () => undefined,
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
        repositoryPort={repositoryPort}
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
  await userEvent.click(screen.getByRole("button", { name: "Choose destination" }));
  await userEvent.type(screen.getByPlaceholderText("Choose a folder"), "C:\\projects");
  expect(await screen.findByText("https://example.test/team/project.git")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Clone project" })).toBeEnabled());
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
});

describe("CloneDialog", () => {
  it.each(["github", "gitlab"] as const)("hands a %s project and its token connection to the existing clone review", async provider => {
    const accountId = provider === "github" ? "github:token.work" : "gitlab:token.42";
    const browserId = provider === "github" ? "github:work" : "gitlab:cli.42";
    const fullName = provider === "github" ? "team/project" : "team/subgroup/project";
    const cloneUrl = `https://${provider}.com/${fullName}.git`;
    globalThis.ResizeObserver = class implements ResizeObserver { observe() {} unobserve() {} disconnect() {} };
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("repository-browser__list") ? 280 : 76; });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
    const accounts: AccountsPort = { readCatalog: async () => ({ providers: [{ id: provider, host: `${provider}.com`, kind: provider, builtIn: true }], busy: false,
      accounts: [browserId, accountId].map(id => ({ id, provider, host: `${provider}.com`, login: "work", avatarDataUrl: null, available: true })) }),
      check: vi.fn(), readProject: vi.fn(), selectProject: vi.fn() };
    const list = vi.fn<RepositoryBrowserPort["list"]>(async accountId => ({ accountId, page: 1, nextPage: null,
      repositories: [{ id: 1, name: "project", fullName, owner: provider === "github" ? "team" : "team/subgroup", private: true, archived: false, description: null, cloneUrl }] }));
    const plan = vi.fn<ClonePort["plan"]>(async () => ({ ...planFixture, accountId }));
    renderDialog({ plan }, accounts, { list, cancel: vi.fn(async () => undefined) });
    await userEvent.click(screen.getByRole("button", { name: provider === "github" ? "GitHub" : "GitLab" }));
    // Two usable connections and none remembered: nothing is read yet.
    expect(list).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: /@work.*Token/ }));
    await waitFor(() => expect(list).toHaveBeenCalledWith(accountId, 1, expect.any(String)));
    await userEvent.click(await screen.findByRole("button", { name: `Choose ${fullName}` }));
    expect(screen.getByRole("button", { name: `Choose ${fullName}` })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox")).toHaveTextContent("Token");
    await userEvent.click(screen.getByRole("button", { name: "Choose destination" }));
    await userEvent.type(screen.getByPlaceholderText("Choose a folder"), "C:\\projects");
    await waitFor(() => expect(plan).toHaveBeenCalled());
    expect(plan.mock.calls[0][0]).toMatchObject({ source: cloneUrl, accountId, destinationName: "project" });
  });
  it.each([false, true])("keeps a completed clone when account persistence fails (cleanup: %s)", async (needsCleanup) => {
    const execute = vi.fn<ClonePort["execute"]>(async () => ({ ...result, accountSelectionSaved: false,
      outcome: needsCleanup ? "cleanup-required" : "completed", cleanupPath: needsCleanup ? "C:\\projects\\temporary" : null }));
    const cleanup = vi.fn<ClonePort["cleanup"]>(async () => undefined);
    const { onVerifiedClone } = renderDialog({ execute, cleanup });
    await enterAndReview();
    await userEvent.click(screen.getByRole("button", { name: "Clone project" }));
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
      readCatalog: vi.fn().mockResolvedValue({ providers: [{ id: "github", host: "github.com", kind: "github", builtIn: true }], busy: false,
        accounts: [{id: "github:work", provider: "github", host: "github.com", login: "work", avatarDataUrl: null, available: true}] }),
      check: vi.fn(), readProject: vi.fn(), selectProject: vi.fn(),
    };
    const plan = vi.fn<ClonePort["plan"]>(async () => ({ ...planFixture, sourceDisplay: "https://github.com/team/project.git", accountId: "github:work" }));
    const execute = vi.fn<ClonePort["execute"]>(async () => result);
    renderDialog({ plan, execute }, accountPort);
    await userEvent.type(screen.getByPlaceholderText("https://example.com/team/project.git"), "https://github.com/team/project.git");
    await userEvent.click(await screen.findByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: /@work/ }));
    await userEvent.click(screen.getByRole("button", {name: /Choose destination|Continue without checking/}));
    await userEvent.type(screen.getByPlaceholderText("Choose a folder"), "C:\\projects");
    await waitFor(() => expect(screen.getByRole("button", {name: "Clone project"})).toBeEnabled());
    expect(await screen.findByText(/@work · Browser/)).toBeInTheDocument();
    expect(plan.mock.calls[0][0]).toMatchObject({accountId: "github:work"});
    await userEvent.click(screen.getByRole("button", {name: "Clone project"}));
    await waitFor(() => expect(execute).toHaveBeenCalled());
    expect(execute.mock.calls[0][0]).toMatchObject({accountId: "github:work"});
    expect(accountPort.check).not.toHaveBeenCalled();
  });

  it("previews consequences, verifies, then hands the destination to the normal open lifecycle", async () => {
    const { onClose, onVerifiedClone } = renderDialog();
    await waitFor(() => expect(screen.getByPlaceholderText("https://example.com/team/project.git")).toHaveFocus());
    await enterAndReview();

    expect(screen.getByText("The original project doesn't change.")).toBeInTheDocument();
    expect(screen.queryByText("Technical details")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clone project" }));

    await waitFor(() => expect(onVerifiedClone).toHaveBeenCalledWith(result));
    expect(onClose).toHaveBeenCalledOnce();
    expect(localStorage.getItem("gitodile-clone-parent")).toBe("C:\\projects");
    expect(JSON.stringify(localStorage)).not.toContain("secret");
  });

  it("answers an empty required field inline and closes from the header button", async () => {
    const plan = vi.fn(async () => planFixture);
    const { onClose } = renderDialog({ plan });
    await userEvent.click(screen.getByRole("button", { name: "Choose destination" }));

    expect(plan).not.toHaveBeenCalled();
    expect(await screen.findAllByText("Fill in this field.")).toHaveLength(1);
    const source = screen.getByPlaceholderText("https://example.com/team/project.git");
    expect(source).toHaveAttribute("aria-invalid", "true");
    expect(source).toHaveFocus();

    await userEvent.type(source, "https://example.test/team/project.git");
    expect(source).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Fill in this field.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("invalidates a destination plan on edits and never executes an older response", async () => {
    const oldPlan = deferred<ClonePlan>();
    const newPlan = deferred<ClonePlan>();
    const plan = vi.fn<ClonePort["plan"]>().mockImplementationOnce(() => oldPlan.promise).mockImplementationOnce(() => newPlan.promise);
    const execute = vi.fn<ClonePort["execute"]>(async () => result);
    renderDialog({ plan, execute });
    await userEvent.type(screen.getByLabelText("Project address"), "https://example.test/team/project.git");
    await userEvent.click(screen.getByRole("button", { name: "Choose destination" }));
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Save inside")).toHaveFocus();
    await userEvent.type(screen.getByLabelText("Save inside"), "C:\\\\first");
    await waitFor(() => expect(plan).toHaveBeenCalledTimes(1));
    await userEvent.clear(screen.getByLabelText("Save inside"));
    await userEvent.type(screen.getByLabelText("Save inside"), "C:\\\\second");
    await waitFor(() => expect(plan).toHaveBeenCalledTimes(2));
    oldPlan.resolve(planFixture);
    await waitFor(() => expect(screen.getByRole("button", { name: "Clone project" })).toBeDisabled());
    newPlan.resolve({ ...planFixture, destinationParent: "C:\\\\second", destinationPath: "C:\\\\second\\project" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Clone project" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Clone project" }));
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute.mock.calls[0][0].destinationParent).toBe("C:\\\\second");
  });

  it("makes a late success inert when cancellation replaces the attempt", async () => {
    const execution = deferred<CloneResult>();
    const cancel = vi.fn(async () => undefined);
    const { onVerifiedClone } = renderDialog({ execute: () => execution.promise, cancel });
    await enterAndReview();
    await userEvent.click(screen.getByRole("button", { name: "Clone project" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel clone" }));

    expect(cancel).toHaveBeenCalledWith("op-1");
    execution.resolve(result);
    expect(await screen.findByRole("heading", { name: "Clone cancelled" })).toBeInTheDocument();
    expect(screen.getByText("Nothing was added.")).toBeInTheDocument();
    expect(onVerifiedClone).not.toHaveBeenCalled();
  });
});

describe("remembered discovery connection", () => {
  it("offers the connection used last time and lists its projects without another click", async () => {
    globalThis.ResizeObserver = class implements ResizeObserver { observe() {} unobserve() {} disconnect() {} };
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("repository-browser__list") ? 280 : 76; });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
    localStorage.setItem("gitodile-clone-connection-github", "github:token.work");
    const accounts: AccountsPort = { readCatalog: async () => ({ providers: [{ id: "github", host: "github.com", kind: "github", builtIn: true }], busy: false,
      accounts: ["github:work", "github:token.work"].map(id => ({ id, provider: "github", host: "github.com", login: "work", avatarDataUrl: null, available: true })) }),
      check: vi.fn(), readProject: vi.fn(), selectProject: vi.fn() };
    const list = vi.fn<RepositoryBrowserPort["list"]>(async accountId => ({ accountId, page: 1, nextPage: null,
      repositories: [{ id: 1, name: "project", fullName: "team/project", owner: "team", private: true, archived: false, description: null, cloneUrl: "https://github.com/team/project.git" }] }));
    renderDialog({}, accounts, { list, cancel: vi.fn(async () => undefined) });
    await userEvent.click(screen.getByRole("button", { name: "GitHub" }));
    expect(await screen.findByRole("button", { name: "Choose team/project" })).toBeVisible();
    expect(list).toHaveBeenCalledExactlyOnceWith("github:token.work", 1, expect.any(String));
    expect(screen.getByRole("combobox")).toHaveTextContent("Token");
    localStorage.removeItem("gitodile-clone-connection-github");
  });
});
