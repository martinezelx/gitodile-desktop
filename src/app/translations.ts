import type { AppReleaseNoteId } from "./appRelease";

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
  issueReportAttachmentNote: string;
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
  shortcutsOpenPalette: string;
  shortcutsOpenSettings: string;
  shortcutsToggleSidebar: string;
  shortcutsNextProject: string;
  shortcutsPreviousProject: string;
  shortcutsCloseDialogs: string;
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
  navChanges: string;
  navChangesTitle: string;
  navVersionLines: string;
  navVersionLinesTitle: string;
  navHistory: string;
  navHistoryTitle: string;
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
  commandGoVersionLines: string;
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
  commandTurnFolderIntoProject: string;
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
  statusBarWorkingOn: string;
  statusBarDetached: string;
  statusBarUnbornLine: string;
  statusBarVersionLineUnavailable: string;
  statusBarCheckingChanges: string;
  statusBarChangesUnavailable: string;
  statusBarChangesNotChecked: string;
  statusBarEverythingSaved: string;
  statusBarUnsaved: (count: number) => string;
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
  statusBarVersion: (version: string) => string;
  statusBarOpenChangelog: (version: string, channel: string) => string;
  titlebarHideSidebar: string;
  titlebarShowSidebar: string;
  titlebarSwitchToLightTheme: string;
  titlebarSwitchToDarkTheme: string;
  startupRestoreSkippedNotice: (count: number) => string;
  aboutGitOdile: string;
  aboutHeading: string;
  aboutDescription: string;
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
  aboutCopied: string;
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
  changelogNotes: Record<AppReleaseNoteId, string>;
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
  titlebarReloadBlocked: "Finish the current project operation before reloading.",
  titlebarReportIssue: "Report an issue",
  issueReportHint: "Reviews the system details and recent app activity before opening GitHub. A GitHub account is required; reports are public.",
  issueReportPreparingTitle: "Preparing your report",
  issueReportPreparingMessage: "Collecting the app and system details stored for this session.",
  issueReportReviewTitle: "Review issue report",
  issueReportReviewMessage: "Only the versions are prefilled. Copy or save to include the activity.",
  issueReportContentsLabel: "Report contents",
  issueReportAttachmentNote: "If you save the report, attach it to the issue yourself.",
  issueReportCopyReport: "Copy",
  issueReportReportCopied: "Report copied.",
  issueReportCopyReportFailed: "Couldn't copy the report. Select the text above and copy it manually.",
  issueReportSaveReport: "Save report…",
  issueReportSaving: "Saving…",
  issueReportSaved: "Report saved. Attach the file to your GitHub issue.",
  issueReportSaveFailed: "Couldn't save the report. Choose another location and try again.",
  issueReportContinue: "Open issue",
  issueReportFailedTitle: "Couldn't open the issue report",
  issueReportFailedMessage: "Try again or copy the link into your browser. GitHub requires sign-in, and you can review the public report before submitting it.",
  issueReportLink: "Report link",
  issueReportCopyLink: "Copy link",
  issueReportCopied: "Link copied.",
  issueReportCopyFailed: "Couldn't copy the link. Select the address above and copy it manually.",
  issueReportOpening: "Opening…",
  issueReportRetry: "Try again",
  titlebarKeyboardShortcuts: "Keyboard shortcuts",
  shortcutsDialogTitle: "Keyboard shortcuts",
  shortcutsOpenPalette: "Open command palette",
  shortcutsOpenSettings: "Open Settings",
  shortcutsToggleSidebar: "Show or hide the sidebar",
  shortcutsNextProject: "Next project",
  shortcutsPreviousProject: "Previous project",
  shortcutsCloseDialogs: "Close dialogs and menus",
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
  navChanges: "Changes",
  navChangesTitle: "Changes — Open a project first",
  navVersionLines: "Lines",
  navVersionLinesTitle: "Lines — Open a project first",
  navHistory: "History",
  navHistoryTitle: "History — Open a project first",
  navRecovery: "Recovery",
  navRecoveryTitle: "Recovery — Coming soon",
  navSettings: "Settings",
  navMore: "More",
  navCustomizeNavigation: "Customize navigation bar",
  navAccount: "Sign in",
  navAccountTitle: "Sign in — Coming soon",
  dropFolderTitle: "Drop a folder to open it",
  dropFolderHint: "One folder at a time. If it isn't a project yet, GitOdile offers to make it one.",
  paletteAriaLabel: "Command palette",
  palettePlaceholder: "Jump to a view or action…",
  paletteNoMatches: "No matching commands",
  commandGoOverview: "Go to Overview",
  commandGoVersionLines: "Go to Lines",
  commandGoHistory: "Go to History",
  commandNewVersionLine: "New version line",
  commandCheckLocalChanges: "Check local changes",
  commandCheckRemoteChanges: "Check remote project changes",
  commandRefreshHistory: "Update history",
  commandRefreshVersionLines: "Update version lines",
  commandCheckAppUpdates: "Check for updates",
  commandGoSettings: "Go to Settings",
  commandGoSettingsSection: (section) => `Settings: ${section}`,
  automaticUpdatesUpdateNow: "Update now",
  automaticUpdatesUpdating: "Updating…",
  automaticUpdatesOpenSettings: "Turn on automatic updates",
  automaticUpdatesOffTitle: "Automatic updates are off",
  automaticUpdatesUnavailableTitle: "Automatic updates aren’t available",
  automaticUpdatesOutdatedDescription: "This screen may be out of date.",
  commandUseSystemTheme: "Use system theme",
  commandUseLightTheme: "Use light theme",
  commandUseDarkTheme: "Use dark theme",
  commandCloseActiveProject: "Close active project",
  commandCloneProject: "Clone a remote project",
  commandCreateProject: "Create a local project",
  commandTurnFolderIntoProject: "Turn this folder into a project",
  commandSwitchToProject: (name) => `Switch to ${name}`,
  projectSwitcherAriaLabel: "Open projects",
  projectSwitchToLabel: (name) => `Switch to ${name}`,
  projectSwitcherCloseLabel: (name) => `Close ${name}`,
  projectSwitcherUnsavedIndicator: "Has unsaved changes",
  projectSwitcherOperationIndicator: "Operation in progress",
  projectSwitcherErrorIndicator: "Needs attention",
  projectSwitcherCollapsedTrigger: "Switch project",
  projectSwitcherRailTrigger: (name) => `${name.trim() || "Unnamed project"} — switch project`,
  projectSwitcherSearchPlaceholder: "Search a project…",
  projectSwitcherSearchEmpty: "No project by that name",
  projectSwitcherSwitchBlockedHint: "Finish the open dialog before switching projects",
  projectSwitcherEmptyHint: "Your open projects will show up here.",
  projectSwitcherAddProject: "Add project",
  projectSwitcherFavourite: (name) => `Add ${name} to favourites`,
  projectSwitcherUnfavourite: (name) => `Remove ${name} from favourites`,
  projectSwitcherFavouriteHint: "Add to favourites",
  projectSwitcherFavouritesOnly: "Show favourites only",
  projectSwitcherFavouritesOnlyOff: "Show every open project",
  projectSwitcherFavouritesEmpty: "No favourites yet. Star a project to keep it here.",
  projectSwitcherUnfavouriteHint: "Remove from favourites",
  projectSwitcherCloneProject: "Clone remote project",
  projectSwitcherCreateProject: "Create local project",
  projectSwitcherActiveAnnouncement: (name) => `${name} is now the active project.`,
  projectSwitcherMutationBlocked: (name) =>
    `Wait for the operation in ${name} to finish before starting another one in a linked workspace.`,
  projectSwitcherCloseBlocked: (name) =>
    `Wait for the operation in ${name} to finish. You can keep working in another project meanwhile.`,
  statusBarAriaLabel: "Project status",
  statusBarNoProject: "No project open",
  statusBarWorkingOn: "Working on",
  statusBarDetached: "Specific saved version",
  statusBarUnbornLine: "New version line",
  statusBarVersionLineUnavailable: "Version line unavailable",
  statusBarCheckingChanges: "Checking changes…",
  statusBarChangesUnavailable: "Changes unavailable",
  statusBarChangesNotChecked: "Changes not checked",
  statusBarEverythingSaved: "Everything is saved",
  statusBarUnsaved: (count) => (count === 1 ? "1 unsaved change" : `${count} unsaved changes`),
  statusBarUpToDate: "Up to date",
  statusBarAhead: (count) => `${count} ${count === 1 ? "version" : "versions"} to publish`,
  statusBarBehind: (count) => `${count} project ${count === 1 ? "version" : "versions"} available`,
  statusBarDiverged: "Both sides changed",
  statusBarNoRemote: "No remote connected",
  statusBarNoUpstream: "No publish destination",
  statusBarSyncUnborn: "Save a version to compare",
  statusBarSyncDetached: "Switch lines to compare",
  statusBarSyncUnknown: "Project sync unavailable",
  statusBarTeamNotChecked: "Project changes not checked",
  statusBarCheckingTeam: "Checking project changes…",
  statusBarReadingTeam: "Reading remote project status…",
  statusBarTeamUnavailable: "Couldn’t check project changes",
  statusBarLocalSnapshot: "Local snapshot",
  statusBarMayBeOutdated: "May be outdated",
  statusBarCheckFailed: "Check failed",
  statusBarJustNow: "just now",
  statusBarLastChecked: (relative) => `Checked ${relative}`,
  statusBarCheckNow: "Check remote project changes",
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
  aboutGitOdile: "About",
  aboutHeading: "Git without the bite.",
  aboutDescription: "Turns version control into clear, worry-free steps.",
  aboutTechnicalDetails: "Technical details",
  aboutSystem: "System",
  aboutSystemVersion: "System version",
  aboutWebview: "Webview",
  aboutGitVersion: "Git",
  aboutBuiltWith: "Built with",
  aboutStackLink: (name, site) => `${name} — open ${site}`,
  aboutCopySystemInfo: "Copy system info",
  aboutCopied: "Copied",
  aboutFooterMadeWith: "Made with",
  aboutFooterByAuthor: "by Luis M. Martínez.",
  aboutHeartLabel: "love",
  changelogEyebrow: "Release notes",
  changelogTitle: "What's new",
  changelogDescription: "Every note ships with the build you are running and opens without a network request.",
  changelogVersionHeading: (version) => `v${version}`,
  changelogCurrentRelease: "You are running this",
  changelogNotes: {
    inAppUpdates: "Update from inside the app. A startup check tells you when a newer version is out; Settings → Updates downloads and installs it when you choose.",
    publicIssueReporting: "Report an issue from More actions. Review the app and system details before submitting your report on GitHub.",
    previewVersions: "Preview builds now show their full version number so you can identify the build you are using.",
    canonicalIdentity: "GitOdile now uses its canonical name and application identity consistently.",
    projectSessions: "Open, clone, or create local projects, and pick your last session up where you left it.",
    saveAndPublish: "Save all or selected changes as a version, then publish it through a previewed flow that reports uncertain remote outcomes honestly.",
    historyTimeline: "Browse the saved-version timeline and read syntax-colored diffs for any change.",
    truthfulStatus: "See your current version line, unsaved work, and when project changes were last checked from every screen.",
    safeLineSwitching: "Switch version lines from the status bar with the same preview and unsaved-work safeguards.",
    releaseDetails: "Open these release notes from the version tag in the status bar, or from the toolbar menu.",
  },
  closeConfirmTitle: "Close this project?",
  closeConfirmBodyGeneric: "The project stays exactly as it is on disk. You can reopen it anytime.",
  closeConfirmBodyNamed: (name) => `"${name}" stays exactly as it is on disk. You can reopen it anytime.`,
};

