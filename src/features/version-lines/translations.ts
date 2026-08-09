export interface VersionLinesTranslations {
  versionLinesTitle: string;
  versionLinesExplanation: string;
  versionLinesSearchPlaceholder: string;
  versionLinesSearchAriaLabel: string;
  versionLinesFilterAllLabel: string;
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
  versionLinesDetachedTitle: string;
  versionLinesDetachedDescription: string;
  versionLinesDetachedRecoverButton: string;
  versionLinesUnbornTitle: string;
  versionLinesUnbornDescription: string;
  versionLinesSwitchButton: string;
  versionLinesDeleteButton: string;
  versionLinesUpstreamLabel: (upstream: string) => string;
  versionLinesNoUpstreamLabel: string;
  versionLinesCheckedOutElsewhere: (path: string) => string;
  versionLinesUniqueCommits: (count: number) => string;
  versionLinesTechnicalDetails: string;
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
  versionLinesSectionActive: string;
  versionLinesSectionOthers: string;
  versionLinesLatestLabel: (subject: string) => string;
  versionLinesFilterButtonAll: string;
  versionLinesFilterButtonCount: (count: number) => string;
  versionLinesFilterStateGroup: string;
  versionLinesFilterPrefixGroup: string;
  versionLinesFilterClear: string;
  versionLinesSortAriaLabel: string;
  versionLinesSortRecent: string;
  versionLinesSortName: string;
  versionLinesSortUnpublished: string;
  versionLinesSwitchShort: string;
  versionLinesSwitchToLineLabel: (name: string) => string;
  versionLinesDetailsToggle: string;
  versionLinesDetailsToggleLabel: (name: string) => string;
  versionLinesViewDetails: string;
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
  deleteVersionLineTitle: (name: string) => string;
  deleteVersionLineBlockedTitle: (name: string) => string;
  deleteVersionLineBlockedUniqueLead: string;
  deleteVersionLineBlockedUniqueOptionPublish: string;
  deleteVersionLineBlockedUniqueOptionMerge: string;
  deleteVersionLineBlockedUniqueOptionKeep: string;
  deleteVersionLineBlockedElsewhereLead: string;
  deleteVersionLineBlockedActiveLead: string;
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
}

