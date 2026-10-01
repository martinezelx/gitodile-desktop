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
  initializeExistingLabel: string;
  initializeExistingPlaceholder: string;
  initializeChooseExisting: string;
  initializeBranchLabel: string;
  initializeBranchHelp: string;
  initializeReadmeLabel: string;
  initializeReadmeHelp: string;
  initializeFirstVersionLabel: string;
  initializeFirstVersionTitleLabel: string;
  initializeFirstVersionTitlePlaceholder: string;
  initializeFirstVersionDescriptionLabel: string;
  initializeFirstVersionDescriptionPlaceholder: string;
  initializeRemoteLabel: string;
  initializeRemoteHelp: string;
  initializeRemoteNameLabel: string;
  initializeRemoteUrlLabel: string;
  initializeRemoteUrlPlaceholder: string;
  initializeReviewRemoteAction: string;
  initializeFirstVersionEffect: string;
  initializeRemoteLaterEffect: string;
  initializeSafetyBody: string;
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
  initializeSavingTitle: string;
  initializeCreatedDescription: string;
  initializeFirstSaveFailedTitle: string;
  initializeFirstSaveFailedDescription: string;
  initializeOpenFailedTitle: string;
  initializeOpenFailedDescription: string;
  initializeErrorTitle: string;
  initializeRetryAction: string;
  initializeTechnicalDetails: string;
  initializeFinishAction: string;
  initializeRemoteReviewDescription: string;
  initializeRemoteNamePreview: string;
  initializeRemoteFetchPreview: string;
  initializeRemotePushPreview: string;
  initializeRemoteLocalEffects: string;
  initializeRemoteFutureNetwork: string;
  initializeRemoteLocalOnly: string;
  initializeRemoteCredentials: (expectation: ConnectRemoteCredentialExpectation) => string;
  initializeRemoteSafety: string;
  initializeEditRemote: string;
  initializeConnectRemote: string;
  initializeConnectingRemote: string;
  initializeRemoteErrorTitle: string;
  initializeSkipRemote: string;
  initializeChooseParentDialogTitle: string;
  initializeAdvancedLabel: string;
  initializeNewFact: (path: string) => string;
  initializeExistingFact: string;
  initializeCreatingTitle: (name: string) => string;
  initializeStep: (step: "folder" | "project" | "opening") => string;
  initializeReadyTitle: (name: string) => string;
  initializeConnectRemoteAction: string;
  initializeRemoteDialogTitle: string;
  initializeRemoteAddressLabel: string;
  initializeRemoteConnectedToast: (name: string) => string;
  initializeIdentityMissingShort: string;
  initializeAddIdentity: string;
  initializeChooseExistingDialogTitle: string;
}

