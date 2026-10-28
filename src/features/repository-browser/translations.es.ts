import type { en } from "./translations.en";

export const es: Record<keyof typeof en, string> = {
  repositoriesBrowse: "Explorar proyectos",
  repositoriesLoad: "Buscar proyectos", repositoriesRefresh: "Actualizar proyectos", repositoriesLoading: "Buscando proyectos…",
  repositoriesFilter: "Filtrar esta página", repositoriesPage: "Página {page} · {count} proyectos",
  repositoriesPrevious: "Página anterior", repositoriesNext: "Página siguiente", repositoriesChoose: "Elegir {project}",
  repositoriesPrivate: "Privado", repositoriesPublic: "Público", repositoriesArchived: "Archivado",
  repositoriesEmpty: "No hay proyectos en esta página. Los permisos de la conexión y la pertenencia a proyectos pueden limitar los resultados.",
  repositoriesNoMatches: "No hay coincidencias en esta página. Prueba otro filtro o página.",
  repositoriesLoadHint: "Busca los proyectos de @{login} en {host}.",
  repositoriesConnectionHint: "Elige una conexión para buscar tus proyectos.",
  repositoriesDenied: "Se ha denegado el acceso. Revisa los permisos de esta conexión y la pertenencia al proyecto y vuelve a intentarlo.",
  repositoriesError: "No se pudieron leer los proyectos.",
};
