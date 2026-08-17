import { describe, expect, it } from "vitest";

import { planWatcherChanges } from "./watcherPlan";

const sessions = [
  { path: "C:\\projects\\one", epoch: "epoch-one" },
  { path: "C:\\projects\\two", epoch: "epoch-two" },
];

describe("watcher registration plan", () => {
  it("registers every open session while watching is on", () => {
    expect(planWatcherChanges({}, sessions, true)).toEqual({
      unwatch: [],
      watch: [
        { path: "C:\\projects\\one", epoch: "epoch-one" },
        { path: "C:\\projects\\two", epoch: "epoch-two" },
      ],
    });
  });

  it("registers nothing at all while watching is off", () => {
    // The point of the preference: a project can be open, restored and active
    // without a filesystem watcher existing for it anywhere.
    expect(planWatcherChanges({}, sessions, false)).toEqual({ unwatch: [], watch: [] });
  });

  it("tears down what is already registered when watching is turned off", () => {
    expect(
      planWatcherChanges(
        { "C:\\projects\\one": "epoch-one", "C:\\projects\\two": "epoch-two" },
        sessions,
        false,
      ),
    ).toEqual({
      unwatch: [
        { path: "C:\\projects\\one", epoch: "epoch-one" },
        { path: "C:\\projects\\two", epoch: "epoch-two" },
      ],
      watch: [],
    });
  });

  it("re-registers every open session when watching is turned back on", () => {
    expect(planWatcherChanges({}, sessions, true).watch).toHaveLength(2);
  });

  it("leaves an unchanged registration alone", () => {
    expect(
      planWatcherChanges({ "C:\\projects\\one": "epoch-one" }, [sessions[0]], true),
    ).toEqual({ unwatch: [], watch: [] });
  });

  it("replaces a registration whose session was reopened as a new incarnation", () => {
    expect(
      planWatcherChanges({ "C:\\projects\\one": "old-epoch" }, [sessions[0]], true),
    ).toEqual({
      unwatch: [{ path: "C:\\projects\\one", epoch: "old-epoch" }],
      watch: [{ path: "C:\\projects\\one", epoch: "epoch-one" }],
    });
  });

  it("drops a closed session and skips one that has no epoch yet", () => {
    expect(
      planWatcherChanges({ "C:\\projects\\two": "epoch-two" }, [{ path: "C:\\projects\\one", epoch: undefined }], true),
    ).toEqual({ unwatch: [{ path: "C:\\projects\\two", epoch: "epoch-two" }], watch: [] });
  });
});
