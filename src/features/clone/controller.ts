import type { ClonePlan, CloneProgressPhase, CloneRequest, CloneResult } from "./domain";
import type { ClonePort } from "./port";

export type CloneAttempt = {
  generation: number;
  request: CloneRequest;
  plan: ClonePlan;
};

export type CloneController = ReturnType<typeof createCloneController>;

/** Owns attempt generations independently of project sessions: clone starts
 * before a project epoch exists. Superseding/closing an attempt cancels its
 * exact operation id and makes every late result inert. */
export function createCloneController(port: ClonePort) {
  let generation = 0;
  let activeOperation: { generation: number; operationId: string } | null = null;

  return {
    chooseParent(initialParent?: string): Promise<string | null> {
      return port.chooseParent(initialParent);
    },

    async plan(request: CloneRequest): Promise<CloneAttempt | null> {
      const requestGeneration = ++generation;
      const plan = await port.plan(request);
      return requestGeneration === generation
        ? { generation: requestGeneration, request, plan }
        : null;
    },

    async execute(
      attempt: CloneAttempt,
      onProgress: (phase: CloneProgressPhase) => void,
    ): Promise<CloneResult | null> {
      if (attempt.generation !== generation) return null;
      activeOperation = { generation: attempt.generation, operationId: attempt.plan.operationId };
      try {
        const result = await port.execute(attempt.request, attempt.plan, (phase) => {
          if (attempt.generation === generation) onProgress(phase);
        });
        return attempt.generation === generation ? result : null;
      } finally {
        if (
          activeOperation?.generation === attempt.generation &&
          activeOperation.operationId === attempt.plan.operationId
        ) {
          activeOperation = null;
        }
      }
    },

    async cancelCurrent(): Promise<void> {
      const operation = activeOperation;
      if (!operation) return;
      await port.cancel(operation.operationId);
    },

    cleanup(attempt: CloneAttempt): Promise<void> {
      return port.cleanup(attempt.plan.destinationParent, attempt.plan.operationId);
    },

    supersede(): void {
      generation += 1;
    },

    isCurrent(attempt: CloneAttempt): boolean {
      return attempt.generation === generation;
    },
  };
}
