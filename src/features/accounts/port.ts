import type { AccountCatalog, AccountProject, ProjectAccount } from "./domain";
export interface AccountsPort {
  readCatalog(): Promise<AccountCatalog>;
  check(provider: string): Promise<AccountCatalog>;
  readProject(project: AccountProject, provider: string): Promise<ProjectAccount>;
  selectProject(project: AccountProject, provider: string, accountId: string | null, expectedAccountId: string | null): Promise<ProjectAccount>;
}
