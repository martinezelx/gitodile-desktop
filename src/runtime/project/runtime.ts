import { useCallback, useRef, useSyncExternalStore } from "react";

import {
  initialProjectSessionsState,
  projectSessionsReducer,
  type ProjectSessionsAction,
  type ProjectSessionsState,
} from "./sessions";

export type ProjectRuntimeSnapshot = ProjectSessionsState;
export type ProjectRuntimeSelector<T> = (snapshot: ProjectRuntimeSnapshot) => T;
export type ProjectCacheWarmReason = "project-activation" | "repository-invalidation";

type Listener = () => void;
type IdleScheduler = (task: () => void) => () => void;

export type ProjectRuntime = {
  readonly dispatch: (action: ProjectSessionsAction) => void;
  readonly getSnapshot: () => ProjectRuntimeSnapshot;
  readonly subscribe: (listener: Listener) => () => void;
  readonly scheduleCacheWarm: (request: {
    key: string;
    reason: ProjectCacheWarmReason;
    run: () => void | Promise<void>;
  }) => () => void;
  readonly dispose: () => void;
};

/**
 * Defers speculative work until after the first paint and current user work.
 * The scheduler is exported for app-level chunk warming, while repository
 * cache warming is exposed only through ProjectRuntime's activation/
 * invalidation-owned API below.
 */
export function scheduleIdleTask(task: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(task, { timeout: 2000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, 1000);
  return () => clearTimeout(handle);
}

export function createProjectRuntime(
  initialState: ProjectRuntimeSnapshot = initialProjectSessionsState,
  scheduleIdle: IdleScheduler = scheduleIdleTask,
): ProjectRuntime {
  let snapshot = initialState;
  let disposed = false;
  const listeners = new Set<Listener>();
  const scheduledWarmers = new Map<string, () => void>();

  const runtime: ProjectRuntime = {
    dispatch(action) {
      if (disposed) {
        return;
      }
      const next = projectSessionsReducer(snapshot, action);
      if (Object.is(next, snapshot)) {
        return;
      }
      snapshot = next;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      if (disposed) {
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    scheduleCacheWarm({ key, run }) {
      if (disposed || scheduledWarmers.has(key)) {
        return () => {};
      }
      let cancelled = false;
      const cancelIdle = scheduleIdle(() => {
        scheduledWarmers.delete(key);
        if (!cancelled && !disposed) {
          void run();
        }
      });
      const cancel = (): void => {
        if (cancelled) {
          return;
        }
        cancelled = true;
        cancelIdle();
        scheduledWarmers.delete(key);
      };
      scheduledWarmers.set(key, cancel);
      return cancel;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const cancel of [...scheduledWarmers.values()]) {
        cancel();
      }
      scheduledWarmers.clear();
      listeners.clear();
    },
  };

  return runtime;
}

/**
 * Selector subscription with stable selected identity. React reads the same
 * immutable snapshot for the whole render, while equality prevents an
 * unrelated project or feature transition from reconciling the subscriber.
 * The runtime is passed explicitly: there is no ambient "current project"
 * that a screen can accidentally read after a project switch.
 */
export function useProjectSelector<T>(
  runtime: ProjectRuntime,
  selector: ProjectRuntimeSelector<T>,
  isEqual: (left: T, right: T) => boolean = Object.is,
): T {
  const selectorRef = useRef(selector);
  const equalityRef = useRef(isEqual);
  const cacheRef = useRef<{ source: ProjectRuntimeSnapshot; value: T } | null>(null);
  selectorRef.current = selector;
  equalityRef.current = isEqual;

  const getSelectedSnapshot = useCallback((): T => {
    const source = runtime.getSnapshot();
    const cached = cacheRef.current;
    if (cached?.source === source) {
      return cached.value;
    }
    const selected = selectorRef.current(source);
    if (cached && equalityRef.current(cached.value, selected)) {
      cacheRef.current = { source, value: cached.value };
      return cached.value;
    }
    cacheRef.current = { source, value: selected };
    return selected;
  }, [runtime]);

  return useSyncExternalStore(runtime.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}
