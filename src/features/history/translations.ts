export interface HistoryTranslations {
  historyTitle: string;
  historyDescription: string;
  historyRefresh: string;
  historyRefreshing: string;
  historyLoading: string;
  historyErrorTitle: string;
  historyErrorLoading: string;
  historyRetry: string;
  historyTimelineAriaLabel: string;
  historySearchPlaceholder: string;
  historySearchAriaLabel: string;
  historyFiltersLabel: string;
  historyFiltersActive: (count: number) => string;
  historyFiltersClear: string;
  historyFiltersActiveCount: (count: number) => string;
  historyFilterRemove: (label: string) => string;
  historyFilterAuthorLabel: string;
  historyFilterAuthorPlaceholder: string;
  historyFilterDateLabel: string;
  historyFilterDateAny: string;
  historyFilterDateWeek: string;
  historyFilterDateMonth: string;
  historyFilterDateYear: string;
  historyFilterPathLabel: string;
  historyFilterPathPlaceholder: string;
  historyFilterHideMerges: string;
  historyFilterUnpublishedOnly: string;
  historyScopeLabel: string;
  historyScopeCurrentLine: string;
  historyScopeAllLines: string;
  historyScopeAllLinesHint: string;
  historyScopeLineChip: (name: string) => string;
  historyScopeLineHint: (name: string) => string;
  historyScopeLineLabel: string;
  historyScopeLinePlaceholder: string;
  historyScopeUnknownLine: string;
  historyScopeClear: string;
  historyScopeShowCurrentLine: string;
  historyLinesTruncated: string;
  historyVersionActions: string;
  historyVersionActionsLabel: string;
  historyLineActions: (name: string) => string;
  historyViewLine: (name: string) => string;
  historySwitchToLine: (name: string) => string;
  historyCreateLineFromVersion: string;
  historyNoMatches: string;
  historyLoadedCount: (count: number) => string;
  historyFilteredCount: (shown: number, loaded: number) => string;
  historyNoVersionsTitle: string;
  historyNoVersionsDescription: string;
  historyLoadMore: string;
  historyLoadingMore: string;
  historyMoreError: string;
  historyStaleNotice: string;
  /** Takes the already-formatted count, not the number: how a number is
   * written is the user's setting, and a dictionary cannot know it. */
  historyClientLimit: (count: string) => string;
  historyShallowTitle: string;
  historyShallowDescription: string;
  historyDetachedTitle: string;
  historyDetachedDescription: string;
  historyUnknownUpstreamTitle: string;
  historyUnknownUpstreamDescription: string;
  historyUnreadableMetadata: string;
  historyTruncatedMetadata: string;
  historySelectionRemoved: string;
  historyNoDescription: string;
  historyMessageTooLarge: string;
  historyMessagePageLimit: string;
  historyMessageMalformed: string;
  historyAuthorUnknown: string;
  historyPublished: string;
  historyLocalOnly: string;
  historyPublicationUnknown: string;
  historyRoot: string;
  historyMerge: string;
  historySelectedVersion: (description: string) => string;
  historyOverviewTab: string;
  historyFilesTab: string;
  historyDiffTab: string;
  historyDescriptionTitle: string;
  historyChangedAreas: string;
  historyComparisonTitle: string;
  historyModifiedFiles: string;
  historyNewFiles: string;
  historyDeletedFiles: string;
  historyContributorCount: (count: number) => string;
  historyParentCount: (count: number) => string;
  historyRefLineLabel: (name: string) => string;
  historyRefTagLabel: (name: string) => string;
  historyReadMore: string;
  historyReadLess: string;
  historyTechnicalDetails: string;
  historyCommitLabel: string;
  historyParentsLabel: string;
  historyAuthorLabel: string;
  historyEmailLabel: string;
  historyAuthoredLabel: string;
  historyCommittedLabel: string;
  historyRefsLabel: string;
  historyNoParents: string;
  historyDescriptionTruncated: string;
  historyDetailLoading: string;
  historyDetailError: string;
  historyBackToTimeline: string;
  historyRootComparison: string;
  historyNormalComparison: string;
  historyMergeComparison: string;
  historyChangedFiles: (count: number) => string;
  historyChangedFilesMinimum: (count: number) => string;
  historyFilesTruncated: string;
  historyFilesAriaLabel: string;
  historyFilterFilesPlaceholder: string;
  historyFilterFilesAriaLabel: string;
  historyNoFileMatches: string;
  historySearchDiffPlaceholder: string;
  historySearchDiffAriaLabel: string;
  historyCopyFilePath: string;
  historyFilePathCopied: string;
  historyNoChangedFiles: string;
  historyDiffLoading: string;
  historyDiffError: string;
  historySelectFilePrompt: string;
  historyVersionDate: (absolute: string) => string;
}

