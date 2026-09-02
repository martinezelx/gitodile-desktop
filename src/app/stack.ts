/** The four layers About credits by name.
 *
 * Deliberately not the whole dependency list. Vite, Vitest, pnpm and Node are
 * build tooling the user never runs, and printing them turns a product-identity
 * surface into a rendered `package.json`. These four are the ones the product
 * is actually *made of*: the desktop shell, the UI runtime, the language the
 * frontend is written in, and the language the backend is written in.
 *
 * They are credits, not diagnostics. Every user on a given build runs exactly
 * the same four versions, so none of them can explain a machine-specific bug —
 * that is what the technical-details rows beside them are for. */
/** Shell outwards: what the app runs inside, then what draws it, then the two
 * languages. Fixed rather than sorted by name so the row never reshuffles
 * itself when a layer is missing.
 *
 * The names are the vendors' own spelling and are never translated: a product
 * name is a name. */
const STACK_LAYERS = [
  { id: "tauri", name: "Tauri" },
  { id: "react", name: "React" },
  { id: "typescript", name: "TypeScript" },
  { id: "rust", name: "Rust" },
] as const;

/** Derived from the table rather than declared beside it, so this list is the
 * one place a layer is named. Adding an entry here without adding it to
 * `__STACK_VERSIONS__` in `vite-env.d.ts` — and therefore to the build that
 * resolves it — fails to compile instead of rendering an empty tile. */
export type StackLayerId = (typeof STACK_LAYERS)[number]["id"];

export type StackLayer = {
  id: StackLayerId;
  name: string;
  version: string;
};

/** Takes the versions as an argument, defaulting to the build-time constant, so
 * the ordering and omission rules can be tested without a build. */
export function describeStack(versions = __STACK_VERSIONS__): StackLayer[] {
  return STACK_LAYERS.flatMap(({ id, name }) => {
    const version = versions[id];
    return version ? [{ id, name, version }] : [];
  });
}
