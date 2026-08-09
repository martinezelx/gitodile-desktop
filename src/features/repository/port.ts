import type { RepositoryInfo } from "./domain";

export type OpenRepositoryRequest = {
  selectedPath: string;
  sessionEpoch?: string;
};

/** Repository discovery/identity boundary. Consumers do not know Tauri
 * command names or transport casing. */
export interface RepositoryPort {
  open(request: OpenRepositoryRequest): Promise<RepositoryInfo>;
}
