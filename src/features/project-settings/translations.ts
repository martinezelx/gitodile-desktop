export interface ProjectSettingsTranslations {
  projectSettingsTitle: string;
  projectSettingsOpen: string;
  projectSettingsOpenFor: (project: string) => string;
  projectSettingsSectionsAriaLabel: string;
  projectSettingsScopeNote: (project: string) => string;
  projectSettingsRemote: string;
  projectSettingsIgnored: string;
  projectSettingsIdentity: string;
  projectSettingsLoading: string;
  projectSettingsReadFailed: string;
  projectSettingsRetry: string;
  projectSettingsSave: string;
  projectSettingsSaving: string;
  projectSettingsRevert: string;
  projectSettingsCancel: string;
  projectSettingsUnsavedTitle: string;
  projectSettingsUnsavedBody: string;
  projectSettingsKeepEditing: string;
  projectSettingsDiscardAndClose: string;

  projectSettingsRemoteTitle: string;
  projectSettingsRemoteDescription: string;
  projectSettingsRemoteUrlLabel: (remote: string) => string;
  projectSettingsRemotePublishesHere: string;
  projectSettingsRemotePushUrl: (url: string) => string;
  projectSettingsRemoteHiddenCredentials: string;
  projectSettingsRemoteChange: string;
  projectSettingsRemoteConfirmTitle: string;
  projectSettingsRemoteConfirmFrom: (url: string) => string;
  projectSettingsRemoteConfirmTo: (url: string) => string;
  projectSettingsRemoteConfirmEffect: string;
  projectSettingsRemoteConfirmCredentials: string;
  projectSettingsRemoteConfirmAction: string;
  projectSettingsRemoteConnectAction: string;
  projectSettingsRemoteChanged: (remote: string) => string;
  projectSettingsRemoteNoneTitle: string;
  projectSettingsRemoteNoneDescription: string;
  projectSettingsRemoteNameLabel: string;
  projectSettingsRemoteNewUrlLabel: string;
  projectSettingsRemoteConnect: string;
  projectSettingsRemoteConnectConfirmTitle: string;
  projectSettingsRemoteConnectNetwork: string;
  projectSettingsRemoteConnectNoNetwork: string;
  projectSettingsRemoteCredentialHelper: string;
  projectSettingsRemoteSshKey: string;
  projectSettingsRemoteConnected: (remote: string) => string;

  projectSettingsIgnoredTitle: string;
  projectSettingsIgnoredDescription: string;
  projectSettingsIgnoredScopeLabel: string;
  projectSettingsIgnoredShared: string;
  projectSettingsIgnoredPersonal: string;
  projectSettingsIgnoredSharedDescription: string;
  projectSettingsIgnoredPersonalDescription: string;
  projectSettingsIgnoredEditorLabel: (file: string) => string;
  projectSettingsIgnoredPlaceholder: string;
  projectSettingsIgnoredNotCreated: (file: string) => string;
  projectSettingsIgnoredSaved: (file: string) => string;
  projectSettingsIgnoredTooLarge: string;
  projectSettingsIgnoredNotText: string;
  projectSettingsIgnoredUnreadable: string;

  projectSettingsIdentityTitle: string;
  projectSettingsIdentityDescription: string;
  projectSettingsIdentitySourceLabel: string;
  projectSettingsIdentityUseGlobal: string;
  projectSettingsIdentityUseProject: string;
  /** Names the identity inside the option that means it, so choosing does not
   * require reading a second block to find out what it would use. */
  projectSettingsIdentityGlobalDescription: (name: string, email: string) => string;
  projectSettingsIdentityGlobalUnsetDescription: string;
  projectSettingsIdentityProjectDescription: string;
  projectSettingsIdentityInUse: string;
  projectSettingsIdentityEffective: (name: string, email: string) => string;
  projectSettingsIdentityUnset: string;
  projectSettingsIdentityNameLabel: string;
  projectSettingsIdentityEmailLabel: string;
  projectSettingsIdentityInvalid: string;
  projectSettingsIdentitySaved: string;
  projectSettingsIdentityCleared: string;

  projectSettingsIcon: string;
  projectSettingsIconTitle: string;
  projectSettingsIconDescription: string;
  projectSettingsIconAutomatic: string;
  projectSettingsIconAutomaticHint: string;
  projectSettingsIconInitials: string;
  projectSettingsIconInitialsHint: string;
  projectSettingsIconDetected: (technology: string) => string;
  projectSettingsIconNotDetected: string;
  projectSettingsIconUnreadable: string;
  projectSettingsIconEmoji: string;
  projectSettingsIconEmojiHint: string;
  projectSettingsIconUseEmoji: (emoji: string) => string;
}

