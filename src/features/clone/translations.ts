import type { CloneProgressPhase, DependencyDiscovery } from "./domain";

export interface CloneTranslations {
  cloneDialogTitle: string;
  cloneDialogDescription: string;
  cloneSourceLabel: string;
  cloneSourcePlaceholder: string;
  cloneSourceHelp: string;
  cloneParentLabel: string;
  cloneParentPlaceholder: string;
  cloneChooseParent: string;
  cloneNameLabel: string;
  cloneNamePlaceholder: string;
  cloneNameHelp: string;
  cloneReviewAction: string;
  cloneReviewTitle: string;
  cloneReviewDescription: string;
  cloneRemoteLabel: string;
  cloneDestinationLabel: string;
  cloneLocalEffectsTitle: string;
  cloneLocalEffects: string;
  cloneRemoteEffectsTitle: string;
  cloneRemoteEffectsNetwork: string;
  cloneRemoteEffectsLocal: string;
  cloneCredentialsTitle: string;
  cloneCredentialsNone: string;
  cloneCredentialsHelper: string;
  cloneCredentialsSsh: string;
  cloneSafetyTitle: string;
  cloneSafetyBody: string;
  cloneConfirmAction: string;
  cloneEditAction: string;
  cloneProgressTitle: string;
  cloneProgressDescription: string;
  cloneProgressPhase: (phase: CloneProgressPhase) => string;
  cloneCancelAction: string;
  cloneCancelling: string;
  cloneCancelled: string;
  cloneErrorTitle: string;
  cloneRetryAction: string;
  cloneTechnicalDetails: string;
  cloneCleanupTitle: string;
  cloneCleanupDescription: string;
  cloneCleanupAction: string;
  cloneCleaningUp: string;
  cloneOpeningTitle: string;
  cloneOpeningDescription: string;
  cloneOpenFailedTitle: string;
  cloneOpenFailedDescription: string;
  cloneRetryOpen: string;
  cloneDependencyNotice: (submodules: DependencyDiscovery, lfs: DependencyDiscovery) => string;
}

const dependency = (value: DependencyDiscovery): string =>
  value === "detected" ? "yes" : value === "unknown" ? "couldn't check" : "no";

const en: CloneTranslations = {
  cloneDialogTitle: "Clone a remote project",
  cloneDialogDescription: "Download a Git project into a new folder on this computer and open it.",
  cloneSourceLabel: "Remote address or Git path",
  cloneSourcePlaceholder: "https://example.com/team/project.git",
  cloneSourceHelp: "HTTPS, SSH, Git and file addresses, or a local Git path.",
  cloneParentLabel: "Save inside",
  cloneParentPlaceholder: "Choose a folder",
  cloneChooseParent: "Choose folder",
  cloneNameLabel: "Project folder name",
  cloneNamePlaceholder: "Same as the remote",
  cloneNameHelp: "The folder only appears once the download is checked.",
  cloneReviewAction: "Review",
  cloneReviewTitle: "Review before downloading",
  cloneReviewDescription: "Nothing has been downloaded yet.",
  cloneRemoteLabel: "Source",
  cloneDestinationLabel: "Destination",
  cloneLocalEffectsTitle: "On this computer",
  cloneLocalEffects: "Downloads to a temporary folder, checks it, then moves it into place if the destination is still free.",
  cloneRemoteEffectsTitle: "Remote project",
  cloneRemoteEffectsNetwork: "Only reads from the remote and changes nothing there.",
  cloneRemoteEffectsLocal: "The source is on this computer, so no network is used.",
  cloneCredentialsTitle: "Sign-in",
  cloneCredentialsNone: "No sign-in is expected for this source.",
  cloneCredentialsHelper: "Private HTTPS projects use your Git credential helper, and GitOdile doesn't store passwords.",
  cloneCredentialsSsh: "SSH uses your system's SSH keys and agent, and GitOdile never trusts an unknown server automatically.",
  cloneSafetyTitle: "If you cancel",
  cloneSafetyBody: "GitOdile stops the download and removes only its temporary folder, never an existing destination.",
  cloneConfirmAction: "Clone and open",
  cloneEditAction: "Edit details",
  cloneProgressTitle: "Cloning project",
  cloneProgressDescription: "Keep GitOdile open while the project downloads.",
  cloneProgressPhase: (phase) => ({
    preparing: "Preparing a temporary folder",
    cloning: "Downloading the project",
    sanitizingRemote: "Removing private details from the address",
    verifying: "Checking the download",
    publishing: "Moving it into place",
    finalizing: "Finishing up",
  })[phase],
  cloneCancelAction: "Cancel clone",
  cloneCancelling: "Cancelling…",
  cloneCancelled: "Clone cancelled before anything was added.",
  cloneErrorTitle: "Couldn't clone the project",
  cloneRetryAction: "Retry clone",
  cloneTechnicalDetails: "Technical details",
  cloneCleanupTitle: "A temporary folder needs cleaning up",
  cloneCleanupDescription: "The project is in place, but GitOdile couldn't remove its temporary folder. Retry the cleanup before opening.",
  cloneCleanupAction: "Retry cleanup",
  cloneCleaningUp: "Cleaning up…",
  cloneOpeningTitle: "Opening the project",
  cloneOpeningDescription: "The clone is complete, and the project is almost open.",
  cloneOpenFailedTitle: "The project was cloned but couldn't be opened",
  cloneOpenFailedDescription: "It's safe on disk, so retry opening it without cloning again.",
  cloneRetryOpen: "Retry opening",
  cloneDependencyNotice: (submodules, lfs) =>
    submodules === "not-detected" && lfs === "not-detected"
      ? "No submodules or Git LFS found."
      : `Submodules: ${dependency(submodules)}. Git LFS: ${dependency(lfs)}. These may need extra setup.`,
};

