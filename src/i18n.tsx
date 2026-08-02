import React, { createContext, useContext, useEffect, useState } from "react";
import { locale as getOsLocale } from "@tauri-apps/plugin-os";

export type Language = "en" | "es";
export type LanguagePreference = "system" | Language;

const LANGUAGE_STORAGE_KEY = "gitodrile-language";

// Names of the languages themselves are shown in their own language
// regardless of the active UI language (so a user can always find their
// language), so they live outside the translated dictionary below.
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
};

// Pure on purpose: takes a raw locale string (from the OS, or
// navigator.language) and resolves it to one of the languages GitOdrile
// actually ships. Unknown languages fall back to English.
export function resolveLanguage(locale: string | null | undefined): Language {
  if (!locale) {
    return "en";
  }
  const primarySubtag = locale.split(/[-_]/)[0]?.toLowerCase();
  return primarySubtag === "es" ? "es" : "en";
}

export interface Translations {
  titlebarOpenCommandPalette: string;
  titlebarJumpToHint: string;
  titlebarMoreActions: string;
  titlebarOpenProject: string;
  titlebarReloadWindow: string;
  titlebarReloadBlocked: string;
  titlebarReportIssue: string;
  titlebarKeyboardShortcuts: string;
  shortcutsDialogTitle: string;
  shortcutsOpenPalette: string;
  shortcutsNextProject: string;
  shortcutsPreviousProject: string;
  shortcutsCloseDialogs: string;
  titlebarGoBack: string;
  titlebarGoForward: string;
  titlebarHistoryControls: string;
  alphaBadge: string;
  alphaBadgeAriaLabel: string;
  windowMinimize: string;
  windowMaximize: string;
  windowClose: string;
  windowControls: string;

  brandTagline: string;
  sidebarCollapse: string;
  sidebarExpand: string;
  navProjectAriaLabel: string;
  navApplicationAriaLabel: string;
  navOverview: string;
  navChanges: string;
  navChangesTitle: string;
  navVersionLines: string;
  navVersionLinesTitle: string;
  navHistory: string;
  navHistoryTitle: string;
  navRecovery: string;
  navRecoveryTitle: string;
  navSettings: string;

  paletteAriaLabel: string;
  palettePlaceholder: string;
  paletteNoMatches: string;

  commandGoOverview: string;
  commandGoVersionLines: string;
  commandNewVersionLine: string;
  commandGoSettings: string;
  commandUseSystemTheme: string;
  commandUseLightTheme: string;
  commandUseDarkTheme: string;
  commandCloseActiveProject: string;
  commandSwitchToProject: (name: string) => string;

  overviewRepositoryBranch: (branch: string) => string;
  overviewWorktreeBranch: (branch: string) => string;
  overviewRepositoryDetached: string;
  overviewWorktreeDetached: string;
  overviewRepositoryUnborn: (branch: string) => string;
  overviewWorktreeUnborn: (branch: string) => string;
  overviewLocalProject: string;
  overviewSeparateWorkspace: string;
  overviewProjectReady: string;
  overviewWorktreeReady: string;
  overviewUnbornReady: string;
  overviewDetachedReady: string;
  overviewOpenAnotherProject: string;
  projectSwitcherAriaLabel: string;
  projectSwitchToLabel: (name: string) => string;
  projectSwitcherCloseLabel: (name: string) => string;
  projectSwitcherUnsavedIndicator: string;
  projectSwitcherOperationIndicator: string;
  projectSwitcherErrorIndicator: string;
  projectSwitcherCollapsedTrigger: string;
  projectSwitcherSwitchBlockedHint: string;
  projectSwitcherEmptyHint: string;
  projectSwitcherActiveAnnouncement: (name: string) => string;
  projectSwitcherMutationBlocked: (name: string) => string;
  projectSwitcherCloseBlocked: (name: string) => string;
  overviewCurrentVersionLine: string;
  overviewVersionLineActionsTitle: string;
  overviewVersionLineActionsDescription: string;
  overviewSpecificSavedVersion: string;
  overviewNoSavedVersions: string;
  overviewVersionLineDescription: string;
  overviewDetachedDescription: string;
  overviewUnbornDescription: string;
  overviewOpenedFrom: string;
  overviewProjectType: string;
  overviewRepositoryTypeDescription: string;
  overviewWorktreeTypeDescription: string;
  overviewTechnicalDetails: string;
  overviewResolvedRoot: string;
  overviewSelectedFolder: string;
  overviewGitDirectory: string;
  overviewCommonGitDirectory: string;
  overviewCopyPath: string;
  overviewPathCopied: string;
  overviewCopyPathFailedTitle: string;
  overviewCopyPathFailedMessage: string;
  overviewOpeningTitle: string;
  overviewOpeningDescription: string;
  overviewOpenFailedTitle: string;
  overviewReviewChanges: string;
  statusCleanTitle: string;
  statusCleanMessage: string;
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

  changesHeading: string;
  changesSummaryClean: string;
  changesSummaryTotal: (total: number) => string;
  changesSummaryWithConflicts: (conflicted: number, total: number) => string;
  changesEmptyTitle: string;
  changesEmptyDescription: string;
  changesBackToOverview: string;
  changesBackToList: string;
  changesListAriaLabel: string;
  changesCategoryLabelChanged: string;
  changesCategoryLabelNew: string;
  changesCategoryLabelDeleted: string;
  changesCategoryLabelRenamed: string;
  changesCategoryLabelConflicted: string;
  changesRenamedFrom: (original: string) => string;
  changesSelectionAnnouncement: (path: string) => string;
  changesDiffLoadingTitle: string;
  changesDiffErrorTitle: string;
  changesDiffRetry: string;
  changesDiffBinaryTitle: string;
  changesDiffBinaryDescription: string;
  changesDiffTooLargeTitle: string;
  changesDiffTooLargeDescription: (limit: string) => string;
  changesDiffUnchangedTitle: string;
  changesDiffUnchangedDescription: string;
  changesDiffConflictTitle: string;
  changesDiffConflictDescription: string;
  changesDiffConflictUnavailable: string;
  changesDiffConflictBinary: string;
  changesDiffConflictTooLarge: string;
  changesDiffAriaLabel: (path: string) => string;
  changesDiffHiddenLines: (count: number) => string;
  changesDiffTruncatedNote: (shownLines: number) => string;
  changesLineAddedLabel: string;
  changesLineRemovedLabel: string;

  changesSaveVersion: string;
  changesSaveVersionDisabledHint: string;
  changesSaveVersionNoSelectionHint: string;
  changesSelectionSummary: (selected: number, total: number) => string;
  changesSelectAll: string;
  changesSelectNone: string;
  changesIncludeFile: (path: string) => string;
  changesPartialUnavailableTruncated: string;
  changesProjectRoot: string;
  saveVersionDialogTitle: string;
  saveVersionDialogTitleFirst: string;
  saveVersionLoadingTitle: string;
  saveVersionTitleLabel: string;
  saveVersionTitlePlaceholder: string;
  saveVersionTitleGuidance: string;
  saveVersionDescriptionLabel: string;
  saveVersionDescriptionPlaceholder: string;
  saveVersionFilesSummary: (total: number) => string;
  saveVersionRemainingNote: (remaining: number) => string;
  saveVersionPreparedNote: string;
  saveVersionFirstVersionNote: string;
  saveVersionLocalOnlyNote: string;
  saveVersionConfirm: string;
  saveVersionSaving: string;
  saveVersionRetry: string;
  saveVersionShowDetail: string;
  saveVersionHideDetail: string;
  saveVersionDetailHeading: string;
  saveVersionSuccessTitle: string;
  saveVersionSuccessDescription: (title: string, shortCommit: string) => string;
  saveVersionSuccessLocalNote: string;
  saveVersionPublishNow: string;
  saveVersionDone: string;

  publishDialogTitle: string;
  publishDialogTitleFirst: string;
  publishLoadingTitle: string;
  publishChooseRemoteTitle: string;
  publishChooseRemoteDescription: string;
  publishSummary: (remote: string, branch: string) => string;
  publishDestinationLabel: string;
  publishWillPublishLabel: string;
  publishWillStayLabel: string;
  publishVisibilityLabel: string;
  publishCommitCount: (count: number) => string;
  publishCommitListLabel: string;
  publishLoadingFiles: string;
  publishFilesError: string;
  publishLoadingDiff: string;
  publishDiffError: string;
  publishUpstreamNote: string;
  publishUnsavedFilesNote: string;
  publishUnsavedChangesPill: string;
  publishRemainingNote: (count: number) => string;
  publishTeammatesNote: string;
  publishConfirm: string;
  publishPublishing: string;
  publishVerifying: string;
  publishCannotCloseNote: string;
  publishReviewUpdatedPlan: string;
  publishCheckRemoteAgain: string;
  publishSuccessTitle: string;
  publishSuccessDescription: (count: number, remote: string) => string;
  publishSuccessUpstreamNote: string;
  publishDone: string;

  versionLinesTitle: string;
  versionLinesExplanation: string;
  versionLinesSearchPlaceholder: string;
  versionLinesSearchAriaLabel: string;
  versionLinesFilterAllLabel: string;
  versionLinesFilterAriaLabel: string;
  versionLinesNoProjectTitle: string;
  versionLinesNoProjectDescription: string;
  versionLinesLoading: string;
  versionLinesErrorLoading: string;
  versionLinesRetry: string;
  versionLinesActiveLabel: string;
  versionLinesNewButton: string;
  versionLinesEmptyOthers: string;
  versionLinesNoSearchMatches: string;
  versionLinesTruncatedNote: (visible: number, total: number) => string;
  versionLinesUnreadableNote: (count: number) => string;
  versionLinesDetachedTitle: string;
  versionLinesDetachedDescription: string;
  versionLinesDetachedRecoverButton: string;
  versionLinesUnbornTitle: string;
  versionLinesUnbornDescription: string;
  versionLinesSwitchButton: string;
  versionLinesDeleteButton: string;
  versionLinesUpstreamLabel: (upstream: string) => string;
  versionLinesNoUpstreamLabel: string;
  versionLinesCheckedOutElsewhere: (path: string) => string;
  versionLinesUniqueCommits: (count: number) => string;
  versionLinesTechnicalDetails: string;
  versionLinesRefNameLabel: string;
  versionLinesTipCommitLabel: string;
  versionLinesSavedLabel: (date: string) => string;

  createVersionLineTitle: string;
  createVersionLineNameLabel: string;
  createVersionLineNamePlaceholder: string;
  createVersionLineSwitchLabel: string;
  createVersionLineWithoutSwitchLabel: string;
  createVersionLineDetachedNote: string;
  createVersionLineUnsavedNote: string;
  createVersionLineUnbornBlocked: string;
  createVersionLineConfirm: string;
  createVersionLineCreating: string;
  createVersionLineSuccessTitle: string;
  createVersionLineDone: string;

