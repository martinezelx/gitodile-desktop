/**
 * Projects this machine has opened before, newest first.
 *
 * Deliberately a *separate* store from `gitodrile-projects` (see
 * `sessions.ts`): that one is the set of projects currently open, and it
 * forgets a project the moment it is closed — which is exactly when a recents
 * list becomes useful. Same privacy envelope as the session store, and no
 * wider: a canonical worktree root and the display name derived from it, never
 * branches, diffs, remotes, credentials, or Git errors.
 *
 * Nothing here validates that a path still exists. A stale entry is a real
 * possibility (a moved or deleted folder, an unmounted drive) and is reported
 * by the open attempt itself, through the same failure path as any other open,
 * rather than by this module quietly dropping rows the user still recognizes.
 */

export type RecentProject = {
  /** `RepositoryInfo.path` — the Rust-resolved canonical worktree root, the
   * same identity `ProjectSession.id` uses, so a project opened through a
   * nested folder, an alias or a case variant matches its own recent entry. */
  path: string;
  name: string;
};

export type StoredRecentProjectsV1 = {
  version: 1;
  entries: RecentProject[];
};

const RECENT_PROJECTS_STORAGE_KEY = "gitodrile-recent-projects";

/** Enough to cover the projects someone actually rotates between, short
 * enough that the welcome screen stays a launcher rather than a file manager.
 * The screen shows fewer than this; the store keeps the rest so closing one
 * project doesn't erase the tail of the list. */
export const RECENT_PROJECTS_LIMIT = 12;

function isStoredRecentProjectsV1(value: unknown): value is StoredRecentProjectsV1 {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.entries) &&
    candidate.entries.every(
      (entry) =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as RecentProject).path === "string" &&
        typeof (entry as RecentProject).name === "string",
    )
  );
}

/** Corrupt or foreign JSON is treated as an empty list rather than throwing:
 * this is read during the first render of the welcome screen. */
export function readRecentProjects(): RecentProject[] {
  const raw = localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStoredRecentProjectsV1(parsed)) {
      return parsed.entries.slice(0, RECENT_PROJECTS_LIMIT);
    }
  } catch {
    // Fall through as if nothing were stored.
  }
  return [];
}

function write(entries: RecentProject[]): RecentProject[] {
  const capped = entries.slice(0, RECENT_PROJECTS_LIMIT);
  const stored: StoredRecentProjectsV1 = { version: 1, entries: capped };
  localStorage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(stored));
  return capped;
}

/** Records an opened project at the front of the list, replacing any earlier
 * entry for the same path — reopening a project promotes it instead of
 * duplicating it, and a renamed folder's new name wins. */
export function rememberRecentProject(entry: RecentProject): RecentProject[] {
  const rest = readRecentProjects().filter((candidate) => candidate.path !== entry.path);
  return write([{ path: entry.path, name: entry.name }, ...rest]);
}

/** Drops one entry for good. The user's own answer to a row that has moved,
 * belongs to someone else's session, or simply should not be on screen. */
export function forgetRecentProject(path: string): RecentProject[] {
  return write(readRecentProjects().filter((entry) => entry.path !== path));
}
