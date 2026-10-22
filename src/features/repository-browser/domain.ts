export type HostedRepository = {
  id: number; name: string; fullName: string; owner: string;
  private: boolean; archived: boolean; description: string | null; cloneUrl: string;
};
export type RepositoryPage = {
  accountId: string; page: number; repositories: HostedRepository[]; nextPage: number | null;
};
export type RepositoryChoice = { repository: HostedRepository; accountId: string };
export type RepositoryBrowserState = {
  accountId: string | null; page: RepositoryPage | null; pending: boolean; error: unknown;
};
