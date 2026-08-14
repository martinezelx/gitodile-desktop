import type { RemoteDiscovery } from "../sync";
import type { CommitFileChange, PublishPlan, PublishResult } from "./domain";

export type PublishQuery = {
  projectId: string;
  sessionEpoch: string;
  remote?: string;
  upTo?: string;
};

export type ExecutePublishRequest = PublishQuery & {
  remote: string;
  stateToken: string;
};

export interface PublishPort {
  plan(request: PublishQuery): Promise<PublishPlan>;
  discoverRemotes(query: Pick<PublishQuery, "projectId" | "sessionEpoch">): Promise<RemoteDiscovery>;
  readCommitFileChanges(query: Pick<PublishQuery, "projectId" | "sessionEpoch"> & { commit: string }): Promise<CommitFileChange[]>;
  publish(request: ExecutePublishRequest): Promise<PublishResult>;
}
