export interface SettingsTranslations {
  settingsInterfaceTitle: string;
  settingsSectionsAriaLabel: string;
  settingsResetSection: string;
  settingsGitTitle: string;
  settingsGitNeedsAttention: string;
  themeAriaLabel: string;
  settingsThemeDescription: string;
  themeLight: string;
  themeDark: string;
  settingsGeneralTitle: string;
  settingsGitInstallationTitle: string;
  settingsGitInstalledVersionLabel: string;
  settingsGeneralChecking: string;
  settingsGeneralUpdateAvailable: string;
  settingsGeneralGitMissing: string;
  settingsGeneralGitUnusable: string;
  settingsGeneralGitCheckFailed: string;
  settingsGeneralCheckAgain: string;
  settingsGeneralInstallGit: string;
  settingsGeneralUpdate: string;
  gitStartingInstaller: string;
  gitInstallerLaunched: string;
  gitInstallerAlreadyStarting: string;
  gitInstallerFailedWithGuidance: string;
  gitWindowsGuidanceOpened: string;
  gitMacosGuidanceOpened: string;
  gitLinuxGuidanceOpened: string;
  gitUpdateNotChecked: string;
  gitUpdateCheck: string;
  gitUpdateChecking: string;
  gitUpdateUpToDate: string;
  gitUpdateCheckerUnavailable: string;
  gitUpdateCheckFailed: string;
  gitUpdateCheckTimedOut: string;
  gitUpdateStarting: string;
  gitUpdateLaunched: string;
  gitUpdateAlreadyStarting: string;
  gitCouldntStart: string;
  settingsIdentityTitle: string;
  settingsIdentityDescription: string;
  identityNameLabel: string;
  identityEmailLabel: string;
  identityNamePlaceholder: string;
  identityEmailPlaceholder: string;
  identitySaving: string;
  identitySaved: string;
  identityCouldntSave: string;
  identityInvalidEmail: string;
  identityUnsavedTitle: string;
  identityUnsavedBody: string;
  identityKeepEditing: string;
  identityDiscardAndClose: string;
  settingsStartupTitle: string;
  startupReopenLabel: string;
  startupReopenDescription: string;
  settingsSafetyTitle: string;
  safetyConfirmLabel: string;
  safetyConfirmDescription: string;
  settingsLanguageTitle: string;
  settingsLanguageDescription: string;
  languageAriaLabel: string;
}

const en: SettingsTranslations = {
  settingsInterfaceTitle: "Interface",
  settingsSectionsAriaLabel: "Settings sections",
  settingsResetSection: "Reset this section",
  settingsGitTitle: "Git",
  settingsGitNeedsAttention: "Git needs attention",
  themeAriaLabel: "Theme",
  settingsThemeDescription: '"System" follows your operating system.',
  themeLight: "Light",
  themeDark: "Dark",
  settingsGeneralTitle: "General",
  settingsGitInstallationTitle: "Installation",
  settingsGitInstalledVersionLabel: "Installed version",
  settingsGeneralChecking: "Checking…",
  settingsGeneralUpdateAvailable: "Update available",
  settingsGeneralGitMissing: "Git isn't installed or isn't available to GitOdrile.",
  settingsGeneralGitUnusable: "Git was found, but it isn't working correctly.",
  settingsGeneralGitCheckFailed: "GitOdrile couldn't check the Git installation.",
  settingsGeneralCheckAgain: "Check again",
  settingsGeneralInstallGit: "Install Git",
  settingsGeneralUpdate: "Update",
  gitStartingInstaller: "Starting…",
  gitInstallerLaunched: "Installer launched — this can take a moment to appear. Reopen GitOdrile once it finishes.",
  gitInstallerAlreadyStarting: "The installer is already starting.",
  gitInstallerFailedWithGuidance: "The installer couldn't start. The official Windows instructions were opened instead.",
  gitWindowsGuidanceOpened: "winget isn't available, so the official Windows installation instructions were opened.",
  gitMacosGuidanceOpened: "The official macOS installation options were opened. Choose the method that fits your Mac.",
  gitLinuxGuidanceOpened:
    "The official Linux instructions were opened. Use the package manager for your distribution.",
  gitUpdateNotChecked: "Updates haven't been checked. Checking may contact the Windows package source.",
  gitUpdateCheck: "Check for updates",
  gitUpdateChecking: "Checking for a Git update…",
  gitUpdateUpToDate: "Git is up to date.",
  gitUpdateCheckerUnavailable: "Git updates can't be checked automatically on this system.",
  gitUpdateCheckFailed: "Couldn't check for a Git update. Try again later.",
  gitUpdateCheckTimedOut: "The update check took too long and was stopped.",
  gitUpdateStarting: "Starting…",
  gitUpdateLaunched: "Update launched — this can take a moment to appear. Reopen GitOdrile once it finishes.",
  gitUpdateAlreadyStarting: "The Git update is already starting.",
  gitCouldntStart: "Couldn't start that.",
  settingsIdentityTitle: "Identity",
  settingsIdentityDescription:
    "Used to record you as the author of versions you save. This is a normal, global Git setting — not stored only inside GitOdrile.",
  identityNameLabel: "Name",
  identityEmailLabel: "Email",
  identityNamePlaceholder: "Ada Lovelace",
  identityEmailPlaceholder: "ada@example.com",
  identitySaving: "Saving…",
  identitySaved: "Saved.",
  identityCouldntSave: "Couldn't save that.",
  identityInvalidEmail: "That doesn't look like an email address.",
  identityUnsavedTitle: "Your identity isn't saved yet",
  identityUnsavedBody: "Fill in both fields with a valid email, or close and discard what you typed.",
  identityKeepEditing: "Keep editing",
  identityDiscardAndClose: "Discard and close",
  settingsStartupTitle: "Startup",
  startupReopenLabel: "Reopen projects from the previous session",
  startupReopenDescription: "Skip picking folders again if you had projects open last time.",
  settingsSafetyTitle: "Safety",
  safetyConfirmLabel: "Confirm before closing a project",
  safetyConfirmDescription: "Ask before clearing the open project, in case that was a misclick.",
  settingsLanguageTitle: "Language",
  settingsLanguageDescription: '"System" follows your operating system\'s language.',
  languageAriaLabel: "Language",
};

