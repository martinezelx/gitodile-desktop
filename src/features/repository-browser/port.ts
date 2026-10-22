import type { RepositoryPage } from "./domain";
export interface RepositoryBrowserPort {
  list(accountId: string, page: number, requestId: string): Promise<RepositoryPage>;
  cancel(requestId: string): Promise<void>;
}