const en: HistoryTranslations = {
  historyTitle: "History",
  historyDescription: "Saved versions on the current version line, newest first.",
  historyRefresh: "Refresh",
  historyRefreshing: "Refreshing history…",
  historyLoading: "Reading saved versions…",
  historyErrorTitle: "History couldn’t be read",
  historyErrorLoading: "GitOdile couldn’t read this project’s saved versions.",
  historyRetry: "Try again",
  historyTimelineAriaLabel: "Saved-version timeline",
  historySearchPlaceholder: "Search saved versions",
  historySearchAriaLabel: "Search saved versions",
  historyFiltersLabel: "Filters",
  historyFiltersActive: (count) => `Filters (${count} on)`,
  historyFiltersClear: "Clear all",
  historyFiltersActiveCount: (count) => `${count} filter${count === 1 ? "" : "s"} active`,
  historyFilterRemove: (label) => `Remove the ${label} filter`,
  historyFilterAuthorLabel: "Author",
  historyFilterAuthorPlaceholder: "Any name or email",
  historyFilterDateLabel: "Saved",
  historyFilterDateAny: "Any",
  historyFilterDateWeek: "7 days",
  historyFilterDateMonth: "30 days",
  historyFilterDateYear: "1 year",
  historyFilterPathLabel: "File or folder",
  historyFilterPathPlaceholder: "For example src/app",
  historyFilterHideMerges: "Hide branch merges",
  historyFilterUnpublishedOnly: "Not published yet",
  historyScopeLabel: "Version line",
  historyScopeCurrentLine: "Current line",
  historyScopeAllLines: "All lines",
  historyScopeAllLinesHint: "Saved versions reachable from every version line in this project.",
  historyScopeLineChip: (name) => `Line: ${name}`,
  historyScopeLineHint: (name) =>
    `Saved versions reachable from “${name}”. This project stays where it is.`,
  historyScopeLineLabel: "Another version line",
  historyScopeLinePlaceholder: "Another line…",
  historyScopeUnknownLine: "This project doesn’t have a version line with that name.",
  historyScopeClear: "Show the current line again",
  historyScopeShowCurrentLine: "Show the current line",
  historyLinesTruncated: "This project has more version lines than History can read at once; some are not included.",
  historyVersionActions: "Actions",
  historyVersionActionsLabel: "What this saved version can do",
  historyLineActions: (name) => `What the version line ${name} can do`,
  historyViewLine: (name) => `View “${name}” in Lines`,
  historySwitchToLine: (name) => `Switch this project to “${name}”`,
  historyCreateLineFromVersion: "Create a new version line from this version",
  historyNoMatches: "No saved versions match these filters.",
  historyLoadedCount: (count) => `${count} saved ${count === 1 ? "version" : "versions"} loaded`,
  historyFilteredCount: (shown, loaded) => `${shown} of ${loaded} loaded ${loaded === 1 ? "version" : "versions"} shown`,
  historyNoVersionsTitle: "No saved versions yet",
  historyNoVersionsDescription: "Save your first version from Changes, then it will appear here.",
  historyLoadMore: "Load older versions",
  historyLoadingMore: "Loading older versions…",
  historyMoreError: "Older versions couldn’t be loaded. The versions already shown are still available.",
  historyStaleNotice: "History changed while an older page was loading. The timeline was refreshed from the current version.",
  historyClientLimit: (count) => `The timeline is capped at ${count} loaded versions for this session. Refresh to start from the newest version again.`,
  historyShallowTitle: "This is a partial history",
  historyShallowDescription: "This project was downloaded with limited history, so older saved versions may not exist on this computer.",
  historyDetachedTitle: "Viewing a version outside a version line",
  historyDetachedDescription: "History is still read-only and follows the currently selected saved version. Publication state is unavailable without a version line.",
  historyUnknownUpstreamTitle: "Publication state is unknown",
  historyUnknownUpstreamDescription: "No usable upstream is configured. The timeline will not guess whether a saved version was published.",
  historyUnreadableMetadata: "Some reference metadata could not be represented safely and was omitted.",
  historyTruncatedMetadata: "Some long messages or reference lists were shortened to keep History responsive.",
  historySelectionRemoved: "The selected saved version is no longer reachable. The newest available version is selected instead.",
  historyNoDescription: "Untitled saved version",
  historyMessageTooLarge: "Message too large to display safely",
  historyMessagePageLimit: "Message omitted to keep this history page within its safety limit",
  historyMessageMalformed: "Message metadata couldn’t be read safely",
  historyAuthorUnknown: "Unknown author",
  historyPublished: "Published",
  historyLocalOnly: "Saved locally",
  historyPublicationUnknown: "Publication unknown",
  historyRoot: "First version",
  historyMerge: "Combined version",
  historySelectedVersion: (description) => `${description}, selected`,
  historyOverviewTab: "Overview",
  historyFilesTab: "Files changed",
  historyDiffTab: "Diff",
  historyDescriptionTitle: "Description",
  historyChangedAreas: "Changed areas",
  historyComparisonTitle: "Comparison",
  historyModifiedFiles: "Modified",
  historyNewFiles: "Added",
  historyDeletedFiles: "Deleted",
  historyContributorCount: (count) => `${count} ${count === 1 ? "contributor" : "contributors"}`,
  historyParentCount: (count) => `${count} parent ${count === 1 ? "commit" : "commits"}`,
  historyRefLineLabel: (name) => `Version line ${name}`,
  historyRefTagLabel: (name) => `Tag ${name}`,
  historyReadMore: "Read more",
  historyReadLess: "Read less",
  historyTechnicalDetails: "Technical details",
  historyCommitLabel: "Commit",
  historyParentsLabel: "Parents",
  historyAuthorLabel: "Author",
  historyEmailLabel: "Email",
  historyAuthoredLabel: "Saved at",
  historyCommittedLabel: "Recorded at",
  historyRefsLabel: "References",
  historyNoParents: "None — first saved version",
  historyDescriptionTruncated: "This description was shortened at the safety limit.",
  historyDetailLoading: "Reading this saved version…",
  historyDetailError: "This saved version couldn’t be read.",
  historyBackToTimeline: "Back to saved versions",
  historyRootComparison: "Every file is shown as new because this is the project’s first saved version.",
  historyNormalComparison: "Changes are compared with the saved version immediately before this one.",
  historyMergeComparison: "This combined version is compared with its first parent. All parents remain listed in Technical details.",
  historyChangedFiles: (count) => `${count} changed ${count === 1 ? "file" : "files"}`,
  historyChangedFilesMinimum: (count) => `At least ${count} changed files`,
  historyFilesTruncated: "Only the first bounded set of changed files is shown.",
  historyFilesAriaLabel: "Files changed in this saved version",
  historyFilterFilesPlaceholder: "Filter files",
  historyFilterFilesAriaLabel: "Filter changed files",
  historyNoFileMatches: "No changed files match this search.",
  historySearchDiffPlaceholder: "Search in diff",
  historySearchDiffAriaLabel: "Search in the selected file difference",
  historyCopyFilePath: "Copy file path",
  historyFilePathCopied: "File path copied",
  historyNoChangedFiles: "This saved version has no file-content changes to show.",
  historyDiffLoading: "Reading the saved difference…",
  historyDiffError: "This file’s saved difference couldn’t be read.",
  historySelectFilePrompt: "Choose a changed file to read its saved difference.",
  historyVersionDate: (absolute) => `Saved ${absolute}`,
};

