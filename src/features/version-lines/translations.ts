import type { LineNameIssue } from "./lineNames";

export interface VersionLinesTranslations {
  versionLinesTitle: string;
  versionLinesSearchPlaceholder: string;
  versionLinesSearchAriaLabel: string;
  versionLinesLoading: string;
  versionLinesErrorLoading: string;
  versionLinesRetry: string;
  versionLinesActiveLabel: string;
  versionLinesEmptyOthers: string;
  versionLinesNoSearchMatches: string;
  versionLinesTruncatedNote: (visible: number, total: number) => string;
  versionLinesUnreadableNote: (count: number) => string;
  versionLinesQuickSwitchChangeLabel: (current: string) => string;
  versionLinesQuickSwitchTitle: string;
  versionLinesQuickSwitchSearchPlaceholder: string;
  versionLinesQuickSwitchSearchEmpty: string;
  versionLinesQuickSwitchFavourite: (name: string) => string;
  versionLinesQuickSwitchUnfavourite: (name: string) => string;
  versionLinesQuickSwitchFavouriteHint: string;
  versionLinesQuickSwitchUnfavouriteHint: string;
  versionLinesQuickSwitchFavouritesOnly: string;
  versionLinesQuickSwitchFavouritesOnlyOff: string;
  versionLinesQuickSwitchFavouritesEmpty: string;
  versionLinesQuickSwitchEmpty: string;
  versionLinesQuickSwitchSeeAll: string;
  versionLinesQuickSwitchNew: string;
  /** The quick switch's offer to make the line a search named, when no line
   * has that name, and what pressing it leads to. */
  versionLinesQuickSwitchCreateNamed: (name: string) => string;
  versionLinesQuickSwitchCreateHint: string;
  versionLinesQuickSwitchActions: (name: string) => string;
  versionLinesQuickSwitchBack: string;
  versionLinesMergeInto: (name: string) => string;
  versionLinesRebaseOnto: (name: string) => string;
  versionLinesCompareWith: (name: string) => string;
  versionLinesSoon: string;
  versionLinesActionsSoon: string;
  versionLinesDetachedTitle: string;
  versionLinesDetachedDescription: string;
  versionLinesDetachedRecoverButton: string;
  versionLinesUnbornTitle: string;
  versionLinesUnbornDescription: string;
  versionLinesNoUpstreamLabel: string;
  versionLinesCheckedOutElsewhere: (path: string) => string;
  versionLinesUniqueCommits: (count: number, main: string) => string;
  versionLinesSavedLabel: (date: string) => string;
  createVersionLineTitle: string;
  createVersionLineNameLabel: string;
  createVersionLineNamePlaceholder: string;
  createVersionLineSwitchLabel: string;
  createVersionLineDetachedNote: string;
  createVersionLineStartsAt: (shortCommit: string, subject: string) => string;
  createVersionLineConfirm: string;
  createVersionLineCreating: string;
  createVersionLineSuccessTitle: string;
  createVersionLineDone: string;
  /** The quick create box docked under the Lines list — the way this screen
   * starts a line. Its
   * own strings for the name field, the switch checkbox and the confirm
   * button, distinct from `createVersionLine*`'s: the box and the full
   * dialog can be on screen together, and sharing an accessible name across
   * two live controls would be as ambiguous to a screen reader as it is to
   * an automated query. */
  versionLinesQuickCreateNameLabel: string;
  /** The name field's question, asked the way the save box asks "What
   * changed?" — the name is what the line is for. */
  versionLinesQuickCreateNamePlaceholder: string;
  /** Under the open field while it is empty: how a name is written, by
   * example. */
  /** Before the example name; the name itself follows in mono. */
  versionLinesQuickCreateNameHint: string;
  versionLinesQuickCreateNameExample: string;
  /** The label before the main/selected capsules — shown only when the
   * default line and the one highlighted in the list actually differ, so
   * there is a real choice to name. */
  versionLinesQuickCreateSourceLabel: string;
  versionLinesQuickCreateSwitchLabel: string;
  /** The box's button, named apart from the dialog's own "Create" for the
   * same reason as the name field above, and saying the consequence: it
   * reads "Create and switch" whenever the press also switches. */
  versionLinesQuickCreateConfirmLabel: string;
  versionLinesQuickCreateConfirmAndSwitch: string;
  /** The button at rest, beside the one-row field: a word short enough to
   * leave the field's question whole. Its accessible name stays the
   * consequence. */
  versionLinesQuickCreateConfirmShort: string;
  versionLinesQuickCreateSuccess: (name: string, switched: boolean) => string;
  /** The name field's example when the project's own lines share a prefix
   * (`fix/…`), so it teaches the convention the project already has. */
  versionLinesQuickCreateNameExampleFor: (prefix: string) => string;
  /** Why a typed name would be refused, said under the field before the
   * press — see `checkLineName`. */
  versionLinesNameIssue: (issue: LineNameIssue) => string;
  switchVersionLineTitle: (to: string) => string;
  switchVersionLineLoading: string;
  switchVersionLineChangedFiles: (count: number) => string;
  switchVersionLineChangedFilesTruncated: (visible: number, total: number) => string;
  switchVersionLineDirtyDescription: string;
  switchVersionLineSaveVersionAction: string;
  switchVersionLineNewLineAction: string;
  switchVersionLineConfirm: string;
  switchVersionLineSwitching: string;
  switchVersionLineSuccessTitle: string;
  switchVersionLineDone: string;
  versionLinesFilterStateGroup: string;
  versionLinesFilterPrefixGroup: string;
  versionLinesFilterClear: string;
  versionLinesSortRecent: string;
  versionLinesSortName: string;
  versionLinesSortUnpublished: string;
  versionLinesSwitchShort: string;
  versionLinesSwitchToLineLabel: (name: string) => string;
  versionLinesSyncUpToDate: string;
  versionLinesSyncNoUpstream: string;
  versionLinesSyncGone: string;
  versionLinesSyncAhead: (count: number) => string;
  versionLinesSyncBehind: (count: number) => string;
  versionLinesSyncAheadBehind: (ahead: number, behind: number) => string;
  versionLinesDeletablePill: string;
  versionLinesNotDeletablePill: string;
  /** What each state glyph on a Lines row means, as its tooltip — a sentence,
   * where the short labels above are what a screen reader hears. */
  versionLinesGlyphActive: string;
  versionLinesGlyphLocalOnly: string;
  versionLinesGlyphGone: string;
  versionLinesGlyphProtected: string;
  versionLinesGlyphDeletable: string;
  versionLinesGlyphNotDeletable: string;
  versionLinesDeleteReadyTooltip: (name: string) => string;
  /** Delete on a line whose work reached the main line as copies. */
  versionLinesDeleteCopiedTooltip: (name: string, base: string) => string;
  versionLinesDeleteBlockedTooltip: (name: string) => string;
  versionLinesDeleteElsewhereTooltip: (name: string) => string;
  versionLinesListAriaLabel: string;
  versionLinesDetailAriaLabel: (name: string) => string;
  versionLinesBackToList: string;
  versionLinesFiltersLabel: string;
  versionLinesFiltersActive: (count: number) => string;
  versionLinesFiltersActiveCount: (count: number) => string;
  versionLinesFilterSortGroup: string;
  versionLinesStateTracking: string;
  versionLinesLatestSavedLabel: string;
  versionLinesVersionsTitle: string;
  /** The Lines detail's drawing of where the line left the main line, and
   * the sentence under it that carries its numbers. */
  versionLinesRouteTitle: string;
  /** The Lines detail's comparison with the main line, under the route. */
  versionLinesChangesTitle: (base: string) => string;
  versionLinesChangesBroughtTitle: (base: string) => string;
  versionLinesChangesFiles: (count: number, formatted: string) => string;
  versionLinesChangesSince: string;
  versionLinesChangesMore: (count: number, formatted: string) => string;
  versionLinesChangesBinary: string;
  versionLinesCompareShort: string;
  /** The last row of the shortened saved-versions list. */
  versionLinesVersionsMore: (count: number, formatted: string) => string;
  versionLinesRouteLoading: string;
  versionLinesRouteSummary: (facts: {
    base: string;
    date: string;
    own: string;
    unpublished: string | null;
    since: string | null;
  }) => string;
  versionLinesRouteMerged: (base: string, since: string) => string;
  versionLinesRouteReturned: (facts: {
    base: string;
    left: string;
    back: string;
    own: string;
    since: string | null;
  }) => string;
  versionLinesRouteSame: (base: string) => string;
  /** A line whose work came back as copies — squashed or rebased — so its own
   * versions are still only on it. */
  versionLinesRouteCopied: (facts: {
    base: string;
    left: string;
    back: string;
    own: string;
    squashed: boolean;
    since: string | null;
  }) => string;
  versionLinesOpenVersionLabel: (subject: string) => string;
  versionLinesPublishedPill: string;
  versionLinesUnpublishedPill: string;
  versionLinesRelationshipTitle: string;
  versionLinesRelationshipSyncedDetail: (upstream: string) => string;
  versionLinesRelationshipAheadDetail: (upstream: string) => string;
  versionLinesRelationshipBehindDetail: (upstream: string) => string;
  versionLinesRelationshipDivergedDetail: (upstream: string) => string;
  versionLinesRelationshipGoneDetail: (upstream: string) => string;
  versionLinesRelationshipLocalOnlyDetail: string;
  versionLinesRelationshipActiveTitle: string;
  versionLinesRelationshipActiveDetail: string;
  versionLinesRelationshipUniqueDetail: (main: string) => string;
  versionLinesRelationshipMergedTitle: (main: string) => string;
  versionLinesRelationshipMergedDetail: (main: string) => string;
  versionLinesRelationshipElsewhereTitle: string;
  versionLinesHistoryDescription: string;
  versionLinesHistoryScopedDescription: (name: string) => string;
  versionLinesHistoryAction: string;
  deleteVersionLineTitle: (name: string) => string;
  deleteVersionLineBlockedTitle: (name: string) => string;
  deleteVersionLineBlockedUniqueLead: string;
  deleteVersionLineBlockedUniqueOptionPublish: string;
  deleteVersionLineBlockedUniqueOptionMerge: string;
  deleteVersionLineBlockedUniqueOptionKeep: string;
  deleteVersionLineBlockedElsewhereLead: string;
  deleteVersionLineBlockedActiveLead: string;
  deleteVersionLineBlockedDefaultLead: string;
  deleteVersionLineBlockedOperationLead: string;
  deleteVersionLineBlockedOperationNote: string;
  deleteVersionLineOpenChangesAction: string;
  deleteVersionLineSwitchAction: string;
  deleteVersionLineSafeLead: string;
  /** A line whose work reached the main line only as copies: what is on the
   * main line already, and the recovery point kept for its originals. */
  deleteVersionLineCopiedLead: (base: string, squashed: boolean, shortCommit: string) => string;
  deleteVersionLineCopiedRecovery: string;
  deleteVersionLineRecoveryKept: string;
  deleteVersionLineWarning: string;
  deleteVersionLineConfirm: string;
  deleteVersionLineDeleting: string;
  deleteVersionLineSuccessTitle: string;
  deleteVersionLineDone: string;
  deleteVersionLineRemoteLabel: (upstream: string) => string;
  deleteVersionLineRemoteOnNote: string;
  deleteVersionLineRemoteOffNote: (upstream: string) => string;
  deleteVersionLineRemoteDoneLead: string;
  deleteVersionLineRemoteFailedLead: string;
  renameVersionLineTitle: (name: string) => string;
  renameVersionLineNote: string;
  renameVersionLineUpstreamNote: (upstream: string) => string;
  renameVersionLineConfirm: string;
  /** The line under the name while it is being edited in the Lines detail
   * strip — the short form of the two notes above, which it carries whole on
   * its tooltip. */
  versionLinesRenameInlineNote: string;
  versionLinesRenameInlineUpstreamNote: (upstream: string) => string;
  renameVersionLineRenaming: string;
  versionLinesRenameShort: string;
  versionLinesDeleteShort: string;
  versionLinesContextMenuLabel: (name: string) => string;
  versionLinesCopyName: string;
  versionLinesNameCopied: string;
  versionLinesCopyFailed: string;
  versionLinesRenameLineLabel: (name: string) => string;
  versionLinesDefaultLineChip: string;
  versionLinesDefaultLineNote: string;
}

