export interface PublishTranslations {
  publishDialogTitle: string;
  publishDialogTitleFirst: (branch: string) => string;
  publishChooseRemoteHeading: string;
  /** The plan in one line: how many versions, to which line on which remote. */
  publishPlanLine: (count: number, remote: string, branch: string) => string;
  publishLoadingTitle: string;
  publishChooseRemoteTitle: string;
  publishChooseRemoteDescription: string;
  publishSummary: (remote: string, branch: string) => string;
  publishCommitListLabel: string;
  publishLoadingFiles: string;
  publishFilesError: string;
  publishLoadingDiff: string;
  publishDiffError: string;
  publishUnsavedFilesNote: string;
  publishRemainingNote: (count: number) => string;
  publishTeammatesNote: string;
  publishConfirm: string;
  /** The held-back primary action while the fresh plan's remote check runs. */
  publishCheckingRemote: string;
  publishPublishing: string;
  publishVerifying: string;
  publishCannotCloseNote: string;
  publishReviewUpdatedPlan: string;
  publishCheckRemoteAgain: string;
  publishSuccessDescription: (count: number, remote: string) => string;
}

const en: PublishTranslations = {
  publishDialogTitle: "Publish changes",
  publishDialogTitleFirst: (branch) => `Publish “${branch}” for the first time`,
  publishChooseRemoteHeading: "Where to publish?",
  publishPlanLine: (count, remote, branch) =>
    count === 1
      ? `1 version will be published to “${branch}” on “${remote}”.`
      : `${count} versions will be published to “${branch}” on “${remote}”.`,
  publishLoadingTitle: "Checking what's ready to publish…",
  publishChooseRemoteTitle: "Choose a remote",
  publishChooseRemoteDescription: "This project has several remotes.",
  publishSummary: (remote, branch) => `Publish to “${remote}” (${branch}).`,
  publishCommitListLabel: "Versions to publish",
  publishLoadingFiles: "Loading changed files…",
  publishFilesError: "Couldn't load the changed files.",
  publishLoadingDiff: "Loading changes…",
  publishDiffError: "Couldn't load this file's changes.",
  publishUnsavedFilesNote: "Your unsaved changes stay on this computer.",
  publishRemainingNote: (count) =>
    count === 1
      ? "1 more version stays unpublished for now."
      : `${count} more versions stay unpublished for now.`,
  publishTeammatesNote: "Anyone with access to the remote project will see them.",
  publishConfirm: "Publish changes",
  publishCheckingRemote: "Checking the remote…",
  publishPublishing: "Publishing…",
  publishVerifying: "Checking the result…",
  publishCannotCloseNote: "Keep this window open until it finishes.",
  publishReviewUpdatedPlan: "Review again",
  publishCheckRemoteAgain: "Check remote again",
  publishSuccessDescription: (count, remote) =>
    count === 1
      ? `1 version published to “${remote}”.`
      : `${count} versions published to “${remote}”.`,
};

const es: PublishTranslations = {
  publishDialogTitle: "Publicar cambios",
  publishDialogTitleFirst: (branch) => `Publicar «${branch}» por primera vez`,
  publishChooseRemoteHeading: "¿Dónde publicar?",
  publishPlanLine: (count, remote, branch) =>
    count === 1
      ? `1 versión se publicará en «${branch}» de «${remote}».`
      : `${count} versiones se publicarán en «${branch}» de «${remote}».`,
  publishLoadingTitle: "Comprobando qué está listo para publicar…",
  publishChooseRemoteTitle: "Elige un remoto",
  publishChooseRemoteDescription: "Este proyecto tiene varios remotos.",
  publishSummary: (remote, branch) => `Publicar en «${remote}» (${branch}).`,
  publishCommitListLabel: "Versiones que se publicarán",
  publishLoadingFiles: "Cargando archivos cambiados…",
  publishFilesError: "No se pudieron cargar los archivos cambiados.",
  publishLoadingDiff: "Cargando los cambios…",
  publishDiffError: "No se pudieron cargar los cambios de este archivo.",
  publishUnsavedFilesNote: "Tus cambios sin guardar se quedan en este ordenador.",
  publishRemainingNote: (count) =>
    count === 1
      ? "1 versión más se queda sin publicar por ahora."
      : `${count} versiones más se quedan sin publicar por ahora.`,
  publishTeammatesNote: "Cualquiera con acceso al proyecto remoto podrá verlas.",
  publishConfirm: "Publicar cambios",
  publishCheckingRemote: "Comprobando el remoto…",
  publishPublishing: "Publicando…",
  publishVerifying: "Comprobando el resultado…",
  publishCannotCloseNote: "No cierres esta ventana hasta que termine.",
  publishReviewUpdatedPlan: "Revisar de nuevo",
  publishCheckRemoteAgain: "Volver a comprobar el remoto",
  publishSuccessDescription: (count, remote) =>
    count === 1
      ? `1 versión publicada en «${remote}».`
      : `${count} versiones publicadas en «${remote}».`,
};

export const publishTranslations = { en, es } as const;
