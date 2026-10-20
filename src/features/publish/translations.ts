export interface PublishTranslations {
  publishDialogTitle: string;
  /** Titles fit one line, so the line's name is in the plan's sentence. */
  publishDialogTitleFirst: string;
  /** The line tracks a branch the remote deleted: publishing creates it again. */
  publishDialogTitleAgain: string;
  /** The dead ends, each a short message of its own. */
  publishNothingTitle: string;
  publishBlockedTitle: string;
  /** What stays safe, the plan's last fact. */
  publishSafeNote: string;
  publishRecreateWarningTitle: (remote: string) => string;
  publishRecreateWarningBody: string;
  /** Recreating a branch whose versions the remote already has elsewhere. */
  publishRecreateOnlyLine: (remote: string, branch: string) => string;
  publishRecreateConfirm: string;
  /** A new remote branch whose versions the remote already has elsewhere. */
  publishCreateOnlyLine: (remote: string, branch: string) => string;
  /** The toast for a publish that created a branch and sent no new version. */
  publishBranchCreatedDescription: (branch: string, remote: string) => string;
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
  publishDialogTitleFirst: "Publish a new line",
  publishDialogTitleAgain: "Publish the line again",
  publishNothingTitle: "Everything is published",
  publishBlockedTitle: "Can't publish yet",
  publishSafeNote: "Nothing already on the remote is overwritten.",
  publishRecreateWarningTitle: (remote) => `This line was deleted on “${remote}”.`,
  publishRecreateWarningBody:
    "Publishing creates it there again. If its pull request was already merged, switching to the main line is usually better.",
  publishRecreateOnlyLine: (remote, branch) =>
    `“${branch}” will be created again on “${remote}”. Its versions are already on the remote.`,
  publishRecreateConfirm: "Recreate and publish",
  publishCreateOnlyLine: (remote, branch) =>
    `“${branch}” will be created on “${remote}”. Its versions are already on the remote.`,
  publishBranchCreatedDescription: (branch, remote) => `“${branch}” is now on “${remote}”.`,
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
  publishDialogTitleFirst: "Publicar una línea nueva",
  publishDialogTitleAgain: "Volver a publicar la línea",
  publishNothingTitle: "Todo está publicado",
  publishBlockedTitle: "Aún no se puede publicar",
  publishSafeNote: "No se sobrescribe nada de lo que ya está en el remoto.",
  publishRecreateWarningTitle: (remote) => `Esta línea se borró en «${remote}».`,
  publishRecreateWarningBody:
    "Publicar la volverá a crear allí. Si su PR ya se fusionó, normalmente es mejor cambiar a la línea principal.",
  publishRecreateOnlyLine: (remote, branch) =>
    `«${branch}» se volverá a crear en «${remote}». Sus versiones ya están en el remoto.`,
  publishRecreateConfirm: "Volver a crear y publicar",
  publishCreateOnlyLine: (remote, branch) =>
    `«${branch}» se creará en «${remote}». Sus versiones ya están en el remoto.`,
  publishBranchCreatedDescription: (branch, remote) => `«${branch}» ya está en «${remote}».`,
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
