export interface SettingsTranslations {
  settingsInterfaceTitle: string;
  settingsNavigationTitle: string;
  settingsNavigationDestinationsTitle: string;
  settingsNavigationDestinationsDescription: string;
  settingsNavigationMovedToMore: string;
  settingsNavigationReorderLabel: string;
  settingsNavigationMoveUpLabel: string;
  settingsNavigationMoveDownLabel: string;
  settingsNavigationOrderPosition: string;
  settingsNavigationOrderOf: string;
  settingsNavigationAppearanceTitle: string;
  settingsNavigationAppearanceDescription: string;
  settingsNavigationIconsAndText: string;
  settingsNavigationIconsAndTextDescription: string;
  settingsNavigationIconsOnly: string;
  settingsNavigationIconsOnlyDescription: string;
  settingsSectionsAriaLabel: string;
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
  settingsWatchingTitle: string;
  watchingLabel: string;
  watchingDescription: string;
  settingsSafetyTitle: string;
  safetyConfirmLabel: string;
  safetyConfirmDescription: string;
  safetyConfirmDiscardLabel: string;
  safetyConfirmDiscardDescription: string;
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
  readingCodeFontTitle: string;
  readingCodeFontLabel: string;
  readingCodeFontDescription: string;
  readingCodeFontAtkinson: string;
  readingCodeFontJetBrains: string;
  readingCodeFontPlex: string;
  readingCodeFontSystem: string;
}

const en: SettingsTranslations = {
  settingsInterfaceTitle: "Interface",
  settingsNavigationTitle: "Navigation",
  settingsNavigationDestinationsTitle: "Sections shown in the bar",
  settingsNavigationDestinationsDescription:
    "Choose visible sections and drag or use the arrows to reorder them. Some move to More in shorter windows.",
  settingsNavigationMovedToMore: "Available from More",
  settingsNavigationReorderLabel: "Reorder",
  settingsNavigationMoveUpLabel: "Move up",
  settingsNavigationMoveDownLabel: "Move down",
  settingsNavigationOrderPosition: "New position",
  settingsNavigationOrderOf: "of",
  settingsNavigationAppearanceTitle: "Appearance",
  settingsNavigationAppearanceDescription: "Choose whether the bar shows labels.",
  settingsNavigationIconsAndText: "Icons and text",
  settingsNavigationIconsAndTextDescription: "Show labels for quicker recognition.",
  settingsNavigationIconsOnly: "Icons only",
  settingsNavigationIconsOnlyDescription: "Hide labels for a more compact bar.",
  settingsSectionsAriaLabel: "Settings sections",
  settingsGitTitle: "Git",
  settingsGitNeedsAttention: "Git needs attention",
  themeAriaLabel: "Theme",
  settingsThemeDescription: '"System" matches your device.',
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
  settingsIdentityDescription: "Your name and email are added to saved versions through your global Git settings.",
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
    "Choose how Git stores line endings to avoid whole-file changes across operating systems.",
  lineEndingsWindowsLabel: "Save the shared format, keep the Windows one on your computer",
  lineEndingsWindowsDescription: "Store the shared format in Git and keep Windows format on disk.",
  lineEndingsNormalizeLabel: "Save the shared format, leave your files as they are",
  lineEndingsNormalizeDescription: "Keep files on disk unchanged; convert only what Git stores.",
  lineEndingsKeepLabel: "Don't convert anything",
  lineEndingsKeepDescription:
    "Store files exactly as they are. Mixed systems may show whole-file changes.",
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
  startupReopenDescription: "Restore projects that were open when you quit.",
  settingsWatchingTitle: "Live updates",
  watchingLabel: "Watch open projects for changes",
  watchingDescription: "Update screens as files change. Disable for very large projects or network drives.",
  settingsSafetyTitle: "Safety",
  safetyConfirmLabel: "Confirm before closing a project",
  safetyConfirmDescription: "Ask before closing an open project.",
  safetyConfirmDiscardLabel: "Confirm before discarding changes",
  safetyConfirmDiscardDescription: "Ask before discarding work. You can still undo afterwards.",
  settingsLanguageTitle: "Language",
  settingsLanguageDescription: '"System" matches your device language.',
  languageAriaLabel: "Language",
  settingsReadingTitle: "Reading",
  settingsReadingDiffsTitle: "Diffs",
  settingsReadingDescription: "Choose how file changes are displayed.",
  readingWrapLabel: "Wrap long lines",
  readingWrapDescription: "Off keeps each line on one row with horizontal scrolling.",
  readingIgnoreWhitespaceLabel: "Ignore whitespace-only changes",
  readingIgnoreWhitespaceDescription: "Treat spacing-only changes as unchanged.",
  readingSyntaxLabel: "Syntax highlighting",
  readingSyntaxDescription: "Color code by language. Off uses plain text.",
  readingTabWidthLabel: "Tab width",
  readingTabWidthDescription: "Display tabs as 2, 4, or 8 spaces.",
  readingCodeFontTitle: "Code font",
  readingCodeFontLabel: "Code font",
  readingCodeFontDescription:
    "Used for diffs in Changes, History, and pending versions. All options are monospaced.",
  readingCodeFontAtkinson: "Hyperlegible",
  readingCodeFontJetBrains: "JetBrains",
  readingCodeFontPlex: "Plex",
  readingCodeFontSystem: "System",
};

