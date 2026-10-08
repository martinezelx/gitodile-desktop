import type { DaySlot } from "./launcher";

/** Home: the greeting, the launcher and setting the computer up. */
export interface HomeTranslations {
  homeCloneRemoteProject: string;
  homeCreateLocalProject: string;
  /** One line under each welcome action, answering "which of these three is
   * mine?" — the labels alone don't separate opening a folder that is already
   * a project from creating or downloading one. */
  homeCreateLocalProjectHint: string;
  homeOpenProjectHint: string;
  homeCloneRemoteProjectHint: string;
  homeRecentProjectsTitle: string;
  /** Home's h1: the part of the day, and the Git identity's first name when
   * there is one. */
  homeGreeting: (slot: DaySlot, name: string | null) => string;
  /** The question under the greeting; `index` is below `PROMPTS_PER_SLOT`. */
  homePrompt: (slot: DaySlot, index: number) => string;
  homeLauncherLabel: string;
  homeLauncherPlaceholder: string;
  /** With no recent projects yet there is nothing to search, only something
   * to paste. */
  homeLauncherPlaceholderFirst: string;
  homeTabsLabel: string;
  homeTabRecent: string;
  homeTabFavourites: string;
  homeContinueKicker: string;
  homeContinueAction: string;
  homeFavouritesEmpty: string;
  homeNoMatches: (query: string) => string;
  homeSectionProjects: string;
  homeSectionActions: string;
  homeSectionRemote: string;
  homeSectionSameName: string;
  homeCloneUrl: (name: string | null) => string;
  homeCloneUrlHint: string;
  homeOpenPath: string;
  homeCreateNamed: (name: string) => string;
  homeCreateNamedHint: string;
  /** The three ways to start, shortened for the launcher's footer; each
   * button's accessible name stays the full label it begins with. */
  homeActionCreate: string;
  homeActionOpen: string;
  homeActionClone: string;
  /** Discovery line for the window's drag-and-drop: the gesture works, and
   * nothing on screen said so. */
  homeDropHint: string;
  homeSetupTitle: string;
  homeSetupProgress: (done: number, total: number) => string;
  homeSetupHide: string;
  homeSetupOptional: string;
  homeSetupGitDone: (version: string) => string;
  homeSetupGitTitle: string;
  homeSetupIdentityTitle: string;
  homeSetupIdentityHint: string;
  homeSetupIdentityDone: (name: string) => string;
  homeSetupIdentityAction: string;
  homeSetupAccountTitle: string;
  homeSetupAccountHint: string;
  homeSetupAccountDone: (login: string) => string;
  homeSetupAccountAction: string;
  homeGitMissingTitle: string;
  homeGitMissingHint: string;
  homeGitUnusableTitle: string;
  homeGitUnusableHint: string;
  homeGitInstall: string;
  homeGitOpenSettings: string;
  homeGitCheckAgain: string;
  homeGitChecking: string;
  /** The card's own status line: what this computer is set up with. */
  homeStatusLabel: string;
  homeStatusGit: (version: string) => string;
  homeStatusIdentityMissing: string;
  homeStatusAccount: (provider: string, login: string) => string;
  homeStatusConnect: string;
  homeStatusConnectAnother: string;
  homeStatusAccounts: (count: number) => string;
  homeStatusAccountGroup: (provider: string, logins: string) => string;
  homeAccountChooser: (provider: string) => string;
  homeAccountSourceConnection: string;
  homeAccountSourceToken: string;
  homeAccountSectionAll: (provider: string) => string;
  homeAccountSection: (provider: string, login: string) => string;
  homeAccountSearchPlaceholder: (provider: string) => string;
  homeAccountLoading: string;
  homeAccountError: string;
  homeAccountRetry: string;
  homeAccountEmpty: string;
  homeAccountNoMatches: (query: string) => string;
  homeAccountMore: string;
  homeRepoPrivate: string;
  homeRepoPublic: string;
  homeRepoArchived: string;
  homeForgetRecentProject: (name: string) => string;
  homeForgetRecentProjectShort: string;
}

