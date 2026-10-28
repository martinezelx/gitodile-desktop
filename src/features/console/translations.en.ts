import type { ConsoleTier } from "./port";
import type { ConsoleTranslations } from "./translations";
import { formatDuration } from "./translations";

const EN_TIER_EFFECTS: Record<ConsoleTier, string> = {
  read: "only reads the project", local_change: "changes the project", history_change: "rewrites saved history",
  remote: "talks to the remote copy", destructive: "can discard work", never: "isn't available",
};

export const en: ConsoleTranslations = {
  consoleTitle: "Console", consoleShortcuts: "Shortcuts",
  consolePromptLabel: "Console command", consolePromptOn: "on",
  consoleHintComplete: "Tab completes · Enter runs", consoleHintNavigate: "↑↓ history · Ctrl+L clears",
  consoleEmpty: "Type help to see the shortcuts, or a Git command such as git log --oneline.",
  consoleWelcomeProject: "project", consoleWelcomeBranch: "branch", consoleWelcomeGit: "git", consoleWelcomeConfirm: "confirm",
  consoleWelcomeConfirmOn: "before each change", consoleWelcomeConfirmOff: "off",
  consoleWelcomeProvider: "provider",
  consoleProvider: (host) => {
    switch (host.kind) {
      case "github": return host.companyServer ? `GitHub Enterprise · ${host.host}` : "GitHub";
      case "gitlab": return host.companyServer ? `GitLab Self-Managed · ${host.host}` : "GitLab";
      case "bitbucket": return "Bitbucket";
      case "git": return host.host ? `Git server · ${host.host}` : "Git server";
      case "local": return "this computer only";
      case "unclear": return "several remotes";
    }
  },
  consoleWelcomeProjectSection: "project", consoleWelcomeEnvironmentSection: "environment",
  consoleWelcomeChanges: "changes", consoleWelcomePublish: "publish", consoleWelcomeTheme: "theme",
  consoleWelcomeUnpublished: (versions) => `${versions} ${versions === 1 ? "version" : "versions"}`, consoleWelcomeUpToDate: "up to date",
  consoleStatusSaved: "everything saved",
  consoleStatusUnsaved: (files) => `${files} unsaved`,
  consoleStatusIncoming: (versions) => `↓${versions} new`,
  consoleHelpIntro: "Available shortcuts (read-only)",
  consoleHelpNames: "Shortcut", consoleHelpMeaning: "What it shows", consoleHelpCommand: "Git command",
  consoleShortcutOwnLine: "Your command line",
  consoleDefaultLines: {
    short: "Compact project status", stat: "Unstaged changes per file", today: "Versions saved today",
    week: "Versions saved this week", unpublished: "Saved versions not yet published",
    incoming: "Newer changes already fetched", moves: "Recent moves of HEAD",
    "all-branches": "All branches, local and remote", size: "How much the project stores",
  }, consoleHelpActions: "Also: help git lists the Git commands you can type, clear empties the view, shortcuts edits the names, settings opens the console settings.",
  consoleControlHelp: "List the shortcuts", consoleControlClear: "Clear the view", consoleControlShortcuts: "Edit shortcut names",
  consoleControlSettings: "Open the console settings", consoleOpenSettings: "Console settings",
  consoleCompletions: "Matching shortcuts", consoleStatusLine: "Console status", consoleSearch: "Search or do something…", consoleSearchLabel: "Open command palette",
  consoleStatusConfirm: "confirms changes",
  consoleStatusConfirmShort: "Confirms",
  consoleStatusNoConfirm: "no confirmation",
  consoleStatusNoConfirmShort: "No confirm",
  consoleCopy: "Copy output", consoleCopied: "Copied", consoleRerun: "Run again",
  consoleDuration: (ms) => formatDuration(ms, "en"), consoleTruncatedShort: "Shortened", consoleSucceeded: "Finished",
  consoleUnknown: (input) => `“${input}” isn't a shortcut or a Git command. Type help to see the names, or help git for Git commands.`,
  consoleRunning: "Running query…", consoleDone: "Query finished.", consoleNoOutput: "No output for this query.",
  consoleFailed: (code) => `Git finished with an error${code === null ? "" : ` (code ${code})`}.`,
  consoleTruncated: "Output was shortened to keep the console responsive.",
  consoleRequestFailed: "The query couldn't run. Check the project and try again.",
  consoleShortcutsTitle: "Console shortcuts", consoleShortcutsDescription: "Shared by all your projects; each runs a Git command.",
  consoleShortcutName: "Shortcut name", consoleShortcutTarget: "Query", consoleQueryPrevious: "Previous query", consoleQueryNext: "Next query", consoleShortcutAdd: "Add shortcut",
  consoleShortcutRename: "Rename", consoleShortcutRemove: "Remove", consoleShortcutSave: "Save name",
  consoleShortcutCancel: "Cancel", consoleShortcutReset: "Restore defaults", consoleShortcutClose: "Close shortcuts",
  consoleShortcutInvalid: "Use 1–20 lowercase letters, numbers or hyphens, starting with a letter.",
  consoleShortcutReserved: "That name is reserved for a console action.",
  consoleShortcutDuplicate: "That shortcut name is already in use.",
  consoleShortcutLimit: "You can keep up to 32 shortcuts.",
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
    branch: "Branches", tag: "Tags", reflog: "Where HEAD and the branches have been",
    "stash list": "Changes set aside", "stash show": "What a set-aside change holds",
    remote: "Remote copies and their addresses", "ls-files": "Files Git tracks", "ls-tree": "Files in a saved version",
    "cat-file": "A stored object, as Git keeps it", "rev-parse": "The ID a name points to", describe: "A version named from its nearest tag",
    shortlog: "Saved versions by author", "count-objects": "How much the project stores",
    whatchanged: "Saved versions with the files they changed", "name-rev": "A version named from a nearby branch or tag",
    "merge-base": "Where two branches parted", "for-each-ref": "Branches and tags, in a format you choose",
    "show-ref": "Branches and tags with their IDs", version: "The Git version",
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
  consoleConfirmOffDialogTitle: "Run without asking?",
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
      case "commits": return `Saves a new version${fact.files === null ? " of the files you named" : ` with ${files(fact.files)} ready to save`}${fact.branch ? ` on the branch “${fact.branch}”` : ""}.`;
      case "switches": return fact.create ? `Creates the branch “${fact.target}” and switches to it.` : `Switches to “${fact.target}”. Git stops if your changes would be overwritten.`;
      case "creates_branch": return `Creates the branch “${fact.name}”.`;
      case "creates_tag": return `Creates the tag “${fact.name}”.`;
      case "sets_aside": return `Sets aside ${files(fact.files)} with changes.`;
      case "applies_set_aside": return `Brings back ${fact.stash} and keeps it in the list.`;
      case "reverts": return `Saves a new version that undoes ${fact.version}, with Git's own message.`;
      case "copies_version": return `Copies ${fact.version} onto the current branch as a new version.`;
      case "fetches": return `Gets new project changes from ${remote(fact.remote)} without changing your files.`;
      case "pulls": return `Gets new project changes from ${remote(fact.remote)} and brings them in only if nothing needs combining.`;
      case "publishes": return `Publishes ${fact.versions === null ? "" : `${fact.versions} ${fact.versions === 1 ? "saved version" : "saved versions"} of `}${fact.branch ? `“${fact.branch}”` : "the current branch"} to ${remote(fact.remote)}.`;
      case "asks_remote": return `Asks ${remote(fact.remote)} what it has; nothing changes.`;
      case "skips_hooks": return fact.typed ? "The project's hooks won't run, as the command asks." : "The project's hooks won't run: they are turned off in Settings.";
    }
  },
  consoleRunFailures: {
    hook_rejected: "A Git hook in this project stopped the command. Its message is above.",
    signing_failed: "Git couldn't sign it. Check your commit-signing setup.",
    authentication_failed: "Git couldn't sign in to the remote copy. Check your saved credentials for it; the console never asks for them.",
    remote_rejected: "The remote copy refused the change under its own rules.",
    not_fast_forward: "The remote copy has changes you don't have yet. Get them first; the console never forces or combines branches.",
  },
  consoleStatus: "Project status", consoleDiff: "Unstaged changes", consoleLog: "Recent versions", consoleBranches: "Local branches",
  consoleStaged: "Changes ready to save", consoleGraph: "Version graph", consoleLast: "Latest saved version", consoleTags: "Tags",
  consoleRemotes: "Remote copies", consoleStashes: "Changes set aside", consoleAuthors: "Authors",
  consoleHostingLabels: {
    prs: "Open pull or merge requests", "my-prs": "Your pull or merge requests", issues: "Open issues",
    runs: "Recent CI runs", checks: "Checks on this branch", repo: "The project on its hosting service",
  },
  consoleHostingUnavailable: (reason, host) => {
    const cli = host.kind === "gitlab" ? "GitLab CLI (glab)" : "GitHub CLI (gh)";
    const section = host.kind === "gitlab" ? "GitLab" : "GitHub";
    if (reason === "cli_missing") return `${cli} isn't installed. Install it from Settings › ${section}, then try again.`;
    if (reason === "signed_out") return `${cli} has no account signed in for ${host.host ?? "this server"}. Connect one in Settings › ${section}, then try again.`;
    switch (host.kind) {
      case "bitbucket": return "Bitbucket has no official command-line tool, so these shortcuts work only for GitHub and GitLab projects.";
      case "local": return "This project has no remote yet, so there is no hosting service to ask.";
      case "unclear": return "This project has several remotes and none is clearly its own. Publish the current branch, or name one of them origin, so the console knows which to ask.";
      default: return "This project's remote isn't on GitHub or GitLab, so there is no hosting tool to ask.";
    }
  },
};
