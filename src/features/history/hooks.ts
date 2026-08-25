import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useScreenLifecycleController } from "../../runtime/screen/module";
import type { HistoryController } from "./controller";
import type { HistoryState } from "./domain";
import type { HistoryQuery } from "./port";

export function useHistoryState(controller: HistoryController, query: HistoryQuery): HistoryState {
  const subscribe = useCallback((listener: () => void) => controller.subscribe(query, listener), [controller, query]);
  const getSnapshot = useCallback(() => controller.getSnapshot(query), [controller, query]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useActiveHistoryState(controller: HistoryController, query: HistoryQuery): HistoryState {
  const lifecycle = useScreenLifecycleController();
  const bridge = useMemo(() => {
    let selected = controller.getSnapshot(query);
    let unsubscribeStore: (() => void) | null = null;
    const listeners = new Set<() => void>();
    const update = (): void => {
      const next = controller.getSnapshot(query);
      if (Object.is(selected, next)) return;
      selected = next;
      for (const listener of [...listeners]) listener();
    };
    const synchronize = (): void => {
      if (lifecycle.getSnapshot() === "active") {
        update();
        unsubscribeStore ??= controller.subscribe(query, update);
      } else {
        unsubscribeStore?.();
        unsubscribeStore = null;
      }
    };
    return {
      getSnapshot: () => selected,
      subscribe(listener: () => void) {
        listeners.add(listener);
        const unsubscribeLifecycle = lifecycle.subscribe(synchronize);
        synchronize();
        return () => {
          listeners.delete(listener);
          unsubscribeLifecycle();
          if (listeners.size === 0) {
            unsubscribeStore?.();
            unsubscribeStore = null;
          }
        };
      },
    };
  }, [controller, lifecycle, query]);
  const subscribe = useCallback((listener: () => void) => bridge.subscribe(listener), [bridge]);
  return useSyncExternalStore(subscribe, bridge.getSnapshot, bridge.getSnapshot);
}
