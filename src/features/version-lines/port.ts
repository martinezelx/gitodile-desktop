import type {
  CreateVersionLinePlan,
  DeleteVersionLinePlan,
  SwitchVersionLinePlan,
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

export type SwitchVersionLineRequest = VersionLinesQuery & { target: string };
export type ExecuteSwitchVersionLineRequest = SwitchVersionLineRequest & { stateToken: string };
export type DeleteVersionLineRequest = VersionLinesQuery & { name: string };
export type ExecuteDeleteVersionLineRequest = DeleteVersionLineRequest & { stateToken: string };

/** The feature's complete native boundary. UI and controllers do not know
 * command names or Tauri argument casing. */
export interface VersionLinesPort {
  read(query: VersionLinesQuery): Promise<VersionLinesSnapshot>;
  planCreate(request: CreateVersionLineRequest): Promise<CreateVersionLinePlan>;
  create(request: ExecuteCreateVersionLineRequest): Promise<VersionLinesSnapshot>;
  planSwitch(request: SwitchVersionLineRequest): Promise<SwitchVersionLinePlan>;
  switch(request: ExecuteSwitchVersionLineRequest): Promise<VersionLinesSnapshot>;
  planDelete(request: DeleteVersionLineRequest): Promise<DeleteVersionLinePlan>;
  delete(request: ExecuteDeleteVersionLineRequest): Promise<VersionLinesSnapshot>;
}