  switchVersionLineTitle: (to: string) => string;
  switchVersionLineLoading: string;
  switchVersionLineChangedFiles: (count: number) => string;
  switchVersionLineChangedFilesTruncated: (visible: number, total: number) => string;
  switchVersionLineDirtyTitle: string;
  switchVersionLineDirtyDescription: string;
  switchVersionLineSaveVersionAction: string;
  switchVersionLineNewLineAction: string;
  switchVersionLineConfirm: string;
  switchVersionLineSwitching: string;
  switchVersionLineSuccessTitle: string;
  switchVersionLineDone: string;

  deleteVersionLineTitle: (name: string) => string;
  deleteVersionLineRetainedBy: (refs: string) => string;
  deleteVersionLineWarning: string;
  deleteVersionLineConfirm: string;
  deleteVersionLineDeleting: string;
  deleteVersionLineSuccessTitle: string;
  deleteVersionLineDone: string;

  overviewChangeVersionLine: string;
  overviewNewVersionLine: string;
  overviewQuickSwitchTitle: string;
  overviewQuickSwitchEmpty: string;
  overviewQuickSwitchSeeAll: string;

  overviewPublishChanges: string;
  overviewPendingVersionsTitle: (count: number) => string;
  overviewPendingVersionsGuidance: string;
  overviewPendingVersionsTruncated: (visible: number, total: number) => string;
  overviewPendingVersionsError: string;
  overviewSavedAndReadyTitle: string;
  overviewSavedAndReadyMessage: (count: number) => string;
  overviewPublishUpTo: string;
  overviewCloseProject: string;
  overviewEmptyTitle: string;
  overviewEmptyDescription: string;
  overviewOpening: string;
  overviewOpenProject: string;
  overviewCloneComingSoonTitle: string;
  overviewCloneFromGithub: string;
  overviewOpenDialogTitle: string;
  overviewCouldntOpenFolder: string;
  errorPathMissing: string;
  errorPathUnusable: string;
  errorNotRepository: string;
  errorBareRepository: string;
  errorGitMissing: string;
  errorGitUnusable: string;
  errorGitCommandFailed: string;
  errorInvalidIdentity: string;
  errorGitConfigWriteFailed: string;
  errorPathInvalid: string;
  errorPathNotChanged: string;
  errorPathEncodingUnsupported: string;
  errorNothingToSave: string;
  errorUnresolvedConflicts: string;
  errorDetachedHead: string;
  errorGitOperationInProgress: string;
  errorMissingIdentity: string;
  errorEmptyTitle: string;
  errorInvalidTitle: string;
  errorStalePreview: string;
  errorHookRejected: string;
  errorSigningFailed: string;
  errorIndexUnavailable: string;
  errorIndexRestoreFailed: string;
  errorInvalidSelection: string;
  errorNoRemoteConfigured: string;
  errorRemoteSelectionRequired: string;
  errorUnbornBranchNoVersion: string;
  errorNothingToPublish: string;
  errorBehindRemote: string;
  errorDivergedHistories: string;
  errorStalePublishPlan: string;
  errorInvalidRefName: string;
  errorAuthenticationFailed: string;
  errorNetworkTimeout: string;
  errorRemoteRejected: string;
  errorPublishUncertain: string;
  errorGitVersionTooOld: string;
  errorVersionLineNameTaken: string;
  errorVersionLineNameCollides: string;
  errorVersionLineCheckedOutElsewhere: string;
  errorVersionLineIsActive: string;
  errorVersionLineUniqueWork: string;
  errorVersionLineSwitchObstructed: string;
  errorStaleVersionLinePlan: string;
  errorDirtyWorkingTree: string;
  errorRefLocked: string;

  settingsAppearanceTitle: string;
  settingsAppearanceDescription: string;
  settingsDialogDescription: string;
  settingsSectionsAriaLabel: string;
  settingsGitTitle: string;
  settingsGitDescription: string;
  settingsGitInstallationDescription: string;
  themeAriaLabel: string;
  commonSystem: string;
  themeLight: string;
  themeDark: string;
  titlebarSwitchToLightTheme: string;
  titlebarSwitchToDarkTheme: string;

  settingsGeneralTitle: string;
  settingsGeneralDescription: string;
  commonVersion: string;
  settingsGeneralGitLabel: string;
  settingsGeneralChecking: string;
  settingsGeneralUpdateAvailable: string;
  settingsGeneralGitMissing: string;
  settingsGeneralGitUnusable: string;
  settingsGeneralGitCheckFailed: string;
  settingsGeneralCheckAgain: string;
  settingsGeneralInstallGit: string;
  settingsGeneralUpdate: string;
  gitStartingInstaller: string;
  gitInstallerLaunched: string;
  gitInstallerAlreadyStarting: string;
  gitInstallerFailedWithGuidance: string;
  gitWindowsGuidanceOpened: string;
  gitMacosGuidanceOpened: string;
  gitLinuxGuidanceOpened: string;
  gitUpdateNotChecked: string;
  gitUpdateCheck: string;
  gitUpdateChecking: string;
  gitUpdateUpToDate: string;
  gitUpdateCheckerUnavailable: string;
  gitUpdateCheckFailed: string;
  gitUpdateCheckTimedOut: string;
  gitUpdateStarting: string;
  gitUpdateLaunched: string;
  gitUpdateAlreadyStarting: string;
  gitCouldntStart: string;

  settingsIdentityTitle: string;
  settingsIdentityDescription: string;
  identityNameLabel: string;
  identityEmailLabel: string;
  identityNamePlaceholder: string;
  identityEmailPlaceholder: string;
  identitySave: string;
  identitySaving: string;
  identitySaved: string;
  identityModify: string;
  identityCouldntSave: string;

  settingsStartupTitle: string;
  settingsStartupDescription: string;
  startupReopenLabel: string;
  startupReopenDescription: string;
  startupRestoreSkippedNotice: (count: number) => string;

  settingsSafetyTitle: string;
  settingsSafetyDescription: string;
  safetyConfirmLabel: string;
  safetyConfirmDescription: string;

  settingsLanguageTitle: string;
  settingsLanguageDescription: string;
  languageAriaLabel: string;

  aboutGitOdrile: string;
  aboutHeading: string;
  aboutDescription: string;
  aboutFooterMadeWith: string;
  commonClose: string;
  commonLoading: string;

  closeConfirmTitle: string;
  closeConfirmBodyGeneric: string;
  closeConfirmBodyNamed: (name: string) => string;
  commonCancel: string;
}

