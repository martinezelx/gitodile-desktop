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
  getTeamPhaseSafety: string;
  getTeamPhaseRecovery: string;
  getTeamPhaseUpdating: string;
  getTeamPhaseVerifying: string;
  getTeamIncomingVersions: (count: number) => string;
  getTeamVersionsTruncated: (shown: number, total: number) => string;
  getTeamAffectedFiles: (count: number) => string;
  getTeamFilesTruncated: (shown: number, total: number) => string;
  getTeamBinaryFile: string;
  getTeamFileCategory: { added: string; modified: string; deleted: string; renamed: string };
  getTeamDestinationTitle: string;
  getTeamDestinationDescription: (branch: string, remote: string, destination: string) => string;
  getTeamFastForwardTitle: string;
  getTeamFastForwardDescription: string;
  getTeamRecoveryTitle: string;
  getTeamRecoveryDescription: (limit: number) => string;
  getTeamLocalConsequences: string;
  getTeamOperationKind: string;
  getTeamRecoveryReference: string;
  getTeamStateToken: string;
  getTeamTechnicalGuarantees: string;
  getTeamBlockedTitle: string;
  getTeamDivergedTitle: string;
  getTeamDivergedNoRetry: string;
  getTeamConfirm: string;
  getTeamReviewUpdatedPlan: string;
  getTeamTryAgain: string;
  getTeamSuccessTitle: string;
  getTeamSuccessDescription: (count: number) => string;
  getTeamSuccessRecovery: (limit: number) => string;
  getTeamUncertainTitle: string;
  getTeamUncertainDescription: string;
  getTeamUncertainInstructions: string;
  getTeamObservedHead: string;
  getTeamDone: string;
}

const en: SyncTranslations = {
  syncTitle: "Project changes",
  syncNotCheckedTitle: "Not checked yet",
  syncNotCheckedMessage: "Check the remote project for the latest changes.",
  syncCheckingTitle: "Checking for project changes…",
  syncCheckingMessage: "Only remote information is read. Your files don't change.",
  syncUpToDateTitle: "You’re up to date",
  syncUpToDateMessage: "Nothing to publish or get.",
  syncAheadTitle: (count) => `${count} saved ${count === 1 ? "version is" : "versions are"} ready to publish`,
  syncAheadMessage: "They’re only on this computer.",
  syncBehindTitle: (count) => `${count} newer ${count === 1 ? "version is" : "versions are"} available`,
  syncBehindMessage: "Review what will change before getting them.",
  syncDivergedTitle: "Both sides have changed",
  syncDivergedMessage: "Your line and the remote have different work. Nothing is combined automatically.",
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
  syncUnavailableTitle: "Couldn’t check project changes",
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
  getTeamDialogDescription: "See what's coming in and what it changes before your project moves forward.",
  getTeamProgressLabel: "Getting project changes",
  getTeamPhaseTeam: "Checking the remote",
  getTeamPhaseSafety: "Checking your local work",
  getTeamPhaseRecovery: "Saving a recovery point",
  getTeamPhaseUpdating: "Updating files and history",
  getTeamPhaseVerifying: "Checking the result",
  getTeamIncomingVersions: (count) => `${count} incoming ${count === 1 ? "version" : "versions"}`,
  getTeamVersionsTruncated: (shown, total) => `Showing ${shown} of ${total} incoming versions.`,
  getTeamAffectedFiles: (count) => `${count} affected ${count === 1 ? "file" : "files"}`,
  getTeamFilesTruncated: (shown, total) => `Showing ${shown} of ${total} affected files.`,
  getTeamBinaryFile: "Binary",
  getTeamFileCategory: { added: "Added", modified: "Modified", deleted: "Deleted", renamed: "Renamed" },
  getTeamDestinationTitle: "Where it goes",
  getTeamDestinationDescription: (branch, remote, destination) => `Moves ${branch} up to ${remote}/${destination}.`,
  getTeamFastForwardTitle: "Straight ahead only",
  getTeamFastForwardDescription: "Your line only moves forward. Nothing is merged, rewritten or resolved for you.",
  getTeamRecoveryTitle: "A recovery point first",
  getTeamRecoveryDescription: (limit) => `Your current version is saved as a recovery point before any file changes (the ${limit} most recent are kept).`,
  getTeamLocalConsequences: "Incoming files and your line move to the reviewed version. Your unsaved and local-only changes aren't touched.",
  getTeamOperationKind: "Operation",
  getTeamRecoveryReference: "Recovery point",
  getTeamStateToken: "State token",
  getTeamTechnicalGuarantees: "No pull, merge, rebase, reset, checkout, stash, force update or automatic conflict resolution is used.",
  getTeamBlockedTitle: "The update stopped safely",
  getTeamDivergedTitle: "Both sides changed",
  getTeamDivergedNoRetry: "Your line can't simply move forward, so retrying would fail again. Combining both sides isn't supported yet.",
  getTeamConfirm: "Get these versions",
  getTeamReviewUpdatedPlan: "Review again",
  getTeamTryAgain: "Try again",
  getTeamSuccessTitle: "Project changes are in",
  getTeamSuccessDescription: (count) => `${count} ${count === 1 ? "version is" : "versions are"} now part of your project.`,
  getTeamSuccessRecovery: (limit) => `Your previous version is kept as a recovery point (the ${limit} most recent are kept).`,
  getTeamUncertainTitle: "Check the result",
  getTeamUncertainDescription: "GitOdile couldn't confirm the final state, so it didn't retry or change anything else.",
  getTeamUncertainInstructions: "Keep the recovery point below. Check your files and current version before doing anything else.",
  getTeamObservedHead: "Current HEAD",
  getTeamDone: "Done",
};

