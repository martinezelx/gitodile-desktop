/** Read only the current preference format; unavailable or invalid data is empty. */
export function readBranchPreference(key: string): Readonly<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Readonly<Record<string, unknown>>;
    }
  } catch {
    // Unavailable storage: choices remain in memory for this session.
  }
  return {};
}

export function writeBranchPreference(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Neither a full store nor private mode may prevent branch navigation.
  }
}
