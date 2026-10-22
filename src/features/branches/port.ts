import type {
  CleanUpBranchesPlan,
  CleanUpBranchesResult,
  CreateBranchPlan,
  DeleteBranchPlan,
  DeleteBranchResult,
  RenameBranchPlan,
  SwitchBranchPlan,
  BranchHistory,
  BranchesSnapshot,
} from "./domain";

export type BranchesQuery = {
  projectId: string;
  sessionEpoch: string;
};

export type CreateBranchRequest = BranchesQuery & {
  name: string;
  switchToNew: boolean;
  /** A saved version to start the branch at, chosen from History. Absent means
   * wherever the project is standing, which is what creating a branch has always
   * meant. Always a full commit id: Rust refuses anything else rather than
   * resolving a revision expression. */
  startCommit?: string | null;
};

export type ExecuteCreateBranchRequest = CreateBranchRequest & {
  stateToken: string;
};

export type BranchHistoryRequest = BranchesQuery & { name: string };

export type SwitchBranchRequest = BranchesQuery & { target: string };
export type ExecuteSwitchBranchRequest = SwitchBranchRequest & { stateToken: string };
export type DeleteBranchRequest = BranchesQuery & { name: string };
export type ExecuteDeleteBranchRequest = DeleteBranchRequest & {
  /** Clear the published copy away as well. Only ever true when the plan
   * reported one, and only when the user asked for it in the dialog. */
  deleteRemote: boolean;
  stateToken: string;
};
export type CleanUpBranchesRequest = BranchesQuery & { names: string[] };
export type ExecuteCleanUpBranchesRequest = BranchesQuery & {
  /** The chosen branches, each with its own token from the plan. */
  branches: { name: string; stateToken: string }[];
  /** Clear the published copies away as well, for the chosen branches that
   * have one. Only true when the user asked for it in the dialog. */
  deleteRemote: boolean;
};
export type RenameBranchRequest = BranchesQuery & { name: string; newName: string };
export type ExecuteRenameBranchRequest = RenameBranchRequest & { stateToken: string };

/** The feature's complete native boundary. UI and controllers do not know
 * command names or Tauri argument casing. */
export interface BranchesPort {
  read(query: BranchesQuery): Promise<BranchesSnapshot>;
  readHistory(request: BranchHistoryRequest): Promise<BranchHistory>;
  planCreate(request: CreateBranchRequest): Promise<CreateBranchPlan>;
  create(request: ExecuteCreateBranchRequest): Promise<BranchesSnapshot>;
  planSwitch(request: SwitchBranchRequest): Promise<SwitchBranchPlan>;
  switch(request: ExecuteSwitchBranchRequest): Promise<BranchesSnapshot>;
  planDelete(request: DeleteBranchRequest): Promise<DeleteBranchPlan>;
  delete(request: ExecuteDeleteBranchRequest): Promise<DeleteBranchResult>;
  planCleanUp(request: CleanUpBranchesRequest): Promise<CleanUpBranchesPlan>;
  cleanUp(request: ExecuteCleanUpBranchesRequest): Promise<CleanUpBranchesResult>;
  planRename(request: RenameBranchRequest): Promise<RenameBranchPlan>;
  rename(request: ExecuteRenameBranchRequest): Promise<BranchesSnapshot>;
}
