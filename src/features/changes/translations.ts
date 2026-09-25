export interface ChangesTranslations {
  changesSummaryClean: string;
  changesEmptySavedTitle: string;
  changesEmptyAheadDescription: (count: number) => string;
  changesEmptyPublish: (count: number) => string;
  changesEmptyBehindDescription: (count: number) => string;
  changesEmptyGetChanges: string;
  changesEmptyViewHistory: string;
  changesEmptyUpToDateTitle: string;
  changesEmptyUpToDateDescription: string;
  changesEmptyNoRemoteTitle: string;
  changesEmptyNoRemoteDescription: string;
  changesEmptyOpenSettings: string;
  changesEmptyUnbornTitle: string;
  changesEmptyUnbornDescription: string;
  changesEmptyDetachedTitle: string;
  changesEmptyDetachedDescription: string;
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
  changesSearchDiffPlaceholder: string;
  changesSearchDiffAriaLabel: string;
  changesDiffBinaryTitle: string;
  changesDiffBinaryDescription: string;
  changesImageLoading: string;
  changesImageError: string;
  changesImageUnavailable: string;
  changesImageBefore: string;
  changesImageAfter: string;
  changesImageAdded: string;
  changesImageRemoved: string;
  changesImageBeforeAlt: (path: string) => string;
  changesImageAfterAlt: (path: string) => string;
  changesImageTooLarge: (limit: string) => string;
  changesImageUnsupported: string;
  changesImageComparisonLabel: string;
  changesImageModeSideBySide: string;
  changesImageModeSwipe: string;
  changesImageModeFade: string;
  changesImageSwipePosition: string;
  changesImageFadeAmount: string;
  changesImageSameSize: string;
  changesImageLarger: (amount: string) => string;
  changesImageSmaller: (amount: string) => string;
  changesSvgViewLabel: string;
  changesSvgDrawing: string;
  changesSvgSource: string;
  changesDiffTooLargeTitle: string;
  changesDiffTooLargeDescription: (limit: string) => string;
  changesDiffWhitespaceOnlyTitle: string;
  changesDiffWhitespaceOnlyDescription: string;
  changesDiffUnchangedTitle: string;
  changesDiffUnchangedDescription: string;
  changesDiffConflictTitle: string;
  changesDiffConflictDescription: string;
  changesDiffConflictUnavailable: string;
  changesDiffConflictBinary: string;
  changesDiffConflictTooLarge: string;
  changesDiffAriaLabel: (path: string) => string;
  changesDiffHiddenLines: (count: number) => string;
  changesDiffShowHiddenLines: (count: number) => string;
  changesDiffExpandFailed: string;
  changesDiffTruncatedNote: (shownLines: number) => string;
  changesLineAddedLabel: string;
  changesLineRemovedLabel: string;
  changesSearchPlaceholder: string;
  changesSearchAriaLabel: string;
  changesNoSearchMatches: string;
  changesNoFilterMatches: string;
  changesFiltersLabel: string;
  changesFiltersActive: (count: number) => string;
  changesFiltersActiveCount: (count: number) => string;
  changesFiltersClear: string;
  changesFilterRemove: (label: string) => string;
  changesFilterKindLabel: string;
  changesFilterTypeLabel: string;
  changesFilterTypeNone: string;
  changesFilterModeLabel: (group: string) => string;
  changesFilterModeOnly: string;
  changesFilterModeHide: string;
  changesFilterHiddenChip: (label: string) => string;
  changesFilterShowAgain: (label: string) => string;
  changesFilterInclusionLabel: string;
  changesFilterInclusionAll: string;
  changesFilterInclusionIncluded: string;
  changesFilterInclusionExcluded: string;
  changesFilterInclusionIncludedChip: string;
  changesFilterInclusionExcludedChip: string;
  changesFilePosition: (position: number, total: number) => string;
  changesPreviousFile: string;
  changesNextFile: string;
  changesViewUnified: string;
  changesViewSplit: string;
  changesViewAccessible: string;
  changesViewAccessibleAriaLabel: string;
  changesViewAriaLabel: string;
  changesHunkPosition: (position: number, total: number) => string;
  changesPreviousHunk: string;
  changesNextHunk: string;
  changesCheckLocal: string;
  changesRefreshFailedTitle: string;
  changesDiscardingNow: string;
  changesSaveVersionNoSelectionHint: string;
  changesQuickCommitFiles: (saved: number, total: number) => string;
  changesQuickCommitSaving: string;

  changesSelectAll: string;
  changesSelectNone: string;
  changesIncludeFile: (path: string) => string;
  changesIncludeFolder: (path: string) => string;
  changesFolderLabel: (path: string, count: number) => string;
  changesFileViewFolders: string;
  changesFileViewShowList: string;
  changesFileViewShowFolders: string;
  changesPartialUnavailableTruncated: string;
  changesProjectRoot: string;
  changesMoreActions: string;
  changesContextMenuLabel: string;
  changesCopy: string;
  changesCopyPath: string;
  changesRevealInFolder: string;
  changesRevealFailed: string;
  changesCopied: string;
  changesCopyFailed: string;
  changesDiscardFileContext: string;
  changesDiscardSelected: string;
  changesDiscardAll: string;
  changesRestoreDiscarded: string;
  changesDiscardFileTitle: string;
  changesDiscardAllTitle: string;
  changesRestoreTitle: string;
  changesDiscardDoneTitle: string;
  changesRestoreDoneTitle: string;
  changesDiscardFileSummary: (path: string) => string;
  changesDiscardAllSummary: (count: number) => string;
  changesDiscardPreparedWarning: string;
  changesDiscardUntrackedWarning: string;
  changesDiscardConflictWarning: string;
  changesDiscardRecoveryNote: string;
  changesDiscardConfirmFile: string;
  changesDiscardConfirmAll: string;
  changesRestoreConfirm: string;
  changesDiscardSuccess: (count: number) => string;
  changesRestoreSuccess: (count: number) => string;
  changesUndoDiscard: string;
  changesDiscardLoading: string;
  changesRestoreLoading: string;
  changesRestoreSummary: (count: number) => string;
  changesRestoreChooseLabel: string;
  changesRestoreChooseIntro: string;
  changesRestoreEmpty: string;
  changesRestoreEntryPaths: (count: number) => string;
  changesRestoreEntryMore: (preview: string, hidden: number) => string;
  changesRestoreUnavailableSuperseded: string;
  changesRestoreUnavailableIncomplete: string;
  changesRestoreUnavailableToggle: (count: number) => string;
  changesRestoreNoneAvailable: string;
  changesRestorePreparedNote: string;
  changesRestoreForget: string;
  changesRestoreForgetTitle: string;
  changesRestoreForgetWarning: (count: number) => string;
  changesRestoreForgetConfirm: string;
  changesRestoreForgetCancel: string;
  changesDiscardUnavailable: string;
}

