import { Suspense } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LayoutDashboard } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProjectRuntime } from "./projectRuntime";
import type { RepositoryInfo } from "./repositoryOverview";
import { KeepAliveScreens } from "./screens";
import {
  createLazyScreenContainer,
  defineScreenModules,
  type ScreenModule,
} from "./screenModule";
import { RuntimeTestScreen } from "./testScreenModule";

function makeProject(path: string, epoch = `epoch:${path}`): RepositoryInfo {
  return {
    name: path,
    path,
    selectedPath: path,
    gitDir: `${path}/.git`,
    commonGitDir: `${path}/.git`,
    branch: "main",
    headState: "branch",
    kind: "repository",
    sessionEpoch: epoch,
  };
}

const completeModule = {
  kind: "screen",
  id: "test",
  section: "project",
  labelKey: "navOverview",
  disabledLabelKey: null,
  commandLabelKey: "commandGoOverview",
  icon: <LayoutDashboard />,
  requiresProject: false,
  inCompactNav: true,
  container: { kind: "host-owned" },
  additionalPreloads: [],
  lifecycle: { hidden: "retain-suspended", evict: "project-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
} as const satisfies ScreenModule;

// @ts-expect-error Functional modules cannot omit lifecycle/accessibility/container policy.
const incompleteModule = { kind: "screen", id: "incomplete" } satisfies ScreenModule;
void incompleteModule;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ScreenModule runtime", () => {
  it("rejects duplicate functional descriptors with the owning id", () => {
    expect(() => defineScreenModules([completeModule, completeModule])).toThrow(
      'Duplicate screen module id "test"',
    );
  });

  it("uses one loader for lazy mount and primary preload", async () => {
    function LazyProbe({ label }: { label: string }): React.JSX.Element {
      return <section aria-label={label} />;
    }
    const loader = vi.fn(async () => ({ LazyProbe }));
    const container = createLazyScreenContainer<
      { LazyProbe: typeof LazyProbe },
      React.ComponentProps<typeof LazyProbe>
    >(loader, (module) => module.LazyProbe);

    await container.preload();
    render(
      <Suspense fallback={<p>Loading</p>}>
        <container.Component label="Runtime test screen" />
      </Suspense>,
    );

    expect(await screen.findByRole("region", { name: "Runtime test screen" })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("freezes hidden work, synchronizes on activation, and evicts with the project host", async () => {
    vi.useFakeTimers();
    const runtime = createProjectRuntime();
    runtime.dispatch({ type: "open", project: makeProject("/a") });
    runtime.dispatch({ type: "open", project: makeProject("/b") });
    const onRender = vi.fn();
    const onPoll = vi.fn();
    const testScreen = <RuntimeTestScreen runtime={runtime} onRender={onRender} onPoll={onPoll} />;

    const { rerender } = render(
      <KeepAliveScreens key="epoch:/a" active="overview" screens={{ overview: testScreen, changes: <p>Other</p> }} />,
    );
    const originalNode = screen.getByRole("region", { name: "Runtime test screen" });
    const activeRenders = onRender.mock.calls.length;
    act(() => runtime.dispatch({ type: "startStatusCheck", id: "/a", generation: 1, epoch: "epoch:/a" }));
    expect(onRender).toHaveBeenCalledTimes(activeRenders);
    fireEvent.click(screen.getByRole("button", { name: "Local 0" }));
    expect(screen.getByRole("button", { name: "Local 1" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(50));
    expect(onPoll).toHaveBeenCalled();

    rerender(
      <KeepAliveScreens key="epoch:/a" active="changes" screens={{ overview: testScreen, changes: <p>Other</p> }} />,
    );
    const hiddenSlot = originalNode.closest(".screen-slot");
    expect(hiddenSlot).toHaveAttribute("hidden");
    expect(hiddenSlot).toHaveAttribute("inert");
    const hiddenRenders = onRender.mock.calls.length;
    const hiddenPolls = onPoll.mock.calls.length;

    act(() => {
      runtime.dispatch({ type: "open", project: makeProject("/c") });
      vi.advanceTimersByTime(100);
    });
    expect(onRender).toHaveBeenCalledTimes(hiddenRenders);
    expect(onPoll).toHaveBeenCalledTimes(hiddenPolls);

    rerender(
      <KeepAliveScreens key="epoch:/a" active="overview" screens={{ overview: testScreen, changes: <p>Other</p> }} />,
    );
    expect(screen.getByText("Project /c")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Runtime test screen" })).toBe(originalNode);
    expect(screen.getByRole("button", { name: "Local 1" })).toBeInTheDocument();

    rerender(
      <KeepAliveScreens key="epoch:/b" active="overview" screens={{ overview: testScreen, changes: <p>Other</p> }} />,
    );
    expect(screen.getByRole("region", { name: "Runtime test screen" })).not.toBe(originalNode);
    expect(screen.getByRole("button", { name: "Local 0" })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
