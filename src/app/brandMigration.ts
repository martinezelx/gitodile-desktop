const LEGACY_STORAGE_PREFIX = "gitodrile-";
const CURRENT_STORAGE_PREFIX = "gitodile-";

/**
 * Preserve pre-rename browser state without letting an older value replace a
 * preference already written by GitOdile. Legacy entries stay in place so a
 * pre-rename build can still be used as a rollback.
 */
export function migrateLegacyBrandStorage(storage: Storage = localStorage): void {
  try {
    const legacyKeys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(LEGACY_STORAGE_PREFIX)) legacyKeys.push(key);
    }

    for (const legacyKey of legacyKeys) {
      const currentKey = CURRENT_STORAGE_PREFIX + legacyKey.slice(LEGACY_STORAGE_PREFIX.length);
      if (storage.getItem(currentKey) !== null) continue;
      const value = storage.getItem(legacyKey);
      if (value !== null) storage.setItem(currentKey, value);
    }
  } catch {
    // Storage can be unavailable in privacy-restricted webviews. Startup and
    // safe Git operations must remain usable even when preferences cannot be
    // migrated or persisted.
  }
}
