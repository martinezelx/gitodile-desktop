import type { GitHubAccountChipState, GitHubAuthState } from "./domain";

interface GitHubTranslations {
  githubAuthDetect: string;
  githubAuthCheck: string;
  githubAuthConnect: string;
  githubAuthReconnect: string;
  githubAuthCancel: string;
  githubAuthConfirm: string;
  githubAuthNotNow: string;
  githubAuthDisconnect: string;
  githubAuthAccountName: string;
  githubAuthConnectAnother: string;
  githubAuthUseAccount: string;
  githubAuthUseAccountLabel: string;
  githubAuthSelectedPurpose: string;
  githubAuthChip: Record<GitHubAccountChipState, string>;
  githubAuthLogoutConfirm: string;
  githubAuthLogoutConsent: string;
  githubAuthLogoutBrowser: string;
  githubAuthLogoutDone: string;
  githubAuthShared: string;
  githubAuthStorageConsent: string;
  githubAuthPermissions: string;
  githubAuthNetwork: string;
  githubAuthMissing: string;
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
  githubAuthDetect: "Detect GitHub CLI account", githubAuthCheck: "Check connection",
  githubAuthConnect: "Connect GitHub", githubAuthReconnect: "Reconnect GitHub", githubAuthCancel: "Cancel connection",
  githubAuthConfirm: "Continue in browser", githubAuthNotNow: "Not now",
  githubAuthDisconnect: "Sign out",
  githubAuthAccountName: "GitHub account",
  githubAuthConnectAnother: "Connect another account",
  githubAuthUseAccount: "Use account",
  githubAuthUseAccountLabel: "Use @{login}",
  githubAuthSelectedPurpose: "This is GitHub CLI's active account. Choose the account for each project separately in project settings.",
  githubAuthChip: { connected: "Connected", saved: "Saved", unchecked: "Not checked", signed_out: "Not connected", checking: "In progress", invalid: "Reconnect", unavailable: "Unavailable", environment: "Managed externally" },
  githubAuthLogoutConfirm: "Sign out @{login}",
  githubAuthLogoutConsent: "This removes @{login} from GitHub CLI on this computer, including other tools that use its session. If another account is saved, GitHub CLI may activate it. You can connect another account afterward.",
  githubAuthLogoutBrowser: "Your GitHub browser session and GitHub CLI authorization on GitHub remain active. Local project files and Git configuration are unchanged.",
  githubAuthLogoutDone: "@{login} was signed out of GitHub CLI on this computer.",
  githubAuthShared: "This account is shared with GitHub CLI and other tools that use it. Switching accounts or signing out also affects those tools.",
  githubAuthStorageConsent: "GitHub CLI tries to use your system credential store. If it fails, it may save the token in a plain-text file.",
  githubAuthPermissions: "GitHub will ask you to authorize GitHub CLI, including access to private repositories. Git credentials and SSH keys are not changed.",
  githubAuthNetwork: "Detection contacts GitHub to check the accounts saved on this computer. Local projects do not need this connection.",
  githubAuthMissing: "Install GitHub CLI below to connect your account.",
  githubAuthFile: "GitHub CLI stores this credential in a plain-text file on this computer.",
  githubAuthEnvironment: "An environment variable supplies this account. Manage it outside GitOdile.",
  githubAuthUnknownStorage: "Couldn't determine how GitHub CLI stores this credential.",
  githubAuthNeedsCheck: "GitHub CLI credentials may have changed. Check the connection before trying again.",
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
  githubAuthDetect: "Detectar cuenta de GitHub CLI", githubAuthCheck: "Comprobar conexión",
  githubAuthConnect: "Conectar GitHub", githubAuthReconnect: "Reconectar GitHub", githubAuthCancel: "Cancelar conexión",
  githubAuthConfirm: "Continuar en el navegador", githubAuthNotNow: "Ahora no",
  githubAuthDisconnect: "Cerrar sesión",
  githubAuthAccountName: "Cuenta de GitHub",
  githubAuthConnectAnother: "Conectar otra cuenta",
  githubAuthUseAccount: "Usar cuenta",
  githubAuthUseAccountLabel: "Usar @{login}",
  githubAuthSelectedPurpose: "Esta es la cuenta activa de GitHub CLI. Elige la cuenta de cada proyecto por separado en sus ajustes.",
  githubAuthChip: { connected: "Conectada", saved: "Guardada", unchecked: "Sin comprobar", signed_out: "Sin conectar", checking: "En curso", invalid: "Reconectar", unavailable: "No disponible", environment: "Gestión externa" },
  githubAuthLogoutConfirm: "Cerrar sesión de @{login}",
  githubAuthLogoutConsent: "Se eliminará @{login} de GitHub CLI en este ordenador, también para las otras herramientas que usan su sesión. Si hay otra cuenta guardada, GitHub CLI puede activarla. Después podrás conectar otra cuenta.",
  githubAuthLogoutBrowser: "La sesión del navegador y la autorización de GitHub CLI en GitHub seguirán activas. Los archivos de tus proyectos y la configuración de Git no cambian.",
  githubAuthLogoutDone: "Se ha cerrado la sesión de @{login} en GitHub CLI en este ordenador.",
  githubAuthShared: "Esta cuenta se comparte con GitHub CLI y otras herramientas que la utilizan. Cambiar de cuenta o cerrar sesión también afecta a esas herramientas.",
  githubAuthStorageConsent: "GitHub CLI intenta usar el almacén de credenciales del sistema. Si falla, puede guardar el token en un archivo de texto plano.",
  githubAuthPermissions: "GitHub te pedirá autorizar GitHub CLI, incluido el acceso a proyectos privados. Las credenciales de Git y las claves SSH no cambian.",
  githubAuthNetwork: "La detección contacta con GitHub para comprobar las cuentas guardadas en este ordenador. Los proyectos locales no necesitan esta conexión.",
  githubAuthMissing: "Instala GitHub CLI abajo para conectar tu cuenta.",
  githubAuthFile: "GitHub CLI guarda esta credencial en un archivo de texto plano en este ordenador.",
  githubAuthEnvironment: "Una variable de entorno proporciona esta cuenta. Se gestiona fuera de GitOdile.",
  githubAuthUnknownStorage: "No se pudo determinar cómo guarda GitHub CLI esta credencial.",
  githubAuthNeedsCheck: "Las credenciales de GitHub CLI pueden haber cambiado. Comprueba la conexión antes de volver a intentarlo.",
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
