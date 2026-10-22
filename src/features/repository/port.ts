import type { RepositoryInfo } from "./domain";

export type OpenRepositoryRequest = {
  selectedPath: string;
  sessionEpoch?: string;
};

/** An open project, named by its root and the session that opened it. */
export type ProjectFolderRequest = {
  path: string;
  sessionEpoch: string;
};

/** Repository discovery/identity boundary. Consumers do not know Tauri
 * command names or transport casing. */
export interface RepositoryPort {
  open(request: OpenRepositoryRequest): Promise<RepositoryInfo>;
  /** Opens the project's own folder in the system file manager. Rust resolves
   * the folder from the open project; the renderer never names another one. */
  openFolder(request: ProjectFolderRequest): Promise<void>;
}
