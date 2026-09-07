export interface VersionLinesTranslations {
  versionLinesTitle: string;
  versionLinesSearchPlaceholder: string;
  versionLinesSearchAriaLabel: string;
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
  versionLinesDetachedTitle: string;
  versionLinesDetachedDescription: string;
  versionLinesDetachedRecoverButton: string;
  versionLinesUnbornTitle: string;
  versionLinesUnbornDescription: string;
  versionLinesUpstreamLabel: (upstream: string) => string;
  versionLinesNoUpstreamLabel: string;
  versionLinesCheckedOutElsewhere: (path: string) => string;
  versionLinesUniqueCommits: (count: number) => string;
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
  versionLinesStatsLines: (count: number) => string;
  versionLinesStatsActive: (count: number) => string;
  versionLinesStatsLocalOnly: (count: number) => string;
  versionLinesLatestLabel: (subject: string) => string;
  versionLinesFilterStateGroup: string;
  versionLinesFilterPrefixGroup: string;
  versionLinesFilterClear: string;
  versionLinesSortRecent: string;
  versionLinesSortName: string;
  versionLinesSortUnpublished: string;
  versionLinesSwitchShort: string;
  versionLinesSwitchToLineLabel: (name: string) => string;
  versionLinesNewFromLine: string;
  versionLinesSyncUpToDate: string;
  versionLinesSyncNoUpstream: string;
  versionLinesSyncGone: string;
  versionLinesSyncAhead: (count: number) => string;
  versionLinesSyncBehind: (count: number) => string;
  versionLinesSyncAheadBehind: (ahead: number, behind: number) => string;
  versionLinesDetailsUpstreamLabel: string;
  versionLinesDetailsUpstreamNone: string;
  versionLinesDetailsSyncLabel: string;
  versionLinesDeletablePill: string;
  versionLinesNotDeletablePill: string;
  versionLinesDeleteReadyTooltip: (name: string) => string;
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
  versionLinesMoreActions: (name: string) => string;
  versionLinesStripAriaLabel: string;
  versionLinesStripOlder: string;
  versionLinesStripNewer: string;
  versionLinesStripCountLabel: string;
  versionLinesStripLatestLabel: string;
  versionLinesSavedVersionCount: (count: number) => string;
  versionLinesRecentTitle: string;
  versionLinesRecentViewAll: string;
  versionLinesStatusLocalVersions: string;
  versionLinesLatestTitle: string;
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
  versionLinesRelationshipUniqueDetail: string;
  versionLinesRelationshipMergedTitle: string;
  versionLinesRelationshipMergedDetail: string;
  versionLinesRelationshipElsewhereTitle: string;
  versionLinesStatusTitle: string;
  versionLinesStatusRemoteTracking: string;
  versionLinesStatusLastUpdated: string;
  versionLinesStatusLineType: string;
  versionLinesLineTypeTracking: string;
  versionLinesLineTypeElsewhere: string;
  versionLinesHistoryTitle: string;
  versionLinesHistoryDescription: string;
  versionLinesHistoryInactiveDescription: string;
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
  deleteVersionLineRetainedBy: (refs: string) => string;
  deleteVersionLineSafeLead: string;
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
  renameVersionLineNameLabel: string;
  renameVersionLineNote: string;
  renameVersionLineUpstreamNote: (upstream: string) => string;
  renameVersionLineConfirm: string;
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
  versionLinesFilterAriaLabel: "Filter version lines",
  versionLinesNoProjectTitle: "No project open",
  versionLinesNoProjectDescription: "Open a project to see and manage its version lines.",
  versionLinesLoading: "Loading version lines…",
  versionLinesErrorLoading: "GitOdile couldn't load this project's version lines.",
  versionLinesRetry: "Try again",
  versionLinesActiveLabel: "Active",
  versionLinesNewButton: "New line",
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
  versionLinesQuickSwitchSeeAll: "See all version lines",
  versionLinesQuickSwitchNew: "New version line",
  versionLinesDetachedTitle: "This project isn't on a version line right now",
  versionLinesDetachedDescription:
    "You're looking at one specific saved version. Create a named version line here to keep this work easy to find.",
  versionLinesDetachedRecoverButton: "Create a version line here",
  versionLinesUnbornTitle: "Save a version first",
  versionLinesUnbornDescription: "This version line has no saved versions yet, so there's nothing to branch from.",
  versionLinesUpstreamLabel: (upstream) => `Tracks ${upstream}`,
  versionLinesNoUpstreamLabel: "Local only",
  versionLinesCheckedOutElsewhere: (path) => `Open in another workspace at ${path}. Switch to it from there.`,
  versionLinesUniqueCommits: (count) =>
    count === 1 ? "1 version not on the active line" : `${count} versions not on the active line`,
  versionLinesRefNameLabel: "Branch name",
  versionLinesTipCommitLabel: "Latest commit",
  versionLinesSavedLabel: (date) => `Saved ${date}`,
  createVersionLineTitle: "New version line",
  createVersionLineNameLabel: "Name",
  createVersionLineNamePlaceholder: "e.g. feature/new-onboarding",
  createVersionLineSwitchLabel: "Create and switch to it",
  createVersionLineWithoutSwitchLabel: "Create without switching",
  createVersionLineDetachedNote:
    "This project isn't on a version line right now, so GitOdile will switch to the new one to keep this commit easy to find.",
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
    "GitOdile can't switch version lines with unsaved work in the way. Save a version, or start a new version line with this work instead.",
  switchVersionLineSaveVersionAction: "Save version",
  switchVersionLineNewLineAction: "New version line with this work",
  switchVersionLineConfirm: "Switch",
  switchVersionLineSwitching: "Switching…",
  switchVersionLineSuccessTitle: "Switched version lines",
  switchVersionLineDone: "Done",
  versionLinesStatsLines: (count) => (count === 1 ? "1 version line" : `${count} version lines`),
  versionLinesStatsActive: (count) => `${count} active`,
  versionLinesStatsLocalOnly: (count) => `${count} local only`,
  versionLinesLatestLabel: (subject) => `Latest: ${subject}`,
  versionLinesFilterStateGroup: "State",
  versionLinesFilterPrefixGroup: "Name prefix",
  versionLinesFilterClear: "Clear filters",
  versionLinesSortRecent: "Recently updated",
  versionLinesSortName: "Name (A–Z)",
  versionLinesSortUnpublished: "Local-only first",
  versionLinesSwitchShort: "Switch",
  versionLinesSwitchToLineLabel: (name) => `Switch to “${name}”`,
  versionLinesNewFromLine: "New version from this line",
  versionLinesSyncUpToDate: "Up to date with the remote",
  versionLinesSyncNoUpstream: "No upstream configured",
  versionLinesSyncGone: "Remote branch deleted",
  versionLinesSyncAhead: (count) => (count === 1 ? "1 not pushed" : `${count} not pushed`),
  versionLinesSyncBehind: (count) => (count === 1 ? "1 not pulled" : `${count} not pulled`),
  versionLinesSyncAheadBehind: (ahead, behind) => `${ahead} not pushed, ${behind} not pulled`,
  versionLinesDetailsUpstreamLabel: "Upstream",
  versionLinesDetailsUpstreamNone: "None",
  versionLinesDetailsSyncLabel: "Remote status",
  versionLinesDeletablePill: "Safe to delete",
  versionLinesNotDeletablePill: "Can't be deleted yet",
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
  versionLinesMoreActions: (name) => `More actions for “${name}”`,
  versionLinesStripAriaLabel: "Where this line stands",
  versionLinesStripOlder: "Older versions",
  versionLinesStripNewer: "Newer versions",
  versionLinesStripCountLabel: "This line",
  versionLinesStripLatestLabel: "Latest saved",
  versionLinesSavedVersionCount: (count) =>
    count === 1 ? "1 saved version" : `${count} saved versions`,
  versionLinesRecentTitle: "Recent versions",
  versionLinesRecentViewAll: "View all",
  versionLinesStatusLocalVersions: "Saved versions",
  versionLinesLatestTitle: "Latest saved version",
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
  versionLinesRelationshipUniqueDetail:
    "Switch to this line, or bring its work into the active one, to keep it going.",
  versionLinesRelationshipMergedTitle: "Already on the active line",
  versionLinesRelationshipMergedDetail: "Everything saved here is also reachable from the line you're on.",
  versionLinesRelationshipElsewhereTitle: "Open in another workspace",
  versionLinesStatusTitle: "Status",
  versionLinesStatusRemoteTracking: "Remote tracking",
  versionLinesStatusLastUpdated: "Last updated",
  versionLinesStatusLineType: "Line type",
  versionLinesLineTypeTracking: "Tracking remote",
  versionLinesLineTypeElsewhere: "Open in another workspace",
  versionLinesHistoryTitle: "Explore the full history of this line",
  versionLinesHistoryDescription: "View all versions, compare changes, and restore previous states.",
  versionLinesHistoryInactiveDescription:
    "History follows the line you're on. Switch to this line to explore its own versions.",
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
  deleteVersionLineRetainedBy: (refs) => `Its saved work stays reachable from: ${refs}.`,
  deleteVersionLineSafeLead:
    "Only the local name is removed. The saved work itself is already kept elsewhere:",
  deleteVersionLineWarning: "This can't be undone from GitOdile.",
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
  renameVersionLineNameLabel: "New name",
  renameVersionLineNote: "Only the name changes. Every saved version on this line stays exactly where it is.",
  renameVersionLineUpstreamNote: (upstream) =>
    `This line goes on tracking ${upstream}, which keeps its own name. Renaming it there is a separate decision.`,
  renameVersionLineConfirm: "Rename",
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
  versionLinesFilterAriaLabel: "Filtrar las líneas de versión",
  versionLinesNoProjectTitle: "No hay ningún proyecto abierto",
  versionLinesNoProjectDescription: "Abre un proyecto para ver y gestionar sus líneas de versión.",
  versionLinesLoading: "Cargando líneas de versión…",
  versionLinesErrorLoading: "GitOdile no pudo cargar las líneas de versión de este proyecto.",
  versionLinesRetry: "Intentar de nuevo",
  versionLinesActiveLabel: "Activa",
  versionLinesNewButton: "Nueva línea",
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
  versionLinesQuickSwitchSeeAll: "Ver todas las líneas de versión",
  versionLinesQuickSwitchNew: "Nueva línea de versión",
  versionLinesDetachedTitle: "Este proyecto no está en una línea de versión ahora mismo",
  versionLinesDetachedDescription:
    "Estás viendo una versión guardada concreta. Crea aquí una línea de versión con nombre para que este trabajo sea fácil de encontrar.",
  versionLinesDetachedRecoverButton: "Crear una línea de versión aquí",
  versionLinesUnbornTitle: "Guarda una versión primero",
  versionLinesUnbornDescription: "Esta línea de versión todavía no tiene versiones guardadas, así que no hay nada de qué partir.",
  versionLinesUpstreamLabel: (upstream) => `Sigue a ${upstream}`,
  versionLinesNoUpstreamLabel: "Solo local",
  versionLinesCheckedOutElsewhere: (path) => `Abierta en otro espacio de trabajo en ${path}. Cámbiate a ella desde ahí.`,
  versionLinesUniqueCommits: (count) =>
    count === 1 ? "1 versión fuera de la línea activa" : `${count} versiones fuera de la línea activa`,
  versionLinesRefNameLabel: "Nombre de la rama",
  versionLinesTipCommitLabel: "Último commit",
  versionLinesSavedLabel: (date) => `Guardada el ${date}`,
  createVersionLineTitle: "Nueva línea de versión",
  createVersionLineNameLabel: "Nombre",
  createVersionLineNamePlaceholder: "p. ej. feature/nueva-bienvenida",
  createVersionLineSwitchLabel: "Crear y cambiar a ella",
  createVersionLineWithoutSwitchLabel: "Crear sin cambiar",
  createVersionLineDetachedNote:
    "Este proyecto no está en una línea de versión ahora mismo, así que GitOdile cambiará a la nueva para que este commit sea fácil de encontrar.",
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
    "GitOdile no puede cambiar de línea de versión con trabajo sin guardar de por medio. Guarda una versión, o inicia una nueva línea de versión con este trabajo.",
  switchVersionLineSaveVersionAction: "Guardar versión",
  switchVersionLineNewLineAction: "Nueva línea de versión con este trabajo",
  switchVersionLineConfirm: "Cambiar",
  switchVersionLineSwitching: "Cambiando…",
  switchVersionLineSuccessTitle: "Línea de versión cambiada",
  switchVersionLineDone: "Listo",
  versionLinesStatsLines: (count) =>
    count === 1 ? "1 línea de versión" : `${count} líneas de versión`,
  versionLinesStatsActive: (count) => `${count} activa`,
  versionLinesStatsLocalOnly: (count) => `${count} solo local`,
  versionLinesLatestLabel: (subject) => `Última: ${subject}`,
  versionLinesFilterStateGroup: "Estado",
  versionLinesFilterPrefixGroup: "Prefijo del nombre",
  versionLinesFilterClear: "Quitar filtros",
  versionLinesSortRecent: "Actualizadas recientemente",
  versionLinesSortName: "Nombre (A–Z)",
  versionLinesSortUnpublished: "Solo locales primero",
  versionLinesSwitchShort: "Cambiar",
  versionLinesSwitchToLineLabel: (name) => `Cambiar a «${name}»`,
  versionLinesNewFromLine: "Nueva versión desde esta línea",
  versionLinesSyncUpToDate: "Al día con el remoto",
  versionLinesSyncNoUpstream: "Sin remoto configurado",
  versionLinesSyncGone: "Rama remota eliminada",
  versionLinesSyncAhead: (count) => (count === 1 ? "1 sin subir" : `${count} sin subir`),
  versionLinesSyncBehind: (count) => (count === 1 ? "1 sin bajar" : `${count} sin bajar`),
  versionLinesSyncAheadBehind: (ahead, behind) => `${ahead} sin subir, ${behind} sin bajar`,
  versionLinesDetailsUpstreamLabel: "Remoto",
  versionLinesDetailsUpstreamNone: "Ninguno",
  versionLinesDetailsSyncLabel: "Estado con el remoto",
  versionLinesDeletablePill: "Se puede eliminar",
  versionLinesNotDeletablePill: "Todavía no se puede eliminar",
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
  versionLinesMoreActions: (name) => `Más acciones para «${name}»`,
  versionLinesStripAriaLabel: "Situación de esta línea",
  versionLinesStripOlder: "Versiones anteriores",
  versionLinesStripNewer: "Versiones recientes",
  versionLinesStripCountLabel: "Esta línea",
  versionLinesStripLatestLabel: "Última guardada",
  versionLinesSavedVersionCount: (count) =>
    count === 1 ? "1 versión guardada" : `${count} versiones guardadas`,
  versionLinesRecentTitle: "Versiones recientes",
  versionLinesRecentViewAll: "Ver todas",
  versionLinesStatusLocalVersions: "Versiones guardadas",
  versionLinesLatestTitle: "Última versión guardada",
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
  versionLinesRelationshipUniqueDetail:
    "Cámbiate a esta línea, o lleva su trabajo a la activa, para seguir con él.",
  versionLinesRelationshipMergedTitle: "Ya está en la línea activa",
  versionLinesRelationshipMergedDetail:
    "Todo lo guardado aquí también es accesible desde la línea en la que estás.",
  versionLinesRelationshipElsewhereTitle: "Abierta en otro espacio de trabajo",
  versionLinesStatusTitle: "Estado",
  versionLinesStatusRemoteTracking: "Remoto que sigue",
  versionLinesStatusLastUpdated: "Última actualización",
  versionLinesStatusLineType: "Tipo de línea",
  versionLinesLineTypeTracking: "Sigue a un remoto",
  versionLinesLineTypeElsewhere: "Abierta en otro espacio de trabajo",
  versionLinesHistoryTitle: "Explora el historial completo de esta línea",
  versionLinesHistoryDescription:
    "Ve todas las versiones, compara cambios y restaura estados anteriores.",
  versionLinesHistoryInactiveDescription:
    "El historial sigue a la línea en la que estás. Cámbiate a esta línea para ver sus versiones.",
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
  deleteVersionLineRetainedBy: (refs) => `Su trabajo guardado sigue siendo accesible desde: ${refs}.`,
  deleteVersionLineSafeLead:
    "Solo se elimina el nombre local. El trabajo guardado ya se conserva en otro sitio:",
  deleteVersionLineWarning: "Esto no se puede deshacer desde GitOdile.",
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
  renameVersionLineNameLabel: "Nombre nuevo",
  renameVersionLineNote:
    "Solo cambia el nombre. Todas las versiones guardadas de esta línea se quedan exactamente donde están.",
  renameVersionLineUpstreamNote: (upstream) =>
    `Esta línea sigue apuntando a ${upstream}, que conserva su nombre. Renombrarla ahí es otra decisión.`,
  renameVersionLineConfirm: "Renombrar",
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
