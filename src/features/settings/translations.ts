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
  settingsSaving: string;
  identitySaved: string;
  identityCouldntSave: string;
  identityInvalidEmail: string;
  identityUnsavedTitle: string;
  identityUnsavedBody: string;
  identityKeepEditing: string;
  identityDiscardAndClose: string;
  settingsLineEndingsTitle: string;
  settingsLineEndingsDescription: string;
  lineEndingsWindowsLabel: string;
  lineEndingsWindowsDescription: string;
  lineEndingsNormalizeLabel: string;
  lineEndingsNormalizeDescription: string;
  lineEndingsKeepLabel: string;
  lineEndingsKeepDescription: string;
  lineEndingsRecommended: string;
  lineEndingsFromGlobal: string;
  lineEndingsFromProject: string;
  lineEndingsFromNowhere: string;
  lineEndingsProjectAttributes: string;
  lineEndingsEolNote: string;
  lineEndingsSaved: string;
  lineEndingsCouldntSave: string;
  settingsStartupTitle: string;
  startupReopenLabel: string;
  startupReopenDescription: string;
  settingsSafetyTitle: string;
  safetyConfirmLabel: string;
  safetyConfirmDescription: string;
  settingsLanguageTitle: string;
  settingsLanguageDescription: string;
  languageAriaLabel: string;
  settingsReadingTitle: string;
  settingsReadingDiffsTitle: string;
  settingsReadingDescription: string;
  readingWrapLabel: string;
  readingWrapDescription: string;
  readingIgnoreWhitespaceLabel: string;
  readingIgnoreWhitespaceDescription: string;
  readingSyntaxLabel: string;
  readingSyntaxDescription: string;
  readingTabWidthLabel: string;
  readingTabWidthDescription: string;
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
  settingsSaving: "Saving…",
  identitySaved: "Saved.",
  identityCouldntSave: "Couldn't save that.",
  identityInvalidEmail: "That doesn't look like an email address.",
  identityUnsavedTitle: "Your identity isn't saved yet",
  identityUnsavedBody: "Fill in both fields with a valid email, or close and discard what you typed.",
  identityKeepEditing: "Keep editing",
  identityDiscardAndClose: "Discard and close",
  settingsLineEndingsTitle: "Line endings",
  settingsLineEndingsDescription:
    "Every line of a text file ends with invisible characters, and Windows uses different ones from macOS and Linux. This is why a file nobody touched can show up as changed from top to bottom.",
  lineEndingsWindowsLabel: "Save the shared format, keep the Windows one on your computer",
  lineEndingsWindowsDescription:
    "Files are saved into the project the way teammates expect, and stay in Windows format on your disk so other Windows tools read them correctly.",
  lineEndingsNormalizeLabel: "Save the shared format, leave your files as they are",
  lineEndingsNormalizeDescription:
    "Nothing on your computer is rewritten. Only what goes into the project is converted to the shared format.",
  lineEndingsKeepLabel: "Don't convert anything",
  lineEndingsKeepDescription:
    "Files are saved exactly as they are on disk. Fine on your own; in a mixed team it is what produces diffs where every line looks changed.",
  lineEndingsRecommended: "Recommended here",
  lineEndingsFromGlobal: "This comes from your Git settings and applies to every project.",
  lineEndingsFromProject:
    "This project sets its own, so your general choice doesn't apply while you work here.",
  lineEndingsFromNowhere: "Nothing is set, so Git falls back to its own default for this system.",
  lineEndingsProjectAttributes:
    "This project ships line-ending rules of its own (a .gitattributes file). For the files those rules cover, they win over the choice above.",
  lineEndingsEolNote: "A second setting also fixes what gets written to disk (core.eol):",
  lineEndingsSaved: "Saved.",
  lineEndingsCouldntSave: "Couldn't save that.",
  settingsStartupTitle: "Startup",
  startupReopenLabel: "Reopen projects from the previous session",
  startupReopenDescription: "Skip picking folders again if you had projects open last time.",
  settingsSafetyTitle: "Safety",
  safetyConfirmLabel: "Confirm before closing a project",
  safetyConfirmDescription: "Ask before clearing the open project, in case that was a misclick.",
  settingsLanguageTitle: "Language",
  settingsLanguageDescription: '"System" follows your operating system\'s language.',
  languageAriaLabel: "Language",
  settingsReadingTitle: "Reading",
  settingsReadingDiffsTitle: "Diffs",
  settingsReadingDescription: "How changed files are shown when you review them.",
  readingWrapLabel: "Wrap long lines",
  readingWrapDescription: "Off puts each line on one row and scrolls sideways instead.",
  readingIgnoreWhitespaceLabel: "Ignore whitespace-only changes",
  readingIgnoreWhitespaceDescription: "A line that only changed its spacing or indentation reads as unchanged.",
  readingSyntaxLabel: "Syntax highlighting",
  readingSyntaxDescription: "Highlight code by language. Off shows plain text.",
  readingTabWidthLabel: "Tab width",
  readingTabWidthDescription: "How many spaces wide a tab character looks.",
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
  settingsSaving: "Guardando…",
  identitySaved: "Guardado.",
  identityCouldntSave: "No se pudo guardar eso.",
  identityInvalidEmail: "Esto no parece una dirección de correo.",
  identityUnsavedTitle: "Tu identidad aún no está guardada",
  identityUnsavedBody:
    "Rellena ambos campos con un correo válido, o cierra y descarta lo que has escrito.",
  identityKeepEditing: "Seguir editando",
  identityDiscardAndClose: "Descartar y cerrar",
  settingsLineEndingsTitle: "Finales de línea",
  settingsLineEndingsDescription:
    "Cada línea de un archivo de texto termina con caracteres invisibles, y Windows usa unos distintos de macOS y Linux. Por eso un archivo que nadie ha tocado puede aparecer como modificado de arriba abajo.",
  lineEndingsWindowsLabel: "Guardar en el formato común y dejar el de Windows en tu equipo",
  lineEndingsWindowsDescription:
    "Los archivos se guardan en el proyecto como esperan tus compañeros, y en tu disco se quedan en formato Windows para que otras herramientas los lean bien.",
  lineEndingsNormalizeLabel: "Guardar en el formato común y no tocar tus archivos",
  lineEndingsNormalizeDescription:
    "No se reescribe nada en tu equipo. Solo se convierte lo que entra en el proyecto.",
  lineEndingsKeepLabel: "No convertir nada",
  lineEndingsKeepDescription:
    "Los archivos se guardan tal cual están en el disco. A solas no pasa nada; en un equipo mixto es lo que produce cambios donde parece que se modificaron todas las líneas.",
  lineEndingsRecommended: "Recomendado aquí",
  lineEndingsFromGlobal: "Viene de tu configuración de Git y se aplica a todos los proyectos.",
  lineEndingsFromProject:
    "Este proyecto tiene el suyo propio, así que tu elección general no se aplica mientras trabajas aquí.",
  lineEndingsFromNowhere:
    "No hay nada configurado, así que Git usa el valor por defecto de este sistema.",
  lineEndingsProjectAttributes:
    "Este proyecto trae sus propias reglas de finales de línea (un archivo .gitattributes). Para los archivos que cubren esas reglas, mandan ellas por encima de la opción de arriba.",
  lineEndingsEolNote: "Otro ajuste fija además lo que se escribe en el disco (core.eol):",
  lineEndingsSaved: "Guardado.",
  lineEndingsCouldntSave: "No se pudo guardar eso.",
  settingsStartupTitle: "Inicio",
  startupReopenLabel: "Reabrir los proyectos de la última sesión",
  startupReopenDescription: "Evita elegir carpetas de nuevo si tenías proyectos abiertos la última vez.",
  settingsSafetyTitle: "Seguridad",
  safetyConfirmLabel: "Confirmar antes de cerrar un proyecto",
  safetyConfirmDescription: "Pregunta antes de cerrar el proyecto abierto, por si fue un clic accidental.",
  settingsLanguageTitle: "Idioma",
  settingsLanguageDescription: '"Sistema" usa el idioma de tu sistema operativo.',
  languageAriaLabel: "Idioma",
  settingsReadingTitle: "Lectura",
  settingsReadingDiffsTitle: "Cambios",
  settingsReadingDescription: "Cómo se muestran los archivos modificados al revisarlos.",
  readingWrapLabel: "Ajustar líneas largas",
  readingWrapDescription: "Al desactivarlo cada línea ocupa una fila y se desplaza en horizontal.",
  readingIgnoreWhitespaceLabel: "Ignorar cambios solo de espacios",
  readingIgnoreWhitespaceDescription: "Una línea que solo cambió su espaciado o sangría se lee como sin cambios.",
  readingSyntaxLabel: "Resaltado de sintaxis",
  readingSyntaxDescription: "Colorea el código según el lenguaje. Al desactivarlo se ve texto plano.",
  readingTabWidthLabel: "Ancho de tabulación",
  readingTabWidthDescription: "Cuántos espacios de ancho aparenta un carácter de tabulación.",
};

export const settingsTranslations = { en, es } as const;
