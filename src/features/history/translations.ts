export interface HistoryTranslations {
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
  historyFilterDateCustom: string;
  historyFilterDateSinceChip: (day: string) => string;
  historyFilterDateUntilChip: (day: string) => string;
  historyFilterDateFrom: string;
  historyFilterDateTo: string;
  historyFilterDateFromCalendar: string;
  historyFilterDateToCalendar: string;
  historyFilterDatePreviousMonth: string;
  historyFilterDateNextMonth: string;
  historyFilterAuthorSuggestions: string;
  historyFilterPathSuggestions: string;
  historyFilterFromLoaded: string;
  historyFilterFromOpenVersion: string;
  historyFilterPathLabel: string;
  historyFilterPathPlaceholder: string;
  historyFilterHideMerges: string;
  historyFilterUnpublishedOnly: string;
  historyFilterTaggedOnly: string;
  historyBoundaryUnpublished: (count: string) => string;
  historyBoundaryPublished: string;
  historyBoundaryHint: (remote: string | null) => string;
  historyBoundaryPublishHint: string;
  historyMatchAuthor: string;
  historyMatchCommit: string;
  historyMatchRef: string;
  historyMatchMessage: string;
  historyMatchLabel: (where: string) => string;
  historyScopeLabel: string;
  historyScopeCurrentLine: string;
  historyScopeAllLines: string;
  historyScopeAllLinesHint: string;
  historyScopeLineChip: (name: string) => string;
  historyScopeLineHint: (name: string) => string;
  historyScopeLineLabel: string;
  historyScopeLinePlaceholder: string;
  historyScopeSearchPlaceholder: string;
  historyScopeNoLines: string;
  historyScopeClear: string;
  historyScopeShowCurrentLine: string;
  historyLinesTruncated: string;
  historyVersionActions: string;
  historyMore: string;
  historyDetails: string;
  historyDetailsMessage: string;
  historyCommitDetails: string;
  historyPublicationLabel: string;
  historyFilesLabel: string;
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
  historyCurrentLabel: string;
  historyMergeLabel: string;
  historyGlyphCurrent: string;
  historyGlyphLocalOnly: string;
  historyGlyphMerge: string;
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
  historyCopyFilePath: string;
  historyFilePathCopied: string;
  historyNoChangedFiles: string;
  historyDiffLoading: string;
  historyDiffError: string;
  historySelectFilePrompt: string;
  historyVersionDate: (absolute: string) => string;
}

