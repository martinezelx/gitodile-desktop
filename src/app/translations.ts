
export interface AppTranslations {
  titlebarOpenCommandPalette: string;
  titlebarJumpToHint: string;
  titlebarMoreActions: string;
  titlebarOpenProject: string;
  titlebarCreateProject: string;
  titlebarCloneProject: string;
  titlebarReloadWindow: string;
  titlebarReloadBlocked: string;
  titlebarReportIssue: string;
  issueReportHint: string;
  issueReportPreparingTitle: string;
  issueReportPreparingMessage: string;
  issueReportReviewTitle: string;
  issueReportReviewMessage: string;
  issueReportContentsLabel: string;
  issueReportCopyReport: string;
  issueReportReportCopied: string;
  issueReportCopyReportFailed: string;
  issueReportSaveReport: string;
  issueReportSaving: string;
  issueReportSaved: string;
  issueReportSaveFailed: string;
  issueReportContinue: string;
  issueReportFailedTitle: string;
  issueReportFailedMessage: string;
  issueReportLink: string;
  issueReportCopyLink: string;
  issueReportCopied: string;
  issueReportCopyFailed: string;
  issueReportOpening: string;
  issueReportRetry: string;
  titlebarKeyboardShortcuts: string;
  shortcutsDialogTitle: string;
  shortcutsPlatformLabel: (platform: string) => string;
  shortcutsOpenPalette: string;
  shortcutsOpenSettings: string;
  shortcutsToggleSidebar: string;
  shortcutsNextProject: string;
  shortcutsPreviousProject: string;
  shortcutsCloseDialogs: string;
  shortcutsSaveVersion: string;
  shortcutsRenameLine: string;
  shortcutsGroupProjects: string;
  shortcutsGroupEditing: string;
  shortcutsGroupInterface: string;
  titlebarGoBack: string;
  titlebarGoForward: string;
  titlebarHistoryControls: string;
  windowMinimize: string;
  windowMaximize: string;
  windowClose: string;
  windowControls: string;
  navProjectAriaLabel: string;
  navApplicationAriaLabel: string;
  navOverview: string;
  navOverviewTitle: string;
  navHome: string;
  navWork: string;
  navWorkTitle: string;
  navVersionLines: string;
  navVersionLinesTitle: string;
  navConsole: string;
  navConsoleTitle: string;
  navRecovery: string;
  navRecoveryTitle: string;
  navSettings: string;
  navMore: string;
  navCustomizeNavigation: string;
  navAccount: string;
  navAccountTitle: string;
  /** Shown over the whole window while a folder is being dragged onto it. */
  dropFolderTitle: string;
  dropFolderHint: string;
  paletteAriaLabel: string;
  palettePlaceholder: string;
  paletteNoMatches: string;
  commandGoOverview: string;
  commandGoHome: string;
  commandGoVersionLines: string;
  commandGoConsole: string;
  commandGoWork: string;
  commandGoChanges: string;
  commandGoHistory: string;
  commandNewVersionLine: string;
  commandCheckLocalChanges: string;
  commandCheckRemoteChanges: string;
  commandRefreshHistory: string;
  commandRefreshVersionLines: string;
  commandCheckAppUpdates: string;
  commandGoSettings: string;
  commandGoSettingsSection: (section: string) => string;
  automaticUpdatesUpdateNow: string;
  automaticUpdatesUpdating: string;
  automaticUpdatesOpenSettings: string;
  automaticUpdatesOffTitle: string;
  automaticUpdatesUnavailableTitle: string;
  automaticUpdatesOutdatedDescription: string;
  commandUseSystemTheme: string;
  commandUseLightTheme: string;
  commandUseDarkTheme: string;
  commandCloseActiveProject: string;
  commandCloneProject: string;
  commandCreateProject: string;
  openErrorTurnIntoProject: string;
  openErrorChooseAnother: string;
  commandSwitchToProject: (name: string) => string;
  projectSwitcherAriaLabel: string;
  projectSwitchToLabel: (name: string) => string;
  projectSwitcherCloseLabel: (name: string) => string;
  projectSwitcherUnsavedIndicator: string;
  projectSwitcherOperationIndicator: string;
  projectSwitcherErrorIndicator: string;
  projectSwitcherCollapsedTrigger: string;
  projectSwitcherRailTrigger: (name: string) => string;
  projectSwitcherSearchPlaceholder: string;
  projectSwitcherSearchEmpty: string;
  projectSwitcherSwitchBlockedHint: string;
  projectSwitcherEmptyHint: string;
  projectSwitcherAddProject: string;
  projectSwitcherFavourite: (name: string) => string;
  projectSwitcherUnfavourite: (name: string) => string;
  projectSwitcherFavouriteHint: string;
  projectSwitcherFavouritesOnly: string;
  projectSwitcherFavouritesOnlyOff: string;
  projectSwitcherFavouritesEmpty: string;
  projectSwitcherUnfavouriteHint: string;
  projectSwitcherCloneProject: string;
  projectSwitcherCreateProject: string;
  projectSwitcherActiveAnnouncement: (name: string) => string;
  projectSwitcherMutationBlocked: (name: string) => string;
  projectSwitcherCloseBlocked: (name: string) => string;
  statusBarAriaLabel: string;
  statusBarNoProject: string;
  statusBarProjectTooltip: (name: string) => string;
  statusBarDetached: string;
  statusBarUnbornLine: string;
  statusBarVersionLineUnavailable: string;
  statusBarCheckingChanges: string;
  statusBarChangesUnavailable: string;
  statusBarChangesNotChecked: string;
  statusBarEverythingSaved: string;
  statusBarUnsaved: (count: number) => string;
  statusBarLinesAdded: (count: number) => string;
  statusBarLinesRemoved: (count: number) => string;
  statusBarUpToDate: string;
  statusBarAhead: (count: number) => string;
  statusBarBehind: (count: number) => string;
  statusBarDiverged: string;
  statusBarNoRemote: string;
  statusBarNoUpstream: string;
  statusBarSyncUnborn: string;
  statusBarSyncDetached: string;
  statusBarSyncUnknown: string;
  statusBarTeamNotChecked: string;
  statusBarCheckingTeam: string;
  statusBarReadingTeam: string;
  statusBarTeamUnavailable: string;
  statusBarLocalSnapshot: string;
  statusBarMayBeOutdated: string;
  statusBarCheckFailed: string;
  statusBarJustNow: string;
  statusBarLastChecked: (relative: string) => string;
  statusBarCheckNow: string;
  statusBarPublishAction: (count: number) => string;
  statusBarVersion: (version: string) => string;
  statusBarOpenChangelog: (version: string, channel: string) => string;
  titlebarHideSidebar: string;
  titlebarShowSidebar: string;
  titlebarSwitchToLightTheme: string;
  titlebarSwitchToDarkTheme: string;
  startupRestoreSkippedNotice: (count: number) => string;
  /* The dialog's own name, in words. It shares the About heading with the
     localized product promise, while the decorative mark stays unannounced. */
  aboutProductName: string;
  /* The titlebar menu item that opens it. */
  aboutGitOdile: string;
  aboutHeading: string;
  aboutDescription: string;
  aboutLicense: string;
  aboutViewLicense: string;
  aboutViewSource: string;
  aboutTechnicalDetails: string;
  aboutSystem: string;
  aboutSystemVersion: string;
  aboutWebview: string;
  aboutGitVersion: string;
  /* Credits, not diagnostics: the layers the product is built on. The layer
     names themselves are never translated — a product name is a name. */
  aboutBuiltWith: string;
  /* Names the destination as well as the layer: a chip that leaves the app for
     a browser should say so before it is pressed, and the version beside the
     name is not what the press acts on. */
  aboutStackLink: (name: string, site: string) => string;
  aboutCopySystemInfo: string;
  /* The visible label of the copy action, short because it heads the section it
     copies; `aboutCopySystemInfo` stays its accessible name. */
  aboutCopy: string;
  aboutCopied: string;
  /* The one short thing About says when the release model reports the running
     build as current. A word, not a sentence: it sits on the version line. */
  aboutUpToDate: string;
  /* The same slot when the build cannot answer at all: a development build
     configures no update feed. Short, and about the check rather than the whole
     installation, so it reads as a state and not as a fault. */
  aboutUpdateUnavailable: string;
  /* Split around the heart so it can be colored, and so both halves stay
     translatable — word order around it is not the same in every language. */
  aboutFooterMadeWith: string;
  aboutFooterByAuthor: string;
  aboutHeartLabel: string;
  changelogEyebrow: string;
  changelogTitle: string;
  changelogDescription: string;
  changelogVersionHeading: (version: string) => string;
  changelogCurrentRelease: string;
  changelogNoHighlights: string;
  closeConfirmTitle: string;
  closeConfirmBodyGeneric: string;
  closeConfirmBodyNamed: (name: string) => string;
}

