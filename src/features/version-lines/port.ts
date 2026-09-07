import type {
  CreateVersionLinePlan,
  DeleteVersionLinePlan,
  DeleteVersionLineResult,
  RenameVersionLinePlan,
  SwitchVersionLinePlan,
  VersionLineHistory,
  VersionLinesSnapshot,
} from "./domain";

export type VersionLinesQuery = {
  projectId: string;
  sessionEpoch: string;
};

export type CreateVersionLineRequest = VersionLinesQuery & {
  name: string;
  switchToNew: boolean;
};

export type ExecuteCreateVersionLineRequest = CreateVersionLineRequest & {
  stateToken: string;
};

export type VersionLineHistoryRequest = VersionLinesQuery & { name: string };

export type SwitchVersionLineRequest = VersionLinesQuery & { target: string };
export type ExecuteSwitchVersionLineRequest = SwitchVersionLineRequest & { stateToken: string };
export type DeleteVersionLineRequest = VersionLinesQuery & { name: string };
export type ExecuteDeleteVersionLineRequest = DeleteVersionLineRequest & {
  /** Clear the published copy away as well. Only ever true when the plan
   * reported one, and only when the user asked for it in the dialog. */
  deleteRemote: boolean;
  stateToken: string;
};
export type RenameVersionLineRequest = VersionLinesQuery & { name: string; newName: string };
export type ExecuteRenameVersionLineRequest = RenameVersionLineRequest & { stateToken: string };

/** The feature's complete native boundary. UI and controllers do not know
 * command names or Tauri argument casing. */
export interface VersionLinesPort {
  read(query: VersionLinesQuery): Promise<VersionLinesSnapshot>;
  readHistory(request: VersionLineHistoryRequest): Promise<VersionLineHistory>;
  planCreate(request: CreateVersionLineRequest): Promise<CreateVersionLinePlan>;
  create(request: ExecuteCreateVersionLineRequest): Promise<VersionLinesSnapshot>;
  planSwitch(request: SwitchVersionLineRequest): Promise<SwitchVersionLinePlan>;
  switch(request: ExecuteSwitchVersionLineRequest): Promise<VersionLinesSnapshot>;
  planDelete(request: DeleteVersionLineRequest): Promise<DeleteVersionLinePlan>;
  delete(request: ExecuteDeleteVersionLineRequest): Promise<DeleteVersionLineResult>;
  planRename(request: RenameVersionLineRequest): Promise<RenameVersionLinePlan>;
  rename(request: ExecuteRenameVersionLineRequest): Promise<VersionLinesSnapshot>;
}
