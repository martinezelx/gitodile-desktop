import { describe, expect, it, vi } from "vitest";

import { createInitializeProjectController } from "./controller";
import type {
  ConnectRemotePlan,
  InitializeProjectPlan,
  InitializeProjectRequest,
  InitializeProjectResult,
} from "./domain";
import type { InitializeProjectPort } from "./port";

const request: InitializeProjectRequest = {
  targetKind: "new-folder",
  destinationParent: "C:\\projects",
  destinationName: "demo",
  existingPath: "",
  initialBranch: "main",
  createReadme: false,
  saveInitialVersion: false,
};

const plan = (operationId: string): InitializeProjectPlan => ({
  operationKind: "local-mutation",
  requiresConfirmation: true,
  operationId,
  stateToken: `token-${operationId}`,
  targetKind: "new-folder",
  destinationPath: `C:\\projects\\${operationId}`,
  initialBranch: "main",
  createReadme: false,
  saveInitialVersion: false,
  identityReady: true,
  existingEntryCount: 0,
  existingEntriesTruncated: false,
});

const result: InitializeProjectResult = {
  outcome: "completed",
  operationId: "new",
  destinationPath: "C:\\projects\\demo",
  readmeCreated: false,
  cleanupPath: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function port(overrides: Partial<InitializeProjectPort> = {}): InitializeProjectPort {
  return {
    chooseFolder: async () => null,
    plan: async () => plan("default"),
    execute: async () => result,
    cleanup: async () => undefined,
    planRemote: async () => ({
      operationKind: "local-mutation",
      requiresConfirmation: true,
      projectId: "/repo",
      sessionEpoch: "epoch",
      stateToken: "remote-token",
      remoteName: "origin",
      fetchUrlDisplay: "https://example.test/repo.git",
      pushUrlDisplay: "https://example.test/repo.git",
      credentialExpectation: "git-credential-helper",
      contactsNetwork: false,
      futureNetworkAccess: true,
      changesRemote: false,
      preservesExistingConfig: true,
    }),
    connectRemote: async () => ({ projectId: "/repo", sessionEpoch: "epoch", remoteName: "origin" }),
    ...overrides,
  };
}

describe("initialize project controller", () => {
  it("drops a late local plan after a replacement", async () => {
    const first = deferred<InitializeProjectPlan>();
    const second = deferred<InitializeProjectPlan>();
    const controller = createInitializeProjectController(port({
      plan: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    }));
    const old = controller.plan(request);
    const current = controller.plan({ ...request, destinationName: "current" });
    first.resolve(plan("old"));
    second.resolve(plan("new"));
    expect(await old).toBeNull();
    expect((await current)?.plan.operationId).toBe("new");
  });

  it("makes late execution and progress inert after close", async () => {
    const execution = deferred<InitializeProjectResult>();
    let reportProgress: ((phase: "verifying") => void) | undefined;
    const controller = createInitializeProjectController(port({
      execute: (_request, _plan, progress) => {
        reportProgress = progress as (phase: "verifying") => void;
        return execution.promise;
      },
    }));
    const attempt = await controller.plan(request);
    expect(attempt).not.toBeNull();
    const progress = vi.fn();
    const pending = controller.execute(attempt!, progress);
    controller.supersede();
    reportProgress?.("verifying");
    execution.resolve(result);
    expect(await pending).toBeNull();
    expect(progress).not.toHaveBeenCalled();
  });

  it("drops a late rejection after the dialog is closed", async () => {
    const planning = deferred<InitializeProjectPlan>();
    const controller = createInitializeProjectController(port({
      plan: vi.fn().mockReturnValue(planning.promise),
    }));
    const pending = controller.plan(request);
    controller.supersede();
    planning.reject(new Error("late failure"));
    expect(await pending).toBeNull();
  });

  it("supersedes an older remote preview independently", async () => {
    const first = deferred<ConnectRemotePlan>();
    const second = deferred<ConnectRemotePlan>();
    const controller = createInitializeProjectController(port({
      planRemote: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    }));
    const local = await controller.plan(request);
    const query = { projectId: "/repo", sessionEpoch: "epoch", remoteName: "origin", remoteUrl: "https://example.test/repo.git" };
    const old = controller.planRemote(local!.generation, query);
    const current = controller.planRemote(local!.generation, { ...query, remoteName: "team" });
    const remotePlan = await port().planRemote(query);
    first.resolve(remotePlan);
    second.resolve({ ...remotePlan, remoteName: "team" });
    expect(await old).toBeNull();
    expect((await current)?.plan.remoteName).toBe("team");
  });
});
