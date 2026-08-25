import React, {
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import type { Translations } from "../../i18n";
import type { ProjectRuntime, ProjectRuntimeSelector } from "../project/runtime";

export type TextKey = {
  [K in keyof Translations]: Translations[K] extends string ? K : never;
}[keyof Translations];

export type ScreenLifecycleState = "active" | "hidden" | "evicted";
export type ScreenSection = "project" | "application";
export type ScreenEvictionPolicy = "project-session" | "application-session";

export type ScreenPerformanceBudget = {
  warmSwitchWarningMs: number;
  warmSwitchFailureMs: number;
  maxVisibleDescendants?: number;
};

export type ScreenContainer<Props extends object = Record<string, never>> = {
  readonly Component: React.LazyExoticComponent<React.ComponentType<Props>>;
  /** Primary preload and lazy mounting close over the exact same loader. */
  readonly preload: () => Promise<React.ComponentType<Props>>;
};

export type EagerScreenContainer<Props extends object = Record<string, never>> = {
  readonly Component: React.ComponentType<Props>;
  readonly preload: () => Promise<React.ComponentType<Props>>;
};

type RegisteredScreenContainer = {
  readonly Component: object;
  readonly preload: () => Promise<unknown>;
};

export type FunctionalScreenModule<Id extends string = string> = {
  readonly kind: "screen";
  readonly id: Id;
  readonly section: ScreenSection;
  readonly labelKey: TextKey;
  readonly disabledLabelKey: TextKey | null;
  readonly commandLabelKey: TextKey | null;
  readonly icon: React.JSX.Element;
  readonly requiresProject: boolean;
  readonly inCompactNav: boolean;
  readonly container: RegisteredScreenContainer;
  readonly additionalPreloads: readonly (() => Promise<unknown>)[];
  readonly lifecycle: {
    readonly hidden: "retain-suspended";
    readonly evict: ScreenEvictionPolicy;
  };
  readonly accessibility: {
    readonly inactive: "hidden-inert";
    readonly announcements: "active-only";
  };
  readonly performanceBudget?: ScreenPerformanceBudget;
};

export type PlaceholderScreenModule<Id extends string = string> = {
  readonly kind: "placeholder";
  readonly id: Id;
  readonly section: ScreenSection;
  readonly labelKey: TextKey;
  readonly disabledLabelKey: TextKey;
  readonly icon: React.JSX.Element;
  readonly requiresProject: boolean;
  readonly inCompactNav: boolean;
};

export type OverlayModule<Id extends string = string> = {
  readonly kind: "overlay";
  readonly id: Id;
  readonly section: "application";
  readonly labelKey: TextKey;
  readonly commandLabelKey: TextKey;
  readonly icon: React.JSX.Element;
  readonly inCompactNav: boolean;
  readonly overlay: "settings";
};

export type ScreenModule = FunctionalScreenModule | PlaceholderScreenModule | OverlayModule;

export function createLazyScreenContainer<Module, Props extends object>(
  loadModule: () => Promise<Module>,
  select: (module: Module) => React.ComponentType<Props>,
): ScreenContainer<Props> {
  let modulePromise: Promise<Module> | null = null;
  const load = (): Promise<Module> => {
    modulePromise ??= loadModule();
    return modulePromise;
  };
  const preload = (): Promise<React.ComponentType<Props>> => load().then(select);
  return {
    Component: lazy(() => preload().then((Component) => ({ default: Component }))),
    preload,
  };
}

/** A screen whose code must already be in the entry chunk.
 *
 * Overview is the screen the app paints with no project open, so deferring it
 * would put a chunk fetch in front of first paint — the cost task 018 exists to
 * avoid. Registering it through a container anyway is what stops it from being
 * the one screen the shell composes by hand: nav, palette, keep-alive,
 * lifecycle and eviction all still derive from the descriptor.
 *
 * `preload` resolves immediately, so `prefetchScreenChunks` treats an eager
 * screen exactly like a lazy one and no caller needs to know the difference.
 */
export function createEagerScreenContainer<Props extends object>(
  Component: React.ComponentType<Props>,
): EagerScreenContainer<Props> {
  return { Component, preload: () => Promise.resolve(Component) };
}

export function defineScreenModules<const Modules extends readonly ScreenModule[]>(modules: Modules): Modules {
  const ids = new Set<string>();
  for (const module of modules) {
    if (ids.has(module.id)) {
      throw new Error(`Duplicate screen module id "${module.id}". The app registry requires one owning module per id.`);
    }
    ids.add(module.id);
  }
  return modules;
}

type LifecycleController = {
  getSnapshot: () => ScreenLifecycleState;
  subscribe: (listener: () => void) => () => void;
  transition: (next: Exclude<ScreenLifecycleState, "evicted">) => void;
  evict: () => void;
};

export function createScreenLifecycleController(initial: "active" | "hidden"): LifecycleController {
  let snapshot: ScreenLifecycleState = initial;
  const listeners = new Set<() => void>();
  const publish = (next: ScreenLifecycleState): void => {
    if (snapshot === next || snapshot === "evicted") {
      return;
    }
    snapshot = next;
    for (const listener of [...listeners]) {
      listener();
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (snapshot === "evicted") {
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    transition: publish,
    evict() {
      publish("evicted");
      listeners.clear();
    },
  };
}

const ScreenLifecycleContext = createContext<LifecycleController | null>(null);

export function ScreenLifecycleProvider({
  controller,
  children,
}: {
  controller: LifecycleController;
  children: React.ReactNode;
}): React.JSX.Element {
  return <ScreenLifecycleContext value={controller}>{children}</ScreenLifecycleContext>;
}

export function useScreenLifecycleController(): LifecycleController {
  const controller = useContext(ScreenLifecycleContext);
  if (!controller) {
    throw new Error("Screen lifecycle hooks must run inside the registered screen host.");
  }
  return controller;
}

export function useScreenLifecycle(): ScreenLifecycleState {
  const controller = useScreenLifecycleController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

export function useActiveScreenEffect(effect: React.EffectCallback, dependencies: React.DependencyList): void {
  const lifecycle = useScreenLifecycle();
  useEffect(() => {
    if (lifecycle !== "active") {
      return undefined;
    }
    return effect();
    // `effect` follows the same caller-owned dependency contract as useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycle, ...dependencies]);
}

/**
 * A screen selector unsubscribes from the project runtime while hidden. Its
 * last selected value stays frozen; activation reads the runtime's current
 * atomic snapshot before the screen resumes effects or announcements.
 */
export function useActiveProjectSelector<T>(
  runtime: ProjectRuntime,
  selector: ProjectRuntimeSelector<T>,
  isEqual: (left: T, right: T) => boolean = Object.is,
): T {
  const lifecycle = useScreenLifecycleController();
  const bridge = useMemo(() => {
    let selected = selector(runtime.getSnapshot());
    let unsubscribeRuntime: (() => void) | null = null;
    const listeners = new Set<() => void>();

    const update = (): void => {
      const next = selector(runtime.getSnapshot());
      if (isEqual(selected, next)) {
        return;
      }
      selected = next;
      for (const listener of [...listeners]) {
        listener();
      }
    };
    const synchronize = (): void => {
      if (lifecycle.getSnapshot() === "active") {
        update();
        unsubscribeRuntime ??= runtime.subscribe(update);
      } else {
        unsubscribeRuntime?.();
        unsubscribeRuntime = null;
      }
    };

    return {
      getSnapshot: () => selected,
      subscribe(listener: () => void) {
        listeners.add(listener);
        const unsubscribeLifecycle = lifecycle.subscribe(() => {
          synchronize();
        });
        synchronize();
        return () => {
          listeners.delete(listener);
          unsubscribeLifecycle();
          if (listeners.size === 0) {
            unsubscribeRuntime?.();
            unsubscribeRuntime = null;
          }
        };
      },
    };
  }, [isEqual, lifecycle, runtime, selector]);

  const subscribe = useCallback((listener: () => void) => bridge.subscribe(listener), [bridge]);
  return useSyncExternalStore(subscribe, bridge.getSnapshot, bridge.getSnapshot);
}
