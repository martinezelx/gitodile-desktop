import type { RepositoryInfo } from "./domain";
import type { OpenRepositoryRequest, RepositoryPort } from "./port";

export type RepositoryController = ReturnType<typeof createRepositoryController>;

/** Owns repository discovery and epoch-aware identity refreshes. The shell
 * chooses when a user opens/switches a project; it does not own IPC. */
export function createRepositoryController(port: RepositoryPort) {
  const inFlight = new Map<string, Promise<RepositoryInfo>>();

  return {
    open(request: OpenRepositoryRequest): Promise<RepositoryInfo> {
      const key = `${request.selectedPath}\0${request.sessionEpoch ?? "new"}`;
      const current = inFlight.get(key);
      if (current) return current;
      const promise = port.open(request).finally(() => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return promise;
    },
  };
}
