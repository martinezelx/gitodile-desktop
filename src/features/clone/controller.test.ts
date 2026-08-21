import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCloneController } from "./controller";
import {
  readLastCloneParent,
  writeLastCloneParent,
  type ClonePlan,
  type CloneRequest,
  type CloneResult,
} from "./domain";
import type { ClonePort } from "./port";

const request: CloneRequest = {
  source: "https://alice:secret@example.test/team/project.git?token=hidden#fragment",
  destinationParent: "C:\\projects",
  destinationName: "project",
};

const clonePlan = (operationId = "op-1"): ClonePlan => ({
  operationKind: "local-mutation",
  requiresConfirmation: true,
  operationId,
  stateToken: `token-${operationId}`,
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
});

const cloneResult: CloneResult = {
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

function port(overrides: Partial<ClonePort> = {}): ClonePort {
  return {
    chooseParent: async () => null,
    plan: async () => clonePlan(),
    execute: async () => cloneResult,
    cancel: async () => undefined,
    cleanup: async () => undefined,
    ...overrides,
  };
}

beforeEach(() => localStorage.clear());

describe("clone controller", () => {
  it("makes a late plan inert after a replacement attempt starts", async () => {
    const first = deferred<ClonePlan>();
    const second = deferred<ClonePlan>();
    const controller = createCloneController(port({
      plan: vi.fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    }));

    const stale = controller.plan(request);
    const current = controller.plan({ ...request, destinationName: "new-project" });
    first.resolve(clonePlan("old"));
    second.resolve(clonePlan("new"));

    await expect(stale).resolves.toBeNull();
    await expect(current).resolves.toMatchObject({ plan: { operationId: "new" } });
  });

  it("never returns or reports progress from a superseded clone", async () => {
    const execution = deferred<CloneResult>();
    const progress = vi.fn();
    const controller = createCloneController(port({ execute: () => execution.promise }));
    const attempt = await controller.plan(request);
    expect(attempt).not.toBeNull();

    const result = controller.execute(attempt!, progress);
    controller.supersede();
    execution.resolve(cloneResult);

    await expect(result).resolves.toBeNull();
    expect(progress).not.toHaveBeenCalled();
  });

  it("cancels only the exact operation currently executing", async () => {
    const execution = deferred<CloneResult>();
    const cancel = vi.fn(async () => undefined);
    const controller = createCloneController(port({ execute: () => execution.promise, cancel }));
    const attempt = await controller.plan(request);
    const pending = controller.execute(attempt!, vi.fn());

    await controller.cancelCurrent();
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith("op-1");
    execution.resolve(cloneResult);
    await pending;
    await controller.cancelCurrent();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("persists only the local parent convenience setting", () => {
    writeLastCloneParent(request.destinationParent);
    expect(readLastCloneParent()).toBe(request.destinationParent);
    expect(Object.values(localStorage)).not.toContain(request.source);
    expect(JSON.stringify(localStorage)).not.toContain("secret");
    expect(JSON.stringify(localStorage)).not.toContain("token=hidden");
  });
});
