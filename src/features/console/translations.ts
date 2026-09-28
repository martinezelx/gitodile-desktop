export interface ConsoleTranslations {
  consoleTitle: string;
  consoleShortcuts: string;
  consolePromptLabel: string;
  consolePromptOn: string;
  consoleHint: string;
  consoleEmpty: string;
  consoleWelcomeProject: string;
  consoleWelcomeLine: string;
  consoleWelcomeGit: string;
  consoleWelcomeMode: string;
  consoleWelcomeProjectSection: string;
  consoleWelcomeEnvironmentSection: string;
  consoleWelcomeChanges: string;
  consoleWelcomePublish: string;
  consoleWelcomeTheme: string;
  consoleWelcomeUnpublished: (versions: number) => string;
  consoleWelcomeUpToDate: string;
  consoleStatusSaved: string;
  consoleStatusUnsaved: (files: number) => string;
  consoleStatusUnpublished: (versions: number) => string;
  consoleStatusIncoming: (versions: number) => string;
  consoleHelpIntro: string;
  consoleHelpNames: string;
  consoleHelpMeaning: string;
  consoleHelpActions: string;
  consoleControlHelp: string;
  consoleControlClear: string;
  consoleControlShortcuts: string;
  consoleCompletions: string;
  consoleStatusLine: string;
  consoleReadOnly: string;
  consoleCopy: string;
  consoleCopied: string;
  consoleRerun: string;
  consoleDuration: (ms: number) => string;
  consoleTruncatedShort: string;
  consoleSucceeded: string;
  consoleUnknown: (input: string) => string;
  consoleRunning: string;
  consoleDone: string;
  consoleNoOutput: string;
  consoleFailed: (code: number | null) => string;
  consoleTruncated: string;
  consoleRequestFailed: string;
  consoleShortcutsTitle: string;
  consoleShortcutsDescription: string;
  consoleShortcutName: string;
  consoleShortcutTarget: string;
  consoleQueryPrevious: string;
  consoleQueryNext: string;
  consoleShortcutAdd: string;
  consoleShortcutRename: string;
  consoleShortcutRemove: string;
  consoleShortcutSave: string;
  consoleShortcutCancel: string;
  consoleShortcutReset: string;
  consoleShortcutClose: string;
  consoleShortcutInvalid: string;
  consoleShortcutReserved: string;
  consoleShortcutDuplicate: string;
  consoleShortcutLimit: string;
  consoleShortcutStorageError: string;
  consoleStatus: string;
  consoleDiff: string;
  consoleLog: string;
  consoleBranches: string;
  consoleStaged: string;
  consoleGraph: string;
  consoleLast: string;
  consoleTags: string;
  consoleRemotes: string;
  consoleStashes: string;
  consoleAuthors: string;
}

