import type { DaySlot } from "./launcher";

/** Home: the greeting, the launcher and setting the computer up. */
export interface HomeTranslations {
  homeCloneRemoteProject: string;
  homeCreateLocalProject: string;
  /** One line under each welcome action, answering "which of these three is
   * mine?" — the labels alone don't separate opening a folder that is already
   * a project from creating or downloading one. */
  homeCreateLocalProjectHint: string;
  homeOpenProjectHint: string;
  homeCloneRemoteProjectHint: string;
  homeRecentProjectsTitle: string;
  /** Home's h1: the part of the day, and the Git identity's first name when
   * there is one. */
  homeGreeting: (slot: DaySlot, name: string | null) => string;
  /** The question under the greeting; `index` is below `PROMPTS_PER_SLOT`. */
  homePrompt: (slot: DaySlot, index: number) => string;
  homeLauncherLabel: string;
  homeLauncherPlaceholder: string;
  /** With no recent projects yet there is nothing to search, only something
   * to paste. */
  homeLauncherPlaceholderFirst: string;
  homeTabsLabel: string;
  homeTabRecent: string;
  homeTabFavourites: string;
  homeContinueKicker: string;
  homeContinueAction: string;
  homeFavouritesEmpty: string;
  homeNoMatches: (query: string) => string;
  homeSectionProjects: string;
  homeSectionActions: string;
  homeSectionRemote: string;
  homeSectionSameName: string;
  homeCloneUrl: (name: string | null) => string;
  homeCloneUrlHint: string;
  homeOpenPath: string;
  homeCreateNamed: (name: string) => string;
  homeCreateNamedHint: string;
  /** The three ways to start, shortened for the launcher's footer; each
   * button's accessible name stays the full label it begins with. */
  homeActionCreate: string;
  homeActionOpen: string;
  homeRecentOpenBadge: string;
  homeActionClone: string;
  /** Discovery line for the window's drag-and-drop: the gesture works, and
   * nothing on screen said so. */
  homeDropHint: string;
  homeSetupTitle: string;
  homeSetupProgress: (done: number, total: number) => string;
  homeSetupHide: string;
  homeSetupOptional: string;
  homeSetupGitDone: (version: string) => string;
  homeSetupGitTitle: string;
  homeSetupIdentityTitle: string;
  homeSetupIdentityHint: string;
  homeSetupIdentityDone: (name: string) => string;
  homeSetupIdentityAction: string;
  homeSetupAccountTitle: string;
  homeSetupAccountHint: string;
  homeSetupAccountDone: (login: string) => string;
  homeSetupAccountAction: string;
  homeGitMissingTitle: string;
  homeGitMissingHint: string;
  homeGitUnusableTitle: string;
  homeGitUnusableHint: string;
  homeGitInstall: string;
  homeGitOpenSettings: string;
  homeGitCheckAgain: string;
  homeGitChecking: string;
  /** The card's own status line: what this computer is set up with. */
  homeStatusLabel: string;
  homeSearch: string;
  homeSearchLabel: string;
  homeStatusGit: (version: string) => string;
  homeStatusIdentityMissing: string;
  homeStatusAccount: (provider: string, login: string) => string;
  homeStatusConnect: string;
  homeStatusConnectAnother: string;
  homeStatusAccounts: (count: number) => string;
  homeStatusAccountGroup: (provider: string, logins: string) => string;
  homeAccountChooser: (provider: string) => string;
  homeAccountSourceConnection: string;
  homeAccountSourceToken: string;
  homeAccountSectionAll: (provider: string) => string;
  homeAccountSection: (provider: string, login: string) => string;
  homeAccountSearchPlaceholder: (provider: string) => string;
  homeAccountLoading: string;
  homeAzureCloneHelp: string;
  homeAzureCloneAction: string;
  homeAccountError: string;
  homeAccountRetry: string;
  homeAccountEmpty: string;
  homeAccountNoMatches: (query: string) => string;
  homeAccountMore: string;
  homeRepoPrivate: string;
  homeRepoPublic: string;
  homeRepoArchived: string;
  homeForgetRecentProject: (name: string) => string;
  homeForgetRecentProjectShort: string;
}
