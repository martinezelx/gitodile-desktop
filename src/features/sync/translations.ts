export interface SyncTranslations {
  syncTitle: string;
  syncNotCheckedTitle: string;
  syncNotCheckedMessage: string;
  syncCheckingTitle: string;
  syncCheckingMessage: string;
  syncUpToDateTitle: string;
  syncUpToDateMessage: string;
  syncAheadTitle: (count: number) => string;
  syncAheadMessage: string;
  syncBehindTitle: (count: number) => string;
  syncBehindMessage: string;
  syncDivergedTitle: string;
  syncDivergedMessage: string;
  syncNoRemoteTitle: string;
  syncNoRemoteMessage: string;
  syncNoUpstreamTitle: string;
  syncNoUpstreamMessage: string;
  syncDetachedTitle: string;
  syncDetachedMessage: string;
  syncUnbornTitle: string;
  syncUnbornMessage: string;
  syncUnknownTitle: string;
  syncUnknownMessage: string;
  syncUnavailableTitle: string;
  syncCachedNote: string;
  syncStaleNote: string;
  syncLastChecked: (value: string) => string;
  syncCheck: string;
  syncChecking: string;
  syncCheckAgain: string;
  syncPublish: string;
  syncReviewAndGet: string;
  syncComingSoon: string;
  syncCurrentLine: string;
  syncTeamLine: string;
  syncRelationshipLabel: (local: string, team: string) => string;
  syncTechnicalDetails: string;
  syncRemote: string;
  syncDestination: string;
  syncTrackingRef: string;
  syncLocalCommit: string;
  syncRemoteCommit: string;
  syncAheadCount: string;
  syncBehindCount: string;
  syncNotAvailable: string;
  getTeamDialogTitle: string;
  getTeamDialogDescription: string;
  getTeamProgressLabel: string;
  getTeamPhaseTeam: string;
  getTeamPhaseRecovery: string;
  getTeamPhaseUpdating: string;
  getTeamIncomingVersions: (count: number) => string;
  getTeamVersionsTruncated: (shown: number, total: number) => string;
  getTeamAffectedFiles: (count: number) => string;
  getTeamFilesTruncated: (shown: number, total: number) => string;
  getTeamBinaryFile: string;
  getTeamFileCategory: { added: string; modified: string; deleted: string; renamed: string };
  getTeamOperationKind: string;
  getTeamRecoveryReference: string;
  getTeamStateToken: string;
  getTeamTechnicalGuarantees: string;
  getTeamBlockedTitle: string;
  getTeamDivergedTitle: string;
  getTeamDivergedNoRetry: string;
  getTeamSaveFirstTitle: string;
  getTeamSaveFirstBody: string;
  getTeamDirtyBody: string;
  getTeamSaveVersion: string;
  getTeamLineCatchesUp: (branch: string) => string;
  getTeamRecoveryFirst: string;
  getTeamSuccessToast: (count: number) => string;
  getTeamConfirm: string;
  getTeamReviewUpdatedPlan: string;
  getTeamTryAgain: string;
  getTeamUncertainTitle: string;
  getTeamUncertainInstructions: string;
  getTeamObservedHead: string;
}

