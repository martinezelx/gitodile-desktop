export interface AppTranslations {
  titlebarOpenCommandPalette: string;
  titlebarJumpToHint: string;
  titlebarMoreActions: string;
  titlebarOpenProject: string;
  titlebarReloadWindow: string;
  titlebarReloadBlocked: string;
  titlebarReportIssue: string;
  titlebarReportIssueTitle: string;
  titlebarKeyboardShortcuts: string;
  shortcutsDialogTitle: string;
  shortcutsOpenPalette: string;
  shortcutsNextProject: string;
  shortcutsPreviousProject: string;
  shortcutsCloseDialogs: string;
  titlebarGoBack: string;
  titlebarGoForward: string;
  titlebarHistoryControls: string;
  alphaBadge: string;
  alphaBadgeAriaLabel: string;
  windowMinimize: string;
  windowMaximize: string;
  windowClose: string;
  windowControls: string;
  brandTagline: string;
  sidebarCollapse: string;
  sidebarExpand: string;
  navProjectAriaLabel: string;
  navApplicationAriaLabel: string;
  navOverview: string;
  navChanges: string;
  navChangesTitle: string;
  navVersionLines: string;
  navVersionLinesTitle: string;
  navHistory: string;
  navHistoryTitle: string;
  navRecovery: string;
  navRecoveryTitle: string;
  navSettings: string;
  paletteAriaLabel: string;
  palettePlaceholder: string;
  paletteNoMatches: string;
  commandGoOverview: string;
  commandGoVersionLines: string;
  commandNewVersionLine: string;
  commandGoSettings: string;
  commandUseSystemTheme: string;
  commandUseLightTheme: string;
  commandUseDarkTheme: string;
  commandCloseActiveProject: string;
  commandSwitchToProject: (name: string) => string;
  projectSwitcherAriaLabel: string;
  projectSwitchToLabel: (name: string) => string;
  projectSwitcherCloseLabel: (name: string) => string;
  projectSwitcherUnsavedIndicator: string;
  projectSwitcherOperationIndicator: string;
  projectSwitcherErrorIndicator: string;
  projectSwitcherCollapsedTrigger: string;
  projectSwitcherSwitchBlockedHint: string;
  projectSwitcherEmptyHint: string;
  projectSwitcherActiveAnnouncement: (name: string) => string;
  projectSwitcherMutationBlocked: (name: string) => string;
  projectSwitcherCloseBlocked: (name: string) => string;
  settingsAppearanceTitle: string;
  settingsAppearanceDescription: string;
  settingsDialogDescription: string;
  settingsSectionsAriaLabel: string;
  settingsGitTitle: string;
  settingsGitDescription: string;
  settingsGitInstallationDescription: string;
  themeAriaLabel: string;
  themeLight: string;
  themeDark: string;
  titlebarSwitchToLightTheme: string;
  titlebarSwitchToDarkTheme: string;
  settingsGeneralTitle: string;
  settingsGeneralDescription: string;
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
  identitySave: string;
  identitySaving: string;
  identitySaved: string;
  identityModify: string;
  identityCouldntSave: string;
  settingsStartupTitle: string;
  settingsStartupDescription: string;
  startupReopenLabel: string;
  startupReopenDescription: string;
  startupRestoreSkippedNotice: (count: number) => string;
  settingsSafetyTitle: string;
  settingsSafetyDescription: string;
  safetyConfirmLabel: string;
  safetyConfirmDescription: string;
  settingsLanguageTitle: string;
  settingsLanguageDescription: string;
  languageAriaLabel: string;
  aboutGitOdrile: string;
  aboutHeading: string;
  aboutDescription: string;
  aboutFooterMadeWith: string;
  closeConfirmTitle: string;
  closeConfirmBodyGeneric: string;
  closeConfirmBodyNamed: (name: string) => string;
}

