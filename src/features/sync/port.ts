import type {
  GetTeamChangesPhase,
  GetTeamChangesPlan,
  GetTeamChangesResult,
  TeamSyncStatus,
} from "./domain";

export type TeamSyncQuery = {
  projectId: string;
  sessionEpoch: string;
};

export type GetTeamChangesRequest = TeamSyncQuery & {
  stateToken: string;
  recoveryReference: string;
  onProgress: (phase: GetTeamChangesPhase) => void;
};

export interface SyncPort {
  readLocal(query: TeamSyncQuery): Promise<TeamSyncStatus>;
  check(query: TeamSyncQuery): Promise<TeamSyncStatus>;
  planGet(query: TeamSyncQuery, onProgress: (phase: GetTeamChangesPhase) => void): Promise<GetTeamChangesPlan>;
  get(request: GetTeamChangesRequest): Promise<GetTeamChangesResult>;
}