const en: InitializeProjectTranslations = {
  initializeDialogTitle: "Create a project",
  initializeDialogDescription: "Start in a new folder or use one you already have.",
  initializeNewMode: "Create a new project",
  initializeNewModeDescription: "In a new folder.",
  initializeExistingMode: "Use a folder I already have",
  initializeExistingModeDescription: "Your files stay as they are.",
  initializeParentLabel: "Location",
  initializeParentPlaceholder: "Choose where to create the project",
  initializeChooseParent: "Choose folder",
  initializeNameLabel: "Project name",
  initializeNamePlaceholder: "my-project",
  initializeExistingLabel: "Folder",
  initializeExistingPlaceholder: "Choose a folder that doesn't use Git yet",
  initializeChooseExisting: "Choose folder",
  initializeBranchLabel: "Main version line",
  initializeBranchHelp: "Git calls it the initial branch, and “main” is the usual choice.",
  initializeReadmeLabel: "Add a README.md",
  initializeReadmeHelp: "A small starter file that describes the project.",
  initializeFirstVersionLabel: "Save every file as the first version",
  initializeFirstVersionTitleLabel: "First version name",
  initializeFirstVersionTitlePlaceholder: "First version",
  initializeFirstVersionDescriptionLabel: "Description (optional)",
  initializeFirstVersionDescriptionPlaceholder: "Why this project is starting",
  initializeRemoteLabel: "Connect to a remote project",
  initializeRemoteHelp: "Paste the address of a project that already exists on GitHub or another server.",
  initializeRemoteNameLabel: "Remote name",
  initializeRemoteUrlLabel: "Remote address",
  initializeRemoteUrlPlaceholder: "https://host.example/team/project.git",
  initializeReviewRemoteAction: "Review remote connection",
  initializeFirstVersionEffect: "Then saves every file as the first version.",
  initializeRemoteLaterEffect: "Then you'll review the remote name and address before anything is configured.",
  initializeSafetyBody: "No existing file is deleted or replaced.",
  initializeConfirmAction: "Create project",
  initializeProgressTitle: "Creating the project",
  initializeProgressDescription: "Your files aren't moved or changed.",
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
  initializeFailureCleanupDescription: "Retry to remove the temporary files GitOdile created, and check anything else yourself.",
  initializeCleanupAction: "Retry cleanup",
  initializeCleaningUp: "Cleaning up…",
  initializeOpeningTitle: "Opening the project",
  initializeSavingTitle: "Saving the first version",
  initializeCreatedDescription: "It's open, and you can start working.",
  initializeFirstSaveFailedTitle: "The project is ready, but the first version wasn't saved",
  initializeFirstSaveFailedDescription: "Nothing was lost, and the project is open with its files shown as unsaved changes.",
  initializeOpenFailedTitle: "The project was created but couldn't be opened",
  initializeOpenFailedDescription: "The folder is ready on disk, so open it from GitOdile or retry.",
  initializeErrorTitle: "Couldn't create the project",
  initializeRetryAction: "Review again",
  initializeTechnicalDetails: "Technical details",
  initializeFinishAction: "Go to project",
  initializeRemoteReviewDescription: "This only saves the address in the project, and nothing is sent or downloaded now.",
  initializeRemoteNamePreview: "Remote name",
  initializeRemoteFetchPreview: "Get changes from",
  initializeRemotePushPreview: "Publish to",
  initializeRemoteLocalEffects: "Only the address is saved in the project.",
  initializeRemoteFutureNetwork: "It only connects when you get or publish changes.",
  initializeRemoteLocalOnly: "This address is a local path, so no network is used.",
  initializeRemoteCredentials: (expectation) => ({
    none: "No sign-in is expected for this address.",
    "git-credential-helper": "HTTPS sign-in uses your Git credential helper, and GitOdile doesn't store passwords.",
    "ssh-agent-or-key": "SSH uses your system's SSH keys and agent, and GitOdile doesn't store keys.",
  })[expectation],
  initializeRemoteSafety: "Passwords, tokens and extra parameters are stripped from the address and never saved or shown.",
  initializeEditRemote: "Edit remote",
  initializeConnectRemote: "Connect remote",
  initializeConnectingRemote: "Connecting…",
  initializeRemoteErrorTitle: "The remote wasn't connected",
  initializeSkipRemote: "Finish without a remote",
  initializeChooseParentDialogTitle: "Choose where to create the project",
  initializeAdvancedLabel: "More options",
  initializeNewFact: (path) => `Creates “${path}” and gets it ready to save versions.`,
  initializeExistingFact: "Gets the folder ready to save versions without touching your files.",
  initializeCreatingTitle: (name) => `Creating “${name}”…`,
  initializeStep: (step) => ({ folder: "Creating the folder", project: "Setting up the project", opening: "Opening it" })[step],
  initializeReadyTitle: (name) => `“${name}” is ready`,
  initializeConnectRemoteAction: "Connect a remote project",
  initializeRemoteDialogTitle: "Connect a remote project",
  initializeRemoteAddressLabel: "Address",
  initializeRemoteConnectedToast: (name) => `Project connected. You can now publish to “${name}”.`,
  initializeIdentityMissingShort: "Your name and email are needed to save the first version.",
  initializeAddIdentity: "Add in Settings",
  initializeChooseExistingDialogTitle: "Choose a folder",
};

