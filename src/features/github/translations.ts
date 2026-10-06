import type { GitHubAccountChipState, GitHubAuthState } from "./domain";

interface GitHubTranslations {
  githubAuthReconnect: string;
  githubAuthCancel: string;
  githubAuthConfirm: string;
  githubAuthNotNow: string;
  githubAuthDisconnect: string;
  githubAuthUseAccount: string;
  githubAuthUseAccountLabel: string;
  githubAuthChip: Record<GitHubAccountChipState, string>;
  githubAuthLogoutConfirm: string;
  githubAuthLogoutConsent: string;
  githubAuthLogoutBrowser: string;
  githubAuthLogoutDone: string;
  githubAuthShared: string;
  githubAuthStorageConsent: string;
  githubAuthPermissions: string;
  githubAuthFile: string;
  githubAuthEnvironment: string;
  githubAuthUnknownStorage: string;
  githubAuthNeedsCheck: string;
  githubAuthBrowserFailed: string;
  githubAuthOpenBrowser: string;
  githubAuthCopyCode: string;
  githubAuthCopied: string;
  githubAuthCopyFailed: string;
  githubAuthDeviceSteps: string;
  githubAuthStatus: Record<GitHubAuthState, string>;
}

const en: GitHubTranslations = {
  githubAuthReconnect: "Reconnect GitHub", githubAuthCancel: "Cancel connection",
  githubAuthConfirm: "Continue in browser", githubAuthNotNow: "Not now",
  githubAuthDisconnect: "Sign out",
  githubAuthUseAccount: "Use account",
  githubAuthUseAccountLabel: "Use @{login}",
  githubAuthChip: { connected: "Connected", saved: "Saved", unchecked: "Not checked", signed_out: "Not connected", checking: "In progress", invalid: "Reconnect", unavailable: "Unavailable", environment: "Managed externally" },
  githubAuthLogoutConfirm: "Sign out @{login}",
  githubAuthLogoutConsent: "Removes @{login} from GitHub CLI on this computer, for every tool that uses it, and GitHub CLI may switch to another saved account.",
  githubAuthLogoutBrowser: "Your browser session, projects and Git settings don't change.",
  githubAuthLogoutDone: "@{login} was signed out of GitHub CLI on this computer.",
  githubAuthShared: "It's shared with GitHub CLI, so signing out here also signs out the tools that use it.",
  githubAuthStorageConsent: "GitHub CLI saves it in your system's secure store, or in a plain-text file if that fails.",
  githubAuthPermissions: "GitHub opens in your browser to authorize GitHub CLI, private repositories included. Your Git credentials and SSH keys don't change.",
  githubAuthFile: "GitHub CLI stores this credential in a plain-text file on this computer.",
  githubAuthEnvironment: "An environment variable supplies this account. Manage it outside GitOdile.",
  githubAuthUnknownStorage: "Couldn't determine how GitHub CLI stores this credential.",
  githubAuthNeedsCheck: "GitHub CLI may have changed. Check the accounts before trying again.",
  githubAuthBrowserFailed: "Couldn't open the browser. Try again or open https://github.com/login/device yourself.",
  githubAuthOpenBrowser: "Open GitHub", githubAuthCopyCode: "Copy code", githubAuthCopied: "Code copied",
  githubAuthCopyFailed: "Couldn't copy the code. Select and copy it yourself.",
  githubAuthDeviceSteps: "Enter this code in GitHub, authorize GitHub CLI, then return here. To connect another account, switch accounts on GitHub before authorizing. The code expires shortly.",
  githubAuthStatus: {
    unchecked: "Account not checked", checking: "Checking your GitHub account…", signed_out: "No GitHub account connected",
    connected: "Connected", invalid: "Your GitHub authorization is no longer valid. Reconnect to continue.",
    offline: "Couldn't reach GitHub. Check your connection and try again.", login_starting: "Preparing browser connection…",
    signing_out: "Signing out of GitHub CLI…",
    switching: "Switching the active GitHub CLI account…",
    awaiting_browser: "Waiting for GitHub authorization…", cancelling: "Cancelling connection…", cancelled: "Connection cancelled",
    timed_out: "The connection took too long. Check its state or try again.", failed: "Couldn't complete the connection. Check its state or try again.",
    cli_missing: "GitHub CLI couldn't be found. Check the installation below.",
    cli_unsupported: "Update GitHub CLI below to use account connections. This version lacks the required account-status format.",
    environment_controlled: "An environment variable controls GitHub CLI authentication. Manage it outside GitOdile.",
  },
};

