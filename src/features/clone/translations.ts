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

const dependency = (value: DependencyDiscovery, noun: string): string =>
  value === "detected" ? `${noun} detected` : value === "unknown" ? `${noun} status unknown` : `no ${noun} detected`;

const en: CloneTranslations = {
  cloneDialogTitle: "Clone a remote project",
  cloneDialogDescription: "Download a Git project into a new local folder, verify it, and open it safely.",
  cloneSourceLabel: "Remote URL or Git path",
  cloneSourcePlaceholder: "https://example.com/team/project.git",
  cloneSourceHelp: "HTTPS, SSH, Git, file URLs, and local Git paths are supported.",
  cloneParentLabel: "Save inside",
  cloneParentPlaceholder: "Choose a parent folder",
  cloneChooseParent: "Choose folder",
  cloneNameLabel: "Project folder name",
  cloneNamePlaceholder: "Use the name from the remote",
  cloneNameHelp: "GitOdile creates this folder only after the clone has been verified.",
  cloneReviewAction: "Review clone",
  cloneReviewTitle: "Review where this project will go",
  cloneReviewDescription: "Nothing has been downloaded yet. Check the source, destination, and effects below.",
  cloneRemoteLabel: "Source",
  cloneDestinationLabel: "Destination",
  cloneLocalEffectsTitle: "On this computer",
  cloneLocalEffects: "GitOdile uses a private staging folder, verifies the checkout, then publishes it only if the destination is still unused.",
  cloneRemoteEffectsTitle: "Remote project",
  cloneRemoteEffectsNetwork: "Git reads and downloads from the remote. It does not publish, edit, or delete anything there.",
  cloneRemoteEffectsLocal: "The source is local, so this clone does not contact a network host.",
  cloneCredentialsTitle: "Credentials",
  cloneCredentialsNone: "No credentials are expected for this source.",
  cloneCredentialsHelper: "Private HTTPS projects use your configured Git credential helper. GitOdile does not store the credential.",
  cloneCredentialsSsh: "SSH uses your system host trust, agent, and keys. GitOdile will not accept a host key automatically.",
  cloneSafetyTitle: "If you cancel",
  cloneSafetyBody: "GitOdile stops Git and removes only the staging folder carrying this attempt's ownership marker. An existing destination is never removed.",
  cloneConfirmAction: "Clone and open project",
  cloneEditAction: "Edit details",
  cloneProgressTitle: "Cloning project",
  cloneProgressDescription: "Keep GitOdile open while the remote data is downloaded and checked.",
  cloneProgressPhase: (phase) => ({
    preparing: "Preparing a private staging folder",
    cloning: "Downloading project data",
    sanitizingRemote: "Removing private URL details",
    verifying: "Verifying the Git worktree",
    publishing: "Publishing to the chosen destination",
    finalizing: "Finishing safely",
  })[phase],
  cloneCancelAction: "Cancel clone",
  cloneCancelling: "Cancelling safely…",
  cloneCancelled: "The clone was cancelled and no destination was published.",
  cloneErrorTitle: "The project couldn't be cloned",
  cloneRetryAction: "Retry clone",
  cloneTechnicalDetails: "Technical details",
  cloneCleanupTitle: "Private staging cleanup is needed",
  cloneCleanupDescription: "The verified project is in place, but GitOdile could not remove its empty staging container. Clean that marked path before opening.",
  cloneCleanupAction: "Retry safe cleanup",
  cloneCleaningUp: "Cleaning up…",
  cloneOpeningTitle: "Opening the verified project",
  cloneOpeningDescription: "The clone is complete. GitOdile is creating its normal project session now.",
  cloneOpenFailedTitle: "The project was cloned but could not be opened",
  cloneOpenFailedDescription: "The destination is verified and stays on disk. Retry opening it without cloning again.",
  cloneRetryOpen: "Retry opening project",
  cloneDependencyNotice: (submodules, lfs) => `${dependency(submodules, "submodules")}; ${dependency(lfs, "Git LFS usage")}. Specialized setup is not automatic.`,
};

const dependencyEs = (value: DependencyDiscovery, noun: string): string =>
  value === "detected" ? `se detectó ${noun}` : value === "unknown" ? `no se pudo determinar ${noun}` : `no se detectó ${noun}`;