const en: VersionLinesTranslations = {
  versionLinesTitle: "Version lines",
  versionLinesExplanation:
    "Separate tracks for your saved versions. Switch lines to work in a different one.",
  versionLinesSearchPlaceholder: "Search version lines…",
  versionLinesSearchAriaLabel: "Search version lines",
  versionLinesFilterAllLabel: "All",
  versionLinesFilterAriaLabel: "Filter version lines",
  versionLinesNoProjectTitle: "No project open",
  versionLinesNoProjectDescription: "Open a project to see and manage its version lines.",
  versionLinesLoading: "Loading version lines…",
  versionLinesErrorLoading: "GitOdrile couldn't load this project's version lines.",
  versionLinesRetry: "Try again",
  versionLinesActiveLabel: "Active",
  versionLinesNewButton: "New version line",
  versionLinesEmptyOthers: "There are no other version lines in this project yet.",
  versionLinesNoSearchMatches: "No version lines match that search.",
  versionLinesTruncatedNote: (visible, total) => `Showing the ${visible} most recently saved of ${total}.`,
  versionLinesUnreadableNote: (count) =>
    count === 1
      ? "One version line isn't shown: its name uses characters GitOdrile can't read exactly. Use Git directly to rename it."
      : `${count} version lines aren't shown: their names use characters GitOdrile can't read exactly. Use Git directly to rename them.`,
  versionLinesDetachedTitle: "This project isn't on a version line right now",
  versionLinesDetachedDescription:
    "You're looking at one specific saved version. Create a named version line here to keep this work easy to find.",
  versionLinesDetachedRecoverButton: "Create a version line here",
  versionLinesUnbornTitle: "Save a version first",
  versionLinesUnbornDescription: "This version line has no saved versions yet, so there's nothing to branch from.",
  versionLinesSwitchButton: "Switch to this line",
  versionLinesDeleteButton: "Delete line",
  versionLinesUpstreamLabel: (upstream) => `Tracks ${upstream}`,
  versionLinesNoUpstreamLabel: "Local only",
  versionLinesCheckedOutElsewhere: (path) => `Open in another workspace at ${path}. Switch to it from there.`,
  versionLinesUniqueCommits: (count) =>
    count === 1 ? "1 version not on the active line" : `${count} versions not on the active line`,
  versionLinesTechnicalDetails: "Technical details",
  versionLinesRefNameLabel: "Branch name",
  versionLinesTipCommitLabel: "Latest commit",
  versionLinesSavedLabel: (date) => `Saved ${date}`,
  createVersionLineTitle: "New version line",
  createVersionLineNameLabel: "Name",
  createVersionLineNamePlaceholder: "e.g. feature/new-onboarding",
  createVersionLineSwitchLabel: "Create and switch to it",
  createVersionLineWithoutSwitchLabel: "Create without switching",
  createVersionLineDetachedNote:
    "This project isn't on a version line right now, so GitOdrile will switch to the new one to keep this commit easy to find.",
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
    "GitOdrile can't switch version lines with unsaved work in the way. Save a version, or start a new version line with this work instead.",
  switchVersionLineSaveVersionAction: "Save version",
  switchVersionLineNewLineAction: "New version line with this work",
  switchVersionLineConfirm: "Switch",
  switchVersionLineSwitching: "Switching…",
  switchVersionLineSuccessTitle: "Switched version lines",
  switchVersionLineDone: "Done",
  versionLinesStatsLines: (count) => (count === 1 ? "1 line" : `${count} lines`),
  versionLinesStatsActive: (count) => `${count} active`,
  versionLinesStatsLocalOnly: (count) => `${count} local only`,
  versionLinesSectionActive: "Active line",
  versionLinesSectionOthers: "Other lines",
  versionLinesLatestLabel: (subject) => `Latest: ${subject}`,
  versionLinesFilterButtonAll: "All lines",
  versionLinesFilterButtonCount: (count) => (count === 1 ? "1 filter" : `${count} filters`),
  versionLinesFilterStateGroup: "State",
  versionLinesFilterPrefixGroup: "Name prefix",
  versionLinesFilterClear: "Clear filters",
  versionLinesSortAriaLabel: "Sort version lines",
  versionLinesSortRecent: "Recently updated",
  versionLinesSortName: "Name (A–Z)",
  versionLinesSortUnpublished: "Local-only first",
  versionLinesSwitchShort: "Switch",
  versionLinesSwitchToLineLabel: (name) => `Switch to “${name}”`,
  versionLinesDetailsToggle: "Details",
  versionLinesDetailsToggleLabel: (name) => `Technical details for “${name}”`,
  versionLinesViewDetails: "View details",
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
  deleteVersionLineTitle: (name) => `Delete “${name}”?`,
  deleteVersionLineBlockedTitle: (name) => `“${name}” can't be deleted yet`,
  deleteVersionLineBlockedUniqueLead:
    "This version line has saved work that isn't reachable from any other version line or remote. Deleting it now would be the only copy lost, so GitOdrile won't do it.",
  deleteVersionLineBlockedUniqueOptionPublish:
    "Publish this line to a remote, so the work has a home outside this computer.",
  deleteVersionLineBlockedUniqueOptionMerge:
    "Bring its work into another version line, so it stays reachable from there.",
  deleteVersionLineBlockedUniqueOptionKeep: "Or keep the version line as it is — nothing is lost by waiting.",
  deleteVersionLineBlockedElsewhereLead:
    "This version line is checked out in another workspace. Close it there, or switch that workspace to a different version line, then try again.",
  deleteVersionLineBlockedActiveLead:
    "This is the version line you're working on right now. Switch to a different one first, then delete it.",
  deleteVersionLineBlockedOperationLead:
    "This project is in the middle of an unfinished Git operation — usually a merge, a rebase, or a cherry-pick that stopped on conflicting changes. Until it's finished or undone, GitOdrile won't change any version line, including deleting one.",
  deleteVersionLineBlockedOperationNote:
    "GitOdrile can show you which files are in conflict, but resolving them isn't supported here yet — finish or abort the operation in your Git tool, then come back.",
  deleteVersionLineOpenChangesAction: "See the files in conflict",
  deleteVersionLineSwitchAction: "Switch to this line",
  deleteVersionLineRetainedBy: (refs) => `Its saved work stays reachable from: ${refs}.`,
  deleteVersionLineSafeLead:
    "Only the local name is removed. The saved work itself is already kept elsewhere:",
  deleteVersionLineWarning: "This can't be undone from GitOdrile.",
  deleteVersionLineConfirm: "Delete",
  deleteVersionLineDeleting: "Deleting…",
  deleteVersionLineSuccessTitle: "Version line deleted",
  deleteVersionLineDone: "Done",
};

