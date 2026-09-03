import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REMOTE_CHECK_INTERVAL_STORAGE_KEY,
  REDUCE_MOTION_STORAGE_KEY,
  REOPEN_LAST_PROJECT_DEFAULT,
  REOPEN_LAST_PROJECT_STORAGE_KEY,
  RUN_GIT_HOOKS_DEFAULT,
  RUN_GIT_HOOKS_STORAGE_KEY,
  repairEagerlyStoredDefaults,
  useReducedMotionPreference,
  useStoredBoolean,
  useStoredRemoteCheckInterval,
} from "./preferences";
import { startThemeFade } from "./themeTransition";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.reducedMotion;
  delete document.documentElement.dataset.themeTransition;
  Reflect.deleteProperty(document, "startViewTransition");
  Reflect.deleteProperty(window, "matchMedia");
});

describe("reduced motion preference", () => {
  it("keeps full motion by default without freezing that default in storage", () => {
    const { result } = renderHook(() => useReducedMotionPreference(), strict);

    expect(result.current[0]).toBe(false);
    expect(document.documentElement.dataset.reducedMotion).toBeUndefined();
    expect(localStorage.getItem(REDUCE_MOTION_STORAGE_KEY)).toBeNull();
  });

  it("applies and persists an explicit request to reduce motion", () => {
    const { result } = renderHook(() => useReducedMotionPreference(), strict);

    act(() => result.current[1](true));

    expect(document.documentElement.dataset.reducedMotion).toBe("true");
    expect(localStorage.getItem(REDUCE_MOTION_STORAGE_KEY)).toBe("true");
  });

  it("stops a theme transition that was already in flight", () => {
    const skipTransition = vi.fn();
    const unfinished = new Promise<void>(() => undefined);
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (callback: () => void) => {
        callback();
        return {
          finished: unfinished,
          ready: unfinished,
          updateCallbackDone: unfinished,
          skipTransition,
        };
      },
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false }),
    });
    startThemeFade(vi.fn());
    const { result } = renderHook(() => useReducedMotionPreference(), strict);

    act(() => result.current[1](true));

    expect(skipTransition).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.themeTransition).toBeUndefined();
  });
});

describe("useStoredRemoteCheckInterval", () => {
  it("defaults invalid or missing values to manual checks", () => {
    for (const stored of ["", "nonsense", "0.5", "-15", "1441"]) {
      localStorage.setItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY, stored);
      const { result, unmount } = renderHook(() => useStoredRemoteCheckInterval());
      expect(result.current[0], stored).toBe(0);
      unmount();
    }
  });

  it("reads and persists a supported cadence", () => {
    localStorage.setItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY, "15");
    const { result } = renderHook(() => useStoredRemoteCheckInterval());
    expect(result.current[0]).toBe(15);

    act(() => result.current[1](30));
    expect(localStorage.getItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY)).toBe("30");
  });

  /* The presets used to be the whole of what could be stored. A value between
     them, or beyond the longest one, is now just as valid — only the bounds
     rule it out. */
  it("keeps a custom cadence that is not one of the presets", () => {
    localStorage.setItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY, "5");
    const { result } = renderHook(() => useStoredRemoteCheckInterval());
    expect(result.current[0]).toBe(5);

    act(() => result.current[1](300));
    expect(localStorage.getItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY)).toBe("300");
  });
});

describe("Git hooks preference", () => {
  /* Asserted here rather than in the Settings panel, which cannot import the
     app's preferences across the feature boundary and so states its own
     default. This is the one that ships. */
  it("runs a project's hooks when the user has not chosen otherwise", () => {
    const { result } = renderHook(() =>
      useStoredBoolean(RUN_GIT_HOOKS_STORAGE_KEY, RUN_GIT_HOOKS_DEFAULT),
    );
    expect(result.current[0]).toBe(true);
  });

  it("keeps an explicit choice to skip them", () => {
    localStorage.setItem(RUN_GIT_HOOKS_STORAGE_KEY, "false");
    const { result } = renderHook(() =>
      useStoredBoolean(RUN_GIT_HOOKS_STORAGE_KEY, RUN_GIT_HOOKS_DEFAULT),
    );
    expect(result.current[0]).toBe(false);
  });
});