const en: HomeTranslations = {
  homeCloneRemoteProject: "Clone a remote project",
  homeCreateLocalProject: "Create a local project",
  homeCreateLocalProjectHint: "A new or existing folder",
  homeOpenProjectHint: "A folder that uses Git",
  homeCloneRemoteProjectHint: "Download from a server",
  homeRecentProjectsTitle: "Recent projects",
  homeGreeting: (slot, name) => {
    const greeting = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" }[slot];
    return name ? `${greeting}, ${name}` : greeting;
  },
  homePrompt: (slot, index) =>
    ({
      morning: ["What are we working on today?", "What's on today?", "Where shall we start?"],
      afternoon: ["What's on this afternoon?", "Pick up where you left off?", "What are we working on now?"],
      evening: ["One last version before you stop?", "What's on tonight?", "Something quick before you call it a day?"],
    })[slot][index] ?? "",
  homeLauncherLabel: "Find a project, or paste a path or URL",
  homeLauncherPlaceholder: "Find a project, paste a path or a URL…",
  homeLauncherPlaceholderFirst: "Paste a project's URL or a folder path…",
  homeTabsLabel: "Show",
  homeTabRecent: "Recent",
  homeTabFavourites: "Favorites",
  homeContinueKicker: "Continue where you left off",
  homeContinueAction: "Continue",
  homeFavouritesEmpty: "Star the projects you use most and they stay here, even after a while away.",
  homeNoMatches: (query) => `No recent project matches “${query}”.`,
  homeSectionProjects: "Projects",
  homeSectionActions: "Actions",
  homeSectionRemote: "A remote project",
  homeSectionSameName: "You already have one with that name",
  homeCloneUrl: (name) => (name ? `Clone ${name} to this computer` : "Clone this project to this computer"),
  homeCloneUrlHint: "Opens Clone with this address filled in",
  homeOpenPath: "Open this folder",
  homeCreateNamed: (name) => `Create a project called “${name}”`,
  homeCreateNamedHint: "You'll choose where in the next step",
  homeActionCreate: "Create",
  homeActionOpen: "Open",
  homeActionClone: "Clone",
  homeDropHint: "or drag a folder here",
  homeSetupTitle: "Set up GitOdile",
  homeSetupProgress: (done, total) => `${done} of ${total}`,
  homeSetupHide: "Hide",
  homeSetupOptional: "Optional",
  homeSetupGitDone: (version) => `Git ${version} is installed`,
  homeSetupGitTitle: "Install Git",
  homeSetupIdentityTitle: "Tell us who you are",
  homeSetupIdentityHint: "Your name and email sign every version you save.",
  homeSetupIdentityDone: (name) => `Saving as ${name}`,
  homeSetupIdentityAction: "Set up",
  homeSetupAccountTitle: "Connect GitHub, GitLab or Bitbucket",
  homeSetupAccountHint: "Clone and publish your projects without typing passwords.",
  homeSetupAccountDone: (login) => `Connected as ${login}`,
  homeSetupAccountAction: "Connect",
  homeGitMissingTitle: "GitOdile needs Git to work",
  homeGitMissingHint: "Git wasn't found on this computer. Install it from Settings, then check again.",
  homeGitUnusableTitle: "Git isn't working",
  homeGitUnusableHint: "Git is installed but didn't run. Settings shows what's wrong.",
  homeGitInstall: "Install Git",
  homeGitOpenSettings: "Open Settings",
  homeGitCheckAgain: "Check again",
  homeGitChecking: "Checking…",
  homeStatusLabel: "This computer",
  homeStatusGit: (version) => `Git ${version}`,
  homeStatusIdentityMissing: "Add your name and email",
  homeStatusAccount: (provider, login) => `${provider} account ${login}`,
  homeStatusConnect: "Connect an account",
  homeStatusConnectAnother: "Connect another account",
  homeStatusAccounts: (count) => `${count} accounts`,
  homeStatusAccountGroup: (provider, logins) => `${provider} accounts ${logins}`,
  homeAccountChooser: (provider) => `${provider} account`,
  homeAccountSourceConnection: "Account",
  homeAccountSourceToken: "Token",
  homeAccountSectionAll: (provider) => `Your projects on ${provider}`,
  homeAccountSection: (provider, login) => `Your projects on ${provider} · ${login}`,
  homeAccountSearchPlaceholder: (provider) => `Search your ${provider} projects…`,
  homeAccountLoading: "Loading your projects…",
  homeAccountError: "Couldn't load your projects.",
  homeAccountRetry: "Try again",
  homeAccountEmpty: "This account has no projects yet.",
  homeAccountNoMatches: (query) => `None of your projects matches “${query}”.`,
  homeAccountMore: "See all in Clone",
  homeRepoPrivate: "Private",
  homeRepoPublic: "Public",
  homeRepoArchived: "Archived",
  homeForgetRecentProject: (name) => `Remove ${name} from recent projects`,
  homeForgetRecentProjectShort: "Remove from recent projects",
};

