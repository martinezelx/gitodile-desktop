export interface SettingsTranslations {
  /** How a blocked app update names unsaved changes in this dialog. */
  settingsInstallBlockerLabel: string;
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
  settingsGitHubTitle: string;
  settingsGitLabTitle: string;
  settingsGitToolDescription: string;
  gitOfficialInstructions: string;
  gitGuidanceFailed: string;
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
  settingsProjectIconsTitle: string;
  settingsProjectIconsDescription: string;
  settingsProjectIconsAriaLabel: string;
  projectIconsStyleTechnology: string;
  projectIconsStyleInitials: string;
  projectIconsStyleRandom: string;
  projectIconsStyleTechnologyHint: string;
  projectIconsStyleInitialsHint: string;
  projectIconsStyleRandomHint: string;
  settingsGeneralTitle: string;
  settingsNotificationsTitle: string;
  settingsNotificationsWhileAwayTitle: string;
  notificationsEnableLabel: string;
  notificationsEnableDescription: string;
  notificationsEventsTitle: string;
  /** The list's title while notifications are off: the list stays, dimmed,
   * so what the switch would give is still visible. */
  notificationsEventsOffTitle: string;
  /** Beside an event recorded as already read, which never lights the bell. */
  notificationsSilentTag: string;
  notificationsSilentHint: string;
  notificationsEventTeamChangesLabel: string;
  notificationsEventTeamChangesDescription: string;
  notificationsEventCheckFailedLabel: string;
  notificationsEventCheckFailedDescription: string;
  notificationsEventPublishedLabel: string;
  notificationsEventPublishedDescription: string;
  notificationsEventAppUpdateLabel: string;
  notificationsEventAppUpdateDescription: string;
  settingsGitToolTitle: string;
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
  ghTitle: string;
  ghDescription: string;
  ghMissing: string;
  ghUnusable: string;
  ghCheckFailed: string;
  ghInstall: string;
  ghGuidanceOpened: string;
  ghActionFailed: string;
  ghInstallerLaunched: string;
  ghUpdateUnavailable: string;
  ghInstructions: string;
  ghUpdateChecking: string;
  ghUpdateUpToDate: string;
  ghUpdateCheckFailed: string;
  ghUpdateCheckTimedOut: string;
  /** The shared installation row, used by Git and by the optional GitHub CLI. */
  ghName: string;
  ghChipMissing: string;
  ghChipUnusable: string;
  ghChipCheckFailed: string;
  ghChipInstalled: string;
  gitChipMissing: string;
  gitChipUnusable: string;
  gitChipCheckFailed: string;
  gitChipInstalled: string;
  settingsToolChipChecking: string;
  settingsToolSearching: string;
  settingsToolUpdateAvailableDetail: string;
  settingsInstallGuided: string;
  settingsInstallHintWindows: string;
  settingsInstallHintGuided: string;
  settingsUpdateHintWindows: string;
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
  settingsConsoleTitle: string;
  settingsConsoleDescription: string;
  consoleSettingsAutocompleteLabel: string;
  consoleSettingsAutocompleteDescription: string;
  consoleSettingsWelcomeLabel: string;
  consoleSettingsWelcomeDescription: string;
  consoleSettingsCursorLabel: string;
  consoleSettingsCursorDescription: string;
  consoleSettingsTextSizeLabel: string;
  consoleSettingsTextSizeDescription: string;
  consoleSettingsTextSizes: Record<"small" | "normal" | "large", string>;
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
  settingsInstallBlockerLabel: "Settings",
  settingsInterfaceTitle: "Interface",
  settingsNavigationTitle: "Navigation",
  settingsNavigationDestinationsTitle: "Sections in the bar",
  settingsNavigationDestinationsDescription: "Drag to reorder. Sections you turn off, and some in short windows, go to More.",
  settingsNavigationMovedToMore: "In More",
  settingsNavigationReorderLabel: "Reorder",
  settingsNavigationMoveUpLabel: "Move up",
  settingsNavigationMoveDownLabel: "Move down",
  settingsNavigationOrderPosition: "New position",
  settingsNavigationOrderOf: "of",
  settingsNavigationAppearanceTitle: "Appearance",
  settingsNavigationAppearanceDescription: "Choose whether the bar shows labels.",
  settingsNavigationIconsAndText: "Icons and text",
  settingsNavigationIconsAndTextDescription: "Easier to recognize.",
  settingsNavigationIconsOnly: "Icons only",
  settingsNavigationIconsOnlyDescription: "A more compact bar.",
  settingsSectionsAriaLabel: "Settings sections",
  settingsFormatsTitle: "Dates and numbers",
  settingsFormatsDescription: "How dates and numbers are written, in any language.",
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
  settingsGitHubTitle: "GitHub",
  settingsGitLabTitle: "GitLab",
  settingsGitToolDescription: "Git saves your projects' versions; GitOdile uses this computer's installation.",
  gitOfficialInstructions: "Official Git instructions",
  gitGuidanceFailed: "Couldn't open the official Git instructions. Try again.",
  settingsGitNeedsAttention: "Git needs attention",
  themeAriaLabel: "Theme",
  settingsThemeDescription: "Pick a theme, or follow your system.",
  themeMatchDevice: "System",
  settingsThemeOfficialTitle: "Official",
  settingsThemeMoreTitle: "More themes",
  themeSchemeAuto: "light or dark to match your system",
  themeSchemeLight: "light theme",
  themeSchemeDark: "dark theme",
  settingsMotionTitle: "Motion",
  reduceMotionLabel: "Reduce motion",
  reduceMotionDescription: "Turn off transitions and animations, and your system setting always applies too.",
  settingsProjectIconsTitle: "Project icons",
  settingsProjectIconsDescription: "The default for all projects, and each project can change it in its settings.",
  settingsProjectIconsAriaLabel: "Project icon style",
  projectIconsStyleTechnology: "Technology",
  projectIconsStyleInitials: "Initials",
  projectIconsStyleRandom: "Random",
  projectIconsStyleTechnologyHint: "The detected logo.",
  projectIconsStyleInitialsHint: "The project's two letters.",
  projectIconsStyleRandomHint: "A random emoji for each project.",
  settingsGeneralTitle: "General",
  settingsNotificationsTitle: "Notifications",
  settingsNotificationsWhileAwayTitle: "While you're doing something else",
  notificationsEnableLabel: "Enable notifications",
  notificationsEnableDescription: "A short log under the bell that never leaves the app.",
  notificationsEventsTitle: "You'll be told when",
  notificationsEventsOffTitle: "Turn them on to be told when",
  notificationsSilentTag: "Silent",
  notificationsSilentHint: "Recorded as read, so the bell stays quiet",
  notificationsEventTeamChangesLabel: "Newer project versions are available",
  notificationsEventTeamChangesDescription: "Found by an automatic check, and you decide when to get them.",
  notificationsEventCheckFailedLabel: "An automatic check can't connect",
  notificationsEventCheckFailedDescription: "Usually the network, a VPN or credentials.",
  notificationsEventPublishedLabel: "You publish changes",
  notificationsEventPublishedDescription: "A receipt of what you sent.",
  notificationsEventAppUpdateLabel: "A newer version of the app is out",
  notificationsEventAppUpdateDescription: "Found at startup, and nothing downloads on its own.",
  settingsGitToolTitle: "Git on your computer",
  settingsGitInstalledVersionLabel: "Installed version",
  settingsGeneralChecking: "Checking…",
  settingsGeneralUpdateAvailable: "Update available",
  settingsGeneralGitMissing: "Git isn't installed, or GitOdile can't find it.",
  settingsGeneralGitUnusable: "Git was found, but it isn't working.",
  settingsGeneralGitCheckFailed: "Couldn't check Git.",
  settingsGeneralCheckAgain: "Check again",
  settingsGeneralInstallGit: "Install Git",
  settingsGeneralUpdate: "Update",
  gitStartingInstaller: "Starting…",
  ghTitle: "GitHub on your computer",
  ghDescription: "Needed to connect through the browser, while tokens work without it. Installing it doesn't sign you in.",
  ghMissing: "Not installed on this computer.",
  ghUnusable: "It was found, but it is not responding as expected.",
  ghCheckFailed: "Couldn't check whether it is installed.",
  ghInstall: "Install",
  ghGuidanceOpened: "The official GitHub CLI instructions were opened.",
  ghActionFailed: "The GitHub CLI action could not be completed. You can open the official instructions and try again.",
  ghInstallerLaunched: "The installer has opened. Reopen GitOdile when it finishes.",
  ghUpdateUnavailable: "Automatic update checks are unavailable here. Use the official instructions to update GitHub CLI.",
  ghInstructions: "Official GitHub CLI guide",
  ghUpdateChecking: "Checking for a GitHub CLI update…",
  ghUpdateUpToDate: "GitHub CLI is up to date.",
  ghUpdateCheckFailed: "Couldn't check for a GitHub CLI update. Try again later.",
  ghUpdateCheckTimedOut: "The GitHub CLI update check took too long. Try again later.",
  ghName: "GitHub tool",
  ghChipMissing: "Not installed",
  ghChipUnusable: "Not responding",
  ghChipCheckFailed: "Unchecked",
  ghChipInstalled: "Installed",
  gitChipMissing: "Not installed",
  gitChipUnusable: "Not working",
  gitChipCheckFailed: "Unchecked",
  gitChipInstalled: "Installed",
  settingsToolChipChecking: "Checking",
  settingsToolSearching: "Searching…",
  settingsToolUpdateAvailableDetail: "A newer version is available.",
  settingsInstallGuided: "How to install",
  settingsInstallHintWindows: "The Windows installer opens and may ask for administrator permission.",
  settingsInstallHintGuided: "The instructions open in your browser.",
  settingsUpdateHintWindows: "The Windows installer opens to update it.",
  gitInstallerLaunched: "Installer started and may take a moment to appear. Reopen GitOdile when it's done.",
  gitInstallerAlreadyStarting: "The installer is already starting.",
  gitInstallerFailedWithGuidance: "The installer couldn't start, so the official Windows instructions were opened.",
  gitWindowsGuidanceOpened: "winget isn't available, so the official Windows instructions were opened.",
  gitMacosGuidanceOpened: "The official macOS install options were opened. Choose the one that suits your Mac.",
  gitLinuxGuidanceOpened: "The official Linux instructions were opened. Use your distribution's package manager.",
  gitUpdateNotChecked: "Not checked against the Windows package source yet.",
  gitUpdateCheck: "Check for updates",
  gitUpdateChecking: "Checking for a Git update…",
  gitUpdateUpToDate: "Git is up to date.",
  gitUpdateCheckerUnavailable: "Git updates can't be checked automatically on this system.",
  gitUpdateCheckFailed: "Couldn't check for a Git update. Try again later.",
  gitUpdateCheckTimedOut: "The check took too long and was stopped.",
  gitUpdateStarting: "Starting…",
  gitUpdateLaunched: "Update started and may take a moment to appear. Reopen GitOdile when it's done.",
  gitUpdateAlreadyStarting: "The Git update is already starting.",
  gitCouldntStart: "Couldn't start it.",
  settingsDefaultBranchTitle: "Default version line",
  settingsDefaultBranchDescription: "The first line's name in new projects, which other Git tools use too.",
  defaultBranchOtherLabel: "Other",
  defaultBranchCustomLabel: "Version line name",
  defaultBranchPlaceholder: "main",
  defaultBranchUnset: "Not set in Git yet, so other tools use their own default. Pick one to set it for all of them.",
  defaultBranchSaved: "Default version line saved.",
  defaultBranchCouldntSave: "Couldn't save that name.",
  settingsHooksTitle: "Git hooks",
  hooksLabel: "Run Git hooks when saving and publishing",
  hooksDescription: "Hooks are scripts a project runs when you save or publish, and this applies to every project.",
  hooksSkippedHint: "While off, GitOdile skips hooks in every project, so their checks don't run, but no project settings are changed.",
  settingsIdentityTitle: "Identity",
  settingsIdentityDescription: "Your name and email go on every version you save and are stored in your global Git settings.",
  identityNameLabel: "Name",
  identityEmailLabel: "Email",
  identityNamePlaceholder: "Ada Lovelace",
  identityEmailPlaceholder: "ada@example.com",
  settingsSaving: "Saving…",
  identitySaved: "Saved.",
  identityCouldntSave: "Couldn't save it.",
  identityInvalidEmail: "That doesn't look like an email address.",
  identityUnsavedTitle: "Your identity isn't saved yet",
  identityUnsavedBody: "Fill in both fields with a valid email, or close and discard your changes.",
  identityKeepEditing: "Keep editing",
  identityDiscardAndClose: "Discard and close",
  settingsLineEndingsTitle: "Line endings",
  settingsUpdatesTitle: "Updates",
  settingsLineEndingsDescription: "How Git stores line endings, so whole files don't look changed across systems.",
  lineEndingsWindowsLabel: "Store the shared format, use Windows format on disk",
  lineEndingsWindowsDescription: "Converts both ways, best for Windows.",
  lineEndingsNormalizeLabel: "Store the shared format, leave files on disk as they are",
  lineEndingsNormalizeDescription: "Converts only what Git stores.",
  lineEndingsKeepLabel: "Don't convert anything",
  lineEndingsKeepDescription: "Stores files exactly as they are, so mixed systems may see whole files change.",
  lineEndingsRecommended: "Recommended here",
  lineEndingsFromGlobal: "From your Git settings, so it applies to every project.",
  lineEndingsFromProject: "This project sets its own, so your choice doesn't apply here.",
  lineEndingsFromNowhere: "Not set, so Git uses its default for this system.",
  lineEndingsProjectAttributes: "This project has its own line-ending rules (.gitattributes), which take priority for the files they cover.",
  lineEndingsEolNote: "Another setting also controls what's written to disk (core.eol):",
  lineEndingsSaved: "Saved.",
  lineEndingsCouldntSave: "Couldn't save it.",
  settingsStartupTitle: "Startup",
  startupReopenLabel: "Reopen projects from your last session",
  startupReopenDescription: "Restores the projects that were open when you quit.",
  settingsWatchingTitle: "Automatic refresh",
  watchingLabel: "Keep project screens up to date",
  watchingDescription: "Refreshes when files or versions change, so turn it off only if a large or network project gets slow.",
  remoteCheckLabel: "Check remote project changes",
  remoteCheckDescription: "Uses the network, and you can also check by hand.",
  remoteCheckIntervalLabel: "How often to check the remote",
  remoteCheckNever: "Never",
  remoteCheckMinutesShort: (minutes) => `${minutes} min`,
  remoteCheckHourShort: "1 hr",
  remoteCheckEveryMinutes: (minutes) => `Every ${minutes} minutes`,
  remoteCheckEveryHour: "Every hour",
  remoteCheckCustomShort: "Custom",
  remoteCheckCustom: "Custom frequency",
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
  safetyConfirmDiscardDescription: "Ask before discarding work, which you can still undo afterwards.",
  settingsLanguageTitle: "Language",
  settingsLanguageDescription: "“System” follows your device's language.",
  languageAriaLabel: "Language",
  settingsReadingTitle: "Reading",
  settingsConsoleTitle: "Console",
  settingsConsoleDescription: "How the project console looks and helps you type. Shared by every project.",
  consoleSettingsAutocompleteLabel: "Suggest shortcuts",
  consoleSettingsAutocompleteDescription: "Complete names in grey as you type and list the ones that match. Tab accepts.",
  consoleSettingsWelcomeLabel: "Show the welcome",
  consoleSettingsWelcomeDescription: "Open an empty console with the mascot and a summary of the project.",
  consoleSettingsCursorLabel: "Blinking cursor",
  consoleSettingsCursorDescription: "The cursor never blinks while reduced motion is on.",
  consoleSettingsTextSizeLabel: "Text size",
  consoleSettingsTextSizeDescription: "The size of the console text and output.",
  consoleSettingsTextSizes: { small: "Small", normal: "Normal", large: "Large" },
  settingsReadingDiffsTitle: "Diffs",
  settingsReadingDescription: "How file changes are shown.",
  readingWrapLabel: "Wrap long lines",
  readingWrapDescription: "When off, long lines scroll sideways.",
  readingIgnoreWhitespaceLabel: "Ignore spacing-only changes",
  readingIgnoreWhitespaceDescription: "Hide changes that only add or remove spaces.",
  readingSyntaxLabel: "Syntax highlighting",
  readingSyntaxDescription: "Color code by language.",
  readingTabWidthLabel: "Tab width",
  readingTabWidthDescription: "Show tabs as 2, 4 or 8 spaces.",
  readingCodeFontTitle: "Code font",
  readingCodeFontLabel: "Code font",
  readingCodeFontDescription: "Used for code in Changes, History and publishing, and all options are monospaced.",
  readingCodeFontAtkinson: "Hyperlegible",
  readingCodeFontJetBrains: "JetBrains",
  readingCodeFontPlex: "Plex",
  readingCodeFontSystem: "System",
};