/* Every persistence test runs under `StrictMode`. The first version of this
   guard skipped the first effect run, which passes a plain `renderHook` and
   fails in the real app: StrictMode remounts the same instance, the flag is
   already spent, and the default gets written after all. */
const strict = { wrapper: StrictMode } as const;

describe("preferences persist a choice, not a default", () => {
  /* The bug this guards against: the hooks default flipped to `true` and every
     machine kept reporting `false`, because the old default had been written to
     storage on first render and outranked the code from then on. */
  it("writes nothing until the value actually moves", () => {
    const { result, unmount } = renderHook(
      () => useStoredBoolean("gitodile-probe", true),
      strict,
    );

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem("gitodile-probe")).toBeNull();

    unmount();
    // Still nothing after a full mount/unmount cycle, so a default stays live
    // and follows the code across restarts.
    expect(localStorage.getItem("gitodile-probe")).toBeNull();
  });

  it("writes the value once the user changes it", () => {
    const { result } = renderHook(
      () => useStoredBoolean("gitodile-probe", true),
      strict,
    );

    act(() => result.current[1](false));
    expect(localStorage.getItem("gitodile-probe")).toBe("false");

    // Back to the default is still a choice once something is stored, or the
    // entry would keep saying "false" while the app shows true.
    act(() => result.current[1](true));
    expect(localStorage.getItem("gitodile-probe")).toBe("true");
  });

  it("leaves a cadence default unstored too", () => {
    const { result } = renderHook(() => useStoredRemoteCheckInterval(), strict);

    expect(result.current[0]).toBe(0);
    expect(localStorage.getItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY)).toBeNull();
  });

  it("keeps following the code when a default changes under an untouched preference", () => {
    // The whole point, stated directly: nothing stored, so the next version's
    // default is the one that applies.
    const first = renderHook(() => useStoredBoolean("gitodile-probe", false), strict);
    expect(first.result.current[0]).toBe(false);
    first.unmount();

    const second = renderHook(() => useStoredBoolean("gitodile-probe", true), strict);
    expect(second.result.current[0]).toBe(true);
  });
});

describe("repairEagerlyStoredDefaults", () => {
  it("clears a hooks value written before the default changed, once", () => {
    localStorage.setItem(RUN_GIT_HOOKS_STORAGE_KEY, "false");

    repairEagerlyStoredDefaults();
    expect(localStorage.getItem(RUN_GIT_HOOKS_STORAGE_KEY)).toBeNull();
    expect(
      renderHook(
        () => useStoredBoolean(RUN_GIT_HOOKS_STORAGE_KEY, RUN_GIT_HOOKS_DEFAULT),
        strict,
      ).result.current[0],
    ).toBe(true);

    // A later, deliberate "off" must survive: the repair runs exactly once.
    localStorage.setItem(RUN_GIT_HOOKS_STORAGE_KEY, "false");
    repairEagerlyStoredDefaults();
    expect(localStorage.getItem(RUN_GIT_HOOKS_STORAGE_KEY)).toBe("false");
  });

  it("clears entries that merely repeat their own default", () => {
    localStorage.setItem(REOPEN_LAST_PROJECT_STORAGE_KEY, String(REOPEN_LAST_PROJECT_DEFAULT));
    localStorage.setItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY, "0");

    repairEagerlyStoredDefaults();

    // They carried no information, so removing them changes nothing today and
    // lets a future default reach this machine.
    expect(localStorage.getItem(REOPEN_LAST_PROJECT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY)).toBeNull();
  });

  it("keeps anything that differs from its default", () => {
    localStorage.setItem(REOPEN_LAST_PROJECT_STORAGE_KEY, String(!REOPEN_LAST_PROJECT_DEFAULT));
    localStorage.setItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY, "300");

    repairEagerlyStoredDefaults();

    expect(localStorage.getItem(REOPEN_LAST_PROJECT_STORAGE_KEY)).toBe(
      String(!REOPEN_LAST_PROJECT_DEFAULT),
    );
    expect(localStorage.getItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY)).toBe("300");
  });
});
