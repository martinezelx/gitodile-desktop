import type {
  ConnectRemotePlan,
  ConnectRemoteRequest,
  ConnectRemoteResult,
  InitializeProgressPhase,
  InitializeProjectPlan,
  InitializeProjectRequest,
  InitializeProjectResult,
} from "./domain";
import type { InitializeProjectPort } from "./port";

export type InitializeAttempt = {
  generation: number;
  request: InitializeProjectRequest;
  plan: InitializeProjectPlan;
};

export type ConnectRemoteAttempt = {
  generation: number;
  remoteGeneration: number;
  request: ConnectRemoteRequest;
  plan: ConnectRemotePlan;
};

export type InitializeProjectController = ReturnType<typeof createInitializeProjectController>;

/** Project initialization starts before a session exists. The outer generation
 * makes closed/replaced attempts inert; a second generation independently
 * supersedes remote previews after the verified project session exists. */
export function createInitializeProjectController(port: InitializeProjectPort) {
  let generation = 0;
  let remoteGeneration = 0;

  return {
    chooseFolder(initialPath: string | undefined, title: string): Promise<string | null> {
      return port.chooseFolder(initialPath, title);
    },

    async plan(request: InitializeProjectRequest): Promise<InitializeAttempt | null> {
      const requestGeneration = ++generation;
      remoteGeneration += 1;
      try {
        const plan = await port.plan(request);
        return requestGeneration === generation
          ? { generation: requestGeneration, request, plan }
          : null;
      } catch (error) {
        if (requestGeneration !== generation) return null;
        throw error;
      }
    },

    async execute(
      attempt: InitializeAttempt,
      onProgress: (phase: InitializeProgressPhase) => void,
    ): Promise<InitializeProjectResult | null> {
      if (attempt.generation !== generation) return null;
      try {
        const result = await port.execute(attempt.request, attempt.plan, (phase) => {
          if (attempt.generation === generation) onProgress(phase);
        });
        return attempt.generation === generation ? result : null;
      } catch (error) {
        if (attempt.generation !== generation) return null;
        throw error;
      }
    },

    cleanup(attempt: InitializeAttempt): Promise<void> {
      return port.cleanup(attempt.plan);
    },

    async planRemote(
      generationToKeep: number,
      request: ConnectRemoteRequest,
    ): Promise<ConnectRemoteAttempt | null> {
      if (generationToKeep !== generation) return null;
      const nextRemoteGeneration = ++remoteGeneration;
      try {
        const plan = await port.planRemote(request);
        return generationToKeep === generation && nextRemoteGeneration === remoteGeneration
          ? { generation, remoteGeneration: nextRemoteGeneration, request, plan }
          : null;
      } catch (error) {
        if (generationToKeep !== generation || nextRemoteGeneration !== remoteGeneration) return null;
        throw error;
      }
    },

    async connectRemote(attempt: ConnectRemoteAttempt): Promise<ConnectRemoteResult | null> {
      if (
        attempt.generation !== generation ||
        attempt.remoteGeneration !== remoteGeneration
      ) {
        return null;
      }
      try {
        const result = await port.connectRemote(attempt.request, attempt.plan.stateToken);
        return attempt.generation === generation && attempt.remoteGeneration === remoteGeneration
          ? result
          : null;
      } catch (error) {
        if (attempt.generation !== generation || attempt.remoteGeneration !== remoteGeneration) return null;
        throw error;
      }
    },

    supersede(): void {
      generation += 1;
      remoteGeneration += 1;
    },

    isCurrent(attempt: InitializeAttempt): boolean {
      return attempt.generation === generation;
    },
  };
}
