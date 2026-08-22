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
  overviewComingSoonBadge: string;
  overviewHistoryPreviewTitle: string;
  overviewHistoryPreviewDescription: string;
  overviewRecoveryPreviewTitle: string;
  overviewRecoveryPreviewDescription: string;
  overviewChangeVersionLine: string;
  overviewNewVersionLine: string;
  overviewQuickSwitchTitle: string;
  overviewQuickSwitchEmpty: string;
  overviewQuickSwitchSeeAll: string;
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
  overviewComingSoonBadge: "Coming soon",
  overviewHistoryPreviewTitle: "History",
  overviewHistoryPreviewDescription:
    "A timeline of the versions you have saved, so you can see how the project got here.",
  overviewRecoveryPreviewTitle: "Recovery",
  overviewRecoveryPreviewDescription:
    "Get work back after a mistake — restore a file, or undo a version you did not mean to save.",
  overviewChangeVersionLine: "Change",
  overviewNewVersionLine: "New",
  overviewQuickSwitchTitle: "Switch version line",
  overviewQuickSwitchEmpty: "There are no other version lines yet.",
  overviewQuickSwitchSeeAll: "See all version lines",
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
  overviewComingSoonBadge: "Próximamente",
  overviewHistoryPreviewTitle: "Historial",
  overviewHistoryPreviewDescription:
    "Una línea de tiempo de las versiones que has guardado, para ver cómo llegó el proyecto hasta aquí.",
  overviewRecoveryPreviewTitle: "Recuperación",
  overviewRecoveryPreviewDescription:
    "Recupera trabajo tras un error: restaura un archivo o deshaz una versión que no querías guardar.",
  overviewChangeVersionLine: "Cambiar",
  overviewNewVersionLine: "Nueva",
  overviewQuickSwitchTitle: "Cambiar línea de versión",
  overviewQuickSwitchEmpty: "Todavía no hay otras líneas de versión.",
  overviewQuickSwitchSeeAll: "Ver todas las líneas de versión",
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
