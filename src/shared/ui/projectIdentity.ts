/**
 * The identity a project shows in the rail, the switcher and the welcome
 * recents: a chosen emoji, the technology detected for it, or — when neither
 * is available — its colour-and-initials chip.
 *
 * The slugs are the IPC contract's own (`src-tauri/src/technology.rs`): adding
 * one here means adding it there, and vice versa. The resolution order is fixed
 * by task 130 — a user's choice always beats the detection, and the initials
 * fallback is never empty.
 */

export const TECHNOLOGY_IDS = [
  "tauri",
  "electron",
  "expo",
  "typescript",
  "javascript",
  "node",
  "react",
  "nextjs",
  "vue",
  "nuxt",
  "svelte",
  "angular",
  "astro",
  "tailwind",
  "graphql",
  "rust",
  "go",
  "python",
  "php",
  "ruby",
  "java",
  "kotlin",
  "csharp",
  "swift",
  "dart",
  "elixir",
  "haskell",
  "scala",
  "cpp",
  "c",
  "docker",
  "terraform",
  "flutter",
  "capacitor",
  "ionic",
  "godot",
  "ember",
  "django",
  "rails",
  "symfony",
  "objective-c",
  "perl",
  "lua",
  "r",
  "julia",
  "zig",
  "nim",
  "clojure",
  "erlang",
  "ocaml",
  "fsharp",
  "crystal",
  "fortran",
  "assembly",
  "powershell",
  "shell",
  "solidity",
  "vlang",
  "groovy",
  "ada",
  "purescript",
  "haxe",
  "racket",
  "coffeescript",
  "jupyter",
  "elm",
  "nix",
  "bazel",
  "ansible",
  "serverless",
  "helm",
  "firebase",
] as const;

export type TechnologyId = (typeof TECHNOLOGY_IDS)[number];

export type TechnologySource = "manifest" | "extension";

/** Mirrors the Rust `ProjectTechnology` response. */
export type ProjectTechnology = {
  path: string;
  technology: TechnologyId | null;
  source: TechnologySource | null;
};

const TECHNOLOGY_SET: ReadonlySet<string> = new Set(TECHNOLOGY_IDS);

export function isTechnologyId(value: unknown): value is TechnologyId {
  return typeof value === "string" && TECHNOLOGY_SET.has(value);
}

/** A stored emoji is one short glyph: trimmed, without control characters, and
 * capped at a few code points so a pasted paragraph can never become an
 * avatar. */
export function sanitizeEmoji(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const characters = [...trimmed];
  if (
    characters.length > 4 ||
    characters.some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      // Whitespace, C0 controls and DEL are never part of a chosen glyph.
      return character.trim() === "" || codePoint < 0x20 || codePoint === 0x7f;
    })
  ) {
    return null;
  }
  return trimmed;
}

export type ProjectIdentity =
  | { kind: "emoji"; emoji: string }
  | { kind: "technology"; technology: TechnologyId }
  | { kind: "initials" };

/** How a project avatar is filled when the project has no chosen emoji. A
 * global preference; `technology` is the default. */
export const PROJECT_AVATAR_STYLES = ["technology", "initials", "random"] as const;
export type ProjectAvatarStyle = (typeof PROJECT_AVATAR_STYLES)[number];
export const DEFAULT_PROJECT_AVATAR_STYLE: ProjectAvatarStyle = "technology";

