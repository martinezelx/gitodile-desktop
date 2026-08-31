import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import {
  createSaveVersionController,
  type SaveVersionPlan,
  type SaveVersionPort,
} from "../save-version";
import type { RepositoryInfo } from "../repository";
import { createInitializeProjectController } from "./controller";
import type {
  ConnectRemotePlan,
  InitializeProjectPlan,
  InitializeProjectRequest,
  InitializeProjectResult,
} from "./domain";
import { InitializeProjectDialog } from "./InitializeProjectDialog";
import type { InitializeProjectPort } from "./port";

const project: RepositoryInfo = {
  name: "demo",
  path: "C:\\projects\\demo",
  selectedPath: "C:\\projects\\demo",
  gitDir: "C:\\projects\\demo\\.git",
  commonGitDir: "C:\\projects\\demo\\.git",
  branch: "main",
  headState: "unborn",
  kind: "repository",
  sessionEpoch: "epoch-new",
};

function localPlan(overrides: Partial<InitializeProjectPlan> = {}): InitializeProjectPlan {
  return {
    operationKind: "local-mutation",
    requiresConfirmation: true,
    operationId: "op-1",
    stateToken: "local-token",
    targetKind: "new-folder",
    destinationPath: project.path,
    initialBranch: "main",
    createReadme: false,
    saveInitialVersion: false,
    identityReady: true,
    existingEntryCount: 0,
    existingEntriesTruncated: false,
    ...overrides,
  };
}

const initialized: InitializeProjectResult = {
  outcome: "completed",
  operationId: "op-1",
  destinationPath: project.path,
  readmeCreated: false,
  cleanupPath: null,
};

function remotePlan(): ConnectRemotePlan {
  return {
    operationKind: "local-mutation",
    requiresConfirmation: true,
    projectId: project.path,
    sessionEpoch: project.sessionEpoch,
    stateToken: "remote-token",
    remoteName: "origin",
    fetchUrlDisplay: "https://example.test/team/demo.git",
    pushUrlDisplay: "https://example.test/team/demo.git",
    credentialExpectation: "git-credential-helper",
    contactsNetwork: false,
    futureNetworkAccess: true,
    changesRemote: false,
    preservesExistingConfig: true,
  };
}

function makePort(overrides: Partial<InitializeProjectPort> = {}) {
  const port: InitializeProjectPort = {
    chooseFolder: vi.fn(async () => null),
    plan: vi.fn(async (request: InitializeProjectRequest) => localPlan({
      targetKind: request.targetKind,
      destinationPath: request.targetKind === "existing-folder" ? request.existingPath : project.path,
      createReadme: request.createReadme,
      saveInitialVersion: request.saveInitialVersion,
      existingEntryCount: request.targetKind === "existing-folder" ? 3 : 0,
    })),
    execute: vi.fn(async () => initialized),
    cleanup: vi.fn(async () => undefined),
    planRemote: vi.fn(async () => remotePlan()),
    connectRemote: vi.fn(async () => ({
      projectId: project.path,
      sessionEpoch: project.sessionEpoch,
      remoteName: "origin",
    })),
    ...overrides,
  };
  return port;
}

function makeSavePort(): SaveVersionPort {
  return {
    plan: vi.fn(async (): Promise<SaveVersionPlan> => ({
      operationKind: "history-mutation",
      requiresConfirmation: true,
      stateToken: "save-token",
      branch: "main",
      isFirstVersion: true,
      totalFiles: 1,
      remainingFiles: 0,
      isPartial: false,
      hasPreparedChanges: false,
      counts: { changed: 0, new: 1, deleted: 0, renamed: 0, conflicted: 0, total: 1 },
    })),
    save: vi.fn(async () => ({
      commit: "a".repeat(40),
      shortCommit: "aaaaaaa",
      title: "First version",
      description: null,
      branch: "main",
      savedFiles: 1,
    })),
  };
}