const es: HistoryTranslations = {
  historyTitle: "Historial",
  historyDescription: "Versiones guardadas en la línea de versión actual, de más reciente a más antigua.",
  historyRefresh: "Actualizar",
  historyRefreshing: "Actualizando historial…",
  historyLoading: "Leyendo versiones guardadas…",
  historyErrorTitle: "No se pudo leer el historial",
  historyErrorLoading: "GitOdile no pudo leer las versiones guardadas de este proyecto.",
  historyRetry: "Reintentar",
  historyTimelineAriaLabel: "Cronología de versiones guardadas",
  historySearchPlaceholder: "Buscar versiones guardadas",
  historySearchAriaLabel: "Buscar versiones guardadas",
  historyFiltersLabel: "Filtros",
  historyFiltersActive: (count) => `Filtros (${count} activo${count === 1 ? "" : "s"})`,
  historyFiltersClear: "Quitar todos",
  historyFiltersActiveCount: (count) => `${count} filtro${count === 1 ? "" : "s"} activo${count === 1 ? "" : "s"}`,
  historyFilterRemove: (label) => `Quitar el filtro ${label}`,
  historyFilterAuthorLabel: "Autor",
  historyFilterAuthorPlaceholder: "Cualquier nombre o correo",
  historyFilterDateLabel: "Guardadas",
  historyFilterDateAny: "Cualquiera",
  historyFilterDateWeek: "7 días",
  historyFilterDateMonth: "30 días",
  historyFilterDateYear: "1 año",
  historyFilterPathLabel: "Archivo o carpeta",
  historyFilterPathPlaceholder: "Por ejemplo src/app",
  historyFilterHideMerges: "Ocultar uniones de ramas",
  historyFilterUnpublishedOnly: "Sin publicar",
  historyScopeLabel: "Línea de versión",
  historyScopeCurrentLine: "Línea actual",
  historyScopeAllLines: "Todas las líneas",
  historyScopeAllLinesHint: "Versiones guardadas alcanzables desde todas las líneas de versión del proyecto.",
  historyScopeLineChip: (name) => `Línea: ${name}`,
  historyScopeLineHint: (name) =>
    `Versiones guardadas alcanzables desde «${name}». El proyecto se queda donde está.`,
  historyScopeLineLabel: "Otra línea de versión",
  historyScopeLinePlaceholder: "Otra línea…",
  historyScopeUnknownLine: "Este proyecto no tiene ninguna línea de versión con ese nombre.",
  historyScopeClear: "Volver a la línea actual",
  historyScopeShowCurrentLine: "Ver la línea actual",
  historyLinesTruncated: "Este proyecto tiene más líneas de versión de las que el historial puede leer a la vez; algunas no se incluyen.",
  historyVersionActions: "Acciones",
  historyVersionActionsLabel: "Qué se puede hacer con esta versión guardada",
  historyLineActions: (name) => `Qué se puede hacer con la línea de versión ${name}`,
  historyViewLine: (name) => `Ver «${name}» en Líneas`,
  historySwitchToLine: (name) => `Cambiar este proyecto a «${name}»`,
  historyCreateLineFromVersion: "Crear una línea de versión desde esta versión",
  historyNoMatches: "Ninguna versión guardada coincide con estos filtros.",
  historyLoadedCount: (count) => `${count} ${count === 1 ? "versión guardada cargada" : "versiones guardadas cargadas"}`,
  historyFilteredCount: (shown, loaded) => `Mostrando ${shown} de ${loaded} ${loaded === 1 ? "versión cargada" : "versiones cargadas"}`,
  historyNoVersionsTitle: "Todavía no hay versiones guardadas",
  historyNoVersionsDescription: "Guarda la primera versión desde Cambios y aparecerá aquí.",
  historyLoadMore: "Cargar versiones anteriores",
  historyLoadingMore: "Cargando versiones anteriores…",
  historyMoreError: "No se pudieron cargar las versiones anteriores. Las que ya se muestran siguen disponibles.",
  historyStaleNotice: "El historial cambió mientras se cargaba otra página. La cronología se actualizó desde la versión actual.",
  historyClientLimit: (count) => `La cronología está limitada a ${count} versiones cargadas en esta sesión. Actualiza para volver a empezar por la más reciente.`,
  historyShallowTitle: "Este historial es parcial",
  historyShallowDescription: "Este proyecto se descargó con historial limitado, por lo que puede que las versiones anteriores no estén en este ordenador.",
  historyDetachedTitle: "Viendo una versión fuera de una línea de versión",
  historyDetachedDescription: "El historial sigue siendo de solo lectura y parte de la versión seleccionada. Sin línea de versión no se puede saber si está publicada.",
  historyUnknownUpstreamTitle: "No se conoce el estado de publicación",
  historyUnknownUpstreamDescription: "No hay un upstream utilizable configurado. La cronología no supondrá si una versión está publicada.",
  historyUnreadableMetadata: "Se omitieron algunos metadatos de referencias que no se podían representar con seguridad.",
  historyTruncatedMetadata: "Algunos mensajes largos o listas de referencias se acortaron para mantener el historial fluido.",
  historySelectionRemoved: "La versión seleccionada ya no es alcanzable. Se ha seleccionado la versión disponible más reciente.",
  historyNoDescription: "Versión guardada sin título",
  historyMessageTooLarge: "Mensaje demasiado grande para mostrarlo con seguridad",
  historyMessagePageLimit: "Se omitió el mensaje para mantener esta página dentro de su límite de seguridad",
  historyMessageMalformed: "Los metadatos del mensaje no se pudieron leer de forma segura",
  historyAuthorUnknown: "Autor desconocido",
  historyPublished: "Publicada",
  historyLocalOnly: "Guardada localmente",
  historyPublicationUnknown: "Publicación desconocida",
  historyRoot: "Primera versión",
  historyMerge: "Versión combinada",
  historySelectedVersion: (description) => `${description}, seleccionada`,
  historyOverviewTab: "Resumen",
  historyFilesTab: "Archivos cambiados",
  historyDiffTab: "Diferencia",
  historyDescriptionTitle: "Descripción",
  historyChangedAreas: "Áreas cambiadas",
  historyComparisonTitle: "Comparación",
  historyModifiedFiles: "Modificados",
  historyNewFiles: "Añadidos",
  historyDeletedFiles: "Eliminados",
  historyContributorCount: (count) => `${count} ${count === 1 ? "colaborador" : "colaboradores"}`,
  historyParentCount: (count) => `${count} ${count === 1 ? "commit padre" : "commits padre"}`,
  historyRefLineLabel: (name) => `Línea de versión ${name}`,
  historyRefTagLabel: (name) => `Etiqueta ${name}`,
  historyReadMore: "Leer más",
  historyReadLess: "Leer menos",
  historyTechnicalDetails: "Detalles técnicos",
  historyCommitLabel: "Commit",
  historyParentsLabel: "Padres",
  historyAuthorLabel: "Autor",
  historyEmailLabel: "Correo",
  historyAuthoredLabel: "Guardada el",
  historyCommittedLabel: "Registrada el",
  historyRefsLabel: "Referencias",
  historyNoParents: "Ninguno — primera versión guardada",
  historyDescriptionTruncated: "Esta descripción se acortó al alcanzar el límite de seguridad.",
  historyDetailLoading: "Leyendo esta versión guardada…",
  historyDetailError: "No se pudo leer esta versión guardada.",
  historyBackToTimeline: "Volver a versiones guardadas",
  historyRootComparison: "Todos los archivos aparecen como nuevos porque esta es la primera versión guardada del proyecto.",
  historyNormalComparison: "Los cambios se comparan con la versión guardada inmediatamente anterior.",
  historyMergeComparison: "Esta versión combinada se compara con su primer padre. Todos los padres aparecen en Detalles técnicos.",
  historyChangedFiles: (count) => `${count} ${count === 1 ? "archivo cambiado" : "archivos cambiados"}`,
  historyChangedFilesMinimum: (count) => `Al menos ${count} archivos cambiados`,
  historyFilesTruncated: "Solo se muestra el primer conjunto acotado de archivos cambiados.",
  historyFilesAriaLabel: "Archivos cambiados en esta versión guardada",
  historyFilterFilesPlaceholder: "Filtrar archivos",
  historyFilterFilesAriaLabel: "Filtrar archivos cambiados",
  historyNoFileMatches: "Ningún archivo cambiado coincide con esta búsqueda.",
  historySearchDiffPlaceholder: "Buscar en la diferencia",
  historySearchDiffAriaLabel: "Buscar en la diferencia del archivo seleccionado",
  historyCopyFilePath: "Copiar ruta del archivo",
  historyFilePathCopied: "Ruta del archivo copiada",
  historyNoChangedFiles: "Esta versión guardada no contiene cambios de archivos que mostrar.",
  historyDiffLoading: "Leyendo la diferencia guardada…",
  historyDiffError: "No se pudo leer la diferencia guardada de este archivo.",
  historySelectFilePrompt: "Elige un archivo cambiado para leer su diferencia guardada.",
  historyVersionDate: (absolute) => `Guardada ${absolute}`,
};

export const historyTranslations = { en, es } as const;