const en: ChangesTranslations = {
  changesSummaryClean: "All changes are saved.",
  changesEmptySavedTitle: "All changes are saved",
  changesEmptyAheadDescription: (count) =>
    count === 1
      ? "1 saved version is only on this computer. Publish it to share it."
      : `${count} saved versions are only on this computer. Publish them to share them.`,
  changesEmptyPublish: (count) => (count === 1 ? "Publish 1 version" : `Publish ${count} versions`),
  changesEmptyBehindDescription: (count) =>
    count === 1
      ? "1 newer version is available on the remote."
      : `${count} newer versions are available on the remote.`,
  changesEmptyGetChanges: "Get project changes",
  changesEmptyViewHistory: "View history",
  changesEmptyUpToDateTitle: "You're all caught up",
  changesEmptyUpToDateDescription: "Everything is saved and published.",
  changesEmptyNoRemoteTitle: "Everything is saved on this computer",
  changesEmptyNoRemoteDescription: "Add a remote in project settings when you want to share your work.",
  changesEmptyOpenSettings: "Open project settings",
  changesEmptyUnbornTitle: "No saved versions yet",
  changesEmptyUnbornDescription: "Your first saved version starts this project's history.",
  changesEmptyDetachedTitle: "You're viewing an old version",
  changesEmptyDetachedDescription: "This is a point in history, not a version line. Switch back to a line to keep working.",
  changesBackToList: "Back to the file list",
  changesListAriaLabel: "Changed files",
  changesCategoryLabelChanged: "Edited",
  changesCategoryLabelNew: "New",
  changesCategoryLabelDeleted: "Deleted",
  changesCategoryLabelRenamed: "Renamed",
  changesCategoryLabelConflicted: "Needs attention",
  changesRenamedFrom: (original) => `Renamed from ${original}`,
  changesSelectionAnnouncement: (path) => `Showing changes in ${path}.`,
  changesDiffLoadingTitle: "Reading changes…",
  changesDiffErrorTitle: "Couldn't read this file's changes",
  changesDiffRetry: "Try again",
  changesSearchDiffPlaceholder: "Search in diff",
  changesSearchDiffAriaLabel: "Search in the selected file's changes",
  changesDiffBinaryTitle: "This file can't be shown as text",
  changesDiffBinaryDescription: "It changed, but its contents aren't text.",
  changesImageLoading: "Opening the image…",
  changesImageError: "Couldn't open this image.",
  changesImageUnavailable: "There's no version of this image to show.",
  changesImageBefore: "Before",
  changesImageAfter: "After",
  changesImageAdded: "Added",
  changesImageRemoved: "Removed",
  changesImageBeforeAlt: (path) => `${path} before this change`,
  changesImageAfterAlt: (path) => `${path} after this change`,
  changesImageTooLarge: (limit) => `This image is over ${limit}, too large to show here, but the file itself is fine.`,
  changesImageUnsupported: "This version isn't an image GitOdile can show.",
  changesImageComparisonLabel: "How to compare",
  changesImageModeSideBySide: "Side by side",
  changesImageModeSwipe: "Swipe",
  changesImageModeFade: "Fade",
  changesImageSwipePosition: "Move the divider",
  changesImageFadeAmount: "Fade between the two versions",
  changesImageSameSize: "same size",
  changesImageLarger: (amount) => `${amount} larger`,
  changesImageSmaller: (amount) => `${amount} smaller`,
  changesSvgViewLabel: "How to show this file",
  changesSvgDrawing: "Drawing",
  changesSvgSource: "Source",
  changesDiffTooLargeTitle: "Too many changes to show here",
  changesDiffTooLargeDescription: (limit) => `This file's changes are over ${limit}, the limit for showing them here, but the file itself is fine.`,
  changesDiffWhitespaceOnlyTitle: "Only spacing changed",
  changesDiffWhitespaceOnlyDescription: "Spacing changes are hidden, and you can show them in Settings.",
  changesDiffUnchangedTitle: "No content changed",
  changesDiffUnchangedDescription: "Only the file's name or permissions changed.",
  changesDiffConflictTitle: "This file needs your attention",
  changesDiffConflictDescription: "These are the conflict markers as they are now, since resolving conflicts here isn't supported yet.",
  changesDiffConflictUnavailable: "Couldn't read this file's conflict markers.",
  changesDiffConflictBinary: "This file isn't text, so its conflict can't be shown.",
  changesDiffConflictTooLarge: "This conflict is too large to show here.",
  changesDiffAriaLabel: (path) => `Changes in ${path}`,
  changesDiffHiddenLines: (count) => (count === 1 ? "1 unchanged line" : `${count} unchanged lines`),
  changesDiffShowHiddenLines: (count) =>
    count === 1 ? "Show 1 unchanged line" : `Show ${count} unchanged lines`,
  changesDiffExpandFailed: "Couldn't read those lines.",
  changesDiffTruncatedNote: (shownLines) => `Showing the first ${shownLines} lines.`,
  changesLineAddedLabel: "Added:",
  changesLineRemovedLabel: "Removed:",
  changesSearchPlaceholder: "Search changes",
  changesSearchAriaLabel: "Search changed files",
  changesNoSearchMatches: "No changed file matches your search.",
  changesNoFilterMatches: "No changed file matches these filters.",
  changesFiltersLabel: "Filters",
  changesFiltersActive: (count) => `Filters (${count} on)`,
  changesFiltersActiveCount: (count) => `${count} filter${count === 1 ? "" : "s"} on`,
  changesFiltersClear: "Clear all",
  changesFilterRemove: (label) => `Remove the ${label} filter`,
  changesFilterKindLabel: "Kind of change",
  changesFilterTypeLabel: "File type",
  changesFilterTypeNone: "No extension",
  changesFilterModeLabel: (group) => `Show or hide the chosen ${group.toLocaleLowerCase()}`,
  changesFilterModeOnly: "Show only",
  changesFilterModeHide: "Hide",
  changesFilterHiddenChip: (label) => `Hiding ${label}`,
  changesFilterShowAgain: (label) => `Show ${label} again`,
  // The checkbox on every row, asked as the question it answers. "In the next
  // version" named the subject and left the reader to guess the predicate; this
  // states it, and the two answers are the checkbox's own.
  changesFilterInclusionLabel: "Will be saved",
  changesFilterInclusionAll: "Any",
  changesFilterInclusionIncluded: "Yes",
  changesFilterInclusionExcluded: "No",
  // A chip stands alone in a row of chips, with no group label above it, so it
  // says the whole thing rather than the answer on its own.
  changesFilterInclusionIncludedChip: "Will be saved",
  changesFilterInclusionExcludedChip: "Won't be saved",
  changesFilePosition: (position, total) => `File ${position} of ${total}`,
  changesPreviousFile: "Previous file",
  changesNextFile: "Next file",
  changesViewUnified: "Unified",
  changesViewSplit: "Split",
  changesViewAccessible: "Accessible text",
  changesViewAccessibleAriaLabel: "All changes as accessible text",
  changesViewAriaLabel: "Diff view",
  changesHunkPosition: (position, total) => `Change ${position} of ${total}`,
  changesPreviousHunk: "Previous change",
  changesNextHunk: "Next change",
  changesCheckLocal: "Check local changes",
  changesRefreshFailedTitle: "Couldn't refresh changes",
  changesDiscardingNow: "Discarding…",
  changesSaveVersionNoSelectionHint: "Choose at least one file to save.",
  changesQuickCommitFiles: (saved, total) =>
    saved === total ? (total === 1 ? "1 file" : `${total} files`) : `${saved} of ${total} files`,
  changesQuickCommitSaving: "Saving…",

  changesSelectAll: "Select all",
  changesSelectNone: "Select none",
  changesIncludeFile: (path) => `Include ${path} in this version`,
  changesIncludeFolder: (path) => `Include everything in ${path} in this version`,
  changesFolderLabel: (path, count) => `${path} folder, ${count} file${count === 1 ? "" : "s"}`,
  changesFileViewFolders: "Show files in folders",
  changesFileViewShowList: "Showing folders · show as a list",
  changesFileViewShowFolders: "Showing a list · show in folders",
  changesPartialUnavailableTruncated: "Too many changed files to choose from, so save them all at once.",
  changesProjectRoot: "Project root",
  changesMoreActions: "Discard or restore changes",
  changesContextMenuLabel: "Context actions",
  changesCopy: "Copy",
  changesCopyPath: "Copy path",
  // "Folder", not "File Explorer" or "Finder": one wording for three operating
  // systems, in the word this app already uses for where a project lives.
  changesRevealInFolder: "Show in folder",
  changesRevealFailed: "Couldn't show that file.",
  changesCopied: "Copied.",
  changesCopyFailed: "Couldn't copy. Use Ctrl+C or Cmd+C instead.",
  changesDiscardFileContext: "Discard changes…",
  changesDiscardSelected: "Discard this file's changes…",
  changesDiscardAll: "Discard all changes…",
  changesRestoreDiscarded: "Restore discarded changes…",
  changesDiscardFileTitle: "Discard this file's changes?",
  changesDiscardAllTitle: "Discard all unsaved changes?",
  changesRestoreTitle: "Restore discarded changes",
  changesDiscardDoneTitle: "Changes discarded",
  changesRestoreDoneTitle: "Changes restored",
  changesDiscardFileSummary: (path) => `${path} goes back to its last saved version.`,
  changesDiscardAllSummary: (count) => count === 1 ? "1 file goes back to its last saved version." : `${count} files go back to their last saved version.`,
  changesDiscardPreparedWarning: "Prepared changes are discarded too.",
  changesDiscardUntrackedWarning: "New files are removed.",
  changesDiscardConflictWarning: "Unresolved conflicts go back to the last saved version.",
  changesDiscardRecoveryNote: "GitOdile keeps a copy on this computer, so you can undo this.",
  changesDiscardConfirmFile: "Discard changes",
  changesDiscardConfirmAll: "Discard all",
  changesRestoreConfirm: "Restore",
  changesDiscardSuccess: (count) => count === 1 ? "1 file is back to its last saved version." : `${count} files are back to their last saved version.`,
  changesRestoreSuccess: (count) => count === 1 ? "1 file restored." : `${count} files restored.`,
  changesUndoDiscard: "Undo discard",
  changesDiscardLoading: "Checking what will change…",
  changesRestoreLoading: "Looking for discarded changes…",
  changesRestoreSummary: (count) => count === 1 ? "Restoring 1 file…" : `Restoring ${count} files…`,
  changesRestoreChooseLabel: "Discarded changes",
  changesRestoreChooseIntro: "Choose what to restore.",
  changesRestoreEmpty: "There's nothing to restore.",
  changesRestoreEntryPaths: (count) => count === 1 ? "1 file" : `${count} files`,
  changesRestoreEntryMore: (preview, hidden) => `${preview} and ${hidden} more`,
  changesRestoreUnavailableSuperseded: "A file changed since, so restoring would overwrite newer work.",
  changesRestoreUnavailableIncomplete: "This discard didn't finish, so it can't be restored.",
  changesRestoreUnavailableToggle: (count) =>
    count === 1 ? "1 more can't be restored now" : `${count} more can't be restored now`,
  changesRestoreNoneAvailable: "Nothing can be restored now: every copy has a file that changed since.",
  changesRestorePreparedNote: "Restores the files and leaves prepared changes as they are.",
  changesRestoreForget: "Delete this copy",
  changesRestoreForgetTitle: "Delete this copy?",
  changesRestoreForgetWarning: (count) =>
    count === 1
      ? " Its file can't be restored afterwards."
      : ` Its ${count} files can't be restored afterwards.`,
  changesRestoreForgetConfirm: "Delete copy",
  changesRestoreForgetCancel: "Keep it",
  changesDiscardUnavailable: "This is no longer available. Check local changes and retry.",
};

