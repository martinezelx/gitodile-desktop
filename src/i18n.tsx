import React, { createContext, useContext, useEffect, useState } from "react";
import { locale as getOsLocale } from "@tauri-apps/plugin-os";

export type Language = "en" | "es";
export type LanguagePreference = "system" | Language;

const LANGUAGE_STORAGE_KEY = "gitodrile-language";

// Names of the languages themselves are shown in their own language
// regardless of the active UI language (so a user can always find their
// language), so they live outside the translated dictionary below.
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
};

// Pure on purpose: takes a raw locale string (from the OS, or
// navigator.language) and resolves it to one of the languages GitOdrile
// actually ships. Unknown languages fall back to English.
export function resolveLanguage(locale: string | null | undefined): Language {
  if (!locale) {
    return "en";
  }
  const primarySubtag = locale.split(/[-_]/)[0]?.toLowerCase();
  return primarySubtag === "es" ? "es" : "en";
}

export interface Translations {
  titlebarOpenCommandPalette: string;
  titlebarJumpToHint: string;
  titlebarJumpTo: string;
  titlebarMoreActions: string;
  titlebarHelpSection: string;
  titlebarGoBack: string;
  titlebarGoForward: string;
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
  navHistory: string;
  navHistoryTitle: string;
  navRecovery: string;
  navRecoveryTitle: string;
  navSettings: string;

  paletteAriaLabel: string;
  palettePlaceholder: string;
  paletteNoMatches: string;

  commandGoOverview: string;
  commandGoSettings: string;
  commandUseSystemTheme: string;
  commandUseLightTheme: string;
  commandUseDarkTheme: string;

  overviewRepositoryBranch: (branch: string) => string;
  overviewWorktreeBranch: (branch: string) => string;
  overviewRepositoryDetached: string;
  overviewWorktreeDetached: string;
  overviewRepositoryUnborn: (branch: string) => string;
  overviewWorktreeUnborn: (branch: string) => string;
  overviewLocalProject: string;
  overviewSeparateWorkspace: string;
  overviewProjectReady: string;
  overviewWorktreeReady: string;
  overviewUnbornReady: string;
  overviewDetachedReady: string;
  overviewOpenAnotherProject: string;
  overviewProjectMenu: string;
  overviewCurrentVersionLine: string;
  overviewSpecificSavedVersion: string;
  overviewNoSavedVersions: string;
  overviewVersionLineDescription: string;
  overviewDetachedDescription: string;
  overviewUnbornDescription: string;
  overviewProjectLocation: string;
  overviewOpenedFrom: string;
  overviewProjectType: string;
  overviewRepositoryTypeDescription: string;
  overviewWorktreeTypeDescription: string;
  overviewTechnicalDetails: string;
  overviewResolvedRoot: string;
  overviewSelectedFolder: string;
  overviewGitDirectory: string;
  overviewCommonGitDirectory: string;
  overviewProjectDetails: string;
  overviewCopyPath: string;
  overviewPathCopied: string;
  overviewOpeningTitle: string;
  overviewOpeningDescription: string;
  overviewOpenFailedTitle: string;
  overviewReviewChanges: string;
  overviewReviewChangesTitle: string;
  overviewCloseProject: string;
  overviewEmptyTitle: string;
  overviewEmptyDescription: string;
  overviewOpening: string;
  overviewOpenProject: string;
  overviewCloneComingSoonTitle: string;
  overviewCloneFromGithub: string;
  overviewOpenDialogTitle: string;
  overviewCouldntOpenFolder: string;
  errorPathMissing: string;
  errorPathUnusable: string;
  errorNotRepository: string;
  errorBareRepository: string;
  errorGitMissing: string;
  errorGitUnusable: string;
  errorGitCommandFailed: string;
  errorInvalidIdentity: string;
  errorGitConfigWriteFailed: string;

  settingsAppearanceTitle: string;
  settingsAppearanceDescription: string;
  themeAriaLabel: string;
  commonSystem: string;
  themeLight: string;
  themeDark: string;

  settingsGeneralTitle: string;
  settingsGeneralDescription: string;
  commonVersion: string;
  settingsGeneralViewAbout: string;
  settingsGeneralGitLabel: string;
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
  commonClose: string;

  closeConfirmTitle: string;
  closeConfirmBodyGeneric: string;
  closeConfirmBodyNamed: (name: string) => string;
  commonCancel: string;
}