const en: HistoryTranslations = {
  historyDescription: "Saved versions on the current line, newest first.",
  historyRefresh: "Refresh",
  historyRefreshing: "Refreshing history…",
  historyLoading: "Reading saved versions…",
  historyErrorTitle: "Couldn't read history",
  historyErrorLoading: "Couldn't read this project's saved versions.",
  historyRetry: "Try again",
  historyTimelineAriaLabel: "Saved versions timeline",
  historySearchPlaceholder: "Search saved versions",
  historySearchAriaLabel: "Search saved versions",
  historyFiltersLabel: "Filters",
  historyFiltersActive: (count) => `Filters (${count} on)`,
  historyFiltersClear: "Clear all",
  historyFiltersActiveCount: (count) => `${count} filter${count === 1 ? "" : "s"} on`,
  historyFilterRemove: (label) => `Remove the ${label} filter`,
  historyFilterAuthorLabel: "Author",
  historyFilterAuthorPlaceholder: "Any name or email",
  historyFilterDateLabel: "Date",
  historyFilterDateAny: "Any",
  historyFilterDateWeek: "7 days",
  historyFilterDateMonth: "30 days",
  historyFilterDateYear: "1 year",
  historyFilterDateCustom: "Range",
  historyFilterDateSinceChip: (day) => `From ${day}`,
  historyFilterDateUntilChip: (day) => `To ${day}`,
  historyFilterDateFrom: "From",
  historyFilterDateTo: "To",
  historyFilterDateFromCalendar: "Choose the first day",
  historyFilterDateToCalendar: "Choose the last day",
  historyFilterDatePreviousMonth: "Previous month",
  historyFilterDateNextMonth: "Next month",
  historyFilterAuthorSuggestions: "Authors of the loaded versions",
  historyFilterPathSuggestions: "Folders and files in the open version",
  historyFilterFromLoaded: "Only loaded versions",
  historyFilterFromOpenVersion: "Only the open version",
  historyFilterPathLabel: "File or folder",
  historyFilterPathPlaceholder: "e.g. src/app",
  historyFilterHideMerges: "Hide merges",
  historyFilterUnpublishedOnly: "Not published yet",
  historyFilterTaggedOnly: "Only tagged versions",
  historyBoundaryUnpublished: (count) => `${count} not published`,
  historyBoundaryPublished: "Published",
  historyBoundaryPublishHint: "Publish them — you'll see what's sent first",
  historyMatchAuthor: "author",
  historyMatchCommit: "code",
  historyMatchRef: "tag or line",
  historyMatchMessage: "message",
  historyMatchLabel: (where) => `Matches its ${where}`,
  historyBoundaryHint: (remote) => `Versions above are only on this computer; versions below are already ${remote ? `on ${remote}` : "published"}`,
  historyScopeLabel: "Version line",
  historyScopeCurrentLine: "Current line",
  historyScopeAllLines: "All lines",
  historyScopeAllLinesHint: "Saved versions from every version line.",
  historyScopeLineChip: (name) => `Line: ${name}`,
  historyScopeLineHint: (name) => `Saved versions on “${name}”. Your project stays where it is.`,
  historyScopeLineLabel: "A specific line",
  historyScopeLinePlaceholder: "Choose a line…",
  historyScopeSearchPlaceholder: "Search version lines…",
  historyScopeNoLines: "No version line matches that.",
  historyScopeClear: "Back to the current line",
  historyScopeShowCurrentLine: "Show the current line",
  historyLinesTruncated: "Some version lines aren't included: this project has more than History can read at once.",
  historyVersionActions: "Actions",
  historyMore: "More",
  historyDetails: "Details",
  historyDetailsMessage: "Message",
  historyCommitDetails: "Commit details",
  historyPublicationLabel: "Publication",
  historyFilesLabel: "Files",
  historyVersionActionsLabel: "What this saved version can do",
  historyLineActions: (name) => `What the version line ${name} can do`,
  historyViewLine: (name) => `View “${name}” in Lines`,
  historySwitchToLine: (name) => `Switch to “${name}”`,
  historyCreateLineFromVersion: "New version line from here",
  historyNoMatches: "No saved versions match these filters.",
  historyLoadedCount: (count) => `${count} saved ${count === 1 ? "version" : "versions"} loaded`,
  historyFilteredCount: (shown, loaded) => `Showing ${shown} of ${loaded} loaded ${loaded === 1 ? "version" : "versions"}`,
  historyNoVersionsTitle: "No saved versions yet",
  historyNoVersionsDescription: "Save your first version in Changes and it will show up here.",
  historyLoadMore: "Load older versions",
  historyLoadingMore: "Loading older versions…",
  historyMoreError: "Couldn't load older versions, but the ones shown are still here.",
  historyStaleNotice: "History changed while loading, so it was reloaded from the current version.",
  historyClientLimit: (count) => `Showing up to ${count} versions this session. Refresh to start from the newest again.`,
  historyShallowTitle: "Partial history",
  historyShallowDescription: "This project was downloaded with limited history, so older versions may be missing.",
  historyDetachedTitle: "Viewing a version outside a line",
  historyDetachedDescription: "History starts from the selected version, and without a line, publish status can't be shown.",
  historyUnknownUpstreamTitle: "Publish status unknown",
  historyUnknownUpstreamDescription: "This line doesn't track a remote branch, so GitOdile can't tell what's published.",
  historyUnreadableMetadata: "Some tag or line names couldn't be read and were left out.",
  historyTruncatedMetadata: "Some long messages or lists were shortened to keep History fast.",
  historySelectionRemoved: "The selected version is no longer available, so the newest one is selected.",
  historyNoDescription: "Untitled saved version",
  historyMessageTooLarge: "Message too large to show",
  historyMessagePageLimit: "Message left out to keep this page fast",
  historyMessageMalformed: "Couldn't read this message",
  historyAuthorUnknown: "Unknown author",
  historyPublished: "Published",
  historyLocalOnly: "Saved locally",
  historyCurrentLabel: "Where you are",
  historyMergeLabel: "Joins two lines",
  historyGlyphCurrent: "Where you are — your files are at this version",
  historyGlyphLocalOnly: "Saved locally — not published yet, so it's only on this computer",
  historyGlyphMerge: "Joins two version lines into one",
  historyPublicationUnknown: "Publish status unknown",
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
  historyDescriptionTruncated: "This description was shortened.",
  historyDetailLoading: "Reading this saved version…",
  historyDetailError: "Couldn't read this saved version.",
  historyBackToTimeline: "Back to saved versions",
  historyRootComparison: "Every file shows as new because this is the first saved version.",
  historyNormalComparison: "Compared with the saved version just before it.",
  historyMergeComparison: "Compared with its first parent, and all parents are listed in Technical details.",
  historyChangedFiles: (count) => `${count} changed ${count === 1 ? "file" : "files"}`,
  historyChangedFilesMinimum: (count) => `At least ${count} changed files`,
  historyFilesTruncated: "Only the first changed files are shown.",
  historyFilesAriaLabel: "Files changed in this saved version",
  historyFilterFilesPlaceholder: "Filter files",
  historyFilterFilesAriaLabel: "Filter changed files",
  historyNoFileMatches: "No changed files match this search.",
  historyCopyFilePath: "Copy file path",
  historyFilePathCopied: "File path copied",
  historyNoChangedFiles: "No file content changed in this version.",
  historyDiffLoading: "Reading changes…",
  historyDiffError: "Couldn't read this file's changes.",
  historySelectFilePrompt: "Choose a file to see its changes.",
  historyVersionDate: (absolute) => `Saved ${absolute}`,
};