const es: SyncTranslations = {
  syncTitle: "Cambios del proyecto",
  syncNotCheckedTitle: "Aún sin comprobar",
  syncNotCheckedMessage: "Comprueba el proyecto remoto para ver los últimos cambios.",
  syncCheckingTitle: "Comprobando cambios del proyecto…",
  syncCheckingMessage: "Solo se lee información del remoto. Tus archivos no cambian.",
  syncUpToDateTitle: "Todo al día",
  syncUpToDateMessage: "No hay nada que publicar ni traer.",
  syncAheadTitle: (count) => `${count} ${count === 1 ? "versión guardada lista" : "versiones guardadas listas"} para publicar`,
  syncAheadMessage: "Solo están en este ordenador.",
  syncBehindTitle: (count) => `Hay ${count} ${count === 1 ? "versión nueva" : "versiones nuevas"}`,
  syncBehindMessage: "Revisa qué cambiará antes de traerlas.",
  syncDivergedTitle: "Ambos lados han cambiado",
  syncDivergedMessage: "Tu línea y el remoto tienen trabajo distinto. No se combina nada automáticamente.",
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
  getTeamDialogDescription: "Mira qué llega y qué cambia antes de que tu proyecto avance.",
  getTeamProgressLabel: "Trayendo cambios del proyecto",
  getTeamPhaseTeam: "Comprobando el remoto",
  getTeamPhaseSafety: "Comprobando tu trabajo local",
  getTeamPhaseRecovery: "Guardando un punto de recuperación",
  getTeamPhaseUpdating: "Actualizando archivos e historial",
  getTeamPhaseVerifying: "Comprobando el resultado",
  getTeamIncomingVersions: (count) => `${count} ${count === 1 ? "versión entrante" : "versiones entrantes"}`,
  getTeamVersionsTruncated: (shown, total) => `Se muestran ${shown} de ${total} versiones entrantes.`,
  getTeamAffectedFiles: (count) => `${count} ${count === 1 ? "archivo afectado" : "archivos afectados"}`,
  getTeamFilesTruncated: (shown, total) => `Se muestran ${shown} de ${total} archivos afectados.`,
  getTeamBinaryFile: "Binario",
  getTeamFileCategory: { added: "Añadido", modified: "Modificado", deleted: "Eliminado", renamed: "Renombrado" },
  getTeamDestinationTitle: "A dónde va",
  getTeamDestinationDescription: (branch, remote, destination) => `Lleva ${branch} hasta ${remote}/${destination}.`,
  getTeamFastForwardTitle: "Solo hacia delante",
  getTeamFastForwardDescription: "Tu línea solo avanza. No se fusiona, reescribe ni resuelve nada por ti.",
  getTeamRecoveryTitle: "Primero, un punto de recuperación",
  getTeamRecoveryDescription: (limit) => `Tu versión actual se guarda como punto de recuperación antes de cambiar ningún archivo (se conservan los ${limit} más recientes).`,
  getTeamLocalConsequences: "Los archivos entrantes y tu línea pasan a la versión revisada. Tus cambios sin guardar y solo locales no se tocan.",
  getTeamOperationKind: "Operación",
  getTeamRecoveryReference: "Punto de recuperación",
  getTeamStateToken: "Token de estado",
  getTeamTechnicalGuarantees: "No se usa pull, merge, rebase, reset, checkout, stash, actualización forzada ni resolución automática de conflictos.",
  getTeamBlockedTitle: "La actualización se detuvo de forma segura",
  getTeamDivergedTitle: "Ambos lados han cambiado",
  getTeamDivergedNoRetry: "Tu línea no puede limitarse a avanzar, así que reintentar volvería a fallar. Aún no se pueden combinar ambos lados.",
  getTeamConfirm: "Traer estas versiones",
  getTeamReviewUpdatedPlan: "Revisar de nuevo",
  getTeamTryAgain: "Reintentar",
  getTeamSuccessTitle: "Cambios del proyecto incorporados",
  getTeamSuccessDescription: (count) => `${count} ${count === 1 ? "versión ya forma" : "versiones ya forman"} parte de tu proyecto.`,
  getTeamSuccessRecovery: (limit) => `Tu versión anterior queda como punto de recuperación (se conservan los ${limit} más recientes).`,
  getTeamUncertainTitle: "Revisa el resultado",
  getTeamUncertainDescription: "GitOdile no pudo confirmar el estado final, así que no reintentó ni cambió nada más.",
  getTeamUncertainInstructions: "Conserva el punto de recuperación de abajo. Revisa tus archivos y la versión actual antes de hacer nada más.",
  getTeamObservedHead: "HEAD actual",
  getTeamDone: "Listo",
};

export const syncTranslations = { en, es } as const;
