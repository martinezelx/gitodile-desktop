import type { SaveVersionPlan, SaveVersionResult } from "./domain";

export type SaveVersionQuery = {
  projectId: string;
  sessionEpoch: string;
  selectedPaths: string[] | null;
};

export type ExecuteSaveVersionRequest = SaveVersionQuery & {
  title: string;
  description: string | null;
  stateToken: string;
  /** Whether Rust should let the project's own `pre-commit`/`commit-msg` hooks
   * run. It travels with the request rather than being read from the config,
   * because it is the user's choice about this app, not the project's. */
  runHooks: boolean;
};

export interface SaveVersionPort {
  plan(request: SaveVersionQuery): Promise<SaveVersionPlan>;
  save(request: ExecuteSaveVersionRequest): Promise<SaveVersionResult>;
}
