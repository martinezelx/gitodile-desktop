import type { ConnectRemoteCredentialExpectation, InitializeProgressPhase } from "./domain";

export interface InitializeProjectTranslations {
  initializeDialogTitle: string;
  initializeDialogDescription: string;
  initializeNewMode: string;
  initializeNewModeDescription: string;
  initializeExistingMode: string;
  initializeExistingModeDescription: string;
  initializeParentLabel: string;
  initializeParentPlaceholder: string;
  initializeChooseParent: string;
  initializeNameLabel: string;
  initializeNamePlaceholder: string;
  initializeNameHelp: string;
  initializeExistingLabel: string;
  initializeExistingPlaceholder: string;
  initializeChooseExisting: string;
  initializeBranchLabel: string;
  initializeBranchHelp: string;
  initializeReadmeLabel: string;
  initializeReadmeHelp: string;
  initializeFirstVersionLabel: string;
  initializeFirstVersionHelp: string;
  initializeFirstVersionTitleLabel: string;
  initializeFirstVersionTitlePlaceholder: string;
  initializeFirstVersionDescriptionLabel: string;
  initializeFirstVersionDescriptionPlaceholder: string;
  initializeRemoteLabel: string;
  initializeRemoteHelp: string;
  initializeRemoteNameLabel: string;
  initializeRemoteUrlLabel: string;
  initializeRemoteUrlPlaceholder: string;
  initializeReviewAction: string;
  initializeReviewRemoteAction: string;
  initializePlanning: string;
  initializeReviewTitle: string;
  initializeReviewDescription: string;
  initializeDestinationLabel: string;
  initializeBranchPreviewLabel: string;
  initializeLocalEffectsTitle: string;
  initializeNewLocalEffects: string;
  initializeExistingLocalEffects: (count: number, truncated: boolean) => string;
  initializeReadmeEffect: string;
  initializeNoReadmeEffect: string;
  initializeFirstVersionEffect: string;
  initializeNoFirstVersionEffect: string;
  initializeRemoteLaterEffect: string;
  initializeSafetyTitle: string;
  initializeSafetyBody: string;
  initializeIdentityTitle: string;
  initializeIdentityReady: string;
  initializeIdentityMissing: string;
  initializeOpenIdentitySettings: string;
  initializeEditAction: string;
  initializeConfirmAction: string;
  initializeProgressTitle: string;
  initializeProgressDescription: string;
  initializeProgressPhase: (phase: InitializeProgressPhase) => string;
  initializeCleanupTitle: string;
  initializeCleanupDescription: string;
  initializeFailureCleanupTitle: string;
  initializeFailureCleanupDescription: string;
  initializeCleanupAction: string;
  initializeCleaningUp: string;
  initializeOpeningTitle: string;
  initializeOpeningDescription: string;
  initializeSavingTitle: string;
  initializeSavingDescription: string;
  initializeCreatedTitle: string;
  initializeCreatedDescription: string;
  initializeFirstSaveFailedTitle: string;
  initializeFirstSaveFailedDescription: string;
  initializeOpenFailedTitle: string;
  initializeOpenFailedDescription: string;
  initializeErrorTitle: string;
  initializeRetryAction: string;
  initializeTechnicalDetails: string;
  initializeFinishAction: string;
  initializeRemotePlanning: string;
  initializeRemoteReviewTitle: string;
  initializeRemoteReviewDescription: string;
  initializeRemoteNamePreview: string;
  initializeRemoteFetchPreview: string;
  initializeRemotePushPreview: string;
  initializeRemoteLocalEffectsTitle: string;
  initializeRemoteLocalEffects: string;
  initializeRemoteNetworkEffectsTitle: string;
  initializeRemoteNoNetworkNow: string;
  initializeRemoteFutureNetwork: string;
  initializeRemoteLocalOnly: string;
  initializeRemoteCredentialsTitle: string;
  initializeRemoteCredentials: (expectation: ConnectRemoteCredentialExpectation) => string;
  initializeRemoteSafetyTitle: string;
  initializeRemoteSafety: string;
  initializeEditRemote: string;
  initializeConnectRemote: string;
  initializeConnectingRemote: string;
  initializeRemoteErrorTitle: string;
  initializeSkipRemote: string;
  initializeRemoteConnectedTitle: string;
  initializeRemoteConnectedDescription: (name: string) => string;
  initializeChooseParentDialogTitle: string;
  initializeChooseExistingDialogTitle: string;
}

