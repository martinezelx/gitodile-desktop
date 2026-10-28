import type { GitLabTranslations } from "./translations";

export const es: GitLabTranslations = {
  gitlabAuthRepairDetails: "Cómo reparar esta conexión",
  gitlabAuthRepairHint: "Repara o elimina la sesión de navegador de este servidor con GitLab CLI (glab) y comprueba las conexiones aquí. Las conexiones por token son independientes.",
  gitlabAuthCancel: "Cancelar conexión",
  gitlabAuthConfirm: "Continuar en el navegador",
  gitlabAuthDisconnect: "Cerrar sesión",
  gitlabAuthAccountName: "Cuenta de GitLab",
  gitlabAuthChip: { connected: "Conectada", saved: "Guardada", unchecked: "Pendiente de comprobar", signed_out: "Sin conectar", checking: "En curso", invalid: "Revisa la conexión", unavailable: "No disponible", environment: "Gestión externa" },
  gitlabAuthLogoutConsent: "Quita @{login} de GitLab CLI en este equipo, para todas las herramientas que la usan.",
  gitlabAuthLogoutBrowser: "Tu sesión del navegador, tus proyectos y la configuración de Git no cambian.",
  gitlabAuthShared: "Se comparte con GitLab CLI, así que cerrar sesión aquí también la cierra en las herramientas que la usan.",
  gitlabAuthStorageConsent: "GitLab CLI la guarda y la renueva, en el almacén seguro del sistema o en un archivo sin cifrar si falla.",
  gitlabAuthPermissions: "GitLab se abre en el navegador para autorizar GitLab CLI (read_user, api y write_repository).",
  gitlabAuthNeedsCheck: "GitLab CLI puede haber cambiado. Comprueba las cuentas antes de reintentar.",
  gitlabAuthStatus: {
    unchecked: "Cuenta sin comprobar", checking: "Comprobando tu cuenta de GitLab…", signed_out: "Sin cuenta de GitLab conectada",
    connected: "Conectada", invalid: "La conexión con GitLab mediante el navegador ya no es válida.",
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
