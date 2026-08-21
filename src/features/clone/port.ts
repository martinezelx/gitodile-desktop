import type { ClonePlan, CloneProgressPhase, CloneRequest, CloneResult } from "./domain";

export interface ClonePort {
  chooseParent(initialParent?: string): Promise<string | null>;
  plan(request: CloneRequest): Promise<ClonePlan>;
  execute(
    request: CloneRequest,
    plan: ClonePlan,
    onProgress: (phase: CloneProgressPhase) => void,
  ): Promise<CloneResult>;
  cancel(operationId: string): Promise<void>;
  cleanup(destinationParent: string, operationId: string): Promise<void>;
}