const en: InitializeProjectTranslations = {
  initializeDialogTitle: "Create a local project",
  initializeDialogDescription: "Start in a new folder, or add Git to a folder you already have.",
  initializeNewMode: "Create new project",
  initializeNewModeDescription: "Creates a new folder for the project.",
  initializeExistingMode: "Turn this folder into a project",
  initializeExistingModeDescription: "Keeps all your files and adds Git to the folder.",
  initializeParentLabel: "Location",
  initializeParentPlaceholder: "Choose where to create the project folder",
  initializeChooseParent: "Choose folder",
  initializeNameLabel: "Project folder name",
  initializeNamePlaceholder: "my-project",
  initializeNameHelp: "GitOdile creates this new folder. It never replaces an existing one.",
  initializeExistingLabel: "Folder",
  initializeExistingPlaceholder: "Choose a folder that doesn't use Git yet",
  initializeChooseExisting: "Choose folder",
  initializeBranchLabel: "First version line name",
  initializeBranchHelp: "main is a common choice. Git calls this the initial branch.",
  initializeReadmeLabel: "Add a README.md",
  initializeReadmeHelp: "A small starter file that describes the project.",
  initializeFirstVersionLabel: "Save the first version",
  initializeFirstVersionHelp: "Saves every file in the project once it opens, using your Git identity.",
  initializeFirstVersionTitleLabel: "First version name",
  initializeFirstVersionTitlePlaceholder: "First version",
  initializeFirstVersionDescriptionLabel: "Description (optional)",
  initializeFirstVersionDescriptionPlaceholder: "Why this project is starting",
  initializeRemoteLabel: "Connect a remote afterwards",
  initializeRemoteHelp: "Adds the address of an existing remote repository. It doesn't create one for you.",
  initializeRemoteNameLabel: "Remote name",
  initializeRemoteUrlLabel: "Remote address",
  initializeRemoteUrlPlaceholder: "https://host.example/team/project.git",
  initializeReviewAction: "Review setup",
  initializeReviewRemoteAction: "Review remote connection",
  initializePlanning: "Checking the folder…",
  initializeReviewTitle: "Review the setup",
  initializeReviewDescription: "Nothing is created until you confirm. The remote is reviewed separately afterwards.",
  initializeDestinationLabel: "Project folder",
  initializeBranchPreviewLabel: "First version line",
  initializeLocalEffectsTitle: "Folder",
  initializeNewLocalEffects: "Creates the folder shown above and adds Git to it. If something already exists there, nothing is created.",
  initializeExistingLocalEffects: (count, truncated) =>
    count === 1 && !truncated
      ? "Adds Git to this folder. Its one existing item stays untouched."
      : `Adds Git to this folder. Its ${truncated ? "999+" : count} existing items stay untouched.`,
  initializeReadmeEffect: "Adds README.md, unless the folder already has one.",
  initializeNoReadmeEffect: "Adds no files of its own, only Git.",
  initializeFirstVersionEffect: "Then saves every file as the first version, running your hooks and signing as usual.",
  initializeNoFirstVersionEffect: "No version is saved yet. You can save the first one whenever you're ready.",
  initializeRemoteLaterEffect: "Then you'll review the remote name and address before anything is configured.",
  initializeSafetyTitle: "What stays safe",
  initializeSafetyBody: "GitOdile checks the folder again right before writing. It never deletes or replaces files that were already there.",
  initializeIdentityTitle: "Identity for the first version",
  initializeIdentityReady: "Your Git identity is set. Hooks and signing stay on.",
  initializeIdentityMissing: "The first version needs your name and email. Add them in Settings, or skip the first version for now.",
  initializeOpenIdentitySettings: "Open identity settings",
  initializeEditAction: "Edit setup",
  initializeConfirmAction: "Create and open project",
  initializeProgressTitle: "Creating the project",
  initializeProgressDescription: "Your existing files aren't being moved or changed.",
  initializeProgressPhase: (phase) => ({
    revalidating: "Checking the folder again",
    preparingFolder: "Preparing the folder",
    initializingGit: "Adding Git",
    creatingReadme: "Creating README.md",
    verifying: "Checking the new project",
    finalizing: "Finishing up",
  })[phase],
  initializeCleanupTitle: "The project is ready, but needs a quick cleanup",
  initializeCleanupDescription: "GitOdile couldn't remove a temporary file it created. Retry the cleanup before opening.",
  initializeFailureCleanupTitle: "Setup stopped and needs a cleanup",
  initializeFailureCleanupDescription: "Retry to remove the temporary files GitOdile created. Anything else is left for you to check.",
  initializeCleanupAction: "Retry cleanup",
  initializeCleaningUp: "Cleaning up…",
  initializeOpeningTitle: "Opening the project",
  initializeOpeningDescription: "Almost there.",
  initializeSavingTitle: "Saving the first version",
  initializeSavingDescription: "Hooks and signing run as usual. If saving fails, the project stays open with its files unsaved.",
  initializeCreatedTitle: "Your project is ready",
  initializeCreatedDescription: "It's open. Add files or save the first version whenever you like.",
  initializeFirstSaveFailedTitle: "The project is ready, but the first version wasn't saved",
  initializeFirstSaveFailedDescription: "Nothing was lost. The project is open and its files show as unsaved changes.",
  initializeOpenFailedTitle: "The project was created but couldn't be opened",
  initializeOpenFailedDescription: "The folder is ready on disk. Open it from GitOdile or retry.",
  initializeErrorTitle: "Couldn't create the project",
  initializeRetryAction: "Review again",
  initializeTechnicalDetails: "Technical details",
  initializeFinishAction: "View project",
  initializeRemotePlanning: "Checking the remote…",
  initializeRemoteReviewTitle: "Review the remote connection",
  initializeRemoteReviewDescription: "This only saves the address in the project. Nothing is sent or downloaded now.",
  initializeRemoteNamePreview: "Remote name",
  initializeRemoteFetchPreview: "Get changes from",
  initializeRemotePushPreview: "Publish to",
  initializeRemoteLocalEffectsTitle: "In the project",
  initializeRemoteLocalEffects: "Adds this remote to the project's settings (.git/config). Everything else stays as it is.",
  initializeRemoteNetworkEffectsTitle: "Network",
  initializeRemoteNoNetworkNow: "Nothing is sent over the network now.",
  initializeRemoteFutureNetwork: "GitOdile only contacts this address when you check, get or publish changes.",
  initializeRemoteLocalOnly: "This address is a local path, so no network is used.",
  initializeRemoteCredentialsTitle: "Sign-in",
  initializeRemoteCredentials: (expectation) => ({
    none: "No sign-in is expected for this address.",
    "git-credential-helper": "HTTPS sign-in uses your Git credential helper. GitOdile doesn't store passwords.",
    "ssh-agent-or-key": "SSH uses your system's SSH keys and agent. GitOdile doesn't store keys.",
  })[expectation],
  initializeRemoteSafetyTitle: "Address privacy",
  initializeRemoteSafety: "Passwords, tokens and extra parameters are stripped from the address and never saved or shown.",
  initializeEditRemote: "Edit remote",
  initializeConnectRemote: "Connect remote",
  initializeConnectingRemote: "Connecting…",
  initializeRemoteErrorTitle: "The remote wasn't connected",
  initializeSkipRemote: "Finish without a remote",
  initializeRemoteConnectedTitle: "Project and remote are ready",
  initializeRemoteConnectedDescription: (name) => `The remote “${name}” is set up. Nothing was sent over the network.`,
  initializeChooseParentDialogTitle: "Choose where to create the project",
  initializeChooseExistingDialogTitle: "Choose a folder",
};

