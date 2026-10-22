import type { BranchNameIssue } from "./branchNames";

export interface BranchesTranslations {
  branchesTitle: string;
  branchesSearchPlaceholder: string;
  branchesSearchAriaLabel: string;
  branchesLoading: string;
  branchesErrorLoading: string;
  branchesRetry: string;
  branchesActiveLabel: string;
  branchesEmptyOthers: string;
  branchesNoSearchMatches: string;
  branchesTruncatedNote: (visible: number, total: number) => string;
  branchesUnreadableNote: (count: number) => string;
  branchesQuickSwitchChangeLabel: (current: string) => string;
  branchesQuickSwitchTitle: string;
  branchesQuickSwitchSearchPlaceholder: string;
  branchesQuickSwitchSearchEmpty: string;
  branchesQuickSwitchFavourite: (name: string) => string;
  branchesQuickSwitchUnfavourite: (name: string) => string;
  branchesQuickSwitchFavouriteHint: string;
  branchesQuickSwitchUnfavouriteHint: string;
  branchesQuickSwitchFavouritesOnly: string;
  branchesQuickSwitchFavouritesOnlyOff: string;
  branchesQuickSwitchFavouritesEmpty: string;
  branchesQuickSwitchEmpty: string;
  branchesQuickSwitchSeeAll: string;
  branchesQuickSwitchNew: string;
  /** The quick switch's offer to make the branch a search named, when no branch
   * has that name, and what pressing it leads to. */
  branchesQuickSwitchCreateNamed: (name: string) => string;
  branchesQuickSwitchCreateHint: string;
  branchesQuickSwitchActions: (name: string) => string;
  branchesQuickSwitchBack: string;
  branchesMergeInto: (name: string) => string;
  branchesRebaseOnto: (name: string) => string;
  branchesCompareWith: (name: string) => string;
  branchesSoon: string;
  branchesActionsSoon: string;
  branchesDetachedTitle: string;
  branchesDetachedDescription: string;
  branchesDetachedRecoverButton: string;
  branchesUnbornTitle: string;
  branchesUnbornDescription: string;
  branchesNoUpstreamLabel: string;
  branchesCheckedOutElsewhere: (path: string) => string;
  branchesUniqueCommits: (count: number, main: string) => string;
  branchesSavedLabel: (date: string) => string;
  createBranchTitle: string;
  createBranchNameLabel: string;
  createBranchNamePlaceholder: string;
  createBranchSwitchLabel: string;
  createBranchDetachedNote: string;
  createBranchStartsAt: (shortCommit: string, subject: string) => string;
  createBranchConfirm: string;
  /** The confirmation step's way back to the form: it does not close. */
  createBranchBack: string;
  createBranchToast: (name: string, switched: boolean) => string;
  createBranchCreating: string;
  /** The quick create box docked under the Branches list — the way this screen
   * starts a branch. Its
   * own strings for the name field, the switch checkbox and the confirm
   * button, distinct from `createBranch*`'s: the box and the full
   * dialog can be on screen together, and sharing an accessible name across
   * two live controls would be as ambiguous to a screen reader as it is to
   * an automated query. */
  branchesQuickCreateNameLabel: string;
  branchesQuickCreateClose: string;
  /** The name field's question, asked the way the save box asks "What
   * changed?" — the name is what the branch is for. */
  branchesQuickCreateNamePlaceholder: string;
  /** Under the open field while it is empty: how a name is written, by
   * example. */
  /** Before the example name; the name itself follows in mono. */
  branchesQuickCreateNameHint: string;
  branchesQuickCreateNameExample: string;
  /** The label before the main/selected capsules — shown only when the
   * default branch and the one highlighted in the list actually differ, so
   * there is a real choice to name. */
  branchesQuickCreateSourceLabel: string;
  branchesQuickCreateSwitchLabel: string;
  /** The box's button, named apart from the dialog's own "Create" for the
   * same reason as the name field above, and saying the consequence: it
   * reads "Create and switch" whenever the press also switches. */
  branchesQuickCreateConfirmLabel: string;
  branchesQuickCreateConfirmAndSwitch: string;
  /** The button at rest, beside the one-row field: a word short enough to
   * leave the field's question whole. Its accessible name stays the
   * consequence. */
  branchesQuickCreateConfirmShort: string;
  branchesQuickCreateSuccess: (name: string, switched: boolean) => string;
  /** The name field's example when the project's own branches share a prefix
   * (`fix/…`), so it teaches the convention the project already has. */
  branchesQuickCreateNameExampleFor: (prefix: string) => string;
  /** Why a typed name would be refused, said under the field before the
   * press — see `checkBranchName`. */
  branchesNameIssue: (issue: BranchNameIssue) => string;
  /** One branch, with no name in it: the target is the subtitle. */
  switchBranchTitle: string;
  switchBranchTarget: (to: string) => string;
  switchBranchLoading: string;
  switchBranchChangedFiles: (count: number) => string;
  switchBranchChangedFilesTruncated: (visible: number, total: number) => string;
  switchBranchDirtyDescription: string;
  switchBranchSaveVersionAction: string;
  switchBranchNewBranchAction: string;
  switchBranchConfirm: string;
  switchBranchDirtySaveTitle: string;
  switchBranchDirtySaveNote: string;
  switchBranchDirtyNewTitle: string;
  switchBranchDirtyNewNote: string;
  switchBranchRecoveryNote: (from: string) => string;
  switchBranchToast: (to: string) => string;
  switchBranchSwitching: string;
  branchesFilterStateGroup: string;
  branchesFilterPrefixGroup: string;
  branchesFilterClear: string;
  branchesGroupInProgress: string;
  branchesGroupCleanUp: string;
  branchesGroupLabel: (name: string, count: number) => string;
  branchesCleanUpHint: string;
  /** The clean-up block's action: verb, count, and an ellipsis for the
   * preview it opens. */
  branchesCleanUpAction: (count: number) => string;
  branchesCleanUpActionNote: string;
  branchesSortRecent: string;
  branchesSortName: string;
  branchesSortUnpublished: string;
  branchesSwitchShort: string;
  branchesSwitchToBranchLabel: (name: string) => string;
  branchesSyncUpToDate: string;
  branchesSyncNoUpstream: string;
  branchesSyncGone: string;
  branchesSyncAhead: (count: number) => string;
  branchesSyncBehind: (count: number) => string;
  branchesSyncAheadBehind: (ahead: number, behind: number) => string;
  /** What each state glyph on a Branches row means, as its tooltip — a sentence,
   * where the short labels above are what a screen reader hears. */
  branchesGlyphActive: string;
  branchesGlyphLocalOnly: string;
  branchesGlyphGone: string;
  branchesGlyphProtected: string;
  branchesDeleteReadyTooltip: (name: string) => string;
  /** Delete on a branch whose work reached the main branch as copies. */
  branchesDeleteCopiedTooltip: (name: string, base: string) => string;
  branchesDeleteBlockedTooltip: (name: string) => string;
  branchesDeleteElsewhereTooltip: (name: string) => string;
  branchesListAriaLabel: string;
  branchesDetailAriaLabel: (name: string) => string;
  branchesBackToList: string;
  branchesFiltersLabel: string;
  branchesFiltersActive: (count: number) => string;
  branchesFiltersActiveCount: (count: number) => string;
  branchesFilterSortGroup: string;
  branchesStateTracking: string;
  branchesLatestSavedLabel: string;
  branchesAuthorYouNamed: (name: string) => string;
  branchesVersionsTitle: string;
  /** The Branches detail's drawing of where the branch left the main branch, and
   * the sentence under it that carries its numbers. */
  branchesRouteTitle: string;
  /** The Branches detail's "What you can do": what the selected branch can do with
   * the active branch, or the active branch with the main branch. */
  branchesActionsTitle: string;
  branchesMergeFrom: (base: string) => string;
  branchesActionUpdateFromDetail: (base: string) => string;
  branchesActionUpdateFromCurrent: (base: string) => string;
  branchesActionUpdateFromNews: (base: string, count: number, formatted: string) => string;
  branchesActionUpToDate: string;
  branchesActionBringIntoBase: (base: string, count: number | null, formatted: string) => string;
  branchesActionBringIntoActive: string;
  branchesActionMoveOntoDetail: string;
  branchesActionCompareTotals: (files: number, filesFormatted: string, additions: string, deletions: string) => string;
  branchesActionCompareDetail: string;
  branchesActionCompareBranchesDetail: string;
  /** The saved-versions list's head over the versions only here, and the
   * remote's mark where its copy begins — History's words. */
  branchesLocalGroup: string;
  branchesBoundaryPublished: string;
  /** The way to publish beside the count waiting and over the versions only
   * here. */
  branchesPublish: string;
  branchesRouteLoading: string;
  branchesRouteSummary: (facts: {
    base: string;
    date: string;
    own: string;
    since: string | null;
  }) => string;
  branchesRouteMerged: (base: string, since: string) => string;
  branchesRouteReturned: (facts: {
    base: string;
    left: string;
    back: string;
    own: string;
    since: string | null;
  }) => string;
  branchesRouteSame: (base: string) => string;
  /** A branch whose work came back as copies — squashed or rebased — so its own
   * versions are still only on it. */
  branchesRouteCopied: (facts: {
    base: string;
    left: string;
    back: string;
    own: string;
    squashed: boolean;
    since: string | null;
  }) => string;
  branchesOpenVersionLabel: (subject: string) => string;
  branchesPublishedPill: string;
  branchesUnpublishedPill: string;
  branchesRelationshipTitle: string;
  branchesRelationshipSyncedDetail: (upstream: string) => string;
  branchesRelationshipAheadDetail: (upstream: string) => string;
  branchesRelationshipBehindDetail: (upstream: string) => string;
  branchesRelationshipDivergedDetail: (upstream: string) => string;
  branchesRelationshipGoneDetail: (upstream: string) => string;
  branchesRelationshipLocalOnlyDetail: string;
  branchesRelationshipActiveTitle: string;
  branchesRelationshipActiveDetail: string;
  branchesRelationshipUniqueDetail: (main: string) => string;
  branchesRelationshipMergedTitle: (main: string) => string;
  branchesRelationshipMergedDetail: (main: string) => string;
  branchesRelationshipElsewhereTitle: string;
  branchesHistoryDescription: string;
  branchesHistoryScopedDescription: (name: string) => string;
  branchesHistoryAction: string;
  /** One branch, with no name in it: the branch is the subtitle. */
  deleteBranchTitle: string;
  deleteBranchTarget: (name: string) => string;
  deleteBranchBlockedTitle: string;
  deleteBranchBlockedUniqueLead: (name: string) => string;
  deleteBranchBlockedUniqueOptionPublish: string;
  deleteBranchBlockedUniqueOptionMerge: string;
  deleteBranchBlockedUniqueOptionKeep: string;
  deleteBranchBlockedElsewhereLead: string;
  deleteBranchBlockedActiveLead: string;
  deleteBranchBlockedDefaultLead: string;
  deleteBranchBlockedOperationLead: (name: string) => string;
  deleteBranchOpenChangesAction: string;
  deleteBranchSwitchAction: string;
  deleteBranchSafeLead: (branch: string) => string;
  /** A branch whose work reached the main branch only as copies: what is on the
   * main branch already, and the recovery point kept for its originals. */
  deleteBranchCopiedLead: (base: string, squashed: boolean) => string;
  deleteBranchCopiedRecovery: string;
  deleteBranchConfirm: string;
  deleteBranchConflictTitle: string;
  deleteBranchDeletedToast: (name: string, extra: "recovery" | "remote" | "remote-failed" | null) => string;
  deleteBranchDeleting: string;
  deleteBranchRemoteLabel: string;
  deleteBranchRemoteOnNote: string;
  deleteBranchRemoteOffNote: string;
  cleanUpBranchesTitle: string;
  cleanUpBranchesBlockedTitle: string;
  cleanUpBranchesLoading: string;
  cleanUpBranchesLead: string;
  cleanUpBranchesNothing: string;
  cleanUpBranchesListLabel: string;
  cleanUpBranchesSelectAll: (chosen: number, total: number) => string;
  cleanUpBranchesKeptOn: (branch: string, more: number) => string;
  cleanUpBranchesCapped: (shown: number, total: number) => string;
  cleanUpBranchesExcludedHeading: (count: number) => string;
  cleanUpBranchesRemoteLabel: (count: number) => string;
  cleanUpBranchesRemoteOnNote: string;
  cleanUpBranchesRemoteOffNote: string;
  /** Why the published-copies option is held back: no chosen branch has one. */
  cleanUpBranchesRemoteNoneNote: string;
  cleanUpBranchesRecoveryFact: string;
  cleanUpBranchesNoneChosen: string;
  cleanUpBranchesConfirm: (count: number) => string;
  /** The primary held back while the plan is read: no count yet, since the
   * plan may leave some of the asked-for branches out. */
  cleanUpBranchesConfirmPending: string;
  cleanUpBranchesDeleting: string;
  cleanUpBranchesDoneTitle: string;
  cleanUpBranchesSummary: (deleted: number, skipped: number, remoteFailed: number) => string;
  cleanUpBranchesSkippedHeading: string;
  cleanUpBranchesRemoteFailedHeading: string;
  cleanUpBranchesRemoteRefused: string;
  cleanUpBranchesRecoveryKept: string;
  cleanUpBranchesToast: (deleted: number, remote: boolean) => string;
  renameBranchTitle: (name: string) => string;
  /** How a blocked app update names an unfinished rename; the update quotes
   * it, so it carries no quotes of its own. */
  renameBranchInstallBlockerLabel: (name: string) => string;
  renameBranchNote: string;
  renameBranchUpstreamNote: (upstream: string) => string;
  renameBranchConfirm: string;
  /** The branch under the name while it is being edited in the Branches detail
   * strip — the short form of the two notes above, which it carries whole on
   * its tooltip. */
  branchesRenameInlineNote: string;
  branchesRenameInlineUpstreamNote: (upstream: string) => string;
  renameBranchRenaming: string;
  branchesRenameShort: string;
  branchesDeleteShort: string;
  branchesContextMenuLabel: (name: string) => string;
  branchesCopyName: string;
  branchesNameCopied: string;
  branchesCopyFailed: string;
  branchesRenameBranchLabel: (name: string) => string;
  branchesDefaultBranchChip: string;
  branchesDefaultBranchNote: string;
}

