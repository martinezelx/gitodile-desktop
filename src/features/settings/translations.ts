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
  settingsFormatsTitle: string;
  settingsFormatsDescription: string;
  formatsDateLabel: string;
  formatsNumberLabel: string;
  formatsSystem: string;
  formatsDateIso: string;
  formatsDateDayFirst: string;
  formatsDateMonthFirst: string;
  formatsNumberCommaDot: string;
  formatsNumberDotComma: string;
  formatsNumberSpaceComma: string;
  formatsPreviewLabel: string;
  settingsGitTitle: string;
  settingsGitNeedsAttention: string;
  themeAriaLabel: string;
  settingsThemeDescription: string;
  themeMatchDevice: string;
  settingsThemeOfficialTitle: string;
  settingsThemeMoreTitle: string;
  themeSchemeAuto: string;
  themeSchemeLight: string;
  themeSchemeDark: string;
  settingsMotionTitle: string;
  reduceMotionLabel: string;
  reduceMotionDescription: string;
  settingsGeneralTitle: string;
  settingsNotificationsTitle: string;
  settingsNotificationsWhileAwayTitle: string;
  notificationsEnableLabel: string;
  notificationsEnableDescription: string;
  notificationsEventsTitle: string;
  notificationsEventsDescription: string;
  notificationsEventTeamChangesLabel: string;
  notificationsEventTeamChangesDescription: string;
  notificationsEventCheckFailedLabel: string;
  notificationsEventCheckFailedDescription: string;
  notificationsEventPublishedLabel: string;
  notificationsEventPublishedDescription: string;
  notificationsEventAppUpdateLabel: string;
  notificationsEventAppUpdateDescription: string;
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
  settingsDefaultBranchTitle: string;
  settingsDefaultBranchDescription: string;
  defaultBranchOtherLabel: string;
  defaultBranchCustomLabel: string;
  defaultBranchPlaceholder: string;
  defaultBranchUnset: string;
  defaultBranchSaved: string;
  defaultBranchCouldntSave: string;
  settingsHooksTitle: string;
  hooksLabel: string;
  hooksDescription: string;
  hooksSkippedHint: string;
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
  settingsUpdatesTitle: string;
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
  remoteCheckLabel: string;
  remoteCheckDescription: string;
  remoteCheckIntervalLabel: string;
  remoteCheckNever: string;
  remoteCheckMinutesShort: (minutes: number) => string;
  remoteCheckHourShort: string;
  remoteCheckEveryMinutes: (minutes: number) => string;
  remoteCheckEveryHour: string;
  remoteCheckCustomShort: string;
  remoteCheckCustom: string;
  remoteCheckCustomValueLabel: string;
  remoteCheckCustomUnitLabel: string;
  remoteCheckUnitMinutes: string;
  remoteCheckUnitHours: string;
  remoteCheckEveryHours: (hours: number) => string;
  /** A bare quantity with its unit, pluralized — "1 minute", "24 hours" — so
   * the range message below can name its bounds without inventing grammar. */
  remoteCheckMinutesUnit: (minutes: number) => string;
  remoteCheckHoursUnit: (hours: number) => string;
  remoteCheckOutOfRange: (min: string, max: string) => string;
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
  settingsFormatsTitle: "Dates and numbers",
  settingsFormatsDescription: "How dates and numbers are written, whichever language you read in.",
  formatsDateLabel: "Date format",
  formatsNumberLabel: "Number format",
  formatsSystem: "System",
  formatsDateIso: "Year first",
  formatsDateDayFirst: "Day first",
  formatsDateMonthFirst: "Month first",
  formatsNumberCommaDot: "Comma groups",
  formatsNumberDotComma: "Dot groups",
  formatsNumberSpaceComma: "Space groups",
  formatsPreviewLabel: "Example",
  settingsGitTitle: "Git",
  settingsGitNeedsAttention: "Git needs attention",
  themeAriaLabel: "Theme",
  settingsThemeDescription: "Pick a theme, or match your device.",
  themeMatchDevice: "Match device",
  settingsThemeOfficialTitle: "Official",
  settingsThemeMoreTitle: "More themes",
  themeSchemeAuto: "follows your device",
  themeSchemeLight: "light theme",
  themeSchemeDark: "dark theme",
  settingsMotionTitle: "Motion",
  reduceMotionLabel: "Reduce motion",
  reduceMotionDescription:
    "Turn off interface transitions and animations. Your system motion preference is always respected.",
  settingsGeneralTitle: "General",
  settingsNotificationsTitle: "Notifications",
  settingsNotificationsWhileAwayTitle: "While you're doing something else",
  notificationsEnableLabel: "Enable notifications",
  notificationsEnableDescription:
    "Keeps a short record of what happened to your open projects, under the bell beside the window buttons. Nothing leaves the app and no operating-system notifications are shown.",
  notificationsEventsTitle: "What you'll be told about",
  notificationsEventsDescription:
    "Only what happens on its own, plus a receipt for what you publish. GitOdile never interrupts you about something you are already watching happen.",
  notificationsEventTeamChangesLabel: "Newer project versions",
  notificationsEventTeamChangesDescription:
    "An automatic check found versions someone else has published. Nothing on your computer has changed yet, and the notification takes you straight to the review flow.",
  notificationsEventCheckFailedLabel: "A check that couldn't connect",
  notificationsEventCheckFailedDescription:
    "An automatic check could not reach the remote project — usually no network, a VPN, or credentials. Without this you would never learn it happened: the next successful check quietly replaces the failure in the status bar.",
  notificationsEventPublishedLabel: "Changes you published",
  notificationsEventPublishedDescription:
    "A receipt, so “did that go through?” still has an answer an hour later. It is recorded already read and never marks the bell.",
  notificationsEventAppUpdateLabel: "A newer version of the app",
  notificationsEventAppUpdateDescription:
    "The startup check found a newer version. Nothing is downloaded until you say so; the notification opens the update dialog.",
  settingsGitInstallationTitle: "Installation",
  settingsGitInstalledVersionLabel: "Installed version",
  settingsGeneralChecking: "Checking…",
  settingsGeneralUpdateAvailable: "Update available",
  settingsGeneralGitMissing: "Git isn't installed or isn't available to GitOdile.",
  settingsGeneralGitUnusable: "Git was found, but it isn't working correctly.",
  settingsGeneralGitCheckFailed: "GitOdile couldn't check the Git installation.",
  settingsGeneralCheckAgain: "Check again",
  settingsGeneralInstallGit: "Install Git",
  settingsGeneralUpdate: "Update",
  gitStartingInstaller: "Starting…",
  gitInstallerLaunched: "Installer launched — this can take a moment to appear. Reopen GitOdile once it finishes.",
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
  gitUpdateLaunched: "Update launched — this can take a moment to appear. Reopen GitOdile once it finishes.",
  gitUpdateAlreadyStarting: "The Git update is already starting.",
  gitCouldntStart: "Couldn't start that.",
  settingsDefaultBranchTitle: "Default version line",
  settingsDefaultBranchDescription:
    "The name given to the first version line of every new project. Saved in your Git configuration, so other Git tools use it too.",
  defaultBranchOtherLabel: "Other",
  defaultBranchCustomLabel: "Version-line name",
  defaultBranchPlaceholder: "main",
  defaultBranchUnset:
    "Not saved to your Git configuration yet, so other Git tools still use their own default. Pick an option to save it for all of them.",
  defaultBranchSaved: "Default version line saved.",
  defaultBranchCouldntSave: "GitOdile couldn't save that name.",
  settingsHooksTitle: "Git hooks",
  hooksLabel: "Run Git hooks when saving and publishing",
  hooksDescription:
    "Hooks are scripts a project can run automatically when a version is saved or published. This setting applies to every project you open in GitOdile.",
  hooksSkippedHint:
    "While this is off, GitOdile skips them in every project, so checks a project would normally run do not run. No project's configuration is changed either way.",
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
  settingsUpdatesTitle: "Updates",
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
  settingsWatchingTitle: "Automatic refresh",
  watchingLabel: "Keep project screens up to date",
  watchingDescription: "Updates open projects when files or saved versions change. Turn it off only if a large or network project becomes slow.",
  remoteCheckLabel: "Check remote project changes",
  remoteCheckDescription: "Uses the network for the active project. You can still check manually.",
  remoteCheckIntervalLabel: "Automatic remote check frequency",
  remoteCheckNever: "Never",
  remoteCheckMinutesShort: (minutes) => `${minutes} min`,
  remoteCheckHourShort: "1 hr",
  remoteCheckEveryMinutes: (minutes) => `Every ${minutes} minutes`,
  remoteCheckEveryHour: "Every hour",
  remoteCheckCustomShort: "Custom",
  remoteCheckCustom: "A custom frequency",
  remoteCheckCustomValueLabel: "How often to check",
  remoteCheckCustomUnitLabel: "Time unit",
  remoteCheckUnitMinutes: "minutes",
  remoteCheckUnitHours: "hours",
  remoteCheckEveryHours: (hours) => (hours === 1 ? "Every hour" : `Every ${hours} hours`),
  remoteCheckMinutesUnit: (minutes) => (minutes === 1 ? "1 minute" : `${minutes} minutes`),
  remoteCheckHoursUnit: (hours) => (hours === 1 ? "1 hour" : `${hours} hours`),
  remoteCheckOutOfRange: (min, max) => `Choose between ${min} and ${max}.`,
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
  settingsFormatsTitle: "Fechas y números",
  settingsFormatsDescription: "Cómo se escriben las fechas y los números, sea cual sea tu idioma.",
  formatsDateLabel: "Formato de fecha",
  formatsNumberLabel: "Formato de número",
  formatsSystem: "Sistema",
  formatsDateIso: "Año primero",
  formatsDateDayFirst: "Día primero",
  formatsDateMonthFirst: "Mes primero",
  formatsNumberCommaDot: "Grupos con coma",
  formatsNumberDotComma: "Grupos con punto",
  formatsNumberSpaceComma: "Grupos con espacio",
  formatsPreviewLabel: "Ejemplo",
  settingsGitTitle: "Git",
  settingsGitNeedsAttention: "Git necesita atención",
  themeAriaLabel: "Tema",
  settingsThemeDescription: "Elige un tema o usa el del dispositivo.",
  themeMatchDevice: "Usar el del dispositivo",
  settingsThemeOfficialTitle: "Oficiales",
  settingsThemeMoreTitle: "Más temas",
  themeSchemeAuto: "sigue tu dispositivo",
  themeSchemeLight: "tema claro",
  themeSchemeDark: "tema oscuro",
  settingsMotionTitle: "Movimiento",
  reduceMotionLabel: "Reducir movimiento",
  reduceMotionDescription:
    "Desactiva las transiciones y animaciones de la interfaz. La preferencia de movimiento del sistema se respeta siempre.",
  settingsGeneralTitle: "General",
  settingsNotificationsTitle: "Notificaciones",
  settingsNotificationsWhileAwayTitle: "Mientras estás en otra cosa",
  notificationsEnableLabel: "Activar notificaciones",
  notificationsEnableDescription:
    "Guarda un breve registro de lo que les ha pasado a tus proyectos abiertos, en la campana que hay junto a los botones de la ventana. Nada sale de la aplicación y no se muestran notificaciones del sistema.",
  notificationsEventsTitle: "De qué te avisa",
  notificationsEventsDescription:
    "Solo de lo que ocurre por su cuenta, más un recibo de lo que publicas. GitOdile nunca te avisa de algo que ya estás viendo suceder.",
  notificationsEventTeamChangesLabel: "Versiones nuevas del proyecto",
  notificationsEventTeamChangesDescription:
    "Una comprobación automática encontró versiones que ha publicado otra persona. En tu equipo no ha cambiado nada todavía, y la notificación te lleva directamente al flujo de revisión.",
  notificationsEventCheckFailedLabel: "Una comprobación que no pudo conectar",
  notificationsEventCheckFailedDescription:
    "Una comprobación automática no pudo llegar al proyecto remoto: normalmente falta de red, una VPN o las credenciales. Sin esto no llegarías a enterarte, porque la siguiente comprobación correcta sustituye el fallo en la barra de estado sin decir nada.",
  notificationsEventPublishedLabel: "Los cambios que publicas",
  notificationsEventPublishedDescription:
    "Un recibo, para que «¿aquello se envió?» siga teniendo respuesta una hora después. Se registra ya leído y nunca marca la campana.",
  notificationsEventAppUpdateLabel: "Una versión nueva de la aplicación",
  notificationsEventAppUpdateDescription:
    "La comprobación al iniciar encontró una versión más nueva. No se descarga nada hasta que tú lo digas; la notificación abre el diálogo de actualización.",
  settingsGitInstallationTitle: "Instalación",
  settingsGitInstalledVersionLabel: "Versión instalada",
  settingsGeneralChecking: "Comprobando…",
  settingsGeneralUpdateAvailable: "Actualización disponible",
  settingsGeneralGitMissing: "Git no está instalado o no está disponible para GitOdile.",
  settingsGeneralGitUnusable: "Git se encontró, pero no funciona correctamente.",
  settingsGeneralGitCheckFailed: "GitOdile no pudo comprobar la instalación de Git.",
  settingsGeneralCheckAgain: "Comprobar de nuevo",
  settingsGeneralInstallGit: "Instalar Git",
  settingsGeneralUpdate: "Actualizar",
  gitStartingInstaller: "Iniciando…",
  gitInstallerLaunched:
    "Instalador iniciado — puede tardar un momento en aparecer. Vuelve a abrir GitOdile cuando termine.",
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
    "Actualización iniciada — puede tardar un momento en aparecer. Vuelve a abrir GitOdile cuando termine.",
  gitUpdateAlreadyStarting: "La actualización de Git ya se está iniciando.",
  gitCouldntStart: "No se pudo iniciar eso.",
  settingsDefaultBranchTitle: "Línea de versión predeterminada",
  settingsDefaultBranchDescription:
    "El nombre de la primera línea de versión de cada proyecto nuevo. Se guarda en tu configuración de Git, así que otras herramientas de Git también lo usan.",
  defaultBranchOtherLabel: "Otro",
  defaultBranchCustomLabel: "Nombre de la línea de versión",
  defaultBranchPlaceholder: "main",
  defaultBranchUnset:
    "Todavía no está guardado en tu configuración de Git, así que otras herramientas siguen usando su propio valor. Elige una opción para guardarlo para todas.",
  defaultBranchSaved: "Línea de versión predeterminada guardada.",
  defaultBranchCouldntSave: "GitOdile no pudo guardar ese nombre.",
  settingsHooksTitle: "Hooks de Git",
  hooksLabel: "Ejecutar los hooks de Git al guardar y publicar",
  hooksDescription:
    "Los hooks son scripts que un proyecto puede ejecutar automáticamente al guardar o publicar una versión. Este ajuste se aplica a todos los proyectos que abras en GitOdile.",
  hooksSkippedHint:
    "Mientras esté desactivado, GitOdile los omite en todos los proyectos, así que las comprobaciones que un proyecto haría normalmente no se ejecutan. En ningún caso se modifica la configuración de ningún proyecto.",
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
  settingsUpdatesTitle: "Actualizaciones",
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
  settingsWatchingTitle: "Refresco automático",
  watchingLabel: "Mantener actualizadas las pantallas del proyecto",
  watchingDescription: "Actualiza los proyectos abiertos cuando cambian archivos o versiones guardadas. Desactívalo solo si un proyecto grande o de red va lento.",
  remoteCheckLabel: "Comprobar cambios del proyecto remoto",
  remoteCheckDescription: "Usa la red para el proyecto activo. También puedes comprobarlo manualmente.",
  remoteCheckIntervalLabel: "Frecuencia de comprobación remota automática",
  remoteCheckNever: "Nunca",
  remoteCheckMinutesShort: (minutes) => `${minutes} min`,
  remoteCheckHourShort: "1 h",
  remoteCheckEveryMinutes: (minutes) => `Cada ${minutes} minutos`,
  remoteCheckEveryHour: "Cada hora",
  remoteCheckCustomShort: "Personalizada",
  remoteCheckCustom: "Una frecuencia personalizada",
  remoteCheckCustomValueLabel: "Cada cuánto comprobar",
  remoteCheckCustomUnitLabel: "Unidad de tiempo",
  remoteCheckUnitMinutes: "minutos",
  remoteCheckUnitHours: "horas",
  remoteCheckEveryHours: (hours) => (hours === 1 ? "Cada hora" : `Cada ${hours} horas`),
  remoteCheckMinutesUnit: (minutes) => (minutes === 1 ? "1 minuto" : `${minutes} minutos`),
  remoteCheckHoursUnit: (hours) => (hours === 1 ? "1 hora" : `${hours} horas`),
  remoteCheckOutOfRange: (min, max) => `Elige un valor entre ${min} y ${max}.`,
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
