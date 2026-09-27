export interface OverviewTranslations {
  overviewLocalProject: string;
  overviewSeparateWorkspace: string;
  overviewProjectReady: string;
  overviewWorktreeReady: string;
  overviewUnbornReady: string;
  overviewDetachedReady: string;
  overviewOpenAnotherProject: string;
  overviewCurrentVersionLine: string;
  overviewSpecificSavedVersion: string;
  overviewNoSavedVersions: string;
  overviewVersionLineDescription: string;
  overviewDetachedDescription: string;
  overviewUnbornDescription: string;
  overviewProjectType: string;
  overviewRepositoryTypeDescription: string;
  overviewWorktreeTypeDescription: string;
  overviewTechnicalDetails: string;
  overviewResolvedRoot: string;
  overviewSelectedFolder: string;
  overviewGitDirectory: string;
  overviewCommonGitDirectory: string;
  overviewCopyPath: string;
  overviewPathCopied: string;
  overviewCopyPathFailedTitle: string;
  overviewCopyPathFailedMessage: string;
  overviewOpeningTitle: string;
  overviewOpeningDescription: string;
  overviewOpenFailedTitle: string;
  overviewReviewChanges: string;
  overviewSaveVersion: string;
  overviewCheckLocalAgain: string;
  /** The changed-files card: its title, and the line under it saying what
   * the files are counted from. */
  overviewChangedFilesTitle: string;
  overviewChangedFilesSince: string;
  overviewChangesPreviewLabel: string;
  overviewChangesPreviewOpenFile: (path: string) => string;
  /** The band across the top: change, save, publish. One label per step,
   * one value and one hint per state, and the sentence under the band. */
  overviewJourneyTitle: string;
  overviewJourneyChanges: string;
  overviewJourneySave: string;
  overviewJourneyPublish: string;
  overviewJourneyNextStep: string;
  overviewJourneyNoChanges: string;
  overviewJourneyNothingChanged: string;
  overviewJourneyResolve: string;
  overviewJourneySaveWaiting: string;
  overviewJourneySaveWaitingHint: string;
  overviewJourneySaveBlocked: string;
  overviewJourneySaveBlockedHint: string;
  overviewJourneySaveDoneHint: string;
  overviewJourneySaveActive: string;
  overviewJourneyCheckHint: string;
  overviewJourneyReadyToPublish: (count: number) => string;
  overviewJourneyNewerAvailable: (count: number) => string;
  overviewJourneyNoRemote: string;
  overviewJourneyNoRemoteHint: string;
  overviewJourneyNoUpstream: string;
  overviewJourneyNoteSave: string;
  overviewJourneyNoteNoRemote: string;
  overviewJourneyNoteAllDone: string;
  overviewJourneyNoteIdle: string;
  overviewPublishAll: (count: number) => string;
  overviewHistoryTitle: string;
  overviewHistoryDescription: string;
  overviewHistoryViewAll: string;
  overviewHistoryLoading: string;
  overviewHistoryErrorTitle: string;
  overviewHistoryError: string;
  overviewHistoryRetry: string;
  overviewHistoryEmptyTitle: string;
  overviewHistoryEmptyDescription: string;
  overviewHistoryListLabel: string;
  overviewHistoryUntitled: string;
  overviewHistoryUnknownAuthor: string;
  overviewHistoryPublished: string;
  overviewHistoryLocalOnly: string;
  overviewHistoryPublicationUnknown: string;
  overviewHistoryOpenVersion: (title: string) => string;
  overviewHistoryRefreshFailed: string;
  overviewPublishChanges: string;
  overviewPendingVersionsError: string;
  /** On an unpublished row of Recent history: publish it and every older
   * version, through the previewed flow. */
  overviewPublishUpTo: string;
  overviewPublishUpToHint: string;
  overviewCloseProject: string;
  overviewEmptyTitle: string;
  overviewHomeTitle: string;
  overviewEmptyDescription: string;
  overviewOpening: string;
  overviewOpenProject: string;
  overviewCloneRemoteProject: string;
  overviewCreateLocalProject: string;
  /** One line under each welcome action, answering "which of these three is
   * mine?" — the labels alone don't separate opening a folder that is already
   * a project from creating or downloading one. */
  overviewCreateLocalProjectHint: string;
  overviewOpenProjectHint: string;
  overviewCloneRemoteProjectHint: string;
  /** Discovery line for the window's drag-and-drop: the gesture works, and
   * nothing on screen said so. */
  overviewDropFolderHint: string;
  overviewRecentProjectsTitle: string;
  /** The star beside the recents heading: the same view filter the version
   * line quick switch has, in the recents' own words. */
  overviewRecentFavouritesOnly: string;
  overviewRecentFavouritesOnlyOff: string;
  overviewForgetRecentProject: (name: string) => string;
  overviewForgetRecentProjectShort: string;
  overviewOpenDialogTitle: string;
  overviewCouldntOpenFolder: string;
}

