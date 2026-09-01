import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useNotificationCenter } from "./useNotificationCenter";

afterEach(cleanup);

const teamChanges = {
  details: { kind: "teamChangesAvailable", behind: 2, remoteCommit: "abc" },
  projectId: "/projects/alpha",
  projectName: "alpha",
} as const;

describe("the notification store", () => {
  it("records nothing while notifications are turned off", () => {
    const { result } = renderHook(() => useNotificationCenter(false));

    act(() => result.current.notify(teamChanges));

    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it("stops recording the moment the preference goes off, without losing the list", () => {
    const { result, rerender } = renderHook(({ enabled }) => useNotificationCenter(enabled), {
      initialProps: { enabled: true },
    });

    act(() => result.current.notify(teamChanges));
    expect(result.current.notifications).toHaveLength(1);

    rerender({ enabled: false });
    act(() =>
      result.current.notify({
        ...teamChanges,
        projectId: "/projects/beta",
        projectName: "beta",
      }),
    );

    // What was already recorded stays readable; only new entries stop arriving.
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]?.projectName).toBe("alpha");
  });

  it("counts unread entries and clears them on read", () => {
    const { result } = renderHook(() => useNotificationCenter(true));

    act(() => result.current.notify(teamChanges));
    expect(result.current.unreadCount).toBe(1);

    act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications).toHaveLength(1);
  });

  it("gives every entry its own id, even for the same event twice", () => {
    const { result } = renderHook(() => useNotificationCenter(true));

    act(() => {
      result.current.notify({
        details: { kind: "changesPublished", versionCount: 1, destination: null },
        projectId: "/projects/alpha",
        projectName: "alpha",
      });
      result.current.notify({
        details: { kind: "changesPublished", versionCount: 1, destination: null },
        projectId: "/projects/alpha",
        projectName: "alpha",
      });
    });

    const [first, second] = result.current.notifications;
    expect(result.current.notifications).toHaveLength(2);
    expect(first?.id).not.toBe(second?.id);
  });

  it("empties the list on clear", () => {
    const { result } = renderHook(() => useNotificationCenter(true));

    act(() => result.current.notify(teamChanges));
    act(() => result.current.clear());

    expect(result.current.notifications).toHaveLength(0);
  });
});
