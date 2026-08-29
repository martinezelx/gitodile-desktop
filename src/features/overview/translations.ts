export interface OverviewTranslations {
  overviewRepositoryBranch: (branch: string) => string;
  overviewWorktreeBranch: (branch: string) => string;
  overviewRepositoryDetached: string;
  overviewWorktreeDetached: string;
  overviewRepositoryUnborn: (branch: string) => string;
  overviewWorktreeUnborn: (branch: string) => string;
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
  overviewOpenedFrom: string;
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
  overviewVersionsAhead: (count: number) => string;
  overviewChangesPreviewLabel: string;
  overviewChangesPreviewMore: (remaining: number) => string;
  overviewChangesPreviewOpenFile: (path: string) => string;
  overviewCategoryEdited: (count: number) => string;
  overviewCategoryAdded: (count: number) => string;
  overviewCategoryDeleted: (count: number) => string;
  overviewCategoryRenamed: (count: number) => string;
  overviewCategoryConflicted: (count: number) => string;
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
  overviewPendingVersionsTitle: (count: number) => string;
  overviewPendingVersionsGuidance: string;
  overviewPendingVersionsTruncated: (visible: number, total: number) => string;
  overviewPendingVersionsError: string;
  overviewSavedAndReadyTitle: string;
  overviewSavedAndReadyMessage: (count: number) => string;
  overviewPublishUpTo: string;
  overviewCloseProject: string;
  overviewEmptyTitle: string;
  overviewEmptyDescription: string;
  overviewOpening: string;
  overviewOpenProject: string;
  overviewCloneRemoteProject: string;
  overviewCreateLocalProject: string;
  overviewOpenDialogTitle: string;
  overviewCouldntOpenFolder: string;
}

const en: OverviewTranslations = {
  overviewRepositoryBranch: (branch) => `Git project on version line “${branch}”.`,
  overviewWorktreeBranch: (branch) => `Separate workspace on version line “${branch}”.`,
  overviewRepositoryDetached: "Git project opened at a specific saved version.",
  overviewWorktreeDetached: "Separate workspace opened at a specific saved version.",
  overviewRepositoryUnborn: (branch) => `New Git project on version line “${branch}”, with no saved versions yet.`,
  overviewWorktreeUnborn: (branch) => `New separate workspace on version line “${branch}”, with no saved versions yet.`,
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
  overviewVersionLineDescription: "New work will stay on this version line.",
  overviewDetachedDescription: "You are inspecting an exact point in the project history.",
  overviewUnbornDescription: "The first saved version will start this project’s history.",
  overviewOpenedFrom: "Opened from a folder inside this project",
  overviewProjectType: "Project type",
  overviewRepositoryTypeDescription: "A standard project stored in this folder.",
  overviewWorktreeTypeDescription: "A linked workspace with its own files and version line.",
  overviewTechnicalDetails: "Technical project details",
  overviewResolvedRoot: "Project root",
  overviewSelectedFolder: "Folder you selected",
  overviewGitDirectory: "Git directory",
  overviewCommonGitDirectory: "Shared Git directory",
  overviewCopyPath: "Copy project path",
  overviewPathCopied: "Path copied",
  overviewCopyPathFailedTitle: "Couldn't copy the path",
  overviewCopyPathFailedMessage: "Select the project path and copy it manually.",
  overviewOpeningTitle: "Opening project…",
  overviewOpeningDescription: "GitOdrile is checking the selected folder.",
  overviewOpenFailedTitle: "We couldn’t open that project",
  overviewReviewChanges: "Review changes",
  overviewSaveVersion: "Save version",
  overviewCheckLocalAgain: "Check local changes again",
  overviewVersionsAhead: (count) => (count === 1 ? "1 ready to publish" : `${count} ready to publish`),
  overviewChangesPreviewLabel: "Changed files",
  overviewChangesPreviewMore: (remaining) =>
    remaining === 1 ? "See 1 more file" : `See ${remaining} more files`,
  overviewChangesPreviewOpenFile: (path) => `Review ${path}`,
  overviewCategoryEdited: (count) => `Edited (${count})`,
  overviewCategoryAdded: (count) => `Added (${count})`,
  overviewCategoryDeleted: (count) => `Deleted (${count})`,
  overviewCategoryRenamed: (count) => `Renamed (${count})`,
  overviewCategoryConflicted: (count) => `Conflicts (${count})`,
  overviewPublishAll: (count) => (count === 1 ? "Publish all" : `Publish all ${count}`),
  overviewHistoryTitle: "Recent history",
  overviewHistoryDescription: "Your latest saved versions, newest first.",
  overviewHistoryViewAll: "View all",
  overviewHistoryLoading: "Loading recent history…",
  overviewHistoryErrorTitle: "Recent history is unavailable",
  overviewHistoryError: "GitOdrile couldn't load the recent saved versions.",
  overviewHistoryRetry: "Try again",
  overviewHistoryEmptyTitle: "No saved versions yet",
  overviewHistoryEmptyDescription: "Your first saved version will appear here.",
  overviewHistoryListLabel: "Recent saved versions",
  overviewHistoryUntitled: "Saved version without a title",
  overviewHistoryUnknownAuthor: "Unknown author",
  overviewHistoryPublished: "Published",
  overviewHistoryLocalOnly: "Not published",
  overviewHistoryPublicationUnknown: "Publication unknown",
  overviewHistoryOpenVersion: (title) => `Open “${title}” in history`,
  overviewHistoryRefreshFailed: "Recent history may be out of date.",
  overviewPublishChanges: "Publish changes",
  overviewPendingVersionsTitle: (count) => `Saved versions not yet published (${count})`,
  overviewPendingVersionsGuidance:
    "Newest first. Publishing through a version also publishes every older version below it.",
  overviewPendingVersionsTruncated: (visible, total) => `Showing the ${visible} newest of ${total}.`,
  overviewPendingVersionsError: "GitOdrile couldn't load the saved versions waiting to be published.",
  overviewSavedAndReadyTitle: "Your files are saved",
  overviewSavedAndReadyMessage: (count) =>
    count === 1 ? "1 saved version is ready to publish." : `${count} saved versions are ready to publish.`,
  overviewPublishUpTo: "Publish up to here",
  overviewCloseProject: "Close project",
  overviewEmptyTitle: "No project open",
  overviewEmptyDescription:
    "Open a Git project to review changes, save versions, publish work, and recover from mistakes.",
  overviewOpening: "Opening…",
  overviewOpenProject: "Open a project",
  overviewCloneRemoteProject: "Clone a remote project",
  overviewCreateLocalProject: "Create a local project",
  overviewOpenDialogTitle: "Open a Git project",
  overviewCouldntOpenFolder: "Couldn't open that folder.",
};