const es: HomeTranslations = {
  homeCloneRemoteProject: "Clonar un proyecto remoto",
  homeCreateLocalProject: "Crear un proyecto local",
  homeCreateLocalProjectHint: "Carpeta nueva o tuya",
  homeOpenProjectHint: "Una carpeta con Git",
  homeCloneRemoteProjectHint: "Desde un servidor",
  homeRecentProjectsTitle: "Proyectos recientes",
  homeGreeting: (slot, name) => {
    const greeting = { morning: "Buenos días", afternoon: "Buenas tardes", evening: "Buenas noches" }[slot];
    return name ? `${greeting}, ${name}` : greeting;
  },
  homePrompt: (slot, index) =>
    ({
      morning: ["¿En qué trabajamos hoy?", "¿Qué toca hoy?", "¿Por dónde empezamos?"],
      afternoon: ["¿Qué toca esta tarde?", "¿Seguimos donde lo dejaste?", "¿En qué trabajamos ahora?"],
      evening: ["¿Una última versión antes de cerrar?", "¿Qué toca esta noche?", "¿Algo rápido antes de parar?"],
    })[slot][index] ?? "",
  homeLauncherLabel: "Busca un proyecto o pega una ruta o una URL",
  homeLauncherPlaceholder: "Busca un proyecto, pega una ruta o una URL…",
  homeLauncherPlaceholderFirst: "Pega la URL de un proyecto o la ruta de una carpeta…",
  homeTabsLabel: "Mostrar",
  homeTabRecent: "Recientes",
  homeTabFavourites: "Favoritos",
  homeContinueKicker: "Continuar donde lo dejaste",
  homeContinueAction: "Continuar",
  homeFavouritesEmpty: "Marca con la estrella los proyectos que más uses y seguirán aquí aunque lleves tiempo sin abrirlos.",
  homeNoMatches: (query) => `Ningún proyecto reciente coincide con «${query}».`,
  homeSectionProjects: "Proyectos",
  homeSectionActions: "Acciones",
  homeSectionRemote: "Un proyecto remoto",
  homeSectionSameName: "Ya tienes uno con ese nombre",
  homeCloneUrl: (name) => (name ? `Clonar ${name} en este ordenador` : "Clonar este proyecto en este ordenador"),
  homeCloneUrlHint: "Abre Clonar con esta dirección ya puesta",
  homeOpenPath: "Abrir esta carpeta",
  homeCreateNamed: (name) => `Crear un proyecto llamado «${name}»`,
  homeCreateNamedHint: "Elegirás dónde en el siguiente paso",
  homeActionCreate: "Crear",
  homeActionOpen: "Abrir",
  homeActionClone: "Clonar",
  homeDropHint: "o arrastra una carpeta aquí",
  homeSetupTitle: "Prepara GitOdile",
  homeSetupProgress: (done, total) => `${done} de ${total}`,
  homeSetupHide: "Ocultar",
  homeSetupOptional: "Opcional",
  homeSetupGitDone: (version) => `Git ${version} está instalado`,
  homeSetupGitTitle: "Instala Git",
  homeSetupIdentityTitle: "Dinos quién eres",
  homeSetupIdentityHint: "Tu nombre y correo firman cada versión que guardes.",
  homeSetupIdentityDone: (name) => `Guardas como ${name}`,
  homeSetupIdentityAction: "Configurar",
  homeSetupAccountTitle: "Conecta GitHub, GitLab o Bitbucket",
  homeSetupAccountHint: "Clona y publica tus proyectos sin escribir contraseñas.",
  homeSetupAccountDone: (login) => `Conectado como ${login}`,
  homeSetupAccountAction: "Conectar",
  homeGitMissingTitle: "GitOdile necesita Git para funcionar",
  homeGitMissingHint: "No hemos encontrado Git en este ordenador. Instálalo desde Ajustes y vuelve a comprobarlo.",
  homeGitUnusableTitle: "Git no funciona",
  homeGitUnusableHint: "Git está instalado pero no ha arrancado. En Ajustes verás qué pasa.",
  homeGitInstall: "Instalar Git",
  homeGitOpenSettings: "Abrir Ajustes",
  homeGitCheckAgain: "Volver a comprobar",
  homeGitChecking: "Comprobando…",
  homeStatusLabel: "Este ordenador",
  homeStatusGit: (version) => `Git ${version}`,
  homeStatusIdentityMissing: "Falta tu nombre y correo",
  homeStatusAccount: (provider, login) => `Cuenta de ${provider} ${login}`,
  homeStatusConnect: "Conectar una cuenta",
  homeStatusConnectAnother: "Conectar otra cuenta",
  homeStatusAccounts: (count) => `${count} cuentas`,
  homeStatusAccountGroup: (provider, logins) => `Cuentas de ${provider} ${logins}`,
  homeAccountChooser: (provider) => `Cuenta de ${provider}`,
  homeAccountSourceConnection: "Cuenta",
  homeAccountSourceToken: "Token",
  homeAccountSectionAll: (provider) => `Tus proyectos en ${provider}`,
  homeAccountSection: (provider, login) => `Tus proyectos en ${provider} · ${login}`,
  homeAccountSearchPlaceholder: (provider) => `Busca en tus proyectos de ${provider}…`,
  homeAccountLoading: "Cargando tus proyectos…",
  homeAccountError: "No se han podido cargar tus proyectos.",
  homeAccountRetry: "Reintentar",
  homeAccountEmpty: "Esta cuenta aún no tiene proyectos.",
  homeAccountNoMatches: (query) => `Ninguno de tus proyectos coincide con «${query}».`,
  homeAccountMore: "Ver todos en Clonar",
  homeRepoPrivate: "Privado",
  homeRepoPublic: "Público",
  homeRepoArchived: "Archivado",
  homeForgetRecentProject: (name) => `Quitar ${name} de proyectos recientes`,
  homeForgetRecentProjectShort: "Quitar de proyectos recientes",
};

export const homeTranslations = { en, es } as const;
