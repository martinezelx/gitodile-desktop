export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);
export const MOD_KEY_LABEL = IS_MAC ? "⌘" : "Ctrl";
