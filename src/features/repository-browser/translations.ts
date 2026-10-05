const en = {
  repositoriesBrowse: "Browse projects", repositoriesUrl: "Use a project address",
  repositoriesLoad: "Find projects", repositoriesRefresh: "Refresh projects", repositoriesLoading: "Finding projects…",
  repositoriesFilter: "Filter this page", repositoriesPage: "Page {page} · {count} projects",
  repositoriesPrevious: "Previous page", repositoriesNext: "Next page", repositoriesChoose: "Choose {project}",
  repositoriesPrivate: "Private", repositoriesPublic: "Public", repositoriesArchived: "Archived",
  repositoriesEmpty: "No projects on this page. Connection permissions and project membership can limit the results.",
  repositoriesNoMatches: "No matches on this page. Try another filter or page.",
  repositoriesLoadHint: "Refresh to find projects with this connection.",
  repositoriesConnectionHint: "Choose a connection to find your projects.",
  repositoriesUnavailable: "Connect an account in Settings, then detect and check accounts here.",
  repositoriesDenied: "Access was denied. Check this connection's permissions and project membership, then try again.",
  repositoriesError: "Couldn't read projects.",
};
const es: Record<keyof typeof en, string> = {
  repositoriesBrowse: "Explorar proyectos", repositoriesUrl: "Usar la dirección de un proyecto",
  repositoriesLoad: "Buscar proyectos", repositoriesRefresh: "Actualizar proyectos", repositoriesLoading: "Buscando proyectos…",
  repositoriesFilter: "Filtrar esta página", repositoriesPage: "Página {page} · {count} proyectos",
  repositoriesPrevious: "Página anterior", repositoriesNext: "Página siguiente", repositoriesChoose: "Elegir {project}",
  repositoriesPrivate: "Privado", repositoriesPublic: "Público", repositoriesArchived: "Archivado",
  repositoriesEmpty: "No hay proyectos en esta página. Los permisos de la conexión y la pertenencia a proyectos pueden limitar los resultados.",
  repositoriesNoMatches: "No hay coincidencias en esta página. Prueba otro filtro o página.",
  repositoriesLoadHint: "Actualiza para buscar proyectos con esta conexión.",
  repositoriesConnectionHint: "Elige una conexión para buscar tus proyectos.",
  repositoriesUnavailable: "Conecta una cuenta en Ajustes y detecta y comprueba las cuentas aquí.",
  repositoriesDenied: "Se ha denegado el acceso. Revisa los permisos de esta conexión y la pertenencia al proyecto y vuelve a intentarlo.",
  repositoriesError: "No se pudieron leer los proyectos.",
};
export const repositoryBrowserTranslations = { en, es };