const en: AppTranslations = {
  titlebarOpenCommandPalette: "Open command palette",
  titlebarJumpToHint: "Jump to a view or action",
  titlebarMoreActions: "More actions",
  titlebarOpenProject: "Open project",
  titlebarCreateProject: "Create local project",
  titlebarCloneProject: "Clone remote project",
  titlebarReloadWindow: "Reload window",
  titlebarReloadBlocked: "Wait for the current operation to finish before reloading.",
  titlebarReportIssue: "Report an issue",
  issueReportHint: "Review your system details and recent activity, then open a public issue on GitHub (account required).",
  issueReportPreparingTitle: "Preparing your report",
  issueReportPreparingMessage: "Gathering app and system details from this session.",
  issueReportReviewTitle: "Review the report before sending it",
  issueReportReviewMessage: "GitHub only receives the versions, so copy or save the report to include the activity.",
  issueReportContentsLabel: "Report contents",
  issueReportCopyReport: "Copy",
  issueReportReportCopied: "Report copied.",
  issueReportCopyReportFailed: "Couldn't copy the report. Select the text and copy it by hand.",
  issueReportSaveReport: "Save report…",
  issueReportSaving: "Saving…",
  issueReportSaved: "Report saved. Attach the file to your GitHub issue.",
  issueReportSaveFailed: "Couldn't save the report. Choose another location.",
  issueReportContinue: "Open issue",
  issueReportFailedTitle: "The browser didn't open",
  issueReportFailedMessage: "Copy the link and paste it yourself.",
  issueReportLink: "Report link",
  issueReportCopyLink: "Copy link",
  issueReportCopied: "Link copied.",
  issueReportCopyFailed: "Couldn't copy the link. Select the address and copy it by hand.",
  issueReportOpening: "Opening…",
  issueReportRetry: "Try again",
  titlebarKeyboardShortcuts: "Keyboard shortcuts",
  shortcutsDialogTitle: "Keyboard shortcuts",
  shortcutsPlatformLabel: (platform) => `Shortcuts for ${platform}`,
  shortcutsOpenPalette: "Open command palette",
  shortcutsOpenSettings: "Open Settings",
  shortcutsToggleSidebar: "Show or hide the sidebar",
  shortcutsNextProject: "Next project",
  shortcutsPreviousProject: "Previous project",
  shortcutsCloseDialogs: "Close dialogs and menus",
  shortcutsSaveVersion: "Save a version",
  shortcutsRenameLine: "Rename a version line",
  shortcutsGroupProjects: "Projects",
  shortcutsGroupEditing: "Editing",
  shortcutsGroupInterface: "Interface",
  titlebarGoBack: "Go back",
  titlebarGoForward: "Go forward",
  titlebarHistoryControls: "Navigation history",
  windowMinimize: "Minimize window",
  windowMaximize: "Maximize or restore window",
  windowClose: "Close window",
  windowControls: "Window controls",
  navProjectAriaLabel: "Project navigation",
  navApplicationAriaLabel: "Application",
  navOverview: "Overview",
  navOverviewTitle: "Overview — open a project first",
  navHome: "Projects",
  navWork: "Work",
  navWorkTitle: "Work — open a project first",
  navVersionLines: "Lines",
  navVersionLinesTitle: "Lines — open a project first",
  navConsole: "Console",
  navConsoleTitle: "Console — open a project first",
  navRecovery: "Recovery",
  navRecoveryTitle: "Recovery — coming soon",
  navSettings: "Settings",
  navMore: "More",
  navCustomizeNavigation: "Customize navigation bar",
  navAccount: "Sign in",
  navAccountTitle: "Sign in — coming soon",
  dropFolderTitle: "Drop a folder to open it",
  dropFolderHint: "One folder at a time, and if it isn't a project yet, GitOdile can make it one.",
  paletteAriaLabel: "Command palette",
  palettePlaceholder: "Jump to a view or action…",
  paletteNoMatches: "No matching commands",
  commandGoOverview: "Go to Overview",
  commandGoHome: "Go to Projects",
  commandGoVersionLines: "Go to Lines",
  commandGoConsole: "Go to Console",
  commandGoWork: "Go to Work",
  commandGoChanges: "Go to Changes",
  commandGoHistory: "Go to History",
  commandNewVersionLine: "New version line",
  commandCheckLocalChanges: "Check local changes",
  commandCheckRemoteChanges: "Check remote project changes",
  commandRefreshHistory: "Refresh history",
  commandRefreshVersionLines: "Refresh version lines",
  commandCheckAppUpdates: "Check for updates",
  commandGoSettings: "Go to Settings",
  commandGoSettingsSection: (section) => `Settings: ${section}`,
  automaticUpdatesUpdateNow: "Update now",
  automaticUpdatesUpdating: "Updating…",
  automaticUpdatesOpenSettings: "Turn on automatic updates",
  automaticUpdatesOffTitle: "Automatic updates are off",
  automaticUpdatesUnavailableTitle: "Automatic updates aren't available",
  automaticUpdatesOutdatedDescription: "This screen may be out of date.",
  commandUseSystemTheme: "Use system theme",
  commandUseLightTheme: "Use light theme",
  commandUseDarkTheme: "Use dark theme",
  commandCloseActiveProject: "Close active project",
  commandCloneProject: "Clone a remote project",
  commandCreateProject: "Create a local project",
  openErrorTurnIntoProject: "Turn into a project",
  openErrorChooseAnother: "Choose another folder",
  commandSwitchToProject: (name) => `Switch to ${name}`,
  projectSwitcherAriaLabel: "Open projects",
  projectSwitchToLabel: (name) => `Switch to ${name}`,
  projectSwitcherCloseLabel: (name) => `Close ${name}`,
  projectSwitcherUnsavedIndicator: "Has unsaved changes",
  projectSwitcherOperationIndicator: "Operation in progress",
  projectSwitcherErrorIndicator: "Needs attention",
  projectSwitcherCollapsedTrigger: "Switch project",
  projectSwitcherRailTrigger: (name) => `${name.trim() || "Unnamed project"} — switch project`,
  projectSwitcherSearchPlaceholder: "Search projects…",
  projectSwitcherSearchEmpty: "No project by that name",
  projectSwitcherSwitchBlockedHint: "Close the open dialog before switching projects",
  projectSwitcherEmptyHint: "Your open projects will show up here.",
  projectSwitcherAddProject: "Add project",
  projectSwitcherFavourite: (name) => `Add ${name} to favorites`,
  projectSwitcherUnfavourite: (name) => `Remove ${name} from favorites`,
  projectSwitcherFavouriteHint: "Add to favorites",
  projectSwitcherFavouritesOnly: "Show favorites only",
  projectSwitcherFavouritesOnlyOff: "Show all open projects",
  projectSwitcherFavouritesEmpty: "No favorites yet. Star a project to keep it here.",
  projectSwitcherUnfavouriteHint: "Remove from favorites",
  projectSwitcherCloneProject: "Clone remote project",
  projectSwitcherCreateProject: "Create local project",
  projectSwitcherActiveAnnouncement: (name) => `${name} is now the active project.`,
  projectSwitcherMutationBlocked: (name) =>
    `Wait for the operation in ${name} to finish, since both workspaces share one project.`,
  projectSwitcherCloseBlocked: (name) =>
    `Wait for the operation in ${name} to finish. You can work in another project meanwhile.`,
  statusBarAriaLabel: "Project status",
  statusBarNoProject: "No project open",
  statusBarProjectTooltip: (name) => `Project: ${name}`,
  statusBarDetached: "Specific saved version",
  statusBarUnbornLine: "New version line",
  statusBarVersionLineUnavailable: "Version line unavailable",
  statusBarCheckingChanges: "Checking changes…",
  statusBarChangesUnavailable: "Changes unavailable",
  statusBarChangesNotChecked: "Changes not checked",
  statusBarEverythingSaved: "Everything is saved",
  statusBarUnsaved: (count) => (count === 1 ? "1 unsaved change" : `${count} unsaved changes`),
  statusBarLinesAdded: (count) => (count === 1 ? "1 line added" : `${count} lines added`),
  statusBarLinesRemoved: (count) => (count === 1 ? "1 line removed" : `${count} lines removed`),
  statusBarUpToDate: "Up to date",
  statusBarAhead: (count) => `${count} ${count === 1 ? "version" : "versions"} to publish`,
  statusBarBehind: (count) => `${count} newer ${count === 1 ? "version" : "versions"} available`,
  statusBarDiverged: "Both sides changed",
  statusBarNoRemote: "No remote connected",
  statusBarNoUpstream: "No publish destination",
  statusBarSyncUnborn: "Save a version to compare",
  statusBarSyncDetached: "Switch lines to compare",
  statusBarSyncUnknown: "Sync status unavailable",
  statusBarTeamNotChecked: "Remote not checked",
  statusBarCheckingTeam: "Checking the remote…",
  statusBarReadingTeam: "Reading remote status…",
  statusBarTeamUnavailable: "Couldn't check the remote",
  statusBarLocalSnapshot: "Local snapshot",
  statusBarMayBeOutdated: "May be out of date",
  statusBarCheckFailed: "Check failed",
  statusBarJustNow: "just now",
  statusBarLastChecked: (relative) => `Checked ${relative}`,
  statusBarCheckNow: "Check remote project changes",
  statusBarPublishAction: (count) => (count === 1 ? "Publish 1 version" : `Publish ${count} versions`),
  statusBarVersion: (version) => `v${version}`,
  statusBarOpenChangelog: (version, channel) => `What's new in GitOdile v${version} ${channel}`,
  titlebarHideSidebar: "Hide sidebar",
  titlebarShowSidebar: "Show sidebar",
  titlebarSwitchToLightTheme: "Switch to light theme",
  titlebarSwitchToDarkTheme: "Switch to dark theme",
  startupRestoreSkippedNotice: (count) =>
    count === 1
      ? "1 project from your last session couldn't be reopened."
      : `${count} projects from your last session couldn't be reopened.`,
  aboutProductName: "GitOdile",
  aboutGitOdile: "About",
  aboutHeading: "Git without the fear.",
  aboutDescription: "Version control in clear, worry-free steps.",
  aboutLicense: "GNU AGPL v3.0 only",
  aboutViewLicense: "View license",
  aboutViewSource: "View source code",
  aboutTechnicalDetails: "Your system",
  aboutSystem: "System",
  aboutSystemVersion: "System version",
  aboutWebview: "Webview",
  aboutGitVersion: "Git",
  aboutBuiltWith: "Built with",
  aboutStackLink: (name, site) => `${name} — open ${site}`,
  aboutCopySystemInfo: "Copy system info",
  aboutCopy: "Copy",
  aboutCopied: "Copied",
  aboutUpToDate: "Up to date",
  aboutUpdateUnavailable: "Updates unavailable",
  aboutFooterMadeWith: "Made with",
  aboutFooterByAuthor: "by Luis M. Martínez.",
  aboutHeartLabel: "love",
  changelogEyebrow: "Release notes",
  changelogTitle: "What's new",
  changelogDescription: "Notes for every release, included in this build, so no internet is needed.",
  changelogVersionHeading: (version) => `v${version}`,
  changelogCurrentRelease: "Your version",
  changelogNoHighlights: "Nothing new to show for this version.",
  closeConfirmTitle: "Close this project?",
  closeConfirmBodyGeneric: "Nothing on disk changes, and you can reopen it anytime.",
  closeConfirmBodyNamed: (name) => `“${name}” stays as it is on disk, and you can reopen it anytime.`,
};