const es: InitializeProjectTranslations = {
  initializeDialogTitle: "Crear un proyecto local",
  initializeDialogDescription: "Empieza en una carpeta nueva o añade Git a una carpeta que ya tienes.",
  initializeNewMode: "Crear proyecto nuevo",
  initializeNewModeDescription: "Crea una carpeta nueva para el proyecto.",
  initializeExistingMode: "Convertir esta carpeta en proyecto",
  initializeExistingModeDescription: "Conserva todos tus archivos y añade Git a la carpeta.",
  initializeParentLabel: "Ubicación",
  initializeParentPlaceholder: "Elige dónde crear la carpeta del proyecto",
  initializeChooseParent: "Elegir carpeta",
  initializeNameLabel: "Nombre de la carpeta del proyecto",
  initializeNamePlaceholder: "mi-proyecto",
  initializeNameHelp: "GitOdile crea esta carpeta nueva. Nunca reemplaza una que ya exista.",
  initializeExistingLabel: "Carpeta",
  initializeExistingPlaceholder: "Elige una carpeta que aún no use Git",
  initializeChooseExisting: "Elegir carpeta",
  initializeBranchLabel: "Nombre de la primera línea de versión",
  initializeBranchHelp: "main es una opción habitual. Git lo llama rama inicial.",
  initializeReadmeLabel: "Añadir un README.md",
  initializeReadmeHelp: "Un pequeño archivo inicial que describe el proyecto.",
  initializeFirstVersionLabel: "Guardar la primera versión",
  initializeFirstVersionHelp: "Guarda todos los archivos del proyecto al abrirlo, con tu identidad de Git.",
  initializeFirstVersionTitleLabel: "Nombre de la primera versión",
  initializeFirstVersionTitlePlaceholder: "Primera versión",
  initializeFirstVersionDescriptionLabel: "Descripción (opcional)",
  initializeFirstVersionDescriptionPlaceholder: "Por qué empieza este proyecto",
  initializeRemoteLabel: "Conectar un remoto después",
  initializeRemoteHelp: "Añade la dirección de un repositorio remoto que ya existe. No lo crea por ti.",
  initializeRemoteNameLabel: "Nombre del remoto",
  initializeRemoteUrlLabel: "Dirección del remoto",
  initializeRemoteUrlPlaceholder: "https://host.example/equipo/proyecto.git",
  initializeReviewAction: "Revisar configuración",
  initializeReviewRemoteAction: "Revisar conexión remota",
  initializePlanning: "Comprobando la carpeta…",
  initializeReviewTitle: "Revisa la configuración",
  initializeReviewDescription: "No se crea nada hasta que confirmes. El remoto se revisa aparte después.",
  initializeDestinationLabel: "Carpeta del proyecto",
  initializeBranchPreviewLabel: "Primera línea de versión",
  initializeLocalEffectsTitle: "Carpeta",
  initializeNewLocalEffects: "Crea la carpeta indicada arriba y le añade Git. Si ya existe algo ahí, no se crea nada.",
  initializeExistingLocalEffects: (count, truncated) =>
    count === 1 && !truncated
      ? "Añade Git a esta carpeta. Su único elemento no se toca."
      : `Añade Git a esta carpeta. Sus ${truncated ? "999+" : count} elementos no se tocan.`,
  initializeReadmeEffect: "Añade README.md, salvo que la carpeta ya tenga uno.",
  initializeNoReadmeEffect: "No añade archivos propios, solo Git.",
  initializeFirstVersionEffect: "Después guarda todos los archivos como primera versión, con tus hooks y firma de siempre.",
  initializeNoFirstVersionEffect: "Aún no se guarda ninguna versión. Podrás guardar la primera cuando quieras.",
  initializeRemoteLaterEffect: "Después revisarás el nombre y la dirección del remoto antes de configurar nada.",
  initializeSafetyTitle: "Qué queda a salvo",
  initializeSafetyBody: "GitOdile vuelve a comprobar la carpeta justo antes de escribir. Nunca borra ni reemplaza archivos que ya estaban.",
  initializeIdentityTitle: "Identidad para la primera versión",
  initializeIdentityReady: "Tu identidad de Git está configurada. Los hooks y la firma siguen activos.",
  initializeIdentityMissing: "La primera versión necesita tu nombre y correo. Añádelos en Ajustes o sáltate por ahora la primera versión.",
  initializeOpenIdentitySettings: "Abrir ajustes de identidad",
  initializeEditAction: "Editar configuración",
  initializeConfirmAction: "Crear y abrir proyecto",
  initializeProgressTitle: "Creando el proyecto",
  initializeProgressDescription: "Tus archivos existentes no se mueven ni se modifican.",
  initializeProgressPhase: (phase) => ({
    revalidating: "Volviendo a comprobar la carpeta",
    preparingFolder: "Preparando la carpeta",
    initializingGit: "Añadiendo Git",
    creatingReadme: "Creando README.md",
    verifying: "Comprobando el proyecto nuevo",
    finalizing: "Terminando",
  })[phase],
  initializeCleanupTitle: "El proyecto está listo, pero falta una limpieza rápida",
  initializeCleanupDescription: "GitOdile no pudo eliminar un archivo temporal que creó. Reintenta la limpieza antes de abrir.",
  initializeFailureCleanupTitle: "La configuración se detuvo y falta limpiar",
  initializeFailureCleanupDescription: "Reintenta para eliminar los archivos temporales que creó GitOdile. Lo demás queda para que lo revises tú.",
  initializeCleanupAction: "Reintentar limpieza",
  initializeCleaningUp: "Limpiando…",
  initializeOpeningTitle: "Abriendo el proyecto",
  initializeOpeningDescription: "Ya casi está.",
  initializeSavingTitle: "Guardando la primera versión",
  initializeSavingDescription: "Los hooks y la firma se ejecutan como siempre. Si falla, el proyecto queda abierto con sus archivos sin guardar.",
  initializeCreatedTitle: "Tu proyecto está listo",
  initializeCreatedDescription: "Ya está abierto. Añade archivos o guarda la primera versión cuando quieras.",
  initializeFirstSaveFailedTitle: "El proyecto está listo, pero no se guardó la primera versión",
  initializeFirstSaveFailedDescription: "No se ha perdido nada. El proyecto está abierto y sus archivos aparecen como cambios sin guardar.",
  initializeOpenFailedTitle: "El proyecto se creó, pero no se pudo abrir",
  initializeOpenFailedDescription: "La carpeta está lista en el disco. Ábrela desde GitOdile o reintenta.",
  initializeErrorTitle: "No se pudo crear el proyecto",
  initializeRetryAction: "Revisar de nuevo",
  initializeTechnicalDetails: "Detalles técnicos",
  initializeFinishAction: "Ver proyecto",
  initializeRemotePlanning: "Comprobando el remoto…",
  initializeRemoteReviewTitle: "Revisa la conexión remota",
  initializeRemoteReviewDescription: "Solo se guarda la dirección en el proyecto. Ahora no se envía ni se descarga nada.",
  initializeRemoteNamePreview: "Nombre del remoto",
  initializeRemoteFetchPreview: "Traer cambios de",
  initializeRemotePushPreview: "Publicar en",
  initializeRemoteLocalEffectsTitle: "En el proyecto",
  initializeRemoteLocalEffects: "Añade este remoto a la configuración del proyecto (.git/config). Todo lo demás se queda igual.",
  initializeRemoteNetworkEffectsTitle: "Red",
  initializeRemoteNoNetworkNow: "Ahora no se envía nada por la red.",
  initializeRemoteFutureNetwork: "GitOdile solo contacta con esta dirección cuando compruebas, traes o publicas cambios.",
  initializeRemoteLocalOnly: "Esta dirección es una ruta local, así que no se usa la red.",
  initializeRemoteCredentialsTitle: "Inicio de sesión",
  initializeRemoteCredentials: (expectation) => ({
    none: "No se espera inicio de sesión para esta dirección.",
    "git-credential-helper": "El acceso HTTPS usa tu gestor de credenciales de Git. GitOdile no guarda contraseñas.",
    "ssh-agent-or-key": "SSH usa las claves y el agente SSH del sistema. GitOdile no guarda claves.",
  })[expectation],
  initializeRemoteSafetyTitle: "Privacidad de la dirección",
  initializeRemoteSafety: "Las contraseñas, tokens y parámetros extra se quitan de la dirección y nunca se guardan ni se muestran.",
  initializeEditRemote: "Editar remoto",
  initializeConnectRemote: "Conectar remoto",
  initializeConnectingRemote: "Conectando…",
  initializeRemoteErrorTitle: "No se conectó el remoto",
  initializeSkipRemote: "Terminar sin remoto",
  initializeRemoteConnectedTitle: "El proyecto y el remoto están listos",
  initializeRemoteConnectedDescription: (name) => `El remoto «${name}» está configurado. No se envió nada por la red.`,
  initializeChooseParentDialogTitle: "Elige dónde crear el proyecto",
  initializeChooseExistingDialogTitle: "Elige una carpeta",
};

export const initializeProjectTranslations = { en, es } as const;
