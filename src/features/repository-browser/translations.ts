const en = {
  repositoriesBrowse: "Browse GitHub projects", repositoriesUrl: "Use a project address",
  repositoriesLoad: "Find projects", repositoriesRefresh: "Refresh projects", repositoriesLoading: "Finding projects…",
  repositoriesFilter: "Filter this page", repositoriesPage: "Page {page} · {count} projects",
  repositoriesPrevious: "Previous page", repositoriesNext: "Next page", repositoriesChoose: "Choose {project}",
  repositoriesPrivate: "Private", repositoriesPublic: "Public", repositoriesArchived: "Archived",
  repositoriesEmpty: "No projects on this page. Token permissions and organization approval can limit what GitHub shows.",
  repositoriesNoMatches: "No matches on this page. Try another filter or page.",
  repositoriesLoadHint: "Refresh to find projects with this connection.",
  repositoriesConnectionHint: "Choose a connection to find your projects.",
  repositoriesUnavailable: "Connect GitHub in Settings, then detect and check accounts here.",
  repositoriesDenied: "GitHub denied access. Check this connection's token permissions and organization approval, then try again.",
  repositoriesError: "Couldn't read GitHub projects.",
};
const es: Record<keyof typeof en, string> = {
  repositoriesBrowse: "Explorar proyectos de GitHub", repositoriesUrl: "Usar la dirección de un proyecto",
  repositoriesLoad: "Buscar proyectos", repositoriesRefresh: "Actualizar proyectos", repositoriesLoading: "Buscando proyectos…",
  repositoriesFilter: "Filtrar esta página", repositoriesPage: "Página {page} · {count} proyectos",
  repositoriesPrevious: "Página anterior", repositoriesNext: "Página siguiente", repositoriesChoose: "Elegir {project}",
  repositoriesPrivate: "Privado", repositoriesPublic: "Público", repositoriesArchived: "Archivado",
  repositoriesEmpty: "No hay proyectos en esta página. Los permisos del token y la aprobación de la organización pueden limitar lo que muestra GitHub.",
  repositoriesNoMatches: "No hay coincidencias en esta página. Prueba otro filtro o página.",
  repositoriesLoadHint: "Actualiza para buscar proyectos con esta conexión.",
  repositoriesConnectionHint: "Elige una conexión para buscar tus proyectos.",
  repositoriesUnavailable: "Conecta GitHub en Ajustes y detecta y comprueba las cuentas aquí.",
  repositoriesDenied: "GitHub ha denegado el acceso. Revisa los permisos del token y la aprobación de la organización para esta conexión y vuelve a intentarlo.",
  repositoriesError: "No se pudieron leer los proyectos de GitHub.",
};
export const repositoryBrowserTranslations = { en, es };
