import { Suspense } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LayoutDashboard } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProjectRuntime } from "../project/runtime";
import type { RepositoryInfo } from "../../features/repository";
import { KeepAliveScreens } from "../../app/screens";
import {
  KeepAliveViewSlot,
  createEagerScreenContainer,
  createLazyScreenContainer,
  createScreenLifecycleController,
  defineScreenModules,
  ScreenLifecycleProvider,
  type ScreenModule,
} from "./module";
import { RuntimeTestScreen } from "../../test-fixtures/runtimeTestScreen";

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
  container: createEagerScreenContainer(() => null),
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

  it("mounts an eager screen without a Suspense boundary and preloads to itself", async () => {
    // Overview is registered eagerly because it paints before any project is
    // open; a chunk fetch there would sit in front of first paint. It still has
    // to be a real container so the shell composes it like every other screen,
    // and `prefetchScreenChunks` must be able to call `preload` blindly.
    function EagerProbe({ label }: { label: string }): React.JSX.Element {
      return <section aria-label={label} />;
    }
    const container = createEagerScreenContainer(EagerProbe);

    render(<container.Component label="Eager test screen" />);

    expect(screen.getByRole("region", { name: "Eager test screen" })).toBeInTheDocument();
    await expect(container.preload()).resolves.toBe(EagerProbe);
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

  it("keeps a hidden view alive under a lifecycle derived from its screen's", () => {
    // The Work screen's two tabs are the same problem as two screens: the
    // one not showing must keep its DOM, stop polling and announcing, and
    // resume on return — and it must also go quiet when the *screen* around
    // it is hidden, even while it is the shown tab.
    vi.useFakeTimers();
    const runtime = createProjectRuntime();
    runtime.dispatch({ type: "open", project: makeProject("/a") });
    const onRender = vi.fn();
    const onPoll = vi.fn();
    const screenLifecycle = createScreenLifecycleController("active");
    const view = (active: "one" | "two") => (
      <ScreenLifecycleProvider controller={screenLifecycle}>
        <KeepAliveViewSlot className="view" isActive={active === "one"}>
          <RuntimeTestScreen runtime={runtime} onRender={onRender} onPoll={onPoll} />
        </KeepAliveViewSlot>
        <KeepAliveViewSlot className="view" isActive={active === "two"}>
          <p>Other</p>
        </KeepAliveViewSlot>
      </ScreenLifecycleProvider>
    );

    const { rerender } = render(view("one"));
    const node = screen.getByRole("region", { name: "Runtime test screen" });
    // The other view is not mounted until first shown.
    expect(screen.queryByText("Other")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Local 0" }));
    act(() => vi.advanceTimersByTime(50));
    expect(onPoll).toHaveBeenCalled();

    rerender(view("two"));
    const hiddenSlot = node.closest(".view");
    expect(hiddenSlot).toHaveAttribute("hidden");
    expect(hiddenSlot).toHaveAttribute("inert");
    expect(screen.getByText("Other")).toBeInTheDocument();
    const hiddenRenders = onRender.mock.calls.length;
    const hiddenPolls = onPoll.mock.calls.length;
    act(() => {
      runtime.dispatch({ type: "open", project: makeProject("/c") });
      vi.advanceTimersByTime(100);
    });
    expect(onRender).toHaveBeenCalledTimes(hiddenRenders);
    expect(onPoll).toHaveBeenCalledTimes(hiddenPolls);

    rerender(view("one"));
    expect(screen.getByRole("region", { name: "Runtime test screen" })).toBe(node);
    expect(screen.getByRole("button", { name: "Local 1" })).toBeInTheDocument();
    expect(screen.getByText("Project /c")).toBeInTheDocument();
    expect(screen.getByText("Other").closest(".view")).toHaveAttribute("hidden");

    // The shown tab of a hidden screen is hidden too.
    act(() => screenLifecycle.transition("hidden"));
    const screenHiddenPolls = onPoll.mock.calls.length;
    act(() => vi.advanceTimersByTime(100));
    expect(onPoll).toHaveBeenCalledTimes(screenHiddenPolls);
    act(() => screenLifecycle.transition("active"));
    act(() => vi.advanceTimersByTime(50));
    expect(onPoll.mock.calls.length).toBeGreaterThan(screenHiddenPolls);
    vi.useRealTimers();
  });
});