const es: VersionLinesTranslations = {
  versionLinesTitle: "Líneas de versión",
  versionLinesExplanation:
    "Vías independientes para tus versiones guardadas. Cambia de línea para trabajar en otra.",
  versionLinesSearchPlaceholder: "Buscar líneas de versión…",
  versionLinesSearchAriaLabel: "Buscar líneas de versión",
  versionLinesFilterAllLabel: "Todas",
  versionLinesFilterAriaLabel: "Filtrar las líneas de versión",
  versionLinesNoProjectTitle: "No hay ningún proyecto abierto",
  versionLinesNoProjectDescription: "Abre un proyecto para ver y gestionar sus líneas de versión.",
  versionLinesLoading: "Cargando líneas de versión…",
  versionLinesErrorLoading: "GitOdrile no pudo cargar las líneas de versión de este proyecto.",
  versionLinesRetry: "Intentar de nuevo",
  versionLinesActiveLabel: "Activa",
  versionLinesNewButton: "Nueva línea de versión",
  versionLinesEmptyOthers: "Todavía no hay otras líneas de versión en este proyecto.",
  versionLinesNoSearchMatches: "Ninguna línea de versión coincide con esa búsqueda.",
  versionLinesTruncatedNote: (visible, total) => `Se muestran las ${visible} guardadas más recientemente de ${total}.`,
  versionLinesUnreadableNote: (count) =>
    count === 1
      ? "Hay una línea de versión que no se muestra: su nombre usa caracteres que GitOdrile no puede leer con exactitud. Cámbiale el nombre desde Git."
      : `Hay ${count} líneas de versión que no se muestran: sus nombres usan caracteres que GitOdrile no puede leer con exactitud. Cámbiales el nombre desde Git.`,
  versionLinesDetachedTitle: "Este proyecto no está en una línea de versión ahora mismo",
  versionLinesDetachedDescription:
    "Estás viendo una versión guardada concreta. Crea aquí una línea de versión con nombre para que este trabajo sea fácil de encontrar.",
  versionLinesDetachedRecoverButton: "Crear una línea de versión aquí",
  versionLinesUnbornTitle: "Guarda una versión primero",
  versionLinesUnbornDescription: "Esta línea de versión todavía no tiene versiones guardadas, así que no hay nada de qué partir.",
  versionLinesSwitchButton: "Cambiar a esta línea",
  versionLinesDeleteButton: "Eliminar línea",
  versionLinesUpstreamLabel: (upstream) => `Sigue a ${upstream}`,
  versionLinesNoUpstreamLabel: "Solo local",
  versionLinesCheckedOutElsewhere: (path) => `Abierta en otro espacio de trabajo en ${path}. Cámbiate a ella desde ahí.`,
  versionLinesUniqueCommits: (count) =>
    count === 1 ? "1 versión fuera de la línea activa" : `${count} versiones fuera de la línea activa`,
  versionLinesTechnicalDetails: "Detalles técnicos",
  versionLinesRefNameLabel: "Nombre de la rama",
  versionLinesTipCommitLabel: "Último commit",
  versionLinesSavedLabel: (date) => `Guardada el ${date}`,
  createVersionLineTitle: "Nueva línea de versión",
  createVersionLineNameLabel: "Nombre",
  createVersionLineNamePlaceholder: "p. ej. feature/nueva-bienvenida",
  createVersionLineSwitchLabel: "Crear y cambiar a ella",
  createVersionLineWithoutSwitchLabel: "Crear sin cambiar",
  createVersionLineDetachedNote:
    "Este proyecto no está en una línea de versión ahora mismo, así que GitOdrile cambiará a la nueva para que este commit sea fácil de encontrar.",
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
    "GitOdrile no puede cambiar de línea de versión con trabajo sin guardar de por medio. Guarda una versión, o inicia una nueva línea de versión con este trabajo.",
  switchVersionLineSaveVersionAction: "Guardar versión",
  switchVersionLineNewLineAction: "Nueva línea de versión con este trabajo",
  switchVersionLineConfirm: "Cambiar",
  switchVersionLineSwitching: "Cambiando…",
  switchVersionLineSuccessTitle: "Línea de versión cambiada",
  switchVersionLineDone: "Listo",
  versionLinesStatsLines: (count) => (count === 1 ? "1 línea" : `${count} líneas`),
  versionLinesStatsActive: (count) => `${count} activa`,
  versionLinesStatsLocalOnly: (count) => `${count} solo local`,
  versionLinesSectionActive: "Línea activa",
  versionLinesSectionOthers: "Otras líneas",
  versionLinesLatestLabel: (subject) => `Última: ${subject}`,
  versionLinesFilterButtonAll: "Todas las líneas",
  versionLinesFilterButtonCount: (count) => (count === 1 ? "1 filtro" : `${count} filtros`),
  versionLinesFilterStateGroup: "Estado",
  versionLinesFilterPrefixGroup: "Prefijo del nombre",
  versionLinesFilterClear: "Quitar filtros",
  versionLinesSortAriaLabel: "Ordenar las líneas de versión",
  versionLinesSortRecent: "Actualizadas recientemente",
  versionLinesSortName: "Nombre (A–Z)",
  versionLinesSortUnpublished: "Solo locales primero",
  versionLinesSwitchShort: "Cambiar",
  versionLinesSwitchToLineLabel: (name) => `Cambiar a «${name}»`,
  versionLinesDetailsToggle: "Detalles",
  versionLinesDetailsToggleLabel: (name) => `Detalles técnicos de «${name}»`,
  versionLinesViewDetails: "Ver detalles",
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
  deleteVersionLineTitle: (name) => `¿Eliminar «${name}»?`,
  deleteVersionLineBlockedTitle: (name) => `«${name}» todavía no se puede eliminar`,
  deleteVersionLineBlockedUniqueLead:
    "Esta línea de versión tiene trabajo guardado que no es accesible desde ninguna otra línea ni desde ningún remoto. Eliminarla ahora perdería la única copia, así que GitOdrile no lo hará.",
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
  deleteVersionLineBlockedOperationLead:
    "Este proyecto está en medio de una operación de Git sin terminar: normalmente una fusión, un rebase o un cherry-pick que se paró por cambios en conflicto. Hasta que se termine o se deshaga, GitOdrile no tocará ninguna línea de versión, tampoco para eliminarla.",
  deleteVersionLineBlockedOperationNote:
    "GitOdrile puede enseñarte qué archivos están en conflicto, pero resolverlos todavía no se puede hacer aquí: termina o cancela la operación en tu herramienta de Git y vuelve.",
  deleteVersionLineOpenChangesAction: "Ver los archivos en conflicto",
  deleteVersionLineSwitchAction: "Cambiar a esta línea",
  deleteVersionLineRetainedBy: (refs) => `Su trabajo guardado sigue siendo accesible desde: ${refs}.`,
  deleteVersionLineSafeLead:
    "Solo se elimina el nombre local. El trabajo guardado ya se conserva en otro sitio:",
  deleteVersionLineWarning: "Esto no se puede deshacer desde GitOdrile.",
  deleteVersionLineConfirm: "Eliminar",
  deleteVersionLineDeleting: "Eliminando…",
  deleteVersionLineSuccessTitle: "Línea de versión eliminada",
  deleteVersionLineDone: "Listo",
};

export const versionLinesTranslations = { en, es } as const;