const es: CloneTranslations = {
  cloneDialogTitle: "Clonar un proyecto remoto",
  cloneDialogDescription: "Descarga un proyecto Git en una carpeta local nueva, lo verifica y lo abre de forma segura.",
  cloneSourceLabel: "URL remota o ruta Git",
  cloneSourcePlaceholder: "https://ejemplo.com/equipo/proyecto.git",
  cloneSourceHelp: "Se admiten HTTPS, SSH, Git, URL file y rutas Git locales.",
  cloneParentLabel: "Guardar dentro de",
  cloneParentPlaceholder: "Elige una carpeta contenedora",
  cloneChooseParent: "Elegir carpeta",
  cloneNameLabel: "Nombre de la carpeta del proyecto",
  cloneNamePlaceholder: "Usar el nombre del remoto",
  cloneNameHelp: "GitOdile solo crea esta carpeta después de verificar el clon.",
  cloneReviewAction: "Revisar clonación",
  cloneReviewTitle: "Revisa dónde se guardará el proyecto",
  cloneReviewDescription: "Todavía no se ha descargado nada. Comprueba el origen, el destino y los efectos.",
  cloneRemoteLabel: "Origen",
  cloneDestinationLabel: "Destino",
  cloneLocalEffectsTitle: "En este ordenador",
  cloneLocalEffects: "GitOdile usa una carpeta privada temporal, verifica la copia y solo la publica si el destino sigue libre.",
  cloneRemoteEffectsTitle: "Proyecto remoto",
  cloneRemoteEffectsNetwork: "Git lee y descarga del remoto. No publica, edita ni elimina nada allí.",
  cloneRemoteEffectsLocal: "El origen es local, así que esta clonación no contacta con ningún host de red.",
  cloneCredentialsTitle: "Credenciales",
  cloneCredentialsNone: "No se esperan credenciales para este origen.",
  cloneCredentialsHelper: "Los proyectos HTTPS privados usan tu gestor de credenciales de Git. GitOdile no guarda la credencial.",
  cloneCredentialsSsh: "SSH usa la confianza de hosts, el agente y las claves del sistema. GitOdile no aceptará una clave de host automáticamente.",
  cloneSafetyTitle: "Si cancelas",
  cloneSafetyBody: "GitOdile detiene Git y elimina únicamente la carpeta temporal marcada como propiedad de este intento. Nunca elimina un destino existente.",
  cloneConfirmAction: "Clonar y abrir proyecto",
  cloneEditAction: "Editar datos",
  cloneProgressTitle: "Clonando proyecto",
  cloneProgressDescription: "Mantén GitOdile abierto mientras se descargan y verifican los datos remotos.",
  cloneProgressPhase: (phase) => ({
    preparing: "Preparando una carpeta temporal privada",
    cloning: "Descargando los datos del proyecto",
    sanitizingRemote: "Eliminando detalles privados de la URL",
    verifying: "Verificando el proyecto Git",
    publishing: "Publicando en el destino elegido",
    finalizing: "Finalizando de forma segura",
  })[phase],
  cloneCancelAction: "Cancelar clonación",
  cloneCancelling: "Cancelando de forma segura…",
  cloneCancelled: "La clonación se canceló y no se publicó ningún destino.",
  cloneErrorTitle: "No se pudo clonar el proyecto",
  cloneRetryAction: "Reintentar clonación",
  cloneTechnicalDetails: "Detalles técnicos",
  cloneCleanupTitle: "Hay que limpiar la carpeta temporal privada",
  cloneCleanupDescription: "El proyecto verificado ya está en su destino, pero GitOdile no pudo eliminar su contenedor temporal vacío. Limpia esa ruta marcada antes de abrir.",
  cloneCleanupAction: "Reintentar limpieza segura",
  cloneCleaningUp: "Limpiando…",
  cloneOpeningTitle: "Abriendo el proyecto verificado",
  cloneOpeningDescription: "La clonación ha terminado. GitOdile está creando ahora su sesión normal de proyecto.",
  cloneOpenFailedTitle: "El proyecto se clonó, pero no se pudo abrir",
  cloneOpenFailedDescription: "El destino está verificado y permanece en el disco. Reintenta abrirlo sin volver a clonar.",
  cloneRetryOpen: "Reintentar apertura",
  cloneDependencyNotice: (submodules, lfs) => `${dependencyEs(submodules, "submódulos")}; ${dependencyEs(lfs, "el uso de Git LFS")}. La configuración especializada no es automática.`,
};

export const cloneTranslations = { en, es } as const;