const es: HistoryTranslations = {
  historyDescription: "Versiones guardadas en la línea actual, de la más reciente a la más antigua.",
  historyRefresh: "Actualizar",
  historyRefreshing: "Actualizando historial…",
  historyLoading: "Leyendo versiones guardadas…",
  historyErrorTitle: "No se pudo leer el historial",
  historyErrorLoading: "No se pudieron leer las versiones guardadas de este proyecto.",
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
  historyFilterDateLabel: "Fecha",
  historyFilterDateAny: "Cualquiera",
  historyFilterDateWeek: "7 días",
  historyFilterDateMonth: "30 días",
  historyFilterDateYear: "1 año",
  historyFilterDateCustom: "Rango",
  historyFilterDateSinceChip: (day) => `Desde ${day}`,
  historyFilterDateUntilChip: (day) => `Hasta ${day}`,
  historyFilterDateFrom: "Desde",
  historyFilterDateTo: "Hasta",
  historyFilterDateFromCalendar: "Elige el primer día",
  historyFilterDateToCalendar: "Elige el último día",
  historyFilterDatePreviousMonth: "Mes anterior",
  historyFilterDateNextMonth: "Mes siguiente",
  historyFilterAuthorSuggestions: "Autores de las versiones cargadas",
  historyFilterPathSuggestions: "Carpetas y archivos de la versión abierta",
  historyFilterFromLoaded: "Solo versiones cargadas",
  historyFilterFromOpenVersion: "Solo la versión abierta",
  historyFilterPathLabel: "Archivo o carpeta",
  historyFilterPathPlaceholder: "p. ej. src/app",
  historyFilterHideMerges: "Ocultar fusiones",
  historyFilterUnpublishedOnly: "Sin publicar",
  historyFilterTaggedOnly: "Solo versiones con etiqueta",
  historyBoundaryUnpublished: (count) => `${count} sin publicar`,
  historyBoundaryPublished: "Publicadas",
  historyBoundaryPublishHint: "Publicarlas: antes verás qué se envía",
  historyMatchAuthor: "autor",
  historyMatchCommit: "código",
  historyMatchRef: "etiqueta o línea",
  historyMatchMessage: "mensaje",
  historyMatchLabel: (where) => `Coincide en: ${where}`,
  historyBoundaryHint: (remote) => `Las versiones de arriba solo están en este ordenador; las de abajo ya están ${remote ? `en ${remote}` : "publicadas"}`,
  historyScopeLabel: "Línea de versión",
  historyScopeCurrentLine: "Línea actual",
  historyScopeAllLines: "Todas las líneas",
  historyScopeAllLinesHint: "Versiones guardadas de todas las líneas de versión.",
  historyScopeLineChip: (name) => `Línea: ${name}`,
  historyScopeLineHint: (name) => `Versiones guardadas en «${name}». Tu proyecto se queda donde está.`,
  historyScopeLineLabel: "Una línea concreta",
  historyScopeLinePlaceholder: "Elige una línea…",
  historyScopeSearchPlaceholder: "Buscar líneas de versión…",
  historyScopeNoLines: "Ninguna línea de versión coincide.",
  historyScopeClear: "Volver a la línea actual",
  historyScopeShowCurrentLine: "Ver la línea actual",
  historyLinesTruncated: "Faltan algunas líneas de versión: el proyecto tiene más de las que el historial puede leer a la vez.",
  historyVersionActions: "Acciones",
  historyMore: "Más",
  historyDetails: "Detalles",
  historyDetailsMessage: "Mensaje",
  historyCommitDetails: "Detalles del commit",
  historyPublicationLabel: "Publicación",
  historyFilesLabel: "Archivos",
  historyVersionActionsLabel: "Qué se puede hacer con esta versión guardada",
  historyLineActions: (name) => `Qué se puede hacer con la línea de versión ${name}`,
  historyViewLine: (name) => `Ver «${name}» en Líneas`,
  historySwitchToLine: (name) => `Cambiar a «${name}»`,
  historyCreateLineFromVersion: "Nueva línea de versión desde aquí",
  historyNoMatches: "Ninguna versión guardada coincide con estos filtros.",
  historyLoadedCount: (count) => `${count} ${count === 1 ? "versión guardada cargada" : "versiones guardadas cargadas"}`,
  historyFilteredCount: (shown, loaded) => `Se muestran ${shown} de ${loaded} ${loaded === 1 ? "versión cargada" : "versiones cargadas"}`,
  historyNoVersionsTitle: "Aún no hay versiones guardadas",
  historyNoVersionsDescription: "Guarda tu primera versión en Cambios y aparecerá aquí.",
  historyLoadMore: "Cargar versiones anteriores",
  historyLoadingMore: "Cargando versiones anteriores…",
  historyMoreError: "No se pudieron cargar versiones anteriores, pero las que ya ves siguen aquí.",
  historyStaleNotice: "El historial cambió mientras se cargaba, así que se ha recargado desde la versión actual.",
  historyClientLimit: (count) => `Se muestran hasta ${count} versiones en esta sesión. Actualiza para volver a empezar por la más reciente.`,
  historyShallowTitle: "Historial parcial",
  historyShallowDescription: "Este proyecto se descargó con historial limitado, así que pueden faltar versiones antiguas.",
  historyDetachedTitle: "Viendo una versión fuera de una línea",
  historyDetachedDescription: "El historial parte de la versión seleccionada y, sin línea, no se puede mostrar qué está publicado.",
  historyUnknownUpstreamTitle: "Estado de publicación desconocido",
  historyUnknownUpstreamDescription: "Esta línea no sigue ninguna rama remota, así que GitOdile no puede saber qué está publicado.",
  historyUnreadableMetadata: "Algunos nombres de etiquetas o líneas no se pudieron leer y se omitieron.",
  historyTruncatedMetadata: "Algunos mensajes o listas largos se acortaron para que el historial vaya fluido.",
  historySelectionRemoved: "La versión seleccionada ya no está disponible, así que se ha seleccionado la más reciente.",
  historyNoDescription: "Versión guardada sin título",
  historyMessageTooLarge: "Mensaje demasiado grande para mostrarlo",
  historyMessagePageLimit: "Mensaje omitido para que esta página vaya fluida",
  historyMessageMalformed: "No se pudo leer este mensaje",
  historyAuthorUnknown: "Autor desconocido",
  historyPublished: "Publicada",
  historyLocalOnly: "Guardada en local",
  historyCurrentLabel: "Aquí estás",
  historyMergeLabel: "Une dos líneas",
  historyGlyphCurrent: "Aquí estás: tus archivos están en esta versión",
  historyGlyphLocalOnly: "Guardada en local: aún no se ha publicado, así que solo está en este ordenador",
  historyGlyphMerge: "Une dos líneas de versión en una",
  historyPublicationUnknown: "Publicación desconocida",
  historyRoot: "Primera versión",
  historyMerge: "Versión combinada",
  historySelectedVersion: (description) => `${description}, seleccionada`,
  historyOverviewTab: "Resumen",
  historyFilesTab: "Archivos cambiados",
  historyDiffTab: "Cambios",
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
  historyDescriptionTruncated: "Esta descripción se ha acortado.",
  historyDetailLoading: "Leyendo esta versión guardada…",
  historyDetailError: "No se pudo leer esta versión guardada.",
  historyBackToTimeline: "Volver a versiones guardadas",
  historyRootComparison: "Todos los archivos aparecen como nuevos porque es la primera versión guardada.",
  historyNormalComparison: "Comparada con la versión guardada justo anterior.",
  historyMergeComparison: "Comparada con su primer padre, y todos los padres aparecen en Detalles técnicos.",
  historyChangedFiles: (count) => `${count} ${count === 1 ? "archivo cambiado" : "archivos cambiados"}`,
  historyChangedFilesMinimum: (count) => `Al menos ${count} archivos cambiados`,
  historyFilesTruncated: "Solo se muestran los primeros archivos cambiados.",
  historyFilesAriaLabel: "Archivos cambiados en esta versión guardada",
  historyFilterFilesPlaceholder: "Filtrar archivos",
  historyFilterFilesAriaLabel: "Filtrar archivos cambiados",
  historyNoFileMatches: "Ningún archivo cambiado coincide con la búsqueda.",
  historyCopyFilePath: "Copiar ruta del archivo",
  historyFilePathCopied: "Ruta del archivo copiada",
  historyNoChangedFiles: "En esta versión no cambió el contenido de ningún archivo.",
  historyDiffLoading: "Leyendo los cambios…",
  historyDiffError: "No se pudieron leer los cambios de este archivo.",
  historySelectFilePrompt: "Elige un archivo para ver sus cambios.",
  historyVersionDate: (absolute) => `Guardada el ${absolute}`,
};

export const historyTranslations = { en, es } as const;
