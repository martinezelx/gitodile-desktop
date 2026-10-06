import type { ConsoleTier } from "./port";

export const CONSOLE_SHORTCUTS_STORAGE_KEY = "gitodile-console-shortcuts-v1";

/** What the shell already knows about the project, for the console's status line. */
export type ConsoleProjectStatus = {
  /** Files with unsaved changes, or null while that is unknown. */
  changes: number | null;
  linesAdded: number;
  linesRemoved: number;
  /** Saved versions not yet published, or null when unknown or possibly stale. */
  unpublished: number | null;
  /** Newer project changes available, or null when unknown or possibly stale. */
  incoming: number | null;
};

/** Every read-only query Rust's catalogue offers, in the order they are listed. */
export const OPERATION_IDS = [
  "status", "diff", "staged", "log", "graph", "last", "branches", "tags", "remotes", "stashes", "authors",
] as const;
/** The catalogue the first stored shortcut lists were written against. */
const FIRST_CATALOGUE: readonly string[] = ["status", "diff", "log", "branches"];
const SHORTCUT_LIMIT = 24;
export type ConsoleOperationId = (typeof OPERATION_IDS)[number];
export type QueryShortcut = { name: string; operationId: ConsoleOperationId };
/**
 * A name for a whole Git command line. The tier Rust gave the line when it was
 * saved is its ceiling: every run is planned again, and a plan that now needs
 * more than that is not run.
 */
export type LineShortcut = { name: string; line: string; tier: ConsoleTier };
export type ConsoleShortcut = QueryShortcut | LineShortcut;

export function isLineShortcut(shortcut: ConsoleShortcut): shortcut is LineShortcut {
  return "line" in shortcut;
}

/**
 * The Git commands the console reads without advanced mode, in the order
 * `help git` lists them. Rust decides what runs; this list only completes and
 * explains, and a Rust test keeps it equal to the classifier's own.
 */
export const GIT_READ_COMMANDS = [
  "status", "log", "show", "diff", "blame", "grep", "branch", "tag", "reflog", "stash list", "stash show",
  "remote", "ls-files", "ls-tree", "cat-file", "rev-parse", "describe", "shortlog", "count-objects",
  "whatchanged", "name-rev", "merge-base", "for-each-ref", "show-ref", "version",
] as const;
export type GitReadCommand = (typeof GIT_READ_COMMANDS)[number];

/** Long enough for any command a person types; Rust enforces its own limit. */
export const MAX_LINE_LENGTH = 4096;
const TIER_ORDER: readonly ConsoleTier[] = ["read", "local_change", "history_change", "remote", "destructive", "never"];

/** Whether a line starts a Git command rather than naming a shortcut. */
export function isGitLine(value: string): boolean {
  return /^git(\s|$)/.test(value.trim());
}

/** Whether a new plan's tier goes beyond the one a shortcut was saved with. */
export function widensTier(saved: ConsoleTier, planned: ConsoleTier): boolean {
  return TIER_ORDER.indexOf(planned) > TIER_ORDER.indexOf(saved);
}

/**
 * The command each catalogue query answers, as someone would type it. Rust
 * runs a fixed template that adds only what keeps output inert (no colour, no
 * external diff or text conversion, no signature check); a Rust test holds
 * each template to this line.
 */
export const QUERY_COMMANDS: Record<ConsoleOperationId, string> = {
  status: "git status",
  diff: "git diff",
  staged: "git diff --cached",
  log: "git log --oneline -20",
  graph: "git log --graph --oneline --decorate --all -40",
  last: "git show --stat HEAD",
  branches: "git branch --list",
  tags: "git tag --list --sort=-creatordate",
  remotes: "git remote -v",
  stashes: "git stash list",
  authors: "git shortlog -sn --no-merges HEAD",
};

/** The Git command a shortcut runs, for the editor, `help` and the docs. */
export function shortcutCommand(shortcut: ConsoleShortcut): string {
  return isLineShortcut(shortcut) ? shortcut.line : QUERY_COMMANDS[shortcut.operationId];
}

/** Built-in command lines, planned by Rust on every run like any other. */
const DEFAULT_LINE_SHORTCUTS = [
  { name: "short", line: "git status --short", tier: "read" },
  { name: "stat", line: "git diff --stat", tier: "read" },
  { name: "today", line: "git log --oneline --since=midnight", tier: "read" },
  { name: "week", line: "git log --oneline --since=1.week.ago", tier: "read" },
  { name: "unpublished", line: "git log --oneline @{upstream}..HEAD", tier: "read" },
  { name: "incoming", line: "git log --oneline HEAD..@{upstream}", tier: "read" },
  { name: "moves", line: "git reflog -20", tier: "read" },
  { name: "all-lines", line: "git branch -a -vv", tier: "read" },
  { name: "size", line: "git count-objects -vH", tier: "read" },
] as const satisfies readonly LineShortcut[];
export type DefaultLineName = (typeof DEFAULT_LINE_SHORTCUTS)[number]["name"];

