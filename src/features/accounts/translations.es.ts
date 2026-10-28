import type { en } from "./translations.en";

export const es: Record<keyof typeof en, string> = {
  accountsTokenRejected: "Token rechazado",
  accountsTokenRejectedHint: "{provider} ha rechazado este token guardado. Usa Conectar cuenta para añadir otro token o quita esta conexión.",
  accountsCatalogFailed: "No se pudieron leer las conexiones guardadas. Intenta leerlas de nuevo.",
  accountsRetryRead: "Reintentar lectura de conexiones",
  accountsChoose: "Elige una conexión", accountsTokenMethod: "Token", accountsBrowserMethod: "Navegador", accountsRemove: "Quitar",
  accountsProjectLabel: "Cuenta para el acceso HTTPS",
  accountsUseGit: "Usar las credenciales existentes de Git",
  accountsProjectHelp: "Esta cuenta se usa dentro de GitOdile para HTTPS. SSH utiliza tus claves configuradas. El nombre y correo de tus versiones guardadas son independientes.",
  accountsUnavailable: "{account} · no disponible", accountsNeedsCheck: "Comprobar conexión",
  accountsCheck: "Comprobar conexiones", accountsChecking: "Comprobando conexiones",
  accountsFailed: "No se ha podido comprobar o guardar la cuenta. Comprueba la conexión e inténtalo de nuevo.",
  accountsEmpty: "Conecta una cuenta en Ajustes y detéctala aquí. La detección contacta con el proveedor.",
  accountsProjectTitle: "Acceso HTTPS",
  accountsProjectDescription: "La cuenta que GitOdile usa con cada servidor para obtener cambios y publicar por HTTPS. Se guarda solo en GitOdile: SSH sigue usando tus claves, el autor de tus versiones no cambia y la cuenta activa de la herramienta del proveedor tampoco.",
  accountsSaved: "Cuenta del proyecto guardada.", accountsLoading: "Leyendo la cuenta del proyecto…",
  accountsRemoteSignIn: "Un remoto de este servidor guarda sus propios datos de acceso, así que Git los usa en lugar de esta cuenta. Revisa el remoto de arriba.",
  accountsRemoteInsecure: "Un remoto de este servidor usa HTTP y las cuentas solo se envían por HTTPS. Cámbialo a https:// arriba.",
};
