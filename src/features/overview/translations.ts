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
  /** The header's project icon is a button into project settings' icon
   * section. */
  overviewChangeProjectIcon: string;
  /** The header's folder button, and what it says when the file manager will
   * not open. */
  overviewOpenFolder: string;
  overviewOpenFolderFailedTitle: string;
  overviewOpenFolderFailedMessage: string;
  overviewOpeningTitle: string;
  overviewOpeningDescription: string;
  overviewOpenFailedTitle: string;
  overviewReviewChanges: string;
  overviewSaveVersion: string;
  overviewCheckLocalAgain: string;
  overviewChangesPreviewOpenFile: (path: string) => string;
  overviewJourneyResolve: string;
  overviewJourneyReadyToPublish: (count: number) => string;
  overviewJourneyNoUpstream: string;
  overviewJourneyNoteSave: string;
  overviewJourneyNoteAhead: string;
  overviewJourneyNoteIdle: string;
  overviewPublishAll: (count: number) => string;
  /** The next-step card: the words over its title, by what the card asks. */
  overviewNextKickerNext: string;
  overviewNextKickerBefore: string;
  overviewNextKickerDecide: string;
  overviewNextKickerAllGood: string;
  overviewNextKickerStatus: string;
  /** The card's three-segment progress, read out: "2 of 3 steps done". */
  overviewNextProgress: (done: number) => string;
  overviewNextConflictsTitle: (count: number) => string;
  overviewNextConflictsHint: string;
  overviewNextSaveTitle: (count: number) => string;
  /** "Publish 2 versions to origin"; without a remote name, "Publish 2 versions". */
  overviewNextPublishTitle: (count: number, remote: string | null) => string;
  overviewNextUpToDateTitle: string;
  overviewNextUpToDateHint: (remote: string | null) => string;
  /** The timeline's first node: the working tree, before any saved version. */
  overviewNowLabel: string;
  overviewNowClean: string;
  overviewNowConflicts: (count: number) => string;
  /** The group of versions that have not left this computer. */
  overviewTimelineLocalGroup: string;
  overviewTimelineLocalCount: (count: number) => string;
  /** The mark above the newest version the remote has: "Published on". */
  overviewTimelinePublishedOn: string;
  /** The row above "now" for versions waiting on the remote. */
  overviewTimelineIncoming: (count: number) => string;
  overviewTimelineGet: string;
  /** The side column: what the next step will move, and where you can go
   * back to. */
  overviewDetailSaveTitle: string;
  overviewDetailPublishTitle: string;
  overviewDetailReview: string;
  overviewDetailInHistory: string;
  overviewDetailFiles: (count: number) => string;
  /** When not every unpublished version's files are known: "9+ files". */
  overviewDetailFilesAtLeast: (count: number) => string;
  overviewDetailInNextVersion: string;
  overviewDetailInVersions: (count: number) => string;
  overviewDetailMore: (count: number) => string;
  overviewDetailLines: (added: number, removed: number) => string;
  /** The column's closing line, the consequence in one line that fits the
   * column in every language: where the work stays, or who will see it. */
  overviewDetailSaveNote: string;
  overviewDetailPublishNote: string;
  /** When the remote line has another name than the project's line. */
  overviewDetailPublishNoteTo: (destination: string) => string;
  overviewDetailLoading: string;
  overviewDetailFilesError: string;
  overviewDetailVersionsError: string;
  overviewSafetyDiscarded: string;
  overviewSafetyDiscardedHint: (count: number, when: string) => string;
  /** The card's other cases: the first save, versions waiting on the remote,
   * both sides moved, a check that failed, no remote, an older version. */
  overviewNextKickerSaved: string;
  overviewNextFirstSaveTitle: string;
  overviewNextFirstSaveHint: (count: number) => string;
  overviewNextBehindTitle: (count: number, remote: string | null) => string;
  overviewNextDivergedTitle: (count: number) => string;
  overviewNextDivergedHint: (remote: string | null) => string;
  overviewNextUnavailableTitle: (remote: string | null) => string;
  overviewNextUnavailableHint: string;
  overviewNextNoRemoteTitle: string;
  overviewNextNoRemoteHint: string;
  overviewNextDetachedTitle: string;
  overviewNextDetachedHint: string;
  overviewNextConnectRemote: string;
  overviewNextOpenLines: string;
  /** The neutral pill for what comes after this step: "Then: 3 new versions
   * on origin", "Then: publish 2 versions". */
  overviewNextThen: string;
  overviewNextThenGet: (count: number) => string;
  overviewNextThenOn: (remote: string) => string;
  overviewNextThenPublish: (count: number) => string;
  /** The side column's other details. */
  overviewDetailResolveTitle: string;
  overviewDetailResolveSum: string;
  overviewDetailResolveNote: string;
  overviewDetailBringTitle: string;
  overviewDetailBringNote: string;
  overviewDetailVersions: (count: number) => string;
  overviewDetailFrom: (remote: string) => string;
  overviewDetailVersionsLoading: string;
  overviewDiscardRestore: string;
  /** The scene: this computer, the remote, and how they stand. */
  overviewSceneLabel: string;
  overviewSceneLoading: string;
  overviewSceneTooltip: (remote: string) => string;
  overviewSceneHere: string;
  overviewSceneRemote: string;
  overviewSceneSynced: string;
  overviewSceneNotChecked: string;
  overviewSceneNoCopy: string;
  overviewSceneConnect: string;
  overviewSceneMissingYours: (count: number) => string;
  overviewSceneNew: (count: number) => string;
  overviewSceneUnsaved: (count: number) => string;
  overviewFactsCheck: string;
  overviewHistoryTitle: string;
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
  /** A version saved under the user's own Git identity. */
  overviewHistoryYou: string;
  /** The badge on the version the project stands on, in place of the line's
   * name, which the header already says. */
  overviewHistoryCurrentLine: string;
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
  overviewOpening: string;
  overviewOpenProject: string;
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
  overviewChangeProjectIcon: "Change project icon",
  overviewOpenFolder: "Open project folder",
  overviewOpenFolderFailedTitle: "Couldn't open the folder",
  overviewOpenFolderFailedMessage: "Copy the path and open it from your file manager.",
  overviewOpeningTitle: "Opening project…",
  overviewOpeningDescription: "Checking the selected folder.",
  overviewOpenFailedTitle: "Couldn't open that project",
  overviewReviewChanges: "Review changes",
  overviewSaveVersion: "Save version",
  overviewCheckLocalAgain: "Check local changes again",
  overviewChangesPreviewOpenFile: (path) => `Review ${path}`,
  overviewJourneyResolve: "Resolve overlaps",
  overviewJourneyReadyToPublish: (count) =>
    count === 1 ? "1 version ready to publish" : `${count} versions ready to publish`,
  overviewJourneyNoUpstream: "No publish destination yet",
  overviewJourneyNoteSave: "Saving keeps a point to come back to, and nothing leaves this computer until you publish.",
  overviewJourneyNoteAhead: "Your saved versions are only on this computer until you publish them.",
  overviewJourneyNoteIdle: "Checking your project…",
  overviewPublishAll: (count) => (count === 1 ? "Publish all" : `Publish all ${count}`),
  overviewNextKickerNext: "Next step",
  overviewNextKickerBefore: "Before you continue",
  overviewNextKickerDecide: "Needs your decision",
  overviewNextKickerAllGood: "All in order",
  overviewNextKickerStatus: "Project status",
  overviewNextProgress: (done) => `${done} of 3 steps done`,
  overviewNextConflictsTitle: (count) =>
    count === 1 ? "1 file has overlapping changes" : `${count} files have overlapping changes`,
  overviewNextConflictsHint: "Choose what stays in each part. Nothing is saved until you finish.",
  overviewNextSaveTitle: (count) => (count === 1 ? "Save your change" : `Save your ${count} changes`),
  overviewNextPublishTitle: (count, remote) => {
    const what = count === 1 ? "1 version" : `${count} versions`;
    return remote ? `Publish ${what} to ${remote}` : `Publish ${what}`;
  },
  overviewNextUpToDateTitle: "Saved and published",
  overviewNextUpToDateHint: (remote) =>
    remote ? `${remote} has the same work as this computer.` : "Everything is saved and published.",
  overviewNowLabel: "Now",
  overviewNowClean: "Nothing unsaved",
  overviewNowConflicts: (count) =>
    count === 1 ? "1 file with overlapping changes" : `${count} files with overlapping changes`,
  overviewTimelineLocalGroup: "Only on this computer",
  overviewTimelineLocalCount: (count) => (count === 1 ? "1 version" : `${count} versions`),
  overviewTimelinePublishedOn: "Published on",
  overviewTimelineIncoming: (count) => (count === 1 ? "1 new version" : `${count} new versions`),
  overviewTimelineGet: "Get",
  overviewDetailSaveTitle: "What you'll save",
  overviewDetailPublishTitle: "What you'll publish",
  overviewDetailReview: "Review",
  overviewDetailInHistory: "In history",
  overviewDetailFiles: (count) => (count === 1 ? "1 file" : `${count} files`),
  overviewDetailFilesAtLeast: (count) => `${count}+ files`,
  overviewDetailInNextVersion: "in your next version",
  overviewDetailInVersions: (count) => (count === 1 ? "in 1 version" : `in ${count} versions`),
  overviewDetailMore: (count) => `and ${count} more`,
  overviewDetailLines: (added, removed) => `${added} lines added, ${removed} removed`,
  overviewDetailSaveNote: "Stays here until you publish.",
  overviewDetailPublishNote: "Seen by anyone on this line.",
  overviewDetailPublishNoteTo: (destination) => `Seen by anyone on ${destination}.`,
  overviewDetailLoading: "Reading the files…",
  overviewDetailFilesError: "Couldn't read the files in these versions.",
  overviewDetailVersionsError: "Couldn't read the versions waiting. Review them to see what changes.",
  overviewSafetyDiscarded: "Discarded changes",
  overviewSafetyDiscardedHint: (count, when) => `${count === 1 ? "1 file" : `${count} files`} · ${when}`,
  overviewNextKickerSaved: "All saved",
  overviewNextFirstSaveTitle: "Save your first version",
  overviewNextFirstSaveHint: (count) =>
    count === 1
      ? "It will be the first point you can go back to. 1 file is waiting."
      : `It will be the first point you can go back to. ${count} files are waiting.`,
  overviewNextBehindTitle: (count, remote) => {
    const what = count === 1 ? "1 new version" : `${count} new versions`;
    return remote ? `${what} on ${remote}` : `${what} available`;
  },
  overviewNextDivergedTitle: (count) =>
    count === 1 ? "Get 1 new version before publishing" : `Get ${count} new versions before publishing`,
  overviewNextDivergedHint: (remote) =>
    `${remote ?? "The remote"} moved on while you saved. Get them first, then publish yours.`,
  overviewNextUnavailableTitle: (remote) => (remote ? `Couldn't check ${remote}` : "Couldn't check the remote"),
  overviewNextUnavailableHint: "Your work is saved. Check your connection or account and try again.",
  overviewNextNoRemoteTitle: "Saved on this computer",
  overviewNextNoRemoteHint: "Connect a remote to keep a copy elsewhere and share it.",
  overviewNextDetachedTitle: "You're looking at an older version",
  overviewNextDetachedHint: "You can look around and try things. To keep saving, go back to a version line.",
  overviewNextConnectRemote: "Connect a remote",
  overviewNextOpenLines: "Choose a version line",
  overviewNextThen: "Then:",
  overviewNextThenGet: (count) => (count === 1 ? "1 new version" : `${count} new versions`),
  overviewNextThenOn: (remote) => `on ${remote}`,
  overviewNextThenPublish: (count) => (count === 1 ? "publish 1 version" : `publish ${count} versions`),
  overviewDetailResolveTitle: "What you need to decide",
  overviewDetailResolveSum: "with overlapping parts",
  overviewDetailResolveNote: "Open each one to choose what stays.",
  overviewDetailBringTitle: "What you'll get",
  overviewDetailBringNote: "You'll see what changes first.",
  overviewDetailVersions: (count) => (count === 1 ? "1 version" : `${count} versions`),
  overviewDetailFrom: (remote) => `from ${remote}`,
  overviewDetailVersionsLoading: "Reading the versions…",
  overviewDiscardRestore: "Restore",
  overviewSceneLabel: "Where your work is",
  overviewSceneLoading: "Reading where your work is…",
  overviewSceneTooltip: (remote) =>
    `Your work is here and on ${remote}: if something happens to one, it's still on the other.`,
  overviewSceneHere: "Here",
  overviewSceneRemote: "Remote",
  overviewSceneSynced: "up to date",
  overviewSceneNotChecked: "not checked",
  overviewSceneNoCopy: "No copy",
  overviewSceneConnect: "Connect",
  overviewSceneMissingYours: (count) => (count === 1 ? "without your latest" : `without your last ${count}`),
  overviewSceneNew: (count) => `${count} new`,
  overviewSceneUnsaved: (count) => `${count} unsaved`,
  overviewFactsCheck: "Check",
  overviewHistoryTitle: "Recent history",
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
  overviewHistoryYou: "You",
  overviewHistoryCurrentLine: "current",
  overviewHistoryPublicationUnknown: "Publish status unknown",
  overviewHistoryOpenVersion: (title) => `Open “${title}” in History`,
  overviewHistoryRefreshFailed: "Recent history may be out of date.",
  overviewPublishChanges: "Publish changes",
  overviewPendingVersionsError: "Couldn't load the versions waiting to be published.",
  overviewPublishUpTo: "Publish up to here",
  overviewPublishUpToHint: "Publishes this version and all older ones.",
  overviewCloseProject: "Close project",
  overviewOpening: "Opening…",
  overviewOpenProject: "Open a project",
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
  overviewChangeProjectIcon: "Cambiar el icono del proyecto",
  overviewOpenFolder: "Abrir la carpeta del proyecto",
  overviewOpenFolderFailedTitle: "No se pudo abrir la carpeta",
  overviewOpenFolderFailedMessage: "Copia la ruta y ábrela desde tu explorador de archivos.",
  overviewOpeningTitle: "Abriendo el proyecto…",
  overviewOpeningDescription: "Comprobando la carpeta elegida.",
  overviewOpenFailedTitle: "No se pudo abrir ese proyecto",
  overviewReviewChanges: "Revisar cambios",
  overviewSaveVersion: "Guardar versión",
  overviewCheckLocalAgain: "Volver a comprobar los cambios locales",
  overviewChangesPreviewOpenFile: (path) => `Revisar ${path}`,
  overviewJourneyResolve: "Resolver solapamientos",
  overviewJourneyReadyToPublish: (count) =>
    count === 1 ? "1 versión lista para publicar" : `${count} versiones listas para publicar`,
  overviewJourneyNoUpstream: "Aún sin destino de publicación",
  overviewJourneyNoteSave: "Guardar crea un punto al que volver y nada sale de este ordenador hasta que publiques.",
  overviewJourneyNoteAhead: "Tus versiones guardadas solo están en este ordenador hasta que las publiques.",
  overviewJourneyNoteIdle: "Revisando tu proyecto…",
  overviewPublishAll: (count) => (count === 1 ? "Publicar todo" : `Publicar las ${count}`),
  overviewNextKickerNext: "Siguiente paso",
  overviewNextKickerBefore: "Antes de seguir",
  overviewNextKickerDecide: "Necesita tu decisión",
  overviewNextKickerAllGood: "Todo en orden",
  overviewNextKickerStatus: "Estado del proyecto",
  overviewNextProgress: (done) => `${done} de 3 pasos hechos`,
  overviewNextConflictsTitle: (count) =>
    count === 1 ? "1 archivo tiene cambios superpuestos" : `${count} archivos tienen cambios superpuestos`,
  overviewNextConflictsHint: "Elige qué se queda en cada parte. No se guarda nada hasta que termines.",
  overviewNextSaveTitle: (count) => (count === 1 ? "Guarda tu cambio" : `Guarda tus ${count} cambios`),
  overviewNextPublishTitle: (count, remote) => {
    const what = count === 1 ? "1 versión" : `${count} versiones`;
    return remote ? `Publica ${what} en ${remote}` : `Publica ${what}`;
  },
  overviewNextUpToDateTitle: "Guardado y publicado",
  overviewNextUpToDateHint: (remote) =>
    remote ? `${remote} tiene el mismo trabajo que este ordenador.` : "Todo está guardado y publicado.",
  overviewNowLabel: "Ahora",
  overviewNowClean: "Nada sin guardar",
  overviewNowConflicts: (count) =>
    count === 1 ? "1 archivo con cambios superpuestos" : `${count} archivos con cambios superpuestos`,
  overviewTimelineLocalGroup: "Solo en este ordenador",
  overviewTimelineLocalCount: (count) => (count === 1 ? "1 versión" : `${count} versiones`),
  overviewTimelinePublishedOn: "Publicado en",
  overviewTimelineIncoming: (count) => (count === 1 ? "1 versión nueva" : `${count} versiones nuevas`),
  overviewTimelineGet: "Traer",
  overviewDetailSaveTitle: "Lo que vas a guardar",
  overviewDetailPublishTitle: "Lo que vas a publicar",
  overviewDetailReview: "Revisar",
  overviewDetailInHistory: "En el historial",
  overviewDetailFiles: (count) => (count === 1 ? "1 archivo" : `${count} archivos`),
  overviewDetailFilesAtLeast: (count) => `${count}+ archivos`,
  overviewDetailInNextVersion: "en tu próxima versión",
  overviewDetailInVersions: (count) => (count === 1 ? "en 1 versión" : `en ${count} versiones`),
  overviewDetailMore: (count) => `y ${count} más`,
  overviewDetailLines: (added, removed) => `${added} líneas añadidas, ${removed} quitadas`,
  overviewDetailSaveNote: "Se queda aquí hasta que publiques.",
  overviewDetailPublishNote: "Lo verá quien use esta línea.",
  overviewDetailPublishNoteTo: (destination) => `Lo verá quien use ${destination}.`,
  overviewDetailLoading: "Leyendo los archivos…",
  overviewDetailFilesError: "No se pudieron leer los archivos de estas versiones.",
  overviewDetailVersionsError: "No se pudieron leer las versiones que esperan. Revísalas para ver qué cambia.",
  overviewSafetyDiscarded: "Cambios descartados",
  overviewSafetyDiscardedHint: (count, when) => `${count === 1 ? "1 archivo" : `${count} archivos`} · ${when}`,
  overviewNextKickerSaved: "Todo guardado",
  overviewNextFirstSaveTitle: "Guarda tu primera versión",
  overviewNextFirstSaveHint: (count) =>
    count === 1
      ? "Será el primer punto al que podrás volver. 1 archivo espera."
      : `Será el primer punto al que podrás volver. ${count} archivos esperan.`,
  overviewNextBehindTitle: (count, remote) => {
    const what = count === 1 ? "1 versión nueva" : `${count} versiones nuevas`;
    return remote ? `${what} en ${remote}` : `${what} disponibles`;
  },
  overviewNextDivergedTitle: (count) =>
    count === 1 ? "Trae 1 versión nueva antes de publicar" : `Trae ${count} versiones nuevas antes de publicar`,
  overviewNextDivergedHint: (remote) =>
    `${remote ?? "El remoto"} ha avanzado mientras guardabas. Tráelas primero; luego podrás publicar las tuyas.`,
  overviewNextUnavailableTitle: (remote) => (remote ? `No se pudo comprobar ${remote}` : "No se pudo comprobar el remoto"),
  overviewNextUnavailableHint: "Tu trabajo está guardado. Revisa la conexión o la cuenta y vuelve a intentarlo.",
  overviewNextNoRemoteTitle: "Guardado en este ordenador",
  overviewNextNoRemoteHint: "Conecta un remoto para tener una copia fuera y poder compartirlo.",
  overviewNextDetachedTitle: "Estás viendo una versión antigua",
  overviewNextDetachedHint: "Puedes mirar y probar. Para seguir guardando, vuelve a una línea de versiones.",
  overviewNextConnectRemote: "Conectar un remoto",
  overviewNextOpenLines: "Elegir una línea",
  overviewNextThen: "Después:",
  overviewNextThenGet: (count) => (count === 1 ? "1 versión nueva" : `${count} versiones nuevas`),
  overviewNextThenOn: (remote) => `en ${remote}`,
  overviewNextThenPublish: (count) => (count === 1 ? "publicar 1 versión" : `publicar ${count} versiones`),
  overviewDetailResolveTitle: "Lo que tienes que decidir",
  overviewDetailResolveSum: "con partes superpuestas",
  overviewDetailResolveNote: "Abre cada uno para elegir qué queda.",
  overviewDetailBringTitle: "Lo que vas a traer",
  overviewDetailBringNote: "Verás qué cambia antes de traerlo.",
  overviewDetailVersions: (count) => (count === 1 ? "1 versión" : `${count} versiones`),
  overviewDetailFrom: (remote) => `de ${remote}`,
  overviewDetailVersionsLoading: "Leyendo las versiones…",
  overviewDiscardRestore: "Recuperar",
  overviewSceneLabel: "Dónde está tu trabajo",
  overviewSceneLoading: "Viendo dónde está tu trabajo…",
  overviewSceneTooltip: (remote) =>
    `Tu trabajo está aquí y en ${remote}: si algo le pasa a uno, sigue en el otro.`,
  overviewSceneHere: "Aquí",
  overviewSceneRemote: "Remoto",
  overviewSceneSynced: "al día",
  overviewSceneNotChecked: "sin comprobar",
  overviewSceneNoCopy: "Sin copia",
  overviewSceneConnect: "Conectar",
  overviewSceneMissingYours: (count) => (count === 1 ? "sin tu última" : `sin tus ${count} últimas`),
  overviewSceneNew: (count) => (count === 1 ? "1 nueva" : `${count} nuevas`),
  overviewSceneUnsaved: (count) => `${count} sin guardar`,
  overviewFactsCheck: "Comprobar",
  overviewHistoryTitle: "Historial reciente",
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
  overviewHistoryYou: "Tú",
  overviewHistoryCurrentLine: "actual",
  overviewHistoryPublicationUnknown: "Publicación desconocida",
  overviewHistoryOpenVersion: (title) => `Abrir «${title}» en Historial`,
  overviewHistoryRefreshFailed: "El historial reciente puede estar desactualizado.",
  overviewPublishChanges: "Publicar cambios",
  overviewPendingVersionsError: "No se pudieron cargar las versiones pendientes de publicar.",
  overviewPublishUpTo: "Publicar hasta aquí",
  overviewPublishUpToHint: "Publica esta versión y todas las anteriores.",
  overviewCloseProject: "Cerrar proyecto",
  overviewOpening: "Abriendo…",
  overviewOpenProject: "Abrir un proyecto",
  overviewOpenDialogTitle: "Abrir un proyecto de Git",
  overviewCouldntOpenFolder: "No se pudo abrir esa carpeta.",
};

export const overviewTranslations = { en, es } as const;