export const projectSettingsTranslations: {
  en: ProjectSettingsTranslations;
  es: ProjectSettingsTranslations;
} = {
  en: {
    projectSettingsTitle: "Project settings",
    projectSettingsOpen: "Project settings",
    projectSettingsOpenFor: (project) => `Settings for ${project || "this project"}`,
    projectSettingsSectionsAriaLabel: "Project settings sections",
    projectSettingsScopeNote: (project) => `These settings apply only to ${project}.`,
    projectSettingsRemote: "Remote",
    projectSettingsIgnored: "Ignored files",
    projectSettingsIdentity: "Identity",
    projectSettingsLoading: "Reading this project…",
    projectSettingsReadFailed: "Couldn't read this project's settings.",
    projectSettingsRetry: "Try again",
    projectSettingsSave: "Save",
    projectSettingsSaving: "Saving…",
    projectSettingsRevert: "Undo changes",
    projectSettingsCancel: "Cancel",
    projectSettingsUnsavedTitle: "You have unsaved changes",
    projectSettingsUnsavedBody: "Closing now discards them. Nothing has been written to the project yet.",
    projectSettingsKeepEditing: "Keep editing",
    projectSettingsDiscardAndClose: "Discard and close",

    projectSettingsRemoteTitle: "Where this project publishes",
    projectSettingsRemoteDescription: "Where your versions are published and your team's come from. Changes here only affect this project.",
    projectSettingsRemoteUrlLabel: (remote) => `Address for ${remote}`,
    projectSettingsRemotePublishesHere: "Publishes here",
    projectSettingsRemotePushUrl: (url) => `Publishing uses a different address (${url}), which this field doesn't change.`,
    projectSettingsRemoteHiddenCredentials: "This address includes hidden sign-in details. Saving a new address removes them.",
    projectSettingsRemoteChange: "Change address",
    projectSettingsRemoteConfirmTitle: "Change the remote address?",
    projectSettingsRemoteConfirmFrom: (url) => `Now: ${url}`,
    projectSettingsRemoteConfirmTo: (url) => `After: ${url}`,
    projectSettingsRemoteConfirmEffect: "Publishing and getting changes will use the new address. Nothing is sent now, and your saved versions don't change.",
    projectSettingsRemoteConfirmCredentials: "The sign-in details in the old address will be removed.",
    projectSettingsRemoteConfirmAction: "Change it",
    projectSettingsRemoteChanged: (remote) => `${remote} now uses the new address.`,
    projectSettingsRemoteNoneTitle: "No remote connected",
    projectSettingsRemoteNoneDescription: "This project is only on this computer. Connect a remote to publish your versions and work with others.",
    projectSettingsRemoteNameLabel: "Name",
    projectSettingsRemoteNewUrlLabel: "Address",
    projectSettingsRemoteConnect: "Connect",
    projectSettingsRemoteConnectAction: "Connect it",
    projectSettingsRemoteConnectConfirmTitle: "Connect this remote?",
    projectSettingsRemoteConnectNetwork: "Nothing is sent now. Publishing will contact this address.",
    projectSettingsRemoteConnectNoNetwork: "Nothing is sent now. This address is on this computer.",
    projectSettingsRemoteCredentialHelper: "Publishing will sign in with your Git credential helper.",
    projectSettingsRemoteSshKey: "Publishing will use your SSH key or agent.",
    projectSettingsRemoteConnected: (remote) => `${remote} is connected.`,

    projectSettingsIgnoredTitle: "Files this project ignores",
    projectSettingsIgnoredDescription: "One rule per line. Matching files never show up as changes.",
    projectSettingsIgnoredScopeLabel: "Which list",
    projectSettingsIgnoredShared: "Everyone",
    projectSettingsIgnoredPersonal: "Only me",
    projectSettingsIgnoredSharedDescription: "Saved in the project as .gitignore, so everyone who has the project gets these rules.",
    projectSettingsIgnoredPersonalDescription: "Kept only in your copy. Nobody else sees these rules and they're never published.",
    projectSettingsIgnoredEditorLabel: (file) => `Rules in ${file}`,
    projectSettingsIgnoredPlaceholder: "build/\nnode_modules/\n*.log",
    projectSettingsIgnoredNotCreated: (file) => `${file} doesn't exist yet. Saving creates it.`,
    projectSettingsIgnoredSaved: (file) => `${file} saved.`,
    projectSettingsIgnoredTooLarge: "This file is too large to edit here. Open it in a text editor.",
    projectSettingsIgnoredNotText: "This file isn't plain text, so GitOdile won't rewrite it.",
    projectSettingsIgnoredUnreadable: "Couldn't read this file.",

    projectSettingsIdentityTitle: "Who this project saves as",
    projectSettingsIdentityDescription: "The name and email on every version you save in this project.",
    projectSettingsIdentitySourceLabel: "Identity for this project",
    projectSettingsIdentityUseGlobal: "Your Git identity",
    projectSettingsIdentityUseProject: "A different one, only here",
    projectSettingsIdentityGlobalDescription: (name, email) => `Same as your other projects: ${name} <${email}>.`,
    projectSettingsIdentityGlobalUnsetDescription: "You haven't set one in Settings yet, so this project has none either.",
    projectSettingsIdentityProjectDescription: "A name and email just for this project. Your Git settings don't change.",
    projectSettingsIdentityInUse: "In use",
    projectSettingsIdentityEffective: (name, email) => `Versions saved here will be signed ${name} <${email}>.`,
    projectSettingsIdentityUnset: "No identity is set, so saving a version here will fail until you add one.",
    projectSettingsIdentityNameLabel: "Name",
    projectSettingsIdentityEmailLabel: "Email",
    projectSettingsIdentityInvalid: "Enter a name and an email address.",
    projectSettingsIdentitySaved: "This project now saves under its own identity.",
    projectSettingsIdentityCleared: "This project uses your Git identity again.",

    projectSettingsIcon: "Icon",
    projectSettingsIconTitle: "Project icon",
    projectSettingsIconDescription: "Give this project its own icon, or leave it on Automatic to follow the app setting.",
    projectSettingsIconAutomatic: "Automatic",
    projectSettingsIconAutomaticHint: "Follows the app's project icon setting.",
    projectSettingsIconInitials: "Initials",
    projectSettingsIconInitialsHint: "The project's two letters.",
    projectSettingsIconDetected: (technology) => `Detected: ${technology}`,
    projectSettingsIconNotDetected: "No known technology detected.",
    projectSettingsIconUnreadable: "Couldn't detect this project's technology.",
    projectSettingsIconEmoji: "Emoji",
    projectSettingsIconEmojiHint: "Pick an animal or a symbol.",
    projectSettingsIconUseEmoji: (emoji) => `Use ${emoji} for this project`,
  },
  es: {
    projectSettingsTitle: "Ajustes del proyecto",
    projectSettingsOpen: "Ajustes del proyecto",
    projectSettingsOpenFor: (project) => `Ajustes de ${project || "este proyecto"}`,
    projectSettingsSectionsAriaLabel: "Secciones de ajustes del proyecto",
    projectSettingsScopeNote: (project) => `Estos ajustes solo afectan a ${project}.`,
    projectSettingsRemote: "Remoto",
    projectSettingsIgnored: "Archivos ignorados",
    projectSettingsIdentity: "Identidad",
    projectSettingsLoading: "Leyendo este proyecto…",
    projectSettingsReadFailed: "No se pudieron leer los ajustes de este proyecto.",
    projectSettingsRetry: "Reintentar",
    projectSettingsSave: "Guardar",
    projectSettingsSaving: "Guardando…",
    projectSettingsRevert: "Deshacer cambios",
    projectSettingsCancel: "Cancelar",
    projectSettingsUnsavedTitle: "Tienes cambios sin guardar",
    projectSettingsUnsavedBody: "Si cierras ahora, se descartan. Aún no se ha escrito nada en el proyecto.",
    projectSettingsKeepEditing: "Seguir editando",
    projectSettingsDiscardAndClose: "Descartar y cerrar",

    projectSettingsRemoteTitle: "Dónde publica este proyecto",
    projectSettingsRemoteDescription: "Dónde se publican tus versiones y de dónde llegan las de tu equipo. Los cambios aquí solo afectan a este proyecto.",
    projectSettingsRemoteUrlLabel: (remote) => `Dirección de ${remote}`,
    projectSettingsRemotePublishesHere: "Publica aquí",
    projectSettingsRemotePushUrl: (url) => `Para publicar se usa otra dirección (${url}), que este campo no cambia.`,
    projectSettingsRemoteHiddenCredentials: "Esta dirección incluye datos de acceso ocultos. Guardar una dirección nueva los elimina.",
    projectSettingsRemoteChange: "Cambiar dirección",
    projectSettingsRemoteConfirmTitle: "¿Cambiar la dirección del remoto?",
    projectSettingsRemoteConfirmFrom: (url) => `Ahora: ${url}`,
    projectSettingsRemoteConfirmTo: (url) => `Después: ${url}`,
    projectSettingsRemoteConfirmEffect: "Publicar y traer cambios usarán la nueva dirección. Ahora no se envía nada y tus versiones guardadas no cambian.",
    projectSettingsRemoteConfirmCredentials: "Se eliminarán los datos de acceso de la dirección anterior.",
    projectSettingsRemoteConfirmAction: "Cambiarla",
    projectSettingsRemoteChanged: (remote) => `${remote} ya usa la nueva dirección.`,
    projectSettingsRemoteNoneTitle: "Sin remoto conectado",
    projectSettingsRemoteNoneDescription: "Este proyecto solo está en este ordenador. Conecta un remoto para publicar tus versiones y trabajar con otras personas.",
    projectSettingsRemoteNameLabel: "Nombre",
    projectSettingsRemoteNewUrlLabel: "Dirección",
    projectSettingsRemoteConnect: "Conectar",
    projectSettingsRemoteConnectAction: "Conectarlo",
    projectSettingsRemoteConnectConfirmTitle: "¿Conectar este remoto?",
    projectSettingsRemoteConnectNetwork: "Ahora no se envía nada. Al publicar se contactará con esta dirección.",
    projectSettingsRemoteConnectNoNetwork: "Ahora no se envía nada. Esta dirección está en este ordenador.",
    projectSettingsRemoteCredentialHelper: "Al publicar se iniciará sesión con tu gestor de credenciales de Git.",
    projectSettingsRemoteSshKey: "Al publicar se usará tu clave o agente SSH.",
    projectSettingsRemoteConnected: (remote) => `${remote} está conectado.`,

    projectSettingsIgnoredTitle: "Archivos que ignora este proyecto",
    projectSettingsIgnoredDescription: "Una regla por línea. Los archivos que coincidan nunca aparecen como cambios.",
    projectSettingsIgnoredScopeLabel: "Qué lista",
    projectSettingsIgnoredShared: "Todo el mundo",
    projectSettingsIgnoredPersonal: "Solo yo",
    projectSettingsIgnoredSharedDescription: "Se guarda en el proyecto como .gitignore, así que estas reglas llegan a todos los que tengan el proyecto.",
    projectSettingsIgnoredPersonalDescription: "Se queda solo en tu copia. Nadie más ve estas reglas y nunca se publican.",
    projectSettingsIgnoredEditorLabel: (file) => `Reglas en ${file}`,
    projectSettingsIgnoredPlaceholder: "build/\nnode_modules/\n*.log",
    projectSettingsIgnoredNotCreated: (file) => `${file} aún no existe. Al guardar se creará.`,
    projectSettingsIgnoredSaved: (file) => `${file} guardado.`,
    projectSettingsIgnoredTooLarge: "Este archivo es demasiado grande para editarlo aquí. Ábrelo en un editor de texto.",
    projectSettingsIgnoredNotText: "Este archivo no es texto plano, así que GitOdile no lo reescribirá.",
    projectSettingsIgnoredUnreadable: "No se pudo leer este archivo.",

    projectSettingsIdentityTitle: "Con qué identidad guarda este proyecto",
    projectSettingsIdentityDescription: "El nombre y el correo de cada versión que guardas en este proyecto.",
    projectSettingsIdentitySourceLabel: "Identidad de este proyecto",
    projectSettingsIdentityUseGlobal: "Tu identidad de Git",
    projectSettingsIdentityUseProject: "Otra distinta, solo aquí",
    projectSettingsIdentityGlobalDescription: (name, email) => `La misma que tus otros proyectos: ${name} <${email}>.`,
    projectSettingsIdentityGlobalUnsetDescription: "Aún no has definido ninguna en Ajustes, así que este proyecto tampoco tiene.",
    projectSettingsIdentityProjectDescription: "Un nombre y correo solo para este proyecto. Tus ajustes de Git no cambian.",
    projectSettingsIdentityInUse: "En uso",
    projectSettingsIdentityEffective: (name, email) => `Las versiones que guardes aquí irán firmadas como ${name} <${email}>.`,
    projectSettingsIdentityUnset: "No hay identidad definida, así que no podrás guardar versiones aquí hasta que añadas una.",
    projectSettingsIdentityNameLabel: "Nombre",
    projectSettingsIdentityEmailLabel: "Correo",
    projectSettingsIdentityInvalid: "Escribe un nombre y un correo.",
    projectSettingsIdentitySaved: "Este proyecto ya guarda con su propia identidad.",
    projectSettingsIdentityCleared: "Este proyecto vuelve a usar tu identidad de Git.",

    projectSettingsIcon: "Icono",
    projectSettingsIconTitle: "Icono del proyecto",
    projectSettingsIconDescription: "Dale a este proyecto su propio icono o déjalo en Automático para seguir el ajuste de la aplicación.",
    projectSettingsIconAutomatic: "Automático",
    projectSettingsIconAutomaticHint: "Sigue el ajuste de iconos de proyecto de la aplicación.",
    projectSettingsIconInitials: "Iniciales",
    projectSettingsIconInitialsHint: "Las dos letras del proyecto.",
    projectSettingsIconDetected: (technology) => `Detectado: ${technology}`,
    projectSettingsIconNotDetected: "No se detectó ninguna tecnología conocida.",
    projectSettingsIconUnreadable: "No se pudo detectar la tecnología del proyecto.",
    projectSettingsIconEmoji: "Emoji",
    projectSettingsIconEmojiHint: "Elige un animal o un símbolo.",
    projectSettingsIconUseEmoji: (emoji) => `Usar ${emoji} para este proyecto`,
  },
};
