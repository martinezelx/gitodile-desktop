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
export type ConsoleShortcut = { name: string; operationId: ConsoleOperationId };

export const DEFAULT_SHORTCUTS: readonly ConsoleShortcut[] = [
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

export const CONTROL_WORDS = ["help", "clear", "shortcuts"] as const;
export type ConsoleControlWord = (typeof CONTROL_WORDS)[number];
const RESERVED: ReadonlySet<string> = new Set(CONTROL_WORDS);
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
      if (typeof candidate.name !== "string" || !isOperationId(candidate.operationId)) return [...DEFAULT_SHORTCUTS];
      if (shortcutNameIssue(candidate.name, shortcuts)) return [...DEFAULT_SHORTCUTS];
      shortcuts.push({ name: candidate.name, operationId: candidate.operationId });
    }
    const known = new Set(stored.catalogue.filter((id): id is string => typeof id === "string"));
    for (const shortcut of DEFAULT_SHORTCUTS) {
      if (known.has(shortcut.operationId) || shortcuts.length >= SHORTCUT_LIMIT) continue;
      if (!shortcutNameIssue(shortcut.name, shortcuts)) shortcuts.push({ ...shortcut });
    }
    return shortcuts;
  } catch {
    return [...DEFAULT_SHORTCUTS];
  }
}

export function writeShortcuts(shortcuts: readonly ConsoleShortcut[], storage?: Pick<Storage, "setItem">): boolean {
  try {
    (storage ?? localStorage).setItem(CONSOLE_SHORTCUTS_STORAGE_KEY, JSON.stringify({ catalogue: OPERATION_IDS, shortcuts }));
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
  | { kind: "query"; shortcut: ConsoleShortcut }
  | { kind: "unknown"; input: string };

/** One exact name per submission. A shell line never becomes a Git argument. */
export function parseConsoleInput(raw: string, shortcuts: readonly ConsoleShortcut[]): ParsedInput {
  const input = raw.trim();
  if (!input) return { kind: "empty" };
  if (isControlWord(input)) return { kind: input };
  if (!SHORTCUT_NAME.test(input)) return { kind: "unknown", input };
  const shortcut = shortcuts.find((item) => item.name === input);
  return shortcut ? { kind: "query", shortcut } : { kind: "unknown", input };
}

export type ConsoleCompletion =
  | { kind: "shortcut"; name: string; operationId: ConsoleOperationId }
  | { kind: "control"; name: ConsoleControlWord };

/** Names that extend what was typed; shortcuts before console actions. */
export function completionsFor(raw: string, shortcuts: readonly ConsoleShortcut[], limit = 6): ConsoleCompletion[] {
  if (!/^[a-z][a-z0-9-]*$/.test(raw)) return [];
  const extends_ = (name: string): boolean => name.startsWith(raw) && name !== raw;
  return [
    ...shortcuts.filter((shortcut) => extends_(shortcut.name)).map((shortcut) => ({ kind: "shortcut" as const, ...shortcut })),
    ...CONTROL_WORDS.filter(extends_).map((name) => ({ kind: "control" as const, name })),
  ].slice(0, limit);
}

/** Every name that reaches one query, in the order the user keeps them. */
export function namesByOperation(shortcuts: readonly ConsoleShortcut[]): Array<{ operationId: ConsoleOperationId; names: string[] }> {
  return OPERATION_IDS
    .map((operationId) => ({ operationId, names: shortcuts.filter((shortcut) => shortcut.operationId === operationId).map((shortcut) => shortcut.name) }))
    .filter((group) => group.names.length > 0);
}
