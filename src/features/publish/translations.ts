export interface PublishTranslations {
  publishDialogTitle: string;
  publishDialogTitleFirst: string;
  publishLoadingTitle: string;
  publishChooseRemoteTitle: string;
  publishChooseRemoteDescription: string;
  publishSummary: (remote: string, branch: string) => string;
  publishDestinationLabel: string;
  publishWillPublishLabel: string;
  publishWillStayLabel: string;
  publishVisibilityLabel: string;
  publishCommitCount: (count: number) => string;
  publishCommitListLabel: string;
  publishLoadingFiles: string;
  publishFilesError: string;
  publishLoadingDiff: string;
  publishDiffError: string;
  publishUpstreamNote: string;
  publishUnsavedFilesNote: string;
  publishUnsavedChangesPill: string;
  publishRemainingNote: (count: number) => string;
  publishTeammatesNote: string;
  publishConfirm: string;
  publishPublishing: string;
  publishVerifying: string;
  publishCannotCloseNote: string;
  publishReviewUpdatedPlan: string;
  publishCheckRemoteAgain: string;
  publishSuccessTitle: string;
  publishSuccessDescription: (count: number, remote: string) => string;
  publishSuccessUpstreamNote: string;
  publishDone: string;
}

const en: PublishTranslations = {
  publishDialogTitle: "Publish changes",
  publishDialogTitleFirst: "Publish for the first time",
  publishLoadingTitle: "Checking what's ready to publish…",
  publishChooseRemoteTitle: "Choose a remote project",
  publishChooseRemoteDescription:
    "This project has more than one remote project configured. Choose where to publish.",
  publishSummary: (remote, branch) => `Publish to "${remote}" (${branch}).`,
  publishDestinationLabel: "Destination",
  publishWillPublishLabel: "Will be published",
  publishWillStayLabel: "Will stay on this computer",
  publishVisibilityLabel: "Who can see it",
  publishCommitCount: (count) =>
    count === 1 ? "1 saved version will be published." : `${count} saved versions will be published.`,
  publishCommitListLabel: "Versions being published",
  publishLoadingFiles: "Loading changed files…",
  publishFilesError: "Couldn't load the changed files.",
  publishLoadingDiff: "Loading line changes…",
  publishDiffError: "Couldn't load this file's line changes.",
  publishUpstreamNote: "This version line will start tracking the remote branch.",
  publishUnsavedFilesNote: "Unsaved files on this computer will stay local — only saved versions are published.",
  publishUnsavedChangesPill: "Unsaved file changes",
  publishRemainingNote: (count) =>
    count === 1
      ? "1 other saved version will stay unpublished for now."
      : `${count} other saved versions will stay unpublished for now.`,
  publishTeammatesNote: "Teammates with access to this remote project will be able to see the published history.",
  publishConfirm: "Publish now",
  publishPublishing: "Publishing…",
  publishVerifying: "Checking the result…",
  publishCannotCloseNote: "Keep this window open while GitOdile confirms the remote result.",
  publishReviewUpdatedPlan: "Review updated plan",
  publishCheckRemoteAgain: "Check remote again",
  publishSuccessTitle: "Published",
  publishSuccessDescription: (count, remote) =>
    count === 1
      ? `1 saved version was published to "${remote}".`
      : `${count} saved versions were published to "${remote}".`,
  publishSuccessUpstreamNote: "This version line now tracks the remote branch.",
  publishDone: "Done",
};

const es: PublishTranslations = {
  publishDialogTitle: "Publicar cambios",
  publishDialogTitleFirst: "Publicar por primera vez",
  publishLoadingTitle: "Comprobando qué está listo para publicar…",
  publishChooseRemoteTitle: "Elige un proyecto remoto",
  publishChooseRemoteDescription:
    "Este proyecto tiene más de un proyecto remoto configurado. Elige dónde publicar.",
  publishSummary: (remote, branch) => `Publicar en "${remote}" (${branch}).`,
  publishDestinationLabel: "Destino",
  publishWillPublishLabel: "Se publicará",
  publishWillStayLabel: "Permanecerá en este equipo",
  publishVisibilityLabel: "Quién podrá verlo",
  publishCommitCount: (count) =>
    count === 1 ? "Se publicará 1 versión guardada." : `Se publicarán ${count} versiones guardadas.`,
  publishCommitListLabel: "Versiones que se van a publicar",
  publishLoadingFiles: "Cargando archivos cambiados…",
  publishFilesError: "No se pudieron cargar los archivos cambiados.",
  publishLoadingDiff: "Cargando cambios por línea…",
  publishDiffError: "No se pudieron cargar los cambios de este archivo.",
  publishUpstreamNote: "Esta línea de versión empezará a seguir la rama remota.",
  publishUnsavedFilesNote:
    "Los archivos sin guardar en este equipo permanecerán locales — solo se publican las versiones guardadas.",
  publishUnsavedChangesPill: "Cambios de archivos sin guardar",
  publishRemainingNote: (count) =>
    count === 1
      ? "Otra versión guardada quedará sin publicar por ahora."
      : `Otras ${count} versiones guardadas quedarán sin publicar por ahora.`,
  publishTeammatesNote:
    "Las personas con acceso a este proyecto remoto podrán ver el historial publicado.",
  publishConfirm: "Publicar ahora",
  publishPublishing: "Publicando…",
  publishVerifying: "Comprobando el resultado…",
  publishCannotCloseNote: "Mantén esta ventana abierta mientras GitOdile confirma el resultado remoto.",
  publishReviewUpdatedPlan: "Revisar el plan actualizado",
  publishCheckRemoteAgain: "Comprobar remoto de nuevo",
  publishSuccessTitle: "Publicado",
  publishSuccessDescription: (count, remote) =>
    count === 1
      ? `Se publicó 1 versión guardada en "${remote}".`
      : `Se publicaron ${count} versiones guardadas en "${remote}".`,
  publishSuccessUpstreamNote: "Esta línea de versión ahora sigue la rama remota.",
  publishDone: "Listo",
};

export const publishTranslations = { en, es } as const;
