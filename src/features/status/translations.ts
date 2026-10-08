export interface StatusTranslations {
  statusCleanTitle: string;
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
  statusChangesTitle: "You have unsaved changes",
  statusChangesMessage: (total) =>
    total === 1 ? "1 file changed since your last saved version." : `${total} files changed since your last saved version.`,
  statusConflictsTitle: "Some files need your attention",
  statusConflictsMessage: (conflicted) =>
    conflicted === 1
      ? "1 file has overlapping changes to resolve before you can save."
      : `${conflicted} files have overlapping changes to resolve before you can save.`,
  statusCheckingTitle: "Checking for changes…",
  statusCheckingMessage: "Looking at your project files.",
  statusCheckFailedTitle: "Couldn't check for changes",
  statusCouldntCheck: "Couldn't check what changed in this project.",
  statusRefresh: "Check for changes",
  statusRefreshing: "Checking…",
  statusBreakdownLabel: "What changed",
  statusCategoryChanged: (count) => (count === 1 ? "1 edited" : `${count} edited`),
  statusCategoryNew: (count) => (count === 1 ? "1 new" : `${count} new`),
  statusCategoryDeleted: (count) => (count === 1 ? "1 deleted" : `${count} deleted`),
  statusCategoryRenamed: (count) => (count === 1 ? "1 renamed" : `${count} renamed`),
  statusCategoryConflicted: (count) => (count === 1 ? "1 needs attention" : `${count} need attention`),
  statusTruncatedNote: (shown) => `Showing the first ${shown} files, but the totals include every change.`,
  statusRefreshFailedNote: "The latest check failed, so this is the last known result.",
};

const es: StatusTranslations = {
  statusCleanTitle: "Todo está guardado",
  statusChangesTitle: "Tienes cambios sin guardar",
  statusChangesMessage: (total) =>
    total === 1
      ? "1 archivo ha cambiado desde tu última versión guardada."
      : `${total} archivos han cambiado desde tu última versión guardada.`,
  statusConflictsTitle: "Algunos archivos necesitan tu atención",
  statusConflictsMessage: (conflicted) =>
    conflicted === 1
      ? "1 archivo tiene cambios superpuestos que debes resolver antes de guardar."
      : `${conflicted} archivos tienen cambios superpuestos que debes resolver antes de guardar.`,
  statusCheckingTitle: "Buscando cambios…",
  statusCheckingMessage: "Revisando los archivos de tu proyecto.",
  statusCheckFailedTitle: "No se pudo comprobar si hay cambios",
  statusCouldntCheck: "No se pudo comprobar qué ha cambiado en este proyecto.",
  statusRefresh: "Buscar cambios",
  statusRefreshing: "Buscando…",
  statusBreakdownLabel: "Qué ha cambiado",
  statusCategoryChanged: (count) => (count === 1 ? "1 editado" : `${count} editados`),
  statusCategoryNew: (count) => (count === 1 ? "1 nuevo" : `${count} nuevos`),
  statusCategoryDeleted: (count) => (count === 1 ? "1 eliminado" : `${count} eliminados`),
  statusCategoryRenamed: (count) => (count === 1 ? "1 renombrado" : `${count} renombrados`),
  statusCategoryConflicted: (count) =>
    count === 1 ? "1 necesita atención" : `${count} necesitan atención`,
  statusTruncatedNote: (shown) => `Se muestran los primeros ${shown} archivos, pero los totales incluyen todos los cambios.`,
  statusRefreshFailedNote: "La última comprobación falló, así que este es el último resultado conocido.",
};

export const statusTranslations = { en, es } as const;
