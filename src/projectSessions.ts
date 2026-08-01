import type { PendingVersionsResult } from "./publish";
import type { RepositoryInfo, WorkingTreeStatus } from "./repositoryOverview";
import type { VersionLinesSnapshot } from "./versionLines";

/** Per-project view: `settings` lives outside any session (see main.tsx), so
 * a session only ever remembers which of these two it was last showing. */
export type ProjectView = "overview" | "changes" | "version-lines";

export type ProjectMutationKind = "save" | "publish" | "version-line";
export type ProjectMutationPhase =
  | "planning"
  | "executing"
  | "verifying"
  | "uncertain"
  | "error"
  | "success";

export type ProjectMutation = {
  kind: ProjectMutationKind;
  phase: ProjectMutationPhase;
};

export type ChangesSelectionState = {
  selectedPath: string | null;
  excludedPaths: string[];
};

export const EMPTY_CHANGES_SELECTION: ChangesSelectionState = { selectedPath: null, excludedPaths: [] };

export const EMPTY_PENDING_VERSIONS: PendingVersionsResult = {
  totalCount: 0,
  versions: [],
  isTruncated: false,
};

/** Structural equality for repository-derived branch inventories. Rust
 * serializes a fresh object for every read, even when no ref changed. Keeping
 * the previous object in that case lets React bail out instead of reconciling
 * every version-line row after a background watcher refresh. */
export function versionLinesSnapshotsEqual(
  left: VersionLinesSnapshot | null,
  right: VersionLinesSnapshot | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if (
    left.branch !== right.branch ||
    left.headState !== right.headState ||
    left.currentCommit !== right.currentCommit ||
    left.totalCount !== right.totalCount ||
    left.isTruncated !== right.isTruncated ||
    left.unreadableCount !== right.unreadableCount ||
    left.lines.length !== right.lines.length
  ) {
    return false;
  }
  return left.lines.every((line, index) => {
    const other = right.lines[index];
    return (
      line.name === other.name &&
      line.tip.commit === other.tip.commit &&
      line.tip.shortCommit === other.tip.shortCommit &&
      line.tip.subject === other.tip.subject &&
      line.tip.committedAt === other.tip.committedAt &&
      line.isActive === other.isActive &&
      line.upstream === other.upstream &&
      line.isRetainedElsewhere === other.isRetainedElsewhere &&
      line.uniqueCommitCount === other.uniqueCommitCount &&
      line.worktreePath === other.worktreePath
    );
  });
}

/**
 * One open project. `id` is the Rust-resolved canonical worktree root
 * (`RepositoryInfo.path`) — already stable across nested-folder selections,
 * path aliases, symlinks, and filesystem case variants (see
 * `open_repository`'s tests), and distinct per linked worktree. Using it
 * directly as the identifier means there is no separate opaque id to keep in
 * sync with the descriptor Rust can revalidate on the next launch.
 */
export type ProjectSession = {
  id: string;
  project: RepositoryInfo;
  lastView: ProjectView;
  viewHistory: ProjectView[];
  viewHistoryIndex: number;
  changesSelection: ChangesSelectionState;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  /** Sequence number the caller stamps on the request that produced the
   * current `workingTree`/`pendingVersions`. `apply*` actions are rejected
   * unless their `generation` still matches, so a response from a
   * superseded request (a second refresh started before the first
   * returned) can never clobber a newer one. Ownership of the counter
   * itself lives with the caller (see `main.tsx`'s `statusGenerationsRef`),
   * not this reducer — that keeps "what's the next generation" a plain
   * synchronous read the caller can use before the async call even starts. */
  statusGeneration: number;
  pendingVersions: PendingVersionsResult;
  pendingVersionsError: string | null;
  /** Last known branch inventory, kept here rather than inside the Version
   * lines screen so leaving that screen and coming back renders the previous
   * answer immediately while a refresh runs behind it (see task 019).
   * `null` means "never loaded for this project", which is the only case
   * that warrants a full-screen loading state. */
  versionLines: VersionLinesSnapshot | null;
  versionLinesError: string | null;
  isLoadingVersionLines: boolean;
  operation: ProjectMutation | null;
};