const es: SettingsTranslations = {
  settingsInterfaceTitle: "Interfaz",
  settingsNavigationTitle: "Navegación",
  settingsNavigationDestinationsTitle: "Secciones visibles en la barra",
  settingsNavigationDestinationsDescription:
    "Elige las secciones visibles y ordénalas con el asa o las flechas. Algunas pasan a Más en ventanas bajas.",
  settingsNavigationMovedToMore: "Disponible desde Más",
  settingsNavigationReorderLabel: "Reordenar",
  settingsNavigationMoveUpLabel: "Subir",
  settingsNavigationMoveDownLabel: "Bajar",
  settingsNavigationOrderPosition: "Nueva posición",
  settingsNavigationOrderOf: "de",
  settingsNavigationAppearanceTitle: "Apariencia",
  settingsNavigationAppearanceDescription: "Elige si la barra muestra etiquetas.",
  settingsNavigationIconsAndText: "Iconos y texto",
  settingsNavigationIconsAndTextDescription: "Muestra etiquetas para reconocer cada sección.",
  settingsNavigationIconsOnly: "Solo iconos",
  settingsNavigationIconsOnlyDescription: "Oculta las etiquetas para compactar la barra.",
  settingsSectionsAriaLabel: "Secciones de configuración",
  settingsGitTitle: "Git",
  settingsGitNeedsAttention: "Git necesita atención",
  themeAriaLabel: "Tema",
  settingsThemeDescription: '"Sistema" usa el tema de tu dispositivo.',
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
    "Tu nombre y correo se añaden a las versiones guardadas mediante la configuración global de Git.",
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
    "Elige cómo guarda Git los finales de línea para evitar cambios de archivos completos entre sistemas.",
  lineEndingsWindowsLabel: "Guardar en el formato común y dejar el de Windows en tu equipo",
  lineEndingsWindowsDescription: "Guarda el formato compartido en Git y conserva el de Windows en el disco.",
  lineEndingsNormalizeLabel: "Guardar en el formato común y no tocar tus archivos",
  lineEndingsNormalizeDescription: "No cambia los archivos del disco; solo convierte lo que guarda Git.",
  lineEndingsKeepLabel: "No convertir nada",
  lineEndingsKeepDescription:
    "Guarda los archivos tal cual. Entre sistemas puede mostrar cambios en el archivo completo.",
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
  startupReopenDescription: "Recupera los proyectos abiertos al cerrar la aplicación.",
  settingsWatchingTitle: "Actualización en vivo",
  watchingLabel: "Vigilar los proyectos abiertos",
  watchingDescription: "Actualiza las pantallas al cambiar archivos. Desactívalo en proyectos enormes o unidades de red.",
  settingsSafetyTitle: "Seguridad",
  safetyConfirmLabel: "Confirmar antes de cerrar un proyecto",
  safetyConfirmDescription: "Pregunta antes de cerrar un proyecto abierto.",
  safetyConfirmDiscardLabel: "Confirmar antes de descartar cambios",
  safetyConfirmDiscardDescription: "Pregunta antes de descartar trabajo. Aún puedes deshacerlo después.",
  settingsLanguageTitle: "Idioma",
  settingsLanguageDescription: '"Sistema" usa el idioma de tu dispositivo.',
  languageAriaLabel: "Idioma",
  settingsReadingTitle: "Lectura",
  settingsReadingDiffsTitle: "Cambios",
  settingsReadingDescription: "Elige cómo se muestran los cambios en archivos.",
  readingWrapLabel: "Ajustar líneas largas",
  readingWrapDescription: "Desactivado mantiene cada línea en una fila con desplazamiento horizontal.",
  readingIgnoreWhitespaceLabel: "Ignorar cambios solo de espacios",
  readingIgnoreWhitespaceDescription: "Trata como iguales los cambios solo de espacios o sangría.",
  readingSyntaxLabel: "Resaltado de sintaxis",
  readingSyntaxDescription: "Colorea el código según el lenguaje. Desactivado usa texto plano.",
  readingTabWidthLabel: "Ancho de tabulación",
  readingTabWidthDescription: "Muestra cada tabulación como 2, 4 u 8 espacios.",
  readingCodeFontTitle: "Fuente del código",
  readingCodeFontLabel: "Fuente del código",
  readingCodeFontDescription:
    "Se usa en Cambios, Historial y versiones pendientes. Todas las opciones son monoespaciadas.",
  readingCodeFontAtkinson: "Hyperlegible",
  readingCodeFontJetBrains: "JetBrains",
  readingCodeFontPlex: "Plex",
  readingCodeFontSystem: "Sistema",
};

export const settingsTranslations = { en, es } as const;
