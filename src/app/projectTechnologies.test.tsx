import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectSettingsPort } from "../features/project-settings";
import { useProjectTechnologies, type ProjectTechnologyTarget } from "./projectTechnologies";

/** Every render goes through StrictMode: development mounts, unmounts and
 * remounts the same instance, which is exactly where a "still alive" guard
 * that is never re-armed drops every answer. */
function strict({ children }: { children: ReactNode }): ReactNode {
  return <StrictMode>{children}</StrictMode>;
}

function createPort(
  readTechnology: ProjectSettingsPort["readTechnology"],
): ProjectSettingsPort {
  return { readTechnology } as unknown as ProjectSettingsPort;
}

const project = (id: string, epoch = "e1"): ProjectTechnologyTarget => ({
  id,
  path: id,
  sessionEpoch: epoch,
});

describe("useProjectTechnologies", () => {
  it("reads each open project once and keeps the answer under StrictMode", async () => {
    const readTechnology = vi.fn(async ({ path }: { path: string }) => ({
      path,
      technology: "rust" as const,
      source: "manifest" as const,
    }));

    const { result } = renderHook(
      () => useProjectTechnologies([project("/a"), project("/b")], createPort(readTechnology)),
      { wrapper: strict },
    );

    await waitFor(() => expect(result.current.technologies.get("/a")).toBe("rust"));
    expect(result.current.technologies.get("/b")).toBe("rust");
    expect(readTechnology).toHaveBeenCalledTimes(2);
    expect(result.current.failed.size).toBe(0);
  });

  it("re-reads a project when its session epoch changes", async () => {
    const readTechnology = vi.fn(async ({ path }: { path: string }) => ({
      path,
      technology: "go" as const,
      source: "manifest" as const,
    }));
    const port = createPort(readTechnology);

    const { rerender } = renderHook(
      ({ targets }: { targets: ProjectTechnologyTarget[] }) =>
        useProjectTechnologies(targets, port),
      { wrapper: strict, initialProps: { targets: [project("/a", "e1")] } },
    );

    await waitFor(() => expect(readTechnology).toHaveBeenCalledTimes(1));
    rerender({ targets: [project("/a", "e2")] });
    await waitFor(() => expect(readTechnology).toHaveBeenCalledTimes(2));
  });

  it("ignores a closed session's late answer after the same project reopens", async () => {
    const pending = new Map<string, (technology: "rust" | "go") => void>();
    const readTechnology = vi.fn(({ path, sessionEpoch }: { path: string; sessionEpoch: string }) =>
      new Promise<{ path: string; technology: "rust" | "go"; source: "manifest" }>((resolve) => {
        pending.set(sessionEpoch, (technology) => resolve({ path, technology, source: "manifest" }));
      }),
    );
    const port = createPort(readTechnology);
    const { result, rerender } = renderHook(
      ({ targets }: { targets: ProjectTechnologyTarget[] }) => useProjectTechnologies(targets, port),
      { wrapper: strict, initialProps: { targets: [project("/a", "old")] } },
    );

    rerender({ targets: [] });
    rerender({ targets: [project("/a", "new")] });
    expect(result.current.technologies.has("/a")).toBe(false);
    pending.get("new")?.("go");
    await waitFor(() => expect(result.current.technologies.get("/a")).toBe("go"));

    await act(async () => { pending.get("old")?.("rust"); });
    expect(result.current.technologies.get("/a")).toBe("go");
    expect(result.current.failed.has("/a")).toBe(false);
  });

  it("falls back to null and records the failure when the read fails", async () => {
    const readTechnology = vi.fn(async () => {
      throw new Error("boom");
    });

    const { result } = renderHook(
      () => useProjectTechnologies([project("/a")], createPort(readTechnology)),
      { wrapper: strict },
    );

    await waitFor(() => expect(result.current.failed.has("/a")).toBe(true));
    expect(result.current.technologies.get("/a")).toBeNull();
  });
});
