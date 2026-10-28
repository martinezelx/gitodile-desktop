import type { en } from "./translations.en";

export const es: typeof en = {
  bitbucketAccountsDescription: "Las cuentas de Bitbucket se conectan con un token de API. Elige una al clonar o en los ajustes de cada proyecto.",
  bitbucketTokenTitle: "Token de Bitbucket",
  bitbucketTokenLabel: "Token de API",
  bitbucketTokenConnect: "Comprobar y conectar",
  bitbucketTokenChecking: "Comprobando con Bitbucket…",
  bitbucketTokenConnected: "Token comprobado y guardado.",
  bitbucketTokenExists: "Esta cuenta ya tiene un token. Quítalo para reemplazarlo.",
  bitbucketTokenLimit: "Un token de API de Atlassian con permisos, nunca tu contraseña ni una contraseña de aplicación. Hasta 8 tokens.",
  bitbucketTokenLimitReached: "Ya tienes 8 tokens. Quita uno antes.",
  bitbucketTokenPermissionsTitle: "¿Qué permisos necesita?",
  bitbucketTokenPermissions: "Créalo en los ajustes de tu cuenta de Atlassian como token de API con permisos para Bitbucket: read:user:bitbucket y read:workspace:bitbucket para identificarte y listar workspaces, read:repository:bitbucket para clonar, más write:repository:bitbucket para publicar. Caduca en la fecha que elijas; reemplázalo entonces.",
  bitbucketTokenStorage: "Se comprueba con Bitbucket y se guarda en el almacén seguro del sistema.",
  bitbucketTokenRemovalTitle: "¿Quitar el token de {login}?",
  bitbucketTokenRemovalConsent: "Los proyectos que lo usan necesitarán otra cuenta, y sigue siendo válido en Atlassian hasta que lo revoques allí.",
  bitbucketTokenRemove: "Quitar token",
  bitbucketTokenRemoved: "Token quitado.",
  bitbucketTokenFailed: "No se pudo comprobar el token con Bitbucket. Revisa sus permisos, su caducidad y tu conexión.",
  bitbucketTokenPermissionDenied: "Bitbucket rechazó este token. Crea uno con los permisos que indica la pregunta sobre permisos.",
  bitbucketTokenChip: { signed_out: "Sin conectar", checking: "En curso", connected: "Conectada", invalid: "Reconectar", unchecked: "Sin comprobar" },
};
