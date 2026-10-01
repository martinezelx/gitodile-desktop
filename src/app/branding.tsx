export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

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