export function isProjectAvatarStyle(value: unknown): value is ProjectAvatarStyle {
  return typeof value === "string" && (PROJECT_AVATAR_STYLES as readonly string[]).includes(value);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/** A stable pseudo-random emoji for a project, so "random" is the same on every
 * render and every launch — an icon that reshuffles itself would be worse than
 * no icon. The user can replace it per project. */
export function randomProjectEmoji(id: string): string {
  return PROJECT_ICON_EMOJIS[hashString(id) % PROJECT_ICON_EMOJIS.length];
}

/** A per-project choice that is not an emoji: it forces the colour-and-initials
 * chip for that project, whatever the global style or the detection says. It
 * shares the emoji store, so it is one reserved value rather than a second
 * map. */
export const PROJECT_ICON_INITIALS = "initials";

/** A stored per-project icon choice: an emoji, `PROJECT_ICON_INITIALS`, or
 * `null`/absent for "follow the global style". */
export type ProjectIconChoice = string | null;

/** Precedence: a chosen emoji or initials > the global style. Under
 * `technology` a detected technology outranks the initials; under `initials`
 * the initials are shown whatever was detected; under `random` a stable emoji
 * stands in. */
export function resolveProjectIdentity(input: {
  id?: string;
  choice?: ProjectIconChoice;
  technology?: TechnologyId | null;
  style?: ProjectAvatarStyle;
}): ProjectIdentity {
  if (input.choice === PROJECT_ICON_INITIALS) {
    return { kind: "initials" };
  }
  const emoji = sanitizeEmoji(input.choice);
  if (emoji !== null) {
    return { kind: "emoji", emoji };
  }
  const style = input.style ?? DEFAULT_PROJECT_AVATAR_STYLE;
  if (style === "initials") {
    return { kind: "initials" };
  }
  if (style === "random") {
    return { kind: "emoji", emoji: randomProjectEmoji(input.id ?? "") };
  }
  if (isTechnologyId(input.technology)) {
    return { kind: "technology", technology: input.technology };
  }
  return { kind: "initials" };
}

/** The human name of a technology, for the picker and for screen readers. */
export const TECHNOLOGY_LABELS: Record<TechnologyId, string> = {
  tauri: "Tauri",
  electron: "Electron",
  expo: "Expo",
  typescript: "TypeScript",
  javascript: "JavaScript",
  node: "Node.js",
  react: "React",
  nextjs: "Next.js",
  vue: "Vue",
  nuxt: "Nuxt",
  svelte: "Svelte",
  angular: "Angular",
  astro: "Astro",
  tailwind: "Tailwind CSS",
  graphql: "GraphQL",
  rust: "Rust",
  go: "Go",
  python: "Python",
  php: "PHP",
  ruby: "Ruby",
  java: "Java",
  kotlin: "Kotlin",
  csharp: "C#",
  swift: "Swift",
  dart: "Dart",
  elixir: "Elixir",
  haskell: "Haskell",
  scala: "Scala",
  cpp: "C++",
  c: "C",
  docker: "Docker",
  terraform: "Terraform",
  flutter: "Flutter",
  capacitor: "Capacitor",
  ionic: "Ionic",
  godot: "Godot",
  ember: "Ember",
  django: "Django",
  rails: "Ruby on Rails",
  symfony: "Symfony",
  "objective-c": "Objective-C",
  perl: "Perl",
  lua: "Lua",
  r: "R",
  julia: "Julia",
  zig: "Zig",
  nim: "Nim",
  clojure: "Clojure",
  erlang: "Erlang",
  ocaml: "OCaml",
  fsharp: "F#",
  crystal: "Crystal",
  fortran: "Fortran",
  assembly: "Assembly",
  powershell: "PowerShell",
  shell: "Shell",
  solidity: "Solidity",
  vlang: "V",
  groovy: "Groovy",
  ada: "Ada",
  purescript: "PureScript",
  haxe: "Haxe",
  racket: "Racket",
  coffeescript: "CoffeeScript",
  jupyter: "Jupyter",
  elm: "Elm",
  nix: "Nix",
  bazel: "Bazel",
  ansible: "Ansible",
  serverless: "Serverless",
  helm: "Helm",
  firebase: "Firebase",
};

/** The emoji the project-icon picker offers. Animals first (the crocodile is
 * GitOdile's own suggestion), then a few marks that read as a project rather
 * than a creature.
 *
 * Curated, not exhaustive, and on purpose:
 *
 * - **Bounded.** A wall of emoji is not a choice; a short grid is.
 * - **Distinct.** Every one differs from the others in silhouette and colour,
 *   because at 20px in the rail there is no room for subtlety.
 * - **Old enough to render everywhere.** Only Unicode 6-9 additions, which the
 *   colour-emoji fonts on Windows, macOS and Linux all carry; newer glyphs
 *   (🪿, 🧪, 🫠) are missing or redrawn on some systems, and a blank box is
 *   worse than no icon.
 * - **Mostly animals**, matching the mascot, plus a handful of neutral marks
 *   for the projects that are not a creature. */
export const PROJECT_ICON_EMOJIS = [
  "🐊",
  "🦎",
  "🐢",
  "🐙",
  "🦀",
  "🐝",
  "🦉",
  "🦊",
  "🐻",
  "🐼",
  "🦁",
  "🐧",
  "🐳",
  "🦔",
  "🐸",
  "🦅",
  "📦",
  "🚀",
  "🌱",
  "🎨",
  "🔬",
  "🔧",
  "📚",
  "🎮",
] as const;
