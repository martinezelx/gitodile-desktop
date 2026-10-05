import type { GitLabAuthSnapshot } from "./domain";
export interface GitLabAuthPort {
  readState(): Promise<GitLabAuthSnapshot>;
  check(): Promise<GitLabAuthSnapshot>;
  login(): Promise<GitLabAuthSnapshot>;
  logout(accountId: string): Promise<GitLabAuthSnapshot>;
  cancel(operationId: string): Promise<GitLabAuthSnapshot>;
}