const en: BranchesTranslations = {
  branchesTitle: "Branches",
  branchesSearchPlaceholder: "Search branches…",
  branchesSearchAriaLabel: "Search branches",
  branchesLoading: "Loading branches…",
  branchesErrorLoading: "Couldn't load this project's branches.",
  branchesRetry: "Try again",
  branchesActiveLabel: "Active",
  branchesEmptyOthers: "No other branches yet.",
  branchesNoSearchMatches: "No branches match that search.",
  branchesTruncatedNote: (visible, total) => `Showing the ${visible} most recent of ${total}.`,
  branchesUnreadableNote: (count) =>
    count === 1
      ? "1 branch is hidden because its name can't be read. Rename it with Git."
      : `${count} branches are hidden because their names can't be read. Rename them with Git.`,
  branchesQuickSwitchChangeLabel: (current) => `Change branch (${current})`,
  branchesQuickSwitchTitle: "Switch branch",
  branchesQuickSwitchSearchPlaceholder: "Search branches…",
  branchesQuickSwitchSearchEmpty: "No branches match that search.",
  branchesQuickSwitchFavourite: (name) => `Add ${name} to favorites`,
  branchesQuickSwitchUnfavourite: (name) => `Remove ${name} from favorites`,
  branchesQuickSwitchFavouriteHint: "Add to favorites",
  branchesQuickSwitchUnfavouriteHint: "Remove from favorites",
  branchesQuickSwitchFavouritesOnly: "Show favorites only",
  branchesQuickSwitchFavouritesOnlyOff: "Show all branches",
  branchesQuickSwitchFavouritesEmpty: "No favorites yet. Star a branch to keep it here.",
  branchesQuickSwitchEmpty: "No other branches yet.",
  branchesQuickSwitchSeeAll: "Manage branches",
  branchesQuickSwitchNew: "New branch",
  branchesQuickSwitchCreateNamed: (name) => `Create “${name}”`,
  branchesQuickSwitchCreateHint: "New branch — choose where it starts next",
  branchesQuickSwitchActions: (name) => `What “${name}” can do`,
  branchesQuickSwitchBack: "Back",
  branchesMergeInto: (name) => `Merge into “${name}”`,
  branchesRebaseOnto: (name) => `Rebase “${name}” onto this`,
  branchesCompareWith: (name) => `Compare with “${name}”`,
  branchesSoon: "Soon",
  branchesActionsSoon: "Merge, rebase and compare are coming soon.",
  branchesDetachedTitle: "Not on a branch",
  branchesDetachedDescription: "You're on a specific saved version, so create a branch here to keep this work easy to find.",
  branchesDetachedRecoverButton: "Create a branch here",
  branchesUnbornTitle: "Save a version first",
  branchesUnbornDescription: "This branch has no saved versions yet, so there's nothing to start from.",
  branchesNoUpstreamLabel: "Local only",
  branchesCheckedOutElsewhere: (path) => `Open in another workspace (${path}). Switch to it from there.`,
  branchesUniqueCommits: (count, main) =>
    count === 1 ? `1 version not on ${main}` : `${count} versions not on ${main}`,
  branchesSavedLabel: (date) => `Saved ${date}`,
  createBranchTitle: "New branch",
  createBranchNameLabel: "Name",
  createBranchNamePlaceholder: "e.g. feature/new-onboarding",
  createBranchSwitchLabel: "Switch to the new branch",
  createBranchDetachedNote: "You're not on a branch, so you'll switch to the new one to keep this work easy to find.",
  createBranchStartsAt: (shortCommit, subject) => `Starts at ${shortCommit} — “${subject}”.`,
  createBranchConfirm: "Create branch",
  createBranchBack: "Back",
  createBranchToast: (name, switched) => switched ? `“${name}” created, and you're on it now.` : `“${name}” created.`,
  createBranchCreating: "Creating…",
  branchesQuickCreateNameLabel: "New branch name",
  branchesQuickCreateClose: "Close create branch form",
  branchesQuickCreateNamePlaceholder: "What will you work on?",
  branchesQuickCreateNameHint: "Like",
  branchesQuickCreateNameExample: "feature/new-feature",
  branchesQuickCreateSourceLabel: "Create from",
  branchesQuickCreateSwitchLabel: "Switch to it",
  branchesQuickCreateConfirmLabel: "Create branch",
  branchesQuickCreateConfirmShort: "Create",
  branchesQuickCreateConfirmAndSwitch: "Create and switch",
  branchesQuickCreateSuccess: (name, switched) =>
    switched ? `Created “${name}” and switched to it.` : `Created “${name}”.`,
  branchesQuickCreateNameExampleFor: (prefix) => `${prefix}/short-name`,
  branchesNameIssue: (issue) => {
    switch (issue.kind) {
      case "space":
        return "Use hyphens instead of spaces, like my-branch.";
      case "character":
        return `Names can't contain “${issue.character}”.`;
      case "control":
        return "The name has an invisible character. Retype it.";
      case "sequence":
        return `Names can't contain “${issue.sequence}”.`;
      case "leading":
        return `Names can't start with “${issue.character}”.`;
      case "part-leading-dot":
        return "No part of the name can start with a dot.";
      case "trailing":
        return `Names can't end with “${issue.character}”.`;
      case "lock-suffix":
        return "No part of the name can end with “.lock”.";
      case "reserved":
        return `“${issue.name}” is reserved by Git.`;
      case "taken":
        return `A branch named “${issue.name}” already exists.`;
      case "case-collision":
        return `“${issue.existing}” already exists, and names that differ only in capitals clash on some systems.`;
    }
  },
  switchBranchTitle: "Switch branch",
  switchBranchTarget: (to) => `You'll move to “${to}”.`,
  switchBranchLoading: "Comparing branches…",
  switchBranchChangedFiles: (count) =>
    count === 1 ? "1 file will change." : `${count} files will change.`,
  switchBranchChangedFilesTruncated: (visible, total) => `Showing ${visible} of ${total} changed files.`,
  switchBranchDirtyDescription: "Choose what to do with your unsaved changes.",
  switchBranchSaveVersionAction: "Save version",
  switchBranchNewBranchAction: "New branch with these changes",
  switchBranchConfirm: "Switch branch",
  switchBranchDirtySaveTitle: "Save them as a version",
  switchBranchDirtySaveNote: "They're saved on the current branch, then you switch.",
  switchBranchDirtyNewTitle: "Take them to a new branch",
  switchBranchDirtyNewNote: "The current branch stays as it was.",
  switchBranchRecoveryNote: (from) => `“${from}” stays as it is, and switching back returns these files.`,
  switchBranchToast: (to) => `You're now on “${to}”.`,
  switchBranchSwitching: "Switching…",
  branchesFilterStateGroup: "State",
  branchesFilterPrefixGroup: "Name prefix",
  branchesFilterClear: "Clear filters",
  branchesGroupInProgress: "In progress",
  branchesGroupCleanUp: "Ready to clean up",
  branchesGroupLabel: (name, count) => `${name}, ${count === 1 ? "1 branch" : `${count} branches`}`,
  branchesCleanUpHint: "Safe to delete",
  branchesCleanUpAction: (count) => (count === 1 ? "Clean up 1 branch…" : `Clean up ${count} branches…`),
  branchesCleanUpActionNote: "Finished: their work is on the main branch",
  branchesSortRecent: "Recent",
  branchesSortName: "Name",
  branchesSortUnpublished: "Local first",
  branchesSwitchShort: "Switch",
  branchesSwitchToBranchLabel: (name) => `Switch to “${name}”`,
  branchesSyncUpToDate: "Up to date with the remote",
  branchesSyncNoUpstream: "Not tracking a remote",
  branchesSyncGone: "Remote branch deleted",
  branchesSyncAhead: (count) => (count === 1 ? "1 not published" : `${count} not published`),
  branchesSyncBehind: (count) => (count === 1 ? "1 to get" : `${count} to get`),
  branchesSyncAheadBehind: (ahead, behind) => `${ahead} not published, ${behind} to get`,
  branchesGlyphActive: "Active — the branch you're working on",
  branchesGlyphLocalOnly: "Local only — never published, so it's only on this computer",
  branchesGlyphGone: "Its remote branch was deleted",
  branchesGlyphProtected: "Main branch — it can't be renamed or deleted",
  branchesDeleteCopiedTooltip: (name, base) =>
    `Delete “${name}”. Its work is already on ${base}; GitOdile keeps a recovery point first.`,
  branchesDeleteReadyTooltip: (name) => `Delete “${name}”. Its work is already kept elsewhere.`,
  branchesDeleteBlockedTooltip: (name) =>
    `“${name}” has work that exists nowhere else. Open it to see your options.`,
  branchesDeleteElsewhereTooltip: (name) =>
    `“${name}” is open in another workspace, so it can't be deleted here.`,
  branchesListAriaLabel: "Branches",
  branchesDetailAriaLabel: (name) => `Details for “${name}”`,
  branchesBackToList: "Back to branches",
  branchesFiltersLabel: "Filter and sort",
  branchesFiltersActive: (count) =>
    count === 1 ? "Filter and sort (1 filter on)" : `Filter and sort (${count} filters on)`,
  branchesFiltersActiveCount: (count) => (count === 1 ? "1 filter on" : `${count} filters on`),
  branchesFilterSortGroup: "Sort by",
  branchesStateTracking: "Tracking a remote",
  branchesLatestSavedLabel: "Latest saved",
  branchesAuthorYouNamed: (name) => `You (${name})`,
  branchesVersionsTitle: "Saved versions",
  branchesRouteTitle: "Route",
  branchesActionsTitle: "What you can do",
  branchesMergeFrom: (base) => `Merge “${base}” into this`,
  branchesActionUpdateFromDetail: (base) => `Brings ${base}'s newer versions into this branch.`,
  branchesActionUpdateFromCurrent: (base) => `${base} hasn't moved since this branch left it.`,
  branchesActionUpdateFromNews: (base, count, formatted) =>
    count === 1 ? `${base} has 1 newer version to bring in.` : `${base} has ${formatted} newer versions to bring in.`,
  branchesActionUpToDate: "Up to date",
  branchesActionBringIntoBase: (base, count, formatted) =>
    count === null
      ? `Adds this branch's versions to ${base} as one new saved version.`
      : count === 1
        ? `Adds this branch's version to ${base} as one new saved version.`
        : `Adds this branch's ${formatted} versions to ${base} as one new saved version.`,
  branchesActionBringIntoActive: "Adds its versions to the branch you're working on as one new saved version.",
  branchesActionMoveOntoDetail: "Replays your branch's own versions after this one's latest.",
  branchesActionCompareTotals: (files, filesFormatted, additions, deletions) =>
    `${files === 1 ? "1 file" : `${filesFormatted} files`} changed since it left · +${additions} −${deletions}`,
  branchesActionCompareDetail: "See what changed since it left, file by file.",
  branchesActionCompareBranchesDetail: "See what differs between the two branches, file by file.",
  branchesLocalGroup: "On this computer",
  branchesBoundaryPublished: "Published",
  branchesPublish: "Publish",
  branchesRouteLoading: "Reading where this branch left main…",
  branchesRouteSummary: ({ base, date, own, since }) =>
    `Left ${base}${date ? ` on ${date}` : ""}. ${own === "1" ? "1 version" : `${own} versions`} of its own. ${since ? `${base} has ${since} new ${since === "1" ? "version" : "versions"} since.` : `${base} hasn't moved since.`}`,
  branchesRouteMerged: (base, since) =>
    `All its work is on ${base}, which has ${since} new ${since === "1" ? "version" : "versions"} since.`,
  branchesRouteSame: (base) => `Same point as ${base}. No versions of its own yet.`,
  branchesRouteCopied: ({ base, left, back, own, squashed, since }) =>
    `Left ${base}${left ? ` on ${left}` : ""}. Its work came back${back ? ` on ${back}` : ""} ${
      squashed ? "as one combined version" : "as copies"
    }; the ${own === "1" ? "original is" : `${own} originals are`} only on this branch. ${
      since ? `${base} has ${since} new ${since === "1" ? "version" : "versions"} since.` : `${base} hasn't moved since.`
    }`,
  branchesRouteReturned: ({ base, left, back, own, since }) =>
    `Left ${base}${left ? ` on ${left}` : ""} and came back${back ? ` on ${back}` : ""} with ${
      own === "1" ? "1 version" : `${own} versions`
    }. ${since ? `${base} has ${since} new ${since === "1" ? "version" : "versions"} since.` : `${base} hasn't moved since.`}`,
  branchesOpenVersionLabel: (subject) => `Open “${subject}” in History`,
  branchesPublishedPill: "Published",
  branchesUnpublishedPill: "Not published yet",
  branchesRelationshipTitle: "Relationship",
  branchesRelationshipSyncedDetail: (upstream) => `In sync with ${upstream}.`,
  branchesRelationshipAheadDetail: (upstream) => `Some versions aren't on ${upstream} yet, so publish to send them.`,
  branchesRelationshipBehindDetail: (upstream) => `${upstream} has newer versions, so get project changes to bring them in.`,
  branchesRelationshipDivergedDetail: (upstream) => `This branch and ${upstream} have both moved on.`,
  branchesRelationshipGoneDetail: (upstream) => `${upstream} no longer exists on the remote, but your work here is still safe.`,
  branchesRelationshipLocalOnlyDetail: "Never published, so it's only on this computer.",
  branchesRelationshipActiveTitle: "The branch you're working on",
  branchesRelationshipActiveDetail: "New versions you save go here.",
  branchesRelationshipUniqueDetail: (main) => `Its work isn't on ${main} yet.`,
  branchesRelationshipMergedTitle: (main) => `Already on ${main}`,
  branchesRelationshipMergedDetail: (main) => `Everything saved here is also on ${main}.`,
  branchesRelationshipElsewhereTitle: "Open in another workspace",
  branchesHistoryDescription: "See every version, compare changes and go back to earlier states.",
  branchesHistoryScopedDescription: (name) => `Shows “${name}” in History without switching to it.`,
  branchesHistoryAction: "Open in History",
  deleteBranchTitle: "Delete this branch?",
  deleteBranchTarget: (name) => `“${name}”`,
  deleteBranchBlockedTitle: "Can't delete it yet",
  deleteBranchBlockedUniqueLead:
    (name) => `“${name}” has versions that aren't anywhere else. You can:`,
  deleteBranchBlockedUniqueOptionPublish: "Publish it, so the work is also on the remote.",
  deleteBranchBlockedUniqueOptionMerge: "Bring its work into another branch.",
  deleteBranchBlockedUniqueOptionKeep: "Or keep it — nothing is lost by waiting.",
  deleteBranchBlockedElsewhereLead:
    "This branch is open in another workspace. Close it there or switch that workspace to another branch, then retry.",
  deleteBranchBlockedActiveLead: "This is the branch you're working on. Switch to another one first.",
  deleteBranchBlockedDefaultLead: "This is the project's main branch, where shared work lives, so GitOdile keeps it.",
  deleteBranchBlockedOperationLead:
    (name) => `Finish or cancel it in your Git tool, then come back to delete “${name}”.`,
  deleteBranchOpenChangesAction: "See the files in conflict",
  deleteBranchSwitchAction: "Switch to this branch",
  deleteBranchSafeLead: (branch) => `Its work is already on “${branch}”, so nothing is lost.`,
  deleteBranchCopiedLead: (base, squashed) =>
    `Its work is already on “${base}”, ${squashed ? "combined into one version" : "copied version by version"}.`,
  deleteBranchCopiedRecovery:
    "Its original versions are saved as a recovery point first.",
  deleteBranchConfirm: "Delete branch",
  deleteBranchConflictTitle: "A conflict is unfinished",
  deleteBranchDeletedToast: (name, extra) =>
    extra === "remote-failed"
      ? `“${name}” is gone from this computer, but the published copy is still there.`
      : extra === "remote"
        ? `“${name}” deleted, and its published copy too.`
        : extra === "recovery"
          ? `“${name}” deleted. Its original versions are kept in a recovery point.`
          : `“${name}” deleted.`,
  deleteBranchDeleting: "Deleting…",
  deleteBranchRemoteLabel: "Also delete the published copy",
  deleteBranchRemoteOnNote: "Your team won't see it anymore.",
  deleteBranchRemoteOffNote: "It stays, and your team still sees it.",
  cleanUpBranchesTitle: "Delete these branches?",
  cleanUpBranchesBlockedTitle: "Can't delete them yet",
  cleanUpBranchesLoading: "Checking each branch…",
  cleanUpBranchesLead: "They're finished: their work is already on the main branch, so deleting them loses nothing.",
  cleanUpBranchesNothing: "None of these branches can be deleted right now.",
  cleanUpBranchesListLabel: "Branches to delete",
  cleanUpBranchesSelectAll: (chosen, total) => `All branches (${chosen} of ${total})`,
  cleanUpBranchesKeptOn: (branch, more) => (more > 0 ? `Kept on “${branch}” and ${more} more` : `Kept on “${branch}”`),
  cleanUpBranchesCapped: (shown, total) => `The first ${shown} of ${total} branches. Clean up the rest afterwards.`,
  cleanUpBranchesExcludedHeading: (count) => (count === 1 ? "1 branch left out" : `${count} branches left out`),
  cleanUpBranchesRemoteLabel: (count) =>
    count === 0
      ? "Also delete the published copies"
      : count === 1
        ? "Also delete the published copy"
        : `Also delete the ${count} published copies`,
  cleanUpBranchesRemoteOnNote: "Your team won't see them anymore.",
  cleanUpBranchesRemoteOffNote: "They stay, and your team still sees them.",
  cleanUpBranchesRemoteNoneNote: "None of the chosen branches is published.",
  cleanUpBranchesRecoveryFact: "Each branch's name and last version are kept in a recovery point on this computer first.",
  cleanUpBranchesNoneChosen: "Choose at least one branch to delete.",
  cleanUpBranchesConfirm: (count) => (count === 1 ? "Delete 1 branch" : `Delete ${count} branches`),
  cleanUpBranchesConfirmPending: "Delete branches",
  cleanUpBranchesDeleting: "Deleting…",
  cleanUpBranchesDoneTitle: "Clean-up finished",
  cleanUpBranchesSummary: (deleted, skipped, remoteFailed) =>
    [
      deleted === 1 ? "1 branch deleted" : `${deleted} branches deleted`,
      skipped > 0 ? (skipped === 1 ? "1 kept" : `${skipped} kept`) : null,
      remoteFailed > 0
        ? remoteFailed === 1
          ? "1 published copy is still there"
          : `${remoteFailed} published copies are still there`
        : null,
    ]
      .filter(Boolean)
      .join(", ") + ".",
  cleanUpBranchesSkippedHeading: "Not deleted",
  cleanUpBranchesRemoteFailedHeading: "Deleted here, still published",
  cleanUpBranchesRemoteRefused: "The remote refused to delete it; it may be protected there.",
  cleanUpBranchesRecoveryKept: "Each deleted branch's name and last version are kept in a recovery point on this computer.",
  cleanUpBranchesToast: (deleted, remote) =>
    `${deleted === 1 ? "1 branch deleted" : `${deleted} branches deleted`}${remote ? ", and the published copies too" : ""}. Each one is kept in a recovery point.`,
  renameBranchTitle: (name) => `Rename “${name}”`,
  renameBranchInstallBlockerLabel: (name) => `Rename ${name}`,
  renameBranchNote: "Only the name changes, and every saved version stays where it is.",
  renameBranchUpstreamNote: (upstream) =>
    `It keeps tracking ${upstream}, which keeps its own name. Renaming that is a separate step.`,
  renameBranchConfirm: "Rename",
  branchesRenameInlineNote: "Only the name changes",
  branchesRenameInlineUpstreamNote: (upstream) => `Only the name changes — it still tracks ${upstream}`,
  renameBranchRenaming: "Renaming…",
  branchesRenameShort: "Rename",
  branchesDeleteShort: "Delete",
  branchesContextMenuLabel: (name) => `Actions for “${name}”`,
  branchesCopyName: "Copy name",
  branchesNameCopied: "Name copied",
  branchesCopyFailed: "Couldn't copy the name.",
  branchesRenameBranchLabel: (name) => `Rename “${name}”`,
  branchesDefaultBranchChip: "Main branch",
  branchesDefaultBranchNote: "Shared work lives here, so GitOdile doesn't rename or delete it.",
};

