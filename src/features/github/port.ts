import type { GitHubAuthSnapshot } from "./domain";

/** Machine-level authentication only; future repository operations have their
 * own authorization and bounded plans. This port never exports a token. */
export interface GitHubAuthPort {
  readState(): Promise<GitHubAuthSnapshot>;
  check(): Promise<GitHubAuthSnapshot>;
  login(): Promise<GitHubAuthSnapshot>;
  logout(login: string): Promise<GitHubAuthSnapshot>;
  switchAccount(login: string): Promise<GitHubAuthSnapshot>;
  cancel(operationId: string): Promise<GitHubAuthSnapshot>;
  openBrowser(): Promise<void>;
  /** The configured host's device page; github.com when absent. Only this
   * exact page opens automatically, never a URL taken from gh's output. */
  deviceUrl?: string;
}
