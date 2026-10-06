import type { DefaultLineName, GitReadCommand } from "./domain";
import type { ConsoleEffect, ConsoleRefusalReason, ConsoleRunFailure, ConsoleTier, PlanFact } from "./port";

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
  consoleWelcomeConfirm: string;
  consoleWelcomeConfirmOn: string;
  consoleWelcomeConfirmOff: string;
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
  consoleHelpCommand: string;
  consoleShortcutOwnLine: string;
  consoleDefaultLines: Record<DefaultLineName, string>;
  consoleHelpActions: string;
  consoleControlHelp: string;
  consoleControlClear: string;
  consoleControlShortcuts: string;
  consoleControlSettings: string;
  consoleOpenSettings: string;
  consoleCompletions: string;
  consoleStatusLine: string;
  consoleStatusConfirm: string;
  consoleStatusNoConfirm: string;
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
  consoleShortcutLineOption: string;
  consoleShortcutLine: string;
  consoleShortcutLineInvalid: string;
  consoleShortcutChecking: string;
  consoleShortcutWidened: (name: string) => string;
  consoleHelpGitIntro: string;
  consoleHelpGitCommand: string;
  consoleHelpGitFooter: string;
  consoleGitCommands: Record<GitReadCommand, string>;
  consoleRefusal: (reason: Exclude<ConsoleRefusalReason, "tier_not_allowed">, subject: string | null) => string;
  consoleTierNotAllowed: (subcommand: string, tier: ConsoleTier) => string;
  consoleConfirmChangesLabel: string;
  consoleConfirmChangesDescription: string;
  consoleConfirmOffDialogTitle: string;
  consoleConfirmOffDialogBody: string;
  consoleConfirmOffDialogStillShown: string;
  consoleConfirmOffDialogLimits: string;
  consoleConfirmOffDialogStillChecked: string;
  consoleConfirmOffDialogConfirm: string;
  consoleConfirmSaveFailed: string;
  consoleConfirmQuestion: string;
  consoleConfirmLabel: string;
  consoleAwaitingAnswer: string;
  consoleCancelled: string;
  consoleEffects: Record<ConsoleEffect, string>;
  consolePlanFact: (fact: PlanFact) => string;
  consoleRunFailures: Record<ConsoleRunFailure, string>;
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

const EN_TIER_EFFECTS: Record<ConsoleTier, string> = {
  read: "only reads the project", local_change: "changes the project", history_change: "rewrites saved history",
  remote: "talks to the remote copy", destructive: "can discard work", never: "isn't available",
};
const ES_TIER_EFFECTS: Record<ConsoleTier, string> = {
  read: "solo lee el proyecto", local_change: "cambia el proyecto", history_change: "reescribe el historial guardado",
  remote: "se comunica con la copia remota", destructive: "puede descartar trabajo", never: "no está disponible",
};

