import type { GitLabAuthState } from "./domain";

interface GitLabTranslations {
  gitlabAuthCheck: string;
  gitlabAuthConnect: string;
  gitlabAuthCancel: string;
  gitlabAuthConfirm: string;
  gitlabAuthDisconnect: string;
  gitlabAuthAccountName: string;
  gitlabAuthSelectedPurpose: string;
  gitlabAuthChip: Record<"connected" | "saved" | "unchecked" | "signed_out" | "checking" | "invalid" | "unavailable" | "environment", string>;
  gitlabAuthLogoutConsent: string;
  gitlabAuthLogoutBrowser: string;
  gitlabAuthShared: string;
  gitlabAuthStorageConsent: string;
  gitlabAuthPermissions: string;
  gitlabAuthMissing: string;
  gitlabAuthNeedsCheck: string;
  gitlabAuthStatus: Record<GitLabAuthState, string>;
}

const en: GitLabTranslations = {
  gitlabAuthCheck: "Check connection",
  gitlabAuthConnect: "Connect GitLab", gitlabAuthCancel: "Cancel connection",
  gitlabAuthConfirm: "Continue in browser",
  gitlabAuthDisconnect: "Sign out",
  gitlabAuthAccountName: "GitLab account",
  gitlabAuthSelectedPurpose: "glab connects one GitLab.com account at a time. Choose it for each project separately. Use token connections above for independent accounts.",
  gitlabAuthChip: { connected: "Connected", saved: "Saved", unchecked: "Not checked", signed_out: "Not connected", checking: "In progress", invalid: "Reconnect", unavailable: "Unavailable", environment: "Managed externally" },
  gitlabAuthLogoutConsent: "This removes @{login} from GitLab CLI on this computer, including other tools that use its session. You can explicitly connect another account afterward.",
  gitlabAuthLogoutBrowser: "Your GitLab browser session and GitLab CLI authorization on GitLab remain active. Local project files and Git configuration are unchanged.",
  gitlabAuthShared: "This account is shared with GitLab CLI and other tools that use it. Switching accounts or signing out also affects those tools.",
  gitlabAuthStorageConsent: "glab owns storage and OAuth renewal. It tries your system credential store and may fall back to a plaintext configuration file.",
  gitlabAuthPermissions: "GitLab opens in your browser to authorize glab (read_user, api and write_repository access). Return here after approving. This uses the registered glab application.",
  gitlabAuthMissing: "Install GitLab CLI below to connect your account.",
  gitlabAuthNeedsCheck: "GitLab CLI credentials may have changed. Check the connection before trying again.",
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
  gitlabAuthCheck: "Comprobar conexión",
  gitlabAuthConnect: "Conectar GitLab", gitlabAuthCancel: "Cancelar conexión",
  gitlabAuthConfirm: "Continuar en el navegador",
  gitlabAuthDisconnect: "Cerrar sesión",
  gitlabAuthAccountName: "Cuenta de GitLab",
  gitlabAuthSelectedPurpose: "glab conecta una cuenta de GitLab.com cada vez. Elígela por separado en los ajustes de cada proyecto. Usa los tokens de arriba para cuentas independientes.",
  gitlabAuthChip: { connected: "Conectada", saved: "Guardada", unchecked: "Sin comprobar", signed_out: "Sin conectar", checking: "En curso", invalid: "Reconectar", unavailable: "No disponible", environment: "Gestión externa" },
  gitlabAuthLogoutConsent: "Se eliminará @{login} de GitLab CLI en este ordenador, también para las otras herramientas que usan su sesión. Después podrás conectar otra cuenta de forma explícita.",
  gitlabAuthLogoutBrowser: "La sesión del navegador y la autorización de GitLab CLI en GitLab seguirán activas. Los archivos de tus proyectos y la configuración de Git no cambian.",
  gitlabAuthShared: "Esta cuenta se comparte con GitLab CLI y otras herramientas que la utilizan. Cambiar de cuenta o cerrar sesión también afecta a esas herramientas.",
  gitlabAuthStorageConsent: "glab gestiona el almacenamiento y la renovación OAuth. Intenta usar el almacén seguro del sistema y puede recurrir a un archivo de configuración sin cifrar.",
  gitlabAuthPermissions: "GitLab se abre en tu navegador para autorizar glab (permisos read_user, api y write_repository). Vuelve aquí después de aprobar. Se usa la aplicación registrada de glab.",
  gitlabAuthMissing: "Instala GitLab CLI abajo para conectar tu cuenta.",
  gitlabAuthNeedsCheck: "Las credenciales de GitLab CLI pueden haber cambiado. Comprueba la conexión antes de volver a intentarlo.",
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
