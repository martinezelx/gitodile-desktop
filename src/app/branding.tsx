export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

/** The product name at its brand seam. A product name is not translated, so the
 *  two halves live here rather than in the locale table; the "Odile" half is
 *  what carries the wordmark's light sweep in About, in step with the mascot's
 *  glasses (see `.about-dialog__odile` in `app-shell.css`). The whole name still
 *  reads as one word to assistive technology, because the halves are adjacent
 *  text with no separator. */
export const PRODUCT_NAME_PARTS = { lead: "Git", tail: "Odile" } as const;

/** The keycap labels the shortcut sheet draws for one platform. A Mac names its
 * modifiers with the symbols printed on its keycaps (⌘, ⇧) and lowercases
 * `esc`; Windows and Linux spell them out. Passing `null` — a plain browser run
 * with no plugin-os bridge — falls back to the same user-agent guess the rest of
 * the titlebar uses, so the sheet is still right where it can be. */
export function modifierKeyLabels(
  platform: string | null | undefined,
): { mod: string; shift: string; esc: string } {
  const isApple = platform ? platform === "macos" || platform === "ios" : IS_MAC;
  return isApple ? { mod: "⌘", shift: "⇧", esc: "esc" } : { mod: "Ctrl", shift: "Shift", esc: "Esc" };
}