const es: SettingsTranslations = {
  settingsInstallBlockerLabel: "Ajustes",
  settingsInterfaceTitle: "Interfaz",
  settingsNavigationTitle: "Navegación",
  settingsNavigationDestinationsTitle: "Secciones de la barra",
  settingsNavigationDestinationsDescription: "Arrastra para reordenar. Las que apagues, y algunas en ventanas bajas, van a Más.",
  settingsNavigationMovedToMore: "En Más",
  settingsNavigationReorderLabel: "Reordenar",
  settingsNavigationMoveUpLabel: "Subir",
  settingsNavigationMoveDownLabel: "Bajar",
  settingsNavigationOrderPosition: "Nueva posición",
  settingsNavigationOrderOf: "de",
  settingsNavigationAppearanceTitle: "Apariencia",
  settingsNavigationAppearanceDescription: "Elige si la barra muestra etiquetas.",
  settingsNavigationIconsAndText: "Iconos y texto",
  settingsNavigationIconsAndTextDescription: "Más fácil de reconocer.",
  settingsNavigationIconsOnly: "Solo iconos",
  settingsNavigationIconsOnlyDescription: "Una barra más compacta.",
  settingsSectionsAriaLabel: "Secciones de ajustes",
  settingsFormatsTitle: "Fechas y números",
  settingsFormatsDescription: "Cómo se escriben las fechas y los números, en cualquier idioma.",
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
  settingsGitHubTitle: "GitHub",
  settingsGitLabTitle: "GitLab",
  settingsGitToolDescription: "Git guarda las versiones de tus proyectos; GitOdile usa la instalación de este ordenador.",
  gitOfficialInstructions: "Instrucciones oficiales de Git",
  gitGuidanceFailed: "No se pudieron abrir las instrucciones oficiales de Git. Vuelve a intentarlo.",
  settingsGitNeedsAttention: "Git necesita atención",
  themeAriaLabel: "Tema",
  settingsThemeDescription: "Elige un tema o usa el del sistema.",
  themeMatchDevice: "Sistema",
  settingsThemeOfficialTitle: "Oficiales",
  settingsThemeMoreTitle: "Más temas",
  themeSchemeAuto: "claro u oscuro según el sistema",
  themeSchemeLight: "tema claro",
  themeSchemeDark: "tema oscuro",
  settingsMotionTitle: "Movimiento",
  reduceMotionLabel: "Reducir movimiento",
  reduceMotionDescription: "Desactiva transiciones y animaciones, y el ajuste del sistema también se respeta siempre.",
  settingsProjectIconsTitle: "Iconos de proyecto",
  settingsProjectIconsDescription: "El valor por defecto para todos los proyectos, y cada uno puede cambiarlo en sus ajustes.",
  settingsProjectIconsAriaLabel: "Estilo del icono de proyecto",
  projectIconsStyleTechnology: "Tecnología",
  projectIconsStyleInitials: "Iniciales",
  projectIconsStyleRandom: "Aleatorio",
  projectIconsStyleTechnologyHint: "El logo detectado.",
  projectIconsStyleInitialsHint: "Las dos letras del proyecto.",
  projectIconsStyleRandomHint: "Un emoji al azar para cada proyecto.",
  settingsGeneralTitle: "General",
  settingsNotificationsTitle: "Notificaciones",
  settingsNotificationsWhileAwayTitle: "Mientras haces otra cosa",
  notificationsEnableLabel: "Activar notificaciones",
  notificationsEnableDescription: "Un breve registro bajo la campana que nunca sale de la aplicación.",
  notificationsEventsTitle: "Te avisará de",
  notificationsEventsOffTitle: "Actívalas para que te avise de",
  notificationsSilentTag: "Silencioso",
  notificationsSilentHint: "Se guarda como leído, así que la campana no se enciende",
  notificationsEventTeamChangesLabel: "Versiones nuevas del proyecto",
  notificationsEventTeamChangesDescription: "Lo detecta una comprobación automática y tú decides cuándo traerlas.",
  notificationsEventCheckFailedLabel: "Comprobaciones automáticas fallidas",
  notificationsEventCheckFailedDescription: "Suele ser la red, una VPN o las credenciales.",
  notificationsEventPublishedLabel: "Cambios que publicas",
  notificationsEventPublishedDescription: "Un recibo de lo que enviaste.",
  notificationsEventAppUpdateLabel: "Versiones nuevas de la aplicación",
  notificationsEventAppUpdateDescription: "Se detecta al iniciar y no se descarga nada solo.",
  settingsGitToolTitle: "Git en tu ordenador",
  settingsGitInstalledVersionLabel: "Versión instalada",
  settingsGeneralChecking: "Comprobando…",
  settingsGeneralUpdateAvailable: "Actualización disponible",
  settingsGeneralGitMissing: "Git no está instalado o GitOdile no lo encuentra.",
  settingsGeneralGitUnusable: "Se encontró Git, pero no funciona.",
  settingsGeneralGitCheckFailed: "No se pudo comprobar Git.",
  settingsGeneralCheckAgain: "Comprobar de nuevo",
  settingsGeneralInstallGit: "Instalar Git",
  settingsGeneralUpdate: "Actualizar",
  gitStartingInstaller: "Iniciando…",
  ghTitle: "GitHub en tu ordenador",
  ghDescription: "Necesaria para conectar mediante el navegador, mientras que los tokens funcionan sin ella. Instalarla no inicia sesión.",
  ghMissing: "No está instalada en este ordenador.",
  ghUnusable: "Se encontró, pero no responde como se espera.",
  ghCheckFailed: "No se pudo comprobar si está instalada.",
  ghInstall: "Instalar",
  ghGuidanceOpened: "Se abrieron las instrucciones oficiales de GitHub CLI.",
  ghActionFailed: "No se pudo completar la acción de GitHub CLI. Puedes abrir las instrucciones oficiales y volver a intentarlo.",
  ghInstallerLaunched: "Se ha abierto el instalador. Vuelve a abrir GitOdile al terminar.",
  ghUpdateUnavailable: "Aquí no están disponibles las comprobaciones automáticas de actualizaciones. Usa las instrucciones oficiales para actualizar GitHub CLI.",
  ghInstructions: "Guía oficial de GitHub CLI",
  ghUpdateChecking: "Buscando una actualización de GitHub CLI…",
  ghUpdateUpToDate: "GitHub CLI está al día.",
  ghUpdateCheckFailed: "No se pudo buscar una actualización de GitHub CLI. Inténtalo más tarde.",
  ghUpdateCheckTimedOut: "La búsqueda de una actualización de GitHub CLI tardó demasiado. Inténtalo más tarde.",
  ghName: "Herramienta de GitHub",
  ghChipMissing: "No instalada",
  ghChipUnusable: "No responde",
  ghChipCheckFailed: "Sin comprobar",
  ghChipInstalled: "Instalada",
  gitChipMissing: "No instalado",
  gitChipUnusable: "No funciona",
  gitChipCheckFailed: "Sin comprobar",
  gitChipInstalled: "Instalado",
  settingsToolChipChecking: "Comprobando",
  settingsToolSearching: "Buscando…",
  settingsToolUpdateAvailableDetail: "Hay una versión más reciente.",
  settingsInstallGuided: "Cómo instalar",
  settingsInstallHintWindows: "Se abrirá el instalador de Windows y puede pedir permisos.",
  settingsInstallHintGuided: "Se abrirán las instrucciones en tu navegador.",
  settingsUpdateHintWindows: "Se abrirá el instalador de Windows para actualizar.",
  gitInstallerLaunched: "El instalador se ha iniciado y puede tardar un momento en aparecer. Vuelve a abrir GitOdile cuando termine.",
  gitInstallerAlreadyStarting: "El instalador ya se está iniciando.",
  gitInstallerFailedWithGuidance: "El instalador no pudo iniciarse, así que se abrieron las instrucciones oficiales para Windows.",
  gitWindowsGuidanceOpened: "winget no está disponible, así que se abrieron las instrucciones oficiales para Windows.",
  gitMacosGuidanceOpened: "Se abrieron las opciones oficiales de instalación para macOS. Elige la que mejor encaje con tu Mac.",
  gitLinuxGuidanceOpened: "Se abrieron las instrucciones oficiales para Linux. Usa el gestor de paquetes de tu distribución.",
  gitUpdateNotChecked: "Aún sin comprobar con la fuente de paquetes de Windows.",
  gitUpdateCheck: "Buscar actualizaciones",
  gitUpdateChecking: "Buscando una actualización de Git…",
  gitUpdateUpToDate: "Git está al día.",
  gitUpdateCheckerUnavailable: "En este sistema no se pueden buscar actualizaciones de Git automáticamente.",
  gitUpdateCheckFailed: "No se pudo buscar una actualización de Git. Inténtalo más tarde.",
  gitUpdateCheckTimedOut: "La comprobación tardó demasiado y se detuvo.",
  gitUpdateStarting: "Iniciando…",
  gitUpdateLaunched: "La actualización se ha iniciado y puede tardar un momento en aparecer. Vuelve a abrir GitOdile cuando termine.",
  gitUpdateAlreadyStarting: "La actualización de Git ya se está iniciando.",
  gitCouldntStart: "No se pudo iniciar.",
  settingsDefaultBranchTitle: "Línea de versión predeterminada",
  settingsDefaultBranchDescription: "El nombre de la primera línea en proyectos nuevos, que otras herramientas de Git también usan.",
  defaultBranchOtherLabel: "Otro",
  defaultBranchCustomLabel: "Nombre de la línea de versión",
  defaultBranchPlaceholder: "main",
  defaultBranchUnset: "Aún no está configurado en Git, así que otras herramientas usan su propio valor. Elige uno para fijarlo en todas.",
  defaultBranchSaved: "Línea de versión predeterminada guardada.",
  defaultBranchCouldntSave: "No se pudo guardar ese nombre.",
  settingsHooksTitle: "Hooks de Git",
  hooksLabel: "Ejecutar los hooks de Git al guardar y publicar",
  hooksDescription: "Los hooks son scripts que un proyecto ejecuta al guardar o publicar, y esto se aplica a todos los proyectos.",
  hooksSkippedHint: "Desactivado, GitOdile omite los hooks en todos los proyectos y sus comprobaciones no se ejecutan, pero no se cambia la configuración de ningún proyecto.",
  settingsIdentityTitle: "Identidad",
  settingsIdentityDescription: "Tu nombre y correo aparecen en cada versión que guardas y se guardan en tu configuración global de Git.",
  identityNameLabel: "Nombre",
  identityEmailLabel: "Correo electrónico",
  identityNamePlaceholder: "Ada Lovelace",
  identityEmailPlaceholder: "ada@example.com",
  settingsSaving: "Guardando…",
  identitySaved: "Guardado.",
  identityCouldntSave: "No se pudo guardar.",
  identityInvalidEmail: "Eso no parece un correo electrónico.",
  identityUnsavedTitle: "Tu identidad aún no está guardada",
  identityUnsavedBody: "Rellena los dos campos con un correo válido, o cierra y descarta los cambios.",
  identityKeepEditing: "Seguir editando",
  identityDiscardAndClose: "Descartar y cerrar",
  settingsLineEndingsTitle: "Finales de línea",
  settingsUpdatesTitle: "Actualizaciones",
  settingsLineEndingsDescription: "Cómo guarda Git los finales de línea, para que un archivo no parezca cambiado entero entre sistemas.",
  lineEndingsWindowsLabel: "Guardar el formato común y usar el de Windows en el disco",
  lineEndingsWindowsDescription: "Convierte en los dos sentidos, lo mejor en Windows.",
  lineEndingsNormalizeLabel: "Guardar el formato común y no tocar los archivos del disco",
  lineEndingsNormalizeDescription: "Solo convierte lo que guarda Git.",
  lineEndingsKeepLabel: "No convertir nada",
  lineEndingsKeepDescription: "Guarda los archivos tal cual, así que entre sistemas distintos pueden verse archivos enteros cambiados.",
  lineEndingsRecommended: "Recomendado aquí",
  lineEndingsFromGlobal: "Viene de tu configuración de Git, así que se aplica a todos los proyectos.",
  lineEndingsFromProject: "Este proyecto define el suyo, así que tu elección no se aplica aquí.",
  lineEndingsFromNowhere: "Sin configurar, así que Git usa su valor por defecto en este sistema.",
  lineEndingsProjectAttributes: "Este proyecto tiene sus propias reglas de finales de línea (.gitattributes), que mandan en los archivos que cubren.",
  lineEndingsEolNote: "Otro ajuste también decide lo que se escribe en el disco (core.eol):",
  lineEndingsSaved: "Guardado.",
  lineEndingsCouldntSave: "No se pudo guardar.",
  settingsStartupTitle: "Inicio",
  startupReopenLabel: "Reabrir los proyectos de la última sesión",
  startupReopenDescription: "Recupera los proyectos que estaban abiertos al salir.",
  settingsWatchingTitle: "Actualización automática",
  watchingLabel: "Mantener al día las pantallas del proyecto",
  watchingDescription: "Se actualiza cuando cambian archivos o versiones, así que desactívalo solo si un proyecto grande o en red va lento.",
  remoteCheckLabel: "Comprobar cambios del proyecto remoto",
  remoteCheckDescription: "Usa la red y también puedes comprobarlo a mano.",
  remoteCheckIntervalLabel: "Cada cuánto comprobar el remoto",
  remoteCheckNever: "Nunca",
  remoteCheckMinutesShort: (minutes) => `${minutes} min`,
  remoteCheckHourShort: "1 h",
  remoteCheckEveryMinutes: (minutes) => `Cada ${minutes} minutos`,
  remoteCheckEveryHour: "Cada hora",
  remoteCheckCustomShort: "Personalizada",
  remoteCheckCustom: "Frecuencia personalizada",
  remoteCheckCustomValueLabel: "Cada cuánto comprobar",
  remoteCheckCustomUnitLabel: "Unidad de tiempo",
  remoteCheckUnitMinutes: "minutos",
  remoteCheckUnitHours: "horas",
  remoteCheckEveryHours: (hours) => (hours === 1 ? "Cada hora" : `Cada ${hours} horas`),
  remoteCheckMinutesUnit: (minutes) => (minutes === 1 ? "1 minuto" : `${minutes} minutos`),
  remoteCheckHoursUnit: (hours) => (hours === 1 ? "1 hora" : `${hours} horas`),
  remoteCheckOutOfRange: (min, max) => `Elige entre ${min} y ${max}.`,
  settingsSafetyTitle: "Seguridad",
  safetyConfirmLabel: "Confirmar antes de cerrar un proyecto",
  safetyConfirmDescription: "Pregunta antes de cerrar un proyecto abierto.",
  safetyConfirmDiscardLabel: "Confirmar antes de descartar cambios",
  safetyConfirmDiscardDescription: "Pregunta antes de descartar trabajo, que después también puedes deshacer.",
  settingsLanguageTitle: "Idioma",
  settingsLanguageDescription: "«Sistema» sigue el idioma de tu dispositivo.",
  languageAriaLabel: "Idioma",
  settingsReadingTitle: "Lectura",
  settingsConsoleTitle: "Consola",
  settingsConsoleDescription: "Cómo se ve la consola del proyecto y cómo te ayuda a escribir. Se comparte entre proyectos.",
  consoleSettingsAutocompleteLabel: "Sugerir atajos",
  consoleSettingsAutocompleteDescription: "Completa los nombres en gris mientras escribes y muestra los que coinciden. Tab acepta.",
  consoleSettingsWelcomeLabel: "Mostrar la bienvenida",
  consoleSettingsWelcomeDescription: "Abre la consola vacía con la mascota y un resumen del proyecto.",
  consoleSettingsCursorLabel: "Cursor parpadeante",
  consoleSettingsCursorDescription: "El cursor nunca parpadea con el movimiento reducido activado.",
  consoleSettingsTextSizeLabel: "Tamaño del texto",
  consoleSettingsTextSizeDescription: "El tamaño del texto y la salida de la consola.",
  consoleSettingsTextSizes: { small: "Pequeño", normal: "Normal", large: "Grande" },
  settingsReadingDiffsTitle: "Cambios",
  settingsReadingDescription: "Cómo se muestran los cambios de los archivos.",
  readingWrapLabel: "Ajustar líneas largas",
  readingWrapDescription: "Desactivado, las líneas largas se desplazan en horizontal.",
  readingIgnoreWhitespaceLabel: "Ignorar cambios solo de espaciado",
  readingIgnoreWhitespaceDescription: "Oculta los cambios que solo añaden o quitan espacios.",
  readingSyntaxLabel: "Resaltado de sintaxis",
  readingSyntaxDescription: "Colorea el código según el lenguaje.",
  readingTabWidthLabel: "Ancho de tabulación",
  readingTabWidthDescription: "Muestra las tabulaciones como 2, 4 u 8 espacios.",
  readingCodeFontTitle: "Fuente del código",
  readingCodeFontLabel: "Fuente del código",
  readingCodeFontDescription: "Para el código en Cambios, Historial y al publicar, y todas son monoespaciadas.",
  readingCodeFontAtkinson: "Hyperlegible",
  readingCodeFontJetBrains: "JetBrains",
  readingCodeFontPlex: "Plex",
  readingCodeFontSystem: "Sistema",
};

export const settingsTranslations = { en, es } as const;
