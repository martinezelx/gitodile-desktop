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
  consoleTierNotAllowed: (subcommand: string, tier: ConsoleTier, advancedMode: boolean) => string;
  consoleHelpGitAdvanced: string;
  consoleAdvancedMode: string;
  consoleRootMode: string;
  consoleSettingsModeTitle: string;
  consoleSettingsModeIntro: string;
  consoleModeReadOnly: string;
  consoleModeAdvanced: string;
  consoleModeRoot: string;
  consoleModeReadOnlyDescription: string;
  consoleModeAdvancedDescription: string;
  consoleModeRootDescription: string;
  consoleRootDialogTitle: string;
  consoleRootDialogBody: string;
  consoleRootDialogStillShown: string;
  consoleRootDialogStillChecked: string;
  consoleRootDialogConfirm: string;
  consoleAdvancedSaveFailed: string;
  consoleAdvancedDialogTitle: string;
  consoleAdvancedDialogBody: string;
  consoleAdvancedDialogPreview: string;
  consoleAdvancedDialogLimits: string;
  consoleAdvancedDialogGuided: string;
  consoleAdvancedDialogConfirm: string;
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
    consoleEmpty: "Type help to see the shortcuts, or a read-only Git command such as git log --oneline.",
    consoleWelcomeProject: "project", consoleWelcomeLine: "line", consoleWelcomeGit: "git", consoleWelcomeMode: "mode",
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
    consoleCompletions: "Matching shortcuts", consoleStatusLine: "Console status", consoleReadOnly: "read-only",
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
    consoleHelpGitIntro: "Git commands you can type (read-only)", consoleHelpGitCommand: "Command",
    consoleHelpGitFooter: "Commands that change the project, reach the remote copy, open an editor or run another program aren't available here.",
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
    consoleTierNotAllowed: (subcommand, tier, advancedMode) => {
      const does = `git ${subcommand} ${EN_TIER_EFFECTS[tier]}`;
      if (tier === "history_change" || tier === "destructive") return `${does}, which the console can't do yet. Use the guided actions for it.`;
      if (!advancedMode && (tier === "local_change" || tier === "remote")) return `${does}. Choose the advanced console mode in Settings › Console to run it here, or use the guided actions.`;
      return `${does}, and the console only runs read-only commands. Use the guided actions for it.`;
    },
    consoleHelpGitAdvanced: "Advanced mode is on: commands that change the project or reach the remote copy run here too, each shown first and run only when you answer yes.",
    consoleAdvancedMode: "advanced",
    consoleRootMode: "root",
    consoleSettingsModeTitle: "Console mode",
    consoleSettingsModeIntro: "What the console may do beyond reading, without changing how the guided actions work.",
    consoleModeReadOnly: "Read-only", consoleModeAdvanced: "Advanced", consoleModeRoot: "Root",
    consoleModeReadOnlyDescription: "Only reads the project, so nothing you type can change it.",
    consoleModeAdvancedDescription: "Can also change the project and its remote copy, showing each change and asking before it runs.",
    consoleModeRootDescription: "Changes the project and its remote copy like advanced, but runs each change as soon as you press Enter.",
    consoleRootDialogTitle: "Switch to root mode?",
    consoleRootDialogBody: "Commands that change the project or its remote copy will run as soon as you press Enter, including git push, without asking first.",
    consoleRootDialogStillShown: "The console still prints what each one does before it runs.",
    consoleRootDialogStillChecked: "A command still doesn't run if the project changed while it was being prepared.",
    consoleRootDialogConfirm: "Switch to root",
    consoleAdvancedSaveFailed: "The setting couldn't be saved. Try again.",
    consoleAdvancedDialogTitle: "Switch to advanced mode?",
    consoleAdvancedDialogBody: "The console will also run Git commands that change this project or its remote copy, such as git add, git commit -m, git switch, git stash, git fetch and git push.",
    consoleAdvancedDialogPreview: "Every change is shown first and runs only when you answer yes. If the project moves in between, it doesn't run.",
    consoleAdvancedDialogLimits: "Commands that rewrite saved history or can discard work stay unavailable.",
    consoleAdvancedDialogGuided: "The guided actions remain the simplest and safest way to do all of this.",
    consoleAdvancedDialogConfirm: "Switch to advanced",
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
    consoleEmpty: "Escribe help para ver los atajos, o un comando Git de solo lectura como git log --oneline.",
    consoleWelcomeProject: "proyecto", consoleWelcomeLine: "línea", consoleWelcomeGit: "git", consoleWelcomeMode: "modo",
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
    consoleCompletions: "Atajos que coinciden", consoleStatusLine: "Estado de la consola", consoleReadOnly: "solo lectura",
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
    consoleHelpGitIntro: "Comandos Git que puedes escribir (solo lectura)", consoleHelpGitCommand: "Comando",
    consoleHelpGitFooter: "Los comandos que cambian el proyecto, se comunican con la copia remota, abren un editor o ejecutan otro programa no están disponibles aquí.",
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
    consoleTierNotAllowed: (subcommand, tier, advancedMode) => {
      const does = `git ${subcommand} ${ES_TIER_EFFECTS[tier]}`;
      if (tier === "history_change" || tier === "destructive") return `${does}, y la consola aún no puede hacerlo. Usa las acciones guiadas para ello.`;
      if (!advancedMode && (tier === "local_change" || tier === "remote")) return `${does}. Elige el modo avanzado de la consola en Ajustes › Consola para ejecutarlo aquí, o usa las acciones guiadas.`;
      return `${does}, y la consola solo ejecuta comandos de solo lectura. Usa las acciones guiadas para ello.`;
    },
    consoleHelpGitAdvanced: "El modo avanzado está activado: los comandos que cambian el proyecto o se comunican con la copia remota también se ejecutan aquí, cada uno se muestra antes y solo se ejecuta si respondes que sí.",
    consoleAdvancedMode: "avanzado",
    consoleRootMode: "root",
    consoleSettingsModeTitle: "Modo de la consola",
    consoleSettingsModeIntro: "Lo que la consola puede hacer además de leer, sin cambiar cómo funcionan las acciones guiadas.",
    consoleModeReadOnly: "Solo lectura", consoleModeAdvanced: "Avanzado", consoleModeRoot: "Root",
    consoleModeReadOnlyDescription: "Solo consulta el proyecto, así que nada de lo que escribas puede cambiarlo.",
    consoleModeAdvancedDescription: "También puede cambiar el proyecto y su copia remota, mostrando cada cambio y preguntando antes de ejecutarlo.",
    consoleModeRootDescription: "Cambia el proyecto y su copia remota como el avanzado, pero ejecuta cada cambio en cuanto pulsas Intro.",
    consoleRootDialogTitle: "¿Pasar al modo root?",
    consoleRootDialogBody: "Los comandos que cambian el proyecto o su copia remota se ejecutarán en cuanto pulses Intro, git push incluido, sin preguntar antes.",
    consoleRootDialogStillShown: "La consola sigue mostrando qué hace cada uno antes de ejecutarlo.",
    consoleRootDialogStillChecked: "Un comando sigue sin ejecutarse si el proyecto cambió mientras se preparaba.",
    consoleRootDialogConfirm: "Pasar a root",
    consoleAdvancedSaveFailed: "No se pudo guardar el ajuste. Inténtalo de nuevo.",
    consoleAdvancedDialogTitle: "¿Pasar al modo avanzado?",
    consoleAdvancedDialogBody: "La consola ejecutará también comandos Git que cambian este proyecto o su copia remota, como git add, git commit -m, git switch, git stash, git fetch y git push.",
    consoleAdvancedDialogPreview: "Cada cambio se muestra antes y solo se ejecuta si respondes que sí. Si el proyecto cambia entretanto, no se ejecuta.",
    consoleAdvancedDialogLimits: "Los comandos que reescriben el historial guardado o pueden descartar trabajo siguen sin estar disponibles.",
    consoleAdvancedDialogGuided: "Las acciones guiadas siguen siendo la forma más sencilla y segura de hacer todo esto.",
    consoleAdvancedDialogConfirm: "Pasar a avanzado",
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