const en: OverviewTranslations = {
  overviewLocalProject: "Local project",
  overviewSeparateWorkspace: "Separate workspace",
  overviewProjectReady: "Your project is ready",
  overviewWorktreeReady: "Your separate workspace is ready",
  overviewUnbornReady: "Your new project is ready",
  overviewDetachedReady: "A specific saved version is open",
  overviewOpenAnotherProject: "Open another project",
  overviewCurrentVersionLine: "Current version line",
  overviewSpecificSavedVersion: "Specific saved version",
  overviewNoSavedVersions: "No saved versions yet",
  overviewVersionLineDescription: "New work goes on this line.",
  overviewDetachedDescription: "You're looking at a specific point in history.",
  overviewUnbornDescription: "Your first saved version starts this project's history.",
  overviewProjectType: "Project type",
  overviewRepositoryTypeDescription: "A standard project in this folder.",
  overviewWorktreeTypeDescription: "A linked workspace with its own files and version line.",
  overviewTechnicalDetails: "Technical details",
  overviewResolvedRoot: "Project root",
  overviewSelectedFolder: "Folder you selected",
  overviewGitDirectory: "Git directory",
  overviewCommonGitDirectory: "Shared Git directory",
  overviewCopyPath: "Copy project path",
  overviewPathCopied: "Path copied",
  overviewCopyPathFailedTitle: "Couldn't copy the path",
  overviewCopyPathFailedMessage: "Select the path and copy it by hand.",
  overviewOpeningTitle: "Opening project…",
  overviewOpeningDescription: "Checking the selected folder.",
  overviewOpenFailedTitle: "Couldn't open that project",
  overviewReviewChanges: "Review changes",
  overviewSaveVersion: "Save version",
  overviewCheckLocalAgain: "Check local changes again",
  overviewChangedFilesTitle: "Changed files",
  overviewChangedFilesSince: "Since your last saved version.",
  overviewChangesPreviewLabel: "Changed files",
  overviewChangesPreviewOpenFile: (path) => `Review ${path}`,
  overviewJourneyTitle: "Where your work is",
  overviewJourneyChanges: "Changes",
  overviewJourneySave: "Save",
  overviewJourneyPublish: "Publish",
  overviewJourneyNextStep: "next step",
  overviewJourneyNoChanges: "No unsaved changes",
  overviewJourneyNothingChanged: "Nothing changed since your last saved version.",
  overviewJourneyResolve: "Resolve overlaps",
  overviewJourneySaveWaiting: "Waiting for the check",
  overviewJourneySaveWaitingHint: "You can save once your files are checked.",
  overviewJourneySaveBlocked: "Resolve the overlaps first",
  overviewJourneySaveBlockedHint: "Files with overlapping changes can't be saved yet.",
  overviewJourneySaveDoneHint: "Every change is in a saved version.",
  overviewJourneySaveActive: "Keep your work safe",
  overviewJourneyCheckHint: "Check the remote for the latest changes.",
  overviewJourneyReadyToPublish: (count) =>
    count === 1 ? "1 version ready to publish" : `${count} versions ready to publish`,
  overviewJourneyNewerAvailable: (count) =>
    count === 1 ? "1 newer version available" : `${count} newer versions available`,
  overviewJourneyNoRemote: "No remote yet",
  overviewJourneyNoRemoteHint: "Add one in project settings to share your work.",
  overviewJourneyNoUpstream: "No publish destination yet",
  overviewJourneyNoteSave: "Saving keeps a point to come back to, and nothing leaves this computer until you publish.",
  overviewJourneyNoteNoRemote: "Everything is saved on this computer, so add a remote whenever you want to share it.",
  overviewJourneyNoteAllDone: "Everything is saved and published.",
  overviewJourneyNoteIdle: "Checking your project…",
  overviewPublishAll: (count) => (count === 1 ? "Publish all" : `Publish all ${count}`),
  overviewHistoryTitle: "Recent history",
  overviewHistoryDescription: "Your latest saved versions, newest first.",
  overviewHistoryViewAll: "View all",
  overviewHistoryLoading: "Loading recent history…",
  overviewHistoryErrorTitle: "Recent history is unavailable",
  overviewHistoryError: "Couldn't load recent saved versions.",
  overviewHistoryRetry: "Try again",
  overviewHistoryEmptyTitle: "No saved versions yet",
  overviewHistoryEmptyDescription: "Your first saved version will show up here.",
  overviewHistoryListLabel: "Recent saved versions",
  overviewHistoryUntitled: "Untitled saved version",
  overviewHistoryUnknownAuthor: "Unknown author",
  overviewHistoryPublished: "Published",
  overviewHistoryLocalOnly: "Not published",
  overviewHistoryPublicationUnknown: "Publish status unknown",
  overviewHistoryOpenVersion: (title) => `Open “${title}” in History`,
  overviewHistoryRefreshFailed: "Recent history may be out of date.",
  overviewPublishChanges: "Publish changes",
  overviewPendingVersionsError: "Couldn't load the versions waiting to be published.",
  overviewPublishUpTo: "Publish up to here",
  overviewPublishUpToHint: "Publishes this version and all older ones.",
  overviewCloseProject: "Close project",
  overviewEmptyTitle: "No project open",
  overviewHomeTitle: "What would you like to open?",
  overviewEmptyDescription: "Choose how to start. Everything stays on this computer until you publish.",
  overviewOpening: "Opening…",
  overviewOpenProject: "Open a project",
  overviewCloneRemoteProject: "Clone a remote project",
  overviewCreateLocalProject: "Create a local project",
  overviewCreateLocalProjectHint: "A new or existing folder",
  overviewOpenProjectHint: "A folder that uses Git",
  overviewCloneRemoteProjectHint: "Download from a server",
  overviewDropFolderHint: "Or drag a project folder onto this window.",
  overviewRecentProjectsTitle: "Recent projects",
  overviewRecentFavouritesOnly: "Show favorite projects only",
  overviewRecentFavouritesOnlyOff: "Show all recent projects",
  overviewForgetRecentProject: (name) => `Remove ${name} from recent projects`,
  overviewForgetRecentProjectShort: "Remove from recent projects",
  overviewOpenDialogTitle: "Open a Git project",
  overviewCouldntOpenFolder: "Couldn't open that folder.",
};

