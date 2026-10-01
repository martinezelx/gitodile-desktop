/** What is wrong with a name typed for a new line, stated before the press
 * rather than after it. Rust stays the authority — `create_version_line`
 * runs Git's own `check-ref-format --branch` and checks the existing lines —
 * so this is an early mirror of those rules, never a replacement for them. */
export type LineNameIssue =
  | { kind: "space" }
  | { kind: "character"; character: string }
  | { kind: "control" }
  | { kind: "sequence"; sequence: ".." | "//" | "@{" }
  | { kind: "leading"; character: string }
  | { kind: "part-leading-dot" }
  | { kind: "trailing"; character: string }
  | { kind: "lock-suffix" }
  | { kind: "reserved"; name: string }
  | { kind: "taken"; name: string }
  | { kind: "case-collision"; existing: string };

/** When an issue is worth saying. `live` issues cannot be fixed by typing on
 * — a space stays a space — so they are said as they appear. `submit` issues
 * are what every name looks like halfway through (`feature/`, `v1.`), so they
 * are said only when the reader asks to create. */
export type LineNameCheck = { issue: LineNameIssue; when: "live" | "submit" };

// Git's forbidden characters beyond the space (git-check-ref-format(1)):
// `~ ^ : ? * [ \` and the ASCII control characters.
const FORBIDDEN = new Set(["~", "^", ":", "?", "*", "[", "\\"]);

function foldAsciiCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function isControl(character: string): boolean {
  const code = character.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
}

/** The first thing wrong with `name` as a new line's name, or `null` when
 * Git would take it and no existing line already has it. Checked in the order
 * a reader can act on: what is in the name before how it ends, and the
 * format before the clash with an existing line. The name is taken as typed;
 * the box trims it the same way before it sends it. */
export function checkLineName(name: string, existingNames: readonly string[]): LineNameCheck | null {
  if (name === "") return null;

  // The ASCII space only: Git takes other Unicode spaces (a non-breaking one
  // pasted in with a name), and tabs and newlines are control characters,
  // said below as such.
  if (name.includes(" ")) return { issue: { kind: "space" }, when: "live" };
  for (const character of name) {
    if (FORBIDDEN.has(character)) return { issue: { kind: "character", character }, when: "live" };
    if (isControl(character)) return { issue: { kind: "control" }, when: "live" };
  }
  for (const sequence of ["..", "//", "@{"] as const) {
    if (name.includes(sequence)) return { issue: { kind: "sequence", sequence }, when: "live" };
  }
  // `-` would reach Git as an option; `/` and `.` start no valid ref part.
  const first = name[0];
  if (first === "-" || first === "/" || first === ".") {
    return { issue: { kind: "leading", character: first }, when: "live" };
  }
  const parts = name.split("/");
  // A part that starts with a dot stays wrong however much is typed after it.
  if (parts.some((part) => part.startsWith("."))) {
    return { issue: { kind: "part-leading-dot" }, when: "live" };
  }
  // A finished part — one a slash already follows — cannot end in `.lock`;
  // the last part is still being typed, so it is judged on submit below.
  if (parts.slice(0, -1).some((part) => part.endsWith(".lock"))) {
    return { issue: { kind: "lock-suffix" }, when: "live" };
  }

  const last = name[name.length - 1];
  if (last === "/" || last === ".") return { issue: { kind: "trailing", character: last }, when: "submit" };
  if (name.endsWith(".lock")) return { issue: { kind: "lock-suffix" }, when: "submit" };
  // Git refuses it as a branch name; typed on ("HEADER"), it is a fine one.
  // A lone "@" is not here: `check-ref-format --branch` and `git branch`
  // both take it, and this mirror must never be stricter than Rust.
  if (name === "HEAD") return { issue: { kind: "reserved", name }, when: "submit" };

  if (existingNames.includes(name)) return { issue: { kind: "taken", name }, when: "live" };
  // ASCII-only, as Rust's `eq_ignore_ascii_case` compares: a full Unicode
  // fold would call "ñandú" a clash with "Ñandú", which Rust lets through.
  const folded = foldAsciiCase(name);
  const collision = existingNames.find((existing) => foldAsciiCase(existing) === folded);
  if (collision) return { issue: { kind: "case-collision", existing: collision }, when: "live" };

  return null;
}

/** The prefix this project's own lines use most (`feature`, `fix`, `docs`…),
 * so the name field's example teaches the convention the project actually
 * has instead of one it might not. `null` unless at least two lines share
 * it — one line is a name, not a convention. Ties go to the alphabetically
 * first, so the example does not change between two equal readings. */
export function prevailingLinePrefix(names: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const name of names) {
    const slash = name.indexOf("/");
    if (slash <= 0) continue;
    const prefix = name.slice(0, slash);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 1;
  for (const [prefix, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > bestCount) {
      best = prefix;
      bestCount = count;
    }
  }
  return best;
}
