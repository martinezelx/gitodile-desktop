import { useEffect, useMemo, useState } from "react";
import { readBranchPreference, writeBranchPreference } from "./storedPreferences";

export const FAVOURITE_BRANCHES_STORAGE_KEY = "gitodile-favourite-branches";

type StoredFavourites = Readonly<Record<string, readonly string[]>>;

function readStoredFavourites(): StoredFavourites {
  try {
    const value = readBranchPreference(FAVOURITE_BRANCHES_STORAGE_KEY);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    return Object.fromEntries(
      Object.entries(value).flatMap(([scope, names]) =>
        Array.isArray(names)
          ? [[scope, [...new Set(names.filter((name): name is string => typeof name === "string"))]]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

/**
 * Display-only branch favourites keyed by the common Git directory.
 * Linked workspaces therefore share the same choices without leaking common
 * branch names such as `main` into unrelated projects.
 */
export function useStoredFavouriteBranches(
  scope: string | null,
): [ReadonlySet<string>, (name: string) => void] {
  const [stored, setStored] = useState<StoredFavourites>(readStoredFavourites);

  useEffect(() => {
    writeBranchPreference(FAVOURITE_BRANCHES_STORAGE_KEY, stored);
  }, [stored]);

  const favourites = useMemo(
    () => new Set(scope ? (stored[scope] ?? []) : []),
    [scope, stored],
  );

  const toggle = (name: string): void => {
    if (!scope) return;
    setStored((current) => {
      const next = new Set(current[scope] ?? []);
      if (!next.delete(name)) next.add(name);
      return { ...current, [scope]: [...next] };
    });
  };

  return [favourites, toggle];
}