const en: AppTranslations = {
  titlebarOpenCommandPalette: "Open command palette",
  titlebarJumpToHint: "Jump to a view or action",
  titlebarMoreActions: "More actions",
  titlebarOpenProject: "Open project",
  titlebarReloadWindow: "Reload window",
  titlebarReloadBlocked: "Finish the current project operation before reloading.",
  titlebarReportIssue: "Report an issue",
  titlebarReportIssueTitle: "Report an issue — Coming soon",
  titlebarKeyboardShortcuts: "Keyboard shortcuts",
  shortcutsDialogTitle: "Keyboard shortcuts",
  shortcutsOpenPalette: "Open command palette",
  shortcutsNextProject: "Next project",
  shortcutsPreviousProject: "Previous project",
  shortcutsCloseDialogs: "Close dialogs and menus",
  titlebarGoBack: "Go back",
  titlebarGoForward: "Go forward",
  titlebarHistoryControls: "Navigation history",
  alphaBadge: "alpha",
  alphaBadgeAriaLabel: "Development version: alpha",
  windowMinimize: "Minimize window",
  windowMaximize: "Maximize or restore window",
  windowClose: "Close window",
  windowControls: "Window controls",
  brandTagline: "Git without the bite",
  sidebarCollapse: "Collapse sidebar",
  sidebarExpand: "Expand sidebar",
  navProjectAriaLabel: "Project navigation",
  navApplicationAriaLabel: "Application",
  navOverview: "Overview",
  navChanges: "Changes",
  navChangesTitle: "Changes — Open a project first",
  navVersionLines: "Version lines",
  navVersionLinesTitle: "Version lines — Open a project first",
  navHistory: "History",
  navHistoryTitle: "History — Coming soon",
  navRecovery: "Recovery",
  navRecoveryTitle: "Recovery — Coming soon",
  navSettings: "Settings",
  paletteAriaLabel: "Command palette",
  palettePlaceholder: "Jump to a view or action…",
  paletteNoMatches: "No matching commands",
  commandGoOverview: "Go to Overview",
  commandGoVersionLines: "Go to Version lines",
  commandNewVersionLine: "New version line",
  commandGoSettings: "Go to Settings",
  commandUseSystemTheme: "Use system theme",
  commandUseLightTheme: "Use light theme",
  commandUseDarkTheme: "Use dark theme",
  commandCloseActiveProject: "Close active project",
  commandSwitchToProject: (name) => `Switch to ${name}`,
  projectSwitcherAriaLabel: "Open projects",
  projectSwitchToLabel: (name) => `Switch to ${name}`,
  projectSwitcherCloseLabel: (name) => `Close ${name}`,
  projectSwitcherUnsavedIndicator: "Has unsaved changes",
  projectSwitcherOperationIndicator: "Operation in progress",
  projectSwitcherErrorIndicator: "Needs attention",
  projectSwitcherCollapsedTrigger: "Switch project",
  projectSwitcherSwitchBlockedHint: "Finish the open dialog before switching projects",
  projectSwitcherEmptyHint: "Your open projects will show up here.",
  projectSwitcherActiveAnnouncement: (name) => `${name} is now the active project.`,
  projectSwitcherMutationBlocked: (name) =>
    `Wait for the operation in ${name} to finish before starting another one in a linked workspace.`,
  projectSwitcherCloseBlocked: (name) =>
    `Wait for the operation in ${name} to finish. You can keep working in another project meanwhile.`,
  settingsAppearanceTitle: "Appearance",
  settingsAppearanceDescription: 'Choose how GitOdrile looks. "System" follows your OS setting automatically.',
  settingsDialogDescription: "Adjust how GitOdrile looks, behaves, and works with Git.",
  settingsSectionsAriaLabel: "Settings sections",
  settingsGitTitle: "Git",
  settingsGitDescription: "Manage the Git installation, updates, and identity used to save versions.",
  settingsGitInstallationDescription: "Installed version, availability, and updates.",
  themeAriaLabel: "Theme",
  themeLight: "Light",
  themeDark: "Dark",
  titlebarSwitchToLightTheme: "Switch to light theme",
  titlebarSwitchToDarkTheme: "Switch to dark theme",
  settingsGeneralTitle: "General",
  settingsGeneralDescription: "Choose what GitOdrile does when it starts.",
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
  identitySave: "Save",
  identitySaving: "Saving…",
  identitySaved: "Saved.",
  identityModify: "Edit identity",
  identityCouldntSave: "Couldn't save that.",
  settingsStartupTitle: "Startup",
  settingsStartupDescription: "Control what happens when GitOdrile launches.",
  startupReopenLabel: "Reopen projects from the previous session",
  startupReopenDescription: "Skip picking folders again if you had projects open last time.",
  startupRestoreSkippedNotice: (count) =>
    count === 1
      ? "1 project from your last session couldn't be reopened."
      : `${count} projects from your last session couldn't be reopened.`,
  settingsSafetyTitle: "Safety",
  settingsSafetyDescription: "Extra confirmations before you can lose your place.",
  safetyConfirmLabel: "Confirm before closing a project",
  safetyConfirmDescription: "Ask before clearing the open project, in case that was a misclick.",
  settingsLanguageTitle: "Language",
  settingsLanguageDescription: 'Choose GitOdrile\'s language. "System" follows your operating system\'s language.',
  languageAriaLabel: "Language",
  aboutGitOdrile: "About",
  aboutHeading: "Git without the bite.",
  aboutDescription: "Turns version control into clear, worry-free steps.",
  aboutFooterMadeWith: "Made with ♥ by Luis M. Martínez.",
  closeConfirmTitle: "Close this project?",
  closeConfirmBodyGeneric: "The project stays exactly as it is on disk. You can reopen it anytime.",
  closeConfirmBodyNamed: (name) => `"${name}" stays exactly as it is on disk. You can reopen it anytime.`,
};

