import type { StatusTranslations } from "./translations";

export const en: StatusTranslations = {
  statusCleanTitle: "Everything is saved",
  statusChangesTitle: "You have unsaved changes",
  statusChangesMessage: (total) =>
    total === 1 ? "1 file changed since your last saved version." : `${total} files changed since your last saved version.`,
  statusConflictsTitle: "Some files need your attention",
  statusConflictsMessage: (conflicted) =>
    conflicted === 1
      ? "1 file has overlapping changes to resolve before you can save."
      : `${conflicted} files have overlapping changes to resolve before you can save.`,
  statusCheckingTitle: "Checking for changes…",
  statusCheckingMessage: "Looking at your project files.",
  statusCheckFailedTitle: "Couldn't check for changes",
  statusCouldntCheck: "Couldn't check what changed in this project.",
  statusRefresh: "Check for changes",
  statusRefreshing: "Checking…",
  statusBreakdownLabel: "What changed",
  statusCategoryChanged: (count) => (count === 1 ? "1 edited" : `${count} edited`),
  statusCategoryNew: (count) => (count === 1 ? "1 new" : `${count} new`),
  statusCategoryDeleted: (count) => (count === 1 ? "1 deleted" : `${count} deleted`),
  statusCategoryRenamed: (count) => (count === 1 ? "1 renamed" : `${count} renamed`),
  statusCategoryConflicted: (count) => (count === 1 ? "1 needs attention" : `${count} need attention`),
  statusTruncatedNote: (shown) => `Showing the first ${shown} files, but the totals include every change.`,
  statusRefreshFailedNote: "The latest check failed, so this is the last known result.",
};