const es: ChangesTranslations = {
  changesSummaryClean: "Todos los cambios están guardados.",
  changesEmptySavedTitle: "Todos los cambios están guardados",
  changesEmptyAheadDescription: (count) =>
    count === 1
      ? "1 versión guardada solo está en este ordenador. Publícala para compartirla."
      : `${count} versiones guardadas solo están en este ordenador. Publícalas para compartirlas.`,
  changesEmptyPublish: (count) => (count === 1 ? "Publicar 1 versión" : `Publicar ${count} versiones`),
  changesEmptyBehindDescription: (count) =>
    count === 1
      ? "Hay 1 versión nueva en el remoto."
      : `Hay ${count} versiones nuevas en el remoto.`,
  changesEmptyGetChanges: "Traer cambios del proyecto",
  changesEmptyViewHistory: "Ver historial",
  changesEmptyUpToDateTitle: "Todo al día",
  changesEmptyUpToDateDescription: "Todo está guardado y publicado.",
  changesEmptyNoRemoteTitle: "Todo está guardado en este ordenador",
  changesEmptyNoRemoteDescription: "Añade un remoto en los ajustes del proyecto cuando quieras compartir tu trabajo.",
  changesEmptyOpenSettings: "Abrir ajustes del proyecto",
  changesEmptyUnbornTitle: "Aún no hay versiones guardadas",
  changesEmptyUnbornDescription: "Tu primera versión guardada inicia el historial del proyecto.",
  changesEmptyDetachedTitle: "Estás viendo una versión antigua",
  changesEmptyDetachedDescription: "Es un punto del historial, no una línea de versión. Vuelve a una línea para seguir trabajando.",
  changesBackToList: "Volver a la lista de archivos",
  changesListAriaLabel: "Archivos con cambios",
  changesCategoryLabelChanged: "Editado",
  changesCategoryLabelNew: "Nuevo",
  changesCategoryLabelDeleted: "Eliminado",
  changesCategoryLabelRenamed: "Renombrado",
  changesCategoryLabelConflicted: "Necesita atención",
  changesRenamedFrom: (original) => `Renombrado desde ${original}`,
  changesSelectionAnnouncement: (path) => `Mostrando los cambios de ${path}.`,
  changesDiffLoadingTitle: "Leyendo los cambios…",
  changesDiffErrorTitle: "No se pudieron leer los cambios de este archivo",
  changesDiffRetry: "Reintentar",
  changesSearchDiffPlaceholder: "Buscar en los cambios",
  changesSearchDiffAriaLabel: "Buscar en los cambios del archivo seleccionado",
  changesDiffBinaryTitle: "Este archivo no se puede mostrar como texto",
  changesDiffBinaryDescription: "Ha cambiado, pero su contenido no es texto.",
  changesImageLoading: "Abriendo la imagen…",
  changesImageError: "No se pudo abrir esta imagen.",
  changesImageUnavailable: "No hay ninguna versión de esta imagen que mostrar.",
  changesImageBefore: "Antes",
  changesImageAfter: "Después",
  changesImageAdded: "Añadida",
  changesImageRemoved: "Eliminada",
  changesImageBeforeAlt: (path) => `${path} antes de este cambio`,
  changesImageAfterAlt: (path) => `${path} después de este cambio`,
  changesImageTooLarge: (limit) => `Esta imagen supera ${limit}, demasiado para mostrarla aquí, pero el archivo no se ve afectado.`,
  changesImageUnsupported: "Esta versión no es una imagen que GitOdile pueda mostrar.",
  changesImageComparisonLabel: "Cómo comparar",
  changesImageModeSideBySide: "Lado a lado",
  changesImageModeSwipe: "Cortinilla",
  changesImageModeFade: "Fundido",
  changesImageSwipePosition: "Mueve la divisoria",
  changesImageFadeAmount: "Funde entre las dos versiones",
  changesImageSameSize: "mismo tamaño",
  changesImageLarger: (amount) => `${amount} más`,
  changesImageSmaller: (amount) => `${amount} menos`,
  changesSvgViewLabel: "Cómo mostrar este archivo",
  changesSvgDrawing: "Dibujo",
  changesSvgSource: "Código",
  changesDiffTooLargeTitle: "Demasiados cambios para mostrarlos aquí",
  changesDiffTooLargeDescription: (limit) => `Los cambios de este archivo superan ${limit}, el límite para mostrarlos aquí, pero el archivo no se ve afectado.`,
  changesDiffWhitespaceOnlyTitle: "Solo cambió el espaciado",
  changesDiffWhitespaceOnlyDescription: "Los cambios de espaciado están ocultos y puedes mostrarlos en Ajustes.",
  changesDiffUnchangedTitle: "El contenido no ha cambiado",
  changesDiffUnchangedDescription: "Solo cambió el nombre o los permisos del archivo.",
  changesDiffConflictTitle: "Este archivo necesita tu atención",
  changesDiffConflictDescription: "Estas son las marcas de conflicto tal como están, porque aún no se pueden resolver conflictos aquí.",
  changesDiffConflictUnavailable: "No se pudieron leer las marcas de conflicto de este archivo.",
  changesDiffConflictBinary: "Este archivo no es texto, así que no se puede mostrar su conflicto.",
  changesDiffConflictTooLarge: "Este conflicto es demasiado grande para mostrarlo aquí.",
  changesDiffAriaLabel: (path) => `Cambios de ${path}`,
  changesDiffHiddenLines: (count) => (count === 1 ? "1 línea sin cambios" : `${count} líneas sin cambios`),
  changesDiffShowHiddenLines: (count) =>
    count === 1 ? "Mostrar 1 línea sin cambios" : `Mostrar ${count} líneas sin cambios`,
  changesDiffExpandFailed: "No se pudieron leer esas líneas.",
  changesDiffTruncatedNote: (shownLines) => `Se muestran las primeras ${shownLines} líneas.`,
  changesLineAddedLabel: "Añadida:",
  changesLineRemovedLabel: "Eliminada:",
  changesSearchPlaceholder: "Buscar cambios",
  changesSearchAriaLabel: "Buscar archivos con cambios",
  changesNoSearchMatches: "Ningún archivo con cambios coincide con tu búsqueda.",
  changesNoFilterMatches: "Ningún archivo con cambios coincide con estos filtros.",
  changesFiltersLabel: "Filtros",
  changesFiltersActive: (count) => `Filtros (${count} activo${count === 1 ? "" : "s"})`,
  changesFiltersActiveCount: (count) => `${count} filtro${count === 1 ? "" : "s"} activo${count === 1 ? "" : "s"}`,
  changesFiltersClear: "Quitar todos",
  changesFilterRemove: (label) => `Quitar el filtro ${label}`,
  changesFilterKindLabel: "Tipo de cambio",
  changesFilterTypeLabel: "Tipo de archivo",
  changesFilterTypeNone: "Sin extensión",
  changesFilterModeLabel: (group) => `Mostrar u ocultar lo elegido en ${group.toLocaleLowerCase()}`,
  changesFilterModeOnly: "Mostrar solo",
  changesFilterModeHide: "Ocultar",
  changesFilterHiddenChip: (label) => `Ocultando ${label}`,
  changesFilterShowAgain: (label) => `Volver a mostrar ${label}`,
  changesFilterInclusionLabel: "Se guardará",
  changesFilterInclusionAll: "Cualquiera",
  changesFilterInclusionIncluded: "Sí",
  changesFilterInclusionExcluded: "No",
  changesFilterInclusionIncludedChip: "Se guardará",
  changesFilterInclusionExcludedChip: "No se guardará",
  changesFilePosition: (position, total) => `Archivo ${position} de ${total}`,
  changesPreviousFile: "Archivo anterior",
  changesNextFile: "Archivo siguiente",
  changesViewUnified: "Unificada",
  changesViewSplit: "Dividida",
  changesViewAccessible: "Texto accesible",
  changesViewAccessibleAriaLabel: "Todos los cambios como texto accesible",
  changesViewAriaLabel: "Vista de los cambios",
  changesHunkPosition: (position, total) => `Cambio ${position} de ${total}`,
  changesPreviousHunk: "Cambio anterior",
  changesNextHunk: "Cambio siguiente",
  changesCheckLocal: "Comprobar cambios locales",
  changesRefreshFailedTitle: "No se pudieron actualizar los cambios",
  changesDiscardingNow: "Descartando…",
  changesSaveVersionNoSelectionHint: "Elige al menos un archivo para guardar.",
  changesQuickCommitFiles: (saved, total) =>
    saved === total ? (total === 1 ? "1 archivo" : `${total} archivos`) : `${saved} de ${total} archivos`,
  changesQuickCommitSaving: "Guardando…",

  changesSelectAll: "Seleccionar todo",
  changesSelectNone: "No seleccionar ninguno",
  changesIncludeFile: (path) => `Incluir ${path} en esta versión`,
  changesIncludeFolder: (path) => `Incluir todo lo de ${path} en esta versión`,
  changesFolderLabel: (path, count) => `Carpeta ${path}, ${count} archivo${count === 1 ? "" : "s"}`,
  changesFileViewFolders: "Ver archivos por carpetas",
  changesFileViewShowList: "Viendo por carpetas · ver en lista",
  changesFileViewShowFolders: "Viendo en lista · ver por carpetas",
  changesPartialUnavailableTruncated: "Hay demasiados archivos cambiados para elegir, así que guárdalos todos a la vez.",
  changesProjectRoot: "Raíz del proyecto",
  changesMoreActions: "Descartar o restaurar cambios",
  changesContextMenuLabel: "Acciones contextuales",
  changesCopy: "Copiar",
  changesCopyPath: "Copiar ruta",
  changesRevealInFolder: "Mostrar en la carpeta",
  changesRevealFailed: "No se pudo mostrar el archivo.",
  changesCopied: "Copiado.",
  changesCopyFailed: "No se pudo copiar. Usa Ctrl+C o Cmd+C.",
  changesDiscardFileContext: "Descartar cambios…",
  changesDiscardSelected: "Descartar los cambios de este archivo…",
  changesDiscardAll: "Descartar todos los cambios…",
  changesRestoreDiscarded: "Restaurar cambios descartados…",
  changesDiscardFileTitle: "¿Descartar los cambios de este archivo?",
  changesDiscardAllTitle: "¿Descartar todos los cambios sin guardar?",
  changesRestoreTitle: "Restaurar cambios descartados",
  changesDiscardDoneTitle: "Cambios descartados",
  changesRestoreDoneTitle: "Cambios restaurados",
  changesDiscardFileSummary: (path) => `${path} vuelve a su última versión guardada.`,
  changesDiscardAllSummary: (count) => count === 1 ? "1 archivo vuelve a su última versión guardada." : `${count} archivos vuelven a su última versión guardada.`,
  changesDiscardPreparedWarning: "Los cambios preparados también se descartan.",
  changesDiscardUntrackedWarning: "Los archivos nuevos se eliminan.",
  changesDiscardConflictWarning: "Los conflictos sin resolver vuelven a la última versión guardada.",
  changesDiscardRecoveryNote: "GitOdile guarda una copia en este ordenador para que puedas deshacerlo.",
  changesDiscardConfirmFile: "Descartar cambios",
  changesDiscardConfirmAll: "Descartar todo",
  changesRestoreConfirm: "Restaurar",
  changesDiscardSuccess: (count) => count === 1 ? "1 archivo ha vuelto a su última versión guardada." : `${count} archivos han vuelto a su última versión guardada.`,
  changesRestoreSuccess: (count) => count === 1 ? "1 archivo restaurado." : `${count} archivos restaurados.`,
  changesUndoDiscard: "Deshacer descarte",
  changesDiscardLoading: "Comprobando qué va a cambiar…",
  changesRestoreLoading: "Buscando cambios descartados…",
  changesRestoreSummary: (count) => count === 1 ? "Restaurando 1 archivo…" : `Restaurando ${count} archivos…`,
  changesRestoreChooseLabel: "Cambios descartados",
  changesRestoreChooseIntro: "Elige qué restaurar.",
  changesRestoreEmpty: "No hay nada que restaurar.",
  changesRestoreEntryPaths: (count) => count === 1 ? "1 archivo" : `${count} archivos`,
  changesRestoreEntryMore: (preview, hidden) => `${preview} y ${hidden} más`,
  changesRestoreUnavailableSuperseded: "Un archivo ha cambiado después, así que restaurarlo sobrescribiría trabajo más nuevo.",
  changesRestoreUnavailableIncomplete: "Este descarte no llegó a terminar, así que no se puede restaurar.",
  changesRestoreUnavailableToggle: (count) =>
    count === 1 ? "1 más no se puede restaurar ahora" : `${count} más no se pueden restaurar ahora`,
  changesRestoreNoneAvailable: "Ahora no se puede restaurar nada: cada copia tiene un archivo que ha cambiado después.",
  changesRestorePreparedNote: "Restaura los archivos y deja los cambios preparados como están.",
  changesRestoreForget: "Eliminar esta copia",
  changesRestoreForgetTitle: "¿Eliminar esta copia?",
  changesRestoreForgetWarning: (count) =>
    count === 1
      ? " Su archivo no se podrá restaurar después."
      : ` Sus ${count} archivos no se podrán restaurar después.`,
  changesRestoreForgetConfirm: "Eliminar copia",
  changesRestoreForgetCancel: "Conservarla",
  changesDiscardUnavailable: "Ya no está disponible. Comprueba los cambios locales y reintenta.",
};

export const changesTranslations = { en, es } as const;
