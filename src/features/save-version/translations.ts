import type { ChangeCategory } from "../status";

export interface SaveVersionTranslations {
  saveVersionDialogTitle: string;
  saveVersionDialogTitleFirst: string;
  saveVersionLoadingTitle: string;
  saveVersionChecking: string;
  saveVersionTitleLabel: string;
  /** The two placeholders are a pair of questions: the name says what
   * changed, the details why — what the name cannot. "What changed", not
   * "what did you change": the change may be an AI's or a teammate's. */
  saveVersionTitlePlaceholder: string;
  saveVersionTitleGuidance: string;
  saveVersionDescriptionLabel: string;
  saveVersionDescriptionPlaceholder: string;
  saveVersionRemainingNote: (remaining: number) => string;
  saveVersionPreparedNote: string;
  saveVersionFirstVersionNote: string;
  saveVersionFirstVersionOnBranchNote: (branch: string) => string;
  /** The dialog's summary headline; the branch they land on is a chip beside it. */
  saveVersionFilesCount: (total: number) => string;
  saveVersionShowFiles: string;
  saveVersionHideFiles: string;
  saveVersionFilesListLabel: string;
  /** One file's tag in the list: the breakdown's words, for one file. */
  saveVersionFileKind: Record<ChangeCategory, string>;
  /** Under a list the plan cut short; Changes lists every file. */
  saveVersionMoreFiles: (count: number) => string;
  saveVersionAddDetails: string;
  /** The primary's tooltip; `mod` is the platform's keycap (Ctrl or ⌘). */
  saveVersionShortcutHint: (mod: string) => string;
  saveVersionNoDestinationNote: string;
  saveVersionLocalOnlyNote: string;
  saveVersionPublishNextNote: string;
  saveVersionConfirm: string;
  saveVersionConfirmAndPublish: string;
  saveVersionPublishToggleLabel: string;
  saveVersionPublishAfterLabel: string;
  saveVersionSaving: string;
  saveVersionRetry: string;
  saveVersionSkipHooks: string;
  saveVersionShowDetail: string;
  saveVersionHideDetail: string;
  saveVersionDetailHeading: string;
  saveVersionSuccessTitle: string;
  saveVersionNothingTitle: string;
  saveVersionBlockedTitle: string;
  saveVersionSuccessDescription: (title: string, shortCommit: string) => string;
  saveVersionSavedOn: (title: string, branch: string | null) => string;
  saveVersionPublishNow: string;
  saveVersionDone: string;
}
