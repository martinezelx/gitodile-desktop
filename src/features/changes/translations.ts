export interface ChangesTranslations {
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
  changesFilePosition: (position: number, total: number) => string;
  changesPreviousFile: string;
  changesNextFile: string;
  changesViewLabel: string;
  changesViewUnified: string;
  changesViewSplit: string;
  changesViewAccessible: string;
  changesViewAccessibleAriaLabel: string;
  changesViewAriaLabel: string;
  changesHunkPosition: (position: number, total: number) => string;
  changesPreviousHunk: string;
  changesNextHunk: string;
  changesRefresh: string;
  changesSaveSelected: (count: number) => string;
  changesCheckedJustNow: string;
  changesCheckedMinutesAgo: (minutes: number) => string;
  changesCheckedHoursAgo: (hours: number) => string;
  changesCheckedLongAgo: string;
  changesSaveVersion: string;
  changesSaveVersionDisabledHint: string;
  changesSaveVersionNoSelectionHint: string;
  changesSelectionSummary: (selected: number, total: number) => string;
  changesSelectAll: string;
  changesSelectNone: string;
  changesIncludeFile: (path: string) => string;
  changesPartialUnavailableTruncated: string;
  changesProjectRoot: string;
}

const en: ChangesTranslations = {
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
  changesFilePosition: (position, total) => `File ${position} of ${total}`,
  changesPreviousFile: "Previous file",
  changesNextFile: "Next file",
  changesViewLabel: "View:",
  changesViewUnified: "Unified",
  changesViewSplit: "Split",
  changesViewAccessible: "Accessible text",
  changesViewAccessibleAriaLabel: "Complete difference as accessible text",
  changesViewAriaLabel: "Difference view",
  changesHunkPosition: (position, total) => `Change ${position} of ${total}`,
  changesPreviousHunk: "Previous change",
  changesNextHunk: "Next change",
  changesRefresh: "Refresh",
  changesSaveSelected: (count) => `Save selected (${count})`,
  changesCheckedJustNow: "Checked just now",
  changesCheckedMinutesAgo: (minutes) =>
    minutes === 1 ? "Checked 1 minute ago" : `Checked ${minutes} minutes ago`,
  changesCheckedHoursAgo: (hours) => (hours === 1 ? "Checked 1 hour ago" : `Checked ${hours} hours ago`),
  changesCheckedLongAgo: "Checked a while ago",
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
};

const es: ChangesTranslations = {
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
  changesFilePosition: (position, total) => `Archivo ${position} de ${total}`,
  changesPreviousFile: "Archivo anterior",
  changesNextFile: "Archivo siguiente",
  changesViewLabel: "Vista:",
  changesViewUnified: "Unificada",
  changesViewSplit: "Dividida",
  changesViewAccessible: "Texto accesible",
  changesViewAccessibleAriaLabel: "Diferencia completa como texto accesible",
  changesViewAriaLabel: "Vista de la diferencia",
  changesHunkPosition: (position, total) => `Cambio ${position} de ${total}`,
  changesPreviousHunk: "Cambio anterior",
  changesNextHunk: "Cambio siguiente",
  changesRefresh: "Actualizar",
  changesSaveSelected: (count) => `Guardar selección (${count})`,
  changesCheckedJustNow: "Comprobado ahora mismo",
  changesCheckedMinutesAgo: (minutes) =>
    minutes === 1 ? "Comprobado hace 1 minuto" : `Comprobado hace ${minutes} minutos`,
  changesCheckedHoursAgo: (hours) => (hours === 1 ? "Comprobado hace 1 hora" : `Comprobado hace ${hours} horas`),
  changesCheckedLongAgo: "Comprobado hace un rato",
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
};

export const changesTranslations = { en, es } as const;
