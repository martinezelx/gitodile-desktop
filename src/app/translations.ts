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
  titlebarReportIssueTitle: string;
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
  alphaBadge: string;
  alphaBadgeAriaLabel: string;
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
  paletteAriaLabel: string;
  palettePlaceholder: string;
  paletteNoMatches: string;
  commandGoOverview: string;
  commandGoVersionLines: string;
  commandGoHistory: string;
  commandNewVersionLine: string;
  commandGoSettings: string;
  commandGoSettingsSection: (section: string) => string;
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
  statusBarUnsaved: (count: number) => string;
  statusBarUpToDate: string;
  statusBarLastChecked: (relative: string) => string;
  statusBarCheckNow: string;
  statusBarVersion: (version: string) => string;
  titlebarHideSidebar: string;
  titlebarShowSidebar: string;
  titlebarSwitchToLightTheme: string;
  titlebarSwitchToDarkTheme: string;
  startupRestoreSkippedNotice: (count: number) => string;
  aboutGitOdrile: string;
  aboutHeading: string;
  aboutDescription: string;
  aboutSystem: string;
  aboutSystemVersion: string;
  aboutGitVersion: string;
  aboutCopySystemInfo: string;
  aboutCopied: string;
  /* Split around the heart so it can be colored, and so both halves stay
     translatable — word order around it is not the same in every language. */
  aboutFooterMadeWith: string;
  aboutFooterByAuthor: string;
  aboutHeartLabel: string;
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
  titlebarReportIssueTitle: "Report an issue — Coming soon",
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
  alphaBadge: "alpha",
  alphaBadgeAriaLabel: "Development version: alpha",
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
  paletteAriaLabel: "Command palette",
  palettePlaceholder: "Jump to a view or action…",
  paletteNoMatches: "No matching commands",
  commandGoOverview: "Go to Overview",
  commandGoVersionLines: "Go to Lines",
  commandGoHistory: "Go to History",
  commandNewVersionLine: "New version line",
  commandGoSettings: "Go to Settings",
  commandGoSettingsSection: (section) => `Settings: ${section}`,
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
  statusBarUnsaved: (count) => (count === 1 ? "1 unsaved change" : `${count} unsaved changes`),
  statusBarUpToDate: "Up to date",
  statusBarLastChecked: (relative) => `Checked ${relative}`,
  statusBarCheckNow: "Check for team changes",
  statusBarVersion: (version) => `v${version}`,
  titlebarHideSidebar: "Hide sidebar",
  titlebarShowSidebar: "Show sidebar",
  titlebarSwitchToLightTheme: "Switch to light theme",
  titlebarSwitchToDarkTheme: "Switch to dark theme",
  startupRestoreSkippedNotice: (count) =>
    count === 1
      ? "1 project from your last session couldn't be reopened."
      : `${count} projects from your last session couldn't be reopened.`,
  aboutGitOdrile: "About",
  aboutHeading: "Git without the bite.",
  aboutDescription: "Turns version control into clear, worry-free steps.",
  aboutSystem: "System",
  aboutSystemVersion: "System version",
  aboutGitVersion: "Git",
  aboutCopySystemInfo: "Copy system info",
  aboutCopied: "Copied",
  aboutFooterMadeWith: "Made with",
  aboutFooterByAuthor: "by Luis M. Martínez.",
  aboutHeartLabel: "love",
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
  titlebarReportIssueTitle: "Reportar un problema — Próximamente",
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
  alphaBadge: "alpha",
  alphaBadgeAriaLabel: "Versión en desarrollo: alpha",
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
  paletteAriaLabel: "Paleta de comandos",
  palettePlaceholder: "Ir a una vista o acción…",
  paletteNoMatches: "No hay coincidencias",
  commandGoOverview: "Ir a Resumen",
  commandGoVersionLines: "Ir a Líneas",
  commandGoHistory: "Ir al Historial",
  commandNewVersionLine: "Nueva línea de versión",
  commandGoSettings: "Ir a Ajustes",
  commandGoSettingsSection: (section) => `Ajustes: ${section}`,
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
  statusBarUnsaved: (count) => (count === 1 ? "1 cambio sin guardar" : `${count} cambios sin guardar`),
  statusBarUpToDate: "Al día",
  statusBarLastChecked: (relative) => `Comprobado ${relative}`,
  statusBarCheckNow: "Comprobar cambios del equipo",
  statusBarVersion: (version) => `v${version}`,
  titlebarHideSidebar: "Ocultar la barra lateral",
  titlebarShowSidebar: "Mostrar la barra lateral",
  titlebarSwitchToLightTheme: "Cambiar a tema claro",
  titlebarSwitchToDarkTheme: "Cambiar a tema oscuro",
  startupRestoreSkippedNotice: (count) =>
    count === 1
      ? "1 proyecto de tu última sesión no se pudo volver a abrir."
      : `${count} proyectos de tu última sesión no se pudieron volver a abrir.`,
  aboutGitOdrile: "Acerca de",
  aboutHeading: "Git sin mordiscos.",
  aboutDescription: "Convierte el control de versiones en pasos claros y sin sustos.",
  aboutSystem: "Sistema",
  aboutSystemVersion: "Versión del sistema",
  aboutGitVersion: "Git",
  aboutCopySystemInfo: "Copiar info del sistema",
  aboutCopied: "Copiado",
  aboutFooterMadeWith: "Hecho con",
  aboutFooterByAuthor: "por Luis M. Martínez.",
  aboutHeartLabel: "amor",
  closeConfirmTitle: "¿Cerrar este proyecto?",
  closeConfirmBodyGeneric: "El proyecto se mantiene exactamente igual en el disco. Puedes volver a abrirlo cuando quieras.",
  closeConfirmBodyNamed: (name) => `"${name}" se mantiene exactamente igual en el disco. Puedes volver a abrirlo cuando quieras.`,
};

export const appTranslations = { en, es } as const;
