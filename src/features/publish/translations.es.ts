import type { PublishTranslations } from "./translations";

export const es: PublishTranslations = {
  publishDialogTitle: "Publicar cambios",
  publishDialogTitleFirst: "Publicar una rama nueva",
  publishDialogTitleAgain: "Volver a publicar la rama",
  publishNothingTitle: "Todo está publicado",
  publishBlockedTitle: "Aún no se puede publicar",
  publishSafeNote: "No se sobrescribe nada de lo que ya está en el remoto.",
  publishRecreateWarningTitle: (remote) => `Esta rama se borró en «${remote}».`,
  publishRecreateWarningBody:
    "Publicar la volverá a crear allí. Si su PR ya se fusionó, normalmente es mejor cambiar a la rama principal.",
  publishRecreateOnlyBranch: (remote, branch) =>
    `«${branch}» se volverá a crear en «${remote}». Sus versiones ya están en el remoto.`,
  publishRecreateConfirm: "Volver a crear y publicar",
  publishCreateOnlyBranch: (remote, branch) =>
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