const es: OverviewTranslations = {
  overviewRepositoryBranch: (branch) => `Proyecto de Git en la línea de versión «${branch}».`,
  overviewWorktreeBranch: (branch) => `Espacio de trabajo separado en la línea de versión «${branch}».`,
  overviewRepositoryDetached: "Proyecto de Git abierto en una versión guardada concreta.",
  overviewWorktreeDetached: "Espacio de trabajo separado abierto en una versión guardada concreta.",
  overviewRepositoryUnborn: (branch) =>
    `Proyecto de Git nuevo en la línea de versión «${branch}», todavía sin versiones guardadas.`,
  overviewWorktreeUnborn: (branch) =>
    `Espacio de trabajo separado nuevo en la línea de versión «${branch}», todavía sin versiones guardadas.`,
  overviewLocalProject: "Proyecto local",
  overviewSeparateWorkspace: "Espacio de trabajo separado",
  overviewProjectReady: "Tu proyecto está listo",
  overviewWorktreeReady: "Tu espacio de trabajo separado está listo",
  overviewUnbornReady: "Tu nuevo proyecto está listo",
  overviewDetachedReady: "Hay abierta una versión guardada concreta",
  overviewOpenAnotherProject: "Abrir otro proyecto",
  overviewCurrentVersionLine: "Línea de versión actual",
  overviewSpecificSavedVersion: "Versión guardada concreta",
  overviewNoSavedVersions: "Todavía no hay versiones guardadas",
  overviewVersionLineDescription: "El trabajo nuevo permanecerá en esta línea de versión.",
  overviewDetachedDescription: "Estás inspeccionando un punto exacto del historial del proyecto.",
  overviewUnbornDescription: "La primera versión guardada iniciará el historial de este proyecto.",
  overviewOpenedFrom: "Abierto desde una carpeta dentro de este proyecto",
  overviewProjectType: "Tipo de proyecto",
  overviewRepositoryTypeDescription: "Un proyecto estándar guardado en esta carpeta.",
  overviewWorktreeTypeDescription: "Un espacio enlazado con sus propios archivos y línea de versión.",
  overviewTechnicalDetails: "Detalles técnicos del proyecto",
  overviewResolvedRoot: "Raíz del proyecto",
  overviewSelectedFolder: "Carpeta que seleccionaste",
  overviewGitDirectory: "Directorio de Git",
  overviewCommonGitDirectory: "Directorio de Git compartido",
  overviewCopyPath: "Copiar la ruta del proyecto",
  overviewPathCopied: "Ruta copiada",
  overviewCopyPathFailedTitle: "No se pudo copiar la ruta",
  overviewCopyPathFailedMessage: "Selecciona la ruta del proyecto y cópiala manualmente.",
  overviewOpeningTitle: "Abriendo el proyecto…",
  overviewOpeningDescription: "GitOdrile está comprobando la carpeta seleccionada.",
  overviewOpenFailedTitle: "No hemos podido abrir ese proyecto",
  overviewReviewChanges: "Revisar cambios",
  overviewSaveVersion: "Guardar versión",
  overviewCheckLocalAgain: "Comprobar de nuevo los cambios locales",
  overviewVersionsAhead: (count) => (count === 1 ? "1 lista para publicar" : `${count} listas para publicar`),
  overviewChangesPreviewLabel: "Archivos modificados",
  overviewChangesPreviewMore: (remaining) =>
    remaining === 1 ? "Ver 1 archivo más" : `Ver ${remaining} archivos más`,
  overviewChangesPreviewOpenFile: (path) => `Revisar ${path}`,
  overviewCategoryEdited: (count) => `Editados (${count})`,
  overviewCategoryAdded: (count) => `Añadidos (${count})`,
  overviewCategoryDeleted: (count) => `Eliminados (${count})`,
  overviewCategoryRenamed: (count) => `Renombrados (${count})`,
  overviewCategoryConflicted: (count) => `Conflictos (${count})`,
  overviewPublishAll: (count) => (count === 1 ? "Publicar todo" : `Publicar las ${count}`),
  overviewHistoryTitle: "Historial reciente",
  overviewHistoryDescription: "Tus últimas versiones guardadas, de más reciente a más antigua.",
  overviewHistoryViewAll: "Ver todo",
  overviewHistoryLoading: "Cargando el historial reciente…",
  overviewHistoryErrorTitle: "El historial reciente no está disponible",
  overviewHistoryError: "GitOdrile no pudo cargar las versiones guardadas recientes.",
  overviewHistoryRetry: "Reintentar",
  overviewHistoryEmptyTitle: "Todavía no hay versiones guardadas",
  overviewHistoryEmptyDescription: "Tu primera versión guardada aparecerá aquí.",
  overviewHistoryListLabel: "Versiones guardadas recientes",
  overviewHistoryUntitled: "Versión guardada sin título",
  overviewHistoryUnknownAuthor: "Autor desconocido",
  overviewHistoryPublished: "Publicada",
  overviewHistoryLocalOnly: "Sin publicar",
  overviewHistoryPublicationUnknown: "Publicación desconocida",
  overviewHistoryOpenVersion: (title) => `Abrir «${title}» en el historial`,
  overviewHistoryRefreshFailed: "El historial reciente puede estar desactualizado.",
  overviewPublishChanges: "Publicar cambios",
  overviewPendingVersionsTitle: (count) => `Versiones guardadas sin publicar (${count})`,
  overviewPendingVersionsGuidance:
    "Las más recientes aparecen primero. Publicar hasta una versión también publica todas las anteriores que aparecen debajo.",
  overviewPendingVersionsTruncated: (visible, total) => `Se muestran las ${visible} más recientes de ${total}.`,
  overviewPendingVersionsError: "GitOdrile no pudo cargar las versiones guardadas pendientes de publicar.",
  overviewSavedAndReadyTitle: "Tus archivos están guardados",
  overviewSavedAndReadyMessage: (count) =>
    count === 1
      ? "Hay 1 versión guardada lista para publicar."
      : `Hay ${count} versiones guardadas listas para publicar.`,
  overviewPublishUpTo: "Publicar hasta aquí",
  overviewCloseProject: "Cerrar proyecto",
  overviewEmptyTitle: "No hay ningún proyecto abierto",
  overviewEmptyDescription:
    "Abre un proyecto de Git para revisar cambios, guardar versiones, publicar tu trabajo y recuperarte de errores.",
  overviewOpening: "Abriendo…",
  overviewOpenProject: "Abrir un proyecto",
  overviewCloneRemoteProject: "Clonar un proyecto remoto",
  overviewCreateLocalProject: "Crear un proyecto local",
  overviewOpenDialogTitle: "Abrir un proyecto de Git",
  overviewCouldntOpenFolder: "No se pudo abrir esa carpeta.",
};

export const overviewTranslations = { en, es } as const;
