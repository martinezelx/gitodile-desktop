export interface ChangesTranslations {
  changesHeading: string;
  changesSummaryClean: string;
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
  changesLinesAddedTotal: (count: number) => string;
  changesLinesRemovedTotal: (count: number) => string;
  changesLinesAddedTotalAriaLabel: (count: number) => string;
  changesLinesRemovedTotalAriaLabel: (count: number) => string;
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
  changesQuickCommitDismiss: string;
  /** The quick commit box's one-line plan: what a save would take, as a
   * count, and "of N" only when the selection leaves files behind. */
  changesQuickPlanFiles: (total: number, remaining: number) => string;
  /** The heading's miniature of the Overview band, for the screen reader. */
  changesJourneyNextStep: (step: string) => string;
  changesJourneyAllDone: string;
  changesJourneyOpenOverview: string;
  changesSelectionSummary: (selected: number, total: number) => string;
  changesSelectAll: string;
  changesSelectNone: string;
  changesIncludeFile: (path: string) => string;
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
  changesHeading: "Changes",
  changesSummaryClean: "Everything is saved. There is nothing to review.",
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
  changesDiffBinaryDescription: "GitOdile can tell this file changed, but its contents aren’t readable as text.",
  changesImageLoading: "Opening the picture…",
  changesImageError: "GitOdile couldn’t open this picture.",
  changesImageUnavailable: "There is no version of this picture to show.",
  changesImageBefore: "Before",
  changesImageAfter: "After",
  changesImageAdded: "Added",
  changesImageRemoved: "Removed",
  changesImageBeforeAlt: (path) => `${path} before this change`,
  changesImageAfterAlt: (path) => `${path} after this change`,
  changesImageTooLarge: (limit) =>
    `This version is larger than ${limit}, GitOdile’s limit for showing pictures here. The file itself is unaffected.`,
  changesImageUnsupported: "This version isn’t a picture GitOdile can draw.",
  changesImageComparisonLabel: "How to compare",
  changesImageModeSideBySide: "Side by side",
  changesImageModeSwipe: "Swipe",
  changesImageModeFade: "Fade",
  changesImageSwipePosition: "Move the divider",
  changesImageFadeAmount: "Fade between the two versions",
  changesImageSameSize: "same size",
  changesImageLarger: (amount) => `${amount} larger`,
  changesImageSmaller: (amount) => `${amount} smaller`,
  changesSvgViewLabel: "How to read this file",
  changesSvgDrawing: "Drawing",
  changesSvgSource: "Source",
  changesDiffTooLargeTitle: "This difference is too large to show here",
  changesDiffTooLargeDescription: (limit) =>
    `This file’s difference is larger than ${limit}, GitOdile’s safety limit for reviewing changes here. The file itself is unaffected.`,
  changesDiffWhitespaceOnlyTitle: "Only spacing changed",
  changesDiffWhitespaceOnlyDescription:
    "Every change in this file is whitespace, and you asked for those to be ignored. Turn that off in Settings to see them.",
  changesDiffUnchangedTitle: "No content changed",
  changesDiffUnchangedDescription: "Only the file’s name or permissions changed. There is no text difference to show.",
  changesDiffConflictTitle: "This file needs your attention",
  changesDiffConflictDescription:
    "GitOdile is showing the current conflict markers for information only. Resolving conflicts isn’t supported here yet.",
  changesDiffConflictUnavailable: "GitOdile couldn’t read the current conflict markers for this file.",
  changesDiffConflictBinary: "This file’s contents aren’t readable as text, so its conflict markers can’t be shown.",
  changesDiffConflictTooLarge: "The conflict is too large to preview safely here.",
  changesDiffAriaLabel: (path) => `Difference for ${path}`,
  changesDiffHiddenLines: (count) => (count === 1 ? "1 unchanged line" : `${count} unchanged lines`),
  changesDiffShowHiddenLines: (count) =>
    count === 1 ? "Show 1 unchanged line" : `Show ${count} unchanged lines`,
  changesDiffExpandFailed: "Couldn’t read those lines.",
  changesDiffTruncatedNote: (shownLines) => `Showing the first ${shownLines} lines of this difference.`,
  changesLineAddedLabel: "Added:",
  changesLineRemovedLabel: "Removed:",
  changesLinesAddedTotal: (count) => `+${count}`,
  changesLinesRemovedTotal: (count) => `−${count}`,
  changesLinesAddedTotalAriaLabel: (count) => (count === 1 ? "1 line added" : `${count} lines added`),
  changesLinesRemovedTotalAriaLabel: (count) => (count === 1 ? "1 line removed" : `${count} lines removed`),
  changesSearchPlaceholder: "Search files…",
  changesSearchAriaLabel: "Search changed files",
  changesNoSearchMatches: "No changed file matches your search.",
  changesNoFilterMatches: "No changed file matches what you are looking for.",
  changesFiltersLabel: "Filters",
  changesFiltersActive: (count) => `Filters (${count} on)`,
  changesFiltersActiveCount: (count) => `${count} filter${count === 1 ? "" : "s"} active`,
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
  changesViewAccessibleAriaLabel: "Complete difference as accessible text",
  changesViewAriaLabel: "Difference view",
  changesHunkPosition: (position, total) => `Change ${position} of ${total}`,
  changesPreviousHunk: "Previous change",
  changesNextHunk: "Next change",
  changesCheckLocal: "Check local changes",
  changesRefreshFailedTitle: "Changes couldn’t be refreshed",
  changesDiscardingNow: "Discarding…",
  changesSaveVersionNoSelectionHint: "Choose at least one file to save.",
  changesQuickCommitDismiss: "Discard draft",
  changesQuickPlanFiles: (total, remaining) =>
    remaining > 0
      ? `${total} of ${total + remaining} files`
      : total === 1
        ? "1 file"
        : `${total} files`,
  changesJourneyNextStep: (step) => `Next step: ${step}.`,
  changesJourneyAllDone: "Everything is saved and published.",
  changesJourneyOpenOverview: "Open Overview",
  changesSelectionSummary: (selected, total) => `${selected} of ${total} selected`,
  changesSelectAll: "Select all",
  changesSelectNone: "Select none",
  changesIncludeFile: (path) => `Include ${path} in this version`,
  changesPartialUnavailableTruncated:
    "This project has more changed files than can be listed safely. Save all changes before using file selection.",
  changesProjectRoot: "Project root",
  changesMoreActions: "Discard or restore changes",
  changesContextMenuLabel: "Context actions",
  changesCopy: "Copy",
  changesCopyPath: "Copy path",
  // "Folder", not "File Explorer" or "Finder": one wording for three operating
  // systems, in the word this app already uses for where a project lives.
  changesRevealInFolder: "Show in folder",
  changesRevealFailed: "That file couldn't be shown.",
  changesCopied: "Selected text copied.",
  changesCopyFailed: "Couldn’t copy the selected text. Use Ctrl+C or Cmd+C instead.",
  changesDiscardFileContext: "Discard changes…",
  changesDiscardSelected: "Discard this file’s changes…",
  changesDiscardAll: "Discard all changes…",
  changesRestoreDiscarded: "Restore discarded changes…",
  changesDiscardFileTitle: "Discard this file’s changes?",
  changesDiscardAllTitle: "Discard all unsaved changes?",
  changesRestoreTitle: "Restore discarded changes",
  changesDiscardDoneTitle: "Changes discarded",
  changesRestoreDoneTitle: "Changes restored",
  changesDiscardFileSummary: (path) => `${path} goes back to its last saved version.`,
  changesDiscardAllSummary: (count) => count === 1 ? "1 changed file goes back to its last saved version." : `${count} changed files go back to their last saved version.`,
  changesDiscardPreparedWarning: "Prepared changes are replaced too.",
  changesDiscardUntrackedWarning: "New files leave the project.",
  changesDiscardConflictWarning: "Unresolved conflicts are replaced by the last saved version.",
  changesDiscardRecoveryNote: "GitOdile keeps a copy on this computer first, so you can undo it.",
  changesDiscardConfirmFile: "Discard these changes",
  changesDiscardConfirmAll: "Discard all changes",
  changesRestoreConfirm: "Restore these changes",
  changesDiscardSuccess: (count) => count === 1 ? "1 file went back to its last saved version." : `${count} files went back to their last saved version.`,
  changesRestoreSuccess: (count) => count === 1 ? "1 file is back where it was." : `${count} files are back where they were.`,
  changesUndoDiscard: "Undo discard",
  changesDiscardLoading: "Checking what will change…",
  changesRestoreLoading: "Looking for discarded changes…",
  changesRestoreSummary: (count) => count === 1 ? "Bringing back 1 file…" : `Bringing back ${count} files…`,
  changesRestoreChooseLabel: "Discarded changes",
  changesRestoreChooseIntro: "Choose what to bring back.",
  changesRestoreEmpty: "There are no stored copies to bring back.",
  changesRestoreEntryPaths: (count) => count === 1 ? "1 file" : `${count} files`,
  changesRestoreEntryMore: (preview, hidden) => `${preview} and ${hidden} more`,
  changesRestoreUnavailableSuperseded: "One of these files changed after this discard, so restoring it would overwrite newer work.",
  changesRestoreUnavailableIncomplete: "This discard didn’t finish, so it can’t be restored automatically.",
  changesRestoreUnavailableToggle: (count) =>
    count === 1 ? "1 more can’t be restored right now" : `${count} more can’t be restored right now`,
  changesRestoreNoneAvailable: "None can be restored right now: each names a file that changed afterwards.",
  changesRestorePreparedNote: "Brings the files back. Prepared changes stay as they are.",
  changesRestoreForget: "Delete this copy",
  changesRestoreForgetTitle: "Delete this copy?",
  changesRestoreForgetWarning: (count) =>
    count === 1
      ? " The file it holds can’t be brought back afterwards."
      : ` The ${count} files it holds can’t be brought back afterwards.`,
  changesRestoreForgetConfirm: "Delete copy",
  changesRestoreForgetCancel: "Keep it",
  changesDiscardUnavailable: "This action is no longer available. Check local changes and try again.",
};