const en: SyncTranslations = {
  syncTitle: "Project changes",
  syncNotCheckedTitle: "Not checked yet",
  syncNotCheckedMessage: "Check the remote project for the latest changes.",
  syncCheckingTitle: "Checking for project changes…",
  syncCheckingMessage: "Only remote information is read, and your files don't change.",
  syncUpToDateTitle: "You're up to date",
  syncUpToDateMessage: "Nothing to publish or get.",
  syncAheadTitle: (count) => `${count} saved ${count === 1 ? "version is" : "versions are"} ready to publish`,
  syncAheadMessage: "They're only on this computer.",
  syncBehindTitle: (count) => `${count} newer ${count === 1 ? "version is" : "versions are"} available`,
  syncBehindMessage: "Review what will change before getting them.",
  syncDivergedTitle: "Both sides have changed",
  syncDivergedMessage: "Your line and the remote have different work, and nothing is combined automatically.",
  syncNoRemoteTitle: "No remote yet",
  syncNoRemoteMessage: "Add a remote to check for project changes.",
  syncNoUpstreamTitle: "Choose a publish destination first",
  syncNoUpstreamMessage: "Publish this line to connect it to the remote.",
  syncDetachedTitle: "Switch to a version line to check",
  syncDetachedMessage: "A specific saved version has nothing to compare on the remote.",
  syncUnbornTitle: "Save a version before checking",
  syncUnbornMessage: "There's no saved version to compare yet.",
  syncUnknownTitle: "Comparison unavailable",
  syncUnknownMessage: "Couldn't compare with the remote branch.",
  syncUnavailableTitle: "Couldn't check project changes",
  syncCachedNote: "Not checked this session · showing the last known state.",
  syncStaleNote: "This may be out of date.",
  syncLastChecked: (value) => `Checked ${value}.`,
  syncCheck: "Check for project changes",
  syncChecking: "Checking…",
  syncCheckAgain: "Check again",
  syncPublish: "Publish changes",
  syncReviewAndGet: "Review and get",
  syncComingSoon: "Coming soon",
  syncCurrentLine: "Current line",
  syncTeamLine: "Remote line",
  syncRelationshipLabel: (local, team) => `Current line ${local}; remote line ${team}.`,
  syncTechnicalDetails: "Technical details",
  syncRemote: "Remote",
  syncDestination: "Destination branch",
  syncTrackingRef: "Tracking reference",
  syncLocalCommit: "Local commit",
  syncRemoteCommit: "Remote commit",
  syncAheadCount: "Saved locally",
  syncBehindCount: "Newer on the remote",
  syncNotAvailable: "Not available",
  getTeamDialogTitle: "Get project changes",
  getTeamDialogDescription: "Here's what's coming in from your team.",
  getTeamProgressLabel: "Getting project changes",
  getTeamPhaseTeam: "Checking the remote",
  getTeamPhaseRecovery: "Saving a recovery point",
  getTeamPhaseUpdating: "Updating your files",
  getTeamIncomingVersions: (count) => `${count} incoming ${count === 1 ? "version" : "versions"}`,
  getTeamVersionsTruncated: (shown, total) => `Showing ${shown} of ${total} incoming versions.`,
  getTeamAffectedFiles: (count) => `${count} affected ${count === 1 ? "file" : "files"}`,
  getTeamFilesTruncated: (shown, total) => `Showing ${shown} of ${total} affected files.`,
  getTeamBinaryFile: "Binary",
  getTeamFileCategory: { added: "Added", modified: "Modified", deleted: "Deleted", renamed: "Renamed" },
  getTeamOperationKind: "Operation",
  getTeamRecoveryReference: "Recovery point",
  getTeamStateToken: "State token",
  getTeamTechnicalGuarantees: "No pull, merge, rebase, reset, checkout, stash, force update or automatic conflict resolution is used.",
  getTeamBlockedTitle: "The update stopped safely",
  getTeamDivergedTitle: "Both sides changed",
  getTeamDivergedNoRetry: "You and your team both have new versions. Combine them in another Git tool.",
  getTeamSaveFirstTitle: "Save your changes",
  getTeamSaveFirstBody: "You changed files that are also coming in.",
  getTeamDirtyBody: "You have unsaved changes.",
  getTeamSaveVersion: "Save version",
  getTeamLineCatchesUp: (branch) => `Your “${branch}” line catches up, and nothing is merged or rewritten.`,
  getTeamRecoveryFirst: "A recovery point is saved first, and your unsaved changes aren't touched.",
  getTeamSuccessToast: (count) => `Project up to date. ${count === 1 ? "1 version came in." : `${count} versions came in.`}`,
  getTeamConfirm: "Get these versions",
  getTeamReviewUpdatedPlan: "Review again",
  getTeamTryAgain: "Try again",
  getTeamUncertainTitle: "Result not confirmed",
  getTeamUncertainInstructions: "Check your files before going on. Your previous version is safe.",
  getTeamObservedHead: "Current HEAD",
};

