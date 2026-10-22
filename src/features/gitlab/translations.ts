import type { GitLabAuthState } from "./domain";

interface GitLabTranslations {
  gitlabAuthCancel: string;
  gitlabAuthConfirm: string;
  gitlabAuthDisconnect: string;
  gitlabAuthAccountName: string;
  gitlabAuthChip: Record<"connected" | "saved" | "unchecked" | "signed_out" | "checking" | "invalid" | "unavailable" | "environment", string>;
  gitlabAuthLogoutConsent: string;
  gitlabAuthLogoutBrowser: string;
  gitlabAuthShared: string;
  gitlabAuthStorageConsent: string;
  gitlabAuthPermissions: string;
  gitlabAuthNeedsCheck: string;
  gitlabAuthStatus: Record<GitLabAuthState, string>;
}

const en: GitLabTranslations = {
  gitlabAuthCancel: "Cancel connection",
  gitlabAuthConfirm: "Continue in browser",
  gitlabAuthDisconnect: "Sign out",
  gitlabAuthAccountName: "GitLab account",
  gitlabAuthChip: { connected: "Connected", saved: "Saved", unchecked: "Not checked", signed_out: "Not connected", checking: "In progress", invalid: "Reconnect", unavailable: "Unavailable", environment: "Managed externally" },
  gitlabAuthLogoutConsent: "Removes @{login} from GitLab CLI on this computer, for every tool that uses it.",
  gitlabAuthLogoutBrowser: "Your browser session, projects and Git settings don't change.",
  gitlabAuthShared: "It's shared with GitLab CLI, so signing out here also signs out the tools that use it.",
  gitlabAuthStorageConsent: "GitLab CLI saves and renews it, in your system's secure store or in a plain-text file if that fails.",
  gitlabAuthPermissions: "GitLab opens in your browser to authorize GitLab CLI (read_user, api and write_repository).",
  gitlabAuthNeedsCheck: "GitLab CLI may have changed. Check the accounts before trying again.",
  gitlabAuthStatus: {
    unchecked: "Account not checked", checking: "Checking your GitLab account…", signed_out: "No GitLab account connected",
    connected: "Connected", invalid: "Your GitLab CLI authorization is invalid. Repair or remove it with glab, then check here again. Token connections above remain independent.",
    offline: "Couldn't reach GitLab. Check your connection and try again.", login_starting: "Preparing browser connection…",
    signing_out: "Signing out of GitLab CLI…",
    switching: "Switching the active GitLab CLI account…",
    awaiting_browser: "Waiting for GitLab authorization…", cancelling: "Cancelling connection…", cancelled: "Connection cancelled",
    timed_out: "The connection took too long. Check its state or try again.", failed: "Couldn't complete the connection. Check its state or try again.",
    cli_missing: "GitLab CLI couldn't be found. Check the installation below.",
    cli_unsupported: "Update glab to 1.120.0 or later. This connection requires its native credential interface.",
    environment_controlled: "An environment variable controls GitLab CLI authentication. Manage it outside GitOdile.",
  },
};

const es: GitLabTranslations = {
  gitlabAuthCancel: "Cancelar conexión",
  gitlabAuthConfirm: "Continuar en el navegador",
  gitlabAuthDisconnect: "Cerrar sesión",
  gitlabAuthAccountName: "Cuenta de GitLab",
  gitlabAuthChip: { connected: "Conectada", saved: "Guardada", unchecked: "Sin comprobar", signed_out: "Sin conectar", checking: "En curso", invalid: "Reconectar", unavailable: "No disponible", environment: "Gestión externa" },
  gitlabAuthLogoutConsent: "Quita @{login} de GitLab CLI en este equipo, para todas las herramientas que la usan.",
  gitlabAuthLogoutBrowser: "Tu sesión del navegador, tus proyectos y la configuración de Git no cambian.",
  gitlabAuthShared: "Se comparte con GitLab CLI, así que cerrar sesión aquí también la cierra en las herramientas que la usan.",
  gitlabAuthStorageConsent: "GitLab CLI la guarda y la renueva, en el almacén seguro del sistema o en un archivo sin cifrar si falla.",
  gitlabAuthPermissions: "GitLab se abre en el navegador para autorizar GitLab CLI (read_user, api y write_repository).",
  gitlabAuthNeedsCheck: "GitLab CLI puede haber cambiado. Comprueba las cuentas antes de reintentar.",
  gitlabAuthStatus: {
    unchecked: "Cuenta sin comprobar", checking: "Comprobando tu cuenta de GitLab…", signed_out: "Sin cuenta de GitLab conectada",
    connected: "Conectada", invalid: "La autorización de GitLab CLI no es válida. Repárala o elimínala con glab y vuelve a comprobarla aquí. Los tokens de arriba siguen siendo independientes.",
    offline: "No se pudo contactar con GitLab. Comprueba tu conexión e inténtalo de nuevo.", login_starting: "Preparando la conexión en el navegador…",
    signing_out: "Cerrando la sesión de GitLab CLI…",
    switching: "Cambiando la cuenta activa de GitLab CLI…",
    awaiting_browser: "Esperando la autorización de GitLab…", cancelling: "Cancelando la conexión…", cancelled: "Conexión cancelada",
    timed_out: "La conexión tardó demasiado. Comprueba su estado o inténtalo de nuevo.", failed: "No se pudo completar la conexión. Comprueba su estado o inténtalo de nuevo.",
    cli_missing: "No se encontró GitLab CLI. Comprueba la instalación de abajo.",
    cli_unsupported: "Actualiza glab a 1.120.0 o posterior. Esta conexión requiere su interfaz nativa de credenciales.",
    environment_controlled: "Una variable de entorno controla la autenticación de GitLab CLI. Se gestiona fuera de GitOdile.",
  },
};
export const gitlabTranslations = { en, es };