function formatDuration(ms: number, locale: string): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000)} s`;
}

export const consoleTranslations: { en: ConsoleTranslations; es: ConsoleTranslations } = {
  en: {
    consoleTitle: "Console", consoleShortcuts: "Shortcuts",
    consolePromptLabel: "Console command", consolePromptOn: "on",
    consoleHint: "Tab completes · Enter runs · ↑↓ history · Ctrl+L clears",
    consoleEmpty: "Type help to see the shortcuts, or a Git command such as git log --oneline.",
    consoleWelcomeProject: "project", consoleWelcomeLine: "line", consoleWelcomeGit: "git", consoleWelcomeConfirm: "confirm",
    consoleWelcomeConfirmOn: "before each change", consoleWelcomeConfirmOff: "off",
    consoleWelcomeProjectSection: "project", consoleWelcomeEnvironmentSection: "environment",
    consoleWelcomeChanges: "changes", consoleWelcomePublish: "publish", consoleWelcomeTheme: "theme",
    consoleWelcomeUnpublished: (versions) => `${versions} ${versions === 1 ? "version" : "versions"}`, consoleWelcomeUpToDate: "up to date",
    consoleStatusSaved: "everything saved",
    consoleStatusUnsaved: (files) => `${files} unsaved`,
    consoleStatusUnpublished: (versions) => `↑${versions} to publish`,
    consoleStatusIncoming: (versions) => `↓${versions} new`,
    consoleHelpIntro: "Available shortcuts (read-only)",
    consoleHelpNames: "Shortcut", consoleHelpMeaning: "What it shows", consoleHelpCommand: "Git command",
    consoleShortcutOwnLine: "Your command line",
    consoleDefaultLines: {
      short: "Compact project status", stat: "Unstaged changes per file", today: "Versions saved today",
      week: "Versions saved this week", unpublished: "Saved versions not yet published",
      incoming: "Newer changes already fetched", moves: "Recent moves of HEAD",
      "all-lines": "All version lines, local and remote", size: "How much the project stores",
    }, consoleHelpActions: "Also: help git lists the Git commands you can type, clear empties the view, shortcuts edits the names, settings opens the console settings.",
    consoleControlHelp: "List the shortcuts", consoleControlClear: "Clear the view", consoleControlShortcuts: "Edit shortcut names",
    consoleControlSettings: "Open the console settings", consoleOpenSettings: "Console settings",
    consoleCompletions: "Matching shortcuts", consoleStatusLine: "Console status", consoleStatusConfirm: "confirms changes",
    consoleStatusNoConfirm: "no confirmation",
    consoleCopy: "Copy output", consoleCopied: "Copied", consoleRerun: "Run again",
    consoleDuration: (ms) => formatDuration(ms, "en"), consoleTruncatedShort: "Shortened", consoleSucceeded: "Finished",
    consoleUnknown: (input) => `“${input}” isn't a shortcut or a Git command. Type help to see the names, or help git for Git commands.`,
    consoleRunning: "Running query…", consoleDone: "Query finished.", consoleNoOutput: "No output for this query.",
    consoleFailed: (code) => `Git finished with an error${code === null ? "" : ` (code ${code})`}.`,
    consoleTruncated: "Output was shortened to keep the console responsive.",
    consoleRequestFailed: "The query couldn't run. Check the project and try again.",
    consoleShortcutsTitle: "Console shortcuts", consoleShortcutsDescription: "Shared by all your projects; each runs a Git command.",
    consoleShortcutName: "Shortcut name", consoleShortcutTarget: "Git query", consoleQueryPrevious: "Previous query", consoleQueryNext: "Next query", consoleShortcutAdd: "Add shortcut",
    consoleShortcutRename: "Rename", consoleShortcutRemove: "Remove", consoleShortcutSave: "Save name",
    consoleShortcutCancel: "Cancel", consoleShortcutReset: "Restore defaults", consoleShortcutClose: "Close shortcuts",
    consoleShortcutInvalid: "Use 1–20 lowercase letters, numbers or hyphens, starting with a letter.",
    consoleShortcutReserved: "That name is reserved for a console action.",
    consoleShortcutDuplicate: "That shortcut name is already in use.",
    consoleShortcutLimit: "You can keep up to 24 shortcuts.",
    consoleShortcutStorageError: "The shortcut couldn't be saved on this device.",
    consoleShortcutLineOption: "Git command line", consoleShortcutLine: "Git command line",
    consoleShortcutLineInvalid: "Write a Git command that starts with git, such as git log --oneline -20.",
    consoleShortcutChecking: "Checking the command…",
    consoleShortcutWidened: (name) => `“${name}” was saved as a read-only command and now asks for more, so it didn't run. Edit the shortcut to keep using it.`,
    consoleHelpGitIntro: "Git commands that only read the project", consoleHelpGitCommand: "Command",
    consoleHelpGitFooter: "Commands that change the project or reach the remote copy, such as git add, git commit -m, git switch, git fetch and git push, run here too, each shown first. Commands that rewrite saved history, can discard work, open an editor or run another program aren't available here.",
    consoleGitCommands: {
      status: "Project status", log: "Saved versions, newest first", show: "A saved version, or a file in it",
      diff: "Changes between versions or files", blame: "Who last changed each line", grep: "Search the project's files",
      branch: "Version lines", tag: "Tags", reflog: "Where HEAD and the lines have been",
      "stash list": "Changes set aside", "stash show": "What a set-aside change holds",
      remote: "Remote copies and their addresses", "ls-files": "Files Git tracks", "ls-tree": "Files in a saved version",
      "cat-file": "A stored object, as Git keeps it", "rev-parse": "The ID a name points to", describe: "A version named from its nearest tag",
      shortlog: "Saved versions by author", "count-objects": "How much the project stores",
      whatchanged: "Saved versions with the files they changed", "name-rev": "A version named from a nearby line or tag",
      "merge-base": "Where two lines parted", "for-each-ref": "Lines and tags, in a format you choose",
      "show-ref": "Lines and tags with their IDs", version: "The Git version",
    },
    consoleRefusal: (reason, subject) => {
      const word = subject ?? "";
      switch (reason) {
        case "too_long": return "That line is too long for the console.";
        case "control_character": return "That line holds control characters, which the console doesn't accept.";
        case "unclosed_quote": return "A quote in that line isn't closed.";
        case "shell_syntax": return `“${word}” is shell syntax. The console runs one Git command at a time, without a shell.`;
        case "not_git": return "Only Git commands run here: start the line with git.";
        case "missing_subcommand": return "Type a Git command after git, or help git to see them.";
        case "global_option": return `The console doesn't accept “${word}” before the command: it always runs Git in this project.`;
        case "unknown_subcommand": return `“git ${word}” isn't a Git command the console knows. Aliases and external git-* programs don't run here.`;
        case "not_available": return `“git ${word}” isn't available in the console. Type help git to see what is.`;
        case "runs_program": return `“${word}” would run another program, so the console never allows it.`;
        case "writes_file": return `“${word}” would write a file, so the console never allows it.`;
        case "leaves_project": return `“${word}” reaches outside this project, so the console never allows it.`;
        case "needs_terminal": return word === "commit"
          ? "git commit would open an editor for its message. Add the message with -m \"…\"."
          : `“${word}” needs an interactive terminal, which the console doesn't have.`;
      }
    },
    consoleTierNotAllowed: (subcommand, tier) => `git ${subcommand} ${EN_TIER_EFFECTS[tier]}, which the console can't do yet. Use the guided actions for it.`,
    consoleConfirmChangesLabel: "Confirm each change",
    consoleConfirmChangesDescription: "Show what a command will change in the project or its remote copy and ask before it runs. Off, the console still shows it but runs it as soon as you press Enter.",
    consoleConfirmOffDialogTitle: "Turn off change confirmations?",
    consoleConfirmOffDialogBody: "Commands that change the project or its remote copy will run as soon as you press Enter, including git push, without asking first.",
    consoleConfirmOffDialogStillShown: "The console still prints what each one does before it runs.",
    consoleConfirmOffDialogLimits: "Commands that rewrite saved history or can discard work stay unavailable.",
    consoleConfirmOffDialogStillChecked: "A command still doesn't run if the project changed while it was being prepared.",
    consoleConfirmOffDialogConfirm: "Turn off",
    consoleConfirmSaveFailed: "The setting couldn't be saved. Try again.",
    consoleConfirmQuestion: "Continue? [y/N]",
    consoleConfirmLabel: "Answer y to run the command, anything else to cancel",
    consoleAwaitingAnswer: "Waiting for your answer.",
    consoleCancelled: "Cancelled. Nothing changed.",
    consoleEffects: {
      reads_only: "Only reads the project.",
      changes_project: "Changes this project on this computer.",
      changes_history: "Changes saved history.",
      reaches_remote: "Talks to the remote copy. Publishing changes what your team sees.",
      can_lose_work: "Can discard work.",
    },
    consolePlanFact: (fact) => {
      const files = (count: number) => `${count} ${count === 1 ? "file" : "files"}`;
      const remote = (name: string | null) => (name ? `“${name}”` : "the remote copy");
      switch (fact.kind) {
        case "stages": return fact.total === 0 ? "Nothing new to stage." : `Stages ${files(fact.total)}: ${fact.files.join(", ")}${fact.total > fact.files.length ? ", …" : ""}`;
        case "commits": return `Saves a new version${fact.files === null ? " of the files you named" : ` with ${files(fact.files)} ready to save`}${fact.line ? ` on the line “${fact.line}”` : ""}.`;
        case "switches": return fact.create ? `Creates the line “${fact.target}” and switches to it.` : `Switches to “${fact.target}”. Git stops if your changes would be overwritten.`;
        case "creates_line": return `Creates the line “${fact.name}”.`;
        case "creates_tag": return `Creates the tag “${fact.name}”.`;
        case "sets_aside": return `Sets aside ${files(fact.files)} with changes.`;
        case "applies_set_aside": return `Brings back ${fact.stash} and keeps it in the list.`;
        case "reverts": return `Saves a new version that undoes ${fact.version}, with Git's own message.`;
        case "copies_version": return `Copies ${fact.version} onto the current line as a new version.`;
        case "fetches": return `Gets new project changes from ${remote(fact.remote)} without changing your files.`;
        case "pulls": return `Gets new project changes from ${remote(fact.remote)} and brings them in only if nothing needs combining.`;
        case "publishes": return `Publishes ${fact.versions === null ? "" : `${fact.versions} ${fact.versions === 1 ? "saved version" : "saved versions"} of `}${fact.line ? `“${fact.line}”` : "the current line"} to ${remote(fact.remote)}.`;
        case "asks_remote": return `Asks ${remote(fact.remote)} what it has; nothing changes.`;
        case "skips_hooks": return fact.typed ? "The project's hooks won't run, as the command asks." : "The project's hooks won't run: they are turned off in Settings.";
      }
    },
    consoleRunFailures: {
      hook_rejected: "A Git hook in this project stopped the command. Its message is above.",
      signing_failed: "Git couldn't sign it. Check your commit-signing setup.",
      authentication_failed: "Git couldn't sign in to the remote copy. Check your saved credentials for it; the console never asks for them.",
      remote_rejected: "The remote copy refused the change under its own rules.",
      not_fast_forward: "The remote copy has changes you don't have yet. Get them first; the console never forces or combines lines.",
    },
    consoleStatus: "Project status", consoleDiff: "Unstaged changes", consoleLog: "Recent versions", consoleBranches: "Local branches",
    consoleStaged: "Changes ready to save", consoleGraph: "Version graph", consoleLast: "Latest saved version", consoleTags: "Tags",
    consoleRemotes: "Remote copies", consoleStashes: "Changes set aside", consoleAuthors: "Authors",
  },
  es: {
    consoleTitle: "Consola", consoleShortcuts: "Atajos",
    consolePromptLabel: "Comando de consola", consolePromptOn: "en",
    consoleHint: "Tab completa · Intro ejecuta · ↑↓ historial · Ctrl+L limpia",
    consoleEmpty: "Escribe help para ver los atajos, o un comando Git como git log --oneline.",
    consoleWelcomeProject: "proyecto", consoleWelcomeLine: "línea", consoleWelcomeGit: "git", consoleWelcomeConfirm: "confirmar",
    consoleWelcomeConfirmOn: "antes de cada cambio", consoleWelcomeConfirmOff: "desactivada",
    consoleWelcomeProjectSection: "proyecto", consoleWelcomeEnvironmentSection: "entorno",
    consoleWelcomeChanges: "cambios", consoleWelcomePublish: "publicar", consoleWelcomeTheme: "tema",
    consoleWelcomeUnpublished: (versions) => `${versions} ${versions === 1 ? "versión" : "versiones"}`, consoleWelcomeUpToDate: "al día",
    consoleStatusSaved: "todo guardado",
    consoleStatusUnsaved: (files) => `${files} sin guardar`,
    consoleStatusUnpublished: (versions) => `↑${versions} sin publicar`,
    consoleStatusIncoming: (versions) => `↓${versions} nuevas`,
    consoleHelpIntro: "Atajos disponibles (solo lectura)",
    consoleHelpNames: "Atajo", consoleHelpMeaning: "Qué muestra", consoleHelpCommand: "Comando Git",
    consoleShortcutOwnLine: "Tu comando",
    consoleDefaultLines: {
      short: "Estado del proyecto compacto", stat: "Cambios sin preparar por archivo", today: "Versiones guardadas hoy",
      week: "Versiones guardadas esta semana", unpublished: "Versiones guardadas sin publicar",
      incoming: "Cambios nuevos ya obtenidos", moves: "Últimos movimientos de HEAD",
      "all-lines": "Todas las líneas, locales y remotas", size: "Cuánto almacena el proyecto",
    }, consoleHelpActions: "Además: help git lista los comandos Git que puedes escribir, clear vacía la vista, shortcuts edita los nombres y settings abre los ajustes de la consola.",
    consoleControlHelp: "Ver los atajos", consoleControlClear: "Limpiar la vista", consoleControlShortcuts: "Editar los nombres",
    consoleControlSettings: "Abrir los ajustes de la consola", consoleOpenSettings: "Ajustes de la consola",
    consoleCompletions: "Atajos que coinciden", consoleStatusLine: "Estado de la consola", consoleStatusConfirm: "confirma cambios",
    consoleStatusNoConfirm: "sin confirmación",
    consoleCopy: "Copiar salida", consoleCopied: "Copiado", consoleRerun: "Repetir",
    consoleDuration: (ms) => formatDuration(ms, "es"), consoleTruncatedShort: "Acortada", consoleSucceeded: "Terminada",
    consoleUnknown: (input) => `«${input}» no es un atajo ni un comando Git. Escribe help para ver los nombres, o help git para los comandos Git.`,
    consoleRunning: "Ejecutando consulta…", consoleDone: "Consulta terminada.", consoleNoOutput: "Esta consulta no produjo salida.",
    consoleFailed: (code) => `Git terminó con un error${code === null ? "" : ` (código ${code})`}.`,
    consoleTruncated: "Se ha acortado la salida para mantener la consola ágil.",
    consoleRequestFailed: "No se pudo ejecutar la consulta. Comprueba el proyecto e inténtalo de nuevo.",
    consoleShortcutsTitle: "Atajos de consola", consoleShortcutsDescription: "Valen para todos tus proyectos y cada uno ejecuta un comando Git.",
    consoleShortcutName: "Nombre del atajo", consoleShortcutTarget: "Consulta Git", consoleQueryPrevious: "Consulta anterior", consoleQueryNext: "Consulta siguiente", consoleShortcutAdd: "Añadir atajo",
    consoleShortcutRename: "Renombrar", consoleShortcutRemove: "Eliminar", consoleShortcutSave: "Guardar nombre",
    consoleShortcutCancel: "Cancelar", consoleShortcutReset: "Restaurar predeterminados", consoleShortcutClose: "Cerrar atajos",
    consoleShortcutInvalid: "Usa entre 1 y 20 letras minúsculas, números o guiones; empieza por una letra.",
    consoleShortcutReserved: "Ese nombre está reservado para una acción de la consola.",
    consoleShortcutDuplicate: "Ese nombre de atajo ya está en uso.",
    consoleShortcutLimit: "Puedes guardar hasta 24 atajos.",
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
      branch: "Líneas de versiones", tag: "Etiquetas", reflog: "Por dónde han pasado HEAD y las líneas",
      "stash list": "Cambios apartados", "stash show": "Qué contiene un cambio apartado",
      remote: "Copias remotas y sus direcciones", "ls-files": "Archivos que Git sigue", "ls-tree": "Archivos de una versión guardada",
      "cat-file": "Un objeto guardado, tal como lo guarda Git", "rev-parse": "El identificador al que apunta un nombre", describe: "Una versión nombrada por su etiqueta más cercana",
      shortlog: "Versiones guardadas por autor", "count-objects": "Cuánto almacena el proyecto",
      whatchanged: "Versiones guardadas con los archivos que cambiaron", "name-rev": "Una versión nombrada por una línea o etiqueta cercana",
      "merge-base": "Dónde se separaron dos líneas", "for-each-ref": "Líneas y etiquetas, con el formato que elijas",
      "show-ref": "Líneas y etiquetas con sus identificadores", version: "La versión de Git",
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
    consoleConfirmOffDialogTitle: "¿Desactivar la confirmación de cambios?",
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
        case "commits": return `Guarda una versión nueva${fact.files === null ? " de los archivos que has indicado" : ` con ${files(fact.files)} listos para guardar`}${fact.line ? ` en la línea «${fact.line}»` : ""}.`;
        case "switches": return fact.create ? `Crea la línea «${fact.target}» y cambia a ella.` : `Cambia a «${fact.target}». Git se detiene si tus cambios se sobrescribirían.`;
        case "creates_line": return `Crea la línea «${fact.name}».`;
        case "creates_tag": return `Crea la etiqueta «${fact.name}».`;
        case "sets_aside": return `Aparta ${files(fact.files)} con cambios.`;
        case "applies_set_aside": return `Recupera ${fact.stash} y lo mantiene en la lista.`;
        case "reverts": return `Guarda una versión nueva que deshace ${fact.version}, con el mensaje de Git.`;
        case "copies_version": return `Copia ${fact.version} en la línea actual como una versión nueva.`;
        case "fetches": return `Obtiene los cambios nuevos de ${remote(fact.remote)} sin tocar tus archivos.`;
        case "pulls": return `Obtiene los cambios nuevos de ${remote(fact.remote)} y los incorpora solo si no hay nada que combinar.`;
        case "publishes": return `Publica ${fact.versions === null ? "" : `${fact.versions} ${fact.versions === 1 ? "versión guardada" : "versiones guardadas"} de `}${fact.line ? `«${fact.line}»` : "la línea actual"} en ${remote(fact.remote)}.`;
        case "asks_remote": return `Pregunta a ${remote(fact.remote)} qué tiene; no cambia nada.`;
        case "skips_hooks": return fact.typed ? "Los hooks del proyecto no se ejecutarán, como pide el comando." : "Los hooks del proyecto no se ejecutarán: están desactivados en Ajustes.";
      }
    },
    consoleRunFailures: {
      hook_rejected: "Un hook de Git de este proyecto ha detenido el comando. Su mensaje está arriba.",
      signing_failed: "Git no pudo firmarlo. Revisa tu configuración de firma.",
      authentication_failed: "Git no pudo iniciar sesión en la copia remota. Revisa tus credenciales guardadas; la consola nunca las pide.",
      remote_rejected: "La copia remota rechazó el cambio según sus propias reglas.",
      not_fast_forward: "La copia remota tiene cambios que aún no tienes. Obtenlos primero; la consola nunca fuerza ni combina líneas.",
    },
    consoleStatus: "Estado del proyecto", consoleDiff: "Cambios sin preparar", consoleLog: "Versiones recientes", consoleBranches: "Ramas locales",
    consoleStaged: "Cambios listos para guardar", consoleGraph: "Grafo de versiones", consoleLast: "Última versión guardada", consoleTags: "Etiquetas",
    consoleRemotes: "Copias remotas", consoleStashes: "Cambios apartados", consoleAuthors: "Autores",
  },
};