const DEFAULT_QUERY_SHORTCUTS: readonly QueryShortcut[] = [
  { name: "look", operationId: "status" },
  { name: "diff", operationId: "diff" },
  { name: "staged", operationId: "staged" },
  { name: "log", operationId: "log" },
  { name: "graph", operationId: "graph" },
  { name: "last", operationId: "last" },
  { name: "branches", operationId: "branches" },
  { name: "tags", operationId: "tags" },
  { name: "remotes", operationId: "remotes" },
  { name: "stashes", operationId: "stashes" },
  { name: "authors", operationId: "authors" },
];

export const DEFAULT_SHORTCUTS: readonly ConsoleShortcut[] = [...DEFAULT_QUERY_SHORTCUTS, ...DEFAULT_LINE_SHORTCUTS];

/**
 * What identifies a default across releases: its query, or its name for a
 * built-in line. Stored with the shortcuts, so a default added later reaches
 * people who customised their list, and one they removed stays removed.
 */
function defaultKey(shortcut: ConsoleShortcut): string {
  return isLineShortcut(shortcut) ? `line:${shortcut.name}` : shortcut.operationId;
}
export const SHORTCUT_CATALOGUE: readonly string[] = DEFAULT_SHORTCUTS.map(defaultKey);

/**
 * Which built-in line a shortcut runs, by its command: a renamed built-in
 * still shows what it shows.
 */
export function defaultLineName(shortcut: ConsoleShortcut): DefaultLineName | null {
  if (!isLineShortcut(shortcut)) return null;
  const builtIn = DEFAULT_LINE_SHORTCUTS.find((item) => item.line === shortcut.line);
  return builtIn ? builtIn.name : null;
}

export const CONTROL_WORDS = ["help", "clear", "shortcuts", "settings"] as const;
export type ConsoleControlWord = (typeof CONTROL_WORDS)[number];
/** Control words, and `git`, which always starts a Git command. */
const RESERVED: ReadonlySet<string> = new Set([...CONTROL_WORDS, "git"]);
const isControlWord = (value: string): value is ConsoleControlWord => RESERVED.has(value);
const SHORTCUT_NAME = /^[a-z][a-z0-9-]{0,19}$/;

export function isOperationId(value: unknown): value is ConsoleOperationId {
  return OPERATION_IDS.some((id) => id === value);
}

export function shortcutNameIssue(name: string, shortcuts: readonly ConsoleShortcut[], except?: string): "invalid" | "reserved" | "duplicate" | null {
  if (!SHORTCUT_NAME.test(name)) return "invalid";
  if (RESERVED.has(name)) return "reserved";
  if (shortcuts.some((shortcut) => shortcut.name === name && shortcut.name !== except)) return "duplicate";
  return null;
}

/**
 * The stored names, plus a default name for every query added to the catalogue
 * since they were saved, so a new release's queries reach people who had
 * already customised their names. A query they knew about and removed stays
 * removed. Anything malformed falls back to the defaults.
 */
export function readShortcuts(storage?: Pick<Storage, "getItem">): ConsoleShortcut[] {
  try {
    const raw = (storage ?? localStorage).getItem(CONSOLE_SHORTCUTS_STORAGE_KEY);
    if (raw === null) return [...DEFAULT_SHORTCUTS];
    const parsed: unknown = JSON.parse(raw);
    // The first format was the bare list; later ones record the catalogue too.
    const stored = Array.isArray(parsed)
      ? { catalogue: FIRST_CATALOGUE, shortcuts: parsed }
      : parsed && typeof parsed === "object" ? parsed as { catalogue?: unknown; shortcuts?: unknown } : null;
    if (!stored || !Array.isArray(stored.shortcuts) || !Array.isArray(stored.catalogue) || stored.shortcuts.length > SHORTCUT_LIMIT) return [...DEFAULT_SHORTCUTS];
    const shortcuts: ConsoleShortcut[] = [];
    for (const entry of stored.shortcuts as unknown[]) {
      if (!entry || typeof entry !== "object") return [...DEFAULT_SHORTCUTS];
      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.name !== "string" || shortcutNameIssue(candidate.name, shortcuts)) return [...DEFAULT_SHORTCUTS];
      if (isOperationId(candidate.operationId)) {
        shortcuts.push({ name: candidate.name, operationId: candidate.operationId });
      } else if (typeof candidate.line === "string" && isGitLine(candidate.line) && candidate.line.length <= MAX_LINE_LENGTH
        && TIER_ORDER.includes(candidate.tier as ConsoleTier) && candidate.tier !== "never") {
        shortcuts.push({ name: candidate.name, line: candidate.line.trim(), tier: candidate.tier as ConsoleTier });
      } else {
        return [...DEFAULT_SHORTCUTS];
      }
    }
    const known = new Set(stored.catalogue.filter((id): id is string => typeof id === "string"));
    for (const shortcut of DEFAULT_SHORTCUTS) {
      if (known.has(defaultKey(shortcut)) || shortcuts.length >= SHORTCUT_LIMIT) continue;
      if (!shortcutNameIssue(shortcut.name, shortcuts)) shortcuts.push({ ...shortcut });
    }
    return shortcuts;
  } catch {
    return [...DEFAULT_SHORTCUTS];
  }
}

