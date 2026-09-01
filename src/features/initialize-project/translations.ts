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
  initializeDialogDescription: "Start a new folder or safely add Git to an ordinary folder you already have.",
  initializeNewMode: "Create new project",
  initializeNewModeDescription: "Create one new named folder inside a parent folder.",
  initializeExistingMode: "Turn this folder into a project",
  initializeExistingModeDescription: "Keep every current file and add new Git metadata beside it.",
  initializeParentLabel: "Parent folder",
  initializeParentPlaceholder: "Choose where the project folder will live",
  initializeChooseParent: "Choose parent",
  initializeNameLabel: "Project folder name",
  initializeNamePlaceholder: "my-project",
  initializeNameHelp: "GitOdile creates exactly this new folder and never replaces an existing path.",
  initializeExistingLabel: "Existing ordinary folder",
  initializeExistingPlaceholder: "Choose a folder that is not already a Git project",
  initializeChooseExisting: "Choose folder",
  initializeBranchLabel: "Initial version-line name",
  initializeBranchHelp: "main is a common choice. Git calls this the initial branch.",
  initializeReadmeLabel: "Add a README.md",
  initializeReadmeHelp: "Creates one small starter file only with your explicit consent.",
  initializeFirstVersionLabel: "Save the first version",
  initializeFirstVersionHelp: "Saves all files currently in the project after it opens, using your Git identity, hooks, and signing settings.",
  initializeFirstVersionTitleLabel: "First version name",
  initializeFirstVersionTitlePlaceholder: "First version",
  initializeFirstVersionDescriptionLabel: "Description (optional)",
  initializeFirstVersionDescriptionPlaceholder: "Why this project is starting",
  initializeRemoteLabel: "Connect a remote after local setup",
  initializeRemoteHelp: "Adds a provider-neutral Git URL in a separate review. It does not create a hosted repository.",
  initializeRemoteNameLabel: "Remote name",
  initializeRemoteUrlLabel: "Remote Git URL",
  initializeRemoteUrlPlaceholder: "https://host.example/team/project.git",
  initializeReviewAction: "Review local setup",
  initializeReviewRemoteAction: "Review remote connection",
  initializePlanning: "Checking the folder…",
  initializeReviewTitle: "Review the local setup",
  initializeReviewDescription: "This preview covers local files and Git metadata only. Remote setup has its own review later.",
  initializeDestinationLabel: "Project folder",
  initializeBranchPreviewLabel: "Initial version line",
  initializeLocalEffectsTitle: "Local folder",
  initializeNewLocalEffects: "Creates the exact new folder shown above, then adds new .git metadata. An existing destination always blocks the operation.",
  initializeExistingLocalEffects: (count, truncated) =>
    `Adds new .git metadata to this ordinary folder. Its ${truncated ? "999+" : count} existing top-level item${count === 1 ? "" : "s"} stay byte-for-byte untouched.`,
  initializeReadmeEffect: "Creates README.md only if no casing-equivalent file exists when execution begins.",
  initializeNoReadmeEffect: "Creates no working file. Only the new Git metadata is added.",
  initializeFirstVersionEffect: "After opening, saves all current files as the first version through the normal hook- and signing-aware flow.",
  initializeNoFirstVersionEffect: "Leaves the version line unborn until you explicitly save a version later.",
  initializeRemoteLaterEffect: "After local setup, the remote name and URL are reviewed separately before any configuration changes.",
  initializeSafetyTitle: "What stays safe",
  initializeSafetyBody: "GitOdile rechecks the path immediately before writing, never cleans or repopulates an existing folder, and removes only exact empty artifacts marked as owned by this attempt.",
  initializeIdentityTitle: "Identity for the first version",
  initializeIdentityReady: "Your current Git identity is available. Hooks and signing settings will remain active.",
  initializeIdentityMissing: "A first version needs a Git name and email. Add them in Settings, or turn off the first version for now.",
  initializeOpenIdentitySettings: "Open identity settings",
  initializeEditAction: "Edit setup",
  initializeConfirmAction: "Create and open project",
  initializeProgressTitle: "Creating the local project",
  initializeProgressDescription: "Existing working files are not being rewritten or moved.",
  initializeProgressPhase: (phase) => ({
    revalidating: "Rechecking the folder",
    preparingFolder: "Preparing owned paths",
    initializingGit: "Adding Git metadata",
    creatingReadme: "Creating README.md",
    verifying: "Verifying the unborn project",
    finalizing: "Removing ownership markers",
  })[phase],
  initializeCleanupTitle: "The project is valid, but cleanup is still needed",
  initializeCleanupDescription: "An exact GitOdile ownership marker could not be removed. Retry only that bounded cleanup before opening.",
  initializeFailureCleanupTitle: "Initialization stopped and bounded cleanup is pending",
  initializeFailureCleanupDescription: "Retry removal of exact empty artifacts owned by this attempt. Existing and non-empty paths remain untouched for manual inspection.",
  initializeCleanupAction: "Retry safe cleanup",
  initializeCleaningUp: "Cleaning up…",
  initializeOpeningTitle: "Opening the project",
  initializeOpeningDescription: "GitOdile is opening the verified folder through the normal project session.",
  initializeSavingTitle: "Saving the first version",
  initializeSavingDescription: "Git hooks and signing remain active. A failure leaves the project open with its files unsaved.",
  initializeCreatedTitle: "Your local project is ready",
  initializeCreatedDescription: "The project is open. You can add files or save the first version whenever you are ready.",
  initializeFirstSaveFailedTitle: "The project is ready, but the first version was not saved",
  initializeFirstSaveFailedDescription: "Nothing was discarded. The project remains open with its current files available as unsaved changes.",
  initializeOpenFailedTitle: "The project was created but could not be opened",
  initializeOpenFailedDescription: "The verified folder remains on disk. Open it manually or retry from GitOdile.",
  initializeErrorTitle: "The local project could not be created",
  initializeRetryAction: "Review again",
  initializeTechnicalDetails: "Technical details",
  initializeFinishAction: "View project",
  initializeRemotePlanning: "Checking remote setup…",
  initializeRemoteReviewTitle: "Review the remote connection",
  initializeRemoteReviewDescription: "This is a separate local configuration change. Connecting now does not fetch, publish, or test credentials.",
  initializeRemoteNamePreview: "Remote name",
  initializeRemoteFetchPreview: "Fetch URL",
  initializeRemotePushPreview: "Publish URL",
  initializeRemoteLocalEffectsTitle: "Local configuration",
  initializeRemoteLocalEffects: "Adds one new remote section to this project's .git/config. Existing configuration is kept unchanged.",
  initializeRemoteNetworkEffectsTitle: "Network effects",
  initializeRemoteNoNetworkNow: "No network request happens during this connection step.",
  initializeRemoteFutureNetwork: "Future Check and Publish actions may contact the displayed destination only when you explicitly run them.",
  initializeRemoteLocalOnly: "This file URL stays local unless your operating system resolves it to a network share.",
  initializeRemoteCredentialsTitle: "Credentials",
  initializeRemoteCredentials: (expectation) => ({
    none: "No credential prompt is expected for this URL type.",
    "git-credential-helper": "Future HTTPS actions use your configured Git credential helper. GitOdile does not store credentials.",
    "ssh-agent-or-key": "Future SSH actions use your system SSH agent, keys, and host trust. GitOdile does not store private keys.",
  })[expectation],
  initializeRemoteSafetyTitle: "URL privacy",
  initializeRemoteSafety: "Credentials, query strings, and fragments were removed before this preview and will not be persisted or shown in diagnostics.",
  initializeEditRemote: "Edit remote",
  initializeConnectRemote: "Connect remote",
  initializeConnectingRemote: "Connecting remote…",
  initializeRemoteErrorTitle: "The remote was not connected",
  initializeSkipRemote: "Finish without remote",
  initializeRemoteConnectedTitle: "Local project and remote are ready",
  initializeRemoteConnectedDescription: (name) => `The remote “${name}” is configured. No network request was made.`,
  initializeChooseParentDialogTitle: "Choose a parent folder",
  initializeChooseExistingDialogTitle: "Choose an ordinary folder",
};