const es: OverviewTranslations = {
  overviewLocalProject: "Proyecto local",
  overviewSeparateWorkspace: "Espacio de trabajo separado",
  overviewProjectReady: "Tu proyecto está listo",
  overviewWorktreeReady: "Tu espacio de trabajo separado está listo",
  overviewUnbornReady: "Tu proyecto nuevo está listo",
  overviewDetachedReady: "Tienes abierta una versión guardada concreta",
  overviewOpenAnotherProject: "Abrir otro proyecto",
  overviewCurrentVersionLine: "Línea de versión actual",
  overviewSpecificSavedVersion: "Versión guardada concreta",
  overviewNoSavedVersions: "Aún no hay versiones guardadas",
  overviewVersionLineDescription: "El trabajo nuevo va a esta línea.",
  overviewDetachedDescription: "Estás viendo un punto concreto del historial.",
  overviewUnbornDescription: "Tu primera versión guardada inicia el historial del proyecto.",
  overviewProjectType: "Tipo de proyecto",
  overviewRepositoryTypeDescription: "Un proyecto normal en esta carpeta.",
  overviewWorktreeTypeDescription: "Un espacio de trabajo vinculado, con sus propios archivos y línea de versión.",
  overviewTechnicalDetails: "Detalles técnicos",
  overviewResolvedRoot: "Raíz del proyecto",
  overviewSelectedFolder: "Carpeta que elegiste",
  overviewGitDirectory: "Directorio de Git",
  overviewCommonGitDirectory: "Directorio de Git compartido",
  overviewCopyPath: "Copiar la ruta del proyecto",
  overviewPathCopied: "Ruta copiada",
  overviewCopyPathFailedTitle: "No se pudo copiar la ruta",
  overviewCopyPathFailedMessage: "Selecciona la ruta y cópiala a mano.",
  overviewOpeningTitle: "Abriendo el proyecto…",
  overviewOpeningDescription: "Comprobando la carpeta elegida.",
  overviewOpenFailedTitle: "No se pudo abrir ese proyecto",
  overviewReviewChanges: "Revisar cambios",
  overviewSaveVersion: "Guardar versión",
  overviewCheckLocalAgain: "Volver a comprobar los cambios locales",
  overviewChangedFilesTitle: "Archivos modificados",
  overviewChangedFilesSince: "Desde tu última versión guardada.",
  overviewChangesPreviewLabel: "Archivos modificados",
  overviewChangesPreviewOpenFile: (path) => `Revisar ${path}`,
  overviewJourneyTitle: "Dónde está tu trabajo",
  overviewJourneyChanges: "Cambios",
  overviewJourneySave: "Guardar",
  overviewJourneyPublish: "Publicar",
  overviewJourneyNextStep: "siguiente paso",
  overviewJourneyNoChanges: "Nada sin guardar",
  overviewJourneyNothingChanged: "Nada ha cambiado desde tu última versión guardada.",
  overviewJourneyResolve: "Resolver solapamientos",
  overviewJourneySaveWaiting: "Esperando la comprobación",
  overviewJourneySaveWaitingHint: "Podrás guardar cuando se revisen tus archivos.",
  overviewJourneySaveBlocked: "Resuelve antes los solapamientos",
  overviewJourneySaveBlockedHint: "Los archivos con cambios superpuestos aún no se pueden guardar.",
  overviewJourneySaveDoneHint: "Todos los cambios están en una versión guardada.",
  overviewJourneySaveActive: "Pon tu trabajo a salvo",
  overviewJourneyCheckHint: "Comprueba el remoto para ver lo último.",
  overviewJourneyReadyToPublish: (count) =>
    count === 1 ? "1 versión lista para publicar" : `${count} versiones listas para publicar`,
  overviewJourneyNewerAvailable: (count) =>
    count === 1 ? "1 versión nueva disponible" : `${count} versiones nuevas disponibles`,
  overviewJourneyNoRemote: "Aún sin remoto",
  overviewJourneyNoRemoteHint: "Añade uno en los ajustes del proyecto para compartir tu trabajo.",
  overviewJourneyNoUpstream: "Aún sin destino de publicación",
  overviewJourneyNoteSave: "Guardar crea un punto al que volver y nada sale de este ordenador hasta que publiques.",
  overviewJourneyNoteNoRemote: "Todo está guardado en este ordenador, así que añade un remoto cuando quieras compartirlo.",
  overviewJourneyNoteAllDone: "Todo está guardado y publicado.",
  overviewJourneyNoteIdle: "Revisando tu proyecto…",
  overviewPublishAll: (count) => (count === 1 ? "Publicar todo" : `Publicar las ${count}`),
  overviewHistoryTitle: "Historial reciente",
  overviewHistoryDescription: "Tus últimas versiones guardadas, de la más reciente a la más antigua.",
  overviewHistoryViewAll: "Ver todo",
  overviewHistoryLoading: "Cargando el historial reciente…",
  overviewHistoryErrorTitle: "El historial reciente no está disponible",
  overviewHistoryError: "No se pudieron cargar las versiones guardadas recientes.",
  overviewHistoryRetry: "Reintentar",
  overviewHistoryEmptyTitle: "Aún no hay versiones guardadas",
  overviewHistoryEmptyDescription: "Tu primera versión guardada aparecerá aquí.",
  overviewHistoryListLabel: "Versiones guardadas recientes",
  overviewHistoryUntitled: "Versión guardada sin título",
  overviewHistoryUnknownAuthor: "Autor desconocido",
  overviewHistoryPublished: "Publicada",
  overviewHistoryLocalOnly: "Sin publicar",
  overviewHistoryPublicationUnknown: "Publicación desconocida",
  overviewHistoryOpenVersion: (title) => `Abrir «${title}» en Historial`,
  overviewHistoryRefreshFailed: "El historial reciente puede estar desactualizado.",
  overviewPublishChanges: "Publicar cambios",
  overviewPendingVersionsError: "No se pudieron cargar las versiones pendientes de publicar.",
  overviewPublishUpTo: "Publicar hasta aquí",
  overviewPublishUpToHint: "Publica esta versión y todas las anteriores.",
  overviewCloseProject: "Cerrar proyecto",
  overviewEmptyTitle: "Ningún proyecto abierto",
  overviewHomeTitle: "¿Qué te gustaría abrir?",
  overviewEmptyDescription: "Elige cómo empezar. Todo se queda en este ordenador hasta que publiques.",
  overviewOpening: "Abriendo…",
  overviewOpenProject: "Abrir un proyecto",
  overviewCloneRemoteProject: "Clonar un proyecto remoto",
  overviewCreateLocalProject: "Crear un proyecto local",
  overviewCreateLocalProjectHint: "Carpeta nueva o tuya",
  overviewOpenProjectHint: "Una carpeta con Git",
  overviewCloneRemoteProjectHint: "Desde un servidor",
  overviewDropFolderHint: "O arrastra la carpeta de un proyecto a esta ventana.",
  overviewRecentProjectsTitle: "Proyectos recientes",
  overviewRecentFavouritesOnly: "Ver solo proyectos favoritos",
  overviewRecentFavouritesOnlyOff: "Ver todos los proyectos recientes",
  overviewForgetRecentProject: (name) => `Quitar ${name} de proyectos recientes`,
  overviewForgetRecentProjectShort: "Quitar de proyectos recientes",
  overviewOpenDialogTitle: "Abrir un proyecto de Git",
  overviewCouldntOpenFolder: "No se pudo abrir esa carpeta.",
};

export const overviewTranslations = { en, es } as const;