const es: GitHubTranslations = {
  githubAuthReconnect: "Reconectar GitHub", githubAuthCancel: "Cancelar conexión",
  githubAuthConfirm: "Continuar en el navegador", githubAuthNotNow: "Ahora no",
  githubAuthDisconnect: "Cerrar sesión",
  githubAuthUseAccount: "Usar cuenta",
  githubAuthUseAccountLabel: "Usar @{login}",
  githubAuthChip: { connected: "Conectada", saved: "Guardada", unchecked: "Sin comprobar", signed_out: "Sin conectar", checking: "En curso", invalid: "Reconectar", unavailable: "No disponible", environment: "Gestión externa" },
  githubAuthLogoutConfirm: "Cerrar sesión de @{login}",
  githubAuthLogoutConsent: "Quita @{login} de GitHub CLI en este equipo, para todas las herramientas que la usan, y GitHub CLI puede pasar a otra cuenta guardada.",
  githubAuthLogoutBrowser: "Tu sesión del navegador, tus proyectos y la configuración de Git no cambian.",
  githubAuthLogoutDone: "Se ha cerrado la sesión de @{login} en GitHub CLI en este ordenador.",
  githubAuthShared: "Se comparte con GitHub CLI, así que cerrar sesión aquí también la cierra en las herramientas que la usan.",
  githubAuthStorageConsent: "GitHub CLI la guarda en el almacén seguro del sistema, o en un archivo sin cifrar si falla.",
  githubAuthPermissions: "GitHub se abre en el navegador para autorizar GitHub CLI, repositorios privados incluidos. Tus credenciales de Git y claves SSH no cambian.",
  githubAuthFile: "GitHub CLI guarda esta credencial en un archivo de texto plano en este ordenador.",
  githubAuthEnvironment: "Una variable de entorno proporciona esta cuenta. Se gestiona fuera de GitOdile.",
  githubAuthUnknownStorage: "No se pudo determinar cómo guarda GitHub CLI esta credencial.",
  githubAuthNeedsCheck: "GitHub CLI puede haber cambiado. Comprueba las cuentas antes de reintentar.",
  githubAuthBrowserFailed: "No se pudo abrir el navegador. Inténtalo de nuevo o abre https://github.com/login/device.",
  githubAuthOpenBrowser: "Abrir GitHub", githubAuthCopyCode: "Copiar código", githubAuthCopied: "Código copiado",
  githubAuthCopyFailed: "No se pudo copiar el código. Selecciónalo y cópialo manualmente.",
  githubAuthDeviceSteps: "Introduce este código en GitHub, autoriza GitHub CLI y vuelve aquí. Para conectar otra cuenta, cámbiala en GitHub antes de autorizar. El código caduca en unos minutos.",
  githubAuthStatus: {
    unchecked: "Cuenta sin comprobar", checking: "Comprobando tu cuenta de GitHub…", signed_out: "Sin cuenta de GitHub conectada",
    connected: "Conectada", invalid: "La autorización de GitHub ya no es válida. Vuelve a conectar tu cuenta.",
    offline: "No se pudo contactar con GitHub. Comprueba tu conexión e inténtalo de nuevo.", login_starting: "Preparando la conexión en el navegador…",
    signing_out: "Cerrando la sesión de GitHub CLI…",
    switching: "Cambiando la cuenta activa de GitHub CLI…",
    awaiting_browser: "Esperando la autorización de GitHub…", cancelling: "Cancelando la conexión…", cancelled: "Conexión cancelada",
    timed_out: "La conexión tardó demasiado. Comprueba su estado o inténtalo de nuevo.", failed: "No se pudo completar la conexión. Comprueba su estado o inténtalo de nuevo.",
    cli_missing: "No se encontró GitHub CLI. Comprueba la instalación de abajo.",
    cli_unsupported: "Actualiza GitHub CLI abajo para conectar cuentas. Esta versión no ofrece el formato de estado necesario.",
    environment_controlled: "Una variable de entorno controla la autenticación de GitHub CLI. Se gestiona fuera de GitOdile.",
  },
};
export const githubTranslations = { en, es };
