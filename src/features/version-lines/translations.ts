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
  createVersionLineToast: (name: string, switched: boolean) => string;
  createVersionLineCreating: string;
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
  switchVersionLineDirtySaveTitle: string;
  switchVersionLineDirtySaveNote: string;
  switchVersionLineDirtyNewTitle: string;
  switchVersionLineDirtyNewNote: string;
  switchVersionLineRecoveryNote: (from: string) => string;
  switchVersionLineToast: (to: string) => string;
  switchVersionLineSwitching: string;
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
  deleteVersionLineBlockedTitle: string;
  deleteVersionLineBlockedUniqueLead: (name: string) => string;
  deleteVersionLineBlockedUniqueOptionPublish: string;
  deleteVersionLineBlockedUniqueOptionMerge: string;
  deleteVersionLineBlockedUniqueOptionKeep: string;
  deleteVersionLineBlockedElsewhereLead: string;
  deleteVersionLineBlockedActiveLead: string;
  deleteVersionLineBlockedDefaultLead: string;
  deleteVersionLineBlockedOperationLead: (name: string) => string;
  deleteVersionLineOpenChangesAction: string;
  deleteVersionLineSwitchAction: string;
  deleteVersionLineSafeLead: (line: string) => string;
  /** A line whose work reached the main line only as copies: what is on the
   * main line already, and the recovery point kept for its originals. */
  deleteVersionLineCopiedLead: (base: string, squashed: boolean) => string;
  deleteVersionLineCopiedRecovery: string;
  deleteVersionLineConfirm: string;
  deleteVersionLineConflictTitle: string;
  deleteVersionLineDeletedToast: (name: string, extra: "recovery" | "remote" | "remote-failed" | null) => string;
  deleteVersionLineDeleting: string;
  deleteVersionLineRemoteLabel: string;
  deleteVersionLineRemoteOnNote: string;
  deleteVersionLineRemoteOffNote: string;
  renameVersionLineTitle: (name: string) => string;
  /** How a blocked app update names an unfinished rename; the update quotes
   * it, so it carries no quotes of its own. */
  renameVersionLineInstallBlockerLabel: (name: string) => string;
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
  versionLinesDetachedDescription: "You're on a specific saved version, so create a line here to keep this work easy to find.",
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
  createVersionLineSwitchLabel: "Switch to the new line",
  createVersionLineDetachedNote: "You're not on a version line, so you'll switch to the new one to keep this work easy to find.",
  createVersionLineStartsAt: (shortCommit, subject) => `Starts at ${shortCommit} — “${subject}”.`,
  createVersionLineConfirm: "Create line",
  createVersionLineToast: (name, switched) => switched ? `“${name}” created, and you're on it now.` : `“${name}” created.`,
  createVersionLineCreating: "Creating…",
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
        return "Use hyphens instead of spaces, like my-line.";
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
        return `“${issue.existing}” already exists, and names that differ only in capitals clash on some systems.`;
    }
  },
  switchVersionLineTitle: (to) => `Switch to “${to}”`,
  switchVersionLineLoading: "Comparing version lines…",
  switchVersionLineChangedFiles: (count) =>
    count === 1 ? "1 file will change." : `${count} files will change.`,
  switchVersionLineChangedFilesTruncated: (visible, total) => `Showing ${visible} of ${total} changed files.`,
  switchVersionLineDirtyDescription: "Choose what to do with your unsaved changes.",
  switchVersionLineSaveVersionAction: "Save version",
  switchVersionLineNewLineAction: "New line with these changes",
  switchVersionLineConfirm: "Switch line",
  switchVersionLineDirtySaveTitle: "Save them as a version",
  switchVersionLineDirtySaveNote: "They're saved on the current line, then you switch.",
  switchVersionLineDirtyNewTitle: "Take them to a new line",
  switchVersionLineDirtyNewNote: "The current line stays as it was.",
  switchVersionLineRecoveryNote: (from) => `“${from}” stays as it is, and switching back returns these files.`,
  switchVersionLineToast: (to) => `You're now on “${to}”.`,
  switchVersionLineSwitching: "Switching…",
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
  versionLinesRelationshipAheadDetail: (upstream) => `Some versions aren't on ${upstream} yet, so publish to send them.`,
  versionLinesRelationshipBehindDetail: (upstream) => `${upstream} has newer versions, so get project changes to bring them in.`,
  versionLinesRelationshipDivergedDetail: (upstream) => `This line and ${upstream} have both moved on.`,
  versionLinesRelationshipGoneDetail: (upstream) => `${upstream} no longer exists on the remote, but your work here is still safe.`,
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
  deleteVersionLineBlockedTitle: "Can't delete it yet",
  deleteVersionLineBlockedUniqueLead:
    (name) => `“${name}” has versions that aren't anywhere else. You can:`,
  deleteVersionLineBlockedUniqueOptionPublish: "Publish it, so the work is also on the remote.",
  deleteVersionLineBlockedUniqueOptionMerge: "Bring its work into another line.",
  deleteVersionLineBlockedUniqueOptionKeep: "Or keep it — nothing is lost by waiting.",
  deleteVersionLineBlockedElsewhereLead:
    "This line is open in another workspace. Close it there or switch that workspace to another line, then retry.",
  deleteVersionLineBlockedActiveLead: "This is the line you're working on. Switch to another one first.",
  deleteVersionLineBlockedDefaultLead: "This is the project's main line, where shared work lives, so GitOdile keeps it.",
  deleteVersionLineBlockedOperationLead:
    (name) => `Finish or cancel it in your Git tool, then come back to delete “${name}”.`,
  deleteVersionLineOpenChangesAction: "See the files in conflict",
  deleteVersionLineSwitchAction: "Switch to this line",
  deleteVersionLineSafeLead: (line) => `Its work is already on “${line}”, so nothing is lost.`,
  deleteVersionLineCopiedLead: (base, squashed) =>
    `Its work is already on “${base}”, ${squashed ? "combined into one version" : "copied version by version"}.`,
  deleteVersionLineCopiedRecovery:
    "Its original versions are saved as a recovery point first.",
  deleteVersionLineConfirm: "Delete line",
  deleteVersionLineConflictTitle: "A conflict is unfinished",
  deleteVersionLineDeletedToast: (name, extra) =>
    extra === "remote-failed"
      ? `“${name}” is gone from this computer, but the published copy is still there.`
      : extra === "remote"
        ? `“${name}” deleted, and its published copy too.`
        : extra === "recovery"
          ? `“${name}” deleted. Its original versions are kept in a recovery point.`
          : `“${name}” deleted.`,
  deleteVersionLineDeleting: "Deleting…",
  deleteVersionLineRemoteLabel: "Also delete the published copy",
  deleteVersionLineRemoteOnNote: "Your team won't see it anymore.",
  deleteVersionLineRemoteOffNote: "It stays, and your team still sees it.",
  renameVersionLineTitle: (name) => `Rename “${name}”`,
  renameVersionLineInstallBlockerLabel: (name) => `Rename ${name}`,
  renameVersionLineNote: "Only the name changes, and every saved version stays where it is.",
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
  versionLinesDetachedDescription: "Estás en una versión guardada concreta, así que crea aquí una línea para que este trabajo sea fácil de encontrar.",
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
  createVersionLineSwitchLabel: "Cambiar a la nueva línea",
  createVersionLineDetachedNote: "No estás en una línea de versión, así que cambiarás a la nueva para que este trabajo sea fácil de encontrar.",
  createVersionLineStartsAt: (shortCommit, subject) => `Empieza en ${shortCommit}: «${subject}».`,
  createVersionLineConfirm: "Crear línea",
  createVersionLineToast: (name, switched) => switched ? `«${name}» creada, y ya estás en ella.` : `«${name}» creada.`,
  createVersionLineCreating: "Creando…",
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
        return `Ya existe una línea llamada «${issue.name}».`;
      case "case-collision":
        return `Ya existe «${issue.existing}», y los nombres que solo cambian en mayúsculas chocan en algunos sistemas.`;
    }
  },
  switchVersionLineTitle: (to) => `Cambiar a «${to}»`,
  switchVersionLineLoading: "Comparando líneas de versión…",
  switchVersionLineChangedFiles: (count) =>
    count === 1 ? "Cambiará 1 archivo." : `Cambiarán ${count} archivos.`,
  switchVersionLineChangedFilesTruncated: (visible, total) => `Se muestran ${visible} de ${total} archivos cambiados.`,
  switchVersionLineDirtyDescription: "Elige qué hacer con tus cambios sin guardar.",
  switchVersionLineSaveVersionAction: "Guardar versión",
  switchVersionLineNewLineAction: "Línea nueva con estos cambios",
  switchVersionLineConfirm: "Cambiar de línea",
  switchVersionLineDirtySaveTitle: "Guardarlos como versión",
  switchVersionLineDirtySaveNote: "Se guardan en la línea actual y luego cambias.",
  switchVersionLineDirtyNewTitle: "Llevarlos a una línea nueva",
  switchVersionLineDirtyNewNote: "La línea actual se queda como estaba.",
  switchVersionLineRecoveryNote: (from) => `«${from}» se queda tal cual y, al volver, recuperas estos archivos.`,
  switchVersionLineToast: (to) => `Ahora estás en «${to}».`,
  switchVersionLineSwitching: "Cambiando…",
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
  versionLinesRelationshipAheadDetail: (upstream) => `Algunas versiones aún no están en ${upstream}, así que publícalas para enviarlas.`,
  versionLinesRelationshipBehindDetail: (upstream) => `${upstream} tiene versiones nuevas, así que trae los cambios del proyecto para incorporarlas.`,
  versionLinesRelationshipDivergedDetail: (upstream) => `Esta línea y ${upstream} han avanzado cada una por su lado.`,
  versionLinesRelationshipGoneDetail: (upstream) => `${upstream} ya no existe en el remoto, pero tu trabajo aquí sigue a salvo.`,
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
  deleteVersionLineBlockedTitle: "Aún no se puede eliminar",
  deleteVersionLineBlockedUniqueLead:
    (name) => `«${name}» tiene versiones que no están en otra parte. Puedes:`,
  deleteVersionLineBlockedUniqueOptionPublish: "Publicarla, para que el trabajo también esté en el remoto.",
  deleteVersionLineBlockedUniqueOptionMerge: "Llevar su trabajo a otra línea.",
  deleteVersionLineBlockedUniqueOptionKeep: "O conservarla: esperar no hace perder nada.",
  deleteVersionLineBlockedElsewhereLead:
    "Esta línea está abierta en otro espacio de trabajo. Ciérrala ahí o cambia ese espacio a otra línea, y reintenta.",
  deleteVersionLineBlockedActiveLead: "Es la línea en la que estás trabajando. Cambia antes a otra.",
  deleteVersionLineBlockedDefaultLead: "Es la línea principal del proyecto, donde vive el trabajo compartido, así que GitOdile la conserva.",
  deleteVersionLineBlockedOperationLead:
    (name) => `Termínalo o cancélalo en tu herramienta de Git y vuelve para eliminar «${name}».`,
  deleteVersionLineOpenChangesAction: "Ver los archivos en conflicto",
  deleteVersionLineSwitchAction: "Cambiar a esta línea",
  deleteVersionLineSafeLead: (line) => `Su trabajo ya está en «${line}», así que no se pierde nada.`,
  deleteVersionLineCopiedLead: (base, squashed) =>
    `Su trabajo ya está en «${base}», ${squashed ? "combinado en una sola versión" : "copiado versión a versión"}.`,
  deleteVersionLineCopiedRecovery:
    "Antes de eliminarla se guardan las versiones originales como punto de recuperación.",
  deleteVersionLineConfirm: "Eliminar línea",
  deleteVersionLineConflictTitle: "Hay un conflicto a medias",
  deleteVersionLineDeletedToast: (name, extra) =>
    extra === "remote-failed"
      ? `«${name}» ya no está en este ordenador, pero la copia publicada sigue ahí.`
      : extra === "remote"
        ? `«${name}» eliminada, también su copia publicada.`
        : extra === "recovery"
          ? `«${name}» eliminada. Sus versiones originales quedan en un punto de recuperación.`
          : `«${name}» eliminada.`,
  deleteVersionLineDeleting: "Eliminando…",
  deleteVersionLineRemoteLabel: "Eliminar también la copia publicada",
  deleteVersionLineRemoteOnNote: "Tu equipo dejará de verla.",
  deleteVersionLineRemoteOffNote: "Se queda, y tu equipo la sigue viendo.",
  renameVersionLineTitle: (name) => `Renombrar «${name}»`,
  renameVersionLineInstallBlockerLabel: (name) => `Renombrar ${name}`,
  renameVersionLineNote: "Solo cambia el nombre y todas las versiones guardadas se quedan donde están.",
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
