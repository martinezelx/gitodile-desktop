import type { en } from "./tokenTranslations.en";

export const es: Record<keyof typeof en, string> = {
  gitlabTokenTitle: "Conexión por token",
  gitlabTokenServerTitle: "Conexión por token · {host}",
  gitlabTokenExists: "Esta cuenta ya tiene un token. Quítalo para reemplazarlo.",
  gitlabTokenLimitReached: "Ya tienes 8 tokens. Quita uno antes.",
  gitlabTokenPermissionsTitle: "¿Qué permisos necesita?",
  gitlabTokenRemovalTitle: "¿Quitar el token de @{login}?",
  gitlabTokenLabel: "Token de acceso personal", gitlabTokenConnect: "Comprobar y conectar",
  gitlabTokenStorage: "Se comprueba con GitLab y se guarda en el almacén seguro del sistema, aparte de GitLab CLI.",
  gitlabTokenPermissions: "read_api para listar proyectos, más read_repository para clonar o write_repository para publicar (api cubre los tres). Reemplázalo cuando caduque.",
  gitlabTokenLimit: "Nunca tu contraseña de GitLab. Hasta 8 tokens.",
  gitlabTokenConnected: "Token comprobado y guardado.", gitlabTokenRemove: "Quitar token",
  gitlabTokenRemoved: "Token quitado.",
  gitlabTokenRemovalConsent: "Los proyectos que lo usan necesitarán otra cuenta, y sigue siendo válido en GitLab hasta que lo revoques allí.",
};
