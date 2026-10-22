export interface OverviewTranslations {
  overviewLocalProject: string;
  overviewSeparateWorkspace: string;
  overviewProjectReady: string;
  overviewWorktreeReady: string;
  overviewUnbornReady: string;
  overviewDetachedReady: string;
  overviewOpenAnotherProject: string;
  overviewHomeLoading: string;
  overviewHomeLocal: string;
  overviewHomeLocalHint: string;
  /** Opens `label` on `service` ("GitHub", or "the web" for another server). */
  overviewHomeOpen: (label: string, service: string) => string;
  overviewHomeRemote: (remote: string) => string;
  overviewHomeWeb: string;
  overviewHomeOpenFailedTitle: string;
  overviewHomeOpenFailedMessage: string;
  overviewBranchDescription: string;
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
  /** The card's three-segment progress, read out: "2 of 3 steps done". */
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
  /** The mark above the newest version the remote has: "Published on". */
  overviewTimelinePublished: string;
  /** The row above "now" for versions waiting on the remote. */
  overviewTimelineIncoming: (count: number) => string;
  overviewTimelineGet: string;
  /** Under the last version drawn when older ones exist; History has them. */
  overviewTimelineEndMore: (count: number) => string;
  /** Under the last version of a shallow copy, whose older history was not downloaded. */
  overviewTimelineEndShallow: string;
  /** Under the branch's first version. */
  overviewTimelineEndStart: string;
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
  /** When the remote branch has another name than the project's branch. */
  overviewDetailLoading: string;
  overviewDetailFilesError: string;
  overviewDetailVersionsError: string;
  overviewSafetyDiscarded: string;
  /** A listed copy's line: its file count, then a few of its file names. */
  overviewSafetyDiscardedHint: (count: number, names: string) => string;
  /** Several restorable copies: how many (the badge on the icon, read out
   * for assistive technology), and when the newest was made. */
  /** The card's other cases: the first save, versions waiting on the remote,
   * both sides moved, a check that failed, no remote, an older version. */
  overviewNextFirstSaveTitle: string;
  overviewNextFirstSaveHint: (count: number) => string;
  overviewNextBehindTitle: (count: number, remote: string | null) => string;
  overviewNextDivergedTitle: (count: number) => string;
  overviewNextDivergedHint: (remote: string | null) => string;
  overviewNextFromHint: (from: string, files: number) => string;
  overviewNextDivergedBoth: (incoming: number, local: number, remote: string | null) => string;
  overviewNextGetCount: (count: number) => string;
  overviewNextGetAndCombine: string;
  overviewNextGetAndPublish: string;
  overviewNextSeeOverlap: string;
  overviewNextSeeWhy: string;
  overviewNextOverlapTitle: (remote: string | null) => string;
  overviewNextOverlapHint: (path: string, more: number) => string;
  overviewNextNoteClear: string;
  overviewNextNoteCanCombine: string;
  overviewNextNoteOverlap: string;
  overviewNextNoteIncomingClear: (count: number, remote: string | null) => string;
  overviewNextNoteIncomingCombined: (count: number, remote: string | null, file: string, fileCount: number) => string;
  overviewNextUnavailableTitle: (remote: string | null) => string;
  overviewNextUnavailableHint: string;
  overviewNextNoRemoteTitle: string;
  overviewNextNoRemoteHint: string;
  overviewNextDetachedTitle: string;
  overviewNextDetachedHint: string;
  overviewNextConnectRemote: string;
  overviewNextOpenBranches: string;
  overviewNextGoneTitle: (branch: string | null, remote: string | null) => string;
  overviewNextGoneHint: (remote: string | null) => string;
  overviewNextSwitchTo: (branch: string) => string;
  overviewNextPublishAgain: string;
  overviewNextStopTracking: string;
  overviewNextPublishBranch: string;
  /** The timeline's boundary for a branch whose remote branch was deleted. */
  overviewTimelineWasPublished: string;
  /** The neutral pill for what comes after this step: "Then: 3 new versions
   * on origin", "Then: publish 2 versions". */
  overviewNextThen: string;
  overviewNextThenGet: (count: number) => string;
  overviewNextThenOn: (remote: string) => string;
  overviewNextThenPublish: (count: number) => string;
  /** While saving is the step: publish what is about to be saved, with the
   * `count` versions already waiting ("publish it along with 4 more"). */
  overviewNextThenPublishWith: (count: number) => string;
  /** The side column's other details. */
  overviewDetailResolveTitle: string;
  overviewDetailResolveSum: string;
  overviewDetailBringTitle: string;
  overviewDetailVersions: (count: number) => string;
  overviewDetailFrom: (remote: string) => string;
  overviewDetailVersionsLoading: string;
  overviewDiscardRestore: string;
  overviewDiscardRestoreCopy: (when: string, count: number) => string;
  /** The remote's name in the timeline when it has none. */
  overviewTimelineRemote: string;
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
  /** The badge on the version the project stands on, in place of the branch's
   * name, which the header already says. */
  overviewHistoryCurrentBranch: string;
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
  overviewHomeLoading: "Reading where this project lives…",
  overviewHomeLocal: "Only on this computer",
  overviewHomeLocalHint: "No remote yet: connect one in the project's settings to publish it.",
  overviewHomeOpen: (label, service) => `Open ${label} on ${service}`,
  overviewHomeRemote: (remote) => `Remote “${remote}”`,
  overviewHomeWeb: "the web",
  overviewHomeOpenFailedTitle: "Couldn't open the page",
  overviewHomeOpenFailedMessage: "Open the project's page from your browser.",
  overviewBranchDescription: "New work goes on this branch.",
  overviewDetachedDescription: "You're looking at a specific point in history.",
  overviewUnbornDescription: "Your first saved version starts this project's history.",
  overviewProjectType: "Project type",
  overviewRepositoryTypeDescription: "A standard project in this folder.",
  overviewWorktreeTypeDescription: "A linked workspace with its own files and branch.",
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
  overviewTimelineLocalGroup: "On this computer",
  overviewTimelinePublished: "Published",
  overviewTimelineIncoming: (count) => (count === 1 ? "1 new version" : `${count} new versions`),
  overviewTimelineGet: "Get",
  overviewTimelineEndMore: (count) =>
    count === 1 ? "Latest version · older ones are in History" : `Latest ${count} versions · older ones are in History`,
  overviewTimelineEndShallow: "Older versions were not downloaded to this computer",
  overviewTimelineEndStart: "Where the project began",
  overviewDetailSaveTitle: "What you'll save",
  overviewDetailPublishTitle: "What you'll publish",
  overviewDetailReview: "Review",
  overviewDetailInHistory: "History",
  overviewDetailFiles: (count) => (count === 1 ? "1 file" : `${count} files`),
  overviewDetailFilesAtLeast: (count) => `${count}+ files`,
  overviewDetailInNextVersion: "in your next version",
  overviewDetailInVersions: (count) => (count === 1 ? "in 1 version" : `in ${count} versions`),
  overviewDetailMore: (count) => `and ${count} more`,
  overviewDetailLines: (added, removed) => `${added} lines added, ${removed} removed`,
  overviewDetailLoading: "Reading the files…",
  overviewDetailFilesError: "Couldn't read the files in these versions.",
  overviewDetailVersionsError: "Couldn't read the versions waiting. Review them to see what changes.",
  overviewSafetyDiscarded: "Discarded changes",
  overviewSafetyDiscardedHint: (count, names) => `${count === 1 ? "1 file" : `${count} files`} · ${names}`,
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
  overviewNextFromHint: (from, files) =>
    `${from ? `${from} · ` : ""}${files} ${files === 1 ? "file" : "files"}.`,
  overviewNextDivergedBoth: (incoming, local, remote) =>
    `${remote ?? "The remote"} has ${incoming === 1 ? "1 new version" : `${incoming} new versions`} and you have ${local} unpublished`,
  overviewNextGetCount: (count) => (count === 1 ? "Get 1 version" : `Get ${count} versions`),
  overviewNextGetAndCombine: "Get and combine",
  overviewNextGetAndPublish: "Get and publish",
  overviewNextSeeOverlap: "See what overlaps",
  overviewNextSeeWhy: "See why",
  overviewNextOverlapTitle: (remote) => `Your changes and ${remote ?? "the remote"}'s overlap`,
  overviewNextOverlapHint: (path, more) =>
    `${path} changes the same lines on both sides${more > 0 ? ` (and ${more} more)` : ""}. They can't be combined in GitOdile yet.`,
  overviewNextNoteClear: "Nothing of yours overlaps.",
  overviewNextNoteCanCombine: "They don't overlap: they can be combined.",
  overviewNextNoteOverlap: "Nothing comes in until they stop overlapping.",
  overviewNextNoteIncomingClear: (count, remote) =>
    `${count === 1 ? "1 new version" : `${count} new versions`} on ${remote ?? "the remote"} ${count === 1 ? "doesn't" : "don't"} touch your files.`,
  overviewNextNoteIncomingCombined: (count, remote, file, fileCount) =>
    `${count === 1 ? "1 new version" : `${count} new versions`} on ${remote ?? "the remote"} also ${count === 1 ? "changes" : "change"} ${fileCount === 1 ? file : `${fileCount} of your files`}, on other lines: your edits stay on top.`,
  overviewNextUnavailableTitle: (remote) => (remote ? `Couldn't check ${remote}` : "Couldn't check the remote"),
  overviewNextUnavailableHint: "Your work is saved. Check your connection or account and try again.",
  overviewNextNoRemoteTitle: "Saved on this computer",
  overviewNextNoRemoteHint: "Connect a remote to keep a copy elsewhere and share it.",
  overviewNextDetachedTitle: "You're looking at an older version",
  overviewNextDetachedHint: "You can look around and try things. To keep saving, go back to a branch.",
  overviewNextConnectRemote: "Connect a remote",
  overviewNextOpenBranches: "Choose a branch",
  overviewNextGoneTitle: (branch, remote) =>
    `${branch ? `“${branch}”` : "This branch"} is no longer on ${remote ? `“${remote}”` : "the remote"}`,
  overviewNextGoneHint: (remote) =>
    `Someone deleted it on ${remote ? `“${remote}”` : "the remote"}, usually after merging its pull request. Your saved versions are still on this computer.`,
  overviewNextSwitchTo: (branch) => `Switch to ${branch}`,
  overviewNextPublishAgain: "Publish again…",
  overviewNextStopTracking: "Stop following the remote",
  overviewNextPublishBranch: "Publish this branch…",
  overviewTimelineWasPublished: "Was published",
  overviewNextThen: "Then:",
  overviewNextThenGet: (count) => (count === 1 ? "1 new version" : `${count} new versions`),
  overviewNextThenOn: (remote) => `on ${remote}`,
  overviewNextThenPublish: (count) => (count === 1 ? "publish 1 version" : `publish ${count} versions`),
  overviewNextThenPublishWith: (count) => (count === 0 ? "publish it" : `publish it along with ${count} more`),
  overviewDetailResolveTitle: "What you'll decide",
  overviewDetailResolveSum: "with overlapping parts",
  overviewDetailBringTitle: "What you'll get",
  overviewDetailVersions: (count) => (count === 1 ? "1 version" : `${count} versions`),
  overviewDetailFrom: (remote) => `from ${remote}`,
  overviewDetailVersionsLoading: "Reading the versions…",
  overviewDiscardRestore: "Restore",
  overviewDiscardRestoreCopy: (when, count) => `Restore the copy from ${when}, ${count === 1 ? "1 file" : `${count} files`}`,
  overviewTimelineRemote: "Remote",
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
  overviewHistoryCurrentBranch: "current",
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
  overviewHomeLoading: "Viendo dónde vive este proyecto…",
  overviewHomeLocal: "Solo en este ordenador",
  overviewHomeLocalHint: "Aún no tiene remoto: conecta uno en los ajustes del proyecto para publicarlo.",
  overviewHomeOpen: (label, service) => `Abrir ${label} en ${service}`,
  overviewHomeRemote: (remote) => `Remoto «${remote}»`,
  overviewHomeWeb: "la web",
  overviewHomeOpenFailedTitle: "No se pudo abrir la página",
  overviewHomeOpenFailedMessage: "Abre la página del proyecto desde tu navegador.",
  overviewBranchDescription: "El trabajo nuevo va a esta rama.",
  overviewDetachedDescription: "Estás viendo un punto concreto del historial.",
  overviewUnbornDescription: "Tu primera versión guardada inicia el historial del proyecto.",
  overviewProjectType: "Tipo de proyecto",
  overviewRepositoryTypeDescription: "Un proyecto normal en esta carpeta.",
  overviewWorktreeTypeDescription: "Un espacio de trabajo vinculado, con sus propios archivos y rama.",
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
  overviewTimelineLocalGroup: "En este ordenador",
  overviewTimelinePublished: "Publicado",
  overviewTimelineIncoming: (count) => (count === 1 ? "1 versión nueva" : `${count} versiones nuevas`),
  overviewTimelineGet: "Traer",
  overviewTimelineEndMore: (count) =>
    count === 1 ? "Última versión · las anteriores están en Historial" : `Últimas ${count} versiones · las anteriores están en Historial`,
  overviewTimelineEndShallow: "Las versiones anteriores no se descargaron en este ordenador",
  overviewTimelineEndStart: "Aquí empezó el proyecto",
  overviewDetailSaveTitle: "Lo que vas a guardar",
  overviewDetailPublishTitle: "Lo que vas a publicar",
  overviewDetailReview: "Revisar",
  overviewDetailInHistory: "Historial",
  overviewDetailFiles: (count) => (count === 1 ? "1 archivo" : `${count} archivos`),
  overviewDetailFilesAtLeast: (count) => `${count}+ archivos`,
  overviewDetailInNextVersion: "en tu próxima versión",
  overviewDetailInVersions: (count) => (count === 1 ? "en 1 versión" : `en ${count} versiones`),
  overviewDetailMore: (count) => `y ${count} más`,
  overviewDetailLines: (added, removed) => `${added} líneas añadidas, ${removed} quitadas`,
  overviewDetailLoading: "Leyendo los archivos…",
  overviewDetailFilesError: "No se pudieron leer los archivos de estas versiones.",
  overviewDetailVersionsError: "No se pudieron leer las versiones que esperan. Revísalas para ver qué cambia.",
  overviewSafetyDiscarded: "Cambios descartados",
  overviewSafetyDiscardedHint: (count, names) => `${count === 1 ? "1 archivo" : `${count} archivos`} · ${names}`,
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
  overviewNextFromHint: (from, files) =>
    `${from ? `${from} · ` : ""}${files} ${files === 1 ? "archivo" : "archivos"}.`,
  overviewNextDivergedBoth: (incoming, local, remote) =>
    `${remote ?? "El remoto"} tiene ${incoming === 1 ? "1 versión nueva" : `${incoming} versiones nuevas`} y tú ${local} sin publicar`,
  overviewNextGetCount: (count) => (count === 1 ? "Traer 1 versión" : `Traer ${count} versiones`),
  overviewNextGetAndCombine: "Traer y combinar",
  overviewNextGetAndPublish: "Traer y publicar",
  overviewNextSeeOverlap: "Ver qué se pisa",
  overviewNextSeeWhy: "Ver por qué",
  overviewNextOverlapTitle: (remote) => `Tus cambios y los de ${remote ?? "el remoto"} se pisan`,
  overviewNextOverlapHint: (path, more) =>
    `${path} cambia las mismas líneas en los dos lados${more > 0 ? ` (y ${more} más)` : ""}. Aún no se pueden combinar desde GitOdile.`,
  overviewNextNoteClear: "No choca con nada tuyo.",
  overviewNextNoteCanCombine: "No se pisan: se pueden combinar.",
  overviewNextNoteOverlap: "No se trae nada hasta que dejen de pisarse.",
  overviewNextNoteIncomingClear: (count, remote) =>
    `${count === 1 ? "Hay 1 versión nueva" : `Hay ${count} versiones nuevas`} en ${remote ?? "el remoto"} que no ${count === 1 ? "toca" : "tocan"} tus archivos.`,
  overviewNextNoteIncomingCombined: (count, remote, file, fileCount) =>
    `${count === 1 ? "1 versión nueva" : `${count} versiones nuevas`} en ${remote ?? "el remoto"} también ${count === 1 ? "cambia" : "cambian"} ${fileCount === 1 ? file : `${fileCount} de tus archivos`}, en otras líneas: tus cambios se quedan encima.`,
  overviewNextUnavailableTitle: (remote) => (remote ? `No se pudo comprobar ${remote}` : "No se pudo comprobar el remoto"),
  overviewNextUnavailableHint: "Tu trabajo está guardado. Revisa la conexión o la cuenta y vuelve a intentarlo.",
  overviewNextNoRemoteTitle: "Guardado en este ordenador",
  overviewNextNoRemoteHint: "Conecta un remoto para tener una copia fuera y poder compartirlo.",
  overviewNextDetachedTitle: "Estás viendo una versión antigua",
  overviewNextDetachedHint: "Puedes mirar y probar. Para seguir guardando, vuelve a una rama.",
  overviewNextConnectRemote: "Conectar un remoto",
  overviewNextOpenBranches: "Elegir una rama",
  overviewNextGoneTitle: (branch, remote) =>
    `${branch ? `«${branch}»` : "Esta rama"} ya no está en ${remote ? `«${remote}»` : "el remoto"}`,
  overviewNextGoneHint: (remote) =>
    `Alguien la borró en ${remote ? `«${remote}»` : "el remoto"}, normalmente al fusionar su PR. Tus versiones siguen en este ordenador.`,
  overviewNextSwitchTo: (branch) => `Cambiar a ${branch}`,
  overviewNextPublishAgain: "Volver a publicar…",
  overviewNextStopTracking: "Dejar de seguir el remoto",
  overviewNextPublishBranch: "Publicar esta rama…",
  overviewTimelineWasPublished: "Estuvo publicado",
  overviewNextThen: "Después:",
  overviewNextThenGet: (count) => (count === 1 ? "1 versión nueva" : `${count} versiones nuevas`),
  overviewNextThenOn: (remote) => `en ${remote}`,
  overviewNextThenPublish: (count) => (count === 1 ? "publicar 1 versión" : `publicar ${count} versiones`),
  overviewNextThenPublishWith: (count) =>
    count === 0 ? "publicarla" : count === 1 ? "publicarla junto a otra" : `publicarla junto a otras ${count}`,
  overviewDetailResolveTitle: "Lo que vas a decidir",
  overviewDetailResolveSum: "con partes superpuestas",
  overviewDetailBringTitle: "Lo que vas a traer",
  overviewDetailVersions: (count) => (count === 1 ? "1 versión" : `${count} versiones`),
  overviewDetailFrom: (remote) => `de ${remote}`,
  overviewDetailVersionsLoading: "Leyendo las versiones…",
  overviewDiscardRestore: "Recuperar",
  overviewDiscardRestoreCopy: (when, count) => `Recuperar la copia de ${when}, ${count === 1 ? "1 archivo" : `${count} archivos`}`,
  overviewTimelineRemote: "Remoto",
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
  overviewHistoryCurrentBranch: "actual",
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
