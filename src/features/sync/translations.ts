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
  syncNotCheckedMessage: "Check when you want the latest changes from the remote project.",
  syncCheckingTitle: "Checking for project changes…",
  syncCheckingMessage: "Only remote information is updated; your version line and files stay unchanged.",
  syncUpToDateTitle: "You’re up to date",
  syncUpToDateMessage: "Nothing to publish or get.",
  syncAheadTitle: (count) => `${count} saved ${count === 1 ? "version is" : "versions are"} ready to publish`,
  syncAheadMessage: "They’re still only on this computer.",
  syncBehindTitle: (count) => `${count} newer project ${count === 1 ? "version is" : "versions are"} available`,
  syncBehindMessage: "Review what will change before getting these versions.",
  syncDivergedTitle: "Both sides have changed",
  syncDivergedMessage: "Your version line and the remote project contain different work. Nothing will be combined automatically.",
  syncNoRemoteTitle: "Remote setup required",
  syncNoRemoteMessage: "Add a remote before checking for project changes.",
  syncNoUpstreamTitle: "Choose a publish destination first",
  syncNoUpstreamMessage: "Publish this version line to connect it to a remote project destination.",
  syncDetachedTitle: "Switch to a version line to check",
  syncDetachedMessage: "A specific saved version has no remote project destination.",
  syncUnbornTitle: "Save a version before checking",
  syncUnbornMessage: "There is no saved version to compare yet.",
  syncUnknownTitle: "Project comparison unavailable",
  syncUnknownMessage: "The configured remote version could not be compared.",
  syncUnavailableTitle: "Couldn’t check project changes",
  syncCachedNote: "Not checked this session · using saved remote information.",
  syncStaleNote: "This result may be out of date.",
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
  syncBehindCount: "Newer remotely",
  syncNotAvailable: "Not available",
  getTeamDialogTitle: "Review and get project changes",
  getTeamDialogDescription: "See the incoming versions and local impact before this project advances.",
  getTeamProgressLabel: "Get project changes progress",
  getTeamPhaseTeam: "Checking the project",
  getTeamPhaseSafety: "Checking local safety",
  getTeamPhaseRecovery: "Creating recovery",
  getTeamPhaseUpdating: "Updating files and history",
  getTeamPhaseVerifying: "Verifying",
  getTeamIncomingVersions: (count) => `${count} incoming saved ${count === 1 ? "version" : "versions"}`,
  getTeamVersionsTruncated: (shown, total) => `Showing ${shown} of ${total} incoming versions.`,
  getTeamAffectedFiles: (count) => `${count} affected ${count === 1 ? "file" : "files"}`,
  getTeamFilesTruncated: (shown, total) => `Showing ${shown} of ${total} affected files.`,
  getTeamBinaryFile: "Binary",
  getTeamFileCategory: { added: "Added", modified: "Modified", deleted: "Deleted", renamed: "Renamed" },
  getTeamDestinationTitle: "One exact destination",
  getTeamDestinationDescription: (branch, remote, destination) => `Advance ${branch} to ${remote}/${destination}.`,
  getTeamFastForwardTitle: "Fast-forward only",
  getTeamFastForwardDescription: "GitOdrile will only move straight ahead. It will not merge, rebase, stash, force, or resolve overlaps automatically.",
  getTeamRecoveryTitle: "Recovery comes first",
  getTeamRecoveryDescription: (limit) => `The current saved version is protected locally before files change and retained among the newest ${limit} project-update recovery points.`,
  getTeamLocalConsequences: "Incoming files and the active version line will advance to the reviewed remote version. Prepared, unsaved, and local-only content proven separate stays untouched.",
  getTeamOperationKind: "Operation kind",
  getTeamRecoveryReference: "Recovery reference",
  getTeamStateToken: "State token",
  getTeamTechnicalGuarantees: "No pull, merge, rebase, reset, checkout, stash, force update, or automatic conflict resolution is used.",
  getTeamBlockedTitle: "This update stopped safely",
  getTeamDivergedTitle: "Both sides changed",
  getTeamDivergedNoRetry: "This cannot fast-forward in its current state, so retrying unchanged would fail again. Guided integration is not available yet.",
  getTeamConfirm: "Get these versions",
  getTeamReviewUpdatedPlan: "Review updated plan",
  getTeamTryAgain: "Try again",
  getTeamSuccessTitle: "Project changes are now included",
  getTeamSuccessDescription: (count) => `${count} remote project ${count === 1 ? "version is" : "versions are"} now part of this project.`,
  getTeamSuccessRecovery: (limit) => `The previous saved version remains protected locally under the ${limit}-record retention policy.`,
  getTeamUncertainTitle: "The local result needs inspection",
  getTeamUncertainDescription: "GitOdrile could not prove the final local state, so it did not try to repair or repeat anything.",
  getTeamUncertainInstructions: "Keep the recovery reference below. Inspect the current files and saved version before taking another action.",
  getTeamObservedHead: "Observed HEAD",
  getTeamDone: "Done",
};

