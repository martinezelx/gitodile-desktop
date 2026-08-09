import { StrictMode, startTransition } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createProjectRuntime, useProjectSelector } from "./projectRuntime";
import { initialProjectSessionsState, projectSessionsReducer } from "./projectSessions";
import type { RepositoryInfo } from "./repositoryOverview";

function makeProject(path: string): RepositoryInfo {
  return {
    name: path,
    path,
    selectedPath: path,
    gitDir: `${path}/.git`,
    commonGitDir: `${path}/.git`,
    branch: "main",
    headState: "branch",
    kind: "repository",
    sessionEpoch: `epoch:${path}`,
  };
}

describe("ProjectRuntime", () => {
  it("notifies only selectors whose atomic value changed", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "open", project: makeProject("/b") });
    const runtime = createProjectRuntime(state);
    let renders = 0;
    const selectFirstProjectEpoch = (snapshot: typeof state): string => snapshot.byId["/a"].epoch;

    function Subscriber(): React.JSX.Element {
      renders += 1;
      return <p>{useProjectSelector(runtime, selectFirstProjectEpoch)}</p>;
    }

    render(<Subscriber />);
    expect(renders).toBe(1);

    act(() => runtime.dispatch({ type: "startStatusCheck", id: "/b", generation: 1, epoch: "epoch:/b" }));
    expect(renders).toBe(1);
    expect(screen.getByText("epoch:/a")).toBeInTheDocument();
  });

  it("does not tear when StrictMode observes concurrent transitions", () => {
    const runtime = createProjectRuntime();
    const observed: string[] = [];
    const selectIdentity = (snapshot: ReturnType<typeof runtime.getSnapshot>): string => {
      const id = snapshot.activeId;
      const epoch = id ? snapshot.byId[id]?.epoch : null;
      return `${id ?? "none"}|${epoch ?? "none"}`;
    };

    function Subscriber(): React.JSX.Element {
      const identity = useProjectSelector(runtime, selectIdentity);
      observed.push(identity);
      return <p>{identity}</p>;
    }

    render(
      <StrictMode>
        <Subscriber />
      </StrictMode>,
    );
    act(() => {
      startTransition(() => {
        runtime.dispatch({ type: "open", project: makeProject("/a") });
        runtime.dispatch({ type: "open", project: makeProject("/b") });
      });
    });

    expect(screen.getByText("/b|epoch:/b")).toBeInTheDocument();
    expect(observed).not.toContain("/a|epoch:/b");
    expect(observed).not.toContain("/b|epoch:/a");
  });

  it("deduplicates and cancels idle cache warming owned by activation or invalidation", async () => {
    const queued: Array<() => void> = [];
    const runtime = createProjectRuntime(initialProjectSessionsState, (task) => {
      queued.push(task);
      return () => {
        const index = queued.indexOf(task);
        if (index >= 0) queued.splice(index, 1);
      };
    });
    const warm = vi.fn();
    runtime.scheduleCacheWarm({ key: "status", reason: "project-activation", run: warm });
    runtime.scheduleCacheWarm({ key: "status", reason: "repository-invalidation", run: warm });
    expect(queued).toHaveLength(1);

    queued.shift()?.();
    await Promise.resolve();
    expect(warm).toHaveBeenCalledTimes(1);

    const cancel = runtime.scheduleCacheWarm({ key: "diffs", reason: "repository-invalidation", run: warm });
    cancel();
    expect(queued).toHaveLength(0);

    // @ts-expect-error Screen visibility is intentionally not a cache-warm owner.
    runtime.scheduleCacheWarm({ key: "forbidden", reason: "visibility", run: warm });
  });
});
