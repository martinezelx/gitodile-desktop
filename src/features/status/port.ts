import type { PendingVersionsResult } from "../publish";
import type { WorkingTreeStatus } from "./domain";

export type StatusQuery = { projectId: string; sessionEpoch: string };

export interface StatusPort {
  readWorkingTree(query: StatusQuery): Promise<WorkingTreeStatus>;
  readPendingVersions(query: StatusQuery): Promise<PendingVersionsResult>;
  /** The versions the last-known remote-tracking ref has and the line does
   * not: local only, never a fetch. */
  readIncomingVersions(query: StatusQuery): Promise<PendingVersionsResult>;
}