const es: AppTranslations = {
  titlebarOpenCommandPalette: "Abrir la paleta de comandos",
  titlebarJumpToHint: "Ir a una vista o acción",
  titlebarMoreActions: "Más acciones",
  titlebarOpenProject: "Abrir proyecto",
  titlebarCreateProject: "Crear proyecto local",
  titlebarCloneProject: "Clonar proyecto remoto",
  titlebarReloadWindow: "Recargar ventana",
  titlebarReloadBlocked: "Termina la operación actual del proyecto antes de recargar.",
  titlebarReportIssue: "Reportar un problema",
  issueReportHint: "Permite revisar los datos del sistema y la actividad reciente antes de abrir GitHub. Requiere una cuenta de GitHub; los informes son públicos.",
  issueReportPreparingTitle: "Preparando el informe",
  issueReportPreparingMessage: "Recopilando los datos de la aplicación y del sistema guardados durante esta sesión.",
  issueReportReviewTitle: "Revisar informe del problema",
  issueReportReviewMessage: "Solo se rellenan las versiones. Copia o guarda para incluir la actividad.",
  issueReportContentsLabel: "Contenido del informe",
  issueReportAttachmentNote: "Si guardas el informe, adjúntalo tú en GitHub.",
  issueReportCopyReport: "Copiar",
  issueReportReportCopied: "Informe copiado.",
  issueReportCopyReportFailed: "No se pudo copiar el informe. Selecciona el texto de arriba y cópialo manualmente.",
  issueReportSaveReport: "Guardar informe…",
  issueReportSaving: "Guardando…",
  issueReportSaved: "Informe guardado. Adjunta el archivo en GitHub.",
  issueReportSaveFailed: "No se pudo guardar el informe. Elige otra ubicación e inténtalo de nuevo.",
  issueReportContinue: "Reportar en GitHub",
  issueReportFailedTitle: "No se pudo abrir el informe",
  issueReportFailedMessage: "Reinténtalo o copia el enlace en tu navegador. GitHub requiere iniciar sesión y podrás revisar el informe público antes de enviarlo.",
  issueReportLink: "Enlace del informe",
  issueReportCopyLink: "Copiar enlace",
  issueReportCopied: "Enlace copiado.",
  issueReportCopyFailed: "No se pudo copiar el enlace. Selecciona la dirección de arriba y cópiala manualmente.",
  issueReportOpening: "Abriendo…",
  issueReportRetry: "Reintentar",
  titlebarKeyboardShortcuts: "Atajos de teclado",
  shortcutsDialogTitle: "Atajos de teclado",
  shortcutsOpenPalette: "Abrir la paleta de comandos",
  shortcutsOpenSettings: "Abrir Ajustes",
  shortcutsToggleSidebar: "Mostrar u ocultar la barra lateral",
  shortcutsNextProject: "Proyecto siguiente",
  shortcutsPreviousProject: "Proyecto anterior",
  shortcutsCloseDialogs: "Cerrar diálogos y menús",
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
  navChanges: "Cambios",
  navChangesTitle: "Cambios — Abre un proyecto primero",
  navVersionLines: "Líneas",
  navVersionLinesTitle: "Líneas — Abre un proyecto primero",
  navHistory: "Historial",
  navHistoryTitle: "Historial — Abre un proyecto primero",
  navRecovery: "Rescate",
  navRecoveryTitle: "Rescate — Próximamente",
  navSettings: "Ajustes",
  navMore: "Más",
  navCustomizeNavigation: "Personalizar barra de navegación",
  navAccount: "Iniciar sesión",
  navAccountTitle: "Iniciar sesión — Próximamente",
  dropFolderTitle: "Suelta una carpeta para abrirla",
  dropFolderHint: "Una carpeta cada vez. Si todavía no es un proyecto, GitOdile te ofrece convertirla en uno.",
  paletteAriaLabel: "Paleta de comandos",
  palettePlaceholder: "Ir a una vista o acción…",
  paletteNoMatches: "No hay coincidencias",
  commandGoOverview: "Ir a Resumen",
  commandGoVersionLines: "Ir a Líneas",
  commandGoHistory: "Ir al Historial",
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
  automaticUpdatesOffTitle: "Las actualizaciones automáticas están desactivadas",
  automaticUpdatesUnavailableTitle: "Las actualizaciones automáticas no están disponibles",
  automaticUpdatesOutdatedDescription: "Esta pantalla puede estar desactualizada.",
  commandUseSystemTheme: "Usar el tema del sistema",
  commandUseLightTheme: "Usar el tema claro",
  commandUseDarkTheme: "Usar el tema oscuro",
  commandCloseActiveProject: "Cerrar el proyecto activo",
  commandCloneProject: "Clonar un proyecto remoto",
  commandCreateProject: "Crear un proyecto local",
  commandTurnFolderIntoProject: "Convertir esta carpeta en proyecto",
  commandSwitchToProject: (name) => `Cambiar a ${name}`,
  projectSwitcherAriaLabel: "Proyectos abiertos",
  projectSwitchToLabel: (name) => `Cambiar a ${name}`,
  projectSwitcherCloseLabel: (name) => `Cerrar ${name}`,
  projectSwitcherUnsavedIndicator: "Tiene cambios sin guardar",
  projectSwitcherOperationIndicator: "Operación en curso",
  projectSwitcherErrorIndicator: "Necesita atención",
  projectSwitcherCollapsedTrigger: "Cambiar de proyecto",
  projectSwitcherRailTrigger: (name) => `${name.trim() || "Proyecto sin nombre"} — cambiar de proyecto`,
  projectSwitcherSearchPlaceholder: "Buscar un proyecto…",
  projectSwitcherSearchEmpty: "Ningún proyecto con ese nombre",
  projectSwitcherSwitchBlockedHint: "Termina el diálogo abierto antes de cambiar de proyecto",
  projectSwitcherEmptyHint: "Aquí aparecerán tus proyectos abiertos.",
  projectSwitcherAddProject: "Añadir proyecto",
  projectSwitcherFavourite: (name) => `Añadir ${name} a favoritos`,
  projectSwitcherUnfavourite: (name) => `Quitar ${name} de favoritos`,
  projectSwitcherFavouriteHint: "Añadir a favoritos",
  projectSwitcherFavouritesOnly: "Ver solo favoritos",
  projectSwitcherFavouritesOnlyOff: "Ver todos los proyectos abiertos",
  projectSwitcherFavouritesEmpty: "Todavía no hay favoritos. Marca un proyecto con la estrella para tenerlo aquí.",
  projectSwitcherUnfavouriteHint: "Quitar de favoritos",
  projectSwitcherCloneProject: "Clonar proyecto remoto",
  projectSwitcherCreateProject: "Crear proyecto local",
  projectSwitcherActiveAnnouncement: (name) => `${name} es ahora el proyecto activo.`,
  projectSwitcherMutationBlocked: (name) =>
    `Espera a que termine la operación de ${name} antes de iniciar otra en un espacio de trabajo vinculado.`,
  projectSwitcherCloseBlocked: (name) =>
    `Espera a que termine la operación de ${name}. Mientras tanto puedes seguir trabajando en otro proyecto.`,
  statusBarAriaLabel: "Estado del proyecto",
  statusBarNoProject: "Ningún proyecto abierto",
  statusBarWorkingOn: "Trabajando en",
  statusBarDetached: "Versión guardada concreta",
  statusBarUnbornLine: "Línea de versión nueva",
  statusBarVersionLineUnavailable: "Línea de versión no disponible",
  statusBarCheckingChanges: "Comprobando cambios…",
  statusBarChangesUnavailable: "Cambios no disponibles",
  statusBarChangesNotChecked: "Cambios sin comprobar",
  statusBarEverythingSaved: "Todo está guardado",
  statusBarUnsaved: (count) => (count === 1 ? "1 cambio sin guardar" : `${count} cambios sin guardar`),
  statusBarUpToDate: "Al día",
  statusBarAhead: (count) => `${count} ${count === 1 ? "versión por publicar" : "versiones por publicar"}`,
  statusBarBehind: (count) => `${count} ${count === 1 ? "versión del proyecto disponible" : "versiones del proyecto disponibles"}`,
  statusBarDiverged: "Ambos lados han cambiado",
  statusBarNoRemote: "Sin remoto conectado",
  statusBarNoUpstream: "Sin destino de publicación",
  statusBarSyncUnborn: "Guarda una versión para comparar",
  statusBarSyncDetached: "Cambia de línea para comparar",
  statusBarSyncUnknown: "Sincronización del proyecto no disponible",
  statusBarTeamNotChecked: "Cambios del proyecto sin comprobar",
  statusBarCheckingTeam: "Comprobando cambios del proyecto…",
  statusBarReadingTeam: "Leyendo el estado remoto del proyecto…",
  statusBarTeamUnavailable: "No se pudieron comprobar los cambios del proyecto",
  statusBarLocalSnapshot: "Estado local",
  statusBarMayBeOutdated: "Puede estar desactualizado",
  statusBarCheckFailed: "La comprobación falló",
  statusBarJustNow: "ahora mismo",
  statusBarLastChecked: (relative) => `Comprobado ${relative}`,
  statusBarCheckNow: "Comprobar cambios del proyecto remoto",
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
  aboutGitOdile: "Acerca de",
  aboutHeading: "Git sin mordiscos.",
  aboutDescription: "Convierte el control de versiones en pasos claros y sin sustos.",
  aboutTechnicalDetails: "Detalles técnicos",
  aboutSystem: "Sistema",
  aboutSystemVersion: "Versión del sistema",
  aboutWebview: "Webview",
  aboutGitVersion: "Git",
  aboutBuiltWith: "Hecho con",
  aboutStackLink: (name, site) => `${name} — abrir ${site}`,
  aboutCopySystemInfo: "Copiar info del sistema",
  aboutCopied: "Copiado",
  aboutFooterMadeWith: "Hecho con",
  aboutFooterByAuthor: "por Luis M. Martínez.",
  aboutHeartLabel: "amor",
  changelogEyebrow: "Notas de versión",
  changelogTitle: "Novedades",
  changelogDescription: "Todas las notas vienen con la build que estás usando y se abren sin ninguna petición de red.",
  changelogVersionHeading: (version) => `v${version}`,
  changelogCurrentRelease: "Estás usando esta",
  changelogNotes: {
    inAppUpdates: "Actualiza desde la propia aplicación. Una comprobación al iniciar te avisa cuando hay una versión nueva; en Ajustes → Actualizaciones la descargas e instalas cuando tú decidas.",
    publicIssueReporting: "Informa de un problema desde Más acciones. Revisa los datos de la aplicación y del sistema antes de enviar el informe en GitHub.",
    previewVersions: "Las versiones preview muestran ahora su número completo para que puedas identificar la build que estás usando.",
    canonicalIdentity: "GitOdile utiliza ahora de forma coherente su nombre y su identidad de aplicación definitivos.",
    projectSessions: "Abre, clona o crea proyectos locales, y retoma tu última sesión donde la dejaste.",
    saveAndPublish: "Guarda todos los cambios o los que elijas como una versión y publícala con un flujo previsualizado que reconoce cuando el resultado remoto es incierto.",
    historyTimeline: "Recorre la línea de tiempo de versiones guardadas y lee las diferencias con color de sintaxis de cualquier cambio.",
    truthfulStatus: "Consulta la línea de versión actual, el trabajo sin guardar y cuándo se comprobaron por última vez los cambios del proyecto desde cualquier pantalla.",
    safeLineSwitching: "Cambia de línea desde la barra de estado con la misma previsualización y protección del trabajo sin guardar.",
    releaseDetails: "Abre estas notas de versión desde la etiqueta de versión de la barra de estado o desde el menú de la barra de herramientas.",
  },
  closeConfirmTitle: "¿Cerrar este proyecto?",
  closeConfirmBodyGeneric: "El proyecto se mantiene exactamente igual en el disco. Puedes volver a abrirlo cuando quieras.",
  closeConfirmBodyNamed: (name) => `"${name}" se mantiene exactamente igual en el disco. Puedes volver a abrirlo cuando quieras.`,
};

export const appTranslations = { en, es } as const;