const en: Translations = {
  titlebarOpenCommandPalette: "Open command palette",
  titlebarJumpToHint: "Jump to a view or action",
  titlebarMoreActions: "More actions",
  titlebarOpenProject: "Open project",
  titlebarReloadWindow: "Reload window",
  titlebarReloadBlocked: "Finish the current project operation before reloading.",
  titlebarReportIssue: "Report an issue",
  titlebarKeyboardShortcuts: "Keyboard shortcuts",
  shortcutsDialogTitle: "Keyboard shortcuts",
  shortcutsOpenPalette: "Open command palette",
  shortcutsNextProject: "Next project",
  shortcutsPreviousProject: "Previous project",
  shortcutsCloseDialogs: "Close dialogs and menus",
  titlebarGoBack: "Go back",
  titlebarGoForward: "Go forward",
  titlebarHistoryControls: "Navigation history",
  alphaBadge: "alpha",
  alphaBadgeAriaLabel: "Development version: alpha",
  windowMinimize: "Minimize window",
  windowMaximize: "Maximize or restore window",
  windowClose: "Close window",
  windowControls: "Window controls",

  brandTagline: "Git without the bite",
  sidebarCollapse: "Collapse sidebar",
  sidebarExpand: "Expand sidebar",
  navProjectAriaLabel: "Project navigation",
  navApplicationAriaLabel: "Application",
  navOverview: "Overview",
  navChanges: "Changes",
  navChangesTitle: "Changes — Open a project first",
  navVersionLines: "Version lines",
  navVersionLinesTitle: "Version lines — Open a project first",
  navHistory: "History",
  navHistoryTitle: "History — Coming soon",
  navRecovery: "Recovery",
  navRecoveryTitle: "Recovery — Coming soon",
  navSettings: "Settings",

  paletteAriaLabel: "Command palette",
  palettePlaceholder: "Jump to a view or action…",
  paletteNoMatches: "No matching commands",

  commandGoOverview: "Go to Overview",
  commandGoVersionLines: "Go to Version lines",
  commandNewVersionLine: "New version line",
  commandGoSettings: "Go to Settings",
  commandUseSystemTheme: "Use system theme",
  commandUseLightTheme: "Use light theme",
  commandUseDarkTheme: "Use dark theme",
  commandCloseActiveProject: "Close active project",
  commandSwitchToProject: (name) => `Switch to ${name}`,

  overviewRepositoryBranch: (branch) => `Git project on version line “${branch}”.`,
  overviewWorktreeBranch: (branch) => `Separate workspace on version line “${branch}”.`,
  overviewRepositoryDetached: "Git project opened at a specific saved version.",
  overviewWorktreeDetached: "Separate workspace opened at a specific saved version.",
  overviewRepositoryUnborn: (branch) => `New Git project on version line “${branch}”, with no saved versions yet.`,
  overviewWorktreeUnborn: (branch) => `New separate workspace on version line “${branch}”, with no saved versions yet.`,
  overviewLocalProject: "Local project",
  overviewSeparateWorkspace: "Separate workspace",
  overviewProjectReady: "Your project is ready",
  overviewWorktreeReady: "Your separate workspace is ready",
  overviewUnbornReady: "Your new project is ready",
  overviewDetachedReady: "A specific saved version is open",
  overviewOpenAnotherProject: "Open another project",
  projectSwitcherAriaLabel: "Open projects",
  projectSwitchToLabel: (name) => `Switch to ${name}`,
  projectSwitcherCloseLabel: (name) => `Close ${name}`,
  projectSwitcherUnsavedIndicator: "Has unsaved changes",
  projectSwitcherOperationIndicator: "Operation in progress",
  projectSwitcherErrorIndicator: "Needs attention",
  projectSwitcherCollapsedTrigger: "Switch project",
  projectSwitcherSwitchBlockedHint: "Finish the open dialog before switching projects",
  projectSwitcherEmptyHint: "Your open projects will show up here.",
  projectSwitcherActiveAnnouncement: (name) => `${name} is now the active project.`,
  projectSwitcherMutationBlocked: (name) =>
    `Wait for the operation in ${name} to finish before starting another one in a linked workspace.`,
  projectSwitcherCloseBlocked: (name) =>
    `Wait for the operation in ${name} to finish. You can keep working in another project meanwhile.`,
  overviewCurrentVersionLine: "Current version line",
  overviewVersionLineActionsTitle: "Work separately",
  overviewVersionLineActionsDescription: "Switch where new work goes, or create a separate version line.",
  overviewSpecificSavedVersion: "Specific saved version",
  overviewNoSavedVersions: "No saved versions yet",
  overviewVersionLineDescription: "New work will stay on this version line.",
  overviewDetachedDescription: "You are inspecting an exact point in the project history.",
  overviewUnbornDescription: "The first saved version will start this project’s history.",
  overviewOpenedFrom: "Opened from a folder inside this project",
  overviewProjectType: "Project type",
  overviewRepositoryTypeDescription: "A standard project stored in this folder.",
  overviewWorktreeTypeDescription: "A linked workspace with its own files and version line.",
  overviewTechnicalDetails: "Technical project details",
  overviewResolvedRoot: "Project root",
  overviewSelectedFolder: "Folder you selected",
  overviewGitDirectory: "Git directory",
  overviewCommonGitDirectory: "Shared Git directory",
  overviewCopyPath: "Copy project path",
  overviewPathCopied: "Path copied",
  overviewCopyPathFailedTitle: "Couldn't copy the path",
  overviewCopyPathFailedMessage: "Select the project path and copy it manually.",
  overviewOpeningTitle: "Opening project…",
  overviewOpeningDescription: "GitOdrile is checking the selected folder.",
  overviewOpenFailedTitle: "We couldn’t open that project",
  overviewReviewChanges: "Review changes",
  statusCleanTitle: "Everything is saved",
  statusCleanMessage: "You have no unsaved changes in this project.",
  statusChangesTitle: "You have unsaved changes",
  statusChangesMessage: (total) =>
    total === 1 ? "1 file has changed since your last saved version." : `${total} files have changed since your last saved version.`,
  statusConflictsTitle: "Some files need your attention",
  statusConflictsMessage: (conflicted) =>
    conflicted === 1
      ? "1 file has overlapping changes that have to be resolved before you can save."
      : `${conflicted} files have overlapping changes that have to be resolved before you can save.`,
  statusCheckingTitle: "Checking for changes…",
  statusCheckingMessage: "GitOdrile is looking at your project files.",
  statusCheckFailedTitle: "We couldn’t check for changes",
  statusCouldntCheck: "GitOdrile couldn’t check what changed in this project.",
  statusRefresh: "Check for changes",
  statusRefreshing: "Checking…",
  statusBreakdownLabel: "What changed",
  statusCategoryChanged: (count) => (count === 1 ? "1 edited" : `${count} edited`),
  statusCategoryNew: (count) => (count === 1 ? "1 new" : `${count} new`),
  statusCategoryDeleted: (count) => (count === 1 ? "1 deleted" : `${count} deleted`),
  statusCategoryRenamed: (count) => (count === 1 ? "1 renamed" : `${count} renamed`),
  statusCategoryConflicted: (count) => (count === 1 ? "1 needs attention" : `${count} need attention`),
  statusTruncatedNote: (shown) => `Showing the first ${shown} files. The totals above cover every change.`,
  statusRefreshFailedNote: "This is the last result we could read. The latest check didn’t work.",

  changesHeading: "Changes",
  changesSummaryClean: "Everything is saved. There is nothing to review.",
  changesSummaryTotal: (total) => (total === 1 ? "1 file has unsaved changes." : `${total} files have unsaved changes.`),
  changesSummaryWithConflicts: (conflicted, total) =>
    conflicted === total
      ? conflicted === 1
        ? "1 file needs your attention."
        : `${conflicted} files need your attention.`
      : `${conflicted} of ${total} files need your attention.`,
  changesEmptyTitle: "Nothing to review",
  changesEmptyDescription: "Every saved file matches the latest saved version. Come back after you make changes.",
  changesBackToOverview: "Back to Overview",
  changesBackToList: "Back to the file list",
  changesListAriaLabel: "Changed files",
  changesCategoryLabelChanged: "Edited",
  changesCategoryLabelNew: "New",
  changesCategoryLabelDeleted: "Deleted",
  changesCategoryLabelRenamed: "Renamed",
  changesCategoryLabelConflicted: "Needs attention",
  changesRenamedFrom: (original) => `Renamed from ${original}`,
  changesSelectionAnnouncement: (path) => `Now showing the difference for ${path}.`,
  changesDiffLoadingTitle: "Reading the difference…",
  changesDiffErrorTitle: "We couldn’t read this file’s difference",
  changesDiffRetry: "Try again",
  changesDiffBinaryTitle: "This file can’t be previewed as text",
  changesDiffBinaryDescription: "GitOdrile can tell this file changed, but its contents aren’t readable as text.",
  changesDiffTooLargeTitle: "This difference is too large to show here",
  changesDiffTooLargeDescription: (limit) =>
    `This file’s difference is larger than ${limit}, GitOdrile’s safety limit for reviewing changes here. The file itself is unaffected.`,
  changesDiffUnchangedTitle: "No content changed",
  changesDiffUnchangedDescription: "Only the file’s name or permissions changed. There is no text difference to show.",
  changesDiffConflictTitle: "This file needs your attention",
  changesDiffConflictDescription:
    "GitOdrile is showing the current conflict markers for information only. Resolving conflicts isn’t supported here yet.",
  changesDiffConflictUnavailable: "GitOdrile couldn’t read the current conflict markers for this file.",
  changesDiffConflictBinary: "This file’s contents aren’t readable as text, so its conflict markers can’t be shown.",
  changesDiffConflictTooLarge: "The conflict is too large to preview safely here.",
  changesDiffAriaLabel: (path) => `Difference for ${path}`,
  changesDiffHiddenLines: (count) => (count === 1 ? "1 unchanged line" : `${count} unchanged lines`),
  changesDiffTruncatedNote: (shownLines) => `Showing the first ${shownLines} lines of this difference.`,
  changesLineAddedLabel: "Added:",
  changesLineRemovedLabel: "Removed:",

  changesSaveVersion: "Save version",
  changesSaveVersionDisabledHint: "Make some changes first, then come back to save a version.",
  changesSaveVersionNoSelectionHint: "Choose at least one file to save.",
  changesSelectionSummary: (selected, total) => `${selected}/${total}`,
  changesSelectAll: "Select all",
  changesSelectNone: "Select none",
  changesIncludeFile: (path) => `Include ${path} in this version`,
  changesPartialUnavailableTruncated:
    "This project has more changed files than can be listed safely. Save all changes before using file selection.",
  changesProjectRoot: "Project root",
  saveVersionDialogTitle: "Save version",
  saveVersionDialogTitleFirst: "Save your first version",
  saveVersionLoadingTitle: "Preparing a preview…",
  saveVersionTitleLabel: "Version name",
  saveVersionTitlePlaceholder: "Summarize what changed…",
  saveVersionTitleGuidance: "Around 50 characters is easy to scan, but longer names are allowed.",
  saveVersionDescriptionLabel: "More details (optional)",
  saveVersionDescriptionPlaceholder: "Add more context, if useful…",
  saveVersionFilesSummary: (total) => (total === 1 ? "1 file will be saved." : `${total} files will be saved.`),
  saveVersionRemainingNote: (remaining) =>
    remaining === 1 ? "1 other file will remain as a pending change." : `${remaining} other files will remain as pending changes.`,
  saveVersionPreparedNote:
    "Some selected changes were prepared earlier with another Git tool. They will be saved together with this selection.",
  saveVersionFirstVersionNote: "This will be this project's first saved version.",
  saveVersionLocalOnlyNote: "This creates a saved version on this computer only. Nothing is sent anywhere yet.",
  saveVersionConfirm: "Save version",
  saveVersionSaving: "Saving your version…",
  saveVersionRetry: "Try again",
  saveVersionShowDetail: "Show technical details",
  saveVersionHideDetail: "Hide technical details",
  saveVersionDetailHeading: "Technical details",
  saveVersionSuccessTitle: "Version saved",
  saveVersionSuccessDescription: (title, shortCommit) => `Saved "${title}" as ${shortCommit}.`,
  saveVersionSuccessLocalNote: "Saved on this computer. Not published to a remote project yet.",
  saveVersionPublishNow: "Publish now",
  saveVersionDone: "Done",

  publishDialogTitle: "Publish changes",
  publishDialogTitleFirst: "Publish for the first time",
  publishLoadingTitle: "Checking what's ready to publish…",
  publishChooseRemoteTitle: "Choose a remote project",
  publishChooseRemoteDescription:
    "This project has more than one remote project configured. Choose where to publish.",
  publishSummary: (remote, branch) => `Publish to "${remote}" (${branch}).`,
  publishDestinationLabel: "Destination",
  publishWillPublishLabel: "Will be published",
  publishWillStayLabel: "Will stay on this computer",
  publishVisibilityLabel: "Who can see it",
  publishCommitCount: (count) =>
    count === 1 ? "1 saved version will be published." : `${count} saved versions will be published.`,
  publishCommitListLabel: "Versions being published",
  publishLoadingFiles: "Loading changed files…",
  publishFilesError: "Couldn't load the changed files.",
  publishLoadingDiff: "Loading line changes…",
  publishDiffError: "Couldn't load this file's line changes.",
  publishUpstreamNote: "This version line will start tracking the remote branch.",
  publishUnsavedFilesNote: "Unsaved files on this computer will stay local — only saved versions are published.",
  publishUnsavedChangesPill: "Unsaved file changes",
  publishRemainingNote: (count) =>
    count === 1
      ? "1 other saved version will stay unpublished for now."
      : `${count} other saved versions will stay unpublished for now.`,
  publishTeammatesNote: "Teammates with access to this remote project will be able to see the published history.",
  publishConfirm: "Publish now",
  publishPublishing: "Publishing…",
  publishVerifying: "Checking the result…",
  publishCannotCloseNote: "Keep this window open while GitOdrile confirms the remote result.",
  publishReviewUpdatedPlan: "Review updated plan",
  publishCheckRemoteAgain: "Check remote again",
  publishSuccessTitle: "Published",
  publishSuccessDescription: (count, remote) =>
    count === 1
      ? `1 saved version was published to "${remote}".`
      : `${count} saved versions were published to "${remote}".`,
  publishSuccessUpstreamNote: "This version line now tracks the remote branch.",
  publishDone: "Done",

  versionLinesTitle: "Version lines",
  versionLinesExplanation:
    "A version line is a separate track for your saved versions. Git calls this a branch. Switching moves your files to that line's latest saved version; nothing here touches the remote project.",
  versionLinesSearchPlaceholder: "Search version lines…",
  versionLinesSearchAriaLabel: "Search version lines",
  versionLinesFilterAllLabel: "All",
  versionLinesFilterAriaLabel: "Filter by name prefix",
  versionLinesNoProjectTitle: "No project open",
  versionLinesNoProjectDescription: "Open a project to see and manage its version lines.",
  versionLinesLoading: "Loading version lines…",
  versionLinesErrorLoading: "GitOdrile couldn't load this project's version lines.",
  versionLinesRetry: "Try again",
  versionLinesActiveLabel: "Active",
  versionLinesNewButton: "New version line",
  versionLinesEmptyOthers: "There are no other version lines in this project yet.",
  versionLinesNoSearchMatches: "No version lines match that search.",
  versionLinesTruncatedNote: (visible, total) => `Showing the ${visible} most recently saved of ${total}.`,
  versionLinesUnreadableNote: (count) =>
    count === 1
      ? "One version line isn't shown: its name uses characters GitOdrile can't read exactly. Use Git directly to rename it."
      : `${count} version lines aren't shown: their names use characters GitOdrile can't read exactly. Use Git directly to rename them.`,
  versionLinesDetachedTitle: "This project isn't on a version line right now",
  versionLinesDetachedDescription:
    "You're looking at one specific saved version. Create a named version line here to keep this work easy to find.",
  versionLinesDetachedRecoverButton: "Create a version line here",
  versionLinesUnbornTitle: "Save a version first",
  versionLinesUnbornDescription: "This version line has no saved versions yet, so there's nothing to branch from.",
  versionLinesSwitchButton: "Switch to this line",
  versionLinesDeleteButton: "Delete line",
  versionLinesUpstreamLabel: (upstream) => `Tracks ${upstream}`,
  versionLinesNoUpstreamLabel: "Not published to a remote",
  versionLinesCheckedOutElsewhere: (path) => `Open in another workspace at ${path}. Switch to it from there.`,
  versionLinesUniqueCommits: (count) =>
    count === 1 ? "1 saved version not on the active line" : `${count} saved versions not on the active line`,
  versionLinesTechnicalDetails: "Technical details",
  versionLinesRefNameLabel: "Branch name",
  versionLinesTipCommitLabel: "Latest commit",
  versionLinesSavedLabel: (date) => `Saved ${date}`,

  createVersionLineTitle: "New version line",
  createVersionLineNameLabel: "Name",
  createVersionLineNamePlaceholder: "e.g. feature/new-onboarding",
  createVersionLineSwitchLabel: "Create and switch to it",
  createVersionLineWithoutSwitchLabel: "Create without switching",
  createVersionLineDetachedNote:
    "This project isn't on a version line right now, so GitOdrile will switch to the new one to keep this commit easy to find.",
  createVersionLineUnsavedNote:
    "Your unsaved files and prepared changes stay exactly as they are. Future saved versions will belong to the new version line.",
  createVersionLineUnbornBlocked: "Save the first version before creating another version line.",
  createVersionLineConfirm: "Create",
  createVersionLineCreating: "Creating…",
  createVersionLineSuccessTitle: "Version line created",
  createVersionLineDone: "Done",

  switchVersionLineTitle: (to) => `Switch to “${to}”`,
  switchVersionLineLoading: "Comparing version lines…",
  switchVersionLineChangedFiles: (count) =>
    count === 1 ? "1 file will change." : `${count} files will change.`,
  switchVersionLineChangedFilesTruncated: (visible, total) => `Showing ${visible} of ${total} changed files.`,
  switchVersionLineDirtyTitle: "This project has unsaved changes",
  switchVersionLineDirtyDescription:
    "GitOdrile can't switch version lines with unsaved work in the way. Save a version, or start a new version line with this work instead.",
  switchVersionLineSaveVersionAction: "Save version",
  switchVersionLineNewLineAction: "New version line with this work",
  switchVersionLineConfirm: "Switch",
  switchVersionLineSwitching: "Switching…",
  switchVersionLineSuccessTitle: "Switched version lines",
  switchVersionLineDone: "Done",

  deleteVersionLineTitle: (name) => `Delete “${name}”?`,
  deleteVersionLineRetainedBy: (refs) => `Its saved work stays reachable from: ${refs}.`,
  deleteVersionLineWarning: "This can't be undone from GitOdrile.",
  deleteVersionLineConfirm: "Delete",
  deleteVersionLineDeleting: "Deleting…",
  deleteVersionLineSuccessTitle: "Version line deleted",
  deleteVersionLineDone: "Done",

  overviewChangeVersionLine: "Change",
  overviewNewVersionLine: "New",
  overviewQuickSwitchTitle: "Switch version line",
  overviewQuickSwitchEmpty: "There are no other version lines yet.",
  overviewQuickSwitchSeeAll: "See all version lines",

  overviewPublishChanges: "Publish changes",
  overviewPendingVersionsTitle: (count) => `Saved versions not yet published (${count})`,
  overviewPendingVersionsGuidance:
    "Newest first. Publishing through a version also publishes every older version below it.",
  overviewPendingVersionsTruncated: (visible, total) => `Showing the ${visible} newest of ${total}.`,
  overviewPendingVersionsError: "GitOdrile couldn't load the saved versions waiting to be published.",
  overviewSavedAndReadyTitle: "Your files are saved",
  overviewSavedAndReadyMessage: (count) =>
    count === 1 ? "1 saved version is ready to publish." : `${count} saved versions are ready to publish.`,
  overviewPublishUpTo: "Publish up to here",
  overviewCloseProject: "Close project",
  overviewEmptyTitle: "No project open",
  overviewEmptyDescription:
    "Open a Git project to review changes, save versions, publish work, and recover from mistakes.",
  overviewOpening: "Opening…",
  overviewOpenProject: "Open a project",
  overviewCloneComingSoonTitle: "Coming soon",
  overviewCloneFromGithub: "Clone from GitHub",
  overviewOpenDialogTitle: "Open a Git project",
  overviewCouldntOpenFolder: "Couldn't open that folder.",
  errorPathMissing: "That folder no longer exists. Choose another folder.",
  errorPathUnusable: "That folder can't be read. Check its permissions or choose another folder.",
  errorNotRepository: "That folder isn't inside a Git project. Choose a project folder and try again.",
  errorBareRepository: "That Git repository has no working files, so GitOdrile can't open it yet.",
  errorGitMissing: "Git wasn't found. Install Git, reopen GitOdrile, and try again.",
  errorGitUnusable: "Git is installed but couldn't be started. Check the installation and try again.",
  errorGitCommandFailed: "Git couldn't inspect this project. Check that its files are readable.",
  errorInvalidIdentity: "Enter both a name and an email.",
  errorGitConfigWriteFailed: "Git couldn't save that identity. Check your global Git configuration.",
  errorPathInvalid: "That file path isn't valid. Choose the file again from the list.",
  errorPathNotChanged: "This file is no longer part of the unsaved changes. Refresh the list and choose a file that is still listed.",
  errorPathEncodingUnsupported:
    "This project contains a file name GitOdrile can't represent safely. Rename it with a Unicode-compatible name and refresh.",
  errorNothingToSave: "There's nothing to save right now. Make some changes first.",
  errorUnresolvedConflicts: "Some files have overlapping changes that need to be resolved before you can save.",
  errorDetachedHead: "This project isn't on a version line right now. Switch to one before saving a version.",
  errorGitOperationInProgress:
    "A Git operation is already in progress in this project. Finish or abort it, then try again.",
  errorMissingIdentity: "GitOdrile doesn't know who is saving this version yet. Add a name and email in Settings.",
  errorEmptyTitle: "Write a short name before saving.",
  errorInvalidTitle: "Keep the version name on one line.",
  errorStalePreview: "This project changed since the preview was shown. Review the updated changes and try again.",
  errorHookRejected: "A Git hook rejected this version. Check the hook's output, then try again.",
  errorSigningFailed: "Git couldn't sign this version. Check your commit-signing setup (GPG or SSH key) and try again.",
  errorIndexUnavailable:
    "GitOdrile couldn't safely prepare this project's Git index. Check disk space and permissions, then try again.",
  errorIndexRestoreFailed:
    "GitOdrile couldn't restore the project's prepared changes. Your working files are still there; review the technical details before trying again.",
  errorInvalidSelection: "Choose at least one file to save.",
  errorNoRemoteConfigured: "This project has no remote project configured yet. Add a remote in Git, then try again.",
  errorRemoteSelectionRequired: "This project has more than one remote project. Choose which one to publish to.",
  errorUnbornBranchNoVersion: "There's no saved version on this version line yet. Save a version first.",
  errorNothingToPublish: "Every saved version is already published.",
  errorBehindRemote: "The remote project has newer versions this project doesn't have yet. Get the team's changes first.",
  errorDivergedHistories:
    "This version line and the remote project have both moved apart. Get the team's changes first.",
  errorStalePublishPlan: "This project or the remote project changed since the preview was shown. Try publishing again.",
  errorInvalidRefName: "This version line's name isn't a valid Git reference.",
  errorAuthenticationFailed: "GitOdrile couldn't sign in to the remote project. Check your Git credentials and try again.",
  errorNetworkTimeout: "GitOdrile couldn't reach the remote project in time. Check your connection and try again.",
  errorRemoteRejected: "The remote project rejected this publish. Check the remote project's rules for this branch.",
  errorPublishUncertain:
    "GitOdrile lost the connection while publishing. Refresh and check whether it was published before trying again.",
  errorGitVersionTooOld:
    "This version of Git is too old for GitOdrile to change version lines safely. Update Git to version 2.23 or newer.",
  errorVersionLineNameTaken: "A version line with this exact name already exists. Choose a different name.",
  errorVersionLineNameCollides:
    "That name only differs by letter case from an existing version line, which some file systems can't tell apart. Choose a different name.",
  errorVersionLineCheckedOutElsewhere: "That version line is open in another workspace.",
  errorVersionLineIsActive: "The active version line can't be deleted. Switch to a different one first.",
  errorVersionLineUniqueWork:
    "This version line has saved work that isn't reachable from any other version line or remote yet.",
  errorVersionLineSwitchObstructed:
    "Git found local changes in the way of this switch that weren't visible in the preview. Save or discard them in Git directly, then try again.",
  errorStaleVersionLinePlan: "This project changed since the preview was shown. Refresh and try again.",
  errorDirtyWorkingTree:
    "This project has unsaved changes, so GitOdrile can't switch version lines yet. Save a version, or start a new version line with this work.",
  errorRefLocked: "Git couldn't update its references right now — another Git process may be using them.",

  settingsAppearanceTitle: "Appearance",
  settingsAppearanceDescription: 'Choose how GitOdrile looks. "System" follows your OS setting automatically.',
  settingsDialogDescription: "Adjust how GitOdrile looks, behaves, and works with Git.",
  settingsSectionsAriaLabel: "Settings sections",
  settingsGitTitle: "Git",
  settingsGitDescription: "Manage the Git installation, updates, and identity used to save versions.",
  settingsGitInstallationDescription: "Installed version, availability, and updates.",
  themeAriaLabel: "Theme",
  commonSystem: "System",
  themeLight: "Light",
  themeDark: "Dark",
  titlebarSwitchToLightTheme: "Switch to light theme",
  titlebarSwitchToDarkTheme: "Switch to dark theme",

  settingsGeneralTitle: "General",
  settingsGeneralDescription: "Choose what GitOdrile does when it starts.",
  commonVersion: "Version",
  settingsGeneralGitLabel: "Git",
  settingsGeneralChecking: "Checking…",
  settingsGeneralUpdateAvailable: "Update available",
  settingsGeneralGitMissing: "Git isn't installed or isn't available to GitOdrile.",
  settingsGeneralGitUnusable: "Git was found, but it isn't working correctly.",
  settingsGeneralGitCheckFailed: "GitOdrile couldn't check the Git installation.",
  settingsGeneralCheckAgain: "Check again",
  settingsGeneralInstallGit: "Install Git",
  settingsGeneralUpdate: "Update",
  gitStartingInstaller: "Starting…",
  gitInstallerLaunched: "Installer launched — this can take a moment to appear. Reopen GitOdrile once it finishes.",
  gitInstallerAlreadyStarting: "The installer is already starting.",
  gitInstallerFailedWithGuidance: "The installer couldn't start. The official Windows instructions were opened instead.",
  gitWindowsGuidanceOpened: "winget isn't available, so the official Windows installation instructions were opened.",
  gitMacosGuidanceOpened: "The official macOS installation options were opened. Choose the method that fits your Mac.",
  gitLinuxGuidanceOpened:
    "The official Linux instructions were opened. Use the package manager for your distribution.",
  gitUpdateNotChecked: "Updates haven't been checked. Checking may contact the Windows package source.",
  gitUpdateCheck: "Check for updates",
  gitUpdateChecking: "Checking for a Git update…",
  gitUpdateUpToDate: "Git is up to date.",
  gitUpdateCheckerUnavailable: "Git updates can't be checked automatically on this system.",
  gitUpdateCheckFailed: "Couldn't check for a Git update. Try again later.",
  gitUpdateCheckTimedOut: "The update check took too long and was stopped.",
  gitUpdateStarting: "Starting…",
  gitUpdateLaunched: "Update launched — this can take a moment to appear. Reopen GitOdrile once it finishes.",
  gitUpdateAlreadyStarting: "The Git update is already starting.",
  gitCouldntStart: "Couldn't start that.",

  settingsIdentityTitle: "Git identity",
  settingsIdentityDescription:
    "Used to record you as the author of versions you save. This is a normal, global Git setting — not stored only inside GitOdrile.",
  identityNameLabel: "Name",
  identityEmailLabel: "Email",
  identityNamePlaceholder: "Ada Lovelace",
  identityEmailPlaceholder: "ada@example.com",
  identitySave: "Save",
  identitySaving: "Saving…",
  identitySaved: "Saved.",
  identityModify: "Edit identity",
  identityCouldntSave: "Couldn't save that.",

  settingsStartupTitle: "Startup",
  settingsStartupDescription: "Control what happens when GitOdrile launches.",
  startupReopenLabel: "Reopen projects from the previous session",
  startupReopenDescription: "Skip picking folders again if you had projects open last time.",
  startupRestoreSkippedNotice: (count) =>
    count === 1
      ? "1 project from your last session couldn't be reopened."
      : `${count} projects from your last session couldn't be reopened.`,

  settingsSafetyTitle: "Safety",
  settingsSafetyDescription: "Extra confirmations before you can lose your place.",
  safetyConfirmLabel: "Confirm before closing a project",
  safetyConfirmDescription: "Ask before clearing the open project, in case that was a misclick.",

  settingsLanguageTitle: "Language",
  settingsLanguageDescription: 'Choose GitOdrile\'s language. "System" follows your operating system\'s language.',
  languageAriaLabel: "Language",

  aboutGitOdrile: "About",
  aboutHeading: "Git without the bite.",
  aboutDescription: "Turns version control into clear, worry-free steps.",
  aboutFooterMadeWith: "Made with ♥ by Luis M. Martínez.",
  commonClose: "Close",
  commonLoading: "Loading…",

  closeConfirmTitle: "Close this project?",
  closeConfirmBodyGeneric: "The project stays exactly as it is on disk. You can reopen it anytime.",
  closeConfirmBodyNamed: (name) => `"${name}" stays exactly as it is on disk. You can reopen it anytime.`,
  commonCancel: "Cancel",
};

