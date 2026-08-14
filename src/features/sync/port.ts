import type { TeamSyncStatus } from "./domain";

export type TeamSyncQuery = {
  projectId: string;
  sessionEpoch: string;
};

export interface SyncPort {
  readLocal(query: TeamSyncQuery): Promise<TeamSyncStatus>;
  check(query: TeamSyncQuery): Promise<TeamSyncStatus>;
}
