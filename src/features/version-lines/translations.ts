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
  versionLinesErrorLoading: "Couldn't load this project's version lines.",
  versionLinesRetry: "Try again",
  versionLinesActiveLabel: "Active",
  versionLinesEmptyOthers: "No other version lines yet.",
  versionLinesNoSearchMatches: "No version lines match that search.",
  versionLinesTruncatedNote: (visible, total) => `Showing the ${visible} most recent of ${total}.`,
  versionLinesUnreadableNote: (count) =>
    count === 1
      ? "1 version line is hidden because its name can't be read. Rename it with Git."
      : `${count} version lines are hidden because their names can't be read. Rename them with Git.`,
  versionLinesQuickSwitchChangeLabel: (current) => `Change version line (${current})`,
  versionLinesQuickSwitchTitle: "Switch version line",
  versionLinesQuickSwitchSearchPlaceholder: "Search version lines…",
  versionLinesQuickSwitchSearchEmpty: "No version lines match that search.",
  versionLinesQuickSwitchFavourite: (name) => `Add ${name} to favorites`,
  versionLinesQuickSwitchUnfavourite: (name) => `Remove ${name} from favorites`,
  versionLinesQuickSwitchFavouriteHint: "Add to favorites",
  versionLinesQuickSwitchUnfavouriteHint: "Remove from favorites",
  versionLinesQuickSwitchFavouritesOnly: "Show favorites only",
  versionLinesQuickSwitchFavouritesOnlyOff: "Show all version lines",
  versionLinesQuickSwitchFavouritesEmpty: "No favorites yet. Star a version line to keep it here.",
  versionLinesQuickSwitchEmpty: "No other version lines yet.",
  versionLinesQuickSwitchSeeAll: "Manage lines",
  versionLinesQuickSwitchNew: "New line",
  versionLinesQuickSwitchCreateNamed: (name) => `Create “${name}”`,
  versionLinesQuickSwitchCreateHint: "New line — choose where it starts next",
  versionLinesQuickSwitchActions: (name) => `What “${name}” can do`,
  versionLinesQuickSwitchBack: "Back",
  versionLinesMergeInto: (name) => `Merge into “${name}”`,
  versionLinesRebaseOnto: (name) => `Rebase “${name}” onto this`,
  versionLinesCompareWith: (name) => `Compare with “${name}”`,
  versionLinesSoon: "Soon",
  versionLinesActionsSoon: "Merge, rebase and compare are coming soon.",
  versionLinesDetachedTitle: "Not on a version line",
  versionLinesDetachedDescription: "You're on a specific saved version. Create a line here so this work is easy to find.",
  versionLinesDetachedRecoverButton: "Create a line here",
  versionLinesUnbornTitle: "Save a version first",
  versionLinesUnbornDescription: "This line has no saved versions yet, so there's nothing to start from.",
  versionLinesNoUpstreamLabel: "Local only",
  versionLinesCheckedOutElsewhere: (path) => `Open in another workspace (${path}). Switch to it from there.`,
  versionLinesUniqueCommits: (count, main) =>
    count === 1 ? `1 version not on ${main}` : `${count} versions not on ${main}`,
  versionLinesSavedLabel: (date) => `Saved ${date}`,
  createVersionLineTitle: "New version line",
  createVersionLineNameLabel: "Name",
  createVersionLineNamePlaceholder: "e.g. feature/new-onboarding",
  createVersionLineSwitchLabel: "Switch to it",
  createVersionLineDetachedNote: "You're not on a version line, so GitOdile will switch to the new one to keep this work easy to find.",
  createVersionLineStartsAt: (shortCommit, subject) => `Starts at ${shortCommit} — “${subject}”.`,
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
        return "No spaces. Use hyphens instead, like my-line.";
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
  switchVersionLineDirtyDescription: "You have unsaved changes. Save a version, or take them to a new line.",
  switchVersionLineSaveVersionAction: "Save version",
  switchVersionLineNewLineAction: "New line with these changes",
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
  versionLinesSyncNoUpstream: "Not tracking a remote",
  versionLinesSyncGone: "Remote branch deleted",
  versionLinesSyncAhead: (count) => (count === 1 ? "1 not published" : `${count} not published`),
  versionLinesSyncBehind: (count) => (count === 1 ? "1 to get" : `${count} to get`),
  versionLinesSyncAheadBehind: (ahead, behind) => `${ahead} not published, ${behind} to get`,
  versionLinesDeletablePill: "Safe to delete",
  versionLinesNotDeletablePill: "Can't be deleted yet",
  versionLinesGlyphActive: "Active — the line you're working on",
  versionLinesGlyphLocalOnly: "Local only — never published, so it's only on this computer",
  versionLinesGlyphGone: "Its remote branch was deleted",
  versionLinesGlyphProtected: "Main line — it can't be renamed or deleted",
  versionLinesGlyphDeletable: "Safe to delete — its saved versions are kept elsewhere",
  versionLinesGlyphNotDeletable: "Can't be deleted yet — it has versions no other line has",
  versionLinesDeleteCopiedTooltip: (name, base) =>
    `Delete “${name}”. Its work is already on ${base}; GitOdile keeps a recovery point first.`,
  versionLinesDeleteReadyTooltip: (name) => `Delete “${name}”. Its work is already kept elsewhere.`,
  versionLinesDeleteBlockedTooltip: (name) =>
    `“${name}” has work that exists nowhere else. Open it to see your options.`,
  versionLinesDeleteElsewhereTooltip: (name) =>
    `“${name}” is open in another workspace, so it can't be deleted here.`,
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
  versionLinesChangesTitle: (base) => `Changes compared to ${base}`,
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
    }. ${since ? `${base} has ${since} new ${since === "1" ? "version" : "versions"} since.` : `${base} hasn't moved since.`}`,
  versionLinesRouteMerged: (base, since) =>
    `All its work is on ${base}, which has ${since} new ${since === "1" ? "version" : "versions"} since.`,
  versionLinesRouteSame: (base) => `Same point as ${base}. No versions of its own yet.`,
  versionLinesRouteCopied: ({ base, left, back, own, squashed, since }) =>
    `Left ${base}${left ? ` on ${left}` : ""}. Its work came back${back ? ` on ${back}` : ""} ${
      squashed ? "as one combined version" : "as copies"
    }; the ${own === "1" ? "original is" : `${own} originals are`} only on this line. ${
      since ? `${base} has ${since} new ${since === "1" ? "version" : "versions"} since.` : `${base} hasn't moved since.`
    }`,
  versionLinesRouteReturned: ({ base, left, back, own, since }) =>
    `Left ${base}${left ? ` on ${left}` : ""} and came back${back ? ` on ${back}` : ""} with ${
      own === "1" ? "1 version" : `${own} versions`
    }. ${since ? `${base} has ${since} new ${since === "1" ? "version" : "versions"} since.` : `${base} hasn't moved since.`}`,
  versionLinesOpenVersionLabel: (subject) => `Open “${subject}” in History`,
  versionLinesPublishedPill: "Published",
  versionLinesUnpublishedPill: "Not published yet",
  versionLinesRelationshipTitle: "Relationship",
  versionLinesRelationshipSyncedDetail: (upstream) => `In sync with ${upstream}.`,
  versionLinesRelationshipAheadDetail: (upstream) => `Some versions aren't on ${upstream} yet. Publish to send them.`,
  versionLinesRelationshipBehindDetail: (upstream) => `${upstream} has newer versions. Get project changes to bring them in.`,
  versionLinesRelationshipDivergedDetail: (upstream) => `This line and ${upstream} have both moved on.`,
  versionLinesRelationshipGoneDetail: (upstream) => `${upstream} no longer exists on the remote. Your work here is still safe.`,
  versionLinesRelationshipLocalOnlyDetail: "Never published, so it's only on this computer.",
  versionLinesRelationshipActiveTitle: "The line you're working on",
  versionLinesRelationshipActiveDetail: "New versions you save go here.",
  versionLinesRelationshipUniqueDetail: (main) => `Its work isn't on ${main} yet.`,
  versionLinesRelationshipMergedTitle: (main) => `Already on ${main}`,
  versionLinesRelationshipMergedDetail: (main) => `Everything saved here is also on ${main}.`,
  versionLinesRelationshipElsewhereTitle: "Open in another workspace",
  versionLinesHistoryDescription: "See every version, compare changes and go back to earlier states.",
  versionLinesHistoryScopedDescription: (name) => `Shows “${name}” in History without switching to it.`,
  versionLinesHistoryAction: "Open in History",
  deleteVersionLineTitle: (name) => `Delete “${name}”?`,
  deleteVersionLineBlockedTitle: (name) => `“${name}” can't be deleted yet`,
  deleteVersionLineBlockedUniqueLead:
    "This line has saved work that exists nowhere else. Deleting it would lose that work, so GitOdile won't. You can:",
  deleteVersionLineBlockedUniqueOptionPublish: "Publish it, so the work is also on the remote.",
  deleteVersionLineBlockedUniqueOptionMerge: "Bring its work into another line.",
  deleteVersionLineBlockedUniqueOptionKeep: "Or keep it — nothing is lost by waiting.",
  deleteVersionLineBlockedElsewhereLead:
    "This line is open in another workspace. Close it there or switch that workspace to another line, then retry.",
  deleteVersionLineBlockedActiveLead: "This is the line you're working on. Switch to another one first.",
  deleteVersionLineBlockedDefaultLead: "This is the project's main line, where shared work lives. GitOdile keeps it.",
  deleteVersionLineBlockedOperationLead:
    "A Git operation is unfinished here — usually a merge, rebase or cherry-pick stopped by a conflict. GitOdile won't change any line until it's finished or undone.",
  deleteVersionLineBlockedOperationNote:
    "Resolving conflicts isn't supported here yet. Finish or abort the operation in your Git tool, then come back.",
  deleteVersionLineOpenChangesAction: "See the files in conflict",
  deleteVersionLineSwitchAction: "Switch to this line",
  deleteVersionLineSafeLead: "Only the name is removed. Its work is already kept in:",
  deleteVersionLineWarning: "This can't be undone from GitOdile.",
  deleteVersionLineCopiedLead: (base, squashed, shortCommit) =>
    `Its work is already on ${base}, ${squashed ? "as one combined version" : "copied version by version"} (${shortCommit}). The originals are only on this line.`,
  deleteVersionLineCopiedRecovery:
    "GitOdile first saves those originals in a local recovery point (it keeps the 20 most recent).",
  deleteVersionLineRecoveryKept: "Its original versions are kept in a local recovery point.",
  deleteVersionLineConfirm: "Delete",
  deleteVersionLineDeleting: "Deleting…",
  deleteVersionLineSuccessTitle: "Version line deleted",
  deleteVersionLineDone: "Done",
  deleteVersionLineRemoteLabel: (upstream) => `Also delete ${upstream}`,
  deleteVersionLineRemoteOnNote: "It will be removed for everyone on this project.",
  deleteVersionLineRemoteOffNote: (upstream) => `${upstream} stays, and your team still sees it.`,
  deleteVersionLineRemoteDoneLead: "The published copy was deleted too.",
  deleteVersionLineRemoteFailedLead: "The line is gone from this computer, but the published copy is still there.",
  renameVersionLineTitle: (name) => `Rename “${name}”`,
  renameVersionLineNote: "Only the name changes. Every saved version stays where it is.",
  renameVersionLineUpstreamNote: (upstream) =>
    `It keeps tracking ${upstream}, which keeps its own name. Renaming that is a separate step.`,
  renameVersionLineConfirm: "Rename",
  versionLinesRenameInlineNote: "Only the name changes",
  versionLinesRenameInlineUpstreamNote: (upstream) => `Only the name changes — it still tracks ${upstream}`,
  renameVersionLineRenaming: "Renaming…",
  versionLinesRenameShort: "Rename",
  versionLinesDeleteShort: "Delete",
  versionLinesContextMenuLabel: (name) => `Actions for “${name}”`,
  versionLinesCopyName: "Copy name",
  versionLinesNameCopied: "Name copied",
  versionLinesCopyFailed: "Couldn't copy the name.",
  versionLinesRenameLineLabel: (name) => `Rename “${name}”`,
  versionLinesDefaultLineChip: "Main line",
  versionLinesDefaultLineNote: "Shared work lives here, so GitOdile doesn't rename or delete it.",
};