function formatDuration(ms: number, locale: string): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000)} s`;
}

export const consoleTranslations: { en: ConsoleTranslations; es: ConsoleTranslations } = {
  en: {
    consoleTitle: "Console", consoleShortcuts: "Shortcuts",
    consolePromptLabel: "Console shortcut", consolePromptOn: "on",
    consoleHint: "Tab completes · Enter runs · ↑↓ history · Ctrl+L clears",
    consoleEmpty: "Type help or press Tab to see the read-only shortcuts.",
    consoleWelcomeProject: "project", consoleWelcomeLine: "line", consoleWelcomeGit: "git", consoleWelcomeMode: "mode",
    consoleWelcomeProjectSection: "project", consoleWelcomeEnvironmentSection: "environment",
    consoleWelcomeChanges: "changes", consoleWelcomePublish: "publish", consoleWelcomeTheme: "theme",
    consoleWelcomeUnpublished: (versions) => `${versions} ${versions === 1 ? "version" : "versions"}`, consoleWelcomeUpToDate: "up to date",
    consoleStatusSaved: "everything saved",
    consoleStatusUnsaved: (files) => `${files} unsaved`,
    consoleStatusUnpublished: (versions) => `↑${versions} to publish`,
    consoleStatusIncoming: (versions) => `↓${versions} new`,
    consoleHelpIntro: "Available shortcuts (read-only)",
    consoleHelpNames: "Shortcut", consoleHelpMeaning: "What it shows", consoleHelpActions: "Also: clear empties the view, shortcuts edits the names.",
    consoleControlHelp: "List the shortcuts", consoleControlClear: "Clear the view", consoleControlShortcuts: "Edit shortcut names",
    consoleCompletions: "Matching shortcuts", consoleStatusLine: "Console status", consoleReadOnly: "read-only",
    consoleCopy: "Copy output", consoleCopied: "Copied", consoleRerun: "Run again",
    consoleDuration: (ms) => formatDuration(ms, "en"), consoleTruncatedShort: "Shortened", consoleSucceeded: "Finished",
    consoleUnknown: (input) => `“${input}” isn't a shortcut. Type help to see the available names.`,
    consoleRunning: "Running query…", consoleDone: "Query finished.", consoleNoOutput: "No output for this query.",
    consoleFailed: (code) => `Git finished with an error${code === null ? "" : ` (code ${code})`}.`,
    consoleTruncated: "Output was shortened to keep the console responsive.",
    consoleRequestFailed: "The query couldn't run. Check the project and try again.",
    consoleShortcutsTitle: "Console shortcuts", consoleShortcutsDescription: "Names are shared across projects. Each runs a fixed read-only Git query.",
    consoleShortcutName: "Shortcut name", consoleShortcutTarget: "Git query", consoleQueryPrevious: "Previous query", consoleQueryNext: "Next query", consoleShortcutAdd: "Add shortcut",
    consoleShortcutRename: "Rename", consoleShortcutRemove: "Remove", consoleShortcutSave: "Save name",
    consoleShortcutCancel: "Cancel", consoleShortcutReset: "Restore defaults", consoleShortcutClose: "Close shortcuts",
    consoleShortcutInvalid: "Use 1–20 lowercase letters, numbers or hyphens, starting with a letter.",
    consoleShortcutReserved: "That name is reserved for a console action.",
    consoleShortcutDuplicate: "That shortcut name is already in use.",
    consoleShortcutLimit: "You can keep up to 24 shortcuts.",
    consoleShortcutStorageError: "The shortcut couldn't be saved on this device.",
    consoleStatus: "Project status", consoleDiff: "Unstaged changes", consoleLog: "Recent versions", consoleBranches: "Local branches",
    consoleStaged: "Changes ready to save", consoleGraph: "Version graph", consoleLast: "Latest saved version", consoleTags: "Tags",
    consoleRemotes: "Remote copies", consoleStashes: "Changes set aside", consoleAuthors: "Authors",
  },
  es: {
    consoleTitle: "Consola", consoleShortcuts: "Atajos",
    consolePromptLabel: "Atajo de consola", consolePromptOn: "en",
    consoleHint: "Tab completa · Intro ejecuta · ↑↓ historial · Ctrl+L limpia",
    consoleEmpty: "Escribe help o pulsa Tab para ver los atajos de solo lectura.",
    consoleWelcomeProject: "proyecto", consoleWelcomeLine: "línea", consoleWelcomeGit: "git", consoleWelcomeMode: "modo",
    consoleWelcomeProjectSection: "proyecto", consoleWelcomeEnvironmentSection: "entorno",
    consoleWelcomeChanges: "cambios", consoleWelcomePublish: "publicar", consoleWelcomeTheme: "tema",
    consoleWelcomeUnpublished: (versions) => `${versions} ${versions === 1 ? "versión" : "versiones"}`, consoleWelcomeUpToDate: "al día",
    consoleStatusSaved: "todo guardado",
    consoleStatusUnsaved: (files) => `${files} sin guardar`,
    consoleStatusUnpublished: (versions) => `↑${versions} sin publicar`,
    consoleStatusIncoming: (versions) => `↓${versions} nuevas`,
    consoleHelpIntro: "Atajos disponibles (solo lectura)",
    consoleHelpNames: "Atajo", consoleHelpMeaning: "Qué muestra", consoleHelpActions: "Además: clear vacía la vista y shortcuts edita los nombres.",
    consoleControlHelp: "Ver los atajos", consoleControlClear: "Limpiar la vista", consoleControlShortcuts: "Editar los nombres",
    consoleCompletions: "Atajos que coinciden", consoleStatusLine: "Estado de la consola", consoleReadOnly: "solo lectura",
    consoleCopy: "Copiar salida", consoleCopied: "Copiado", consoleRerun: "Repetir",
    consoleDuration: (ms) => formatDuration(ms, "es"), consoleTruncatedShort: "Acortada", consoleSucceeded: "Terminada",
    consoleUnknown: (input) => `«${input}» no es un atajo. Escribe help para ver los nombres disponibles.`,
    consoleRunning: "Ejecutando consulta…", consoleDone: "Consulta terminada.", consoleNoOutput: "Esta consulta no produjo salida.",
    consoleFailed: (code) => `Git terminó con un error${code === null ? "" : ` (código ${code})`}.`,
    consoleTruncated: "Se ha acortado la salida para mantener la consola ágil.",
    consoleRequestFailed: "No se pudo ejecutar la consulta. Comprueba el proyecto e inténtalo de nuevo.",
    consoleShortcutsTitle: "Atajos de consola", consoleShortcutsDescription: "Los nombres se comparten entre proyectos. Cada uno ejecuta una consulta Git fija y de solo lectura.",
    consoleShortcutName: "Nombre del atajo", consoleShortcutTarget: "Consulta Git", consoleQueryPrevious: "Consulta anterior", consoleQueryNext: "Consulta siguiente", consoleShortcutAdd: "Añadir atajo",
    consoleShortcutRename: "Renombrar", consoleShortcutRemove: "Eliminar", consoleShortcutSave: "Guardar nombre",
    consoleShortcutCancel: "Cancelar", consoleShortcutReset: "Restaurar predeterminados", consoleShortcutClose: "Cerrar atajos",
    consoleShortcutInvalid: "Usa entre 1 y 20 letras minúsculas, números o guiones; empieza por una letra.",
    consoleShortcutReserved: "Ese nombre está reservado para una acción de la consola.",
    consoleShortcutDuplicate: "Ese nombre de atajo ya está en uso.",
    consoleShortcutLimit: "Puedes guardar hasta 24 atajos.",
    consoleShortcutStorageError: "No se pudo guardar el atajo en este dispositivo.",
    consoleStatus: "Estado del proyecto", consoleDiff: "Cambios sin preparar", consoleLog: "Versiones recientes", consoleBranches: "Ramas locales",
    consoleStaged: "Cambios listos para guardar", consoleGraph: "Grafo de versiones", consoleLast: "Última versión guardada", consoleTags: "Etiquetas",
    consoleRemotes: "Copias remotas", consoleStashes: "Cambios apartados", consoleAuthors: "Autores",
  },
};
