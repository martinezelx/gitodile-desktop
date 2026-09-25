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
  publishChooseRemoteTitle: "Choose a remote",
  publishChooseRemoteDescription: "This project has several remotes. Choose where to publish.",
  publishSummary: (remote, branch) => `Publish to “${remote}” (${branch}).`,
  publishDestinationLabel: "Destination",
  publishWillPublishLabel: "Will be published",
  publishWillStayLabel: "Stays on this computer",
  publishVisibilityLabel: "Who can see it",
  publishCommitCount: (count) =>
    count === 1 ? "1 saved version will be published." : `${count} saved versions will be published.`,
  publishCommitListLabel: "Versions to publish",
  publishLoadingFiles: "Loading changed files…",
  publishFilesError: "Couldn't load the changed files.",
  publishLoadingDiff: "Loading changes…",
  publishDiffError: "Couldn't load this file's changes.",
  publishUpstreamNote: "This line will start tracking the remote branch.",
  publishUnsavedFilesNote: "Only saved versions are published. Unsaved changes stay on this computer.",
  publishUnsavedChangesPill: "Unsaved changes",
  publishRemainingNote: (count) =>
    count === 1
      ? "1 other saved version stays unpublished for now."
      : `${count} other saved versions stay unpublished for now.`,
  publishTeammatesNote: "Anyone with access to the remote will see these versions.",
  publishConfirm: "Publish now",
  publishPublishing: "Publishing…",
  publishVerifying: "Checking the result…",
  publishCannotCloseNote: "Keep this window open while GitOdile confirms the result.",
  publishReviewUpdatedPlan: "Review again",
  publishCheckRemoteAgain: "Check remote again",
  publishSuccessTitle: "Published",
  publishSuccessDescription: (count, remote) =>
    count === 1
      ? `1 saved version was published to “${remote}”.`
      : `${count} saved versions were published to “${remote}”.`,
  publishSuccessUpstreamNote: "This line now tracks the remote branch.",
  publishDone: "Done",
};

const es: PublishTranslations = {
  publishDialogTitle: "Publicar cambios",
  publishDialogTitleFirst: "Publicar por primera vez",
  publishLoadingTitle: "Comprobando qué está listo para publicar…",
  publishChooseRemoteTitle: "Elige un remoto",
  publishChooseRemoteDescription: "Este proyecto tiene varios remotos. Elige dónde publicar.",
  publishSummary: (remote, branch) => `Publicar en «${remote}» (${branch}).`,
  publishDestinationLabel: "Destino",
  publishWillPublishLabel: "Se publicará",
  publishWillStayLabel: "Se queda en este ordenador",
  publishVisibilityLabel: "Quién podrá verlo",
  publishCommitCount: (count) =>
    count === 1 ? "Se publicará 1 versión guardada." : `Se publicarán ${count} versiones guardadas.`,
  publishCommitListLabel: "Versiones que se publicarán",
  publishLoadingFiles: "Cargando archivos cambiados…",
  publishFilesError: "No se pudieron cargar los archivos cambiados.",
  publishLoadingDiff: "Cargando los cambios…",
  publishDiffError: "No se pudieron cargar los cambios de este archivo.",
  publishUpstreamNote: "Esta línea empezará a seguir la rama remota.",
  publishUnsavedFilesNote: "Solo se publican las versiones guardadas. Los cambios sin guardar se quedan en este ordenador.",
  publishUnsavedChangesPill: "Cambios sin guardar",
  publishRemainingNote: (count) =>
    count === 1
      ? "Otra versión guardada se queda sin publicar por ahora."
      : `Otras ${count} versiones guardadas se quedan sin publicar por ahora.`,
  publishTeammatesNote: "Quien tenga acceso al remoto verá estas versiones.",
  publishConfirm: "Publicar ahora",
  publishPublishing: "Publicando…",
  publishVerifying: "Comprobando el resultado…",
  publishCannotCloseNote: "Mantén esta ventana abierta mientras GitOdile confirma el resultado.",
  publishReviewUpdatedPlan: "Revisar de nuevo",
  publishCheckRemoteAgain: "Volver a comprobar el remoto",
  publishSuccessTitle: "Publicado",
  publishSuccessDescription: (count, remote) =>
    count === 1
      ? `Se publicó 1 versión guardada en «${remote}».`
      : `Se publicaron ${count} versiones guardadas en «${remote}».`,
  publishSuccessUpstreamNote: "Esta línea ahora sigue la rama remota.",
  publishDone: "Listo",
};

export const publishTranslations = { en, es } as const;