export type ProjectSessionsState = {
  /** Display/switch order. Separate from `byId` so reordering doesn't need
   * to touch session contents. */
  order: string[];
  byId: Record<string, ProjectSession>;
  activeId: string | null;
};

export const initialProjectSessionsState: ProjectSessionsState = {
  order: [],
  byId: {},
  activeId: null,
};

export type ProjectSessionsAction =
  | { type: "open"; project: RepositoryInfo }
  | { type: "activate"; id: string }
  | { type: "close"; id: string }
  | { type: "reorder"; id: string; toIndex: number }
  | { type: "startStatusCheck"; id: string; generation: number }
  | {
      type: "applyWorkingTree";
      id: string;
      generation: number;
      workingTree: WorkingTreeStatus;
    }
  | { type: "applyWorkingTreeError"; id: string; generation: number; error: string }
  | { type: "applyPendingVersions"; id: string; generation: number; result: PendingVersionsResult }
  | { type: "applyPendingVersionsError"; id: string; generation: number; error: string }
  | { type: "startVersionLinesLoad"; id: string }
  | {
      type: "applyVersionLines";
      id: string;
      snapshot: VersionLinesSnapshot;
    }
  | { type: "applyVersionLinesError"; id: string; error: string }
  | { type: "navigate"; id: string; view: ProjectView }
  | { type: "goBack"; id: string }
  | { type: "goForward"; id: string }
  | { type: "startOperation"; id: string; kind: ProjectMutationKind }
  | { type: "setOperationPhase"; id: string; phase: ProjectMutationPhase }
  | { type: "finishOperation"; id: string }
  | { type: "setChangesSelection"; id: string; selection: ChangesSelectionState };

function freshSession(project: RepositoryInfo): ProjectSession {
  return {
    id: project.path,
    project,
    lastView: "overview",
    viewHistory: ["overview"],
    viewHistoryIndex: 0,
    changesSelection: EMPTY_CHANGES_SELECTION,
        workingTree: null,
        workingTreeError: null,
        isCheckingChanges: false,
    statusGeneration: 0,
    pendingVersions: EMPTY_PENDING_VERSIONS,
    pendingVersionsError: null,
    versionLines: null,
    versionLinesError: null,
    isLoadingVersionLines: false,
    operation: null,
  };
}

/**
 * Whether a filesystem-watch event for this session should be answered with a
 * working-tree refresh (task 020).
 *
 * A save or publish that is planning, executing, or verifying owns the
 * working tree for the duration: it writes files itself, and re-reading
 * underneath it would either show a half-finished state or move the ground
 * under a plan the user is confirming. `error` and `success` are settled
 * phases whose dialog is only still open because the user hasn't dismissed
 * it, so those refresh normally.
 */
export function shouldRefreshOnWatchEvent(session: ProjectSession | undefined): boolean {
  if (!session) {
    return false;
  }
  const phase = session.operation?.phase;
  return phase === undefined || phase === "error" || phase === "success";
}

export function getMutationBlocker(
  state: ProjectSessionsState,
  id: string,
): ProjectSession | null {
  const target = state.byId[id];
  if (!target) {
    return null;
  }
  return (
    state.order
      .filter((candidateId) => candidateId !== id)
      .map((candidateId) => state.byId[candidateId])
      .find(
        (candidate) =>
          candidate.operation !== null &&
          candidate.operation.phase !== "error" &&
          candidate.operation.phase !== "success" &&
          candidate.project.commonGitDir === target.project.commonGitDir,
      ) ?? null
  );
}

function updateSession(
  state: ProjectSessionsState,
  id: string,
  update: (session: ProjectSession) => ProjectSession,
): ProjectSessionsState {
  const session = state.byId[id];
  if (!session) {
    return state;
  }
  return { ...state, byId: { ...state.byId, [id]: update(session) } };
}