const es: BranchesTranslations = {
  branchesTitle: "Ramas",
  branchesSearchPlaceholder: "Buscar ramas…",
  branchesSearchAriaLabel: "Buscar ramas",
  branchesLoading: "Cargando ramas…",
  branchesErrorLoading: "No se pudieron cargar las ramas de este proyecto.",
  branchesRetry: "Reintentar",
  branchesActiveLabel: "Activa",
  branchesEmptyOthers: "Aún no hay otras ramas.",
  branchesNoSearchMatches: "Ninguna rama coincide con la búsqueda.",
  branchesTruncatedNote: (visible, total) => `Se muestran las ${visible} más recientes de ${total}.`,
  branchesUnreadableNote: (count) =>
    count === 1
      ? "1 rama está oculta porque su nombre no se puede leer. Renómbrala con Git."
      : `${count} ramas están ocultas porque sus nombres no se pueden leer. Renómbralas con Git.`,
  branchesQuickSwitchChangeLabel: (current) => `Cambiar de rama (${current})`,
  branchesQuickSwitchTitle: "Cambiar de rama",
  branchesQuickSwitchSearchPlaceholder: "Buscar ramas…",
  branchesQuickSwitchSearchEmpty: "Ninguna rama coincide con la búsqueda.",
  branchesQuickSwitchFavourite: (name) => `Añadir ${name} a favoritos`,
  branchesQuickSwitchUnfavourite: (name) => `Quitar ${name} de favoritos`,
  branchesQuickSwitchFavouriteHint: "Añadir a favoritos",
  branchesQuickSwitchUnfavouriteHint: "Quitar de favoritos",
  branchesQuickSwitchFavouritesOnly: "Ver solo favoritos",
  branchesQuickSwitchFavouritesOnlyOff: "Ver todas las ramas",
  branchesQuickSwitchFavouritesEmpty: "Aún no hay favoritos. Marca una rama con la estrella para tenerla aquí.",
  branchesQuickSwitchEmpty: "Aún no hay otras ramas.",
  branchesQuickSwitchSeeAll: "Gestionar ramas",
  branchesQuickSwitchNew: "Nueva rama",
  branchesQuickSwitchCreateNamed: (name) => `Crear «${name}»`,
  branchesQuickSwitchCreateHint: "Rama nueva: después eliges desde dónde empieza",
  branchesQuickSwitchActions: (name) => `Qué se puede hacer con «${name}»`,
  branchesQuickSwitchBack: "Volver",
  branchesMergeInto: (name) => `Fusionar con «${name}»`,
  branchesRebaseOnto: (name) => `Rebasar «${name}» sobre esta`,
  branchesCompareWith: (name) => `Comparar con «${name}»`,
  branchesSoon: "Pronto",
  branchesActionsSoon: "Fusionar, rebasar y comparar llegarán pronto.",
  branchesDetachedTitle: "No estás en una rama",
  branchesDetachedDescription: "Estás en una versión guardada concreta, así que crea aquí una rama para que este trabajo sea fácil de encontrar.",
  branchesDetachedRecoverButton: "Crear una rama aquí",
  branchesUnbornTitle: "Guarda una versión primero",
  branchesUnbornDescription: "Esta rama aún no tiene versiones guardadas, así que no hay desde dónde partir.",
  branchesNoUpstreamLabel: "Solo local",
  branchesCheckedOutElsewhere: (path) => `Abierta en otro espacio de trabajo (${path}). Cambia a ella desde ahí.`,
  branchesUniqueCommits: (count, main) =>
    count === 1 ? `1 versión que no está en ${main}` : `${count} versiones que no están en ${main}`,
  branchesSavedLabel: (date) => `Guardada el ${date}`,
  createBranchTitle: "Nueva rama",
  createBranchNameLabel: "Nombre",
  createBranchNamePlaceholder: "p. ej. feature/nueva-bienvenida",
  createBranchSwitchLabel: "Cambiar a la nueva rama",
  createBranchDetachedNote: "No estás en una rama, así que cambiarás a la nueva para que este trabajo sea fácil de encontrar.",
  createBranchStartsAt: (shortCommit, subject) => `Empieza en ${shortCommit}: «${subject}».`,
  createBranchConfirm: "Crear rama",
  createBranchBack: "Atrás",
  createBranchToast: (name, switched) => switched ? `«${name}» creada, y ya estás en ella.` : `«${name}» creada.`,
  createBranchCreating: "Creando…",
  branchesQuickCreateNameLabel: "Nombre de la nueva rama",
  branchesQuickCreateClose: "Cerrar formulario de crear rama",
  branchesQuickCreateNamePlaceholder: "¿En qué vas a trabajar?",
  branchesQuickCreateNameHint: "Como",
  branchesQuickCreateNameExample: "feature/nueva-funcionalidad",
  branchesQuickCreateSourceLabel: "Crear desde",
  branchesQuickCreateSwitchLabel: "Cambiar a ella",
  branchesQuickCreateConfirmLabel: "Crear rama",
  branchesQuickCreateConfirmShort: "Crear",
  branchesQuickCreateConfirmAndSwitch: "Crear y cambiar",
  branchesQuickCreateSuccess: (name, switched) =>
    switched ? `Se creó «${name}» y se cambió a ella.` : `Se creó «${name}».`,
  branchesQuickCreateNameExampleFor: (prefix) => `${prefix}/nombre-corto`,
  branchesNameIssue: (issue) => {
    switch (issue.kind) {
      case "space":
        return "Usa guiones en lugar de espacios, como mi-linea.";
      case "character":
        return `Los nombres no pueden llevar «${issue.character}».`;
      case "control":
        return "El nombre tiene un carácter invisible. Vuelve a escribirlo.";
      case "sequence":
        return `Los nombres no pueden llevar «${issue.sequence}».`;
      case "leading":
        return `Los nombres no pueden empezar por «${issue.character}».`;
      case "part-leading-dot":
        return "Ninguna parte del nombre puede empezar por un punto.";
      case "trailing":
        return `Los nombres no pueden acabar en «${issue.character}».`;
      case "lock-suffix":
        return "Ninguna parte del nombre puede acabar en «.lock».";
      case "reserved":
        return `«${issue.name}» está reservado por Git.`;
      case "taken":
        return `Ya existe una rama llamada «${issue.name}».`;
      case "case-collision":
        return `Ya existe «${issue.existing}», y los nombres que solo cambian en mayúsculas chocan en algunos sistemas.`;
    }
  },
  switchBranchTitle: "Cambiar de rama",
  switchBranchTarget: (to) => `Pasarás a «${to}».`,
  switchBranchLoading: "Comparando ramas…",
  switchBranchChangedFiles: (count) =>
    count === 1 ? "Cambiará 1 archivo." : `Cambiarán ${count} archivos.`,
  switchBranchChangedFilesTruncated: (visible, total) => `Se muestran ${visible} de ${total} archivos cambiados.`,
  switchBranchDirtyDescription: "Elige qué hacer con tus cambios sin guardar.",
  switchBranchSaveVersionAction: "Guardar versión",
  switchBranchNewBranchAction: "Rama nueva con estos cambios",
  switchBranchConfirm: "Cambiar de rama",
  switchBranchDirtySaveTitle: "Guardarlos como versión",
  switchBranchDirtySaveNote: "Se guardan en la rama actual y luego cambias.",
  switchBranchDirtyNewTitle: "Llevarlos a una rama nueva",
  switchBranchDirtyNewNote: "La rama actual se queda como estaba.",
  switchBranchRecoveryNote: (from) => `«${from}» se queda tal cual y, al volver, recuperas estos archivos.`,
  switchBranchToast: (to) => `Ahora estás en «${to}».`,
  switchBranchSwitching: "Cambiando…",
  branchesFilterStateGroup: "Estado",
  branchesFilterPrefixGroup: "Prefijo del nombre",
  branchesFilterClear: "Quitar filtros",
  branchesGroupInProgress: "En curso",
  branchesGroupCleanUp: "Listas para limpiar",
  branchesGroupLabel: (name, count) => `${name}, ${count === 1 ? "1 rama" : `${count} ramas`}`,
  branchesCleanUpHint: "Se pueden eliminar",
  branchesCleanUpAction: (count) => (count === 1 ? "Limpiar 1 rama…" : `Limpiar ${count} ramas…`),
  branchesCleanUpActionNote: "Terminadas: su trabajo está en la rama principal",
  branchesSortRecent: "Recientes",
  branchesSortName: "Nombre",
  branchesSortUnpublished: "Locales primero",
  branchesSwitchShort: "Cambiar",
  branchesSwitchToBranchLabel: (name) => `Cambiar a «${name}»`,
  branchesSyncUpToDate: "Al día con el remoto",
  branchesSyncNoUpstream: "No sigue ningún remoto",
  branchesSyncGone: "Rama remota eliminada",
  branchesSyncAhead: (count) => (count === 1 ? "1 sin publicar" : `${count} sin publicar`),
  branchesSyncBehind: (count) => (count === 1 ? "1 por traer" : `${count} por traer`),
  branchesSyncAheadBehind: (ahead, behind) => `${ahead} sin publicar, ${behind} por traer`,
  branchesGlyphActive: "Activa: la rama en la que estás trabajando",
  branchesGlyphLocalOnly: "Solo local: nunca se ha publicado, así que solo está en este ordenador",
  branchesGlyphGone: "Su rama remota se eliminó",
  branchesGlyphProtected: "Rama principal: no se puede renombrar ni eliminar",
  branchesDeleteCopiedTooltip: (name, base) =>
    `Eliminar «${name}». Su trabajo ya está en ${base}; GitOdile guarda antes un punto de recuperación.`,
  branchesDeleteReadyTooltip: (name) => `Eliminar «${name}». Su trabajo ya está en otro sitio.`,
  branchesDeleteBlockedTooltip: (name) =>
    `«${name}» tiene trabajo que no está en ningún otro sitio. Ábrela para ver tus opciones.`,
  branchesDeleteElsewhereTooltip: (name) =>
    `«${name}» está abierta en otro espacio de trabajo, así que no se puede eliminar desde aquí.`,
  branchesListAriaLabel: "Ramas",
  branchesDetailAriaLabel: (name) => `Detalles de «${name}»`,
  branchesBackToList: "Volver a las ramas",
  branchesFiltersLabel: "Filtrar y ordenar",
  branchesFiltersActive: (count) =>
    count === 1 ? "Filtrar y ordenar (1 filtro activo)" : `Filtrar y ordenar (${count} filtros activos)`,
  branchesFiltersActiveCount: (count) =>
    count === 1 ? "1 filtro activo" : `${count} filtros activos`,
  branchesFilterSortGroup: "Ordenar por",
  branchesStateTracking: "Sigue un remoto",
  branchesLatestSavedLabel: "Última guardada",
  branchesAuthorYouNamed: (name) => `Tú (${name})`,
  branchesVersionsTitle: "Versiones guardadas",
  branchesRouteTitle: "Recorrido",
  branchesActionsTitle: "Qué puedes hacer",
  branchesMergeFrom: (base) => `Fusionar «${base}» en esta`,
  branchesActionUpdateFromDetail: (base) => `Trae a esta rama las versiones nuevas de ${base}.`,
  branchesActionUpdateFromCurrent: (base) => `${base} no se ha movido desde que salió esta rama.`,
  branchesActionUpdateFromNews: (base, count, formatted) =>
    count === 1 ? `${base} tiene 1 versión nueva que traer.` : `${base} tiene ${formatted} versiones nuevas que traer.`,
  branchesActionUpToDate: "Al día",
  branchesActionBringIntoBase: (base, count, formatted) =>
    count === null
      ? `Añade a ${base} las versiones de esta rama en una versión guardada nueva.`
      : count === 1
        ? `Añade a ${base} la versión de esta rama en una versión guardada nueva.`
        : `Añade a ${base} las ${formatted} versiones de esta rama en una versión guardada nueva.`,
  branchesActionBringIntoActive: "Añade sus versiones a la rama en la que trabajas en una versión guardada nueva.",
  branchesActionMoveOntoDetail: "Rehace las versiones propias de tu rama después de la última de esta.",
  branchesActionCompareTotals: (files, filesFormatted, additions, deletions) =>
    `${files === 1 ? "1 archivo cambiado" : `${filesFormatted} archivos cambiados`} desde que salió · +${additions} −${deletions}`,
  branchesActionCompareDetail: "Mira qué cambió desde que salió, archivo a archivo.",
  branchesActionCompareBranchesDetail: "Mira en qué se diferencian las dos ramas, archivo a archivo.",
  branchesLocalGroup: "En este ordenador",
  branchesBoundaryPublished: "Publicado",
  branchesPublish: "Publicar",
  branchesRouteLoading: "Leyendo dónde salió esta rama de main…",
  branchesRouteSummary: ({ base, date, own, since }) =>
    `Salió de ${base}${date ? ` el ${date}` : ""}. ${own === "1" ? "1 versión propia" : `${own} versiones propias`}. ${since ? `${base} tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.` : `${base} no se ha movido desde entonces.`}`,
  branchesRouteMerged: (base, since) =>
    `Todo su trabajo está en ${base}, que tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.`,
  branchesRouteSame: (base) => `Está en el mismo punto que ${base}. Aún no tiene versiones propias.`,
  branchesRouteCopied: ({ base, left, back, own, squashed, since }) =>
    `Salió de ${base}${left ? ` el ${left}` : ""}. Su trabajo volvió${back ? ` el ${back}` : ""} ${
      squashed ? "unido en una sola versión" : "en copias"
    }; ${own === "1" ? "el original solo está" : `los ${own} originales solo están`} en esta rama. ${
      since ? `${base} tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.` : `${base} no se ha movido desde entonces.`
    }`,
  branchesRouteReturned: ({ base, left, back, own, since }) =>
    `Salió de ${base}${left ? ` el ${left}` : ""} y volvió${back ? ` el ${back}` : ""} con ${
      own === "1" ? "1 versión" : `${own} versiones`
    }. ${since ? `${base} tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.` : `${base} no se ha movido desde entonces.`}`,
  branchesOpenVersionLabel: (subject) => `Abrir «${subject}» en Historial`,
  branchesPublishedPill: "Publicada",
  branchesUnpublishedPill: "Aún sin publicar",
  branchesRelationshipTitle: "Relación",
  branchesRelationshipSyncedDetail: (upstream) => `Al día con ${upstream}.`,
  branchesRelationshipAheadDetail: (upstream) => `Algunas versiones aún no están en ${upstream}, así que publícalas para enviarlas.`,
  branchesRelationshipBehindDetail: (upstream) => `${upstream} tiene versiones nuevas, así que trae los cambios del proyecto para incorporarlas.`,
  branchesRelationshipDivergedDetail: (upstream) => `Esta rama y ${upstream} han avanzado cada una por su lado.`,
  branchesRelationshipGoneDetail: (upstream) => `${upstream} ya no existe en el remoto, pero tu trabajo aquí sigue a salvo.`,
  branchesRelationshipLocalOnlyDetail: "Nunca se ha publicado, así que solo está en este ordenador.",
  branchesRelationshipActiveTitle: "La rama en la que estás trabajando",
  branchesRelationshipActiveDetail: "Las versiones que guardes van aquí.",
  branchesRelationshipUniqueDetail: (main) => `Su trabajo aún no está en ${main}.`,
  branchesRelationshipMergedTitle: (main) => `Ya está en ${main}`,
  branchesRelationshipMergedDetail: (main) => `Todo lo guardado aquí también está en ${main}.`,
  branchesRelationshipElsewhereTitle: "Abierta en otro espacio de trabajo",
  branchesHistoryDescription: "Mira todas las versiones, compara cambios y vuelve a estados anteriores.",
  branchesHistoryScopedDescription: (name) => `Muestra «${name}» en Historial sin cambiar a ella.`,
  branchesHistoryAction: "Abrir en Historial",
  deleteBranchTitle: "¿Eliminar esta rama?",
  deleteBranchTarget: (name) => `«${name}»`,
  deleteBranchBlockedTitle: "Aún no se puede eliminar",
  deleteBranchBlockedUniqueLead:
    (name) => `«${name}» tiene versiones que no están en otra parte. Puedes:`,
  deleteBranchBlockedUniqueOptionPublish: "Publicarla, para que el trabajo también esté en el remoto.",
  deleteBranchBlockedUniqueOptionMerge: "Llevar su trabajo a otra rama.",
  deleteBranchBlockedUniqueOptionKeep: "O conservarla: esperar no hace perder nada.",
  deleteBranchBlockedElsewhereLead:
    "Esta rama está abierta en otro espacio de trabajo. Ciérrala ahí o cambia ese espacio a otra rama, y reintenta.",
  deleteBranchBlockedActiveLead: "Es la rama en la que estás trabajando. Cambia antes a otra.",
  deleteBranchBlockedDefaultLead: "Es la rama principal del proyecto, donde vive el trabajo compartido, así que GitOdile la conserva.",
  deleteBranchBlockedOperationLead:
    (name) => `Termínalo o cancélalo en tu herramienta de Git y vuelve para eliminar «${name}».`,
  deleteBranchOpenChangesAction: "Ver los archivos en conflicto",
  deleteBranchSwitchAction: "Cambiar a esta rama",
  deleteBranchSafeLead: (branch) => `Su trabajo ya está en «${branch}», así que no se pierde nada.`,
  deleteBranchCopiedLead: (base, squashed) =>
    `Su trabajo ya está en «${base}», ${squashed ? "combinado en una sola versión" : "copiado versión a versión"}.`,
  deleteBranchCopiedRecovery:
    "Antes de eliminarla se guardan las versiones originales como punto de recuperación.",
  deleteBranchConfirm: "Eliminar rama",
  deleteBranchConflictTitle: "Hay un conflicto a medias",
  deleteBranchDeletedToast: (name, extra) =>
    extra === "remote-failed"
      ? `«${name}» ya no está en este ordenador, pero la copia publicada sigue ahí.`
      : extra === "remote"
        ? `«${name}» eliminada, también su copia publicada.`
        : extra === "recovery"
          ? `«${name}» eliminada. Sus versiones originales quedan en un punto de recuperación.`
          : `«${name}» eliminada.`,
  deleteBranchDeleting: "Eliminando…",
  deleteBranchRemoteLabel: "Eliminar también la copia publicada",
  deleteBranchRemoteOnNote: "Tu equipo dejará de verla.",
  deleteBranchRemoteOffNote: "Se queda, y tu equipo la sigue viendo.",
  cleanUpBranchesTitle: "¿Eliminar estas ramas?",
  cleanUpBranchesBlockedTitle: "Aún no se pueden eliminar",
  cleanUpBranchesLoading: "Comprobando cada rama…",
  cleanUpBranchesLead: "Están terminadas: su trabajo ya está en la rama principal, así que eliminarlas no hace perder nada.",
  cleanUpBranchesNothing: "Ahora mismo no se puede eliminar ninguna de estas ramas.",
  cleanUpBranchesListLabel: "Ramas que se eliminarán",
  cleanUpBranchesSelectAll: (chosen, total) => `Todas las ramas (${chosen} de ${total})`,
  cleanUpBranchesKeptOn: (branch, more) => (more > 0 ? `Está en «${branch}» y ${more} más` : `Está en «${branch}»`),
  cleanUpBranchesCapped: (shown, total) => `Las primeras ${shown} de ${total} ramas. Limpia el resto después.`,
  cleanUpBranchesExcludedHeading: (count) => (count === 1 ? "1 rama se queda fuera" : `${count} ramas se quedan fuera`),
  cleanUpBranchesRemoteLabel: (count) =>
    count === 0
      ? "Eliminar también las copias publicadas"
      : count === 1
        ? "Eliminar también la copia publicada"
        : `Eliminar también las ${count} copias publicadas`,
  cleanUpBranchesRemoteOnNote: "Tu equipo dejará de verlas.",
  cleanUpBranchesRemoteOffNote: "Se quedan, y tu equipo las sigue viendo.",
  cleanUpBranchesRemoteNoneNote: "Ninguna de las ramas elegidas está publicada.",
  cleanUpBranchesRecoveryFact: "Antes se guarda el nombre y la última versión de cada rama en un punto de recuperación en este ordenador.",
  cleanUpBranchesNoneChosen: "Elige al menos una rama para eliminar.",
  cleanUpBranchesConfirm: (count) => (count === 1 ? "Eliminar 1 rama" : `Eliminar ${count} ramas`),
  cleanUpBranchesConfirmPending: "Eliminar ramas",
  cleanUpBranchesDeleting: "Eliminando…",
  cleanUpBranchesDoneTitle: "Limpieza terminada",
  cleanUpBranchesSummary: (deleted, skipped, remoteFailed) =>
    [
      deleted === 1 ? "1 rama eliminada" : `${deleted} ramas eliminadas`,
      skipped > 0 ? (skipped === 1 ? "1 conservada" : `${skipped} conservadas`) : null,
      remoteFailed > 0
        ? remoteFailed === 1
          ? "1 copia publicada sigue ahí"
          : `${remoteFailed} copias publicadas siguen ahí`
        : null,
    ]
      .filter(Boolean)
      .join(", ") + ".",
  cleanUpBranchesSkippedHeading: "Sin eliminar",
  cleanUpBranchesRemoteFailedHeading: "Eliminadas aquí, aún publicadas",
  cleanUpBranchesRemoteRefused: "El remoto se negó a eliminarla; puede que esté protegida allí.",
  cleanUpBranchesRecoveryKept: "El nombre y la última versión de cada rama eliminada quedan en un punto de recuperación en este ordenador.",
  cleanUpBranchesToast: (deleted, remote) =>
    `${deleted === 1 ? "1 rama eliminada" : `${deleted} ramas eliminadas`}${remote ? ", y también sus copias publicadas" : ""}. Cada una queda en un punto de recuperación.`,
  renameBranchTitle: (name) => `Renombrar «${name}»`,
  renameBranchInstallBlockerLabel: (name) => `Renombrar ${name}`,
  renameBranchNote: "Solo cambia el nombre y todas las versiones guardadas se quedan donde están.",
  renameBranchUpstreamNote: (upstream) =>
    `Sigue apuntando a ${upstream}, que conserva su nombre. Renombrarla ahí es otro paso.`,
  renameBranchConfirm: "Renombrar",
  branchesRenameInlineNote: "Solo cambia el nombre",
  branchesRenameInlineUpstreamNote: (upstream) => `Solo cambia el nombre: sigue apuntando a ${upstream}`,
  renameBranchRenaming: "Renombrando…",
  branchesRenameShort: "Renombrar",
  branchesDeleteShort: "Eliminar",
  branchesContextMenuLabel: (name) => `Acciones para «${name}»`,
  branchesCopyName: "Copiar el nombre",
  branchesNameCopied: "Nombre copiado",
  branchesCopyFailed: "No se pudo copiar el nombre.",
  branchesRenameBranchLabel: (name) => `Renombrar «${name}»`,
  branchesDefaultBranchChip: "Rama principal",
  branchesDefaultBranchNote: "Aquí vive el trabajo compartido, así que GitOdile no la renombra ni la elimina.",
};

export const branchesTranslations = { en, es } as const;
