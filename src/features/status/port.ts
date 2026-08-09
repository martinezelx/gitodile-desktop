import type { PendingVersionsResult } from "../overview/pendingVersionsDomain";
import type { WorkingTreeStatus } from "./domain";

export type StatusQuery = { projectId: string; sessionEpoch: string };

export interface StatusPort {
  readWorkingTree(query: StatusQuery): Promise<WorkingTreeStatus>;
  readPendingVersions(query: StatusQuery): Promise<PendingVersionsResult>;
}
