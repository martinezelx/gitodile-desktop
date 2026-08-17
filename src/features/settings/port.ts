import type {
  GitDiagnostics,
  GitIdentity,
  GitInstallationResult,
  GitLineEndings,
  GitUpdateLaunchResult,
  GitUpdateStatus,
  LineEndingChoice,
} from "./domain";

/** Settings is the app-level feature whose native calls are global rather than
 * repository-scoped: almost none of these take a project path or session epoch,
 * because they inspect and change the machine's Git installation, not an open
 * repository. That is why they carry no state token and no invalidation.
 *
 * `readLineEndings` is the one exception, and only because the question it
 * answers has a repository-scoped answer: a project's own config or
 * `.gitattributes` can override the global setting, and reporting the global
 * value where it does not apply would be worse than reporting nothing. It takes
 * the open project when there is one and validates like any other repository
 * read; writing stays global. */
export interface SettingsPort {
  readDiagnostics(): Promise<GitDiagnostics>;
  checkUpdate(): Promise<GitUpdateStatus>;
  installGit(): Promise<GitInstallationResult>;
  updateGit(): Promise<GitUpdateLaunchResult>;
  getIdentity(): Promise<GitIdentity>;
  setIdentity(identity: { name: string; email: string }): Promise<void>;
  readLineEndings(project: { path: string; sessionEpoch: string } | null): Promise<GitLineEndings>;
  setLineEndings(mode: LineEndingChoice): Promise<void>;
  /** Which platform this is, for the recommended line-ending choice. Reading it
   * crosses the OS boundary like `openGuidance` does, and it answers `null`
   * outside the desktop shell rather than throwing. */
  readPlatform(): string | null;
  /** Opening the platform's Git download page is the guidance path when an
   * installer cannot be launched. It crosses the OS boundary, so it belongs to
   * the port rather than to the panel. */
  openGuidance(url: string): Promise<void>;
}