const en: Translations = {
  titlebarOpenCommandPalette: "Open command palette",
  titlebarJumpToHint: "Jump to a view or action",
  titlebarJumpTo: "Jump to…",
  titlebarMoreActions: "More actions",
  titlebarHelpSection: "Help",
  titlebarGoBack: "Go back",
  titlebarGoForward: "Go forward",
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
  navChangesTitle: "Changes — Coming soon",
  navHistory: "History",
  navHistoryTitle: "History — Coming soon",
  navRecovery: "Recovery",
  navRecoveryTitle: "Recovery — Coming soon",
  navSettings: "Settings",

  paletteAriaLabel: "Command palette",
  palettePlaceholder: "Jump to a view or action…",
  paletteNoMatches: "No matching commands",

  commandGoOverview: "Go to Overview",
  commandGoSettings: "Go to Settings",
  commandUseSystemTheme: "Use system theme",
  commandUseLightTheme: "Use light theme",
  commandUseDarkTheme: "Use dark theme",

  overviewRepositoryBranch: (branch) => `Git project on version line “${branch}”.`,
  overviewWorktreeBranch: (branch) => `Separate workspace on version line “${branch}”.`,
  overviewRepositoryDetached: "Git project opened at a specific saved version.",
  overviewWorktreeDetached: "Separate workspace opened at a specific saved version.",
  overviewRepositoryUnborn: (branch) => `New Git project on version line “${branch}”, with no saved versions yet.`,
  overviewWorktreeUnborn: (branch) => `New separate workspace on version line “${branch}”, with no saved versions yet.`,
  overviewLocalProject: "Local project",
  overviewSeparateWorkspace: "Separate workspace",
  overviewProjectReady: "Your project is ready",
  overviewWorktreeReady: "Your separate workspace is ready",
  overviewUnbornReady: "Your new project is ready",
  overviewDetachedReady: "A specific saved version is open",
  overviewOpenAnotherProject: "Open another project",
  overviewProjectMenu: "Project actions",
  overviewCurrentVersionLine: "Current version line",
  overviewSpecificSavedVersion: "Specific saved version",
  overviewNoSavedVersions: "No saved versions yet",
  overviewVersionLineDescription: "New work will stay on this version line.",
  overviewDetachedDescription: "You are inspecting an exact point in the project history.",
  overviewUnbornDescription: "The first saved version will start this project’s history.",
  overviewProjectLocation: "Project location",
  overviewOpenedFrom: "Opened from a folder inside this project",
  overviewProjectType: "Project type",
  overviewRepositoryTypeDescription: "A standard project stored in this folder.",
  overviewWorktreeTypeDescription: "A linked workspace with its own files and version line.",
  overviewTechnicalDetails: "Technical project details",
  overviewResolvedRoot: "Project root",
  overviewSelectedFolder: "Folder you selected",
  overviewGitDirectory: "Git directory",
  overviewCommonGitDirectory: "Shared Git directory",
  overviewProjectDetails: "Project details",
  overviewCopyPath: "Copy project path",
  overviewPathCopied: "Path copied",
  overviewOpeningTitle: "Opening project…",
  overviewOpeningDescription: "GitOdrile is checking the selected folder.",
  overviewOpenFailedTitle: "We couldn’t open that project",
  overviewReviewChanges: "Review changes",
  overviewReviewChangesTitle: "Review changes — Coming soon",
  overviewCloseProject: "Close project",
  overviewEmptyTitle: "No project open",
  overviewEmptyDescription:
    "Open a Git project to review changes, save versions, publish work, and recover from mistakes.",
  overviewOpening: "Opening…",
  overviewOpenProject: "Open a project",
  overviewCloneComingSoonTitle: "Coming soon",
  overviewCloneFromGithub: "Clone from GitHub",
  overviewOpenDialogTitle: "Open a Git project",
  overviewCouldntOpenFolder: "Couldn't open that folder.",
  errorPathMissing: "That folder no longer exists. Choose another folder.",
  errorPathUnusable: "That folder can't be read. Check its permissions or choose another folder.",
  errorNotRepository: "That folder isn't inside a Git project. Choose a project folder and try again.",
  errorBareRepository: "That Git repository has no working files, so GitOdrile can't open it yet.",
  errorGitMissing: "Git wasn't found. Install Git, reopen GitOdrile, and try again.",
  errorGitUnusable: "Git is installed but couldn't be started. Check the installation and try again.",
  errorGitCommandFailed: "Git couldn't inspect this project. Check that its files are readable.",
  errorInvalidIdentity: "Enter both a name and an email.",
  errorGitConfigWriteFailed: "Git couldn't save that identity. Check your global Git configuration.",

  settingsAppearanceTitle: "Appearance",
  settingsAppearanceDescription: 'Choose how GitOdrile looks. "System" follows your OS setting automatically.',
  themeAriaLabel: "Theme",
  commonSystem: "System",
  themeLight: "Light",
  themeDark: "Dark",

  settingsGeneralTitle: "General",
  settingsGeneralDescription: "Application information and diagnostics.",
  commonVersion: "Version",
  settingsGeneralViewAbout: "View about",
  settingsGeneralGitLabel: "Git",
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

  settingsIdentityTitle: "Git identity",
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
  startupReopenLabel: "Reopen last project on launch",
  startupReopenDescription: "Skip picking a folder again if you had one open last time.",

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
  commonClose: "Close",

  closeConfirmTitle: "Close this project?",
  closeConfirmBodyGeneric: "The project stays exactly as it is on disk. You can reopen it anytime.",
  closeConfirmBodyNamed: (name) => `"${name}" stays exactly as it is on disk. You can reopen it anytime.`,
  commonCancel: "Cancel",
};