function renderDialog(options: {
  port?: InitializeProjectPort;
  savePort?: SaveVersionPort;
  initialMode?: "new-folder" | "existing-folder";
  initialExistingPath?: string;
  defaultBranchName?: string;
} = {}) {
  const port = options.port ?? makePort();
  const savePort = options.savePort ?? makeSavePort();
  const onClose = vi.fn();
  const onInitialized = vi.fn(async () => project);
  const onProjectChanged = vi.fn(async () => undefined);
  const onOpenIdentitySettings = vi.fn();
  render(
    <LanguageProvider>
      <InitializeProjectDialog
        isOpen
        initialMode={options.initialMode ?? "new-folder"}
        initialExistingPath={options.initialExistingPath}
        controller={createInitializeProjectController(port)}
        saveVersionController={createSaveVersionController(savePort)}
        defaultBranchName={options.defaultBranchName ?? "main"}
        runHooks={false}
        onClose={onClose}
        onInitialized={onInitialized}
        onProjectChanged={onProjectChanged}
        onOpenIdentitySettings={onOpenIdentitySettings}
      />
    </LanguageProvider>,
  );
  return { port, savePort, onClose, onInitialized, onProjectChanged, onOpenIdentitySettings };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("InitializeProjectDialog", () => {
  it("initializes a contextual existing folder while promising byte-identical files", async () => {
    const { port, onInitialized } = renderDialog({
      initialMode: "existing-folder",
      initialExistingPath: "C:\\ordinary folder",
    });
    expect(screen.getByLabelText("Existing ordinary folder")).toHaveValue("C:\\ordinary folder");
    await userEvent.click(screen.getByRole("button", { name: "Review local setup" }));
    expect(await screen.findByText(/3 existing top-level items stay byte-for-byte untouched/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create and open project" }));
    expect(await screen.findByText("Your local project is ready")).toBeInTheDocument();
    expect(port.execute).toHaveBeenCalledOnce();
    expect(onInitialized).toHaveBeenCalledOnce();
    expect((port.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      targetKind: "existing-folder",
      existingPath: "C:\\ordinary folder",
      createReadme: false,
    });
  });

  it("creates README and saves the first version only after explicit checks", async () => {
    const savePort = makeSavePort();
    const { port, onProjectChanged } = renderDialog({ savePort });
    await userEvent.type(screen.getByLabelText("Parent folder"), "C:\\projects");
    await userEvent.type(screen.getByLabelText(/^Project folder name/), "demo");
    await userEvent.click(screen.getByLabelText(/^Add a README\.md/));
    await userEvent.click(screen.getByLabelText(/^Save the first version/));
    await userEvent.click(screen.getByRole("button", { name: "Review local setup" }));
    expect(await screen.findByText(/Creates README.md only/i)).toBeInTheDocument();
    expect(screen.getByText(/normal hook- and signing-aware flow/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create and open project" }));
    expect(await screen.findByText("Your local project is ready")).toBeInTheDocument();
    expect(port.plan).toHaveBeenCalledWith(expect.objectContaining({ createReadme: true, saveInitialVersion: true }));
    expect(savePort.plan).toHaveBeenCalledWith(expect.objectContaining({ sessionEpoch: "epoch-new" }));
    expect(savePort.save).toHaveBeenCalledWith(expect.objectContaining({ title: "First version", stateToken: "save-token" }));
    expect(onProjectChanged).toHaveBeenCalledWith(project.path);
  });

  it("blocks the first save preview when identity is missing and opens Git settings", async () => {
    const port = makePort({ plan: vi.fn(async (request) => localPlan({
      createReadme: request.createReadme,
      saveInitialVersion: request.saveInitialVersion,
      identityReady: false,
    })) });
    const { onOpenIdentitySettings, onClose } = renderDialog({ port });
    await userEvent.type(screen.getByLabelText("Parent folder"), "C:\\projects");
    await userEvent.type(screen.getByLabelText(/^Project folder name/), "demo");
    await userEvent.click(screen.getByLabelText(/^Save the first version/));
    await userEvent.click(screen.getByRole("button", { name: "Review local setup" }));
    expect(await screen.findByText(/needs a Git name and email/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create and open project" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open identity settings" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenIdentitySettings).toHaveBeenCalledOnce();
  });

  it("keeps remote configuration behind a separate no-network preview", async () => {
    const { port, onProjectChanged } = renderDialog();
    await userEvent.type(screen.getByLabelText("Parent folder"), "C:\\projects");
    await userEvent.type(screen.getByLabelText(/^Project folder name/), "demo");
    await userEvent.click(screen.getByLabelText(/^Connect a remote after local setup/));
    await userEvent.type(screen.getByLabelText("Remote Git URL"), "https://alice:secret@example.test/team/demo.git?token=hidden");
    await userEvent.click(screen.getByRole("button", { name: "Review local setup" }));
    expect(port.planRemote).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Create and open project" }));
    expect(await screen.findByText("Review the remote connection")).toBeInTheDocument();
    expect(screen.getAllByText("https://example.test/team/demo.git")).toHaveLength(2);
    expect(screen.queryByText(/alice|secret|token=hidden/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No network request happens/i)).toBeInTheDocument();
    expect(port.connectRemote).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Connect remote" }));
    expect(await screen.findByText("Local project and remote are ready")).toBeInTheDocument();
    expect(port.connectRemote).toHaveBeenCalledOnce();
    expect(onProjectChanged).toHaveBeenCalledWith(project.path);
  });

  it("explains an empty required field inline instead of leaving the action disabled", async () => {
    const { port } = renderDialog();
    const review = screen.getByRole("button", { name: "Review local setup" });
    expect(review).toBeEnabled();
    await userEvent.click(review);

    expect(port.plan).not.toHaveBeenCalled();
    expect(await screen.findAllByText("Fill in this field.")).toHaveLength(2);
    const parent = screen.getByLabelText("Parent folder");
    expect(parent).toHaveAttribute("aria-invalid", "true");
    expect(parent).toHaveFocus();

    await userEvent.type(parent, "C:\\projects");
    await userEvent.type(screen.getByLabelText(/^Project folder name/), "demo");
    await userEvent.click(review);
    expect(port.plan).toHaveBeenCalledOnce();
  });

  it("keeps focus in the dialog and restores the caller through close", async () => {
    const { onClose } = renderDialog();
    await waitFor(() => expect(screen.getByLabelText("Parent folder")).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