const es: AppTranslations = {
  titlebarOpenCommandPalette: "Abrir la paleta de comandos",
  titlebarJumpToHint: "Ir a una vista o acción",
  titlebarMoreActions: "Más acciones",
  titlebarOpenProject: "Abrir proyecto",
  titlebarReloadWindow: "Recargar ventana",
  titlebarReloadBlocked: "Termina la operación actual del proyecto antes de recargar.",
  titlebarReportIssue: "Reportar un problema",
  titlebarReportIssueTitle: "Reportar un problema — Próximamente",
  titlebarKeyboardShortcuts: "Atajos de teclado",
  shortcutsDialogTitle: "Atajos de teclado",
  shortcutsOpenPalette: "Abrir la paleta de comandos",
  shortcutsNextProject: "Proyecto siguiente",
  shortcutsPreviousProject: "Proyecto anterior",
  shortcutsCloseDialogs: "Cerrar diálogos y menús",
  titlebarGoBack: "Atrás",
  titlebarGoForward: "Adelante",
  titlebarHistoryControls: "Historial de navegación",
  alphaBadge: "alpha",
  alphaBadgeAriaLabel: "Versión en desarrollo: alpha",
  windowMinimize: "Minimizar ventana",
  windowMaximize: "Maximizar o restaurar ventana",
  windowClose: "Cerrar ventana",
  windowControls: "Controles de ventana",
  brandTagline: "Git sin mordiscos",
  sidebarCollapse: "Colapsar barra lateral",
  sidebarExpand: "Expandir barra lateral",
  navProjectAriaLabel: "Navegación del proyecto",
  navApplicationAriaLabel: "Aplicación",
  navOverview: "Resumen",
  navChanges: "Cambios",
  navChangesTitle: "Cambios — Abre un proyecto primero",
  navVersionLines: "Líneas de versión",
  navVersionLinesTitle: "Líneas de versión — Abre un proyecto primero",
  navHistory: "Historial",
  navHistoryTitle: "Historial — Próximamente",
  navRecovery: "Recuperación",
  navRecoveryTitle: "Recuperación — Próximamente",
  navSettings: "Configuración",
  paletteAriaLabel: "Paleta de comandos",
  palettePlaceholder: "Ir a una vista o acción…",
  paletteNoMatches: "No hay coincidencias",
  commandGoOverview: "Ir a Resumen",
  commandGoVersionLines: "Ir a Líneas de versión",
  commandNewVersionLine: "Nueva línea de versión",
  commandGoSettings: "Ir a Configuración",
  commandUseSystemTheme: "Usar el tema del sistema",
  commandUseLightTheme: "Usar el tema claro",
  commandUseDarkTheme: "Usar el tema oscuro",
  commandCloseActiveProject: "Cerrar el proyecto activo",
  commandSwitchToProject: (name) => `Cambiar a ${name}`,
  projectSwitcherAriaLabel: "Proyectos abiertos",
  projectSwitchToLabel: (name) => `Cambiar a ${name}`,
  projectSwitcherCloseLabel: (name) => `Cerrar ${name}`,
  projectSwitcherUnsavedIndicator: "Tiene cambios sin guardar",
  projectSwitcherOperationIndicator: "Operación en curso",
  projectSwitcherErrorIndicator: "Necesita atención",
  projectSwitcherCollapsedTrigger: "Cambiar de proyecto",
  projectSwitcherSwitchBlockedHint: "Termina el diálogo abierto antes de cambiar de proyecto",
  projectSwitcherEmptyHint: "Aquí aparecerán tus proyectos abiertos.",
  projectSwitcherActiveAnnouncement: (name) => `${name} es ahora el proyecto activo.`,
  projectSwitcherMutationBlocked: (name) =>
    `Espera a que termine la operación de ${name} antes de iniciar otra en un espacio de trabajo vinculado.`,
  projectSwitcherCloseBlocked: (name) =>
    `Espera a que termine la operación de ${name}. Mientras tanto puedes seguir trabajando en otro proyecto.`,
  settingsAppearanceTitle: "Apariencia",
  settingsAppearanceDescription:
    'Elige el aspecto de GitOdrile. "Sistema" sigue automáticamente el ajuste de tu sistema operativo.',
  settingsDialogDescription: "Ajusta el aspecto y el comportamiento de GitOdrile y cómo trabaja con Git.",
  settingsSectionsAriaLabel: "Secciones de configuración",
  settingsGitTitle: "Git",
  settingsGitDescription: "Gestiona la instalación, las actualizaciones y la identidad de Git.",
  settingsGitInstallationDescription: "Versión instalada, disponibilidad y actualizaciones.",
  themeAriaLabel: "Tema",
  themeLight: "Claro",
  themeDark: "Oscuro",
  titlebarSwitchToLightTheme: "Cambiar a tema claro",
  titlebarSwitchToDarkTheme: "Cambiar a tema oscuro",
  settingsGeneralTitle: "General",
  settingsGeneralDescription: "Elige qué hace GitOdrile cuando se inicia.",
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
  identitySave: "Guardar",
  identitySaving: "Guardando…",
  identitySaved: "Guardado.",
  identityModify: "Modificar identidad",
  identityCouldntSave: "No se pudo guardar eso.",
  settingsStartupTitle: "Inicio",
  settingsStartupDescription: "Controla qué ocurre cuando se abre GitOdrile.",
  startupReopenLabel: "Reabrir los proyectos de la última sesión",
  startupReopenDescription: "Evita elegir carpetas de nuevo si tenías proyectos abiertos la última vez.",
  startupRestoreSkippedNotice: (count) =>
    count === 1
      ? "1 proyecto de tu última sesión no se pudo volver a abrir."
      : `${count} proyectos de tu última sesión no se pudieron volver a abrir.`,
  settingsSafetyTitle: "Seguridad",
  settingsSafetyDescription: "Confirmaciones adicionales antes de perder tu lugar.",
  safetyConfirmLabel: "Confirmar antes de cerrar un proyecto",
  safetyConfirmDescription: "Pregunta antes de cerrar el proyecto abierto, por si fue un clic accidental.",
  settingsLanguageTitle: "Idioma",
  settingsLanguageDescription: 'Elige el idioma de GitOdrile. "Sistema" usa el idioma de tu sistema operativo.',
  languageAriaLabel: "Idioma",
  aboutGitOdrile: "Acerca de",
  aboutHeading: "Git sin mordiscos.",
  aboutDescription: "Convierte el control de versiones en pasos claros y sin sustos.",
  aboutFooterMadeWith: "Hecho con ♥ por Luis M. Martínez.",
  closeConfirmTitle: "¿Cerrar este proyecto?",
  closeConfirmBodyGeneric: "El proyecto se mantiene exactamente igual en el disco. Puedes volver a abrirlo cuando quieras.",
  closeConfirmBodyNamed: (name) => `"${name}" se mantiene exactamente igual en el disco. Puedes volver a abrirlo cuando quieras.`,
};

export const appTranslations = { en, es } as const;
