import { useCallback, useEffect, useMemo, useState } from "react";
import { readBranchPreference, writeBranchPreference } from "./storedPreferences";

export const BRANCH_FOLDS_STORAGE_KEY = "gitodile-branch-folds";

/** Per project, the headings the reader folded (`true`) or opened (`false`)
 * against their default. Only what the reader changed is kept, so a heading
 * they never touched follows the default as the list changes. */
type StoredFolds = Readonly<Record<string, Readonly<Record<string, boolean>>>>;

function readStoredFolds(): StoredFolds {
  try {
    const value = readBranchPreference(BRANCH_FOLDS_STORAGE_KEY);
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

/** Display-only: how the Branches list was folded in this project, kept across
 * launches. Storage that refuses a write loses the memory, never the list. */
export function useStoredBranchFolds(
  scope: string,
): [Readonly<Record<string, boolean>>, (id: string, folded: boolean) => void] {
  const [stored, setStored] = useState<StoredFolds>(readStoredFolds);

  useEffect(() => {
    writeBranchPreference(BRANCH_FOLDS_STORAGE_KEY, stored);
  }, [stored]);

  const folds = useMemo(() => stored[scope] ?? {}, [scope, stored]);
  const setFold = useCallback(
    (id: string, folded: boolean): void =>
      setStored((current) => ({ ...current, [scope]: { ...(current[scope] ?? {}), [id]: folded } })),
    [scope],
  );
  return [folds, setFold];
}
