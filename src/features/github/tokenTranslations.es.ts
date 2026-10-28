import type { en } from "./tokenTranslations.en";

export const es: Record<keyof typeof en, string> = {
  githubTokenTitle: "Conexión por token",
  githubTokenServerTitle: "Conexión por token · {host}",
  githubTokenServerPermissions: "Créalo en este servidor. Los tokens clásicos necesitan el ámbito repo. Los específicos, si existen, necesitan Metadata y Contents (lectura, o lectura y escritura para publicar). Con SAML, autorízalo para tu organización.",
  githubTokenExists: "Esta cuenta ya tiene un token. Quítalo para reemplazarlo.",
  githubTokenLimitReached: "Ya tienes 8 tokens. Quita uno antes.",
  githubTokenPermissionsTitle: "¿Qué permisos necesita?",
  githubTokenRemovalTitle: "¿Quitar el token de @{login}?",
  githubTokenLabel: "Token de acceso personal", githubTokenConnect: "Comprobar y conectar",
  githubTokenStorage: "Se comprueba con GitHub y se guarda en el almacén seguro del sistema, aparte de GitHub CLI.",
  githubTokenPermissions: "Los tokens específicos necesitan Metadata y Contents (lectura, o lectura y escritura para publicar) en los proyectos que elijas. Los clásicos, el ámbito repo. Puede que tu organización tenga que aprobarlo.",
  githubTokenLimit: "Nunca tu contraseña de GitHub. Hasta 8 tokens.",
  githubTokenConnected: "Token comprobado y guardado.", githubTokenRemove: "Quitar token",
  githubTokenRemoved: "Token quitado.",
  githubTokenRemovalConsent: "Los proyectos que lo usan necesitarán otra cuenta, y sigue siendo válido en GitHub hasta que lo revoques allí.",
};