const es: InitializeProjectTranslations = {
  initializeDialogTitle: "Crear un proyecto local",
  initializeDialogDescription: "Empieza con una carpeta nueva o añade Git de forma segura a una carpeta ordinaria existente.",
  initializeNewMode: "Crear proyecto nuevo",
  initializeNewModeDescription: "Crea una carpeta nueva con nombre dentro de una carpeta contenedora.",
  initializeExistingMode: "Convertir esta carpeta en proyecto",
  initializeExistingModeDescription: "Conserva todos sus archivos y añade metadatos Git nuevos junto a ellos.",
  initializeParentLabel: "Carpeta contenedora",
  initializeParentPlaceholder: "Elige dónde vivirá la carpeta del proyecto",
  initializeChooseParent: "Elegir contenedora",
  initializeNameLabel: "Nombre de la carpeta del proyecto",
  initializeNamePlaceholder: "mi-proyecto",
  initializeNameHelp: "GitOdile crea exactamente esta carpeta nueva y nunca reemplaza una ruta existente.",
  initializeExistingLabel: "Carpeta ordinaria existente",
  initializeExistingPlaceholder: "Elige una carpeta que aún no sea un proyecto Git",
  initializeChooseExisting: "Elegir carpeta",
  initializeBranchLabel: "Nombre de la línea de versión inicial",
  initializeBranchHelp: "main es una opción habitual. Git lo llama rama inicial.",
  initializeReadmeLabel: "Añadir README.md",
  initializeReadmeHelp: "Crea un pequeño archivo inicial solo con tu consentimiento explícito.",
  initializeFirstVersionLabel: "Guardar la primera versión",
  initializeFirstVersionHelp: "Guarda todos los archivos actuales después de abrir el proyecto, usando tu identidad, hooks y firma de Git.",
  initializeFirstVersionTitleLabel: "Nombre de la primera versión",
  initializeFirstVersionTitlePlaceholder: "Primera versión",
  initializeFirstVersionDescriptionLabel: "Descripción (opcional)",
  initializeFirstVersionDescriptionPlaceholder: "Por qué empieza este proyecto",
  initializeRemoteLabel: "Conectar un remoto tras la configuración local",
  initializeRemoteHelp: "Añade una URL Git neutral respecto al proveedor en una revisión separada. No crea un repositorio alojado.",
  initializeRemoteNameLabel: "Nombre del remoto",
  initializeRemoteUrlLabel: "URL Git remota",
  initializeRemoteUrlPlaceholder: "https://host.example/equipo/proyecto.git",
  initializeReviewAction: "Revisar configuración local",
  initializeReviewRemoteAction: "Revisar conexión remota",
  initializePlanning: "Comprobando la carpeta…",
  initializeReviewTitle: "Revisa la configuración local",
  initializeReviewDescription: "Esta vista previa cubre solo archivos locales y metadatos Git. El remoto se revisa aparte después.",
  initializeDestinationLabel: "Carpeta del proyecto",
  initializeBranchPreviewLabel: "Línea de versión inicial",
  initializeLocalEffectsTitle: "Carpeta local",
  initializeNewLocalEffects: "Crea la carpeta nueva exacta mostrada arriba y añade metadatos .git nuevos. Un destino existente siempre bloquea la operación.",
  initializeExistingLocalEffects: (count, truncated) =>
    `Añade metadatos .git nuevos a esta carpeta ordinaria. Sus ${truncated ? "999+" : count} elemento${count === 1 ? "" : "s"} de primer nivel permanece${count === 1 ? "" : "n"} intacto${count === 1 ? "" : "s"} byte a byte.`,
  initializeReadmeEffect: "Crea README.md solo si no existe un archivo equivalente por mayúsculas o minúsculas al iniciar la ejecución.",
  initializeNoReadmeEffect: "No crea ningún archivo de trabajo. Solo añade los metadatos Git nuevos.",
  initializeFirstVersionEffect: "Después de abrir, guarda todos los archivos actuales como primera versión mediante el flujo normal con hooks y firma.",
  initializeNoFirstVersionEffect: "Deja la línea de versión unborn hasta que guardes una versión explícitamente más adelante.",
  initializeRemoteLaterEffect: "Tras la configuración local, el nombre y la URL remotos se revisan aparte antes de cambiar la configuración.",
  initializeSafetyTitle: "Qué queda protegido",
  initializeSafetyBody: "GitOdile vuelve a comprobar la ruta justo antes de escribir, nunca limpia ni repuebla una carpeta existente y solo elimina artefactos vacíos exactos marcados como propiedad de este intento.",
  initializeIdentityTitle: "Identidad para la primera versión",
  initializeIdentityReady: "Tu identidad Git actual está disponible. Los hooks y la configuración de firma seguirán activos.",
  initializeIdentityMissing: "La primera versión necesita un nombre y correo de Git. Añádelos en Ajustes o desactiva por ahora la primera versión.",
  initializeOpenIdentitySettings: "Abrir configuración de identidad",
  initializeEditAction: "Editar configuración",
  initializeConfirmAction: "Crear y abrir proyecto",
  initializeProgressTitle: "Creando el proyecto local",
  initializeProgressDescription: "Los archivos de trabajo existentes no se están reescribiendo ni moviendo.",
  initializeProgressPhase: (phase) => ({
    revalidating: "Volviendo a comprobar la carpeta",
    preparingFolder: "Preparando rutas propias",
    initializingGit: "Añadiendo metadatos Git",
    creatingReadme: "Creando README.md",
    verifying: "Verificando el proyecto unborn",
    finalizing: "Eliminando marcadores de propiedad",
  })[phase],
  initializeCleanupTitle: "El proyecto es válido, pero aún hace falta limpiar",
  initializeCleanupDescription: "No se pudo eliminar un marcador exacto de propiedad de GitOdile. Reintenta solo esa limpieza acotada antes de abrir.",
  initializeFailureCleanupTitle: "La inicialización se detuvo y queda una limpieza acotada",
  initializeFailureCleanupDescription: "Reintenta eliminar solo artefactos vacíos exactos propiedad de este intento. Las rutas existentes o no vacías quedan intactas para inspeccionarlas.",
  initializeCleanupAction: "Reintentar limpieza segura",
  initializeCleaningUp: "Limpiando…",
  initializeOpeningTitle: "Abriendo el proyecto",
  initializeOpeningDescription: "GitOdile está abriendo la carpeta verificada mediante la sesión normal del proyecto.",
  initializeSavingTitle: "Guardando la primera versión",
  initializeSavingDescription: "Los hooks y la firma siguen activos. Un fallo deja abierto el proyecto con sus archivos sin guardar.",
  initializeCreatedTitle: "Tu proyecto local está listo",
  initializeCreatedDescription: "El proyecto está abierto. Puedes añadir archivos o guardar la primera versión cuando quieras.",
  initializeFirstSaveFailedTitle: "El proyecto está listo, pero no se guardó la primera versión",
  initializeFirstSaveFailedDescription: "No se descartó nada. El proyecto sigue abierto y sus archivos actuales están disponibles como cambios sin guardar.",
  initializeOpenFailedTitle: "El proyecto se creó, pero no se pudo abrir",
  initializeOpenFailedDescription: "La carpeta verificada sigue en el disco. Ábrela manualmente o reintenta desde GitOdile.",
  initializeErrorTitle: "No se pudo crear el proyecto local",
  initializeRetryAction: "Revisar de nuevo",
  initializeTechnicalDetails: "Detalles técnicos",
  initializeFinishAction: "Ver proyecto",
  initializeRemotePlanning: "Comprobando configuración remota…",
  initializeRemoteReviewTitle: "Revisa la conexión remota",
  initializeRemoteReviewDescription: "Este es un cambio separado de configuración local. Conectar ahora no obtiene, publica ni prueba credenciales.",
  initializeRemoteNamePreview: "Nombre del remoto",
  initializeRemoteFetchPreview: "URL de obtención",
  initializeRemotePushPreview: "URL de publicación",
  initializeRemoteLocalEffectsTitle: "Configuración local",
  initializeRemoteLocalEffects: "Añade una sección remota nueva a .git/config. La configuración existente se mantiene sin cambios.",
  initializeRemoteNetworkEffectsTitle: "Efectos de red",
  initializeRemoteNoNetworkNow: "No se realiza ninguna petición de red durante este paso de conexión.",
  initializeRemoteFutureNetwork: "Las acciones futuras Comprobar y Publicar podrán contactar con el destino mostrado solo cuando las ejecutes explícitamente.",
  initializeRemoteLocalOnly: "Esta URL file permanece local salvo que el sistema operativo la resuelva como recurso de red.",
  initializeRemoteCredentialsTitle: "Credenciales",
  initializeRemoteCredentials: (expectation) => ({
    none: "No se espera ninguna solicitud de credenciales para este tipo de URL.",
    "git-credential-helper": "Las acciones HTTPS futuras usan tu gestor de credenciales Git configurado. GitOdile no guarda credenciales.",
    "ssh-agent-or-key": "Las acciones SSH futuras usan el agente, claves y confianza de host del sistema. GitOdile no guarda claves privadas.",
  })[expectation],
  initializeRemoteSafetyTitle: "Privacidad de la URL",
  initializeRemoteSafety: "Las credenciales, consultas y fragmentos se eliminaron antes de esta vista previa y no se guardarán ni aparecerán en diagnósticos.",
  initializeEditRemote: "Editar remoto",
  initializeConnectRemote: "Conectar remoto",
  initializeConnectingRemote: "Conectando remoto…",
  initializeRemoteErrorTitle: "No se conectó el remoto",
  initializeSkipRemote: "Terminar sin remoto",
  initializeRemoteConnectedTitle: "El proyecto local y el remoto están listos",
  initializeRemoteConnectedDescription: (name) => `El remoto «${name}» está configurado. No se hizo ninguna petición de red.`,
  initializeChooseParentDialogTitle: "Elige una carpeta contenedora",
  initializeChooseExistingDialogTitle: "Elige una carpeta ordinaria",
};

export const initializeProjectTranslations = { en, es } as const;