const es: VersionLinesTranslations = {
  versionLinesTitle: "Líneas",
  versionLinesSearchPlaceholder: "Buscar líneas de versión…",
  versionLinesSearchAriaLabel: "Buscar líneas de versión",
  versionLinesLoading: "Cargando líneas de versión…",
  versionLinesErrorLoading: "No se pudieron cargar las líneas de versión de este proyecto.",
  versionLinesRetry: "Reintentar",
  versionLinesActiveLabel: "Activa",
  versionLinesEmptyOthers: "Aún no hay otras líneas de versión.",
  versionLinesNoSearchMatches: "Ninguna línea de versión coincide con la búsqueda.",
  versionLinesTruncatedNote: (visible, total) => `Se muestran las ${visible} más recientes de ${total}.`,
  versionLinesUnreadableNote: (count) =>
    count === 1
      ? "1 línea de versión está oculta porque su nombre no se puede leer. Renómbrala con Git."
      : `${count} líneas de versión están ocultas porque sus nombres no se pueden leer. Renómbralas con Git.`,
  versionLinesQuickSwitchChangeLabel: (current) => `Cambiar de línea de versión (${current})`,
  versionLinesQuickSwitchTitle: "Cambiar de línea de versión",
  versionLinesQuickSwitchSearchPlaceholder: "Buscar líneas de versión…",
  versionLinesQuickSwitchSearchEmpty: "Ninguna línea de versión coincide con la búsqueda.",
  versionLinesQuickSwitchFavourite: (name) => `Añadir ${name} a favoritos`,
  versionLinesQuickSwitchUnfavourite: (name) => `Quitar ${name} de favoritos`,
  versionLinesQuickSwitchFavouriteHint: "Añadir a favoritos",
  versionLinesQuickSwitchUnfavouriteHint: "Quitar de favoritos",
  versionLinesQuickSwitchFavouritesOnly: "Ver solo favoritos",
  versionLinesQuickSwitchFavouritesOnlyOff: "Ver todas las líneas de versión",
  versionLinesQuickSwitchFavouritesEmpty: "Aún no hay favoritos. Marca una línea con la estrella para tenerla aquí.",
  versionLinesQuickSwitchEmpty: "Aún no hay otras líneas de versión.",
  versionLinesQuickSwitchSeeAll: "Gestionar líneas",
  versionLinesQuickSwitchNew: "Nueva línea",
  versionLinesQuickSwitchCreateNamed: (name) => `Crear «${name}»`,
  versionLinesQuickSwitchCreateHint: "Línea nueva: después eliges desde dónde empieza",
  versionLinesQuickSwitchActions: (name) => `Qué se puede hacer con «${name}»`,
  versionLinesQuickSwitchBack: "Volver",
  versionLinesMergeInto: (name) => `Fusionar con «${name}»`,
  versionLinesRebaseOnto: (name) => `Rebasar «${name}» sobre esta`,
  versionLinesCompareWith: (name) => `Comparar con «${name}»`,
  versionLinesSoon: "Pronto",
  versionLinesActionsSoon: "Fusionar, rebasar y comparar llegarán pronto.",
  versionLinesDetachedTitle: "No estás en una línea de versión",
  versionLinesDetachedDescription: "Estás en una versión guardada concreta. Crea aquí una línea para que este trabajo sea fácil de encontrar.",
  versionLinesDetachedRecoverButton: "Crear una línea aquí",
  versionLinesUnbornTitle: "Guarda una versión primero",
  versionLinesUnbornDescription: "Esta línea aún no tiene versiones guardadas, así que no hay desde dónde partir.",
  versionLinesNoUpstreamLabel: "Solo local",
  versionLinesCheckedOutElsewhere: (path) => `Abierta en otro espacio de trabajo (${path}). Cambia a ella desde ahí.`,
  versionLinesUniqueCommits: (count, main) =>
    count === 1 ? `1 versión que no está en ${main}` : `${count} versiones que no están en ${main}`,
  versionLinesSavedLabel: (date) => `Guardada el ${date}`,
  createVersionLineTitle: "Nueva línea de versión",
  createVersionLineNameLabel: "Nombre",
  createVersionLineNamePlaceholder: "p. ej. feature/nueva-bienvenida",
  createVersionLineSwitchLabel: "Cambiar a ella",
  createVersionLineDetachedNote: "No estás en una línea de versión, así que GitOdile cambiará a la nueva para que este trabajo sea fácil de encontrar.",
  createVersionLineStartsAt: (shortCommit, subject) => `Empieza en ${shortCommit}: «${subject}».`,
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
        return "Sin espacios. Usa guiones, como mi-linea.";
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
    count === 1 ? "Cambiará 1 archivo." : `Cambiarán ${count} archivos.`,
  switchVersionLineChangedFilesTruncated: (visible, total) => `Se muestran ${visible} de ${total} archivos cambiados.`,
  switchVersionLineDirtyDescription: "Tienes cambios sin guardar. Guarda una versión o llévalos a una línea nueva.",
  switchVersionLineSaveVersionAction: "Guardar versión",
  switchVersionLineNewLineAction: "Línea nueva con estos cambios",
  switchVersionLineConfirm: "Cambiar",
  switchVersionLineSwitching: "Cambiando…",
  switchVersionLineSuccessTitle: "Línea de versión cambiada",
  switchVersionLineDone: "Listo",
  versionLinesFilterStateGroup: "Estado",
  versionLinesFilterPrefixGroup: "Prefijo del nombre",
  versionLinesFilterClear: "Quitar filtros",
  versionLinesSortRecent: "Recientes",
  versionLinesSortName: "Nombre",
  versionLinesSortUnpublished: "Locales primero",
  versionLinesSwitchShort: "Cambiar",
  versionLinesSwitchToLineLabel: (name) => `Cambiar a «${name}»`,
  versionLinesSyncUpToDate: "Al día con el remoto",
  versionLinesSyncNoUpstream: "No sigue ningún remoto",
  versionLinesSyncGone: "Rama remota eliminada",
  versionLinesSyncAhead: (count) => (count === 1 ? "1 sin publicar" : `${count} sin publicar`),
  versionLinesSyncBehind: (count) => (count === 1 ? "1 por traer" : `${count} por traer`),
  versionLinesSyncAheadBehind: (ahead, behind) => `${ahead} sin publicar, ${behind} por traer`,
  versionLinesDeletablePill: "Se puede eliminar",
  versionLinesNotDeletablePill: "Aún no se puede eliminar",
  versionLinesGlyphActive: "Activa: la línea en la que estás trabajando",
  versionLinesGlyphLocalOnly: "Solo local: nunca se ha publicado, así que solo está en este ordenador",
  versionLinesGlyphGone: "Su rama remota se eliminó",
  versionLinesGlyphProtected: "Línea principal: no se puede renombrar ni eliminar",
  versionLinesGlyphDeletable: "Se puede eliminar: sus versiones guardadas están en otro sitio",
  versionLinesGlyphNotDeletable: "Aún no se puede eliminar: tiene versiones que ninguna otra línea tiene",
  versionLinesDeleteCopiedTooltip: (name, base) =>
    `Eliminar «${name}». Su trabajo ya está en ${base}; GitOdile guarda antes un punto de recuperación.`,
  versionLinesDeleteReadyTooltip: (name) => `Eliminar «${name}». Su trabajo ya está en otro sitio.`,
  versionLinesDeleteBlockedTooltip: (name) =>
    `«${name}» tiene trabajo que no está en ningún otro sitio. Ábrela para ver tus opciones.`,
  versionLinesDeleteElsewhereTooltip: (name) =>
    `«${name}» está abierta en otro espacio de trabajo, así que no se puede eliminar desde aquí.`,
  versionLinesListAriaLabel: "Líneas de versión",
  versionLinesDetailAriaLabel: (name) => `Detalles de «${name}»`,
  versionLinesBackToList: "Volver a las líneas",
  versionLinesFiltersLabel: "Filtrar y ordenar",
  versionLinesFiltersActive: (count) =>
    count === 1 ? "Filtrar y ordenar (1 filtro activo)" : `Filtrar y ordenar (${count} filtros activos)`,
  versionLinesFiltersActiveCount: (count) =>
    count === 1 ? "1 filtro activo" : `${count} filtros activos`,
  versionLinesFilterSortGroup: "Ordenar por",
  versionLinesStateTracking: "Sigue un remoto",
  versionLinesLatestSavedLabel: "Última guardada",
  versionLinesVersionsTitle: "Versiones guardadas",
  versionLinesRouteTitle: "Recorrido",
  versionLinesChangesTitle: (base) => `Cambios respecto a ${base}`,
  versionLinesChangesBroughtTitle: (base) => `Lo que llevó a ${base}`,
  versionLinesChangesFiles: (count, formatted) => (count === 1 ? "1 archivo" : `${formatted} archivos`),
  versionLinesChangesSince: "desde que salió",
  versionLinesChangesMore: (count, formatted) =>
    count === 1 ? "y 1 archivo más" : `y ${formatted} archivos más`,
  versionLinesChangesBinary: "binario",
  versionLinesCompareShort: "Comparar",
  versionLinesVersionsMore: (count, formatted) =>
    count === 1 ? "1 más en Historial" : `${formatted} más en Historial`,
  versionLinesRouteLoading: "Leyendo dónde salió esta línea de main…",
  versionLinesRouteSummary: ({ base, date, own, unpublished, since }) =>
    `Salió de ${base}${date ? ` el ${date}` : ""}. ${own === "1" ? "1 versión propia" : `${own} versiones propias`}${
      unpublished ? ` (${unpublished} sin publicar)` : ""
    }. ${since ? `${base} tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.` : `${base} no se ha movido desde entonces.`}`,
  versionLinesRouteMerged: (base, since) =>
    `Todo su trabajo está en ${base}, que tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.`,
  versionLinesRouteSame: (base) => `Está en el mismo punto que ${base}. Aún no tiene versiones propias.`,
  versionLinesRouteCopied: ({ base, left, back, own, squashed, since }) =>
    `Salió de ${base}${left ? ` el ${left}` : ""}. Su trabajo volvió${back ? ` el ${back}` : ""} ${
      squashed ? "unido en una sola versión" : "en copias"
    }; ${own === "1" ? "el original solo está" : `los ${own} originales solo están`} en esta línea. ${
      since ? `${base} tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.` : `${base} no se ha movido desde entonces.`
    }`,
  versionLinesRouteReturned: ({ base, left, back, own, since }) =>
    `Salió de ${base}${left ? ` el ${left}` : ""} y volvió${back ? ` el ${back}` : ""} con ${
      own === "1" ? "1 versión" : `${own} versiones`
    }. ${since ? `${base} tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.` : `${base} no se ha movido desde entonces.`}`,
  versionLinesOpenVersionLabel: (subject) => `Abrir «${subject}» en Historial`,
  versionLinesPublishedPill: "Publicada",
  versionLinesUnpublishedPill: "Aún sin publicar",
  versionLinesRelationshipTitle: "Relación",
  versionLinesRelationshipSyncedDetail: (upstream) => `Al día con ${upstream}.`,
  versionLinesRelationshipAheadDetail: (upstream) => `Algunas versiones aún no están en ${upstream}. Publica para enviarlas.`,
  versionLinesRelationshipBehindDetail: (upstream) => `${upstream} tiene versiones nuevas. Trae los cambios del proyecto para incorporarlas.`,
  versionLinesRelationshipDivergedDetail: (upstream) => `Esta línea y ${upstream} han avanzado cada una por su lado.`,
  versionLinesRelationshipGoneDetail: (upstream) => `${upstream} ya no existe en el remoto. Tu trabajo aquí sigue a salvo.`,
  versionLinesRelationshipLocalOnlyDetail: "Nunca se ha publicado, así que solo está en este ordenador.",
  versionLinesRelationshipActiveTitle: "La línea en la que estás trabajando",
  versionLinesRelationshipActiveDetail: "Las versiones que guardes van aquí.",
  versionLinesRelationshipUniqueDetail: (main) => `Su trabajo aún no está en ${main}.`,
  versionLinesRelationshipMergedTitle: (main) => `Ya está en ${main}`,
  versionLinesRelationshipMergedDetail: (main) => `Todo lo guardado aquí también está en ${main}.`,
  versionLinesRelationshipElsewhereTitle: "Abierta en otro espacio de trabajo",
  versionLinesHistoryDescription: "Mira todas las versiones, compara cambios y vuelve a estados anteriores.",
  versionLinesHistoryScopedDescription: (name) => `Muestra «${name}» en Historial sin cambiar a ella.`,
  versionLinesHistoryAction: "Abrir en Historial",
  deleteVersionLineTitle: (name) => `¿Eliminar «${name}»?`,
  deleteVersionLineBlockedTitle: (name) => `«${name}» aún no se puede eliminar`,
  deleteVersionLineBlockedUniqueLead:
    "Esta línea tiene trabajo guardado que no está en ningún otro sitio. Eliminarla lo perdería, así que GitOdile no lo hará. Puedes:",
  deleteVersionLineBlockedUniqueOptionPublish: "Publicarla, para que el trabajo también esté en el remoto.",
  deleteVersionLineBlockedUniqueOptionMerge: "Llevar su trabajo a otra línea.",
  deleteVersionLineBlockedUniqueOptionKeep: "O conservarla: esperar no hace perder nada.",
  deleteVersionLineBlockedElsewhereLead:
    "Esta línea está abierta en otro espacio de trabajo. Ciérrala ahí o cambia ese espacio a otra línea, y reintenta.",
  deleteVersionLineBlockedActiveLead: "Es la línea en la que estás trabajando. Cambia antes a otra.",
  deleteVersionLineBlockedDefaultLead: "Es la línea principal del proyecto, donde vive el trabajo compartido. GitOdile la conserva.",
  deleteVersionLineBlockedOperationLead:
    "Hay una operación de Git sin terminar: normalmente una fusión, un rebase o un cherry-pick detenido por un conflicto. GitOdile no tocará ninguna línea hasta que se termine o se deshaga.",
  deleteVersionLineBlockedOperationNote:
    "Aún no se pueden resolver conflictos aquí. Termina o cancela la operación en tu herramienta de Git y vuelve.",
  deleteVersionLineOpenChangesAction: "Ver los archivos en conflicto",
  deleteVersionLineSwitchAction: "Cambiar a esta línea",
  deleteVersionLineSafeLead: "Solo se elimina el nombre. Su trabajo ya está en:",
  deleteVersionLineWarning: "Esto no se puede deshacer desde GitOdile.",
  deleteVersionLineCopiedLead: (base, squashed, shortCommit) =>
    `Su trabajo ya está en ${base}, ${squashed ? "unido en una sola versión" : "copiado versión a versión"} (${shortCommit}). Los originales solo están en esta línea.`,
  deleteVersionLineCopiedRecovery:
    "GitOdile guarda antes esos originales en un punto de recuperación local (conserva los 20 más recientes).",
  deleteVersionLineRecoveryKept: "Sus versiones originales quedan en un punto de recuperación local.",
  deleteVersionLineConfirm: "Eliminar",
  deleteVersionLineDeleting: "Eliminando…",
  deleteVersionLineSuccessTitle: "Línea de versión eliminada",
  deleteVersionLineDone: "Listo",
  deleteVersionLineRemoteLabel: (upstream) => `Eliminar también ${upstream}`,
  deleteVersionLineRemoteOnNote: "Se eliminará para todas las personas del proyecto.",
  deleteVersionLineRemoteOffNote: (upstream) => `${upstream} se queda, y tu equipo la sigue viendo.`,
  deleteVersionLineRemoteDoneLead: "La copia publicada también se eliminó.",
  deleteVersionLineRemoteFailedLead: "La línea ya no está en este ordenador, pero la copia publicada sigue ahí.",
  renameVersionLineTitle: (name) => `Renombrar «${name}»`,
  renameVersionLineNote: "Solo cambia el nombre. Todas las versiones guardadas se quedan donde están.",
  renameVersionLineUpstreamNote: (upstream) =>
    `Sigue apuntando a ${upstream}, que conserva su nombre. Renombrarla ahí es otro paso.`,
  renameVersionLineConfirm: "Renombrar",
  versionLinesRenameInlineNote: "Solo cambia el nombre",
  versionLinesRenameInlineUpstreamNote: (upstream) => `Solo cambia el nombre: sigue apuntando a ${upstream}`,
  renameVersionLineRenaming: "Renombrando…",
  versionLinesRenameShort: "Renombrar",
  versionLinesDeleteShort: "Eliminar",
  versionLinesContextMenuLabel: (name) => `Acciones para «${name}»`,
  versionLinesCopyName: "Copiar el nombre",
  versionLinesNameCopied: "Nombre copiado",
  versionLinesCopyFailed: "No se pudo copiar el nombre.",
  versionLinesRenameLineLabel: (name) => `Renombrar «${name}»`,
  versionLinesDefaultLineChip: "Línea principal",
  versionLinesDefaultLineNote: "Aquí vive el trabajo compartido, así que GitOdile no la renombra ni la elimina.",
};

export const versionLinesTranslations = { en, es } as const;