const en: VersionLinesTranslations = {
  versionLinesTitle: "Lines",
  versionLinesSearchPlaceholder: "Search version lines…",
  versionLinesSearchAriaLabel: "Search version lines",
  versionLinesLoading: "Loading version lines…",
  versionLinesErrorLoading: "GitOdile couldn't load this project's version lines.",
  versionLinesRetry: "Try again",
  versionLinesActiveLabel: "Active",
  versionLinesEmptyOthers: "There are no other version lines in this project yet.",
  versionLinesNoSearchMatches: "No version lines match that search.",
  versionLinesTruncatedNote: (visible, total) => `Showing the ${visible} most recently saved of ${total}.`,
  versionLinesUnreadableNote: (count) =>
    count === 1
      ? "One version line isn't shown: its name uses characters GitOdile can't read exactly. Use Git directly to rename it."
      : `${count} version lines aren't shown: their names use characters GitOdile can't read exactly. Use Git directly to rename them.`,
  versionLinesQuickSwitchChangeLabel: (current) => `Change version line (${current})`,
  versionLinesQuickSwitchTitle: "Switch version line",
  versionLinesQuickSwitchSearchPlaceholder: "Search version lines…",
  versionLinesQuickSwitchSearchEmpty: "No version lines match that search.",
  versionLinesQuickSwitchFavourite: (name) => `Add ${name} to favourites`,
  versionLinesQuickSwitchUnfavourite: (name) => `Remove ${name} from favourites`,
  versionLinesQuickSwitchFavouriteHint: "Add to favourites",
  versionLinesQuickSwitchUnfavouriteHint: "Remove from favourites",
  versionLinesQuickSwitchFavouritesOnly: "Show favourites only",
  versionLinesQuickSwitchFavouritesOnlyOff: "Show all version lines",
  versionLinesQuickSwitchFavouritesEmpty: "No favourites yet. Star a version line to keep it here.",
  versionLinesQuickSwitchEmpty: "There are no other version lines yet.",
  versionLinesQuickSwitchSeeAll: "Manage lines",
  versionLinesQuickSwitchNew: "New line",
  versionLinesQuickSwitchCreateNamed: (name) => `Create “${name}”`,
  versionLinesQuickSwitchCreateHint: "A new line — choose where it starts next",
  versionLinesQuickSwitchActions: (name) => `What “${name}” can do`,
  versionLinesQuickSwitchBack: "Back",
  versionLinesMergeInto: (name) => `Merge into “${name}”`,
  versionLinesRebaseOnto: (name) => `Rebase “${name}” onto this`,
  versionLinesCompareWith: (name) => `Compare with “${name}”`,
  versionLinesSoon: "Soon",
  versionLinesActionsSoon: "Merge, rebase and compare are coming soon.",
  versionLinesDetachedTitle: "This project isn't on a version line right now",
  versionLinesDetachedDescription:
    "You're looking at one specific saved version. Create a named version line here to keep this work easy to find.",
  versionLinesDetachedRecoverButton: "Create a version line here",
  versionLinesUnbornTitle: "Save a version first",
  versionLinesUnbornDescription: "This version line has no saved versions yet, so there's nothing to branch from.",
  versionLinesNoUpstreamLabel: "Local only",
  versionLinesCheckedOutElsewhere: (path) => `Open in another workspace at ${path}. Switch to it from there.`,
  versionLinesUniqueCommits: (count, main) =>
    count === 1 ? `1 version not on ${main}` : `${count} versions not on ${main}`,
  versionLinesSavedLabel: (date) => `Saved ${date}`,
  createVersionLineTitle: "New version line",
  createVersionLineNameLabel: "Name",
  createVersionLineNamePlaceholder: "e.g. feature/new-onboarding",
  createVersionLineSwitchLabel: "Create and switch to it",
  createVersionLineDetachedNote:
    "This project isn't on a version line right now, so GitOdile will switch to the new one to keep this commit easy to find.",
  createVersionLineStartsAt: (shortCommit, subject) =>
    `Starts at the saved version ${shortCommit} — “${subject}”.`,
  createVersionLineConfirm: "Create",
  createVersionLineCreating: "Creating…",
  createVersionLineSuccessTitle: "Version line created",
  createVersionLineDone: "Done",
  versionLinesQuickCreateNameLabel: "New line name",
  versionLinesQuickCreateNamePlaceholder: "What will you work on?",
  versionLinesQuickCreateNameHint: "Like",
  versionLinesQuickCreateNameExample: "feature/new-feature",
  versionLinesQuickCreateSourceLabel: "Create from",
  versionLinesQuickCreateSwitchLabel: "Switch to it",
  versionLinesQuickCreateConfirmLabel: "Create line",
  versionLinesQuickCreateConfirmShort: "Create",
  versionLinesQuickCreateConfirmAndSwitch: "Create and switch",
  versionLinesQuickCreateSuccess: (name, switched) =>
    switched ? `Created “${name}” and switched to it.` : `Created “${name}”.`,
  versionLinesQuickCreateNameExampleFor: (prefix) => `${prefix}/short-name`,
  versionLinesNameIssue: (issue) => {
    switch (issue.kind) {
      case "space":
        return "Names can't contain spaces. Use hyphens instead, like my-line.";
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
        return `A line named “${issue.name}” already exists.`;
      case "case-collision":
        return `“${issue.existing}” already exists. Names that differ only in capitals clash on some systems.`;
    }
  },
  switchVersionLineTitle: (to) => `Switch to “${to}”`,
  switchVersionLineLoading: "Comparing version lines…",
  switchVersionLineChangedFiles: (count) =>
    count === 1 ? "1 file will change." : `${count} files will change.`,
  switchVersionLineChangedFilesTruncated: (visible, total) => `Showing ${visible} of ${total} changed files.`,
  switchVersionLineDirtyDescription:
    "GitOdile can't switch version lines with unsaved work in the way. Save a version, or start a new version line with this work instead.",
  switchVersionLineSaveVersionAction: "Save version",
  switchVersionLineNewLineAction: "New version line with this work",
  switchVersionLineConfirm: "Switch",
  switchVersionLineSwitching: "Switching…",
  switchVersionLineSuccessTitle: "Switched version lines",
  switchVersionLineDone: "Done",
  versionLinesFilterStateGroup: "State",
  versionLinesFilterPrefixGroup: "Name prefix",
  versionLinesFilterClear: "Clear filters",
  versionLinesSortRecent: "Recent",
  versionLinesSortName: "Name",
  versionLinesSortUnpublished: "Local first",
  versionLinesSwitchShort: "Switch",
  versionLinesSwitchToLineLabel: (name) => `Switch to “${name}”`,
  versionLinesSyncUpToDate: "Up to date with the remote",
  versionLinesSyncNoUpstream: "No upstream configured",
  versionLinesSyncGone: "Remote branch deleted",
  versionLinesSyncAhead: (count) => (count === 1 ? "1 not pushed" : `${count} not pushed`),
  versionLinesSyncBehind: (count) => (count === 1 ? "1 not pulled" : `${count} not pulled`),
  versionLinesSyncAheadBehind: (ahead, behind) => `${ahead} not pushed, ${behind} not pulled`,
  versionLinesDeletablePill: "Safe to delete",
  versionLinesNotDeletablePill: "Can't be deleted yet",
  versionLinesGlyphActive: "Active — the line you're working on",
  versionLinesGlyphLocalOnly: "Local only — never published, so it exists only on this computer",
  versionLinesGlyphGone: "Its remote branch was deleted",
  versionLinesGlyphProtected: "Main line — it can't be renamed or deleted",
  versionLinesGlyphDeletable: "Safe to delete — its saved versions are kept somewhere else",
  versionLinesGlyphNotDeletable: "Can't be deleted yet — it has saved versions no other line has",
  versionLinesDeleteCopiedTooltip: (name, base) =>
    `Delete “${name}”: its work is already on ${base} as a copy; GitOdile keeps a recovery point first.`,
  versionLinesDeleteReadyTooltip: (name) =>
    `Delete “${name}” — its saved work is already kept somewhere else.`,
  versionLinesDeleteBlockedTooltip: (name) =>
    `“${name}” has saved work that isn't kept anywhere else yet. Open to see how to free it up.`,
  versionLinesDeleteElsewhereTooltip: (name) =>
    `“${name}” is open in another workspace, so this window can't delete it.`,
  versionLinesListAriaLabel: "Version lines",
  versionLinesDetailAriaLabel: (name) => `Details for “${name}”`,
  versionLinesBackToList: "Back to lines",
  versionLinesFiltersLabel: "Filter and sort",
  versionLinesFiltersActive: (count) =>
    count === 1 ? "Filter and sort (1 filter on)" : `Filter and sort (${count} filters on)`,
  versionLinesFiltersActiveCount: (count) => (count === 1 ? "1 filter on" : `${count} filters on`),
  versionLinesFilterSortGroup: "Sort by",
  versionLinesStateTracking: "Tracking a remote",
  versionLinesLatestSavedLabel: "Latest saved",
  versionLinesVersionsTitle: "Saved versions",
  versionLinesRouteTitle: "Route",
  versionLinesChangesTitle: (base) => `What changes against ${base}`,
  versionLinesChangesBroughtTitle: (base) => `What it brought to ${base}`,
  versionLinesChangesFiles: (count, formatted) => (count === 1 ? "1 file" : `${formatted} files`),
  versionLinesChangesSince: "since it left",
  versionLinesChangesMore: (count, formatted) => (count === 1 ? "and 1 more file" : `and ${formatted} more files`),
  versionLinesChangesBinary: "binary",
  versionLinesCompareShort: "Compare",
  versionLinesVersionsMore: (count, formatted) =>
    count === 1 ? "1 more in History" : `${formatted} more in History`,
  versionLinesRouteLoading: "Reading where this line left main…",
  versionLinesRouteSummary: ({ base, date, own, unpublished, since }) =>
    `Left ${base}${date ? ` on ${date}` : ""}. ${own === "1" ? "1 version" : `${own} versions`} of its own${
      unpublished ? ` (${unpublished} not published yet)` : ""
    }; ${since ? `${base} has saved ${since} since` : `${base} hasn't moved since`}.`,
  versionLinesRouteMerged: (base, since) =>
    `Everything on it is already on ${base}, which has saved ${since} ${since === "1" ? "version" : "versions"} since.`,
  versionLinesRouteSame: (base) => `It stands where ${base} does — no versions of its own yet.`,
  versionLinesRouteCopied: ({ base, left, back, own, squashed, since }) =>
    `Left ${base}${left ? ` on ${left}` : ""}. Its work came back${back ? ` on ${back}` : ""} ${
      squashed ? "squashed into one version" : "as copies, one by one"
    }; the ${own === "1" ? "original version is" : `${own} original versions are`} only on this line. ${
      since ? `${base} has saved ${since} since.` : `${base} hasn't moved since.`
    }`,
  versionLinesRouteReturned: ({ base, left, back, own, since }) =>
    `Left ${base}${left ? ` on ${left}` : ""} and came back${back ? ` on ${back}` : ""} with ${
      own === "1" ? "1 version" : `${own} versions`
    }; ${since ? `${base} has saved ${since} since` : `${base} hasn't moved since`}.`,
  versionLinesOpenVersionLabel: (subject) => `Open “${subject}” in History`,
  versionLinesPublishedPill: "Published",
  versionLinesUnpublishedPill: "Not published yet",
  versionLinesRelationshipTitle: "Relationship",
  versionLinesRelationshipSyncedDetail: (upstream) => `Your local line is in sync with ${upstream}.`,
  versionLinesRelationshipAheadDetail: (upstream) =>
    `These versions are saved here but not on ${upstream} yet. Publish this line to send them.`,
  versionLinesRelationshipBehindDetail: (upstream) =>
    `${upstream} has versions this line doesn't. Get project changes to bring them in.`,
  versionLinesRelationshipDivergedDetail: (upstream) =>
    `This line and ${upstream} have each moved on since they last matched.`,
  versionLinesRelationshipGoneDetail: (upstream) =>
    `${upstream} no longer exists on the remote. Anything saved only here is still on this computer.`,
  versionLinesRelationshipLocalOnlyDetail:
    "This line has never been published, so it only exists on this computer.",
  versionLinesRelationshipActiveTitle: "This is the line you're working on",
  versionLinesRelationshipActiveDetail: "Saving a version adds it to this line.",
  versionLinesRelationshipUniqueDetail: (main) => `Its work isn't on ${main} yet — bring it in when it's ready.`,
  versionLinesRelationshipMergedTitle: (main) => `Already on ${main}`,
  versionLinesRelationshipMergedDetail: (main) => `Everything saved here is also on ${main}.`,
  versionLinesRelationshipElsewhereTitle: "Open in another workspace",
  versionLinesHistoryDescription: "View all versions, compare changes, and restore previous states.",
  versionLinesHistoryScopedDescription: (name) =>
    `Opens History reading “${name}”. Nothing is checked out, so this project stays where it is.`,
  versionLinesHistoryAction: "Open in History",
  deleteVersionLineTitle: (name) => `Delete “${name}”?`,
  deleteVersionLineBlockedTitle: (name) => `“${name}” can't be deleted yet`,
  deleteVersionLineBlockedUniqueLead:
    "This version line has saved work that isn't reachable from any other version line or remote. Deleting it now would be the only copy lost, so GitOdile won't do it.",
  deleteVersionLineBlockedUniqueOptionPublish:
    "Publish this line to a remote, so the work has a home outside this computer.",
  deleteVersionLineBlockedUniqueOptionMerge:
    "Bring its work into another version line, so it stays reachable from there.",
  deleteVersionLineBlockedUniqueOptionKeep: "Or keep the version line as it is — nothing is lost by waiting.",
  deleteVersionLineBlockedElsewhereLead:
    "This version line is checked out in another workspace. Close it there, or switch that workspace to a different version line, then try again.",
  deleteVersionLineBlockedActiveLead:
    "This is the version line you're working on right now. Switch to a different one first, then delete it.",
  deleteVersionLineBlockedDefaultLead:
    "This is the project's main version line — where its shared work lives. GitOdile keeps it as it is.",
  deleteVersionLineBlockedOperationLead:
    "This project is in the middle of an unfinished Git operation — usually a merge, a rebase, or a cherry-pick that stopped on conflicting changes. Until it's finished or undone, GitOdile won't change any version line, including deleting one.",
  deleteVersionLineBlockedOperationNote:
    "GitOdile can show you which files are in conflict, but resolving them isn't supported here yet — finish or abort the operation in your Git tool, then come back.",
  deleteVersionLineOpenChangesAction: "See the files in conflict",
  deleteVersionLineSwitchAction: "Switch to this line",
  deleteVersionLineSafeLead:
    "Only the local name is removed. The saved work itself is already kept elsewhere:",
  deleteVersionLineWarning: "This can't be undone from GitOdile.",
  deleteVersionLineCopiedLead: (base, squashed, shortCommit) =>
    `Its work is already on ${base}, ${squashed ? "squashed into one version" : "copied version by version"} (${shortCommit}). Its original versions exist only on this line.`,
  deleteVersionLineCopiedRecovery:
    "Before deleting it, GitOdile keeps a local recovery point with those original versions — one of the newest 20 for this project.",
  deleteVersionLineRecoveryKept: "Its original versions are kept in a local recovery point.",
  deleteVersionLineConfirm: "Delete",
  deleteVersionLineDeleting: "Deleting…",
  deleteVersionLineSuccessTitle: "Version line deleted",
  deleteVersionLineDone: "Done",
  deleteVersionLineRemoteLabel: (upstream) => `Also delete ${upstream}`,
  deleteVersionLineRemoteOnNote: "This removes it for everyone working on this project.",
  deleteVersionLineRemoteOffNote: (upstream) => `${upstream} stays as it is, and your team keeps seeing it.`,
  deleteVersionLineRemoteDoneLead: "The published copy was deleted too.",
  deleteVersionLineRemoteFailedLead:
    "The version line is gone from this computer, but the published copy is still there.",
  renameVersionLineTitle: (name) => `Rename “${name}”`,
  renameVersionLineNote: "Only the name changes. Every saved version on this line stays exactly where it is.",
  renameVersionLineUpstreamNote: (upstream) =>
    `This line goes on tracking ${upstream}, which keeps its own name. Renaming it there is a separate decision.`,
  renameVersionLineConfirm: "Rename",
  versionLinesRenameInlineNote: "Only the name changes — every saved version stays where it is",
  versionLinesRenameInlineUpstreamNote: (upstream) => `Only the name changes — it still tracks ${upstream}`,
  renameVersionLineRenaming: "Renaming…",
  versionLinesRenameShort: "Rename",
  versionLinesDeleteShort: "Delete",
  versionLinesContextMenuLabel: (name) => `Actions for “${name}”`,
  versionLinesCopyName: "Copy name",
  versionLinesNameCopied: "Name copied",
  versionLinesCopyFailed: "GitOdile couldn't copy the name to the clipboard.",
  versionLinesRenameLineLabel: (name) => `Rename “${name}”`,
  versionLinesDefaultLineChip: "Main line",
  versionLinesDefaultLineNote:
    "This is where the project's shared work lives, so GitOdile doesn't rename or delete it.",
};

