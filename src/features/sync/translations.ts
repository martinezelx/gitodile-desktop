export interface SyncTranslations {
  syncTitle: string;
  syncNotCheckedTitle: string;
  syncNotCheckedMessage: string;
  syncCheckingTitle: string;
  syncCheckingMessage: string;
  syncUpToDateTitle: string;
  syncUpToDateMessage: string;
  syncAheadTitle: (count: number) => string;
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
  getTeamTitleFastForward: (count: number, remote: string) => string;
  getTeamTitleMerge: (count: number, localCount: number) => string;
  getTeamTitlePublish: (localCount: number, remote: string) => string;
  getTeamFrom: (authors: string[], authorCount: number) => string;
  getTeamFileCount: (count: number) => string;
  getTeamBeforePublish: (count: number, from: string) => string;
  getTeamNothingOverlaps: string;
  getTeamCarried: (count: number) => string;
  getTeamCombined: (files: string[], count: number) => string;
  getTeamMergeFact: (localCount: number) => string;
  getTeamPublishFact: (localCount: number, remote: string) => string;
  getTeamRecoveryFirst: string;
  getTeamWhatComesIn: string;
  getTeamVersionMeta: (author: string, when: string, files: number) => string;
  getTeamVersionsTruncated: (shown: number, total: number) => string;
  getTeamCheckingRemote: (remote: string) => string;
  getTeamRemoteMoved: string;
  getTeamConfirmFastForward: string;
  getTeamConfirmMerge: string;
  getTeamConfirmPublish: string;
  getTeamAlsoPublish: string;
  getTeamProgressLabel: string;
  getTeamPhase: {
    checkingLocalSafety: string;
    combiningVersions: string;
    creatingRecovery: string;
    updatingFilesAndHistory: string;
    verifying: string;
    publishing: string;
  };
  getTeamWorking: string;
  getTeamOverlapTitle: (remote: string) => string;
  getTeamOverlapBody: string;
  getTeamOverlapSide: { saved: string; unsaved: string };
  getTeamOverlapMore: (count: number) => string;
  getTeamSafeNothingChanged: string;
  getTeamUntrackedTitle: string;
  getTeamUntrackedBody: (path: string, remote: string) => string;
  getTeamPreparedTitle: string;
  getTeamPreparedBody: (path: string, remote: string) => string;
  getTeamCarryFailedBody: string;
  getTeamGitTooOldTitle: string;
  getTeamGitTooOldBody: string;
  getTeamOperationTitle: string;
  getTeamOperationBody: string;
  getTeamShowInFolder: string;
  getTeamSaveVersion: string;
  getTeamBlockedTitle: string;
  getTeamSuccessToast: (count: number) => string;
  /** Get project changes found nothing newer, here or on the remote. */
  getTeamUpToDateToast: string;
  /** The remote could not be asked, and no reason came back with it. */
  getTeamUncheckedBody: string;
  /** What is still known when the remote could not be asked. */
  getTeamUncheckedLocal: string;
  getTeamMergedToast: (count: number) => string;
  getTeamPublishedToast: (received: number, published: number, remote: string) => string;
  getTeamPublishFailed: string;
  getTeamRetryPublish: string;
  getTeamReviewUpdatedPlan: string;
  getTeamTryAgain: string;
  getTeamUncertainTitle: string;
  getTeamUncertainInstructions: string;
  getTeamObservedHead: string;
  getTeamRecoveryReference: string;
  getTeamUnsavedCopy: string;
  getTeamMergeMessage: string;
  getTeamIntegration: string;
  getTeamIntegrationKind: { fastForward: string; merge: string };
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
  getTeamTitleFastForward: (count, remote) =>
    `Get ${count === 1 ? "1 version" : `${count} versions`} from ${remote}`,
  getTeamTitleMerge: (count, localCount) =>
    `Get ${count === 1 ? "1 version" : `${count} versions`} and combine ${count === 1 ? "it" : "them"} with ${localCount === 1 ? "yours" : "your versions"}`,
  getTeamTitlePublish: (localCount, remote) =>
    `Publish ${localCount === 1 ? "1 version" : `${localCount} versions`} to ${remote}`,
  getTeamFrom: (authors, authorCount) => {
    if (authors.length === 0) return "";
    const more = authorCount - authors.length;
    if (more > 0) return `From ${authors.join(", ")} and ${more} more`;
    if (authors.length === 1) return `From ${authors[0]}`;
    return `From ${authors.slice(0, -1).join(", ")} and ${authors[authors.length - 1]}`;
  },
  getTeamFileCount: (count) => `${count} ${count === 1 ? "file" : "files"}`,
  getTeamBeforePublish: (count, from) =>
    `First ${count === 1 ? "1 version comes" : `${count} versions come`} in${from ? ` ${from.charAt(0).toLowerCase()}${from.slice(1)}` : ""}.`,
  getTeamNothingOverlaps: "Nothing of yours overlaps.",
  getTeamCarried: (count) =>
    count === 1 ? "Your unsaved file stays as it is." : `Your ${count} unsaved files stay as they are.`,
  getTeamCombined: (files, count) => {
    const named = count === 1 ? files[0] : `${count} files`;
    return `Your unsaved edits to ${named} stay unsaved, on top of the incoming ones.`;
  },
  getTeamMergeFact: (localCount) =>
    `A merge version joins both lines. ${localCount === 1 ? "Your version isn't" : `Your ${localCount} versions aren't`} published yet, so nobody else is affected.`,
  getTeamPublishFact: (localCount, remote) =>
    `Then ${localCount === 1 ? "your version" : `your ${localCount} versions`} and the merge version are published to ${remote}.`,
  getTeamRecoveryFirst: "A recovery point is saved first.",
  getTeamWhatComesIn: "What comes in",
  getTeamVersionMeta: (author, when, files) =>
    [author, when, files > 0 ? `${files} ${files === 1 ? "file" : "files"}` : ""].filter(Boolean).join(" · "),
  getTeamVersionsTruncated: (shown, total) => `Showing ${shown} of ${total} incoming versions.`,
  getTeamCheckingRemote: (remote) => `Checking ${remote} for anything newer…`,
  getTeamRemoteMoved: "Something changed while this was open. This is the updated summary.",
  getTeamConfirmFastForward: "Get",
  getTeamConfirmMerge: "Get and combine",
  getTeamConfirmPublish: "Get and publish",
  getTeamAlsoPublish: "Get, combine and publish",
  getTeamProgressLabel: "Getting project changes",
  getTeamPhase: {
    checkingLocalSafety: "Checking your files…",
    combiningVersions: "Creating the merge version…",
    creatingRecovery: "Saving a recovery point…",
    updatingFilesAndHistory: "Updating your files…",
    verifying: "Checking the result…",
    publishing: "Publishing…",
  },
  getTeamWorking: "Getting…",
  getTeamOverlapTitle: (remote) => `Your changes and ${remote}'s overlap`,
  getTeamOverlapBody: "You both changed the same lines in these files. They can't be combined in GitOdile yet, so nothing comes in.",
  getTeamOverlapSide: { saved: "your saved version", unsaved: "your unsaved changes" },
  getTeamOverlapMore: (count) => `And ${count} more.`,
  getTeamSafeNothingChanged: "Your work is safe and nothing was changed.",
  getTeamUntrackedTitle: "A file of yours would be overwritten",
  getTeamUntrackedBody: (path, remote) =>
    `${remote} adds ${path}, and you have a new file there that isn't saved. Move it or save it, then get the changes.`,
  getTeamPreparedTitle: "Save your changes first",
  getTeamPreparedBody: (path, remote) =>
    `${path} is prepared to save and also changes on ${remote}. Save it, then get the changes.`,
  getTeamCarryFailedBody: "Git can't carry your unsaved changes across this update. Save them, then get the changes.",
  getTeamGitTooOldTitle: "Update Git to combine versions",
  getTeamGitTooOldBody: "This version of Git can't work out a combination safely. Update Git in Settings, then try again.",
  getTeamOperationTitle: "Finish the Git operation in progress",
  getTeamOperationBody: "Another Git operation is in progress in this project. Finish or abort it, then get the changes.",
  getTeamShowInFolder: "Show in folder",
  getTeamSaveVersion: "Save version",
  getTeamBlockedTitle: "The update stopped safely",
  getTeamUpToDateToast: "Everything is up to date. There are no newer versions to bring in.",
  getTeamUncheckedBody: "The remote didn't answer. Check your connection and try again.",
  getTeamUncheckedLocal: "As far as this computer knows, there are no newer versions to bring in.",
  getTeamSuccessToast: (count) => `Project up to date. ${count === 1 ? "1 version came in." : `${count} versions came in.`}`,
  getTeamMergedToast: (count) =>
    `Combined. ${count === 1 ? "1 version came in" : `${count} versions came in`} and a merge version joins ${count === 1 ? "it" : "them"} with yours.`,
  getTeamPublishedToast: (received, published, remote) =>
    `Up to date and published: ${received} came in, ${published} went out to ${remote}.`,
  getTeamPublishFailed: "Your project is up to date, but publishing failed.",
  getTeamRetryPublish: "Try publishing again",
  getTeamReviewUpdatedPlan: "Review again",
  getTeamTryAgain: "Try again",
  getTeamUncertainTitle: "Result not confirmed",
  getTeamUncertainInstructions: "Check your files before going on. Your previous version is safe.",
  getTeamObservedHead: "Current HEAD",
  getTeamRecoveryReference: "Recovery point",
  getTeamUnsavedCopy: "Copy of your unsaved changes",
  getTeamMergeMessage: "Merge message",
  getTeamIntegration: "Update",
  getTeamIntegrationKind: { fastForward: "Fast-forward", merge: "Merge" },
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
  getTeamTitleFastForward: (count, remote) =>
    `Traer ${count === 1 ? "1 versión" : `${count} versiones`} de ${remote}`,
  getTeamTitleMerge: (count, localCount) =>
    `Traer ${count === 1 ? "1 versión" : `${count} versiones`} y combinar${count === 1 ? "la" : "las"} con ${localCount === 1 ? "la tuya" : "las tuyas"}`,
  getTeamTitlePublish: (localCount, remote) =>
    `Publicar ${localCount === 1 ? "1 versión" : `${localCount} versiones`} en ${remote}`,
  getTeamFrom: (authors, authorCount) => {
    if (authors.length === 0) return "";
    const more = authorCount - authors.length;
    if (more > 0) return `De ${authors.join(", ")} y ${more} más`;
    if (authors.length === 1) return `De ${authors[0]}`;
    return `De ${authors.slice(0, -1).join(", ")} y ${authors[authors.length - 1]}`;
  },
  getTeamFileCount: (count) => `${count} ${count === 1 ? "archivo" : "archivos"}`,
  getTeamBeforePublish: (count, from) =>
    `Antes ${count === 1 ? "llega 1 versión" : `llegan ${count} versiones`}${from ? ` ${from.charAt(0).toLowerCase()}${from.slice(1)}` : ""}.`,
  getTeamNothingOverlaps: "No choca con nada tuyo.",
  getTeamCarried: (count) =>
    count === 1 ? "Tu archivo sin guardar se queda como está." : `Tus ${count} archivos sin guardar se quedan como están.`,
  getTeamCombined: (files, count) => {
    const named = count === 1 ? files[0] : `${count} archivos`;
    return `Tus cambios sin guardar en ${named} siguen sin guardar, encima de los que llegan.`;
  },
  getTeamMergeFact: (localCount) =>
    `Una versión de unión junta las dos líneas. ${localCount === 1 ? "Tu versión aún no está publicada" : `Tus ${localCount} versiones aún no están publicadas`}, así que nadie más se ve afectado.`,
  getTeamPublishFact: (localCount, remote) =>
    `Después ${localCount === 1 ? "tu versión" : `tus ${localCount} versiones`} y la versión de unión se publican en ${remote}.`,
  getTeamRecoveryFirst: "Antes se guarda un punto de recuperación.",
  getTeamWhatComesIn: "Qué llega",
  getTeamVersionMeta: (author, when, files) =>
    [author, when, files > 0 ? `${files} ${files === 1 ? "archivo" : "archivos"}` : ""].filter(Boolean).join(" · "),
  getTeamVersionsTruncated: (shown, total) => `Se muestran ${shown} de ${total} versiones entrantes.`,
  getTeamCheckingRemote: (remote) => `Comprobando si hay algo más nuevo en ${remote}…`,
  getTeamRemoteMoved: "Algo ha cambiado mientras mirabas. Este es el resumen actualizado.",
  getTeamConfirmFastForward: "Traer",
  getTeamConfirmMerge: "Traer y combinar",
  getTeamConfirmPublish: "Traer y publicar",
  getTeamAlsoPublish: "Traer, combinar y publicar",
  getTeamProgressLabel: "Trayendo cambios del proyecto",
  getTeamPhase: {
    checkingLocalSafety: "Comprobando tus archivos…",
    combiningVersions: "Creando la versión de unión…",
    creatingRecovery: "Guardando un punto de recuperación…",
    updatingFilesAndHistory: "Actualizando tus archivos…",
    verifying: "Comprobando el resultado…",
    publishing: "Publicando…",
  },
  getTeamWorking: "Trayendo…",
  getTeamOverlapTitle: (remote) => `Tus cambios y los de ${remote} se pisan`,
  getTeamOverlapBody: "Tocáis las mismas líneas en estos archivos. Todavía no se pueden combinar desde GitOdile, así que no se trae nada.",
  getTeamOverlapSide: { saved: "tu versión guardada", unsaved: "tus cambios sin guardar" },
  getTeamOverlapMore: (count) => `Y ${count} más.`,
  getTeamSafeNothingChanged: "Tu trabajo está a salvo y no se ha tocado nada.",
  getTeamUntrackedTitle: "Un archivo tuyo se sobrescribiría",
  getTeamUntrackedBody: (path, remote) =>
    `${remote} añade ${path} y tú tienes ahí un archivo nuevo sin guardar. Muévelo o guárdalo y luego trae los cambios.`,
  getTeamPreparedTitle: "Guarda tus cambios primero",
  getTeamPreparedBody: (path, remote) =>
    `${path} está preparado para guardar y también cambia en ${remote}. Guárdalo y luego trae los cambios.`,
  getTeamCarryFailedBody: "Git no puede llevar tus cambios sin guardar a través de esta actualización. Guárdalos y luego trae los cambios.",
  getTeamGitTooOldTitle: "Actualiza Git para combinar versiones",
  getTeamGitTooOldBody: "Esta versión de Git no puede calcular una combinación de forma segura. Actualiza Git en Ajustes y vuelve a intentarlo.",
  getTeamOperationTitle: "Termina la operación de Git en curso",
  getTeamOperationBody: "Hay otra operación de Git en curso en este proyecto. Termínala o cancélala y luego trae los cambios.",
  getTeamShowInFolder: "Mostrar en carpeta",
  getTeamSaveVersion: "Guardar versión",
  getTeamBlockedTitle: "La actualización se detuvo de forma segura",
  getTeamUpToDateToast: "Todo al día. No hay versiones nuevas que traer.",
  getTeamUncheckedBody: "El remoto no ha respondido. Comprueba la conexión e inténtalo de nuevo.",
  getTeamUncheckedLocal: "Por lo que sabe este ordenador, no hay versiones nuevas que traer.",
  getTeamSuccessToast: (count) => `Proyecto al día. ${count === 1 ? "Ha llegado 1 versión." : `Han llegado ${count} versiones.`}`,
  getTeamMergedToast: (count) =>
    `Combinado. ${count === 1 ? "Ha llegado 1 versión" : `Han llegado ${count} versiones`} y una versión de unión ${count === 1 ? "la junta" : "las junta"} con las tuyas.`,
  getTeamPublishedToast: (received, published, remote) =>
    `Al día y publicado: han llegado ${received} y han salido ${published} hacia ${remote}.`,
  getTeamPublishFailed: "Tu proyecto está al día, pero no se pudo publicar.",
  getTeamRetryPublish: "Volver a publicar",
  getTeamReviewUpdatedPlan: "Revisar de nuevo",
  getTeamTryAgain: "Reintentar",
  getTeamUncertainTitle: "Resultado sin confirmar",
  getTeamUncertainInstructions: "Revisa tus archivos antes de seguir. Tu versión anterior está a salvo.",
  getTeamObservedHead: "HEAD actual",
  getTeamRecoveryReference: "Punto de recuperación",
  getTeamUnsavedCopy: "Copia de tus cambios sin guardar",
  getTeamMergeMessage: "Mensaje de la unión",
  getTeamIntegration: "Actualización",
  getTeamIntegrationKind: { fastForward: "Avance rápido", merge: "Unión" },
};

export const syncTranslations = { en, es } as const;
