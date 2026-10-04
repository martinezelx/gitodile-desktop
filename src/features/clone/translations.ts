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
  cloneReviewAction: string;
  cloneReviewTitle: string;
  cloneReviewDescription: string;
  cloneRemoteLabel: string;
  cloneDestinationLabel: string;
  cloneLocalEffects: string;
  cloneRemoteEffectsNetwork: string;
  cloneRemoteEffectsLocal: string;
  cloneCredentialsNone: string;
  cloneCredentialsHelper: string;
  cloneCredentialsSsh: string;
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
  cloneAccountNotSavedTitle: string;
  cloneAccountNotSavedDescription: string;
  cloneProgressTitleNamed: (name: string) => string;
  cloneStep: (step: "downloading" | "checking" | "opening") => string;
  cloneCancelledDescription: string;
  cloneDependencyNotice: (submodules: DependencyDiscovery, lfs: DependencyDiscovery) => string;
}

const dependency = (value: DependencyDiscovery): string =>
  value === "detected" ? "yes" : value === "unknown" ? "couldn't check" : "no";

const en: CloneTranslations = {
  cloneDialogTitle: "Clone a project",
  cloneDialogDescription: "Download a copy to this computer and open it.",
  cloneSourceLabel: "Project address",
  cloneSourcePlaceholder: "https://example.com/team/project.git",
  cloneSourceHelp: "The one you copy from “Code” or “Clone” on GitHub, GitLab…",
  cloneParentLabel: "Save inside",
  cloneParentPlaceholder: "Choose a folder",
  cloneChooseParent: "Choose folder",
  cloneNameLabel: "Folder name",
  cloneNamePlaceholder: "Same as the project",
  cloneReviewAction: "Review",
  cloneReviewTitle: "Review before cloning",
  cloneReviewDescription: "Nothing has been downloaded yet.",
  cloneRemoteLabel: "Source",
  cloneDestinationLabel: "Destination",
  cloneLocalEffects: "Only the new folder is created, and nothing else is touched.",
  cloneRemoteEffectsNetwork: "The original project doesn't change.",
  cloneRemoteEffectsLocal: "The source is on this computer, so no network is used.",
  cloneCredentialsNone: "No sign-in is expected for this source.",
  cloneCredentialsHelper: "If it's private, your existing Git sign-in is used.",
  cloneCredentialsSsh: "SSH uses your system's SSH keys and agent, and GitOdile never trusts an unknown server automatically.",
  cloneSafetyBody: "If you cancel, nothing is left half-done.",
  cloneConfirmAction: "Clone and open",
  cloneEditAction: "Edit details",
  cloneProgressTitle: "Cloning project",
  cloneProgressDescription: "Keep the app open until it finishes.",
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
  cloneCancelled: "Clone cancelled",
  cloneCancelledDescription: "Nothing was added.",
  cloneProgressTitleNamed: (name) => `Cloning “${name}”…`,
  cloneStep: (step) => ({ downloading: "Downloading", checking: "Checking", opening: "Opening" })[step],
  cloneErrorTitle: "Couldn't clone the project",
  cloneRetryAction: "Retry",
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
  cloneAccountNotSavedTitle: "The project was cloned; its account needs setup",
  cloneAccountNotSavedDescription: "Your project is complete in the folder below, but its account selection could not be saved. Do not clone it again. Open this folder from Projects and select its account in project settings before getting or publishing changes.",
  cloneDependencyNotice: (submodules, lfs) =>
    submodules === "not-detected" && lfs === "not-detected"
      ? "No submodules or Git LFS found."
      : `Submodules: ${dependency(submodules)}. Git LFS: ${dependency(lfs)}. These may need extra setup.`,
};

const dependencyEs = (value: DependencyDiscovery): string =>
  value === "detected" ? "sí" : value === "unknown" ? "sin comprobar" : "no";

const es: CloneTranslations = {
  cloneDialogTitle: "Clonar un proyecto",
  cloneDialogDescription: "Descarga una copia en este ordenador y ábrela.",
  cloneSourceLabel: "Dirección del proyecto",
  cloneSourcePlaceholder: "https://ejemplo.com/equipo/proyecto.git",
  cloneSourceHelp: "La que copias del botón «Code» o «Clone» en GitHub, GitLab…",
  cloneParentLabel: "Guardar dentro de",
  cloneParentPlaceholder: "Elige una carpeta",
  cloneChooseParent: "Elegir carpeta",
  cloneNameLabel: "Nombre de la carpeta",
  cloneNamePlaceholder: "Igual que el proyecto",
  cloneReviewAction: "Revisar",
  cloneReviewTitle: "Revisa antes de clonar",
  cloneReviewDescription: "Aún no se ha descargado nada.",
  cloneRemoteLabel: "Origen",
  cloneDestinationLabel: "Destino",
  cloneLocalEffects: "Solo se crea la carpeta nueva y no se toca nada más.",
  cloneRemoteEffectsNetwork: "El proyecto original no cambia.",
  cloneRemoteEffectsLocal: "El origen está en este ordenador, así que no se usa la red.",
  cloneCredentialsNone: "No se espera inicio de sesión para este origen.",
  cloneCredentialsHelper: "Si es privado, se usa el inicio de sesión que ya tengas en Git.",
  cloneCredentialsSsh: "SSH usa las claves y el agente SSH del sistema, y GitOdile nunca confía automáticamente en un servidor desconocido.",
  cloneSafetyBody: "Si cancelas, no queda nada a medias.",
  cloneConfirmAction: "Clonar y abrir",
  cloneEditAction: "Editar datos",
  cloneProgressTitle: "Clonando el proyecto",
  cloneProgressDescription: "No cierres la aplicación hasta que termine.",
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
  cloneCancelled: "Clonación cancelada",
  cloneCancelledDescription: "No se ha añadido nada.",
  cloneProgressTitleNamed: (name) => `Clonando «${name}»…`,
  cloneStep: (step) => ({ downloading: "Descargando", checking: "Comprobando", opening: "Abriendo" })[step],
  cloneErrorTitle: "No se pudo clonar el proyecto",
  cloneRetryAction: "Reintentar",
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
  cloneAccountNotSavedTitle: "El proyecto se clonó; falta configurar su cuenta",
  cloneAccountNotSavedDescription: "Tu proyecto está completo en la carpeta indicada, pero no se pudo guardar la cuenta elegida. No vuelvas a clonarlo. Abre esta carpeta desde Proyectos y selecciona su cuenta en los ajustes del proyecto antes de obtener o publicar cambios.",
  cloneDependencyNotice: (submodules, lfs) =>
    submodules === "not-detected" && lfs === "not-detected"
      ? "No se encontraron submódulos ni Git LFS."
      : `Submódulos: ${dependencyEs(submodules)}. Git LFS: ${dependencyEs(lfs)}. Pueden necesitar configuración adicional.`,
};

export const cloneTranslations = { en, es } as const;
