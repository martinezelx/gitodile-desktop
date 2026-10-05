import type { ClonePlan, CloneProgressPhase, CloneRequest, CloneResult } from "./domain";
import type { CloneSourceAccessPort } from "./sourceAccess";

export interface ClonePort extends CloneSourceAccessPort {
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