const dependencyEs = (value: DependencyDiscovery): string =>
  value === "detected" ? "sí" : value === "unknown" ? "sin comprobar" : "no";

const es: CloneTranslations = {
  cloneDialogTitle: "Clonar un proyecto remoto",
  cloneDialogDescription: "Descarga un proyecto de Git en una carpeta nueva de este ordenador y ábrelo.",
  cloneSourceLabel: "Dirección remota o ruta de Git",
  cloneSourcePlaceholder: "https://ejemplo.com/equipo/proyecto.git",
  cloneSourceHelp: "Direcciones HTTPS, SSH, Git y file, o una ruta de Git local.",
  cloneParentLabel: "Guardar dentro de",
  cloneParentPlaceholder: "Elige una carpeta",
  cloneChooseParent: "Elegir carpeta",
  cloneNameLabel: "Nombre de la carpeta del proyecto",
  cloneNamePlaceholder: "El mismo que el remoto",
  cloneNameHelp: "La carpeta solo aparece cuando se ha comprobado la descarga.",
  cloneReviewAction: "Revisar",
  cloneReviewTitle: "Revisa antes de descargar",
  cloneReviewDescription: "Aún no se ha descargado nada.",
  cloneRemoteLabel: "Origen",
  cloneDestinationLabel: "Destino",
  cloneLocalEffectsTitle: "En este ordenador",
  cloneLocalEffects: "Descarga en una carpeta temporal, la comprueba y la mueve a su sitio si el destino sigue libre.",
  cloneRemoteEffectsTitle: "Proyecto remoto",
  cloneRemoteEffectsNetwork: "Solo lee del remoto y no cambia nada allí.",
  cloneRemoteEffectsLocal: "El origen está en este ordenador, así que no se usa la red.",
  cloneCredentialsTitle: "Inicio de sesión",
  cloneCredentialsNone: "No se espera inicio de sesión para este origen.",
  cloneCredentialsHelper: "Los proyectos HTTPS privados usan tu gestor de credenciales de Git y GitOdile no guarda contraseñas.",
  cloneCredentialsSsh: "SSH usa las claves y el agente SSH del sistema, y GitOdile nunca confía automáticamente en un servidor desconocido.",
  cloneSafetyTitle: "Si cancelas",
  cloneSafetyBody: "GitOdile detiene la descarga y elimina solo su carpeta temporal, nunca un destino que ya exista.",
  cloneConfirmAction: "Clonar y abrir",
  cloneEditAction: "Editar datos",
  cloneProgressTitle: "Clonando el proyecto",
  cloneProgressDescription: "Mantén GitOdile abierto mientras se descarga el proyecto.",
  cloneProgressPhase: (phase) => ({
    preparing: "Preparando una carpeta temporal",
    cloning: "Descargando el proyecto",
    sanitizingRemote: "Quitando datos privados de la dirección",
    verifying: "Comprobando la descarga",
    publishing: "Moviéndolo a su sitio",
    finalizing: "Terminando",
  })[phase],
  cloneCancelAction: "Cancelar clonación",
  cloneCancelling: "Cancelando…",
  cloneCancelled: "Clonación cancelada antes de añadir nada.",
  cloneErrorTitle: "No se pudo clonar el proyecto",
  cloneRetryAction: "Reintentar clonación",
  cloneTechnicalDetails: "Detalles técnicos",
  cloneCleanupTitle: "Hay que limpiar una carpeta temporal",
  cloneCleanupDescription: "El proyecto ya está en su sitio, pero GitOdile no pudo eliminar su carpeta temporal. Reintenta la limpieza antes de abrir.",
  cloneCleanupAction: "Reintentar limpieza",
  cloneCleaningUp: "Limpiando…",
  cloneOpeningTitle: "Abriendo el proyecto",
  cloneOpeningDescription: "La clonación ha terminado y el proyecto está casi abierto.",
  cloneOpenFailedTitle: "El proyecto se clonó, pero no se pudo abrir",
  cloneOpenFailedDescription: "Está a salvo en el disco, así que reintenta abrirlo sin volver a clonar.",
  cloneRetryOpen: "Reintentar apertura",
  cloneDependencyNotice: (submodules, lfs) =>
    submodules === "not-detected" && lfs === "not-detected"
      ? "No se encontraron submódulos ni Git LFS."
      : `Submódulos: ${dependencyEs(submodules)}. Git LFS: ${dependencyEs(lfs)}. Pueden necesitar configuración adicional.`,
};

export const cloneTranslations = { en, es } as const;