const es: ChangesTranslations = {
  changesHeading: "Cambios",
  changesSummaryClean: "Todo está guardado. No hay nada que revisar.",
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
  changesDiffBinaryDescription: "GitOdile detecta que este archivo cambió, pero su contenido no es legible como texto.",
  changesImageLoading: "Abriendo la imagen…",
  changesImageError: "GitOdile no pudo abrir esta imagen.",
  changesImageUnavailable: "No hay ninguna versión de esta imagen que mostrar.",
  changesImageBefore: "Antes",
  changesImageAfter: "Después",
  changesImageAdded: "Añadida",
  changesImageRemoved: "Eliminada",
  changesImageBeforeAlt: (path) => `${path} antes de este cambio`,
  changesImageAfterAlt: (path) => `${path} después de este cambio`,
  changesImageTooLarge: (limit) =>
    `Esta versión supera ${limit}, el límite de GitOdile para mostrar imágenes aquí. El archivo no se ve afectado.`,
  changesImageUnsupported: "Esta versión no es una imagen que GitOdile pueda dibujar.",
  changesImageComparisonLabel: "Cómo comparar",
  changesImageModeSideBySide: "Lado a lado",
  changesImageModeSwipe: "Cortinilla",
  changesImageModeFade: "Fundido",
  changesImageSwipePosition: "Mueve la divisoria",
  changesImageFadeAmount: "Funde entre las dos versiones",
  changesImageSameSize: "mismo tamaño",
  changesImageLarger: (amount) => `${amount} más`,
  changesImageSmaller: (amount) => `${amount} menos`,
  changesSvgViewLabel: "Cómo leer este archivo",
  changesSvgDrawing: "Dibujo",
  changesSvgSource: "Código",
  changesDiffTooLargeTitle: "Esta diferencia es demasiado grande para mostrarla aquí",
  changesDiffTooLargeDescription: (limit) =>
    `La diferencia de este archivo supera ${limit}, el límite de seguridad de GitOdile para revisar cambios aquí. El archivo en sí no se ve afectado.`,
  changesDiffWhitespaceOnlyTitle: "Solo cambió el espaciado",
  changesDiffWhitespaceOnlyDescription:
    "Todos los cambios de este archivo son espacios en blanco, y pediste ignorarlos. Desactiva esa opción en Ajustes para verlos.",
  changesDiffUnchangedTitle: "No hay cambios de contenido",
  changesDiffUnchangedDescription: "Solo cambió el nombre o los permisos del archivo. No hay diferencia de texto que mostrar.",
  changesDiffConflictTitle: "Este archivo necesita tu atención",
  changesDiffConflictDescription:
    "GitOdile muestra las marcas de conflicto actuales solo a título informativo. Resolver conflictos aún no está disponible aquí.",
  changesDiffConflictUnavailable: "GitOdile no pudo leer las marcas de conflicto actuales de este archivo.",
  changesDiffConflictBinary: "El contenido de este archivo no es legible como texto, así que sus marcas de conflicto no se pueden mostrar.",
  changesDiffConflictTooLarge: "El conflicto es demasiado grande para previsualizarlo aquí de forma segura.",
  changesDiffAriaLabel: (path) => `Diferencia de ${path}`,
  changesDiffHiddenLines: (count) => (count === 1 ? "1 línea sin cambios" : `${count} líneas sin cambios`),
  changesDiffShowHiddenLines: (count) =>
    count === 1 ? "Mostrar 1 línea sin cambios" : `Mostrar ${count} líneas sin cambios`,
  changesDiffExpandFailed: "No pudimos leer esas líneas.",
  changesDiffTruncatedNote: (shownLines) => `Mostrando las primeras ${shownLines} líneas de esta diferencia.`,
  changesLineAddedLabel: "Añadida:",
  changesLineRemovedLabel: "Eliminada:",
  changesLinesAddedTotal: (count) => `+${count}`,
  changesLinesRemovedTotal: (count) => `−${count}`,
  changesLinesAddedTotalAriaLabel: (count) => (count === 1 ? "1 línea añadida" : `${count} líneas añadidas`),
  changesLinesRemovedTotalAriaLabel: (count) => (count === 1 ? "1 línea eliminada" : `${count} líneas eliminadas`),
  changesSearchPlaceholder: "Buscar archivos…",
  changesSearchAriaLabel: "Buscar archivos con cambios",
  changesNoSearchMatches: "Ningún archivo con cambios coincide con tu búsqueda.",
  changesNoFilterMatches: "Ningún archivo con cambios coincide con lo que buscas.",
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
  changesViewAccessibleAriaLabel: "Diferencia completa como texto accesible",
  changesViewAriaLabel: "Vista de la diferencia",
  changesHunkPosition: (position, total) => `Cambio ${position} de ${total}`,
  changesPreviousHunk: "Cambio anterior",
  changesNextHunk: "Cambio siguiente",
  changesCheckLocal: "Comprobar cambios locales",
  changesRefreshFailedTitle: "No se pudieron actualizar los cambios",
  changesDiscardingNow: "Descartando…",
  changesSaveVersionNoSelectionHint: "Elige al menos un archivo para guardar.",
  changesQuickCommitDismiss: "Descartar borrador",
  changesQuickPlanFiles: (total, remaining) =>
    remaining > 0
      ? `${total} de ${total + remaining} archivos`
      : total === 1
        ? "1 archivo"
        : `${total} archivos`,
  changesJourneyNextStep: (step) => `Siguiente paso: ${step}.`,
  changesJourneyAllDone: "Todo está guardado y publicado.",
  changesJourneyOpenOverview: "Abrir Resumen",
  changesSelectionSummary: (selected, total) =>
    selected === 1 ? `${selected} de ${total} seleccionado` : `${selected} de ${total} seleccionados`,
  changesSelectAll: "Seleccionar todo",
  changesSelectNone: "No seleccionar ninguno",
  changesIncludeFile: (path) => `Incluir ${path} en esta versión`,
  changesPartialUnavailableTruncated:
    "Este proyecto tiene más archivos modificados de los que se pueden listar con seguridad. Guarda todos los cambios antes de usar la selección.",
  changesProjectRoot: "Raíz del proyecto",
  changesMoreActions: "Descartar o restaurar cambios",
  changesContextMenuLabel: "Acciones contextuales",
  changesCopy: "Copiar",
  changesCopyPath: "Copiar ruta",
  changesRevealInFolder: "Mostrar en la carpeta",
  changesRevealFailed: "No se pudo mostrar el archivo.",
  changesCopied: "Texto seleccionado copiado.",
  changesCopyFailed: "No se pudo copiar el texto seleccionado. Usa Ctrl+C o Cmd+C en su lugar.",
  changesDiscardFileContext: "Descartar cambios…",
  changesDiscardSelected: "Descartar los cambios de este archivo…",
  changesDiscardAll: "Descartar todos los cambios…",
  changesRestoreDiscarded: "Restaurar cambios descartados…",
  changesDiscardFileTitle: "¿Descartar los cambios de este archivo?",
  changesDiscardAllTitle: "¿Descartar todos los cambios sin guardar?",
  changesRestoreTitle: "Restaurar cambios descartados",
  changesDiscardDoneTitle: "Cambios descartados",
  changesRestoreDoneTitle: "Cambios restaurados",
  changesDiscardFileSummary: (path) => `${path} volverá a su última versión guardada.`,
  changesDiscardAllSummary: (count) => count === 1 ? "1 archivo modificado volverá a su última versión guardada." : `${count} archivos modificados volverán a su última versión guardada.`,
  changesDiscardPreparedWarning: "Los cambios preparados también se reemplazan.",
  changesDiscardUntrackedWarning: "Los archivos nuevos salen del proyecto.",
  changesDiscardConflictWarning: "Los conflictos sin resolver se reemplazan por la última versión guardada.",
  changesDiscardRecoveryNote: "GitOdile guarda antes una copia en este equipo, para que puedas deshacerlo.",
  changesDiscardConfirmFile: "Descartar estos cambios",
  changesDiscardConfirmAll: "Descartar todos los cambios",
  changesRestoreConfirm: "Restaurar estos cambios",
  changesDiscardSuccess: (count) => count === 1 ? "1 archivo volvió a su última versión guardada." : `${count} archivos volvieron a su última versión guardada.`,
  changesRestoreSuccess: (count) => count === 1 ? "1 archivo ha vuelto a donde estaba." : `${count} archivos han vuelto a donde estaban.`,
  changesUndoDiscard: "Deshacer descarte",
  changesDiscardLoading: "Comprobando qué va a cambiar…",
  changesRestoreLoading: "Buscando cambios descartados…",
  changesRestoreSummary: (count) => count === 1 ? "Recuperando 1 archivo…" : `Recuperando ${count} archivos…`,
  changesRestoreChooseLabel: "Cambios descartados",
  changesRestoreChooseIntro: "Elige qué quieres recuperar.",
  changesRestoreEmpty: "No hay copias guardadas que recuperar.",
  changesRestoreEntryPaths: (count) => count === 1 ? "1 archivo" : `${count} archivos`,
  changesRestoreEntryMore: (preview, hidden) => `${preview} y ${hidden} más`,
  changesRestoreUnavailableSuperseded: "Uno de estos archivos cambió después del descarte, así que restaurarlo sobrescribiría trabajo más nuevo.",
  changesRestoreUnavailableIncomplete: "Este descarte no llegó a terminar, así que no se puede restaurar automáticamente.",
  changesRestoreUnavailableToggle: (count) =>
    count === 1 ? "1 más no se puede restaurar ahora" : `${count} más no se pueden restaurar ahora`,
  changesRestoreNoneAvailable: "Ninguno se puede restaurar ahora: todos nombran un archivo que cambió después.",
  changesRestorePreparedNote: "Recupera los archivos. Los cambios preparados se quedan como están.",
  changesRestoreForget: "Eliminar esta copia",
  changesRestoreForgetTitle: "¿Eliminar esta copia?",
  changesRestoreForgetWarning: (count) =>
    count === 1
      ? " El archivo que guarda no se podrá recuperar después."
      : ` Los ${count} archivos que guarda no se podrán recuperar después.`,
  changesRestoreForgetConfirm: "Eliminar copia",
  changesRestoreForgetCancel: "Conservarla",
  changesDiscardUnavailable: "Esta acción ya no está disponible. Comprueba los cambios locales e inténtalo de nuevo.",
};

export const changesTranslations = { en, es } as const;
