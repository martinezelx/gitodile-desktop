import { useCallback, useEffect, useMemo, useState } from "react";

export const VERSION_LINE_FOLDS_STORAGE_KEY = "gitodile-version-line-folds";

/** Per project, the headings the reader folded (`true`) or opened (`false`)
 * against their default. Only what the reader changed is kept, so a heading
 * they never touched follows the default as the list changes. */
type StoredFolds = Readonly<Record<string, Readonly<Record<string, boolean>>>>;

function readStoredFolds(): StoredFolds {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(VERSION_LINE_FOLDS_STORAGE_KEY) ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([scope, folds]) =>
        folds && typeof folds === "object" && !Array.isArray(folds)
          ? [
              [
                scope,
                Object.fromEntries(
                  Object.entries(folds).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
                ),
              ],
            ]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

/** Display-only: how the Lines list was folded in this project, kept across
 * launches. Storage that refuses a write loses the memory, never the list. */
export function useStoredLineFolds(
  scope: string,
): [Readonly<Record<string, boolean>>, (id: string, folded: boolean) => void] {
  const [stored, setStored] = useState<StoredFolds>(readStoredFolds);

  useEffect(() => {
    try {
      localStorage.setItem(VERSION_LINE_FOLDS_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Private or full storage: the folds last for this session only.
    }
  }, [stored]);

  const folds = useMemo(() => stored[scope] ?? {}, [scope, stored]);
  const setFold = useCallback(
    (id: string, folded: boolean): void =>
      setStored((current) => ({ ...current, [scope]: { ...(current[scope] ?? {}), [id]: folded } })),
    [scope],
  );
  return [folds, setFold];
}
