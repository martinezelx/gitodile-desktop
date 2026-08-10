import type {
  GitDiagnostics,
  GitIdentity,
  GitInstallationResult,
  GitUpdateLaunchResult,
  GitUpdateStatus,
} from "./domain";

/** Settings is the only app-level feature whose native calls are global rather
 * than repository-scoped: none of these take a project path or session epoch,
 * because they inspect and change the machine's Git installation, not an open
 * repository. That is why they carry no state token and no invalidation. */
export interface SettingsPort {
  readDiagnostics(): Promise<GitDiagnostics>;
  checkUpdate(): Promise<GitUpdateStatus>;
  installGit(): Promise<GitInstallationResult>;
  updateGit(): Promise<GitUpdateLaunchResult>;
  getIdentity(): Promise<GitIdentity>;
  setIdentity(identity: { name: string; email: string }): Promise<void>;
  /** Opening the platform's Git download page is the guidance path when an
   * installer cannot be launched. It crosses the OS boundary, so it belongs to
   * the port rather than to the panel. */
  openGuidance(url: string): Promise<void>;
}
