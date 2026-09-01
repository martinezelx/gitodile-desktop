export interface StatusTranslations {
  statusCleanTitle: string;
  statusCleanMessage: string;
  statusChangesTitle: string;
  statusChangesMessage: (total: number) => string;
  statusConflictsTitle: string;
  statusConflictsMessage: (conflicted: number) => string;
  statusCheckingTitle: string;
  statusCheckingMessage: string;
  statusCheckFailedTitle: string;
  statusCouldntCheck: string;
  statusRefresh: string;
  statusRefreshing: string;
  statusBreakdownLabel: string;
  statusCategoryChanged: (count: number) => string;
  statusCategoryNew: (count: number) => string;
  statusCategoryDeleted: (count: number) => string;
  statusCategoryRenamed: (count: number) => string;
  statusCategoryConflicted: (count: number) => string;
  statusTruncatedNote: (shown: number) => string;
  statusRefreshFailedNote: string;
}

const en: StatusTranslations = {
  statusCleanTitle: "Everything is saved",
  statusCleanMessage: "You have no unsaved changes in this project.",
  statusChangesTitle: "You have unsaved changes",
  statusChangesMessage: (total) =>
    total === 1 ? "1 file has changed since your last saved version." : `${total} files have changed since your last saved version.`,
  statusConflictsTitle: "Some files need your attention",
  statusConflictsMessage: (conflicted) =>
    conflicted === 1
      ? "1 file has overlapping changes that have to be resolved before you can save."
      : `${conflicted} files have overlapping changes that have to be resolved before you can save.`,
  statusCheckingTitle: "Checking for changes…",
  statusCheckingMessage: "GitOdile is looking at your project files.",
  statusCheckFailedTitle: "We couldn’t check for changes",
  statusCouldntCheck: "GitOdile couldn’t check what changed in this project.",
  statusRefresh: "Check for changes",
  statusRefreshing: "Checking…",
  statusBreakdownLabel: "What changed",
  statusCategoryChanged: (count) => (count === 1 ? "1 edited" : `${count} edited`),
  statusCategoryNew: (count) => (count === 1 ? "1 new" : `${count} new`),
  statusCategoryDeleted: (count) => (count === 1 ? "1 deleted" : `${count} deleted`),
  statusCategoryRenamed: (count) => (count === 1 ? "1 renamed" : `${count} renamed`),
  statusCategoryConflicted: (count) => (count === 1 ? "1 needs attention" : `${count} need attention`),
  statusTruncatedNote: (shown) => `Showing the first ${shown} files. The totals above cover every change.`,
  statusRefreshFailedNote: "This is the last result we could read. The latest check didn’t work.",
};

const es: StatusTranslations = {
  statusCleanTitle: "Todo está guardado",
  statusCleanMessage: "No tienes cambios sin guardar en este proyecto.",
  statusChangesTitle: "Tienes cambios sin guardar",
  statusChangesMessage: (total) =>
    total === 1
      ? "1 archivo ha cambiado desde tu última versión guardada."
      : `${total} archivos han cambiado desde tu última versión guardada.`,
  statusConflictsTitle: "Algunos archivos necesitan tu atención",
  statusConflictsMessage: (conflicted) =>
    conflicted === 1
      ? "1 archivo tiene cambios superpuestos que hay que resolver antes de poder guardar."
      : `${conflicted} archivos tienen cambios superpuestos que hay que resolver antes de poder guardar.`,
  statusCheckingTitle: "Buscando cambios…",
  statusCheckingMessage: "GitOdile está revisando los archivos de tu proyecto.",
  statusCheckFailedTitle: "No hemos podido buscar cambios",
  statusCouldntCheck: "GitOdile no ha podido comprobar qué ha cambiado en este proyecto.",
  statusRefresh: "Buscar cambios",
  statusRefreshing: "Buscando…",
  statusBreakdownLabel: "Qué ha cambiado",
  statusCategoryChanged: (count) => (count === 1 ? "1 editado" : `${count} editados`),
  statusCategoryNew: (count) => (count === 1 ? "1 nuevo" : `${count} nuevos`),
  statusCategoryDeleted: (count) => (count === 1 ? "1 eliminado" : `${count} eliminados`),
  statusCategoryRenamed: (count) => (count === 1 ? "1 renombrado" : `${count} renombrados`),
  statusCategoryConflicted: (count) =>
    count === 1 ? "1 necesita atención" : `${count} necesitan atención`,
  statusTruncatedNote: (shown) =>
    `Mostrando los primeros ${shown} archivos. Los totales de arriba incluyen todos los cambios.`,
  statusRefreshFailedNote:
    "Este es el último resultado que pudimos leer. La comprobación más reciente no ha funcionado.",
};

export const statusTranslations = { en, es } as const;