const es: VersionLinesTranslations = {
  versionLinesTitle: "Líneas",
  versionLinesSearchPlaceholder: "Buscar líneas de versión…",
  versionLinesSearchAriaLabel: "Buscar líneas de versión",
  versionLinesLoading: "Cargando líneas de versión…",
  versionLinesErrorLoading: "GitOdile no pudo cargar las líneas de versión de este proyecto.",
  versionLinesRetry: "Intentar de nuevo",
  versionLinesActiveLabel: "Activa",
  versionLinesEmptyOthers: "Todavía no hay otras líneas de versión en este proyecto.",
  versionLinesNoSearchMatches: "Ninguna línea de versión coincide con esa búsqueda.",
  versionLinesTruncatedNote: (visible, total) => `Se muestran las ${visible} guardadas más recientemente de ${total}.`,
  versionLinesUnreadableNote: (count) =>
    count === 1
      ? "Hay una línea de versión que no se muestra: su nombre usa caracteres que GitOdile no puede leer con exactitud. Cámbiale el nombre desde Git."
      : `Hay ${count} líneas de versión que no se muestran: sus nombres usan caracteres que GitOdile no puede leer con exactitud. Cámbiales el nombre desde Git.`,
  versionLinesQuickSwitchChangeLabel: (current) => `Cambiar línea de versión (${current})`,
  versionLinesQuickSwitchTitle: "Cambiar línea de versión",
  versionLinesQuickSwitchSearchPlaceholder: "Buscar líneas de versión…",
  versionLinesQuickSwitchSearchEmpty: "Ninguna línea de versión coincide con la búsqueda.",
  versionLinesQuickSwitchFavourite: (name) => `Añadir ${name} a favoritos`,
  versionLinesQuickSwitchUnfavourite: (name) => `Quitar ${name} de favoritos`,
  versionLinesQuickSwitchFavouriteHint: "Añadir a favoritos",
  versionLinesQuickSwitchUnfavouriteHint: "Quitar de favoritos",
  versionLinesQuickSwitchFavouritesOnly: "Mostrar solo favoritos",
  versionLinesQuickSwitchFavouritesOnlyOff: "Mostrar todas las líneas de versión",
  versionLinesQuickSwitchFavouritesEmpty:
    "Todavía no hay favoritos. Marca una línea de versión para guardarla aquí.",
  versionLinesQuickSwitchEmpty: "Todavía no hay otras líneas de versión.",
  versionLinesQuickSwitchSeeAll: "Gestionar líneas",
  versionLinesQuickSwitchNew: "Nueva línea",
  versionLinesQuickSwitchCreateNamed: (name) => `Crear «${name}»`,
  versionLinesQuickSwitchCreateHint: "Una línea nueva: a continuación eliges desde dónde empieza",
  versionLinesQuickSwitchActions: (name) => `Qué se puede hacer con «${name}»`,
  versionLinesQuickSwitchBack: "Volver",
  versionLinesMergeInto: (name) => `Fusionar con «${name}»`,
  versionLinesRebaseOnto: (name) => `Rebasar «${name}» sobre esta`,
  versionLinesCompareWith: (name) => `Comparar con «${name}»`,
  versionLinesSoon: "Pronto",
  versionLinesActionsSoon: "Fusionar, rebasar y comparar llegarán pronto.",
  versionLinesDetachedTitle: "Este proyecto no está en una línea de versión ahora mismo",
  versionLinesDetachedDescription:
    "Estás viendo una versión guardada concreta. Crea aquí una línea de versión con nombre para que este trabajo sea fácil de encontrar.",
  versionLinesDetachedRecoverButton: "Crear una línea de versión aquí",
  versionLinesUnbornTitle: "Guarda una versión primero",
  versionLinesUnbornDescription: "Esta línea de versión todavía no tiene versiones guardadas, así que no hay nada de qué partir.",
  versionLinesNoUpstreamLabel: "Solo local",
  versionLinesCheckedOutElsewhere: (path) => `Abierta en otro espacio de trabajo en ${path}. Cámbiate a ella desde ahí.`,
  versionLinesUniqueCommits: (count, main) =>
    count === 1 ? `1 versión fuera de ${main}` : `${count} versiones fuera de ${main}`,
  versionLinesSavedLabel: (date) => `Guardada el ${date}`,
  createVersionLineTitle: "Nueva línea de versión",
  createVersionLineNameLabel: "Nombre",
  createVersionLineNamePlaceholder: "p. ej. feature/nueva-bienvenida",
  createVersionLineSwitchLabel: "Crear y cambiar a ella",
  createVersionLineDetachedNote:
    "Este proyecto no está en una línea de versión ahora mismo, así que GitOdile cambiará a la nueva para que este commit sea fácil de encontrar.",
  createVersionLineStartsAt: (shortCommit, subject) =>
    `Empieza en la versión guardada ${shortCommit}: «${subject}».`,
  createVersionLineConfirm: "Crear",
  createVersionLineCreating: "Creando…",
  createVersionLineSuccessTitle: "Línea de versión creada",
  createVersionLineDone: "Listo",
  versionLinesQuickCreateNameLabel: "Nombre de la nueva línea",
  versionLinesQuickCreateNamePlaceholder: "¿En qué vas a trabajar?",
  versionLinesQuickCreateNameHint: "Como",
  versionLinesQuickCreateNameExample: "feature/nueva-funcionalidad",
  versionLinesQuickCreateSourceLabel: "Crear desde",
  versionLinesQuickCreateSwitchLabel: "Cambiar a ella",
  versionLinesQuickCreateConfirmLabel: "Crear línea",
  versionLinesQuickCreateConfirmShort: "Crear",
  versionLinesQuickCreateConfirmAndSwitch: "Crear y cambiar",
  versionLinesQuickCreateSuccess: (name, switched) =>
    switched ? `Se creó «${name}» y se cambió a ella.` : `Se creó «${name}».`,
  versionLinesQuickCreateNameExampleFor: (prefix) => `${prefix}/nombre-corto`,
  versionLinesNameIssue: (issue) => {
    switch (issue.kind) {
      case "space":
        return "Los nombres no pueden llevar espacios. Usa guiones, como mi-linea.";
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
        return `Ya existe una línea llamada «${issue.name}».`;
      case "case-collision":
        return `Ya existe «${issue.existing}». Los nombres que solo cambian en mayúsculas chocan en algunos sistemas.`;
    }
  },
  switchVersionLineTitle: (to) => `Cambiar a «${to}»`,
  switchVersionLineLoading: "Comparando líneas de versión…",
  switchVersionLineChangedFiles: (count) =>
    count === 1 ? "1 archivo cambiará." : `${count} archivos cambiarán.`,
  switchVersionLineChangedFilesTruncated: (visible, total) => `Se muestran ${visible} de ${total} archivos cambiados.`,
  switchVersionLineDirtyDescription:
    "GitOdile no puede cambiar de línea de versión con trabajo sin guardar de por medio. Guarda una versión, o inicia una nueva línea de versión con este trabajo.",
  switchVersionLineSaveVersionAction: "Guardar versión",
  switchVersionLineNewLineAction: "Nueva línea de versión con este trabajo",
  switchVersionLineConfirm: "Cambiar",
  switchVersionLineSwitching: "Cambiando…",
  switchVersionLineSuccessTitle: "Línea de versión cambiada",
  switchVersionLineDone: "Listo",
  versionLinesFilterStateGroup: "Estado",
  versionLinesFilterPrefixGroup: "Prefijo del nombre",
  versionLinesFilterClear: "Quitar filtros",
  versionLinesSortRecent: "Recientes",
  versionLinesSortName: "Nombre",
  versionLinesSortUnpublished: "Locales antes",
  versionLinesSwitchShort: "Cambiar",
  versionLinesSwitchToLineLabel: (name) => `Cambiar a «${name}»`,
  versionLinesSyncUpToDate: "Al día con el remoto",
  versionLinesSyncNoUpstream: "Sin remoto configurado",
  versionLinesSyncGone: "Rama remota eliminada",
  versionLinesSyncAhead: (count) => (count === 1 ? "1 sin subir" : `${count} sin subir`),
  versionLinesSyncBehind: (count) => (count === 1 ? "1 sin bajar" : `${count} sin bajar`),
  versionLinesSyncAheadBehind: (ahead, behind) => `${ahead} sin subir, ${behind} sin bajar`,
  versionLinesDeletablePill: "Se puede eliminar",
  versionLinesNotDeletablePill: "Todavía no se puede eliminar",
  versionLinesGlyphActive: "Activa: la línea en la que estás trabajando",
  versionLinesGlyphLocalOnly: "Solo local: nunca se ha publicado, así que solo existe en este ordenador",
  versionLinesGlyphGone: "Su rama en el remoto se eliminó",
  versionLinesGlyphProtected: "Línea principal: no se puede renombrar ni eliminar",
  versionLinesGlyphDeletable: "Se puede eliminar: sus versiones guardadas ya están en otro sitio",
  versionLinesGlyphNotDeletable: "Todavía no se puede eliminar: tiene versiones guardadas que no están en ninguna otra línea",
  versionLinesDeleteCopiedTooltip: (name, base) =>
    `Eliminar «${name}»: su trabajo ya está en ${base} como copia; GitOdile guarda antes un punto de recuperación.`,
  versionLinesDeleteReadyTooltip: (name) =>
    `Eliminar «${name}»: su trabajo guardado ya se conserva en otro sitio.`,
  versionLinesDeleteBlockedTooltip: (name) =>
    `«${name}» tiene trabajo guardado que no se conserva en ningún otro sitio. Ábrelo para ver cómo desbloquearlo.`,
  versionLinesDeleteElsewhereTooltip: (name) =>
    `«${name}» está abierta en otro espacio de trabajo, así que esta ventana no puede eliminarla.`,
  versionLinesListAriaLabel: "Líneas de versión",
  versionLinesDetailAriaLabel: (name) => `Detalles de «${name}»`,
  versionLinesBackToList: "Volver a las líneas",
  versionLinesFiltersLabel: "Filtrar y ordenar",
  versionLinesFiltersActive: (count) =>
    count === 1 ? "Filtrar y ordenar (1 filtro activo)" : `Filtrar y ordenar (${count} filtros activos)`,
  versionLinesFiltersActiveCount: (count) =>
    count === 1 ? "1 filtro activo" : `${count} filtros activos`,
  versionLinesFilterSortGroup: "Ordenar por",
  versionLinesStateTracking: "Sigue a un remoto",
  versionLinesLatestSavedLabel: "Última guardada",
  versionLinesVersionsTitle: "Versiones guardadas",
  versionLinesRouteTitle: "Recorrido",
  versionLinesChangesTitle: (base) => `Qué cambia respecto a ${base}`,
  versionLinesChangesBroughtTitle: (base) => `Lo que trajo a ${base}`,
  versionLinesChangesFiles: (count, formatted) => (count === 1 ? "1 archivo" : `${formatted} archivos`),
  versionLinesChangesSince: "desde la salida",
  versionLinesChangesMore: (count, formatted) =>
    count === 1 ? "y 1 archivo más" : `y ${formatted} archivos más`,
  versionLinesChangesBinary: "binario",
  versionLinesCompareShort: "Comparar",
  versionLinesVersionsMore: (count, formatted) =>
    count === 1 ? "1 más en Historial" : `${formatted} más en Historial`,
  versionLinesRouteLoading: "Leyendo por dónde salió esta línea de main…",
  versionLinesRouteSummary: ({ base, date, own, unpublished, since }) =>
    `Se separó de ${base}${date ? ` el ${date}` : ""}. ${own === "1" ? "1 versión propia" : `${own} versiones propias`}${
      unpublished ? ` (${unpublished} sin publicar)` : ""
    }; ${since ? `${base} ha guardado ${since} desde entonces` : `${base} no se ha movido desde entonces`}.`,
  versionLinesRouteMerged: (base, since) =>
    `Todo su trabajo ya está en ${base}, que ha guardado ${since} ${since === "1" ? "versión" : "versiones"} más desde entonces.`,
  versionLinesRouteSame: (base) => `Está en el mismo punto que ${base}: aún no tiene versiones propias.`,
  versionLinesRouteCopied: ({ base, left, back, own, squashed, since }) =>
    `Salió de ${base}${left ? ` el ${left}` : ""}. Su trabajo volvió${back ? ` el ${back}` : ""} ${
      squashed ? "unido en una sola versión" : "copiado versión a versión"
    }; ${own === "1" ? "la versión original solo está" : `las ${own} versiones originales solo están`} en esta línea. ${
      since ? `${base} ha guardado ${since} desde entonces.` : `${base} no se ha movido desde entonces.`
    }`,
  versionLinesRouteReturned: ({ base, left, back, own, since }) =>
    `Salió de ${base}${left ? ` el ${left}` : ""} y volvió${back ? ` el ${back}` : ""} con ${
      own === "1" ? "1 versión" : `${own} versiones`
    }; ${since ? `${base} ha guardado ${since} desde entonces` : `${base} no se ha movido desde entonces`}.`,
  versionLinesOpenVersionLabel: (subject) => `Abrir «${subject}» en Historial`,
  versionLinesPublishedPill: "Publicada",
  versionLinesUnpublishedPill: "Todavía sin publicar",
  versionLinesRelationshipTitle: "Relación",
  versionLinesRelationshipSyncedDetail: (upstream) => `Tu línea local está al día con ${upstream}.`,
  versionLinesRelationshipAheadDetail: (upstream) =>
    `Estas versiones están guardadas aquí pero todavía no en ${upstream}. Publica esta línea para enviarlas.`,
  versionLinesRelationshipBehindDetail: (upstream) =>
    `${upstream} tiene versiones que esta línea no tiene. Trae los cambios del proyecto para incorporarlas.`,
  versionLinesRelationshipDivergedDetail: (upstream) =>
    `Esta línea y ${upstream} han avanzado cada una por su lado desde la última vez que coincidieron.`,
  versionLinesRelationshipGoneDetail: (upstream) =>
    `${upstream} ya no existe en el remoto. Lo que esté guardado solo aquí sigue en este ordenador.`,
  versionLinesRelationshipLocalOnlyDetail:
    "Esta línea nunca se ha publicado, así que solo existe en este ordenador.",
  versionLinesRelationshipActiveTitle: "Es la línea en la que estás trabajando",
  versionLinesRelationshipActiveDetail: "Guardar una versión la añade a esta línea.",
  versionLinesRelationshipUniqueDetail: (main) => `Su trabajo aún no está en ${main}: llévalo cuando esté listo.`,
  versionLinesRelationshipMergedTitle: (main) => `Ya está en ${main}`,
  versionLinesRelationshipMergedDetail: (main) => `Todo lo guardado aquí también está en ${main}.`,
  versionLinesRelationshipElsewhereTitle: "Abierta en otro espacio de trabajo",
  versionLinesHistoryDescription:
    "Ve todas las versiones, compara cambios y restaura estados anteriores.",
  versionLinesHistoryScopedDescription: (name) =>
    `Abre el historial leyendo «${name}». No se cambia de línea: el proyecto se queda donde está.`,
  versionLinesHistoryAction: "Abrir en Historial",
  deleteVersionLineTitle: (name) => `¿Eliminar «${name}»?`,
  deleteVersionLineBlockedTitle: (name) => `«${name}» todavía no se puede eliminar`,
  deleteVersionLineBlockedUniqueLead:
    "Esta línea de versión tiene trabajo guardado que no es accesible desde ninguna otra línea ni desde ningún remoto. Eliminarla ahora perdería la única copia, así que GitOdile no lo hará.",
  deleteVersionLineBlockedUniqueOptionPublish:
    "Publica esta línea en un remoto, para que el trabajo tenga un sitio fuera de este ordenador.",
  deleteVersionLineBlockedUniqueOptionMerge:
    "Lleva su trabajo a otra línea de versión, para que siga siendo accesible desde ahí.",
  deleteVersionLineBlockedUniqueOptionKeep:
    "O deja la línea de versión como está: no se pierde nada por esperar.",
  deleteVersionLineBlockedElsewhereLead:
    "Esta línea de versión está abierta en otro espacio de trabajo. Ciérralo, o cámbialo a otra línea de versión, y vuelve a intentarlo.",
  deleteVersionLineBlockedActiveLead:
    "Es la línea de versión en la que estás trabajando ahora mismo. Cambia primero a otra distinta y después elimínala.",
  deleteVersionLineBlockedDefaultLead:
    "Es la línea de versión principal del proyecto, donde vive su trabajo compartido. GitOdile la deja como está.",
  deleteVersionLineBlockedOperationLead:
    "Este proyecto está en medio de una operación de Git sin terminar: normalmente una fusión, un rebase o un cherry-pick que se paró por cambios en conflicto. Hasta que se termine o se deshaga, GitOdile no tocará ninguna línea de versión, tampoco para eliminarla.",
  deleteVersionLineBlockedOperationNote:
    "GitOdile puede enseñarte qué archivos están en conflicto, pero resolverlos todavía no se puede hacer aquí: termina o cancela la operación en tu herramienta de Git y vuelve.",
  deleteVersionLineOpenChangesAction: "Ver los archivos en conflicto",
  deleteVersionLineSwitchAction: "Cambiar a esta línea",
  deleteVersionLineSafeLead:
    "Solo se elimina el nombre local. El trabajo guardado ya se conserva en otro sitio:",
  deleteVersionLineWarning: "Esto no se puede deshacer desde GitOdile.",
  deleteVersionLineCopiedLead: (base, squashed, shortCommit) =>
    `Su trabajo ya está en ${base}, ${squashed ? "unido en una sola versión" : "copiado versión a versión"} (${shortCommit}). Sus versiones originales solo existen en esta línea.`,
  deleteVersionLineCopiedRecovery:
    "Antes de eliminarla, GitOdile guarda un punto de recuperación local con esas versiones originales — uno de los 20 más recientes de este proyecto.",
  deleteVersionLineRecoveryKept: "Sus versiones originales quedan guardadas en un punto de recuperación local.",
  deleteVersionLineConfirm: "Eliminar",
  deleteVersionLineDeleting: "Eliminando…",
  deleteVersionLineSuccessTitle: "Línea de versión eliminada",
  deleteVersionLineDone: "Listo",
  deleteVersionLineRemoteLabel: (upstream) => `Eliminar también ${upstream}`,
  deleteVersionLineRemoteOnNote: "Esto la quita para todo el mundo que trabaja en este proyecto.",
  deleteVersionLineRemoteOffNote: (upstream) =>
    `${upstream} se queda como está, y tu equipo la sigue viendo.`,
  deleteVersionLineRemoteDoneLead: "La copia publicada también se eliminó.",
  deleteVersionLineRemoteFailedLead:
    "La línea de versión ya no está en este ordenador, pero la copia publicada sigue ahí.",
  renameVersionLineTitle: (name) => `Renombrar «${name}»`,
  renameVersionLineNote:
    "Solo cambia el nombre. Todas las versiones guardadas de esta línea se quedan exactamente donde están.",
  renameVersionLineUpstreamNote: (upstream) =>
    `Esta línea sigue apuntando a ${upstream}, que conserva su nombre. Renombrarla ahí es otra decisión.`,
  renameVersionLineConfirm: "Renombrar",
  versionLinesRenameInlineNote: "Solo cambia el nombre: cada versión guardada se queda donde está",
  versionLinesRenameInlineUpstreamNote: (upstream) => `Solo cambia el nombre: sigue apuntando a ${upstream}`,
  renameVersionLineRenaming: "Renombrando…",
  versionLinesRenameShort: "Renombrar",
  versionLinesDeleteShort: "Eliminar",
  versionLinesContextMenuLabel: (name) => `Acciones para «${name}»`,
  versionLinesCopyName: "Copiar el nombre",
  versionLinesNameCopied: "Nombre copiado",
  versionLinesCopyFailed: "GitOdile no pudo copiar el nombre al portapapeles.",
  versionLinesRenameLineLabel: (name) => `Renombrar «${name}»`,
  versionLinesDefaultLineChip: "Línea principal",
  versionLinesDefaultLineNote:
    "Es donde vive el trabajo compartido del proyecto, así que GitOdile no la renombra ni la elimina.",
};

export const versionLinesTranslations = { en, es } as const;
