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
};

export interface SaveVersionPort {
  plan(request: SaveVersionQuery): Promise<SaveVersionPlan>;
  save(request: ExecuteSaveVersionRequest): Promise<SaveVersionResult>;
}