const es: Translations = {
  titlebarOpenCommandPalette: "Abrir la paleta de comandos",
  titlebarJumpToHint: "Ir a una vista o acción",
  titlebarMoreActions: "Más acciones",
  titlebarOpenProject: "Abrir proyecto",
  titlebarReloadWindow: "Recargar ventana",
  titlebarReloadBlocked: "Termina la operación actual del proyecto antes de recargar.",
  titlebarReportIssue: "Reportar un problema",
  titlebarKeyboardShortcuts: "Atajos de teclado",
  shortcutsDialogTitle: "Atajos de teclado",
  shortcutsOpenPalette: "Abrir la paleta de comandos",
  shortcutsNextProject: "Proyecto siguiente",
  shortcutsPreviousProject: "Proyecto anterior",
  shortcutsCloseDialogs: "Cerrar diálogos y menús",
  titlebarGoBack: "Atrás",
  titlebarGoForward: "Adelante",
  titlebarHistoryControls: "Historial de navegación",
  alphaBadge: "alpha",
  alphaBadgeAriaLabel: "Versión en desarrollo: alpha",
  windowMinimize: "Minimizar ventana",
  windowMaximize: "Maximizar o restaurar ventana",
  windowClose: "Cerrar ventana",
  windowControls: "Controles de ventana",

  brandTagline: "Git sin mordiscos",
  sidebarCollapse: "Colapsar barra lateral",
  sidebarExpand: "Expandir barra lateral",
  navProjectAriaLabel: "Navegación del proyecto",
  navApplicationAriaLabel: "Aplicación",
  navOverview: "Resumen",
  navChanges: "Cambios",
  navChangesTitle: "Cambios — Abre un proyecto primero",
  navVersionLines: "Líneas de versión",
  navVersionLinesTitle: "Líneas de versión — Abre un proyecto primero",
  navHistory: "Historial",
  navHistoryTitle: "Historial — Próximamente",
  navRecovery: "Recuperación",
  navRecoveryTitle: "Recuperación — Próximamente",
  navSettings: "Configuración",

  paletteAriaLabel: "Paleta de comandos",
  palettePlaceholder: "Ir a una vista o acción…",
  paletteNoMatches: "No hay coincidencias",

  commandGoOverview: "Ir a Resumen",
  commandGoVersionLines: "Ir a Líneas de versión",
  commandNewVersionLine: "Nueva línea de versión",
  commandGoSettings: "Ir a Configuración",
  commandUseSystemTheme: "Usar el tema del sistema",
  commandUseLightTheme: "Usar el tema claro",
  commandUseDarkTheme: "Usar el tema oscuro",
  commandCloseActiveProject: "Cerrar el proyecto activo",
  commandSwitchToProject: (name) => `Cambiar a ${name}`,

  overviewRepositoryBranch: (branch) => `Proyecto de Git en la línea de versión «${branch}».`,
  overviewWorktreeBranch: (branch) => `Espacio de trabajo separado en la línea de versión «${branch}».`,
  overviewRepositoryDetached: "Proyecto de Git abierto en una versión guardada concreta.",
  overviewWorktreeDetached: "Espacio de trabajo separado abierto en una versión guardada concreta.",
  overviewRepositoryUnborn: (branch) =>
    `Proyecto de Git nuevo en la línea de versión «${branch}», todavía sin versiones guardadas.`,
  overviewWorktreeUnborn: (branch) =>
    `Espacio de trabajo separado nuevo en la línea de versión «${branch}», todavía sin versiones guardadas.`,
  overviewLocalProject: "Proyecto local",
  overviewSeparateWorkspace: "Espacio de trabajo separado",
  overviewProjectReady: "Tu proyecto está listo",
  overviewWorktreeReady: "Tu espacio de trabajo separado está listo",
  overviewUnbornReady: "Tu nuevo proyecto está listo",
  overviewDetachedReady: "Hay abierta una versión guardada concreta",
  overviewOpenAnotherProject: "Abrir otro proyecto",
  projectSwitcherAriaLabel: "Proyectos abiertos",
  projectSwitchToLabel: (name) => `Cambiar a ${name}`,
  projectSwitcherCloseLabel: (name) => `Cerrar ${name}`,
  projectSwitcherUnsavedIndicator: "Tiene cambios sin guardar",
  projectSwitcherOperationIndicator: "Operación en curso",
  projectSwitcherErrorIndicator: "Necesita atención",
  projectSwitcherCollapsedTrigger: "Cambiar de proyecto",
  projectSwitcherSwitchBlockedHint: "Termina el diálogo abierto antes de cambiar de proyecto",
  projectSwitcherEmptyHint: "Aquí aparecerán tus proyectos abiertos.",
  projectSwitcherActiveAnnouncement: (name) => `${name} es ahora el proyecto activo.`,
  projectSwitcherMutationBlocked: (name) =>
    `Espera a que termine la operación de ${name} antes de iniciar otra en un espacio de trabajo vinculado.`,
  projectSwitcherCloseBlocked: (name) =>
    `Espera a que termine la operación de ${name}. Mientras tanto puedes seguir trabajando en otro proyecto.`,
  overviewCurrentVersionLine: "Línea de versión actual",
  overviewVersionLineActionsTitle: "Trabajar por separado",
  overviewVersionLineActionsDescription: "Cambia dónde irá el trabajo nuevo o crea una línea de versión separada.",
  overviewSpecificSavedVersion: "Versión guardada concreta",
  overviewNoSavedVersions: "Todavía no hay versiones guardadas",
  overviewVersionLineDescription: "El trabajo nuevo permanecerá en esta línea de versión.",
  overviewDetachedDescription: "Estás inspeccionando un punto exacto del historial del proyecto.",
  overviewUnbornDescription: "La primera versión guardada iniciará el historial de este proyecto.",
  overviewOpenedFrom: "Abierto desde una carpeta dentro de este proyecto",
  overviewProjectType: "Tipo de proyecto",
  overviewRepositoryTypeDescription: "Un proyecto estándar guardado en esta carpeta.",
  overviewWorktreeTypeDescription: "Un espacio enlazado con sus propios archivos y línea de versión.",
  overviewTechnicalDetails: "Detalles técnicos del proyecto",
  overviewResolvedRoot: "Raíz del proyecto",
  overviewSelectedFolder: "Carpeta que seleccionaste",
  overviewGitDirectory: "Directorio de Git",
  overviewCommonGitDirectory: "Directorio de Git compartido",
  overviewCopyPath: "Copiar la ruta del proyecto",
  overviewPathCopied: "Ruta copiada",
  overviewCopyPathFailedTitle: "No se pudo copiar la ruta",
  overviewCopyPathFailedMessage: "Selecciona la ruta del proyecto y cópiala manualmente.",
  overviewOpeningTitle: "Abriendo el proyecto…",
  overviewOpeningDescription: "GitOdrile está comprobando la carpeta seleccionada.",
  overviewOpenFailedTitle: "No hemos podido abrir ese proyecto",
  overviewReviewChanges: "Revisar cambios",
  statusCleanTitle: "Todo está guardado",
  statusCleanMessage: "No tienes cambios sin guardar en este proyecto.",
  statusChangesTitle: "Tienes cambios sin guardar",
  statusChangesMessage: (total) =>
    total === 1
      ? "1 archivo ha cambiado desde tu última versión guardada."
      : `${total} archivos han cambiado desde tu última versión guardada.`,
  statusConflictsTitle: "Algunos archivos necesitan tu atención",
  statusConflictsMessage: (conflicted) =>
    conflicted === 1
      ? "1 archivo tiene cambios superpuestos que hay que resolver antes de poder guardar."
      : `${conflicted} archivos tienen cambios superpuestos que hay que resolver antes de poder guardar.`,
  statusCheckingTitle: "Buscando cambios…",
  statusCheckingMessage: "GitOdrile está revisando los archivos de tu proyecto.",
  statusCheckFailedTitle: "No hemos podido buscar cambios",
  statusCouldntCheck: "GitOdrile no ha podido comprobar qué ha cambiado en este proyecto.",
  statusRefresh: "Buscar cambios",
  statusRefreshing: "Buscando…",
  statusBreakdownLabel: "Qué ha cambiado",
  statusCategoryChanged: (count) => (count === 1 ? "1 editado" : `${count} editados`),
  statusCategoryNew: (count) => (count === 1 ? "1 nuevo" : `${count} nuevos`),
  statusCategoryDeleted: (count) => (count === 1 ? "1 eliminado" : `${count} eliminados`),
  statusCategoryRenamed: (count) => (count === 1 ? "1 renombrado" : `${count} renombrados`),
  statusCategoryConflicted: (count) =>
    count === 1 ? "1 necesita atención" : `${count} necesitan atención`,
  statusTruncatedNote: (shown) =>
    `Mostrando los primeros ${shown} archivos. Los totales de arriba incluyen todos los cambios.`,
  statusRefreshFailedNote:
    "Este es el último resultado que pudimos leer. La comprobación más reciente no ha funcionado.",

  changesHeading: "Cambios",
  changesSummaryClean: "Todo está guardado. No hay nada que revisar.",
  changesSummaryTotal: (total) =>
    total === 1 ? "1 archivo tiene cambios sin guardar." : `${total} archivos tienen cambios sin guardar.`,
  changesSummaryWithConflicts: (conflicted, total) =>
    conflicted === total
      ? conflicted === 1
        ? "1 archivo necesita tu atención."
        : `${conflicted} archivos necesitan tu atención.`
      : `${conflicted} de ${total} archivos necesitan tu atención.`,
  changesEmptyTitle: "Nada que revisar",
  changesEmptyDescription:
    "Todos los archivos guardados coinciden con la última versión guardada. Vuelve cuando hagas cambios.",
  changesBackToOverview: "Volver a Resumen",
  changesBackToList: "Volver a la lista de archivos",
  changesListAriaLabel: "Archivos con cambios",
  changesCategoryLabelChanged: "Editado",
  changesCategoryLabelNew: "Nuevo",
  changesCategoryLabelDeleted: "Eliminado",
  changesCategoryLabelRenamed: "Renombrado",
  changesCategoryLabelConflicted: "Necesita atención",
  changesRenamedFrom: (original) => `Renombrado desde ${original}`,
  changesSelectionAnnouncement: (path) => `Mostrando ahora la diferencia de ${path}.`,
  changesDiffLoadingTitle: "Leyendo la diferencia…",
  changesDiffErrorTitle: "No pudimos leer la diferencia de este archivo",
  changesDiffRetry: "Reintentar",
  changesDiffBinaryTitle: "Este archivo no se puede previsualizar como texto",
  changesDiffBinaryDescription: "GitOdrile detecta que este archivo cambió, pero su contenido no es legible como texto.",
  changesDiffTooLargeTitle: "Esta diferencia es demasiado grande para mostrarla aquí",
  changesDiffTooLargeDescription: (limit) =>
    `La diferencia de este archivo supera ${limit}, el límite de seguridad de GitOdrile para revisar cambios aquí. El archivo en sí no se ve afectado.`,
  changesDiffUnchangedTitle: "No hay cambios de contenido",
  changesDiffUnchangedDescription: "Solo cambió el nombre o los permisos del archivo. No hay diferencia de texto que mostrar.",
  changesDiffConflictTitle: "Este archivo necesita tu atención",
  changesDiffConflictDescription:
    "GitOdrile muestra las marcas de conflicto actuales solo a título informativo. Resolver conflictos aún no está disponible aquí.",
  changesDiffConflictUnavailable: "GitOdrile no pudo leer las marcas de conflicto actuales de este archivo.",
  changesDiffConflictBinary: "El contenido de este archivo no es legible como texto, así que sus marcas de conflicto no se pueden mostrar.",
  changesDiffConflictTooLarge: "El conflicto es demasiado grande para previsualizarlo aquí de forma segura.",
  changesDiffAriaLabel: (path) => `Diferencia de ${path}`,
  changesDiffHiddenLines: (count) => (count === 1 ? "1 línea sin cambios" : `${count} líneas sin cambios`),
  changesDiffTruncatedNote: (shownLines) => `Mostrando las primeras ${shownLines} líneas de esta diferencia.`,
  changesLineAddedLabel: "Añadida:",
  changesLineRemovedLabel: "Eliminada:",

  changesSaveVersion: "Guardar versión",
  changesSaveVersionDisabledHint: "Haz algún cambio primero y vuelve para guardar una versión.",
  changesSaveVersionNoSelectionHint: "Elige al menos un archivo para guardar.",
  changesSelectionSummary: (selected, total) => `${selected}/${total}`,
  changesSelectAll: "Seleccionar todo",
  changesSelectNone: "No seleccionar ninguno",
  changesIncludeFile: (path) => `Incluir ${path} en esta versión`,
  changesPartialUnavailableTruncated:
    "Este proyecto tiene más archivos modificados de los que se pueden listar con seguridad. Guarda todos los cambios antes de usar la selección.",
  changesProjectRoot: "Raíz del proyecto",
  saveVersionDialogTitle: "Guardar versión",
  saveVersionDialogTitleFirst: "Guarda tu primera versión",
  saveVersionLoadingTitle: "Preparando una vista previa…",
  saveVersionTitleLabel: "Nombre de la versión",
  saveVersionTitlePlaceholder: "Resume qué cambió…",
  saveVersionTitleGuidance: "Unas 50 letras se leen de un vistazo, pero se permiten nombres más largos.",
  saveVersionDescriptionLabel: "Más detalles (opcional)",
  saveVersionDescriptionPlaceholder: "Añade más contexto, si es útil…",
  saveVersionFilesSummary: (total) =>
    total === 1 ? "Se guardará 1 archivo." : `Se guardarán ${total} archivos.`,
  saveVersionRemainingNote: (remaining) =>
    remaining === 1
      ? "Otro archivo seguirá como cambio pendiente."
      : `Otros ${remaining} archivos seguirán como cambios pendientes.`,
  saveVersionPreparedNote:
    "Algunos cambios seleccionados se habían preparado antes con otra herramienta Git. Se guardarán junto con esta selección.",
  saveVersionFirstVersionNote: "Esta será la primera versión guardada de este proyecto.",
  saveVersionLocalOnlyNote: "Esto crea una versión guardada solo en este equipo. Todavía no se envía nada a ningún sitio.",
  saveVersionConfirm: "Guardar versión",
  saveVersionSaving: "Guardando tu versión…",
  saveVersionRetry: "Reintentar",
  saveVersionShowDetail: "Mostrar detalles técnicos",
  saveVersionHideDetail: "Ocultar detalles técnicos",
  saveVersionDetailHeading: "Detalles técnicos",
  saveVersionSuccessTitle: "Versión guardada",
  saveVersionSuccessDescription: (title, shortCommit) => `Guardada "${title}" como ${shortCommit}.`,
  saveVersionSuccessLocalNote: "Guardada en este equipo. Todavía no se ha publicado en un proyecto remoto.",
  saveVersionPublishNow: "Publicar ahora",
  saveVersionDone: "Listo",

  publishDialogTitle: "Publicar cambios",
  publishDialogTitleFirst: "Publicar por primera vez",
  publishLoadingTitle: "Comprobando qué está listo para publicar…",
  publishChooseRemoteTitle: "Elige un proyecto remoto",
  publishChooseRemoteDescription:
    "Este proyecto tiene más de un proyecto remoto configurado. Elige dónde publicar.",
  publishSummary: (remote, branch) => `Publicar en "${remote}" (${branch}).`,
  publishDestinationLabel: "Destino",
  publishWillPublishLabel: "Se publicará",
  publishWillStayLabel: "Permanecerá en este equipo",
  publishVisibilityLabel: "Quién podrá verlo",
  publishCommitCount: (count) =>
    count === 1 ? "Se publicará 1 versión guardada." : `Se publicarán ${count} versiones guardadas.`,
  publishCommitListLabel: "Versiones que se van a publicar",
  publishLoadingFiles: "Cargando archivos cambiados…",
  publishFilesError: "No se pudieron cargar los archivos cambiados.",
  publishLoadingDiff: "Cargando cambios por línea…",
  publishDiffError: "No se pudieron cargar los cambios de este archivo.",
  publishUpstreamNote: "Esta línea de versión empezará a seguir la rama remota.",
  publishUnsavedFilesNote:
    "Los archivos sin guardar en este equipo permanecerán locales — solo se publican las versiones guardadas.",
  publishUnsavedChangesPill: "Cambios de archivos sin guardar",
  publishRemainingNote: (count) =>
    count === 1
      ? "Otra versión guardada quedará sin publicar por ahora."
      : `Otras ${count} versiones guardadas quedarán sin publicar por ahora.`,
  publishTeammatesNote:
    "Las personas con acceso a este proyecto remoto podrán ver el historial publicado.",
  publishConfirm: "Publicar ahora",
  publishPublishing: "Publicando…",
  publishVerifying: "Comprobando el resultado…",
  publishCannotCloseNote: "Mantén esta ventana abierta mientras GitOdrile confirma el resultado remoto.",
  publishReviewUpdatedPlan: "Revisar el plan actualizado",
  publishCheckRemoteAgain: "Comprobar remoto de nuevo",
  publishSuccessTitle: "Publicado",
  publishSuccessDescription: (count, remote) =>
    count === 1
      ? `Se publicó 1 versión guardada en "${remote}".`
      : `Se publicaron ${count} versiones guardadas en "${remote}".`,
  publishSuccessUpstreamNote: "Esta línea de versión ahora sigue la rama remota.",
  publishDone: "Listo",

  versionLinesTitle: "Líneas de versión",
  versionLinesExplanation:
    "Una línea de versión es una vía independiente para tus versiones guardadas. Git la llama rama. Cambiar de línea mueve tus archivos a la última versión guardada de esa línea; nada de esto toca el proyecto remoto.",
  versionLinesSearchPlaceholder: "Buscar líneas de versión…",
  versionLinesSearchAriaLabel: "Buscar líneas de versión",
  versionLinesFilterAllLabel: "Todas",
  versionLinesFilterAriaLabel: "Filtrar por prefijo del nombre",
  versionLinesNoProjectTitle: "No hay ningún proyecto abierto",
  versionLinesNoProjectDescription: "Abre un proyecto para ver y gestionar sus líneas de versión.",
  versionLinesLoading: "Cargando líneas de versión…",
  versionLinesErrorLoading: "GitOdrile no pudo cargar las líneas de versión de este proyecto.",
  versionLinesRetry: "Intentar de nuevo",
  versionLinesActiveLabel: "Activa",
  versionLinesNewButton: "Nueva línea de versión",
  versionLinesEmptyOthers: "Todavía no hay otras líneas de versión en este proyecto.",
  versionLinesNoSearchMatches: "Ninguna línea de versión coincide con esa búsqueda.",
  versionLinesTruncatedNote: (visible, total) => `Se muestran las ${visible} guardadas más recientemente de ${total}.`,
  versionLinesUnreadableNote: (count) =>
    count === 1
      ? "Hay una línea de versión que no se muestra: su nombre usa caracteres que GitOdrile no puede leer con exactitud. Cámbiale el nombre desde Git."
      : `Hay ${count} líneas de versión que no se muestran: sus nombres usan caracteres que GitOdrile no puede leer con exactitud. Cámbiales el nombre desde Git.`,
  versionLinesDetachedTitle: "Este proyecto no está en una línea de versión ahora mismo",
  versionLinesDetachedDescription:
    "Estás viendo una versión guardada concreta. Crea aquí una línea de versión con nombre para que este trabajo sea fácil de encontrar.",
  versionLinesDetachedRecoverButton: "Crear una línea de versión aquí",
  versionLinesUnbornTitle: "Guarda una versión primero",
  versionLinesUnbornDescription: "Esta línea de versión todavía no tiene versiones guardadas, así que no hay nada de qué partir.",
  versionLinesSwitchButton: "Cambiar a esta línea",
  versionLinesDeleteButton: "Eliminar línea",
  versionLinesUpstreamLabel: (upstream) => `Sigue a ${upstream}`,
  versionLinesNoUpstreamLabel: "No publicada en ningún remoto",
  versionLinesCheckedOutElsewhere: (path) => `Abierta en otro espacio de trabajo en ${path}. Cámbiate a ella desde ahí.`,
  versionLinesUniqueCommits: (count) =>
    count === 1
      ? "1 versión guardada que no está en la línea activa"
      : `${count} versiones guardadas que no están en la línea activa`,
  versionLinesTechnicalDetails: "Detalles técnicos",
  versionLinesRefNameLabel: "Nombre de la rama",
  versionLinesTipCommitLabel: "Último commit",
  versionLinesSavedLabel: (date) => `Guardada el ${date}`,

  createVersionLineTitle: "Nueva línea de versión",
  createVersionLineNameLabel: "Nombre",
  createVersionLineNamePlaceholder: "p. ej. feature/nueva-bienvenida",
  createVersionLineSwitchLabel: "Crear y cambiar a ella",
  createVersionLineWithoutSwitchLabel: "Crear sin cambiar",
  createVersionLineDetachedNote:
    "Este proyecto no está en una línea de versión ahora mismo, así que GitOdrile cambiará a la nueva para que este commit sea fácil de encontrar.",
  createVersionLineUnsavedNote:
    "Tus archivos sin guardar y los cambios preparados permanecen exactamente igual. Las próximas versiones guardadas pertenecerán a la nueva línea de versión.",
  createVersionLineUnbornBlocked: "Guarda la primera versión antes de crear otra línea de versión.",
  createVersionLineConfirm: "Crear",
  createVersionLineCreating: "Creando…",
  createVersionLineSuccessTitle: "Línea de versión creada",
  createVersionLineDone: "Listo",

  switchVersionLineTitle: (to) => `Cambiar a «${to}»`,
  switchVersionLineLoading: "Comparando líneas de versión…",
  switchVersionLineChangedFiles: (count) =>
    count === 1 ? "1 archivo cambiará." : `${count} archivos cambiarán.`,
  switchVersionLineChangedFilesTruncated: (visible, total) => `Se muestran ${visible} de ${total} archivos cambiados.`,
  switchVersionLineDirtyTitle: "Este proyecto tiene cambios sin guardar",
  switchVersionLineDirtyDescription:
    "GitOdrile no puede cambiar de línea de versión con trabajo sin guardar de por medio. Guarda una versión, o inicia una nueva línea de versión con este trabajo.",
  switchVersionLineSaveVersionAction: "Guardar versión",
  switchVersionLineNewLineAction: "Nueva línea de versión con este trabajo",
  switchVersionLineConfirm: "Cambiar",
  switchVersionLineSwitching: "Cambiando…",
  switchVersionLineSuccessTitle: "Línea de versión cambiada",
  switchVersionLineDone: "Listo",

  deleteVersionLineTitle: (name) => `¿Eliminar «${name}»?`,
  deleteVersionLineRetainedBy: (refs) => `Su trabajo guardado sigue siendo accesible desde: ${refs}.`,
  deleteVersionLineWarning: "Esto no se puede deshacer desde GitOdrile.",
  deleteVersionLineConfirm: "Eliminar",
  deleteVersionLineDeleting: "Eliminando…",
  deleteVersionLineSuccessTitle: "Línea de versión eliminada",
  deleteVersionLineDone: "Listo",

  overviewChangeVersionLine: "Cambiar",
  overviewNewVersionLine: "Nueva",
  overviewQuickSwitchTitle: "Cambiar línea de versión",
  overviewQuickSwitchEmpty: "Todavía no hay otras líneas de versión.",
  overviewQuickSwitchSeeAll: "Ver todas las líneas de versión",

  overviewPublishChanges: "Publicar cambios",
  overviewPendingVersionsTitle: (count) => `Versiones guardadas sin publicar (${count})`,
  overviewPendingVersionsGuidance:
    "Las más recientes aparecen primero. Publicar hasta una versión también publica todas las anteriores que aparecen debajo.",
  overviewPendingVersionsTruncated: (visible, total) => `Se muestran las ${visible} más recientes de ${total}.`,
  overviewPendingVersionsError: "GitOdrile no pudo cargar las versiones guardadas pendientes de publicar.",
  overviewSavedAndReadyTitle: "Tus archivos están guardados",
  overviewSavedAndReadyMessage: (count) =>
    count === 1
      ? "Hay 1 versión guardada lista para publicar."
      : `Hay ${count} versiones guardadas listas para publicar.`,
  overviewPublishUpTo: "Publicar hasta aquí",
  overviewCloseProject: "Cerrar proyecto",
  overviewEmptyTitle: "No hay ningún proyecto abierto",
  overviewEmptyDescription:
    "Abre un proyecto de Git para revisar cambios, guardar versiones, publicar tu trabajo y recuperarte de errores.",
  overviewOpening: "Abriendo…",
  overviewOpenProject: "Abrir un proyecto",
  overviewCloneComingSoonTitle: "Próximamente",
  overviewCloneFromGithub: "Clonar desde GitHub",
  overviewOpenDialogTitle: "Abrir un proyecto de Git",
  overviewCouldntOpenFolder: "No se pudo abrir esa carpeta.",
  errorPathMissing: "Esa carpeta ya no existe. Elige otra carpeta.",
  errorPathUnusable: "No se puede leer esa carpeta. Comprueba sus permisos o elige otra.",
  errorNotRepository: "Esa carpeta no está dentro de un proyecto de Git. Elige una carpeta del proyecto.",
  errorBareRepository: "Ese repositorio no contiene archivos de trabajo, así que GitOdrile aún no puede abrirlo.",
  errorGitMissing: "No se encontró Git. Instálalo, vuelve a abrir GitOdrile e inténtalo de nuevo.",
  errorGitUnusable: "Git está instalado, pero no se pudo iniciar. Comprueba la instalación.",
  errorGitCommandFailed: "Git no pudo inspeccionar este proyecto. Comprueba que sus archivos se puedan leer.",
  errorInvalidIdentity: "Introduce un nombre y un correo electrónico.",
  errorGitConfigWriteFailed: "Git no pudo guardar la identidad. Comprueba tu configuración global de Git.",
  errorPathInvalid: "Esa ruta de archivo no es válida. Elige el archivo de nuevo desde la lista.",
  errorPathNotChanged:
    "Este archivo ya no forma parte de los cambios sin guardar. Actualiza la lista y elige un archivo que siga apareciendo.",
  errorPathEncodingUnsupported:
    "Este proyecto contiene un nombre de archivo que GitOdrile no puede representar de forma segura. Renómbralo con un nombre Unicode compatible y actualiza.",
  errorNothingToSave: "No hay nada que guardar ahora mismo. Haz algún cambio primero.",
  errorUnresolvedConflicts: "Algunos archivos tienen cambios superpuestos que hay que resolver antes de poder guardar.",
  errorDetachedHead: "Este proyecto no está en una línea de versión ahora mismo. Cambia a una antes de guardar una versión.",
  errorGitOperationInProgress:
    "Ya hay una operación de Git en curso en este proyecto. Termínala o cancélala, y vuelve a intentarlo.",
  errorMissingIdentity: "GitOdrile todavía no sabe quién está guardando esta versión. Añade un nombre y un correo en Configuración.",
  errorEmptyTitle: "Escribe un nombre breve antes de guardar.",
  errorInvalidTitle: "Escribe el nombre de la versión en una sola línea.",
  errorStalePreview: "Este proyecto cambió desde que se mostró la vista previa. Revisa los cambios actualizados e inténtalo de nuevo.",
  errorHookRejected: "Un hook de Git rechazó esta versión. Revisa lo que indica el hook e inténtalo de nuevo.",
  errorSigningFailed: "Git no pudo firmar esta versión. Comprueba tu configuración de firma (GPG o clave SSH) e inténtalo de nuevo.",
  errorIndexUnavailable:
    "GitOdrile no pudo preparar de forma segura el índice de Git de este proyecto. Comprueba el espacio en disco y los permisos, e inténtalo de nuevo.",
  errorIndexRestoreFailed:
    "GitOdrile no pudo restaurar los cambios preparados del proyecto. Tus archivos siguen ahí; revisa los detalles técnicos antes de intentarlo de nuevo.",
  errorInvalidSelection: "Elige al menos un archivo para guardar.",
  errorNoRemoteConfigured: "Este proyecto todavía no tiene un proyecto remoto configurado. Añade un remoto en Git e inténtalo de nuevo.",
  errorRemoteSelectionRequired: "Este proyecto tiene más de un proyecto remoto. Elige a cuál publicar.",
  errorUnbornBranchNoVersion: "Todavía no hay ninguna versión guardada en esta línea de versión. Guarda una versión primero.",
  errorNothingToPublish: "Todas las versiones guardadas ya están publicadas.",
  errorBehindRemote:
    "El proyecto remoto tiene versiones más recientes que este proyecto todavía no tiene. Obtén primero los cambios del equipo.",
  errorDivergedHistories:
    "Esta línea de versión y el proyecto remoto se han separado. Obtén primero los cambios del equipo.",
  errorStalePublishPlan:
    "Este proyecto o el proyecto remoto cambiaron desde que se mostró la vista previa. Intenta publicar de nuevo.",
  errorInvalidRefName: "El nombre de esta línea de versión no es una referencia de Git válida.",
  errorAuthenticationFailed:
    "GitOdrile no pudo iniciar sesión en el proyecto remoto. Comprueba tus credenciales de Git e inténtalo de nuevo.",
  errorNetworkTimeout: "GitOdrile no pudo contactar con el proyecto remoto a tiempo. Comprueba tu conexión e inténtalo de nuevo.",
  errorRemoteRejected: "El proyecto remoto rechazó esta publicación. Revisa las reglas del proyecto remoto para esta rama.",
  errorPublishUncertain:
    "GitOdrile perdió la conexión mientras publicaba. Actualiza y comprueba si se publicó antes de intentarlo de nuevo.",
  errorGitVersionTooOld:
    "Esta versión de Git es demasiado antigua para que GitOdrile cambie de línea de versión de forma segura. Actualiza Git a la versión 2.23 o posterior.",
  errorVersionLineNameTaken: "Ya existe una línea de versión con exactamente este nombre. Elige otro nombre.",
  errorVersionLineNameCollides:
    "Ese nombre solo se diferencia por mayúsculas o minúsculas de una línea de versión existente, algo que algunos sistemas de archivos no distinguen. Elige otro nombre.",
  errorVersionLineCheckedOutElsewhere: "Esa línea de versión está abierta en otro espacio de trabajo.",
  errorVersionLineIsActive: "La línea de versión activa no se puede eliminar. Cambia primero a otra distinta.",
  errorVersionLineUniqueWork:
    "Esta línea de versión tiene trabajo guardado que todavía no es accesible desde ninguna otra línea de versión ni remoto.",
  errorVersionLineSwitchObstructed:
    "Git encontró cambios locales que impiden este cambio y que no eran visibles en la vista previa. Guárdalos o descártalos directamente en Git, e inténtalo de nuevo.",
  errorStaleVersionLinePlan: "Este proyecto cambió desde que se mostró la vista previa. Actualiza e inténtalo de nuevo.",
  errorDirtyWorkingTree:
    "Este proyecto tiene cambios sin guardar, así que GitOdrile no puede cambiar de línea de versión todavía. Guarda una versión, o inicia una nueva línea de versión con este trabajo.",
  errorRefLocked: "Git no pudo actualizar sus referencias ahora mismo (otro proceso de Git podría estar usándolas).",

  settingsDialogDescription: "Ajusta el aspecto y el comportamiento de GitOdrile y cómo trabaja con Git.",
  settingsSectionsAriaLabel: "Secciones de configuración",
  settingsGitTitle: "Git",
  settingsGitDescription: "Gestiona la instalación, las actualizaciones y la identidad de Git.",
  settingsGitInstallationDescription: "Versión instalada, disponibilidad y actualizaciones.",
  settingsAppearanceTitle: "Apariencia",
  settingsAppearanceDescription:
    'Elige el aspecto de GitOdrile. "Sistema" sigue automáticamente el ajuste de tu sistema operativo.',
  themeAriaLabel: "Tema",
  commonSystem: "Sistema",
  themeLight: "Claro",
  themeDark: "Oscuro",
  titlebarSwitchToLightTheme: "Cambiar a tema claro",
  titlebarSwitchToDarkTheme: "Cambiar a tema oscuro",

  settingsGeneralTitle: "General",
  settingsGeneralDescription: "Elige qué hace GitOdrile cuando se inicia.",
  commonVersion: "Versión",
  settingsGeneralGitLabel: "Git",
  settingsGeneralChecking: "Comprobando…",
  settingsGeneralUpdateAvailable: "Actualización disponible",
  settingsGeneralGitMissing: "Git no está instalado o no está disponible para GitOdrile.",
  settingsGeneralGitUnusable: "Git se encontró, pero no funciona correctamente.",
  settingsGeneralGitCheckFailed: "GitOdrile no pudo comprobar la instalación de Git.",
  settingsGeneralCheckAgain: "Comprobar de nuevo",
  settingsGeneralInstallGit: "Instalar Git",
  settingsGeneralUpdate: "Actualizar",
  gitStartingInstaller: "Iniciando…",
  gitInstallerLaunched:
    "Instalador iniciado — puede tardar un momento en aparecer. Vuelve a abrir GitOdrile cuando termine.",
  gitInstallerAlreadyStarting: "El instalador ya se está iniciando.",
  gitInstallerFailedWithGuidance:
    "El instalador no pudo iniciarse. Se abrieron en su lugar las instrucciones oficiales para Windows.",
  gitWindowsGuidanceOpened:
    "winget no está disponible, así que se abrieron las instrucciones oficiales de instalación para Windows.",
  gitMacosGuidanceOpened:
    "Se abrieron las opciones oficiales de instalación para macOS. Elige el método apropiado para tu Mac.",
  gitLinuxGuidanceOpened:
    "Se abrieron las instrucciones oficiales para Linux. Usa el gestor de paquetes de tu distribución.",
  gitUpdateNotChecked:
    "Aún no se han buscado actualizaciones. La comprobación puede contactar con la fuente de paquetes de Windows.",
  gitUpdateCheck: "Buscar actualizaciones",
  gitUpdateChecking: "Buscando una actualización de Git…",
  gitUpdateUpToDate: "Git está actualizado.",
  gitUpdateCheckerUnavailable: "No se pueden comprobar automáticamente las actualizaciones de Git en este sistema.",
  gitUpdateCheckFailed: "No se pudo buscar una actualización de Git. Inténtalo de nuevo más tarde.",
  gitUpdateCheckTimedOut: "La comprobación tardó demasiado y se detuvo.",
  gitUpdateStarting: "Iniciando…",
  gitUpdateLaunched:
    "Actualización iniciada — puede tardar un momento en aparecer. Vuelve a abrir GitOdrile cuando termine.",
  gitUpdateAlreadyStarting: "La actualización de Git ya se está iniciando.",
  gitCouldntStart: "No se pudo iniciar eso.",

  settingsIdentityTitle: "Identidad de Git",
  settingsIdentityDescription:
    "Se usa para indicar que eres el autor de las versiones que guardas. Es un ajuste normal y global de Git, no algo exclusivo de GitOdrile.",
  identityNameLabel: "Nombre",
  identityEmailLabel: "Correo electrónico",
  identityNamePlaceholder: "Ada Lovelace",
  identityEmailPlaceholder: "ada@example.com",
  identitySave: "Guardar",
  identitySaving: "Guardando…",
  identitySaved: "Guardado.",
  identityModify: "Modificar identidad",
  identityCouldntSave: "No se pudo guardar eso.",

  settingsStartupTitle: "Inicio",
  settingsStartupDescription: "Controla qué ocurre cuando se abre GitOdrile.",
  startupReopenLabel: "Reabrir los proyectos de la última sesión",
  startupReopenDescription: "Evita elegir carpetas de nuevo si tenías proyectos abiertos la última vez.",
  startupRestoreSkippedNotice: (count) =>
    count === 1
      ? "1 proyecto de tu última sesión no se pudo volver a abrir."
      : `${count} proyectos de tu última sesión no se pudieron volver a abrir.`,

  settingsSafetyTitle: "Seguridad",
  settingsSafetyDescription: "Confirmaciones adicionales antes de perder tu lugar.",
  safetyConfirmLabel: "Confirmar antes de cerrar un proyecto",
  safetyConfirmDescription: "Pregunta antes de cerrar el proyecto abierto, por si fue un clic accidental.",

  settingsLanguageTitle: "Idioma",
  settingsLanguageDescription: 'Elige el idioma de GitOdrile. "Sistema" usa el idioma de tu sistema operativo.',
  languageAriaLabel: "Idioma",

  aboutGitOdrile: "Acerca de",
  aboutHeading: "Git sin mordiscos.",
  aboutDescription: "Convierte el control de versiones en pasos claros y sin sustos.",
  aboutFooterMadeWith: "Hecho con ♥ por Luis M. Martínez.",
  commonClose: "Cerrar",
  commonLoading: "Cargando…",

  closeConfirmTitle: "¿Cerrar este proyecto?",
  closeConfirmBodyGeneric: "El proyecto se mantiene exactamente igual en el disco. Puedes volver a abrirlo cuando quieras.",
  closeConfirmBodyNamed: (name) => `"${name}" se mantiene exactamente igual en el disco. Puedes volver a abrirlo cuando quieras.`,
  commonCancel: "Cancelar",
};

export const translations: Record<Language, Translations> = { en, es };

function readStoredLanguagePreference(): LanguagePreference {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === "en" || stored === "es" ? stored : "system";
}

function readNavigatorLanguage(): Language {
  return resolveLanguage(typeof navigator === "undefined" ? null : navigator.language);
}

interface LanguageContextValue {
  languagePreference: LanguagePreference;
  setLanguagePreference: (preference: LanguagePreference) => void;
  language: Language;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [languagePreference, setLanguagePreferenceState] = useState<LanguagePreference>(() =>
    readStoredLanguagePreference(),
  );
  const [systemLanguage, setSystemLanguage] = useState<Language>(() => readNavigatorLanguage());

  useEffect(() => {
    getOsLocale()
      .then((value) => {
        if (value) {
          setSystemLanguage(resolveLanguage(value));
        }
      })
      .catch(() => undefined);
  }, []);

  const setLanguagePreference = (preference: LanguagePreference): void => {
    setLanguagePreferenceState(preference);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  };

  const language: Language = languagePreference === "system" ? systemLanguage : languagePreference;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value: LanguageContextValue = {
    languagePreference,
    setLanguagePreference,
    language,
    t: translations[language],
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
