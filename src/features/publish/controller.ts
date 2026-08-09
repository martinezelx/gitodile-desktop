import type { ExecutePublishRequest, PublishPort, PublishQuery } from "./port";

export type PublishController = ReturnType<typeof createPublishController>;

/** Owns publish preflight, remote discovery, detail reads and execution. */
export function createPublishController(port: PublishPort) {
  return {
    plan(request: PublishQuery) {
      return port.plan(request);
    },
    discoverRemotes(query: Pick<PublishQuery, "projectId" | "sessionEpoch">) {
      return port.discoverRemotes(query);
    },
    readCommitFileChanges(query: Pick<PublishQuery, "projectId" | "sessionEpoch"> & { commit: string }) {
      return port.readCommitFileChanges(query);
    },
    publish(request: ExecutePublishRequest) {
      return port.publish(request);
    },
  };
}
