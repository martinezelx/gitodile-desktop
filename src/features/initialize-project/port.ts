import type {
  ConnectRemotePlan,
  ConnectRemoteRequest,
  ConnectRemoteResult,
  InitializeProgressPhase,
  InitializeProjectPlan,
  InitializeProjectRequest,
} from "./domain";

export interface InitializeProjectPort {
  chooseFolder(initialPath: string | undefined, title: string): Promise<string | null>;
  plan(request: InitializeProjectRequest): Promise<InitializeProjectPlan>;
  execute(
    request: InitializeProjectRequest,
    plan: InitializeProjectPlan,
    onProgress: (phase: InitializeProgressPhase) => void,
  ): Promise<import("./domain").InitializeProjectResult>;
  cleanup(plan: InitializeProjectPlan): Promise<void>;
  planRemote(request: ConnectRemoteRequest): Promise<ConnectRemotePlan>;
  connectRemote(request: ConnectRemoteRequest, stateToken: string): Promise<ConnectRemoteResult>;
}