export function projectSessionsReducer(
  state: ProjectSessionsState,
  action: ProjectSessionsAction,
): ProjectSessionsState {
  switch (action.type) {
    case "open": {
      const id = action.project.path;
      const existing = state.byId[id];
      if (existing) {
        // Already open: activate it instead of duplicating, but refresh the
        // repository facts (branch, head state) since `open_repository` just
        // re-read them.
        return {
          ...state,
          byId: { ...state.byId, [id]: { ...existing, project: action.project } },
          activeId: id,
        };
      }
      return {
        order: [...state.order, id],
        byId: { ...state.byId, [id]: freshSession(action.project) },
        activeId: id,
      };
    }

    case "activate": {
      if (!state.byId[action.id]) {
        return state;
      }
      return { ...state, activeId: action.id };
    }

    case "close": {
      if (!state.byId[action.id]) {
        return state;
      }
      const index = state.order.indexOf(action.id);
      const order = state.order.filter((id) => id !== action.id);
      const byId = { ...state.byId };
      delete byId[action.id];
      let activeId = state.activeId;
      if (state.activeId === action.id) {
        // A predictable adjacent session: whichever project now sits at the
        // closed one's index (the next one), or the previous project if the
        // closed one was last, or no active project if none remain.
        activeId = order.length === 0 ? null : order[Math.min(index, order.length - 1)];
      }
      return { order, byId, activeId };
    }

    case "reorder": {
      if (!state.byId[action.id]) {
        return state;
      }
      const order = state.order.filter((id) => id !== action.id);
      const clampedIndex = Math.max(0, Math.min(action.toIndex, order.length));
      order.splice(clampedIndex, 0, action.id);
      return { ...state, order };
    }

    case "startStatusCheck":
      return updateSession(state, action.id, (session) => ({
        ...session,
        statusGeneration: action.generation,
        isCheckingChanges: true,
      }));

    case "applyWorkingTree": {
      const session = state.byId[action.id];
      if (!session || session.statusGeneration !== action.generation) {
        return state;
      }
      return updateSession(state, action.id, (current) => ({
        ...current,
        workingTree: action.workingTree,
        workingTreeError: null,
        isCheckingChanges: false,
      }));
    }

    case "applyWorkingTreeError": {
      const session = state.byId[action.id];
      if (!session || session.statusGeneration !== action.generation) {
        return state;
      }
      // Keeps the last known `workingTree` visible; only the error and the
      // busy flag change. The caller decides whether to surface the error
      // (see `statusRefreshFailedNote`'s usage in main.tsx) based on whether
      // a previous successful snapshot exists.
      return updateSession(state, action.id, (current) => ({
        ...current,
        workingTreeError: action.error,
        isCheckingChanges: false,
      }));
    }

    case "applyPendingVersions": {
      const session = state.byId[action.id];
      if (!session || session.statusGeneration !== action.generation) {
        return state;
      }
      return updateSession(state, action.id, (current) => ({
        ...current,
        pendingVersions: action.result,
        pendingVersionsError: null,
      }));
    }

    case "applyPendingVersionsError": {
      const session = state.byId[action.id];
      if (!session || session.statusGeneration !== action.generation) {
        return state;
      }
      return updateSession(state, action.id, (current) => ({
        ...current,
        pendingVersionsError: action.error,
      }));
    }

    case "startVersionLinesLoad":
      return updateSession(state, action.id, (session) =>
        session.isLoadingVersionLines
          ? session
          : {
              ...session,
              isLoadingVersionLines: true,
            },
      );

    case "applyVersionLines": {
      const session = state.byId[action.id];
      if (!session) {
        return state;
      }
      const isSameSnapshot = versionLinesSnapshotsEqual(session.versionLines, action.snapshot);
      if (isSameSnapshot && session.versionLinesError === null && !session.isLoadingVersionLines) {
        return state;
      }
      return updateSession(state, action.id, (current) => ({
        ...current,
        versionLines: isSameSnapshot ? current.versionLines : action.snapshot,
        versionLinesError: null,
        isLoadingVersionLines: false,
      }));
    }

    case "applyVersionLinesError": {
      const session = state.byId[action.id];
      if (!session) {
        return state;
      }
      if (session.versionLinesError === action.error && !session.isLoadingVersionLines) {
        return state;
      }
      // Mirrors `applyWorkingTreeError`: the last known snapshot stays
      // visible and only the error and the busy flag change, so a failed
      // background refresh degrades to "this may be stale" rather than
      // blanking a screen the user was already reading.
      return updateSession(state, action.id, (current) => ({
        ...current,
        versionLinesError: action.error,
        isLoadingVersionLines: false,
      }));
    }

    case "navigate":
      return updateSession(state, action.id, (session) => {
        if (session.lastView === action.view) {
          return session;
        }
        const viewHistory = [
          ...session.viewHistory.slice(0, session.viewHistoryIndex + 1),
          action.view,
        ];
        return {
          ...session,
          lastView: action.view,
          viewHistory,
          viewHistoryIndex: viewHistory.length - 1,
        };
      });

    case "goBack":
      return updateSession(state, action.id, (session) => {
        const viewHistoryIndex = Math.max(0, session.viewHistoryIndex - 1);
        return {
          ...session,
          viewHistoryIndex,
          lastView: session.viewHistory[viewHistoryIndex],
        };
      });

    case "goForward":
      return updateSession(state, action.id, (session) => {
        const viewHistoryIndex = Math.min(
          session.viewHistory.length - 1,
          session.viewHistoryIndex + 1,
        );
        return {
          ...session,
          viewHistoryIndex,
          lastView: session.viewHistory[viewHistoryIndex],
        };
      });

    case "startOperation": {
      if (getMutationBlocker(state, action.id)) {
        return state;
      }
      return updateSession(state, action.id, (session) => ({
        ...session,
        operation: { kind: action.kind, phase: "planning" },
      }));
    }

    case "setOperationPhase":
      return updateSession(state, action.id, (session) =>
        session.operation
          ? { ...session, operation: { ...session.operation, phase: action.phase } }
          : session,
      );

    case "finishOperation":
      return updateSession(state, action.id, (session) => ({
        ...session,
        operation: null,
      }));

    case "setChangesSelection":
      return updateSession(state, action.id, (session) => ({ ...session, changesSelection: action.selection }));
  }
}