const es: SyncTranslations = {
  syncTitle: "Cambios del proyecto",
  syncNotCheckedTitle: "Aún no se ha comprobado",
  syncNotCheckedMessage: "Comprueba cuando quieras conocer los cambios más recientes del proyecto remoto.",
  syncCheckingTitle: "Comprobando cambios del proyecto…",
  syncCheckingMessage: "Solo se actualiza la información remota; tu línea de versión y tus archivos no cambian.",
  syncUpToDateTitle: "Todo está al día",
  syncUpToDateMessage: "No hay nada que publicar ni obtener.",
  syncAheadTitle: (count) => `${count} ${count === 1 ? "versión guardada está" : "versiones guardadas están"} lista${count === 1 ? "" : "s"} para publicar`,
  syncAheadMessage: "Todavía solo están en este equipo.",
  syncBehindTitle: (count) => `Hay ${count} ${count === 1 ? "versión nueva" : "versiones nuevas"} del proyecto`,
  syncBehindMessage: "Revisa qué cambiará antes de obtener estas versiones.",
  syncDivergedTitle: "Ambos lados han cambiado",
  syncDivergedMessage: "Tu línea de versión y el proyecto remoto contienen trabajo diferente. Nada se combinará automáticamente.",
  syncNoRemoteTitle: "Falta configurar el remoto",
  syncNoRemoteMessage: "Añade un remoto antes de comprobar cambios del proyecto.",
  syncNoUpstreamTitle: "Elige primero un destino de publicación",
  syncNoUpstreamMessage: "Publica esta línea de versión para conectarla a un destino del proyecto remoto.",
  syncDetachedTitle: "Cambia a una línea de versión para comprobar",
  syncDetachedMessage: "Una versión guardada concreta no tiene destino en el proyecto remoto.",
  syncUnbornTitle: "Guarda una versión antes de comprobar",
  syncUnbornMessage: "Todavía no hay una versión guardada que comparar.",
  syncUnknownTitle: "Comparación del proyecto no disponible",
  syncUnknownMessage: "No se ha podido comparar la versión remota configurada.",
  syncUnavailableTitle: "No se pudieron comprobar los cambios del proyecto",
  syncCachedNote: "No comprobado en esta sesión · usando información remota guardada.",
  syncStaleNote: "Este resultado puede estar desactualizado.",
  syncLastChecked: (value) => `Comprobado: ${value}.`,
  syncCheck: "Comprobar cambios del proyecto",
  syncChecking: "Comprobando…",
  syncCheckAgain: "Comprobar de nuevo",
  syncPublish: "Publicar cambios",
  syncReviewAndGet: "Revisar y obtener",
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
  syncAheadCount: "Guardadas localmente",
  syncBehindCount: "Nuevas en remoto",
  syncNotAvailable: "No disponible",
  getTeamDialogTitle: "Revisar y obtener cambios del proyecto",
  getTeamDialogDescription: "Consulta las versiones entrantes y el impacto local antes de avanzar este proyecto.",
  getTeamProgressLabel: "Progreso al obtener cambios del proyecto",
  getTeamPhaseTeam: "Comprobando el proyecto",
  getTeamPhaseSafety: "Comprobando la seguridad local",
  getTeamPhaseRecovery: "Creando la recuperación",
  getTeamPhaseUpdating: "Actualizando archivos e historial",
  getTeamPhaseVerifying: "Verificando",
  getTeamIncomingVersions: (count) => `${count} ${count === 1 ? "versión guardada entrante" : "versiones guardadas entrantes"}`,
  getTeamVersionsTruncated: (shown, total) => `Se muestran ${shown} de ${total} versiones entrantes.`,
  getTeamAffectedFiles: (count) => `${count} ${count === 1 ? "archivo afectado" : "archivos afectados"}`,
  getTeamFilesTruncated: (shown, total) => `Se muestran ${shown} de ${total} archivos afectados.`,
  getTeamBinaryFile: "Binario",
  getTeamFileCategory: { added: "Añadido", modified: "Modificado", deleted: "Eliminado", renamed: "Renombrado" },
  getTeamDestinationTitle: "Un destino exacto",
  getTeamDestinationDescription: (branch, remote, destination) => `Avanzar ${branch} hasta ${remote}/${destination}.`,
  getTeamFastForwardTitle: "Solo avance directo",
  getTeamFastForwardDescription: "GitOdrile solo avanzará en línea recta. No combinará, reorganizará, apartará, forzará ni resolverá solapamientos automáticamente.",
  getTeamRecoveryTitle: "La recuperación va primero",
  getTeamRecoveryDescription: (limit) => `La versión guardada actual se protege localmente antes de cambiar archivos y se conserva entre los ${limit} puntos de recuperación de actualizaciones más recientes.`,
  getTeamLocalConsequences: "Los archivos entrantes y la línea de versión activa avanzarán hasta la versión remota revisada. Los cambios preparados, sin guardar y solo locales que se demuestre que están separados quedan intactos.",
  getTeamOperationKind: "Tipo de operación",
  getTeamRecoveryReference: "Referencia de recuperación",
  getTeamStateToken: "Token de estado",
  getTeamTechnicalGuarantees: "No se usa pull, merge, rebase, reset, checkout, stash, actualización forzada ni resolución automática de conflictos.",
  getTeamBlockedTitle: "La actualización se detuvo de forma segura",
  getTeamDivergedTitle: "Ambos lados han cambiado",
  getTeamDivergedNoRetry: "El estado actual no permite un avance directo, así que reintentar sin cambios volvería a fallar. La integración guiada aún no está disponible.",
  getTeamConfirm: "Obtener estas versiones",
  getTeamReviewUpdatedPlan: "Revisar el plan actualizado",
  getTeamTryAgain: "Volver a intentar",
  getTeamSuccessTitle: "Los cambios del proyecto ya están incluidos",
  getTeamSuccessDescription: (count) => `${count} ${count === 1 ? "versión del proyecto remoto ya forma" : "versiones del proyecto remoto ya forman"} parte de este proyecto.`,
  getTeamSuccessRecovery: (limit) => `La versión guardada anterior sigue protegida localmente con la política de retención de ${limit} registros.`,
  getTeamUncertainTitle: "Hay que inspeccionar el resultado local",
  getTeamUncertainDescription: "GitOdrile no pudo demostrar el estado local final, así que no intentó reparar ni repetir nada.",
  getTeamUncertainInstructions: "Conserva la referencia de recuperación siguiente. Inspecciona los archivos y la versión guardada actuales antes de realizar otra acción.",
  getTeamObservedHead: "HEAD observado",
  getTeamDone: "Listo",
};

export const syncTranslations = { en, es } as const;