export function writeShortcuts(shortcuts: readonly ConsoleShortcut[], storage?: Pick<Storage, "setItem">): boolean {
  try {
    (storage ?? localStorage).setItem(CONSOLE_SHORTCUTS_STORAGE_KEY, JSON.stringify({ catalogue: SHORTCUT_CATALOGUE, shortcuts }));
    return true;
  } catch {
    return false;
  }
}

export type ParsedInput =
  | { kind: "empty" }
  | { kind: "help" }
  | { kind: "clear" }
  | { kind: "shortcuts" }
  | { kind: "settings" }
  | { kind: "help-git" }
  | { kind: "query"; shortcut: ConsoleShortcut }
  | { kind: "git"; line: string }
  | { kind: "unknown"; input: string };

/**
 * One exact name, or a line starting with `git`. The line is handed to Rust
 * as typed: the renderer never splits it into arguments or judges it.
 */
export function parseConsoleInput(raw: string, shortcuts: readonly ConsoleShortcut[]): ParsedInput {
  const input = raw.trim();
  if (!input) return { kind: "empty" };
  if (input === "git" || /^help\s+git$/.test(input)) return { kind: "help-git" };
  if (isGitLine(input)) return { kind: "git", line: input };
  if (isControlWord(input)) return { kind: input };
  if (!SHORTCUT_NAME.test(input)) return { kind: "unknown", input };
  const shortcut = shortcuts.find((item) => item.name === input);
  return shortcut ? { kind: "query", shortcut } : { kind: "unknown", input };
}

export type ConsoleCompletion =
  | { kind: "shortcut"; name: string; shortcut: ConsoleShortcut }
  | { kind: "control"; name: ConsoleControlWord }
  | { kind: "git"; name: string; command: GitReadCommand };

/**
 * What extends the typed text: after `git `, the read commands; otherwise
 * shortcut names before console actions. A completion's name is the whole
 * line it completes to, keeping what was typed.
 */
export function completionsFor(raw: string, shortcuts: readonly ConsoleShortcut[], limit = 6): ConsoleCompletion[] {
  const git = /^git +([a-z-]+(?: [a-z-]*)?|)$/.exec(raw);
  if (git) {
    const typed = git[1];
    return GIT_READ_COMMANDS
      .filter((command) => command.startsWith(typed) && command !== typed)
      .map((command) => ({ kind: "git" as const, name: `${raw}${command.slice(typed.length)}`, command }))
      .slice(0, limit);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(raw)) return [];
  const extends_ = (name: string): boolean => name.startsWith(raw) && name !== raw;
  return [
    ...shortcuts.filter((shortcut) => extends_(shortcut.name)).map((shortcut) => ({ kind: "shortcut" as const, name: shortcut.name, shortcut })),
    ...CONTROL_WORDS.filter(extends_).map((name) => ({ kind: "control" as const, name })),
  ].slice(0, limit);
}

/** Every name that reaches one query, in the order the user keeps them. */
export function namesByOperation(shortcuts: readonly ConsoleShortcut[]): Array<{ operationId: ConsoleOperationId; names: string[] }> {
  const queries = shortcuts.filter((shortcut): shortcut is QueryShortcut => !isLineShortcut(shortcut));
  return OPERATION_IDS
    .map((operationId) => ({ operationId, names: queries.filter((shortcut) => shortcut.operationId === operationId).map((shortcut) => shortcut.name) }))
    .filter((group) => group.names.length > 0);
}
