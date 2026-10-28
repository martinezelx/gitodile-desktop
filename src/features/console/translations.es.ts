import type { ConsoleTier } from "./port";
import type { ConsoleTranslations } from "./translations";
import { formatDuration } from "./translations";

const ES_TIER_EFFECTS: Record<ConsoleTier, string> = {
  read: "solo lee el proyecto", local_change: "cambia el proyecto", history_change: "reescribe el historial guardado",
  remote: "se comunica con la copia remota", destructive: "puede descartar trabajo", never: "no está disponible",
};

export const es: ConsoleTranslations = {
  consoleTitle: "Consola", consoleShortcuts: "Atajos",
  consolePromptLabel: "Comando de consola", consolePromptOn: "en",
  consoleHintComplete: "Tab completa · Intro ejecuta", consoleHintNavigate: "↑↓ historial · Ctrl+L limpia",
  consoleEmpty: "Escribe help para ver los atajos, o un comando Git como git log --oneline.",
  consoleWelcomeProject: "proyecto", consoleWelcomeBranch: "rama", consoleWelcomeGit: "git", consoleWelcomeConfirm: "confirmar",
  consoleWelcomeConfirmOn: "antes de cada cambio", consoleWelcomeConfirmOff: "desactivada",
  consoleWelcomeProvider: "proveedor",
  consoleProvider: (host) => {
    switch (host.kind) {
      case "github": return host.companyServer ? `GitHub Enterprise · ${host.host}` : "GitHub";
      case "gitlab": return host.companyServer ? `GitLab Self-Managed · ${host.host}` : "GitLab";
      case "bitbucket": return "Bitbucket";
      case "git": return host.host ? `servidor Git · ${host.host}` : "servidor Git";
      case "local": return "solo este ordenador";
      case "unclear": return "varios remotos";
    }
  },
  consoleWelcomeProjectSection: "proyecto", consoleWelcomeEnvironmentSection: "entorno",
  consoleWelcomeChanges: "cambios", consoleWelcomePublish: "publicar", consoleWelcomeTheme: "tema",
  consoleWelcomeUnpublished: (versions) => `${versions} ${versions === 1 ? "versión" : "versiones"}`, consoleWelcomeUpToDate: "al día",
  consoleStatusSaved: "todo guardado",
  consoleStatusUnsaved: (files) => `${files} sin guardar`,
  consoleStatusIncoming: (versions) => `↓${versions} nuevas`,
  consoleHelpIntro: "Atajos disponibles (solo lectura)",
  consoleHelpNames: "Atajo", consoleHelpMeaning: "Qué muestra", consoleHelpCommand: "Comando Git",
  consoleShortcutOwnLine: "Tu comando",
  consoleDefaultLines: {
    short: "Estado del proyecto compacto", stat: "Cambios sin preparar por archivo", today: "Versiones guardadas hoy",
    week: "Versiones guardadas esta semana", unpublished: "Versiones guardadas sin publicar",
    incoming: "Cambios nuevos ya obtenidos", moves: "Últimos movimientos de HEAD",
    "all-branches": "Todas las ramas, locales y remotas", size: "Cuánto almacena el proyecto",
  }, consoleHelpActions: "Además: help git lista los comandos Git que puedes escribir, clear vacía la vista, shortcuts edita los nombres y settings abre los ajustes de la consola.",
  consoleControlHelp: "Ver los atajos", consoleControlClear: "Limpiar la vista", consoleControlShortcuts: "Editar los nombres",
  consoleControlSettings: "Abrir los ajustes de la consola", consoleOpenSettings: "Ajustes de la consola",
  consoleCompletions: "Atajos que coinciden", consoleStatusLine: "Estado de la consola", consoleSearch: "Buscar o hacer algo…", consoleSearchLabel: "Abrir la paleta de comandos",
  consoleStatusConfirm: "confirma cambios",
  consoleStatusConfirmShort: "Confirma",
  consoleStatusNoConfirm: "sin confirmación",
  consoleStatusNoConfirmShort: "Sin confirmar",
  consoleCopy: "Copiar salida", consoleCopied: "Copiado", consoleRerun: "Repetir",
  consoleDuration: (ms) => formatDuration(ms, "es"), consoleTruncatedShort: "Acortada", consoleSucceeded: "Terminada",
  consoleUnknown: (input) => `«${input}» no es un atajo ni un comando Git. Escribe help para ver los nombres, o help git para los comandos Git.`,
  consoleRunning: "Ejecutando consulta…", consoleDone: "Consulta terminada.", consoleNoOutput: "Esta consulta no produjo salida.",
  consoleFailed: (code) => `Git terminó con un error${code === null ? "" : ` (código ${code})`}.`,
  consoleTruncated: "Se ha acortado la salida para mantener la consola ágil.",
  consoleRequestFailed: "No se pudo ejecutar la consulta. Comprueba el proyecto e inténtalo de nuevo.",
  consoleShortcutsTitle: "Atajos de consola", consoleShortcutsDescription: "Valen para todos tus proyectos y cada uno ejecuta un comando Git.",
  consoleShortcutName: "Nombre del atajo", consoleShortcutTarget: "Consulta", consoleQueryPrevious: "Consulta anterior", consoleQueryNext: "Consulta siguiente", consoleShortcutAdd: "Añadir atajo",
  consoleShortcutRename: "Renombrar", consoleShortcutRemove: "Eliminar", consoleShortcutSave: "Guardar nombre",
  consoleShortcutCancel: "Cancelar", consoleShortcutReset: "Restaurar predeterminados", consoleShortcutClose: "Cerrar atajos",
  consoleShortcutInvalid: "Usa entre 1 y 20 letras minúsculas, números o guiones; empieza por una letra.",
  consoleShortcutReserved: "Ese nombre está reservado para una acción de la consola.",
  consoleShortcutDuplicate: "Ese nombre de atajo ya está en uso.",
  consoleShortcutLimit: "Puedes guardar hasta 32 atajos.",
  consoleShortcutStorageError: "No se pudo guardar el atajo en este dispositivo.",
  consoleShortcutLineOption: "Comando Git", consoleShortcutLine: "Comando Git",
  consoleShortcutLineInvalid: "Escribe un comando Git que empiece por git, como git log --oneline -20.",
  consoleShortcutChecking: "Comprobando el comando…",
  consoleShortcutWidened: (name) => `«${name}» se guardó como un comando de solo lectura y ahora pide más, así que no se ha ejecutado. Edita el atajo para seguir usándolo.`,
  consoleHelpGitIntro: "Comandos Git que solo consultan el proyecto", consoleHelpGitCommand: "Comando",
  consoleHelpGitFooter: "Los comandos que cambian el proyecto o se comunican con la copia remota, como git add, git commit -m, git switch, git fetch y git push, también se ejecutan aquí, cada uno mostrado antes. Los que reescriben el historial guardado, pueden descartar trabajo, abren un editor o ejecutan otro programa no están disponibles aquí.",
  consoleGitCommands: {
    status: "Estado del proyecto", log: "Versiones guardadas, de la más reciente", show: "Una versión guardada, o un archivo en ella",
    diff: "Cambios entre versiones o archivos", blame: "Quién cambió por última vez cada línea", grep: "Buscar en los archivos del proyecto",
    branch: "Ramas", tag: "Etiquetas", reflog: "Por dónde han pasado HEAD y las ramas",
    "stash list": "Cambios apartados", "stash show": "Qué contiene un cambio apartado",
    remote: "Copias remotas y sus direcciones", "ls-files": "Archivos que Git sigue", "ls-tree": "Archivos de una versión guardada",
    "cat-file": "Un objeto guardado, tal como lo guarda Git", "rev-parse": "El identificador al que apunta un nombre", describe: "Una versión nombrada por su etiqueta más cercana",
    shortlog: "Versiones guardadas por autor", "count-objects": "Cuánto almacena el proyecto",
    whatchanged: "Versiones guardadas con los archivos que cambiaron", "name-rev": "Una versión nombrada por una rama o etiqueta cercana",
    "merge-base": "Dónde se separaron dos ramas", "for-each-ref": "Ramas y etiquetas, con el formato que elijas",
    "show-ref": "Ramas y etiquetas con sus identificadores", version: "La versión de Git",
  },
  consoleRefusal: (reason, subject) => {
    const word = subject ?? "";
    switch (reason) {
      case "too_long": return "Esa línea es demasiado larga para la consola.";
      case "control_character": return "Esa línea contiene caracteres de control, que la consola no acepta.";
      case "unclosed_quote": return "Hay unas comillas sin cerrar en esa línea.";
      case "shell_syntax": return `«${word}» es sintaxis de shell. La consola ejecuta un solo comando Git cada vez, sin shell.`;
      case "not_git": return "Aquí solo se ejecutan comandos Git: empieza la línea con git.";
      case "missing_subcommand": return "Escribe un comando Git después de git, o help git para verlos.";
      case "global_option": return `La consola no acepta «${word}» antes del comando: siempre ejecuta Git en este proyecto.`;
      case "unknown_subcommand": return `«git ${word}» no es un comando Git que la consola conozca. Los alias y los programas git-* externos no se ejecutan aquí.`;
      case "not_available": return `«git ${word}» no está disponible en la consola. Escribe help git para ver cuáles lo están.`;
      case "runs_program": return `«${word}» ejecutaría otro programa, así que la consola nunca lo permite.`;
      case "writes_file": return `«${word}» escribiría un archivo, así que la consola nunca lo permite.`;
      case "leaves_project": return `«${word}» sale de este proyecto, así que la consola nunca lo permite.`;
      case "needs_terminal": return word === "commit"
        ? "git commit abriría un editor para el mensaje. Añade el mensaje con -m \"…\"."
        : `«${word}» necesita un terminal interactivo, que la consola no tiene.`;
    }
  },
  consoleTierNotAllowed: (subcommand, tier) => `git ${subcommand} ${ES_TIER_EFFECTS[tier]}, y la consola aún no puede hacerlo. Usa las acciones guiadas para ello.`,
  consoleConfirmChangesLabel: "Confirmar cada cambio",
  consoleConfirmChangesDescription: "Muestra qué va a cambiar un comando en el proyecto o su copia remota y pregunta antes de ejecutarlo. Desactivado, la consola lo sigue mostrando pero lo ejecuta en cuanto pulsas Intro.",
  consoleConfirmOffDialogTitle: "¿Ejecutar sin preguntar?",
  consoleConfirmOffDialogBody: "Los comandos que cambian el proyecto o su copia remota se ejecutarán en cuanto pulses Intro, git push incluido, sin preguntar antes.",
  consoleConfirmOffDialogStillShown: "La consola sigue mostrando qué hace cada uno antes de ejecutarlo.",
  consoleConfirmOffDialogLimits: "Los comandos que reescriben el historial guardado o pueden descartar trabajo siguen sin estar disponibles.",
  consoleConfirmOffDialogStillChecked: "Un comando sigue sin ejecutarse si el proyecto cambió mientras se preparaba.",
  consoleConfirmOffDialogConfirm: "Desactivar",
  consoleConfirmSaveFailed: "No se pudo guardar el ajuste. Inténtalo de nuevo.",
  consoleConfirmQuestion: "¿Continuar? [s/N]",
  consoleConfirmLabel: "Responde s para ejecutar el comando, cualquier otra cosa para cancelar",
  consoleAwaitingAnswer: "Esperando tu respuesta.",
  consoleCancelled: "Cancelado. No ha cambiado nada.",
  consoleEffects: {
    reads_only: "Solo lee el proyecto.",
    changes_project: "Cambia este proyecto en este ordenador.",
    changes_history: "Cambia el historial guardado.",
    reaches_remote: "Se comunica con la copia remota. Publicar cambia lo que ve tu equipo.",
    can_lose_work: "Puede descartar trabajo.",
  },
  consolePlanFact: (fact) => {
    const files = (count: number) => `${count} ${count === 1 ? "archivo" : "archivos"}`;
    const remote = (name: string | null) => (name ? `«${name}»` : "la copia remota");
    switch (fact.kind) {
      case "stages": return fact.total === 0 ? "No hay nada nuevo que preparar." : `Prepara ${files(fact.total)}: ${fact.files.join(", ")}${fact.total > fact.files.length ? ", …" : ""}`;
      case "commits": return `Guarda una versión nueva${fact.files === null ? " de los archivos que has indicado" : ` con ${files(fact.files)} listos para guardar`}${fact.branch ? ` en la rama «${fact.branch}»` : ""}.`;
      case "switches": return fact.create ? `Crea la rama «${fact.target}» y cambia a ella.` : `Cambia a «${fact.target}». Git se detiene si tus cambios se sobrescribirían.`;
      case "creates_branch": return `Crea la rama «${fact.name}».`;
      case "creates_tag": return `Crea la etiqueta «${fact.name}».`;
      case "sets_aside": return `Aparta ${files(fact.files)} con cambios.`;
      case "applies_set_aside": return `Recupera ${fact.stash} y lo mantiene en la lista.`;
      case "reverts": return `Guarda una versión nueva que deshace ${fact.version}, con el mensaje de Git.`;
      case "copies_version": return `Copia ${fact.version} en la rama actual como una versión nueva.`;
      case "fetches": return `Obtiene los cambios nuevos de ${remote(fact.remote)} sin tocar tus archivos.`;
      case "pulls": return `Obtiene los cambios nuevos de ${remote(fact.remote)} y los incorpora solo si no hay nada que combinar.`;
      case "publishes": return `Publica ${fact.versions === null ? "" : `${fact.versions} ${fact.versions === 1 ? "versión guardada" : "versiones guardadas"} de `}${fact.branch ? `«${fact.branch}»` : "la rama actual"} en ${remote(fact.remote)}.`;
      case "asks_remote": return `Pregunta a ${remote(fact.remote)} qué tiene; no cambia nada.`;
      case "skips_hooks": return fact.typed ? "Los hooks del proyecto no se ejecutarán, como pide el comando." : "Los hooks del proyecto no se ejecutarán: están desactivados en Ajustes.";
    }
  },
  consoleRunFailures: {
    hook_rejected: "Un hook de Git de este proyecto ha detenido el comando. Su mensaje está arriba.",
    signing_failed: "Git no pudo firmarlo. Revisa tu configuración de firma.",
    authentication_failed: "Git no pudo iniciar sesión en la copia remota. Revisa tus credenciales guardadas; la consola nunca las pide.",
    remote_rejected: "La copia remota rechazó el cambio según sus propias reglas.",
    not_fast_forward: "La copia remota tiene cambios que aún no tienes. Obtenlos primero; la consola nunca fuerza ni combina ramas.",
  },
  consoleStatus: "Estado del proyecto", consoleDiff: "Cambios sin preparar", consoleLog: "Versiones recientes", consoleBranches: "Ramas locales",
  consoleStaged: "Cambios listos para guardar", consoleGraph: "Grafo de versiones", consoleLast: "Última versión guardada", consoleTags: "Etiquetas",
  consoleRemotes: "Copias remotas", consoleStashes: "Cambios apartados", consoleAuthors: "Autores",
  consoleHostingLabels: {
    prs: "Solicitudes de cambios abiertas", "my-prs": "Tus solicitudes de cambios", issues: "Incidencias abiertas",
    runs: "Ejecuciones recientes de CI", checks: "Comprobaciones de esta rama", repo: "El proyecto en su servicio de alojamiento",
  },
  consoleHostingUnavailable: (reason, host) => {
    const cli = host.kind === "gitlab" ? "GitLab CLI (glab)" : "GitHub CLI (gh)";
    const section = host.kind === "gitlab" ? "GitLab" : "GitHub";
    if (reason === "cli_missing") return `${cli} no está instalado. Instálalo desde Ajustes › ${section} e inténtalo de nuevo.`;
    if (reason === "signed_out") return `${cli} no tiene ninguna cuenta conectada para ${host.host ?? "este servidor"}. Conecta una en Ajustes › ${section} e inténtalo de nuevo.`;
    switch (host.kind) {
      case "bitbucket": return "Bitbucket no tiene una herramienta oficial de línea de comandos, así que estos atajos solo funcionan con proyectos de GitHub y GitLab.";
      case "local": return "Este proyecto aún no tiene remoto, así que no hay ningún servicio de alojamiento al que preguntar.";
      case "unclear": return "Este proyecto tiene varios remotos y ninguno es claramente el suyo. Publica la rama actual, o llama origin a uno de ellos, para que la consola sepa a cuál preguntar.";
      default: return "El remoto de este proyecto no está en GitHub ni en GitLab, así que no hay ninguna herramienta de alojamiento a la que preguntar.";
    }
  },
};