// ---- Persistence ----
// Only canonical paths, order, and the active id ever reach storage — no
// diffs, source contents, credentials, tokens, or raw Git errors.

export type StoredProjectsV1 = {
  version: 1;
  order: string[];
  activeId: string | null;
};

const PROJECTS_STORAGE_KEY = "gitodrile-projects";
const LEGACY_LAST_PROJECT_PATH_KEY = "gitodrile-last-project-path";

function isStoredProjectsV1(value: unknown): value is StoredProjectsV1 {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.order) &&
    candidate.order.every((entry) => typeof entry === "string") &&
    (candidate.activeId === null || typeof candidate.activeId === "string")
  );
}

export function writeStoredProjects(stored: StoredProjectsV1): void {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(stored));
}

/** Reads the persisted project list, migrating the old single-path key
 * (`gitodrile-last-project-path`) exactly once if the new key hasn't been
 * written yet. Corrupt JSON under the new key is treated the same as it
 * being absent, rather than throwing and blocking startup. */
export function readStoredProjects(): StoredProjectsV1 {
  const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isStoredProjectsV1(parsed)) {
        return parsed;
      }
    } catch {
      // Corrupt JSON: fall through as if nothing were stored.
    }
    return { version: 1, order: [], activeId: null };
  }

  const legacyPath = localStorage.getItem(LEGACY_LAST_PROJECT_PATH_KEY);
  if (legacyPath) {
    localStorage.removeItem(LEGACY_LAST_PROJECT_PATH_KEY);
    const migrated: StoredProjectsV1 = { version: 1, order: [legacyPath], activeId: legacyPath };
    writeStoredProjects(migrated);
    return migrated;
  }

  return { version: 1, order: [], activeId: null };
}

export function projectSessionsStateToStored(state: ProjectSessionsState): StoredProjectsV1 {
  return { version: 1, order: state.order, activeId: state.activeId };
}