const es: AppTranslations = {
  titlebarOpenCommandPalette: "Abrir la paleta de comandos",
  titlebarJumpToHint: "Ir a una vista o acción",
  titlebarMoreActions: "Más acciones",
  titlebarOpenProject: "Abrir proyecto",
  titlebarCreateProject: "Crear proyecto local",
  titlebarCloneProject: "Clonar proyecto remoto",
  titlebarReloadWindow: "Recargar ventana",
  titlebarReloadBlocked: "Espera a que termine la operación en curso para recargar.",
  titlebarReportIssue: "Reportar un problema",
  issueReportHint: "Revisa los datos del sistema y la actividad reciente, y abre una incidencia pública en GitHub (requiere cuenta).",
  issueReportPreparingTitle: "Preparando el informe",
  issueReportPreparingMessage: "Reuniendo los datos de la aplicación y del sistema de esta sesión.",
  issueReportReviewTitle: "Revisa el informe antes de enviarlo",
  issueReportReviewMessage: "GitHub solo recibe las versiones, así que copia o guarda el informe para incluir la actividad.",
  issueReportContentsLabel: "Contenido del informe",
  issueReportCopyReport: "Copiar",
  issueReportReportCopied: "Informe copiado.",
  issueReportCopyReportFailed: "No se pudo copiar el informe. Selecciona el texto y cópialo a mano.",
  issueReportSaveReport: "Guardar informe…",
  issueReportSaving: "Guardando…",
  issueReportSaved: "Informe guardado. Adjunta el archivo en GitHub.",
  issueReportSaveFailed: "No se pudo guardar el informe. Elige otra ubicación.",
  issueReportContinue: "Reportar en GitHub",
  issueReportFailedTitle: "El navegador no se abrió",
  issueReportFailedMessage: "Copia el enlace y pégalo tú.",
  issueReportLink: "Enlace del informe",
  issueReportCopyLink: "Copiar enlace",
  issueReportCopied: "Enlace copiado.",
  issueReportCopyFailed: "No se pudo copiar el enlace. Selecciona la dirección y cópiala a mano.",
  issueReportOpening: "Abriendo…",
  issueReportRetry: "Reintentar",
  titlebarKeyboardShortcuts: "Atajos de teclado",
  shortcutsDialogTitle: "Atajos de teclado",
  shortcutsPlatformLabel: (platform) => `Atajos para ${platform}`,
  shortcutsOpenPalette: "Abrir la paleta de comandos",
  shortcutsOpenSettings: "Abrir Ajustes",
  shortcutsToggleSidebar: "Mostrar u ocultar la barra lateral",
  shortcutsNextProject: "Proyecto siguiente",
  shortcutsPreviousProject: "Proyecto anterior",
  shortcutsCloseDialogs: "Cerrar diálogos y menús",
  shortcutsSaveVersion: "Guardar una versión",
  shortcutsRenameLine: "Renombrar una línea de versión",
  shortcutsGroupProjects: "Proyectos",
  shortcutsGroupEditing: "Edición",
  shortcutsGroupInterface: "Interfaz",
  titlebarGoBack: "Atrás",
  titlebarGoForward: "Adelante",
  titlebarHistoryControls: "Historial de navegación",
  windowMinimize: "Minimizar ventana",
  windowMaximize: "Maximizar o restaurar ventana",
  windowClose: "Cerrar ventana",
  windowControls: "Controles de ventana",
  navProjectAriaLabel: "Navegación del proyecto",
  navApplicationAriaLabel: "Aplicación",
  navOverview: "Resumen",
  navOverviewTitle: "Resumen — abre antes un proyecto",
  navHome: "Proyectos",
  navWork: "Trabajo",
  navWorkTitle: "Trabajo — abre antes un proyecto",
  navVersionLines: "Líneas",
  navVersionLinesTitle: "Líneas — abre antes un proyecto",
  navConsole: "Consola",
  navConsoleTitle: "Consola — abre antes un proyecto",
  navRecovery: "Rescate",
  navRecoveryTitle: "Rescate — próximamente",
  navSettings: "Ajustes",
  navMore: "Más",
  navCustomizeNavigation: "Personalizar la barra de navegación",
  navAccount: "Iniciar sesión",
  navAccountTitle: "Iniciar sesión — próximamente",
  dropFolderTitle: "Suelta una carpeta para abrirla",
  dropFolderHint: "Una carpeta cada vez y, si aún no es un proyecto, GitOdile puede convertirla en uno.",
  paletteAriaLabel: "Paleta de comandos",
  palettePlaceholder: "Ir a una vista o acción…",
  paletteNoMatches: "No hay coincidencias",
  commandGoOverview: "Ir a Resumen",
  commandGoHome: "Ir a Proyectos",
  commandGoVersionLines: "Ir a Líneas",
  commandGoConsole: "Ir a Consola",
  commandGoWork: "Ir a Trabajo",
  commandGoChanges: "Ir a Cambios",
  commandGoHistory: "Ir a Historial",
  commandNewVersionLine: "Nueva línea de versión",
  commandCheckLocalChanges: "Comprobar cambios locales",
  commandCheckRemoteChanges: "Comprobar cambios del proyecto remoto",
  commandRefreshHistory: "Actualizar historial",
  commandRefreshVersionLines: "Actualizar líneas de versión",
  commandCheckAppUpdates: "Buscar actualizaciones",
  commandGoSettings: "Ir a Ajustes",
  commandGoSettingsSection: (section) => `Ajustes: ${section}`,
  automaticUpdatesUpdateNow: "Actualizar ahora",
  automaticUpdatesUpdating: "Actualizando…",
  automaticUpdatesOpenSettings: "Activar actualizaciones automáticas",
  automaticUpdatesOffTitle: "Actualizaciones automáticas desactivadas",
  automaticUpdatesUnavailableTitle: "Actualizaciones automáticas no disponibles",
  automaticUpdatesOutdatedDescription: "Esta pantalla puede estar desactualizada.",
  commandUseSystemTheme: "Usar el tema del sistema",
  commandUseLightTheme: "Usar el tema claro",
  commandUseDarkTheme: "Usar el tema oscuro",
  commandCloseActiveProject: "Cerrar el proyecto activo",
  commandCloneProject: "Clonar un proyecto remoto",
  commandCreateProject: "Crear un proyecto local",
  openErrorTurnIntoProject: "Convertir en proyecto",
  openErrorChooseAnother: "Elegir otra carpeta",
  commandSwitchToProject: (name) => `Cambiar a ${name}`,
  projectSwitcherAriaLabel: "Proyectos abiertos",
  projectSwitchToLabel: (name) => `Cambiar a ${name}`,
  projectSwitcherCloseLabel: (name) => `Cerrar ${name}`,
  projectSwitcherUnsavedIndicator: "Tiene cambios sin guardar",
  projectSwitcherOperationIndicator: "Operación en curso",
  projectSwitcherErrorIndicator: "Necesita atención",
  projectSwitcherCollapsedTrigger: "Cambiar de proyecto",
  projectSwitcherRailTrigger: (name) => `${name.trim() || "Proyecto sin nombre"} — cambiar de proyecto`,
  projectSwitcherSearchPlaceholder: "Buscar proyectos…",
  projectSwitcherSearchEmpty: "Ningún proyecto con ese nombre",
  projectSwitcherSwitchBlockedHint: "Cierra el diálogo abierto antes de cambiar de proyecto",
  projectSwitcherEmptyHint: "Aquí aparecerán tus proyectos abiertos.",
  projectSwitcherAddProject: "Añadir proyecto",
  projectSwitcherFavourite: (name) => `Añadir ${name} a favoritos`,
  projectSwitcherUnfavourite: (name) => `Quitar ${name} de favoritos`,
  projectSwitcherFavouriteHint: "Añadir a favoritos",
  projectSwitcherFavouritesOnly: "Ver solo favoritos",
  projectSwitcherFavouritesOnlyOff: "Ver todos los proyectos abiertos",
  projectSwitcherFavouritesEmpty: "Aún no hay favoritos. Marca un proyecto con la estrella para tenerlo aquí.",
  projectSwitcherUnfavouriteHint: "Quitar de favoritos",
  projectSwitcherCloneProject: "Clonar proyecto remoto",
  projectSwitcherCreateProject: "Crear proyecto local",
  projectSwitcherActiveAnnouncement: (name) => `${name} es ahora el proyecto activo.`,
  projectSwitcherMutationBlocked: (name) =>
    `Espera a que termine la operación de ${name}, porque los dos espacios de trabajo comparten proyecto.`,
  projectSwitcherCloseBlocked: (name) =>
    `Espera a que termine la operación de ${name}. Mientras, puedes trabajar en otro proyecto.`,
  statusBarAriaLabel: "Estado del proyecto",
  statusBarNoProject: "Ningún proyecto abierto",
  statusBarProjectTooltip: (name) => `Proyecto: ${name}`,
  statusBarDetached: "Versión guardada concreta",
  statusBarUnbornLine: "Línea de versión nueva",
  statusBarVersionLineUnavailable: "Línea de versión no disponible",
  statusBarCheckingChanges: "Comprobando cambios…",
  statusBarChangesUnavailable: "Cambios no disponibles",
  statusBarChangesNotChecked: "Cambios sin comprobar",
  statusBarEverythingSaved: "Todo está guardado",
  statusBarUnsaved: (count) => (count === 1 ? "1 cambio sin guardar" : `${count} cambios sin guardar`),
  statusBarLinesAdded: (count) => (count === 1 ? "1 línea añadida" : `${count} líneas añadidas`),
  statusBarLinesRemoved: (count) => (count === 1 ? "1 línea eliminada" : `${count} líneas eliminadas`),
  statusBarUpToDate: "Al día",
  statusBarAhead: (count) => `${count} ${count === 1 ? "versión por publicar" : "versiones por publicar"}`,
  statusBarBehind: (count) => `${count} ${count === 1 ? "versión nueva disponible" : "versiones nuevas disponibles"}`,
  statusBarDiverged: "Ambos lados han cambiado",
  statusBarNoRemote: "Sin remoto conectado",
  statusBarNoUpstream: "Sin destino de publicación",
  statusBarSyncUnborn: "Guarda una versión para comparar",
  statusBarSyncDetached: "Cambia de línea para comparar",
  statusBarSyncUnknown: "Sincronización no disponible",
  statusBarTeamNotChecked: "Remoto sin comprobar",
  statusBarCheckingTeam: "Comprobando el remoto…",
  statusBarReadingTeam: "Leyendo el estado del remoto…",
  statusBarTeamUnavailable: "No se pudo comprobar el remoto",
  statusBarLocalSnapshot: "Estado local",
  statusBarMayBeOutdated: "Puede estar desactualizado",
  statusBarCheckFailed: "La comprobación falló",
  statusBarJustNow: "ahora mismo",
  statusBarLastChecked: (relative) => `Comprobado ${relative}`,
  statusBarCheckNow: "Comprobar cambios del proyecto remoto",
  statusBarPublishAction: (count) => (count === 1 ? "Publicar 1 versión" : `Publicar ${count} versiones`),
  statusBarVersion: (version) => `v${version}`,
  statusBarOpenChangelog: (version, channel) => `Novedades de GitOdile v${version} ${channel}`,
  titlebarHideSidebar: "Ocultar la barra lateral",
  titlebarShowSidebar: "Mostrar la barra lateral",
  titlebarSwitchToLightTheme: "Cambiar a tema claro",
  titlebarSwitchToDarkTheme: "Cambiar a tema oscuro",
  startupRestoreSkippedNotice: (count) =>
    count === 1
      ? "1 proyecto de tu última sesión no se pudo volver a abrir."
      : `${count} proyectos de tu última sesión no se pudieron volver a abrir.`,
  aboutProductName: "GitOdile",
  aboutGitOdile: "Acerca de",
  aboutHeading: "Git sin miedo.",
  aboutDescription: "El control de versiones, en pasos claros y sin sustos.",
  aboutLicense: "Solo GNU AGPL v3.0",
  aboutViewLicense: "Ver licencia",
  aboutViewSource: "Ver código fuente",
  aboutTechnicalDetails: "Tu sistema",
  aboutSystem: "Sistema",
  aboutSystemVersion: "Versión del sistema",
  aboutWebview: "Webview",
  aboutGitVersion: "Git",
  aboutBuiltWith: "Construido con",
  aboutStackLink: (name, site) => `${name} — abrir ${site}`,
  aboutCopySystemInfo: "Copiar datos del sistema",
  aboutCopy: "Copiar",
  aboutCopied: "Copiado",
  aboutUpToDate: "Al día",
  aboutUpdateUnavailable: "Actualizaciones no disponibles",
  aboutFooterMadeWith: "Hecho con",
  aboutFooterByAuthor: "por Luis M. Martínez.",
  aboutHeartLabel: "amor",
  changelogEyebrow: "Notas de versión",
  changelogTitle: "Novedades",
  changelogDescription: "Las notas de cada versión vienen incluidas en esta build, así que no hace falta conexión.",
  changelogVersionHeading: (version) => `v${version}`,
  changelogCurrentRelease: "Tu versión",
  changelogNoHighlights: "Esta versión no tiene novedades que mostrar.",
  closeConfirmTitle: "¿Cerrar este proyecto?",
  closeConfirmBodyGeneric: "No cambia nada en el disco y puedes volver a abrirlo cuando quieras.",
  closeConfirmBodyNamed: (name) => `«${name}» se queda tal cual en el disco y puedes volver a abrirlo cuando quieras.`,
};

export const appTranslations = { en, es } as const;
