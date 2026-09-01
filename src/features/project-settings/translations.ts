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
    projectSettingsScopeNote: (project) => `These settings apply to ${project} only.`,
    projectSettingsRemote: "Remote",
    projectSettingsIgnored: "Ignored files",
    projectSettingsIdentity: "Identity",
    projectSettingsLoading: "Reading this project…",
    projectSettingsReadFailed: "GitOdile couldn't read this project's settings.",
    projectSettingsRetry: "Try again",
    projectSettingsSave: "Save",
    projectSettingsSaving: "Saving…",
    projectSettingsRevert: "Undo changes",
    projectSettingsCancel: "Cancel",
    projectSettingsUnsavedTitle: "You have changes that aren't saved",
    projectSettingsUnsavedBody:
      "Closing now discards them. Nothing has been written to this project yet.",
    projectSettingsKeepEditing: "Keep editing",
    projectSettingsDiscardAndClose: "Discard and close",

    projectSettingsRemoteTitle: "Where this project publishes",
    projectSettingsRemoteDescription:
      "The addresses this project uses to publish your versions and get your team's. Changing one only changes this project.",
    projectSettingsRemoteUrlLabel: (remote) => `Address for ${remote}`,
    projectSettingsRemotePublishesHere: "Publishes here",
    projectSettingsRemotePushUrl: (url) =>
      `Publishing uses a separate address (${url}), which this field does not change.`,
    projectSettingsRemoteHiddenCredentials:
      "The saved address includes sign-in details GitOdile doesn't show. Saving a new address replaces them.",
    projectSettingsRemoteChange: "Change address",
    projectSettingsRemoteConfirmTitle: "Change where this project points?",
    projectSettingsRemoteConfirmFrom: (url) => `Now: ${url}`,
    projectSettingsRemoteConfirmTo: (url) => `After: ${url}`,
    projectSettingsRemoteConfirmEffect:
      "Publishing changes and getting your team's changes will use the new address. Nothing is sent right now, and your saved versions stay where they are.",
    projectSettingsRemoteConfirmCredentials:
      "The sign-in details stored in the old address will be removed.",
    projectSettingsRemoteConfirmAction: "Change it",
    projectSettingsRemoteChanged: (remote) => `${remote} now points at the new address.`,
    projectSettingsRemoteNoneTitle: "No remote connected",
    projectSettingsRemoteNoneDescription:
      "This project only exists on this computer. Connect a remote to publish your versions and work with other people.",
    projectSettingsRemoteNameLabel: "Name",
    projectSettingsRemoteNewUrlLabel: "Address",
    projectSettingsRemoteConnect: "Connect",
    projectSettingsRemoteConnectAction: "Connect it",
    projectSettingsRemoteConnectConfirmTitle: "Connect this remote?",
    projectSettingsRemoteConnectNetwork:
      "Nothing is sent now. Publishing later will contact this address.",
    projectSettingsRemoteConnectNoNetwork: "Nothing is sent now, and this address is local.",
    projectSettingsRemoteCredentialHelper:
      "Publishing will ask your Git credential helper to sign in.",
    projectSettingsRemoteSshKey: "Publishing will use your SSH key or agent.",
    projectSettingsRemoteConnected: (remote) => `${remote} is connected.`,

    projectSettingsIgnoredTitle: "Files this project ignores",
    projectSettingsIgnoredDescription:
      "One rule per line. GitOdile leaves matching files out of your changes instead of offering to save them.",
    projectSettingsIgnoredScopeLabel: "Which list",
    projectSettingsIgnoredShared: "Everyone",
    projectSettingsIgnoredPersonal: "Only me",
    projectSettingsIgnoredSharedDescription:
      "Saved in the project as .gitignore, so everyone who has this project gets these rules.",
    projectSettingsIgnoredPersonalDescription:
      "Kept in this copy of the project only. Nobody else sees these rules, and they are never published.",
    projectSettingsIgnoredEditorLabel: (file) => `Rules in ${file}`,
    projectSettingsIgnoredPlaceholder: "build/\nnode_modules/\n*.log",
    projectSettingsIgnoredNotCreated: (file) => `${file} doesn't exist yet. Saving creates it.`,
    projectSettingsIgnoredSaved: (file) => `${file} saved.`,
    projectSettingsIgnoredTooLarge:
      "This file is too large to edit here. Open it in a text editor instead.",
    projectSettingsIgnoredNotText:
      "This file isn't plain text, so GitOdile won't rewrite it.",
    projectSettingsIgnoredUnreadable: "GitOdile couldn't read this file.",

    projectSettingsIdentityTitle: "Who this project saves as",
    projectSettingsIdentityDescription:
      "The name and email recorded on every version you save in this project.",
    projectSettingsIdentitySourceLabel: "Which identity this project saves with",
    projectSettingsIdentityUseGlobal: "Your Git identity",
    projectSettingsIdentityUseProject: "A different one, only here",
    projectSettingsIdentityGlobalDescription: (name, email) =>
      `The one your other projects use: ${name} <${email}>.`,
    projectSettingsIdentityGlobalUnsetDescription:
      "You haven't set one in Settings yet, so this project has no identity either.",
    projectSettingsIdentityProjectDescription:
      "This project saves under a name and email of its own. Your Git settings stay as they are.",
    projectSettingsIdentityInUse: "In use",
    projectSettingsIdentityEffective: (name, email) =>
      `Versions saved here will be signed ${name} <${email}>.`,
    projectSettingsIdentityUnset:
      "No identity is set anywhere, so saving a version in this project will fail until you add one.",
    projectSettingsIdentityNameLabel: "Name",
    projectSettingsIdentityEmailLabel: "Email",
    projectSettingsIdentityInvalid: "Enter a name and an email address.",
    projectSettingsIdentitySaved: "This project now saves under its own identity.",
    projectSettingsIdentityCleared: "This project is back to your Git identity.",
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
    projectSettingsReadFailed: "GitOdile no pudo leer los ajustes de este proyecto.",
    projectSettingsRetry: "Reintentar",
    projectSettingsSave: "Guardar",
    projectSettingsSaving: "Guardando…",
    projectSettingsRevert: "Deshacer cambios",
    projectSettingsCancel: "Cancelar",
    projectSettingsUnsavedTitle: "Tienes cambios sin guardar",
    projectSettingsUnsavedBody:
      "Si cierras ahora se descartan. Todavía no se ha escrito nada en el proyecto.",
    projectSettingsKeepEditing: "Seguir editando",
    projectSettingsDiscardAndClose: "Descartar y cerrar",

    projectSettingsRemoteTitle: "Dónde publica este proyecto",
    projectSettingsRemoteDescription:
      "Las direcciones que usa este proyecto para publicar tus versiones y recibir las de tu equipo. Cambiar una solo afecta a este proyecto.",
    projectSettingsRemoteUrlLabel: (remote) => `Dirección de ${remote}`,
    projectSettingsRemotePublishesHere: "Publica aquí",
    projectSettingsRemotePushUrl: (url) =>
      `Publicar usa una dirección aparte (${url}), que este campo no cambia.`,
    projectSettingsRemoteHiddenCredentials:
      "La dirección guardada incluye datos de acceso que GitOdile no muestra. Guardar una dirección nueva los sustituye.",
    projectSettingsRemoteChange: "Cambiar dirección",
    projectSettingsRemoteConfirmTitle: "¿Cambiar a dónde apunta este proyecto?",
    projectSettingsRemoteConfirmFrom: (url) => `Ahora: ${url}`,
    projectSettingsRemoteConfirmTo: (url) => `Después: ${url}`,
    projectSettingsRemoteConfirmEffect:
      "Publicar cambios y recibir los de tu equipo usarán la nueva dirección. Ahora mismo no se envía nada y tus versiones guardadas se quedan donde están.",
    projectSettingsRemoteConfirmCredentials:
      "Se eliminarán los datos de acceso guardados en la dirección anterior.",
    projectSettingsRemoteConfirmAction: "Cambiarla",
    projectSettingsRemoteChanged: (remote) => `${remote} ya apunta a la nueva dirección.`,
    projectSettingsRemoteNoneTitle: "Sin remoto conectado",
    projectSettingsRemoteNoneDescription:
      "Este proyecto solo existe en este ordenador. Conecta un remoto para publicar tus versiones y trabajar con otras personas.",
    projectSettingsRemoteNameLabel: "Nombre",
    projectSettingsRemoteNewUrlLabel: "Dirección",
    projectSettingsRemoteConnect: "Conectar",
    projectSettingsRemoteConnectAction: "Conectarlo",
    projectSettingsRemoteConnectConfirmTitle: "¿Conectar este remoto?",
    projectSettingsRemoteConnectNetwork:
      "Ahora no se envía nada. Al publicar más adelante se contactará con esta dirección.",
    projectSettingsRemoteConnectNoNetwork: "Ahora no se envía nada y esta dirección es local.",
    projectSettingsRemoteCredentialHelper:
      "Al publicar se pedirá el acceso a tu gestor de credenciales de Git.",
    projectSettingsRemoteSshKey: "Al publicar se usará tu clave o agente SSH.",
    projectSettingsRemoteConnected: (remote) => `${remote} está conectado.`,

    projectSettingsIgnoredTitle: "Archivos que ignora este proyecto",
    projectSettingsIgnoredDescription:
      "Una regla por línea. GitOdile deja fuera de tus cambios los archivos que coincidan en lugar de ofrecerte guardarlos.",
    projectSettingsIgnoredScopeLabel: "Qué lista",
    projectSettingsIgnoredShared: "Todo el mundo",
    projectSettingsIgnoredPersonal: "Solo yo",
    projectSettingsIgnoredSharedDescription:
      "Se guarda en el proyecto como .gitignore, así que estas reglas llegan a todo el mundo que tenga el proyecto.",
    projectSettingsIgnoredPersonalDescription:
      "Se queda solo en esta copia del proyecto. Nadie más ve estas reglas y nunca se publican.",
    projectSettingsIgnoredEditorLabel: (file) => `Reglas en ${file}`,
    projectSettingsIgnoredPlaceholder: "build/\nnode_modules/\n*.log",
    projectSettingsIgnoredNotCreated: (file) => `${file} todavía no existe. Al guardar se creará.`,
    projectSettingsIgnoredSaved: (file) => `${file} guardado.`,
    projectSettingsIgnoredTooLarge:
      "Este archivo es demasiado grande para editarlo aquí. Ábrelo en un editor de texto.",
    projectSettingsIgnoredNotText:
      "Este archivo no es texto plano, así que GitOdile no lo reescribirá.",
    projectSettingsIgnoredUnreadable: "GitOdile no pudo leer este archivo.",

    projectSettingsIdentityTitle: "Con qué identidad guarda este proyecto",
    projectSettingsIdentityDescription:
      "El nombre y el correo que quedan registrados en cada versión que guardas en este proyecto.",
    projectSettingsIdentitySourceLabel: "Con qué identidad guarda este proyecto",
    projectSettingsIdentityUseGlobal: "Tu identidad de Git",
    projectSettingsIdentityUseProject: "Otra distinta, solo aquí",
    projectSettingsIdentityGlobalDescription: (name, email) =>
      `La que usan tus demás proyectos: ${name} <${email}>.`,
    projectSettingsIdentityGlobalUnsetDescription:
      "Todavía no has definido ninguna en Ajustes, así que este proyecto tampoco tiene.",
    projectSettingsIdentityProjectDescription:
      "Este proyecto guarda con un nombre y un correo propios. Tus ajustes de Git se quedan como están.",
    projectSettingsIdentityInUse: "En uso",
    projectSettingsIdentityEffective: (name, email) =>
      `Las versiones que guardes aquí irán firmadas como ${name} <${email}>.`,
    projectSettingsIdentityUnset:
      "No hay ninguna identidad definida en ningún sitio, así que guardar una versión en este proyecto fallará hasta que añadas una.",
    projectSettingsIdentityNameLabel: "Nombre",
    projectSettingsIdentityEmailLabel: "Correo",
    projectSettingsIdentityInvalid: "Escribe un nombre y un correo electrónico.",
    projectSettingsIdentitySaved: "Este proyecto ya guarda con su propia identidad.",
    projectSettingsIdentityCleared: "Este proyecto vuelve a tu identidad de Git.",
  },
};
