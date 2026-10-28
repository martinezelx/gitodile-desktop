export interface StatusTranslations {
  statusCleanTitle: string;
  statusChangesTitle: string;
  statusChangesMessage: (total: number) => string;
  statusConflictsTitle: string;
  statusConflictsMessage: (conflicted: number) => string;
  statusCheckingTitle: string;
  statusCheckingMessage: string;
  statusCheckFailedTitle: string;
  statusCouldntCheck: string;
  statusRefresh: string;
  statusRefreshing: string;
  statusBreakdownLabel: string;
  statusCategoryChanged: (count: number) => string;
  statusCategoryNew: (count: number) => string;
  statusCategoryDeleted: (count: number) => string;
  statusCategoryRenamed: (count: number) => string;
  statusCategoryConflicted: (count: number) => string;
  statusTruncatedNote: (shown: number) => string;
  statusRefreshFailedNote: string;
}
