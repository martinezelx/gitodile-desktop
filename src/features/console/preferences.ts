/** How the console looks and helps, chosen in Settings and shared by every project. */
export type ConsoleTextSize = "small" | "normal" | "large";

export type ConsolePreferences = {
  /** Grey inline completion and the menu of matching names. */
  autocomplete: boolean;
  /** The mark and project summary an empty transcript opens with. */
  welcome: boolean;
  /** Whether the block cursor blinks; reduced motion always keeps it still. */
  cursorBlink: boolean;
  textSize: ConsoleTextSize;
};

export const CONSOLE_TEXT_SIZES: readonly ConsoleTextSize[] = ["small", "normal", "large"];

export const DEFAULT_CONSOLE_PREFERENCES: ConsolePreferences = {
  autocomplete: true,
  welcome: true,
  cursorBlink: true,
  textSize: "normal",
};

/** Each field falls back on its own, so an older or hand-edited value keeps what it can. */
export function normalizeConsolePreferences(value: unknown): ConsolePreferences {
  const read = value && typeof value === "object" ? value as Partial<Record<keyof ConsolePreferences, unknown>> : {};
  const boolean = (field: unknown, fallback: boolean): boolean => (typeof field === "boolean" ? field : fallback);
  return {
    autocomplete: boolean(read.autocomplete, DEFAULT_CONSOLE_PREFERENCES.autocomplete),
    welcome: boolean(read.welcome, DEFAULT_CONSOLE_PREFERENCES.welcome),
    cursorBlink: boolean(read.cursorBlink, DEFAULT_CONSOLE_PREFERENCES.cursorBlink),
    textSize: CONSOLE_TEXT_SIZES.find((size) => size === read.textSize) ?? DEFAULT_CONSOLE_PREFERENCES.textSize,
  };
}