const es: SyncTranslations = {
  syncTitle: "Cambios del proyecto",
  syncNotCheckedTitle: "Aún sin comprobar",
  syncNotCheckedMessage: "Comprueba el proyecto remoto para ver los últimos cambios.",
  syncCheckingTitle: "Comprobando cambios del proyecto…",
  syncCheckingMessage: "Solo se lee información del remoto y tus archivos no cambian.",
  syncUpToDateTitle: "Todo al día",
  syncUpToDateMessage: "No hay nada que publicar ni traer.",
  syncAheadTitle: (count) => `${count} ${count === 1 ? "versión guardada lista" : "versiones guardadas listas"} para publicar`,
  syncAheadMessage: "Solo están en este ordenador.",
  syncBehindTitle: (count) => `Hay ${count} ${count === 1 ? "versión nueva" : "versiones nuevas"}`,
  syncBehindMessage: "Revisa qué cambiará antes de traerlas.",
  syncDivergedTitle: "Ambos lados han cambiado",
  syncDivergedMessage: "Tu línea y el remoto tienen trabajo distinto y no se combina nada automáticamente.",
  syncNoRemoteTitle: "Aún sin remoto",
  syncNoRemoteMessage: "Añade un remoto para comprobar cambios del proyecto.",
  syncNoUpstreamTitle: "Elige antes un destino de publicación",
  syncNoUpstreamMessage: "Publica esta línea para conectarla con el remoto.",
  syncDetachedTitle: "Cambia a una línea de versión para comprobar",
  syncDetachedMessage: "Una versión guardada concreta no tiene nada con qué compararse en el remoto.",
  syncUnbornTitle: "Guarda una versión antes de comprobar",
  syncUnbornMessage: "Aún no hay ninguna versión guardada que comparar.",
  syncUnknownTitle: "Comparación no disponible",
  syncUnknownMessage: "No se pudo comparar con la rama remota.",
  syncUnavailableTitle: "No se pudieron comprobar los cambios del proyecto",
  syncCachedNote: "Sin comprobar en esta sesión · se muestra el último estado conocido.",
  syncStaleNote: "Puede estar desactualizado.",
  syncLastChecked: (value) => `Comprobado ${value}.`,
  syncCheck: "Comprobar cambios del proyecto",
  syncChecking: "Comprobando…",
  syncCheckAgain: "Comprobar de nuevo",
  syncPublish: "Publicar cambios",
  syncReviewAndGet: "Revisar y traer",
  syncComingSoon: "Próximamente",
  syncCurrentLine: "Línea actual",
  syncTeamLine: "Línea remota",
  syncRelationshipLabel: (local, team) => `Línea actual ${local}; línea remota ${team}.`,
  syncTechnicalDetails: "Detalles técnicos",
  syncRemote: "Remoto",
  syncDestination: "Rama de destino",
  syncTrackingRef: "Referencia de seguimiento",
  syncLocalCommit: "Commit local",
  syncRemoteCommit: "Commit remoto",
  syncAheadCount: "Guardadas en local",
  syncBehindCount: "Nuevas en el remoto",
  syncNotAvailable: "No disponible",
  getTeamDialogTitle: "Traer cambios del proyecto",
  getTeamDialogDescription: "Esto es lo que llega de tu equipo.",
  getTeamProgressLabel: "Trayendo cambios del proyecto",
  getTeamPhaseTeam: "Comprobando el remoto",
  getTeamPhaseRecovery: "Guardando un punto de recuperación",
  getTeamPhaseUpdating: "Actualizando tus archivos",
  getTeamIncomingVersions: (count) => `${count} ${count === 1 ? "versión entrante" : "versiones entrantes"}`,
  getTeamVersionsTruncated: (shown, total) => `Se muestran ${shown} de ${total} versiones entrantes.`,
  getTeamAffectedFiles: (count) => `${count} ${count === 1 ? "archivo afectado" : "archivos afectados"}`,
  getTeamFilesTruncated: (shown, total) => `Se muestran ${shown} de ${total} archivos afectados.`,
  getTeamBinaryFile: "Binario",
  getTeamFileCategory: { added: "Añadido", modified: "Modificado", deleted: "Eliminado", renamed: "Renombrado" },
  getTeamOperationKind: "Operación",
  getTeamRecoveryReference: "Punto de recuperación",
  getTeamStateToken: "Token de estado",
  getTeamTechnicalGuarantees: "No se usa pull, merge, rebase, reset, checkout, stash, actualización forzada ni resolución automática de conflictos.",
  getTeamBlockedTitle: "La actualización se detuvo de forma segura",
  getTeamDivergedTitle: "Ambos lados cambiaron",
  getTeamDivergedNoRetry: "Tu equipo y tú tenéis versiones nuevas. Únelas con otra herramienta de Git.",
  getTeamSaveFirstTitle: "Guarda tus cambios",
  getTeamSaveFirstBody: "Has cambiado archivos que también llegan.",
  getTeamDirtyBody: "Tienes cambios sin guardar.",
  getTeamSaveVersion: "Guardar versión",
  getTeamLineCatchesUp: (branch) => `Tu línea «${branch}» se pone al día y no se mezcla ni se reescribe nada.`,
  getTeamRecoveryFirst: "Antes se guarda un punto de recuperación y tus cambios sin guardar no se tocan.",
  getTeamSuccessToast: (count) => `Proyecto al día. ${count === 1 ? "Ha llegado 1 versión." : `Han llegado ${count} versiones.`}`,
  getTeamConfirm: "Traer estas versiones",
  getTeamReviewUpdatedPlan: "Revisar de nuevo",
  getTeamTryAgain: "Reintentar",
  getTeamUncertainTitle: "Resultado sin confirmar",
  getTeamUncertainInstructions: "Revisa tus archivos antes de seguir. Tu versión anterior está a salvo.",
  getTeamObservedHead: "HEAD actual",
};

export const syncTranslations = { en, es } as const;
