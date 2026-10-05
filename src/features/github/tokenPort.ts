export interface GitHubTokenPort {
  add(token: string, requestId: string): Promise<string>;
  remove(accountId: string): Promise<void>;
  cancel(requestId: string): Promise<void>;
}