const es: InitializeProjectTranslations = {
  initializeDialogTitle: "Crear un proyecto",
  initializeDialogDescription: "Empieza en una carpeta nueva o usa una que ya tengas.",
  initializeNewMode: "Crear proyecto nuevo",
  initializeNewModeDescription: "En una carpeta nueva.",
  initializeExistingMode: "Usar una carpeta que ya tengo",
  initializeExistingModeDescription: "Tus archivos se quedan como están.",
  initializeParentLabel: "Ubicación",
  initializeParentPlaceholder: "Elige dónde crear el proyecto",
  initializeChooseParent: "Elegir carpeta",
  initializeNameLabel: "Nombre del proyecto",
  initializeNamePlaceholder: "mi-proyecto",
  initializeExistingLabel: "Carpeta",
  initializeExistingPlaceholder: "Elige una carpeta que aún no use Git",
  initializeChooseExisting: "Elegir carpeta",
  initializeBranchLabel: "Línea de versión principal",
  initializeBranchHelp: "Git la llama rama inicial y «main» es lo habitual.",
  initializeReadmeLabel: "Añadir un README.md",
  initializeReadmeHelp: "Un pequeño archivo inicial que describe el proyecto.",
  initializeFirstVersionLabel: "Guardar todos los archivos como primera versión",
  initializeFirstVersionTitleLabel: "Nombre de la primera versión",
  initializeFirstVersionTitlePlaceholder: "Primera versión",
  initializeFirstVersionDescriptionLabel: "Descripción (opcional)",
  initializeFirstVersionDescriptionPlaceholder: "Por qué empieza este proyecto",
  initializeRemoteLabel: "Conectar con un proyecto remoto",
  initializeRemoteHelp: "Pega la dirección de un proyecto que ya existe en GitHub u otro servidor.",
  initializeRemoteNameLabel: "Nombre del remoto",
  initializeRemoteUrlLabel: "Dirección del remoto",
  initializeRemoteUrlPlaceholder: "https://host.example/equipo/proyecto.git",
  initializeReviewRemoteAction: "Revisar conexión remota",
  initializeFirstVersionEffect: "Después guarda todos los archivos como primera versión.",
  initializeRemoteLaterEffect: "Después revisarás el nombre y la dirección del remoto antes de configurar nada.",
  initializeSafetyBody: "No se borra ni se reemplaza ningún archivo que ya estuviera.",
  initializeConfirmAction: "Crear proyecto",
  initializeProgressTitle: "Creando el proyecto",
  initializeProgressDescription: "Tus archivos no se mueven ni se modifican.",
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
  initializeFailureCleanupDescription: "Reintenta para eliminar los archivos temporales que creó GitOdile y revisa tú lo demás.",
  initializeCleanupAction: "Reintentar limpieza",
  initializeCleaningUp: "Limpiando…",
  initializeOpeningTitle: "Abriendo el proyecto",
  initializeSavingTitle: "Guardando la primera versión",
  initializeCreatedDescription: "Ya está abierto y puedes empezar a trabajar.",
  initializeFirstSaveFailedTitle: "El proyecto está listo, pero no se guardó la primera versión",
  initializeFirstSaveFailedDescription: "No se ha perdido nada y el proyecto está abierto con sus archivos como cambios sin guardar.",
  initializeOpenFailedTitle: "El proyecto se creó, pero no se pudo abrir",
  initializeOpenFailedDescription: "La carpeta está lista en el disco, así que ábrela desde GitOdile o reintenta.",
  initializeErrorTitle: "No se pudo crear el proyecto",
  initializeRetryAction: "Revisar de nuevo",
  initializeTechnicalDetails: "Detalles técnicos",
  initializeFinishAction: "Ir al proyecto",
  initializeRemoteReviewDescription: "Solo se guarda la dirección en el proyecto y ahora no se envía ni se descarga nada.",
  initializeRemoteNamePreview: "Nombre del remoto",
  initializeRemoteFetchPreview: "Traer cambios de",
  initializeRemotePushPreview: "Publicar en",
  initializeRemoteLocalEffects: "Solo se guarda la dirección en el proyecto.",
  initializeRemoteFutureNetwork: "Solo se conecta cuando traes o publicas cambios.",
  initializeRemoteLocalOnly: "Esta dirección es una ruta local, así que no se usa la red.",
  initializeRemoteCredentials: (expectation) => ({
    none: "No se espera inicio de sesión para esta dirección.",
    "git-credential-helper": "El acceso HTTPS usa tu gestor de credenciales de Git y GitOdile no guarda contraseñas.",
    "ssh-agent-or-key": "SSH usa las claves y el agente SSH del sistema, y GitOdile no guarda claves.",
  })[expectation],
  initializeRemoteSafety: "Las contraseñas, tokens y parámetros extra se quitan de la dirección y nunca se guardan ni se muestran.",
  initializeEditRemote: "Editar remoto",
  initializeConnectRemote: "Conectar remoto",
  initializeConnectingRemote: "Conectando…",
  initializeRemoteErrorTitle: "No se conectó el remoto",
  initializeSkipRemote: "Terminar sin remoto",
  initializeChooseParentDialogTitle: "Elige dónde crear el proyecto",
  initializeAdvancedLabel: "Más opciones",
  initializeNewFact: (path) => `Crea «${path}» y la prepara para guardar versiones.`,
  initializeExistingFact: "Prepara la carpeta para guardar versiones sin tocar tus archivos.",
  initializeCreatingTitle: (name) => `Creando «${name}»…`,
  initializeStep: (step) => ({ folder: "Creando la carpeta", project: "Preparando el proyecto", opening: "Abriéndolo" })[step],
  initializeReadyTitle: (name) => `«${name}» está listo`,
  initializeConnectRemoteAction: "Conectar con un proyecto remoto",
  initializeRemoteDialogTitle: "Conectar con un proyecto remoto",
  initializeRemoteAddressLabel: "Dirección",
  initializeRemoteConnectedToast: (name) => `Proyecto conectado. Ya puedes publicar en «${name}».`,
  initializeIdentityMissingShort: "Para guardar la primera versión falta tu nombre y correo.",
  initializeAddIdentity: "Añadir en Ajustes",
  initializeChooseExistingDialogTitle: "Elige una carpeta",
};

export const initializeProjectTranslations = { en, es } as const;