const es: SettingsTranslations = {
  settingsInterfaceTitle: "Interfaz",
  settingsSectionsAriaLabel: "Secciones de configuración",
  settingsResetSection: "Restablecer esta sección",
  settingsGitTitle: "Git",
  settingsGitNeedsAttention: "Git necesita atención",
  themeAriaLabel: "Tema",
  settingsThemeDescription: '"Sistema" sigue tu sistema operativo.',
  themeLight: "Claro",
  themeDark: "Oscuro",
  settingsGeneralTitle: "General",
  settingsGitInstallationTitle: "Instalación",
  settingsGitInstalledVersionLabel: "Versión instalada",
  settingsGeneralChecking: "Comprobando…",
  settingsGeneralUpdateAvailable: "Actualización disponible",
  settingsGeneralGitMissing: "Git no está instalado o no está disponible para GitOdrile.",
  settingsGeneralGitUnusable: "Git se encontró, pero no funciona correctamente.",
  settingsGeneralGitCheckFailed: "GitOdrile no pudo comprobar la instalación de Git.",
  settingsGeneralCheckAgain: "Comprobar de nuevo",
  settingsGeneralInstallGit: "Instalar Git",
  settingsGeneralUpdate: "Actualizar",
  gitStartingInstaller: "Iniciando…",
  gitInstallerLaunched:
    "Instalador iniciado — puede tardar un momento en aparecer. Vuelve a abrir GitOdrile cuando termine.",
  gitInstallerAlreadyStarting: "El instalador ya se está iniciando.",
  gitInstallerFailedWithGuidance:
    "El instalador no pudo iniciarse. Se abrieron en su lugar las instrucciones oficiales para Windows.",
  gitWindowsGuidanceOpened:
    "winget no está disponible, así que se abrieron las instrucciones oficiales de instalación para Windows.",
  gitMacosGuidanceOpened:
    "Se abrieron las opciones oficiales de instalación para macOS. Elige el método apropiado para tu Mac.",
  gitLinuxGuidanceOpened:
    "Se abrieron las instrucciones oficiales para Linux. Usa el gestor de paquetes de tu distribución.",
  gitUpdateNotChecked:
    "Aún no se han buscado actualizaciones. La comprobación puede contactar con la fuente de paquetes de Windows.",
  gitUpdateCheck: "Buscar actualizaciones",
  gitUpdateChecking: "Buscando una actualización de Git…",
  gitUpdateUpToDate: "Git está actualizado.",
  gitUpdateCheckerUnavailable: "No se pueden comprobar automáticamente las actualizaciones de Git en este sistema.",
  gitUpdateCheckFailed: "No se pudo buscar una actualización de Git. Inténtalo de nuevo más tarde.",
  gitUpdateCheckTimedOut: "La comprobación tardó demasiado y se detuvo.",
  gitUpdateStarting: "Iniciando…",
  gitUpdateLaunched:
    "Actualización iniciada — puede tardar un momento en aparecer. Vuelve a abrir GitOdrile cuando termine.",
  gitUpdateAlreadyStarting: "La actualización de Git ya se está iniciando.",
  gitCouldntStart: "No se pudo iniciar eso.",
  settingsIdentityTitle: "Identidad",
  settingsIdentityDescription:
    "Se usa para indicar que eres el autor de las versiones que guardas. Es un ajuste normal y global de Git, no algo exclusivo de GitOdrile.",
  identityNameLabel: "Nombre",
  identityEmailLabel: "Correo electrónico",
  identityNamePlaceholder: "Ada Lovelace",
  identityEmailPlaceholder: "ada@example.com",
  identitySaving: "Guardando…",
  identitySaved: "Guardado.",
  identityCouldntSave: "No se pudo guardar eso.",
  identityInvalidEmail: "Esto no parece una dirección de correo.",
  identityUnsavedTitle: "Tu identidad aún no está guardada",
  identityUnsavedBody:
    "Rellena ambos campos con un correo válido, o cierra y descarta lo que has escrito.",
  identityKeepEditing: "Seguir editando",
  identityDiscardAndClose: "Descartar y cerrar",
  settingsStartupTitle: "Inicio",
  startupReopenLabel: "Reabrir los proyectos de la última sesión",
  startupReopenDescription: "Evita elegir carpetas de nuevo si tenías proyectos abiertos la última vez.",
  settingsSafetyTitle: "Seguridad",
  safetyConfirmLabel: "Confirmar antes de cerrar un proyecto",
  safetyConfirmDescription: "Pregunta antes de cerrar el proyecto abierto, por si fue un clic accidental.",
  settingsLanguageTitle: "Idioma",
  settingsLanguageDescription: '"Sistema" usa el idioma de tu sistema operativo.',
  languageAriaLabel: "Idioma",
};

export const settingsTranslations = { en, es } as const;