const es: Translations = {
  titlebarOpenCommandPalette: "Abrir la paleta de comandos",
  titlebarJumpToHint: "Ir a una vista o acción",
  titlebarJumpTo: "Ir a…",
  titlebarMoreActions: "Más acciones",
  titlebarHelpSection: "Ayuda",
  titlebarGoBack: "Atrás",
  titlebarGoForward: "Adelante",
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
  navChangesTitle: "Cambios — Próximamente",
  navHistory: "Historial",
  navHistoryTitle: "Historial — Próximamente",
  navRecovery: "Recuperación",
  navRecoveryTitle: "Recuperación — Próximamente",
  navSettings: "Configuración",

  paletteAriaLabel: "Paleta de comandos",
  palettePlaceholder: "Ir a una vista o acción…",
  paletteNoMatches: "No hay coincidencias",

  commandGoOverview: "Ir a Resumen",
  commandGoSettings: "Ir a Configuración",
  commandUseSystemTheme: "Usar el tema del sistema",
  commandUseLightTheme: "Usar el tema claro",
  commandUseDarkTheme: "Usar el tema oscuro",

  overviewRepositoryBranch: (branch) => `Proyecto de Git en la línea de versión «${branch}».`,
  overviewWorktreeBranch: (branch) => `Espacio de trabajo separado en la línea de versión «${branch}».`,
  overviewRepositoryDetached: "Proyecto de Git abierto en una versión guardada concreta.",
  overviewWorktreeDetached: "Espacio de trabajo separado abierto en una versión guardada concreta.",
  overviewRepositoryUnborn: (branch) =>
    `Proyecto de Git nuevo en la línea de versión «${branch}», todavía sin versiones guardadas.`,
  overviewWorktreeUnborn: (branch) =>
    `Espacio de trabajo separado nuevo en la línea de versión «${branch}», todavía sin versiones guardadas.`,
  overviewLocalProject: "Proyecto local",
  overviewSeparateWorkspace: "Espacio de trabajo separado",
  overviewProjectReady: "Tu proyecto está listo",
  overviewWorktreeReady: "Tu espacio de trabajo separado está listo",
  overviewUnbornReady: "Tu nuevo proyecto está listo",
  overviewDetachedReady: "Hay abierta una versión guardada concreta",
  overviewOpenAnotherProject: "Abrir otro proyecto",
  overviewProjectMenu: "Acciones del proyecto",
  overviewCurrentVersionLine: "Línea de versión actual",
  overviewSpecificSavedVersion: "Versión guardada concreta",
  overviewNoSavedVersions: "Todavía no hay versiones guardadas",
  overviewVersionLineDescription: "El trabajo nuevo permanecerá en esta línea de versión.",
  overviewDetachedDescription: "Estás inspeccionando un punto exacto del historial del proyecto.",
  overviewUnbornDescription: "La primera versión guardada iniciará el historial de este proyecto.",
  overviewProjectLocation: "Ubicación del proyecto",
  overviewOpenedFrom: "Abierto desde una carpeta dentro de este proyecto",
  overviewProjectType: "Tipo de proyecto",
  overviewRepositoryTypeDescription: "Un proyecto estándar guardado en esta carpeta.",
  overviewWorktreeTypeDescription: "Un espacio enlazado con sus propios archivos y línea de versión.",
  overviewTechnicalDetails: "Detalles técnicos del proyecto",
  overviewResolvedRoot: "Raíz del proyecto",
  overviewSelectedFolder: "Carpeta que seleccionaste",
  overviewGitDirectory: "Directorio de Git",
  overviewCommonGitDirectory: "Directorio de Git compartido",
  overviewProjectDetails: "Detalles del proyecto",
  overviewCopyPath: "Copiar la ruta del proyecto",
  overviewPathCopied: "Ruta copiada",
  overviewOpeningTitle: "Abriendo el proyecto…",
  overviewOpeningDescription: "GitOdrile está comprobando la carpeta seleccionada.",
  overviewOpenFailedTitle: "No hemos podido abrir ese proyecto",
  overviewReviewChanges: "Revisar cambios",
  overviewReviewChangesTitle: "Revisar cambios — Próximamente",
  overviewCloseProject: "Cerrar proyecto",
  overviewEmptyTitle: "No hay ningún proyecto abierto",
  overviewEmptyDescription:
    "Abre un proyecto de Git para revisar cambios, guardar versiones, publicar tu trabajo y recuperarte de errores.",
  overviewOpening: "Abriendo…",
  overviewOpenProject: "Abrir un proyecto",
  overviewCloneComingSoonTitle: "Próximamente",
  overviewCloneFromGithub: "Clonar desde GitHub",
  overviewOpenDialogTitle: "Abrir un proyecto de Git",
  overviewCouldntOpenFolder: "No se pudo abrir esa carpeta.",
  errorPathMissing: "Esa carpeta ya no existe. Elige otra carpeta.",
  errorPathUnusable: "No se puede leer esa carpeta. Comprueba sus permisos o elige otra.",
  errorNotRepository: "Esa carpeta no está dentro de un proyecto de Git. Elige una carpeta del proyecto.",
  errorBareRepository: "Ese repositorio no contiene archivos de trabajo, así que GitOdrile aún no puede abrirlo.",
  errorGitMissing: "No se encontró Git. Instálalo, vuelve a abrir GitOdrile e inténtalo de nuevo.",
  errorGitUnusable: "Git está instalado, pero no se pudo iniciar. Comprueba la instalación.",
  errorGitCommandFailed: "Git no pudo inspeccionar este proyecto. Comprueba que sus archivos se puedan leer.",
  errorInvalidIdentity: "Introduce un nombre y un correo electrónico.",
  errorGitConfigWriteFailed: "Git no pudo guardar la identidad. Comprueba tu configuración global de Git.",

  settingsAppearanceTitle: "Apariencia",
  settingsAppearanceDescription:
    'Elige el aspecto de GitOdrile. "Sistema" sigue automáticamente el ajuste de tu sistema operativo.',
  themeAriaLabel: "Tema",
  commonSystem: "Sistema",
  themeLight: "Claro",
  themeDark: "Oscuro",

  settingsGeneralTitle: "General",
  settingsGeneralDescription: "Información de la aplicación y diagnósticos.",
  commonVersion: "Versión",
  settingsGeneralViewAbout: "Ver información",
  settingsGeneralGitLabel: "Git",
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

  settingsIdentityTitle: "Identidad de Git",
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
  startupReopenLabel: "Reabrir el último proyecto al iniciar",
  startupReopenDescription: "Evita elegir una carpeta de nuevo si tenías un proyecto abierto la última vez.",

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
  commonClose: "Cerrar",

  closeConfirmTitle: "¿Cerrar este proyecto?",
  closeConfirmBodyGeneric: "El proyecto se mantiene exactamente igual en el disco. Puedes volver a abrirlo cuando quieras.",
  closeConfirmBodyNamed: (name) => `"${name}" se mantiene exactamente igual en el disco. Puedes volver a abrirlo cuando quieras.`,
  commonCancel: "Cancelar",
};

export const translations: Record<Language, Translations> = { en, es };

function readStoredLanguagePreference(): LanguagePreference {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === "en" || stored === "es" ? stored : "system";
}

function readNavigatorLanguage(): Language {
  return resolveLanguage(typeof navigator === "undefined" ? null : navigator.language);
}

interface LanguageContextValue {
  languagePreference: LanguagePreference;
  setLanguagePreference: (preference: LanguagePreference) => void;
  language: Language;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [languagePreference, setLanguagePreferenceState] = useState<LanguagePreference>(() =>
    readStoredLanguagePreference(),
  );
  const [systemLanguage, setSystemLanguage] = useState<Language>(() => readNavigatorLanguage());

  useEffect(() => {
    getOsLocale()
      .then((value) => {
        if (value) {
          setSystemLanguage(resolveLanguage(value));
        }
      })
      .catch(() => undefined);
  }, []);

  const setLanguagePreference = (preference: LanguagePreference): void => {
    setLanguagePreferenceState(preference);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  };

  const language: Language = languagePreference === "system" ? systemLanguage : languagePreference;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value: LanguageContextValue = {
    languagePreference,
    setLanguagePreference,
    language,
    t: translations[language],
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
